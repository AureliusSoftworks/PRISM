import assert from "node:assert/strict";
import { statSync } from "node:fs";
import test from "node:test";

import {
  PRISM_COMPANION_GLASS_TAP_SOURCES,
  playPrismCompanionGlassTap,
  prismCompanionGlassTapVariantIndex,
  stopPrismCompanionGlassTapAudio,
} from "./prismCompanionSfx.ts";

class FakeTapAudio {
  currentTime = 0;
  preload = "";
  volume = 1;
  playCount = 0;
  pauseCount = 0;
  readonly listeners = new Map<string, () => void>();

  addEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners.set(type, listener);
  }

  pause(): void {
    this.pauseCount += 1;
  }

  async play(): Promise<void> {
    this.playCount += 1;
  }
}

test("ships four distinct local Prism orb glass taps", () => {
  assert.equal(PRISM_COMPANION_GLASS_TAP_SOURCES.length, 4);
  assert.equal(new Set(PRISM_COMPANION_GLASS_TAP_SOURCES).size, 4);
  for (const source of PRISM_COMPANION_GLASS_TAP_SOURCES) {
    assert.match(source, /^\/audio\/prism-companion\/glass-tap-0[1-4]\.mp3$/u);
    const asset = statSync(
      new URL(`../../public${source}`, import.meta.url),
    );
    assert.ok(asset.size > 0);
  }
});

test("avoids immediately repeating a glass tap variation", () => {
  assert.equal(prismCompanionGlassTapVariantIndex(0, -1), 0);
  assert.equal(prismCompanionGlassTapVariantIndex(0, 0), 1);
  assert.equal(prismCompanionGlassTapVariantIndex(0.99, 3), 0);
  assert.equal(prismCompanionGlassTapVariantIndex(Number.NaN, -1), 0);
});

test("plays a restrained glass tap and releases it after completion", async () => {
  const audio = new FakeTapAudio();
  let source = "";
  assert.equal(
    playPrismCompanionGlassTap({
      random: () => 0.5,
      createAudio: (nextSource) => {
        source = nextSource;
        return audio;
      },
    }),
    true,
  );
  await Promise.resolve();
  assert.equal(source, "/audio/prism-companion/glass-tap-03.mp3");
  assert.equal(audio.preload, "auto");
  assert.equal(audio.volume, 0.42);
  assert.equal(audio.playCount, 1);
  audio.listeners.get("ended")?.();
  assert.equal(audio.pauseCount, 1);
  assert.equal(audio.currentTime, 0);
});

test("can stop active orb taps during teardown", () => {
  const audio = new FakeTapAudio();
  playPrismCompanionGlassTap({
    random: () => 0.75,
    createAudio: () => audio,
  });
  stopPrismCompanionGlassTapAudio();
  assert.equal(audio.pauseCount, 1);
  assert.equal(audio.currentTime, 0);
});
