---
tags: [pattern]
---

# Strategy Shadow Doc Pattern

> Every `StrategyKnowledge` insert must also create a matching `Strategy` document owned by a real user.

## When to apply

Any code path that writes a `StrategyKnowledge` document — strategy import, [[Strategy Auto-Discovery Cycle]], AI merge, etc.

## The pattern

The Strategies page in the UI reads from the `Strategy` collection, NOT `StrategyKnowledge`. Scheduler paths must resolve a superuser first:

```python
user = await User.find_one(User.is_superuser == True)
if not user:
    logger.warning("No superuser found; skipping strategy shadow")
    return
strategy = Strategy(user_id=user.id, ...)
await strategy.insert()
```

## Why

`StrategyKnowledge` is the RAG-only representation (non-executable). The `Strategy` collection is what users browse and edit. Without the shadow, auto-discovered strategies are invisible in the UI.

## Don't

- Don't pass `user_id=None` — the shadow creation silently skips
- Don't forget the shadow on background cycles — scheduler paths need a superuser resolver

## See also

- [[_index]]
- [[Chat-Session Checklist]]
- [[Strategy Auto-Discovery Cycle]]
