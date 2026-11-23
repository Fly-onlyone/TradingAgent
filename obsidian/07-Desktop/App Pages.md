---
tags: [desktop, ui, pages]
---

# App Pages

> The window is a navigation rail and one page. Code: `src/TradingAgent.App/ViewModels`,
> `src/TradingAgent.App/Views`, registration in `ShellApp.BuildServices`.

## The rail

In this order: Chat, Dashboard, Trading, Orders, Trades, Tasks, Strategies, Knowledge, Memory, News,
Settings, Admin, Diagnostics. The app opens on Chat.

The order of the rail is the order the pages are registered as `PageViewModel` in
`ShellApp.BuildServices`. A page needs three things:

1. a view model that derives from `PageViewModel` (`Title`, and `Activate()` to read anew what
   changed while the page was not shown; `Deactivate()` to stop what only matters while it is seen);
2. a view, and its case in the switch of `ViewLocator` (no reflection: Native AOT);
3. two registrations: the view model itself, and the same instance as `PageViewModel`.

A page is a singleton and lives as long as the app.

## Threads

A command that waits (OKX, a model, a file) runs with `await Task.Run(...).ConfigureAwait(false)`
and comes back to the UI thread through the `post` action given to the view model's constructor.
Tests pass `action => action()`. The analyzers make a missing `ConfigureAwait` an error, so there is
no implicit way back.

## One page opens another

`AppNavigator.OpenChat(sessionId)` asks the shell to show the chat screen with one session: the
Tasks page uses it for "Open last run", the Strategies page after "Have the agent read it".

## Chat

`ChatViewModel` starts a run and then follows [[Agent Runs|the agent's events]]; it does not hold
the run's state. After a restart it shows what the database holds. Streamed text is drawn a few
times a second, because drawing Markdown (`Controls/MarkdownView`) is the expensive part. The list
shows chats and the runs of [[Scheduled Tasks]].

## What cannot be taken back

Switching to live trading (Settings), restoring a backup and deleting a kind of data (Admin) take
two presses: the first shows what it means and changes nothing, the second does it. A test of each
proves the first step changes nothing.

## Checking the real app

Every input has an `AutomationProperties.Name`. A script can start the published app, choose a page
of the rail, type and press through UI Automation, and take a picture of the window. A feature is
not called done on tests alone when it has a screen.

## See also

- [[Desktop Shell Behaviour]]
- [[Desktop Solution Layout]]
