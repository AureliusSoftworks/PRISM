import {
  mansionAmbienceRoomProfileV1,
  type DebateMysteryHouseStyleV2,
  type DebateMysteryRoomV2,
  type MansionAmbienceRoomProfileV1,
  type MansionLayoutBlockV2,
} from "@localai/shared";
import type { RoomAcousticsProfile, RoomAcousticsSend } from "./roomAcoustics.ts";

export type MysteryMansionFoleyMaterialV1 = "wood" | "stone" | "metal";

export interface MysteryMansionRoomAcousticsV1 {
  profile: RoomAcousticsProfile;
  voice: RoomAcousticsSend;
  foley: RoomAcousticsSend;
  surfaceMaterialId: string;
  foleyMaterial: MysteryMansionFoleyMaterialV1;
  outdoors: boolean;
  size: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function finiteDimension(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback;
}

function materialFamily(materialId: string): MysteryMansionFoleyMaterialV1 {
  if (/metal|grate|plate|servo/u.test(materialId)) return "metal";
  if (/stone|tile|marble|concrete/u.test(materialId)) return "stone";
  return "wood";
}

function authoredOrInferredRoomProfile(
  room: Pick<DebateMysteryRoomV2, "id" | "name" | "floor">,
  houseStyle: DebateMysteryHouseStyleV2,
): MansionAmbienceRoomProfileV1 {
  return houseStyle.ambience?.roomProfiles.find((profile) => profile.roomId === room.id) ??
    mansionAmbienceRoomProfileV1(room, houseStyle);
}

function roomAcousticsFromProfile(args: {
  houseStyle: DebateMysteryHouseStyleV2;
  identity: string;
  name: string;
  width: number;
  height: number;
  authored: MansionAmbienceRoomProfileV1;
}): MysteryMansionRoomAcousticsV1 {
  const area = clamp(args.width * args.height, 4, 15);
  const size = (area - 4) / 11;
  const reverbSend = clamp(args.authored.reverbSend, 0, 1);
  const dampening = clamp(args.authored.dampening, 0, 1);
  const outdoors = args.authored.acousticPresetId === "outdoors-v1" ||
    /rooftop|roof|balcony|terrace|outdoor/u.test(args.name.toLocaleLowerCase());
  const durationSeconds = outdoors
    ? 0.18
    : clamp(
      lerp(0.45, 1.45, size) * lerp(0.85, 1.12, reverbSend),
      0.35,
      1.55,
    );
  const preDelaySeconds = outdoors ? 0.002 : lerp(0.01, 0.032, size);
  const profile: RoomAcousticsProfile = {
    id: [
      "whodunnit-room-v1",
      args.houseStyle.id,
      args.identity,
      args.authored.acousticPresetId,
      `${args.width}x${args.height}`,
      reverbSend.toFixed(3),
      dampening.toFixed(3),
    ].join(":"),
    durationSeconds,
    preDelaySeconds,
    lowCutHz: 130,
    highCutHz: outdoors ? 16_000 : clamp(args.authored.lowPassHz, 3_500, 14_000),
    decayExponent: outdoors ? 3.7 : clamp(3.3 - 0.9 * size + 0.45 * dampening, 2.4, 3.6),
    diffusionGain: outdoors ? 0.012 : lerp(0.028, 0.042, reverbSend),
    earlyReflections: outdoors
      ? [
        { delaySeconds: 0.009, gain: 0.18, stereoOffsetSeconds: 0.0008 },
        { delaySeconds: 0.018, gain: 0.09, stereoOffsetSeconds: -0.0007 },
      ]
      : [
        { delaySeconds: lerp(0.012, 0.025, size), gain: lerp(0.62, 0.76, 1 - dampening), stereoOffsetSeconds: 0.001 },
        { delaySeconds: lerp(0.022, 0.044, size), gain: lerp(0.4, 0.54, 1 - dampening), stereoOffsetSeconds: -0.0009 },
        { delaySeconds: lerp(0.038, 0.071, size), gain: lerp(0.25, 0.36, 1 - dampening), stereoOffsetSeconds: 0.0013 },
        { delaySeconds: lerp(0.061, 0.112, size), gain: lerp(0.13, 0.23, 1 - dampening), stereoOffsetSeconds: -0.0011 },
      ],
  };
  const voiceWet = outdoors
    ? 0.008
    : clamp(0.02 + 0.075 * size + 0.06 * reverbSend, 0.025, 0.135);
  const foleyWet = outdoors ? 0.02 : clamp(voiceWet * 1.5, 0.05, 0.2);
  return {
    profile,
    voice: { profile, wet: voiceWet },
    foley: { profile, wet: foleyWet },
    surfaceMaterialId: args.authored.surfaceMaterialId,
    foleyMaterial: materialFamily(args.authored.surfaceMaterialId),
    outdoors,
    size,
  };
}

export function mysteryMansionRoomAcousticsV1(args: {
  room: DebateMysteryRoomV2;
  houseStyle: DebateMysteryHouseStyleV2;
}): MysteryMansionRoomAcousticsV1 {
  const width = finiteDimension(args.room.width, 3);
  const height = finiteDimension(args.room.height, 2);
  return roomAcousticsFromProfile({
    houseStyle: args.houseStyle,
    identity: args.room.id,
    name: args.room.name,
    width,
    height,
    authored: authoredOrInferredRoomProfile(args.room, args.houseStyle),
  });
}

export function mysteryMansionCorridorAcousticsV1(args: {
  corridor: MansionLayoutBlockV2;
  houseStyle: DebateMysteryHouseStyleV2;
}): MysteryMansionRoomAcousticsV1 {
  const spacecraft = args.houseStyle.acousticThemePaletteId === "spacecraft-industrial-v1";
  const authored = mansionAmbienceRoomProfileV1({
    id: args.corridor.id,
    name: spacecraft ? "Metal corridor" : "Hall corridor",
    floor: args.corridor.floor,
  }, args.houseStyle);
  return roomAcousticsFromProfile({
    houseStyle: args.houseStyle,
    identity: args.corridor.id,
    name: spacecraft ? "Metal corridor" : "Hall corridor",
    width: args.corridor.width,
    height: args.corridor.height,
    authored,
  });
}
