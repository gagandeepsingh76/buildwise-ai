from __future__ import annotations

import asyncio
from importlib import import_module
from typing import Any

import structlog

from app.core.config import Settings


logger = structlog.get_logger(__name__)


class SupabaseRepository:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Any | None = None
        self.last_match_debug: dict[str, Any] = {}
        if settings.supabase_enabled:
            supabase_module = import_module("supabase")
            create_client = getattr(supabase_module, "create_client", None)
            if create_client is None:
                raise RuntimeError(
                    "Supabase is configured but the Python package is unavailable. "
                    "Install backend/requirements.txt in this environment."
                )
            self.client = create_client(settings.supabase_url, settings.supabase_service_role_key)  # type: ignore[arg-type]

    @property
    def enabled(self) -> bool:
        return self.client is not None

    async def health(self) -> dict[str, Any]:
        if not self.client:
            return {"enabled": False, "status": "not_configured"}
        try:
            await asyncio.to_thread(lambda: self.client.table("authorities").select("id").limit(1).execute())
            return {"enabled": True, "status": "ok"}
        except Exception as exc:  # pragma: no cover - external dependency
            logger.warning("supabase_health_failed", error=str(exc))
            return {"enabled": True, "status": "error", "error": str(exc)}

    async def list_documents(
        self,
        authority_id: str | None = None,
        city: str | None = None,
        state: str | None = None,
        document_type: str | None = None,
    ) -> list[dict[str, Any]]:
        if not self.client:
            return []

        def run():
            query = self.client.table("documents").select("*, authorities(slug,name,short_name)")
            if city:
                query = query.ilike("city", city)
            if state:
                query = query.ilike("state", state)
            if document_type:
                query = query.ilike("document_type", document_type)
            if authority_id:
                authority = (
                    self.client.table("authorities")
                    .select("id")
                    .eq("slug", authority_id)
                    .maybe_single()
                    .execute()
                )
                db_authority_id = authority.data["id"] if authority.data else authority_id
                query = query.eq("authority_id", db_authority_id)
            return query.neq("status", "deleted").order("created_at", desc=True).execute().data or []

        return await asyncio.to_thread(run)

    async def get_document(self, document_id: str) -> dict[str, Any] | None:
        if not self.client:
            return None

        def run():
            response = (
                self.client.table("documents")
                .select("*, authorities(slug,name,short_name)")
                .eq("id", document_id)
                .maybe_single()
                .execute()
            )
            return response.data

        return await asyncio.to_thread(run)

    async def create_document(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("Supabase is not configured.")

        def run():
            response = self.client.table("documents").insert(payload).execute()
            return response.data[0]

        return await asyncio.to_thread(run)

    async def update_document(self, document_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.client:
            raise RuntimeError("Supabase is not configured.")

        def run():
            response = self.client.table("documents").update(payload).eq("id", document_id).execute()
            return response.data[0]

        return await asyncio.to_thread(run)

    async def list_document_chunks(self, document_id: str) -> list[dict[str, Any]]:
        if not self.client:
            return []

        def run():
            return (
                self.client.table("document_chunks")
                .select("id,chunk_index,content,token_count,page_start,page_end,created_at,metadata")
                .eq("document_id", document_id)
                .order("chunk_index")
                .execute()
                .data
                or []
            )

        return await asyncio.to_thread(run)

    async def delete_document_chunks(self, document_id: str) -> int:
        if not self.client:
            return 0

        def run():
            existing = (
                self.client.table("document_chunks")
                .select("id")
                .eq("document_id", document_id)
                .execute()
                .data
                or []
            )
            self.client.table("document_chunks").delete().eq("document_id", document_id).execute()
            return len(existing)

        return await asyncio.to_thread(run)

    async def insert_chunks(self, chunks: list[dict[str, Any]]) -> None:
        if not self.client or not chunks:
            return

        def run():
            for index in range(0, len(chunks), 100):
                self.client.table("document_chunks").insert(chunks[index : index + 100]).execute()

        await asyncio.to_thread(run)

    async def delete_document(self, document_id: str) -> None:
        if not self.client:
            return
        await asyncio.to_thread(
            lambda: self.client.table("documents").update({"status": "deleted"}).eq("id", document_id).execute()
        )

    async def hard_delete_document(self, document_id: str) -> int:
        if not self.client:
            return 0

        def run():
            existing = (
                self.client.table("document_chunks")
                .select("id")
                .eq("document_id", document_id)
                .execute()
                .data
                or []
            )
            self.client.table("document_chunks").delete().eq("document_id", document_id).execute()
            self.client.table("documents").delete().eq("id", document_id).execute()
            return len(existing)

        return await asyncio.to_thread(run)

    async def resolve_authority_db_id(self, authority_slug: str | None) -> str | None:
        if not self.client or not authority_slug:
            return None

        def run():
            response = (
                self.client.table("authorities")
                .select("id")
                .eq("slug", authority_slug)
                .maybe_single()
                .execute()
            )
            return response.data["id"] if response.data else None

        return await asyncio.to_thread(run)

    async def match_chunks(
        self,
        embedding: list[float],
        top_k: int,
        authority_id: str | None = None,
        city: str | None = None,
        state: str | None = None,
        document_type: str | None = None,
        min_similarity: float = 0.0,
    ) -> list[dict[str, Any]]:
        if not self.client:
            self.last_match_debug = {
                "backend": "supabase",
                "enabled": False,
                "zero_reason": "Supabase is not configured, so the vector RPC was not executed.",
            }
            return []
        db_authority_id = await self.resolve_authority_db_id(authority_id)
        authority_filter_mode = "none"
        if authority_id and db_authority_id:
            authority_filter_mode = "authority_db_id"
        elif authority_id:
            authority_filter_mode = "metadata_authority_slug"
        filters = {
            "authority_slug": authority_id,
            "authority_db_id": db_authority_id,
            "authority_filter_mode": authority_filter_mode,
            "city": city,
            "state": state,
            "document_type": document_type,
            "top_k": top_k,
            "min_similarity": min_similarity,
            "embedding_dimensions": len(embedding),
        }
        self.last_match_debug = {
            "backend": "supabase",
            "enabled": True,
            "filters": filters,
            "zero_reason": None,
        }
        logger.info("supabase_vector_search_before", **filters)

        rows = await self._match_chunks_rpc(
            embedding=embedding,
            top_k=top_k,
            db_authority_id=db_authority_id,
            city=city,
            state=state,
            document_type=document_type,
            min_similarity=min_similarity,
        )
        rows = self._filter_rows_by_metadata_authority(rows, authority_id, db_authority_id)
        row_summaries = self._summarize_match_rows(rows)
        self.last_match_debug.update(
            {
                "retrieved_chunks_count": len(rows),
                "document_ids": sorted({row["document_id"] for row in row_summaries}),
                "similarity_scores": [row["similarity"] for row in row_summaries],
                "authority_metadata": [
                    {
                        "document_id": row["document_id"],
                        "authority_id": row["authority_id"],
                        "authority_slug": row["authority_slug"],
                        "authority_name": row["authority_name"],
                        "city": row["city"],
                        "state": row["state"],
                        "document_type": row["document_type"],
                    }
                    for row in row_summaries
                ],
            }
        )
        logger.info(
            "supabase_vector_search_after",
            retrieved_chunks_count=len(rows),
            document_ids=self.last_match_debug["document_ids"],
            authority_metadata=self.last_match_debug["authority_metadata"],
            similarity_scores=self.last_match_debug["similarity_scores"],
            **filters,
        )
        if rows:
            return rows

        empty_debug = await self._explain_empty_match(
            embedding=embedding,
            top_k=top_k,
            db_authority_id=db_authority_id,
            authority_slug=authority_id,
            city=city,
            state=state,
            document_type=document_type,
            min_similarity=min_similarity,
        )
        self.last_match_debug.update(empty_debug)
        logger.warning("supabase_vector_search_empty", **empty_debug, **filters)
        return []

    async def _match_chunks_rpc(
        self,
        embedding: list[float],
        top_k: int,
        db_authority_id: str | None,
        city: str | None,
        state: str | None,
        document_type: str | None,
        min_similarity: float,
    ) -> list[dict[str, Any]]:
        if not self.client:
            return []

        def run():
            response = self.client.rpc(
                "match_document_chunks",
                {
                    "query_embedding": embedding,
                    "match_count": top_k,
                    "filter_authority_id": db_authority_id,
                    "filter_city": city,
                    "filter_state": state,
                    "filter_document_type": document_type,
                    "min_similarity": min_similarity,
                },
            ).execute()
            return response.data or []

        return await asyncio.to_thread(run)

    async def list_indexed_chunk_candidates(
        self,
        authority_id: str | None = None,
        city: str | None = None,
        state: str | None = None,
        document_type: str | None = None,
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        if not self.client:
            return []
        db_authority_id = await self.resolve_authority_db_id(authority_id)
        metadata_authority_slug = authority_id if authority_id and not db_authority_id else None

        def run():
            documents_query = (
                self.client.table("documents")
                .select("id,title,document_type,city,state,official_url,metadata,authority_id,authorities(slug,name,short_name)")
                .eq("status", "indexed")
            )
            if db_authority_id:
                documents_query = documents_query.eq("authority_id", db_authority_id)
            if city:
                documents_query = documents_query.ilike("city", city)
            if state:
                documents_query = documents_query.ilike("state", state)
            if document_type:
                documents_query = documents_query.ilike("document_type", document_type)

            documents = documents_query.limit(100).execute().data or []
            if metadata_authority_slug:
                documents = [
                    document
                    for document in documents
                    if self._document_matches_metadata_authority(document, metadata_authority_slug)
                ]
            documents_by_id = {str(document["id"]): document for document in documents}
            if not documents_by_id:
                return []

            rows: list[dict[str, Any]] = []
            document_ids = list(documents_by_id)
            for index in range(0, len(document_ids), 100):
                batch_ids = document_ids[index : index + 100]
                remaining = limit - len(rows)
                if remaining <= 0:
                    break
                chunk_rows = (
                    self.client.table("document_chunks")
                    .select("id,document_id,authority_id,chunk_index,content,page_start,page_end,metadata")
                    .in_("document_id", batch_ids)
                    .order("chunk_index")
                    .limit(remaining)
                    .execute()
                    .data
                    or []
                )
                for chunk in chunk_rows:
                    document = documents_by_id.get(str(chunk.get("document_id")))
                    if not document:
                        continue
                    relation = document.get("authorities") or {}
                    metadata = {
                        **(chunk.get("metadata") or {}),
                        **(document.get("metadata") or {}),
                    }
                    rows.append(
                        {
                            "chunk_id": chunk.get("id"),
                            "document_id": chunk.get("document_id"),
                            "authority_id": chunk.get("authority_id") or document.get("authority_id"),
                            "content": chunk.get("content") or "",
                            "page_start": chunk.get("page_start"),
                            "page_end": chunk.get("page_end"),
                            "chunk_index": chunk.get("chunk_index"),
                            "document_title": document.get("title"),
                            "document_type": document.get("document_type"),
                            "authority_name": relation.get("name") or metadata.get("authority_name"),
                            "city": document.get("city"),
                            "state": document.get("state"),
                            "official_url": document.get("official_url"),
                            "metadata": metadata,
                            "similarity": 0.0,
                        }
                    )
            return rows

        return await asyncio.to_thread(run)

    async def _explain_empty_match(
        self,
        embedding: list[float],
        top_k: int,
        db_authority_id: str | None,
        authority_slug: str | None,
        city: str | None,
        state: str | None,
        document_type: str | None,
        min_similarity: float,
    ) -> dict[str, Any]:
        relaxed_rows = await self._match_chunks_rpc(
            embedding=embedding,
            top_k=max(top_k, 5),
            db_authority_id=db_authority_id,
            city=city,
            state=state,
            document_type=document_type,
            min_similarity=-1.0,
        )
        relaxed_rows = self._filter_rows_by_metadata_authority(relaxed_rows, authority_slug, db_authority_id)
        if relaxed_rows:
            summaries = self._summarize_match_rows(relaxed_rows)
            top_score = summaries[0]["similarity"] if summaries else 0.0
            return {
                "zero_reason": (
                    f"Supabase vector RPC executed and found {len(relaxed_rows)} filtered candidate chunk(s), "
                    f"but the best similarity {top_score} is below RAG_MIN_SIMILARITY {min_similarity}."
                ),
                "relaxed_candidate_count": len(relaxed_rows),
                "relaxed_candidates": summaries,
            }

        candidates = await self.list_indexed_chunk_candidates(
            authority_id=authority_slug,
            city=city,
            state=state,
            document_type=document_type,
            limit=10,
        )
        if candidates:
            return {
                "zero_reason": (
                    "Indexed chunks match the metadata filters, but the vector RPC returned zero candidates even with "
                    "min_similarity=-1. Check for null/invalid embeddings, embedding dimension mismatch, or RPC/index issues."
                ),
                "filtered_candidate_count": len(candidates),
                "filtered_candidates": self._summarize_match_rows(candidates),
            }

        indexed_documents = await self._list_indexed_documents(
            authority_id=authority_slug,
            city=city,
            state=state,
            document_type=document_type,
            limit=10,
        )
        if indexed_documents:
            return {
                "zero_reason": (
                    "Indexed documents match the metadata filters, but no document_chunks rows were found for them."
                ),
                "indexed_document_count": len(indexed_documents),
                "indexed_documents": self._summarize_documents(indexed_documents),
            }

        return {
            "zero_reason": (
                "No indexed Supabase documents match the retrieval filters "
                f"(authority={authority_slug}, city={city}, state={state}, document_type={document_type})."
            ),
            "indexed_document_count": 0,
        }

    async def _list_indexed_documents(
        self,
        authority_id: str | None,
        city: str | None,
        state: str | None,
        document_type: str | None,
        limit: int,
    ) -> list[dict[str, Any]]:
        if not self.client:
            return []
        db_authority_id = await self.resolve_authority_db_id(authority_id)
        metadata_authority_slug = authority_id if authority_id and not db_authority_id else None

        def run():
            query = (
                self.client.table("documents")
                .select("id,title,document_type,city,state,metadata,authority_id,authorities(slug,name,short_name)")
                .eq("status", "indexed")
            )
            if db_authority_id:
                query = query.eq("authority_id", db_authority_id)
            if city:
                query = query.ilike("city", city)
            if state:
                query = query.ilike("state", state)
            if document_type:
                query = query.ilike("document_type", document_type)
            documents = query.limit(limit).execute().data or []
            if metadata_authority_slug:
                documents = [
                    document
                    for document in documents
                    if self._document_matches_metadata_authority(document, metadata_authority_slug)
                ]
            return documents

        return await asyncio.to_thread(run)

    @staticmethod
    def _summarize_match_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        summaries: list[dict[str, Any]] = []
        for row in rows:
            metadata = row.get("metadata") or {}
            summaries.append(
                {
                    "chunk_id": str(row.get("chunk_id") or row.get("id") or ""),
                    "document_id": str(row.get("document_id") or ""),
                    "authority_id": str(row.get("authority_id") or ""),
                    "authority_slug": metadata.get("authority_slug"),
                    "authority_name": row.get("authority_name") or metadata.get("authority_name"),
                    "city": row.get("city"),
                    "state": row.get("state"),
                    "document_type": row.get("document_type") or metadata.get("document_type"),
                    "similarity": round(float(row.get("similarity") or 0), 4),
                }
            )
        return summaries

    @staticmethod
    def _filter_rows_by_metadata_authority(
        rows: list[dict[str, Any]],
        authority_slug: str | None,
        db_authority_id: str | None,
    ) -> list[dict[str, Any]]:
        if not authority_slug or db_authority_id:
            return rows
        return [
            row
            for row in rows
            if (row.get("metadata") or {}).get("authority_slug") == authority_slug
        ]

    @staticmethod
    def _document_matches_metadata_authority(document: dict[str, Any], authority_slug: str) -> bool:
        metadata = document.get("metadata") or {}
        relation = document.get("authorities") or {}
        return relation.get("slug") == authority_slug or metadata.get("authority_slug") == authority_slug

    @staticmethod
    def _summarize_documents(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        summaries: list[dict[str, Any]] = []
        for row in rows:
            metadata = row.get("metadata") or {}
            relation = row.get("authorities") or {}
            summaries.append(
                {
                    "document_id": str(row.get("id") or ""),
                    "title": row.get("title"),
                    "authority_id": str(row.get("authority_id") or ""),
                    "authority_slug": relation.get("slug") or metadata.get("authority_slug"),
                    "authority_name": relation.get("name") or metadata.get("authority_name"),
                    "city": row.get("city"),
                    "state": row.get("state"),
                    "document_type": row.get("document_type"),
                }
            )
        return summaries

    async def upload_file(self, path: str, content: bytes, content_type: str) -> str | None:
        if not self.client:
            return None

        def run():
            bucket = self.client.storage.from_(self.settings.supabase_storage_bucket)
            bucket.upload(path, content, {"content-type": content_type, "upsert": "true"})
            return path

        try:
            return await asyncio.to_thread(run)
        except Exception as exc:  # pragma: no cover - external dependency
            logger.warning("supabase_storage_upload_failed", path=path, error=str(exc))
            return None

    async def download_file(self, path: str) -> bytes | None:
        if not self.client:
            return None

        def run():
            content = self.client.storage.from_(self.settings.supabase_storage_bucket).download(path)
            if isinstance(content, bytes):
                return content
            if hasattr(content, "content"):
                return content.content
            return bytes(content)

        try:
            return await asyncio.to_thread(run)
        except Exception as exc:  # pragma: no cover - external dependency
            logger.warning("supabase_storage_download_failed", path=path, error=str(exc))
            return None

    async def delete_file(self, path: str | None) -> bool:
        if not self.client or not path:
            return False

        def run():
            self.client.storage.from_(self.settings.supabase_storage_bucket).remove([path])
            return True

        try:
            return await asyncio.to_thread(run)
        except Exception as exc:  # pragma: no cover - external dependency
            logger.warning("supabase_storage_delete_failed", path=path, error=str(exc))
            return False

    async def save_query(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.client:
            return None

        def run():
            response = self.client.table("queries").insert(payload).execute()
            return response.data[0] if response.data else None

        return await asyncio.to_thread(run)

    async def ensure_session(self, session_id: str | None, language: str, title: str | None = None) -> str | None:
        if not self.client:
            return session_id
        if session_id:
            return session_id

        def run():
            response = self.client.table("query_sessions").insert({"language": language, "title": title}).execute()
            return response.data[0]["id"] if response.data else None

        return await asyncio.to_thread(run)

    async def history(self, limit: int = 25) -> list[dict[str, Any]]:
        if not self.client:
            return []

        def run():
            return (
                self.client.table("queries")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
                .data
                or []
            )

        return await asyncio.to_thread(run)

    async def add_favorite(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.client:
            return None

        def run():
            response = self.client.table("favorites").insert(payload).execute()
            return response.data[0] if response.data else None

        return await asyncio.to_thread(run)

    async def list_favorites(self, limit: int = 50) -> list[dict[str, Any]]:
        if not self.client:
            return []

        def run():
            return (
                self.client.table("favorites")
                .select("*")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
                .data
                or []
            )

        return await asyncio.to_thread(run)

    async def delete_favorite(self, favorite_id: str) -> None:
        if not self.client:
            return
        await asyncio.to_thread(lambda: self.client.table("favorites").delete().eq("id", favorite_id).execute())

    async def add_feedback(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        if not self.client:
            return None

        def run():
            response = self.client.table("feedback").insert(payload).execute()
            return response.data[0] if response.data else None

        return await asyncio.to_thread(run)
