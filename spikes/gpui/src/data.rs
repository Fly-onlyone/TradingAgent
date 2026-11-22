//! Fixture loading (runs on a background thread) and small formatting helpers.

use std::path::Path;

use gpui_kit::SharedString;
use serde::Deserialize;

/// One candlestick plus the pre-formatted label the chart uses as its x key.
#[derive(Clone)]
pub struct Candle {
    pub t: i64,
    pub o: f64,
    pub h: f64,
    pub l: f64,
    pub c: f64,
    pub label: SharedString,
}

impl Candle {
    pub fn new(t: i64, o: f64, h: f64, l: f64, c: f64) -> Self {
        Self {
            t,
            o,
            h,
            l,
            c,
            label: format_label(t).into(),
        }
    }
}

pub struct Order {
    pub id: String,
    pub time: i64,
    pub symbol: String,
    pub side: String,
    pub kind: String,
    pub price: f64,
    pub size: f64,
    pub filled: f64,
    pub status: String,
}

pub struct Fixtures {
    pub candles: Vec<Candle>,
    pub sma: Vec<f64>,
    pub ticks: Vec<f64>,
    pub candle_every: usize,
    pub orders: Vec<Order>,
    pub messages: Vec<String>,
}

#[derive(Deserialize)]
struct CandlesFile {
    rows: Vec<(i64, f64, f64, f64, f64, f64, f64)>,
}

#[derive(Deserialize)]
struct TicksFile {
    candle_every: usize,
    prices: Vec<f64>,
}

type OrderRow = (String, i64, String, String, String, f64, f64, f64, String);

#[derive(Deserialize)]
struct OrdersFile {
    rows: Vec<OrderRow>,
}

pub fn load(dir: &Path) -> Result<Fixtures, String> {
    let read = |name: &str| {
        std::fs::read(dir.join(name)).map_err(|e| format!("{}: {e}", dir.join(name).display()))
    };
    let parse_err = |name: &str, e: serde_json::Error| format!("{name}: {e}");

    let candles: CandlesFile =
        serde_json::from_slice(&read("candles.json")?).map_err(|e| parse_err("candles.json", e))?;
    let ticks: TicksFile =
        serde_json::from_slice(&read("ticks.json")?).map_err(|e| parse_err("ticks.json", e))?;
    let orders: OrdersFile =
        serde_json::from_slice(&read("orders.json")?).map_err(|e| parse_err("orders.json", e))?;
    let transcript = String::from_utf8(read("transcript.md")?).map_err(|e| e.to_string())?;

    let sma = candles.rows.iter().map(|r| r.6).collect();
    let candles = candles
        .rows
        .iter()
        .map(|r| Candle::new(r.0, r.1, r.2, r.3, r.4))
        .collect();
    let orders = orders
        .rows
        .into_iter()
        .map(|r| Order {
            id: r.0,
            time: r.1,
            symbol: r.2,
            side: r.3,
            kind: r.4,
            price: r.5,
            size: r.6,
            filled: r.7,
            status: r.8,
        })
        .collect();
    let mut messages = Vec::new();
    let mut current = String::new();
    for line in transcript.lines().chain(Some("<<<MSG>>>")) {
        if line == "<<<MSG>>>" {
            let text = current.trim();
            if !text.is_empty() {
                messages.push(text.to_string());
            }
            current.clear();
        } else {
            current.push_str(line);
            current.push('\n');
        }
    }

    Ok(Fixtures {
        candles,
        sma,
        ticks: ticks.prices,
        candle_every: ticks.candle_every.max(1),
        orders,
        messages,
    })
}

/// Civil date and time (UTC) of a Unix timestamp, via Howard Hinnant's algorithm.
fn civil(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let days = secs.div_euclid(86_400);
    let rem = secs.rem_euclid(86_400);
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (
        y,
        m,
        d,
        (rem / 3600) as u32,
        (rem % 3600 / 60) as u32,
        (rem % 60) as u32,
    )
}

/// `YYYY-MM-DD HH:MM:SS` in UTC.
pub fn format_time(secs: i64) -> String {
    let (y, mo, d, h, mi, s) = civil(secs);
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{mi:02}:{s:02}")
}

/// `MM-DD HH:MM`, the chart's time-axis label (unique per one-minute candle across a few days).
fn format_label(secs: i64) -> String {
    let (_, mo, d, h, mi, _) = civil(secs);
    format!("{mo:02}-{d:02} {h:02}:{mi:02}")
}
