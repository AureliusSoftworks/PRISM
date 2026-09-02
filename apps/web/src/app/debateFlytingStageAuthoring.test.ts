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
    assert.match(flytingSource, /<span>Fine tuning<\/span>/u);
  });

  it("opens the setup tool with a cast-bound Mead Hall preview", () => {
    assert.match(
      flytingSource,
      /setStagePreviewTheme\(props\.theme\);\s*setStageLayoutOpen\(true\)/u,
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
    assert.match(flytingSource, /generic PRISM spectators/u);
    assert.match(flytingSource, /data-flyting-stage-rehearsal="true"/u);
    assert.match(flytingSource, /aria-modal="true"/u);
    assert.match(flytingSource, /createPortal\(/u);
    assert.match(flytingSource, /document\.body/u);
    assert.match(flytingSource, /Rehearse the Mead Hall/u);
    assert.match(flytingSource, />\s*Done\s*<\/button>/u);
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0/u,
    );
  });

  it("stacks a populated, resizable gallery under the Wide preview", () => {
    assert.match(
      flytingSource,
      /debateFlytingHallNpcBots\([\s\S]{0,160}"flyting-stage-authoring-preview"/u,
    );
    assert.match(
      flytingSource,
      /props\.view === "wide" \? previewGallery : null/u,
    );
    assert.match(flytingSource, /data-flyting-preview-gallery="true"/u);
    assert.match(flytingSource, /data-flyting-preview-gallery-scale="true"/u);
    assert.match(flytingSource, /aria-label="Gallery bot size"/u);
    assert.match(
      flytingStyles,
      /\.flytingAudienceMillingSlot\s*\{[\s\S]{0,520}scale:\s*var\(--flyting-gallery-bot-scale/u,
    );
    assert.match(
      flytingSource,
      /DEFAULT_DEBATE_FLYTING_STAGE_REHEARSAL_CONTROLS\.galleryBotScale/u,
    );
    assert.match(
      flytingStyles,
      /\.flytingCourtGallery \.flytingAudienceLayer\[data-depth-row="front"\]\s*\{\s*bottom:\s*16%/u,
    );
    assert.match(
      flytingStyles,
      /\.flytingCourtGallery \.flytingAudienceLayer\[data-depth-row="rear"\]\s*\{\s*bottom:\s*34%/u,
    );
    assert.match(flytingSource, /data-flyting-preview-vote-controls="true"/u);
    assert.match(flytingSource, /stageAlignmentGalleryControls/u);
    assert.match(flytingSource, /Add one gallery vote for/u);
    assert.match(flytingSource, />↑<\/b>/u);
    assert.match(
      flytingSource,
      /DEBATE_FLYTING_AUDIENCE_COUNT - current\.for - current\.against/u,
    );
  });

  it("merges every gallery tuning control into Wide and removes the Gallery tab", () => {
    assert.doesNotMatch(flytingSource, /\["gallery", "Gallery"\]/u);
    assert.match(
      flytingSource,
      /debateFlytingStageRehearsalItems\(stageLayoutView\)/u,
    );
    assert.match(
      flytingSource,
      /aria-label="Maximum random gallery vertical roam"/u,
    );
    assert.match(
      flytingSource,
      /max=\{\s*DEBATE_FLYTING_GALLERY_AUTHORING_MAX_VERTICAL_ROAM_PERCENT\s*\}/u,
    );
    assert.match(
      flytingSource,
      /useState\(DEBATE_FLYTING_GALLERY_DEFAULT_MAX_VERTICAL_ROAM_PERCENT\)/u,
    );
    assert.match(flytingSource, /galleryMaxVerticalRoam/u);
    assert.match(
      flytingStyles,
      /\.stageAlignmentTabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,/u,
    );
  });

  it("keeps fields, pointer drag, and copied values on one live draft", () => {
    assert.match(flytingSource, /alignmentDragRef/u);
    assert.match(flytingSource, /onPointerDown:/u);
    assert.match(flytingSource, /setPointerCapture/u);
    assert.match(flytingSource, /props\.onUpdatePlacement\(drag\.item/u);
    assert.match(
      flytingSource,
      /value=\{stageLayoutPlacement\[field\]\}[\s\S]{0,260}updateStageLayoutPlacement\(stageLayoutItem/u,
    );
    assert.match(
      flytingSource,
      /formatDebateFlytingStageAlignmentClipboard\(stageLayoutDraft, \{[\s\S]{0,160}galleryBotScale:[\s\S]{0,120}galleryMaxVerticalRoam:/u,
    );
  });

  it("offers independent skew control for Wide contestants and both Jarl helmets", () => {
    assert.match(
      flytingSource,
      /stageLayoutDefinition\.supportsSkew[\s\S]{0,340}Skew X/u,
    );
    assert.match(
      flytingSource,
      /flytingStageAlignmentItemFor\(alignmentView, role, "helmet"\)/u,
    );
    assert.match(
      flytingStyles,
      /\.keyedVikingHelmet\s*\{[^}]*skewX\(var\(--flyting-align-skew-x/u,
    );
    assert.match(
      flytingStyles,
      /\.moderatorVikingHelmet\s*\{[^}]*skewX\(var\(--flyting-align-skew-x/u,
    );
    assert.match(
      flytingStyles,
      /\.moderatorPixelVikingHelmet\s*\{[^}]*skewX\(var\(--flyting-align-skew-x/u,
    );
  });

  it("offers independent vertical skew for carpet glyphs in both alignment editors", () => {
    assert.equal(
      [...flytingSource.matchAll(/supportsSkewY \? \(/gu)].length,
      2,
    );
    assert.equal(
      [...flytingSource.matchAll(/<span>Skew Y<\/span>/gu)].length,
      2,
    );
    assert.match(
      flytingSource,
      /"--flyting-align-skew-y": `\$\{placement\.skewY\}deg`/u,
    );
    assert.match(
      flytingStyles,
      /skewY\([\s\S]{0,180}var\(--flyting-align-skew-y, 0deg\)/u,
    );
  });

  it("locally previews both venue themes without changing the app theme", () => {
    assert.match(flytingSource, /stagePreviewTheme/u);
    assert.match(flytingSource, /data-flyting-preview-theme-toggle="true"/u);
    assert.match(flytingSource, /Preview dark/u);
    assert.match(flytingSource, /Preview light/u);
    assert.match(flytingSource, /data-theme=\{stagePreviewTheme\}/u);
    assert.match(
      flytingSource,
      /data-flyting-preview-theme=\{stagePreviewTheme\}/u,
    );
    assert.match(
      flytingSource,
      /className=\{styles\.stageAlignmentPanel\}[\s\S]{0,100}data-theme=\{stagePreviewTheme\}/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal\s*\{[^}]*color-scheme:\s*dark/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal\[data-theme="light"\]\s*\{[^}]*color-scheme:\s*light/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentTabs button\[data-selected="true"\]\s*\{[\s\S]{0,320}var\(--hall-authoring-selected-surface\)/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentCopyButton\s*\{[\s\S]{0,420}var\(--hall-authoring-copy-start\)/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal\[data-theme="light"\]\s*\{[^}]*--hall-authoring-gallery-background:\s*#c4a984/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentPreviewGallery\s*\{[\s\S]{0,700}background-color:\s*var\(--hall-authoring-gallery-background\)/u,
    );
  });

  it("uses a neutral authoring canvas instead of the sepia preview wash", () => {
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal\[data-theme="light"\]\s*\{[\s\S]{0,700}--hall-authoring-preview-surface:\s*#f5f7fa/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentPreview\s*\{[\s\S]{0,700}background:\s*var\(--hall-authoring-preview-surface\)/u,
    );
    assert.doesNotMatch(
      flytingStyles,
      /\.stageAlignmentPreview\s*\{[\s\S]{0,700}color-mix\(in srgb, var\(--flyting-lane-host\)/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal \.stageAlignmentPanel\s*\{[\s\S]{0,420}background:\s*var\(--hall-authoring-surface\)/u,
    );
  });

  it("docks fine tuning beside the complete interactive stage footprint", () => {
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) minmax\(300px, 340px\)/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentPreview\s*\{[\s\S]{0,240}position:\s*relative;[\s\S]{0,180}grid-column:\s*1/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentModal \.stageAlignmentPanel\s*\{[\s\S]{0,240}position:\s*relative;[\s\S]{0,220}grid-column:\s*2/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentPreviewCanvas\s*\{[\s\S]{0,300}container-type:\s*inline-size/u,
    );
    assert.match(
      flytingStyles,
      /\.stageAlignmentPreviewStage[\s\S]{0,260}\[data-flyting-bot-avatar="for"\][\s\S]{0,180}width:\s*clamp\(145px, 12\.4cqw, 194px\)/u,
    );
  });

  it("removes the rejected heraldry and rug repaint layers", () => {
    assert.doesNotMatch(
      flytingSource,
      /hallAccentKeys|galleryRugAccentKeys|hallReceiverMatte/u,
    );
    assert.doesNotMatch(
      flytingStyles,
      /\.hallAccentKeys|\.galleryRugAccentKeys|\.hallReceiverMatte/u,
    );
    assert.doesNotMatch(flytingStyles, /heraldry-key\.svg/u);
    assert.doesNotMatch(
      flytingStyles,
      /mead-hall-gallery-(?:left|host|right)-key/u,
    );
    assert.doesNotMatch(flytingStyles, /mix-blend-mode:\s*color/u);
  });

  it("uses one shared per-pixel RGB-key backdrop in preview and live scenes", () => {
    assert.match(flytingSource, /function FlytingRgbKeyedBackdrop/u);
    assert.match(flytingSource, /remapFlytingRgbKeyPixels/u);
    assert.equal(
      [...flytingSource.matchAll(/<FlytingRgbKeyedBackdrop\b/gu)].length,
      4,
    );
    assert.equal([...flytingSource.matchAll(/scene="gallery"/gu)].length, 2);
    assert.equal(
      [
        ...flytingSource.matchAll(
          /scene=\{cameraView === "moderator" \? "jarl" : "wide"\}/gu,
        ),
      ].length,
      2,
    );
    assert.match(flytingSource, /data-flyting-rgb-key-source=\{asset\.src\}/u);
    assert.match(flytingSource, /--flyting-rgb-key-source/u);
    assert.match(flytingSource, /Object\.values\(FLYTING_RGB_KEY_ASSETS\)/u);
    assert.match(
      flytingStyles,
      /background-image:\s*var\(--flyting-rgb-key-source\)/u,
    );
    assert.match(
      flytingSource,
      /normalizeAccentForTheme\(botColor\(bot, fallback\), theme\)/u,
    );
  });

  it("keeps the full gallery floor and rugs in one pixel-remapped backdrop", () => {
    assert.match(
      flytingStyles,
      /\.liveShell\[data-debate-format="flyting"\] \.flytingCourtGallery\s*\{[\s\S]{0,180}--debate-gallery-atmosphere:\s*none/u,
    );
    assert.doesNotMatch(
      flytingStyles,
      /url\("\/debate\/flyting\/mead-hall-gallery-floor/u,
    );
    assert.match(
      flytingStyles,
      /\.flytingRgbKeyedBackdrop\[data-flyting-rgb-key-scene="gallery"\]\s*\{[^}]*object-position:\s*center 58%/u,
    );
    assert.match(flytingSource, /"--flyting-rug-glyph-color": color/u);
    assert.match(flytingStyles, /var\(--flyting-rug-glyph-color\)/u);
    assert.match(flytingSource, /galleryModeratorRugGlyph/u);
    assert.match(
      flytingSource,
      /\["for", forBot, forColor\],\s*\["moderator", hostBot, hostColor\],\s*\["against", againstBot, againstColor\]/u,
    );
    assert.equal(
      [
        ...flytingSource.matchAll(
          /\["moderator", props\.session\.moderator, hostColor\]/gu,
        ),
      ].length,
      2,
    );
  });

  it("aligns Flyting mini eyes and enlarges gallery buckle glyphs", () => {
    assert.match(
      flytingStyles,
      /\.liveShell[\s\S]{0,160}\[data-chat-mini-bot-avatar="true"\][\s\S]{0,120}\[data-coffee-plate-emoji-part="eyes"\][\s\S]{0,80}translate:\s*0 3px/u,
    );
    assert.match(
      flytingStyles,
      /\.flytingAudiencePortrait > \[data-chat-mini-bot-avatar="true"\][\s\S]{0,180}--chat-mini-bot-glyph-size:\s*max\(\s*10px,\s*calc\(var\(--chat-mini-bot-render-size\) \* 0\.16\)\s*\) !important/u,
    );
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
    assert.doesNotMatch(
      flytingStyles,
      /flex:\s*0 1 clamp\(48px, 5\.1vw, 76px\)/u,
    );
  });

  it("centers complete heraldry on banner surfaces and follows the rugs' shared floor plane", () => {
    assert.match(flytingStyles, /\[data-role="for"\] \{\s*top: calc\(45\.5%/u);
    assert.match(
      flytingStyles,
      /left: calc\(35\.25% \+ var\(--flyting-align-x/u,
    );
    assert.match(
      flytingStyles,
      /left: calc\(64\.75% \+ var\(--flyting-align-x/u,
    );
    assert.match(flytingSource, /wideModeratorHeraldry/u);
    assert.match(flytingSource, /moderatorModeratorHeraldry/u);
    assert.match(flytingStyles, /perspective\(170px\) rotateX\(61deg\)/u);
    assert.match(flytingStyles, /left: calc\(17\.25%/u);
    assert.match(
      flytingStyles,
      /\.galleryRugGlyphs > span\[data-role="moderator"\]\s*\{\s*left: calc\(50%/u,
    );
    assert.match(flytingStyles, /left: calc\(82\.75%/u);
    assert.doesNotMatch(
      flytingStyles,
      /\[data-role="for"\][\s\S]{0,160}--flyting-rug-glyph-skew/u,
    );
    assert.doesNotMatch(
      flytingStyles,
      /\[data-role="against"\][\s\S]{0,160}--flyting-rug-glyph-skew/u,
    );
  });

  it("keeps stage nameplates on one Wide baseline and lets helmets overflow", () => {
    assert.match(
      flytingStyles,
      /\.hallCamera\[data-camera-view="wide"\] \.courtIdentityPosition\s*\{\s*top:\s*auto;\s*bottom:\s*calc\(20%/u,
    );
    assert.match(
      flytingStyles,
      /\.courtBotPosition,[\s\S]{0,160}\.flytingAudiencePortrait\s*\{\s*overflow:\s*visible/u,
    );
    assert.match(
      flytingStyles,
      /\.galleryVikingHelmet\s*\{[^}]*top:\s*-54%;[^}]*width:\s*166%;[^}]*scaleY\(0\.92\)/u,
    );
  });

  it("explains the full alignment workflow in the authoring panel", () => {
    assert.match(flytingSource, /drag its gold outline directly on/u);
    assert.match(flytingSource, /Use the fields for the final nudge/u);
    assert.match(flytingSource, /paste back into chat/u);
  });
});
