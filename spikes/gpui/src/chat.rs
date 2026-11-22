//! Chat pane: gpui-component `MessageScroller` (virtualized, tail-following list) whose rows are
//! `TextView`s over a `TextViewState`. Streaming appends with `TextViewState::push_str`, which
//! re-parses incrementally on a background task.

use gpui_kit::component::message_scroller::{MessageScroller, MessageScrollerState};
use gpui_kit::component::text::{TextView, TextViewState};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::theme;

const CHARS_PER_TICK: usize = 12;

pub struct ChatView {
    scroller: Entity<MessageScrollerState>,
    states: Vec<Entity<TextViewState>>,
    transcript: Vec<String>,
    msg_ix: usize,
    byte_pos: usize,
}

impl ChatView {
    pub fn new(cx: &mut Context<Self>) -> Self {
        Self {
            scroller: cx.new(|cx| MessageScrollerState::new(0, cx)),
            states: Vec::new(),
            transcript: Vec::new(),
            msg_ix: 0,
            byte_pos: 0,
        }
    }

    pub fn set_transcript(&mut self, messages: Vec<String>) {
        self.transcript = messages;
    }

    /// `--idle`: show every message completely, with no stream running.
    pub fn show_all(&mut self, cx: &mut Context<Self>) {
        let messages = self.transcript.clone();
        for text in &messages {
            self.states
                .push(cx.new(|cx| TextViewState::markdown(text, cx)));
        }
        self.scroller
            .update(cx, |s, cx| s.reset(messages.len(), cx));
        cx.notify();
    }

    /// One 50 ms stream step: append the next 12 characters, opening new message cards at
    /// `<<<MSG>>>` boundaries, and restart from the first message after the last.
    pub fn step(&mut self, cx: &mut Context<Self>) {
        let mut budget = CHARS_PER_TICK;
        while budget > 0 {
            if self.msg_ix >= self.transcript.len() {
                self.states.clear();
                self.scroller.update(cx, |s, cx| s.reset(0, cx));
                self.msg_ix = 0;
                self.byte_pos = 0;
                break;
            }
            if self.states.len() <= self.msg_ix {
                self.states
                    .push(cx.new(|cx| TextViewState::markdown("", cx)));
                self.scroller.update(cx, |s, cx| {
                    s.append(1, cx);
                });
            }
            let message = &self.transcript[self.msg_ix];
            let rest = &message[self.byte_pos..];
            let end = rest
                .char_indices()
                .nth(budget)
                .map_or(rest.len(), |(i, _)| i);
            let chunk = &rest[..end];
            budget -= chunk.chars().count();
            let state = self.states[self.msg_ix].clone();
            state.update(cx, |s, cx| s.push_str(chunk, cx));
            self.byte_pos += end;
            if self.byte_pos >= message.len() {
                self.msg_ix += 1;
                self.byte_pos = 0;
            }
        }
        let last = self.states.len().saturating_sub(1);
        if !self.states.is_empty() {
            self.scroller
                .update(cx, |s, cx| _ = s.remeasure_items(last..last + 1, cx));
        }
        cx.notify();
    }
}

impl Render for ChatView {
    fn render(&mut self, _window: &mut Window, _cx: &mut Context<Self>) -> impl IntoElement {
        let states = self.states.clone();
        let scroller = MessageScroller::new("chat", self.scroller.clone(), move |ix, _, _| {
            let card = div()
                .w_full()
                .p(px(12.))
                .rounded(px(12.))
                .bg(theme::color(theme::CARD_BG))
                .border_1()
                .border_color(theme::color(theme::BORDER_SUBTLE));
            match states.get(ix) {
                Some(state) => card.child(TextView::new(state).selectable(false)),
                None => card,
            }
        })
        .jump_button(false)
        .with_row_style(StyleRefinement::default().pb(px(8.)).px(px(0.)));
        div().size_full().min_h_0().child(scroller)
    }
}
