using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Core.Settings;
using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class SettingsStoreTests
{
    private static readonly ManualTimeProvider _time = new(DateTimeOffset.FromUnixTimeMilliseconds(1_790_000_000_000));

    [Fact]
    public void Unsaved_settings_return_their_defaults()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp);

        Assert.True(store.GetValue(SettingKeys.OkxSandbox));
        Assert.Equal("anthropic", store.GetValue(SettingKeys.AgentProvider));
        Assert.Equal(10_000, store.GetValue(SettingKeys.AgentThinkingBudget));
        Assert.Equal(0.5, store.GetValue(SettingKeys.AutoDiscoverMinConfidence));
        Assert.Empty(store.GetValue(SettingKeys.PatternMiningSymbols));
        Assert.Null(store.GetValue(SettingKeys.NewsCrawlLastRunAt));
    }

    [Fact]
    public void Saved_values_of_every_type_survive_a_restart()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp);

        store.SetValue(SettingKeys.OkxSandbox, false);
        store.SetValue(SettingKeys.AgentModel, "opus");
        store.SetValue(SettingKeys.SessionRetentionDays, 14);
        store.SetValue(SettingKeys.AutoDiscoverMinConfidence, 0.75);
        store.SetValue(SettingKeys.PatternMiningSymbols, ["BTC-USDT", "ETH-USDT"]);
        store.SetValue(SettingKeys.NewsCrawlLastRunAt, 1_790_000_123_456);

        var reopened = NewStore(temp);

        Assert.False(reopened.GetValue(SettingKeys.OkxSandbox));
        Assert.Equal("opus", reopened.GetValue(SettingKeys.AgentModel));
        Assert.Equal(14, reopened.GetValue(SettingKeys.SessionRetentionDays));
        Assert.Equal(0.75, reopened.GetValue(SettingKeys.AutoDiscoverMinConfidence));
        Assert.Equal(["BTC-USDT", "ETH-USDT"], reopened.GetValue(SettingKeys.PatternMiningSymbols));
        Assert.Equal(1_790_000_123_456, reopened.GetValue(SettingKeys.NewsCrawlLastRunAt));
    }

    [Fact]
    public void Saving_twice_keeps_one_row_with_the_latest_value_and_time()
    {
        using var temp = new TempDatabase();
        var time = new ManualTimeProvider(DateTimeOffset.FromUnixTimeMilliseconds(1000));
        var store = new SqliteSettingsStore(temp.Database, time, NullLogger<SqliteSettingsStore>.Instance);

        store.SetValue(SettingKeys.AgentEffort, "low");
        time.Now = DateTimeOffset.FromUnixTimeMilliseconds(2000);
        store.SetValue(SettingKeys.AgentEffort, "max");

        Assert.Equal(1, temp.Scalar<long>("SELECT count(*) FROM settings;"));
        Assert.Equal("\"max\"", temp.Scalar<string>("SELECT value FROM settings WHERE key = 'agent.effort';"));
        Assert.Equal(2000, temp.Scalar<long>("SELECT updated_at FROM settings WHERE key = 'agent.effort';"));
    }

    [Fact]
    public void Reset_restores_the_default_and_removes_the_row()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp);
        store.SetValue(SettingKeys.TelemetryEnabled, false);

        store.Reset(SettingKeys.TelemetryEnabled);

        Assert.True(store.GetValue(SettingKeys.TelemetryEnabled));
        Assert.Equal(0, temp.Scalar<long>("SELECT count(*) FROM settings;"));
    }

    [Fact]
    public void Changed_is_raised_for_saves_and_for_resets_that_removed_something()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp);
        var changes = new List<string>();
        store.Changed += (_, e) => changes.Add(e.Key);

        store.Reset(SettingKeys.OkxSandbox); // nothing saved: no event
        store.SetValue(SettingKeys.OkxSandbox, false);
        store.Reset(SettingKeys.OkxSandbox);

        Assert.Equal(["okx.sandbox", "okx.sandbox"], changes);
    }

    [Theory]
    [InlineData("\"not a number\"")] // wrong JSON type
    [InlineData("null")] // JSON null for a non-nullable setting
    public void A_stored_value_of_the_wrong_shape_falls_back_to_the_default(string storedJson)
    {
        using var temp = new TempDatabase();
        temp.Execute(
            "INSERT INTO settings (key, value, updated_at) VALUES ('agent.thinking_budget', $value, 1);",
            ("$value", storedJson));

        var store = NewStore(temp);

        Assert.Equal(10_000, store.GetValue(SettingKeys.AgentThinkingBudget));
    }

    private static SqliteSettingsStore NewStore(TempDatabase temp) =>
        new(temp.Database, _time, NullLogger<SqliteSettingsStore>.Instance);
}
