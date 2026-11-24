using System.Globalization;
using System.Net;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Core.Hosting;
using TradingAgent.Core.Settings;
using TradingAgent.Data.News;

namespace TradingAgent.Agent.News;

/// <summary>Reads RSS and Atom feeds.</summary>
public static partial class FeedParser
{
    /// <summary>Longest summary kept for an article, in characters.</summary>
    public const int MaxSummaryLength = 1200;

    /// <summary>The articles of a feed. Entries without a title or a web address are left out.</summary>
    /// <exception cref="XmlException">The text is not XML.</exception>
    public static IReadOnlyList<NewArticle> Parse(string xml)
    {
        // No DTD and no resolver: a feed must not make the app read files or other addresses.
        using var reader = XmlReader.Create(new StringReader(xml), new XmlReaderSettings { DtdProcessing = DtdProcessing.Ignore, XmlResolver = null });
        var document = XDocument.Load(reader);
        var articles = new List<NewArticle>();
        foreach (var entry in document.Descendants().Where(element => element.Name.LocalName is "item" or "entry"))
        {
            var title = Clean(Child(entry, "title"));
            var link = Link(entry);
            if (title.Length == 0 || !Uri.TryCreate(link, UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
            {
                continue;
            }

            var summary = Clean(Child(entry, "description") ?? Child(entry, "summary") ?? Child(entry, "encoded") ?? Child(entry, "content"));
            if (summary.Length > MaxSummaryLength)
            {
                summary = summary[..MaxSummaryLength] + "…";
            }

            var published = Date(Child(entry, "pubDate") ?? Child(entry, "published") ?? Child(entry, "updated") ?? Child(entry, "date"));
            articles.Add(new NewArticle(uri.ToString(), title, summary, published, AssetTagger.Find(title + " " + summary)));
        }

        return articles;
    }

    private static string? Child(XElement entry, string name) =>
        entry.Elements().FirstOrDefault(element => element.Name.LocalName == name)?.Value;

    private static string? Link(XElement entry)
    {
        var links = entry.Elements().Where(element => element.Name.LocalName == "link").ToList();
        // Atom: the address is an attribute, and "alternate" is the article itself.
        var atom = links.FirstOrDefault(link => link.Attribute("href") is not null && (string?)link.Attribute("rel") is null or "alternate")
            ?? links.FirstOrDefault(link => link.Attribute("href") is not null);
        return atom is not null ? (string?)atom.Attribute("href") : links.FirstOrDefault()?.Value.Trim();
    }

    private static long? Date(string? text) =>
        DateTimeOffset.TryParse(text?.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)
            ? date.ToUnixTimeMilliseconds()
            : null;

    /// <summary>Text without markup: tags removed, entities decoded, white space joined.</summary>
    private static string Clean(string? html) =>
        string.IsNullOrWhiteSpace(html)
            ? string.Empty
            : Spaces().Replace(WebUtility.HtmlDecode(Tags().Replace(html, " ")), " ").Trim();

    [GeneratedRegex("<[^>]+>")]
    private static partial Regex Tags();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();
}

/// <summary>Finds which coins a text is about.</summary>
public static partial class AssetTagger
{
    private static readonly (string Asset, string[] Names)[] _assets =
    [
        ("BTC", ["btc", "bitcoin"]),
        ("ETH", ["eth", "ethereum", "ether"]),
        ("SOL", ["sol", "solana"]),
        ("XRP", ["xrp", "ripple"]),
        ("BNB", ["bnb", "binance coin"]),
        ("DOGE", ["doge", "dogecoin"]),
        ("ADA", ["ada", "cardano"]),
        ("AVAX", ["avax", "avalanche"]),
        ("LINK", ["chainlink"]),
        ("DOT", ["polkadot"]),
        ("LTC", ["ltc", "litecoin"]),
        ("TRX", ["trx", "tron"]),
        ("TON", ["toncoin"]),
        ("SUI", ["sui"]),
        ("USDT", ["usdt", "tether"]),
        ("USDC", ["usdc"]),
    ];

    /// <summary>The tickers of the coins named in <paramref name="text"/>, as whole words.</summary>
    public static IReadOnlyList<string> Find(string text)
    {
        var words = new HashSet<string>(Words().Matches(text.ToLowerInvariant()).Select(match => match.Value), StringComparer.Ordinal);
        var lower = text.ToLowerInvariant();
        return [.. _assets
            .Where(asset => asset.Names.Any(name => name.Contains(' ', StringComparison.Ordinal) ? lower.Contains(name, StringComparison.Ordinal) : words.Contains(name)))
            .Select(asset => asset.Asset)];
    }

    [GeneratedRegex("[a-z0-9]+")]
    private static partial Regex Words();
}

/// <summary>Reads the feeds of the news sources on a schedule and stores what is new.</summary>
public sealed partial class NewsCrawler(
    NewsRepository news,
    HttpClient http,
    EmbeddingIndexer indexer,
    ISettingsStore settings,
    TimeProvider time,
    ILogger<NewsCrawler> logger)
    : IBackgroundService, IDisposable
{
    /// <summary>How long articles are kept.</summary>
    public static readonly TimeSpan Retention = TimeSpan.FromDays(90);

    /// <summary>Largest feed read, in bytes.</summary>
    private const int MaxFeedBytes = 4 * 1024 * 1024;

    private static readonly TimeSpan _interval = TimeSpan.FromMinutes(15);
    private static readonly TimeSpan _firstDelay = TimeSpan.FromSeconds(20);
    private readonly SemaphoreSlim _pass = new(1, 1);
    private CancellationTokenSource? _stop;
    private Task? _loop;

    /// <summary>Raised after a pass that stored new articles or changed a source's state. Not on the UI thread.</summary>
    public event EventHandler? Changed;

    public string Name => "News crawler";

    public Task StartAsync(CancellationToken stopping)
    {
        news.SeedDefaults();
        _stop = CancellationTokenSource.CreateLinkedTokenSource(stopping);
        _loop = Task.Run(() => LoopAsync(_stop.Token), CancellationToken.None);
        return Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken deadline)
    {
        if (_stop is not null)
        {
            await _stop.CancelAsync().ConfigureAwait(false);
        }

        if (_loop is not null)
        {
            await _loop.WaitAsync(deadline).ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing);
        }
    }

    public void Dispose()
    {
        _pass.Dispose();
        _stop?.Dispose();
    }

    /// <summary>Reads every source that is due, or every enabled source when <paramref name="force"/> is set. Returns the number of new articles.</summary>
    public async Task<int> RunOnceAsync(bool force, CancellationToken cancellationToken)
    {
        await _pass.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var now = time.GetUtcNow();
            var added = 0;
            foreach (var source in news.ListSources())
            {
                var due = source.LastCrawled is not { } last || now.ToUnixTimeMilliseconds() - last >= TimeSpan.FromHours(source.IntervalHours).TotalMilliseconds;
                if (!source.CrawlEnabled || source.RssUrl is null || !(force || due))
                {
                    continue;
                }

                added += await ReadAsync(source, cancellationToken).ConfigureAwait(false);
            }

            news.DeleteOlderThan((now - Retention).ToUnixTimeMilliseconds());
            settings.SetValue(SettingKeys.NewsCrawlLastRunAt, now.ToUnixTimeMilliseconds());
            if (added > 0)
            {
                indexer.Request();
            }

            Changed?.Invoke(this, EventArgs.Empty);
            return added;
        }
        finally
        {
            _pass.Release();
        }
    }

