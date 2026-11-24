using CommunityToolkit.Mvvm.ComponentModel;

namespace TradingAgent.App.ViewModels;

/// <summary>A page reachable from the navigation rail.</summary>
public abstract class PageViewModel : ObservableObject
{
    public abstract string Title { get; }

    /// <summary>
    /// True for a page that is laid out with glass cards of its own. The window then leaves out the
    /// sheet of glass it puts under the pages that are not, and gives the page its margin.
    /// </summary>
    public virtual bool UsesCards => false;

    /// <summary>Called when the page is shown, so that it can read anew what changed while it was not.</summary>
    public virtual void Activate()
    {
    }

    /// <summary>Called when another page is shown instead, so that the page can stop what only matters while it is seen.</summary>
    public virtual void Deactivate()
    {
    }
}
