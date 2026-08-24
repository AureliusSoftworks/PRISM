# Voices

Prism Voices is account-wide: **Mute** (the default), **English**, **Babble**, or
**Bottish**. A bot owns one compatible V3 voice profile with separate Local and
Premium identities, each with its own Feel (voice, pitch, lilt, pace), plus a
shared playback effect and portable Voice Character for Local. Existing
profiles and backups may still contain the retired `bottishTone` field, but
Prism no longer exposes, randomizes, or applies it. Account Voice Volume remains
the master level.

Use the labeled `Voice · <mode>` selector beside the app, provider, and model
controls to choose a mode directly. At constrained widths, the same four radio
choices move into the tools menu instead of becoming an ambiguous cycle button.

## English engines

Voice settings list the engines available in each privacy lane:

- **Auto** preserves the selected character identity while choosing the best
  healthy offline engine per utterance. It may use **Voice+** only when that
  engine is qualified, warm real-time factor is at most 1.0, first playable
  audio is under 2.5 seconds, and runtime health passes; otherwise it uses
  **Instant**.
- **Instant** is the **PRISM Voice Pack**: 28 portable Kokoro neural voices
  bundled with installed builds and generated entirely on the device. The
  Kokoro 82M q8 model is loaded only from the packaged model directory; a
  missing model never triggers a network download.
- **Voice+** is the pinned Chatterbox Turbo ONNX Q4 candidate. It remains a
  development-only opt-in until the exact redistributed asset, provenance
  watermark, original PRISM reference deck, and macOS arm64/x64, Windows x64,
  and Linux x64 qualification records pass. Steam ships Instant by default; a
  forced Voice+ request visibly recovers through Instant before playback begins.
- **Operating-system voices** are an optional account setting. When enabled,
  installed English voices from macOS or Windows join bot voice menus. Turning
  the catalog setting off hides new operating-system choices without deleting
  or relabeling a saved selection.
- **Online engine** is ElevenLabs for now. Listing an online engine is not a
  global activation switch: a profile uses it only after the person selects an
  ElevenLabs voice in Prism or bot customization.

Every profile defaults to one stable PRISM voice slot (`voice-1` through
`voice-28`). These map to all currently packaged English Kokoro archetypes and
are presented through generic traits such as register, warmth, temperament,
and American or British source. Engine filenames and upstream embedding names
remain implementation details. The source-first accent selector never rewrites
visible dialogue into dialect spelling.
Profiles persist only the stable slot, not the engine's internal voice name.
An explicit ElevenLabs voice overrides the local identity for eligible ONLINE
English replies. If the API key, selected provider voice, or ElevenLabs itself
is unavailable, Prism keeps playback working through the PRISM Voice Pack. A
persisted LOCAL reply always uses the local pack regardless of its saved online
identity.

V1 and V2 profiles remain readable indefinitely. Saving an edited profile
serializes V3 with `local`, `premium`, and `delivery` sections; loading an older
profile does not bulk-rewrite its bot file. Older shared delivery pace/lilt
values migrate onto both Local and Premium Feel lanes. ElevenLabs remains the
expressive provider option for native audio tags, directed delivery, and higher
emotional range.

## Accent sources and Speechprints

Local identity has four independent layers:

- **Genuine accent source** filters the picker to the selected English locale.
  American shows only `en-US`, British shows only `en-GB`, and another English
  locale appears only when the operating system reports a matching voice.
- **Vocal presentation** filters bundled archetypes to Any, Feminine, or
  Masculine using authored metadata. Operating-system voices appear under Any
  only because host APIs do not report presentation reliably.
- **Pronunciation** follows the selected voice by default, or approximately
  uses the qualified American or British phoneme base independently of that
  voice. An American archetype can therefore keep its timbre while speaking
  British phonemes, and vice versa.
