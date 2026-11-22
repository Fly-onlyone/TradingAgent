# WinUI 3 spike notes

## Versions
- .NET SDK 10.0.404 (pinned in `global.json`), target `net10.0-windows10.0.22621.0`, `win-x64`
- `Microsoft.WindowsAppSDK.WinUI` 2.7.0 + `Microsoft.WindowsAppSDK.Runtime` 2.7.0 (2.7.0 is the latest stable on NuGet).
  The `Microsoft.WindowsAppSDK` metapackage is NOT referenced (see "Publish size").
- `Microsoft.Graphics.Win2D` 1.4.0 (chart, hand-drawn)
- ILCompiler 10.0.15 (Native AOT), MSVC 14.51 from VS 2026 Community, CsWinRT via the WinAppSDK package
- Windows 11 Pro 26300

## Build / run
```
# PowerShell. The PATH line makes vswhere.exe reachable; ILCompiler's link step needs it
cd spikes\winui3
$env:PATH += ";C:\Program Files (x86)\Microsoft Visual Studio\Installer"; dotnet publish -c Release -r win-x64
.\publish\spike-winui3.exe --fixtures ..\fixtures --marker %TEMP%\m.txt [--idle]
```
Plain `dotnet publish` from the CLI worked, including the XAML compiler. VS MSBuild was NOT needed.
Without vswhere on PATH the failure is `'vswhere.exe' is not recognized` followed by link.exe error MSB3073 code 123.

## Library choices
- **Chart**: hand-drawn on Win2D `CanvasControl` (`CandleChart.cs`, ~170 lines). Chosen over LiveCharts2 (SkiaSharp
  native dependency + heavy reflection/expression-based binding, AOT story uncertain) and ScottPlot.WinUI (SkiaSharp,
  no candle+live-append control tuned for this). Win2D is a Microsoft package, works with CsWinRT AOT, and drawing only the
  visible candles keeps 5,000 candle datasets cheap. Cost: axes, zoom, pan, follow-edge all written by hand.
- **Markdown**: hand-written renderer (`Markdown.cs`, 216 lines) producing TextBlock/Grid/Border elements. CommunityToolkit
  Labs `MarkdownTextBlock` was not used (NuGet has only a stale 1.0 and it has not been verified AOT-safe here; not tested).
- **Table**: `ListView` (default `ItemsStackPanel`, virtualized) with `x:Bind` `DataTemplate` plus a hand-made header Grid.
  No AOT-safe DataGrid was evaluated; the fixed header row is a separate Grid with identical column widths.
