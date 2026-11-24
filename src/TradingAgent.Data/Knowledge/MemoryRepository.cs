using Microsoft.Data.Sqlite;
using TradingAgent.Core;

namespace TradingAgent.Data.Knowledge;

/// <summary>Something the agent was told to remember, or chose to.</summary>
public sealed record Memory(
    string Id,
    string Category,
    string Content,
    IReadOnlyList<string> Tags,
    string Source,
    long CreatedAt,
    long UpdatedAt,
    long? ExpiresAt);

/// <summary>The agent's memories: what it keeps between conversations.</summary>
public sealed class MemoryRepository(Database database, TimeProvider time)
{
    /// <summary>Longest memory, in characters. Longer text is cut.</summary>
    public const int MaxLength = 2000;

    public const string DefaultCategory = "general";

    private const string Columns = "m.id, m.category, m.content, m.tags, m.source, m.created_at, m.updated_at, m.expires_at";

    public static IReadOnlyList<string> Categories { get; } =
        ["preference", "watchlist", "trading_context", "market_observation", "decision_rationale", "lesson", "general"];

    /// <summary>A category the table accepts: the given one, or <see cref="DefaultCategory"/>.</summary>
    public static string Normalize(string? category) =>
        category is not null && Categories.Contains(category.Trim().ToLowerInvariant()) ? category.Trim().ToLowerInvariant() : DefaultCategory;

    public Memory Add(
        string category,
        string content,
        IReadOnlyList<string>? tags = null,
        string source = "conversation",
        string? sessionId = null,
        long? expiresAt = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(content);
        var now = time.GetUtcNow();
        var memory = new Memory(
            Ids.NewId(now),
            Normalize(category),
            Cut(content),
            [.. tags ?? []],
            source == "task" ? "task" : "conversation",
            now.ToUnixTimeMilliseconds(),
            now.ToUnixTimeMilliseconds(),
            expiresAt);
        database.Execute(
            """
            INSERT INTO agent_memories (id, category, content, tags, source, session_id, expires_at, created_at, updated_at)
            VALUES ($id, $category, $content, $tags, $source, $session, $expires, $now, $now);
            """,
            ("$id", memory.Id),
            ("$category", memory.Category),
            ("$content", memory.Content),
            ("$tags", JsonText.List(memory.Tags)),
            ("$source", memory.Source),
            ("$session", sessionId),
            ("$expires", expiresAt),
            ("$now", memory.CreatedAt));
        return memory;
    }

    /// <summary>Changes a memory. Its embedding is dropped, so that it is made again from the new text.</summary>
    public bool Update(string id, string category, string content)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(content);
        return database.Execute(
            """
            DELETE FROM vectors WHERE kind = 'agent_memory' AND item_id = $id;
            UPDATE agent_memories SET category = $category, content = $content, updated_at = $now WHERE id = $id;
            """,
            ("$id", id),
            ("$category", Normalize(category)),
            ("$content", Cut(content)),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds())) > 0;
    }

    public bool Delete(string id) => database.Execute("DELETE FROM agent_memories WHERE id = $id;", ("$id", id)) > 0;

    public Memory? Get(string id) =>
        database.First($"SELECT {Columns} FROM agent_memories AS m WHERE m.id = $id;", Read, ("$id", id));

    /// <summary>The newest memories that have not expired, of one category or of all.</summary>
    public IReadOnlyList<Memory> List(string? category, int limit) =>
        database.Query(
            $"""
             SELECT {Columns} FROM agent_memories AS m
             WHERE ($category IS NULL OR m.category = $category) AND (m.expires_at IS NULL OR m.expires_at > $now)
             ORDER BY m.updated_at DESC, m.seq DESC
             LIMIT $limit;
             """,
            Read,
            ("$category", category),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()),
            ("$limit", limit));

    /// <summary>The memories whose text matches the words of <paramref name="query"/>, best first.</summary>
    public IReadOnlyList<Memory> Search(string query, int limit)
    {
        if (FtsQuery.From(query) is not { } match)
        {
            return [];
        }

        return database.Query(
            $"""
             SELECT {Columns} FROM agent_memories_fts
             JOIN agent_memories AS m ON m.seq = agent_memories_fts.rowid
             WHERE agent_memories_fts MATCH $match AND (m.expires_at IS NULL OR m.expires_at > $now)
             ORDER BY rank
             LIMIT $limit;
             """,
            Read,
            ("$match", match),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()),
            ("$limit", limit));
    }

    /// <summary>Removes memories whose time is up. Returns how many.</summary>
    public int DeleteExpired() =>
        database.Execute(
            "DELETE FROM agent_memories WHERE expires_at IS NOT NULL AND expires_at <= $now;",
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()));

    private static string Cut(string content)
    {
        var text = content.Trim();
        return text.Length <= MaxLength ? text : text[..MaxLength];
    }

    private static Memory Read(SqliteDataReader reader) => new(
        reader.GetString(0),
        reader.GetString(1),
        reader.GetString(2),
        JsonText.ReadList(reader.GetString(3)),
        reader.GetString(4),
        reader.GetInt64(5),
        reader.GetInt64(6),
        reader.Whole(7));
}
