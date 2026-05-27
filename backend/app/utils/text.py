from __future__ import annotations

import re
from dataclasses import dataclass


WHITESPACE_RE = re.compile(r"\s+")
SENTENCE_RE = re.compile(r"(?<=[.!?।])\s+")


def normalize_text(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text.replace("\x00", " ")).strip()


def excerpt(text: str, limit: int = 700) -> str:
    cleaned = normalize_text(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rsplit(" ", 1)[0] + "..."


def rough_token_count(text: str) -> int:
    return max(1, int(len(text.split()) * 1.25))


def split_sentences(text: str) -> list[str]:
    return [part.strip() for part in SENTENCE_RE.split(normalize_text(text)) if part.strip()]


@dataclass(frozen=True)
class TextChunk:
    content: str
    page_start: int | None
    page_end: int | None
    token_count: int


def chunk_pages(
    pages: list[tuple[int, str]],
    max_words: int = 850,
    overlap_words: int = 120,
) -> list[TextChunk]:
    chunks: list[TextChunk] = []
    buffer_words: list[str] = []
    page_start: int | None = None
    page_end: int | None = None

    def flush() -> None:
        nonlocal buffer_words, page_start, page_end
        if not buffer_words:
            return
        content = " ".join(buffer_words)
        chunks.append(
            TextChunk(
                content=normalize_text(content),
                page_start=page_start,
                page_end=page_end,
                token_count=rough_token_count(content),
            )
        )
        if overlap_words > 0:
            buffer_words = buffer_words[-overlap_words:]
        else:
            buffer_words = []
        page_start = page_end if buffer_words else None

    for page_number, raw_text in pages:
        clean = normalize_text(raw_text)
        if not clean:
            continue
        if page_start is None:
            page_start = page_number
        page_end = page_number
        for paragraph in re.split(r"\n{2,}", clean):
            words = paragraph.split()
            if not words:
                continue
            if len(buffer_words) + len(words) > max_words and buffer_words:
                flush()
            if len(words) > max_words:
                for idx in range(0, len(words), max_words - overlap_words):
                    segment = words[idx : idx + max_words]
                    chunks.append(
                        TextChunk(
                            content=normalize_text(" ".join(segment)),
                            page_start=page_number,
                            page_end=page_number,
                            token_count=rough_token_count(" ".join(segment)),
                        )
                    )
                buffer_words = []
                page_start = None
                page_end = None
            else:
                buffer_words.extend(words)

    flush()
    return [chunk for chunk in chunks if chunk.content]
