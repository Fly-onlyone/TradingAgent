# ATK sidecar build scripts

These scripts bundle the [OKX Agent Trade Kit](https://github.com/okx/agent-trade-kit)
(`@okx_ai/okx-trade-mcp`) together with a pinned Node runtime into a single
directory per target platform under `frontend/src-tauri/binaries/`. Tauri's
installer picks each one up as a sidecar.

## Why we don't use Node SEA

Node Single Executable Applications would produce one `.exe` per platform,
but Windows code-signing of unsigned `node.exe` blobs is fragile (the SEA
output trips Windows Defender SmartScreen). Bundling a portable Node + a
frozen `node_modules` instead avoids that hole and keeps the install size
roughly the same after `xz` compression.

## Pins

- `atk-version.txt` — exact `@okx_ai/okx-trade-mcp` version.
- `node-version.txt` — exact Node release (e.g. `v22.11.0`).
- `atk-lock/package.json` + `atk-lock/package-lock.json` — committed lockfile
  used by `npm ci` for reproducible installs (NOT `npm install`).

## Prerequisites

- Node + npm on PATH (for the build host; the OUTPUT bundle is self-contained).
- `curl`, `tar`/`unzip`, `gpg` (for SHASUMS verification).
- `pnpm` is NOT used here — this is a standalone npm package install.

## Build (Linux / macOS)

```
bash frontend/src-tauri/scripts/build-atk-sidecar.sh "linux-x64 darwin-x64 darwin-arm64 win-x64"
```

## Build (Windows)

```
powershell -ExecutionPolicy Bypass -File frontend/src-tauri/scripts/build-atk-sidecar.ps1
```

## What the scripts produce

For each target:

```
frontend/src-tauri/binaries/okx-trade-mcp-<target>/
├── node/                       # portable Node runtime
│   ├── bin/node                # (POSIX)  or  node.exe  (Windows)
│   └── …
├── app/
│   └── node_modules/
│       └── @okx_ai/okx-trade-mcp/dist/index.js
├── launch.sh                   # POSIX launcher
└── launch.cmd                  # Windows launcher
```

`tauri.conf.json` references the per-target binaries via `bundle.externalBin`.
`backend/app/agent/okx_atk/process_manager.py::resolve_command` looks up the
sidecar via `TAURI_RESOURCE_DIR/binaries/okx-trade-mcp.{cmd|}` at runtime.

## Security

- Node archives are verified against `SHASUMS256.txt` (downloaded fresh from
  `nodejs.org/dist/`) AND `SHASUMS256.txt.asc` is GPG-verified with the Node
  release-team key.
- `npm ci` uses the committed lockfile (no surprise dep changes).
- `npm audit signatures` verifies the ATK package's npm provenance.

## Air-gapped builds

Pre-download archives into `frontend/src-tauri/vendor/node/` keyed by the
exact `node-<ver>-<arch>` filename. The scripts skip the network fetch when
the cached file is present (and still verify its SHA-256).
