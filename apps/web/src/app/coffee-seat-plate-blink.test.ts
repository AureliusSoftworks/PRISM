import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COFFEE_SEAT_BLINK_HALF_EYE,
  applyCoffeeSeatBlink,
} from "./coffee-seat-plate-blink.ts";

describe("applyCoffeeSeatBlink", () => {
  it("uses a vertical bar for visible half-eye frames", () => {
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

  it("keeps legacy semicolon faces blink-safe", () => {
    assert.equal(applyCoffeeSeatBlink(";(", false), "\u00a0(");
    assert.equal(applyCoffeeSeatBlink(";0", false), "\u00a00");
  });

  it("replaces leading greater-than (guarded eyes) with non-collapsing whitespace", () => {
    assert.equal(applyCoffeeSeatBlink(">[", false), "\u00a0[");
    assert.equal(applyCoffeeSeatBlink(">O", false), "\u00a0O");
  });

  it("no-ops on empty or unknown first character", () => {
    assert.equal(applyCoffeeSeatBlink("", false), "");
    assert.equal(applyCoffeeSeatBlink("x0", false), "x0");
  });
});
