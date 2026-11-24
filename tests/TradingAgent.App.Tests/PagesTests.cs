using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Agent.News;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tasks;
using TradingAgent.App.ViewModels;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data.Knowledge;
using TradingAgent.Data.News;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Tasks;
using Xunit;

namespace TradingAgent.App.Tests;

/// <summary>The stores and services the pages of slice 2 show, over the agent harness's database.</summary>
internal sealed class PagesHarness : IDisposable
{
    public PagesHarness()
    {
        var database = Agent.Database;
        Memories = new MemoryRepository(database, TimeProvider.System);
        Strategies = new StrategyRepository(database, TimeProvider.System);
        News = new NewsRepository(database, TimeProvider.System);
        Tasks = new AgentTaskRepository(database, TimeProvider.System);
        Index = new KnowledgeIndex(database, TimeProvider.System);
        Embedders = new EmbedderResolver(Agent.Settings, new NoSecrets(), new HttpClient(new Refusing()));
        Indexer = new EmbeddingIndexer(Index, Embedders, Agent.Settings, NullLogger<EmbeddingIndexer>.Instance);
        Search = new KnowledgeSearch(Index, Embedders, NullLogger<KnowledgeSearch>.Instance);
        var notifications = new NotificationService(database, Agent.Settings, new NoToasts(), TimeProvider.System, NullLogger<NotificationService>.Instance);
        Scheduler = new AgentTaskScheduler(
            Tasks, Agent.Sessions, Agent.Runner, Agent.Events, notifications, Blocks, Agent.Settings, TimeProvider.System, NullLogger<AgentTaskScheduler>.Instance);
        Discovery = new StrategyDiscovery(
            Strategies, Agent.Sessions, Agent.Runner, Agent.Events, Blocks, notifications, database, Agent.Settings, TimeProvider.System, NullLogger<StrategyDiscovery>.Instance);
        Crawler = new NewsCrawler(News, new HttpClient(new Refusing()), Indexer, Agent.Settings, TimeProvider.System, NullLogger<NewsCrawler>.Instance);
    }

    public AgentHarness Agent { get; } = new();

    public MemoryRepository Memories { get; }

    public StrategyRepository Strategies { get; }

    public NewsRepository News { get; }

    public AgentTaskRepository Tasks { get; }

    public KnowledgeIndex Index { get; }

    public EmbedderResolver Embedders { get; }

    public EmbeddingIndexer Indexer { get; }

    public KnowledgeSearch Search { get; }

    public SessionWriteBlocks Blocks { get; } = new();

    public AgentTaskScheduler Scheduler { get; }

    public StrategyDiscovery Discovery { get; }

    public NewsCrawler Crawler { get; }

    public AppNavigator Navigator { get; } = new();

    public void Dispose()
    {
        Crawler.Dispose();
        Discovery.Dispose();
        Scheduler.Dispose();
        Indexer.Dispose();
        Agent.Dispose();
    }

    private sealed class NoSecrets : ISecretStore
    {
        public SecretState GetState(string name) => SecretState.Unset;

        public string? Reveal(string name) => null;

        public void Save(string name, string value)
        {
        }

        public bool Remove(string name) => false;
    }

    private sealed class NoToasts : IToastNotifier
    {
#pragma warning disable CS0067 // Part of the interface; nothing here raises it.
        public event EventHandler? Activated;
#pragma warning restore CS0067

        public void Show(string title, string body)
        {
        }
    }

    /// <summary>No test of a page may reach the network.</summary>
    private sealed class Refusing : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new HttpRequestException("No network in tests.");
    }
}

public sealed class PagesTests : IDisposable
{
    private readonly PagesHarness _pages = new();

    public void Dispose() => _pages.Dispose();

