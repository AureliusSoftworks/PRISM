/** Experimental living-presence room. Disabled so saved groups use the
 * original hero + filtered bot-card grid. */
export const BOT_GROUP_WAITING_ROOM_ENABLED: boolean = false;
export const BOT_GROUP_WAITING_ROOM_MIN_BOTS = 2;
export const BOT_GROUP_WAITING_ROOM_MAX_VISIBLE_BOTS = 24;
export const BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT = 5;
export const BOT_GROUP_WAITING_ROOM_MAX_ROAMERS =
  BOT_GROUP_WAITING_ROOM_MAX_VISIBLE_BOTS - BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT;
export const BOT_GROUP_WAITING_ROOM_ROTATION_MIN_MS = 2 * 60 * 1_000;
export const BOT_GROUP_WAITING_ROOM_ROTATION_MAX_MS = 4 * 60 * 1_000;

export type BotGroupWaitingRoomRole = "anchor" | "roamer";
export type BotGroupWaitingRoomHandoffOrder =
  | "arrival-before-departure"
  | "departure-before-arrival";

export interface BotGroupWaitingRoomViewport {
  width: number;
  height: number;
}

export interface BotGroupWaitingRoomGroup {
  id: string;
  builtIn: boolean;
  special?: boolean;
}

export interface BotGroupWaitingRoomPlacement {
  slot: string;
  role: BotGroupWaitingRoomRole;
  botId: string;
  xPercent: number;
  yPercent: number;
  scale: number;
  depth: number;
  driftX: number;
  driftY: number;
  driftDurationMs: number;
  driftDelayMs: number;
}

export interface BotGroupWaitingRoomReturnCheckpoint {
  lane: "room" | "zen" | "coffee";
  botId?: string | null;
  createdAtMs: number;
  room: BotGroupWaitingRoomVisitSnapshot;
}

export interface BotGroupWaitingRoomVisitSnapshot {
  groupId: string;
  visitSeed: string;
  eligibleBotIds: string[];
  anchorBotIds: string[];
  roamerBotIds: string[];
  placements: BotGroupWaitingRoomPlacement[];
  /** Oldest engagement first; the first anchor is demoted on promotion. */
  engagementOrder: string[];
  /** Remaining arrival candidates for the current no-repeat cycle. */
  rotationDeck: string[];
  rotationCycleArrivals: string[];
  rotationCycle: number;
  rotationCount: number;
  nextRotationDelayMs: number;
  draft: string;
}

export interface BotGroupWaitingRoomVisitState
  extends BotGroupWaitingRoomVisitSnapshot {
  returnCheckpoint: BotGroupWaitingRoomReturnCheckpoint | null;
}

export interface BotGroupWaitingRoomPauseState {
  typing: boolean;
  zenFocused: boolean;
  coffeeStaging: boolean;
  pageHidden: boolean;
  reducedMotion: boolean;
}

export interface BotGroupWaitingRoomRotationResult {
  state: BotGroupWaitingRoomVisitState;
  changed: boolean;
  arrivingBotId: string | null;
  departingBotId: string | null;
  handoffOrder: BotGroupWaitingRoomHandoffOrder | null;
  slot: string | null;
}

function uniqueBotIds(botIds: readonly string[]): string[] {
  return Array.from(
    new Set(
      botIds
        .filter((botId): botId is string => typeof botId === "string")
        .map((botId) => botId.trim())
        .filter(Boolean),
    ),
  );
}

function stableHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnitValue(seed: string): number {
  return stableHash(seed) / 0xffffffff;
}

function seededShuffle<T>(values: readonly T[], seed: string): T[] {
  return values
    .map((value, index) => ({
      value,
      index,
      score: stableHash(`${seed}:${index}:${String(value)}`),
    }))
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ value }) => value);
}

