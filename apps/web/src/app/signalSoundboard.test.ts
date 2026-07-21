import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotcastReplayEvent } from "@localai/shared";
import {
  SIGNAL_SOUNDBOARD_CUES,
  playSignalSoundboardCue,
  signalSoundboardEventsBetween,
  stopSignalSoundboardAudio,
} from "./signalSoundboard.ts";

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
  it("ships four local broadcast reactions at restrained mix levels", () => {
    assert.deepEqual(
      SIGNAL_SOUNDBOARD_CUES.map((cue) => cue.kind),
      ["applause", "laughter", "gasp", "rimshot"],
    );
    for (const cue of SIGNAL_SOUNDBOARD_CUES) {
      assert.match(cue.src, /^\/audio\/signal\/soundboard\/.+\.mp3$/u);
      assert.ok(cue.volume >= 0.5 && cue.volume <= 0.75);
    }
  });

  it("plays from the originating click and releases finished audio", async () => {
    const audio = new FakeSoundboardAudio();
    assert.equal(playSignalSoundboardCue("applause", () => audio), true);
    await Promise.resolve();
    assert.equal(audio.playCount, 1);
    assert.equal(audio.preload, "auto");
    assert.equal(audio.volume, 0.58);
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
        { eventId: "event-1", kind: "applause", atMs: 1_000 },
        { eventId: "event-2", kind: "laughter", atMs: 2_500 },
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

  it("can release active clips immediately for deterministic teardown", async () => {
    const audio = new FakeSoundboardAudio();
    playSignalSoundboardCue("rimshot", () => audio);
    await Promise.resolve();
    stopSignalSoundboardAudio(0);
    assert.equal(audio.paused, true);
    assert.equal(audio.currentTime, 0);
  });
});
