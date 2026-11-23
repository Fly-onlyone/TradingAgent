using TradingAgent.Core.Logging;

namespace TradingAgent.App.Telemetry;

/// <summary>The one place where data bound for Sentry is stripped of anything personal or secret.</summary>
/// <remarks>
/// Used for errors, transactions, breadcrumbs and logs alike, so a rule added here covers all four.
/// What it guarantees: no machine name, no user field except a random installation id, no cookies, request
/// bodies or query strings, no credentials in any message, and no user-profile path (which contains the
/// Windows account name).
/// </remarks>
internal static class SentryScrubber
{
    private static readonly string[] _queryKeys = ["http.query", "http.fragment", "url.query"];
    private static readonly string[] _urlKeys = ["url", "http.url", "url.full", "http.target", "from", "to"];
    private static readonly string[] _sensitiveHeaders = ["Authorization", "Cookie", "Referer"];

    public static SentryEvent ScrubEvent(SentryEvent sentryEvent, string installId)
    {
        sentryEvent.ServerName = null;
        sentryEvent.User = new SentryUser { Id = installId };
        ScrubRequest(sentryEvent.Request);
        ScrubDevice(sentryEvent.Contexts);

        if (sentryEvent.Message is { } message)
        {
            // Params are dropped: they are the raw values behind the formatted text.
            sentryEvent.Message = new SentryMessage
            {
                Message = RedactOrNull(message.Message),
                Formatted = RedactOrNull(message.Formatted),
            };
        }

        // Loaded modules are listed with their full path. The app is installed under the profile folder,
        // so the path contains the Windows account name. The file name is all Sentry needs to show.
        if (sentryEvent.DebugImages is { } images)
        {
            foreach (var image in images)
            {
                image.CodeFile = FileNameOnly(image.CodeFile);
                image.DebugFile = FileNameOnly(image.DebugFile);
            }
        }

        if (sentryEvent.SentryExceptions is { } exceptions)
        {
            foreach (var exception in exceptions)
            {
                exception.Value = RedactOrNull(exception.Value);
            }
        }

        return sentryEvent;
    }

    public static SentryTransaction ScrubTransaction(SentryTransaction transaction, string installId)
    {
        transaction.User = new SentryUser { Id = installId };
        ScrubRequest(transaction.Request);
        ScrubDevice(transaction.Contexts);

        foreach (var span in transaction.Spans)
        {
            foreach (var key in _queryKeys)
            {
                if (span.Data.ContainsKey(key))
                {
                    span.SetData(key, null);
                }
            }

            foreach (var key in _urlKeys)
            {
                if (span.Data.TryGetValue(key, out var value) && value is string url)
                {
                    span.SetData(key, UrlScrubber.StripQueryAndFragment(url));
                }
            }

            // HTTP spans are described as "GET https://host/path?query".
            if (span.Description is { } description)
            {
                span.Description = Redactor.Redact(UrlScrubber.StripQueryAndFragment(description));
            }
        }

        return transaction;
    }

    public static Breadcrumb ScrubBreadcrumb(Breadcrumb breadcrumb)
    {
        Dictionary<string, string>? data = null;
        if (breadcrumb.Data is { Count: > 0 } original)
        {
            data = new Dictionary<string, string>(original.Count, StringComparer.Ordinal);
            foreach (var (key, value) in original)
            {
                if (Array.IndexOf(_queryKeys, key) >= 0)
                {
                    continue;
                }

                data[key] = Array.IndexOf(_urlKeys, key) >= 0
                    ? UrlScrubber.StripQueryAndFragment(value)
                    : Redactor.Redact(value);
            }
        }

        // A breadcrumb is immutable, so a clean copy replaces it. The copy is stamped "now", which is right:
        // this runs at the moment the breadcrumb is recorded.
        return new Breadcrumb(
            RedactOrNull(breadcrumb.Message) ?? string.Empty,
            breadcrumb.Type ?? string.Empty,
            data,
            breadcrumb.Category,
            breadcrumb.Level);
    }

    private static void ScrubRequest(SentryRequest request)
    {
        request.Cookies = null;
        request.Data = null;
        request.QueryString = null;
        if (request.Url is { } url)
        {
            request.Url = UrlScrubber.StripQueryAndFragment(url);
        }

        foreach (var header in _sensitiveHeaders)
        {
            request.Headers.Remove(header);
        }
    }

    private static void ScrubDevice(SentryContexts contexts)
    {
        // The device name is the computer name, which is often the owner's name.
        contexts.Device.Name = null;
        contexts.Device.DeviceUniqueIdentifier = null;
        // The time zone says roughly where the user lives and helps no diagnosis: all app times are UTC.
        contexts.Device.Timezone = null;
    }

    private static string? FileNameOnly(string? path) => path is null ? null : Path.GetFileName(path);

    private static string? RedactOrNull(string? text) => text is null ? null : Redactor.Redact(text);
}
