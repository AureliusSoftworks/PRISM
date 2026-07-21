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
| Chat | v1.22 | Active | Full playground for bots, providers, models, images, exports, memory-aware conversations, five-choice English/Premium voice switching, sparse shared mic presence, and ready Powers including current-other-speaker short-term amnesia, one-opening copy behavior, engine-bounded response budgets, distinct relative size and visibility states, loud/quiet presence, speech obfuscation, current-addressee fandom, and cue-only radiant joy or reactive gloom. |
| Zen | v1.21 | Active | Calm one-to-one continuity surface with five-choice English/Premium voice switching, mic presence, and ready Powers including current-other-speaker short-term amnesia, one-opening copy behavior, engine-bounded response budgets, distinct relative size and visibility states, loud/quiet presence, speech obfuscation, current-addressee fandom, and cue-only radiant joy or reactive gloom; the standalone Zen lane is deprecating as this becomes Prism's default state. |
| Coffee | v2.19 | Active | Multi-bot group table with Coffee Groups, live and replay-safe English/Premium switching, model-aware session holds, pacing, cups, transcripts, living atmosphere, distinct replay-safe physical presentation states, current-other-speaker short-term amnesia with accumulating peer agitation, one-opening copy behavior, Power-driven bot-to-bot cut-ins including guaranteed early-to-late interruptions, public-only gibberish context, player/peer-focused fandom, replay-safe bot-only identity mirroring, persisted recipient mood boosts, and direct-addresser mood drains. |
| Signal | v1.30 | Active | Bot-owned anthology interviews with progress-aware Auto completion, progressively streamed live captions, distinct replay-safe physical presentation states, next-utterance English/Premium switching, audience-projected transcript, voice, replay, and reviews; current-other-speaker short-term amnesia with persisted peer pressure; one-opening copy behavior; replay-safe probabilistic or guaranteed early-to-late interruption, speech obfuscation, bot-only identity mirroring, recipient mood boosts, and direct-addresser mood drains; and peer/audience-focused fandom. |
| Story | v0.20 | Preview | Generated visual-novel episodes with bots, choices, maps, inventory, transcripts, shared PRISM menu behavior, adapted physical presentation states, current-other-speaker short-term amnesia, one-opening copy behavior, replay-stable probabilistic or guaranteed interruption, scene-safe speech obfuscation, scene-focus fandom, and cue-only personality-shaped uplift or drag. |
| Arena | v0.0 | Planned | Moderated bot debate surface. |
| Polling | v0.0 | Planned | AI-powered polling across bot groups. |
| Feed | v0.0 | Planned | BotBook-style social feed. |
| Games | v0.0 | Planned | Boardgame-like bot matches. |
| Gym | v0.0 | Planned | Bot training and memory-development surface. |
| Slate | v0.7 | Preview | Prose-fiction production desk with source-specific starts, generated title and cover options, long-form section storage, private Continuity guidance, clean exports, and a movable ephemeral Markdown companion. |
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
The phased Continuity, Review Circle, Atmosphere, safety, export, and publishing
contracts are indexed in [Slate Master Plan](./slate-master-plan.md).
All current and future persona-review systems should follow the shared
[Review Artifacts](./review-artifacts.md) boundary.

Slate stayed planned `v0.0` until its first functional vertical slice became
usable end to end. It entered preview at `v0.1` and is now `v0.7`; later snapshot
stages do not block the standalone preview.

## Changelog

### 2026-07-21

- Bumped `Chat` to `v1.21`, `Zen` to `v1.20`, `Coffee` to `v2.18`, `Signal`
  to `v1.29`, and `Story` to `v0.19` so Lazy Cameron's legacy `Lazy` Power
  means the fewest possible words everywhere. Existing Library copies migrate
  to a hard minimal response budget, and the refreshed Marketplace bot carries
  that deterministic rule.

- Bumped `Coffee` to `v2.17` and `Signal` to `v1.28` so Identity Crisis Ian
  treats a natural, unambiguous short-name vocative such as “Ian” as a real
  bot address. The resulting replay event now activates the copied CRT face,
  and saved JSON voice profiles resolve to the target bot's actual voice
  instead of silently falling back to Voice 1. Ambiguous aliases, player
  speech, muted speech, and inaudible speech remain excluded.

- Bumped `Signal` to `v1.27` so Auto requires real interview progress before a
  natural close. Repeat requests and tiny fragments no longer let a low-word
  transcript masquerade as a settled conversation, so the host follows the
  first substantive answer instead of immediately wrapping. Signal Review now
  identifies Producer-guest turns as human-authored rather than unknown model
  traffic. Producer typing pauses persist and replay at half wall duration.

