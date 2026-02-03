"""News crawling scheduler using APScheduler."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from beanie import PydanticObjectId

from app.db.models.news import NewsSource
from app.news.crawler import NewsCrawler
from app.news.summarizer import NewsSummarizer
from app.news.credibility import CredibilityScorer

logger = logging.getLogger(__name__)


class NewsScheduler:
    """Schedules and manages news crawling tasks."""

    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler()
        self.crawler = NewsCrawler()
        self.summarizer = NewsSummarizer()
        self.credibility = CredibilityScorer()
        self._running = False

    async def start(self) -> None:
        """Start the scheduler."""
        if self._running:
            return

        self._running = True

        self.scheduler.add_job(
            self._crawl_all_sources,
            IntervalTrigger(minutes=15),
            id="crawl_all",
            name="Crawl all news sources",
            replace_existing=True,
        )

        self.scheduler.add_job(
            self._update_credibility_scores,
            IntervalTrigger(hours=6),
            id="update_credibility",
            name="Update source credibility scores",
            replace_existing=True,
        )

        self.scheduler.start()
        logger.info("News scheduler started")

        # Run initial crawl
        asyncio.create_task(self._crawl_all_sources())

    async def stop(self) -> None:
        """Stop the scheduler."""
        self._running = False
        self.scheduler.shutdown(wait=False)
        await self.crawler.close()
        logger.info("News scheduler stopped")

    async def _crawl_all_sources(self) -> None:
        """Crawl all enabled news sources."""
        logger.info("Starting news crawl...")

        sources = await NewsSource.find(NewsSource.crawl_enabled == True).to_list()

        for source in sources:
            if source.last_crawled:
                last_crawled = source.last_crawled
                if last_crawled.tzinfo is None:
                    last_crawled = last_crawled.replace(tzinfo=timezone.utc)

                hours_since = (
                    datetime.now(timezone.utc) - last_crawled
                ).total_seconds() / 3600
                if hours_since < source.crawl_interval_hours:
                    continue

            try:
                await self._crawl_source(source)
            except Exception as e:
                logger.error(f"Error crawling {source.name}: {e}")
                source.last_error = str(e)
                await source.save()

        logger.info("News crawl completed")

    async def _crawl_source(self, source: NewsSource) -> int:
        """Crawl a single source and store new articles."""
        logger.info(f"Crawling {source.name}...")

        articles = await self.crawler.crawl_source(source)
        new_count = 0

        for article in articles:
            # Enrich with full content if needed
            article = await self.crawler.enrich_article(article)

            # Generate summary and sentiment
            if article.content and len(article.content) > 100:
                try:
                    article.summary = await self.summarizer.summarize_article(
                        article.title, article.content
                    )

                    sentiment = await self.summarizer.analyze_sentiment(
                        article.title, article.content
                    )
                    article.sentiment_score = sentiment["sentiment_score"]
                    article.predicted_impact = sentiment["predicted_impact"]

                    article.relevance_score = await self.summarizer.analyze_relevance(
                        article.title, article.content
                    )

                    await article.save()
                except Exception as e:
                    logger.warning(f"Error analyzing article: {e}")

            new_count += 1

        logger.info(f"Crawled {source.name}: {new_count} new articles")
        return new_count

    async def _update_credibility_scores(self) -> None:
        """Update credibility scores for all sources."""
        logger.info("Updating credibility scores...")

        sources = await NewsSource.find().to_list()

        for source in sources:
            try:
                await self.credibility.update_source_score(source.id)
            except Exception as e:
                logger.error(f"Error updating credibility for {source.name}: {e}")

        logger.info("Credibility scores updated")

    async def crawl_source_now(self, source_id: str) -> int:
        """Immediately crawl a specific source."""
        source = await NewsSource.get(PydanticObjectId(source_id))
        if not source:
            raise ValueError(f"Source {source_id} not found")

        return await self._crawl_source(source)

    def get_status(self) -> dict[str, Any]:
        """Get scheduler status."""
        jobs = []
        for job in self.scheduler.get_jobs():
            jobs.append(
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run": (
                        job.next_run_time.isoformat() if job.next_run_time else None
                    ),
                }
            )

        return {
            "running": self._running,
            "jobs": jobs,
        }
