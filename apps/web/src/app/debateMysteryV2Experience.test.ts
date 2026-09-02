import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { normalizeDebateMysteryV2ForgeProgressMessage } from "@localai/shared";
import {
  debateMysteryV2ExaminationCompletesRoom,
  debateMysteryV2ExamineGridCellIndexes,
  debateMysteryV2LensClickTarget,
  debateMysteryV2RoomComplete,
  resolveDebateMysteryV2Lens,
} from "./debateMysteryV2Lens.ts";
import { formatDebateMysteryV2ForgeErrorDetails } from "./debateMysteryV2ForgeFailureDetails.ts";
import {
  debateMysteryForgeAuthoritativePercent,
  debateMysteryForgeStageIsActive,
  formatDebateMysteryForgeElapsed,
  formatDebateMysteryForgeEta,
} from "./debateMysteryV2ForgeProgress.ts";

const experienceSource = readFileSync(
  new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
  "utf8",
);
const setupSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./debateMysteryV2.module.css", import.meta.url),
  "utf8",
);
const signalActionSource = readFileSync(
  new URL("./SignalVoiceActionText.tsx", import.meta.url),
  "utf8",
);
const signalActionCssSource = readFileSync(
  new URL("./SignalVoiceActionText.module.css", import.meta.url),
  "utf8",
);
const storageSource = readFileSync(
  new URL("./StorageSettings.tsx", import.meta.url),
  "utf8",
);
const tutorialSource = readFileSync(
  new URL("./modeTutorials.ts", import.meta.url),
  "utf8",
);

