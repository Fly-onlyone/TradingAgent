---
tags: [pattern]
---

# Manual Popover Zoom Division

> When positioning a popover manually, divide `getBoundingClientRect()` coords by `uiScale` from `uiStore`.

## When to apply

Custom popovers, tooltips, or absolutely-positioned overlays that don't use MUI's portal system.

## The pattern

```tsx
import { useUIStore } from "@/store/uiStore";

const uiScale = useUIStore((s) => s.uiScale);
const rect = anchor.getBoundingClientRect();
const left = rect.left / uiScale;
const top = rect.bottom / uiScale;
```

For mouse events:

```tsx
const x = e.clientX / uiScale;
```

## Why

CSS `zoom` scales `clientX/Y` and `getBoundingClientRect()` results but fixed-position overlays render in unscaled viewport space.

## Don't

- Don't forget mouse coords — `e.clientX` and `e.clientY` also need division
- Safe patterns (no fix needed): ratio math like `(clientX - rect.left) / rect.width`

## See also

- [[_index]]
- [[CSS Zoom Handling]]
