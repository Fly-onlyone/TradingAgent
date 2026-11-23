-- Agent core: what a run needs beyond the first schema.
--
-- The first schema kept only what a chat screen shows. A run that the app drives itself also needs:
--   * the state of a reply while it is being written, so a crash or a cancel leaves a visible result;
--   * the state of each tool call, so "still running", "failed" and "refused by the risk gate" differ;
--   * the exact messages exchanged with the model, to send them back unchanged on the next request.

-- Which model provider and sign-in mode the stored transcript belongs to. A transcript cannot be sent
-- to another provider, so a change of either starts a new transcript.
ALTER TABLE agent_sessions ADD COLUMN provider TEXT CHECK (provider IS NULL OR provider IN ('anthropic', 'openai'));
ALTER TABLE agent_sessions ADD COLUMN auth_mode TEXT CHECK (auth_mode IS NULL OR auth_mode IN ('api_key', 'subscription'));

-- 'running' while the reply is produced. Messages written in one piece (the user's) are 'complete'.
ALTER TABLE agent_session_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'complete'
    CHECK (status IN ('running', 'complete', 'cancelled', 'failed'));
-- Why a reply failed, in words for the user.
ALTER TABLE agent_session_messages ADD COLUMN error TEXT;
ALTER TABLE agent_session_messages ADD COLUMN model TEXT;
ALTER TABLE agent_session_messages ADD COLUMN input_tokens INTEGER;
ALTER TABLE agent_session_messages ADD COLUMN output_tokens INTEGER;

-- Start-up sweep: replies that were being written when the app stopped.
CREATE INDEX ix_agent_session_messages_running ON agent_session_messages (status) WHERE status = 'running';

-- 'denied' is a call the risk gate refused: it never reached the exchange.
ALTER TABLE agent_tool_calls ADD COLUMN status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed', 'denied'));
ALTER TABLE agent_tool_calls ADD COLUMN duration_ms INTEGER;

-- Replaced by the status column: "no result summary yet" was the old way to say "still running".
DROP INDEX ix_agent_tool_calls_unfinished;
CREATE INDEX ix_agent_tool_calls_running ON agent_tool_calls (status) WHERE status = 'running';

-- The conversation as the model provider saw it: one row per item sent or received, in order, stored
-- as the provider's own JSON. Providers require earlier items (thinking, tool calls, tool results) to
-- come back exactly as they were, so they are kept verbatim and never rebuilt from the display tables.
CREATE TABLE agent_transcript (
    session_id TEXT NOT NULL REFERENCES agent_sessions (id) ON DELETE CASCADE,
    seq        INTEGER NOT NULL,
    provider   TEXT NOT NULL CHECK (provider IN ('anthropic', 'openai')),
    model      TEXT,
    item       TEXT NOT NULL CHECK (json_valid(item)),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (session_id, seq)
) STRICT, WITHOUT ROWID;
