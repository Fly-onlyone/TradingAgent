---
tags: [frontend, api]
---

# Endpoint Modules

> One module per domain under `frontend/src/api/endpoints/`. Each exports a `xxxApi` object with async methods that call the shared `apiClient`.

## Source

- `frontend/src/api/endpoints/*.ts`
- Barrel: `frontend/src/api/endpoints/index.ts`

## Modules

| Module | Export | Backend prefix |
|---|---|---|
| `auth.ts` | `authApi` | `/auth/*` |
| `trades.ts` | `tradesApi` | `/orders/trades*` |
| `orders.ts` | `ordersApi` | `/orders/*` |
| `strategies.ts` | `strategiesApi` | `/strategies/*` |
| `knowledge.ts` | `knowledgeApi` | `/knowledge/*` |
| `news.ts` | `newsApi` | `/news/*` |
| `notifications.ts` | (exports types) | `/notifications/*` |
| `dashboard.ts` | `dashboardApi` | `/dashboard/*` |
| `logs.ts` | `logsApi` | `/admin/logs/*` |
| `admin.ts` | `adminApi` | `/admin/collections*`, `/admin/db-info`, `/admin/bulk-clear` |
| `backup.ts` | (backup ops) | `/backup/*` |
| `memory.ts` | `memoryApi` | `/agent/memories/*` |
| `strategyDiscovery.ts` | `strategyDiscoveryApi` | `/admin/strategy-discovery/*` |
| `decisions.ts`, `tasks.ts`, `sessions.ts`, `market.ts`, `settings.ts` | resp. | — |

## See also

- [[_index]]
- [[HTTP Client Interceptor]]
- [[snake_case to camelCase]]
