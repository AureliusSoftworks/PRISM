import type { DebateMysteryRoomTemplateV1 } from "@localai/shared";

/** User-generated room art wins; bundled art is always a same-origin fallback. */
export function mysteryRoomArtworkSrc(
  imageId: string | null,
  template: DebateMysteryRoomTemplateV1,
): string | null {
  if (imageId) return `/api/images/${encodeURIComponent(imageId)}/file`;
  return template.bundledAssetPath ?? null;
}
