export interface MysteryRoomSuspectWalkProfile {
  startPct: number;
  waypointPct: number;
  endPct: number;
  durationMs: number;
  delayMs: number;
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
