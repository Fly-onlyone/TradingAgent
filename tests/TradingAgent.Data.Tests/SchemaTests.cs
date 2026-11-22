using Microsoft.Data.Sqlite;
using TradingAgent.Core;
using Xunit;

namespace TradingAgent.Data.Tests;

/// <summary>Checks the rules the schema itself must enforce, independent of any repository code.</summary>
public sealed class SchemaTests
{
    private const long Now = 1_790_000_000_000;

    [Fact]
    public void Every_table_of_the_data_model_exists()
    {
        using var temp = new TempDatabase();
        string[] expected =
        [
            "agent_decisions", "agent_memories", "agent_session_messages", "agent_sessions", "agent_tasks",
            "agent_tool_calls", "credibility_events", "logs", "meta", "news_article_assets", "news_articles",
            "news_sources", "notifications", "orders", "secrets", "settings", "strategies",
            "strategy_discovery_cycles", "strategy_knowledge", "trade_lessons", "trading_patterns", "vectors",
        ];

        using var connection = temp.Database.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE '%_fts%' ORDER BY name;";
        var actual = new List<string>();
        using (var reader = command.ExecuteReader())
        {
            while (reader.Read())
            {
                actual.Add(reader.GetString(0));
            }
        }

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void Dead_tables_of_the_old_model_are_not_created()
    {
        using var temp = new TempDatabase();

        var count = temp.Scalar<long>(
            "SELECT count(*) FROM sqlite_master WHERE name IN ('grid_bots', 'trades', 'market_data', 'users', 'knowledge_chunks', 'knowledge_edges');");

        Assert.Equal(0, count);
    }

    [Fact]
    public void Full_text_index_follows_inserts_updates_and_deletes()
    {
        using var temp = new TempDatabase();
        var id = Ids.NewId();
        temp.Execute(
            """
            INSERT INTO strategy_knowledge (id, name, description, entry_rules, exit_rules, risk_params, created_at, updated_at)
            VALUES ($id, 'Range breakout', 'Buy the breakout above resistance', '{}', '{}', '{}', $now, $now);
            """,
            ("$id", id),
            ("$now", Now));
        temp.Execute(
            "INSERT INTO vectors (kind, item_id, embedder, hash, dim, data, updated_at) VALUES ('strategy_knowledge', $id, 'test', 'h', 1, x'00000000', $now);",
            ("$id", id),
            ("$now", Now));

        Assert.Equal(id, Search(temp, "breakout"));
        Assert.Equal(id, Search(temp, "resistance"));

        temp.Execute("UPDATE strategy_knowledge SET description = 'Fade the move back into the range' WHERE id = $id;", ("$id", id));

        Assert.Null(Search(temp, "resistance"));
        Assert.Equal(id, Search(temp, "fade"));

        temp.Execute("DELETE FROM strategy_knowledge WHERE id = $id;", ("$id", id));

        Assert.Null(Search(temp, "breakout"));
        Assert.Equal(0, temp.Scalar<long>("SELECT count(*) FROM vectors;"));
    }

    [Fact]
    public void Message_must_belong_to_an_existing_session()
    {
        using var temp = new TempDatabase();

        var error = Assert.Throws<SqliteException>(() => InsertMessage(temp, Ids.NewId(), sessionId: Ids.NewId()));

        Assert.Contains("FOREIGN KEY", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Deleting_a_session_removes_its_messages_and_tool_calls()
    {
        using var temp = new TempDatabase();
        var sessionId = Ids.NewId();
        var messageId = Ids.NewId();
        temp.Execute("INSERT INTO agent_sessions (id, started_at) VALUES ($id, $now);", ("$id", sessionId), ("$now", Now));
        InsertMessage(temp, messageId, sessionId);
        temp.Execute(
            """
            INSERT INTO agent_tool_calls (id, message_id, position, tool_use_id, name, created_at, updated_at)
            VALUES ($id, $message, 0, 'toolu_1', 'mcp__okx__place_order', $now, $now);
            """,
            ("$id", Ids.NewId()),
            ("$message", messageId),
            ("$now", Now));

        temp.Execute("DELETE FROM agent_sessions WHERE id = $id;", ("$id", sessionId));

        Assert.Equal(0, temp.Scalar<long>("SELECT count(*) FROM agent_session_messages;"));
        Assert.Equal(0, temp.Scalar<long>("SELECT count(*) FROM agent_tool_calls;"));
    }

    [Fact]
    public void Deleting_a_session_keeps_its_orders_but_clears_the_link()
    {
        using var temp = new TempDatabase();
        var sessionId = Ids.NewId();
        var orderId = Ids.NewId();
        temp.Execute("INSERT INTO agent_sessions (id, started_at) VALUES ($id, $now);", ("$id", sessionId), ("$now", Now));
        InsertOrder(temp, orderId, idempotencyKey: null, sessionId: sessionId);

        temp.Execute("DELETE FROM agent_sessions WHERE id = $id;", ("$id", sessionId));

        Assert.Equal(1, temp.Scalar<long>("SELECT count(*) FROM orders WHERE id = $id AND agent_session_id IS NULL;", ("$id", orderId)));
    }

    [Fact]
    public void A_second_order_with_the_same_idempotency_key_is_refused()
    {
        using var temp = new TempDatabase();
        var key = $"s{Ids.NewId()}-0a1b";
        InsertOrder(temp, Ids.NewId(), key);

        var error = Assert.Throws<SqliteException>(() => InsertOrder(temp, Ids.NewId(), key));

        Assert.Contains("UNIQUE", error.Message, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Orders_without_an_idempotency_key_do_not_collide(string? key)
    {
        using var temp = new TempDatabase();

        InsertOrder(temp, Ids.NewId(), key);
        InsertOrder(temp, Ids.NewId(), key);

        Assert.Equal(2, temp.Scalar<long>("SELECT count(*) FROM orders;"));
    }

    [Fact]
    public void Unknown_enum_value_is_refused()
    {
        using var temp = new TempDatabase();

        var error = Assert.Throws<SqliteException>(
            () => temp.Execute(
                """
                INSERT INTO orders (id, symbol, side, order_type, status, quantity, source, created_at, updated_at)
                VALUES ($id, 'BTC-USDT', 'buy', 'market', 'teleported', 1, 'atk_mirror', $now, $now);
                """,
                ("$id", Ids.NewId()),
                ("$now", Now)));

        Assert.Contains("CHECK", error.Message, StringComparison.Ordinal);
    }

    [Fact]
    public void Invalid_json_is_refused()
    {
        using var temp = new TempDatabase();

        Assert.Throws<SqliteException>(
            () => temp.Execute("INSERT INTO settings (key, value, updated_at) VALUES ('k', '{not json', $now);", ("$now", Now)));
    }

    [Fact]
    public void Text_in_a_number_column_is_refused()
    {
        using var temp = new TempDatabase();

        // STRICT tables: SQLite would otherwise store the text silently.
        Assert.Throws<SqliteException>(
            () => temp.Execute("INSERT INTO settings (key, value, updated_at) VALUES ('k', '1', 'yesterday');"));
    }

    private static string? Search(TempDatabase temp, string term) =>
        temp.Scalar<string>(
            """
            SELECT k.id FROM strategy_knowledge_fts AS f
            JOIN strategy_knowledge AS k ON k.seq = f.rowid
            WHERE strategy_knowledge_fts MATCH $term;
            """,
            ("$term", term));

    private static void InsertMessage(TempDatabase temp, string id, string sessionId) =>
        temp.Execute(
            """
            INSERT INTO agent_session_messages (id, session_id, role, content, timestamp, created_at, updated_at)
            VALUES ($id, $session, 'user', 'hello', $now, $now, $now);
            """,
            ("$id", id),
            ("$session", sessionId),
            ("$now", Now));

    private static void InsertOrder(TempDatabase temp, string id, string? idempotencyKey, string? sessionId = null) =>
        temp.Execute(
            """
            INSERT INTO orders (id, execution_idempotency_key, symbol, side, order_type, quantity, source, agent_session_id, created_at, updated_at)
            VALUES ($id, $key, 'BTC-USDT', 'buy', 'market', 0, 'atk_mirror', $session, $now, $now);
            """,
            ("$id", id),
            ("$key", idempotencyKey),
            ("$session", sessionId),
            ("$now", Now));
}
