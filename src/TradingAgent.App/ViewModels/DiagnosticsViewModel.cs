using TradingAgent.Core;

namespace TradingAgent.App.ViewModels;

/// <summary>Facts about the running build, and the place where each skeleton feature gets its test control.</summary>
public sealed class DiagnosticsViewModel(AppInfo info, AppPaths paths) : PageViewModel
{
    public override string Title => "Diagnostics";

    public string Version { get; } = info.Version;

    public string Build { get; } = info.IsNativeAot ? $"{info.BuildMode}, Native AOT" : $"{info.BuildMode}, JIT";

    public string Runtime { get; } = info.Runtime;

    public string DataFolder { get; } = paths.DataDirectory;

    public string DatabaseFile { get; } = paths.DatabaseFile;

    public string LogFolder { get; } = paths.LogDirectory;
}
