using TradingAgent.Agent.Atk;
using TradingAgent.Agent.Mcp;
using TradingAgent.Exchange.Okx;
using Xunit;

namespace TradingAgent.Agent.Tests;

public sealed class AtkLauncherTests
{
    private const string AppFolder = "/app";

    private static readonly string _kitScript = OperatingSystem.IsWindows() ? "okx-trade-mcp.cmd" : "okx-trade-mcp";
    private static readonly string _npx = OperatingSystem.IsWindows() ? "npx.cmd" : "npx";
    private static readonly string _bundled = Path.Combine(AppFolder, "atk", OperatingSystem.IsWindows() ? "launch.cmd" : "launch.sh");

    [Fact]
    public void A_copy_shipped_with_the_app_is_used_before_anything_on_the_machine()
    {
        var command = AtkCommandResolver.Resolve(AppFolder, isDevelopmentBuild: true, file => file == _bundled, name => "/usr/bin/" + name);

        Assert.NotNull(command);
        Assert.Equal((_bundled, "bundled"), (command.FileName, command.Source));
        Assert.Empty(command.Arguments);
    }

    [Fact]
    public void Without_a_shipped_copy_the_users_installed_one_is_used()
    {
        var command = AtkCommandResolver.Resolve(AppFolder, isDevelopmentBuild: false, _ => false, name => name == _kitScript ? "/tools/" + name : null);

        Assert.NotNull(command);
        Assert.Equal(("/tools/" + _kitScript, "path"), (command.FileName, command.Source));
        Assert.Empty(command.Arguments);
    }

    [Fact]
    public void A_development_build_falls_back_to_npx_with_the_pinned_version()
    {
        var command = AtkCommandResolver.Resolve(AppFolder, isDevelopmentBuild: true, _ => false, name => name == _npx ? "/node/" + name : null);

        Assert.NotNull(command);
        Assert.Equal(("/node/" + _npx, "npx"), (command.FileName, command.Source));
        // The exact version, never a range or "latest": the tool inventory was written for it.
        Assert.Equal(["-y", "@okx_ai/okx-trade-mcp@1.3.3"], command.Arguments);
    }

    [Fact]
    public void A_release_build_never_downloads_the_kit_even_when_npx_is_there()
    {
        var command = AtkCommandResolver.Resolve(AppFolder, isDevelopmentBuild: false, _ => false, name => name == _npx ? "/node/" + name : null);

        Assert.Null(command);
    }

    [Fact]
    public void Nothing_installed_means_no_command()
    {
        Assert.Null(AtkCommandResolver.Resolve(AppFolder, isDevelopmentBuild: true, _ => false, _ => null));
    }

    [Theory]
    [InlineData(true, "--demo", "--live")]
    [InlineData(false, "--live", "--demo")]
    public void The_trading_mode_is_always_said_outright(bool sandbox, string expected, string never)
    {
        var arguments = AtkCommandResolver.KitArguments(new AtkLaunchOptions(sandbox, "market,account", ReadOnly: false, Credentials: null));

        Assert.Contains(expected, arguments);
        Assert.DoesNotContain(never, arguments);
    }

    [Fact]
    public void The_kit_is_told_its_modules_a_profile_that_does_not_exist_and_to_keep_no_log()
    {
        var arguments = AtkCommandResolver.KitArguments(new AtkLaunchOptions(Sandbox: true, "market,account", ReadOnly: true, Credentials: null));

        Assert.Equal(["--modules", "market,account", "--profile", AtkCommandResolver.NoProfile, "--demo", "--no-log", "--read-only"], arguments);
    }

    [Fact]
    public void Read_only_is_passed_only_when_asked_for()
    {
        var arguments = AtkCommandResolver.KitArguments(new AtkLaunchOptions(Sandbox: true, "market", ReadOnly: false, Credentials: null));

        Assert.DoesNotContain("--read-only", arguments);
    }

