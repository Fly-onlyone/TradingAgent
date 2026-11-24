using Avalonia.Controls;
using Avalonia.Controls.Templates;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;

namespace TradingAgent.App;

/// <summary>Chooses the view for a page view model.</summary>
/// <remarks>
/// An explicit switch, not the usual name-based lookup: that one creates views through reflection, which
/// Native AOT trims away. Add a case here for every new page.
/// </remarks>
public sealed class ViewLocator : IDataTemplate
{
    public Control Build(object? param) => param switch
    {
        ChatViewModel => new ChatView(),
        DashboardViewModel => new DashboardView(),
        TradingViewModel => new TradingView(),
        OrdersViewModel => new OrdersView(),
        TradesViewModel => new TradesView(),
        AdminViewModel => new AdminView(),
        TasksViewModel => new TasksView(),
        StrategiesViewModel => new StrategiesView(),
        KnowledgeViewModel => new KnowledgeView(),
        MemoryViewModel => new MemoryView(),
        NewsViewModel => new NewsView(),
        SettingsViewModel => new SettingsView(),
        DiagnosticsViewModel => new DiagnosticsView(),
        _ => new TextBlock { Text = $"No view is registered for {param?.GetType().Name ?? "null"}." },
    };

    public bool Match(object? data) => data is PageViewModel;
}
