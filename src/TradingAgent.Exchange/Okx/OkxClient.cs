using System.Globalization;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TradingAgent.Exchange.Okx;

/// <summary>Reads market and account data from the OKX REST API (version 5).</summary>
/// <remarks>
/// <b>Read-only.</b> Every request is a GET; see <see cref="IOkxReader"/> for why there is no other kind.
/// <para>
/// OKX has a demo trading environment with its own API keys. Which environment a request goes to is
/// decided by the header <c>x-simulated-trading</c>, on public requests too, so prices used for risk
/// checks come from the same environment the orders go to.
/// </para>
/// </remarks>
public sealed partial class OkxClient : IOkxReader
{
    private static readonly Uri _defaultBaseAddress = new("https://www.okx.com");

    private readonly HttpClient _http;
    private readonly Func<OkxCredentials?> _credentials;
    private readonly Func<bool> _sandbox;
    private readonly TimeProvider _time;
    private readonly ILogger<OkxClient> _logger;
    private readonly Uri _baseAddress;
    private readonly TimeSpan _retryDelay;

    /// <param name="http">Shared client.</param>
    /// <param name="credentials">Returns the saved API key at the time of a call, or null when there is none.</param>
    /// <param name="sandbox">True when the demo trading environment is selected.</param>
    /// <param name="time">Clock for the request timestamp, which is part of the signature.</param>
    /// <param name="logger">Receives retries. Never keys, signatures or account data.</param>
    /// <param name="baseAddress">The API root; OKX's when null.</param>
    /// <param name="retryDelay">Pause before the one retry of a failed request; one second when null.</param>
    public OkxClient(
        HttpClient http,
        Func<OkxCredentials?> credentials,
        Func<bool> sandbox,
        TimeProvider time,
        ILogger<OkxClient> logger,
        Uri? baseAddress = null,
        TimeSpan? retryDelay = null)
    {
        ArgumentNullException.ThrowIfNull(http);
        ArgumentNullException.ThrowIfNull(credentials);
        ArgumentNullException.ThrowIfNull(sandbox);
        ArgumentNullException.ThrowIfNull(time);
        ArgumentNullException.ThrowIfNull(logger);
        _http = http;
        _credentials = credentials;
        _sandbox = sandbox;
        _time = time;
        _logger = logger;
        _baseAddress = baseAddress ?? _defaultBaseAddress;
        _retryDelay = retryDelay ?? TimeSpan.FromSeconds(1);
    }

    public async Task<Ticker> GetTickerAsync(string instrumentId, CancellationToken cancellationToken)
    {
        using var document = await GetAsync($"/api/v5/market/ticker?instId={Escape(instrumentId)}", signed: false, cancellationToken).ConfigureAwait(false);
        var data = Data(document);
        if (data.GetArrayLength() == 0)
        {
            throw new OkxException(OkxFailure.Rejected, $"OKX has no instrument '{instrumentId}'.");
        }

        return ReadTicker(data[0]);
    }

    public async Task<IReadOnlyList<Ticker>> GetTickersAsync(string instrumentType, CancellationToken cancellationToken)
    {
        using var document = await GetAsync($"/api/v5/market/tickers?instType={Escape(instrumentType)}", signed: false, cancellationToken).ConfigureAwait(false);
        return [.. Data(document).EnumerateArray().Select(ReadTicker)];
    }

    public async Task<OrderBook> GetOrderBookAsync(string instrumentId, int depth, CancellationToken cancellationToken)
    {
        var size = Math.Clamp(depth, 1, 400).ToString(CultureInfo.InvariantCulture);
        using var document = await GetAsync($"/api/v5/market/books?instId={Escape(instrumentId)}&sz={size}", signed: false, cancellationToken).ConfigureAwait(false);
        var data = Data(document);
        if (data.GetArrayLength() == 0)
        {
            throw new OkxException(OkxFailure.Rejected, $"OKX has no order book for '{instrumentId}'.");
        }

        var book = data[0];
        return new OrderBook(instrumentId, ReadLevels(book, "bids"), ReadLevels(book, "asks"), Int64(book, "ts"));
    }

