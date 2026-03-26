"""Web search tools using the Brave Search API.

Provides search_web() and search_news() helper functions that both
MCP tool wrappers and subagents can call directly.
"""

import logging
import time
from typing import Any

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_BRAVE_WEB_URL = "https://api.search.brave.com/res/v1/web/search"
_BRAVE_NEWS_URL = "https://api.search.brave.com/res/v1/news/search"
_REQUEST_TIMEOUT = 10.0

# Simple TTL cache: {cache_key: (timestamp, result)}
_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_CACHE_TTL = 300  # 5 minutes
_CACHE_MAX_SIZE = 100


async def _get_api_key() -> str | None:
    from app.db.models.app_settings import AppSettings

    app_settings = await AppSettings.get_instance()
    key = app_settings.get_brave_search_api_key() or get_settings().brave_search_api_key
    return key if key else None


def _cache_key(endpoint: str, query: str, count: int, freshness: str | None) -> str:
    return f"{endpoint}|{query}|{count}|{freshness}"


def _get_cached(key: str) -> dict[str, Any] | None:
    entry = _cache.get(key)
    if entry is None:
        return None
    ts, result = entry
    if time.monotonic() - ts > _CACHE_TTL:
        _cache.pop(key, None)
        return None
    return result


def _set_cached(key: str, result: dict[str, Any]) -> None:
    # Evict oldest entries if cache is full
    if len(_cache) >= _CACHE_MAX_SIZE:
        oldest_key = min(_cache, key=lambda k: _cache[k][0])
        _cache.pop(oldest_key, None)
    _cache[key] = (time.monotonic(), result)


async def search_web(
    query: str,
    count: int = 5,
    freshness: str | None = None,
) -> dict[str, Any]:
    """Search the web using Brave Search API.

    Args:
        query: Search query (max 400 chars).
        count: Number of results (1-20, default 5).
        freshness: Time filter — pd (past day), pw (past week), pm (past month).

    Returns:
        Dict with query, results list, and count. On failure, includes error key.
    """
    api_key = await _get_api_key()
    if not api_key:
        return {
            "query": query,
            "results": [],
            "count": 0,
            "error": "Brave Search API key not configured",
        }

    count = max(1, min(count, 20))
    key = _cache_key("web", query, count, freshness)
    cached = _get_cached(key)
    if cached is not None:
        return cached

    params: dict[str, Any] = {"q": query, "count": count}
    if freshness:
        params["freshness"] = freshness

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.get(
                _BRAVE_WEB_URL,
                params=params,
                headers={
                    "Accept": "application/json",
                    "X-Subscription-Token": api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

        web_results = data.get("web", {}).get("results", [])
        result = {
            "query": query,
            "results": [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "description": r.get("description", ""),
                    "age": r.get("age", ""),
                }
                for r in web_results
            ],
            "count": len(web_results),
        }
        _set_cached(key, result)
        return result

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Brave web search HTTP error %s for query '%s'",
            exc.response.status_code,
            query,
        )
        return {
            "query": query,
            "results": [],
            "count": 0,
            "error": f"HTTP {exc.response.status_code}",
        }
    except Exception:
        logger.warning("Brave web search failed for query '%s'", query, exc_info=True)
        return {"query": query, "results": [], "count": 0, "error": "Request failed"}


async def search_news(
    query: str,
    count: int = 5,
    freshness: str | None = None,
) -> dict[str, Any]:
    """Search for news using Brave News Search API.

    Args:
        query: News search query (max 400 chars).
        count: Number of results (1-20, default 5).
        freshness: Time filter — pd (past day), pw (past week), pm (past month).

    Returns:
        Dict with query, articles list, and count. On failure, includes error key.
    """
    api_key = await _get_api_key()
    if not api_key:
        return {
            "query": query,
            "articles": [],
            "count": 0,
            "error": "Brave Search API key not configured",
        }

    count = max(1, min(count, 20))
    key = _cache_key("news", query, count, freshness)
    cached = _get_cached(key)
    if cached is not None:
        return cached

    params: dict[str, Any] = {"q": query, "count": count}
    if freshness:
        params["freshness"] = freshness

    try:
        async with httpx.AsyncClient(timeout=_REQUEST_TIMEOUT) as client:
            response = await client.get(
                _BRAVE_NEWS_URL,
                params=params,
                headers={
                    "Accept": "application/json",
                    "X-Subscription-Token": api_key,
                },
            )
            response.raise_for_status()
            data = response.json()

        news_results = data.get("results", [])
        result = {
            "query": query,
            "articles": [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "description": r.get("description", ""),
                    "source": r.get("meta_url", {}).get("hostname", ""),
                    "age": r.get("age", ""),
                    "breaking": r.get("breaking", False),
                }
                for r in news_results
            ],
            "count": len(news_results),
        }
        _set_cached(key, result)
        return result

    except httpx.HTTPStatusError as exc:
        logger.warning(
            "Brave news search HTTP error %s for query '%s'",
            exc.response.status_code,
            query,
        )
        return {
            "query": query,
            "articles": [],
            "count": 0,
            "error": f"HTTP {exc.response.status_code}",
        }
    except Exception:
        logger.warning("Brave news search failed for query '%s'", query, exc_info=True)
        return {"query": query, "articles": [], "count": 0, "error": "Request failed"}
