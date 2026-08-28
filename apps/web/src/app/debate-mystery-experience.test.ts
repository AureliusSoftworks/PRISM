import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  fillWhodunnitSuspectSeats,
  randomizeWhodunnitCast,
  randomizeWhodunnitFullCast,
  randomizeWhodunnitCastAroundBot,
  resolveWhodunnitSurpriseCast,
  surpriseWhodunnitSeatBotId,
  minimumWhodunnitBotsForCast,
  distinctWhodunnitCastBotIds,
} from "./debateMysteryCast.ts";
import {
  mysteryInvestigationTargetAt,
  mysteryRoomArtworkSrc,
} from "./debateMysteryRoomArt.ts";
import {
  whodunnitBundledRoomArtPath,
  whodunnitSavedRoomArtUrl,
} from "./debateMysteryInvestigationArt.ts";
import {
  mysteryMapOccupantPosition,
  mysteryRoomSuspectFacing,
  mysteryRoomSuspectWalkProfile,
} from "./debateMysteryRoomWalk.ts";
import {
  debateMysteryDeskFallbackPosition,
  debateMysteryDeskPositionFromClient,
  decodeDebateMysteryDeskDragPayload,
  encodeDebateMysteryDeskDragPayload,
  placeDebateMysteryDeskReference,
} from "./debateMysteryDeskDnD.ts";
import { DEBATE_MYSTERY_ROOM_TEMPLATES } from "@localai/shared";

