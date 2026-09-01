import type { DebateMysteryHouseStyleV2 } from "./debateMysteryV2.js";
import type {
  MansionAmbienceManifestV1,
  MansionAmbienceRoomProfileV1,
} from "./portableMysteryPackage.js";

export const PRISM_MANSION_ACOUSTIC_LIBRARY_V1 = {
  id: "prism-universal-acoustics",
  version: 1,
} as const;

export const PRISM_MANSION_ACOUSTIC_ASSETS_V1 = {
  indoorRoomTone: {
    id: "prism.shared.fallback.indoor-room-tone.v1",
    sha256: "cfda56a969c188d0185a2e78a5f44c1dd63270c3c3e00e0ba8b2bb67b3fa63c2",
  },
  rainStorm: {
    id: "prism.shared.weather.rain-storm.v1",
    sha256: "da802a87e1d08f6c491efb0d13b5fa248b3f43cd0922595980827bf1df3e5187",
  },
  spacecraftHull: {
    id: "prism.theme.spacecraft.hull-life-support.v1",
    sha256: "d3de0019d5b2b37ea1d5a2a707301b140787c2517c462cdd30ec864759767b9f",
  },
  passengerShip: {
    id: "prism.theme.maritime-passenger.engine-ocean.v1",
    sha256: "36c53887057817c949143466cbe4b340de754442369096438249fdc09e6a5965",
  },
} as const;

export interface MansionAcousticRoomInputV1 {
  id: string;
  name: string;
  floor: number;
}

function acousticVariation(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return ((hash >>> 0) % 1_001) / 1_000;
}

function roomAcousticPreset(
  room: MansionAcousticRoomInputV1,
  houseStyle: DebateMysteryHouseStyleV2,
): { preset: string; material: string; exposure: number; dampening: number; reverb: number; lowPass: number } {
  const name = room.name.toLocaleLowerCase();
  const spacecraft = houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1";
  const passengerShip = houseStyle.acousticThemePaletteId === "maritime-passenger-v1";
  if (passengerShip && /promenade|open deck|gangway/u.test(name)) {
    return { preset: "ocean-deck-v1", material: "steel-deck", exposure: 1, dampening: 0.04, reverb: 0.1, lowPass: 18_000 };
  }
  if (passengerShip && /engine|machinery|laundry|service|galley|stores/u.test(name)) {
    return { preset: "ship-service-v1", material: "steel-grate", exposure: 0.18, dampening: 0.68, reverb: 0.3, lowPass: 5_200 };
  }
  if (passengerShip && /cabin|dayroom|quarters/u.test(name)) {
    return { preset: "passenger-cabin-v1", material: "carpet-over-steel", exposure: 0.44, dampening: 0.7, reverb: 0.16, lowPass: 6_800 };
  }
  if (/rooftop|roof|balcony|terrace/u.test(name)) {
    return { preset: "outdoors-v1", material: spacecraft ? "metal-plate" : "stone", exposure: 1, dampening: 0.02, reverb: 0.08, lowPass: 20_000 };
  }
  if (/arboretum|conservatory|glass|sunroom|observation/u.test(name)) {
    return { preset: "glass-conservatory-v1", material: spacecraft ? "metal-plate" : "tile", exposure: 0.86, dampening: 0.12, reverb: 0.34, lowPass: 17_000 };
  }
  if (/basement|cellar|bunker/u.test(name)) {
    return { preset: spacecraft ? "machinery-bay-v1" : "stone-cellar-v1", material: spacecraft ? "metal-grate" : "stone", exposure: 0.12, dampening: 0.9, reverb: 0.48, lowPass: 3_800 };
  }
  if (/bath|wash|tile/u.test(name)) {
    return { preset: "tiled-bathroom-v1", material: "tile", exposure: 0.32, dampening: 0.42, reverb: 0.62, lowPass: 9_500 };
  }
  if (/foyer|stair|ballroom|hall/u.test(name)) {
    return { preset: spacecraft ? "metal-corridor-v1" : "large-hall-v1", material: spacecraft ? "metal-plate" : "wood", exposure: 0.48, dampening: 0.2, reverb: 0.58, lowPass: 12_500 };
  }
  return spacecraft
    ? { preset: "metal-corridor-v1", material: "metal-plate", exposure: 0.4, dampening: 0.46, reverb: 0.3, lowPass: 8_500 }
    : { preset: "small-furnished-room-v1", material: "wood", exposure: 0.34, dampening: 0.5, reverb: 0.24, lowPass: 7_500 };
}