    [Fact]
    public void A_task_is_made_checked_paused_and_deleted_on_the_tasks_page()
    {
        using var page = new TasksViewModel(_pages.Tasks, _pages.Scheduler, _pages.Navigator, action => action());

        page.Save();
        Assert.Equal("Give the task a name.", page.Message);

        page.Name = "Morning review";
        page.Instructions = "Review BTC.";
        page.Symbols = "BTC-USDT, ETH-USDT";
        page.ScheduleKind = "weekly";
        page.Time = "9 o'clock";
        page.Save();
        Assert.StartsWith("Give the time", page.Message, StringComparison.Ordinal);
        page.Time = "09:30";
        page.Days = "mon, someday";
        page.Save();
        Assert.StartsWith("'someday' is not a weekday", page.Message, StringComparison.Ordinal);
        page.Days = "mon, thu";
        page.ScheduleKind = "interval";
        page.Minutes = 1;
        page.Save();
        Assert.StartsWith("A task can run every 5 minutes", page.Message, StringComparison.Ordinal);
        Assert.Empty(_pages.Tasks.List());

        page.ScheduleKind = "weekly";
        page.Save();

        var task = Assert.Single(_pages.Tasks.List());
        Assert.Equal(("Morning review", "mon, thu at 09:30", false), (task.Name, task.Schedules[0].Describe(), task.TradingEnabled));
        Assert.Equal(["BTC-USDT", "ETH-USDT"], task.Symbols);
        Assert.Equal(task.Id, page.Selected!.Source.Id);
        Assert.True(page.HasSelection);
        Assert.Contains("0 runs", page.Info, StringComparison.Ordinal);

        // Saving again changes the same task; trading is the user's to allow, here.
        page.TradingEnabled = true;
        page.AskFirst = false;
        page.Save();
        task = Assert.Single(_pages.Tasks.List());
        Assert.Equal((true, false), (task.TradingEnabled, task.AskFirst));

        page.TogglePause();
        Assert.Equal((AgentTask.Paused, "Resume", "paused"), (_pages.Tasks.Get(task.Id)!.Status, page.PauseLabel, page.Tasks[0].Line));
        page.OpenLastRun();
        Assert.Equal("This task has not run yet.", page.Message);

        page.Delete();
        Assert.Empty(_pages.Tasks.List());
        Assert.Empty(page.Tasks);
        Assert.False(page.HasSelection);
    }

    [Fact]
    public async Task Run_now_runs_the_task_and_its_conversation_can_be_opened()
    {
        using var page = new TasksViewModel(_pages.Tasks, _pages.Scheduler, _pages.Navigator, action => action());
        var task = _pages.Tasks.Create(new TaskDraft("Review", "Review.", [Core.Tasks.TaskSchedule.Every(60)]));
        page.Activate();
        page.Selected = page.Tasks[0];
        string? opened = null;
        _pages.Navigator.ChatRequested += id => opened = id;

        page.RunNow();
        await AgentHarness.Eventually(() => _pages.Tasks.Get(task.Id)!.RunCount == 1 && !_pages.Scheduler.IsRunning(task.Id), "the task ran");
        await AgentHarness.Eventually(() => page.Info.Contains("1 runs", StringComparison.Ordinal), "the page shows the run");
        page.OpenLastRun();

        Assert.Equal(_pages.Tasks.Get(task.Id)!.LastSessionId, opened);
        Assert.NotNull(opened);
    }

