"""Auto-discovery of trading strategies from news sources."""

import logging
from collections.abc import Awaitable, Callable

from beanie import PydanticObjectId

from app.db.models.app_settings import AppSettings
from app.db.models.knowledge import StrategyKnowledge
from app.db.models.news import NewsArticle, NewsSource
from app.db.models.notification import NotificationType
from app.db.models.user import User
from app.knowledge.embeddings import StrategyEmbeddingGenerator
from app.news.crawler import NewsCrawler
from app.services.notification_service import NotificationService
from app.services.source_discovery import SourceDiscoveryService
from app.services.strategy_extractor import StrategyExtractor

logger = logging.getLogger(__name__)


class StrategyDiscoveryService:
    """Discovers trading strategies from news sources via AI extraction."""

    def __init__(self) -> None:
        self.crawler = NewsCrawler()
        self._extractor: StrategyExtractor | None = None
        self.embedding_gen = StrategyEmbeddingGenerator()
        self.notification_service = NotificationService()

    async def _get_extractor(self) -> StrategyExtractor:
        if self._extractor is None:
            self._extractor = await StrategyExtractor.create()
        return self._extractor

    async def run_discovery_cycle(
        self,
        on_progress: Callable[[dict], Awaitable[None]] | None = None,
        user_id: PydanticObjectId | None = None,
    ) -> dict:
        """Run one full discovery cycle across all strategy-extraction-enabled sources."""
        app_settings = await AppSettings.get_instance()
        min_confidence = app_settings.auto_discover_min_confidence

        async def emit(event: dict) -> None:
            if on_progress:
                await on_progress(event)

        # Phase 1: Discover new sources and extract strategies via Brave Search
        discovery_stats = {"new_sources": 0, "articles_fetched": 0, "strategies_extracted": 0}
        try:
            source_discovery = SourceDiscoveryService()
            discovery_stats = await source_discovery.discover_and_extract(
                on_progress=on_progress,
                user_id=user_id,
            )
        except Exception:
            logger.warning("Source discovery via Brave Search failed", exc_info=True)

        # Phase 2: Crawl all strategy-extraction-enabled sources (including newly discovered ones)
        sources = await NewsSource.find(
            NewsSource.strategy_extraction == True,  # noqa: E712
            NewsSource.crawl_enabled == True,  # noqa: E712
        ).to_list()

        stats = {
            "sources_crawled": 0,
            "articles_processed": 0,
            "strategies_found": 0,
            "discovery_new_sources": discovery_stats["new_sources"],
            "discovery_articles_fetched": discovery_stats["articles_fetched"],
            "discovery_strategies_extracted": discovery_stats["strategies_extracted"],
        }

        if not sources:
            logger.info("Strategy discovery: no sources with strategy_extraction enabled")
            return stats

        for source in sources:
            try:
                await emit({"step": "crawling_source", "source": source.name})
                articles = await self.crawler.crawl_source(source)
                stats["sources_crawled"] += 1
                await emit(
                    {"step": "source_crawled", "source": source.name, "articles": len(articles)}
                )

                for article in articles:
                    stats["articles_processed"] += 1
                    strategy = await self._extract_and_save(
                        article, source, min_confidence, user_id
                    )
                    if strategy:
                        stats["strategies_found"] += 1

            except Exception:
                logger.exception("Strategy discovery failed for source %s", source.name)

        logger.info(
            "Strategy discovery cycle complete: %d sources, %d articles, %d strategies",
            stats["sources_crawled"],
            stats["articles_processed"],
            stats["strategies_found"],
        )
        return stats

    async def _extract_and_save(
        self,
        article: NewsArticle,
        source: NewsSource,
        min_confidence: float,
        user_id: PydanticObjectId | None = None,
    ) -> StrategyKnowledge | None:
        """Extract strategy from an article, deduplicate, and save to knowledge base."""
        if not article.content or len(article.content) < 200:
            return None

        try:
            extractor = await self._get_extractor()
            extracted = await extractor.extract_from_text(article.content, source_hint=article.url)
        except Exception:
            logger.debug("AI extraction failed for article %s", article.url, exc_info=True)
            return None

        # Validate: must have a meaningful name and at least entry rules
        if not extracted.name or extracted.name == "Imported Strategy":
            return None
        if not extracted.entry_rules:
            return None

        # Deduplicate by strategy name
        existing = await StrategyKnowledge.find_one(StrategyKnowledge.name == extracted.name)
        if existing:
            return None

        # Create StrategyKnowledge entry with provenance from the source article
        knowledge = StrategyKnowledge(
            name=extracted.name,
            description=extracted.description,
            entry_rules=extracted.entry_rules,
            exit_rules=extracted.exit_rules,
            risk_params=extracted.risk_params,
            market_conditions=extracted.market_conditions,
            asset_classes=extracted.asset_classes,
            timeframes=extracted.timeframes,
            source_article_id=article.id,
            source_url=article.url,
            source_sentiment=article.sentiment_score,
        )
        await knowledge.insert()

        # Generate embedding
        try:
            knowledge.embedding = await self.embedding_gen.generate_strategy_embedding(
                extracted.model_dump()
            )
            if knowledge.embedding is not None:
                await knowledge.save()
        except Exception:
            logger.warning(
                "Failed to generate embedding for discovered strategy %s",
                knowledge.id,
                exc_info=True,
            )

        # Calculate initial rating
        try:
            from app.services.strategy_rating_calculator import StrategyRatingCalculator

            calculator = StrategyRatingCalculator()
            overall, confidence = await calculator.calculate_overall_rating(knowledge)
            knowledge.overall_rating = overall
            knowledge.rating_confidence = confidence
            await knowledge.save()
        except Exception:
            logger.warning(
                "Failed to calculate initial rating for strategy %s",
                knowledge.id,
                exc_info=True,
            )

        # Also create an inactive Strategy linked to the StrategyKnowledge
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
                    source_url=article.url,
                    knowledge_id=knowledge.id,
                )
                await strategy_doc.insert()

        # Notify all superusers
        await self._notify_superusers(knowledge, article)

        logger.info(
            "Discovered strategy '%s' from %s (%s)",
            knowledge.name,
            source.name,
            article.url,
        )
        return knowledge

    async def _notify_superusers(self, strategy: StrategyKnowledge, article: NewsArticle) -> None:
        """Send notification to all superusers about a discovered strategy."""
        superusers = await User.find(User.is_superuser == True).to_list()  # noqa: E712
        for user in superusers:
            try:
                await self.notification_service.create_notification(
                    user_id=user.id,
                    title="Strategy Discovered",
                    body=f"New strategy '{strategy.name}' extracted from {article.title}",
                    notification_type=NotificationType.STRATEGY_DISCOVERED,
                    data={
                        "strategy_knowledge_id": str(strategy.id),
                        "source_article_url": article.url,
                    },
                )
            except Exception:
                logger.debug("Failed to notify user %s", user.id, exc_info=True)
