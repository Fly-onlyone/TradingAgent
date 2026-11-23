---
tags: [desktop, agent, okx, orders, notifications]
---

# Order Mirror

> The app has no write path to OKX of its own. Orders are placed by the trade kit; what became of
> them is learned by asking OKX every 30 seconds. Code: `src/TradingAgent.Agent/Orders/OrderMirror.cs`.

## What it does

`OrderMirror` is a background service. One pass (`RunOnceAsync`):

1. For `SPOT` and `SWAP`: read the open orders and the last 50 finished ones.
2. For each order, find its row in `orders`: by OKX's order id, or else by the client order id.
   - **No row** → add one. An order placed in the OKX app or by another program gets a row too.
   - **A pending row of the [[Risk Gate]]** → fill it in: OKX's id and numbers, `pending_until`
     cleared.
   - **A row whose state or filled size changed** → update it.
3. Close the pending rows whose time ran out (below).
4. Read the pending stop orders (`conditional`, `oco`, `trigger`, `move_order_stop`) and add a row
   for each new one.

For an order the agent placed, every change also:

- writes the order's state into the tool call that placed it (`SetResultSummary` by `tool_use_id`)
  and publishes `MessageUpdated`, so the chat shows it without a new message;
- raises a notification when the order is filled or cancelled.

| OKX state | `orders.status` |
|---|---|
| `live` | `open` |
| `partially_filled` | `partially_filled` |
| `filled` | `filled` |
| `canceled`, `mmp_canceled` | `cancelled` |
| anything else | the row is left as it is, and a warning is logged |

## Orders that were never placed

The gate's pending row waits two minutes for the exchange. A pending row that OKX still does
not know after that time is closed as `rejected`: the order was refused or never reached the
exchange. The tool call's bubble gets `not_placed` and the user is told.

- **Closed, not deleted.** The row is the record that the app tried. The old app deleted it.
- **Only in a pass that asked OKX successfully.** With no key, no network or a rate limit nothing is
  closed: not knowing is not the same as "not placed". The old app deleted on a timer alone.
- **Self-correcting.** If OKX shows the order later after all, the row is found by its client order
  id and corrected.

## Notifications

`NotificationService` (`src/TradingAgent.Data/Notifications/`) is the one way the app tells the user
something happened: a row in `notifications` and, when allowed, a Windows toast.

- A kind the user switched off (`notifications.trade_executions` and its siblings) writes nothing.
- With `notifications.native_enabled` off the row is written and no toast is shown.
- At most one notification per order in 30 seconds.
- A toast that cannot be shown does not lose the row and does not stop the mirror.
- Only the agent's own orders raise notifications.

## Gotchas

- **Numbers are OKX's own.** For a swap, `quantity` and `filled_quantity` are contracts, not coins.
  For a spot market buy sized in the quote currency, `quantity` is that quote amount.
- **Stop orders are added, never updated.** A stop that triggered or was cancelled stays `open` in
  its row: the reader has no call for finished stop orders yet.
- **The mirror reads the mode the app is in** (`okx.sandbox`). An order placed in the other mode is
  not seen until the mode is switched back; its pending row is closed meanwhile and corrected later.
- **Only a client order id made by the gate is kept as the row's unique key.** Ids chosen elsewhere
  may repeat.
- **After "too many requests"** the next pass waits twice as long, up to five minutes.
- **No real order has been mirrored.** Tested against a fake exchange.

## See also

- [[Risk Gate]] — writes the pending row
- [[Trade Kit Sidecar]] — places the order
- [[Agent Runs]] — the tool call and the events
- [[Exchange and Risk]] — the read-only client the mirror asks
