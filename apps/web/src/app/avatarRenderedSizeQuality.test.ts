import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_AVATAR_COMPACT_ENTER_MAX_PX,
  BOT_AVATAR_COMPACT_EXIT_MIN_PX,
  BOT_AVATAR_MICRO_ENTER_MAX_PX,
  BOT_AVATAR_MICRO_EXIT_MIN_PX,
  BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX,
  avatarRenderedSizeTierForMeasurements,
} from "./avatarRenderedSizeQuality.ts";

test("rendered avatar width selects full, compact, and micro tiers", () => {
  assert.equal(avatarRenderedSizeTierForMeasurements(320, 320), "full");
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_COMPACT_ENTER_MAX_PX - 1,
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_MICRO_ENTER_MAX_PX,
    ),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_MICRO_ENTER_MAX_PX + 1,
    ),
    "compact",
  );
});

test("size-tier hysteresis prevents camera-transition chatter", () => {
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_COMPACT_ENTER_MAX_PX + 8,
      "compact",
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_COMPACT_EXIT_MIN_PX,
      "compact",
    ),
    "full",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_MICRO_EXIT_MIN_PX - 1,
      "micro",
    ),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_MICRO_EXIT_MIN_PX,
      "micro",
    ),
    "compact",
  );
});

test("compact avatar thresholds stay fixed at 60px/59px/40px boundaries", () => {
  assert.equal(BOT_AVATAR_MICRO_ENTER_MAX_PX, 59);
  assert.equal(BOT_AVATAR_MICRO_EXIT_MIN_PX, 60);
  assert.equal(BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX, 40);
  assert.equal(
    avatarRenderedSizeTierForMeasurements(600, 59, "compact"),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(40, 60, "micro"),
    "compact",
  );
});

test("invalid measurements preserve the current tier", () => {
  assert.equal(
    avatarRenderedSizeTierForMeasurements(0, 100, "compact"),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(100, Number.NaN, "micro"),
    "micro",
  );
});
