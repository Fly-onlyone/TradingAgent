#!/usr/bin/env bash
# Build the ATK sidecar bundle (node runtime + @okx_ai/okx-trade-mcp).
# Produces one directory per target under frontend/src-tauri/binaries/.

set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
ATK_VER=$(cat "$SCRIPT_DIR/atk-version.txt")
NODE_VER=$(cat "$SCRIPT_DIR/node-version.txt")
TARGETS="${1:-linux-x64 darwin-x64 darwin-arm64 win-x64}"
OUT="$SCRIPT_DIR/../binaries"
VENDOR="$SCRIPT_DIR/../vendor/node"
LOCK="$SCRIPT_DIR/atk-lock"
mkdir -p "$OUT" "$VENDOR"

fetch_node() {
    local target="$1" archive
    case "$target" in
        linux-x64)    archive="node-${NODE_VER}-linux-x64.tar.xz" ;;
        darwin-x64)   archive="node-${NODE_VER}-darwin-x64.tar.gz" ;;
        darwin-arm64) archive="node-${NODE_VER}-darwin-arm64.tar.gz" ;;
        win-x64)      archive="node-${NODE_VER}-win-x64.zip" ;;
        *) echo "Unknown target: $target" >&2; exit 1 ;;
    esac
    local cached="$VENDOR/$archive"
    if [[ ! -f "$cached" ]]; then
        echo "Fetching $archive from nodejs.org"
        curl -fsSL "https://nodejs.org/dist/${NODE_VER}/${archive}" -o "$cached"
    fi
    # Always verify against SHASUMS256.txt (fresh download per build).
    local shasums="$VENDOR/SHASUMS256.${NODE_VER}.txt"
    if [[ ! -f "$shasums" ]]; then
        curl -fsSL "https://nodejs.org/dist/${NODE_VER}/SHASUMS256.txt" -o "$shasums"
        curl -fsSL "https://nodejs.org/dist/${NODE_VER}/SHASUMS256.txt.asc" -o "${shasums}.asc"
        gpg --verify "${shasums}.asc" "$shasums" \
            || { echo "Node SHASUMS GPG verify FAILED — refusing to bundle"; exit 2; }
    fi
    (cd "$VENDOR" && grep "  ${archive}\$" "SHASUMS256.${NODE_VER}.txt" | sha256sum -c -) \
        || { echo "Node ${archive} checksum FAILED — refusing to bundle"; exit 2; }
    echo "$cached"
}

for T in $TARGETS; do
    DIR=$(mktemp -d)
    pushd "$DIR" >/dev/null

    cp "$LOCK/package.json" "$LOCK/package-lock.json" . 2>/dev/null || true
    # If lock is missing, generate it once — but reviewer should commit it.
    if [[ ! -f package-lock.json ]]; then
        npm install --package-lock-only --no-audit --no-fund "@okx_ai/okx-trade-mcp@${ATK_VER}" >/dev/null
        echo "WARN: generated package-lock.json on the fly — commit it to atk-lock/ for reproducibility" >&2
    fi
    npm ci --no-audit --no-fund >/dev/null
    npm audit signatures || { echo "ATK npm signature verify FAILED — refusing to bundle"; exit 3; }

    archive=$(fetch_node "$T")
    case "$T" in
        win-x64) unzip -q "$archive" ;;
        *)       tar -xf "$archive" ;;
    esac

    BUNDLE="okx-trade-mcp-${T}"
    rm -rf "$OUT/$BUNDLE"
    mkdir -p "$BUNDLE/node" "$BUNDLE/app"
    cp -r node_modules "$BUNDLE/app/"

    case "$T" in
        win-x64) cp -r "node-${NODE_VER}-win-x64/"* "$BUNDLE/node/" ;;
        *)       cp -r "node-${NODE_VER}-${T}/"*    "$BUNDLE/node/" ;;
    esac

    cat > "$BUNDLE/launch.sh" <<'EOF'
#!/bin/sh
DIR=$(dirname "$0")
exec "$DIR/node/bin/node" "$DIR/app/node_modules/@okx_ai/okx-trade-mcp/dist/index.js" "$@"
EOF
    chmod +x "$BUNDLE/launch.sh"

    cat > "$BUNDLE/launch.cmd" <<'EOF'
@echo off
"%~dp0node\node.exe" "%~dp0app\node_modules\@okx_ai\okx-trade-mcp\dist\index.js" %*
EOF

    popd >/dev/null
    cp -r "$DIR/$BUNDLE" "$OUT/"
    echo "Built $OUT/$BUNDLE"
done
