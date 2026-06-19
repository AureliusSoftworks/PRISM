---
name: 📊 status
description: Briefly summarize progress and resume work
invokable: true
---

# /status — Quick Progress Check

You have been invoked mid-task in Continue. Your job is to briefly summarize the current state, then resume exactly where the work left off.

Do not use Cursor-only tools. Do not re-read files or re-run commands only to generate the summary; use the conversation and workspace state already available.

## Output

Summarize in no more than five bullets:

- 🎯 **Goal** — what the user originally asked for.
- ✅ **Done** — what has been completed so far.
- 🔄 **In progress** — what was actively being worked on when interrupted.
- ⏭️ **Next** — what remains after the current step.
- ⚠️ **Blockers** — anything stalled or waiting on the user, if any.

Then immediately resume the prior task with no extra preamble.

## Constraints

- Keep this brief; it is a glance, not a report.
- Do not ask follow-up questions unless a blocker genuinely requires user input.
- If there are active todos, reference their status naturally.
- If there is no active task context, say that briefly and ask what the user wants to resume.
