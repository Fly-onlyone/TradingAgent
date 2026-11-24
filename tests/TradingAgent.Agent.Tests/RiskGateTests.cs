using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Tools;
using TradingAgent.Core;
using TradingAgent.Core.Agent;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Agent;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;
using TradingAgent.Exchange.Risk;
using Xunit;

namespace TradingAgent.Agent.Tests;

/// <summary>
/// The account of these tests has 10,000 US dollars and the default position limit of 5 %, so a trade
/// of more than 500 dollars is over the limit. BTC costs 50,000.
/// </summary>
public sealed partial class RiskGateTests : IDisposable
{
    private readonly TempDatabase _temp = new();
    private readonly FakeExchange _exchange = new();
    private readonly FakeSettings _settings = new();
    private readonly OrderStubRepository _orders;
    private readonly RiskGate _gate;
    private readonly ToolContext _context;

    public RiskGateTests()
    {
        _orders = new OrderStubRepository(_temp.Database, TimeProvider.System);
        _gate = NewGate(_settings);
        var session = new AgentSessionRepository(_temp.Database, TimeProvider.System).Create();
        var message = new SessionMessageRepository(_temp.Database, TimeProvider.System).Append(session.Id, MessageRole.Assistant, string.Empty, MessageStatus.Running);
        _context = new ToolContext(session.Id, message.Id, "toolu_01");
    }

    private static CancellationToken Ct => TestContext.Current.CancellationToken;

    public void Dispose() => _temp.Dispose();

    // ---- which tools the gate decides about ----

    [Theory]
    [InlineData("withdraw_everything")]
    [InlineData("account_set_position_mode")]
    [InlineData("market_get_ticker")]
    [InlineData("")]
    public async Task A_tool_that_is_not_a_write_of_the_inventory_is_refused(string tool)
    {
        var decision = await Check(tool, """{"instId":"BTC-USDT"}""");

        Assert.False(decision.Allowed);
    }

    [Fact]
    public async Task Every_writing_tool_without_a_rule_is_refused()
    {
        var withoutRule = AtkToolCatalog.Names
            .Where(name => AtkToolCatalog.IsWrite(AtkToolCatalog.Kind(name)) && !AtkToolCatalog.IsSupportedWrite(name))
            .ToList();

        foreach (var tool in withoutRule)
        {
            var decision = await Check(tool, """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"1","algoId":"1","orders":[]}""");
            Assert.False(decision.Allowed);
            Assert.Contains("not supported", decision.Reason, StringComparison.Ordinal);
        }

        // Amend, algo, batch, close-position and the bots.
        Assert.Equal(14, withoutRule.Count);
        Assert.Contains("grid_create_order", withoutRule);
        Assert.Contains("dca_create_order", withoutRule);
        Assert.Contains("swap_close_position", withoutRule);
        Assert.Contains("spot_batch_orders", withoutRule);
    }

    [Theory]
    [InlineData("[1,2]")]
    [InlineData("\"text\"")]
    [InlineData("null")]
    [InlineData("42")]
    public async Task Arguments_that_are_not_an_object_are_refused(string input)
    {
        Assert.False((await Check("spot_cancel_order", input)).Allowed);
    }

