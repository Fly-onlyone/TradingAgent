using System.Collections.ObjectModel;
using System.Globalization;
using Avalonia.Threading;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using TradingAgent.Agent.Orders;
using TradingAgent.App.Controls;
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

    /// <summary>An amount of US dollars with its sign in front of the dollar sign: +$12.00, -$3.50.</summary>
    public static string SignedUsd(double value) => (value >= 0 ? "+$" : "-$") + Amount(Math.Abs(value));

    /// <summary>A large quantity in thousands, millions or billions: 12.3K, 4.56M.</summary>
    public static string Compact(double value) => Math.Abs(value) switch
    {
        >= 1e9 => (value / 1e9).ToString("0.00", CultureInfo.CurrentCulture) + "B",
        >= 1e6 => (value / 1e6).ToString("0.00", CultureInfo.CurrentCulture) + "M",
        >= 1e3 => (value / 1e3).ToString("0.00", CultureInfo.CurrentCulture) + "K",
        _ => Number(value),
    };

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

/// <summary>A coin the account holds.</summary>
internal sealed record HoldingRow(string Currency, string Amount, string Available, string Value);

/// <summary>An open position, with whether it is ahead (<paramref name="Tone"/> above zero) or behind.</summary>
internal sealed record PositionRow(string Symbol, string Side, string Size, string Entry, string Mark, string Pnl, string Leverage, int Tone)
{
    public bool IsGood => Tone > 0;

    public bool IsBad => Tone < 0;

    public string SideLabel => Side.ToUpperInvariant();
}

/// <summary>An order as OKX last reported it.</summary>
internal sealed record OrderItem(string Time, string Symbol, string Side, string Type, string Quantity, string Filled, string Price, string Status, string State)
{
    /// <summary>Good news is a filled order, bad news one that OKX refused or let expire.</summary>
    public bool IsGood => State == "filled";

    public bool IsBad => State is "rejected" or "expired";

    public bool IsOpen => State == "open";

    public bool IsPartial => State == "partially_filled";

    public string SideLabel => Side.ToUpperInvariant();
}

/// <summary>A closed trade and what it came to.</summary>
internal sealed record TradeRow(string Time, string Symbol, string Side, string Quantity, string Entry, string Exit, string Pnl, string PnlPercent, int Tone)
{
    public bool IsGood => Tone > 0;

    public bool IsBad => Tone < 0;

    public bool IsLong => Side == "long";

    public bool IsShort => Side == "short";

    public string SideLabel => Side.ToUpperInvariant();
}

/// <summary>What a signal was worth on past prices. The tone stays neutral while there are too few cases to say.</summary>
internal sealed record PatternItem(string Name, string Rate, string Average, string Cases, int Tone)
{
    public bool IsGood => Tone > 0;

    public bool IsBad => Tone < 0;
}

