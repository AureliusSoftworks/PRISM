import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AUTO_CAMERA_RELIEF_MIN_MS,
  AUTO_CAMERA_RETURN_PAD_MS,
  AUTO_CAMERA_SPEAKER_LINGER_MIN_MS,
  autoCameraCoverageBeatAt,
  autoCameraCoverageNextBoundaryMs,
  planAutoCameraCoverage,
} from "./autoCameraDirector.ts";

describe("Auto camera coverage planner", () => {
  it("keeps short lines on the speaker", () => {
    assert.deepEqual(
      planAutoCameraCoverage({
        utteranceDurationMs: 4_800,
        seed: "short-line",
        content: "That is a brief answer.",
        allowCutaway: true,
        listenerCount: 1,
      }),
      [],
    );
  });

  it("plans a Wide breath after a lingering close-up, then returns", () => {
    const beats = planAutoCameraCoverage({
      utteranceDurationMs: 16_000,
      seed: "wide-only",
      content:
        "We have been sitting with this question for a long time. The studio can breathe. Then we come back to the point.",
      allowCutaway: false,
      listenerCount: 1,
    });
    assert.ok(beats.length >= 1);
    assert.equal(beats[0]?.kind, "wide");
    assert.ok((beats[0]?.offsetMs ?? 0) >= AUTO_CAMERA_SPEAKER_LINGER_MIN_MS);
    assert.ok((beats[0]?.durationMs ?? 0) >= AUTO_CAMERA_RELIEF_MIN_MS);
    const first = beats[0]!;
    const remaining = 16_000 - (first.offsetMs + first.durationMs);
    assert.ok(remaining === 0 || remaining >= AUTO_CAMERA_RETURN_PAD_MS);
    assert.equal(autoCameraCoverageBeatAt(beats, first.offsetMs - 1), null);
    assert.equal(autoCameraCoverageBeatAt(beats, first.offsetMs)?.kind, "wide");
    assert.equal(
      autoCameraCoverageBeatAt(beats, first.offsetMs + first.durationMs),
      null,
    );
  });

  it("can glance at another participant instead of going Wide", () => {
    const samples = Array.from({ length: 24 }, (_, index) =>
      planAutoCameraCoverage({
        utteranceDurationMs: 18_000,
        seed: `cutaway-seed-${index}`,
        content:
          "Listen to this longer answer. It keeps going past the first thought. Then it lands somewhere honest.",
        allowCutaway: true,
        listenerCount: 2,
      }),
    );
    const cutaways = samples.filter((beats) =>
      beats.some((beat) => beat.kind === "cutaway"),
    );
    assert.ok(cutaways.length >= 4);
    assert.ok(
      cutaways.every((beats) =>
        beats
          .filter((beat) => beat.kind === "cutaway")
          .every((beat) => beat.cutawayIndex === 0 || beat.cutawayIndex === 1),
      ),
    );
  });

  it("does not glance when nobody else is visible", () => {
    const beats = planAutoCameraCoverage({
      utteranceDurationMs: 18_000,
      seed: "cutaway-seed-0",
      content:
        "Listen to this longer answer. It keeps going past the first thought. Then it lands somewhere honest.",
      allowCutaway: true,
      listenerCount: 0,
    });
    assert.ok(beats.length >= 1);
    assert.ok(beats.every((beat) => beat.kind === "wide"));
  });

  it("stays deterministic for the same seed", () => {
    const args = {
      utteranceDurationMs: 22_000,
      seed: "stable-director",
      content:
        "First idea. Second idea. A longer landing that gives the camera somewhere honest to rest.",
      allowCutaway: true,
      listenerCount: 1,
    };
    assert.deepEqual(planAutoCameraCoverage(args), planAutoCameraCoverage(args));
  });

  it("reports the next enter or leave boundary for timers", () => {
    const beats = planAutoCameraCoverage({
      utteranceDurationMs: 16_000,
      seed: "timer-seed",
      content: "A long enough line. Then another sentence. Then a close.",
      allowCutaway: false,
    });
    assert.ok(beats[0]);
    const untilEnter = autoCameraCoverageNextBoundaryMs(
      beats,
      beats[0]!.offsetMs - 400,
    );
    assert.equal(untilEnter, 400);
    const untilLeave = autoCameraCoverageNextBoundaryMs(
      beats,
      beats[0]!.offsetMs,
    );
    assert.equal(untilLeave, beats[0]!.durationMs);
  });
});
