import httpx
import pytest
from app.exchange.okx_client import OKXClient


@pytest.mark.asyncio
async def test_traced_retries_httpx_request_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    client = OKXClient()
    request = httpx.Request("GET", "https://www.okx.com/api/v5/market/ticker")
    calls = 0

    async def no_sleep(_: float) -> None:
        return None

    def flaky_call() -> dict[str, str]:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectError("[Errno 11001] getaddrinfo failed", request=request)
        return {"code": "0"}

    monkeypatch.setattr("app.exchange.okx_client.asyncio.sleep", no_sleep)

    result = await client._traced("get_ticker", flaky_call)

    assert result == {"code": "0"}
    assert calls == 2


@pytest.mark.asyncio
async def test_traced_does_not_retry_non_network_errors() -> None:
    client = OKXClient()
    calls = 0

    def bad_call() -> dict[str, str]:
        nonlocal calls
        calls += 1
        raise ValueError("bad payload")

    with pytest.raises(ValueError, match="bad payload"):
        await client._traced("get_ticker", bad_call)

    assert calls == 1
