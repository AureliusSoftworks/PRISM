/** Bump when the reference normalization or geometry acceptance rules change.
 * A base hash identifies the exact stored gridless Mosaic bytes; referenceSha256
 * identifies the deterministic normalized PNG actually sent to the generator.
 * Checking the base hash and normalization version avoids decoding every room
 * during a read-only status poll. No player-facing state includes these fields. */
export const DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1 = Object.freeze({
  version: 2,
  referenceVersion: 6,
  minimumCorrelation: 0.78,
  minimumLandmarkCorrelation: 0.4,
});

export interface DebateMysteryRoomSourceLockV1 {
  version: number;
  referenceVersion: number;
  baseSha256: string;
  referenceSha256: string;
  candidateSha256: string;
  approved: boolean;
  frameMatches: boolean;
  correlation: number;
  detailCorrelation: number;
  landmarkCorrelation: number;
}

export interface DebateMysteryRoomPairRowV1 {
  status: "pending" | "ready" | "fallback";
  sha256: string | null;
  review_json: string;
}

const isHash = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const isCorrelation = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= -1 && value <= 1;

/** Only retain bounded, current, approved evidence in the private vault. */
export function normalizeDebateMysteryRoomSourceLockV1(value: unknown): DebateMysteryRoomSourceLockV1 | null {
  if (!value || typeof value !== "object") return null;
  const lock = value as Record<string, unknown>;
  const contract = DEBATE_MYSTERY_ROOM_ALIGNMENT_CONTRACT_V1;
  if (
    lock.version !== contract.version || lock.referenceVersion !== contract.referenceVersion ||
    !isHash(lock.baseSha256) || !isHash(lock.referenceSha256) || !isHash(lock.candidateSha256) ||
    lock.approved !== true || lock.frameMatches !== true ||
    !isCorrelation(lock.correlation) || lock.correlation < contract.minimumCorrelation ||
    !isCorrelation(lock.detailCorrelation) || lock.detailCorrelation < contract.minimumCorrelation ||
    !isCorrelation(lock.landmarkCorrelation) || lock.landmarkCorrelation < contract.minimumLandmarkCorrelation
  ) return null;
  return {
    version: contract.version,
    referenceVersion: contract.referenceVersion,
    baseSha256: lock.baseSha256,
    referenceSha256: lock.referenceSha256,
    candidateSha256: lock.candidateSha256,
    approved: true,
    frameMatches: true,
    correlation: lock.correlation,
    detailCorrelation: lock.detailCorrelation,
    landmarkCorrelation: lock.landmarkCorrelation,
  };
}

export function isDebateMysteryRoomArtPairReadyV1(
  base: DebateMysteryRoomPairRowV1 | null | undefined,
  derivative: DebateMysteryRoomPairRowV1 | null | undefined,
): boolean {
  if (base?.status !== "ready" || derivative?.status !== "ready" ||
      !isHash(base.sha256) || !isHash(derivative.sha256)) return false;
  let review: Record<string, unknown>;
  try {
    review = JSON.parse(derivative.review_json) as Record<string, unknown>;
    if (!review || typeof review !== "object" || Array.isArray(review)) return false;
  } catch { return false; }
  const lock = normalizeDebateMysteryRoomSourceLockV1(review.sourceLock);
  const vision = review.vision as { approved?: unknown } | null | undefined;
  return lock !== null && vision?.approved === true
    && lock.baseSha256 === base.sha256 && lock.candidateSha256 === derivative.sha256;
}

/** Recheck unversioned legacy pairs locally without changing stored bytes or
 * metadata. An explicit stale/rejected certificate is never bypassed. */
export async function locallyValidateLegacyDebateMysteryRoomPairV1(args: {
  base: DebateMysteryRoomPairRowV1 | undefined;
  derivative: DebateMysteryRoomPairRowV1 | undefined;
  validate: () => Promise<DebateMysteryRoomSourceLockV1 | null>;
}): Promise<DebateMysteryRoomPairRowV1 | undefined> {
  const { base, derivative } = args;
  if (isDebateMysteryRoomArtPairReadyV1(base, derivative) ||
      base?.status !== "ready" || derivative?.status !== "ready" ||
      !isHash(base.sha256) || !isHash(derivative.sha256)) return derivative;
  let review: Record<string, unknown>;
  try {
    review = JSON.parse(derivative.review_json);
    if (!review || typeof review !== "object" || Array.isArray(review) || "sourceLock" in review ||
        (review.vision as { approved?: boolean } | undefined)?.approved !== true) return derivative;
  } catch { return derivative; }
  const lock = normalizeDebateMysteryRoomSourceLockV1(await args.validate());
  if (!lock || lock.baseSha256 !== base.sha256 || lock.candidateSha256 !== derivative.sha256) return derivative;
  return { ...derivative, review_json: JSON.stringify({ ...review, sourceLock: lock }) };
}

/** Background continuation may create missing derivatives, but cannot silently
 * replace a pre-existing, unproven pair. A player's selected repair may. */
export function shouldPrepareDebateMysteryRoomUpgradeV1(args: {
  base: DebateMysteryRoomPairRowV1 | null | undefined;
  derivative: DebateMysteryRoomPairRowV1 | null | undefined;
  explicitlyRequested: boolean;
}): boolean {
  return args.base?.status === "ready"
    && !isDebateMysteryRoomArtPairReadyV1(args.base, args.derivative)
    && (args.derivative?.status !== "ready" || args.explicitlyRequested);
}

export function assertDebateMysteryRoomSourceUnchangedV1(
  base: DebateMysteryRoomPairRowV1 | null | undefined,
  sourceSha256: string,
): void {
  if (base?.status !== "ready" || !isHash(sourceSha256) || base.sha256 !== sourceSha256) {
    throw new Error("The Mosaic changed while its Upgraded derivative was preparing. Retry this room's upgrade.");
  }
}
