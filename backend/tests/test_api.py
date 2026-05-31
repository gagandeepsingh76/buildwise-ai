import asyncio
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.dependencies import get_services
from app.core.config import get_settings
from app.models.schemas import SearchRequest
from app.db.supabase import SupabaseRepository
from app.services.authority import AuthorityCatalog
from app.services.retrieval import RetrievalService
from app.services.store import InMemoryStore


client = TestClient(app)


def test_health_ok():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ask_requires_jurisdiction_for_ambiguous_query():
    response = client.post(
        "/ask",
        json={"query": "I want to build another floor.", "language": "en", "context": {}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["needs_clarification"] is True
    assert "city" in data["clarification_question"].lower()


def test_ask_detects_kanpur_authority():
    response = client.post(
        "/ask",
        json={"query": "Can I build a roof garden in Kanpur?", "language": "en", "context": {}},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["needs_clarification"] is False
    assert data["jurisdiction"]["short_name"] == "KDA"
    assert data["answer"]["is_allowed"] in {"Unknown", "Conditional", "Yes", "No"}


def test_pdf_ingestion_and_authority_filtered_retrieval():
    pdf_bytes = _make_text_pdf(
        "KDA roof garden requires structural safety approval waterproofing drainage and building plan sanction."
    )
    upload_response = client.post(
        "/documents",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
        data={
            "authority_id": "kda-kanpur",
            "title": "KDA Roof Garden Circular",
            "document_type": "building-bylaws",
            "city": "Kanpur",
            "state": "Uttar Pradesh",
            "country": "India",
            "issuing_department": "Kanpur Development Authority",
            "official_url": "https://www.kdaindia.co.in/",
            "tags": "roof-garden,structural",
        },
        files={"file": ("kda-roof-garden.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_response.status_code == 200
    upload_data = upload_response.json()
    assert upload_data["chunks_indexed"] >= 1

    ask_response = client.post(
        "/ask",
        json={"query": "Can I build a roof garden in Kanpur?", "language": "en", "context": {}},
    )
    assert ask_response.status_code == 200
    data = ask_response.json()
    assert data["jurisdiction"]["short_name"] == "KDA"
    assert data["sources"]
    assert any("KDA Roof Garden Circular" in source["document_title"] for source in data["sources"])
    assert "structural" in " ".join(data["answer"]["inspection_requirements"] + data["answer"]["risks_common_mistakes"]).lower()


def test_roof_top_garden_upload_content_appears_in_grounded_answer_sections():
    services = get_services()
    services.store.documents.clear()
    services.store.chunks.clear()
    services.store.document_files.clear()
    services.store.document_file_types.clear()

    pdf_bytes = _make_text_pdf(
        "Roof top garden rules require prior KDA approval. "
        "Required documents include a structural safety certificate and waterproofing drainage drawings. "
        "Restrictions state the roof garden shall not overload the building structure. "
        "Inspection requirements include structural inspection and fire safety review before use."
    )
    upload_response = client.post(
        "/documents",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
        data={
            "authority_id": "kda-kanpur",
            "title": "roof top garden",
            "document_type": "building-bylaws",
            "city": "Kanpur",
            "state": "Uttar Pradesh",
            "country": "India",
            "issuing_department": "Kanpur Development Authority",
            "official_url": "https://www.kdaindia.co.in/",
            "tags": "roof-top-garden,structural,inspection",
        },
        files={"file": ("roof-top-garden.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_response.status_code == 200
    assert upload_response.json()["chunks_indexed"] >= 1

    ask_response = client.post(
        "/ask",
        json={"query": "Can I build a roof garden in Kanpur?", "language": "en", "context": {}},
    )
    assert ask_response.status_code == 200
    data = ask_response.json()
    assert any(source["document_title"] == "roof top garden" for source in data["sources"])
    answer = data["answer"]
    assert "roof top garden" in answer["quick_summary"].lower()
    assert "structural safety certificate" in " ".join(answer["required_documents"]).lower()
    assert "shall not overload" in " ".join(answer["relevant_restrictions"]).lower()
    assert "structural inspection" in " ".join(answer["inspection_requirements"]).lower()


def test_admin_document_detail_file_reindex_and_delete_lifecycle():
    services = get_services()
    services.store.documents.clear()
    services.store.chunks.clear()
    services.store.document_files.clear()
    services.store.document_file_types.clear()

    pdf_bytes = _make_text_pdf(
        "KDA permit manual requires plan approval. Required documents include ownership certificate."
    )
    upload_response = client.post(
        "/documents",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
        data={
            "authority_id": "kda-kanpur",
            "title": "KDA Permit Manual",
            "document_type": "permit-manual",
            "city": "Kanpur",
            "state": "Uttar Pradesh",
            "country": "India",
            "official_url": "https://www.kdaindia.co.in/",
            "tags": "permit,approval",
        },
        files={"file": ("kda-permit.pdf", pdf_bytes, "application/pdf")},
    )
    assert upload_response.status_code == 200
    document_id = upload_response.json()["document"]["id"]

    unauthorized = client.delete(f"/admin/documents/{document_id}")
    assert unauthorized.status_code == 401

    list_response = client.get(
        "/admin/documents",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
    )
    assert list_response.status_code == 200
    assert any(document["id"] == document_id for document in list_response.json())

    detail_response = client.get(
        f"/admin/documents/{document_id}",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
    )
    assert detail_response.status_code == 200
    detail = detail_response.json()
    assert detail["document"]["title"] == "KDA Permit Manual"
    assert detail["chunks"]
    assert detail["preview_available"] is True

    file_response = client.get(
        f"/admin/documents/{document_id}/file",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
    )
    assert file_response.status_code == 200
    assert file_response.headers["content-type"].startswith("application/pdf")

    reindex_response = client.post(
        f"/admin/documents/{document_id}/reindex",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
    )
    assert reindex_response.status_code == 200
    assert reindex_response.json()["chunks_indexed"] >= 1

    delete_response = client.delete(
        f"/admin/documents/{document_id}",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
    )
    assert delete_response.status_code == 200
    assert delete_response.json()["chunks_deleted"] >= 1
    assert document_id not in services.store.documents
    assert document_id not in services.store.document_files
    assert not [chunk for chunk in services.store.chunks if chunk["document_id"] == document_id]

    missing_detail = client.get(
        f"/admin/documents/{document_id}",
        headers={"X-Admin-Api-Key": "change-this-before-production"},
    )
    assert missing_detail.status_code == 404


def test_supabase_lexical_fallback_recovers_uploaded_roof_top_chunk():
    class FakeSupabaseRepository:
        enabled = True
        last_match_debug = {"zero_reason": "Best vector similarity was below threshold."}

        async def list_indexed_chunk_candidates(self, **_kwargs):
            return [
                {
                    "chunk_id": "chunk-1",
                    "document_id": "doc-1",
                    "document_title": "roof top garden",
                    "authority_id": "authority-uuid",
                    "authority_name": "Kanpur Development Authority",
                    "city": "Kanpur",
                    "state": "Uttar Pradesh",
                    "document_type": "building-bylaws",
                    "official_url": "https://www.kdaindia.co.in/",
                    "content": "Roof top garden requires structural safety certificate and inspection.",
                    "metadata": {
                        "authority_slug": "kda-kanpur",
                        "document_type": "building-bylaws",
                        "source_kind": "uploaded_authority_document",
                    },
                    "similarity": 0.0,
                }
            ]

    service = RetrievalService(
        get_settings(),
        FakeSupabaseRepository(),  # type: ignore[arg-type]
        embeddings=None,  # type: ignore[arg-type]
        authorities=AuthorityCatalog(),
        store=InMemoryStore(),
    )
    rows = asyncio.run(
        service._search_supabase_lexical(
            SearchRequest(
                query="Can I build a roof garden in Kanpur?",
                authority_id="kda-kanpur",
                city="Kanpur",
                state="Uttar Pradesh",
                top_k=8,
            )
        )
    )
    assert len(rows) == 1
    assert rows[0]["document_title"] == "roof top garden"
    assert rows[0]["metadata"]["retrieval_method"] == "supabase_lexical_fallback"


def test_supabase_metadata_authority_slug_fallback_when_authority_fk_missing():
    rows = [
        {"document_id": "doc-1", "metadata": {"authority_slug": "kda-kanpur"}},
        {"document_id": "doc-2", "metadata": {"authority_slug": "lda-lucknow"}},
    ]
    filtered = SupabaseRepository._filter_rows_by_metadata_authority(rows, "kda-kanpur", db_authority_id=None)
    assert [row["document_id"] for row in filtered] == ["doc-1"]
    assert SupabaseRepository._document_matches_metadata_authority(
        {"metadata": {"authority_slug": "kda-kanpur"}, "authorities": None},
        "kda-kanpur",
    )


def _make_text_pdf(text: str) -> bytes:
    escaped = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({escaped}) Tj ET".encode("latin-1")
    objects = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
        b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
        b"5 0 obj << /Length " + str(len(stream)).encode("ascii") + b" >> stream\n" + stream + b"\nendstream endobj\n",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for item in objects:
        offsets.append(len(pdf))
        pdf.extend(item)
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode("ascii"))
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    pdf.extend(f"trailer << /Root 1 0 R /Size {len(objects) + 1} >>\nstartxref\n{xref}\n%%EOF".encode("ascii"))
    return bytes(pdf)
