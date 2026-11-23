using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Mcp;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.App.ViewModels;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Data;
using TradingAgent.Data.Agent;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>A database, the agent's stores and a runner whose runtime a test scripts.</summary>
internal sealed class AgentHarness : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));

    public AgentHarness()
    {
        Directory.CreateDirectory(_root);
        Database = new Database(Path.Combine(_root, "test.db"));
        Database.Initialize();
        Settings = new SqliteSettingsStore(Database, TimeProvider.System, NullLogger<SqliteSettingsStore>.Instance);
        Sessions = new AgentSessionRepository(Database, TimeProvider.System);
        Messages = new SessionMessageRepository(Database, TimeProvider.System);
        Questions = new QuestionBroker(Sessions, Events, TimeProvider.System);
        Runner = new AgentRunner(Sessions, Messages, Events, new Resolver(this), NullLogger<AgentRunner>.Instance);
    }

    public Database Database { get; }

    public SqliteSettingsStore Settings { get; }

    public AgentSessionRepository Sessions { get; }

    public SessionMessageRepository Messages { get; }

    public AgentEventHub Events { get; } = new();

    public QuestionBroker Questions { get; }

    public AgentRunner Runner { get; }

    /// <summary>What the model does with a run. The default writes one sentence.</summary>
    public Func<RunContext, RunRecorder, CancellationToken, Task<RunOutcome>> Run { get; set; } = (_, recorder, _) =>
    {
        recorder.Text("Hello.");
        recorder.AddUsage(10, 2, "fake-model");
        return Task.FromResult(RunOutcome.Complete);
    };

    public static async Task Eventually(Func<bool> condition, string what)
    {
        var deadline = DateTime.UtcNow.AddSeconds(10);
        while (!condition())
        {
            Assert.True(DateTime.UtcNow < deadline, $"Not reached in time: {what}");
            await Task.Delay(TimeSpan.FromMilliseconds(15), TestContext.Current.CancellationToken);
        }
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        try
        {
            Directory.Delete(_root, recursive: true);
        }
        catch (IOException)
        {
            // A leftover temp folder is harmless.
        }
    }

    private sealed class Resolver(AgentHarness harness) : IAgentRuntimeResolver
    {
        public ResolvedRuntime Resolve() => new(new Runtime(harness), AgentWire.Anthropic, AgentWire.ApiKey);
    }

    private sealed class Runtime(AgentHarness harness) : IAgentRuntime
    {
        public string Model => "fake-model";

        public Task<RunOutcome> ExecuteAsync(RunContext context, RunRecorder recorder, CancellationToken cancellationToken) =>
            harness.Run(context, recorder, cancellationToken);
    }
}

public sealed class ChatViewModelTests : IDisposable
{
    private readonly AgentHarness _agent = new();

    public void Dispose() => _agent.Dispose();

    [Fact]
    public async Task Sending_the_first_message_opens_a_chat_and_shows_the_reply_with_its_tool_call()
    {
        _agent.Run = (_, recorder, _) =>
        {
            recorder.StartTool(new ToolRequest("toolu_01", "get_ticker", """{"symbol":"BTC-USDT"}"""));
            recorder.FinishTool("toolu_01", new ToolOutcome("97000"), durationMs: 12);
            recorder.Text("BTC-USDT is ");
            recorder.Text("at **97,000**.");
            recorder.AddUsage(120, 30, "fake-model");
            return Task.FromResult(RunOutcome.Complete);
        };
        using var chat = NewChat();
        Assert.True(chat.IsEmpty);
        Assert.False(chat.SendCommand.CanExecute(null));

        chat.Draft = "  Price of BTC?  ";
        chat.Send();
        await AgentHarness.Eventually(() => chat is { IsRunning: false, Messages.Count: 2 } && chat.Messages[1].Footer.Length > 0, "the reply is finished");

        Assert.Equal(string.Empty, chat.Draft);
        var session = Assert.Single(chat.Sessions);
        Assert.Same(session, chat.SelectedSession);
        Assert.Equal("Price of BTC?", session.Title);
        Assert.Equal((true, "Price of BTC?"), (chat.Messages[0].IsUser, chat.Messages[0].Content));
        var reply = chat.Messages[1];
        // What streamed in pieces and what was stored are the same text, shown once.
        Assert.Equal("BTC-USDT is at **97,000**.", reply.Content);
        Assert.Equal("fake-model · 120 tokens in, 30 out", reply.Footer);
        Assert.False(reply.IsRunning);
        var call = Assert.Single(reply.ToolCalls);
        Assert.Equal(("get_ticker", "succeeded · 12 ms", false), (call.Name, call.Status, call.IsProblem));
        Assert.False(chat.IsEmpty);
    }

