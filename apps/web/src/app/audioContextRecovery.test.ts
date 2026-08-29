import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  audioContextNeedsResume,
  installAudioContextRecoveryLifecycle,
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

class FakeEventTarget {
  readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(kind: string, listener: EventListener): void {
    const listeners = this.listeners.get(kind) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(kind, listeners);
  }

  removeEventListener(kind: string, listener: EventListener): void {
    this.listeners.get(kind)?.delete(listener);
  }

  dispatch(kind: string): void {
    for (const listener of this.listeners.get(kind) ?? []) {
      listener(new Event(kind));
    }
  }
}

class DeferredResumeAudioContext implements ResumableAudioContext {
  state: AudioContextState = "interrupted";
  resumes = 0;
  private finishResume: (() => void) | null = null;

  resume(): Promise<void> {
    this.resumes += 1;
    return new Promise((resolve) => {
      this.finishResume = () => {
        this.state = "running";
        resolve();
      };
    });
  }

  finish(): void {
    this.finishResume?.();
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

  it("recovers an existing mixer on app return and user gestures without creating one", async () => {
    const context = new FakeAudioContext("interrupted");
    const documentTarget = Object.assign(new FakeEventTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    });
    const windowTarget = new FakeEventTarget();
    const deviceTarget = new FakeEventTarget();
    let contextRequests = 0;
    const release = installAudioContextRecoveryLifecycle({
      getContext: () => {
        contextRequests += 1;
        return context;
      },
      documentTarget,
      windowTarget,
      deviceTarget,
    });
    try {
      windowTarget.dispatch("focus");
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(context.state, "running");
      assert.equal(context.resumes, 1);
      assert.ok(contextRequests > 0);

      context.state = "interrupted";
      documentTarget.dispatch("pointerdown");
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(context.state, "running");
      assert.equal(context.resumes, 2);

      context.state = "interrupted";
      deviceTarget.dispatch("devicechange");
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(context.state, "running");
      assert.equal(context.resumes, 3);

      context.state = "interrupted";
      documentTarget.visibilityState = "hidden";
      documentTarget.dispatch("visibilitychange");
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(context.resumes, 3);
    } finally {
      release();
    }
  });

  it("can recover a replacement mixer after an earlier resume settles", async () => {
    const firstContext = new DeferredResumeAudioContext();
    const replacementContext = new FakeAudioContext("interrupted");
    const documentTarget = Object.assign(new FakeEventTarget(), {
      visibilityState: "visible" as DocumentVisibilityState,
    });
    const windowTarget = new FakeEventTarget();
    let currentContext: ResumableAudioContext = firstContext;
    const release = installAudioContextRecoveryLifecycle({
      getContext: () => currentContext,
      documentTarget,
      windowTarget,
      deviceTarget: null,
    });
    try {
      windowTarget.dispatch("focus");
      currentContext = replacementContext;
      firstContext.finish();
      await new Promise((resolve) => setTimeout(resolve, 0));

      windowTarget.dispatch("focus");
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(replacementContext.state, "running");
      assert.equal(replacementContext.resumes, 1);
    } finally {
      release();
    }
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
