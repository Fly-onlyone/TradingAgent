-- Initial schema.
--
-- Conventions
--   id          24 lowercase hex characters (4-byte time + 8 random bytes). The session id is embedded in
--               OKX client order ids ("s<24hex-session>-<4hex-nonce>"), so the width is part of a contract.
--   times       INTEGER, Unix milliseconds, UTC.
--   booleans    INTEGER 0 or 1.
--   enums       TEXT with a CHECK listing every value.
--   JSON        TEXT with CHECK (json_valid(...)): free-form objects and small lists.
--   seq         Tables with a full-text index have an INTEGER PRIMARY KEY "seq" next to "id". FTS5 needs a
--               stable integer row id, and the implicit rowid of a table without one can change on VACUUM.
--
-- There is one local user: no table has an owner column.

------------------------------------------------------------------------------------------------------
-- Infrastructure
------------------------------------------------------------------------------------------------------

CREATE TABLE settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL CHECK (json_valid(value)),
    updated_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

-- Values are encrypted by the operating system for the current user before they are stored.
CREATE TABLE secrets (
    name       TEXT PRIMARY KEY NOT NULL,
    blob       BLOB NOT NULL,
    hint       TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE TABLE logs (
    id         INTEGER PRIMARY KEY,
    ts         INTEGER NOT NULL,
    level      TEXT NOT NULL CHECK (level IN ('trace', 'debug', 'information', 'warning', 'error', 'critical')),
    logger     TEXT NOT NULL,
    message    TEXT NOT NULL,
    exception  TEXT,
    properties TEXT CHECK (properties IS NULL OR json_valid(properties))
) STRICT;

CREATE INDEX ix_logs_ts ON logs (ts);
CREATE INDEX ix_logs_level_ts ON logs (level, ts);

-- One embedding per item. "kind" names the source table; "embedder" names the provider and model that
-- produced the vector, so a model change can be detected and the item re-embedded. "hash" covers the
-- embedder name and the embedded text.
CREATE TABLE vectors (
    kind       TEXT NOT NULL CHECK (kind IN ('strategy_knowledge', 'trade_lesson', 'trading_pattern', 'news_article', 'agent_memory')),
    item_id    TEXT NOT NULL,
    embedder   TEXT NOT NULL,
    hash       TEXT NOT NULL,
    dim        INTEGER NOT NULL CHECK (dim > 0),
    data       BLOB NOT NULL, -- little-endian float32, dim * 4 bytes, L2-normalized
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (kind, item_id)
) STRICT, WITHOUT ROWID;

------------------------------------------------------------------------------------------------------
-- Agent sessions
------------------------------------------------------------------------------------------------------

CREATE TABLE agent_sessions (
    id                      TEXT PRIMARY KEY NOT NULL,
    sdk_session_id          TEXT,
    session_kind            TEXT NOT NULL DEFAULT 'chat' CHECK (session_kind IN ('chat', 'task_run', 'subagent')),
    title                   TEXT,
    description             TEXT,
    active_pending_question TEXT CHECK (active_pending_question IS NULL OR json_valid(active_pending_question)),
    total_messages          INTEGER NOT NULL DEFAULT 0,
    user_messages           INTEGER NOT NULL DEFAULT 0,
    assistant_messages      INTEGER NOT NULL DEFAULT 0,
    total_tokens            INTEGER NOT NULL DEFAULT 0,
    is_active               INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    started_at              INTEGER NOT NULL,
    ended_at                INTEGER,
    last_message_at         INTEGER
) STRICT;

CREATE INDEX ix_agent_sessions_recent ON agent_sessions (last_message_at DESC, started_at DESC);
CREATE INDEX ix_agent_sessions_active ON agent_sessions (is_active, last_message_at DESC);

CREATE TABLE agent_session_messages (
    id               TEXT PRIMARY KEY NOT NULL,
    session_id       TEXT NOT NULL REFERENCES agent_sessions (id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content          TEXT NOT NULL,
    timestamp        INTEGER NOT NULL,
    decision_id      TEXT REFERENCES agent_decisions (id) ON DELETE SET NULL,
    thinking_content TEXT,
    tokens_used      INTEGER,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_agent_session_messages_session ON agent_session_messages (session_id, timestamp, id);

-- One row per tool call of a message, in display order. A separate table so that the order mirror can
-- update the result of one call by its tool_use_id without rewriting the whole message.
CREATE TABLE agent_tool_calls (
    id             TEXT PRIMARY KEY NOT NULL,
    message_id     TEXT NOT NULL REFERENCES agent_session_messages (id) ON DELETE CASCADE,
    position       INTEGER NOT NULL,
    tool_use_id    TEXT NOT NULL,
    name           TEXT NOT NULL,
    arguments      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(arguments)),
    result_summary TEXT CHECK (result_summary IS NULL OR json_valid(result_summary)),
    result         TEXT CHECK (result IS NULL OR json_valid(result)),
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    UNIQUE (message_id, position)
) STRICT;

CREATE INDEX ix_agent_tool_calls_tool_use ON agent_tool_calls (tool_use_id);
-- Start-up sweep: calls that never received a result.
CREATE INDEX ix_agent_tool_calls_unfinished ON agent_tool_calls (name) WHERE result_summary IS NULL;

CREATE TABLE agent_tasks (
    id                       TEXT PRIMARY KEY NOT NULL,
    name                     TEXT NOT NULL,
    description              TEXT,
    trading_enabled          INTEGER NOT NULL DEFAULT 0 CHECK (trading_enabled IN (0, 1)),
    monitoring_enabled       INTEGER NOT NULL DEFAULT 0 CHECK (monitoring_enabled IN (0, 1)),
    schedules                TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(schedules)),
    timezone                 TEXT NOT NULL,
    next_run_at              INTEGER,
    last_run_at              INTEGER,
    symbols                  TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(symbols)),
    risk_level               TEXT NOT NULL DEFAULT 'moderate' CHECK (risk_level IN ('conservative', 'moderate', 'aggressive')),
    holding_term             TEXT NOT NULL DEFAULT 'medium' CHECK (holding_term IN ('short', 'medium', 'long')),
    agent_mode               TEXT NOT NULL DEFAULT 'ask' CHECK (agent_mode IN ('auto', 'ask')),
    task_modification_mode   TEXT NOT NULL DEFAULT 'disabled' CHECK (task_modification_mode IN ('disabled', 'auto', 'ask')),
    max_position_size        REAL,
    max_daily_trades         INTEGER,
    use_subagents            INTEGER NOT NULL DEFAULT 0 CHECK (use_subagents IN (0, 1)),
    custom_instructions      TEXT,
    monitoring_conditions    TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(monitoring_conditions)),
    alert_cooldown_minutes   INTEGER NOT NULL DEFAULT 60,
    last_alert_at            INTEGER,
    max_retries              INTEGER NOT NULL DEFAULT 2,
    consecutive_failures     INTEGER NOT NULL DEFAULT 0,
    max_consecutive_failures INTEGER NOT NULL DEFAULT 3,
    status                   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'failed')),
    paused_by_emergency_stop INTEGER NOT NULL DEFAULT 0 CHECK (paused_by_emergency_stop IN (0, 1)),
    run_count                INTEGER NOT NULL DEFAULT 0,
    success_count            INTEGER NOT NULL DEFAULT 0,
    failure_count            INTEGER NOT NULL DEFAULT 0,
    last_error               TEXT,
    last_decision_id         TEXT REFERENCES agent_decisions (id) ON DELETE SET NULL,
    last_session_id          TEXT REFERENCES agent_sessions (id) ON DELETE SET NULL,
    created_at               INTEGER NOT NULL,
    updated_at               INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_agent_tasks_due ON agent_tasks (status, next_run_at);
