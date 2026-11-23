---
tags: [desktop, operations, sentry, privacy]
---

# Desktop Crash Reporting

> The native app reports crashes, performance traces and log lines to the Sentry project
> `trading-agent-desktop` (organization `fly-theonlyone`). Reporting is on by default and has a
> switch.

## What it does

- **Where the address comes from**: the DSN is not in the repository. A build stamps it into the
  assembly from the `SENTRY_DSN` environment variable; a build without it sends nothing. A build
  with no stamped DSN also reads `SENTRY_DSN` at run time, which is how a local build is tested.
- **The switch**: setting `telemetry.enabled` (default true), on the Diagnostics page. Turning it
  off disposes the SDK at once. A first-run notice says that reports are sent and where the
  switch is.
- **What is sent**: errors, a start-up transaction for one start in ten
  (`TracesSampleRate = 0.1`), log lines as Sentry Logs, and Information-level breadcrumbs. The
  owner chose each of these.
- **Code**: `src/TradingAgent.App/Telemetry/` — `TelemetryService` (init, switch),
  `SentryScrubber` (one scrub function for events, transactions, breadcrumbs and logs),
  `SentryLoggerProvider` (bridge from `ILogger`), `TelemetryGate`.

## Privacy

Client side, before anything leaves the machine:

- `SendDefaultPii = false`; no machine name, no device name, no time zone.
- The user is an opaque install id (`telemetry.install_id`) and nothing else.
- Every text passes `Redactor`: keys and tokens are masked, and the user-profile path becomes
  `%USERPROFILE%`.
- Request cookies, bodies and query strings are removed; URLs lose query string and fragment.
- Module paths in `debug_meta` are cut to the file name.

Server side, in the project's Security & Privacy settings:

- Data Scrubber on, Use Default Scrubbers on, Prevent Storing of IP Addresses on.
- Advanced Data Scrubbing rule `[Remove] [Anything] from [$user.geo.**]`: without it Sentry still
  derives country and region from the sender's address.

## Gotchas

- **Do not turn privacy options on or add fields without the owner's say-so.** Each default in
  `TelemetryService.Initialize` is commented.
- `Sentry.Profiling` is not used: it fails Native AOT analysis.
- An ordinary build must never upload debug symbols; see [[Desktop Build Gotchas]].
- To check a change, press "Send test error" on the Diagnostics page, then confirm in Sentry that
  the event has no machine name, path, address or location.

## See also

- [[_index]]
- [[Desktop Release Pipeline]]
- [[Desktop Data Folder]]
- [[Sentry Setup]] — the old app (its projects were deleted on 2026-11-23)
