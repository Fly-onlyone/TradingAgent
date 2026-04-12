"""MCP tools exposed only to the StrategyExplorerAgent.

Kept separate from `ALL_TRADING_TOOLS` in `mcp_tools.py` so we don't
accidentally hand the main trading agent a `fetch_article` tool that
bypasses our crawler policies or a `has_been_extracted` tool it has
no use for.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any
from urllib.parse import urlparse

import httpx
import trafilatura
from claude_agent_sdk import create_sdk_mcp_server, tool

from app.agent.mcp_tools import _buffer_tool_result

logger = logging.getLogger(__name__)

_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
_FETCH_TIMEOUT = 15.0
_MAX_FETCH_CHARS = 60_000


@tool(
    "list_configured_sources",
    "List all news sources marked for strategy extraction (strategy_extraction=True). "
    "Use this once per discovery cycle to cover configured feeds before wandering via web search.",
    {"type": "object", "properties": {}, "required": []},
)
async def mcp_list_configured_sources(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    from app.db.models.news import NewsSource

    try:
        sources = await NewsSource.find(
            NewsSource.strategy_extraction == True,  # noqa: E712
            NewsSource.crawl_enabled == True,  # noqa: E712
        ).to_list()

        payload = {
            "sources": [
                {
                    "name": s.name,
                    "domain": s.domain,
                    "source_type": s.source_type.value
                    if hasattr(s.source_type, "value")
                    else str(s.source_type),
                    "rss_url": s.rss_url,
                }
                for s in sources
            ],
            "count": len(sources),
        }
        response = {"content": [{"type": "text", "text": json.dumps(payload)}]}
        _buffer_tool_result("list_configured_sources", args, response, start)
        return response
    except Exception as exc:  # defensive — we never want the agent loop to crash
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(exc)})}]}
        _buffer_tool_result("list_configured_sources", args, response, start)
        return response


@tool(
    "fetch_article",
    "Fetch the full text of a web page via trafilatura extraction. "
    "Use this ONLY on URLs that look like they describe a trading strategy — "
    "search snippets first, then fetch the promising ones.",
    {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "Absolute URL of the article to fetch.",
            },
            "max_chars": {
                "type": "integer",
                "description": f"Maximum characters to return (default {_MAX_FETCH_CHARS}).",
                "default": _MAX_FETCH_CHARS,
            },
        },
        "required": ["url"],
    },
)
async def mcp_fetch_article(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    url = args["url"]
    max_chars = int(args.get("max_chars") or _MAX_FETCH_CHARS)

    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Unsupported URL scheme: {parsed.scheme}")

        async with httpx.AsyncClient(
            timeout=_FETCH_TIMEOUT,
            headers={"User-Agent": _USER_AGENT},
            follow_redirects=True,
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            text = trafilatura.extract(
                resp.text,
                include_comments=False,
                include_tables=False,
            )

        if not text:
            payload = {"url": url, "content": "", "error": "no_extractable_content"}
        else:
            truncated = text[:max_chars]
            payload = {
                "url": url,
                "domain": parsed.netloc.lower().removeprefix("www."),
                "content": truncated,
                "word_count": len(truncated.split()),
                "truncated": len(text) > max_chars,
            }
        response = {"content": [{"type": "text", "text": json.dumps(payload)}]}
        _buffer_tool_result("fetch_article", args, response, start)
        return response
    except Exception as exc:
        response = {
            "content": [{"type": "text", "text": json.dumps({"url": url, "error": str(exc)})}]
        }
        _buffer_tool_result("fetch_article", args, response, start)
        return response


@tool(
    "has_been_extracted",
    "Given a list of URLs, return which ones already appear in "
    "StrategyKnowledge.source_url. Use this BEFORE adding URLs to the candidate "
    "list to avoid re-processing already-known strategies across cycles.",
    {
        "type": "object",
        "properties": {
            "urls": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of candidate article URLs to check.",
            },
        },
        "required": ["urls"],
    },
)
async def mcp_has_been_extracted(args: dict[str, Any]) -> dict[str, Any]:
    start = time.monotonic()
    from app.db.models.knowledge import StrategyKnowledge

    urls: list[str] = list(args.get("urls") or [])
    try:
        if not urls:
            payload = {"known": [], "unknown": []}
        else:
            collection = StrategyKnowledge.get_pymongo_collection()
            cursor = collection.find(
                {"source_url": {"$in": urls}},
                {"source_url": 1},
            )
            known = {doc["source_url"] async for doc in cursor if doc.get("source_url")}
            payload = {
                "known": sorted(known),
                "unknown": [u for u in urls if u not in known],
            }
        response = {"content": [{"type": "text", "text": json.dumps(payload)}]}
        _buffer_tool_result("has_been_extracted", args, response, start)
        return response
    except Exception as exc:
        response = {"content": [{"type": "text", "text": json.dumps({"error": str(exc)})}]}
        _buffer_tool_result("has_been_extracted", args, response, start)
        return response


@tool(
    "submit_candidates",
    "Finalize the discovery cycle by submitting the ranked list of article "
    "candidates for extraction. After calling this tool, stop searching — the "
    "orchestrator will fan out extractors and you are done.",
    {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "description": "Up to max_candidates article objects to hand off.",
                "items": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "title": {"type": "string"},
                        "reason": {
                            "type": "string",
                            "description": "One sentence on why this article looks like a strategy.",
                        },
                    },
                    "required": ["url", "title"],
                },
            },
        },
        "required": ["candidates"],
    },
)
async def mcp_submit_candidates(args: dict[str, Any]) -> dict[str, Any]:
    """Pure sink — the orchestrator reads the buffered tool result to get candidates."""
    start = time.monotonic()
    candidates = args.get("candidates") or []
    payload = {"accepted": len(candidates)}
    response = {"content": [{"type": "text", "text": json.dumps(payload)}]}
    _buffer_tool_result("submit_candidates", args, response, start)
    return response


EXPLORER_TOOLS = [
    mcp_list_configured_sources,
    mcp_fetch_article,
    mcp_has_been_extracted,
    mcp_submit_candidates,
]


def create_explorer_mcp_server():
    """Create an in-process MCP server scoped to the Explorer subagent."""
    # Reuse search_web / search_news so the Explorer can issue web searches.
    from app.agent.mcp_tools import mcp_search_news, mcp_search_web

    return create_sdk_mcp_server(
        name="strategy_explorer",
        version="1.0.0",
        tools=[*EXPLORER_TOOLS, mcp_search_web, mcp_search_news],
    )


def explorer_allowed_tool_names() -> list[str]:
    """MCP allowlist for the Explorer's ClaudeAgentOptions.allowed_tools."""
    names = [t.name for t in EXPLORER_TOOLS] + ["search_web", "search_news"]
    return [f"mcp__strategy_explorer__{name}" for name in names]
