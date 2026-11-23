using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TradingAgent.App.ViewModels;
using TradingAgent.App.Views;
using TradingAgent.Core;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Data;
using TradingAgent.Data.Logging;
using TradingAgent.Platform.Windows;

namespace TradingAgent.App;

public sealed partial class ShellApp : Application
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
            var logger = _services.GetRequiredService<ILogger<ShellApp>>();
            var schemaVersion = _services.GetRequiredService<Database>().SchemaVersion;
            var buildMode = info.BuildMode;
            LogStarted(logger, info.Version, buildMode, schemaVersion);
            _services.GetRequiredService<RetentionService>().Start();

            desktop.MainWindow = new MainWindow { DataContext = _services.GetRequiredService<MainViewModel>() };
            // Disposing the provider flushes the log sinks.
            desktop.Exit += (_, _) => _services.Dispose();
        }

        base.OnFrameworkInitializationCompleted();
    }

    /// <summary>
    /// Opens the database, applying pending migrations, and builds the object graph of the app.
    /// Public so tests can check that the graph resolves.
    /// </summary>
    /// <exception cref="MigrationException">The database could not be brought to the current schema.</exception>
    public static ServiceProvider BuildServices(AppInfo info, AppPaths paths)
    {
        ArgumentNullException.ThrowIfNull(paths);

        // Before anything else: the settings store and the database log sink read tables at construction.
        var database = new Database(paths.DatabaseFile);
        database.Initialize();

        var services = new ServiceCollection();
        services.AddSingleton(info);
        services.AddSingleton(paths);
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton(database);
        services.AddSingleton<LogRepository>();
        services.AddSingleton<RetentionService>();
        services.AddSingleton<ISettingsStore, SqliteSettingsStore>();
        services.AddSingleton<ISecretProtector>(_ => CreateSecretProtector());
        services.AddSingleton<ISecretStore, SqliteSecretStore>();

        services.AddLogging(logging =>
        {
            logging.SetMinimumLevel(LogLevel.Information);
            logging.Services.AddSingleton<ILoggerProvider>(
                provider => new JsonLinesFileLoggerProvider(paths.LogDirectory, provider.GetRequiredService<TimeProvider>()));
            logging.Services.AddSingleton<ILoggerProvider, SqliteLoggerProvider>();
        });

        services.AddSingleton<DiagnosticsViewModel>();
        services.AddSingleton<MainViewModel>();
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = true });
    }

    private static DpapiSecretProtector CreateSecretProtector() =>
        OperatingSystem.IsWindows()
            ? new DpapiSecretProtector()
            : throw new PlatformNotSupportedException("Secret storage is only implemented for Windows.");

    [LoggerMessage(Level = LogLevel.Information, Message = "Started version {Version} ({BuildMode}), database schema {SchemaVersion}.")]
    private static partial void LogStarted(ILogger logger, string version, string buildMode, int schemaVersion);
}