/// <summary>A named figure: an indicator and its value.</summary>
internal sealed record FigureRow(string Label, string Value, int Tone = 0)
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
    private readonly AppNavigator? _navigator;

    public DashboardViewModel(
        IOkxReader okx,
        TradeRepository trades,
        AgentTaskRepository tasks,
        ISettingsStore settings,
        TimeProvider time,
        Action<Action>? post = null,
        AppNavigator? navigator = null)
    {
        _okx = okx;
        _trades = trades;
        _tasks = tasks;
        _settings = settings;
        _time = time;
        _post = post ?? (action => Dispatcher.UIThread.Post(action));
        _navigator = navigator;
        ShowLocal();
    }

    public override string Title => "Dashboard";

    public override bool UsesCards => true;

    public ObservableCollection<HoldingRow> Assets { get; } = [];

    public ObservableCollection<PositionRow> Positions { get; } = [];

    public ObservableCollection<OrderItem> RecentOrders { get; } = [];

    /// <summary>The account's value in US dollars, or a dash while it is not known.</summary>
    [ObservableProperty]
    public partial string Equity { get; set; } = "–";

    /// <summary>Demo or live, and what went wrong with the last request, if anything.</summary>
    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    /// <summary>"Demo trading" or "LIVE trading".</summary>
    [ObservableProperty]
    public partial string Mode { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool IsLive { get; set; }

    /// <summary>What went wrong with the last request to OKX; empty when nothing did.</summary>
    [ObservableProperty]
    public partial string Problem { get; set; } = string.Empty;

    /// <summary>True until OKX has answered once, or failed to.</summary>
    [ObservableProperty]
    public partial bool IsLoading { get; set; } = true;

    /// <summary>What the open positions are ahead or behind by, together.</summary>
    [ObservableProperty]
    public partial string UnrealizedPnl { get; set; } = "–";

    /// <summary>The same as a share of the account's value, in percent. Empty while the account is not known.</summary>
    [ObservableProperty]
    public partial double? UnrealizedChange { get; set; }

    [ObservableProperty]
    public partial string WinRate { get; set; } = "—";

    [ObservableProperty]
    public partial string WinRateLine { get; set; } = string.Empty;

    [ObservableProperty]
    public partial MetricTone WinRateTone { get; set; } = MetricTone.Neutral;

    /// <summary>What the trades closed in the last 30 days came to.</summary>
    [ObservableProperty]
    public partial string Realized { get; set; } = "—";

    [ObservableProperty]
    public partial MetricTone RealizedTone { get; set; } = MetricTone.Neutral;

    [ObservableProperty]
    public partial string RealizedLine { get; set; } = string.Empty;

    /// <summary>The running total of what the closed trades came to, oldest first.</summary>
    [ObservableProperty]
    public partial IReadOnlyList<ChartPoint> EquityCurve { get; set; } = [];

    [ObservableProperty]
    public partial bool HasCurve { get; set; }

    [ObservableProperty]
    public partial string PnlDay { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string PnlWeek { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string PnlMonth { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string TaskLine { get; set; } = string.Empty;

    /// <summary>How many scheduled tasks are active, as "1 of 3 active".</summary>
    [ObservableProperty]
    public partial string TasksActive { get; set; } = string.Empty;

    /// <summary>The task that runs next and when, or "None".</summary>
    [ObservableProperty]
    public partial string NextRun { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool EmergencyStop { get; set; }

    [ObservableProperty]
    public partial bool HasPositions { get; set; }

    [ObservableProperty]
    public partial bool HasAssets { get; set; }

    [ObservableProperty]
    public partial bool HasOrders { get; set; }

    /// <summary>True when the app has nothing to show yet: no trade, no order, no position.</summary>
    [ObservableProperty]
    public partial bool IsFirstRun { get; set; }

    public bool HasProblem => Problem.Length > 0;

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
                    Assets.Add(new HoldingRow(asset.Currency, Money.Number(asset.Equity), Money.Number(asset.Available), "$" + Money.Amount(asset.EquityUsd)));
                }

                Positions.Clear();
                var unrealized = 0m;
                foreach (var position in positions.Where(position => position.Size != 0))
                {
                    unrealized += position.UnrealizedPnl;
                    Positions.Add(new PositionRow(
                        position.InstrumentId,
                        position.Side,
                        Money.Number(position.Size),
                        Money.Number(position.AveragePrice),
                        Money.Number(position.MarkPrice),
                        Money.Signed((double)position.UnrealizedPnl),
                        $"{position.Leverage:0.#}x",
                        Math.Sign(position.UnrealizedPnl)));
                }

                UnrealizedPnl = Money.SignedUsd((double)unrealized);
                UnrealizedChange = balance.TotalEquityUsd > 0 ? (double)(unrealized / balance.TotalEquityUsd * 100) : null;
                HasPositions = Positions.Count > 0;
                HasAssets = Assets.Count > 0;
                Status = mode;
                Problem = string.Empty;
                IsLoading = false;
                ShowLocal();
            });
        }
        catch (Exception ex) when (Money.IsExchangeProblem(ex))
        {
            _post(() =>
            {
                Status = $"{mode}. {Money.Problem(ex)}";
                Problem = Money.Problem(ex);
                IsLoading = false;
                ShowLocal();
            });
        }
    }

    /// <summary>Opens the chat, to ask the agent something.</summary>
    [RelayCommand]
    private void AskAgent() => _navigator?.OpenPage("Chat");

    /// <summary>Opens another page by its title: the steps of the welcome card.</summary>
    [RelayCommand]
    private void OpenPage(string title) => _navigator?.OpenPage(title);

    partial void OnProblemChanged(string value) => OnPropertyChanged(nameof(HasProblem));

    /// <summary>What needs no request to OKX: the closed trades, the newest orders, the tasks, the emergency stop.</summary>
    private void ShowLocal()
    {
        var now = _time.GetUtcNow();
        var day = _trades.RealizedSince(now.AddDays(-1).ToUnixTimeMilliseconds());
        var week = _trades.RealizedSince(now.AddDays(-7).ToUnixTimeMilliseconds());
        var month = _trades.RealizedSince(now.AddDays(-30).ToUnixTimeMilliseconds());
        PnlDay = Line(day);
        PnlWeek = Line(week);
        PnlMonth = Line(month);
        Realized = month.Trades == 0 ? "—" : Money.SignedUsd(month.Pnl);
        RealizedTone = month.Trades == 0 ? MetricTone.Neutral : month.Pnl >= 0 ? MetricTone.Success : MetricTone.Error;
        RealizedLine = $"24 h: {Short(day)} · 7 days: {Short(week)}";

        var all = _trades.RealizedSince(0);
        var rate = all.Trades == 0 ? 0 : all.Wins * 100.0 / all.Trades;
        WinRate = all.Trades == 0 ? "—" : string.Create(CultureInfo.CurrentCulture, $"{rate:0.0}%");
        WinRateLine = all.Trades == 0 ? "No trades yet" : $"{all.Wins} of {all.Trades} trades";
        WinRateTone = all.Trades == 0 ? MetricTone.Neutral : rate >= 50 ? MetricTone.Success : MetricTone.Warning;

        var total = 0.0;
        var curve = new List<ChartPoint>();
        foreach (var trade in _trades.ListTrades(300).OrderBy(trade => trade.ClosedAt ?? 0))
        {
            total += trade.RealizedPnl ?? 0;
            curve.Add(new ChartPoint(trade.ClosedAt ?? 0, total));
        }

        EquityCurve = curve;
        HasCurve = curve.Count > 0;

        var live = !_settings.GetValue(SettingKeys.OkxSandbox);
        IsLive = live;
        Mode = live ? "LIVE trading" : "Demo trading";
        EmergencyStop = _settings.GetValue(SettingKeys.EmergencyStopActive);

        RecentOrders.Clear();
        foreach (var order in _trades.ListOrders(8))
        {
            RecentOrders.Add(OrdersViewModel.ToRow(order));
        }

        HasOrders = RecentOrders.Count > 0;

        var tasks = _tasks.List();
        var active = tasks.Count(task => task.Status == AgentTask.Active);
        var next = tasks.Where(task => task.Status == AgentTask.Active && task.NextRunAt is not null).MinBy(task => task.NextRunAt);
        TaskLine = tasks.Count == 0
            ? "No scheduled tasks."
            : $"{active} of {tasks.Count} tasks active." + (next is null ? string.Empty : $" Next: {next.Name}, {Display.Time(next.NextRunAt)}.");
        TasksActive = tasks.Count == 0 ? "None" : $"{active} of {tasks.Count} active";
        NextRun = next is null ? "None" : $"{next.Name}, {Display.Time(next.NextRunAt)}";

        IsFirstRun = !IsLoading && !HasCurve && !HasOrders && !HasPositions;
    }

    private static string Line(PnlSummary summary) =>
        summary.Trades == 0 ? "no closed trades" : $"{Money.Signed(summary.Pnl)} · {summary.Wins} of {summary.Trades} won";

    private static string Short(PnlSummary summary) => summary.Trades == 0 ? "—" : Money.Signed(summary.Pnl);
}

