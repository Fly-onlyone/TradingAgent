using System.Globalization;
using System.Text.Json;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Web;
using TradingAgent.Core.Tasks;
using TradingAgent.Data.Knowledge;
using TradingAgent.Data.News;
using TradingAgent.Data.Tasks;

namespace TradingAgent.Agent.Tools;

/// <summary>Reading the looser arguments models send: lists as text, objects as text, flags as words.</summary>
internal static class ToolArgs
{
    /// <summary>A list of strings, given as a JSON list or as one text with commas.</summary>
    public static IReadOnlyList<string> Strings(JsonElement input, string name)
    {
        if (!input.TryGetProperty(name, out var value))
        {
            return [];
        }

        return value.ValueKind switch
        {
            JsonValueKind.Array => [.. value.EnumerateArray()
                .Where(item => item.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(item.GetString()))
                .Select(item => item.GetString()!.Trim())],
            JsonValueKind.String => value.GetString()!.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
            _ => [],
        };
    }

    /// <summary>A value kept as JSON text: an object or a list as it was sent, a string as its text. Null when missing.</summary>
    public static string? Json(JsonElement input, string name) =>
        input.TryGetProperty(name, out var value)
            ? value.ValueKind switch
            {
                JsonValueKind.Object or JsonValueKind.Array => value.GetRawText(),
                JsonValueKind.String => value.GetString(),
                _ => null,
            }
            : null;

    public static bool Flag(JsonElement input, string name, bool fallback) =>
        input.TryGetProperty(name, out var value)
            ? value.ValueKind switch
            {
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                JsonValueKind.String when bool.TryParse(value.GetString(), out var parsed) => parsed,
                _ => fallback,
            }
            : fallback;

    public static string Time(long? unixMs) =>
        unixMs is { } value ? DateTimeOffset.FromUnixTimeMilliseconds(value).ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture) : string.Empty;
}

/// <summary>Keeps something for later conversations.</summary>
public sealed class SaveMemoryTool(MemoryRepository memories, EmbeddingIndexer indexer) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "save_memory",
        "Remember something for later conversations: a preference of the user's, a coin they watch, the context of their trading, "
        + "an observation, the reason for a decision, a lesson. Save one fact per call, in a full sentence that makes sense on its own. "
        + "Never save keys, passwords or other secrets.",
        """
        {
          "type": "object",
          "properties": {
            "content": { "type": "string", "description": "What to remember, at most 2000 characters." },
            "category": { "type": "string", "enum": ["preference", "watchlist", "trading_context", "market_observation", "decision_rationale", "lesson", "general"] },
            "tags": { "type": "array", "items": { "type": "string" }, "description": "A few words to find it by, for example a symbol." }
          },
          "required": ["content"]
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "content") is not { } content)
        {
            return Task.FromResult(ToolOutcome.Failed("'content' is required: the sentence to remember."));
        }

        var memory = memories.Add(ToolJson.Text(input, "category") ?? MemoryRepository.DefaultCategory, content, ToolArgs.Strings(input, "tags"), sessionId: context.SessionId);
        indexer.Request();
        return Task.FromResult(new ToolOutcome(
            ToolJson.Write(writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("id", memory.Id);
                writer.WriteString("category", memory.Category);
                writer.WriteBoolean("saved", true);
                writer.WriteEndObject();
            }),
            SummaryJson: "\"saved\""));
    }
}

/// <summary>Finds what was remembered.</summary>
public sealed class SearchMemoryTool(MemoryRepository memories, KnowledgeSearch search) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "search_memory",
        "Find what was remembered in earlier conversations. Give a query to search, or leave it out to list the newest memories. "
        + "Use it at the start of a conversation that depends on what the user said before.",
        """
        {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "What to look for. Leave out to list the newest." },
            "category": { "type": "string", "description": "Only this category. Used when there is no query." },
            "limit": { "type": "integer", "description": "How many, 1 to 30. Default 10." }
          }
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var limit = Math.Clamp(ToolJson.Integer(input, "limit", 10), 1, 30);
        var found = new List<(string Id, string Category, string Content)>();
        if (ToolJson.Text(input, "query") is { } query)
        {
            var hits = await search.SearchAsync([KnowledgeIndex.Find("agent_memory")!], query, limit, cancellationToken).ConfigureAwait(false);
            found.AddRange(hits.Select(hit => (hit.Id, hit.Title, hit.Body)));
        }
        else
        {
            var category = ToolJson.Text(input, "category");
            found.AddRange(memories
                .List(category is null ? null : MemoryRepository.Normalize(category), limit)
                .Select(memory => (memory.Id, memory.Category, memory.Content)));
        }

        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("count", found.Count);
            writer.WriteStartArray("memories");
            foreach (var (id, category, content) in found)
            {
                writer.WriteStartObject();
                writer.WriteString("id", id);
                writer.WriteString("category", category);
                writer.WriteString("content", content);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }));
    }
}

