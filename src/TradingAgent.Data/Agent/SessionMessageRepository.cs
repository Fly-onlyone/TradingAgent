using Microsoft.Data.Sqlite;
using TradingAgent.Core;
using TradingAgent.Core.Agent;

namespace TradingAgent.Data.Agent;

/// <summary>Where a page of messages ends: the oldest message already shown.</summary>
public readonly record struct MessageCursor(long Timestamp, string Id);

/// <summary>What changed in a reply. A null member leaves the stored value as it is.</summary>
public sealed record AssistantMessageUpdate
{
    public string? Content { get; init; }

    public string? ThinkingContent { get; init; }

    public MessageStatus? Status { get; init; }

    public string? Error { get; init; }

    public string? Model { get; init; }

    /// <summary>Tokens of the whole reply so far, not an amount to add.</summary>
    public long? InputTokens { get; init; }

    /// <inheritdoc cref="InputTokens"/>
    public long? OutputTokens { get; init; }
}

/// <summary>Reads and writes <c>agent_session_messages</c> and <c>agent_tool_calls</c>.</summary>
/// <remarks>
/// Writing a message also updates its session (counters, last activity, title), in one transaction, so
/// the session list never disagrees with the messages.
/// </remarks>
public sealed class SessionMessageRepository(Database database, TimeProvider time)
{
    /// <summary>Longest session title taken from a first message.</summary>
    public const int TitleLength = 50;

    private const string MessageColumns =
        """
        id, session_id, role, content, timestamp, status, error, thinking_content, model, input_tokens,
        output_tokens, decision_id, created_at, updated_at
        """;

    private const string ToolCallColumns =
        """
        id, message_id, position, tool_use_id, name, arguments, status, result_summary, result, duration_ms,
        created_at, updated_at
        """;

    /// <summary>
    /// Adds a message to a session. A user message becomes the title of a session that has none, and
    /// reopens a session that was ended.
    /// </summary>
    /// <param name="sessionId">The session; it must exist.</param>
    /// <param name="role">Who wrote the message.</param>
    /// <param name="content">The text. Empty for a reply that is only being started.</param>
    /// <param name="status"><see cref="MessageStatus.Running"/> starts a reply to be filled in later.</param>
    /// <param name="model">The model that writes the reply, when known.</param>
    public SessionMessage Append(
        string sessionId,
        MessageRole role,
        string content,
        MessageStatus status = MessageStatus.Complete,
        string? model = null)
    {
        ArgumentNullException.ThrowIfNull(content);
        var now = time.GetUtcNow();
        var nowMs = now.ToUnixTimeMilliseconds();
        var id = Ids.NewId(now);

        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();

        // Messages are ordered by timestamp. Two written in the same millisecond (the user's message and
        // the reply started right after it) must still keep their order.
        var timestamp = Math.Max(nowMs, LastTimestamp(connection, transaction, sessionId) + 1);

        using (var insert = connection.CreateCommand())
        {
            insert.Transaction = transaction;
            insert.CommandText =
                """
                INSERT INTO agent_session_messages (id, session_id, role, content, timestamp, status, model, created_at, updated_at)
                VALUES ($id, $session, $role, $content, $timestamp, $status, $model, $now, $now);
                """;
            insert.Parameters.AddWithValue("$id", id);
            insert.Parameters.AddWithValue("$session", sessionId);
            insert.Parameters.AddWithValue("$role", AgentWire.Name(role));
            insert.Parameters.AddWithValue("$content", content);
            insert.Parameters.AddWithValue("$timestamp", timestamp);
            insert.Parameters.AddWithValue("$status", AgentWire.Name(status));
            insert.Parameters.AddWithValue("$model", (object?)model ?? DBNull.Value);
            insert.Parameters.AddWithValue("$now", nowMs);
            insert.ExecuteNonQuery();
        }

        using (var session = connection.CreateCommand())
        {
            session.Transaction = transaction;
            session.CommandText =
                """
                UPDATE agent_sessions SET
                    total_messages = total_messages + 1,
                    user_messages = user_messages + $is_user,
                    assistant_messages = assistant_messages + $is_assistant,
                    last_message_at = $timestamp,
                    title = CASE WHEN $is_user = 1 AND (title IS NULL OR title = '') THEN $title ELSE title END,
                    is_active = CASE WHEN $is_user = 1 THEN 1 ELSE is_active END,
                    ended_at = CASE WHEN $is_user = 1 THEN NULL ELSE ended_at END
                WHERE id = $session;
                """;
            session.Parameters.AddWithValue("$is_user", role == MessageRole.User ? 1 : 0);
            session.Parameters.AddWithValue("$is_assistant", role == MessageRole.Assistant ? 1 : 0);
            session.Parameters.AddWithValue("$timestamp", timestamp);
            session.Parameters.AddWithValue("$title", TitleFrom(content));
            session.Parameters.AddWithValue("$session", sessionId);
            session.ExecuteNonQuery();
        }

        transaction.Commit();

        return new SessionMessage
        {
            Id = id,
            SessionId = sessionId,
            Role = role,
            Content = content,
            Timestamp = timestamp,
            Status = status,
            Model = model,
            CreatedAt = nowMs,
            UpdatedAt = nowMs,
        };
    }

