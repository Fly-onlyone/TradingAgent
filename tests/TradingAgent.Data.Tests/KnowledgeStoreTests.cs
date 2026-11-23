using TradingAgent.Core.Tasks;
using TradingAgent.Data.Knowledge;
using TradingAgent.Data.News;
using TradingAgent.Data.Tasks;
using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class KnowledgeStoreTests : IDisposable
{
    private readonly TempDatabase _temp = new();
    private readonly ManualTimeProvider _time = new(new DateTimeOffset(2026, 11, 23, 12, 0, 0, TimeSpan.Zero));

    public void Dispose() => _temp.Dispose();

    [Fact]
    public void A_memory_is_found_by_its_words_changed_and_forgotten()
    {
        var memories = new MemoryRepository(_temp.Database, _time);
        var kept = memories.Add("preference", "  The user never trades with more than 3x leverage.  ", ["leverage"]);
        memories.Add("nonsense-category", "The user watches SOL and ETH.");

        Assert.Equal("The user never trades with more than 3x leverage.", kept.Content);
        Assert.Equal(["general", "preference"], memories.List(null, 10).Select(memory => memory.Category).Order());
        Assert.Equal(kept.Id, Assert.Single(memories.Search("leverage", 10)).Id);
        Assert.Equal(["leverage"], memories.Get(kept.Id)!.Tags);

        Assert.True(memories.Update(kept.Id, "trading_context", "The user trades spot only."));

        Assert.Empty(memories.Search("leverage", 10));
        Assert.Equal("trading_context", Assert.Single(memories.Search("spot", 10)).Category);

        Assert.True(memories.Delete(kept.Id));
        Assert.Null(memories.Get(kept.Id));
        Assert.False(memories.Delete(kept.Id));
    }

    [Theory]
    [InlineData("\"unbalanced")]
    [InlineData("NEAR(a b)")]
    [InlineData("content:secret*")]
    [InlineData("a AND OR NOT")]
    [InlineData("-- ; DROP TABLE agent_memories")]
    [InlineData("!!!")]
    public void What_is_typed_is_searched_as_words_never_as_query_syntax(string query)
    {
        var memories = new MemoryRepository(_temp.Database, _time);
        memories.Add("general", "A plain sentence.");

        // No exception, whatever was typed.
        Assert.NotNull(memories.Search(query, 10));
        Assert.Single(memories.List(null, 10));
    }

    [Fact]
    public void A_memory_whose_time_is_up_is_not_shown_and_is_removed()
    {
        var memories = new MemoryRepository(_temp.Database, _time);
        memories.Add("market_observation", "BTC broke its range today.", expiresAt: _time.Now.AddHours(1).ToUnixTimeMilliseconds());
        memories.Add("general", "BTC is the user's main coin.");
        Assert.Equal(2, memories.Search("btc", 10).Count);

        _time.Now += TimeSpan.FromHours(2);

        Assert.Single(memories.Search("btc", 10));
        Assert.Single(memories.List(null, 10));
        Assert.Equal(1, memories.DeleteExpired());
    }

    [Fact]
    public void A_very_long_memory_is_cut_to_what_the_table_takes()
    {
        var memory = new MemoryRepository(_temp.Database, _time).Add("general", new string('x', 5000));

        Assert.Equal(MemoryRepository.MaxLength, memory.Content.Length);
    }

    [Fact]
    public void A_strategy_is_two_rows_written_and_removed_together()
    {
        var strategies = new StrategyRepository(_temp.Database, _time);

        var (saved, created) = strategies.Save(new StrategyDraft(
            " Breakout retest ",
            "Enter on the retest of a broken range high.",
            """["Close above the range high","Retest holds"]""",
            "stop under the retest low",
            null,
            ["4H"],
            ["BTC-USDT"],
            "https://example.com/breakout"));

        Assert.True(created);
        Assert.Equal("Breakout retest", saved.Name);
        // What a person typed is kept, wrapped so that the column holds JSON.
        Assert.Equal("""{"text":"stop under the retest low"}""", saved.ExitRulesJson);
        Assert.Equal("{}", saved.RiskParamsJson);
        Assert.Equal(["4H"], saved.Timeframes);
        Assert.Equal(["BTC-USDT"], saved.Symbols);
        Assert.Equal(1, _temp.Scalar<long>("SELECT count(*) FROM strategies WHERE knowledge_id = $id;", ("$id", saved.Id)));

        // The same name again, in other letters: not saved twice.
        var (again, createdAgain) = strategies.Save(new StrategyDraft("BREAKOUT RETEST", "Another text."));
        Assert.False(createdAgain);
        Assert.Equal(saved.Id, again.Id);
        Assert.Equal(1, strategies.Count());

        Assert.True(strategies.SetActive(saved.Id, true));
        Assert.True(strategies.Rate(saved.Id, 9, " Worked twice. "));
        var read = strategies.Get(saved.Id)!;
        Assert.Equal((true, 5.0, "Worked twice."), (read.IsActive, read.UserRating, read.RatingNotes));
        Assert.Equal(saved.Id, Assert.Single(strategies.List(10, activeOnly: true)).Id);

        Assert.True(strategies.Delete(saved.Id));
        Assert.Equal(0, _temp.Scalar<long>("SELECT count(*) FROM strategies;"));
        Assert.Equal(0, strategies.Count());
    }

    [Fact]
    public void Strategies_saved_in_a_discovery_session_are_marked_as_discovered()
    {
        var strategies = new StrategyRepository(_temp.Database, _time);
        _temp.Execute("INSERT INTO agent_sessions (id, session_kind, started_at) VALUES ('aaaaaaaaaaaaaaaaaaaaaaaa', 'task_run', 1);");
        var found = strategies.Save(new StrategyDraft("Found", "By discovery.", SourceSessionId: "aaaaaaaaaaaaaaaaaaaaaaaa")).Strategy;
        var own = strategies.Save(new StrategyDraft("Own", "By the user.")).Strategy;

        Assert.Equal(1, strategies.MarkDiscovered("aaaaaaaaaaaaaaaaaaaaaaaa"));

        Assert.True(strategies.Get(found.Id)!.AutoDiscovered);
        Assert.False(strategies.Get(own.Id)!.AutoDiscovered);
    }

    [Fact]
    public void An_article_is_stored_once_whatever_tracking_its_address_carries()
    {
        var news = new NewsRepository(_temp.Database, _time);
        Assert.True(news.AddSource("Example", "https://news.example.com/feed"));
        Assert.False(news.AddSource("Example again", "https://news.example.com/other-feed"));
        Assert.False(news.AddSource("Not the web", "file:///c:/feed.xml"));
        var source = Assert.Single(news.ListSources());

        Assert.True(news.Insert(source.Id, new NewArticle("https://news.example.com/a/?utm_source=x&id=7#top", "Bitcoin rises", "BTC is up.", 1000, ["BTC"])));
        Assert.False(news.Insert(source.Id, new NewArticle("https://news.example.com/a?id=7", "Bitcoin rises again", "Same article.", 2000, ["BTC"])));
        Assert.True(news.Insert(source.Id, new NewArticle("https://news.example.com/b", "Ether falls", "ETH is down.", 3000, ["ETH"])));

        Assert.Equal(["Ether falls", "Bitcoin rises"], news.Recent(10).Select(article => article.Title));
        var bitcoin = Assert.Single(news.Recent(10, "btc"));
        Assert.Equal(("https://news.example.com/a?id=7", "Example"), (bitcoin.Url, bitcoin.SourceName));
        Assert.Equal(["BTC"], bitcoin.Assets);
        Assert.Equal("Ether falls", Assert.Single(news.Search("ether", 10)).Title);

        news.MarkCrawled(source.Id, "The feed answered 500.");
        Assert.Equal("The feed answered 500.", news.ListSources()[0].LastError);

        Assert.True(news.DeleteSource(source.Id));
        Assert.Empty(news.Recent(10));
    }

    [Fact]
    public void The_default_sources_are_added_once_and_only_to_an_empty_list()
    {
        var news = new NewsRepository(_temp.Database, _time);

        Assert.Equal(NewsRepository.Defaults.Count, news.SeedDefaults());
        Assert.Equal(0, news.SeedDefaults());

        Assert.All(news.ListSources(), source => Assert.True(source.CrawlEnabled && source.RssUrl is not null));
        // A user who removed all but one does not get them back.
        foreach (var source in news.ListSources().Skip(1))
        {
            news.DeleteSource(source.Id);
        }

        Assert.Equal(0, news.SeedDefaults());
        Assert.Single(news.ListSources());
    }

    [Fact]
    public void A_task_is_due_when_its_time_comes_and_counts_its_runs()
    {
        var tasks = new AgentTaskRepository(_temp.Database, _time);
        var task = tasks.Create(new TaskDraft(" Morning review ", "Review BTC.", [TaskSchedule.Every(60)], ["BTC-USDT"]));

        Assert.Equal(("Morning review", AgentTask.Active, false, true), (task.Name, task.Status, task.TradingEnabled, task.AskFirst));
        Assert.Equal(_time.Now.AddMinutes(60).ToUnixTimeMilliseconds(), task.NextRunAt);
        Assert.Empty(tasks.Due());

        _time.Now += TimeSpan.FromMinutes(61);
        Assert.Equal(task.Id, Assert.Single(tasks.Due()).Id);

        tasks.RecordRun(task.Id, null, succeeded: true, null, _time.Now.AddMinutes(60));
        var after = tasks.Get(task.Id)!;
        Assert.Equal((1, 1, 0, AgentTask.Active), (after.RunCount, after.SuccessCount, after.FailureCount, after.Status));
        Assert.Equal(_time.Now.ToUnixTimeMilliseconds(), after.LastRunAt);
        Assert.Empty(tasks.Due());
    }

    [Fact]
    public void A_task_that_keeps_failing_stops_and_saving_it_starts_it_again()
    {
        var tasks = new AgentTaskRepository(_temp.Database, _time);
        var task = tasks.Create(new TaskDraft("Flaky", "Do it.", [TaskSchedule.Every(5)]));

        tasks.RecordRun(task.Id, null, succeeded: false, "No model.", _time.Now.AddMinutes(5));
        tasks.RecordRun(task.Id, null, succeeded: false, "No model.", _time.Now.AddMinutes(5));
        Assert.Equal(AgentTask.Active, tasks.Get(task.Id)!.Status);
        tasks.RecordRun(task.Id, null, succeeded: false, null, _time.Now.AddMinutes(5));

        var failed = tasks.Get(task.Id)!;
        Assert.Equal((AgentTask.Failed, 3, 3, "The run failed."), (failed.Status, failed.ConsecutiveFailures, failed.FailureCount, failed.LastError));
        _time.Now += TimeSpan.FromHours(1);
        Assert.Empty(tasks.Due());

        Assert.True(tasks.Update(task.Id, new TaskDraft("Flaky", "Do it better.", [TaskSchedule.Every(5)], TradingEnabled: true, AskFirst: false)));

        var revived = tasks.Get(task.Id)!;
        Assert.Equal((AgentTask.Active, 0, true, false, "Do it better."),
            (revived.Status, revived.ConsecutiveFailures, revived.TradingEnabled, revived.AskFirst, revived.Instructions));
    }

    [Fact]
    public void A_paused_task_does_not_run_and_a_task_without_a_schedule_runs_once()
    {
        var tasks = new AgentTaskRepository(_temp.Database, _time);
        var repeating = tasks.Create(new TaskDraft("Repeating", "Go.", [TaskSchedule.Every(5)]));
        var once = tasks.Create(new TaskDraft("Once", "Go.", []));

        Assert.Equal(once.Id, Assert.Single(tasks.Due()).Id);
        tasks.RecordRun(once.Id, null, succeeded: true, null, null);
        Assert.Equal(AgentTask.Completed, tasks.Get(once.Id)!.Status);

        Assert.True(tasks.SetPaused(repeating.Id, true));
        _time.Now += TimeSpan.FromHours(1);
        Assert.Empty(tasks.Due());
        Assert.True(tasks.SetPaused(repeating.Id, false));
        Assert.Equal(_time.Now.AddMinutes(5).ToUnixTimeMilliseconds(), tasks.Get(repeating.Id)!.NextRunAt);

        Assert.True(tasks.Delete(repeating.Id));
        Assert.Single(tasks.List());
    }

    [Fact]
    public void An_item_waits_for_an_embedding_until_one_is_stored_by_the_current_embedder()
    {
        var index = new KnowledgeIndex(_temp.Database, _time);
        var memories = new MemoryRepository(_temp.Database, _time);
        var memory = memories.Add("general", "The user likes range trading.");
        var kind = KnowledgeIndex.Find("agent_memory")!;

        var pending = Assert.Single(index.Pending(kind, "ollama:a", 10));
        Assert.Equal((memory.Id, "general\nThe user likes range trading."), (pending.Id, pending.Text));

        index.Store(kind, memory.Id, "ollama:a", pending.Text, [0.6f, 0.8f]);

        Assert.Empty(index.Pending(kind, "ollama:a", 10));
        Assert.Equal((1, 1), index.Counts(kind, "ollama:a"));
        var (id, vector) = Assert.Single(index.Vectors(kind, "ollama:a"));
        Assert.Equal(memory.Id, id);
        Assert.Equal([0.6f, 0.8f], vector);
        // Another model: its vectors cannot be compared with these, so the item waits again.
        Assert.Single(index.Pending(kind, "ollama:b", 10));
        Assert.Empty(index.Vectors(kind, "ollama:b"));

        // A changed text and a removed item both drop the vector.
        memories.Update(memory.Id, "general", "The user likes trend trading.");
        Assert.Single(index.Pending(kind, "ollama:a", 10));
        index.Store(kind, memory.Id, "ollama:a", "x", [1f, 0f]);
        memories.Delete(memory.Id);
        Assert.Equal(0, _temp.Scalar<long>("SELECT count(*) FROM vectors;"));
    }

    [Fact]
    public void Keyword_search_ranks_and_loads_the_items_of_a_kind()
    {
        var index = new KnowledgeIndex(_temp.Database, _time);
        var strategies = new StrategyRepository(_temp.Database, _time);
        var breakout = strategies.Save(new StrategyDraft("Breakout", "Buy the breakout of a range.")).Strategy;
        strategies.Save(new StrategyDraft("Mean reversion", "Sell the upper band."));
        var kind = KnowledgeIndex.Find("strategy_knowledge")!;

        var ids = index.Keyword(kind, "range breakout", 10);
        var hits = index.Load(kind, [.. ids.Select(id => (id, 1.0)), ("gone", 0.5)]);

        var hit = Assert.Single(hits);
        Assert.Equal((breakout.Id, "Strategy", "Breakout", "Buy the breakout of a range."), (hit.Id, hit.Label, hit.Title, hit.Body));
        Assert.Empty(index.Keyword(kind, "   ", 10));
    }
}
