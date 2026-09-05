import type {
  MansionTraversalRouteV1,
  MansionTraversalWaypointV1,
} from "@localai/shared";
import { mysteryAcousticDeterministicVariantV1 } from "./debateMysteryMansionAmbience.ts";
import type {
  MysteryMansionFoleyMaterialV1,
  MysteryMansionRoomAcousticsV1,
} from "./debateMysteryRoomAcoustics.ts";
import {
  routeAudioElementToPrismOutput,
  type PrismAudioElementRouteCleanup,
} from "./replayAudioMasterCapture.ts";

export type MysteryMansionTravelAcousticRoleV1 = "outgoing" | "corridor" | "destination";
export type MysteryMansionTravelFoleyKindV1 = "door_open" | "footstep" | "door_close";
export type MysteryMansionTravelCueKindV1 =
  | "movement"
  | "door"
  | "step"
  | "floor_change"
  | "arrival";

/** Presentation timeline kept separate from playback so authored one-shot
 * events can be inserted later without changing route resolution. */
export interface MysteryMansionTravelCueV1 {
  id: string;
  kind: MysteryMansionTravelCueKindV1;
  atMs: number;
  durationMs: number;
  waypointIndex: number;
  entityId: string;
  edgeId: string | null;
  connectorKind: MansionTraversalWaypointV1["connectorKind"];
  acousticRole: MysteryMansionTravelAcousticRoleV1;
}

export interface MysteryMansionTravelFoleyCueV1 {
  id: string;
  kind: MysteryMansionTravelFoleyKindV1;
  atMs: number;
  acousticRole: MysteryMansionTravelAcousticRoleV1;
  url: string;
  gain: number;
}

export interface MysteryMansionTravelPointV1 {
  floor: number;
  x: number;
  y: number;
  waypointIndex: number;
}

export const MYSTERY_MANSION_TRAVEL_AUDIO = {
  footsteps: {
    wood: [
      "/audio/debate/whodunnit/travel/footstep-wood-01.mp3",
      "/audio/debate/whodunnit/travel/footstep-wood-02.mp3",
    ],
    stone: [
      "/audio/debate/whodunnit/travel/footstep-stone-01.mp3",
      "/audio/debate/whodunnit/travel/footstep-stone-02.mp3",
    ],
    metal: [
      "/audio/debate/whodunnit/travel/footstep-metal-01.mp3",
      "/audio/debate/whodunnit/travel/footstep-metal-02.mp3",
    ],
  },
  doors: {
    wood: {
      open: [
        "/audio/debate/whodunnit/travel/door-wood-open-01.mp3",
        "/audio/debate/whodunnit/travel/door-wood-open-02.mp3",
      ],
      close: [
        "/audio/debate/whodunnit/travel/door-wood-close-01.mp3",
        "/audio/debate/whodunnit/travel/door-wood-close-02.mp3",
      ],
    },
    mechanical: {
      open: ["/audio/debate/whodunnit/travel/door-mechanical-open-01.mp3"],
      close: ["/audio/debate/whodunnit/travel/door-mechanical-close-01.mp3"],
    },
  },
} as const;

export interface MysteryMansionTravelAssetLevelV1 {
  integratedLufs: number;
  truePeakDbfs: number;
}

/**
 * Offline EBU R128 measurements for the bundled travel set. Keeping the
 * calibration beside the asset registry makes playback deterministic and
 * prevents a hot replacement clip from inheriting the same gain as a quiet
 * one. Every registered travel asset is required to have an entry below.
 */
export const MYSTERY_MANSION_TRAVEL_ASSET_LEVELS = {
  "/audio/debate/whodunnit/travel/door-mechanical-close-01.mp3": { integratedLufs: -14.8, truePeakDbfs: -2.8 },
  "/audio/debate/whodunnit/travel/door-mechanical-open-01.mp3": { integratedLufs: -8.4, truePeakDbfs: -0.7 },
  "/audio/debate/whodunnit/travel/door-wood-close-01.mp3": { integratedLufs: -25.6, truePeakDbfs: -6 },
  "/audio/debate/whodunnit/travel/door-wood-close-02.mp3": { integratedLufs: -23.6, truePeakDbfs: -6.9 },
  "/audio/debate/whodunnit/travel/door-wood-open-01.mp3": { integratedLufs: -19.3, truePeakDbfs: -0.4 },
  "/audio/debate/whodunnit/travel/door-wood-open-02.mp3": { integratedLufs: -24.3, truePeakDbfs: -8 },
  "/audio/debate/whodunnit/travel/footstep-metal-01.mp3": { integratedLufs: -26, truePeakDbfs: -6.8 },
  "/audio/debate/whodunnit/travel/footstep-metal-02.mp3": { integratedLufs: -27, truePeakDbfs: -8 },
  "/audio/debate/whodunnit/travel/footstep-stone-01.mp3": { integratedLufs: -28.1, truePeakDbfs: -6.2 },
  "/audio/debate/whodunnit/travel/footstep-stone-02.mp3": { integratedLufs: -28.7, truePeakDbfs: -4.1 },
  "/audio/debate/whodunnit/travel/footstep-wood-01.mp3": { integratedLufs: -25.4, truePeakDbfs: -8.2 },
  "/audio/debate/whodunnit/travel/footstep-wood-02.mp3": { integratedLufs: -25.2, truePeakDbfs: -8 },
} as const satisfies Record<string, MysteryMansionTravelAssetLevelV1>;

