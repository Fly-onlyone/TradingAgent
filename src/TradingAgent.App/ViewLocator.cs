using Avalonia.Controls;
using Avalonia.Controls.Templates;
using TradingAgent.App.Motion;
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
    public Control Build(object? param) => Entering(param switch
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
    });

    public bool Match(object? data) => data is PageViewModel;

    /// <summary>Makes the view rise into place when it is shown, as a page of the previous UI did.</summary>
    private static Control Entering(Control view)
    {
        Enter.SetKind(view, EnterKind.Page);
        // A page of cards lets their shadows, and its scroll bar, stand in the margin around it.
        view.ClipToBounds = false;
        return view;
    }
}
