using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Secrets;

namespace TradingAgent.Data;

/// <summary>Secrets kept in the <c>secrets</c> table as blobs encrypted by an <see cref="ISecretProtector"/>.</summary>
public sealed partial class SqliteSecretStore(
    Database database,
    ISecretProtector protector,
    TimeProvider time,
    ILogger<SqliteSecretStore> logger) : ISecretStore
{
    /// <summary>Shorter values get no hint: four characters would reveal too much of them.</summary>
    private const int MinimumLengthForHint = 12;

    public SecretState GetState(string name)
    {
        ValidateName(name);
        var row = ReadRow(name);
        if (row is null)
        {
            return SecretState.Unset;
        }

        return TryUnprotect(name, row.Value.Blob) is null
            ? new SecretState(SecretStatus.Unreadable, string.Empty)
            : new SecretState(SecretStatus.Saved, row.Value.Hint);
    }

    public string? Reveal(string name)
    {
        ValidateName(name);
        var row = ReadRow(name);
        return row is null ? null : TryUnprotect(name, row.Value.Blob);
    }

    public void Save(string name, string value)
    {
        ValidateName(name);
        ArgumentNullException.ThrowIfNull(value);
        if (value.Length == 0)
        {
            Remove(name);
            return;
        }

        var plaintext = Encoding.UTF8.GetBytes(value);
        byte[] blob;
        try
        {
            blob = protector.Protect(plaintext);
        }
        finally
        {
            CryptographicOperations.ZeroMemory(plaintext);
        }

        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText =
            """
            INSERT INTO secrets (name, blob, hint, updated_at) VALUES ($name, $blob, $hint, $now)
            ON CONFLICT (name) DO UPDATE SET blob = excluded.blob, hint = excluded.hint, updated_at = excluded.updated_at;
            """;
        command.Parameters.AddWithValue("$name", name);
        command.Parameters.AddWithValue("$blob", blob);
        command.Parameters.AddWithValue("$hint", value.Length >= MinimumLengthForHint ? value[^4..] : string.Empty);
        command.Parameters.AddWithValue("$now", time.GetUtcNow().ToUnixTimeMilliseconds());
        command.ExecuteNonQuery();
    }

    public bool Remove(string name)
    {
        ValidateName(name);
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM secrets WHERE name = $name;";
        command.Parameters.AddWithValue("$name", name);
        return command.ExecuteNonQuery() > 0;
    }

    private static void ValidateName(string name)
    {
        ArgumentNullException.ThrowIfNull(name);
        if (!SecretNames.All.Contains(name))
        {
            throw new ArgumentException($"'{name}' is not a known secret name.", nameof(name));
        }
    }

    private (byte[] Blob, string Hint)? ReadRow(string name)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT blob, hint FROM secrets WHERE name = $name;";
        command.Parameters.AddWithValue("$name", name);
        using var reader = command.ExecuteReader();
        return reader.Read() ? (reader.GetFieldValue<byte[]>(0), reader.GetString(1)) : null;
    }

    private string? TryUnprotect(string name, byte[] blob)
    {
        try
        {
            var plaintext = protector.Unprotect(blob);
            try
            {
                return Encoding.UTF8.GetString(plaintext);
            }
            finally
            {
                CryptographicOperations.ZeroMemory(plaintext);
            }
        }
        catch (CryptographicException ex)
        {
            LogUnreadable(logger, name, ex);
            return null;
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Secret {Name} is stored but cannot be decrypted by this Windows user; it must be entered again.")]
    private static partial void LogUnreadable(ILogger logger, string name, Exception exception);
}
