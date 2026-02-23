# Documentation Style

## When to Skip Docs

- Trivial getters/setters and property accessors
- Functions where name + type hints are self-explanatory
- Standard CRUD endpoints and Pydantic models with Field descriptions
- Args/Returns sections when parameter names and types are obvious

## When Docs ARE Needed

- Non-obvious behavior, side effects, or edge cases
- Exchange-specific logic (OKX format conversions, API quirks)
- Complex trading algorithms or risk calculations
- Parameters with specific constraints or formats
- Functions that deviate from what the name suggests

## Style Rules

- **Imperative mood**: "Gets the value" not "This function gets the value"
- **WHY, not WHAT**: Code shows what — comments explain business logic and trade-offs
- **Prefer examples over prose**: A `doctest` or usage snippet beats paragraphs
- **Python**: Google-style docstrings. Omit obvious Args/Returns sections.
- **TypeScript**: TSDoc (`/** */`). Keep `@param`/`@returns` only when non-obvious.


