import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("./DebateExperience.module.css", import.meta.url)),
  "utf8",
);
const page = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);

test("Participant setup freezes analytical difficulty and keeps every response path", () => {
  assert.match(
    source,
    /useState<DebateParticipationDifficulty>\(\s*DEBATE_PARTICIPATION_DEFAULT_DIFFICULTY/u,
  );
  assert.match(
    source,
    /participationDifficulty:\s*playerRole === "participant"\s*\? participationDifficulty/u,
  );
  for (const [id, label] of [
    ["coach", "Coach"],
    ["standard", "Standard"],
    ["immersive", "Immersive"],
  ]) {
    assert.match(source, new RegExp(`"${id}",\\s*"${label}"`, "u"));
  }
  assert.match(source, /participantChoices\.map\(\(choice\)/u);
  assert.match(
    source,
    /debateResolvedEvidenceText\(choice\.content, session\.evidence\)/u,
  );
  assert.match(source, /setParticipantSelectedChoiceId\(choice\.id\)/u);
  assert.match(source, /aria-expanded=\{selectedParticipantChoice\?\.id === choice\.id\}/u);
  assert.match(source, /debateParticipantTurnSubmission\(/u);
  assert.match(
    source,
    /submitPlayerTurnContent\(\s*submission\.content \?\? "",\s*submission\.choiceId/u,
  );
  assert.match(source, /Commit \$\{selectedParticipantChoice\.label\}/u);
  assert.match(source, /Make my own case/u);
  assert.match(source, /session\.phase === "closing"[\s\S]{0,100}Deliver your closing/u);
  assert.match(source, /\/participant-choices\/retry/u);
  assert.match(source, /Suggestions are unavailable\. You can keep writing/u);
  assert.doesNotMatch(source, /choice\.tier/u);
});

test("Room Dynamics presents compact qualitative reads and one surprise Jury item", () => {
  assert.match(source, /<strong>Room dynamics<\/strong>/u);
  assert.match(source, /Known first impressions/u);
  assert.match(source, /Not a vote forecast/u);
  assert.match(source, /Leans toward you/u);
  assert.match(source, /Leans against you/u);
  assert.match(source, /Open-minded/u);
  assert.match(source, /knownPredispositionPreview\.map/u);
  assert.match(source, /surpriseJurySeatCount > 0/u);
  assert.match(source, /Revealed when the jurors enter the room\./u);
  assert.match(source, /<summary>Why\?<\/summary>/u);
  assert.doesNotMatch(source, /Unknown until seated/u);
  assert.match(
    css,
    /\.roomDynamicsChip\s*\{[\s\S]{0,520}max-width:\s*100%;[\s\S]{0,520}white-space:\s*normal;/u,
  );
  assert.match(
    css,
    /\.roomDynamicsGrid\s*\{[\s\S]{0,220}repeat\(auto-fit, minmax\(210px, 1fr\)\)/u,
  );
  assert.match(css, /\.lobby\[data-theme="light"\] \.roomDynamicsItem/u);
});

test("Participant floor breaks release the opponent before the fixed call and pan afterward", () => {
  const release = source.indexOf(
    "const interruptPresentationForParticipantFloorBreak",
  );
  const releaseEnd = source.indexOf("const interruptPresentationForRecess", release);
  const releaseBlock = source.slice(release, releaseEnd);
  assert.match(releaseBlock, /setInterruptCameraView\(/u);
  assert.match(
    source,
    /interrupterPlaybackStarted = true;[\s\S]{0,120}onReleaseUtterance\?\.\(DEBATE_INTERRUPT_PRIMARY_RELEASE_MS\);[\s\S]{0,180}scheduleProceedingsReveal/u,
  );
  assert.match(releaseBlock, /debateInterruptedSpeechCaption/u);
  assert.match(releaseBlock, /setInterruptCameraView/u);

  const start = source.indexOf("const startParticipantFloorBreak");
  const startEnd = source.indexOf("const raiseParticipantObjection", start);
  const startBlock = source.slice(start, startEnd);
  assert.ok(
    startBlock.indexOf("interruptPresentationForParticipantFloorBreak(target)") <
      startBlock.indexOf("/participant-floor-break`"),
  );
  assert.match(startBlock, /heardCharacterCount/u);

  const callFinish = source.indexOf(
    "const participantFloorBreak = debateParticipantFloorBreakState(next)",
  );
  const callFinishBlock = source.slice(callFinish, callFinish + 1_200);
  assert.match(callFinishBlock, /participantFloorBreak\?\.callEventId === event\.id/u);
  assert.match(callFinishBlock, /fixed call must finish while the interrupted advocate/u);
  assert.match(callFinishBlock, /setInterruptCameraView\(debateAutoCameraView\(participantRole\)\)/u);
  assert.match(
    callFinishBlock,
    /setInterruptCameraView\(debateAutoCameraView\(participantRole\)\)[\s\S]{0,500}activateParticipantFloorBreakAfterCall\(next, event\.id\)/u,
  );
  assert.match(source, /\/participant-floor-break\/activate/u);
  assert.match(source, /callEventId,/u);
  assert.match(
    source,
    /liveParticipantFloorBreak\.status === "awaiting_response" &&\s*liveParticipantFloorBreak\.activatedAt/u,
  );
  assert.match(page, /onReleaseUtterance=\{releaseBotcastPrimaryUtterance\}/u);
  assert.match(source, /seconds to interject/u);
  assert.match(source, /seconds to state the point/u);
});

test("session-note system pause holds every Participant deadline and clears queued status during speech", () => {
  assert.match(
    source,
    /activeParticipantFloorBreak\?\.status !== "awaiting_response"[\s\S]{0,240}presentationSuspended \|\|[\s\S]{0,80}appAwayFromUser/u,
  );
  assert.match(
    source,
    /getPrismPresentationSuspendedSnapshot\(\)[\s\S]{0,100}pauseInFlightRef\.current[\s\S]{0,120}debateFloorMutationInFlightRef\.current/u,
  );
  assert.match(source, /\{busy && !presenting \? \(/u);
});

test("slowed Participant time owns clocks, desaturation, audio suspension, and patience expiry", () => {
  assert.match(
    source,
    /const participantSlowTimeActive = Boolean\([\s\S]{0,420}participantFloorBreakPreparationActive[\s\S]{0,420}debateParticipationInputIsSlowed\(activeSession\)/u,
  );
  assert.match(source, /rate=\{watchElapsedRate\}/u);
  assert.match(source, /function DebateParticipantInputClock/u);
  assert.match(source, /Floor time · ⅛ speed/u);
  assert.match(source, /participantSlowTimeWash/u);
  assert.match(
    css,
    /\.participantSlowTimeWash\s*\{[\s\S]{0,320}backdrop-filter:[^;]*grayscale/u,
  );
  assert.match(css, /\.podiumGlyphPosition\[data-participant-proxy="true"\]/u);
  assert.match(source, /if \(participantSlowTimeActive\) return;/u);
  assert.match(source, /!participantSlowTimeActive &&[\s\S]{0,180}status === "live"/u);
  assert.match(
    page,
    /onParticipationSlowTimeChange=\{suspendDebateParticipationAudio\}/u,
  );
  assert.match(page, /signalCrosstalkVoiceAbortRef\.current\?\.abort\(\)/u);
  assert.match(page, /listenerReactionVoiceAbortRef\.current\?\.abort\(\)/u);
  assert.match(source, /debateParticipantWindowExpirySchedule/u);
  assert.match(source, /\/participant-window\/expire/u);
  assert.match(source, /stage: participantWindowExpiryStage/u);
  assert.match(source, /Participant window has not expired yet/u);
});

test("Rhetorical gambits use a non-destructive producer deck and sealed preparation", () => {
  assert.match(source, /debateParticipantGambitOfferV1/u);
  assert.match(source, /Producer floor break/u);
  assert.match(source, /Steer my debater/u);
  assert.match(source, /Attach sealed evidence/u);
  assert.match(source, /participantFloorBreakEvidenceIds\.length >= 3/u);
  assert.match(source, /\/participant-floor-break\/prepare/u);
  assert.match(source, /\/participant-floor-break\/commit/u);
  assert.match(source, /\/participant-floor-break\/cancel/u);
  assert.match(
    source,
    /prewarmPreparedParticipantFloorBreak[\s\S]{0,4000}onPrepareUtterance/u,
  );
  assert.match(source, /participant_floor_break_counter_objection/u);
  assert.match(source, /participant_objection_opponent_continuation/u);
  assert.match(
    source,
    /await prewarmPreparedParticipantFloorBreak\(readySession\)[\s\S]{0,900}interruptPresentationForParticipantFloorBreak\(target\)/u,
  );
  assert.match(source, /participant_floor_break_call/u);
  assert.match(source, /Moderator clarification/u);
  assert.match(source, /seconds before the awkward silence/u);
  assert.match(source, /debate-rhetorical-gambits/u);
  assert.match(
    css,
    /\.participantGambitChoices > button\[data-selected="true"\][\s\S]{0,300}min-height:\s*124px/u,
  );
});

test("Participant choices use a readable stage-scoped producer overlay", () => {
  assert.match(source, /participantProducerWindowActive/u);
  assert.match(source, /data-placement="below-gallery"/u);
  assert.match(source, /debate-participant-response-deck/u);
  assert.match(
    css,
    /\.liveCommandDeck\.participantProducerDeck\s*\{[\s\S]{0,260}position:\s*fixed;[\s\S]{0,260}inset:\s*auto 356px 22px 0;[\s\S]{0,260}z-index:\s*80;/u,
  );
  assert.match(
    css,
    /\.participantResponseChoices > button\[data-selected="true"\]\s*\{[\s\S]{0,260}min-height:\s*94px;[\s\S]{0,260}flex-grow:\s*2\.35;/u,
  );
  assert.match(
    css,
    /\.participantResponseChoices > button\s*\{[\s\S]{0,120}box-sizing:\s*border-box;/u,
  );
  assert.match(
    css,
    /button\[data-selected="true"\] span\s*\{[\s\S]{0,220}font-size:\s*12px;[\s\S]{0,180}-webkit-line-clamp:\s*4;/u,
  );
  assert.match(css, /\.participantSelectionStatus/u);
  assert.match(
    css,
    /\.liveCommandDeck\.participantProducerDeck \.playerWindow > \.participantResponseChoices\s*\{[\s\S]{0,220}grid-column:\s*2;[\s\S]{0,120}grid-row:\s*1 \/ 4;/u,
  );
  assert.match(
    css,
    /\.liveCommandDeck\.participantProducerDeck \.playerWindow > \.playerWindowActions\s*\{[\s\S]{0,220}grid-column:\s*1 \/ -1;[\s\S]{0,120}grid-row:\s*4;[\s\S]{0,120}display:\s*grid;/u,
  );
  assert.doesNotMatch(
    css,
    /\.live\[data-participant-producer="true"\] \.forum\s*\{[\s\S]{0,180}flex:\s*1 1 auto/u,
  );
  assert.match(css, /@media \(max-height: 900px\)/u);
  assert.match(
    css,
    /@media \(max-height: 900px\)[\s\S]{0,420}\.live\[data-participant-producer="true"\] \.stageSupport\s*\{[\s\S]{0,80}display:\s*none;/u,
  );
  assert.match(
    css,
    /@media \(max-height: 900px\)[\s\S]{0,720}\.liveCommandDeck\.participantProducerDeck\s*\{[\s\S]{0,180}position:\s*relative;/u,
  );
  assert.match(
    css,
    /@media \(max-width: 900px\)[\s\S]*?\.liveCommandDeck\.participantProducerDeck \.playerWindow\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*grid-template-rows:\s*auto;[^}]*overflow-y:\s*auto;/u,
  );
  assert.match(source, /debateParticipantTurnSubmission/u);
});

test("Participation HUD, recess intent, and review data remain role-safe", () => {
  assert.match(source, /liveParticipationDifficulty === "coach"/u);
  assert.match(source, /liveParticipationDifficulty === "standard"/u);
  assert.match(source, /juryLeaningPips=\{participation\?\.juryLeaningPips\}/u);
  assert.match(source, /Four anonymous provisional Jury leanings/u);
  assert.match(source, /bias ×/u);
  assert.match(source, /recessIntent: "recovery"/u);
  assert.match(source, /recessIntent: "deliberate"/u);
  assert.match(source, /Recess · \$\{participationRecess\.remaining\} left/u);
  assert.match(source, /participationRecess\.denials > 0/u);
  assert.match(source, /bonus time remains/u);
  assert.match(source, /Patience exhausted · verdict rushed/u);
  assert.match(source, /requestExitRecess/u);
  assert.match(
    source,
    /if \(!resume && quiet\.session\.status !== "paused"\)[\s\S]{0,520}await adoptSession\(previous, quiet\.session\);[\s\S]{0,80}return;/u,
  );
  assert.match(source, /## Human Factor/u);
  assert.match(source, /### Participant turns/u);
  assert.match(source, /### Voter predispositions/u);
  assert.match(source, /### Final vote math/u);
  assert.match(source, /Rage rush:/u);
  assert.match(source, /rageRushInfluence/u);
  assert.match(source, /participation\?\.finalJuryBallotInfluences/u);
  assert.match(source, /Anonymous juror \$\{index \+ 1\}/u);
  assert.match(source, /private rationale sealed/u);
});
