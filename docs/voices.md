# Voices

Prism Voices is account-wide: **Mute** (the default), **Bottish**, or
**English**. A bot owns one portable voice profile with a selected system voice,
pitch, lilt, and Bottish tone. The profile stays the same when the account
switches between Bottish and English.

## Engines

- Bottish is a voiced robot language. The API deterministically replaces cleaned
  speech with pronounceable pseudo-syllables, preserving punctuation and cadence,
  then speaks it with the selected macOS or Windows system voice. The client adds
  sparse deterministic clicks, chirps, gating, and buzz without burying the voice.
- Bottish tone controls the whole robotic treatment: lower values retain more
  vocal body with softer accents; higher values add brighter, denser accents,
  stronger gating, and buzz.
- If Web Audio is unavailable, Bottish plays the voiced gibberish without accents.
  If system speech is unavailable, it falls back to the original procedural
  Bottish engine. Bottish never uses provider TTS or an outbound network request.
- Built-in English uses system-native speech on macOS and Windows. Audio is
  returned as WAV and is not stored as a message attachment or cache file.
- ElevenLabs is an optional BYOK English engine. The API key stays encrypted
  server-side. Prism streams provider audio and does not persist it.

Playback is sequential and audio-master: synthesized carrier duration drives text
reveal and mouth motion in Chat, Zen, Coffee, Story, previews, and replay. Sending
another message, navigating away, or changing to Mute cancels both the speech
carrier and its accents. Procedural Bottish fallback retains fitted timing.

## Privacy boundary

A persisted assistant message whose provider is LOCAL can never be sent to
ElevenLabs. If ElevenLabs is selected, Prism synthesizes that message with the
built-in engine and shows the fallback. Bottish always stays on the system-native
path in both LOCAL and ONLINE modes. Voice previews and ElevenLabs catalog loading
also require the account to be in ONLINE mode.

## Marketplace profiles

Marketplace bundles carry an authored profile. A user's later customization is
stored separately as an override, so catalog updates can improve the authored
voice without overwriting the user's choice. The five Prism Originals use
Voices 1–5 respectively at neutral controls.

## Legacy bundled-model release gate

The runtime no longer depends on the legacy KittenTTS/sherpa-onnx bundle, but
those model files remain in the repository. Any distributable that still packages
them requires explicit licensing review or removal before release approval. The
retained notices are in `THIRD_PARTY_NOTICES.md` and `apps/api/tts-models/`.
