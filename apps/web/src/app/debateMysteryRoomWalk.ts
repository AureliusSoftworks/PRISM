import {
  resolveZenLiveAvatarFacingForTravel,
  type ZenLiveAvatarFacing,
} from "./zenLiveAvatarDepth.ts";

export interface MysteryRoomSuspectWalkProfile {
  startPct: number;
  waypointPct: number;
  endPct: number;
  durationMs: number;
  delayMs: number;
}

/**
 * Shares Zen's travel-facing contract with the room walker. Each completed
 * alternate animation iteration reverses the visible direction while keeping
 * the authored face and Ink together on the shared avatar screen plane.
 */
export function mysteryRoomSuspectFacing(
  profile: Pick<MysteryRoomSuspectWalkProfile, "startPct" | "endPct">,
  iteration: number,
): ZenLiveAvatarFacing {
  const initialDelta = profile.endPct - profile.startPct;
  const normalizedIteration = Number.isFinite(iteration)
    ? Math.max(0, Math.trunc(iteration))
    : 0;
  const horizontalDelta =
    normalizedIteration % 2 === 0 ? initialDelta : -initialDelta;
  return resolveZenLiveAvatarFacingForTravel("right", horizontalDelta);
}

export interface MysteryMapOccupantPosition {
  xPct: number;
  yPct: number;
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Gives each room suspect a varied but render-stable walk. Case logic remains
 * deterministic while the presentation avoids every bot pacing in lockstep.
 */
export function mysteryRoomSuspectWalkProfile(
  sessionId: string,
  roomId: string,
  suspectSeatId: string,
): MysteryRoomSuspectWalkProfile {
  const seed = `${sessionId}:${roomId}:${suspectSeatId}`;
  const leftPct = 24 + (stableHash(`${seed}:left`) % 7);
  const rightPct = 64 + (stableHash(`${seed}:right`) % 9);
  const reverse = stableHash(`${seed}:direction`) % 2 === 1;

  return {
    startPct: reverse ? rightPct : leftPct,
    waypointPct: 42 + (stableHash(`${seed}:waypoint`) % 15),
    endPct: reverse ? leftPct : rightPct,
    durationMs: 16_000 + (stableHash(`${seed}:duration`) % 6_001),
    delayMs: -(stableHash(`${seed}:delay`) % 8_001),
  };
}

/** Places a discovered suspect within their map room without jumping between
 * renders. The lower interior band keeps the glyph clear of the room label. */
export function mysteryMapOccupantPosition(
  sessionId: string,
  roomId: string,
  suspectSeatId: string,
): MysteryMapOccupantPosition {
  const seed = `${sessionId}:${roomId}:${suspectSeatId}:map-occupant`;
  return {
    xPct: 18 + (stableHash(`${seed}:x`) % 65),
    yPct: 62 + (stableHash(`${seed}:y`) % 19),
  };
}
