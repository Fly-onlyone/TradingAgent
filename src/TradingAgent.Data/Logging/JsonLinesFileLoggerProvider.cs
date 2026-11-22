using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TradingAgent.Data.Logging;

/// <summary>Writes every log line at Information or above to <c>app.jsonl</c>, one JSON object per line.</summary>
/// <remarks>
/// When the file passes the size limit it becomes <c>app.1.jsonl</c>, the previous <c>app.1.jsonl</c> becomes
/// <c>app.2.jsonl</c>, and so on; the oldest file beyond the limit is deleted.
/// </remarks>
[ProviderAlias("File")]
public sealed class JsonLinesFileLoggerProvider : BatchingLoggerProvider
{
    public const long DefaultMaxFileBytes = 10 * 1024 * 1024;
    public const int DefaultMaxRotatedFiles = 5;

    private static readonly byte[] _newLine = "\n"u8.ToArray();

    private readonly string _directory;
    private readonly long _maxFileBytes;
    private readonly int _maxRotatedFiles;

    public JsonLinesFileLoggerProvider(
        string directory,
        TimeProvider time,
        long maxFileBytes = DefaultMaxFileBytes,
        int maxRotatedFiles = DefaultMaxRotatedFiles)
        : base(LogLevel.Information, batchSize: 100, flushInterval: TimeSpan.FromSeconds(1), time)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(directory);
        ArgumentOutOfRangeException.ThrowIfNegativeOrZero(maxFileBytes);
        ArgumentOutOfRangeException.ThrowIfNegative(maxRotatedFiles);
        _directory = directory;
        _maxFileBytes = maxFileBytes;
        _maxRotatedFiles = maxRotatedFiles;
    }

    public string CurrentFile => Path.Combine(_directory, "app.jsonl");

    protected override void Write(IReadOnlyList<LogEntry> batch)
    {
        ArgumentNullException.ThrowIfNull(batch);
        Directory.CreateDirectory(_directory);
        RotateIfTooLarge();

        using var stream = new FileStream(CurrentFile, FileMode.Append, FileAccess.Write, FileShare.Read);
        foreach (var entry in batch)
        {
            using (var json = new Utf8JsonWriter(stream))
            {
                json.WriteStartObject();
                json.WriteString(
                    "timestamp",
                    DateTimeOffset.FromUnixTimeMilliseconds(entry.TimestampMs)
                        .ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture));
                json.WriteString("level", entry.LevelName);
                json.WriteString("logger", entry.Logger);
                json.WriteString("message", entry.Message);
                if (entry.Exception is not null)
                {
                    json.WriteString("exception", entry.Exception);
                }

                json.WriteEndObject();
            }

            stream.Write(_newLine);
        }
    }

    private void RotateIfTooLarge()
    {
        var current = new FileInfo(CurrentFile);
        if (!current.Exists || current.Length < _maxFileBytes)
        {
            return;
        }

        if (_maxRotatedFiles == 0)
        {
            current.Delete();
            return;
        }

        File.Delete(RotatedFile(_maxRotatedFiles));
        for (var index = _maxRotatedFiles - 1; index >= 1; index--)
        {
            var source = RotatedFile(index);
            if (File.Exists(source))
            {
                File.Move(source, RotatedFile(index + 1));
            }
        }

        File.Move(CurrentFile, RotatedFile(1));
    }

    private string RotatedFile(int index) =>
        Path.Combine(_directory, string.Create(CultureInfo.InvariantCulture, $"app.{index}.jsonl"));
}
