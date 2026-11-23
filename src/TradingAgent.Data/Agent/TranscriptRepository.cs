using TradingAgent.Core.Agent;

namespace TradingAgent.Data.Agent;

/// <summary>Reads and writes <c>agent_transcript</c>: the conversation as the model provider saw it.</summary>
/// <remarks>
/// Items are only ever added at the end. Providers check that earlier items come back unchanged, so
/// nothing here edits or reorders them; a transcript that can no longer be used is cleared as a whole.
/// </remarks>
public sealed class TranscriptRepository(Database database, TimeProvider time)
{
    /// <summary>Adds items after the last one of the session, in the order given.</summary>
    /// <param name="sessionId">The session; it must exist.</param>
    /// <param name="provider"><c>anthropic</c> or <c>openai</c>.</param>
    /// <param name="model">The model the items were exchanged with.</param>
    /// <param name="itemsJson">Each item as the provider's JSON.</param>
    public void Append(string sessionId, string provider, string? model, IReadOnlyList<string> itemsJson)
    {
        ArgumentNullException.ThrowIfNull(itemsJson);
        if (itemsJson.Count == 0)
        {
            return;
        }

        using var connection = database.Open();
        using var transaction = connection.BeginTransaction();

        long next;
        using (var last = connection.CreateCommand())
        {
            last.Transaction = transaction;
            last.CommandText = "SELECT coalesce(max(seq), 0) + 1 FROM agent_transcript WHERE session_id = $session;";
            last.Parameters.AddWithValue("$session", sessionId);
            next = Convert.ToInt64(last.ExecuteScalar(), System.Globalization.CultureInfo.InvariantCulture);
        }

        using var insert = connection.CreateCommand();
        insert.Transaction = transaction;
        insert.CommandText =
            """
            INSERT INTO agent_transcript (session_id, seq, provider, model, item, created_at)
            VALUES ($session, $seq, $provider, $model, $item, $now);
            """;
        insert.Parameters.AddWithValue("$session", sessionId);
        insert.Parameters.AddWithValue("$provider", provider);
        insert.Parameters.AddWithValue("$model", (object?)model ?? DBNull.Value);
        insert.Parameters.AddWithValue("$now", time.GetUtcNow().ToUnixTimeMilliseconds());
        var seq = insert.Parameters.Add("$seq", Microsoft.Data.Sqlite.SqliteType.Integer);
        var item = insert.Parameters.Add("$item", Microsoft.Data.Sqlite.SqliteType.Text);
        foreach (var json in itemsJson)
        {
            seq.Value = next++;
            item.Value = json;
            insert.ExecuteNonQuery();
        }

        transaction.Commit();
    }

    /// <summary>The whole transcript of a session, oldest item first.</summary>
    public IReadOnlyList<TranscriptItem> Load(string sessionId)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT seq, provider, model, item FROM agent_transcript WHERE session_id = $session ORDER BY seq;";
        command.Parameters.AddWithValue("$session", sessionId);

        var items = new List<TranscriptItem>();
        using var reader = command.ExecuteReader();
        while (reader.Read())
        {
            items.Add(new TranscriptItem(
                reader.GetInt64(0),
                reader.GetString(1),
                reader.IsDBNull(2) ? null : reader.GetString(2),
                reader.GetString(3)));
        }

        return items;
    }

    /// <summary>
    /// Forgets the transcript of a session, for example because the provider changed. The messages the
    /// user sees are not touched. Returns how many items were removed.
    /// </summary>
    public int Clear(string sessionId)
    {
        using var connection = database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "DELETE FROM agent_transcript WHERE session_id = $session;";
        command.Parameters.AddWithValue("$session", sessionId);
        return command.ExecuteNonQuery();
    }
}