- **Pronunciation influence · Approximate** optionally applies one restrained,
  PRISM-authored Speechprint: Spanish-influenced English, Latin American
  Spanish-influenced English, Mexican Spanish-influenced English, Brazilian
  Portuguese-influenced English, Mandarin-influenced English,
  Japanese-influenced English, Korean-influenced English, Indian English,
  French-influenced English, German-influenced English, Italian-influenced
  English, or Russian-influenced English.
  Each supports Light, Balanced, and Strong. Romance influences also reshape
  private stress and rhythm (for example early Spanish stress vs Italian
  penultimate bias) after the sound swaps, and map English STRUT vowels such as
  the vowel in "sun" toward open/central /a/ (European Portuguese toward /ɐ/)
  for a more realist L1 substitution. Qualified Romance influences then apply
  an approximate phrase-melody contour in private IPA stress only — Instant
  never invents Feel-stage Pitch/Lilt changes or extra client clause-breath
  pauses for that contour.

Cross-accent pronunciation and Speechprints run only through Instant. Auto
selects Instant when either is active; a forced Voice+ or installed
operating-system voice preserves its genuine pronunciation and reports the
phoneme control as suspended. Speechprints apply after the resolved American
or British pronunciation base. Premium, Babble, Bottish, and cached vocal
actions do not apply either control. Premium instead expresses the saved Accent
Map as an ElevenLabs v3 direction tag — `[Irish accent]`, `[strong French
accent]` — and sends the written line through unchanged. ElevenLabs has no
phoneme control, so notation placed in the request text is read aloud as
notation rather than pronounced. Where the atlas label is a dialectologist's
name rather than an accent anyone would ask a performer for, PRISM substitutes
its own nearest actionable name in the private cue — Bay Area becomes Northern
Californian, Inland North becomes Midwestern American, Eastern New England
becomes Boston — because a region the provider has no concept of yields no
accent at all. The Accent Map keeps showing the precise place.

A named Accent Map choice is exact even when an older saved profile carries a
stale point beside it. A freely placed, unnamed point uses shared source cores
and boundary falloff: it stays 100% within a source's home range, then moves
smoothly toward a neighboring regional or language influence after crossing
that core. Co-located choices such as the London variants are never inferred
from coordinates. The field is a coarse geographic pronunciation approximation
for creative casting, not demographic inference about a person or population;
Local and Premium resolve the same saved field before rendering it through
their own engines.

Where the accent also moves consonants, Premium respells the words it changes
rather than sending phonemes: an accent that stops θ requests "I tink dis",
one that fronts it requests "I fink". The word lists are curated per accent
and descend from that accent's own Speechprint rules, so the word side and the
phoneme side stay traceable to each other; orthographic `th` is ambiguous, so
they are never expressed as patterns. Vowels stay with the direction — vowel
respelling produces non-words the model has to guess at. Light is direction
only; Balanced adds the highest-frequency words where the accent's own rule
fires below Strong, and Strong widens the list. An accent whose Local rule is
Strong-only — Essex and Estuary th-fronting — respells nothing until Strong.
Calibration scripts and sound-effect prompt seeds opt out entirely.
Respelling is skipped entirely when the voice already carries the accent and
no direction is issued. Protected spans — authored name pronunciations,
self-referrals, initialisms, code-like tokens, and anything carrying a digit —
are never respelled, and provider timing is projected back onto the words as
written, so the alignment this route returns matches the original line
character for character. As with Local phonemes, only the private request
changes: visible dialogue, captions, prompts, memories, summaries, boards,
ballots, and transcript exports retain the original text. Voice Source and Current previews compare the
same line.

Instant phonemizes each speech segment locally from its genuine American or
British base, applies deterministic word-boundary-aware sound rules, then a
private stress/rhythm pass and approximate phrase-melody stress contour for
qualified influences, then uses Kokoro's pinned token-ID interface. A private
per-profile variation seed keeps optional details stable for that character and
travels with bot exports.
Explicit name pronunciations, initialisms, numbers, and code-like tokens are
protected. Only private phonemes change: visible dialogue, captions, prompts,
memories, summaries, boards, ballots, and transcript exports retain the
original text. Faithful replay stores the normalized V3 profile and resolved
ruleset provenance, never IPA or rewritten spellings.

Legacy five-slot `elevenLabsVoiceBank` backup data remains importable but is no
longer shown in settings or consulted during synthesis.

