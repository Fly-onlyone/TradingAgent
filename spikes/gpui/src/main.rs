#![windows_subsystem = "windows"]

mod app;
mod chart;
mod chat;
mod data;
mod orders;
mod theme;

use std::path::PathBuf;

use gpui_kit::*;

use app::{Args, Spike};

fn parse_args() -> Args {
    let mut args = Args {
        fixtures: PathBuf::from("../fixtures"),
        marker: None,
        idle: false,
    };
    let mut it = std::env::args().skip(1);
    while let Some(arg) = it.next() {
        match arg.as_str() {
            "--fixtures" => {
                if let Some(v) = it.next() {
                    args.fixtures = PathBuf::from(v);
                }
            }
            "--marker" => args.marker = it.next().map(PathBuf::from),
            "--idle" => args.idle = true,
            _ => {}
        }
    }
    args
}

fn main() {
    let args = parse_args();
    gpui_kit::application().run(move |cx| {
        gpui_kit::init(cx);
        theme::init(cx);
        let options = WindowOptions {
            window_bounds: Some(WindowBounds::Windowed(Bounds::centered(
                None,
                size(px(1400.), px(900.)),
                cx,
            ))),
            titlebar: Some(TitlebarOptions {
                title: Some("Spike - GPUI".into()),
                ..Default::default()
            }),
            ..Default::default()
        };
        gpui_kit::open_window(options, cx, move |window, cx| {
            cx.new(|cx| Spike::new(args, window, cx))
        })
        .expect("failed to open the window");
        cx.activate(true);
    });
}