    /// <summary>
    /// Changes a reply and returns it as stored afterwards, or null if it does not exist. Token counts
    /// are totals for the reply; the session's total grows by the difference to what was stored.
    /// </summary>
    public SessionMessage? UpdateAssistantMessage(string messageId, AssistantMessageUpdate update)
    {
        ArgumentNullException.ThrowIfNull(update);
        var nowMs = time.GetUtcNow().ToUnixTimeMilliseconds();

        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();

        long previousTokens;
        string sessionId;
        using (var read = connection.CreateCommand())
        {
            read.Transaction = transaction;
            read.CommandText =
                "SELECT session_id, coalesce(input_tokens, 0) + coalesce(output_tokens, 0) FROM agent_session_messages WHERE id = $id;";
            read.Parameters.AddWithValue("$id", messageId);
            using var reader = read.ExecuteReader();
            if (!reader.Read())
            {
                return null;
            }

            sessionId = reader.GetString(0);
            previousTokens = reader.GetInt64(1);
        }

        using (var write = connection.CreateCommand())
        {
            write.Transaction = transaction;
            write.CommandText =
                """
                UPDATE agent_session_messages SET
                    content = coalesce($content, content),
                    thinking_content = coalesce($thinking, thinking_content),
                    status = coalesce($status, status),
                    error = coalesce($error, error),
                    model = coalesce($model, model),
                    input_tokens = coalesce($input, input_tokens),
                    output_tokens = coalesce($output, output_tokens),
                    tokens_used = coalesce($input, input_tokens, 0) + coalesce($output, output_tokens, 0),
                    updated_at = $now
                WHERE id = $id;
                """;
            write.Parameters.AddWithValue("$content", (object?)update.Content ?? DBNull.Value);
            write.Parameters.AddWithValue("$thinking", (object?)update.ThinkingContent ?? DBNull.Value);
            write.Parameters.AddWithValue("$status", update.Status is { } status ? AgentWire.Name(status) : DBNull.Value);
            write.Parameters.AddWithValue("$error", (object?)update.Error ?? DBNull.Value);
            write.Parameters.AddWithValue("$model", (object?)update.Model ?? DBNull.Value);
            write.Parameters.AddWithValue("$input", (object?)update.InputTokens ?? DBNull.Value);
            write.Parameters.AddWithValue("$output", (object?)update.OutputTokens ?? DBNull.Value);
            write.Parameters.AddWithValue("$now", nowMs);
            write.Parameters.AddWithValue("$id", messageId);
            write.ExecuteNonQuery();
        }

        using (var total = connection.CreateCommand())
        {
            total.Transaction = transaction;
            total.CommandText =
                """
                UPDATE agent_sessions SET total_tokens = total_tokens - $previous + (
                    SELECT coalesce(input_tokens, 0) + coalesce(output_tokens, 0)
                    FROM agent_session_messages WHERE id = $id)
                WHERE id = $session;
                """;
            total.Parameters.AddWithValue("$previous", previousTokens);
            total.Parameters.AddWithValue("$id", messageId);
            total.Parameters.AddWithValue("$session", sessionId);
            total.ExecuteNonQuery();
        }

        var message = ReadMessage(connection, transaction, messageId);
        transaction.Commit();
        return message;
    }