export const MYSTERY_MANSION_TRAVEL_TRUE_PEAK_CEILING_DBFS = -9;
export const MYSTERY_MANSION_TRAVEL_MAX_MEDIA_VOLUME = 0.9;
export const MYSTERY_MANSION_TRAVEL_DOOR_TARGET_LUFS = -25;
export const MYSTERY_MANSION_TRAVEL_FOOTSTEP_TARGET_LUFS = -31;
const MYSTERY_MANSION_TRAVEL_UNCALIBRATED_GAIN = 0.18;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function amplitudeForDb(deltaDb: number): number {
  return 10 ** (deltaDb / 20);
}

export function mysteryMansionTravelNormalizedGainV1(args: {
  kind: MysteryMansionTravelFoleyKindV1;
  url: string;
}): number {
  const level = MYSTERY_MANSION_TRAVEL_ASSET_LEVELS[
    args.url as keyof typeof MYSTERY_MANSION_TRAVEL_ASSET_LEVELS
  ];
  if (!level) return MYSTERY_MANSION_TRAVEL_UNCALIBRATED_GAIN;
  const targetLufs = args.kind === "footstep"
    ? MYSTERY_MANSION_TRAVEL_FOOTSTEP_TARGET_LUFS
    : MYSTERY_MANSION_TRAVEL_DOOR_TARGET_LUFS;
  const loudnessGain = amplitudeForDb(targetLufs - level.integratedLufs);
  const peakSafeGain = amplitudeForDb(
    MYSTERY_MANSION_TRAVEL_TRUE_PEAK_CEILING_DBFS - level.truePeakDbfs,
  );
  return clamp(
    Math.min(loudnessGain, peakSafeGain),
    0,
    MYSTERY_MANSION_TRAVEL_MAX_MEDIA_VOLUME,
  );
}

export function mysteryMansionTravelPlaybackVolumeV1(
  masterVolume: number,
  cueGain: number,
): number {
  return (
    clamp(masterVolume, 0, 1) *
    clamp(cueGain, 0, MYSTERY_MANSION_TRAVEL_MAX_MEDIA_VOLUME)
  );
}

function travelFoleyCueV1(
  cue: Omit<MysteryMansionTravelFoleyCueV1, "gain">,
): MysteryMansionTravelFoleyCueV1 {
  return {
    ...cue,
    gain: mysteryMansionTravelNormalizedGainV1(cue),
  };
}

function segmentDistance(
  left: MansionTraversalWaypointV1,
  right: MansionTraversalWaypointV1,
): number {
  return left.floor === right.floor
    ? Math.max(0.12, Math.hypot(right.x - left.x, right.y - left.y))
    : 6 + Math.abs(right.floor - left.floor) * 2;
}

function routeSegmentWeights(route: MansionTraversalRouteV1): number[] {
  return route.waypoints.slice(1).map((point, index) =>
    segmentDistance(route.waypoints[index]!, point));
}

function routeEntityAcousticRole(
  route: MansionTraversalRouteV1,
  entityId: string,
): MysteryMansionTravelAcousticRoleV1 {
  if (entityId === route.fromRoomId) return "outgoing";
  if (entityId === route.toRoomId) return "destination";
  return "corridor";
}

function routeSegmentEntityId(
  left: MansionTraversalWaypointV1,
  right: MansionTraversalWaypointV1,
): string {
  if (right.kind === "entity_center") return right.entityId;
  return left.entityId;
}

export function mysteryMansionTravelDurationMs(route: MansionTraversalRouteV1): number {
  return Math.round(clamp(1_050 + route.distanceUnits * 145, 1_200, 3_000));
}

