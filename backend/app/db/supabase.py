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
            return []
        db_authority_id = await self.resolve_authority_db_id(authority_id)

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
