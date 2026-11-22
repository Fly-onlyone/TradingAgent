//! Orders table: gpui-component `DataTable` with a `TableDelegate` over 10,000 rows.
//! The table realizes only the visible rows.

use gpui_kit::component::table::{Column, TableDelegate, TableState};
use gpui_kit::prelude::*;
use gpui_kit::*;

use crate::data::{Order, format_time};
use crate::theme;

const COLUMNS: [(&str, f32, bool); 9] = [
    ("id", 215., false),
    ("time", 150., false),
    ("symbol", 95., false),
    ("side", 55., false),
    ("type", 65., false),
    ("price", 90., true),
    ("size", 90., true),
    ("filled", 90., true),
    ("status", 95., false),
];

pub struct OrdersDelegate {
    pub rows: Vec<Order>,
    columns: Vec<Column>,
}

impl OrdersDelegate {
    pub fn new() -> Self {
        let columns = COLUMNS
            .iter()
            .map(|&(name, width, right)| {
                let column = Column::new(name, name).width(px(width)).resizable(false);
                if right { column.text_right() } else { column }
            })
            .collect();
        Self {
            rows: Vec::new(),
            columns,
        }
    }
}

impl TableDelegate for OrdersDelegate {
    fn columns_count(&self, _: &App) -> usize {
        self.columns.len()
    }

    fn rows_count(&self, _: &App) -> usize {
        self.rows.len()
    }

    fn column(&self, col_ix: usize, _: &App) -> Column {
        self.columns[col_ix].clone()
    }

    fn render_td(
        &mut self,
        row_ix: usize,
        col_ix: usize,
        _: &mut Window,
        _: &mut Context<TableState<Self>>,
    ) -> impl IntoElement {
        let order = &self.rows[row_ix];
        let text: SharedString = match col_ix {
            0 => order.id.clone().into(),
            1 => format_time(order.time).into(),
            2 => order.symbol.clone().into(),
            3 => order.side.clone().into(),
            4 => order.kind.clone().into(),
            5 => format!("{:.2}", order.price).into(),
            6 => format!("{:.4}", order.size).into(),
            7 => format!("{:.4}", order.filled).into(),
            _ => order.status.clone().into(),
        };
        let cell = div()
            .when(COLUMNS[col_ix].2, |d| d.text_right())
            .child(text);
        if col_ix == 3 {
            let color = if order.side == "buy" {
                theme::bullish()
            } else {
                theme::bearish()
            };
            cell.text_color(color)
        } else {
            cell
        }
    }
}
