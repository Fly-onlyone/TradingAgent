using TradingAgent.Core.Logging;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class UrlScrubberTests
{
    [Theory]
    [InlineData("https://www.okx.com/api/v5/trade/orders?instId=BTC-USDT&email=a@b.c", "https://www.okx.com/api/v5/trade/orders")]
    [InlineData("https://example.com/page#token=abc", "https://example.com/page")]
    [InlineData("https://example.com/page#frag?x=1", "https://example.com/page")]
    [InlineData("https://example.com/a?x=1#frag", "https://example.com/a")]
    [InlineData("GET https://example.com/a?x=1", "GET https://example.com/a")]
    [InlineData("https://example.com/plain", "https://example.com/plain")]
    [InlineData("", "")]
    public void Query_and_fragment_are_cut_off(string url, string expected)
    {
        Assert.Equal(expected, UrlScrubber.StripQueryAndFragment(url));
    }
}
