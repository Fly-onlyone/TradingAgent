# Code Guide

## Code Patterns

### Pattern: CSS Zoom Handling

**When to Apply**: Any frontend component using MUI `<Select>`, `<Menu>`, popovers, or mouse
coordinates — the app uses CSS `zoom` for UI scaling, which breaks `getBoundingClientRect()`-based
positioning.

**Quick reference:**

| Component Type | Solution | Import |
|---|---|---|
| `<Select>` dropdown | Use `<ZoomAwareSelect>` (drop-in replacement) | `@/components/common/ZoomAwareSelect` |
| `<Menu>` anchored to button | Use `useZoomAwareMenu()` hook | `@/hooks/useZoomAwareMenu` |
| Popover (manual) | Divide `getBoundingClientRect()` coords by `uiScale` | `@/store/uiStore` |
| Mouse position for effects | Divide `e.clientX`/`e.clientY` by `uiScale` | `@/store/uiStore` |
| Framer Motion `MotionValue` cursor | `useTransform(x, v => v / uiScale)` before `useSpring` | `framer-motion` + `@/store/uiStore` |

**Key rules:**

- **Never** use plain MUI `<Select>` or `anchorEl`-based `<Menu>` — always use the zoom-aware variants
- Global theme overrides handle `MuiPopper` (with child re-zoom) and `MuiTooltip` automatically
- CSS vars `--ui-zoom` / `--ui-zoom-inverse` are available for custom overrides
- **Safe patterns** (no fix needed): ratio math like `(clientX - rect.left) / rect.width`, offsets within same parent

**Minimal example (`useZoomAwareMenu` for Menu):**

```tsx
import {Menu, MenuItem} from "@mui/material";
import {useZoomAwareMenu} from "@/hooks/useZoomAwareMenu";

function MyMenu() {
    const {anchorRef, open, handleOpen, handleClose, menuProps} = useZoomAwareMenu();

    return (
        <div ref={anchorRef}>
            <button onClick={handleOpen}>Open</button>
            <Menu open={open} onClose={handleClose} {...menuProps}>
                <MenuItem onClick={handleClose}>Option A</MenuItem>
            </Menu>
        </div>
    );
}
```

### Pattern: Frontend Component Animations

**When to Apply**: Every new React component in `frontend/src/`.

Always add Framer Motion entry animations to new components. Reuse variants from
`frontend/src/utils/animations/variants.ts` — never create ad-hoc spring values.

**Variant selection by component type:**

| Component Type      | Variant                             | Import        |
|---------------------|-------------------------------------|---------------|
| Page / route        | `pageEntrance`                      | `variants.ts` |
| Card in a grid/list | `staggerCascade` (container + item) | `variants.ts` |
| Table / list rows   | `listStagger` (container + item)    | `variants.ts` |
| Modal / dialog      | `scaleIn`                           | `variants.ts` |
| Panel sliding in    | `slideIn.left/right/bottom`         | `variants.ts` |
| Scroll-triggered    | `scrollReveal.up/down/left/right`   | `variants.ts` |
| Interactive card    | `createCardHover(primaryRgb)`       | `variants.ts` |

**Spring configs** (for custom transitions): `spring.snappy`, `spring.bouncy`, `spring.gentle`.

**Reduced motion**: Always respect `useReducedMotion()` hook — skip or shorten animations when true.

**Minimal example (card in a stagger grid):**

```tsx
import {motion} from "framer-motion";
import {staggerCascade} from "@/utils/animations/variants";

<motion.div variants={staggerCascade.container} initial="hidden" animate="visible">
    {items.map((item) => (
        <motion.div key={item.id} variants={staggerCascade.item}>
            ...
        </motion.div>
    ))}
</motion.div>
```

### Pattern: AI Service Auth (Subscription vs API Key)

**When to Apply**: Any service that calls Claude/Anthropic APIs.

