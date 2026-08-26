# Prism Applets

Applet versions are the provenance catalog for versioned interactive modules.
They no longer define PRISM's product navigation. The living shell classifies
public surfaces as **Home**, **Experiences**, **Studios**, or **Tools**; see
[Living Shell Architecture](./living-shell-architecture.md).

Chat and Zen now belong to Home; Coffee, Debate, and Signal are Experiences;
and Slate is a Studio. Their applet versions continue to track felt product
behavior, not internal implementation churn.

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

## Current Versioned Modules

| Applet  | Version | Status             | Notes                                                                                                                                                                                                                                                                                                       |
| ------- | ------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat    | v1.48   | Active             | Full playground with independent saved conversations, Troll persona cues, timed unaware Mute delivery, Accent Map-keyed Mumbling dialects, six-tier size presentation, complete session-sticky Shapeshifter embodiment, Surname Drift last names, and phosphor-hue prejudice inside each PRISM or persona Home.                                                                                         |
| Zen     | v1.47   | Active             | Calm one-to-one continuity with bounded player-facing Troll pestering, timed unaware Mute delivery, Accent Map-keyed Mumbling dialects, draggable six-tier embodiment, direct human access, complete session-sticky Shapeshifter embodiment, Surname Drift last names, and phosphor-hue prejudice.                                                                                                        |
| Coffee  | v2.69   | Active             | Two-to-five-bot tables with bounded Troll interruptions and public bait, cast-aware avatar effects, Power-projected reaction speech, timed Mute reactions and floor breaks, replay-safe Identity Crisis eye/mouth/Ink/glyph overlays with holder-stable identity and Powers, full-form Shapeshifter copying, session last names, replay-safe form changes, phosphor-hue prejudice among seated bots, local-only café Jazz beds, and faithful replay that seats Default Prism for the player.                   |
| Signal  | v1.88   | Active             | Interview studio with bounded Troll interruptions and public bait, ready-but-paused spectator buffering, audible-clock mouth animation, a paint-contained live stage, premium host-and-premise show identities with cohesive character, concept, and broadcast cues, performance-colored audience ratings, quiet replay-provenanced listener backchannels, private-safe Mumbling interruptions and reaction speech, visibly elapsed timed Mute performances with guaranteed awkward-duration reactions and hard cuts, replay-safe Identity Crisis eye/mouth/Ink/glyph overlays with holder-stable identity and Powers, full-form Shapeshifter copying, session last names, replay-safe form changes, exact on-air producer quotes, Power-permissive encounters, and phosphor-hue prejudice between host and guest. |
| Debate  | v0.52   | Preview            | Power-permissive Forum and Turnabout proceedings with direct bounded Troll floor cuts, cast-aware avatar effects, Accent Map-keyed Mumbling speech and reaction quips, timed Mute floor timing, frozen public sources, four-field Identity Crisis presentation and full-form Shapeshifter voice copying, session last names, screen-off form changes, phosphor-hue prejudice among advocates, explicit advocacy consent, organic cast reactions, durable verdicts, returning title-card start-from-turn checkpoints, and a Spectator live For/Against favor bar from the heard record. Whodunnit V2 makes the player the prosecutor: a durable spoiler-safe Case Forge compiles and validates finite Move / Examine / Talk / Present investigation, statement-level Press / Present court chapters for every suspect, Jury or Bench verdicts, witness checkpoints, PRISM courtroom callouts, and a complete local English audio pack before the title card. It replays Identity Crisis eyes, complete mouth, Ink, and glyph from the frozen Power plan and sealed direct-address history while retaining every other holder field. Premium Whodunnit voices remain disabled and gameplay performs no live LLM or voice synthesis. Legacy V1 sessions and Case Seeds remain playable. Territory / Your idea accepts Prompt Center prompts and wildcard decks. |
| Polling | v0.0    | Planned            | AI-powered polling across bot groups.                                                                                                                                                                                                                                                                       |
| Feed    | v0.0    | Planned            | BotBook-style social feed.                                                                                                                                                                                                                                                                                  |
| Games   | v0.0    | Planned            | Boardgame-like bot matches.                                                                                                                                                                                                                                                                                 |
| Story   | v0.41   | Planned (disabled) | Early implementation retains an adapted bounded Troll interruption seam alongside private-intention/public-timed-silence Mute and Accent Map-keyed Mumbling contracts, plus phosphor-hue prejudice among cast colors, but remains excluded from release navigation and session restoration.                                                                                                                         |
| Gym     | v0.0    | Planned            | Bot training and memory-development surface.                                                                                                                                                                                                                                                                |
| Slate   | v0.9    | Preview            | Manuscript-first Writer's Cockpit with rich focused editing, durable AI proposals, in-canvas Continuity clarification, a curated Story Bible, safe section review exports, and private recovery.                                                                                                            |
| Pseudo  | v0.0    | Planned            | Sketch/system space for almost-code.                                                                                                                                                                                                                                                                        |
| Surf    | v0.0    | Planned            | Simple browsing plus optional bot screen viewing.                                                                                                                                                                                                                                                           |

Debate's release boundary and platform QA gaps are recorded in
[Debate v0.1 Preview verification](./debate-v0.1-verification.md).

## Timed unaware Mute policy

- A Mute holder authors ordinary substantive speech and privately remembers it
  as delivered. Legacy Ready Mute snapshots receive this current runtime cue
  without a database migration.
