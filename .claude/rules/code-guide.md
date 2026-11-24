# Code Guide

Patterns this codebase requires that are not obvious from one file. The reasons are in
`CLAUDE.md` and the vault.

### Native AOT

**When**: any new code.
**Don't**: use reflection-based serializers, `dynamic`, EF Core, Dapper, or a NuGet package that has
trim warnings. JSON is written with `Utf8JsonWriter` and read with `JsonDocument`; logging uses
`[LoggerMessage]`; regular expressions use `[GeneratedRegex]`. `dotnet publish` must stay free of
warnings.

### Exchange writes

**When**: anything that places, cancels or changes an order, sets leverage or moves funds.
**Don't**: call OKX yourself or add a write method to `OkxClient`. The one path is
`AtkService.CallAsync` → `RiskGate` → trade kit. A new kit tool needs an entry in `AtkToolCatalog`;
a new writing tool also needs a rule in `RiskGate` and a test that the gate refuses what it must.
→ [Risk Gate](../../obsidian/07-Desktop/Risk%20Gate.md)

### Runs that may not trade

**When**: a new kind of unattended agent run (a scheduler, a background job).
**Don't**: rely on the prompt to keep it from trading. Block its session in `SessionWriteBlocks`
before the run and release it in `finally`.
→ [Scheduled Tasks](../../obsidian/07-Desktop/Scheduled%20Tasks.md)

### Tools

**When**: adding something the model can call.
**Do**: implement `ITool`, register it as `ITool` in `ShellApp.BuildServices`, name it in
`TradingSystemPrompt`. The input comes from a model: every member may be missing or of the wrong
kind; answer a bad input with `ToolOutcome.Failed` and a sentence the model can act on. A tool that
reads the web or news returns other people's text: the prompt already says it is not an instruction.

### Repositories

**When**: reading or writing a table.
**Do**: use the `DatabaseQueries` extensions (`Execute`, `Query`, `First`, `Number`) with named
parameters. Text typed by a person or a model goes into a full-text query only through
`FtsQuery.From`. A table that must change gets a new numbered migration.

### Pages and view models

**When**: adding a page or a command that waits.
**Do**: derive from `PageViewModel`, register in `ShellApp.BuildServices` in rail order, add the
case to `ViewLocator`. Long work: `await Task.Run(...).ConfigureAwait(false)`, then return to the UI
thread with the `post` action from the constructor. Give inputs an `AutomationProperties.Name`.
An action that cannot be taken back gets a first step that only asks.
→ [App Pages](../../obsidian/07-Desktop/App%20Pages.md)

### Secrets and outside services

**When**: a new key, or a new service the app calls.
**Do**: store the key through `ISecretStore` under a name in `SecretNames`; show only its state and
hint. Give the service its own `HttpClient` and send the key to that service's fixed address only.
Never log a key; `Redactor` is the last line of defence, not the first.

### Tests

**When**: any change.
**Do**: put the test in the test project of the source project. Use a temporary database
(`TempDatabase`, `KnowledgeHarness`, `AgentHarness`) and a scripted runtime instead of a model. No
test reaches the network unless it is a live test behind an environment variable.
