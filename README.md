# Trading Agent

A Windows desktop app in which an AI agent analyses crypto markets and trades on OKX for you. It is
one native program: no server to run, no account to create, your data in one file on your computer.

> The app can place real orders with real money. It starts in **demo trading** and stays there until
> you switch to live trading in Settings. Read [Safety](#safety) first.

## What it does

- **Chat** with the agent: it reads prices, your balance and positions, the news, and what it
  learned before, and places an order when you ask for one.
- **Scheduled tasks**: work the agent does on its own, such as a market review every morning. A task
  cannot trade unless you allow that task to.
- **Dashboard, Trading, Orders, Trades**: your account, a price chart, every order, and what each
  closed trade came to.
- **Strategies and Knowledge**: strategies you wrote, imported from a page, or let the agent find;
  one search over strategies, trade lessons, price patterns, news and memories.
- **Memory**: what the agent keeps between conversations, for you to read and correct.
- **News**: articles collected from the feeds you choose.
- **Notifications** on the desktop and, if you want, by email.
- **Admin**: the log, backups, and deleting data.

## Install

Download `TradingAgent-win-Setup.exe` from the
[latest release](https://github.com/Fly-onlyone/TradingAgent/releases/latest) and run it. The builds
are not signed yet, so Windows SmartScreen warns about an unknown publisher on the first install.
The app updates itself from the same releases.

Then, in **Settings**:

1. Choose how the model runs: an Anthropic or OpenAI API key, or your Claude subscription (below).
2. Save your OKX API key, secret key and passphrase. Create the key on OKX for **demo trading**
   first.
3. Set your risk limits.

Your data is in `%LOCALAPPDATA%\TradingAgent\`. Uninstalling the app does not delete it.

## Signing in with a Claude subscription

The agent can run on an API key (Anthropic or OpenAI) or on a Claude subscription. With a
subscription, the Claude Code program installed on the computer runs the model:

- The app starts Claude Code unmodified. It shows no Claude sign-in of its own and never sees,
  stores or passes on the sign-in. The user signs in with `claude auth login` in a terminal.
- The app asks the user to read and confirm a notice before the first run with a subscription
  (Settings → Model).
- Use it with your own subscription, for your own use. Anthropic does not allow an app to route
  requests through another person's plan, and the plans' usage limits assume ordinary use by one
  person.
- Anyone who offers this app to other people with this sign-in mode needs Anthropic's Commercial
  Terms. An API key is the other way to sign in.

This is a summary, not legal advice. Anthropic's page is the authority:
<https://code.claude.com/docs/en/legal-and-compliance>.

## Safety

- **Demo first.** Orders are simulated on OKX demo trading until you switch to live trading, which
  asks you twice.
- **One way to the exchange.** Every order, cancel, transfer and leverage change the agent asks for
  is checked by the app before it reaches OKX. The app refuses an order that would make one position
  larger than your limit, leverage above 10, transfers above 1000 USDT, and anything it has no rule
  for. There is no order form: an order always goes through this check.
- **Emergency stop** in Settings: while it is on, the agent can cancel orders and nothing else.
- **Unattended runs cannot trade** unless you allowed that task to. The agent cannot give itself
  that permission.
- **Your keys** are stored encrypted for your Windows account and are never shown again. The OKX key
  is handed to the trade kit when it starts and is not written to a file.
- **What the agent reads on the web is not an instruction.** It reads public pages only.
- **Crash reports** hold no keys, account data or personal details, and can be switched off on the
  Diagnostics page.

Trading crypto can lose all the money you put in. The agent's analysis is not financial advice, and
nothing here promises a profit.

## Search by meaning (optional)

The Knowledge search finds by words out of the box. To let it also find texts that mean the same in
other words, choose an embedding provider on the Knowledge page: [Ollama](https://ollama.com) or
LM Studio on your own computer, or OpenAI.

## Build from source

Needs the [.NET 10 SDK](https://dotnet.microsoft.com/download) and, for the Native AOT publish,
Visual Studio 2022 Build Tools with the "Desktop development with C++" workload.

```powershell
dotnet build TradingAgent.slnx
dotnet test TradingAgent.slnx
dotnet run --project src/TradingAgent.App
```

A Debug build keeps its data apart, in `%LOCALAPPDATA%\TradingAgent-Dev\`. For the agent to trade
from a build of your own, install the OKX trade kit: `npm install -g @okx_ai/okx-trade-mcp@1.3.3`.
Release builds bundle it.

```powershell
dotnet publish src/TradingAgent.App -c Release -r win-x64 -o publish
```

## How it is built

C# on .NET 10, [Avalonia](https://avaloniaui.net) 12, compiled ahead of time to one native program;
SQLite for everything it stores; [Velopack](https://velopack.io) for the installer and updates. The
[OKX trade kit](https://www.npmjs.com/package/@okx_ai/okx-trade-mcp) runs as a helper process and is
the only part that can write to the exchange.

The design notes are in [`obsidian/07-Desktop`](obsidian/07-Desktop/_index.md); the rules for
working on the code are in [`CLAUDE.md`](CLAUDE.md). The app replaces an earlier Python, React and
Tauri version, whose last state is the tag before this change.

## Contributing

Commits and pull request titles follow [Conventional Commits](https://www.conventionalcommits.org).
Versions and the changelog are written by Release Please; do not edit them by hand.
