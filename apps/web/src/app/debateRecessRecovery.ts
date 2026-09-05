import type { DebateSessionV1 } from "@localai/shared";

export const DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY =
  "prism:debate:exhausted-recess-recovery:v1";

export interface DebateExhaustedRecessRecoveryMarkerV1 {
  version: 1;
  sessionId: string;
  checkpointRevision: number | null;
  updatedAt: string;
}

export function debateExhaustedRecessRecoveryMarker(
  session: DebateSessionV1 | null,
): DebateExhaustedRecessRecoveryMarkerV1 | null {
  const marker = debateParticipantRecoveryMarker(session);
  const recess = session?.participation?.recess;
  const checkpoint = recess?.checkpoint;
  if (
    !marker ||
    !recess ||
    recess.used < recess.max ||
    !checkpoint ||
    recess.rageRush
  ) {
    return null;
  }
  return {
    ...marker,
    checkpointRevision: checkpoint.revision,
  };
}

export function debateSessionAtFinalRecessCheckpoint(
  session: DebateSessionV1 | null,
): boolean {
  const checkpoint = session?.participation?.recess.checkpoint;
  return Boolean(
    checkpoint &&
      session?.status === "paused" &&
      session.phase === checkpoint.phase &&
      session.stepKey === checkpoint.stepKey &&
      (session.pausedPresentationEventId ?? null) ===
        checkpoint.pausedPresentationEventId,
  );
}

export function debateParticipantRecoveryMarker(
  session: DebateSessionV1 | null,
): DebateExhaustedRecessRecoveryMarkerV1 | null {
  if (
    !session ||
    session.playerRole !== "participant" ||
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
  ) {
    return null;
  }
  return {
    version: 1,
    sessionId: session.id,
    checkpointRevision:
      session.participation?.recess.checkpoint?.revision ?? null,
    updatedAt: session.updatedAt,
  };
}

export function readDebateExhaustedRecessRecoveryMarker(
  storage: Pick<Storage, "getItem">,
): DebateExhaustedRecessRecoveryMarkerV1 | null {
  try {
    const raw = storage.getItem(DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<DebateExhaustedRecessRecoveryMarkerV1>;
    if (
      value.version !== 1 ||
      typeof value.sessionId !== "string" ||
      !value.sessionId.trim() ||
      (value.checkpointRevision !== null &&
        (!Number.isInteger(value.checkpointRevision) ||
          (value.checkpointRevision ?? 0) < 1)) ||
      typeof value.updatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.updatedAt))
    ) {
      return null;
    }
    return value as DebateExhaustedRecessRecoveryMarkerV1;
  } catch {
    return null;
  }
}

export function writeDebateExhaustedRecessRecoveryMarker(
  storage: Pick<Storage, "setItem" | "removeItem">,
  session: DebateSessionV1 | null,
): void {
  const marker = debateParticipantRecoveryMarker(session);
  if (!marker) {
    storage.removeItem(DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY);
    return;
  }
  storage.setItem(DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY, JSON.stringify(marker));
}

export function clearDebateExhaustedRecessRecoveryMarker(
  storage: Pick<Storage, "removeItem">,
): void {
  storage.removeItem(DEBATE_EXHAUSTED_RECESS_RECOVERY_KEY);
}