    [Fact]
    public async Task A_failed_reply_says_why_and_a_refused_tool_is_marked()
    {
        _agent.Run = (_, recorder, _) =>
        {
            recorder.StartTool(new ToolRequest("toolu_01", "okx_spot_place_order", "{}"));
            recorder.FinishTool("toolu_01", ToolOutcome.Denied("Risk check: AVOID"), durationMs: 3);
            return Task.FromResult(RunOutcome.Failed("The model is overloaded."));
        };
        using var chat = NewChat();

        chat.Draft = "Buy";
        chat.Send();
        await AgentHarness.Eventually(() => chat is { IsRunning: false, Messages.Count: 2 } && chat.Messages[1].HasNote, "the failure is shown");

        Assert.Equal("The model is overloaded.", chat.Messages[1].Note);
        Assert.True(Assert.Single(chat.Messages[1].ToolCalls).IsProblem);
        // The next message can be sent.
        chat.Draft = "Again";
        Assert.True(chat.SendCommand.CanExecute(null));
    }

    [Fact]
    public async Task Stop_ends_the_reply_and_keeps_what_was_written()
    {
        _agent.Run = async (_, recorder, cancellationToken) =>
        {
            recorder.Text("Thinking about it");
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return RunOutcome.Complete;
        };
        using var chat = NewChat();
        chat.Draft = "Go";
        chat.Send();
        await AgentHarness.Eventually(() => chat.Messages.Count == 2 && chat.Messages[1].Content.Length > 0, "the text arrived");
        Assert.True(chat.IsRunning);
        Assert.True(chat.StopCommand.CanExecute(null));
        chat.Draft = "more";
        // One reply at a time.
        Assert.False(chat.SendCommand.CanExecute(null));

        chat.Stop();
        await AgentHarness.Eventually(() => !chat.IsRunning, "the run stopped");

        Assert.Equal(("Thinking about it", "Stopped."), (chat.Messages[1].Content, chat.Messages[1].Note));
        Assert.False(chat.StopCommand.CanExecute(null));
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task A_question_of_the_agents_is_shown_with_its_options_and_the_answer_goes_back_to_the_run(bool byOption)
    {
        _agent.Run = async (context, recorder, cancellationToken) =>
        {
            var answer = await _agent.Questions.AskAsync(context.SessionId, "Which timeframe?", ["1H", "4H"], false, null, cancellationToken);
            recorder.Text($"You chose {answer}.");
            return RunOutcome.Complete;
        };
        using var chat = NewChat();
        chat.Draft = "Analyse BTC";
        chat.Send();
        await AgentHarness.Eventually(() => chat.HasQuestion, "the question is shown");
        Assert.Equal("Which timeframe?", chat.Question);
        Assert.Equal(["1H", "4H"], chat.QuestionOptions);

        if (byOption)
        {
            chat.ChooseOption("4H");
        }
        else
        {
            // While the agent waits, what is typed is the answer, also though a reply is being written.
            chat.Draft = "the daily one";
            Assert.True(chat.SendCommand.CanExecute(null));
            chat.Send();
        }

        await AgentHarness.Eventually(() => chat is { IsRunning: false, HasQuestion: false }, "the run ended");
        Assert.Equal(byOption ? "You chose 4H." : "You chose the daily one.", chat.Messages[^1].Content);
        Assert.Empty(chat.QuestionOptions);
    }

    [Fact]
    public async Task An_earlier_chat_is_shown_from_what_was_stored_and_can_be_deleted()
    {
        var old = _agent.Sessions.Create(title: "Yesterday");
        _agent.Messages.Append(old.Id, MessageRole.User, "What moved?");
        var reply = _agent.Messages.Append(old.Id, MessageRole.Assistant, "ETH rose 4 %.", MessageStatus.Complete, "fake-model");
        _agent.Messages.AddToolCall(reply.Id, "toolu_01", "get_ticker", "{}");
        _agent.Messages.FinishToolCall(reply.Id, "toolu_01", ToolCallStatus.Succeeded, """{"status":"filled"}""", "{}", 5);
        using var chat = NewChat();

        chat.SelectedSession = Assert.Single(chat.Sessions);

        Assert.Equal(["What moved?", "ETH rose 4 %."], chat.Messages.Select(message => message.Content));
        Assert.Equal("""{"status":"filled"}""", Assert.Single(chat.Messages[1].ToolCalls).Summary);
        Assert.False(chat.IsRunning);
        Assert.True(chat.DeleteChatCommand.CanExecute(null));

        chat.DeleteChat();

        Assert.Empty(chat.Sessions);
        Assert.Empty(chat.Messages);
        Assert.Null(_agent.Sessions.Get(old.Id));
        await Task.CompletedTask;
    }

    [Fact]
    public async Task What_happens_in_another_chat_marks_it_in_the_list_and_leaves_the_shown_one_alone()
    {
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _agent.Run = async (_, recorder, _) =>
        {
            recorder.Text("Working in the other chat.");
            await release.Task;
            return RunOutcome.Complete;
        };
        var other = _agent.Sessions.Create(title: "Other");
        var shown = _agent.Sessions.Create(title: "Shown");
        using var chat = NewChat();
        chat.SelectedSession = chat.Sessions.Single(session => session.Id == shown.Id);

        var running = _agent.Runner.RunAsync(other.Id, "go", TestContext.Current.CancellationToken);
        await AgentHarness.Eventually(() => chat.Sessions.Single(session => session.Id == other.Id).IsRunning, "the other chat is marked");

        Assert.Empty(chat.Messages);
        Assert.False(chat.IsRunning);
        // The chat that was written in last is on top.
        Assert.Equal(other.Id, chat.Sessions[0].Id);

        release.SetResult();
        await running;
        await AgentHarness.Eventually(() => !chat.Sessions.Single(session => session.Id == other.Id).IsRunning, "the mark is gone");
    }

    [Fact]
    public void New_chat_clears_the_screen_and_stores_nothing()
    {
        var old = _agent.Sessions.Create(title: "Yesterday");
        _agent.Messages.Append(old.Id, MessageRole.User, "Hello");
        using var chat = NewChat();
        chat.SelectedSession = chat.Sessions[0];

        chat.NewChat();

        Assert.Null(chat.SelectedSession);
        Assert.True(chat.IsEmpty);
        Assert.Single(_agent.Sessions.ListRecent(10));
    }

    private ChatViewModel NewChat() =>
        new(_agent.Sessions, _agent.Messages, _agent.Runner, _agent.Questions, _agent.Events, action => action());
}

public sealed class SettingsViewModelTests : IDisposable
{
    private readonly AgentHarness _agent = new();
    private readonly MemorySecrets _secrets = new();
    private readonly CountingLauncher _launcher = new();
    private readonly AtkService _kit;

