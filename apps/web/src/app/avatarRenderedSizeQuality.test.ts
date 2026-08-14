import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_AVATAR_COMPACT_ENTER_MAX_PX,
  BOT_AVATAR_COMPACT_EXIT_MIN_PX,
  BOT_AVATAR_MICRO_ENTER_MAX_PX,
  BOT_AVATAR_MICRO_EXIT_MIN_PX,
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
      BOT_AVATAR_MICRO_ENTER_MAX_PX - 1,
      80,
    ),
    "micro",
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
      BOT_AVATAR_MICRO_ENTER_MAX_PX + 6,
      100,
      "micro",
    ),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      BOT_AVATAR_MICRO_EXIT_MIN_PX,
      180,
      "micro",
    ),
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