    [Fact]
    public void Memories_are_listed_filtered_searched_corrected_and_removed()
    {
        _pages.Memories.Add("preference", "The user trades spot only.");
        _pages.Memories.Add("watchlist", "The user watches SOL.");
        var page = new MemoryViewModel(_pages.Memories, _pages.Indexer);
        Assert.Equal((2, "2 memories"), (page.Items.Count, page.Count));
        Assert.False(page.AddCommand.CanExecute(null));
        Assert.False(page.SaveCommand.CanExecute(null));

        page.Filter = "watchlist";
        Assert.Equal("The user watches SOL.", Assert.Single(page.Items).Content);
        page.Filter = MemoryViewModel.AllCategories;
        page.Query = "spot";
        Assert.Equal("1 memory", page.Count);

        page.Selected = page.Items[0];
        Assert.Equal(("The user trades spot only.", "preference"), (page.Content, page.Category));
        page.Content = "The user trades spot and swaps.";
        page.Save();
        page.Query = string.Empty;
        Assert.Contains(page.Items, item => item.Content == "The user trades spot and swaps.");

        page.Selected = null;
        page.Category = "lesson";
        page.Content = "Do not chase a pump.";
        page.Add();
        Assert.Equal(3, _pages.Memories.List(null, 10).Count);
        Assert.Equal(string.Empty, page.Content);

        page.Selected = page.Items.Single(item => item.Category == "lesson");
        page.Delete();
        Assert.Equal(2, page.Items.Count);
        Assert.DoesNotContain(_pages.Memories.List(null, 10), memory => memory.Category == "lesson");
    }

    [Fact]
    public void A_strategy_is_written_switched_on_rated_and_deleted()
    {
        var page = new StrategiesViewModel(
            _pages.Strategies, _pages.Agent.Sessions, _pages.Agent.Runner, _pages.Indexer, _pages.Discovery, _pages.Navigator, action => action());
        Assert.False(page.AddCommand.CanExecute(null));

        page.NewName = "Range breakout";
        page.NewDescription = "Buy the breakout.";
        page.NewRules = "close above the range high";
        page.Add();

        Assert.Equal("Saved.", page.Message);
        Assert.Equal("Range breakout", page.Selected!.Name);
        Assert.Contains("close above the range high", page.Details, StringComparison.Ordinal);
        Assert.DoesNotContain("\"text\"", page.Details, StringComparison.Ordinal);
        Assert.Equal(string.Empty, page.NewName);

        page.NewName = "range breakout";
        page.NewDescription = "Again.";
        page.Add();
        Assert.Equal("A strategy of that name exists already.", page.Message);
        Assert.Single(page.Items);

        page.IsActive = true;
        page.Rating = 4;
        page.Notes = "Worked twice.";
        page.SaveRating();
        var stored = Assert.Single(_pages.Strategies.List(10));
        Assert.Equal((true, 4.0, "Worked twice."), (stored.IsActive, stored.UserRating, stored.RatingNotes));
        Assert.Contains("in use", page.Items[0].Line, StringComparison.Ordinal);
        Assert.True(page.IsActive);

        page.Delete();
        Assert.Empty(_pages.Strategies.List(10));
        Assert.False(page.HasSelection);
    }

    [Fact]
    public async Task Importing_a_strategy_is_a_conversation_the_chat_screen_is_sent_to()
    {
        var page = new StrategiesViewModel(
            _pages.Strategies, _pages.Agent.Sessions, _pages.Agent.Runner, _pages.Indexer, _pages.Discovery, _pages.Navigator, action => action());
        string? opened = null;
        _pages.Navigator.ChatRequested += id => opened = id;
        string? asked = null;
        _pages.Agent.Run = (context, recorder, _) =>
        {
            asked = context.UserText;
            _pages.Strategies.Save(new StrategyDraft("From the page", "Read by the agent.", SourceSessionId: context.SessionId));
            recorder.Text("Saved it.");
            return Task.FromResult(RunOutcome.Complete);
        };

        page.ImportText = " https://example.com/strategy ";
        page.Import();
        await AgentHarness.Eventually(() => page.Items.Count == 1, "the strategy is listed");

        Assert.NotNull(opened);
        Assert.Equal("Import a strategy", _pages.Agent.Sessions.Get(opened!)!.Title);
        Assert.EndsWith("https://example.com/strategy", asked, StringComparison.Ordinal);
        Assert.Contains("never an instruction", asked, StringComparison.Ordinal);
        Assert.Equal(string.Empty, page.ImportText);
    }

