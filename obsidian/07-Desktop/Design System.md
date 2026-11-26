---
tags: [desktop, ui, theme]
---

# Design System

> The look of the app is the look of the previous UI (React, Material UI 6, framer-motion), rebuilt
> for Avalonia. Code: `src/TradingAgent.App/Theme`, `Controls`, `Motion`, `Effects`.

The source of every number is the old frontend, last present at commit `9582f8a` under `frontend/`
(`git show 9582f8a:frontend/src/theme/presets.ts`). No theme package is used: the Material packages
for Avalonia differ from Material UI in ripple, shadows, icons and text field, so the kit is written
by hand.

## Presets

Four looks, dark only: Solar (default), Glacier, Jade, Eclipse. `ThemePreset` holds their base
values. `ThemeBuilder.Build` works out everything else (translucent surfaces, gradients, shadows,
corner radii) as the old palette and component files did, and returns one resource dictionary.
`ShellApp.ApplyTheme` swaps that dictionary.

- Every reference to a theme resource is a `DynamicResource`. A `StaticResource` would not follow a
  theme switch. A test fails when a view asks for a key the builder does not make.
- Key names: `PrimaryBrush` and `PrimaryColor`, `Primary15Brush` (the colour at 15 %), `CardBrush`,
  `CardShadow`, `RadiusBase`, `RadiusCard`.
- Shadows are CSS values. `ThemeBuilder.CssBlur` converts the blur, because Avalonia and a browser
  turn a blur radius into softness differently.
- Two states of one shadow have the same layers in the same order, or the transition between them
  jumps.

## Kit

`Theme/Kit.axaml` merges one file per control from `Theme/Controls`. A theme there replaces the
Fluent theme of the same control, because application resources are searched first. Fluent stays as
the base of controls the kit does not cover yet.

| Control                         | Classes                                                                  |
|---------------------------------|--------------------------------------------------------------------------|
| `Button`                        | none = text, `outlined`, `contained`; colours; `small`; `icon`           |
| `TextBox`, `ComboBox`, `NumericUpDown` | 56 px, `small` = 40 px; `c:Field.Label` gives a floating label    |
| `ListBox`                       | `table` (rows with a hover bar), `plain` (rows without any state)        |
| `c:Card`, `c:Chip`, `c:Alert`   | `outlined`, `small`, colours on a chip; `filled` on an alert             |
| `TextBlock`                     | `h1` to `h6`, `subtitle1/2`, `body1/2`, `caption`, `overline`, `mono`    |
| `c:SectionHeader`               | the head of a page: `Title`, `Subtitle`, and its content on the right    |
| `c:EmptyState`                  | icon, `Title`, `Description`; `compact` inside a card                    |
| `c:MetricTile`                  | `Kind` = `Kpi`, `Delta` or `Trend`; `Tone`; `IsRolling`; `IsLoading`     |
| `c:MetricRow`                   | a line of a summary card; `last` has no rule under it                    |

Drawn by hand, in `Controls`: `Sparkline`, `RollingDigits`, `RangeBar`, `SeriesChart` (the equity
line and the bars of the Trades page) and `CandleChart`. They read their colours from the theme when
they are attached and again when the theme changes, because a drawn control cannot bind a brush for
each stroke.

Things to know:

- A templated control clips its template. A theme whose template draws outside the control (a
  shadow, a floated label) sets `ClipToBounds` to false.
- Contained buttons and filled chips are always primary coloured. The old theme painted over the
  colour, and the port keeps that.
- Icons are Material Icons as path data in `Theme/Tokens/Icons.axaml`, keyed `Icon<Name>`, taken from
  `@mui/icons-material` 6. Add one by copying its path there.
- Fonts ship in `Assets/Fonts`: Inter 3.19 and JetBrains Mono, static files. The old UI named both
  but relied on them being installed.
- A metric tile works its colours out from its tone (`MetricTile.Paint`): one tone at six strengths.
  A tile of the kind `Delta` takes its tone from the sign of `Change`, whatever `Tone` says.
- A shadow under the pointer keeps the number and order of layers of the shadow at rest
  (`MetricTile.HoverShadow`), or the transition between them jumps.
- Menus, select lists and tooltips are drawn inside the window (`OverlayPopups`), so shadows are not
  cut and they can animate.

## Motion

| Need                                   | Use                                                         |
|----------------------------------------|-------------------------------------------------------------|
| Hover and press                        | XAML `Transitions`, always with an easing from `Tokens/Motion.axaml` |
| A control coming in                    | `m:Enter.Kind`, or `m:Enter.Children` on a panel for a stagger |
| A spring, or a drawing that changes every frame | `FrameDriver.Run`                                  |
| Endless motion (shimmer, pulse, flow)  | `Endless`: one clock, 30 steps a second, moves controls in the compositor |
| A menu opening                         | `m:Grow.On`                                                 |

`FrameDriver.IsInstant` switches all of it off: every animation jumps to its end. Tests set it, and
so do the picture modes below.

Not the same as before: a popup has no closing animation.

### What a frame costs

Presenting a frame costs processor time whatever is drawn. Measured on a 143 Hz display, November
2026: one endless animation at the display's rate kept half a core busy in an idle window. Three
things brought that to about a tenth of a core with everything moving, and to nothing with
"Reduced motion" on:

- Endless motion steps 30 times a second (`Endless`), the background 15 times (`EffectsLayer`).
  Never start an endless animation that runs at the display's rate: no keyframe `Animation` with
  `IterationCount="Infinite"` in a style, no composition animation that repeats forever.
- `Program` asks for DirectComposition before the default WinUI composition: a frame costs about
  half with it. The default adds window acrylic and rendering at the display's rate; the app uses
  neither.
- A control that animates stops while it cannot be seen (`VisibilityWatch`), and all endless motion
  stops while the window is hidden or minimized (`Endless.IsSuspended`).

### What the look costs

Measured in November 2026 on the development flavour of the Native AOT build, window 1400 × 900
at 175 % scaling, 143 Hz, after 30 s on the Chat page. Memory is private bytes, the counter of the
gate in [[Native Rewrite Decisions]].

| State                                      | First frame | Memory   | Processor, one core |
|--------------------------------------------|-------------|----------|---------------------|
| Before the redesign                        | 314 ms      | 105 MB   | 0 %                 |
| Effects off and reduced motion             |             | 136 MB   | 0 %                 |
| Effects off                                |             | 153 MB   | 5 %                 |
| Reduced motion (glass blurs, nothing moves)|             | 185 MB   | 0 %                 |
| Everything on (the default)                | 454 ms      | 199 MB   | 13 %                |

The start gate (one second) holds. The memory gate (120 MB) does not, in any state: the blur of the
glass costs about 50 MB of off-screen layers, endless motion about 18 MB, fonts and the kit the rest.
Lowering Skia's GPU cache limit changed nothing. Whether the look is worth it is the owner's call;
"Background effects" and "Reduced motion" in Settings are the two switches.

## Glass

`Effects/BackdropBlur` blurs what is behind a control, as `backdrop-filter` did. It asks the Skia
canvas for a layer that starts as a blurred copy of the frame. Checked in a real window and in the
Native AOT build. Without a Skia canvas (a headless test) it does nothing.

## Looking at it

- `TradingAgent.exe --gallery [--theme jade]` opens every control of the kit on one page.
- `--gallery --shot file.png` saves that page as a picture and exits.
- `--page-shots folder` opens the real app, saves a picture of each page and exits.

The pictures are drawn into a bitmap, so they do not need a visible window.
