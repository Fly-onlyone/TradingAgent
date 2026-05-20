---
tags: [frontend, animations]
---

# pageInstant

> A 100ms opacity fade for pages where a real entrance animation would feel sluggish.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
initial: { opacity: 0 }
animate: { opacity: 1, transition: { duration: 0.1, ease: "easeOut" } }
```

No transform, no spring — the cheapest possible "feels like it appeared" effect. Use this for high-density data pages (tables, dashboards) where the user is impatient, or as a stand-in when [[Reduced Motion]] is on.

```tsx
import { motion } from "framer-motion";
import { pageInstant } from "@/utils/animations/variants";

<motion.div variants={pageInstant} initial="initial" animate="animate">
  ...
</motion.div>
```

## See also

- [[pageEntrance]]
- [[Reduced Motion]]