CREATE INDEX ix_agent_tasks_created ON agent_tasks (created_at DESC);

CREATE TABLE agent_decisions (
    id                      TEXT PRIMARY KEY NOT NULL,
    session_id              TEXT REFERENCES agent_sessions (id) ON DELETE SET NULL,
    task_id                 TEXT REFERENCES agent_tasks (id) ON DELETE SET NULL,
    decision_type           TEXT NOT NULL CHECK (decision_type IN ('analysis', 'recommendation', 'trade_execution', 'risk_alert', 'news_insight', 'monitoring_alert', 'task_modification')),
    symbol                  TEXT,
    action                  TEXT CHECK (action IS NULL OR action IN ('buy', 'sell', 'hold', 'wait', 'close')),
    confidence              REAL CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100),
    status                  TEXT NOT NULL DEFAULT 'executed' CHECK (status IN ('pending', 'confirmed', 'rejected', 'executed', 'expired')),
    summary                 TEXT NOT NULL,
    reasoning               TEXT NOT NULL,
    key_factors             TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(key_factors)),
    proposed_changes        TEXT CHECK (proposed_changes IS NULL OR json_valid(proposed_changes)),
    suggested_entry         REAL,
    suggested_stop_loss     REAL,
    suggested_take_profit   REAL,
    suggested_position_size REAL,
    risk_reward_ratio       REAL,
    order_id                TEXT REFERENCES orders (id) ON DELETE SET NULL,
    execution_price         REAL,
    execution_status        TEXT NOT NULL DEFAULT 'queued' CHECK (execution_status IN ('queued', 'submitted', 'filled', 'failed')),
    execution_error_code    TEXT,
    execution_error_message TEXT,
    tools_used              TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tools_used)),
    market_context          TEXT CHECK (market_context IS NULL OR json_valid(market_context)),
    model_used              TEXT NOT NULL,
    user_feedback           TEXT CHECK (user_feedback IS NULL OR user_feedback IN ('thumbs_up', 'thumbs_down', 'neutral')),
    feedback_comment        TEXT,
    created_at              INTEGER NOT NULL,
    confirmed_at            INTEGER,
    executed_at             INTEGER,
    expires_at              INTEGER
) STRICT;

