import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { compactSignalStudioCutMouthCues } from "./signalStudioCutMouth.ts";

const experience = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const coordinator = readFileSync(
  new URL("./ReplayRenderCoordinator.tsx", import.meta.url),
  "utf8",
);
const mixer = readFileSync(
  new URL("./signalStudioCutAudio.ts", import.meta.url),
  "utf8",
);
const voiceEffects = readFileSync(
  new URL("./voiceEffects.ts", import.meta.url),
  "utf8",
);
const client = readFileSync(new URL("./replayClient.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Signal Premium audio contract", () => {
  it("emits Replay V2-valid direction and mouth-track sequences", () => {
    assert.match(
      mixer,
      /\.map\(\(event, sequence\) => \(\{ \.\.\.event, sequence: sequence \+ 1 \}\)\)/u,
    );
    assert.deepEqual(
      compactSignalStudioCutMouthCues([
        { atMs: 100, shape: "open-small" },
        { atMs: 120, shape: "open-small" },
        { atMs: 140, shape: "closed" },
        { atMs: 160, shape: "closed" },
        { atMs: 180, shape: "open-wide" },
      ]),
      [
        { atMs: 100, shape: "open-small" },
        { atMs: 140, shape: "closed" },
        { atMs: 180, shape: "open-wide" },
      ],
    );
  });

  it("keeps the original broadcast distinct and confirms selective paid work", () => {
    assert.match(experience, /"on-air" \| "studio-cut"/u);
    assert.match(experience, /Premium audio ·/u);
    assert.match(experience, /Repair voice/u);
    assert.match(experience, /Upgrade voices/u);
    assert.match(experience, /Original broadcast/u);
    assert.match(experience, /role="menu" aria-label="Choose replay version"/u);
    assert.doesNotMatch(experience, /replaySourceToggle/u);
    assert.match(experience, /aria-busy=\{studioCutBusy\}/u);
    assert.doesNotMatch(experience, /window\.confirm\(/u);
    assert.match(experience, /role="alertdialog"[\s\S]*signal-studio-cut-title/u);
    assert.match(experience, /confirmStudioCut\(\)/u);
    assert.match(experience, /confirmRemoveStudioCut\(\)/u);
    assert.match(experience, /Estimated ElevenLabs use:/u);
    assert.match(
      experience,
      /sends only the lines being/u,
    );
    assert.match(experience, /exact original broadcast remains unchanged/u);
    assert.match(client, /confirm: "send-to-elevenlabs"/u);
    assert.match(client, /intent,/u);
  });

  it("freezes every audible on-air line and its resolved voice audio", () => {
    assert.match(
      page,
      /const replayVoiceTakePromise = captureReplayVoiceTake\(\{[\s\S]{0,180}sourceId: message\.episodeId/u,
    );
    assert.match(page, /sourceMessageId: message\.id/u);
    assert.match(page, /profile: playbackProfile/u);
    assert.match(
      page,
      /storeCapturedReplayVoiceAudio\(\{[\s\S]{0,220}resolvedEngine: resolvedClip\.engineUsed/u,
    );
    assert.match(
      page,
      /updateCapturedReplayVoiceTake\(replayVoiceTakePromise,[\s\S]{0,120}durationMs,[\s\S]{0,80}alignment/u,
    );
  });

  it("runs the mix globally in bounded windows and streams Opus chunks", () => {
    assert.match(coordinator, /mixing_episode/u);
    assert.match(coordinator, /encodeReplayAudioWindows/u);
    assert.match(mixer, /const windowMs = 8_000/u);
    assert.doesNotMatch(mixer, /new OfflineAudioContext\([^,\n]+,\s*durationMs/u);
    assert.match(
      coordinator,
      /studio-cut\/mix\/audio-chunk/u,
    );
  });

  it("reapplies saved per-line voice processing and production mix layers", () => {
    assert.match(coordinator, /claim\.takes/u);
    assert.match(mixer, /primaryTakeByMessageId/u);
    assert.match(mixer, /generatedSourceByMessageId/u);
    assert.match(mixer, /capturedTakeBuffer\(take\)/u);
    assert.match(mixer, /take\.snapshot\.resolvedEngine !== "elevenlabs"/u);
    assert.match(mixer, /renderOfflineVoiceTake\(\{[\s\S]*profile: take\.snapshot\.profile/u);
    assert.match(mixer, /moodKey: take\.snapshot\.moodKey/u);
    assert.match(mixer, /effectsEnabled: take\.snapshot\.effectsEnabled/u);
    assert.match(mixer, /gain: take\.snapshot\.gain/u);
    assert.match(mixer, /stereoPan: take\.snapshot\.stereoPan/u);
    assert.match(mixer, /SIGNAL_STUDIO_VOICE_ROOM_SEND/u);
    assert.match(mixer, /SIGNAL_STUDIO_FOLEY_ROOM_SEND/u);
    assert.match(mixer, /synthesizeSignalActionSfxDirection/u);
    assert.match(mixer, /directionWithActionFoley/u);
    assert.match(mixer, /resolvePreSpeechBreathPlan/u);
    assert.match(mixer, /sessionAtmosphereBusVolume/u);
    assert.match(voiceEffects, /applyVoiceDeliveryMoodToProfile/u);
    assert.match(voiceEffects, /resolveVoicePlaybackTransform/u);
    assert.match(voiceEffects, /resolveVoiceEffectPlan/u);
    assert.match(voiceEffects, /FormantCorrectionNode/u);
  });

  it("derives replay direction and mouths without thinking holds", () => {
    assert.match(mixer, /event\.kind === "thinking" \|\| event\.kind === "overlap"/u);
    assert.match(mixer, /timingByMessageId/u);
    assert.match(mixer, /mouthTracks/u);
    assert.match(mixer, /alignment\.characters/u);
  });

  it("offers one contextual retry and keeps version actions compact", () => {
    assert.doesNotMatch(experience, /New Studio Cut/u);
    assert.doesNotMatch(experience, /Remix cut/u);
    assert.doesNotMatch(experience, /Create Studio Cut/u);
    assert.match(experience, /retryReplayStudioCutMix/u);
    assert.match(experience, /Retry repair/u);
    assert.match(experience, /Retry upgrade/u);
    assert.match(experience, /Download audio/u);
    assert.match(experience, /replayActiveDownloadUrl/u);
    assert.match(experience, /Remove Premium version/u);
    assert.match(experience, /premiumAutoSelectionRef/u);
    assert.match(coordinator, /resumeReplayStudioCut/u);
  });
});