/// <summary>Forgets one memory.</summary>
public sealed class DeleteMemoryTool(MemoryRepository memories) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "delete_memory",
        "Forget one memory, by the id search_memory gave. Use it when the user says something remembered is wrong or no longer true.",
        """
        {
          "type": "object",
          "properties": { "id": { "type": "string" } },
          "required": ["id"]
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken) =>
        Task.FromResult(ToolJson.Text(input, "id") is { } id && memories.Delete(id)
            ? new ToolOutcome("""{"deleted":true}""")
            : ToolOutcome.Failed("There is no memory with that id."));
}

/// <summary>Searches strategies, trade lessons, patterns, news and memories at once.</summary>
public sealed class SearchKnowledgeTool(KnowledgeSearch search) : ITool
{
    private static readonly (string Word, string Kind)[] _kinds =
    [
        ("strategy", "strategy_knowledge"),
        ("lesson", "trade_lesson"),
        ("pattern", "trading_pattern"),
        ("news", "news_article"),
        ("memory", "agent_memory"),
    ];

    public ToolDefinition Definition { get; } = new(
        "search_knowledge",
        "Search what the app has collected: saved trading strategies, lessons from closed trades, price patterns, news articles and memories. "
        + "Use it before a recommendation, to learn what worked and what did not.",
        """
        {
          "type": "object",
          "properties": {
            "query": { "type": "string", "description": "What to look for, in a few words." },
            "kinds": { "type": "array", "items": { "type": "string", "enum": ["strategy", "lesson", "pattern", "news", "memory"] }, "description": "Where to look. Default: everywhere." },
            "limit": { "type": "integer", "description": "How many results, 1 to 20. Default 8." }
          },
          "required": ["query"]
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "query") is not { } query)
        {
            return ToolOutcome.Failed("'query' is required.");
        }

        var asked = ToolArgs.Strings(input, "kinds");
        var kinds = _kinds
            .Where(kind => asked.Count == 0 || asked.Contains(kind.Word, StringComparer.OrdinalIgnoreCase))
            .Select(kind => KnowledgeIndex.Find(kind.Kind)!)
            .ToList();
        if (kinds.Count == 0)
        {
            return ToolOutcome.Failed("'kinds' names nothing that can be searched. Use strategy, lesson, pattern, news or memory.");
        }

        var hits = await search
            .SearchAsync(kinds, query, Math.Clamp(ToolJson.Integer(input, "limit", 8), 1, 20), cancellationToken)
            .ConfigureAwait(false);
        return new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("count", hits.Count);
            writer.WriteStartArray("results");
            foreach (var hit in hits)
            {
                writer.WriteStartObject();
                writer.WriteString("kind", _kinds.First(kind => kind.Kind == hit.Kind).Word);
                writer.WriteString("id", hit.Id);
                writer.WriteString("title", hit.Title);
                writer.WriteString("text", hit.Body);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        }));
    }
}

