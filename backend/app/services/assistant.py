from __future__ import annotations

from uuid import uuid4

import structlog

from app.db.supabase import SupabaseRepository
from app.models.schemas import AskRequest, AskResponse, Authority, GroundedAnswer, Language
from app.services.authority import AuthorityCatalog
from app.services.llm import GroundedGenerationService
from app.services.query_understanding import QueryUnderstandingService
from app.services.retrieval import RetrievalService
from app.services.store import InMemoryStore


logger = structlog.get_logger(__name__)


class AssistantService:
    def __init__(
        self,
        authorities: AuthorityCatalog,
        understanding: QueryUnderstandingService,
        retrieval: RetrievalService,
        generation: GroundedGenerationService,
        repository: SupabaseRepository,
        store: InMemoryStore,
    ) -> None:
        self.authorities = authorities
        self.understanding = understanding
        self.retrieval = retrieval
        self.generation = generation
        self.repository = repository
        self.store = store

    async def ask(self, request: AskRequest) -> AskResponse:
        detected = self.understanding.detect(request.query, request.context)
        jurisdiction = self.authorities.get(detected.authority_id)
        session_id = await self._ensure_session(request.session_id, request.language.value, request.query)

        if self.understanding.needs_jurisdiction_clarification(detected):
            answer = self._clarification_answer(request.language, jurisdiction)
            response = AskResponse(
                query_id=str(uuid4()),
                session_id=session_id,
                language=request.language,
                needs_clarification=True,
                clarification_question=self.understanding.clarification_question(request.language.value),
                jurisdiction=jurisdiction,
                detected=detected,
                answer=answer,
                sources=[],
                suggested_questions=self._suggested_questions(request.language, jurisdiction),
            )
            await self._save_query(request, response)
            return response

        retrieval_filters = {
            "authority_id": detected.authority_id,
            "authority_name": detected.authority_name,
            "city": detected.city,
            "state": detected.state,
            "document_type": None,
            "project_type": detected.project_type,
            "construction_category": detected.construction_category,
        }
        logger.info("ask_retrieval_before", query=request.query, filters=retrieval_filters)
        sources = await self.retrieval.retrieve_for_ask(request.query, detected)
        actual_sources = [source for source in sources if not source.metadata.get("seed")]
        logger.info(
            "ask_retrieval_after",
            retrieved_chunks_count=len(actual_sources),
            returned_source_count=len(sources),
            document_ids=sorted({source.document_id for source in actual_sources}),
            authority_metadata=[
                {
                    "document_id": source.document_id,
                    "authority_name": source.authority_name,
                    "authority_slug": source.metadata.get("authority_slug"),
                    "city": source.city,
                    "state": source.state,
                    "document_type": source.metadata.get("document_type"),
                    "source_kind": source.metadata.get("source_kind") or source.metadata.get("ingestion_source"),
                }
                for source in actual_sources
            ],
            similarity_scores=[source.score for source in actual_sources],
            zero_reason=next(
                (
                    source.metadata.get("retrieval_zero_reason")
                    for source in sources
                    if source.metadata.get("retrieval_zero_reason")
                ),
                None,
            ),
            filters=retrieval_filters,
        )
        logger.info(
            "ask_grounding_before",
            query=request.query,
            grounded_source_count=len(actual_sources),
            source_documents=[
                {
                    "document_id": source.document_id,
                    "document_title": source.document_title,
                    "score": source.score,
                    "authority_slug": source.metadata.get("authority_slug"),
                }
                for source in actual_sources
            ],
        )
        answer = await self.generation.generate(request.query, request.language.value, detected, jurisdiction, sources)
        public_sources = self.retrieval.public_sources(sources)
        response = AskResponse(
            query_id=str(uuid4()),
            session_id=session_id,
            language=request.language,
            needs_clarification=False,
            clarification_question=None,
            jurisdiction=jurisdiction,
            detected=detected,
            answer=answer,
            sources=public_sources,
            suggested_questions=self._suggested_questions(request.language, jurisdiction),
        )
        await self._save_query(request, response)
        return response

    async def _ensure_session(self, session_id: str | None, language: str, query: str) -> str:
        title = query[:80]
        db_session_id = await self.repository.ensure_session(session_id, language, title)
        return db_session_id or session_id or str(uuid4())

    async def _save_query(self, request: AskRequest, response: AskResponse) -> None:
        payload = {
            "id": response.query_id,
            "session_id": response.session_id,
            "query": request.query,
            "language": request.language.value,
            "detected": response.detected.model_dump(mode="json"),
            "answer": response.answer.model_dump(mode="json"),
            "sources": [source.model_dump(mode="json") for source in response.sources],
            "confidence": self._confidence_value(response.answer.confidence_indicator.value),
        }
        if self.repository.enabled:
            await self.repository.save_query(payload)
        else:
            self.store.save_query(payload)

    @staticmethod
    def _confidence_value(indicator: str) -> float:
        return {"High": 0.85, "Medium": 0.55, "Low": 0.2}.get(indicator, 0.2)

    @staticmethod
    def _clarification_answer(language: Language, jurisdiction: Authority | None) -> GroundedAnswer:
        if language == Language.hi:
            return GroundedAnswer(
                quick_summary="स्थान/प्राधिकरण स्पष्ट नहीं है, इसलिए अधिकार-विशिष्ट उत्तर देना सुरक्षित नहीं होगा।",
                is_allowed="Unknown",
                applicable_authority=jurisdiction.name if jurisdiction else "स्पष्ट नहीं",
                required_approvals=[],
                required_documents=[],
                relevant_restrictions=[],
                far_height_setback_notes=[],
                inspection_requirements=[],
                risks_common_mistakes=["अधिकार-क्षेत्र जाने बिना सामान्य सलाह देना गलत हो सकता है।"],
                suggested_next_steps=["शहर, राज्य या विकास प्राधिकरण बताएं।"],
                official_authority_links=[],
                confidence_indicator="Low",
                assumptions_uncertainty_notes=["उत्तर रोक दिया गया क्योंकि क्षेत्राधिकार स्पष्ट नहीं है।"],
            )
        return GroundedAnswer(
            quick_summary="The location/authority is missing, so a jurisdiction-specific compliance answer would be unsafe.",
            is_allowed="Unknown",
            applicable_authority=jurisdiction.name if jurisdiction else "Not identified",
            required_approvals=[],
            required_documents=[],
            relevant_restrictions=[],
            far_height_setback_notes=[],
            inspection_requirements=[],
            risks_common_mistakes=["Generic building advice can be wrong when the jurisdiction is unknown."],
            suggested_next_steps=["Share the city, state, or development authority for the property."],
            official_authority_links=[],
            confidence_indicator="Low",
            assumptions_uncertainty_notes=["The answer is withheld until the jurisdiction is identified."],
        )

    @staticmethod
    def _suggested_questions(language: Language, jurisdiction: Authority | None) -> list[str]:
        city = jurisdiction.city if jurisdiction else "my city"
        if language == Language.hi:
            city_hi = jurisdiction.city if jurisdiction else "मेरे शहर"
            return [
                f"{city_hi} में भवन योजना स्वीकृति के लिए कौन से दस्तावेज चाहिए?",
                f"{city_hi} में अतिरिक्त मंजिल जोड़ने से पहले क्या जांच करनी होगी?",
                "मेरे प्लॉट के लिए अनुमोदन चेकलिस्ट बनाएं।",
            ]
        return [
            f"What documents are required for building plan approval in {city}?",
            f"What should I verify before adding another floor in {city}?",
            "Generate a permit checklist for my plot details.",
        ]
