import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateEventV1, DebateSessionV1 } from "@localai/shared";
import { defaultDebateFormatStateV1, defaultDebateJuryStateV1 } from "@localai/shared";
import {
  debateJuryChamberOpenedInPresentation,
  debateJuryOutcomeRevealed,
  debateJuryRosterFooterCopy,
  debateJuryRosterStatusLabel,
  debateLivePhaseLabel,
  debatePhaseLabelFromStepKey,
  debateSessionPhaseLabel,
  debateSpectatorBakeUnsealed,
} from "./debatePresentation.ts";

function bakedSpectatorSession(
  overrides: Partial<DebateSessionV1> = {},
): DebateSessionV1 {
  const jury = {
    ...defaultDebateJuryStateV1(),
    enabled: true,
    phase: "complete" as const,
    forVotes: 5,
    againstVotes: 0,
    jurors: Array.from({ length: 5 }, (_, index) => ({
      id: `juror-${index}`,
      name: `Juror ${index + 1}`,
      role: "juror" as const,
      sideId: null,
      source: "generic" as const,
      glyph: "lucideTriangle",
      color: "#888888",
    })),
  };
  return {
    version: 1,
    id: "debate-baked",
    revision: 3,
    status: "paused",
    phase: "verdict",
    stepKey: "completed",
    provider: "local",
    model: "qwen",
    modelSelectionKind: "fixed",
    responseMode: "local",
    generationChain: [],
    format: "forum",
    formatVersion: 1,
    formatState: defaultDebateFormatStateV1("forum"),
    formality: "street",
    setupPresetId: "custom",
    playerRole: "spectator",
    playerSideId: null,
    motion: {
      version: 1,
      title: "Test motion",
      motion: "This house believes something.",
      forSide: { id: "for", label: "For" },
      againstSide: { id: "against", label: "Against" },
    },
    evidence: { version: 1, items: [], sources: [] },
    moderatorTitle: "Moderator",
    moderator: {
      id: "mod",
      name: "Mod",
      role: "moderator",
      sideId: null,
      source: "library",
      glyph: "lucideTriangle",
      color: "#aaa",
    },
    forAdvocate: {
      id: "for-bot",
      name: "For",
      role: "advocate",
      sideId: "for",
      source: "library",
      glyph: "lucideTriangle",
      color: "#a00",
    },
    againstAdvocate: {
      id: "against-bot",
      name: "Against",
      role: "advocate",
      sideId: "against",
      source: "library",
      glyph: "lucideTriangle",
      color: "#00a",
    },
    advocacyConsent: {},
    powerPlan: { version: 1, entries: [] },
    caseBoard: [],
    ballots: [],
    jury,
    playerVerdict: null,
    winnerSideId: "for",
    judgeGavel: null,
    judgeGavelCooldownUntil: null,
    objectionRuling: null,
    participantObjection: null,
    events: [
      {
        id: "e1",
        sequence: 1,
        kind: "speech",
        stepKey: "opening_for",
        speakerKind: "advocate",
        speakerBotId: "for-bot",
        sideId: "for",
        content: "Opening claim.",
        createdAt: new Date().toISOString(),
      },
      {
        id: "e2",
        sequence: 2,
        kind: "jury_verdict",
        stepKey: "jury_verdict",
        speakerKind: "juror",
        speakerBotId: "juror-0",
        sideId: "for",
        content: "We find for the motion.",
        createdAt: new Date().toISOString(),
      },
    ] as DebateEventV1[],
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    endedEarlyAt: null,
    completedAt: null,
    pausedPresentationEventId: null,
    ...overrides,
  } as DebateSessionV1;
}

describe("debate spectator bake spoiler chrome", () => {
  it("treats paused completed-floor Spectator sessions as unsealed bakes", () => {
    const session = bakedSpectatorSession();
    assert.equal(debateSpectatorBakeUnsealed(session), true);
    assert.equal(debateSessionPhaseLabel(session), "Verdict");
  });

  it("keeps Gallery ready on Opening and hides the Jury split", () => {
    const session = bakedSpectatorSession();
    assert.equal(
      debateLivePhaseLabel(session, {
        awaitingFirstWatch: true,
        activeEvent: null,
        heardThroughSequence: null,
      }),
      "Opening",
    );
    assert.equal(debateJuryOutcomeRevealed(session, null), false);
    assert.equal(
      debateJuryRosterStatusLabel({
        participantView: false,
        juryOutcomeRevealed: false,
        juryChamberOpened: false,
      }),
      "Frozen at Start",
    );
    assert.match(
      debateJuryRosterFooterCopy({
        participantView: false,
        jury: session.jury,
        juryOutcomeRevealed: false,
        juryChamberOpened: false,
      }),
      /frozen roster follows the public floor/iu,
    );
    assert.doesNotMatch(
      debateJuryRosterFooterCopy({
        participantView: false,
        jury: session.jury,
        juryOutcomeRevealed: false,
        juryChamberOpened: false,
      }),
      /returned 5/iu,
    );
  });

  it("advances the phase chip from heard speech without unlocking the Jury split", () => {
    const session = bakedSpectatorSession();
    assert.equal(
      debateLivePhaseLabel(session, {
        awaitingFirstWatch: false,
        activeEvent: session.events[0]!,
        heardThroughSequence: 1,
      }),
      "Opening",
    );
    assert.equal(debateJuryOutcomeRevealed(session, 1), false);
    assert.equal(
      debateJuryChamberOpenedInPresentation(session, 1),
      false,
    );
  });

  it("reveals the Jury split only after the verdict event is heard", () => {
    const session = bakedSpectatorSession();
    assert.equal(debateJuryOutcomeRevealed(session, 2), true);
    assert.match(
      debateJuryRosterFooterCopy({
        participantView: false,
        jury: session.jury,
        juryOutcomeRevealed: true,
        juryChamberOpened: true,
      }),
      /The Jury has returned 5–0/u,
    );
    assert.equal(
      debatePhaseLabelFromStepKey(session, "jury_verdict"),
      "Verdict",
    );
  });
});
