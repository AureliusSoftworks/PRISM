import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyCoffeeSeatBlink } from "./coffee-seat-plate-blink.ts";

describe("applyCoffeeSeatBlink", () => {
  it("leaves text unchanged when eyes are open", () => {
    assert.equal(applyCoffeeSeatBlink(":|", true), ":|");
    assert.equal(applyCoffeeSeatBlink(":[", true), ":[");
    assert.equal(applyCoffeeSeatBlink(";(", true), ";(");
  });

  it("replaces leading colon with space when eyes closed", () => {
    assert.equal(applyCoffeeSeatBlink(":|", false), " |");
    assert.equal(applyCoffeeSeatBlink(":D", false), " D");
    assert.equal(applyCoffeeSeatBlink(":[", false), " [");
    assert.equal(applyCoffeeSeatBlink(":V", false), " V");
  });

  it("replaces leading semicolon (sad eyes) when eyes closed", () => {
    assert.equal(applyCoffeeSeatBlink(";(", false), " (");
    assert.equal(applyCoffeeSeatBlink(";0", false), " 0");
  });

  it("no-ops on empty or unknown first character", () => {
    assert.equal(applyCoffeeSeatBlink("", false), "");
    assert.equal(applyCoffeeSeatBlink("x0", false), "x0");
  });
});
