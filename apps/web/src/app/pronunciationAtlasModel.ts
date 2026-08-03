import {
  LOCAL_VOICE_SPEECHPRINT_CAPABILITIES,
  normalizeLocalVoicePronunciationBase,
  normalizeLocalVoiceSpeechprintInfluence,
  normalizeLocalVoiceSpeechprintStrength,
  resolveLocalVoicePronunciationLocale,
  type LocalVoicePronunciationBase,
  type LocalVoiceSpeechprintInfluence,
  type LocalVoiceSpeechprintStrength,
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
}

export interface PronunciationAtlasAnchor {
  id: string;
  shortLabel: string;
  label: string;
  point: AdjustmentPadPoint;
  base?: "en-US" | "en-GB";
  influence?: Exclude<LocalVoiceSpeechprintInfluence, "none">;
}

function atlasPoint(
  longitudeDegrees: number,
  latitudeDegrees: number,
): AdjustmentPadPoint {
  return {
    x: (longitudeDegrees + 180) / 360,
    y: (90 - latitudeDegrees) / 180,
  };
}

const INFLUENCE_ANCHOR_DATA = {
  "spanish-influenced-english": {
    shortLabel: "ES",
    label: "Spanish-influenced English",
    point: atlasPoint(-3.7, 40.4),
  },
  "brazilian-portuguese-influenced-english": {
    shortLabel: "BR",
    label: "Brazilian Portuguese-influenced English",
    point: atlasPoint(-47.9, -15.8),
  },
  "mandarin-influenced-english": {
    shortLabel: "ZH",
    label: "Mandarin-influenced English",
    point: atlasPoint(116.4, 39.9),
  },
  "japanese-influenced-english": {
    shortLabel: "JP",
    label: "Japanese-influenced English",
    point: atlasPoint(139.7, 35.7),
  },
  "korean-influenced-english": {
    shortLabel: "KR",
    label: "Korean-influenced English",
    point: atlasPoint(127, 37.6),
  },
  "indian-english": {
    shortLabel: "IN",
    label: "Indian English",
    point: atlasPoint(77.2, 28.6),
  },
  "french-influenced-english": {
    shortLabel: "FR",
    label: "French-influenced English",
    point: atlasPoint(2.35, 48.86),
  },
  "german-influenced-english": {
    shortLabel: "DE",
    label: "German-influenced English",
    point: atlasPoint(13.4, 52.52),
  },
  "russian-influenced-english": {
    shortLabel: "RU",
    label: "Russian-influenced English",
    point: atlasPoint(37.62, 55.75),
  },
} as const satisfies Record<
  Exclude<LocalVoiceSpeechprintInfluence, "none">,
  {
    shortLabel: string;
    label: string;
    point: AdjustmentPadPoint;
  }
>;

const BASE_ANCHORS = [
  {
    id: "base-en-US",
    shortLabel: "US",
    label: "American English foundation",
    point: atlasPoint(-98.5, 39.8),
    base: "en-US",
  },
  {
    id: "base-en-GB",
    shortLabel: "UK",
    label: "British English foundation",
    point: atlasPoint(-0.13, 51.51),
    base: "en-GB",
  },
] as const satisfies readonly PronunciationAtlasAnchor[];

export const PRONUNCIATION_ATLAS_ANCHORS: readonly PronunciationAtlasAnchor[] =
  [
    ...BASE_ANCHORS,
    ...LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.map((capability) => {
      const authored = INFLUENCE_ANCHOR_DATA[capability.id];
      return {
        id: `influence-${capability.id}`,
        shortLabel: authored.shortLabel,
        label: capability.label,
        point: authored.point,
        influence: capability.id,
      } satisfies PronunciationAtlasAnchor;
    }),
  ];

