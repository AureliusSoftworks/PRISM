import type {
  PsychicThoughtPass,
  PsychicThoughtPayload,
} from "@localai/shared";

export const PSYCHIC_PENDING_SUMMARY =
  "Considering what matters for this reply...";

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
}

const PSYCHIC_PASS_LABELS: Record<PsychicThoughtPass["stage"], string> = {
  plan: "Plan",
  alternatives: "Alternatives",
  draft: "Draft",
  audit: "Audit",
  red_team: "Red-team",
  constraint_lock: "Constraint lock",
  revise_draft: "Revise draft",
  compliance_sweep: "Compliance sweep",
  synthesis: "Synthesis",
  revision: "Refine",
};

export interface PsychicThoughtDisplayOptions {
  pendingThinking?: boolean;
  pendingDelayElapsed?: boolean;
  reducedMotion?: boolean;
}

export interface PsychicThoughtMessageLike {
  role: string;
  psychicThought?: PsychicThoughtPayload;
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
