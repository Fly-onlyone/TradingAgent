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