- Bumped `Chat` to `v1.20`, `Zen` to `v1.19`, `Coffee` to `v2.16`, `Signal`
  to `v1.26`, and `Story` to `v0.18` to separate physical presentation
  Powers. Small changes only avatar scale, Microscopic remains fully unseen
  even while speaking, Invisible remains continuously half-translucent, and
  Ghost alone uses the speaking-only reveal. Loud no longer cancels size or
  visibility; Coffee and Signal freeze these states for replay.

- Bumped `Signal` to `v1.25` to restore captions to live sessions without
  bringing the full transcript back on screen. Only the active line appears in
  a compact lower-third after a half-second presentation delay, and it clears
  when that line ends. Audience-hidden or hard-silent turns stay absent. Audio,
  episode pacing, interruption behavior, persistence, and replay remain
  unchanged; replay keeps the complete authoritative transcript.

- Bumped `Signal` to `v1.24` so an always-on interruptive bot guest cuts
  every ordinary bot-host opening and interview turn, including
  producer-directed turns and turns under elevated tension. The cutoff still
  lands at a replay-stable variable point, while human Producer speech,
  departures, boundaries, wraps, closings, hard mute, and speech restrictions
  remain protected. Interrupting Tom's Marketplace Power now carries this
  exact contract instead of relying on a legacy Library snapshot.

- Bumped `Coffee` to `v2.15`, `Signal` to `v1.23`, and `Story` to `v0.17`
  for unconditional interruption Powers. A Power explicitly authored to
  interrupt every eligible bot turn now does so without a random roll or the
  ordinary interruption cooldown, with a replay-stable cutoff distributed
  from early through late in the active utterance. Older Ready copies of
  Interrupting Tom recover the hard rule from “whenever possible.” Direct
  Coffee engagement always creates that opening; otherwise Coffee first makes
  its normal organic cut-in choice, then guarantees the cutoff during the
  active turn. Signal and
  Story adapt the same contract while human Producer speech, departures,
  wraps, closings, and hard speech rules remain protected.

- Bumped `Signal` to `v1.22` so Identity Crisis Ian works as the host. A
  present bot guest's scheduled reply now counts as direct guest-to-host
  address even when the guest naturally omits Ian's name. Producer guests,
  audience-only speech, and unnamed host-to-guest turns remain excluded; the
  replay-safe persona, CRT face, and resolved-voice handoff is unchanged.

- Bumped `Signal` to `v1.21` so random booking and field synthesis give
  reasoning-style OpenAI models enough low-effort completion budget to return
  the requested title and private producer angle. Empty provider replies are
  now reported as unusable model output instead of a false availability
  failure.

- Bumped `Chat` to `v1.22`, `Zen` to `v1.21`, `Coffee` to `v2.19`, `Signal`
  to `v1.30`, and `Story` to `v0.20` for the refined short-term-amnesia
  contract. Each holder receives and understands only the current other-speaker
  message, has no memory of prior turns or their own earlier messages, and
  responds directly to that concrete content as fresh contact. A self-
  introduction is optional only when warranted and cannot become identical
  default copy; long-term memories, summaries, private producer cues, and other
  hidden continuity remain excluded while Coffee and Signal preserve replay-safe
  peer consequences.

- Bumped `Coffee` to `v2.13` and `Signal` to `v1.19` so Identity Crisis Ian
  reliably changes when a bot addresses him naturally, including a name at the
  end or inside a sentence. The copied bot's public persona now becomes Ian's
  primary production identity, the first changed reply is engine-bounded to
  claim that identity and reject the original as an impostor, and the persisted
  event continues to drive the copied face and resolved voice. Generic Power
  cues no longer tell observers that identity theft happened before a real
  event exists.

- Bumped `Chat` to `v1.18`, `Zen` to `v1.17`, `Coffee` to `v2.12`, `Signal`
  to `v1.18`, and `Story` to `v0.15` for the eternal-introduction Power. The
  holder receives no earlier conversational context and every persisted spoken
  turn is engine-bounded to a sincere first introduction. Coffee and Signal
  preserve everyone else's transcript and apply one small replay-safe negative
  social step after each introduction, so peers can become increasingly
  agitated while the holder experiences only the present reaction as confusing
  first contact. Story rewrites each holder scene as an isolated introduction;
  Slate is irrelevant, and planned participant applets remain deferred.