**Key rule**: NEVER use `Anthropic(api_key=...)` or `AsyncAnthropic(api_key=...)` directly without
a subscription fallback. The app supports two auth modes:
- `api_key`: Direct Anthropic API key (stored encrypted in DB or env var)
- `subscription`: Claude Code CLI credentials (no API key needed)

**Required pattern** — use a `create()` async factory with dual mode:

```python
class MyService:
    def __init__(self, api_key: str = "", use_sdk: bool = False):
        self._use_sdk = use_sdk
        if api_key and not use_sdk:
            from anthropic import Anthropic
            self._client = Anthropic(api_key=api_key)
        else:
            self._client = None

    @classmethod
    async def create(cls) -> "MyService":
        from app.agent.auth import resolve_anthropic_api_key
        api_key = await resolve_anthropic_api_key()
        if api_key:
            return cls(api_key=api_key)
        return cls(use_sdk=True)  # Subscription mode via ClaudeSDKClient
```

| Service | Auth pattern | Notes |
|---------|-------------|-------|
| `StrategyExtractor` | Dual-mode factory | `_extract_via_api` / `_extract_via_sdk` |
| `TradeLearner` | Dual-mode factory | Same pattern |
| `NewsSummarizer` | Dual-mode factory | `_call_claude` / `_call_via_sdk` |
| `context_generator` | Graceful skip | Returns `None` when no key |
| `TradingAgent`, subagents | `ClaudeSDKClient` only | Always works with subscription |

### Pattern: Windows Desktop Toast Notifications

**When to Apply**: Any feature that sends desktop toast notifications on Windows.

**Key rule**: Use `winotify` from the Python backend (same as ZZZ Bot). Do NOT use
Tauri's notification plugin or `notify_rust` — their `icon` property is Android/Linux
only and does nothing on Windows.

**How Windows toast icons work:**

| Icon position | Source | How to set |
|---------------|--------|------------|
| Content icon (left of title/body) | `winotify` `icon=` parameter | Absolute path to `.ico` or `.png` |
| Title icon (tiny, next to app name) | Windows AUMID lookup | Start Menu shortcut with matching `System.AppUserModel.ID` |

**AUMID rules:**
- The `app_id` in `winotify.Notification()` must match the shortcut's AUMID exactly
- NSIS installer sets AUMID from `tauri.conf.json` `identifier` — but if Windows caches
  a broken state for that ID, you need a different one
- Current working AUMID: `TradingAgent` (set in `desktop_notify.py`)
- `ensure_notification_shortcut()` patches the AUMID on first run via `pywin32`
- NEVER clear Windows icon cache (`ie4uinit.exe -ClearIconCache` + explorer restart)
  unless absolutely necessary — it breaks ALL app toast title icons until cache rebuilds

**Implementation**: `backend/app/services/desktop_notify.py`
- Hooked into `NotificationService.create_notification()` via `_send_desktop_toast()`
- Runs in `asyncio.to_thread()` to avoid blocking the event loop
- Icon resolved from `frontend/src-tauri/icons/` (dev) or `icons/` next to exe (production)

### Pattern: Chat-Session Features — No UI Gaps

**When to Apply**: Any feature that creates an `AgentSession` or writes
`AgentSessionMessage` documents (subagents, background cycles, scheduled
agents, AI merge, etc.). Writing to the DB is necessary but NOT sufficient.

**Required checklist before shipping a chat-session feature:**

