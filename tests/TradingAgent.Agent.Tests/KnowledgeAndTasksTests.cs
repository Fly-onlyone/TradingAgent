using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Agent.News;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tasks;
using TradingAgent.Agent.Tools;
using TradingAgent.Agent.Web;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Core.Tasks;
using TradingAgent.Data;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Knowledge;
using TradingAgent.Data.News;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Tasks;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Risk;
using Xunit;

namespace TradingAgent.Agent.Tests;

/// <summary>Everything slice 2 stands on, over one temporary database, with a runtime a test scripts.</summary>
internal sealed class KnowledgeHarness : IDisposable
{
    private readonly TempDatabase _temp = new();

    public KnowledgeHarness()
    {
        Settings = new SqliteSettingsStore(Database, Clock, NullLogger<SqliteSettingsStore>.Instance);
        Sessions = new AgentSessionRepository(Database, Clock);
        Messages = new SessionMessageRepository(Database, Clock);
        Memories = new MemoryRepository(Database, Clock);
        Strategies = new StrategyRepository(Database, Clock);
        News = new NewsRepository(Database, Clock);
        Tasks = new AgentTaskRepository(Database, Clock);
        Index = new KnowledgeIndex(Database, Clock);
        Embedders = new EmbedderResolver(Settings, Secrets, new HttpClient(Embedding));
        Indexer = new EmbeddingIndexer(Index, Embedders, Settings, NullLogger<EmbeddingIndexer>.Instance);
        Search = new KnowledgeSearch(Index, Embedders, NullLogger<KnowledgeSearch>.Instance);
        Notifications = new NotificationService(Database, Settings, new SilentToasts(), Clock, NullLogger<NotificationService>.Instance);
        Runner = new AgentRunner(Sessions, Messages, Events, new Resolver(this), NullLogger<AgentRunner>.Instance);
    }

    public Database Database => _temp.Database;

    public TestClock Clock { get; } = new(new DateTimeOffset(2026, 11, 23, 12, 0, 0, TimeSpan.Zero));

    public SqliteSettingsStore Settings { get; }

    public MemorySecrets Secrets { get; } = new();

    public AgentSessionRepository Sessions { get; }

    public SessionMessageRepository Messages { get; }

    public AgentEventHub Events { get; } = new();

    public MemoryRepository Memories { get; }

    public StrategyRepository Strategies { get; }

    public NewsRepository News { get; }

    public AgentTaskRepository Tasks { get; }

    public KnowledgeIndex Index { get; }

    public EmbeddingStub Embedding { get; } = new();

    public EmbedderResolver Embedders { get; }

    public EmbeddingIndexer Indexer { get; }

    public KnowledgeSearch Search { get; }

    public NotificationService Notifications { get; }

    public SessionWriteBlocks Blocks { get; } = new();

    public AgentRunner Runner { get; }

    /// <summary>What the model does with a run. The default writes one sentence.</summary>
    public Func<RunContext, RunRecorder, CancellationToken, Task<RunOutcome>> Run { get; set; } = (_, recorder, _) =>
    {
        recorder.Text("All quiet.");
        return Task.FromResult(RunOutcome.Complete);
    };

    public static JsonElement Json(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    public ToolContext NewContext() => new(Sessions.Create().Id, "message", "toolu_1");

    public long Count(string sql) => Database.Number(sql);

    public void Dispose()
    {
        Indexer.Dispose();
        _temp.Dispose();
    }

    private sealed class Resolver(KnowledgeHarness harness) : IAgentRuntimeResolver
    {
        public ResolvedRuntime Resolve() => new(new Runtime(harness), AgentWire.Anthropic, AgentWire.ApiKey);
    }

    private sealed class Runtime(KnowledgeHarness harness) : IAgentRuntime
    {
        public string Model => "scripted";

        public Task<RunOutcome> ExecuteAsync(RunContext context, RunRecorder recorder, CancellationToken cancellationToken) =>
            harness.Run(context, recorder, cancellationToken);
    }

    private sealed class SilentToasts : IToastNotifier
    {
#pragma warning disable CS0067 // Part of the interface; nothing here raises it.
        public event EventHandler? Activated;
#pragma warning restore CS0067

        public void Show(string title, string body)
        {
        }
    }
}

internal sealed class TestClock(DateTimeOffset now) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = now;

    public override DateTimeOffset GetUtcNow() => Now;
}

internal sealed class MemorySecrets : ISecretStore
{
    public Dictionary<string, string> Values { get; } = new(StringComparer.Ordinal);

    public SecretState GetState(string name) => Values.ContainsKey(name) ? new SecretState(SecretStatus.Saved, string.Empty) : SecretState.Unset;

    public string? Reveal(string name) => Values.GetValueOrDefault(name);

    public void Save(string name, string value) => Values[name] = value;

    public bool Remove(string name) => Values.Remove(name);
}

