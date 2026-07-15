export const BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MIN_MS = 24_000;
export const BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MAX_MS = 54_000;
export const BOT_GROUP_WAITING_ROOM_AMBIENT_GLANCE_MS = 1_200;
export const BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MIN_MS = 2_600;
export const BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MAX_MS = 4_800;
export const BOT_GROUP_WAITING_ROOM_AMBIENT_SETTLE_MS = 1_200;

export type BotGroupWaitingRoomAmbientPhase =
  | "idle"
  | "glance"
  | "speaking"
  | "settle";

export interface BotGroupWaitingRoomAmbientCue {
  id: string;
  visualCue: string;
  microBark: string;
  canonical: false;
}

export const BOT_GROUP_WAITING_ROOM_AMBIENT_CUES = [
  {
    id: "small-nod",
    visualCue: "offers a small nod",
    microBark: "Mm.",
    canonical: false,
  },
  {
    id: "leans-in",
    visualCue: "leans in a little",
    microBark: "Oh?",
    canonical: false,
  },
  {
    id: "thoughtful-tilt",
    visualCue: "tilts their head",
    microBark: "Maybe.",
    canonical: false,
  },
  {
    id: "quiet-agreement",
    visualCue: "glances over in agreement",
    microBark: "Fair.",
    canonical: false,
  },
  {
    id: "soft-realization",
    visualCue: "brightens for a moment",
    microBark: "Right.",
    canonical: false,
  },
] as const satisfies readonly BotGroupWaitingRoomAmbientCue[];

export interface BotGroupWaitingRoomAmbientPair {
  speakerBotId: string;
  listenerBotId: string;
  cue: BotGroupWaitingRoomAmbientCue;
}

export interface BotGroupWaitingRoomAmbientState {
  visitSeed: string;
  cycle: number;
  phase: BotGroupWaitingRoomAmbientPhase;
  phaseDurationMs: number;
  /** A single pair is shared by glance, speaking, and settle. */
  pair: BotGroupWaitingRoomAmbientPair | null;
  /** Unordered pair key so the same duo does not immediately swap roles. */
  previousPairKey: string | null;
  visibleAnchorBotIds: string[];
  visibleBotIds: string[];
}

export interface BotGroupWaitingRoomAmbientPauseState {
  typing: boolean;
  zenFocused: boolean;
  coffeeStaging: boolean;
  pageHidden: boolean;
  reducedMotion: boolean;
  roomActive: boolean;
  interacting: boolean;
}

function uniqueSortedBotIds(botIds: readonly string[]): string[] {
  return Array.from(
    new Set(
      botIds
        .filter((botId): botId is string => typeof botId === "string")
        .map((botId) => botId.trim())
        .filter(Boolean),
    ),
  ).sort();
}

function stableHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededDurationMs(seed: string, minimum: number, maximum: number): number {
  return minimum + (stableHash(seed) % (maximum - minimum + 1));
}

function ambientPhaseDurationMs(
  visitSeed: string,
  cycle: number,
  phase: BotGroupWaitingRoomAmbientPhase,
): number {
  if (phase === "idle") {
    return seededDurationMs(
      `${visitSeed}:ambient:${cycle}:idle`,
      BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MIN_MS,
      BOT_GROUP_WAITING_ROOM_AMBIENT_IDLE_MAX_MS,
    );
  }
  if (phase === "glance") return BOT_GROUP_WAITING_ROOM_AMBIENT_GLANCE_MS;
  if (phase === "settle") return BOT_GROUP_WAITING_ROOM_AMBIENT_SETTLE_MS;
  return seededDurationMs(
    `${visitSeed}:ambient:${cycle}:speaking`,
    BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MIN_MS,
    BOT_GROUP_WAITING_ROOM_AMBIENT_SPEAKING_MAX_MS,
  );
}

function unorderedPairKey(speakerBotId: string, listenerBotId: string): string {
  return [speakerBotId, listenerBotId].sort().join("\u0000");
}

function choosePair({
  visitSeed,
  cycle,
  visibleAnchorBotIds,
  visibleBotIds,
  previousPairKey,
}: Pick<
  BotGroupWaitingRoomAmbientState,
  | "visitSeed"
  | "cycle"
  | "visibleAnchorBotIds"
  | "visibleBotIds"
  | "previousPairKey"
>): BotGroupWaitingRoomAmbientPair | null {
  const visible = new Set(visibleBotIds);
  const speakers = visibleAnchorBotIds.filter((botId) => visible.has(botId));
  const candidates = speakers.flatMap((speakerBotId) =>
    visibleBotIds
      .filter((listenerBotId) => listenerBotId !== speakerBotId)
      .map((listenerBotId) => ({ speakerBotId, listenerBotId })),
  );
  if (candidates.length === 0) return null;

  const alternatives = previousPairKey
    ? candidates.filter(
        ({ speakerBotId, listenerBotId }) =>
          unorderedPairKey(speakerBotId, listenerBotId) !== previousPairKey,
      )
    : candidates;
  const pool = alternatives.length > 0 ? alternatives : candidates;
  const pairIndex =
    stableHash(`${visitSeed}:ambient:${cycle}:pair`) % pool.length;
  const selected = pool[pairIndex]!;
  const cueIndex =
    stableHash(
      `${visitSeed}:ambient:${cycle}:cue:${selected.speakerBotId}:${selected.listenerBotId}`,
    ) % BOT_GROUP_WAITING_ROOM_AMBIENT_CUES.length;
  return {
    ...selected,
    cue: BOT_GROUP_WAITING_ROOM_AMBIENT_CUES[cueIndex]!,
  };
}

