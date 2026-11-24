using System.Net;
using System.Net.Sockets;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace TradingAgent.Agent.Web;

/// <summary>One result of a web search.</summary>
public sealed record WebResult(string Title, string Url, string Description, string? Age);

/// <summary>A web request could not give a result. The message is fit to show to the model.</summary>
public sealed class WebAccessException : Exception
{
    public WebAccessException()
    {
    }

    public WebAccessException(string message)
        : base(message)
    {
    }

    public WebAccessException(string message, Exception innerException)
        : base(message, innerException)
    {
    }
}

/// <summary>Web search through the Brave Search API, with the user's own key.</summary>
public sealed class BraveSearchClient(HttpClient http, Func<string?> key)
{
    private const string Endpoint = "https://api.search.brave.com/res/v1/web/search";

    /// <summary>True when a key is saved.</summary>
    public bool IsConfigured => !string.IsNullOrEmpty(key());

    /// <exception cref="WebAccessException">No key is saved, or Brave did not answer with results.</exception>
    public async Task<IReadOnlyList<WebResult>> SearchAsync(string query, int count, CancellationToken cancellationToken)
    {
        if (key() is not { Length: > 0 } token)
        {
            throw new WebAccessException("Web search is not set up: no Brave Search API key is saved in Settings.");
        }

        using var request = new HttpRequestMessage(
            HttpMethod.Get,
            $"{Endpoint}?q={Uri.EscapeDataString(query)}&count={Math.Clamp(count, 1, 20)}");
        request.Headers.Add("X-Subscription-Token", token);
        request.Headers.Accept.ParseAdd("application/json");
        try
        {
            using var response = await http.SendAsync(request, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                throw new WebAccessException(response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden
                    ? "Brave Search refused the saved key."
                    : $"Brave Search answered {(int)response.StatusCode}.");
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false));
            var results = new List<WebResult>();
            if (document.RootElement.TryGetProperty("web", out var web) && web.TryGetProperty("results", out var items) && items.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in items.EnumerateArray())
                {
                    if (Text(item, "url") is { } url)
                    {
                        results.Add(new WebResult(Text(item, "title") ?? url, url, PageText.FromHtml(Text(item, "description") ?? string.Empty), Text(item, "age")));
                    }
                }
            }

            return results;
        }
        catch (HttpRequestException ex)
        {
            throw new WebAccessException("Brave Search cannot be reached.", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new WebAccessException("Brave Search took too long to answer.", ex);
        }
        catch (JsonException ex)
        {
            throw new WebAccessException("Brave Search's answer could not be read.", ex);
        }
    }

    private static string? Text(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;
}

/// <summary>Turns a web page into the text a person would read on it.</summary>
public static partial class PageText
{
    public static string FromHtml(string html)
    {
        ArgumentNullException.ThrowIfNull(html);
        var text = Hidden().Replace(html, " ");
        text = Breaks().Replace(text, "\n");
        text = Tags().Replace(text, " ");
        text = WebUtility.HtmlDecode(text);
        text = Spaces().Replace(text, " ");
        return BlankLines().Replace(text, "\n\n").Trim();
    }

    [GeneratedRegex(@"<(script|style|noscript|svg|head|nav|footer)\b[^>]*>.*?</\1\s*>|<!--.*?-->", RegexOptions.Singleline | RegexOptions.IgnoreCase)]
    private static partial Regex Hidden();

    [GeneratedRegex(@"</(p|div|li|h[1-6]|tr|section|article)\s*>|<br\s*/?>", RegexOptions.IgnoreCase)]
    private static partial Regex Breaks();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"[^\S\n]+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"\s*\n\s*(\n\s*)*")]
    private static partial Regex BlankLines();
}

/// <summary>Reads a public web page as text, for the model.</summary>
/// <remarks>
/// The address comes from a model, and what a model reads can be written by anybody. So the reader
/// goes to public web addresses only: no file addresses, and no address on this computer or on the
/// local network, also not after a redirect. The handler it is given must not follow redirects itself.
/// </remarks>
public sealed class PageReader(HttpClient http, Func<string, CancellationToken, Task<IPAddress[]>>? resolve = null)
{
    /// <summary>Longest text returned, in characters.</summary>
    public const int MaxTextLength = 20_000;