    /// <summary>Records that the model asked for a tool. The call is <see cref="ToolCallStatus.Running"/>.</summary>
    /// <param name="messageId">The reply the call belongs to; it must exist.</param>
    /// <param name="toolUseId">The model provider's id for the call.</param>
    /// <param name="name">The tool's name.</param>
    /// <param name="argumentsJson">The arguments as a JSON object.</param>
    public ToolCall AddToolCall(string messageId, string toolUseId, string name, string argumentsJson)
    {
        var now = time.GetUtcNow();
        var nowMs = now.ToUnixTimeMilliseconds();
        var id = Ids.NewId(now);

        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();

        int position;
        using (var next = connection.CreateCommand())
        {
            next.Transaction = transaction;
            next.CommandText = "SELECT coalesce(max(position), -1) + 1 FROM agent_tool_calls WHERE message_id = $message;";
            next.Parameters.AddWithValue("$message", messageId);
            position = Convert.ToInt32(next.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
        }

        using (var insert = connection.CreateCommand())
        {
            insert.Transaction = transaction;
            insert.CommandText =
                """
                INSERT INTO agent_tool_calls (id, message_id, position, tool_use_id, name, arguments, status, created_at, updated_at)
                VALUES ($id, $message, $position, $tool_use, $name, $arguments, 'running', $now, $now);
                """;
            insert.Parameters.AddWithValue("$id", id);
            insert.Parameters.AddWithValue("$message", messageId);
            insert.Parameters.AddWithValue("$position", position);
            insert.Parameters.AddWithValue("$tool_use", toolUseId);
            insert.Parameters.AddWithValue("$name", name);
            insert.Parameters.AddWithValue("$arguments", argumentsJson);
            insert.Parameters.AddWithValue("$now", nowMs);
            insert.ExecuteNonQuery();
        }

        transaction.Commit();

        return new ToolCall
        {
            Id = id,
            MessageId = messageId,
            Position = position,
            ToolUseId = toolUseId,
            Name = name,
            ArgumentsJson = argumentsJson,
            Status = ToolCallStatus.Running,
            CreatedAt = nowMs,
            UpdatedAt = nowMs,
        };
    }

    /// <summary>Stores the outcome of a tool call. Returns the call as stored, or null if it is unknown.</summary>
    /// <param name="messageId">The reply the call belongs to.</param>
    /// <param name="toolUseId">The model provider's id for the call.</param>
    /// <param name="status">How the call ended.</param>
    /// <param name="resultSummaryJson">A short JSON value for display, or null.</param>
    /// <param name="resultJson">The result as JSON, or null when it is not kept.</param>
    /// <param name="durationMs">How long the tool ran.</param>
    public ToolCall? FinishToolCall(
        string messageId,
        string toolUseId,
        ToolCallStatus status,
        string? resultSummaryJson,
        string? resultJson,
        long? durationMs)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            $"""
             UPDATE agent_tool_calls SET
                 status = $status, result_summary = $summary, result = $result, duration_ms = $duration, updated_at = $now
             WHERE message_id = $message AND tool_use_id = $tool_use
             RETURNING {ToolCallColumns};
             """;
        command.Parameters.AddWithValue("$status", AgentWire.Name(status));
        command.Parameters.AddWithValue("$summary", (object?)resultSummaryJson ?? DBNull.Value);
        command.Parameters.AddWithValue("$result", (object?)resultJson ?? DBNull.Value);
        command.Parameters.AddWithValue("$duration", (object?)durationMs ?? DBNull.Value);
        command.Parameters.AddWithValue("$now", time.GetUtcNow().ToUnixTimeMilliseconds());
        command.Parameters.AddWithValue("$message", messageId);
        command.Parameters.AddWithValue("$tool_use", toolUseId);
        using var reader = command.ExecuteReader();
        return reader.Read() ? ReadToolCall(reader) : null;
    }

    /// <summary>
    /// Replaces the display summary of the call with this provider id, wherever it is. Used by the order
    /// mirror, which knows an order's tool call but not its message. Returns the message that changed,
    /// or null if no call has that id.
    /// </summary>
    public SessionMessage? SetResultSummary(string toolUseId, string resultSummaryJson)
    {
        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();

        string? messageId;
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText =
                """
                UPDATE agent_tool_calls SET result_summary = $summary, updated_at = $now
                WHERE tool_use_id = $tool_use
                RETURNING message_id;
                """;
            command.Parameters.AddWithValue("$summary", resultSummaryJson);
            command.Parameters.AddWithValue("$now", time.GetUtcNow().ToUnixTimeMilliseconds());
            command.Parameters.AddWithValue("$tool_use", toolUseId);
            messageId = command.ExecuteScalar() as string;
        }

