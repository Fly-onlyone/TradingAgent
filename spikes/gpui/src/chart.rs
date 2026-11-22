//! Candlestick chart: gpui-component's `CandlestickChart` for candles, grid and time axis,
//! plus two small `Plot`s of our own for the sma20 line and the right-hand price axis,
//! and wheel zoom / drag pan driven from the view.

use std::cell::Cell;
use std::rc::Rc;

use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::chart::CandlestickChart;
use gpui_kit::component::plot::scale::{Scale, ScaleBand, ScaleLinear};
use gpui_kit::component::plot::{AxisText, Plot, PlotAxis, PlotElement};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::data::{Candle, Fixtures};
use crate::theme;

/// Height the candlestick chart keeps under the plot for its time-axis labels (its `AXIS_GAP`).
const AXIS_GAP: f32 = 18.;
const PRICE_AXIS_WIDTH: f32 = 64.;
const INITIAL_VISIBLE: f64 = 200.;
const MIN_VISIBLE: f64 = 10.;

pub struct ChartView {
    candles: Vec<Candle>,
    sma: Vec<f64>,
    ticks: Vec<f64>,
    candle_every: usize,
    tick_ix: usize,
    /// First visible candle (fractional) and how many are visible.
    start: f64,
    len: f64,
    /// Pinned to the newest candle.
    follow: bool,
    bounds: Rc<Cell<Bounds<Pixels>>>,
    drag_x: Option<f32>,
}

impl ChartView {
    pub fn new() -> Self {
        Self {
            candles: Vec::new(),
            sma: Vec::new(),
            ticks: Vec::new(),
            candle_every: 20,
            tick_ix: 0,
            start: 0.,
            len: INITIAL_VISIBLE,
            follow: true,
            bounds: Rc::new(Cell::new(Bounds::default())),
            drag_x: None,
        }
    }

    pub fn install(&mut self, fx: &Fixtures, cx: &mut Context<Self>) {
        self.candles = fx.candles.clone();
        self.sma = fx.sma.clone();
        self.ticks = fx.ticks.clone();
        self.candle_every = fx.candle_every;
        self.len = INITIAL_VISIBLE.min(self.candles.len() as f64);
        self.start = self.candles.len() as f64 - self.len;
        self.follow = true;
        cx.notify();
    }

    /// One 250 ms chart tick: move the last candle's close, maybe append a candle.
    pub fn tick(&mut self, cx: &mut Context<Self>) {
        if self.ticks.is_empty() || self.candles.is_empty() {
            return;
        }
        let price = self.ticks[self.tick_ix % self.ticks.len()];
        self.tick_ix += 1;
        if let Some(last) = self.candles.last_mut() {
            last.c = price;
            last.h = last.h.max(price);
            last.l = last.l.min(price);
        }
        if self.tick_ix.is_multiple_of(self.candle_every) {
            let (prev_t, prev_c) = self
                .candles
                .last()
                .map(|c| (c.t, c.c))
                .unwrap_or((0, price));
            self.candles
                .push(Candle::new(prev_t + 60, prev_c, prev_c, prev_c, prev_c));
            let from = self.candles.len().saturating_sub(20);
            let tail = &self.candles[from..];
            self.sma
                .push(tail.iter().map(|c| c.c).sum::<f64>() / tail.len() as f64);
            if self.follow {
                self.start = self.candles.len() as f64 - self.len;
            }
        }
        cx.notify();
    }

    fn total(&self) -> f64 {
        self.candles.len() as f64
    }

    fn clamp_view(&mut self) {
        self.len = self
            .len
            .clamp(MIN_VISIBLE.min(self.total()), self.total().max(1.));
        self.start = self.start.clamp(0., (self.total() - self.len).max(0.));
        self.follow = self.start + self.len >= self.total() - 0.5;
    }

    fn zoom(&mut self, steps: f32, cursor_x: f32) {
        let width = self.bounds.get().size.width.as_f32().max(1.);
        let frac = (f64::from(cursor_x) / f64::from(width)).clamp(0., 1.);
        let anchor = self.start + frac * self.len;
        self.len *= 0.9f64.powf(f64::from(steps));
        self.len = self
            .len
            .clamp(MIN_VISIBLE.min(self.total()), self.total().max(1.));
        self.start = anchor - frac * self.len;
        self.clamp_view();
    }

    fn pan(&mut self, dx: f32) {
        let width = f64::from(self.bounds.get().size.width.as_f32().max(1.));
        self.start -= f64::from(dx) * self.len / width;
        self.clamp_view();
    }
}

impl Render for ChartView {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let total = self.candles.len();
        let lo = (self.start.round() as usize).min(total);
        let hi = ((self.start + self.len).round() as usize).clamp(lo, total);
        let visible: Vec<Candle> = self.candles[lo..hi].to_vec();
        let sma: Vec<f64> = self
            .sma
            .get(lo..hi)
            .map(<[f64]>::to_vec)
            .unwrap_or_default();

        let width = self.bounds.get().size.width.as_f32();
        let labels_fit = ((width / 96.) as usize).max(1);
        let tick_margin = (visible.len() / labels_fit).max(1);

        let (price_lo, price_hi) = price_range(&visible);
        let labels: Vec<SharedString> = visible.iter().map(|c| c.label.clone()).collect();

        let chart = CandlestickChart::new(visible)
            .id("candles")
            .x(|c: &Candle| c.label.clone())
            .open(|c| c.o)
            .high(|c| c.h)
            .low(|c| c.l)
            .close(|c| c.c)
            .bullish(theme::bullish())
            .bearish(theme::bearish())
            .tick_margin(tick_margin)
            .interactive(false)
            .appear(false);