function buildPlacements(
  anchorBotIds: readonly string[],
  roamerBotIds: readonly string[],
): BotGroupWaitingRoomPlacement[] {
  const cast = [
    ...anchorBotIds.map((botId, index) => ({
      botId,
      role: "anchor" as const,
      slot: `anchor-${index + 1}`,
    })),
    ...roamerBotIds.map((botId, index) => ({
      botId,
      role: "roamer" as const,
      slot: `roamer-${index + 1}`,
    })),
  ].slice(0, BOT_GROUP_WAITING_ROOM_MAX_VISIBLE_BOTS);
  const count = cast.length;
  const columns = count <= 6 ? count : count <= 15 ? 5 : 6;
  const rows = Math.max(1, Math.ceil(count / columns));

  return cast.map(({ botId, role, slot }, index) => {
    const row = Math.floor(index / columns);
    const rowStart = row * columns;
    const rowCount = Math.min(columns, count - rowStart);
    const column = index - rowStart;
    const rowInset = columns > 1 && row % 2 === 1 ? 2.4 : 0;
    const xStep = rowCount > 1 ? 82 / (rowCount - 1) : 0;
    const xBase = rowCount === 1 ? 50 : 9 + column * xStep;
    const yBase = rows === 1 ? 51 : 17 + row * (68 / (rows - 1));
    const jitterX = (stableUnitValue(`${botId}:${slot}:x`) - 0.5) * 4.2;
    const jitterY = (stableUnitValue(`${botId}:${slot}:y`) - 0.5) * 4.8;
    const depthUnit = stableUnitValue(`${botId}:${slot}:depth`);
    return {
      slot,
      role,
      botId,
      xPercent: Math.max(6, Math.min(94, xBase + rowInset + jitterX)),
      yPercent: Math.max(12, Math.min(88, yBase + jitterY)),
      scale: 0.86 + depthUnit * 0.22,
      depth: 2 + Math.round(depthUnit * 4),
      driftX: 10 + Math.round(stableUnitValue(`${botId}:drift-x`) * 16),
      driftY: 7 + Math.round(stableUnitValue(`${botId}:drift-y`) * 13),
      driftDurationMs:
        8_400 + Math.round(stableUnitValue(`${botId}:drift-duration`) * 7_200),
      driftDelayMs: -Math.round(stableUnitValue(`${botId}:drift-delay`) * 8_000),
    };
  });
}

function nextRotationDelayMs(visitSeed: string, rotationCount: number): number {
  const span =
    BOT_GROUP_WAITING_ROOM_ROTATION_MAX_MS -
    BOT_GROUP_WAITING_ROOM_ROTATION_MIN_MS;
  return Math.round(
    BOT_GROUP_WAITING_ROOM_ROTATION_MIN_MS +
      stableUnitValue(`${visitSeed}:rotation-delay:${rotationCount}`) * span,
  );
}

function fullCastBotIds(state: BotGroupWaitingRoomVisitState): string[] {
  return [...state.anchorBotIds, ...state.roamerBotIds];
}

function buildRotationDeck(
  eligibleBotIds: readonly string[],
  excludedBotIds: readonly string[],
  visitSeed: string,
  cycle: number,
): string[] {
  const excluded = new Set(excludedBotIds);
  return seededShuffle(
    eligibleBotIds.filter((botId) => !excluded.has(botId)),
    `${visitSeed}:rotation-deck:${cycle}`,
  );
}

/** The exact compact boundary is below 900 wide or below 560 high. */
export function botGroupWaitingRoomUsesCompactFallback(
  viewport: BotGroupWaitingRoomViewport,
): boolean {
  return viewport.width < 900 || viewport.height < 560;
}

export function botGroupWaitingRoomPresenceCount(
  viewport: BotGroupWaitingRoomViewport,
  eligibleBotCount: number,
): number {
  if (
    eligibleBotCount < BOT_GROUP_WAITING_ROOM_MIN_BOTS ||
    botGroupWaitingRoomUsesCompactFallback(viewport)
  ) {
    return 0;
  }
  return Math.min(BOT_GROUP_WAITING_ROOM_MAX_VISIBLE_BOTS, eligibleBotCount);
}

export function botGroupWaitingRoomIsEligible(
  group: BotGroupWaitingRoomGroup | null,
  validBotIds: readonly string[],
): boolean {
  return Boolean(
    group &&
      (!group.builtIn ||
        group.id === "builtin:favorites" ||
        group.id === "ungrouped") &&
      !group.special &&
      uniqueBotIds(validBotIds).length >= BOT_GROUP_WAITING_ROOM_MIN_BOTS,
  );
}