        var message = messageId is null ? null : ReadMessage(connection, transaction, messageId);
        transaction.Commit();
        return message;
    }

    public SessionMessage? Get(string messageId)
    {
        using var connection = database.Open();
        return ReadMessage(connection, transaction: null, messageId);
    }

    /// <summary>
    /// A page of a session's messages in reading order (oldest first): the newest <paramref name="limit"/>
    /// messages, or those just before <paramref name="before"/>.
    /// </summary>
    public IReadOnlyList<SessionMessage> GetWindow(string sessionId, int limit, MessageCursor? before = null)
    {
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(limit);
        using var connection = database.Open();

        var messages = new List<SessionMessage>();
        using (var command = connection.CreateCommand())
        {
            command.CommandText =
                $"""
                 SELECT {MessageColumns} FROM agent_session_messages
                 WHERE session_id = $session
                   AND ($before_ts IS NULL OR timestamp < $before_ts OR (timestamp = $before_ts AND id < $before_id))
                 ORDER BY timestamp DESC, id DESC
                 LIMIT $limit;
                 """;
            command.Parameters.AddWithValue("$session", sessionId);
            command.Parameters.AddWithValue("$before_ts", before is { } cursor ? cursor.Timestamp : DBNull.Value);
            command.Parameters.AddWithValue("$before_id", before is { } cursorId ? cursorId.Id : DBNull.Value);
            command.Parameters.AddWithValue("$limit", limit);
            using var reader = command.ExecuteReader();
            while (reader.Read())
            {
                messages.Add(ReadMessageRow(reader));
            }
        }

        messages.Reverse();
        for (var i = 0; i < messages.Count; i++)
        {
            messages[i] = messages[i] with { ToolCalls = ReadToolCalls(connection, transaction: null, messages[i].Id) };
        }

        return messages;
    }

    internal static string TitleFrom(string content)
    {
        var text = content.Trim();
        return text.Length <= TitleLength ? text : string.Concat(text.AsSpan(0, TitleLength), "...");
    }

    private static long LastTimestamp(SqliteConnection connection, SqliteTransaction transaction, string sessionId)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT coalesce(max(timestamp), 0) FROM agent_session_messages WHERE session_id = $session;";
        command.Parameters.AddWithValue("$session", sessionId);
        return Convert.ToInt64(command.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static SessionMessage? ReadMessage(SqliteConnection connection, SqliteTransaction? transaction, string messageId)
    {
        SessionMessage message;
        using (var command = connection.CreateCommand())
        {
            command.Transaction = transaction;
            command.CommandText = $"SELECT {MessageColumns} FROM agent_session_messages WHERE id = $id;";
            command.Parameters.AddWithValue("$id", messageId);
            using var reader = command.ExecuteReader();
            if (!reader.Read())
            {
                return null;
            }

            message = ReadMessageRow(reader);
        }

        return message with { ToolCalls = ReadToolCalls(connection, transaction, messageId) };
    }

    private static List<ToolCall> ReadToolCalls(SqliteConnection connection, SqliteTransaction? transaction, string messageId)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = $"SELECT {ToolCallColumns} FROM agent_tool_calls WHERE message_id = $message ORDER BY position;";
        command.Parameters.AddWithValue("$message", messageId);

        var calls = new List<ToolCall>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            calls.Add(ReadToolCall(reader));
        }

        return calls;
    }

    private static SessionMessage ReadMessageRow(SqliteDataReader reader) => new()
    {
        Id = reader.GetString(0),
        SessionId = reader.GetString(1),
        Role = AgentWire.ParseMessageRole(reader.GetString(2)),
        Content = reader.GetString(3),
        Timestamp = reader.GetInt64(4),
        Status = AgentWire.ParseMessageStatus(reader.GetString(5)),
        Error = reader.IsDBNull(6) ? null : reader.GetString(6),
        ThinkingContent = reader.IsDBNull(7) ? null : reader.GetString(7),
        Model = reader.IsDBNull(8) ? null : reader.GetString(8),
        InputTokens = reader.IsDBNull(9) ? null : reader.GetInt64(9),
        OutputTokens = reader.IsDBNull(10) ? null : reader.GetInt64(10),
        DecisionId = reader.IsDBNull(11) ? null : reader.GetString(11),
        CreatedAt = reader.GetInt64(12),
        UpdatedAt = reader.GetInt64(13),
    };

    private static ToolCall ReadToolCall(SqliteDataReader reader) => new()
    {
        Id = reader.GetString(0),
        MessageId = reader.GetString(1),
        Position = reader.GetInt32(2),
        ToolUseId = reader.GetString(3),
        Name = reader.GetString(4),
        ArgumentsJson = reader.GetString(5),
        Status = AgentWire.ParseToolCallStatus(reader.GetString(6)),
        ResultSummaryJson = reader.IsDBNull(7) ? null : reader.GetString(7),
        ResultJson = reader.IsDBNull(8) ? null : reader.GetString(8),
        DurationMs = reader.IsDBNull(9) ? null : reader.GetInt64(9),
        CreatedAt = reader.GetInt64(10),
        UpdatedAt = reader.GetInt64(11),
    };
}
