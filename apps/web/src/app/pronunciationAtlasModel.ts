import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  VOICE_ACCENT_MAP_ANCHORS,
  normalizeBotAudioVoiceProfileV1,
  normalizeLocalVoicePronunciationBase,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  normalizeVoiceAccentDefinitionId,
  resolveLocalAccentFallback,
  resolveLocalVoicePronunciationLocale,
  resolveVoiceAccentField,
  voiceAccentDefinitionForId,
  voiceAccentMapPointForCoordinates,
  type BotAudioVoiceProfileV1,
  type LocalVoicePronunciationBase,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
  type NormalizedBotAudioVoiceProfileV1,
  type VoiceAccentDefinitionId,
  type VoiceAccentMapAnchorV1,
} from "@localai/shared";

import type {
  AdjustmentPadDirection,
  AdjustmentPadPoint,
} from "./adjustmentPadModel";

export interface PronunciationAtlasSelection {
  pronunciationBase: LocalVoicePronunciationBase;
  sourceLocale: string;
  influence: LocalVoiceSpeechprintInfluence;
  strength: LocalVoiceSpeechprintStrength;
  accentDefinitionId?: VoiceAccentDefinitionId | null;
  /** The pin's exact normalized position; absent only for legacy profiles. */
  point?: AdjustmentPadPoint;
}

export type PronunciationAtlasAnchor = VoiceAccentMapAnchorV1;

export interface PronunciationAtlasCandidate {
  id: string;
  label: string;
  selection: PronunciationAtlasSelection;
}

