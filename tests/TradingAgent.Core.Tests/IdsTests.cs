using System.Globalization;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class IdsTests
{
    [Fact]
    public void New_id_is_24_lowercase_hex_characters()
    {
        var id = Ids.NewId();

        Assert.Equal(24, id.Length);
        Assert.True(Ids.IsValid(id));
    }

    [Fact]
    public void New_id_starts_with_the_creation_time_in_seconds()
    {
        var now = DateTimeOffset.FromUnixTimeSeconds(1_790_000_000);

        var id = Ids.NewId(now);

        Assert.Equal(1_790_000_000u, uint.Parse(id[..8], NumberStyles.HexNumber, CultureInfo.InvariantCulture));
    }

    [Fact]
    public void Ids_created_in_the_same_second_differ()
    {
        var now = DateTimeOffset.UtcNow;

        var ids = Enumerable.Range(0, 1000).Select(_ => Ids.NewId(now)).ToHashSet(StringComparer.Ordinal);

        Assert.Equal(1000, ids.Count);
    }

    [Fact]
    public void Session_id_fits_the_okx_client_order_id_limit()
    {
        // clOrdId = "s" + session id + "-" + 4 hex nonce; OKX allows at most 32 characters.
        var clientOrderId = $"s{Ids.NewId()}-0a1b";

        Assert.Equal(30, clientOrderId.Length);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("abc")]
    [InlineData("6ab31f800123456789abcdeF")] // uppercase
    [InlineData("6ab31f800123456789abcdeg")] // not hex
    [InlineData("6ab31f800123456789abcdef0")] // 25 characters
    public void Malformed_ids_are_rejected(string? id)
    {
        Assert.False(Ids.IsValid(id));
    }
}
