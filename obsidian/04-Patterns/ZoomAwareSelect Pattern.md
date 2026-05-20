---
tags: [pattern]
---

# ZoomAwareSelect Pattern

> Drop-in replacement for MUI `<Select>` that positions its dropdown correctly under CSS `zoom`.

## When to apply

Any time you reach for `import { Select } from "@mui/material"`. Always import [[ZoomAwareSelect]] instead.

## The pattern

```tsx
import { ZoomAwareSelect } from "@/components/common/ZoomAwareSelect";

<ZoomAwareSelect value={x} onChange={handleChange}>
    <MenuItem value="a">A</MenuItem>
</ZoomAwareSelect>
```

## Why

Plain MUI `<Select>` uses `anchorEl` + `getBoundingClientRect()` internally — under CSS `zoom` the dropdown lands at the wrong screen position.

## Don't

- Don't use plain MUI `<Select>` anywhere
- The `zoom-aware-check` skill scans for violations before PR

## See also

- [[_index]]
- [[CSS Zoom Handling]]
