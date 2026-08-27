import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  audioContextNeedsResume,
  resumeAudioContextIfNeeded,
  type ResumableAudioContext,
} from "./audioContextRecovery.ts";

class FakeAudioContext implements ResumableAudioContext {
  state: AudioContextState;
  resumes = 0;
  private readonly resumeSucceeds: boolean;

  constructor(state: AudioContextState, resumeSucceeds = true) {
    this.state = state;
    this.resumeSucceeds = resumeSucceeds;
  }

  async resume(): Promise<void> {
    this.resumes += 1;
    if (!this.resumeSucceeds) throw new Error("resume blocked");
    this.state = "running";
  }
}

describe("AudioContext recovery", () => {
  it("recognizes suspended and interrupted contexts as resumable", () => {
    assert.equal(audioContextNeedsResume({ state: "suspended" }), true);
    assert.equal(audioContextNeedsResume({ state: "interrupted" }), true);
    assert.equal(audioContextNeedsResume({ state: "running" }), false);
    assert.equal(audioContextNeedsResume({ state: "closed" }), false);
  });

  it("resumes an interrupted context", async () => {
    const context = new FakeAudioContext("interrupted");
    assert.equal(await resumeAudioContextIfNeeded(context), true);
    assert.equal(context.resumes, 1);
    assert.equal(context.state, "running");
  });

  it("does not resume a closed context", async () => {
    const context = new FakeAudioContext("closed");
    assert.equal(await resumeAudioContextIfNeeded(context), false);
    assert.equal(context.resumes, 0);
  });

  it("reports a blocked recovery without throwing", async () => {
    const context = new FakeAudioContext("interrupted", false);
    assert.equal(await resumeAudioContextIfNeeded(context), false);
    assert.equal(context.state, "interrupted");
  });

  it("is shared by the app audio engines that previously handled only suspended contexts", () => {
    const consumers = [
      "spatialUiSfx.ts",
      "replayAudioMasterCapture.ts",
      "session-atmosphere-audio.ts",
      "coffee-foley.ts",
      "coffee-player-voice.ts",
      "botAvatarSfx.ts",
    ];
    for (const consumer of consumers) {
      const source = readFileSync(new URL(consumer, import.meta.url), "utf8");
      assert.match(
        source,
        /audioContextNeedsResume|resumeAudioContextIfNeeded/u,
        consumer,
      );
      assert.doesNotMatch(source, /\.state === "suspended"/u, consumer);
    }
    const spatialUi = readFileSync(
      new URL("spatialUiSfx.ts", import.meta.url),
      "utf8",
    );
    assert.match(spatialUi, /ensurePrismAudioContextRunning\(\)/u);
    assert.match(spatialUi, /addEventListener\("visibilitychange", unlock\)/u);
    assert.match(spatialUi, /addEventListener\("focus", unlock\)/u);
  });
});
