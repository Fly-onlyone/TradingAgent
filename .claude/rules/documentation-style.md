# Documentation Style

## When to skip docs

- Members whose name and types say everything
- Simple records and plain data classes
- `<param>` and `<returns>` when names and types are obvious

## When docs are needed

- Behaviour that is not obvious: side effects, edge cases, what is left out on purpose
- Exchange-specific logic (OKX formats, contract sizes, what a size means)
- Risk and money calculations
- Anything about safety: why a check exists, what must never be added
- A choice that looks wrong until the reason is known

## Style rules

- **C# XML doc comments** (`/// <summary>`). Add `<remarks>` for the reason behind a design.
- **WHY, not WHAT**: the code shows what; the comment gives the reason and the trade-off.
- **Plain, short sentences.** One idea per sentence. Say what a thing does for the user or the
  caller.
- **Comments inside a method** are for the line that would otherwise be "fixed" by the next reader.
- **Vault notes** (`obsidian/07-Desktop/`): update the note in the same pull request as the code
  that makes it stale.
