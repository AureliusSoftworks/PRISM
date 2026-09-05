import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { BotcastReplayEvent } from "@localai/shared";
import {
  SIGNAL_SOUNDBOARD_CATEGORY_TRIMS,
  SIGNAL_SOUNDBOARD_CUES,
  SIGNAL_SOUNDBOARD_GROUP_BUS,
  playSignalSoundboardCue,
  signalSoundboardEventsBetween,
  signalSoundboardNextVariantIndex,
  signalSoundboardPlaybackPlan,
  stopSignalSoundboardAudio,
} from "./signalSoundboard.ts";

const source = readFileSync(new URL("./signalSoundboard.ts", import.meta.url), "utf8");

class FakeSoundboardAudio {
  currentTime = 0;
  paused = true;
  preload = "";
  volume = 1;
  playCount = 0;
  pauseCount = 0;
  readonly listeners = new Map<string, () => void>();

  addEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners.set(type, listener);
  }

  pause(): void {
    this.paused = true;
    this.pauseCount += 1;
  }

  async play(): Promise<void> {
    this.paused = false;
    this.playCount += 1;
  }
}

function soundboardEvent(
  id: string,
  kind: string,
  atMs: number,
): BotcastReplayEvent {
  return {
    id,
    episodeId: "episode-1",
    sequence: Number(id.replace(/\D/gu, "")) || 1,
    kind: "soundboard_cue",
    payload: { kind, atMs, source: "producer" },
    occurredAt: "2026-07-21T00:00:00.000Z",
  };
}

describe("Signal soundboard", () => {
  it("ships four local broadcast reactions with fixed category trims", () => {
    assert.deepEqual(
      SIGNAL_SOUNDBOARD_CUES.map((cue) => cue.kind),
      ["applause", "laughter", "gasp", "rimshot"],
    );
    assert.deepEqual(
      SIGNAL_SOUNDBOARD_CUES.map((cue) => cue.label),
      ["Applause", "Laughter", "Gasp", "Rimshot"],
    );
    for (const cue of SIGNAL_SOUNDBOARD_CUES) {
      assert.ok(cue.sources.length >= 1);
      assert.match(cue.sources[0]!, /^\/audio\/signal\/soundboard\/.+\.mp3$/u);
      const plan = signalSoundboardPlaybackPlan(cue.kind, 3);
      assert.equal(plan?.variantIndex, 0);
      assert.equal(plan?.trim, SIGNAL_SOUNDBOARD_CATEGORY_TRIMS[cue.kind]);
    }
  });

  it("keeps every hit on one fixed-EQ, compressed, recordable group with one room send", () => {
    assert.equal(SIGNAL_SOUNDBOARD_GROUP_BUS.highPassHz, 130);
    assert.equal(SIGNAL_SOUNDBOARD_GROUP_BUS.lowPassHz, 3_600);
    assert.equal(SIGNAL_SOUNDBOARD_GROUP_BUS.compressor.ratio, 4);
    assert.equal(
      SIGNAL_SOUNDBOARD_GROUP_BUS.roomSend.profile.id,
      "signal-intimate-treated-studio-v1",
    );
    assert.equal(SIGNAL_SOUNDBOARD_GROUP_BUS.roomSend.wet, 0.1);
    assert.match(source, /createMediaElementSource[\s\S]{0,120}source\.connect\(group\.input\)/u);
    assert.match(source, /connectRoomAcoustics\([\s\S]{0,180}destination: prismAudioOutputNode\(context\)/u);
    assert.doesNotMatch(source, /playbackRate|stereoPan/u);
  });

  it("plays from the originating click and releases finished audio", async () => {
    const audio = new FakeSoundboardAudio();
    assert.equal(
      playSignalSoundboardCue("applause", { createAudio: () => audio }),
      true,
    );
    await Promise.resolve();
    assert.equal(audio.playCount, 1);
    assert.equal(audio.preload, "auto");
    assert.equal(audio.volume, 0.16);
    audio.listeners.get("ended")?.();
    assert.equal(audio.pauseCount, 1);
    assert.equal(audio.currentTime, 0);
  });

  it("selects only valid saved cues crossed by the replay clock", () => {
    const events = [
      soundboardEvent("event-1", "applause", 1_000),
      soundboardEvent("event-2", "laughter", 2_500),
      soundboardEvent("event-3", "unknown", 2_700),
    ];
    assert.deepEqual(
      signalSoundboardEventsBetween({
        events,
        previousElapsedMs: 900,
        elapsedMs: 2_600,
      }),
      [
        { eventId: "event-1", kind: "applause", atMs: 1_000, variantIndex: 0 },
        { eventId: "event-2", kind: "laughter", atMs: 2_500, variantIndex: 0 },
      ],
    );
    assert.deepEqual(
      signalSoundboardEventsBetween({
        events,
        previousElapsedMs: 2_600,
        elapsedMs: 900,
      }),
      [],
    );
  });

  it("keeps future source-bank selection replay-stable without changing DSP identity", () => {
    const events = [
      soundboardEvent("event-1", "applause", 1_000),
      soundboardEvent("event-2", "gasp", 1_500),
      soundboardEvent("event-3", "applause", 2_000),
    ];
    assert.equal(signalSoundboardNextVariantIndex(events, "applause"), 0);
    assert.equal(signalSoundboardNextVariantIndex(events, "gasp"), 0);
    assert.deepEqual(
      signalSoundboardEventsBetween({
        events,
        previousElapsedMs: 1_700,
        elapsedMs: 2_100,
      }),
      [
        { eventId: "event-3", kind: "applause", atMs: 2_000, variantIndex: 0 },
      ],
    );
  });

  it("can release active clips immediately for deterministic teardown", async () => {
    const audio = new FakeSoundboardAudio();
    playSignalSoundboardCue("rimshot", { createAudio: () => audio });
    await Promise.resolve();
    stopSignalSoundboardAudio(0);
    assert.equal(audio.paused, true);
    assert.equal(audio.currentTime, 0);
  });
});
