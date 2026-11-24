using System.Globalization;
using System.Text;
using System.Text.Json;

namespace TradingAgent.Core.Tasks;

/// <summary>When a scheduled task runs: every so many minutes, every day at a time, or on some weekdays at a time.</summary>
/// <remarks>
/// Stored as JSON in the task: <c>[{"kind":"interval","minutes":60}]</c>,
/// <c>[{"kind":"daily","time":"09:00"}]</c> or <c>[{"kind":"weekly","time":"09:00","days":["mon","thu"]}]</c>.
/// A task with several schedules runs at the earliest of them.
/// </remarks>
public sealed record TaskSchedule
{
    public const string Interval = "interval";
    public const string Daily = "daily";
    public const string Weekly = "weekly";

    private static readonly string[] _dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

    public required string Kind { get; init; }

    /// <summary>For <see cref="Interval"/>: minutes between two runs, at least one.</summary>
    public int Minutes { get; init; }

    /// <summary>For <see cref="Daily"/> and <see cref="Weekly"/>: the time of day, in the task's time zone.</summary>
    public TimeOnly Time { get; init; }

    /// <summary>For <see cref="Weekly"/>: the days it runs on.</summary>
    public IReadOnlyList<DayOfWeek> Days { get; init; } = [];

    public static TaskSchedule Every(int minutes) => new() { Kind = Interval, Minutes = Math.Max(1, minutes) };

    public static TaskSchedule DailyAt(TimeOnly time) => new() { Kind = Daily, Time = time };

    public static TaskSchedule WeeklyAt(TimeOnly time, IReadOnlyList<DayOfWeek> days) => new() { Kind = Weekly, Time = time, Days = days };

    /// <summary>Reads "mon", "Monday", "MON" and the like.</summary>
    public static bool TryParseDay(string? text, out DayOfWeek day)
    {
        day = default;
        if (text is null || text.Trim().Length < 3)
        {
            return false;
        }

        var index = Array.IndexOf(_dayNames, text.Trim()[..3].ToLowerInvariant());
        if (index < 0)
        {
            return false;
        }

        day = (DayOfWeek)index;
        return true;
    }

    /// <summary>Reads "9:00", "09:00" and "21:30".</summary>
    public static bool TryParseTime(string? text, out TimeOnly time) =>
        TimeOnly.TryParseExact(text?.Trim(), ["H:mm", "HH:mm"], CultureInfo.InvariantCulture, DateTimeStyles.None, out time);

    /// <summary>Reads the stored JSON. An entry that makes no sense is left out, so one bad entry cannot stop a task.</summary>
    public static IReadOnlyList<TaskSchedule> Parse(string? json)
    {
        var schedules = new List<TaskSchedule>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return schedules;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind != JsonValueKind.Array)
            {
                return schedules;
            }