/// <summary>Saves a trading strategy to the Strategies page.</summary>
public sealed class SaveStrategyTool(StrategyRepository strategies, EmbeddingIndexer indexer) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "save_strategy",
        "Save a trading strategy so that it appears on the Strategies page and in search_knowledge. Save only a strategy with rules "
        + "clear enough to follow: when to enter, when to exit, and how much to risk. A strategy of the same name is not saved twice.",
        """
        {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "A short, specific name." },
            "description": { "type": "string", "description": "What the strategy is and when it works, in a few sentences." },
            "entry_rules": { "description": "When to enter: a list of rules, or an object.", "type": ["array", "object", "string"] },
            "exit_rules": { "description": "When to exit, with stop-loss and take-profit.", "type": ["array", "object", "string"] },
            "risk_params": { "description": "Position size, largest loss, leverage.", "type": ["object", "string"] },
            "timeframes": { "type": "array", "items": { "type": "string" }, "description": "For example 1H, 4H, 1D." },
            "symbols": { "type": "array", "items": { "type": "string" }, "description": "Instruments it is meant for." },
            "source_url": { "type": "string", "description": "Where it was found, when it came from the web." }
          },
          "required": ["name", "description"]
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "name") is not { } name || ToolJson.Text(input, "description") is not { } description)
        {
            return Task.FromResult(ToolOutcome.Failed("'name' and 'description' are required."));
        }

        var (strategy, created) = strategies.Save(new StrategyDraft(
            name,
            description,
            ToolArgs.Json(input, "entry_rules"),
            ToolArgs.Json(input, "exit_rules"),
            ToolArgs.Json(input, "risk_params"),
            ToolArgs.Strings(input, "timeframes"),
            ToolArgs.Strings(input, "symbols"),
            ToolJson.Text(input, "source_url"),
            SourceSessionId: context.SessionId));
        if (created)
        {
            indexer.Request();
        }

        return Task.FromResult(new ToolOutcome(
            ToolJson.Write(writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("id", strategy.Id);
                writer.WriteString("name", strategy.Name);
                writer.WriteBoolean("created", created);
                if (!created)
                {
                    writer.WriteString("note", "A strategy of this name exists already; nothing was changed.");
                }

                writer.WriteEndObject();
            }),
            SummaryJson: created ? "\"saved\"" : "\"exists already\""));
    }
}

/// <summary>Lists the saved strategies with their rules.</summary>
public sealed class ListStrategiesTool(StrategyRepository strategies) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "list_strategies",
        "List the saved trading strategies with their rules. The ones the user switched on are the ones to trade by.",
        """
        {
          "type": "object",
          "properties": {
            "active_only": { "type": "boolean", "description": "Only the strategies the user switched on. Default false." },
            "limit": { "type": "integer", "description": "How many, 1 to 30. Default 10." }
          }
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var found = strategies.List(Math.Clamp(ToolJson.Integer(input, "limit", 10), 1, 30), ToolArgs.Flag(input, "active_only", false));
        return Task.FromResult(new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("count", found.Count);
            writer.WriteStartArray("strategies");
            foreach (var strategy in found)
            {
                writer.WriteStartObject();
                writer.WriteString("id", strategy.Id);
                writer.WriteString("name", strategy.Name);
                writer.WriteBoolean("active", strategy.IsActive);
                writer.WriteString("description", strategy.Description);
                writer.WriteString("entry_rules", strategy.EntryRulesJson);
                writer.WriteString("exit_rules", strategy.ExitRulesJson);
                writer.WriteString("risk_params", strategy.RiskParamsJson);
                if (strategy.UserRating is { } rating)
                {
                    writer.WriteNumber("user_rating", rating);
                }

                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        })));
    }
}

