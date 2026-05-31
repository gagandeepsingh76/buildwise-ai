from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from secrets import compare_digest

from fastapi import Header, HTTPException, status

from app.core.config import Settings, get_settings
from app.db.supabase import SupabaseRepository
from app.services.assistant import AssistantService
from app.services.authority import AuthorityCatalog
from app.services.documents import DocumentService
from app.services.embeddings import EmbeddingService
from app.services.llm import GroundedGenerationService
from app.services.query_understanding import QueryUnderstandingService
from app.services.retrieval import RetrievalService
from app.services.store import InMemoryStore


@dataclass
class Services:
    settings: Settings
    authorities: AuthorityCatalog
    repository: SupabaseRepository
    embeddings: EmbeddingService
    store: InMemoryStore
    retrieval: RetrievalService
    documents: DocumentService
    assistant: AssistantService
    generation: GroundedGenerationService
    understanding: QueryUnderstandingService


@lru_cache
def get_services() -> Services:
    settings = get_settings()
    authorities = AuthorityCatalog()
    repository = SupabaseRepository(settings)
    embeddings = EmbeddingService(settings)
    store = InMemoryStore()
    understanding = QueryUnderstandingService(authorities)
    retrieval = RetrievalService(settings, repository, embeddings, authorities, store)
    generation = GroundedGenerationService(settings)
    documents = DocumentService(settings, repository, embeddings, authorities, store)
    assistant = AssistantService(authorities, understanding, retrieval, generation, repository, store)
    return Services(
        settings=settings,
        authorities=authorities,
        repository=repository,
        embeddings=embeddings,
        store=store,
        retrieval=retrieval,
        documents=documents,
        assistant=assistant,
        generation=generation,
        understanding=understanding,
    )


def require_admin(x_admin_api_key: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if settings.is_production and settings.admin_api_key_is_unsafe:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Admin uploads are disabled until a secure ADMIN_API_KEY is configured.",
        )
    if not x_admin_api_key or not compare_digest(x_admin_api_key, settings.admin_api_key):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="A valid admin API key is required.")
