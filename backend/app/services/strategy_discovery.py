"""Auto-discovery of trading strategies from news sources."""

import logging

from app.db.models.app_settings import AppSettings
from app.db.models.knowledge import StrategyKnowledge
from app.db.models.news import NewsArticle, NewsSource
from app.db.models.notification import NotificationType
from app.db.models.user import User
from app.knowledge.embeddings import StrategyEmbeddingGenerator
from app.news.crawler import NewsCrawler
from app.services.notification_service import NotificationService
from app.services.strategy_extractor import StrategyExtractor

logger = logging.getLogger(__name__)


class StrategyDiscoveryService:
    """Discovers trading strategies from news sources via AI extraction."""

    def __init__(self) -> None:
        self.crawler = NewsCrawler()
        self.extractor = StrategyExtractor()
        self.embedding_gen = StrategyEmbeddingGenerator()
        self.notification_service = NotificationService()

    async def run_discovery_cycle(self) -> dict:
        """Run one full discovery cycle across all strategy-extraction-enabled sources."""
        sources = await NewsSource.find(
            NewsSource.strategy_extraction == True,  # noqa: E712
            NewsSource.crawl_enabled == True,  # noqa: E712
        ).to_list()

        stats = {"sources_crawled": 0, "articles_processed": 0, "strategies_found": 0}

        if not sources:
            logger.info("Strategy discovery: no sources with strategy_extraction enabled")
            return stats

        app_settings = await AppSettings.get_instance()
        min_confidence = app_settings.auto_discover_min_confidence

        for source in sources:
            try:
                articles = await self.crawler.crawl_source(source)
                stats["sources_crawled"] += 1

                for article in articles:
                    stats["articles_processed"] += 1
                    strategy = await self._extract_and_save(
                        article, source, min_confidence
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
    ) -> StrategyKnowledge | None:
        """Extract strategy from an article, deduplicate, and save to knowledge base."""
        if not article.content or len(article.content) < 200:
            return None

        try:
            extracted = await self.extractor.extract_from_text(
                article.content, source_hint=article.url
            )
        except Exception:
            logger.debug("AI extraction failed for article %s", article.url, exc_info=True)
            return None

        # Validate: must have a meaningful name and at least entry rules
        if not extracted.name or extracted.name == "Imported Strategy":
            return None
        if not extracted.entry_rules:
            return None

        # Deduplicate by strategy name
        existing = await StrategyKnowledge.find_one(
            StrategyKnowledge.name == extracted.name
        )
        if existing:
            return None

        # Create StrategyKnowledge entry
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
            knowledge.embedding = await self.embedding_gen.generate_strategy_embedding(
                extracted.model_dump()
            )
            if knowledge.embedding is not None:
                await knowledge.save()
        except Exception:
            logger.warning("Failed to generate embedding for discovered strategy %s", knowledge.id, exc_info=True)

        # Notify all superusers
        await self._notify_superusers(knowledge, article)

        logger.info(
            "Discovered strategy '%s' from %s (%s)",
            knowledge.name,
            source.name,
            article.url,
        )
        return knowledge

    async def _notify_superusers(
        self, strategy: StrategyKnowledge, article: NewsArticle
    ) -> None:
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
