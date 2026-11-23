using Microsoft.Data.Sqlite;
using TradingAgent.Core;

namespace TradingAgent.Data.Knowledge;

/// <summary>A trading strategy the app knows: what it is, its rules, and what the user thinks of it.</summary>
public sealed record StrategyRecord
{
    /// <summary>The id of the knowledge row. The Strategies page and the search use this id.</summary>
    public required string Id { get; init; }

    public required string Name { get; init; }

    public required string Description { get; init; }

    public string EntryRulesJson { get; init; } = "{}";

    public string ExitRulesJson { get; init; } = "{}";

    public string RiskParamsJson { get; init; } = "{}";

    public IReadOnlyList<string> Timeframes { get; init; } = [];

    public IReadOnlyList<string> Symbols { get; init; } = [];

    public string? SourceUrl { get; init; }

    /// <summary>True when the user marked the strategy as one the agent should use.</summary>
    public bool IsActive { get; init; }

    /// <summary>True when the scheduled discovery found it, false when the user or a chat added it.</summary>
    public bool AutoDiscovered { get; init; }

    /// <summary>The user's own rating, 1 to 5.</summary>
    public double? UserRating { get; init; }

    public string? RatingNotes { get; init; }

    public long CreatedAt { get; init; }

    public long UpdatedAt { get; init; }
}

/// <summary>What is needed to save a strategy.</summary>
public sealed record StrategyDraft(
    string Name,
    string Description,
    string? EntryRulesJson = null,
    string? ExitRulesJson = null,
    string? RiskParamsJson = null,
    IReadOnlyList<string>? Timeframes = null,
    IReadOnlyList<string>? Symbols = null,
    string? SourceUrl = null,
    bool AutoDiscovered = false,
    string? SourceSessionId = null);

/// <summary>
/// The strategies. Each one is two rows: the knowledge the search reads (<c>strategy_knowledge</c>)
/// and the tradable strategy the user switches on (<c>strategies</c>). They are written together and
/// removed together, so that neither exists without the other.
/// </summary>
public sealed class StrategyRepository(Database database, TimeProvider time)
{
    private const string Select =
        """
        SELECT k.id, k.name, k.description, k.entry_rules, k.exit_rules, k.risk_params, k.timeframes, s.symbols,
               k.source_url, coalesce(s.is_active, 0), coalesce(s.auto_discovered, 0), k.user_rating, k.rating_notes,
               k.created_at, k.updated_at
        FROM strategy_knowledge AS k
        LEFT JOIN strategies AS s ON s.knowledge_id = k.id
        """;

    /// <summary>
    /// Saves a strategy. A strategy of the same name is not saved twice: the one that exists is
    /// returned and <c>Created</c> is false.
    /// </summary>
    public (StrategyRecord Strategy, bool Created) Save(StrategyDraft draft)
    {
        ArgumentNullException.ThrowIfNull(draft);
        ArgumentException.ThrowIfNullOrWhiteSpace(draft.Name);
        var name = draft.Name.Trim();
        if (FindByName(name) is { } existing)
        {
            return (existing, false);
        }

        var now = time.GetUtcNow();
        var id = Ids.NewId(now);
        var entry = JsonText.ValidOrWrapped(draft.EntryRulesJson);
        var exit = JsonText.ValidOrWrapped(draft.ExitRulesJson);
        var risk = JsonText.ValidOrWrapped(draft.RiskParamsJson);
        var timeframes = JsonText.List(draft.Timeframes);

        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();
        using (var knowledge = connection.CreateCommand())
        {
            knowledge.Transaction = transaction;
            knowledge.CommandText =
                """
                INSERT INTO strategy_knowledge (id, name, description, entry_rules, exit_rules, risk_params, timeframes, source_url, source_session_id, created_at, updated_at)
                VALUES ($id, $name, $description, $entry, $exit, $risk, $timeframes, $url, $session, $now, $now);
                """;
            DatabaseQueries.Bind(
                knowledge,
                [
                    ("$id", id),
                    ("$name", name),
                    ("$description", draft.Description.Trim()),
                    ("$entry", entry),
                    ("$exit", exit),
                    ("$risk", risk),
                    ("$timeframes", timeframes),
                    ("$url", draft.SourceUrl),
                    ("$session", draft.SourceSessionId),
                    ("$now", now.ToUnixTimeMilliseconds()),
                ]);
            knowledge.ExecuteNonQuery();
        }

        using (var strategy = connection.CreateCommand())
        {
            strategy.Transaction = transaction;
            strategy.CommandText =
                """
                INSERT INTO strategies (id, name, description, entry_rules, exit_rules, risk_params, symbols, timeframes, knowledge_id, auto_discovered, source_url, created_at, updated_at)
                VALUES ($id, $name, $description, $entry, $exit, $risk, $symbols, $timeframes, $knowledge, $auto, $url, $now, $now);
                """;
            DatabaseQueries.Bind(
                strategy,
                [
                    ("$id", Ids.NewId(now)),
                    ("$name", name),
                    ("$description", draft.Description.Trim()),
                    ("$entry", entry),
                    ("$exit", exit),
                    ("$risk", risk),
                    ("$symbols", JsonText.List(draft.Symbols)),
                    ("$timeframes", timeframes),
                    ("$knowledge", id),
                    ("$auto", draft.AutoDiscovered ? 1 : 0),
                    ("$url", draft.SourceUrl),
                    ("$now", now.ToUnixTimeMilliseconds()),
                ]);
            strategy.ExecuteNonQuery();
        }

        transaction.Commit();
        return (Get(id)!, true);
    }

