using System.Collections.ObjectModel;
using System.Diagnostics;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.News;
using TradingAgent.Data.News;

namespace TradingAgent.App.ViewModels;

/// <summary>One article in the list.</summary>
internal sealed class NewsItemViewModel(NewsArticle article)
{
    public NewsArticle Source { get; } = article;

    public string Title => Source.Title;

    public string Line =>
        $"{Source.SourceName} · {Display.Time(Source.PublishedAt ?? Source.FetchedAt)}"
        + (Source.Assets.Count > 0 ? $" · {string.Join(' ', Source.Assets)}" : string.Empty);

    public string Summary => Source.Summary;
}

/// <summary>One news source, with its switch.</summary>
internal sealed partial class NewsSourceItemViewModel : ObservableObject
{
    private readonly NewsRepository _news;
    private readonly Action _changed;

    public NewsSourceItemViewModel(NewsSource source, NewsRepository news, Action changed)
    {
        Source = source;
        _news = news;
        _changed = changed;
        Enabled = source.CrawlEnabled;
    }

    public NewsSource Source { get; }

    public string Name => Source.Name;

    public string Line => Source.LastError ?? (Source.LastCrawled is { } read ? $"read {Display.Time(read)}" : "not read yet");

    public bool HasError => Source.LastError is not null;

    [ObservableProperty]
    public partial bool Enabled { get; set; }

    [RelayCommand]
    public void Remove()
    {
        _news.DeleteSource(Source.Id);
        _changed();
    }

    partial void OnEnabledChanged(bool value)
    {
        if (value != Source.CrawlEnabled)
        {
            _news.SetEnabled(Source.Id, value);
        }
    }
}

/// <summary>The News page: the articles the app collected, and the sources it collects them from.</summary>
internal sealed partial class NewsViewModel : PageViewModel
{
    private const int ListLimit = 200;

    private readonly NewsRepository _news;
    private readonly NewsCrawler _crawler;
    private readonly Action<Action> _post;

    public NewsViewModel(NewsRepository news, NewsCrawler crawler, Action<Action>? post = null)
    {
        _news = news;
        _crawler = crawler;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        // Lives as long as the app, like the crawler: nothing to unsubscribe.
        _crawler.Changed += (_, _) => _post(Reload);
        Reload();
    }

    public override string Title => "News";

    public ObservableCollection<NewsItemViewModel> Articles { get; } = [];

    public ObservableCollection<NewsSourceItemViewModel> Sources { get; } = [];

    /// <summary>Words to look for, or a ticker such as BTC. Empty lists the newest.</summary>
    [ObservableProperty]
    public partial string Query { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(HasSelection))]
    public partial NewsItemViewModel? Selected { get; set; }

    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string NewSourceName { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(AddSourceCommand))]
    public partial string NewSourceUrl { get; set; } = string.Empty;

    public bool HasSelection => Selected is not null;

    /// <summary>True for a web address a browser may be sent to. Addresses come from feeds, so nothing else is opened.</summary>
    internal static bool IsWebAddress(string? url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.Scheme is "http" or "https";

    public override void Activate() => Reload();

    /// <summary>Reads every enabled source now.</summary>
    [RelayCommand]
    public async Task RefreshAsync()
    {
        Status = "Reading the sources…";
        var added = await Task.Run(() => _crawler.RunOnceAsync(force: true, CancellationToken.None)).ConfigureAwait(false);
        _post(() =>
        {
            Reload();
            Status = added == 1 ? "1 new article." : $"{added} new articles.";
        });
    }

    /// <summary>Opens the chosen article in the browser.</summary>
    [RelayCommand]
    public void Open()
    {
        if (Selected is { } item && IsWebAddress(item.Source.Url))
        {
            using var process = Process.Start(new ProcessStartInfo(item.Source.Url) { UseShellExecute = true });
        }
    }

    [RelayCommand(CanExecute = nameof(CanAddSource))]
    public void AddSource()
    {
        if (_news.AddSource(NewSourceName, NewSourceUrl))
        {
            NewSourceName = string.Empty;
            NewSourceUrl = string.Empty;
            Status = "Source added. It is read on the next refresh.";
        }
        else
        {
            Status = "That is not a feed address, or the site is listed already.";
        }

        Reload();
    }

    private bool CanAddSource() => !string.IsNullOrWhiteSpace(NewSourceUrl);

    partial void OnQueryChanged(string value) => Reload();

    private void Reload()
    {
        var query = Query.Trim();
        // A short word in capitals is a ticker; anything else is searched as words.
        var articles = query.Length == 0 ? _news.Recent(ListLimit)
            : query.Length <= 5 && query.All(char.IsAsciiLetterUpper) ? _news.Recent(ListLimit, query)
            : _news.Search(query, ListLimit);
        var keep = Selected?.Source.Id;
        Articles.Clear();
        foreach (var article in articles)
        {
            Articles.Add(new NewsItemViewModel(article));
        }

        if (keep is not null)
        {
            Selected = Articles.FirstOrDefault(item => item.Source.Id == keep);
        }

        Sources.Clear();
        foreach (var source in _news.ListSources())
        {
            Sources.Add(new NewsSourceItemViewModel(source, _news, Reload));
        }
    }
}
