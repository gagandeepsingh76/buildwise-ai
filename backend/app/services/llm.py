from __future__ import annotations

import json
import re
from typing import Any

import httpx
import structlog

from app.core.config import Settings
from app.models.schemas import (
    Authority,
    ConfidenceIndicator,
    DetectionResult,
    GroundedAnswer,
    SourceReference,
)
from app.utils.text import excerpt, split_sentences


logger = structlog.get_logger(__name__)


ANSWER_SCHEMA_KEYS = [
    "quick_summary",
    "is_allowed",
    "applicable_authority",
    "required_approvals",
    "required_documents",
    "relevant_restrictions",
    "far_height_setback_notes",
    "inspection_requirements",
    "risks_common_mistakes",
    "suggested_next_steps",
    "official_authority_links",
    "confidence_indicator",
    "assumptions_uncertainty_notes",
]

SECTION_KEYWORDS = {
    "required_approvals": ["approval", "permission", "sanction", "permit", "license"],
    "required_documents": ["document", "certificate", "drawing", "form", "affidavit", "ownership"],
    "relevant_restrictions": ["shall not", "prohibited", "restriction", "not permitted", "condition"],
    "far_height_setback_notes": ["far", "fsi", "height", "setback", "coverage", "floor area"],
    "inspection_requirements": ["inspection", "completion", "occupancy certificate", "fire", "structural"],
}


