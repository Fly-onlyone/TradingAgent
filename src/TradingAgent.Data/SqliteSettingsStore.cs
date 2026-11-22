using System.Collections.Concurrent;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using TradingAgent.Core.Settings;

namespace TradingAgent.Data;

/// <summary>Settings kept in the <c>settings</c> table, with all values cached in memory.</summary>
/// <remarks>
/// Reads never touch the database: the table is small and read constantly. Writes go to the database
/// first, then to the cache, so a failed write leaves the cache unchanged.
/// </remarks>
public sealed partial class SqliteSettingsStore : ISettingsStore
{
    private readonly Database _database;
    private readonly TimeProvider _time;
    private readonly ILogger<SqliteSettingsStore> _logger;
    private readonly ConcurrentDictionary<string, string> _values = new(StringComparer.Ordinal);

    public SqliteSettingsStore(Database database, TimeProvider time, ILogger<SqliteSettingsStore> logger)
    {
        ArgumentNullException.ThrowIfNull(database);
        _database = database;
        _time = time;
        _logger = logger;

        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT key, value FROM settings;";
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            _values[reader.GetString(0)] = reader.GetString(1);
        }
    }

    public event EventHandler<SettingChangedEventArgs>? Changed;

    public T GetValue<T>(SettingKey<T> key)
    {
        ArgumentNullException.ThrowIfNull(key);
        if (!_values.TryGetValue(key.Name, out var json))
        {
            return key.DefaultValue;
        }

        try
        {
            // A stored JSON null for a non-nullable setting falls back to the default.
            return JsonSerializer.Deserialize(json, key.TypeInfo) ?? key.DefaultValue;
        }
        catch (JsonException ex)
        {
            LogUnreadable(_logger, key.Name, ex);
            return key.DefaultValue;
        }
    }

    public void SetValue<T>(SettingKey<T> key, T value)
    {
        ArgumentNullException.ThrowIfNull(key);
        var json = JsonSerializer.Serialize(value, key.TypeInfo);

        using (var connection = _database.Open())
        using (var command = connection.CreateCommand())
        {
            command.CommandText =
                """
                INSERT INTO settings (key, value, updated_at) VALUES ($key, $value, $now)
                ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;
                """;
            command.Parameters.AddWithValue("$key", key.Name);
            command.Parameters.AddWithValue("$value", json);
            command.Parameters.AddWithValue("$now", _time.GetUtcNow().ToUnixTimeMilliseconds());
            command.ExecuteNonQuery();
        }

        _values[key.Name] = json;
        Changed?.Invoke(this, new SettingChangedEventArgs(key.Name));
    }

    public void Reset<T>(SettingKey<T> key)
    {
        ArgumentNullException.ThrowIfNull(key);

        using (var connection = _database.Open())
        using (var command = connection.CreateCommand())
        {
            command.CommandText = "DELETE FROM settings WHERE key = $key;";
            command.Parameters.AddWithValue("$key", key.Name);
            command.ExecuteNonQuery();
        }

        if (_values.TryRemove(key.Name, out _))
        {
            Changed?.Invoke(this, new SettingChangedEventArgs(key.Name));
        }
    }

    [LoggerMessage(Level = LogLevel.Warning, Message = "Setting {Key} holds an unreadable value; using its default.")]
    private static partial void LogUnreadable(ILogger logger, string key, Exception exception);
}
