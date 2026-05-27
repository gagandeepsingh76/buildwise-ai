from __future__ import annotations

from io import BytesIO

from pypdf import PdfReader

from app.utils.text import normalize_text


class PdfExtractionError(RuntimeError):
    pass


def extract_pdf_pages(file_bytes: bytes) -> list[tuple[int, str]]:
    try:
        reader = PdfReader(BytesIO(file_bytes))
    except Exception as exc:  # pragma: no cover - defensive wrapper
        raise PdfExtractionError("Unable to read PDF. Confirm the file is not encrypted or corrupted.") from exc

    pages: list[tuple[int, str]] = []
    for index, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append((index, normalize_text(text)))

    if not any(text for _, text in pages):
        raise PdfExtractionError(
            "No selectable text was found in the PDF. Run OCR first, then upload the searchable PDF."
        )
    return pages
