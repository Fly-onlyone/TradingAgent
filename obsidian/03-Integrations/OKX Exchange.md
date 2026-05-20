---
tags: [integrations]
---

# OKX Exchange

> Cryptocurrency exchange used for live trading execution and market data.

## Used for

- Order execution via [[python-okx SDK]] (REST + WebSocket)
- Market data feeds for [[TradingAgent]] and subagents
- Position management and balance queries

## Configuration

- API key / secret / passphrase stored encrypted in `app_settings` (Fernet, see [[Fernet Encryption]])
- Three credentials required: API key, secret, passphrase

## Gotchas

- OKX symbol format differs from generic conventions — conversion logic lives in OKX adapter modules
- Demo vs live trading mode must match the credentials issued

## See also

- [[_index]]
- [[python-okx SDK]]
- [[Trading Decision Flow]]