- Non-exempt audiences receive one period per quantized second, starting with
  `.` immediately, then one environmental elapsed-time cue. Physical actions
  remain visible; voice and mouth motion remain sealed. Existing player speech
  whitelists continue to receive clear speech.
- The public, versioned performance record contains only duration, period
  count, interruption state, elapsed cue, and deterministic reaction beats.
  Intended speech stays holder-private and never enters public APIs, memories,
  exports, another bot's history, or performance reactions.
- Chat and Zen never fabricate player reactions. Coffee, Signal, and Debate
  may add sparse persona-aware listener actions, allowed Foley, or transformed
  quips while long silence is playing. Six- and seven-second pauses remain
  sparse; from eight seconds onward at least one listener beat is guaranteed.
  These beats are replay direction only.
  A genuine floor break truncates the public dots and privately preserves only
  the holder's intended prefix plus interruption context.
- Signal uses instant reaction cuts with at least a 2.5-second hold and returns
  to the muted speaker between beats when time remains. Camera animation is
  reserved for pre-performance generation/loading. Story retains the same
  private/public history contract for future activation. Slate is irrelevant;
  all other planned bot applets must implement it before activation.

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
usable end to end. It entered preview at `v0.1` and is now `v0.8`; later snapshot
stages do not block the standalone preview.

## Spectral perception policy

- Participant truth is pairwise: each bot receives only the bodies, actions,
  and speech its frozen Power matrix allows.
- Invisible and Microscopic bodies remain fully hidden in live and replay,
  including attached lights, coffee, and steam. Nameplates, attribution,
  captions, and otherwise-audible speech remain available to the player.
- Replay preserves the same body visibility while retaining complete player
  captions and voice. Participant-only speech restrictions remain private and
  never become knowledge merely because replay can present the attributed line.
- Signal, Coffee, and Debate enforce this directly. Chat and Zen preserve
  direct human access to the selected companion. Slate has no
  participant-observer contract, so the policy is irrelevant there. Polling,
  Feed, Games, Gym, Pseudo, Surf, and other unimplemented applets remain
  deferred until they define both perspectives.

## Power immunity policy

- A ready `Observant` or `Perceptive` Power removes every other bot's Power
  layer only from its holder's perception and behavior. The holder sees, hears,
  understands, identifies, and responds to each bot's ordinary baseline.
- The holder never notices, names, explains, or contrasts the ignored Power.
  The player and all other bots retain their normal live and replay projections.
- Two immune holders therefore meet as ordinary bots. Chat, Zen, Coffee,
  Signal, and Debate support this directly; Story adapts it during generation.
  Slate is irrelevant, and unimplemented applets remain deferred.

## Inept Power policy

- A ready `Inept` Power continuously prevents its holder from competently
  following instructions or fulfilling a bot-owned production role. Every
  contribution must visibly mishandle at least one central requirement rather
  than merely claiming to be incompetent.
- Coffee adapts the failure to table participation; Debate adapts it separately
  for advocates, moderators, and jurors; Signal adapts it for hosts and guests;
  Story adapts it inside generated scenes. Chat and Zen replace the model-facing
  current request with a deterministic mistaken assignment while preserving the
  player's canonical message unchanged. Production modes inject a role-shaped
  wrong assignment after their ordinary prompt so weak local models cannot
  silently restore competent performance.
- Any image sent by the bot is hard-routed to a wholly unrelated safe scene.
  The requested subject is not sent to the image model, and every recovery
  attempt remains unrelated. Player-authored Images and applet-owned artwork
  are unaffected.
- Safety, privacy, stable identity, explicit player controls, valid product
  state and output schemas, and harder speech effects remain authoritative.
  Slate has no bot-owned performance role, and unimplemented applets remain
  deferred.

## Mumbling Power policy

- A ready speech-obfuscation Power keeps ordinary clear intended speech in the
  holder's private history while every public speech lane receives deterministic
  normal-volume gibberish. Spoken listener acknowledgements, crosstalk leads,
  interrupted-speaker retorts, and timed-Mute reaction quips use the same
  projection; physical actions and nonverbal vocal Foley remain intact.
- An explicitly saved Accent Map pin selects the consonant and vowel family and
  seeds replay-stable variation. Moving the pin changes the holder's gibberish
  dialect without adding persona-specific rules. Legacy bots without a saved
  pin retain their historical gibberish.
- Signal never lets the holder-private clear cutoff replace a public interrupted
  line or reclaim fragment. Coffee and Signal persist only projected reaction
  text for replay, review, caption, and voice authorization.

## Ad Hominem and Cursed Tongue Power policy

- A ready `Ad Hominem` Power shapes the primary generation around the current
  addressee. The reply fulfills its actual purpose through one fresh direct
  insult; it does not default to debate or attach a generic jab to an otherwise
  normal answer. Echo, summary, thanks, agreement, help, factual, tool, and
  safety requests keep their substance. Insults may target only conduct,
  competence, reasoning, choices, or ego—never protected traits, family, grief,
  trauma, private facts, or slurs. A deterministic final-line guard enforces a
  bounded addressee-specific insult if the primary generation misses.
