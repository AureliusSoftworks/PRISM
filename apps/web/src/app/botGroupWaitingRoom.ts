/** Living-presence rooms are available for authored saved groups. */
export const BOT_GROUP_WAITING_ROOM_ENABLED: boolean = true;
export const BOT_GROUP_WAITING_ROOM_MIN_BOTS = 2;
export const BOT_GROUP_WAITING_ROOM_MAX_MINI_BOTS = 24;
export const BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH = 104;
export const BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT = 112;
export const BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE = 44;
export const BOT_GROUP_WAITING_ROOM_MICRO_VISUAL_SIZE = 36;

export type BotGroupRoomLod = "mini" | "micro";

export interface BotGroupRoomPlacement {
  botId: string;
  index: number;
  lod: BotGroupRoomLod;
  row: number;
  column: number;
  /** Top-left room coordinates for the complete interaction footprint. */
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  visualSize: number;
  promoted: boolean;
  displaced: boolean;
}

export interface BotGroupRoomFootprint {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BotGroupRoomLayout {
  lod: BotGroupRoomLod;
  width: number;
  height: number;
  contentWidth: number;
  contentHeight: number;
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  miniCapacity: number;
  promotedBotId: string | null;
  promotedFootprint: BotGroupRoomFootprint | null;
  placements: BotGroupRoomPlacement[];
}

export interface ResolveBotGroupRoomLayoutOptions {
  botIds: readonly string[];
  width: number;
  height: number;
  promotedBotId?: string | null;
  /**
   * A fixed piece of room furniture that living presences must not cover.
   * Zen group rooms use this for the central, interactive bot grid.
   */
  exclusionFootprint?: BotGroupRoomFootprint | null;
}

export interface BotGroupWaitingRoomGroup {
  id: string;
  builtIn: boolean;
  special?: boolean;
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
  draft: string;
}

export interface BotGroupWaitingRoomVisitState
  extends BotGroupWaitingRoomVisitSnapshot {
  returnCheckpoint: BotGroupWaitingRoomReturnCheckpoint | null;
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

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function chooseBalancedColumnCount({
  count,
  width,
  height,
  cellWidth,
  cellHeight,
  constrainToHeight,
}: {
  count: number;
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  constrainToHeight: boolean;
}): number {
  if (count <= 0) return 0;
  const maximumColumns = Math.max(1, Math.floor(width / cellWidth));
  const maximumRows = Math.max(1, Math.floor(height / cellHeight));
  const minimumColumns = constrainToHeight
    ? Math.max(1, Math.ceil(count / maximumRows))
    : 1;
  const roomAspect = width > 0 && height > 0 ? width / height : 1;
  const idealColumns = Math.ceil(
    Math.sqrt(count * roomAspect * (cellHeight / cellWidth)),
  );
  return clamp(idealColumns, minimumColumns, Math.min(count, maximumColumns));
}

function rectanglesIntersect(
  left: BotGroupRoomFootprint,
  right: BotGroupRoomFootprint,
): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

interface BotGroupRoomCandidate {
  row: number;
  column: number;
  x: number;
  y: number;
}

function normalizeRoomFootprint(
  footprint: BotGroupRoomFootprint | null | undefined,
  width: number,
  height: number,
): BotGroupRoomFootprint | null {
  if (!footprint) return null;
  const x = clamp(finiteNonNegative(footprint.x), 0, width);
  const y = clamp(finiteNonNegative(footprint.y), 0, height);
  const footprintWidth = clamp(
    finiteNonNegative(footprint.width),
    0,
    Math.max(0, width - x),
  );
  const footprintHeight = clamp(
    finiteNonNegative(footprint.height),
    0,
    Math.max(0, height - y),
  );
  return footprintWidth > 0 && footprintHeight > 0
    ? { x, y, width: footprintWidth, height: footprintHeight }
    : null;
}

function roomCandidatesOutsideFootprint({
  width,
  height,
  cellWidth,
  cellHeight,
  exclusionFootprint,
  minimumCount,
}: {
  width: number;
  height: number;
  cellWidth: number;
  cellHeight: number;
  exclusionFootprint: BotGroupRoomFootprint;
  minimumCount: number;
}): {
  candidates: BotGroupRoomCandidate[];
  columns: number;
  rows: number;
  visibleCapacity: number;
  contentHeight: number;
} {
  const columns = Math.max(1, Math.floor(width / cellWidth));
  const visibleRows = Math.max(1, Math.floor(height / cellHeight));
  const xOrigin = Math.max(0, (width - columns * cellWidth) / 2);
  const yOrigin = Math.max(0, (height - visibleRows * cellHeight) / 2);
  const candidates: BotGroupRoomCandidate[] = [];
  let visibleCapacity = 0;
  let rows = visibleRows;
  const maximumRows =
    visibleRows + Math.max(0, Math.ceil(minimumCount / columns) + 2);
  const appendRow = (row: number, visible: boolean): void => {
    for (let column = 0; column < columns; column += 1) {
      const candidate = {
        row,
        column,
        x: xOrigin + column * cellWidth,
        y: yOrigin + row * cellHeight,
      };
      if (
        !rectanglesIntersect(
          {
            x: candidate.x,
            y: candidate.y,
            width: cellWidth,
            height: cellHeight,
          },
          exclusionFootprint,
        )
      ) {
        candidates.push(candidate);
        if (visible) visibleCapacity += 1;
      }
    }
  };

  for (let row = 0; row < visibleRows; row += 1) {
    appendRow(row, true);
  }
  while (candidates.length < minimumCount && rows < maximumRows) {
    appendRow(rows, false);
    rows += 1;
  }

  return {
    candidates,
    columns,
    rows,
    visibleCapacity,
    contentHeight: Math.max(height, yOrigin + rows * cellHeight),
  };
}

function spreadRoomCandidates(
  candidates: readonly BotGroupRoomCandidate[],
  count: number,
  exclusionFootprint: BotGroupRoomFootprint,
  cellWidth: number,
  cellHeight: number,
): BotGroupRoomCandidate[] {
  if (count <= 0 || candidates.length === 0) return [];
  const centerX = exclusionFootprint.x + exclusionFootprint.width / 2;
  const centerY = exclusionFootprint.y + exclusionFootprint.height / 2;
  const ordered = [...candidates].sort((left, right) => {
    const leftAngle = Math.atan2(
      left.y + cellHeight / 2 - centerY,
      left.x + cellWidth / 2 - centerX,
    );
    const rightAngle = Math.atan2(
      right.y + cellHeight / 2 - centerY,
      right.x + cellWidth / 2 - centerX,
    );
    const leftDistance =
      (left.x + cellWidth / 2 - centerX) ** 2 +
      (left.y + cellHeight / 2 - centerY) ** 2;
    const rightDistance =
      (right.x + cellWidth / 2 - centerX) ** 2 +
      (right.y + cellHeight / 2 - centerY) ** 2;
    return leftAngle - rightAngle || leftDistance - rightDistance;
  });
  if (ordered.length <= count) return ordered.slice(0, count);
  return Array.from({ length: count }, (_, index) =>
    ordered[Math.floor((index * ordered.length) / count)]!,
  );
}

function resolveBotGroupAquariumLayout({
  botIds,
  width,
  height,
  promotedBotId: requestedPromotedBotId,
  exclusionFootprint,
}: {
  botIds: string[];
  width: number;
  height: number;
  promotedBotId: string | null;
  exclusionFootprint: BotGroupRoomFootprint;
}): BotGroupRoomLayout {
  const miniCandidates = roomCandidatesOutsideFootprint({
    width,
    height,
    cellWidth: BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
    cellHeight: BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT,
    exclusionFootprint,
    minimumCount: botIds.length,
  });
  const lod: BotGroupRoomLod =
    botIds.length <= BOT_GROUP_WAITING_ROOM_MAX_MINI_BOTS &&
    botIds.length <= miniCandidates.visibleCapacity
      ? "mini"
      : "micro";
  const cellWidth =
    lod === "mini"
      ? BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH
      : BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE;
  const cellHeight =
    lod === "mini"
      ? BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT
      : BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE;
  const resolvedCandidates =
    lod === "mini"
      ? miniCandidates
      : roomCandidatesOutsideFootprint({
          width,
          height,
          cellWidth,
          cellHeight,
          exclusionFootprint,
          minimumCount: botIds.length + 8,
        });
  const selectedCandidates = spreadRoomCandidates(
    resolvedCandidates.candidates,
    botIds.length,
    exclusionFootprint,
    cellWidth,
    cellHeight,
  );
  const placements: BotGroupRoomPlacement[] = botIds.map((botId, index) => {
    const candidate = selectedCandidates[index] ?? {
      row: index,
      column: 0,
      x: 0,
      y: height + index * cellHeight,
    };
    return {
      botId,
      index,
      lod,
      ...candidate,
      width: cellWidth,
      height: cellHeight,
      centerX: candidate.x + cellWidth / 2,
      centerY: candidate.y + cellHeight / 2,
      visualSize:
        lod === "mini"
          ? BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH
          : BOT_GROUP_WAITING_ROOM_MICRO_VISUAL_SIZE,
      promoted: false,
      displaced: false,
    };
  });

  const requestedIndex = requestedPromotedBotId
    ? botIds.indexOf(requestedPromotedBotId)
    : -1;
  if (lod === "micro" && requestedIndex >= 0) {
    const requestedPlacement = placements[requestedIndex]!;
    const promotionCandidates = roomCandidatesOutsideFootprint({
      width,
      height,
      cellWidth: BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
      cellHeight: BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT,
      exclusionFootprint,
      minimumCount: 1,
    }).candidates;
    const promotionSlot = [...promotionCandidates].sort((left, right) => {
      const leftDistance =
        (left.x - requestedPlacement.x) ** 2 +
        (left.y - requestedPlacement.y) ** 2;
      const rightDistance =
        (right.x - requestedPlacement.x) ** 2 +
        (right.y - requestedPlacement.y) ** 2;
      return leftDistance - rightDistance;
    })[0];
    if (promotionSlot) {
      const promotedFootprint = {
        x: promotionSlot.x,
        y: promotionSlot.y,
        width: BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
        height: BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT,
      };
      const occupiedCandidateKeys = new Set(
        placements.map(({ row, column }) => `${row}:${column}`),
      );
      const replacementCandidates = resolvedCandidates.candidates.filter(
        (candidate) =>
          !occupiedCandidateKeys.has(`${candidate.row}:${candidate.column}`) &&
          !rectanglesIntersect(
            {
              x: candidate.x,
              y: candidate.y,
              width: cellWidth,
              height: cellHeight,
            },
            promotedFootprint,
          ),
      );
      for (const placement of placements) {
        if (
          placement.index === requestedIndex ||
          !rectanglesIntersect(placement, promotedFootprint)
        ) {
          continue;
        }
        const replacement = replacementCandidates.shift();
        if (!replacement) continue;
        Object.assign(placement, replacement, {
          centerX: replacement.x + cellWidth / 2,
          centerY: replacement.y + cellHeight / 2,
          displaced: true,
        });
      }
      Object.assign(requestedPlacement, promotedFootprint, {
        lod: "mini" as const,
        row: promotionSlot.row,
        column: promotionSlot.column,
        centerX: promotionSlot.x + BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH / 2,
        centerY: promotionSlot.y + BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT / 2,
        visualSize: BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
        promoted: true,
      });
      return {
        lod,
        width,
        height,
        contentWidth: width,
        contentHeight: resolvedCandidates.contentHeight,
        columns: resolvedCandidates.columns,
        rows: resolvedCandidates.rows,
        cellWidth,
        cellHeight,
        miniCapacity: miniCandidates.visibleCapacity,
        promotedBotId: requestedPromotedBotId,
        promotedFootprint,
        placements,
      };
    }
  }

  return {
    lod,
    width,
    height,
    contentWidth: width,
    contentHeight: resolvedCandidates.contentHeight,
    columns: resolvedCandidates.columns,
    rows: resolvedCandidates.rows,
    cellWidth,
    cellHeight,
    miniCapacity: miniCandidates.visibleCapacity,
    promotedBotId: null,
    promotedFootprint: null,
    placements,
  };
}

/**
 * Resolves the complete, deterministic club-room cast. The input order is the
 * saved group order and is preserved in the returned placements. No time,
 * random rotation, pagination, or viewport roster cap participates.
 */
export function resolveBotGroupRoomLayout({
  botIds: rawBotIds,
  width: rawWidth,
  height: rawHeight,
  promotedBotId: requestedPromotedBotId = null,
  exclusionFootprint: rawExclusionFootprint = null,
}: ResolveBotGroupRoomLayoutOptions): BotGroupRoomLayout {
  const botIds = uniqueBotIds(rawBotIds);
  const width = finiteNonNegative(rawWidth);
  const height = finiteNonNegative(rawHeight);
  const exclusionFootprint = normalizeRoomFootprint(
    rawExclusionFootprint,
    width,
    height,
  );
  if (exclusionFootprint && botIds.length > 0) {
    return resolveBotGroupAquariumLayout({
      botIds,
      width,
      height,
      promotedBotId: requestedPromotedBotId,
      exclusionFootprint,
    });
  }
  const miniColumns = Math.floor(width / BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH);
  const miniRows = Math.floor(height / BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT);
  const miniCapacity = Math.max(0, miniColumns * miniRows);
  const lod: BotGroupRoomLod =
    botIds.length <=
    Math.min(BOT_GROUP_WAITING_ROOM_MAX_MINI_BOTS, miniCapacity)
      ? "mini"
      : "micro";

  if (botIds.length === 0) {
    return {
      lod,
      width,
      height,
      contentWidth: width,
      contentHeight: height,
      columns: 0,
      rows: 0,
      cellWidth:
        lod === "mini"
          ? BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH
          : BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE,
      cellHeight:
        lod === "mini"
          ? BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT
          : BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE,
      miniCapacity,
      promotedBotId: null,
      promotedFootprint: null,
      placements: [],
    };
  }

  const cellWidth =
    lod === "mini"
      ? BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH
      : BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE;
  const cellHeight =
    lod === "mini"
      ? BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT
      : BOT_GROUP_WAITING_ROOM_MICRO_CELL_SIZE;
  const columns = chooseBalancedColumnCount({
    count: botIds.length,
    width,
    height,
    cellWidth,
    cellHeight,
    constrainToHeight: lod === "mini",
  });
  const baseRows = Math.ceil(botIds.length / columns);
  const baseGridWidth = columns * cellWidth;
  const baseGridHeight = baseRows * cellHeight;
  const xOrigin = Math.max(0, (width - baseGridWidth) / 2);
  const yOrigin = Math.max(0, (height - baseGridHeight) / 2);
  const baseSlot = (index: number) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = xOrigin + column * cellWidth;
    const y = yOrigin + row * cellHeight;
    return { row, column, x, y };
  };

  if (lod === "mini") {
    return {
      lod,
      width,
      height,
      contentWidth: Math.max(width, baseGridWidth),
      contentHeight: Math.max(height, baseGridHeight),
      columns,
      rows: baseRows,
      cellWidth,
      cellHeight,
      miniCapacity,
      promotedBotId: null,
      promotedFootprint: null,
      placements: botIds.map((botId, index) => {
        const slot = baseSlot(index);
        return {
          botId,
          index,
          lod: "mini",
          ...slot,
          width: cellWidth,
          height: cellHeight,
          centerX: slot.x + cellWidth / 2,
          centerY: slot.y + cellHeight / 2,
          visualSize: cellWidth,
          promoted: false,
          displaced: false,
        };
      }),
    };
  }

  const promotedIndex = requestedPromotedBotId
    ? botIds.indexOf(requestedPromotedBotId)
    : -1;
  const promotedBotId =
    promotedIndex >= 0 ? botIds[promotedIndex] ?? null : null;
  let contentWidth = Math.max(width, baseGridWidth);
  let contentHeight = Math.max(height, baseGridHeight);
  if (!promotedBotId) {
    return {
      lod,
      width,
      height,
      contentWidth,
      contentHeight,
      columns,
      rows: baseRows,
      cellWidth,
      cellHeight,
      miniCapacity,
      promotedBotId: null,
      promotedFootprint: null,
      placements: botIds.map((botId, index) => {
        const slot = baseSlot(index);
        return {
          botId,
          index,
          lod: "micro",
          ...slot,
          width: cellWidth,
          height: cellHeight,
          centerX: slot.x + cellWidth / 2,
          centerY: slot.y + cellHeight / 2,
          visualSize: BOT_GROUP_WAITING_ROOM_MICRO_VISUAL_SIZE,
          promoted: false,
          displaced: false,
        };
      }),
    };
  }

  contentWidth = Math.max(contentWidth, BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH);
  contentHeight = Math.max(contentHeight, BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT);
  const promotedSlot = baseSlot(promotedIndex);
  const promotedCenterX = promotedSlot.x + cellWidth / 2;
  const promotedCenterY = promotedSlot.y + cellHeight / 2;
  const promotedFootprint: BotGroupRoomFootprint = {
    x: clamp(
      promotedCenterX - BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH / 2,
      0,
      Math.max(0, contentWidth - BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH),
    ),
    y: clamp(
      promotedCenterY - BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT / 2,
      0,
      Math.max(0, contentHeight - BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT),
    ),
    width: BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
    height: BOT_GROUP_WAITING_ROOM_MINI_CELL_HEIGHT,
  };
  const baseFootprint = (index: number): BotGroupRoomFootprint => {
    const slot = baseSlot(index);
    return { x: slot.x, y: slot.y, width: cellWidth, height: cellHeight };
  };
  const displacedIndices = botIds
    .map((_, index) => index)
    .filter(
      (index) =>
        index !== promotedIndex &&
        rectanglesIntersect(baseFootprint(index), promotedFootprint),
    );
  const displacedSet = new Set(displacedIndices);
  const occupiedSlots = new Set(
    botIds
      .map((_, index) => index)
      .filter(
        (index) => index !== promotedIndex && !displacedSet.has(index),
      ),
  );
  const assignedSlots = new Map<number, number>();

  for (const displacedIndex of displacedIndices) {
    const original = baseSlot(displacedIndex);
    const originalCenterX = original.x + cellWidth / 2;
    const originalCenterY = original.y + cellHeight / 2;
    let candidateRows = baseRows;
    let candidates: number[] = [];
    while (candidates.length === 0) {
      const candidateCount = candidateRows * columns;
      candidates = Array.from({ length: candidateCount }, (_, index) => index)
        .filter((slotIndex) => !occupiedSlots.has(slotIndex))
        .filter(
          (slotIndex) =>
            !rectanglesIntersect(baseFootprint(slotIndex), promotedFootprint),
        );
      candidateRows += 1;
    }
    candidates.sort((leftIndex, rightIndex) => {
      const left = baseSlot(leftIndex);
      const right = baseSlot(rightIndex);
      const leftDistance =
        (left.x + cellWidth / 2 - originalCenterX) ** 2 +
        (left.y + cellHeight / 2 - originalCenterY) ** 2;
      const rightDistance =
        (right.x + cellWidth / 2 - originalCenterX) ** 2 +
        (right.y + cellHeight / 2 - originalCenterY) ** 2;
      return leftDistance - rightDistance || leftIndex - rightIndex;
    });
    const assignedSlot = candidates[0]!;
    assignedSlots.set(displacedIndex, assignedSlot);
    occupiedSlots.add(assignedSlot);
  }

  const highestAssignedSlot = Math.max(
    botIds.length - 1,
    ...assignedSlots.values(),
  );
  const rows = Math.floor(highestAssignedSlot / columns) + 1;
  contentHeight = Math.max(
    contentHeight,
    yOrigin + rows * cellHeight,
    promotedFootprint.y + promotedFootprint.height,
  );

  return {
    lod,
    width,
    height,
    contentWidth,
    contentHeight,
    columns,
    rows,
    cellWidth,
    cellHeight,
    miniCapacity,
    promotedBotId,
    promotedFootprint,
    placements: botIds.map((botId, index) => {
      if (index === promotedIndex) {
        return {
          botId,
          index,
          lod: "mini",
          row: promotedSlot.row,
          column: promotedSlot.column,
          x: promotedFootprint.x,
          y: promotedFootprint.y,
          width: promotedFootprint.width,
          height: promotedFootprint.height,
          centerX: promotedFootprint.x + promotedFootprint.width / 2,
          centerY: promotedFootprint.y + promotedFootprint.height / 2,
          visualSize: BOT_GROUP_WAITING_ROOM_MINI_CELL_WIDTH,
          promoted: true,
          displaced: false,
        };
      }
      const slotIndex = assignedSlots.get(index) ?? index;
      const slot = baseSlot(slotIndex);
      return {
        botId,
        index,
        lod: "micro",
        ...slot,
        width: cellWidth,
        height: cellHeight,
        centerX: slot.x + cellWidth / 2,
        centerY: slot.y + cellHeight / 2,
        visualSize: BOT_GROUP_WAITING_ROOM_MICRO_VISUAL_SIZE,
        promoted: false,
        displaced: assignedSlots.has(index),
      };
    }),
  };
}

export function botGroupWaitingRoomIsEligible(
  group: BotGroupWaitingRoomGroup | null,
  validBotIds: readonly string[],
): boolean {
  return Boolean(
    group &&
      !group.builtIn &&
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
  const eligibleBotIds = uniqueBotIds(validBotIds);
  if (eligibleBotIds.length < BOT_GROUP_WAITING_ROOM_MIN_BOTS) return null;
  return {
    groupId,
    visitSeed,
    eligibleBotIds,
    draft,
    returnCheckpoint,
  };
}

export function reconcileBotGroupWaitingRoomVisit(
  state: BotGroupWaitingRoomVisitState,
  validBotIds: readonly string[],
): BotGroupWaitingRoomVisitState | null {
  const eligibleBotIds = uniqueBotIds(validBotIds);
  if (eligibleBotIds.length < BOT_GROUP_WAITING_ROOM_MIN_BOTS) return null;
  if (
    eligibleBotIds.length === state.eligibleBotIds.length &&
    eligibleBotIds.every((botId, index) => state.eligibleBotIds[index] === botId)
  ) {
    return state;
  }
  return {
    ...state,
    eligibleBotIds,
  };
}

export function botGroupWaitingRoomSnapshot(
  state: BotGroupWaitingRoomVisitState,
): BotGroupWaitingRoomVisitSnapshot {
  return {
    groupId: state.groupId,
    visitSeed: state.visitSeed,
    eligibleBotIds: state.eligibleBotIds,
    draft: state.draft,
  };
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
