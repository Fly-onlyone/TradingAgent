---
tags: [frontend, animations]
---

# slideIn

> Directional slide-in variants for side panels and drawers — `left`, `right`, `bottom`.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

Each direction starts 60px off-axis at `opacity: 0` and springs back (400/30):

```ts
slideIn.left   = { initial: { opacity: 0, x: -60 }, animate: { opacity: 1, x: 0, ... } }
slideIn.right  = { initial: { opacity: 0, x:  60 }, animate: { opacity: 1, x: 0, ... } }
slideIn.bottom = { initial: { opacity: 0, y:  60 }, animate: { opacity: 1, y: 0, ... } }
```

Use for sidebars, contextual panels, bottom sheets. No `exit` defined — wrap in `<AnimatePresence>` only if you intend to mirror the entry.

```tsx
import { motion } from "framer-motion";
import { slideIn } from "@/utils/animations/variants";

<motion.aside variants={slideIn.right} initial="initial" animate="animate">
  ...
</motion.aside>
```

## Depends on

- [[Spring Configs]]
