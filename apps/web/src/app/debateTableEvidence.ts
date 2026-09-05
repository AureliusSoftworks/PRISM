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

/** Evidence markers that appear in public content (spoken / Proceedings text). */
export function debateVisibleEvidenceIds(content: string): string[] {
  const ids: string[] = [];
  for (const match of content.matchAll(
    /\[\[(?:source|exhibit):([^\]\s]{1,120})\]\]/giu,
  )) {
    const id = match[1]?.trim();
    if (id && !ids.includes(id)) ids.push(id);
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
 * The single chamber-table piece for a turn: the first marker the speaker
 * actually includes in their public line. Metadata-only sourceIds that never
 * appear in the text do not earn a display.
 */
export function debateEventPrimaryTableEvidenceId(
  event: DebateEventV1,
  evidence: DebateEvidencePacketV1,
): string | null {
  for (const id of debateVisibleEvidenceIds(event.content)) {
    if (debateTableEvidenceItem(evidence, id)) return id;
  }
  return null;
}

/**
 * Place or swap table evidence when a speaker's turn arms — only if that turn
 * will discuss the piece. Keep it through moderator/gavel gaps; clear when the
 * next advocate discussion moves on without a citation. Do not mid-line swap
 * as later markers become audible.
 */
export function resolveDebateTableEvidenceStickyId(args: {
  previousStickyId: string | null;
  activeEvent: DebateEventV1 | null;
  presenting: boolean;
  evidence: DebateEvidencePacketV1;
  /** Retained for call-site compatibility; mid-line audible progress is ignored. */
  visibleContent?: string;
}): string | null {
  const { previousStickyId, activeEvent, presenting, evidence } = args;
  if (!activeEvent) return previousStickyId;

  if (presenting) {
    const primary = debateEventPrimaryTableEvidenceId(activeEvent, evidence);
    if (primary) return primary;
    if (!debateEventIsAdvocateDiscussion(activeEvent)) {
      return previousStickyId &&
        debateTableEvidenceItem(evidence, previousStickyId)
        ? previousStickyId
        : null;
    }
    return null;
  }

  if (!previousStickyId) return null;
  if (!debateTableEvidenceItem(evidence, previousStickyId)) return null;
  return previousStickyId;
}
