from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


class InMemoryStore:
    """Development fallback used when Supabase is not configured."""

    def __init__(self) -> None:
        self.documents: dict[str, dict[str, Any]] = {}
        self.chunks: list[dict[str, Any]] = []
        self.queries: list[dict[str, Any]] = []
        self.favorites: list[dict[str, Any]] = []
        self.feedback: list[dict[str, Any]] = []

    def add_document(self, payload: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        document = {
            "id": str(uuid4()),
            "status": "uploaded",
            "created_at": now,
            "updated_at": now,
            "chunk_count": 0,
            **payload,
        }
        self.documents[document["id"]] = document
        return document

    def update_document(self, document_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        existing = self.documents[document_id]
        existing.update(payload)
        existing["updated_at"] = datetime.now(timezone.utc).isoformat()
        return existing

    def list_documents(self) -> list[dict[str, Any]]:
        return [doc for doc in self.documents.values() if doc.get("status") != "deleted"]

    def add_chunks(self, chunks: list[dict[str, Any]]) -> None:
        self.chunks.extend(chunks)
        if chunks:
            document_id = chunks[0]["document_id"]
            if document_id in self.documents:
                self.documents[document_id]["chunk_count"] = len(
                    [chunk for chunk in self.chunks if chunk["document_id"] == document_id]
                )

    def delete_document(self, document_id: str) -> None:
        if document_id in self.documents:
            self.documents[document_id]["status"] = "deleted"
        self.chunks = [chunk for chunk in self.chunks if chunk["document_id"] != document_id]

    def save_query(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {"id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **payload}
        self.queries.insert(0, record)
        return record

    def add_favorite(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {"id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **payload}
        self.favorites.insert(0, record)
        return record

    def delete_favorite(self, favorite_id: str) -> None:
        self.favorites = [favorite for favorite in self.favorites if favorite["id"] != favorite_id]

    def add_feedback(self, payload: dict[str, Any]) -> dict[str, Any]:
        record = {"id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **payload}
        self.feedback.insert(0, record)
        return record
