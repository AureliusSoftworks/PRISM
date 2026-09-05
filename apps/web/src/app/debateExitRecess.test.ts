import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { DebateSessionV1 } from "@localai/shared";

import { debateStudioExitIntent } from "./debateExitRecess.ts";

const source = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);

function participantSession(args: {
  used?: number;
  status?: DebateSessionV1["status"];
} = {}): DebateSessionV1 {
  return {
    id: "participant-debate",
    playerRole: "participant",
    status: args.status ?? "live",
    updatedAt: "2026-08-10T12:00:00.000Z",
    participation: {
      recess: {
        used: args.used ?? 1,
        max: 3,
        checkpoint:
          args.used === 3
            ? {
                revision: 14,
                phase: "rebuttal",
                stepKey: "rebuttal_participant",
                createdAt: "2026-08-10T11:55:00.000Z",
                pausedPresentationEventId: "event-8",
              }
            : undefined,
      },
    },
  } as unknown as DebateSessionV1;
}

test("Studio exit intent distinguishes recess, repeat-click, and checkpoint return", () => {
  assert.equal(
    debateStudioExitIntent({
      session: participantSession(),
      exitPending: false,
      pausePending: false,
    }),
    "request_recess",
  );
  assert.equal(
    debateStudioExitIntent({
      session: participantSession(),
      exitPending: true,
      pausePending: true,
    }),
    "leave_immediately",
  );
  assert.equal(
    debateStudioExitIntent({
      session: participantSession({ used: 3 }),
      exitPending: false,
      pausePending: false,
    }),
    "restore_final_checkpoint",
  );
  assert.equal(
    debateStudioExitIntent({
      session: participantSession({ used: 3, status: "paused" }),
      exitPending: false,
      pausePending: false,
    }),
    "leave",
  );
  assert.equal(
    debateStudioExitIntent({
      session: {
        ...participantSession(),
        playerRole: "judge",
      },
      exitPending: true,
      pausePending: false,
    }),
    "wait",
  );
});

