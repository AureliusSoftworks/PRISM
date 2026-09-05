import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  playSignalEpisodeImageFoley,
  signalEpisodeImageFoleyPlan,
  signalEpisodeImageFoleyTransition,
  type SignalEpisodeImageFoleyPresentation,
} from "./signalEpisodeImageFoley.ts";

class FakeImageFoleyAudio {
  currentTime = 0;
  paused = true;
  preload = "";
  volume = 1;
  playCount = 0;
  readonly listeners = new Map<string, () => void>();

  addEventListener(type: "ended" | "error", listener: () => void): void {
    this.listeners.set(type, listener);
  }

  pause(): void {
    this.paused = true;
  }

  async play(): Promise<void> {
    this.paused = false;
    this.playCount += 1;
  }
}

const picture: SignalEpisodeImageFoleyPresentation = {
  episodeId: "episode-1",
  imageId: "image-1",
  kind: "picture",
};
const item: SignalEpisodeImageFoleyPresentation = {
  episodeId: "episode-1",
  imageId: "image-2",
  kind: "item",
};

describe("Signal episode image Foley", () => {
  it("tracks the live visible table state and routes playback into capture", () => {
    const experienceSource = readFileSync(
      new URL("./BotcastExperience.tsx", import.meta.url),
      "utf8",
    );
    const playerSource = readFileSync(
      new URL("./signalEpisodeImageFoley.ts", import.meta.url),
      "utf8",
    );
    assert.match(experienceSource, /episode\?\.status === "live"/u);
    assert.match(experienceSource, /signalEpisodeImageFoleyTransition\(/u);
    assert.match(experienceSource, /playSignalEpisodeImageFoley\(/u);
    assert.match(experienceSource, /replay: false/u);
    assert.match(playerSource, /routeAudioElementToPrismOutput\(/u);
    assert.match(playerSource, /replayAudioMasterCaptureActive\(\)/u);
  });

  it("uses paper for pictures and a solid wood impact for items", () => {
    assert.equal(
      signalEpisodeImageFoleyPlan("picture", "place").src,
      "/audio/debate/desk-paper-place-01.mp3",
    );
    assert.equal(
      signalEpisodeImageFoleyPlan("picture", "remove").src,
      "/audio/debate/desk-paper-pickup-01.mp3",
    );
    assert.equal(
      signalEpisodeImageFoleyPlan("item", "place").src,
      "/audio/debate/exhibits/impact-wood.mp3",
    );
    assert.equal(
      signalEpisodeImageFoleyPlan("item", "remove").src,
      "/audio/debate/exhibits/impact-wood.mp3",
    );
  });

  it("makes each removal exactly half its corresponding placement gain", () => {
    for (const kind of ["picture", "item"] as const) {
      const placement = signalEpisodeImageFoleyPlan(kind, "place");
      const removal = signalEpisodeImageFoleyPlan(kind, "remove");
      assert.equal(removal.gain, placement.gain * 0.5);
    }
  });

  it("fires only when the visible table presentation changes", () => {
    assert.deepEqual(signalEpisodeImageFoleyTransition(null, picture), [
      signalEpisodeImageFoleyPlan("picture", "place"),
    ]);
    assert.deepEqual(signalEpisodeImageFoleyTransition(picture, picture), []);
    assert.deepEqual(signalEpisodeImageFoleyTransition(picture, null), [
      signalEpisodeImageFoleyPlan("picture", "remove"),
    ]);
  });

  it("represents an in-place asset swap as removal followed by placement", () => {
    assert.deepEqual(signalEpisodeImageFoleyTransition(picture, item), [
      signalEpisodeImageFoleyPlan("picture", "remove"),
      signalEpisodeImageFoleyPlan("item", "place"),
    ]);
  });

  it("applies the global audio level without changing the removal ratio", async () => {
    const audio = new FakeImageFoleyAudio();
    const plan = signalEpisodeImageFoleyPlan("item", "remove");
    assert.equal(
      playSignalEpisodeImageFoley(plan, {
        masterVolume: 0.5,
        createAudio: () => audio,
      }),
      true,
    );
    await Promise.resolve();
    assert.equal(audio.preload, "auto");
    assert.equal(audio.volume, plan.gain * 0.5);
    assert.equal(audio.playCount, 1);
  });
});
