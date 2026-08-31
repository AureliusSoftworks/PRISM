import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const flytingSource = readFileSync(
  new URL("./DebateFlyting.tsx", import.meta.url),
  "utf8",
);
const flytingStyles = readFileSync(
  new URL("./DebateFlyting.module.css", import.meta.url),
  "utf8",
);

describe("Flyting stage authoring", () => {
  it("keeps the alignment tool developer-only and copies source-ready values", () => {
    assert.match(
      flytingSource,
      /DEBATE_FLYTING_STAGE_LAYOUT_AUTHORING_ENABLED/u,
    );
    assert.match(flytingSource, /data-flyting-stage-alignment="true"/u);
    assert.match(flytingSource, /formatDebateFlytingStageAlignmentClipboard/u);
    assert.match(flytingSource, /Copy alignment values/u);
    assert.match(flytingSource, /data-tutorial-target="debate-stage-layout"/u);
    assert.match(flytingSource, /title="Place every Mead Hall stage element/u);
    assert.match(flytingSource, /<h2>Stage layout<\/h2>/u);
  });

  it("keeps the authored RGB rugs clean and maps only the competitors to their planes", () => {
    assert.doesNotMatch(flytingSource, /galleryRugAccentKeys/u);
    assert.doesNotMatch(flytingStyles, /galleryRugAccentKeys/u);
    assert.match(flytingStyles, /mead-hall-gallery-floor\.webp/u);
    assert.match(flytingSource, /\["for", props\.session\.forAdvocate, forColor\]/u);
    assert.match(
      flytingSource,
      /\["against", props\.session\.againstAdvocate, againstColor\]/u,
    );
    assert.doesNotMatch(flytingSource, /galleryModeratorRugGlyph/u);
  });

  it("centers competitor heraldry on banner surfaces and follows the rugs' shared floor plane", () => {
    assert.match(
      flytingStyles,
      /\[data-role="for"\] \{\s*top: calc\(45\.5%/u,
    );
    assert.match(
      flytingStyles,
      /left: calc\(35\.25% \+ var\(--flyting-align-x/u,
    );
    assert.match(
      flytingStyles,
      /left: calc\(64\.75% \+ var\(--flyting-align-x/u,
    );
    assert.match(
      flytingStyles,
      /perspective\(180px\) rotateX\(61deg\)/u,
    );
    assert.doesNotMatch(
      flytingStyles,
      /\[data-role="for"\][\s\S]{0,160}--flyting-rug-glyph-skew/u,
    );
    assert.doesNotMatch(
      flytingStyles,
      /\[data-role="against"\][\s\S]{0,160}--flyting-rug-glyph-skew/u,
    );
  });

  it("explains the full alignment workflow in the authoring panel", () => {
    assert.match(flytingSource, /drag its gold outline directly on/u);
    assert.match(flytingSource, /Use the fields for the final nudge/u);
    assert.match(flytingSource, /paste back into chat/u);
  });
});
