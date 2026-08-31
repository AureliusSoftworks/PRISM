import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_JURY_SIZE,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_PARTICIPANT_BOT_ID,
  DEBATE_SCHEMA_VERSION,
  debateEventIsTranscriptHousekeeping,
  type DebateSessionV1,
} from "@localai/shared";
import {
  applyDebateSetupPreset,
  copyDebateMotionSlate,
  debateAlignmentPreviewCast,
  debateEvidenceSourcePropKind,
  debateGalleryArrivalShouldMaskStage,
  debateMotionRevealState,
  debatePlayerRoleAfterFormatSelection,
  debatePlayerJudgePrefilledCast,
  debatePrefilledCast,
  debateRoomPresence,
  debateSessionRetryDraft,
  derivedDebateSetupPresetId,
  mergeDebateEvidenceSources,
  randomDebateCast,
  randomDebatePlayerJudgeCast,
  resolveDebateSurpriseCast,
} from "./debateExperienceState.ts";

const source = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);
const flytingSource = readFileSync(
  fileURLToPath(new URL("./DebateFlyting.tsx", import.meta.url)),
  "utf8",
);
const flytingCss = readFileSync(
  fileURLToPath(new URL("./DebateFlyting.module.css", import.meta.url)),
  "utf8",
);
const flytingHelmetKey = readFileSync(
  fileURLToPath(
    new URL(
      "../../public/debate/flyting/viking-helmet-accent-key.svg",
      import.meta.url,
    ),
  ),
  "utf8",
);
const flytingShieldKey = readFileSync(
  fileURLToPath(
    new URL(
      "../../public/debate/flyting/viking-shield-accent-key.svg",
      import.meta.url,
    ),
  ),
  "utf8",
);
const flytingLeftHallKey = readFileSync(
  fileURLToPath(
    new URL(
      "../../public/debate/flyting/mead-hall-left-accent-key.svg",
      import.meta.url,
    ),
  ),
  "utf8",
);
const flytingHostHallKey = readFileSync(
  fileURLToPath(
    new URL(
      "../../public/debate/flyting/mead-hall-host-accent-key.svg",
      import.meta.url,
    ),
  ),
  "utf8",
);
const flytingRightHallKey = readFileSync(
  fileURLToPath(
    new URL(
      "../../public/debate/flyting/mead-hall-right-accent-key.svg",
      import.meta.url,
    ),
  ),
  "utf8",
);
const flytingJarlThronePath = fileURLToPath(
  new URL(
    "../../public/debate/flyting/jarl-throne-keyed-base.webp",
    import.meta.url,
  ),
);
const flytingMeadHallPath = fileURLToPath(
  new URL(
    "../../public/debate/flyting/mead-hall-keyed-base.webp",
    import.meta.url,
  ),
);
const flytingParticipantHelmetBasePath = fileURLToPath(
  new URL(
    "../../public/debate/flyting/viking-participant-helmet-base.png",
    import.meta.url,
  ),
);
const flytingParticipantHelmetKeyPath = fileURLToPath(
  new URL(
    "../../public/debate/flyting/viking-participant-helmet-accent-key.png",
    import.meta.url,
  ),
);
const flytingMiniPixelCrownBasePath = fileURLToPath(
  new URL(
    "../../public/debate/flyting/viking-pixel-crown-base.png",
    import.meta.url,
  ),
);
const flytingMiniPixelCrownKeyPath = fileURLToPath(
  new URL(
    "../../public/debate/flyting/viking-pixel-crown-accent-key.png",
    import.meta.url,
  ),
);
const flytingGalleryFloorPath = fileURLToPath(
  new URL(
    "../../public/debate/flyting/mead-hall-gallery-floor.webp",
    import.meta.url,
  ),
);
const evidenceDocumentSource = readFileSync(
  fileURLToPath(new URL("./DebateEvidenceDocument.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("./DebateExperience.module.css", import.meta.url)),
  "utf8",
);
const mysteryV2Css = readFileSync(
  fileURLToPath(new URL("./debateMysteryV2.module.css", import.meta.url)),
  "utf8",
);
const mysteryCss = readFileSync(
  fileURLToPath(new URL("./debateMystery.module.css", import.meta.url)),
  "utf8",
);
const archiveAssetsSource = readFileSync(
  fileURLToPath(new URL("./DebateArchiveAssetsModal.tsx", import.meta.url)),
  "utf8",
);
const assetLibraryCss = readFileSync(
  fileURLToPath(new URL("./AssetLibrary.module.css", import.meta.url)),
  "utf8",
);
const forumSceneSource = readFileSync(
  fileURLToPath(new URL("./DebateForumScene.tsx", import.meta.url)),
  "utf8",
);
const forumAccentKeysSource = readFileSync(
  fileURLToPath(new URL("./DebateForumAccentKeyLayers.tsx", import.meta.url)),
  "utf8",
);
const page = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);

it("annotates routed Debate turns and publishes the newest Auto route", () => {
  assert.match(
    source,
    /Generation: \$\{debateEventGenerationAnnotation\(event, session\.lastReasoningEffort \?\? "auto"\)\}/u,
  );
  assert.match(source, /Auto → /u);
  assert.match(source, /Effort \$\{DEBATE_ARCHIVE_EFFORT_LABELS\[effort\]\}/u);
  assert.match(source, /Recovered after \$\{attempts\}/u);
  assert.match(source, /latestDebateActualAutoRoute\(activeSession\)/u);
  assert.match(source, /onActualAutoRouteChange\?\.\(/u);
});

it("keeps DOM frame diagnostics active for Whodunnit playback", () => {
  assert.match(
    source,
    /useDebateDomPerformance\(\{[\s\S]{0,180}active:\s*\(view === "live" \|\| view === "mystery"\)[\s\S]{0,120}activeSession\.status !== "paused"/u,
  );
});

it("opens executable Flyting beside the available Debate formats", () => {
  assert.match(source, /option\.availability === "available"/u);
  assert.match(source, /<DebateFlytingSetup/u);
  assert.match(source, /<DebateFlytingLive/u);
  assert.match(source, /"debate-format-flyting"/u);
  assert.match(flytingSource, /Boast · Flyte · Rejoinder · Acclamation/u);
  assert.match(flytingSource, /No timer · four exchanges/u);
  assert.match(flytingSource, /studioStyles\.dashboard/u);
  assert.match(flytingSource, /studioStyles\.studioNav/u);
  assert.match(flytingSource, /studioStyles\.dashboardDesk/u);
  assert.match(flytingSource, /studioStyles\.dashboardRail/u);
  assert.match(flytingSource, /data-debate-format="flyting"/u);
  assert.match(flytingSource, /DEBATE_FORMAT_VISUAL_THEMES\.flyting/u);
  assert.match(flytingSource, /FlytingAtmosphereControl/u);
  assert.match(flytingSource, /data-disabled="true"/u);
  assert.match(flytingSource, /--debate-rowdiness-progress/u);
  assert.match(flytingSource, /DEBATE_FORMAT_CATALOG\.filter/u);
  assert.match(flytingSource, /flytingCoachChoice/u);
  assert.match(flytingSource, /onFormatChange/u);
  assert.match(flytingSource, /Mead Hall floor/u);
  assert.match(flytingSource, /Proceeding card/u);
  assert.match(flytingSource, /Pro · left/u);
  assert.match(flytingSource, /Con · right/u);
  assert.match(
    flytingSource,
    /\[\s*"for",\s*props\.session\.forAdvocate,\s*forColor,\s*"Pro",?\s*\]/u,
  );
  assert.match(
    flytingSource,
    /\[\s*"against",\s*props\.session\.againstAdvocate,\s*againstColor,\s*"Con",?\s*\]/u,
  );
  assert.match(flytingSource, /PRISM fills the gallery/u);
  assert.doesNotMatch(flytingSource, /Four Hall members/u);
  assert.doesNotMatch(flytingSource, /const \[jurorBotIds, setJurorBotIds\]/u);
  assert.doesNotMatch(flytingSource, /jurorBotIds,/u);
  assert.match(
    flytingSource,
    /data-flyting-bot-avatar=\{\s*role === "moderator" \? "host" : role\s*\}/u,
  );
  assert.match(flytingSource, /className=\{styles\.galleryVikingHelmet\}/u);
  assert.match(
    flytingSource,
    /className=\{styles\.moderatorPixelVikingHelmet\}/u,
  );
  assert.match(flytingSource, /className=\{styles\.moderatorVikingHelmet\}/u);
  assert.match(flytingSource, /cameraView === "moderator"/u);
  assert.match(flytingSource, /liveHeaderDockSpace/u);
  assert.doesNotMatch(flytingSource, /Leave Hall/u);
  assert.match(flytingSource, /renderBotAvatar/u);
  assert.match(source, /renderBotAvatar=\{props\.renderBotAvatar\}/u);
  assert.match(flytingSource, /FlytingVoiceLifecycle/u);
  assert.match(flytingSource, /speechTiming/u);
  assert.match(
    flytingSource,
    /setVoiceActiveEventId\(event\.id\)[\s\S]{0,120}if \(durationMs === null\) return/u,
  );
  assert.match(flytingSource, /fallbackMouthShape/u);
  assert.match(flytingSource, /FLYTING_CAMERA_VIEWS/u);
  assert.match(flytingSource, /studioStyles\.forumCamera/u);
  assert.match(flytingSource, /studioStyles\.botPosition/u);
  assert.match(flytingSource, /studioStyles\.debateAudienceRow/u);
  assert.match(flytingSource, /studioStyles\.debateAudienceLayer/u);
  assert.match(flytingSource, /studioStyles\.debateAudienceBotPortrait/u);
  assert.match(flytingSource, /studioStyles\.debateAudienceStatus/u);
  assert.match(flytingSource, /debateAudienceSeatLayout/u);
  assert.match(flytingSource, /debateAudienceConversationFacing/u);
  assert.match(flytingSource, /debateFlytingAudienceMillingPlan/u);
  assert.match(
    flytingSource,
    /DEBATE_FLYTING_AUDIENCE_COUNT \+ DEBATE_FLYTING_JARL_GUARD_COUNT/u,
  );
  assert.match(flytingSource, /debateFlytingHallNpcBots/u);
  assert.match(
    flytingSource,
    /return normalizeDebateFlytingFormatStateV1\(session\.formatState\)/u,
  );
  assert.match(flytingSource, /state\.hallMembers/u);
  assert.match(flytingSource, /state\.jarlGuards/u);
  assert.match(flytingSource, /data-flyting-leaning/u);
  assert.match(flytingSource, /data-flyting-guard/u);
  assert.match(flytingSource, /data-audience-bounce/u);
  assert.match(flytingSource, /"open-small"[\s\S]{0,80}"speech-closed"/u);
  assert.match(flytingSource, /DEBATE_AUDIENCE_MURMUR_URL/u);
  assert.match(flytingSource, /DEBATE_AUDIENCE_CROSSTALK_URL/u);
  assert.match(flytingSource, /◇ Wield PRISM/u);
  assert.match(flytingSource, /Yield · leave unanswered/u);
  assert.match(flytingSource, /Hall Record/u);
  assert.match(flytingSource, /debateFlytingHallPresentation/u);
  assert.match(flytingSource, /"--flyting-lane-left": forColor/u);
  assert.match(flytingSource, /"--flyting-lane-host": hostColor/u);
  assert.match(flytingSource, /"--flyting-lane-right": againstColor/u);
  assert.match(flytingSource, /flytingKeyVisibilityBoost/u);
  assert.match(flytingCss, /--flyting-lane-right-key-boost/u);
  assert.match(flytingSource, /normalizeBotIdentityColor/u);
  assert.doesNotMatch(flytingSource, /#(?:ff0000|00ff00|0000ff)/iu);
  assert.match(flytingCss, /\.hallStage/u);
  assert.match(flytingCss, /mead-hall-keyed-base\.webp/u);
  assert.match(flytingCss, /jarl-throne-keyed-base\.webp/u);
  assert.match(flytingCss, /viking-participant-helmet-base\.png/u);
  assert.match(flytingCss, /viking-participant-helmet-accent-key\.png/u);
  assert.match(flytingCss, /viking-pixel-crown-base\.png/u);
  assert.match(flytingCss, /viking-pixel-crown-accent-key\.png/u);
  assert.match(
    flytingCss,
    /\.keyedVikingHelmet\s*\{[^}]*viking-participant-helmet-base\.png[^}]*\}/u,
  );
  assert.doesNotMatch(
    /\.keyedVikingHelmet\s*\{([^}]*)\}/u.exec(flytingCss)?.[1] ?? "",
    /image-rendering:\s*pixelated/u,
  );
  assert.match(
    flytingCss,
    /\.galleryVikingHelmet\s*\{[^}]*viking-pixel-crown-base\.png[^}]*image-rendering:\s*pixelated/u,
  );
  assert.match(
    flytingCss,
    /\.moderatorPixelVikingHelmet\s*\{[^}]*viking-pixel-crown-base\.png[^}]*image-rendering:\s*pixelated/u,
  );
  assert.match(
    flytingCss,
    /\.moderatorVikingHelmet\s*\{[^}]*viking-participant-helmet-base\.png[^}]*\}/u,
  );
  assert.match(
    flytingCss,
    /data-camera-view="wide"[\s\S]{0,220}--debate-moderator-face-only-offset-y:\s*clamp\(12px, 1vw, 17px\)/u,
  );
  assert.match(
    flytingCss,
    /data-camera-view="moderator"[\s\S]{0,220}--debate-moderator-face-only-offset-y:\s*clamp\(4px, 0\.42vw, 7px\)/u,
  );
  assert.match(flytingCss, /image-rendering:\s*pixelated/u);
  assert.match(flytingCss, /\.hallFixtureLight/u);
  assert.match(flytingCss, /@keyframes flyting-candle-flicker/u);
  assert.match(flytingCss, /mix-blend-mode:\s*screen/u);
  assert.doesNotMatch(flytingSource, /Array\.from\(\{ length: 8 \}/u);
  assert.match(
    flytingCss,
    /\.hallCamera\[data-camera-view="moderator"\] \.hallFixtureLight\s*\{[^}]*display:\s*none/u,
  );
  assert.match(flytingCss, /aspect-ratio:\s*2\.35 \/ 1/u);
  assert.match(
    flytingCss,
    /\.courtIdentityPosition\[data-role="for"\],[\s\S]{0,100}\.courtIdentityPosition\[data-role="against"\][\s\S]{0,100}top:\s*calc\(90% \+ var\(--flyting-align-y, 0%\)\)/u,
  );
  assert.match(
    flytingCss,
    /data-camera-view="left"\], \[data-camera-view="right"\]\)[\s\S]{0,130}\.courtIdentityPosition:is\([\s\S]{0,140}top:\s*calc\(81% \+ var\(--flyting-align-y, 0%\)\)/u,
  );
  assert.match(flytingCss, /\.hostShield/u);
  assert.match(flytingCss, /\.flytingCourtGallery/u);
  assert.match(flytingCss, /\.flytingAudienceMillingSlot/u);
  assert.match(flytingCss, /@keyframes flyting-gallery-milling/u);
  assert.match(flytingSource, /className=\{styles\.hallHeraldryGlyphs\}/u);
  assert.match(flytingSource, /className=\{styles\.galleryRugGlyphs\}/u);
  assert.match(flytingCss, /perspective\(180px\) rotateX\(61deg\)/u);
  assert.match(flytingCss, /\.galleryVikingHelmet/u);
  assert.match(
    flytingCss,
    /\.flytingAudiencePortrait::before,[\s\S]{0,80}\.flytingAudiencePortrait::after[\s\S]{0,60}display: none/u,
  );
  assert.match(
    flytingCss,
    /\.flytingAudienceCluster\[data-flyting-leaning="for"\]/u,
  );
  assert.match(
    flytingCss,
    /\.flytingAudienceCluster\[data-flyting-leaning="against"\]/u,
  );
  assert.doesNotMatch(flytingSource, /data-flyting-hall-asset="banner"/u);
  assert.doesNotMatch(flytingSource, /className=\{styles\.hallBanner/u);
  assert.doesNotMatch(flytingSource, /data-flyting-hall-asset="shield"/u);
  assert.match(flytingSource, /data-flyting-hall-asset="participant-helmet"/u);
  assert.match(flytingSource, /data-flyting-hall-asset="mini-pixel-crown"/u);
  assert.match(flytingSource, /className=\{styles\.hallFixtureLight\}/u);
  assert.doesNotMatch(flytingSource, /data-candle=/u);
  assert.doesNotMatch(flytingSource, /hearth-fire-proof\.gif/u);
  assert.doesNotMatch(flytingSource, /mead-hall-gallery-rug-keys\.svg/u);
  assert.doesNotMatch(flytingSource, /<DebateForumAccentKeys/u);
  assert.match(flytingSource, /Flyt desk/u);
  assert.match(flytingSource, /Live transcript/u);
  assert.match(flytingSource, /className=\{styles\.hallAccentKeys\}/u);
  assert.match(flytingCss, /mead-hall-left-key\.png/u);
  assert.match(flytingCss, /mead-hall-host-key\.png/u);
  assert.match(flytingCss, /mead-hall-right-key\.png/u);
  assert.match(flytingCss, /jarl-throne-left-key\.png/u);
  assert.match(flytingCss, /jarl-throne-host-key\.png/u);
  assert.match(flytingCss, /jarl-throne-right-key\.png/u);
  assert.match(flytingCss, /background-blend-mode:\s*overlay/u);
  assert.doesNotMatch(flytingCss, /mix-blend-mode:\s*overlay/u);
  assert.doesNotMatch(flytingSource, /className=\{styles\.hallPrism\}/u);
  assert.ok(existsSync(flytingMeadHallPath));
  assert.ok(existsSync(flytingJarlThronePath));
  assert.ok(existsSync(flytingParticipantHelmetBasePath));
  assert.ok(existsSync(flytingParticipantHelmetKeyPath));
  assert.ok(existsSync(flytingMiniPixelCrownBasePath));
  assert.ok(existsSync(flytingMiniPixelCrownKeyPath));
  assert.ok(existsSync(flytingGalleryFloorPath));
  assert.match(flytingHelmetKey, /#FF00FF/u);
  assert.match(flytingShieldKey, /#FF00FF/u);
  assert.match(flytingLeftHallKey, /#FF0000/u);
  assert.match(flytingHostHallKey, /#00FF00/u);
  assert.match(flytingRightHallKey, /#0000FF/u);
  assert.match(flytingCss, /\.studioReadout/u);
  assert.match(flytingCss, /\.changeFormatAction/u);
});

it("exports Flyting-native review provenance and voices Jarl acclamations", () => {
  const formatterStart = source.indexOf(
    "export function formatDebateVerboseTranscript",
  );
  const formatterEnd = source.indexOf(
    "export function formatDebateCompleteReviewClipboard",
    formatterStart,
  );
  const formatter = source.slice(formatterStart, formatterEnd);
  assert.match(formatter, /formatDebateFlytingVerboseReview\(session\)/u);
  assert.match(source, /## Flyting frozen bout/u);
  assert.match(source, /## Flyting exchange chain/u);
  assert.match(source, /## Hall movement and Jarl verdict/u);
  assert.match(source, /targetChallengeId/u);
  assert.match(source, /returnClaimId/u);
  assert.match(source, /hallLeaningHistory/u);
  assert.match(
    source,
    /Persisted public line; heard completion not recorded/u,
  );
  assert.doesNotMatch(formatter, /Delivery:[\s\S]{0,80}"Complete"/u);
  assert.match(
    source,
    /event\.kind === "reaction" && !event\.speakerBotId/u,
  );
  assert.match(flytingSource, /setWithheldRecordEventIds/u);
  assert.match(
    flytingSource,
    /exchange\.challenge\.createdEventId/u,
  );
  assert.match(flytingSource, /\{ id: "moderator", label: "Jarl" \}/u);
  assert.match(flytingSource, /Jarl of the Hall/u);
});
const pageCss = readFileSync(
  fileURLToPath(new URL("./page.module.css", import.meta.url)),
  "utf8",
);
const avatarDetailsCss = readFileSync(
  fileURLToPath(new URL("./avatar-details-mask.module.css", import.meta.url)),
  "utf8",
);
const identSource = readFileSync(
  fileURLToPath(new URL("./debateIdentAudio.ts", import.meta.url)),
  "utf8",
);
const presentation = readFileSync(
  fileURLToPath(new URL("./debatePresentation.ts", import.meta.url)),
  "utf8",
);

describe("Debate experience", () => {
  it("keeps model and effort read-only while exposing guarded session Turbo controls", () => {
    assert.match(source, /modelSupportsTurboMode/u);
    assert.match(source, /updateSessionTurbo/u);
    assert.match(
      source,
      /\/api\/debates\/\$\{encodeURIComponent\(sessionId\)\}\/turbo/u,
    );
    assert.match(
      source,
      /session\.preparing === true[\s\S]{0,100}session\.baking === true/u,
    );
    assert.match(source, /automaticTurnPreparationSessionId === session\.id/u);
    assert.match(source, /archiveTurboToggle/u);
    assert.match(source, /session\.status !== "completed"/u);
    assert.match(source, /turboToggle=\{\{/u);
    assert.match(css, /\.archiveTurboToggle:disabled/u);
  });

  it("maps frozen source provenance to stable physical evidence props", () => {
    assert.equal(debateEvidenceSourcePropKind({ id: "brave-2" }), "brave");
    assert.equal(debateEvidenceSourcePropKind({ id: "url-1" }), "url");
    assert.equal(debateEvidenceSourcePropKind({ id: "scholar-3" }), "scholar");
    assert.equal(
      debateEvidenceSourcePropKind({ id: "legacy-source" }),
      "brave",
    );
  });

  it("wires Participant @ evidence mentions into floor and interjection drafts", () => {
    assert.match(source, /useDebateEvidenceMentionTextarea/u);
    assert.match(source, /DebateEvidenceMentionPopover/u);
    assert.match(source, /Type @ to cite an exhibit, Brave, or Scholar item/u);
    assert.match(source, /Type @ to cite evidence/u);
  });

  it("presents the moderator introduction instead of treating it as transcript-only", () => {
    assert.match(
      source,
      /function debatePresentationEvents[\s\S]{0,900}event\.kind === "intro" \|\|[\s\S]{0,80}event\.kind === "speech"/u,
    );
    assert.match(
      source,
      /await adoptSession\(null, result\.session, \{ playIntro: true \}\)/u,
    );
    assert.match(
      source,
      /setPresenting\(fresh\.length > 0 \|\| options\.playIntro === true\)/u,
    );
  });

  it("keeps lifecycle and audience-order housekeeping outside the readable record", () => {
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "pause" }),
      true,
    );
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "resume" }),
      true,
    );
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "audience_order" }),
      true,
    );
    assert.equal(
      debateEventIsTranscriptHousekeeping({ stepKey: "judge_gavel" }),
      false,
    );
    assert.match(
      source,
      /session\.events[\s\S]{0,180}!debateEventIsTranscriptHousekeeping\(event\)[\s\S]{0,100}!debateEventIsJuryComment\(event\)/u,
    );
    assert.match(
      source,
      /DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS\.has\(event\.kind\)[\s\S]{0,180}!debateEventIsTranscriptHousekeeping\(event\)/u,
    );
  });

  it("makes every archived Resume an immediate gavel, prepared Moderator line, then held floor", () => {
    const immediateStrike = source.indexOf("const resumeGavelEventId =");
    const quietResumeRequest = source.indexOf(
      "quiet = await requestQuietLifecycle(lifecycleSession)",
      immediateStrike,
    );
    assert.ok(immediateStrike >= 0);
    assert.ok(quietResumeRequest > immediateStrike);
    assert.match(
      source,
      /const lifecycleCutscene = resume \|\| !juryCameraActive/u,
    );
    assert.match(
      source,
      /const lifecycleGavelAlreadyStruck =[\s\S]{0,220}resumeCeremonyStarted \|\| bufferedReturnGavel/u,
    );
    assert.match(
      source,
      /const preparedResumeEventId = resumeBufferedArchive[\s\S]{0,120}previous\.preparedResumeEventId/u,
    );
    assert.match(
      source,
      /const ceremonyPrevious = preparedResumeEventId[\s\S]{0,260}event\.id !== preparedResumeEventId/u,
    );
    assert.match(
      source,
      /releaseResumeCeremonyCameraOnEventId:[\s\S]{0,80}pausedPresentationEvent\.id/u,
    );
    assert.match(source, /debateRecessGalleryPhase\(/u);
    assert.match(
      source,
      /const cameraSpeechEvent = debateEventCanOwnAutomaticCamera\([\s\S]{0,80}presenting/u,
    );
  });

  it("restores an interrupted Debate line from its durable captured voice take", () => {
    assert.match(page, /loadCapturedReplayVoiceAudio/u);
    assert.match(
      page,
      /playbackSurface === "debate"[\s\S]{0,220}sourceKey: `primary:\$\{message\.id\}`/u,
    );
    assert.match(
      page,
      /saved[\s\S]{0,180}bytes: saved\.bytes[\s\S]{0,180}engineUsed: saved\.resolvedEngine/u,
    );
    assert.match(page, /durableReplayClip = true/u);
    assert.match(
      page,
      /!durableReplayClip &&[\s\S]{0,100}!signalPreferredVoiceClipReady/u,
    );
  });

  it("selects all motion fields atomically without retaining nested references", () => {
    const slate = {
      version: DEBATE_SCHEMA_VERSION,
      id: "slate-1",
      motion: "This house would build.",
      forSide: { label: "Build", brief: "Build the thing." },
      againstSide: { label: "Pause", brief: "Do not build the thing." },
    };
    const selected = copyDebateMotionSlate(slate);
    assert.deepEqual(selected, slate);
    assert.notEqual(selected.forSide, slate.forSide);
    assert.notEqual(selected.againstSide, slate.againstSide);
  });

  it("prefills contextual casts only when no explicit selection is required", () => {
    assert.deepEqual(debatePrefilledCast(["m", "f", "a"]), {
      moderator: "m",
      forAdvocate: "f",
      againstAdvocate: "a",
    });
    assert.deepEqual(debatePrefilledCast(["m", "f", "a", "extra"]), {
      moderator: "",
      forAdvocate: "",
      againstAdvocate: "",
    });
    assert.deepEqual(debatePlayerJudgePrefilledCast(["f", "a"]), {
      moderator: "",
      forAdvocate: "f",
      againstAdvocate: "a",
    });
    assert.deepEqual(debatePlayerJudgePrefilledCast(["m", "f", "a"]), {
      moderator: "",
      forAdvocate: "",
      againstAdvocate: "",
    });
  });

  it("restores archived setup without carrying frozen runtime or stale consent", () => {
    const session = {
      id: "debate-1",
      format: "turnabout",
      formality: "heated",
      setupPresetId: "custom",
      playerRole: "spectator",
      playerSideId: null,
      moderatorTitle: "Referee",
      motion: {
        version: DEBATE_SCHEMA_VERSION,
        id: "motion-1",
        title: "The Parking Lot Fight",
        motion: "Cities should replace parking with housing.",
        forSide: { label: "Homes", brief: "Build homes." },
        againstSide: { label: "Parking", brief: "Keep parking." },
      },
      moderator: { id: "moderator", name: "Morgan" },
      forAdvocate: { id: "for-bot", name: "Avery" },
      againstAdvocate: { id: "missing-bot", name: "Blake" },
      jury: { enabled: true },
      evidence: {
        version: DEBATE_SCHEMA_VERSION,
        notes: "Shared record",
        sources: [
          {
            id: "source-1",
            title: "Planning report",
            url: "https://example.com/report",
            snippet: "A source.",
            publishedAt: null,
          },
        ],
        exhibits: [],
        frozenAt: "2026-08-01T12:00:00.000Z",
      },
      advocacyConsent: [{ status: "accept" }],
      ballots: [{ sideId: "for" }],
      events: [{ kind: "speech" }],
    } as unknown as DebateSessionV1;

    const draft = debateSessionRetryDraft(
      session,
      ["moderator", "for-bot"],
      "public-forum",
    );

    assert.equal(draft.topic, session.motion.motion);
    assert.equal(draft.motion.title, "The Parking Lot Fight");
    assert.equal(draft.cast.moderator, "moderator");
    assert.equal(draft.cast.forAdvocate, "for-bot");
    assert.equal(draft.cast.againstAdvocate, "");
    assert.deepEqual(draft.missingBotNames, ["Blake"]);
    assert.equal(draft.juryEnabled, true);
    assert.deepEqual(draft.preferredJurorBotIds, [null, null, null, null]);
    assert.equal(draft.evidence.frozenAt, null);
    assert.notEqual(draft.motion, session.motion);
    assert.notEqual(draft.evidence.sources, session.evidence.sources);
    assert.equal(session.evidence.frozenAt, "2026-08-01T12:00:00.000Z");
    assert.equal("advocacyConsent" in draft, false);
    assert.equal("events" in draft, false);
    assert.equal("generationChain" in draft, false);
  });

  it("keeps the final spoken beat occupied, then clears live and replay rooms", () => {
    assert.equal(
      debateRoomPresence({
        status: "completed",
        presenting: true,
        observerPerspective: "live",
      }),
      "occupied",
    );
    assert.equal(
      debateRoomPresence({
        status: "completed",
        presenting: false,
        observerPerspective: "live",
      }),
      "departing",
    );
    assert.equal(
      debateRoomPresence({
        status: "completed",
        presenting: false,
        observerPerspective: "replay",
      }),
      "empty",
    );
    assert.equal(
      debateRoomPresence({
        status: "live",
        presenting: false,
        observerPerspective: "live",
      }),
      "occupied",
    );
  });

  it("lifts the gallery curtain when a delegated Whodunnit court has advanced", () => {
    const courtAtOpening = {
      format: "turnabout",
      stepKey: "turnabout_intro",
      formatState: {
        format: "turnabout",
        mysteryTrial: {},
      },
    } as Pick<DebateSessionV1, "format" | "formatState" | "stepKey">;
    const courtAtResolution = {
      ...courtAtOpening,
      stepKey: "turnabout_jury_deliberation",
    };

    assert.equal(
      debateGalleryArrivalShouldMaskStage({
        baking: true,
        needsBuffering: true,
        session: courtAtOpening,
      }),
      true,
    );
    assert.equal(
      debateGalleryArrivalShouldMaskStage({
        baking: true,
        needsBuffering: true,
        session: courtAtResolution,
      }),
      false,
    );
    assert.equal(
      debateGalleryArrivalShouldMaskStage({
        baking: true,
        needsBuffering: true,
        session: {
          format: "forum",
          stepKey: "intro",
          formatState: { format: "forum" },
        } as Pick<DebateSessionV1, "format" | "formatState" | "stepKey">,
      }),
      true,
    );
    assert.match(
      source,
      /debateGalleryArrivalShouldMaskStage\(\{[\s\S]{0,180}session,/u,
    );
  });

  it("animates the live room out, opens completed replays empty, and lifts Debate avatar ink", () => {
    assert.match(source, /data-debate-room-presence=\{roomPresence\}/u);
    assert.match(css, /debate-stage-bot-depart/u);
    assert.match(css, /debate-gallery-seat-depart/u);
    assert.match(css, /debate-gallery-seat-arrive/u);
    assert.match(source, /debateAudienceDepartureXPercent/u);
    assert.match(source, /data-gallery-arrived=/u);
    assert.match(source, /debateGalleryArrivalRevealOrder/u);
    assert.match(source, /data-debate-arrival-mask/u);
    assert.match(source, /data-hold-scope=/u);
    assert.match(source, /holdScope="stage"/u);
    assert.match(source, /holdBackAction=/u);
    assert.match(source, /Leave Debate/u);
    assert.match(source, /DEBATE_OPENING_GAVEL_SETTLE_MS/u);
    assert.match(source, /debateOpeningGalleryHushed/u);
    assert.match(source, /debateGalleryArrivalMurmurGain/u);
    assert.match(source, /debateGalleryArrivalFillRatio/u);
    assert.match(source, /debateGalleryOpeningMurmurGain/u);
    assert.match(source, /prestart-murmur/u);
    assert.match(source, /opening-hush/u);
    assert.match(source, /DEBATE_AUDIENCE_PRESTART_MURMUR_MIX/u);
    assert.match(source, /debateThinkingSfxAllowed/u);
    assert.match(
      source,
      /const thinkingBotId = participantSlowTimeActive[\s\S]{0,160}\? participantPlayerBotId/u,
    );
    assert.match(css, /\.participantSlowTimeWash/u);
    assert.match(
      source,
      /galleryMixBranch === "prestart-murmur" && galleryArriving[\s\S]{0,40}\? 280/u,
    );
    assert.match(source, /judgeGavelSmashRef\.current\?\.\("order"\)/u);
    assert.doesNotMatch(source, /setDebateOpeningFade\(true\)/u);
    assert.match(css, /\.live \.identOverlay\s*\{[^}]*position:\s*absolute/u);
    assert.match(source, /data-gallery-ready-hold=/u);
    assert.match(
      css,
      /translate\(var\(--debate-gallery-exit-x, 220%\), 18%\)/u,
    );
    assert.match(css, /--debate-gallery-enter-x/u);
    assert.match(
      css,
      /\.debateAudienceRow\s*\{[\s\S]{0,260}overflow:\s*hidden/u,
    );
    assert.match(css, /data-debate-room-presence="empty"/u);
    assert.match(css, /data-debate-room-presence="arriving"/u);
    assert.match(
      css,
      /prefers-reduced-motion: reduce[\s\S]*data-debate-room-presence="departing"/u,
    );
    assert.match(
      css,
      /prefers-reduced-motion: reduce[\s\S]*data-debate-room-presence="arriving"/u,
    );
    assert.doesNotMatch(page, /data-debate-moderator-avatar=/u);
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\s*\{[\s\S]{0,240}--avatar-details-offset-y:/u,
    );
    assert.doesNotMatch(avatarDetailsCss, /--avatar-details-offset-y/u);
  });

  it("mounts the live chamber during Spectator pre-bake instead of a fullscreen loader", () => {
    assert.match(
      source,
      /view === "live" \|\| \(view === "baking" && activeSession\)/u,
    );
    assert.doesNotMatch(
      source,
      /view === "baking"[\s\S]{0,400}PrismBlockingLoader[\s\S]{0,200}liveBakeSurfaceTitle\("debate"\)/u,
    );
    assert.match(source, /galleryArriving/u);
    assert.match(source, /debateAudienceArrivalChrome/u);
    assert.match(source, /galleryArrivalKicker/u);
    assert.match(source, /!galleryArriving/u);
    assert.match(
      css,
      /data-debate-room-presence="arriving"[\s\S]*\.stageSupport/u,
    );
  });

  it("randomly casts three unique Library bots and fails safely with fewer", () => {
    assert.deepEqual(
      randomDebateCast(["m", "f", "a", "extra", "m", ""], () => 0),
      {
        moderator: "f",
        forAdvocate: "a",
        againstAdvocate: "extra",
      },
    );
    assert.equal(
      randomDebateCast(["m", "f"], () => 0.5),
      null,
    );
    assert.deepEqual(
      randomDebatePlayerJudgeCast(["f", "a", "extra"], () => 0),
      {
        moderator: "",
        forAdvocate: "a",
        againstAdvocate: "extra",
      },
    );
    assert.equal(
      randomDebatePlayerJudgeCast(["f"], () => 0.5),
      null,
    );
  });

  it("defaults empty Debate seats to Surprise me without replacing manual cast", () => {
    assert.deepEqual(
      resolveDebateSurpriseCast(
        ["a", "b", "c", "d"],
        { moderator: "", forAdvocate: "", againstAdvocate: "" },
        ["moderator", "forAdvocate", "againstAdvocate"],
        [],
        () => 0,
      ),
      { moderator: "b", forAdvocate: "c", againstAdvocate: "d" },
    );
    assert.deepEqual(
      resolveDebateSurpriseCast(
        ["a", "b", "c", "d"],
        { moderator: "a", forAdvocate: "", againstAdvocate: "" },
        ["moderator", "forAdvocate", "againstAdvocate"],
        ["d"],
        () => 0,
      ),
      { moderator: "a", forAdvocate: "b", againstAdvocate: "c" },
    );
    assert.deepEqual(
      resolveDebateSurpriseCast(
        ["a", "b", "c"],
        { moderator: "a", forAdvocate: "b", againstAdvocate: "c" },
        ["moderator", "forAdvocate", "againstAdvocate"],
        [],
        () => {
          throw new Error("A complete explicit cast must not reroll");
        },
      ),
      { moderator: "a", forAdvocate: "b", againstAdvocate: "c" },
    );
    assert.equal(
      resolveDebateSurpriseCast(
        ["a", "b"],
        { moderator: "a", forAdvocate: "", againstAdvocate: "" },
        ["moderator", "forAdvocate", "againstAdvocate"],
        [],
        () => 0,
      ),
      null,
    );
  });

  it("resolves ordinary Surprise seats before checking willingness", () => {
    assert.match(source, /bot\?\.name \?\? "Surprise me"/u);
    assert.match(
      source,
      /const checkRoles = async \(\): Promise<void> => \{[\s\S]{0,900}resolveDebateSurpriseCast\([\s\S]{0,700}setCast\(resolvedCast\)/u,
    );
    assert.match(source, /every unselected seat rests on Surprise me/u);
    assert.match(source, /if \(!castReady\) return;/u);
    assert.match(source, /leave seat on Surprise me/u);
  });

  it("refracts and Space-rerolls every placement grid from its visible Library view", () => {
    assert.match(source, /type BotPickerPlacementRefractTarget/u);
    assert.match(source, /randomBotPickerPlacements/u);
    assert.match(source, /const randomizeVisibleCastPlacements/u);
    assert.match(source, /visibleBotIds[\s\S]{0,120}visibleCastPlacementCount/u);
    assert.match(source, /value: "random"[\s\S]{0,120}Random · all/u);
    assert.match(
      source,
      /rerollVisible: \(\) =>[\s\S]{0,160}visibleCastBots\.map/u,
    );
    assert.match(
      source,
      /placementRefractTarget=\{debateCastPlacementRefractTarget\}/u,
    );
  });

  it("gives stage alignment a fourth distinct Library bot for the witness", () => {
    assert.deepEqual(
      debateAlignmentPreviewCast(["m", "f", "a", "extra"], () => 0),
      {
        moderator: "f",
        forAdvocate: "a",
        againstAdvocate: "extra",
        witness: "m",
      },
    );
    assert.equal(
      debateAlignmentPreviewCast(["m", "f", "a"], () => 0.5),
      null,
    );
  });

  it("registers synthesis with Prism while keeping a visible accessible action", () => {
    assert.match(source, /PrismRefractTarget target=\{synthesisMagic\}/u);
    assert.match(source, /data-tutorial-target="debate-synthesize"/u);
    assert.match(source, /Build the debate/u);
  });

  it("makes Shape the Debate rail links real Refract targets without changing ordinary clicks", () => {
    assert.match(source, /id: DEBATE_STUDIO_NAV_MOTION_REFRACT_ID/u);
    assert.match(source, /id: DEBATE_STUDIO_NAV_CAST_REFRACT_ID/u);
    assert.match(source, /id: DEBATE_STUDIO_NAV_EVIDENCE_REFRACT_ID/u);
    assert.match(source, /id: DEBATE_STUDIO_NAV_ARCHIVE_REFRACT_ID/u);
    assert.match(source, /id: DEBATE_STUDIO_NAV_STAGE_LAYOUT_REFRACT_ID/u);
    assert.match(
      source,
      /PrismRefractTarget target=\{panel\.magic\}[\s\S]*onClick=\{\(\) => setStudioPanel\(panel\.id\)\}/u,
    );
    assert.match(
      source,
      /run: \(direction\) => void refractMotionSection\(direction\)/u,
    );
    assert.match(source, /await synthesize\(direction, seed\)/u);
    assert.match(source, /debateStudioNavMotionSeed/u);
    assert.match(source, /run: \(\) => refractCastSection\(\)/u);
    assert.match(source, /if \(!randomizeCast\(\)\)/u);
    assert.match(
      source,
      /run: \(direction\) => void refractEvidenceSection\(direction\)/u,
    );
    assert.match(source, /"debate\.setup\.exhibitPair"/u);
    assert.match(source, /debateEvidenceExhibitsFromObjectDrafts/u);
    assert.match(source, /setEvidenceDecisionMade\(true\)/u);
    assert.match(source, /run: \(\) => refractArchiveSection\(\)/u);
    assert.match(source, /nextDebateArchiveHighlightId/u);
    assert.match(source, /debateStudioNavArchiveNotice/u);
    assert.match(source, /run: \(\) => refreshStageLayoutFromPrism\(\)/u);
    assert.match(source, /The saved Main arrangement is unchanged/u);
    assert.match(source, /tutorial: "debate-motion"/u);
    assert.match(source, /data-tutorial-target="debate-archive"/u);
    assert.match(
      source,
      /PrismRefractTarget target=\{archiveRailMagic\}[\s\S]*onClick=\{\(\) => setStudioPanel\("archive"\)\}/u,
    );
    assert.match(
      source,
      /PrismRefractTarget target=\{stageLayoutRailMagic\}[\s\S]*onClick=\{openStageAlignment\}/u,
    );
  });

  it("grounds table-placed evidence with contact and cast shadows", () => {
    assert.match(
      css,
      /\.evidencePedestalFloorShadow\s*\{[^}]*radial-gradient/u,
    );
    assert.match(
      css,
      /\.evidencePedestal \.evidencePedestalSprite\s*\{[^}]*--debate-active-evidence-shadow-cast-x/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\s*\{[^}]*--debate-active-evidence-shadow-cast-x/u,
    );
    assert.match(source, /data-debate-evidence-floor-shadow="true"/u);
    assert.match(source, /data-debate-evidence-shadow-tuner="true"/u);
    assert.match(source, /Drop shadow/u);
    assert.match(source, /Shadow drift/u);
    assert.match(source, /Floor width/u);
  });

  it("uses one progressive setup path with optional room, motion, and seat tuning", () => {
    assert.doesNotMatch(source, /DebateSetupMode|setupMode/u);
    assert.doesNotMatch(source, /Basic setup|Advanced setup/u);
    assert.doesNotMatch(source, /roomTuningOpen|setRoomTuningOpen/u);
    assert.match(source, /data-tutorial-target="debate-room"/u);
    assert.match(source, /<strong>Tune the room<\/strong>/u);
    assert.match(
      source,
      /<section[\s\S]*?className=\{styles\.roomTuning\}[\s\S]*?<header>/u,
    );
    assert.doesNotMatch(
      source,
      /<details[\s\S]*?className=\{styles\.roomTuning\}/u,
    );
    assert.match(source, /Your idea/u);
    assert.match(source, /Build the debate/u);
    assert.match(source, /Prism fills the motion and both sides/u);
    assert.match(source, /Try another version/u);
    assert.match(source, /Refine motion/u);
    assert.match(source, /Seat every voice/u);
    assert.match(source, /Player seat & court/iu);
    assert.match(source, /Your seat & the Jury/iu);
    assert.match(source, /preferredJurorBotIds/u);
    assert.match(source, /emptyPreferredJurorBotIds/u);
    assert.match(source, /assignBotToJurySeat/u);
    assert.match(source, /data-tutorial-target="debate-jury-seats"/u);
    assert.match(source, /jurorBotIds/u);
    assert.match(source, /debateSetupJuryReadout/u);
    assert.match(source, /Make sure they’re willing/u);
    assert.match(source, /const checkRoles = async \(\): Promise<void> =>/u);
    assert.match(
      source,
      /const comment =[\s\S]{0,420}I’m willing to argue \$\{sideLabel\}/u,
    );
    assert.match(
      source,
      /checkNeedsReconfirmation[\s\S]{0,220}Reasoning settings changed[\s\S]{0,220}: comment/u,
    );
    assert.doesNotMatch(
      source,
      /\{check\.reason \? <p>\{check\.reason\}<\/p> : null\}/u,
    );
    assert.doesNotMatch(
      source,
      /checkRoles\(\)\.then\([\s\S]{0,180}setStudioPanel\("evidence"\)/u,
    );
    assert.match(source, /Optional Brave Search/u);
    assert.match(source, /Continue without evidence/u);
    assert.match(source, /setEvidenceDecisionMade\(true\)/u);
    assert.match(source, /Start Debate/u);
    assert.match(source, /Save Debate/u);
    assert.match(source, /deferStart:\s*true/u);
    assert.match(source, /data-tutorial-target="debate-save"/u);
    assert.match(source, /debateSessionAwaitingDeferredStart/u);
    assert.match(source, /tutorialTarget="debate-rowdiness"/u);
    assert.match(source, /aria-label="Debate atmosphere"/u);
    assert.match(source, /data-tutorial-target="debate-rounds"/u);
    assert.match(source, /aria-label="Forum rebuttal rounds"/u);
    assert.match(source, /resolveDebateForumRoundPlan/u);
    assert.match(source, /forumRounds:/u);
    assert.match(source, /setFormat\("forum"\)/u);
    assert.match(source, /setPlayerRole\("judge"\)/u);
    assert.match(source, /setJuryEnabled\(false\)/u);
    assert.match(source, /DEBATE_SETUP_PRESETS\.map/u);
    assert.match(source, /DEBATE_FORMAT_CATALOG\.filter/u);
    assert.match(css, /\.roomTuning\s*,\s*\.castTuning\s*\{/u);
    assert.match(css, /\.motionSummaryCard\s*\{/u);
    assert.match(css, /\.castSlotGrid\[data-seat-count="2"\]/u);
    assert.doesNotMatch(css, /setupModeToggle|basicMotionCard/u);
  });

  it("freezes one custom moderator title across setup, archive, transcript, and the live card", () => {
    assert.match(
      source,
      /props\.initialFormat === "whodunnit" \? "The Court" : "Moderator"/u,
    );
    assert.match(source, /data-tutorial-target="debate-moderator-title"/u);
    assert.match(source, /maxLength=\{DEBATE_MODERATOR_TITLE_MAX_LENGTH\}/u);
    assert.match(
      source,
      /placeholder="Moderator, Speaker of the House, Keeper of the Truth…"/u,
    );
    assert.match(
      source,
      /moderatorTitle: normalizeDebateModeratorTitle\(moderatorTitle\)/u,
    );
    assert.match(
      source,
      /session\.moderatorName.*normalizeDebateModeratorTitle\(session\.moderatorTitle\)/u,
    );
    assert.match(
      source,
      /roleLabel:[\s\S]{0,180}normalizeDebateModeratorTitle\(session\.moderatorTitle\)/u,
    );
    assert.match(source, /debateArchiveMetaChips\(session\)/u);
    assert.match(source, /session\.moderatorTitle/u);
    assert.match(source, /data-tutorial-target="debate-team-names"/u);
    assert.match(source, /forTeamNameAuthoredRef/u);
    assert.match(source, /againstTeamNameAuthoredRef/u);
    assert.doesNotMatch(
      source,
      /data-tutorial-target="debate-moderator-name"/u,
    );
    assert.doesNotMatch(source, /Public moderator name|Public Judge name/u);
    assert.doesNotMatch(source, /moderatorNameAuthoredRef|setModeratorName\(/u);
    assert.match(source, /emptyDebateSlateForFormat/u);
    assert.match(source, /format === "whodunnit" \? "Prosecution" : "Pro"/u);
    assert.match(source, /format === "whodunnit" \? "Defense" : "Con"/u);
    assert.match(source, /forTeamName: motion\.forSide\.label/u);
    assert.match(source, /againstTeamName: motion\.againstSide\.label/u);
    assert.match(source, /session\.moderatorName/u);
    assert.match(source, /sessionStatusLabel\(session\)/u);
    assert.match(css, /\.moderatorTitleField\s*\{/u);
    assert.match(
      source,
      /const defaultModeratorTitle\s*=\s*format === "whodunnit" \? "The Court" : "Moderator"/u,
    );
    assert.doesNotMatch(
      source,
      /const visibleModeratorTitle\s*=\s*format === "whodunnit"/u,
    );
    assert.doesNotMatch(source, /disabled=\{format === "whodunnit"\}/u);
  });

  it("adds an inline editable Territory dice without changing the motion slate", () => {
    assert.match(source, /randomDebateTerritory/u);
    assert.match(source, /data-debate-territory-randomize="true"/u);
    assert.match(source, /aria-label="Generate a random Debate territory"/u);
    assert.match(
      source,
      /setTopic\(\(current\) => randomDebateTerritory\(current\)\)/u,
    );
    assert.match(source, /renderBotGlyph\("dice"/u);
    assert.match(css, /\.territoryRandomizeButton\s*\{/u);
  });

  it("keeps Territory as ordinary text without shortcut language", () => {
    assert.match(source, /renderPickAwareComposer\?/u);
    assert.match(source, /expandComposerDraft\?/u);
    assert.match(
      source,
      /id: "debate-territory"[\s\S]{0,500}onChange: setTopic/u,
    );
    assert.doesNotMatch(source, /resolvePicksToPlainText/u);
    assert.match(
      source,
      /const resolvedTopic = \(\s*await expandDebateSeedDraft\(topicOverride \?\? topic\)\s*\)\.trim\(\)/u,
    );
    assert.match(
      source,
      /\/api\/debates\/synthesize[\s\S]{0,180}topic: resolvedTopic/u,
    );
    assert.match(
      source,
      /\/api\/prism\/refract[\s\S]{0,300}topic: resolvedTopic/u,
    );
    assert.doesNotMatch(
      source,
      /if \(resolvedTopic !== topic\) \{\s*setTopic\(resolvedTopic\);/u,
    );
    assert.match(source, /topic: resolvedTopic/u);
    assert.match(css, /\.pickAwareSetupField\s*\{/u);
    assert.match(
      css,
      /\.dashboard\s+\.pickAwareSetupField\s*\{[\s\S]*?--fg:\s*var\(--debate-studio-ink\)/u,
    );
    assert.match(
      css,
      /\.dashboard\s+\.pickAwareSetupField\s+textarea\[data-rich-overlay="true"\]\s*\{[\s\S]*?background:\s*transparent/u,
    );
    assert.match(
      css,
      /\.dashboard\s+\.pickAwareSetupField\s*\{[\s\S]*?--compose-textarea-padding:\s*13px 0 13px 14px;[\s\S]*?--compose-textarea-overlay-inset:\s*0;[\s\S]*?--compose-textarea-overlay-padding:\s*var\(--compose-textarea-padding\)/u,
    );
    assert.match(
      css,
      /\.dashboard\s+\.pickAwareSetupField\s+textarea\s*\{[\s\S]*?padding:\s*var\(--compose-textarea-padding\);[\s\S]*?font-size:\s*var\(--compose-textarea-font-size\);[\s\S]*?line-height:\s*var\(--compose-textarea-line-height\)/u,
    );
    assert.match(
      pageCss,
      /\.composeTextareaVisualOverlay\s*\{[\s\S]*?inset:\s*var\(--compose-textarea-overlay-inset, 1px\);/u,
    );
  });

  it("reveals motion inputs incrementally without hiding populated downstream work", () => {
    const emptySlate = {
      version: DEBATE_SCHEMA_VERSION,
      id: "custom-motion",
      motion: "",
      forSide: { label: "", brief: "" },
      againstSide: { label: "", brief: "" },
    };
    assert.deepEqual(debateMotionRevealState("", emptySlate), {
      motion: false,
      positions: false,
      briefs: false,
    });
    assert.deepEqual(debateMotionRevealState("Public transit", emptySlate), {
      motion: true,
      positions: false,
      briefs: false,
    });
    assert.deepEqual(
      debateMotionRevealState("Public transit", {
        ...emptySlate,
        motion: "This house would make transit free.",
      }),
      { motion: true, positions: true, briefs: false },
    );
    assert.deepEqual(
      debateMotionRevealState("", {
        ...emptySlate,
        forSide: { label: "Access", brief: "Mobility is a public good." },
        againstSide: { label: "Cost", brief: "" },
      }),
      { motion: true, positions: true, briefs: true },
    );
    assert.match(source, /data-debate-motion-stage="motion"/u);
    assert.match(source, /data-debate-motion-stage="positions"/u);
    assert.match(source, /data-debate-motion-stage="briefs"/u);
    assert.match(css, /@keyframes debate-motion-reveal/u);
  });

  it("keeps manual research real while routing optional synthesis through Wield Prism", () => {
    assert.match(
      source,
      /id: "debate-setup-player-notes"[\s\S]*"debate\.setup\.playerNotes"/u,
    );
    assert.match(
      source,
      /id: "debate-setup-research-query"[\s\S]*"debate\.setup\.researchQuery"/u,
    );
    assert.match(
      source,
      /id: "debate-setup-scholar-query"[\s\S]*"debate\.setup\.scholarQuery"/u,
    );
    assert.match(source, /Search &amp; add/u);
    assert.match(source, /Search papers &amp; add/u);
    assert.match(source, /each add up to three results per search/u);
    assert.match(
      source,
      /const research = async \(sourceType: "web" \| "scholar"\)[\s\S]*sourceType,[\s\S]*research\("web"\)[\s\S]*research\("scholar"\)/u,
    );
    assert.doesNotMatch(source, /Add generated search/u);
    assert.doesNotMatch(source, /Find sources for me/u);
    assert.match(source, /Describe a physical exhibit/u);
    assert.match(
      source,
      /disabled=\{[\s\S]{0,160}!evidenceObjectSeed\.trim\(\)/u,
    );
    assert.match(source, /Draft exhibit/u);
    assert.match(
      source,
      /id: "debate-setup-exhibit-seed"[\s\S]*"debate\.setup\.exhibitPair"/u,
    );
    assert.match(
      source,
      /"debate\.setup\.exhibitDraft"[\s\S]*seed,[\s\S]*rejectedTitles[\s\S]*debateEvidenceObjectDraftFromPrismCandidate/u,
    );
    assert.doesNotMatch(source, /debate:refract-evidence-object/u);
    assert.match(source, /Prism is refracting…/u);
    assert.match(
      css,
      /addEvidenceButton\[data-generating="true"\][\s\S]*debateRefractRainbowFlow 1\.7s linear infinite/u,
    );
    assert.match(source, /\/api\/debates\/exhibits\/upload/u);
    assert.match(source, /\/api\/debates\/exhibits\/synthesize/u);
    assert.match(source, /"Synthesize asset"/u);
    assert.match(
      source,
      /Optional\. Upload, reuse, or synthesize only changes the stage[\s\S]*sprite; the editable text and emoji remain the evidence/u,
    );
    assert.match(
      source,
      /import \{ PrismBlockingLoader \} from "\.\/PrismBlockingLoader"/u,
    );
    assert.doesNotMatch(
      source,
      /open=\{evidenceObjectVisualBusy === "synthesize"\}/u,
    );
    assert.match(source, /open=\{newDuelGenerateBusy\}/u);
    assert.match(source, /Inventing a New Duel/u);
    assert.match(source, /setNewDuelGenerateBusy\(true\)/u);
    assert.match(source, /data-soft-busy=/u);
    assert.match(
      source,
      /Soft prepare — emoji stays as the fallback until the sprite/u,
    );
    assert.match(source, /Queue another asset/u);
    assert.match(source, /queue more sprites while one waits/u);
    assert.match(
      source,
      /Soft synth may queue behind other image work; only hard-block uploads/u,
    );
    assert.match(
      source,
      /if \(!draft \|\| !title \|\| evidenceObjectUploadBusy\)/u,
    );
    assert.doesNotMatch(
      source,
      /synthesizeEvidenceObjectImage[\s\S]{0,220}evidenceObjectVisualBusy/u,
    );
    assert.match(source, /placement="docked"/u);
    assert.match(source, /softExhibitJobList/u);
    assert.match(source, /activeChildren/u);
    assert.match(source, /registerPrismSoftSynthesisJobs/u);
    assert.match(source, /Cancel all exhibit synthesis/u);
    assert.match(source, /The × cancels every in-flight sprite/u);
    assert.match(source, /cancelSoftExhibitSynthesizeJob/u);
    assert.match(
      source,
      /\/api\/debates\/exhibits\/synthesize\/cancel[\s\S]{0,120}requestId/u,
    );
    assert.match(source, /\/api\/debates\/exhibits\/synthesize\/cancel-all/u);
    assert.match(
      source,
      /requestBody\(\{[\s\S]{0,220}requestId,[\s\S]{0,80}\}\)/u,
    );
    assert.match(source, /Soft jobs run in parallel after Save/u);
    assert.match(
      source,
      /softExhibitSynthesizeJobs\.length > 0 &&\s*!newDuelGenerateBusy &&\s*!motionOptionsBusy/u,
    );
    assert.match(source, /applyDebateEvidenceExhibitSynthesizedImage/u);
    assert.match(source, /evidenceObjectUploadBusy/u);
    assert.match(
      source,
      /disabled=\{\s*!objectTitle \|\|[\s\S]{0,120}evidenceObjectUploadBusy\s*\}/u,
    );
    assert.doesNotMatch(source, /generating and cutting out the exhibit/u);
    assert.doesNotMatch(
      source,
      /The exhibit text and emoji fallback remain unchanged while the sprite takes shape/u,
    );
    assert.match(source, /liveBakeMayStartWatch/u);
    assert.match(source, /runSpectatorProgressiveBake/u);
    assert.match(source, /\/bake\/cancel/u);
    assert.doesNotMatch(source, /Still preparing the next beat/u);
    assert.match(source, /LIVE_BAKE_POLL_INTERVAL_MS/u);
    assert.match(
      source,
      /setEvidenceObjectVisualBusy\("synthesize"\)[\s\S]{0,1200}\/api\/debates\/exhibits\/synthesize[\s\S]{0,2200}finally \{[\s\S]{0,220}setEvidenceObjectVisualBusy/u,
    );
    assert.match(source, /<AssetRail[\s\S]{0,180}kind="debate_exhibit"/u);
    assert.match(source, /onSynthesize=\{synthesizeEvidenceObjectImage\}/u);
    assert.match(source, /onSelect=\{\(asset\) =>/u);
    assert.match(
      source,
      /applyDebateEvidenceObjectNameEdit\(current, field, value\)/u,
    );
    assert.doesNotMatch(source, /Name the object before choosing a sprite/u);
    const draftStart = source.indexOf("const draftEvidenceObject");
    const draftEnd = source.indexOf(
      "const updateEvidenceObjectName",
      draftStart,
    );
    assert.ok(draftStart >= 0 && draftEnd > draftStart);
    assert.doesNotMatch(
      source.slice(draftStart, draftEnd),
      /debates\/exhibits\/synthesize|setEvidenceObjectVisualBusy/u,
    );
    assert.match(
      source,
      /The text record is evidence|Tap the picture to pick an emoji/u,
    );
    assert.doesNotMatch(source, /openDesktopEmojiPicker\(\)/u);
    assert.match(source, /Choose exhibit emoji\. Current emoji:/u);
    assert.match(source, /evidenceObjectPreviewPicture/u);
    assert.doesNotMatch(source, /evidenceEmojiPickerHelp/u);
    assert.doesNotMatch(source, /Search for an emoji/u);
    assert.match(source, /debate:new-duel-generate/u);
    assert.match(source, /generateNewDuelFromPrism/u);
    assert.match(source, /\/api\/debates\/setup-suggestion/u);
    assert.match(source, /debate:format-refract:\$\{targetFormat\}/u);
    assert.match(source, /formatRefractMagic\(option\.id as DebateFormatId\)/u);
    assert.match(source, /format: formatConstraint/u);
    assert.match(
      source,
      /const resolvedFormat = formatConstraint \?\? applied\.format;[\s\S]{0,1300}setFormat\(resolvedFormat\)/u,
    );
    assert.match(
      source,
      /resolvedFormat === "whodunnit"[\s\S]{0,240}setMysteryInspiration[\s\S]{0,160}setMysteryNonce/u,
    );
    assert.match(
      source,
      /resolvedFormat === "whodunnit"[\s\S]{0,120}setRoleChecks\(\[\]\);[\s\S]{0,80}return;/u,
    );
    assert.match(
      source,
      /setPlayerRole\(resolvedPlayerRole\)[\s\S]{0,400}setJuryEnabled\([\s\S]{0,220}applied\.juryEnabled[\s\S]{0,400}setPlayerSideId\(resolvedPlayerSideId\)[\s\S]{0,120}setModeratorTitle\(applied\.moderatorTitle\)/u,
    );
    assert.match(
      source,
      /waitForModelPreparation\([\s\S]{0,220}experience:\s*"debate"/u,
    );
    assert.match(source, /ModelWarmupIntermission/u);
    assert.match(source, /Refraction complete/u);
    assert.match(source, /prismRefractProvenanceDetail\(result\)/u);
    assert.match(
      source,
      /reasoningEffort:\s*props\.reasoningEffort[\s\S]{0,80}turbo:\s*props\.turbo/u,
    );
    assert.match(
      source,
      /Model:\s*None|model:\s*null,\s*reasoningEffort:\s*"none"/u,
    );
    assert.match(source, /DebateNoticeToast/u);
    assert.match(
      source,
      /playerRole:\s*resolvedPlayerRole[\s\S]{0,220}playerSideId:[\s\S]{0,120}resolvedPlayerRole === "participant"/u,
    );
    assert.doesNotMatch(
      source,
      /\/api\/debates\/role-checks[\s\S]{0,400}playerRole:\s*"judge"/u,
    );
    assert.match(source, /beginEditingExhibit/u);
    assert.match(source, /Save changes/u);
    assert.match(source, /searchDebateEvidenceEmojis/u);
    assert.match(source, /Three most relevant emojis/u);
    assert.match(source, /Find the right symbol/u);
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /event\.key !== "Escape"/u);
    assert.match(source, /chooseEvidenceObjectEmoji/u);
    assert.match(css, /\.evidenceEmojiSearchModal\s*\{/u);
    assert.match(
      css,
      /\.evidenceEmojiSearchResults\s*\{[^}]*grid-template-columns:\s*repeat\(3,/u,
    );
    assert.match(
      css,
      /\.evidenceObjectPreviewPicture\s*>\s*\.evidenceExhibitVisual\s*\{[^}]*font-size:\s*52px|\.evidenceObjectPreview(?:Picture)?\s*>\s*\.evidenceExhibitVisual\s*\{[^}]*font-size:\s*52px/u,
    );
    assert.match(
      css,
      /\.evidenceObjectPreview(?:Picture)?\s*>\s*\.evidenceExhibitVisual\s*>\s*span\s*\{[^}]*max-width:\s*88%/u,
    );
    assert.match(
      css,
      /\.evidenceExhibitVisual:has\(>\s*img:not\(\[hidden\]\)\)\s*>\s*span\s*\{[^}]*visibility:\s*hidden/u,
    );
    assert.match(
      source,
      /onError=\{\(event\) => \{[\s\S]{0,100}hidden = true/u,
    );
    assert.doesNotMatch(source, /Emoji always remains as the fallback/u);
    assert.doesNotMatch(css, /\.evidenceObjectPreview span,/u);
    assert.match(source, /props\.responseMode === "local"/u);
    assert.match(source, /publicResearchBlockedReason/u);
    assert.match(source, /Switch the privacy lane to ONLINE/u);
    assert.match(source, /data-public-research-blocked/u);
    assert.match(source, /aria-describedby="debate-public-research-note"/u);
    // Inputs stay focusable in LOCAL; only the live search call stays gated.
    assert.doesNotMatch(
      source,
      /placeholder="Search for frozen public evidence"\s*disabled=\{props\.responseMode === "local"\}/u,
    );
    assert.doesNotMatch(
      source,
      /placeholder="Search scholarly works via Crossref"\s*disabled=\{props\.responseMode === "local"\}/u,
    );
    assert.doesNotMatch(source, /synthetic-[a-z]/u);
  });

  it("soft-synthesizes only emoji-only exhibits on Save and Start", () => {
    assert.match(source, /Generate all assets before the debate/u);
    assert.match(
      source,
      /const \[generateAllExhibitAssetsBeforeDebate, setGenerateAllExhibitAssetsBeforeDebate\][\s\S]{0,120}useState\(false\)/u,
    );
    assert.match(
      source,
      /import \{[\s\S]{0,500}debateMissingExhibitAssets,[\s\S]{0,500}\} from "\.\/debateEvidenceExhibits"/u,
    );
    const saveStart = source.indexOf("const saveDebate");
    const saveEnd = source.indexOf("const startDebate", saveStart);
    assert.ok(saveStart >= 0 && saveEnd > saveStart);
    const saveSource = source.slice(saveStart, saveEnd);
    assert.match(
      saveSource,
      /generateAllExhibitAssetsBeforeDebate[\s\S]{0,120}debateMissingExhibitAssets\(evidence\)/u,
    );
    assert.match(
      saveSource,
      /const result = await props\.request[\s\S]{0,700}finishDebateExhibitSynthesisInBackground\([\s\S]{0,120}result\.session\.id,[\s\S]{0,80}softSynthesisExhibits/u,
    );
    assert.match(saveSource, /custom assets remain unchanged/u);
    assert.match(
      source,
      /const startDebate = async \(\): Promise<void> => \{[\s\S]{0,1800}const missingExhibits = generateAllExhibitAssetsBeforeDebate[\s\S]{0,700}const result = await props\.request/,
    );
    assert.match(
      source,
      /if \(missingExhibits\.length > 0\) \{[\s\S]{0,260}finishDebateExhibitSynthesisInBackground\(\s*result\.session\.id,\s*missingExhibits\s*,?[\s\S]{0,140}\}/u,
    );
    assert.match(
      source,
      /const bakePromise = runSpectatorProgressiveBake\(result\.session\.id\)/u,
    );
    assert.doesNotMatch(source, /synthesizeDebateStartExhibit/u);
    assert.doesNotMatch(source, /attachGeneratedExhibits/u);
    assert.doesNotMatch(source, /Synthesizing the opening exhibit/u);
    assert.match(css, /\.generateExhibitsChoice\[data-checked="true"\]/u);
  });

  it("does not block Start on full exhibit generation batch", () => {
    const startSourceStart = source.indexOf("const startDebate = async");
    const startSourceEnd = source.indexOf(
      "const advance = useCallback",
      startSourceStart,
    );
    assert.ok(startSourceStart >= 0 && startSourceEnd > startSourceStart);
    const startSource = source.slice(startSourceStart, startSourceEnd);
    assert.doesNotMatch(
      startSource,
      /await\s+finishDebateExhibitSynthesisInBackground/u,
    );
    assert.doesNotMatch(
      startSource,
      /Promise\.all(?:Settled)?\([\s\S]{0,260}missingExhibits/u,
    );
    assert.doesNotMatch(startSource, /waitUntilReady/u);
    assert.match(
      source,
      /waitUntilReady: debateSessionIsMysteryTurnabout\(session\)/u,
    );
    assert.match(
      startSource,
      /if \(missingExhibits\.length > 0\) \{[\s\S]{0,260}finishDebateExhibitSynthesisInBackground\(\s*result\.session\.id,\s*missingExhibits\s*,?[\s\S]{0,140}\}/u,
    );
    assert.match(
      startSource,
      /const bakePromise = runSpectatorProgressiveBake\(result\.session\.id\)/u,
    );
    assert.match(
      startSource,
      /rebaseArchiveOpenMutation\([\s\S]{0,80}"spectator-ready-hold"/u,
    );
    assert.match(startSource, /startCreateIdempotencyKeyRef\.current/u);
  });

  it("opens from archive after a minimum runway, while background work keeps running", () => {
    const openSessionSource = source.slice(
      source.indexOf("const openSession = async"),
      source.indexOf(
        "useEffect(() =>",
        source.indexOf("const openSession = async"),
      ),
    );
    assert.match(
      openSessionSource,
      /let minimumArchiveBufferPromise[\s\S]{0,700}const minimumBufferStart = session;/u,
    );
    assert.match(
      openSessionSource,
      /let minimumBufferResult: DebateArchiveReturnBufferResponse \| null = null;/u,
    );
    assert.match(openSessionSource, /if \(minimumPhase === "preparing"\) \{/u);
    assert.match(
      openSessionSource,
      /setArchiveReturnReadySessionId\([\s\S]{0,120}session\.id/u,
    );
    assert.match(
      openSessionSource,
      /phase:\s*minimumPhase === "fully_buffered"[\s\S]{0,80}\? "ready_buffering"[\s\S]{0,80}: minimumPhase/u,
    );
    assert.match(
      openSessionSource,
      /bufferingFailed: minimumBufferResult\?\.bufferingFailed \?\? false/u,
    );
    assert.match(
      openSessionSource,
      /await Promise\.all\(\[\s*voiceRunway\.criticalReady,\s*identPlaybackPromise,?\s*\]\)/u,
    );
  });

  it("hands soft exhibit delivery to the global server-owned queue", () => {
    const backgroundStart = source.indexOf(
      "const finishDebateExhibitSynthesisInBackground",
    );
    const backgroundEnd = source.indexOf(
      "const buildDebateCreateBody",
      backgroundStart,
    );
    assert.ok(backgroundStart >= 0 && backgroundEnd > backgroundStart);
    const backgroundSource = source.slice(backgroundStart, backgroundEnd);
    assert.match(backgroundSource, /\/api\/soft-asset-jobs\/debate-exhibits/u);
    assert.match(backgroundSource, /onlyIfEmoji: true/u);
    assert.match(backgroundSource, /announcePrismSoftAssetJob\(result\.job\)/u);
    assert.doesNotMatch(backgroundSource, /synthesizeDebateStartExhibit/u);
    assert.doesNotMatch(backgroundSource, /attachGeneratedExhibits/u);

    const archiveStart = source.indexOf("const synthesizeArchiveExhibitImage");
    const archiveEnd = source.indexOf(
      "const beginEditingExhibit",
      archiveStart,
    );
    assert.ok(archiveStart >= 0 && archiveEnd > archiveStart);
    const archiveSource = source.slice(archiveStart, archiveEnd);
    assert.match(archiveSource, /\/api\/soft-asset-jobs\/debate-exhibits/u);
    assert.doesNotMatch(archiveSource, /\/exhibits\/\$\{[^}]+\}\/sprite/u);
    assert.doesNotMatch(archiveSource, /\/api\/debates\/exhibits\/synthesize/u);
    assert.match(page, /<SoftAssetJobActivity/u);
    assert.match(page, /onOpenDebate=\{\(\) => navigateToView\("debate"\)\}/u);
  });

  it("locks prior Brave results while later searches fill distinct source slots", () => {
    const locked = Array.from({ length: 5 }, (_, index) => ({
      id: `brave-${index + 1}`,
      title: `Locked ${index + 1}`,
      url: `https://example.com/locked-${index + 1}`,
      snippet: "",
      publishedAt: null,
    }));
    const incoming = [
      {
        id: "brave-1",
        title: "Duplicate URL",
        url: "https://example.com/locked-1#result",
        snippet: "",
        publishedAt: null,
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        id: `brave-${index + 1}`,
        title: `New ${index + 1}`,
        url: `https://example.org/new-${index + 1}`,
        snippet: "",
        publishedAt: null,
      })),
    ];

    const merged = mergeDebateEvidenceSources(locked, incoming);
    assert.equal(merged.length, DEBATE_EVIDENCE_SOURCE_MAX_COUNT);
    assert.deepEqual(merged.slice(0, locked.length), locked);
    assert.equal(
      new Set(merged.map((candidate) => candidate.id)).size,
      DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
    );
    assert.equal(
      merged.filter((candidate) => candidate.url.includes("locked-1")).length,
      1,
    );
    assert.deepEqual(mergeDebateEvidenceSources(merged, incoming), merged);
    assert.match(source, /Search &amp; add/u);
    assert.match(source, /Optional Brave Search/u);
    assert.match(source, /Remove an evidence item to search again/u);
    assert.match(source, /DEBATE_EVIDENCE_ITEM_MAX_COUNT/u);
    assert.match(source, /Add a physical exhibit or bring in public sources/u);
    assert.doesNotMatch(source, />\s*\+ Add object\s*</u);
    assert.doesNotMatch(source, />\s*Generate object\s*</u);
    assert.match(source, /className=\{styles\.evidenceToolHeader\}/u);
    assert.match(source, /className=\{styles\.evidenceCapacity\}/u);
    assert.match(source, />\s*Add URL\s*</u);
    assert.match(source, /\/api\/debates\/sources\/inspect/u);
    assert.match(source, /What should debaters take from this source\?/u);
    assert.match(source, /LOCAL did not access this page/u);
    assert.match(source, /debateUrlEvidenceSourceFromDraft/u);
    assert.match(source, /data-tutorial-target="debate-add-url"/u);
    assert.match(source, /autoFocus/u);
    assert.match(source, /aria-label="Cancel adding source URL"/u);
    assert.match(source, /event\.key !== "Escape"/u);
    assert.equal(
      (source.match(/onClick=\{openUrlEvidenceEditor\}/gu) ?? []).length,
      1,
    );
    assert.match(css, /\.urlEvidenceEditor\s*\{/u);
    assert.match(
      css,
      /\.dashboard \.researchBox\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*1fr\) auto/u,
    );
  });

  it("keeps Forum default while exposing real Turnabout and Whodunnit format contracts", () => {
    assert.match(source, /props\.initialFormat \?\? "forum"/u);
    assert.match(source, /DEBATE_FORMAT_CATALOG\.filter/u);
    assert.match(source, /data-tutorial-target="debate-format"/u);
    assert.match(source, /option\.productionName/u);
    assert.match(source, /option\.cadence/u);
    assert.match(
      source,
      /movesParticipantToJudge\s*\? "participant-role-change"\s*: option\.availability/u,
    );
    assert.match(source, /const disabled = comingSoon/u);
    assert.doesNotMatch(source, />\s*Coming later\s*</u);
    assert.match(source, /if \(disabled\) return/u);
    assert.match(
      source,
      /if \(option\.id === "whodunnit"\) \{[\s\S]{0,180}setFormat\("whodunnit"\)/u,
    );
    assert.doesNotMatch(source, /setMysterySetupOpen\(true\)/u);
    assert.match(source, /format === "whodunnit" \? "Setup" : "Motion"/u);
    assert.match(source, /<BotPickerToolbar/u);
    assert.match(source, /mysterySuspectBotIds\.map/u);
    assert.match(source, /const frozenConfig: DebateWhodunnitCreateConfigV2/u);
    assert.match(source, /whodunnit: frozenConfig/u);
    assert.match(source, /session\.formatState\.config/u);
    assert.match(
      source,
      /const frozenProsecutorBotId = "prosecutorBotId" in mystery/u,
    );
    assert.match(source, /setMysteryProsecutorBotId\(frozenProsecutorBotId\)/u);
    assert.match(source, /format: next\.format/u);
    assert.match(source, /\/turnabout-action/u);
    assert.match(source, /submitTurnaboutAction\("press"/u);
    assert.match(source, /submitTurnaboutAction\(\s*"focus_statement"/u);
    assert.match(source, /setTurnaboutObjecting/u);
    assert.match(source, /submitTurnaboutAction\(\s*"present_evidence"/u);
    assert.match(source, /submitTurnaboutAction\("pass"/u);
    assert.match(source, /mysteryCourtPassiveFigures/u);
    assert.match(
      source,
      /return verdict\.grade === "incorrect" \? "Not Guilty" : "Guilty"/u,
    );
    assert.match(
      source,
      /The public Judge announces the deterministic Casekeeper ruling/u,
    );
    assert.match(source, /The court is adjourned\. \$\{outcome\}/u);
    assert.match(
      source,
      /debateSessionIsMysteryTurnabout\(next\)[\s\S]{0,120}event\.speakerKind === "moderator"/u,
    );
    assert.match(source, /data-court-role=/u);
    assert.match(
      source,
      /aria-hidden="true"[\s\S]{0,80}inert=\{true\}[\s\S]{0,80}tabIndex=\{-1\}/u,
    );
    assert.match(source, /presentation: "mini"/u);
    assert.match(source, /mysteryCourtActiveWitnessBot/u);
    assert.match(source, /className=\{styles\.mysteryCourtWitnessFigure\}/u);
    assert.match(source, /aria-label=\{`Witness stand:/u);
    assert.match(source, /mysteryCourtTalkingBotId === figure\.id/u);
    assert.match(
      source,
      /Record paused until you choose · Press has no penalty/u,
    );
    assert.match(source, /Present a frozen contradiction/u);
    assert.match(source, /Credibility \{mysteryTrial\?\.credibilityRemaining/u);
    assert.match(source, /Statement-bound · frozen evidence only/u);
    assert.match(source, /session\.formatState\.floorOwnerBotId/u);
    assert.match(source, /Return to a proceeding/u);
    assert.match(source, /data-archive-group="open"/u);
    assert.match(source, /data-archive-group="completed"/u);
    assert.match(source, /session\.status !== "completed"/u);
    assert.match(source, /session\.status === "completed"/u);
    assert.match(css, /\.archiveGroups/u);
    assert.match(css, /\.archiveGroupHeading/u);
    assert.match(css, /\[data-archive-group="completed"\]/u);
    assert.match(source, /debateArchiveMetaChips\(session\)/u);
    assert.match(
      source,
      /debateActiveDurationLabel\(session\.activeDurationMs\)/u,
    );
    assert.match(source, /session\.activeDurationMs !== null/u);
    assert.match(source, /"The record"/u);
    assert.match(css, /\.formatPicker/u);
    assert.match(css, /\.archiveChip\s*\{/u);
    assert.match(css, /\.archiveChipTag\s*\{/u);
    assert.match(
      css,
      /\.formatPicker label\[data-availability="coming_soon"\]/u,
    );
    assert.match(css, /\.turnaboutRecord/u);
    assert.match(css, /\.turnaboutActions/u);
    assert.match(css, /\.mysteryCourtPassiveFigure/u);
    assert.match(css, /\.mysteryCourtPassiveLabel/u);
    assert.match(
      css,
      /\.mysteryCourtPassiveFigure\s*\{[^}]*pointer-events: none/u,
    );
    assert.match(
      css,
      /\.turnaboutActions > div:first-child[\s\S]{0,260}grid-template-columns/u,
    );
    assert.match(css, /turnaboutActions:has\(\.turnaboutEvidencePicker\)/u);
  });

  it("lets one Whodunnit cook in the background without blocking other Debate work", () => {
    assert.match(source, /session\.mysteryForge\?\.state === "active"/u);
    assert.match(
      source,
      /window\.setInterval\([\s\S]{0,120}loadSessions\(\)[\s\S]{0,120}2_000/u,
    );
    assert.match(source, /Case Forge is continuing in the background/u);
    assert.match(
      source,
      /You can start another Debate or use other PRISM synthesis while it cooks/u,
    );
    assert.match(
      source,
      /Another Case Forge is already preparing a Whodunnit/u,
    );
    assert.match(source, /Another Whodunnit is already cooking/u);
    assert.match(source, /Return to Case Forge/u);
    assert.match(source, /Forging in background/u);
    assert.match(
      source,
      /data-tutorial-target="debate-mystery-background-forge"/u,
    );
    assert.match(source, /role="progressbar"/u);
    assert.match(css, /\.archiveForgeProgress/u);
    assert.match(css, /\.archiveForgeProgressTrack/u);
  });

  it("returns a stopped Case Forge to setup without discarding its Archive record", () => {
    assert.match(
      source,
      /activeSession\.formatState\.format === "whodunnit"[\s\S]{0,180}activeSession\.formatState\.compilation\.stage === "needs_attention"/u,
    );
    assert.match(source, /setStudioPanel\(stopped \? "motion" : "archive"\)/u);
    assert.match(source, /The stopped case remains saved in Archive/u);
  });

  it("leads Whodunnit setup through one preserved decision page at a time", () => {
    assert.match(source, /data-tutorial-target="whodunnit-quick-start"/u);
    assert.match(
      source,
      /type WhodunnitSetupPage = "mansion" \| "story" \| "experience" \| "production"/u,
    );
    assert.match(source, /label: "Mystery Venue", detail: "Choose the place"/u);
    assert.match(source, /label: "Story", detail: "Set tone and difficulty"/u);
    assert.match(source, /label: "Experience", detail: "Choose how you play"/u);
    assert.match(source, /label: "Production", detail: "Set art and audio"/u);
    assert.ok(
      source.indexOf('{ id: "experience", label: "Experience"') <
        source.indexOf('{ id: "mansion", label: "Mystery Venue"'),
    );
    assert.match(source, /useState<WhodunnitSetupPage>\("experience"\)/u);
    assert.match(source, /setupPage\.id === "mansion"/u);
    assert.match(
      source,
      /mysterySetupPage !== "mansion" \|\| mansionStepReady/u,
    );
    assert.match(
      source,
      /disabled=\{index > mansionPageIndex && !mansionStepReady\}/u,
    );
    assert.match(source, /data-whodunnit-setup-page=\{mysterySetupPage\}/u);
    assert.match(source, /mysterySetupPage === "mansion"/u);
    assert.match(source, /mysterySetupPage === "story"/u);
    assert.match(source, /mysterySetupPage === "experience"/u);
    assert.match(source, /mysterySetupPage === "production"/u);
    assert.match(source, /Installed Mystery Venues/u);
    assert.match(source, /Create a Mystery Venue/u);
    assert.match(source, /Setting description/u);
    assert.match(source, /Choose investigation length/u);
    assert.match(source, /Propose Venue/u);
    assert.match(source, /Use Proposal/u);
    assert.match(source, /Try Another/u);
    assert.match(source, /Start Blank/u);
    assert.match(
      source,
      /DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1\["neutral-mansion-v1"\]\[option\.id\]/u,
    );
    assert.match(source, /mysteryStyles\.presetCustomThumbnail/u);
    assert.match(source, /<InstalledMansionLibrary/u);
    assert.match(source, /Install a Mystery Venue/u);
    assert.match(source, /data-tutorial-target="whodunnit-mansion-library"/u);
    assert.match(source, /<strong>Mystery spark<\/strong><em>Optional<\/em>/u);
    assert.match(source, /Classic · balanced/u);
    assert.match(
      source,
      /<WhodunnitSetupDialog[\s\S]*?id="whodunnit-mansion-import"/u,
    );
    assert.match(
      source,
      /<WhodunnitSetupDialog[\s\S]*?id="whodunnit-seed-import"/u,
    );
    assert.match(source, /Continue to Cast/u);
    assert.match(source, /aria-hidden="true">←<\/span> Back/u);
    assert.doesNotMatch(
      source,
      /data-tutorial-target="whodunnit-more-options"/u,
    );
    assert.match(mysteryCss, /\.quickStartNote\s*\{/u);
    assert.match(mysteryCss, /\.guidedSetupProgress\s*\{/u);
    assert.match(mysteryCss, /\.mansionSourcePicker\s*\{/u);
    assert.match(
      mysteryCss,
      /\.presetThumbnail\s*\{[\s\S]*?aspect-ratio:\s*16\s*\/\s*9/u,
    );
    assert.match(
      mysteryCss,
      /\.presetCustomThumbnail\s*\{[\s\S]*?radial-gradient/u,
    );
    assert.match(mysteryCss, /\.guidedSetupFooter/u);
    assert.match(mysteryCss, /\.optionalSetupGroup\s*\{/u);
  });

  it("gives Whodunnit setup controls an unmistakable interactive grammar", () => {
    assert.match(source, /mysteryStyles\.setupControls/u);
    assert.match(source, /data-theme=\{props\.theme\}/u);
    assert.match(source, /aria-pressed=\{!selectedMysteryMansionBundle/u);
    assert.match(source, /"Selected ✓" : "Choose"/u);
    assert.match(source, />Install a Mystery Venue<\/button>/u);
    assert.match(source, /className=\{mysteryStyles\.setupField\}/u);
    assert.match(source, /className=\{mysteryStyles\.setupPrimaryAction\}/u);
    assert.match(
      source,
      /aria-current=\{step\.id === mysterySetupPage \? "step" : undefined\}/u,
    );
    assert.match(
      mysteryCss,
      /\.setupControls\s*\{[\s\S]*?--mystery-line:\s*var\(--debate-studio-line-strong/u,
    );
    assert.match(mysteryCss, /\.setupControls\[data-theme="light"\]/u);
    assert.match(mysteryCss, /\.quickStartNote\s*\{[\s\S]*?border-left:/u);
    assert.match(
      mysteryCss,
      /\.presetGrid button:hover:not\(:disabled\)[\s\S]*?transform:\s*translateY\(-2px\)/u,
    );
    assert.match(
      mysteryCss,
      /\.presetGrid button\[data-selected="true"\][\s\S]*?box-shadow:/u,
    );
    assert.match(
      mysteryCss,
      /\.guidedSetupProgress button\[data-active="true"\]/u,
    );
    assert.match(
      mysteryCss,
      /\.mansionSourcePicker > label\[data-selected="true"\]/u,
    );
    assert.match(mysteryCss, /\.whodunnitDialog\s*\{[\s\S]*?max-height:/u);
    assert.match(
      mysteryCss,
      /\.mansionPackageDropzone button:hover:not\(:disabled\)/u,
    );
    assert.match(
      mysteryCss,
      /\.installedMansionGrid > article\[data-selected="true"\]/u,
    );
    assert.match(
      mysteryCss,
      /\.setupPrimaryAction\.setupPrimaryAction\s*\{[\s\S]*?linear-gradient/u,
    );
  });

  it("applies built-in presets without touching proceeding content and derives Custom from manual differences", () => {
    const consent = [
      {
        version: DEBATE_SCHEMA_VERSION,
        format: "forum" as const,
        botId: "for",
        sideId: "for" as const,
        status: "accept" as const,
        reason: null,
        motionHash: "motion",
        botRevision: "bot",
        checkedAt: "2026-07-29T00:00:00.000Z",
      },
    ];
    const current = {
      format: "forum" as const,
      playerRole: "judge" as const,
      juryEnabled: false,
      formality: "heated" as const,
      roleChecks: consent,
      motion: { id: "motion" },
      cast: { moderator: "m", forAdvocate: "f", againstAdvocate: "a" },
      evidence: { notes: "frozen" },
      provider: "local",
      participantSide: "against",
      alignment: { x: 12 },
    };
    const publicForum = applyDebateSetupPreset(current, "public-forum");
    assert.equal(publicForum.format, "forum");
    assert.equal(publicForum.formality, "plainspoken");
    assert.equal(publicForum.playerRole, "spectator");
    assert.equal(publicForum.juryEnabled, true);
    assert.deepEqual(publicForum.roleChecks, []);
    assert.equal(publicForum.motion, current.motion);
    assert.equal(publicForum.cast, current.cast);
    assert.equal(publicForum.evidence, current.evidence);
    assert.equal(publicForum.provider, current.provider);
    assert.equal(publicForum.participantSide, current.participantSide);
    assert.equal(publicForum.alignment, current.alignment);

    const juryTrial = applyDebateSetupPreset(current, "jury-trial");
    assert.equal(juryTrial.format, "turnabout");
    assert.equal(juryTrial.formality, "structured");
    assert.deepEqual(juryTrial.roleChecks, []);
    const universityUnion = applyDebateSetupPreset(
      { ...current, formality: "parliamentary" as const },
      "classic-duel",
    );
    assert.equal(universityUnion.formality, "parliamentary");
    assert.equal(universityUnion.roleChecks, consent);
    assert.equal(
      derivedDebateSetupPresetId({
        selectedPresetId: "public-forum",
        format: "forum",
        formality: "plainspoken",
        playerRole: "spectator",
        juryEnabled: true,
      }),
      "public-forum",
    );
    assert.equal(
      derivedDebateSetupPresetId({
        selectedPresetId: "public-forum",
        format: "forum",
        formality: "plainspoken",
        playerRole: "judge",
        juryEnabled: true,
      }),
      "custom",
    );
    assert.equal(
      derivedDebateSetupPresetId({
        selectedPresetId: "public-forum",
        format: "forum",
        formality: "parliamentary",
        playerRole: "spectator",
        juryEnabled: true,
      }),
      "custom",
    );
  });

  it("requires one explicit evidence choice before Start unlocks", () => {
    assert.match(
      source,
      /const \[evidenceDecisionMade, setEvidenceDecisionMade\] = useState\(false\)/u,
    );
    assert.match(
      source,
      /debateCanStart =[\s\S]{0,220}roleChecksComplete[\s\S]{0,120}evidenceDecisionMade/u,
    );
    assert.match(source, /data-tutorial-target="debate-evidence-continue"/u);
    assert.match(source, /Continue without evidence/u);
    assert.match(source, /Use this evidence/u);
  });

  it("keeps one five-stop behavior contract behind the Atmosphere disclosure", () => {
    assert.match(source, /useState<DebateFormalityId>\("plainspoken"\)/u);
    assert.match(source, /DEBATE_FORMALITY_SPECTRUM/u);
    assert.match(
      source,
      /DEBATE_ROWDINESS_SPECTRUM = \[\.\.\.DEBATE_FORMALITY_SPECTRUM\]\.reverse\(\)/u,
    );
    assert.match(
      source,
      /const chooseFormality[\s\S]{0,180}setFormality\(nextFormality\)[\s\S]{0,100}setRoleChecks\(\[\]\)/u,
    );
    assert.match(source, /debateAdvocacyConsentMatchesSelection/u);
    assert.match(source, /consentNeedsReconfirmation/u);
    assert.match(source, /props\.responseMode/u);
    assert.match(source, /tutorialTarget="debate-rowdiness"/u);
    assert.match(source, /aria-label="Debate atmosphere"/u);
    assert.match(source, /University Union/u);
    assert.match(source, /Daytime Showdown/u);
    assert.match(
      source,
      /Changes the room’s heat,[\s\S]{0,80}moderator[\s\S]{0,30}pressure/u,
    );
    assert.match(source, /formality,\s+motion,/u);
    assert.match(source, /setFormality\(next\.formality\)/u);
    assert.match(source, /<span>Atmosphere<\/span>/u);
    assert.match(source, /debateFormalityDescriptor\(session\.formality\)/u);
    assert.match(css, /\.formalityControl/u);
    assert.match(css, /\.rowdinessControl/u);
    assert.match(css, /--debate-rowdiness-progress/u);
    assert.match(css, /::-webkit-slider-thumb/u);
  });

  it("routes Forum and Turnabout through distinct room responses", () => {
    assert.match(
      source,
      /session\.format === "turnabout"[\s\S]{0,120}DEBATE_TURNABOUT_FOLEY_ROOM_SEND[\s\S]{0,120}DEBATE_FORUM_FOLEY_ROOM_SEND/u,
    );
    assert.match(source, /format: next\.format/u);
    assert.match(
      page,
      /debateFormat === "turnabout"[\s\S]{0,120}DEBATE_TURNABOUT_VOICE_ROOM_SEND[\s\S]{0,120}DEBATE_FORUM_VOICE_ROOM_SEND/u,
    );
    assert.match(page, /"debate",\s*utterance\.format,/u);
  });

  it("keeps Debate voice playback enabled when optional effects are off", () => {
    assert.match(page, /debateAudioEnabled\(\{/u);
    assert.doesNotMatch(
      page,
      /audioEnabled=\{Boolean\([\s\S]{0,220}voiceEffectsEnabled !== false/u,
    );
  });

  it("prepares English speech in parallel with the responder handoff", () => {
    assert.match(
      source,
      /const voiceReady = utterance[\s\S]{0,100}onPrepareUtterance\?\.\(utterance\)/u,
    );
    assert.match(
      source,
      /const voiceReady = utterance[\s\S]{0,1600}const handoffPlan = debateSpeakerHandoffPlan/u,
    );
    assert.match(
      source,
      /setSpeakerHandoff\(\{ eventId: event\.id, phase: "wide" \}\)[\s\S]{0,4200}await voiceReady;/u,
    );
    assert.match(
      source,
      /if \(!presentationArmedForHandoff\) \{[\s\S]{0,120}setPresentationEventId\(event\.id\)/u,
    );
    assert.match(
      source,
      /const presentsImmediately =[\s\S]{0,180}!onPrepareUtterance &&/u,
    );
    assert.match(
      source,
      /presentsImmediately[\s\S]{0,500}setTranscriptVisibleThroughSequence\(\s*debateAdoptProceedingsCursor\(previous, next\)/u,
    );
    assert.match(source, /!presenting\s*\?\s*\(\[\.\.\.session\.events\]/u);
    assert.match(
      source,
      /const thinkingBotId = participantSlowTimeActive[\s\S]{0,260}responseCueSpeakerBotId[\s\S]{0,80}voicePreparationSpeakerBotId \?\?/u,
    );
    assert.match(
      page,
      /const prepareDebateUtterance = async[\s\S]{0,3600}const clip = prefetchBotcastUtterance\(/u,
    );
    assert.match(
      page,
      /const clip = prefetchBotcastUtterance\([\s\S]{0,3600}"debate"/u,
    );
    assert.match(
      page,
      /await Promise\.all\(\[clip, prepareEnglishVoice\(\)\]\)/u,
    );
    assert.match(page, /onPrepareUtterance=\{prepareDebateUtterance\}/u);
  });

  it("stages a new floor holder through wide, evidence, camera, and Foley beats", () => {
    assert.match(
      source,
      /if \(handoffPlan\) \{[\s\S]{0,300}phase: "wide"[\s\S]{0,700}phase: "evidence"[\s\S]{0,900}phase: "speaker"[\s\S]{0,700}phase: "foley"[\s\S]{0,1800}await voiceReady;/u,
    );
    assert.match(source, /phase: "evidence"[\s\S]{0,280}visibleContent: ""/u);
    assert.match(
      source,
      /sessionAmbientBotVocalizationCueForKind[\s\S]{0,700}playFoley\(cue\.url/u,
    );
    assert.match(
      source,
      /const activeTurnClock =[\s\S]{0,100}speakerHandoff === null/u,
    );
    assert.match(
      source,
      /const talking =[\s\S]{0,260}overlapSpeakingBotIds\.has\(bot\.id\)[\s\S]{0,220}speakerHandoff === null[\s\S]{0,280}activeSpeechTiming !== null &&\s*!speechMouthResting/u,
    );
    assert.match(
      source,
      /const talking =\s*presenting &&[\s\S]{0,180}speechTiming !== null &&\s*!speechMouthResting/u,
    );
    assert.match(source, /DEBATE_MOUTH_PAUSE_CLOSE_MS/u);
    assert.match(
      source,
      /noteDebateSpeechVoiceProgress[\s\S]{0,700}DEBATE_MOUTH_PAUSE_CLOSE_MS/u,
    );
    assert.match(
      source,
      /presentationEventId &&\s*liveReveal\?\.eventId === presentationEventId &&\s*\(liveReveal\.speechTiming \?\? null\) !== null/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-transition="handoff"\]\s*\{[^}]*transition:\s*transform 900ms/u,
    );
  });

  it("keeps Proceedings closed until stage presentation finishes after voice prep", () => {
    assert.match(
      source,
      /the rail never[\s\S]{0,120}streams[\s\S]{0,180}a turn drops in whole once its stage presentation[\s\S]{0,80}has finished/u,
    );
    assert.match(
      source,
      /const streaming =[\s\S]{0,180}presentationEventId === event\.id[\s\S]{0,220}liveReveal\.visibleContent\.length < event\.content\.length[\s\S]{0,80}if \(streaming\) return null/u,
    );
    assert.doesNotMatch(
      source,
      /setTranscriptVisibleThroughSequence\(event\.sequence\);[\s\S]{0,220}await voiceReady/u,
    );
  });

  it("does not mislabel Debate events as persisted Signal messages for voice synthesis", () => {
    assert.match(
      page,
      /playbackSurface === "signal"[\s\S]{0,120}\? \{ signalMessageId: message\.id \}/u,
    );
    assert.match(
      page,
      /requestBotcastEnglishClipWithFallback\([\s\S]{0,500}controller\.signal,\s+playbackSurface,/u,
    );
  });

  it("offers every recovery path when an advocate declines, including asking again", () => {
    assert.match(source, /Ask again/u);
    assert.match(source, /Swap sides/u);
    assert.match(source, /Change bot/u);
    assert.match(source, /Revise motion/u);
    // A decline never disables the consent button or blocks a re-check —
    // rerolling is always allowed; launch still requires every advocate to
    // accept server-side.
    assert.doesNotMatch(source, /Resolve declined role/u);
    assert.match(source, /if \(!castReady\) return/u);
    assert.match(source, /asking again is always allowed/u);
    assert.match(source, /stickyDeclinedConsentForCast/u);
    assert.match(
      source,
      /clearCastSlot\([\s\S]{0,180}declinedChecks\[0\]\?\.sideId/u,
    );
  });

  it("reconfirms accepted Debate consent after semantic routing changes", () => {
    assert.match(page, /consentRouting=\{debateConsentRouting\}/u);
    assert.match(
      page,
      /const debateReasoningEffort = debateEffortTarget[\s\S]{0,320}effectiveModelReasoningEffortForRequest/u,
    );
    assert.match(
      page,
      /const debateConsentRouting = debateEffortTarget[\s\S]{0,320}reasoningEffort: debateReasoningEffort \?\? "auto"/u,
    );
    assert.match(
      source,
      /check\.status !== "decline"[\s\S]{0,120}debateAdvocacyConsentMatchesSelection/u,
    );
    assert.match(source, /Needs reconfirmation/u);
    assert.match(source, /Reconfirm willingness/u);
    assert.match(source, /The model or Effort changed/u);
    assert.match(css, /data-status="needs_reconfirmation"/u);
    assert.doesNotMatch(source, /consentRouting.*turbo/iu);
  });

  it("captures editor values before functional state updates run", () => {
    assert.match(
      source,
      /const value = event\.currentTarget\.value;\s+setMotion\(\(current\)/u,
    );
    assert.match(
      source,
      /const value = event\.currentTarget\.value;\s+setEvidence\(\(current\)/u,
    );
  });

  it("keeps setup in one studio console with free navigation and one launch action", () => {
    assert.match(source, /type DebateView = "dashboard" \| "live"/u);
    assert.match(
      source,
      /type DebateStudioPanel = "motion" \| "cast" \| "evidence" \| "archive"/u,
    );
    assert.match(source, /data-debate-surface="dashboard"/u);
    assert.doesNotMatch(source, /type SetupStep/u);
    assert.doesNotMatch(source, /className=\{styles\.stepNav\}/u);
    assert.match(source, /className=\{styles\.studioNav\}/u);
    assert.match(source, /aria-pressed=\{studioPanel === panel\.id\}/u);
    assert.match(
      source,
      /studioPanel === "motion"[\s\S]{0,100}format === "whodunnit"[\s\S]{0,100}renderMysteryCourtStep\(\)[\s\S]{0,100}renderMotionStep\(\)/u,
    );
    assert.match(
      source,
      /studioPanel === "cast" \? renderCastStep\(\) : null/u,
    );
    // The Evidence panel renders for every role except the judge, whose
    // record is prepared out of view and sealed from them.
    assert.match(
      source,
      /studioPanel === "evidence" && !judgeOwnsHiddenEvidence[\s\S]{0,40}\? renderEvidenceStep\(\)[\s\S]{0,20}: null/u,
    );
    assert.match(source, /\{renderForumReadout\(\)\}/u);
    assert.match(source, /\{renderReviewStep\(\)\}/u);
    assert.doesNotMatch(source, /visitedSetupScreens|setupScreensComplete/u);
    assert.match(source, /className=\{styles\.studioNavStatus\}/u);
    assert.match(source, /className=\{styles\.packetSeal\}/u);
    assert.equal(
      (source.match(/data-tutorial-target="debate-start"/gu) ?? []).length,
      1,
    );
    assert.match(source, /Choose evidence or continue without it\./u);
    assert.match(source, /<BotPickerGrid/u);
    assert.match(source, /castPickerHueLens/u);
    assert.match(source, /Browse Debate cast bots by hue/u);
    assert.match(source, /castHueLensCenter/u);
    assert.match(source, /debateCastLensSliderInputValue/u);
    assert.match(source, /debateCastHueFromLensSliderInput/u);
    assert.match(css, /--cast-hue-p\) 0%,\s*var\(--cast-hue-p\) 20%/u);
    assert.match(
      css,
      /\.setup\[data-theme="light"\] \.castPickerHueLens\s*\{[^}]*--cast-hue-i:/u,
    );
    assert.match(source, /activeCastSlot/u);
    assert.match(source, /assignBotToCastSlot/u);
    assert.match(source, /Already cast/u);
    assert.match(source, /"Randomly select all three actors"/u);
    assert.match(source, /\{format !== "whodunnit" \? \(/u);
    assert.match(source, /onClick=\{randomizeCast\}/u);
    assert.doesNotMatch(source, /surpriseAndCompileMystery/u);
    assert.match(
      source,
      /className=\{styles\.studioUtilityButton\}[\s\S]*?data-tutorial-target="debate-stage-layout"[\s\S]*?onClick=\{openStageAlignment\}/u,
    );
    assert.match(source, /\{renderStageAlignmentModal\(activeSession\)\}/u);
    assert.match(
      source,
      /data-alignment-source=\{session \? "session" : "dashboard"\}/u,
    );
    assert.match(source, /Place Forum, Court, and Jury elements directly/u);
    assert.match(
      source,
      /const randomized = debateAlignmentPreviewCast\(\s*stageAlignmentCastCandidates\.map/u,
    );
    assert.match(source, /data-debate-stage-alignment-shuffle="true"/u);
    assert.match(source, /Shuffle cast/u);
    assert.match(page, /avatarDetails:\s*bot\.avatarDetails \?\? null/u);
    assert.match(page, /powers:\s*bot\.powers/u);
    assert.match(page, /systemPrompt:\s*bot\.system_prompt/u);
    assert.match(
      css,
      /\.dashboard \.dashboardRail \.setupActions\s*\{[^}]*position:\s*sticky[^}]*bottom:\s*0/u,
    );
    assert.match(
      css,
      /\.dashboard \.dashboardLayout\s*\{[^}]*grid-template-columns:\s*190px minmax\(620px,\s*1fr\) 342px/u,
    );
    assert.match(
      css,
      /\.dashboard \.dashboardDesk\s*\{[^}]*overflow-y:\s*auto[^}]*scrollbar-width:\s*thin/u,
    );
    assert.doesNotMatch(css, /\.dashboard \.sessionList\s*\{[^}]*max-height/u);
    assert.match(
      css,
      /\.dashboard \.dashboardPanel,[\s\S]*?border-radius:\s*0[^}]*background:\s*transparent/u,
    );
    assert.match(
      css,
      /\.studioNavButton\[data-active="true"\]\s*\{[^}]*border-left-color:\s*var\(--debate-studio-accent\)/u,
    );
    assert.match(
      css,
      /\.dashboard \.researchBox\s*\{[^}]*display:\s*grid[^}]*grid-template-columns:\s*minmax\(280px,\s*1fr\) auto/u,
    );
    assert.match(source, /\/end-early/u);
    assert.doesNotMatch(source, /\/jury\/skip-deliberation/u);
    assert.doesNotMatch(source, /debateAwaitsJuryDeliberationChoice/u);
    assert.match(source, /silentDeliberationPreparing/u);
    assert.doesNotMatch(source, /debateJuryDeliberationMouthShape\(/u);
    assert.doesNotMatch(source, /juryDeliberationMouthTickMs/u);
    assert.match(
      source,
      /const talking =\s*presenting &&[\s\S]{0,220}speechTiming !== null &&\s*!speechMouthResting/u,
    );
    assert.match(source, /The next juror will be heard in this chamber/u);
    assert.match(source, /debateJuryBallotVoiceCacheKey/u);
    assert.match(source, /jury\.preparedFinalBallots\.map/u);
    assert.match(source, /await onPrepareUtterance\(utterance\)/u);
    assert.match(page, /utterance\.voiceCacheKey \?\? utterance\.event\.id/u);
    assert.doesNotMatch(source, />\s*Watch Jury\s*</u);
    assert.doesNotMatch(source, />\s*Participate\s*</u);
    assert.doesNotMatch(source, /Skip to ballots/u);
    assert.doesNotMatch(source, /Begin deliberation/u);
    assert.doesNotMatch(source, /juryAutoDeliberationEnabled/u);
    assert.doesNotMatch(source, /juryDecisionTimeoutMs/u);
    assert.doesNotMatch(css, /\.juryDeliberationChoice/u);
    assert.doesNotMatch(css, /\.proceedingControlActions \.endEarlyButton/u);
    assert.match(css, /\.evidenceRail/u);
  });

  it("requires an explicit Library choice to assign a Whodunnit role card", () => {
    const mysterySeatCard = source.slice(
      source.indexOf("const renderMysteryCastSlot"),
      source.indexOf("const setJuryTrialEnabled"),
    );
    const castBotPicker = source.slice(
      source.indexOf("<BotPickerTile"),
      source.indexOf("</BotPickerGrid>"),
    );
    const mysteryCastDesktopCss = css.slice(
      css.indexOf(
        "@media (min-width: 901px) {",
        css.indexOf(".castPickerTile:disabled"),
      ),
      css.indexOf(".castPickerEmpty"),
    );

    assert.match(
      mysterySeatCard,
      /onClick=\{\(\) => \{\s*setActiveJurySeatIndex\(null\);\s*setActiveMysteryCastSeat\(seat\);\s*\}\}/u,
    );
    assert.doesNotMatch(mysterySeatCard, /surpriseMysterySeat\(seat\)/u);
    assert.match(
      castBotPicker,
      /if \(format === "whodunnit"\) \{\s*assignBotToMysterySeat\(bot\.id\);/u,
    );
    assert.match(
      source,
      /const mysterySeatRefractTarget[\s\S]{0,500}surpriseMysterySeat\(seat\)/u,
    );
    assert.match(
      source,
      /const mysteryGroupRefractTarget[\s\S]{0,700}randomizeMysteryGroup\(kind, groupId\)/u,
    );
    assert.match(
      mysteryCastDesktopCss,
      /data-debate-format="whodunnit"\][\s\S]*mysteryCastGroups/u,
    );
    assert.match(
      mysteryCastDesktopCss,
      /padding-top: 24px;[\s\S]*padding-bottom: 28px;/u,
    );
    assert.doesNotMatch(mysteryCastDesktopCss, /margin-top:/u);
    assert.match(
      mysteryCastDesktopCss,
      /data-role-group="suspects"[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u,
    );
    assert.match(
      mysteryCastDesktopCss,
      /data-role-group="jury"[\s\S]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/u,
    );
  });

  it("lets a hard-muted moderator create an open-floor Debate instead of blocking cast", () => {
    assert.doesNotMatch(source, /Hard-muted bots cannot moderate/u);
    assert.doesNotMatch(source, /Choose an audible moderator/u);
    assert.match(
      source,
      /This moderator will remain canonically silent[\s\S]*other bots will encounter that silence in character/u,
    );
    assert.match(source, /The moderator left the floor open/u);
    assert.match(source, /No challenge was spoken/u);
    assert.match(source, /Use the open floor however your side would/u);
  });

  it("projects invisible moderators through cast perception without voicing neutral ledger events", () => {
    assert.match(source, /botPowerObserverProjectionFromEffectsV1\(/u);
    assert.match(
      source,
      /cast\.some\(\(participant\) => participant\.id === target\.botId\)/u,
    );
    assert.match(
      source,
      /observerProjection\.visibility === "hidden"\s*\?\s*"hidden"/u,
    );
    assert.match(
      source,
      /if \(event\.speakerKind === "system"\)[\s\S]{0,260}revealEventSilently/u,
    );
    assert.match(source, /latestModeratorEvent\?\.speakerKind === "system"/u);
    assert.match(
      source,
      /event\.speakerKind === "system"[\s\S]{0,260}session\.formality === "parliamentary"[\s\S]{0,120}Public record/u,
    );
    assert.match(
      source,
      /archived\.status === "completed" \? "replay" : "live"/u,
    );
    assert.match(source, /\?perspective=\$\{perspective\}/u);
  });

  it("keeps stable tutorial targets across the complete Duel workflow", () => {
    for (const target of [
      "debate-new",
      "debate-presets",
      "debate-motion",
      "debate-synthesize",
      "debate-cast",
      "debate-archive",
      "debate-jury",
      "debate-jury-roster",
      "debate-jury-chamber",
      "debate-consent",
      "debate-evidence",
      "debate-readiness",
      "debate-save",
      "debate-start",
      "debate-case-board",
      "debate-case-board-tab",
      "debate-evidence-rail",
      "debate-pause",
      "debate-rail-tabs",
      "debate-camera",
      "debate-copy-transcript",
      "debate-copy-all-review-data",
      "debate-copy-case-board",
    ]) {
      assert.match(source, new RegExp(target, "u"));
    }
  });

  it("keeps the live record bounded beside the compact forum", () => {
    assert.match(source, /formatDebateVerboseTranscript/u);
    assert.match(source, /formatDebateCompleteReviewClipboard/u);
    assert.match(
      source,
      /export function formatDebateCompleteReviewClipboard[\s\S]{0,800}includeJury[\s\S]{0,400}join\("\\n\\n---\\n\\n"\)/u,
    );
    assert.match(source, /formatDebateCaseBoardTranscript/u);
    assert.match(source, /copyCaseBoardTranscript/u);
    assert.match(source, /copyAllDebateReviewData/u);
    assert.match(source, /Copy case board/u);
    assert.match(source, /Copy verbose transcript/u);
    assert.match(source, /Copy all data to clipboard/u);
    assert.match(source, /debate-copy-all-review-data/u);
    assert.match(
      source,
      /session\.status === "completed"[\s\S]{0,220}debate-copy-all-review-data/u,
    );
    assert.match(source, /className=\{styles\.transcriptFeed\}/u);
    assert.match(source, /className=\{styles\.debateRail\}/u);
    assert.match(
      css,
      /\.liveWorkspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(360px,\s*430px\)/u,
    );
    assert.match(css, /\.transcriptFeed\s*\{[^}]*overflow-y:\s*auto/u);
    assert.match(
      css,
      /\.debateRail\[data-completed="true"\]\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*height:\s*100%/u,
    );
    assert.match(
      css,
      /\.debateRail\[data-completed="true"\]\s+\.liveRailPanel\s+\.resultCard\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/u,
    );
    assert.match(
      css,
      /\.botStagePresence\s*\{[^}]*width:\s*clamp\(126px,\s*11\.4vw,\s*180px\)/u,
    );
    const visibleKinds =
      source.match(
        /const DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS = new Set\(\[([\s\S]*?)\]\);/u,
      )?.[1] ?? "";
    assert.doesNotMatch(visibleKinds, /"ballot"|"verdict",/u);
  });

  it("presents the synthesized title and exact motion in the proceedings header", () => {
    assert.match(source, /data-debate-motion-title="true"/u);
    assert.match(
      source,
      /className=\{styles\.liveMetaLine\}[\s\S]{0,900}className=\{styles\.eyebrow\}[\s\S]{0,900}LiveSessionModelChip[\s\S]{0,500}<\/div>[\s\S]{0,180}<h1 data-debate-motion-title="true"/u,
    );
    assert.match(
      css,
      /\.liveMetaLine\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*center;[^}]*white-space:\s*nowrap;/u,
    );
    assert.match(
      source,
      /data-debate-motion-title="true"[\s\S]{0,180}debateTitleForMotion\(session\.motion, session\.formality\)/u,
    );
    assert.match(source, /data-debate-exact-motion="true"/u);
    assert.doesNotMatch(source, /data-debate-stage-title="true"/u);
    assert.doesNotMatch(source, /className=\{styles\.stageTitle\}/u);
    assert.doesNotMatch(source, /className=\{styles\.motionPlinth\}/u);
    assert.match(source, /className=\{styles\.liveCaption\}/u);
    assert.match(source, /data-debate-live-caption="true"/u);
    assert.match(source, /data-caption-rows="adaptive"/u);
    assert.match(source, /debateLiveCaptionPage\(props\.text\)/u);
    assert.doesNotMatch(source, /caption\.scrollTop = caption\.scrollHeight/u);
    assert.match(source, /data-debate-captions-toggle="true"/u);
    assert.match(source, /data-debate-caption-size="decrease"/u);
    assert.match(source, /data-debate-caption-size="increase"/u);
    assert.match(source, /data-debate-caption-size-readout="true"/u);
    assert.match(source, /data-caption-size=\{liveCaptionSize\}/u);
    assert.match(source, /liveCaptionsEnabled &&/u);
    assert.match(source, /toggleLiveCaptions/u);
    assert.match(source, /writeDebateLiveCaptionsEnabled/u);
    assert.match(source, /writeDebateLiveCaptionSize/u);
    assert.match(
      source,
      /chamberEventVisible && activeEvent \? \(\s*liveCaptionsEnabled \? \(\s*<DebateVisibleTextConsumer/u,
    );
    assert.match(
      source,
      /data-captions=\{liveCaptionsEnabled \? "on" : "off"\}/u,
    );
    assert.match(
      source,
      /DebateLiveCaptionConsumer[\s\S]{0,700}debateSpokenText\(snapshot\.visibleContent\)\.trim\(\)/u,
    );
    assert.match(
      source,
      /speakerName=\{visibleEventName\([\s\S]{0,100}activeEvent,[\s\S]{0,80}playerName/u,
    );
    assert.match(source, /<strong>\{props\.speakerName\}<\/strong>/u);
    assert.match(
      css,
      /\.liveHeader h1\s*\{[^}]*font-family:\s*var\(--font-serif[^}]*text-overflow:\s*ellipsis/u,
    );
    assert.doesNotMatch(css, /\.stageTitle\s*\{/u);
    assert.doesNotMatch(css, /\.motionPlinth\s*\{/u);
    assert.match(
      css,
      /\.liveCaption\s*\{[^}]*bottom:\s*clamp\(18px,\s*4\.5%,\s*34px\)/u,
    );
    assert.match(
      css,
      /\.live\[data-evidence-on-table="true"\]\s*\.liveCaption\s*\{[^}]*bottom:\s*clamp\(76px,\s*14\.5%,\s*124px\)/u,
    );
    assert.match(
      source,
      /data-evidence-on-table=\{activeEvidenceItem \? "true" : undefined\}/u,
    );
    assert.match(
      css,
      /\.liveCaption span\s*\{[^}]*font-weight:\s*510[^}]*text-wrap:\s*pretty/u,
    );
    assert.doesNotMatch(
      css,
      /\.liveCaption span\s*\{[^}]*overflow-y:\s*hidden/u,
    );
    assert.match(
      css,
      /\.live\[data-caption-size="extra-large"\]\s*\{[^}]*--debate-caption-body-font:\s*clamp\(18px,\s*1\.66vw,\s*24px\)/u,
    );
    assert.match(
      css,
      /\.juryCenterTranscript p\s*\{[^}]*font-size:\s*var\(--debate-caption-body-font/u,
    );
  });

  it("restores archived proceedings as editable setup without restoring the model lane", () => {
    assert.match(source, /"Use setup"/u);
    assert.match(source, />\s*Assets\s*</u);
    assert.match(source, /data-tutorial-target="debate-archive-assets-open"/u);
    assert.match(source, /DebateArchiveAssetsModal/u);
    assert.match(source, /synthesizeArchiveExhibitImage/u);
    assert.match(source, /DebateExhibitMagentaControls/u);
    assert.match(source, /debateSessionRetryDraft\(/u);
    assert.match(source, /your current model and routing stay selected/u);
    const restoreBody = source.slice(
      source.indexOf("const restoreDebateSetupFromSession"),
      source.indexOf("const reuseSessionSetup"),
    );
    assert.match(restoreBody, /setRoleChecks\(\[\]\)/u);
    assert.match(restoreBody, /setEvidenceDecisionMade\(false\)/u);
    assert.match(restoreBody, /Review the motion, cast, and evidence choice/u);
    assert.doesNotMatch(restoreBody, /setPreferredProvider|setModelOverride/u);
  });

  it("progressively reveals archive detail and the correct proceeding action", () => {
    const archiveRows = source.slice(
      source.indexOf("const renderArchiveSessionRow"),
      source.indexOf(
        "const renderArchive =",
        source.indexOf("const renderArchiveSessionRow"),
      ),
    );
    assert.match(source, /expandedArchiveSessionId/u);
    assert.match(archiveRows, /aria-expanded=\{expanded\}/u);
    assert.match(archiveRows, /aria-controls=\{archiveDetailsId\}/u);
    assert.match(archiveRows, /hidden=\{!expanded\}/u);
    assert.match(
      archiveRows,
      /setExpandedArchiveSessionId\(\(current\) =>[\s\S]{0,140}current === group\.key \? null : group\.key/u,
    );
    assert.match(
      archiveRows,
      /const proceedingActionLabel = debateArchiveProceedingActionLabel\(group\)/u,
    );
    assert.match(archiveRows, /\{proceedingActionLabel\}/u);
    assert.match(
      archiveRows,
      /const canRestartArchivedProceeding =[\s\S]{0,180}session\.status === "waiting_for_player"/u,
    );
    assert.match(archiveRows, /data-tutorial-target="debate-archive-restart"/u);
    assert.match(archiveRows, />\s*Restart\s*</u);
    assert.match(
      source,
      /const restartArchivedProceeding = async \([\s\S]{0,900}\/api\/debates\/\$\{encodeURIComponent\(session\.id\)\}\/restart[\s\S]{0,900}await openSession\(\{ \.\.\.archived, status: restarted\.session\.status \}\)/u,
    );
    assert.match(
      source,
      /Restart with this proceeding's sealed model, effort, cast, rules, and evidence/u,
    );
    assert.match(
      archiveRows,
      /canRestartMysteryInvestigation[\s\S]{0,300}session\.mysteryVersion === 1/u,
    );
    assert.match(
      archiveRows,
      /session\.mysteryVersion === 2[\s\S]{0,120}session\.mysteryInvestigationMode === "full"/u,
    );
    assert.match(
      archiveRows,
      /canRestartMysteryCourt[\s\S]{0,220}session\.mysteryProgress === "trial"/u,
    );
    assert.match(
      archiveRows,
      /session\.format === "turnabout" \|\| session\.mysteryVersion === 2/u,
    );
    assert.match(archiveRows, />\s*Restart investigation\s*</u);
    assert.match(archiveRows, />\s*Restart court\s*</u);
    assert.match(
      source,
      /const restartArchivedMystery = async \([\s\S]{0,1000}mystery-restart-\$\{kind\}/u,
    );
    assert.match(
      source,
      /setView\(restarted\.session\.format === "whodunnit" \? "mystery" : "live"\)/u,
    );
    assert.match(
      source,
      /Restart investigation\?[\s\S]{0,600}Restart court\?/u,
    );
    assert.match(source, /Existing investigation progress and notes clear/u);
    assert.match(source, /frozen case record stay exactly as filed/u);
    assert.match(
      archiveRows,
      /className=\{styles\.archiveOpenButton\}[\s\S]{0,700}openSession\(openFamilyRun \?\? session\)/u,
    );
    assert.match(
      archiveRows,
      /className=\{styles\.archiveChipExpanded\}[\s\S]{0,500}archiveChipDetails/u,
    );
    assert.match(
      archiveRows,
      /archiveChipDetails[\s\S]{0,3000}archiveSynopsis/u,
    );
    assert.match(archiveRows, /archiveSynopsis[\s\S]{0,5000}archiveActions/u);
    assert.match(
      css,
      /\.archiveChipRow\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/u,
    );
    assert.match(css, /\.archiveChipExpanded\s*\{/u);
    assert.match(css, /\.archiveChipMotionPreview\s*\{/u);
    assert.match(
      css,
      /\.dashboard \.archivePanel \.archiveActions\s*\{[^}]*flex-wrap:\s*wrap/u,
    );
  });

  it("lets archived exhibits upload, reuse, and edit their fallback emoji in either theme", () => {
    assert.match(archiveAssetsSource, />\s*Upload\s*</u);
    assert.match(archiveAssetsSource, />\s*Library\s*</u);
    assert.match(archiveAssetsSource, /kind="debate_exhibit"/u);
    assert.match(archiveAssetsSource, /theme=\{props\.theme\}/u);
    assert.match(
      archiveAssetsSource,
      /accept="image\/png,image\/jpeg,image\/webp"/u,
    );
    assert.match(archiveAssetsSource, /onClick=\{props\.onEditEmoji\}/u);
    assert.match(
      archiveAssetsSource,
      /This changes only the fallback symbol\. Any attached sprite stays/u,
    );
    assert.match(
      source,
      /\/api\/debates\/exhibits\/upload[\s\S]{0,600}attachArchiveExhibitImage/u,
    );
    assert.match(
      source,
      /exhibits\/\$\{encodeURIComponent\(exhibit\.id\)\}\/emoji/u,
    );
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.archiveAssetsBackdrop/u,
    );
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.archiveAssetsDialog/u,
    );
    assert.match(
      assetLibraryCss,
      /\.modalBackdrop\[data-theme="light"\][\s\S]{0,800}--fg: #25212b/u,
    );
  });

  it("never sends current navbar routing into an archived Start or Resume", () => {
    const lifecycleBody = source.slice(
      source.indexOf("const pauseOrResume = async"),
      source.indexOf("pauseOrResumeRef.current = pauseOrResume"),
    );
    assert.match(lifecycleBody, /expectedRevision: session\.revision/u);
    assert.doesNotMatch(
      lifecycleBody,
      /startPreferredProvider|startModelOverride|startResponseMode|props\.reasoningEffort|props\.turbo/u,
    );
  });

  it("keeps non-guided player actions in a full-width command deck without reflowing proceedings", () => {
    assert.match(source, /data-player-window-active=/u);
    assert.match(
      source,
      /session\.status === "waiting_for_player" && !presenting[\s\S]{0,80}\? "true"/u,
    );
    assert.match(
      source,
      /session\.status === "waiting_for_player" &&[\s\S]{0,180}!participantProducerWindowActive &&[\s\S]{0,80}judgeGuidedStep === null &&[\s\S]{0,220}\? \([\s\S]*?className=\{styles\.liveCommandDeck\}[\s\S]*?\{renderPlayerWindow\(session\)\}/u,
    );
    assert.match(
      css,
      /\.liveCommandDeck\s*\{[^}]*position:\s*fixed[^}]*place-items:\s*center[^}]*pointer-events:\s*none/u,
    );
    assert.match(
      css,
      /\.liveCommandDeck \.playerWindow\s*\{[^}]*grid-template-columns:\s*minmax\(210px,\s*0\.75fr\)\s+minmax\(360px,\s*1\.45fr\)/u,
    );
  });

  it("puts player-Judge quick choices on the caption screen and reveals the shared composer only for custom prose", () => {
    assert.match(source, /debateJudgeGuidedStepKind/u);
    assert.match(source, /debateJudgeQuickChoices\(kind\)/u);
    assert.match(
      source,
      /data-tutorial-target="debate-judge-guided-controls"/u,
    );
    assert.match(source, /data-choice-kind=/u);
    assert.match(
      source,
      /choice\.action === "dismiss"[\s\S]{0,180}submitJudgeGavelMessage\(undefined, true\)[\s\S]{0,100}passPlayerTurn\(\)/u,
    );
    assert.match(source, /Write below, or roll the dice/u);
    assert.match(source, /Back to quick choices/u);
    assert.match(source, /renderJudgeComposer/u);
    assert.match(source, /\/api\/composer\/random-prompt/u);
    assert.match(source, /Return only the Judge's words/u);
    assert.match(
      source,
      /judgeGuidedStep === "gavel" \|\| judgeGuidedStep === "question"/u,
    );
    assert.match(
      css,
      /\.judgeChoiceDock\s*\{[^}]*position:\s*absolute[^}]*bottom:\s*4\.5%/u,
    );
    assert.match(css, /\.judgeQuickChoices\s*,[\s\S]*grid-template-columns/u);
    assert.match(
      css,
      /\.judgeQuickChoices > button\[data-choice-kind="dismiss"\]\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*justify-self:\s*center[^}]*font-size:\s*9px[^}]*opacity:\s*0\.58/u,
    );
    assert.match(page, /variant:\s*"debate"/u);
    assert.match(page, /debateJudgeComposerRef/u);
    assert.match(page, /Draft an editable Judge response/u);
    assert.match(
      pageCss,
      /\.compose\.debateJudgeComposer\s*\{[^}]*position:\s*fixed/u,
    );
  });

  it("puts a timed Sustained or Overruled ruling after a bot speaks its objection", () => {
    assert.match(source, /\/objection-ruling`/u);
    assert.match(source, /pendingRuling\?\.status === "awaiting_ruling"/u);
    assert.match(
      source,
      /data-tutorial-target="debate-judge-objection-ruling"/u,
    );
    assert.match(source, /role="alertdialog"/u);
    assert.match(source, /ref=\{objectionRulingDockRef\}/u);
    assert.match(source, /aria-keyshortcuts="S"/u);
    assert.match(source, /aria-keyshortcuts="O"/u);
    assert.match(source, /Sustained <kbd>S<\/kbd>/u);
    assert.match(source, /Overruled <kbd>O<\/kbd>/u);
    assert.match(source, /debateJudgeObjectionRulingShortcut/u);
    assert.match(source, /objectionRulingDockRef\.current\?\.focus\(\)/u);
    assert.match(
      source,
      /input, textarea, select, \[contenteditable="true"\]/u,
    );
    assert.match(source, /No ruling defaults to Overruled\./u);
    assert.match(source, /void submitObjectionRuling\("overruled"\)/u);
    assert.match(
      css,
      /\.judgeObjectionChoices\s*\{[^}]*grid-template-columns:\s*repeat\(2/u,
    );
  });

  it("gives paused, player, verdict, and failed proceedings visible stage states", () => {
    assert.match(source, /className=\{styles\.stageStateOverlay\}/u);
    for (const kind of ["player", "verdict", "failed"]) {
      assert.match(source, new RegExp(`data-kind="${kind}"`, "u"));
    }
    // Ready-to-begin and Archive-return holds use the full-screen intro title
    // so Proceedings cannot spoil the prepared gallery before Start/Resume.
    assert.match(source, /const titleCardHolding =/u);
    assert.match(source, /archiveReadinessForSession !== null/u);
    assert.doesNotMatch(
      source,
      /readyToBeginOverlay \|\| session\.playerRole === "spectator"/u,
    );
    assert.match(source, /data-hold=\{hold \? "true" : undefined\}/u);
    assert.match(source, /data-action=\{holdAction\.action \?\? "start"\}/u);
    assert.match(source, /Gallery ready/u);
    assert.match(source, /Start Debate/u);
    assert.match(
      source,
      /session\.status === "paused" &&\s*!presenting &&\s*!titleCardHolding \?/u,
    );
    assert.match(source, /data-kind="paused"/u);
    assert.match(source, /Debate paused/u);
    assert.match(source, /Resume Debate/u);
    assert.match(
      source,
      /The interrupted line is preserved and will replay from\s+its\s+beginning/u,
    );
    assert.match(source, /The first audible sequence is being readied/u);
    assert.match(css, /\.identOverlay\[data-hold="true"\]/u);
    assert.match(css, /\.identHoldAction/u);
    // Hold composition overrides must follow timed intro composition so Start
    // Debate cannot fade out with the cinematic curtain while data-hold is set.
    const introCompositionIdx = css.indexOf(
      '.identOverlay[data-kind="intro"] .identComposition',
    );
    const holdCompositionIdx = css.indexOf(
      '.identOverlay[data-hold="true"] .identComposition',
    );
    assert.ok(introCompositionIdx >= 0, "intro composition animation missing");
    assert.ok(holdCompositionIdx >= 0, "hold composition override missing");
    assert.ok(
      holdCompositionIdx > introCompositionIdx,
      "hold composition must cascade after intro composition",
    );
    assert.match(
      css,
      /\.identOverlay\[data-hold="true"\]\[data-kind="intro"\] \.identComposition/u,
    );
    assert.match(source, /debateLivePhaseLabel\(session/u);
    assert.match(source, /debateJuryRosterFooterCopy\(/u);
    assert.match(source, /debateJuryOutcomeRevealed\(/u);
    assert.match(page, /const debateLastVoiceClipRef = useRef/u);
    assert.match(
      page,
      /playbackSurface === "debate"[\s\S]{0,120}debateLastVoiceClipRef\.current\?\.key === message\.id/u,
    );
    assert.match(
      page,
      /debateLastVoiceClipRef\.current = \{ key: message\.id, clip \}/u,
    );
    assert.match(source, /The floor turns to you/u);
    assert.match(source, /The proceeding is sealed/u);
    assert.match(source, /No prevailing side/u);
    assert.match(css, /\.stageStateOverlay\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.identOverlay\[data-hold="true"\]/u);
    assert.match(css, /\.identHoldAction/u);
  });

  it("copies Debate errors from the shared compact chrome rail", () => {
    assert.match(source, /function DebateErrorToast/u);
    assert.match(source, /writeDebateClipboardText\(props\.message\)/u);
    assert.match(
      source,
      /<PrismChromeNoticeViewport ariaLabel="Debate notifications">/u,
    );
    assert.match(source, /label="Debate error"/u);
    assert.match(source, /"Copy error"/u);
    assert.ok(
      (
        source.match(
          /<DebateErrorToast[\s\S]{0,120}message=\{error\}[\s\S]{0,120}onDismiss=\{\(\) => setError\(null\)\}/gu,
        ) ?? []
      ).length >= 2,
    );
    assert.doesNotMatch(source, /styles\.errorToast/u);
  });

  it("shows one overall live timer and a separate speech-synced floor clock", () => {
    assert.match(source, /function DebateElapsedTimer/u);
    assert.match(source, /debateScaledElapsedMs\(/u);
    assert.match(source, /debateParticipationClockRate\(/u);
    assert.match(source, /accumulatedMs=\{watchElapsedAccumulatedMs\}/u);
    assert.match(source, /runningSinceMs=\{watchElapsedRunningSinceMs\}/u);
    assert.match(source, />Debate time</u);
    assert.match(
      source,
      /<DebateElapsedTimer[\s\S]{0,180}accumulatedMs=\{watchElapsedAccumulatedMs\}/u,
    );
    assert.doesNotMatch(
      source,
      /debateLiveElapsedDurationMs\(props\.session, nowMs\)/u,
    );
    assert.match(source, /DEBATE_PROCEEDINGS_STENOGRAPHER_DELAY_MS/u);
    assert.match(source, /scheduleProceedingsReveal/u);
    assert.match(
      source,
      /onStart:[\s\S]{0,180}scheduleProceedingsReveal\(next\.id, event\.sequence\)/u,
    );
    assert.match(
      presentation,
      /Delay after a floor line begins before it opens in Proceedings/u,
    );
    assert.match(
      presentation,
      /DEBATE_PROCEEDINGS_STENOGRAPHER_DELAY_MS = 400/u,
    );
    assert.match(source, /debateInitialProceedingsCursor/u);
    assert.match(
      source,
      /transcriptVisibleThroughSequence !== null &&\s*event\.sequence <= transcriptVisibleThroughSequence/u,
    );
    assert.match(source, /function DebateTurnClock/u);
    assert.match(
      source,
      /debateTurnClockState\(props\.event,\s*props\.speechTiming\)/u,
    );
    assert.match(source, /role="timer"/u);
    assert.match(source, /data-status=\{clock\.status\}/u);
    assert.match(source, /Spoken duration: ~\$\{formatDebateSpokenDuration/u);
    assert.match(source, /setting-independent estimate/u);
    assert.match(source, /activeTurnClock\?\.status === "overtime"/u);
    assert.match(
      source,
      /debateVisibleContentAtSpeechTime\(\{[\s\S]{0,260}elapsedMs[\s\S]{0,120}alignment: playbackAlignment/u,
    );
    assert.match(
      source,
      /<DebateTurnClockConsumer\s+store=\{presentationStore\}\s+sessionId=\{session\.id\}\s+event=\{activeEvent\}/u,
    );
    assert.match(css, /\.turnClock\s*\{[^}]*position:\s*absolute/u);
    assert.match(css, /\.turnClock > strong\s*\{[^}]*font-variant-numeric/u);
    assert.match(
      css,
      /\.debateElapsedTimer\s*\{[^}]*font-variant-numeric:\s*tabular-nums/u,
    );
    assert.match(
      css,
      /\.turnClock\[data-status="overtime"\]\s*\{[^}]*#ff795f[^}]*animation:\s*debate-turn-clock-overtime/u,
    );
    assert.doesNotMatch(source, />Spoken line</u);
    assert.doesNotMatch(css, /--debate-spoken-line-progress/u);
  });

  it("keeps in-room controls, paused copy, and confirmation actions legible in Light Mode", () => {
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.confirmDialog button/u,
    );
    assert.match(source, /className=\{styles\.confirmKeepButton\}/u);
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.confirmDialog \.confirmKeepButton/u,
    );
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.confirmDialog \.confirmDeleteButton/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.liveHeader \.exitButton\s*\{[^}]*color:\s*#3b3343;[^}]*background:\s*rgba\(255,\s*255,\s*255,\s*0\.78\)/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.stageStateOverlay > small\s*\{[^}]*color:\s*#5f5666/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.eyebrow\s*\{[^}]*color:\s*#6551b2/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.caseBoard > header span,[\s\S]*?\.live\[data-theme="light"\] \.audienceGallery > header small\s*\{[^}]*color:\s*#655c6d/u,
    );
  });

  it("treats proceedings and evidence as keyboard-operable app surfaces", () => {
    assert.match(source, /role="log"/u);
    assert.match(source, /aria-relevant="additions"/u);
    assert.match(source, /tabIndex=\{0\}/u);
    assert.match(source, /role="dialog"/u);
    assert.match(source, /aria-modal="true"/u);
    assert.match(source, /event\.key === "Escape"/u);
    assert.match(css, /:focus-visible/u);
  });

  it("uses in-app deletion, safe Markdown, and resilient follow-to-live presentation", () => {
    assert.doesNotMatch(source, /window\.confirm/u);
    assert.match(source, /role="alertdialog"/u);
    assert.match(source, /\/api\/prism\/actions\/undo/u);
    assert.match(source, /<ReactMarkdown/u);
    assert.match(source, /remarkPlugins=\{\[remarkGfm\]\}/u);
    assert.match(source, /skipHtml/u);
    assert.match(source, /debateEvidenceFromMarkdownHref/u);
    assert.match(source, /urlTransform=\{debateEvidenceUrlTransform\}/u);
    assert.match(source, /data-debate-evidence-chip=/u);
    assert.match(source, /onSource=\{setSourceDrawerId\}/u);
    assert.match(source, /new ResizeObserver/u);
    assert.match(source, /debateTranscriptIsAtLive/u);
    assert.match(source, /↓ Live/u);
    assert.match(source, /cancelCurrentPresentation/u);
    assert.match(
      source,
      /event\.sequence < pausedPresentationEvent\.sequence/u,
    );
    assert.match(
      source,
      /presentationPlaybackEventIdRef\.current =\s*fresh\.find\([\s\S]{0,180}event\.speakerKind !== "system" && event\.kind !== "error"/u,
    );
    assert.match(
      source,
      /const \[eventIndex, event\] of fresh\.entries\(\)[\s\S]{0,600}fresh\s*\.slice\(eventIndex \+ 1\)/u,
    );
    assert.match(source, /lifecycle:\s*\{[\s\S]*onProgress/u);
    assert.match(page, /utterance\.lifecycle \?\? \{\}/u);
    assert.match(css, /\.transcriptMarkdown/u);
    assert.match(css, /\.returnToLiveButton/u);
  });

  it("keeps ordinary Participant interjections as a conversational floor break", () => {
    assert.match(source, /\/participant-floor-break`/u);
    assert.match(source, /startParticipantFloorBreak\("interjection"\)/u);
    assert.match(source, /\/participant-floor-break\/resolve/u);
    assert.match(source, /Interject now/u);
    assert.match(source, /Conversational cut-in/u);
    assert.match(source, /The moderator will restore the scheduled floor/u);
    assert.match(source, /"interjection"/u);
    assert.match(source, /"moderator_ruling"/u);
    assert.match(source, /debateGalleryReactingIndices/u);
    assert.match(source, /data-listening-reaction/u);
    assert.match(source, /Moderator transition/u);
    assert.match(source, /className=\{styles\.floorStatus\}/u);
    assert.match(css, /\.interjectionBar/u);
    assert.match(css, /\.floorStatus/u);
  });

  it("lets a Participant shout first, then state or withdraw a persisted objection", () => {
    assert.match(source, /\/participant-floor-break`/u);
    assert.match(source, /\/participant-floor-break\/resolve/u);
    assert.match(source, /participantObjectionShortcutEnabledRef/u);
    assert.match(source, /event\.key\.toLocaleLowerCase\(\) !== "o"/u);
    assert.match(
      source,
      /input, textarea, select, button, a\[href\],[\s\S]{0,100}\[role="textbox"\]/u,
    );
    assert.match(source, /aria-keyshortcuts="O"/u);
    assert.match(source, />\s*Objection!\s*<kbd/u);
    assert.match(source, /cancelCurrentPresentation\(\)/u);
    assert.match(source, /participant_objection_reason/u);
    assert.match(source, /Objection raised/u);
    assert.match(source, /State the point/u);
    assert.match(
      source,
      /The floor is held\. The moderator will rule when you submit\./u,
    );
    assert.match(
      source,
      /What specifically is wrong with the claim, procedure, or cited evidence\?/u,
    );
    assert.match(source, />\s*Withdraw\s*</u);
    assert.match(source, />\s*Submit objection\s*</u);
    assert.match(
      source,
      /session\.stepKey === "participant_objection_reason"[\s\S]{0,140}session\.participantObjection\?\.status === "awaiting_reason"/u,
    );
    assert.match(
      source,
      /participantObjectionAwaitingReason[\s\S]{0,150}Resolve your objection first/u,
    );
    assert.match(
      source,
      /const previousEventIds = new Set\([\s\S]{0,180}!previousEventIds\.has\(event\.id\)/u,
    );
    assert.match(css, /\.participantFloorRail/u);
    assert.match(css, /\.participantObjectionButton/u);
    assert.match(css, /\.participantObjectionDock/u);
    assert.match(
      css,
      /\.participantObjectionActions button\s*\{[^}]*min-height:\s*44px/u,
    );
    assert.match(
      css,
      /@media \(forced-colors: active\)[\s\S]*?\.participantFloorRail/u,
    );
  });

  it("directs every Participant floor turn through the PRISM advocate podium", () => {
    assert.match(source, /function debateParticipantFloorRole/u);
    assert.match(
      source,
      /session\.playerRole !== "participant"[\s\S]{0,120}event\?\.speakerKind !== "player"/u,
    );
    assert.match(
      source,
      /const participantFloorRole = debateParticipantFloorRole\(\s*session,\s*activeEvent/u,
    );
    assert.match(
      source,
      /activeEvent\?\.speakerKind === "player" && participantPlayerBotId[\s\S]{0,100}\? participantPlayerBotId/u,
    );
    assert.match(
      source,
      /event\?\.kind === "objection" \|\| event\?\.kind === "interjection"/u,
    );
    assert.match(
      source,
      /data-participant-proxy=\{\s*playerControlled \? "true" : undefined/u,
    );
    assert.match(
      source,
      /playerControlled && participantCuttingIn[\s\S]{0,80}\? "true"/u,
    );
    assert.match(
      source,
      /playerControlled && participantObjecting[\s\S]{0,80}\? "true"/u,
    );
    assert.match(
      source,
      /session\.playerRole === "participant" &&\s*session\.playerSideId !== "against"\s*\? null/u,
    );
    assert.match(
      source,
      /session\.playerRole === "participant" &&\s*session\.playerSideId === "against"\s*\? null/u,
    );
    assert.match(
      css,
      /\.botStagePresence\[data-participant-proxy="true"\]\[data-cut-in="true"\]/u,
    );
    assert.match(
      css,
      /\.botStagePresence\[data-participant-proxy="true"\]\[data-objecting="true"\]/u,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]{0,320}\.botStagePresence/u,
    );
    assert.doesNotMatch(source, /styles\.playerPresence/u);
    assert.doesNotMatch(css, /\.playerPresence/u);
  });

  it("names the selected Participant proxy after the account and casts only a Judge and opponent", () => {
    assert.equal(DEBATE_PLAYER_PARTICIPANT_BOT_ID, "prism:player-participant");
    assert.match(source, /const DEBATE_PLAYER_PARTICIPANT_PRISM/u);
    assert.match(source, /function debateParticipantPrismAvatar/u);
    assert.match(
      source,
      /id: DEBATE_PLAYER_JUDGE_BOT_ID,[\s\S]{0,160}role: "advocate"/u,
    );
    assert.match(
      source,
      /if \(event\.speakerKind === "player"\)[\s\S]{0,80}return playerName/u,
    );
    assert.match(
      source,
      /const participantInputRole:[\s\S]{0,180}!presenting[\s\S]{0,180}session\.status === "waiting_for_player"/u,
    );
    assert.match(
      source,
      /const activeRole:[\s\S]{0,100}participantInputRole \?\?/u,
    );
    assert.match(
      source,
      /session\.phase === "opening"[\s\S]{0,100}"Deliver your opening"[\s\S]{0,100}session\.phase === "closing"[\s\S]{0,100}"Deliver your closing"/u,
    );
    assert.match(
      source,
      /participantInputRole && participantPlayerBotId[\s\S]{0,80}\? participantPlayerBotId/u,
    );
    assert.match(
      source,
      /const appearanceBot = playerControlled\s*\? participantPrismBot/u,
    );
    assert.match(
      source,
      /const playerName = props\.playerName\.trim\(\) \|\| "You"/u,
    );
    assert.match(
      source,
      /name:\s*playerName,[\s\S]{0,180}player-controlled visual proxy/u,
    );
    assert.match(
      page,
      /playerName=\{user\?\.displayName\?\.trim\(\) \|\| "You"\}/u,
    );
    assert.match(
      source,
      /fixedParticipantAdvocate[\s\S]{0,260}playerParticipantBot/u,
    );
    assert.match(
      source,
      /playerRole === "participant"\s*\? \["moderator", participantOpponentCastSlot\]/u,
    );
    assert.match(
      source,
      /playerRole === "participant" && playerSideId === "for"\s*\? undefined\s*: cast\.forAdvocate/u,
    );
    assert.match(
      source,
      /playerRole === "participant" && playerSideId === "against"\s*\? undefined\s*: cast\.againstAdvocate/u,
    );
    assert.match(source, /Participant is available in Forum only\./u);
    assert.match(
      source,
      /const movesParticipantToJudge =\s*playerRole === "participant" && option\.id === "turnabout"/u,
    );
    assert.equal(
      debatePlayerRoleAfterFormatSelection("participant", "turnabout"),
      "judge",
    );
    assert.match(
      source,
      /\(role === "participant" && format === "turnabout"\)[\s\S]{0,100}\(role === "judge" && format === "whodunnit"\)/u,
    );
    assert.match(source, /function debateParticipantModeratorTitle/u);
    assert.match(source, /`\$\{normalized\} · Judge`/u);
    assert.match(
      css,
      /\.botIdentityPosition\[data-participant-proxy="true"\] \.botIdentityPlate/u,
    );
    assert.doesNotMatch(source, /Pass to partner/u);
    assert.doesNotMatch(source, /challenge_participant_partner/u);
    assert.doesNotMatch(source, /rebuttal_(?:against|for)_partner/u);
  });

  it("unifies audience order and semantic intervention behind one contextual gavel", () => {
    assert.match(source, /\/judge-gavel`/u);
    assert.match(source, /\/judge-gavel\/order`/u);
    assert.match(source, /\/judge-gavel\/message`/u);
    assert.match(source, /data-tutorial-target="debate-judge-gavel"/u);
    assert.match(source, /const judgeCanCallTime =/u);
    assert.match(source, /activeTurnClock\?\.status === "overtime"/u);
    assert.match(source, /const judgeUnifiedGavelAction =/u);
    assert.match(source, /judgeGavelInterventionEligibleNow/u);
    assert.match(source, /\? \("call-time" as const\)/u);
    assert.match(source, /\? "Call time"/u);
    assert.match(source, /\? "Intervene"/u);
    assert.doesNotMatch(source, /className=\{styles\.judgeInterveneButton\}/u);
    assert.match(source, /judgeGavelCooldownRemainingMs/u);
    assert.match(source, /debateJudgeGavelCooldownBlocks/u);
    assert.match(source, /overtime: judgeCanCallTime/u);
    assert.match(source, /debateJudgeGavelSpaceAction/u);
    assert.match(
      source,
      /interventionAvailable:\s*context\.interventionAvailable/u,
    );
    assert.match(source, /orderAvailable:\s*context\.orderAvailable/u);
    assert.match(source, /blockedNotice:\s*judgeGavelShortcutBlockedNotice/u);
    assert.match(source, /setAutoRecoveryNotice\(context\.blockedNotice\)/u);
    assert.match(source, /data-space-shortcut="true"/u);
    assert.match(source, /gavelShortcutTarget\?\.blur\(\)/u);
    assert.match(source, /Intervention cooling/u);
    assert.match(source, /Gavel still settles gallery/u);
    assert.match(css, /\.judgeGavelCooldownStatus\s*\{/u);
    assert.match(
      css,
      /\.judgeGavelButton\[data-cooling="true"\]\s*\{[^}]*animation:\s*none/u,
    );
    assert.match(
      source,
      /const debateFloorMutationInFlightRef = useRef\(false\)/u,
    );
    assert.match(
      source,
      /busy \|\|\s*audienceOrderSavingRef\.current \|\|\s*debateFloorMutationInFlightRef\.current/u,
    );
    assert.match(source, /event\.currentTarget\.blur\(\)/u);
    assert.match(source, /<kbd aria-hidden="true">Space<\/kbd>/u);
    assert.match(
      source,
      /action === "smash"[\s\S]{0,180}judgeGavelSmashShowmanshipKindRef\.current[\s\S]{0,80}return/u,
    );
    assert.match(
      source,
      /First smack: calm the room[\s\S]{0,500}orderDebateAudienceRef\.current/u,
    );
    assert.match(
      source,
      /action === "intervene"[\s\S]{0,120}swingJudgeGavelRef\.current/u,
    );
    assert.match(
      source,
      /judgeGavelSmashUntilRef\.current =\s*Date\.now\(\) \+ DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS/u,
    );
    assert.match(
      source,
      /suppressNextJudgeGavelPresentationCueRef\.current = true/u,
    );
    assert.match(
      source,
      /judgeGavelOvertimeBurstActiveRef\.current = overtime/u,
    );
    assert.match(source, /judgeGavelOvertimeStrikeCountRef\.current \+= 1/u);
    assert.match(
      source,
      /window\.setTimeout\(resolve, DEBATE_JUDGE_GAVEL_SMASH_WINDOW_MS\)/u,
    );
    assert.match(source, /strikeCount,/u);
    assert.match(
      source,
      /judgeGavelSmashCue \?\? \(presenting \? liveGavelCue : null\)/u,
    );
    assert.match(source, /Address the debaters/u);
    assert.match(source, /Resume without message/u);
    assert.match(source, /Send to the floor/u);
    assert.match(source, /DEBATE_JUDGE_GAVEL_MESSAGE_MAX_LENGTH/u);
    assert.match(
      source,
      /event\.kind === "judge_gavel" &&\s*event\.gavelReason === "intervention"[\s\S]{0,260}speechTiming:\s*null/u,
    );
    assert.match(page, /debateJudgeGavelVoiceMood\(utterance\.event\)/u);
    assert.match(source, /data-tutorial-target="debate-pause"/u);
    assert.match(source, /data-tutorial-target="debate-rail-tabs"/u);
    assert.match(source, /data-tutorial-target="debate-evidence-rail"/u);
    assert.match(source, /data-tutorial-target="debate-case-board-tab"/u);
    assert.doesNotMatch(
      source,
      /data-tutorial-target="debate-proceeding-controls"/u,
    );
    assert.doesNotMatch(source, /Proceeding console/u);
    assert.doesNotMatch(source, /Judge proceeding controls/u);
    assert.match(source, /className=\{styles\.captionControls\}/u);
    assert.match(source, /className=\{styles\.stageTransportControls\}/u);
    assert.match(source, /className=\{styles\.stagePauseButton\}/u);
    assert.match(source, /className=\{styles\.stageGavelButton\}/u);
    assert.match(source, /judgeControl=\{null\}/u);
    assert.match(
      css,
      /\.captionControls\s*\{[^}]*bottom:\s*14px[^}]*left:\s*14px/u,
    );
    assert.match(
      css,
      /\.stageTransportControls\s*\{[^}]*bottom:\s*14px[^}]*right:\s*14px/u,
    );
    assert.match(source, /className=\{styles\.liveRailTabs\}/u);
    assert.match(source, /className=\{styles\.evidenceRail\}/u);
    assert.match(source, /liveRailPanel === "proceedings"/u);
    assert.match(source, /setLiveRailPanel\("proceedings"\)/u);
    assert.match(source, /data-action="resume"/u);
    assert.match(source, /Resume Debate/u);
    assert.match(source, /data-tutorial-target="debate-pause"/u);
    assert.match(
      source,
      /\{pauseOnCooldown[\s\S]{0,120}\? "Pause…"[\s\S]{0,180}: "Pause"\}/u,
    );
    assert.match(source, /quietSave: true/u);
    assert.match(source, /\$\{lifecyclePath\}\/announce/u);
    assert.match(source, /resume \? "resume" : "pause"/u);
    assert.match(source, /debateSessionWithRecessResumeFiller/u);
    assert.match(
      source,
      /const heldFloorReplayEvents = debateResumeFloorReplayEvents\([\s\S]{0,140}pausedPresentationEvent\.sequence/u,
    );
    assert.match(
      source,
      /events: heldFloorReplayEvents[\s\S]{0,600}setActiveSession\(result\.session\)/u,
    );
    assert.match(
      source,
      /held && debateEventIsModeratorIntro\(held\)[\s\S]{0,80}return session/u,
    );
    assert.match(
      source,
      /const silentLifecycle =[\s\S]{0,160}bufferedReturnGavel;/u,
    );
    assert.doesNotMatch(source, /resumeOpeningIntro/u);
    assert.match(source, /if \(lifecycleEvent\) \{/u);
    assert.match(
      source,
      /introCameraSpeechSnapshot\.eventId === event\.id[\s\S]{0,120}visibleContent\.length/u,
    );
    assert.match(source, /Speech ticks often skip React liveReveal/u);
    assert.match(source, /debateRecessResumeFiller/u);
    assert.match(source, /debateExitPresentationEventId/u);
    assert.match(source, /debateSessionNeedsReturnPause\(session\)/u);
    assert.match(source, /nextMutationKey\("return-recess"\)/u);
    assert.match(source, /nextMutationKey\("bake-lift-recess"\)/u);
    assert.match(source, /nextMutationKey\("bake-restore-recess"\)/u);
    assert.match(source, /needsSpectatorBakeResume/u);
    assert.match(
      source,
      /needsSpectatorBakeResume && session\.status === "paused"/u,
    );
    assert.match(
      source,
      /participantExit \? "participant-exit-recess" : "moderator-exit-recess"/u,
    );
    assert.match(
      source,
      /recessRequest[\s\S]{0,120}\.catch\([\s\S]{0,280}already finished/u,
    );
    assert.match(source, /exitRecovery: true/u);
    assert.match(source, /presentationEventId:\s*replayEventId/u);
    assert.match(source, /pausedPresentationEventId/u);
    assert.match(source, /debateSpectatorAwaitingFirstWatch/u);
    assert.match(
      source,
      /settleDebatePresentationCallback\(onUtterance\?\.\(/u,
    );
    assert.match(source, /lastProgressAtMs: \(\) => lastVoiceProgressAtMs/u);
    assert.match(source, /let lastVoiceProgressAtMs = 0/u);
    assert.match(source, /DEBATE_PRESENTATION_FIRST_VOICE_STALL_MS/u);
    assert.doesNotMatch(source, /\/seal-presentation/u);
    assert.match(source, /nextMutationKey\("spectator-ready-hold"\)/u);
    assert.match(source, /startSpectatorWatch\s*\?\s*"spectator-start"/u);
    assert.match(source, /readyToBeginOverlay \?/u);
    assert.doesNotMatch(
      source,
      /readyToBeginOverlay \|\| session\.playerRole === "spectator"/u,
    );
    assert.match(source, /data-hold=\{hold \? "true" : undefined\}/u);
    assert.match(source, /Start Debate/u);
    assert.match(source, /Gallery ready/u);
    assert.match(source, /activeSession\.stepKey === "completed"/u);
    assert.match(source, /hasRemainingEvents/u);
    assert.match(source, /debateRequestIsRevisionConflict\(caught\)/u);
    assert.match(source, /const lifecycleIdempotencyKey = nextMutationKey/u);
    assert.match(
      source,
      /idempotencyKey: `\$\{lifecycleIdempotencyKey\}:quiet`/u,
    );
    assert.match(
      source,
      /idempotencyKey: `\$\{lifecycleIdempotencyKey\}:announce`/u,
    );
    assert.match(
      source,
      /const lifecycleCutscene = resume \|\| !juryCameraActive/u,
    );
    assert.match(source, /juryVisible: !lifecycleCutscene/u);
    assert.match(
      source,
      /event\.stepKey === \(resume \? "resume" : "pause"\)/u,
    );
    assert.match(
      source,
      /const lifecycleGavelAlreadyStruck =\s*lifecycleEvent !== undefined &&\s*\(resumeCeremonyStarted \|\| bufferedReturnGavel\)/u,
    );
    assert.match(
      source,
      /triggerJudgeGavelSmash\("order", resumeGavelEventId\)/u,
    );
    assert.match(
      source,
      /resumedLifecycleGavelPresentationEventId:[\s\S]{0,100}lifecycleGavelAlreadyStruck[\s\S]{0,100}lifecycleEvent\.id/u,
    );
    assert.match(
      source,
      /await adoptSession\(previous, result\.session,[\s\S]{0,120}automaticJudgeGavel: true/u,
    );
    assert.match(
      source,
      /await adoptSession\(ceremonyPrevious, result\.session,[\s\S]{0,180}lifecycleEvent\.id/u,
    );
    assert.match(
      source,
      /!resumedLifecycleGavelAlreadyStruck[\s\S]{0,100}!lifecycleControlGavel/u,
    );
    assert.match(
      source,
      /setLiveGavelCue\(resumedLifecycleGavelAlreadyStruck \? null : gavelCue\)/u,
    );
    assert.match(source, /interruptPresentationForRecess\(replayEventId\)/u);
    assert.match(source, /debateInterruptedSpeechCaption/u);
    assert.match(source, /DEBATE_PAUSE_COOLDOWN_MS/u);
    assert.match(source, /pauseInFlightRef\.current/u);
    assert.doesNotMatch(source, /setPauseQueued\(true\)/u);
    assert.doesNotMatch(source, /pauseQueued/u);
    assert.match(source, /pauseInFlightRef\.current \|\|\s*pauseOnCooldown/u);
    assert.match(
      source,
      /data-action="pause"[\s\S]{0,280}disabled=\{\s*pauseInFlightRef\.current/u,
    );
    assert.doesNotMatch(source, /pauseOnGavelCooldown/u);
    assert.doesNotMatch(source, /\?\s*"Skip deliberation"\s*:\s*"End debate"/u);
    assert.doesNotMatch(source, /className=\{styles\.liveControls\}/u);
    assert.doesNotMatch(css, /\.proceedingControls/u);
    assert.match(css, /\.liveRailTabs/u);
    assert.match(css, /\.evidenceRail/u);
    assert.match(css, /\.evidenceRailCard/u);
    assert.match(css, /\.stagePauseButton/u);
    assert.match(css, /\.judgeGavelButton/u);
    assert.doesNotMatch(css, /\.judgeInterveneButton/u);
    assert.match(css, /\.judgeGavelButton kbd/u);
    assert.match(css, /@keyframes debate-judge-gavel-ready/u);
    assert.match(css, /\.playerWindow\[data-kind="judge-gavel"\]/u);
    assert.match(css, /\.floorStatus\[data-kind="judge_gavel"\]/u);
    assert.match(source, /Choose a Judge intervention/u);
    assert.match(source, /submitJudgeQuickChoice/u);
    assert.doesNotMatch(source, /choice\.action === "end"/u);
    assert.match(source, /endDebateEarly/u);
    assert.match(source, /Final authority/u);
    assert.match(source, /End this Debate\?/u);
    assert.match(source, /function debateJudgeGavelLockedForJury/u);
    assert.match(
      source,
      /const judgeGavelJuryLocked =\s*debateJudgeGavelLockedForJury\(activeSession\) \|\|[\s\S]{0,100}judgeGavelActiveTarget\?\.speakerKind === "juror"/u,
    );
    assert.match(
      source,
      /ceremonialAvailable:\s*!judgeGavelJuryLocked &&[\s\S]{0,120}objectionRuling\?\.status !== "awaiting_ruling" &&[\s\S]{0,80}judgeGavelCeremony\?\.status === "ready"/u,
    );
    assert.match(
      source,
      /debateJudgeGavelLockedForJury\(previous\)[\s\S]{0,100}previous\.judgeGavel\?\.status/u,
    );
    assert.match(
      source,
      /previous\.objectionRuling\?\.status === "awaiting_ruling"/u,
    );
    assert.match(
      source,
      /activeSession\.objectionRuling\?\.status !== "awaiting_ruling"/u,
    );
    assert.match(
      source,
      /const judgeGavelCeremonyReady =\s*!judgeJuryGavelLocked/u,
    );
    assert.match(
      source,
      /session\.status !== "paused" &&\s*!judgeJuryGavelLocked/u,
    );
    assert.match(source, /!judgeObjectionAwaitingRuling/u);
  });

  it("persists and replays audience order without cancelling the live floor", () => {
    const orderStart = source.indexOf(
      "const orderDebateAudience = async (): Promise<void> =>",
    );
    const semanticStart = source.indexOf(
      "const swingJudgeGavel = async",
      orderStart,
    );
    assert.ok(orderStart >= 0 && semanticStart > orderStart);
    const orderSource = source.slice(orderStart, semanticStart);
    assert.match(orderSource, /\/judge-gavel\/order`/u);
    assert.match(orderSource, /heardCharacterCount/u);
    assert.match(orderSource, /setActiveSession/u);
    assert.doesNotMatch(orderSource, /cancelCurrentPresentation/u);
    assert.doesNotMatch(orderSource, /onStopUtterance/u);
    assert.doesNotMatch(orderSource, /setPresenting\(false\)/u);
    assert.match(
      source,
      /activeSession\.status !== "live" \|\|[\s\S]{0,120}audienceOrderSaving \|\|[\s\S]{0,100}presenting/u,
    );
    assert.match(source, /const linkedAudienceOrderCues = new Map/u);
    assert.match(
      source,
      /event\.gavelHeardCharacterCount === undefined[\s\S]{0,240}linkedAudienceOrderCues\.set/u,
    );
    assert.match(
      source,
      /const performLinkedAudienceOrderCues =[\s\S]{0,420}visibleCharacterCount < \(cue\.gavelHeardCharacterCount/u,
    );
    assert.match(
      source,
      /revealEventSilently\(\s*event,\s*spokenText,\s*performLinkedAudienceOrderCues,\s*\)/u,
    );
    assert.match(source, /data-audience-order-response=/u);
    assert.match(source, /returningRoomTone:\s*true/u);
    assert.match(source, /DEBATE_AUDIENCE_ORDER_PEAK_HOLD_MS/u);
    assert.match(source, /holdThroughOrder:\s*holdAudienceOrderPressure/u);
    assert.match(
      source,
      /isGalleryOrderEvent &&[\s\S]{0,120}event\.kind === "moderator_ruling"/u,
    );
    assert.match(source, /debate-audience-laugh-into-order:/u);
    assert.match(
      source,
      /args\.kind === "hush"[\s\S]{0,2200}DEBATE_AUDIENCE_REACTIONS\.laugh\.url[\s\S]{0,1600}playDebateAudienceReaction\("order"/u,
    );
    assert.match(
      source,
      /audienceRoomToneReturnTimerRef[\s\S]{0,200}setAudiencePressureReset\(/u,
    );
  });

  it("holds the floor while Pause is saving a recess", () => {
    assert.match(
      source,
      /busy \|\|\s*presenting \|\|\s*pauseInFlightRef\.current \|\|\s*debateFloorMutationInFlightRef\.current/u,
    );
    assert.match(
      source,
      /if \(pauseInFlightRef\.current\) \{[\s\S]{0,280}return;[\s\S]{0,80}if \(mountedRef\.current\) setBusy\(false\)/u,
    );
    assert.match(
      source,
      /if \(!pauseInFlightRef\.current\) \{[\s\S]{0,80}debateFloorMutationInFlightRef\.current = false;[\s\S]{0,80}setBusy\(false\)/u,
    );
    assert.match(
      source,
      /pauseInFlightRef\.current \|\|[\s\S]{0,40}debateFloorMutationInFlightRef\.current[\s\S]{0,80}void advance\(false\)/u,
    );
    assert.match(
      source,
      /!pauseInFlightRef\.current &&[\s\S]{0,40}!debateFloorMutationInFlightRef\.current &&[\s\S]{0,40}!presentationSuspended/u,
    );
  });

  it("keeps a missed Judge gavel cue silent without inventing a Moderator shot", () => {
    assert.match(
      source,
      /gavelCue &&[\s\S]{0,120}next\.playerRole === "judge"[\s\S]{0,260}requestJudgeGavelCeremonyRef\.current\?\.\(gavelCue\)[\s\S]{0,100}gavelCue = null/u,
    );
    assert.match(source, /data-debate-judge-gavel-cue="true"/u);
    assert.match(source, /The room is waiting on you\./u);
    assert.doesNotMatch(source, /An awkward beat hangs\./u);
    assert.doesNotMatch(source, /No gavel falls\. The bots carry on anyway\./u);
    assert.doesNotMatch(source, /setJudgeGavelMissedCameraView/u);
    assert.doesNotMatch(source, /judgeGavelMissedCameraView/u);
    assert.match(
      source,
      /const recessSettledWide = session\.status === "paused" && !presenting/u,
    );
    assert.match(
      source,
      /\{judgeGavelCeremony && !judgeJuryGavelLocked \? \(\s*judgeGavelCeremony\.status === "ready" \? \(/u,
    );
    assert.match(
      source,
      /status: "missed"[\s\S]{0,700}finishJudgeGavelCeremony\(gate, false\)/u,
    );
    assert.match(
      source,
      /const strikeJudgeGavelCeremony =[\s\S]{0,420}triggerJudgeGavelSmash\(gate\.cue\.kind\)/u,
    );
    assert.match(
      source,
      /action === "cue"[\s\S]{0,100}strikeJudgeGavelCeremonyRef\.current\?\.\(\)[\s\S]{0,80}return/u,
    );
    assert.match(css, /\.stageStateOverlay\[data-kind="gavel-cue"\]/u);
    assert.match(css, /@keyframes debate-judge-gavel-cue-window/u);
  });

  it("does not let the case board reveal a claim before the room hears it", () => {
    assert.match(source, /function debateCaseBoardAtSequence/u);
    assert.match(source, /event\.sequence <= visibleThroughSequence/u);
    assert.match(source, /Scoreless · heard speech only/u);
    assert.match(
      source,
      /debateCaseBoardAtSequence\(\s*activeSession,\s*transcriptVisibleThroughSequence/u,
    );
  });

  it("does not promote a cut-off voice to the full canonical statement", () => {
    assert.match(
      source,
      /onEnd: \(\) => \{[\s\S]{0,260}playbackCompletionContent = debateVisibleContentAtSpeechTime\([\s\S]{0,420}visibleContent: playbackCompletionContent/u,
    );
    assert.match(
      source,
      /onCancel: \(\) => \{[\s\S]{0,180}playbackCancelled = true[\s\S]{0,220}speechTiming: null/u,
    );
    assert.match(source, /if \(playbackCancelled\) return;/u);
    assert.match(source, /if \(!played && playbackProgressSeen\)/u);
    assert.match(
      source,
      /presentationEventId === event\.id &&[\s\S]{0,180}liveReveal\.visibleContent\.length < event\.content\.length/u,
    );
    assert.doesNotMatch(
      source,
      /onEnd: \(\) => \{[\s\S]{0,260}visibleContent: event\.content/u,
    );
  });

  it("waits for actual Premium playback completion and a natural gap before automatic handoff", () => {
    const playbackStart = source.indexOf("let playbackEnded = false");
    const playbackEnd = source.indexOf(
      "includeInProceedings = true;",
      source.indexOf("if (played && playbackEnded)", playbackStart),
    );
    assert.ok(playbackStart >= 0 && playbackEnd > playbackStart);
    const playback = source.slice(playbackStart, playbackEnd);
    assert.match(source, /const DEBATE_AUTOMATIC_INTER_TURN_GAP_MS = 460/u);
    assert.match(source, /const DEBATE_AUTOMATIC_PRIMARY_RELEASE_MS = 320/u);
    assert.match(
      playback,
      /onEnd: \(\) => \{[\s\S]{0,120}playbackEnded = true/u,
    );
    assert.match(
      playback,
      /if \(played && playbackEnded\) \{[\s\S]{0,180}window\.setTimeout\(resolve, DEBATE_AUTOMATIC_INTER_TURN_GAP_MS\)/u,
    );
    assert.match(
      playback,
      /if \(playbackProgressSeen && !playbackEnded\) \{[\s\S]{0,180}onReleaseUtterance\(DEBATE_AUTOMATIC_PRIMARY_RELEASE_MS\)[\s\S]{0,420}DEBATE_AUTOMATIC_INTER_TURN_GAP_MS/u,
    );
    assert.match(
      source,
      /onReleaseUtterance\?\.\(DEBATE_INTERRUPT_PRIMARY_RELEASE_MS\)/u,
    );
  });

  it("lets Debate interruption preparation run under the outgoing speaker", () => {
    const overlapStart = source.indexOf(
      "const fireOverlap = (): Promise<void> =>",
    );
    const overlapEnd = source.indexOf(
      "const played = await onUtterance({",
      overlapStart,
    );
    assert.ok(overlapStart >= 0 && overlapEnd > overlapStart);
    const overlap = source.slice(overlapStart, overlapEnd);
    const incomingStart = overlap.indexOf(
      "onStart: (durationMs, alignment) =>",
    );
    const release = overlap.indexOf(
      "onReleaseUtterance?.(DEBATE_INTERRUPT_PRIMARY_RELEASE_MS)",
    );
    assert.ok(incomingStart >= 0 && release > incomingStart);

    const participantInterrupt = source.slice(
      source.indexOf("const interruptPresentationForParticipantFloorBreak ="),
      source.indexOf("const interruptPresentationForRecess ="),
    );
    const participantPreparation = source.slice(
      source.indexOf("const beginParticipantPreparationReveal ="),
      source.indexOf("const startParticipantFloorBreak ="),
    );
    assert.doesNotMatch(
      participantInterrupt,
      /onReleaseUtterance\?\.\(DEBATE_INTERRUPT_PRIMARY_RELEASE_MS\)/u,
    );
    assert.doesNotMatch(
      participantPreparation,
      /onReleaseUtterance\?\.\(DEBATE_INTERRUPT_PRIMARY_RELEASE_MS\)/u,
    );
  });

  it("uses the camera audience instead of the legacy generic glyph gallery", () => {
    assert.doesNotMatch(source, /7 of many · nonbinding/u);
    assert.doesNotMatch(source, /Nonbinding gallery sample/u);
    assert.match(source, /className=\{styles\.debateAudienceRow\}/u);
  });

  it("keeps the full audience look while stabilizing low-cost portrait effects", () => {
    assert.match(
      source,
      /const liveAudienceBots = useMemo\([\s\S]*debateAudienceBotsForSession\(\{/u,
    );
    assert.match(
      source,
      /count:\s*debateAudienceBotCount\(props\.graphicsQuality\)/u,
    );
    assert.match(
      source,
      /const liveAudienceCastKey = activeSession[\s\S]{0,220}activeSession\.moderator\.id[\s\S]{0,240}activeSession\.jury\.jurors\.map/u,
    );
    assert.match(
      source,
      /excludedBotIds:\s*liveAudienceCastKey\.split\("\\0"\)/u,
    );
    assert.match(
      source,
      /spectatorPrism:\s*debateSpectatorPrismAudienceSeat\(/u,
    );
    assert.match(
      source,
      /data-audience-source=\{\s*debateAudienceBotIsPlayerSpectator/u,
    );
    assert.match(source, /!debateAudienceBotIsPlayerSpectator\(audienceBot\)/u);
    assert.match(
      source,
      /memo\(function DebateAudiencePortrait[\s\S]*const galleryTalking = ambientTalking;[\s\S]*talking: false,[\s\S]*foleyMouthShape/u,
    );
    assert.match(source, /className=\{styles\.debateAudienceRow\}/u);
    assert.match(
      source,
      /data-audience-count=\{props\.audienceSeats\.length\}/u,
    );
    assert.match(source, /DebateLiveAudienceGallery/u);
    assert.match(
      source,
      /const audiencePressureBandTrue:[\s\S]{0,160}currentAudiencePressureBand/u,
    );
    assert.match(
      source,
      /debateAudienceVisualPressureBand\([\s\S]{0,80}audiencePressureBandTrue[\s\S]{0,40}debateMaterialQuality/u,
    );
    assert.match(
      source,
      /debateAudienceTalkerIndices\(\{[\s\S]{0,160}audienceBots\.length/u,
    );
    assert.match(
      source,
      /const audienceChattering =[\s\S]{0,140}audiencePressureBand !== "settled"/u,
    );
    assert.match(
      source,
      /data-audience-chattering=\{props\.audienceChattering \? "true" : "false"\}/u,
    );
    assert.doesNotMatch(
      source,
      /const audienceChattering =\s*props\.audioEnabled/u,
    );
    assert.match(source, /debateAudienceConversationFacing\(/u);
    assert.match(source, /debateAudienceSeatLayout\(/u);
    assert.match(source, /debateAudienceSeatIsTalker\(/u);
    assert.match(
      source,
      /\(\["rear", "front"\] as const\)\.map\(\(depthRow\)/u,
    );
    assert.match(source, /data-depth-row=\{depthRow\}/u);
    assert.match(source, /data-conversation-facing=\{conversationFacing\}/u);
    assert.match(source, /className=\{styles\.debateAudienceChatterChip\}/u);
    assert.match(source, /role:\s*"audience"/u);
    assert.match(
      source,
      /consumer:\s*"gallery"[\s\S]{0,100}presentation:\s*debateAvatarPresentation\(\{[\s\S]{0,100}consumer:\s*"gallery"/u,
    );
    assert.match(source, /foleyMouthShape/u);
    assert.doesNotMatch(
      source,
      /!juryChamberVisible \? \([\s\S]{0,180}debateAudienceRow/u,
    );
    assert.match(
      source,
      /!juryChamberVisible && !sealedCompleted \? \(\s*<DebateLiveAudienceGallery/u,
    );
    assert.match(source, /data-audience-placement="below-screen"/u);
    assert.match(
      source,
      /data-audience-pressure=\{props\.audiencePressureAttr \?\? undefined\}/u,
    );
    assert.match(source, /data-audience-order-response=/u);
    assert.match(
      css,
      /\.debateAudienceRow\s*\{[^}]*position:\s*relative[^}]*z-index:\s*1/u,
    );
    const audiencePortraitRule =
      css.match(/\.debateAudienceBotPortrait\s*\{[^}]*\}/u)?.[0] ?? "";
    assert.doesNotMatch(audiencePortraitRule, /filter:/u);
    assert.match(audiencePortraitRule, /opacity:\s*1/u);
    assert.doesNotMatch(audiencePortraitRule, /opacity:\s*0\.72/u);
    const audienceTalkingRule =
      css.match(
        /\.debateAudienceBotPortrait\[data-talking="true"\]\s*\{[^}]*\}/u,
      )?.[0] ?? "";
    assert.doesNotMatch(audienceTalkingRule, /^\s*opacity:\s*[\d.]+/mu);
    const audienceReactingRule =
      css.match(
        /\.debateAudienceBotPortrait\[data-live-reacting="true"\]\s*\{[^}]*\}/u,
      )?.[0] ?? "";
    assert.doesNotMatch(audienceReactingRule, /^\s*opacity:\s*[\d.]+/mu);
    assert.match(
      css,
      /\.debateAudienceRow\[data-audience-order-response="hush"\]\s*\.debateAudienceLayer\s*\{[^}]*transform:\s*translateY\(5%\)/u,
    );
    assert.match(
      css,
      /\.debateAudienceRow\[data-audience-order-response="hush"\]\s*\.debateAudienceBotPortrait\s*\{[^}]*--debate-audience-shade-opacity:\s*0\.58/u,
    );
    assert.match(
      css,
      /\.debateAudienceBotPortrait::before\s*\{[^}]*--debate-audience-shade-opacity/u,
    );
    assert.match(
      css,
      /\.debateAudienceBotPortrait\[data-conversation-facing="right"\]\s*\{[^}]*--debate-audience-facing-scale:\s*-1/u,
    );
    assert.match(
      css,
      /\.debateAudienceLayer\[data-depth-row="rear"\]\s*\{[^}]*opacity:\s*1/u,
    );
    assert.match(css, /\.debateAudienceChatterChip\s*\{/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-mouth-crosstalk/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-head-crosstalk/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-cascade-hush/u);
    assert.doesNotMatch(css, /@keyframes debate-audience-awkward-glance/u);
    assert.match(
      css,
      /@keyframes debate-gallery-seat-arrive[\s\S]*?100%\s*\{[\s\S]*?opacity:\s*1/u,
    );
    assert.match(
      css,
      /\.live\[data-debate-room-presence="arriving"\][\s\S]*?\.debateAudienceBotPortrait\[data-gallery-arrived="true"\]:not\(\s*\[data-audience-source="player"\]\s*\)[\s\S]*?animation: debate-gallery-seat-arrive[\s\S]*?both;/u,
    );
    assert.match(page, /debateAudienceBotIsGenerated\(botSnapshot\)/u);
    assert.match(
      page,
      /randomBotFaceStyle\(\s*debateAudienceRandom\(`face:\$\{botSnapshot\.id\}`\)/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-role="audience"\]/u,
    );
    assert.match(
      page,
      /const staticAudiencePortrait =\s*avatarState\.presentation === "mini"/u,
    );
    assert.match(page, /blinkEnabled=\{avatarState\.blinkEnabled === true\}/u);
    assert.match(page, /runtimeEffectsEnabled=\{!staticAudiencePortrait\}/u);
    assert.match(page, /motionActive=\{[\s\S]{0,120}!staticAudiencePortrait/u);
    assert.match(
      page,
      /avatarDetailsCoreColor=\{\s*staticAudiencePortrait \? "ink" : "phosphor"\s*\}/u,
    );
    assert.match(
      page,
      /const galleryAvatarDetails =[\s\S]{0,260}const galleryHasAvatarArt = avatarDetailsHasVisuals\(\s*galleryAvatarDetails,?\s*\);[\s\S]{0,1200}<MiniAvatarDetailsInk[\s\S]{0,260}details=\{galleryAvatarDetails\}[\s\S]{0,400}staticRaster=\{!authoredMiniPortrait\}/u,
    );
    assert.match(page, /avatarDetailsColor=\{debateAvatarDetailsColor\}/u);
    assert.match(
      page,
      /staticRaster=\{renderDetailLevel === "audience"\}[\s\S]{0,100}coreColor=\{avatarDetailsCoreColor\}/u,
    );
    assert.match(source, /Ambient chatter animates only the compact mouth/u);
    assert.match(source, /data-vocal-reaction=/u);
  });

  it("keeps public gallery spectators physically opaque when stable", () => {
    assert.match(css, /\.debateAudienceBotPortrait\s*\{[^}]*opacity:\s*1/u);
    const talkingRule =
      css.match(
        /\.debateAudienceBotPortrait\[data-talking="true"\]\s*\{[^}]*\}/u,
      )?.[0] ?? "";
    assert.doesNotMatch(talkingRule, /^\s*opacity:\s*[\d.]+/mu);
    const reactingRule =
      css.match(
        /\.debateAudienceBotPortrait\[data-live-reacting="true"\]\s*\{[^}]*\}/u,
      )?.[0] ?? "";
    assert.doesNotMatch(reactingRule, /^\s*opacity:\s*[\d.]+/mu);
    assert.match(
      css,
      /\.debateAudienceRow\[data-audience-order-response="hush"\]\s*\.debateAudienceLayer\s*\{[^}]*transform:/u,
    );
    assert.match(
      css,
      /\.debateAudienceRow\[data-audience-order-response="hush"\]\s*\.debateAudienceBotPortrait\s*\{[^}]*--debate-audience-shade-opacity/u,
    );
    assert.match(
      css,
      /@keyframes\s+debate-gallery-seat-arrive[\s\S]*100%[\s\S]*opacity:\s*1/u,
    );
    assert.match(
      css,
      /@keyframes\s+debate-gallery-seat-depart[\s\S]*100%[\s\S]*opacity:\s*0/u,
    );
  });

  it("uses a persistent four-seat Jury camera with a moderator final ballot", () => {
    assert.match(source, /session\.jury\.jurors\.map/u);
    assert.match(
      source,
      /renderJuryChamber\([\s\S]{0,180}session,[\s\S]{0,80}activeEvent,[\s\S]{0,80}juryThinkingBotId,[\s\S]{0,80}activeMuteReactionBeat/u,
    );
    assert.match(
      source,
      /src=\{`\/coffee-table\/table_\$\{props\.theme\}\.png`\}/u,
    );
    assert.match(source, /className=\{styles\.juryChamberBots\}/u);
    assert.match(source, /className=\{styles\.juryTableRaster\}/u);
    assert.match(source, /className=\{styles\.juryCenterTranscript\}/u);
    assert.match(source, /className=\{styles\.juryBallotPile\}/u);
    assert.match(source, /className=\{styles\.juryBallotSlip\}/u);
    assert.match(source, /className=\{styles\.juryVoteBoard\}/u);
    assert.match(source, /className=\{styles\.juryChamberIdentity\}/u);
    assert.match(source, /finalBallotsByJurorId/u);
    assert.match(source, /finalBallotRoundVisible/u);
    assert.match(source, /liveForVotes/u);
    assert.match(source, /liveAgainstVotes/u);
    assert.match(source, /moderator final ballot/u);
    assert.match(
      source,
      /## Ballots and verdict[\s\S]{0,1800}session\.jury\.moderatorBallot[\s\S]{0,500}Moderator final ballot/u,
    );
    assert.match(source, /key="jury-vote-progress:moderator"/u);
    assert.match(
      source,
      /activeEvent\.kind === "ballot" &&\s*activeEvent\.speakerKind === "juror"/u,
    );
    assert.match(
      source,
      /Voted \{debateSideLabel\(session, finalBallot\.sideId\)\}/u,
    );
    assert.match(
      source,
      /\$\{visibleFinalBallots\.length\} of \$\{debateJurySeatCount\(session\.jury\)\} juror ballots cast/u,
    );
    assert.match(
      source,
      /The juror’s final reason and vote are now on the record\./u,
    );
    assert.match(source, /return debateSpokenText\(content\)/u);
    assert.match(
      source,
      /function debateJuryCameraIsActive[\s\S]{0,400}cameraMode === "jury"/u,
    );
    assert.match(
      source,
      /const forumCameraView = galleryArriving\s*\?\s*"wide"/u,
    );
    const juryCameraStart = source.indexOf("function debateJuryCameraIsActive");
    const juryCameraEnd = source.indexOf(
      "function debateCameraModeForSession",
      juryCameraStart,
    );
    const juryCameraSource = source.slice(juryCameraStart, juryCameraEnd);
    assert.doesNotMatch(juryCameraSource, /playerRole/u);
    assert.match(
      source,
      /function debateJuryAutoChamberActive[\s\S]{0,220}debateJuryChamberStepActive/u,
    );
    assert.match(
      source,
      /function debateJuryCameraIsActive[\s\S]{0,760}debateJuryPresentationUsesChamber\(session, presentation\)[\s\S]{0,220}debateJuryPresentationKeepsForumCamera\(session, presentation\)[\s\S]{0,120}debateJuryAutoChamberActive\(session\)/u,
    );
    assert.match(source, /silentDeliberationPreparing/u);
    assert.match(source, /juryDeliberationInFlightSessionId/u);
    assert.match(
      source,
      /setJuryDeliberationInFlightSessionId\(previous\.id\)/u,
    );
    assert.match(source, /data-silent-deliberation/u);
    assert.match(
      source,
      /const cameraPresentationEvent =[\s\S]{0,1400}debateJuryCameraIsActive\(effectiveCameraMode, activeSession, \{[\s\S]{0,160}preparingSpeakerBotId: voicePreparationSpeakerBotId/u,
    );
    assert.match(
      source,
      /session\.jury\.phase === "waiting"[\s\S]{0,180}follows the public floor/u,
    );
    assert.match(
      source,
      /function debatePresentationEvents[\s\S]{0,420}debateJuryEventCanPresent\(next, event\)/u,
    );
    assert.match(
      source,
      /debateJuryEventCanPresent\(next, event\) &&\s*debateJuryEventIsPubliclyAudible\(event\)/u,
    );
    assert.match(
      source,
      /juryCameraActive: debateJuryCameraIsActive\([\s\S]{0,280}presenting: true,[\s\S]{0,120}event,/u,
    );
    assert.match(
      source,
      /event\.kind === "ballot" &&\s*event\.speakerKind !== "juror"[\s\S]{0,180}\?\.privateReason/u,
    );
    assert.doesNotMatch(
      source,
      /if \(event\.kind === "ballot" && event\.speakerKind === "juror"\) \{[\s\S]{0,180}continue;/u,
    );
    assert.match(
      source,
      /final Jury reasons[\s\S]{0,180}same caption, mouth, and voice path as deliberation/u,
    );
    assert.match(
      source,
      /No juror speech, reaction, voice, or individual ballot/u,
    );
    assert.match(source, /!participantJurySealed/u);
    assert.match(source, /After the verdict/u);
    assert.match(
      source,
      /session\.status === "completed" &&[\s\S]{0,80}!presenting[\s\S]{0,80}!juryChamberVisible/u,
    );
    assert.match(
      source,
      /sealedCompleted[\s\S]{0,280}liveRailPanel === "verdict"/u,
    );
    assert.match(source, /data-tutorial-target="debate-verdict-tab"/u);
    assert.match(
      source,
      /session\.status === "waiting_for_player" &&[\s\S]{0,180}!participantProducerWindowActive &&[\s\S]{0,80}judgeGuidedStep === null/u,
    );
    assert.match(source, /step === "jury_closing_moderator"/u);
    assert.match(
      page,
      /frozenVoiceProfile:\s*usePlayerVoice\s*\?\s*null\s*:\s*\(utterance\.speaker\?\.voiceProfile \?\? null\)/u,
    );
    assert.match(
      page,
      /frozenVoiceProfile \?\?[\s\S]{0,100}settings\.prismDefaultBotAudioVoiceProfile/u,
    );
    assert.match(css, /\.juryChamberBots\s*\{[^}]*z-index:\s*2/u);
    // The tabletop tucks under the lower seat pair so it occludes their
    // frames — a table the jurors sit at, not a disc floating beneath them.
    assert.match(
      css,
      /\.juryTableRaster\s*\{[^}]*bottom:\s*-6%[^}]*z-index:\s*3[^}]*width:\s*min\(72%,\s*880px\)/u,
    );
    assert.match(css, /\.juryBallotPile\s*\{[^}]*top:\s*88%[^}]*z-index:\s*5/u);
    assert.match(css, /@keyframes jury-ballot-cast/u);
    assert.match(css, /@keyframes jury-vote-reveal/u);
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="0"\]\s*\{[^}]*left:\s*27%[^}]*top:\s*53%[^}]*width:\s*clamp\(204px,\s*18\.9vw,\s*294px\)/u,
    );
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="1"\]\s*\{[^}]*left:\s*73%[^}]*top:\s*53%[^}]*width:\s*clamp\(204px,\s*18\.9vw,\s*294px\)/u,
    );
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="2"\]\s*\{[^}]*left:\s*38%[^}]*top:\s*69%[^}]*width:\s*clamp\(204px,\s*18\.9vw,\s*294px\)/u,
    );
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="3"\]\s*\{[^}]*left:\s*62%[^}]*top:\s*69%[^}]*width:\s*clamp\(204px,\s*18\.9vw,\s*294px\)/u,
    );
    assert.doesNotMatch(css, /\.juryChamberSeat\[data-seat="5"\]/u);
    assert.match(
      css,
      /\.juryBallotSlip\[data-seat="0"\]\s*\{[^}]*--jury-ballot-start-y:\s*-26vh/u,
    );
    assert.match(
      css,
      /\.juryBallotSlip\[data-seat="4"\]\s*\{[^}]*--jury-ballot-start-x:\s*33vw[^}]*--jury-ballot-start-y:\s*-14vh/u,
    );
    assert.match(
      css,
      /\.juryCenterTranscript\s*\{[^}]*top:\s*74%[^}]*z-index:\s*5/u,
    );
    assert.match(
      css,
      /\.live\[data-jury-chamber="true"\]\s+\.forum\s*\{[^}]*flex:\s*1\s+1\s+auto[^}]*aspect-ratio:\s*auto/u,
    );
    assert.match(
      css,
      /\.juryVoteBoard\s*\{[^}]*z-index:\s*7[^}]*width:\s*min\(58%,\s*620px\)/u,
    );
    assert.match(
      css,
      /\.juryChamber\[data-theme="light"\]\s+\.juryVoteBoard\s*\{[^}]*background:\s*rgba\(255,\s*253,\s*249,\s*0\.84\)/u,
    );
    assert.doesNotMatch(css, /height:\s*calc\(100dvh - 58px\)/u);
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL("../../public/coffee-table/table_light.png", import.meta.url),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL("../../public/coffee-table/table_dark.png", import.meta.url),
        ),
      ),
      true,
    );
  });

  it("keeps the Participant's four-person Jury anonymous", () => {
    assert.equal(DEBATE_JURY_SIZE, 4);
    assert.match(
      source,
      /participantView\s*\? Array\.from\([\s\S]{0,80}length: debateJurySeatCount\(session\.jury\)/u,
    );
    assert.match(source, /data-anonymous="true"/u);
    assert.match(source, /Anonymous Jury seat \$\{index \+ 1\}/u);
    assert.match(
      source,
      /finalBallotRoundVisible && session\.playerRole !== "participant"/u,
    );
    assert.match(
      source,
      /session\.playerRole === "participant"[\s\S]{0,120}Array\.from\([\s\S]{0,80}debateJurySeatCount\(session\.jury\)/u,
    );
    assert.match(source, /data-participant-sealed=/u);
    assert.match(source, /key=\{`sealed-jury-chamber:\$\{index\}`\}/u);
    assert.match(source, /className=\{styles\.participantSealedJuryAvatar\}/u);
    assert.match(source, /<small>Sealed seat \{index \+ 1\}<\/small>/u);
    assert.match(source, /\? "Ballots sealed"/u);
    assert.match(css, /\.juryChamberAvatar > \.participantSealedJuryAvatar/u);
    assert.match(css, /\.participantSealedJuryAvatar > svg/u);
    assert.match(
      css,
      /\.juryRoster\[data-jury-cadence="natural-five"\] \.juryRosterSeats\s*\{[^}]*repeat\(5/u,
    );
    assert.match(
      css,
      /\.juryChamber\[data-jury-cadence="natural-five"\][\s\S]{0,100}\.juryChamberSeat\[data-seat="0"\][\s\S]{0,100}left:\s*50%/u,
    );
    assert.match(
      css,
      /\.juryChamber\[data-jury-cadence="natural-five"\][\s\S]{0,100}\.juryChamberSeat\[data-seat="1"\][\s\S]{0,100}left:\s*27%[^}]*top:\s*53%/u,
    );
    assert.match(
      css,
      /\.juryChamber\[data-jury-cadence="natural-five"\][\s\S]{0,100}\.juryChamberSeat\[data-seat="2"\][\s\S]{0,100}left:\s*73%[^}]*top:\s*53%/u,
    );
    assert.match(
      css,
      /\.juryChamber\[data-jury-cadence="natural-five"\][\s\S]{0,100}\.juryChamberSeat\[data-seat="3"\][\s\S]{0,100}left:\s*13%[^}]*top:\s*65%/u,
    );
    assert.match(
      css,
      /\.juryChamberSeat\[data-seat="4"\]\s*\{[^}]*left:\s*87%[^}]*top:\s*65%/u,
    );
    assert.doesNotMatch(source, /Array\.from\(\{ length: 7 \}/u);
    assert.match(
      css,
      /\.juryRosterSeats\s*\{[^}]*grid-template-columns:\s*repeat\(4,/u,
    );
    assert.match(css, /\.juryRosterSeats > span\[data-anonymous="true"\]/u);
  });

  it("queues the latest juror thought and keeps Jury comments out of Proceedings", () => {
    assert.match(source, /debateLatestPendingJuryComment/u);
    assert.match(source, /className=\{styles\.juryThoughtChip\}/u);
    assert.match(
      source,
      /pendingJuryComment\?\.content[\s\S]{0,500}styles\.juryThoughtPreview/u,
    );
    assert.match(source, /debateResolvedEvidenceText\(/u);
    assert.match(
      source,
      /debateResolvedEvidenceText\(\s*pendingJuryComment\.content,\s*session\.evidence/u,
    );
    assert.match(source, /debateJuryRosterFooterCopy\(/u);
    assert.match(
      presentation,
      /hover an ellipsis to read a thought\. PRISM enters the chamber automatically/u,
    );
    assert.doesNotMatch(
      source,
      /markJuryCommentPlayed\(pendingJuryComment\.id\)[\s\S]{0,700}consumeNewEvents\(beforeComment, throughComment, runId\)/u,
    );
    assert.match(source, /debateJuryEventIsPubliclyAudible\(event\)/u);
    assert.match(
      source,
      /!debateEventIsJuryComment\(event\)[\s\S]{0,180}transcriptVisibleThroughSequence/u,
    );
    assert.match(source, /data-tutorial-target="debate-jury-record"/u);
    assert.match(source, /Timestamped · separate from proceedings/u);
    assert.match(source, /Copy Jury transcript/u);
    assert.match(source, /debateArchivedJuryRecordIsCopyable\(\{/u);
    assert.doesNotMatch(source, /copyArchivedJuryRecord/u);
    assert.doesNotMatch(source, /Copy Jury transcript for/u);
    assert.match(
      source,
      /transcriptHeaderActions[\s\S]{0,900}debate-copy-all-review-data[\s\S]{0,900}debate-copy-jury-transcript[\s\S]{0,500}debate-copy-transcript/u,
    );
    assert.match(source, /liveRailPanel === "proceedings"/u);
    assert.match(
      source,
      /juryRecordReady[\s\S]{0,400}renderJuryRecord\(session\)[\s\S]{0,120}renderCompletedJuryStatus/u,
    );
    assert.match(
      source,
      /sealedCompleted\s*\?\s*renderSealedNoJurySlot\(session\)/u,
    );
    assert.match(source, /renderSealedNoJurySlot/u);
    assert.match(
      source,
      /This Debate closed without a Jury\. The Verdict tab holds the majority record\./u,
    );
    assert.match(source, /juryWasSeated/u);
    assert.match(
      source,
      /stageSupport[\s\S]{0,500}renderJuryRecord\(session\)/u,
    );
    assert.match(source, /juryRecordReady/u);
    assert.match(
      source,
      /const juryRecordReady =[\s\S]{0,220}sealedCompleted \|\| juryCameraActive/u,
    );
    assert.match(source, /Keep the live Jury widget through the public floor/u);
    assert.doesNotMatch(
      source,
      /juryRecordReady[\s\S]{0,220}debateJuryOutcomeRevealed\(session, transcriptVisibleThroughSequence\)/u,
    );
    assert.doesNotMatch(
      source,
      /sealedCompleted\s*\?\s*renderEmptyJurySlot\(\)/u,
    );
    assert.doesNotMatch(
      source,
      /\{renderTranscript\(session\)\}[\s\S]{0,800}\{renderJuryRecord\(session\)\}/u,
    );
    assert.doesNotMatch(css, /\.archiveJuryCopyButton/u);
    assert.match(css, /\.juryThoughtChip/u);
    assert.match(css, /\.juryThoughtPreview/u);
    assert.match(css, /\.juryThoughtChip:hover \.juryThoughtPreview/u);
    assert.match(
      css,
      /\.juryThoughtPreview\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*calc\(100% \+ 8px\)/u,
    );
    assert.match(
      css,
      /\.stageSupport:has\(\.juryThoughtChip:hover\)[\s\S]{0,180}overflow:\s*visible/u,
    );
    assert.match(css, /\.audienceGallery\.juryRoster/u);
    assert.match(css, /\.juryRecord/u);
    assert.match(css, /\.transcriptHeaderActions/u);
    assert.match(css, /\.stageSupport \.juryRecord/u);
    assert.doesNotMatch(
      css,
      /\.debateRail\[data-completed="true"\] \.juryRecord/u,
    );
  });

  it("gives the light proceedings rail, verdict, and evidence drawer readable surfaces", () => {
    assert.match(
      css,
      /\.live\[data-theme="light"\]\s*\{[^}]*--debate-live-ink:\s*#2a2530[^}]*--debate-live-muted:\s*#625a69/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.transcriptHeader button\s*\{[^}]*border:[^}]*color:\s*#514758[^}]*background:\s*rgba\(255, 255, 255, 0\.84\)/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.debateSynopsis\s*\{[^}]*border-left:[^}]*color:\s*#4c4253[^}]*background:/u,
    );
    assert.match(
      css,
      /\.dashboard\[data-theme="light"\] \.sourceDrawer,[\s\S]{0,80}\.live\[data-theme="light"\] \.sourceDrawer\s*\{[^}]*color:\s*#2a2430[^}]*background:/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.cameraControls\s*\{[^}]*border-color:\s*rgba\(56,\s*46,\s*64,\s*0\.2\)[^}]*background:\s*rgba\(250,\s*248,\s*245,\s*0\.92\)/u,
    );
    assert.match(css, /\.stageTransportControls \.stagePauseButton:disabled/u);
    assert.match(css, /\.liveRailTabs button\[data-selected="true"\]/u);
  });

  it("keeps the evidence drawer close control above app chrome", () => {
    assert.match(source, /data-debate-evidence-drawer-backdrop="true"/u);
    assert.match(
      source,
      /aria-label=\{\s*item\.kind === "source" \? "Close source" : "Close exhibit"\s*\}/u,
    );
    assert.match(source, /className=\{styles\.sourceDrawerClose\}/u);
    assert.match(css, /\.sourceDrawerBackdrop\s*\{[^}]*z-index:\s*960/u);
    assert.match(css, /\.sourceDrawer\s*\{[^}]*z-index:\s*961/u);
    assert.match(source, /beginEditingExhibit\(exhibit\)/u);
    assert.match(source, /current === source\.id \? null : source\.id/u);
  });

  it("offers Coffee-style synopsis and ephemeral pick-a-bot debrief after verdict", () => {
    assert.match(
      source,
      /\/api\/debates\/\$\{encodeURIComponent\(sessionId\)\}\/synopsis/u,
    );
    assert.match(source, /Preparing summary…/u);
    assert.match(source, /data-tutorial-target="debate-session-synopsis"/u);
    assert.match(
      source,
      /\/api\/debates\/\$\{encodeURIComponent\(sessionId\)\}\/debrief-chat/u,
    );
    assert.match(source, /debateDebriefEligibleBots\(session\)/u);
    assert.match(source, /Ask the sealed chamber/u);
    assert.match(source, /DEBATE_DEBRIEF_STARTER_PROMPTS/u);
    assert.match(source, /debriefThreads/u);
    assert.match(source, /data-tutorial-target="debate-debrief-chat"/u);
    assert.match(source, /debateVoiceCompletionFallbackDurationMs/u);
    assert.match(source, /debateUtterancePaceBoost/u);
    assert.match(css, /\.debriefChat/u);
    assert.match(css, /\.debriefStarters/u);
    assert.match(css, /\.debateSynopsis/u);
  });

  it("crops the live Forum and Jury chamber to the same cinematic viewport", () => {
    assert.match(
      css,
      /\.forum\s*\{[^}]*width:\s*100%[^}]*min-height:\s*0[^}]*aspect-ratio:\s*2\s*\/\s*1/u,
    );
    assert.match(
      source,
      /className=\{styles\.forum\}\s+data-debate-stage-viewport="live"/u,
    );
  });

  it("uses authored receivers and raster-aligned alpha light masks", () => {
    assert.match(css, /forum-dark\.webp/u);
    assert.match(css, /forum-light\.webp/u);
    assert.match(css, /forum-dark-foreground\.png/u);
    assert.match(css, /forum-light-foreground\.png/u);
    assert.match(css, /\.botPosition\s*\{[^}]*z-index:\s*3/u);
    assert.match(css, /\.podiumForeground\s*\{[^}]*z-index:\s*4/u);
    assert.match(
      css,
      /\.lightMaskFor,[\s\S]*?\.lightMaskModerator\s*\{[^}]*inset:\s*0[^}]*z-index:\s*2/u,
    );
    assert.match(
      css,
      /\.lightMaskForeground\s*\{[^}]*z-index:\s*5[^}]*forum-light-mask-foreground\.png/u,
    );
    assert.match(
      css,
      /-webkit-mask-image:\s*url\("\/debate\/forum-light-mask\.png"\)/u,
    );
    assert.match(
      css,
      /mask-image:\s*url\("\/debate\/forum-light-mask\.png"\)/u,
    );
    assert.match(css, /mask-size:\s*cover/u);
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]*?:is\(\.lightMaskFor,\s*\.lightMaskAgainst\)\s*\{[^}]*opacity:\s*0/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.lightMaskModerator\s*\{[^}]*background:\s*var\(--debate-moderator-color\)[^}]*moderator-light-mask\.png/u,
    );
    assert.match(source, /className=\{styles\.podiumForeground\}/u);
    assert.match(
      source,
      /<DebateForumLightMasks[\s\S]{0,220}depth="backdrop"/u,
    );
    assert.match(
      source,
      /<DebateForumLightMasks[\s\S]{0,220}depth="foreground"/u,
    );
    assert.match(
      forumAccentKeysSource,
      /className=\{`\$\{styles\.lightMaskFor\}\$\{foregroundFallbackClass\}`\}/u,
    );
    assert.match(
      source,
      /className=\{styles\.podiumForeground\}[\s\S]{0,500}<DebateForumLightMasks[\s\S]{0,180}depth="foreground"/u,
    );
    assert.match(source, /<DebateForumAccentKeys/u);
    assert.match(forumAccentKeysSource, /data-source=\{source\}/u);
    assert.match(forumAccentKeysSource, /renderDebateForumAccentPixels/u);
    assert.match(source, /data-active-role=\{activeRole \?\? undefined\}/u);
    assert.doesNotMatch(source, /<DebateForumScene/u);
    assert.doesNotMatch(css, /\.lightMaskFor\s*\{[^}]*clip-path:\s*polygon/u);
    assert.doesNotMatch(
      css,
      /\.lightMaskAgainst\s*\{[^}]*clip-path:\s*polygon/u,
    );
    assert.doesNotMatch(
      css,
      /\.lightMaskModerator\s*\{[^}]*clip-path:\s*polygon/u,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL("../../public/debate/forum-light-mask.png", import.meta.url),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/moderator-light-mask.png",
            import.meta.url,
          ),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/forum-light-mask-foreground.png",
            import.meta.url,
          ),
        ),
      ),
      true,
    );
    assert.equal(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/moderator-light-mask-foreground.png",
            import.meta.url,
          ),
        ),
      ),
      true,
    );
    assert.match(
      css,
      /mix-blend-mode:\s*var\(--debate-light-blend-mode-dark,\s*hard-light\)/u,
    );
    assert.match(
      css,
      /mix-blend-mode:\s*var\(--debate-light-blend-mode-light,\s*color\)/u,
    );
    assert.match(forumSceneSource, /blendMode:\s*"hard-light"/u);
    assert.match(css, /prefers-reduced-motion/u);
  });

  it("renders the actual animated bot bodies with a glyph-only fallback", () => {
    assert.match(source, /props\.renderBotAvatar\(appearanceBot/u);
    assert.match(source, /className=\{styles\.botStagePresence\}/u);
    assert.match(source, /className=\{styles\.botGlyphFallback\}/u);
    assert.match(
      page,
      /renderBotGlyph=\{\(glyph, options\) => \([\s\S]{0,180}size=\{options\.size\}[\s\S]{0,120}strokeWidth=\{options\.strokeWidth\}/u,
    );
    assert.match(page, /renderBotAvatar=\{\(botSnapshot, avatarState\) => \{/u);
    assert.match(page, /<ZenLiveBotMannequin/u);
    assert.match(
      page,
      /avatarState\.role === "against"\s*\? zenLiveBotFaceScaleYForCanvasSide\("right"\)[\s\S]{0,180}avatarState\.role === "for"\s*\? zenLiveBotFaceScaleYForCanvasSide\("left"\)/u,
    );
    assert.match(
      page,
      /<ZenLiveBotMannequin[\s\S]{0,180}faceStyle=\{faceStyle\}[\s\S]{0,80}faceScaleY=\{faceScaleY\}/u,
      "the right-side debater must carry its inward-facing orientation into the shared face-and-ink rig",
    );
    assert.match(page, /showThinkingSpinner=\{avatarState\.thinking\}/u);
    assert.match(page, /isTalking=\{debateMouthActive\}/u);
    assert.match(
      page,
      /avatarDetails=\{\s*playerJudgePrism\s*\?\s*null\s*:\s*botSnapshot\.avatarDetails\s*\}/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\s*\{[^}]*(?:--zen-live-bot-face-y|--zen-live-bot-face-scale):/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate[^{}]*\.coffeeSeatPlateEmoji[^{}]*\{[^}]*--zen-live-bot-eye-local-x:/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\s*\{[^}]*--coffee-bot-color:\s*var\(--bot-color,\s*var\(--accent\)\)/u,
    );
  });

  it("uses the authored mini form for compact moderators and keeps turn-owned podium screens", () => {
    assert.match(source, /debateTurnOwnerBotId\(\{/u);
    assert.match(
      source,
      /thinkingBotId,\s*presenting,\s*presentationSpeakerBotId:\s*activeSpeakerId/u,
    );
    assert.match(
      source,
      /const avatarPresentation = debateAvatarPresentation\(\{[\s\S]{0,120}consumer:\s*"forum"[\s\S]{0,80}role,[\s\S]{0,80}cameraView/u,
    );
    assert.match(source, /cameraView:\s*stageAlignmentPreviewCamera/u);
    assert.match(source, /className=\{styles\.podiumGlyphPosition\}/u);
    assert.match(source, /className=\{styles\.podiumGlyphScreen\}/u);
    assert.match(
      source,
      /data-turn-active=\{\s*turnOwnerBotId === bot\.id \? "true" : undefined/u,
    );
    assert.match(source, /lookAtRole:/u);
    assert.match(source, /debateModeratorLookAtRole\(\{/u);
    assert.match(page, /const moderatorLookAtRole =/u);
    assert.match(
      page,
      /moderatorLookAtRole === "for"[\s\S]*moderatorLookAtRole === "against"/u,
    );
    assert.match(
      page,
      /data-debate-compact=\{\s*avatarState\.presentation === "mini" \? "true" : undefined/u,
    );
    assert.match(
      page,
      /const staticAudiencePortrait =\s*avatarState\.presentation === "mini";[\s\S]{0,260}const authoredMiniPortrait =\s*staticAudiencePortrait &&[\s\S]{0,160}avatarState\.blinkEnabled === true\);/u,
    );
    assert.match(
      page,
      /const debateAvatarDetailLevel = staticAudiencePortrait/u,
    );
    assert.match(page, /detailLevel=\{debateAvatarDetailLevel\}/u);
    assert.match(
      source,
      /data-debate-stage-compact=\{\s*avatarPresentation === "mini"\s*\? "true"/u,
    );
    assert.match(
      source,
      /data-debate-stage-compact=\{\s*avatarPresentation === "mini"\s*\? "true"/u,
    );
    assert.match(
      page,
      /data-avatar-face-coordinate-source="studio"[\s\S]*?<CoffeeSeatPlateEmoji[\s\S]{0,180}\bpixelated\b/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s*\{[^}]*(?:--zen-live-bot-avatar-body-size|--zen-live-bot-face-y|--zen-live-bot-face-scale)/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s+\.zenLiveBotPresenceBody\[data-avatar-details-visuals="true"\]\s*\{/u,
    );
    assert.match(
      css,
      /\.botStagePresence\[data-debate-stage-compact="true"\]\s*\{[^}]*position:\s*relative[^}]*aspect-ratio:\s*1/u,
    );
    assert.match(
      page,
      /className=\{[\s\S]{0,120}moderatorMiniPortrait[\s\S]{0,120}\? styles\.debateModeratorMiniAvatar/u,
    );
    assert.match(
      pageCss,
      /\.debateModeratorMiniAvatar\[data-size="room"\]\s*\{[^}]*width:\s*100%[^}]*height:\s*100%/u,
    );
    assert.doesNotMatch(
      pageCss,
      /:global\(\[data-debate-stage-compact="true"\]\)\s*>\s*\.debateBotPresencePlate\[data-debate-compact="true"\][\s\S]{0,300}scale\(/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s*\{[^}]*--bot-ambient-hover-amplitude:\s*0\.5px/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate \.botFaceFrameLed\s*\{[^}]*background-color:\s*var\(--bot-face-frame-led-unlit-color,\s*#3a3f46\)[^}]*opacity:\s*1/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-talking="true"\] \.botFaceFrameLed\s*\{[^}]*background-color:\s*var\(--coffee-bot-color\)[^}]*drop-shadow/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate:not\(\[data-talking="true"\]\)\s*\{[^}]*--zen-live-bot-face-phosphor-ink:\s*color-mix\([\s\S]{0,140}var\(--zen-live-bot-face-ink, var\(--coffee-bot-color, #ffffff\)\) 82%/u,
    );
    assert.match(page, /\.\.\.botFrameMetalAlloyStyle\(/u);
    assert.match(
      page,
      /\.\.\.\(playerJudgePrism\s*\? prismDefaultAccentStyle\(resolvedTheme\)\s*:\s*botAccentStyle\(botSnapshot\.color, resolvedTheme\)\)/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s+\.botFaceFrame[\s\S]*?display:\s*none/u,
    );
    assert.match(css, /\.podiumGlyphPosition\s*\{[^}]*z-index:\s*5/u);
    assert.match(css, /\.podiumGlyphPosition\s*\{[^}]*opacity:\s*1/u);
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="for"\]\s*\{[^}]*left:\s*calc\(16\.5% \+ var\(--debate-for-glyph-offset-x,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="against"\]\s*\{[^}]*left:\s*calc\(83\.5% \+ var\(--debate-against-glyph-offset-x,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphScreen\s*\{[^}]*background:[\s\S]*?linear-gradient\(145deg,\s*#17191f/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="for"\]\s+\.podiumGlyphScreen\s*\{[^}]*rotateY\(18deg\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="against"\]\s+\.podiumGlyphScreen\s*\{[^}]*rotateY\(-18deg\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-role="moderator"\]\s+\.podiumGlyphScreen\s*\{[^}]*scale\(0\.5\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]*?\.podiumGlyphPosition\[data-role="moderator"\][\s\S]*?\.podiumGlyphScreen\s*\{[^}]*scale\(1\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-turn-active="true"\]\s*\{[^}]*drop-shadow\(\s*0 0 18px color-mix\(in srgb, currentColor 38%, transparent\)\s*\)/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-turn-active="true"\]\s+\.podiumGlyphScreen\s*\{[^}]*radial-gradient\([\s\S]*?currentColor 58%/u,
    );
    assert.match(
      css,
      /\.podiumGlyphPosition\[data-turn-active="true"\]\s+\.podiumGlyphMark\s*\{[^}]*filter:\s*none/u,
    );
  });

  it("keeps ambience while pressure-mixing the audience in every player role", () => {
    assert.match(source, /<SessionAtmosphereLayer/u);
    assert.match(
      source,
      /lifecycleTransitionMs=\{DEBATE_AUDIENCE_LAYER_CROSSFADE_MS\}/u,
    );
    assert.match(source, /backgroundUrl=\{liveGalleryBackgroundUrl\}/u);
    assert.match(
      source,
      /grainUrl=\{\s*liveGalleryUsesCrosstalk \? DEBATE_AUDIENCE_CROSSTALK_URL : null\s*\}/u,
    );
    assert.match(source, /debateAudienceBackgroundUrlForPressureBand/u);
    assert.match(source, /DEBATE_AUDIENCE_ROOM_BASELINE_URL/u);
    assert.match(
      source,
      /const DEBATE_AUDIENCE_IDLE_MIX = \{[\s\S]{0,100}background:\s*0\.42/u,
    );
    assert.match(
      source,
      /const DEBATE_AUDIENCE_DUCKED_MIX = \{[\s\S]{0,100}background:\s*0\.24/u,
    );
    assert.match(
      source,
      /audiencePressureBandTrue === null[\s\S]{0,80}activeAudienceOrderResponse === null[\s\S]{0,40}\? 320[\s\S]{0,220}DEBATE_AUDIENCE_ORDER_RETURN_MS[\s\S]{0,100}DEBATE_AUDIENCE_ORDER_SWELL_MS[\s\S]{0,100}debateAudiencePressureMixTransitionMs/u,
    );
    assert.match(source, /debateAudienceOrderStragglerMix/u);
    assert.match(
      source,
      /galleryMixBranch === "order-stragglers" \|\|\s*galleryMixBranch === "pressure-score"/u,
    );
    assert.match(source, /debateAudienceOrderCallMix\(session\.formality\)/u);
    assert.match(
      source,
      /debateAudiencePressureMixForScore\(\s*currentAudiencePressureScore,\s*session\.formality,/u,
    );
    assert.doesNotMatch(
      source,
      /activeAudienceOrderResponse &&[\s\S]{0,120}!activeAudienceOrderResponse\.returningRoomTone[\s\S]{0,80}\? DEBATE_FOLEY_MIX/u,
    );
    assert.match(source, /DEBATE_AUDIENCE_AGITATION_URL/u);
    assert.doesNotMatch(source, /debateAudienceEventIsShocking/u);
    assert.doesNotMatch(source, /gaspCooldownClear/u);
    assert.doesNotMatch(source, /debate-audience-gasp:/u);
    assert.doesNotMatch(
      source,
      /const audiencePressureActive =\s*session\.playerRole === "judge"/u,
    );
    assert.match(source, /ambientFoleyUrls=\{DEBATE_AUDIENCE_FOLEY_URLS\}/u);
    assert.doesNotMatch(source, /backgroundRoomAcoustics=\{/u);
    assert.match(source, /DEBATE_AMBIENT_FOLEY_PROFILE/u);
    assert.match(source, /DEBATE_JURY_AMBIENT_FOLEY_PROFILE/u);
    assert.match(source, /DEBATE_JURY_CHAMBER_MIX/u);
    assert.match(
      source,
      /const DEBATE_JURY_CHAMBER_MIX = \{[\s\S]{0,80}grain:\s*0\.1/u,
    );
    assert.match(source, /galleryMixBranch === "jury"/u);
    assert.match(source, /DEBATE_JURY_CHAMBER_REACTION_TRIM/u);
    assert.match(source, /DEBATE_VOCAL_FOLEY_PROFILE/u);
    assert.match(source, /minDelayMs: 14_000/u);
    assert.match(source, /maxDelayMs: 32_000/u);
    assert.match(source, /minDelayMs: 22_000/u);
    assert.match(source, /maxDelayMs: 46_000/u);
    assert.match(
      source,
      /ambientFoleyProfile=\{[\s\S]{0,120}juryChamberVisible[\s\S]{0,120}DEBATE_JURY_AMBIENT_FOLEY_PROFILE[\s\S]{0,100}DEBATE_AMBIENT_FOLEY_PROFILE/u,
    );
    assert.match(
      source,
      /backgroundTone=\{juryChamberVisible \? "warm-low" : "neutral"\}/u,
    );
    assert.match(
      source,
      /deferFoley=\{debateIdentPlaying !== null \|\| \(busy && !presenting\)\}/u,
    );
    assert.match(source, /ambientBotVocalizations/u);
    assert.match(source, /debateVocalFoleyTargetId\(\{/u);
    assert.match(
      source,
      /const visibleFoleyParticipants = juryChamberVisible/u,
    );
    assert.match(source, /active: juror\.id === activeSpeakerId/u);
    assert.match(source, /hardMuted:/u);
    assert.match(source, /data-vocal-foley/u);
    assert.match(page, /avatarState\.foleyMouthShape \?\? "closed"/u);
    assert.match(
      page,
      /botAvatarSfxForVoiceBus\([\s\S]{0,220}botSnapshot\.voiceProfile[\s\S]{0,500}settings\.voiceVolume/u,
    );
    assert.match(page, /DEBATE_FORUM_VOICE_ROOM_SEND/u);
    assert.match(page, /playbackSurface === "debate"/u);
    assert.match(
      page,
      /"debate",\s*utterance\.format,\s*debateResponseMode === "local",\s*utterance\.voiceChannel \?\? "primary",\s*\);/u,
    );
    assert.match(source, /const playDebateAudienceReaction = useCallback/u);
    assert.match(source, /DEBATE_AUDIENCE_REACTIONS\[reactionKind\]/u);
    assert.match(
      source,
      /playFoley\(\s*reaction\.url,[\s\S]{0,800}debate-audience-reaction:/u,
    );
  });

  it("lets the public gallery react live without stalling the floor", () => {
    assert.match(source, /debateAudienceBeatForEvent\(\{/u);
    assert.match(source, /debateDirectedAudiencePlayback\(/u);
    assert.match(source, /directedAudienceReaction\.intensity/u);
    assert.match(
      source,
      /intensity === 1 \? 0\.5 : intensity === 2 \? 0\.76 : 1/u,
    );
    assert.match(
      source,
      /publicContent,\s*seatCount:\s*props\.audienceSeats\.length/u,
    );
    assert.match(
      source,
      /data-live-reacting=\{listenerReaction \? "true" : undefined\}/u,
    );
    assert.match(
      source,
      /data-audience-bounce=\{\s*listenerReaction && allowTransformBounce \? "true" : undefined\s*\}/u,
    );
    assert.match(source, /data-audience-beat=\{/u);
    assert.match(source, /data-listening-reaction=\{/u);
    assert.match(source, /listenerReaction=\{audienceListenerReaction\}/u);
    assert.match(
      source,
      /if \(semanticAudienceReaction\) \{\s*playDebateAudienceReaction\(semanticAudienceReaction, event\.id\);\s*\}\s*if \(debateEventIsCanonicalSilence\(event\)\)/u,
    );
    assert.match(source, /debateSilenceHoldDurationMs\(event\)/u);
    assert.match(source, /playDebateAudienceReaction\("laugh"/u);
    assert.doesNotMatch(source, /await playDebateAudienceReaction/u);
    assert.doesNotMatch(
      source,
      /window\.setTimeout\(resolve,\s*reaction\.durationMs\)/u,
    );
    assert.match(
      css,
      /\.debateAudienceBotPortrait\[data-audience-bounce="true"\]\s*\{[^}]*animation:\s*debate-audience-live-reaction/u,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.debateAudienceBotPortrait\[data-audience-bounce="true"\]/u,
    );
  });

  it("puts readable audience pressure on the gallery and Judge transport on the Forum", () => {
    assert.match(source, /className=\{styles\.debateAudienceStatus\}/u);
    assert.match(source, /role="meter"/u);
    assert.match(source, /aria-label="Audience rowdiness"/u);
    assert.match(source, /data-tutorial-target="debate-judge-gavel"/u);
    assert.match(source, /"Settle gallery"/u);
    assert.match(
      source,
      /audiencePressureScore=\{currentAudiencePressureScore\}/u,
    );
    assert.match(source, /className=\{styles\.stageTransportControls\}/u);
    assert.match(source, /className=\{styles\.stageGavelButton\}/u);
    assert.match(source, /data-action=\{judgeUnifiedGavelAction\}/u);
    assert.match(source, /activateJudgeUnifiedGavel\(\)/u);
    assert.match(source, /judgeControl=\{null\}/u);
    assert.match(css, /\.debateAudienceRow::before/u);
    assert.match(css, /\.debateAudienceRow::after/u);
    assert.match(css, /\.stageGavelButton/u);
    assert.match(css, /pointer-events:\s*auto/u);
  });

  it("places theme-aware fog between the rear and front gallery rows", () => {
    assert.match(css, /gallery-chamber-dark\.webp/u);
    assert.match(css, /gallery-chamber-light\.webp/u);
    assert.ok(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/gallery-chamber-dark.webp",
            import.meta.url,
          ),
        ),
      ),
    );
    assert.ok(
      existsSync(
        fileURLToPath(
          new URL(
            "../../public/debate/gallery-chamber-light.webp",
            import.meta.url,
          ),
        ),
      ),
    );
    assert.match(css, /--debate-gallery-fog-core:/u);
    assert.match(css, /--debate-gallery-fog-opacity:\s*0\.2/u);
    assert.match(
      css,
      /\.debateAudienceRow::after\s*\{[^}]*z-index:\s*2[^}]*var\(--debate-gallery-fog-core\)[^}]*filter:\s*blur\(8px\)[^}]*opacity:\s*var\(--debate-gallery-fog-opacity\)/u,
    );
    assert.match(css, /\.debateAudienceLayer\s*\{[^}]*z-index:\s*3/u);
    assert.match(
      css,
      /\.debateAudienceLayer\[data-depth-row="rear"\]\s*\{[^}]*z-index:\s*1/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\] \.debateAudienceRow\s*\{[^}]*--debate-gallery-fog-core:\s*rgba\(203, 197, 207, 0\.88\)[^}]*--debate-gallery-fog-opacity:\s*0\.12/u,
    );
  });

  it("shouts bot objections while keeping the visible transcript literal", () => {
    assert.match(source, /voicePerformanceText\?: string \| null/u);
    assert.match(
      source,
      /event\.kind === "objection"\s*\?\s*"shouts"\s*:\s*normalizeDebateVoicePerformanceCue\(event\.voicePerformanceCue\)/u,
    );
    assert.match(
      source,
      /`\[\$\{hiddenPerformanceCue\}\] \$\{authoredPerformanceText \?\? spokenText\}`/u,
    );
    assert.match(
      source,
      /const rawPerformance = atmosphericPerformance[\s\S]{0,120}atmosphericPerformance\.voicePerformanceText/u,
    );
    assert.match(
      source,
      /botPowerIsBreathlessV1\(speakerPowers\)[\s\S]{0,120}botPowerStripBreathPerformanceTextV1\(rawPerformance\)/u,
    );
    assert.match(
      source,
      /voiceSpokenText\(authoredVoiceText, \{ leadingMarkedAction: true \}\)/u,
    );
    assert.match(
      source,
      /voicePerformanceTextFromActionCues\(\s*authoredVoiceText,\s*\{ leadingMarkedAction: true, omitLocalFoleyTags: true \}/u,
    );
    assert.match(
      source,
      /`- Voice performance: \$\{voicePerformanceCue \? `\[\$\{voicePerformanceCue\}\]` : "None"\}`/u,
    );
    assert.match(
      page,
      /const rawDebateVoicePerformanceText =\s*utterance\.voicePerformanceText \?\?\s*\(usePlayerVoice[\s\S]{0,120}voicePerformanceTextFromActionCues\(utterance\.spokenText\)/u,
    );
    assert.match(
      page,
      /const debateVoicePerformanceText =[\s\S]{0,260}botPowerIsBreathlessV1\(debateSpeakerPowers\)[\s\S]{0,180}botPowerStripBreathPerformanceTextV1\(/u,
    );
    assert.match(page, /voicePerformanceText:\s*debateVoicePerformanceText/u);
    assert.match(
      page,
      /botPowerVoiceGainMultiplierV1\(speakerPowers\) \*\s*\(utterance\.event\.kind === "objection" \? 1\.14 : 1\)/u,
    );
  });

  it("keeps historical side colors stable and marks only the active case card", () => {
    assert.match(
      source,
      /card\.createdEventId === activeEvent\?\.id\s*\?\s*"true"/u,
    );
    assert.match(
      css,
      /\.caseThread\s*>\s*li\[data-side="for"\][\s\S]{0,120}var\(--debate-for-color\)/u,
    );
    assert.match(
      css,
      /\.caseThread\s*>\s*li\[data-side="against"\][\s\S]{0,120}var\(--debate-against-color\)/u,
    );
    assert.match(css, /\.caseThread\s*>\s*li\[data-active="true"\]/u);
    assert.match(
      css,
      /\.transcriptFeed article\[data-side="for"\] header strong\s*\{[^}]*var\(--debate-for-color\)/u,
    );
    assert.match(
      css,
      /\.transcriptFeed article\[data-side="against"\] header strong\s*\{[^}]*var\(--debate-against-color\)/u,
    );
    assert.doesNotMatch(
      css,
      /\.transcriptFeed article header strong\s*\{[^}]*var\(--debate-active-color\)/u,
    );
  });

  it("keeps live Evidence final rows inside its visible scrollport", () => {
    assert.match(
      css,
      /\.stageSupport\s*\{[^}]*flex:\s*1\s+1\s+0[^}]*min-height:\s*0[^}]*overflow:\s*hidden/u,
    );
    assert.match(
      css,
      /\.evidenceRailTrack\s*\{[^}]*flex:\s*1\s+1\s+auto[^}]*flex-direction:\s*column[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*padding:\s*0\s+8px\s+12px[^}]*scroll-padding-bottom:\s*12px/u,
    );
  });

  it("scrolls only the Living Case Board cards while the public gallery stays fixed", () => {
    assert.match(
      css,
      /\.live\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*height:\s*100%[^}]*overflow:\s*hidden/u,
    );
    assert.match(css, /\.liveWorkspace\s*\{[^}]*overflow:\s*hidden/u);
    assert.match(
      css,
      /\.stageColumn\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*0[^}]*height:\s*100%/u,
    );
    assert.match(
      css,
      /\.stageSupport\s*\{[^}]*flex:\s*1\s+1\s+0[^}]*min-height:\s*0[^}]*overflow:\s*hidden/u,
    );
    assert.match(
      css,
      /\.caseBoard\s*\{[^}]*display:\s*flex[^}]*flex-direction:\s*column[^}]*min-height:\s*0[^}]*height:\s*100%[^}]*overflow:\s*hidden/u,
    );
    assert.match(
      css,
      /\.caseThread\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/u,
    );
    assert.match(css, /\.caseThread\s*>\s*li p\s*\{[^}]*font-size:\s*15px/u);
    assert.match(
      css,
      /\.stageSupport\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*0\.5fr\)\s+minmax\(0,\s*1fr\)\s+minmax\(0,\s*0\.5fr\)/u,
    );
    assert.match(css, /\.debateRoundSummary/u);
    assert.match(
      css,
      /\.evidenceRailTrack\s*\{[^}]*flex:\s*1\s+1\s+auto[^}]*flex-direction:\s*column[^}]*min-height:\s*0[^}]*overflow-y:\s*auto[^}]*padding:\s*0\s+8px\s+12px[^}]*scroll-padding-bottom:\s*12px/u,
    );
    assert.match(css, /\.evidenceRailThumb/u);
    assert.match(css, /\.evidenceRailThumbDocument/u);
    assert.match(source, /DebateEvidenceExhibitVisual/u);
    assert.match(source, /debateRoundSummarySourceCards/u);
    assert.match(source, /debateRoundSummaryShouldHydrate/u);
    assert.match(source, /renderDebateRoundSummary/u);
    assert.match(source, /composeDebateRoundSummary/u);
    assert.match(source, /styles\.caseThread/u);
    assert.match(source, /data-tutorial-target="debate-round-summary"/u);
    assert.match(css, /\.debateAudienceRow\s*\{[^}]*height:\s*clamp\(118px/u);
    assert.match(css, /\.debateAudienceRow\s*\{[^}]*flex:\s*0\s+0\s+auto/u);
    assert.doesNotMatch(
      css,
      /\.audienceGallery\.juryRoster\s*\{[^}]*overflow-y:\s*auto/u,
    );
    assert.doesNotMatch(
      css,
      /\.debateAudienceRow\s*\{[^}]*overflow-y:\s*auto/u,
    );
    assert.match(
      css,
      /\.audienceGallery\.juryRoster\s*\{[^}]*align-self:\s*stretch[^}]*height:\s*100%[^}]*max-height:\s*100%/u,
    );
    assert.match(
      css,
      /\.stageSupport:has\(\.juryThoughtChip:hover\)[\s\S]{0,180}overflow:\s*visible/u,
    );
    assert.match(
      css,
      /\.audienceGallery\.juryRoster\s*\{[^}]*overflow:\s*hidden/u,
    );
    assert.doesNotMatch(css, /height:\s*calc\(100dvh\s*-\s*214px\)/u);
    assert.doesNotMatch(
      css,
      /\.debateRail\[data-completed="true"\]\s*\{[^}]*height:\s*calc\(100dvh/u,
    );
    assert.match(
      css,
      /\.transcript,\s*\.debateRail\[data-player-window-active="true"\]\s*\.transcript,\s*\.liveRailPanel\s*\.transcript\s*\{[^}]*flex:\s*1\s+1\s+auto[^}]*min-height:\s*0[^}]*height:\s*auto/u,
    );
    assert.match(
      css,
      /\.forum\s*\{[^}]*flex:\s*0\s+0\s+auto[^}]*width:\s*100%[^}]*aspect-ratio:\s*2\s*\/\s*1/u,
    );
  });

  it("bookends a new live Forum and its completed verdict with the Living Chamber ident", () => {
    assert.match(source, /playDebateIdentAudio\(\{/u);
    assert.match(
      source,
      /await adoptSession\(null, result\.session, \{ playIntro: true \}\)/u,
    );
    assert.match(
      source,
      /const adopted = reuseDebateSessionEventPrefix\(previous, next\)[\s\S]{0,160}activeSessionRef\.current = adopted[\s\S]{0,100}setActiveSession\(adopted\)[\s\S]{0,480}options\.playIntro[\s\S]{0,420}await playDebateIdent\("intro"\)[\s\S]{0,240}judgeGavelSmashRef\.current\?\.\("order"\)[\s\S]{0,160}setDebateOpeningGalleryHushed\(true\)[\s\S]{0,620}await consumeNewEvents/u,
    );
    assert.match(
      source,
      /previous\.status !== "completed"[\s\S]{0,120}next\.status === "completed"[\s\S]{0,220}DEBATE_IDENT_OUTRO_LEAD_MS[\s\S]{0,180}await playDebateIdent\("outro"\)/u,
    );
    assert.match(source, /setDebateIdentAudioVolume\(props\.audioVolume\)/u);
    assert.match(source, /void stopDebateIdentAudio\(\)/u);
    assert.match(source, /data-debate-ident-overlay="true"/u);
    assert.match(
      source,
      /--debate-ident-duration": `\$\{DEBATE_IDENT_AUDIO\[kind\]\.durationMs\}ms`/u,
    );
    assert.match(source, /PRISM presents/u);
    assert.match(source, /The Forum is adjourned/u);
    assert.match(source, /The Prismatic Forum/u);
    assert.match(source, /Prevailing side/u);
    assert.match(css, /\.identOverlay\[data-kind="intro"\]/u);
    assert.match(css, /\.identOverlay\[data-kind="outro"\]/u);
    assert.match(css, /@keyframes debate-ident-intro-curtain/u);
    assert.match(css, /@keyframes debate-ident-outro-curtain/u);
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.identOverlay/u,
    );
    assert.doesNotMatch(identSource, /RoomAcoustics|roomAcoustics/u);
    assert.match(
      source,
      /deferBotVocalization=\{\s*debateIdentPlaying !== null \|\|\s*\(presenting &&\s*\(audiencePressureBand === null \|\|\s*audiencePressureBand === "settled"\)\) \|\|\s*audienceReactingSeatIndices\.size > 0 \|\|\s*\(busy && !presenting\)\s*\}/u,
    );
  });

  it("replays gallery arrival and exposes Start only after the minimum Archive runway is ready", () => {
    assert.match(source, /setOpeningPreloadSessionId\(session\.id\)/u);
    assert.match(source, /setView\("baking"\)/u);
    assert.match(source, /archive-return-buffer/u);
    assert.match(
      source,
      /setArchiveReturnReadiness\(\{[\s\S]{0,180}phase: "preparing"/u,
    );
    const returnBufferStart = source.indexOf("archive-return-buffer");
    const arrivalWait = source.indexOf("await waitForDebateGalleryArrival");
    assert.ok(returnBufferStart >= 0);
    assert.ok(arrivalWait > returnBufferStart);
    assert.match(source, /await waitForDebateGalleryArrival\(/u);
    assert.match(
      source,
      /await waitForDebateGalleryArrival\([\s\S]{0,1800}setView\("live"\)[\s\S]{0,500}identPlaybackPromise/u,
    );
    assert.match(source, /setOpeningPreloadSessionId\(null\)/u);
    assert.match(source, /setArchiveReturnReadySessionId\(/u);
    assert.match(
      source,
      /titleCardHolding =[\s\S]{0,100}archiveReadinessForSession !== null/u,
    );
    assert.match(source, /"Ready now · buffering ahead"/u);
    assert.match(source, /"Fully buffered"/u);
    assert.match(
      source,
      /disabled:[\s\S]{0,120}archiveReadinessForSession\?\.phase === "preparing"[\s\S]{0,160}busy/u,
    );
    const openSessionSource = source.slice(
      source.indexOf("const openSession = async"),
      source.indexOf(
        "useEffect(() =>",
        source.indexOf("const openSession = async"),
      ),
    );
    assert.doesNotMatch(openSessionSource, /pauseOrResume\(/u);
  });

  it("rebases only archive-open lifecycle writes and copies a complete record from each archive card", () => {
    assert.match(source, /const rebaseArchiveOpenMutation = async/u);
    assert.match(
      source,
      /for \(let attempt = 0; attempt < 6; attempt \+= 1\)/u,
    );
    assert.match(source, /debateArchiveOpenCanRebaseMutation\(/u);
    assert.match(source, /"resume-spectator-bake"/u);
    assert.match(source, /"pause-return-recess"/u);
    assert.match(source, /"spectator-ready-hold"/u);
    assert.match(source, /debateArchiveOpenShouldAdoptRefreshed\(/u);
    assert.match(source, /nextMutationKey\("bake-restore-recess"\)/u);
    assert.match(source, /copyArchiveVerboseTranscript/u);
    assert.match(
      source,
      /\/api\/debates\/\$\{encodeURIComponent\(archived\.id\)\}\?perspective=\$\{perspective\}/u,
    );
    assert.match(
      source,
      /await verboseTranscriptForSession\(result\.session\)/u,
    );
    assert.match(source, /event\.stopPropagation\(\)/u);
    assert.match(
      source,
      /aria-busy=\{archiveTranscriptCopyState === "copying"\}/u,
    );
    assert.match(source, /Copy verbose transcript/u);
  });

  it("keeps buffering and voice-warming after readiness while the title card remains", () => {
    assert.match(source, /const preloadDebateVoiceRunway = useCallback/u);
    assert.match(source, /debateUtteranceForEvent\(session, event\)/u);
    assert.match(source, /Promise\.allSettled\(\[worker\(\), worker\(\)\]\)/u);
    assert.match(
      source,
      /if \(requireFirstReady\)[\s\S]{0,100}await onPrepareUtterance\(first\)/u,
    );
    assert.match(source, /const preloadReturnedDebateVoices = useCallback/u);
    assert.match(source, /const criticalReady = preloadDebateVoiceRunway\(/u);
    assert.match(source, /const runwayReady = criticalReady\.then/u);
    assert.match(
      source,
      /preparedResumeEvent \? \[preparedResumeEvent\] : \[\][\s\S]{0,180}event\.id !== preparedResumeEvent\?\.id/u,
    );
    assert.match(
      source,
      /archiveReturnTitleSessionIdRef\.current === lookaheadSessionId/u,
    );
    assert.match(source, /archive-return-buffer-ahead-/u);
    assert.match(
      source,
      /buffered\.bufferedAdvanceCount <= previousBufferedCount/u,
    );
    assert.ok(
      source.indexOf("void voiceRunway.runwayReady") <
        source.indexOf("await voiceRunway.runwayReady"),
    );
    assert.match(
      source,
      /current\?\.sessionId === lookaheadSessionId &&[\s\S]{0,100}current\.phase !== "preparing"[\s\S]{0,120}bufferingFailed: true/u,
    );
    assert.match(
      source,
      /archiveReadinessForSession\?\.phase === "preparing" \|\|[\s\S]{0,120}debateFloorMutationInFlightRef\.current/u,
    );
  });

  it("detaches lookahead race-safely on an early Start and keeps catch-up synthesis in-world", () => {
    assert.match(source, /if \(launchFromTitleCard\) \{/u);
    assert.match(source, /archiveReturnTitleSessionIdRef\.current = null/u);
    assert.match(
      source,
      /archiveReturnLookaheadAbortRef\.current\?\.abort\(\)/u,
    );
    assert.match(source, /lifecycle rebase absorbs that one revision/u);
    const gavelIndex = source.indexOf(
      'triggerJudgeGavelSmash("order", openingGavelEventId)',
    );
    const lifecycleRequestIndex = source.indexOf(
      "const lifecyclePath",
      gavelIndex,
    );
    assert.ok(gavelIndex >= 0 && lifecycleRequestIndex > gavelIndex);
    assert.match(source, /busy && !presenting && session\.status === "live"/u);
    assert.match(source, /\? debateExpectedBotId\(session\)/u);
    assert.doesNotMatch(source, /<PrismBlockingLoader\s+open=\{busy\}/u);
  });

  it("cuts the prepared title straight to the opening gavel", () => {
    assert.match(
      source,
      /if \(bufferedReturnGavel\)[\s\S]{0,240}if \(launchFromTitleCard\) setOpeningLaunchSessionId\(previous\.id\)[\s\S]{0,320}stopDebateIdentAudio\(DEBATE_OPENING_TITLE_CUT_FADE_MS\)[\s\S]{0,240}triggerJudgeGavelSmash\("order", openingGavelEventId\)/u,
    );
    assert.match(
      source,
      /startPreparedOpening \|\| startSpectatorWatch[\s\S]{0,900}automaticJudgeGavel: true[\s\S]{0,300}resumedLifecycleGavelPresentationEventId: firstOpeningEventId[\s\S]{0,300}releaseOpeningGalleryHushOnEventId: firstOpeningEventId/u,
    );
    assert.match(
      source,
      /data-opening-launch=\{openingLaunching \? "true" : undefined\}/u,
    );
    assert.match(
      source,
      /catch \(caught\) \{[\s\S]{0,180}if \(launchFromTitleCard && mountedRef\.current\)[\s\S]{0,240}setOpeningLaunchSessionId\(null\)[\s\S]{0,220}setDebateOpeningGalleryHushed\(false\)[\s\S]{0,260}if \(!titleStartCommitted\)[\s\S]{0,140}playPreparedOpeningTitleMusic\(previous\.id\)/u,
    );
    assert.match(source, /const archiveOpenRunRef = useRef\(0\)/u);
    assert.match(
      source,
      /const openingIsCurrent = \(\): boolean =>[\s\S]{0,180}archiveOpenRunRef\.current === archiveOpenRunId/u,
    );
    assert.match(
      source,
      /returnLiveSessionToStudio[\s\S]{0,260}archiveOpenRunRef\.current \+= 1/u,
    );
  });

  it("gives listening advocates and visible jurors face-driven reactions", () => {
    assert.match(
      source,
      /activeSpeakerId !== session\.forAdvocate\.id[\s\S]{0,80}\? listenerReaction/u,
    );
    assert.match(
      source,
      /activeSpeakerId !== session\.againstAdvocate\.id[\s\S]{0,80}\? listenerReaction/u,
    );
    assert.match(source, /const reactingJurorIndices = new Set/u);
    assert.match(source, /reactingJurorIndices\.has\(index\)/u);
    assert.match(source, /data-listening-reaction=\{listenerReaction/u);
    assert.match(source, /foleyMouthShape,\s*listenerReaction,/u);
    assert.match(page, /const debateMoodHint =/u);
    assert.match(page, /avatarState\.listenerReaction === "question"/u);
    assert.match(page, /moodHint=\{debateMoodHint\}/u);
    assert.match(
      css,
      /\.juryChamberSeat:not\(\s*\[data-speaking="true"\]\s*\)\[data-listening-reaction="question"\]/u,
    );
    assert.match(
      css,
      /\.botStagePresence:not\(\s*\[data-speaking="true"\]\s*\)\[data-listening-reaction="attentive"\]/u,
    );
  });

  it("presents saved Persona surprise Foley as a short in-character reaction", () => {
    assert.match(source, /stepKey\.startsWith\("persona_reaction_"\)/u);
    assert.match(source, /"vocal reaction"/u);
    assert.match(source, /"In-character reaction"/u);
    assert.match(
      source,
      /activeEvent\.kind === "reaction"[\s\S]{0,100}activeEvent\.speakerKind === "juror"/u,
    );
    assert.match(source, /resolveDebateVocalFoleyTagText\(/u);
    assert.match(source, /debateEventIsAtmosphericVocalFoley\(/u);
    assert.match(source, /debateVocalFoleyVoicePerformance\(/u);
    assert.match(source, /debateAmbientVocalFoleyVoicePerformance\(/u);
    assert.match(source, /return "owned"/u);
    assert.match(source, /data-debate-vocal-foley-tag="true"/u);
    assert.match(
      source,
      /\*\{sentenceCaseActionText\(vocalFoleyTagText\)\}\*/u,
    );
    assert.match(css, /\.botVocalFoleyTag\s*\{/u);
    assert.match(css, /\.botStagePresence\s*\{[\s\S]*position:\s*relative;/u);
  });

  it("keeps atmospheric vocal Foley out of Proceedings and verbose transcripts", () => {
    assert.match(source, /!debateEventIsAtmosphericVocalFoley\(event\)/u);
    assert.match(
      source,
      /export function formatDebateVerboseTranscript[\s\S]{0,14000}!debateEventIsAtmosphericVocalFoley\(event\)/u,
    );
    assert.equal(
      [...source.matchAll(/!debateEventIsAtmosphericVocalFoley\(event\)/gu)]
        .length,
      2,
    );
  });

  it("renders response cues as compact chronological Foley notation", () => {
    assert.match(source, /debateTranscriptTimelineEntries/u);
    assert.match(source, /className=\{styles\.transcriptFoleyCue\}/u);
    assert.match(source, /<span aria-hidden="true">Foley<\/span>/u);
    assert.doesNotMatch(source, /visiblePresenceBeats\.flatMap/u);

    const notationStart = source.indexOf("const DebateFoleyTranscriptNotation");
    const notationEnd = source.indexOf(
      "function debateEvidenceExhibitImageUrl",
      notationStart,
    );
    const notation = source.slice(notationStart, notationEnd);
    assert.doesNotMatch(notation, /heardBotPresenceBeatTextV1|beat\.text|<p>/u);
    assert.match(
      css,
      /\.transcriptFeed article\.transcriptFoleyCue\s*\{[^}]*display:\s*flex;[^}]*padding:\s*7px 0;/u,
    );
  });

  it("never offers Jury as a camera control; Auto enters the chamber as a required scene", () => {
    assert.match(
      source,
      /function debateJuryManualCameraAvailable[\s\S]{0,220}debateJuryAutoChamberActive\(session\)/u,
    );
    assert.match(
      source,
      /function debateCameraModeForSession[\s\S]{0,320}cameraMode === "jury" && debateJuryManualCameraAvailable\(session\)/u,
    );
    assert.match(
      source,
      /function debateJuryCameraIsActive[\s\S]{0,520}cameraMode === "jury" && debateJuryManualCameraAvailable\(session\)/u,
    );
    assert.match(
      source,
      /if \(camera\.id === "jury"\) return false;[\s\S]{0,80}session\.playerRole === "judge"[\s\S]{0,80}return camera\.id === "auto"/u,
    );
    assert.doesNotMatch(source, /disabled=\{juryCameraClosed\}/u);
    assert.doesNotMatch(source, /Jury camera opens during deliberation/u);
    assert.match(
      source,
      /if \(cameraMode !== "jury" \|\| !activeSession\) return;[\s\S]{0,180}selectDebateCameraMode\("auto"\)/u,
    );
    assert.match(
      source,
      /!juryChamberVisible &&\s*activeEvent\.speakerKind !== "juror"/u,
    );
    assert.match(source, /debateLiveCameraViewWithJuryLock/u);
    assert.match(source, /Forum seats only\. Jurors never steal the camera/u);
    assert.doesNotMatch(
      source.slice(
        source.indexOf("const muteReactionCameraRole"),
        source.indexOf("const muteReactionCameraRole") + 650,
      ),
      /"jury"/u,
    );
  });

  it("keeps Jury camera entry and exit automatic for every role", () => {
    assert.match(
      source,
      /type DebateCameraView = "wide" \| "left" \| "moderator" \| "right" \| "jury"/u,
    );
    assert.match(source, /type DebateCameraMode = "auto" \| DebateCameraView/u);
    assert.match(source, /const DEBATE_CAMERA_VIEWS/u);
    assert.match(source, /\{ id: "auto", label: "Auto" \}/u);
    assert.match(source, /\{ id: "jury", label: "Jury" \}/u);
    assert.match(source, /useState<DebateCameraMode>\("auto"\)/u);
    assert.match(
      source,
      /if \(activeRole === "for"\) return "left";[\s\S]*if \(activeRole === "moderator"\) return "moderator";[\s\S]*if \(activeRole === "against"\) return "right";[\s\S]*return "wide";/u,
    );
    assert.match(
      source,
      /const effectiveCameraMode = activeSession[\s\S]{0,160}debateCameraModeForSession\(cameraMode, activeSession\)/u,
    );
    assert.match(
      source,
      /function debateCameraModeForSession[\s\S]{0,320}session\.playerRole === "judge"[\s\S]{0,280}return "auto"/u,
    );
    assert.match(
      source,
      /const cameraPresentationEvent =[\s\S]{0,1400}const juryCameraActive = activeSession[\s\S]{0,180}debateJuryCameraIsActive\(effectiveCameraMode, activeSession, \{/u,
    );
    const juryCameraStart = source.indexOf("function debateJuryCameraIsActive");
    const juryCameraEnd = source.indexOf(
      "function debateCameraModeForSession",
      juryCameraStart,
    );
    assert.doesNotMatch(
      source.slice(juryCameraStart, juryCameraEnd),
      /playerRole/u,
    );
    assert.doesNotMatch(source, /forumPreparingNextTurn/u);
    assert.match(
      source,
      /const cameraSpeechEvent = debateEventCanOwnAutomaticCamera\([\s\S]{0,120}presenting/u,
    );
    assert.match(source, /const forumCameraView = galleryArriving/u);
    assert.match(source, /recessSettledWide\s*\? "wide"/u);
    assert.match(source, /debateLiveCameraViewWithJuryLock/u);
    assert.match(
      source,
      /juryCameraActive,[\s\S]{0,80}forumView: forumCameraView/u,
    );
    assert.match(
      source,
      /juryCameraActive \|\|[\s\S]{0,80}debateEventUsesJuryCamera\(event\)/u,
    );
    assert.match(source, /debateAutoCameraView\(cameraActiveRole\)/u);
    assert.match(source, /resolveDebateSpeechCoverageView/u);
    assert.match(source, /coverageCameraView &&/u);
    assert.match(
      source,
      /debateEventIsModeratorMonologue\(event\)[\s\S]{0,220}setCoverageCameraView\(null\)/u,
    );
    assert.match(
      source,
      /Metadata-only revision drift is safe to absorb without clearing[\s\S]{0,260}setActiveSession\(recovered\)[\s\S]{0,120}requestAdvance\(recovered\)/u,
    );
    assert.match(
      source,
      /Another accepted floor action won the race[\s\S]{0,220}adoptSession\(previous, recovered\)/u,
    );
    assert.match(source, /debateAdoptProceedingsCursor\(previous, next\)/u);
    assert.doesNotMatch(
      source,
      /setTranscriptVisibleThroughSequence\(\s*previous\?\.events\.at\(-1\)\?\.sequence/u,
    );
    assert.match(source, /resolveDebateModeratorCameraView/u);
    assert.match(source, /debateEventIsModeratorMonologue/u);
    assert.doesNotMatch(source, /activeEvidenceItem\s*\?\s*"wide"/u);
    assert.match(source, /tableEvidenceStickyId/u);
    assert.match(source, /resolveDebateTableEvidenceStickyId\(/u);
    assert.match(source, /debateTableEvidenceItem\(/u);
    assert.match(
      source,
      /<DebateEvidencePedestalPresence[\s\S]{0,120}item=\{activeEvidenceItem\}/u,
    );
    assert.match(source, /<DebateEvidencePedestal/u);
    assert.match(source, /<DebateEvidenceDocument/u);
    assert.match(
      evidenceDocumentSource,
      /data-debate-evidence-document="true"/u,
    );
    assert.match(source, /item\.kind === "source"/u);
    assert.match(source, /debateEvidenceSourceHost\(evidenceSource\)/u);
    assert.match(source, /evidenceSource\.title/u);
    assert.match(source, /evidenceSource\.snippet/u);
    assert.match(source, /debateEvidencePropRotationDeg\(/u);
    assert.match(evidenceDocumentSource, /--debate-evidence-prop-rotate/);
    assert.match(source, /debateEvidenceSourcePropKind\(evidenceSource\)/u);
    assert.match(source, /kind=\{evidenceSourcePropKind\}/u);
    assert.match(
      evidenceDocumentSource,
      /\? "envelope"[\s\S]*\? "folio"[\s\S]*: "clipping"/u,
    );
    assert.match(
      evidenceDocumentSource,
      /className=\{styles\.evidencePedestalDocumentHardware\}/u,
    );
    assert.doesNotMatch(source, /evidencePedestalDocumentMark/u);
    assert.doesNotMatch(
      source,
      /evidencePedestalDocument[\s\S]{0,200}evidencePedestalLabel/u,
    );
    assert.match(source, /stageAlignmentPreviewCameraLabel/u);
    assert.match(source, /data-evidence-view=\{evidenceAlignmentView\}/u);
    assert.match(
      source,
      /const evidenceView = debateStageEvidenceViewForCamera\(cameraView\)/u,
    );
    assert.match(
      source,
      /<DebateEvidencePedestal[\s\S]{0,180}view=\{evidenceView\}/u,
    );
    assert.doesNotMatch(source, /className=\{styles\.evidencePedestalTable\}/u);
    assert.doesNotMatch(
      source,
      /src=\{`\/coffee-table\/table_\$\{theme\}\.png`\}[\s\S]{0,80}evidencePedestal/u,
    );
    assert.match(source, /playDebateExhibitImpactSfx\(/u);
    assert.match(source, /moment: "packet_add"/u);
    assert.match(
      source,
      /debateExhibitImpactForExhibit\(exhibit, "table_place"\)/u,
    );
    assert.match(
      source,
      /tag: `debate-exhibit-place:\$\{exhibit\.id\}:\$\{impact\.material\}`/u,
    );
    assert.match(
      source,
      /data-impact-material=\{\s*exhibit \? resolveDebateExhibitImpactMaterial\(exhibit\) : "paper"\s*\}/u,
    );
    assert.doesNotMatch(source, /judgeGavelCameraForced/u);
    assert.match(
      source,
      /const forumCameraView = galleryArriving\s*\?\s*"wide"/u,
    );
    assert.match(source, /const juryChamberVisible = cameraView === "jury"/u);
    assert.doesNotMatch(source, /data-locked=\{judgeGavelCameraForced/u);
    assert.doesNotMatch(source, /disabled=\{judgeGavelCameraForced/u);
    assert.doesNotMatch(
      source,
      /const triggerJudgeGavelSmash[\s\S]{0,420}setCameraMode\("moderator"\)/u,
    );
    assert.match(source, /data-camera-view=\{cameraView\}/u);
    assert.match(source, /data-camera-mode=\{effectiveCameraMode\}/u);
    assert.match(
      source,
      /if \(camera\.id === "jury"\) return false;[\s\S]{0,80}session\.playerRole === "judge"[\s\S]{0,80}return camera\.id === "auto"/u,
    );
    assert.doesNotMatch(source, /Watch Jury/u);
    assert.match(source, /data-silent-deliberation/u);
    assert.match(source, /The next juror will be heard in this chamber/u);
    assert.doesNotMatch(source, /juryDeliberationBubble/u);
    assert.match(source, /foleyMouthShape/u);
    assert.match(
      css,
      /\.cameraControls\[data-judge-camera="true"\] button\[data-selected="true"\]/u,
    );
    assert.match(source, /data-tutorial-target="debate-camera"/u);
    assert.match(
      source,
      /className=\{styles\.forumCamera\}[\s\S]*className=\{styles\.podiumForeground\}/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="left"\]\s*\{[^}]*translate3d\(24%,\s*-10%,\s*0\)\s*scale\(1\.48\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s*\{[^}]*translate3d\(0,\s*0,\s*0\)\s*scale\(1\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="right"\]\s*\{[^}]*translate3d\(-24%,\s*-10%,\s*0\)\s*scale\(1\.48\)/u,
    );
    assert.match(
      source,
      /<DebateFocusDepthOverlays\s+cameraTransition=\{cameraTransition\}\s+cameraView=\{cameraView\}\s+\/>/u,
    );
    assert.match(source, /data-camera-transition=\{cameraTransition\}/u);
    assert.match(
      source,
      /data-blur-side="right"[\s\S]{0,120}props\.cameraView === "left"/u,
    );
    assert.match(
      source,
      /data-blur-side="left"[\s\S]{0,120}props\.cameraView === "right"/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\s*\{[^}]*z-index:\s*4[^}]*opacity:\s*0[^}]*transition:\s*opacity 720ms[^}]*contain:\s*paint style/u,
    );
    assert.doesNotMatch(
      css,
      /\.debaterFocusDepthOverlay\s*\{[^}]*backdrop-filter/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="right"\]\s*\{[^}]*mask-image:\s*linear-gradient\(\s*90deg/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="left"\]\s*\{[^}]*mask-image:\s*linear-gradient\(\s*270deg/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="right"\]\s*\{[\s\S]{0,420}background:\s*linear-gradient\(\s*270deg[\s\S]{0,780}mask-image:\s*linear-gradient\(\s*90deg,\s*transparent 0 28%,[\s\S]{0,180}#000 82%/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-blur-side="left"\]\s*\{[\s\S]{0,420}background:\s*linear-gradient\(\s*90deg[\s\S]{0,780}mask-image:\s*linear-gradient\(\s*270deg,\s*transparent 0 28%,[\s\S]{0,180}#000 82%/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\][\s\S]{0,100}\.debaterFocusDepthOverlay\[data-blur-side="right"\][\s\S]{0,120}background:\s*linear-gradient\(\s*270deg/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\s*\{[^}]*opacity:\s*1/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\[data-camera-transition="cut"\]\s*\{[^}]*transition-delay:\s*260ms/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\[data-camera-transition="move"\]\s*\{[^}]*transition-delay:\s*760ms/u,
    );
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]{0,220}\.debaterFocusDepthOverlay/u,
    );
    assert.match(css, /\.forumCamera\s*\{[^}]*transition:\s*transform 900ms/u);
    assert.match(
      css,
      /\.forumCamera\[data-camera-mode="auto"\]\s*\{[^}]*transition:\s*none/u,
    );
    assert.match(
      source,
      /const cameraTransition = activeMuteReactionBeat[\s\S]{0,80}\? "cut"[\s\S]{0,80}interruptCameraView[\s\S]{0,80}\? "objection-pan"[\s\S]{0,80}speakerHandoff[\s\S]{0,120}\? "handoff"/u,
    );
    assert.match(
      source,
      /const speakerHandoffKeepsWide =[\s\S]{0,180}phase === "evidence"[\s\S]{0,420}\? "wide"/u,
    );
    assert.match(source, /debateInterruptOverlapPair\(/u);
    assert.match(source, /voiceChannel: "crosstalk"/u);
    assert.match(source, /onReleaseUtterance\?/u);
    assert.match(source, /debateInterruptTrailOffLine\(/u);
    assert.match(source, /setInterruptCameraView\(/u);
    assert.match(
      source,
      /function debateCameraTransition[\s\S]{0,400}event\?\.kind === "objection" \|\| event\?\.kind === "interjection"[\s\S]{0,80}return "objection-pan"/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-transition="objection-pan"\]\s*\{[^}]*transition:\s*transform 900ms/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\[data-camera-transition="objection-pan"\]\s*\{[^}]*transition-delay:\s*760ms/u,
    );
    assert.match(
      css,
      /\.debaterFocusDepthOverlay\[data-visible="true"\]\[data-camera-transition="handoff"\]\s*\{[^}]*transition-delay:\s*760ms/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="moderator"\]\s+\.botStagePresence\s*\{[^}]*width:\s*clamp\(53px,\s*4\.65vw,\s*74px\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.botPosition\[data-role="moderator"\]\s+\.botStagePresence\s*\{[^}]*width:\s*clamp\(114px,\s*10vw,\s*160px\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.receiverMatte\s*\{[^}]*moderator-dark\.webp/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\]\s+\.forumCamera\[data-camera-view="moderator"\]\s+\.receiverMatte\s*\{[^}]*moderator-light\.webp/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.podiumForeground\s*\{[^}]*moderator-dark-foreground\.png/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\]\s+\.forumCamera\[data-camera-view="moderator"\]\s+\.podiumForeground\s*\{[^}]*moderator-light-foreground\.png/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.botPosition:not\(\[data-role="moderator"\]\)\s*\{[^}]*opacity:\s*0/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="for"\]\s*\{[^}]*bottom:\s*calc\(30\.5% - var\(--debate-for-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="against"\]\s*\{[^}]*bottom:\s*calc\(30\.5% - var\(--debate-against-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="moderator"\]\s*\{[^}]*bottom:\s*calc\(40\.5% - var\(--debate-moderator-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.botPosition\[data-role="moderator"\]\s*\{[^}]*left:\s*calc\(50% \+ var\(--debate-moderator-view-offset-x,\s*0%\)\)[^}]*bottom:\s*calc\(44\.5% - var\(--debate-moderator-view-offset-y,\s*0%\)\)/u,
    );
  });

  it("integrates a persona-tinted moderator-camera gavel with restrained procedural Foley", () => {
    assert.match(source, /function DebateModeratorGavel/u);
    assert.match(source, /data-debate-moderator-gavel="true"/u);
    assert.match(source, /data-gavel-theme=\{props\.theme\}/u);
    assert.match(source, /magentaTintedRasterUrl/u);
    assert.match(source, /moderatorGavelFrameDown/u);
    assert.match(source, /moderatorGavelFrameUp/u);
    assert.match(source, /color=\{session\.moderator\.color/u);
    assert.match(
      source,
      /preloadFoleyUrls=\{DEBATE_GAVEL_FOLEY_PRELOAD_URLS\}/u,
    );
    assert.match(source, /\}, 0\);/u);
    assert.match(source, /DEBATE_GAVEL_FOLEY_URLS\[cueKind\]/u);
    assert.match(source, /trim:\s*DEBATE_GAVEL_FOLEY_TRIM\[cueKind\]/u);
    assert.match(source, /playFoley\(/u);
    assert.match(
      source,
      /controllerHandleRef=\{debateAtmosphereControllerRef\}/u,
    );
    assert.match(source, /debateModeratorGavelSpeechLeadMs\(gavelCue\.kind\)/u);
    assert.match(
      source,
      /const gavelCameraSettleMs =[\s\S]{0,180}debateModeratorGavelCameraSettleMs\(gavelCue\.kind\)[\s\S]{0,300}window\.setTimeout\(resolve, gavelCameraSettleMs\)[\s\S]{0,220}setLiveGavelCue\(resumedLifecycleGavelAlreadyStruck \? null : gavelCue\)/u,
    );
    assert.match(source, /debateModeratorGavelCameraSettleMs/u);
    assert.doesNotMatch(
      source,
      /gavelCameraSettling|resumeCeremonyCameraForced/u,
    );
    assert.match(
      source,
      /setLiveGavelCue\([^)]+gavelCue\)[\s\S]{0,900}DEBATE_GAVEL_ORDER_CAMERA_CUT_MS[\s\S]{0,1800}let presentationArmedForHandoff = false[\s\S]{0,800}setPresentationEventId\(event\.id\)/u,
    );
    assert.match(
      source,
      /const activeGavelCue =\s*judgeGavelSmashCue \?\? \(presenting \? liveGavelCue : null\)/u,
    );
    assert.match(source, /pausedPresentationEventId/u);
    assert.match(
      source,
      /event\.sequence < pausedPresentationEvent\.sequence/u,
    );
    assert.match(source, /session\.status === "paused" && !presenting/u);
    assert.match(
      source,
      /recessSettledWide[\s\S]{0,120}session\.status === "paused" && !presenting;/u,
    );
    assert.match(
      source,
      /const cameraSpeechEvent = debateEventCanOwnAutomaticCamera\([\s\S]{0,120}presenting/u,
    );
    assert.doesNotMatch(source, /recessLifecycleModerator/u);
    assert.match(source, /recessSettledWide\s*\?\s*"wide"/u);
    assert.match(
      source,
      /resume && !silentLifecycle[\s\S]{0,180}status: "paused"/u,
    );
    assert.match(source, /Ceremonial resume keeps the recess UI/u);
    assert.match(
      source,
      /\(session\.status !== "paused" \|\|\s*activeGavelCue !== null\)/u,
    );
    assert.match(
      source,
      /const gavelAudioActive = Boolean\([\s\S]{0,260}activeGavelCue !== null/u,
    );
    assert.doesNotMatch(
      source,
      /const gavelAudioActive = Boolean\([\s\S]{0,260}session\.status === "paused" \|\| activeGavelCue/u,
    );
    assert.match(source, /stopDebateAmbientBotVocalization\(\)/u);
    assert.match(source, /setPresentationSuspended\(\s*true,\s*60\s*\)/u);
    assert.match(
      source,
      /allowSpeechAudio[\s\S]{0,400}status === "paused" && presenting/u,
    );
    assert.match(
      source,
      /allowRecessMurmur[\s\S]{0,200}status === "paused" &&\s*!presenting/u,
    );
    assert.match(
      source,
      /const recessGalleryPhase = debateRecessGalleryPhase\(/u,
    );
    assert.match(source, /gavelArmed: activeGavelCue !== null/u);
    assert.match(
      source,
      /session\.status === "paused"[\s\S]{0,80}session\.status === "waiting_for_player"|session\.status === "waiting_for_player"[\s\S]{0,80}session\.status === "paused"/u,
    );
    assert.match(
      source,
      /audioEnabled=\{\s*debateGavelAudioEnabled\(props\.audioVolume\)/u,
    );
    assert.match(source, /backgroundUrl=\{liveGalleryBackgroundUrl\}/u);
    assert.match(
      source,
      /activeAudienceOrderResponse\?\.returningRoomTone[\s\S]{0,100}"order-stragglers"/u,
    );
    assert.match(
      source,
      /galleryMixBranch === "order-stragglers"[\s\S]{0,180}debateAudienceOrderStragglerMix/u,
    );
    assert.match(
      source,
      /galleryMixBranch === "order-stragglers" \|\|\s*galleryMixBranch === "pressure-score"/u,
    );
    assert.match(source, /debateAudiencePressureMixTransitionMs\(/u);
    assert.match(
      source,
      /ambientFoley=\{ambientAudioActive && !suppressSparseAmbient\}/u,
    );
    assert.match(
      source,
      /ambientBotVocalizations=\{\s*ambientAudioActive && !suppressSparseAmbient\s*\}/u,
    );
    assert.match(source, /cue=\{activeGavelCue\}/u);
    assert.match(
      source,
      /session\.status !== "paused" \|\|\s*activeGavelCue !== null/u,
    );
    assert.match(
      source,
      /visible=\{moderatorPresentation\.visibility !== "hidden"\}/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]{0,100}\.moderatorGavel\[data-visible="true"\][\s\S]{0,100}opacity:\s*1/u,
    );
    assert.match(
      css,
      /\.moderatorGavel\s*\{[^}]*top:\s*44\.5%[^}]*left:\s*53%[^}]*z-index:\s*3/u,
    );
    assert.doesNotMatch(css, /--debate-gavel-scale/u);
    assert.match(
      source,
      /data-preview-pose=\{props\.cue \? undefined : props\.previewPose\}/u,
    );
    assert.match(
      css,
      /\.moderatorGavelFrameDown\s*\{[^}]*--debate-gavel-lowered-offset-x[^}]*--debate-gavel-lowered-rotation[^}]*--debate-gavel-lowered-scale/u,
    );
    assert.match(
      css,
      /\.moderatorGavelFrameUp\s*\{[^}]*--debate-gavel-raised-offset-x[^}]*--debate-gavel-raised-rotation[^}]*--debate-gavel-raised-scale/u,
    );
    assert.doesNotMatch(css, /moderator-gavel-(?:dark|light)-tint-mask\.png/u);
    assert.match(css, /@keyframes debate-gavel-attention/u);
    assert.match(css, /@keyframes debate-gavel-order/u);
    assert.match(css, /@keyframes debate-gavel-attention-frame-up/u);
    assert.match(css, /@keyframes debate-gavel-order-frame-up/u);
    const attentionKeyframes =
      css.match(/@keyframes debate-gavel-attention\s*\{([\s\S]*?)\n\}/u)?.[1] ??
      "";
    const orderKeyframes =
      css.match(/@keyframes debate-gavel-order\s*\{([\s\S]*?)\n\}/u)?.[1] ?? "";
    assert.doesNotMatch(attentionKeyframes, /rotate\(/u);
    assert.doesNotMatch(orderKeyframes, /rotate\(/u);
    assert.match(
      css,
      /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]{0,160}\.moderatorGavelMotion/u,
    );
    for (const relativePath of [
      "../../public/debate/moderator-gavel-dark-down.png",
      "../../public/debate/moderator-gavel-dark-up.png",
      "../../public/debate/moderator-gavel-light-down.png",
      "../../public/debate/moderator-gavel-light-up.png",
      "../../public/audio/debate/gavel-attention-v3.wav",
      "../../public/audio/debate/gavel-order-v3.wav",
    ]) {
      assert.equal(
        existsSync(fileURLToPath(new URL(relativePath, import.meta.url))),
        true,
      );
    }
  });

  it("puts the player Judge's default Prism behind the center role plate", () => {
    assert.equal(DEBATE_PLAYER_JUDGE_BOT_ID, "prism:player-judge");
    assert.match(source, /const DEBATE_PLAYER_JUDGE_PRISM/u);
    assert.match(source, /playerJudgeUsesPrism:\s*playerRole === "judge"/u);
    assert.match(source, /playerVoice:\s*session\.playerRole === "judge"/u);
    assert.match(
      source,
      /roleLabel:[\s\S]{0,180}normalizeDebateModeratorTitle\(session\.moderatorTitle\)/u,
    );
    assert.doesNotMatch(
      source,
      /className=\{styles\.playerPresence\}\s+data-role="judge"/u,
    );
    assert.doesNotMatch(css, /\.playerPresence\[data-role="judge"\]/u);
    assert.match(page, /botSnapshot\.id === DEBATE_PLAYER_JUDGE_BOT_ID/u);
    assert.match(page, /playerJudgePrism\s*\?\s*zenDefaultPrismFaceStyle/u);
    assert.match(
      page,
      /const usePlayerVoice = utterance\.player \|\| utterance\.playerVoice/u,
    );
    assert.match(
      page,
      /voicePerformanceTextFromActionCues\(utterance\.spokenText\)/u,
    );
    assert.match(page, /buildBundledActionSfxPlan\(utterance\.spokenText\)/u);
    assert.match(
      page,
      /playDebatePlayerActionSfx\(playerActionSfxPlan\.kind\)/u,
    );
    assert.match(page, /elevenLabsText:\s*strippedElevenLabsText/u);
    assert.match(
      page,
      /const strippedElevenLabsText =[\s\S]{0,260}botPowerStripBreathPerformanceTextV1\([\s\S]{0,100}message\.voicePerformanceText/u,
    );
    assert.doesNotMatch(
      page,
      /elevenLabsText:\s*voiceSpokenText\(message\.voicePerformanceText\)/u,
    );
    assert.match(page, /frozenVoiceProfile:\s*usePlayerVoice\s*\?\s*null/u);
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="for"\]\s*\{[^}]*top:\s*calc\(64% \+ var\(--debate-for-nameplate-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="against"\]\s*\{[^}]*top:\s*calc\(64% \+ var\(--debate-against-nameplate-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\s*\{[^}]*top:\s*calc\(63\.5% \+ var\(--debate-moderator-nameplate-offset-y,\s*0%\)\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="for"\]\s+\.botIdentityPlate\s*\{[^}]*rotateY\(10deg\)/u,
    );
    assert.match(
      css,
      /\.botIdentityPosition\[data-role="against"\]\s+\.botIdentityPlate\s*\{[^}]*rotateY\(-10deg\)/u,
    );
  });

  it("restores direct Main stage editing without chamber presets", () => {
    assert.match(
      source,
      /const DEBATE_STAGE_LAYOUT_AUTHORING_ENABLED = prismDeveloperAuthoringEnabled/u,
    );
    assert.match(
      source,
      /const openStageAlignment = \(\): void => \{\s*if \(!DEBATE_STAGE_LAYOUT_AUTHORING_ENABLED\) return;/u,
    );
    assert.match(
      source,
      /\{DEBATE_STAGE_LAYOUT_AUTHORING_ENABLED \? \(\s*<PrismRefractTarget[\s\S]*?<button[\s\S]*?data-tutorial-target="debate-stage-layout"/u,
    );
    assert.match(source, /Stage layout/u);
    assert.match(source, /data-tutorial-target="debate-stage-layout"/u);
    assert.match(source, /onClick=\{openStageAlignment\}/u);
    assert.doesNotMatch(source, /data-debate-stage-direction="true"/u);
    assert.doesNotMatch(source, /Close conversation/u);
    assert.doesNotMatch(source, /Balanced forum/u);
    assert.doesNotMatch(source, /Grand chamber/u);
    assert.doesNotMatch(source, /applyDebateStageDirectionPreset/u);
    assert.match(source, /if \(!stageAlignmentOpen\) return null/u);
    assert.match(source, /aria-label="More stage controls"/u);
    assert.match(source, /className=\{styles\.cameraAdvanced\}/u);
    assert.match(source, /data-debate-stage-alignment-modal="true"/u);
    assert.match(source, /Stage alignment/u);
    assert.match(source, /Save alignment/u);
    assert.match(source, /data-debate-alignment-voice-mixer="true"/u);
    assert.match(source, /Moderator mini avatar/u);
    assert.match(
      source,
      /aria-label=\{`\$\{stageAlignmentPreviewCameraLabel\} moderator mini avatar scale`\}/u,
    );
    assert.match(source, /updateDebateStageModeratorMicroScale/u);
    assert.doesNotMatch(
      source,
      /stageAlignmentPreviewCamera === "moderator"[\s\S]{0,80}moderatorMicroScales/u,
    );
    assert.match(css, /--debate-moderator-micro-scale-wide/u);
    assert.match(css, /--debate-moderator-micro-scale-left/u);
    assert.match(css, /--debate-moderator-micro-scale-right/u);
    assert.match(css, /\.alignmentModeratorScaleTuner/u);
    assert.match(source, /Voice levels/u);
    assert.match(source, /data-debate-alignment-mixer-test=/u);
    assert.match(source, /Gallery · Off/u);
    assert.match(source, /murmuring: "Murmuring"/u);
    assert.match(source, /restless: "Restless"/u);
    assert.match(source, /disruptive: "Disruptive"/u);
    assert.match(source, /nextDebateAlignmentGalleryHeat/u);
    assert.match(source, /DEBATE_ALIGNMENT_GALLERY_HEAT_CYCLE/u);
    assert.match(source, /updateDebateStageVoiceLevel/u);
    assert.match(source, /updateDebateStageGalleryVolume/u);
    assert.match(source, /scaleDebateAudienceMixByGalleryVolume/u);
    assert.match(source, /voiceLevel: debateStageVoiceLevelForRole/u);
    assert.match(css, /\.alignmentVoiceMixer/u);
    assert.match(css, /\.alignmentVoiceMixerTest/u);
    assert.match(css, /\.alignmentGalleryRowdyToggle/u);
    assert.match(css, /data-gallery-heat/u);
    assert.match(source, /Reset Main/u);
    assert.match(source, /Drag an item or use arrow keys to nudge by 0\.5%/u);
    assert.match(source, /\(\["light", "dark"\] as const\)/u);
    assert.match(source, /\["wide", "left", "moderator", "right"\] as const/u);
    assert.match(source, /aria-label="Debate alignment preview camera"/u);
    assert.doesNotMatch(source, /Court wide/u);
    assert.match(source, /Witness/u);
    assert.match(source, /Jury/u);
    assert.match(source, /data-debate-main-court-prop-toggle=/u);
    assert.match(source, /data-debate-main-court-prop-tuner="true"/u);
    assert.match(
      source,
      /const stageAlignmentMainCourtTunerVisible\s*=\s*stageAlignmentCourtForegroundVisible\s*&&[\s\S]{0,120}stageAlignmentPreviewCamera === "moderator"/u,
    );
    assert.match(
      source,
      /\{stageAlignmentMainCourtTunerVisible \? \(\s*<section/u,
    );
    assert.match(
      source,
      /data-court-tuner-view=\{stageAlignmentPreviewCamera\}/u,
    );
    assert.match(
      source,
      /shared foreground table from this camera/u,
    );
    assert.match(
      source,
      /const stageAlignmentCourtForegroundVisible\s*=\s*stageAlignmentWhodunnitPreview === null && !stageAlignmentJuryPreview/u,
    );
    assert.match(
      source,
      /data-debate-stage-court-foreground=\{[\s\S]{0,180}stageAlignmentMainCourtProp/u,
    );
    assert.match(
      source,
      /\{stageAlignmentCourtForegroundVisible \? \([\s\S]{0,240}data-debate-main-court-prop=/u,
    );
    assert.match(source, /className=\{mysteryV2Styles\.wideEvidenceTable\}/u);
    assert.match(source, /mysteryV2Styles\.wideWitnessSilhouette/u);
    assert.match(
      source,
      /const witnessSourceBot = stageAlignmentPreviewCast\.witness/u,
    );
    assert.match(
      source,
      /renderAlignmentCourtAvatar\(\s*witnessBot,\s*"moderator",\s*"full",?\s*\)/u,
    );
    assert.match(source, /data-debate-whodunnit-alignment=/u);
    assert.match(source, /data-debate-jury-alignment="true"/u);
    assert.match(source, /updateDebateStageWhodunnitCourtPlacement/u);
    assert.match(source, /updateDebateStageJuryMemberPlacement/u);
    assert.match(source, /updateDebateStageJuryPlacement/u);
    assert.match(source, /Each juror has an independent X, Y, and scale/u);
    assert.match(
      source,
      /const alignmentJuryMemberCount\s*=\s*alignmentJuryCadence === "natural-five" \? 5 : DEBATE_JURY_SIZE/u,
    );
    assert.match(
      source,
      /:\s*\[moderatorBot, forBot, againstBot, witnessBot\]/u,
    );
    assert.match(source, /\{alignmentJuryBots\.map\(\(bot, index\) =>/u);
    assert.match(source, /data-jury-cadence=\{alignmentJuryCadence\}/u);
    assert.doesNotMatch(
      source,
      /moderatorBot,\s*forBot,\s*againstBot,\s*forBot,\s*againstBot/u,
    );
    assert.match(
      source,
      /coffee-table\/table_\$\{stageAlignmentPreviewTheme\}\.png/u,
    );
    assert.doesNotMatch(source, /src=\{`\/debate\/overview-table-/u);
    assert.match(css, /--debate-jury-member-0-offset-x/u);
    assert.match(css, /--debate-jury-evidence-table-scale/u);
    assert.match(css, /--debate-jury-votes-offset-y/u);
    assert.match(
      css,
      /\.alignmentModalBody:has\(\.alignmentViewportColumn\[data-whodunnit-preview\]\)\s*\{[^}]*overflow:\s*hidden/u,
    );
    assert.match(
      css,
      /\.alignmentViewportColumn\[data-whodunnit-preview\]\s*\{[^}]*grid-template-columns:/u,
    );
    assert.match(
      css,
      /\.alignmentViewportColumn\[data-whodunnit-preview\][\s\S]{0,1400}grid-column:\s*3/u,
    );
    assert.match(
      mysteryV2Css,
      /:global\(\[data-whodunnit-court-preview\]\) \.witnessAvatar \{[^}]*bottom:\s*36%[^}]*width:\s*23%[^}]*height:\s*49%/u,
    );
    assert.match(
      source,
      /stageAlignmentWhodunnitPreview === "witness"\s*\? \[\s*"witness",\s*"prosecutionMini",\s*"defenseMini",\s*\]/u,
    );
    assert.doesNotMatch(
      source,
      /className=\{mysteryV2Styles\.witnessIdentity/u,
    );
    assert.match(
      mysteryV2Css,
      /:global\(\[data-whodunnit-court-preview\]\) \.wideEvidenceTable \{[^}]*bottom:\s*-4%[^}]*width:\s*42%/u,
    );
    assert.match(source, /data-camera-view=\{stageAlignmentPreviewCamera\}/u);
    assert.match(source, /type DebateStageEvidenceView/u);
    assert.match(source, /stageAlignmentEvidenceOnlyCamera/u);
    assert.match(source, /data-alignment-evidence-only=/u);
    assert.match(source, /inert=\{stageAlignmentEvidenceOnlyCamera/u);
    assert.match(source, /Reset evidence/u);
    assert.match(
      source,
      /\$\{stageAlignmentPreviewCameraLabel\} debater close-up/u,
    );
    assert.match(
      source,
      /stageAlignmentPreviewCamera === "moderator"\s*\? alignmentCast\.filter\(\(entry\) => entry\.role === "moderator"\)/u,
    );
    assert.match(source, /Reset moderator/u);
    assert.match(source, /moderator bot, nameplate, and glyph plate/u);
    assert.match(
      pageCss,
      /:global\(\[data-camera-view="wide"\]\)[\s\S]{0,260}data-debate-role="moderator"/u,
    );
    assert.match(
      pageCss,
      /:global\(\[data-camera-view="moderator"\]\)[\s\S]{0,260}data-debate-role="moderator"/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-role="moderator"\][\s\S]{0,160}\.zenLiveBotPresenceFaceRig[\s\S]{0,340}--debate-moderator-face-only-offset-y/u,
    );
    assert.doesNotMatch(
      pageCss,
      /data-debate-role="moderator"\][\s\S]{0,240}data-avatar-details-mask/u,
    );
    assert.match(source, /DEBATE_STAGE_ALIGNMENT_ITEMS\.map/u);
    assert.match(source, /className=\{styles\.alignmentItemToggle\}/u);
    assert.match(source, /data-alignment-item="bot"/u);
    assert.match(source, /data-alignment-item="nameplate"/u);
    assert.match(source, /data-alignment-item="glyph"/u);
    assert.match(source, /data-debate-stage-sound-check=\{role\}/u);
    assert.match(
      source,
      /aria-label=\{`Sound check \$\{sourceBot\.name\} as \$\{DEBATE_STAGE_ALIGNMENT_LABELS\[role\]\}`\}/u,
    );
    assert.match(source, /aria-pressed=\{soundCheckState === "playing"\}/u);
    assert.match(source, /DEBATE_STAGE_SOUNDCHECK_MESSAGE_PREFIX/u);
    assert.match(source, /stepKey: "alignment_sound_check"/u);
    assert.match(source, /kind: "speech"/u);
    assert.match(source, /speakerBotId: bot\.id/u);
    assert.match(source, /voiceSourceBotId: bot\.id/u);
    assert.match(source, /lifecycle:\s*\{/u);
    assert.match(
      source,
      /onStart: \(durationMs, alignment\) => \{[\s\S]*updateSpeechTiming\(0, playbackDurationMs\)/u,
    );
    assert.match(
      source,
      /onProgress: \(elapsedMs, durationMs\) => \{[\s\S]*updateSpeechTiming\(elapsedMs, playbackDurationMs\)/u,
    );
    assert.match(source, /speechTiming: soundCheckSpeechTiming/u);
    assert.match(
      source,
      /data-speaking=\{\s*soundCheckPlaying \? "true" : undefined\s*\}/u,
    );
    assert.match(
      source,
      /data-turn-active=\{\s*soundCheckPlaying \? "true" : undefined\s*\}/u,
    );
    assert.match(
      source,
      /debateStageAlignmentTarget\("moderator", item, "moderator"\)/u,
    );
    assert.match(
      source,
      /const defaultOffset = debateStageAlignmentOffset\(\s*DEFAULT_DEBATE_STAGE_ALIGNMENT,\s*target,\s*\)/u,
    );
    assert.match(
      source,
      /updateStageAlignmentTarget\(\s*target,\s*defaultOffset,\s*\)/u,
    );
    assert.match(source, /Copy alignment defaults/u);
    assert.match(source, /\? "Copied"/u);
    assert.match(
      source,
      /Place Forum, Court, and Jury elements directly\. Save one\s*layout for this account and device; live presentation and\s*replay share it\. Copy alignment defaults exports a\s*source-ready V14 block without changing shipped defaults\./u,
    );
    assert.match(source, /formatDebateStageAlignmentClipboard/u);
    assert.match(source, /type="range"/u);
    assert.match(source, /writeDebateStageAlignment/u);
    assert.match(source, /DEBATE_STAGE_LIGHT_BLEND_MODES\.map/u);
    assert.match(source, /className=\{styles\.alignmentLightingBlendSelect\}/u);
    assert.match(
      source,
      /aria-label=\{`\$\{label\} Debate light blend mode`\}/u,
    );
    assert.match(
      source,
      /value=\{\s*stageAlignmentDraft\.lightBlendModes\[theme\]\s*\}/u,
    );
    assert.match(source, /value as DebateStageLightBlendMode/u);
    assert.match(source, /updateDebateStageLightBlendMode/u);
    assert.match(source, /aria-label="Debate moderator gavel controls"/u);
    assert.match(source, /updateDebateStageGavelPose/u);
    assert.match(source, /aria-label="Debate evidence placement controls"/u);
    assert.match(source, /updateDebateStageEvidenceTable/u);
    assert.match(source, /data-debate-evidence-tuner="true"/u);
    assert.match(source, /data-debate-evidence-alignment-preview=\{/u);
    assert.match(source, /pickDebateStageAlignmentEvidenceEmoji/u);
    assert.match(source, /stageAlignmentPreviewEvidenceEmoji/u);
    assert.match(source, /Copy evidence JSON/u);
    assert.match(source, /formatDebateStageEvidenceTableClipboard/u);
    assert.match(source, /data-debate-evidence-copy="true"/u);
    assert.match(source, /data-debate-evidence-reshuffle="true"/u);
    assert.match(source, /aria-label="Evidence asset to align"/u);
    assert.match(source, /data-debate-evidence-kind-toggle=\{evidenceKind\}/u);
    assert.match(source, /stageAlignmentPreviewEvidenceKind/u);
    assert.match(source, /Source pamphlet/u);
    assert.match(source, /The Public Record/u);
    assert.match(source, /example\.org\/research\/briefing/u);
    assert.match(
      source,
      /evidenceTable\[stageAlignmentPreviewEvidenceKind\]\[\s*evidenceAlignmentView\s*\]/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\s*\{[^}]*--debate-evidence-offset-x/u,
    );
    assert.match(css, /\.evidencePedestal\s*\{[^}]*--debate-evidence-scale/u);
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-view="moderator"\]\s*\{[^}]*--debate-moderator-evidence-offset-x/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-view="left"\]\s*\{[^}]*--debate-left-evidence-offset-x/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-view="right"\]\s*\{[^}]*--debate-right-evidence-offset-x/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-kind="source"\]\s*\{[^}]*--debate-source-evidence-offset-x/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-kind="source"\]\[data-evidence-view="moderator"\]\s*\{[^}]*--debate-moderator-source-evidence-offset-x/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-kind="source"\]\[data-evidence-view="left"\]\s*\{[^}]*--debate-left-source-evidence-offset-x/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-kind="source"\]\[data-evidence-view="right"\]\s*\{[^}]*--debate-right-source-evidence-offset-x/u,
    );
    assert.match(css, /\.evidencePedestalDocument\s*\{/u);
    assert.match(
      css,
      /\.evidencePedestalDocument\s*\{[^}]*rotate\(var\(--debate-evidence-prop-rotate/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\s*\{[^}]*width:\s*clamp\(36px/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\[data-source-kind="url"\]\s*\{[^}]*width:\s*clamp\(48px[^}]*aspect-ratio:\s*1\.42/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\[data-source-kind="url"\]::after\s*\{[^}]*clip-path:\s*polygon\(0 0, 100% 0, 50% 78%\)/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\[data-source-kind="url"\][\s\S]{0,100}\.evidencePedestalDocumentHardware\s*\{[^}]*border-radius:\s*50%/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\[data-source-kind="scholar"\]\s*\{[^}]*width:\s*clamp\(39px[^}]*border-radius:\s*2px 5px 5px 2px/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\[data-source-kind="scholar"\]::after\s*\{[^}]*repeating-linear-gradient/u,
    );
    assert.match(
      css,
      /\.evidencePedestalDocument\[data-source-kind="scholar"\][\s\S]{0,100}\.evidencePedestalDocumentHardware\s*\{[^}]*box-shadow:[^}]*0 20px/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="dark"\][\s\S]{0,140}\[data-source-kind="url"\]/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="dark"\][\s\S]{0,140}\[data-source-kind="scholar"\]/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-kind="source"\]:not\([\s\S]{0,80}\[data-evidence-view="wide"\][\s\S]{0,80}\)[\s\S]{0,120}\.evidencePedestalDocument\s*\{[^}]*translateY\(10%\)\s+scale\(1\.55\)/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-kind="source"\]:not\([\s\S]{0,80}\[data-evidence-view="wide"\][\s\S]{0,80}\)[\s\S]{0,180}\.evidencePedestalDocumentDetails\s*\{[^}]*display:\s*flex/u,
    );
    assert.doesNotMatch(
      css,
      /\.evidencePedestal\[data-evidence-kind="exhibit"\]\[data-evidence-view="moderator"\]/u,
    );
    assert.doesNotMatch(css, /\.evidencePedestalDocumentMark\s*\{/u);
    assert.match(css, /\.evidencePedestal\s*\{[^}]*drop-shadow/u);
    assert.match(css, /\.evidenceAlignmentPreviewEmoji\s*\{/u);
    assert.match(
      css,
      /\.evidenceAlignmentPreviewEmoji\s*\{[^}]*transform:\s*translateY\(8%\)/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\s+\.evidencePedestalSprite\s*>\s*img\s*\{[^}]*object-position:\s*center\s+42%[^}]*transform:\s*translateY\(-8%\)[^}]*filter:\s*none/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\s*>\s*button\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center/u,
    );
    assert.match(
      css,
      /\.evidencePedestalLabel\s*\{[^}]*clip:\s*rect\(0,\s*0,\s*0,\s*0\)/u,
    );
    assert.doesNotMatch(
      css,
      /\.evidencePedestalLabel\s*\{[^}]*top:\s*calc\(100%/u,
    );
    assert.doesNotMatch(css, /\.evidencePedestalTable\s*\{/u);
    assert.match(source, /aria-label="Gavel pose to align"/u);
    assert.match(source, /data-debate-gavel-pose=\{pose\}/u);
    assert.match(source, /pose === "lowered" \? "Lowered" : "Raised"/u);
    assert.match(source, /data-debate-gavel-link="true"/u);
    assert.match(source, /aria-pressed=\{stageAlignmentGavelPosesLinked\}/u);
    assert.match(source, /"Unlock gavel poses"/u);
    assert.match(source, /"Lock gavel poses"/u);
    assert.match(
      source,
      /\{\s*\[control\.key\]: nextValue,\s*\},\s*stageAlignmentGavelPosesLinked,/u,
    );
    assert.match(source, /label: "Rotation"/u);
    assert.match(source, /label: "Size"/u);
    assert.match(source, /value = activeGavelPose\[control\.key\]/u);
    assert.match(source, /Copy gavel JSON/u);
    assert.match(source, /formatDebateStageGavelClipboard/u);
    assert.match(source, /data-debate-gavel-copy="true"/u);
    assert.match(source, /aria-label="Preview and export moderator gavel"/u);
    assert.match(source, /data-debate-gavel-test="attention"/u);
    assert.match(source, /data-debate-gavel-test="order"/u);
    assert.match(source, /previewStageAlignmentGavel\("attention"\)/u);
    assert.match(source, /previewStageAlignmentGavel\("order"\)/u);
    assert.match(source, /cue=\{stageAlignmentGavelCue\}/u);
    assert.match(
      source,
      /controllerHandleRef=\{stageAlignmentAtmosphereControllerRef\}/u,
    );
    assert.match(
      source,
      /sessionKey=\{`debate-alignment:\$\{session\?\.id \?\? props\.storageScopeId\}`\}/u,
    );
    assert.match(source, /label: "Horizontal"/u);
    assert.match(source, /label: "Vertical"/u);
    assert.match(
      source,
      /aria-label=\{`\$\{stageAlignmentGavelPose\} gavel \$\{control\.label\.toLowerCase\(\)\}`\}/u,
    );
    assert.match(source, /aria-label="Debate light color mask controls"/u);
    assert.match(source, /updateDebateStageLightMaskOpacity/u);
    assert.match(source, /Debate color mask opacity/u);
    assert.match(source, /Saved separately for Light and Dark/u);
    assert.match(
      source,
      /style=\{debateStageAlignmentStyle\(stageAlignment\)\}/u,
    );
    assert.match(page, /storageScopeId=\{user\?\.id \?\? "signed-out"\}/u);
    assert.match(
      source,
      /styles\.alignmentForum[\s\S]*className=\{styles\.alignmentTuner\}/u,
    );
    assert.match(
      css,
      /\.alignmentViewportColumn\s*\{[^}]*calc\(min\(1760px,\s*calc\(100vw - 32px\)\) - 448px\)/u,
    );
    assert.doesNotMatch(css, /\.alignmentForum\s*\{[^}]*aspect-ratio:/u);
    assert.doesNotMatch(css, /\.alignmentForum\s*\{[^}]*min-height:/u);
    assert.match(css, /\.alignmentTuner\s*\{[^}]*position:\s*relative/u);
    assert.match(css, /\.alignmentTunerRoleActions\s*\{[^}]*display:\s*flex/u);
    assert.match(
      css,
      /\[data-debate-stage-sound-check\]\[data-sound-check-state="playing"\]/u,
    );
    assert.match(
      css,
      /\.alignmentLightingTuner,[\s\S]{0,120}\.alignmentVoiceMixer,[\s\S]{0,120}\.alignmentWhodunnitTuner\s*\{[^}]*grid-template-columns:\s*auto minmax\(0,\s*1fr\) auto/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]*?--debate-moderator-view-nameplate-offset-x/u,
    );
    assert.match(css, /--debate-for-glyph-offset-x/u);
    assert.match(css, /--debate-against-nameplate-offset-y/u);
    assert.match(css, /--debate-light-mask-opacity-dark/u);
    assert.match(css, /--debate-light-mask-opacity-light/u);
    assert.match(
      css,
      /\.alignmentViewToggle,[\s\S]*?\.alignmentThemeToggle\s*\{[^}]*border-radius:\s*999px/u,
    );
    assert.doesNotMatch(
      css,
      /\.alignmentTuner\s*\{[^}]*position:\s*(?:absolute|fixed)/u,
    );
  });

  it("snapshots stage alignment updater input values before queueing state updates", () => {
    assert.match(
      source,
      /const nextModeratorMicroScale = Number\(\s*event\.currentTarget\.value,?\s*\);[\s\S]{0,260}updateDebateStageModeratorMicroScale\([\s\S]{0,160}nextModeratorMicroScale/u,
    );
    assert.doesNotMatch(
      source,
      /setStageAlignmentDraft\(\(current\) =>[\s\S]{0,260}event\.currentTarget\.value/u,
    );
  });

  it("keeps both themes and the global companion aware of the Debate surface", () => {
    assert.match(source, /data-theme=\{props\.theme\}/u);
    assert.match(css, /\.lobby\[data-theme="light"\]/u);
    assert.match(css, /\.setup\[data-theme="light"\]/u);
    assert.match(page, /surfaceId: "debate"/u);
  });

  it("uses the shared app navbar and a dedicated scrolling content region", () => {
    const debatePage = page.slice(
      page.lastIndexOf(
        'if (view === "debate") {',
        page.indexOf('if (view === "coffee") return renderCoffeeShell();'),
      ),
      page.indexOf('if (view === "coffee") return renderCoffeeShell();'),
    );
    assert.match(page, /data-debate-shell="true"/u);
    assert.match(
      page,
      /renderSharedAppletNavbar\("Debate tools",\s*\{[\s\S]*brandAppletId:\s*"debate"[\s\S]*showVoiceSelector:\s*true[\s\S]*liveSessionName:\s*"Debate"[\s\S]*\(\["local", "online"\] as const\)\.map[\s\S]*<ComposerModelPicker/u,
    );
    assert.match(
      page,
      /options\.brandAppletId[\s\S]*renderSharedAppletBrand\(options\.brandAppletId\)/u,
    );
    assert.match(page, /data-response-mode=\{debateNavbarResponseMode\}/u);
    assert.match(page, /responseMode=\{debateResponseMode\}/u);
    assert.match(source, /responseMode:\s*props\.responseMode/u);
    assert.match(source, /event\.autoRecovery/u);
    assert.match(source, /All configured Auto models failed|Recovered with/u);
    assert.match(page, /Picks model & effort/u);
    assert.doesNotMatch(debatePage, /Account default|Uses the account model/u);
    assert.doesNotMatch(debatePage, /Cast models/u);
    assert.match(
      page,
      /onLiveSessionActiveChange=\{\(active, sessionId\) => \{[\s\S]{0,120}setDebateLiveSessionActive\(active\)[\s\S]{0,120}setDebateLiveSessionId\(active \? sessionId : null\)/u,
    );
    assert.match(
      source,
      /const liveSessionActive =\s*view === "baking" \|\|\s*\(\(view === "live" \|\| view === "mystery"\) && activeSession !== null\)/u,
    );
    assert.match(source, /modelOverride:\s*props\.modelOverride\?\.model/u);
    assert.doesNotMatch(source, /className=\{styles\.privacyBadge\}/u);
    assert.match(page, /data-debate-scroll-region="true"/u);
    assert.match(
      pageCss,
      /\.debateMain\s*\{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/u,
    );
    assert.match(
      pageCss,
      /\.appLayout\.debateShell\s+\.debateMain\s*>\s*\.sharedAppletHeader\s*\{[^}]*height:\s*auto[^}]*position:\s*relative/u,
    );
    assert.match(pageCss, /\.debateScrollRegion\s*\{[^}]*overflow-y:\s*auto/u);
    assert.match(
      css,
      /@media \(min-width: 901px\)\s*\{[\s\S]*\.setupActions\s*\{[^}]*padding-right:\s*104px/u,
    );
    assert.doesNotMatch(
      css,
      /\.lobby,\s*\.setup,\s*\.live\s*\{[^}]*min-height:\s*100vh/u,
    );
  });

  it("keeps gallery walk-in during return buffering and skips bake restart on bookmark", () => {
    assert.match(
      source,
      /const skipBakeRestartOnBookmark = restoreMidPauseEventId !== null/u,
    );
    assert.match(source, /waitForDebateGalleryArrival\(/u);
    assert.match(source, /holdScope="stage"/u);
    assert.doesNotMatch(
      source,
      /progressRatio:\s*1,\s*[\s\S]{0,80}bakeUnlocked:\s*true/u,
    );
    assert.match(
      source,
      /restartSpectatorBakeIfNeeded\(result\.session, "resume"\)/u,
    );
    assert.match(
      source,
      /restartSpectatorBakeIfNeeded\(polled\.session, "stale-poll"\)/u,
    );
    assert.match(source, /async function preloadDebateOpeningSceneAssets/u);
    assert.match(
      source,
      /DEBATE_SCENE_RASTERS_BY_THEME[\s\S]{0,700}forum-light-mask\.png[\s\S]{0,500}coffee-table\/table_dark\.png/u,
      "dark openings preload the CSS masks and transparent Jury table too",
    );
    assert.match(
      source,
      /querySelectorAll<HTMLImageElement>\([\s\S]{0,120}data-debate-stage-viewport="live"[\s\S]{0,240}image\.decode\(\)/u,
      "mounted avatar, evidence, and gavel images decode behind the arrival mask",
    );
    assert.ok(
      (source.match(/await openingVisualAssetsReady;/gu) ?? []).length >= 4,
      "every gallery/bake opening waits for visual assets before revealing the stage",
    );
  });

  it("lets a returning title card start from a prepared turn checkpoint", () => {
    assert.match(source, /debateTurnCheckpointsFromSession\(session\)/u);
    assert.match(source, /holdCheckpoints=\{/u);
    assert.match(
      source,
      /titleCardPlayheadEventId \?\?[\s\S]{0,80}result\.session\.pausedPresentationEventId/u,
    );
    assert.match(source, /resumeCeremonyActive:/u);
    assert.match(source, /const jumpedFromBookmark =/u);
    assert.match(css, /\.identHoldCheckpoint\s*\{/u);
  });

  it("keeps spectator bake-ahead from blocking unheard floor playback", () => {
    assert.match(source, /function debateSessionThroughPlayhead/u);
    assert.match(source, /presentUnheardSpectatorTail/u);
    assert.match(
      source,
      /const playheadPrevious = debateSessionThroughPlayhead/u,
    );
    assert.match(
      source,
      /void preloadDebateVoiceRunway\(\s*polled\.session,\s*freshRunway\.slice\(0, 1\),/u,
    );
    assert.match(source, /spectatorUnheardPresentable\.length === 0/u);
  });
});
