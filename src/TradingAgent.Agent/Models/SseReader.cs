using System.Runtime.CompilerServices;
using System.Text;

namespace TradingAgent.Agent.Models;

/// <summary>One server-sent event: its name (empty when the stream gave none) and its data.</summary>
internal readonly record struct SseEvent(string Name, string Data);

/// <summary>Reads a server-sent event stream (the <c>text/event-stream</c> format).</summary>
internal static class SseReader
{
    /// <summary>
    /// Yields each event as it completes. Comment lines and fields other than <c>event</c> and
    /// <c>data</c> are ignored; several <c>data</c> lines of one event are joined with newlines.
    /// </summary>
    public static async IAsyncEnumerable<SseEvent> ReadAsync(
        Stream stream,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        using var reader = new StreamReader(stream, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 8192, leaveOpen: true);
        var name = string.Empty;
        StringBuilder? data = null;

        while (await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false) is { } line)
        {
            if (line.Length == 0)
            {
                // A blank line ends the event.
                if (data is not null)
                {
                    yield return new SseEvent(name, data.ToString());
                }

                name = string.Empty;
                data = null;
                continue;
            }

            if (line[0] == ':')
            {
                continue; // comment, used by servers as a keep-alive
            }

            var colon = line.IndexOf(':', StringComparison.Ordinal);
            var field = colon < 0 ? line : line[..colon];
            var value = colon < 0 ? string.Empty : line[(colon + 1)..];
            if (value.StartsWith(' '))
            {
                value = value[1..];
            }

            if (field == "event")
            {
                name = value;
            }
            else if (field == "data")
            {
                if (data is null)
                {
                    data = new StringBuilder(value);
                }
                else
                {
                    data.Append('\n').Append(value);
                }
            }
        }

        // A stream that ends without the final blank line still delivers its last event.
        if (data is not null)
        {
            yield return new SseEvent(name, data.ToString());
        }
    }
}
