#requires -Version 7
<#
.SYNOPSIS
  Measures the three UI spike candidates on this machine and writes spikes/results/*.json.

.DESCRIPTION
  Per candidate:
    1. Start time: launches with --idle --marker N times; time from Start-Process to the
       first-frame marker the app writes. Run 1 is reported separately (file cache not warm).
    2. Idle memory: --idle, private bytes and working set after -IdleSeconds.
    3. Load: normal mode (chat stream + chart ticks). PresentMon traces -TraceSeconds of streaming
       while CPU and GPU use are sampled, then traces -ScrollSeconds of synthetic mouse-wheel
       scrolling over the orders table. Memory is sampled again at -LoadSeconds.
    4. Size: bytes on disk and zipped.

  The scroll step moves the mouse pointer and brings each app to the foreground. Do not use the
  machine while this runs. Close other heavy programs first.

.EXAMPLE
  pwsh spikes/measure.ps1
  pwsh spikes/measure.ps1 -Only gpui -StartRuns 5 -LoadSeconds 90
#>
param(
    [ValidateSet('avalonia', 'winui3', 'gpui')]
    [string[]]$Only,
    [int]$StartRuns = 10,
    [int]$IdleSeconds = 30,
    [int]$LoadSeconds = 300,
    [int]$TraceSeconds = 60,
    [int]$ScrollSeconds = 10,
    [switch]$SkipScroll
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$fixtures = Join-Path $root 'fixtures'
$results = Join-Path $root 'results'
New-Item -ItemType Directory -Force $results | Out-Null

$candidates = [ordered]@{
    avalonia = @{ Exe = Join-Path $root 'avalonia\publish\spike-avalonia.exe'; Ship = Join-Path $root 'avalonia\publish' }
    winui3   = @{ Exe = Join-Path $root 'winui3\publish\spike-winui3.exe'; Ship = Join-Path $root 'winui3\publish' }
    gpui     = @{ Exe = Join-Path $root 'gpui\target\release\spike-gpui.exe'; Ship = Join-Path $root 'gpui\target\release\spike-gpui.exe' }
}

$presentmon = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\presentmon.exe'
if (-not (Test-Path $presentmon)) { $presentmon = (Get-Command presentmon -ErrorAction SilentlyContinue)?.Source }
if (-not $presentmon) { Write-Warning 'PresentMon not found: frame pacing will not be measured.' }

Add-Type -Namespace Spike -Name Native -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extra);
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint flags);
[StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
'@
[void][Spike.Native]::SetProcessDPIAware()

# Keep the display on for the whole run (ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED).
# With the display off there is no vblank: DWM stops presenting and the apps fall back to slow frame
# timers, which makes start time, frame pacing, CPU and memory numbers meaningless. A one-pixel
# mouse move wakes a display that is already off.
[void][Spike.Native]::SetThreadExecutionState([uint32]'0x80000003')
[Spike.Native]::mouse_event(0x0001, 1, 0, 0, [UIntPtr]::Zero)
[Spike.Native]::mouse_event(0x0001, [uint32]::MaxValue, 0, 0, [UIntPtr]::Zero) # -1 as DWORD
Start-Sleep -Seconds 2

function Get-Percentile([double[]]$Values, [double]$P) {
    if (-not $Values -or $Values.Count -eq 0) { return $null }
    $sorted = $Values | Sort-Object
    $index = [Math]::Min($sorted.Count - 1, [Math]::Max(0, [Math]::Ceiling($P / 100 * $sorted.Count) - 1))
    return [Math]::Round($sorted[$index], 2)
}

function Stop-App($Process) {
    if ($Process -and -not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        [void]$Process.WaitForExit(5000)
    }
}

function Start-App([string]$Exe, [string[]]$ExtraArgs) {
    $argList = @('--fixtures', "`"$fixtures`"") + $ExtraArgs
    return Start-Process -FilePath $Exe -ArgumentList $argList -WorkingDirectory (Split-Path $Exe) -PassThru
}

function Get-Memory($Process) {
    $Process.Refresh()
    return @{
        private_mb     = [Math]::Round($Process.PrivateMemorySize64 / 1MB, 1)
        working_set_mb = [Math]::Round($Process.WorkingSet64 / 1MB, 1)
    }
}

function Measure-Start([string]$Name, [string]$Exe, [int]$Runs) {
    $times = @()
    for ($i = 1; $i -le $Runs; $i++) {
        $marker = Join-Path $env:TEMP "spike-marker-$Name-$i.txt"
        Remove-Item $marker -ErrorAction SilentlyContinue
        $t0 = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $p = Start-App $Exe @('--idle', '--marker', "`"$marker`"")
        $deadline = (Get-Date).AddSeconds(30)
        $text = $null
        while ((Get-Date) -lt $deadline) {
            if (Test-Path $marker) {
                $text = (Get-Content $marker -Raw -ErrorAction SilentlyContinue)
                if ($text -and $text.Trim() -match '^\d{13}$') { break }
            }
            if ($p.HasExited) { break }
            Start-Sleep -Milliseconds 20
        }
        Stop-App $p
        if ($text -and $text.Trim() -match '^\d{13}$') {
            $times += ([int64]$text.Trim() - $t0)
        } else {
            Write-Warning "$Name run ${i}: no first-frame marker within 30 s"
        }
        Remove-Item $marker -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 800
    }
    $warm = @($times | Select-Object -Skip 1)
    return @{
        runs_ms        = $times
        first_run_ms   = ($times | Select-Object -First 1)
        warm_median_ms = (Get-Percentile $warm 50)
        warm_min_ms    = ($warm | Measure-Object -Minimum).Minimum
        warm_max_ms    = ($warm | Measure-Object -Maximum).Maximum
    }
}

function Start-Trace([string]$Name, [string]$ProcessName, [int]$Seconds, [string]$Csv) {
    if (-not $presentmon) { return $null }
    Remove-Item $Csv -ErrorAction SilentlyContinue
    # No process filter. Avalonia and WinUI 3 draw through the system compositor and own no swap
    # chain, so only DWM's presents show what reached the screen for all three candidates. A
    # non-elevated tracer cannot resolve DWM's name (it reports "<unknown>"), so a name filter
    # would drop it; Read-Trace picks DWM out by process ID instead.
    $argList = @('--output_file', "`"$Csv`"",
        '--timed', $Seconds, '--terminate_after_timed', '--v1_metrics', '--no_console_stats',
        '--stop_existing_session', '--session_name', "spike_$Name")
    return Start-Process -FilePath $presentmon -ArgumentList $argList -PassThru -WindowStyle Hidden
}

function Get-TraceStat($Rows, [int]$Seconds) {
    if ($Rows.Count -eq 0) { return @{ frames = 0; note = 'PresentMon saw no presents from this process' } }
    $between = [double[]]@($Rows | Select-Object -Skip 1 | ForEach-Object { [double]$_.msBetweenPresents })
    $displayed = [double[]]@($Rows | Where-Object { $_.Dropped -ne '1' } | Select-Object -Skip 1 |
            ForEach-Object { [double]$_.msBetweenDisplayChange })
    return @{
        frames               = $Rows.Count
        presents_per_second  = [Math]::Round($Rows.Count / $Seconds, 1)
        dropped              = @($Rows | Where-Object { $_.Dropped -eq '1' }).Count
        frame_ms_p50         = (Get-Percentile $between 50)
        frame_ms_p95         = (Get-Percentile $between 95)
        frame_ms_p99         = (Get-Percentile $between 99)
        frame_ms_max         = (Get-Percentile $between 100)
        display_ms_p50       = (Get-Percentile $displayed 50)
        display_ms_p99       = (Get-Percentile $displayed 99)
        display_ms_max       = (Get-Percentile $displayed 100)
        displays_over_16_7ms = @($displayed | Where-Object { $_ -gt 16.7 }).Count
        displays_over_33_4ms = @($displayed | Where-Object { $_ -gt 33.4 }).Count
        # Stream updates arrive every 50 ms; a gap past 83.4 ms means one came two 60 Hz frames late.
        displays_over_83_4ms = @($displayed | Where-Object { $_ -gt 83.4 }).Count
        present_modes        = @($Rows | Group-Object PresentMode | ForEach-Object { "$($_.Name) x$($_.Count)" })
    }
}

function Read-Trace([string]$Csv, [int]$Seconds, [string]$ProcessName) {
    if (-not $Csv -or -not (Test-Path $Csv)) { return @{ error = 'no trace file' } }
    $rows = @(Import-Csv $Csv)
    $dwmIds = @(Get-Process dwm -ErrorAction SilentlyContinue | ForEach-Object { "$($_.Id)" })
    $appRows = @($rows | Where-Object { $_.Application -eq $ProcessName })
    $dwmRows = @($rows | Where-Object { $_.ProcessID -in $dwmIds })
    return @{
        app = (Get-TraceStat $appRows $Seconds)
        dwm = (Get-TraceStat $dwmRows $Seconds)
        # Presents from anything else on screen: these also make DWM compose, so they are noise.
        other_presents = $rows.Count - $appRows.Count - $dwmRows.Count
    }
}

function Get-GpuPercent([int]$ProcessId) {
    try {
        $samples = (Get-Counter "\GPU Engine(pid_${ProcessId}_*engtype_3D)\Utilization Percentage" -ErrorAction Stop).CounterSamples
        return [Math]::Round(($samples | Measure-Object CookedValue -Sum).Sum, 1)
    } catch { return $null }
}

# Runs as a thread job so the trace can be taken strictly inside the scrolling period; a trace
# that also covers the moments before and after scrolling counts the 50 ms stream cadence as
# slow frames.
$scrollBlock = {
    param([int64]$Handle, [int]$Seconds)
    $hwnd = [IntPtr]$Handle
    if ($hwnd -eq [IntPtr]::Zero) { return $false }
    $rect = New-Object 'Spike.Native+RECT'
    [void][Spike.Native]::GetWindowRect($hwnd, [ref]$rect)
    [void][Spike.Native]::SetForegroundWindow($hwnd)
    # Orders table: right of the 420/1400 chat pane, bottom 280/900 of the window.
    $x = [int]($rect.Left + ($rect.Right - $rect.Left) * 0.65)
    $y = [int]($rect.Bottom - ($rect.Bottom - $rect.Top) * 0.15)
    [void][Spike.Native]::SetCursorPos($x, $y)
    Start-Sleep -Milliseconds 300
    $watch = [Diagnostics.Stopwatch]::StartNew()
    $next = 0
    while ($watch.ElapsedMilliseconds -lt $Seconds * 1000) {
        if ($watch.ElapsedMilliseconds -ge $next) {
            # MOUSEEVENTF_WHEEL, one notch down; direction flips every 2 s so the list never ends.
            $direction = if ([int]($watch.ElapsedMilliseconds / 2000) % 2 -eq 0) { -120 } else { 120 }
            [Spike.Native]::mouse_event(0x0800, 0, 0, $direction, [UIntPtr]::Zero)
            $next += 8
        }
        [Threading.Thread]::Sleep(1)
    }
    return $true
}

function Measure-Load([string]$Name, [string]$Exe) {
    $processName = [IO.Path]::GetFileName($Exe)
    $p = Start-App $Exe @()
    $started = Get-Date
    try {
        Start-Sleep -Seconds 5
        $streamCsv = Join-Path $results "$Name-stream.csv"
        $trace = Start-Trace $Name $processName $TraceSeconds $streamCsv
        $p.Refresh()
        $cpu0 = $p.TotalProcessorTime
        $wall0 = Get-Date
        $gpu = @()
        while (((Get-Date) - $wall0).TotalSeconds -lt $TraceSeconds) {
            $sample = Get-GpuPercent $p.Id
            if ($null -ne $sample) { $gpu += $sample }
            Start-Sleep -Seconds 4
        }
        $p.Refresh()
        $cpuSeconds = ($p.TotalProcessorTime - $cpu0).TotalSeconds
        $wallSeconds = ((Get-Date) - $wall0).TotalSeconds
        if ($trace) { [void]$trace.WaitForExit(20000) }
        $stream = Read-Trace $streamCsv $TraceSeconds $processName
        $afterTrace = Get-Memory $p

        $scroll = @{ skipped = $true }
        if (-not $SkipScroll) {
            $scrollCsv = Join-Path $results "$Name-scroll.csv"
            $p.Refresh()
            $job = Start-ThreadJob -ScriptBlock $scrollBlock -ArgumentList ([int64]$p.MainWindowHandle), ($ScrollSeconds + 4)
            Start-Sleep -Milliseconds 1500
            $trace2 = Start-Trace $Name $processName $ScrollSeconds $scrollCsv
            if ($trace2) { [void]$trace2.WaitForExit(($ScrollSeconds + 20) * 1000) }
            $ok = Receive-Job $job -Wait -AutoRemoveJob
            $scroll = Read-Trace $scrollCsv $ScrollSeconds $processName
            $scroll.window_found = [bool]$ok
        }

        $remaining = $LoadSeconds - ((Get-Date) - $started).TotalSeconds
        if ($remaining -gt 0) { Start-Sleep -Seconds ([int]$remaining) }
        $final = Get-Memory $p
        return @{
            exited_early            = $p.HasExited
            cpu_percent_of_one_core = [Math]::Round($cpuSeconds / $wallSeconds * 100, 1)
            gpu_3d_percent_avg      = if ($gpu.Count) { [Math]::Round(($gpu | Measure-Object -Average).Average, 1) } else { $null }
            memory_after_trace      = $afterTrace
            memory_at_end           = $final
            load_seconds            = [int]((Get-Date) - $started).TotalSeconds
            stream_trace            = $stream
            scroll_trace            = $scroll
        }
    } finally {
        Stop-App $p
    }
}

function Measure-Size([string]$Ship) {
    $files = if (Test-Path $Ship -PathType Container) { Get-ChildItem $Ship -Recurse -File } else { Get-Item $Ship }
    $zip = Join-Path $env:TEMP "spike-size-$([Guid]::NewGuid().ToString('N')).zip"
    Compress-Archive -Path $files.FullName -DestinationPath $zip -CompressionLevel Optimal
    $zipped = (Get-Item $zip).Length
    Remove-Item $zip
    return @{
        files     = @($files).Count
        disk_mb   = [Math]::Round((($files | Measure-Object Length -Sum).Sum) / 1MB, 1)
        zipped_mb = [Math]::Round($zipped / 1MB, 1)
    }
}

$machine = @{
    os            = (Get-CimInstance Win32_OperatingSystem | ForEach-Object { "$($_.Caption) $($_.BuildNumber)" })
    cpu           = (Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name)
    logical_cores = [Environment]::ProcessorCount
    ram_gb        = [Math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 0)
    gpu           = @(Get-CimInstance Win32_VideoController | ForEach-Object { "$($_.Name) @ $($_.CurrentRefreshRate) Hz, $($_.CurrentHorizontalResolution)x$($_.CurrentVerticalResolution)" })
    measured_at   = (Get-Date).ToString('s')
}
$machine | ConvertTo-Json | Set-Content (Join-Path $results 'machine.json') -Encoding utf8

foreach ($name in $candidates.Keys) {
    if ($Only -and $name -notin $Only) { continue }
    $candidate = $candidates[$name]
    if (-not (Test-Path $candidate.Exe)) { Write-Warning "${name}: $($candidate.Exe) not built, skipped"; continue }
    Write-Host "== $name =="

    Write-Host '  start time...'
    $start = Measure-Start $name $candidate.Exe $StartRuns

    Write-Host "  idle memory ($IdleSeconds s)..."
    $p = Start-App $candidate.Exe @('--idle')
    try { Start-Sleep -Seconds $IdleSeconds; $idle = Get-Memory $p; $idle.exited_early = $p.HasExited } finally { Stop-App $p }

    Write-Host "  load ($LoadSeconds s)..."
    $load = Measure-Load $name $candidate.Exe

    $size = Measure-Size $candidate.Ship
    $result = [ordered]@{ candidate = $name; start = $start; idle = $idle; load = $load; size = $size }
    $result | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $results "$name.json") -Encoding utf8
    Write-Host ("  start warm median {0} ms (first {1} ms) | idle private {2} MB | load private {3} MB | cpu {4}% | scroll: {5} displayed fps, p99 {6} ms" -f `
            $start.warm_median_ms, $start.first_run_ms, $idle.private_mb, $load.memory_at_end.private_mb,
        $load.cpu_percent_of_one_core, $load.scroll_trace.dwm.presents_per_second, $load.scroll_trace.dwm.display_ms_p99)
}
[void][Spike.Native]::SetThreadExecutionState([uint32]'0x80000000') # back to normal power policy
Write-Host "Results in $results"
