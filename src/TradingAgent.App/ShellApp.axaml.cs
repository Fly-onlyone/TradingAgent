using System.Runtime.InteropServices;
using Avalonia;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Platform;
using Avalonia.Threading;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Cli;
using TradingAgent.Agent.Models;
using TradingAgent.Agent.Orders;
using TradingAgent.Agent.Runs;
using TradingAgent.Agent.Tools;
using TradingAgent.App.Hosting;
using TradingAgent.App.Shell;
using TradingAgent.App.Telemetry;
using TradingAgent.App.ViewModels;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Hosting;
using TradingAgent.Core.Secrets;
using TradingAgent.Core.Settings;
using TradingAgent.Core.Shell;
using TradingAgent.Data;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Logging;
using TradingAgent.Data.Notifications;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;
using TradingAgent.Exchange.Risk;
using TradingAgent.Platform.Windows;

namespace TradingAgent.App;

public sealed partial class ShellApp : Application
{
    /// <summary>How long exit waits for background services (child processes, pollers) to stop.</summary>
    private static readonly TimeSpan _backgroundStopTimeout = TimeSpan.FromSeconds(5);

    /// <summary>
    /// How long a model provider may take to start answering. Answers are streamed, so this is the wait
    /// for the first byte, which is long when the model thinks before it writes.
    /// </summary>
    private static readonly TimeSpan _modelCallTimeout = TimeSpan.FromMinutes(10);

    /// <summary>How long OKX may take to answer a read request.</summary>
    private static readonly TimeSpan _exchangeTimeout = TimeSpan.FromSeconds(15);

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

            // Before anything can start a run: close what the previous run of the app left half done.
            _services.GetRequiredService<AgentStartupReconciler>().Reconcile();
            var background = _services.GetRequiredService<BackgroundServiceHost>();
            // Not awaited: a slow service must not delay the window. Failures are logged by the host.
            _ = background.StartAsync();