export function mansionAmbienceRoomProfileV1(
  room: MansionAcousticRoomInputV1,
  houseStyle: DebateMysteryHouseStyleV2,
): MansionAmbienceRoomProfileV1 {
  const profile = roomAcousticPreset(room, houseStyle);
  const identityOffset = houseStyle.bespokeAmbienceRequested
    ? acousticVariation(`${houseStyle.id}:${room.id}`) - 0.5
    : 0;
  return {
    roomId: room.id,
    acousticPresetId: profile.preset,
    exposure: Math.max(0, Math.min(1, profile.exposure + identityOffset * 0.1)),
    dampening: profile.dampening,
    reverbSend: Math.max(0, Math.min(1, profile.reverb + identityOffset * 0.08)),
    lowPassHz: profile.lowPass,
    surfaceMaterialId: profile.material,
    emitters: [],
  };
}

export function mansionAmbienceWorldBedV1(houseStyle: DebateMysteryHouseStyleV2): {
  id: string;
  scope: "shared" | "theme";
  sha256: string;
} {
  if (houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1") {
    return { ...PRISM_MANSION_ACOUSTIC_ASSETS_V1.spacecraftHull, scope: "theme" };
  }
  if (houseStyle.acousticThemePaletteId === "maritime-passenger-v1") {
    return { ...PRISM_MANSION_ACOUSTIC_ASSETS_V1.passengerShip, scope: "theme" };
  }
  if (houseStyle.atmosphere.weather === "storm" || houseStyle.atmosphere.weather === "rain") {
    return { ...PRISM_MANSION_ACOUSTIC_ASSETS_V1.rainStorm, scope: "shared" };
  }
  return { ...PRISM_MANSION_ACOUSTIC_ASSETS_V1.indoorRoomTone, scope: "shared" };
}

export function buildMansionAmbienceManifestV1(args: {
  houseStyle: DebateMysteryHouseStyleV2;
  rooms: readonly MansionAcousticRoomInputV1[];
  promptContractHash: string;
  variationSeed: string;
}): MansionAmbienceManifestV1 {
  const worldBed = mansionAmbienceWorldBedV1(args.houseStyle);
  return {
    version: 1,
    acousticLibrary: { ...PRISM_MANSION_ACOUSTIC_LIBRARY_V1 },
    themePaletteId: args.houseStyle.acousticThemePaletteId,
    bespokeSynthesisRequested: args.houseStyle.bespokeAmbienceRequested,
    promptContractHash: args.promptContractHash,
    atmosphere: { ...args.houseStyle.atmosphere },
    deterministicVariationSeed: args.variationSeed,
    assets: [{
      id: "world-bed",
      semanticRole: "world_bed",
      scope: worldBed.scope,
      sharedAssetId: worldBed.id,
      packageAssetId: null,
      contentSha256: worldBed.sha256,
        fallbackSharedAssetId: args.houseStyle.acousticThemePaletteId === "maritime-passenger-v1"
          ? PRISM_MANSION_ACOUSTIC_ASSETS_V1.passengerShip.id
          : PRISM_MANSION_ACOUSTIC_ASSETS_V1.indoorRoomTone.id,
      generation: { source: "procedural", provider: null, model: null },
    }],
    surfaceMappings: [
      {
        interaction: "footstep",
        materialId: args.houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1" ? "metal-plate"
          : args.houseStyle.acousticThemePaletteId === "maritime-passenger-v1" ? "steel-deck"
            : "wood",
        sharedAssetIds: args.houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1" ||
          args.houseStyle.acousticThemePaletteId === "maritime-passenger-v1"
          ? ["prism.shared.footstep.metal-plate.v1"]
          : ["prism.shared.footstep.wood.v1"],
      },
      {
        interaction: "door",
        materialId: args.houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1" ? "powered-servo"
          : args.houseStyle.acousticThemePaletteId === "maritime-passenger-v1" ? "marine-steel"
            : "heavy-wood",
        sharedAssetIds: args.houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1" ||
          args.houseStyle.acousticThemePaletteId === "maritime-passenger-v1"
          ? ["prism.shared.portal.powered-servo.v1"]
          : ["prism.shared.door.heavy-wood.v1"],
      },
    ],
    roomProfiles: args.rooms.map((room) => mansionAmbienceRoomProfileV1(room, args.houseStyle)),
    crossfade: { curve: "equal_power", roomTransitionMs: 1_200, stopFadeMs: 720 },
    speechDucking: { gain: 0.46, attackMs: 120, releaseMs: 480 },
    stageCueStingerAllowlist: [],
    fallbackSharedAssetIds: [
      args.houseStyle.acousticThemePaletteId === "maritime-passenger-v1"
        ? PRISM_MANSION_ACOUSTIC_ASSETS_V1.passengerShip.id
        : PRISM_MANSION_ACOUSTIC_ASSETS_V1.indoorRoomTone.id,
      "prism.shared.fallback.silence.v1",
    ],
  };
}
