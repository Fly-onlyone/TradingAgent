---
tags: [frontend, animations]
---

# tabSwitch

> AnimatePresence variants for crossfading between tab panels — quick down/up motion, snappy in, fast tween out.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
initial: { opacity: 0, y: 10 }
animate: { opacity: 1, y: 0,  transition: { type: "spring", ...spring.snappy, duration: 0.2 } }
exit:    { opacity: 0, y: -10, transition: { duration: 0.15 } }
```

Wrap each panel in `<motion.div key={tabId} variants={tabSwitch} ... />` inside `<AnimatePresence mode="wait">` so only one panel is mounted at a time.

```tsx
import { AnimatePresence, motion } from "framer-motion";
import { tabSwitch } from "@/utils/animations/variants";

<AnimatePresence mode="wait">
  <motion.div key={activeTab} variants={tabSwitch} initial="initial" animate="animate" exit="exit">
    {panelFor(activeTab)}
  </motion.div>
</AnimatePresence>
```

## Depends on

- [[Spring Configs]]

## See also

- [[scaleIn]]