    public SettingsViewModelTests()
    {
        _kit = new AtkService(
            _launcher,
            new NoGate(),
            () => null,
            _agent.Settings,
            new AppInfo("1.0.0", IsDevelopmentBuild: true),
            TimeProvider.System,
            NullLogger<AtkService>.Instance);
    }

    public void Dispose() => _agent.Dispose();

    [Fact]
    public void The_page_shows_what_is_saved_and_changes_nothing_by_opening()
    {
        _agent.Settings.SetValue(SettingKeys.AgentProvider, "openai");
        _agent.Settings.SetValue(SettingKeys.AgentEffort, "low");
        _agent.Settings.SetValue(SettingKeys.RiskMaxPositionSizePercent, 12.5);
        var changes = 0;
        _agent.Settings.Changed += (_, _) => changes++;

        var page = NewPage();

        Assert.Equal(("openai", "low", 12.5m), (page.Provider, page.Effort, page.MaxPositionPercent));
        Assert.True(page.IsOpenAi);
        Assert.False(page.UsesSubscription);
        Assert.False(page.IsLive);
        Assert.StartsWith("Demo trading", page.TradingMode, StringComparison.Ordinal);
        Assert.Equal(0, changes);
    }

    [Fact]
    public void A_change_of_the_model_settings_is_saved_at_once()
    {
        var page = NewPage();

        page.Provider = "anthropic";
        page.AuthMode = "api_key";
        page.Model = " opus ";
        page.Effort = "xhigh";

        Assert.Equal("api_key", _agent.Settings.GetValue(SettingKeys.AgentAuthMode));
        Assert.Equal("opus", _agent.Settings.GetValue(SettingKeys.AgentModel));
        Assert.Equal("xhigh", _agent.Settings.GetValue(SettingKeys.AgentEffort));
        Assert.True(page.UsesAnthropicKey);
    }