/// <summary>The newest news the app collected.</summary>
public sealed class GetNewsTool(NewsRepository news) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "get_news",
        "Get crypto news the app collected from its news sources, newest first. Give an asset for news about one coin, or a query to search.",
        """
        {
          "type": "object",
          "properties": {
            "asset": { "type": "string", "description": "A ticker, for example BTC." },
            "query": { "type": "string", "description": "Words to search for. Wins over 'asset'." },
            "limit": { "type": "integer", "description": "How many, 1 to 30. Default 10." }
          }
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var limit = Math.Clamp(ToolJson.Integer(input, "limit", 10), 1, 30);
        var articles = ToolJson.Text(input, "query") is { } query
            ? news.Search(query, limit)
            : news.Recent(limit, ToolJson.Text(input, "asset"));
        return Task.FromResult(new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("count", articles.Count);
            writer.WriteStartArray("articles");
            foreach (var article in articles)
            {
                writer.WriteStartObject();
                writer.WriteString("title", article.Title);
                writer.WriteString("source", article.SourceName);
                writer.WriteString("published", ToolArgs.Time(article.PublishedAt ?? article.FetchedAt));
                writer.WriteString("summary", article.Summary);
                writer.WriteString("url", article.Url);
                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        })));
    }
}

/// <summary>Searches the web.</summary>
public sealed class WebSearchTool(BraveSearchClient brave) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "web_search",
        "Search the web. Use it for what the exchange and the collected news do not tell: an event, a project, a regulation. "
        + "Read a result's page with fetch_url when the short description is not enough.",
        """
        {
          "type": "object",
          "properties": {
            "query": { "type": "string" },
            "count": { "type": "integer", "description": "How many results, 1 to 20. Default 8." }
          },
          "required": ["query"]
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "query") is not { } query)
        {
            return ToolOutcome.Failed("'query' is required.");
        }

        try
        {
            var results = await brave.SearchAsync(query, ToolJson.Integer(input, "count", 8), cancellationToken).ConfigureAwait(false);
            return new ToolOutcome(ToolJson.Write(writer =>
            {
                writer.WriteStartObject();
                writer.WriteNumber("count", results.Count);
                writer.WriteStartArray("results");
                foreach (var result in results)
                {
                    writer.WriteStartObject();
                    writer.WriteString("title", result.Title);
                    writer.WriteString("url", result.Url);
                    writer.WriteString("description", result.Description);
                    if (result.Age is { } age)
                    {
                        writer.WriteString("age", age);
                    }

                    writer.WriteEndObject();
                }

                writer.WriteEndArray();
                writer.WriteEndObject();
            }));
        }
        catch (WebAccessException ex)
        {
            return ToolOutcome.Failed(ex.Message);
        }
    }
}

/// <summary>Reads one web page as text.</summary>
public sealed class FetchUrlTool(PageReader reader) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "fetch_url",
        "Read one public web page as text: an article, a blog post, documentation. Only public http and https addresses.",
        """
        {
          "type": "object",
          "properties": { "url": { "type": "string" } },
          "required": ["url"]
        }
        """);

    public async Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "url") is not { } url)
        {
            return ToolOutcome.Failed("'url' is required.");
        }

        try
        {
            return new ToolOutcome(await reader.ReadAsync(url, cancellationToken).ConfigureAwait(false));
        }
        catch (WebAccessException ex)
        {
            return ToolOutcome.Failed(ex.Message);
        }
    }
}

