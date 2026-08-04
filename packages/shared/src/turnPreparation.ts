export const PREPARED_TURN_VERSION = 1 as const;
/** Long enough for a complete ten-minute AUTO recovery plus commit handoff. */
export const PREPARED_TURN_TTL_MS = 12 * 60_000;

export type PreparedTurnSurfaceV1 = "coffee" | "signal" | "debate";
export type PreparedTurnPhaseV1 =
  | "preparing"
  | "ready"
  | "committing"
  | "committed"
  | "discarded"
  | "failed"
  | "expired";

/** Frozen prompt-affecting state used to prove a speculative turn is still current. */
export interface PreparedTurnCursorV1 {
  revision: string | number;
  lastMessageId: string | null;
  lastEventId: string | null;
  floorOwnerId: string | null;
  castHash: string;
  powersHash: string;
  promptStateHash: string;
}

export interface PreparedTurnUtteranceV1 {
  id: string;
  speakerBotId: string;
  text: string;
}

export interface PreparedTurnCommitResultV1 {
  committedAt: string;
  revision: string | number;
}

/** Public, serializable status for a server-owned speculative generation job. */
export interface PreparedTurnV1 {
  v: 1;
  id: string;
  surface: PreparedTurnSurfaceV1;
  sessionId: string;
  stateCursor: PreparedTurnCursorV1;
  phase: PreparedTurnPhaseV1;
  provisionalUtterances: PreparedTurnUtteranceV1[];
  speakerBotId: string | null;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  error: string | null;
  commitResult: PreparedTurnCommitResultV1 | null;
}

export function preparedTurnCursorMatchesV1(
  frozen: PreparedTurnCursorV1,
  current: PreparedTurnCursorV1,
): boolean {
  return (
    frozen.revision === current.revision &&
    frozen.lastMessageId === current.lastMessageId &&
    frozen.lastEventId === current.lastEventId &&
    frozen.floorOwnerId === current.floorOwnerId &&
    frozen.castHash === current.castHash &&
    frozen.powersHash === current.powersHash &&
    frozen.promptStateHash === current.promptStateHash
  );
}
