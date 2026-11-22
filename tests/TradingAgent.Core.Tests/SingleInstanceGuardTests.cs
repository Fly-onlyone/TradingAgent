using TradingAgent.Core.Shell;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class SingleInstanceGuardTests
{
    private static readonly TimeSpan _timeout = TimeSpan.FromSeconds(5);

    [Fact]
    public void Only_the_first_guard_acquires()
    {
        var id = NewId();
        using var first = new SingleInstanceGuard(id);
        using var second = new SingleInstanceGuard(id);

        Assert.True(first.TryAcquire());
        Assert.True(first.TryAcquire()); // asking again does not lose the lock
        Assert.False(second.TryAcquire());
    }

    [Fact]
    public void Different_applications_do_not_block_each_other()
    {
        using var app = new SingleInstanceGuard(NewId());
        using var devBuild = new SingleInstanceGuard(NewId());

        Assert.True(app.TryAcquire());
        Assert.True(devBuild.TryAcquire());
    }

    [Fact]
    public async Task A_second_launch_wakes_the_first_instance_every_time()
    {
        var id = NewId();
        using var first = new SingleInstanceGuard(id);
        var activations = new SemaphoreSlim(0);
        first.ActivationRequested += (_, _) => activations.Release();
        Assert.True(first.TryAcquire());

        for (var launch = 0; launch < 3; launch++)
        {
            Assert.True(SingleInstanceGuard.SignalFirstInstance(id, _timeout));
            Assert.True(await activations.WaitAsync(_timeout, TestContext.Current.CancellationToken));
        }
    }

    [Fact]
    public void Signalling_when_nothing_runs_reports_failure()
    {
        Assert.False(SingleInstanceGuard.SignalFirstInstance(NewId(), TimeSpan.FromMilliseconds(200)));
    }

    [Fact]
    public void The_lock_is_free_again_after_the_first_instance_ends()
    {
        var id = NewId();
        using (var first = new SingleInstanceGuard(id))
        {
            Assert.True(first.TryAcquire());
        }

        using var next = new SingleInstanceGuard(id);

        Assert.True(next.TryAcquire());
    }

    private static string NewId() => $"TradingAgent.Tests.{Guid.NewGuid():N}";
}
