//! Root view: header bar, chat pane, chart and orders table, plus the two timers.

use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use gpui_kit::base::motion::{Transition, transition};
use gpui_kit::component::ActiveTheme as _;
use gpui_kit::component::table::{DataTable, TableState};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::chart::ChartView;
use crate::chat::ChatView;
use crate::data::{self, Fixtures};
use crate::orders::OrdersDelegate;
use crate::theme;

pub struct Args {
    pub fixtures: PathBuf,
    pub marker: Option<PathBuf>,
    pub idle: bool,
}

pub struct Spike {
    chat: Entity<ChatView>,
    chart: Entity<ChartView>,
    orders: Entity<TableState<OrdersDelegate>>,
    paused: bool,
    pause_hover: bool,
    idle: bool,
    marker: Option<PathBuf>,
    marker_armed: bool,
    loaded: bool,
}

impl Spike {
    pub fn new(args: Args, window: &mut Window, cx: &mut Context<Self>) -> Self {
        let chat = cx.new(ChatView::new);
        let chart = cx.new(|_| ChartView::new());
        let orders = cx.new(|cx| {
            TableState::new(OrdersDelegate::new(), window, cx)
                .col_resizable(false)
                .col_movable(false)
                .sortable(false)
        });

        // Parse the fixtures off the UI thread, then hand them to the views.
        let dir = args.fixtures.clone();
        let loading = cx
            .background_executor()
            .spawn(async move { data::load(&dir) });
        let idle = args.idle;
        cx.spawn_in(window, async move |this, cx| {
            match loading.await {
                Ok(fx) => {
                    let _ = this.update(cx, |this, cx| this.install(fx, cx));
                }
                Err(error) => eprintln!("fixtures: {error}"),
            }
            if idle {
                return;
            }
            // Deadline-based timers so work time does not stretch the period.
            let (chat_period, chart_period) =
                (Duration::from_millis(50), Duration::from_millis(250));
            let start = Instant::now();
            let (mut next_chat, mut next_chart) = (start + chat_period, start + chart_period);
            loop {
                let next = next_chat.min(next_chart);
                let now = Instant::now();
                if next > now {
                    cx.background_executor().timer(next - now).await;
                }
                let now = Instant::now();
                let tick_chat = now >= next_chat;
                let tick_chart = now >= next_chart;
                if tick_chat {
                    next_chat += chat_period;
                }
                if tick_chart {
                    next_chart += chart_period;
                }
                let alive = this.update(cx, |this, cx| {
                    if !this.paused {
                        if tick_chat {
                            this.chat.update(cx, |chat, cx| chat.step(cx));
                        }
                        if tick_chart {
                            this.chart.update(cx, |chart, cx| chart.tick(cx));
                        }
                    }
                });
                if alive.is_err() {
                    return;
                }
            }
        })
        .detach();

        Self {
            chat,
            chart,
            orders,
            paused: false,
            pause_hover: false,
            idle: args.idle,
            marker: args.marker,
            marker_armed: false,
            loaded: false,
        }
    }

    fn install(&mut self, fx: Fixtures, cx: &mut Context<Self>) {
        self.loaded = true;
        self.chart.update(cx, |chart, cx| chart.install(&fx, cx));
        let idle = self.idle;
        let messages = fx.messages;
        self.chat.update(cx, |chat, cx| {
            chat.set_transcript(messages);
            if idle {
                chat.show_all(cx);
            }
        });
        let rows = fx.orders;
        self.orders.update(cx, |table, cx| {
            table.delegate_mut().rows = rows;
            table.refresh(cx);
        });
        cx.notify();
    }