test("Leave Debate stays portal-mounted, enabled, and requires two activations", () => {
  const exitStart = source.indexOf("const exitLiveSessionToStudio");
  const exitEnd = source.indexOf(
    "const continueExhaustedParticipantDebate",
    exitStart,
  );
  const exitBlock = source.slice(exitStart, exitEnd);
  const activateStart = exitBlock.indexOf("const activateLeaveDebate");
  const activateBlock = exitBlock.slice(activateStart);
  assert.match(
    exitBlock,
    /const exitIntent = debateStudioExitIntent\(\{[\s\S]{0,220}exitPending: exitLiveSessionInFlightRef\.current,[\s\S]{0,120}pausePending: pauseInFlightRef\.current/u,
  );
  // First activation arms the button and queues the in-world soft recess
  // without navigating; only the second activation leaves the chamber.
  assert.match(
    activateBlock,
    /if \(!leaveDebateArmed\) \{[\s\S]{0,140}setLeaveDebateArmed\(true\);[\s\S]{0,300}void softPauseForRecess\(\);[\s\S]{0,60}return;[\s\S]{0,80}exitLiveSessionToStudio\(\)/u,
  );
  const portalStart = source.indexOf(
    "liveSessionActive &&\n      view !== \"mystery\" &&\n      activeSession &&\n      leaveDebatePortalTarget",
  );
  const portalEnd = source.indexOf("{experience}", portalStart);
  const portalBlock = source.slice(portalStart, portalEnd);
  assert.match(portalBlock, /createPortal\(/u);
  assert.match(portalBlock, /data-debate-leave-control="true"/u);
  assert.match(portalBlock, /data-debate-leave-confirm=/u);
  assert.match(portalBlock, /leaveDebateArmed \? "Leave now" : "← Leave Debate"/u);
  assert.match(portalBlock, /Click again for an instant return/u);
  assert.doesNotMatch(portalBlock, /disabled=/u);
  const dockCssStart = cssSource.indexOf(".persistentLeaveDock {");
  const dockCssEnd = cssSource.indexOf(
    ".persistentLeaveButton {",
    dockCssStart,
  );
  const dockCss = cssSource.slice(dockCssStart, dockCssEnd);
  assert.match(dockCss, /position: fixed;/u);
  assert.match(
    dockCss,
    /top:\s*calc\([\s\S]{0,120}var\(--app-shell-top-nav-height/u,
  );
  assert.match(dockCss, /z-index: 2147483647;/u);
  assert.match(dockCss, /pointer-events: auto;/u);
  assert.match(
    source,
    /holdBackAction=\{\{[\s\S]{0,160}disabled: false,[\s\S]{0,80}onClick: activateLeaveDebate/u,
  );
});

test("confirmed leave returns to Studio before recess housekeeping settles", () => {
  const requestStart = source.indexOf("const requestExitRecess");
  const requestEnd = source.indexOf(
    "const exitLiveSessionToStudio",
    requestStart,
  );
  const requestBlock = source.slice(requestStart, requestEnd);
  assert.match(
    requestBlock,
    /participantExit \? "participant-exit-recess" : "moderator-exit-recess"/u,
  );
  assert.match(requestBlock, /\/pause`/u);
  assert.match(requestBlock, /\/pause\/announce`/u);
  assert.match(
    requestBlock,
    /if \(!exitLiveSessionImmediateRef\.current\) \{[\s\S]{0,140}await adoptSession\(previous, announced\.session, \{[\s\S]{0,100}automaticJudgeGavel: true/u,
  );
  const exitBlock = source.slice(
    requestEnd,
    source.indexOf("const endDebateEarly", requestEnd),
  );
  assert.match(
    exitBlock,
    /exitLiveSessionImmediateRef\.current = true;[\s\S]{0,300}if \(exitIntent === "request_recess" && pending\)[\s\S]{0,300}recessRequest = requestExitRecess\(pending\)/u,
  );
  assert.match(
    exitBlock,
    /returnLiveSessionToStudio\(pending,[\s\S]{0,400}if \(!recessRequest\)[\s\S]{0,300}void recessRequest/u,
  );
  assert.ok(
    exitBlock.indexOf("recessRequest = requestExitRecess(pending)") <
      exitBlock.indexOf("returnLiveSessionToStudio(pending, {"),
  );
  // The confirmed-leave path never awaits recess housekeeping; the soft-pause
  // path may await freely because it stays seated and never navigates.
  const softPauseStart = exitBlock.indexOf("const softPauseForRecess");
  assert.ok(softPauseStart > 0, "soft pause must live beside the exit path");
  const confirmedLeaveBlock = exitBlock.slice(0, softPauseStart);
  const softPauseBlock = exitBlock.slice(
    softPauseStart,
    exitBlock.indexOf("const activateLeaveDebate", softPauseStart),
  );
  assert.doesNotMatch(confirmedLeaveBlock, /await requestExitRecess/u);
  assert.match(confirmedLeaveBlock, /return is deliberately not blocked/u);
  assert.match(softPauseBlock, /await requestExitRecess\(pending\)/u);
  assert.match(
    softPauseBlock,
    /exitLiveSessionImmediateRef\.current = false;/u,
    "soft pause keeps the ceremonial announce path",
  );
  assert.doesNotMatch(
    softPauseBlock,
    /returnLiveSessionToStudio/u,
    "soft pause never navigates",
  );
});

test("exhausted Participants leave without a fourth request and reopen at the final checkpoint", () => {
  const exitStart = source.indexOf("const exitLiveSessionToStudio");
  const exitEnd = source.indexOf(
    "const continueExhaustedParticipantDebate",
    exitStart,
  );
  const exitBlock = source.slice(exitStart, exitEnd);
  assert.match(
    exitBlock,
    /preserveParticipantRecoveryMarker:[\s\S]{0,160}exitIntent === "restore_final_checkpoint"/u,
  );
  assert.match(exitBlock, /if \(exitIntent === "request_recess" && pending\)/u);
  assert.doesNotMatch(exitBlock, /recessIntent: "decision_hold"/u);
  assert.doesNotMatch(exitBlock, /setExhaustedExitOpen\(true\)/u);

  assert.match(source, /\/recover-final-recess`/u);
  assert.match(source, /open-final-recess-checkpoint/u);
  assert.match(source, /debateSessionAtFinalRecessCheckpoint/u);
  assert.match(source, /participant-crash-recovery:/u);
  assert.match(source, /recessIntent: "recovery"/u);
  assert.match(source, /No recesses ·/u);
  assert.match(source, /Patience exhausted · verdict rushed/u);
  assert.match(source, /participationRecess\.rageRush/u);
});
