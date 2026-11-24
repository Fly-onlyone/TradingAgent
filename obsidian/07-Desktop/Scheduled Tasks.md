---
tags: [desktop, agent, tasks, safety]
---

# Scheduled Tasks

> Work the agent does on a schedule, with nobody watching. Code:
> `src/TradingAgent.Agent/Tasks/AgentTaskScheduler.cs`, `src/TradingAgent.Data/Tasks`,
> `src/TradingAgent.Core/Tasks/TaskSchedule.cs`.

## A task

A name, instructions, a schedule, optional instruments, and two switches: may it trade, and must it
ask first. A schedule is one of: every N minutes; every day at a time; on some weekdays at a time.
Times of day are read in the computer's time zone. A task with no schedule runs once.

A task is made on the Tasks page or by the agent (`create_task`). **A task the agent makes cannot
trade.** Only the switch on the Tasks page allows it, and no tool can set that switch.

## A run

`AgentTaskScheduler` looks every 30 seconds for active tasks whose time has come and runs them one
after another. A run is an ordinary agent run in a session of its own (kind `task_run`, title
"Task: name"), so the chat screen shows it live and afterwards.

- Success and failure are counted. After three failures in a row the task stops as `failed`; saving
  it on the Tasks page starts it again.
- The end of a run raises a notification, by email too when email is on.
- While the emergency stop is on, a task that may trade is skipped and waits; a task that only reads
  runs.

## Why a prompt is not the guard

A run that may not trade is told so in its prompt, but that is courtesy. The guard is
`SessionWriteBlocks`: before the run, the scheduler blocks the run's session; the [[Risk Gate]] asks
there before every other rule and refuses every write of a blocked session, whatever the model sent.
The block is released when the run ends.

The same guard covers every strategy discovery run (see [[Knowledge and Search]]). A new kind of
unattended run must use it too.

## See also

- [[Agent Runs]]
- [[Risk Gate]]
- [[App Pages]]
