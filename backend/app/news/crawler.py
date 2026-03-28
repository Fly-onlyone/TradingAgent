"""News crawler for fetching articles from various sources."""

import logging
from datetime import UTC, datetime
from typing import Any

import feedparser
import httpx
import trafilatura
from bs4 import BeautifulSoup

from app.db.models.news import NewsArticle, NewsSource
from app.knowledge.embeddings import get_embedding_service
from app.news.deduplicator import NewsDeduplicator

logger = logging.getLogger(__name__)


class NewsCrawler:
    """Crawls news sources and extracts article content."""

    def __init__(self) -> None:
        self.deduplicator = NewsDeduplicator()
        self.embedding_service = get_embedding_service()
        self.client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"},
        )

    async def close(self) -> None:
        """Close HTTP client."""
        await self.client.aclose()

    async def crawl_source(self, source: NewsSource) -> list[NewsArticle]:
        """Crawl a news source and return new articles."""
        if not source.rss_url:
            logger.warning(f"Source {source.name} has no RSS URL, skipping")
            return []

        articles = []

        try:
            response = await self.client.get(source.rss_url)
            response.raise_for_status()
            feed = feedparser.parse(response.text)

            for entry in feed.entries[:20]:
                article = await self._process_rss_entry(entry, source)
                if article:
                    articles.append(article)

            # Update last crawled
            source.last_crawled = datetime.now(UTC)
            source.last_error = None
            await source.save()

        except Exception as e:
            logger.error(f"Error crawling RSS for {source.name}: {e}")
            source.last_error = str(e)
            await source.save()

        return articles

    async def _process_rss_entry(
        self,
        entry: Any,
        source: NewsSource,
    ) -> NewsArticle | None:
        """Process a single RSS entry."""
        url = entry.get("link", "")
        if not url:
            return None

        # Normalize URL and check for duplicate
        normalized_url = self.deduplicator.normalize_url(url)
        url_hash = self.deduplicator.hash_url(url)

        if await self.deduplicator.is_duplicate_url(url):
            return None

        # Get content
        content = ""
        if hasattr(entry, "content") and entry.content:
            content = entry.content[0].value
        elif hasattr(entry, "summary"):
            content = entry.summary

        # Strip HTML
        if content:
            soup = BeautifulSoup(content, "html.parser")
            content = soup.get_text(separator=" ", strip=True)

        content_hash = self.deduplicator.hash_content(content) if content else ""

        # Check content duplicate
        if content and await self.deduplicator.is_duplicate_content(content):
            return None

        # Get published date
        published_at = None
        if hasattr(entry, "published_parsed") and entry.published_parsed:
            published_at = datetime(*entry.published_parsed[:6], tzinfo=UTC)
        elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
            published_at = datetime(*entry.updated_parsed[:6], tzinfo=UTC)

        # Create article
        article = NewsArticle(
            source_id=source.id,
            url=normalized_url,
            url_hash=url_hash,
            content_hash=content_hash,
            title=entry.get("title", "Untitled"),
            content=content,
            published_at=published_at,
            mentioned_assets=self._extract_assets(content),
            keywords=self._extract_keywords(entry.get("title", ""), content),
        )

        # Generate embedding
        embedding_text = f"{article.title} {article.content}"
        article.embedding = await self.embedding_service.generate_embedding(embedding_text[:8000])

        await article.insert()
        return article

    async def fetch_full_content(self, url: str) -> str | None:
        """Fetch full article content from URL using trafilatura."""
        try:
            response = await self.client.get(url)
            response.raise_for_status()
            return trafilatura.extract(
                response.text,
                include_comments=False,
                include_tables=False,
            )
        except Exception as e:
            logger.error(f"Error fetching content from {url}: {e}")
            return None

    async def enrich_article(self, article: NewsArticle) -> NewsArticle:
        """Enrich article with full content if needed."""
        if len(article.content or "") < 500:
            full_content = await self.fetch_full_content(article.url)
            if full_content:
                article.content = full_content
                article.content_hash = self.deduplicator.hash_content(full_content)
                article.mentioned_assets = self._extract_assets(full_content)
                await article.save()
        return article

    def _extract_assets(self, content: str) -> list[str]:
        """Extract mentioned crypto assets from content."""
        assets = {
            "BTC": ["bitcoin", "btc"],
            "ETH": ["ethereum", "eth", "ether"],
            "SOL": ["solana", "sol"],
            "XRP": ["ripple", "xrp"],
            "DOGE": ["dogecoin", "doge"],
            "ADA": ["cardano", "ada"],
            "DOT": ["polkadot", "dot"],
            "AVAX": ["avalanche", "avax"],
            "LINK": ["chainlink", "link"],
            "MATIC": ["polygon", "matic"],
        }

        content_lower = content.lower() if content else ""
        found = []

        for symbol, keywords in assets.items():
            for keyword in keywords:
                if keyword in content_lower:
                    found.append(symbol)
                    break

        return list(set(found))

    def _extract_keywords(self, title: str, content: str) -> list[str]:
        """Extract relevant trading keywords from article."""
        relevant_keywords = [
            "bullish",
            "bearish",
            "pump",
            "dump",
            "rally",
            "crash",
            "breakout",
            "support",
            "resistance",
            "all-time high",
            "ath",
            "regulation",
            "sec",
            "etf",
            "halving",
            "hack",
            "exploit",
            "partnership",
            "listing",
            "delisting",
            "airdrop",
            "upgrade",
            "whale",
            "accumulation",
            "fed",
            "inflation",
        ]

        text_lower = (title + " " + content).lower() if content else title.lower()
        return [kw for kw in relevant_keywords if kw in text_lower][:10]