- Bumped `Chat` to `v1.17`, `Zen` to `v1.16`, `Coffee` to `v2.11`, `Signal`
  to `v1.17`, and `Story` to `v0.14` for resolved-theme compound Powers.
  Nocturnal activates the existing Sad contract in Light Mode and Radiant Joy
  in Dark Mode; Diurnal is the exact inverse. Theme changes affect later turns,
  while Coffee and Signal persist the effect branch that actually fired. Chat
  and Zen keep player mood experiential only, Story captures the active branch
  when generating an episode, Slate is irrelevant, and planned applets defer
  runtime support.

- Bumped `Chat` to `v1.16`, `Zen` to `v1.15`, `Coffee` to `v2.10`, `Signal`
  to `v1.16`, and `Story` to `v0.13` for the direct-addresser mood-drain
  contract. Only a bot that completes a turn directly to the ready holder loses
  one bounded mood or motivation step; the player and bystanders are never
  mutable recipients. Coffee and Signal persist explicit events and carry the
  drag into the addresser's subsequent behavior without replacing personality,
  agency, facts, disagreement, or serious stakes. Chat and Zen keep the effect
  experiential, Story adapts through supported scene prompting, and planned
  applets remain deferred.

- Added the addressed-recipient mood-boost contract across every applet policy.
  Chat and Zen express radiant joy through the holder's production persona
  without creating player mood state. Coffee and Signal apply one clamped,
  recipient-scoped lift per completed source turn, persist explicit replay
  events, and feed the saved result into subsequent bot behavior. Story adapts
  the cue through its existing generated-scene contract; Slate is irrelevant,
  and planned applets remain deferred until they own compatible participant
  state. Hard mute always wins because no spoken turn occurred.

- Bumped `Coffee` to `v2.9` and `Signal` to `v1.15` for bounded identity
  mirroring. The latest bot to directly address a ready holder supplies only its
  public persona, normalized face, and resolved voice; the holder keeps its own
  glyph, color, role, Powers, private state, routing, and hard restrictions.
  Coffee and Signal persist and replay the CRT face/voice handoff. The player is
  never a target. Story remains cue-only because its current scene contract has
  speakers but no authoritative bot-to-bot addressee; Chat, Zen, and Slate are
  irrelevant, and planned participant applets must implement the contract
  explicitly before activation.

- Bumped `Chat` to `v1.15`, `Zen` to `v1.14`, `Coffee` to `v2.8`, `Signal`
  to `v1.14`, and `Story` to `v0.12` for bounded current-addressee fandom.
  The ready holder treats the player, live peer, or scene audience they address
  as a personal star and reveals fresh fanlike delight in every reply. The
  pressure remains soft: personality, agency, safety, privacy, and mode rules
  win, and draft, stale, failed, disabled, or absent Powers contribute no cue.

- Bumped `Chat` to `v1.14`, `Zen` to `v1.13`, `Coffee` to `v2.7`, `Signal`
  to `v1.13`, and `Story` to `v0.11` for hard normal-volume speech
  obfuscation. A holder still reasons and responds coherently in private, but
  only deterministic gibberish reaches transcripts, replay, voice, memory, or
  another bot's context. Physical stage actions remain visible; no listener can
  recover the holder's intended words.

- Bumped `Chat` to `v1.13`, `Zen` to `v1.12`, `Coffee` to `v2.6`, `Signal`
  to `v1.12`, and `Story` to `v0.10` so Copycat/Echo bots can originate one
  opening before exact-copy enforcement begins. Interrupting bots now carry
  their target-aware cutoff behavior into every bot-to-bot lane: real live
  cut-ins in Coffee and either Signal cast role, plus replay-stable Story cuts.
  Typed human Chat/Zen speech and the Signal Producer-guest lane remain
  protected from synthetic truncation.

- Bumped `Chat` to `v1.12`, `Zen` to `v1.11`, `Coffee` to `v2.5`, `Signal`
  to `v1.11`, and `Story` to `v0.9` for the global five-choice voice control.
  English always uses the bot's local identity; Premium uses its stable
  ElevenLabs identity and falls back locally. Live and replay switches begin
  with the next utterance without cutting off speech already playing.

