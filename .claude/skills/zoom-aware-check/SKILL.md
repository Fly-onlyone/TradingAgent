---
name: zoom-aware-check
description: Scans frontend/src for CSS-zoom violations — plain MUI <Select>, anchorEl-based <Menu>, or getBoundingClientRect / e.clientX|Y usage that forgets to divide by uiScale. Run before PR on any frontend change that touches dropdowns, menus, popovers, or mouse-coordinate logic.
---

# Zoom-Aware Check

The app uses CSS `zoom` for UI scaling, which breaks
`getBoundingClientRect()`-based positioning. `.claude/rules/code-guide.md`
has the canonical pattern under "CSS Zoom Handling".

## What to scan for

### 1. Plain MUI `<Select>` — must use `ZoomAwareSelect`

```bash
grep -rn 'from "@mui/material".*Select\b\|^import.*Select.*from "@mui/material"' frontend/src/
grep -rn '<Select\b' frontend/src/ | grep -v 'ZoomAwareSelect'
```

Any `<Select>` NOT imported as `ZoomAwareSelect` from
`@/components/common/ZoomAwareSelect` is a violation.

**Fix**: swap to `<ZoomAwareSelect>` (drop-in replacement).

### 2. `<Menu>` anchored via `anchorEl` — must use `useZoomAwareMenu`

```bash
grep -rn 'anchorEl=' frontend/src/
```

Any `<Menu anchorEl={...} />` not wired through
`useZoomAwareMenu()` from `@/hooks/useZoomAwareMenu` is a violation.

**Fix**: replace with `useZoomAwareMenu()` hook (see example in
`.claude/rules/code-guide.md`).

### 3. Raw `getBoundingClientRect()` — must divide by `uiScale`

```bash
grep -rn 'getBoundingClientRect' frontend/src/ -A 5 | grep -v 'uiScale\|/ scale\|// safe:'
```

If coords are used absolutely (not ratios like `(x - rect.left) / rect.width`),
they must be divided by `uiScale` from `@/store/uiStore`.

**Safe patterns (no fix needed)**:
- Ratio math: `(e.clientX - rect.left) / rect.width`
- Offsets within the same zoomed parent

### 4. Raw mouse coords — `e.clientX` / `e.clientY` without scale

```bash
grep -rn 'e\.clientX\|e\.clientY\|event\.clientX\|event\.clientY' frontend/src/ -A 2 | grep -v 'uiScale\|/ scale'
```

Any absolute use for positioning must divide by `uiScale`.

### 5. Framer Motion `MotionValue` cursor tracking

```bash
grep -rn 'useMotionValue\|useTransform' frontend/src/ -A 3
```

When transforming cursor position, must `useTransform(x, v => v / uiScale)`
BEFORE `useSpring`.

## Output shape

```
# Zoom-Aware Check

## Violations
- frontend/src/components/Foo.tsx:42 — plain <Select> (should be ZoomAwareSelect)
- frontend/src/hooks/useBar.ts:17 — anchorEl without useZoomAwareMenu
- ...

## Possibly safe (verify manually)
- frontend/src/components/Baz.tsx:90 — getBoundingClientRect used as ratio (OK)

## Clean
- No anchorEl, getBoundingClientRect, or e.clientX violations found
  in <changed files>.
```

Always cite `file:line`. Reference
`.claude/rules/code-guide.md → Pattern: CSS Zoom Handling`
when explaining a violation.
