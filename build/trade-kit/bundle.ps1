#requires -Version 7
<#
.SYNOPSIS
Puts the OKX trade kit, with a Node runtime of its own, next to a published build of the app.

.DESCRIPTION
The app looks for "atk\launch.cmd" in its own folder. With this bundle an installed app needs no Node
and no npm on the user's computer.

What is bundled is pinned and checked:
- the trade kit and everything it depends on, by package-lock.json; npm checks each package's
  registry signature;
- the Node runtime, by node-version.txt and the SHA-256 in node-win-x64.sha256, which is kept in this
  repository so that a changed download is refused whoever changed it.

The kit's install script is not run (--ignore-scripts). It would download two programs the app does
not use: the app hands the kit its key in the environment.

.PARAMETER OutputDirectory
The folder to write, for example "publish\atk". It is replaced when it exists.
#>
param(
    [Parameter(Mandatory)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'

$nodeVersion = (Get-Content (Join-Path $PSScriptRoot 'node-version.txt')).Trim()
if ($nodeVersion -notmatch '^v\d+\.\d+\.\d+$') { throw "Not a Node version: '$nodeVersion'" }
$expectedHash = (Get-Content (Join-Path $PSScriptRoot 'node-win-x64.sha256')).Trim()
if ($expectedHash -notmatch '^[0-9a-f]{64}$') { throw 'node-win-x64.sha256 does not hold a SHA-256.' }

$work = Join-Path ([IO.Path]::GetTempPath()) "trade-kit-$([guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Force -Path $work | Out-Null
try {
    Copy-Item (Join-Path $PSScriptRoot 'package.json'), (Join-Path $PSScriptRoot 'package-lock.json') $work
    Push-Location $work
    try {
        npm ci --ignore-scripts --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
        npm audit signatures
        if ($LASTEXITCODE -ne 0) { throw 'A package of the trade kit failed its registry signature check.' }
    }
    finally {
        Pop-Location
    }

    $entry = Join-Path $work 'node_modules\@okx_ai\okx-trade-mcp\dist\index.js'
    if (-not (Test-Path $entry)) { throw "The trade kit's entry file is not where it is expected: $entry" }

    $archive = "node-$nodeVersion-win-x64.zip"
    $download = Join-Path $work $archive
    Invoke-WebRequest -Uri "https://nodejs.org/dist/$nodeVersion/$archive" -OutFile $download
    $actualHash = (Get-FileHash $download -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { throw "The Node download does not match the pinned SHA-256. Expected $expectedHash, got $actualHash." }
    Expand-Archive -Path $download -DestinationPath (Join-Path $work 'node') -Force
    $nodeFolder = Join-Path $work "node\node-$nodeVersion-win-x64"

    if (Test-Path $OutputDirectory) { Remove-Item -Recurse -Force $OutputDirectory }
    New-Item -ItemType Directory -Force -Path (Join-Path $OutputDirectory 'node'), (Join-Path $OutputDirectory 'app') | Out-Null
    # The runtime alone: npm and the rest of the Node distribution are not needed to run the kit.
    Copy-Item (Join-Path $nodeFolder 'node.exe'), (Join-Path $nodeFolder 'LICENSE') (Join-Path $OutputDirectory 'node')
    Copy-Item -Recurse (Join-Path $work 'node_modules') (Join-Path $OutputDirectory 'app')

    @'
@echo off
"%~dp0node\node.exe" "%~dp0app\node_modules\@okx_ai\okx-trade-mcp\dist\index.js" %*
'@ | Set-Content -Path (Join-Path $OutputDirectory 'launch.cmd') -Encoding ascii

    $reported = & (Join-Path $OutputDirectory 'node\node.exe') --version
    if ($reported -ne $nodeVersion) { throw "The bundled Node reports '$reported', not '$nodeVersion'." }
    $size = (Get-ChildItem $OutputDirectory -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
    Write-Host ("Trade kit bundled in {0}: Node {1}, {2:N1} MB." -f $OutputDirectory, $nodeVersion, $size)
}
finally {
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
