using TradingAgent.Core.Tasks;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class TaskScheduleTests
{
    // Seven hours ahead of UTC, no summer time: 09:00 here is 02:00 UTC.
    private static readonly TimeZoneInfo _zone = TimeZoneInfo.CreateCustomTimeZone("test", TimeSpan.FromHours(7), "test", "test");

    // A Monday.
    private static readonly DateTimeOffset _mondayNoonUtc = new(2026, 11, 23, 12, 0, 0, TimeSpan.Zero);

    [Fact]
    public void Schedules_survive_being_stored_and_read_back()
    {
        IReadOnlyList<TaskSchedule> schedules =
        [
            TaskSchedule.Every(90),
            TaskSchedule.DailyAt(new TimeOnly(9, 5)),
            TaskSchedule.WeeklyAt(new TimeOnly(21, 30), [DayOfWeek.Monday, DayOfWeek.Friday]),
        ];

        var json = TaskSchedule.Serialize(schedules);
        var read = TaskSchedule.Parse(json);

        Assert.Equal(
            """[{"kind":"interval","minutes":90},{"kind":"daily","time":"09:05"},{"kind":"weekly","time":"21:30","days":["mon","fri"]}]""",
            json);
        Assert.Equal(["every 90 minutes", "every day at 09:05", "mon, fri at 21:30"], read.Select(schedule => schedule.Describe()));
    }

    [Theory]
    [InlineData("")]
    [InlineData("not json")]
    [InlineData("""{"kind":"daily","time":"09:00"}""")]
    [InlineData("""[{"kind":"interval","minutes":0}]""")]
    [InlineData("""[{"kind":"daily","time":"25:00"}]""")]
    [InlineData("""[{"kind":"weekly","time":"09:00","days":[]}]""")]
    [InlineData("""[{"kind":"weekly","time":"09:00","days":["someday"]}]""")]
    [InlineData("""[{"kind":"monthly"}]""")]
    public void A_schedule_that_makes_no_sense_is_no_schedule(string json)
    {
        Assert.Empty(TaskSchedule.Parse(json));
    }

    [Fact]
    public void One_bad_entry_does_not_take_the_good_ones_with_it()
    {
        var read = TaskSchedule.Parse("""[{"kind":"nonsense"},{"kind":"interval","minutes":15},42]""");

        Assert.Equal(15, Assert.Single(read).Minutes);
    }

    [Fact]
    public void An_interval_runs_so_many_minutes_after_the_last_time()
    {
        Assert.Equal(_mondayNoonUtc.AddMinutes(45), TaskSchedule.Every(45).Next(_mondayNoonUtc, _zone));
    }

    [Fact]
    public void A_daily_time_is_read_in_the_tasks_time_zone()
    {
        // Monday 12:00 UTC is Monday 19:00 there: 09:00 has passed, 20:00 has not.
        Assert.Equal(new DateTimeOffset(2026, 11, 24, 2, 0, 0, TimeSpan.Zero), TaskSchedule.DailyAt(new TimeOnly(9, 0)).Next(_mondayNoonUtc, _zone));
        Assert.Equal(new DateTimeOffset(2026, 11, 23, 13, 0, 0, TimeSpan.Zero), TaskSchedule.DailyAt(new TimeOnly(20, 0)).Next(_mondayNoonUtc, _zone));
    }

    [Fact]
    public void The_next_run_is_strictly_after_the_given_moment()
    {
        var nineLocal = new DateTimeOffset(2026, 11, 23, 2, 0, 0, TimeSpan.Zero);

        Assert.Equal(nineLocal.AddDays(1), TaskSchedule.DailyAt(new TimeOnly(9, 0)).Next(nineLocal, _zone));
    }

    [Fact]
    public void A_weekly_schedule_waits_for_one_of_its_days()
    {
        var schedule = TaskSchedule.WeeklyAt(new TimeOnly(9, 0), [DayOfWeek.Thursday, DayOfWeek.Sunday]);

        var first = schedule.Next(_mondayNoonUtc, _zone)!.Value;
        var second = schedule.Next(first, _zone)!.Value;

        Assert.Equal(new DateTimeOffset(2026, 11, 26, 2, 0, 0, TimeSpan.Zero), first);
        Assert.Equal(new DateTimeOffset(2026, 11, 29, 2, 0, 0, TimeSpan.Zero), second);
    }

    [Fact]
    public void Several_schedules_run_at_the_earliest_of_them()
    {
        IReadOnlyList<TaskSchedule> schedules = [TaskSchedule.DailyAt(new TimeOnly(9, 0)), TaskSchedule.Every(30)];

        Assert.Equal(_mondayNoonUtc.AddMinutes(30), TaskSchedule.Next(schedules, _mondayNoonUtc, _zone));
        Assert.Null(TaskSchedule.Next([], _mondayNoonUtc, _zone));
    }

    [Theory]
    [InlineData("mon", DayOfWeek.Monday)]
    [InlineData("Sunday", DayOfWeek.Sunday)]
    [InlineData(" FRI ", DayOfWeek.Friday)]
    public void Weekdays_are_read_short_or_long(string text, DayOfWeek expected)
    {
        Assert.True(TaskSchedule.TryParseDay(text, out var day));
        Assert.Equal(expected, day);
        Assert.False(TaskSchedule.TryParseDay("xx", out _));
    }
}