        let bounds_cell = self.bounds.clone();
        let sma_plot = SmaPlot {
            labels,
            sma,
            lo: price_lo,
            hi: price_hi,
            color: theme::accent(),
        };
        let axis_plot = PriceAxis {
            lo: price_lo,
            hi: price_hi,
            color: cx.theme().muted_foreground,
        };

        div()
            .id("chart")
            .flex()
            .flex_row()
            .size_full()
            .p(px(8.))
            .cursor_crosshair()
            .on_scroll(cx.listener(|this, e: &ScrollEvent, _, cx| {
                let dy = e.delta.pixel_delta(px(20.)).y.as_f32();
                let x = e.position.x.as_f32() - this.bounds.get().origin.x.as_f32();
                this.zoom(dy / 30., x);
                cx.notify();
            }))
            .on_mouse_down(
                MouseButton::Left,
                cx.listener(|this, e: &MouseDownEvent, _, _| {
                    this.drag_x = Some(e.position.x.as_f32());
                }),
            )
            .on_mouse_move(cx.listener(|this, e: &MouseMoveEvent, _, cx| {
                if let (Some(last), true) = (this.drag_x, e.dragging()) {
                    let x = e.position.x.as_f32();
                    this.drag_x = Some(x);
                    this.pan(x - last);
                    cx.notify();
                } else {
                    this.drag_x = None;
                }
            }))
            .on_mouse_up(
                MouseButton::Left,
                cx.listener(|this, _: &MouseUpEvent, _, _| this.drag_x = None),
            )
            .on_mouse_up_out(
                MouseButton::Left,
                cx.listener(|this, _: &MouseUpEvent, _, _| this.drag_x = None),
            )
            .child(
                div()
                    .relative()
                    .flex_1()
                    .min_w_0()
                    .h_full()
                    .child(
                        canvas(move |b, _, _| bounds_cell.set(b), |_, _, _, _| {})
                            .absolute()
                            .inset_0(),
                    )
                    .child(chart)
                    .child(div().absolute().inset_0().child(sma_plot)),
            )
            .child(
                div()
                    .w(px(PRICE_AXIS_WIDTH))
                    .h_full()
                    .flex_none()
                    .child(axis_plot),
            )
    }
}

/// Lowest and highest price among the candles; the same domain `CandlestickChart` uses.
fn price_range(candles: &[Candle]) -> (f64, f64) {
    candles
        .iter()
        .flat_map(|c| [c.o, c.h, c.l, c.c])
        .fold((f64::MAX, f64::MIN), |(lo, hi), v| (lo.min(v), hi.max(v)))
}

/// The sma20 polyline, placed with the same band and linear scales `CandlestickChart` builds.
struct SmaPlot {
    labels: Vec<SharedString>,
    sma: Vec<f64>,
    lo: f64,
    hi: f64,
    color: Hsla,
}

impl Plot for SmaPlot {
    fn paint(&mut self, bounds: Bounds<Pixels>, window: &mut Window, _cx: &mut App) {
        if self.labels.is_empty() || self.lo >= self.hi {
            return;
        }
        let height = bounds.size.height.as_f32() - AXIS_GAP;
        let x = ScaleBand::new(
            self.labels.iter().cloned(),
            [0., bounds.size.width.as_f32()],
        )
        .max_band_width(30.)
        .padding_inner(0.4)
        .padding_outer(0.2);
        let y = ScaleLinear::new([self.lo, self.hi], [height, 10.]);
        let half_band = x.band_width() / 2.;
        let mut path = PathBuilder::stroke(px(1.5));
        let mut started = false;
        for (label, value) in self.labels.iter().zip(&self.sma) {
            let (Some(px_), Some(py)) = (x.tick(label), y.tick(value)) else {
                continue;
            };
            let p = point(
                bounds.origin.x + px(px_ + half_band),
                bounds.origin.y + px(py),
            );
            if started {
                path.line_to(p);
            } else {
                path.move_to(p);
                started = true;
            }
        }
        let built = path.build();
        if let Ok(path) = built {
            window.paint_path(path, self.color);
        }
    }
}

impl IntoElement for SmaPlot {
    type Element = PlotElement<Self>;
    fn into_element(self) -> Self::Element {
        PlotElement::new(self)
    }
}

/// Right-hand price axis: five labels between the visible low and high.
struct PriceAxis {
    lo: f64,
    hi: f64,
    color: Hsla,
}

impl Plot for PriceAxis {
    fn paint(&mut self, bounds: Bounds<Pixels>, window: &mut Window, cx: &mut App) {
        if self.lo >= self.hi {
            return;
        }
        let height = bounds.size.height.as_f32() - AXIS_GAP;
        let y = ScaleLinear::new([self.lo, self.hi], [height, 10.]);
        let labels: Vec<AxisText> = (0..5)
            .filter_map(|i| {
                let v = self.lo + (self.hi - self.lo) * f64::from(i) / 4.;
                Some(AxisText::new(
                    format!("{v:.1}"),
                    px(y.tick(&v)?),
                    self.color,
                ))
            })
            .collect();
        PlotAxis::new()
            .y(px(4.))
            .y_label(labels)
            .paint(&bounds, window, cx);
    }
}

impl IntoElement for PriceAxis {
    type Element = PlotElement<Self>;
    fn into_element(self) -> Self::Element {
        PlotElement::new(self)
    }
}
