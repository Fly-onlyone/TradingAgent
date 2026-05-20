---
tags: [frontend, utils]
---

# Validators

> Zod schemas for every form in the app — auth, strategies, settings, search, knowledge queries, password flows, agent settings.

## Source

- `frontend/src/utils/validators.ts`

## How it works

Each schema is a `z.object({...})` with field-level error messages; cross-field rules (password confirmation, conditional `apiKey`) use `.refine(...)`. Each schema exports an inferred type via `z.infer<typeof schema>` for use in React Hook Form `useForm<LoginInput>(...)` etc.

Schemas exported:

- `loginSchema`, `registerSchema`
- `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema`
- `strategySchema` — includes nested `riskParams` (position size, risk %, drawdown caps)
- `settingsSchema` — optional fields + nested `notifications` toggle group
- `searchSchema`, `knowledgeQuerySchema`
- `agentSettingsSchema` — conditional: `apiKey` required only when `authMode === "api_key"`

## Used by

- All forms under `pages/` using React Hook Form + `zodResolver`

## See also

- [[_index]]
