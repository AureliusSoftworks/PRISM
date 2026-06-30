import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyCoffeeSeatBlink } from "./coffee-seat-plate-blink.ts";

describe("applyCoffeeSeatBlink", () => {
  it("leaves text unchanged when eyes are open", () => {
    assert.equal(applyCoffeeSeatBlink(":|", true), ":|");
    assert.equal(applyCoffeeSeatBlink(":[", true), ":[");
    assert.equal(applyCoffeeSeatBlink(";(", true), ";(");
  });

  it("replaces leading colon with non-collapsing whitespace when eyes closed", () => {
    assert.equal(applyCoffeeSeatBlink(":|", false), "\u00a0|");
    assert.equal(applyCoffeeSeatBlink(":D", false), "\u00a0D");
    assert.equal(applyCoffeeSeatBlink(":[", false), "\u00a0[");
    assert.equal(applyCoffeeSeatBlink(":V", false), "\u00a0V");
  });

  it("replaces leading semicolon (sad eyes) with non-collapsing whitespace", () => {
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
