using TradingAgent.Core;
using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class AppInfoTests
{
    [Theory]
    [InlineData("0.1.2", "0.1.2")]
    [InlineData("0.1.2+3f9c1ab7", "0.1.2")]
    [InlineData("1.0.0-rc.1+build.5", "1.0.0-rc.1")]
    [InlineData(null, "0.0.0")]
    [InlineData("  ", "0.0.0")]
    public void NormalizeVersion_drops_build_metadata(string? informational, string expected)
    {
        Assert.Equal(expected, AppInfo.NormalizeVersion(informational));
    }

    [Fact]
    public void FromAssembly_reads_the_stamped_version()
    {
        var info = AppInfo.FromAssembly(typeof(AppInfo).Assembly, isDevelopmentBuild: false);

        Assert.Matches(@"^\d+\.\d+\.\d+", info.Version);
        Assert.DoesNotContain('+', info.Version);
        Assert.Equal("Release", info.BuildMode);
    }

    [Fact]
    public void Development_build_reports_debug()
    {
        var info = new AppInfo("1.2.3", IsDevelopmentBuild: true);

        Assert.Equal("Debug", info.BuildMode);
    }
}
