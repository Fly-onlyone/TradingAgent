"""Seed audit bugs into the bugs collection on first startup."""

import logging
from datetime import UTC, datetime

from app.db.models.bug import Bug

logger = logging.getLogger(__name__)

AUDIT_BUGS = [
    {
        "title": "Hardcoded JWT secret in config",
        "description": "JWT_SECRET had a hardcoded default value allowing token forgery if env var was not set.",
        "severity": "critical",
        "category": "security",
    },
    {
        "title": "Silent exception swallowing in OKX client",
        "description": "OKX client caught all exceptions with bare except and returned empty data, hiding API failures.",
        "severity": "high",
        "category": "logging",
    },
    {
        "title": "get_motor_collection deprecated API usage",
        "description": "Beanie's get_motor_collection() was renamed to get_pymongo_collection() in v1.26+.",
        "severity": "high",
        "category": "api",
    },
    {
        "title": "MongoDBHandler traceback type mismatch",
        "description": "LogRecord.traceback expected str but MongoDBHandler passed a tuple from record.exc_info.",
        "severity": "high",
        "category": "logging",
    },
    {
        "title": "Missing .gitignore rules for secrets",
        "description": "Sensitive files (.env, *.pem, key files) were not excluded from version control.",
        "severity": "critical",
        "category": "security",
    },
    {
        "title": "Debug auth bypass without guardrail",
        "description": "DEBUG_AUTH=true skipped all authentication with no warning or restriction.",
        "severity": "high",
        "category": "security",
    },
    {
        "title": "CORS origins hardcoded to wildcard",
        "description": "CORS allowed all origins (*) in production instead of restricting to known frontends.",
        "severity": "medium",
        "category": "security",
    },
    {
        "title": "Settings API crashes without encryption keys",
        "description": "Accessing /settings endpoint threw unhandled error when SECRETS_ENCRYPTION_KEYS was missing.",
        "severity": "high",
        "category": "api",
    },
    {
        "title": "Inconsistent API key resolution order",
        "description": "OKX API keys were resolved from multiple sources with unclear precedence.",
        "severity": "medium",
        "category": "api",
    },
]


async def seed_bugs() -> None:
    """Insert audit bugs if the collection is empty. Idempotent."""
    count = await Bug.count()
    if count > 0:
        return

    now = datetime.now(UTC)
    bugs = [
        Bug(
            title=b["title"],
            description=b["description"],
            severity=b["severity"],
            status="resolved",
            category=b["category"],
            created_at=now,
            updated_at=now,
            resolved_at=now,
        )
        for b in AUDIT_BUGS
    ]
    await Bug.insert_many(bugs)
    logger.info("Seeded %d audit bugs into the bugs collection", len(bugs))
