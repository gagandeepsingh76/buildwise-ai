import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app


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
