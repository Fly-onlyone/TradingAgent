---
tags: [desktop, ui, pages]
---

# App Pages

> The window is a header, a sidebar and one page, over a moving background. Code:
> `src/TradingAgent.App/ViewModels`, `src/TradingAgent.App/Views`, registration in
> `ShellApp.BuildServices`. The look is in [[Design System]].

## The sidebar

The pages stand in groups, as in the previous UI:

| Group        | Pages                               |
|--------------|-------------------------------------|
| Core         | Chat, Dashboard                     |
| Monitor      | Trading, Orders, Trades             |
| Intelligence | Strategies, Knowledge, Memory, News |
| System       | Tasks, Diagnostics                  |
| Admin        | Admin (at the bottom)               |
|              | Settings (at the bottom)            |

The app opens on Chat. The groups and icons are a table in `MainViewModel.Arrange`. A page that has
no place in the table still gets a row, so it can always be reached.

The sidebar is 220 px wide. Unpinned (Ctrl+B, or the switch in Settings) it folds to 56 px of icons
and opens while the pointer is over it. Every row keeps its name for UI Automation when folded.

A page needs four things:

1. a view model that derives from `PageViewModel` (`Title`, and `Activate()` to read anew what
   changed while the page was not shown; `Deactivate()` to stop what only matters while it is seen);
2. a view, and its case in the switch of `ViewLocator` (no reflection: Native AOT);
3. two registrations: the view model itself, and the same instance as `PageViewModel`;
4. its group and icon in `MainViewModel.Arrange`.

A page is a singleton and lives as long as the app. Its view is built anew each time it is shown and
rises into place (`ViewLocator` sets the enter animation).

## The header

`HeaderViewModel`: the state of the trade kit and of the agent as two dots, the theme selector, and
the emergency stop. The stop button only opens a question (`Dialog`); the answer sets
`safety.emergency_stop_active`, the same latch as the switch on the Settings page. Resuming asks too.

## The background

`EffectsLayer` draws drifting colour blobs and a particle network under everything, on the render
thread. It starts after the first frame, stops while the window is hidden or minimized, and is off
with "Background effects" off or "Reduced motion" on. The choices are in `AppearanceState`
(settings `ui.theme`, `ui.effects_enabled`, `ui.reduced_motion`, `ui.sidebar_pinned`).

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