    private const int MaxBytes = 2 * 1024 * 1024;
    private const int MaxRedirects = 5;

    private readonly Func<string, CancellationToken, Task<IPAddress[]>> _resolve = resolve ?? Dns.GetHostAddressesAsync;

    /// <summary>True for an address on the public internet.</summary>
    public static bool IsPublic(IPAddress address)
    {
        ArgumentNullException.ThrowIfNull(address);
        if (address.IsIPv4MappedToIPv6)
        {
            address = address.MapToIPv4();
        }

        if (IPAddress.IsLoopback(address) || address.Equals(IPAddress.Any) || address.Equals(IPAddress.IPv6Any))
        {
            return false;
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            // fc00::/7 is the private range of IPv6.
            return !address.IsIPv6LinkLocal && !address.IsIPv6SiteLocal && !address.IsIPv6UniqueLocal && !address.IsIPv6Multicast;
        }

        var bytes = address.GetAddressBytes();
        return bytes[0] switch
        {
            0 or 10 or 127 => false,
            100 when bytes[1] is >= 64 and <= 127 => false,
            169 when bytes[1] == 254 => false,
            172 when bytes[1] is >= 16 and <= 31 => false,
            192 when bytes[1] == 168 => false,
            >= 224 => false,
            _ => true,
        };
    }

    /// <exception cref="WebAccessException">The address is not allowed, or the page could not be read.</exception>
    public async Task<string> ReadAsync(string url, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url?.Trim(), UriKind.Absolute, out var uri))
        {
            throw new WebAccessException("That is not a web address.");
        }

        try
        {
            for (var hop = 0; hop <= MaxRedirects; hop++)
            {
                await CheckAsync(uri, cancellationToken).ConfigureAwait(false);
                using var request = new HttpRequestMessage(HttpMethod.Get, uri);
                request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (compatible; TradingAgent page reader)");
                request.Headers.Accept.ParseAdd("text/html, text/plain;q=0.9, */*;q=0.1");
                using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
                if ((int)response.StatusCode is >= 300 and < 400 && response.Headers.Location is { } location)
                {
                    uri = location.IsAbsoluteUri ? location : new Uri(uri, location);
                    continue;
                }

                if (!response.IsSuccessStatusCode)
                {
                    throw new WebAccessException($"The page answered {(int)response.StatusCode}.");
                }

                var type = response.Content.Headers.ContentType?.MediaType ?? "text/html";
                if (!type.StartsWith("text/", StringComparison.OrdinalIgnoreCase) && !type.Contains("html", StringComparison.OrdinalIgnoreCase)
                    && !type.Contains("json", StringComparison.OrdinalIgnoreCase) && !type.Contains("xml", StringComparison.OrdinalIgnoreCase))
                {
                    throw new WebAccessException($"The address holds '{type}', not a page of text.");
                }

                if (response.Content.Headers.ContentLength > MaxBytes)
                {
                    throw new WebAccessException("The page is too large to read.");
                }

                var body = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
                var text = type.Contains("html", StringComparison.OrdinalIgnoreCase) ? PageText.FromHtml(body) : body.Trim();
                return text.Length <= MaxTextLength ? text : text[..MaxTextLength] + "\n[The page goes on; this is its first part.]";
            }

            throw new WebAccessException("The address redirects too many times.");
        }
        catch (HttpRequestException ex)
        {
            throw new WebAccessException("The page cannot be reached.", ex);
        }
        catch (TaskCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new WebAccessException("The page took too long to answer.", ex);
        }
    }

    private async Task CheckAsync(Uri uri, CancellationToken cancellationToken)
    {
        if (uri.Scheme is not ("http" or "https"))
        {
            throw new WebAccessException("Only http and https addresses can be read.");
        }

        IPAddress[] addresses;
        try
        {
            addresses = IPAddress.TryParse(uri.Host.Trim('[', ']'), out var literal)
                ? [literal]
                : await _resolve(uri.DnsSafeHost, cancellationToken).ConfigureAwait(false);
        }
        catch (SocketException ex)
        {
            throw new WebAccessException($"The site '{uri.Host}' was not found.", ex);
        }

        if (addresses.Length == 0 || !addresses.All(IsPublic))
        {
            throw new WebAccessException("That address is on this computer or the local network. Only public web pages can be read.");
        }
    }
}