    [Fact]
    public async Task An_argument_given_twice_is_refused()
    {
        // The first size is small, the second is not. Nobody should have to guess which one counts.
        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"10","sz":"100000"}""");

        Assert.False(decision.Allowed);
        Assert.Contains("twice", decision.Reason, StringComparison.Ordinal);
    }

    // ---- cancel ----

    [Theory]
    [InlineData("spot_cancel_order")]
    [InlineData("spot_cancel_algo_order")]
    [InlineData("spot_batch_cancel")]
    [InlineData("swap_cancel_order")]
    [InlineData("swap_cancel_algo_orders")]
    [InlineData("swap_batch_cancel")]
    [InlineData("grid_stop_order")]
    [InlineData("dca_stop_order")]
    public async Task Cancelling_is_allowed_with_the_arguments_untouched(string tool)
    {
        var decision = await Check(tool, """{"instId":"BTC-USDT","ordId":"123"}""");

        Assert.True(decision.Allowed);
        Assert.Null(decision.Input);
        Assert.Equal(0, _exchange.BalanceReads);
    }

    // ---- emergency stop ----

    [Theory]
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"10"}""")]
    [InlineData("swap_place_order", """{"instId":"BTC-USDT-SWAP","side":"buy","ordType":"market","sz":"1"}""")]
    [InlineData("account_transfer", """{"ccy":"USDT","amt":"10","from":"6","to":"18"}""")]
    [InlineData("swap_set_leverage", """{"instId":"BTC-USDT-SWAP","lever":"2","mgnMode":"cross"}""")]
    public async Task Emergency_stop_refuses_everything_that_is_not_a_cancel(string tool, string input)
    {
        Assert.True((await Check(tool, input, toolUseId: "toolu_before")).Allowed);
        _settings.SetValue(SettingKeys.EmergencyStopActive, true);

        var decision = await Check(tool, input, toolUseId: "toolu_after");

        Assert.False(decision.Allowed);
        Assert.Contains("Emergency stop", decision.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Emergency_stop_still_lets_orders_be_cancelled()
    {
        _settings.SetValue(SettingKeys.EmergencyStopActive, true);

        Assert.True((await Check("swap_cancel_order", """{"instId":"BTC-USDT-SWAP","ordId":"1"}""")).Allowed);
    }

    // ---- leverage ----

    [Theory]
    [InlineData("\"1\"")]
    [InlineData("\"3\"")]
    [InlineData("\"10\"")]
    [InlineData("5")]
    [InlineData("\"3.0\"")]
    public async Task Leverage_from_one_to_ten_is_allowed(string lever)
    {
        Assert.True((await Check("swap_set_leverage", $$"""{"instId":"BTC-USDT-SWAP","lever":{{lever}},"mgnMode":"cross"}""")).Allowed);
    }

    [Theory]
    [InlineData("\"11\"")]
    [InlineData("\"100\"")]
    [InlineData("\"0\"")]
    [InlineData("\"-3\"")]
    [InlineData("\"2.5\"")]
    [InlineData("\"ten\"")]
    [InlineData("\"1e1\"")]
    [InlineData("\"\"")]
    [InlineData("null")]
    [InlineData("true")]
    public async Task Leverage_outside_that_or_not_a_whole_number_is_refused(string lever)
    {
        Assert.False((await Check("spot_set_leverage", $$"""{"instId":"BTC-USDT","lever":{{lever}},"mgnMode":"cross"}""")).Allowed);
    }

    [Fact]
    public async Task Leverage_without_the_argument_is_refused()
    {
        Assert.False((await Check("swap_set_leverage", """{"instId":"BTC-USDT-SWAP","mgnMode":"cross"}""")).Allowed);
    }

    // ---- transfer ----

    [Theory]
    [InlineData("""{"ccy":"USDT","amt":"500","from":"6","to":"18"}""")]
    [InlineData("""{"ccy":"USDC","amt":"1000","from":"18","to":"6"}""")]
    [InlineData("""{"ccy":"USDT","amt":0.5,"from":6,"to":18,"type":"0"}""")]
    public async Task A_small_stablecoin_transfer_between_the_users_own_two_accounts_is_allowed(string input)
    {
        Assert.True((await Check("account_transfer", input)).Allowed);
    }

    [Theory]
    [InlineData("""{"ccy":"XRP","amt":"10","from":"6","to":"18"}""", "USDT and USDC")]
    [InlineData("""{"ccy":"BTC","amt":"0.01","from":"6","to":"18"}""", "USDT and USDC")]
    [InlineData("""{"ccy":"usdt","amt":"10","from":"6","to":"18"}""", "USDT and USDC")]
    [InlineData("""{"amt":"10","from":"6","to":"18"}""", "USDT and USDC")]
    [InlineData("""{"ccy":"USDT","amt":"1000.01","from":"6","to":"18"}""", "limit")]
    [InlineData("""{"ccy":"USDT","amt":"5000","from":"6","to":"18"}""", "limit")]
    [InlineData("""{"ccy":"USDT","amt":"0","from":"6","to":"18"}""", "more than zero")]
    [InlineData("""{"ccy":"USDT","amt":"-50","from":"6","to":"18"}""", "plain number")]
    [InlineData("""{"ccy":"USDT","amt":"NaN","from":"6","to":"18"}""", "plain number")]
    [InlineData("""{"ccy":"USDT","amt":"Infinity","from":"6","to":"18"}""", "plain number")]
    [InlineData("""{"ccy":"USDT","amt":"1e2","from":"6","to":"18"}""", "plain number")]
    [InlineData("""{"ccy":"USDT","from":"6","to":"18"}""", "plain number")]
    [InlineData("""{"ccy":"USDT","amt":"10","from":"6","to":"6"}""", "funding account")]
    [InlineData("""{"ccy":"USDT","amt":"10","from":"18","to":"1"}""", "funding account")]
    [InlineData("""{"ccy":"USDT","amt":"10","to":"18"}""", "funding account")]
    [InlineData("""{"ccy":"USDT","amt":"10","from":"6","to":"18","type":"1","subAcct":"other"}""", "sub-account")]
    [InlineData("""{"ccy":"USDT","amt":"10","from":"6","to":"18","type":"2"}""", "sub-account")]
    [InlineData("""{"ccy":"USDT","amt":"10","from":"6","to":"18","subAcct":"other"}""", "sub-account")]
    public async Task Any_other_transfer_is_refused(string input, string because)
    {
        var decision = await Check("account_transfer", input);

        Assert.False(decision.Allowed);
        Assert.Contains(because, decision.Reason, StringComparison.Ordinal);
    }

    // ---- place: the risk score ----

    [Fact]
    public async Task A_small_order_in_a_calm_market_is_allowed()
    {
        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"100"}""");

        Assert.True(decision.Allowed);
    }

    [Fact]
    public async Task An_order_the_risk_manager_says_to_avoid_is_refused_and_leaves_no_record()
    {
        // Within the size limit, but close to it, bought into a market that is overbought, at the
        // top of its band and swinging hard: 15 + 20 + 15 + 20 points.
        _exchange.Rising = true;
        _exchange.Volatile = true;

        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"450"}""");

        Assert.False(decision.Allowed);
        Assert.StartsWith("Risk check: AVOID (score 70)", decision.Reason, StringComparison.Ordinal);
        Assert.Contains("High volatility", decision.Reason, StringComparison.Ordinal);
        Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    [Fact]
    public async Task The_same_market_allows_an_order_within_the_size_limit()
    {
        _exchange.Rising = true;

        Assert.True((await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"100"}""")).Allowed);
    }

    // ---- place: the hard limit on one position ----

    [Theory]
    [InlineData("500", true)]
    [InlineData("500.01", false)]
    [InlineData("9000", false)]
    public async Task An_order_over_the_position_limit_is_refused_however_calm_the_market(string dollars, bool allowed)
    {
        // The limit is 5 % of 10,000 dollars. The old gate let an order of 9,000 through here: size
        // only added points to a score, never enough of them to refuse.
        var decision = await Check("spot_place_order", $$"""{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"{{dollars}}"}""");

        Assert.Equal(allowed, decision.Allowed);
        if (!allowed)
        {
            Assert.Contains("Your limit for one position is 5%", decision.Reason, StringComparison.Ordinal);
            Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
        }
    }

    [Theory]
    [InlineData("100", true)]
    [InlineData("101", false)]
    public async Task What_is_already_held_counts_toward_the_limit(string dollars, bool allowed)
    {
        // 400 dollars of BTC are held; 100 more is exactly the limit. Ten orders of 4 % must not
        // become a position of 40 %.
        _exchange.Holdings["BTC"] = 400m;

        var decision = await Check("spot_place_order", $$"""{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"{{dollars}}"}""");

        Assert.Equal(allowed, decision.Allowed);
        if (!allowed)
        {
            Assert.Contains("400 USD held, 101 USD ordered", decision.Reason, StringComparison.Ordinal);
        }
    }

    [Fact]
    public async Task Coins_of_another_kind_do_not_count_toward_this_positions_limit()
    {
        _exchange.Holdings["ETH"] = 4000m;

        Assert.True((await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"500"}""")).Allowed);
    }

    [Theory]
    [InlineData("long", 1, false)]
    [InlineData("short", -1, false)]
    [InlineData("net", 0, true)]
    public async Task An_open_swap_position_counts_toward_the_limit_whichever_way_it_points(string side, int contracts, bool allowed)
    {
        // One contract of BTC-USDT-SWAP is 0.01 BTC, 500 dollars: the whole limit on its own.
        _exchange.Positions.Add(new Position("BTC-USDT-SWAP", "SWAP", side, contracts, 49_000m, 50_000m, 0m, 3m));
        _exchange.Positions.Add(new Position("DOGE-USDT-SWAP", "SWAP", "long", 100m, 0.1m, 0.1m, 0m, 3m));

        var decision = await Check("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"buy","ordType":"market","sz":"1"}""");

        Assert.Equal(allowed, decision.Allowed);
    }

    [Fact]
    public async Task The_limit_is_the_users_setting()
    {
        _settings.SetValue(SettingKeys.RiskMaxPositionSizePercent, 20.0);

        Assert.True((await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"2000"}""", "toolu_a")).Allowed);
        Assert.False((await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"2001"}""", "toolu_b")).Allowed);
    }

    [Fact]
    public async Task An_account_without_equity_can_open_nothing()
    {
        _exchange.Equity = 0;

        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"1"}""");

        Assert.False(decision.Allowed);
        Assert.Contains("no equity", decision.Reason, StringComparison.Ordinal);
    }

    // ---- place: orders that only reduce a position ----

    [Theory]
    // Selling coins that are held, 9,000 dollars of them: far over the limit, and the way out.
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"sell","ordType":"market","sz":"0.18"}""")]
    [InlineData("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"sell","ordType":"market","sz":"18","reduceOnly":true}""")]
    [InlineData("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"buy","ordType":"market","sz":"18","reduceOnly":true}""")]
    public async Task An_order_that_only_reduces_a_position_is_let_out_whatever_its_size_and_the_market(string tool, string input)
    {
        // The worst market for a sell by the score: falling would be it; here every rule that can
        // fire is on, and the account cannot even be read.
        _exchange.Rising = true;
        _exchange.Volatile = true;
        _exchange.BalanceFailure = new OkxException(OkxFailure.Network, "OKX did not answer.");

        var decision = await Check(tool, input);

        Assert.True(decision.Allowed);
        // Recorded and tagged like any other order.
        var id = decision.Input!.Value.GetProperty("clOrdId").GetString()!;
        Assert.NotNull(_orders.Find(id));
        Assert.Equal(0, _exchange.BalanceReads);
    }

    [Theory]
    // A spot sell on margin can open a short.
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cross","side":"sell","ordType":"market","sz":"0.18"}""")]
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","tdMode":"isolated","side":"sell","ordType":"market","sz":"0.18"}""")]
    // Not said to be cash: not taken to be.
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","side":"sell","ordType":"market","sz":"0.18"}""")]
    // A buy is never the way out of a spot position.
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"9000","reduceOnly":true}""")]
    // A swap sell without reduceOnly can open a short; "true" as text is not true.
    [InlineData("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"sell","ordType":"market","sz":"18"}""")]
    [InlineData("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"sell","ordType":"market","sz":"18","reduceOnly":false}""")]
    [InlineData("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"sell","ordType":"market","sz":"18","reduceOnly":"true"}""")]
    public async Task An_order_that_could_open_a_position_is_held_to_the_limit(string tool, string input)
    {
        var decision = await Check(tool, input);

        Assert.False(decision.Allowed);
        Assert.Contains("Your limit for one position", decision.Reason, StringComparison.Ordinal);
    }

    [Fact]
    public async Task Emergency_stop_holds_back_a_reducing_order_too()
    {
        // Emergency stop means the agent does nothing but cancel; closing is then the user's own to do.
        _settings.SetValue(SettingKeys.EmergencyStopActive, true);

        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","tdMode":"cash","side":"sell","ordType":"market","sz":"0.18"}""");

        Assert.False(decision.Allowed);
        Assert.Contains("Emergency stop", decision.Reason, StringComparison.Ordinal);
    }

    // ---- place: what the size means ----

    [Theory]
    // A spot market buy is sized in the quote currency unless it says otherwise (OKX's own default).
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}""", 0.002, "quote_ccy")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100","tgtCcy":"quote_ccy"}""", 0.002, "quote_ccy")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"0.004","tgtCcy":"base_ccy"}""", 0.004, "base_ccy")]
    // A spot market sell is sized in coins unless it says otherwise.
    [InlineData("""{"instId":"BTC-USDT","side":"sell","ordType":"market","sz":"0.004"}""", 0.004, "base_ccy")]
    [InlineData("""{"instId":"BTC-USDT","side":"sell","ordType":"market","sz":"100","tgtCcy":"quote_ccy"}""", 0.002, "quote_ccy")]
    // Any other spot order is sized in coins, and tgtCcy is not sent.
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"0.004","px":"50000"}""", 0.004, null)]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"0.004","px":"50000","tgtCcy":"base_ccy"}""", 0.004, null)]
    public async Task A_spot_size_is_read_the_way_okx_reads_it_and_sent_on_saying_so(string input, double quantity, string? unitSent)
    {
        var decision = await Check("spot_place_order", input);

        Assert.True(decision.Allowed);
        var sent = decision.Input!.Value;
        Assert.Equal(unitSent, sent.TryGetProperty("tgtCcy", out var unit) ? unit.GetString() : null);
        var stub = _orders.Find(sent.GetProperty("clOrdId").GetString()!);
        Assert.NotNull(stub);
        Assert.Equal((decimal)quantity, stub.Quantity);
    }

    [Theory]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"100","px":"50000","tgtCcy":"quote_ccy"}""")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100","tgtCcy":"margin"}""")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100","tgtCcy":"USDT"}""")]
    public async Task A_spot_size_unit_okx_would_ignore_or_not_know_is_refused(string input)
    {
        // OKX reads the size of a limit order as coins whatever tgtCcy says: "100 dollars" would
        // become 100 BTC.
        Assert.False((await Check("spot_place_order", input)).Allowed);
    }

    [Theory]
    // A price above the market: 0.01 BTC at 60,000 is 600 dollars.
    [InlineData("buy", "0.01", "60000", true)]
    [InlineData("sell", "0.01", "60000", true)]
    // A price below the market: 0.012 BTC at 40,000 would be 480 dollars, under the limit. It is
    // valued at the market, 600 dollars: never as less than it can turn out.
    [InlineData("buy", "0.012", "40000", true)]
    [InlineData("sell", "0.012", "40000", true)]
    // 0.01 BTC at the market is 500 dollars, exactly the limit and not over it.
    [InlineData("buy", "0.01", "40000", false)]
    [InlineData("sell", "0.01", "40000", false)]
    public async Task A_limit_order_is_valued_at_the_higher_of_its_price_and_the_market(string side, string size, string price, bool refused)
    {
        // Over the position limit only when valued at the higher price.
        var input = $$"""{"instId":"BTC-USDT","side":"{{side}}","ordType":"limit","sz":"{{size}}","px":"{{price}}"}""";

        var decision = await Check("spot_place_order", input);

        Assert.Equal(refused, !decision.Allowed);
    }

    [Fact]
    public async Task A_swap_size_is_contracts_and_one_contract_can_be_a_thousand_coins()
    {
        // 5 contracts of DOGE-USDT-SWAP are 5,000 DOGE: 500 dollars at 0.1, not 50 cents.
        var decision = await Check("swap_place_order", """{"instId":"DOGE-USDT-SWAP","tdMode":"cross","side":"buy","ordType":"market","sz":"5"}""");

        Assert.True(decision.Allowed);
        var sent = decision.Input!.Value;
        Assert.Equal("base_ccy", sent.GetProperty("tgtCcy").GetString());
        Assert.Equal(5_000m, _orders.Find(sent.GetProperty("clOrdId").GetString()!)!.Quantity);
        // One contract more is 600 dollars, over the limit: the contract's size was counted.
        Assert.False((await Check("swap_place_order", """{"instId":"DOGE-USDT-SWAP","tdMode":"cross","side":"buy","ordType":"market","sz":"6"}""", "toolu_more")).Allowed);
    }

    [Theory]
    // Linear: 1 contract of 0.01 BTC is 0.01 BTC.
    [InlineData("BTC-USDT-SWAP", "1", 0.01)]
    // Inverse: 5 contracts of 100 dollars are 500 dollars, 0.01 BTC at 50,000.
    [InlineData("BTC-USD-SWAP", "5", 0.01)]
    public async Task A_swap_is_valued_by_its_contract(string instrument, string contracts, double coins)
    {
        var decision = await Check("swap_place_order", $$"""{"instId":"{{instrument}}","tdMode":"cross","side":"sell","ordType":"market","sz":"{{contracts}}"}""");

        Assert.True(decision.Allowed);
        Assert.Equal((decimal)coins, _orders.Find(decision.Input!.Value.GetProperty("clOrdId").GetString()!)!.Quantity);
    }

    [Fact]
    public async Task A_swap_order_that_looks_small_is_refused_by_its_real_value()
    {
        // 10 contracts look small. They are 5,000 dollars, half the account.
        var decision = await Check("swap_place_order", """{"instId":"BTC-USDT-SWAP","tdMode":"cross","side":"buy","ordType":"market","sz":"10"}""");

        Assert.False(decision.Allowed);
        Assert.Contains("50.0%", decision.Reason, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("""{"instId":"BTC-USDT-SWAP","side":"buy","ordType":"market","sz":"100","tgtCcy":"quote_ccy"}""")]
    [InlineData("""{"instId":"BTC-USDT-SWAP","side":"buy","ordType":"market","sz":"100","tgtCcy":"margin"}""")]
    public async Task A_swap_size_in_anything_but_contracts_is_refused(string input)
    {
        Assert.False((await Check("swap_place_order", input)).Allowed);
    }

    [Theory]
    [InlineData("ETH-USDT-SWAP")]
    [InlineData("SUSPENDED-USDT-SWAP")]
    [InlineData("NOVALUE-USDT-SWAP")]
    [InlineData("ODD-USDT-SWAP")]
    public async Task A_swap_the_app_cannot_value_is_refused(string instrument)
    {
        _exchange.Prices["ETH-USDT-SWAP"] = 3000m;
        foreach (var (id, state, value, type) in new[]
                 {
                     ("SUSPENDED-USDT-SWAP", "suspend", 1m, "linear"),
                     ("NOVALUE-USDT-SWAP", "live", 0m, "linear"),
                     ("ODD-USDT-SWAP", "live", 1m, "quanto"),
                 })
        {
            _exchange.Prices[id] = 1m;
            _exchange.Swaps.Add(new Instrument(id, "SWAP", string.Empty, string.Empty, state, 0.1m, 1m, 1m, value, 1m, type));
        }

        var decision = await Check("swap_place_order", $$"""{"instId":"{{instrument}}","side":"buy","ordType":"market","sz":"1"}""");

        Assert.False(decision.Allowed);
        Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    // ---- place: arguments ----

    [Theory]
    [InlineData("\"0\"")]
    [InlineData("\"0.0\"")]
    [InlineData("\"-1\"")]
    [InlineData("\"NaN\"")]
    [InlineData("\"Infinity\"")]
    [InlineData("\"1e3\"")]
    [InlineData("\" 1\"")]
    [InlineData("\"+1\"")]
    [InlineData("\"1,5\"")]
    [InlineData("\"0x10\"")]
    [InlineData("\"1.2.3\"")]
    [InlineData("\".\"")]
    [InlineData("\"\"")]
    [InlineData("\"all\"")]
    [InlineData("\"99999999999999999999999999999\"")]
    [InlineData("-5")]
    [InlineData("1e3")]
    [InlineData("null")]
    [InlineData("true")]
    [InlineData("[1]")]
    public async Task A_size_that_is_not_a_plain_number_above_zero_is_refused(string size)
    {
        var decision = await Check("spot_place_order", $$"""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":{{size}}}""");

        Assert.False(decision.Allowed);
        Assert.Contains("size", decision.Reason, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"market"}""", "size")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"market","quoteSz":"100"}""", "size")]
    [InlineData("""{"side":"buy","ordType":"market","sz":"100"}""", "instrument")]
    [InlineData("""{"instId":"btc-usdt","side":"buy","ordType":"market","sz":"100"}""", "instrument")]
    [InlineData("""{"instId":"BTC-USDT-SWAP","side":"buy","ordType":"market","sz":"100"}""", "instrument")]
    [InlineData("""{"instId":"BTC-USDT; DROP","side":"buy","ordType":"market","sz":"100"}""", "instrument")]
    [InlineData("""{"instId":"BTC","side":"buy","ordType":"market","sz":"100"}""", "instrument")]
    [InlineData("""{"instId":"BTC-USDT","ordType":"market","sz":"100"}""", "side")]
    [InlineData("""{"instId":"BTC-USDT","side":"BUY","ordType":"market","sz":"100"}""", "side")]
    [InlineData("""{"instId":"BTC-USDT","side":"long","ordType":"market","sz":"100"}""", "side")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","sz":"100"}""", "order type")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"optimal_limit_ioc","sz":"100"}""", "order type")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"0.001"}""", "price")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"limit","sz":"0.001","px":"0"}""", "price")]
    [InlineData("""{"instId":"BTC-USDT","side":"buy","ordType":"ioc","sz":"0.001","px":"-1"}""", "price")]
    public async Task An_order_with_a_missing_or_malformed_argument_is_refused(string input, string because)
    {
        var decision = await Check("spot_place_order", input);

        Assert.False(decision.Allowed);
        Assert.Contains(because, decision.Reason, StringComparison.Ordinal);
        Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    [Theory]
    [InlineData("BTC-USDT")]
    [InlineData("BTC-USDT-250328")]
    [InlineData("BTC-USDT-swap")]
    public async Task A_swap_order_for_something_that_is_not_a_perpetual_swap_is_refused(string instrument)
    {
        var decision = await Check("swap_place_order", $$"""{"instId":"{{instrument}}","side":"buy","ordType":"market","sz":"1"}""");

        Assert.False(decision.Allowed);
        Assert.Contains("perpetual swap", decision.Reason, StringComparison.Ordinal);
    }

    // ---- place: the id and the record ----

    [Fact]
    public async Task The_gate_gives_the_order_its_own_id_whatever_the_model_asked_for()
    {
        var decision = await Check(
            "spot_place_order",
            """{"instId":"BTC-USDT","tdMode":"cash","side":"buy","ordType":"market","sz":"100","clOrdId":"picked-by-the-model","tpTriggerPx":"60000","slTriggerPx":"45000"}""");

        Assert.True(decision.Allowed);
        var sent = decision.Input!.Value;
        var id = sent.GetProperty("clOrdId").GetString()!;
        // OKX: letters and digits only, up to 32.
        Assert.Matches(OkxClientOrderId(), id);
        Assert.Equal("s" + _context.SessionId, id[..25]);
        Assert.Equal(_context.SessionId, ClientOrderId.SessionOf(id));
        // Everything else is sent as the model wrote it.
        Assert.Equal("BTC-USDT", sent.GetProperty("instId").GetString());
        Assert.Equal("cash", sent.GetProperty("tdMode").GetString());
        Assert.Equal("100", sent.GetProperty("sz").GetString());
        Assert.Equal("60000", sent.GetProperty("tpTriggerPx").GetString());
        Assert.Equal("45000", sent.GetProperty("slTriggerPx").GetString());
        Assert.Single(sent.EnumerateObject(), property => property.NameEquals("clOrdId"));
    }

    [Fact]
    public async Task An_allowed_order_is_recorded_before_it_is_sent()
    {
        var before = DateTimeOffset.UtcNow;

        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","side":"sell","ordType":"limit","sz":"0.004","px":"51000"}""");

        var id = decision.Input!.Value.GetProperty("clOrdId").GetString()!;
        var stub = _orders.Find(id);
        Assert.NotNull(stub);
        Assert.Equal(
            new OrderStub(id, "BTC-USDT", "sell", "limit", 0.004m, 51_000m, _context.SessionId, _context.MessageId, _context.ToolUseId, stub.PendingUntil),
            stub);
        Assert.InRange(stub.PendingUntil, before + RiskGate.StubLifetime - TimeSpan.FromSeconds(5), DateTimeOffset.UtcNow + RiskGate.StubLifetime);
        Assert.True(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    [Fact]
    public async Task One_tool_call_places_one_order()
    {
        const string Input = """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}""";
        Assert.True((await Check("spot_place_order", Input)).Allowed);

        var again = await Check("spot_place_order", Input);
        var other = await Check("spot_place_order", Input, toolUseId: "toolu_02");

        Assert.False(again.Allowed);
        Assert.Contains("already placed an order", again.Reason, StringComparison.Ordinal);
        // Another tool call is another decision of the model, with another id.
        Assert.True(other.Allowed);
    }

    [Fact]
    public async Task Two_orders_never_get_the_same_id()
    {
        var ids = new HashSet<string>(StringComparer.Ordinal);
        for (var index = 0; index < 50; index++)
        {
            var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"10"}""", toolUseId: $"toolu_{index}");
            Assert.True(ids.Add(decision.Input!.Value.GetProperty("clOrdId").GetString()!));
        }
    }

    [Theory]
    [InlineData("session", null)]
    [InlineData("", null)]
    [InlineData(null, "message")]
    [InlineData(null, "")]
    public async Task An_order_outside_a_chat_session_is_refused(string? sessionId, string? messageId)
    {
        var context = new ToolContext(sessionId ?? _context.SessionId, messageId ?? _context.MessageId, "toolu_01");

        var decision = await _gate.CheckAsync("spot_place_order", Parse("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}"""), context, Ct);

        Assert.False(decision.Allowed);
        Assert.Equal(0, _exchange.BalanceReads);
    }

    [Fact]
    public async Task An_order_that_cannot_be_recorded_is_refused()
    {
        // Well-formed ids of a session and a message that do not exist: the row cannot be written.
        var context = new ToolContext(Ids.NewId(), Ids.NewId(), "toolu_01");

        var decision = await _gate.CheckAsync("spot_place_order", Parse("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}"""), context, Ct);

        Assert.False(decision.Allowed);
        Assert.Contains("could not be recorded", decision.Reason, StringComparison.Ordinal);
    }

    // ---- fail closed ----

    [Fact]
    public async Task An_order_is_refused_when_the_price_cannot_be_read()
    {
        _exchange.TickerFailure = new OkxException(OkxFailure.Network, "OKX did not answer.");

        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}""");

        Assert.False(decision.Allowed);
        Assert.Contains("not assessed", decision.Reason, StringComparison.Ordinal);
        Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    [Fact]
    public async Task An_order_is_refused_when_the_account_cannot_be_read()
    {
        // What happens without a saved key: there is no balance to measure the order against.
        _exchange.BalanceFailure = new OkxException(OkxFailure.Credentials, "No OKX API key is saved.");

        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}""");

        Assert.False(decision.Allowed);
        Assert.Contains("not assessed", decision.Reason, StringComparison.Ordinal);
        Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    [Fact]
    public async Task An_order_for_an_instrument_okx_does_not_know_is_refused()
    {
        Assert.False((await Check("spot_place_order", """{"instId":"NOSUCH-USDT","side":"buy","ordType":"market","sz":"100"}""")).Allowed);
    }

    [Fact]
    public async Task Any_exception_inside_the_gate_is_a_refusal_not_a_crash()
    {
        _exchange.TickerFailure = new InvalidOperationException("something nobody thought of");

        var decision = await Check("spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}""");

        Assert.False(decision.Allowed);
        // The inner message is for the log, not for the model.
        Assert.DoesNotContain("nobody thought of", decision.Reason, StringComparison.Ordinal);
        Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    [Theory]
    [InlineData("spot_place_order", """{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}""")]
    [InlineData("account_transfer", """{"ccy":"USDT","amt":"10","from":"6","to":"18"}""")]
    [InlineData("swap_set_leverage", """{"instId":"BTC-USDT-SWAP","lever":"2","mgnMode":"cross"}""")]
    [InlineData("spot_cancel_order", """{"instId":"BTC-USDT","ordId":"1"}""")]
    public async Task Settings_that_cannot_be_read_refuse_every_write(string tool, string input)
    {
        var gate = NewGate(new BrokenSettings());

        var decision = await gate.CheckAsync(tool, Parse(input), _context, Ct);

        Assert.False(decision.Allowed);
    }

    [Fact]
    public async Task A_cancelled_check_allows_nothing_and_says_it_was_cancelled()
    {
        using var cancelled = new CancellationTokenSource();
        await cancelled.CancelAsync();
        _exchange.TickerFailure = new OperationCanceledException(cancelled.Token);

        await Assert.ThrowsAnyAsync<OperationCanceledException>(async () =>
            await _gate.CheckAsync("spot_place_order", Parse("""{"instId":"BTC-USDT","side":"buy","ordType":"market","sz":"100"}"""), _context, cancelled.Token));

        Assert.False(_orders.ExistsForToolCall(_context.SessionId, _context.ToolUseId));
    }

    // ---- the id ----

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("picked-by-the-model")]
    [InlineData("s0123456789abcdef01234567-1a2b")]
    [InlineData("x0123456789abcdef012345671a2b3c")]
    [InlineData("s0123456789abcdef012345671a2b3")]
    [InlineData("s0123456789abcdef012345671a2b3cd")]
    [InlineData("s0123456789ABCDEF012345671a2b3c")]
    [InlineData("s0123456789abcdef012345671A2B3C")]
    public void An_id_that_is_not_the_gates_names_no_session(string? id)
    {
        Assert.Null(ClientOrderId.SessionOf(id));
    }

    [Fact]
    public void An_id_cannot_be_made_for_something_that_is_not_a_session()
    {
        Assert.Throws<ArgumentException>(() => ClientOrderId.New("not-a-session"));
        Assert.Equal(31, ClientOrderId.Length);
        Assert.Equal("0123456789abcdef01234567", ClientOrderId.SessionOf("s0123456789abcdef012345671a2b3c"));
    }

    [GeneratedRegex("^[a-zA-Z0-9]{1,32}$")]
    private static partial Regex OkxClientOrderId();

    private static JsonElement Parse(string json)
    {
        using var document = JsonDocument.Parse(json, new JsonDocumentOptions { AllowDuplicateProperties = true });
        return document.RootElement.Clone();
    }

    private RiskGate NewGate(ISettingsStore settings) =>
        new(_exchange, new RiskManager(_exchange, _settings), settings, _orders, TimeProvider.System, NullLogger<RiskGate>.Instance);

    private ValueTask<GateDecision> Check(string tool, string input, string? toolUseId = null) =>
        _gate.CheckAsync(tool, Parse(input), toolUseId is null ? _context : _context with { ToolUseId = toolUseId }, Ct);

    /// <summary>A settings store whose database is gone.</summary>
    private sealed class BrokenSettings : ISettingsStore
    {
#pragma warning disable CS0067 // The event is part of the interface; nothing here raises it.
        public event EventHandler<SettingChangedEventArgs>? Changed;
#pragma warning restore CS0067

        public T GetValue<T>(SettingKey<T> key) => throw new InvalidOperationException("The settings cannot be read.");

        public void SetValue<T>(SettingKey<T> key, T value) => throw new InvalidOperationException("The settings cannot be written.");

        public void Reset<T>(SettingKey<T> key) => throw new InvalidOperationException("The settings cannot be written.");
    }
}