- **Header translucency**: `AcrylicBrush` (tint #342818, opacity 0.72) as the header Border background. WinUI in-app acrylic blurs
  only XAML content behind it, which here is the solid window background, so no visible blur happens.

## Native AOT
Worked: `PublishAot=true`, unpackaged (`WindowsPackageType=None`), `WindowsAppSDKSelfContained=true`, `SelfContained=true`.
`publish/spike-winui3.exe` runs standalone with no Windows App Runtime installed system-wide (not verified on a clean machine;
only the self-contained DLLs next to the exe were used).
Publish folder: 237 files, 65.1 MB (exe 5.6 MB, `Microsoft.ui.xaml.dll` 15 MB, `Microsoft.UI.Xaml.Controls.dll` 7.4 MB).
Build warnings left: none shown in the final build output.

### Publish size (150 MB, 294 files, before)
- The `Microsoft.WindowsAppSDK` 2.7.0 metapackage depends on Base, Foundation, InteractiveExperiences, WinUI, DWrite, Widgets, AI, ML,
  Search and Runtime (read from its nuspec). The ML package ships `onnxruntime.dll` (23.6 MB) and `DirectML.dll` (18.7 MB); AI and
  Search add more DLLs. The Microsoft Learn Windows ML distribution page describes these binaries as coming from the ML package that the
  metapackage references transitively; component packages are the documented way to avoid it. I did not find a documented MSBuild
  property that excludes them.
- Fix: reference `Microsoft.WindowsAppSDK.WinUI` + `Microsoft.WindowsAppSDK.Runtime` instead (Runtime is needed for the self-contained
  redistributable). The build, AOT link and both run modes work. Nothing was hand-deleted.
- `.pdb` excluded with `<DebugType>none</DebugType>` and `<DebugSymbols>false</DebugSymbols>`.
- Result: 65.1 MB, 237 files. No `.pdb` in the folder.

AOT-specific fix: `ListView.ItemsSource = List<OrderRow>` throws `ArgumentException: Value does not fall within the expected
range` at runtime (not at build) under AOT. `[GeneratedBindableCustomProperty]` on the element type did not fix it. Wrapping
in a non-generic read-only `IList` + `INotifyCollectionChanged` class (`OrderList`, also marked `[GeneratedBindableCustomProperty]`)
did. Custom classes passed to WinRT must be `partial` (CsWinRT1028 warning otherwise). Always use `x:Bind` with `x:DataType`.

## Measurements (observed, noisy: Avalonia and GPUI agents were running on the same machine)
- New marker definition (first frame showing loaded data), after the 65 MB re-publish: first launch after build 3.4 s (--idle, cold disk
  cache); warm launches 0.31-0.33 s (normal), 0.38-0.49 s (--idle). Marker is measured from just before `Start-Process`.
- Private memory after 20 s: 195 MB streaming; 143 MB with `--idle` (metapackage build: 149 MB idle).
- Process alive for 20 s in both modes; marker file contained epoch milliseconds.

## --marker
`Window.Activated` (first time) subscribes `CompositionTarget.Rendered`. The handler writes the marker on the first `Rendered`
callback where all of these hold: fixtures loaded and bound (`_dataBound`, set after `Chart.SetData` and `OrdersList.ItemsSource`),
the Win2D `Draw` handler has painted candles at least once (`CandleChart.HasDrawn`), and the first table row container is realized
(`OrdersList.ContainerFromIndex(0) != null`). Same in `--idle` and normal mode. `Rendered` fires after XAML has rendered a frame and
handed it to the compositor, so it is the closest public signal to presentation, not a DWM present confirmation. A screenshot taken
right after the marker appeared (`screenshot-idle-at-marker.png`) shows chart, chat cards and table rows (the table rows were still
fading in).

## Lines of code (hand-written)
App.xaml.cs 16, App.xaml 11, MainWindow.xaml 126, MainWindow.xaml.cs 193, CandleChart.cs 167, Data.cs 108, Markdown.cs 216,
csproj 29, manifest 14: 880 total.

## Deviations from the spec
- Window background is a solid `#211b14`; no Mica backdrop (it would override the specified color).
- Header "blur" is in-app Acrylic over a solid color, so there is no visible blur effect.
- Window size is 1400 x 900 in DIPs-scaled physical pixels (multiplied by DPI scale); screenshot at 100% scale is 1400x900.
- Pause "button" is a `Border` with pointer handlers and a 150 ms `ColorAnimation` on background and border, not a `Button`
  (no keyboard focus/automation behaviour).
- Header title text added ("Trading Agent - UI spike"); the window title is "Spike - WinUI 3".
- Orders table is not a real DataGrid: no column resize/sort; the last column (`status`) clips "partially_filled" slightly;
  header row does not scroll horizontally.
- Table `price` shown with 2 decimals, `size`/`filled` with 4; `id` greyed.
- Streaming re-renders the whole last message (clear + rebuild elements) on each tick; fine at this size.
- Chart: price axis labels are drawn with a 7-line grid; last-price label may overlap a grid label. No crosshair.
- Console window: none (WinExe). No splash.
- Chart ticks, chat stream and Pause behaviour were observed working in screenshots only; Pause click, wheel zoom and drag pan
  were NOT exercised by automation (unverified at runtime).
- Frame pacing was not measured.

## Friction
- `vswhere.exe` not on PATH for ILCompiler on VS 2026.
- Generic `List<T>` ItemsSource fails at runtime under AOT only (see above). Silent when started via `_ = async` because the
  exception is swallowed; an error file in `%TEMP%\spike-winui3-error.txt` is written by `LoadSafeAsync`.
- WinUI `FontWeight` lives in `Windows.UI.Text`, `FontWeights` in `Microsoft.UI.Text`.
- Windows App SDK 2.7.0 is the latest stable even though the spec says "2.0".
- Publish folder is large (150 MB) because of ONNX/DirectML AI pieces in the metapackage.

## For a 45,000-line app
- Every data-bound custom type crossing into XAML needs AOT-aware plumbing (`partial`, `GeneratedBindableCustomProperty`,
  non-generic list wrappers). Reflection-based Binding is off the table.
- No first-party DataGrid/chart/Markdown; third-party options need AOT vetting each time.
- XAML compile + ILC link adds minutes per publish; hot reload is unavailable with AOT (use JIT Debug for iteration).
- Large deliverable (~150 MB) and ~150-200 MB memory baseline.
- Strong text rendering, accessibility, IME and native look come for free.

## Tooling
- CLI: `dotnet publish` works end to end (XAML compile, AOT link) once vswhere is on PATH. No `dotnet workload` needed.
- Visual Studio: needed for XAML designer, Live Visual Tree and XAML hot reload, and the MSVC link tools (installed with VS).
- JetBrains Rider: can edit and build via the dotnet CLI; no XAML designer or hot reload for WinUI 3 (not tested here).
