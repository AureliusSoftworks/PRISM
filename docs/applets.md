# Prism Applets

Prism applets are experience modules: Chat, Zen, Coffee, Signal, Slate, and
future mode surfaces. Their versions track felt product behavior, not internal
implementation churn.

Applet versions are independent from the Prism app release version. Prism can
ship as `0.5.2` while Coffee is `v0.7`.

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
| Chat | v1.25 | Active | Full playground with direct human access to a companion and half-translucent targeted-Invisible presentation. |
| Zen | v1.24 | Active | Calm one-to-one continuity with direct human access to a companion and half-translucent targeted-Invisible presentation. |
| Coffee | v2.24 | Active | Multi-bot tables with frozen pairwise sight and hearing, allowed-minus-excluded targeting, hidden spectral turns, cast-dependent live reveal, full spectral replay, and deterministic Power-driven overlap. |
| Signal | v1.45 | Active | Bot-owned interviews with pairwise cast perception, allowed-minus-excluded targeting, unrestricted spectral booking, full spectral replay, dual captions, spatial overlap audio, and audience-projected reviews. |
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
2. Explicit immutable source imports with selective, provenance-aware
   incorporation into Slate.

Slate remains the editorial "turn this into something good" workspace. Imports
never silently synchronize or rewrite source content.
See [Slate V1 Product and UX Contract](./slate-v1-product-ux-contract.md).
The phased Continuity, Review Circle, Atmosphere, safety, export, and publishing
contracts are indexed in [Slate Master Plan](./slate-master-plan.md).
All current and future persona-review systems should follow the shared
[Review Artifacts](./review-artifacts.md) boundary.

Slate stayed planned `v0.0` until its first functional vertical slice became
usable end to end. It entered preview at `v0.1` and is now `v0.7`; later snapshot
stages do not block the standalone preview.

## Spectral perception policy

- Participant truth is pairwise: each bot receives only the bodies, actions,
  and speech its frozen Power matrix allows.
- Live observer truth is cast-dependent. A matching bot such as Light can
  reveal a targeted-Invisible participant half-translucently and audibly; the
  player never counts as that matching bot.
- Replay truth restores a spectral participant half-translucently and audibly
  without retroactively informing unaware participants. Mute, fully hidden or
  Microscopic presentation, canonical silence, and speech obfuscation retain
  precedence. Ordinary private channels remain private in replay.
- Signal and Coffee enforce this directly. Chat and Zen preserve direct human
  access to the selected companion. Slate has no participant-observer contract,
  so the policy is irrelevant there. Arena, Polling, Feed, Games, Gym, Pseudo,
  Surf, and other unimplemented applets remain deferred until they define both
  perspectives.

## Changelog

### 2026-07-21

- Bumped `Chat` to `v1.25`, `Zen` to `v1.24`, `Coffee` to `v2.24`, and `Signal`
  to `v1.45` for holder-scoped persistent public
  designations. Ready Powers compose one bounded prefix or suffix into
  participant-facing identity without changing the saved bot name; Signal
  openings treat public episode titles as editorial labels rather than a line
  to repeat.

- Bumped `Signal` to `v1.44` so an Identity Crisis host restores its authored
  default persona, CRT face, Avatar Details ink, and voice before the closing
  sign-off. The saved reset keeps live playback and replay in sync.

- Bumped `Coffee` to `v2.23` and `Signal` to `v1.43`
  for prompt-authored compound Powers. Sight and hearing can now each allow a
  cast and exclude exceptions, with exclusion winning and legacy audience
  projections recomputed as allowed-minus-excluded. Avatar Studio authors one
  plain-language prompt, then presents the compiled outcome as an editable,
  rerollable sigil artifact.

- Bumped `Coffee` to `v2.22` and `Signal` to `v1.42` so Identity Crisis
  copies the directly addressing bot's authored Avatar Details ink together
  with its public persona, CRT face, and voice. Live play and replay share the
  persisted handoff, while legacy recordings keep their original presentation.

