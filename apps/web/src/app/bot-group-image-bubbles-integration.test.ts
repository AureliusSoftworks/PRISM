import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const plannerSource = readFileSync(
  new URL("./botGroupImageBubbles.ts", import.meta.url),
  "utf8",
);

function sourceSlice(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source marker: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source marker: ${end}`);
  return pageSource.slice(startIndex, endIndex);
}

describe("bot group image bubble integration", () => {
  it("keeps the planner pure, deterministic, and outside persistence", () => {
    assert.doesNotMatch(
      plannerSource,
      /\b(?:fetch|api|localStorage|sessionStorage|indexedDB|Math\.random|Date\.now|setTimeout|setInterval|requestAnimationFrame)\b/,
    );
    assert.doesNotMatch(plannerSource, /conversation|transcript|memory/i);
    assert.match(plannerSource, /stableHash/);
    assert.match(plannerSource, /image\.hasLocalFile !== true/);
    assert.match(plannerSource, /image\.purpose \?\? "gallery"/);
  });

  it("hydrates one bounded authenticated directory without loading remote image URLs", () => {
    const startupSlice = sourceSlice(
      "async function refreshImagesChatCanvasDirectory",
      "/** Refreshes bot tallies",
    );
    assert.match(startupSlice, /"\/api\/images\?limit=200"/);
    assert.match(startupSlice, /setImageBotDirectorySnapshot\(d\.images\)/);
    assert.doesNotMatch(startupSlice, /displayUrl|\.url|\/generate/);

    const renderSlice = sourceSlice(
      "const renderBotGroupImageBubbles",
      "const handleBotGroupWaitingRoomPresenceClick",
    );
    assert.match(renderSlice, /image\.hasLocalFile !== true/);
    assert.match(renderSlice, /apiGeneratedImageThumbUrl\(image\.id\)/);
    assert.doesNotMatch(renderSlice, /galleryTileImageSrc|image\.url|fetch\(/);
  });

  it("fails closed for private, stale, and inaccessible records", () => {
    assert.match(pageSource, /!appWidePrivateMode/);
    assert.match(pageSource, /privateImageIds: imagePrivateGeneratedIds/);
    assert.match(pageSource, /failedImageIds: \[\.\.\.botGroupFailedImageIds\]/);
    assert.match(pageSource, /memberBotIds: botGroupWaitingRoomCanonicalBotIds/);
    assert.match(pageSource, /setBotGroupFailedImageIds/);
    assert.match(
      pageSource,
      /const failedImageId = imageLightbox\.id;[\s\S]*closeImageLightbox\(\);/,
    );
    assert.doesNotMatch(plannerSource, /displayUrl \?\?|\.url/);
  });

  it("uses native keyboard controls and a shared focus-restoring image detail dialog", () => {
    const renderSlice = sourceSlice(
      "const renderBotGroupImageBubbles",
      "const handleBotGroupWaitingRoomPresenceClick",
    );
    assert.match(renderSlice, /<ul[\s\S]*aria-label=/);
    assert.match(renderSlice, /<button[\s\S]*aria-label=\{label\}/);
    assert.match(renderSlice, /disabled=\{receded\}/);
    assert.match(renderSlice, /aria-hidden=\{receded \? true : undefined\}/);
    assert.match(pageSource, /imageLightboxReturnFocusRef/);
    assert.match(pageSource, /returnFocus\?\.isConnected/);
    assert.match(pageSource, /Bot group filter:/);
    assert.match(pageSource, /imageLightboxCloseRef\.current\?\.focus\(\)/);
    assert.match(pageSource, /event\.key !== "Tab"/);
    assert.match(pageSource, /event\.key === "Escape"/);
  });

  it("pins safe hit targets, calm motion, and reduced-motion behavior", () => {
    assert.match(
      cssSource,
      /\.botGroupImageBubble\s*\{[\s\S]*width: max\(44px,[\s\S]*height: max\(44px,/,
    );
    assert.match(
      cssSource,
      /\.botGroupImageBubbleLayer\[data-receded="true"\][\s\S]*animation-play-state: paused/,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.botGroupImageBubbleVisual[\s\S]*animation: none !important/,
    );
    assert.match(cssSource, /\.botGroupHeroStage[\s\S]*width: min\(1040px/);
    assert.match(cssSource, /\.botGroupWaitingRoom[\s\S]*overflow: hidden/);
  });

  it("keeps group vision mounted through focus and ignores roamer churn", () => {
    const lifecycleSlice = sourceSlice(
      "const botGroupImageBubblesEnabled",
      "useEffect(() => {\n    if (!emptyStateSearchActive)",
    );
    assert.doesNotMatch(
      lifecycleSlice.slice(
        0,
        lifecycleSlice.indexOf("const botGroupImageBubbleViewport"),
      ),
      /zenPersonaBot === null/,
    );
    assert.match(lifecycleSlice, /botGroupImageBubbleLayoutViewport/);
    assert.match(
      lifecycleSlice,
      /occupiedPresences: botGroupWaitingRoomAmbientPlacements\.filter\([\s\S]*?role === "anchor"/,
    );
    assert.match(
      cssSource,
      /\.botGroupImageBubbleLayer\[data-receded="true"\]/,
    );
    assert.equal(
      pageSource.match(/renderBotGroupImageBubbles\(/g)?.length,
      2,
    );
    assert.match(
      pageSource,
      /activeBotLibraryGroupFilter[\s\S]*?renderBotGroupImageBubbles\([\s\S]*?botGroupWaitingRoomEligible/,
    );
    assert.match(
      cssSource,
      /\.emptyState > \.botGroupImageBubbleLayer\s*\{[\s\S]*?width: min\(1040px/,
    );
  });
});