/// <summary>The Trading page: the price chart of one instrument with its figures.</summary>
internal sealed partial class TradingViewModel : PageViewModel, IDisposable
{
    /// <summary>How many closes the small chart under the price shows.</summary>
    private const int SparkBars = 48;

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

    public override bool UsesCards => true;

    public IReadOnlyList<string> Timeframes { get; } = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

    /// <summary>Trend, RSI, averages and ATR on the chosen timeframe, one figure a row.</summary>
    public ObservableCollection<FigureRow> IndicatorRows { get; } = [];

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

    /// <summary>The instrument the figures are of; it changes only when OKX has answered for it.</summary>
    [ObservableProperty]
    public partial string Shown { get; set; } = "BTC-USDT";

    /// <summary>What is traded and what it is paid in, as "BTC / USDT".</summary>
    [ObservableProperty]
    public partial string Pair { get; set; } = "BTC / USDT";

    /// <summary>The first letter of what is traded, for its round badge.</summary>
    [ObservableProperty]
    public partial string Initial { get; set; } = "B";

    [ObservableProperty]
    public partial bool HasTicker { get; set; }

    /// <summary>True when the price history is too short to work the indicators out.</summary>
    [ObservableProperty]
    public partial bool LacksIndicators { get; set; }

    [ObservableProperty]
    public partial string Last { get; set; } = "–";