/// <summary>
/// An embedding server for tests. A text about leverage or risk points one way, every other text the
/// other way, so that "means the same" can be tested without a model.
/// </summary>
internal sealed class EmbeddingStub : HttpMessageHandler
{
    public List<(Uri Url, string? Authorization, string Model, int Texts)> Requests { get; } = [];

    public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(cancellationToken));
        var texts = body.RootElement.GetProperty("input").EnumerateArray().Select(item => item.GetString()!).ToList();
        Requests.Add((request.RequestUri!, request.Headers.Authorization?.ToString(), body.RootElement.GetProperty("model").GetString()!, texts.Count));
        if (Status != HttpStatusCode.OK)
        {
            return new HttpResponseMessage(Status) { Content = new StringContent("{}") };
        }

        // Not of length one, and given last first, to prove the client normalizes and reads "index".
        var items = texts
            .Select((text, index) => (text.Contains("leverage", StringComparison.OrdinalIgnoreCase) || text.Contains("risk", StringComparison.OrdinalIgnoreCase)
                ? $$"""{"index":{{index}},"embedding":[3,0]}"""
                : $$"""{"index":{{index}},"embedding":[0,2]}"""))
            .Reverse();
        return new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent("{\"data\":[" + string.Join(',', items) + "]}", Encoding.UTF8, "application/json"),
        };
    }
}

public sealed class EmbeddingTests : IDisposable
{
    private readonly KnowledgeHarness _harness = new();

    public void Dispose() => _harness.Dispose();

    [Fact]
    public void No_provider_is_used_until_one_is_chosen_and_complete()
    {
        Assert.Null(_harness.Embedders.Resolve());

        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.Ollama);
        Assert.Equal("ollama:nomic-embed-text", _harness.Embedders.Resolve()!.Name);

        _harness.Settings.SetValue(SettingKeys.EmbeddingModel, "bge-m3");
        Assert.Equal("ollama:bge-m3", _harness.Embedders.Resolve()!.Name);

        // OpenAI without a key, and a custom server without an address, are not complete.
        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.OpenAi);
        Assert.Null(_harness.Embedders.Resolve());
        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.Custom);
        Assert.Null(_harness.Embedders.Resolve());
        _harness.Settings.SetValue(SettingKeys.EmbeddingBaseUrl, "file:///c:/embeddings");
        Assert.Null(_harness.Embedders.Resolve());
    }

    [Fact]
    public async Task The_openai_key_goes_to_openai_and_to_no_address_the_user_typed()
    {
        _harness.Secrets.Save(SecretNames.OpenAiApiKey, "test-openai-key");
        _harness.Settings.SetValue(SettingKeys.EmbeddingBaseUrl, "http://elsewhere.example/v1");

        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.Custom);
        _harness.Settings.SetValue(SettingKeys.EmbeddingModel, "some-model");
        await _harness.Embedders.Resolve()!.EmbedAsync(["a"], TestContext.Current.CancellationToken);
        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.OpenAi);
        _harness.Settings.SetValue(SettingKeys.EmbeddingModel, string.Empty);
        await _harness.Embedders.Resolve()!.EmbedAsync(["a"], TestContext.Current.CancellationToken);

        Assert.Equal(("http://elsewhere.example/v1/embeddings", null, "some-model"),
            (_harness.Embedding.Requests[0].Url.ToString(), _harness.Embedding.Requests[0].Authorization, _harness.Embedding.Requests[0].Model));
        // The typed address is not used for OpenAI: the key would go where the user pointed.
        Assert.Equal(("https://api.openai.com/v1/embeddings", "Bearer test-openai-key", "text-embedding-3-small"),
            (_harness.Embedding.Requests[1].Url.ToString(), _harness.Embedding.Requests[1].Authorization, _harness.Embedding.Requests[1].Model));
    }

    [Fact]
    public async Task Vectors_come_back_in_the_order_of_the_texts_and_of_length_one()
    {
        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.LmStudio);

        var vectors = await _harness.Embedders.Resolve()!.EmbedAsync(["low leverage", "solana"], TestContext.Current.CancellationToken);

        Assert.Equal([1f, 0f], vectors[0]);
        Assert.Equal([0f, 1f], vectors[1]);
        Assert.Equal("http://localhost:1234/v1/embeddings", _harness.Embedding.Requests[0].Url.ToString());
    }

    [Fact]
    public async Task A_provider_that_fails_is_reported_in_words_and_the_search_falls_back_to_words()
    {
        _harness.Memories.Add("general", "The user prefers low leverage.");
        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.Ollama);
        _harness.Embedding.Status = HttpStatusCode.InternalServerError;

        var embedded = await _harness.Indexer.RunOnceAsync(TestContext.Current.CancellationToken);
        var hits = await _harness.Search.SearchAsync(KnowledgeIndex.Kinds, "leverage", 5, TestContext.Current.CancellationToken);

        Assert.Equal(0, embedded);
        Assert.Contains("500", _harness.Indexer.LastResult, StringComparison.Ordinal);
        Assert.Equal("The user prefers low leverage.", Assert.Single(hits).Body);
    }

    [Fact]
    public async Task With_embeddings_the_search_finds_what_means_the_same_in_other_words()
    {
        _harness.Memories.Add("preference", "The user prefers low leverage.");
        _harness.Memories.Add("watchlist", "Solana ecosystem notes.");
        var memory = KnowledgeIndex.Find("agent_memory")!;

        // Without a provider: no shared word, nothing found.
        Assert.Empty(await _harness.Search.SearchAsync([memory], "appetite for risk", 5, TestContext.Current.CancellationToken));
        Assert.Equal(0, await _harness.Indexer.RunOnceAsync(TestContext.Current.CancellationToken));

        _harness.Settings.SetValue(SettingKeys.EmbeddingProvider, EmbedderResolver.Ollama);
        Assert.Equal(2, await _harness.Indexer.RunOnceAsync(TestContext.Current.CancellationToken));
        // Nothing waits any more: a second pass asks the provider for nothing.
        var requests = _harness.Embedding.Requests.Count;
        Assert.Equal(0, await _harness.Indexer.RunOnceAsync(TestContext.Current.CancellationToken));
        Assert.Equal(requests, _harness.Embedding.Requests.Count);

        var hits = await _harness.Search.SearchAsync([memory], "appetite for risk", 5, TestContext.Current.CancellationToken);

        Assert.Equal("The user prefers low leverage.", Assert.Single(hits).Body);
    }
}

