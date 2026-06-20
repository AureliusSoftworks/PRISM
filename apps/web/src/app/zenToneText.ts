import type {
  ZenDisplayAlign,
  ZenDisplayMetadata,
  ZenDisplayPlacement,
} from "@localai/shared";

export type ZenTextEffect = "emphasis" | "affirm";

export interface ZenResolvedLinePlacement {
  index: number;
  x: number;
  y: number;
  align: ZenDisplayAlign;
  source: "metadata" | "automatic";
}

export interface ZenResolvedMessagePlacement {
  x: number;
  y: number;
  align: ZenDisplayAlign;
  source: "metadata";
}

const ZEN_TONE_SPACE_BASE_ANNOYANCE = 0.12;
const ZEN_TONE_SPACE_MAX_ANNOYANCE = 0.82;
const ZEN_AUTOMATIC_PLACEMENT_MAX_LINES = 5;
const ZEN_AUTOMATIC_PLACEMENT_MAX_WORDS = 12;
const ZEN_AUTOMATIC_PLACEMENT_MAX_FINAL_CHARS = 36;

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveCoordinate(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clampUnit(value) : fallback;
}

function resolveAlign(value: ZenDisplayAlign | undefined): ZenDisplayAlign {
  return value ?? "center";
}

export function resolveZenToneSpaceFromAnnoyance(
  annoyance: number | null | undefined
): number {
  if (typeof annoyance !== "number" || !Number.isFinite(annoyance)) return 0;
  const range = ZEN_TONE_SPACE_MAX_ANNOYANCE - ZEN_TONE_SPACE_BASE_ANNOYANCE;
  if (range <= 0) return 0;
  return clampUnit((annoyance - ZEN_TONE_SPACE_BASE_ANNOYANCE) / range);
}

function normalizedWordToken(token: string): string {
  return token
    .trim()
    .replace(/^[*_`~"'“”‘’([{<]+/u, "")
    .replace(/[!?,.;:)\]}>*_`~"'“”‘’]+$/u, "")
    .toLowerCase();
}

export function resolveZenWordEffect(token: string): ZenTextEffect | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (/![)"'\]}>*_`~]*$/u.test(trimmed)) {
    return "emphasis";
  }
  const word = normalizedWordToken(trimmed);
  if (word === "yes" || word === "yeah" || word === "yep" || word === "yup") {
    return "affirm";
  }
  return null;
}

function splitDisplayLines(content: string): string[] {
  return content.replace(/\r\n?/g, "\n").split("\n");
}

function visibleWordCount(text: string): number {
  return text.trim().match(/\S+/g)?.length ?? 0;
}

function isEllipsisLikeLine(line: string): boolean {
  const compact = line.trim().replace(/\s+/g, "");
  return compact.length > 0 && /^[.…]+$/u.test(compact);
}

function hasMarkdownStructure(line: string): boolean {
  const trimmed = line.trim();
  return /^(#{1,6}\s|[-*+]\s+|>\s+|\d+[.)]\s+)/u.test(trimmed);
}

function metadataLinePlacements(
  zenDisplay: ZenDisplayMetadata | null | undefined
): ZenResolvedLinePlacement[] {
  return (zenDisplay?.lines ?? []).map((line) => ({
    index: line.index,
    x: resolveCoordinate(line.x, 0.5),
    y: resolveCoordinate(line.y, 0.5),
    align: resolveAlign(line.align),
    source: "metadata" as const,
  }));
}

function automaticLinePlacements(content: string, hasFencedCodeBlock: boolean): ZenResolvedLinePlacement[] {
  if (hasFencedCodeBlock) return [];
  const lines = splitDisplayLines(content);
  if (lines.length > ZEN_AUTOMATIC_PLACEMENT_MAX_LINES) return [];
  if (lines.some(hasMarkdownStructure)) return [];
  const nonEmpty = lines
    .map((line, index) => ({ line, index, trimmed: line.trim() }))
    .filter((entry) => entry.trimmed.length > 0);
  if (nonEmpty.length < 2) return [];
  const totalWords = visibleWordCount(nonEmpty.map((entry) => entry.trimmed).join(" "));
  if (totalWords > ZEN_AUTOMATIC_PLACEMENT_MAX_WORDS) return [];

  const final = nonEmpty[nonEmpty.length - 1]!;
  const hasEllipsisSetup = nonEmpty.slice(0, -1).some((entry) => isEllipsisLikeLine(entry.trimmed));
  if (!hasEllipsisSetup) return [];
  if (
    final.trimmed.length > ZEN_AUTOMATIC_PLACEMENT_MAX_FINAL_CHARS ||
    visibleWordCount(final.trimmed) > 4
  ) {
    return [];
  }

  const leading = nonEmpty.slice(0, -1);
  return [
    ...leading.map((entry, order) => ({
      index: entry.index,
      x: 0.5,
      y: Math.min(0.42, 0.24 + order * 0.12),
      align: "center" as const,
      source: "automatic" as const,
    })),
    {
      index: final.index,
      x: 0.5,
      y: 0.5,
      align: "center" as const,
      source: "automatic" as const,
    },
  ];
}

export function resolveZenLineDisplayPlacements(args: {
  content: string;
  hasFencedCodeBlock: boolean;
  zenDisplay?: ZenDisplayMetadata | null;
}): ZenResolvedLinePlacement[] {
  const explicit = metadataLinePlacements(args.zenDisplay);
  if (explicit.length > 0) return explicit;
  return automaticLinePlacements(args.content, args.hasFencedCodeBlock);
}

export function resolveZenMessageDisplayPlacement(
  zenDisplay: ZenDisplayMetadata | null | undefined
): ZenResolvedMessagePlacement | null {
  const placement: ZenDisplayPlacement | undefined = zenDisplay?.placement;
  if (!placement) return null;
  return {
    x: resolveCoordinate(placement.x, 0.5),
    y: resolveCoordinate(placement.y, 0.5),
    align: resolveAlign(placement.align),
    source: "metadata",
  };
}
