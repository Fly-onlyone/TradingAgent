---
tags: [backend, api, settings, admin]
---

# Settings Endpoints

> Superuser-only configuration over the singleton [[AppSettings Model]] under `/settings`.

## Source

- `backend/app/api/v1/settings.py`

## How it works

Every handler requires `get_current_superuser`. Read endpoints mask secrets (`get_*_api_key()` → `***last4`); `reveal` endpoints return cleartext for the modal that edits them. Writes encrypt secrets via [[Fernet Encryption]] (`encrypt_secret_value`) before saving. Connection-test endpoints round-trip the configured creds against the real service (Anthropic, OKX, Brave Search, Apprise) and return `{success, message}`. CLI-login endpoints stream the Claude Code `login`/`logout` subprocess via `StreamingResponse` so the modal can show live output. `installed-apps` invokes [[Installed Apps Scanner]]. `system-processes` lists running processes.

## Endpoints

- `GET/PUT /settings/agent` — model + auth_mode + thinking budget
- `GET /settings/agent/models` — selectable model list
- `POST /settings/agent/test` / `…/cli-login` / `…/cli-logout` / `…/cli-login-status`
- `GET/PUT /settings/embedding` + `…/model`
- `GET/PUT /settings/strategy-discovery` — cadence + min confidence + max sources
- `POST /settings/strategy-discovery/run-now` — SSE-streamed manual cycle
- `GET/PUT/POST /settings/exchange/*` — OKX creds + test
- `GET/PUT/POST /settings/brave-search/*` — Brave API key + test
- `GET/PUT /settings/auth` / `…/session-retention` / `…/autostart`
- `GET/PUT /settings/notifications/native` / `…/apprise` / `POST …/apprise/test`
- `GET /settings/system-processes` / `…/installed-apps`

## Depends on

- [[AppSettings Model]]
- [[Fernet Encryption]]
- [[Strategy Discovery Service]]
- [[Installed Apps Scanner]]

## See also

- [[_index]]