const source = readFileSync(
  new URL("./DebateMysteryExperience.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
const evidenceDocumentSource = readFileSync(new URL("./DebateEvidenceDocument.tsx", import.meta.url), "utf8");
const forumCss = readFileSync(new URL("./DebateExperience.module.css", import.meta.url), "utf8");

function deterministicSequence(values: number[]): () => number {
  let index = 0;
  return () => {
    const next = values[index] ?? values[values.length - 1] ?? 0;
    index += 1;
    return Math.min(1, Math.max(0, next));
  };
}

function webpDimensions(file: Buffer): { width: number; height: number } {
  for (let offset = 12; offset + 18 <= file.length;) {
    const tag = file.toString("ascii", offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    if (tag === "VP8 ") {
      return {
        width: file.readUInt16LE(offset + 14) & 0x3fff,
        height: file.readUInt16LE(offset + 16) & 0x3fff,
      };
    }
    if (tag === "VP8L" && file[offset + 8] === 0x2f) {
      const bits = file.readUInt32LE(offset + 9);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("Expected a VP8 or VP8L WebP frame");
}

describe("Whodunnit Desk drag and drop", () => {
  it("round-trips a typed Desk reference without breaking ids that contain colons", () => {
    const encoded = encodeDebateMysteryDeskDragPayload({ kind: "evidence", id: "room:object:7" });
    assert.deepEqual(decodeDebateMysteryDeskDragPayload(encoded), {
      kind: "evidence",
      id: "room:object:7",
    });
    assert.equal(decodeDebateMysteryDeskDragPayload("not-a-desk-item"), null);
  });

  it("places drops at the pointer while keeping the physical item on the table", () => {
    assert.deepEqual(debateMysteryDeskPositionFromClient({
      clientX: 300,
      clientY: 250,
      left: 100,
      top: 100,
      width: 400,
      height: 300,
    }), { x: 50, y: 50 });
    assert.deepEqual(debateMysteryDeskPositionFromClient({
      clientX: -100,
      clientY: 900,
      left: 100,
      top: 100,
      width: 400,
      height: 300,
    }), { x: 18, y: 78.67 });
  });

  it("gives click and keyboard placement a physical stagger instead of fixed slots", () => {
    assert.notDeepEqual(debateMysteryDeskFallbackPosition(0), debateMysteryDeskFallbackPosition(1));
    assert.notDeepEqual(debateMysteryDeskFallbackPosition(1), debateMysteryDeskFallbackPosition(7));
  });

  it("moves an existing reference instead of duplicating it", () => {
    const reference = { kind: "lead" as const, id: "lead-1", label: "Timeline" };
    const first = placeDebateMysteryDeskReference([], reference, { x: 20, y: 30 });
    const moved = placeDebateMysteryDeskReference(first, reference, { x: 72, y: 64 });
    assert.equal(moved.length, 1);
    assert.deepEqual(moved[0], { reference, x: 72, y: 64, z: 2 });
  });
});

describe("Debate Whodunnit experience", () => {
  it("uses a separate investigation surface and resumes it directly from Archive", () => {
    assert.match(shell, /type DebateView = "dashboard" \| "live" \| "baking" \| "mystery"/u);
    assert.match(shell, /session\.format === "whodunnit"[\s\S]*setView\("mystery"\)/u);
    assert.doesNotMatch(shell, /DebateMysterySetup|mysterySetupOpen|setMysterySetupOpen/u);
    assert.match(shell, /<DebateMysteryPlay/u);
  });

  it("keeps Whodunnit in Debate Studio with a cast public Judge and a sealed PRISM Casekeeper", () => {
    assert.match(shell, /setFormat\("whodunnit"\)/u);
    assert.doesNotMatch(shell, /setMysterySetupOpen\(true\)/u);
    assert.match(shell, /label: format === "whodunnit" \? "Setup" : "Motion"/u);
    assert.match(shell, /studioPanel === "cast" \? renderCastStep\(\)/u);
    assert.match(shell, /\(role === "judge" && format === "whodunnit"\)/u);
    assert.match(shell, /cast a public Judge separately/u);
    assert.match(shell, /Participation feedback/u);
    assert.match(shell, /"coach",\s*"Coach"/u);
    assert.match(shell, /"standard",\s*"Standard"/u);
    assert.match(shell, /"immersive",\s*"Immersive"/u);
    assert.match(shell, /format === "whodunnit"[\s\S]{0,80}\? "The Court"/u);
    assert.match(shell, /useState\("recipe-initial"\)/u);
    assert.match(shell, /setMysteryNonce\(nextMysteryRecipeNonce\(\)\);\s*\}, \[\]\);/u);
    assert.doesNotMatch(shell, /useState\(nextMysteryRecipeNonce\)/u);
  });

  it("uses shared Debate court controls and the existing page-two BotPicker for every Whodunnit seat", () => {
    assert.match(shell, /<DebateCourtFormalityControl/u);
    assert.match(shell, /<BotPickerToolbar/u);
    assert.match(shell, /<BotPickerGrid/u);
    assert.match(shell, /<BotPickerTile/u);
    assert.match(shell, /mysterySuspectBotIds\.map/u);
    assert.match(shell, /mysteryJudgeBotId/u);
    assert.match(shell, /mysteryProsecutorBotId/u);
    assert.match(shell, /mysteryRivalDefenseBotId/u);
    assert.match(shell, /\? "Jury Trial"/u);
    assert.match(shell, /data-role-group="suspects"/u);
    assert.match(shell, /data-role-group="courtroom"/u);
    assert.match(shell, /Four jurors \+ moderator/u);
    assert.doesNotMatch(css, /\.courtRules/u);
    assert.doesNotMatch(css, /\.courtJuryToggle/u);
  });

  it("enters the audible live courtroom before the Whodunnit intro gavel", () => {
    assert.match(
      shell,
      /if \(session\.playerRole === "participant"\)[\s\S]{0,700}setView\("live"\)[\s\S]{0,500}adoptSession\(null, session, \{ playIntro: true \}\)/u,
    );
    assert.match(
      shell,
      /setSpectatorBakeStartedAt\(null\);\s*setView\("live"\);[\s\S]{0,420}adoptSession\(filedSession, bakedSession, \{ playIntro: true \}\)/u,
    );
    assert.match(shell, /function debateSessionUsesFullBake[\s\S]{0,100}session\.playerRole === "spectator"/u);
  });

  it("releases investigation media while carrying evidence into the court preload", () => {
    assert.match(source, /releaseDebateMysteryInvestigationMedia\(investigationAssetRootRef\.current\)/u);
    assert.match(source, /assetRetention="evidence"/u);
    assert.match(shell, /debateMysteryCourtEvidenceAssetUrls\(session\)\.map\(preloadDebateVisualAsset\)/u);
    assert.match(shell, /await openingVisualAssetsReady;[\s\S]{0,260}adoptSession\(null, session, \{ playIntro: true \}\)/u);
  });

  it("opens with a clear persisted choice between owning the mansion and trusting co-counsel", () => {
    assert.match(source, /state\.investigationApproach === "undecided"/u);
    assert.match(source, /data-tutorial-target="whodunnit-investigation-choice"/u);
    assert.match(source, /Investigate the mansion/u);
    assert.match(source, /Trust \{partner\?\.name/u);
    assert.match(source, /action: "choose_investigation_path", path: "player"/u);
    assert.match(source, /action: "choose_investigation_path", path: "partner"/u);
    assert.match(source, /Once your partner files charges, the mansion closes/u);
    assert.match(css, /\.assignmentChoices[\s\S]*grid-template-columns: repeat\(2/u);
    assert.match(css, /\.partnerAssignmentChoice/u);
  });

  it("keeps hotspot affordance outcome-neutral and accessible", () => {
    assert.match(source, /activeRegions\.map\(\(region\)/u);
    assert.doesNotMatch(source, /Inspect again/u);
    assert.match(source, /action: "inspect"/u);
    assert.match(css, /\.investigationLens/u);
    assert.match(css, /border-radius: 50%/u);
    assert.match(css, /--lens-proximity/u);
    assert.match(css, /\.hotspot[\s\S]*background: transparent/u);
    assert.doesNotMatch(css, /sparkle/iu);
    assert.match(css, /\.hotspot:focus-visible/u);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  });

  it("keeps the investigation lens active except over explicit room chrome", () => {
    assert.match(source, /closest\("\[data-mystery-lens-chrome\]"\)/u);
    assert.match(source, /visible: true/u);
    assert.match(source, /data-mystery-room-control data-mystery-lens-chrome/u);
    assert.doesNotMatch(source, /nearest\.inspected\) \{[\s\S]{0,180}visible: false/u);
    assert.match(css, /\.hotspot\[data-inspected="true"\][\s\S]*cursor: none/u);
    assert.match(css, /\.roomLockTarget[\s\S]*cursor: none/u);
  });

  it("keeps a screen coordinate bound to its physical hotspot after inspection", () => {
    const regions = DEBATE_MYSTERY_ROOM_TEMPLATES[0]!.regions.slice(0, 2);
    assert.equal(regions.length, 2);
    const firstCenter = regions[0]!.polygon.reduce(
      (total, point) => ({
        x: total.x + point.x / regions[0]!.polygon.length,
        y: total.y + point.y / regions[0]!.polygon.length,
      }),
      { x: 0, y: 0 },
    );
    const before = mysteryInvestigationTargetAt(
      regions,
      [],
      firstCenter.x,
      firstCenter.y,
    );
    const after = mysteryInvestigationTargetAt(
      regions,
      [before.regionId!],
      firstCenter.x,
      firstCenter.y,
    );

    assert.equal(after.regionId, before.regionId);
    assert.equal(before.inspected, false);
    assert.equal(after.inspected, true);
    assert.match(source, /if \(!nearest\.regionId \|\| nearest\.inspected\) return;/u);
    assert.match(source, /closest\("\[data-mystery-region-id\], \[data-mystery-room-control\]"\)/u);
  });

  it("puts usable items in a room Case Kit and reveals only discovered lock targets", () => {
    assert.match(source, /action: "use_access_item"/u);
    assert.match(source, /application\/x-prism-access-item/u);
    assert.match(source, /dropAccessItem\(event, "item"/u);
    assert.match(source, /dropAccessItem\(event, "room"/u);
    assert.match(source, /dropAccessItem\(event, target\.targetKind, target\.targetId\)/u);
    assert.match(source, /data-tutorial-target="whodunnit-access-inventory"/u);
    assert.match(source, /data-tutorial-target="whodunnit-room-case-kit"/u);
    assert.match(source, /data-tutorial-target="whodunnit-room-lock"/u);
    assert.match(source, /Choose or drag a Case Kit item/u);
    assert.match(source, /filter\(\(target\) => target\.targetKind === "region"\)/u);
    assert.match(source, /Portable locked containers stay in Case inventory/u);
    assert.match(source, /All visible areas inspected/u);
    assert.doesNotMatch(source, /Room investigation complete/u);
    assert.match(source, /data-access-ready/u);
    assert.doesNotMatch(source, /remainingRegions\.map/u);
    assert.match(css, /\.accessInventory/u);
    assert.match(css, /\.roomCaseKit/u);
    assert.match(source, /<header>[\s\S]*className=\{styles\.roomCaseKit\}[\s\S]*<div\s+className=\{styles\.roomScene\}/u);
    assert.match(css, /\.roomPanel\[data-focus="search"\] > header \.roomCaseKit[\s\S]*top: calc\(100% \+ 0\.75rem\)[\s\S]*max-height: min\(46dvh, 22rem\)/u);
    assert.match(css, /\.roomLockTarget/u);
    assert.match(css, /min-width: 3\.5rem/u);
  });

  it("keeps the Theory Board record readable instead of constraining testimony to prop dimensions", () => {
    assert.match(source, /className=\{styles\.theoryEvidenceVisual\}/u);
    assert.match(css, /\.theoryEvidenceVisual[\s\S]*width: 1\.65rem[\s\S]*height: 1\.65rem/u);
    assert.match(css, /\.theoryTestimony > span[\s\S]*flex: 1 1 auto[\s\S]*width: auto[\s\S]*height: auto/u);
    assert.doesNotMatch(css, /\.proofAttach label > span[\s\S]*width: 1\.65rem/u);
    assert.doesNotMatch(source, /setDeskOpen\(state\.playPhase === "theory"\)/u);
    assert.doesNotMatch(source, /if \(state\.playPhase === "theory"\) setDeskOpen\(true\)/u);
  });

  it("preserves undiscovered-map secrecy and keeps room avatars aligned with the art style", () => {
    assert.doesNotMatch(source, /<BotAvatarMicro/u);
    assert.match(source, /renderBotGlyph\(bot\.glyph, \{ size: 18, strokeWidth: 1\.5, className: styles\.mapOccupantGlyph \}\)/u);
    assert.match(source, /className=\{styles\.roomSuspectPresence\}/u);
    assert.match(source, /renderMysteryBotAvatar\(mysteryBotForSuspect\(currentSuspect\), "mini", \{ demeanor: "suspect", blinkEnabled: true, facing: currentSuspectFacing \}\)/u);
    assert.match(source, /state\.suspects\.filter\(\(suspect\) => suspect\.roomId === room\.id\)/u);
    assert.match(source, /renderMysteryBotAvatar\(mysteryBotForSuspect\(currentSuspect\), interviewAvatarPresentation, \{ demeanor: "suspect"/u);
    assert.match(source, /room\.discovered \? room\.name/u);
    assert.match(source, /\{room\.discovered \? <><strong>/u);
    assert.doesNotMatch(source, /roomTemplate\(room\.templateId\)\.emoji/u);
    assert.match(source, /const selectedRoomIsKnown = selectedRoom\.discovered === true/u);
    assert.match(source, /data-tutorial-target="whodunnit-micro-avatar"/u);
    assert.match(source, /data-tutorial-target="whodunnit-room-suspect"/u);
    assert.match(source, /data-tutorial-target="whodunnit-hd-interview"/u);
    assert.match(source, /className=\{styles\.suspectAvatar\}/u);
    assert.match(source, /data-observing=\{suspectRoomFocus === "observe"/u);
    assert.match(source, /data-blurred=\{currentSuspect && suspectRoomFocus === "interview"/u);
    assert.match(source, /data-mystery-interview-interactive/u);
    assert.match(source, /onPointerDown=\{\(event\) =>/u);
    assert.match(source, /event\.key === "Escape"/u);
    assert.match(css, /\.investigation[\s\S]*grid-template-columns/u);
    assert.match(css, /\.floorplan[\s\S]*grid-column: 1/u);
    assert.doesNotMatch(css, /min-width: 88rem/u);
    assert.match(css, /\.interviewStage[\s\S]*grid-template-columns/u);
    assert.match(css, /\.roomSuspectPresence[\s\S]*background: transparent/u);
    assert.match(css, /\.mapRoom:not\(\[data-discovered="true"\]\)/u);
    assert.match(css, /\[data-debate-avatar-quality="mini"\]/u);
    assert.match(css, /\.mapRoom \.mapOccupant[\s\S]*position: absolute[\s\S]*width: 1\.75rem[\s\S]*height: 1\.75rem/u);
    assert.match(css, /\.mapOccupantGlyph[\s\S]*width: 1\.1rem[\s\S]*height: 1\.1rem/u);
  });

  it("places map glyphs at stable varied positions inside room footprints", () => {
    const position = mysteryMapOccupantPosition("case-1", "bedroom", "suspect-1");
    assert.deepEqual(
      mysteryMapOccupantPosition("case-1", "bedroom", "suspect-1"),
      position,
    );
    assert.notDeepEqual(
      mysteryMapOccupantPosition("case-1", "bedroom", "suspect-2"),
      position,
    );
    assert.ok(position.xPct >= 18 && position.xPct <= 82);
    assert.ok(position.yPct >= 62 && position.yPct <= 80);
    assert.match(source, /mysteryMapOccupantPosition\(sessionId, room\.id, suspect\.seatId\)/u);
    assert.match(source, /left: `\$\{position\.xPct\}%`[\s\S]*top: `\$\{position\.yPct\}%`/u);
  });

  it("gives larger room suspects stable, varied lateral walking", () => {
    const profile = mysteryRoomSuspectWalkProfile("case-1", "dining-room", "suspect-1");
    assert.deepEqual(
      mysteryRoomSuspectWalkProfile("case-1", "dining-room", "suspect-1"),
      profile,
    );
    assert.notDeepEqual(
      mysteryRoomSuspectWalkProfile("case-1", "dining-room", "suspect-2"),
      profile,
    );
    assert.ok(Math.min(profile.startPct, profile.endPct) >= 24);
    assert.ok(Math.max(profile.startPct, profile.endPct) <= 72);
    assert.ok(profile.durationMs >= 16_000 && profile.durationMs <= 22_000);
    const initialFacing = mysteryRoomSuspectFacing(profile, 0);
    assert.equal(
      initialFacing,
      profile.endPct > profile.startPct ? "right" : "left",
    );
    assert.notEqual(mysteryRoomSuspectFacing(profile, 1), initialFacing);
    assert.equal(mysteryRoomSuspectFacing(profile, 2), initialFacing);
    assert.match(source, /mysteryRoomSuspectWalkProfile\(sessionId, currentRoom\.id, currentSuspect\.seatId\)/u);
    assert.match(source, /mysteryRoomSuspectFacing\(currentSuspectWalk, suspectWalkIteration\)/u);
    assert.match(source, /onAnimationIteration=\{\(event\) =>/u);
    assert.match(source, /event\.target !== event\.currentTarget/u);
    assert.match(source, /facing: currentSuspectFacing/u);
    assert.match(source, /data-avatar-facing=\{currentSuspectFacing\}/u);
    assert.match(source, /className=\{styles\.roomSuspectWalker\}/u);
    assert.match(css, /\.roomSuspectPresence[\s\S]*top: 51%[\s\S]*bottom: auto/u);
    assert.match(css, /\.roomSuspectPresence[\s\S]*width: min\(28rem, 38%, 52vh\)/u);
    assert.match(css, /\[data-debate-avatar-quality="mini"\][\s\S]*--zen-live-bot-mini-size: min\(24rem, 100%\)[\s\S]*width: min\(24rem, 100%\)/u);
    assert.match(css, /\[data-chat-mini-bot-avatar="true"\]\[data-size="room"\][\s\S]*--chat-mini-bot-render-size: min\(18rem, 25vh\)/u);
    assert.match(css, /\[data-chat-mini-bot-avatar="true"\]\[data-size="room"\][\s\S]*--chat-mini-bot-glyph-size: max\(18px, calc\(var\(--chat-mini-bot-render-size\) \* 0\.12\)\)[\s\S]*--chat-mini-bot-lower-screen-width: 22%[\s\S]*--chat-mini-bot-lower-screen-height: 24\.3%/u);
    assert.doesNotMatch(source, /className=\{styles\.roomSuspectName\}/u);
    assert.doesNotMatch(css, /\.roomSuspectName/u);
    assert.match(css, /@keyframes mysterySuspectRoomWalk[\s\S]*transform: translate\(-50%, -50%\)[\s\S]*--suspect-walk-waypoint/u);
    assert.match(css, /\.roomSuspectPresence:hover[\s\S]*animation-play-state: paused/u);
    assert.match(css, /prefers-reduced-motion[\s\S]*\.roomSuspectWalker/u);
  });

  it("opts Whodunnit Mini and Full HD bots into the authored blink scheduler", () => {
    assert.ok((source.match(/blinkEnabled: true/gu) ?? []).length >= 3);
    assert.match(shell, /blinkEnabled: performance\?\.blinkEnabled === true/u);
    assert.match(shell, /facing: performance\?\.facing/u);
    assert.match(
      page,
      /avatarState\.consumer !== "gallery" \|\|[\s\S]{0,80}avatarState\.blinkEnabled === true/u,
    );
    assert.match(page, /blinkEnabled=\{avatarState\.blinkEnabled === true\}/u);
    assert.ok((page.match(/facing=\{avatarState\.facing\}/gu) ?? []).length >= 2);
  });

  it("fills the interview stage and gives the HD suspect stronger presence", () => {
    assert.match(css, /\.interviewStage[\s\S]{0,220}align-items: stretch/u);
    assert.match(css, /\.interviewViewport[\s\S]{0,260}height: 100%/u);
    assert.match(css, /\.interviewViewport[\s\S]{0,300}box-sizing: border-box/u);
    assert.doesNotMatch(css, /\.interviewViewport[\s\S]{0,260}max-height: min\(94%, 34rem\)/u);
    assert.match(css, /\.suspectAvatar[\s\S]{0,180}width: min\(30vw, 23rem\)/u);
    assert.match(css, /\.suspectAvatar[\s\S]{0,220}min-height: min\(30vw, 23rem\)/u);
    assert.match(
      css,
      /\.suspectAvatar :global\(\[data-debate-avatar-quality="hd"\]\)[\s\S]{0,220}max-height: min\(30vw, 23rem\)/u,
    );
  });

  it("opens views for free and charges only the first inspection in each search pass", () => {
    assert.match(source, /useState<"observe" \| "interview" \| "search">\("observe"\)/u);
    assert.match(source, /Talk to \{currentSuspect\.name\}/u);
    assert.match(source, /Investigate room · free/u);
    assert.match(source, /action: "begin_investigation"/u);
    assert.match(source, /action: "begin_interview"/u);
    assert.match(source, /action: "end_activity"/u);
    assert.match(source, /Opening is free · each submitted question costs 1 action/u);
    assert.match(source, /the first hotspot costs 1 action, then every remaining hotspot in this pass is free/u);
    assert.match(source, /currentInvestigation\?\.actionCommitted === true \|\| state\.actionsRemaining > 0/u);
    assert.match(source, /Search committed · 1 action/u);
    assert.match(source, /Area investigated · included in this search/u);
    assert.match(source, /data-focus=\{suspectRoomFocus\}/u);
    assert.match(css, /\.roomPanel\[data-focus="search"\][\s\S]*position: fixed/u);
    assert.match(css, /\.roomScene\[data-observing="true"\][\s\S]*blur\(2px\)/u);
    assert.match(source, /setSuspectRoomFocus\("search"\)/u);
    assert.match(source, /setSuspectRoomFocus\("interview"\)/u);
    assert.match(source, /data-tutorial-target="whodunnit-room-suspect"/u);
    assert.match(source, /type @ to mention evidence, testimony, suspects, or the victim/u);
    assert.match(source, /commitMysteryMentionAtCaret/u);
    assert.match(source, /<button type="button" disabled=\{busy \|\| state\.actionsRemaining === 0 \|\| !question\.trim\(\)\}/u);
    assert.match(source, /maxLength=\{2_000\}/u);
    assert.doesNotMatch(source, /No evidence confrontation/u);
    assert.match(source, /Ask · 1 action/u);
    assert.match(source, /parseMysteryInterviewEvidenceMention\(asked, state\.discoveredEvidence\)/u);
    assert.match(source, /Choose a discovered evidence item from the @ menu/u);
    assert.match(source, /setQuestion\(lead\); setQuestionCaret\(lead\.length\)/u);
    assert.doesNotMatch(source, /suggestedLeads\.map\(\(lead\) => <button[\s\S]{0,220}void perform\(\{ action: "interview"/u);
    assert.doesNotMatch(source, /Suggested question added to the composer/u);
    assert.match(source, /streamPlayerQuestion\(mysteryPublicText\(asked, state\), messageId\)/u);
    assert.match(source, /interviewGenerating/u);
    assert.match(source, /const playMysteryVoiceRef = useRef\(props\.playMysteryVoice\)/u);
    assert.match(source, /setStreamingMessageId\(\(current\) => current === latest\.id \? null : current\)/u);
    assert.match(source, /const playMysteryVoice = playMysteryVoiceRef\.current/u);
    assert.doesNotMatch(source, /\}, \[mysteryBotForSuspect, props, sessionId, state\.interviewLog, state\.suspects\]\);/u);
  });

  it("makes inspected areas one-shot and marks the visible search pass exhausted", () => {
    assert.match(source, /inFlightMysteryActionKeysRef/u);
    assert.match(source, /mysteryClientActionKey\(action\)/u);
    assert.match(source, /remainingInvestigationRegions/u);
    assert.match(source, /mysteryInvestigationTargetAt/u);
    assert.match(source, /currentInvestigation\?\.actionCommitted === true \|\| state\.actionsRemaining > 0/u);
    assert.match(source, /aria-disabled=\{currentRoom\.inspectedRegionIds\.includes\(region\.id\) \|\| !canInspectCurrentPass\}/u);
    assert.match(source, /disabled=\{busy \|\| !canInspectCurrentPass \|\| currentRoom\.inspectedRegionIds\.includes\(region\.id\)\}/u);
    assert.match(source, /if \(!canInspectCurrentPass \|\| currentRoom\.inspectedRegionIds\.includes\(region\.id\)\) return;/u);
    assert.match(source, /data-searched=\{room\.searched \? "true" : undefined\}/u);
    assert.match(source, /className=\{styles\.mapRoomCompleteMark\}/u);
    assert.match(source, /disabled=\{busy \|\| currentRoom\.searched\}/u);
    assert.match(css, /\.mapRoom\[data-searched="true"\]/u);
    assert.match(css, /\.mapRoomCompleteMark/u);
    assert.match(css, /\.roomModeControls button:disabled/u);
  });

  it("keeps forensics and all public-record mentions on the investigation surface", () => {
    assert.match(source, /action: "forensic"/u);
    assert.match(source, /Forensics · 3 actions/u);
    assert.match(source, /state\.forensicFindings/u);
    assert.match(source, /mysteryMentionPicks/u);
    assert.match(source, /\[\[mystery:testimony:/u);
    assert.match(source, /\[\[mystery:suspect:/u);
    assert.match(source, /\[\[mystery:victim:/u);
    assert.match(source, /\[\[mystery:lead:/u);
    assert.match(source, /mysteryMentionPicks\(state, true\)/u);
    assert.match(source, /Consult · free/u);
    assert.match(source, /renderMysteryBotAvatar\(partner/u);
    assert.match(source, /<ReactMarkdown[\s\S]*remarkPlugins=\{\[remarkGfm\]\}/u);
    assert.match(source, /partnerMarkdownWithColoredSuspects/u);
    assert.doesNotMatch(source, /A side path/u);
    assert.match(css, /\.partnerMini/u);
    assert.match(css, /\.stagePartnerProse/u);
    assert.match(css, /\.partnerMini[\s\S]*overflow: visible/u);
    assert.match(css, /\.partnerSuspectName/u);
    assert.match(css, /mysteryPartnerPresence/u);
  });

  it("uses a compact scene-first HUD with an optional Case File drawer", () => {
    assert.match(source, /data-tutorial-target="whodunnit-hud-controls"/u);
    assert.match(source, /data-tutorial-target="whodunnit-mission"/u);
    assert.match(source, /Determine who killed \{state\.victim\.name\}, then prove it in court/u);
    assert.match(source, /Case file/u);
    assert.match(source, /Public record & tools/u);
    assert.match(source, /caseFileTab === "partner"/u);
    assert.match(source, /caseFileTab === "leads"/u);
    assert.match(source, /caseFileTab === "access"/u);
    assert.match(source, /caseFileTab === "evidence"/u);
    assert.match(source, /caseFileTab === "testimony"/u);
    assert.doesNotMatch(source, /data-tutorial-target="whodunnit-co-counsel-mini"/u);
    assert.doesNotMatch(css, /\.hudPartnerMini/u);
    assert.match(css, /\.caseFileTabs/u);
    assert.match(source, /hidden=\{!caseFileOpen\}/u);
    assert.match(source, /aria-label="Close case file"/u);
    assert.match(css, /\.caseRail[\s\S]*position: fixed/u);
    assert.match(css, /@keyframes mysteryCaseFileIn/u);
  });

  it("preserves explicit travel while separating the mansion and room views", () => {
    assert.match(source, /const \[selectedRoomId, setSelectedRoomId\] = useState\(state\.currentRoomId\)/u);
    assert.match(source, /const mysterySessionResetIdRef = useRef\(sessionId\);/u);
    assert.match(source, /if \(mysterySessionResetIdRef\.current === sessionId\) return;/u);
    assert.match(source, /setSelectedRoomId\(room\.id\);[\s\S]{0,180}announceAction/u);
    assert.match(source, /aria-pressed=\{room\.id === selectedRoom\.id\}/u);
    assert.match(source, /Array\.from\(\{ length: state\.config\.floors \}/u);
    assert.match(source, /onClick=\{\(\) => selectFloor\(floorNumber\)\}/u);
    assert.match(source, /floorContentWidth/u);
    assert.match(source, /const mapScale = Math\.min/u);
    assert.match(source, /roomWidthPercent = \(width: number\): number => width \* mapScale/u);
    assert.match(source, /roomHeightPercent = \(height: number\): number => \(\(height \* mapScale\) \/ mapDrawingHeight\) \* 100/u);
    assert.doesNotMatch(source, /DEBATE_MYSTERY_MANSION_GRID/u);
    assert.match(source, /selectedRoomIsKnown \? selectedRoom\.name/u);
    assert.match(source, /Discover room · 1 action|Go to room/u);
    assert.match(source, /if \(await perform\(\{ action: "travel", roomId: selectedRoom\.id \}\)\)/u);
    assert.doesNotMatch(source, /onClick=\{\(\) => void perform\(\{ action: "travel", roomId: room\.id \}\)\}/u);
    assert.doesNotMatch(source, /mansionMapOpen|notebookBackdrop/u);
    assert.match(source, /className=\{styles\.floorplan\}[\s\S]*className=\{styles\.roomPanel\}/u);
    assert.match(source, /data-view=\{spatialView\}/u);
    assert.match(source, /setSpatialView\("room"\)/u);
    assert.match(source, /const showMansion = \(\): void =>/u);
    assert.match(css, /\.mapRoom\[data-selected="true"\]/u);
    assert.match(css, /\.mapDetails/u);
    assert.match(css, /\.mapViewport/u);
    assert.match(css, /\.mapViewport[\s\S]*aspect-ratio: 4 \/ 3/u);
    assert.match(css, /\.investigation\[data-view="mansion"\] \.roomPanel/u);
    assert.match(css, /\.investigation\[data-view="room"\] \.floorplan/u);
    assert.match(css, /\.mapDoor/u);
    assert.match(css, /@keyframes mysterySpatialArrival/u);
  });

  it("plays globally gated navigation cues and chimes only for newly acquired evidence", () => {
    assert.match(source, /playDebateMysterySfx\(\{/u);
    assert.match(source, /enabled: props\.audioEnabled/u);
    assert.match(source, /volume: props\.audioVolume/u);
    assert.match(source, /const acquiredEvidence = next\.discoveredEvidence\.find/u);
    assert.match(source, /acquiredEvidence: Boolean\(acquiredEvidence\)/u);
    assert.match(source, /sfxCue === "evidence" \|\| !options\.suppressNavigationSfx/u);
    assert.match(source, /if \(nextFloor !== floor\) playMysterySfx\("map"\)/u);
    assert.match(source, /if \(room\.id !== selectedRoom\.id\) playMysterySfx\("map"\)/u);
    assert.match(source, /playMysterySfx\("theory"\)/u);
    assert.match(source, /playMysterySfx\("return"\)/u);
    assert.match(source, /data-ui-sfx="none"[^>]*>← Return to mansion/u);
    assert.match(source, /data-ui-sfx="none"[\s\S]{0,180}Return to room/u);
  });

  it("fits one spatial scene plus optional record drawers into the desktop viewport", () => {
    assert.match(css, /\.play\[data-phase="investigation"\][\s\S]*height: 100dvh/u);
    assert.match(source, /data-desk-open=\{deskOpen \? "true" : undefined\}/u);
    assert.match(css, /\.investigation[\s\S]*height: calc\(100dvh - 5\.45rem\)/u);
    assert.match(css, /\.floorplan,[\s\S]*\.roomPanel[\s\S]*height: 100%/u);
    assert.match(css, /\.investigatorDesk\[data-surface="investigation"\][\s\S]*position: fixed/u);
    assert.match(css, /\.caseRail[\s\S]*height: calc\(100dvh - 6rem\)[\s\S]*overflow: hidden/u);
    assert.match(css, /\.caseRail > :is\([\s\S]*overflow: auto/u);
    assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.deskWorkspace \{ grid-template-columns: 1fr; \}/u);
  });

  it("gives the mansion and room the wide canvas while keeping records layered", () => {
    assert.match(css, /@media \(min-width: 1600px\)/u);
    assert.match(css, /width: min\(92rem, calc\(100% - 2rem\)\)/u);
    assert.match(css, /\.floorplan[\s\S]*grid-template: auto minmax\(0, 1fr\) auto/u);
    assert.match(css, /\.caseRail[\s\S]*right: 0\.85rem/u);
    assert.match(css, /\.play\[data-phase="investigation"\] \.roomPanel:not\(\[data-focus="search"\]\) \.roomScene,[\s\S]*aspect-ratio: 16 \/ 9;/u);
    assert.match(css, /\.roomPanel\[data-focus="search"\] \.roomScene[\s\S]*aspect-ratio: auto;/u);
    assert.match(css, /\.play\[data-phase="investigation"\] \.notebookBody > nav,[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/u);
    assert.match(css, /\.play\[data-phase="investigation"\] \.leadNotebook,[\s\S]*grid-template-columns: minmax\(0, 1fr\)/u);
  });

  it("ships Illustrated and Mosaic 1600x900 WebP variants for all sixteen bundled rooms", () => {
    const directory = fileURLToPath(
      new URL("../../public/debate/mystery/rooms/", import.meta.url),
    );
    const originals = [
      "arboretum.webp",
      "ballroom.webp",
      "basement.webp",
      "bathroom.webp",
      "bedroom.webp",
      "dining-room.webp",
      "foyer.webp",
      "garage.webp",
      "kitchen.webp",
      "library.webp",
      "living-room.webp",
      "lounge.webp",
      "office.webp",
      "pool.webp",
      "rooftop-lounge.webp",
      "theater.webp",
    ];
    const expected = originals.flatMap((filename) => [
      filename,
      filename.replace(/\.webp$/u, "-mosaic.webp"),
    ]).sort();
    assert.deepEqual(readdirSync(directory).sort(), expected);
    for (const filename of expected) {
      const dimensions = webpDimensions(readFileSync(path.join(directory, filename)));
      assert.deepEqual(dimensions, { width: 1600, height: 900 }, filename);
    }
  });

  it("uses generated room art before a local bundled scene and preserves suspect blur", () => {
    const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === "kitchen")!;
    assert.equal(
      mysteryRoomArtworkSrc("generated / room", template),
      "/api/images/generated%20%2F%20room/file",
    );
    assert.equal(mysteryRoomArtworkSrc(null, template), "/debate/mystery/rooms/kitchen.webp");
    assert.equal(
      whodunnitSavedRoomArtUrl("generated / room", "mosaic"),
      "/api/images/generated%20%2F%20room/file?style=mosaic",
    );
    assert.equal(
      whodunnitBundledRoomArtPath(template.bundledAssetPath, "mosaic"),
      "/debate/mystery/rooms/kitchen-mosaic.webp",
    );
    assert.match(source, /whodunnitSavedRoomArtUrl\(currentRoom\.imageId, investigationArtStyle\)/u);
    assert.match(source, /renderMysteryBotAvatar\(mysteryBotForSuspect\(currentSuspect\), interviewAvatarPresentation/u);
    assert.match(source, /<img className=\{styles\.generatedRoom\} src=\{roomArtworkSrc\}/u);
    assert.match(css, /\.roomScene\[data-blurred="true"\][\s\S]*\.generatedRoom/u);
  });

  it("uses the private v2 desk for revealed folders, notes, and fallible pins", () => {
    assert.match(source, /leadAnnotations: notebook\.leadAnnotations/u);
    assert.match(source, /suspectNotes: notebook\.suspectNotes/u);
    assert.match(source, /suspectPins: notebook\.suspectPins/u);
    assert.match(source, /const placeOnDesk/u);
    assert.match(source, /const placeOnDeskAt/u);
    assert.match(source, /const togglePin/u);
    assert.match(source, /Paperclip pin/u);
    assert.match(source, /Pins are your hypotheses\. They never become evidence or satisfy a theory/u);
    assert.match(source, /data-tutorial-target="whodunnit-investigator-desk"/u);
    assert.match(source, /className=\{styles\.suspectFolderRack\}/u);
    assert.match(source, /Full HD interview reveals a folder/u);
    assert.match(source, /blinkEnabled: true/u);
    assert.match(source, /New lead ·/u);
    assert.match(source, /Lead updated ·/u);
    assert.match(source, /leadRevision/u);
    assert.match(source, /const editLeadAnnotation/u);
    assert.match(source, /Save comment/u);
    assert.match(source, /caseFileTab === "leads"[\s\S]*notebook\?\.leadAnnotations/u);
    assert.match(source, /physical desk surface/u);
    assert.match(source, /onDrop=/u);
    assert.match(source, /const \[deskPlacements, setDeskPlacements\]/u);
    assert.match(source, /decodeDebateMysteryDeskDragPayload/u);
    assert.match(source, /debateMysteryDeskPositionFromClient/u);
    assert.match(source, /renderDeskReference\(placement\.reference, "desk"\)/u);
    assert.match(source, /Return \$\{placement\.reference\.label\} to its tray/u);
    assert.match(source, /<DebateEvidenceDocument/u);
    assert.match(source, /documentKind: "brave"/u);
    assert.match(source, /documentKind: "scholar"/u);
    assert.match(source, /className=\{styles\.deskEvidenceObject\}/u);
    assert.match(source, /className=\{styles\.deskDocumentTray\}/u);
    assert.match(source, /className=\{styles\.deskEvidenceTray\}/u);
    assert.match(source, /DEBATE_MYSTERY_DESK_DRAG_MIME/u);
    assert.match(source, /if \(reference\.documentKind\) playMysterySfx\("paper-pickup"\)/u);
    assert.match(source, /reference\.kind === "evidence"\) playDeskItemSfx\(reference, "pickup"\)/u);
    assert.match(source, /reference\.kind === "evidence"\) playDeskItemSfx\(reference, "place"\)/u);
    assert.match(source, /playDebateMysteryDeskItemSfx/u);
    assert.match(evidenceDocumentSource, /One physical source prop shared by Forum lecterns and the Whodunnit desk/u);
    assert.match(forumCss, /\.evidencePedestalDocument\[data-presentation="desk"\]/u);
    assert.match(source, /renderInvestigatorDesk\("theory"\)/u);
    assert.match(source, /Add to theory/u);
    assert.match(source, /onPointerDown=\{beginDeskPull\}/u);
    assert.match(source, /onPointerUp=\{finishDeskPull\}/u);
    assert.doesNotMatch(source, /Retired v1 notebook|\+ New page|Review page polish/u);
    assert.match(css, /\.investigatorDesk/u);
    assert.match(css, /\.investigatorDesk \{ grid-column: 2;/u);
    assert.match(css, /\.deskCanvas/u);
    assert.match(css, /\.deskPlacement/u);
    assert.match(css, /\.suspectFolderRack/u);
  });

  it("forwards actual mystery voice timing to the full suspect face", () => {
    assert.match(source, /onProgress: \(elapsedMs, durationMs\)/u);
    assert.match(source, /speechTiming: interviewSpeechTiming/u);
    assert.match(shell, /speechTiming: performance\?\.speechTiming \?\? null/u);
    assert.match(shell, /lifecycle,/u);
    assert.match(source, /playMysteryPlayerVoice/u);
    assert.match(shell, /playMysteryPlayerVoice: async/u);
    assert.match(source, /playerSpeechTiming/u);
  });

  it("withholds a new suspect reply until playback starts and fails open if it cannot play", () => {
    assert.match(source, /mysteryInterviewTranscriptVisibleText/u);
    assert.match(source, /onStart: \(durationMs, alignment\) =>/u);
    assert.match(source, /onProgress: \(elapsedMs, durationMs\) =>[\s\S]*mysteryInterviewTranscriptVisibleText/u);
    assert.match(source, /\.then\(\(played\) => \{[\s\S]*if \(!played\) revealCompletedReply\(\)/u);
    assert.match(source, /onCancel: \(\) => \{[\s\S]*revealCompletedReply\(\)/u);
    assert.match(source, /mysteryInterviewTranscriptShouldWithhold\(/u);
    assert.match(source, /latestInterviewAwaitingRevealId/u);
  });

  it("keeps feedback and acquired-evidence detail inside the stage as one replacing line", () => {
    assert.match(source, /const \[evidenceExhibitId, setEvidenceExhibitId\]/u);
    assert.match(source, /if \(acquiredEvidence\) setEvidenceExhibitId/u);
    assert.match(source, /className=\{styles\.evidenceExhibit\}/u);
    assert.match(source, /className=\{styles\.stageActionLine\}/u);
    assert.doesNotMatch(source, /className=\{styles\.actionToast\}/u);
    assert.doesNotMatch(source, /className=\{styles\.observationStack\}/u);
    assert.match(css, /\.stageLowerChrome/u);
    assert.match(css, /\.evidenceExhibit/u);
  });

  it("hands a filed Theory Board accusation to the real Turnabout bake", () => {
    assert.match(source, /action: "file_theory"/u);
    assert.match(source, /File accusation and prepare Turnabout/u);
    assert.match(source, /result\.session\.format === "turnabout"/u);
    assert.match(source, /public gallery is assembling while Turnabout prepares/u);
    assert.match(shell, /session\.formatState\.mysteryTrial/u);
    assert.match(shell, /function debateSessionUsesFullBake/u);
    assert.match(shell, /sessionUsesFullBake &&[\s\S]*liveBakeShouldResumeOnOpen/u);
    assert.match(shell, /waitUntilReady: debateSessionIsMysteryTurnabout\(session\)/u);
    assert.match(shell, /setView\("baking"\)/u);
    assert.match(shell, /runSpectatorProgressiveBake\(session\.id, \{[\s\S]*waitUntilReady: true/u);
    assert.match(shell, /waitForDebateGalleryArrival/u);
    assert.match(shell, /session\.format === "turnabout" \? "Turnabout Court" : "The Forum"/u);
    assert.match(shell, /frozen court record and opening/u);
    assert.match(shell, /adoptSession\(filedSession, bakedSession, \{ playIntro: true \}\)/u);
    assert.match(source, /Smoking Gun/u);
    assert.match(source, /Copy Case Seed/u);
    assert.match(source, /Reveal complete case spoilers/u);
    assert.match(source, /state\.playPhase === "theory"/u);
    assert.match(source, /mansion record is now closed/u);
    assert.match(source, /renderPartnerConsultation\("theory"\)/u);
    assert.match(source, /Consult · free/u);
    assert.match(source, /Name only someone you&apos;ve met\./u);
    assert.match(source, /const theoryAccused = revealedSuspects\.find/u);
    assert.match(source, /const folderSuspects = surface === "theory" \? revealedSuspects : state\.suspects/u);
    assert.match(source, /theoryAccused\?\.seatId === suspect\.seatId/u);
    assert.doesNotMatch(source, /<option value="">Choose the accused<\/option>\{state\.suspects\.map/u);
    assert.match(source, /const theoryClaimOptions = debateMysteryTheoryClaimOptions\(state\)/u);
    assert.match(source, /className=\{styles\.theoryClaimPicker\}/u);
    assert.match(source, /aria-pressed=\{theory\[kind\] === option\.value\}/u);
    assert.match(source, /surface === "theory"[\s\S]*readOnlyDeskNote/u);
    assert.doesNotMatch(source, /placeholder="How was the victim killed\?"|placeholder="Why would the accused do it\?"|placeholder="When and how could they act\?"/u);
    assert.match(source, /disabled=\{busy \|\| theoryReadyCount !== theoryChecklist\.length\}/u);
    assert.match(css, /\.partnerConsultationLog/u);
    assert.match(css, /\.theoryClaimPicker/u);
    assert.match(css, /\.theorySuspectChoices/u);
    assert.match(css, /\.theoryWorkspace/u);
  });

  it("keeps Whodunnit casting editable before Case Forge", () => {
    assert.doesNotMatch(shell, /surpriseAndCompileMystery/u);
    assert.doesNotMatch(shell, /mysterySurpriseCompilePendingRef/u);
    assert.doesNotMatch(shell, /"Surprise me · seat & compile"/u);
    assert.doesNotMatch(shell, /"Randomly assign all Whodunnit cast roles and begin compiling"/u);
    assert.match(shell, /if \(format === "whodunnit"\) \{[\s\S]{0,180}randomizeWhodunnitFullCast/u);
    assert.match(shell, /setJuryEnabled\(true\);[\s\S]{0,80}setPreferredJurorBotIds\(allocation\.jurorBotIds\)/u);
    assert.match(shell, /\{format !== "whodunnit" \? \(/u);
    assert.match(shell, /onClick=\{randomizeCast\}/u);
    assert.match(shell, /const mysterySetupValidated = mysteryRoleSelected/u);
    assert.match(shell, /format === "whodunnit"[\s\S]{0,80}\? mysteryRoleSelected/u);
    assert.match(shell, /if \(!mysterySetupValidated \|\| busy\) return;/u);
    assert.match(shell, /\? "Surprise seats ready"/u);
  });

  it("starts every new Whodunnit cast seat on Surprise me", () => {
    const bots = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id }));
    assert.deepEqual(
      fillWhodunnitSuspectSeats(bots, [], 4),
      ["", "", "", ""],
    );
    assert.deepEqual(
      fillWhodunnitSuspectSeats(bots, ["a", "b"], 4),
      ["a", "b", "", ""],
    );
    assert.match(
      shell,
      /const \[mysteryJudgeBotId, setMysteryJudgeBotId\] = useState\(""\);/u,
    );
    assert.match(
      shell,
      /const \[mysteryProsecutorBotId, setMysteryProsecutorBotId\] = useState\(""\);/u,
    );
    assert.match(
      shell,
      /const \[mysteryRivalDefenseBotId, setMysteryRivalDefenseBotId\] = useState\(""\);/u,
    );
    assert.match(
      shell,
      /setMysterySuspectSelection\(fillDebateMysteryCast\(bots, \[\], 4\)\);[\s\S]{0,160}setMysteryJudgeBotId\(""\);[\s\S]{0,100}setMysteryProsecutorBotId\(""\);[\s\S]{0,100}setMysteryRivalDefenseBotId\(""\);/u,
    );
  });

  it("treats every unfilled seat as a compile-time random choice while preserving manual cast", () => {
    const bots = Array.from({ length: 11 }, (_, index) => ({ id: `bot-${index}` }));
    const result = resolveWhodunnitSurpriseCast(
      bots,
      {
        suspectBotIds: ["bot-0", "", "bot-2", ""],
        judgeBotId: "bot-4",
        prosecutorBotId: "",
        rivalDefenseBotId: "bot-6",
        jurorBotIds: [null, "bot-8", null, null],
      },
      4,
      4,
      deterministicSequence([0.81, 0.33, 0.56, 0.11, 0.72, 0.04]),
    );
    assert.ok(result);
    if (!result) return;
    assert.equal(result.suspectBotIds[0], "bot-0");
    assert.equal(result.suspectBotIds[2], "bot-2");
    assert.equal(result.judgeBotId, "bot-4");
    assert.equal(result.rivalDefenseBotId, "bot-6");
    assert.equal(result.jurorBotIds[1], "bot-8");
    const allBotIds = [
      ...result.suspectBotIds,
      result.judgeBotId,
      result.prosecutorBotId,
      result.rivalDefenseBotId,
      ...result.jurorBotIds,
    ];
    assert.equal(new Set(allBotIds).size, 11);
    assert.equal(resolveWhodunnitSurpriseCast(bots.slice(0, 10), { suspectBotIds: [] }, 4, 4), null);
    assert.match(shell, /resolveWhodunnitSurpriseCast\(/u);
    assert.match(shell, /Compile randomly assigns every Surprise me seat/u);
  });

  it("leaves a removed Whodunnit seat on a one-seat Surprise me reroll", () => {
    assert.match(shell, /bot\?\.name \?\? "Surprise me"/u);
    assert.match(shell, /if \(!bot\) surpriseMysterySeat\(seat\)/u);
    assert.match(
      shell,
      /leave seat on Surprise me/u,
    );

    assert.deepEqual(
      fillWhodunnitSuspectSeats(
        ["a", "b", "c", "d"].map((id) => ({ id })),
        ["a", "", "c"],
        3,
      ),
      ["a", "", "c"],
    );
    assert.equal(
      surpriseWhodunnitSeatBotId(
        ["a", "b", "c", "d"].map((id) => ({ id })),
        ["a", "c"],
        "b",
        () => 0,
      ),
      "d",
    );
  });

  it("keeps all four Whodunnit juror seats in the Cast picker and lets each be replaced", () => {
    assert.match(shell, /data-role-group="jury"/u);
    assert.match(shell, /seat: \{ kind: "juror", index \}/u);
    assert.match(shell, /label: `Juror \$\{index \+ 1\}`/u);
    assert.match(shell, /activeMysteryCastSeat\.kind === "juror"/u);
    assert.match(shell, /assignBotToJurySeat\(activeMysteryCastSeat\.index, botId\)/u);
    assert.match(shell, /clearJurySeat\(seat\.index\)/u);
    assert.doesNotMatch(shell, /const mysteryFloorBotSignature/u);
  });

  it("leaves Case Forge compilation to the normal Compile the case action", () => {
    assert.doesNotMatch(shell, /Surprise me · seat & compile/u);
    assert.doesNotMatch(shell, /mysterySurpriseCompileRequest/u);
    assert.match(shell, /Compile the case/u);
    assert.match(shell, /leave seats on Surprise me/u);
  });

  it("produces distinct random Whodunnit casts with correct role counts", () => {
    const bots = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((id) => ({ id }));
    const result = randomizeWhodunnitCast(bots, 6, deterministicSequence([0.81, 0.33, 0.56, 0.11, 0.72, 0.04, 0.89, 0.66]));
    assert.ok(result !== null);
    if (!result) return;
    const allBotIds = [
      ...result.suspectBotIds,
      result.judgeBotId,
      result.prosecutorBotId,
      result.rivalDefenseBotId,
    ];
    assert.equal(allBotIds.length, minimumWhodunnitBotsForCast(6));
    assert.equal(new Set(allBotIds).size, minimumWhodunnitBotsForCast(6));
  });

  it("allocates every required Whodunnit role, including four distinct jurors", () => {
    const result = randomizeWhodunnitFullCast(
      Array.from({ length: 11 }, (_, index) => ({ id: `bot-${index}` })),
      4,
      4,
      deterministicSequence([0.81, 0.33, 0.56, 0.11, 0.72, 0.04, 0.89, 0.66, 0.2, 0.4]),
    );
    assert.ok(result);
    if (!result) return;
    const allBotIds = [
      ...result.suspectBotIds,
      result.judgeBotId,
      result.prosecutorBotId,
      result.rivalDefenseBotId,
      ...result.jurorBotIds,
    ];
    assert.equal(result.jurorBotIds.length, 4);
    assert.equal(new Set(allBotIds).size, 11);
  });

  it("keeps a Wielded bot among the suspects while populating every role", () => {
    const bots = ["lizzy", "b", "c", "d", "e", "f", "g", "h", "i"].map(
      (id) => ({ id }),
    );
    const result = randomizeWhodunnitCastAroundBot(
      bots,
      6,
      "lizzy",
      deterministicSequence([0.81, 0.33, 0.56, 0.11, 0.72, 0.04, 0.89]),
    );
    assert.ok(result !== null);
    if (!result) return;
    assert.equal(result.suspectBotIds[0], "lizzy");
    const allBotIds = [
      ...result.suspectBotIds,
      result.judgeBotId,
      result.prosecutorBotId,
      result.rivalDefenseBotId,
    ];
    assert.equal(new Set(allBotIds).size, minimumWhodunnitBotsForCast(6));
  });

  it("registers every suspect tile as a bot-directed setup target", () => {
    assert.match(shell, /id: `debate-setup-anchor-\$\{bot\.id\}/u);
    assert.match(shell, /createBotDirectedSetupRefractTarget/u);
    assert.match(shell, /randomizeMysteryCastAroundBot/u);
    assert.match(shell, /setMysteryInspiration/u);
    assert.match(shell, /effectiveDisabledReason/u);
  });

  it("normalizes bot IDs before randomizing", () => {
    const bots = [
      { id: "  a  " },
      { id: "a" },
      { id: "b" },
      { id: "c" },
      { id: "d" },
      { id: "e" },
      { id: "f" },
      { id: "g" },
      { id: "" },
    ];
    const normalized = distinctWhodunnitCastBotIds(bots);
    assert.equal(normalized.length, 7);
    assert.deepEqual(normalized, ["a", "b", "c", "d", "e", "f", "g"]);
  });

  it("accepts repeated random-cast attempts on the same pool without duplication", () => {
    const bots = ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id }));
    const first = randomizeWhodunnitCast(bots, 4, deterministicSequence([0.21, 0.41, 0.61, 0.81, 0.03, 0.23]));
    const second = randomizeWhodunnitCast(bots, 4, deterministicSequence([0.71, 0.31, 0.91, 0.12, 0.45, 0.67]));
    assert.ok(first);
    assert.ok(second);
    if (!first || !second) return;
    const firstSelection = [
      ...first.suspectBotIds,
      first.judgeBotId,
      first.prosecutorBotId,
      first.rivalDefenseBotId,
    ];
    const secondSelection = [
      ...second.suspectBotIds,
      second.judgeBotId,
      second.prosecutorBotId,
      second.rivalDefenseBotId,
    ];
    assert.equal(new Set(firstSelection).size, minimumWhodunnitBotsForCast(4));
    assert.equal(new Set(secondSelection).size, minimumWhodunnitBotsForCast(4));
  });

  it("returns null when the Library cannot satisfy suspects and courtroom roles", () => {
    const bots = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
    assert.equal(randomizeWhodunnitCast(bots, 4), null);
  });
});
