# Coffee foley integration notes (for page.tsx wiring)

`coffee-foley.ts` is self-contained: seeded scheduling core + procedural
WebAudio synthesis, no assets, no fetches, no rAF. The local session wires it
into page.tsx as follows.

## Engine lifecycle

- Create once when the Coffee phase enters `live`:
  `createCoffeeFoleyEngine({ seed: `coffee:${conversationId}` })`.
  Using the conversation/group id as seed makes a table sound the same on
  rejoin. Keep the engine in a ref; call `dispose()` on scene teardown or when
  leaving the Coffee lane.
- Do NOT run the engine during replay viewing. Foley routes through
  `prismAudioOutputNode`, so live cues are already baked into the faithful
  audio master; running it during replay would double the foley.

## Events to feed (`handleTableEvent`)

| page.tsx moment                                            | event          |
| ---------------------------------------------------------- | -------------- |
| a bot voice line actually starts playing (speech onset)    | `turnStart`    |
| that voice line finishes or is cancelled                   | `turnEnd`      |
| drink/sip reactions (playerCup, drinkReactionStatus)       | `sip`          |
| a bot seat joins the table (visit start)                   | `arrival`      |
| a bot seat leaves (farewell resolved)                      | `departure`    |
| reaction/crosstalk lane speaks                             | `crosstalk`    |
| composer keystroke burst (throttle to one per ~2s)         | `playerTyping` |
| idle ticker (below)                                        | `idleLullTick` |

Idle ticker: a plain `setInterval` of ~2s while phase === "live" and no voice
line is active is enough — the core itself enforces the 9s murmur idle gap and
all spacing, so over-feeding ticks is safe. Clear the interval on teardown.
No new rAF loops; the engine only uses setTimeout + AudioContext scheduling.

## Ducking

Call `setForegroundSpeechActive(true/false)` from the exact same seam that
flips `foregroundVoiceActive` for `coffeeShopEnvironmentMix` (jazz/room-tone
ducking). This dips the whole foley bus by -8 dB while any voice line plays
and restores it afterward. Feed `turnStart`/`turnEnd` at the same moments.

## Master gain

- Default is `COFFEE_FOLEY_DEFAULT_MASTER_GAIN` (modest; felt, not noticed).
- Tie `setMasterGain(v)` to the same atmosphere volume control that scales
  the Coffee Jazz / room-tone beds, so one slider governs all table ambience.
- When voice mode is mute or atmosphere volume is 0, call `setMasterGain(0)`
  instead of withholding events — scheduler state stays warm and consistent.

## Replay / capture considerations

- Cues route through `prismAudioOutputNode` (world bus): they are captured
  into faithful audio masters and obey the shared master volume. This is
  intentional — unlike the jazz/room-tone beds, which use the local-only bus.
- If a table should ever exclude foley from masters, that is a routing change
  in `coffee-foley.ts` (swap to `prismLocalOnlyAudioOutputNode`), not a
  page.tsx concern.
- The engine is SSR-safe: without an AudioContext every cue is a silent no-op,
  and scheduling decisions remain deterministic for the seed.
