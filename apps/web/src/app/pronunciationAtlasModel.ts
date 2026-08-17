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