public sealed class KnowledgeToolsTests : IDisposable
{
    private readonly KnowledgeHarness _harness = new();

    public void Dispose() => _harness.Dispose();

    [Fact]
    public async Task A_memory_is_saved_found_and_forgotten_through_the_tools()
    {
        var context = _harness.NewContext();
        var save = new SaveMemoryTool(_harness.Memories, _harness.Indexer);
        var search = new SearchMemoryTool(_harness.Memories, _harness.Search);

        var saved = await save.InvokeAsync(KnowledgeHarness.Json("""{"content":"The user trades spot only.","category":"preference","tags":"spot, rules"}"""), context, TestContext.Current.CancellationToken);
        var missing = await save.InvokeAsync(KnowledgeHarness.Json("""{"category":"preference"}"""), context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Succeeded, saved.Status);
        Assert.Equal(ToolCallStatus.Failed, missing.Status);
        var memory = Assert.Single(_harness.Memories.List(null, 10));
        Assert.Equal(("preference", "The user trades spot only."), (memory.Category, memory.Content));
        Assert.Equal(["spot", "rules"], memory.Tags);

        var found = await search.InvokeAsync(KnowledgeHarness.Json("""{"query":"spot"}"""), context, TestContext.Current.CancellationToken);
        var listed = await search.InvokeAsync(KnowledgeHarness.Json("""{"limit":"5"}"""), context, TestContext.Current.CancellationToken);
        Assert.Contains("The user trades spot only.", found.Content, StringComparison.Ordinal);
        Assert.Contains($"\"id\":\"{memory.Id}\"", listed.Content, StringComparison.Ordinal);

        var delete = new DeleteMemoryTool(_harness.Memories);
        Assert.Equal(ToolCallStatus.Succeeded, (await delete.InvokeAsync(KnowledgeHarness.Json($$"""{"id":"{{memory.Id}}"}"""), context, TestContext.Current.CancellationToken)).Status);
        Assert.Equal(ToolCallStatus.Failed, (await delete.InvokeAsync(KnowledgeHarness.Json($$"""{"id":"{{memory.Id}}"}"""), context, TestContext.Current.CancellationToken)).Status);
    }

    [Fact]
    public async Task A_strategy_is_saved_once_and_search_knowledge_finds_it_among_everything()
    {
        var context = _harness.NewContext();
        var save = new SaveStrategyTool(_harness.Strategies, _harness.Indexer);
        const string Arguments = """
            {"name":"Range breakout","description":"Buy when price closes above the range high.",
             "entry_rules":["close above range high","volume above average"],"exit_rules":{"stop":"range mid"},
             "timeframes":["4H"],"symbols":["BTC-USDT"],"source_url":"https://example.com/s"}
            """;

        var first = await save.InvokeAsync(KnowledgeHarness.Json(Arguments), context, TestContext.Current.CancellationToken);
        var second = await save.InvokeAsync(KnowledgeHarness.Json(Arguments), context, TestContext.Current.CancellationToken);

        Assert.Contains("\"created\":true", first.Content, StringComparison.Ordinal);
        Assert.Contains("\"created\":false", second.Content, StringComparison.Ordinal);
        var strategy = Assert.Single(_harness.Strategies.List(10));
        Assert.Equal("""["close above range high","volume above average"]""", strategy.EntryRulesJson);
        Assert.Equal("""{"stop":"range mid"}""", strategy.ExitRulesJson);
        Assert.Equal("https://example.com/s", strategy.SourceUrl);

        _harness.Memories.Add("general", "The user asked about breakout trades.");
        var search = new SearchKnowledgeTool(_harness.Search);
        var everywhere = await search.InvokeAsync(KnowledgeHarness.Json("""{"query":"breakout"}"""), context, TestContext.Current.CancellationToken);
        var strategiesOnly = await search.InvokeAsync(KnowledgeHarness.Json("""{"query":"breakout","kinds":["strategy"]}"""), context, TestContext.Current.CancellationToken);
        var nowhere = await search.InvokeAsync(KnowledgeHarness.Json("""{"query":"breakout","kinds":["orders"]}"""), context, TestContext.Current.CancellationToken);

        Assert.Contains("\"count\":2", everywhere.Content, StringComparison.Ordinal);
        Assert.Contains("\"count\":1", strategiesOnly.Content, StringComparison.Ordinal);
        Assert.Contains("\"kind\":\"strategy\"", strategiesOnly.Content, StringComparison.Ordinal);
        Assert.Equal(ToolCallStatus.Failed, nowhere.Status);

        var list = await new ListStrategiesTool(_harness.Strategies).InvokeAsync(KnowledgeHarness.Json("""{"active_only":true}"""), context, TestContext.Current.CancellationToken);
        Assert.Contains("\"count\":0", list.Content, StringComparison.Ordinal);
    }