- Bumped `Signal` to `v1.41` for an on-air broadcast texture and dependable
  Studio lighting. Fine high-contrast TV noise and scanlines replace the old
  brightness-like film layer, full strength is the new-show default, and every
  generated Studio now finishes by rebuilding and installing its local ambient
  receiver map automatically.

- Bumped `Chat` to `v1.24`, `Zen` to `v1.23`, `Coffee` to `v2.21`, and `Signal`
  to `v1.40` for shared spectral perception. Targeted
  Invisible Powers now separate bot knowledge from live observer projection
  and replay truth. Signal and Coffee persist complete hidden turns and stable
  overlapping handoffs; replay restores half-translucent bodies, captions, and
  independently stoppable voice channels.

- Bumped `Signal` to `v1.39` for show-scoped film grain across the composited
  studio screen. Align stage now previews and saves its strength from zero to
  full texture; live and replay share the setting, while audio static stays off.

- Bumped `Signal` to `v1.38` so a live broadcast hides the show library and
  Create show controls, letting the studio use the full window. The management
  sidebar returns automatically when the broadcast ends.

- Bumped `Signal` to `v1.37` for longer, more robust host-specific opening
  idents and paired closing outdents. Local and cached ElevenLabs audio now share
  one stable musical fingerprint, and the outdent replaces the generic episode
  exit sound without generating anything at show time.

- Bumped `Signal` to `v1.36` for a producer-operated live soundboard in bot
  interviews. Applause, laughter, gasp, and rimshot reactions are bundled for
  local playback, recorded at their audience-heard timing, included in the
  audience review artifact, and restored during replay. The Producer-guest lane
  keeps its answer composer and does not expose the board.

- Bumped `Signal` to `v1.34` so Cut show lets the current speaker finish,
  cancels any unspoken next turn, and moves directly into one concise natural
  sign-off. Cut recordings are always retained, live episodes cannot be
  deleted, and Delete episode now sits beside Copy for Signal Review only on
  completed end and replay surfaces.

- Bumped `Signal` to `v1.33` and removed its generated dead-air asides. While
  the next bot prepares, the studio now stays quiet instead of making the
  other bot voice canned commentary or apparent private thoughts. Coffee's
  separate table-side aside behavior remains unchanged.

- Bumped `Signal` to `v1.32` so the live and replay studio centers the cast
  beneath the show logo as `with [host]` and `featuring [guest]`. The separate
  host and guest nameplates have been removed from the set.

- Bumped `Signal` to `v1.31` so Premium's conversational cadence is the shared
  episode clock for Mute, English, Premium, Babble, Bottish, and replay. Silent
  audio now reveals at the same measured baseline instead of a separate fast
  text clock, while a Power-silenced `...` holds one complete studio beat.

- Bumped `Chat` to `v1.21`, `Zen` to `v1.20`, `Coffee` to `v2.18`, and `Signal`
  to `v1.29` so Lazy Cameron's legacy `Lazy` Power
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

- Bumped `Chat` to `v1.20`, `Zen` to `v1.19`, `Coffee` to `v2.16`, and `Signal`
  to `v1.26` to separate physical presentation
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

- Bumped `Coffee` to `v2.15` and `Signal` to `v1.23`
  for unconditional interruption Powers. A Power explicitly authored to
  interrupt every eligible bot turn now does so without a random roll or the
  ordinary interruption cooldown, with a replay-stable cutoff distributed
  from early through late in the active utterance. Older Ready copies of
  Interrupting Tom recover the hard rule from “whenever possible.” Direct
  Coffee engagement always creates that opening; otherwise Coffee first makes
  its normal organic cut-in choice, then guarantees the cutoff during the
  active turn. Signal applies the same contract while human Producer speech, departures,
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

- Bumped `Chat` to `v1.23`, `Zen` to `v1.22`, `Coffee` to `v2.20`, and `Signal`
  to `v1.35` so short-term-amnesia holders no
  longer receive a standing conversation, table, episode, or story topic.
  Their hard context remains the current other-speaker message plus immutable
  persona, safety, and mode-role instructions; a topic becomes available only
  when that current message states it. Coffee kickoff no longer leaks its saved
  topic, and Signal no longer supplies episode-topic metadata to the holder.

