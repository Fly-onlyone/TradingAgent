# Documentation Style Guide

## Core Principles

1. **Document WHY, not WHAT** - Code shows what, comments explain why
2. **Keep it current** - Outdated docs are worse than none
3. **Be concise** - Every word should add value
4. **Use examples** - Show, don't just tell
5. **Write for future you** - You won't remember in 6 months

## Documentation by Element

### Python Functions/Methods

```python
async def calculate_position_size(
    symbol: str,
    risk_percent: float,
    stop_loss_distance: float
) -> float:
    """
    Calculate position size based on risk parameters.

    Uses ATR-based position sizing to limit risk per trade
    to the specified percentage of account equity.

    Args:
        symbol: Trading pair (e.g., "BTC-USDT")
        risk_percent: Max risk as decimal (0.02 = 2%)
        stop_loss_distance: Distance to stop loss in price units

    Returns:
        Position size in base currency units

    Raises:
        ValueError: If risk_percent > 0.05 (5% safety limit)
    """
```

### Python Classes

```python
class RiskManager:
    """
    Manages position sizing and risk controls for trading.

    Enforces max position size, daily loss limits, and provides
    ATR-based position sizing recommendations. Used by OrderExecutor
    before any trade execution.

    Example:
        risk = RiskManager(max_risk=0.02)
        size = await risk.calculate_size("BTC-USDT", stop_loss=100)
    """
```

### TypeScript Functions

```typescript
/**
 * Format a price with appropriate decimal places.
 *
 * @param price - The price to format
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted price string with currency symbol
 *
 * @example
 * formatPrice(1234.5678) // "$1,234.57"
 * formatPrice(0.00001234, 8) // "$0.00001234"
 */
```

### React Components

```typescript
/**
 * Order form for placing buy/sell orders.
 *
 * Handles market and limit orders with real-time price validation.
 * Integrates with RiskManager for position size recommendations.
 *
 * @example
 * <OrderForm symbol="BTC-USDT" onSubmit={handleOrder} />
 */
```

### Complex Logic

```python
# WHY: OKX requires instrument IDs in format "BTC-USDT-SWAP" for perpetuals
# but our internal format uses "BTC-USDT". Convert here to avoid
# spreading exchange-specific logic throughout the codebase.
inst_id = f"{symbol}-SWAP" if is_perpetual else symbol
```

## Skip Documentation For

- Getters/setters with obvious purpose
- Standard CRUD operations with clear names
- Self-documenting code (`get_user_by_id(user_id)`)
- Test files (test names are documentation)
- Pydantic models with Field descriptions

## Section Comments

Use for logical groupings in large files:

```python
# ============================================================
# Market Data Tools
# ============================================================
```

## Words to Avoid

| Avoid | Use Instead |
|-------|-------------|
| "This function..." | Start with verb |
| "Basically" | Remove |
| "Simply" | Remove |
| "Obviously" | Remove |
| "etc." | Be specific |

## API Documentation

FastAPI generates OpenAPI docs automatically. Add descriptions:

```python
@router.get(
    "/orders/{order_id}",
    summary="Get order by ID",
    description="Retrieve a specific order. Returns 404 if not found or not owned by user."
)
async def get_order(order_id: str) -> Order:
    ...
```
