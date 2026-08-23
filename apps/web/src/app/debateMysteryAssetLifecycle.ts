import type { DebateSessionV1 } from "@localai/shared";

const EVIDENCE_RETENTION_SELECTOR =
  '[data-mystery-asset-retention="evidence"]';

/** Evidence visuals cross the investigation-to-court boundary and should join
 * the ordinary Debate opening preload runway instead of being fetched on first
 * presentation. */
export function debateMysteryCourtEvidenceAssetUrls(
  session: DebateSessionV1,
): string[] {
  if (
    session.format !== "turnabout" ||
    session.formatState.format !== "turnabout" ||
    !session.formatState.mysteryTrial
  ) return [];
  return [
    ...new Set(
      (session.evidence.exhibits ?? []).flatMap((exhibit) =>
        exhibit.imageId
          ? [`/api/images/${encodeURIComponent(exhibit.imageId)}/file`]
          : [],
      ),
    ),
  ];
}

/** Drop live DOM references to investigation-only media immediately before
 * Turnabout replaces the mystery surface. Evidence nodes are deliberately
 * retained until React completes the handoff so the court preload can reuse
 * their decoded resources. */
export function releaseDebateMysteryInvestigationMedia(
  root: ParentNode | null,
): number {
  if (!root) return 0;
  const media = Array.from(
    root.querySelectorAll<HTMLElement>("img, source, video, audio"),
  );
  let released = 0;
  for (const element of media) {
    if (element.closest(EVIDENCE_RETENTION_SELECTOR)) continue;
    element.removeAttribute("src");
    element.removeAttribute("srcset");
    element.removeAttribute("sizes");
    element.removeAttribute("poster");
    released += 1;
  }
  return released;
}
