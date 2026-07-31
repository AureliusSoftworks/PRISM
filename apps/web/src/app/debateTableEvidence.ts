import {
  debateEvidenceItemById,
  type DebateEventV1,
  type DebateEvidenceItemV1,
  type DebateEvidencePacketV1,
} from "@localai/shared";

/**
 * Evidence IDs an event places or cites for the chamber table, in display
 * preference order (`evidenceSourceId` first, then `sourceIds`).
 */
export function debateEventEvidenceIds(event: DebateEventV1): string[] {
  const ids: string[] = [];
  const primary = event.evidenceSourceId?.trim();
  if (primary) ids.push(primary);
  for (const sourceId of event.sourceIds) {
    const trimmed = sourceId.trim();
    if (trimmed && !ids.includes(trimmed)) ids.push(trimmed);
  }
  return ids;
}

const DEBATE_ADVOCATE_DISCUSSION_KINDS = new Set<DebateEventV1["kind"]>([
  "speech",
  "testimony",
  "press",
  "objection",
  "evidence",
  "revelation",
  "reaction",
  "interjection",
  "player_turn",
]);

/**
 * True when this floor turn is an advocate/participant discussion beat that
 * can retire table evidence by moving on without citing it.
 */
export function debateEventIsAdvocateDiscussion(event: DebateEventV1): boolean {
  if (!DEBATE_ADVOCATE_DISCUSSION_KINDS.has(event.kind)) return false;
  return event.speakerKind === "advocate" || event.speakerKind === "player";
}

export function debateTableEvidenceItem(
  evidence: DebateEvidencePacketV1,
  stickyId: string | null,
): DebateEvidenceItemV1 | null {
  if (!stickyId) return null;
  const item = debateEvidenceItemById(evidence, stickyId);
  if (item?.kind === "exhibit" || item?.kind === "source") return item;
  return null;
}

/**
 * Keep presented evidence on the table until another piece replaces it, or
 * until an advocate/participant discussion turn begins that no longer cites it.
 * Moderator, Judge gavel, Jury, and between-turn gaps keep the sticky piece.
 */
export function resolveDebateTableEvidenceStickyId(args: {
  previousStickyId: string | null;
  activeEvent: DebateEventV1 | null;
  presenting: boolean;
  evidence: DebateEvidencePacketV1;
}): string | null {
  const { previousStickyId, activeEvent, presenting, evidence } = args;
  if (!activeEvent) return previousStickyId;

  for (const id of debateEventEvidenceIds(activeEvent)) {
    if (debateTableEvidenceItem(evidence, id)) return id;
  }

  if (!previousStickyId) return null;
  if (!debateTableEvidenceItem(evidence, previousStickyId)) return null;
  if (!presenting) return previousStickyId;
  if (!debateEventIsAdvocateDiscussion(activeEvent)) return previousStickyId;
  return null;
}