    private async Task<int> ReadAsync(NewsSource source, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, source.RssUrl);
            request.Headers.UserAgent.ParseAdd("Mozilla/5.0 (compatible; TradingAgent feed reader)");
            request.Headers.Accept.ParseAdd("application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5");
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken).ConfigureAwait(false);
            if (!response.IsSuccessStatusCode)
            {
                news.MarkCrawled(source.Id, $"The feed answered {(int)response.StatusCode}.");
                return 0;
            }

            if (response.Content.Headers.ContentLength > MaxFeedBytes)
            {
                news.MarkCrawled(source.Id, "The feed is too large.");
                return 0;
            }

            var xml = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            var added = FeedParser.Parse(xml).Count(article => news.Insert(source.Id, article));
            news.MarkCrawled(source.Id, null);
            return added;
        }
        catch (Exception ex) when (ex is HttpRequestException or XmlException or InvalidOperationException
            || (ex is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            news.MarkCrawled(source.Id, ex is XmlException ? "The feed is not valid XML." : "The feed could not be read.");
            LogSourceFailed(logger, source.Domain, ex);
            return 0;
        }
    }

    private async Task LoopAsync(CancellationToken cancellationToken)
    {
        try
        {
            await Task.Delay(_firstDelay, time, cancellationToken).ConfigureAwait(false);
            using var timer = new PeriodicTimer(_interval, time);
            do
            {
                try
                {
                    await RunOnceAsync(force: false, cancellationToken).ConfigureAwait(false);
                }
#pragma warning disable CA1031 // One bad pass must not end the crawler: the next pass may work.
                catch (Exception ex) when (ex is not OperationCanceledException)
#pragma warning restore CA1031
                {
                    LogPassFailed(logger, ex);
                }
            }
            while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
        }
        catch (OperationCanceledException)
        {
            // The app is closing.
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "The feed of {Domain} could not be read.")]
    private static partial void LogSourceFailed(ILogger logger, string domain, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "A pass of the news crawler failed.")]
    private static partial void LogPassFailed(ILogger logger, Exception exception);
}
