import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyCoffeeSeatBlink,
  coffeeSeatBlinkKeepsFaceStill,
} from "./coffee-seat-plate-blink.ts";

describe("applyCoffeeSeatBlink", () => {
  it("leaves text unchanged when eyes are open", () => {
    assert.equal(applyCoffeeSeatBlink(":|", true), ":|");
    assert.equal(applyCoffeeSeatBlink(":[", true), ":[");
    assert.equal(applyCoffeeSeatBlink("\u02d0[", true), "\u02d0[");
    assert.equal(applyCoffeeSeatBlink(";(", true), ";(");
  });

  it("keeps the authored face still for the default blank blink", () => {
    assert.equal(applyCoffeeSeatBlink(":|", false), ":|");
    assert.equal(applyCoffeeSeatBlink(":D", false), ":D");
    assert.equal(applyCoffeeSeatBlink(":[", false), ":[");
    assert.equal(applyCoffeeSeatBlink("\u02d0[", false), "\u02d0[");
    assert.equal(applyCoffeeSeatBlink("\u02d0(", false), "\u02d0(");
    assert.equal(applyCoffeeSeatBlink(":V", false), ":V");
  });

  it("keeps Rowan, Iris, and Sol custom eyes visible with a blank blink", () => {
    for (const { name, eye, face } of [
      { name: "Rowan", eye: "⌁", face: "⌁|" },
      { name: "Iris", eye: "◇", face: "◇]" },
      { name: "Sol", eye: "☀", face: "☀D" },
    ]) {
      assert.equal(
        applyCoffeeSeatBlink(face, "closed", {
          eyeCharacter: eye,
          blinkBar: " ",
        }),
        face,
        name,
      );
    }
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
    assert.equal(applyCoffeeSeatBlink(";(", false), ";(");
    assert.equal(applyCoffeeSeatBlink(";0", false), ";0");
    assert.equal(
      applyCoffeeSeatBlink(";(", "closed", { blinkBar: "¦" }),
      "¦(",
    );
  });

  it("replaces leading greater-than (guarded eyes) with the closed-eye glyph", () => {
    assert.equal(applyCoffeeSeatBlink(">[", false), ">[");
    assert.equal(
      applyCoffeeSeatBlink(">O", "closed", { blinkBar: "|" }),
      "|O",
    );
  });

  it("blinks custom leading eye characters when provided", () => {
    assert.equal(
      applyCoffeeSeatBlink("B)", false, { eyeCharacter: "B" }),
      "B)",
    );
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

  it("only schedules a visible blink for an authored blink glyph", () => {
    assert.equal(coffeeSeatBlinkKeepsFaceStill(" "), true);
    assert.equal(coffeeSeatBlinkKeepsFaceStill(""), true);
    assert.equal(coffeeSeatBlinkKeepsFaceStill("none"), true);
    assert.equal(coffeeSeatBlinkKeepsFaceStill("|"), false);
    assert.equal(coffeeSeatBlinkKeepsFaceStill("¦"), false);
    assert.equal(coffeeSeatBlinkKeepsFaceStill("═"), false);
  });

  it("no-ops on empty or unknown first character", () => {
    assert.equal(applyCoffeeSeatBlink("", false), "");
    assert.equal(applyCoffeeSeatBlink("x0", false), "x0");
  });
});