export function createBotGroupWaitingRoomVisit({
  groupId,
  validBotIds,
  visitSeed,
  draft = "",
  returnCheckpoint = null,
}: {
  groupId: string;
  validBotIds: readonly string[];
  visitSeed: string;
  draft?: string;
  returnCheckpoint?: BotGroupWaitingRoomReturnCheckpoint | null;
}): BotGroupWaitingRoomVisitState | null {
  const eligibleBotIds = uniqueBotIds(validBotIds).sort();
  if (eligibleBotIds.length < BOT_GROUP_WAITING_ROOM_MIN_BOTS) return null;

  const ordered = seededShuffle(
    eligibleBotIds,
    `${visitSeed}:${groupId}:initial-cast`,
  );
  const anchorBotIds = ordered.slice(0, BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT);
  const roamerBotIds = ordered.slice(
    BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT,
    BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT + BOT_GROUP_WAITING_ROOM_MAX_ROAMERS,
  );
  const rotationCycle = 0;
  const rotationCount = 0;
  return {
    groupId,
    visitSeed,
    eligibleBotIds,
    anchorBotIds,
    roamerBotIds,
    placements: buildPlacements(anchorBotIds, roamerBotIds),
    engagementOrder: anchorBotIds.slice(),
    rotationDeck: buildRotationDeck(
      eligibleBotIds,
      [...anchorBotIds, ...roamerBotIds],
      visitSeed,
      rotationCycle,
    ),
    rotationCycleArrivals: [],
    rotationCycle,
    rotationCount,
    nextRotationDelayMs: nextRotationDelayMs(visitSeed, rotationCount),
    draft,
    returnCheckpoint,
  };
}

export function botGroupWaitingRoomVisiblePlacements(
  state: BotGroupWaitingRoomVisitState,
  viewport: BotGroupWaitingRoomViewport,
): BotGroupWaitingRoomPlacement[] {
  const count = botGroupWaitingRoomPresenceCount(
    viewport,
    state.eligibleBotIds.length,
  );
  if (count === 0) return [];
  return state.placements.slice(0, count);
}

export function engageBotGroupWaitingRoomAnchor(
  state: BotGroupWaitingRoomVisitState,
  botId: string,
): BotGroupWaitingRoomVisitState {
  if (!state.anchorBotIds.includes(botId)) return state;
  const engagementOrder = state.engagementOrder.filter(
    (candidateId) => candidateId !== botId,
  );
  engagementOrder.push(botId);
  return { ...state, engagementOrder };
}

export function promoteBotGroupWaitingRoomRoamer(
  state: BotGroupWaitingRoomVisitState,
  botId: string,
): BotGroupWaitingRoomVisitState {
  const roamerIndex = state.roamerBotIds.indexOf(botId);
  if (roamerIndex < 0) return state;
  const demotedBotId =
    state.engagementOrder.find((candidateId) =>
      state.anchorBotIds.includes(candidateId),
    ) ?? state.anchorBotIds[0];
  if (!demotedBotId) return state;
  const anchorIndex = state.anchorBotIds.indexOf(demotedBotId);
  if (anchorIndex < 0) return state;

  const anchorBotIds = state.anchorBotIds.slice();
  const roamerBotIds = state.roamerBotIds.slice();
  anchorBotIds[anchorIndex] = botId;
  roamerBotIds[roamerIndex] = demotedBotId;
  const engagementOrder = state.engagementOrder.filter(
    (candidateId) => candidateId !== demotedBotId && candidateId !== botId,
  );
  engagementOrder.push(botId);
  return {
    ...state,
    anchorBotIds,
    roamerBotIds,
    placements: buildPlacements(anchorBotIds, roamerBotIds),
    engagementOrder,
  };
}

