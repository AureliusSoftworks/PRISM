import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEBATE_SCHEMA_VERSION } from "@localai/shared";
import {
  copyDebateMotionSlate,
  debateAlignmentPreviewCast,
  debatePrefilledCast,
} from "./debateExperienceState.ts";

const source = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("./DebateExperience.module.css", import.meta.url)),
  "utf8",
);
const scene = readFileSync(
  fileURLToPath(new URL("./DebateForumScene.tsx", import.meta.url)),
  "utf8",
);
const page = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);
const pageCss = readFileSync(
  fileURLToPath(new URL("./page.module.css", import.meta.url)),
  "utf8",
);

describe("Debate experience", () => {
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
  });

  it("keeps draft roles and fills incomplete alignment casts with unique stand-ins", () => {
    assert.deepEqual(
      debateAlignmentPreviewCast(["m", "f", "a", "extra"], {
        moderator: "m",
        forAdvocate: "",
        againstAdvocate: "a",
      }),
      {
        moderator: "m",
        forAdvocate: "f",
        againstAdvocate: "a",
      },
    );
    assert.deepEqual(
      debateAlignmentPreviewCast(["m", "f", "a"], {
        moderator: "missing",
        forAdvocate: "f",
        againstAdvocate: "f",
      }),
      {
        moderator: "m",
        forAdvocate: "f",
        againstAdvocate: "a",
      },
    );
    assert.equal(
      debateAlignmentPreviewCast(["m", "f"], {
        moderator: "m",
        forAdvocate: "f",
        againstAdvocate: "",
      }),
      null,
    );
  });

  it("registers synthesis with Prism while keeping a visible accessible action", () => {
    assert.match(source, /PrismRefractTarget target=\{synthesisMagic\}/u);
    assert.match(source, /data-tutorial-target="debate-synthesize"/u);
    assert.match(source, /Refract into motions/u);
  });

  it("offers all three recovery paths when an advocate declines", () => {
    assert.match(source, /Swap sides/u);
    assert.match(source, /Change bot/u);
    assert.match(source, /Revise motion/u);
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

  it("keeps setup in one non-gated studio console with a persistent launch circuit", () => {
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
      /studioPanel === "motion" \? renderMotionStep\(\) : null/u,
    );
    assert.match(
      source,
      /studioPanel === "cast" \? renderCastStep\(\) : null/u,
    );
    assert.match(
      source,
      /studioPanel === "evidence" \? renderEvidenceStep\(\) : null/u,
    );
    assert.match(source, /\{renderForumReadout\(\)\}/u);
    assert.match(source, /\{renderReviewStep\(\)\}/u);
    assert.match(source, /<BotPickerGrid/u);
    assert.match(source, /activeCastSlot/u);
    assert.match(source, /assignBotToCastSlot/u);
    assert.match(source, /Already cast/u);
    assert.match(source, /Hard-muted bots cannot moderate/u);
    assert.match(
      source,
      /className=\{styles\.studioUtilityButton\}[\s\S]*?onClick=\{openStageAlignment\}[\s\S]*?data-tutorial-target="debate-align-stage"/u,
    );
    assert.match(source, /\{renderStageAlignmentModal\(null\)\}/u);
    assert.match(
      source,
      /data-alignment-source=\{session \? "session" : "dashboard"\}/u,
    );
    assert.match(source, /current draft cast is shown/u);
    assert.match(page, /avatarDetails:\s*bot\.avatarDetails \?\? null/u);
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
  });

  it("keeps stable tutorial targets across the complete Duel workflow", () => {
    for (const target of [
      "debate-new",
      "debate-synthesize",
      "debate-cast",
      "debate-consent",
      "debate-evidence",
      "debate-readiness",
      "debate-start",
      "debate-case-board",
      "debate-camera",
      "debate-align-stage",
      "debate-copy-transcript",
    ]) {
      assert.match(source, new RegExp(target, "u"));
    }
  });

  it("keeps the live record bounded beside the compact forum", () => {
    assert.match(source, /formatDebateVerboseTranscript/u);
    assert.match(source, /Copy verbose transcript/u);
    assert.match(source, /className=\{styles\.transcriptFeed\}/u);
    assert.match(source, /className=\{styles\.debateRail\}/u);
    assert.match(
      css,
      /\.liveWorkspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(360px,\s*430px\)/u,
    );
    assert.match(css, /\.transcriptFeed\s*\{[^}]*overflow-y:\s*auto/u);
    assert.match(
      css,
      /\.debateRail\[data-completed="true"\]\s*\{[^}]*display:\s*grid[^}]*height:\s*calc\(100dvh - 124px\)[^}]*grid-template-rows:\s*minmax\(220px,\s*46%\)\s+minmax\(0,\s*1fr\)/u,
    );
    assert.match(
      css,
      /\.debateRail\[data-completed="true"\]\s+\.resultCard\s*\{[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/u,
    );
    assert.match(
      css,
      /\.botStagePresence\s*\{[^}]*width:\s*clamp\(126px,\s*11\.4vw,\s*180px\)/u,
    );
    const visibleKinds =
      source.match(
        /const DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS = new Set\(\[([\s\S]*?)\]\);/u,
      )?.[1] ?? "";
    assert.doesNotMatch(visibleKinds, /"ballot"|"verdict"/u);
  });

  it("raises player actions in a full-width command deck without reflowing proceedings", () => {
    assert.match(source, /data-player-window-active=/u);
    assert.match(
      source,
      /session\.status === "waiting_for_player" \? "true" : undefined/u,
    );
    assert.match(
      source,
      /session\.status === "waiting_for_player" \? \([\s\S]*?className=\{styles\.liveCommandDeck\}[\s\S]*?\{renderPlayerWindow\(session\)\}/u,
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

  it("gives paused, player, verdict, and failed proceedings visible stage states", () => {
    assert.match(source, /className=\{styles\.stageStateOverlay\}/u);
    for (const kind of ["paused", "player", "verdict", "failed"]) {
      assert.match(source, new RegExp(`data-kind="${kind}"`, "u"));
    }
    assert.match(source, /Forum suspended/u);
    assert.match(source, /The floor turns to you/u);
    assert.match(source, /The proceeding is sealed/u);
    assert.match(source, /No prevailing side/u);
    assert.match(css, /\.stageStateOverlay\s*\{[^}]*position:\s*absolute/u);
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
    assert.match(source, /debateSourceFromMarkdownHref/u);
    assert.match(source, /new ResizeObserver/u);
    assert.match(source, /debateTranscriptIsAtLive/u);
    assert.match(source, /↓ Live/u);
    assert.match(source, /cancelCurrentPresentation/u);
    assert.match(
      source,
      /event\.sequence < pausedPresentationEvent\.sequence/u,
    );
    assert.match(source, /lifecycle:\s*\{[\s\S]*onProgress/u);
    assert.match(page, /utterance\.lifecycle \?\? \{\}/u);
    assert.match(css, /\.transcriptMarkdown/u);
    assert.match(css, /\.returnToLiveButton/u);
  });

  it("allows live Participant interjections and gives the moderator the ruling", () => {
    assert.match(source, /\/interject/u);
    assert.match(source, /Interject now/u);
    assert.match(source, /The moderator will rule after you cut in/u);
    assert.match(source, /"interjection"/u);
    assert.match(source, /"moderator_ruling"/u);
    assert.match(source, /debateGalleryReactingIndices/u);
    assert.match(source, /data-listening-reaction/u);
    assert.match(source, /Moderator transition/u);
    assert.match(source, /className=\{styles\.floorStatus\}/u);
    assert.match(css, /\.interjectionBar/u);
    assert.match(css, /\.floorStatus/u);
  });

  it("does not let the case board reveal a claim before the room hears it", () => {
    assert.match(source, /function debateCaseBoardAtSequence/u);
    assert.match(source, /event\.sequence <= visibleThroughSequence/u);
    assert.match(source, /Scoreless · heard speech only/u);
    assert.match(
      source,
      /debateCaseBoardAtSequence\(\s*session,\s*transcriptVisibleThroughSequence/u,
    );
  });

  it("renders a seven-member nonbinding generic Prism gallery", () => {
    assert.match(source, /DEBATE_GALLERY_COLORS/u);
    assert.match(source, /7 of many · nonbinding/u);
    assert.match(source, /Session-only reactions/u);
    assert.match(
      source,
      /props\.renderBotGlyph\("lucideTriangle",\s*\{[\s\S]{0,100}size: 24/u,
    );
    assert.match(css, /grid-template-columns:\s*repeat\(7,/u);
  });

  it("uses authored Light and Dark receivers with adaptive masked fallback", () => {
    assert.match(css, /forum-dark\.webp/u);
    assert.match(css, /forum-light\.webp/u);
    assert.match(css, /forum-dark-foreground\.png/u);
    assert.match(css, /forum-light-foreground\.png/u);
    assert.match(css, /\.botPosition\s*\{[^}]*z-index:\s*3/u);
    assert.match(css, /\.podiumForeground\s*\{[^}]*z-index:\s*4/u);
    assert.match(css, /\.forumScene\s*\{[^}]*z-index:\s*5/u);
    assert.match(
      css,
      /\.lightMaskFor,[\s\S]*?\.lightMaskModerator\s*\{[^}]*inset:\s*0[^}]*z-index:\s*5/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.lightMaskFor\s*\{[^}]*ellipse at 16% 54%[^}]*clip-path:\s*polygon\(0 2%,\s*32% 0,\s*29% 96%,\s*0 100%\)/u,
    );
    assert.match(source, /className=\{styles\.podiumForeground\}/u);
    assert.match(source, /cameraView=\{stageAlignmentPreviewCamera\}/u);
    assert.match(source, /cameraView=\{cameraView\}/u);
    assert.match(scene, /cameraView:\s*DebateForumCameraView/u);
    assert.match(
      scene,
      /const moderatorCamera = this\.state\.cameraView === "moderator"/u,
    );
    assert.match(scene, /sceneId: "debate-forum"/u);
    assert.match(scene, /role: DebateForumRole/u);
    assert.match(css, /data-renderer-status="webgl"/u);
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
    assert.match(page, /showThinkingSpinner=\{avatarState\.thinking\}/u);
    assert.match(page, /isTalking=\{debateMouthActive\}/u);
    assert.match(page, /avatarDetails=\{botSnapshot\.avatarDetails\}/u);
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\s*\{[^}]*--zen-live-bot-avatar-size:\s*100%[^}]*--zen-live-bot-face-y:\s*43\.8%[^}]*--zen-live-bot-face-scale:\s*1\.68/u,
    );
    assert.match(
      pageCss,
      /\.zenLiveBotPresencePlate\s*\{[^}]*--coffee-bot-color:\s*var\(--bot-color,\s*var\(--accent\)\)/u,
    );
  });

  it("uses a compact expressive moderator and inset turn-owned podium screens", () => {
    assert.match(source, /debateTurnOwnerBotId\(\{/u);
    assert.match(
      source,
      /thinkingBotId,\s*presenting,\s*presentationSpeakerBotId:\s*activeSpeakerId/u,
    );
    assert.match(
      source,
      /compact:\s*role === "moderator" &&\s*cameraView !== "moderator"/u,
    );
    assert.match(source, /compact:\s*role === "moderator"/u);
    assert.match(source, /className=\{styles\.podiumGlyphPosition\}/u);
    assert.match(source, /className=\{styles\.podiumGlyphScreen\}/u);
    assert.match(
      source,
      /data-turn-active=\{\s*turnOwnerBotId === bot\.id \? "true" : undefined/u,
    );
    assert.match(source, /lookAtRole:/u);
    assert.match(page, /const moderatorLookAtRole =/u);
    assert.match(
      page,
      /moderatorLookAtRole === "for"[\s\S]*moderatorLookAtRole === "against"/u,
    );
    assert.match(
      page,
      /data-debate-compact=\{\s*avatarState\.compact \? "true" : undefined/u,
    );
    assert.match(
      page,
      /detailLevel=\{avatarState\.compact \? "reduced" : "full"\}/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s*\{[^}]*--zen-live-bot-avatar-body-size:\s*70%[^}]*--zen-live-bot-face-y:\s*51\.5%[^}]*--zen-live-bot-face-scale:\s*1\.6/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\][\s\S]*?\.zenLiveBotPresenceBody\[data-avatar-details-visuals="true"\]\s*\{[^}]*--zen-live-bot-face-thumbnail-scale:\s*0\.88[^}]*--zen-live-bot-face-thumbnail-offset-y:\s*2\.5%/u,
    );
    assert.match(
      page,
      /data-avatar-details-visuals=\{\s*hasAvatarDetailsVisuals \? "true" : undefined/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\][\s\S]*?\.zenLiveBotPresenceFace\s*\{[^}]*border:\s*1px solid[^}]*var\(--coffee-bot-color\)\s+28%,\s*#56616e\s+72%[^}]*radial-gradient/u,
    );
    assert.doesNotMatch(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\][\s\S]*?\.zenLiveBotPresenceFace\s*\{[^}]*2px solid rgba\(244,\s*246,\s*250,\s*0\.92\)/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate \.botFaceFrameLed\s*\{[^}]*background:\s*var\(--coffee-bot-color\)[^}]*mask-image:\s*url\("\/bot-frame\/bot-frame-led\.png\?v=1000"\)[^}]*drop-shadow/u,
    );
    assert.match(
      page,
      /\.\.\.botAccentStyle\(\s*botSnapshot\.color \?\? PRISM_DEFAULT_ACCENT,\s*resolvedTheme,\s*\)/u,
    );
    assert.match(
      pageCss,
      /\.debateBotPresencePlate\[data-debate-compact="true"\]\s+\.botFaceFrame[\s\S]*?display:\s*none/u,
    );
    assert.match(css, /\.podiumGlyphPosition\s*\{[^}]*z-index:\s*5/u);
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
      /\.podiumGlyphPosition\[data-turn-active="true"\]\s*\{[^}]*drop-shadow/u,
    );
  });

  it("adds sparse formal vocal Foley without granting it the floor", () => {
    assert.match(source, /<SessionAtmosphereLayer/u);
    assert.match(source, /DEBATE_VOCAL_FOLEY_PROFILE/u);
    assert.match(source, /minDelayMs: 28_000/u);
    assert.match(source, /maxDelayMs: 58_000/u);
    assert.match(source, /ambientFoley=\{false\}/u);
    assert.match(source, /ambientBotVocalizations/u);
    assert.match(source, /debateVocalFoleyTargetId\(\{/u);
    assert.match(source, /active: bot\.id === activeSpeakerId/u);
    assert.match(source, /hardMuted:/u);
    assert.match(source, /data-vocal-foley/u);
    assert.match(page, /avatarState\.foleyMouthShape \?\? "closed"/u);
    assert.match(page, /DEBATE_FORUM_VOICE_ROOM_SEND/u);
    assert.match(page, /playbackSurface === "debate"/u);
    assert.match(page, /"debate",\s*\);/u);
  });

  it("directs an instant Auto camera and four manual cameras without breaking podium occlusion", () => {
    assert.match(
      source,
      /type DebateCameraView = "wide" \| "left" \| "moderator" \| "right"/u,
    );
    assert.match(source, /type DebateCameraMode = "auto" \| DebateCameraView/u);
    assert.match(source, /const DEBATE_CAMERA_VIEWS/u);
    assert.match(source, /\{ id: "auto", label: "Auto" \}/u);
    assert.match(source, /useState<DebateCameraMode>\("auto"\)/u);
    assert.match(
      source,
      /if \(activeRole === "for"\) return "left";[\s\S]*if \(activeRole === "moderator"\) return "moderator";[\s\S]*if \(activeRole === "against"\) return "right";[\s\S]*return "wide";/u,
    );
    assert.match(
      source,
      /cameraMode === "auto" \? debateAutoCameraView\(activeRole\) : cameraMode/u,
    );
    assert.match(source, /data-camera-view=\{cameraView\}/u);
    assert.match(source, /data-camera-mode=\{cameraMode\}/u);
    assert.match(source, /aria-label="Debate stage cameras"/u);
    assert.match(source, /data-tutorial-target="debate-camera"/u);
    assert.match(
      source,
      /className=\{styles\.forumCamera\}[\s\S]*className=\{styles\.podiumForeground\}/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="left"\]\s*\{[^}]*translate3d\(35%,\s*-10%,\s*0\)\s*scale\(1\.48\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s*\{[^}]*translate3d\(0,\s*0,\s*0\)\s*scale\(1\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="right"\]\s*\{[^}]*translate3d\(-35%,\s*-10%,\s*0\)\s*scale\(1\.48\)/u,
    );
    assert.match(css, /\.forumCamera\s*\{[^}]*transition:\s*transform 900ms/u);
    assert.match(
      css,
      /\.forumCamera\[data-camera-mode="auto"\]\s*\{[^}]*transition:\s*none/u,
    );
    assert.match(
      css,
      /\.botPosition\[data-role="moderator"\]\s+\.botStagePresence\s*\{[^}]*width:\s*clamp\(53px,\s*4\.65vw,\s*74px\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.botPosition\[data-role="moderator"\]\s+\.botStagePresence\s*\{[^}]*width:\s*clamp\(106px,\s*9\.3vw,\s*148px\)/u,
    );
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\]\s+\.receiverMatte\s*\{[^}]*moderator-dark\.png/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\]\s+\.forumCamera\[data-camera-view="moderator"\]\s+\.receiverMatte\s*\{[^}]*moderator-light\.png/u,
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

  it("keeps the motion legible and clear of the Judge marker", () => {
    assert.match(
      css,
      /\.playerPresence\[data-role="judge"\]\s*\{[^}]*bottom:\s*14%/u,
    );
    assert.match(
      css,
      /\.motionPlinth\s*\{[^}]*color:\s*#f5f1f7[^}]*text-shadow:/u,
    );
    assert.match(
      css,
      /\.live\[data-theme="light"\]\s+\.motionPlinth\s*\{[^}]*color:\s*#211b26[^}]*text-shadow:/u,
    );
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

  it("provides a persistent Light and Dark stage alignment workspace", () => {
    assert.match(source, /Align stage/u);
    assert.match(source, /aria-label="More stage controls"/u);
    assert.match(source, /className=\{styles\.cameraAdvanced\}/u);
    assert.match(source, /data-debate-stage-alignment-modal="true"/u);
    assert.match(source, /Save alignment/u);
    assert.match(source, /Reset positions/u);
    assert.match(source, /Drag an item or use arrow keys to nudge by 0\.5%/u);
    assert.match(source, /\(\["light", "dark"\] as const\)/u);
    assert.match(source, /\(\["wide", "moderator"\] as const\)/u);
    assert.match(source, /aria-label="Debate alignment preview camera"/u);
    assert.match(source, /data-camera-view=\{stageAlignmentPreviewCamera\}/u);
    assert.match(
      source,
      /stageAlignmentPreviewCamera === "moderator"\s*\? alignmentCast\.filter\(\(entry\) => entry\.role === "moderator"\)/u,
    );
    assert.match(source, /Reset moderator/u);
    assert.match(source, /moderator bot, nameplate, and glyph plate/u);
    assert.match(source, /DEBATE_STAGE_ALIGNMENT_ITEMS\.map/u);
    assert.match(source, /className=\{styles\.alignmentItemToggle\}/u);
    assert.match(source, /data-alignment-item="bot"/u);
    assert.match(source, /data-alignment-item="nameplate"/u);
    assert.match(source, /data-alignment-item="glyph"/u);
    assert.match(
      source,
      /debateStageAlignmentTarget\("moderator", item, "moderator"\)/u,
    );
    assert.match(source, /Copy alignment data/u);
    assert.match(source, /formatDebateStageAlignmentClipboard/u);
    assert.match(source, /type="range"/u);
    assert.match(source, /writeDebateStageAlignment/u);
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
    assert.match(
      css,
      /\.forumCamera\[data-camera-view="moderator"\][\s\S]*?--debate-moderator-view-nameplate-offset-x/u,
    );
    assert.match(css, /--debate-for-glyph-offset-x/u);
    assert.match(css, /--debate-against-nameplate-offset-y/u);
    assert.match(
      css,
      /\.alignmentViewToggle,[\s\S]*?\.alignmentThemeToggle\s*\{[^}]*border-radius:\s*999px/u,
    );
    assert.doesNotMatch(
      css,
      /\.alignmentTuner\s*\{[^}]*position:\s*(?:absolute|fixed)/u,
    );
  });

  it("keeps both themes and the global companion aware of the Debate surface", () => {
    assert.match(source, /data-theme=\{props\.theme\}/u);
    assert.match(css, /\.lobby\[data-theme="light"\]/u);
    assert.match(css, /\.setup\[data-theme="light"\]/u);
    assert.match(page, /surfaceId: "debate"/u);
  });

  it("uses the shared app navbar and a dedicated scrolling content region", () => {
    assert.match(page, /data-debate-shell="true"/u);
    assert.match(
      page,
      /renderSharedAppletNavbar\("Debate tools",\s*\{[\s\S]*showVoiceSelector:\s*true[\s\S]*liveSessionName:\s*"Debate"[\s\S]*renderProviderModeToggle\([\s\S]*<ComposerModelPicker/u,
    );
    assert.match(page, /autoOptionLabel="Account default"/u);
    assert.match(page, /Uses the account model for the entire Debate\./u);
    assert.doesNotMatch(page, /Cast models/u);
    assert.match(
      page,
      /onLiveSessionActiveChange=\{setDebateLiveSessionActive\}/u,
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
});
