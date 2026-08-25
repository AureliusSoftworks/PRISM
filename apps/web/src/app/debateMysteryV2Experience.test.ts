import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

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
const storageSource = readFileSync(
  new URL("./StorageSettings.tsx", import.meta.url),
  "utf8",
);

describe("Whodunnit V2 prosecution experience", () => {
  it("exposes the finite investigation and statement-level court grammar", () => {
    for (const action of [
      "move",
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
    assert.match(experienceSource, /className=\{styles\.roomActorAction\} role="status"/u);
    assert.match(experienceSource, /revealedSpeechText\(roomDialogueDelivery\.spokenText, captionSpeechTiming\)/u);
    assert.match(cssSource, /\.roomActorAction\s*\{[\s\S]*bottom:\s*calc\(100% \+ 0\.7rem\)/u);
    assert.match(experienceSource, /activeStatement\?\.stageActionText \?\? activeStatementDelivery\.stageActionText/u);
    assert.match(experienceSource, /className=\{styles\.witnessAction\} role="status"/u);
    assert.match(experienceSource, /revealedSpeechText\(activeStatementDelivery\.spokenText, captionSpeechTiming\)/u);
    assert.match(cssSource, /\.witnessAction\s*\{[\s\S]*top:\s*0\.65rem/u);
    assert.match(experienceSource, /window\.requestAnimationFrame\(updateSpeechTiming\)/u);
    assert.match(experienceSource, /AUDIO_OFF_REVEAL_MS_PER_CHARACTER/u);
    assert.match(experienceSource, /onDoubleClick=\{finishCurrentDialogue\}/u);
    assert.match(experienceSource, /activeAudioRef\.current\?\.pause\(\)/u);
    assert.match(experienceSource, /setHeldDialogue\(queuedDialogue\)/u);
    assert.match(experienceSource, /speechTiming: roomDisplayedDialogue\?\.speakerSeatId === currentSuspect\?\.seatId/u);
    assert.match(experienceSource, /roomProsecutorActive/u);
    assert.match(experienceSource, /roomActorVisible = Boolean\(currentBot && command !== "examine"\)/u);
    assert.match(experienceSource, /className=\{styles\.roomBackdrop\} data-blurred=\{roomActorVisible/u);
    assert.match(experienceSource, /className=\{styles\.roomParallaxLayer\}/u);
    assert.match(experienceSource, /roomParallaxEnabled = Boolean\([\s\S]*command === "examine"/u);
    assert.match(experienceSource, /if \(!roomParallaxEnabled\) setRoomParallax\(\{ x: 0, y: 0 \}\)/u);
    assert.match(experienceSource, /handleRoomPointerLeave/u);
    assert.match(experienceSource, /roomActorVisible && currentBot/u);
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
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*bottom:\s*17rem/u);
    assert.match(cssSource, /\.roomActor\s*\{[\s\S]*transform:\s*translateX\(-50%\)/u);
    assert.doesNotMatch(cssSource, /\.roomActor\s*\{[\s\S]{0,240}right:\s*8%/u);
    assert.match(cssSource, /\.roomBackdrop\[data-blurred="true"\]\s*\{[\s\S]*filter:\s*blur\(12px\)/u);
    assert.match(experienceSource, /roomParallaxEnabled/u);
    assert.match(cssSource, /--room-parallax-x/u);
    assert.match(cssSource, /\.roomParallaxLayer\s*\{[\s\S]*translate3d\(var\(--room-parallax-x/u);
    assert.match(cssSource, /\.roomActor\[data-prosecutor-speaking="true"\]/u);
    assert.match(cssSource, /prefers-reduced-motion: reduce/u);
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
    assert.match(experienceSource, /next\.compilation\.stage !== "needs_attention"/u);
    assert.match(experienceSource, /Retry preparation/u);
    assert.match(experienceSource, /Continue without voices/u);
    assert.match(experienceSource, /Return to setup/u);
    assert.match(experienceSource, /Case preparation stopped/u);
    assert.match(experienceSource, /The Forge is not still running/u);
    assert.match(experienceSource, /resume from the last durable checkpoint/u);
    assert.match(experienceSource, /needsAttention \? "error" : "active"/u);
    assert.match(cssSource, /li\[data-state="error"\]/u);
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
