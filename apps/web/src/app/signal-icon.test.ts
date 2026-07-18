import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signalGlyphSource = pageSource.slice(
  pageSource.indexOf("function GlyphSignal"),
  pageSource.indexOf("function GlyphGames")
);

describe("Signal applet icon", () => {
  it("uses the condenser microphone glyph in the switcher and hub", () => {
    assert.match(
      signalGlyphSource,
      /data-signal-glyph="condenser-microphone"/u
    );
    for (const colorKey of ["p", "r", "i", "s", "m"]) {
      assert.match(
        signalGlyphSource,
        new RegExp(`stroke=\\{PRISM_COLORS\\.${colorKey}\\}`, "u")
      );
    }
    assert.match(
      pageSource,
      /appletId === "botcast"\) return <GlyphSignal size=\{18\} \/>/u
    );
    assert.match(
      pageSource,
      /botcast: \{[\s\S]*?glyph: <GlyphSignal size=\{88\} \/>/u
    );
    assert.doesNotMatch(
      pageSource,
      /appletId === "botcast"\) return <Waves/u
    );
    assert.doesNotMatch(
      pageSource,
      /botcast: \{[\s\S]*?glyph: <Waves size=\{88\} \/>/u
    );
  });
});
