# PRISM Living Shell Architecture

PRISM is organized by the role a surface plays, not by a flat list of applets.
The typed source of truth is
`apps/web/src/app/prismSurfaceRegistry.ts`.

## Product roles

- **Home:** All Bots, Prism Home, persona Zen Homes, and group Homes. All Bots
  is the canonical root.
- **Experiences:** Coffee, Signal, Story, and future contextual activities
  entered with selected bots or a saved group.
- **Studios:** Slate and future standalone project applications. A Studio may
  be used without personas, Marketplace, or social Experiences.
- **Tools:** Marketplace, Avatar Studio, Images, Settings, and other supporting
  controls opened in context.

Applet versions remain a separate provenance catalog. They do not determine
navigation hierarchy or startup eligibility.

## Entry and return contract

Home and Slate are the only explicit startup roots. **Last workspace** is a
startup preference that resolves to a saved checkpoint; it is not another
surface or a command-line launch mode.

Coffee and Signal are contextual Experiences. Their entry packet retains an
exact app-relative origin, selected bot or group identity, workspace identity
when relevant, and a focus target. Leaving the Experience restores that
checkpoint instead of guessing where the player came from.

Tools use the same origin-checkpoint behavior. Slate resumes its own persisted
workspace. All Bots always resolves to the Home root.

## Shell direction

The final global shell contains a minimal location strip for Back/Home, current
location, provider/privacy status, and critical session state. The global Prism
companion owns contextual commands and assistance; it does not silently speak
for the player, alter comprehension, or mutate manuscripts and memories.

The living shell is being introduced incrementally so existing routes remain
compatible while each consumer moves to the shared surface registry.

## Global Prism companion

The same Prism identity follows the player through every authenticated surface.
Full Prism contracts into the movable rainbow orb; the orb opens an ephemeral
conversation in place. Players can click it or press **Option Space** on macOS
and **Control Space** on Windows or Linux.

Companion recovery is scoped to the account and exact surface. At most the
latest three messages survive in the current app session. This is short crash
recovery, not conversation history: exchanges are not written to the message,
memory, Continuity, or Slate document stores.

The client sends identifiers only. The server builds authoritative,
tenant-scoped context from those identifiers and may expose names and session
metadata, but never manuscript prose, transcripts, memories, secrets, system
prompts, or Continuity. LOCAL mode always uses the local provider, including
when the current Studio has an online preference.

Prism can propose only allowlisted actions: navigate to Home or Slate, open an
approved Tool, begin bot creation, export an owned bot, or begin an explicit
handoff. Actions appear as buttons and run only after the player selects one.
Destructive actions are intentionally absent. Slate's former manuscript-aware
project chat endpoint returns `410 Gone`; the global companion receives only
project and section identity unless the player begins an explicit, previewed
handoff.

## Slate handoff boundary

Zen and Slate exchange only the exact source passage the player selects. Each
handoff is first stored as a tenant-scoped prepared record containing immutable
source text, source identifiers, selection bounds, direction, and a readable
provenance label. The canvas previews that exact record before a destination is
confirmed.

From Zen, **New project** uses the approved passage as the new project's spark;
**Add to project** attaches a source card without touching manuscript prose or
Continuity. From Slate, **Discuss in Zen** stages the approved excerpt in the
composer but does not send a turn or write memory until the player chooses
Send. Committed handoff provenance survives account backup and restore. Full
transcripts, manuscripts, Continuity, and memories never accompany it.

## First run and living guidance

First run is owned by the account instead of browser storage. A new account
passes through the cinematic, Prism awakening, guided native setup, and three
canvas-formed choices. Skipping the poem still resolves into the shorter
awakening and authored welcome. Existing accounts are migrated as complete so
an update never replays onboarding unexpectedly.

Setup keeps connection secrets in native password controls and sends only
normalized stage and tutorial progress to the living-shell progress endpoint.
Progress is additive, resumable across restarts, and scoped to the account.

Contextual tutorials use one moving Prism orb, a diffused spotlight, compact
captions, and the existing visible control as the advancement action. There is
no generic Next button. Players can go back, skip permanently, or ask to be
reminded later; reminders and exact steps survive restart. Missing
context-specific steps, such as group Atmosphere while visiting a single bot
Home, are skipped without trapping the player. All movement and scrolling
honor reduced-motion preferences, and highlighted controls receive the active
caption through `aria-describedby`.

## Guided revelation

Capability revelations are permanent, account-owned presentation state. They
never grant or revoke permission: direct links, restored checkpoints, and an
explicit request to Prism remain valid before a capability is introduced.
Slate and Zen are visible immediately, while migrated accounts begin with every
current capability revealed.

Marketplace is revealed after a new bot or a meaningful identity, profile,
appearance, or voice save. Signal is revealed after completed Zen replies from
two distinct non-Prism bots. Coffee is revealed after a saved group contains at
least two available bots. Mentioning Marketplace, Signal, or Coffee to the
global companion reveals it immediately. Revelation writes are monotonic, so
deleting the source bot, conversation, or group cannot reverse them, and the
state travels in account backup and restore.