            // After the settings store exists, before the window: start-up problems get reported too.
            var telemetry = _services.GetRequiredService<TelemetryService>();
            telemetry.Start();
            telemetry.BeginStartup();
            ReportUnhandledExceptions(logger);

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
                _services.GetRequiredService<IUpdateService>(),
                _services.GetRequiredService<ShellRequests>(),
                telemetry,
                _services.GetRequiredService<ILogger<DesktopShell>>());
            shell.Start(Instance);
            _services.GetRequiredService<VelopackUpdateService>().Start();

            desktop.Exit += (_, _) =>
            {
                shell.Dispose();
                // Blocks the exit for at most the timeout; the host never resumes on this thread.
                background.StopAsync(_backgroundStopTimeout).GetAwaiter().GetResult();
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
        services.AddSingleton<ISettingsStore, SqliteSettingsStore>();

        // Agent: sessions, messages, the provider transcript, and the events screens follow them by.
        services.AddSingleton<AgentSessionRepository>();
        services.AddSingleton<SessionMessageRepository>();
        services.AddSingleton<TranscriptRepository>();
        services.AddSingleton<AgentStartupReconciler>();
        services.AddSingleton<IAgentEvents, AgentEventHub>();

        // Agent: model providers, tools and the loop that drives them. Keys are read from the secret
        // store at the time of each call, so a key saved in Settings works without a restart.
        services.AddSingleton(_ => new HttpClient { Timeout = _modelCallTimeout });
        services.AddSingleton(provider => new AnthropicModelClient(
            provider.GetRequiredService<HttpClient>(),
            () => provider.GetRequiredService<ISecretStore>().Reveal(SecretNames.AnthropicApiKey),
            provider.GetRequiredService<TimeProvider>(),
            provider.GetRequiredService<ILogger<AnthropicModelClient>>()));
        services.AddSingleton(provider => new OpenAiModelClient(
            provider.GetRequiredService<HttpClient>(),
            () => provider.GetRequiredService<ISecretStore>().Reveal(SecretNames.OpenAiApiKey)));
        // Exchange, read-only. Its own HTTP client: a market data request must fail fast, unlike a
        // model call. The key and the demo/live mode are read at the time of each request.
        services.AddSingleton<IOkxReader>(provider =>
        {
            var settings = provider.GetRequiredService<ISettingsStore>();
            return new OkxClient(
                new HttpClient { Timeout = _exchangeTimeout },
                OkxCredentialsFrom(provider.GetRequiredService<ISecretStore>()),
                () => settings.GetValue(SettingKeys.OkxSandbox),
                provider.GetRequiredService<TimeProvider>(),
                provider.GetRequiredService<ILogger<OkxClient>>());
        });
        services.AddSingleton<RiskManager>();

        // The OKX trade kit: a helper process whose tools the agent uses next to the app's own. Its
        // tools come and go with the process, so the tool host asks for them at the time of each run.
        services.AddSingleton<WindowsChildProcessJob>();
        services.AddSingleton<IChildProcessJob>(provider => provider.GetRequiredService<WindowsChildProcessJob>());
        services.AddSingleton<IAtkLauncher>(provider => new AtkProcessLauncher(
            AppContext.BaseDirectory,
            info.IsDevelopmentBuild,
            paths.TradeKitHomeDirectory,
            provider.GetRequiredService<IChildProcessJob>(),
            provider.GetRequiredService<ILogger<AtkProcessLauncher>>()));
        services.AddSingleton<OrderStubRepository>();
        services.AddSingleton<IAtkGate, RiskGate>();
        services.AddSingleton(provider => new AtkService(
            provider.GetRequiredService<IAtkLauncher>(),
            provider.GetRequiredService<IAtkGate>(),
            OkxCredentialsFrom(provider.GetRequiredService<ISecretStore>()),
            provider.GetRequiredService<ISettingsStore>(),
            info,
            provider.GetRequiredService<TimeProvider>(),
            provider.GetRequiredService<ILogger<AtkService>>()));
        services.AddSingleton<IToolSource>(provider => provider.GetRequiredService<AtkService>());

        services.AddSingleton<QuestionBroker>();
        services.AddSingleton<ITool, AskUserTool>();
        services.AddSingleton<ITool, GetTickerTool>();
        services.AddSingleton<ITool, GetCandlesticksTool>();
        services.AddSingleton<ITool, GetOrderBookTool>();
        services.AddSingleton<ITool, GetTechnicalIndicatorsTool>();
        services.AddSingleton<ITool, GetAccountBalanceTool>();
        services.AddSingleton<ITool, GetPositionsTool>();
        services.AddSingleton<ITool, GetOpenOrdersTool>();
        services.AddSingleton(provider => new ToolHost(
            provider.GetServices<ITool>(),
            provider.GetServices<IToolGate>(),
            provider.GetRequiredService<ILogger<ToolHost>>(),
            sources: provider.GetServices<IToolSource>()));
        // Claude Code, for a user who signs in with a subscription. It is started per run and reaches
        // the tools above through this app's own exe in bridge mode.
        services.AddSingleton<ICliProcessLauncher>(provider => new CliProcessLauncher(provider.GetRequiredService<IChildProcessJob>()));
        services.AddSingleton(provider => new ClaudeCli(
            provider.GetRequiredService<ICliProcessLauncher>(),
            paths.ClaudeCodeDirectory,
            provider.GetRequiredService<TimeProvider>(),
            provider.GetRequiredService<ILogger<ClaudeCli>>()));
        services.AddSingleton(new CliRuntimeOptions(
            Environment.ProcessPath ?? throw new InvalidOperationException("The process path is unknown."),
            paths.ClaudeCodeDirectory));
        services.AddSingleton<ISystemPrompt, TradingSystemPrompt>();
        services.AddSingleton<AgentCardViewModel>();
        services.AddSingleton<IAgentRuntimeResolver, AgentRuntimeResolver>();
        services.AddSingleton<AgentRunner>();

        // Background services, in start order. They stop in the reverse order.
        services.AddSingleton<RetentionService>();
        services.AddSingleton<IBackgroundService>(provider => provider.GetRequiredService<RetentionService>());
        services.AddSingleton<IBackgroundService>(provider => provider.GetRequiredService<AtkService>());
        // After the trade kit: what the kit places, the mirror reads back from OKX.
        services.AddSingleton<MirrorOrderRepository>();
        services.AddSingleton<NotificationService>();
        services.AddSingleton<OrderMirror>();
        services.AddSingleton<IBackgroundService>(provider => provider.GetRequiredService<OrderMirror>());
        services.AddSingleton<BackgroundServiceHost>();

        services.AddSingleton<ISecretProtector, DpapiSecretProtector>();
        services.AddSingleton<ISecretStore, SqliteSecretStore>();

        services.AddSingleton<IAutostart>(provider => new WindowsAutostart(
            shortcutName: AutostartShortcutName(info.IsDevelopmentBuild),
            executable: Environment.ProcessPath ?? throw new InvalidOperationException("The process path is unknown."),
            description: AppInfo.ProductName,
            provider.GetRequiredService<ILogger<WindowsAutostart>>()));
        services.AddSingleton<IToastNotifier>(provider => new WindowsToastNotifier(
            info.ApplicationId,
            provider.GetRequiredService<ILogger<WindowsToastNotifier>>()));

        services.AddSingleton<ShellRequests>();
        services.AddSingleton<TelemetryGate>();
        services.AddSingleton<TelemetryService>();
        services.AddSingleton<VelopackUpdateService>();
        services.AddSingleton<IUpdateService>(provider => provider.GetRequiredService<VelopackUpdateService>());

        services.AddLogging(logging =>
        {
            logging.SetMinimumLevel(LogLevel.Information);
            logging.Services.AddSingleton<ILoggerProvider>(
                provider => new JsonLinesFileLoggerProvider(paths.LogDirectory, provider.GetRequiredService<TimeProvider>()));
            logging.Services.AddSingleton<ILoggerProvider, SqliteLoggerProvider>();
            logging.Services.AddSingleton<ILoggerProvider, SentryLoggerProvider>();
        });

        services.AddSingleton<DiagnosticsViewModel>();
        services.AddSingleton<MainViewModel>();
        return services.BuildServiceProvider(new ServiceProviderOptions { ValidateOnBuild = true });
    }

    /// <summary>
    /// Logs exceptions nobody caught. The log reaches the file, the database and, when reporting is on,
    /// Sentry. A failure on the UI thread is then treated as handled: the app keeps running in the tray,
    /// because a monitoring app that disappears is worse than one with a broken page.
    /// </summary>
    private static void ReportUnhandledExceptions(ILogger logger)
    {
        Dispatcher.UIThread.UnhandledException += (_, e) =>
        {
            LogUnhandled(logger, e.Exception);
            e.Handled = true;
        };
        TaskScheduler.UnobservedTaskException += (_, e) =>
        {
            LogUnobserved(logger, e.Exception);
            e.SetObserved();
        };
    }

    /// <summary>File name, without extension, of the shortcut in the Startup folder.</summary>
    /// <remarks>Not "Trading agent": that name belongs to the previous app's shortcut while both exist.</remarks>
    internal static string AutostartShortcutName(bool isDevelopmentBuild) =>
        isDevelopmentBuild ? "TradingAgent-Dev" : "TradingAgent";

    /// <summary>
    /// Reads the saved OKX key at the time of each call, so a key saved in Settings is used without a
    /// restart. Null until all three parts are saved.
    /// </summary>
    private static Func<OkxCredentials?> OkxCredentialsFrom(ISecretStore secrets) =>
        () => secrets.Reveal(SecretNames.OkxApiKey) is { Length: > 0 } key
            && secrets.Reveal(SecretNames.OkxSecretKey) is { Length: > 0 } secret
            && secrets.Reveal(SecretNames.OkxPassphrase) is { Length: > 0 } passphrase
                ? new OkxCredentials(key, secret, passphrase)
                : null;

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

    [LoggerMessage(Level = LogLevel.Error, Message = "Unhandled error on the UI thread.")]
    private static partial void LogUnhandled(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "A background task failed and nobody observed it.")]
    private static partial void LogUnobserved(ILogger logger, Exception exception);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Registering the app's notification identity with Windows failed.")]
    private static partial void LogIdentityFailed(ILogger logger, Exception exception);
}
