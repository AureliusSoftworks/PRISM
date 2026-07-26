import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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
const client = readFileSync(new URL("./replayClient.ts", import.meta.url), "utf8");

describe("Signal Studio Cut contract", () => {
  it("keeps On Air as a distinct source and confirms every paid take", () => {
    assert.match(experience, /"on-air" \| "studio-cut"/u);
    assert.match(experience, /Estimated ElevenLabs use:/u);
    assert.match(experience, /canonical episode dialogue and saved ElevenLabs voice IDs/u);
    assert.match(experience, /exact On Air recording remains unchanged/u);
    assert.match(client, /confirm: "send-to-elevenlabs"/u);
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

  it("derives replay direction and mouths without thinking holds", () => {
    assert.match(mixer, /event\.kind === "thinking" \|\| event\.kind === "overlap"/u);
    assert.match(mixer, /timingByMessageId/u);
    assert.match(mixer, /mouthTracks/u);
    assert.match(mixer, /alignment\.characters/u);
  });

  it("offers retry, download, and removal while preserving the previous cut", () => {
    assert.match(experience, /Try another/u);
    assert.match(experience, /Download Studio Cut/u);
    assert.match(experience, />\s*Remove\s*</u);
    assert.match(coordinator, /resumeReplayStudioCut/u);
  });
});
