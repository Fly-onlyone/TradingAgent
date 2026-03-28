"""Discover new strategy sources via Brave Search and extract strategies."""

import logging
from collections.abc import Awaitable, Callable
from urllib.parse import urlparse

import httpx
import trafilatura
from beanie import PydanticObjectId

from app.config import get_settings
from app.db.models.app_settings import AppSettings
from app.db.models.news import NewsSource, NewsSourceType
from app.services.strategy_extractor import StrategyExtractor

ProgressCallback = Callable[[dict], Awaitable[None]]

logger = logging.getLogger(__name__)

_SEARCH_QUERIES = [
    "crypto trading strategy",
    "bitcoin trading strategy analysis",
    "cryptocurrency trading signals",
]

_COMMON_FEED_PATHS = ["/feed", "/rss", "/atom.xml", "/feed.xml", "/rss.xml"]

_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


async def _get_brave_api_key() -> str | None:
    """Resolve Brave Search API key from DB settings or env."""
    app_settings = await AppSettings.get_instance()
    key = app_settings.get_brave_search_api_key() or get_settings().brave_search_api_key
    return key if key else None


class SourceDiscoveryService:
    """Find new news sources via Brave Search and extract strategies from results."""

    def __init__(self) -> None:
        self._extractor: StrategyExtractor | None = None

    async def _get_extractor(self) -> StrategyExtractor | None:
        if self._extractor is None:
            try:
                self._extractor = await StrategyExtractor.create()
            except Exception:
                logger.warning("Cannot create StrategyExtractor — Anthropic API key not configured")
                return None
        return self._extractor

    async def discover_and_extract(
        self,
        on_progress: ProgressCallback | None = None,
        user_id: PydanticObjectId | None = None,
    ) -> dict:
        """Search Brave for strategy articles, register new sources, and extract strategies.

        Returns a stats dict with new_sources, articles_fetched, strategies_extracted.
        """
        stats = {"new_sources": 0, "articles_fetched": 0, "strategies_extracted": 0}

        async def emit(event: dict) -> None:
            if on_progress:
                await on_progress(event)

        api_key = await _get_brave_api_key()
        if not api_key:
            logger.warning("Source discovery skipped: Brave Search API key not configured")
            return stats

        # Check max sources limit (only blocks new source creation, not extraction)
        app_settings = await AppSettings.get_instance()
        max_sources = app_settings.auto_discover_max_sources
        current_count = await NewsSource.find(
            NewsSource.auto_discovered == True,  # noqa: E712
        ).count()
        sources_at_limit = current_count >= max_sources

        if sources_at_limit:
            await emit({"step": "info", "message": f"Source limit reached ({current_count}/{max_sources}), skipping new source creation but still extracting"})

        async with httpx.AsyncClient(timeout=15.0, headers={"User-Agent": _USER_AGENT}) as client:
            for query in _SEARCH_QUERIES:
                try:
                    results = await self._search_brave(client, api_key, query)
                    await emit({"step": "brave_search", "query": query, "results": len(results)})
                except Exception:
                    logger.warning("Brave search failed for query '%s'", query, exc_info=True)
                    continue

                for result in results:
                    url = result.get("url", "")
                    if not url:
                        continue
                    domain = urlparse(url).netloc.lower().removeprefix("www.")
                    try:
                        if not sources_at_limit and current_count + stats["new_sources"] < max_sources:
                            source_created = await self._ensure_source(client, url)
                            if source_created:
                                stats["new_sources"] += 1
                                await emit({"step": "source_discovered", "domain": domain})

                        content = await self._fetch_content(client, url)
                        if not content or len(content) < 200:
                            continue
                        stats["articles_fetched"] += 1
                        await emit({"step": "article_fetched", "domain": domain})

                        extracted = await self._extract_strategy(content, url, user_id)
                        if extracted:
                            stats["strategies_extracted"] += 1
                            await emit({"step": "strategy_extracted", "domain": domain})
                    except Exception:
                        logger.debug(
                            "Failed to process search result %s",
                            url,
                            exc_info=True,
                        )

        # Cleanup: remove oldest auto-discovered sources if exceeding limit
        if max_sources > 0:
            total_auto = await NewsSource.find(
                NewsSource.auto_discovered == True,  # noqa: E712
            ).count()
            if total_auto > max_sources:
                excess = total_auto - max_sources
                oldest = await NewsSource.find(
                    NewsSource.auto_discovered == True,  # noqa: E712
                ).sort("+created_at").limit(excess).to_list()
                for old_source in oldest:
                    await old_source.delete()
                stats["sources_cleaned_up"] = excess
                await emit({"step": "cleanup", "removed": excess, "reason": "exceeded max sources limit"})
                logger.info("Cleaned up %d excess auto-discovered sources", excess)

        logger.info(
            "Source discovery complete: %d new sources, %d articles fetched, %d strategies extracted",
            stats["new_sources"],
            stats["articles_fetched"],
            stats["strategies_extracted"],
        )
        return stats

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _search_brave(
        self, client: httpx.AsyncClient, api_key: str, query: str
    ) -> list[dict]:
        response = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            headers={
                "X-Subscription-Token": api_key,
                "Accept": "application/json",
            },
            params={"q": query, "count": 10},
        )
        response.raise_for_status()
        return response.json().get("web", {}).get("results", [])

    async def _ensure_source(self, client: httpx.AsyncClient, url: str) -> bool:
        """Register the domain as a NewsSource if it doesn't exist yet.

        Returns True when a *new* source was created.
        """
        parsed = urlparse(url)
        domain = parsed.netloc.lower().removeprefix("www.")
        if not domain:
            return False

        existing = await NewsSource.find_one(NewsSource.domain == domain)
        if existing:
            return False

        rss_url = await self._probe_rss(client, parsed.scheme, domain)

        source = NewsSource(
            name=domain,
            domain=domain,
            source_type=NewsSourceType.BLOG,
            rss_url=rss_url,
            crawl_enabled=True,
            strategy_extraction=True,
            auto_discovered=True,
        )
        await source.insert()
        logger.info("Auto-discovered new source: %s (rss=%s)", domain, rss_url)
        return True

    async def _probe_rss(self, client: httpx.AsyncClient, scheme: str, domain: str) -> str | None:
        """Try common RSS feed paths and return the first that responds with 2xx."""
        base = f"{scheme}://{domain}"
        for path in _COMMON_FEED_PATHS:
            try:
                resp = await client.head(f"{base}{path}", follow_redirects=True)
                if resp.is_success:
                    return f"{base}{path}"
            except Exception:
                continue
        return None

    async def _fetch_content(self, client: httpx.AsyncClient, url: str) -> str | None:
        """Fetch and extract article text via trafilatura."""
        try:
            resp = await client.get(url, follow_redirects=True)
            resp.raise_for_status()
            return trafilatura.extract(resp.text, include_comments=False, include_tables=False)
        except Exception:
            logger.debug("Failed to fetch content from %s", url, exc_info=True)
            return None

    async def _extract_strategy(
        self, content: str, url: str, user_id: PydanticObjectId | None = None,
    ) -> bool:
        """Run AI extraction and deduplicate. Returns True if a new strategy was saved."""
        from app.db.models.knowledge import StrategyKnowledge
        from app.knowledge.embeddings import StrategyEmbeddingGenerator

        extractor = await self._get_extractor()
        if extractor is None:
            return False

        try:
            extracted = await extractor.extract_from_text(content, source_hint=url)
        except Exception:
            logger.debug("AI extraction failed for %s", url, exc_info=True)
            return False

        if not extracted.name or extracted.name == "Imported Strategy":
            return False
        if not extracted.entry_rules:
            return False

        existing = await StrategyKnowledge.find_one(StrategyKnowledge.name == extracted.name)
        if existing:
            return False

        knowledge = StrategyKnowledge(
            name=extracted.name,
            description=extracted.description,
            entry_rules=extracted.entry_rules,
            exit_rules=extracted.exit_rules,
            risk_params=extracted.risk_params,
            market_conditions=extracted.market_conditions,
            asset_classes=extracted.asset_classes,
            timeframes=extracted.timeframes,
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
            logger.warning(
                "Failed to generate embedding for strategy %s",
                knowledge.id,
                exc_info=True,
            )

        # Also create an inactive Strategy for the Strategies page
        if user_id:
            from app.db.models.strategy import Strategy

            existing_strategy = await Strategy.find_one(Strategy.name == extracted.name)
            if not existing_strategy:
                strategy_doc = Strategy(
                    user_id=user_id,
                    name=extracted.name,
                    description=extracted.description,
                    entry_rules=extracted.entry_rules,
                    exit_rules=extracted.exit_rules,
                    risk_params=extracted.risk_params,
                    symbols=extracted.symbols,
                    timeframes=extracted.timeframes,
                    is_active=False,
                    auto_discovered=True,
                    source_url=url,
                )
                await strategy_doc.insert()

        logger.info("Extracted strategy '%s' from %s", knowledge.name, url)
        return True
