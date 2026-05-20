---
tags: [frontend, components, settings]
---

# Settings Components

> UI for the [[Settings Route]] — notification providers, channels, process picker.

## Source

- `frontend/src/components/settings/`

## Members

- `notificationProviders.tsx` — provider catalog (Apprise, Telegram, Discord, etc.) + per-provider field definitions
- `AppriseConfigCard.tsx` — Apprise-specific URL/tags editor card
- `SavedChannelsList.tsx`, `PendingChannelsList.tsx` — saved vs unconfirmed notification channels
- `ProviderChannelForm.tsx` — generic form rendered from `notificationProviders` metadata
- `ProcessSelectorDialog.tsx` — Windows process picker (for autostart, watchdog targets)

## How it works

`notificationProviders.tsx` is the source of truth for which provider types exist
and which fields each requires; `ProviderChannelForm` reads that metadata to render
the right inputs. Saving a channel hits `/api/v1/notifications/channels/...`.

## See also

- [[_index]]
- [[Notification Service]]