/// <summary>Makes a scheduled task. It cannot trade until the user allows that on the Tasks page.</summary>
public sealed class CreateTaskTool(AgentTaskRepository tasks) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "create_task",
        "Schedule work for yourself: a market review every morning, a check of a position every hour. Each run is a conversation of its own "
        + "in which you get the instructions you write here, so write them to be understood without this conversation. "
        + "A task made here cannot trade; the user can allow that on the Tasks page.",
        """
        {
          "type": "object",
          "properties": {
            "name": { "type": "string", "description": "A short name." },
            "instructions": { "type": "string", "description": "What to do on each run, and what to report." },
            "schedule": {
              "type": "object",
              "description": "When it runs. interval: every 'minutes' minutes. daily: every day at 'time'. weekly: on 'days' at 'time'. Times are the user's local time, 24-hour.",
              "properties": {
                "kind": { "type": "string", "enum": ["interval", "daily", "weekly"] },
                "minutes": { "type": "integer", "description": "For interval, at least 5." },
                "time": { "type": "string", "description": "For daily and weekly, for example 09:00." },
                "days": { "type": "array", "items": { "type": "string", "enum": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] } }
              },
              "required": ["kind"]
            },
            "symbols": { "type": "array", "items": { "type": "string" }, "description": "Instruments the task is about." }
          },
          "required": ["name", "instructions", "schedule"]
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        if (ToolJson.Text(input, "name") is not { } name || ToolJson.Text(input, "instructions") is not { } instructions)
        {
            return Task.FromResult(ToolOutcome.Failed("'name' and 'instructions' are required."));
        }

        if (!input.TryGetProperty("schedule", out var given) || TaskSchedule.Read(given) is not { } schedule)
        {
            return Task.FromResult(ToolOutcome.Failed(
                "'schedule' is required and must make sense: {\"kind\":\"interval\",\"minutes\":60}, {\"kind\":\"daily\",\"time\":\"09:00\"} "
                + "or {\"kind\":\"weekly\",\"time\":\"09:00\",\"days\":[\"mon\"]}."));
        }

        if (schedule is { Kind: TaskSchedule.Interval, Minutes: < 5 })
        {
            return Task.FromResult(ToolOutcome.Failed("A task can run every 5 minutes at most."));
        }

        var task = tasks.Create(new TaskDraft(name, instructions, [schedule], ToolArgs.Strings(input, "symbols")));
        return Task.FromResult(new ToolOutcome(
            ToolJson.Write(writer =>
            {
                writer.WriteStartObject();
                writer.WriteString("id", task.Id);
                writer.WriteString("schedule", schedule.Describe());
                writer.WriteString("next_run", ToolArgs.Time(task.NextRunAt));
                writer.WriteBoolean("may_trade", false);
                writer.WriteEndObject();
            }),
            SummaryJson: "\"scheduled\""));
    }
}

/// <summary>Lists the scheduled tasks.</summary>
public sealed class ListTasksTool(AgentTaskRepository tasks) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "list_tasks",
        "List the scheduled tasks: what each does, when it runs, and how its last run went.",
        """{ "type": "object", "properties": {} }""");

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var all = tasks.List();
        return Task.FromResult(new ToolOutcome(ToolJson.Write(writer =>
        {
            writer.WriteStartObject();
            writer.WriteNumber("count", all.Count);
            writer.WriteStartArray("tasks");
            foreach (var task in all)
            {
                writer.WriteStartObject();
                writer.WriteString("id", task.Id);
                writer.WriteString("name", task.Name);
                writer.WriteString("status", task.Status);
                writer.WriteString("schedule", string.Join("; ", task.Schedules.Select(schedule => schedule.Describe())));
                writer.WriteString("instructions", task.Instructions);
                writer.WriteBoolean("may_trade", task.TradingEnabled);
                writer.WriteString("next_run", ToolArgs.Time(task.NextRunAt));
                writer.WriteString("last_run", ToolArgs.Time(task.LastRunAt));
                writer.WriteNumber("runs", task.RunCount);
                if (task.LastError is { } error)
                {
                    writer.WriteString("last_error", error);
                }

                writer.WriteEndObject();
            }

            writer.WriteEndArray();
            writer.WriteEndObject();
        })));
    }
}

/// <summary>Pauses a scheduled task or lets it run again.</summary>
public sealed class PauseTaskTool(AgentTaskRepository tasks) : ITool
{
    public ToolDefinition Definition { get; } = new(
        "pause_task",
        "Pause a scheduled task, or let a paused one run again. Deleting a task and allowing it to trade are the user's to do, on the Tasks page.",
        """
        {
          "type": "object",
          "properties": {
            "id": { "type": "string", "description": "The id list_tasks gave." },
            "paused": { "type": "boolean", "description": "true pauses, false resumes." }
          },
          "required": ["id", "paused"]
        }
        """);

    public Task<ToolOutcome> InvokeAsync(JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var paused = ToolArgs.Flag(input, "paused", true);
        return Task.FromResult(ToolJson.Text(input, "id") is { } id && tasks.SetPaused(id, paused)
            ? new ToolOutcome(paused ? """{"status":"paused"}""" : """{"status":"active"}""")
            : ToolOutcome.Failed("There is no task with that id."));
    }
}
