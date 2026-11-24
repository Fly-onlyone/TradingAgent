using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace TradingAgent.Data;

/// <summary>Short forms of the three things a repository does: run a statement, read rows, read one number.</summary>
public static class DatabaseQueries
{
    public static int Execute(this Database database, string sql, params (string Name, object? Value)[] parameters)
    {
        ArgumentNullException.ThrowIfNull(database);
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        Bind(command, parameters);
        return command.ExecuteNonQuery();
    }

    public static List<T> Query<T>(
        this Database database,
        string sql,
        Func<SqliteDataReader, T> read,
        params (string Name, object? Value)[] parameters)
    {
        ArgumentNullException.ThrowIfNull(database);
        ArgumentNullException.ThrowIfNull(read);
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        Bind(command, parameters);
        var rows = new List<T>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            rows.Add(read(reader));
        }

        return rows;
    }

    public static T? First<T>(
        this Database database,
        string sql,
        Func<SqliteDataReader, T> read,
        params (string Name, object? Value)[] parameters)
        where T : class
    {
        var rows = database.Query(sql, read, parameters);
        return rows.Count > 0 ? rows[0] : null;
    }

    /// <summary>The first column of the first row as a whole number; zero when there is no row.</summary>
    public static long Number(this Database database, string sql, params (string Name, object? Value)[] parameters)
    {
        ArgumentNullException.ThrowIfNull(database);
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = sql;
        Bind(command, parameters);
        var value = command.ExecuteScalar();
        return value is null or DBNull ? 0 : Convert.ToInt64(value, CultureInfo.InvariantCulture);
    }

    public static void Bind(SqliteCommand command, IEnumerable<(string Name, object? Value)> parameters)
    {
        ArgumentNullException.ThrowIfNull(command);
        ArgumentNullException.ThrowIfNull(parameters);
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }
    }

    public static string? Text(this SqliteDataReader reader, int column)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.IsDBNull(column) ? null : reader.GetString(column);
    }

    public static long? Whole(this SqliteDataReader reader, int column)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.IsDBNull(column) ? null : reader.GetInt64(column);
    }

    public static double? Real(this SqliteDataReader reader, int column)
    {
        ArgumentNullException.ThrowIfNull(reader);
        return reader.IsDBNull(column) ? null : reader.GetDouble(column);
    }
}

/// <summary>Small JSON values kept in a text column: a list of words, or an object a model wrote.</summary>
public static class JsonText
{
    public static string List(IEnumerable<string>? values)
    {
        using var buffer = new MemoryStream();
        using (var writer = new Utf8JsonWriter(buffer))
        {
            writer.WriteStartArray();
            foreach (var value in values ?? [])
            {
                if (!string.IsNullOrWhiteSpace(value))
                {
                    writer.WriteStringValue(value.Trim());
                }
            }

            writer.WriteEndArray();
        }

        return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
    }

    /// <summary>The strings of a stored JSON list; empty when the text is missing or is not a list.</summary>
    public static IReadOnlyList<string> ReadList(string? json)
    {
        var values = new List<string>();
        if (string.IsNullOrWhiteSpace(json))
        {
            return values;
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            if (document.RootElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in document.RootElement.EnumerateArray())
                {
                    if (item.ValueKind == JsonValueKind.String && item.GetString() is { Length: > 0 } text)
                    {
                        values.Add(text);
                    }
                }
            }
        }
        catch (JsonException)
        {
            // Not a list: no values.
        }

        return values;
    }

    /// <summary>
    /// <paramref name="json"/> when it is valid JSON; otherwise the text wrapped as <c>{"text": "..."}</c>, so
    /// that a column that must hold JSON can take what a person typed.
    /// </summary>
    public static string ValidOrWrapped(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
        {
            return "{}";
        }

        try
        {
            using var document = JsonDocument.Parse(json);
            return json;
        }
        catch (JsonException)
        {
            using var buffer = new MemoryStream();
            using (var writer = new Utf8JsonWriter(buffer))
            {
                writer.WriteStartObject();
                writer.WriteString("text", json.Trim());
                writer.WriteEndObject();
            }

            return Encoding.UTF8.GetString(buffer.GetBuffer(), 0, (int)buffer.Length);
        }
    }
}

/// <summary>Turns what a person or a model typed into a full-text query.</summary>
public static class FtsQuery
{
    private const int MaxTerms = 12;

    /// <summary>
    /// The words of <paramref name="text"/>, each quoted, joined with OR; null when there is no word.
    /// Quoted, so that nothing typed is read as query syntax.
    /// </summary>
    public static string? From(string? text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        var terms = new List<string>();
        var word = new StringBuilder();
        foreach (var character in text + " ")
        {
            if (char.IsLetterOrDigit(character))
            {
                word.Append(char.ToLowerInvariant(character));
                continue;
            }

            if (word.Length >= 2 && !terms.Contains(word.ToString()) && terms.Count < MaxTerms)
            {
                terms.Add(word.ToString());
            }

            word.Clear();
        }

        return terms.Count == 0 ? null : string.Join(" OR ", terms.Select(term => $"\"{term}\""));
    }
}
