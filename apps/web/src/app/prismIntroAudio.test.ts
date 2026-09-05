import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { describe, it } from "node:test";

import { PRISM_INTRO_SCENES } from "./prismIntroSequenceData.ts";
import {
  PRISM_INTRO_MUSIC,
  PRISM_INTRO_SCENE_AUDIO,
  createPrismIntroAudioController,
  prismIntroAudioFadeVolumeAt,
} from "./prismIntroAudio.ts";

class FakeIntroAudio {
  src: string;
  currentTime = 0;
  loop = false;
  paused = true;
  preload = "";
  volume = 1;
  playCount = 0;
  pauseCount = 0;
  loadCount = 0;
  rejectPlay = false;
  readonly listeners = new Map<string, () => void>();

  constructor(src: string) {
    this.src = src;
  }

  addEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners.set(type, listener);
  }

  load(): void {
    this.loadCount += 1;
  }

  pause(): void {
    this.paused = true;
    this.pauseCount += 1;
  }

  async play(): Promise<void> {
    this.playCount += 1;
    if (this.rejectPlay) throw new Error("autoplay blocked");
    this.paused = false;
  }

  removeAttribute(name: "src"): void {
    if (name === "src") this.src = "";
  }
}

describe("PRISM intro audio", () => {
  it("maps one local cue to every intro scene and ships every approved asset", () => {
    assert.deepEqual(
      Object.keys(PRISM_INTRO_SCENE_AUDIO),
      PRISM_INTRO_SCENES.map((scene) => scene.id),
    );
    for (const cue of [
      PRISM_INTRO_MUSIC,
      ...Object.values(PRISM_INTRO_SCENE_AUDIO),
    ]) {
      assert.match(cue.src, /^\/audio\/prism-intro\/.+\.mp3$/u);
      assert.ok(cue.volume > 0 && cue.volume <= 1);
      const assetUrl = new URL(`../../public${cue.src}`, import.meta.url);
      assert.ok(statSync(assetUrl).size > 50_000);
    }
    assert.equal(PRISM_INTRO_SCENE_AUDIO.refraction.volume, 1);
    assert.ok(PRISM_INTRO_SCENE_AUDIO.invitation.volume < 0.05);
  });

  it("loops the music, replaces scene cues, and releases every audible slot", async () => {
    const created: FakeIntroAudio[] = [];
    const states: string[] = [];
    const controller = createPrismIntroAudioController({
      createAudio: (src) => {
        const audio = new FakeIntroAudio(src);
        created.push(audio);
        return audio;
      },
      onPlaybackStateChange: (state) => states.push(state),
      releaseMs: 0,
      sceneReleaseMs: 0,
    });

    controller.start("border");
    await Promise.resolve();
    assert.equal(created.length, 2);
    assert.equal(created[0]!.src, PRISM_INTRO_MUSIC.src);
    assert.equal(created[0]!.loop, true);
    assert.equal(created[0]!.volume, PRISM_INTRO_MUSIC.volume);
    assert.equal(created[1]!.src, PRISM_INTRO_SCENE_AUDIO.border.src);
    assert.equal(created[1]!.loop, false);
    assert.equal(states.at(-1), "playing");

    controller.showScene("threshold");
    await Promise.resolve();
    assert.equal(created.length, 3);
    assert.equal(created[1]!.paused, true);
    assert.equal(created[1]!.src, "");
    assert.equal(created[2]!.src, PRISM_INTRO_SCENE_AUDIO.threshold.src);

    controller.setEnabled(false, "threshold");
    assert.equal(created[0]!.paused, true);
    assert.equal(created[2]!.paused, true);
    assert.equal(states.at(-1), "muted");

    controller.setEnabled(true, "threshold");
    await Promise.resolve();
    assert.equal(created.length, 5);
    assert.equal(states.at(-1), "playing");
    controller.release();
    assert.equal(created[3]!.paused, true);
    assert.equal(created[4]!.paused, true);
  });

  it("surfaces blocked autoplay and retries from a player gesture", async () => {
    const created: FakeIntroAudio[] = [];
    const states: string[] = [];
    const controller = createPrismIntroAudioController({
      createAudio: (src) => {
        const audio = new FakeIntroAudio(src);
        audio.rejectPlay = true;
        created.push(audio);
        return audio;
      },
      onPlaybackStateChange: (state) => states.push(state),
      releaseMs: 0,
      sceneReleaseMs: 0,
    });

    controller.start("border");
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(states.at(-1), "blocked");
    created.forEach((audio) => {
      audio.rejectPlay = false;
    });
    controller.resume("border");
    await Promise.resolve();
    assert.equal(states.at(-1), "playing");
    assert.ok(created.every((audio) => audio.playCount === 2));
  });

  it("uses an equal-power release curve instead of a hard stop", () => {
    assert.equal(prismIntroAudioFadeVolumeAt(0.8, 0), 0.8);
    assert.ok(prismIntroAudioFadeVolumeAt(0.8, 0.5) > 0.5);
    assert.ok(prismIntroAudioFadeVolumeAt(0.8, 1) < 0.000_001);
  });
});