- A ready `Cursed Tongue` Power preserves the holder's clean draft, then applies
  a seeded deterministic local public transform with varied sentence and verb
  cadence. It does not call a provider. Every non-silent ordinary spoken
  utterance gains strong uncensored non-slur profanity, with no fewer than one
  and no more than four curse tokens in each curseable spoken sentence; actual
  silence remains authoritative, and a response made entirely from protected
  records stays byte-for-byte intact.
- Code, URLs, citations, evidence markers, bot links, stage directions, and
  structured records are protected byte-for-byte. The player, voice playback,
  every other bot, memory, replay, and public export receive only the adjusted
  speech. The holder alone may receive its clean intended wording as private
  self-history so it never learns to imitate the mutation; Power immunity does
  not expose that clean original to another bot.
- Ad Hominem composes first and Cursed Tongue transforms that clean intended
  reply second, so the ordinary stacked path uses one model generation. Chat,
  Zen, Coffee, and Signal apply the public transform directly. Debate
  adapts it around evidence-bearing formal records, and the retained Story seam
  adapts it to authored speaker scenes. Slate is irrelevant. Polling, Feed,
  Games, Gym, Pseudo, Surf, and other planned applets remain deferred until
  they own a participant speech surface.

## Hue prejudice Power policy

- A ready hue-prejudice Power is soft social pressure about **phosphor /
  avatar color**, never people, ethnicity, or the player. Authoring may use
  the Power name **Racist**; runtime cues still talk only about bot color.
- Named love or hate binds to that hue within ±30°. If no color is specified,
  including a bare Racist prompt, the target is the complementary hue of the
  holder's saved identity color. Achromatic holders leave complementary bias
  dormant. Color-cycle Powers stay on their own effect and never compile as
  this one.
- Chat and Zen keep the pressure in the holder's persona. Coffee, Signal,
  Debate, and Story name present matching bots. Coffee also applies one
  bounded, replay-safe mood lift or drop to addressed color-matched peers
  using the existing mood events. Slate is irrelevant. Planned applets remain
  deferred until they own a participant surface.

## Identity Crisis Power policy

- Coffee and Signal apply the direct runtime contract; Debate applies the same
  four-field visual overlay through its frozen participant
  snapshots. Story retains the cue seam while disabled. Chat and Zen have no
  bot-to-bot addresser, Slate has no participant identity-theft surface, and
  every other planned applet is deferred in the exhaustive mode policy.
- A genuinely new bot addresser replaces the visual target. The holder borrows
  exactly the target's eyes and blink package, complete resting/live mouth and
  viseme package, authored Avatar Details Ink, and lower glyph.
- Name, persona, dialogue behavior, complete voice and Accent Map, color,
  chassis/frame, thinking spinner, Powers and consequences, memories, bot ID,
  role/seat, safety, privacy, provider, perception, and attribution remain the
  holder's. Identity Crisis never rewrites generated text or observer behavior.
  Shapeshifter remains the full-form mechanic. The player is never a target.

## Troll Power policy

- A Ready Troll may attempt every eligible interruption of another bot,
  irrespective of topic, composure, enlightenment, resistance, or relevance.
  The player is never an interruption target. Zen adapts the soft nuisance
  style to the player inside the current reply; every other mode keeps the
  player outside the social target set. Existing runtime scheduling,
  moderation, privacy, tenancy, LOCAL mode, and completion limits remain
  authoritative.
- Troll output is intentionally irritating but bounded: internet lingo,
  lowercase `i`, occasional misspellings/l33tspeak, literal @mentions, and
  target-aware puns or dad jokes. Coffee and Signal use their existing public
  interruption/pause/replay lanes for short multi-beat presentation; no hidden
  private prompt or unbounded spam is persisted. Other bots keep full agency
  to ignore, object, respond, or retaliate.
- Every enabled Troll is mood-locked to a warm presentation. Global, session,
  pairwise, annoyance, and mode mood updates can still affect other bots, but
  never move the Troll away from that fixed warm baseline.
- From the second assistant turn onward, a shared deterministic turn key may
  select one replay-persisted surprise: a three-percent, at-most-once
  in-fiction lyric ambush; a small local text/emoji meme card; or one exact
  `*fart*`/`*burp*` action. Meme cards never fetch, generate, or spend. Bodily
  actions use the existing corporality Foley path. Exact-copy, muted/silent,
  producer-quote, and protected-record lanes are never decorated. The lyric
  source remains a single bounded payload populated only from user-supplied
  text and is release-blocked pending rights review.
- Ordinary Shh and ordinary new-message sends cannot truncate a Troll's
  current bounded delivery. Chat queues the message, Coffee waits for the
  visible turn, and a human Signal guest keeps their answer drafted. Explicit
  Stop/Escape, audio mute, disabling the Power, leaving/changing mode, app
  shutdown, moderation, and mode-owned safety/lifecycle controls still end or
  suspend presentation.
- Chat composes the bot-oriented lived persona cue without inventing a target.
  Zen adapts it into bounded direct attention grabs, fake-outs, puns, and up to
  three newline-separated beats inside one player-addressed reply; it cannot
  emit autonomous messages or trap the player. Coffee, Signal, and Debate use
  direct bounded interruption mechanics; Story adapts the interruption to its
  scene cuts. Slate is irrelevant. Polling, Feed, Games, Gym, Pseudo, and Surf
  are deferred and the exhaustive applet policy must be updated before any one
  activates.

## Changelog

