import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

describe("Signal generated asset one-step Undo", () => {
  it("exposes Undo only when a previous logo or audio package exists", () => {
    const experience = readFileSync(
      new URL("./BotcastExperience.tsx", import.meta.url),
      "utf8",
    );
    const library = readFileSync(
      new URL("./AssetLibrary.tsx", import.meta.url),
      "utf8",
    );

    assert.match(experience, /\/audio\/undo/u);
    assert.match(experience, /Undo Signal audio/u);
    assert.match(
      experience,
      /selectedShow\.introAudio\.undoAvailable\s*\|\|\s*selectedShow\.atmosphereAudio\.undoAvailable/u,
    );
    assert.match(experience, /\/logo\/undo/u);
    assert.match(experience, /Undo Signal logo/u);
    assert.match(experience, /selectedShow\.logo\.previousImageUrl/u);
    assert.match(experience, /undoLabel="Previous logo"/u);
    assert.match(library, /onUndo\?: \(\) => void/u);
    assert.match(
      library,
      /aria-label=\{undoLabel === "Undo" \? "Undo" : `Undo \$\{undoLabel\}`\}/u,
    );
  });

  it("documents current-only playback and one previous generated version", () => {
    const tutorials = readFileSync(
      new URL("./modeTutorials.ts", import.meta.url),
      "utf8",
    );
    assert.match(tutorials, /only one current logo/u);
    assert.match(tutorials, /immediately previous logo for Undo/u);
    assert.match(tutorials, /Only the current package plays/u);
    assert.match(tutorials, /immediately previous ident and atmosphere together/u);
  });
});
