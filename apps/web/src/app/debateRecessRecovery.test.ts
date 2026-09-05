import assert from "node:assert/strict";
import test from "node:test";
import type { DebateSessionV1 } from "@localai/shared";
import {
  DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY,
  clearDebateExhaustedRecessRecoveryMarker,
  debateExhaustedRecessRecoveryMarker,
  debateParticipantRecoveryMarker,
  debateSessionAtFinalRecessCheckpoint,
  readDebateExhaustedRecessRecoveryMarker,
  writeDebateExhaustedRecessRecoveryMarker,
} from "./debateRecessRecovery.ts";

function session(overrides: Record<string, unknown> = {}): DebateSessionV1 {
  return {
    id: "debate-1",
    playerRole: "participant",
    status: "live",
    updatedAt: "2026-08-09T18:20:00.000Z",
    participation: {
      recess: {
        used: 3,
        max: 3,
        checkpoint: {
          revision: 14,
          phase: "rebuttal",
          stepKey: "rebuttal_participant",
          createdAt: "2026-08-09T18:15:00.000Z",
          pausedPresentationEventId: "event-8",
        },
      },
    },
    ...overrides,
  } as unknown as DebateSessionV1;
}

function memoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key) => entries.get(key) ?? null,
    key: (index) => [...entries.keys()][index] ?? null,
    removeItem: (key) => {
      entries.delete(key);
    },
    setItem: (key, value) => {
      entries.set(key, value);
    },
  };
}

test("only unfinished exhausted Participant sessions create recovery markers", () => {
  assert.deepEqual(debateExhaustedRecessRecoveryMarker(session()), {
    version: 1,
    sessionId: "debate-1",
    checkpointRevision: 14,
    updatedAt: "2026-08-09T18:20:00.000Z",
  });
  assert.equal(
    debateExhaustedRecessRecoveryMarker(
      session({ participation: { recess: { used: 2, max: 3 } } }),
    ),
    null,
  );
  assert.deepEqual(
    debateParticipantRecoveryMarker(
      session({ participation: { recess: { used: 2, max: 3 } } }),
    ),
    {
      version: 1,
      sessionId: "debate-1",
      checkpointRevision: null,
      updatedAt: "2026-08-09T18:20:00.000Z",
    },
  );
  assert.equal(
    debateExhaustedRecessRecoveryMarker(session({ status: "completed" })),
    null,
  );
  const rushed = session({
    participation: {
      recess: {
        used: 3,
        max: 3,
        checkpoint: {
          revision: 14,
          phase: "rebuttal",
          stepKey: "rebuttal_participant",
          createdAt: "2026-08-09T18:15:00.000Z",
          pausedPresentationEventId: "event-8",
        },
        rageRush: {
          eventId: "rage-1",
          triggeredAt: "2026-08-09T18:20:00.000Z",
          denialCount: 2,
          ballotInfluence: -80,
        },
      },
    },
  });
  assert.equal(debateExhaustedRecessRecoveryMarker(rushed), null);
  assert.equal(debateParticipantRecoveryMarker(rushed)?.sessionId, "debate-1");
});

test("recovery markers round-trip and clear through local storage", () => {
  const storage = memoryStorage();
  writeDebateExhaustedRecessRecoveryMarker(
    storage,
    session({ participation: { recess: { used: 2, max: 3 } } }),
  );
  assert.equal(
    readDebateExhaustedRecessRecoveryMarker(storage)?.checkpointRevision,
    null,
  );
  writeDebateExhaustedRecessRecoveryMarker(storage, session());
  assert.equal(
    storage.getItem(DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY) !== null,
    true,
  );
  assert.equal(
    readDebateExhaustedRecessRecoveryMarker(storage)?.checkpointRevision,
    14,
  );
  clearDebateExhaustedRecessRecoveryMarker(storage);
  assert.equal(readDebateExhaustedRecessRecoveryMarker(storage), null);
});

test("final recess checkpoint matching requires the exact paused floor", () => {
  assert.equal(
    debateSessionAtFinalRecessCheckpoint(
      session({
        status: "paused",
        phase: "rebuttal",
        stepKey: "rebuttal_participant",
        pausedPresentationEventId: "event-8",
      }),
    ),
    true,
  );
  assert.equal(
    debateSessionAtFinalRecessCheckpoint(
      session({
        status: "live",
        phase: "rebuttal",
        stepKey: "rebuttal_participant",
        pausedPresentationEventId: "event-8",
      }),
    ),
    false,
  );
  assert.equal(
    debateSessionAtFinalRecessCheckpoint(
      session({
        status: "paused",
        phase: "rebuttal",
        stepKey: "rebuttal_opponent",
        pausedPresentationEventId: "event-8",
      }),
    ),
    false,
  );
});

test("malformed recovery markers fail closed", () => {
  const storage = memoryStorage();
  storage.setItem(DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY, "not-json");
  assert.equal(readDebateExhaustedRecessRecoveryMarker(storage), null);
  storage.setItem(
    DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY,
    JSON.stringify({ version: 1, sessionId: "", checkpointRevision: 0 }),
  );
  assert.equal(readDebateExhaustedRecessRecoveryMarker(storage), null);
});
