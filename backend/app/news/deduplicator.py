"""News deduplication to prevent refetching the same articles."""

import hashlib
from urllib.parse import urlparse, parse_qs, urlencode

from app.db.models.news import NewsArticle


class NewsDeduplicator:
    """Prevents duplicate news articles from being stored."""

    # Common tracking parameters to remove from URLs
    SKIP_PARAMS = {
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_content",
        "utm_term",
        "ref",
        "source",
        "src",
        "fbclid",
        "gclid",
        "msclkid",
        "mc_cid",
        "mc_eid",
        "_ga",
        "affiliate",
        "partner",
    }

    def normalize_url(self, url: str) -> str:
        """Normalize URL by removing tracking parameters."""
        parsed = urlparse(url)

        params = parse_qs(parsed.query)
        clean_params = {k: v for k, v in params.items() if k.lower() not in self.SKIP_PARAMS}

        clean_query = urlencode(clean_params, doseq=True) if clean_params else ""
        clean_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"

        if clean_query:
            clean_url += f"?{clean_query}"

        return clean_url.rstrip("/")

    def hash_url(self, url: str) -> str:
        """Generate SHA-256 hash of normalized URL."""
        normalized = self.normalize_url(url)
        return hashlib.sha256(normalized.encode()).hexdigest()

    def hash_content(self, content: str) -> str:
        """Generate SHA-256 hash of normalized content."""
        normalized = " ".join(content.lower().split())
        return hashlib.sha256(normalized.encode()).hexdigest()

    async def is_duplicate_url(self, url: str) -> bool:
        """Check if URL already exists in database."""
        url_hash = self.hash_url(url)
        existing = await NewsArticle.find_one(NewsArticle.url_hash == url_hash)
        return existing is not None

    async def is_duplicate_content(self, content: str) -> bool:
        """Check if content already exists in database."""
        if not content:
            return False
        content_hash = self.hash_content(content)
        existing = await NewsArticle.find_one(NewsArticle.content_hash == content_hash)
        return existing is not None

    async def is_duplicate(self, url: str, content: str) -> bool:
        """Check if article is duplicate by URL or content."""
        if await self.is_duplicate_url(url):
            return True
        if content and await self.is_duplicate_content(content):
            return True
        return False

    async def find_similar_articles(
        self,
        content: str,
        limit: int = 5,
    ) -> list[NewsArticle]:
        """Find articles with similar content using hash prefix."""
        if not content:
            return []

        content_hash = self.hash_content(content)
        hash_prefix = content_hash[:8]

        return (
            await NewsArticle.find({"content_hash": {"$regex": f"^{hash_prefix}"}})
            .limit(limit)
            .to_list()
        )

    @staticmethod
    def compute_similarity(content1: str, content2: str) -> float:
        """Compute Jaccard similarity between two texts."""
        if not content1 or not content2:
            return 0.0

        words1 = set(content1.lower().split())
        words2 = set(content2.lower().split())

        stop_words = {
            "the",
            "a",
            "an",
            "is",
            "are",
            "was",
            "were",
            "be",
            "been",
            "being",
            "have",
            "has",
            "had",
            "do",
            "does",
            "did",
            "will",
            "would",
            "could",
            "should",
            "to",
            "of",
            "in",
            "for",
            "on",
            "with",
            "at",
            "by",
            "from",
            "and",
            "or",
            "but",
            "if",
            "then",
        }

        words1 = words1 - stop_words
        words2 = words2 - stop_words

        if not words1 or not words2:
            return 0.0

        intersection = len(words1 & words2)
        union = len(words1 | words2)

        return intersection / union if union > 0 else 0.0
