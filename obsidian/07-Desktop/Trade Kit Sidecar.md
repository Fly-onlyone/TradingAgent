---
tags: [desktop, agent, okx, atk]
---

# Trade Kit Sidecar

> The native app runs the OKX Agent Trade Kit (`@okx_ai/okx-trade-mcp`, a Node program) as a child
> process and offers its tools to the agent: the reading ones, and the writing ones the [[Risk Gate]]
> has a rule for. Code: `src/TradingAgent.Agent/Atk/` and
> `src/TradingAgent.Agent/Mcp/`.

## What it does

- **`McpClient`** (`Mcp/`) speaks the part of the Model Context Protocol the app needs: `initialize`,
  `tools/list`, `tools/call`, over JSON-RPC 2.0. Hand-written, so nothing new has to pass the Native
  AOT build. It answers a server `ping` and declines every other server request.
- **`ProcessTransport`** (`Mcp/`) carries the messages over the child's standard input and output, one
  JSON document per line. The child starts with a **minimal environment**: only the variables in
  `ProcessTransport.InheritedVariables`, so no token of the user's shell reaches it.
- **`AtkCommandResolver`** finds the kit: a copy shipped next to the exe (`atk\launch.cmd`), then
  `okx-trade-mcp` on the `PATH`, then — **Debug builds only** — `npx` with the pinned version
  (`AtkCommandResolver.PinnedVersion`). A Release build never downloads code at start.
- **`AtkService`** is a background service: it starts the kit, lists its tools, restarts it when it
  dies (2, 5, 15, 60 s apart), when `okx.sandbox` changes and when `Reload()` is called. A restart
  refuses new calls and waits up to 10 s for calls under way.
- **`AtkToolCatalog`** is the allowlist: every kit tool the app uses, with its kind (`Read`, `Place`,
  `Cancel`, `Transfer`, `Leverage`). A tool that is not in it does not exist for the agent.
- The model sees kit tools as `okx_<name>` next to the app's own tools; `ToolHost` takes them from
  `IToolSource` at the time of each run, so they come and go with the process.

## How the key and the mode reach the kit

| What | How | Why |
|---|---|---|
| OKX key | Environment variables `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE` of the child | The key is never written to disk in plain text. The old app wrote it to `~/.okx/config.toml` |
| Demo or live | `--demo` or `--live`, on every start | Never left to a config file |
| Home folder | `USERPROFILE` and `HOME` point at `<data folder>\trade-kit` | The kit does not see the user's own `~/.okx/config.toml`, which may hold another key |
| Profile | `--profile trading-agent-no-profile` | Second lock: asked for a profile that does not exist, the kit runs without a key instead of taking the file's default |
| Kit's own log | `--no-log` | That log holds the arguments and full result of every call as plain text, and nothing prunes it |

## Which tools reach the model

- Tools the catalog lists as `Read`, unless the kit itself marks one as writing
  (`annotations.readOnlyHint`): then the stricter reading wins and the tool is hidden.
- Writing tools the risk gate has a rule for (`AtkToolCatalog.IsSupportedWrite`, 13 tools).
- Nothing else: not the 14 writing tools without a rule, not `account_set_position_mode`, not a tool
  the catalog does not know.

Every call of a writing tool passes the gate inside `AtkService.CallAsync`; see [[Risk Gate]].

## The inventory is checked against the real kit

`tests/TradingAgent.Agent.Tests/Fixtures/atk-1.3.3-tools.json` holds what the running kit of the
pinned version reports for the default modules: 93 tools, each with its name, read-only mark and
argument names. `AtkToolCatalogTests` fails when the catalog and the fixture disagree, and when a tool
the kit marks as writing is listed as reading.

The old app's list was written from documentation and was wrong against the real kit: 33 of its 91
names do not exist in 1.3.3, and 35 real tools were missing — nine of them tools that write
(`spot_batch_orders`, `swap_batch_orders`, `spot_batch_amend`, `swap_batch_amend`,
`swap_place_move_stop_order`, `spot_amend_algo_order`, `grid_amend_order`, `spot_set_leverage`,
`account_set_position_mode`).

**To move to another kit version:** change `PinnedVersion`, regenerate the fixture from the running
kit (`tools/list`), then make `AtkToolCatalogTests` pass by deciding the kind of every new tool.

## Gotchas

- **The kit is not bundled yet.** An installed build finds no kit unless the user ran
  `npm install -g @okx_ai/okx-trade-mcp@1.3.3`; the status is then `Unavailable` and the agent has
  only the app's own tools.
- **The package's install script downloads two programs** (`okx-auth`, `okx-pilot`) into
  `.okx\bin` of the home folder at install time. With a key from the environment the kit does not
  need them, and in the app's own home folder it does not find them. When the kit is bundled, install
  it with `--ignore-scripts`.
- **`account_set_position_mode` is left out on purpose** (`AtkToolCatalog.IsExcluded`): it changes how
  every position of the account is read.
- **The kit's `initialize` answer carries instructions for a model.** They are not passed on; the
  system prompt is the app's own.
- **A proxy from the environment is not inherited** (`HTTPS_PROXY` is not in the list). The kit then
  connects directly.
- **Nothing calls `Reload()` when a key is saved yet**: there is no Settings screen. Until there is,
  a new key is picked up at the next start of the app or change of mode.
- **Live tests**: `LiveAtkTests` start the real kit (through `npx`) in a throwaway home folder, with a
  made-up key where one is needed. They run only with `TRADINGAGENT_LIVE_TESTS=1`.

## See also

- [[Risk Gate]] — what a writing tool must pass
- [[Agent Runs]] — the tool host and the gates
- [[Exchange and Risk]] — the app's own read-only OKX client and the risk score
- [[Desktop Data Folder]] — where the kit's home folder is
- [[Native Rewrite Decisions]]
