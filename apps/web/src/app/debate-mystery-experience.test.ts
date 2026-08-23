import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  randomizeWhodunnitCast,
  randomizeWhodunnitCastAroundBot,
  minimumWhodunnitBotsForCast,
  distinctWhodunnitCastBotIds,
} from "./debateMysteryCast.ts";
import {
  mysteryInvestigationTargetAt,
  mysteryRoomArtworkSrc,
} from "./debateMysteryRoomArt.ts";
import {
  mysteryMapOccupantPosition,
  mysteryRoomSuspectFacing,
  mysteryRoomSuspectWalkProfile,
} from "./debateMysteryRoomWalk.ts";
import { DEBATE_MYSTERY_ROOM_TEMPLATES } from "@localai/shared";

const source = readFileSync(
  new URL("./DebateMysteryExperience.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");

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
    offset += 8 + size + (size % 2);
  }
  throw new Error("Expected a lossy VP8 WebP frame");
}

describe("Debate Whodunnit experience", () => {
  it("uses a separate investigation surface and resumes it directly from Archive", () => {
    assert.match(shell, /type DebateView = "dashboard" \| "live" \| "baking" \| "mystery"/u);
    assert.match(shell, /session\.format === "whodunnit"[\s\S]*setView\("mystery"\)/u);
    assert.match(shell, /<DebateMysterySetup/u);
    assert.match(shell, /<DebateMysteryPlay/u);
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
    assert.match(source, /All visible areas inspected/u);
    assert.doesNotMatch(source, /Room investigation complete/u);
    assert.match(source, /data-access-ready/u);
    assert.doesNotMatch(source, /remainingRegions\.map/u);
    assert.match(css, /\.accessInventory/u);
    assert.match(css, /\.roomCaseKit/u);
    assert.match(css, /\.roomLockTarget/u);
    assert.match(css, /min-width: 3\.5rem/u);
  });

  it("preserves undiscovered-map secrecy and uses Mini search presences before HD interview focus", () => {
    assert.doesNotMatch(source, /<BotAvatarMicro/u);
    assert.match(source, /renderBotGlyph\(bot\.glyph, \{ size: 18, strokeWidth: 1\.5, className: styles\.mapOccupantGlyph \}\)/u);
    assert.match(source, /className=\{styles\.roomSuspectPresence\}/u);
    assert.match(source, /renderMysteryBotAvatar\(mysteryBotForSuspect\(currentSuspect\), "mini", \{ demeanor: "suspect", blinkEnabled: true, facing: currentSuspectFacing \}\)/u);
    assert.match(source, /state\.suspects\.filter\(\(suspect\) => suspect\.roomId === room\.id\)/u);
    assert.match(source, /renderMysteryBotAvatar\(mysteryBotForSuspect\(currentSuspect\), "full", \{ demeanor: "suspect"/u);
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

  it("opens views for free and charges each submitted interview question or inspection", () => {
    assert.match(source, /useState<"observe" \| "interview" \| "search">\("observe"\)/u);
    assert.match(source, /Talk to \{currentSuspect\.name\}/u);
    assert.match(source, /Investigate room · free/u);
    assert.match(source, /action: "begin_investigation"/u);
    assert.match(source, /action: "begin_interview"/u);
    assert.match(source, /action: "end_activity"/u);
    assert.match(source, /Opening is free · each submitted question costs 1 action/u);
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
    assert.match(source, /aria-disabled=\{currentRoom\.inspectedRegionIds\.includes\(region\.id\) \|\| state\.actionsRemaining === 0\}/u);
    assert.match(source, /disabled=\{busy \|\| state\.actionsRemaining === 0 \|\| currentRoom\.inspectedRegionIds\.includes\(region\.id\)\}/u);
    assert.match(source, /if \(state\.actionsRemaining === 0 \|\| currentRoom\.inspectedRegionIds\.includes\(region\.id\)\) return;/u);
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
    assert.match(css, /\.play\[data-phase="continuance"\][\s\S]*overflow: hidden/u);
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

  it("ships the sixteen bundled 1600x900 WebP room scenes", () => {
    const directory = fileURLToPath(
      new URL("../../public/debate/mystery/rooms/", import.meta.url),
    );
    const expected = [
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
    assert.match(source, /const roomArtworkSrc = mysteryRoomArtworkSrc\(currentRoom\.imageId, template\)/u);
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
    assert.match(source, /comparison slots/u);
    assert.match(source, /onDrop=/u);
    assert.match(source, /renderInvestigatorDesk\("theory"\)/u);
    assert.match(source, /Add to theory/u);
    assert.match(source, /onPointerDown=\{beginDeskPull\}/u);
    assert.match(source, /onPointerUp=\{finishDeskPull\}/u);
    assert.doesNotMatch(source, /Retired v1 notebook|\+ New page|Review page polish/u);
    assert.match(css, /\.investigatorDesk/u);
    assert.match(css, /\.investigatorDesk \{ grid-column: 2;/u);
    assert.match(css, /\.comparisonSlots/u);
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
    assert.match(source, /message\.id === streamingMessageId && !streamedReply \? null/u);
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
    assert.match(source, /const theoryClaimOptions = debateMysteryTheoryClaimOptions\(state\)/u);
    assert.match(source, /className=\{styles\.theoryClaimPicker\}/u);
    assert.match(source, /aria-pressed=\{theory\[kind\] === option\.value\}/u);
    assert.match(source, /surface === "theory"[\s\S]*readOnlyDeskNote/u);
    assert.doesNotMatch(source, /placeholder="How was the victim killed\?"|placeholder="Why would the accused do it\?"|placeholder="When and how could they act\?"/u);
    assert.match(source, /disabled=\{busy \|\| theoryReadyCount !== theoryChecklist\.length\}/u);
    assert.match(css, /\.partnerConsultationLog/u);
    assert.match(css, /\.theoryClaimPicker/u);
  });

  it("adds a clearly labeled one-click random cast action and preserves existing cast flow", () => {
    assert.match(source, /data-tutorial-target="whodunnit-random-cast"/u);
    assert.match(source, /aria-label="Randomly assign all Whodunnit cast roles"/u);
    assert.match(source, /className=\{styles\.castRandomizeButton\}/u);
    assert.match(source, /Surprise me/u);
    assert.match(source, /Random cast/u);
    assert.match(source, /disabled=\{!canRandomizeCast\}/u);
  });

  it("produces distinct random Whodunnit casts with correct role counts", () => {
    const bots = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => ({ id }));
    const result = randomizeWhodunnitCast(bots, 6, deterministicSequence([0.81, 0.33, 0.56, 0.11, 0.72, 0.04, 0.89, 0.66]));
    assert.ok(result !== null);
    if (!result) return;
    const allBotIds = [
      ...result.suspectBotIds,
      result.prosecutorPartnerBotId,
      result.rivalDefenseBotId,
    ];
    assert.equal(allBotIds.length, minimumWhodunnitBotsForCast(6));
    assert.equal(new Set(allBotIds).size, minimumWhodunnitBotsForCast(6));
  });

  it("keeps a Wielded bot among the suspects while populating every role", () => {
    const bots = ["lizzy", "b", "c", "d", "e", "f", "g", "h"].map(
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
      result.prosecutorPartnerBotId,
      result.rivalDefenseBotId,
    ];
    assert.equal(new Set(allBotIds).size, minimumWhodunnitBotsForCast(6));
  });

  it("registers every suspect tile as a bot-directed setup target", () => {
    assert.match(source, /id: `whodunnit-setup-anchor-\$\{bot\.id\}`/u);
    assert.match(source, /createBotDirectedSetupRefractTarget/u);
    assert.match(source, /run: randomizeCast/u);
    assert.match(source, /setInspiration/u);
    assert.match(source, /aria-disabled=\{counsel\}/u);
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
    const bots = ["a", "b", "c", "d", "e", "f"].map((id) => ({ id }));
    const first = randomizeWhodunnitCast(bots, 4, deterministicSequence([0.21, 0.41, 0.61, 0.81, 0.03, 0.23]));
    const second = randomizeWhodunnitCast(bots, 4, deterministicSequence([0.71, 0.31, 0.91, 0.12, 0.45, 0.67]));
    assert.ok(first);
    assert.ok(second);
    if (!first || !second) return;
    const firstSelection = [
      ...first.suspectBotIds,
      first.prosecutorPartnerBotId,
      first.rivalDefenseBotId,
    ];
    const secondSelection = [
      ...second.suspectBotIds,
      second.prosecutorPartnerBotId,
      second.rivalDefenseBotId,
    ];
    assert.equal(new Set(firstSelection).size, minimumWhodunnitBotsForCast(4));
    assert.equal(new Set(secondSelection).size, minimumWhodunnitBotsForCast(4));
  });

  it("returns null when the Library cannot satisfy suspect and counsel requirements", () => {
    const bots = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    assert.equal(randomizeWhodunnitCast(bots, 4), null);
  });
});