            foreach (var item in document.RootElement.EnumerateArray())
            {
                if (Read(item) is { } schedule)
                {
                    schedules.Add(schedule);
                }
            }
        }
        catch (JsonException)
        {
            // Nothing readable: no schedule.
        }

        return schedules;
    }

    /// <summary>Reads one schedule from a JSON object, as a model or the database gives it. Null when it makes no sense.</summary>
    public static TaskSchedule? Read(JsonElement item)
    {
        if (item.ValueKind != JsonValueKind.Object || !item.TryGetProperty("kind", out var kind) || kind.ValueKind != JsonValueKind.String)
        {
            return null;
        }

        var time = item.TryGetProperty("time", out var timeValue) && timeValue.ValueKind == JsonValueKind.String ? timeValue.GetString() : null;
        switch (kind.GetString())
        {
            case Interval:
                var minutes = item.TryGetProperty("minutes", out var value) && value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)
                    ? number
                    : 0;
                return minutes >= 1 ? Every(minutes) : null;

            case Daily:
                return TryParseTime(time, out var daily) ? DailyAt(daily) : null;

            case Weekly:
                var days = new List<DayOfWeek>();
                if (item.TryGetProperty("days", out var list) && list.ValueKind == JsonValueKind.Array)
                {
                    foreach (var entry in list.EnumerateArray())
                    {
                        if (entry.ValueKind == JsonValueKind.String && TryParseDay(entry.GetString(), out var day) && !days.Contains(day))
                        {
                            days.Add(day);
                        }
                    }
                }

                return days.Count > 0 && TryParseTime(time, out var weekly) ? WeeklyAt(weekly, days) : null;

            default:
                return null;
        }
    }

    public static string Serialize(IReadOnlyList<TaskSchedule> schedules)
    {
        ArgumentNullException.ThrowIfNull(schedules);
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartArray();
            foreach (var schedule in schedules)
            {
                writer.WriteStartObject();
                writer.WriteString("kind", schedule.Kind);
                if (schedule.Kind == Interval)
                {
                    writer.WriteNumber("minutes", schedule.Minutes);
                }
                else
                {
                    writer.WriteString("time", schedule.Time.ToString("HH:mm", CultureInfo.InvariantCulture));
                }

                if (schedule.Kind == Weekly)
                {
                    writer.WriteStartArray("days");
                    foreach (var day in schedule.Days)
                    {
                        writer.WriteStringValue(_dayNames[(int)day]);
                    }

                    writer.WriteEndArray();
                }

                writer.WriteEndObject();
            }

            writer.WriteEndArray();
        }

        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }

    /// <summary>The earliest next run of several schedules; null when there is none.</summary>
    public static DateTimeOffset? Next(IEnumerable<TaskSchedule> schedules, DateTimeOffset after, TimeZoneInfo zone)
    {
        ArgumentNullException.ThrowIfNull(schedules);
        DateTimeOffset? earliest = null;
        foreach (var schedule in schedules)
        {
            if (schedule.Next(after, zone) is { } next && (earliest is null || next < earliest))
            {
                earliest = next;
            }
        }

        return earliest;
    }

    /// <summary>The first run strictly after <paramref name="after"/>.</summary>
    public DateTimeOffset? Next(DateTimeOffset after, TimeZoneInfo zone)
    {
        ArgumentNullException.ThrowIfNull(zone);
        if (Kind == Interval)
        {
            return after.AddMinutes(Math.Max(1, Minutes));
        }

        if (Kind is not (Daily or Weekly) || (Kind == Weekly && Days.Count == 0))
        {
            return null;
        }

        var local = TimeZoneInfo.ConvertTime(after, zone);
        for (var offset = 0; offset <= 7; offset++)
        {
            var date = local.Date.AddDays(offset);
            if (Kind == Weekly && !Days.Contains(date.DayOfWeek))
            {
                continue;
            }

            var moment = date + Time.ToTimeSpan();
            // A time the clocks skip when summer time starts: run an hour later that day.
            if (zone.IsInvalidTime(moment))
            {
                moment = moment.AddHours(1);
            }

            var candidate = new DateTimeOffset(moment, zone.GetUtcOffset(moment));
            if (candidate > after)
            {
                return candidate;
            }
        }

        return null;
    }

    /// <summary>The schedule in words, for the task list.</summary>
    public string Describe() => Kind switch
    {
        Interval when Minutes % 1440 == 0 => Minutes == 1440 ? "every day" : $"every {Minutes / 1440} days",
        Interval when Minutes % 60 == 0 => Minutes == 60 ? "every hour" : $"every {Minutes / 60} hours",
        Interval => Minutes == 1 ? "every minute" : $"every {Minutes} minutes",
        Daily => $"every day at {Time.ToString("HH:mm", CultureInfo.InvariantCulture)}",
        Weekly => $"{string.Join(", ", Days.Select(day => _dayNames[(int)day]))} at {Time.ToString("HH:mm", CultureInfo.InvariantCulture)}",
        _ => Kind,
    };
}
