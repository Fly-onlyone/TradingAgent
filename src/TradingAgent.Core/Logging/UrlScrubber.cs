namespace TradingAgent.Core.Logging;

/// <summary>Removes the parts of a URL that tend to carry personal data or credentials.</summary>
public static class UrlScrubber
{
    /// <summary>Cuts a URL at its query string or fragment, whichever comes first.</summary>
    /// <example><c>StripQueryAndFragment("https://okx.com/api/v5/orders?instId=BTC#top")</c> returns <c>"https://okx.com/api/v5/orders"</c>.</example>
    public static string StripQueryAndFragment(string url)
    {
        ArgumentNullException.ThrowIfNull(url);
        var cut = url.AsSpan().IndexOfAny('?', '#');
        return cut < 0 ? url : url[..cut];
    }
}
