---
tags: [desktop, exchange, risk]
---

# Exchange and Risk

> The native app's read-only OKX client, the technical indicators and the risk score for a proposed
> trade. Code: `src/TradingAgent.Exchange/`.

## What it does

- **`OkxClient`** (`Okx/`) reads market and account data from the OKX REST API: ticker, tickers,
  order book, price history, instruments, balance, positions, open orders, order history, pending
  algo orders. Private requests are signed with the saved key (HMAC-SHA256 over time, method, path).
- **`Indicators`** (`Analysis/`) computes, for the newest bar: SMA 20 and 50, trend, RSI 14, ATR 14
  and Bollinger bands (20, 2). At least 50 bars are needed.
- **`RiskManager`** (`Risk/`) scores a trade from 0 to 115. No model is involved.

| Rule | Points |
|---|---|
| Position larger than the limit (`risk.max_position_size_pct`, default 5 %) | +30 |
| Position larger than 80 % of the limit (also when the rule above fired) | +15 |
| Buying with RSI above 70, or selling with RSI below 30 | +20 |
| Buying above 90 % of the Bollinger range, or selling below 10 % | +15 |
| ATR above 5 % of the price | +20 |
| Buying in a bearish trend, or selling in a bullish one | +15 |

60 or more is `Avoid` (the risk gate refuses the trade), 40 is `Caution`, 20 is `Acceptable`, less
is `Proceed`. Size alone adds at most 45, so a trade is refused only when size and market conditions
are bad together.

- **Agent tools** (`src/TradingAgent.Agent/Tools/MarketTools.cs`): `get_ticker`, `get_candlesticks`,
  `get_orderbook`, `get_technical_indicators`, `get_account_balance`, `get_positions`,
  `get_open_orders`. All read-only.

## Gotchas

- **`OkxClient` has no write method, and must never get one.** Orders are placed, changed and
  cancelled only by the OKX Agent Trade Kit behind the risk gate. A test fails if the class gains a
  public method that does not start with `Get`, or sends anything but a GET.
- **Demo and live are different environments with different API keys.** The header
  `x-simulated-trading: 1` is sent on every request, public ones too, while `okx.sandbox` is on, so
  the prices used for risk checks come from where the orders go. (The previous app always read the
  live environment.)
- **The indicators match the previous app's library (`ta`) to six decimals**; the tests hold its
  values for two fixed series. The risk thresholds were tuned on those formulas: RSI and ATR use
  Wilder's smoothing, Bollinger bands the population standard deviation.
- **Nothing is rounded to two decimals** any more. The previous app did, which made every indicator
  of a coin priced in fractions of a cent zero.
- **A perfectly flat price has an RSI of 100** (no falls at all). Test fixtures use a quiet market
  that alternates around a price instead.
- **"Could not assess" is an exception, never a low score.** When the balance or the price cannot
  be read, `AssessTradeAsync` throws; a caller must not read that as safe.
- OKX sends numbers as strings and an empty string for "no value"; both are read as numbers, the
  empty one as zero.
- Price history comes newest first from OKX and is turned around: everything here is oldest first.

## Checking against the real exchange

`tests/TradingAgent.Exchange.Tests/LiveOkxTests.cs` calls OKX's public market data (no key, no
account). It is skipped unless `TRADINGAGENT_LIVE_TESTS=1`:

```
$env:TRADINGAGENT_LIVE_TESTS = '1'
dotnet test tests/TradingAgent.Exchange.Tests --filter "FullyQualifiedName~LiveOkxTests"
```

The private endpoints (balance, positions, orders) have not been called with a real key.

## See also

- [[_index]]
- [[Agent Runs]]
- [[Desktop Solution Layout]]
