using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging.Abstractions;
using TradingAgent.Core.Secrets;
using TradingAgent.Platform.Windows;
using Xunit;

namespace TradingAgent.Data.Tests;

public sealed class SecretStoreTests
{
    // Low-entropy sample values, so secret scanners do not mistake fixtures for leaked credentials.
    private const string LongValue = "abcdabcdabcdWXYZ";
    private const string ShortValue = "abcdabcd";

    private static readonly ManualTimeProvider _time = new(DateTimeOffset.FromUnixTimeMilliseconds(1_790_000_000_000));

    [Fact]
    public void A_secret_that_was_never_saved_is_unset()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp, new ReversingProtector());

        Assert.Equal(SecretState.Unset, store.GetState(SecretNames.OkxApiKey));
        Assert.Null(store.Reveal(SecretNames.OkxApiKey));
        Assert.False(store.Remove(SecretNames.OkxApiKey));
    }

    [Fact]
    public void A_saved_secret_can_be_revealed_and_shows_its_last_four_characters()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp, new ReversingProtector());

        store.Save(SecretNames.AnthropicApiKey, LongValue);

        Assert.Equal(new SecretState(SecretStatus.Saved, "WXYZ"), store.GetState(SecretNames.AnthropicApiKey));
        Assert.Equal(LongValue, store.Reveal(SecretNames.AnthropicApiKey));
    }

    [Fact]
    public void A_short_secret_gets_no_hint()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp, new ReversingProtector());

        store.Save(SecretNames.OkxPassphrase, ShortValue);

        Assert.Equal(new SecretState(SecretStatus.Saved, string.Empty), store.GetState(SecretNames.OkxPassphrase));
    }

    [Fact]
    public void Saving_again_replaces_the_value()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp, new ReversingProtector());

        store.Save(SecretNames.OpenAiApiKey, LongValue);
        store.Save(SecretNames.OpenAiApiKey, ShortValue);

        Assert.Equal(ShortValue, store.Reveal(SecretNames.OpenAiApiKey));
        Assert.Equal(1, temp.Scalar<long>("SELECT count(*) FROM secrets;"));
    }

    [Fact]
    public void Saving_an_empty_value_removes_the_secret()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp, new ReversingProtector());
        store.Save(SecretNames.SmtpPassword, LongValue);

        store.Save(SecretNames.SmtpPassword, string.Empty);

        Assert.Equal(SecretState.Unset, store.GetState(SecretNames.SmtpPassword));
    }

    [Fact]
    public void Unknown_secret_names_are_refused()
    {
        using var temp = new TempDatabase();
        var store = NewStore(temp, new ReversingProtector());

        Assert.Throws<ArgumentException>(() => store.Save("github_token", LongValue));
        Assert.Throws<ArgumentException>(() => store.Reveal("github_token"));
    }

    [Fact]
    public void A_blob_that_cannot_be_decrypted_counts_as_missing()
    {
        using var temp = new TempDatabase();
        NewStore(temp, new ReversingProtector()).Save(SecretNames.OkxSecretKey, LongValue);

        // The same database opened by a user whose key cannot decrypt the blob.
        var store = NewStore(temp, new FailingProtector());

        Assert.Equal(new SecretState(SecretStatus.Unreadable, string.Empty), store.GetState(SecretNames.OkxSecretKey));
        Assert.Null(store.Reveal(SecretNames.OkxSecretKey));
    }

    [Fact]
    [SupportedOSPlatform("windows")]
    public void Windows_data_protection_round_trips_and_stores_no_plaintext()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "DPAPI exists only on Windows.");
        using var temp = new TempDatabase();
        var store = NewStore(temp, new DpapiSecretProtector());

        store.Save(SecretNames.OkxApiKey, LongValue);

        Assert.Equal(LongValue, store.Reveal(SecretNames.OkxApiKey));
        using var connection = temp.Database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT blob FROM secrets WHERE name = 'okx_api_key';";
        var blob = (byte[])command.ExecuteScalar()!;
        Assert.DoesNotContain(LongValue, Encoding.UTF8.GetString(blob), StringComparison.Ordinal);
        Assert.DoesNotContain(LongValue, Encoding.Unicode.GetString(blob), StringComparison.Ordinal);
    }

    [Fact]
    [SupportedOSPlatform("windows")]
    public void Windows_data_protection_rejects_a_blob_it_did_not_write()
    {
        Assert.SkipUnless(OperatingSystem.IsWindows(), "DPAPI exists only on Windows.");
        var protector = new DpapiSecretProtector();

        Assert.ThrowsAny<CryptographicException>(() => protector.Unprotect([1, 2, 3, 4, 5, 6, 7, 8]));
    }

    private static SqliteSecretStore NewStore(TempDatabase temp, ISecretProtector protector) =>
        new(temp.Database, protector, _time, NullLogger<SqliteSecretStore>.Instance);

    /// <summary>Stands in for real encryption: reversible, and visibly different from the plaintext.</summary>
    private sealed class ReversingProtector : ISecretProtector
    {
        public byte[] Protect(byte[] plaintext) => [.. plaintext.Reverse()];

        public byte[] Unprotect(byte[] blob) => [.. blob.Reverse()];
    }

    private sealed class FailingProtector : ISecretProtector
    {
        public byte[] Protect(byte[] plaintext) => throw new CryptographicException("no key");

        public byte[] Unprotect(byte[] blob) => throw new CryptographicException("Key not valid for use in specified state.");
    }
}
