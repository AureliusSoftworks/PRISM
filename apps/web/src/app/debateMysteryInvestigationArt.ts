import { CURRENT_MANSION_ROOM_ART_CONTRACT } from "@localai/shared";
import {
  readBrowserOwnerJsonV1,
  writeBrowserOwnerJsonV1,
} from "./browserOwnerState";

const LEGACY_WHODUNNIT_INVESTIGATION_ART_STYLE_STORAGE_KEY =
  "prism.whodunnit.investigation-art-style.v1";
export const WHODUNNIT_ROOM_UPGRADE_STORAGE_KEY =
  "prism.whodunnit.room-upgrade-enabled.v1";

/** Internal asset-route variant. Player preference is the Upgraded boolean. */
export type WhodunnitInvestigationArtStyle = "mosaic" | "illustrated";
export type WhodunnitMosaicGridVisibility = "visible" | "hidden";

export const DEFAULT_WHODUNNIT_ROOM_UPGRADE_ENABLED = false;
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

function scopedStorageKey(key: string, scopeId?: string): string {
  const scope = scopeId?.trim();
  return scope ? `${key}:${scope}` : key;
}

function whodunnitRoomUpgradeBrowserLogicalKey(scopeId: string): string {
  return `whodunnit-room-upgrade:${scopeId}`;
}

export async function readEncryptedWhodunnitRoomUpgradeEnabled(args: {
  ownerId: string;
  scopeId: string;
  legacyStorage?: Pick<Storage, "getItem" | "removeItem"> | null;
  initialEnabled?: boolean;
}): Promise<boolean> {
  const existing = await readBrowserOwnerJsonV1<boolean>({
    ownerId: args.ownerId,
    logicalKey: whodunnitRoomUpgradeBrowserLogicalKey(args.scopeId),
  });
  const legacyKeys = [
    scopedStorageKey(WHODUNNIT_ROOM_UPGRADE_STORAGE_KEY, args.scopeId),
    scopedStorageKey(
      LEGACY_WHODUNNIT_INVESTIGATION_ART_STYLE_STORAGE_KEY,
      args.scopeId,
    ),
  ];
  if (typeof existing === "boolean") {
    for (const key of legacyKeys) {
      try {
        args.legacyStorage?.removeItem(key);
      } catch {
        // The encrypted value remains authoritative.
      }
    }
    return existing;
  }

  let migrated: boolean | null = null;
  try {
    const current = args.legacyStorage?.getItem(legacyKeys[0]);
    const legacy = args.legacyStorage?.getItem(legacyKeys[1]);
    if (current === "on" || current === "off") migrated = current === "on";
    else if (legacy === "illustrated" || legacy === "mosaic") {
      migrated = legacy === "illustrated";
    }
  } catch {
    // Inaccessible plaintext is ignored and never copied across accounts.
  }
  for (const key of legacyKeys) {
    try {
      args.legacyStorage?.removeItem(key);
    } catch {
      // Best effort cleanup only.
    }
  }
  if (migrated !== null) {
    await writeBrowserOwnerJsonV1({
      ownerId: args.ownerId,
      logicalKey: whodunnitRoomUpgradeBrowserLogicalKey(args.scopeId),
      value: migrated,
    });
    return migrated;
  }
  return args.initialEnabled ?? DEFAULT_WHODUNNIT_ROOM_UPGRADE_ENABLED;
}

export function writeEncryptedWhodunnitRoomUpgradeEnabled(args: {
  ownerId: string;
  scopeId: string;
  enabled: boolean;
}): Promise<boolean> {
  return writeBrowserOwnerJsonV1({
    ownerId: args.ownerId,
    logicalKey: whodunnitRoomUpgradeBrowserLogicalKey(args.scopeId),
    value: args.enabled,
  });
}

export function whodunnitRoomArtStyleForUpgrade(
  upgradeEnabled: boolean,
  upgradeReady: boolean,
): WhodunnitInvestigationArtStyle {
  return upgradeEnabled && upgradeReady ? "illustrated" : "mosaic";
}

export function readWhodunnitRoomUpgradeEnabled(
  storage: Pick<Storage, "getItem"> | null | undefined,
  scopeId?: string,
  initialEnabled = DEFAULT_WHODUNNIT_ROOM_UPGRADE_ENABLED,
): boolean {
  if (!storage) return initialEnabled;
  try {
    const saved = storage.getItem(
      scopedStorageKey(WHODUNNIT_ROOM_UPGRADE_STORAGE_KEY, scopeId),
    );
    if (saved === "on") return true;
    if (saved === "off") return false;

    // Preserve an explicit selection made before the control became one
    // Upgraded switch. Absence still defers to the frozen Forge request.
    const legacy = storage.getItem(
      scopedStorageKey(LEGACY_WHODUNNIT_INVESTIGATION_ART_STYLE_STORAGE_KEY, scopeId),
    );
    if (legacy === "illustrated") return true;
    if (legacy === "mosaic") return false;
    return initialEnabled;
  } catch {
    return initialEnabled;
  }
}

