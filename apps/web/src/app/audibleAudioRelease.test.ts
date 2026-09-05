import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  audibleAudioTransitionVolumeAt,
  cancelAudibleAudioRelease,
  releaseAudibleAudioElement,
  teardownSilentMediaElementImmediately,
} from "./audibleAudioRelease.ts";

function fakeMedia(paused = false, volume = 1) {
  return {
    paused,
    volume,
    currentTime: 4,
    pauses: 0,
    loads: 0,
    removed: [] as string[],
    pause() { this.pauses += 1; this.paused = true; },
    load() { this.loads += 1; },
    removeAttribute(name: string) { this.removed.push(name); },
  };
}

describe("audible applet audio release", () => {
  it("eases both mute and unmute transitions without a gain snap", () => {
    assert.equal(audibleAudioTransitionVolumeAt(0.8, 0, 0), 0.8);
    assert.equal(audibleAudioTransitionVolumeAt(0.8, 0, 1), 0);
    assert.equal(audibleAudioTransitionVolumeAt(0, 0.8, 0), 0);
    assert.equal(audibleAudioTransitionVolumeAt(0, 0.8, 1), 0.8);
    assert.ok(audibleAudioTransitionVolumeAt(0.8, 0, 0.5) > 0);
    assert.ok(audibleAudioTransitionVolumeAt(0, 0.8, 0.5) < 0.8);
  });

  it("keeps audible media playing until an equal-power fade completes", async () => {
    const media = fakeMedia();
    let clock = 0;
    const pending: Array<() => void> = [];
    const released = releaseAudibleAudioElement(
      media as unknown as HTMLMediaElement,
      {
        durationMs: 160,
        now: () => clock,
        schedule: (callback) => { pending.push(callback); return 1; },
        cancel: () => undefined,
        clearSource: true,
      },
    );
    assert.equal(media.pauses, 0);
    clock = 80;
    pending.shift()?.();
    assert.ok(media.volume > 0 && media.volume < 1);
    assert.equal(media.pauses, 0);
    clock = 160;
    pending.shift()?.();
    await released;
    assert.equal(media.pauses, 1);
    assert.deepEqual(media.removed, ["src"]);
    assert.equal(media.loads, 1);
  });

  it("tears down prepared silent media immediately", () => {
    const media = fakeMedia(true, 0);
    teardownSilentMediaElementImmediately(
      media as unknown as HTMLMediaElement,
      { resetTime: true, clearSource: true },
    );
    assert.equal(media.pauses, 1);
    assert.equal(media.currentTime, 0);
    assert.equal(media.loads, 1);
  });

  it("can revive the same element before a detached fade completes", async () => {
    const media = fakeMedia();
    const pending: Array<() => void> = [];
    const released = releaseAudibleAudioElement(
      media as unknown as HTMLMediaElement,
      { schedule: (callback) => { pending.push(callback); return 1; } },
    );
    cancelAudibleAudioRelease(media as unknown as HTMLMediaElement, 0.7);
    await released;
    assert.equal(media.pauses, 0);
    assert.equal(media.volume, 0.7);
    pending.shift()?.();
    assert.equal(media.pauses, 0);
  });
});
