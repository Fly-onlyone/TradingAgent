---
tags: [desktop, agent]
---

# Agent Runs

> How the native app writes one reply: `AgentRunner` opens it, a runtime produces it, `RunRecorder`
> stores and announces every step. Code: `src/TradingAgent.Agent/`.

## What it does

1. `AgentRunner.RunAsync(sessionId, userText)` stores the user's message and a reply row with status
   `running`. One reply at a time per session: a second request is refused (`Busy`), not queued.
2. `IAgentRuntimeResolver` picks the runtime from the settings at that moment (`agent.provider`,
   `agent.auth_mode`, `agent.model`, `agent.effort`).
3. `ModelLoopRuntime` is this app's own loop: call the model, run the tools it asks for (together),
   send all results back in one item, repeat until the model answers without a tool. At most 40 model
   calls and 20 minutes per reply.
4. Every way a run can end (answer, failure, cancel, time limit) leaves the reply with a final status
   and a `RunFinished` event.

## Parts

| Part | Job |
|---|---|
| `IModelClient` | One call of a model, streamed. `AnthropicModelClient` (HTTP), `OpenAiModelClient` (official package) |
| `ModelCatalog` | The only place that knows model ids. Settings hold a family (`sonnet`); a full id pins a model |
| `ToolHost` | The one way a tool is called: finds it, runs the gates, runs it with a time limit, always returns an outcome |
| `IToolGate` | Checks a call before it runs. Fail closed: a gate that throws refuses the call |
| `QuestionBroker`, `ask_user` | Lets a run ask the user and wait; the open question is stored on the session |
| `RunRecorder` | Keeps the reply row and its tool calls up to date and publishes the events |

## Gotchas

- **The official `Anthropic` C# package cannot be used.** It serializes by reflection: about 3,800
  trim/AOT warnings (version 13.12.0). Claude is called over HTTP with `Utf8JsonWriter`,
  `JsonDocument` and `JsonNode`. The `OpenAI` package publishes clean and is used as it is.
- **Never pass a `JsonNode` subclass to `JsonArray.Add`** without typing it as `JsonNode`: the
  generic overload serializes by reflection and fails the AOT build.
- **A tool call in the transcript always gets a result**, also when the run is cancelled or fails
  half way. Both providers reject a conversation with an unanswered tool call, which would make the
  session unusable.
- **The transcript belongs to one provider.** After a change of provider or sign-in mode it is
  cleared and started again from the messages the chat shows: the words survive, earlier tool calls
  and reasoning do not.
- **The system prompt must not change between calls** (no time, no account state): it is part of
  the cached prefix of every request.
- **Tools are listed in name order** for the same reason.
- Current Claude models reject a thinking budget and sampling parameters; thinking is adaptive and
  its depth is set with the effort level. `agent.thinking_budget` and `agent.thinking_mode` are no
  longer read.
- Signing in with a Claude subscription has no runtime yet; the resolver says so in the reply.

## Not verified

No test calls a real model. The clients are tested against recorded stream text; the first call with
a real key is still to be made.

## See also

- [[_index]]
- [[SQLite Schema Conventions]] — display messages and the provider transcript
- [[Desktop Solution Layout]]