    [Fact]
    public void The_key_is_never_among_the_arguments()
    {
        var credentials = new OkxCredentials("the-api-key", "the-secret-key", "the-passphrase");

        var arguments = AtkCommandResolver.KitArguments(new AtkLaunchOptions(Sandbox: false, "market", ReadOnly: true, credentials));

        // A command line can be read by other programs of the same machine; the environment of a
        // process cannot be read that easily, and is not written to any log.
        Assert.DoesNotContain(arguments, argument => argument.Contains("the-", StringComparison.Ordinal));
    }

    [Fact]
    public void The_key_goes_into_the_kits_environment_with_a_home_folder_of_its_own()
    {
        var environment = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase) { ["USERPROFILE"] = @"C:\Users\someone" };

        AtkProcessLauncher.ApplyEnvironment(environment, @"D:\data\trade-kit", new OkxCredentials("key", "secret", "pass \"word\" %PATH%"));

        Assert.Equal(@"D:\data\trade-kit", environment["USERPROFILE"]);
        Assert.Equal(@"D:\data\trade-kit", environment["HOME"]);
        Assert.Equal("key", environment["OKX_API_KEY"]);
        Assert.Equal("secret", environment["OKX_SECRET_KEY"]);
        // Passed as it is: an environment value needs no quoting and is not expanded.
        Assert.Equal("pass \"word\" %PATH%", environment["OKX_PASSPHRASE"]);
    }

    [Fact]
    public void Without_a_saved_key_no_key_reaches_the_kit_not_even_one_from_the_apps_own_environment()
    {
        var environment = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase)
        {
            ["OKX_API_KEY"] = "from-the-shell",
            ["OKX_SECRET_KEY"] = "from-the-shell",
            ["OKX_PASSPHRASE"] = "from-the-shell",
        };

        AtkProcessLauncher.ApplyEnvironment(environment, "/data/trade-kit", credentials: null);

        Assert.DoesNotContain("OKX_API_KEY", environment.Keys);
        Assert.DoesNotContain("OKX_SECRET_KEY", environment.Keys);
        Assert.DoesNotContain("OKX_PASSPHRASE", environment.Keys);
    }

    [Fact]
    public void A_tool_server_is_started_without_a_window_and_with_only_the_variables_it_needs()
    {
        const string Secret = "TRADINGAGENT_TEST_SECRET_TOKEN";
        Environment.SetEnvironmentVariable(Secret, "must-not-be-inherited");
        try
        {
            var start = ProcessTransport.CreateStartInfo("kit.cmd", ["--modules", "market"]);

            Assert.False(start.UseShellExecute);
            Assert.True(start.CreateNoWindow);
            Assert.True(start.RedirectStandardInput && start.RedirectStandardOutput && start.RedirectStandardError);
            Assert.Equal(["--modules", "market"], start.ArgumentList);
            Assert.DoesNotContain(Secret, start.Environment.Keys);
            Assert.Contains("PATH", start.Environment.Keys, StringComparer.OrdinalIgnoreCase);
            // Nothing outside the list, whatever the machine has set.
            Assert.All(start.Environment.Keys, name => Assert.Contains(name, ProcessTransport.InheritedVariables, StringComparer.OrdinalIgnoreCase));
        }
        finally
        {
            Environment.SetEnvironmentVariable(Secret, null);
        }
    }

    [Theory]
    [InlineData("OKX_API_KEY")]
    [InlineData("OKX_SECRET_KEY")]
    [InlineData("OKX_PASSPHRASE")]
    [InlineData("OKX_API_BASE_URL")]
    [InlineData("OKX_SITE")]
    [InlineData("ANTHROPIC_API_KEY")]
    [InlineData("OPENAI_API_KEY")]
    [InlineData("SENTRY_AUTH_TOKEN")]
    [InlineData("NODE_OPTIONS")]
    [InlineData("HTTPS_PROXY")]
    public void Variables_that_carry_keys_or_redirect_the_kit_are_not_inherited(string name)
    {
        // NODE_OPTIONS could load code into the kit; OKX_API_BASE_URL and a proxy could send the
        // signed requests somewhere else.
        Assert.DoesNotContain(name, ProcessTransport.InheritedVariables, StringComparer.OrdinalIgnoreCase);
    }
}
