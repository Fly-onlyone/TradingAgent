"""Local embedding service via sentence-transformers.

Supports multiple models (see embedding_models.py registry).
Active model is read from AppSettings.embedding_model_name.
"""

import asyncio
import hashlib
import logging
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import sentry_sdk

# Prevent thread over-subscription when multiple requests run concurrently
os.environ.setdefault("OMP_NUM_THREADS", "1")

from app.knowledge.embedding_models import (
    DEFAULT_MODEL,
    EMBEDDING_MODELS,
    get_model_config,
)

logger = logging.getLogger(__name__)

_model: Any = None
_model_name: str | None = None
_model_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=2)

# Keep module-level constants for backwards compatibility
MODEL_NAME = DEFAULT_MODEL
DIMENSION = EMBEDDING_MODELS[DEFAULT_MODEL].dimension


def _get_active_model_name() -> str:
    """Read the active model from AppSettings (sync-safe, falls back to default)."""
    try:
        from app.db.models.app_settings import AppSettings

        # Use sync access via cached singleton if available
        settings = AppSettings._cached_instance  # type: ignore[attr-defined]
        if settings and settings.embedding_model_name:
            return settings.embedding_model_name
    except Exception:
        pass
    return DEFAULT_MODEL


def _get_model() -> Any:
    """Lazy-load the sentence-transformers model (singleton, reloads on model change)."""
    global _model, _model_name

    active_name = _get_active_model_name()

    if _model is not None and _model_name == active_name:
        return _model

    with _model_lock:
        # Re-check after acquiring lock
        active_name = _get_active_model_name()
        if _model is None or _model_name != active_name:
            from sentence_transformers import SentenceTransformer

            config = get_model_config(active_name)
            logger.info(
                "Loading embedding model: %s (%dM params)",
                config.hf_id,
                config.params_millions,
            )
            _model = SentenceTransformer(
                config.hf_id,
                trust_remote_code=True,
            )
            _model_name = active_name
            logger.info(
                "Embedding model loaded successfully (dim=%d)", config.dimension
            )
    return _model


def reload_model() -> None:
    """Force reload the embedding model (e.g. after settings change)."""
    global _model, _model_name
    with _model_lock:
        _model = None
        _model_name = None


async def preload_model() -> None:
    """Preload the model during app startup without blocking app availability."""
    loop = asyncio.get_running_loop()
    try:
        await loop.run_in_executor(_executor, _get_model)
    except Exception:
        logger.warning(
            "Embedding preload failed during startup; continuing without a warm model",
            exc_info=True,
        )


def _encode_sync(texts: list[str], *, normalize: bool = True) -> Any:
    """Run synchronous encoding in the thread pool."""
    model = _get_model()
    return model.encode(texts, normalize_embeddings=normalize, show_progress_bar=False)


