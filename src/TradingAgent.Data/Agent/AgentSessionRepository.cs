using Microsoft.Data.Sqlite;
using TradingAgent.Core;
using TradingAgent.Core.Agent;

namespace TradingAgent.Data.Agent;

/// <summary>Reads and writes the <c>agent_sessions</c> table.</summary>
public sealed class AgentSessionRepository(Database database, TimeProvider time)
{
    internal const string Columns =
        """
        id, session_kind, title, description, sdk_session_id, provider, auth_mode, active_pending_question,
        total_messages, user_messages, assistant_messages, total_tokens, is_active, started_at, ended_at,
        last_message_at
        """;

    public AgentSession Create(
        SessionKind kind = SessionKind.Chat,
        string? title = null,
        string? provider = null,
        string? authMode = null)
    {
        var now = time.GetUtcNow();
        var id = Ids.NewId(now);
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO agent_sessions (id, session_kind, title, provider, auth_mode, started_at)
            VALUES ($id, $kind, $title, $provider, $auth_mode, $now);
            """;
        command.Parameters.AddWithValue("$id", id);
        command.Parameters.AddWithValue("$kind", AgentWire.Name(kind));
        command.Parameters.AddWithValue("$title", (object?)title ?? DBNull.Value);
        command.Parameters.AddWithValue("$provider", (object?)provider ?? DBNull.Value);
        command.Parameters.AddWithValue("$auth_mode", (object?)authMode ?? DBNull.Value);
        command.Parameters.AddWithValue("$now", now.ToUnixTimeMilliseconds());
        command.ExecuteNonQuery();

        return new AgentSession
        {
            Id = id,
            Kind = kind,
            Title = title,
            Provider = provider,
            AuthMode = authMode,
            IsActive = true,
            StartedAt = now.ToUnixTimeMilliseconds(),
        };
    }

    public AgentSession? Get(string id)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = $"SELECT {Columns} FROM agent_sessions WHERE id = $id;";
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        return reader.Read() ? Read(reader) : null;
    }

    /// <summary>Sessions by latest activity, newest first.</summary>
    /// <param name="limit">Most sessions to return.</param>
    /// <param name="kind">Only sessions of this kind; every kind when null.</param>
    public IReadOnlyList<AgentSession> ListRecent(int limit, SessionKind? kind = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(limit);
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
             SELECT {Columns} FROM agent_sessions
             WHERE $kind IS NULL OR session_kind = $kind
             ORDER BY coalesce(last_message_at, started_at) DESC, id DESC
             LIMIT $limit;
             """;
        command.Parameters.AddWithValue("$kind", kind is { } value ? AgentWire.Name(value) : DBNull.Value);
        command.Parameters.AddWithValue("$limit", limit);

        var sessions = new List<AgentSession>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            sessions.Add(Read(reader));
        }

        return sessions;
    }

    public bool SetTitle(string id, string? title, string? description) =>
        Update(
            "UPDATE agent_sessions SET title = $title, description = $description WHERE id = $id;",
            id,
            ("$title", title),
            ("$description", description));

    /// <summary>Stores the question the agent waits on, or clears it with null.</summary>
    public bool SetPendingQuestion(string id, PendingQuestion? question) =>
        Update(
            "UPDATE agent_sessions SET active_pending_question = $question WHERE id = $id;",
            id,
            ("$question", question is null ? null : PendingQuestionJson.Serialize(question)));

    public bool SetSdkSessionId(string id, string? sdkSessionId) =>
        Update("UPDATE agent_sessions SET sdk_session_id = $sdk WHERE id = $id;", id, ("$sdk", sdkSessionId));

    /// <summary>Records which provider and sign-in mode the session's transcript belongs to.</summary>
    public bool SetRuntime(string id, string provider, string authMode) =>
        Update(
            "UPDATE agent_sessions SET provider = $provider, auth_mode = $auth_mode WHERE id = $id;",
            id,
            ("$provider", provider),
            ("$auth_mode", authMode));

    /// <summary>Ends the session. Returns false if it does not exist or was already ended.</summary>
    public bool End(string id) =>
        Update(
            "UPDATE agent_sessions SET is_active = 0, ended_at = $now WHERE id = $id AND is_active = 1;",
            id,
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()));

    /// <summary>Makes an ended session active again, as happens when the user writes to it.</summary>
    public bool Reopen(string id) =>
        Update("UPDATE agent_sessions SET is_active = 1, ended_at = NULL WHERE id = $id AND is_active = 0;", id);

    /// <summary>Deletes the session with its messages, tool calls and transcript.</summary>
    public bool Delete(string id) => Update("DELETE FROM agent_sessions WHERE id = $id;", id);

    /// <summary>
    /// Deletes sessions whose last activity is before <paramref name="cutoffMs"/> (Unix milliseconds).
    /// A session with a reply still being written is kept. Returns how many were deleted.
    /// </summary>
    public int DeleteInactiveSince(long cutoffMs)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            DELETE FROM agent_sessions
            WHERE coalesce(last_message_at, started_at) < $cutoff
              AND NOT EXISTS (
                  SELECT 1 FROM agent_session_messages AS m
                  WHERE m.session_id = agent_sessions.id AND m.status = 'running');
            """;
        command.Parameters.AddWithValue("$cutoff", cutoffMs);
        return command.ExecuteNonQuery();
    }

    internal static AgentSession Read(SqliteDataReader reader) => new()
    {
        Id = reader.GetString(0),
        Kind = AgentWire.ParseSessionKind(reader.GetString(1)),
        Title = reader.IsDBNull(2) ? null : reader.GetString(2),
        Description = reader.IsDBNull(3) ? null : reader.GetString(3),
        SdkSessionId = reader.IsDBNull(4) ? null : reader.GetString(4),
        Provider = reader.IsDBNull(5) ? null : reader.GetString(5),
        AuthMode = reader.IsDBNull(6) ? null : reader.GetString(6),
        PendingQuestion = reader.IsDBNull(7) ? null : PendingQuestionJson.Deserialize(reader.GetString(7)),
        TotalMessages = reader.GetInt32(8),
        UserMessages = reader.GetInt32(9),
        AssistantMessages = reader.GetInt32(10),
        TotalTokens = reader.GetInt64(11),
        IsActive = reader.GetInt64(12) != 0,
        StartedAt = reader.GetInt64(13),
        EndedAt = reader.IsDBNull(14) ? null : reader.GetInt64(14),
        LastMessageAt = reader.IsDBNull(15) ? null : reader.GetInt64(15),
    };

    private bool Update(string sql, string id, params (string Name, object? Value)[] parameters)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        command.Parameters.AddWithValue("$id", id);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }

        return command.ExecuteNonQuery() > 0;
    }
}