export function botGroupWaitingRoomHandoffOrder(
  visiblePresenceCount: number,
  visitSeed: string,
  rotationCount: number,
): BotGroupWaitingRoomHandoffOrder {
  if (visiblePresenceCount <= 6) return "arrival-before-departure";
  if (visiblePresenceCount >= 8) return "departure-before-arrival";
  return stableHash(`${visitSeed}:handoff:${rotationCount}`) % 2 === 0
    ? "arrival-before-departure"
    : "departure-before-arrival";
}

export function rotateBotGroupWaitingRoomRoamer(
  state: BotGroupWaitingRoomVisitState,
  viewport: BotGroupWaitingRoomViewport,
): BotGroupWaitingRoomRotationResult {
  const visiblePlacements = botGroupWaitingRoomVisiblePlacements(
    state,
    viewport,
  );
  const visibleRoamers = visiblePlacements.filter(
    (placement) => placement.role === "roamer",
  );
  const rotationCount = state.rotationCount + 1;
  const unchanged = (): BotGroupWaitingRoomRotationResult => ({
    state: {
      ...state,
      rotationCount,
      nextRotationDelayMs: nextRotationDelayMs(
        state.visitSeed,
        rotationCount,
      ),
    },
    changed: false,
    arrivingBotId: null,
    departingBotId: null,
    handoffOrder: null,
    slot: null,
  });
  if (visibleRoamers.length === 0) return unchanged();

  let rotationCycle = state.rotationCycle;
  let rotationCycleArrivals = state.rotationCycleArrivals;
  let rotationDeck = state.rotationDeck.filter((botId) =>
    state.eligibleBotIds.includes(botId),
  );
  const visibleIds = new Set(visiblePlacements.map(({ botId }) => botId));
  let candidateIndex = rotationDeck.findIndex(
    (botId) => !visibleIds.has(botId),
  );
  if (candidateIndex < 0) {
    rotationCycle += 1;
    rotationDeck = buildRotationDeck(
      state.eligibleBotIds,
      visiblePlacements.map(({ botId }) => botId),
      state.visitSeed,
      rotationCycle,
    );
    rotationCycleArrivals = [];
    candidateIndex = rotationDeck.findIndex(
      (botId) => !visibleIds.has(botId),
    );
  }
  if (candidateIndex < 0) return unchanged();

  const arrivingBotId = rotationDeck[candidateIndex]!;
  rotationDeck = rotationDeck.filter((_, index) => index !== candidateIndex);
  const targetIndex =
    stableHash(`${state.visitSeed}:rotation-slot:${rotationCount}`) %
    visibleRoamers.length;
  const target = visibleRoamers[targetIndex]!;
  const roamerIndex = state.roamerBotIds.indexOf(target.botId);
  if (roamerIndex < 0) return unchanged();

  const roamerBotIds = state.roamerBotIds.slice();
  const arrivingExistingIndex = roamerBotIds.indexOf(arrivingBotId);
  if (arrivingExistingIndex >= 0) {
    roamerBotIds[arrivingExistingIndex] = target.botId;
  }
  roamerBotIds[roamerIndex] = arrivingBotId;
  const nextState: BotGroupWaitingRoomVisitState = {
    ...state,
    roamerBotIds,
    placements: buildPlacements(state.anchorBotIds, roamerBotIds),
    rotationDeck,
    rotationCycleArrivals: [...rotationCycleArrivals, arrivingBotId],
    rotationCycle,
    rotationCount,
    nextRotationDelayMs: nextRotationDelayMs(
      state.visitSeed,
      rotationCount,
    ),
  };
  return {
    state: nextState,
    changed: true,
    arrivingBotId,
    departingBotId: target.botId,
    handoffOrder: botGroupWaitingRoomHandoffOrder(
      visiblePlacements.length,
      state.visitSeed,
      rotationCount,
    ),
    slot: target.slot,
  };
}

