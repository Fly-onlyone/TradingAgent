---
tags: [backend, news]
---

# News Summarizer

> Claude-backed summariser + sentiment + relevance scorer with dual-auth (API key
> or subscription via Agent SDK).

## Source

- `backend/app/news/summarizer.py` (`NewsSummarizer`)

## How it works

`NewsSummarizer.create()` is the async factory: if `resolve_anthropic_api_key()`
returns a key it uses the raw `Anthropic` client; otherwise it falls back to
`use_sdk=True`, which routes through `app.agent.sdk_client.build_sdk_client()`
(subscription mode). `_call_claude(prompt, max_tokens)` is the single dispatch
point — pick the appropriate `_call_via_sdk()` when no key is configured.

Three public operations:

- `summarize_article(title, content, max_length=200)` — Claude generates a
  trading-focused summary clipped to `max_length`.
- `analyze_sentiment(...)` — prompts Claude to emit `SENTIMENT_SCORE`,
  `PREDICTED_IMPACT`, `CONFIDENCE`, `KEY_FACTORS`, `TIMEFRAME` in a fixed
  key/value format; `_parse_sentiment_response` parses, clamping numerics.
- `analyze_relevance(...)` — asks for a single 0.0-1.0 float; falls back to 0.5 on parse failure.

`get_market_sentiment_overview(articles)` aggregates recent articles into a
confidence/relevance-weighted overall sentiment with bullish/bearish/neutral
counts.

## Depends on

- [[Anthropic API]] · [[claude-agent-sdk]]
- [[App Settings]]

## Used by

- [[News Scheduler]] (`_crawl_source` calls all three operations per article)
- Market-sentiment endpoints

## Gotchas

- Follows the dual-mode `create()` factory pattern (see code-guide.md). Never instantiate `Anthropic(api_key=…)` directly here.

## See also

- [[_index]]
