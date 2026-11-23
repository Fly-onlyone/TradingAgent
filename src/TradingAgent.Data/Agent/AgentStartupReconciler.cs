using Microsoft.Extensions.Logging;

namespace TradingAgent.Data.Agent;

/// <summary>What <see cref="AgentStartupReconciler.Reconcile"/> repaired.</summary>
public readonly record struct ReconcileResult(int Messages, int ToolCalls, int Sessions)
{
    public bool Any => Messages > 0 || ToolCalls > 0 || Sessions > 0;
}

/// <summary>
/// Repairs what a run left behind when the app stopped in the middle of it. Without this a reply would
/// show as "being written" forever.
/// </summary>
/// <remarks>Run once at start, before anything can start a new run.</remarks>
public sealed partial class AgentStartupReconciler(Database database, TimeProvider time, ILogger<AgentStartupReconciler> logger)
{
    /// <summary>Shown under a reply that was cut off.</summary>
    public const string InterruptedMessage = "The app was closed while this reply was being written.";

    public ReconcileResult Reconcile()
    {
        var now = time.GetUtcNow().ToUnixTimeMilliseconds();
        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();

        var toolCalls = Execute(
            connection,
            transaction,
            "UPDATE agent_tool_calls SET status = 'failed', updated_at = $now WHERE status = 'running';",
            now);
        var messages = Execute(
            connection,
            transaction,
            "UPDATE agent_session_messages SET status = 'failed', error = $error, updated_at = $now WHERE status = 'running';",
            now,
            InterruptedMessage);
        // A chat stays open for the user to continue. A task run or a helper's session has no one to
        // continue it.
        var sessions = Execute(
            connection,
            transaction,
            "UPDATE agent_sessions SET is_active = 0, ended_at = $now WHERE is_active = 1 AND session_kind IN ('task_run', 'subagent');",
            now);

        transaction.Commit();

        var result = new ReconcileResult(messages, toolCalls, sessions);
        if (result.Any)
        {
            LogReconciled(logger, messages, toolCalls, sessions);
        }

        return result;
    }

    private static int Execute(
        Microsoft.Data.Sqlite.SqliteConnection connection,
        Microsoft.Data.Sqlite.SqliteTransaction transaction,
        string sql,
        long now,
        string? error = null)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = sql;
        command.Parameters.AddWithValue("$now", now);
        if (error is not null)
        {
            command.Parameters.AddWithValue("$error", error);
        }

        return command.ExecuteNonQuery();
    }

    [LoggerMessage(
        Level = LogLevel.Warning,
        Message = "The last run of the app ended during agent work: marked {Messages} replies and {ToolCalls} tool calls as failed, closed {Sessions} sessions.")]
    private static partial void LogReconciled(ILogger logger, int messages, int toolCalls, int sessions);
}
