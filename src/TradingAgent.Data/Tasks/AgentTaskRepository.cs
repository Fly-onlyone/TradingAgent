using Microsoft.Data.Sqlite;
using TradingAgent.Core;
using TradingAgent.Core.Tasks;

namespace TradingAgent.Data.Tasks;

/// <summary>Work the agent does on a schedule, with nobody watching.</summary>
public sealed record AgentTask
{
    public const string Active = "active";
    public const string Paused = "paused";
    public const string Completed = "completed";
    public const string Failed = "failed";

    public required string Id { get; init; }

    public required string Name { get; init; }

    /// <summary>What the agent is asked to do on each run.</summary>
    public string Instructions { get; init; } = string.Empty;

    public IReadOnlyList<TaskSchedule> Schedules { get; init; } = [];

    /// <summary>The time zone the schedules' times of day are read in.</summary>
    public string TimeZone { get; init; } = TimeZoneInfo.Local.Id;

    public IReadOnlyList<string> Symbols { get; init; } = [];

    /// <summary>False keeps every run of the task from placing, cancelling or changing anything on the exchange.</summary>
    public bool TradingEnabled { get; init; }

    /// <summary>True when the agent must ask the user before it places an order in a run of this task.</summary>
    public bool AskFirst { get; init; } = true;

    public string Status { get; init; } = Active;

    public long? NextRunAt { get; init; }

    public long? LastRunAt { get; init; }

    public int RunCount { get; init; }

    public int SuccessCount { get; init; }

    public int FailureCount { get; init; }

    public int ConsecutiveFailures { get; init; }

    public int MaxConsecutiveFailures { get; init; } = 3;

    public string? LastError { get; init; }

    /// <summary>The session of the latest run, to open it in the chat screen.</summary>
    public string? LastSessionId { get; init; }

    public long CreatedAt { get; init; }

    /// <summary>The zone of <see cref="TimeZone"/>; the computer's zone when that id is not known here.</summary>
    public TimeZoneInfo Zone => TimeZoneInfo.TryFindSystemTimeZoneById(TimeZone, out var zone) ? zone : TimeZoneInfo.Local;
}

/// <summary>What a person or the agent gives to make or change a task.</summary>
public sealed record TaskDraft(
    string Name,
    string Instructions,
    IReadOnlyList<TaskSchedule> Schedules,
    IReadOnlyList<string>? Symbols = null,
    bool TradingEnabled = false,
    bool AskFirst = true);

/// <summary>The scheduled tasks.</summary>
public sealed class AgentTaskRepository(Database database, TimeProvider time)
{
    private const string Columns =
        """
        id, name, coalesce(custom_instructions, ''), schedules, timezone, symbols, trading_enabled, agent_mode, status,
        next_run_at, last_run_at, run_count, success_count, failure_count, consecutive_failures,
        max_consecutive_failures, last_error, last_session_id, created_at
        """;

    /// <summary>Makes a task. It first runs at the first time its schedules give; with no schedule it runs once, right away.</summary>
    public AgentTask Create(TaskDraft draft)
    {
        ArgumentNullException.ThrowIfNull(draft);
        ArgumentException.ThrowIfNullOrWhiteSpace(draft.Name);
        var now = time.GetUtcNow();
        var id = Ids.NewId(now);
        database.Execute(
            """
            INSERT INTO agent_tasks (id, name, custom_instructions, schedules, timezone, symbols, trading_enabled, agent_mode, next_run_at, created_at, updated_at)
            VALUES ($id, $name, $instructions, $schedules, $zone, $symbols, $trading, $mode, $next, $now, $now);
            """,
            ("$id", id),
            ("$name", draft.Name.Trim()),
            ("$instructions", draft.Instructions.Trim()),
            ("$schedules", TaskSchedule.Serialize(draft.Schedules)),
            ("$zone", TimeZoneInfo.Local.Id),
            ("$symbols", JsonText.List(draft.Symbols)),
            ("$trading", draft.TradingEnabled ? 1 : 0),
            ("$mode", draft.AskFirst ? "ask" : "auto"),
            ("$next", FirstRun(draft.Schedules, now)),
            ("$now", now.ToUnixTimeMilliseconds()));
        return Get(id)!;
    }

    /// <summary>Changes a task and works out its next run again. A task that failed or finished becomes active.</summary>
    public bool Update(string id, TaskDraft draft)
    {
        ArgumentNullException.ThrowIfNull(draft);
        ArgumentException.ThrowIfNullOrWhiteSpace(draft.Name);
        var now = time.GetUtcNow();
        return database.Execute(
            """
            UPDATE agent_tasks SET
                name = $name, custom_instructions = $instructions, schedules = $schedules, symbols = $symbols,
                trading_enabled = $trading, agent_mode = $mode, next_run_at = $next,
                status = CASE WHEN status = 'paused' THEN 'paused' ELSE 'active' END,
                consecutive_failures = 0, updated_at = $now
            WHERE id = $id;
            """,
            ("$id", id),
            ("$name", draft.Name.Trim()),
            ("$instructions", draft.Instructions.Trim()),
            ("$schedules", TaskSchedule.Serialize(draft.Schedules)),
            ("$symbols", JsonText.List(draft.Symbols)),
            ("$trading", draft.TradingEnabled ? 1 : 0),
            ("$mode", draft.AskFirst ? "ask" : "auto"),
            ("$next", FirstRun(draft.Schedules, now)),
            ("$now", now.ToUnixTimeMilliseconds())) > 0;
    }