    public async Task<IReadOnlyList<Candle>> GetCandlesAsync(string instrumentId, string bar, int limit, CancellationToken cancellationToken)
    {
        var count = Math.Clamp(limit, 1, 300).ToString(CultureInfo.InvariantCulture);
        using var document = await GetAsync(
            $"/api/v5/market/candles?instId={Escape(instrumentId)}&bar={Escape(bar)}&limit={count}",
            signed: false,
            cancellationToken).ConfigureAwait(false);

        var candles = new List<Candle>();
        foreach (var row in Data(document).EnumerateArray())
        {
            // [time, open, high, low, close, volume, ...], every value a string.
            if (row.ValueKind == JsonValueKind.Array && row.GetArrayLength() >= 6)
            {
                candles.Add(new Candle(
                    long.Parse(row[0].GetString() ?? "0", CultureInfo.InvariantCulture),
                    Number(row[1]),
                    Number(row[2]),
                    Number(row[3]),
                    Number(row[4]),
                    Number(row[5])));
            }
        }

        // OKX sends the newest bar first; indicators and charts read oldest first.
        candles.Reverse();
        return candles;
    }

    public async Task<IReadOnlyList<Instrument>> GetInstrumentsAsync(string instrumentType, CancellationToken cancellationToken)
    {
        using var document = await GetAsync($"/api/v5/public/instruments?instType={Escape(instrumentType)}", signed: false, cancellationToken).ConfigureAwait(false);
        return
        [
            .. Data(document).EnumerateArray().Select(item => new Instrument(
                Text(item, "instId"),
                Text(item, "instType"),
                Text(item, "baseCcy"),
                Text(item, "quoteCcy"),
                Text(item, "state"),
                Number(item, "tickSz"),
                Number(item, "lotSz"),
                Number(item, "minSz"))),
        ];
    }

    public async Task<AccountBalance> GetBalanceAsync(CancellationToken cancellationToken)
    {
        using var document = await GetAsync("/api/v5/account/balance", signed: true, cancellationToken).ConfigureAwait(false);
        var data = Data(document);
        if (data.GetArrayLength() == 0)
        {
            return new AccountBalance(0, []);
        }

        var account = data[0];
        var assets = new List<AssetBalance>();
        if (account.TryGetProperty("details", out var details) && details.ValueKind == JsonValueKind.Array)
        {
            foreach (var detail in details.EnumerateArray())
            {
                assets.Add(new AssetBalance(Text(detail, "ccy"), Number(detail, "eq"), Number(detail, "availBal"), Number(detail, "eqUsd")));
            }
        }

        return new AccountBalance(Number(account, "totalEq"), assets);
    }

    public async Task<IReadOnlyList<Position>> GetPositionsAsync(string? instrumentType, CancellationToken cancellationToken)
    {
        var path = string.IsNullOrEmpty(instrumentType)
            ? "/api/v5/account/positions"
            : $"/api/v5/account/positions?instType={Escape(instrumentType)}";
        using var document = await GetAsync(path, signed: true, cancellationToken).ConfigureAwait(false);
        return
        [
            .. Data(document).EnumerateArray().Select(item => new Position(
                Text(item, "instId"),
                Text(item, "instType"),
                Text(item, "posSide"),
                Number(item, "pos"),
                Number(item, "avgPx"),
                Number(item, "markPx"),
                Number(item, "upl"),
                Number(item, "lever"))),
        ];
    }

    public async Task<IReadOnlyList<OkxOrder>> GetOpenOrdersAsync(string instrumentType, string? instrumentId, CancellationToken cancellationToken)
    {
        var path = $"/api/v5/trade/orders-pending?instType={Escape(instrumentType)}";
        if (!string.IsNullOrEmpty(instrumentId))
        {
            path += $"&instId={Escape(instrumentId)}";
        }

        using var document = await GetAsync(path, signed: true, cancellationToken).ConfigureAwait(false);
        return [.. Data(document).EnumerateArray().Select(ReadOrder)];
    }

    public async Task<IReadOnlyList<OkxOrder>> GetOrderHistoryAsync(string instrumentType, int limit, CancellationToken cancellationToken)
    {
        var count = Math.Clamp(limit, 1, 100).ToString(CultureInfo.InvariantCulture);
        using var document = await GetAsync(
            $"/api/v5/trade/orders-history?instType={Escape(instrumentType)}&limit={count}",
            signed: true,
            cancellationToken).ConfigureAwait(false);
        return [.. Data(document).EnumerateArray().Select(ReadOrder)];
    }

