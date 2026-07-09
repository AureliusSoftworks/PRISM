import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COFFEE_SEAT_BLINK_HALF_EYE,
  applyCoffeeSeatBlink,
} from "./coffee-seat-plate-blink.ts";

describe("applyCoffeeSeatBlink", () => {
  it("defaults visible half-eye frames to the legacy bar", () => {
    assert.equal(COFFEE_SEAT_BLINK_HALF_EYE, "|");
  });

  it("leaves text unchanged when eyes are open", () => {
    assert.equal(applyCoffeeSeatBlink(":|", true), ":|");
    assert.equal(applyCoffeeSeatBlink(":[", true), ":[");
    assert.equal(applyCoffeeSeatBlink("\u02d0[", true), "\u02d0[");
    assert.equal(applyCoffeeSeatBlink(";(", true), ";(");
  });

  it("replaces leading colon-style eyes with non-collapsing whitespace when eyes closed", () => {
    assert.equal(applyCoffeeSeatBlink(":|", false), "\u00a0|");
    assert.equal(applyCoffeeSeatBlink(":D", false), "\u00a0D");
    assert.equal(applyCoffeeSeatBlink(":[", false), "\u00a0[");
    assert.equal(applyCoffeeSeatBlink("\u02d0[", false), "\u00a0[");
    assert.equal(applyCoffeeSeatBlink("\u02d0(", false), "\u00a0(");
    assert.equal(applyCoffeeSeatBlink(":V", false), "\u00a0V");
  });

  it("uses a visible half-eye frame before and after closed blink", () => {
    assert.equal(
      applyCoffeeSeatBlink(":]", "half"),
      `${COFFEE_SEAT_BLINK_HALF_EYE}]`
    );
    assert.equal(
      applyCoffeeSeatBlink(":0", "half"),
      `${COFFEE_SEAT_BLINK_HALF_EYE}0`
    );
    assert.equal(
      applyCoffeeSeatBlink(">[", "half"),
      `${COFFEE_SEAT_BLINK_HALF_EYE}[`
    );
    assert.equal(
      applyCoffeeSeatBlink("\u02d0(", "half"),
      `${COFFEE_SEAT_BLINK_HALF_EYE}(`
    );
  });

  it("uses the selected blink bar for half-eye frames", () => {
    assert.equal(applyCoffeeSeatBlink(":]", "half", { blinkBar: "¦" }), "¦]");
    assert.equal(applyCoffeeSeatBlink(":]", "half", { blinkBar: "❘" }), "❘]");
    assert.equal(applyCoffeeSeatBlink(":]", "half", { blinkBar: "|" }), "|]");
  });

  it("keeps legacy semicolon faces blink-safe", () => {
    assert.equal(applyCoffeeSeatBlink(";(", false), "\u00a0(");
    assert.equal(applyCoffeeSeatBlink(";0", false), "\u00a00");
  });

  it("replaces leading greater-than (guarded eyes) with non-collapsing whitespace", () => {
    assert.equal(applyCoffeeSeatBlink(">[", false), "\u00a0[");
    assert.equal(applyCoffeeSeatBlink(">O", false), "\u00a0O");
  });

  it("blinks custom leading eye characters when provided", () => {
    assert.equal(applyCoffeeSeatBlink("B)", false, { eyeCharacter: "B" }), "\u00a0)");
    assert.equal(
      applyCoffeeSeatBlink("8D", "half", { eyeCharacter: "8", blinkBar: "¦" }),
      "¦D"
    );
    assert.equal(applyCoffeeSeatBlink("B)", false), "B)");
  });

  it("keeps eyes open when blink is disabled", () => {
    assert.equal(applyCoffeeSeatBlink(":]", "half", { blinkBar: "none" }), ":]");
    assert.equal(applyCoffeeSeatBlink(":]", "closed", { blinkBar: "none" }), ":]");
    assert.equal(
      applyCoffeeSeatBlink("8D", "half", { eyeCharacter: "8", blinkBar: "none" }),
      "8D"
    );
  });

  it("no-ops on empty or unknown first character", () => {
    assert.equal(applyCoffeeSeatBlink("", false), "");
    assert.equal(applyCoffeeSeatBlink("x0", false), "x0");
  });
});
