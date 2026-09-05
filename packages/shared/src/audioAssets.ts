export const AUDIO_ASSET_CATEGORIES_V1 = [
  "music",
  "effects",
  "ambience",
] as const;

export type AudioAssetCategoryV1 =
  (typeof AUDIO_ASSET_CATEGORIES_V1)[number];

export const AUDIO_ASSET_SCOPES_V1 = [
  "universal",
  "theme",
  "identity",
] as const;

export type AudioAssetScopeV1 = (typeof AUDIO_ASSET_SCOPES_V1)[number];
export type AudioAssetStatusV1 =
  | "candidate"
  | "accepted"
  | "discarded";
export type AudioAssetSourceV1 =
  | "generated"
  | "uploaded"
  | "legacy"
  | "prism";
export type AudioAssetSafetyV1 =
  | "nonsemantic"
  | "stage_cue_required";

export interface AudioAssetTechnicalV1 {
  mimeType: string;
  byteSize: number;
  durationMs: number | null;
  sampleRateHz: number | null;
  channels: number | null;
  loopable: boolean;
}

export interface AudioAssetProvenanceV1 {
  applet: string;
  provider: string | null;
  model: string | null;
  promptContractHash: string | null;
  createdAt: string;
}

/** Canonical metadata for non-voice audio shared across PRISM applets. */
export interface AudioAssetV1 {
  version: 1;
  id: string;
  category: AudioAssetCategoryV1;
  scope: AudioAssetScopeV1;
  status: AudioAssetStatusV1;
  source: AudioAssetSourceV1;
  title: string;
  description: string;
  semanticRole: string;
  automaticTags: string[];
  playerTags: string[];
  context: Record<string, string>;
  safety: AudioAssetSafetyV1;
  contentSha256: string | null;
  technical: AudioAssetTechnicalV1;
  provenance: AudioAssetProvenanceV1;
  usageCount: number;
  lastAccessedAt: string | null;
}

export interface AudioUsageRefV1 {
  version: 1;
  assetId: string;
  ownerType: string;
  ownerId: string;
  role: string;
  active: boolean;
  createdAt: string;
}

/** A server-authored, sealed request for an existing asset or new synthesis. */
export interface AudioNeedV1 {
  version: 1;
  category: AudioAssetCategoryV1;
  semanticRole: string;
  requiredTags: string[];
  preferredTags: string[];
  allowedScopes: AudioAssetScopeV1[];
  applet: string;
  context: Record<string, string>;
  durationMs?: { min: number; max: number } | null;
  loopable?: boolean | null;
  stageCueAuthorized: boolean;
}

export interface AudioReuseDecisionV1 {
  version: 1;
  action: "reuse" | "preview" | "generate";
  assetId: string | null;
  score: number;
  reasons: string[];
}

function normalizedToken(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function normalizedTags(values: readonly string[]): Set<string> {
  return new Set(values.map(normalizedToken).filter(Boolean));
}

function contextCompatible(
  need: Readonly<Record<string, string>>,
  asset: Readonly<Record<string, string>>,
): boolean {
  return Object.entries(need).every(([key, value]) => {
    const expected = normalizedToken(value);
    const actual = normalizedToken(asset[key] ?? "");
    return !expected || !actual || expected === actual;
  });
}

function scoreAudioAssetV1(need: AudioNeedV1, asset: AudioAssetV1): number {
  const required = normalizedTags(need.requiredTags);
  const preferred = normalizedTags(need.preferredTags);
  const available = normalizedTags([
    ...asset.automaticTags,
    ...asset.playerTags,
  ]);
  let score = 80;
  for (const tag of required) if (available.has(tag)) score += 3;
  for (const tag of preferred) if (available.has(tag)) score += 1;
  if (asset.provenance.applet === need.applet) score += 2;
  score += Math.min(5, asset.usageCount);
  return score;
}

function audioAssetSatisfiesNeedV1(
  need: AudioNeedV1,
  asset: AudioAssetV1,
): boolean {
  if (asset.status !== "accepted" || asset.category !== need.category) return false;
  if (!need.allowedScopes.includes(asset.scope)) return false;
  if (normalizedToken(asset.semanticRole) !== normalizedToken(need.semanticRole)) {
    return false;
  }
  if (asset.safety === "stage_cue_required" && !need.stageCueAuthorized) {
    return false;
  }
  const available = normalizedTags([
    ...asset.automaticTags,
    ...asset.playerTags,
  ]);
  for (const required of normalizedTags(need.requiredTags)) {
    if (!available.has(required)) return false;
  }
  if (!contextCompatible(need.context, asset.context)) return false;
  if (need.loopable === true && !asset.technical.loopable) return false;
  if (need.durationMs && asset.technical.durationMs !== null) {
    if (
      asset.technical.durationMs < need.durationMs.min ||
      asset.technical.durationMs > need.durationMs.max
    ) return false;
  }
  return true;
}

/**
 * Deterministic reuse gate. A model may rank the returned compatible shortlist
 * elsewhere, but cannot broaden it or authorize automatic reuse.
 */
export function decideAudioReuseV1(
  need: AudioNeedV1,
  assets: readonly AudioAssetV1[],
): AudioReuseDecisionV1 {
  const candidates = assets
    .filter((asset) => audioAssetSatisfiesNeedV1(need, asset))
    .map((asset) => ({ asset, score: scoreAudioAssetV1(need, asset) }))
    .sort((left, right) =>
      right.score - left.score || left.asset.id.localeCompare(right.asset.id),
    );
  const best = candidates[0];
  if (!best) {
    return {
      version: 1,
      action: "generate",
      assetId: null,
      score: 0,
      reasons: ["No accepted asset satisfied every sealed constraint."],
    };
  }
  if (
    best.asset.scope === "universal" &&
    best.asset.safety === "nonsemantic" &&
    best.score >= 80
  ) {
    return {
      version: 1,
      action: "reuse",
      assetId: best.asset.id,
      score: best.score,
      reasons: ["Exact accepted universal match."],
    };
  }
  return {
    version: 1,
    action: "preview",
    assetId: best.asset.id,
    score: best.score,
    reasons: ["Compatible themed or identity audio requires explicit acceptance."],
  };
}

export function isAudioAssetCategoryV1(
  value: unknown,
): value is AudioAssetCategoryV1 {
  return AUDIO_ASSET_CATEGORIES_V1.includes(value as AudioAssetCategoryV1);
}
