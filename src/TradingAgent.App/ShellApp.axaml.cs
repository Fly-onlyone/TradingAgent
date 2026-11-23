using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core;

namespace TradingAgent.App;

public sealed class ShellApp : Application
{
#if DEBUG
    private const bool IsDevelopmentBuild = true;
#else
    private const bool IsDevelopmentBuild = false;
#endif

    private ServiceProvider? _services;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var paths = AppPaths.ForCurrentUser(IsDevelopmentBuild);
            paths.EnsureCreated();
            var info = AppInfo.FromAssembly(typeof(ShellApp).Assembly, IsDevelopmentBuild);

            _services = BuildServices(info, paths);
            desktop.MainWindow = new MainWindow { DataContext = _services.GetRequiredService<MainViewModel>() };
            desktop.Exit += (_, _) => _services.Dispose();
        }

        base.OnFrameworkInitializationCompleted();
    }

    /// <summary>Builds the object graph of the app. Public so tests can check that it resolves.</summary>
    public static ServiceProvider BuildServices(AppInfo info, AppPaths paths)
    {
        var services = new ServiceCollection();
        services.AddSingleton(info);
        services.AddSingleton(paths);
        services.AddSingleton<DiagnosticsViewModel>();
        services.AddSingleton<MainViewModel>();
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = true });
    }
}
