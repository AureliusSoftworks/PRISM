import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  coffeeSocialSnapshotToPrismMoodState,
  derivePrismMoodKey,
} from "@localai/shared";
import {
  COFFEE_DEV_SOCIAL_FIELDS,
  coffeeDevMoodPresetPayload,
  formatCoffeeSeatDebugCoordinates,
} from "./coffee-dev-debug.ts";

describe("Coffee dev debug helpers", () => {
  it("returns the expected social payload for mood presets", () => {
    assert.deepEqual(coffeeDevMoodPresetPayload("joyful"), {
      disposition: 0.86,
      valuesFriction: 0.14,
      restraint: 0.42,
      engagement: 0.9,
      leavePressure: 0.04,
    });
    assert.deepEqual(coffeeDevMoodPresetPayload("strained"), {
      disposition: 0.22,
      valuesFriction: 0.78,
      restraint: 0.88,
      engagement: 0.34,
      leavePressure: 0.44,
    });
    assert.deepEqual(
      COFFEE_DEV_SOCIAL_FIELDS.map((field) => field.key),
      ["disposition", "valuesFriction", "restraint", "engagement", "leavePressure"]
    );
  });

  it("classifies positive presets into distinct warm and joyful bands", () => {
    assert.equal(
      derivePrismMoodKey(coffeeSocialSnapshotToPrismMoodState(coffeeDevMoodPresetPayload("warm"))),
      "warm"
    );
    assert.equal(
      derivePrismMoodKey(
        coffeeSocialSnapshotToPrismMoodState(coffeeDevMoodPresetPayload("joyful"))
      ),
      "joyful"
    );
  });

  it("copies normalized seat coordinates as CSS plus JSON metadata", () => {
    const text = formatCoffeeSeatDebugCoordinates({
      mode: "experimental",
      seatCount: 4,
      layoutIndex: 0,
      seatIndex: 2,
      botId: "bot-123",
      botName: "Alice",
      leftPct: 24.34,
      topPct: 34.24,
    });

    assert.equal(
      text.split("\n")[0],
      '.coffeeSeat[data-seat-count="4"][data-layout-seat="0"] { left: 24.3%; top: 34.2%; }'
    );
    assert.deepEqual(JSON.parse(text.split("\n\n")[1] ?? "{}"), {
      mode: "experimental",
      seatCount: 4,
      layoutSeat: 0,
      seatIndex: 2,
      botId: "bot-123",
      botName: "Alice",
      leftPct: 24.3,
      topPct: 34.2,
    });
  });
});
