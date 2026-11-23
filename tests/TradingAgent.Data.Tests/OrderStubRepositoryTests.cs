using Microsoft.Data.Sqlite;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Trading;
using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class OrderStubRepositoryTests : IDisposable
{
    private static readonly DateTimeOffset _until = DateTimeOffset.FromUnixTimeMilliseconds(1_795_430_000_000);

    private readonly TempDatabase _temp = new();
    private readonly OrderStubRepository _orders;
    private readonly string _sessionId;
    private readonly string _messageId;

    public OrderStubRepositoryTests()
    {
        _orders = new OrderStubRepository(_temp.Database, TimeProvider.System);
        _sessionId = new AgentSessionRepository(_temp.Database, TimeProvider.System).Create().Id;
        _messageId = new SessionMessageRepository(_temp.Database, TimeProvider.System)
            .Append(_sessionId, MessageRole.Assistant, string.Empty, MessageStatus.Running).Id;
    }

    public void Dispose() => _temp.Dispose();

    [Fact]
    public void A_stub_is_a_pending_row_that_names_the_tool_call_it_came_from()
    {
        var stub = Stub("s0123456789abcdef01234567aaaaaa", "toolu_01");

        var id = _orders.Insert(stub);

        Assert.True(Ids.IsValid(id));
        Assert.Equal(stub, _orders.Find(stub.ClientOrderId));
        Assert.Equal("pending", _temp.Scalar<string>("SELECT status FROM orders WHERE id = $id;", ("$id", id)));
        Assert.Equal("atk_mirror", _temp.Scalar<string>("SELECT source FROM orders WHERE id = $id;", ("$id", id)));
        // Both columns carry the id: one for the exchange, one for the unique index.
        Assert.Equal(stub.ClientOrderId, _temp.Scalar<string>("SELECT client_order_id FROM orders WHERE id = $id;", ("$id", id)));
        Assert.Equal(stub.ClientOrderId, _temp.Scalar<string>("SELECT execution_idempotency_key FROM orders WHERE id = $id;", ("$id", id)));
    }

    [Fact]
    public void A_market_order_has_no_price()
    {
        var stub = Stub("s0123456789abcdef01234567aaaaaa", "toolu_01") with { OrderType = "market", Price = null };

        _orders.Insert(stub);

        Assert.Null(_orders.Find(stub.ClientOrderId)!.Price);
    }

    [Fact]
    public void A_second_stub_with_the_same_client_order_id_cannot_be_written()
    {
        _orders.Insert(Stub("s0123456789abcdef01234567aaaaaa", "toolu_01"));

        Assert.Throws<SqliteException>(() => _orders.Insert(Stub("s0123456789abcdef01234567aaaaaa", "toolu_02")));
    }

    [Theory]
    [InlineData(true, false)]
    [InlineData(false, true)]
    public void A_stub_for_a_session_or_message_that_does_not_exist_cannot_be_written(bool unknownSession, bool unknownMessage)
    {
        var stub = Stub("s0123456789abcdef01234567aaaaaa", "toolu_01") with
        {
            SessionId = unknownSession ? Ids.NewId() : _sessionId,
            MessageId = unknownMessage ? Ids.NewId() : _messageId,
        };

        Assert.Throws<SqliteException>(() => _orders.Insert(stub));
    }

    [Fact]
    public void A_tool_call_is_known_by_its_session_and_its_id_together()
    {
        _orders.Insert(Stub("s0123456789abcdef01234567aaaaaa", "toolu_01"));

        Assert.True(_orders.ExistsForToolCall(_sessionId, "toolu_01"));
        Assert.False(_orders.ExistsForToolCall(_sessionId, "toolu_02"));
        Assert.False(_orders.ExistsForToolCall(Ids.NewId(), "toolu_01"));
    }

    [Fact]
    public void A_row_the_exchange_has_answered_for_is_no_longer_a_stub()
    {
        var stub = Stub("s0123456789abcdef01234567aaaaaa", "toolu_01");
        var id = _orders.Insert(stub);

        _temp.Execute("UPDATE orders SET exchange_order_id = '987654', status = 'open' WHERE id = $id;", ("$id", id));

        Assert.Null(_orders.Find(stub.ClientOrderId));
        // The tool call still has its order.
        Assert.True(_orders.ExistsForToolCall(_sessionId, "toolu_01"));
    }

    [Fact]
    public void An_id_nobody_wrote_finds_nothing()
    {
        Assert.Null(_orders.Find("s0123456789abcdef01234567ffffff"));
    }

    private OrderStub Stub(string clientOrderId, string toolUseId) =>
        new(clientOrderId, "BTC-USDT", "buy", "limit", 0.004m, 51_000m, _sessionId, _messageId, toolUseId, _until);
}
