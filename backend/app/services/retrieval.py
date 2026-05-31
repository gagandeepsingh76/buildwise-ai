from __future__ import annotations

from typing import Any
import re

import structlog

from app.core.config import Settings
from app.db.supabase import SupabaseRepository
from app.models.schemas import DetectionResult, SearchRequest, SourceReference
from app.services.authority import AuthorityCatalog
from app.services.embeddings import EmbeddingService, cosine_similarity
from app.services.store import InMemoryStore
from app.utils.text import excerpt


logger = structlog.get_logger(__name__)


class RetrievalService:
    def __init__(
        self,
        settings: Settings,
        repository: SupabaseRepository,
        embeddings: EmbeddingService,
        authorities: AuthorityCatalog,
        store: InMemoryStore,
    ) -> None:
        self.settings = settings
        self.repository = repository
        self.embeddings = embeddings
        self.authorities = authorities
        self.store = store

    async def retrieve_for_ask(self, query: str, detected: DetectionResult) -> list[SourceReference]:
        return await self.search(
            SearchRequest(
                query=query,
                authority_id=detected.authority_id,
                city=detected.city,
                state=detected.state,
                top_k=self.settings.rag_top_k,
            )
        )

    async def search(self, request: SearchRequest) -> list[SourceReference]:
        query_embedding = await self.embeddings.embed_query(request.query)
        rows = await self.repository.match_chunks(
            embedding=query_embedding,
            top_k=request.top_k,
            authority_id=request.authority_id,
            city=request.city,
            state=request.state,
            document_type=request.document_type,
            min_similarity=self.settings.rag_min_similarity,
        )
        if rows:
            logger.info(
                "retrieval_after_supabase",
                retrieval_method="supabase_vector",
                retrieved_chunks_count=len(rows),
                document_ids=sorted({str(row.get("document_id")) for row in rows}),
                authority_metadata=self._authority_metadata(rows),
                similarity_scores=[round(float(row.get("similarity") or 0), 4) for row in rows],
                filters=self._filters(request),
            )
            return [self._from_db_row(row) for row in rows]

        zero_reason = self.repository.last_match_debug.get("zero_reason")
        lexical_rows = await self._search_supabase_lexical(request)
        if lexical_rows:
            logger.info(
                "retrieval_after_supabase",
                retrieval_method="supabase_lexical_fallback",
                retrieved_chunks_count=len(lexical_rows),
                document_ids=sorted({str(row.get("document_id")) for row in lexical_rows}),
                authority_metadata=self._authority_metadata(lexical_rows),
                similarity_scores=[round(float(row.get("similarity") or 0), 4) for row in lexical_rows],
                vector_zero_reason=zero_reason,
                filters=self._filters(request),
            )
            return [self._from_db_row(row) for row in lexical_rows]

        local_rows = self._search_local(
            query=request.query,
            query_embedding=query_embedding,
            authority_id=request.authority_id,
            city=request.city,
            state=request.state,
            document_type=request.document_type,
            top_k=request.top_k,
        )
        if local_rows:
            logger.info(
                "retrieval_after_local",
                retrieval_method="local_memory",
                retrieved_chunks_count=len(local_rows),
                document_ids=sorted({str(row.get("document_id")) for row in local_rows}),
                authority_metadata=self._authority_metadata(local_rows),
                similarity_scores=[round(float(row.get("score") or 0), 4) for row in local_rows],
                filters=self._filters(request),
            )
            return [self._from_local_row(row) for row in local_rows]

        zero_reason = zero_reason or self._local_zero_reason(request)
        if not self.repository.enabled:
            zero_reason = self._local_zero_reason(request)
        logger.warning(
            "retrieval_zero_uploaded_chunks",
            retrieved_chunks_count=0,
            zero_reason=zero_reason,
            filters=self._filters(request),
        )
        seed_rows = self._seed_rows(request.authority_id, request.city, request.state)
        seed_rows = [self._with_zero_reason(row, zero_reason) for row in seed_rows]
        return [self._from_local_row(row) for row in seed_rows[: max(1, min(2, request.top_k))]]

    async def _search_supabase_lexical(self, request: SearchRequest) -> list[dict[str, Any]]:
        if not self.repository.enabled:
            return []

        logger.info(
            "supabase_lexical_fallback_before",
            filters=self._filters(request),
            min_similarity=self.settings.rag_min_similarity,
        )
        candidates = await self.repository.list_indexed_chunk_candidates(
            authority_id=request.authority_id,
            city=request.city,
            state=request.state,
            document_type=request.document_type,
            limit=max(50, request.top_k * 25),
        )
        scored: list[dict[str, Any]] = []
        for row in candidates:
            metadata = row.get("metadata") or {}
            tags = metadata.get("tags") or []
            searchable = " ".join(
                [
                    row.get("content") or "",
                    row.get("document_title") or "",
                    row.get("document_type") or "",
                    " ".join(tags) if isinstance(tags, list) else str(tags),
                ]
            )
            score = self._lexical_score(request.query, searchable)
            if score >= self.settings.rag_min_similarity:
                scored.append(
                    {
                        **row,
                        "similarity": score,
                        "metadata": {
                            **metadata,
                            "retrieval_method": "supabase_lexical_fallback",
                            "vector_zero_reason": self.repository.last_match_debug.get("zero_reason"),
                        },
                    }
                )

        scored.sort(key=lambda row: row["similarity"], reverse=True)
        selected = scored[: request.top_k]
        logger.info(
            "supabase_lexical_fallback_after",
            candidate_count=len(candidates),
            retrieved_chunks_count=len(selected),
            document_ids=sorted({str(row.get("document_id")) for row in selected}),
            authority_metadata=self._authority_metadata(selected),
            similarity_scores=[round(float(row.get("similarity") or 0), 4) for row in selected],
            filters=self._filters(request),
        )
        return selected

    def _search_local(
        self,
        query: str,
        query_embedding: list[float],
        authority_id: str | None,
        city: str | None,
        state: str | None,
        document_type: str | None,
        top_k: int,
    ) -> list[dict[str, Any]]:
        scored: list[dict[str, Any]] = []
        for chunk in self.store.chunks:
            if authority_id and chunk.get("authority_id") != authority_id:
                continue
            if city and chunk.get("city", "").lower() != city.lower():
                continue
            if state and chunk.get("state", "").lower() != state.lower():
                continue
            if document_type and chunk.get("document_type", "").lower() != document_type.lower():
                continue
            score = max(
                cosine_similarity(query_embedding, chunk.get("embedding", [])),
                self._lexical_score(query, chunk.get("content", "")),
            )
            if score >= self.settings.rag_min_similarity:
                scored.append({**chunk, "score": score})
        scored.sort(key=lambda row: row["score"], reverse=True)
        return scored[:top_k]

    def _seed_rows(self, authority_id: str | None, city: str | None, state: str | None) -> list[dict[str, Any]]:
        rows = []
        for row in self.authorities.to_seed_sources():
            if authority_id and row["authority_id"] != authority_id:
                continue
            if city and row["city"].lower() != city.lower():
                continue
            if state and row["state"].lower() != state.lower():
                continue
            rows.append(row)
        return rows

    @staticmethod
    def _lexical_score(query: str, content: str) -> float:
        query_terms = {term for term in re.findall(r"[\w\-]{4,}", RetrievalService._normalize_search_text(query))}
        content_terms = {term for term in re.findall(r"[\w\-]{4,}", RetrievalService._normalize_search_text(content))}
        if not query_terms or not content_terms:
            return 0.0
        overlap = query_terms.intersection(content_terms)
        return min(1.0, len(overlap) / max(1, len(query_terms)))

    @staticmethod
    def _normalize_search_text(text: str) -> str:
        return (
            text.lower()
            .replace("roof-top", "roof top")
            .replace("rooftop", "roof top")
            .replace("terrace", "roof")
        )

    def _local_zero_reason(self, request: SearchRequest) -> str:
        if not self.store.chunks:
            return "No local uploaded chunks are indexed, and Supabase did not return uploaded chunks."
        candidates = self.store.chunks
        if request.authority_id:
            candidates = [row for row in candidates if row.get("authority_id") == request.authority_id]
            if not candidates:
                return f"No local chunks match authority_id={request.authority_id}."
        if request.city:
            candidates = [row for row in candidates if row.get("city", "").lower() == request.city.lower()]
            if not candidates:
                return f"No local chunks match city={request.city}."
        if request.state:
            candidates = [row for row in candidates if row.get("state", "").lower() == request.state.lower()]
            if not candidates:
                return f"No local chunks match state={request.state}."
        if request.document_type:
            candidates = [
                row for row in candidates if row.get("document_type", "").lower() == request.document_type.lower()
            ]
            if not candidates:
                return f"No local chunks match document_type={request.document_type}."
        return f"Local chunks match the filters, but none reached RAG_MIN_SIMILARITY {self.settings.rag_min_similarity}."

    @staticmethod
    def _filters(request: SearchRequest) -> dict[str, Any]:
        return {
            "authority_id": request.authority_id,
            "city": request.city,
            "state": request.state,
            "document_type": request.document_type,
            "top_k": request.top_k,
        }

    @staticmethod
    def _authority_metadata(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        metadata: list[dict[str, Any]] = []
        for row in rows:
            row_metadata = row.get("metadata") or {}
            metadata.append(
                {
                    "document_id": str(row.get("document_id") or ""),
                    "authority_id": str(row.get("authority_id") or ""),
                    "authority_slug": row_metadata.get("authority_slug"),
                    "authority_name": row.get("authority_name") or row_metadata.get("authority_name"),
                    "city": row.get("city"),
                    "state": row.get("state"),
                    "document_type": row.get("document_type") or row_metadata.get("document_type"),
                    "source_kind": row_metadata.get("source_kind") or row_metadata.get("ingestion_source"),
                }
            )
        return metadata

    @staticmethod
    def _with_zero_reason(row: dict[str, Any], zero_reason: str) -> dict[str, Any]:
        return {
            **row,
            "metadata": {
                **(row.get("metadata") or {}),
                "retrieval_zero_reason": zero_reason,
            },
        }

    @staticmethod
    def _from_db_row(row: dict[str, Any]) -> SourceReference:
        return SourceReference(
            chunk_id=str(row.get("chunk_id") or ""),
            document_id=str(row["document_id"]),
            document_title=row.get("document_title") or "Untitled document",
            authority_name=row.get("authority_name") or "Unknown authority",
            city=row.get("city") or "",
            state=row.get("state") or "",
            page_start=row.get("page_start"),
            page_end=row.get("page_end"),
            official_url=row.get("official_url"),
            score=round(float(row.get("similarity") or 0), 4),
            excerpt=excerpt(row.get("content") or ""),
            metadata=row.get("metadata") or {},
        )

    @staticmethod
    def _from_local_row(row: dict[str, Any]) -> SourceReference:
        return SourceReference(
            chunk_id=str(row.get("chunk_id") or ""),
            document_id=str(row.get("document_id") or ""),
            document_title=row.get("document_title") or row.get("title") or "Authority source",
            authority_name=row.get("authority_name") or "",
            city=row.get("city") or "",
            state=row.get("state") or "",
            page_start=row.get("page_start"),
            page_end=row.get("page_end"),
            official_url=row.get("official_url"),
            score=round(float(row.get("score") or 0), 4),
            excerpt=excerpt(row.get("content") or row.get("excerpt") or ""),
            metadata=row.get("metadata") or {},
        )
