export type BotGroupImageBubbleVariant = "compact" | "waiting";

export interface BotGroupImageBubbleViewport {
  width: number;
  height: number;
}

export interface BotGroupImageBubbleRecord {
  id: string;
  botId?: string | null;
  createdAt?: string | null;
  displayUrl?: string | null;
  hasLocalFile?: boolean;
  purpose?: string | null;
}

export interface BotGroupImageBubbleOccupiedPresence {
  botId: string;
  role: "anchor" | "roamer";
  xPercent: number;
  yPercent: number;
  scale: number;
}

export interface BotGroupImageBubblePlacement {
  imageId: string;
  botId: string;
  xPercent: number;
  yPercent: number;
  sizePx: number;
  tiltDeg: number;
  floatDelayMs: number;
  floatDurationMs: number;
}

/**
 * Buckets live resize noise into the only layout bands the bubble planner
 * actually uses. This keeps one visit visually stable while the desktop shell
 * reports dozens of intermediate viewport sizes.
 */
export function botGroupImageBubbleLayoutViewport(
  viewport: BotGroupImageBubbleViewport,
): BotGroupImageBubbleViewport {
  const width = Number.isFinite(viewport.width) ? viewport.width : 0;
  const height = Number.isFinite(viewport.height) ? viewport.height : 0;
  return {
    width: width < 900 ? 800 : width < 1440 ? 1280 : 1600,
    height: height < 760 ? 700 : 900,
  };
}

interface BubbleSlot {
  id: string;
  xPercent: number;
  yPercent: number;
  sizePx: number;
}

const COMPACT_WIDE_SLOTS: readonly BubbleSlot[] = [
  { id: "top-left", xPercent: 28, yPercent: 7, sizePx: 54 },
  { id: "left-upper", xPercent: 7, yPercent: 30, sizePx: 72 },
  { id: "right-upper", xPercent: 93, yPercent: 30, sizePx: 68 },
  { id: "left-lower", xPercent: 8, yPercent: 72, sizePx: 58 },
  { id: "right-lower", xPercent: 92, yPercent: 72, sizePx: 62 },
  { id: "bottom-right", xPercent: 72, yPercent: 93, sizePx: 56 },
] as const;

const COMPACT_NARROW_SLOTS: readonly BubbleSlot[] = [
  { id: "top-left", xPercent: 17, yPercent: 7, sizePx: 44 },
  { id: "top-right", xPercent: 83, yPercent: 7, sizePx: 44 },
  { id: "bottom-left", xPercent: 27, yPercent: 93, sizePx: 44 },
  { id: "bottom-right", xPercent: 73, yPercent: 93, sizePx: 46 },
] as const;

const WAITING_SLOTS: readonly BubbleSlot[] = [
  { id: "far-left", xPercent: 6, yPercent: 14, sizePx: 58 },
  { id: "left", xPercent: 25, yPercent: 13, sizePx: 52 },
  { id: "right", xPercent: 75, yPercent: 13, sizePx: 56 },
  { id: "far-right", xPercent: 94, yPercent: 14, sizePx: 54 },
  { id: "upper-left", xPercent: 10, yPercent: 31, sizePx: 46 },
  { id: "upper-right", xPercent: 90, yPercent: 31, sizePx: 48 },
] as const;

function stableHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableOrder<T>(
  values: readonly T[],
  seed: string,
  key: (value: T) => string,
): T[] {
  return values
    .map((value) => ({
      value,
      stableKey: key(value),
      score: stableHash(`${seed}:${key(value)}`),
    }))
    .sort(
      (left, right) =>
        left.score - right.score ||
        left.stableKey.localeCompare(right.stableKey),
    )
    .map(({ value }) => value);
}

function desiredBubbleCount(
  variant: BotGroupImageBubbleVariant,
  viewport: BotGroupImageBubbleViewport,
): number {
  if (variant === "compact") {
    if (viewport.width >= 1440 && viewport.height >= 760) return 6;
    return 4;
  }
  if (viewport.width >= 1440 && viewport.height >= 760) return 4;
  return 2;
}