function squaredDistance(
  left: AdjustmentPadPoint,
  right: AdjustmentPadPoint,
): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function sourceBaseLocale(sourceLocale: string): "en-US" | "en-GB" {
  return resolveLocalVoicePronunciationLocale("follow-voice", sourceLocale);
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
    normalized.strength,
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
  if (normalized.influence !== "none") {
    const influenceAnchor = PRONUNCIATION_ATLAS_ANCHORS.find(
      (anchor) => anchor.influence === normalized.influence,
    );
    if (influenceAnchor) return influenceAnchor;
  }
  const base = pronunciationAtlasResolvedBase(normalized);
  return (
    PRONUNCIATION_ATLAS_ANCHORS.find((anchor) => anchor.base === base) ??
    BASE_ANCHORS[0]
  );
}

export function pronunciationAtlasSelectionAtPoint(
  point: AdjustmentPadPoint,
  current: PronunciationAtlasSelection,
): PronunciationAtlasSelection {
  const normalized = normalizePronunciationAtlasSelection(current);
  const nearest = PRONUNCIATION_ATLAS_ANCHORS.reduce((best, candidate) =>
    squaredDistance(point, candidate.point) < squaredDistance(point, best.point)
      ? candidate
      : best,
  );
  if (nearest.base) {
    const matchingSource =
      nearest.base === sourceBaseLocale(normalized.sourceLocale);
    return {
      ...normalized,
      pronunciationBase: matchingSource ? "follow-voice" : nearest.base,
      influence: "none",
    };
  }
  return {
    ...normalized,
    influence: nearest.influence ?? "none",
  };
}

export function nudgePronunciationAtlasSelection(
  current: PronunciationAtlasSelection,
  direction: AdjustmentPadDirection,
): PronunciationAtlasSelection {
  const origin = pronunciationAtlasAnchorForSelection(current);
  const candidates = PRONUNCIATION_ATLAS_ANCHORS.filter((candidate) => {
    const dx = candidate.point.x - origin.point.x;
    const dy = candidate.point.y - origin.point.y;
    if (direction === "left") return dx < -0.005;
    if (direction === "right") return dx > 0.005;
    if (direction === "up") return dy < -0.005;
    return dy > 0.005;
  });
  if (candidates.length === 0)
    return normalizePronunciationAtlasSelection(current);
  const directionalDistance = (candidate: PronunciationAtlasAnchor): number => {
    const dx = candidate.point.x - origin.point.x;
    const dy = candidate.point.y - origin.point.y;
    const primary =
      direction === "left" || direction === "right"
        ? Math.abs(dx)
        : Math.abs(dy);
    const cross =
      direction === "left" || direction === "right"
        ? Math.abs(dy)
        : Math.abs(dx);
    return primary + cross * 1.75;
  };
  const target = candidates.reduce((best, candidate) =>
    directionalDistance(candidate) < directionalDistance(best)
      ? candidate
      : best,
  );
  return pronunciationAtlasSelectionAtPoint(target.point, current);
}

function baseLabel(base: "en-US" | "en-GB"): string {
  return base === "en-GB" ? "British foundation" : "American foundation";
}

export function pronunciationAtlasValueText(
  selection: PronunciationAtlasSelection,
): string {
  const normalized = normalizePronunciationAtlasSelection(selection);
  const foundation = baseLabel(pronunciationAtlasResolvedBase(normalized));
  if (normalized.influence === "none") return `${foundation}, natural`;
  const influence = LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
    (capability) => capability.id === normalized.influence,
  );
  const influenceLabel = influence?.label ?? normalized.influence;
  const strength =
    normalized.strength === "light"
      ? "Light"
      : normalized.strength === "strong"
        ? "Strong"
        : "Balanced";
  return `${foundation}, ${influenceLabel}, ${strength}`;
}

export function pronunciationAtlasNaturalSelection(
  sourceLocale: string,
): PronunciationAtlasSelection {
  return {
    pronunciationBase: "follow-voice",
    sourceLocale,
    influence: "none",
    strength: "balanced",
  };
}
