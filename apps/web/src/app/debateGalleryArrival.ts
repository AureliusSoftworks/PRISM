/**
 * Progress-coupled gallery seat trickle for Spectator pre-bake.
 * Player seat stays put; everyone else walks in from alternating aisles.
 */

/** Soft seat drip while bake progress stalls (ms between seats). */
export const DEBATE_GALLERY_ARRIVAL_LINGER_INTERVAL_MS = 2_200;

/**
 * Post-unlock seat pace. Stay rhythmic — never dump the remaining house in a
 * single burst (the old 140ms hurry read as a pop-in).
 */
export const DEBATE_GALLERY_ARRIVAL_HURRY_INTERVAL_MS = 900;

/** Quiet beat after the last seat lands before Gallery ready. */
export const DEBATE_GALLERY_ARRIVAL_SETTLE_MS = 520;

/** Participant / title-card load fade when seats did not walk in first. */
export const DEBATE_GALLERY_OPENING_MURMUR_FADE_MS = 3_800;

export type DebateGalleryArrivalSeat = {
  index: number;
  walkXPercent: number;
  isPlayer: boolean;
};

/**
 * Alternating left/right reveal order from walk-X sign. Player seats omitted.
 */
export function debateGalleryArrivalRevealOrder(
  seats: ReadonlyArray<DebateGalleryArrivalSeat>,
): number[] {
  const candidates = seats.filter((seat) => !seat.isPlayer);
  const left = candidates
    .filter((seat) => seat.walkXPercent < 0)
    .sort((a, b) => a.index - b.index);
  const right = candidates
    .filter((seat) => seat.walkXPercent >= 0)
    .sort((a, b) => a.index - b.index);
  const order: number[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let takeLeft = true;
  while (leftIndex < left.length || rightIndex < right.length) {
    if (takeLeft && leftIndex < left.length) {
      order.push(left[leftIndex++]!.index);
    } else if (!takeLeft && rightIndex < right.length) {
      order.push(right[rightIndex++]!.index);
    } else if (leftIndex < left.length) {
      order.push(left[leftIndex++]!.index);
    } else if (rightIndex < right.length) {
      order.push(right[rightIndex++]!.index);
    }
    takeLeft = !takeLeft;
  }
  return order;
}

export type DebateGalleryArrivalRevealResult = {
  /** How many non-player seats in reveal order are visible. */
  revealedCount: number;
  /** All seats in, settle finished, bake unlocked — ready for Start. */
  arrivalComplete: boolean;
};

/**
 * Map bake progress + time onto how many gallery walk-ins have happened.
 * Never completes until bakeUnlocked; then hurries remaining seats and settles.
 */
export function debateGalleryArrivalRevealedCount(args: {
  nonPlayerCount: number;
  progressRatio: number | null;
  bakeUnlocked: boolean;
  elapsedMs: number;
  unlockElapsedMs: number;
}): DebateGalleryArrivalRevealResult {
  const n = Math.max(0, Math.floor(args.nonPlayerCount));
  if (n === 0) {
    return {
      revealedCount: 0,
      arrivalComplete:
        args.bakeUnlocked &&
        args.unlockElapsedMs >= DEBATE_GALLERY_ARRIVAL_SETTLE_MS,
    };
  }

  const progress =
    args.progressRatio == null
      ? 0
      : Math.min(1, Math.max(0, args.progressRatio));
  const progressFill = Math.floor(progress * n);
  const lingerFill = Math.floor(
    Math.max(0, args.elapsedMs) / DEBATE_GALLERY_ARRIVAL_LINGER_INTERVAL_MS,
  );
  const soft = Math.max(progressFill, lingerFill);

  if (!args.bakeUnlocked) {
    return {
      revealedCount: Math.min(n - 1, soft),
      arrivalComplete: false,
    };
  }

  const baseline = Math.min(n, soft);
  const hurry = Math.floor(
    Math.max(0, args.unlockElapsedMs) /
      DEBATE_GALLERY_ARRIVAL_HURRY_INTERVAL_MS,
  );
  const revealedCount = Math.min(n, baseline + hurry);
  const hurryNeededMs =
    Math.max(0, n - baseline) * DEBATE_GALLERY_ARRIVAL_HURRY_INTERVAL_MS;
  const arrivalComplete =
    revealedCount >= n &&
    args.unlockElapsedMs >= hurryNeededMs + DEBATE_GALLERY_ARRIVAL_SETTLE_MS;

  return { revealedCount, arrivalComplete };
}

/** Whether a seat index should paint as arrived given reveal order + count. */
export function debateGallerySeatHasArrived(args: {
  seatIndex: number;
  isPlayer: boolean;
  revealOrder: ReadonlyArray<number>;
  revealedCount: number;
}): boolean {
  if (args.isPlayer) return true;
  const orderIndex = args.revealOrder.indexOf(args.seatIndex);
  if (orderIndex < 0) return true;
  return orderIndex < args.revealedCount;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Continuous 0–1 house fill while seats walk in. Uses the same linger / hurry
 * clocks as the visible reveal, but keeps the fractional progress between
 * seats so the murmur can glide instead of jumping.
 */
export function debateGalleryArrivalFillRatio(args: {
  nonPlayerCount: number;
  progressRatio: number | null;
  bakeUnlocked: boolean;
  elapsedMs: number;
  unlockElapsedMs: number;
}): number {
  const n = Math.max(0, Math.floor(args.nonPlayerCount));
  if (n <= 0) return args.bakeUnlocked ? 1 : 0;

  const progress = clampUnit(args.progressRatio ?? 0);
  const progressFill = progress * n;
  const lingerFill =
    Math.max(0, args.elapsedMs) / DEBATE_GALLERY_ARRIVAL_LINGER_INTERVAL_MS;
  const soft = Math.max(progressFill, lingerFill);

  if (!args.bakeUnlocked) {
    return Math.min((n - 1) / n, soft / n);
  }

  const baseline = Math.min(n, soft);
  const hurry =
    Math.max(0, args.unlockElapsedMs) / DEBATE_GALLERY_ARRIVAL_HURRY_INTERVAL_MS;
  return Math.min(1, (baseline + hurry) / n);
}

/**
 * Ease-in murmur so an empty house stays nearly silent and the room gathers
 * as people take their seats. Player seat does not advance the ramp.
 */
export function debateGalleryArrivalMurmurGain(args: {
  revealedCount: number;
  nonPlayerCount: number;
  fillRatio?: number;
}): number {
  const nonPlayer = Math.max(0, Math.floor(args.nonPlayerCount));
  if (nonPlayer <= 0) return 1;
  const linear =
    args.fillRatio == null
      ? Math.min(
          1,
          Math.max(0, Math.floor(args.revealedCount)) / nonPlayer,
        )
      : clampUnit(args.fillRatio);
  return linear * linear;
}

/** Ease-in fade when the chamber loads without a seat walk-in. */
export function debateGalleryOpeningMurmurGain(elapsedMs: number): number {
  const linear = clampUnit(elapsedMs / DEBATE_GALLERY_OPENING_MURMUR_FADE_MS);
  return linear * linear;
}
