using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.App.Hosting;
using TradingAgent.Core.Hosting;
using Xunit;

namespace TradingAgent.App.Tests;

public sealed class BackgroundServiceHostTests
{
    [Fact]
    public async Task Services_start_in_order_and_stop_in_reverse()
    {
        var log = new List<string>();
        using var host = NewHost(new Recording("a", log), new Recording("b", log), new Recording("c", log));

        await host.StartAsync();
        await host.StopAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(["start a", "start b", "start c", "stop c", "stop b", "stop a"], log);
    }

    [Fact]
    public async Task A_service_that_fails_to_start_does_not_stop_the_others_and_is_not_stopped_itself()
    {
        var log = new List<string>();
        using var host = NewHost(
            new Recording("a", log),
            new Recording("broken", log) { FailStart = true },
            new Recording("c", log));

        await host.StartAsync();
        await host.StopAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(["start a", "start broken", "start c", "stop c", "stop a"], log);
    }

    [Fact]
    public async Task A_service_that_fails_to_stop_does_not_keep_the_others_running()
    {
        var log = new List<string>();
        using var host = NewHost(new Recording("a", log), new Recording("broken", log) { FailStop = true });

        await host.StartAsync();
        await host.StopAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(["start a", "start broken", "stop broken", "stop a"], log);
    }

    [Fact]
    public async Task Stopping_cancels_the_token_the_services_were_started_with()
    {
        var service = new Recording("a", []);
        using var host = NewHost(service);
        await host.StartAsync();
        Assert.False(service.Stopping.IsCancellationRequested);

        await host.StopAsync(TimeSpan.FromSeconds(5));

        Assert.True(service.Stopping.IsCancellationRequested);
    }

    [Fact]
    public async Task A_service_that_never_stops_is_given_up_on_after_the_timeout()
    {
        var log = new List<string>();
        using var host = NewHost(new Recording("a", log), new Recording("stuck", log) { HangStop = true });
        await host.StartAsync();

        var stop = host.StopAsync(TimeSpan.FromMilliseconds(100));
        var finished = await Task.WhenAny(stop, Task.Delay(TimeSpan.FromSeconds(10), TestContext.Current.CancellationToken));

        Assert.Same(stop, finished);
        Assert.Equal(["start a", "start stuck", "stop stuck", "stop a"], log);
    }

    [Fact]
    public async Task Stopping_twice_stops_each_service_once()
    {
        var log = new List<string>();
        using var host = NewHost(new Recording("a", log));
        await host.StartAsync();

        await host.StopAsync(TimeSpan.FromSeconds(5));
        await host.StopAsync(TimeSpan.FromSeconds(5));

        Assert.Equal(["start a", "stop a"], log);
    }

    private static BackgroundServiceHost NewHost(params IBackgroundService[] services) =>
        new(services, NullLogger<BackgroundServiceHost>.Instance);

    private sealed class Recording(string name, List<string> log) : IBackgroundService
    {
        public bool FailStart { get; init; }

        public bool FailStop { get; init; }

        public bool HangStop { get; init; }

        public CancellationToken Stopping { get; private set; }

        public string Name => name;

        public Task StartAsync(CancellationToken stopping)
        {
            Stopping = stopping;
            log.Add($"start {name}");
            return FailStart ? Task.FromException(new InvalidOperationException("cannot start")) : Task.CompletedTask;
        }

        public Task StopAsync(CancellationToken deadline)
        {
            log.Add($"stop {name}");
            if (FailStop)
            {
                return Task.FromException(new InvalidOperationException("cannot stop"));
            }

            // Ignores the deadline on purpose: the host must not rely on a service honouring it.
            return HangStop ? new TaskCompletionSource().Task : Task.CompletedTask;
        }
    }
}
