---
tags: [frontend, animations]
---

# scrollReveal

> Scroll-triggered entry — same spring (300/30) in four directions for `whileInView` reveals.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

Four directional variants, each going 40px off-axis:

```ts
scrollReveal.up    // y:  40 → 0
scrollReveal.down  // y: -40 → 0
scrollReveal.left  // x: -40 → 0
scrollReveal.right // x:  40 → 0
```

Pair with `whileInView` and `viewport={{ once: true, margin: ... }}` so the reveal fires once when scrolled into view.

```tsx
import { motion } from "framer-motion";
import { scrollReveal } from "@/utils/animations/variants";

<motion.section
  variants={scrollReveal.up}
  initial="hidden"
  whileInView="visible"
  viewport={{ once: true, margin: "-80px" }}
>
  ...
</motion.section>
```

## Depends on

- [[Spring Configs]]

## See also

- [[Reduced Motion]]