### 2026-08-26

- Advanced `Coffee` to `v2.69`, `Signal` to `v1.88`, and `Debate` to `v0.52`.
  Identity Crisis is now an exact four-field visual overlay: the latest direct
  bot addresser supplies eyes, the complete resting/live mouth package,
  authored Avatar Details Ink, and the lower glyph. The holder keeps every
  other field, including name, persona, dialogue, voice/Accent Map, color,
  chassis/frame, thinking spinner, and Powers. Live visemes and replay resolve
  through the same copied mouth package.

### 2026-08-24

- Advanced `Debate` to `v0.48`. Whodunnit V2 now plays as a prosecution
  turnabout with finite authored investigation and testimony graphs, free
  mansion navigation, statement-level Press and Present, every suspect on the
  stand, witness checkpoint retries, Jury or Bench outcomes, durable Case Forge
  jobs, and a complete verified local English performance before the title
  card. Premium Whodunnit voices are disabled during core playtesting; legacy
  V1 cases remain available.

- Advanced `Signal` to `v1.85`. Synthesized show logos now build a recognizable
  editorial identity from the host, title, and premise instead of defaulting to
  an abstract app glyph. Compact character shorthand, premise motifs, optional
  integrated broadcast cues, short monograms, and controlled material treatment
  are valid while full scenes, generic podcast clip art, copied insignia, and
  glossy app-icon containers remain excluded.

### 2026-08-22

- Advanced `Chat` to `v1.48`, `Zen` to `v1.47`, `Coffee` to `v2.67`,
  `Signal` to `v1.84`, `Debate` to `v0.47`, and `Story` to `v0.41`. Troll now
  has a shared warm mood lock, ordinary Shh/new-message floor immunity,
  persisted deterministic lyric/meme ambush selection, and sparse exact
  bodily-action cues using bundled corporality Foley. The lyric payload is an
  intentionally empty parent-population seam until the exact user-supplied
  text and release rights review are available.

- Advanced `Coffee` to `v2.66`, `Signal` to `v1.83`, and `Debate` to `v0.46`.
  Identity Crisis now freezes and retains the holder's complete voice profile
  while borrowing the addresser's public identity; Shapeshifter still copies
  voice. The holder uses `impostor` once on the first reveal, cannot recant
  before reset, and the original hard-corrects genuine misaddressing even under
  Credulity without turning every later line into another identity dispute.

- Advanced `Signal` to `v1.81`. When a Copycat host opens the closing by
  reflecting the guest's unanswered question, Signal now keeps the episode
  live for one substantive guest response before the host reflects that answer
  as the final deterministic beat. Producer cuts remain immediate, mutually
  echo-bound casts remain bounded, and faithful replay preserves the complete
  recovered sequence.

- Advanced `Chat` to `v1.47`, `Zen` to `v1.46`, `Coffee` to `v2.64`, `Signal`
  to `v1.80`, `Debate` to `v0.45`, and `Story` to `v0.40`. A Ready `Troll`
  Power freezes a bounded internet-lingo performance style and an unconditional
  all-other-bot interruption contract. Coffee, Signal, and Debate use their
  existing public interruption records; Story adapts the cut without allowing
  Power immunity to suppress it. Zen separately adapts the nuisance style to
  the player without treating them as an interruption target.

- Advanced `Coffee` to `v2.63`, `Signal` to `v1.79`, and `Debate` to `v0.44`.
  Copycat now treats another bot's brief, attributed public spoken Foley—such
  as `Hmm...`, `let me see...`, or `Nice!`—as a heard line eligible for its next
  verbatim repeat. Signal and Coffee read their saved public reaction plans;
  Debate reads attributed persona-reaction events. Nonverbal coughs, physical
  stage direction, private clean speech, and transcript housekeeping remain
  ineligible. Chat and Zen already preserve the player's short addressed text;
  Story already preserves short bot-authored scene speech. Every future
  bot-speaking applet now carries the same requirement before activation.

- Advanced `Coffee` to `v2.62`, `Debate` to `v0.43`, and `Story` to `v0.39`.
  Wielding Prism onto a concrete setup bot now keeps that character fixed while
  the active applet populates the remaining editable setup. Signal includes the
  same bot-directed booking behavior in `v1.78`, and Whodunnit fills every cast
  role plus an editable case direction without compiling the case.

- Added a 24-piece bundled Whodunnit prop pack for authored evidence, access
  items, canonical weapons, closed/open jewelry-box and safe states, and a
  neutral unknown-object fallback. Generated case art retains priority; bundled
  and generated visuals remain presentation-only, with system emoji as the
  final failure path. The optimized alpha WebPs add under 0.6 MB to the desktop
  runtime.

- Advanced `Signal` to `v1.78`. A generated line waiting for its voice no
  longer records the next scheduled bot as a second condensed thinking beat,
  including the brief commit handoff before voice preparation appears. The real
  thinking interval stays linked to its generated line, while the live face can
  still think through voice preparation without falsifying replay provenance.
  Off-mic bots with authored Avatar Details Ink now keep their eyes registered
  to that Ink, while speaking restores their chosen eye movement.

### 2026-08-16

- Advanced `Debate` to `v0.42`. Spectator now shows the live For/Against
  favor bar from the heard public record, so a prepared gallery cannot jump
  the needle ahead of the floor.