    /// Write the marker once the first frame showing the loaded fixtures has been presented
    /// (armed from the first render after `install`, which hands data to chart, table and chat).
    ///
    /// `Window::on_next_frame` callbacks run at the start of the next frame request, i.e. after the
    /// frame that contained this render was drawn and presented by the previous request handler.
    /// The callback hops once more so that the very first draw (which can be made while the
    /// window is still being created) is certainly presented before the file is written.
    fn arm_marker(&mut self, window: &mut Window) {
        if self.marker_armed {
            return;
        }
        self.marker_armed = true;
        let Some(path) = self.marker.clone() else {
            return;
        };
        window.on_next_frame(move |window, _| {
            window.on_next_frame(move |_, _| {
                let millis = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map_or(0, |d| d.as_millis());
                let _ = std::fs::write(path, millis.to_string());
            });
        });
    }

    fn header(&mut self, window: &mut Window, cx: &mut Context<Self>) -> AnyElement {
        let hovered = self.pause_hover;
        let policy = Transition::new(Duration::from_millis(150));
        let accent = theme::accent();
        let (bg_target, border_target) = if hovered {
            (accent.opacity(0.30), accent.opacity(0.80))
        } else {
            (accent.opacity(0.12), theme::color(theme::BORDER_MEDIUM))
        };
        let bg = transition("pause-bg", bg_target, policy.clone(), window, cx);
        let border = transition("pause-border", border_target, policy, window, cx);
        let label = if self.paused { "Resume" } else { "Pause" };

        div()
            .flex()
            .flex_row()
            .items_center()
            .justify_between()
            .flex_none()
            .h(px(48.))
            .px(px(16.))
            .bg(theme::color(theme::HEADER_BG))
            .border_b_1()
            .border_color(theme::color(theme::BORDER_SUBTLE))
            .child(
                div()
                    .text_color(theme::color(theme::TEXT_PRIMARY))
                    .font_weight(FontWeight::SEMIBOLD)
                    .child("Spike - GPUI"),
            )
            .child(
                div()
                    .id("pause")
                    .flex()
                    .items_center()
                    .justify_center()
                    .h(px(30.))
                    .px(px(16.))
                    .rounded(px(8.))
                    .border_1()
                    .border_color(border)
                    .bg(bg)
                    .text_color(theme::color(theme::TEXT_PRIMARY))
                    .cursor_pointer()
                    .on_hover(cx.listener(|this, hovered: &bool, _, cx| {
                        this.pause_hover = *hovered;
                        cx.notify();
                    }))
                    .on_click(cx.listener(|this, _, _, cx| {
                        this.paused = !this.paused;
                        cx.notify();
                    }))
                    .child(label),
            )
            .into_any_element()
    }
}

impl Render for Spike {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        if self.loaded {
            self.arm_marker(window);
        }
        let card = theme::color(theme::CARD_BG);
        let subtle = theme::color(theme::BORDER_SUBTLE);
        let font_size = cx.theme().font_size;
        let header = self.header(window, cx);
        let table_height = px(280.);

        div()
            .size_full()
            .flex()
            .flex_col()
            .bg(theme::color(theme::WINDOW_BG))
            .text_color(theme::color(theme::TEXT_PRIMARY))
            .text_size(font_size)
            .child(header)
            .child(
                div()
                    .flex()
                    .flex_row()
                    .flex_1()
                    .min_h_0()
                    .gap(px(8.))
                    .p(px(8.))
                    .child(
                        div()
                            .w(px(420.))
                            .h_full()
                            .flex_none()
                            .child(self.chat.clone()),
                    )
                    .child(
                        div()
                            .flex()
                            .flex_col()
                            .flex_1()
                            .min_w_0()
                            .gap(px(8.))
                            .child(
                                div()
                                    .flex_1()
                                    .min_h_0()
                                    .rounded(px(12.))
                                    .bg(card)
                                    .border_1()
                                    .border_color(subtle)
                                    .overflow_hidden()
                                    .child(self.chart.clone()),
                            )
                            .child(
                                div()
                                    .h(table_height)
                                    .flex_none()
                                    .rounded(px(12.))
                                    .bg(card)
                                    .border_1()
                                    .border_color(subtle)
                                    .overflow_hidden()
                                    .child(
                                        DataTable::new(&self.orders).bordered(false).stripe(true),
                                    ),
                            ),
                    ),
            )
    }
}
