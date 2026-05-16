# Build the ATK sidecar bundle on Windows.
# Produces frontend/src-tauri/binaries/okx-trade-mcp-win-x64/.
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$AtkVer    = (Get-Content "$ScriptDir/atk-version.txt").Trim()
$NodeVer   = (Get-Content "$ScriptDir/node-version.txt").Trim()
$Out       = Join-Path $ScriptDir "../binaries"
$Vendor    = Join-Path $ScriptDir "../vendor/node"
$Lock      = Join-Path $ScriptDir "atk-lock"
New-Item -ItemType Directory -Force -Path $Out, $Vendor | Out-Null

function Fetch-Node([string]$Target) {
    $archive = switch ($Target) {
        "win-x64"      { "node-$NodeVer-win-x64.zip" }
        "linux-x64"    { "node-$NodeVer-linux-x64.tar.xz" }
        "darwin-x64"   { "node-$NodeVer-darwin-x64.tar.gz" }
        "darwin-arm64" { "node-$NodeVer-darwin-arm64.tar.gz" }
        default        { throw "Unknown target: $Target" }
    }
    $cached = Join-Path $Vendor $archive
    if (-not (Test-Path $cached)) {
        Write-Host "Fetching $archive from nodejs.org"
        Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVer/$archive" -OutFile $cached
    }
    $shasums = Join-Path $Vendor "SHASUMS256.$NodeVer.txt"
    if (-not (Test-Path $shasums)) {
        Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVer/SHASUMS256.txt" -OutFile $shasums
        # NOTE: GPG verification of SHASUMS256.txt.asc requires gpg on PATH.
        # Document the prereq in scripts/README.md. CI windows-latest has gpg.
        $asc = "$shasums.asc"
        Invoke-WebRequest -Uri "https://nodejs.org/dist/$NodeVer/SHASUMS256.txt.asc" -OutFile $asc
        $gpg = (Get-Command gpg -ErrorAction SilentlyContinue)
        if ($gpg) {
            & gpg --verify $asc $shasums
            if ($LASTEXITCODE -ne 0) { throw "Node SHASUMS GPG verify FAILED" }
        } else {
            Write-Warning "gpg not on PATH — skipping GPG verify (still doing SHA-256 check)"
        }
    }
    $expected = (Get-Content $shasums | Where-Object { $_ -match "\s+$archive$" })
    if (-not $expected) { throw "Could not find $archive in SHASUMS256" }
    $expectedHash = ($expected -split "\s+")[0].ToLower()
    $actualHash   = (Get-FileHash $cached -Algorithm SHA256).Hash.ToLower()
    if ($expectedHash -ne $actualHash) { throw "Node $archive checksum FAILED" }
    return $cached
}

$Targets = if ($args.Count -gt 0) { $args } else { @("win-x64") }

foreach ($T in $Targets) {
    $work = New-Item -ItemType Directory -Force -Path (Join-Path $env:TEMP "atk-build-$T-$([guid]::NewGuid())")
    Push-Location $work
    try {
        Copy-Item "$Lock/package.json" "$Lock/package-lock.json" . -ErrorAction SilentlyContinue
        if (-not (Test-Path "package-lock.json")) {
            npm install --package-lock-only --no-audit --no-fund "@okx_ai/okx-trade-mcp@$AtkVer" | Out-Null
            Write-Warning "Generated package-lock.json on the fly — commit it to atk-lock/ for reproducibility"
        }
        npm ci --no-audit --no-fund | Out-Null
        npm audit signatures
        if ($LASTEXITCODE -ne 0) { throw "ATK npm signature verify FAILED" }

        $archive = Fetch-Node $T
        if ($T -eq "win-x64") {
            Expand-Archive -Path $archive -DestinationPath . -Force
        } else {
            # tar exists on Win10+
            tar -xf $archive
        }

        $bundle = Join-Path $Out "okx-trade-mcp-$T"
        if (Test-Path $bundle) { Remove-Item -Recurse -Force $bundle }
        New-Item -ItemType Directory -Force -Path "$bundle/node", "$bundle/app" | Out-Null
        Copy-Item -Recurse node_modules "$bundle/app/"
        $nodeDir = if ($T -eq "win-x64") { "node-$NodeVer-win-x64" } else { "node-$NodeVer-$T" }
        Copy-Item -Recurse "$nodeDir/*" "$bundle/node/"

        @'
@echo off
"%~dp0node\node.exe" "%~dp0app\node_modules\@okx_ai\okx-trade-mcp\dist\index.js" %*
'@ | Set-Content -Path "$bundle/launch.cmd" -Encoding ASCII

        @'
#!/bin/sh
DIR=$(dirname "$0")
exec "$DIR/node/bin/node" "$DIR/app/node_modules/@okx_ai/okx-trade-mcp/dist/index.js" "$@"
'@ | Set-Content -Path "$bundle/launch.sh" -Encoding ASCII

        Write-Host "Built $bundle"
    }
    finally {
        Pop-Location
    }
}
