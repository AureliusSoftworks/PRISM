import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyCoffeeSeatBlink } from "./coffee-seat-plate-blink.ts";

describe("applyCoffeeSeatBlink", () => {
  it("leaves text unchanged when eyes are open", () => {
    assert.equal(applyCoffeeSeatBlink(":|", true), ":|");
    assert.equal(applyCoffeeSeatBlink(":[", true), ":[");
    assert.equal(applyCoffeeSeatBlink("\u02d0[", true), "\u02d0[");
    assert.equal(applyCoffeeSeatBlink(";(", true), ";(");
  });

  it("replaces leading colon-style eyes with the default broken bar when eyes closed", () => {
    assert.equal(applyCoffeeSeatBlink(":|", false), "¦|");
    assert.equal(applyCoffeeSeatBlink(":D", false), "¦D");
    assert.equal(applyCoffeeSeatBlink(":[", false), "¦[");
    assert.equal(applyCoffeeSeatBlink("\u02d0[", false), "¦[");
    assert.equal(applyCoffeeSeatBlink("\u02d0(", false), "¦(");
    assert.equal(applyCoffeeSeatBlink(":V", false), "¦V");
  });

  it("uses the configured closed-eye glyph without an intermediate frame", () => {
    assert.equal(applyCoffeeSeatBlink(":]", "closed", { blinkBar: "¦" }), "¦]");
    assert.equal(applyCoffeeSeatBlink(":]", "closed", { blinkBar: "❘" }), "❘]");
    assert.equal(applyCoffeeSeatBlink(":]", "closed", { blinkBar: "|" }), "|]");
    assert.equal(
      applyCoffeeSeatBlink("⦿]", "closed", { eyeCharacter: "⦿", blinkBar: "⦿" }),
      "⦿]"
    );
  });

  it("keeps legacy semicolon faces blink-safe", () => {
    assert.equal(applyCoffeeSeatBlink(";(", false), "¦(");
    assert.equal(applyCoffeeSeatBlink(";0", false), "¦0");
  });

  it("replaces leading greater-than (guarded eyes) with the closed-eye glyph", () => {
    assert.equal(applyCoffeeSeatBlink(">[", false), "¦[");
    assert.equal(applyCoffeeSeatBlink(">O", false), "¦O");
  });

  it("blinks custom leading eye characters when provided", () => {
    assert.equal(applyCoffeeSeatBlink("B)", false, { eyeCharacter: "B" }), "¦)");
    assert.equal(
      applyCoffeeSeatBlink("8D", "closed", { eyeCharacter: "8", blinkBar: "¦" }),
      "¦D"
    );
    assert.equal(applyCoffeeSeatBlink("B)", false), "B)");
  });

  it("keeps eyes open when blink is disabled", () => {
    assert.equal(applyCoffeeSeatBlink(":]", "closed", { blinkBar: "none" }), ":]");
    assert.equal(
      applyCoffeeSeatBlink("8D", "closed", { eyeCharacter: "8", blinkBar: "none" }),
      "8D"
    );
  });

  it("no-ops on empty or unknown first character", () => {
    assert.equal(applyCoffeeSeatBlink("", false), "");
    assert.equal(applyCoffeeSeatBlink("x0", false), "x0");
  });
});
