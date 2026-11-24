using System.Security.Cryptography;
using System.Text;
using Microsoft.Data.Sqlite;
using TradingAgent.Core;

namespace TradingAgent.Data.News;

/// <summary>A site whose feed the app reads.</summary>
public sealed record NewsSource(
    string Id,
    string Name,
    string Domain,
    string? RssUrl,
    bool CrawlEnabled,
    int IntervalHours,
    long? LastCrawled,
    string? LastError);

/// <summary>An article as the app stores it.</summary>
public sealed record NewsArticle(
    string Id,
    string SourceName,
    string Url,
    string Title,
    string Summary,
    long? PublishedAt,
    long FetchedAt,
    IReadOnlyList<string> Assets);

/// <summary>An article as a feed gives it.</summary>
public sealed record NewArticle(string Url, string Title, string Summary, long? PublishedAt, IReadOnlyList<string> Assets);

/// <summary>News sources and the articles read from them.</summary>
public sealed class NewsRepository(Database database, TimeProvider time)
{
    private const string ArticleSelect =
        """
        SELECT a.id, s.name, a.url, a.title, coalesce(a.summary, ''), a.published_at, a.fetched_at,
               (SELECT group_concat(asset, ',') FROM news_article_assets WHERE article_id = a.id)
        FROM news_articles AS a
        JOIN news_sources AS s ON s.id = a.source_id
        """;

    /// <summary>The feeds a new installation starts with.</summary>
    public static IReadOnlyList<(string Name, string RssUrl)> Defaults { get; } =
    [
        ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
        ("Cointelegraph", "https://cointelegraph.com/rss"),
        ("Decrypt", "https://decrypt.co/feed"),
        ("The Block", "https://www.theblock.co/rss.xml"),
        ("Bitcoin Magazine", "https://bitcoinmagazine.com/feed"),
    ];

    /// <summary>
    /// The address an article is stored under: without the fragment, without tracking parameters and
    /// without a trailing slash, so that the same article from two feeds is one row.
    /// </summary>
    public static string NormalizeUrl(string url)
    {
        ArgumentNullException.ThrowIfNull(url);
        if (!Uri.TryCreate(url.Trim(), UriKind.Absolute, out var uri))
        {
            return url.Trim();
        }

        var kept = uri.Query.TrimStart('?')
            .Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Where(part => !part.StartsWith("utm_", StringComparison.OrdinalIgnoreCase)
                && !part.StartsWith("fbclid=", StringComparison.OrdinalIgnoreCase)
                && !part.StartsWith("gclid=", StringComparison.OrdinalIgnoreCase))
            .ToArray();
        var path = uri.AbsolutePath.Length > 1 ? uri.AbsolutePath.TrimEnd('/') : uri.AbsolutePath;
        return $"{uri.Scheme}://{uri.Authority}{path}{(kept.Length > 0 ? "?" + string.Join('&', kept) : string.Empty)}";
    }

    public IReadOnlyList<NewsSource> ListSources() =>
        database.Query(
            "SELECT id, name, domain, rss_url, crawl_enabled, crawl_interval_hours, last_crawled, last_error FROM news_sources ORDER BY name;",
            reader => new NewsSource(
                reader.GetString(0),
                reader.GetString(1),
                reader.GetString(2),
                reader.Text(3),
                reader.GetInt64(4) == 1,
                reader.GetInt32(5),
                reader.Whole(6),
                reader.Text(7)));

    /// <summary>Adds a source by its feed address. False when the address is not a web address or the site is listed already.</summary>
    public bool AddSource(string name, string rssUrl)
    {
        if (!Uri.TryCreate(rssUrl?.Trim(), UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https"))
        {
            return false;
        }

        var now = time.GetUtcNow();
        return database.Execute(
            """
            INSERT OR IGNORE INTO news_sources (id, name, domain, source_type, rss_url, created_at, updated_at)
            VALUES ($id, $name, $domain, 'news', $rss, $now, $now);
            """,
            ("$id", Ids.NewId(now)),
            ("$name", string.IsNullOrWhiteSpace(name) ? uri.Host : name.Trim()),
            ("$domain", uri.Host.ToLowerInvariant()),
            ("$rss", uri.ToString()),
            ("$now", now.ToUnixTimeMilliseconds())) > 0;
    }

    /// <summary>Adds the default feeds when no source exists yet. Returns how many were added.</summary>
    public int SeedDefaults() =>
        database.Number("SELECT count(*) FROM news_sources;") > 0 ? 0 : Defaults.Count(source => AddSource(source.Name, source.RssUrl));

    public bool SetEnabled(string id, bool enabled) =>
        database.Execute(
            "UPDATE news_sources SET crawl_enabled = $enabled, updated_at = $now WHERE id = $id;",
            ("$id", id),
            ("$enabled", enabled ? 1 : 0),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds())) > 0;

    /// <summary>Removes a source and its articles.</summary>
    public bool DeleteSource(string id) => database.Execute("DELETE FROM news_sources WHERE id = $id;", ("$id", id)) > 0;

    /// <summary>Records that a source was read just now, and what went wrong if something did.</summary>
    public void MarkCrawled(string id, string? error) =>
        database.Execute(
            "UPDATE news_sources SET last_crawled = $now, last_error = $error, updated_at = $now WHERE id = $id;",
            ("$id", id),
            ("$error", error),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()));