function relativeLuminance(hex: string): number {
  const channels = hex.match(/[0-9a-f]{2}/giu)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const [red = 0, green = 0, blue = 0] = channels.map((value) =>
    value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Whodunnit V2 prosecution experience", () => {
  it("presents investigation and court actions as one tactile command-console system", () => {
    assert.match(experienceSource, /data-console-label="Case desk · field commands"/u);
    assert.match(experienceSource, /data-console-label="Prosecution console"/u);
    for (const command of ["move", "examine", "talk", "present", "press", "objection", "think"]) {
      assert.match(experienceSource, new RegExp(`data-command="${command}"`, "u"));
    }
    assert.match(experienceSource, /const investigationCommandsDismissed = state\.roomView !== "room"[\s\S]{0,100}command === "move"[\s\S]{0,100}command === "examine"/u);
    assert.match(experienceSource, /data-dismissed=\{investigationCommandsDismissed \? "true" : undefined\}/u);
    assert.match(experienceSource, /inert=\{investigationCommandsDismissed \? true : undefined\}/u);
    assert.match(cssSource, /\.investigationCommands\[data-dismissed="true"\][\s\S]*translateX\(-50%\) translateY\(calc\(100% \+ 3rem\)\)/u);
    assert.match(experienceSource, /className=\{styles\.investigationModeBackButton\}[\s\S]{0,420}>← Back to room<\/button>/u);
    assert.match(experienceSource, /command !== "examine" && command !== "move" \? \([\s\S]{0,140}<SceneMediaVignette/u);
    assert.match(experienceSource, /action\.action === "move" && action\.roomId\) setCommand\(null\)/u);
    assert.match(experienceSource, /aria-pressed=\{command === "present"\}/u);
    assert.match(cssSource, /button\[data-active="true"\]/u);
    assert.match(cssSource, /translateY\(0\.3rem\)/u);
    assert.match(cssSource, /\.investigation:has\(\.fileChargesButton\) \.dialogueBox/u);
    assert.match(cssSource, /\.testimony \{[^}]*bottom: 8\.4rem;/u);
    assert.match(cssSource, /button:focus-visible/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
  });

  it("reuses the existing Whodunnit sound palette for physical controls", () => {
    for (const cue of ["navigate", "clip", "enter", "paper", "pencil", "theory"]) {
      assert.match(experienceSource, new RegExp(`playControlSfx\\("${cue}"\\)`, "u"));
    }
  });

  it("routes player-observation Babble through the selected Prosecutor voice", () => {
    assert.match(
      experienceSource,
      /voiceProfile: roomPlayerObservationActive\s*\? prosecutorBot\?\.voiceProfile \?\? null\s*: null/u,
    );
    assert.match(
      experienceSource,
      /instant: roomPlayerObservationActive/u,
    );
    assert.match(
      pageSource,
      /const debateBots = bots\.map[\s\S]{0,500}voiceProfile: resolveBotAudioVoiceProfileV1\(\s*bot\.authored_audio_voice_profile,\s*bot\.audio_voice_profile_override,\s*\)/u,
    );
    assert.match(
      pageSource,
      /playMysteryTextVoice=\{async \(\{[\s\S]{0,220}voiceProfile[\s\S]{0,500}profile: voiceProfile \?\? DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1/u,
    );
    assert.match(
      pageSource,
      /preferProceduralBabble: instant === true/u,
    );
  });

  it("keeps the wide evidence table separate from the witness stand", () => {
    const wideCourtStart = experienceSource.indexOf(
      'courtCamera === "wide" ? (',
    );
    const witnessCourtStart = experienceSource.indexOf(
      'courtCamera === "witness" ? (',
      wideCourtStart,
    );
    const wideCourtSource = experienceSource.slice(
      wideCourtStart,
      witnessCourtStart,
    );
    assert.match(wideCourtSource, /styles\.wideEvidenceTable/u);
    assert.doesNotMatch(wideCourtSource, /styles\.wideWitnessSilhouette/u);
    assert.match(
      experienceSource.slice(witnessCourtStart),
      /styles\.witnessStand/u,
    );
  });

  it("never displays Case Forge progress above its declared attempt budget", () => {
    assert.equal(
      normalizeDebateMysteryV2ForgeProgressMessage(
        "Writing the Case · Witness chapter 1 of 4 · attempt 6 of 5",
      ),
      "Writing the Case · Witness chapter 1 of 4 · attempt 5 of 5",
    );
    assert.match(
      experienceSource,
      /const spoilerSafeProgressMessage = normalizeDebateMysteryV2ForgeProgressMessage\([\s\S]*compilation\.spoilerSafeMessage/u,
    );
    assert.equal(
      (experienceSource.match(/\{spoilerSafeProgressMessage\}/gu) ?? []).length,
      2,
    );
  });

  it("exposes the finite investigation and statement-level court grammar", () => {
    for (const action of [
      "move",
      "dismiss_case_opening",
      "examine",
      "talk",
      "present_to_suspect",
      "file_theory",
      "focus_statement",
      "press_statement",
      "object_statement",
      "choose_prosecution_response",
      "review_strategy",
      "advance_spectator_trial",
      "retry_witness_checkpoint",
    ]) {
      assert.match(experienceSource, new RegExp(`action: [\"']${action}[\"']`, "u"));
    }
    assert.match(experienceSource, /Previous statement/u);
    assert.match(experienceSource, /Next statement/u);
    assert.match(experienceSource, /Object with evidence or sworn testimony/u);
    assert.match(experienceSource, /Incomplete method, motive, or opportunity will weaken the case/u);
    assert.doesNotMatch(experienceSource, /actionsRemaining|action token|freeform/iu);
  });

  it("restores the pre-V2 overhead mansion blueprint rather than a room-button strip", () => {
    assert.match(experienceSource, /aria-label="Mansion Move map"/u);
    assert.match(experienceSource, /styles\.mansionViewport/u);
    assert.match(experienceSource, /styles\.mansionCanvas/u);
    assert.match(experienceSource, /styles\.mansionRoom/u);
    assert.match(experienceSource, /styles\.mansionDoor/u);
    assert.match(experienceSource, /mysteryMapOccupantPosition/u);
    assert.match(experienceSource, /renderBotGlyph/u);
    assert.match(experienceSource, /Discover through connected doors\. Teleport to any visited room\./u);
    assert.match(experienceSource, /mansionSelectedRoomAdjacent/u);
    assert.match(experienceSource, /mansionSelectedRoom\.visited \|\| mansionSelectedRoomAdjacent/u);
    assert.match(experienceSource, /Teleport to \$\{mansionSelectedRoom\.name\}/u);
    assert.match(experienceSource, /Not adjacent/u);
    assert.doesNotMatch(experienceSource, /styles\.floorStack/u);
    assert.match(experienceSource, /whodunnitDiscoveredMansionRoomArtV1\(\{[\s\S]*discovered: room\.visited/u);
    assert.match(experienceSource, /data-room-art=\{roomMapArt\?\.style\}/u);
    assert.match(experienceSource, /"--mansion-room-image": roomMapArt/u);
    assert.doesNotMatch(experienceSource, /room\.bundledAssetPath \? `url/u);
    assert.match(cssSource, /\.mansionRoom\s*\{[\s\S]*position: absolute/u);
    assert.match(cssSource, /\.mansionViewport\s*\{[\s\S]*aspect-ratio: 4 \/ 3/u);
    assert.match(cssSource, /\.mansionRoom\s*\{[\s\S]*place-items: center/u);
    assert.match(cssSource, /\.mansionRoom::before/u);
    assert.match(cssSource, /\.mansionRoom::after/u);
    assert.match(cssSource, /\.mansionRoom\[data-room-art\][\s\S]*var\(--mansion-room-image\) center \/ cover no-repeat/u);
    assert.match(cssSource, /\.mansionRoom\[data-selected="true"\]:not\(\[data-room-art\]\)/u);
    assert.match(cssSource, /rotateX\(3deg\) rotateZ\(-0\.55deg\)/u);
    assert.match(cssSource, /@keyframes roomDescend\s*\{[\s\S]*to\s*\{\s*opacity:\s*1;\s*transform:\s*none/u);
    assert.match(cssSource, /animation:\s*roomDescend[^;]+backwards/u);
  });

  it("turns room visual repair into a discovery-safe rainbow map workflow", () => {
    assert.match(experienceSource, /kind: "magic"[\s\S]{0,220}label: roomVisualsMode/u);
    assert.match(experienceSource, /className=\{styles\.roomVisualsMagicButton\}/u);
    assert.match(cssSource, /\.roomVisualsMagicButton\s*\{[\s\S]*linear-gradient\(110deg, var\(--prism-p, #ff4d6d\)/u);
    assert.match(experienceSource, /data-visual-readiness=\{roomVisualsMode \? visualReadiness/u);
    assert.match(experienceSource, /"Fallback"[\s\S]{0,160}"Upgraded"[\s\S]{0,120}"Default"/u);
    assert.match(experienceSource, /No room art is previewed here/u);
    assert.match(experienceSource, /Generate this room/u);
    assert.match(experienceSource, /Upgrade this room/u);
    assert.match(experienceSource, /<PrismBlockingLoader[\s\S]{0,900}The room stays hidden until you visit it/u);
    assert.match(experienceSource, /category: "mosaic_rooms", roomId: room\.id/u);
    assert.match(experienceSource, /mutationBody\(\{ roomId: room\.id \}\)/u);
    assert.match(experienceSource, /if \(prepared\?\.sealedAsset\?\.status === "ready"\)/u);
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.roomVisualDialogBackdrop/u);
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.roomVisualDialog\s*\{/u);
    assert.match(cssSource, /\.roomVisualDialog footer \.roomVisualPrimaryAction\s*\{[\s\S]{0,180}color: #17131d !important/u);
    assert.doesNotMatch(
      experienceSource,
      /roomVisualDialog[\s\S]{0,2500}<img/u,
      "the room-management modal must not preview undiscovered art",
    );
    assert.match(tutorialSource, /rainbow Visuals tool marks each room/u);
    assert.match(tutorialSource, /artwork remains undisclosed until the room is visited/u);
    assert.match(tutorialSource, /accepted Mosaic\/Upgraded room pairs/u);
  });

  it("offers contextual spoiler-safe field repair, soft item Refract, and one-step undo", () => {
    assert.match(experienceSource, /data-tutorial-target="mystery-v2-scene-repair"/u);
    assert.match(experienceSource, /The exterior looks wrong/u);
    assert.match(experienceSource, /The door is misplaced/u);
    assert.match(experienceSource, /The room looks wrong/u);
    assert.match(experienceSource, /The original room looks wrong/u);
    assert.match(experienceSource, /The Upgraded room looks wrong/u);
    assert.match(experienceSource, /Refresh anchors without moving the room objects/u);
    assert.match(experienceSource, /Refresh dynamic light placement/u);
    assert.match(experienceSource, /I want to generate an asset for this item/u);
    assert.match(experienceSource, /There is some excess magenta in the asset/u);
    assert.match(experienceSource, /I don't like the music, or I can't hear it/u);
    assert.match(experienceSource, /I don't like the ambience, or I can't hear it/u);
    assert.match(
      experienceSource,
      /context === "exterior"[\s\S]{0,220}"regenerate_music", "regenerate_ambience"/u,
    );
    assert.match(
      experienceSource,
      /context === "item"[\s\S]{0,420}"regenerate_music",[\s\S]{0,80}"regenerate_ambience"/u,
    );
    assert.match(experienceSource, /foundEvidenceItems\.map/u);
    assert.match(experienceSource, /activeFoundEvidence[\s\S]{0,220}renderSceneRepairControl\("item"/u);
    assert.match(experienceSource, /mystery-scene-repair\/undo/u);
    assert.match(experienceSource, /placement="fullscreen"[\s\S]{0,520}No undiscovered room, item, or case information/u);
    assert.match(experienceSource, /action === "regenerate_evidence_asset"[\s\S]{0,120}enqueueItemSynthesis/u);
    assert.match(experienceSource, /registerPrismSoftSynthesisJobs\([\s\S]{0,180}orbOpensProgress: true/u);
    assert.match(experienceSource, /placement="docked"[\s\S]{0,240}Whodunnit · Found item/u);
    assert.match(experienceSource, /Queue regeneration/u);
    assert.match(experienceSource, /retryItemSynthesis/u);
    assert.match(experienceSource, /The image remains hidden until it appears through discovery/u);
    assert.match(experienceSource, /state\.mansionExterior\?\.entryTarget/u);
    assert.match(cssSource, /\.sceneRepairButton\s*\{[\s\S]{0,160}position: fixed/u);
    assert.match(cssSource, /\.investigation\[data-theme="light"\] \.sceneRepairDialog/u);
    assert.match(tutorialSource, /bottom-right question mark opens spoiler-safe Field repair/u);
    assert.match(tutorialSource, /regenerate the mansion music and ambience/u);
    assert.match(tutorialSource, /Found-item artwork uses Soft Refract/u);
    assert.match(tutorialSource, /click the Prism orb to see its hidden progress/u);
    assert.match(tutorialSource, /Every other repair runs behind the full-screen PRISM loader/u);
    assert.match(setupSource, /mystery-mansion\/theme\?repair=/u);
  });

  it("keeps generated Whodunnit visuals case-scoped without Save image controls", () => {
    assert.doesNotMatch(experienceSource, /Save evidence image|Save room image|Saved to Images/u);
    assert.doesNotMatch(experienceSource, /mystery-assets\/\$\{asset\.kind\}\/\$\{encodeURIComponent\(subjectId\)\}\/save/u);
    assert.match(setupSource, /Generated case art stays attached to its case/u);
    assert.doesNotMatch(setupSource, /unless you save a revealed visual/u);
    assert.match(tutorialSource, /encrypted case vault and follows its case or saved venue/u);
    assert.doesNotMatch(tutorialSource, /Save image/u);
  });

  it("renders case-scoped ambient architecture as inert venue massing", () => {
    assert.match(experienceSource, /state\.spatialProjection\?\.ambientSpaces\.filter/u);
    assert.match(experienceSource, /mansionAmbientSpaces\.map\(\(space\) => \(/u);
    assert.match(experienceSource, /aria-hidden="true"[\s\S]{0,100}styles\.mansionAmbientSpace/u);
    assert.match(experienceSource, /mansionGeometry[\s\S]{0,500}mansionAmbientSpaces/u);
    assert.match(
      experienceSource,
      /new Set\(state\.rooms\.map\(\(room\) => room\.floor\)\)/u,
      "only playable case rooms may create deck controls",
    );
    assert.match(cssSource, /\.mansionAmbientSpace\s*\{[\s\S]*pointer-events:\s*none/u);
    assert.doesNotMatch(experienceSource, /mansionAmbientSpaces[\s\S]{0,500}onClick/u);
    assert.match(experienceSource, /point\.x \* MANSION_LAYOUT_V2_COLUMNS/u);
    assert.match(experienceSource, /point\.y \* MANSION_LAYOUT_V2_ROWS/u);
  });

  it("keeps Mosaic and Upgraded room framing identical while the camera rests", () => {
    assert.match(
      experienceSource,
      /"--room-parallax-scale": roomParallax\.x \|\| roomParallax\.y \? "1\.012" : "1"/u,
    );
    assert.match(
      cssSource,
      /scale\(var\(--room-parallax-scale, 1\)\)/u,
    );
    assert.doesNotMatch(cssSource, /scale\(1\.012\)/u);
  });

  it("starts on the title card, then clears to a first-person exterior door threshold", () => {
    assert.match(experienceSource, /openingOrMapPlaybackSuppressed = state\.playPhase === "title_card"/u);
    assert.match(experienceSource, /preparedMansionExteriorUrl/u);
    assert.match(experienceSource, /DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1/u);
    assert.match(experienceSource, /--mansion-exterior-image/u);
    assert.match(experienceSource, /className=\{styles\.titleCoverMedia\}/u);
    assert.match(cssSource, /\.titleCoverMedia\s*\{[\s\S]*background-image:\s*var\(--mansion-exterior-image\)[\s\S]*background-size:\s*cover/u);
    assert.equal(cssSource.match(/background-image:\s*var\(--mansion-exterior-image\)/gu)?.length, 1);
    assert.match(cssSource, /\.titleCoverMedia\s*\{[^}]*z-index:\s*0[^}]*pointer-events:\s*none/u);
    assert.doesNotMatch(cssSource, /\.titleCard\s*\{[^}]*background-image/u);
    assert.match(experienceSource, /data-tutorial-target="whodunnit-start"/u);
    assert.match(experienceSource, />Start<\/button>/u);
    assert.match(experienceSource, /data-first-person-exterior=\{firstPersonExterior/u);
    assert.doesNotMatch(cssSource, /\.titleCard\[data-theme="light"\][^{]*\{[^}]*background-image/u);
    assert.match(experienceSource, /<SceneMediaVignette[\s\S]{0,100}theme=\{props\.theme\}/u);
    assert.match(experienceSource, /className=\{styles\.titleDoor\}/u);
    assert.match(cssSource, /\.titleDoor\s*\{[^}]*z-index:\s*2/u);
    assert.match(experienceSource, /data-door-threshold=\{mansionDoorEntry/u);
    assert.match(experienceSource, /data-tutorial-target="whodunnit-enter-mansion"/u);
    assert.match(cssSource, /\.titleCard\[data-exterior-entering="true"\]::after\s*\{[^}]*background:\s*#000[^}]*animation:\s*exteriorThresholdFade 1\.2s ease-in both/u);
    assert.match(cssSource, /\.titleCard\[data-theme="light"\]\[data-exterior-entering="true"\]::after\s*\{[^}]*background:\s*#fff/u);
    assert.match(experienceSource, /className=\{styles\.titleDoorFocus\}/u);
    assert.match(experienceSource, /className=\{styles\.titleDoorMark\}/u);
    assert.match(experienceSource, /venueProfile\?\.presentation\?\.entryAction\?\.trim\(\)/u);
    assert.match(experienceSource, /className=\{styles\.titleEntryAction\}>\{venueEntryAction\}/u);
    assert.match(experienceSource, /action: "enter_mansion"/u);
    assert.match(cssSource, /\.titleDoor:focus-visible/u);
    assert.match(cssSource, /\.titleDoor::before\s*\{[\s\S]*titleDoorBeacon/u);
    assert.doesNotMatch(cssSource, /titleDoor::after|titleDoorPrismGlint/u);
    assert.match(cssSource, /\.titleDoorMark\s*\{[\s\S]*border:\s*2px solid/u);
    assert.doesNotMatch(experienceSource, /styles\.titlePlayerOrb/u);
    assert.doesNotMatch(experienceSource, /styles\.titleDoorHint/u);
    assert.doesNotMatch(cssSource, /\.titlePlayerOrb/u);
    assert.doesNotMatch(cssSource, /\.titleDoorHint/u);
    assert.match(setupSource, /mysteryExteriorIntroStartedSessionId !== activeSession\.id/u);
    assert.match(setupSource, /onExteriorIntroStart=\{\(\) => setMysteryExteriorIntroStartedSessionId\(activeSession\.id\)\}/u);
    assert.match(setupSource, /mysteryCasePreludeMusicSessionActive\(activeSession\.formatState\.playPhase\)/u);
    assert.match(setupSource, /backgroundRecordable=\{false\}/u);
    assert.match(experienceSource, /if \(state\.playPhase === "case_opening"\)/u);
    assert.match(experienceSource, /nodeId === "briefing-opening"/u);
    assert.match(experienceSource, /className=\{styles\.dialogueSpeakerSignature\}[\s\S]*renderBotGlyph\(playerCharacterGlyph[\s\S]*playerCharacterName/u);
    assert.match(experienceSource, /className=\{styles\.caseOpeningStage\}[\s\S]*onClick=\{\(event\) => \{[\s\S]*operateVisibleDialogueGesture\(event\.detail, continueOpening\)/u);
    assert.match(experienceSource, /className=\{styles\.caseOpeningStage\}[\s\S]*onKeyDown=\{handleOpeningKeyDown\}/u);
    assert.doesNotMatch(experienceSource, /className=\{styles\.caseOpeningDialogue\}[\s\S]{0,280}onClick=/u);
    assert.match(experienceSource, /action: "dismiss_case_opening"/u);
    assert.match(experienceSource, /const beginCaseOpeningJourney = useCallback/u);
    assert.match(experienceSource, /mansionLayoutV2TraversalRoute\(mansionLayout, entryRoom\.id, incidentScene\.id\)/u);
    assert.match(experienceSource, /openingArrival: true/u);
    assert.match(experienceSource, /className=\{styles\.caseOpeningJourney\}/u);
    assert.match(experienceSource, /mysteryMansionTravelPointAtProgress/u);
    assert.match(experienceSource, /Walking to \{currentRoom\?\.name/u);
    assert.doesNotMatch(experienceSource, /const openingRoomImage = currentRoomImageUrl/u);
    assert.match(experienceSource, /data-opening-map-reveal=\{openingMapReveal \? "true" : undefined\}/u);
    assert.doesNotMatch(experienceSource, /--opening-room-image/u);
    assert.match(experienceSource, /continue to the incident scene/u);
    assert.match(cssSource, /\.caseOpeningStage\s*\{[\s\S]*background-color:\s*#000/u);
    assert.match(cssSource, /\.caseOpeningStage\s*\{[\s\S]*cursor:\s*pointer/u);
    assert.match(cssSource, /\.investigation\[data-opening-map-reveal="true"\]::after[\s\S]*background:\s*#000/u);
    assert.match(cssSource, /@keyframes caseOpeningReveal/u);
    assert.doesNotMatch(experienceSource, /caseOpeningPlayerAvatar/u);
    assert.match(experienceSource, /const playerCharacterName = prosecutorBot\?\.name/u);
    assert.match(experienceSource, /normalizeAccentForTheme\([\s\S]*normalizeBotIdentityColor/u);
    assert.match(setupSource, /frozenMansionExteriorThumbnailAssetIdV1\(activeMysteryMansionSnapshot\)/u);
  });

  it("selects the exterior grounds before reversible travel outside", () => {
    assert.match(experienceSource, /className=\{styles\.mansionOutsideTravelTarget\}/u);
    assert.match(experienceSource, /MYSTERY_MANSION_OUTSIDE_SELECTION_ID/u);
    assert.match(experienceSource, /aria-label="Select exterior grounds"/u);
    assert.match(experienceSource, /aria-pressed=\{mansionOutsideSelected\}/u);
    assert.match(experienceSource, /setSelectedMansionRoomId\(MYSTERY_MANSION_OUTSIDE_SELECTION_ID\)/u);
    assert.match(experienceSource, /data-selected=\{mansionOutsideSelected \? "true" : undefined\}/u);
    assert.match(experienceSource, /<strong>Exterior grounds<\/strong>/u);
    assert.match(experienceSource, />Go outside<\/button>/u);
    assert.match(experienceSource, /setVisitingExterior\(true\)/u);
    assert.match(experienceSource, /void beginExteriorEntry\(visitingExterior\)/u);
    assert.match(experienceSource, /returningFromExterior[\s\S]*\{ action: "move", roomId: foyer\.id \}[\s\S]*\{ action: "enter_mansion" \}/u);
    assert.match(experienceSource, /exteriorEntryPresentation\.returningFromExterior[\s\S]*setVisitingExterior\(false\);[\s\S]*setExteriorRoomReveal\(true\)/u);
    assert.match(experienceSource, /data-exterior-room-reveal=\{exteriorRoomReveal \? "true" : undefined\}/u);
    assert.match(cssSource, /\.investigation\[data-exterior-room-reveal="true"\]::after[\s\S]*animation:\s*exteriorRoomReveal 1\.85s/u);
    assert.match(cssSource, /\.mansionCanvas\s*\{[\s\S]*pointer-events:\s*none/u);
    assert.match(cssSource, /\.mansionRoom\s*\{[\s\S]*pointer-events:\s*auto/u);
    assert.match(cssSource, /\.mansionOutsideTravelTarget\[data-selected="true"\][\s\S]*inset 0 0 0 2px/u);
    assert.doesNotMatch(experienceSource, /outsideTravelPromptOpen|Travel outside\?/u);
    assert.doesNotMatch(experienceSource, /action: "travel_outside"/u);
  });

  it("adopts accepted mansion moves only after embodied or compact travel completes", () => {
    assert.match(experienceSource, /playerColor\?: string \| null/u);
    assert.match(experienceSource, /playerGlyph\?: string \| null/u);
    assert.match(experienceSource, /function MysteryPlayerOrb/u);
    assert.match(experienceSource, /props\.glyph\?\.trim\(\) \|\| "lucideTriangle"/u);
    assert.match(experienceSource, /props\.color\?\.trim\(\) \|\| "#ae8cff"/u);
    assert.match(experienceSource, /mansionLayoutV2TraversalRoute\(mansionLayout, currentRoom\.id, toRoom\.id\)/u);
    assert.match(experienceSource, /legacyMansionTraversalRoute\(currentRoom, toRoom\)/u);
    assert.match(experienceSource, /const deferred = await requestDeferredAction\(\{ action: "move", roomId: toRoom\.id \}\);\s*if \(!deferred\) return/u);
    assert.match(experienceSource, /if \(toRoom\.visited \|\| reducedMotion\) \{[\s\S]*playCompactTravelBridge[\s\S]*finishDeferredAction\(deferred\)/u);
    assert.match(experienceSource, /setTravelPresentation\(\{[\s\S]*deferred,[\s\S]*route/u);
    assert.match(experienceSource, /finishMansionTravel\(true\)/u);
    assert.match(experienceSource, /click, Enter, or Space to arrive now/u);
    assert.match(experienceSource, /disabled=\{busy\} onClick=\{props\.onExit\}>← Archive/u);
    assert.match(cssSource, /\.mansionPlayerOrb/u);
    assert.match(cssSource, /\.mansionTravelSkip/u);
  });

  it("uses the accepted Mansion-step exterior across Forge and the title-card surface", () => {
    assert.match(experienceSource, /mansionExteriorRevealed[\s\S]*mansionExteriorStatus !== "ready"/u);
    assert.match(
      experienceSource,
      /sealedMysteryAssetApiUrl\([\s\S]*DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1/u,
    );
    assert.match(
      experienceSource,
      /const forgeExteriorUrl = props\.mansionExteriorUrl \?\? preparedMansionExteriorUrl/u,
    );
    assert.match(cssSource, /\.forgeCard\[data-exterior-hero="true"\]::before[\s\S]*var\(--forge-exterior-image\)/u);
  });

  it("freezes optional Upgraded derivatives in Forge without overriding the case switch", () => {
    assert.match(setupSource, /<strong>Upgraded<\/strong>/u);
    assert.match(setupSource, /HD interpretation of each room's Mosaic/u);
    assert.match(setupSource, /illustratedRooms:\s*\n\s*mysteryRoomAssetSynthesis/u);
    assert.match(experienceSource, /readEncryptedWhodunnitRoomUpgradeEnabled/u);
    assert.match(experienceSource, /state\.config\.assetSynthesis\.illustratedRooms/u);
    assert.match(experienceSource, /whodunnitRoomArtStyleForUpgrade\(/u);
    assert.doesNotMatch(experienceSource, /forgeIllustratedRoomsRequested && illustratedRoomArtAvailable/u);
  });

  it("keeps exterior Refract explicit, draft-backed, and subordinate to Mansion topology", () => {
    const refractStart = setupSource.indexOf("const refractMansionExterior");
    const refractEnd = setupSource.indexOf("const mysteryCreateConfigV2", refractStart);
    const refractSource = setupSource.slice(refractStart, refractEnd);
    assert.ok(refractStart >= 0 && refractEnd > refractStart);
    assert.match(setupSource, /Refract exterior · ONLINE/u);
    assert.match(setupSource, /data-tutorial-target="whodunnit-mansion-exterior"/u);
    assert.match(setupSource, /mysteryMansionExteriorDraft/u);
    assert.match(setupSource, /mansionExteriorImageId: mysteryMansionExteriorDraft\.imageId/u);
    assert.match(setupSource, /mansionExteriorDirection: mysteryMansionExteriorDraft\.direction/u);
    assert.match(setupSource, /mysteryMansionExteriorDraft && mysteryPreset === option\.id/u);
    assert.match(setupSource, /setMysteryMansionExteriorDraft\(null\); setMysteryFloors/u);
    assert.match(setupSource, /setMysteryMansionExteriorDraft\(null\); setMysteryTotalRooms/u);
    assert.doesNotMatch(refractSource, /mysteryInspiration|inspiration:/u);
    assert.match(setupSource, /LOCAL keeps this mansion’s bundled exterior/u);
    assert.match(setupSource, /Story owns premise and tone; it may dress the selected mansion but never replaces its house, scale, or geography/u);
  });

  it("routes non-interactive case-opening and investigation clicks through the visible dialogue", () => {
    assert.match(experienceSource, /function mysteryDialogueGestureOriginIsInteractive/u);
    assert.match(experienceSource, /input, textarea, select, button, a, label, \[contenteditable\]/u);
    assert.match(experienceSource, /const decision = whodunnitDialogueGestureDecision\(/u);
    assert.match(experienceSource, /const releaseActiveDialogueAudio = useCallback[\s\S]*onReleased: outputCleanup \?\? undefined/u);
    assert.match(experienceSource, /const cancelActiveDialogueAudio = useCallback[\s\S]*cancelWhodunnitDialogueAudioImmediately\(\{/u);
    assert.match(experienceSource, /cancelSyntheticVoice: ownsSyntheticVoice[\s\S]*teardownBottishVoiceImmediately\(\{ preservePreparedMedia: true \}\)/u);
    assert.match(experienceSource, /dialogueGestureAdvanceRef\.current = null;\s*cancelActiveDialogueAudio\(\);\s*setSpeechTiming\(settledSpeechTiming\(presentation\.fullText\)\)/u);
    assert.match(experienceSource, /if \(decision === "ignore"\) return;\s*cancelActiveDialogueAudio\(\)/u);
    assert.match(experienceSource, /if \(busy \|\| \(dialoguePerformanceActive && !dialogueInterruptingAction\)\) return null;\s*cancelActiveDialogueAudio\(\);\s*setBusy\(true\)/u);
    assert.match(experienceSource, /advanceArmed: dialogueGestureAdvanceRef\.current === presentation\.key/u);
    assert.match(experienceSource, /onClickCapture=\{handleInvestigationDialogueClickCapture\}/u);
    assert.match(experienceSource, /handleInvestigationDialogueClickCapture[\s\S]*mysteryDialogueGestureOriginIsInteractive\(event\.target\)[\s\S]*operateVisibleDialogueGesture\(event\.detail, advanceVisibleRoomDialogue\)[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\)/u);
    assert.match(experienceSource, /onKeyDown=\{\(event\) => \{[\s\S]*if \(event\.key === "Enter" \|\| event\.key === " "\)[\s\S]*operateVisibleDialogueGesture\(1, advanceVisibleRoomDialogue\)/u);
    assert.match(experienceSource, /whodunnitInvestigationDialogueShouldAutoAdvance\(\{[\s\S]*hasActiveAudio: activeAudioRef\.current !== null[\s\S]*isPlayerObservation: roomPlayerObservationActive[\s\S]*requiresPlayerInput[\s\S]*streaming: dialogueSfxPresentation\.streaming/u);
    assert.match(experienceSource, /whodunnitInvestigationDialogueGraceMs\(\{[\s\S]*delivery: dialogueSfxPresentation\.delivery[\s\S]*text: dialogueSfxPresentation\.fullText/u);
    assert.match(experienceSource, /finishCurrentDialogue\(true\)/u);
  });

  it("lets Court dialogue gestures cancel speech and advance its finite queue", () => {
    assert.match(
      experienceSource,
      /const displayedDialogue = queuedDialogue \?\? heldDialogue \?\? \(\s*state\.playPhase === "trial" \? null : lastDialogue\s*\)/u,
      "Court must not resurrect a prior Press response from global dialogue history after statement navigation",
    );
    assert.match(
      experienceSource,
      /const focusStatement = \(offset: number\): void => \{[\s\S]*!activeStatement[\s\S]*next\.statementId === activeStatement\.statementId[\s\S]*cancelActiveDialogueAudio\(\);\s*setHeldDialogue\(null\);\s*setSpeechTiming\(null\);[\s\S]*action: "focus_statement"/u,
      "moving to another statement must dismiss the prior statement's held Press response",
    );
    assert.match(
      experienceSource,
      /const courtDialogue = courtPresentationActive;[\s\S]*whodunnitCourtDialogueFinishDecision\(\{ hasQueuedResponse \}\)[\s\S]*setDialoguePlaybackIndex\(\(index\) => index \+ 1\);[\s\S]*setInterrogationPhase\(courtDialogue \? null : whodunnitInterrogationEntrancePhaseForEntry\(/u,
    );
    assert.match(
      experienceSource,
      /if \(decision === "clear"\) \{\s*setHeldDialogue\(null\);\s*setSpeechTiming\(null\);\s*setInterrogationPhase\(null\);\s*setDialoguePlaybackQueue\(\[\]\);\s*setDialoguePlaybackIndex\(0\);\s*return;\s*\}/u,
      "the last Court beat must fully clear its presentation before actions or the verdict can appear",
    );
    assert.match(
      experienceSource,
      /const courtPresentedWitnessSeatId = whodunnitCourtPresentedWitnessSeatId\(\{[\s\S]*dialogueQueue: dialoguePlaybackQueue[\s\S]*\}\);[\s\S]*courtPresentedWitnessBot \? props\.renderMysteryBotAvatar/u,
      "the witness stand must follow the queued Court speaker instead of switching early to the next chapter",
    );
    assert.match(
      experienceSource,
      /state\.playPhase === "verdict" && state\.verdict && !courtPresentationActive[\s\S]*if \(courtPresentationActive && state\.court && activeStatement\)/u,
      "the final exchange must remain visible and interactive before the verdict replaces Court",
    );
    assert.match(
      experienceSource,
      /const handleCourtDialogueClick = \(event: React\.MouseEvent<HTMLElement>\): void => \{[\s\S]*whodunnitCourtDialogueGestureCrossedPresentation\(\{[\s\S]*presentationKey: dialogueSfxPresentation\?\.key \?\? null[\s\S]*operateVisibleDialogueGesture\(event\.detail, finishCurrentDialogue\)[\s\S]*event\.preventDefault\(\);[\s\S]*event\.stopPropagation\(\)/u,
    );
    assert.match(
      experienceSource,
      /className=\{styles\.courtReaction\}[\s\S]{0,260}onClick=\{handleCourtDialogueClick\}[\s\S]{0,180}onKeyDown=\{handleCourtDialogueKeyDown\}/u,
    );
    assert.match(
      experienceSource,
      /<p role="button" tabIndex=\{0\} onClick=\{handleCourtDialogueClick\} onKeyDown=\{handleCourtDialogueKeyDown\}/u,
    );
    assert.doesNotMatch(experienceSource, /onDoubleClick=\{finishCurrentDialogue\}/u);
    assert.match(
      experienceSource,
      /data-tutorial-target="mystery-v2-press"[\s\S]{0,420}data-tutorial-target="mystery-v2-present-record"[\s\S]{0,520}data-tutorial-target="mystery-v2-think"/u,
    );
    assert.match(
      experienceSource,
      /disabled=\{busy \|\| dialoguePerformanceActive\}/u,
    );
    assert.match(cssSource, /\.courtReaction\[role="button"\][\s\S]*cursor:\s*pointer/u);
  });

  it("stages a directed courtroom with witness, counsel, judge, and evidence cameras", () => {
    assert.match(experienceSource, /resolveWhodunnitCourtCamera\(\{/u);
    assert.match(experienceSource, /className=\{styles\.courtStage\}[\s\S]{0,180}data-camera=\{courtCamera\}/u);
    assert.doesNotMatch(
      experienceSource,
      /whodunnit-witness-silhouette\.png/u,
    );
    assert.match(experienceSource, /coffee-table\/table_\$\{props\.theme\}\.png/u);
    assert.match(experienceSource, /whodunnit-witness-foreground-\$\{props\.theme\}\.png/u);
    assert.match(experienceSource, /moderator-gavel-\$\{props\.theme\}-down\.png/u);
    assert.match(experienceSource, /className=\{styles\.counselGlyph\}/u);
    assert.doesNotMatch(experienceSource, /className=\{styles\.witnessIdentity/u);
    assert.match(experienceSource, /className=\{styles\.courtPodiumForeground\}/u);
    assert.match(experienceSource, /style=\{props\.stageAlignmentStyle\}/u);
    assert.match(experienceSource, /data-court-evidence-projectors="true"/u);
    assert.match(experienceSource, /data-projector-side="image"[\s\S]*?data-projector-side="record"/u);
    assert.match(experienceSource, /presentedCourtRecordItem\.description/u);
    assert.match(experienceSource, /presentedCourtRecordItem && courtCamera === "witness"/u);
    assert.doesNotMatch(experienceSource, /setCourtCamera|courtCameraControl/u);
    assert.match(cssSource, /\.courtStage\[data-camera="witness"\] \.courtBackdrop[\s\S]*whodunnit-witness-dark/u);
    assert.match(cssSource, /--whodunnit-wide-evidence-table-scale/u);
    assert.match(cssSource, /\.witnessAvatar \{[^}]*bottom:\s*clamp\(21rem,\s*36vh,\s*27rem\)[^}]*--whodunnit-witness-scale/u);
    assert.match(cssSource, /--whodunnit-defense-mini-offset-x/u);
    assert.match(cssSource, /\.counselSeat\[data-side="prosecution"\] \{[^}]*right:\s*clamp/u);
    assert.match(cssSource, /\.counselSeat\[data-side="defense"\] \{[^}]*left:\s*clamp/u);
    assert.match(cssSource, /\.courtPodiumFocus\[data-side="prosecution"\] \{[^}]*translate3d\(-24%,\s*-10%,\s*0\) scale\(1\.48\)/u);
    assert.match(cssSource, /\.courtPodiumFocus\[data-side="defense"\] \{[^}]*translate3d\(24%,\s*-10%,\s*0\) scale\(1\.48\)/u);
    assert.match(cssSource, /\.courtStage\[data-camera="prosecution"\] \.courtBackdrop \{[^}]*translate3d\(-24%,\s*-10%,\s*0\) scale\(1\.48\)/u);
    assert.match(cssSource, /\.courtStage\[data-camera="defense"\] \.courtBackdrop \{[^}]*translate3d\(24%,\s*-10%,\s*0\) scale\(1\.48\)/u);
    assert.match(cssSource, /\.courtPodiumForeground \{[^}]*forum-dark-foreground\.png/u);
    assert.match(cssSource, /\.courtEvidencePrism \{[^}]*clip-path:\s*polygon\(50% 0, 100% 86%, 50% 100%, 0 86%\)/u);
    assert.match(cssSource, /\.courtEvidenceProjector \{[^}]*--court-projector-anchor:\s*53%/u);
    assert.match(cssSource, /\.courtEvidenceProjector\[data-projector-side="record"\] \{[^}]*--court-projector-anchor:\s*47%/u);
    assert.match(cssSource, /\.courtEvidenceBeam \{[^}]*left:\s*calc\(var\(--court-projector-anchor\) - 24%\)/u);
    assert.match(cssSource, /\.courtEvidenceProjectorMount \{[^}]*left:\s*var\(--court-projector-anchor\)[^}]*transform:\s*translateX\(-50%\)/u);
    assert.match(cssSource, /\.courtEvidenceProjection::before \{[\s\S]*mix-blend-mode:\s*screen/u);
    assert.match(cssSource, /@media \(max-width: 760px\)[\s\S]*\.courtEvidenceProjectors \{[\s\S]*grid-template-columns/u);
    assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.courtEvidenceProjection,[\s\S]*animation:\s*none/u);
    assert.doesNotMatch(cssSource, /\.witnessIdentity/u);
    assert.match(cssSource, /@media \(max-width: 560px\)[\s\S]*\.counselAvatar \{ display: none; \}[\s\S]*\.counselGlyph \{ display: grid; \}/u);
  });

  it("keeps a failed-verdict rebuttal visible while allowing retry to interrupt it", () => {
    assert.match(
      experienceSource,
      /whodunnitCourtPresentationVisible\(\{\s*hasQueuedDialogue: queuedDialogue !== null,\s*playPhase: state\.playPhase,\s*\}\)/u,
      "verdict-bound Court dialogue remains a visible presentation while its queue is active",
    );
    assert.match(
      experienceSource,
      /const dialogueInterruptingAction = introductionAction \|\| action\.action === "retry_witness_checkpoint";\s*if \(busy \|\| \(dialoguePerformanceActive && !dialogueInterruptingAction\)\) return null/u,
      "the verdict retry must not be rejected by the dialogue-performance guard",
    );
    assert.match(
      experienceSource,
      /if \(action\.action === "retry_witness_checkpoint"\) \{\s*setCommand\(null\);\s*setHeldDialogue\(null\);\s*setSpeechTiming\(null\);\s*setDialoguePlaybackQueue\(\[\]\);\s*setDialoguePlaybackIndex\(0\);\s*setInterrogationPhase\(null\);\s*setPresentedCourtRecord\(null\);\s*\}/u,
      "restoring the witness must discard the failed objection's playback state",
    );
    assert.match(
      experienceSource,
      /disabled=\{busy\} onClick=\{\(\) => void sendAction\(\{ action: "retry_witness_checkpoint" \}\)\}>Retry current witness/u,
      "the visible retry remains available while stale dialogue is being interrupted",
    );
  });

  it("keeps unseen occupants off the mansion and stages the finite first-visit reveal", () => {
    assert.match(experienceSource, /const roomSuspects = room\.visited[\s\S]*\? state\.suspects\.filter[\s\S]*: \[\]/u);
    assert.match(experienceSource, /roomIntroductionPhase = currentRoom[\s\S]*state\.roomIntroductions\[currentRoom\.id\]/u);
    assert.match(experienceSource, /roomIntroductionAwaitingContinue = roomIntroductionPhase === "casekeeper"/u);
    assert.match(experienceSource, /debateMysteryRoomIntroductionGestureV2\(\{/u);
    assert.match(experienceSource, /roomIntroductionGesture === "reveal_casekeeper_narration"[\s\S]*setRevealedCasekeeperNarrationKey/u);
    assert.match(experienceSource, /roomIntroductionGesture === "advance_to_persona"[\s\S]*action: "advance_room_introduction"/u);
    assert.match(experienceSource, /action: "advance_room_introduction"/u);
    assert.match(experienceSource, /action: "complete_room_introduction"/u);
    assert.match(experienceSource, /roomIntroductionPersonaActive/u);
    assert.match(
      experienceSource,
      /mysteryInvestigationMusicMix\(\{[\s\S]*roomIntroductionActive/u,
    );
    assert.match(experienceSource, /action\.action === "advance_room_introduction"[\s\S]*startWhodunnitInterrogation\(exchange/u);
    assert.match(experienceSource, /roomDisplayedDialogue = queuedDialogue \?\? heldDialogue \?\? roomIntroductionDialogue/u);
    assert.match(experienceSource, /whodunnitInterrogationEntrancePhaseForEntry\([\s\S]*nextEntry[\s\S]*state\.config\.prosecutorBotId/u);
    assert.match(experienceSource, /if \(roomIntroductionActive \|\| !dialogueSfxPresentation\) return/u);
    assert.match(experienceSource, /automatic \|\| roomIntroductionPhase === "persona"/u);
    assert.match(experienceSource, /const beatMs = reducedMotion \? 0 : whodunnitInterrogationBeatMs\(interrogationPhase\)/u);
    assert.match(experienceSource, /!roomIntroductionActive \? <nav className=\{styles\.investigationCommands\}/u);
    assert.match(experienceSource, /!roomIntroductionActive \? liveSessionHeaderPortalTargets \? <>/u);
    assert.match(experienceSource, /liveSessionHeaderPortalTargets\.title/u);
    assert.match(experienceSource, /liveSessionHeaderPortalTargets\.actions/u);
    assert.match(experienceSource, /: <header className=\{styles\.investigationHeader\}>/u);
    assert.match(experienceSource, /!roomIntroductionActive \? <div className=\{styles\.roomTitle\}/u);
    assert.match(experienceSource, /roomIntroductionPhase !== "casekeeper" \? <div className=\{styles\.roomShade\}/u);
    assert.match(experienceSource, /data-blurred=\{roomActorVisible/u);
    assert.match(experienceSource, /\{roomIntroductionAwaitingContinue \? null : \(\s*<small>/u);
    assert.match(
      experienceSource,
      /debateMysteryRoomIntroductionShouldAutoCompleteV2\(\{\s*busy,\s*hasActiveAudio: activeAudioRef\.current !== null,\s*hasHeldDialogue: heldDialogue !== null,\s*hasQueuedDialogue: queuedDialogue !== null,\s*phase: roomIntroductionPhase/u,
    );
    assert.match(
      experienceSource,
      /setSpeechTiming\(null\);\s*void sendAction\(\{ action: "complete_room_introduction", roomId: currentRoom\.id \}\)/u,
      "a naturally settled persona introduction must release its timing before completing the room reveal",
    );
    assert.match(experienceSource, /className=\{styles\.casekeeperThinkingDots\}[\s\S]*aria-label="Taking in the room"/u);
    assert.match(experienceSource, /debateMysteryRoomCasekeeperNarrationTextV2\(\{[\s\S]*roomNarrationAppearance[\s\S]*currentRoom\.hotspots[\s\S]*persistedNarration/u);
    assert.doesNotMatch(experienceSource, /casekeeperIdentity|Room occupant:/u);
    assert.match(experienceSource, /aria-busy=\{roomIntroductionAwaitingContinue && roomCasekeeperNarrationVisible && busy\}/u);
    assert.match(experienceSource, /Bringing the occupant forward…/u);
    assert.match(experienceSource, /"Click to continue"/u);
    assert.match(experienceSource, /className=\{styles\.dialogueSpeakerSignature\}[\s\S]*renderBotGlyph\(roomDialoguePersonaGlyph/u);
    assert.match(experienceSource, /roomIntroductionAwaitingContinue \? null : \(/u);
    assert.match(experienceSource, /data-speaker=\{roomDialogueSpeakerKind\}/u);
    assert.match(cssSource, /\.roomScene\[data-room-introduction\]\s*\{\s*min-height:\s*100dvh/u);
    assert.match(cssSource, /@keyframes casekeeperThinkingDots[\s\S]*width:\s*1ch[\s\S]*width:\s*2ch[\s\S]*width:\s*3ch/u);
    assert.match(cssSource, /\.dialogueBox\[data-speaker="persona"\][\s\S]*var\(--dialogue-accent/u);
    assert.match(cssSource, /\.dialogueBox\[data-casekeeper-stage="narration"\][\s\S]*var\(--dialogue-accent/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce[\s\S]*\.casekeeperThinkingDots\s*\{\s*width:\s*3ch;\s*animation:\s*none/u);
    assert.match(tutorialSource, /embodied Prosecutor's thought beat settles/u);
    assert.match(tutorialSource, /selected Prosecutor speaks first in its exact portrait and voice/u);
    assert.match(tutorialSource, /Earlier two-line cases retain their replay-stable compatibility introduction/u);
  });

  it("uses only the on-demand local cache during gameplay", () => {
    assert.match(experienceSource, /mystery-audio\/\$\{encodeURIComponent\(lineId\)\}/u);
    assert.match(experienceSource, /Premium voices are unavailable in Whodunnit V2/u);
    assert.match(experienceSource, /No ElevenLabs request will be made/u);
    assert.match(experienceSource, /spoken lines cache on demand/u);
    assert.doesNotMatch(experienceSource, /playMysteryVoice|playMysteryPlayerVoice|elevenlabs\.io/iu);
  });

  it("returns from Archive without replaying the durable dialogue checkpoint", () => {
    assert.match(
      setupSource,
      /session\.format === "whodunnit"[\s\S]{0,260}mysteryArchiveReturnAudioRef\.current = \{[\s\S]{0,180}debateMysteryRestoredAudioPerformanceKeyV2\(session\.formatState\)/u,
    );
    assert.match(
      setupSource,
      /restoredAudioPerformanceKey:[\s\S]{0,180}mysteryArchiveReturnAudioRef\.current\?\.performanceKey/u,
    );
    assert.match(
      experienceSource,
      /debateMysteryPreparedAudioShouldStart\(\{[\s\S]{0,420}restoredPerformanceKey: props\.restoredAudioPerformanceKey/u,
    );
    assert.match(
      experienceSource,
      /if \(restoredPlayback\) \{\s*lastPlayedPerformanceKeyRef\.current = playbackPerformanceKey;\s*return;/u,
      "a restored trial beat must stay quiet and must not auto-advance as completed playback",
    );
  });

  it("replays Identity Crisis from the frozen Power plan and public dialogue only", () => {
    assert.match(experienceSource, /debateMysteryIdentityMirrorPresentationsV1/u);
    assert.match(experienceSource, /mysteryIdentityMirrorAppearance/u);
    assert.match(experienceSource, /IdentityPresentationBlackout/u);
    assert.match(experienceSource, /botIdentityPresentationTransitionActiveV1/u);
    assert.match(experienceSource, /BOT_IDENTITY_PRESENTATION_TRANSITION_MS/u);
    assert.match(experienceSource, /state\.identityMirrorTargetSnapshots\[mirror\.targetBotId\]/u);
    assert.match(experienceSource, /state\.identityMirrorTargetSnapshots\[bot\.id\]/u);
    assert.match(experienceSource, /debateMysteryIdentityMirrorTargetBotSnapshotV1/u);
    assert.match(experienceSource, /debateMysteryIdentityMirrorFaceV1\(frozenHolder, frozenTarget\)/u);
    assert.match(experienceSource, /faceStyleOverride/u);
    assert.match(setupSource, /faceStyleOverride: bot\.faceStyleOverride \?\? null/u);
    assert.match(experienceSource, /debateMysteryPublicIdentityNameV1\(copiedName\)/u);
    assert.doesNotMatch(
      experienceSource,
      /mysteryIdentityMirrorAppearance\(bot, botById\.get\(mirror\.targetBotId\)/u,
    );
  });

  it("stages each Talk topic as a streamed player-Prosecutor question followed by the centered suspect", () => {
    assert.match(experienceSource, /nextState\.dialogueHistory\.slice\(previousDialogueCount\)/u);
    assert.match(experienceSource, /setDialoguePlaybackQueue\(exchange\)/u);
    assert.match(experienceSource, /command === "talk" && currentSuspect && !dialoguePerformanceActive/u);
    assert.match(experienceSource, /Prosecutor/u);
    assert.match(experienceSource, /splitDebateMysteryStageActionTextV2\([\s\S]*roomDialoguePresentationText/u);
    assert.match(experienceSource, /const roomDialoguePresentationText = roomIntroductionAwaitingContinue[\s\S]*: roomDisplayedDialogue\?\.visibleText \?\? ""/u);
    assert.match(experienceSource, /roomDisplayedDialogue\?\.stageActionText \?\? roomDialogueDelivery\.stageActionText/u);
    assert.match(experienceSource, /mysterySignalActionPresentation\([\s\S]*roomDisplayedDialogue/u);
    assert.match(experienceSource, /roomSuspectStageActionText && roomActionPresentation \? <SignalVoiceActionText/u);
    assert.match(experienceSource, /key=\{`suspect:\$\{roomDisplayedDialogue\?\.nodeId/u);
    assert.match(experienceSource, /revealedSpeechText\(\s*whodunnitCaptionSpeechText\(roomDialogueDelivery\.spokenText\),\s*captionSpeechTiming/u);
    assert.match(experienceSource, /whodunnitCaptionRevealIsPending\(\{/u);
    assert.match(experienceSource, /setSpeechTiming\(settledSpeechTiming\(playbackText\)\)/u);
    assert.match(experienceSource, /activeStatement\?\.stageActionText \?\? activeStatementDelivery\.stageActionText/u);
    assert.match(experienceSource, /courtWitnessActionPresentation \? <SignalVoiceActionText/u);
    assert.match(experienceSource, /revealedSpeechText\(whodunnitCaptionSpeechText\(activeStatementDelivery\.spokenText\), captionSpeechTiming\)/u);
    assert.match(experienceSource, /<SignalVoiceActionText key=\{`prosecution:[\s\S]*\.\.\.dialogueActionPresentation/u);
    assert.match(signalActionSource, /data-signal-voice-action="true"/u);
    assert.match(signalActionCssSource, /transition:\s*opacity 120ms linear, transform 180ms ease/u);
    assert.match(signalActionCssSource, /\[data-phase="entering"\][\s\S]*translateY\(3px\)/u);
    assert.match(signalActionCssSource, /\[data-phase="exiting"\][\s\S]*translateY\(-4px\)/u);
    assert.match(signalActionCssSource, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none/u);
    assert.doesNotMatch(cssSource, /\.roomActorAction|\.counselAction|\.witnessAction/u);
    assert.match(experienceSource, /createWhodunnitSpeechTimingLoop\(\{/u);
    assert.match(experienceSource, /audio\.addEventListener\("playing", startSpeechTimingLoop, \{ once: true \}\)/u);
    assert.match(experienceSource, /debateVoiceCompletionFallbackDurationMs\(playbackText\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("loadedmetadata", refreshSpeechTimingLoop\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("durationchange", refreshSpeechTimingLoop\)/u);
    assert.match(experienceSource, /audio\.removeEventListener\("loadedmetadata", refreshSpeechTimingLoop\)/u);
    assert.match(experienceSource, /audio\.removeEventListener\("durationchange", refreshSpeechTimingLoop\)/u);
    assert.match(experienceSource, /mix=\{WHODUNNIT_COURT_ATMOSPHERE_MIX\}/u);
    assert.match(experienceSource, /releaseOutput\?\.release\(\);\s*completeBeat\(\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("ended", completeBeatNaturally, \{ once: true \}\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("error", completeBeat, \{ once: true \}\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("pause", completeBeat, \{ once: true \}\)/u);
    assert.match(experienceSource, /whodunnitDialogueTypewriterDurationMs\(dialogueSfxFullText\)/u);
    assert.match(experienceSource, /queued: Boolean\(playbackText\)/u);
    assert.match(experienceSource, /captionRevealGenerationRef/u);
    assert.match(experienceSource, /window\.setTimeout\(reveal, roomPlayerObservationActive \? 0 : 180\)/u);
    assert.match(experienceSource, /function mysteryProsecutorOpeningText/u);
    assert.match(experienceSource, /"I am the lead investigator"/u);
    assert.match(experienceSource, /startWhodunnitInterrogation\(exchange, nextState\.config\.prosecutorBotId, suspectSeatId\)/u);
    assert.match(experienceSource, /whodunnitInterrogationBeatMs\(interrogationPhase\)/u);
    assert.match(experienceSource, /interrogationPhase === "prosecutor_speaking"/u);
    assert.match(experienceSource, /whodunnitInterrogationCompletionIsCurrent\(audioGeneration, audioGenerationRef\.current\)/u);
    assert.match(experienceSource, /whodunnitInterrogationFinishDecision\(/u);
    assert.match(experienceSource, /audioMouthActive && roomDisplayedDialogue\?\.speakerSeatId === currentSuspect\?\.seatId/u);
    assert.match(experienceSource, /audioMouthActive && !heldDialogue/u);
    assert.match(experienceSource, /const roomSpeechInkVisible = !dialoguePerformanceActive \|\| interrogationPhase === "handoff"/u);
    assert.match(experienceSource, /facing: "left", speechInkVisible: roomSpeechInkVisible/u);
    assert.match(experienceSource, /facing: "right", speechInkVisible: roomSpeechInkVisible/u);
    assert.doesNotMatch(
      setupSource,
      /defaultRestingMouthCharacter/u,
      "ordinary Whodunnit cast must keep each bot's authored idle mouth",
    );
    assert.match(setupSource, /speechInkVisible: performance\?\.speechInkVisible/u);
    assert.match(experienceSource, /debateMysteryRoomIntroductionGestureV2\(\{[\s\S]*reveal_casekeeper_narration[\s\S]*advance_room_introduction[\s\S]*finishCurrentDialogue/u);
    assert.match(
      experienceSource,
      /releaseActiveDialogueAudio\(\)/u,
    );
    assert.match(experienceSource, /setHeldDialogue\(queuedDialogue\)/u);
    assert.match(experienceSource, /roomProsecutorActive/u);
    assert.match(experienceSource, /const roomActorVisible = Boolean\([\s\S]*roomIntroductionPersonaActive/u);
    assert.match(experienceSource, /className=\{styles\.roomBackdropImage\}[\s\S]{0,140}data-blurred=\{roomActorVisible/u);
    assert.doesNotMatch(experienceSource, /className=\{styles\.roomBackdrop\}/u);
    assert.match(experienceSource, /className=\{styles\.roomParallaxLayer\}/u);
    assert.match(experienceSource, /roomParallaxEnabled = Boolean\([\s\S]*command === "examine"/u);
    assert.match(experienceSource, /if \(!roomParallaxEnabled\) setRoomParallax\(\{ x: 0, y: 0 \}\)/u);
    assert.match(experienceSource, /handleRoomPointerLeave/u);
    assert.match(experienceSource, /roomActorVisible && currentBot/u);
    assert.match(experienceSource, /\$\{styles\.roomActor\} \$\{styles\.roomProsecutorActor\}/u);
    assert.match(experienceSource, /roomContextKey = state\.roomView === "room" \? state\.currentRoomId : null/u);
    assert.match(experienceSource, /state\.dialogueHistory\.length > roomDialogueBaseline\.historyCount/u);
    assert.match(experienceSource, /setRoomDialogueBaseline\(\{[\s\S]*historyCount: state\.dialogueHistory\.length/u);
    assert.match(experienceSource, /roomDisplayedDialogue \? \([\s\S]*className=\{styles\.dialogueBox\}/u);
    assert.match(experienceSource, /function hotspotSpotStyle\(/u);
    assert.match(experienceSource, /style=\{hotspotSpotStyle\(hotspot\.polygon\)\}/u);
    assert.match(experienceSource, /clipPath: `polygon/u);
    assert.match(cssSource, /\.hotspots button\s*\{[\s\S]*inset:\s*0/u);
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*left:\s*50%/u);
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*bottom:\s*19\.5rem/u);
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*transform:\s*translateX\(-50%\)/u);
    const roomActorRule = cssSource.match(/\.roomActor\s*\{[\s\S]*?\}/u);
    assert.ok(roomActorRule);
    assert.match(roomActorRule[0], /width:\s*min\(30rem,\s*44vw\)/u);
    assert.match(roomActorRule[0], /bottom:\s*19\.5rem/u);
    const roomAvatarMiniRule = cssSource.match(
      /\.roomActor\[data-art-style="mosaic"\]\s*:global\(\[data-chat-mini-bot-avatar="true"\]\[data-size="room"\]\)\s*\{[\s\S]*?\}/u,
    );
    assert.ok(roomAvatarMiniRule);
    assert.match(
      roomAvatarMiniRule[0],
      /--chat-mini-bot-render-size:\s*min\(30rem, 44vw, 56vh\)/u,
    );
    assert.match(roomAvatarMiniRule[0], /--chat-mini-bot-glyph-size:\s*max\(18px, calc\(var\(--chat-mini-bot-render-size\) \* 0\.12\)\)/u);
    assert.doesNotMatch(roomAvatarMiniRule[0], /--chat-mini-bot-lower-screen-/u);
    assert.match(roomAvatarMiniRule[0], /transform:\s*scale\(1\.19128713\)/u);
    assert.doesNotMatch(cssSource, /\.roomActor\s*\{[\s\S]{0,240}right:\s*8%/u);
    assert.match(cssSource, /\.roomBackdropImage\[data-blurred="true"\]\s*\{[\s\S]*filter:\s*blur\(12px\)/u);
    assert.match(experienceSource, /roomParallaxEnabled/u);
    assert.match(cssSource, /--room-parallax-x/u);
    assert.match(cssSource, /\.roomParallaxLayer\s*\{[\s\S]*translate3d\(var\(--room-parallax-x/u);
    assert.match(cssSource, /\.roomActor\[data-prosecutor-speaking="true"\]/u);
    assert.match(cssSource, /\[data-interrogation-phase="prosecutor_entrance"\]/u);
    assert.match(experienceSource, /className=\{styles\.roomActorDrift\}/u);
    assert.match(experienceSource, /mysteryRoomActorDriftStyle\(`\$\{props\.session\.id\}:\$\{currentBot\.id\}:suspect`\)/u);
    assert.match(experienceSource, /mysteryRoomActorDriftStyle\(`\$\{props\.session\.id\}:\$\{prosecutorBot\.id\}:prosecutor`\)/u);
    assert.match(cssSource, /\.roomActorDrift\s*\{[\s\S]*animation:\s*roomActorIdleDrift var\(--room-actor-drift-duration/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce[\s\S]*\.roomActorDrift\s*\{\s*animation:\s*none/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
  });

  it("loops suspect and prosecutor idle drift without a boundary snap or pause", () => {
    assert.match(
      cssSource,
      /\.roomActorDrift\s*\{[\s\S]*animation:\s*roomActorIdleDrift var\(--room-actor-drift-duration, 7\.4s\) linear var\(--room-actor-drift-delay, 0ms\) infinite/u,
    );
    assert.match(
      cssSource,
      /@keyframes roomActorIdleDrift\s*\{[\s\S]*from\s*\{\s*transform:\s*scaleX\(0\.5\) rotate\(0turn\) translate3d\(6px, 0, 0\) rotate\(0turn\) scaleX\(2\);\s*\}[\s\S]*to\s*\{\s*transform:\s*scaleX\(0\.5\) rotate\(1turn\) translate3d\(6px, 0, 0\) rotate\(-1turn\) scaleX\(2\);\s*\}/u,
    );
    assert.doesNotMatch(
      cssSource,
      /animation:\s*roomActorIdleDrift[^;]*ease-in-out/u,
    );
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*transform:\s*translateX\(-50%\)/u);
    assert.match(cssSource, /\.roomActor\[data-prosecutor-speaking="true"\][\s\S]*transform:\s*translateX\(-40%\) translateY\(0\.4rem\) scale\(0\.9\)/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce[\s\S]*\.roomActorDrift\s*\{\s*animation:\s*none;\s*transform:\s*none;\s*will-change:\s*auto/u);
  });

  it("groups typed Talk subjects, preserves room labels, and keeps records in Present", () => {
    assert.match(experienceSource, /MYSTERY_TALK_CATEGORY_ORDER = \["person", "motive", "alibi", "room", "general"\]/u);
    assert.match(experienceSource, /topic\.subject\.category === category/u);
    assert.match(experienceSource, /subject\.category !== "room"/u);
    assert.match(experienceSource, /room\.id === subject\.roomId/u);
    assert.match(experienceSource, /return `\$\{roomName\} · \$\{topic\.label\}`/u);
    assert.match(experienceSource, /Evidence and testimony stay in Present/u);
    assert.match(experienceSource, /data-blocked=\{!topic\.unlocked \? "true"/u);
    assert.match(experienceSource, /disabled=\{busy \|\| dialoguePerformanceActive \|\| !topic\.unlocked\}/u);
    assert.doesNotMatch(experienceSource, /topic\.suspectSeatId === currentSuspect\.seatId && topic\.unlocked/u);
    assert.match(experienceSource, /command === "present"[\s\S]*renderRecordButtons\(\(record\) => void sendAction\(\{ action: "present_to_suspect"/u);
    assert.match(cssSource, /\.topicGroup h3/u);
    assert.match(cssSource, /\.topicList button\[data-blocked="true"\]/u);
  });

  it("attributes examination observations to the player and accompanies them with Babble", () => {
    assert.match(experienceSource, /delivery === "text_only"/u);
    assert.match(experienceSource, /nodeId\.startsWith\("examine-"\)/u);
    assert.match(experienceSource, /const playbackLineId = openingOrMapPlaybackSuppressed \|\| dialogueIsTextOnly \? null/u);
    assert.match(experienceSource, /const roomPlayerObservationActive = Boolean\(/u);
    assert.match(experienceSource, /debateMysteryTextVoiceModeForPresentation\(\{[\s\S]*playerObservation: roomPlayerObservationActive/u);
    assert.match(experienceSource, /roomPlayerObservationActive[\s\S]*renderBotGlyph\(playerCharacterGlyph \?\? null[\s\S]*playerCharacterName/u);
    assert.match(experienceSource, /roomPlayerObservationActive[\s\S]*"--dialogue-accent": playerCharacterColor/u);
    assert.match(experienceSource, /debateMysteryNewCaseFileUpdateV2\(\{/u);
    assert.match(experienceSource, /playControlSfx\("evidence"\)/u);
    assert.match(experienceSource, /"Observation logged"/u);
    assert.match(experienceSource, /<h3>Observation Log<\/h3>/u);
    assert.match(experienceSource, /<h3>Case Kit<\/h3>/u);
    assert.match(experienceSource, /\{props\.playerName\} · personal observation/u);
    assert.match(experienceSource, /className=\{styles\.caseFileBackdrop\}/u);
    assert.match(experienceSource, /className=\{styles\.caseFileInvestigator\}[\s\S]*<small>Investigator<\/small>[\s\S]*\{props\.playerName\}/u);
    assert.match(experienceSource, /renderMysteryBotAvatar\(props\.playerBot, "full"/u);
    assert.match(experienceSource, /const metWitnesses = props\.state\.suspects\.filter\(\(suspect\) =>[\s\S]*props\.state\.metSuspectSeatIds\.includes\(suspect\.seatId\)\)/u);
    assert.match(experienceSource, /<h3>Witnesses<\/h3>[\s\S]*\{metWitnesses\.map\(\(suspect\) =>/u);
    assert.match(experienceSource, /No witnesses met yet\./u);
    assert.doesNotMatch(experienceSource, /<h3>Witnesses<\/h3>\}\{props\.state\.suspects\.map/u);
    assert.match(experienceSource, /className=\{styles\.caseFileObservationEntries\}/u);
    assert.match(cssSource, /\.acquisitionNotice\s*\{/u);
    assert.match(cssSource, /\.caseFileBackdrop\s*\{[\s\S]*backdrop-filter:\s*blur\(14px\)/u);
    assert.match(cssSource, /\.caseFileObservationEntries\s*\{[\s\S]*max-block-size:[\s\S]*overflow-y:\s*auto/u);
    assert.match(experienceSource, /const lensActive = Boolean\([\s\S]*currentRoomUnexaminedHotspots\.length > 0/u);
    assert.match(experienceSource, /data-lens-active=\{lensActive/u);
    assert.match(experienceSource, /setInvestigationLens\(resolveDebateMysteryV2Lens\(/u);
    assert.match(experienceSource, /onClick=\{handleRoomInvestigationClick\}/u);
    assert.match(experienceSource, /const handleRoomInvestigationClick = \(event: React\.MouseEvent<HTMLElement>\): void => \{[\s\S]*if \(roomObservationAwaitingContinue\) \{\s*finishCurrentDialogue\(\);\s*return;\s*\}[\s\S]*if \(!lensActive\) return;/u);
    assert.match(experienceSource, /debateMysteryV2LensClickTarget\(lens\)/u);
    assert.match(experienceSource, /style=\{\{ left: `\$\{investigationLens\.x\}%`, top: `\$\{investigationLens\.y\}%`/u);
    assert.match(experienceSource, /onFocus=\{\(\) => \{ const point = debateMysteryV2HotspotFocusPoint/u);
    assert.match(experienceSource, /data-examining=\{examiningHotspotId === hotspot\.id/u);
    assert.match(experienceSource, /const roomObservationAwaitingContinue = Boolean\(/u);
    assert.match(experienceSource, /roomPlayerObservationActive[\s\S]*speechTiming[\s\S]*elapsedMs >= speechTiming\.durationMs/u);
    assert.match(experienceSource, /isPlayerObservation: roomPlayerObservationActive/u);
    assert.match(experienceSource, /if \(!queuedDialogue\) \{[\s\S]*if \(roomDisplayedDialogue\) \{[\s\S]*setRoomDialogueBaseline\(\{/u);
    assert.match(experienceSource, /data-awaiting-continue=\{roomObservationAwaitingContinue \|\| roomIntroductionActive \? "true" : undefined\}/u);
    assert.match(experienceSource, /roomObservationAwaitingContinue \|\| roomIntroductionActive[\s\S]*styles\.dialogueContinueHint[\s\S]*Click to continue/u);
    assert.match(experienceSource, /debateMysteryTextVoiceShouldStart\(\{[\s\S]*playerObservation: roomPlayerObservationActive/u);
    assert.match(experienceSource, /const textVoiceVisibleText = roomPlayerObservationActive[\s\S]*\? dialogueSfxFullText[\s\S]*: dialogueSfxVisibleText/u);
    assert.match(experienceSource, /visibleText: textVoiceVisibleText/u);
    assert.match(experienceSource, /window\.setTimeout\(reveal, roomPlayerObservationActive \? 0 : 180\)/u);
    assert.match(experienceSource, /debateMysteryTextVoiceShouldStop\(\{[\s\S]*playerObservation: roomPlayerObservationActive/u);
    assert.match(experienceSource, /const advanceVisibleRoomDialogue = \(\): void => \{[\s\S]*advance_room_introduction[\s\S]*finishCurrentDialogue\(\)/u);
    assert.match(experienceSource, /const lensActive = Boolean\([\s\S]*!roomObservationAwaitingContinue/u);
    assert.match(experienceSource, /const completionCueVisible = Boolean\([\s\S]*!roomObservationAwaitingContinue/u);
    assert.match(cssSource, /\.dialogueContinueHint\s*\{[\s\S]*animation:\s*observationContinuePulse/u);
    assert.doesNotMatch(experienceSource, /Click to reveal/u);
    assert.match(experienceSource, /completionCueVisible \? <div className=\{styles\.roomComplete\}/u);
    assert.match(cssSource, /\.roomScene\[data-lens-active="true"\][\s\S]*cursor:\s*none/u);
    assert.match(cssSource, /\.hotspots button\s*\{[\s\S]*background:\s*transparent/u);
    assert.doesNotMatch(cssSource, /\.hotspots button::before/u);
    assert.doesNotMatch(experienceSource, /<span>\{hotspot\.label\}<\/span>/u);
    assert.match(cssSource, /\.investigationLens\s*\{[\s\S]*pointer-events:\s*none/u);
    assert.match(experienceSource, /debateMysteryV2ExamineGridCellIndexes/u);
    assert.match(cssSource, /width:\s*3\.4rem/u);
    assert.match(cssSource, /\.investigationLens\s*\{[\s\S]*?box-shadow:\s*0 0 0\.34rem rgba\(102, 229, 234, 0\.2\)/u);
    assert.match(experienceSource, /data-targeted=\{targetedHotspotId \? "true" : undefined\}/u);
    assert.match(cssSource, /\.investigationLens\[data-targeted="true"\][\s\S]*scale\(0\.9\)/u);
    assert.match(experienceSource, /command === "examine" && !roomComplete \? <div className=\{styles\.examinationGrid\} data-art-style=\{currentRoomArtStyle\}/u);
    assert.match(cssSource, /\.examinationGrid\s*\{[\s\S]*transform:\s*none/u);
    assert.match(cssSource, /\.examinationGrid i\s*\{[\s\S]*box-shadow:[\s\S]*filter:\s*none;[\s\S]*transform:\s*none/u);
    assert.doesNotMatch(cssSource, /prismGlintSweep|investigationLens::after/u);
    assert.match(cssSource, /\.roomComplete\s*\{/u);

    const hotspots = [
      { id: "locked-near", polygon: [{ x: 49, y: 49 }, { x: 51, y: 49 }, { x: 51, y: 51 }, { x: 49, y: 51 }], unlocked: false, examined: false },
      { id: "open-far", polygon: [{ x: 69, y: 49 }, { x: 71, y: 49 }, { x: 71, y: 51 }, { x: 69, y: 51 }], unlocked: true, examined: false },
      { id: "reviewed", polygon: [{ x: 54, y: 49 }, { x: 56, y: 49 }, { x: 56, y: 51 }, { x: 54, y: 51 }], unlocked: true, examined: true },
    ];
    const lens = resolveDebateMysteryV2Lens(50, 50, hotspots);
    assert.equal(lens.hotspotId, null);
    assert.equal(lens.proximity, 0);
    const overlappingHotspots = [
      { id: "large", polygon: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }], unlocked: true, examined: false },
      { id: "small", polygon: [{ x: 45, y: 45 }, { x: 55, y: 45 }, { x: 55, y: 55 }, { x: 45, y: 55 }], unlocked: true, examined: false },
    ];
    const overlapLens = resolveDebateMysteryV2Lens(50, 50, overlappingHotspots);
    assert.equal(debateMysteryV2LensClickTarget(overlapLens), "small");
    assert.deepEqual(
      debateMysteryV2ExamineGridCellIndexes(overlapLens, overlappingHotspots, 24, 15),
      [180],
    );
    const openLens = resolveDebateMysteryV2Lens(70, 50, hotspots);
    assert.deepEqual(openLens, {
      x: 70,
      y: 50,
      proximity: 1,
      hotspotId: "open-far",
    });
    assert.equal(debateMysteryV2LensClickTarget(openLens), "open-far");
    assert.equal(resolveDebateMysteryV2Lens(69, 50, hotspots).hotspotId, "open-far");
    const tinyHotspot = [{ id: "tiny", polygon: [{ x: 49.8, y: 49.8 }, { x: 50.2, y: 49.8 }, { x: 50.2, y: 50.2 }, { x: 49.8, y: 50.2 }], unlocked: true, examined: false }];
    assert.deepEqual(debateMysteryV2ExamineGridCellIndexes(resolveDebateMysteryV2Lens(50, 50, tinyHotspot), tinyHotspot), [180]);
    assert.equal(debateMysteryV2LensClickTarget(resolveDebateMysteryV2Lens(2, 2, hotspots)), null);
    assert.equal(
      debateMysteryV2LensClickTarget(resolveDebateMysteryV2Lens(70, 50, hotspots.map((hotspot) => hotspot.id === "open-far" ? { ...hotspot, examined: true } : hotspot))),
      null,
    );
    assert.equal(
      debateMysteryV2LensClickTarget(resolveDebateMysteryV2Lens(70, 50, hotspots.map((hotspot) => ({ ...hotspot, examined: true })))),
      null,
    );
    assert.equal(debateMysteryV2RoomComplete(hotspots), false);
    assert.equal(debateMysteryV2ExaminationCompletesRoom(hotspots, "open-far"), false);
    assert.equal(
      debateMysteryV2ExaminationCompletesRoom(
        hotspots.map((hotspot) => hotspot.id === "locked-near" ? { ...hotspot, examined: true } : hotspot),
        "open-far",
      ),
      true,
    );
  });

  it("renders the full Case Forge and accessible replay-safe callouts", () => {
    for (const stage of [
      "Writing the Case",
      "Testing Contradictions",
      "Directing Performances",
      "Preparing Local Voices",
      "Verifying Case Audio",
      "Begin Case",
    ]) {
      assert.match(experienceSource, new RegExp(stage, "u"));
    }
    for (const callout of [
      "HOLD IT!",
      "OBJECTION!",
      "ORDER!",
      "SUSTAINED!",
      "OVERRULED!",
      "TESTIMONY REVISED",
      "GUILTY",
      "NOT GUILTY",
    ]) {
      assert.ok(experienceSource.includes(callout));
    }
    assert.match(experienceSource, /aria-live="assertive"/u);
    assert.match(experienceSource, /Continue in background/u);
    assert.match(
      experienceSource,
      /window\.scrollTo\(\{ top: 0, left: 0, behavior: "auto" \}\)/u,
    );
    assert.match(experienceSource, /Only one Whodunnit can cook at a time/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
    assert.match(cssSource, /\.callout span/u);
    assert.doesNotMatch(
      cssSource,
      /\.theoryBoard,\s*\.callout\s*\{/u,
    );
  });

  it("groups only the Spectator Forge into three calm phases with expandable details", () => {
    assert.match(experienceSource, /spectatorForge = state\.config\.playerRole === "spectator"/u);
    assert.match(experienceSource, /Preparing your mystery to watch\./u);
    for (const phase of ["Writing the trial", "Checking the case", "Recording the cast"]) {
      assert.match(experienceSource, new RegExp(phase, "u"));
    }
    assert.match(experienceSource, /<summary>Preparation details<\/summary>/u);
    assert.match(experienceSource, /open=\{needsAttention \|\| undefined\}/u);
    assert.match(experienceSource, /Preparation attempt \{compilation\.attempt\}/u);
    assert.match(experienceSource, /spectatorForge \? SPECTATOR_FORGE_STAGES : FORGE_STAGES/u);
    assert.match(experienceSource, /!spectatorForge && compilationActive/u);
    assert.match(cssSource, /\.forgeDetails/u);
  });

  it("resumes and polls durable preparation until completion or actionable recovery", () => {
    assert.match(
      experienceSource,
      /\/api\/debates\/\$\{encodeURIComponent\(sessionId\)\}\?perspective=live/u,
    );
    assert.match(
      experienceSource,
      /\/api\/debates\/\$\{encodeURIComponent\(sessionId\)\}\/mystery-resume-compilation/u,
    );
    assert.match(experienceSource, /window\.setTimeout\(\(\) => void refresh\(\), 900\)/u);
    assert.match(experienceSource, /debateMysteryForgeStageIsActive\(nextCompilation\.stage\)/u);
    assert.match(experienceSource, /Retry preparation/u);
    assert.match(experienceSource, /Copy error details/u);
    assert.match(experienceSource, /Error details copied to clipboard/u);
    assert.match(experienceSource, /Could not copy error details\. Try again\./u);
    assert.match(experienceSource, /Continue without voices/u);
    assert.match(experienceSource, /Return to setup/u);
    assert.match(experienceSource, /Case preparation stopped/u);
    assert.match(experienceSource, /The Forge is not still running/u);
    assert.match(experienceSource, /resume from the last durable checkpoint/u);
    assert.match(experienceSource, /needsAttention \? "error" : "active"/u);
    assert.match(cssSource, /li\[data-state="error"\]/u);
  });

  it("keeps active local-recording progress ahead of stale resume snapshots", () => {
    assert.equal(debateMysteryForgeStageIsActive("preparing_local_voices"), true);
    assert.equal(debateMysteryForgeStageIsActive("complete"), false);
    assert.equal(debateMysteryForgeStageIsActive("needs_attention"), false);
    assert.equal(debateMysteryForgeStageIsActive("cancelled"), false);
    assert.match(experienceSource, /const onSessionChangeRef = useRef\(onSessionChange\)/u);
    assert.match(experienceSource, /onSessionChangeRef\.current = onSessionChange/u);
    assert.match(experienceSource, /const liveCompilationRef = useRef\(liveCompilation\)/u);
    assert.match(experienceSource, /const shouldApplyResumeResponse =/u);
    assert.match(experienceSource, /!debateMysteryForgeStageIsActive\(resumedState\.compilation\.stage\)/u);
    assert.match(experienceSource, /if \(!cancelled && shouldApplyResumeResponse\) \{[\s\S]*onSessionChangeRef\.current\(result\.session\)/u);
    assert.match(experienceSource, /\}, \[request, resumeNonce, sessionId\]\);/u);
    assert.doesNotMatch(experienceSource, /\}, \[onSessionChange, request, resumeNonce, sessionId\]\);/u);
  });

  it("renders authoritative checkpoint progress with elapsed time and a learned ETA", () => {
    assert.equal(debateMysteryForgeAuthoritativePercent(0, 5), 0);
    assert.equal(debateMysteryForgeAuthoritativePercent(3, 5), 60);
    assert.equal(debateMysteryForgeAuthoritativePercent(8, 5), 100);
    assert.equal(formatDebateMysteryForgeElapsed(65_000), "1:05");
    assert.equal(formatDebateMysteryForgeElapsed(3_665_000), "1:01:05");
    assert.equal(formatDebateMysteryForgeEta(310_000), "Approx. 5 min remaining");
    assert.match(experienceSource, /role="progressbar"/u);
    assert.match(experienceSource, /ETA appears after two durable passes/u);
    assert.match(cssSource, /forgeProgressShimmer/u);
    assert.match(experienceSource, /mystery-compilation/u);
    assert.match(experienceSource, /\(compilation\.substeps \?\? \[\]\)\.map/u);
    assert.match(experienceSource, /FORGE_TIPS/u);
    assert.match(experienceSource, /<p key=\{forgeTipIndex\}>\{FORGE_TIPS\[forgeTipIndex\]\}<\/p>/u);
    assert.match(experienceSource, /usePrefersReducedMotion/u);
    assert.match(cssSource, /\.forgeSubsteps/u);
    assert.match(cssSource, /\.forgeTip/u);
  });

  it("keeps the Light Case Forge image white-faded at top and bottom and its small copy AA-dark", () => {
    assert.match(
      cssSource,
      /\.forge\[data-theme="light"\]\s*\{[\s\S]*?--forge-title-ink:\s*#101923;[\s\S]*?--forge-copy-ink:\s*#364b60;[\s\S]*?--forge-note-label-ink:\s*#17697e;[\s\S]*?--forge-note-copy-ink:\s*#31495f;/u,
    );
    assert.match(cssSource, /\.forge\[data-theme="light"\] \.forgeCard\[data-exterior-hero="true"\]::after\s*\{\s*background:\s*none;/u);
    assert.doesNotMatch(cssSource, /--scene-vignette-(?:left|right)-clear/u);
    assert.match(cssSource, /\.forge\[data-theme="light"\] \.forgeCard\[data-exterior-hero="true"\] \.forgeCaseIdentity h1\s*\{\s*color:\s*var\(--forge-title-ink\);/u);
    assert.match(cssSource, /\.forge\[data-theme="light"\] \.forgeExteriorStatus\s*\{\s*color:\s*var\(--forge-exterior-label-ink\);/u);
    assert.match(cssSource, /\.forge\[data-theme="light"\] \.forgeTip > span\s*\{[^}]*color:\s*var\(--forge-note-label-ink\);/u);
    assert.match(experienceSource, /className=\{styles\.forgeSceneVignette\}/u);
    for (const ink of ["#513890", "#4a386c", "#364b60", "#42586e", "#465b70", "#3e625a", "#513f78", "#17697e", "#31495f"]) {
      assert.ok(contrastRatio(ink, "#ebf3f9") >= 4.5, `${ink} must remain AA against the Light Forge raised surface`);
    }
  });

  it("formats only public Case Forge failure details for copying", () => {
    const details = formatDebateMysteryV2ForgeErrorDetails("session-public-123", {
      version: 2,
      jobId: "case-public-456",
      stage: "needs_attention",
      attempt: 3,
      completedPasses: 2,
      totalPasses: 5,
      preparedAudioCount: 0,
      requiredAudioCount: 0,
      substeps: [{ id: "foundation", label: "Case foundation", state: "attention" }],
      retryable: true,
      publicFailureCode: "CASE_FORGE_COMPILATION_STOPPED",
      publicFailureStage: "writing_case",
      spoilerSafeMessage: "Case preparation needs attention",
      startedAt: "2026-08-25T18:20:00.000Z",
      elapsedMs: 300_000,
      approximateRemainingMs: null,
      etaBasisPasses: 2,
      updatedAt: "2026-08-25T18:25:00.000Z",
    });
    assert.match(details, /CASE_FORGE_COMPILATION_STOPPED/u);
    assert.match(details, /Case preparation needs attention/u);
    assert.match(details, /session-public-123/u);
    assert.match(details, /case-public-456/u);
    assert.match(details, /Failed stage: Writing Case \(writing_case\)/u);
    assert.match(details, /Attempt: 3/u);
    assert.match(details, /2026-08-25T18:25:00\.000Z/u);
    assert.doesNotMatch(details, /Case Bible|culprit|proof route|prompt|secret|credential|juror|Power|private payload/iu);
  });

  it("copies both authorized review records from the completed verdict", () => {
    assert.match(experienceSource, /Copy verbose transcript/u);
    assert.match(experienceSource, /Copy all review data/u);
    assert.match(experienceSource, /onCopyVerboseTranscript/u);
    assert.match(experienceSource, /onCopyAllReviewData/u);
    assert.match(experienceSource, /Transcript copied/u);
    assert.match(experienceSource, /Review data copied/u);
    assert.match(setupSource, /formatDebateMysteryV2PublicReview/u);
    assert.match(
      setupSource,
      /onCopyVerboseTranscript=\{copyVerboseTranscript\}/u,
    );
    assert.match(
      setupSource,
      /onCopyAllReviewData=\{copyAllDebateReviewData\}/u,
    );
  });

  it("creates Participant or Spectator V2 cases with Jury Trial default support", () => {
    assert.match(setupSource, /DEBATE_MYSTERY_V2_SCHEMA_VERSION/u);
    assert.match(setupSource, /trialType: juryEnabled \? "jury" : "bench"/u);
    assert.match(setupSource, /jurorBotIds: juryEnabled/u);
    assert.match(setupSource, /playerRole: playerRole === "spectator" \? "spectator" : "participant"/u);
    assert.match(setupSource, /format === "whodunnit" && role === "judge"/u);
    assert.match(setupSource, /Premium unavailable for Whodunnit V2/u);
    assert.match(setupSource, /props\.initialFormat === "whodunnit"/u);
    assert.match(setupSource, /data-placement=\{format === "whodunnit" \? "cast-top" : undefined\}/u);
    assert.match(setupSource, /aria-controls=\{format === "whodunnit" \? "debate-mystery-jury-options" : undefined\}/u);
    assert.match(setupSource, /\{format === "whodunnit" \? renderJuryToggle\(\) : null\}/u);
    assert.match(setupSource, /\{format !== "whodunnit" \? renderJuryToggle\(\) : null\}/u);
    assert.match(
      setupSource,
      /\{juryEnabled \? \(\s*<PrismRefractTarget[\s\S]{0,400}id="debate-mystery-jury-options"/u,
    );
    assert.match(setupSource, /activeMysteryCastSeat\.kind === "juror"[\s\S]{0,160}setActiveMysteryCastSeat\(\{ kind: "suspect", index: 0 \}\)/u);
    assert.ok(
      setupSource.indexOf('{format === "whodunnit" ? renderJuryToggle() : null}') <
        setupSource.indexOf('className={styles.mysteryCastGroups}'),
    );
  });

  it("offers a truthful Theme, Forge asset, Archive, and saved-mansion setup", () => {
    assert.match(setupSource, /<strong>Mystery spark<\/strong>/u);
    assert.match(setupSource, /placeholder="Leave blank for Surprise me/u);
    assert.match(setupSource, /Optional clue visuals/u);
    assert.match(setupSource, /Every case has clues/u);
    assert.match(setupSource, /Ready mansion variants are used first/u);
    assert.match(setupSource, /Use props from my Asset Library/u);
    assert.match(setupSource, /Generate setting-matched clue props/u);
    assert.match(setupSource, /Without it, ready mansion variants are used first/u);
    assert.match(setupSource, /bundled clue cards, and an optional personalized ambience mix/u);
    assert.match(setupSource, /mysteryEvidenceAssetSynthesis && props\.responseMode !== "local"/u);
    assert.match(setupSource, /disabled=\{props\.responseMode === "local"\}/u);
    assert.match(setupSource, /ONLINE only · LOCAL keeps the bundled room pack/u);
    assert.match(setupSource, /Ask ElevenLabs for an original instrumental mansion theme/u);
    assert.match(setupSource, /LOCAL and Auto keep The Midnight Clue bundled fallback/u);
    assert.match(setupSource, /"Personalize local ambience" : "Ambience"/u);
    assert.match(setupSource, /mansion-specific procedural mix/u);
    assert.match(setupSource, /no online generator or new audio file/u);
    assert.match(setupSource, /Off still uses matching bundled ambience/u);
    assert.match(setupSource, /Ambience remains mansion-owned and content-addressed/u);
    assert.match(setupSource, /mysteryEvidenceAssetSynthesis/u);
    assert.match(setupSource, /mysteryRoomAssetSynthesis/u);
    assert.match(setupSource, /mysteryMusicAssetSynthesis/u);
    assert.match(setupSource, /mysteryAmbienceAssetSynthesis/u);
    assert.match(setupSource, /setMysteryEvidenceAssetSynthesis\] =\s*useState\(false\)/u);
    assert.match(setupSource, /setMysteryRoomAssetSynthesis\] =\s*useState\(false\)/u);
    assert.match(setupSource, /setMysteryMusicAssetSynthesis\] =\s*useState\(false\)/u);
    assert.match(setupSource, /setMysteryAmbienceAssetSynthesis\] =\s*useState\(false\)/u);
    assert.match(
      setupSource,
      /Choose optional clue visuals and music\. Ready mansion variants or PRISM’s bundled clue props always keep the case playable\./u,
    );
    assert.match(
      setupSource,
      /rooms:[\s\S]{0,100}!selectedMysteryMansionBundle[\s\S]{0,220}illustratedRooms:[\s\S]{0,140}!selectedMysteryMansionBundle/u,
    );
    assert.match(
      setupSource,
      /ambience:[\s\S]{0,100}!selectedMysteryMansionBundle/u,
    );
    assert.match(
      setupSource,
      /\{!selectedMysteryMansionBundle \? <label className=\{mysteryStyles\.setupField\}>Room art/u,
    );
    assert.match(
      setupSource,
      /\{!selectedMysteryMansionBundle \? <label[^>]+>[\s\S]{0,500}<strong>Rooms<\/strong>/u,
    );
    assert.match(
      setupSource,
      /\{!selectedMysteryMansionBundle \? <label[^>]+data-tutorial-target="whodunnit-v2-ambience-synthesis"/u,
    );
    assert.match(setupSource, /props\.responseMode !== "local"/u);
    assert.match(setupSource, /Generated case art stays attached to its case/u);
    assert.doesNotMatch(setupSource, /unless you save a revealed visual/u);
    assert.match(setupSource, /mysteryMansionBundleId/u);
    assert.match(setupSource, /mystery-mansion\/save/u);
    assert.match(experienceSource, /Save mansion level/u);
    assert.match(experienceSource, /Retry failed visual/u);
    assert.match(experienceSource, /mystery-assets\/retry/u);
    assert.match(setupSource, /session\.format === "whodunnit"/u);
    assert.match(setupSource, /Open evidence assets/u);
    assert.match(setupSource, /Skip investigation/u);
    assert.match(setupSource, /Start directly in court/u);
    assert.match(setupSource, /Bypass conclusion review and begin the watch-only trial/u);
    assert.match(setupSource, /investigationMode: mysterySkipInvestigation \? "court_only" : "full"/u);
    assert.match(setupSource, /court-only cases exclude room assets/u);
    assert.match(experienceSource, /This room is still being prepared/u);
    assert.match(experienceSource, /sealedMysteryAssetObjectUrl/u);
    assert.doesNotMatch(experienceSource, /Save evidence image|Save room image|Saved to Images/u);
    assert.match(experienceSource, /data-command="move"[\s\S]{0,260}disabled=\{busy \|\| dialoguePerformanceActive\}/u);
    assert.doesNotMatch(experienceSource, /data-command="move"[\s\S]{0,260}!state\.openingSweepComplete/u);
    assert.doesNotMatch(experienceSource, /Finish the finite visible sweep before leaving/u);
    assert.match(experienceSource, /data-tutorial-target="whodunnit-start"/u);
    assert.match(experienceSource, /if \(!mansionDoorEntry\) \{[\s\S]{0,120}sendAction\(\{ action: "move" \}\);[\s\S]{0,60}return;/u);
  });

  it("disables the Upgraded presentation toggle while the mansion map is open", () => {
    assert.match(
      experienceSource,
      /aria-pressed=\{roomUpgradeEnabled\}[\s\S]{0,100}disabled=\{state\.roomView === "mansion"\}/u,
    );
    assert.match(
      experienceSource,
      /onClick=\{\(\) => selectRoomUpgradeEnabled\(!roomUpgradeEnabled\)\}/u,
      "the room control keeps the same persisted toggle action",
    );
  });

  it("re-enables failed visual recovery after the soft poll settles", () => {
    assert.match(
      experienceSource,
      /if \(visualRetryState !== "queued" \|\| pendingRoomKey\) return;/u,
    );
    assert.match(
      experienceSource,
      /setVisualRetryState\(failedVisualCount > 0 \? "failed" : "idle"\)/u,
    );
    assert.match(
      experienceSource,
      /\[failedVisualCount, pendingRoomKey, visualRetryState\]/u,
    );
  });

  it("routes Spectator through editable Prosecutor findings before watch-only court", () => {
    assert.match(experienceSource, />Start<\/button>/u);
    assert.match(experienceSource, /Prosecutor research · editable/u);
    assert.match(experienceSource, /Review the Prosecutor conclusion/u);
    assert.match(experienceSource, /File conclusion and watch court/u);
    assert.match(experienceSource, /spectatorTheory/u);
    assert.match(experienceSource, /Watch-only court/u);
    assert.doesNotMatch(experienceSource, /Partner-led prosecution/u);
    assert.match(experienceSource, /advance_spectator_trial/u);
    assert.match(experienceSource, /!spectator && command === "present"/u);
    assert.match(experienceSource, /!spectator && state\.pendingProsecutionChoice/u);
    assert.match(experienceSource, /retryable && !spectator/u);
    assert.match(setupSource, /review and file the editable conclusion before watching court/u);
  });

  it("exposes only unreferenced Whodunnit packs through deliberate Storage cleanup", () => {
    assert.match(storageSource, /mystery-audio-storage/u);
    assert.match(storageSource, /Clear unreferenced local performances/u);
    assert.match(storageSource, /no case, Archive, or replay still owns/u);
    assert.match(storageSource, /remain immutable and protected/u);
  });
});