Bot customization keeps the authenticated ElevenLabs voice list and also
accepts an exact Voice ID override. When present, the override wins over the
selected list voice. Both values are stored in the portable bot voice profile,
so `.bot` exports retain the intended identity; an importing account still
needs permission to use that ElevenLabs voice. Clearing the override restores
the selected list voice without losing it; choosing a different library voice
also clears and replaces the exact-ID override.

Each profile can also choose a local playback effect: **Clean**, **Radio**,
**Robot**, **Echo**, **Prism**, **Resonance**, or **Deep Space**. **Prism is the
default** so PRISM's robot cast keeps a restrained synthetic house sound across
voice engines. Radio adds a narrow broadcast band and light static; Robot uses
level-controlled mechanical modulation; Echo supplies two repeats; Prism gently
tunes voiced speech toward nearby chromatic notes before adding its refracted
double; Resonance adds a darker, weightier mechanical double
for imposing character voices; and Deep Space adds a lower spectral double and
trailing reflection. Prism stores
the choice with the profile and applies it locally to PRISM Voice Pack,
operating-system, ElevenLabs, Babble, Bottish, and provider-fallback playback.
The selector stays available regardless of the active English engine. These
effects use Web Audio; the browser's basic media fallback plays the clip clean.
Older local-only profiles that carried the former implicit Clean default adopt
Prism; choosing Clean in the current editor records an explicit opt-out. The
stored `chorus` identifier remains the compatible representation of Prism, so
existing profiles keep the same selection. Pitch analysis and correction happen
locally after synthesis, never leave the browser, and relax to neutral through
silence and unvoiced speech. The old Distortion value also migrates to Prism
when an earlier profile is loaded.

Profiles with an ElevenLabs voice can also save up to three performance
directions as removable word chips, such as `warmly`, `hushed`, or
`mischievously`. Two compatible cues usually produce the most reliable result.
Prism normalizes the chips, turns each direction into an Eleven v3 audio tag,
and selects Eleven v3 for that profile's directed generations. Directions
affect ElevenLabs synthesis only; they are never added to the PRISM Voice Pack,
operating-system voices, Babble, or Bottish input. Local voices still receive
PRISM's Pitch, Pace, Lilt, mood-rate, Voice Character, and playback-effect
shaping; they do not understand provider direction tags.

The same ElevenLabs card includes one **Performance stability** setting. It is
stored in the portable V2 profile and sent with every provider request. Lower
values invite more expression; higher values favor consistency. Prism leaves
Style, Similarity, and Speaker Boost out of the editor. Eleven v3 receives only
this supported stability setting; older ElevenLabs models retain their fixed
compatibility defaults.

When an eligible spoken turn has a non-neutral delivery mood, Prism also gives
Eleven v3 one automatic performance direction: `joyful` becomes `delighted`,
`warm` becomes `warmly`, `guarded` becomes `reserved`, and `strained` remains
`strained`. Neutral or invalid mood values add nothing. The automatic direction
uses the first of the same three direction slots, preserving up to two distinct
profile directions. An explicit vocal audio tag, such as `[sighs]`, takes
precedence and suppresses the broader mood direction for that line. These tags
exist only in the provider request: they are not saved in the transcript, and
narrative actions inside asterisks remain visual actions rather than voice
directions.

## Voice modes

- English uses the local PRISM Voice Pack by default, or a selected host voice
  when operating-system voices are enabled. Its selected voice, pitch, lilt,
  pace, and warmth controls remain available.
- Babble transforms cleaned speech into stable, pronounceable pseudo-syllables
  that preserve punctuation, spacing, cadence, Unicode handling, and replay
  seeds. The selected local voice speaks that gibberish while the client adds
  deterministic clicks, chirps, pops, short gates, and sparse buzz bursts. The
  accents are additive and bounded so the carrier stays clear.
- Bottish is Prism's original procedural robot language. It does not call the
  synthesis API. Its deterministic beeps, chirps, and fitted timing are restored
  as the complete voice rather than mixed under synthesized speech.
