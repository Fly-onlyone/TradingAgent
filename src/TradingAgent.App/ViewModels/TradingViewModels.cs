using System.Collections.ObjectModel;
using System.Globalization;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Orders;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Tasks;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Analysis;
using TradingAgent.Exchange.Okx;

namespace TradingAgent.App.ViewModels;

/// <summary>Numbers as the trading pages show them.</summary>
internal static class Money
{
    public static string Amount(double value) => value.ToString("#,0.00", CultureInfo.CurrentCulture);

    public static string Amount(decimal value) => value.ToString("#,0.00", CultureInfo.CurrentCulture);

    /// <summary>A price or a quantity with as many decimals as its size calls for.</summary>
    public static string Number(double value) =>
        value.ToString(Math.Abs(value) >= 100 ? "#,0.00" : Math.Abs(value) >= 1 ? "0.####" : "0.########", CultureInfo.CurrentCulture);

    public static string Number(decimal value) => Number((double)value);

    public static string Signed(double value) => (value > 0 ? "+" : string.Empty) + Amount(value);

    /// <summary>What went wrong with a request to OKX, in words for the page.</summary>
    public static string Problem(Exception exception) => exception switch
    {
        OkxException { Failure: OkxFailure.Credentials } => "No OKX key is saved, or OKX refused it. Save the key in Settings.",
        OkxException okx => okx.Message,
        _ => "OKX cannot be reached.",
    };

    public static bool IsExchangeProblem(Exception exception) =>
        exception is OkxException or HttpRequestException or TaskCanceledException;
}

/// <summary>One row of a table on a trading page: a few cells of text, and whether it is good or bad news.</summary>
internal sealed record RowViewModel(string A, string B = "", string C = "", string D = "", string E = "", string F = "", string G = "", int Tone = 0)
{
    public bool IsGood => Tone > 0;

    public bool IsBad => Tone < 0;
}

/// <summary>The Dashboard: what the account holds, what is open, and how the closed trades went.</summary>
internal sealed partial class DashboardViewModel : PageViewModel
{
    private readonly IOkxReader _okx;
    private readonly TradeRepository _trades;
    private readonly AgentTaskRepository _tasks;
    private readonly ISettingsStore _settings;
    private readonly TimeProvider _time;
    private readonly Action<Action> _post;

    public DashboardViewModel(
        IOkxReader okx,
        TradeRepository trades,
        AgentTaskRepository tasks,
        ISettingsStore settings,
        TimeProvider time,
        Action<Action>? post = null)
    {
        _okx = okx;
        _trades = trades;
        _tasks = tasks;
        _settings = settings;
        _time = time;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        ShowLocal();
    }

    public override string Title => "Dashboard";

    public ObservableCollection<RowViewModel> Assets { get; } = [];

    public ObservableCollection<RowViewModel> Positions { get; } = [];

    public ObservableCollection<RowViewModel> RecentOrders { get; } = [];

    /// <summary>The account's value in US dollars, or a dash while it is not known.</summary>
    [ObservableProperty]
    public partial string Equity { get; set; } = "–";

