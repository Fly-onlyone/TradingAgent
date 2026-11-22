# UI spike: shared specification

Three throwaway apps render **the same screen from the same fixtures** so that start time, memory, frame
pacing and visual polish can be compared on one machine. Each candidate lives in its own folder and must
follow this file exactly; any deviation is recorded in that folder's `NOTES.md`.

| Folder | Stack | Executable |
|---|---|---|
| `spikes/avalonia/` | C# / .NET 10, Avalonia 12, Native AOT | `spikes/avalonia/publish/spike-avalonia.exe` |
| `spikes/winui3/` | C# / .NET 10, WinUI 3 (Windows App SDK 2.0), unpackaged, self-contained, Native AOT | `spikes/winui3/publish/spike-winui3.exe` |
| `spikes/gpui/` | Rust, GPUI via `gpui-kit` (same version as `D:\CodeWiki`) | `spikes/gpui/target/release/spike-gpui.exe` |

## Command line (identical for all three)

| Argument | Meaning |
|---|---|
| `--fixtures <dir>` | Folder holding the fixture files. Required by the measure script; default `../fixtures` relative to the working directory. |
| `--marker <file>` | After the **first frame that shows the loaded fixture data has been presented** (chart candles and table rows visible, not an empty window), write the current UTC time as Unix epoch milliseconds (digits only) to this file. Write once. This measures time to a usable screen, so fixture loading counts. |
| `--idle` | Load and show all data, but do not start the chat stream or the chart ticks. Used for the idle-memory measurement. |

The window opens immediately at 1400 x 900, titled `Spike - <stack name>`. No splash screen, no console window.

## Fixtures (`spikes/fixtures/`, produced by `generate.py`)

- `candles.json`: `{"interval_s":60,"columns":["t","o","h","l","c","v","sma20"],"rows":[[...],...]}`, 5,000 rows. `t` is Unix seconds.
- `ticks.json`: `{"interval_ms":250,"candle_every":20,"prices":[...]}`, 1,200 prices.
- `orders.json`: `{"columns":["id","time","symbol","side","type","price","size","filled","status"],"rows":[...]}`, 10,000 rows. `time` is Unix seconds.
- `transcript.md`: 12 Markdown messages separated by a line containing exactly `<<<MSG>>>`.

Fixtures are read once at start, off the UI thread where the toolkit allows it.

## Layout

```
+--------------------------------------------------------------+
| Header bar, 48 px: title left, "Pause" button right          |
+-------------------+------------------------------------------+
| Chat pane         | Candlestick chart (fills remaining space)|
| 420 px wide       |                                          |
| scrolling list of +------------------------------------------+
| Markdown messages | Orders table, 280 px high, virtualized   |
+-------------------+------------------------------------------+
```

- **Header bar**: translucent panel (see colors) over the window background. The "Pause" button toggles
  both the chat stream and the chart ticks, and has a hover transition of about 150 ms (background and
  border color). This is the polish sample.
- **Chat pane**: each message is a rounded card with rendered Markdown: headings, bold, italic, inline
  code, ordered and unordered lists, table, fenced code block, block quote. The list scrolls and stays
  pinned to the bottom while streaming.
- **Chart**: candlesticks for all candles with the `sma20` line overlaid; initial view shows the last 200
  candles; mouse wheel zooms and drag pans the time axis. Price axis on the right, time axis at the bottom.
- **Orders table**: all 10,000 rows in a virtualized table (only visible rows are realized), 9 columns,
  header row, `time` shown as `YYYY-MM-DD HH:MM:SS` UTC, `side` colored bullish/bearish.

## Behaviour when not `--idle`

- **Chat stream**: every 50 ms append the next 12 characters of the transcript to the last message and
  re-render it (240 characters per second). On `<<<MSG>>>` start a new message card. After the last
  message, clear the list and start again from the first.
- **Chart ticks**: every 250 ms take the next price from `ticks.json` (wrapping around). It becomes the
  last candle's close, and raises its high or lowers its low when it exceeds them. After every 20 ticks,
  append a new candle (open = previous close, `t` = previous `t` + 60) and its `sma20` point (mean of the
  last 20 closes). If the view was at the right edge, it follows the newest candle.

## Colors (the app's "Solar" preset, `frontend/src/theme/presets.ts`)

| Use | Value |
|---|---|
| Window background | `#211b14` |
| Card / panel background | `#332818` |
| Header panel | `rgba(52, 40, 24, 0.72)` with background blur if the toolkit supports it |
| Primary accent (button, links, sma20 line) | `#F97316` |
| Text primary / secondary | `#F8FAFC` / `#B8A894` |
| Border subtle / medium | `rgba(249, 115, 22, 0.08)` / `rgba(249, 115, 22, 0.15)` |
| Bullish candle, buy | `#10B981` |
| Bearish candle, sell | `#EF4444` |
| Chart grid | `rgba(88, 68, 36, 0.3)` |

Corner radius 12 px for cards and panels, 8 px for the button. UI font: the toolkit's default UI font at
14 px; code in a monospace font.

## Rules for whoever builds a candidate

- Write only inside your own folder. Do not edit `spikes/fixtures/`, `SPEC.md`, or any other part of the repo. Do not run git commands that change state.
- No system-wide installs. NuGet and cargo downloads are fine.
- Read the toolkit's current documentation before writing code; do not rely on memory for API names.
- Release build only. Record the exact build command.
- If something in this spec cannot be done in the toolkit within reason, implement the closest equivalent and record it under "Deviations" in `NOTES.md`. If Native AOT cannot be made to work, fall back to the leanest working publish mode and record why.
- `NOTES.md` must contain: toolkit and library versions, build command, run command, lines of code written, deviations, friction (what was hard or surprising), and anything that would matter for a 45,000-line app.
