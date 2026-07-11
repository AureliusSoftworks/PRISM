# Voices

Prism Voices is account-wide: **Mute** (the default), **Bottish**, or
**English**. A bot owns one portable voice profile with a base voice (1–5)
plus pitch, warmth, pace, and lilt. The profile stays the same when the account
switches between Bottish and English.

## Engines

- Bottish is deterministic Web Audio chirping generated in the client.
- Built-in English uses the bundled KittenTTS Nano model through
  `sherpa-onnx-node`. Audio is generated in memory, returned as WAV, and never
  stored as a message attachment or cache file.
- ElevenLabs is an optional BYOK English engine. The API key stays encrypted
  server-side. Prism streams provider audio and does not persist it.

Playback is sequential. Sending another message, navigating away, or changing
to Mute cancels the active queue. Coffee waits for audible playback to finish
before scheduling the next autonomous bot turn. Historic assistant messages
can be replayed with the current voice profile from the message menu.

## Privacy boundary

A persisted assistant message whose provider is LOCAL can never be sent to
ElevenLabs. If ElevenLabs is selected, Prism synthesizes that message with the
built-in engine and shows the fallback. Voice previews and ElevenLabs catalog
loading also require the account to be in ONLINE mode.

## Marketplace profiles

Marketplace bundles carry an authored profile. A user's later customization is
stored separately as an override, so catalog updates can improve the authored
voice without overwriting the user's choice. The five Prism Originals use
Voices 1–5 respectively at neutral controls.

## Release gate

The bundled model is Apache-2.0, but its archive includes eSpeak NG phonemizer
data under GPL-3.0-or-later. The complete notices are retained in
`THIRD_PARTY_NOTICES.md` and `apps/api/tts-models/`; distribution must receive
an explicit licensing review before release approval.