- Local pitch, pace, lilt, brightness, resonance, Open–Nasal, and Light–Chest
  shape local English, Babble, and Bottish without changing the Premium Feel.
  Premium keeps its own pitch, pace, and lilt. Shared mood performance, effect,
  texture, and volume continue to affect both lanes. Prism applies local tone
  through a formant-preserving browser worklet, while **Pace is the only
  profile control that changes duration**. Local and provider synthesis stay
  neutral-tempo so Pace is applied exactly once. If a browser cannot start the
  worklet, Prism still honors Pace and plays neutral pitch rather than
  resampling into a tempo wobble.

Avatar Studio's Local card exposes the two-dimensional **Open–Nasal / Light–Chest**
pad plus advanced pitch, brightness, resonance, and local gain. The center is
neutral. These controls apply through the local Web Audio graph to local
English, Babble, Bottish, primary speech, and local vocal actions; they never
reshape ElevenLabs audio. The browser's rare basic media compatibility fallback
remains dry.

Marked actions are planned before synthesis as source-linked segments. Explicit
`*laughs*`, `*chuckles*`, `*giggles*`, `*sighs*`, `*exhales*`, `*gasps*`,
`*coughs*`, `*clears throat*`, `*snorts*`, `*groans*`, `*sobs*`, `*yawns*`, and
`*lol*` can become immediate deterministic local reactions. Supported delivery
modifiers include softly, nervously, dryly, briefly, loudly, restrained, and
relieved. Ordinary prose is never matched. The canonical message and model
context remain unchanged.

When Web Audio is unavailable, Babble receives the same clean additive accents
in its media WAV. If local speech is unavailable during live speech or replay,
Babble deliberately completes through procedural Bottish. Babble previews do
not substitute a misleading voice: they report that Babble is loading or
unavailable and allow a retry.

Playback is audio-master: decoded source duration plus the formant/effect tail
drives text reveal and mouth motion. A completed final phoneme may overlap the
next natural handoff; only an explicit interruption truncates active speech.
Sending another message, navigating away, changing modes, or choosing Mute
stops the relevant active voice and queued accents.

## Voice Sync Lab

Development builds expose **Voice sync** in Developer Tools and at
`/qa-voice-sync`. The lab runs authenticated synthesis through the shipping
voice queue and effects graph, taps the final software output bus, records the
rendered mouth transitions on the same AudioContext clock, and supports
scrubbing, slow playback, looping, Shh cutoffs, stress phrases, and JSON/WAV
exports. The lab retains no test state beyond browser memory unless an export
is explicitly downloaded, and it never creates a canonical conversation or
memory. ElevenLabs test phrases still cross the configured external provider
boundary, while Local, System, Babble, and Bottish stay on the device.

Alignment labels describe provenance, not confidence theater:

- **Aligned** requires authoritative phoneme and viseme timing from the engine
  or the exact generator that produced the audio.
- **Partial** includes authoritative character timing without authoritative
  phoneme and viseme timing, such as current ElevenLabs alignment.
- **Unaligned** means timing is missing or derived only from heuristics or a
  post-hoc aligner.

The first-open and last-open deltas are audibility-gate diagnostics, not
phoneme-match scores. A correctly closed `/p/`, `/b/`, or `/m/` can begin after
audible speech starts without representing lag; phoneme and viseme agreement
must be read from the engine and rendered-mouth lanes on the shared frame ruler.

The captured WAV and exported trace retain the exact software-bus frame clock.
Browser-reported device latency is displayed as a separate estimate and is
never baked into those frames. Physical speaker, display, and microphone
loopback remain unmeasured until a hardware calibration path is added.

## Privacy boundary

Bottish is entirely procedural on the client. The PRISM Voice Pack and Babble
are generated from packaged local assets and never call ElevenLabs or another
outbound provider, in either LOCAL or ONLINE mode. Optional OS synthesis also
stays on the device. A persisted assistant message whose provider is LOCAL can
never be sent to provider TTS.

## Marketplace profiles

Marketplace bundles carry an authored profile. A user's later customization is
stored separately as an override, so catalog updates can improve the authored
voice without overwriting the user's choice. Each bot can keep separate local
and ElevenLabs identities; clearing the online identity returns it to the PRISM
Voice Pack or its selected operating-system voice.
