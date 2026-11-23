using System.Buffers;
using System.Globalization;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Logging;
using TradingAgent.Agent.Tools;
using TradingAgent.Core;
using TradingAgent.Core.Settings;
using TradingAgent.Data.Trading;
using TradingAgent.Exchange.Okx;
using TradingAgent.Exchange.Risk;

namespace TradingAgent.Agent.Atk;

/// <summary>Decides whether a writing tool of the trade kit may run.</summary>
public interface IAtkGate
{
    /// <param name="toolName">The trade kit's name of the tool, without the model-facing prefix.</param>
    /// <param name="input">The arguments the model gave. Every member may be missing or of the wrong kind.</param>
    /// <param name="context">The run and the tool call.</param>
    /// <param name="cancellationToken">Cancels the check; a cancelled check allows nothing.</param>
    ValueTask<GateDecision> CheckAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken);
}

/// <summary>The id the gate gives every order it lets through.</summary>
/// <remarks>
/// <c>s</c> + the 24 characters of the session id + 6 random hex characters: 31 letters and digits.
/// OKX allows letters and digits only, up to 32. The order mirror reads the session back out of it.
/// The model never chooses this id: an id it chose could repeat one of another session.
/// </remarks>
public static class ClientOrderId
{
    public const int Length = 1 + Ids.Length + 6;

    private static readonly SearchValues<char> _hex = SearchValues.Create("0123456789abcdef");

    public static string New(string sessionId)
    {
        if (!Ids.IsValid(sessionId))
        {
            throw new ArgumentException("Not a session id.", nameof(sessionId));
        }

        return "s" + sessionId + Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(3));
    }

    /// <summary>The session an id was made for, or null when the id is not one of the gate's.</summary>
    public static string? SessionOf(string? clientOrderId)
    {
        if (clientOrderId is not { Length: Length } || clientOrderId[0] != 's')
        {
            return null;
        }

        var session = clientOrderId.Substring(1, Ids.Length);
        return Ids.IsValid(session) && clientOrderId.AsSpan(1 + Ids.Length).IndexOfAnyExcept(_hex) < 0 ? session : null;
    }
}