- Bumped `Chat` to `v1.22`, `Zen` to `v1.21`, `Coffee` to `v2.19`, and `Signal`
  to `v1.30` for the refined short-term-amnesia
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

- Bumped `Chat` to `v1.18`, `Zen` to `v1.17`, `Coffee` to `v2.12`, and `Signal`
  to `v1.18` for the eternal-introduction Power. The
  holder receives no earlier conversational context and every persisted spoken
  turn is engine-bounded to a sincere first introduction. Coffee and Signal
  preserve everyone else's transcript and apply one small replay-safe negative
  social step after each introduction, so peers can become increasingly
  agitated while the holder experiences only the present reaction as confusing
  first contact. Slate is irrelevant, and planned participant applets remain
  deferred.

- Bumped `Chat` to `v1.17`, `Zen` to `v1.16`, `Coffee` to `v2.11`, and `Signal`
  to `v1.17` for resolved-theme compound Powers.
  Nocturnal activates the existing Sad contract in Light Mode and Radiant Joy
  in Dark Mode; Diurnal is the exact inverse. Theme changes affect later turns,
  while Coffee and Signal persist the effect branch that actually fired. Chat
  and Zen keep player mood experiential only, Slate is irrelevant, and planned
  applets defer runtime support.

- Bumped `Chat` to `v1.16`, `Zen` to `v1.15`, `Coffee` to `v2.10`, and `Signal`
  to `v1.16` for the direct-addresser mood-drain
  contract. Only a bot that completes a turn directly to the ready holder loses
  one bounded mood or motivation step; the player and bystanders are never
  mutable recipients. Coffee and Signal persist explicit events and carry the
  drag into the addresser's subsequent behavior without replacing personality,
  agency, facts, disagreement, or serious stakes. Chat and Zen keep the effect
  experiential, and planned applets remain deferred.

- Added the addressed-recipient mood-boost contract across every applet policy.
  Chat and Zen express radiant joy through the holder's production persona
  without creating player mood state. Coffee and Signal apply one clamped,
  recipient-scoped lift per completed source turn, persist explicit replay
  events, and feed the saved result into subsequent bot behavior. Slate is
  irrelevant, and planned applets remain deferred until they own compatible
  participant state. Hard mute always wins because no spoken turn occurred.

- Bumped `Coffee` to `v2.9` and `Signal` to `v1.15` for bounded identity
  mirroring. The latest bot to directly address a ready holder supplies only its
  public persona, normalized face, and resolved voice; the holder keeps its own
  glyph, color, role, Powers, private state, routing, and hard restrictions.
  Coffee and Signal persist and replay the CRT face/voice handoff. The player is
  never a target. Chat, Zen, and Slate are irrelevant, and planned participant
  applets must implement the contract explicitly before activation.

- Bumped `Chat` to `v1.15`, `Zen` to `v1.14`, `Coffee` to `v2.8`, and `Signal`
  to `v1.14` for bounded current-addressee fandom.
  The ready holder treats the player, live peer, or scene audience they address
  as a personal star and reveals fresh fanlike delight in every reply. The
  pressure remains soft: personality, agency, safety, privacy, and mode rules
  win, and draft, stale, failed, disabled, or absent Powers contribute no cue.

- Bumped `Chat` to `v1.14`, `Zen` to `v1.13`, `Coffee` to `v2.7`, and `Signal`
  to `v1.13` for hard normal-volume speech
  obfuscation. A holder still reasons and responds coherently in private, but
  only deterministic gibberish reaches transcripts, replay, voice, memory, or
  another bot's context. Physical stage actions remain visible; no listener can
  recover the holder's intended words.

- Bumped `Chat` to `v1.13`, `Zen` to `v1.12`, `Coffee` to `v2.6`, and `Signal`
  to `v1.12` so Copycat/Echo bots can originate one
  opening before exact-copy enforcement begins. Interrupting bots now carry
  their target-aware cutoff behavior into every bot-to-bot lane: real live
  cut-ins in Coffee and either Signal cast role.
  Typed human Chat/Zen speech and the Signal Producer-guest lane remain
  protected from synthetic truncation.