CREATE INDEX ix_agent_decisions_created ON agent_decisions (created_at DESC);
CREATE INDEX ix_agent_decisions_status ON agent_decisions (status, created_at DESC);
CREATE INDEX ix_agent_decisions_task ON agent_decisions (task_id, created_at DESC);
CREATE INDEX ix_agent_decisions_session ON agent_decisions (session_id, created_at DESC);
CREATE INDEX ix_agent_decisions_expiry ON agent_decisions (status, expires_at);

CREATE TABLE agent_memories (
    seq              INTEGER PRIMARY KEY,
    id               TEXT NOT NULL UNIQUE,
    category         TEXT NOT NULL CHECK (category IN ('preference', 'watchlist', 'trading_context', 'market_observation', 'decision_rationale', 'lesson', 'general')),
    content          TEXT NOT NULL CHECK (length(content) <= 2000),
    tags             TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags)),
    source           TEXT NOT NULL DEFAULT 'conversation' CHECK (source IN ('conversation', 'task')),
    session_id       TEXT REFERENCES agent_sessions (id) ON DELETE SET NULL,
    expires_at       INTEGER,
    access_count     INTEGER NOT NULL DEFAULT 0,
    last_accessed_at INTEGER,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_agent_memories_category ON agent_memories (category, updated_at DESC);
CREATE INDEX ix_agent_memories_expiry ON agent_memories (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE notifications (
    id                TEXT PRIMARY KEY NOT NULL,
    title             TEXT NOT NULL,
    body              TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('trade_confirmation', 'trade_executed', 'risk_alert', 'task_completed', 'task_failed', 'price_alert', 'analysis_ready', 'task_modification_proposed', 'task_modification_applied', 'strategy_discovered')),
    decision_id       TEXT REFERENCES agent_decisions (id) ON DELETE SET NULL,
    task_id           TEXT REFERENCES agent_tasks (id) ON DELETE SET NULL,
    order_id          TEXT REFERENCES orders (id) ON DELETE SET NULL,
    session_id        TEXT REFERENCES agent_sessions (id) ON DELETE SET NULL,
    data              TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data)),
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'read', 'actioned', 'expired', 'failed')),
    delivered_at      INTEGER,
    delivery_error    TEXT,
    read_at           INTEGER,
    action_taken      TEXT CHECK (action_taken IS NULL OR action_taken IN ('confirmed', 'rejected', 'dismissed')),
    action_taken_at   INTEGER,
    action_comment    TEXT,
    created_at        INTEGER NOT NULL,
    expires_at        INTEGER
) STRICT;