/// <summary>
/// The check every order, cancel, transfer and leverage change passes before it reaches OKX.
/// </summary>
/// <remarks>
/// <b>Fail closed.</b> The gate allows only what it can name, measure and record. Anything else is
/// refused: a tool without a rule, an argument it cannot read, a price or balance it cannot get, a
/// row it cannot write, any exception.
/// <para>In this order:</para>
/// <list type="number">
/// <item>A tool that is not a supported write of the inventory is refused.</item>
/// <item>Emergency stop refuses everything except cancelling, which only reduces exposure.</item>
/// <item>Cancel: allowed, logged.</item>
/// <item>Leverage: a whole number from 1 to <see cref="MaxLeverage"/>.</item>
/// <item>Transfer: more than zero and at most <see cref="MaxTransferAmount"/>, USDT or USDC only,
/// between the user's own funding and trading account only.</item>
/// <item>Place: the arguments must be complete and plain; the size is turned into a value in the quote
/// currency; a tool call places one order; <see cref="RiskManager"/> must assess the trade and not
/// say <see cref="RiskRecommendation.Avoid"/>; the order gets a client order id of the gate's own
/// and a pending row in <c>orders</c> before it is let through.</item>
/// </list>
/// <para>
/// The gate does not know whether the trade kit is running or in which mode; the caller
/// (<see cref="AtkService"/>) checks that before it asks.
/// </para>
/// </remarks>
public sealed partial class RiskGate(
    IOkxReader okx,
    RiskManager risk,
    ISettingsStore settings,
    OrderStubRepository orders,
    TimeProvider time,
    ILogger<RiskGate> logger) : IAtkGate
{
    /// <summary>Highest leverage the agent may set.</summary>
    public const int MaxLeverage = 10;

    /// <summary>Most the agent may move in one transfer, in USDT or USDC.</summary>
    public const decimal MaxTransferAmount = 1000m;

    /// <summary>Sizes and prices above this are refused as nonsense before any arithmetic.</summary>
    private const decimal MaxPlainNumber = 1_000_000_000_000m;

    private static readonly SearchValues<char> _instrumentCharacters = SearchValues.Create("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    private static readonly SearchValues<char> _numberCharacters = SearchValues.Create("0123456789.");

    private const string FundingAccount = "6";
    private const string TradingAccount = "18";

    /// <summary>How long a pending row waits for the exchange before it counts as never placed.</summary>
    public static TimeSpan StubLifetime { get; } = TimeSpan.FromMinutes(2);

    public async ValueTask<GateDecision> CheckAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(context);
        try
        {
            var decision = await DecideAsync(toolName, input, context, cancellationToken).ConfigureAwait(false);
            if (decision.Allowed)
            {
                LogAllowed(logger, toolName, context.SessionId);
            }
            else
            {
                LogDenied(logger, toolName, context.SessionId, decision.Reason ?? string.Empty);
            }

            return decision;
        }
        catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
        {
            // Whatever went wrong, nothing was shown to be safe.
            LogFailed(logger, toolName, context.SessionId, ex);
            return GateDecision.Deny("The safety check could not be completed, so the action was refused.");
        }
    }

    private async ValueTask<GateDecision> DecideAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var kind = AtkToolCatalog.Kind(toolName);
        if (!AtkToolCatalog.IsWrite(kind))
        {
            // The gate is asked about writes only. Anything else here is a mistake of the caller's.
            return GateDecision.Deny($"'{toolName}' is not a writing tool this app allows.");
        }

        if (!AtkToolCatalog.IsSupportedWrite(toolName))
        {
            return GateDecision.Deny($"'{toolName}' is not supported by this app yet.");
        }

        if (input.ValueKind != JsonValueKind.Object)
        {
            return GateDecision.Deny("The arguments are not a JSON object.");
        }

        if (HasRepeatedName(input))
        {
            // Two values under one name: which one counts depends on who reads it.
            return GateDecision.Deny("An argument is given twice.");
        }

        if (settings.GetValue(SettingKeys.EmergencyStopActive) && kind != AtkToolKind.Cancel)
        {
            return GateDecision.Deny("Emergency stop is active. Only cancelling orders is allowed until the user switches it off.");
        }

        return kind switch
        {
            AtkToolKind.Cancel => GateDecision.Allow,
            AtkToolKind.Leverage => CheckLeverage(input),
            AtkToolKind.Transfer => CheckTransfer(input),
            AtkToolKind.Place => await CheckPlaceAsync(toolName, input, context, cancellationToken).ConfigureAwait(false),
            _ => GateDecision.Deny($"'{toolName}' has no rule."),
        };
    }

    private static GateDecision CheckLeverage(JsonElement input)
    {
        if (!TryPlainNumber(input, "lever", out var lever))
        {
            return GateDecision.Deny("The leverage is missing or not a plain number.");
        }

        if (lever != decimal.Truncate(lever) || lever < 1 || lever > MaxLeverage)
        {
            return GateDecision.Deny(string.Create(CultureInfo.InvariantCulture, $"Leverage {lever} is not a whole number from 1 to {MaxLeverage}."));
        }

        return GateDecision.Allow;
    }

    private static GateDecision CheckTransfer(JsonElement input)
    {
        if (!TryPlainNumber(input, "amt", out var amount))
        {
            return GateDecision.Deny("The transfer amount is missing or not a plain number.");
        }

        if (amount <= 0)
        {
            return GateDecision.Deny("The transfer amount must be more than zero.");
        }

        var currency = Token(input, "ccy");
        if (currency is not ("USDT" or "USDC"))
        {
            return GateDecision.Deny("Only USDT and USDC may be transferred.");
        }

        if (amount > MaxTransferAmount)
        {
            return GateDecision.Deny(string.Create(CultureInfo.InvariantCulture, $"A transfer of {amount} {currency} is above the limit of {MaxTransferAmount} per transfer."));
        }

        // Funding to trading or back, inside the user's own account: money that cannot leave.
        var from = Token(input, "from");
        var to = Token(input, "to");
        if (!((from == FundingAccount && to == TradingAccount) || (from == TradingAccount && to == FundingAccount)))
        {
            return GateDecision.Deny("Only transfers between the funding account (6) and the trading account (18) are allowed.");
        }

        if (Token(input, "type") is not (null or "0") || !string.IsNullOrEmpty(Token(input, "subAcct")))
        {
            return GateDecision.Deny("Transfers to or from a sub-account are not allowed.");
        }

        return GateDecision.Allow;
    }

    private async ValueTask<GateDecision> CheckPlaceAsync(string toolName, JsonElement input, ToolContext context, CancellationToken cancellationToken)
    {
        var swap = toolName == "swap_place_order";

        var instrumentId = Token(input, "instId");
        if (instrumentId is null || !IsInstrumentId(instrumentId, swap))
        {
            return GateDecision.Deny(swap
                ? "The instrument must be a perpetual swap such as BTC-USDT-SWAP."
                : "The instrument must be a spot pair such as BTC-USDT.");
        }

        var side = Token(input, "side");
        if (side is not ("buy" or "sell"))
        {
            return GateDecision.Deny("The side must be 'buy' or 'sell'.");
        }

        var orderType = Token(input, "ordType");
        if (orderType is not ("market" or "limit" or "post_only" or "fok" or "ioc"))
        {
            return GateDecision.Deny("The order type must be market, limit, post_only, fok or ioc.");
        }

        if (!TryPlainNumber(input, "sz", out var size) || size <= 0)
        {
            return GateDecision.Deny("The size is missing, not a plain number, or not more than zero.");
        }

        var market = orderType == "market";
        decimal? limitPrice = null;
        if (!market)
        {
            if (!TryPlainNumber(input, "px", out var price) || price <= 0)
            {
                return GateDecision.Deny("This order type needs a price that is a plain number above zero.");
            }

            limitPrice = price;
        }

        // What the size is counted in. Made explicit in the arguments that are sent on, so that the
        // exchange reads the size the way it was assessed here.
        var unit = Token(input, "tgtCcy");
        string? unitToSend;
        bool sizeInQuote;
        if (swap)
        {
            if (unit is not (null or "base_ccy"))
            {
                return GateDecision.Deny("For a swap, give the size in contracts (leave tgtCcy out).");
            }

            unitToSend = "base_ccy";
            sizeInQuote = false;
        }
        else if (market)
        {
            // OKX's own default: a market buy is sized in the quote currency, a market sell in the coin.
            unit ??= side == "buy" ? "quote_ccy" : "base_ccy";
            if (unit is not ("base_ccy" or "quote_ccy"))
            {
                return GateDecision.Deny("tgtCcy must be base_ccy or quote_ccy.");
            }

            unitToSend = unit;
            sizeInQuote = unit == "quote_ccy";
        }
        else
        {
            // OKX ignores tgtCcy for anything but a spot market order and reads the size as coins.
            if (unit is not (null or "base_ccy"))
            {
                return GateDecision.Deny("A size in the quote currency works for market orders only. Give the size in coins.");
            }

            unitToSend = null;
            sizeInQuote = false;
        }

        if (!Ids.IsValid(context.SessionId) || !Ids.IsValid(context.MessageId) || string.IsNullOrEmpty(context.ToolUseId))
        {
            return GateDecision.Deny("The order does not belong to a chat session, so it cannot be recorded.");
        }

        if (orders.ExistsForToolCall(context.SessionId, context.ToolUseId))
        {
            return GateDecision.Deny("This tool call already placed an order. A new order needs a new decision.");
        }

        decimal entryPrice;
        decimal quantity;
        try
        {
            var last = (await okx.GetTickerAsync(instrumentId, cancellationToken).ConfigureAwait(false)).Last;
            if (last <= 0)
            {
                return GateDecision.Deny($"There is no current price for {instrumentId}.");
            }

            // A limit order fills at its price or better. Valued at the higher of the two, the trade
            // is never assessed as smaller than it can turn out.
            entryPrice = limitPrice is { } limit ? Math.Max(limit, last) : last;

            decimal value;
            if (swap)
            {
                var instrument = (await okx.GetInstrumentsAsync("SWAP", cancellationToken).ConfigureAwait(false))
                    .FirstOrDefault(candidate => candidate.InstrumentId == instrumentId);
                if (instrument is not { State: "live", ContractValue: > 0 })
                {
                    return GateDecision.Deny($"{instrumentId} is not a swap that can be traded now.");
                }

                var perContract = instrument.ContractValue * (instrument.ContractMultiplier > 0 ? instrument.ContractMultiplier : 1);
                switch (instrument.ContractType)
                {
                    case "linear":
                        // One contract is an amount of the coin.
                        value = size * perContract * entryPrice;
                        break;
                    case "inverse":
                        // One contract is an amount of US dollars.
                        value = size * perContract;
                        break;
                    default:
                        return GateDecision.Deny($"The contract type of {instrumentId} is not known to this app.");
                }
            }
            else
            {
                value = sizeInQuote ? size : size * entryPrice;
            }

            quantity = value / entryPrice;
        }
        catch (OkxException ex)
        {
            return GateDecision.Deny($"The price or the contract could not be read from OKX, so the trade was not assessed: {ex.Message}");
        }

        RiskAssessment assessment;
        try
        {
            assessment = await risk.AssessTradeAsync(instrumentId, side, quantity, entryPrice, cancellationToken).ConfigureAwait(false);
        }
        catch (OkxException ex)
        {
            return GateDecision.Deny($"The account could not be read from OKX, so the trade was not assessed: {ex.Message}");
        }

        if (assessment.Recommendation == RiskRecommendation.Avoid)
        {
            var warnings = assessment.Warnings.Count > 0 ? string.Join("; ", assessment.Warnings) : "no detail";
            return GateDecision.Deny(string.Create(CultureInfo.InvariantCulture, $"Risk check: AVOID (score {assessment.Score}). {warnings}."));
        }

        var clientOrderId = ClientOrderId.New(context.SessionId);
        try
        {
            orders.Insert(new OrderStub(
                clientOrderId,
                instrumentId,
                side,
                market ? "market" : "limit",
                quantity,
                limitPrice,
                context.SessionId,
                context.MessageId,
                context.ToolUseId,
                time.GetUtcNow() + StubLifetime));
        }
        catch (SqliteException ex)
        {
            // No record, no order.
            LogStubFailed(logger, toolName, context.SessionId, ex);
            return GateDecision.Deny("The order could not be recorded, so it was not placed.");
        }

        LogAssessed(logger, toolName, instrumentId, side, (double)assessment.PositionValueUsd, assessment.Score, assessment.Recommendation);
        return new GateDecision(true, null, Rewrite(input, clientOrderId, unitToSend));
    }

    /// <summary>The arguments with the gate's client order id and the size unit it assessed.</summary>
    private static JsonElement Rewrite(JsonElement input, string clientOrderId, string? unit)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartObject();
            foreach (var property in input.EnumerateObject())
            {
                if (!property.NameEquals("clOrdId") && !property.NameEquals("tgtCcy"))
                {
                    property.WriteTo(writer);
                }
            }

            writer.WriteString("clOrdId", clientOrderId);
            if (unit is not null)
            {
                writer.WriteString("tgtCcy", unit);
            }

            writer.WriteEndObject();
        }

        using var document = JsonDocument.Parse(buffer.ToArray());
        // Cloned: the caller reads it after this document is gone.
        return document.RootElement.Clone();
    }

    private static bool HasRepeatedName(JsonElement input)
    {
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var property in input.EnumerateObject())
        {
            if (!seen.Add(property.Name))
            {
                return true;
            }
        }

        return false;
    }

    /// <summary><c>BTC-USDT</c> for spot, <c>BTC-USDT-SWAP</c> for a swap: capitals and digits between hyphens.</summary>
    private static bool IsInstrumentId(string value, bool swap)
    {
        var parts = value.Split('-');
        if (parts.Length != (swap ? 3 : 2) || (swap && parts[2] != "SWAP"))
        {
            return false;
        }

        foreach (var part in parts)
        {
            if (part.Length is 0 or > 20 || part.AsSpan().IndexOfAnyExcept(_instrumentCharacters) >= 0)
            {
                return false;
            }
        }

        return true;
    }

    /// <summary>A text or number argument as text; null when it is missing or of another kind.</summary>
    private static string? Token(JsonElement input, string name) =>
        input.TryGetProperty(name, out var value)
            ? value.ValueKind switch
            {
                JsonValueKind.String => value.GetString(),
                JsonValueKind.Number => value.GetRawText(),
                _ => null,
            }
            : null;

    /// <summary>
    /// Reads an argument made of digits and at most one decimal point. No sign, no exponent, no
    /// spaces, no <c>NaN</c> or <c>Infinity</c>: what OKX would take for a size or a price, and
    /// nothing a second reader could understand differently.
    /// </summary>
    private static bool TryPlainNumber(JsonElement input, string name, out decimal number)
    {
        number = 0;
        var text = Token(input, name);
        if (text is not { Length: > 0 and <= 30 } || text.AsSpan().IndexOfAnyExcept(_numberCharacters) >= 0)
        {
            return false;
        }

        return decimal.TryParse(text, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out number)
            && number <= MaxPlainNumber;
    }

    [LoggerMessage(Level = LogLevel.Information, Message = "Risk gate allowed {Tool} (session {SessionId}).")]
    private static partial void LogAllowed(ILogger logger, string tool, string sessionId);

    [LoggerMessage(Level = LogLevel.Warning, Message = "Risk gate refused {Tool} (session {SessionId}): {Reason}")]
    private static partial void LogDenied(ILogger logger, string tool, string sessionId, string reason);

    [LoggerMessage(Level = LogLevel.Error, Message = "Risk gate failed on {Tool} (session {SessionId}); the action was refused.")]
    private static partial void LogFailed(ILogger logger, string tool, string sessionId, Exception exception);

    [LoggerMessage(Level = LogLevel.Error, Message = "Risk gate could not record the order of {Tool} (session {SessionId}); the order was refused.")]
    private static partial void LogStubFailed(ILogger logger, string tool, string sessionId, Exception exception);

    [LoggerMessage(Level = LogLevel.Information, Message = "Risk gate assessed {Tool} {Instrument} {Side}: value {ValueUsd:0.00} USD, score {Score} ({Recommendation}).")]
    private static partial void LogAssessed(ILogger logger, string tool, string instrument, string side, double valueUsd, int score, RiskRecommendation recommendation);
}
