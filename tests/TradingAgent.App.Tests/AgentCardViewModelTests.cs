using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Cli;
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

public sealed class AgentCardViewModelTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
    private readonly Database _database;
    private readonly SqliteSettingsStore _settings;
    private readonly FakeSecrets _secrets = new();
    private readonly FakeCliLauncher _cliLauncher = new();
    private readonly FakeKitLauncher _kitLauncher = new();
    private readonly FakeRuntime _runtime = new();
    private readonly AgentSessionRepository _sessions;
    private readonly AtkService _kit;
    private string? _cliPath = @"C:\fake\claude.exe";

    public AgentCardViewModelTests()
    {
        Directory.CreateDirectory(_root);
        _database = new Database(Path.Combine(_root, "test.db"));
        _database.Initialize();
        _settings = new SqliteSettingsStore(_database, TimeProvider.System, NullLogger<SqliteSettingsStore>.Instance);
        _sessions = new AgentSessionRepository(_database, TimeProvider.System);
        _kit = new AtkService(
            _kitLauncher,
            new RefusingGate(),
            () => null,
            _settings,
            new AppInfo("1.0.0", IsDevelopmentBuild: true),
            TimeProvider.System,
            NullLogger<AtkService>.Instance);
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

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

    // ---- which model, and can it answer ----

    [Theory]
    [InlineData("anthropic", SecretNames.AnthropicApiKey, "Anthropic, with an API key")]
    [InlineData("openai", SecretNames.OpenAiApiKey, "OpenAI, with an API key")]
    public void With_an_api_key_mode_the_card_says_whether_a_key_is_saved_and_never_the_key(string provider, string secret, string expected)
    {
        _settings.SetValue(SettingKeys.AgentProvider, provider);
        _settings.SetValue(SettingKeys.AgentAuthMode, "api_key");
        _secrets.States[secret] = new SecretState(SecretStatus.Saved, "wxyz");

        var card = NewCard();

        Assert.Equal(expected, card.Provider);
        Assert.Equal("An API key is saved (ends in wxyz).", card.SignIn);
        Assert.Equal(string.Empty, card.Notice);
        Assert.False(card.NeedsConfirmation);
        Assert.Equal(0, _secrets.Reveals);
    }

    [Theory]
    [InlineData(SecretStatus.Unset, "No API key is saved.")]
    [InlineData(SecretStatus.Unreadable, "The saved API key cannot be read. Save it again.")]
    public void A_missing_or_unreadable_key_is_said_plainly(SecretStatus status, string expected)
    {
        _settings.SetValue(SettingKeys.AgentAuthMode, "api_key");
        _secrets.States[SecretNames.AnthropicApiKey] = new SecretState(status, string.Empty);

        Assert.Equal(expected, NewCard().SignIn);
    }

    [Fact]
    public void With_the_subscription_mode_the_card_shows_the_notice_and_starts_nothing_by_itself()
    {
        var card = NewCard();

        Assert.Equal("Anthropic, with a Claude subscription (Claude Code runs the model)", card.Provider);
        Assert.Equal(ClaudeCli.SubscriptionNotice, card.Notice);
        Assert.True(card.NeedsConfirmation);
        Assert.Equal("Held back until you confirm the notice below.", card.SignIn);
        // Opening the page must not start a program.
        Assert.Empty(_cliLauncher.Starts);
    }

    [Fact]
    public void Confirming_the_notice_is_remembered_and_lets_the_subscription_run()
    {
        var card = NewCard();

        card.ConfirmNotice();

        Assert.True(_settings.GetValue(SettingKeys.AgentSubscriptionNoticeConfirmed));
        Assert.False(card.NeedsConfirmation);
        Assert.StartsWith("Not asked yet.", card.SignIn, StringComparison.Ordinal);
        // Remembered: the next start of the app does not ask again.
        Assert.False(NewCard().NeedsConfirmation);
        // Still shown: the notice stays readable for as long as the mode is chosen.
        Assert.Equal(ClaudeCli.SubscriptionNotice, card.Notice);
    }

    [Theory]
    [InlineData("installed on this computer runs the model, signed in with your own Claude subscription")]
    [InlineData("never sees, stores or passes on your sign-in")]
    [InlineData("you sign in yourself by running 'claude auth login'")]
    [InlineData("only with your own subscription, for your own use")]
    [InlineData("does not allow an app to route requests through another person's plan")]
    [InlineData("needs Anthropic's Commercial Terms")]
    [InlineData("https://code.claude.com/docs/en/legal-and-compliance")]
    public void The_notice_says_what_the_terms_page_says(string sentence)
    {
        Assert.Contains(sentence, ClaudeCli.SubscriptionNotice, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Asked_to_check_the_card_reports_what_claude_code_says()
    {
        var card = NewCard();

        await card.RefreshAsync();

        Assert.Equal("Claude Code is signed in (claude.ai).", card.SignIn);
        Assert.Equal(["auth", "status"], Assert.Single(_cliLauncher.Starts));
        // The account in the answer is not shown.
        Assert.DoesNotContain("someone@example.com", card.SignIn, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(false, """{"loggedIn":true}""", "not installed")]
    [InlineData(true, """{"loggedIn":false}""", "claude auth login")]
    public async Task A_missing_or_signed_out_claude_code_is_a_state_with_what_to_do(bool installed, string status, string expected)
    {
        _cliPath = installed ? _cliPath : null;
        _cliLauncher.StatusOutput = status;
        var card = NewCard();

        await card.RefreshAsync();

        Assert.Contains(expected, card.SignIn, StringComparison.Ordinal);
    }

    [Fact]
    public void Changing_the_sign_in_mode_changes_the_card()
    {
        var card = NewCard();

        _settings.SetValue(SettingKeys.AgentAuthMode, "api_key");

        Assert.Equal("Anthropic, with an API key", card.Provider);
        Assert.Equal("No API key is saved.", card.SignIn);
        Assert.Equal(string.Empty, card.Notice);
    }

    // ---- the trade kit ----

    [Fact]
    public async Task The_trade_kits_state_is_shown_and_follows_it()
    {
        var card = NewCard();
        Assert.Equal("Not running.", card.TradeKit);

        var unavailable = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _kit.StatusChanged += (_, _) =>
        {
            if (_kit.Status.State == AtkState.Unavailable)
            {
                unavailable.TrySetResult();
            }
        };
        await _kit.StartAsync(Ct);
        await unavailable.Task.WaitAsync(TimeSpan.FromSeconds(10), Ct);

        Assert.Equal("The OKX trade kit is not installed. Install it with: npm install -g x", card.TradeKit);
        await _kit.StopAsync(Ct);
        Assert.Equal("Not running.", card.TradeKit);
    }

    // ---- the test prompt ----

    [Fact]
    public async Task The_test_prompt_goes_through_the_real_run_and_shows_the_tool_call_the_answer_and_the_cost()
    {
        var card = NewCard();

        await card.RunTestPromptAsync(Ct);

        Assert.Equal(AgentCardViewModel.TestPrompt, _runtime.Asked);
        Assert.Equal("BTC-USDT is at 97,000.", card.TestAnswer);
        Assert.Equal("→ get_ticker {\"symbol\":\"BTC-USDT\"}\n← get_ticker: succeeded (12 ms)", card.TestEvents);
        Assert.StartsWith("Answered by fake-model in ", card.TestStatus, StringComparison.Ordinal);
        Assert.EndsWith("120 tokens in, 30 out, 1 tool call(s).", card.TestStatus, StringComparison.Ordinal);
        // A test leaves nothing in the list of chats.
        Assert.Empty(_sessions.ListRecent(10));
    }

    [Fact]
    public async Task A_test_that_fails_shows_the_reason_and_leaves_no_session()
    {
        _runtime.Outcome = RunOutcome.Failed("Claude Code is not signed in. Run 'claude auth login'.");
        var card = NewCard();

        await card.RunTestPromptAsync(Ct);

        Assert.Equal("Claude Code is not signed in. Run 'claude auth login'.", card.TestStatus);
        Assert.Empty(_sessions.ListRecent(10));
    }

    [Fact]
    public async Task A_second_test_starts_from_an_empty_card()
    {
        var card = NewCard();
        await card.RunTestPromptAsync(Ct);
        _runtime.Outcome = RunOutcome.Failed("No answer.");
        _runtime.Silent = true;

        await card.RunTestPromptAsync(Ct);

        Assert.Equal((string.Empty, string.Empty, "No answer."), (card.TestAnswer, card.TestEvents, card.TestStatus));
    }

    [Fact]
    public void The_test_prompt_asks_for_a_price_and_for_no_order()
    {
        Assert.Contains("price of BTC-USDT", AgentCardViewModel.TestPrompt, StringComparison.Ordinal);
        Assert.Contains("Do not place any order", AgentCardViewModel.TestPrompt, StringComparison.Ordinal);
    }

    private AgentCardViewModel NewCard()
    {
        var messages = new SessionMessageRepository(_database, TimeProvider.System);
        var events = new AgentEventHub();
        var runner = new AgentRunner(
            _sessions,
            messages,
            events,
            new FixedResolver(new ResolvedRuntime(_runtime, AgentWire.Anthropic, AgentWire.Subscription)),
            NullLogger<AgentRunner>.Instance);
        var cli = new ClaudeCli(_cliLauncher, _root, TimeProvider.System, NullLogger<ClaudeCli>.Instance) { Locate = () => _cliPath };
        // Posted actions run at once: there is no screen thread in this test.
        return new AgentCardViewModel(_settings, _secrets, cli, _kit, runner, _sessions, events, action => action());
    }

    private sealed class FakeSecrets : ISecretStore
    {
        public Dictionary<string, SecretState> States { get; } = new(StringComparer.Ordinal);

        public int Reveals { get; private set; }

        public SecretState GetState(string name) => States.GetValueOrDefault(name, SecretState.Unset);

        public string? Reveal(string name)
        {
            Reveals++;
            return null;
        }

        public void Save(string name, string value) => throw new NotSupportedException();

        public bool Remove(string name) => throw new NotSupportedException();
    }

    /// <summary>Answers the sign-in question the way Claude Code does, account included.</summary>
    private sealed class FakeCliLauncher : ICliProcessLauncher
    {
        public string StatusOutput { get; set; } = """{"loggedIn":true,"authMethod":"claude.ai","email":"someone@example.com"}""";

        public List<IReadOnlyList<string>> Starts { get; } = [];

        public ICliProcess Start(string fileName, IReadOnlyList<string> arguments, string workingDirectory)
        {
            Starts.Add(arguments);
            return new OneLineProcess(StatusOutput);
        }

        private sealed class OneLineProcess(string line) : ICliProcess
        {
            private bool _read;

            public string ErrorTail => string.Empty;

            public Task WriteLineAsync(string line, CancellationToken cancellationToken) => Task.CompletedTask;

            public void CloseInput()
            {
            }

            public Task<string?> ReadLineAsync(CancellationToken cancellationToken)
            {
                var next = _read ? null : line;
                _read = true;
                return Task.FromResult(next);
            }

            public Task<int> WaitForExitAsync(CancellationToken cancellationToken) => Task.FromResult(0);

            public void Kill()
            {
            }

            public ValueTask DisposeAsync() => ValueTask.CompletedTask;
        }
    }

    private sealed class FakeKitLauncher : IAtkLauncher
    {
        public Task<IMcpTransport> LaunchAsync(AtkLaunchOptions options, CancellationToken cancellationToken) =>
            throw new AtkUnavailableException("The OKX trade kit is not installed. Install it with: npm install -g x");
    }

    private sealed class RefusingGate : IAtkGate
    {
        public ValueTask<GateDecision> CheckAsync(string toolName, System.Text.Json.JsonElement input, ToolContext context, CancellationToken cancellationToken) =>
            ValueTask.FromResult(GateDecision.Deny("No orders in this test."));
    }

    private sealed class FixedResolver(ResolvedRuntime resolved) : IAgentRuntimeResolver
    {
        public ResolvedRuntime Resolve() => resolved;
    }

    /// <summary>A runtime that looks up a price with one tool call and answers.</summary>
    private sealed class FakeRuntime : IAgentRuntime
    {
        public string Model => "fake-model";

        public string? Asked { get; private set; }

        public RunOutcome Outcome { get; set; } = RunOutcome.Complete;

        /// <summary>True to end without a word or a tool call.</summary>
        public bool Silent { get; set; }

        public Task<RunOutcome> ExecuteAsync(RunContext context, RunRecorder recorder, CancellationToken cancellationToken)
        {
            Asked = context.UserText;
            if (!Silent && Outcome.Status == MessageStatus.Complete)
            {
                recorder.StartTool(new ToolRequest("toolu_01", "get_ticker", """{"symbol":"BTC-USDT"}"""));
                recorder.FinishTool("toolu_01", new ToolOutcome("97000"), durationMs: 12);
                recorder.Text("BTC-USDT is ");
                recorder.Text("at 97,000.");
                recorder.AddUsage(120, 30, Model);
            }

            return Task.FromResult(Outcome);
        }
    }
}