class GroundedGenerationService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def generate(
        self,
        query: str,
        language: str,
        detected: DetectionResult,
        jurisdiction: Authority | None,
        sources: list[SourceReference],
    ) -> GroundedAnswer:
        provider = self.settings.llm_provider.lower().strip()
        if provider == "local":
            return self._local_answer(query, language, detected, jurisdiction, sources)

        try:
            payload = await self._call_provider(provider, query, language, detected, jurisdiction, sources)
            if payload:
                return GroundedAnswer(**self._sanitize_payload(payload, jurisdiction, sources, language))
        except Exception as exc:  # pragma: no cover - external services vary
            logger.warning("llm_provider_failed_using_local", provider=provider, error=str(exc))

        return self._local_answer(query, language, detected, jurisdiction, sources)

    async def _call_provider(
        self,
        provider: str,
        query: str,
        language: str,
        detected: DetectionResult,
        jurisdiction: Authority | None,
        sources: list[SourceReference],
    ) -> dict[str, Any] | None:
        prompt = self._build_prompt(query, language, detected, jurisdiction, sources)
        if provider == "gemini" and self.settings.gemini_api_key:
            model = self.settings.llm_model or "gemini-1.5-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    url,
                    params={"key": self.settings.gemini_api_key},
                    json={"contents": [{"role": "user", "parts": [{"text": prompt}]}]},
                )
            response.raise_for_status()
            text = response.json()["candidates"][0]["content"]["parts"][0]["text"]
            return self._extract_json(text)

        if provider in {"groq", "openrouter", "openai"}:
            if provider == "groq" and self.settings.groq_api_key:
                base_url = "https://api.groq.com/openai/v1/chat/completions"
                key = self.settings.groq_api_key
                model = self.settings.llm_model or "llama-3.1-8b-instant"
            elif provider == "openrouter" and self.settings.openrouter_api_key:
                base_url = "https://openrouter.ai/api/v1/chat/completions"
                key = self.settings.openrouter_api_key
                model = self.settings.llm_model or "meta-llama/llama-3.1-8b-instruct:free"
            elif provider == "openai" and self.settings.openai_api_key:
                base_url = "https://api.openai.com/v1/chat/completions"
                key = self.settings.openai_api_key
                model = self.settings.llm_model or "gpt-4o-mini"
            else:
                return None

            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    base_url,
                    headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                    json={
                        "model": model,
                        "temperature": 0.1,
                        "messages": [
                            {
                                "role": "system",
                                "content": "You are a strict jurisdiction-aware building compliance assistant. Output only valid JSON.",
                            },
                            {"role": "user", "content": prompt},
                        ],
                    },
                )
            response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
            return self._extract_json(text)

        return None

    def _build_prompt(
        self,
        query: str,
        language: str,
        detected: DetectionResult,
        jurisdiction: Authority | None,
        sources: list[SourceReference],
    ) -> str:
        source_text = "\n\n".join(
            f"Source {idx}: {source.authority_name} | pages {source.page_start or 'n/a'}-{source.page_end or 'n/a'}\n{source.excerpt}"
            for idx, source in enumerate(sources, start=1)
        )
        return f"""
Answer the user only from the retrieved context. Write like a professional permit consultant preparing a concise compliance note. Do not invent regulations, numeric FAR/FSI, setbacks, heights, fees, or procedures. If exact rules are unavailable, say so clearly and recommend verifying with the official authority.

Language: {"Hindi" if language == "hi" else "English"}
User query: {query}
Detected fields: {detected.model_dump_json()}
Jurisdiction: {jurisdiction.model_dump_json() if jurisdiction else "unknown"}

Retrieved context:
{source_text or "No source context was retrieved."}

Return strict JSON with these keys:
{json.dumps(ANSWER_SCHEMA_KEYS)}

Rules:
- is_allowed must be one of Yes, Conditional, No, Unknown.
- confidence_indicator must be High, Medium, or Low.
- official_authority_links must contain only URLs present in the jurisdiction or sources.
- assumptions_uncertainty_notes must separate missing evidence from factual context.
- Never mention chunk IDs, document IDs, file names, metadata, vector search, similarity scores, retrieval methods, database rows, or internal source numbers.
- Prefer actionable guidance: approvals, documents, restrictions, inspections, risks, and next steps.
- If source evidence exists for a section, include the useful guidance instead of leaving that section empty.
""".strip()

    @staticmethod
    def _extract_json(text: str) -> dict[str, Any] | None:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
            cleaned = re.sub(r"```$", "", cleaned).strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", cleaned, flags=re.DOTALL)
            if not match:
                return None
            return json.loads(match.group(0))

    def _sanitize_payload(
        self,
        payload: dict[str, Any],
        jurisdiction: Authority | None,
        sources: list[SourceReference],
        language: str,
    ) -> dict[str, Any]:
        official_links = self._official_links(jurisdiction, sources)
        actual_sources = [source for source in sources if not source.metadata.get("seed")]
        relevant_sentences = self._relevant_sentences("", actual_sources)
        sanitized: dict[str, Any] = {}
        for key in ANSWER_SCHEMA_KEYS:
            value = payload.get(key)
            if key in {"quick_summary", "applicable_authority", "is_allowed", "confidence_indicator"}:
                sanitized[key] = self._clean_user_text(str(value or self._fallback_text(key, language, jurisdiction)))
            elif key == "official_authority_links":
                candidate_links = value if isinstance(value, list) else []
                sanitized[key] = [link for link in candidate_links if link in official_links] or official_links
            else:
                items = [self._clean_user_text(str(item)) for item in value] if isinstance(value, list) else []
                items = [item for item in items if item]
                if key in SECTION_KEYWORDS and not items and actual_sources:
                    items = self._bucket_with_context(
                        relevant_sentences,
                        SECTION_KEYWORDS[key],
                        actual_sources,
                        self._section_label(key),
                    )
                sanitized[key] = items
        sanitized["is_allowed"] = sanitized["is_allowed"] if sanitized["is_allowed"] in {"Yes", "Conditional", "No", "Unknown"} else "Unknown"
        sanitized["confidence_indicator"] = (
            sanitized["confidence_indicator"]
            if sanitized["confidence_indicator"] in {"High", "Medium", "Low"}
            else self._confidence(sources).value
        )
        zero_reason = self._retrieval_zero_reason(sources)
        if zero_reason and not actual_sources:
            note = "I did not find matching uploaded authority rule text for this question, so the decision remains unconfirmed."
            if note not in sanitized["assumptions_uncertainty_notes"]:
                sanitized["assumptions_uncertainty_notes"].append(note)
        sanitized["quick_summary"] = self._consultant_summary_if_needed(
            sanitized["quick_summary"],
            sanitized["is_allowed"],
            jurisdiction,
            actual_sources,
            relevant_sentences,
            language,
        )
        return sanitized

    def _local_answer(
        self,
        query: str,
        language: str,
        detected: DetectionResult,
        jurisdiction: Authority | None,
        sources: list[SourceReference],
    ) -> GroundedAnswer:
        official_links = self._official_links(jurisdiction, sources)
        actual_sources = [source for source in sources if not source.metadata.get("seed")]
        authority_name = jurisdiction.name if jurisdiction else detected.authority_name or "Unknown authority"
        confidence = self._confidence(sources)
        relevant_sentences = self._relevant_sentences(query, actual_sources)
        is_allowed = self._allowed_status(query, relevant_sentences, actual_sources)

        if language == "hi":
            if not actual_sources:
                summary = (
                    f"{authority_name} इस स्थान के लिए लागू प्राधिकरण के रूप में पहचाना गया है, "
                    "लेकिन इस प्रश्न पर कोई अनुक्रमित आधिकारिक नियम-पाठ उपलब्ध नहीं मिला। इसलिए अनुमति की पुष्टि नहीं की जा सकती।"
                )
                missing_note = "विशिष्ट नियम उपलब्ध नहीं हैं क्योंकि संबंधित आधिकारिक PDF/उपनियम अभी इंडेक्स नहीं किए गए हैं।"
            else:
                summary = "मिले हुए आधिकारिक स्रोतों के आधार पर उत्तर तैयार किया गया है; जिन बातों का स्रोत में स्पष्ट उल्लेख नहीं है उन्हें अनिश्चित माना गया है।"
                missing_note = "यदि किसी बिंदु पर स्रोत में स्पष्ट शब्द नहीं मिले, तो उसे पुष्टि योग्य नहीं माना गया है।"
            return GroundedAnswer(
                quick_summary=summary,
                is_allowed=is_allowed,
                applicable_authority=authority_name,
                required_approvals=self._bucket_hindi(relevant_sentences, ["approval", "permission", "sanction", "अनुमति", "स्वीकृति"]),
                required_documents=self._bucket_hindi(relevant_sentences, ["document", "certificate", "drawing", "form", "दस्तावेज", "प्रमाणपत्र"]),
                relevant_restrictions=self._bucket_hindi(relevant_sentences, ["shall not", "prohibited", "restriction", "not permitted", "प्रतिबंध"]),
                far_height_setback_notes=self._bucket_hindi(relevant_sentences, ["far", "fsi", "height", "setback", "coverage", "ऊंचाई", "सेटबैक"]),
                inspection_requirements=self._bucket_hindi(relevant_sentences, ["inspection", "occupancy certificate", "completion", "निरीक्षण"]),
                risks_common_mistakes=[
                    "बिना स्रोत-पुष्टि के FAR/FSI, सेटबैक, ऊंचाई या मंजिल सीमा मान लेना जोखिमपूर्ण है।",
                    "संरचनात्मक भार, फायर सेफ्टी और वाटरप्रूफिंग जैसे तकनीकी अनुमोदन अलग से लागू हो सकते हैं।",
                ],
                suggested_next_steps=[
                    "संबंधित प्राधिकरण के आधिकारिक उपनियम/सर्कुलर PDF अपलोड करके पुनः पूछें।",
                    "लाइसेंस प्राप्त आर्किटेक्ट/स्ट्रक्चरल इंजीनियर से प्लॉट-विशिष्ट ड्राइंग और अनुमोदन की जांच कराएं।",
                    "प्राधिकरण पोर्टल पर संपत्ति की योजना/स्कीम/वार्ड स्थिति सत्यापित करें।",
                ],
                official_authority_links=official_links,
                confidence_indicator=confidence,
                assumptions_uncertainty_notes=[missing_note, "यह उत्तर केवल प्राप्त स्रोत-संदर्भों पर आधारित है।"],
            )

        if not actual_sources:
            zero_reason = self._retrieval_zero_reason(sources)
            summary = (
                f"{authority_name} was detected for this location, but no indexed official rule text was retrieved for the exact issue. "
                "I cannot confirm whether it is allowed without the relevant authority document."
            )
            missing_note = (
                "I did not find matching uploaded authority rule text for this question, so the decision remains unconfirmed."
                if zero_reason
                else "Exact rule text is unavailable because the relevant official PDF/bylaw/circular has not been uploaded and indexed."
            )
        else:
            summary_context = self._summary_context(actual_sources, relevant_sentences)
            project_label = self._project_label(query, detected, relevant_sentences)
            decision_phrase = {
                "Yes": "appears allowed based on the retrieved authority text",
                "Conditional": "appears possible only after the required approvals and technical checks",
                "No": "appears not allowed based on the retrieved authority text",
                "Unknown": "cannot be confirmed from the retrieved authority text",
            }.get(is_allowed, "cannot be confirmed from the retrieved authority text")
            summary = (
                f"For this {project_label}, the request {decision_phrase}. "
                f"Key source-backed guidance: {summary_context} "
                "Items not stated in the authority text should be verified before filing or construction."
            )
            missing_note = "Where the retrieved excerpts do not state a requirement directly, the item remains uncertain."

        return GroundedAnswer(
            quick_summary=summary,
            is_allowed=is_allowed,
            applicable_authority=authority_name,
            required_approvals=self._bucket_with_context(
                relevant_sentences,
                SECTION_KEYWORDS["required_approvals"],
                actual_sources,
                "approval",
            ),
            required_documents=self._bucket_with_context(
                relevant_sentences,
                SECTION_KEYWORDS["required_documents"],
                actual_sources,
                "required documents",
            ),
            relevant_restrictions=self._bucket_with_context(
                relevant_sentences,
                SECTION_KEYWORDS["relevant_restrictions"],
                actual_sources,
                "restriction",
            ),
            far_height_setback_notes=self._bucket_with_context(
                relevant_sentences,
                SECTION_KEYWORDS["far_height_setback_notes"],
                actual_sources,
                "FAR, height, setback, or coverage",
            ),
            inspection_requirements=self._bucket_with_context(
                relevant_sentences,
                SECTION_KEYWORDS["inspection_requirements"],
                actual_sources,
                "inspection",
            ),
            risks_common_mistakes=[
                "Do not assume FAR/FSI, setback, height, or floor limits unless they appear in the retrieved authority text.",
                "Structural load, waterproofing, drainage, and fire-safety review may still be required for roof or floor additions.",
            ],
            suggested_next_steps=[
                "Upload the relevant authority bylaws, circulars, permit manual, or sanctioned-layout conditions and ask again.",
                "Verify plot-specific facts with the authority portal and a licensed architect or structural engineer.",
                "Keep the source references attached to any compliance checklist or permit report.",
            ],
            official_authority_links=official_links,
            confidence_indicator=confidence,
            assumptions_uncertainty_notes=[missing_note, "The answer uses only retrieved context and does not substitute for official sanction."],
        )

    @staticmethod
    def _official_links(jurisdiction: Authority | None, sources: list[SourceReference]) -> list[str]:
        links: list[str] = []
        if jurisdiction:
            for value in [jurisdiction.official_website, jurisdiction.permit_portal, jurisdiction.forms_url, jurisdiction.bylaws_url]:
                if value and value not in links:
                    links.append(value)
        for source in sources:
            if source.official_url and source.official_url not in links:
                links.append(source.official_url)
        return links

    @staticmethod
    def _confidence(sources: list[SourceReference]) -> ConfidenceIndicator:
        actual_sources = [source for source in sources if not source.metadata.get("seed")]
        if not actual_sources:
            return ConfidenceIndicator.low
        avg_score = sum(source.score for source in actual_sources) / len(actual_sources)
        if avg_score >= 0.68 and len(actual_sources) >= 2:
            return ConfidenceIndicator.high
        if avg_score >= 0.4:
            return ConfidenceIndicator.medium
        return ConfidenceIndicator.low

    @staticmethod
    def _relevant_sentences(query: str, sources: list[SourceReference]) -> list[str]:
        query_terms = {term.lower() for term in re.findall(r"[a-zA-Z]{4,}", query)}
        sentences: list[tuple[int, str]] = []
        for source in sources:
            for sentence in split_sentences(source.excerpt):
                lower = sentence.lower()
                score = sum(1 for term in query_terms if term in lower)
                if any(keyword in lower for keyword in ["approval", "permission", "sanction", "permit", "document", "certificate", "drawing", "setback", "far", "fsi", "height", "inspection", "occupancy", "fire", "structural", "waterproofing", "drainage", "restriction", "shall not"]):
                    score += 2
                if score:
                    sentences.append((score, sentence))
        sentences.sort(key=lambda item: item[0], reverse=True)
        deduped: list[str] = []
        for _, sentence in sentences:
            if sentence not in deduped:
                deduped.append(sentence)
        return deduped[:12]

    @staticmethod
    def _allowed_status(query: str, sentences: list[str], sources: list[SourceReference]) -> str:
        if not sources or not sentences:
            return "Unknown"
        text = " ".join(sentences).lower()
        if any(term in text for term in ["not permitted", "prohibited", "not allowed"]):
            return "No"
        if any(term in text for term in ["subject to", "provided that", "approval", "permission", "sanction", "condition"]):
            return "Conditional"
        if "shall not" in text:
            return "No"
        if any(term in text for term in ["permitted", "allowed", "may be"]):
            return "Yes"
        return "Unknown"

    @staticmethod
    def _bucket(sentences: list[str], keywords: list[str]) -> list[str]:
        bucket = [sentence for sentence in sentences if any(keyword in sentence.lower() for keyword in keywords)]
        return bucket[:4] if bucket else ["No explicit source-backed item was retrieved for this section."]

    @staticmethod
    def _bucket_with_context(
        sentences: list[str],
        keywords: list[str],
        sources: list[SourceReference],
        section_label: str,
    ) -> list[str]:
        bucket = [sentence for sentence in sentences if any(keyword in sentence.lower() for keyword in keywords)]
        if bucket:
            return bucket[:4]
        context = GroundedGenerationService._summary_context(sources, sentences)
        if context:
            return [f"The retrieved authority text did not isolate a separate {section_label} clause, but it does state: {context}"]
        return ["The retrieved authority text does not state a separate requirement for this section."]

    @staticmethod
    def _summary_context(sources: list[SourceReference], sentences: list[str]) -> str:
        if sentences:
            return excerpt(sentences[0], 320)
        for source in sources:
            source_sentences = split_sentences(source.excerpt)
            if source_sentences:
                return excerpt(source_sentences[0], 320)
            if source.excerpt:
                return excerpt(source.excerpt, 320)
        return ""

    @staticmethod
    def _retrieval_zero_reason(sources: list[SourceReference]) -> str | None:
        for source in sources:
            reason = source.metadata.get("retrieval_zero_reason")
            if reason:
                return str(reason)
        return None

    @staticmethod
    def _project_label(query: str, detected: DetectionResult, sentences: list[str]) -> str:
        text = " ".join([query, *sentences]).lower()
        if "roof top garden" in text:
            return "roof top garden"
        if "roof garden" in text:
            return "roof garden"
        if detected.project_type:
            return detected.project_type.replace("-", " ")
        return "project"

    @staticmethod
    def _clean_user_text(value: str) -> str:
        cleaned = re.sub(
            r"\b(chunk|document|authority)[-_ ]?id\b\s*[:=]?\s*[\w-]*",
            "",
            value,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(
            r"\b(vector search|similarity score|metadata|database row|retrieval method|chunk metadata)\b",
            "source review",
            cleaned,
            flags=re.IGNORECASE,
        )
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" -:\n\t")
        return cleaned

    @staticmethod
    def _section_label(key: str) -> str:
        return {
            "required_approvals": "approval",
            "required_documents": "document",
            "relevant_restrictions": "restriction",
            "far_height_setback_notes": "FAR, height, setback, or coverage",
            "inspection_requirements": "inspection",
        }.get(key, "requirement")

    def _consultant_summary_if_needed(
        self,
        summary: str,
        is_allowed: str,
        jurisdiction: Authority | None,
        sources: list[SourceReference],
        sentences: list[str],
        language: str,
    ) -> str:
        if language == "hi" or not sources:
            return summary
        lower = summary.lower()
        if not any(term in lower for term in ["metadata", "document id", "chunk", "vector", "retrieved source context"]):
            return summary
        authority_name = jurisdiction.name if jurisdiction else "the applicable authority"
        context = self._summary_context(sources, sentences)
        decision_phrase = {
            "Yes": "appears allowed",
            "Conditional": "appears conditional",
            "No": "appears not allowed",
            "Unknown": "cannot be confirmed",
        }.get(is_allowed, "cannot be confirmed")
        return (
            f"Based on the retrieved authority text for {authority_name}, the request {decision_phrase}. "
            f"Key guidance: {context or 'the relevant authority text should be reviewed before proceeding.'}"
        )

    @staticmethod
    def _bucket_hindi(sentences: list[str], keywords: list[str]) -> list[str]:
        bucket = [sentence for sentence in sentences if any(keyword in sentence.lower() for keyword in keywords)]
        return bucket[:4] if bucket else ["इस अनुभाग के लिए स्रोत में स्पष्ट जानकारी नहीं मिली।"]

    @staticmethod
    def _fallback_text(key: str, language: str, jurisdiction: Authority | None) -> str:
        if key == "applicable_authority":
            return jurisdiction.name if jurisdiction else "Unknown authority"
        if key == "is_allowed":
            return "Unknown"
        if key == "confidence_indicator":
            return "Low"
        return (
            "प्राप्त स्रोतों में पर्याप्त स्पष्ट जानकारी नहीं मिली।"
            if language == "hi"
            else "The retrieved sources do not provide enough clear information."
        )
