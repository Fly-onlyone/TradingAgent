# Development setup

## Backend

```
uv sync                                 # install + lock Python deps
uv run python run.py                    # dev server on port 7001
uv run pytest -v                        # run tests
uv run ruff check && uv run ruff format # lint + format
```

## Frontend

```
cd frontend && bun install
cd frontend && bun run dev              # Vite dev server
cd frontend && bun run lint && bun run format
```

## OKX Agent Trade Kit (ATK)

Trade execution flows through OKX's Agent Trade Kit (Node MCP server). For dev,
install ATK globally:

```
npm install -g @okx_ai/okx-trade-mcp@1.3 @okx_ai/okx-trade-cli@1.3
okx config init                         # interactive wizard writes ~/.okx/config.toml
okx-trade-cli market ticker BTC-USDT    # smoke test (no auth needed)
```

Production Tauri builds bundle ATK as a sidecar (see Phase 4 of the ATK
migration plan and `frontend/src-tauri/scripts/build-atk-sidecar.{sh,ps1}`).
The pinned version lives in `frontend/src-tauri/scripts/atk-version.txt`.

See [`obsidian/03-Integrations/OKX Agent Trade Kit.md`](../obsidian/03-Integrations/OKX%20Agent%20Trade%20Kit.md)
for the full architecture, configuration TOML format, and the categorized
write-tool list driving the risk-hook dispatch.
