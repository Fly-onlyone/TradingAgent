---
tags: [backend, api, users]
---

# Users Endpoints

> User preference read/write under `/users`. Account fields live on [[Auth Endpoints]] (`/auth/me`).

## Source

- `backend/app/api/v1/users.py`

## How it works

Trivially wraps two fields on [[User Model]] — `default_symbol` and `default_timeframe`. Both endpoints require an authenticated user via `get_current_active_user`; the user's own document is mutated directly. The frontend uses these to populate the initial chart and analysis panes.

## Endpoints

- `GET /users/me/preferences` — return `{default_symbol, default_timeframe}`
- `PUT /users/me/preferences` — partial update of the same two fields

## Depends on

- [[User Model]]
- [[Auth Endpoints]]

## See also

- [[_index]]
