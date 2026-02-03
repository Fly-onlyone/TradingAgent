"""News intelligence module for crawling, analysis, and credibility scoring."""

from app.news.crawler import NewsCrawler
from app.news.deduplicator import NewsDeduplicator
from app.news.credibility import CredibilityScorer
from app.news.summarizer import NewsSummarizer
from app.news.scheduler import NewsScheduler

__all__ = [
    "NewsCrawler",
    "NewsDeduplicator",
    "CredibilityScorer",
    "NewsSummarizer",
    "NewsScheduler",
]
