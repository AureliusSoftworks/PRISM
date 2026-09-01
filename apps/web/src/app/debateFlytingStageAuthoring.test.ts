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

  it("opens the setup tool with a cast-bound Mead Hall preview", () => {
    assert.match(
      flytingSource,
      /onClick=\{\(\) => setStageLayoutOpen\(true\)\}/u,
    );
    assert.match(flytingSource, /<FlytingSetupStageAlignmentPreview/u);
    assert.match(flytingSource, /forBot=\{forBot\}/u);
    assert.match(flytingSource, /againstBot=\{againstBot\}/u);
    assert.match(flytingSource, /view=\{stageLayoutView\}/u);
    assert.match(flytingSource, /alignment=\{stageLayoutDraft\}/u);
    assert.match(flytingSource, /onSelectItem=\{setStageLayoutItem\}/u);
    assert.match(flytingSource, /data-flyting-stage-preview=\{props\.view\}/u);
    assert.match(
      flytingSource,
      /data-debate-stage-viewport="authoring-preview"/u,
    );
    assert.match(flytingSource, /Hall gallery alignment preview/u);
    assert.match(
      flytingStyles,
      /\.stageAlignmentPreview\s*\{[\s\S]{0,260}position:\s*fixed/u,
    );
  });

  it("keys competitor rugs through the same normalized lane contract as the Hall banners", () => {
    assert.match(flytingSource, /className=\{styles\.galleryRugAccentKeys\}/u);
    assert.match(flytingSource, /<span data-key="left" \/>/u);
    assert.match(flytingSource, /<span data-key="host" \/>/u);
    assert.match(flytingSource, /<span data-key="right" \/>/u);
    assert.match(flytingStyles, /mead-hall-gallery-floor\.webp/u);
    assert.match(flytingSource, /\["for", props\.session\.forAdvocate, forColor\]/u);
    assert.match(
      flytingSource,
      /\["against", props\.session\.againstAdvocate, againstColor\]/u,
    );
    assert.match(
      flytingSource,
      /"--flyting-rug-key-color":\s*role === "for"[\s\S]{0,180}var\(--flyting-lane-left\)[\s\S]{0,180}var\(--flyting-lane-right\)/u,
    );
    assert.match(flytingStyles, /var\(--flyting-rug-key-color\)/u);
    assert.match(flytingStyles, /mead-hall-gallery-left-key\.svg/u);
    assert.match(flytingStyles, /mead-hall-gallery-host-key\.svg/u);
    assert.match(flytingStyles, /mead-hall-gallery-right-key\.svg/u);
    assert.match(flytingStyles, /background-blend-mode:\s*color/u);
    assert.doesNotMatch(flytingSource, /galleryModeratorRugGlyph/u);
  });

  it("enlarges and reflows the gallery without shrinking authored avatars", () => {
    assert.match(
      flytingStyles,
      /\.flytingCourtGallery\s*\{[\s\S]{0,620}height:\s*clamp\(188px, 14vw, 244px\)/u,
    );
    assert.match(
      flytingStyles,
      /\.flytingAudienceMillingSlot\s*\{[\s\S]{0,420}flex:\s*0 0 clamp\(48px, 5\.1vw, 76px\)/u,
    );
    assert.match(
      flytingStyles,
      /\.flytingAudienceCluster\s*\{[\s\S]{0,420}flex-wrap:\s*wrap/u,
    );
    assert.doesNotMatch(flytingStyles, /flex:\s*0 1 clamp\(48px, 5\.1vw, 76px\)/u);
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
