---
tags: [frontend, components, common, css-zoom]
---

# ZoomAwareAutocomplete

> Drop-in MUI `<Autocomplete>` wrapper that keeps dropdown width and list height stable under CSS `zoom`.

## Source

- `frontend/src/components/common/ZoomAwareAutocomplete.tsx`

## How it works

Replaces MUI's default Popper with a `forwardRef`'d `ZoomAwareAutocompletePopper`.
The custom Popper reads the anchor's `clientWidth` and multiplies by `uiScale`
(from [[uiStore]]) so the dropdown matches the visually-zoomed input. It also
clamps `maxHeight` so long option lists don't overflow the viewport after the
parent zoom transform is applied.

## Depends on

- [[uiStore]]
- MUI `<Autocomplete>` / `<Popper>`

## Used by

- Symbol pickers in [[Trading Route]] and [[Trades Route]], multi-select fields in [[Settings Route]] and [[Tasks Route]]

## Gotchas

- The global MUI theme overrides `MuiPopper` to re-apply inverse zoom; this wrapper handles size math specifically for Autocomplete's measured width.

## See also

- [[CSS Zoom Handling]]
- [[ZoomAwareSelect]]