    public async Task<IReadOnlyList<OkxAlgoOrder>> GetPendingAlgoOrdersAsync(string instrumentType, string orderType, CancellationToken cancellationToken)
    {
        using var document = await GetAsync(
            $"/api/v5/trade/orders-algo-pending?instType={Escape(instrumentType)}&ordType={Escape(orderType)}",
            signed: true,
            cancellationToken).ConfigureAwait(false);
        return
        [
            .. Data(document).EnumerateArray().Select(item => new OkxAlgoOrder(
                Text(item, "algoId"),
                Text(item, "algoClOrdId"),
                Text(item, "instId"),
                Text(item, "instType"),
                Text(item, "side"),
                Text(item, "ordType"),
                Text(item, "state"),
                Number(item, "sz"),
                FirstNumber(item, "triggerPx", "slTriggerPx", "tpTriggerPx"),
                Int64(item, "cTime"))),
        ];
    }

    /// <summary>The value of the <c>OK-ACCESS-SIGN</c> header: Base64 of HMAC-SHA256 over time, method, path and body.</summary>
    internal static string Sign(string secretKey, string timestamp, string method, string pathAndQuery, string body = "")
    {
        var hash = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secretKey), Encoding.UTF8.GetBytes(timestamp + method + pathAndQuery + body));
        return Convert.ToBase64String(hash);
    }

    private async Task<JsonDocument> GetAsync(string pathAndQuery, bool signed, CancellationToken cancellationToken)
    {
        try
        {
            return await SendOnceAsync(pathAndQuery, signed, cancellationToken).ConfigureAwait(false);
        }
        catch (OkxException ex) when (ex.Failure is OkxFailure.Network or OkxFailure.RateLimited)
        {
            // Reads are safe to repeat. One retry covers a dropped connection and a short burst limit.
            LogRetry(_logger, ex.Failure, _retryDelay.TotalSeconds);
            await Task.Delay(_retryDelay, _time, cancellationToken).ConfigureAwait(false);
            return await SendOnceAsync(pathAndQuery, signed, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<JsonDocument> SendOnceAsync(string pathAndQuery, bool signed, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseAddress, pathAndQuery));
        if (_sandbox())
        {
            request.Headers.TryAddWithoutValidation("x-simulated-trading", "1");
        }

        if (signed)
        {
            var credentials = _credentials()
                ?? throw new OkxException(OkxFailure.Credentials, "No OKX API key is saved. Add one in Settings.");
            // OKX rejects a timestamp more than 30 seconds off, so it is taken as late as possible.
            var timestamp = _time.GetUtcNow().UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
            request.Headers.TryAddWithoutValidation("OK-ACCESS-KEY", credentials.ApiKey);
            request.Headers.TryAddWithoutValidation("OK-ACCESS-SIGN", Sign(credentials.SecretKey, timestamp, "GET", pathAndQuery));
            request.Headers.TryAddWithoutValidation("OK-ACCESS-TIMESTAMP", timestamp);
            request.Headers.TryAddWithoutValidation("OK-ACCESS-PASSPHRASE", credentials.Passphrase);
        }

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            throw new OkxException(OkxFailure.Network, "OKX could not be reached. Check the internet connection.", null, ex);
        }
        catch (OperationCanceledException ex) when (!cancellationToken.IsCancellationRequested)
        {
            throw new OkxException(OkxFailure.Network, "OKX did not answer in time.", null, ex);
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(cancellationToken).ConfigureAwait(false);
            JsonDocument document;
            try
            {
                document = JsonDocument.Parse(text);
            }
            catch (JsonException ex)
            {
                throw response.StatusCode == HttpStatusCode.TooManyRequests
                    ? new OkxException(OkxFailure.RateLimited, "OKX's request limit was reached. Try again in a moment.", null, ex)
                    : new OkxException(
                        OkxFailure.Network,
                        string.Create(CultureInfo.InvariantCulture, $"OKX sent an answer that could not be read (HTTP {(int)response.StatusCode})."),
                        null,
                        ex);
            }

            var root = document.RootElement;
            var code = root.ValueKind == JsonValueKind.Object ? Text(root, "code") : string.Empty;
            if (code == "0" && response.IsSuccessStatusCode)
            {
                return document;
            }

            var message = root.ValueKind == JsonValueKind.Object ? Text(root, "msg") : string.Empty;
            document.Dispose();
            throw Failure(response.StatusCode, code, message);
        }
    }

    private static OkxException Failure(HttpStatusCode status, string code, string message)
    {
        // OKX error codes: 50011 and 50013 are request limits and "system busy"; 501xx are about the
        // key, the signature, the passphrase and the timestamp.
        if (status == HttpStatusCode.TooManyRequests || code is "50011" or "50013")
        {
            return new OkxException(OkxFailure.RateLimited, "OKX's request limit was reached. Try again in a moment.", code);
        }

        if (status is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden || code.StartsWith("501", StringComparison.Ordinal))
        {
            return new OkxException(
                OkxFailure.Credentials,
                $"OKX rejected the API key ({code}: {message}). Check the key, and that it belongs to the selected mode (demo or live).",
                code);
        }

        if ((int)status >= 500)
        {
            return new OkxException(OkxFailure.Network, "OKX has a problem right now. Try again in a moment.", code);
        }

        return new OkxException(
            OkxFailure.Rejected,
            message.Length == 0
                ? string.Create(CultureInfo.InvariantCulture, $"OKX refused the request (HTTP {(int)status}, code {code}).")
                : $"OKX refused the request: {message} (code {code}).",
            code);
    }

    private static JsonElement Data(JsonDocument document) =>
        document.RootElement.TryGetProperty("data", out var data) && data.ValueKind == JsonValueKind.Array
            ? data
            : throw new OkxException(OkxFailure.Network, "OKX sent an answer without data.");

    private static Ticker ReadTicker(JsonElement item) => new(
        Text(item, "instId"),
        Number(item, "last"),
        Number(item, "bidPx"),
        Number(item, "askPx"),
        Number(item, "open24h"),
        Number(item, "high24h"),
        Number(item, "low24h"),
        Number(item, "vol24h"),
        Int64(item, "ts"));

    private static OkxOrder ReadOrder(JsonElement item) => new(
        Text(item, "ordId"),
        Text(item, "clOrdId"),
        Text(item, "instId"),
        Text(item, "instType"),
        Text(item, "side"),
        Text(item, "ordType"),
        Text(item, "state"),
        Number(item, "px"),
        Number(item, "sz"),
        Number(item, "accFillSz"),
        Number(item, "avgPx"),
        Int64(item, "cTime"),
        Int64(item, "uTime"));

    private static List<BookLevel> ReadLevels(JsonElement book, string side)
    {
        var levels = new List<BookLevel>();
        if (book.TryGetProperty(side, out var rows) && rows.ValueKind == JsonValueKind.Array)
        {
            foreach (var row in rows.EnumerateArray())
            {
                if (row.ValueKind == JsonValueKind.Array && row.GetArrayLength() >= 2)
                {
                    levels.Add(new BookLevel(Number(row[0]), Number(row[1])));
                }
            }
        }

        return levels;
    }

    private static string Escape(string value) => Uri.EscapeDataString(value);

    private static string Text(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;

    // OKX sends numbers as strings, and an empty string where there is no value.
    private static decimal Number(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.String => decimal.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed) ? parsed : 0,
        JsonValueKind.Number => value.TryGetDecimal(out var number) ? number : 0,
        _ => 0,
    };

    private static decimal Number(JsonElement item, string name) => item.TryGetProperty(name, out var value) ? Number(value) : 0;

    private static decimal FirstNumber(JsonElement item, params ReadOnlySpan<string> names)
    {
        foreach (var name in names)
        {
            var number = Number(item, name);
            if (number != 0)
            {
                return number;
            }
        }

        return 0;
    }

    private static long Int64(JsonElement item, string name) =>
        item.TryGetProperty(name, out var value)
        && value.ValueKind == JsonValueKind.String
        && long.TryParse(value.GetString(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)
            ? parsed
            : 0;

    [LoggerMessage(Level = LogLevel.Warning, Message = "A request to OKX failed ({Failure}); retrying once in {Seconds} s.")]
    private static partial void LogRetry(ILogger logger, OkxFailure failure, double seconds);
}
