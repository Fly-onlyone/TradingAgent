---
tags: [frontend, animations]
---

# fadeInUp

> Single-element entry — gentle 20px upward fade. The simplest "this just appeared" gesture.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
hidden:  { opacity: 0, y: 20 }
visible: { opacity: 1, y: 0, transition: spring.gentle }
```

Uses `spring.gentle` (200/25) so the settle feels deliberate — appropriate for headers, hero copy, callouts. For lists of items, use [[staggerCascade]] or [[listStagger]] instead so each item gets its own moment.

```tsx
import { motion } from "framer-motion";
import { fadeInUp } from "@/utils/animations/variants";

<motion.h2 variants={fadeInUp} initial="hidden" animate="visible">
  Welcome back
</motion.h2>
```

## Depends on

- [[Spring Configs]]
