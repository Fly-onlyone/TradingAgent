---
tags: [desktop, trading, orders, learning]
---

# Trades and Learning

> What each closed trade came to, what is learned from it, and what past price signals were worth.
> Code: `src/TradingAgent.Agent/Orders/TradeLearner.cs`, `PatternMiner.cs`,
> `src/TradingAgent.Data/Trading/TradeRepository.cs`, pages in
> `src/TradingAgent.App/ViewModels/TradingViewModels.cs`.

## Profit and loss per order

OKX reports profit per position; the app needs it per order. `TradeLearner` works it out from the
fills the [[Order Mirror]] collected, first in first out per instrument:

- a fill on the side of the position (or with no position) adds to it at the average entry price;
- a fill on the other side closes that much of it: result = (exit - entry) x size, with the sign of
  the position, times the amount of the coin one unit stands for (1 for spot, the contract value for
  a linear swap);
- on a swap, what is left of the order after the position is closed opens one the other way.

What it leaves out, and says so on the Trades page: **fees and funding**. So the figures are close
to, not equal to, what OKX shows.

What it leaves empty rather than get wrong:

- a spot sale with nothing bought through the app (coins held before the app existed);
- inverse contracts, whose value is not in the quote currency;
- a swap while the contract sizes cannot be read from OKX; it waits for the next pass.

A result is written once (`SetResult` only where `realized_pnl` is empty) and never rewritten: a
later pass must not change a figure a page already showed.

## Lessons

Every result becomes one row in `trade_lessons`: outcome, percentage, amount, duration, and one
sentence ("BTC-USDT long closed with a profit of 2 % (10) after 5 hours. Entry 50000, exit 51000.").
No model writes it. The agent finds lessons with `search_knowledge`
([[Knowledge and Search]]).

## Patterns

`PatternMiner` (off by default, Settings) counts on the last 300 one-hour bars of each chosen
instrument what followed four signals 12 bars later: RSI falling below 30, RSI rising above 70, a
close above the 20-bar high, a close crossing above the 50-bar average. A signal with fewer than
five cases is not stored; the number of cases is stored with every pattern, because a pattern with
few cases says little. Again no model: counted, not judged.

## What the agent gets

- `analyze_market`: one call for an instrument's price, indicators on four timeframes, the balance
  of the order book, the stored patterns and the newest news. It stands where the previous app had
  helper agents; it is computation, not a second model run.
- `get_trade_history`: the closed trades and the totals of 1, 7 and 30 days.

## Pages

- **Dashboard**: account value, holdings, positions (read from OKX when the page is shown), newest
  orders, and the result of the closed trades.
- **Trading**: a candlestick chart drawn by hand (`Controls/CandleChart`: zoom with the wheel, move
  by dragging, 20-bar average), refreshed every 15 seconds while the page is shown.
- **Orders**, **Trades**: the tables above.

There is no order form. An order is asked of the agent, so that it passes the [[Risk Gate]]; a form
would be a second way to the exchange.

## See also

- [[Order Mirror]]
- [[Exchange and Risk]]
