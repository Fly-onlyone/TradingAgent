---
tags: [pattern]
---

# create() Factory Pattern

> Async `@classmethod create()` is the canonical entrypoint for any service that needs DB or settings I/O during construction.

## When to apply

Any class whose `__init__` would need to `await` something (resolving API keys, loading [[App Settings]], reading the DB).

## The pattern

```python
class MyService:
    def __init__(self, ...): ...

    @classmethod
    async def create(cls) -> "MyService":
        # Resolve everything that requires await here
        api_key = await resolve_anthropic_api_key()
        return cls(api_key=api_key)
```

## Why

Python `__init__` cannot be async. The factory keeps construction sync while supporting async resolution of secrets and settings.

## Don't

- Don't lazy-init async resources in random methods — keep it in `create()`
- Don't expose the raw constructor as the public API

## See also

- [[_index]]
- [[AI Service Auth]]
