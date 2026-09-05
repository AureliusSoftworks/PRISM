import type { DatabaseSync } from "node:sqlite";
import {
  DEBATE_MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE_V1,
  debateMysteryVenueHeldBySessionV1,
  type DebateMysteryMansionArchiveHoldV1,
} from "@localai/shared";
import { HttpError } from "./utils.http.ts";

export const MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE =
  DEBATE_MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE_V1;

interface ArchiveSessionHoldRow {
  id: string;
  status: string;
  completed_at: string | null;
  session_json: string;
}

/**
 * Maps occupied library venues to the unfinished Archive case holding them.
 */
export function listDebateMysteryMansionArchiveHoldsV1(
  db: DatabaseSync,
  userId: string,
): Map<string, DebateMysteryMansionArchiveHoldV1> {
  const rows = db.prepare(
    `SELECT id, status, completed_at, session_json
       FROM debate_sessions
      WHERE user_id = ?
        AND status NOT IN ('cancelled', 'completed', 'failed')`,
  ).all(userId) as unknown as ArchiveSessionHoldRow[];
  const holds = new Map<string, DebateMysteryMansionArchiveHoldV1>();
  for (const row of rows) {
    if (row.completed_at) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.session_json);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const session = parsed as {
      format?: string | null;
      motion?: { title?: string | null } | null;
      formatState?: {
        format?: string | null;
        version?: number | null;
        playPhase?: string | null;
        caseTitle?: string | null;
        config?: {
          mansionBundleId?: string | null;
          mansionSnapshot?: { sourceBundleId?: string | null } | null;
        } | null;
      } | null;
    };
    const bundleIds = [
      session.formatState?.config?.mansionBundleId,
      session.formatState?.config?.mansionSnapshot?.sourceBundleId,
    ].flatMap((value) => typeof value === "string" && value.trim() ? [value.trim()] : []);
    for (const bundleId of new Set(bundleIds)) {
      if (holds.has(bundleId)) continue;
      const hold = debateMysteryVenueHeldBySessionV1({
        bundleId,
        session: {
          ...session,
          id: row.id,
          status: row.status,
          completedAt: row.completed_at,
        },
      });
      if (hold) holds.set(bundleId, hold);
    }
  }
  return holds;
}

export function debateMysteryMansionArchiveHoldV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): DebateMysteryMansionArchiveHoldV1 | null {
  return listDebateMysteryMansionArchiveHoldsV1(db, userId).get(bundleId) ?? null;
}

export function assertDebateMysteryMansionNotHeldByOngoingCaseV1(
  db: DatabaseSync,
  userId: string,
  bundleId: string,
): void {
  if (!debateMysteryMansionArchiveHoldV1(db, userId, bundleId)) return;
  throw new HttpError(
    409,
    MYSTERY_VENUE_HELD_BY_ONGOING_CASE_MESSAGE,
    "MYSTERY_VENUE_HELD_BY_ONGOING_CASE",
  );
}
