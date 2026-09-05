import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_AVATAR_COMPACT_ENTER_MAX_PX,
  BOT_AVATAR_COMPACT_EXIT_MIN_PX,
  BOT_AVATAR_ATOMIC_MAX_PX,
  BOT_AVATAR_MICRO_ENTER_MAX_PX,
  BOT_AVATAR_MICRO_EXIT_MIN_PX,
  BOT_AVATAR_MICRO_BLOCK_MAX_PX,
  BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX,
  BOT_AVATAR_MICRO_PIXEL_MAX_PX,
  avatarRenderedSizeTierForMeasurements,
  avatarRenderedSizeTierWithMinimum,
  botAvatarMicroPresentationForSize,
} from "./avatarRenderedSizeQuality.ts";

test("rendered avatar width selects full, compact, and micro tiers", () => {
  assert.equal(avatarRenderedSizeTierForMeasurements(300, 300), "full");
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      300,
      299,
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      81,
      81,
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      80,
      80,
    ),
    "micro",
  );
});

test("exact size-tier boundaries remain stable across the previous tier", () => {
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_COMPACT_ENTER_MAX_PX,
      "compact",
    ),
    "full",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_COMPACT_ENTER_MAX_PX - 1,
      "compact",
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      BOT_AVATAR_COMPACT_ENTER_MAX_PX - 1,
      BOT_AVATAR_COMPACT_ENTER_MAX_PX - 1,
      "compact",
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      320,
      BOT_AVATAR_MICRO_ENTER_MAX_PX - 1,
      "compact",
    ),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      BOT_AVATAR_MICRO_EXIT_MIN_PX,
      BOT_AVATAR_MICRO_EXIT_MIN_PX,
      "micro",
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      BOT_AVATAR_MICRO_EXIT_MIN_PX - 1,
      BOT_AVATAR_MICRO_EXIT_MIN_PX - 1,
      "micro",
    ),
    "micro",
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
      BOT_AVATAR_MICRO_ENTER_MAX_PX + 1,
      100,
      "compact",
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      BOT_AVATAR_MICRO_ENTER_MAX_PX - 1,
      BOT_AVATAR_MICRO_ENTER_MAX_PX - 1,
      "compact",
    ),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      BOT_AVATAR_MICRO_ENTER_MAX_PX,
      BOT_AVATAR_MICRO_ENTER_MAX_PX,
      "compact",
    ),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      BOT_AVATAR_MICRO_EXIT_MIN_PX - 1,
      BOT_AVATAR_MICRO_EXIT_MIN_PX - 1,
      "micro",
    ),
    "micro",
  );
});

test("global thresholds stay fixed at 300px/299px and 81px/80px boundaries", () => {
  assert.equal(BOT_AVATAR_COMPACT_ENTER_MAX_PX, 300);
  assert.equal(BOT_AVATAR_COMPACT_EXIT_MIN_PX, 300);
  assert.equal(BOT_AVATAR_MICRO_ENTER_MAX_PX, 80);
  assert.equal(BOT_AVATAR_MICRO_EXIT_MIN_PX, 81);
  assert.equal(BOT_AVATAR_MICRO_FEATURES_HIDE_MAX_PX, 28);
  assert.equal(BOT_AVATAR_ATOMIC_MAX_PX, 30);
  assert.equal(BOT_AVATAR_MICRO_BLOCK_MAX_PX, 8);
  assert.equal(BOT_AVATAR_MICRO_PIXEL_MAX_PX, 1);
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      81,
      81,
      "compact",
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      80,
      80,
      "compact",
    ),
    "micro",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      300,
      299,
      "compact",
    ),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      300,
      300,
      "compact",
    ),
    "full",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(
      80,
      80,
      "compact",
    ),
    "micro",
  );
});

test("micro becomes a glyph-only Atomic avatar at 30px before block and pixel fallbacks", () => {
  assert.equal(botAvatarMicroPresentationForSize(undefined), "glyph");
  assert.equal(botAvatarMicroPresentationForSize(80), "glyph");
  assert.equal(botAvatarMicroPresentationForSize(31), "glyph");
  assert.equal(botAvatarMicroPresentationForSize(30), "atomic");
  assert.equal(botAvatarMicroPresentationForSize(29), "atomic");
  assert.equal(botAvatarMicroPresentationForSize(28), "atomic");
  assert.equal(botAvatarMicroPresentationForSize(9), "atomic");
  assert.equal(botAvatarMicroPresentationForSize(8), "block");
  assert.equal(botAvatarMicroPresentationForSize(2), "block");
  assert.equal(botAvatarMicroPresentationForSize(1), "pixel");
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

test("only final rendered width controls the selected tier", () => {
  assert.equal(
    avatarRenderedSizeTierForMeasurements(40, 300, "full"),
    "full",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(600, BOT_AVATAR_MICRO_ENTER_MAX_PX - 1, "full"),
    "micro",
  );
});

test("surface policy can floor a tiny final width at compact", () => {
  assert.equal(avatarRenderedSizeTierWithMinimum("micro", "compact"), "compact");
  assert.equal(avatarRenderedSizeTierWithMinimum("compact", "compact"), "compact");
  assert.equal(avatarRenderedSizeTierWithMinimum("full", "compact"), "full");
  assert.equal(
    avatarRenderedSizeTierForMeasurements(80, 80, "full", "compact"),
    "compact",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(80, Number.NaN, "micro", "compact"),
    "compact",
  );
});

test("authoring surfaces can keep the full renderer through transient measurements", () => {
  assert.equal(avatarRenderedSizeTierWithMinimum("micro", "full"), "full");
  assert.equal(avatarRenderedSizeTierWithMinimum("compact", "full"), "full");
  assert.equal(
    avatarRenderedSizeTierForMeasurements(80, 80, "full", "full"),
    "full",
  );
  assert.equal(
    avatarRenderedSizeTierForMeasurements(320, Number.NaN, "compact", "full"),
    "full",
  );
});
