import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const source = readFileSync(
  new URL("./SlateMirrorDesk.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./slateMirrorDesk.module.css", import.meta.url),
  "utf8",
);

describe("Slate Mirror focused desk", () => {
  it("captures writer-owned prose and all three short voice exercises", () => {
    assert.match(source, /writer_owned_sample/);
    assert.match(source, /description_exercise/);
    assert.match(source, /dialogue_exercise/);
    assert.match(source, /interiority_action_exercise/);
    assert.match(source, /I wrote these samples and want Mirror to use them/);
    assert.match(source, /containsThirdPartyMaterial: false/);
  });

  it("keeps versions inspectable and project pins explicit", () => {
    assert.match(source, /VOICE_CARD_ROWS/);
    assert.match(source, /profileVersionId: selectedVersion\.id/);
    assert.match(source, /expectedCurrentVersionId/);
    assert.match(source, /confirmRepin/);
    assert.match(source, /Freeze voice/);
    assert.match(source, /Project overlay/);
    assert.match(source, /Optional POV layer/);
  });

  it("states and preserves the boundary between voice and output length", () => {
    assert.match(source, /Voice and prose density, never output length/);
    assert.match(source, /Scope\s+and word targets stay with the Director/);
    assert.doesNotMatch(source, /wordTarget:/);
    assert.doesNotMatch(source, /outputLength:/);
  });

  it("is a temporary full-surface desk rather than permanent cockpit chrome", () => {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(css, /\.backdrop\s*\{[\s\S]*position:\s*fixed/);
    assert.match(css, /\.desk\s*\{[\s\S]*height:\s*100%/);
  });
});
