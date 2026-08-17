import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BotFaceEyeMovement } from "@localai/shared";
import {
  botFaceEyeMovementLiveIntervalMs,
  botFaceGazeTravel,
  resolveBotFaceGazeFrame,
} from "./botFaceEyeMovement.ts";

const ACTIVE_MOVEMENTS = [
  "natural",
  "nervous",
  "frantic",
  "paranoid",
] as const satisfies ReadonlyArray<Exclude<BotFaceEyeMovement, "still">>;

const ENVELOPES: Record<
  (typeof ACTIVE_MOVEMENTS)[number],
  { maxX: number; maxY: number; transitionMin: number; transitionMax: number }
> = {
  natural: { maxX: 4, maxY: 2, transitionMin: 180, transitionMax: 260 },
  nervous: { maxX: 5, maxY: 2.5, transitionMin: 90, transitionMax: 160 },
  frantic: { maxX: 6.2, maxY: 3.1, transitionMin: 48, transitionMax: 103 },
  paranoid: { maxX: 7.2, maxY: 3.6, transitionMin: 28, transitionMax: 76 },
};

describe("bot eye movement modes", () => {
  it("is deterministic at a replay timestamp and after seeking", () => {
    for (const movement of ACTIVE_MOVEMENTS) {
      const args = {
        seed: "episode:bot-a",
        timelineMs: 42_500,
        stateStartedAtMs: 40_000,
        state: "listening" as const,
        targetDirection: -1 as const,
        movement,
      };
      assert.deepEqual(
        resolveBotFaceGazeFrame(args),
        resolveBotFaceGazeFrame(args),
      );
    }
  });

  it("keeps Still eyes parked at center", () => {
    const frame = resolveBotFaceGazeFrame({
      seed: "still",
      timelineMs: 12_000,
      state: "idle",
      movement: "still",
    });
    assert.deepEqual(frame, { xPx: 0, yPx: 0, transitionMs: 0 });
  });

  it("stays inside each mode's motion envelope", () => {
    for (const movement of ACTIVE_MOVEMENTS) {
      const envelope = ENVELOPES[movement];
      for (const state of ["idle", "listening", "speaking", "thinking"] as const) {
        for (let timelineMs = 0; timelineMs < 180_000; timelineMs += 997) {
          const frame = resolveBotFaceGazeFrame({
            seed: `bounds:${movement}`,
            timelineMs,
            state,
            targetDirection: 1,
            movement,
          });
          assert.ok(frame.xPx >= -envelope.maxX && frame.xPx <= envelope.maxX);
          assert.ok(frame.yPx >= -envelope.maxY && frame.yPx <= envelope.maxY);
          assert.ok(
            frame.transitionMs >= envelope.transitionMin &&
              frame.transitionMs <= envelope.transitionMax,
          );
        }
      }
    }
  });

  it("makes busier modes refresh the live timeline faster", () => {
    assert.equal(botFaceEyeMovementLiveIntervalMs("natural"), 250);
    assert.equal(botFaceEyeMovementLiveIntervalMs("nervous"), 180);
    assert.equal(botFaceEyeMovementLiveIntervalMs("frantic"), 110);
    assert.equal(botFaceEyeMovementLiveIntervalMs("paranoid"), 80);
    assert.equal(botFaceEyeMovementLiveIntervalMs("still"), 250);
  });

  it("biases listeners toward the conversational target", () => {
    const left = resolveBotFaceGazeFrame({
      seed: "listener",
      timelineMs: 8_000,
      state: "listening",
      targetDirection: -1,
      movement: "natural",
    });
    const right = resolveBotFaceGazeFrame({
      seed: "listener",
      timelineMs: 8_000,
      state: "listening",
      targetDirection: 1,
      movement: "natural",
    });
    assert.ok(left.xPx < 0);
    assert.ok(right.xPx > 0);
  });

  it("looks left and right often while speaking without a fixed target", () => {
    let leftHits = 0;
    let rightHits = 0;
    const samples = 160;
    for (let index = 0; index < samples; index += 1) {
      const frame = resolveBotFaceGazeFrame({
        seed: `room-speak:${index}`,
        timelineMs: index * 1_100,
        state: "speaking",
        targetDirection: 0,
        movement: "natural",
      });
      if (frame.xPx < -0.4) leftHits += 1;
      if (frame.xPx > 0.4) rightHits += 1;
    }
    assert.ok(leftHits > samples * 0.2);
    assert.ok(rightHits > samples * 0.2);
  });

  it("keeps the speaking eye line vertically registered", () => {
    for (const movement of ACTIVE_MOVEMENTS) {
      for (const targetDirection of [-1, 0, 1] as const) {
        for (let index = 0; index < 80; index += 1) {
          const frame = resolveBotFaceGazeFrame({
            seed: `speech-registration:${movement}:${targetDirection}:${index}`,
            timelineMs: index * 1_137,
            state: "speaking",
            targetDirection,
            movement,
          });
          assert.equal(frame.yPx, 0);
        }
      }
    }
  });

  it("keeps thinking gazes above center", () => {
    const frame = resolveBotFaceGazeFrame({
      seed: "thinker",
      timelineMs: 5_000,
      state: "thinking",
      movement: "nervous",
    });
    assert.ok(frame.yPx < 0);
  });

  it("moves paranoid eyes more often, but never farther, than natural", () => {
    const samples = 240;
    let paranoidMaxTravel = 0;
    let naturalMaxTravel = 0;
    let paranoidMoves = 0;
    let naturalMoves = 0;
    for (let index = 0; index < samples; index += 1) {
      const paranoid = resolveBotFaceGazeFrame({
        seed: `paranoid:${index}`,
        timelineMs: index * 791,
        state: "idle",
        movement: "paranoid",
      });
      const natural = resolveBotFaceGazeFrame({
        seed: `paranoid:${index}`,
        timelineMs: index * 791,
        state: "idle",
        movement: "natural",
      });
      paranoidMaxTravel = Math.max(paranoidMaxTravel, Math.abs(paranoid.xPx));
      naturalMaxTravel = Math.max(naturalMaxTravel, Math.abs(natural.xPx));
      if (paranoid.xPx !== 0 || paranoid.yPx !== 0) paranoidMoves += 1;
      if (natural.xPx !== 0 || natural.yPx !== 0) naturalMoves += 1;
    }
    // Frequency is the whole difference between modes.
    assert.ok(paranoidMoves > naturalMoves);
    // Distance is not: both modes share one travel envelope. Sampled maxima
    // differ by a hair only because the busier mode takes more draws at it,
    // so compare against the shared bound rather than for exact equality.
    const { maxX } = botFaceGazeTravel();
    assert.ok(paranoidMaxTravel <= maxX);
    assert.ok(naturalMaxTravel <= maxX);
    assert.ok(Math.abs(paranoidMaxTravel - naturalMaxTravel) < 0.25);
  });

  it("scales gaze travel by eye size alone", () => {
    const frameFor = (eyeScale?: number) =>
      resolveBotFaceGazeFrame({
        seed: "travel",
        timelineMs: 0,
        state: "idle",
        movement: "natural",
        eyeScale,
      });
    const small = Math.abs(frameFor(0.7).xPx);
    const base = Math.abs(frameFor().xPx);
    const large = Math.abs(frameFor(1.3).xPx);
    assert.ok(small < base);
    assert.ok(base < large);
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
    assert.match(
      css,
      /prefers-reduced-motion:\s*reduce[\s\S]*--bot-face-gaze-x:\s*0px !important/,
    );
    assert.match(
      css,
      /\[data-coffee-plate-emoji-blink-glyph="true"\][\s\S]{0,420}--bot-face-gaze-x:\s*0px;[\s\S]{0,120}--bot-face-gaze-y:\s*0px;/,
    );
    assert.match(renderer, /if \(displayBlinkPhase === "closed"\)[\s\S]*return;/);
    assert.match(renderer, /setDisplayGaze\(resolvedGaze\)/);
    assert.match(renderer, /data-face-eye-gaze-snap=\{gazeSnapsOpen/);
    assert.match(renderer, /botFaceEyeMovementIsActive\(normalizedEyeMovement\)/);
    assert.match(
      renderer,
      /botFaceEyeMovementLiveIntervalMs\(normalizedEyeMovement\)/,
    );
    assert.match(renderer, /movement: normalizedEyeMovement/);
    assert.match(page, /faceEyeMovement=\{[\s\S]*faceStyle\.eyeAnimation/);
    assert.match(page, /blinkWhileTalking = true/);
    assert.match(
      page,
      /detailLevel === "debate" \? faceStyle\.eyeAnimation : "still"/,
    );
    assert.doesNotMatch(
      page,
      /faceEyeCharacter=\{faceStyle\.eyeCharacter\}\s*faceEyeMovement="still"/,
    );
    assert.match(page, /eyeTargetDirection=\{seatEyeTargetDirection\}/);
    assert.match(page, /avatarState\.role === "host" \? 1 : -1/);
    assert.match(page, /nervous:\s*"Nervous"/);
    assert.match(page, /frantic:\s*"Frantic"/);
    assert.match(page, /paranoid:\s*"Paranoid"/);
    assert.match(signal, /eyeTimelineMs:\s*args\.replay/);
  });
});
