using Xunit;

namespace TradingAgent.Core.Tests;

public sealed class AppPathsTests
{
    [Fact]
    public void Release_and_debug_builds_use_different_data_folders()
    {
        var root = Path.Combine("C:", "Users", "someone", "AppData", "Local");

        var release = new AppPaths(root, isDevelopmentBuild: false);
        var debug = new AppPaths(root, isDevelopmentBuild: true);

        Assert.Equal(Path.Combine(root, "TradingAgent"), release.DataDirectory);
        Assert.Equal(Path.Combine(root, "TradingAgent-Dev"), debug.DataDirectory);
    }

    [Fact]
    public void Database_and_logs_live_inside_the_data_folder()
    {
        var paths = new AppPaths(Path.GetTempPath(), isDevelopmentBuild: true);

        Assert.Equal(Path.Combine(paths.DataDirectory, "trading-agent.db"), paths.DatabaseFile);
        Assert.Equal(Path.Combine(paths.DataDirectory, "logs"), paths.LogDirectory);
    }

    [Fact]
    public void EnsureCreated_creates_the_data_and_log_folders()
    {
        var root = Path.Combine(Path.GetTempPath(), "trading-agent-tests", Guid.NewGuid().ToString("N"));
        try
        {
            var paths = new AppPaths(root, isDevelopmentBuild: false);

            paths.EnsureCreated();

            Assert.True(Directory.Exists(paths.DataDirectory));
            Assert.True(Directory.Exists(paths.LogDirectory));
        }
        finally
        {
            if (Directory.Exists(root))
            {
                Directory.Delete(root, recursive: true);
            }
        }
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Blank_root_is_rejected(string root)
    {
        Assert.Throws<ArgumentException>(() => new AppPaths(root, isDevelopmentBuild: false));
    }
}
