"""Generates the deterministic fixtures shared by the three UI spike candidates.

Run from anywhere: ``python spikes/fixtures/generate.py``. Output is byte-identical on every
run (fixed seed, fixed float formatting), so all candidates render the same data.
"""

from __future__ import annotations

import json
import random
from pathlib import Path

HERE = Path(__file__).parent
SEED = 20261122
START_TS = 1_790_000_000  # fixed epoch second; keeps the time axis identical everywhere
SYMBOLS = ["BTC-USDT", "ETH-USDT", "SOL-USDT", "XRP-USDT", "DOGE-USDT", "ADA-USDT"]
STATUSES = ["filled", "filled", "filled", "canceled", "partially_filled", "live"]


def _dump(name: str, payload: object) -> None:
    text = json.dumps(payload, separators=(",", ":"))
    (HERE / name).write_text(text + "\n", encoding="utf-8", newline="\n")


def candles(rng: random.Random) -> tuple[list[list[float]], float]:
    rows: list[list[float]] = []
    closes: list[float] = []
    price = 64_000.0
    for i in range(5_000):
        open_ = price
        close = max(100.0, open_ * (1 + rng.gauss(0, 0.0012)))
        high = max(open_, close) * (1 + abs(rng.gauss(0, 0.0006)))
        low = min(open_, close) * (1 - abs(rng.gauss(0, 0.0006)))
        volume = round(rng.uniform(5, 250), 3)
        closes.append(close)
        window = closes[-20:]
        sma = sum(window) / len(window)
        rows.append(
            [
                START_TS + i * 60,
                round(open_, 2),
                round(high, 2),
                round(low, 2),
                round(close, 2),
                volume,
                round(sma, 2),
            ]
        )
        price = close
    return rows, price


def ticks(rng: random.Random, last_price: float) -> list[float]:
    prices: list[float] = []
    price = last_price
    for _ in range(1_200):
        price = max(100.0, price * (1 + rng.gauss(0, 0.0004)))
        prices.append(round(price, 2))
    return prices


def orders(rng: random.Random) -> list[list[object]]:
    rows: list[list[object]] = []
    for i in range(10_000):
        symbol = rng.choice(SYMBOLS)
        side = rng.choice(["buy", "sell"])
        kind = rng.choice(["limit", "market", "stop"])
        price = round(rng.uniform(0.1, 70_000), 2)
        size = round(rng.uniform(0.001, 50), 4)
        status = rng.choice(STATUSES)
        filled = (
            size
            if status == "filled"
            else (round(size * rng.random(), 4) if status == "partially_filled" else 0.0)
        )
        rows.append(
            [
                f"s{i:024x}-{rng.randrange(16**4):04x}",
                START_TS + i * 37,
                symbol,
                side,
                kind,
                price,
                size,
                filled,
                status,
            ]
        )
    return rows


def transcript(rng: random.Random) -> str:
    messages: list[str] = []
    for n in range(1, 13):
        symbol = rng.choice(SYMBOLS)
        bias = rng.choice(["bullish", "bearish", "neutral"])
        entry = round(rng.uniform(100, 70_000), 2)
        stop = round(entry * 0.98, 2)
        target = round(entry * 1.05, 2)
        rsi = rng.randint(22, 78)
        messages.append(
            f"## Analysis {n}: {symbol}\n\n"
            f"The 4-hour structure is **{bias}**. Price holds above the 20-period moving average and "
            f"volume confirms the move; RSI reads `{rsi}`, which leaves room before the *overbought* band. "
            f"Funding is flat, so the move is spot-driven rather than leverage-driven.\n\n"
            f"### Plan\n\n"
            f"1. Wait for a retest of **{entry}** on the 15-minute chart.\n"
            f"2. Enter with a limit order; do not chase a breakout candle.\n"
            f"3. Place the stop at `{stop}` and scale out at `{target}`.\n\n"
            f"- Risk per trade: 1% of equity\n"
            f"- Leverage: 3x, isolated margin\n"
            f"- Invalidated by a 4-hour close below the stop\n\n"
            f"| Level | Price | Distance |\n"
            f"|---|---|---|\n"
            f"| Entry | {entry} | 0.00% |\n"
            f"| Stop | {stop} | -2.00% |\n"
            f"| Target | {target} | +5.00% |\n\n"
            f"```json\n"
            f'{{"instId": "{symbol}", "side": "buy", "ordType": "limit", "px": "{entry}", "sz": "0.25"}}\n'
            f"```\n\n"
            f"> Risk gate verdict: **PROCEED**. Position size is within the configured cap.\n"
        )
    return "\n<<<MSG>>>\n".join(messages)


def main() -> None:
    rng = random.Random(SEED)
    candle_rows, last_price = candles(rng)
    _dump(
        "candles.json",
        {"interval_s": 60, "columns": ["t", "o", "h", "l", "c", "v", "sma20"], "rows": candle_rows},
    )
    _dump("ticks.json", {"interval_ms": 250, "candle_every": 20, "prices": ticks(rng, last_price)})
    _dump(
        "orders.json",
        {
            "columns": [
                "id",
                "time",
                "symbol",
                "side",
                "type",
                "price",
                "size",
                "filled",
                "status",
            ],
            "rows": orders(rng),
        },
    )
    (HERE / "transcript.md").write_text(transcript(rng), encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