export function mysteryMansionTravelCuePlanV1(args: {
  route: MansionTraversalRouteV1;
  durationMs?: number;
  compact?: boolean;
}): MysteryMansionTravelCueV1[] {
  const durationMs = args.compact
    ? 520
    : args.durationMs ?? mysteryMansionTravelDurationMs(args.route);
  if (args.compact) {
    return [
      { id: "compact-door-open", kind: "door", atMs: 0, durationMs: 95, waypointIndex: 0, entityId: args.route.fromRoomId, edgeId: null, connectorKind: null, acousticRole: "outgoing" },
      { id: "compact-step", kind: "step", atMs: 125, durationMs: 160, waypointIndex: 0, entityId: args.route.entityIds[1] ?? args.route.toRoomId, edgeId: null, connectorKind: null, acousticRole: "corridor" },
      { id: "compact-door-close", kind: "door", atMs: 285, durationMs: 205, waypointIndex: Math.max(0, args.route.waypoints.length - 1), entityId: args.route.toRoomId, edgeId: null, connectorKind: null, acousticRole: "destination" },
      { id: "compact-arrival", kind: "arrival", atMs: durationMs, durationMs: 0, waypointIndex: Math.max(0, args.route.waypoints.length - 1), entityId: args.route.toRoomId, edgeId: null, connectorKind: null, acousticRole: "destination" },
    ];
  }

  const weights = routeSegmentWeights(args.route);
  const totalWeight = Math.max(0.001, weights.reduce((sum, weight) => sum + weight, 0));
  const cues: MysteryMansionTravelCueV1[] = [];
  let elapsedWeight = 0;
  for (let index = 0; index < weights.length; index += 1) {
    const left = args.route.waypoints[index]!;
    const right = args.route.waypoints[index + 1]!;
    const segmentDurationMs = (weights[index]! / totalWeight) * durationMs;
    const atMs = (elapsedWeight / totalWeight) * durationMs;
    const entityId = routeSegmentEntityId(left, right);
    cues.push({
      id: `movement-${index}`,
      kind: "movement",
      atMs: Math.round(atMs),
      durationMs: Math.round(segmentDurationMs),
      waypointIndex: index,
      entityId,
      edgeId: right.edgeId,
      connectorKind: right.connectorKind,
      acousticRole: routeEntityAcousticRole(args.route, entityId),
    });
    if (right.kind === "door") {
      cues.push({
        id: `door-${index}`,
        kind: "door",
        atMs: Math.round(atMs + segmentDurationMs),
        durationMs: 240,
        waypointIndex: index + 1,
        entityId: right.entityId,
        edgeId: right.edgeId,
        connectorKind: null,
        acousticRole: routeEntityAcousticRole(args.route, right.entityId),
      });
    }
    if (left.floor !== right.floor) {
      cues.push({
        id: `floor-${index}`,
        kind: "floor_change",
        atMs: Math.round(atMs + segmentDurationMs / 2),
        durationMs: Math.round(segmentDurationMs / 2),
        waypointIndex: index + 1,
        entityId: right.entityId,
        edgeId: right.edgeId,
        connectorKind: left.connectorKind ?? right.connectorKind,
        acousticRole: routeEntityAcousticRole(args.route, right.entityId),
      });
    }
    elapsedWeight += weights[index]!;
  }
  const stepCount = Math.round(clamp(args.route.distanceUnits / 1.5, 2, 7));
  for (let index = 0; index < stepCount; index += 1) {
    const atMs = Math.round(durationMs * (0.2 + (index / Math.max(1, stepCount - 1)) * 0.62));
    const progress = atMs / durationMs;
    const point = mysteryMansionTravelPointAtProgress(args.route, progress);
    const movement = [...cues]
      .filter((cue) => cue.kind === "movement" && cue.atMs <= atMs)
      .at(-1);
    const entityId = movement?.entityId ?? (
      point.floor === args.route.waypoints.at(-1)?.floor
        ? args.route.toRoomId
        : args.route.fromRoomId
    );
    cues.push({
      id: `step-${index}`,
      kind: "step",
      atMs,
      durationMs: 160,
      waypointIndex: point.waypointIndex,
      entityId,
      edgeId: movement?.edgeId ?? null,
      connectorKind: movement?.connectorKind ?? null,
      acousticRole: routeEntityAcousticRole(args.route, entityId),
    });
  }
  cues.push({
    id: "arrival",
    kind: "arrival",
    atMs: durationMs,
    durationMs: 0,
    waypointIndex: Math.max(0, args.route.waypoints.length - 1),
    entityId: args.route.toRoomId,
    edgeId: null,
    connectorKind: null,
    acousticRole: "destination",
  });
  return cues.sort((left, right) => left.atMs - right.atMs || left.id.localeCompare(right.id));
}

