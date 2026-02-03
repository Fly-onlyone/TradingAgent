"""Embedding generation service using OpenAI API."""

import hashlib
from typing import Any

from openai import AsyncOpenAI

from app.config import get_settings

settings = get_settings()


class EmbeddingService:
    """Service for generating text embeddings for semantic search."""

    def __init__(self) -> None:
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        self.model = "text-embedding-3-small"  # 1536 dimensions, efficient
        self.dimension = 1536

    async def generate_embedding(self, text: str) -> list[float]:
        """Generate embedding for a single text.

        Args:
            text: Input text to embed

        Returns:
            List of floats representing the embedding vector
        """
        if not text or not text.strip():
            return [0.0] * self.dimension

        # Truncate if too long (model max is ~8191 tokens)
        if len(text) > 30000:
            text = text[:30000]

        try:
            response = await self.client.embeddings.create(
                model=self.model,
                input=text,
            )
            return response.data[0].embedding
        except Exception as e:
            # Return zero vector on error
            return [0.0] * self.dimension

    async def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for multiple texts.

        Args:
            texts: List of input texts

        Returns:
            List of embedding vectors
        """
        if not texts:
            return []

        # Truncate texts if needed
        processed_texts = [t[:30000] if len(t) > 30000 else t for t in texts]
        processed_texts = [t if t.strip() else "empty" for t in processed_texts]

        try:
            response = await self.client.embeddings.create(
                model=self.model,
                input=processed_texts,
            )
            # Sort by index to maintain order
            sorted_data = sorted(response.data, key=lambda x: x.index)
            return [d.embedding for d in sorted_data]
        except Exception:
            return [[0.0] * self.dimension for _ in texts]

    @staticmethod
    def compute_content_hash(content: str) -> str:
        """Compute SHA-256 hash of content for change detection."""
        normalized = " ".join(content.lower().split())
        return hashlib.sha256(normalized.encode()).hexdigest()

    @staticmethod
    def cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
        """Calculate cosine similarity between two vectors."""
        if len(vec1) != len(vec2):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = sum(a * a for a in vec1) ** 0.5
        norm2 = sum(b * b for b in vec2) ** 0.5

        if norm1 == 0 or norm2 == 0:
            return 0.0

        return dot_product / (norm1 * norm2)


class StrategyEmbeddingGenerator:
    """Generate embeddings specifically for trading strategies."""

    def __init__(self) -> None:
        self.embedding_service = EmbeddingService()

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
    ) -> list[float]:
        """Generate embedding for a trading strategy."""
        text = self.format_strategy_text(strategy)
        return await self.embedding_service.generate_embedding(text)


class TradeLessonEmbeddingGenerator:
    """Generate embeddings specifically for trade lessons."""

    def __init__(self) -> None:
        self.embedding_service = EmbeddingService()

    def format_lesson_text(self, lesson: dict[str, Any]) -> str:
        """Format trade lesson data into text for embedding."""
        parts = []

        parts.append(
            f"Trade: {lesson.get('symbol', 'Unknown')} {lesson.get('side', 'Unknown')}"
        )
        parts.append(f"Outcome: {lesson.get('outcome', 'Unknown')}")
        parts.append(f"Profit: {lesson.get('profit_pct', 0)}%")

        if summary := lesson.get("lesson_summary"):
            parts.append(f"Lesson: {summary}")

        if context := lesson.get("market_context"):
            parts.append(f"Market Context: {self._format_context(context)}")

        if mistakes := lesson.get("mistakes"):
            parts.append(f"Mistakes: {', '.join(mistakes)}")

        if successes := lesson.get("successes"):
            parts.append(f"Successes: {', '.join(successes)}")

        return "\n".join(parts)

    def _format_context(self, context: dict[str, Any]) -> str:
        """Format market context dictionary."""
        if not context:
            return "Not specified"
        return ", ".join(f"{k}={v}" for k, v in context.items())

    async def generate_lesson_embedding(self, lesson: dict[str, Any]) -> list[float]:
        """Generate embedding for a trade lesson."""
        text = self.format_lesson_text(lesson)
        return await self.embedding_service.generate_embedding(text)


class PatternEmbeddingGenerator:
    """Generate embeddings specifically for trading patterns."""

    def __init__(self) -> None:
        self.embedding_service = EmbeddingService()

    def format_pattern_text(self, pattern: dict[str, Any]) -> str:
        """Format trading pattern data into text for embedding."""
        parts = []

        parts.append(f"Pattern: {pattern.get('pattern_name', 'Unknown')}")
        parts.append(f"Type: {pattern.get('pattern_type', 'Unknown')}")

        if description := pattern.get("description"):
            parts.append(f"Description: {description}")

        if conditions := pattern.get("conditions"):
            parts.append(f"Conditions: {self._format_conditions(conditions)}")

        parts.append(f"Success Rate: {pattern.get('success_rate', 0)}%")

        if symbols := pattern.get("symbols"):
            parts.append(f"Symbols: {', '.join(symbols)}")

        if timeframes := pattern.get("timeframes"):
            parts.append(f"Timeframes: {', '.join(timeframes)}")

        return "\n".join(parts)

    def _format_conditions(self, conditions: dict[str, Any]) -> str:
        """Format conditions dictionary."""
        if not conditions:
            return "Not specified"
        return ", ".join(f"{k}={v}" for k, v in conditions.items())

    async def generate_pattern_embedding(self, pattern: dict[str, Any]) -> list[float]:
        """Generate embedding for a trading pattern."""
        text = self.format_pattern_text(pattern)
        return await self.embedding_service.generate_embedding(text)
