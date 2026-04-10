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