    /// <summary>Demo or live, and what went wrong with the last request, if anything.</summary>
    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string PnlDay { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string PnlWeek { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string PnlMonth { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string TaskLine { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool EmergencyStop { get; set; }

    [ObservableProperty]
    public partial bool HasPositions { get; set; }

    public override void Activate()
    {
        ShowLocal();
        _ = RefreshAsync();
    }

    /// <summary>Reads the account from OKX and shows it with what the app has stored.</summary>
    [RelayCommand]
    public async Task RefreshAsync()
    {
        var mode = _settings.GetValue(SettingKeys.OkxSandbox) ? "Demo trading" : "LIVE trading";
        try
        {
            var (balance, positions) = await Task.Run(async () =>
            {
                var account = await _okx.GetBalanceAsync(CancellationToken.None).ConfigureAwait(false);
                var open = await _okx.GetPositionsAsync(null, CancellationToken.None).ConfigureAwait(false);
                return (account, open);
            }).ConfigureAwait(false);
            _post(() =>
            {
                Equity = "$" + Money.Amount(balance.TotalEquityUsd);
                Assets.Clear();
                foreach (var asset in balance.Assets.Where(asset => asset.EquityUsd >= 0.01m).OrderByDescending(asset => asset.EquityUsd))
                {
                    Assets.Add(new RowViewModel(asset.Currency, Money.Number(asset.Equity), Money.Number(asset.Available), "$" + Money.Amount(asset.EquityUsd)));
                }

                Positions.Clear();
                foreach (var position in positions.Where(position => position.Size != 0))
                {
                    Positions.Add(new RowViewModel(
                        position.InstrumentId,
                        position.Side,
                        Money.Number(position.Size),
                        Money.Number(position.AveragePrice),
                        Money.Number(position.MarkPrice),
                        Money.Signed((double)position.UnrealizedPnl),
                        $"{position.Leverage:0.#}x",
                        Math.Sign(position.UnrealizedPnl)));
                }

                HasPositions = Positions.Count > 0;
                Status = mode;
                ShowLocal();
            });
        }
        catch (Exception ex) when (Money.IsExchangeProblem(ex))
        {
            _post(() =>
            {
                Status = $"{mode}. {Money.Problem(ex)}";
                ShowLocal();
            });
        }
    }

    /// <summary>What needs no request to OKX: the closed trades, the newest orders, the tasks, the emergency stop.</summary>
    private void ShowLocal()
    {
        var now = _time.GetUtcNow();
        PnlDay = Line(_trades.RealizedSince(now.AddDays(-1).ToUnixTimeMilliseconds()));
        PnlWeek = Line(_trades.RealizedSince(now.AddDays(-7).ToUnixTimeMilliseconds()));
        PnlMonth = Line(_trades.RealizedSince(now.AddDays(-30).ToUnixTimeMilliseconds()));
        EmergencyStop = _settings.GetValue(SettingKeys.EmergencyStopActive);

        RecentOrders.Clear();
        foreach (var order in _trades.ListOrders(8))
        {
            RecentOrders.Add(OrdersViewModel.ToRow(order));
        }

        var tasks = _tasks.List();
        var active = tasks.Count(task => task.Status == AgentTask.Active);
        var next = tasks.Where(task => task.Status == AgentTask.Active && task.NextRunAt is not null).MinBy(task => task.NextRunAt);
        TaskLine = tasks.Count == 0
            ? "No scheduled tasks."
            : $"{active} of {tasks.Count} tasks active." + (next is null ? string.Empty : $" Next: {next.Name}, {Display.Time(next.NextRunAt)}.");
    }

    private static string Line(PnlSummary summary) =>
        summary.Trades == 0 ? "no closed trades" : $"{Money.Signed(summary.Pnl)} · {summary.Wins} of {summary.Trades} won";
}

/// <summary>The Trading page: the price chart of one instrument with its figures.</summary>
internal sealed partial class TradingViewModel : PageViewModel, IDisposable
{
    private static readonly TimeSpan _refreshEvery = TimeSpan.FromSeconds(15);

    private readonly IOkxReader _okx;
    private readonly Action<Action> _post;
    private CancellationTokenSource? _watching;

    public TradingViewModel(IOkxReader okx, Action<Action>? post = null)
    {
        _okx = okx;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
    }

    public override string Title => "Trading";

    public IReadOnlyList<string> Timeframes { get; } = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

    [ObservableProperty]
    public partial string Symbol { get; set; } = "BTC-USDT";

    [ObservableProperty]
    public partial string Timeframe { get; set; } = "1H";

    [ObservableProperty]
    public partial IReadOnlyList<Candle> Candles { get; set; } = [];

    /// <summary>Last price and the day's change.</summary>
    [ObservableProperty]
    public partial string Price { get; set; } = "–";

    [ObservableProperty]
    public partial int PriceTone { get; set; }

    /// <summary>The day's range and volume.</summary>
    [ObservableProperty]
    public partial string Day { get; set; } = string.Empty;

    /// <summary>Trend, RSI, averages, ATR on the chosen timeframe.</summary>
    [ObservableProperty]
    public partial string Indicators { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    public bool IsRising => PriceTone > 0;

    public bool IsFalling => PriceTone < 0;

    public override void Activate()
    {
        Deactivate();
        _watching = new CancellationTokenSource();
        _ = WatchAsync(_watching.Token);
    }

    public override void Deactivate()
    {
        _watching?.Cancel();
        _watching?.Dispose();
        _watching = null;
    }

    public void Dispose() => Deactivate();

    /// <summary>Reads the chart and the figures of the instrument in the box.</summary>
    [RelayCommand]
    public async Task LoadAsync()
    {
        var symbol = Symbol.Trim().ToUpperInvariant();
        var timeframe = Timeframe;
        if (symbol.Length == 0)
        {
            return;
        }

        try
        {
            var (ticker, candles) = await Task.Run(async () =>
            {
                var last = await _okx.GetTickerAsync(symbol, CancellationToken.None).ConfigureAwait(false);
                var history = await _okx.GetCandlesAsync(symbol, timeframe, 300, CancellationToken.None).ConfigureAwait(false);
                return (last, history);
            }).ConfigureAwait(false);
            var snapshot = Exchange.Analysis.Indicators.Compute(candles);
            _post(() =>
            {
                Symbol = symbol;
                Candles = candles;
                Price = $"{Money.Number(ticker.Last)}   {(ticker.ChangePercent24h > 0 ? "+" : string.Empty)}{ticker.ChangePercent24h:0.00} %";
                PriceTone = Math.Sign(ticker.ChangePercent24h);
                Day = $"24 h: low {Money.Number(ticker.Low24h)}, high {Money.Number(ticker.High24h)}, volume {Money.Number(ticker.Volume24h)}";
                Indicators = snapshot is null
                    ? "Not enough price history for the indicators."
                    : string.Create(
                        CultureInfo.CurrentCulture,
                        $"{timeframe}: trend {Word(snapshot.Trend)} · RSI {snapshot.Rsi14:0.0} · SMA 20 {Money.Number(snapshot.Sma20)} · SMA 50 {Money.Number(snapshot.Sma50)} · ATR {snapshot.AtrPercent:0.00} %");
                Status = string.Empty;
            });
        }
        catch (Exception ex) when (Money.IsExchangeProblem(ex))
        {
            _post(() => Status = Money.Problem(ex));
        }
    }

    private static string Word(Trend trend) => trend.ToString().ToLowerInvariant();

    partial void OnPriceToneChanged(int value)
    {
        OnPropertyChanged(nameof(IsRising));
        OnPropertyChanged(nameof(IsFalling));
    }

    partial void OnTimeframeChanged(string value) => _ = LoadAsync();

    /// <summary>Keeps the chart current while the page is shown.</summary>
    private async Task WatchAsync(CancellationToken cancellationToken)
    {
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                await LoadAsync().ConfigureAwait(false);
                await Task.Delay(_refreshEvery, cancellationToken).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException)
        {
            // Another page is shown.
        }
    }
}

/// <summary>The Orders page: every order the app knows, as OKX last reported it.</summary>
internal sealed partial class OrdersViewModel : PageViewModel
{
    public const string AllStatuses = "all";

    private readonly TradeRepository _trades;
    private readonly OrderMirror _mirror;
    private readonly Action<Action> _post;

    public OrdersViewModel(TradeRepository trades, OrderMirror mirror, Action<Action>? post = null)
    {
        _trades = trades;
        _mirror = mirror;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        Reload();
    }

    public override string Title => "Orders";

    public ObservableCollection<RowViewModel> Orders { get; } = [];

    public IReadOnlyList<string> Statuses { get; } = [AllStatuses, "open", "partially_filled", "filled", "cancelled", "rejected", "expired"];

    [ObservableProperty]
    public partial string Filter { get; set; } = AllStatuses;

    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    public override void Activate() => Reload();

    /// <summary>Asks OKX for the orders now, instead of waiting for the next pass of the mirror.</summary>
    [RelayCommand]
    public async Task RefreshAsync()
    {
        Status = "Asking OKX…";
        try
        {
            var pass = await Task.Run(() => _mirror.RunOnceAsync(CancellationToken.None)).ConfigureAwait(false);
            _post(() =>
            {
                Reload();
                Status = !pass.Asked ? "No OKX key is saved: there is nothing to ask."
                    : pass.RateLimited ? "OKX asked to slow down. Try again in a moment."
                    : $"{pass.Added} new, {pass.Changed} changed.";
            });
        }
        catch (Exception ex) when (Money.IsExchangeProblem(ex))
        {
            _post(() => Status = Money.Problem(ex));
        }
    }

    internal static RowViewModel ToRow(OrderRow order) => new(
        Display.Time(order.CreatedAt),
        order.Symbol,
        order.Side + (order.IsAlgo ? " (algo)" : string.Empty),
        order.OrderType.Replace('_', ' '),
        $"{Money.Number(order.FilledQuantity)} / {Money.Number(order.Quantity)}",
        order.AverageFillPrice is { } average ? Money.Number(average) : order.Price is { } price ? Money.Number(price) : "market",
        order.Status.Replace('_', ' '),
        order.Status is "rejected" or "expired" ? -1 : order.Status == "filled" ? 1 : 0);

    partial void OnFilterChanged(string value) => Reload();

    private void Reload()
    {
        Orders.Clear();
        foreach (var order in _trades.ListOrders(300, Filter == AllStatuses ? null : Filter))
        {
            Orders.Add(ToRow(order));
        }

        Status = Orders.Count == 0 ? "No orders yet. Orders the agent places, and orders placed on OKX itself, appear here." : string.Empty;
    }
}

/// <summary>The Trades page: what the closed trades came to, and what past signals were worth.</summary>
internal sealed partial class TradesViewModel : PageViewModel
{
    private readonly TradeRepository _trades;
    private readonly TradeLearner _learner;
    private readonly PatternMiner _miner;
    private readonly TimeProvider _time;
    private readonly Action<Action> _post;

    public TradesViewModel(TradeRepository trades, TradeLearner learner, PatternMiner miner, TimeProvider time, Action<Action>? post = null)
    {
        _trades = trades;
        _learner = learner;
        _miner = miner;
        _time = time;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        Reload();
    }

    public override string Title => "Trades";

    public ObservableCollection<RowViewModel> Trades { get; } = [];

    public ObservableCollection<RowViewModel> Patterns { get; } = [];

    [ObservableProperty]
    public partial string Summary { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    public override void Activate() => Reload();

    /// <summary>Works out the trades closed since the last pass, now.</summary>
    [RelayCommand]
    public async Task RefreshAsync()
    {
        try
        {
            await Task.Run(() => _learner.RunOnceAsync(CancellationToken.None)).ConfigureAwait(false);
            _post(Reload);
        }
        catch (Exception ex) when (Money.IsExchangeProblem(ex))
        {
            _post(() => Status = Money.Problem(ex));
        }
    }

    /// <summary>Measures on past prices what the usual signals were worth, now.</summary>
    [RelayCommand]
    public async Task MineAsync()
    {
        Status = "Measuring past signals…";
        var stored = await Task.Run(() => _miner.RunOnceAsync(CancellationToken.None)).ConfigureAwait(false);
        _post(() =>
        {
            Reload();
            Status = stored == 0 ? "No pattern had enough cases, or the prices could not be read." : $"{stored} patterns measured.";
        });
    }

    private void Reload()
    {
        var now = _time.GetUtcNow();
        Summary = string.Join(
            "     ",
            new (string Label, int Days)[] { ("24 h", 1), ("7 days", 7), ("30 days", 30) }.Select(period =>
            {
                var summary = _trades.RealizedSince(now.AddDays(-period.Days).ToUnixTimeMilliseconds());
                return summary.Trades == 0
                    ? $"{period.Label}: no closed trades"
                    : $"{period.Label}: {Money.Signed(summary.Pnl)} ({summary.Wins} of {summary.Trades} won)";
            }));

        Trades.Clear();
        foreach (var trade in _trades.ListTrades(300))
        {
            var pnl = trade.RealizedPnl ?? 0;
            Trades.Add(new RowViewModel(
                Display.Time(trade.ClosedAt),
                trade.Symbol,
                trade.Side == "sell" ? "long" : "short",
                Money.Number(trade.FilledQuantity),
                Money.Number(trade.EntryPrice ?? 0),
                Money.Number(trade.AverageFillPrice ?? 0),
                $"{Money.Signed(pnl)}  ({trade.RealizedPnlPercent ?? 0:+0.00;-0.00;0.00} %)",
                Math.Sign(pnl)));
        }

        Patterns.Clear();
        foreach (var pattern in _trades.ListPatterns())
        {
            Patterns.Add(new RowViewModel(
                pattern.Name,
                $"{pattern.SuccessRate * 100:0} % higher after {PatternMiner.Horizon} bars",
                $"{pattern.AverageReturn:+0.00;-0.00;0.00} % on average",
                $"{pattern.SampleCount} cases",
                Tone: pattern.SampleCount < 10 ? 0 : Math.Sign(pattern.AverageReturn)));
        }

        Status = Trades.Count == 0 ? "No closed trades yet. A trade appears here when an order closes a position the app saw opened." : string.Empty;
    }
}
