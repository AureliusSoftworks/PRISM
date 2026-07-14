# Voices

Prism Voices is account-wide: **Mute** (the default), **English**, **Babble**, or
**Bottish**. A bot owns one compatible voice profile with a selected system
voice, volume, pitch, lilt, pace, and warmth. Existing profiles and backups may
still contain the retired `bottishTone` field, but Prism no longer exposes,
randomizes, or applies it.

Use the labeled `Voice · <mode>` selector beside the app, provider, and model
controls to choose a mode directly. At constrained widths, the same four radio
choices move into the tools menu instead of becoming an ambiguous cycle button.

## Engines

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
- Pitch shapes English, Babble, and Bottish. Lilt, pace, and warmth are neutral
  for Babble and Bottish; lilt remains an English-only character control.

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
voice without overwriting the user's choice. The five Prism Originals use
Voices 1–5 respectively at neutral controls.
