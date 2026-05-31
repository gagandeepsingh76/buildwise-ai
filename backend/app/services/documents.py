from __future__ import annotations

import hashlib
from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import UploadFile
import structlog

from app.core.config import Settings
from app.db.supabase import SupabaseRepository
from app.models.schemas import (
    AdminDeleteResponse,
    AdminDocumentDetail,
    AdminReindexResponse,
    DocumentChunkRecord,
    DocumentMetadata,
    DocumentRecord,
    IngestResponse,
)
from app.services.authority import AuthorityCatalog
from app.services.embeddings import EmbeddingService
from app.services.store import InMemoryStore
from app.utils.pdf import extract_pdf_pages
from app.utils.text import chunk_pages


logger = structlog.get_logger(__name__)


class DocumentService:
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

    async def list_documents(
        self,
        authority_id: str | None = None,
        city: str | None = None,
        state: str | None = None,
        document_type: str | None = None,
    ) -> list[DocumentRecord]:
        if self.repository.enabled:
            records = await self.repository.list_documents(authority_id, city, state, document_type)
            return [self._document_record_from_db(record) for record in records]
        return [self._document_record_from_local(record) for record in self.store.list_documents()]

    async def get_document(self, document_id: str) -> DocumentRecord | None:
        if self.repository.enabled:
            record = await self.repository.get_document(document_id)
            return self._document_record_from_db(record) if record else None
        record = self.store.documents.get(document_id)
        return self._document_record_from_local(record) if record else None

    async def list_admin_documents(
        self,
        search: str | None = None,
        authority_id: str | None = None,
        document_type: str | None = None,
        status: str | None = None,
    ) -> list[DocumentRecord]:
        documents = await self.list_documents(authority_id=authority_id, document_type=document_type)
        if status:
            documents = [document for document in documents if document.status.lower() == status.lower()]
        if search:
            needle = search.strip().lower()
            documents = [
                document
                for document in documents
                if needle in document.title.lower()
                or needle in document.authority_id.lower()
                or needle in document.city.lower()
                or needle in " ".join(document.tags).lower()
            ]
        return documents

    async def get_admin_document_detail(self, document_id: str) -> AdminDocumentDetail | None:
        document = await self.get_document(document_id)
        if not document:
            return None
        chunks = await self.list_document_chunks(document_id)
        has_file = bool(document.storage_path)
        if not self.repository.enabled:
            has_file = document_id in self.store.document_files
        return AdminDocumentDetail(
            document=document,
            chunks=chunks,
            preview_available=has_file,
            download_available=has_file,
        )

    async def list_document_chunks(self, document_id: str) -> list[DocumentChunkRecord]:
        if self.repository.enabled:
            rows = await self.repository.list_document_chunks(document_id)
        else:
            rows = [chunk for chunk in self.store.chunks if chunk["document_id"] == document_id]
            rows.sort(key=lambda chunk: chunk.get("chunk_index", 0))
        return [self._chunk_record(row) for row in rows]

    async def delete_document(self, document_id: str) -> None:
        if self.repository.enabled:
            await self.repository.delete_document(document_id)
        else:
            self.store.delete_document(document_id)

    async def admin_delete_document(self, document_id: str) -> AdminDeleteResponse:
        document = await self.get_document(document_id)
        if not document:
            raise ValueError("Document not found.")
        chunks_before = await self.list_document_chunks(document_id)
        file_deleted = False
        if self.repository.enabled:
            file_deleted = await self.repository.delete_file(document.storage_path)
            chunks_deleted = await self.repository.hard_delete_document(document_id)
        else:
            file_deleted = document_id in self.store.document_files
            chunks_deleted = self.store.hard_delete_document(document_id)
        logger.info(
            "admin_document_deleted",
            document_id=document_id,
            chunks_deleted=chunks_deleted or len(chunks_before),
            file_deleted=file_deleted,
        )
        return AdminDeleteResponse(
            document_id=document_id,
            chunks_deleted=chunks_deleted or len(chunks_before),
            file_deleted=file_deleted,
            message="Document, indexed chunks, and stored PDF were deleted.",
        )

    async def admin_reindex_document(self, document_id: str) -> AdminReindexResponse:
        document = await self.get_document(document_id)
        if not document:
            raise ValueError("Document not found.")
        content = await self.get_document_file(document_id)
        if not content:
            raise ValueError("The original PDF file is not available for reindexing.")
        metadata = self._metadata_from_record(document)
        chunk_payloads = self._build_chunk_payloads(document_id, content, metadata)
        if self.repository.enabled:
            db_authority_id = await self.repository.resolve_authority_db_id(metadata.authority_id)
            db_chunks = [
                {
                    "document_id": item["document_id"],
                    "authority_id": db_authority_id,
                    "chunk_index": item["chunk_index"],
                    "content": item["content"],
                    "token_count": item["token_count"],
                    "page_start": item["page_start"],
                    "page_end": item["page_end"],
                    "embedding": item["embedding"],
                    "metadata": item["metadata"],
                }
                for item in chunk_payloads
            ]
            await self.repository.update_document(document_id, {"status": "processing"})
            await self.repository.delete_document_chunks(document_id)
            await self.repository.insert_chunks(db_chunks)
            updated = await self.repository.update_document(
                document_id,
                {
                    "status": "indexed",
                    "indexed_at": datetime.now(timezone.utc).isoformat(),
                    "chunk_count": len(chunk_payloads),
                },
            )
            record = self._document_record_from_db(updated, chunk_count=len(chunk_payloads), authority_slug=metadata.authority_id)
        else:
            self.store.replace_chunks(document_id, chunk_payloads)
            updated = self.store.update_document(
                document_id,
                {"status": "indexed", "indexed_at": datetime.now(timezone.utc).isoformat(), "chunk_count": len(chunk_payloads)},
            )
            record = self._document_record_from_local(updated)
        logger.info("admin_document_reindexed", document_id=document_id, chunks_indexed=len(chunk_payloads))
        return AdminReindexResponse(
            document=record,
            chunks_indexed=len(chunk_payloads),
            message="Document reindexed successfully.",
        )

    async def get_document_file(self, document_id: str) -> bytes | None:
        document = await self.get_document(document_id)
        if not document:
            return None
        if self.repository.enabled:
            if not document.storage_path:
                return None
            return await self.repository.download_file(document.storage_path)
        return self.store.document_files.get(document_id)

    async def ingest_pdf(self, file: UploadFile, metadata: DocumentMetadata) -> IngestResponse:
        content = await file.read()
        logger.info(
            "document_ingest_started",
            file_name=file.filename,
            file_size=len(content),
            authority_id=metadata.authority_id,
            document_type=metadata.document_type,
            city=metadata.city,
            state=metadata.state,
        )
        if len(content) > self.settings.max_upload_bytes:
            raise ValueError(f"File exceeds {self.settings.max_upload_mb} MB upload limit.")
        if file.content_type and "pdf" not in file.content_type.lower():
            raise ValueError("Only PDF uploads are supported.")

        checksum = hashlib.sha256(content).hexdigest()
        authority = self.authorities.get(metadata.authority_id)
        storage_path = f"{metadata.authority_id}/{checksum[:16]}-{file.filename or 'document.pdf'}"
        uploaded_path = await self.repository.upload_file(storage_path, content, file.content_type or "application/pdf")

        db_authority_id = await self.repository.resolve_authority_db_id(metadata.authority_id)
        document_payload = {
            "authority_id": db_authority_id if self.repository.enabled else metadata.authority_id,
            "title": metadata.title,
            "document_type": metadata.document_type,
            "city": metadata.city,
            "state": metadata.state,
            "country": metadata.country,
            "issuing_department": metadata.issuing_department,
            "effective_date": metadata.effective_date.isoformat() if metadata.effective_date else None,
            "official_url": metadata.official_url,
            "storage_path": uploaded_path,
            "file_name": file.filename,
            "mime_type": file.content_type or "application/pdf",
            "file_size": len(content),
            "checksum": checksum,
            "status": "processing",
            "tags": metadata.tags,
            "metadata": {
                "authority_slug": metadata.authority_id,
                "authority_name": authority.name if authority else metadata.authority_id,
                "ingestion_source": "admin_upload",
                "source_kind": "uploaded_authority_document",
            },
        }

        if self.repository.enabled:
            document = await self.repository.create_document(document_payload)
            document_id = document["id"]
            chunk_authority_id = db_authority_id
        else:
            document = self.store.add_document(document_payload)
            document_id = document["id"]
            chunk_authority_id = metadata.authority_id
            self.store.add_document_file(document_id, content, file.content_type or "application/pdf")

        chunk_payloads = self._build_chunk_payloads(document_id, content, metadata, chunk_authority_id=chunk_authority_id)

        if self.repository.enabled:
            db_chunks = [
                {
                    "document_id": item["document_id"],
                    "authority_id": item["authority_id"],
                    "chunk_index": item["chunk_index"],
                    "content": item["content"],
                    "token_count": item["token_count"],
                    "page_start": item["page_start"],
                    "page_end": item["page_end"],
                    "embedding": item["embedding"],
                    "metadata": item["metadata"],
                }
                for item in chunk_payloads
            ]
            await self.repository.insert_chunks(db_chunks)
            document = await self.repository.update_document(
                document_id,
                {"status": "indexed", "indexed_at": datetime.now(timezone.utc).isoformat(), "chunk_count": len(chunk_payloads)},
            )
            record = self._document_record_from_db(document, chunk_count=len(chunk_payloads), authority_slug=metadata.authority_id)
        else:
            self.store.add_chunks(chunk_payloads)
            document = self.store.update_document(
                document_id,
                {"status": "indexed", "indexed_at": datetime.now(timezone.utc).isoformat(), "chunk_count": len(chunk_payloads)},
            )
            record = self._document_record_from_local(document)

        logger.info(
            "document_ingest_completed",
            document_id=document_id,
            chunks_indexed=len(chunk_payloads),
            authority_id=metadata.authority_id,
            document_type=metadata.document_type,
        )
        return IngestResponse(
            document=record,
            chunks_indexed=len(chunk_payloads),
            message="Document indexed successfully. Future answers will prioritize this uploaded source.",
        )

    def _build_chunk_payloads(
        self,
        document_id: str,
        content: bytes,
        metadata: DocumentMetadata,
        chunk_authority_id: str | None = None,
    ) -> list[dict[str, Any]]:
        pages = extract_pdf_pages(content)
        text_chunks = chunk_pages(pages)
        if not text_chunks:
            raise ValueError("PDF text extraction produced no indexable chunks.")
        authority = self.authorities.get(metadata.authority_id)
        embeddings = self.embeddings.embed_texts([chunk.content for chunk in text_chunks])
        chunk_payloads: list[dict[str, Any]] = []
        for index, (chunk, embedding) in enumerate(zip(text_chunks, embeddings)):
            chunk_payloads.append(
                {
                    "id": str(uuid4()),
                    "chunk_id": str(uuid4()),
                    "document_id": document_id,
                    "authority_id": chunk_authority_id or metadata.authority_id,
                    "chunk_index": index,
                    "content": chunk.content,
                    "token_count": chunk.token_count,
                    "page_start": chunk.page_start,
                    "page_end": chunk.page_end,
                    "embedding": embedding,
                    "metadata": {
                        "authority_slug": metadata.authority_id,
                        "document_type": metadata.document_type,
                        "ingestion_source": "admin_upload",
                        "source_kind": "uploaded_authority_document",
                        "tags": metadata.tags,
                    },
                    "document_title": metadata.title,
                    "document_type": metadata.document_type,
                    "authority_name": authority.name if authority else metadata.authority_id,
                    "city": metadata.city,
                    "state": metadata.state,
                    "official_url": metadata.official_url,
                    "score": 1.0,
                }
            )
        return chunk_payloads

    @staticmethod
    def _metadata_from_record(document: DocumentRecord) -> DocumentMetadata:
        effective_date: date | None = None
        if isinstance(document.effective_date, date):
            effective_date = document.effective_date
        elif document.effective_date:
            effective_date = date.fromisoformat(str(document.effective_date))
        return DocumentMetadata(
            authority_id=document.authority_id,
            title=document.title,
            document_type=document.document_type,
            city=document.city,
            state=document.state,
            country=document.country,
            issuing_department=document.issuing_department,
            effective_date=effective_date,
            official_url=document.official_url,
            tags=document.tags,
        )

    @staticmethod
    def _chunk_record(row: dict[str, Any]) -> DocumentChunkRecord:
        return DocumentChunkRecord(
            id=str(row.get("id") or row.get("chunk_id") or ""),
            chunk_index=int(row.get("chunk_index") or 0),
            content=row.get("content") or "",
            token_count=int(row.get("token_count") or 0),
            page_start=row.get("page_start"),
            page_end=row.get("page_end"),
            created_at=row.get("created_at"),
        )

    @staticmethod
    def _document_record_from_db(
        record: dict[str, Any],
        chunk_count: int = 0,
        authority_slug: str | None = None,
    ) -> DocumentRecord:
        relation = record.get("authorities") or {}
        slug = authority_slug or relation.get("slug") or record.get("metadata", {}).get("authority_slug") or str(record.get("authority_id"))
        return DocumentRecord(
            id=str(record["id"]),
            authority_id=slug,
            title=record["title"],
            document_type=record["document_type"],
            city=record["city"],
            state=record["state"],
            country=record.get("country") or "India",
            issuing_department=record.get("issuing_department"),
            effective_date=record.get("effective_date"),
            official_url=record.get("official_url"),
            tags=record.get("tags") or [],
            status=record.get("status") or "uploaded",
            file_name=record.get("file_name"),
            file_size=record.get("file_size"),
            storage_path=record.get("storage_path"),
            chunk_count=chunk_count or record.get("chunk_count", 0) or 0,
            indexed_at=record.get("indexed_at"),
            created_at=record.get("created_at"),
        )

    @staticmethod
    def _document_record_from_local(record: dict[str, Any]) -> DocumentRecord:
        return DocumentRecord(
            id=str(record["id"]),
            authority_id=str(record.get("authority_id") or record.get("metadata", {}).get("authority_slug") or ""),
            title=record["title"],
            document_type=record["document_type"],
            city=record["city"],
            state=record["state"],
            country=record.get("country") or "India",
            issuing_department=record.get("issuing_department"),
            effective_date=record.get("effective_date"),
            official_url=record.get("official_url"),
            tags=record.get("tags") or [],
            status=record.get("status") or "uploaded",
            file_name=record.get("file_name"),
            file_size=record.get("file_size"),
            storage_path=record.get("storage_path"),
            chunk_count=record.get("chunk_count", 0),
            indexed_at=record.get("indexed_at"),
            created_at=record.get("created_at"),
        )