- Bumped `Chat` to `v1.11`, `Zen` to `v1.10`, `Coffee` to `v2.4`, `Signal`
  to `v1.10`, and `Story` to `v0.8` for reusable loud/quiet voice presence.
  Loud lines receive a fixed 1.18x playback trim and 1.12x text scale, annoy
  present bots after audible speech, and override small, Microscopic, and
  speaking-only invisibility. Quiet lines receive a fixed 0.72x playback trim
  and 0.88x text scale; a stable half of eligible turns are treated exactly like
  mute, with one small holder-mood loss each time the bot goes unheard. Coffee
  and Signal freeze these outcomes and presentation rules for replay. Story
  adapts an ignored turn into a silent, visibly deflated beat.

- Bumped `Chat` to `v1.10`, `Zen` to `v1.9`, `Coffee` to `v2.3`, `Signal`
  to `v1.9`, and `Story` to `v0.7` for bounded physical-size Powers. Ready
  larger or giant holders render 12% larger; small, tiny, or microscopic holders
  render 14% smaller without changing layout. `Microscopic` also carries the
  speaking-only invisibility contract. Coffee freezes the size in its session
  plan, Signal freezes it in the episode snapshot, and replay preserves both.

- Bumped `Signal` to `v1.8` so a Copycat/Echo host owns exactly one
  persona-shaped dashboard variation of “I always have an original thing to
  say.” Signal repeats that same line forever instead of rotating a batch, and
  safely repairs older multi-blurb shows to the canonical joke until the player
  refreshes the host's wording.

- Bumped `Signal` to `v1.7` so a Producer cut stops the current turn, catches the
  host briefly off guard, and still gives them one short, tactful on-air sign-off
  before the saved outro. Echo-bound hosts now remain exact mirrors while a bot
  guest carries the opening and closing. A reusable interruption effect can cut
  eligible bot guest speech while human Producer answers, boundaries, departures,
  wraps, closings, and hard speech rules stay protected; transcript, voice, and
  replay retain only what the audience heard.

- Bumped `Signal` to `v1.6` for one studio-specific generated room-and-Foley
  backing loop per show, with the colliding static bed and shared random backing
  Foley removed. Refreshing a studio refreshes its cohesive atmosphere Online,
  while synchronized tactile Foley remains separate. Off-air host chat now labels
  archive recency explicitly so “the last guest” means the newest episode and
  “the guest before that” means the episode immediately before it.

- Bumped `Signal` to `v1.5` for one audience-truth projection across the live
  stage, captions, voice, replay, and Audience Pulse. Hard visibility and
  speech-audience Powers now redact imperceptible turns before they leave the
  server, and persona reviews consume a reusable immutable review artifact
  instead of raw episode state.

- Bumped `Signal` to `v1.4` to keep persona canon from becoming shared episode
  history. Signal now tells speakers that lore may shape their beliefs and voice
  without turning the anthology into an ongoing relationship, and replaces clear
  claims of prior investigations, confrontations, or secret knowledge before they
  reach the saved transcript or replay audio.

- Bumped `Chat` to `v1.9`, `Zen` to `v1.8`, `Coffee` to `v2.2`, `Signal` to
  `v1.3`, and `Story` to `v0.6` for reusable response-budget Powers. Plain-language
  traits such as "never elaborates" and "says the bare minimum" compile into a
  structured budget: hard minimal and brief modes are bounded by the engine,
  while expansive behavior remains model-guided to avoid forced filler. Coffee,
  Signal, and Story preserve required table, show, and scene beats. Avatar Studio
  now distinguishes structured runtime effects from model guidance.

- Bumped `Signal` to `v1.2` for personality-shaped Power encounters. Hosts and
  guests react only to consequences they can actually observe, with curiosity,
  irritation, caution, empathy, amusement, skepticism, fascination, or no overt
  response chosen through their own persona. The first clear consequence can
  land; repeated effects evolve or normalize, while imperceptible causes stay
  hidden and deterministic Power rules remain unchanged.

- Bumped `Chat` to `v1.8`, `Zen` to `v1.7`, `Coffee` to `v2.1`, and `Signal`
  to `v1.1` for ghostly Ready Powers: a holder is invisible while idle, fades
  in only to speak, and gives present non-player bots a strong, agency-preserving
  terror cue. Story carries the same semantic cue as prose rather than inventing
  a live-avatar visual.

- Bumped `Chat` to `v1.7`, `Zen` to `v1.6`, `Coffee` to `v2.0`, `Signal` to
  `v1.0`, and `Story` to `v0.5` for the trust-based candor Power. A holder's
  relevant direct question or honesty invitation can make the targeted bot's
  next response more candid without compelling the player, inventing knowledge,
  exposing private instructions, or overriding character, safety, and privacy
  boundaries. Signal freezes Powers with the episode; Coffee uses its frozen
  session plan; Story adapts the rule during scene generation.

