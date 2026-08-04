import {
  modelSupportsNativeReasoningEffort,
  reasoningGenerationBudgetMs,
  type NativeReasoningEffortProvider,
  type ReasoningEffort,
} from "@localai/shared";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "./providers.ts";

export type SimulatedEffortSurface =
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

const SIMULATED_EFFORT_STEPS: Record<
  Exclude<ReasoningEffort, "auto" | "none">,
  readonly ("plan" | "draft" | "audit" | "revision")[]
> = {
  minimal: ["plan"],
  low: ["plan"],
  medium: ["plan", "audit"],
  high: ["plan", "draft", "audit"],
  xhigh: ["plan", "draft", "audit", "revision"],
};

function simulatedStepInstruction(args: {
  surface: SimulatedEffortSurface;
  step: "plan" | "draft" | "audit" | "revision";
  priorNotes: string;
  outputContract?: string;
}): string {
  const task =
    args.step === "plan"
      ? "Make a concise response plan with the key intent, factual or procedural checks, and persona choices."
      : args.step === "draft"
        ? "Sketch a concise candidate response that follows the plan."
        : args.step === "audit"
          ? "Audit the preparation for missed instructions, contradictions, weak reasoning, schema risks, and character drift. Return corrections only."
          : "Produce a concise final response blueprint incorporating the useful corrections.";
  return [
    `Private PRISM ${args.surface} preparation pass: ${args.step}.`,
    task,
    args.outputContract
      ? `Visible-output contract: ${args.outputContract}`
      : "Preserve every visible-output constraint from the conversation.",
    args.priorNotes
      ? `Earlier private notes:\n${args.priorNotes}`
      : "Do not write chain-of-thought. Return only short actionable preparation notes.",
    "These notes are ephemeral and will never be shown or persisted.",
  ].join("\n");
}

function cleanPrivatePreparation(raw: string): string {
  return raw.replace(/\s+/gu, " ").trim().slice(0, 1_800);
}

export function shouldPrepareMessagesWithSimulatedEffort(args: {
  provider: NativeReasoningEffortProvider;
  model: string;
  effort: ReasoningEffort | null | undefined;
}): boolean {
  if (!args.effort || args.effort === "auto" || args.effort === "none") {
    return false;
  }
  return !modelSupportsNativeReasoningEffort(args.provider, args.model);
}

export async function prepareMessagesWithSimulatedEffort(args: {
  provider: LlmProvider;
  messages: ProviderMessage[];
  options: GenerateOptions;
  effort: ReasoningEffort | null | undefined;
  surface: SimulatedEffortSurface;
  outputContract?: string;
}): Promise<ProviderMessage[]> {
  if (!args.effort || args.effort === "auto" || args.effort === "none") {
    return args.messages;
  }
  const steps = SIMULATED_EFFORT_STEPS[args.effort];
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
              outputContract: args.outputContract,
            }),
          },
        ],
        {
          model: args.options.model,
          temperature: step === "draft" ? 0.35 : 0,
          maxTokens: args.effort === "minimal" ? 120 : 220,
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
    const cleaned = cleanPrivatePreparation(raw);
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
