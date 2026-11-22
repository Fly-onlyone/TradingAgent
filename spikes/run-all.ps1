#requires -Version 7
<#
.SYNOPSIS
  Opens the three spike candidates at once so they can be compared by eye.
#>
$root = $PSScriptRoot
$fixtures = Join-Path $root 'fixtures'
$apps = @(
    Join-Path $root 'avalonia\publish\spike-avalonia.exe'
    Join-Path $root 'winui3\publish\spike-winui3.exe'
    Join-Path $root 'gpui\target\release\spike-gpui.exe'
)
foreach ($exe in $apps) {
    if (Test-Path $exe) {
        Start-Process -FilePath $exe -ArgumentList @('--fixtures', "`"$fixtures`"") -WorkingDirectory (Split-Path $exe)
    } else {
        Write-Warning "$exe is not built; see NOTES.md in its folder."
    }
}