export function mysteryMansionTravelPointAtProgress(
  route: MansionTraversalRouteV1,
  progress: number,
): MysteryMansionTravelPointV1 {
  const first = route.waypoints[0];
  if (!first) return { floor: 1, x: 0, y: 0, waypointIndex: 0 };
  if (route.waypoints.length === 1) {
    return { floor: first.floor, x: first.x, y: first.y, waypointIndex: 0 };
  }
  const weights = routeSegmentWeights(route);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let remaining = clamp(progress, 0, 1) * total;
  for (let index = 0; index < weights.length; index += 1) {
    const weight = weights[index]!;
    const left = route.waypoints[index]!;
    const right = route.waypoints[index + 1]!;
    if (remaining > weight && index < weights.length - 1) {
      remaining -= weight;
      continue;
    }
    const amount = clamp(remaining / Math.max(0.001, weight), 0, 1);
    if (left.floor !== right.floor) {
      const point = amount < 0.5 ? left : right;
      return { floor: point.floor, x: point.x, y: point.y, waypointIndex: amount < 0.5 ? index : index + 1 };
    }
    return {
      floor: left.floor,
      x: left.x + (right.x - left.x) * amount,
      y: left.y + (right.y - left.y) * amount,
      waypointIndex: amount < 0.5 ? index : index + 1,
    };
  }
  const last = route.waypoints.at(-1)!;
  return { floor: last.floor, x: last.x, y: last.y, waypointIndex: route.waypoints.length - 1 };
}

function variant(seed: string, cueId: string, urls: readonly string[]): string {
  return urls[mysteryAcousticDeterministicVariantV1(seed, cueId, urls.length)]!;
}

function doorFamily(mechanical: boolean): "wood" | "mechanical" {
  return mechanical ? "mechanical" : "wood";
}

export function mysteryMansionTravelFoleyPlanV1(args: {
  route: MansionTraversalRouteV1;
  seed: string;
  durationMs?: number;
  footstepMaterial: MysteryMansionFoleyMaterialV1;
  mechanicalDoors?: boolean;
  compact?: boolean;
  includeFootsteps?: boolean;
}): MysteryMansionTravelFoleyCueV1[] {
  const durationMs = args.compact
    ? 520
    : args.durationMs ?? mysteryMansionTravelDurationMs(args.route);
  const door = MYSTERY_MANSION_TRAVEL_AUDIO.doors[doorFamily(args.mechanicalDoors === true)];
  const footsteps = MYSTERY_MANSION_TRAVEL_AUDIO.footsteps[args.footstepMaterial];
  if (args.compact) {
    const compactCues: MysteryMansionTravelFoleyCueV1[] = [
      travelFoleyCueV1({ id: "compact-open", kind: "door_open", atMs: 0, acousticRole: "outgoing", url: variant(args.seed, "compact-open", door.open) }),
      travelFoleyCueV1({ id: "compact-close", kind: "door_close", atMs: 285, acousticRole: "destination", url: variant(args.seed, "compact-close", door.close) }),
    ];
    if (args.includeFootsteps !== false) {
      compactCues.splice(1, 0, travelFoleyCueV1({
        id: "compact-step",
        kind: "footstep",
        atMs: 125,
        acousticRole: "corridor",
        url: variant(args.seed, "compact-step", footsteps),
      }));
    }
    return compactCues;
  }

  const cues: MysteryMansionTravelFoleyCueV1[] = [];
  const travelCues = mysteryMansionTravelCuePlanV1({
    route: args.route,
    durationMs,
  });
  const weights = routeSegmentWeights(args.route);
  const totalWeight = Math.max(0.001, weights.reduce((sum, weight) => sum + weight, 0));
  let elapsedWeight = 0;
  let doorOrdinal = 0;
  for (let index = 1; index < args.route.waypoints.length; index += 1) {
    elapsedWeight += weights[index - 1] ?? 0;
    const waypoint = args.route.waypoints[index]!;
    if (waypoint.kind !== "door") continue;
    const atMs = clamp((elapsedWeight / totalWeight) * durationMs, 80, durationMs - 220);
    const role = routeEntityAcousticRole(args.route, waypoint.entityId);
    const enteredEntityId = args.route.waypoints[index + 1]?.entityId ?? args.route.toRoomId;
    cues.push(travelFoleyCueV1({
      id: `door-open-${doorOrdinal}`,
      kind: "door_open",
      atMs: Math.round(Math.max(0, atMs - 95)),
      acousticRole: role,
      url: variant(args.seed, `door-open-${doorOrdinal}`, door.open),
    }));
    cues.push(travelFoleyCueV1({
      id: `door-close-${doorOrdinal}`,
      kind: "door_close",
      atMs: Math.round(Math.min(durationMs - 30, atMs + 145)),
      acousticRole: routeEntityAcousticRole(args.route, enteredEntityId),
      url: variant(args.seed, `door-close-${doorOrdinal}`, door.close),
    }));
    doorOrdinal += 1;
  }
  if (doorOrdinal === 0) {
    cues.push(travelFoleyCueV1({ id: "threshold-open", kind: "door_open", atMs: 0, acousticRole: "outgoing", url: variant(args.seed, "threshold-open", door.open) }));
    cues.push(travelFoleyCueV1({ id: "threshold-close", kind: "door_close", atMs: durationMs - 180, acousticRole: "destination", url: variant(args.seed, "threshold-close", door.close) }));
  }
  const stepCues = args.includeFootsteps === false
    ? []
    : travelCues.filter((cue) => cue.kind === "step");
  for (let index = 0; index < stepCues.length; index += 1) {
    const step = stepCues[index]!;
    cues.push(travelFoleyCueV1({
      id: `step-${index}`,
      kind: "footstep",
      atMs: step.atMs,
      acousticRole: step.acousticRole,
      url: variant(args.seed, `step-${index}`, footsteps),
    }));
  }
  return cues.sort((left, right) => left.atMs - right.atMs || left.id.localeCompare(right.id));
}

