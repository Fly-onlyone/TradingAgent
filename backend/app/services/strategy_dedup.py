"""Post-extraction dedup for parallel strategy-extraction output.

Parallel extractor subagents can independently extract near-duplicate
strategies from different sources. This module merges them by:

1. Exact normalized `name` match (current behavior — preserved).
2. Normalized `entry_rules + exit_rules` hash match (new — catches
   renamed duplicates).

When duplicates are found, source URLs and session ids are merged so the
provenance list reflects all sources that described the same strategy.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
from dataclasses import dataclass, field

from beanie import PydanticObjectId

from app.services.strategy_extractor import ExtractedStrategy

logger = logging.getLogger(__name__)

_WHITESPACE_RE = re.compile(r"\s+")


@dataclass
class ExtractionEvidence:
    """One extractor subagent's output + provenance, pre-dedup."""

    extracted: ExtractedStrategy
    confidence: float
    source_url: str
    source_session_id: PydanticObjectId
    article_title: str = ""


@dataclass
class MergedExtraction:
    """Deduped extractor output — carries provenance from all merged sources."""

    extracted: ExtractedStrategy
    confidence: float
    source_urls: list[str] = field(default_factory=list)
    source_session_ids: list[PydanticObjectId] = field(default_factory=list)
    article_titles: list[str] = field(default_factory=list)

    @property
    def primary_source_url(self) -> str:
        return self.source_urls[0] if self.source_urls else ""

    @property
    def primary_source_session_id(self) -> PydanticObjectId | None:
        return self.source_session_ids[0] if self.source_session_ids else None


def _normalize_name(name: str) -> str:
    return _WHITESPACE_RE.sub(" ", name.strip().lower())


def _rules_fingerprint(entry_rules: dict, exit_rules: dict) -> str:
    """Stable hash of entry+exit rules ignoring key order and whitespace."""
    normalized = {
        "entry": {
            _WHITESPACE_RE.sub(" ", str(k).strip().lower()): _WHITESPACE_RE.sub(
                " ", str(v).strip().lower()
            )
            for k, v in (entry_rules or {}).items()
        },
        "exit": {
            _WHITESPACE_RE.sub(" ", str(k).strip().lower()): _WHITESPACE_RE.sub(
                " ", str(v).strip().lower()
            )
            for k, v in (exit_rules or {}).items()
        },
    }
    payload = json.dumps(normalized, sort_keys=True, default=str)
    return hashlib.sha1(payload.encode("utf-8"), usedforsecurity=False).hexdigest()


def merge_extractions(results: list[ExtractionEvidence]) -> list[MergedExtraction]:
    """Group `results` by (name, rules-fingerprint) and merge provenance.

    The first evidence for a group wins on `extracted`; its confidence is
    taken as the maximum across the group. Provenance lists are merged
    without duplication. Rules fingerprint gives a secondary dedup key so
    "RSI-14 Reversal" and "Rsi 14 reversal" still merge.
    """
    name_buckets: dict[str, MergedExtraction] = {}
    fp_buckets: dict[str, MergedExtraction] = {}
    out: list[MergedExtraction] = []

    for ev in results:
        name_key = _normalize_name(ev.extracted.name)
        fp_key = _rules_fingerprint(ev.extracted.entry_rules, ev.extracted.exit_rules)

        bucket = name_buckets.get(name_key) or fp_buckets.get(fp_key)
        if bucket is None:
            bucket = MergedExtraction(
                extracted=ev.extracted,
                confidence=ev.confidence,
            )
            name_buckets[name_key] = bucket
            fp_buckets[fp_key] = bucket
            out.append(bucket)
        else:
            bucket.confidence = max(bucket.confidence, ev.confidence)
            # Keep both dedup keys pointing at the same bucket so later items
            # joining via the other key still merge in.
            name_buckets.setdefault(name_key, bucket)
            fp_buckets.setdefault(fp_key, bucket)

        if ev.source_url and ev.source_url not in bucket.source_urls:
            bucket.source_urls.append(ev.source_url)
        if ev.source_session_id not in bucket.source_session_ids:
            bucket.source_session_ids.append(ev.source_session_id)
        if ev.article_title and ev.article_title not in bucket.article_titles:
            bucket.article_titles.append(ev.article_title)

    return out
