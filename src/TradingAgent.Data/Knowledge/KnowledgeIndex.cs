using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;

namespace TradingAgent.Data.Knowledge;

/// <summary>One kind of thing that can be searched: where it is stored and which text stands for it.</summary>
/// <param name="Name">The name in the <c>vectors</c> table.</param>
/// <param name="Label">The name a person reads.</param>
/// <param name="Table">The table, read as <c>t</c>.</param>
/// <param name="Fts">Its full-text index.</param>
/// <param name="TitleSql">An SQL expression for the short text.</param>
/// <param name="BodySql">An SQL expression for the long text.</param>
public sealed record KnowledgeKind(string Name, string Label, string Table, string Fts, string TitleSql, string BodySql);

/// <summary>One thing a search found.</summary>
public sealed record KnowledgeHit(string Kind, string Label, string Id, string Title, string Body, double Score);

/// <summary>One thing that has no embedding yet, with the text to embed.</summary>
public sealed record EmbeddingItem(string Id, string Text);

/// <summary>
/// Search over what the app knows: strategies, trade lessons, patterns, news and memories. Words are
/// found with the full-text indexes; meaning is found with embeddings, when an embedding provider is set.
/// </summary>
/// <remarks>
/// Vectors are compared in memory, one by one. That is fast enough for the tens of thousands of items
/// one person collects, and it needs no extension of SQLite, which the Native AOT build could not load.
/// </remarks>
public sealed class KnowledgeIndex(Database database, TimeProvider time)
{
    public static IReadOnlyList<KnowledgeKind> Kinds { get; } =
    [
        new("strategy_knowledge", "Strategy", "strategy_knowledge", "strategy_knowledge_fts", "t.name", "t.description"),
        new("trade_lesson", "Trade lesson", "trade_lessons", "trade_lessons_fts", "t.symbol || ' ' || t.outcome", "t.lesson_summary"),
        new("trading_pattern", "Pattern", "trading_patterns", "trading_patterns_fts", "t.pattern_name", "t.description"),
        new("news_article", "News", "news_articles", "news_articles_fts", "t.title", "coalesce(t.summary, '')"),
        new("agent_memory", "Memory", "agent_memories", "agent_memories_fts", "t.category", "t.content"),
    ];

    public static KnowledgeKind? Find(string? name) => Kinds.FirstOrDefault(kind => kind.Name == name);

    /// <summary>The ids of the items whose text matches the words of <paramref name="query"/>, best first.</summary>
    public IReadOnlyList<string> Keyword(KnowledgeKind kind, string query, int limit)
    {
        ArgumentNullException.ThrowIfNull(kind);
        if (FtsQuery.From(query) is not { } match)
        {
            return [];
        }

        return database.Query(
            $"""
             SELECT t.id FROM {kind.Fts}
             JOIN {kind.Table} AS t ON t.seq = {kind.Fts}.rowid
             WHERE {kind.Fts} MATCH $match
             ORDER BY rank
             LIMIT $limit;
             """,
            reader => reader.GetString(0),
            ("$match", match),
            ("$limit", limit));
    }

    /// <summary>Reads the items with these ids, in the given order. An id that is gone is left out.</summary>
    public IReadOnlyList<KnowledgeHit> Load(KnowledgeKind kind, IReadOnlyList<(string Id, double Score)> ranked)
    {
        ArgumentNullException.ThrowIfNull(kind);
        ArgumentNullException.ThrowIfNull(ranked);
        if (ranked.Count == 0)
        {
            return [];
        }

        var parameters = ranked.Select((item, index) => ($"$p{index}", (object?)item.Id)).ToArray();
        var found = database
            .Query(
                $"SELECT t.id, {kind.TitleSql}, {kind.BodySql} FROM {kind.Table} AS t WHERE t.id IN ({string.Join(", ", parameters.Select(parameter => parameter.Item1))});",
                reader => (Id: reader.GetString(0), Title: reader.GetString(1), Body: reader.GetString(2)),
                parameters)
            .ToDictionary(row => row.Id, StringComparer.Ordinal);

        var hits = new List<KnowledgeHit>();
        foreach (var (id, score) in ranked)
        {
            if (found.TryGetValue(id, out var row))
            {
                hits.Add(new KnowledgeHit(kind.Name, kind.Label, id, row.Title, row.Body, score));
            }
        }

        return hits;
    }

