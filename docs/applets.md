# Prism Applets

Prism applets are experience modules: Chat, Zen, Coffee, Signal, Story, Slate, and
future mode surfaces. Their versions track felt product behavior, not internal
implementation churn.

Applet versions are independent from the Prism app release version. Prism can
ship as `0.5.2` while Coffee is `v0.7` and Story is `v0.1`.

## Ethos

- Version the experience people touch: interaction model, memory behavior,
  prompt behavior, visible controls, data shape, major fixes, and creative
  direction.
- Keep the number quiet in the UI. It is provenance, not a dashboard.
- Start usable applets at `v0.1`; keep planned applets at `v0.0` until a real
  surface exists.
- Bump applet versions for meaningful user-facing changes. Do not bump for
  invisible refactors unless they affect trust, privacy, compatibility, or data.
- Keep each changelog entry short enough to help QA, support, roadmap planning,
  and future migration work.

## Current Applets

| Applet | Version | Status | Notes |
| --- | --- | --- | --- |
| Chat | v1.2 | Active | Full playground for bots, providers, models, images, exports, and memory-aware conversations. |
| Zen | v1.1 | Active | Calm one-to-one continuity surface; the standalone Zen lane is deprecating as this becomes Prism's default state. |
| Coffee | v1.3 | Active | Multi-bot group table with Coffee Groups, session pacing, cups, transcripts, replay, and table controls. |
| Signal | v2.0 | Active | Bot-owned interview shows with editable host-shaped names, generated or procedural studio and logo identities, private producer direction, episode archives, and directed replay. |
| Story | v0.1 | Preview | Generated visual-novel episodes with bots, choices, maps, inventory, and transcripts. |
| Arena | v0.0 | Planned | Moderated bot debate surface. |
| Polling | v0.0 | Planned | AI-powered polling across bot groups. |
| Feed | v0.0 | Planned | BotBook-style social feed. |
| Games | v0.0 | Planned | Boardgame-like bot matches. |
| Gym | v0.0 | Planned | Bot training and memory-development surface. |
| Slate | v0.3 | Preview | Prose-fiction production desk with persistent Shape, Draft, and Refine workflows, optional wildcard-assisted starts, and shared PRISM navigation and theming. |
| Pseudo | v0.0 | Planned | Sketch/system space for almost-code. |
| Surf | v0.0 | Planned | Simple browsing plus optional bot screen viewing. |

## Slate roadmap

Slate is PRISM's next major applet: a quiet prose-fiction production desk where
the AI writes and the writer directs. Its three-region workspace combines a
structure rail, editable manuscript canvas, and concise direction panel across
Shape, Draft, and Refine phases.

Delivery is staged:

1. Standalone Slate foundation for persistent projects, structure, drafting,
   direct edits, revision previews, locks, and version safety.
2. Story -> Slate through an explicit `Develop in Slate` narrative source
   snapshot.
3. Slate -> Story through an explicit `Rehearse in Story` scene or outline
   snapshot.
4. Selective, provenance-aware incorporation of rehearsal discoveries back into
   Slate.

Story remains a separate preview applet. It is the procedural "discover what
happens" experience; Slate is the editorial "turn this into something good"
workspace. Cross-applet stages never silently synchronize or rewrite content.
See [Slate V1 Product and UX Contract](./slate-v1-product-ux-contract.md).

Slate stayed planned `v0.0` until its first functional vertical slice became
usable end to end. It entered preview at `v0.1` and is now `v0.3`; later snapshot
stages do not block the standalone preview.

## Changelog

### 2026-07-15

- Bumped `Slate` to preview `v0.3` with shared PRISM wordmark and utility
  navigation plus branded light/dark workspace treatments.
- Bumped `Slate` to preview `v0.2` with optional `{WILDCARD}` project sparks,
  preview/reroll controls, and persisted source-template provenance.
- Promoted `Slate` to preview `v0.1` for persistent prose projects, generated
  structure, scoped drafting, direct autosaved edits, locks, and explicit
  revision previews with accept/reject version safety.
- Added `Signal v2.0`, the bot-owned interview-show applet with editable host-shaped
  brands, persistent generated-or-procedural studios and logos, private producer
  direction, episode archives, and directed replay.

### 2026-07-14

- Bumped `Chat` to `v1.2`, `Zen` to `v1.1`, and `Coffee` to `v1.3` for
  response recovery, stable conversation ownership, theme and speech fixes,
  richer Coffee session behavior, and the v0.9 stabilization pass.
- Bumped `Chat` to `v1.1`, `Zen` to `v1.0`, and `Coffee` to `v1.2` after
  removing per-bot model routing. Bots now inherit account defaults, while
  explicit workspace or session choices remain available.

### 2026-07-13

- Bumped `Chat` to `v1.0` for the four-mode voice selector, hybrid Babble,
  phoneme-aware mouths, persistent Spotlight search, and filtered group heroes.
- Bumped `Zen` to `v0.9` for phoneme-aware English speech and the restored
  procedural/hybrid robot voice split.
- Bumped `Coffee` to `v1.1` for live navbar policy, first-person table layout,
  read-only review controls, player presence, pot cleanup, and responsive text.
- Bumped `Chat` to `v0.9` for Avatar Details Studio, canonical live-avatar
  rendering, restored procedural Bottish, hybrid Babble, and an explicit voice
  selector.
- Bumped `Zen` to `v0.8` for shared authored screen details and audio-master
  English, Babble, and Bottish reveal timing.
- Bumped `Coffee` to `v1.0` for shared authored avatar details, four-mode table
  speech, and reliable navigation above bot-owned panels.

### 2026-07-12

- Bumped `Chat` to `v0.8` for dedicated Chat settings, bounded wildcard cleanup,
  code-block copy/collapse interaction, Bot Library actions, and per-bot voice
  identity.
- Bumped `Zen` to `v0.7` for reliable Safari voice handoff, stable reveal
  timing, fully native transcript scrolling, shared live-avatar behavior, and
  conversation-surface polish.
- Bumped `Coffee` to `v0.9` for Coffee Powers, richer replay and player
  presence, departure epilogues, cup/arrival persistence, and table pacing.

### 2026-07-10

- Bumped `Chat` to `v0.7` for bot management, bot grid activation, profile
  builder, and Avatar Studio polish.
- Bumped `Zen` to `v0.5` for fresh-session presence timing, selected-bot hero
  panels, and in-hero model/private controls.
- Bumped `Coffee` to `v0.8` for recent visible table, avatar, and live-presence
  polish.

### 2026-07-05

- Bumped `Chat` to `v0.6`, `Zen` to `v0.4`, and `Coffee` to `v0.7` after the
  latest visible applet work.
- Marked the standalone Zen lane as deprecating in favor of Prism's default calm
  state.

### 2026-07-02

- Added applet version labels to Hub tiles and active applet headers.
- Established `apps/web/src/app/appletVersions.ts` as the web UI registry for
  applet names, versions, and status.
- Added this changelog and versioning ethos so applet changes can be tracked
  separately from Prism release notes.

### Initial Baselines

- `Chat v0.5` - Baseline for the current full playground experience.
- `Zen v0.3` - Baseline for the current focused companion experience.
- `Coffee v0.6` - Baseline for the current Coffee Group/session experience.
- `Story v0.1` - Baseline for the current Story preview.
- `v0.0` applets - Planned concepts without a shipped applet surface yet.
