import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveBotFaceGazeFrame } from "./botFaceEyeMovement.ts";

describe("natural bot eye movement", () => {
  it("is deterministic at a replay timestamp and after seeking", () => {
    const args = {
      seed: "episode:bot-a",
      timelineMs: 42_500,
      stateStartedAtMs: 40_000,
      state: "listening" as const,
      targetDirection: -1 as const,
    };
    assert.deepEqual(resolveBotFaceGazeFrame(args), resolveBotFaceGazeFrame(args));
  });

  it("stays inside the restrained motion envelope", () => {
    for (const state of ["idle", "listening", "speaking", "thinking"] as const) {
      for (let timelineMs = 0; timelineMs < 180_000; timelineMs += 997) {
        const frame = resolveBotFaceGazeFrame({
          seed: "bounds",
          timelineMs,
          state,
          targetDirection: 1,
        });
        assert.ok(frame.xPx >= -4 && frame.xPx <= 4);
        assert.ok(frame.yPx >= -2 && frame.yPx <= 2);
        assert.ok(frame.transitionMs >= 180 && frame.transitionMs <= 260);
      }
    }
  });

  it("biases listeners toward the conversational target", () => {
    const left = resolveBotFaceGazeFrame({
      seed: "listener",
      timelineMs: 8_000,
      state: "listening",
      targetDirection: -1,
    });
    const right = resolveBotFaceGazeFrame({
      seed: "listener",
      timelineMs: 8_000,
      state: "listening",
      targetDirection: 1,
    });
    assert.ok(left.xPx < 0);
    assert.ok(right.xPx > 0);
  });

  it("keeps thinking gazes above center", () => {
    const frame = resolveBotFaceGazeFrame({
      seed: "thinker",
      timelineMs: 5_000,
      state: "thinking",
    });
    assert.ok(frame.yPx < 0);
  });

  it("composes gaze separately and keeps blink and reduced motion snap-safe", () => {
    const appDir = resolve(process.cwd(), "src/app");
    const css = readFileSync(resolve(appDir, "page.module.css"), "utf8");
    const renderer = readFileSync(
      resolve(appDir, "CoffeeSeatPlateEmoji.tsx"),
      "utf8",
    );
    const page = readFileSync(resolve(appDir, "page.tsx"), "utf8");
    const signal = readFileSync(
      resolve(appDir, "BotcastExperience.tsx"),
      "utf8",
    );
    assert.match(css, /--bot-face-gaze-x,\s*0px/);
    assert.match(css, /--bot-face-gaze-y,\s*0px/);
    assert.match(
      css,
      /data-coffee-plate-emoji-blink-phase="closed"[\s\S]*transition:\s*none/,
    );
    assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]*--bot-face-gaze-x:\s*0px !important/);
    assert.match(renderer, /if \(displayBlinkPhase === "closed"\)[\s\S]*return;/);
    assert.match(renderer, /setDisplayGaze\(resolvedGaze\)/);
    assert.match(renderer, /data-face-eye-gaze-snap=\{gazeSnapsOpen/);
    assert.match(page, /faceEyeMovement=\{[\s\S]*faceStyle\.eyeAnimation/);
    assert.match(page, /eyeTargetDirection=\{seatEyeTargetDirection\}/);
    assert.match(page, /avatarState\.role === "host" \? 1 : -1/);
    assert.match(signal, /eyeTimelineMs:\s*args\.replay/);
  });
});
