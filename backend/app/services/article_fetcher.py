"""Shared article fetcher used by Explorer tools + discovery orchestrator."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import httpx
import trafilatura

logger = logging.getLogger(__name__)

_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
_FETCH_TIMEOUT = 15.0


@dataclass
class FetchedArticle:
    url: str
    title: str
    content: str
    error: str | None = None


async def fetch_article(url: str, *, title: str = "") -> FetchedArticle:
    """Fetch a URL and extract article text via trafilatura.

    Returns a `FetchedArticle` with `content=""` and `error` populated on
    failure so callers can log + skip without try/except everywhere.
    """
    try:
        async with httpx.AsyncClient(
            timeout=_FETCH_TIMEOUT,
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content = trafilatura.extract(
                resp.text,
                include_comments=False,
                include_tables=False,
            )
        if not content:
            return FetchedArticle(url=url, title=title, content="", error="empty_body")
        return FetchedArticle(url=url, title=title, content=content)
    except Exception as exc:
        logger.debug("Article fetch failed for %s", url, exc_info=True)
        return FetchedArticle(url=url, title=title, content="", error=str(exc))
