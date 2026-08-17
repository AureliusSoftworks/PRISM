import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  VOICE_ACCENT_MAP_ANCHORS,
  normalizeLocalVoicePronunciationBase,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  normalizeVoiceAccentDefinitionId,
  resolveLocalVoicePronunciationLocale,
  voiceAccentDefinitionForId,
  voiceAccentMapPointForCoordinates,
  type LocalVoicePronunciationBase,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
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
  return {
    pronunciationBase: normalizeLocalVoicePronunciationBase(
      selection.pronunciationBase,
    ),
    sourceLocale: selection.sourceLocale,
    influence: normalizeLocalVoiceSpeechprintInfluence(selection.influence),
    strength: normalizeLocalVoiceSpeechprintStrength(selection.strength),
    ...(normalizeVoiceAccentDefinitionId(selection.accentDefinitionId)
      ? {
          accentDefinitionId: normalizeVoiceAccentDefinitionId(
            selection.accentDefinitionId,
          ),
        }
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
    ) ?? PRONUNCIATION_ATLAS_ANCHORS[0]!
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
  if (anchor.pronunciationBase === "en-GB") return "British";
  if (anchor.pronunciationBase === "en-US") return "American";
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
  return selectionForPronunciationAtlasAnchor(
    nearest,
    normalized,
    clampedPoint,
  );
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

function baseLabel(base: "en-US" | "en-GB"): string {
  return base === "en-GB" ? "British foundation" : "American foundation";
}

export function pronunciationAtlasValueText(
  selection: PronunciationAtlasSelection,
): string {
  const normalized = normalizePronunciationAtlasSelection(selection);
  const foundation = baseLabel(pronunciationAtlasResolvedBase(normalized));
  const definition = voiceAccentDefinitionForId(
    normalized.accentDefinitionId,
  );
  if (!definition && normalized.influence === "none") {
    return `${foundation}, natural`;
  }
  const influence = LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
    (capability) => capability.id === normalized.influence,
  );
  const influenceLabel =
    definition?.premiumAccentedEnglishLabel ??
    influence?.label ??
    normalized.influence;
  const strength =
    normalized.strength === "light"
      ? "Light"
      : normalized.strength === "strong"
        ? "Strong"
        : "Balanced";
  return `${foundation}, ${influenceLabel}, ${strength}`;
}

export function pronunciationAtlasLocationText(
  selection: PronunciationAtlasSelection,
): string {
  const normalized = normalizePronunciationAtlasSelection(selection);
  const definition = voiceAccentDefinitionForId(
    normalized.accentDefinitionId,
  );
  if (!definition && normalized.influence === "none") {
    return pronunciationAtlasResolvedBase(normalized) === "en-GB"
      ? "British · Natural"
      : "American · Natural";
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
  const strength =
    normalized.strength === "light"
      ? "Light"
      : normalized.strength === "strong"
        ? "Strong"
        : "Balanced";
  return `${place} · ${strength}`;
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
