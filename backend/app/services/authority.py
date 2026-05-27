from __future__ import annotations

import json
import re
from pathlib import Path

from app.core.config import SHARED_ROOT
from app.models.schemas import Authority, ContactInfo


FALLBACK_AUTHORITIES: list[dict] = [
    {
        "id": "kda-kanpur",
        "name": "Kanpur Development Authority",
        "short_name": "KDA",
        "city": "Kanpur",
        "state": "Uttar Pradesh",
        "country": "India",
        "aliases": ["kanpur", "kda", "kanpur development authority"],
        "jurisdiction_notes": "Use for properties inside the Kanpur Development Authority planning area.",
        "official_website": "https://www.kdaindia.co.in/",
        "permit_portal": "https://erpkda.in/",
        "forms_url": "https://www.kdaindia.co.in/",
        "bylaws_url": "https://www.kdaindia.co.in/",
        "contact": {"email": "kda@kdaindia.co.in", "phone": "", "address": "Kanpur Development Authority, Kanpur"},
        "tags": ["development-authority", "uttar-pradesh", "building-plan"],
    },
    {
        "id": "lda-lucknow",
        "name": "Lucknow Development Authority",
        "short_name": "LDA",
        "city": "Lucknow",
        "state": "Uttar Pradesh",
        "country": "India",
        "aliases": ["lucknow", "lda", "lucknow development authority"],
        "jurisdiction_notes": "Use for properties inside the Lucknow Development Authority planning area.",
        "official_website": "https://www.ldalucknow.in/",
        "permit_portal": "https://map.up.gov.in/",
        "forms_url": "https://www.ldalucknow.in/downloads-order/",
        "bylaws_url": "https://www.ldalucknow.in/downloads-order/",
        "contact": {"email": "", "phone": "", "address": "Lucknow Development Authority, Lucknow"},
        "tags": ["development-authority", "uttar-pradesh", "building-plan"],
    },
    {
        "id": "dda-delhi",
        "name": "Delhi Development Authority / Municipal Corporation of Delhi",
        "short_name": "DDA/MCD",
        "city": "Delhi",
        "state": "Delhi",
        "country": "India",
        "aliases": ["delhi", "new delhi", "dda", "mcd", "municipal corporation of delhi"],
        "jurisdiction_notes": "Delhi questions often involve DDA planning rules and MCD sanctioning processes.",
        "official_website": "https://dda.gov.in/",
        "permit_portal": "https://eodb.mcd.gov.in/",
        "forms_url": "https://dda.gov.in/building-laws",
        "bylaws_url": "https://dda.gov.in/building-laws",
        "contact": {"email": "", "phone": "", "address": "Delhi Development Authority, New Delhi"},
        "tags": ["development-authority", "municipal-corporation", "ubbl"],
    },
    {
        "id": "bbmp-bengaluru",
        "name": "Greater Bengaluru Authority / BBMP with BDA context",
        "short_name": "BBMP/BDA",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "aliases": ["bengaluru", "bangalore", "bbmp", "bda", "greater bengaluru authority"],
        "jurisdiction_notes": "Use for Bengaluru municipal building approval questions.",
        "official_website": "https://bbmp.gov.in/",
        "permit_portal": "https://bpas.bbmpgov.in/",
        "forms_url": "https://bbmp.gov.in/",
        "bylaws_url": "https://bbmp.gov.in/",
        "contact": {"email": "comm@bbmp.gov.in", "phone": "", "address": "Greater Bengaluru Authority / BBMP, Bengaluru"},
        "tags": ["municipal-corporation", "karnataka", "bpas"],
    },
    {
        "id": "bmc-mumbai",
        "name": "Brihanmumbai Municipal Corporation",
        "short_name": "BMC/MCGM",
        "city": "Mumbai",
        "state": "Maharashtra",
        "country": "India",
        "aliases": ["mumbai", "bmc", "mcgm", "brihanmumbai"],
        "jurisdiction_notes": "Use for properties under BMC/MCGM.",
        "official_website": "https://www.mcgm.gov.in/",
        "permit_portal": "https://www.mcgm.gov.in/irj/portal/anonymous/qlcedeveplan",
        "forms_url": "https://www.mcgm.gov.in/",
        "bylaws_url": "https://www.mcgm.gov.in/",
        "contact": {"email": "", "phone": "", "address": "Brihanmumbai Municipal Corporation, Mumbai"},
        "tags": ["municipal-corporation", "maharashtra", "building-proposal"],
    },
    {
        "id": "gda-ghaziabad",
        "name": "Ghaziabad Development Authority",
        "short_name": "GDA",
        "city": "Ghaziabad",
        "state": "Uttar Pradesh",
        "country": "India",
        "aliases": ["ghaziabad", "gda", "ghaziabad development authority"],
        "jurisdiction_notes": "Use for Ghaziabad Development Authority planning area questions.",
        "official_website": "https://gdaghaziabad.in/",
        "permit_portal": "https://gdaghaziabad.in/",
        "forms_url": "https://gdaghaziabad.in/",
        "bylaws_url": "https://gdaghaziabad.in/",
        "contact": {"email": "", "phone": "", "address": "Ghaziabad Development Authority, Ghaziabad"},
        "tags": ["development-authority", "uttar-pradesh", "building-plan"],
    },
    {
        "id": "noida-authority",
        "name": "New Okhla Industrial Development Authority",
        "short_name": "NOIDA Authority",
        "city": "Noida",
        "state": "Uttar Pradesh",
        "country": "India",
        "aliases": ["noida", "new okhla", "noida authority"],
        "jurisdiction_notes": "Use for Noida Authority sectors and notified areas.",
        "official_website": "https://noidaauthorityonline.in/",
        "permit_portal": "https://buildingcell.noidaauthorityonline.com/",
        "forms_url": "https://noidaauthorityonline.in/",
        "bylaws_url": "https://noidaauthorityonline.in/",
        "contact": {"email": "", "phone": "", "address": "NOIDA Authority, Sector 6, Noida"},
        "tags": ["industrial-development-authority", "uttar-pradesh", "building-cell"],
    },
]