    [ObservableProperty]
    public partial string Change { get; set; } = string.Empty;

    /// <summary>The newest closes of the chosen timeframe, oldest first.</summary>
    [ObservableProperty]
    public partial IReadOnlyList<double> Closes { get; set; } = [];

    /// <summary>Where the price stands between the day's low (0) and high (100).</summary>
    [ObservableProperty]
    public partial double RangePosition { get; set; } = 50;

    [ObservableProperty]
    public partial string RangeText { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Low { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string High { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Volume { get; set; } = string.Empty;

    /// <summary>The gap between the best offer to sell and the best offer to buy.</summary>
    [ObservableProperty]
    public partial string Spread { get; set; } = "-";

    [ObservableProperty]
    public partial string SpreadPercent { get; set; } = string.Empty;

    public bool IsRising => PriceTone > 0;

    public bool IsFalling => PriceTone < 0;

    /// <summary>True when the price is in the upper half of the day's range.</summary>
    public bool IsHighInRange => RangePosition >= 50;

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
                var change = string.Create(CultureInfo.CurrentCulture, $"{(ticker.ChangePercent24h > 0 ? "+" : string.Empty)}{ticker.ChangePercent24h:0.00}");
                Price = $"{Money.Number(ticker.Last)}   {change} %";
                PriceTone = Math.Sign(ticker.ChangePercent24h);
                Day = $"24 h: low {Money.Number(ticker.Low24h)}, high {Money.Number(ticker.High24h)}, volume {Money.Number(ticker.Volume24h)}";
                Indicators = snapshot is null
                    ? "Not enough price history for the indicators."
                    : string.Create(
                        CultureInfo.CurrentCulture,
                        $"{timeframe}: trend {Word(snapshot.Trend)} · RSI {snapshot.Rsi14:0.0} · SMA 20 {Money.Number(snapshot.Sma20)} · SMA 50 {Money.Number(snapshot.Sma50)} · ATR {snapshot.AtrPercent:0.00} %");
                ShowFigures(symbol, timeframe, ticker, candles, snapshot, change);
                Status = string.Empty;
            });
        }
        catch (Exception ex) when (Money.IsExchangeProblem(ex))
        {
            _post(() => Status = Money.Problem(ex));
        }
    }

    /// <summary>Sorts candles oldest first, whatever order they came in.</summary>
    private static IEnumerable<Candle> OldestFirst(IReadOnlyList<Candle> candles) => candles.OrderBy(candle => candle.OpenTime);

    private static string Word(Trend trend) => trend.ToString().ToLowerInvariant();

    /// <summary>The same figures as the lines of text, one by one for the cards of the page.</summary>
    private void ShowFigures(string symbol, string timeframe, Ticker ticker, IReadOnlyList<Candle> candles, TechnicalSnapshot? snapshot, string change)
    {
        var dash = symbol.IndexOf('-', StringComparison.Ordinal);
        var traded = dash > 0 ? symbol[..dash] : symbol;
        var rest = dash > 0 ? symbol[(dash + 1)..] : string.Empty;
        var paid = rest.Split('-')[0];
        Shown = symbol;
        Pair = paid.Length == 0 ? traded : $"{traded} / {paid}";
        Initial = traded[..1];
        Last = "$" + Money.Number(ticker.Last);
        Change = change + "%";
        Closes = OldestFirst(candles).TakeLast(SparkBars).Select(candle => (double)candle.Close).ToList();

        var range = ticker.High24h - ticker.Low24h;
        RangePosition = range > 0 ? (double)Math.Clamp((ticker.Last - ticker.Low24h) / range * 100, 0, 100) : 50;
        RangeText = string.Create(CultureInfo.CurrentCulture, $"{RangePosition:0}%");
        Low = "$" + Money.Number(ticker.Low24h);
        High = "$" + Money.Number(ticker.High24h);
        Volume = Money.Compact((double)ticker.Volume24h);

        var spread = ticker.Ask - ticker.Bid;
        var hasBook = ticker is { Ask: > 0, Bid: > 0 } && spread >= 0;
        Spread = hasBook ? "$" + Money.Number(spread) : "-";
        SpreadPercent = hasBook ? string.Create(CultureInfo.CurrentCulture, $"{spread / ticker.Ask * 100:0.000}%") : string.Empty;

        IndicatorRows.Clear();
        if (snapshot is not null)
        {
            var trend = snapshot.Trend == Trend.Bullish ? 1 : snapshot.Trend == Trend.Bearish ? -1 : 0;
            IndicatorRows.Add(new FigureRow($"Trend ({timeframe})", Word(snapshot.Trend), trend));
            IndicatorRows.Add(new FigureRow("RSI 14", string.Create(CultureInfo.CurrentCulture, $"{snapshot.Rsi14:0.0}")));
            IndicatorRows.Add(new FigureRow("SMA 20", Money.Number(snapshot.Sma20)));
            IndicatorRows.Add(new FigureRow("SMA 50", Money.Number(snapshot.Sma50)));
            IndicatorRows.Add(new FigureRow("ATR", string.Create(CultureInfo.CurrentCulture, $"{snapshot.AtrPercent:0.00}%")));
        }

        LacksIndicators = snapshot is null;
        HasTicker = true;
    }

    partial void OnPriceToneChanged(int value)
    {
        OnPropertyChanged(nameof(IsRising));
        OnPropertyChanged(nameof(IsFalling));
    }

    partial void OnRangePositionChanged(double value) => OnPropertyChanged(nameof(IsHighInRange));

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

    public override bool UsesCards => true;

    public ObservableCollection<OrderItem> Orders { get; } = [];

    public IReadOnlyList<string> Statuses { get; } = [AllStatuses, "open", "partially_filled", "filled", "cancelled", "rejected", "expired"];

    [ObservableProperty]
    public partial string Filter { get; set; } = AllStatuses;

    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    [ObservableProperty]
    public partial bool HasOrders { get; set; }

    /// <summary>True while OKX is being asked.</summary>
    [ObservableProperty]
    public partial bool IsAsking { get; set; }

    /// <summary>How many orders the list shows, as "12 orders".</summary>
    [ObservableProperty]
    public partial string CountLabel { get; set; } = string.Empty;

    public override void Activate() => Reload();

    /// <summary>Asks OKX for the orders now, instead of waiting for the next pass of the mirror.</summary>
    [RelayCommand]
    public async Task RefreshAsync()
    {
        Status = "Asking OKX…";
        IsAsking = true;
        try
        {
            var pass = await Task.Run(() => _mirror.RunOnceAsync(CancellationToken.None)).ConfigureAwait(false);
            _post(() =>
            {
                Reload();
                IsAsking = false;
                Status = !pass.Asked ? "No OKX key is saved: there is nothing to ask."
                    : pass.RateLimited ? "OKX asked to slow down. Try again in a moment."
                    : $"{pass.Added} new, {pass.Changed} changed.";
            });
        }
        catch (Exception ex) when (Money.IsExchangeProblem(ex))
        {
            _post(() =>
            {
                IsAsking = false;
                Status = Money.Problem(ex);
            });
        }
    }

    internal static OrderItem ToRow(OrderRow order) => new(
        Display.Time(order.CreatedAt),
        order.Symbol,
        order.Side + (order.IsAlgo ? " (algo)" : string.Empty),
        order.OrderType.Replace('_', ' '),
        Money.Number(order.Quantity),
        Money.Number(order.FilledQuantity),
        order.AverageFillPrice is { } average ? Money.Number(average) : order.Price is { } price ? Money.Number(price) : "market",
        order.Status.Replace('_', ' '),
        order.Status);

    partial void OnFilterChanged(string value) => Reload();

    private void Reload()
    {
        Orders.Clear();
        foreach (var order in _trades.ListOrders(300, Filter == AllStatuses ? null : Filter))
        {
            Orders.Add(ToRow(order));
        }

        HasOrders = Orders.Count > 0;
        CountLabel = Orders.Count == 1 ? "1 order" : $"{Orders.Count} orders";
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

    public override bool UsesCards => true;

    public ObservableCollection<TradeRow> Trades { get; } = [];

    public ObservableCollection<PatternItem> Patterns { get; } = [];

    [ObservableProperty]
    public partial string Summary { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Status { get; set; } = string.Empty;

    /// <summary>What all closed trades came to together.</summary>
    [ObservableProperty]
    public partial string TotalPnl { get; set; } = "+$0.00";

    [ObservableProperty]
    public partial bool IsAhead { get; set; } = true;

    [ObservableProperty]
    public partial string TotalLine { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string WinRate { get; set; } = "0.0%";

    [ObservableProperty]
    public partial string WinLine { get; set; } = string.Empty;

    [ObservableProperty]
    public partial MetricTone WinTone { get; set; } = MetricTone.Warning;

    [ObservableProperty]
    public partial string TradeCount { get; set; } = "0";

    [ObservableProperty]
    public partial string AverageLine { get; set; } = string.Empty;

    [ObservableProperty]
    public partial string Best { get; set; } = "+$0.00";

    [ObservableProperty]
    public partial string WorstLine { get; set; } = string.Empty;

    /// <summary>Green when the winning trades made more than the losing ones lost.</summary>
    [ObservableProperty]
    public partial MetricTone BestTone { get; set; } = MetricTone.Warning;

    /// <summary>What each closed trade came to, oldest first.</summary>
    [ObservableProperty]
    public partial IReadOnlyList<ChartPoint> PnlBars { get; set; } = [];

    [ObservableProperty]
    public partial bool HasTrades { get; set; }

    [ObservableProperty]
    public partial bool HasPatterns { get; set; }

    /// <summary>True while past signals are measured.</summary>
    [ObservableProperty]
    public partial bool IsMining { get; set; }

    public MetricTone TotalTone => IsAhead ? MetricTone.Success : MetricTone.Error;

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
        IsMining = true;
        var stored = await Task.Run(() => _miner.RunOnceAsync(CancellationToken.None)).ConfigureAwait(false);
        _post(() =>
        {
            Reload();
            IsMining = false;
            Status = stored == 0 ? "No pattern had enough cases, or the prices could not be read." : $"{stored} patterns measured.";
        });
    }

    partial void OnIsAheadChanged(bool value) => OnPropertyChanged(nameof(TotalTone));

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

        var closed = _trades.ListTrades(300);
        Trades.Clear();
        foreach (var trade in closed)
        {
            var pnl = trade.RealizedPnl ?? 0;
            Trades.Add(new TradeRow(
                Display.Time(trade.ClosedAt),
                trade.Symbol,
                trade.Side == "sell" ? "long" : "short",
                Money.Number(trade.FilledQuantity),
                Money.Number(trade.EntryPrice ?? 0),
                Money.Number(trade.AverageFillPrice ?? 0),
                Money.SignedUsd(pnl),
                string.Create(CultureInfo.CurrentCulture, $"{trade.RealizedPnlPercent ?? 0:+0.00;-0.00;0.00} %"),
                Math.Sign(pnl)));
        }

        ShowTotals(closed, _trades.RealizedSince(0), _trades.RealizedSince(now.AddDays(-30).ToUnixTimeMilliseconds()));

        Patterns.Clear();
        foreach (var pattern in _trades.ListPatterns())
        {
            Patterns.Add(new PatternItem(
                pattern.Name,
                $"{pattern.SuccessRate * 100:0} % higher after {PatternMiner.Horizon} bars",
                $"{pattern.AverageReturn:+0.00;-0.00;0.00} % on average",
                $"{pattern.SampleCount} cases",
                pattern.SampleCount < 10 ? 0 : Math.Sign(pattern.AverageReturn)));
        }

        HasTrades = Trades.Count > 0;
        HasPatterns = Patterns.Count > 0;
        Status = Trades.Count == 0 ? "No closed trades yet. A trade appears here when an order closes a position the app saw opened." : string.Empty;
    }

    /// <summary>The four tiles and the chart. The totals count every closed trade; best, worst and the chart the newest 300.</summary>
    private void ShowTotals(IReadOnlyList<OrderRow> closed, PnlSummary all, PnlSummary month)
    {
        var results = closed.Select(trade => trade.RealizedPnl ?? 0).ToList();
        var won = results.Where(pnl => pnl > 0).Sum();
        var lost = -results.Where(pnl => pnl < 0).Sum();
        var rate = all.Trades == 0 ? 0 : all.Wins * 100.0 / all.Trades;

        TotalPnl = Money.SignedUsd(all.Pnl);
        IsAhead = all.Pnl >= 0;
        TotalLine = month.Trades == 0 ? "30 days: no closed trades" : $"30 days: {Money.SignedUsd(month.Pnl)}";
        WinRate = string.Create(CultureInfo.CurrentCulture, $"{rate:0.0}%");
        WinLine = $"{all.Wins}W / {all.Trades - all.Wins}L";
        WinTone = rate >= 50 ? MetricTone.Success : MetricTone.Warning;
        TradeCount = all.Trades.ToString(CultureInfo.CurrentCulture);
        AverageLine = $"Avg: {Money.SignedUsd(all.Trades == 0 ? 0 : all.Pnl / all.Trades)}";
        Best = Money.SignedUsd(results.Count == 0 ? 0 : results.Max());
        WorstLine = $"Worst: {Money.SignedUsd(results.Count == 0 ? 0 : results.Min())}";
        // The winners made at least what the losers lost.
        BestTone = results.Count > 0 && won >= lost ? MetricTone.Success : MetricTone.Warning;
        PnlBars = closed.OrderBy(trade => trade.ClosedAt ?? 0).Select(trade => new ChartPoint(trade.ClosedAt ?? 0, trade.RealizedPnl ?? 0)).ToList();
    }
}