export function reconcileBotGroupWaitingRoomVisit(
  state: BotGroupWaitingRoomVisitState,
  validBotIds: readonly string[],
): BotGroupWaitingRoomVisitState | null {
  const eligibleBotIds = uniqueBotIds(validBotIds).sort();
  if (eligibleBotIds.length < BOT_GROUP_WAITING_ROOM_MIN_BOTS) return null;
  const validSet = new Set(eligibleBotIds);
  const retainedAnchors = state.anchorBotIds.filter((botId) =>
    validSet.has(botId),
  );
  const retainedRoamers = state.roamerBotIds.filter(
    (botId) => validSet.has(botId) && !retainedAnchors.includes(botId),
  );
  const targetAnchorCount = Math.min(
    BOT_GROUP_WAITING_ROOM_ANCHOR_COUNT,
    eligibleBotIds.length,
  );
  while (
    retainedAnchors.length < targetAnchorCount &&
    retainedRoamers.length > 0
  ) {
    retainedAnchors.push(retainedRoamers.shift()!);
  }
  const retained = new Set([...retainedAnchors, ...retainedRoamers]);
  const survivingDeck = state.rotationDeck.filter(
    (botId) => validSet.has(botId) && !retained.has(botId),
  );
  const previousEligible = new Set(state.eligibleBotIds);
  const genuinelyNewCandidates = seededShuffle(
    eligibleBotIds.filter(
      (botId) => !previousEligible.has(botId) && !retained.has(botId),
    ),
    `${state.visitSeed}:reconcile-new:${eligibleBotIds.join(":")}`,
  );
  const fallbackCandidates = seededShuffle(
    eligibleBotIds.filter(
      (botId) =>
        !retained.has(botId) &&
        !survivingDeck.includes(botId) &&
        !genuinelyNewCandidates.includes(botId),
    ),
    `${state.visitSeed}:reconcile-fallback:${eligibleBotIds.join(":")}`,
  );
  const replacements = [
    ...survivingDeck,
    ...genuinelyNewCandidates,
    ...fallbackCandidates,
  ];
  while (
    retainedAnchors.length < targetAnchorCount &&
    replacements.length > 0
  ) {
    retainedAnchors.push(replacements.shift()!);
  }
  while (
    retainedRoamers.length < BOT_GROUP_WAITING_ROOM_MAX_ROAMERS &&
    replacements.length > 0
  ) {
    retainedRoamers.push(replacements.shift()!);
  }
  const engagementOrder = state.engagementOrder.filter((botId) =>
    retainedAnchors.includes(botId),
  );
  for (const botId of retainedAnchors) {
    if (!engagementOrder.includes(botId)) engagementOrder.push(botId);
  }
  const cast = [...retainedAnchors, ...retainedRoamers];
  const castSet = new Set(cast);
  const rotationDeck = [
    ...survivingDeck,
    ...genuinelyNewCandidates,
  ].filter((botId) => !castSet.has(botId));
  return {
    ...state,
    eligibleBotIds,
    anchorBotIds: retainedAnchors,
    roamerBotIds: retainedRoamers,
    placements: buildPlacements(retainedAnchors, retainedRoamers),
    engagementOrder,
    rotationDeck,
    rotationCycleArrivals: state.rotationCycleArrivals.filter((botId) =>
      validSet.has(botId),
    ),
  };
}

export function botGroupWaitingRoomSnapshot(
  state: BotGroupWaitingRoomVisitState,
): BotGroupWaitingRoomVisitSnapshot {
  const { returnCheckpoint: _returnCheckpoint, ...snapshot } = state;
  return snapshot;
}

export function botGroupWaitingRoomRotationPaused(
  pauseState: BotGroupWaitingRoomPauseState,
): boolean {
  return (
    pauseState.typing ||
    pauseState.zenFocused ||
    pauseState.coffeeStaging ||
    pauseState.pageHidden ||
    pauseState.reducedMotion
  );
}

export function botGroupWaitingRoomWithDraft(
  state: BotGroupWaitingRoomVisitState,
  draft: string,
): BotGroupWaitingRoomVisitState {
  return state.draft === draft ? state : { ...state, draft };
}

export function botGroupWaitingRoomWithReturnCheckpoint(
  state: BotGroupWaitingRoomVisitState,
  returnCheckpoint: BotGroupWaitingRoomReturnCheckpoint | null,
): BotGroupWaitingRoomVisitState {
  return state.returnCheckpoint === returnCheckpoint
    ? state
    : { ...state, returnCheckpoint };
}