    [Fact]
    public void A_key_is_handed_to_the_store_and_never_shown_again()
    {
        var page = NewPage();
        Assert.Equal("Not saved", page.AnthropicKey.State);
        Assert.False(page.AnthropicKey.SaveCommand.CanExecute(null));
        Assert.False(page.AnthropicKey.RemoveCommand.CanExecute(null));

        page.AnthropicKey.Entry = "  test-key-for-the-store-wxyz  ";
        page.AnthropicKey.Save();

        Assert.Equal("test-key-for-the-store-wxyz", _secrets.Values[SecretNames.AnthropicApiKey]);
        Assert.Equal(string.Empty, page.AnthropicKey.Entry);
        Assert.Equal("Saved (ends in wxyz)", page.AnthropicKey.State);

        page.AnthropicKey.Remove();

        Assert.DoesNotContain(SecretNames.AnthropicApiKey, _secrets.Values.Keys);
        Assert.Equal("Not saved", page.AnthropicKey.State);
    }

    [Fact]
    public async Task Saving_an_okx_key_restarts_the_trade_kit_so_that_it_gets_the_key()
    {
        await _kit.StartAsync(TestContext.Current.CancellationToken);
        await AgentHarness.Eventually(() => _launcher.Launches == 1, "the kit was started");
        var page = NewPage();

        page.OkxPassphrase.Entry = "test-passphrase";
        page.OkxPassphrase.Save();

        await AgentHarness.Eventually(() => _launcher.Launches == 2, "the kit was started again");
        // A model key is not the kit's business.
        page.OpenAiKey.Entry = "test-key";
        page.OpenAiKey.Save();
        await Task.Delay(TimeSpan.FromMilliseconds(200), TestContext.Current.CancellationToken);
        Assert.Equal(2, _launcher.Launches);
        await _kit.StopAsync(TestContext.Current.CancellationToken);
    }

