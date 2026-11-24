using System.Collections.ObjectModel;
using System.Text;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Knowledge;

namespace TradingAgent.App.ViewModels;

/// <summary>
/// The Knowledge page: one search over strategies, trade lessons, patterns, news and memories, and
/// the choice of the embedding provider that lets the search find by meaning.
/// </summary>
internal sealed partial class KnowledgeViewModel : PageViewModel
{
    private readonly KnowledgeSearch _search;
    private readonly KnowledgeIndex _index;
    private readonly EmbedderResolver _embedders;
    private readonly EmbeddingIndexer _indexer;
    private readonly ISettingsStore _settings;
    private readonly Action<Action> _post;
    private readonly bool _loading;

    public KnowledgeViewModel(
        KnowledgeSearch search,
        KnowledgeIndex index,
        EmbedderResolver embedders,
        EmbeddingIndexer indexer,
        ISettingsStore settings,
        Action<Action>? post = null)
    {
        _search = search;
        _index = index;
        _embedders = embedders;
        _indexer = indexer;
        _settings = settings;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));

        _loading = true;
        Provider = EmbedderResolver.Providers.Contains(settings.GetValue(SettingKeys.EmbeddingProvider))
            ? settings.GetValue(SettingKeys.EmbeddingProvider)
            : EmbedderResolver.None;
        BaseUrl = settings.GetValue(SettingKeys.EmbeddingBaseUrl);
        Model = settings.GetValue(SettingKeys.EmbeddingModel);
        _loading = false;
        ShowStatus();
    }

    public override string Title => "Knowledge";

    public ObservableCollection<KnowledgeHit> Results { get; } = [];

    public IReadOnlyList<string> Providers { get; } = EmbedderResolver.Providers;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SearchCommand))]
    public partial string Query { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string ResultLine { get; set; } = string.Empty;

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(Hint))]
    public partial string Provider { get; set; } = EmbedderResolver.None;

    /// <summary>The provider's address; empty uses the provider's usual one.</summary>
    [ObservableProperty]
    public partial string BaseUrl { get; set; } = string.Empty;

    /// <summary>The embedding model; empty uses the provider's usual one.</summary>
    [ObservableProperty]
    public partial string Model { get; set; } = string.Empty;

    /// <summary>How much of each kind has an embedding, and what the last pass did.</summary>
    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    public string Hint => Provider switch
    {
        EmbedderResolver.None => "No provider: the search finds by words only.",
        EmbedderResolver.OpenAi => "Uses the OpenAI key saved in Settings. Default model: text-embedding-3-small. The texts are sent to OpenAI.",
        EmbedderResolver.Custom => "Any server that speaks the OpenAI embeddings API. Give its address and a model name.",
        _ => $"Runs on this computer. Default address {EmbedderResolver.DefaultsFor(Provider).BaseUrl}, default model {EmbedderResolver.DefaultsFor(Provider).Model}.",
    };

    public override void Activate() => ShowStatus();

    [RelayCommand(CanExecute = nameof(CanSearch))]
    public async Task SearchAsync()
    {
        var query = Query;
        var hits = await Task.Run(() => _search.SearchAsync(KnowledgeIndex.Kinds, query, 30, CancellationToken.None)).ConfigureAwait(false);
        _post(() =>
        {
            Results.Clear();
            foreach (var hit in hits)
            {
                Results.Add(hit);
            }

            ResultLine = hits.Count == 0 ? "Nothing found." : hits.Count == 1 ? "1 result" : $"{hits.Count} results";
        });
    }

    /// <summary>Embeds what has no embedding yet, now.</summary>
    [RelayCommand]
    public async Task IndexNowAsync()
    {
        Status = "Embedding…";
        await Task.Run(() => _indexer.RunOnceAsync(CancellationToken.None)).ConfigureAwait(false);
        _post(ShowStatus);
    }

    private bool CanSearch() => !string.IsNullOrWhiteSpace(Query);

    partial void OnProviderChanged(string value)
    {
        Store(SettingKeys.EmbeddingProvider, value);
        ShowStatus();
    }

    partial void OnBaseUrlChanged(string value) => Store(SettingKeys.EmbeddingBaseUrl, value.Trim());

    partial void OnModelChanged(string value)
    {
        Store(SettingKeys.EmbeddingModel, value.Trim());
        ShowStatus();
    }

    private void Store(SettingKey<string> key, string value)
    {
        if (!_loading)
        {
            _settings.SetValue(key, value);
            _indexer.Request();
        }
    }

    private void ShowStatus()
    {
        var embedder = _embedders.Resolve();
        var text = new StringBuilder();
        foreach (var kind in KnowledgeIndex.Kinds)
        {
            var (total, embedded) = _index.Counts(kind, embedder?.Name ?? string.Empty);
            text.AppendLine(embedder is null ? $"{kind.Label}: {total}" : $"{kind.Label}: {embedded} of {total} embedded");
        }

        text.Append(embedder is null && Provider != EmbedderResolver.None
            ? "The provider is not complete: check the address, the model and, for OpenAI, the key in Settings."
            : _indexer.LastResult);
        Status = text.ToString();
    }
}
