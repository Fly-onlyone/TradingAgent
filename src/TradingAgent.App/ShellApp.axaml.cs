using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Platform;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TradingAgent.App.Shell;
using TradingAgent.App.ViewModels;
using TradingAgent.Core;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data;
using TradingAgent.Data.Logging;
using TradingAgent.Platform.Windows;

namespace TradingAgent.App;

public sealed partial class ShellApp : Application
{
    private ServiceProvider? _services;

    /// <summary>The single-instance lock taken in <c>Main</c>; null under the headless test platform.</summary>
    internal static SingleInstanceGuard? Instance { get; set; }

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop)
        {
            var paths = AppPaths.ForCurrentUser(BuildFlavor.IsDevelopment);
            paths.EnsureCreated();
            var info = AppInfo.FromAssembly(typeof(ShellApp).Assembly, BuildFlavor.IsDevelopment);

            _services = BuildServices(info, paths);
            var logger = _services.GetRequiredService<ILogger<ShellApp>>();
            var schemaVersion = _services.GetRequiredService<Database>().SchemaVersion;
            var buildMode = info.BuildMode;
            LogStarted(logger, info.Version, buildMode, schemaVersion);
            _services.GetRequiredService<RetentionService>().Start();

            RegisterIdentity(info, paths, logger);

            // Lives for the whole run; disposed in the Exit handler below.
            var shell = new DesktopShell(
                this,
                desktop,
                info,
                _services.GetRequiredService<MainViewModel>(),
                _services.GetRequiredService<ISettingsStore>(),
                _services.GetRequiredService<IAutostart>(),
                _services.GetRequiredService<IToastNotifier>(),
                _services.GetRequiredService<ILogger<DesktopShell>>());
            shell.Start(Instance);

            desktop.Exit += (_, _) =>
            {
                shell.Dispose();
                // Disposing the provider flushes the log sinks.
                _services.Dispose();
            };
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
        ArgumentNullException.ThrowIfNull(info);
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
        services.AddSingleton<ISecretProtector, DpapiSecretProtector>();
        services.AddSingleton<ISecretStore, SqliteSecretStore>();

        services.AddSingleton<IAutostart>(provider => new WindowsAutostart(
            // Not "Trading agent.lnk": that name belongs to the previous app's shortcut while both exist.
            shortcutName: info.IsDevelopmentBuild ? "TradingAgent-Dev" : "TradingAgent",
            executable: Environment.ProcessPath ?? throw new InvalidOperationException("The process path is unknown."),
            description: AppInfo.ProductName,
            provider.GetRequiredService<ILogger<WindowsAutostart>>()));
        services.AddSingleton<IToastNotifier>(provider => new WindowsToastNotifier(
            info.ApplicationId,
            provider.GetRequiredService<ILogger<WindowsToastNotifier>>()));

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

    /// <summary>
    /// Registers the app with Windows as a notification sender. The icon is written to disk because Windows
    /// reads it from a file path, and the app's own copy is embedded in the executable.
    /// </summary>
    private static void RegisterIdentity(AppInfo info, AppPaths paths, ILogger logger)
    {
        try
        {
            var iconFile = Path.Combine(paths.DataDirectory, "app-icon.png");
            if (!File.Exists(iconFile))
            {
                using var source = AssetLoader.Open(new Uri("avares://TradingAgent/Assets/128x128.png"));
                using var target = File.Create(iconFile);
                source.CopyTo(target);
            }

            var displayName = info.IsDevelopmentBuild ? $"{AppInfo.ProductName} (dev)" : AppInfo.ProductName;
            AppUserModel.Register(info.ApplicationId, displayName, iconFile);
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or COMException)
        {
            // Notifications still work, but show without the app's name and icon.
            LogIdentityFailed(logger, ex);
        }
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Started version {Version} ({BuildMode}), database schema {SchemaVersion}.")]
    private static partial void LogStarted(ILogger logger, string version, string buildMode, int schemaVersion);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Registering the app's notification identity with Windows failed.")]
    private static partial void LogIdentityFailed(ILogger logger, Exception exception);
}
