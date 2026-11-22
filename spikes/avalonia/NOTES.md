# Avalonia spike notes

## Versions
- .NET SDK 10.0.404 (pinned by `global.json`), `net10.0`, win-x64, Native AOT (ILCompiler 10.0.15), MSVC 14.51 (VS 2026)
- Avalonia 12.1.6, Avalonia.Desktop 12.1.6, Avalonia.Themes.Fluent 12.1.6 (Skia renderer, bundled SkiaSharp/HarfBuzz/ANGLE natives)
- No other packages. Chart, Markdown renderer and table are written by hand (see "Library choices").

## Build / run
Build (from `spikes/avalonia`). `vswhere.exe` must be on PATH or the ILCompiler link step fails (see friction):
```
export PATH="$PATH:/c/Program Files (x86)/Microsoft Visual Studio/Installer"   # Git Bash
dotnet publish -c Release -r win-x64 -p:PublishAot=true -o publish
```
Run (from `spikes/avalonia`):
```
publish\spike-avalonia.exe --fixtures ..\fixtures [--marker <file>] [--idle]
```
Publish folder: 4 files, about 35 MB (`spike-avalonia.exe` 17.6 MB, libSkiaSharp.dll 11.6 MB, av_libglesv2.dll 5.4 MB, libHarfBuzzSharp.dll 1.8 MB). A `DropNativePdb` target in the csproj deletes the ~100 MB of native `.pdb` files NuGet copies into `publish/`. Zero trim/AOT warnings in the build output.

## Lines of code written
About 950 lines: C# 806 (Data 116, MarkdownView 271, CandleChart 211, MainWindow.axaml.cs ~150, Program 47, App 17) + XAML 140 (MainWindow 103, App 37). Generated code not counted.

## Library choices
- Chart: hand-drawn `Control` overriding `Render(DrawingContext)`. ScottPlot.Avalonia 5.1.59 does target Avalonia 12 / net10, but it is not annotated for trimming/AOT (I did not test it), and a full generic plot engine is unneeded. LiveChartsCore.SkiaSharpView.Avalonia 2.2.0 stable depends on Avalonia 11, so it is out. Custom drawing is about 200 lines and AOT-safe. Zoom and pan are implemented by hand.
- Markdown: hand-written renderer (`MarkdownView`, a `StackPanel` that rebuilds TextBlock/Run/Grid children) covering only transcript.md's constructs. Did not evaluate Markdown.Avalonia for AOT/12 compatibility.
- Table: `ListBox` (default template = ScrollViewer + VirtualizingStackPanel) with a Grid row template and a separate header Grid. Did not use Avalonia.Controls.DataGrid (12.1.2) or TreeDataGrid to avoid extra dependencies.
- Bindings: compiled bindings by default (`AvaloniaUseCompiledBindingsByDefault`), `x:DataType` on every DataTemplate; `ChatMessage` implements INPC by hand.

## --marker
`MainWindow.WriteMarkerAfterDataFrame()` is called after the background-loaded fixtures have been bound (`Chart.SetData`, `OrdersList.ItemsSource`), in both normal and `--idle` mode. It awaits: (1) one `TopLevel.RequestAnimationFrame` callback, which is the frame in which layout and render of the newly bound data happen; (2) `Compositor.RequestCommitAsync()` (from `ElementComposition.GetElementVisual(window).Compositor`), whose Task completes when the serialized composition changes have been applied on the render thread; (3) one more `RequestAnimationFrame`. Then it writes UTC epoch ms once. Caveat: this means the render thread has received and applied the frame with data; Avalonia exposes no DWM "presented" callback, so true on-screen presentation may lag by up to one vsync.

## Observed (RTX 4070, Windows 11, rough, other agents were building concurrently)
- Marker 0.4 to 0.7 s after process start (one outlier of 4.8 s on an idle run while other builds were running). Window itself appears nearly instantly.
- Private memory: idle ~105 MB; streaming + ticks 115 MB at 2 s, ~145 MB at 20 s (still creeping slowly; not investigated beyond 20 s).
- Process stayed alive for 20 s in both modes; marker content is digits only.
- Screenshot `screenshot.png` (PrintWindow capture) confirms chat cards with rendered Markdown, candlesticks plus orange SMA, axes, and the virtualized table with green/red side column in the specified colors.

## Deviations
- Header blur: not implemented (translucent `#B8342818` only; Avalonia's blur is window-level Acrylic, not per-panel).
- Pause button label changes to "Resume" while paused.
- Chart is 5,000 candles hand-drawn each frame on the UI thread; no culling beyond the visible index range.
- Chart layout: extra 8 px margins around cards; header is a 48 px panel inside a 56 px row (8 px margin). Table cell font is 14 px like the rest; code uses Consolas 13 px.
- Table: columns are fixed/star widths, no column resize/sort. `time` as UTC `YYYY-MM-DD HH:MM:SS`.
- Chat message cards use the window background color (#211b14) on the card-colored pane, to be visible against `#332818`.
- The `sma20` of the in-progress candle is not recomputed on ticks (spec only asks for it at candle creation).
- Compositor "applied on render thread" used as the presentation proxy (see --marker).

## Friction
- Native AOT link failed first: ILCompiler targets call `vswhere.exe`, which is not on PATH (VS 2026 installer dir). Adding `C:\Program Files (x86)\Microsoft Visual Studio\Installer` to PATH fixed it. No Developer Prompt needed.
- `ItemsControl` with a custom Template (ScrollViewer + ItemsPresenter) and `VirtualizingStackPanel` did NOT virtualize here: 10,000 rows realized, ~1.2 GB private memory and 7-12 s startup. Switching to `ListBox` (default template) fixed it: ~105 MB, sub-second. Lesson: use the stock virtualizing controls.
- `ImmutablePen`'s constructor overload did not resolve for me (IBrush, double); used `Pen`. `Immutable*` types need `using Avalonia.Media.Immutable;`.
- `Avalonia.Media` hit-testing needs a transparent rectangle drawn in `Render` for pointer events on a custom control.
- NuGet native PDBs (~100 MB) land in publish output unless removed.
- Avalonia 12 requires `DataType` on DataTemplates inside `DataTemplates` collections (not hit; templates here are `ItemTemplate`).

## For a 45,000-line app
- Everything non-trivial (chart, Markdown, table with sorting/resizing) is DIY or third-party; ScottPlot/LiveCharts AOT story must be verified per package. Compiled bindings + `x:DataType` everywhere are mandatory for AOT; reflection-based bindings and runtime XAML loading will break.
- Rebuilding the Markdown tree for each streamed chunk is fine at this size (the last message only) but a diffing renderer would be needed for long transcripts.
- Idle footprint is ~35 MB on disk / ~105 MB RAM, mostly Skia + the managed runtime.
- AOT publish takes about 1 minute; use JIT debug builds for iteration. XAML previewer does not work with AOT-only settings alone but needs the `BuildAvaloniaApp` method (present).

## Rider tooling
Not exercised (no IDE MCP connection in this session). Rider/VS XAML previewer needs `Program.BuildAvaloniaApp()` (present); the Avalonia Rider plugin is expected to offer compiled-binding completion from `x:DataType`; untested.
