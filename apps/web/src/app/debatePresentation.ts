import type {
  DebateEvidencePacketV1,
  DebateEvidenceSourceV1,
} from "@localai/shared";

export const DEBATE_SOURCE_LINK_PREFIX = "prism-debate-source:";

const SOURCE_MARKER =
  /\[\[source:([a-z0-9][a-z0-9_-]{0,47})\]\]/giu;

export function debateRevealDurationMs(spokenText: string): number {
  const normalized = spokenText.replace(/\s+/gu, " ").trim();
  if (!normalized) return 0;
  return Math.min(7_200, Math.max(1_100, Math.round(normalized.length * 34)));
}

export function debateVisibleContentAtProgress(
  content: string,
  progress: number,
): string {
  if (!content) return "";
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return "";
  if (clamped >= 1) return content;

  const target = Math.max(1, Math.floor(content.length * clamped));
  let end = target;

  const markerStart = content.lastIndexOf("[[source:", target);
  if (markerStart >= 0) {
    const markerEnd = content.indexOf("]]", markerStart);
    if (markerEnd >= target) end = markerStart;
  }

  const candidate = content.slice(0, end);
  const safeBoundary = Math.max(
    candidate.lastIndexOf(" "),
    candidate.lastIndexOf("\n"),
    candidate.lastIndexOf("."),
    candidate.lastIndexOf(","),
    candidate.lastIndexOf(";"),
    candidate.lastIndexOf(":"),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
  );
  if (safeBoundary >= Math.max(0, end - 22)) {
    end = safeBoundary + 1;
  }

  return content.slice(0, Math.max(0, end));
}

export function debateTranscriptIsAtLive(
  metrics: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  thresholdPx = 2,
): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <=
    thresholdPx
  );
}

export function debateTurnOwnerBotId(args: {
  thinkingBotId: string | null;
  presenting: boolean;
  presentationSpeakerBotId: string | null;
}): string | null {
  return (
    args.thinkingBotId ??
    (args.presenting ? args.presentationSpeakerBotId : null)
  );
}

export function debateMarkdownSource(
  content: string,
  evidence: DebateEvidencePacketV1,
): string {
  const allowed = new Set(evidence.sources.map((source) => source.id));
  return content.replace(SOURCE_MARKER, (_marker, rawId: string) => {
    const id = rawId.toLowerCase();
    return allowed.has(id)
      ? `[${id}](${DEBATE_SOURCE_LINK_PREFIX}${id})`
      : "";
  });
}

export function debateSourceFromMarkdownHref(
  href: string | undefined,
  evidence: DebateEvidencePacketV1,
): DebateEvidenceSourceV1 | null {
  if (!href?.startsWith(DEBATE_SOURCE_LINK_PREFIX)) return null;
  const id = href.slice(DEBATE_SOURCE_LINK_PREFIX.length).toLowerCase();
  return evidence.sources.find((source) => source.id === id) ?? null;
}

export type DebateGalleryReaction =
  | "attentive"
  | "divided"
  | "evidence"
  | "question"
  | "concession";

export function debateGalleryReaction(
  content: string,
): DebateGalleryReaction {
  const normalized = content.toLowerCase();
  if (/\[\[source:[^\]]+\]\]/u.test(normalized)) return "evidence";
  if (/\b(?:i concede|we concede|fair point|grant that|acknowledge)\b/u.test(normalized)) {
    return "concession";
  }
  if (content.includes("?")) return "question";
  if (/\b(?:but|however|instead|yet|cannot|wrong|reject)\b/u.test(normalized)) {
    return "divided";
  }
  return "attentive";
}

export function debateGalleryReactingIndices(
  content: string,
  sequence: number,
  seatCount = 7,
): number[] {
  if (!content.trim() || seatCount <= 0) return [];
  const clauseCount = Math.max(
    1,
    content.split(/[.!?;:](?:\s|$)/u).filter((part) => part.trim()).length,
  );
  const first = Math.abs(sequence * 5 + clauseCount * 3 + content.length) % seatCount;
  const second = (first + 2 + (content.length % Math.max(2, seatCount - 1))) % seatCount;
  return first === second ? [first] : [first, second];
}