    public StrategyRecord? Get(string id) => database.First($"{Select} WHERE k.id = $id;", Read, ("$id", id));

    public StrategyRecord? FindByName(string name) =>
        database.First($"{Select} WHERE k.name = $name COLLATE NOCASE;", Read, ("$name", name.Trim()));

    public IReadOnlyList<StrategyRecord> List(int limit, bool activeOnly = false) =>
        database.Query(
            $"{Select} WHERE $active = 0 OR s.is_active = 1 ORDER BY k.created_at DESC, k.seq DESC LIMIT $limit;",
            Read,
            ("$active", activeOnly ? 1 : 0),
            ("$limit", limit));

    public long Count() => database.Number("SELECT count(*) FROM strategy_knowledge;");

    public bool Delete(string id) =>
        database.Execute(
            """
            DELETE FROM strategies WHERE knowledge_id = $id;
            DELETE FROM strategy_knowledge WHERE id = $id;
            """,
            ("$id", id)) > 0;

    /// <summary>Records what the user thinks of a strategy. A null rating clears it.</summary>
    public bool Rate(string id, double? rating, string? notes) =>
        database.Execute(
            "UPDATE strategy_knowledge SET user_rating = $rating, rating_notes = $notes, rated_at = $now, updated_at = $now WHERE id = $id;",
            ("$id", id),
            ("$rating", rating is { } value ? Math.Clamp(value, 1, 5) : null),
            ("$notes", string.IsNullOrWhiteSpace(notes) ? null : notes.Trim()),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds())) > 0;

    /// <summary>Marks a strategy as one the agent should use, or not.</summary>
    public bool SetActive(string id, bool active) =>
        database.Execute(
            "UPDATE strategies SET is_active = $active, updated_at = $now WHERE knowledge_id = $id;",
            ("$id", id),
            ("$active", active ? 1 : 0),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds())) > 0;

    /// <summary>Marks the strategies saved in one session as found by the scheduled discovery. Returns how many.</summary>
    public int MarkDiscovered(string sessionId) =>
        database.Execute(
            "UPDATE strategies SET auto_discovered = 1 WHERE knowledge_id IN (SELECT id FROM strategy_knowledge WHERE source_session_id = $session);",
            ("$session", sessionId));

    private static StrategyRecord Read(SqliteDataReader reader) => new()
    {
        Id = reader.GetString(0),
        Name = reader.GetString(1),
        Description = reader.GetString(2),
        EntryRulesJson = reader.GetString(3),
        ExitRulesJson = reader.GetString(4),
        RiskParamsJson = reader.GetString(5),
        Timeframes = JsonText.ReadList(reader.Text(6)),
        Symbols = JsonText.ReadList(reader.Text(7)),
        SourceUrl = reader.Text(8),
        IsActive = reader.GetInt64(9) == 1,
        AutoDiscovered = reader.GetInt64(10) == 1,
        UserRating = reader.Real(11),
        RatingNotes = reader.Text(12),
        CreatedAt = reader.GetInt64(13),
        UpdatedAt = reader.GetInt64(14),
    };
}
