from __future__ import annotations

import hashlib
import math
import re
from functools import cached_property

import numpy as np
import structlog

from app.core.config import Settings


logger = structlog.get_logger(__name__)


class EmbeddingService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    @cached_property
    def _model(self):
        if self.settings.embedding_provider != "sentence-transformers":
            return None
        try:
            from sentence_transformers import SentenceTransformer

            return SentenceTransformer(self.settings.embedding_model)
        except Exception as exc:  # pragma: no cover - dependency/model availability varies by env
            logger.warning("embedding_model_unavailable_using_hash_fallback", error=str(exc))
            return None

    async def embed_query(self, text: str) -> list[float]:
        return self.embed_texts([text])[0]

    def embed_texts(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        if self._model is not None:
            vectors = self._model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
            return [vector.astype(float).tolist() for vector in vectors]
        return [self._hash_embedding(text) for text in texts]

    def _hash_embedding(self, text: str) -> list[float]:
        dimensions = self.settings.embedding_dimensions
        vector = np.zeros(dimensions, dtype=np.float32)
        tokens = re.findall(r"[\w\-]+", text.lower())
        for token in tokens:
            digest = hashlib.sha256(token.encode("utf-8")).digest()
            index = int.from_bytes(digest[:4], "big") % dimensions
            sign = 1 if digest[4] % 2 == 0 else -1
            vector[index] += sign
        norm = float(np.linalg.norm(vector))
        if norm == 0:
            return [0.0] * dimensions
        return (vector / norm).astype(float).tolist()


def cosine_similarity(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    dot = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(a * a for a in left))
    right_norm = math.sqrt(sum(b * b for b in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return max(0.0, min(1.0, dot / (left_norm * right_norm)))