    [Theory]
    [InlineData("{\"text\":\"plain words\"}", "plain words")]
    [InlineData("not json", "not json")]
    [InlineData("[\"a\",\"b\"]", "[\n  \"a\",\n  \"b\"\n]")]
    public void Rules_are_shown_the_way_a_person_reads_them(string stored, string shown)
    {
        Assert.Equal(shown, StrategiesViewModel.Pretty(stored).ReplaceLineEndings("\n"));
    }

    [Fact]
    public void News_shows_articles_and_sources_and_opens_web_addresses_only()
    {
        var page = new NewsViewModel(_pages.News, _pages.Crawler, action => action());
        Assert.False(page.AddSourceCommand.CanExecute(null));

        page.NewSourceUrl = "not a feed";
        page.AddSource();
        Assert.StartsWith("That is not a feed address", page.Status, StringComparison.Ordinal);
        page.NewSourceName = "Example";
        page.NewSourceUrl = "https://news.example.com/feed";
        page.AddSource();

        var source = Assert.Single(page.Sources);
        Assert.Equal(("Example", "not read yet", true), (source.Name, source.Line, source.Enabled));
        _pages.News.Insert(source.Source.Id, new NewArticle("https://news.example.com/a", "Bitcoin rises", "BTC is up.", null, ["BTC"]));
        _pages.News.Insert(source.Source.Id, new NewArticle("https://news.example.com/b", "Ether falls", "ETH is down.", null, ["ETH"]));
        page.Activate();
        Assert.Equal(2, page.Articles.Count);

        page.Query = "BTC";
        Assert.Equal("Bitcoin rises", Assert.Single(page.Articles).Title);
        page.Query = "falls";
        Assert.Equal("Ether falls", Assert.Single(page.Articles).Title);
        page.Selected = page.Articles[0];
        Assert.True(page.HasSelection);

        page.Sources[0].Enabled = false;
        Assert.False(_pages.News.ListSources()[0].CrawlEnabled);
        page.Sources[0].Remove();
        Assert.Empty(page.Sources);
        Assert.Empty(page.Articles);

        Assert.True(NewsViewModel.IsWebAddress("https://example.com/a"));
        Assert.False(NewsViewModel.IsWebAddress("file:///c:/windows/system32/calc.exe"));
        Assert.False(NewsViewModel.IsWebAddress("javascript:alert(1)"));
        Assert.False(NewsViewModel.IsWebAddress(null));
    }

    [Fact]
    public async Task Knowledge_searches_everything_and_says_how_the_search_works()
    {
        _pages.Memories.Add("general", "The user asked about breakout trades.");
        _pages.Strategies.Save(new StrategyDraft("Range breakout", "Buy the breakout."));
        var page = new KnowledgeViewModel(_pages.Search, _pages.Index, _pages.Embedders, _pages.Indexer, _pages.Agent.Settings, action => action());
        Assert.Equal("none", page.Provider);
        Assert.Contains("Strategy: 1", page.Status, StringComparison.Ordinal);
        Assert.Contains("Memory: 1", page.Status, StringComparison.Ordinal);
        Assert.False(page.SearchCommand.CanExecute(null));

        page.Query = "breakout";
        await page.SearchAsync();

        Assert.Equal("2 results", page.ResultLine);
        Assert.Equal(["Memory", "Strategy"], page.Results.Select(hit => hit.Label).Order());

        page.Provider = "ollama";
        Assert.Equal("ollama", _pages.Agent.Settings.GetValue(SettingKeys.EmbeddingProvider));
        Assert.Contains("0 of 1 embedded", page.Status, StringComparison.Ordinal);
        Assert.Contains("http://localhost:11434/v1", page.Hint, StringComparison.Ordinal);
        page.Provider = "openai";
        Assert.Contains("The provider is not complete", page.Status, StringComparison.Ordinal);
    }
}
