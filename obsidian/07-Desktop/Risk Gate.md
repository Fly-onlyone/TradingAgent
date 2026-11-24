---
tags: [desktop, agent, okx, risk, safety]
---

# Risk Gate

> Every order, cancel, transfer and leverage change the agent asks for passes `RiskGate` before it
> reaches OKX. Fail closed: the gate allows only what it can name, measure and record.
> Code: `src/TradingAgent.Agent/Atk/RiskGate.cs`.

## Where it sits

`AtkService.CallAsync` is the only code that sends a tool call to the trade kit (see
[[Trade Kit Sidecar]]). For a tool that writes it asks the gate first, in line. There is no second
path to the kit, so the gate cannot be left out by a caller. Before it asks, the service itself
refuses when:

- the tool is not in the inventory, or is a write the gate has no rule for;
- the kit is not running, or is restarting (calls are refused, not queued);
- the kit's mode differs from `okx.sandbox` (a restart is on its way; the order would go to the
  wrong exchange).

A restart waits up to 10 s for calls under way, so an order is not cut off between the gate's yes and
the answer of the exchange.

## The rules, in order

1. Not a supported write of the inventory → refused.
2. Arguments that are not a JSON object, or that give one argument twice → refused.
3. **Emergency stop** (`safety.emergency_stop_active`) refuses everything except cancelling.
4. **Cancel** (8 tools) → allowed, logged.
5. **Leverage** (`spot_set_leverage`, `swap_set_leverage`) → a whole number from 1 to 10.
6. **Transfer** (`account_transfer`) → more than zero, at most 1000, USDT or USDC only, between the
   funding account (6) and the trading account (18) only, never a sub-account.
7. **Place** (`spot_place_order`, `swap_place_order`):
   - `instId`, `side` (`buy` / `sell`), `ordType` and `sz` must be there and well-formed; a price is
     required for anything but a market order.
   - The size becomes a **value in the quote currency** (table below). What the gate cannot convert,
     it refuses.
   - One tool call places one order: a second attempt under the same tool call is refused.
   - **Hard limit on one position**: what is already held in the instrument plus this order may not
     be more than `risk.max_position_size_pct` of the account (default 5 %). Held means the coin's
     balance for spot, every open position of that swap for a swap; a long and a short are added.
   - `RiskManager` (see [[Exchange and Risk]]) must assess the trade. `Avoid` → refused. A price,
     contract or balance that cannot be read → refused.
   - The gate gives the order **its own client order id** and writes a pending row in `orders`
     before the order is let through. A row that cannot be written → refused.

Any exception inside the gate is a refusal. The reason given to the model never carries the inner
error text; that goes to the log.

## What a size means

| Order | `sz` is | Sent on as |
|---|---|---|
| Spot market buy | quote currency (OKX's default), or coins with `tgtCcy: base_ccy` | `tgtCcy` written out |
| Spot market sell | coins (OKX's default), or quote currency with `tgtCcy: quote_ccy` | `tgtCcy` written out |
| Spot limit, post_only, fok, ioc | coins. `tgtCcy: quote_ccy` is **refused**: OKX ignores it there and would read "100 dollars" as 100 coins | `tgtCcy` left out |
| Swap | contracts. Value = contracts × `ctVal` × `ctMult` × price (linear) or contracts × `ctVal` × `ctMult` (inverse). `quote_ccy` and `margin` are refused | `tgtCcy: base_ccy` |

- A limit order is valued at the **higher** of its price and the market, so it is never assessed as
  smaller than it can turn out.
- Numbers must be plain: digits and at most one decimal point. No sign, exponent, spaces, `NaN` or
  `Infinity`.
- One contract can be 1000 coins (`DOGE-USDT-SWAP`). The old app passed `sz` to the risk check as if
  it were coins.

## The client order id

`s` + the 24 characters of the session id + 6 random hex characters: 31 letters and digits (OKX
allows letters and digits, up to 32). Made by `ClientOrderId.New`; `ClientOrderId.SessionOf` reads
the session back. The model's own `clOrdId` is always replaced. The old app let the model choose the
id and used a `-`, which OKX does not allow.

## The pending row

`OrderStubRepository` (`src/TradingAgent.Data/Trading/`) writes a row in `orders` with status
`pending`, source `atk_mirror`, the client order id (also as `execution_idempotency_key`, which is
unique), the session, the message and the `tool_use_id`, and `pending_until` two minutes ahead. The
[[Order Mirror]] fills the row in from the exchange, and closes it as `rejected` when the exchange
still does not know the order after that time.

## Writing tools without a rule

Refused, and not shown to the model: amending orders, algo orders, the batch tools, closing a whole
position, and the grid and DCA bots (14 tools; `AtkToolCatalog.IsSupportedWrite`). To add one: write
its rule in `RiskGate`, add it to the set, add tests.

## Orders that only reduce a position

A spot sell with `tdMode: cash` and a swap order with `reduceOnly: true` skip the position limit and
the `RiskManager` assessment. Everything else still applies: plain arguments, one order per tool
call, the gate's client order id, the pending row, emergency stop.

- **Why:** both checks exist to keep exposure from growing. The old gate scored a sell like a buy,
  so a large sell into a falling market (oversold, at the lower band, volatile) was refused: the way
  out was shut when it was needed.
- **Why it is safe:** the exchange enforces "only smaller" for both. A cash sell cannot sell more
  than is held; a reduce-only order cannot open or grow a position.
- A spot sell on margin (`cross`, `isolated`) or without `tdMode`, and a swap order without
  `reduceOnly: true`, can open a short. They are held to the limit and the assessment.
- No account read is needed for a reducing order, so it works when the balance cannot be read.

## Decided by the owner (2026-11-23)

- **Size alone refuses an order.** Before, `risk.max_position_size_pct` only added points to the
  score, at most 45 of the 60 that refuse, so an order of 90 % of the account passed in a calm
  market. It is now a hard limit, as above. The score is unchanged and still applies under the limit.
- **Reducing orders are let out**, as above.

## Gotchas

- **The limit is 5 % until there is a Settings screen**: `risk.max_position_size_pct` can only be
  changed in the database for now. An account that already holds more than that of a coin can buy no
  more of it through the agent.
- **No order has been placed with this code, not even in demo.** The tests use a fake exchange, the
  real kit without a key, and real public market data. The first demo order should be watched.
- `ISettingsStore` returns the default when a stored value is unreadable. For
  `safety.emergency_stop_active` the default is "off".
- When the kit does not answer a write, the outcome is unknown. The tool result says so and tells the
  model to read the open orders before trying again.

## See also

- [[Trade Kit Sidecar]]
- [[Order Mirror]]
- [[Exchange and Risk]]
- [[Agent Runs]]
