import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const debateCss = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const pageCss = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const avatarDetailsSource = readFileSync(
  new URL("./AvatarDetailsMask.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

test("speech progress is isolated through the session presentation store", () => {
  assert.match(debateSource, /createDebatePresentationStore/u);
  assert.match(debateSource, /DebateLiveCaptionConsumer/u);
  assert.match(debateSource, /DebateTurnClockConsumer/u);
  assert.match(debateSource, /DebateActiveAvatarConsumer/u);
  assert.match(debateSource, /DebateTranscriptBodyConsumer/u);
  assert.match(
    debateSource,
    /presentationStore\.getSnapshot\(\)[\s\S]*heardCharacterCount/u,
  );
});

test("DOM adaptation changes materials, never cast size or semantic motion", () => {
  assert.match(debateSource, /data-debate-material-quality/u);
  assert.match(debateSource, /useDebateDomPerformance/u);
  assert.match(
    debateSource,
    /count: debateAudienceBotCount\(props\.graphicsQuality\)/u,
  );
  assert.doesNotMatch(
    debateSource,
    /debateAudienceBotCount\(debateMaterialQuality\)/u,
  );
  assert.match(debateCss, /data-debate-material-quality="balanced"/u);
  assert.match(debateCss, /data-debate-material-quality="minimal"/u);
  assert.match(debateCss, /debate-audience-live-reaction/u);
  assert.doesNotMatch(debateSource, /<DebateForumScene/u);
});

test("Retina-wide materials avoid live backdrop sampling and permanent camera promotion", () => {
  const focusRule =
    debateCss.match(/\.debaterFocusDepthOverlay\s*\{[^}]*\}/u)?.[0] ?? "";
  const captionRule = debateCss.match(/\.liveCaption\s*\{[^}]*\}/u)?.[0] ?? "";
  const cameraRule = debateCss.match(/\.forumCamera\s*\{[^}]*\}/u)?.[0] ?? "";
  assert.doesNotMatch(focusRule, /backdrop-filter/u);
  assert.doesNotMatch(captionRule, /backdrop-filter/u);
  assert.doesNotMatch(cameraRule, /will-change/u);
  assert.match(debateCss, /contain: layout paint style/u);
});

test("audience detail keeps avatars while removing hidden material passes and idle filters", () => {
  assert.match(
    pageSource,
    /"full" \| "reduced" \| "audience" \| "debate"/u,
  );
  assert.match(pageSource, /staticAudiencePortrait[\s\S]*"audience"/u);
  assert.match(pageSource, /data-debate-optimized-avatar="true"/u);
  assert.match(pageSource, /detailLevel=\{avatarDetailsDetailLevel\}/u);
  assert.match(pageSource, /staticRaster=\{detailLevel === "audience"\}/u);
  assert.match(
    avatarDetailsSource,
    /data-avatar-details-rendering="static-raster"/u,
  );
  assert.match(pageCss, /debateOptimizedEmissionMask::before/u);
  assert.match(pageCss, /data-debate-role="audience"[\s\S]*animation: none/u);
});

test("performance adaptation adds no player-facing setting or tutorial step", () => {
  assert.doesNotMatch(debateSource, /debate-performance-toggle/u);
  assert.doesNotMatch(tutorialSource, /material quality|performance tier/iu);
});

test("audience materials throttle without removing semantic reactions", () => {
  assert.match(debateSource, /debateAudienceMaxReactingSeats/u);
  assert.match(debateSource, /debateAudienceAllowsFaceOpen/u);
  assert.match(debateSource, /debateAudienceAllowsTransformBounce/u);
  assert.match(debateSource, /debateAudienceVisualPressureBand/u);
  assert.match(debateSource, /allowFaceOpen=\{allowFaceOpen\}/u);
  assert.match(debateSource, /allowTransformBounce=\{allowTransformBounce\}/u);
  assert.match(debateSource, /DebateLiveAudienceGallery/u);
  assert.match(debateSource, /data-audience-bounce/u);
  assert.doesNotMatch(
    debateCss,
    /data-debate-material-quality="minimal"[^}]*data-audience-bounce[^{]*\{[^}]*animation:\s*none/u,
  );
  assert.match(debateSource, /DEBATE_AUTO_ADVANCE_DELAY_MS/u);
  assert.match(debateSource, /DebateDeadlineCountdown/u);
  assert.match(debateSource, /reuseDebateSessionEventPrefix/u);
  assert.match(debateSource, /presentationSuspended/u);
  assert.match(debateSource, /usePrismPresentationSuspended/u);
  assert.match(debateSource, /usePrismAppAwayFromUser/u);
  assert.match(debateSource, /waitWhilePrismPresentationSuspended/u);
  assert.match(debateSource, /spectatorWatchPresentationCompleteRef/u);
  assert.match(
    debateSource,
    /bypassCooldown:\s*true/u,
  );
  assert.match(
    debateSource,
    /Leaving the app must recess/u,
  );
  assert.doesNotMatch(
    debateSource,
    /setInterval\(\(\) => \{\s*const now = Date\.now\(\);\s*setJudgeGavelNowMs/u,
  );
});
