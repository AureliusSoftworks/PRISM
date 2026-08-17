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
    /"full" \| "compact" \| "reduced" \| "audience" \| "debate"/u,
  );
  assert.match(pageSource, /staticAudiencePortrait[\s\S]*"audience"/u);
  assert.match(pageSource, /data-debate-optimized-avatar="true"/u);
  assert.match(pageSource, /detailLevel=\{avatarDetailsDetailLevel\}/u);
  assert.match(
    pageSource,
    /staticRaster=\{renderDetailLevel === "audience"\}/u,
  );
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
  assert.match(debateSource, /acquirePrismLivingSession\("debate"/u);
  assert.match(debateSource, /spectatorWatchPresentationCompleteRef/u);
  assert.match(
    debateSource,
    /bypassCooldown:\s*true/u,
  );
  assert.match(
    debateSource,
    /acquirePrismLivingSession so ordinary minimize keeps audio/u,
  );
  assert.doesNotMatch(
    debateSource,
    /setInterval\(\(\) => \{\s*const now = Date\.now\(\);\s*setJudgeGavelNowMs/u,
  );
});

test("arriving gallery seats stay opaque once seated", () => {
  assert.match(
    debateCss,
    /\.live\[data-debate-room-presence="arriving"\]\s*\.debateAudienceBotPortrait\[data-gallery-arrived="true"\]\s*\{\s*opacity:\s*1/u,
  );
});

test("talking gallery seats animate compact mouths without waking the full portrait", () => {
  assert.match(
    debateSource,
    /const galleryTalking = ambientTalking;/u,
  );
  assert.match(
    debateSource,
    /if \(!props\.audienceTalkingAudioAudible \|\| !props\.audienceChattering\)[\s\S]{0,300}window\.setInterval\([\s\S]{0,300}setMouthPhase/u,
  );
  assert.match(
    debateSource,
    /\(index \+ mouthPhase\) % DEBATE_AUDIENCE_MOUTH_SHAPES\.length/u,
  );
  assert.match(
    debateSource,
    /const DEBATE_AUDIENCE_MOUTH_SHAPES = \[\s*"speech-closed",\s*"open-wide",\s*\]/u,
  );
  assert.match(
    debateSource,
    /talking: false,[\s\S]{0,140}foleyMouthShape/u,
  );
  assert.match(
    debateSource,
    /props\.audienceTalkingAudioAudible &&[\s\S]{0,100}props\.audienceChattering &&[\s\S]{0,180}props\.audiencePressureTalkerIndices\.has\(index\)/u,
  );
  assert.match(
    debateSource,
    /const galleryTalkingAudioAudible = Boolean\([\s\S]{0,180}liveGalleryUsesCrosstalk &&[\s\S]{0,100}galleryMixWithVolume\.grain > 0\.001/u,
  );
  assert.match(
    debateSource,
    /debateAudienceTalkerIndices\(\{[\s\S]{0,180}formality: session\.formality/u,
  );
  assert.match(
    pageSource,
    /staticAudiencePortrait[\s\S]{0,6500}<ChatMiniBotAvatar/u,
  );
  assert.match(
    pageSource,
    /avatarState\.foleyMouthShape \?\?[\s\S]{0,120}galleryTalking \? "speech-closed" : "closed"/u,
  );
  assert.match(
    pageSource,
    /const galleryMouthShape = authoredMiniPortrait[\s\S]{0,400}avatarState\.foleyMouthShape/u,
  );
  assert.match(pageSource, /motionMode="mini-led"/u);
  assert.doesNotMatch(pageSource, /galleryTalking && faceStyle\.mouthAnimation === "none"/u);
  assert.match(
    pageSource,
    /debateAudienceRandom\([\s\S]{0,120}`mood:\$\{debateLiveSessionId \?\? "setup"\}:\$\{botSnapshot\.id\}`[\s\S]{0,40}\)\(\)/u,
  );
  assert.match(pageSource, /color=\{debateAvatarAccentColor\}/u);
  assert.match(
    debateCss,
    /\.debateAudienceBotPortrait > \[data-chat-mini-bot-avatar="true"\]\s*\{[^}]*width:\s*132%[^}]*height:\s*auto[^}]*aspect-ratio:\s*1/u,
  );
});

test("the Moderator uses the authored mini form in wide, left, and right cameras", () => {
  assert.match(
    debateSource,
    /debateAvatarPresentation\(\{[\s\S]{0,120}consumer: "forum"[\s\S]{0,120}cameraView: stageAlignmentPreviewCamera/u,
  );
  assert.match(
    pageSource,
    /const moderatorMiniPortrait =[\s\S]{0,140}avatarState\.consumer === "forum"[\s\S]{0,100}avatarState\.role === "moderator"[\s\S]{0,100}avatarState\.presentation === "mini"/u,
  );
  assert.match(
    pageSource,
    /className=\{[\s\S]{0,120}moderatorMiniPortrait[\s\S]{0,120}\? styles\.debateModeratorMiniAvatar/u,
  );
  assert.match(
    pageCss,
    /\.debateModeratorMiniAvatar\[data-size="room"\][\s\S]{0,120}width:\s*100%[\s\S]{0,80}height:\s*100%/u,
  );
  assert.doesNotMatch(pageSource, /stageAlignmentPreview/u);
});

test("Debate actors stay full while distant Moderator and Jury use explicit mini consumers", () => {
  assert.match(
    debateSource,
    /consumer: "forum"[\s\S]{0,120}role,[\s\S]{0,120}cameraView/u,
    "the live forum resolves presentation from its actual camera view",
  );
  assert.match(
    debateSource,
    /consumer: "forum"[\s\S]{0,140}cameraView: stageAlignmentPreviewCamera/u,
    "Stage Placement should preview the same camera-owned quality boundary",
  );
  assert.match(
    debateSource,
    /consumer: "jury"[\s\S]{0,180}debateAvatarPresentation\(\{[\s\S]{0,100}consumer: "jury"/u,
    "Jury seats use their explicit compact consumer policy",
  );
  assert.match(
    pageSource,
    /const debateAvatarDetailLevel = staticAudiencePortrait[\s\S]{0,100}\? "audience"[\s\S]{0,40}: "full"/u,
  );
  assert.match(pageSource, /detailLevel=\{debateAvatarDetailLevel\}/u);
  assert.match(
    pageSource,
    /data-debate-avatar-quality=\{[\s\S]{0,100}"hd"[\s\S]{0,40}"mini"/u,
  );
});
