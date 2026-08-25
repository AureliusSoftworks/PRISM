import {
  modelSupportsNativeReasoningEffort,
  reasoningGenerationBudgetMs,
  normalizeSimulatedEffortLadderProfile,
  simulatedEffortLadderPasses,
  simulatedEffortUsesThriftyPrompting,
  simulatedSurfacePreparationMaxTokens,
  simulatedSurfacePreparationNoteMaxChars,
  type NativeReasoningEffortProvider,
  type ProviderReasoningEffort,
  type ReasoningEffort,
  type SimulatedEffortLadderProfile,
  type SimulatedEffortPassName,
} from "@localai/shared";
import {
  localModelSupportsNativeThinking,
  type GenerateOptions,
  type LlmProvider,
  type ProviderMessage,
} from "./providers.ts";

export type SimulatedEffortSurface =
  | "bots"
  | "coffee"
  | "signal"
  | "debate"
  | "prism-refract"
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
  effort: ProviderReasoningEffort | null | undefined;
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
  let removeAbortListener = (): void => undefined;
  const abortFailure = new Promise<never>((_resolve, reject) => {
    const rejectForAbort = (): void => {
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new DOMException("Generation cancelled.", "AbortError"),
      );
    };
    if (signal.aborted) {
      rejectForAbort();
      return;
    }
    signal.addEventListener("abort", rejectForAbort, { once: true });
    removeAbortListener = () => signal.removeEventListener("abort", rejectForAbort);
  });
  try {
    // Most providers honor AbortSignal, but one that does not must never turn
    // the shared reasoning budget into an infinite wait.
    return await Promise.race([
      Promise.resolve().then(() => args.run(signal)),
      abortFailure,
    ]);
  } catch (error) {
    if (args.signal?.aborted) throw args.signal.reason ?? error;
    if (timedOut) throw new ReasoningGenerationTimeoutError(timeoutMs);
    throw error;
  } finally {
    removeAbortListener();
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

/** Cuts at a line or sentence boundary so a note never ends mid-word. */
function truncatePreparationAtBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const clipped = text.slice(0, maxChars);
  const boundary = Math.max(
    clipped.lastIndexOf("\n"),
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("; "),
  );
  return (
    boundary > Math.floor(maxChars / 2) ? clipped.slice(0, boundary) : clipped
  ).trim();
}

/**
 * Every pass prompt asks for short bullets, so horizontal whitespace collapses
 * but newlines survive: flattening a checklist into one run-on line was
 * throwing away the structure the pass was told to produce.
 */
