---
name: now-what
description: Orient the user to the single next goalpost when direction is the question. Use whenever the user asks "now what?", "what's next?", "where were we?", "what should I tackle?", "what's left?", or otherwise signals they've finished or returned and want direction — including right after a /brb, a merge, a rebuild, a completed review, or at the start of a session resuming earlier work. Also use when the user seems overwhelmed by open work and asks what matters most.
---

# Now what?

The user steps away, comes back, and asks where the momentum is. The failure
mode this skill exists to prevent is the option dump: ten open items recited
back as a menu, forcing the user to do the prioritization you were asked for.
The deliverable is a *direction* — one goalpost for them, one for you — and
then movement.

## 1. Read the board before advising

Advice from memory goes stale between sessions; the board is ground truth.
Gather, cheaply:

- **The task list** (`TaskList`) — and correct it first. Mark anything
  finished since last update, rename half-done items to their remaining half.
  A stale board produces a wrong recommendation, and the next "now what" pays
  for it too.
- **Recent history** (`git log --oneline`, `git status`) — what landed while
  nobody was looking (the parallel Codex session commits overnight), and
  whether the tree is carrying uncommitted work.
- **The verification ledger** — count the fixes delivered since the user last
  rebuilt and actually tested (`npm run desktop` + a real session). This
  number is usually the whole answer; it is not tracked anywhere, so derive
  it from the conversation and recent commits.
- **Standing mandates** — the long-running bars the user has set (e.g.,
  "smooth, sexy UX from start to finish"). A goalpost that ignores the
  mandate is a detour.

## 2. Classify by what each item is waiting on

The next goalpost is whichever move unblocks the most other work. Sort every
open item into one of four bins:

- **User-only** — needs a capability only the user has: anything behind the
  login gate, visual/audio judgment calls, live test flights, product
  decisions, exported transcripts. These are *their* moves.
- **Tractable now** — diagnosed down to the file and line, small blast
  radius, target files cold (check mtimes; the shared tree has a second
  author). These are *your* moves, and you should take one this turn.
- **Needs evidence** — can't proceed responsibly without data a test flight
  or profile would produce. These convert to user-only: the flight is the
  unblock.
- **Big rock** — architectural, deserves its own work block and a fresh
  session's budget. Name it as the horizon, don't start it as a side effect
  of an orientation question.

**The recurring bottleneck in this project is verification.** When several
unverified fixes have stacked, more code is not progress — risk compounds and
one bad edit hides among many. A validation flight both retires that risk and
produces the evidence the needs-evidence bin is starving for. Recommend it
whenever the ledger is heavy, and say the number.

## 3. Answer shape

Keep it to three parts, in this order:

1. **The board** — one compact block: open items with one-line states. No
   history lessons; the user was there.
2. **Your move** — the single user action with the highest leverage, with the
   *why* stated in terms of what it unblocks ("one rebuild + one session
   validates N fixes and feeds task #4 the profile it needs").
3. **My move** — the single agent action you're taking, then **take it in the
   same turn**. An orientation answer that ends with a plan and no motion is
   half an answer. If nothing is tractable (all hot files, all
   needs-evidence), say so plainly instead of manufacturing busywork.

If the board is genuinely clear — no tasks, no unverified work, no dangling
threads — say the milestone is closed and propose the next milestone-level
goal from the standing mandates, or say honestly that there's nothing urgent.
"Go fly it" is a complete answer when it's true.

## Working rules

- Never re-open a decision the user already made; direction questions are not
  invitations to re-litigate.
- Recommendations name concrete artifacts (task numbers, file paths, the
  command to run), not categories of effort.
- If two items genuinely tie for the user's move, pick one and say why in a
  clause — a tie broken with reasoning beats a menu.