- Advanced `Chat` to `v1.46`, `Zen` to `v1.45`, `Coffee` to `v2.61`,
  `Signal` to `v1.77`, `Debate` to `v0.41`, and `Story` to `v0.38`. Bots can
  now love or hate a phosphor color, and a Racist Power with no color named
  snubs the opposite of the holder's own hue—never people or the player.
  Returning Debate title cards can start from a prepared turn (Intro through
  Jury) without regenerating the proceeding.

- Advanced `Chat` to `v1.45`, `Zen` to `v1.44`, `Coffee` to `v2.60`,
  `Signal` to `v1.75`, `Debate` to `v0.39`, and `Story` to `v0.37`. Cursed
  Tongue now puts one to four curse words in every spoken sentence. Signal's
  producer booth can send exact on-air wording the host must speak, with a
  visible but unwired image-context attach for later.

- Advanced `Chat` to `v1.44`, `Zen` to `v1.43`, `Coffee` to `v2.59`,
  `Signal` to `v1.74`, and `Debate` to `v0.38`. A last-name-each-session
  prompt now compiles to Surname Drift instead of wandering into Cursed
  Tongue: the given name stays, a new last name sticks for the session, and
  Avatar Studio lets you edit the original idea before rerolling.

- Advanced `Chat` to `v1.43`, `Zen` to `v1.42`, `Coffee` to `v2.58`,
  `Signal` to `v1.73`, `Debate` to `v0.37`, and retained `Story` at `v0.36`.
  Ad Hominem now shapes one target-aware primary generation, while deterministic
  local Cursed Tongue composition preserves clean private intent and protected
  records without a second provider call. Andy Hominem showcases both Powers.

### 2026-08-15

- Advanced `Signal` to `v1.72`. Live host and guest mouths now remain attached
  to the audible speech lifecycle from its first progress frame, including
  bots whose authored mouth uses the default viseme-driven animation.

- Advanced `Signal` to `v1.71`. Audience ratings now use a shared continuous
  red-to-yellow-to-green performance scale across the show rail, audience
  pulse, and individual listener reviews, including intermediate hues; unrated
  shows retain their muted placeholder color.

### 2026-08-14

- Advanced `Coffee` to `v2.56`, `Signal` to `v1.70`, `Debate` to `v0.36`,
  and retained `Story` to `v0.35`. Timed Mute now guarantees a listener
  reaction once silence reaches eight seconds. Signal also preserves public
  periods through audience projection and gives the elapsed-time stage cue a
  readable live, replay, and Signal Review window without exposing the
  holder's private words.

- Advanced `Signal` to `v1.69`. Ordinary spoken listener acknowledgements play
  at half level beneath the primary line and retain that gain in faithful replay
  direction; the default fallback studio no longer adds a synthetic foreground
  table.

- Advanced `Chat` to `v1.42`, `Zen` to `v1.41`, `Coffee` to `v2.55`,
  `Signal` to `v1.68`, `Debate` to `v0.35`, and retained `Story` to `v0.34`.
  Cursed Tongue now keeps the accepted generation provider/model for its
  contextual public rewrite and rejects missing, duplicated, reordered, or
  structurally damaged source content before falling back to the conservative
  local-safe transform.

### 2026-08-13

- Advanced `Signal` to `v1.67`. Watch now buffers behind the episode title
  card without starting audio, cameras, or the faithful-master clock. The
  spectator can start when ready while the bake continues, or opt into the
  previous automatic start from setup.

- Advanced `Chat` to `v1.41`, `Zen` to `v1.40`, `Coffee` to `v2.54`,
  `Signal` to `v1.66`, `Debate` to `v0.34`, and retained `Story` to `v0.33`.
  Mumbling now projects all bot-authored spoken reactions as gibberish, keeps
  interrupted clear intent private, and derives reusable replay-stable dialects
  from each bot's explicitly saved Accent Map pin.

- Advanced `Coffee` to `v2.53`, `Signal` to `v1.65`, and `Debate` to
  `v0.33`. Session stages now progressively simplify decorative bot materials
  as the visible cast grows while preserving faces, authored Ink, identity
  color, mouth motion, camera direction, and gameplay state. Signal also keeps
  its film grain static and paint-contained instead of recompositing the full
  studio throughout a show.

- Advanced `Signal` to `v1.64`. Show-logo synthesis now requires a familiar
  physical subject performing a visible, host-specific action, rejects abstract
  or malformed emblem briefs, makes broadcast cues optional and subordinate,
  and keeps abstract genome fields out of the image prompt while preserving
  thumbnail, dual-surface, keyed-magenta, and IP-safety constraints.

- Refined `Cursed Tongue` into a contextual, provider-backed public rewrite
  pass across Chat, Zen, Coffee, Signal, Debate, and Story. Exact protected
  spans and the holder's private clean history remain intact; deterministic
  insertion is now recovery-only.

- Advanced `Signal` to `v1.63`. Mid-interview host thank-yous now recover into
  another substantive question, explicit guest sign-offs close Auto instead of
  beginning a farewell loop, and session-sticky false-name contradictions are
  rejected and retried with honest repair provenance before publication.

### 2026-08-12

- Advanced `Chat` to `v1.40`, `Zen` to `v1.39`, `Coffee` to `v2.52`,
  `Debate` to `v0.32`, and `Signal` to `v1.62` for Cursed Tongue's original
  post-generation public profanity layer, protected technical/record spans,
  holder-only clean self-history, and replay/export-safe mode integrations.