    [Fact]
    public async Task A_task_made_by_the_agent_cannot_trade_and_cannot_run_every_minute()
    {
        var context = _harness.NewContext();
        var create = new CreateTaskTool(_harness.Tasks);

        var made = await create.InvokeAsync(
            KnowledgeHarness.Json("""{"name":"Morning review","instructions":"Review BTC and report.","schedule":{"kind":"daily","time":"09:00"},"symbols":["BTC-USDT"],"trading_enabled":true}"""),
            context,
            TestContext.Current.CancellationToken);
        var tooOften = await create.InvokeAsync(
            KnowledgeHarness.Json("""{"name":"Spam","instructions":"x","schedule":{"kind":"interval","minutes":1}}"""), context, TestContext.Current.CancellationToken);
        var noSchedule = await create.InvokeAsync(
            KnowledgeHarness.Json("""{"name":"Spam","instructions":"x","schedule":"every day"}"""), context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Succeeded, made.Status);
        Assert.Equal((ToolCallStatus.Failed, ToolCallStatus.Failed), (tooOften.Status, noSchedule.Status));
        var task = Assert.Single(_harness.Tasks.List());
        // Whatever the model sent: only the user allows a task to trade.
        Assert.False(task.TradingEnabled);
        Assert.Equal("every day at 09:00", Assert.Single(task.Schedules).Describe());

        var listed = await new ListTasksTool(_harness.Tasks).InvokeAsync(KnowledgeHarness.Json("{}"), context, TestContext.Current.CancellationToken);
        Assert.Contains("\"may_trade\":false", listed.Content, StringComparison.Ordinal);
        var paused = await new PauseTaskTool(_harness.Tasks).InvokeAsync(KnowledgeHarness.Json($$"""{"id":"{{task.Id}}","paused":true}"""), context, TestContext.Current.CancellationToken);
        Assert.Equal(ToolCallStatus.Succeeded, paused.Status);
        Assert.Equal(AgentTask.Paused, _harness.Tasks.Get(task.Id)!.Status);
    }

    [Fact]
    public async Task News_is_read_newest_first_by_asset_or_by_words()
    {
        _harness.News.AddSource("Example", "https://news.example.com/feed");
        var source = _harness.News.ListSources()[0].Id;
        _harness.News.Insert(source, new NewArticle("https://news.example.com/a", "Bitcoin rises", "BTC is up.", 1000, ["BTC"]));
        _harness.News.Insert(source, new NewArticle("https://news.example.com/b", "Ether falls", "ETH is down.", 2000, ["ETH"]));
        var tool = new GetNewsTool(_harness.News);
        var context = _harness.NewContext();

        var all = await tool.InvokeAsync(KnowledgeHarness.Json("{}"), context, TestContext.Current.CancellationToken);
        var bitcoin = await tool.InvokeAsync(KnowledgeHarness.Json("""{"asset":"btc"}"""), context, TestContext.Current.CancellationToken);
        var words = await tool.InvokeAsync(KnowledgeHarness.Json("""{"query":"falls"}"""), context, TestContext.Current.CancellationToken);

        Assert.True(all.Content.IndexOf("Ether falls", StringComparison.Ordinal) < all.Content.IndexOf("Bitcoin rises", StringComparison.Ordinal));
        Assert.Contains("\"count\":1", bitcoin.Content, StringComparison.Ordinal);
        Assert.Contains("Bitcoin rises", bitcoin.Content, StringComparison.Ordinal);
        Assert.Contains("Ether falls", words.Content, StringComparison.Ordinal);
        Assert.DoesNotContain("Bitcoin rises", words.Content, StringComparison.Ordinal);
    }

