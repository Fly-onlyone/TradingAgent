# UI spike: Rust + GPUI via gpui-kit

## Versions
- rustc / cargo 1.99.1, `stable-x86_64-pc-windows-msvc`, edition 2024.
- `gpui-kit =0.9.1` (default features `component` + `assets`), which pulls `gpui-component 0.9.1`, `gpui-base 0.9.1`, `gpui-pre 0.3.12` (GPUI). `Cargo.lock` is copied from `D:\CodeWiki` so every transitive version matches.
- `serde 1`, `serde_json 1` (fixtures only).
- Release profile: `opt-level = 3`, `lto = "thin"`, `codegen-units = 1`, `strip = true`. `.cargo/config.toml` adds `+crt-static` (same as CodeWiki) so the exe needs no vcruntime DLL.

## Build and run
```
cd spikes/gpui
cargo build --release
target/release/spike-gpui.exe --fixtures ../fixtures [--marker <file>] [--idle]
```
Binary: 18,488,320 bytes (17.6 MB). `#![windows_subsystem = "windows"]`, no console.

## Library components used
- Candles, grid, time axis: `gpui_component::chart::CandlestickChart` (exists in 0.9.1; no zoom/pan, no price axis, no overlay series, no sma). It is fed a slice of the visible window each render.
- sma20 line and right price axis: two small `Plot` implementations of ours (`SmaPlot`, `PriceAxis` in `chart.rs`) using the library's `ScaleBand`/`ScaleLinear`/`PlotAxis`, configured identically to `CandlestickChart` so they line up. Wheel zoom (anchored at cursor) and drag pan are our `on_scroll` / mouse handlers on the view.
- Markdown: `gpui_component::text::TextView` over a `TextViewState` per message. Verified on screen: headings, bold, italic, inline code, ordered/unordered lists, table, fenced code block (monospace, "json" label, no syntax colors: no tree-sitter/syntect feature), block quote. Streaming uses `TextViewState::push_str`, which appends and re-parses incrementally on a background task (source: `gpui-base/src/text/state.rs`; `set_text` also detects a pure append). So re-rendering a growing message every 50 ms does not re-parse the whole message. CPU not profiled.
- Chat list: `gpui_component::message_scroller::MessageScroller` (virtualized `gpui::list` with tail-following).
- Table: `gpui_component::table::DataTable` + `TableDelegate` (virtualized rows; 10,000 rows).
- Theme: `solar.json` loaded through `ThemeRegistry` + `Theme::apply_config`.
- Pause button: own `div` with library `motion::transition` (150 ms ease-out on bg and border `Hsla`).

## First-frame marker hook
`Window::on_next_frame`. In GPUI's frame handler (`gpui-pre/src/window.rs`), next-frame callbacks run at the start of a frame request, before that request's draw; the draw is followed synchronously by `window.present()`. The marker is armed from the first `render` of the root view after fixtures have been installed in chart, table and chat (per the spec clarification), and the callback hops twice (`on_next_frame` inside `on_next_frame`) so the frame that contained the loaded data has certainly been drawn and `present()`ed before the file is written. Same in `--idle` and normal mode. Written once, epoch ms, digits only. Not verified against DWM output, only against GPUI's own present call.

## Measured (this machine, other agents building concurrently, so noisy)
- Marker minus process start time: ~375-400 ms warm (3 runs; idle 410 ms); first cold launch after a build ~3.5-4.8 s (file cache / GPU init).
- Private memory (Get-Process PrivateMemorySize64): ~109 MB normal after 20 s of streaming, ~109 MB `--idle`; working set ~77-79 MB.
- Process alive after 20 s: yes.

## Deviations from SPEC.md
- Header blur: not applied. The header is the translucent `rgba(52,40,24,.72)` over the window background; GPUI window backdrop blur would blur the whole window, not the area behind a header.
- Grid color: `CandlestickChart` draws grid and axis line with the theme's `border` token, so `border` = `rgba(88,68,36,0.3)` in the theme. Markdown table / code borders therefore use that color too; cards and panels use the spec's subtle border explicitly.
- Pause button label toggles to "Resume" while paused.
- Chart x-axis labels read `HH:MM` style via the library (`MM-DD HH:MM` keys, labels thinned by `tick_margin`); the library chart has no right price axis, hence our `PriceAxis` (5 labels, 1 decimal).
- Candle band width is capped at 30 px by the library default, so a heavily zoomed-in chart does not widen candles further.
- `--idle`: chat shows all 12 messages fully rendered, no stream.
- Window opens at 1400x900 logical pixels with native title bar and title `Spike - GPUI`.
- Fonts: toolkit default (not bundled), 14 px, mono 13 px.
- Mouse-drag pan, the Pause click and the 150 ms hover transition were not exercised by automation (wheel zoom was and works). Row-level fonts and exact colors were checked by eye in the screenshot only.
- Candle tooltip/hover disabled (`interactive(false)`) so it does not fight drag and no per-frame hover cost.

## Lines of code
Rust: app 283, chart 334, chat 113, data 164, main 61, orders 90, theme 44 = 1,089; plus `solar.json` 50.

## Friction
- GPUI API names are pre-1.0 and renamed (`on_scroll_wheel` -> `on_scroll` with `ScrollEvent`; deprecated aliases remain). docs.rs for the `gpui-pre` family is thin; the crate sources in `~/.cargo/registry/src` were the real documentation.
- Absolute children need `inset_0()`; `absolute().size_full()` without insets is placed at the static position (this cost a debugging round: the sma overlay painted outside the visible area).
- Rust 2024 `impl Trait` capture rules clash with `&mut Context` passed to a helper returning `impl IntoElement`; return `AnyElement`.
- Chart library is minimal (no zoom, overlay, price axis, sma), so the chart is about 150 lines of custom code even with the component.
- Cold first launch is slow (several seconds), warm start is fast.
- Clean build: ~3.5 min for all dependencies (first build, includes failing own crate compile) plus ~45-75 s for the own crate with thin LTO. Incremental own-crate rebuild ~45 s even for a one-line change (LTO). Target dir is large.

## For a 45,000-line app
- Rebuild time is the main cost: every change relinks with LTO (~45 s here, growing with code); consider a faster dev profile (CodeWiki's `debug = line-tables-only`, dependencies without debug info) and keeping `lto` for release only.
- Everything custom (charts, drag/zoom, overlays) is hand-written against low-level plot/scale APIs; the component set is shadcn-like and young.
- No ready-made design for glass/blur, native menus, accessibility depth beyond what accesskit gives; ABI is a single exe with no runtime dependency (static CRT).
- State management is entity/`cx.notify()` based; keep views separate entities so a 50 ms stream does not repaint the chart.

## RustRover tooling
IDE MCP was not connected in this session, so no RustRover experience to report. `cargo fmt` and `cargo clippy --release` are clean (no warnings).