CREATE INDEX ix_notifications_created ON notifications (created_at DESC);
CREATE INDEX ix_notifications_unread ON notifications (read_at, created_at DESC);
CREATE INDEX ix_notifications_expiry ON notifications (status, expires_at);
CREATE INDEX ix_notifications_decision ON notifications (decision_id);

------------------------------------------------------------------------------------------------------
-- Trading
------------------------------------------------------------------------------------------------------

CREATE TABLE orders (
    id                        TEXT PRIMARY KEY NOT NULL,
    exchange_order_id         TEXT,
    client_order_id           TEXT,
    execution_idempotency_key TEXT,
    symbol                    TEXT NOT NULL,
    side                      TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    order_type                TEXT NOT NULL CHECK (order_type IN ('market', 'limit', 'stop_market', 'stop_limit', 'take_profit', 'take_profit_limit')),
    status                    TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected', 'expired')),
    quantity                  REAL NOT NULL,
    filled_quantity           REAL NOT NULL DEFAULT 0,
    price                     REAL,
    avg_fill_price            REAL,
    stop_price                REAL,
    stop_loss_price           REAL,
    take_profit_price         REAL,
    entry_price               REAL,
    exit_price                REAL,
    realized_pnl              REAL,
    realized_pnl_percent      REAL,
    fees_paid                 REAL,
    net_pnl                   REAL,
    trade_status              TEXT NOT NULL DEFAULT 'open' CHECK (trade_status IN ('open', 'closed')),
    closed_at                 INTEGER,
    agent_reasoning           TEXT CHECK (agent_reasoning IS NULL OR json_valid(agent_reasoning)),
    strategy_id               TEXT REFERENCES strategies (id) ON DELETE SET NULL,
    source                    TEXT NOT NULL CHECK (source IN ('legacy', 'atk_mirror')),
    agent_session_id          TEXT REFERENCES agent_sessions (id) ON DELETE SET NULL,
    agent_session_message_id  TEXT REFERENCES agent_session_messages (id) ON DELETE SET NULL,
    tool_use_id               TEXT,
    is_algo                   INTEGER NOT NULL DEFAULT 0 CHECK (is_algo IN (0, 1)),
    algo_order_id             TEXT,
    algo_type                 TEXT CHECK (algo_type IS NULL OR algo_type IN ('oco', 'conditional', 'trigger', 'move_order_stop')),
    callback_ratio            REAL,
    pending_until             INTEGER,
    created_at                INTEGER NOT NULL,
    updated_at                INTEGER NOT NULL,
    filled_at                 INTEGER
) STRICT;

-- The idempotency key is the client order id of a write. A second insert with the same key must fail:
-- that is how a duplicated order placement is refused.
CREATE UNIQUE INDEX ux_orders_idempotency ON orders (execution_idempotency_key)
    WHERE execution_idempotency_key IS NOT NULL AND execution_idempotency_key <> '';
CREATE INDEX ix_orders_created ON orders (created_at DESC);
CREATE INDEX ix_orders_status ON orders (status, created_at DESC);
CREATE INDEX ix_orders_symbol ON orders (symbol, created_at DESC);
CREATE INDEX ix_orders_trade_status ON orders (trade_status, created_at DESC);
CREATE INDEX ix_orders_exchange_id ON orders (exchange_order_id) WHERE exchange_order_id IS NOT NULL;
-- Placeholder rows written before a placement reaches the exchange; swept when they outlive pending_until.
CREATE INDEX ix_orders_stub_expiry ON orders (pending_until) WHERE pending_until IS NOT NULL;

