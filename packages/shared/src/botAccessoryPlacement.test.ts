import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_BOT_ACCESSORY_ARCHIVE_PLACEMENT,
  DEFAULT_BOT_ACCESSORY_PLACEMENT,
  botAccessoryPlacementsEqual,
  normalizeBotAccessoryArchivePlacement,
  normalizeBotAccessoryPlacement,
} from "./botAccessoryPlacement.ts";

describe("bot accessory placement", () => {
  it("normalizes missing values to the default avatar placement", () => {
    assert.deepEqual(normalizeBotAccessoryPlacement(null), DEFAULT_BOT_ACCESSORY_PLACEMENT);
  });

  it("clamps and rounds percentages to the expanded avatar placement field", () => {
    assert.deepEqual(
      normalizeBotAccessoryPlacement({
        xPct: 127.123,
        yPct: -180.456,
        sizePct: 11,
      }),
      {
        xPct: 90,
        yPct: -120,
        sizePct: 40,
        layer: "front",
      }
    );
  });

  it("allows smaller avatar accessories without snapping back to the default size", () => {
    assert.deepEqual(
      normalizeBotAccessoryPlacement({
        xPct: 2,
        yPct: -3,
        sizePct: 42.246,
      }),
      {
        xPct: 2,
        yPct: -3,
        sizePct: 42.25,
        layer: "front",
      }
    );
  });

  it("normalizes accessory layer while preserving front as the legacy default", () => {
    assert.equal(normalizeBotAccessoryPlacement({ layer: "back" }).layer, "back");
    assert.equal(normalizeBotAccessoryPlacement({ layer: "front" }).layer, "front");
    assert.equal(normalizeBotAccessoryPlacement({ layer: "middle" }).layer, "front");
  });

  it("accepts archive placement only for the avatar anchor", () => {
    assert.deepEqual(
      normalizeBotAccessoryArchivePlacement({
        anchor: "avatar",
        xPct: 8.126,
        yPct: -4.234,
        sizePct: 118.888,
        layer: "back",
      }),
      {
        anchor: "avatar",
        xPct: 8.13,
        yPct: -4.23,
        sizePct: 118.89,
        layer: "back",
      }
    );
    assert.equal(normalizeBotAccessoryArchivePlacement({ anchor: "card" }), null);
  });

  it("compares normalized placements by value", () => {
    assert.equal(
      botAccessoryPlacementsEqual(DEFAULT_BOT_ACCESSORY_PLACEMENT, {
        ...DEFAULT_BOT_ACCESSORY_ARCHIVE_PLACEMENT,
      }),
      true
    );
    assert.equal(
      botAccessoryPlacementsEqual(DEFAULT_BOT_ACCESSORY_PLACEMENT, {
        ...DEFAULT_BOT_ACCESSORY_PLACEMENT,
        layer: "back",
      }),
      false
    );
  });
});
