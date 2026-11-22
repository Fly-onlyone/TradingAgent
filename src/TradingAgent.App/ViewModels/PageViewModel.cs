using CommunityToolkit.Mvvm.ComponentModel;

namespace TradingAgent.App.ViewModels;

/// <summary>A page reachable from the navigation rail.</summary>
public abstract class PageViewModel : ObservableObject
{
    public abstract string Title { get; }
}