    [Fact]
    public void Live_trading_takes_two_steps_and_demo_takes_one()
    {
        var page = NewPage();

        page.AskForLive();

        // Asked, not done.
        Assert.True(page.ConfirmingLive);
        Assert.True(_agent.Settings.GetValue(SettingKeys.OkxSandbox));
        page.CancelLive();
        Assert.False(page.ConfirmingLive);
        Assert.True(_agent.Settings.GetValue(SettingKeys.OkxSandbox));

        page.AskForLive();
        page.SwitchToLive();

        Assert.False(_agent.Settings.GetValue(SettingKeys.OkxSandbox));
        Assert.True(page.IsLive);
        Assert.False(page.ConfirmingLive);
        Assert.Equal("LIVE trading: orders move real money.", page.TradingMode);

        page.SwitchToDemo();

        Assert.True(_agent.Settings.GetValue(SettingKeys.OkxSandbox));
        Assert.False(page.IsLive);
    }

    [Fact]
    public void Emergency_stop_is_saved_the_moment_it_is_switched()
    {
        var page = NewPage();

        page.EmergencyStop = true;

        Assert.True(_agent.Settings.GetValue(SettingKeys.EmergencyStopActive));
        Assert.True(NewPage().EmergencyStop);
    }

    [Fact]
    public void A_risk_limit_that_makes_no_sense_is_not_saved()
    {
        var page = NewPage();

        page.MaxPositionPercent = 8m;
        page.StopLossPercent = 1.5m;
        page.TakeProfitPercent = 4m;
        Assert.Equal(
            (8.0, 1.5, 4.0),
            (_agent.Settings.GetValue(SettingKeys.RiskMaxPositionSizePercent),
             _agent.Settings.GetValue(SettingKeys.RiskStopLossPercent),
             _agent.Settings.GetValue(SettingKeys.RiskTakeProfitPercent)));

        // An emptied box, zero, and more than everything: the last good value stays in force.
        page.MaxPositionPercent = null;
        page.MaxPositionPercent = 0m;
        page.MaxPositionPercent = 150m;

        Assert.Equal(8.0, _agent.Settings.GetValue(SettingKeys.RiskMaxPositionSizePercent));
    }

    [Fact]
    public void The_subscription_notice_is_shown_until_confirmed_and_notifications_can_be_switched()
    {
        var page = NewPage();
        Assert.True(page.UsesSubscription);
        Assert.True(page.NeedsSubscriptionConfirmation);

        page.ConfirmSubscription();
        page.TradeNotifications = false;

        Assert.True(_agent.Settings.GetValue(SettingKeys.AgentSubscriptionNoticeConfirmed));
        Assert.False(page.NeedsSubscriptionConfirmation);
        Assert.False(_agent.Settings.GetValue(SettingKeys.NotifyTradeExecutions));
    }

    private SettingsViewModel NewPage() => new(_agent.Settings, _secrets, _kit);

    private sealed class MemorySecrets : ISecretStore
    {
        public Dictionary<string, string> Values { get; } = new(StringComparer.Ordinal);

        public SecretState GetState(string name) =>
            Values.TryGetValue(name, out var value)
                ? new SecretState(SecretStatus.Saved, value.Length >= 12 ? value[^4..] : string.Empty)
                : SecretState.Unset;

        public string? Reveal(string name) => Values.GetValueOrDefault(name);

        public void Save(string name, string value) => Values[name] = value;

        public bool Remove(string name) => Values.Remove(name);
    }

    private sealed class CountingLauncher : IAtkLauncher
    {
        private int _launches;

        public int Launches => Volatile.Read(ref _launches);

        public Task<IMcpTransport> LaunchAsync(AtkLaunchOptions options, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref _launches);
            throw new AtkUnavailableException("The OKX trade kit is not installed.");
        }
    }

    private sealed class NoGate : IAtkGate
    {
        public ValueTask<GateDecision> CheckAsync(string toolName, System.Text.Json.JsonElement input, ToolContext context, CancellationToken cancellationToken) =>
            ValueTask.FromResult(GateDecision.Deny("No orders in this test."));
    }
}