    /// <summary>The newest items that have no embedding made by <paramref name="embedder"/>.</summary>
    public IReadOnlyList<EmbeddingItem> Pending(KnowledgeKind kind, string embedder, int limit)
    {
        ArgumentNullException.ThrowIfNull(kind);
        return database.Query(
            $"""
             SELECT t.id, {kind.TitleSql} || char(10) || {kind.BodySql} FROM {kind.Table} AS t
             LEFT JOIN vectors AS v ON v.kind = $kind AND v.item_id = t.id AND v.embedder = $embedder
             WHERE v.item_id IS NULL
             ORDER BY t.seq DESC
             LIMIT $limit;
             """,
            reader => new EmbeddingItem(reader.GetString(0), reader.GetString(1)),
            ("$kind", kind.Name),
            ("$embedder", embedder),
            ("$limit", limit));
    }

    /// <summary>Stores the embedding of one item, in place of an earlier one.</summary>
    /// <param name="kind">What the item is.</param>
    /// <param name="itemId">The item.</param>
    /// <param name="embedder">The provider and model that made the vector.</param>
    /// <param name="text">The text that was embedded.</param>
    /// <param name="vector">The vector, of length one.</param>
    public void Store(KnowledgeKind kind, string itemId, string embedder, string text, float[] vector)
    {
        ArgumentNullException.ThrowIfNull(kind);
        ArgumentNullException.ThrowIfNull(vector);
        ArgumentOutOfRangeException.ThrowIfZero(vector.Length);
        database.Execute(
            """
            INSERT INTO vectors (kind, item_id, embedder, hash, dim, data, updated_at)
            VALUES ($kind, $item, $embedder, $hash, $dim, $data, $now)
            ON CONFLICT (kind, item_id) DO UPDATE SET
                embedder = excluded.embedder, hash = excluded.hash, dim = excluded.dim, data = excluded.data, updated_at = excluded.updated_at;
            """,
            ("$kind", kind.Name),
            ("$item", itemId),
            ("$embedder", embedder),
            ("$hash", Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(embedder + "\n" + text)))),
            ("$dim", vector.Length),
            // Little-endian on every machine the app runs on.
            ("$data", MemoryMarshal.AsBytes(vector.AsSpan()).ToArray()),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()));
    }

    /// <summary>Every embedding of one kind made by <paramref name="embedder"/>.</summary>
    public IReadOnlyList<(string Id, float[] Vector)> Vectors(KnowledgeKind kind, string embedder)
    {
        ArgumentNullException.ThrowIfNull(kind);
        return database.Query(
            "SELECT item_id, data FROM vectors WHERE kind = $kind AND embedder = $embedder;",
            reader =>
            {
                var bytes = (byte[])reader.GetValue(1);
                return (reader.GetString(0), MemoryMarshal.Cast<byte, float>(bytes).ToArray());
            },
            ("$kind", kind.Name),
            ("$embedder", embedder));
    }

    /// <summary>How many items of a kind exist, and how many have an embedding made by <paramref name="embedder"/>.</summary>
    public (long Total, long Embedded) Counts(KnowledgeKind kind, string embedder)
    {
        ArgumentNullException.ThrowIfNull(kind);
        return (
            database.Number($"SELECT count(*) FROM {kind.Table};"),
            database.Number(
                "SELECT count(*) FROM vectors WHERE kind = $kind AND embedder = $embedder;",
                ("$kind", kind.Name),
                ("$embedder", embedder)));
    }
}