export interface MysteryMansionTravelFoleyHandleV1 {
  cancel(): void;
  durationMs: number;
}

export function playMysteryMansionTravelFoleyV1(args: {
  route: MansionTraversalRouteV1;
  seed: string;
  volume: number;
  enabled: boolean;
  outgoing: MysteryMansionRoomAcousticsV1;
  corridor: MysteryMansionRoomAcousticsV1;
  destination: MysteryMansionRoomAcousticsV1;
  mechanicalDoors?: boolean;
  compact?: boolean;
  includeFootsteps?: boolean;
  durationMs?: number;
}): MysteryMansionTravelFoleyHandleV1 {
  const durationMs = args.compact
    ? 520
    : args.durationMs ?? mysteryMansionTravelDurationMs(args.route);
  if (!args.enabled || args.volume <= 0 || typeof Audio !== "function") {
    return { cancel: () => undefined, durationMs };
  }
  const plan = mysteryMansionTravelFoleyPlanV1({
    route: args.route,
    seed: args.seed,
    durationMs,
    footstepMaterial: args.corridor.foleyMaterial,
    mechanicalDoors: args.mechanicalDoors,
    compact: args.compact,
    includeFootsteps: args.includeFootsteps,
  });
  const timers = new Set<number>();
  const active = new Set<{
    audio: HTMLAudioElement;
    cleanup: PrismAudioElementRouteCleanup | null;
  }>();
  let cancelled = false;
  const acoustics = {
    outgoing: args.outgoing,
    corridor: args.corridor,
    destination: args.destination,
  } as const;
  const playCue = (cue: MysteryMansionTravelFoleyCueV1): void => {
    if (cancelled) return;
    const audio = new Audio(cue.url);
    audio.preload = "auto";
    audio.volume = mysteryMansionTravelPlaybackVolumeV1(args.volume, cue.gain);
    const cleanup = routeAudioElementToPrismOutput(audio, {
      roomAcoustics: acoustics[cue.acousticRole].foley,
    });
    const entry = { audio, cleanup };
    active.add(entry);
    const finish = (): void => {
      cleanup?.release();
      active.delete(entry);
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", fail);
    };
    const fail = (): void => {
      cleanup?.();
      active.delete(entry);
      audio.removeEventListener("ended", finish);
      audio.removeEventListener("error", fail);
    };
    audio.addEventListener("ended", finish, { once: true });
    audio.addEventListener("error", fail, { once: true });
    void audio.play().catch(fail);
  };
  for (const cue of plan) {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      playCue(cue);
    }, cue.atMs);
    timers.add(timer);
  }
  return {
    durationMs,
    cancel: (): void => {
      if (cancelled) return;
      cancelled = true;
      for (const timer of timers) window.clearTimeout(timer);
      timers.clear();
      for (const entry of active) {
        entry.audio.pause();
        entry.cleanup?.();
      }
      active.clear();
    },
  };
}
