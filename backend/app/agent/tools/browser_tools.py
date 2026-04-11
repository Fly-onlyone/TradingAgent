"""Web browsing and strategy extraction tools for the trading agent.

Lets the agent fetch full page content from URLs and proactively extract
trading strategies into the knowledge base during chat.
"""

import logging
from typing import Any

import httpx
import trafilatura

from app.db.models.knowledge import StrategyKnowledge
from app.knowledge.embeddings import StrategyEmbeddingGenerator
from app.services.strategy_extractor import StrategyExtractor

logger = logging.getLogger(__name__)

_FETCH_TIMEOUT = 30.0
_USER_AGENT = "Mozilla/5.0 (compatible; TradingAgent/1.0)"


async def _fetch_and_extract(url: str) -> tuple[str, str]:
    """Fetch a URL and extract title + clean text via trafilatura.

    Returns (title, text). Raises ValueError if no content extracted.
    """
    async with httpx.AsyncClient(
        timeout=_FETCH_TIMEOUT,
        follow_redirects=True,
        headers={"User-Agent": _USER_AGENT},
    ) as client:
        response = await client.get(url)
        response.raise_for_status()

    result = trafilatura.bare_extraction(
        response.text,
        include_tables=True,
        include_comments=False,
    )
    if not result or not result.get("text"):
        raise ValueError(f"Could not extract text content from {url}")

    title = result.get("title") or "Unknown"
    text = result["text"]
    return title, text


async def browse_url(url: str, max_length: int = 10_000) -> dict[str, Any]:
    """Fetch a web page and return its extracted text content."""
    try:
        title, text = await _fetch_and_extract(url)
        word_count = len(text.split())
        truncated = len(text) > max_length
        return {
            "url": url,
            "title": title,
            "content": text[:max_length],
            "word_count": word_count,
            "truncated": truncated,
            "content_length": len(text),
        }
    except httpx.TimeoutException:
        return {"url": url, "error": "Request timed out after 30 seconds"}
    except httpx.HTTPStatusError as e:
        return {"url": url, "error": f"HTTP {e.response.status_code}: {e.response.reason_phrase}"}
    except Exception as e:
        return {"url": url, "error": str(e)}


async def extract_strategy_from_url(url: str) -> dict[str, Any]:
    """Fetch a page, extract a trading strategy via AI, and save to knowledge base."""
    try:
        title, text = await _fetch_and_extract(url)
    except Exception as e:
        return {"url": url, "status": "error", "error": f"Failed to fetch page: {e}"}

    if len(text) < 200:
        return {
            "url": url,
            "status": "no_strategy_found",
            "error": "Page content too short for strategy extraction",
        }

    # AI extraction
    try:
        extractor = await StrategyExtractor.create()
        extracted = await extractor.extract_from_text(text, source_hint=url)
    except Exception as e:
        return {"url": url, "status": "error", "error": f"AI extraction failed: {e}"}

    # Validate
    if not extracted.name or extracted.name == "Imported Strategy":
        return {
            "url": url,
            "status": "no_strategy_found",
            "message": "No clear trading strategy found in this page",
        }
    if not extracted.entry_rules:
        return {
            "url": url,
            "status": "no_strategy_found",
            "message": "No entry rules found — content may not describe an actionable strategy",
        }

    strategy_dict = {
        "name": extracted.name,
        "description": extracted.description,
        "entry_rules": extracted.entry_rules,
        "exit_rules": extracted.exit_rules,
        "risk_params": extracted.risk_params,
        "symbols": extracted.symbols,
        "timeframes": extracted.timeframes,
        "market_conditions": extracted.market_conditions,
    }

    # Deduplicate by name
    existing = await StrategyKnowledge.find_one(StrategyKnowledge.name == extracted.name)
    if existing:
        return {
            "url": url,
            "status": "duplicate",
            "strategy": strategy_dict,
            "knowledge_id": str(existing.id),
            "message": f"Strategy '{extracted.name}' already exists in the knowledge base",
        }

    # Save to knowledge base
    knowledge = StrategyKnowledge(
        name=extracted.name,
        description=extracted.description,
        entry_rules=extracted.entry_rules,
        exit_rules=extracted.exit_rules,
        risk_params=extracted.risk_params,
        market_conditions=extracted.market_conditions,
        asset_classes=extracted.asset_classes,
        timeframes=extracted.timeframes,
        source_url=url,
    )
    await knowledge.insert()

    # Generate embedding
    try:
        embedding_gen = StrategyEmbeddingGenerator()
        knowledge.embedding = await embedding_gen.generate_strategy_embedding(
            extracted.model_dump()
        )
        if knowledge.embedding is not None:
            await knowledge.save()
    except Exception:
        logger.warning("Failed to generate embedding for strategy %s", knowledge.id, exc_info=True)

    # Calculate initial rating
    try:
        from app.services.strategy_rating_calculator import StrategyRatingCalculator

        calculator = StrategyRatingCalculator()
        overall, confidence = await calculator.calculate_overall_rating(knowledge)
        knowledge.overall_rating = overall
        knowledge.rating_confidence = confidence
        await knowledge.save()
    except Exception:
        logger.warning("Failed to calculate rating for strategy %s", knowledge.id, exc_info=True)

    return {
        "url": url,
        "status": "saved",
        "strategy": strategy_dict,
        "knowledge_id": str(knowledge.id),
        "message": f"Strategy '{extracted.name}' extracted and saved to the knowledge base",
    }
