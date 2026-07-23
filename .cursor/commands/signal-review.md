# /signal-review — Signal (botcast) code review

Review the current diff (or the files I name) with a Signal focus. Signal is the podcast simulator — internally called "botcast" — where bots perform an audio show with host cues, live captions, music, and studio placement.

## Files that shape Signal behavior

- **Shared**: `packages/shared/src/botcast.ts`, `packages/shared/src/signalPickles.ts`, `packages/shared/src/signalPersonaTemperament.ts`, `packages/shared/src/signalMusicProfile.ts`, `packages/shared/src/botIdentityMirror.ts`, `packages/shared/src/livingShellProgress.ts`, `packages/shared/src/ephemeralChat.ts`.
- **Frontend**:
  - `apps/web/src/app/BotcastExperience.tsx` — main experience entry.
  - `apps/web/src/app/botcastSpeechReveal.ts`, `apps/web/src/app/botcastDeletion.ts` — lifecycle helpers.
  - `apps/web/src/app/signalIntroAudio.ts`, `apps/web/src/app/signalVoicePerformance.ts`, `apps/web/src/app/signalStudioPlacement.ts`, `apps/web/src/app/signalHostCueTiming.ts`, `apps/web/src/app/signalLiveCaptions.ts`.

## What to check

- **Timing coherence**: host cues, speech reveal, live-caption offset, intro-audio bleed — do they stay in sync when model or network latency varies?
- **Voice coherence**: persona temperament + music profile + voice performance settings should feel like one bot, not three fighting each other.
- **Studio placement**: avatar positions and scale power should read as a real podcast studio, not a UI grid.
- **Ephemeral state**: Signal shell state is ephemeral — verify no accidental persistence into companion memory or conversation exports.
- **Botcast lifecycle**: creation → speech reveal → deletion — no orphaned rows, no leaked audio, no stuck "in progress" episodes.
- **LOCAL/ONLINE gate**: outbound calls (TTS, cover-art generation, etc.) must respect the mode gate.

## Report shape

- **Correctness**: audio/caption timing bugs, lifecycle gaps.
- **Coherence risks**: voice/temperament/music mismatch, jarring performance changes.
- **UX/vibe**: does it feel like a real podcast show?
- **Test coverage**: co-located `.test.ts` files (`botcast.test.ts`, `signal*.test.ts`, `botcast-experience.test.ts`, etc.) should track the change.