function cleanPrivatePreparation(raw: string, effort: ReasoningEffort): string {
  const structured = raw
    .replace(/\r\n?/gu, "\n")
    .replace(/```[^\n]*\n?/gu, "")
    .replace(/[^\S\n]+/gu, " ")
    .replace(/[ \t]*\n[ \t]*/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return truncatePreparationAtBoundary(
    structured,
    simulatedSurfacePreparationNoteMaxChars(effort),
  );
}

/**
 * Appending a system turn *after* the final user turn breaks some Ollama chat
 * templates: llama3.2 — the design baseline — returns an empty completion
 * outright. Private guidance is therefore inserted before the last user turn,
 * matching the Chat Psychic path. Without this every simulated pass on the
 * baseline model returned "", no notes were ever produced, and the whole
 * ladder was a silent no-op that still charged four extra model calls.
 */
function withPrivateGuidanceMessage(
  messages: readonly ProviderMessage[],
  content: string,
  /**
   * Restated on the final user turn. Small locals attend far more to the last
   * user message than to system guidance, and the observed failures are
   * output-shape misses rather than reasoning misses.
   */
  reinforcement?: string,
): ProviderMessage[] {
  const guidance: ProviderMessage = { role: "system", content };
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      const finalUser: ProviderMessage = reinforcement
        ? { ...message, content: `${message.content}\n\n${reinforcement}` }
        : message;
      return [
        ...messages.slice(0, index),
        guidance,
        finalUser,
        ...messages.slice(index + 1),
      ];
    }
  }
  return [...messages, guidance];
}

interface SimulatedEffortNote {
  step: SimulatedEffortPassName;
  text: string;
}

const SIMULATED_EFFORT_PASS_LABELS: Record<SimulatedEffortPassName, string> = {
  plan: "Plan",
  alternatives: "Chosen approach",
  draft: "Draft",
  audit: "Corrections",
  red_team: "Risks and guards",
  constraint_lock: "Must keep",
  revise_draft: "Revised draft",
  compliance_sweep: "Enforce",
  synthesis: "Final blueprint",
  revision: "Final blueprint",
};

/**
 * Share of the effort's note budget each pass may occupy. Proportional caps
 * mean every completed pass reaches the visible turn: a first-come budget let
 * one long pass crowd out the rest.
 */
const SIMULATED_EFFORT_BRIEF_SHARE: Record<SimulatedEffortPassName, number> = {
  plan: 0.24,
  alternatives: 0.1,
  draft: 0.2,
  revise_draft: 0.2,
  audit: 0.16,
  red_team: 0.12,
  constraint_lock: 0.16,
  compliance_sweep: 0.12,
  synthesis: 0.3,
  revision: 0.3,
};

/** Hard requirements and the distillation land last, where models weight them most. */
const SIMULATED_EFFORT_BRIEF_ORDER: readonly SimulatedEffortPassName[] = [
  "plan",
  "alternatives",
  "draft",
  "revise_draft",
  "audit",
  "red_team",
  "compliance_sweep",
  "constraint_lock",
  "synthesis",
  "revision",
];

function simulatedEffortNoteSections(
  notes: readonly SimulatedEffortNote[],
  effort: ReasoningEffort,
): string[] {
  const byStep = new Map<SimulatedEffortPassName, string>();
  for (const note of notes) byStep.set(note.step, note.text);
  // A revision supersedes the draft it replaced; keeping both wastes budget
  // and invites the model to merge two candidate answers.
  if (byStep.has("revise_draft")) byStep.delete("draft");
  if (byStep.has("synthesis")) byStep.delete("revision");
  const budget = simulatedSurfacePreparationNoteMaxChars(effort);
  return SIMULATED_EFFORT_BRIEF_ORDER.flatMap((step) => {
    const text = byStep.get(step);
    if (!text) return [];
    const share = Math.max(
      80,
      Math.round(budget * SIMULATED_EFFORT_BRIEF_SHARE[step]),
    );
    const clamped = truncatePreparationAtBoundary(text, share);
    return clamped
      ? [`${SIMULATED_EFFORT_PASS_LABELS[step]}: ${clamped}`]
      : [];
  });
}

/**
 * Notes handed to the next pass. The newest passes matter most to the step
 * about to run, so the oldest are dropped first when the budget is tight.
 */
function renderSimulatedEffortPriorNotes(
  notes: readonly SimulatedEffortNote[],
  effort: ReasoningEffort,
): string {
  if (notes.length === 0) return "";
  const budget = simulatedSurfacePreparationNoteMaxChars(effort);
  const blocks: string[] = [];
  let used = 0;
  for (let index = notes.length - 1; index >= 0; index -= 1) {
    const note = notes[index];
    if (!note) continue;
    const block = `${SIMULATED_EFFORT_PASS_LABELS[note.step]}: ${note.text}`;
    if (used + block.length > budget && blocks.length > 0) break;
    blocks.unshift(block);
    used += block.length;
  }
  return blocks.join("\n");
}

export function shouldPrepareMessagesWithSimulatedEffort(args: {
  provider: NativeReasoningEffortProvider;
  model: string;
  effort: ProviderReasoningEffort | null | undefined;
}): boolean {
  if (!args.effort || args.effort === "auto" || args.effort === "none") {
    return false;
  }
  if (args.effort === "max") return false;
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
  if (
    args.effort === "minimal" &&
    (await localModelSupportsNativeThinking(args.options.model))
  ) {
    // Minimal on a thinking-capable model is pure native reasoning: the
    // model's own chain-of-thought replaces the single simulated pass.
    return args.messages;
  }
  const ladderProfile = normalizeSimulatedEffortLadderProfile(
    args.ladderProfile,
  );
  const steps = simulatedEffortLadderPasses(args.effort, ladderProfile);
  // Notes accumulate. Overwriting them meant each pass saw only the one before
  // it, and the visible turn saw only the last — so High effort shipped a bare
  // correction list with the plan and draft it referred to already discarded.
  const notes: SimulatedEffortNote[] = [];
  for (const step of steps) {
    if (args.options.signal?.aborted) throw args.options.signal.reason;
    let raw: string;
    try {
      raw = await args.provider.generateResponse(
        withPrivateGuidanceMessage(
          args.messages,
          simulatedStepInstruction({
            surface: args.surface,
            step,
            priorNotes: renderSimulatedEffortPriorNotes(notes, args.effort),
            effort: args.effort,
            outputContract: args.outputContract,
          }),
        ),
        {
          model: args.options.model,
          // Alternatives only earns its pass if the options genuinely differ,
          // which a deterministic sample cannot produce.
          temperature:
            step === "alternatives"
              ? 0.6
              : step === "draft" || step === "revise_draft"
                ? 0.35
                : 0,
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
    if (cleaned) notes.push({ step, text: cleaned });
  }
  const sections = simulatedEffortNoteSections(notes, args.effort);
  if (sections.length === 0) return args.messages;
  // Restating the output contract on the final user turn was measured on the
  // local eval and made things slightly worse (it cost letter-count-sort and
  // gained nothing), so the contract stays in the pass prompts only.
  return withPrivateGuidanceMessage(
    args.messages,
    [
      "Private PRISM preparation notes follow. Use them silently: never quote them, never mention planning, never describe your process.",
      sections.join("\n"),
      "The original request, persona, and output contract outrank these notes wherever they disagree. Produce only the requested visible output, with no preamble.",
    ].join("\n\n"),
  );
}
