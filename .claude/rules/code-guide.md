# Code Guide

Five non-obvious patterns this codebase requires. Full tables, examples, and rationale
live in the Obsidian vault — links below.

### CSS Zoom Handling

**When**: any frontend component using MUI `<Select>`, `<Menu>`, popovers, or mouse coords.
**Don't**: use plain MUI `<Select>` or `anchorEl`-based `<Menu>` — always use the zoom-aware variants.
→ [obsidian/04-Patterns/CSS Zoom Handling.md](../../obsidian/04-Patterns/CSS%20Zoom%20Handling.md)
([ZoomAwareSelect](../../obsidian/04-Patterns/ZoomAwareSelect%20Pattern.md),
[useZoomAwareMenu](../../obsidian/04-Patterns/useZoomAwareMenu%20Pattern.md))

### Frontend Component Animations

**When**: every new React component in `frontend/src/`.
**Don't**: create ad-hoc spring values — reuse variants from `frontend/src/utils/animations/variants.ts`. Always respect `useReducedMotion()`.
→ [obsidian/04-Patterns/Framer Motion Variants.md](../../obsidian/04-Patterns/Framer%20Motion%20Variants.md)

### AI Service Auth (Provider + Auth Mode)

**When**: any service that calls Claude/Anthropic OR OpenAI APIs.
**Don't**: instantiate `Anthropic(api_key=...)`, `AsyncAnthropic(...)`, or `openai.OpenAI(...)` directly — always use the `create()` async factory. It resolves `AppSettings.agent_provider` first, then the matching key via `resolve_active_provider_api_key()`. Three runtime configs: Anthropic+API-key, Anthropic+subscription ([`claude-agent-sdk`](../../obsidian/03-Integrations/claude-agent-sdk.md)), or OpenAI+API-key. Never hardcode model IDs — read from settings.
→ [obsidian/04-Patterns/AI Service Auth.md](../../obsidian/04-Patterns/AI%20Service%20Auth.md)
+ [create() Factory Pattern](../../obsidian/04-Patterns/create()%20Factory%20Pattern.md),
[OpenAI API](../../obsidian/03-Integrations/OpenAI%20API.md),
[OpenAIAgentRunner](../../obsidian/01-Backend/agent/OpenAIAgentRunner.md)

### Windows Desktop Toast Notifications

**When**: any feature that sends desktop toasts on Windows.
**Don't**: use Tauri's notification plugin or `notify_rust` for the icon — use `winotify` from the Python backend with the `TradingAgent` AUMID.
→ [obsidian/04-Patterns/Windows Toast Notifications.md](../../obsidian/04-Patterns/Windows%20Toast%20Notifications.md)
+ [AUMID Configuration](../../obsidian/04-Patterns/AUMID%20Configuration.md)

### ATK Trade Tool Hook

**When**: ATK adds a new write tool (any `place_*`, `cancel_*`, `amend_*`, `set_leverage`, `transfer`, `_create_order`, `_stop_order`).
**Don't**: let a write tool reach OKX without going through `atk_pretool_hook`. Add its bare name to the matching set in `backend/app/agent/okx_atk/tool_curation.py` (`ATK_PLACE_TOOLS` / `ATK_CANCEL_TOOLS` / `ATK_TRANSFER_TOOLS` / `ATK_LEVERAGE_TOOLS`). Unknown write tools fall through to DENY — that's the contract.
→ [`backend/app/agent/okx_atk/risk_hook.py`](../../backend/app/agent/okx_atk/risk_hook.py)

The hook fires identically for both runtimes:
- Anthropic: `HookMatcher("mcp__okx__*")` in `trading_agent.py` `ClaudeAgentOptions.hooks`.
- OpenAI: inline call from `openai_bridge.invoke_atk_tool` before the proxy.

The same `RiskManager.assess_trade_risk` returns scoring (`AVOID|CAUTION|PROCEED`). Hook denies AVOID; CAUTION and PROCEED both allow. For tool-shape-specific gates (transfer USD cap, leverage cap), see the per-category branches in `risk_hook.atk_pretool_hook`.

### Chat-Session Features — No UI Gaps

**When**: any feature that creates an `AgentSession` or writes `AgentSessionMessage` documents.
**Don't**: ship without auditing every leg of the 10-point checklist — writing to the DB is necessary but NOT sufficient (live stream, sidebar spinner, in-place updates, completion toast, failure visibility, strategy shadow, etc.).
→ **[obsidian/04-Patterns/Chat-Session Checklist.md](../../obsidian/04-Patterns/Chat-Session%20Checklist.md)** (read in full before shipping)
+ [persist_session_message Pattern](../../obsidian/04-Patterns/persist_session_message%20Pattern.md),
[Chat-Session Lifecycle](../../obsidian/00-Architecture/Chat-Session%20Lifecycle.md)

**Subagent rule**: subagents are pure compute, return dicts, do NOT create their own `AgentSession`. The parent's session captures the timeline via tool-call bubbles.
