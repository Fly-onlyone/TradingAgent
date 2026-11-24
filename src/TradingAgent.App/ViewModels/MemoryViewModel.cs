using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Knowledge;
using TradingAgent.Data.Knowledge;

namespace TradingAgent.App.ViewModels;

/// <summary>One memory in the list.</summary>
internal sealed class MemoryItemViewModel(Memory memory)
{
    public Memory Source { get; } = memory;

    public string Category => Source.Category;

    public string Content => Source.Content;

    public string When => Display.Time(Source.UpdatedAt);
}

/// <summary>The Memory page: what the agent keeps between conversations, to read, correct, add and remove.</summary>
internal sealed partial class MemoryViewModel : PageViewModel
{
    public const string AllCategories = "all";

    private const int ListLimit = 300;

    private readonly MemoryRepository _memories;
    private readonly EmbeddingIndexer _indexer;

    public MemoryViewModel(MemoryRepository memories, EmbeddingIndexer indexer)
    {
        _memories = memories;
        _indexer = indexer;
        Reload();
    }

    public override string Title => "Memory";

    public ObservableCollection<MemoryItemViewModel> Items { get; } = [];

    public IReadOnlyList<string> Filters { get; } = [AllCategories, .. MemoryRepository.Categories];

    public IReadOnlyList<string> Categories { get; } = MemoryRepository.Categories;

    /// <summary>Words to look for. Empty lists the newest.</summary>
    [ObservableProperty]
    public partial string Query { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Filter { get; set; } = AllCategories;

    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SaveCommand), nameof(DeleteCommand))]
    public partial MemoryItemViewModel? Selected { get; set; }

    /// <summary>The text in the form: of the chosen memory, or of a new one.</summary>
    [ObservableProperty]
    [NotifyCanExecuteChangedFor(nameof(SaveCommand), nameof(AddCommand))]
    public partial string Content { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Category { get; set; } = MemoryRepository.DefaultCategory;

    [ObservableProperty]
    public partial string Count { get; set; } = string.Empty;

    public override void Activate() => Reload();

    /// <summary>Saves the form as a new memory.</summary>
    [RelayCommand(CanExecute = nameof(HasContent))]
    public void Add()
    {
        _memories.Add(Category, Content);
        _indexer.Request();
        Content = string.Empty;
        Selected = null;
        Reload();
    }

    /// <summary>Saves the form over the chosen memory.</summary>
    [RelayCommand(CanExecute = nameof(CanSave))]
    public void Save()
    {
        if (Selected is { } item)
        {
            _memories.Update(item.Source.Id, Category, Content);
            _indexer.Request();
            Reload();
        }
    }

    [RelayCommand(CanExecute = nameof(HasSelection))]
    public void Delete()
    {
        if (Selected is { } item)
        {
            _memories.Delete(item.Source.Id);
            Selected = null;
            Content = string.Empty;
            Reload();
        }
    }

    private bool HasContent() => !string.IsNullOrWhiteSpace(Content);

    private bool HasSelection() => Selected is not null;

    private bool CanSave() => HasSelection() && HasContent();

    partial void OnQueryChanged(string value) => Reload();

    partial void OnFilterChanged(string value) => Reload();

    partial void OnSelectedChanged(MemoryItemViewModel? value)
    {
        if (value is not null)
        {
            Content = value.Content;
            Category = value.Category;
        }
    }

    private void Reload()
    {
        var category = Filter == AllCategories ? null : Filter;
        var found = string.IsNullOrWhiteSpace(Query)
            ? _memories.List(category, ListLimit)
            : [.. _memories.Search(Query, ListLimit).Where(memory => category is null || memory.Category == category)];
        var keep = Selected?.Source.Id;
        Items.Clear();
        foreach (var memory in found)
        {
            Items.Add(new MemoryItemViewModel(memory));
        }

        Count = Items.Count == 1 ? "1 memory" : $"{Items.Count} memories";
        if (keep is not null)
        {
            Selected = Items.FirstOrDefault(item => item.Source.Id == keep);
        }
    }
}
