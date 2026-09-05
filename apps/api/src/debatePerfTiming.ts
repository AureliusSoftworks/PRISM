/**
 * Privacy-safe Debate advance timing marks. Logs durations only — never prompts
 * or speech content.
 */

export type DebatePerfSpanName =
  | "advance.total"
  | "advance.step"
  | "advance.speech"
  | "advance.speech.repair"
  | "advance.floor_break"
  | "advance.surprise"
  | "advance.jury_sidebar"
  | "advance.commit";

type DebatePerfSpan = {
  name: DebatePerfSpanName;
  startedAtMs: number;
};

const DEBATE_PERF_TIMING_ENABLED =
  process.env.DEBATE_PERF_TIMING === "1" ||
  process.env.NODE_ENV !== "production";

export function debatePerfNowMs(): number {
  return performance.now();
}

export function startDebatePerfSpan(name: DebatePerfSpanName): DebatePerfSpan {
  return { name, startedAtMs: debatePerfNowMs() };
}

export function endDebatePerfSpan(
  span: DebatePerfSpan,
  details: Record<string, number | boolean | null | undefined> = {},
): number {
  const durationMs = Math.round(debatePerfNowMs() - span.startedAtMs);
  if (!DEBATE_PERF_TIMING_ENABLED) return durationMs;
  const detailText = Object.entries(details)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  console.info(
    `[debate-perf] ${span.name} ${durationMs}ms${detailText ? ` ${detailText}` : ""}`,
  );
  return durationMs;
}
