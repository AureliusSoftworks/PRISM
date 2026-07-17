# Voices

Prism Voices is account-wide: **Mute** (the default), **English**, **Babble**, or
**Bottish**. A bot owns one compatible voice profile with a selected voice
identity, volume, pitch, lilt, pace, and warmth. Existing profiles and backups
may still contain the retired `bottishTone` field, but Prism no longer exposes,
randomizes, or applies it.

Use the labeled `Voice · <mode>` selector beside the app, provider, and model
controls to choose a mode directly. At constrained widths, the same four radio
choices move into the tools menu instead of becoming an ambiguous cycle button.

## English engines

Voice settings list the engines available in each privacy lane:

- **Offline engine** is System TTS. It uses a voice installed by the operating
  system and never sends speech text off-device.
- **Online engine** is ElevenLabs for now. Listing an online engine is not a
  global activation switch: a profile uses it only after the person selects an
  ElevenLabs voice in Prism or bot customization.

Every profile defaults to its selected system voice or the operating-system
default. An explicit ElevenLabs voice overrides that system identity for
eligible ONLINE English replies. There are no account-level default voice
selectors. If the API key, selected provider voice, or ElevenLabs itself is
unavailable, Prism keeps playback working through System TTS. A persisted LOCAL
reply always uses System TTS regardless of the saved online identity.
Legacy five-slot `elevenLabsVoiceBank` backup data remains importable but is no
longer shown in settings or consulted during synthesis.

Bot customization keeps the authenticated ElevenLabs voice list and also
accepts an exact Voice ID override. When present, the override wins over the
selected list voice. Both values are stored in the portable bot voice profile,
so `.bot` exports retain the intended identity; an importing account still
needs permission to use that ElevenLabs voice. Clearing the override restores
the selected list voice without losing it.

Each profile can also choose an ElevenLabs-only playback effect: **Clean**,
**Radio**, **Robot**, **Echo**, **Chorus**, or **Deep Space**. Radio adds a
narrow broadcast band and light static; Robot uses level-controlled mechanical
modulation; Echo supplies two repeats; Chorus adds a wide detuned double; and
Deep Space adds a lower spectral double and trailing reflection. Prism stores
the choice with the profile and applies it locally only after the synthesis
response confirms that ElevenLabs actually supplied the audio. System TTS,
LOCAL speech, Babble, Bottish, and any provider fallback always stay clean. The
selector appears only after that profile has an ElevenLabs voice. These effects
use Web Audio; the browser's basic media fallback plays the clip clean. The old
Distortion value migrates to Chorus when an earlier profile is loaded.

Profiles with an ElevenLabs voice can also save up to three performance
directions as removable word chips, such as `warmly`, `hushed`, or
`mischievously`. Two compatible cues usually produce the most reliable result.
Prism normalizes the chips, turns each direction into an Eleven v3 audio tag,
and selects Eleven v3 for that profile's directed generations. Directions
affect ElevenLabs synthesis only; they are never added to System TTS, Babble,
or Bottish input.

## Voice modes

- English uses clean system-native speech. Its selected voice, pitch, lilt,
  pace, and warmth controls remain available.
- Babble transforms cleaned speech into stable, pronounceable pseudo-syllables
  that preserve punctuation, spacing, cadence, Unicode handling, and replay
  seeds. The selected system voice speaks that gibberish while the client adds
  deterministic clicks, chirps, pops, short gates, and sparse buzz bursts. The
  accents are additive and bounded so the carrier stays clear.
- Bottish is Prism's original procedural robot language. It does not call the
  synthesis API. Its deterministic beeps, chirps, and fitted timing are restored
  as the complete voice rather than mixed under system speech.
- Pitch shapes English, Babble, and Bottish, including ElevenLabs English. Lilt
  shapes English in both the System TTS and ElevenLabs lanes. For
  ElevenLabs, Prism maps those controls into the provider request and applies
  the shared local playback contour; pace and warmth remain hidden,
  schema-compatible controls.

When Web Audio is unavailable, Babble receives the same clean additive accents
in its media WAV. If system speech is unavailable during live speech or replay,
Babble deliberately completes through procedural Bottish. Babble previews do not
substitute a misleading voice: they report that Babble is loading or unavailable
and allow a retry.

Playback is sequential and audio-master: carrier or procedural duration drives
text reveal and mouth motion in Chat, Zen, Coffee, Story, previews, and replay.
Sending another message, navigating away, changing modes, or choosing Mute stops
the active voice and every queued accent.

## Privacy boundary

Bottish is entirely procedural on the client. Babble uses only system-native
synthesis and never ElevenLabs or another outbound provider, in either LOCAL or
ONLINE mode. A persisted assistant message whose provider is LOCAL can never be
sent to provider TTS.

## Marketplace profiles

Marketplace bundles carry an authored profile. A user's later customization is
stored separately as an override, so catalog updates can improve the authored
voice without overwriting the user's choice. Each bot can keep separate system
and ElevenLabs identities; clearing the online identity returns it to System
TTS.
