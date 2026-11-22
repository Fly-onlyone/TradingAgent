# Native UI spike: results

Three throwaway apps render the same screen from the same fixtures (see [`SPEC.md`](SPEC.md)): a streaming
Markdown chat, a 5,000-candle chart with live ticks, and a 10,000-row virtualized orders table. The goal is
to choose the UI stack for the native rewrite of Trading Agent by measurement, then by eye.

Measured 2026-11-22 with [`measure.ps1`](measure.ps1) on Windows 11 Pro 26300, Intel Core i7-12700F
(20 logical cores), 16 GB RAM, NVIDIA RTX 4070, 2560x1440 at 143 Hz. Raw output is in [`results/`](results/).

## Results

| Metric | Avalonia 12.1.6 (C#, Native AOT) | WinUI 3, Windows App SDK 2.7.0 (C#, Native AOT) | GPUI, gpui-kit 0.9.1 (Rust) |
|---|---|---|---|
| Start to first frame with data, median of 9 warm launches | **287 ms** | 327 ms | 334 ms |
| Same, first launch of the run | 496 ms | 480 ms | **417 ms** |
| Idle private memory after 30 s | **105.7 MB** | 141.5 MB | 108.0 MB |
| Private memory after 5 min of streaming | 176.6 MB | 231.2 MB | **111.4 MB** |
| Working set after 5 min of streaming | 148.9 MB | 224.7 MB | **80.8 MB** |
| CPU while streaming (percent of one core) | **7.2%** | 8.2% | 11.3% |
| GPU 3D engine while streaming | 1.2% | **0.5%** | 2.8% |
| Stream: screen updates per second (20 expected) | 20.2 | 19.5 | 22.9 |
| Stream: updates more than two 60 Hz frames late | 0 | 0 | 0 |
| Scroll while streaming: displayed frames per second (143 Hz display) | 118.3 | **134.3** | 132.8 |
| Scroll while streaming: 99th percentile frame gap | 55.4 ms | 27.6 ms | **14.0 ms** |
| Scroll while streaming: frames slower than 16.7 ms / 33.4 ms | 17 / 16 of 1,183 | 15 / 12 of 1,343 | **2 / 0 of 1,328** |
| Shipped size on disk / zipped | 34.8 MB / 14.3 MB (4 files) | 65.1 MB / 25.6 MB (237 files) | **17.6 MB / 6.8 MB (1 file)** |
| Code written for the spike | about 950 lines | 880 lines | about 1,090 lines + 50-line theme |

## Gates

| Gate | Avalonia | WinUI 3 | GPUI |
|---|---|---|---|
| Start to first frame <= 1.0 s | Pass | Pass | Pass |
| Idle private memory <= 120 MB | Pass | **Fail (141.5 MB)** | Pass |
| No dropped frames at 60 Hz while chat streams and chart updates | Pass | Pass | Pass |

**Avalonia and GPUI pass all three gates. WinUI 3 fails the memory gate.** By the agreed rule, the owner
now chooses between Avalonia and GPUI by eye; a tie goes to C# + Avalonia.

The third gate passes for all three as written (no stream update arrived late). The harder test, wheel
scrolling the table while the chat streams, is where they differ: GPUI stays under 16.7 ms for all but 2
frames, while Avalonia and WinUI 3 each show a dozen or more gaps of 55 to 70 ms. Those are visible
hitches.

## What the numbers do and do not show

- **Memory under load is the clearest difference.** GPUI stays flat (108 to 111 MB). Avalonia grows from
  106 to 177 MB and WinUI 3 from 142 to 231 MB over five minutes, and both were still rising slowly at the
  end. The chat list is cleared every 45 seconds, so this is not retained content. It may be garbage the
  .NET collector has not yet returned rather than a leak; a longer run would tell. Either way it is the
  memory a user would see.
- **The scroll hitches in the two C# apps come largely from the Markdown renderer.** No AOT-ready Markdown
  control was available for Avalonia 12 or WinUI 3, so both use a small hand-written renderer that rebuilds
  the growing message on the UI thread every 50 ms. gpui-kit ships a streaming Markdown view that parses
  incrementally off the UI thread. A better renderer would narrow this gap, but it would have to be written.
- **Charts.** Avalonia and WinUI 3 use hand-drawn chart controls: LiveCharts2 2.2.0 still depends on
  Avalonia 11, and ScottPlot was not tested under Native AOT. gpui-kit has a candlestick chart, but without
  zoom, a price axis or overlays; those were added by hand.
- **Start time is warm.** The first launch after a rebuild took 3 to 5 seconds for WinUI 3 and GPUI while
  other builds were running (most likely antivirus scanning a new binary). Start after a reboot was not
  measured.
- **Frame data comes from the desktop compositor.** Avalonia and WinUI 3 own no swap chain, so PresentMon
  cannot see their frames directly. All three are compared on DWM's presents, which include any other
  on-screen activity (58 or 59 unrelated presents per 60 s trace here).
- **One machine, one run.** A discrete GPU and a 143 Hz display flatter all three; an integrated GPU was not
  tested.
- **Not exercised:** the Pause button, the hover transition, and chart wheel-zoom and drag-pan were built
  but never operated by the builders. Try them when judging by eye.
- **None of the three has header background blur.** Each uses a translucent color only.

## Things each toolkit made hard

- **Avalonia:** an `ItemsControl` with a custom template silently did not virtualize (10,000 rows realized,
  1.2 GB, 7 to 12 s start); `ListBox` fixed it. Native AOT linking needs `vswhere.exe` on `PATH`. No
  "frame presented" callback exists. Details: [`avalonia/NOTES.md`](avalonia/NOTES.md).
- **WinUI 3:** under Native AOT, `ItemsSource = List<T>` throws at run time and needs a generated bindable
  wrapper. The default `Microsoft.WindowsAppSDK` package pulls in ONNX Runtime and DirectML (150 MB); the
  component packages `Microsoft.WindowsAppSDK.WinUI` + `.Runtime` bring it to 65 MB. Windows only.
  Details: [`winui3/NOTES.md`](winui3/NOTES.md).
- **GPUI:** pre-1.0 API pinned to the exact versions CodeWiki uses; clean build takes about 3.5 minutes for
  dependencies; the library chart had to be extended by hand. Details: [`gpui/NOTES.md`](gpui/NOTES.md).

## Beyond the UI: what the choice means for the rest of the rewrite

| | C# + Avalonia | Rust + GPUI |
|---|---|---|
| AI SDKs | Official Anthropic and OpenAI SDKs | None official; HTTP clients written by hand or community crates |
| MCP | Official C# SDK | Official `rmcp`, already used in CodeWiki |
| Reusable code | None yet | CodeWiki crates: embedding providers, DPAPI secrets, SQLite + FTS5 + vectors, settings, updater, packaging |
| Platforms | Windows, macOS, Linux | Windows, macOS, Linux |
| JetBrains IDE | **Rider** | **RustRover** |

WinUI 3, had it passed, would also use Rider, with Visual Studio needed for XAML preview.

## Judge by eye

```powershell
pwsh spikes/run-all.ps1          # opens all three side by side
```

Build commands for each candidate are in its `NOTES.md`. To repeat the measurements (about 18 minutes; do
not touch the mouse or keyboard, the script scrolls each app and keeps the display awake):

```powershell
pwsh spikes/measure.ps1
```

## Measurement method

- **Start:** time from `Start-Process` to the marker each app writes after its first presented frame that
  shows fixture data, launched with `--idle`. Ten launches; the first is reported separately.
- **Idle memory:** `--idle`, private bytes and working set after 30 s.
- **Load:** normal mode for 300 s. A 60 s PresentMon trace of the stream with CPU and GPU sampled, then a
  10 s trace taken inside 14 s of synthetic wheel scrolling over the orders table, then memory at 300 s.
- **Size:** the folder or file a user would receive, and the same zipped.

An earlier run was discarded: the display turns off after 60 s without input on this machine, which stops
vblank and made GPUI's start and stream numbers meaningless. The script now holds the display on.
