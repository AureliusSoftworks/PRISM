import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BotcastReplayEvent } from "@localai/shared";
import {
  SIGNAL_SOUNDBOARD_CUES,
  playSignalSoundboardCue,
  signalSoundboardEventsBetween,
  signalSoundboardNextVariantIndex,
  signalSoundboardPlaybackPlan,
  stopSignalSoundboardAudio,
} from "./signalSoundboard.ts";
import type { SessionAtmosphereFoleyPlaybackOptions } from "./session-atmosphere-audio.ts";

class FakeSoundboardAudio {
  currentTime = 0;
  paused = true;
  playbackRate = 1;
  preservesPitch = true;
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
  it("ships four local broadcast reactions with four room-mix variations each", () => {
    assert.deepEqual(
      SIGNAL_SOUNDBOARD_CUES.map((cue) => cue.kind),
      ["applause", "laughter", "gasp", "rimshot"],
    );
    for (const cue of SIGNAL_SOUNDBOARD_CUES) {
      assert.ok(cue.sources.length >= 1);
      assert.match(cue.sources[0]!, /^\/audio\/signal\/soundboard\/.+\.mp3$/u);
      const plans = [0, 1, 2, 3].map((index) =>
        signalSoundboardPlaybackPlan(cue.kind, index),
      );
      assert.ok(plans.every((plan) => plan && plan.trim <= 0.21));
      assert.equal(new Set(plans.map((plan) => plan?.playbackRate)).size, 4);
    }
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
    assert.equal(audio.playbackRate, 0.97);
    assert.equal(audio.preservesPitch, false);
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

  it("cycles variants per cue kind and preserves that choice during replay", () => {
    const events = [
      soundboardEvent("event-1", "applause", 1_000),
      soundboardEvent("event-2", "gasp", 1_500),
      soundboardEvent("event-3", "applause", 2_000),
    ];
    assert.equal(signalSoundboardNextVariantIndex(events, "applause"), 2);
    assert.equal(signalSoundboardNextVariantIndex(events, "gasp"), 1);
    assert.deepEqual(
      signalSoundboardEventsBetween({
        events,
        previousElapsedMs: 1_700,
        elapsedMs: 2_100,
      }),
      [
        { eventId: "event-3", kind: "applause", atMs: 2_000, variantIndex: 1 },
      ],
    );
  });

  it("plays through the studio foley bus with room-friendly treatment", () => {
    let played:
      | { url: string; options?: SessionAtmosphereFoleyPlaybackOptions }
      | undefined;
    const studioController = {
      playFoley(
        url: string,
        options?: SessionAtmosphereFoleyPlaybackOptions,
      ): boolean {
        played = { url, options };
        return true;
      },
      stopFoley(): void {},
    };
    assert.equal(
      playSignalSoundboardCue("laughter", {
        variantIndex: 2,
        studioController,
      }),
      true,
    );
    assert.equal(played?.url, "/audio/signal/soundboard/laughter.mp3");
    assert.equal(played?.options?.tag, "signal-soundboard");
    assert.equal(played?.options?.trim, 0.21);
    assert.ok((played?.options?.highCutHz ?? Infinity) <= 4_200);
  });

  it("can release active clips immediately for deterministic teardown", async () => {
    const audio = new FakeSoundboardAudio();
    let stoppedTag = "";
    playSignalSoundboardCue("rimshot", { createAudio: () => audio });
    await Promise.resolve();
    stopSignalSoundboardAudio(0, {
      playFoley: () => true,
      stopFoley: (tag) => {
        stoppedTag = tag;
      },
    });
    assert.equal(audio.paused, true);
    assert.equal(audio.currentTime, 0);
    assert.equal(stoppedTag, "signal-soundboard");
  });
});
