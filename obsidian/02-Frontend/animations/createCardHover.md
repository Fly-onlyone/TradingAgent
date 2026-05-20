---
tags: [frontend, animations]
---

# createCardHover

> Factory: returns `rest` / `hover` / `tap` variants for interactive cards, parameterised by the theme's `primaryRgb` so the glow matches the active preset.

## Source

- `frontend/src/utils/animations/variants.ts`

## How it works

```ts
createCardHover(primaryRgb = "249, 115, 22")
// rest:  y: 0, scale: 1, base shadow
// hover: y: -8, scale: 1.03, shadow + primary-colored glow
// tap:   scale: 0.98
```

Each transition is `spring.snappy` (400/30). The primary-tinted halo on hover makes cards feel "alive" without overpowering the content.

```tsx
import { motion } from "framer-motion";
import { useTheme } from "@mui/material/styles";
import { createCardHover } from "@/utils/animations/variants";

function Card() {
  const theme = useTheme();
  const variants = createCardHover(theme.trading.primaryRgb);
  return (
    <motion.div variants={variants} initial="rest" whileHover="hover" whileTap="tap">
      ...
    </motion.div>
  );
}
```

## Depends on

- [[Spring Configs]]
- [[MUI Theme]]
