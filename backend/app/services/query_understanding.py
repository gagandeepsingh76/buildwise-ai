from __future__ import annotations

import re

from app.models.schemas import DetectionResult, WizardContext
from app.services.authority import AuthorityCatalog


PROPERTY_PATTERNS = {
    "residential": r"\b(residential|house|home|villa|plot|apartment|flat|आवास|घर|मकान)\b",
    "commercial": r"\b(commercial|shop|office|retail|hotel|mall|व्यावसायिक|दुकान)\b",
    "mixed-use": r"\b(mixed use|mixed-use|residential.*commercial|commercial.*residential)\b",
    "industrial": r"\b(industrial|factory|warehouse|उद्योग|कारखाना)\b",
}

PROJECT_PATTERNS = {
    "new-construction": r"\b(new construction|construct|build|building plan|नया निर्माण|बनाना)\b",
    "addition": r"\b(add|addition|extend|extension|second floor|another floor|extra floor|ऊपर|दूसरी मंजिल|मंजिल)\b",
    "roof-garden": r"\b(roof garden|terrace garden|green roof|छत.*बगीचा|रूफ गार्डन)\b",
    "conversion": r"\b(convert|change of use|change user|commercial use|land use change|परिवर्तन)\b",
    "renovation": r"\b(renovation|alteration|repair|remodel|मरम्मत|बदलाव)\b",
}

OCCUPANCY_PATTERNS = {
    "residential": r"\b(single family|dwelling|residential|group housing|आवासीय)\b",
    "assembly": r"\b(assembly|school|hospital|cinema|auditorium|school|hospital)\b",
    "business": r"\b(office|business|it park|commercial)\b",
    "mercantile": r"\b(shop|retail|market|mall)\b",
    "industrial": r"\b(factory|industrial|warehouse)\b",
}


class QueryUnderstandingService:
    def __init__(self, authority_catalog: AuthorityCatalog) -> None:
        self.authority_catalog = authority_catalog

    def detect(self, query: str, context: WizardContext | None = None) -> DetectionResult:
        context = context or WizardContext()
        authority = self.authority_catalog.get(context.authority_id) or self.authority_catalog.detect(
            query,
            city_hint=context.city,
            authority_hint=context.authority_id,
        )
        normalized = query.lower()

        result = DetectionResult(
            city=context.city,
            state=context.state,
            authority_id=context.authority_id,
            property_type=context.property_type,
            project_type=context.project_type,
            occupancy_type=context.occupancy_type,
            plot_size_sqm=context.plot_size_sqm,
            floors=context.floors,
            road_width_m=context.road_width_m,
        )
        if authority:
            result.city = authority.city
            result.state = authority.state
            result.authority_id = authority.id
            result.authority_name = authority.name

        result.property_type = result.property_type or self._first_match(normalized, PROPERTY_PATTERNS)
        result.project_type = result.project_type or self._first_match(normalized, PROJECT_PATTERNS)
        result.occupancy_type = result.occupancy_type or self._first_match(normalized, OCCUPANCY_PATTERNS)
        result.construction_category = self._construction_category(normalized, result.project_type)
        result.plot_size_sqm = result.plot_size_sqm or self._extract_plot_size(normalized)
        result.floors = result.floors or self._extract_floors(normalized)
        result.road_width_m = result.road_width_m or self._extract_road_width(normalized)
        return result

    @staticmethod
    def needs_jurisdiction_clarification(detected: DetectionResult) -> bool:
        return not (detected.city and detected.authority_id)

    @staticmethod
    def clarification_question(language: str) -> str:
        if language == "hi":
            return "आपकी संपत्ति किस शहर या विकास प्राधिकरण के क्षेत्र में आती है?"
        return "Which city or development authority is your property located under?"

    @staticmethod
    def _first_match(text: str, patterns: dict[str, str]) -> str | None:
        for label, pattern in patterns.items():
            if re.search(pattern, text, flags=re.IGNORECASE):
                return label
        return None

    @staticmethod
    def _construction_category(text: str, project_type: str | None) -> str | None:
        if project_type == "roof-garden":
            return "terrace-roof-use"
        if re.search(r"\bg\s*\+?\s*\d+\b", text):
            return "multi-storey"
        if project_type in {"addition", "new-construction"}:
            return "building-plan"
        return project_type

    @staticmethod
    def _extract_plot_size(text: str) -> float | None:
        sqm = re.search(r"(\d+(?:\.\d+)?)\s*(sqm|sq\.?\s*m|square meters|square metres|वर्ग\s*मीटर)", text)
        if sqm:
            return float(sqm.group(1))
        sqyd = re.search(r"(\d+(?:\.\d+)?)\s*(sq\.?\s*yd|gaj|gaz|yard|yards|गज)", text)
        if sqyd:
            return round(float(sqyd.group(1)) * 0.836127, 2)
        sqft = re.search(r"(\d+(?:\.\d+)?)\s*(sq\.?\s*ft|square feet|feet|फीट)", text)
        if sqft:
            return round(float(sqft.group(1)) * 0.092903, 2)
        return None

    @staticmethod
    def _extract_floors(text: str) -> str | None:
        match = re.search(r"\b(g\s*\+?\s*\d+|ground\s*\+\s*\d+|\d+\s*floors?|\d+\s*storeys?)\b", text)
        return match.group(1).upper().replace(" ", "") if match else None

    @staticmethod
    def _extract_road_width(text: str) -> float | None:
        match = re.search(r"road\s*(width)?\s*(of)?\s*(\d+(?:\.\d+)?)\s*(m|meter|metre|meters|metres)", text)
        return float(match.group(3)) if match else None
