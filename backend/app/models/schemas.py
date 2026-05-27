from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl, field_validator


class Language(str, Enum):
    en = "en"
    hi = "hi"


class AllowedStatus(str, Enum):
    yes = "Yes"
    conditional = "Conditional"
    no = "No"
    unknown = "Unknown"


class ConfidenceIndicator(str, Enum):
    high = "High"
    medium = "Medium"
    low = "Low"


class ContactInfo(BaseModel):
    email: str | None = None
    phone: str | None = None
    address: str | None = None


class Authority(BaseModel):
    id: str
    name: str
    short_name: str
    city: str
    state: str
    country: str = "India"
    aliases: list[str] = Field(default_factory=list)
    jurisdiction_notes: str | None = None
    official_website: str | None = None
    permit_portal: str | None = None
    forms_url: str | None = None
    bylaws_url: str | None = None
    contact: ContactInfo = Field(default_factory=ContactInfo)
    tags: list[str] = Field(default_factory=list)


class WizardContext(BaseModel):
    city: str | None = None
    state: str | None = None
    authority_id: str | None = None
    project_type: str | None = None
    property_type: str | None = None
    occupancy_type: str | None = None
    plot_size_sqm: float | None = Field(default=None, ge=0)
    floors: str | None = None
    road_width_m: float | None = Field(default=None, ge=0)
    budget_inr: float | None = Field(default=None, ge=0)
    notes: str | None = None


class AskRequest(BaseModel):
    query: str = Field(min_length=3, max_length=4000)
    language: Language = Language.en
    session_id: str | None = None
    context: WizardContext = Field(default_factory=WizardContext)

    @field_validator("query")
    @classmethod
    def normalize_query(cls, value: str) -> str:
        return " ".join(value.strip().split())


class DetectionResult(BaseModel):
    city: str | None = None
    state: str | None = None
    authority_id: str | None = None
    authority_name: str | None = None
    property_type: str | None = None
    project_type: str | None = None
    occupancy_type: str | None = None
    construction_category: str | None = None
    plot_size_sqm: float | None = None
    floors: str | None = None
    road_width_m: float | None = None


class SourceReference(BaseModel):
    chunk_id: str | None = None
    document_id: str
    document_title: str
    authority_name: str
    city: str
    state: str
    page_start: int | None = None
    page_end: int | None = None
    official_url: str | None = None
    score: float = Field(ge=0, le=1)
    excerpt: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class GroundedAnswer(BaseModel):
    quick_summary: str
    is_allowed: AllowedStatus = AllowedStatus.unknown
    applicable_authority: str
    required_approvals: list[str] = Field(default_factory=list)
    required_documents: list[str] = Field(default_factory=list)
    relevant_restrictions: list[str] = Field(default_factory=list)
    far_height_setback_notes: list[str] = Field(default_factory=list)
    inspection_requirements: list[str] = Field(default_factory=list)
    risks_common_mistakes: list[str] = Field(default_factory=list)
    suggested_next_steps: list[str] = Field(default_factory=list)
    official_authority_links: list[str] = Field(default_factory=list)
    confidence_indicator: ConfidenceIndicator = ConfidenceIndicator.low
    assumptions_uncertainty_notes: list[str] = Field(default_factory=list)


class AskResponse(BaseModel):
    query_id: str
    session_id: str
    language: Language
    needs_clarification: bool
    clarification_question: str | None = None
    jurisdiction: Authority | None = None
    detected: DetectionResult
    answer: GroundedAnswer
    sources: list[SourceReference]
    suggested_questions: list[str] = Field(default_factory=list)


class SearchRequest(BaseModel):
    query: str = Field(min_length=2, max_length=2000)
    authority_id: str | None = None
    city: str | None = None
    state: str | None = None
    document_type: str | None = None
    top_k: int = Field(default=8, ge=1, le=30)


class SearchResponse(BaseModel):
    results: list[SourceReference]


class DocumentMetadata(BaseModel):
    authority_id: str
    title: str
    document_type: str
    city: str
    state: str
    country: str = "India"
    issuing_department: str | None = None
    effective_date: date | None = None
    official_url: str | None = None
    tags: list[str] = Field(default_factory=list)


class DocumentRecord(DocumentMetadata):
    id: str
    status: str
    file_name: str | None = None
    file_size: int | None = None
    storage_path: str | None = None
    chunk_count: int = 0
    indexed_at: datetime | None = None
    created_at: datetime | None = None


class IngestResponse(BaseModel):
    document: DocumentRecord
    chunks_indexed: int
    message: str


class HistoryItem(BaseModel):
    id: str
    session_id: str | None = None
    query: str
    language: Language
    detected: dict[str, Any] = Field(default_factory=dict)
    answer: dict[str, Any] = Field(default_factory=dict)
    sources: list[dict[str, Any]] = Field(default_factory=list)
    confidence: float | None = None
    created_at: datetime | None = None


class FavoriteCreate(BaseModel):
    query_id: str
    session_id: str | None = None
    title: str = Field(min_length=1, max_length=180)
    notes: str | None = None


class FavoriteRecord(FavoriteCreate):
    id: str
    created_at: datetime | None = None


class FeedbackCreate(BaseModel):
    query_id: str
    rating: int | None = Field(default=None, ge=1, le=5)
    label: Literal["helpful", "unclear", "incorrect", "missing_source", "unsafe"] | None = None
    comment: str | None = Field(default=None, max_length=1000)


class FeedbackRecord(FeedbackCreate):
    id: str
    created_at: datetime | None = None
