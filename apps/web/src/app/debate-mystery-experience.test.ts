import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  randomizeWhodunnitCast,
  minimumWhodunnitBotsForCast,
  distinctWhodunnitCastBotIds,
} from "./debateMysteryCast.ts";
import { mysteryRoomArtworkSrc } from "./debateMysteryRoomArt.ts";
import { DEBATE_MYSTERY_ROOM_TEMPLATES } from "@localai/shared";

const source = readFileSync(
  new URL("./DebateMysteryExperience.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
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
    assert.match(source, /activeRegions\.map\(\(region, index\)/u);
    assert.match(source, /Inspect again/u);
    assert.match(source, /action: "inspect"/u);
    assert.match(css, /\.investigationLens/u);
    assert.match(css, /border-radius: 50%/u);
    assert.match(css, /--lens-proximity/u);
    assert.match(css, /\.hotspot[\s\S]*background: transparent/u);
    assert.doesNotMatch(css, /sparkle/iu);
    assert.match(css, /\.hotspot:focus-visible/u);
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  });

  it("lets investigators apply access items to inventory, rooms, or room regions without outcome-signaling", () => {
    assert.match(source, /action: "use_access_item"/u);
    assert.match(source, /application\/x-prism-access-item/u);
    assert.match(source, /dropAccessItem\(event, "item"/u);
    assert.match(source, /dropAccessItem\(event, "room"/u);
    assert.match(source, /dropAccessItem\(event, "region"/u);
    assert.match(source, /data-tutorial-target="whodunnit-access-inventory"/u);
    assert.match(source, /Select a room, locked item, or room area/u);
    assert.match(source, /data-access-ready/u);
    assert.doesNotMatch(source, /remainingRegions\.map/u);
    assert.match(css, /\.accessInventory/u);
  });

  it("preserves undiscovered-map secrecy and uses Mini search presences before HD interview focus", () => {
    assert.match(source, /<BotAvatarMicro/u);
    assert.match(source, /renderSizePx=\{58\}/u);
    assert.match(source, /className=\{styles\.roomSuspectPresence\}/u);
    assert.match(source, /renderMysteryBotAvatar\(mysteryBotForSuspect\(currentSuspect\), "mini", \{ demeanor: "suspect" \}\)/u);
    assert.match(source, /state\.suspects\.filter\(\(suspect\) => suspect\.roomId === room\.id\)/u);
    assert.match(source, /renderMysteryBotAvatar\(mysteryBotForSuspect\(currentSuspect\), "full", \{ demeanor: "suspect"/u);
    assert.match(source, /room\.discovered \? room\.name/u);
    assert.match(source, /\{room\.discovered \? <><span>/u);
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
  });

  it("keeps suspect-room talking and searching explicit, with free @ evidence confrontation", () => {
    assert.match(source, /useState<"observe" \| "interview" \| "search">\("observe"\)/u);
    assert.match(source, /Talk to \{currentSuspect\.name\}/u);
    assert.match(source, />Investigate room<\/button>/u);
    assert.match(source, /data-focus=\{suspectRoomFocus\}/u);
    assert.match(css, /\.roomPanel\[data-focus="search"\][\s\S]*position: fixed/u);
    assert.match(css, /\.roomScene\[data-observing="true"\][\s\S]*blur\(2px\)/u);
    assert.match(source, /setSuspectRoomFocus\("search"\)/u);
    assert.match(source, /setSuspectRoomFocus\("interview"\)/u);
    assert.match(source, /data-tutorial-target="whodunnit-room-suspect"/u);
    assert.match(source, /type @ to mention evidence, testimony, suspects, or the victim/u);
    assert.match(source, /commitMysteryMentionAtCaret/u);
    assert.match(source, /<button type="button" disabled=\{busy \|\| !question\.trim\(\)\}/u);
    assert.match(source, /maxLength=\{2_000\}/u);
    assert.doesNotMatch(source, /No evidence confrontation/u);
    assert.doesNotMatch(source, /Commit question · 1 action/u);
    assert.match(source, /parseMysteryInterviewEvidenceMention\(asked, state\.discoveredEvidence\)/u);
    assert.match(source, /Choose a discovered evidence item from the @ menu/u);
    assert.match(source, /setQuestion\(lead\); setQuestionCaret\(lead\.length\)/u);
    assert.doesNotMatch(source, /suggestedLeads\.map\(\(lead\) => <button[\s\S]{0,220}void perform\(\{ action: "interview"/u);
    assert.doesNotMatch(source, /Suggested question added to the composer/u);
    assert.match(source, /streamPlayerQuestion\(mysteryPublicText\(asked, state\), messageId\)/u);
    assert.match(source, /interviewGenerating/u);
    assert.match(source, /const playMysteryVoiceRef = useRef\(props\.playMysteryVoice\)/u);
    assert.match(source, /setStreamingMessageId\(\(current\) => current === latest\.id \? null : current\)/u);
    assert.match(source, /playMysteryVoiceRef\.current\?\.\(/u);
    assert.doesNotMatch(source, /\}, \[mysteryBotForSuspect, props, sessionId, state\.interviewLog, state\.suspects\]\);/u);
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
    assert.match(css, /mysterySuspectTenseFloat/u);
  });

  it("uses a compact scene-first HUD with one case-file surface", () => {
    assert.match(source, /const \[caseFileOpen, setCaseFileOpen\] = useState\(false\)/u);
    assert.match(source, /data-tutorial-target="whodunnit-hud-controls"/u);
    assert.match(source, /data-tutorial-target="whodunnit-mission"/u);
    assert.match(source, /Determine who killed \{state\.victim\.name\}, then prove it in court/u);
    assert.match(source, /data-tutorial-target="whodunnit-case-file"/u);
    assert.match(source, /Case file/u);
    assert.match(source, /Public record & tools/u);
    assert.match(source, /caseFileTab === "partner"/u);
    assert.match(source, /caseFileTab === "leads"/u);
    assert.match(source, /caseFileTab === "access"/u);
    assert.match(source, /caseFileTab === "evidence"/u);
    assert.match(source, /caseFileTab === "testimony"/u);
    assert.match(source, /data-case-file-open=\{caseFileOpen/u);
    assert.match(source, /inert=\{!caseFileOpen\}/u);
    assert.doesNotMatch(source, /data-tutorial-target="whodunnit-co-counsel-mini"/u);
    assert.doesNotMatch(css, /\.hudPartnerMini/u);
    assert.match(css, /\.caseFileTabs/u);
    assert.match(css, /\.caseRail\[data-open="true"\]/u);
    assert.match(css, /prefers-reduced-motion:[\s\S]*\.caseRail/u);
    assert.match(css, /\.investigation[\s\S]*width: min\(84rem/u);
  });

  it("keeps a compact blueprint beside the room stage, with explicit select-then-investigate travel", () => {
    assert.match(source, /const \[selectedRoomId, setSelectedRoomId\] = useState\(state\.currentRoomId\)/u);
    assert.match(source, /const mysterySessionResetIdRef = useRef\(sessionId\);/u);
    assert.match(source, /if \(mysterySessionResetIdRef\.current === sessionId\) return;/u);
    assert.match(source, /setSelectedRoomId\(room\.id\);\s*announceAction/u);
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
    assert.match(source, /await perform\(\{ action: "travel", roomId: selectedRoom\.id \}\);/u);
    assert.doesNotMatch(source, /onClick=\{\(\) => void perform\(\{ action: "travel", roomId: room\.id \}\)\}/u);
    assert.doesNotMatch(source, /mansionMapOpen|notebookBackdrop/u);
    assert.match(source, /className=\{styles\.floorplan\}[\s\S]*className=\{styles\.roomPanel\}/u);
    assert.match(css, /\.mapRoom\[data-selected="true"\]/u);
    assert.match(css, /\.mapDetails/u);
    assert.match(css, /\.mapViewport/u);
    assert.match(css, /\.mapViewport[\s\S]*aspect-ratio: 4 \/ 3/u);
    assert.match(css, /grid-template-columns: clamp\(18rem, 25vw, 22rem\) minmax\(32rem, 1fr\)/u);
    assert.match(css, /\.mapDoor/u);
    assert.match(css, /\.roomPanel[\s\S]*grid-column: 2/u);
  });

  it("fits the desktop investigation and case desk into one viewport", () => {
    assert.match(css, /\.play\[data-phase="investigation"\][\s\S]*height: 100dvh/u);
    assert.match(css, /\.play\[data-phase="continuance"\][\s\S]*overflow: hidden/u);
    assert.match(css, /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 2fr\)/u);
    assert.match(css, /\.play\[data-phase="investigation"\] \.notebook[\s\S]*max-height: none/u);
    assert.match(source, /data-view=\{notebookView\}/u);
    assert.match(source, /className=\{styles\.leadNotebookIntro\}/u);
    assert.match(css, /\.leadNotebookIntro,[\s\S]*display: none/u);
    assert.match(css, /\.notebook:not\(\[data-view="notes"\]\) > footer,[\s\S]*display: none/u);
    assert.match(css, /\.leadAnnotationDraft textarea[\s\S]*min-height: 2\.4rem/u);
    assert.match(css, /\.notebookPage[\s\S]*overflow: auto/u);
    assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.notebook \{ min-height: 32rem; max-height: none; \}/u);
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

  it("offers private autosaved notes, guarded cleanup, and durable references", () => {
    assert.match(source, /\/notebook\/cleanup/u);
    assert.match(source, /operation: "replace"/u);
    assert.match(source, /operation: "accept_cleanup" \| "reject_cleanup" \| "undo"/u);
    assert.match(source, /PRISM safely polishes authored notes/u);
    assert.match(source, /Review the proposed wording/u);
    assert.match(source, /notebookReferenceLabel/u);
    assert.match(source, /referenceKind: "room" \| "evidence" \| "testimony"/u);
    assert.match(source, /DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT/u);
    assert.match(source, /const addAuthoredBlock/u);
    assert.match(source, /disabled=\{!draftBlockText\.trim\(\)\}/u);
    assert.doesNotMatch(source, /const addBlock =/u);
    assert.match(source, /data-tutorial-target="whodunnit-lead-notebook"/u);
    assert.match(source, /New lead ·/u);
    assert.match(source, /Lead updated ·/u);
    assert.match(source, /leadRevision/u);
    assert.doesNotMatch(source, /className=\{styles\.blockTools\}/u);
    assert.match(source, /role="complementary"/u);
    assert.match(source, /Persistent case desk/u);
    assert.match(source, /data-tutorial-target="whodunnit-notebook-editor"/u);
    assert.doesNotMatch(source, /aria-modal="true"/u);
    assert.doesNotMatch(source, /notebookOpen|notebookBackdrop/u);
    assert.match(source, /notebook changed in another window/u);
    assert.match(css, /\.notebook[\s\S]*grid-column: 1 \/ -1/u);
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

  it("connects the Theory Board to the deterministic courtroom actions", () => {
    assert.match(source, /action: "file_theory"/u);
    assert.match(source, /action: "court_press"/u);
    assert.match(source, /action: "court_present"/u);
    assert.match(source, /action: "court_pass"/u);
    assert.match(source, /Smoking Gun/u);
    assert.match(source, /Copy Case Seed/u);
    assert.match(source, /Reveal complete case spoilers/u);
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
