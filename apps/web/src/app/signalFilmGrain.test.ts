import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REPLAY_VIDEO_BITRATE,
  SIGNAL_GRAIN_REPLAY_VIDEO_BITRATE,
  replayVideoBitrateForFilmGrain,
  signalFilmGrainFramePlan,
} from "./signalFilmGrain.ts";

describe("Signal encoded film grain", () => {
  it("keeps zero clean and scales the full treatment visibly", () => {
    assert.deepEqual(signalFilmGrainFramePlan(0, 0), {
      level: 0,
      seed: 467448786,
      opacity: 0,
      scanlineOpacity: 0,
      offsetX: 2,
      offsetY: 14,
      dustCount: 0,
      scratchCount: 0,
    });
    const full = signalFilmGrainFramePlan(1, 0);
    assert.equal(full.opacity, 0.34);
    assert.equal(full.scanlineOpacity, 0.1);
    assert.equal(full.dustCount, 18);
    assert.equal(full.scratchCount, 2);
  });

  it("changes emulsion deterministically on every encoded frame", () => {
    const first = signalFilmGrainFramePlan(0.75, 17);
    const repeat = signalFilmGrainFramePlan(0.75, 17);
    const next = signalFilmGrainFramePlan(0.75, 18);
    assert.deepEqual(repeat, first);
    assert.notEqual(next.seed, first.seed);
    assert.notDeepEqual(
      [next.offsetX, next.offsetY],
      [first.offsetX, first.offsetY],
    );
  });

  it("reserves enough bitrate for moving grain to survive encoding", () => {
    assert.equal(replayVideoBitrateForFilmGrain(0), REPLAY_VIDEO_BITRATE);
    assert.equal(
      replayVideoBitrateForFilmGrain(0.01),
      SIGNAL_GRAIN_REPLAY_VIDEO_BITRATE,
    );
  });
});