- The same applet-version pass adds the hard-of-hearing Power contract. In an
  uninterrupted bot-to-bot exchange, a recognized request such as “What did you
  say?” makes the prior speaker repeat its saved line exactly. Coffee applies
  one stacking social-mood loss to that speaker per repeat and persists it in
  replay state; Signal saves a one-rung delivery-mood drop with every repeated
  utterance. Chat, Zen, and Story receive persona cues only because they do not
  own the same live bot-to-bot mood state. Direct player or producer direction,
  closing safety, and mute take precedence, and planned conversational applets
  must choose a compatible mood model before activation.

- Bumped `Chat` to `v1.6`, `Zen` to `v1.5`, `Coffee` to `v1.9`, `Signal` to
  `v0.9`, and `Story` to `v0.4` for cross-mode hard response Powers. Muted bots
  may act but only display `...`; echo-bound bots repeat the latest directly
  addressed speech exactly and add nothing. Signal never leaks private producer
  direction into an echo, while Story deterministically echoes the prior visible
  scene. Planned bot modes must enforce both contracts before activation.

### 2026-07-18

- Bumped `Coffee` to `v1.8` for its adaptive GPU-backed living table
  atmosphere with automatic capability tuning and reduced-motion safety.
- Bumped `Signal` to `v0.8` for the full studio soundcheck and placement
  workspace, persistent cast and ambience controls, audience-only Powers, and
  listener review history.
- Bumped `Slate` to preview `v0.7` for source-specific project starts,
  generated title and cover choices, and the movable ephemeral Markdown
  companion with a three-message recovery buffer.

### 2026-07-17

- Bumped `Chat` to `v1.5`, `Zen` to `v1.4`, `Coffee` to `v1.7`, `Signal` to
  `v0.7`, and `Story` to `v0.3` for the shared deterministic pre-speech breath
  layer across substantial voiced bot lines and replay.
- Bumped `Signal` to `v0.6` and `Coffee` to `v1.6` for the shared quiet foley
  layer, cup-synchronized Coffee sounds, bundled Signal studio room tone, and
  one-click ElevenLabs ident plus custom ambience generation. Coffee also
  exposes the intentionally inactive Jazz atmosphere control for its next pass.
- Bumped `Chat` to `v1.4`, `Zen` to `v1.3`, and `Story` to `v0.2` for the
  unified PRISM menu system, refined CRT face glyphs, and shared voice and
  avatar behavior.
- Bumped `Coffee` to `v1.5` for local-model warmup intermissions that pause the
  real table clock, hold visual activity, and reveal buffered lines only after
  the room resumes.
- Bumped `Signal` to `v0.5` for persisted local-model studio holds and the
  episode-aware Audience Pulse with deterministic views, ratings, and reviews.
- Bumped `Slate` to preview `v0.6` for unified, accessible project actions.

### 2026-07-16

- Bumped `Slate` to preview `v0.5` for long-form focused sections, private
  Continuity concerns and reconciliation, grounded return sessions, portable
  recovery archives, and clean DOCX/Markdown/text export.
- Bumped `Signal` to `v0.4` for its skippable show-branded pre-roll, locally
  synthesized intro ident, optional cached ElevenLabs music, and background
  opening-turn preparation.
- Bumped `Chat` to `v1.3` and `Zen` to `v1.2` for per-bot online voice
  identity, pronunciation, saved performance controls, and reliable previews.
- Bumped `Coffee` to `v1.4` for synchronized online speech, canonical arrivals,
  replay, refills, Auto routing, and responsive table presentation.
- Bumped `Signal` to `v0.3` for source-linked show identity, scoped artwork
  regeneration, production progress, and immersive ElevenLabs reactions.
- Bumped `Slate` to preview `v0.4` for refined navigation, themes, settings,
  and production-workspace polish.

### 2026-07-15

- Bumped `Slate` to preview `v0.3` with shared PRISM wordmark and utility
  navigation plus branded light/dark workspace treatments.
- Bumped `Slate` to preview `v0.2` with optional `{WILDCARD}` project sparks,
  preview/reroll controls, and persisted source-template provenance.
- Promoted `Slate` to preview `v0.1` for persistent prose projects, generated
  structure, scoped drafting, direct autosaved edits, locks, and explicit
  revision previews with accept/reject version safety.
- Added `Signal v0.2`, the bot-owned interview-show applet with editable host-shaped
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