    /// <summary>Stores an article. False when an article with that address is stored already.</summary>
    public bool Insert(string sourceId, NewArticle article)
    {
        ArgumentNullException.ThrowIfNull(article);
        var now = time.GetUtcNow();
        var id = Ids.NewId(now);
        var url = NormalizeUrl(article.Url);
        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();
        using (var insert = connection.CreateCommand())
        {
            insert.Transaction = transaction;
            insert.CommandText =
                """
                INSERT OR IGNORE INTO news_articles (id, source_id, url, url_hash, content_hash, title, content, summary, published_at, fetched_at, created_at)
                VALUES ($id, $source, $url, $url_hash, $content_hash, $title, $content, $summary, $published, $now, $now);
                """;
            DatabaseQueries.Bind(
                insert,
                [
                    ("$id", id),
                    ("$source", sourceId),
                    ("$url", url),
                    ("$url_hash", Hash(url)),
                    ("$content_hash", article.Summary.Length == 0 ? string.Empty : Hash(article.Summary)),
                    ("$title", article.Title),
                    ("$content", article.Summary),
                    ("$summary", article.Summary),
                    ("$published", article.PublishedAt),
                    ("$now", now.ToUnixTimeMilliseconds()),
                ]);
            if (insert.ExecuteNonQuery() == 0)
            {
                return false;
            }
        }

        foreach (var asset in article.Assets.Distinct(StringComparer.Ordinal))
        {
            using var tag = connection.CreateCommand();
            tag.Transaction = transaction;
            tag.CommandText = "INSERT OR IGNORE INTO news_article_assets (article_id, asset) VALUES ($article, $asset);";
            tag.Parameters.AddWithValue("$article", id);
            tag.Parameters.AddWithValue("$asset", asset);
            tag.ExecuteNonQuery();
        }

        transaction.Commit();
        return true;
    }

    /// <summary>The newest articles, of one asset (for example BTC) or of all.</summary>
    public IReadOnlyList<NewsArticle> Recent(int limit, string? asset = null) =>
        database.Query(
            $"""
             {ArticleSelect}
             WHERE $asset IS NULL OR EXISTS (SELECT 1 FROM news_article_assets WHERE article_id = a.id AND asset = $asset)
             ORDER BY coalesce(a.published_at, a.fetched_at) DESC, a.seq DESC
             LIMIT $limit;
             """,
            Read,
            ("$asset", string.IsNullOrWhiteSpace(asset) ? null : asset.Trim().ToUpperInvariant()),
            ("$limit", limit));

    /// <summary>The articles whose title or summary matches the words of <paramref name="query"/>, best first.</summary>
    public IReadOnlyList<NewsArticle> Search(string query, int limit)
    {
        if (FtsQuery.From(query) is not { } match)
        {
            return [];
        }

        return database.Query(
            $"""
             {ArticleSelect}
             JOIN news_articles_fts ON news_articles_fts.rowid = a.seq
             WHERE news_articles_fts MATCH $match
             ORDER BY rank
             LIMIT $limit;
             """,
            Read,
            ("$match", match),
            ("$limit", limit));
    }

    /// <summary>Removes articles fetched before <paramref name="cutoffMs"/>. Returns how many.</summary>
    public int DeleteOlderThan(long cutoffMs) =>
        database.Execute("DELETE FROM news_articles WHERE fetched_at < $cutoff;", ("$cutoff", cutoffMs));

    private static string Hash(string text) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..32];

    private static NewsArticle Read(SqliteDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.GetString(2),
        reader.GetString(3),
        reader.GetString(4),
        reader.Whole(5),
        reader.GetInt64(6),
        reader.Text(7)?.Split(',', StringSplitOptions.RemoveEmptyEntries) ?? []);
}
