"""OKX Agent Trade Kit (ATK) integration package.

ATK is OKX's open-source Node MCP server (`@okx_ai/okx-trade-mcp`) — the
de-facto MCP standard for OKX-facing AI agents. We mount it as the trade
execution path for both the Anthropic runtime (via `claude-agent-sdk`'s
`mcp_servers`) and the OpenAI runtime (via `openai_bridge.py`).

The native `OKXClient` is now READ-only and powers the `order_mirror` service
plus chart rendering. Do NOT add write methods to `OKXClient` — route writes
through ATK.

See `obsidian/03-Integrations/OKX Agent Trade Kit.md` for the full architecture.
"""
