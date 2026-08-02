# Voices

Prism Voices is account-wide: **Mute** (the default), **English**, **Babble**, or
**Bottish**. A bot owns one compatible V3 voice profile with separate Local and
Premium identities, shared delivery, and portable Voice Character settings. Existing
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
- **Voice+** is the pinned Chatterbox Turbo ONNX Q4 candidate. Production
  packaging is fail-closed until the exact redistributed asset, provenance
  watermark, original PRISM reference deck, and macOS arm64/x64, Windows x64,
  and Linux x64 qualification records pass. A forced Voice+ hard failure is
  visible and recovers through Instant before playback begins.
- **Operating-system voices** are an optional account setting. When enabled,
  installed English voices from macOS or Windows join bot voice menus. Turning
  the setting off immediately returns every profile to its portable PRISM
  identity without deleting a saved OS selection.
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
profile does not bulk-rewrite its bot file. ElevenLabs remains the expressive
provider option for native audio tags, directed delivery, and higher emotional
range.

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
- Local pitch, brightness, resonance, Open–Nasal, and Light–Chest shape local
  English, Babble, and Bottish without changing the Premium identity. Shared
  pace, lilt, mood performance, effect, texture, and volume continue to affect
  Local and Premium. Prism applies local tone through a
  formant-preserving browser worklet, while **Pace is the only profile control
  that changes duration**. Local and provider synthesis stay neutral-tempo so
  Pace is applied exactly once. If a browser cannot start the worklet, Prism
  still honors Pace and plays neutral pitch rather than resampling into a
  tempo wobble.

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
