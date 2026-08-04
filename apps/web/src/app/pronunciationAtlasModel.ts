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
  point: AdjustmentPadPoint;
  base?: "en-US" | "en-GB";
  influence?: Exclude<LocalVoiceSpeechprintInfluence, "none">;
}

/**
 * Projects geographic coordinates into the same full-frame equirectangular
 * space used by the Accent Map artwork and pointer pad.
 */
export function pronunciationAtlasPointForCoordinates(
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
    point: pronunciationAtlasPointForCoordinates(-3.7, 40.4),
  },
  "latin-american-spanish-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(-74.07, 4.71),
  },
  "brazilian-portuguese-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(-47.9, -15.8),
  },
  "european-portuguese-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(-9.14, 38.72),
  },
  "mandarin-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(116.4, 39.9),
  },
  "cantonese-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(114.17, 22.32),
  },
  "japanese-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(139.7, 35.7),
  },
  "korean-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(127, 37.6),
  },
  "indian-english": {
    point: pronunciationAtlasPointForCoordinates(77.2, 28.6),
  },
  "pakistani-english": {
    point: pronunciationAtlasPointForCoordinates(73.05, 33.68),
  },
  "bengali-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(90.41, 23.81),
  },
  "sri-lankan-english": {
    point: pronunciationAtlasPointForCoordinates(79.86, 6.93),
  },
  "french-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(2.35, 48.86),
  },
  "german-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(13.4, 52.52),
  },
  "dutch-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(4.9, 52.37),
  },
  "nordic-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(18.07, 59.33),
  },
  "polish-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(21.01, 52.23),
  },
  "greek-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(23.73, 37.98),
  },
  "russian-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(37.62, 55.75),
  },
  "italian-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(12.5, 41.9),
  },
  "irish-english": {
    point: pronunciationAtlasPointForCoordinates(-6.26, 53.35),
  },
  "scottish-english": {
    point: pronunciationAtlasPointForCoordinates(-3.19, 55.95),
  },
  "australian-english": {
    point: pronunciationAtlasPointForCoordinates(149.13, -35.28),
  },
  "new-zealand-english": {
    point: pronunciationAtlasPointForCoordinates(174.78, -41.29),
  },
  "canadian-english": {
    point: pronunciationAtlasPointForCoordinates(-75.7, 45.42),
  },
  "new-york-english": {
    point: pronunciationAtlasPointForCoordinates(-74.01, 40.71),
  },
  "southern-us-english": {
    point: pronunciationAtlasPointForCoordinates(-84.39, 33.75),
  },
  "caribbean-english": {
    point: pronunciationAtlasPointForCoordinates(-76.79, 17.97),
  },
  "north-african-arabic-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(10.18, 36.8),
  },
  "middle-eastern-arabic-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(46.68, 24.71),
  },
  "persian-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(51.39, 35.69),
  },
  "turkish-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(32.86, 39.93),
  },
  "nigerian-english": {
    point: pronunciationAtlasPointForCoordinates(3.38, 6.52),
  },
  "east-african-english": {
    point: pronunciationAtlasPointForCoordinates(36.82, -1.29),
  },
  "south-african-english": {
    point: pronunciationAtlasPointForCoordinates(28.05, -26.2),
  },
  "filipino-english": {
    point: pronunciationAtlasPointForCoordinates(120.98, 14.6),
  },
  "vietnamese-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(105.83, 21.03),
  },
  "thai-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(100.5, 13.76),
  },
  "indonesian-influenced-english": {
    point: pronunciationAtlasPointForCoordinates(106.85, -6.2),
  },
  "singapore-english": {
    point: pronunciationAtlasPointForCoordinates(103.82, 1.35),
  },
  "pacific-island-english": {
    point: pronunciationAtlasPointForCoordinates(178.45, -18.14),
  },
} as const satisfies Record<
  Exclude<LocalVoiceSpeechprintInfluence, "none">,
  {
    point: AdjustmentPadPoint;
  }
>;

const BASE_ANCHORS = [
  {
    id: "base-en-US",
    point: pronunciationAtlasPointForCoordinates(-98.5, 39.8),
    base: "en-US",
  },
  {
    id: "base-en-GB",
    point: pronunciationAtlasPointForCoordinates(-0.13, 51.51),
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

export function pronunciationAtlasLocationText(
  selection: PronunciationAtlasSelection,
): string {
  const normalized = normalizePronunciationAtlasSelection(selection);
  if (normalized.influence === "none") {
    return pronunciationAtlasResolvedBase(normalized) === "en-GB"
      ? "British · Natural"
      : "American · Natural";
  }
  const capability = LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
    (candidate) => candidate.id === normalized.influence,
  );
  const place = (capability?.label ?? normalized.influence)
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
  };
}