CREATE TABLE strategy_knowledge (
    seq                 INTEGER PRIMARY KEY,
    id                  TEXT NOT NULL UNIQUE,
    name                TEXT NOT NULL UNIQUE,
    description         TEXT NOT NULL,
    entry_rules         TEXT NOT NULL CHECK (json_valid(entry_rules)),
    exit_rules          TEXT NOT NULL CHECK (json_valid(exit_rules)),
    risk_params         TEXT NOT NULL CHECK (json_valid(risk_params)),
    backtest_results    TEXT CHECK (backtest_results IS NULL OR json_valid(backtest_results)),
    win_rate            REAL,
    avg_return          REAL,
    max_drawdown        REAL,
    sharpe_ratio        REAL,
    overall_rating      REAL,
    rating_confidence   REAL,
    -- The single user's own rating of this strategy.
    user_rating         REAL CHECK (user_rating IS NULL OR user_rating BETWEEN 1 AND 5),
    helpfulness         REAL CHECK (helpfulness IS NULL OR helpfulness BETWEEN 1 AND 5),
    rating_notes        TEXT,
    rating_tags         TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(rating_tags)),
    rated_at            INTEGER,
    market_conditions   TEXT CHECK (market_conditions IS NULL OR json_valid(market_conditions)),
    asset_classes       TEXT CHECK (asset_classes IS NULL OR json_valid(asset_classes)),
    timeframes          TEXT CHECK (timeframes IS NULL OR json_valid(timeframes)),
    source_url          TEXT,
    source_session_id   TEXT REFERENCES agent_sessions (id) ON DELETE SET NULL,
    extraction_messages TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(extraction_messages)),
    context_prefix      TEXT,
    created_at          INTEGER NOT NULL,
    updated_at          INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_strategy_knowledge_created ON strategy_knowledge (created_at DESC);
CREATE INDEX ix_strategy_knowledge_rating ON strategy_knowledge (overall_rating DESC);
CREATE INDEX ix_strategy_knowledge_source_url ON strategy_knowledge (source_url) WHERE source_url IS NOT NULL;

-- A tradable strategy. Every strategy_knowledge row has one "shadow" strategy, matched by knowledge_id,
-- which is what the Strategies page lists.
CREATE TABLE strategies (
    id               TEXT PRIMARY KEY NOT NULL,
    name             TEXT NOT NULL,
    description      TEXT,
    is_active        INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
    entry_rules      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(entry_rules)),
    exit_rules       TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(exit_rules)),
    risk_params      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(risk_params)),
    symbols          TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(symbols)),
    timeframes       TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(timeframes)),
    backtest_results TEXT CHECK (backtest_results IS NULL OR json_valid(backtest_results)),
    live_performance TEXT CHECK (live_performance IS NULL OR json_valid(live_performance)),
    knowledge_id     TEXT REFERENCES strategy_knowledge (id) ON DELETE SET NULL,
    auto_discovered  INTEGER NOT NULL DEFAULT 0 CHECK (auto_discovered IN (0, 1)),
    source_url       TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    last_executed_at INTEGER
) STRICT;

CREATE INDEX ix_strategies_created ON strategies (created_at DESC);
CREATE INDEX ix_strategies_name ON strategies (name);
CREATE INDEX ix_strategies_knowledge ON strategies (knowledge_id) WHERE knowledge_id IS NOT NULL;

CREATE TABLE strategy_discovery_cycles (
    id                                TEXT PRIMARY KEY NOT NULL,
    explorer_session_id               TEXT REFERENCES agent_sessions (id) ON DELETE SET NULL,
    candidates_found                  INTEGER NOT NULL DEFAULT 0,
    strategies_saved                  INTEGER NOT NULL DEFAULT 0,
    strategies_skipped_low_confidence INTEGER NOT NULL DEFAULT 0,
    strategies_failed                 INTEGER NOT NULL DEFAULT 0,
    status                            TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
    error                             TEXT,
    manual                            INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1)),
    started_at                        INTEGER NOT NULL,
    ended_at                          INTEGER
) STRICT;

CREATE INDEX ix_strategy_discovery_cycles_started ON strategy_discovery_cycles (started_at DESC);

