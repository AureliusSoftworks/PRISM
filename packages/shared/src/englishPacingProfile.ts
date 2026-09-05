/**
 * Per-bot / per-player English pause timings baked from Premium
 * ElevenLabs with-timestamps. Used offline by Kokoro clause gaps.
 * Never included in Marketplace bot bundles.
 */

import type { ActionSfxPackOwnerKind } from "./actionSfxPack.js";

export const ENGLISH_PACING_PROFILE_VERSION = 1 as const;
export const ENGLISH_PACING_PROFILE_SOURCE = "elevenlabs-timestamps" as const;

export type EnglishPacingProfileOwnerKind = ActionSfxPackOwnerKind;

export interface EnglishPacingProfileV1 {
  v: typeof ENGLISH_PACING_PROFILE_VERSION;
  ownerKind: EnglishPacingProfileOwnerKind;
  ownerId: string;
  commaMs: number;
  clauseMs: number;
  strongMs: number;
  calibratedAt: string;
  source: typeof ENGLISH_PACING_PROFILE_SOURCE;
}

export const ENGLISH_PACING_PAUSE_MS_BOUNDS = {
  comma: { min: 80, max: 420, fallback: 140 },
  clause: { min: 120, max: 560, fallback: 200 },
  strong: { min: 180, max: 720, fallback: 300 },
} as const;

/**
 * Fixed punctuated script for ONLINE calibrate. Covers comma, clause
 * (;:—), and strong (.?!) pause classes without relying on LLM rewrite.
 */
export const ENGLISH_PACING_CALIBRATE_SCRIPT =
  "Wait, listen carefully: the sponges, they are red and blue. Not green and white! Are you sure? Yes — proceed.";

export interface EnglishPacingCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export type EnglishPacingPauseKind = "comma" | "clause" | "strong";

function clampPauseMs(
  kind: EnglishPacingPauseKind,
  value: number,
): number {
  const bounds = ENGLISH_PACING_PAUSE_MS_BOUNDS[kind];
  if (!Number.isFinite(value)) return bounds.fallback;
  return Math.max(bounds.min, Math.min(bounds.max, Math.round(value)));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function classifyCalibratePunctuation(
  mark: string,
): EnglishPacingPauseKind | null {
  if (mark === ",") return "comma";
  if (mark === ";" || mark === ":" || mark === "—" || mark === "–") {
    return "clause";
  }
  if (mark === "." || mark === "!" || mark === "?" || mark === "…" ) {
    return "strong";
  }
  return null;
}

/**
 * Measure pause gaps after punctuation from Premium character timings.
 * Gap = next spoken letter/digit start − punctuation end.
 */
export function extractEnglishPacingPauseMedians(
  alignment: EnglishPacingCharacterAlignment | null | undefined,
): {
  commaMs: number;
  clauseMs: number;
  strongMs: number;
  sampleCounts: Record<EnglishPacingPauseKind, number>;
} {
  const samples: Record<EnglishPacingPauseKind, number[]> = {
    comma: [],
    clause: [],
    strong: [],
  };
  const characters = alignment?.characters ?? [];
  const starts = alignment?.characterStartTimesSeconds ?? [];
  const ends = alignment?.characterEndTimesSeconds ?? [];
  if (
    characters.length === 0 ||
    characters.length !== starts.length ||
    characters.length !== ends.length
  ) {
    return {
      commaMs: ENGLISH_PACING_PAUSE_MS_BOUNDS.comma.fallback,
      clauseMs: ENGLISH_PACING_PAUSE_MS_BOUNDS.clause.fallback,
      strongMs: ENGLISH_PACING_PAUSE_MS_BOUNDS.strong.fallback,
      sampleCounts: { comma: 0, clause: 0, strong: 0 },
    };
  }

  for (let index = 0; index < characters.length; index += 1) {
    const mark = characters[index] ?? "";
    const kind = classifyCalibratePunctuation(mark);
    if (!kind) continue;
    const punctEnd = ends[index];
    if (typeof punctEnd !== "number" || !Number.isFinite(punctEnd)) continue;

    let nextSpoken = index + 1;
    while (nextSpoken < characters.length) {
      const candidate = characters[nextSpoken] ?? "";
      if (/[\p{L}\p{N}]/u.test(candidate)) break;
      nextSpoken += 1;
    }
    if (nextSpoken >= characters.length) continue;
    const nextStart = starts[nextSpoken];
    if (typeof nextStart !== "number" || !Number.isFinite(nextStart)) continue;
    const gapMs = Math.round((nextStart - punctEnd) * 1000);
    if (gapMs < 20 || gapMs > 2000) continue;
    samples[kind].push(gapMs);
  }

  return {
    commaMs: clampPauseMs(
      "comma",
      median(samples.comma) ?? ENGLISH_PACING_PAUSE_MS_BOUNDS.comma.fallback,
    ),
    clauseMs: clampPauseMs(
      "clause",
      median(samples.clause) ?? ENGLISH_PACING_PAUSE_MS_BOUNDS.clause.fallback,
    ),
    strongMs: clampPauseMs(
      "strong",
      median(samples.strong) ?? ENGLISH_PACING_PAUSE_MS_BOUNDS.strong.fallback,
    ),
    sampleCounts: {
      comma: samples.comma.length,
      clause: samples.clause.length,
      strong: samples.strong.length,
    },
  };
}

export function normalizeEnglishPacingProfileV1(
  value: unknown,
): EnglishPacingProfileV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.v !== ENGLISH_PACING_PROFILE_VERSION) return null;
  if (record.source !== ENGLISH_PACING_PROFILE_SOURCE) return null;
  const ownerKind =
    record.ownerKind === "bot" || record.ownerKind === "player"
      ? record.ownerKind
      : null;
  const ownerId =
    typeof record.ownerId === "string" ? record.ownerId.trim() : "";
  const calibratedAt =
    typeof record.calibratedAt === "string" ? record.calibratedAt.trim() : "";
  if (!ownerKind || !ownerId || !calibratedAt) return null;
  return {
    v: ENGLISH_PACING_PROFILE_VERSION,
    ownerKind,
    ownerId,
    commaMs: clampPauseMs("comma", Number(record.commaMs)),
    clauseMs: clampPauseMs("clause", Number(record.clauseMs)),
    strongMs: clampPauseMs("strong", Number(record.strongMs)),
    calibratedAt: calibratedAt.slice(0, 64),
    source: ENGLISH_PACING_PROFILE_SOURCE,
  };
}

export function englishPacingPauseMsForKind(
  profile: EnglishPacingProfileV1 | null | undefined,
  kind: EnglishPacingPauseKind | "glue",
): number | null {
  if (!profile || kind === "glue") return null;
  if (kind === "comma") return profile.commaMs;
  if (kind === "clause") return profile.clauseMs;
  return profile.strongMs;
}