- Advanced `Chat` to `v1.39`, `Zen` to `v1.38`, `Coffee` to `v2.51`,
  `Debate` to `v0.31`, and `Signal` to `v1.61`. Identity Crisis now borrows the
  target's public persona, face, authored Ink, resolved voice identity, lower
  glyph, and active public Power consequences while retaining the holder's
  saturated color, client-side voice effect, communication-style chassis, and
  frame finish. Shapeshifter still borrows the complete public audiovisual
  form. A persisted true identity change powers the CRT down, installs the new
  identity while dark, then reveals it without restarting on ordinary
  rerender, reload, or replay seek.

### 2026-08-09

- Bumped `Coffee` to `v2.50` and `Signal` to `v1.60` so an interrupted
  Copycat preserves the audience-heard copied fragment but can only follow it
  with `...`; canned protests and irritation Foley never give the mimic new
  words. Chat and Zen have no bot-to-bot follow-on interruption lane, while
  planned applets inherit the same exact-response boundary when implemented.

### 2026-08-01

- Added the continuous `Inept` Power across Chat, Zen, Coffee, Signal, Debate,
  and the retained Story runtime. Holders visibly botch every instructed role,
  while bot-attributed image requests and all retries are replaced with wholly
  unrelated safe scenes. Advanced Chat, Zen, Coffee, Signal, Debate, and Story
  to `v1.37`, `v1.35`, `v2.43`, `v1.54`, `v0.6`, and `v0.31` respectively.

- Added the holder-only `Observant` / `Perceptive` Power contract across Chat,
  Zen, Coffee, Signal, Debate, and the retained Story runtime. It sees Ryuk,
  understands Mumbling Jim, ignores targeted Power pressure, and never notices
  the absent Power layer; every other observer's experience remains unchanged.

### 2026-07-29

- Landed canonical Microscopic, Tiny, Small, Large, Giant, and Colossal bodies
  at hidden, 50%, 75%, 125%, 150%, and edge-cropped 300% presentations.
  Nameplates, controls, hitboxes, captions, and cups remain normal-sized;
  Microscopic, Colossal, and Invisible suppress cups. Quiet always reaches the
  player while each bot listener gets a persisted independent half-hearing roll
  with no leaked words on a miss. Loud persists one half-chance annoyance target
  among audible peers. Story preserves scene audiences and performs at most one
  context-redacted repair pass. Signal advances to `v1.52`; current Chat, Zen,
  Coffee, Story, Debate, and Slate versions retain their newer release state.

- Bumped `Debate` to preview `v0.4` for post-session polish: sibling Jury
  commentary with Copy Jury beside verbose transcript, Coffee-style synopsis on
  the Verdict rail and archive, ephemeral pick-a-bot inquiry into frozen
  reasoning (no mind-change, no memory), Forum advocate pace-up when short on
  time, and a spoken-word English voice completion floor.

- Bumped `Debate` to preview `v0.3` so Motion Chamber Territory / Your idea
  accepts Prompt Center prompts and wildcard decks. Prompt picks insert as
  ordinary editable text; wildcard chips stay until you Build / Refract, when
  leftover model placeholders resolve for the outbound payload only. The
  territory catalog dice stays separate.

- Bumped `Slate` to preview `v0.8` for the manuscript-first Writer's Cockpit:
  TipTap section documents, Story Map, adaptive Inspector, natural-language
  Director, inline proposals, exactly three grounded clarification choices plus
  a custom vibe, focused Story Bible and History desks, generation-scoped
  Continuity, and exportable section-level Slate Review provenance. Writing
  operations now start asynchronously so Stop and Redirect can abort a live
  provider request. Character Studio projects source-linked profiles, observed
  arcs, and causal edges from accepted prose while letting the writer curate
  field-level canon and a separate intended arc. The Composer receives distinct
  Direction Intent, Continuity Brief, Mirror Brief, and Momentum Target inputs.

- Reworked Debate’s five built-in proceeding presets as flavor-first room
  choices: University Union, Daytime Showdown, Crossfire, Town Hall, and Bench
  Trial. Each owns one frozen formality level alongside its format, player
  role, and Jury stance; selecting one preserves motion, cast, evidence,
  routing, participant side, and stage alignment, but renews advocacy consent
  whenever its format or formality changes.
- Added a frozen five-stop Debate formality spectrum from Free-for-all through
  Parliamentary. The selected register now governs motion synthesis, room
  naming, moderator procedure, advocacy consent, speeches, Jury discussion,
  ballots, rulings, early conclusions, and archived transcripts while leaving
  each bot's authored voice in charge. Parliamentary preserves the existing
  Assembly Chamber and Court of Record language; casual levels use direct
  Debate Floor and Turnabout Floor language instead.
- Reframed Debate's binding Jury as a five-seat live camera. Jurors now follow
  the case and exchange brief between-turn reactions throughout the proceeding;
  those reactions play when the Jury camera is active and resolve immediately
  from other views. Final anonymous ballots slide into a visible center-table
  pile before the split is read.
