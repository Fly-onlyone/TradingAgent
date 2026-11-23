using System.Collections.Frozen;

namespace TradingAgent.Agent.Atk;

/// <summary>What a tool of the OKX Agent Trade Kit does to the account. The risk gate decides by it.</summary>
public enum AtkToolKind
{
    /// <summary>Not in the inventory. Never shown to a model and never called.</summary>
    Unknown,

    /// <summary>Reads only.</summary>
    Read,

    /// <summary>Places or changes an order, a position or a trading bot.</summary>
    Place,

    /// <summary>Cancels an order or stops a bot.</summary>
    Cancel,

    /// <summary>Moves funds between accounts.</summary>
    Transfer,

    /// <summary>Changes leverage.</summary>
    Leverage,
}

/// <summary>
/// The tools of the OKX Agent Trade Kit this app uses, and what each one does. This list is an
/// allowlist: a tool that is not on it does not exist for the agent.
/// </summary>
/// <remarks>
/// The trade kit is a separate program that gains and renames tools between versions. If a tool were
/// shown to the model because the kit offers it, a new way to move money could appear without anyone
/// having decided how it is checked. So a tool must be added here, with its kind, before the agent can
/// use it; a tool the kit offers that is missing here is hidden and logged.
/// <para>
/// The names are those the kit of version <see cref="AtkCommandResolver.PinnedVersion"/> reports for
/// the modules in <see cref="DefaultModules"/>, read from the running kit and kept as a test fixture.
/// The test fails when this list and the fixture disagree, and when a tool the kit marks as writing is
/// listed here as reading. To move to another kit version: regenerate the fixture, then make that test pass.
/// </para>
/// <para>
/// To add a write tool: put it in the inventory with the right kind, check that the risk gate's rule
/// for that kind fits its arguments, and add a test.
/// </para>
/// </remarks>
public static class AtkToolCatalog
{
    /// <summary>Prefix of the names the model sees, so trade kit tools cannot collide with the app's own.</summary>
    public const string Prefix = "okx_";

    /// <summary>The trade kit modules that are switched on. Each module is a group of tools.</summary>
    public const string DefaultModules = "market,account,spot,swap,bot.grid,bot.dca,news,smartmoney";

    private static readonly FrozenDictionary<string, AtkToolKind> _tools = Build();

    /// <summary>
    /// Tools the kit offers that this app decided not to use. Listed so that hiding them is not
    /// reported as a surprise each time the kit starts.
    /// </summary>
    private static readonly FrozenSet<string> _excluded = FrozenSet.ToFrozenSet(
    [
        // Switches the whole account between net and long/short positions. Every open position and
        // every later order is read differently afterwards; that is a decision for the user, in OKX.
        "account_set_position_mode",
    ],
    StringComparer.Ordinal);

    /// <summary>Every tool name of the inventory, without prefix.</summary>
    public static IEnumerable<string> Names => _tools.Keys;

    /// <summary>The kind of a tool by its trade kit name; <see cref="AtkToolKind.Unknown"/> when it is not in the inventory.</summary>
    public static AtkToolKind Kind(string toolName) => _tools.GetValueOrDefault(toolName, AtkToolKind.Unknown);

    /// <summary>True for a tool that is left out on purpose, as opposed to one nobody has looked at.</summary>
    public static bool IsExcluded(string toolName) => _excluded.Contains(toolName);

    public static bool IsWrite(AtkToolKind kind) => kind is AtkToolKind.Place or AtkToolKind.Cancel or AtkToolKind.Transfer or AtkToolKind.Leverage;

    /// <summary>The name the model sees for a trade kit tool.</summary>
    public static string ModelName(string toolName) => Prefix + toolName;

    /// <summary>The trade kit name behind a model-facing name, or null when the name is not a trade kit tool's.</summary>
    public static string? ToolName(string modelName) =>
        modelName.StartsWith(Prefix, StringComparison.Ordinal) ? modelName[Prefix.Length..] : null;

