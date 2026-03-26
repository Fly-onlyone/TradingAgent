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

