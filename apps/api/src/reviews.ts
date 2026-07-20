import { createHash } from "node:crypto";
import type {
  PrismReviewArtifactV1,
  PrismReviewEvidenceV1,
  PrismReviewResultV1,
  PrismReviewerSnapshotV1,
} from "@localai/shared";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "./providers.ts";

const PRISM_REVIEW_PROMPT_MAX_CHARACTERS = 24_000;
const PRISM_REVIEW_PERSONA_MAX_CHARACTERS = 6_000;
const PRISM_REVIEW_CONTEXT_VALUE_MAX_CHARACTERS = 2_000;

export interface PrismReviewRubricV1<TOutput> {
  id: string;
  version: number;
  instructions: readonly string[];
  outputInstruction: string;
  parse: (raw: string) => TOutput | null;
}

function stableReviewJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableReviewJson).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableReviewJson(record[key])}`)
    .join(",")}}`;
}

/** Stable provenance hash for immutable review inputs and persona snapshots. */
export function prismReviewHashV1(value: unknown): string {
  return createHash("sha256").update(stableReviewJson(value)).digest("hex");
}

function formatReviewEvidence(evidence: PrismReviewEvidenceV1): string {
  if (evidence.channel === "text") {
    return `[text:${evidence.id}] ${evidence.label}: ${evidence.content}`;
  }
  if (evidence.channel === "audio") {
    return `[audio:${evidence.id}] ${evidence.label}: ${evidence.transcript}`;
  }
  return `[${evidence.channel}:${evidence.id}] ${evidence.label}: ${evidence.description}`;
}

function boundedReviewEvidence(value: string): string {
  if (value.length <= PRISM_REVIEW_PROMPT_MAX_CHARACTERS) return value;
  const sideLength = Math.floor((PRISM_REVIEW_PROMPT_MAX_CHARACTERS - 92) / 2);
  return `${value.slice(0, sideLength)}\n\n[Middle of experienced evidence omitted for prompt length]\n\n${value.slice(-sideLength)}`;
}

/**
 * The generic reviewer sees only an applet-produced artifact. This function
 * deliberately accepts no episode, manuscript, session, or other raw state.
 */
export function buildPrismReviewMessagesV1<TOutput>(args: {
  artifact: PrismReviewArtifactV1;
  reviewer: PrismReviewerSnapshotV1;
  rubric: PrismReviewRubricV1<TOutput>;
}): ProviderMessage[] {
  const context = Object.entries(args.artifact.context)
    .map(
      ([key, value]) =>
        `${key.slice(0, 120)}: ${
          value === null
            ? "(none)"
            : String(value).slice(0, PRISM_REVIEW_CONTEXT_VALUE_MAX_CHARACTERS)
        }`,
    )
    .join("\n");
  const evidence = boundedReviewEvidence(
    args.artifact.evidence.map(formatReviewEvidence).join("\n\n"),
  );
  return [
    {
      role: "system",
      content: [
        `You are ${args.reviewer.reviewerName}.`,
        `Your persona: ${args.reviewer.systemPrompt.slice(0, PRISM_REVIEW_PERSONA_MAX_CHARACTERS)}`,
        "Review only the supplied experience artifact from its stated perspective.",
        "Do not infer hidden dialogue, private state, omitted events, or implementation details. Anything absent from the artifact was not experienced by this reviewer.",
        ...args.rubric.instructions,
        args.rubric.outputInstruction,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "PRISM Review Artifact v1",
        `Applet: ${args.artifact.appletId.slice(0, 120)}`,
        `Subject: ${args.artifact.subjectTitle.slice(0, 500)}`,
        `Perspective: ${args.artifact.perspectiveLabel.slice(0, 240)} (${args.artifact.perspective})`,
        context ? `\nContext:\n${context}` : "",
        "\nExperienced evidence:",
        evidence || "No perceptible evidence was captured.",
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ];
}

export async function runPrismReviewV1<TOutput>(args: {
  artifact: PrismReviewArtifactV1;
  reviewer: PrismReviewerSnapshotV1;
  rubric: PrismReviewRubricV1<TOutput>;
  provider: LlmProvider;
  model?: string;
  generationOptions?: Omit<GenerateOptions, "model">;
  now?: () => string;
}): Promise<PrismReviewResultV1<TOutput> | null> {
  const raw = await args.provider.generateResponse(
    buildPrismReviewMessagesV1(args),
    {
      ...args.generationOptions,
      ...(args.model ? { model: args.model } : {}),
    },
  );
  let output: TOutput | null;
  try {
    output = args.rubric.parse(raw);
  } catch {
    output = null;
  }
  if (output === null) return null;
  return {
    version: 1,
    artifactHash: prismReviewHashV1(args.artifact),
    reviewerSnapshotHash: prismReviewHashV1(args.reviewer),
    reviewerSnapshot: args.reviewer,
    rubricId: args.rubric.id,
    rubricVersion: args.rubric.version,
    provider: args.provider.name,
    model: args.model ?? null,
    createdAt: args.now?.() ?? new Date().toISOString(),
    output,
  };
}