function idleState(
  state: BotGroupWaitingRoomAmbientState,
  cycle: number,
  previousPairKey: string | null,
): BotGroupWaitingRoomAmbientState {
  return {
    ...state,
    cycle,
    phase: "idle",
    phaseDurationMs: ambientPhaseDurationMs(
      state.visitSeed,
      cycle,
      "idle",
    ),
    pair: null,
    previousPairKey,
  };
}

export function createBotGroupWaitingRoomAmbientState({
  visitSeed,
  visibleAnchorBotIds,
  visibleBotIds,
}: {
  visitSeed: string;
  visibleAnchorBotIds: readonly string[];
  visibleBotIds: readonly string[];
}): BotGroupWaitingRoomAmbientState {
  const visible = uniqueSortedBotIds(visibleBotIds);
  const visibleSet = new Set(visible);
  const anchors = uniqueSortedBotIds(visibleAnchorBotIds).filter((botId) =>
    visibleSet.has(botId),
  );
  const state: BotGroupWaitingRoomAmbientState = {
    visitSeed,
    cycle: 0,
    phase: "idle",
    phaseDurationMs: ambientPhaseDurationMs(visitSeed, 0, "idle"),
    pair: null,
    previousPairKey: null,
    visibleAnchorBotIds: anchors,
    visibleBotIds: visible,
  };
  return state;
}

export function reconcileBotGroupWaitingRoomAmbientState(
  state: BotGroupWaitingRoomAmbientState,
  {
    visibleAnchorBotIds,
    visibleBotIds,
  }: {
    visibleAnchorBotIds: readonly string[];
    visibleBotIds: readonly string[];
  },
): BotGroupWaitingRoomAmbientState {
  const visible = uniqueSortedBotIds(visibleBotIds);
  const visibleSet = new Set(visible);
  const anchors = uniqueSortedBotIds(visibleAnchorBotIds).filter((botId) =>
    visibleSet.has(botId),
  );
  const castState = {
    ...state,
    visibleAnchorBotIds: anchors,
    visibleBotIds: visible,
  };
  if (state.phase === "idle") return castState;

  const pairStillValid = Boolean(
    state.pair &&
      anchors.includes(state.pair.speakerBotId) &&
      visibleSet.has(state.pair.listenerBotId) &&
      state.pair.speakerBotId !== state.pair.listenerBotId,
  );
  if (pairStillValid) return castState;

  const replacement = choosePair(castState);
  if (replacement) return { ...castState, pair: replacement };
  return idleState(castState, state.cycle, state.previousPairKey);
}

export function advanceBotGroupWaitingRoomAmbientState(
  state: BotGroupWaitingRoomAmbientState,
): BotGroupWaitingRoomAmbientState {
  const current = reconcileBotGroupWaitingRoomAmbientState(state, state);
  if (current.phase === "idle") {
    const pair = choosePair(current);
    if (!pair) {
      return idleState(current, current.cycle + 1, current.previousPairKey);
    }
    return {
      ...current,
      phase: "glance",
      phaseDurationMs: ambientPhaseDurationMs(
        current.visitSeed,
        current.cycle,
        "glance",
      ),
      pair,
    };
  }
  if (!current.pair) {
    return idleState(current, current.cycle + 1, current.previousPairKey);
  }
  if (current.phase === "glance") {
    return {
      ...current,
      phase: "speaking",
      phaseDurationMs: ambientPhaseDurationMs(
        current.visitSeed,
        current.cycle,
        "speaking",
      ),
    };
  }
  if (current.phase === "speaking") {
    return {
      ...current,
      phase: "settle",
      phaseDurationMs: ambientPhaseDurationMs(
        current.visitSeed,
        current.cycle,
        "settle",
      ),
    };
  }
  return idleState(
    current,
    current.cycle + 1,
    unorderedPairKey(
      current.pair.speakerBotId,
      current.pair.listenerBotId,
    ),
  );
}

export function botGroupWaitingRoomAmbientPaused(
  pauseState: BotGroupWaitingRoomAmbientPauseState,
): boolean {
  return (
    pauseState.typing ||
    pauseState.zenFocused ||
    pauseState.coffeeStaging ||
    pauseState.pageHidden ||
    pauseState.reducedMotion ||
    !pauseState.roomActive ||
    pauseState.interacting
  );
}
