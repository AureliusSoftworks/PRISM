import { CURRENT_MANSION_ROOM_ART_CONTRACT } from "@localai/shared";

export const WHODUNNIT_INVESTIGATION_ART_STYLE_STORAGE_KEY =
  "prism.whodunnit.investigation-art-style.v1";

export type WhodunnitInvestigationArtStyle = "mosaic" | "illustrated";

export const DEFAULT_WHODUNNIT_INVESTIGATION_ART_STYLE =
  CURRENT_MANSION_ROOM_ART_CONTRACT.defaultPresentation;
export const WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION =
  CURRENT_MANSION_ROOM_ART_CONTRACT.version;

function withPixelArtPresentationVersion(url: string): string {
  if (/[?&]pixelArt=\d+/u.test(url)) {
    return url.replace(
      /([?&]pixelArt=)\d+/u,
      `$1${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`,
    );
  }
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`;
}

function whodunnitInvestigationArtStyleStorageKey(scopeId?: string): string {
  const scope = scopeId?.trim();
  return scope
    ? `${WHODUNNIT_INVESTIGATION_ART_STYLE_STORAGE_KEY}:${scope}`
    : WHODUNNIT_INVESTIGATION_ART_STYLE_STORAGE_KEY;
}

export function normalizeWhodunnitInvestigationArtStyle(
  value: unknown,
): WhodunnitInvestigationArtStyle {
  return value === "illustrated" ? "illustrated" : "mosaic";
}

export function readWhodunnitInvestigationArtStyle(
  storage: Pick<Storage, "getItem"> | null | undefined,
  scopeId?: string,
): WhodunnitInvestigationArtStyle {
  if (!storage) return DEFAULT_WHODUNNIT_INVESTIGATION_ART_STYLE;
  try {
    return normalizeWhodunnitInvestigationArtStyle(
      storage.getItem(whodunnitInvestigationArtStyleStorageKey(scopeId)),
    );
  } catch {
    return DEFAULT_WHODUNNIT_INVESTIGATION_ART_STYLE;
  }
}

export function writeWhodunnitInvestigationArtStyle(
  storage: Pick<Storage, "setItem"> | null | undefined,
  style: WhodunnitInvestigationArtStyle,
  scopeId?: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(whodunnitInvestigationArtStyleStorageKey(scopeId), style);
  } catch {
    // A blocked storage surface must never interrupt an investigation.
  }
}

export function whodunnitBundledRoomArtPath(
  bundledAssetPath: string | null | undefined,
  style: WhodunnitInvestigationArtStyle,
): string | null {
  if (!bundledAssetPath) return null;
  if (/-mosaic\.webp(?:\?|$)/iu.test(bundledAssetPath)) {
    return withPixelArtPresentationVersion(bundledAssetPath);
  }
  if (style === "illustrated") return bundledAssetPath;
  const match = bundledAssetPath.match(/^(.*?)(\.(?:png|jpe?g|webp))(\?.*)?$/iu);
  if (!match) return bundledAssetPath;
  return withPixelArtPresentationVersion(`${match[1]}-mosaic.webp${match[3] ?? ""}`);
}

const WHODUNNIT_BUNDLED_ROOM_ART_BY_TEMPLATE: Readonly<Record<string, string>> =
  Object.freeze({
    foyer: "/debate/mystery/rooms/foyer.webp",
    parlor: "/debate/mystery/rooms/living-room.webp",
    library: "/debate/mystery/rooms/library.webp",
    study: "/debate/mystery/rooms/office.webp",
    "dining-room": "/debate/mystery/rooms/dining-room.webp",
    kitchen: "/debate/mystery/rooms/kitchen.webp",
    conservatory: "/debate/mystery/rooms/arboretum.webp",
    ballroom: "/debate/mystery/rooms/ballroom.webp",
    "primary-bedroom": "/debate/mystery/rooms/bedroom.webp",
    "guest-bedroom": "/debate/mystery/rooms/bedroom.webp",
    bathroom: "/debate/mystery/rooms/bathroom.webp",
    cellar: "/debate/mystery/rooms/basement.webp",
    "wine-room": "/debate/mystery/rooms/lounge.webp",
    utility: "/debate/mystery/rooms/garage.webp",
    attic: "/debate/mystery/rooms/attic-mosaic.webp",
    theater: "/debate/mystery/rooms/theater.webp",
    pool: "/debate/mystery/rooms/pool.webp",
    "rooftop-lounge": "/debate/mystery/rooms/rooftop-lounge.webp",
  });

/** Keeps imported and legacy rooms visually playable when their portable
 * record predates bundledAssetPath. Explicit package art still wins. */
export function whodunnitBundledRoomArtPathForRoom(
  room: {
    templateId?: string | null;
    bundledAssetPath?: string | null;
  },
  style: WhodunnitInvestigationArtStyle,
): string | null {
  const fallbackPath = room.templateId
    ? WHODUNNIT_BUNDLED_ROOM_ART_BY_TEMPLATE[room.templateId] ?? null
    : null;
  return whodunnitBundledRoomArtPath(
    room.bundledAssetPath ?? fallbackPath,
    style,
  );
}

export function whodunnitInvestigationAvatarPresentation(
  style: WhodunnitInvestigationArtStyle,
): "mini" | "full" {
  return style === "mosaic" ? "mini" : "full";
}

export function whodunnitIllustratedRoomSubjectId(roomId: string): string {
  return `${roomId}:illustrated-v1`;
}

export function whodunnitSealedRoomArtUrl(args: {
  sessionId: string;
  subjectId: string;
  style: WhodunnitInvestigationArtStyle;
}): string {
  const base = `/api/debates/${encodeURIComponent(args.sessionId)}/mystery-assets/room/${encodeURIComponent(args.subjectId)}/file`;
  return args.style === "mosaic"
    ? `${base}?style=mosaic&pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`
    : base;
}

export function whodunnitSavedRoomArtUrl(
  imageId: string | null | undefined,
  style: WhodunnitInvestigationArtStyle,
): string | null {
  if (!imageId) return null;
  const base = `/api/images/${encodeURIComponent(imageId)}/file`;
  return style === "mosaic"
    ? `${base}?style=mosaic&pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`
    : base;
}

export interface WhodunnitDiscoveredMansionRoomArtV1 {
  style: WhodunnitInvestigationArtStyle;
  url: string;
}

/** Resolve a mansion-board room plate without exposing an undiscovered room.
 * A missing per-room Realistic upgrade falls back through the Pixel Art route
 * instead of leaving a discovered block blank. */
export function whodunnitDiscoveredMansionRoomArtV1(args: {
  discovered: boolean;
  activeStyle: WhodunnitInvestigationArtStyle;
  illustratedReady: boolean;
  sealedIllustratedUrl?: string | null;
  sealedMosaicUrl?: string | null;
  imageId?: string | null;
  templateId?: string | null;
  bundledAssetPath?: string | null;
}): WhodunnitDiscoveredMansionRoomArtV1 | null {
  if (!args.discovered) return null;
  const style = args.activeStyle === "illustrated" && args.illustratedReady
    ? "illustrated"
    : "mosaic";
  const sealedUrl = style === "illustrated"
    ? args.sealedIllustratedUrl
    : args.sealedMosaicUrl;
  const url = sealedUrl
    ?? whodunnitSavedRoomArtUrl(args.imageId, style)
    ?? whodunnitBundledRoomArtPathForRoom({
      templateId: args.templateId,
      bundledAssetPath: args.bundledAssetPath,
    }, style);
  return url ? { style, url } : null;
}

export function whodunnitMansionRoomArtUrl(
  mansionId: string,
  assetId: string,
  style: WhodunnitInvestigationArtStyle,
): string {
  const base = `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/assets/${encodeURIComponent(assetId)}/file`;
  return style === "mosaic"
    ? `${base}?style=mosaic&pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`
    : base;
}
