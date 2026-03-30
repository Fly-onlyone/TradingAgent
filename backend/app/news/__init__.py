"""News intelligence module for crawling, analysis, and credibility scoring."""

from app.news.crawler import NewsCrawler
from app.news.credibility import CredibilityScorer
from app.news.deduplicator import NewsDeduplicator
from app.news.scheduler import NewsScheduler
from app.news.summarizer import NewsSummarizer

__all__ = [
    "NewsCrawler",
    "NewsDeduplicator",
    "CredibilityScorer",
    "NewsSummarizer",
    "NewsScheduler",
]