- Bumped `Chat` to `v1.12`, `Zen` to `v1.11`, `Coffee` to `v2.5`, and `Signal`
  to `v1.11` for the global five-choice voice control.
  English always uses the bot's local identity; Premium uses its stable
  ElevenLabs identity and falls back locally. Live and replay switches begin
  with the next utterance without cutting off speech already playing.

- Bumped `Chat` to `v1.11`, `Zen` to `v1.10`, `Coffee` to `v2.4`, and `Signal`
  to `v1.10` for reusable loud/quiet voice presence.
  Loud lines receive a fixed 1.18x playback trim and 1.12x text scale, annoy
  present bots after audible speech, and override small, Microscopic, and
  speaking-only invisibility. Quiet lines receive a fixed 0.72x playback trim
  and 0.88x text scale; a stable half of eligible turns are treated exactly like
  mute, with one small holder-mood loss each time the bot goes unheard. Coffee
  and Signal freeze these outcomes and presentation rules for replay.

- Bumped `Chat` to `v1.10`, `Zen` to `v1.9`, `Coffee` to `v2.3`, and `Signal`
  to `v1.9` for bounded physical-size Powers. Ready
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

- Bumped `Chat` to `v1.9`, `Zen` to `v1.8`, `Coffee` to `v2.2`, and `Signal` to
  `v1.3` for reusable response-budget Powers. Plain-language
  traits such as "never elaborates" and "says the bare minimum" compile into a
  structured budget: hard minimal and brief modes are bounded by the engine,
  while expansive behavior remains model-guided to avoid forced filler. Coffee
  and Signal preserve required table and show beats. Avatar Studio
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
  terror cue.

- Bumped `Chat` to `v1.7`, `Zen` to `v1.6`, `Coffee` to `v2.0`, and `Signal` to
  `v1.0` for the trust-based candor Power. A holder's
  relevant direct question or honesty invitation can make the targeted bot's
  next response more candid without compelling the player, inventing knowledge,
  exposing private instructions, or overriding character, safety, and privacy
  boundaries. Signal freezes Powers with the episode; Coffee uses its frozen
  session plan.

- The same applet-version pass adds the hard-of-hearing Power contract. In an
  uninterrupted bot-to-bot exchange, a recognized request such as “What did you
  say?” makes the prior speaker repeat its saved line exactly. Coffee applies
  one stacking social-mood loss to that speaker per repeat and persists it in
  replay state; Signal saves a one-rung delivery-mood drop with every repeated
  utterance. Chat and Zen receive persona cues only because they do not
  own the same live bot-to-bot mood state. Direct player or producer direction,
  closing safety, and mute take precedence, and planned conversational applets
  must choose a compatible mood model before activation.

- Bumped `Chat` to `v1.6`, `Zen` to `v1.5`, `Coffee` to `v1.9`, and `Signal` to
  `v0.9` for cross-mode hard response Powers. Muted bots
  may act but only display `...`; echo-bound bots repeat the latest directly
  addressed speech exactly and add nothing. Signal never leaks private producer
  direction into an echo. Planned bot modes must enforce both contracts before
  activation.

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

- Bumped `Chat` to `v1.5`, `Zen` to `v1.4`, `Coffee` to `v1.7`, and `Signal` to
  `v0.7` for the shared deterministic pre-speech breath
  layer across substantial voiced bot lines and replay.
- Bumped `Signal` to `v0.6` and `Coffee` to `v1.6` for the shared quiet foley
  layer, cup-synchronized Coffee sounds, bundled Signal studio room tone, and
  one-click ElevenLabs ident plus custom ambience generation. Coffee also
  exposes the intentionally inactive Jazz atmosphere control for its next pass.
- Bumped `Chat` to `v1.4` and `Zen` to `v1.3` for the
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
- `v0.0` applets - Planned concepts without a shipped applet surface yet.
