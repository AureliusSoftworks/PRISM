import {
  PRISM_MANSION_ACOUSTIC_ASSETS_V1,
  type DebateMysteryHouseStyleV2,
  type DebateMysteryRoomV2,
} from "@localai/shared";
import type { SessionAtmosphereMix } from "./session-atmosphere-audio.ts";

export const WHODUNNIT_MANSION_AMBIENCE_TRANSITION_MS = 1_200;
export const WHODUNNIT_MANSION_AMBIENCE_FADE_MS = 720;

export interface WhodunnitAcousticAssetV1 {
  id: string;
  scope: "shared" | "theme";
  semanticRole: "world_bed";
  url: string;
  sha256: string;
}

/** Compact fixture registry. The larger universal core remains content-addressed
 * and versioned independently from any one mansion package. */
export const WHODUNNIT_ACOUSTIC_ASSETS_V1: readonly WhodunnitAcousticAssetV1[] = [
  {
    id: PRISM_MANSION_ACOUSTIC_ASSETS_V1.indoorRoomTone.id,
    scope: "shared",
    semanticRole: "world_bed",
    url: "/audio/debate/whodunnit/shared/indoor-room-tone-v1.ogg",
    sha256: PRISM_MANSION_ACOUSTIC_ASSETS_V1.indoorRoomTone.sha256,
  },
  {
    id: PRISM_MANSION_ACOUSTIC_ASSETS_V1.rainStorm.id,
    scope: "shared",
    semanticRole: "world_bed",
    url: "/audio/debate/whodunnit/shared/rain-storm-v1.ogg",
    sha256: PRISM_MANSION_ACOUSTIC_ASSETS_V1.rainStorm.sha256,
  },
  {
    id: PRISM_MANSION_ACOUSTIC_ASSETS_V1.spacecraftHull.id,
    scope: "theme",
    semanticRole: "world_bed",
    url: "/audio/debate/whodunnit/shared/spacecraft-hull-v1.ogg",
    sha256: PRISM_MANSION_ACOUSTIC_ASSETS_V1.spacecraftHull.sha256,
  },
  {
    id: PRISM_MANSION_ACOUSTIC_ASSETS_V1.passengerShip.id,
    scope: "theme",
    semanticRole: "world_bed",
    url: "/audio/debate/whodunnit/shared/maritime-passenger-world-bed-v1.ogg",
    sha256: PRISM_MANSION_ACOUSTIC_ASSETS_V1.passengerShip.sha256,
  },
] as const;

function acousticAssetById(id: string | null | undefined): WhodunnitAcousticAssetV1 | null {
  return WHODUNNIT_ACOUSTIC_ASSETS_V1.find((asset) => asset.id === id) ?? null;
}

export function mysteryMansionAmbienceAssetV1(
  houseStyle: DebateMysteryHouseStyleV2,
  mansionBundleId: string | null,
): WhodunnitAcousticAssetV1 | null {
  const worldBed = houseStyle.ambience?.assets.find(
    (asset) => asset.semanticRole === "world_bed",
  );
  if (worldBed?.scope === "mansion" && worldBed.packageAssetId && mansionBundleId) {
    return {
      id: worldBed.id,
      scope: "theme",
      semanticRole: "world_bed",
      url: `/api/debates/mystery-mansions/${encodeURIComponent(mansionBundleId)}/assets/${encodeURIComponent(worldBed.packageAssetId)}/file`,
      sha256: worldBed.contentSha256,
    };
  }
  const packagedShared = acousticAssetById(worldBed?.sharedAssetId);
  if (packagedShared) return packagedShared;
  const packagedFallback = acousticAssetById(worldBed?.fallbackSharedAssetId);
  if (packagedFallback) return packagedFallback;
  if (houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1") {
    return acousticAssetById(PRISM_MANSION_ACOUSTIC_ASSETS_V1.spacecraftHull.id);
  }
  if (houseStyle.acousticThemePaletteId === "maritime-passenger-v1") {
    return acousticAssetById(PRISM_MANSION_ACOUSTIC_ASSETS_V1.passengerShip.id);
  }
  if (houseStyle.atmosphere.weather === "storm" || houseStyle.atmosphere.weather === "rain") {
    return acousticAssetById(PRISM_MANSION_ACOUSTIC_ASSETS_V1.rainStorm.id);
  }
  return acousticAssetById(PRISM_MANSION_ACOUSTIC_ASSETS_V1.indoorRoomTone.id);
}

function inferredRoomProfile(room: DebateMysteryRoomV2 | null, maxFloor: number): {
  exposure: number;
  dampening: number;
} {
  if (!room) return { exposure: 0.46, dampening: 0.38 };
  const name = room.name.toLocaleLowerCase();
  if (/rooftop|roof|balcony|terrace/u.test(name)) return { exposure: 1, dampening: 0.02 };
  if (/arboretum|conservatory|glass|sunroom/u.test(name)) return { exposure: 0.86, dampening: 0.12 };
  if (/basement|cellar|bunker/u.test(name)) return { exposure: 0.12, dampening: 0.9 };
  if (/foyer|stair|ballroom|hall/u.test(name)) return { exposure: 0.48, dampening: 0.2 };
  if (room.floor >= maxFloor) return { exposure: 0.64, dampening: 0.28 };
  return { exposure: 0.34, dampening: 0.5 };
}

export function mysteryMansionAmbienceMixV1(args: {
  houseStyle: DebateMysteryHouseStyleV2;
  room: DebateMysteryRoomV2 | null;
  maxFloor: number;
  roomView: "mansion" | "room";
  speechActive: boolean;
  theoryBoardOpen: boolean;
}): SessionAtmosphereMix {
  const authored = args.room
    ? args.houseStyle.ambience?.roomProfiles.find((profile) => profile.roomId === args.room!.id)
    : null;
  const profile = authored ?? inferredRoomProfile(args.room, args.maxFloor);
  const viewGain = args.roomView === "mansion" ? 0.82 : 1;
  const theoryGain = args.theoryBoardOpen ? 0.3 : 1;
  const duckGain = args.speechActive
    ? args.houseStyle.ambience?.speechDucking.gain ?? 0.46
    : 1;
  const identityGain = args.houseStyle.bespokeAmbienceRequested
    ? 0.94 + (acousticHash(args.houseStyle.id) % 13) / 100
    : 1;
  const background = Math.max(0, Math.min(
    0.18,
    0.1 * (0.58 + profile.exposure * 0.62) * (1 - profile.dampening * 0.34) *
      viewGain * theoryGain * duckGain * identityGain,
  ));
  return { background, grain: 0, foley: 0 };
}

function acousticHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** Stable selection prevents room reloads from reshuffling neutral one-shots. */
export function mysteryAcousticDeterministicVariantV1(
  seed: string,
  eventId: string,
  variationCount: number,
): number {
  if (!Number.isSafeInteger(variationCount) || variationCount < 1) return 0;
  return acousticHash(`${seed}:${eventId}`) % variationCount;
}

export function mysteryAcousticPositionalGainV1(distance: number, radius: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(radius) || radius <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - Math.max(0, distance) / radius));
}