class AuthorityCatalog:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or SHARED_ROOT / "authority_catalog.json"
        self._authorities = self._load_authorities()

    def _load_authorities(self) -> list[Authority]:
        if self.path.exists():
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        else:
            raw = FALLBACK_AUTHORITIES
        return [Authority(**item) for item in raw]

    def list(self) -> list[Authority]:
        return self._authorities

    def get(self, authority_id: str | None) -> Authority | None:
        if not authority_id:
            return None
        normalized = authority_id.lower().strip()
        return next((authority for authority in self._authorities if authority.id == normalized), None)

    def detect(self, text: str, city_hint: str | None = None, authority_hint: str | None = None) -> Authority | None:
        haystack = f"{text} {city_hint or ''} {authority_hint or ''}".lower()
        scored: list[tuple[int, Authority]] = []
        for authority in self._authorities:
            score = 0
            terms = [authority.city, authority.state, authority.short_name, authority.name, *authority.aliases]
            for term in terms:
                clean = term.lower().strip()
                if not clean:
                    continue
                if re.search(rf"\b{re.escape(clean)}\b", haystack):
                    score += 3 if clean in [authority.city.lower(), authority.short_name.lower()] else 1
            if authority_hint and authority_hint.lower() in [authority.id, authority.short_name.lower(), authority.name.lower()]:
                score += 5
            if score:
                scored.append((score, authority))
        if not scored:
            return None
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[0][1]

    def to_seed_sources(self) -> list[dict]:
        seed_sources: list[dict] = []
        for authority in self._authorities:
            seed_sources.append(
                {
                    "chunk_id": f"seed-{authority.id}",
                    "document_id": f"seed-{authority.id}",
                    "document_title": f"{authority.short_name} official authority profile",
                    "authority_id": authority.id,
                    "authority_name": authority.name,
                    "city": authority.city,
                    "state": authority.state,
                    "page_start": None,
                    "page_end": None,
                    "official_url": authority.bylaws_url or authority.official_website,
                    "score": 0.25,
                    "content": (
                        f"{authority.name} ({authority.short_name}) is the configured authority for "
                        f"{authority.city}, {authority.state}. Official website: {authority.official_website}. "
                        f"Permit portal: {authority.permit_portal}. {authority.jurisdiction_notes or ''} "
                        "This seed profile is not a substitute for uploaded official bylaws, circulars, or permit manuals."
                    ),
                    "metadata": {"source_kind": "authority_profile", "seed": True},
                }
            )
        return seed_sources