- Bumped `Debate` to `v0.2` and `Signal` to `v1.40` for the
  no-Power-eligibility-gates contract. A hard-muted moderator now opens with
  canonical silence while advocates encounter the silence in character and the
  public ledger preserves required procedure. Debate moderation is also
  perception-aware: Ryuk completes durable hidden turns, an unaware cast sees
  and hears only an empty podium plus neutral procedure, a matching Light alone
  receives his words, and Tiny Bill stays unseen but audible. Inaccessible
  moderator language never enters the shared case board or listener-facing
  ballot record. Signal likewise lets mute and echo hosts take a human Producer
  guest, and muted off-air host chat returns canonical silence instead of
  rejecting the interaction. A muted host can also attempt `Interrupt guest
now`; the saved outcome is silence rather than a disabled control or
  fabricated interjection.

### 2026-07-28

- Replaced the planned Arena identifier with `Debate v0.1 Preview`: a complete
  Judge, Participant, or Spectator Duel with private role consent, explicit
  Devil's Advocate framing, immutable shared evidence, revisioned live turns,
  scoreless public case-board truth, independent ballots, resumable history,
  frozen Powers, live voices, and the authored Light/Dark Prismatic Forum.

### 2026-07-30

- Bumped `Coffee` to `v2.41` for local-only café Jazz atmosphere: five loopable
  stations under Table feel, heard during live tables and replay viewing, kept
  out of faithful audio masters and Coffee session settings exports.
- Bumped `Coffee` to `v2.40` so faithful replay seats Default Prism at the
  table with the pot. Live Coffee stays off-camera; the player mug/barista path
  remains retired.

### 2026-07-26

- Bumped `Chat` to `v1.35`, `Zen` to `v1.33`, `Coffee` to `v2.39`,
  `Signal` to `v1.39`, and planned `Story` to `v0.29` for the holder-scoped
  spectrum Power. A Ready RGB, rainbow, or color-cycling Power continuously
  changes the embodied avatar accent without mutating the bot's authored
  resting color; reduced motion restores that authored color.
- Bumped `Signal` to `v1.37` to restore the Align Studio cosmetic production
  layer: extracted microphones take separate host and guest accent masks,
  generated lighting uses its receiver map, floor glows can be placed and
  resized, and Light/Dark opacity, Screen/Overlay blending, and film grain save
  with the show for live presentation and faithful replay.
- Bumped `Signal` to `v1.36` so a reshuffled false-name Power does not force
  identity exposition into every answer or turn a deterministic social silence
  into spoken text. Canonical `...` stays non-substantive, so Auto no longer
  mistakes those silent beats for interview progress and closes only after an
  earned conversational handoff.

### 2026-07-25

- Bumped `Chat` to `v1.33`, `Zen` to `v1.31`, `Coffee` to `v2.36`, `Signal`
  to `v1.34`, and `Story` to `v0.27` so short-term amnesia is a pure per-turn
  context wipe: the holder receives only the current other-speaker message, with
  no hard amnesia performance cue and no reply rewriting. Peers keep full
  history and react organically.

### 2026-07-24

- Signal and Coffee now share one post-effect session recorder and V2 private
  direction format. Authenticated replay uses the exact master as its only
  clock, supports deterministic seeking, preserves presentation-timed silent
  and audible thinking intervals without doubling their recorded SFX, and
  makes no synthesis, enhancement, or video-generation calls. Sessions without
  a master are transcript-only, and the sole visible download is a readable
  Markdown transcript.

- Bumped `Coffee` to `v2.30` for the restored five-seat, pot-only table. The
  player remains off camera, barista and waiter service stays retired, valid
  replay manifests preserve table events without empty dialogue, and one
  faithful live audio master drives procedural replay without video generation
  or doubled sound.
- Restored `Signal` provenance to released `v1.29`; Coffee remains off camera
  even though Signal Producer guests still appear on its stage.

### 2026-07-22

- Bumped `Signal` to `v1.54` so changing shows clears the full episode setup,
  stage placement can never level-check a host against itself, thinking-only
  avatar loops stay quiet while idle, and always-on character sounds use the
  booked bot’s frozen visual/audio snapshot.

- Bumped `Coffee` to `v2.28` so the selected bar bot floats and glows beside a
  compact persona blurb, then directly asks whether the player would like
  coffee before the cup-or-pot choice.

- Bumped `Coffee` to `v2.27` and `Signal` to `v1.53` so Identity Crisis
  recognizes bounded sentence-leading vocatives such as `So Ian—...` and
  `Well, Ian, ...` as direct bot address. The persisted persona, face, and
  voice handoff now begins on that first addressed line while third-party
  mentions remain non-triggers.

- Bumped `Signal` to `v1.52` for one Logo, Name, and Premise identity row and
  one coordinated Atmosphere card. Premise rolls now refresh host blurbs,
  detailed prose receives a faithful editorial pass, logo actions use a
  non-modal menu, and Atmosphere rebuilds studio and sound together while
  preserving LOCAL privacy and existing artwork during background work.

- Bumped `Signal` to `v1.51` so synthesized studios reserve only their
  microphone lights for cast color: the left mic follows the host and the right
  follows the guest across live playback, local replay, and Premium video.
  Uploaded studios remain exactly as authored.

- Bumped `Signal` to `v1.50` so every completed episode ends on a host-owned
  beat, including normal wraps, producer cuts, guest departures, hard mute,
  hard echo, and emergency sign-off recovery. The guest may give the final
  response but never owns the saved sign-off. Align stage also lets each floor
  glow move vertically and scale down from its original maximum, with the saved
  Studio lighting receiver map masking the glow off implausible overlaps.