    private static FrozenDictionary<string, AtkToolKind> Build()
    {
        var tools = new Dictionary<string, AtkToolKind>(StringComparer.Ordinal);

        void Add(AtkToolKind kind, params ReadOnlySpan<string> names)
        {
            foreach (var name in names)
            {
                tools.Add(name, kind);
            }
        }

        // market
        Add(
            AtkToolKind.Read,
            "market_get_ticker", "market_get_tickers", "market_get_orderbook", "market_get_candles", "market_get_instruments",
            "market_get_funding_rate", "market_get_mark_price", "market_get_trades", "market_get_index_ticker",
            "market_get_index_candles", "market_get_price_limit", "market_get_open_interest", "market_get_stock_tokens",
            "market_get_instruments_by_category", "market_filter", "market_get_oi_history", "market_filter_oi_change",
            "market_get_indicator", "market_list_indicators");

        // account
        Add(
            AtkToolKind.Read,
            "account_get_balance", "account_get_max_size", "account_get_asset_balance", "account_get_bills",
            "account_get_positions_history", "account_get_trade_fee", "account_get_config", "account_get_max_withdrawal",
            "account_get_max_avail_size", "account_get_positions", "account_get_bills_archive");
        Add(AtkToolKind.Transfer, "account_transfer");

        // spot
        Add(AtkToolKind.Read, "spot_get_orders", "spot_get_algo_orders", "spot_get_fills", "spot_get_order");
        Add(
            AtkToolKind.Place,
            "spot_place_order", "spot_amend_order", "spot_place_algo_order", "spot_amend_algo_order",
            // Places, amends or cancels by its "action" argument; held to the strictest of the three.
            "spot_batch_orders", "spot_batch_amend");
        Add(AtkToolKind.Cancel, "spot_cancel_order", "spot_cancel_algo_order", "spot_batch_cancel");
        Add(AtkToolKind.Leverage, "spot_set_leverage");

        // swap
        Add(
            AtkToolKind.Read,
            "swap_get_order", "swap_get_orders", "swap_get_positions", "swap_get_fills", "swap_get_leverage", "swap_get_algo_orders");
        Add(
            AtkToolKind.Place,
            "swap_place_order", "swap_close_position", "swap_place_algo_order", "swap_amend_algo_order",
            "swap_place_move_stop_order",
            // As spot_batch_orders.
            "swap_batch_orders", "swap_batch_amend");
        Add(AtkToolKind.Cancel, "swap_cancel_order", "swap_cancel_algo_orders", "swap_batch_cancel");
        Add(AtkToolKind.Leverage, "swap_set_leverage");

        // bot.grid and bot.dca
        Add(
            AtkToolKind.Read,
            "grid_get_orders", "grid_get_order_details", "grid_get_sub_orders", "dca_get_orders", "dca_get_order_details",
            "dca_get_sub_orders");
        // grid_amend_order can add funds to a running bot (topUpAmt), so it is not a harmless edit.
        Add(AtkToolKind.Place, "grid_create_order", "grid_amend_order", "dca_create_order");
        Add(AtkToolKind.Cancel, "grid_stop_order", "dca_stop_order");

        // news
        Add(
            AtkToolKind.Read,
            "news_get_latest", "news_get_by_coin", "news_search", "news_get_detail", "news_get_coin_sentiment",
            "news_get_sentiment_ranking", "news_get_domains");

        // smartmoney
        Add(
            AtkToolKind.Read,
            "smartmoney_get_traders_by_filter", "smartmoney_get_performance_by_trader", "smartmoney_get_trader_positions",
            "smartmoney_get_trader_positions_history", "smartmoney_get_trader_orders_history", "smartmoney_search_trader",
            "smartmoney_get_signal_overview_by_filter", "smartmoney_get_signal_overview_by_trader",
            "smartmoney_get_signal_trend_by_filter", "smartmoney_get_signal_trend_by_trader");

        // Offered with every module set.
        Add(AtkToolKind.Read, "trade_get_history", "system_get_capabilities");

        return tools.ToFrozenDictionary(StringComparer.Ordinal);
    }
}
