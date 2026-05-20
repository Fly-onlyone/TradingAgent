---
tags: [integrations]
---

# python-okx SDK

> Official Python SDK for [[OKX Exchange]] — REST and WebSocket clients.

## Used for

- Placing and cancelling orders from the order executor
- Fetching candles, tickers, and account balances for analyst subagents
- WebSocket subscriptions for real-time price streams

## Configuration

- `python-okx>=0.4.0` in `pyproject.toml`
- Context7 ID: `/okx/python-okx`
- Credentials resolved from [[App Settings]] (encrypted at rest)

## Gotchas

- Symbol naming and instrument types (SPOT, SWAP, FUTURES) are OKX-specific — keep conversion centralized
- Demo trading mode requires a header flag

## See also

- [[_index]]
- [[OKX Exchange]]
