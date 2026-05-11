---
name: Sandbox Zen Mode UX
overview:
  Sandbox-only Zen toggle that applies Chat-mode presentation to whatever Sandbox thread is open — focused, calm UX for the current chat only. No Chat-style single continuous thread, no continuity promises; utilitarian shell only. API stays sandbox.
todos:
  - id: define-presentation-flag
    content: >-
      Introduce persisted sandboxZenMode (+ derived effectiveChatPresentation helper)
      scoped to Sandbox only; do not use the flag for API payloads.
    status: completed
  - id: map-ui-branching
    content: >-
      Inventory view===chat branching in page.tsx; split presentation vs contract;
      wire presentation-only sites to the effective flag.
    status: completed
  - id: toolbar-glyph
    content: >-
      Add header glyph toggle with tooltip; keep an obvious exit path if layout changes.
    status: completed
  - id: verify-no-contract-drift
    content: >-
      Assert buildChatRequestBody and URLs stay sandbox; manual check memory/thread behavior Zen on/off.
    status: completed
---

# Sandbox Zen mode (Chat-like UX only)

## Intent (replaces prior plan)

Earlier discussion considered flipping API `mode` to `"chat"` from Sandbox — that pulls in **conversation rebinding**, **sidebar filtering**, and **provider/model contracts** documented in backend codepaths. Your revised idea avoids all of that.

**Zen mode** is only: adjust Sandbox’s **presentation** so the **current** conversation feels like the Chat surface (calmer composition, fewer “lab” affordances), while **`buildChatRequestBody`** and server `mode` stay **sandbox**.

### Product clarification (explicit non-goals)

- **Not** Chat’s “one ongoing companion thread” story. Zen does **not** merge threads, reuse the latest-chat row, or imply cross-thread continuity the way the Chat tile does.
- **Purely utilitarian:** the user turns Zen on to **focus** on whatever Sandbox thread they already have selected — same *UX shell* as Chat mode (layout, composer density, chrome), **nothing more** in terms of data or routing.
- Copy and tooltips should avoid language that suggests “this is now Chat” or “living memory lane”; prefer **focus / calm / zen** framing.

## Why this stays safe

| Concern | API-mode toggle | Zen (UX-only) |
|-----|-----|---|
| `processChatMessage` chat routing (~2853+) | Forces latest `conversation_mode === 'chat'` thread | Unaffected |
| Cross-thread vs thread-only memory | Changes with `mode` | Stays Sandbox (`thread_only` path) |
| Sidebar hiding Chat rows | Surprise “missing” threads | No change unless we **explicitly** mirror Chat sidebar visibility (see below) |

## Technical approach

1. **New client state** — e.g. `sandboxZenMode: boolean`, persisted (follow existing `localStorage` patterns keyed by user id in [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx)).
2. **Derived presentation flag** — e.g. `effectiveChatPresentation = view === "chat" || (view === "sandbox" && sandboxZenMode)`. **Do not** use this for `buildChatRequestBody`; keep `isChatMode = view === "chat"` there (see ~15712).
3. **Split today’s `view === "chat"` uses** into:
   - **Presentation** — swap to `effectiveChatPresentation` when `view === "sandbox"` (header layout, composer stack, empty-state bot grid visibility, message frame `data-*` attributes, maybe `assistantWordByWordMode` / `chatEphemeralMode` if you want pixel parity).
   - **Contract / navigation** — leave on `view === "chat"` only (anything that sets `mode` for API, hub tiles, `?view=`, sweep targets, etc.).

Code comment at ~26750 already states Chat’s product goal: stripped composer, hidden technical knobs, etc. Some of that is implemented via `view === "chat"` branches; Zen reuses those branches when Sandbox + Zen is active.

**Note:** Real Chat currently still shows **Local/Online + model picker** in the header via `renderHeaderModelPicker` (~13122) when `view === "chat"`. “Zen” can either **match Chat literally** (show that row) or **go calmer than Chat** (hide model row in Zen only) — product call during implementation; document the choice in the plan section “Decisions to lock during build.”

## Sidebar behavior (explicit choice)

Chat hides the sidebar for focus (~26762 `data-chat-sidebar-hidden`). Zen is about **focused current chat**, so **A (hide sidebar while Zen is on)** aligns best with “nothing more than Chat-like focus UX” — still **no** Chat continuity: switching threads is normal Sandbox behavior once Zen is off or via whatever affordance we keep (e.g. header back / temporary sheet).

- **A (recommended for stated goal):** Hide sidebar like Chat when Zen is on; user exits Zen or uses an existing path to change threads.
- **B:** Keep sidebar visible — only if we discover users feel trapped without it; weaker “focus” match to Chat shell.

## Toolbar control

- Add a small **glyph button** in the existing header action row (same cluster as [`renderChatOverflowGear`](apps/web/src/app/page.tsx) ~22087+).
- Tooltip: e.g. “Zen view” / “Calm layout” (final copy when implementing).
- **Pressed state** reflects `sandboxZenMode`; toggling is instant (no server round-trip).

## Files

- Primary: [`apps/web/src/app/page.tsx`](apps/web/src/app/page.tsx) (most branching), possibly [`page.module.css`](apps/web/src/app/page.module.css) if new `data-zen` hooks help.
- Docs: short note in [`README.md`](README.md) under web shell behavior if the feature ships (user previously asked for README updates on major UX).

## Testing

- Manual: Zen on → send messages → confirm network payload still has `mode: "sandbox"`, same `conversationId` / thread as before Zen (no routing jump).
- If sidebar hidden (A): confirm thread switch path still exists (toggle Zen off or documented affordance).
- Regression: Chat tile unchanged; Coffee/hub unchanged.

## Decisions to lock during build

1. Zen **vs** Chat header: match Chat’s model picker or hide it for calmer Zen.
2. Sidebar: default **A** (hide for focus); keep **B** only if usability testing says users feel stuck.
3. Whether Zen affects **message** chrome (e.g. hide “Fork here” in Sandbox to match Chat stricter surface) — mirrors product hunger for calm vs power-user needs.

## Out of scope

- New API fields, `ChatMode` enum changes, memory pipeline changes, conversation_mode migration.
- Any behavior that makes Zen threads “continuous” like Chat’s single companion lane — out of scope by design.