export function writeWhodunnitRoomUpgradeEnabled(
  storage: Pick<Storage, "setItem"> | null | undefined,
  enabled: boolean,
  scopeId?: string,
): void {
  if (!storage) return;
  try {
    storage.setItem(
      scopedStorageKey(WHODUNNIT_ROOM_UPGRADE_STORAGE_KEY, scopeId),
      enabled ? "on" : "off",
    );
  } catch {
    // A blocked storage surface must never interrupt an investigation.
  }
}

export function whodunnitBundledRoomArtPath(
  bundledAssetPath: string | null | undefined,
  style: WhodunnitInvestigationArtStyle,
  mosaicGrid: WhodunnitMosaicGridVisibility = "visible",
): string | null {
  if (!bundledAssetPath) return null;
  if (/-mosaic-reference\.webp(?:\?|$)/iu.test(bundledAssetPath)) {
    return withPixelArtPresentationVersion(bundledAssetPath);
  }
  if (/-mosaic\.webp(?:\?|$)/iu.test(bundledAssetPath)) {
    return withPixelArtPresentationVersion(
      mosaicGrid === "hidden"
        ? bundledAssetPath.replace(/-mosaic\.webp/iu, "-mosaic-reference.webp")
        : bundledAssetPath,
    );
  }
  if (style === "illustrated") return bundledAssetPath;
  const match = bundledAssetPath.match(/^(.*?)(\.(?:png|jpe?g|webp))(\?.*)?$/iu);
  if (!match) return bundledAssetPath;
  const mosaicSuffix = mosaicGrid === "hidden"
    ? "-mosaic-reference.webp"
    : "-mosaic.webp";
  return withPixelArtPresentationVersion(`${match[1]}${mosaicSuffix}${match[3] ?? ""}`);
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
  mosaicGrid: WhodunnitMosaicGridVisibility = "visible",
): string | null {
  const fallbackPath = room.templateId
    ? WHODUNNIT_BUNDLED_ROOM_ART_BY_TEMPLATE[room.templateId] ?? null
    : null;
  return whodunnitBundledRoomArtPath(
    room.bundledAssetPath ?? fallbackPath,
    style,
    mosaicGrid,
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
  mosaicGrid?: WhodunnitMosaicGridVisibility;
}): string {
  const base = `/api/debates/${encodeURIComponent(args.sessionId)}/mystery-assets/room/${encodeURIComponent(args.subjectId)}/file`;
  return args.style === "mosaic"
    ? `${base}?style=${args.mosaicGrid === "hidden" ? "mosaic-reference" : "mosaic"}&pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`
    : base;
}

export function whodunnitSavedRoomArtUrl(
  imageId: string | null | undefined,
  style: WhodunnitInvestigationArtStyle,
  mosaicGrid: WhodunnitMosaicGridVisibility = "visible",
): string | null {
  if (!imageId) return null;
  const base = `/api/images/${encodeURIComponent(imageId)}/file`;
  return style === "mosaic"
    ? `${base}?style=${mosaicGrid === "hidden" ? "mosaic-reference" : "mosaic"}&pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`
    : base;
}

export interface WhodunnitDiscoveredMansionRoomArtV1 {
  style: WhodunnitInvestigationArtStyle;
  url: string;
}

/** Resolve a mansion-board room plate without exposing an undiscovered room.
 * A missing per-room HD derivative falls back through the original Mosaic
 * route instead of leaving a discovered block blank. */
export function whodunnitDiscoveredMansionRoomArtV1(args: {
  discovered: boolean;
  upgradeEnabled: boolean;
  illustratedReady: boolean;
  sealedIllustratedUrl?: string | null;
  sealedMosaicUrl?: string | null;
  imageId?: string | null;
  templateId?: string | null;
  bundledAssetPath?: string | null;
}): WhodunnitDiscoveredMansionRoomArtV1 | null {
  if (!args.discovered) return null;
  const style = whodunnitRoomArtStyleForUpgrade(
    args.upgradeEnabled,
    args.illustratedReady,
  );
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
  mosaicGrid: WhodunnitMosaicGridVisibility = "visible",
): string {
  const base = `/api/debates/mystery-mansions/${encodeURIComponent(mansionId)}/assets/${encodeURIComponent(assetId)}/file`;
  return style === "mosaic"
    ? `${base}?style=${mosaicGrid === "hidden" ? "mosaic-reference" : "mosaic"}&pixelArt=${WHODUNNIT_PIXEL_ART_PRESENTATION_VERSION}`
    : base;
}
