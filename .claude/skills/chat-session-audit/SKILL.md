---
name: chat-session-audit
description: Auditing skill that runs the 10-leg "Chat-Session Features — No UI Gaps" checklist from .claude/rules/code-guide.md against the current repo state. Produces a pass/fail matrix. Use when shipping any feature that creates an AgentSession or writes AgentSessionMessage documents (subagents, background cycles, scheduled agents, AI merge, etc.).
disable-model-invocation: true
---

# Chat-Session Audit

This skill exists because writing to the DB is necessary but NOT sufficient
for chat-session features. The pattern in `.claude/rules/code-guide.md` has
10 legs and every one of them has burned the project before.

## When to run

- Before merging any PR that touches:
  - `backend/app/agent/**`
  - `backend/app/services/notification_service.py`
  - `backend/app/db/models/agent_session.py`
  - `backend/app/services/agent_execution_service.py`
  - `frontend/src/**/agent/**`
- Before shipping a new scheduled/background cycle.
- When reviewing a PR from someone unfamiliar with this project's
  chat-session conventions.

## How to run

Delegate to the `chat-session-reviewer` subagent with the feature name
and (if known) the list of changed files. The subagent reads
`.claude/rules/code-guide.md` and reports pass/fail per leg.

If the subagent is unavailable, grep manually:

```bash
# Leg 1 — persistence
grep -rn "persist_session_message\|persist_session_message_doc" backend/app/

# Leg 2 — live stream
grep -rn 'manager.send_to_user(_agent_channel_user_id' backend/app/

# Leg 3 — sidebar spinner
grep -rn 'keep_running' backend/app/ frontend/src/

# Leg 4 — in-place updates
grep -rn '_broadcast_message_updated' backend/app/

# Leg 6 — CRITICAL: suppress Claude CLI hooks
grep -n 'ClaudeAgentOptions(' backend/ -r
# every hit MUST include: "setting-sources": "local"

# Leg 7 — completion toast
grep -rn 'NotificationService.create_notification\|TASK_COMPLETED\|TASK_FAILED' backend/app/

# Leg 8 — orphan startup hook
grep -rn '_mark_orphaned_.*_cycles_failed' backend/app/

# Leg 10 — strategy shadow (only if feature touches StrategyKnowledge)
grep -rn 'StrategyKnowledge(\|Strategy(' backend/app/services/
```

## Output shape

Produce a markdown table with:
- Leg number + name
- PASS / FAIL / N/A / UNCLEAR
- Evidence as `file:line`

Finish with a **Must-fix** section listing every FAIL and what file+line
needs to change. Do not propose code — the user decides.

## Reference

See `.claude/rules/code-guide.md` → "Pattern: Chat-Session Features —
No UI Gaps" for the canonical checklist and rationale.