    public AgentTask? Get(string id) => database.First($"SELECT {Columns} FROM agent_tasks WHERE id = $id;", Read, ("$id", id));

    public IReadOnlyList<AgentTask> List() =>
        database.Query($"SELECT {Columns} FROM agent_tasks ORDER BY created_at DESC, id DESC;", Read);

    public bool Delete(string id) => database.Execute("DELETE FROM agent_tasks WHERE id = $id;", ("$id", id)) > 0;

    /// <summary>The active tasks whose time has come, the one that waited longest first.</summary>
    public IReadOnlyList<AgentTask> Due() =>
        database.Query(
            $"SELECT {Columns} FROM agent_tasks WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= $now ORDER BY next_run_at;",
            Read,
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()));

    /// <summary>Pauses a task, or makes it active again with its next run worked out from now.</summary>
    public bool SetPaused(string id, bool paused)
    {
        if (Get(id) is not { } task)
        {
            return false;
        }

        var now = time.GetUtcNow();
        return database.Execute(
            "UPDATE agent_tasks SET status = $status, next_run_at = $next, consecutive_failures = 0, updated_at = $now WHERE id = $id;",
            ("$id", id),
            ("$status", paused ? AgentTask.Paused : AgentTask.Active),
            ("$next", paused ? null : FirstRun(task.Schedules, now)),
            ("$now", now.ToUnixTimeMilliseconds())) > 0;
    }

    /// <summary>
    /// Records one run. After too many failures in a row the task stops as failed; a task with no
    /// further run is completed.
    /// </summary>
    public void RecordRun(string id, string? sessionId, bool succeeded, string? error, DateTimeOffset? nextRun)
    {
        database.Execute(
            """
            UPDATE agent_tasks SET
                last_run_at = $now, last_session_id = coalesce($session, last_session_id), run_count = run_count + 1,
                success_count = success_count + $ok, failure_count = failure_count + 1 - $ok,
                consecutive_failures = CASE WHEN $ok = 1 THEN 0 ELSE consecutive_failures + 1 END,
                last_error = $error, next_run_at = $next,
                status = CASE
                    WHEN status <> 'active' THEN status
                    WHEN $ok = 0 AND consecutive_failures + 1 >= max_consecutive_failures THEN 'failed'
                    WHEN $next IS NULL THEN 'completed'
                    ELSE 'active' END,
                updated_at = $now
            WHERE id = $id;
            """,
            ("$id", id),
            ("$session", sessionId),
            ("$ok", succeeded ? 1 : 0),
            ("$error", succeeded ? null : error ?? "The run failed."),
            ("$next", nextRun?.ToUnixTimeMilliseconds()),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()));
    }

    /// <summary>Moves a task's next run without counting a run: used when a run is skipped.</summary>
    public void SetNextRun(string id, DateTimeOffset? nextRun) =>
        database.Execute(
            "UPDATE agent_tasks SET next_run_at = $next, updated_at = $now WHERE id = $id;",
            ("$id", id),
            ("$next", nextRun?.ToUnixTimeMilliseconds()),
            ("$now", time.GetUtcNow().ToUnixTimeMilliseconds()));

    private static long FirstRun(IReadOnlyList<TaskSchedule> schedules, DateTimeOffset now) =>
        (TaskSchedule.Next(schedules, now, TimeZoneInfo.Local) ?? now).ToUnixTimeMilliseconds();

    private static AgentTask Read(SqliteDataReader reader) => new()
    {
        Id = reader.GetString(0),
        Name = reader.GetString(1),
        Instructions = reader.GetString(2),
        Schedules = TaskSchedule.Parse(reader.GetString(3)),
        TimeZone = reader.GetString(4),
        Symbols = JsonText.ReadList(reader.GetString(5)),
        TradingEnabled = reader.GetInt64(6) == 1,
        AskFirst = reader.GetString(7) != "auto",
        Status = reader.GetString(8),
        NextRunAt = reader.Whole(9),
        LastRunAt = reader.Whole(10),
        RunCount = reader.GetInt32(11),
        SuccessCount = reader.GetInt32(12),
        FailureCount = reader.GetInt32(13),
        ConsecutiveFailures = reader.GetInt32(14),
        MaxConsecutiveFailures = reader.GetInt32(15),
        LastError = reader.Text(16),
        LastSessionId = reader.Text(17),
        CreatedAt = reader.GetInt64(18),
    };
}
