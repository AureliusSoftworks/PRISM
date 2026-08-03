import type {
  PsychicThoughtPass,
  PsychicThoughtPayload,
} from "@localai/shared";

export const PSYCHIC_PENDING_SUMMARY =
  "Considering what matters for this reply...";

export interface PsychicCanvasScratchpadPayload {
  v: 1;
  scratchpad: string;
  stage?: "plan" | "draft" | "audit" | "revision";
  effort: PsychicThoughtPayload["effort"];
  provider: PsychicThoughtPayload["provider"];
  model?: string;
  simulated: boolean;
  passCount?: number;
  guidanceChars?: number;
  createdAt: string;
}

export interface PsychicThoughtDisplayLine {
  label: "Psychic";
  meta?: string;
  summary: string;
  state: "summary" | "thinking";
  animated: boolean;
  ariaLabel: string;
  passes?: Array<{
    stage: PsychicThoughtPass["stage"];
    label: string;
    summary: string;
  }>;
  scratchpad?: string;
  scratchpadMeta?: string;
}

const PSYCHIC_PASS_LABELS: Record<PsychicThoughtPass["stage"], string> = {
  plan: "Plan",
  draft: "Draft",
  audit: "Audit",
  revision: "Refine",
};

export interface PsychicThoughtDisplayOptions {
  pendingThinking?: boolean;
  pendingDelayElapsed?: boolean;
  reducedMotion?: boolean;
  showScratchpad?: boolean;
}

export interface PsychicThoughtMessageLike {
  role: string;
  psychicThought?: PsychicThoughtPayload;
  psychicScratchpad?: PsychicCanvasScratchpadPayload;
}

export function psychicPlanningModeLabel(
  planningMode: PsychicThoughtPayload["planningMode"],
  passCount?: number,
): string | undefined {
  if (planningMode === "simulated") {
    const normalizedPassCount =
      typeof passCount === "number" && Number.isFinite(passCount)
        ? Math.max(0, Math.round(passCount))
        : 0;
    return normalizedPassCount > 0
      ? `Simulated · ${normalizedPassCount} ${normalizedPassCount === 1 ? "pass" : "passes"}`
      : "Simulated";
  }
  if (planningMode === "native") return "Native + public plan";
  if (planningMode === "public") return "Public plan";
  return undefined;
}

export function psychicThoughtDisplayLineForMessage(
  message: PsychicThoughtMessageLike,
  options: PsychicThoughtDisplayOptions = {}
): PsychicThoughtDisplayLine | null {
  if (message.role !== "user") return null;
  const summary = message.psychicThought?.summary.trim();
  const passes = (message.psychicThought?.passes ?? [])
    .map((pass) => ({
      stage: pass.stage,
      label: PSYCHIC_PASS_LABELS[pass.stage],
      summary: pass.summary.trim(),
    }))
    .filter((pass) => Boolean(pass.summary));
  const visiblePasses = passes.length > 1 ? passes : undefined;
  const meta = psychicPlanningModeLabel(
    message.psychicThought?.planningMode,
    message.psychicThought?.passCount,
  );
  const scratchpad =
    options.showScratchpad === true
      ? message.psychicScratchpad?.scratchpad.trim()
      : undefined;
  const scratchpadMeta = scratchpad && message.psychicScratchpad
    ? [
        message.psychicScratchpad.provider,
        message.psychicScratchpad.model,
        `effort ${message.psychicScratchpad.effort}`,
        typeof message.psychicScratchpad.passCount === "number"
          ? `${message.psychicScratchpad.passCount} passes`
          : null,
      ]
        .filter((part): part is string => Boolean(part))
        .join(" · ")
    : undefined;
  if (summary) {
    return {
      label: "Psychic",
      ...(meta ? { meta } : {}),
      summary,
      state: "summary",
      animated: false,
      ariaLabel: visiblePasses
        ? `Psychic, ${meta ?? `${visiblePasses.length} passes`}: ${visiblePasses
            .map((pass) => `${pass.label}: ${pass.summary}`)
            .join(" ")}`
        : meta
          ? `Psychic, ${meta}: ${summary}`
          : `Psychic summary: ${summary}`,
      ...(visiblePasses ? { passes: visiblePasses } : {}),
      ...(scratchpad ? { scratchpad } : {}),
      ...(scratchpad && scratchpadMeta ? { scratchpadMeta } : {}),
    };
  }
  if (!options.pendingThinking || !options.pendingDelayElapsed) return null;
  return {
    label: "Psychic",
    summary: PSYCHIC_PENDING_SUMMARY,
    state: "thinking",
    animated: options.reducedMotion !== true,
    ariaLabel: "Psychic is considering the reply.",
  };
}
