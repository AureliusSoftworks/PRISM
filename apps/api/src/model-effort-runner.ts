import {
  modelSupportsNativeReasoningEffort,
  reasoningGenerationBudgetMs,
  normalizeSimulatedEffortLadderProfile,
  simulatedEffortLadderPasses,
  simulatedEffortUsesThriftyPrompting,
  simulatedSurfacePreparationMaxTokens,
  simulatedSurfacePreparationNoteMaxChars,
  type NativeReasoningEffortProvider,
  type ReasoningEffort,
  type SimulatedEffortLadderProfile,
  type SimulatedEffortPassName,
} from "@localai/shared";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "./providers.ts";

export type SimulatedEffortSurface =
  | "bots"
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export class ReasoningGenerationTimeoutError extends Error {
  public readonly timeoutMs: number;

  public constructor(timeoutMs: number) {
    super(
      `The selected model did not finish within ${Math.round(timeoutMs / 1_000)} seconds. Retry or choose a lower effort.`,
    );
    this.name = "ReasoningGenerationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/** Bounds one complete direct-mode response, not each simulated preparation
 * pass. The caller supplies the whole prepare-and-generate pipeline. */
export async function runWithReasoningGenerationBudget<T>(args: {
  effort: ReasoningEffort | null | undefined;
  provider?: NativeReasoningEffortProvider;
  modelId?: string;
  signal?: AbortSignal;
  run: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  if (args.signal?.aborted) {
    throw args.signal.reason ?? new DOMException("Generation cancelled.", "AbortError");
  }
  const timeoutMs = reasoningGenerationBudgetMs(
    args.effort,
    args.provider && args.modelId
      ? { provider: args.provider, modelId: args.modelId }
      : undefined,
  );
  const timeoutController = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    timeoutController.abort(new ReasoningGenerationTimeoutError(timeoutMs));
  }, timeoutMs);
  const signal = args.signal
    ? AbortSignal.any([args.signal, timeoutController.signal])
    : timeoutController.signal;
  try {
    return await args.run(signal);
  } catch (error) {
    if (args.signal?.aborted) throw args.signal.reason ?? error;
    if (timedOut) throw new ReasoningGenerationTimeoutError(timeoutMs);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function simulatedStepInstruction(args: {
  surface: SimulatedEffortSurface;
  step: SimulatedEffortPassName;
  priorNotes: string;
  effort: Exclude<ReasoningEffort, "auto" | "none">;
  outputContract?: string;
}): string {
  const thrifty = simulatedEffortUsesThriftyPrompting();
  const lean = thrifty && (args.effort === "minimal" || args.effort === "low");
  const mediumLean = thrifty && args.effort === "medium";
  const brevity = !thrifty
    ? null
    : lean
      ? "Keep this under ~60 words. Prefer short bullets over paragraphs."
      : mediumLean
        ? "Keep this under ~100 words. Prefer short bullets over paragraphs."
        : args.effort === "xhigh"
          ? "Keep notes actionable; XHigh may use denser bullets but still avoid long chain-of-thought."
          : "Keep notes actionable and compact; avoid long chain-of-thought.";
  let task: string;
  switch (args.step) {
    case "plan":
      task = lean
        ? "List the key intent and 1-2 persona or constraint checks."
        : "Make a concise response plan with the key intent, factual or procedural checks, and persona choices.";
      break;
    case "alternatives":
      task =
        args.effort === "xhigh"
          ? "Sketch 3 reply approaches (A/B/C), then choose one with a one-line why."
          : "Sketch 2 reply approaches (A/B), then choose one with a one-line why.";
      break;
    case "draft":
      task = "Sketch a concise candidate response that follows the plan and chosen approach.";
      break;
    case "audit":
      task =
        lean || mediumLean
          ? "Audit for missed instructions, schema risks, and character drift. Return corrections only."
          : "Audit the preparation for missed instructions, contradictions, weak reasoning, schema risks, and character drift. Return corrections only.";
      break;
    case "red_team":
      task =
        "Adversarially list how this reply could fail constraints or annoy the user, then name guards. Use '- Attack:' / '- Guard:' bullets.";
      break;
    case "constraint_lock":
      task =
        "Extract a tiny must-keep checklist ('- Must:' bullets) for labels, limits, forbidden words, and format shape.";
      break;
    case "revise_draft":
      task =
        "Rewrite the candidate response under the critiques and constraint lock. Keep it private and concise.";
      break;
    case "compliance_sweep":
      task =
        "Hostile compliance sweep against the must-keep checklist. Use '- Fail:' / '- Pass:' then '- Enforce:' bullets.";
      break;
    case "synthesis":
    case "revision":
      task =
        "Produce a concise final response blueprint incorporating the useful corrections and must-keeps.";
      break;
    default: {
      const _exhaustive: never = args.step;
      task = `Continue private preparation for step ${String(_exhaustive)}.`;
    }
  }
  return [
    `Private PRISM ${args.surface} preparation pass: ${args.step}.`,
    task,
    ...(brevity ? [brevity] : []),
    args.outputContract
      ? `Visible-output contract: ${args.outputContract}`
      : "Preserve every visible-output constraint from the conversation.",
    args.priorNotes
      ? `Earlier private notes:\n${args.priorNotes}`
      : "Do not write chain-of-thought. Return only short actionable preparation notes.",
    "These notes are ephemeral and will never be shown or persisted.",
  ].join("\n");
}

function cleanPrivatePreparation(raw: string, effort: ReasoningEffort): string {
  return raw
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, simulatedSurfacePreparationNoteMaxChars(effort));
}

export function shouldPrepareMessagesWithSimulatedEffort(args: {
  provider: NativeReasoningEffortProvider;
  model: string;
  effort: ReasoningEffort | null | undefined;
}): boolean {
  if (!args.effort || args.effort === "auto" || args.effort === "none") {
    return false;
  }
  if (args.provider !== "local") return false;
  return !modelSupportsNativeReasoningEffort(args.provider, args.model);
}

export async function prepareMessagesWithSimulatedEffort(args: {
  provider: LlmProvider;
  messages: ProviderMessage[];
  options: GenerateOptions;
  effort: ReasoningEffort | null | undefined;
  surface: SimulatedEffortSurface;
  outputContract?: string;
  /** Defaults to standard (product). Pass deep for experimental heavy spine. */
  ladderProfile?: SimulatedEffortLadderProfile;
}): Promise<ProviderMessage[]> {
  if (!args.effort || args.effort === "auto" || args.effort === "none") {
    return args.messages;
  }
  // Defense in depth: callers normally use the capability helper above, but
  // no direct invocation may turn an ONLINE request into multiple passes.
  if (args.provider.name !== "local") return args.messages;
  const ladderProfile = normalizeSimulatedEffortLadderProfile(
    args.ladderProfile,
  );
  const steps = simulatedEffortLadderPasses(args.effort, ladderProfile);
  let priorNotes = "";
  for (const step of steps) {
    if (args.options.signal?.aborted) throw args.options.signal.reason;
    let raw: string;
    try {
      raw = await args.provider.generateResponse(
        [
          ...args.messages,
          {
            role: "system",
            content: simulatedStepInstruction({
              surface: args.surface,
              step,
              priorNotes,
              effort: args.effort,
              outputContract: args.outputContract,
            }),
          },
        ],
        {
          model: args.options.model,
          temperature:
            step === "draft" || step === "revise_draft" ? 0.35 : 0,
          maxTokens: simulatedSurfacePreparationMaxTokens(args.effort),
          topP: args.options.topP,
          topK: args.options.topK,
          repetitionPenalty: args.options.repetitionPenalty,
          reasoningEffort: args.effort,
          usagePurpose: "psychic_planning",
          signal: args.options.signal,
        },
      );
    } catch (error) {
      if (args.options.signal?.aborted) {
        throw args.options.signal.reason ?? error;
      }
      break;
    }
    const cleaned = cleanPrivatePreparation(raw, args.effort);
    if (cleaned) priorNotes = cleaned;
  }
  if (!priorNotes) return args.messages;
  return [
    ...args.messages,
    {
      role: "system",
      content: [
        "Private PRISM preparation notes follow. Use them silently and never mention them.",
        priorNotes,
        "Now produce only the requested visible output, following every original schema, persona, and procedural constraint.",
      ].join("\n"),
    },
  ];
}
