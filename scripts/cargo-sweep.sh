#!/usr/bin/env bash
# Trim Cargo artifacts older than 30 days across both crates.
# Invoked manually from the "Cargo Sweep" PyCharm run config.
set -u
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SWEEP="$HOME/.cargo/bin/cargo-sweep.exe"

for crate in "$PROJECT_ROOT/frontend/src-tauri" "$PROJECT_ROOT/tools/build-gui/src-tauri"; do
    if [[ -f "$crate/Cargo.toml" ]]; then
        echo "[cargo-sweep] $crate"
        "$SWEEP" sweep --time 30 "$crate" || true
    fi
done
echo "[cargo-sweep] done"