- Bumped `Signal` to `v1.49` so completed episodes open immediately as local
  replays from their captured takes and saved timeline, with built-in local
  speech filling any legacy gaps. Premium video is now an explicit ONLINE,
  credit-confirmed action: PRISM preserves the saved transcript, masters
  Eleven v3 dialogue with shared-actor isolation, mixes the production cut,
  and feeds its cached master into the repaired renderer. A failed video retry
  resumes from mixing or rendering without regenerating provider audio, and
  Premium media can be removed without deleting the canonical episode replay.

- Bumped `Signal` to `v1.48` for persona-shaped Music Identity v2. Show creation
  now translates each host's emotional core and signature contradiction into
  instrumental texture, rhythm, harmony, motif, and ending behavior shared by
  the local ident, paired outdent, and cached ElevenLabs package. Producers can
  edit or regenerate that sound identity from the show gear, while music
  providers receive only the derived provider-safe fingerprint—not raw persona,
  franchise, character, or show prose.

- Bumped `Chat` to `v1.30` so every PRISM or persona Home can hold multiple
  independent saved conversations again. Nested rows open their exact
  transcript, per-Home `+` and global New chat create a fresh isolated
  conversation for that relationship, and relationship memory stays shared
  without merging sibling transcripts.

- Bumped `Chat` to `v1.29` and `Zen` to `v1.28` so empty canvas clicks jump
  straight to All Bots Home (instead of walking one Home back through the
  relationship stack), and so light-mode atmosphere wallpaper stays visible
  while a reply is still streaming — the chat plate goes transparent over live
  wallpaper, frost lanes ease off mid-reply, and wallpaper opacity is raised.

- Bumped `Chat` to `v1.28` and `Zen` to `v1.27` so Home persona color eases in
  with conversation depth instead of flooding the first turns. Early messages
  stay readable in light mode; the translucent bot wash gradually fills the
  room while wallpaper and atmosphere texture remain visible underneath. Light
  mode no longer erases atmosphere wallpaper with multiply blending and a heavy
  white frost lane while a reply is streaming.

- Bumped `Chat` to `v1.27`, `Zen` to `v1.26`, `Coffee` to `v2.26`, `Signal`
  to `v1.47`, and `Story` to `v0.26` so bot-name prefixes and suffixes land as
  social beats instead of silent text substitutions. A bot who hears its own
  altered name may comment once, show a bounded contextual mood, tone, or
  action reaction, or let it pass according to its personality and
  relationship with the speaker. The reaction is soft and immediate: it never
  forces polarity, changes a saved identity, targets the player, becomes a
  permanent nickname, or makes other speakers copy the affix. Coffee and
  Signal carry the observer pressure into the next participant turn; Story
  adapts it within cast scenes; Chat and Zen retain the future-safe cue when
  another bot is present or mentioned.

- Bumped `Chat` to `v1.26`, `Zen` to `v1.25`, `Coffee` to `v2.25`, `Signal`
  to `v1.46`, and `Story` to `v0.25` for holder-scoped bot naming. A Ready
  Power can add one bounded prefix or suffix whenever its holder names another
  bot—so Rick Sanchez may say `Sigmund Freud Bot` while remaining `Rick
Sanchez`, and unaffected speakers keep their own naming habits. Coffee and
  Signal enforce the frozen target name in saved output; Story adapts it to
  cast dialogue, while Chat and Zen carry the rule as a cue when another bot is
  mentioned. Signal continues to treat public episode titles as editorial
  labels instead of canned opening dialogue.

### 2026-07-21

- Initial designation groundwork and Signal title framing landed in `Chat`
  `v1.25`, `Zen` `v1.24`, `Coffee` `v2.24`, and `Signal` `v1.45`. The corrected
  holder-to-target naming contract is documented in the 2026-07-22 entry above.

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
  overlapping handoffs. This release's half-translucent replay treatment was
  superseded by the six-tier update: Invisible bodies now remain fully hidden
  while attribution, captions, and otherwise-audible voice remain available.

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
  even while speaking, and Ghost alone uses the speaking-only reveal. The
  original half-translucent Invisible treatment was superseded by the six-tier
  update's fully hidden live-and-replay contract. Loud no longer cancels size
  or visibility; Coffee and Signal freeze these states for replay.

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

- Bumped `Coffee` to `v2.37` and `Signal` to `v1.35` so identity mirroring now
  composes the target's active public Power consequences into the holder's
  next turns. Borrowed amnesia can clear the holder's transcript context and
  borrowed false-name state can generate a fresh spoken alias, while bot IDs,
  seats, roles, UI labels, private perception permissions, providers, safety,
  and replay attribution remain anchored. Composition is first-order so a
  copied identity-mirror effect cannot recurse.

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
  participant state. Hard mute always wins because no audible turn reaches the
  recipient.

- Bumped `Coffee` to `v2.9` and `Signal` to `v1.15` for the original bounded identity
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
  before the saved outro. At the time, echo-bound hosts remained exact mirrors
  while a bot guest carried the opening and closing. A reusable interruption
  effect can cut
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
  staged the Jazz atmosphere control for a later local-only café radio pass.
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
