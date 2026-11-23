using CommunityToolkit.Mvvm.ComponentModel;
using TradingAgent.Core;

namespace TradingAgent.App.ViewModels;

public sealed partial class MainViewModel : ObservableObject
{
    public MainViewModel(AppInfo info, DiagnosticsViewModel diagnostics)
    {
        ArgumentNullException.ThrowIfNull(info);
        Pages = [diagnostics];
        SelectedPage = diagnostics;
        WindowTitle = info.IsDevelopmentBuild ? $"{AppInfo.ProductName} (dev)" : AppInfo.ProductName;
        VersionLabel = $"v{info.Version}";
    }

    public IReadOnlyList<PageViewModel> Pages { get; }

    [ObservableProperty]
    public partial PageViewModel SelectedPage { get; set; }

    public string WindowTitle { get; }

    public string VersionLabel { get; }
}