function speechprintVariationSeed(
  profile: NormalizedBotAudioVoiceProfileV1,
  influence: LocalVoiceSpeechprintInfluence,
): string {
  if (
    influence !== "none" &&
    profile.speechprintInfluence === influence &&
    profile.speechprintVariationSeed &&
    profile.speechprintVariationSeed !== "natural-v1"
  ) {
    return profile.speechprintVariationSeed;
  }
  if (influence === "none") return "natural-v1";
  const entropy =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${profile.baseVoiceId}-${Date.now().toString(36)}`;
  return `${influence}:${entropy}`.slice(0, 64);
}

export function pronunciationAtlasSelectionForProfile(
  profile: BotAudioVoiceProfileV1,
): PronunciationAtlasSelection {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return {
    pronunciationBase: normalized.pronunciationBase ?? "follow-voice",
    sourceLocale: normalized.accentLocale ?? "en-US",
    influence: normalized.speechprintInfluence ?? "none",
    strength: normalized.speechprintStrength ?? "balanced",
    accentDefinitionId: normalized.accentDefinitionId ?? null,
    ...(normalized.pronunciationMapPoint
      ? { point: { ...normalized.pronunciationMapPoint } }
      : {}),
  };
}

/**
 * The Avatar Studio commit boundary. Named candidate IDs stay non-null and
 * therefore exact; only a freely placed point carries a null definition into
 * both Local and Premium synthesis.
 */
export function profileWithPronunciationAtlasSelection(
  profile: BotAudioVoiceProfileV1,
  selection: PronunciationAtlasSelection,
): NormalizedBotAudioVoiceProfileV1 {
  const normalizedProfile = normalizeBotAudioVoiceProfileV1(profile);
  const normalizedSelection = normalizePronunciationAtlasSelection(selection);
  const localAccent = resolveLocalAccentFallback({
    accentDefinitionId: normalizedSelection.accentDefinitionId,
    pronunciationBase: normalizedSelection.pronunciationBase,
    speechprintInfluence: normalizedSelection.influence,
  });
  return normalizeBotAudioVoiceProfileV1({
    ...normalizedProfile,
    pronunciationBase: localAccent.pronunciationBase,
    accentLocale: normalizedSelection.sourceLocale,
    speechprintInfluence: localAccent.speechprintInfluence,
    speechprintStrength: normalizedSelection.strength,
    accentDefinitionId: normalizedSelection.accentDefinitionId ?? null,
    pronunciationMapPoint: normalizedSelection.point ?? null,
    speechprintVariationSeed: speechprintVariationSeed(
      normalizedProfile,
      localAccent.speechprintInfluence,
    ),
  });
}

/**
 * Projects geographic coordinates into the same full-frame equirectangular
 * space used by the Accent Map artwork and pointer pad.
 */
export function pronunciationAtlasPointForCoordinates(
  longitudeDegrees: number,
  latitudeDegrees: number,
): AdjustmentPadPoint {
  return voiceAccentMapPointForCoordinates(longitudeDegrees, latitudeDegrees);
}

export const PRONUNCIATION_ATLAS_ANCHORS: readonly PronunciationAtlasAnchor[] =
  VOICE_ACCENT_MAP_ANCHORS;

/**
 * A lens is a square window onto the unit map: the pad, artwork, and pointer
 * precision all zoom into it while every stored pin stays in global map
 * space. Squares preserve the 2:1 equirectangular display aspect, and the
 * lens itself is ephemeral view state — never part of the saved selection.
 */
export interface PronunciationAtlasLens {
  id: string;
  label: string;
  /** Top-left corner in unit map space. */
  x: number;
  y: number;
  /** Edge length in unit map space; 1 is the whole world. */
  size: number;
}

function pronunciationAtlasLensFromCoordinates(
  id: string,
  label: string,
  westDegrees: number,
  southDegrees: number,
  eastDegrees: number,
  northDegrees: number,
): PronunciationAtlasLens {
  const topLeft = pronunciationAtlasPointForCoordinates(
    westDegrees,
    northDegrees,
  );
  const bottomRight = pronunciationAtlasPointForCoordinates(
    eastDegrees,
    southDegrees,
  );
  const size = Math.max(bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
  return {
    id,
    label,
    x: Math.max(
      0,
      Math.min(1 - size, topLeft.x + (bottomRight.x - topLeft.x) / 2 - size / 2),
    ),
    y: Math.max(
      0,
      Math.min(1 - size, topLeft.y + (bottomRight.y - topLeft.y) / 2 - size / 2),
    ),
    size,
  };
}

/**
 * Ordered broad-to-narrow within each hemisphere so adjacent chips read as
 * drill levels (N. America → US East → New York). The tuned boxes guarantee
 * that every pair of distinct anchor locations closer than 24px at world
 * zoom is separated to at least 24px by some lens containing both — pinned
 * by pronunciationAtlas.test.ts, so a growing catalog keeps its elbow room.
 */
export const PRONUNCIATION_ATLAS_LENSES: readonly PronunciationAtlasLens[] = [
  { id: "world", label: "World", x: 0, y: 0, size: 1 },
  pronunciationAtlasLensFromCoordinates(
    "north-america",
    "N. America",
    -127,
    14,
    -60,
    52,
  ),
  pronunciationAtlasLensFromCoordinates(
    "us-east",
    "US East",
    -92,
    24.5,
    -66,
    46.5,
  ),
  pronunciationAtlasLensFromCoordinates(
    "us-northeast",
    "Northeast US",
    -77.5,
    38.8,
    -69.5,
    44.2,
  ),
  pronunciationAtlasLensFromCoordinates(
    "south-america",
    "S. America",
    -82,
    -35,
    -34,
    13,
  ),
  pronunciationAtlasLensFromCoordinates(
    "isles",
    "The Isles",
    -11.8,
    50,
    3.6,
    58.2,
  ),
  pronunciationAtlasLensFromCoordinates(
    "europe",
    "Europe",
    -11.5,
    35.5,
    33,
    60.5,
  ),
  pronunciationAtlasLensFromCoordinates(
    "scandinavia",
    "Scandinavia",
    3.5,
    54.3,
    32,
    71.5,
  ),
  pronunciationAtlasLensFromCoordinates(
    "mediterranean",
    "Mediterranean",
    -10,
    29.5,
    33,
    44.5,
  ),
  pronunciationAtlasLensFromCoordinates(
    "eastern-europe",
    "E. Europe",
    19,
    42,
    47,
    60,
  ),
  pronunciationAtlasLensFromCoordinates(
    "africa-mideast",
    "Africa & Mideast",
    -18,
    -35,
    60,
    40,
  ),
  pronunciationAtlasLensFromCoordinates("south-asia", "S. Asia", 66, 4, 94, 36),
  pronunciationAtlasLensFromCoordinates(
    "east-asia",
    "E. Asia",
    95,
    -11,
    145,
    42,
  ),
  pronunciationAtlasLensFromCoordinates(
    "northeast-asia",
    "Northeast Asia",
    110.2,
    24.7,
    144.9,
    41.9,
  ),
  pronunciationAtlasLensFromCoordinates(
    "southeast-asia",
    "Southeast Asia",
    98,
    -11,
    141,
    23,
  ),
  pronunciationAtlasLensFromCoordinates(
    "oceania",
    "Oceania",
    112,
    -48,
    180,
    -8,
  ),
];

export function pronunciationAtlasLensForId(
  value: unknown,
): PronunciationAtlasLens {
  return (
    PRONUNCIATION_ATLAS_LENSES.find((lens) => lens.id === value) ??
    PRONUNCIATION_ATLAS_LENSES[0]!
  );
}

/** Global map point → lens display point. Unclamped so an off-lens pin
 * presents at the pad edge in its true direction. */
export function projectPronunciationAtlasPointIntoLens(
  point: AdjustmentPadPoint,
  lens: PronunciationAtlasLens,
): AdjustmentPadPoint {
  return {
    x: (point.x - lens.x) / lens.size,
    y: (point.y - lens.y) / lens.size,
  };
}

/** Lens display point → global map point, clamped to the map. */
export function pronunciationAtlasPointFromLensProjection(
  point: AdjustmentPadPoint,
  lens: PronunciationAtlasLens,
): AdjustmentPadPoint {
  return clampPronunciationAtlasPoint({
    x: lens.x + point.x * lens.size,
    y: lens.y + point.y * lens.size,
  });
}

export function pronunciationAtlasLensContainsPoint(
  point: AdjustmentPadPoint,
  lens: PronunciationAtlasLens,
): boolean {
  return (
    point.x >= lens.x &&
    point.x <= lens.x + lens.size &&
    point.y >= lens.y &&
    point.y <= lens.y + lens.size
  );
}

/**
 * The deeper lenses whose windows sit fully inside the given lens — the
 * "you can drill further here" marks a zoomed view paints as footprints
 * (N. America shows US East and New York; US East shows New York). The
 * world never marks footprints permanently: eight rectangles over the whole
 * map would be clutter, so at world zoom footprints appear only while a
 * lens chip is hovered or focused.
 */
export function pronunciationAtlasLensesWithin(
  lens: PronunciationAtlasLens,
): readonly PronunciationAtlasLens[] {
  if (lens.size >= 1) return [];
  return PRONUNCIATION_ATLAS_LENSES.filter(
    (candidate) =>
      candidate.id !== lens.id &&
      candidate.size < lens.size &&
      candidate.x >= lens.x - 1e-9 &&
      candidate.y >= lens.y - 1e-9 &&
      candidate.x + candidate.size <= lens.x + lens.size + 1e-9 &&
      candidate.y + candidate.size <= lens.y + lens.size + 1e-9,
  );
}

/**
 * The lenses one click can drill into from the given view. The world offers
 * every top-level lens (those not nested inside another); a zoomed view
 * offers its contained lenses. These are the map's own click targets — the
 * world view is navigation-only, so its regions must always be visible.
 */
export function pronunciationAtlasDrillCandidates(
  lens: PronunciationAtlasLens,
): readonly PronunciationAtlasLens[] {
  if (lens.size < 1) return pronunciationAtlasLensesWithin(lens);
  return PRONUNCIATION_ATLAS_LENSES.filter(
    (candidate) =>
      candidate.size < 1 &&
      !PRONUNCIATION_ATLAS_LENSES.some(
        (parent) =>
          parent.size < 1 &&
          parent.id !== candidate.id &&
          candidate.size < parent.size &&
          candidate.x >= parent.x - 1e-9 &&
          candidate.y >= parent.y - 1e-9 &&
          candidate.x + candidate.size <= parent.x + parent.size + 1e-9 &&
          candidate.y + candidate.size <= parent.y + parent.size + 1e-9,
      ),
  );
}

/** The broadest one-level drill target whose window covers the point. */
export function pronunciationAtlasDrillLensAtPoint(
  point: AdjustmentPadPoint,
  within: PronunciationAtlasLens,
): PronunciationAtlasLens | null {
  const containing = pronunciationAtlasDrillCandidates(within).filter(
    (candidate) => pronunciationAtlasLensContainsPoint(point, candidate),
  );
  if (containing.length === 0) return null;
  return [...containing].sort((left, right) => right.size - left.size)[0]!;
}

/**
 * The drill target nearest the point, for open-ocean world clicks: the world
 * view never places a pin, so every click must lead somewhere.
 */
export function pronunciationAtlasNearestDrillLens(
  point: AdjustmentPadPoint,
  within: PronunciationAtlasLens,
): PronunciationAtlasLens | null {
  const candidates = pronunciationAtlasDrillCandidates(within);
  if (candidates.length === 0) return null;
  return [...candidates].sort((left, right) => {
    const leftCenter = {
      x: left.x + left.size / 2,
      y: left.y + left.size / 2,
    };
    const rightCenter = {
      x: right.x + right.size / 2,
      y: right.y + right.size / 2,
    };
    return (
      squaredDistance(point, leftCenter) - squaredDistance(point, rightCenter)
    );
  })[0]!;
}

/**
 * Explicit co-located variants (the London group) surfaced inside the lens
 * that contains them. Chips appear only after drilling in, replacing the old
 * always-on Nearby list: variants stay explicit choices, never inferred from
 * a click location.
 */
export function pronunciationAtlasVariantCandidatesInLens(
  lens: PronunciationAtlasLens,
  current: PronunciationAtlasSelection,
): readonly PronunciationAtlasCandidate[] {
  if (lens.size >= 1) return [];
  const normalized = normalizePronunciationAtlasSelection(current);
  return PRONUNCIATION_ATLAS_ANCHORS.filter(
    (anchor) =>
      anchor.variantGroup &&
      pronunciationAtlasLensContainsPoint(anchor.point, lens),
  ).map((anchor) => ({
    id: anchor.id,
    label: pronunciationAtlasAnchorLabel(anchor),
    selection: selectionForPronunciationAtlasAnchor(
      anchor,
      normalized,
      anchor.point,
    ),
  }));
}

function squaredDistance(
  left: AdjustmentPadPoint,
  right: AdjustmentPadPoint,
): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function clampPronunciationAtlasPoint(
  point: AdjustmentPadPoint,
): AdjustmentPadPoint {
  return {
    x: Math.max(0, Math.min(1, point.x)),
    y: Math.max(0, Math.min(1, point.y)),
  };
}

export function normalizePronunciationAtlasSelection(
  selection: PronunciationAtlasSelection,
): PronunciationAtlasSelection {
  const accentDefinitionId = normalizeVoiceAccentDefinitionId(
    selection.accentDefinitionId,
  );
  return {
    pronunciationBase: normalizeLocalVoicePronunciationBase(
      selection.pronunciationBase,
    ),
    sourceLocale: selection.sourceLocale,
    influence: normalizeLocalVoiceSpeechprintInfluence(selection.influence),
    strength: normalizeLocalVoiceSpeechprintStrength(selection.strength),
    ...(accentDefinitionId
      ? { accentDefinitionId }
      : selection.accentDefinitionId === null
        ? { accentDefinitionId: null }
        : {}),
    ...(selection.point
      ? { point: clampPronunciationAtlasPoint(selection.point) }
      : {}),
  };
}

export function pronunciationAtlasSelectionKey(
  selection: PronunciationAtlasSelection,
): string {
  const normalized = normalizePronunciationAtlasSelection(selection);
  return [
    normalized.pronunciationBase,
    normalized.sourceLocale,
    normalized.influence,
    normalized.accentDefinitionId ?? "legacy",
    normalized.strength,
    normalized.point ? `${normalized.point.x},${normalized.point.y}` : "anchor",
  ].join(":");
}

export function pronunciationAtlasResolvedBase(
  selection: PronunciationAtlasSelection,
): "en-US" | "en-GB" {
  return resolveLocalVoicePronunciationLocale(
    selection.pronunciationBase,
    selection.sourceLocale,
  );
}

export function pronunciationAtlasAnchorForSelection(
  selection: PronunciationAtlasSelection,
): PronunciationAtlasAnchor {
  const normalized = normalizePronunciationAtlasSelection(selection);
  if (normalized.accentDefinitionId) {
    const definitionAnchor = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) =>
        anchor.accentDefinitionId === normalized.accentDefinitionId,
    );
    if (definitionAnchor) return definitionAnchor;
  }
  if (normalized.influence !== "none") {
    const influenceAnchor = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.influence === normalized.influence,
    );
    if (influenceAnchor) return influenceAnchor;
  }
  const base = pronunciationAtlasResolvedBase(normalized);
  return (
    PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.pronunciationBase === base,
    ) ??
    PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) =>
        anchor.accentDefinitionId ===
        (base === "en-GB"
          ? "modern-rp-english"
          : "general-american-english"),
    ) ??
    PRONUNCIATION_ATLAS_ANCHORS[0]!
  );
}

export function pronunciationAtlasPointForSelection(
  selection: PronunciationAtlasSelection,
): AdjustmentPadPoint {
  const normalized = normalizePronunciationAtlasSelection(selection);
  return (
    normalized.point ?? pronunciationAtlasAnchorForSelection(normalized).point
  );
}

function pronunciationAtlasAnchorLabel(
  anchor: PronunciationAtlasAnchor,
): string {
  const definition = voiceAccentDefinitionForId(anchor.accentDefinitionId);
  if (definition) {
    return definition.premiumAccentedEnglishLabel.replace(
      /-accented English$/u,
      "",
    );
  }
  const capability = LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
    (candidate) => candidate.id === anchor.influence,
  );
  return (capability?.label ?? anchor.influence ?? anchor.id)
    .replace(/-influenced English$/u, "")
    .replace(/ English$/u, "");
}

export function pronunciationAtlasNamedCandidates(
  current: PronunciationAtlasSelection,
): readonly PronunciationAtlasCandidate[] {
  const normalized = normalizePronunciationAtlasSelection(current);
  const seen = new Set<string>();
  return PRONUNCIATION_ATLAS_ANCHORS.flatMap((anchor) => {
    if (seen.has(anchor.accentDefinitionId)) return [];
    seen.add(anchor.accentDefinitionId);
    return [
      {
        id: anchor.id,
        label: pronunciationAtlasAnchorLabel(anchor),
        selection: selectionForPronunciationAtlasAnchor(
          anchor,
          normalized,
          anchor.point,
        ),
      },
    ];
  }).sort((left, right) => left.label.localeCompare(right.label));
}

function selectionForPronunciationAtlasAnchor(
  anchor: PronunciationAtlasAnchor,
  current: PronunciationAtlasSelection,
  point: AdjustmentPadPoint,
): PronunciationAtlasSelection {
  const definition = voiceAccentDefinitionForId(anchor.accentDefinitionId);
  const pronunciationBase =
    anchor.pronunciationBase ??
    definition?.localPronunciationBaseFallback ??
    (current.pronunciationBase === "follow-voice"
      ? pronunciationAtlasResolvedBase(current)
      : current.pronunciationBase);
  return {
    ...current,
    pronunciationBase,
    influence:
      anchor.influence ?? definition?.localSpeechprintFallback ?? "none",
    accentDefinitionId: anchor.accentDefinitionId,
    point,
  };
}

/**
 * Gives a freely dropped pin an explicit shortlist. Dense map regions remain
 * easy to choose without making the geographic hit targets artificially large.
 */
export function pronunciationAtlasNearbyCandidates(
  selection: PronunciationAtlasSelection,
  limit = 5,
): readonly PronunciationAtlasCandidate[] {
  const normalized = normalizePronunciationAtlasSelection(selection);
  const point = pronunciationAtlasPointForSelection(normalized);
  return [...PRONUNCIATION_ATLAS_ANCHORS]
    .sort(
      (left, right) =>
        squaredDistance(point, left.point) -
        squaredDistance(point, right.point),
    )
    .slice(0, Math.max(1, Math.floor(limit)))
    .map((anchor) => ({
      id: anchor.id,
      label: pronunciationAtlasAnchorLabel(anchor),
      selection: selectionForPronunciationAtlasAnchor(
        anchor,
        normalized,
        anchor.point,
      ),
    }));
}

export function pronunciationAtlasSelectionAtPoint(
  point: AdjustmentPadPoint,
  current: PronunciationAtlasSelection,
): PronunciationAtlasSelection {
  const clampedPoint = clampPronunciationAtlasPoint(point);
  const normalized = normalizePronunciationAtlasSelection(current);
  const nearest = PRONUNCIATION_ATLAS_ANCHORS.reduce((best, candidate) =>
    squaredDistance(clampedPoint, candidate.point) <
    squaredDistance(clampedPoint, best.point)
      ? candidate
      : best,
  );
  const nearestDefinition = voiceAccentDefinitionForId(
    nearest.accentDefinitionId,
  );
  return {
    ...normalized,
    pronunciationBase:
      nearest.pronunciationBase ??
      nearestDefinition?.localPronunciationBaseFallback ??
      (normalized.pronunciationBase === "follow-voice"
        ? pronunciationAtlasResolvedBase(normalized)
        : normalized.pronunciationBase),
    influence: "none",
    accentDefinitionId: null,
    point: clampedPoint,
  };
}

export function nudgePronunciationAtlasSelection(
  current: PronunciationAtlasSelection,
  direction: AdjustmentPadDirection,
  multiplier = 1,
): PronunciationAtlasSelection {
  const point = { ...pronunciationAtlasPointForSelection(current) };
  const delta = 0.01 * multiplier;
  if (direction === "left") point.x -= delta;
  else if (direction === "right") point.x += delta;
  else if (direction === "up") point.y -= delta;
  else point.y += delta;
  return pronunciationAtlasSelectionAtPoint(point, current);
}

/**
 * Keyboard travel scaled to the active lens so arrow keys cover the same
 * on-screen distance at every zoom. The world lens (size 1) is exactly the
 * legacy step, preserving established keyboard behavior.
 */
export function nudgePronunciationAtlasSelectionInLens(
  current: PronunciationAtlasSelection,
  direction: AdjustmentPadDirection,
  multiplier: number,
  lens: PronunciationAtlasLens,
): PronunciationAtlasSelection {
  return nudgePronunciationAtlasSelection(
    current,
    direction,
    multiplier * lens.size,
  );
}

function pronunciationAtlasStrengthLabel(
  strength: LocalVoiceSpeechprintStrength,
): string {
  return strength === "light"
    ? "Light"
    : strength === "strong"
      ? "Strong"
      : "Balanced";
}

function pronunciationAtlasDefinitionLabel(
  accentDefinitionId: VoiceAccentDefinitionId,
): string {
  return (
    voiceAccentDefinitionForId(accentDefinitionId)?.premiumAccentedEnglishLabel
      .replace(/-accented English$/u, "")
      .replace(/-influenced English$/u, "")
      .replace(/ English$/u, "") ?? accentDefinitionId
  );
}

function pronunciationAtlasGeographicFieldLabel(
  selection: PronunciationAtlasSelection,
): string | null {
  const normalized = normalizePronunciationAtlasSelection(selection);
  if (!normalized.point || normalized.accentDefinitionId) return null;
  const layers = resolveVoiceAccentField({
    point: normalized.point,
    accentDefinitionId: null,
    pronunciationBase: normalized.pronunciationBase,
    speechprintInfluence: normalized.influence,
  }).layers;
  if (layers.length === 1) {
    return pronunciationAtlasDefinitionLabel(layers[0]!.accentDefinitionId);
  }
  if (layers.length !== 2) return null;
  const firstPercent = Math.round(layers[0]!.weight * 100);
  const secondPercent = 100 - firstPercent;
  return `${firstPercent}% ${pronunciationAtlasDefinitionLabel(
    layers[0]!.accentDefinitionId,
  )} + ${secondPercent}% ${pronunciationAtlasDefinitionLabel(
    layers[1]!.accentDefinitionId,
  )}`;
}

export function pronunciationAtlasValueText(
  selection: PronunciationAtlasSelection,
): string {
  const normalized = normalizePronunciationAtlasSelection(selection);
  const field = pronunciationAtlasGeographicFieldLabel(normalized);
  if (field) {
    return `${field}, ${pronunciationAtlasStrengthLabel(normalized.strength)}`;
  }
  const definition = voiceAccentDefinitionForId(
    normalized.accentDefinitionId,
  );
  if (!definition && normalized.influence === "none") {
    return "Natural voice";
  }
  const influence = LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
    (capability) => capability.id === normalized.influence,
  );
  const influenceLabel =
    definition?.premiumAccentedEnglishLabel ??
    influence?.label ??
    normalized.influence;
  return `${influenceLabel}, ${pronunciationAtlasStrengthLabel(
    normalized.strength,
  )}`;
}

export function pronunciationAtlasLocationText(
  selection: PronunciationAtlasSelection,
): string {
  const normalized = normalizePronunciationAtlasSelection(selection);
  const field = pronunciationAtlasGeographicFieldLabel(normalized);
  if (field) {
    return `${field} · ${pronunciationAtlasStrengthLabel(normalized.strength)}`;
  }
  const definition = voiceAccentDefinitionForId(
    normalized.accentDefinitionId,
  );
  if (!definition && normalized.influence === "none") {
    return "Natural voice";
  }
  const capability = LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
    (candidate) => candidate.id === normalized.influence,
  );
  const place = (
    definition?.premiumAccentedEnglishLabel ??
    capability?.label ??
    normalized.influence
  )
    .replace(/-accented English$/u, "")
    .replace(/-influenced English$/u, "")
    .replace(/ English$/u, "");
  return `${place} · ${pronunciationAtlasStrengthLabel(normalized.strength)}`;
}

export function pronunciationAtlasNaturalSelection(
  sourceLocale: string,
): PronunciationAtlasSelection {
  return {
    pronunciationBase: "follow-voice",
    sourceLocale,
    influence: "none",
    strength: "balanced",
    accentDefinitionId: null,
  };
}
