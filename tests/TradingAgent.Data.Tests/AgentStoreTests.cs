using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Logging;
using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class AgentStoreTests
{
    private const long Now = 1_790_000_000_000;
    private const long Day = 24L * 60 * 60 * 1000;

    [Fact]
    public void A_new_session_is_an_active_chat_without_messages()
    {
        using var store = new Store();

        var created = store.Sessions.Create();
        var loaded = store.Sessions.Get(created.Id);

        Assert.NotNull(loaded);
        Assert.Equal(created, loaded);
        Assert.Equal(SessionKind.Chat, loaded.Kind);
        Assert.True(loaded.IsActive);
        Assert.Equal(Now, loaded.StartedAt);
        Assert.Equal(0, loaded.TotalMessages);
        Assert.Null(loaded.Title);
        Assert.Null(store.Sessions.Get("000000000000000000000000"));
    }

    [Fact]
    public void The_first_user_message_becomes_the_title_and_later_ones_do_not_change_it()
    {
        using var store = new Store();
        var session = store.Sessions.Create();

        store.Messages.Append(session.Id, MessageRole.User, "  Should I buy BTC now?  ");
        store.Messages.Append(session.Id, MessageRole.User, "And ETH?");

        Assert.Equal("Should I buy BTC now?", store.Sessions.Get(session.Id)!.Title);
    }

    [Fact]
    public void A_long_first_message_is_cut_to_a_title_of_fifty_characters()
    {
        using var store = new Store();
        var session = store.Sessions.Create();

        store.Messages.Append(session.Id, MessageRole.User, new string('a', 80));

        Assert.Equal(new string('a', 50) + "...", store.Sessions.Get(session.Id)!.Title);
    }

    [Fact]
    public void An_assistant_message_does_not_title_a_session()
    {
        using var store = new Store();
        var session = store.Sessions.Create();

        store.Messages.Append(session.Id, MessageRole.Assistant, "Hello");

        Assert.Null(store.Sessions.Get(session.Id)!.Title);
    }

    [Fact]
    public void Messages_are_counted_on_their_session()
    {
        using var store = new Store();
        var session = store.Sessions.Create();

        store.Messages.Append(session.Id, MessageRole.User, "one");
        var reply = store.Messages.Append(session.Id, MessageRole.Assistant, "two");
        store.Messages.Append(session.Id, MessageRole.User, "three");

        var loaded = store.Sessions.Get(session.Id)!;
        Assert.Equal(3, loaded.TotalMessages);
        Assert.Equal(2, loaded.UserMessages);
        Assert.Equal(1, loaded.AssistantMessages);
        Assert.True(loaded.LastMessageAt > reply.Timestamp);
    }

    [Fact]
    public void Messages_written_in_the_same_millisecond_keep_their_order()
    {
        using var store = new Store();
        var session = store.Sessions.Create();

        // The clock does not move between these writes.
        var first = store.Messages.Append(session.Id, MessageRole.User, "question");
        var second = store.Messages.Append(session.Id, MessageRole.Assistant, string.Empty, MessageStatus.Running);
        var third = store.Messages.Append(session.Id, MessageRole.User, "another");

        Assert.True(first.Timestamp < second.Timestamp);
        Assert.True(second.Timestamp < third.Timestamp);
        Assert.Equal(
            ["question", string.Empty, "another"],
            store.Messages.GetWindow(session.Id, 10).Select(message => message.Content));
    }

    [Fact]
    public void A_window_returns_the_newest_messages_in_reading_order_and_pages_backwards()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        for (var i = 1; i <= 5; i++)
        {
            store.Messages.Append(session.Id, MessageRole.User, $"m{i}");
        }

        var newest = store.Messages.GetWindow(session.Id, 2);
        var older = store.Messages.GetWindow(session.Id, 2, new MessageCursor(newest[0].Timestamp, newest[0].Id));
        var oldest = store.Messages.GetWindow(session.Id, 2, new MessageCursor(older[0].Timestamp, older[0].Id));

        Assert.Equal(["m4", "m5"], newest.Select(message => message.Content));
        Assert.Equal(["m2", "m3"], older.Select(message => message.Content));
        Assert.Equal(["m1"], oldest.Select(message => message.Content));
    }

    [Fact]
    public void A_user_message_reopens_an_ended_session()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        Assert.True(store.Sessions.End(session.Id));
        Assert.False(store.Sessions.End(session.Id));
        Assert.False(store.Sessions.Get(session.Id)!.IsActive);

        store.Messages.Append(session.Id, MessageRole.User, "still there?");

        var loaded = store.Sessions.Get(session.Id)!;
        Assert.True(loaded.IsActive);
        Assert.Null(loaded.EndedAt);
    }

    [Fact]
    public void A_reply_is_filled_in_while_it_runs_and_its_tokens_are_counted_once()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        var reply = store.Messages.Append(session.Id, MessageRole.Assistant, string.Empty, MessageStatus.Running, "claude-sonnet-5-5");

        store.Messages.UpdateAssistantMessage(reply.Id, new AssistantMessageUpdate { Content = "Look", InputTokens = 100, OutputTokens = 5 });
        var finished = store.Messages.UpdateAssistantMessage(
            reply.Id,
            new AssistantMessageUpdate
            {
                Content = "Looking good.",
                ThinkingContent = "The trend is up.",
                Status = MessageStatus.Complete,
                InputTokens = 100,
                OutputTokens = 40,
            });

        Assert.NotNull(finished);
        Assert.Equal("Looking good.", finished.Content);
        Assert.Equal("The trend is up.", finished.ThinkingContent);
        Assert.Equal(MessageStatus.Complete, finished.Status);
        Assert.Equal("claude-sonnet-5-5", finished.Model);
        Assert.Equal(140, finished.InputTokens + finished.OutputTokens);
        // Not 105 + 140: the totals of a reply replace each other.
        Assert.Equal(140, store.Sessions.Get(session.Id)!.TotalTokens);
    }

    [Fact]
    public void An_update_leaves_out_what_it_does_not_mention()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        var reply = store.Messages.Append(session.Id, MessageRole.Assistant, "partial", MessageStatus.Running);

        var failed = store.Messages.UpdateAssistantMessage(
            reply.Id,
            new AssistantMessageUpdate { Status = MessageStatus.Failed, Error = "The model is overloaded." });

        Assert.NotNull(failed);
        Assert.Equal("partial", failed.Content);
        Assert.Equal(MessageStatus.Failed, failed.Status);
        Assert.Equal("The model is overloaded.", failed.Error);
        Assert.Null(store.Messages.UpdateAssistantMessage("000000000000000000000000", new AssistantMessageUpdate()));
    }

    [Fact]
    public void Tool_calls_keep_the_order_they_were_made_in_and_receive_their_results_by_id()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        var reply = store.Messages.Append(session.Id, MessageRole.Assistant, string.Empty, MessageStatus.Running);

        var ticker = store.Messages.AddToolCall(reply.Id, "toolu_1", "get_ticker", """{"symbol":"BTC-USDT"}""");
        var order = store.Messages.AddToolCall(reply.Id, "toolu_2", "okx_spot_place_order", """{"instId":"BTC-USDT","sz":"0.01"}""");
        // The second call finishes first.
        var denied = store.Messages.FinishToolCall(reply.Id, "toolu_2", ToolCallStatus.Denied, """{"reason":"RiskManager: AVOID"}""", null, 12);
        var done = store.Messages.FinishToolCall(reply.Id, "toolu_1", ToolCallStatus.Succeeded, "\"97000\"", """{"last":"97000"}""", 80);

        Assert.Equal(0, ticker.Position);
        Assert.Equal(1, order.Position);
        Assert.Equal(ToolCallStatus.Denied, denied!.Status);
        Assert.Equal(ToolCallStatus.Succeeded, done!.Status);
        Assert.Null(store.Messages.FinishToolCall(reply.Id, "toolu_unknown", ToolCallStatus.Failed, null, null, null));

        var calls = store.Messages.Get(reply.Id)!.ToolCalls;
        Assert.Equal(["get_ticker", "okx_spot_place_order"], calls.Select(call => call.Name));
        Assert.Equal([ToolCallStatus.Succeeded, ToolCallStatus.Denied], calls.Select(call => call.Status));
        Assert.Equal(80, calls[0].DurationMs);
        Assert.Equal("""{"last":"97000"}""", calls[0].ResultJson);
    }

    [Fact]
    public void The_summary_of_a_tool_call_can_be_replaced_knowing_only_its_provider_id()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        var reply = store.Messages.Append(session.Id, MessageRole.Assistant, "Order placed.");
        store.Messages.AddToolCall(reply.Id, "toolu_9", "okx_spot_place_order", "{}");
        store.Messages.FinishToolCall(reply.Id, "toolu_9", ToolCallStatus.Succeeded, """{"status":"live"}""", null, 5);

        var changed = store.Messages.SetResultSummary("toolu_9", """{"status":"filled","avg_fill_price":97000}""");

        Assert.NotNull(changed);
        Assert.Equal(reply.Id, changed.Id);
        Assert.Equal("""{"status":"filled","avg_fill_price":97000}""", changed.ToolCalls.Single().ResultSummaryJson);
        Assert.Equal(ToolCallStatus.Succeeded, changed.ToolCalls.Single().Status);
        Assert.Null(store.Messages.SetResultSummary("toolu_missing", "{}"));
    }

    [Fact]
    public void A_pending_question_is_kept_on_the_session_until_cleared()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        var question = new PendingQuestion("q1", "Which symbol?", ["BTC-USDT", "ETH-USDT"], MultiSelect: false, Now);

        Assert.True(store.Sessions.SetPendingQuestion(session.Id, question));
        var loaded = store.Sessions.Get(session.Id)!.PendingQuestion;
        store.Sessions.SetPendingQuestion(session.Id, null);

        Assert.NotNull(loaded);
        Assert.Equal("q1", loaded.Id);
        Assert.Equal("Which symbol?", loaded.Question);
        Assert.Equal(["BTC-USDT", "ETH-USDT"], loaded.Options);
        Assert.Null(store.Sessions.Get(session.Id)!.PendingQuestion);
    }

    [Fact]
    public void A_damaged_pending_question_reads_as_none()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        store.Temp.Execute(
            "UPDATE agent_sessions SET active_pending_question = '{\"unexpected\":true}' WHERE id = $id;",
            ("$id", session.Id));

        Assert.Null(store.Sessions.Get(session.Id)!.PendingQuestion);
    }

    [Fact]
    public void Recent_sessions_are_listed_by_latest_activity()
    {
        using var store = new Store();
        var first = store.Sessions.Create(title: "first");
        store.Time.Now = store.Time.Now.AddMinutes(1);
        var second = store.Sessions.Create(title: "second");
        store.Time.Now = store.Time.Now.AddMinutes(1);
        var task = store.Sessions.Create(SessionKind.TaskRun, "nightly");
        store.Time.Now = store.Time.Now.AddMinutes(1);
        store.Messages.Append(first.Id, MessageRole.User, "back to the first");

        Assert.Equal([first.Id, task.Id, second.Id], store.Sessions.ListRecent(10).Select(session => session.Id));
        Assert.Equal([first.Id, second.Id], store.Sessions.ListRecent(10, SessionKind.Chat).Select(session => session.Id));
        Assert.Equal([first.Id], store.Sessions.ListRecent(1).Select(session => session.Id));
    }

    [Fact]
    public void Session_details_can_be_changed()
    {
        using var store = new Store();
        var session = store.Sessions.Create();

        store.Sessions.SetTitle(session.Id, "BTC plan", "Weekly review");
        store.Sessions.SetSdkSessionId(session.Id, "6f1c0d2e-0000-4000-8000-000000000001");
        store.Sessions.SetRuntime(session.Id, AgentWire.Anthropic, AgentWire.Subscription);

        var loaded = store.Sessions.Get(session.Id)!;
        Assert.Equal("BTC plan", loaded.Title);
        Assert.Equal("Weekly review", loaded.Description);
        Assert.Equal("6f1c0d2e-0000-4000-8000-000000000001", loaded.SdkSessionId);
        Assert.Equal(AgentWire.Anthropic, loaded.Provider);
        Assert.Equal(AgentWire.Subscription, loaded.AuthMode);
        Assert.False(store.Sessions.SetTitle("000000000000000000000000", "x", null));
    }

    [Fact]
    public void Deleting_a_session_removes_everything_that_belongs_to_it()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        var reply = store.Messages.Append(session.Id, MessageRole.Assistant, "hi");
        store.Messages.AddToolCall(reply.Id, "toolu_1", "get_ticker", "{}");
        store.Transcript.Append(session.Id, AgentWire.Anthropic, "claude-sonnet-5-5", ["""{"role":"user","content":"hi"}"""]);

        Assert.True(store.Sessions.Delete(session.Id));

        Assert.Null(store.Sessions.Get(session.Id));
        Assert.Equal(0, store.Temp.Scalar<long>("SELECT count(*) FROM agent_session_messages;"));
        Assert.Equal(0, store.Temp.Scalar<long>("SELECT count(*) FROM agent_tool_calls;"));
        Assert.Equal(0, store.Temp.Scalar<long>("SELECT count(*) FROM agent_transcript;"));
    }

    [Fact]
    public void The_transcript_returns_items_exactly_as_stored_and_in_order()
    {
        using var store = new Store();
        var session = store.Sessions.Create();
        // Key order and spacing must survive: the provider compares what comes back with what it sent.
        const string User = """{"role":"user","content":[{"type":"text","text":"hi"}]}""";
        const string Assistant = """{ "role": "assistant", "content": [ { "type": "thinking", "thinking": "", "signature": "abc" } ] }""";
        const string ToolResult = """{"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"97000"}]}""";

        store.Transcript.Append(session.Id, AgentWire.Anthropic, "claude-sonnet-5-5", [User, Assistant]);
        store.Transcript.Append(session.Id, AgentWire.Anthropic, "claude-sonnet-5-5", []);
        store.Transcript.Append(session.Id, AgentWire.Anthropic, "claude-sonnet-5-5", [ToolResult]);

        var items = store.Transcript.Load(session.Id);
        Assert.Equal([User, Assistant, ToolResult], items.Select(item => item.Json));
        Assert.Equal([1L, 2L, 3L], items.Select(item => item.Seq));
        Assert.All(items, item => Assert.Equal(AgentWire.Anthropic, item.Provider));

        Assert.Equal(3, store.Transcript.Clear(session.Id));
        Assert.Empty(store.Transcript.Load(session.Id));
    }

    [Fact]
    public void After_a_crash_running_work_is_marked_failed_and_unattended_sessions_are_closed()
    {
        using var store = new Store();
        var chat = store.Sessions.Create();
        var taskRun = store.Sessions.Create(SessionKind.TaskRun, "nightly");
        var done = store.Messages.Append(chat.Id, MessageRole.Assistant, "finished earlier");
        var cutOff = store.Messages.Append(chat.Id, MessageRole.Assistant, "The price is", MessageStatus.Running);
        store.Messages.AddToolCall(cutOff.Id, "toolu_1", "get_ticker", "{}");
        store.Messages.AddToolCall(done.Id, "toolu_0", "get_ticker", "{}");
        store.Messages.FinishToolCall(done.Id, "toolu_0", ToolCallStatus.Succeeded, null, null, 1);
        var reconciler = new AgentStartupReconciler(store.Temp.Database, store.Time, NullLogger<AgentStartupReconciler>.Instance);

        var result = reconciler.Reconcile();
        var again = reconciler.Reconcile();

        Assert.Equal(new ReconcileResult(Messages: 1, ToolCalls: 1, Sessions: 1), result);
        Assert.False(again.Any);
        var repaired = store.Messages.Get(cutOff.Id)!;
        Assert.Equal(MessageStatus.Failed, repaired.Status);
        Assert.Equal(AgentStartupReconciler.InterruptedMessage, repaired.Error);
        Assert.Equal("The price is", repaired.Content);
        Assert.Equal(ToolCallStatus.Failed, repaired.ToolCalls.Single().Status);
        Assert.Equal(MessageStatus.Complete, store.Messages.Get(done.Id)!.Status);
        Assert.Equal(ToolCallStatus.Succeeded, store.Messages.Get(done.Id)!.ToolCalls.Single().Status);
        Assert.True(store.Sessions.Get(chat.Id)!.IsActive);
        Assert.False(store.Sessions.Get(taskRun.Id)!.IsActive);
    }

    [Fact]
    public void Sessions_are_kept_forever_unless_a_retention_period_is_set()
    {
        using var store = new Store();
        var old = store.Sessions.Create();
        store.Time.Now = store.Time.Now.AddDays(400);
        using var retention = store.NewRetention();

        Assert.Equal(0, retention.PruneSessions());
        Assert.NotNull(store.Sessions.Get(old.Id));
    }

    [Fact]
    public void Sessions_without_activity_for_the_retention_period_are_deleted()
    {
        using var store = new Store();
        var old = store.Sessions.Create();
        var oldButRunning = store.Sessions.Create();
        store.Messages.Append(oldButRunning.Id, MessageRole.Assistant, string.Empty, MessageStatus.Running);
        store.Time.Now = DateTimeOffset.FromUnixTimeMilliseconds(Now + (20 * Day));
        var recent = store.Sessions.Create();
        store.Time.Now = DateTimeOffset.FromUnixTimeMilliseconds(Now + (31 * Day));
        store.Settings.SetValue(SettingKeys.SessionRetentionDays, 30);
        using var retention = store.NewRetention();

        var removed = retention.PruneSessions();

        Assert.Equal(1, removed);
        Assert.Null(store.Sessions.Get(old.Id));
        Assert.NotNull(store.Sessions.Get(oldButRunning.Id));
        Assert.NotNull(store.Sessions.Get(recent.Id));
        Assert.Equal(Now + (31 * Day), store.Settings.GetValue(SettingKeys.SessionCleanupLastRunAt));
    }

    /// <summary>The repositories over one temporary database and one clock.</summary>
    private sealed class Store : IDisposable
    {
        public Store()
        {
            Temp = new TempDatabase();
            Time = new ManualTimeProvider(DateTimeOffset.FromUnixTimeMilliseconds(Now));
            Sessions = new AgentSessionRepository(Temp.Database, Time);
            Messages = new SessionMessageRepository(Temp.Database, Time);
            Transcript = new TranscriptRepository(Temp.Database, Time);
            Settings = new SqliteSettingsStore(Temp.Database, Time, NullLogger<SqliteSettingsStore>.Instance);
        }

        public TempDatabase Temp { get; }

        public ManualTimeProvider Time { get; }

        public AgentSessionRepository Sessions { get; }

        public SessionMessageRepository Messages { get; }

        public TranscriptRepository Transcript { get; }

        public SqliteSettingsStore Settings { get; }

        public RetentionService NewRetention() =>
            new(new LogRepository(Temp.Database), Sessions, Settings, Time, NullLogger<RetentionService>.Instance);

        public void Dispose() => Temp.Dispose();
    }
}
