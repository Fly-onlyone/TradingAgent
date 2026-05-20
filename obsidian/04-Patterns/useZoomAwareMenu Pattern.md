---
tags: [pattern]
---

# useZoomAwareMenu Pattern

> Replacement for `anchorEl`-based MUI `<Menu>` — uses a ref + measured position that compensates for CSS `zoom`.

## When to apply

Any time you would have used `useState` + `anchorEl` to position a `<Menu>` against a button.

## The pattern

```tsx
import { Menu, MenuItem } from "@mui/material";
import { useZoomAwareMenu } from "@/hooks/useZoomAwareMenu";

function MyMenu() {
    const { anchorRef, open, handleOpen, handleClose, menuProps } = useZoomAwareMenu();
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

## Why

`anchorEl` reads `getBoundingClientRect()` which returns zoom-scaled coords; the hook divides them back to viewport space.

## Don't

- Don't pass `anchorEl` directly to `<Menu>` in this app

## See also

- [[_index]]
- [[CSS Zoom Handling]]