CREATE TABLE trade_lessons (
    seq              INTEGER PRIMARY KEY,
    id               TEXT NOT NULL UNIQUE,
    order_id         TEXT REFERENCES orders (id) ON DELETE SET NULL,
    outcome          TEXT NOT NULL CHECK (outcome IN ('profit', 'loss', 'breakeven')),
    profit_pct       REAL NOT NULL,
    profit_amount    REAL,
    lesson_summary   TEXT NOT NULL,
    market_context   TEXT NOT NULL CHECK (json_valid(market_context)),
    mistakes         TEXT CHECK (mistakes IS NULL OR json_valid(mistakes)),
    successes        TEXT CHECK (successes IS NULL OR json_valid(successes)),
    recommendations  TEXT CHECK (recommendations IS NULL OR json_valid(recommendations)),
    symbol           TEXT NOT NULL,
    side             TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    entry_price      REAL NOT NULL,
    exit_price       REAL NOT NULL,
    duration_minutes INTEGER,
    context_prefix   TEXT,
    created_at       INTEGER NOT NULL
) STRICT;

-- At most one lesson is learned from an order.
CREATE UNIQUE INDEX ux_trade_lessons_order ON trade_lessons (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX ix_trade_lessons_symbol ON trade_lessons (symbol, created_at DESC);
CREATE INDEX ix_trade_lessons_outcome ON trade_lessons (outcome, created_at DESC);

CREATE TABLE trading_patterns (
    seq                INTEGER PRIMARY KEY,
    id                 TEXT NOT NULL UNIQUE,
    pattern_name       TEXT NOT NULL,
    pattern_type       TEXT NOT NULL,
    description        TEXT NOT NULL,
    conditions         TEXT NOT NULL CHECK (json_valid(conditions)),
    success_rate       REAL NOT NULL,
    sample_count       INTEGER NOT NULL,
    avg_return         REAL NOT NULL,
    avg_duration_hours INTEGER,
    symbols            TEXT CHECK (symbols IS NULL OR json_valid(symbols)),
    timeframes         TEXT CHECK (timeframes IS NULL OR json_valid(timeframes)),
    market_conditions  TEXT CHECK (market_conditions IS NULL OR json_valid(market_conditions)),
    context_prefix     TEXT,
    created_at         INTEGER NOT NULL,
    last_validated     INTEGER
) STRICT;

CREATE INDEX ix_trading_patterns_type ON trading_patterns (pattern_type, success_rate DESC);
CREATE INDEX ix_trading_patterns_name ON trading_patterns (pattern_name);

------------------------------------------------------------------------------------------------------
-- News
------------------------------------------------------------------------------------------------------

CREATE TABLE news_sources (
    id                   TEXT PRIMARY KEY NOT NULL,
    name                 TEXT NOT NULL,
    domain               TEXT NOT NULL UNIQUE,
    source_type          TEXT NOT NULL DEFAULT 'unknown' CHECK (source_type IN ('official', 'major_news', 'news', 'blog', 'social', 'unknown')),
    description          TEXT,
    credibility_score    REAL NOT NULL DEFAULT 0.5 CHECK (credibility_score BETWEEN 0 AND 1),
    accuracy_history     TEXT CHECK (accuracy_history IS NULL OR json_valid(accuracy_history)),
    bias_rating          TEXT,
    rss_url              TEXT,
    crawl_enabled        INTEGER NOT NULL DEFAULT 1 CHECK (crawl_enabled IN (0, 1)),
    crawl_interval_hours INTEGER NOT NULL DEFAULT 1,
    strategy_extraction  INTEGER NOT NULL DEFAULT 0 CHECK (strategy_extraction IN (0, 1)),
    auto_discovered      INTEGER NOT NULL DEFAULT 0 CHECK (auto_discovered IN (0, 1)),
    last_crawled         INTEGER,
    last_error           TEXT,
    created_at           INTEGER NOT NULL,
    updated_at           INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_news_sources_crawl ON news_sources (crawl_enabled, credibility_score DESC);
CREATE INDEX ix_news_sources_type ON news_sources (source_type, credibility_score DESC);

CREATE TABLE news_articles (
    seq                 INTEGER PRIMARY KEY,
    id                  TEXT NOT NULL UNIQUE,
    source_id           TEXT NOT NULL REFERENCES news_sources (id) ON DELETE CASCADE,
    url                 TEXT NOT NULL UNIQUE, -- normalized: tracking parameters and trailing slash removed
    url_hash            TEXT NOT NULL,
    content_hash        TEXT NOT NULL,        -- empty string when the article has no body
    title               TEXT NOT NULL,
    content             TEXT NOT NULL,
    summary             TEXT,
    sentiment_score     REAL CHECK (sentiment_score IS NULL OR sentiment_score BETWEEN -1 AND 1),
    relevance_score     REAL CHECK (relevance_score IS NULL OR relevance_score BETWEEN 0 AND 1),
    keywords            TEXT CHECK (keywords IS NULL OR json_valid(keywords)),
    predicted_impact    TEXT,
    actual_impact       TEXT,
    prediction_verified INTEGER NOT NULL DEFAULT 0 CHECK (prediction_verified IN (0, 1)),
    context_prefix      TEXT,
    published_at        INTEGER,
    fetched_at          INTEGER NOT NULL,
    created_at          INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_news_articles_url_hash ON news_articles (url_hash);
CREATE INDEX ix_news_articles_content_hash ON news_articles (content_hash) WHERE content_hash <> '';
CREATE INDEX ix_news_articles_published ON news_articles (published_at DESC);
CREATE INDEX ix_news_articles_source ON news_articles (source_id, published_at DESC);
CREATE INDEX ix_news_articles_relevance ON news_articles (relevance_score DESC, published_at DESC);

-- Assets an article mentions, one row each, so "articles about BTC" is an index lookup.
CREATE TABLE news_article_assets (
    article_id TEXT NOT NULL REFERENCES news_articles (id) ON DELETE CASCADE,
    asset      TEXT NOT NULL,
    PRIMARY KEY (article_id, asset)
) STRICT, WITHOUT ROWID;

CREATE INDEX ix_news_article_assets_asset ON news_article_assets (asset);

CREATE TABLE credibility_events (
    id                TEXT PRIMARY KEY NOT NULL,
    source_id         TEXT NOT NULL REFERENCES news_sources (id) ON DELETE CASCADE,
    article_id        TEXT REFERENCES news_articles (id) ON DELETE SET NULL,
    prediction_type   TEXT NOT NULL,
    predicted_outcome TEXT NOT NULL,
    actual_outcome    TEXT NOT NULL,
    was_accurate      INTEGER NOT NULL CHECK (was_accurate IN (0, 1)),
    confidence_score  REAL CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
    symbol            TEXT,
    timeframe_hours   INTEGER,
    evaluated_at      INTEGER NOT NULL
) STRICT;

CREATE INDEX ix_credibility_events_source ON credibility_events (source_id, evaluated_at DESC);

------------------------------------------------------------------------------------------------------
-- Full-text search
--
-- Keyword search is the only retrieval path until an embedding provider is configured, and one half of
-- hybrid retrieval after that. Each index mirrors its table through triggers ("external content").
------------------------------------------------------------------------------------------------------

CREATE VIRTUAL TABLE strategy_knowledge_fts USING fts5 (
    name, description,
    content = 'strategy_knowledge', content_rowid = 'seq', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER strategy_knowledge_fts_insert AFTER INSERT ON strategy_knowledge BEGIN
    INSERT INTO strategy_knowledge_fts (rowid, name, description) VALUES (new.seq, new.name, new.description);
END;

CREATE TRIGGER strategy_knowledge_fts_update AFTER UPDATE OF name, description ON strategy_knowledge BEGIN
    INSERT INTO strategy_knowledge_fts (strategy_knowledge_fts, rowid, name, description) VALUES ('delete', old.seq, old.name, old.description);
    INSERT INTO strategy_knowledge_fts (rowid, name, description) VALUES (new.seq, new.name, new.description);
END;

CREATE TRIGGER strategy_knowledge_fts_delete AFTER DELETE ON strategy_knowledge BEGIN
    INSERT INTO strategy_knowledge_fts (strategy_knowledge_fts, rowid, name, description) VALUES ('delete', old.seq, old.name, old.description);
    DELETE FROM vectors WHERE kind = 'strategy_knowledge' AND item_id = old.id;
END;

CREATE VIRTUAL TABLE trade_lessons_fts USING fts5 (
    lesson_summary,
    content = 'trade_lessons', content_rowid = 'seq', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER trade_lessons_fts_insert AFTER INSERT ON trade_lessons BEGIN
    INSERT INTO trade_lessons_fts (rowid, lesson_summary) VALUES (new.seq, new.lesson_summary);
END;

CREATE TRIGGER trade_lessons_fts_update AFTER UPDATE OF lesson_summary ON trade_lessons BEGIN
    INSERT INTO trade_lessons_fts (trade_lessons_fts, rowid, lesson_summary) VALUES ('delete', old.seq, old.lesson_summary);
    INSERT INTO trade_lessons_fts (rowid, lesson_summary) VALUES (new.seq, new.lesson_summary);
END;

CREATE TRIGGER trade_lessons_fts_delete AFTER DELETE ON trade_lessons BEGIN
    INSERT INTO trade_lessons_fts (trade_lessons_fts, rowid, lesson_summary) VALUES ('delete', old.seq, old.lesson_summary);
    DELETE FROM vectors WHERE kind = 'trade_lesson' AND item_id = old.id;
END;

CREATE VIRTUAL TABLE trading_patterns_fts USING fts5 (
    pattern_name, description,
    content = 'trading_patterns', content_rowid = 'seq', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER trading_patterns_fts_insert AFTER INSERT ON trading_patterns BEGIN
    INSERT INTO trading_patterns_fts (rowid, pattern_name, description) VALUES (new.seq, new.pattern_name, new.description);
END;

CREATE TRIGGER trading_patterns_fts_update AFTER UPDATE OF pattern_name, description ON trading_patterns BEGIN
    INSERT INTO trading_patterns_fts (trading_patterns_fts, rowid, pattern_name, description) VALUES ('delete', old.seq, old.pattern_name, old.description);
    INSERT INTO trading_patterns_fts (rowid, pattern_name, description) VALUES (new.seq, new.pattern_name, new.description);
END;

CREATE TRIGGER trading_patterns_fts_delete AFTER DELETE ON trading_patterns BEGIN
    INSERT INTO trading_patterns_fts (trading_patterns_fts, rowid, pattern_name, description) VALUES ('delete', old.seq, old.pattern_name, old.description);
    DELETE FROM vectors WHERE kind = 'trading_pattern' AND item_id = old.id;
END;

CREATE VIRTUAL TABLE news_articles_fts USING fts5 (
    title, summary,
    content = 'news_articles', content_rowid = 'seq', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER news_articles_fts_insert AFTER INSERT ON news_articles BEGIN
    INSERT INTO news_articles_fts (rowid, title, summary) VALUES (new.seq, new.title, new.summary);
END;

CREATE TRIGGER news_articles_fts_update AFTER UPDATE OF title, summary ON news_articles BEGIN
    INSERT INTO news_articles_fts (news_articles_fts, rowid, title, summary) VALUES ('delete', old.seq, old.title, old.summary);
    INSERT INTO news_articles_fts (rowid, title, summary) VALUES (new.seq, new.title, new.summary);
END;

CREATE TRIGGER news_articles_fts_delete AFTER DELETE ON news_articles BEGIN
    INSERT INTO news_articles_fts (news_articles_fts, rowid, title, summary) VALUES ('delete', old.seq, old.title, old.summary);
    DELETE FROM vectors WHERE kind = 'news_article' AND item_id = old.id;
END;

CREATE VIRTUAL TABLE agent_memories_fts USING fts5 (
    content,
    content = 'agent_memories', content_rowid = 'seq', tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TRIGGER agent_memories_fts_insert AFTER INSERT ON agent_memories BEGIN
    INSERT INTO agent_memories_fts (rowid, content) VALUES (new.seq, new.content);
END;

CREATE TRIGGER agent_memories_fts_update AFTER UPDATE OF content ON agent_memories BEGIN
    INSERT INTO agent_memories_fts (agent_memories_fts, rowid, content) VALUES ('delete', old.seq, old.content);
    INSERT INTO agent_memories_fts (rowid, content) VALUES (new.seq, new.content);
END;

CREATE TRIGGER agent_memories_fts_delete AFTER DELETE ON agent_memories BEGIN
    INSERT INTO agent_memories_fts (agent_memories_fts, rowid, content) VALUES ('delete', old.seq, old.content);
    DELETE FROM vectors WHERE kind = 'agent_memory' AND item_id = old.id;
END;
