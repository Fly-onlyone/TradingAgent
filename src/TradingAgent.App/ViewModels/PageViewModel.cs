using CommunityToolkit.Mvvm.ComponentModel;

namespace TradingAgent.App.ViewModels;

/// <summary>A page reachable from the navigation rail.</summary>
public abstract class PageViewModel : ObservableObject
{
    public abstract string Title { get; }

    /// <summary>Called when the page is shown, so that it can read anew what changed while it was not.</summary>
    public virtual void Activate()
    {
    }

    /// <summary>Called when another page is shown instead, so that the page can stop what only matters while it is seen.</summary>
    public virtual void Deactivate()
    {
    }
}
