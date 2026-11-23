---
tags: [desktop, agent, claude-code, subscription]
---

# Claude Code Runtime

> When the sign-in mode is "subscription", the Claude Code command line runs the model, signed in
> with the user's own Claude subscription. The tools stay in this app. Code:
> `src/TradingAgent.Agent/Cli/`.

## What it does

- **`ClaudeCliRuntime`** is an `IAgentRuntime` (see [[Agent Runs]]): one Claude Code process per run.
  It writes the prompt as one JSON line, reads the answer as it streams, and records text, tool
  calls and token counts through the same `RunRecorder` as the app's own model loop.
- **`ClaudeCli`** finds the program (`%USERPROFILE%\.local\bin\claude.exe`, then the `PATH`) and asks
  it `claude auth status`. Of the answer it reads two fields, `loggedIn` and `authMethod`.
- **`McpToolServer`** (`Mcp/`) offers the app's tools over the Model Context Protocol;
  **`BridgeEndpoint`** serves it on a named pipe for the length of one run.
- **`StdioPipeBridge`** (`src/TradingAgent.Core/Shell/`) is the app's own exe started as
  `TradingAgent.exe --mcp-bridge <pipe>`: Claude Code needs a program to start as its tool server,
  and this one only passes bytes between its standard streams and the pipe. `Program.Main` handles
  it before anything else of the app starts.

```
Claude Code  --stdio-->  TradingAgent.exe --mcp-bridge  --named pipe-->  running app
                                                                          McpToolServer -> ToolHost -> RiskGate
```

A tool call from Claude Code lands in `ToolHost`, so an order goes through the [[Risk Gate]] exactly
as with the app's own loop. Claude Code never talks to the OKX trade kit.

## How Claude Code is started

| Argument | Why |
|---|---|
| `-p --input-format stream-json --output-format stream-json --verbose --include-partial-messages` | One prompt in, a stream of JSON lines out |
| `--tools ""` | None of Claude Code's own tools: no shell, no files, no web |
| `--strict-mcp-config --mcp-config <file>` | The only tool server is this app |
| `--allowedTools mcp__trading --permission-mode dontAsk` | The app's tools are allowed; everything else is refused without a prompt. Never `bypassPermissions` |
| `--setting-sources ""` | The user's own hooks, plugins and instruction files stay out |
| `--system-prompt-file <file>` | The app's system prompt replaces Claude Code's |
| `--session-id <uuid>` / `--resume <id>` | First run of a session / every later one |
| `--model`, `--effort` | From the settings |

The run is **stopped** when the first output line shows a tool that is not `mcp__trading__…`, a tool
server other than `trading`, or no connected `trading` server.

The child's environment is minimal (`ProcessTransport.InheritedVariables`). `ANTHROPIC_API_KEY` and
`ANTHROPIC_AUTH_TOKEN` are not passed on: with one of them set, Claude Code would use that key
instead of the subscription.

## The bridge's lock

- A new pipe name and a new 256-bit token for every run.
- The pipe takes the current Windows user only (`PipeOptions.CurrentUserOnly`, both ends).
- A connection must send the token as its first line within 5 seconds or it is closed.
- The token is in `mcp.json` in a folder of the run under `<data folder>\claude-code\runs\`, which
  is deleted when the run ends.

## Conversations

Claude Code keeps the conversation itself. The app stores its id in `agent_sessions.sdk_session_id`
and resumes with it. A new conversation starts, with the earlier chat messages put in front of the
prompt as text, when:

- the provider or sign-in mode of the session changed, or
- Claude Code no longer has the conversation ("No conversation found").

Cancelling ends the process; the next run resumes.

## The subscription

What Anthropic's page on Claude Code's terms says (read 2026-11-23; the page is the authority, this is
not legal advice):

| The page says | What the app does |
|---|---|
| An end user may sign in to the unmodified Claude Code program with their own subscription | Starts the program the user installed, unmodified |
| An app may not offer the Claude.ai sign-in itself, or collect, store or pass on the sign-in | Shows no sign-in. The user runs `claude auth login`. Of `claude auth status` two fields are read |
| An app may not route requests through plan credentials on behalf of its users | Each user's own Claude Code, on their own computer |
| Running Claude Code in a product needs the Commercial Terms unless agreed otherwise | Not something code can do: the owner's to settle before giving the app to others |

- **The user confirms a notice first.** `ClaudeCli.SubscriptionNotice` is shown on the Diagnostics
  page while the subscription mode is chosen. Until `agent.subscription_notice_confirmed` is true,
  `AgentRuntimeResolver` gives no runtime for that mode and a run fails with what to do.
- The app does not install or bundle Claude Code.
- `README.md` has the same summary for whoever builds or passes on the app.
- Page: <https://code.claude.com/docs/en/legal-and-compliance>.

## Gotchas

- **One message, one line.** The protocol to Claude Code and to the trade kit is one JSON message per
  line. A tool's schema written over several lines, pasted into a message as it was, cut the message in
  pieces: Claude Code waited 30 s for the tool list, went on without tools, and the model wrote a tool
  call as text. JSON values are now written anew (`McpClient.WriteJson`), and both transports refuse a
  message with a line break. Found only by running the real app.
- **Not `--safe-mode`.** Tried against Claude Code 2.1.330: it also drops the `--mcp-config` server,
  and the model then answers without tools. `--setting-sources ""` keeps the server and was seen to
  run no hooks and load no instruction file.
- **Claude Code tells the model the signed-in account's email and facts about the machine** (its own
  "environment" block). The app does not add them and cannot remove them.
- **The folder Claude Code runs in must not change** (`AppPaths.ClaudeCodeDirectory`): it files a
  conversation under that folder and resumes from there.
- **Which tool call is which**: Claude Code may pass the model's id of a call
  (`_meta["claudecode/toolUseId"]`); otherwise the id is taken from the call it announced on its
  output, matched by tool name, with a wait of up to one second.
- **A missing or signed-out Claude Code** fails the run with what to do. A "signed in" answer is
  trusted for five minutes.
- **Live test**: `LiveClaudeCliTests` runs the real program and the real bridge exe. It needs
  `TRADINGAGENT_LIVE_CLI=1` and `TRADINGAGENT_BRIDGE_EXE`, and spends a little of the subscription of
  whoever runs it.

## See also

- [[Agent Runs]]
- [[Risk Gate]]
- [[Trade Kit Sidecar]]
- [[Desktop Data Folder]]
