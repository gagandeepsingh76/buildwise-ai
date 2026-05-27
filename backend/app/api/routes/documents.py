from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status

from app.dependencies import Services, get_services, require_admin
from app.models.schemas import DocumentMetadata, DocumentRecord, IngestResponse


router = APIRouter(tags=["documents"])


def parse_tags(tags: str | None) -> list[str]:
    if not tags:
        return []
    return [tag.strip() for tag in tags.split(",") if tag.strip()]


async def ingest_form(
    file: UploadFile,
    authority_id: str,
    title: str,
    document_type: str,
    city: str,
    state: str,
    country: str,
    issuing_department: str | None,
    effective_date: date | None,
    official_url: str | None,
    tags: str | None,
    services: Services,
) -> IngestResponse:
    metadata = DocumentMetadata(
        authority_id=authority_id,
        title=title,
        document_type=document_type,
        city=city,
        state=state,
        country=country,
        issuing_department=issuing_department,
        effective_date=effective_date,
        official_url=official_url,
        tags=parse_tags(tags),
    )
    try:
        return await services.documents.ingest_pdf(file, metadata)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/documents", response_model=list[DocumentRecord])
async def list_documents(
    authority_id: str | None = None,
    city: str | None = None,
    state: str | None = None,
    document_type: str | None = None,
    services: Services = Depends(get_services),
) -> list[DocumentRecord]:
    return await services.documents.list_documents(authority_id, city, state, document_type)


@router.get("/documents/{document_id}", response_model=DocumentRecord)
async def get_document(document_id: str, services: Services = Depends(get_services)) -> DocumentRecord:
    document = await services.documents.get_document(document_id)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return document


@router.post("/documents", response_model=IngestResponse, dependencies=[Depends(require_admin)])
async def upload_document(
    file: UploadFile = File(...),
    authority_id: str = Form(...),
    title: str = Form(...),
    document_type: str = Form(...),
    city: str = Form(...),
    state: str = Form(...),
    country: str = Form("India"),
    issuing_department: str | None = Form(None),
    effective_date: date | None = Form(None),
    official_url: str | None = Form(None),
    tags: str | None = Form(None),
    services: Services = Depends(get_services),
) -> IngestResponse:
    return await ingest_form(
        file,
        authority_id,
        title,
        document_type,
        city,
        state,
        country,
        issuing_department,
        effective_date,
        official_url,
        tags,
        services,
    )


@router.post("/ingest", response_model=IngestResponse, dependencies=[Depends(require_admin)])
async def ingest_document(
    file: UploadFile = File(...),
    authority_id: str = Form(...),
    title: str = Form(...),
    document_type: str = Form(...),
    city: str = Form(...),
    state: str = Form(...),
    country: str = Form("India"),
    issuing_department: str | None = Form(None),
    effective_date: date | None = Form(None),
    official_url: str | None = Form(None),
    tags: str | None = Form(None),
    services: Services = Depends(get_services),
) -> IngestResponse:
    return await ingest_form(
        file,
        authority_id,
        title,
        document_type,
        city,
        state,
        country,
        issuing_department,
        effective_date,
        official_url,
        tags,
        services,
    )


@router.delete(
    "/documents/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
    dependencies=[Depends(require_admin)],
)
async def delete_document(document_id: str, services: Services = Depends(get_services)):
    await services.documents.delete_document(document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
