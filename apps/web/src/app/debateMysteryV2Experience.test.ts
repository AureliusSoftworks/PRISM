import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  debateMysteryV2ExaminationCompletesRoom,
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

describe("Whodunnit V2 prosecution experience", () => {
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
    assert.match(experienceSource, /Object with evidence/u);
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
    assert.match(experienceSource, /Choose where to descend\. Movement is free\./u);
    assert.doesNotMatch(experienceSource, /styles\.floorStack/u);
    assert.doesNotMatch(experienceSource, /--mansion-room-image/u);
    assert.doesNotMatch(experienceSource, /room\.bundledAssetPath \? `url/u);
    assert.match(cssSource, /\.mansionRoom\s*\{[\s\S]*position: absolute/u);
    assert.match(cssSource, /\.mansionViewport\s*\{[\s\S]*aspect-ratio: 4 \/ 3/u);
    assert.match(cssSource, /\.mansionRoom\s*\{[\s\S]*place-items: center/u);
    assert.match(cssSource, /\.mansionRoom::before/u);
    assert.match(cssSource, /\.mansionRoom::after/u);
    assert.match(cssSource, /rotateX\(3deg\) rotateZ\(-0\.55deg\)/u);
    assert.match(cssSource, /@keyframes roomDescend\s*\{[\s\S]*to\s*\{\s*opacity:\s*1;\s*transform:\s*none/u);
    assert.match(cssSource, /animation:\s*roomDescend[^;]+backwards/u);
  });

  it("keeps the title card silent, then stages the frozen Casekeeper briefing before the map", () => {
    assert.match(experienceSource, /openingOrMapPlaybackSuppressed = state\.playPhase === "title_card"/u);
    assert.match(experienceSource, /if \(state\.playPhase === "case_opening"\)/u);
    assert.match(experienceSource, /nodeId === "briefing-opening"/u);
    assert.match(experienceSource, /<small>Casekeeper<\/small>/u);
    assert.match(experienceSource, /className=\{styles\.caseOpeningStage\}[\s\S]*onClick=\{\(\) => void dismissOpening\(\)\}/u);
    assert.match(experienceSource, /className=\{styles\.caseOpeningStage\}[\s\S]*onKeyDown=\{handleOpeningKeyDown\}/u);
    assert.doesNotMatch(experienceSource, /className=\{styles\.caseOpeningDialogue\}[\s\S]{0,280}onClick=\{\(\) => void dismissOpening\(\)\}/u);
    assert.match(experienceSource, /action: "dismiss_case_opening"/u);
    assert.match(experienceSource, /data-opening-map-reveal=\{openingMapReveal \? "true" : undefined\}/u);
    assert.match(cssSource, /\.caseOpeningStage\s*\{[\s\S]*background:\s*#000/u);
    assert.match(cssSource, /\.caseOpeningStage\s*\{[\s\S]*cursor:\s*pointer/u);
    assert.match(cssSource, /\.investigation\[data-opening-map-reveal="true"\]::after[\s\S]*background:\s*#000/u);
    assert.match(cssSource, /@keyframes caseOpeningReveal/u);
  });

  it("keeps unseen occupants off the mansion and stages the finite first-visit reveal", () => {
    assert.match(experienceSource, /const roomSuspects = room\.visited[\s\S]*\? state\.suspects\.filter[\s\S]*: \[\]/u);
    assert.match(experienceSource, /roomIntroductionPhase = currentRoom[\s\S]*state\.roomIntroductions\[currentRoom\.id\]/u);
    assert.match(experienceSource, /roomIntroductionAwaitingContinue = roomIntroductionPhase === "casekeeper"/u);
    assert.match(experienceSource, /action: "advance_room_introduction"/u);
    assert.match(experienceSource, /action: "complete_room_introduction"/u);
  assert.match(experienceSource, /roomIntroductionPersonaActive/u);
  assert.match(
    experienceSource,
    /mysteryInvestigationMusicMix\(\{[\s\S]*roomIntroductionActive/u,
  );
  assert.match(experienceSource, /action\.action === "advance_room_introduction"[\s\S]*startWhodunnitInterrogation\(exchange/u);
    assert.match(experienceSource, /!roomIntroductionActive \? <nav className=\{styles\.investigationCommands\}/u);
    assert.match(experienceSource, /!roomIntroductionActive \? <header className=\{styles\.investigationHeader\}/u);
    assert.match(experienceSource, /!roomIntroductionActive \? <div className=\{styles\.roomTitle\}/u);
    assert.match(experienceSource, /roomIntroductionPhase !== "casekeeper" \? <div className=\{styles\.roomShade\}/u);
    assert.match(experienceSource, /data-blurred=\{roomActorVisible/u);
    assert.match(experienceSource, /roomIntroductionAwaitingContinue \? "Casekeeper"/u);
    assert.match(experienceSource, /activeAudioRef\.current \|\|/u);
    assert.match(cssSource, /\.roomScene\[data-room-introduction\]\s*\{\s*min-height:\s*100dvh/u);
  });

  it("uses only the completed local pack during gameplay", () => {
    assert.match(experienceSource, /mystery-audio\/\$\{encodeURIComponent\(lineId\)\}/u);
    assert.match(experienceSource, /Premium voices are unavailable in Whodunnit V2/u);
    assert.match(experienceSource, /No ElevenLabs request will be made/u);
    assert.doesNotMatch(experienceSource, /playMysteryVoice|playMysteryPlayerVoice|elevenlabs\.io/iu);
  });

  it("stages each Talk topic as a streamed player-Prosecutor question followed by the centered suspect", () => {
    assert.match(experienceSource, /nextState\.dialogueHistory\.slice\(previousDialogueCount\)/u);
    assert.match(experienceSource, /setDialoguePlaybackQueue\(exchange\)/u);
    assert.match(experienceSource, /command === "talk" && currentSuspect && !dialoguePerformanceActive/u);
    assert.match(experienceSource, /Prosecutor/u);
    assert.match(experienceSource, /splitDebateMysteryStageActionTextV2\(roomDisplayedDialogue\.visibleText/u);
    assert.match(experienceSource, /roomDisplayedDialogue\?\.stageActionText \?\? roomDialogueDelivery\.stageActionText/u);
    assert.match(experienceSource, /mysterySignalActionPresentation\([\s\S]*roomDisplayedDialogue/u);
    assert.match(experienceSource, /roomSuspectStageActionText && roomActionPresentation \? <SignalVoiceActionText/u);
    assert.match(experienceSource, /key=\{`suspect:\$\{roomDisplayedDialogue\?\.nodeId/u);
    assert.match(experienceSource, /revealedSpeechText\(whodunnitCaptionSpeechText\(roomDialogueDelivery\.spokenText\), captionSpeechTiming\)/u);
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
    assert.match(experienceSource, /window\.requestAnimationFrame\(updateSpeechTiming\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("playing", updateSpeechTiming, \{ once: true \}\)/u);
    assert.match(experienceSource, /debateVoiceCompletionFallbackDurationMs\(playbackText\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("loadedmetadata", updateSpeechTiming\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("durationchange", updateSpeechTiming\)/u);
    assert.match(experienceSource, /audio\.removeEventListener\("loadedmetadata", updateSpeechTiming\)/u);
    assert.match(experienceSource, /audio\.removeEventListener\("durationchange", updateSpeechTiming\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("ended", completeBeat, \{ once: true \}\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("error", completeBeat, \{ once: true \}\)/u);
    assert.match(experienceSource, /audio\.addEventListener\("pause", completeBeat, \{ once: true \}\)/u);
    assert.match(experienceSource, /AUDIO_OFF_REVEAL_MS_PER_CHARACTER/u);
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
    assert.match(setupSource, /defaultRestingMouthCharacter: "\|"/u);
    assert.match(setupSource, /speechInkVisible: performance\?\.speechInkVisible/u);
    assert.match(experienceSource, /roomIntroductionAwaitingContinue && currentRoom[\s\S]*action: "advance_room_introduction"[\s\S]*finishCurrentDialogue/u);
    assert.match(experienceSource, /activeAudioRef\.current\?\.pause\(\)/u);
    assert.match(experienceSource, /setHeldDialogue\(queuedDialogue\)/u);
    assert.match(experienceSource, /roomProsecutorActive/u);
    assert.match(experienceSource, /const roomActorVisible = Boolean\([\s\S]*roomIntroductionPersonaActive/u);
    assert.match(experienceSource, /className=\{styles\.roomBackdrop\} data-blurred=\{roomActorVisible/u);
    assert.match(experienceSource, /className=\{styles\.roomParallaxLayer\}/u);
    assert.match(experienceSource, /roomParallaxEnabled = Boolean\([\s\S]*command === "examine"/u);
    assert.match(experienceSource, /if \(!roomParallaxEnabled\) setRoomParallax\(\{ x: 0, y: 0 \}\)/u);
    assert.match(experienceSource, /handleRoomPointerLeave/u);
    assert.match(experienceSource, /roomActorVisible && currentBot/u);
    assert.match(experienceSource, /\$\{styles\.roomActor\} \$\{styles\.roomProsecutorActor\}/u);
    assert.match(experienceSource, /roomContextKey = state\.roomView === "room" \? state\.currentRoomId : null/u);
    assert.match(experienceSource, /state\.dialogueHistory\.length > roomDialogueBaseline\.historyCount/u);
    assert.match(experienceSource, /setRoomDialogueBaseline\(\{[\s\S]*historyCount: state\.dialogueHistory\.length/u);
    assert.match(experienceSource, /roomDisplayedDialogue \? <div className=\{styles\.dialogueBox\}/u);
    assert.match(experienceSource, /function hotspotSpotStyle\(/u);
    assert.match(experienceSource, /style=\{hotspotSpotStyle\(hotspot\.polygon\)\}/u);
    assert.doesNotMatch(experienceSource, /clipPath: `polygon/u);
    assert.match(cssSource, /\.hotspots button\s*\{[\s\S]*width:\s*clamp\(3\.25rem, 4\.5vw, 5rem\)/u);
    assert.match(cssSource, /\.hotspots button\s*\{[\s\S]*border-radius:\s*50%/u);
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*left:\s*50%/u);
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*bottom:\s*19\.5rem/u);
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*transform:\s*translateX\(-50%\)/u);
    assert.doesNotMatch(cssSource, /\.roomActor\s*\{[\s\S]{0,240}right:\s*8%/u);
    assert.match(cssSource, /\.roomBackdrop\[data-blurred="true"\]\s*\{[\s\S]*filter:\s*blur\(12px\)/u);
    assert.match(experienceSource, /roomParallaxEnabled/u);
    assert.match(cssSource, /--room-parallax-x/u);
    assert.match(cssSource, /\.roomParallaxLayer\s*\{[\s\S]*translate3d\(var\(--room-parallax-x/u);
    assert.match(cssSource, /\.roomActor\[data-prosecutor-speaking="true"\]/u);
    assert.match(cssSource, /\[data-interrogation-phase="prosecutor_entrance"\]/u);
    assert.match(experienceSource, /className=\{styles\.roomActorDrift\}/u);
    assert.match(experienceSource, /mysteryRoomActorDriftStyle\(`\$\{props\.session\.id\}:\$\{currentBot\.id\}:suspect`\)/u);
    assert.match(experienceSource, /mysteryRoomActorDriftStyle\(`\$\{props\.session\.id\}:\$\{prosecutorBot\.id\}:prosecutor`\)/u);
    assert.match(cssSource, /@keyframes roomActorIdleDrift[\s\S]*translate3d\(-4px, 1px, 0\)[\s\S]*translate3d\(7px, -2px, 0\)[\s\S]*translate3d\(-6px, 2px, 0\)/u);
    assert.match(cssSource, /\.roomActorDrift\s*\{[\s\S]*animation:\s*roomActorIdleDrift var\(--room-actor-drift-duration/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce[\s\S]*\.roomActorDrift\s*\{\s*animation:\s*none/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
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

  it("keeps examination silent, guided by an invisible lens, and closes the room after its final observation", () => {
    assert.match(experienceSource, /delivery === "text_only"/u);
    assert.match(experienceSource, /nodeId\.startsWith\("examine-"\)/u);
    assert.match(experienceSource, /const playbackLineId = openingOrMapPlaybackSuppressed \|\| dialogueIsTextOnly \? null/u);
    assert.match(experienceSource, /const lensActive = Boolean\([\s\S]*currentRoomUnexaminedHotspots\.length > 0/u);
    assert.match(experienceSource, /data-lens-active=\{lensActive/u);
    assert.match(experienceSource, /setInvestigationLens\(resolveDebateMysteryV2Lens\(/u);
    assert.match(experienceSource, /onClick=\{handleRoomInvestigationClick\}/u);
    assert.match(experienceSource, /debateMysteryV2LensClickTarget\(lens\)/u);
    assert.match(experienceSource, /style=\{\{ left: `\$\{investigationLens\.x\}%`, top: `\$\{investigationLens\.y\}%`/u);
    assert.match(experienceSource, /onFocus=\{\(\) => \{ const center = debateMysteryV2HotspotCenter/u);
    assert.match(experienceSource, /data-examining=\{examiningHotspotId === hotspot\.id/u);
    assert.match(experienceSource, /const roomObservationAwaitingContinue = Boolean\(/u);
    assert.match(experienceSource, /if \(roomObservationAwaitingContinue\) \{[\s\S]*setRoomDialogueBaseline\(\{/u);
    assert.match(experienceSource, /data-awaiting-continue=\{roomObservationAwaitingContinue \|\| roomIntroductionAwaitingContinue \? "true" : undefined\}/u);
    assert.match(experienceSource, /roomObservationAwaitingContinue \|\| roomIntroductionAwaitingContinue \? <span className=\{styles\.dialogueContinueHint\} role="status">Click to continue<\/span>/u);
    assert.match(experienceSource, /else if \(!roomIntroductionActive\) finishCurrentDialogue\(\)/u);
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
    assert.match(cssSource, /--lens-proximity/u);
    assert.match(cssSource, /width:\s*3\.05rem/u);
    assert.match(experienceSource, /data-targeted=\{debateMysteryV2LensClickTarget\(investigationLens\) \? "true" : undefined\}/u);
    assert.match(cssSource, /\.investigationLens\[data-targeted="true"\][\s\S]*scale\(0\.9\)/u);
    assert.match(cssSource, /\.roomComplete\s*\{/u);

    const hotspots = [
      { id: "locked-near", polygon: [{ x: 49, y: 49 }, { x: 51, y: 51 }], unlocked: false, examined: false },
      { id: "open-far", polygon: [{ x: 69, y: 49 }, { x: 71, y: 51 }], unlocked: true, examined: false },
      { id: "reviewed", polygon: [{ x: 54, y: 49 }, { x: 56, y: 51 }], unlocked: true, examined: true },
    ];
    const lens = resolveDebateMysteryV2Lens(50, 50, hotspots);
    assert.equal(lens.hotspotId, "open-far");
    assert.ok(lens.proximity > 0 && lens.proximity < 1);
    assert.deepEqual(resolveDebateMysteryV2Lens(70, 50, hotspots), {
      x: 70,
      y: 50,
      proximity: 1,
      hotspotId: "open-far",
    });
    assert.equal(debateMysteryV2LensClickTarget(lens), "open-far");
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
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
    assert.match(cssSource, /\.callout span/u);
    assert.doesNotMatch(
      cssSource,
      /\.theoryBoard,\s*\.callout\s*\{/u,
    );
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
  });

  it("offers a truthful Theme, Forge asset, Archive, and saved-mansion setup", () => {
    assert.match(setupSource, /Theme \/ Spark/u);
    assert.match(setupSource, /placeholder="Surprise me/u);
    assert.match(setupSource, /Synthesize assets in Case Forge/u);
    assert.match(setupSource, /Create exhibit images with Debate’s existing asset pipeline/u);
    assert.match(setupSource, /Coming later · available only during Case Forge/u);
    assert.match(setupSource, /Coming later · investigation music remains unchanged/u);
    assert.match(setupSource, /mysteryEvidenceAssetSynthesis/u);
    assert.match(setupSource, /mysteryMansionBundleId/u);
    assert.match(setupSource, /mystery-mansion\/save/u);
    assert.match(experienceSource, /Save mansion level/u);
    assert.match(setupSource, /session\.format === "whodunnit"/u);
    assert.match(setupSource, /Open evidence assets/u);
    assert.match(setupSource, /Skip investigation/u);
    assert.match(setupSource, /investigationMode: mysterySkipInvestigation \? "court_only" : "full"/u);
    assert.match(setupSource, /court-only cases exclude room assets/u);
    assert.match(experienceSource, /state\.config\.investigationMode === "court_only" \? "Begin Trial"/u);
  });

  it("routes Spectator through editable Prosecutor findings before watch-only court", () => {
    assert.match(experienceSource, /Review Prosecutor Findings/u);
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