class EmbeddingService:
    """Service for generating text embeddings using a configurable local model.

    Uses singleton model — safe to instantiate multiple times.
    """

    dimension = DIMENSION

    def _get_config(self):
        return get_model_config(_get_active_model_name())

    async def generate_document_embedding(
        self,
        text: str,
        *,
        defer_if_gaming: bool = True,
    ) -> list[float] | None:
        """Generate embedding for a document (strategy, lesson, pattern, article)."""
        if not text or not text.strip():
            return None

        if defer_if_gaming:
            await self._wait_if_gaming()

        config = self._get_config()
        prefixed = f"{config.prefix_document}{text[:30000]}"
        return await self._encode_single(prefixed)

    async def generate_query_embedding(self, text: str) -> list[float] | None:
        """Generate embedding for a search query."""
        if not text or not text.strip():
            return None

        config = self._get_config()
        prefixed = f"{config.prefix_query}{text[:30000]}"
        return await self._encode_single(prefixed)

    async def generate_document_embeddings(
        self,
        texts: list[str],
        *,
        defer_if_gaming: bool = True,
    ) -> list[list[float] | None]:
        """Generate embeddings for multiple documents."""
        if not texts:
            return []

        if defer_if_gaming:
            await self._wait_if_gaming()

        config = self._get_config()
        prefixed = [
            f"{config.prefix_document}{t[:30000]}" if t.strip() else "" for t in texts
        ]
        try:
            loop = asyncio.get_running_loop()
            non_empty = [(i, t) for i, t in enumerate(prefixed) if t]
            if not non_empty:
                return [None] * len(texts)

            indices, batch_texts = zip(*non_empty)
            embeddings = await loop.run_in_executor(
                _executor, _encode_sync, list(batch_texts)
            )

            results: list[list[float] | None] = [None] * len(texts)
            for idx, emb in zip(indices, embeddings):
                results[idx] = emb.tolist()
            return results
        except Exception:
            logger.exception("Batch embedding generation failed")
            return [None] * len(texts)

    async def _encode_single(self, prefixed_text: str) -> list[float] | None:
        """Encode a single text string."""
        try:
            with sentry_sdk.start_span(
                op="ai.embedding.generate", description="embedding.encode"
            ):
                loop = asyncio.get_running_loop()
                embeddings = await loop.run_in_executor(
                    _executor, _encode_sync, [prefixed_text]
                )
                return embeddings[0].tolist()
        except Exception:
            logger.exception("Embedding generation failed")
            return None

    async def _wait_if_gaming(self) -> None:
        """If gaming deferral is enabled and a game is running, wait until it exits."""
        try:
            from app.db.models.app_settings import AppSettings
            from app.knowledge.game_detector import is_game_running, wait_for_game_exit

            settings = await AppSettings.get_instance()
            if (
                not settings.defer_embedding_when_gaming
                or not settings.gaming_process_list
            ):
                return

            if await is_game_running(settings.gaming_process_list):
                logger.info("Game detected — deferring embedding task")
                await wait_for_game_exit(
                    settings.gaming_process_list,
                    settings.gaming_check_interval_minutes,
                )
        except Exception:
            logger.debug(
                "Game detection check failed, proceeding with embedding", exc_info=True
            )

    # ── Legacy compatibility alias ──

    async def generate_embedding(self, text: str) -> list[float] | None:
        """Generate embedding (document mode). Prefer generate_document_embedding."""
        return await self.generate_document_embedding(text)

    @staticmethod
    def compute_content_hash(content: str) -> str:
        """Compute SHA-256 hash of content for change detection."""
        normalized = " ".join(content.lower().split())
        return hashlib.sha256(normalized.encode()).hexdigest()

    @staticmethod
    def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
        """Dot product of pre-normalized vectors (sentence-transformers normalizes on encode)."""
        if len(vec1) != len(vec2):
            return 0.0

        import numpy as np

        result = float(np.dot(vec1, vec2))
        # Clamp to [-1, 1] for floating-point drift
        return max(-1.0, min(1.0, result))


# ── Singleton instance ──

_embedding_service: EmbeddingService | None = None


def get_embedding_service() -> EmbeddingService:
    """Get the singleton EmbeddingService instance."""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = EmbeddingService()
    return _embedding_service


# ── Specialized generators ──


class StrategyEmbeddingGenerator:
    """Generate embeddings specifically for trading strategies."""

    def format_strategy_text(self, strategy: dict[str, Any]) -> str:
        """Format strategy data into text for embedding."""
        parts = []

        if name := strategy.get("name"):
            parts.append(f"Strategy: {name}")

        if description := strategy.get("description"):
            parts.append(f"Description: {description}")

        if entry_rules := strategy.get("entry_rules"):
            parts.append(f"Entry Rules: {self._format_rules(entry_rules)}")

        if exit_rules := strategy.get("exit_rules"):
            parts.append(f"Exit Rules: {self._format_rules(exit_rules)}")

        if risk_params := strategy.get("risk_params"):
            parts.append(f"Risk Parameters: {self._format_rules(risk_params)}")

        if market_conditions := strategy.get("market_conditions"):
            parts.append(f"Market Conditions: {', '.join(market_conditions)}")

        if timeframes := strategy.get("timeframes"):
            parts.append(f"Timeframes: {', '.join(timeframes)}")

        return "\n".join(parts)

    def _format_rules(self, rules: dict[str, Any]) -> str:
        """Format rules dictionary to readable text."""
        if not rules:
            return "None specified"

        parts = []
        for key, value in rules.items():
            if isinstance(value, dict):
                parts.append(f"{key}: {self._format_rules(value)}")
            elif isinstance(value, list):
                parts.append(f"{key}: {', '.join(str(v) for v in value)}")
            else:
                parts.append(f"{key}: {value}")

        return "; ".join(parts)

    async def generate_strategy_embedding(
        self, strategy: dict[str, Any]
    ) -> list[float] | None:
        """Generate embedding for a trading strategy."""
        text = self.format_strategy_text(strategy)
        return await get_embedding_service().generate_document_embedding(text)
