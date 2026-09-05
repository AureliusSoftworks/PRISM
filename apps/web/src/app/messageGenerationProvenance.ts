export type RecordedMessageGenerationProvenance = {
  model: string;
  effort?: string | null;
  turbo?: boolean;
};

const RECORDED_EFFORT_LABELS: Readonly<Record<string, string>> = {
  auto: "Auto",
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};

/**
 * Formats only recorded output provenance. Callers deliberately pass null for
 * legacy rows rather than substituting current picker defaults.
 */
export function recordedMessageGenerationLabel(
  provenance: RecordedMessageGenerationProvenance | null | undefined,
): string | null {
  if (!provenance) return null;
  const model = provenance.model.trim();
  if (!model) return null;
  const recordedEffort = provenance.effort?.trim() || null;
  const effort = recordedEffort
    ? (RECORDED_EFFORT_LABELS[recordedEffort.toLowerCase()] ?? recordedEffort)
    : "Effort unavailable";
  return `${model} · ${effort}${provenance.turbo ? " · Turbo" : ""}`;
}