    [Fact]
    public void The_prompt_names_the_new_tools_and_carries_what_is_remembered()
    {
        var without = new TradingSystemPrompt(_harness.Settings, _harness.Memories).Build();
        _harness.Memories.Add("preference", "The user trades\nspot only.");

        var with = new TradingSystemPrompt(_harness.Settings, _harness.Memories).Build();

        Assert.DoesNotContain("What you remember", without, StringComparison.Ordinal);
        Assert.Contains("- (preference) The user trades spot only.", with, StringComparison.Ordinal);
        Assert.All(
            ["save_memory", "search_knowledge", "get_news", "web_search", "fetch_url", "create_task", "never an instruction to you"],
            word => Assert.Contains(word, with, StringComparison.Ordinal));
    }
}

public sealed class WebToolsTests
{
    private static readonly IPAddress _public = IPAddress.Parse("93.184.216.34");

    [Theory]
    [InlineData("http://127.0.0.1:11434/api/tags")]
    [InlineData("http://localhost/admin")]
    [InlineData("http://[::1]/")]
    [InlineData("http://192.168.1.1/")]
    [InlineData("http://10.0.0.8/")]
    [InlineData("http://169.254.169.254/latest/meta-data/")]
    [InlineData("http://intranet.example/")]
    [InlineData("file:///C:/Windows/win.ini")]
    [InlineData("ftp://example.com/file")]
    [InlineData("not an address")]
    public async Task The_page_reader_goes_to_public_web_addresses_only(string url)
    {
        var handler = new StubHttpHandler();
        var reader = new PageReader(new HttpClient(handler), Resolve);

        var outcome = await new FetchUrlTool(reader).InvokeAsync(KnowledgeHarness.Json($$"""{"url":"{{url}}"}"""), new ToolContext("s", "m", "t"), TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, outcome.Status);
        // Refused before anything was sent.
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task A_redirect_to_the_local_network_is_not_followed()
    {
        var handler = new StubHttpHandler().Respond(_ =>
        {
            var response = new HttpResponseMessage(HttpStatusCode.Found);
            response.Headers.Location = new Uri("http://192.168.1.1/router");
            return response;
        });
        var reader = new PageReader(new HttpClient(handler), Resolve);

        var error = await Assert.ThrowsAsync<WebAccessException>(() => reader.ReadAsync("https://public.example/article", TestContext.Current.CancellationToken));

        Assert.Contains("local network", error.Message, StringComparison.Ordinal);
        Assert.Single(handler.Requests);
    }

    [Fact]
    public async Task A_page_is_read_as_the_text_a_person_sees()
    {
        const string Html = """
            <html><head><title>T</title><style>p { color: red }</style></head>
            <body><script>steal()</script><nav>Menu</nav><h1>Breakout &amp; retest</h1><p>Buy the <b>retest</b>.</p><!-- hidden --></body></html>
            """;
        var handler = new StubHttpHandler()
            .Respond(_ =>
            {
                var response = new HttpResponseMessage(HttpStatusCode.MovedPermanently);
                response.Headers.Location = new Uri("/final", UriKind.Relative);
                return response;
            })
            .Respond(HttpStatusCode.OK, Html, "text/html");
        var reader = new PageReader(new HttpClient(handler), Resolve);

        var text = await reader.ReadAsync("https://public.example/article", TestContext.Current.CancellationToken);

        Assert.Equal("Breakout & retest\n\nBuy the retest .", text);
        Assert.Equal("https://public.example/final", handler.Requests[1].Request.RequestUri!.ToString());
    }

    [Fact]
    public async Task Something_that_is_not_text_is_not_read()
    {
        var handler = new StubHttpHandler().Respond(HttpStatusCode.OK, "binary", "application/octet-stream");
        var reader = new PageReader(new HttpClient(handler), Resolve);

        await Assert.ThrowsAsync<WebAccessException>(() => reader.ReadAsync("https://public.example/file.zip", TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task Web_search_needs_the_users_key_and_sends_it_to_brave_only()
    {
        string? key = null;
        var handler = new StubHttpHandler().Respond(
            HttpStatusCode.OK,
            """{"web":{"results":[{"title":"Funding rates","url":"https://example.com/f","description":"What <strong>funding</strong> is.","age":"2 days ago"},{"title":"No address"}]}}""",
            "application/json");
        var tool = new WebSearchTool(new BraveSearchClient(new HttpClient(handler), () => key));
        var context = new ToolContext("s", "m", "t");

        var without = await tool.InvokeAsync(KnowledgeHarness.Json("""{"query":"funding rates"}"""), context, TestContext.Current.CancellationToken);
        key = "test-brave-key";
        var with = await tool.InvokeAsync(KnowledgeHarness.Json("""{"query":"funding rates & more","count":50}"""), context, TestContext.Current.CancellationToken);

        Assert.Equal(ToolCallStatus.Failed, without.Status);
        Assert.Contains("Settings", without.Content, StringComparison.Ordinal);
        var request = Assert.Single(handler.Requests).Request;
        Assert.Equal("https://api.search.brave.com/res/v1/web/search?q=funding%20rates%20%26%20more&count=20", request.RequestUri!.AbsoluteUri);
        Assert.Equal("test-brave-key", Assert.Single(request.Headers.GetValues("X-Subscription-Token")));
        Assert.Contains("\"count\":1", with.Content, StringComparison.Ordinal);
        Assert.Contains("What funding is.", with.Content, StringComparison.Ordinal);
    }

    private static Task<IPAddress[]> Resolve(string host, CancellationToken cancellationToken) =>
        Task.FromResult<IPAddress[]>(host switch
        {
            "localhost" => [IPAddress.Loopback],
            // A public name that points inward: the name is not what counts.
            "intranet.example" => [_public, IPAddress.Parse("10.1.2.3")],
            _ => [_public],
        });
}

public sealed class NewsCrawlerTests : IDisposable
{
    private const string Rss = """
        <?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
          <channel>
            <title>Example</title>
            <item>
              <title>Bitcoin &amp; Ethereum rally</title>
              <link>https://news.example.com/rally?utm_source=rss</link>
              <description><![CDATA[<p>BTC and <b>ETH</b> rose&nbsp;today.</p>]]></description>
              <pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate>
            </item>
            <item><title>No link</title></item>
            <item><title>Not the web</title><link>javascript:alert(1)</link></item>
          </channel>
        </rss>
        """;

    private const string Atom = """
        <feed xmlns="http://www.w3.org/2005/Atom">
          <entry>
            <title>Solana upgrade ships</title>
            <link rel="self" href="https://news.example.com/self"/>
            <link rel="alternate" href="https://news.example.com/solana"/>
            <summary>The Solana network was upgraded.</summary>
            <updated>2026-11-23T09:30:00Z</updated>
          </entry>
        </feed>
        """;

    private readonly KnowledgeHarness _harness = new();

    public void Dispose() => _harness.Dispose();

    [Fact]
    public void Rss_and_atom_are_read_and_entries_without_a_web_address_are_left_out()
    {
        var rss = Assert.Single(FeedParser.Parse(Rss));
        var atom = Assert.Single(FeedParser.Parse(Atom));

        Assert.Equal(("Bitcoin & Ethereum rally", "BTC and ETH rose today."), (rss.Title, rss.Summary));
        Assert.Equal(new DateTimeOffset(2026, 11, 23, 10, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), rss.PublishedAt);
        Assert.Equal(["BTC", "ETH"], rss.Assets);
        Assert.Equal(("Solana upgrade ships", "https://news.example.com/solana"), (atom.Title, atom.Url));
        Assert.Equal(["SOL"], atom.Assets);
    }

    [Theory]
    [InlineData("Ethereum and ether both count", "ETH")]
    [InlineData("A method called together is not ether", "ETH")]
    [InlineData("The solution was linked", "")]
    [InlineData("Tether (USDT) depegs", "USDT")]
    public void A_coin_is_found_as_a_whole_word_only(string text, string expected)
    {
        Assert.Equal(expected, string.Join(',', AssetTagger.Find(text)));
    }

    [Fact]
    public async Task A_pass_stores_what_is_new_and_notes_what_went_wrong()
    {
        _harness.News.AddSource("Example", "https://news.example.com/feed");
        var handler = new StubHttpHandler()
            .Respond(HttpStatusCode.OK, Rss, "application/rss+xml")
            .Respond(HttpStatusCode.OK, Rss, "application/rss+xml")
            .Respond(HttpStatusCode.InternalServerError, "down", "text/plain")
            .Respond(HttpStatusCode.OK, "<html>not a feed", "text/html");
        using var crawler = new NewsCrawler(_harness.News, new HttpClient(handler), _harness.Indexer, _harness.Settings, _harness.Clock, NullLogger<NewsCrawler>.Instance);

        Assert.Equal(1, await crawler.RunOnceAsync(force: true, TestContext.Current.CancellationToken));
        // Not due again for an hour, unless forced.
        Assert.Equal(0, await crawler.RunOnceAsync(force: false, TestContext.Current.CancellationToken));
        Assert.Single(handler.Requests);
        Assert.Equal(0, await crawler.RunOnceAsync(force: true, TestContext.Current.CancellationToken));
        Assert.Null(_harness.News.ListSources()[0].LastError);

        Assert.Equal(0, await crawler.RunOnceAsync(force: true, TestContext.Current.CancellationToken));
        Assert.Equal("The feed answered 500.", _harness.News.ListSources()[0].LastError);
        Assert.Equal(0, await crawler.RunOnceAsync(force: true, TestContext.Current.CancellationToken));
        Assert.Equal("The feed is not valid XML.", _harness.News.ListSources()[0].LastError);

        Assert.Equal("https://news.example.com/rally", Assert.Single(_harness.News.Recent(10)).Url);
        Assert.Equal(_harness.Clock.Now.ToUnixTimeMilliseconds(), _harness.Settings.GetValue(SettingKeys.NewsCrawlLastRunAt));
    }

    [Fact]
    public async Task Old_articles_are_removed_and_a_switched_off_source_is_not_read()
    {
        _harness.News.AddSource("Example", "https://news.example.com/feed");
        var source = _harness.News.ListSources()[0];
        _harness.News.Insert(source.Id, new NewArticle("https://news.example.com/old", "Old", "Old.", null, []));
        _harness.News.SetEnabled(source.Id, false);
        var handler = new StubHttpHandler();
        using var crawler = new NewsCrawler(_harness.News, new HttpClient(handler), _harness.Indexer, _harness.Settings, _harness.Clock, NullLogger<NewsCrawler>.Instance);

        _harness.Clock.Now += NewsCrawler.Retention + TimeSpan.FromDays(1);
        await crawler.RunOnceAsync(force: true, TestContext.Current.CancellationToken);

        Assert.Empty(handler.Requests);
        Assert.Empty(_harness.News.Recent(10));
    }
}

public sealed class TaskSchedulerTests : IDisposable
{
    private readonly KnowledgeHarness _harness = new();
    private readonly AgentTaskScheduler _scheduler;

    public TaskSchedulerTests()
    {
        _scheduler = new AgentTaskScheduler(
            _harness.Tasks,
            _harness.Sessions,
            _harness.Runner,
            _harness.Events,
            _harness.Notifications,
            _harness.Blocks,
            _harness.Settings,
            _harness.Clock,
            NullLogger<AgentTaskScheduler>.Instance);
    }

    public void Dispose()
    {
        _scheduler.Dispose();
        _harness.Dispose();
    }

    [Fact]
    public async Task A_due_task_runs_in_a_session_of_its_own_and_cannot_trade_unless_allowed()
    {
        var task = _harness.Tasks.Create(new TaskDraft("Morning review", "Review BTC and report.", [TaskSchedule.Every(60)], ["BTC-USDT"]));
        string? blockedDuringRun = null;
        var runningDuringRun = false;
        _harness.Run = (context, recorder, _) =>
        {
            blockedDuringRun = _harness.Blocks.ReasonFor(context.SessionId);
            runningDuringRun = _scheduler.IsRunning(task.Id);
            recorder.Text("BTC is calm. Nothing to do.");
            return Task.FromResult(RunOutcome.Complete);
        };
        var changes = 0;
        _scheduler.TasksChanged += (_, _) => changes++;

        Assert.Equal(0, await _scheduler.RunDueAsync(TestContext.Current.CancellationToken));
        _harness.Clock.Now += TimeSpan.FromMinutes(61);
        Assert.Equal(1, await _scheduler.RunDueAsync(TestContext.Current.CancellationToken));

        var after = _harness.Tasks.Get(task.Id)!;
        Assert.Equal((1, 1, 0), (after.RunCount, after.SuccessCount, after.FailureCount));
        Assert.Equal(_harness.Clock.Now.AddMinutes(60).ToUnixTimeMilliseconds(), after.NextRunAt);
        var session = _harness.Sessions.Get(after.LastSessionId!)!;
        Assert.Equal((SessionKind.TaskRun, "Task: Morning review"), (session.Kind, session.Title));
        var prompt = _harness.Messages.GetWindow(session.Id, 10)[0].Content;
        Assert.Contains("Review BTC and report.", prompt, StringComparison.Ordinal);
        Assert.Contains("BTC-USDT", prompt, StringComparison.Ordinal);
        Assert.Contains("This task may not trade.", prompt, StringComparison.Ordinal);

        Assert.Contains("not allowed to trade", blockedDuringRun, StringComparison.Ordinal);
        Assert.True(runningDuringRun);
        // The block and the running mark end with the run.
        Assert.Null(_harness.Blocks.ReasonFor(session.Id));
        Assert.False(_scheduler.IsRunning(task.Id));
        Assert.True(changes >= 2);
        Assert.Equal(1, _harness.Count($"SELECT count(*) FROM notifications WHERE notification_type = 'task_completed' AND session_id = '{session.Id}' AND body LIKE 'BTC is calm%';"));
    }

    [Fact]
    public async Task A_task_the_user_allowed_to_trade_is_not_blocked_and_is_told_to_ask_first()
    {
        var task = _harness.Tasks.Create(new TaskDraft("Rebalance", "Rebalance.", [], TradingEnabled: true));
        var blocked = "unset";
        _harness.Run = (context, _, _) =>
        {
            blocked = _harness.Blocks.ReasonFor(context.SessionId);
            return Task.FromResult(RunOutcome.Complete);
        };

        Assert.True(await _scheduler.RunNowAsync(task.Id, TestContext.Current.CancellationToken));

        Assert.Null(blocked);
        var prompt = _harness.Messages.GetWindow(_harness.Tasks.Get(task.Id)!.LastSessionId!, 10)[0].Content;
        Assert.Contains("ask the user with ask_user", prompt, StringComparison.Ordinal);
        // No schedule: it ran once and is done.
        Assert.Equal(AgentTask.Completed, _harness.Tasks.Get(task.Id)!.Status);
        Assert.False(await _scheduler.RunNowAsync("000000000000000000000000", TestContext.Current.CancellationToken));
    }

    [Fact]
    public async Task While_the_emergency_stop_is_on_a_trading_task_waits_and_a_reading_task_runs()
    {
        var trading = _harness.Tasks.Create(new TaskDraft("Trader", "Trade.", [], TradingEnabled: true));
        var reading = _harness.Tasks.Create(new TaskDraft("Reader", "Read.", []));
        _harness.Settings.SetValue(SettingKeys.EmergencyStopActive, true);

        Assert.Equal(1, await _scheduler.RunDueAsync(TestContext.Current.CancellationToken));

        var waited = _harness.Tasks.Get(trading.Id)!;
        Assert.Equal((0, AgentTask.Active, null), (waited.RunCount, waited.Status, waited.LastSessionId));
        Assert.True(waited.NextRunAt > _harness.Clock.Now.ToUnixTimeMilliseconds());
        Assert.Equal(1, _harness.Tasks.Get(reading.Id)!.RunCount);
    }

    [Fact]
    public async Task A_failed_run_is_counted_and_told()
    {
        var task = _harness.Tasks.Create(new TaskDraft("Flaky", "Go.", [TaskSchedule.Every(5)]));
        _harness.Run = (_, _, _) => Task.FromResult(RunOutcome.Failed("The model is overloaded."));

        await _scheduler.RunNowAsync(task.Id, TestContext.Current.CancellationToken);

        var after = _harness.Tasks.Get(task.Id)!;
        Assert.Equal((1, 0, 1, "The model is overloaded."), (after.RunCount, after.SuccessCount, after.FailureCount, after.LastError));
        Assert.Equal(1, _harness.Count("SELECT count(*) FROM notifications WHERE notification_type = 'task_failed' AND body = 'The model is overloaded.';"));
    }

    [Fact]
    public async Task The_risk_gate_refuses_every_write_of_a_blocked_session()
    {
        var exchange = new FakeExchange();
        var gate = new RiskGate(
            exchange,
            new RiskManager(exchange, _harness.Settings),
            _harness.Settings,
            new OrderStubRepository(_harness.Database, _harness.Clock),
            _harness.Clock,
            NullLogger<RiskGate>.Instance,
            _harness.Blocks);
        var blocked = _harness.NewContext();
        var free = _harness.NewContext();
        _harness.Blocks.Block(blocked.SessionId, "This task is not allowed to trade.");
        var cancel = KnowledgeHarness.Json("""{"instId":"BTC-USDT","ordId":"1"}""");

        // A cancel is the one write every other rule lets through.
        var refused = await gate.CheckAsync("spot_cancel_order", cancel, blocked, TestContext.Current.CancellationToken);
        var allowed = await gate.CheckAsync("spot_cancel_order", cancel, free, TestContext.Current.CancellationToken);

        Assert.Equal((false, "This task is not allowed to trade."), (refused.Allowed, refused.Reason));
        Assert.True(allowed.Allowed);
    }

    [Fact]
    public async Task Discovery_marks_what_it_saved_records_the_cycle_and_cannot_trade()
    {
        using var discovery = new StrategyDiscovery(
            _harness.Strategies,
            _harness.Sessions,
            _harness.Runner,
            _harness.Events,
            _harness.Blocks,
            _harness.Notifications,
            _harness.Database,
            _harness.Settings,
            _harness.Clock,
            NullLogger<StrategyDiscovery>.Instance);
        _harness.Strategies.Save(new StrategyDraft("Mine", "Written by the user."));
        string? blockedDuringRun = null;
        _harness.Run = (context, _, _) =>
        {
            blockedDuringRun = _harness.Blocks.ReasonFor(context.SessionId);
            _harness.Strategies.Save(new StrategyDraft("Found", "Found on the web.", SourceUrl: "https://example.com/s", SourceSessionId: context.SessionId));
            return Task.FromResult(RunOutcome.Complete);
        };
        Assert.False(discovery.IsDue());

        var saved = await discovery.RunAsync(manual: true, TestContext.Current.CancellationToken);

        Assert.Equal(1, saved);
        Assert.NotNull(blockedDuringRun);
        Assert.Equal([("Found", true), ("Mine", false)], _harness.Strategies.List(10).Select(strategy => (strategy.Name, strategy.AutoDiscovered)).Order());
        Assert.Equal(1, _harness.Count("SELECT count(*) FROM strategy_discovery_cycles WHERE status = 'ok' AND strategies_saved = 1 AND manual = 1 AND ended_at IS NOT NULL;"));
        Assert.Equal(1, _harness.Count("SELECT count(*) FROM notifications WHERE title = '1 new strategy found';"));

        // On a schedule: only when switched on, and only after the interval.
        _harness.Settings.SetValue(SettingKeys.AutoDiscoverEnabled, true);
        Assert.False(discovery.IsDue());
        _harness.Clock.Now += TimeSpan.FromHours(_harness.Settings.GetValue(SettingKeys.AutoDiscoverIntervalHours) + 1);
        Assert.True(discovery.IsDue());
    }
}
