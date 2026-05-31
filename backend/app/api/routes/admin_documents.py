from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from app.dependencies import Services, get_services, require_admin
from app.models.schemas import AdminDeleteResponse, AdminDocumentDetail, AdminReindexResponse, DocumentRecord


router = APIRouter(prefix="/admin", tags=["admin-documents"], dependencies=[Depends(require_admin)])


@router.get("/documents", response_model=list[DocumentRecord])
async def list_admin_documents(
    search: str | None = None,
    authority_id: str | None = None,
    document_type: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    services: Services = Depends(get_services),
) -> list[DocumentRecord]:
    return await services.documents.list_admin_documents(
        search=search,
        authority_id=authority_id,
        document_type=document_type,
        status=status_filter,
    )


@router.get("/documents/{document_id}", response_model=AdminDocumentDetail)
async def get_admin_document(document_id: str, services: Services = Depends(get_services)) -> AdminDocumentDetail:
    detail = await services.documents.get_admin_document_detail(document_id)
    if not detail:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    return detail


@router.get("/documents/{document_id}/file", response_class=Response)
async def get_admin_document_file(document_id: str, services: Services = Depends(get_services)) -> Response:
    document = await services.documents.get_document(document_id)
    content = await services.documents.get_document_file(document_id)
    if not document or not content:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Original PDF file is not available.")
    filename = document.file_name or f"{document.title}.pdf"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{filename}"'},
    )


@router.delete("/documents/{document_id}", response_model=AdminDeleteResponse)
async def delete_admin_document(document_id: str, services: Services = Depends(get_services)) -> AdminDeleteResponse:
    try:
        return await services.documents.admin_delete_document(document_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/documents/{document_id}/reindex", response_model=AdminReindexResponse)
async def reindex_admin_document(document_id: str, services: Services = Depends(get_services)) -> AdminReindexResponse:
    try:
        return await services.documents.admin_reindex_document(document_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
