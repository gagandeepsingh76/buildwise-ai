from __future__ import annotations

from typing import Any
import re

from app.core.config import Settings
from app.db.supabase import SupabaseRepository
from app.models.schemas import DetectionResult, SearchRequest, SourceReference
from app.services.authority import AuthorityCatalog
from app.services.embeddings import EmbeddingService, cosine_similarity
from app.services.store import InMemoryStore
from app.utils.text import excerpt


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
            return [self._from_db_row(row) for row in rows]

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
            return [self._from_local_row(row) for row in local_rows]

        seed_rows = self._seed_rows(request.authority_id, request.city, request.state)
        return [self._from_local_row(row) for row in seed_rows[: max(1, min(2, request.top_k))]]

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
        query_terms = {term for term in re.findall(r"[\w\-]{4,}", query.lower())}
        content_terms = {term for term in re.findall(r"[\w\-]{4,}", content.lower())}
        if not query_terms or not content_terms:
            return 0.0
        overlap = query_terms.intersection(content_terms)
        return min(1.0, len(overlap) / max(1, len(query_terms)))

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