function eligibleImages({
  images,
  memberBotIds,
  excludedImageIds,
}: {
  images: readonly BotGroupImageBubbleRecord[];
  memberBotIds: readonly string[];
  excludedImageIds: ReadonlySet<string>;
}): Array<BotGroupImageBubbleRecord & { id: string; botId: string }> {
  const members = new Set(
    memberBotIds.map((botId) => botId.trim()).filter(Boolean),
  );
  const seen = new Set<string>();
  const eligible: Array<
    BotGroupImageBubbleRecord & { id: string; botId: string }
  > = [];
  for (const image of images) {
    const id = image.id?.trim();
    const botId = image.botId?.trim();
    if (
      !id ||
      !botId ||
      seen.has(id) ||
      !members.has(botId) ||
      excludedImageIds.has(id) ||
      image.hasLocalFile !== true ||
      (image.purpose ?? "gallery") !== "gallery"
    ) {
      continue;
    }
    seen.add(id);
    eligible.push({ ...image, id, botId });
  }
  return eligible;
}

function balancedImageSelection({
  images,
  count,
  seed,
}: {
  images: readonly (BotGroupImageBubbleRecord & {
    id: string;
    botId: string;
  })[];
  count: number;
  seed: string;
}): Array<BotGroupImageBubbleRecord & { id: string; botId: string }> {
  const byBot = new Map<
    string,
    Array<BotGroupImageBubbleRecord & { id: string; botId: string }>
  >();
  for (const image of images) {
    const pool = byBot.get(image.botId) ?? [];
    pool.push(image);
    byBot.set(image.botId, pool);
  }
  const orderedBotIds = stableOrder(
    [...byBot.keys()],
    `${seed}:bots`,
    (botId) => botId,
  );
  for (const botId of orderedBotIds) {
    byBot.set(
      botId,
      (byBot.get(botId) ?? []).slice().sort((left, right) => {
        const newestFirst = String(right.createdAt ?? "").localeCompare(
          String(left.createdAt ?? ""),
        );
        if (newestFirst !== 0) return newestFirst;
        const leftScore = stableHash(`${seed}:images:${botId}:${left.id}`);
        const rightScore = stableHash(`${seed}:images:${botId}:${right.id}`);
        return leftScore - rightScore || left.id.localeCompare(right.id);
      }),
    );
  }
  const selected: Array<
    BotGroupImageBubbleRecord & { id: string; botId: string }
  > = [];
  let round = 0;
  while (selected.length < count) {
    let added = false;
    for (const botId of orderedBotIds) {
      const image = byBot.get(botId)?.[round];
      if (!image) continue;
      selected.push(image);
      added = true;
      if (selected.length >= count) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected;
}

function waitingSurfaceSize(
  viewport: BotGroupImageBubbleViewport,
): BotGroupImageBubbleViewport {
  return {
    width: Math.min(1120, Math.max(0, viewport.width - 20)),
    height: Math.min(520, Math.max(280, viewport.height - 400)),
  };
}

function clamped(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function presenceDiameterPx(
  presence: BotGroupImageBubbleOccupiedPresence,
  viewportWidth: number,
): number {
  const base =
    presence.role === "anchor"
      ? clamped(viewportWidth * 0.098, 112, 152)
      : clamped(viewportWidth * 0.068, 76, 104);
  return base * clamped(presence.scale, 0.5, 1.25);
}

function waitingSlotIsClear(
  slot: BubbleSlot,
  viewport: BotGroupImageBubbleViewport,
  occupiedPresences: readonly BotGroupImageBubbleOccupiedPresence[],
): boolean {
  const surface = waitingSurfaceSize(viewport);
  if (surface.width <= 0 || surface.height <= 0) return false;
  const bubbleRadius = slot.sizePx / 2;
  const focusAndShadowInset = 8;
  const centerX = (slot.xPercent / 100) * surface.width;
  const centerY = (slot.yPercent / 100) * surface.height;
  if (
    centerX - bubbleRadius - focusAndShadowInset < 0 ||
    centerX + bubbleRadius + focusAndShadowInset > surface.width ||
    centerY - bubbleRadius - focusAndShadowInset < 0 ||
    centerY + bubbleRadius + focusAndShadowInset > surface.height
  ) {
    return false;
  }
  return occupiedPresences.every((presence) => {
    const dx =
      ((slot.xPercent - presence.xPercent) / 100) * surface.width;
    const dy =
      ((slot.yPercent - presence.yPercent) / 100) * surface.height;
    const presenceRadius =
      presenceDiameterPx(presence, viewport.width) / 2;
    return Math.hypot(dx, dy) >= bubbleRadius + presenceRadius + 12;
  });
}

function candidateSlots({
  variant,
  viewport,
  occupiedPresences,
  count,
}: {
  variant: BotGroupImageBubbleVariant;
  viewport: BotGroupImageBubbleViewport;
  occupiedPresences: readonly BotGroupImageBubbleOccupiedPresence[];
  count: number;
}): BubbleSlot[] {
  if (variant === "waiting") {
    const preferredIds =
      count >= 4
        ? ["far-left", "left", "right", "far-right"]
        : ["far-left", "far-right", "left", "right"];
    const rank = new Map(preferredIds.map((id, index) => [id, index]));
    return WAITING_SLOTS.filter((slot) =>
      waitingSlotIsClear(slot, viewport, occupiedPresences),
    ).sort(
      (left, right) =>
        (rank.get(left.id) ?? preferredIds.length) -
          (rank.get(right.id) ?? preferredIds.length) ||
        left.yPercent - right.yPercent ||
        left.xPercent - right.xPercent,
    );
  }
  if (viewport.width < 900) return COMPACT_NARROW_SLOTS.slice();
  if (count >= 6) return COMPACT_WIDE_SLOTS.slice();
  return COMPACT_WIDE_SLOTS.filter(
    (slot) =>
      slot.id === "left-upper" ||
      slot.id === "right-upper" ||
      slot.id === "left-lower" ||
      slot.id === "right-lower",
  );
}

export function botGroupImageBubblePlan({
  groupId,
  variant,
  viewport,
  memberBotIds,
  images,
  privateImageIds = [],
  failedImageIds = [],
  occupiedPresences = [],
}: {
  groupId: string;
  variant: BotGroupImageBubbleVariant;
  viewport: BotGroupImageBubbleViewport;
  memberBotIds: readonly string[];
  images: readonly BotGroupImageBubbleRecord[];
  privateImageIds?: readonly string[];
  failedImageIds?: readonly string[];
  occupiedPresences?: readonly BotGroupImageBubbleOccupiedPresence[];
}): BotGroupImageBubblePlacement[] {
  const normalizedGroupId = groupId.trim();
  if (
    !normalizedGroupId ||
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return [];
  }
  const excludedImageIds = new Set(
    [...privateImageIds, ...failedImageIds]
      .map((imageId) => imageId.trim())
      .filter(Boolean),
  );
  const count = desiredBubbleCount(variant, viewport);
  const normalizedMemberKey = Array.from(
    new Set(memberBotIds.map((botId) => botId.trim()).filter(Boolean)),
  )
    .sort()
    .join(":");
  const seed = `${normalizedGroupId}:${normalizedMemberKey}:${variant}`;
  const eligible = eligibleImages({
    images,
    memberBotIds,
    excludedImageIds,
  });
  const selected = balancedImageSelection({ images: eligible, count, seed });
  const slots = candidateSlots({
    variant,
    viewport,
    occupiedPresences,
    count,
  });
  const usableCount = Math.min(selected.length, slots.length);
  const chosenSlots = slots
    .slice(0, usableCount)
    .sort(
      (left, right) =>
        left.yPercent - right.yPercent || left.xPercent - right.xPercent,
    );
  return selected.slice(0, usableCount).map((image, index) => {
    const slot = chosenSlots[index]!;
    const motionSeed = `${seed}:${image.id}:${slot.id}`;
    return {
      imageId: image.id,
      botId: image.botId,
      xPercent: slot.xPercent,
      yPercent: slot.yPercent,
      sizePx: slot.sizePx,
      tiltDeg: (stableHash(`${motionSeed}:tilt`) % 11) - 5,
      floatDelayMs: -(stableHash(`${motionSeed}:delay`) % 5_000),
      floatDurationMs: 7_000 + (stableHash(`${motionSeed}:duration`) % 4_001),
    };
  });
}