| Leg | Requirement | How |
|---|---|---|
| Persistence | Insert messages via `persist_session_message()` (or `persist_session_message_doc()` if you need the inserted id for in-place updates) | `backend/app/db/models/agent_session.py:persist_session_message_doc` |
| Live stream | Broadcast a WebSocket event on every insert | `manager.send_to_user(_agent_channel_user_id(user_id), {...})` with `type: "message"` and outer `session_id`. User-channel hash is `hash(str(user.id)) % 1000000` — must match `_get_user_id_int` in `backend/app/api/websocket/agent.py:110` |
| Sidebar spinner | Multi-message runs set `keep_running: true` on the WS payload | Frontend auto-clears `activeRunSessionId` (sidebar `<CircularProgress>`) on every assistant message unless `keep_running` is true. Clear by broadcasting a FINAL message without the flag. |
| In-place updates | For cards that transition state (running → saved), mutate the existing row + emit `message_updated` | Don't insert a second row. Capture `document.id` on first insert, later `AgentSessionMessage.get(id)` → mutate `content`/`tool_calls` → `doc.save()` → `_broadcast_message_updated(...)`. Frontend `useAgentSocket` routes the event through `updateMessage(sessionId, id, patch)`. |
| Message id on wire | REST `MessageResponse` and frontend `SessionMessage` type MUST carry `id` | Needed for in-place updates AND for merge-on-hydrate dedup. Frontend dedups by 24-char hex DB id; REST-fetched rows win over local state when both have the same id (DB is canonical). |
| Suppress Claude CLI hooks | Every `ClaudeAgentOptions(...)` passes `extra_args={"setting-sources": "local"}` | Without it, the user-level Stop hook fires a toast on every subagent turn. Audit: `grep -n 'ClaudeAgentOptions(' backend/` — every hit must include this flag. |
| Completion toast | Fire `NotificationService.create_notification(type=TASK_COMPLETED, session_id=...)` on success and `TASK_FAILED` on failure | Hooks into `desktop_notify._send_desktop_toast` (winotify on Windows). Pass session id so the toast deep-links. |
| Failure visibility | Wrap the cycle body in try/except that flips any "running" row to failed | Stuck rows come from crashes that never updated status. Plus add a startup hook that flips orphan running rows (see `task_scheduler._mark_orphaned_discovery_cycles_failed`). |
| UI surfaces | Every place listing cycles/runs: animated spinner on in-flight rows + `setSelectedSessionId(id)` click-through | `setSelectedSessionId(id)` + `navigate({to: "/agent"})`. `StrategyDiscoveryCard` is the reference. |
| Strategy shadow (if applicable) | If the feature creates `StrategyKnowledge`, it MUST also create a `Strategy` shadow doc owned by a real user | `Strategy` is what the Strategies page reads. Scheduler-triggered runs need to resolve a superuser user_id first — passing `user_id=None` silently skips the shadow. |

**Subagent pattern**: Match the existing TechnicalAnalyst / NewsAnalyst /
FundamentalAnalyst pattern — subagents are pure compute, they return dicts,
they do NOT create their own `AgentSession`. The parent's session captures
the timeline via delegation tool-call bubbles. Creating a session per
subagent clutters the chat sidebar and does not match the codebase.

**Reference incidents (all fixed):**
- Strategy auto-discovery launched with leg 1 only — messages persisted but
  not broadcast → chat appeared frozen during live runs. Fix: add broadcasts.
- Each Extractor created its own `AgentSession` → 30+ "Strategy Extract —
  X" rows cluttered the sidebar. Fix: make extractors pure compute per above.
- `message_id` missing on REST `SessionMessage` → two bubbles per article
  ("running" then "saved") because `update_delegation_status` couldn't find
  the row to mutate. Fix: thread id through REST/WS/store.
- Merge-on-hydrate used `(role, content, timestamp)` key → in-place mutated
  messages kept both old and new copies with the same React key. Fix: dedup
  by DB ObjectId first, semantic key only for ids that aren't 24-char hex.
- Scheduler path skipped the Strategy shadow doc because it passed
  `user_id=None` → Strategies page stayed empty. Fix: resolve first
  superuser in `_run_strategy_discovery`.
- Every `ClaudeAgentOptions` except the main `TradingAgent` leaked the
  user's Claude Code Stop hook as a toast on every subagent completion.
  Fix: add `extra_args={"setting-sources": "local"}` to all 8 SDK callers.

**When adding a new surface (card, page, admin route) that references chat
sessions:** audit every applicable leg in the table above before merging.
If any leg is missing, either add it or flag a follow-up in the plan
explicitly.
