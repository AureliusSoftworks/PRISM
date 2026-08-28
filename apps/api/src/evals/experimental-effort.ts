import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage, ReasoningEffort } from "@localai/shared";
import { REASONING_EFFORT_VALUES } from "@localai/shared";
import type { ProviderName } from "../providers.ts";

type EvalRunId =
  | "local-baseline"
  | "thinking-reference"
  | "local-simulated-effort"
  | "online-single-call-baseline"
  | "online-simulated-high";

type EvalSuiteId =
  | "none"
  | "cafe"
  | "soft-transfer"
  | "soft-continuity"
  | "soft-continuity-memory";

interface CliOptions {
  prompt: string;
  suite: EvalSuiteId;
  thinkingProvider: "openai" | "anthropic";
  localModel: string;
  thinkingModel: string;
  judgeModel: string;
  effort: ReasoningEffort;
  outDir: string;
  temperature: number;
  maxTokens: number;
  noJudge: boolean;
  includeScratchpad: boolean;
  keepDb: boolean;
  onlineSimulationModel: string | null;
  acknowledgePaidMultiCall: boolean;
}

interface ContinuityScore {
  total: number;
  max: number;
  checks: Record<string, boolean>;
}

interface SoftContinuityCase {
  id: string;
  title: string;
  /**
   * Seeded thread compact facts (not repeated in the user prompt).
   * Use with mode sandbox (default) or zen.
   */
  threadSummary?: string;
  /**
   * Encrypted memory texts seeded via persistMemoryCandidates.
   * Requires mode "zen" so companion retrieval injects memory hints.
   */
  memoryHints?: string[];
  /** Lane for the eval turn. Defaults: zen when memoryHints present, else sandbox. */
  mode?: "sandbox" | "zen";
  prompt: string;
  mustInclude: string[];
  mustExclude?: string[];
  requiredLabels?: string[];
}

interface EvalRunConfig {
  id: EvalRunId;
  label: string;
  provider: ProviderName;
  model: string;
  reasoningEffort: ReasoningEffort;
  experimentalAllModelEffortEnabled: boolean;
  psychicModeEnabled: boolean;
  requiresApiKey: "openai" | "anthropic" | null;
  expectedSimulated: boolean;
  callBehavior:
    | "ordinary-single-visible-call"
    | "private-pass-ladder-plus-visible-call";
}

interface EvalRunResult {
  id: EvalRunId;
  label: string;
  provider: ProviderName;
  model: string;
  reasoningEffort: ReasoningEffort;
  experimentalAllModelEffortEnabled: boolean;
  psychicModeEnabled: boolean;
  expectedSimulated: boolean;
  simulated: boolean;
  passCount: number;
  callBehavior: EvalRunConfig["callBehavior"];
  provenanceVerified: boolean;
  status: "ok" | "skipped" | "error";
  durationMs: number;
  assistant: string;
  assistantChars: number;
  error?: string;
  psychicThought?: ChatMessage["psychicThought"];
  psychicDebug?: {
    summary: string;
    effort: ReasoningEffort;
    provider: ProviderName;
    model?: string;
    simulated: boolean;
    passCount?: number;
    passes?: Array<{
      name:
        | "plan"
        | "alternatives"
        | "draft"
        | "audit"
        | "red_team"
        | "constraint_lock"
        | "revise_draft"
        | "compliance_sweep"
        | "synthesis"
        | "revision";
      chars: number;
      warning?: string;
    }>;
    guidanceChars?: number;
    scratchpadChars: number;
    scratchpad?: string;
  };
  planningWarnings?: string[];
  continuityScore?: ContinuityScore;
  continuityDigestSeen?: boolean;
}

interface EvalReport {
  schema: "prism-experimental-effort-eval-v1";
  createdAt: string;
  prompt: string;
  options: Omit<CliOptions, "prompt" | "includeScratchpad" | "keepDb"> & {
    includeScratchpad: boolean;
  };
  tempDbPath: string;
  runs: EvalRunResult[];
  judge?: unknown;
  continuity?: {
    threadSummary?: string;
    memoryHints?: string[];
    mode?: "sandbox" | "zen";
    mustInclude: string[];
    mustExclude?: string[];
    requiredLabels?: string[];
  };
}

export const DEFAULT_PROMPT = [
  "A cafe has 3 baristas and must cover Sat 8am–6pm.",
  "Shifts must be 4 hours. No barista works more than 8 hours.",
  "Alice can't work before noon. Bob can't close. Cara can do any shift.",
  "Produce:",
  "1) a coverage schedule as a Markdown table with columns: Time, Barista",
  "2) exactly 3 rows of uncovered risk notes labeled R1–R3",
  "3) one sentence saying whether the schedule is feasible",
  "",
  "Constraints:",
  "- Use only Alice, Bob, Cara",
  "- Do not invent extra staff",
  "- Keep the whole answer under 220 words",
  "- Do not show step-by-step private reasoning",
].join("\n");

/** Softer Phase A transfer prompts: checkable constraints, no scheduling puzzle. */
const SOFT_TRANSFER_CASES: ReadonlyArray<{
  id: string;
  title: string;
  prompt: string;
}> = [
  {
    id: "labels-s1-s3",
    title: "Exact S1–S3 labels + forbidden word",
    prompt: [
      "List exactly 3 steps to water a houseplant.",
      "",
      "Constraints:",
      "- Label them S1, S2, and S3 exactly (not 1, 2, 3)",
      "- Each step max 12 words",
      "- Do not use the word just",
      "- Keep the whole answer under 80 words",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
  },
  {
    id: "key-phrases-local",
    title: "Required key phrases (local + private planning pass)",
    prompt: [
      "In exactly 2 sentences, explain how Prism can keep a chat on the user's machine.",
      "",
      "Constraints:",
      "- Include the word local",
      "- Use the exact phrase private planning pass once",
      "- Keep under 60 words",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
  },
  {
    id: "tiny-table-whitelist",
    title: "Tiny table with item whitelist",
    prompt: [
      "Make a Markdown table with columns: Item, Qty for a picnic for 2 people.",
      "",
      "Constraints:",
      "- Exactly 4 data rows",
      "- Use only these items: bread, cheese, apples, water",
      "- Do not invent extra items",
      "- Keep under 80 words",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
  },
];

/**
 * Phase B soft continuity: facts live only in seeded thread compact.
 * User prompt asks for a labeled recall without restating the keys.
 */
const SOFT_CONTINUITY_CASES: ReadonlyArray<SoftContinuityCase> = [
  {
    id: "pet-prefs-compact",
    title: "Pet + allergy + brevity from thread compact",
    mode: "sandbox",
    threadSummary: [
      "User keeps a cat named Miso.",
      "User is allergic to shellfish.",
      "User prefers short answers.",
    ].join(" "),
    prompt: [
      "Using only earlier thread context, remind me of three facts.",
      "",
      "Constraints:",
      "- Label them P1, P2, and P3 exactly",
      "- P1 = pet name, P2 = food to avoid, P3 = answer length preference",
      "- Keep under 60 words",
      "- Do not invent facts that are not in earlier thread context",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
    mustInclude: ["Miso", "shellfish", "short"],
    requiredLabels: ["P1", "P2", "P3"],
  },
  {
    id: "project-codename-compact",
    title: "Codename + ship date + LOCAL from thread compact",
    mode: "sandbox",
    threadSummary: [
      "Project codename is Lumen Gate.",
      "Ship date is 2026-09-12.",
      "Provider mode must stay LOCAL only.",
    ].join(" "),
    prompt: [
      "Fill a Markdown table with columns: Field, Value for exactly these three fields from earlier thread context: Codename, Ship date, Provider mode.",
      "",
      "Constraints:",
      "- Exactly 3 data rows",
      "- Keep under 70 words",
      "- Do not invent values",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
    mustInclude: ["Lumen Gate", "2026-09-12", "LOCAL"],
  },
  {
    id: "meeting-facts-compact",
    title: "Meeting day/room/bring from thread compact",
    mode: "sandbox",
    threadSummary: [
      "Standing meeting is Tuesday at 3pm.",
      "Room is Cedar.",
      "Bring a printed agenda.",
    ].join(" "),
    prompt: [
      "Using earlier thread context, list exactly 3 bullets.",
      "",
      "Constraints:",
      "- Label them B1, B2, and B3 exactly",
      "- B1 = day and time, B2 = room, B3 = what to bring",
      "- Keep under 50 words",
      "- Do not invent details",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
    mustInclude: ["Tuesday", "Cedar", "agenda"],
    requiredLabels: ["B1", "B2", "B3"],
  },
];

/**
 * Phase B soft continuity via encrypted memories (Zen retrieval).
 * Facts live only in seeded memories — not in the user prompt or thread compact.
 */
const SOFT_CONTINUITY_MEMORY_CASES: ReadonlyArray<SoftContinuityCase> = [
  {
    id: "drink-prefs-memory",
    title: "Drink + milk + nickname from encrypted memories",
    mode: "zen",
    memoryHints: [
      "The user prefers an oat-milk cortado.",
      "The user's favorite cafe drink nickname is Aurora Blend.",
      "The user wants drink answers kept short.",
    ],
    prompt: [
      "Using only remembered user preferences, remind me of three drink facts.",
      "",
      "Constraints:",
      "- Label them D1, D2, and D3 exactly",
      "- D1 = drink style, D2 = milk choice, D3 = drink nickname",
      "- Keep under 60 words",
      "- Do not invent preferences",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
    mustInclude: ["cortado", "oat", "Aurora Blend"],
    requiredLabels: ["D1", "D2", "D3"],
  },
  {
    id: "travel-plan-memory",
    title: "City + month + lodging from encrypted memories",
    mode: "zen",
    memoryHints: [
      "The user's next trip city is Lisbon.",
      "The user travels in October.",
      "The user stays at Alfama Loft.",
    ],
    prompt: [
      "Using only remembered travel preferences, fill a Markdown table with columns: Field, Value for City, Month, Lodging.",
      "",
      "Constraints:",
      "- Exactly 3 data rows",
      "- Keep under 70 words",
      "- Do not invent values",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
    mustInclude: ["Lisbon", "October", "Alfama Loft"],
  },
  {
    id: "format-prefs-memory",
    title: "Format + forbidden word + units from encrypted memories",
    mode: "zen",
    memoryHints: [
      "The user prefers answers in Markdown tables.",
      "The user forbids the word basically.",
      "The user prefers metric units.",
    ],
    prompt: [
      "Using only remembered writing preferences, list exactly 3 bullets.",
      "",
      "Constraints:",
      "- Label them F1, F2, and F3 exactly",
      "- F1 = preferred format, F2 = forbidden word, F3 = unit system",
      "- Keep under 50 words",
      "- Do not invent preferences",
      "- Do not show step-by-step private reasoning",
    ].join("\n"),
    mustInclude: ["Markdown", "basically", "metric"],
    requiredLabels: ["F1", "F2", "F3"],
  },
];

const DEFAULT_OPTIONS: CliOptions = {
  prompt: DEFAULT_PROMPT,
  suite: "none",
  thinkingProvider: "openai",
  localModel: "llama3.2",
  thinkingModel: "gpt-5.5",
  judgeModel: "gpt-5.5",
  effort: "high",
  outDir: "artifacts/experimental-effort-evals",
  temperature: 0.25,
  maxTokens: 3200,
  noJudge: false,
  includeScratchpad: false,
  keepDb: false,
  onlineSimulationModel: null,
  acknowledgePaidMultiCall: false,
};

function printHelp(): void {
  console.log(`Experimental Effort eval harness

Runs the same prompt through:
  1. local baseline (${DEFAULT_OPTIONS.localModel}, no simulated effort)
  2. thinking reference (${DEFAULT_OPTIONS.thinkingModel}, native effort)
  3. local simulated effort (${DEFAULT_OPTIONS.localModel}, tiered private passes + final pass)

Eval-only paid online comparison (requires both explicit flags):
  A. OpenAI model ordinary single visible call (Effort None)
  B. The same OpenAI model with PRISM simulated High private passes + final call

Usage:
  npm run eval:experimental-effort -- [options]
  node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/experimental-effort.ts [options]

Options:
  --prompt <text>              Override the default comparison prompt.
  --suite <id>                 none (default single prompt) | cafe | soft-transfer | soft-continuity | soft-continuity-memory
                               soft-transfer runs 3 easier Phase A transfer prompts.
                               soft-continuity runs 3 Phase B thread-compact recall prompts.
                               soft-continuity-memory runs 3 Phase B encrypted-memory recall prompts.
  --local-model <id>           Local non-reasoning model. Default: ${DEFAULT_OPTIONS.localModel}
  --thinking-provider <name>   Strong reference provider: openai|anthropic. Default: ${DEFAULT_OPTIONS.thinkingProvider}
  --thinking-model <id>        Strong reference model. Default: ${DEFAULT_OPTIONS.thinkingModel}; claude-opus-4-8 with --thinking-provider anthropic
  --judge-model <id>           OpenAI judge model. Default: ${DEFAULT_OPTIONS.judgeModel}
  --effort <value>             none|minimal|low|medium|high|xhigh. Default: ${DEFAULT_OPTIONS.effort}
  --temperature <number>       Generation temperature. Default: ${DEFAULT_OPTIONS.temperature}
  --max-tokens <number>        Max completion tokens per run. Default: ${DEFAULT_OPTIONS.maxTokens}
  --out-dir <path>             Where JSON/Markdown reports are written.
  --no-judge                   Skip the blind judge comparison.
  --include-scratchpad         Include simulated scratchpad in the JSON artifact.
  --keep-db                    Keep the temporary SQLite DB for inspection.
  --same-model-online-simulation <model>
                               Eval-only A/B using one OpenAI non-native-effort model.
                               Forces the canonical cafe prompt and never changes product routing.
  --acknowledge-paid-multi-call
                               Required acknowledgement that the simulated arm makes multiple paid
                               calls to the selected online model and the blind judge adds a paid call.
  --help                       Show this help.
`);
}

export function readCliOptions(argv: string[]): CliOptions | null {
  const options: CliOptions = { ...DEFAULT_OPTIONS };
  let thinkingModelProvided = false;
  let promptProvided = false;
  let suiteProvided = false;
  let effortProvided = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      index += 1;
      return value;
    };
    switch (arg) {
      case "--help":
      case "-h":
        printHelp();
        return null;
      case "--prompt":
        options.prompt = next();
        promptProvided = true;
        break;
      case "--suite": {
        const suite = next().trim().toLowerCase();
        if (
          suite !== "none" &&
          suite !== "cafe" &&
          suite !== "soft-transfer" &&
          suite !== "soft-continuity" &&
          suite !== "soft-continuity-memory"
        ) {
          throw new Error(
            `Unsupported suite: ${suite}. Use none|cafe|soft-transfer|soft-continuity|soft-continuity-memory.`,
          );
        }
        options.suite = suite;
        suiteProvided = true;
        break;
      }
      case "--local-model":
        options.localModel = next();
        break;
      case "--thinking-provider": {
        const provider = next().trim().toLowerCase();
        if (provider !== "openai" && provider !== "anthropic") {
          throw new Error(`Unsupported thinking provider: ${provider}`);
        }
        options.thinkingProvider = provider;
        break;
      }
      case "--thinking-model":
        options.thinkingModel = next();
        thinkingModelProvided = true;
        break;
      case "--judge-model":
        options.judgeModel = next();
        break;
      case "--effort": {
        const effort = next().trim().toLowerCase();
        if (!REASONING_EFFORT_VALUES.includes(effort as ReasoningEffort)) {
          throw new Error(`Unsupported effort: ${effort}`);
        }
        options.effort = effort as ReasoningEffort;
        effortProvided = true;
        break;
      }
      case "--temperature":
        options.temperature = Number(next());
        break;
      case "--max-tokens":
        options.maxTokens = Number(next());
        break;
      case "--out-dir":
        options.outDir = next();
        break;
      case "--no-judge":
        options.noJudge = true;
        break;
      case "--include-scratchpad":
        options.includeScratchpad = true;
        break;
      case "--keep-db":
        options.keepDb = true;
        break;
      case "--same-model-online-simulation":
        options.onlineSimulationModel = next().trim();
        break;
      case "--acknowledge-paid-multi-call":
        options.acknowledgePaidMultiCall = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isFinite(options.temperature)) {
    throw new Error("--temperature must be a number.");
  }
  if (!Number.isFinite(options.maxTokens) || options.maxTokens <= 0) {
    throw new Error("--max-tokens must be a positive number.");
  }
  if (options.thinkingProvider === "anthropic" && !thinkingModelProvided) {
    options.thinkingModel = "claude-opus-4-8";
  }
  if (options.onlineSimulationModel !== null) {
    if (!options.onlineSimulationModel) {
      throw new Error("--same-model-online-simulation requires a model id.");
    }
    if (!options.acknowledgePaidMultiCall) {
      throw new Error(
        "--same-model-online-simulation requires --acknowledge-paid-multi-call because the simulated arm makes multiple paid online calls.",
      );
    }
    if (options.includeScratchpad) {
      throw new Error(
        "--include-scratchpad is not allowed for the paid same-model online comparison; private scratchpads stay out of artifacts.",
      );
    }
    if (promptProvided || (suiteProvided && options.suite !== "cafe")) {
      throw new Error(
        "The paid same-model online comparison is pinned to --suite cafe and does not accept a custom prompt.",
      );
    }
    if (effortProvided && options.effort !== "high") {
      throw new Error(
        "The paid same-model online comparison is pinned to --effort high.",
      );
    }
    options.suite = "cafe";
    options.prompt = DEFAULT_PROMPT;
    options.effort = "high";
  } else if (options.acknowledgePaidMultiCall) {
    throw new Error(
      "--acknowledge-paid-multi-call is only valid with --same-model-online-simulation <model>.",
    );
  }
  return options;
}

export function evalRuns(options: CliOptions): EvalRunConfig[] {
  if (options.onlineSimulationModel) {
    return [
      {
        id: "online-single-call-baseline",
        label: "A — OpenAI ordinary single-call baseline",
        provider: "openai",
        model: options.onlineSimulationModel,
        reasoningEffort: "none",
        experimentalAllModelEffortEnabled: false,
        psychicModeEnabled: false,
        requiresApiKey: "openai",
        expectedSimulated: false,
        callBehavior: "ordinary-single-visible-call",
      },
      {
        id: "online-simulated-high",
        label: "B — OpenAI PRISM simulated High",
        provider: "openai",
        model: options.onlineSimulationModel,
        reasoningEffort: "high",
        experimentalAllModelEffortEnabled: false,
        psychicModeEnabled: false,
        requiresApiKey: "openai",
        expectedSimulated: true,
        callBehavior: "private-pass-ladder-plus-visible-call",
      },
    ];
  }
  return [
    {
      id: "local-baseline",
      label: "Local baseline",
      provider: "local",
      model: options.localModel,
      reasoningEffort: "none",
      experimentalAllModelEffortEnabled: false,
      psychicModeEnabled: false,
      requiresApiKey: null,
      expectedSimulated: false,
      callBehavior: "ordinary-single-visible-call",
    },
    {
      id: "thinking-reference",
      label: "Thinking reference",
      provider: options.thinkingProvider,
      model: options.thinkingModel,
      reasoningEffort: options.effort,
      experimentalAllModelEffortEnabled: false,
      psychicModeEnabled: false,
      requiresApiKey: options.thinkingProvider,
      expectedSimulated: false,
      callBehavior: "ordinary-single-visible-call",
    },
    {
      id: "local-simulated-effort",
      label: "Local simulated effort",
      provider: "local",
      model: options.localModel,
      reasoningEffort: options.effort,
      // Product-default lean ladder (deep ladder is Settings experimental).
      experimentalAllModelEffortEnabled: false,
      psychicModeEnabled: true,
      requiresApiKey: null,
      expectedSimulated: true,
      callBehavior: "private-pass-ladder-plus-visible-call",
    },
  ];
}

function lastAssistant(messages: readonly ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}

function lastUser(messages: readonly ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") return message;
  }
  return undefined;
}

function extractJsonObject(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error("Judge did not return JSON.");
  }
}

function redactedOptions(options: CliOptions): EvalReport["options"] {
  return {
    suite: options.suite,
    thinkingProvider: options.thinkingProvider,
    localModel: options.localModel,
    thinkingModel: options.thinkingModel,
    judgeModel: options.judgeModel,
    effort: options.effort,
    outDir: options.outDir,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    noJudge: options.noJudge,
    includeScratchpad: options.includeScratchpad,
    onlineSimulationModel: options.onlineSimulationModel,
    acknowledgePaidMultiCall: options.acknowledgePaidMultiCall,
  };
}

export function evalRunProvenance(
  run: Pick<EvalRunConfig, "expectedSimulated" | "callBehavior">,
  psychicDebug: EvalRunResult["psychicDebug"] | undefined,
): Pick<
  EvalRunResult,
  "simulated" | "passCount" | "callBehavior" | "provenanceVerified"
> {
  const simulated = psychicDebug?.simulated === true;
  const passCount = psychicDebug?.passCount ?? 0;
  return {
    simulated,
    passCount,
    callBehavior: run.callBehavior,
    provenanceVerified:
      simulated === run.expectedSimulated &&
      (run.expectedSimulated ? passCount > 0 : passCount === 0),
  };
}

function resolveSuiteCases(
  options: CliOptions,
): Array<{
  id: string;
  title: string;
  prompt: string;
  continuity?: SoftContinuityCase;
}> {
  if (options.suite === "soft-transfer") {
    return SOFT_TRANSFER_CASES.map((item) => ({ ...item }));
  }
  if (options.suite === "soft-continuity") {
    return SOFT_CONTINUITY_CASES.map((item) => ({
      id: item.id,
      title: item.title,
      prompt: item.prompt,
      continuity: item,
    }));
  }
  if (options.suite === "soft-continuity-memory") {
    return SOFT_CONTINUITY_MEMORY_CASES.map((item) => ({
      id: item.id,
      title: item.title,
      prompt: item.prompt,
      continuity: item,
    }));
  }
  if (options.suite === "cafe") {
    return [
      {
        id: "cafe-staffing",
        title: "Cafe staffing (stretch)",
        prompt: DEFAULT_PROMPT,
      },
    ];
  }
  return [
    {
      id: "custom",
      title: "Single prompt",
      prompt: options.prompt,
    },
  ];
}

function scoreContinuityAnswer(
  answer: string,
  continuity: SoftContinuityCase,
): ContinuityScore {
  const haystack = answer.toLowerCase();
  const checks: Record<string, boolean> = {};
  for (const needle of continuity.mustInclude) {
    checks[`includes:${needle}`] = haystack.includes(needle.toLowerCase());
  }
  for (const needle of continuity.mustExclude ?? []) {
    checks[`excludes:${needle}`] = !haystack.includes(needle.toLowerCase());
  }
  for (const label of continuity.requiredLabels ?? []) {
    const pattern = new RegExp(
      `(^|\\n|\\s)${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([:\\)\\].\\s]|$)`,
      "i",
    );
    checks[`label:${label}`] = pattern.test(answer);
  }
  const total = Object.values(checks).filter(Boolean).length;
  return {
    total,
    max: Object.keys(checks).length,
    checks,
  };
}

function continuityModeForCase(
  continuity: SoftContinuityCase,
): "sandbox" | "zen" {
  if (continuity.mode === "sandbox" || continuity.mode === "zen") {
    return continuity.mode;
  }
  return continuity.memoryHints && continuity.memoryHints.length > 0
    ? "zen"
    : "sandbox";
}

async function seedContinuityConversation(args: {
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  conversationId: string;
  continuity: SoftContinuityCase;
}): Promise<void> {
  const now = new Date().toISOString();
  const mode = continuityModeForCase(args.continuity);
  args.db
    .prepare(
      `INSERT INTO conversations (
        id, user_id, title, conversation_mode, bot_id, incognito, created_at, updated_at
      ) VALUES (?, ?, ?, ?, NULL, 0, ?, ?)`,
    )
    .run(
      args.conversationId,
      args.userId,
      mode === "zen" ? "Soft continuity memory eval" : "Soft continuity eval",
      mode,
      now,
      now,
    );

  if (args.continuity.threadSummary?.trim()) {
    const encoded = JSON.stringify({
      v: 1,
      kind: "thread_compact",
      mode,
      summary: args.continuity.threadSummary.trim(),
    });
    args.db
      .prepare(
        "INSERT INTO memory_summaries (id, user_id, conversation_id, summary, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        `sum-${args.conversationId}`,
        args.userId,
        args.conversationId,
        encoded,
        now,
      );
  }

  if (args.continuity.memoryHints && args.continuity.memoryHints.length > 0) {
    // Eval arms share one user DB; wipe prior encrypted memories so retrieval
    // cannot bleed drink facts into travel cases (and so High ≠ polluted None).
    args.db.prepare("DELETE FROM memories WHERE user_id = ?").run(args.userId);
    const { persistMemoryCandidates } = await import("../memory.ts");
    await persistMemoryCandidates(
      args.db,
      args.userId,
      args.conversationId,
      null,
      args.continuity.memoryHints.map((text) => ({
        text,
        confidence: 0.96,
      })),
      args.userKey,
      { durability: 0.9 },
    );
  }
}

function extractArmTotals(judge: unknown): {
  baseline: number | null;
  reference: number | null;
  simulated: number | null;
  ranking: string[];
} {
  const empty = {
    baseline: null as number | null,
    reference: null as number | null,
    simulated: null as number | null,
    ranking: [] as string[],
  };
  if (!judge || typeof judge !== "object") return empty;
  const payload = judge as {
    responseMap?: Record<string, string>;
    result?: {
      scores?: Record<string, { total?: unknown }>;
      ranking?: unknown;
    };
  };
  const map = payload.responseMap ?? {};
  const scores = payload.result?.scores ?? {};
  const byId: Record<string, number | null> = {
    "local-baseline": null,
    "thinking-reference": null,
    "local-simulated-effort": null,
    "online-single-call-baseline": null,
    "online-simulated-high": null,
  };
  for (const [label, runId] of Object.entries(map)) {
    const total = scores[label]?.total;
    if (typeof total === "number" && runId in byId) {
      byId[runId] = total;
    }
  }
  const ranking = Array.isArray(payload.result?.ranking)
    ? payload.result.ranking.map((item) => String(item))
    : [];
  return {
    baseline:
      byId["online-single-call-baseline"] ?? byId["local-baseline"],
    reference: byId["thinking-reference"],
    simulated:
      byId["online-simulated-high"] ?? byId["local-simulated-effort"],
    ranking,
  };
}

function suiteMarkdownSummary(args: {
  createdAt: string;
  options: CliOptions;
  title: string;
  winCondition: string;
  cases: Array<{
    id: string;
    title: string;
    reportPath: string;
    totals: ReturnType<typeof extractArmTotals>;
    continuity?: {
      baseline: ContinuityScore | null;
      simulated: ContinuityScore | null;
      reference: ContinuityScore | null;
      digestOnSimulated: boolean | null;
    };
  }>;
}): string {
  const usesContinuity = args.cases.some((item) => item.continuity);
  const lines = [
    `# ${args.title}`,
    "",
    `Created: ${args.createdAt}`,
    "",
    `Local model: ${args.options.localModel}`,
    `Thinking model: ${args.options.thinkingProvider} / ${args.options.thinkingModel}`,
    `Effort: ${args.options.effort}`,
    "",
    args.winCondition,
    "",
  ];
  if (usesContinuity) {
    lines.push(
      "| Case | None facts | High facts | Sol/ref facts | High ≥ None? | Digest? | Judge None | Judge High |",
      "| --- | ---: | ---: | ---: | --- | --- | ---: | ---: |",
    );
  } else {
    lines.push(
      "| Case | None | High sim | Sol/ref | High ≥ None? |",
      "| --- | ---: | ---: | ---: | --- |",
    );
  }
  let wins = 0;
  let tiesOrWins = 0;
  for (const item of args.cases) {
    if (usesContinuity) {
      const none = item.continuity?.baseline;
      const sim = item.continuity?.simulated;
      const ref = item.continuity?.reference;
      const noneLabel =
        none == null ? "—" : `${none.total}/${none.max}`;
      const simLabel = sim == null ? "—" : `${sim.total}/${sim.max}`;
      const refLabel = ref == null ? "—" : `${ref.total}/${ref.max}`;
      const ge =
        none == null || sim == null
          ? "?"
          : sim.total >= none.total
            ? "yes"
            : "no";
      if (none != null && sim != null && sim.total >= none.total) {
        tiesOrWins += 1;
      }
      if (none != null && sim != null && sim.total > none.total) {
        wins += 1;
      }
      const digest =
        item.continuity?.digestOnSimulated == null
          ? "?"
          : item.continuity.digestOnSimulated
            ? "yes"
            : "no";
      lines.push(
        `| ${item.title} (\`${item.id}\`) | ${noneLabel} | ${simLabel} | ${refLabel} | ${ge} | ${digest} | ${item.totals.baseline ?? "—"} | ${item.totals.simulated ?? "—"} |`,
      );
    } else {
      const none = item.totals.baseline;
      const sim = item.totals.simulated;
      const ref = item.totals.reference;
      const ge =
        none == null || sim == null
          ? "?"
          : sim >= none
            ? "yes"
            : "no";
      if (none != null && sim != null && sim >= none) tiesOrWins += 1;
      if (none != null && sim != null && sim > none) wins += 1;
      lines.push(
        `| ${item.title} (\`${item.id}\`) | ${none ?? "—"} | ${sim ?? "—"} | ${ref ?? "—"} | ${ge} |`,
      );
    }
  }
  lines.push(
    "",
    `Cases where High sim ≥ None: **${tiesOrWins}/${args.cases.length}** (strict wins: ${wins})`,
    "",
    "## Case reports",
    "",
  );
  for (const item of args.cases) {
    lines.push(`- [${item.title}](${item.reportPath})`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function reportFilename(createdAt: string): string {
  return `experimental-effort-${createdAt.replace(/[:.]/g, "-")}`;
}

function markdownReport(report: EvalReport): string {
  const lines: string[] = [
    "# Experimental Effort Eval",
    "",
    `Created: ${report.createdAt}`,
    "",
    "## Prompt",
    "",
    "```text",
    report.prompt,
    "```",
    "",
    `Temperature: ${report.options.temperature}`,
    `Max completion tokens per arm: ${report.options.maxTokens}`,
    ...(report.options.onlineSimulationModel
      ? [
          `Eval profile: paid same-model online simulation (${report.options.onlineSimulationModel})`,
          `Paid multi-call acknowledged: ${report.options.acknowledgePaidMultiCall ? "yes" : "no"}`,
          "Private scratchpad content included: no",
        ]
      : []),
    "",
    "## Runs",
    "",
  ];
  for (const run of report.runs) {
    lines.push(
      `### ${run.label}`,
      "",
      `- Status: ${run.status}`,
      `- Provider/model: ${run.provider} / ${run.model}`,
      `- Effort: ${run.reasoningEffort}`,
      `- Deep simulated ladder requested: ${run.experimentalAllModelEffortEnabled ? "yes" : "no"}`,
      `- Psychic summaries enabled: ${run.psychicModeEnabled ? "yes" : "no"}`,
      `- Call behavior: ${run.callBehavior}`,
      `- Simulation provenance: simulated=${run.simulated}; passCount=${run.passCount}; verified=${run.provenanceVerified}`,
      `- Duration: ${run.durationMs}ms`,
      `- Assistant chars: ${run.assistantChars}`
    );
    if (run.error) {
      lines.push(`- Error: ${run.error}`);
    }
    if (run.psychicThought) {
      lines.push(`- Psychic summary: ${run.psychicThought.summary}`);
    }
    if (run.psychicDebug) {
      lines.push(`- Private pass count: ${run.psychicDebug.passCount ?? 0}`);
      lines.push(`- Guidance chars: ${run.psychicDebug.guidanceChars ?? 0}`);
      if (run.psychicDebug.passes && run.psychicDebug.passes.length > 0) {
        for (const pass of run.psychicDebug.passes) {
          lines.push(
            `- Private pass: ${pass.name}; chars=${pass.chars}${
              pass.warning ? `; warning=${pass.warning}` : ""
            }`
          );
        }
      }
      lines.push(`- Planning scratchpad chars: ${run.psychicDebug.scratchpadChars}`);
    }
    if (run.planningWarnings && run.planningWarnings.length > 0) {
      for (const warning of run.planningWarnings) {
        lines.push(`- Planning warning: ${warning}`);
      }
    }
    if (run.continuityScore) {
      lines.push(
        `- Continuity score: ${run.continuityScore.total}/${run.continuityScore.max}`,
      );
      for (const [name, passed] of Object.entries(run.continuityScore.checks)) {
        lines.push(`- Continuity check: ${name}=${passed ? "pass" : "fail"}`);
      }
    }
    if (run.continuityDigestSeen != null) {
      lines.push(
        `- Continuity digest seen in planning: ${run.continuityDigestSeen ? "yes" : "no"}`,
      );
    }
    lines.push("", "```text", run.assistant || "<no answer>", "```", "");
  }
  if (report.continuity) {
    lines.push("## Seeded Continuity", "");
    if (report.continuity.mode) {
      lines.push(`- Mode: ${report.continuity.mode}`);
    }
    if (report.continuity.threadSummary) {
      lines.push("", "### Thread compact", "", "```text", report.continuity.threadSummary, "```");
    }
    if (report.continuity.memoryHints?.length) {
      lines.push("", "### Encrypted memory hints", "", "```text");
      for (const hint of report.continuity.memoryHints) {
        lines.push(`- ${hint}`);
      }
      lines.push("```");
    }
    lines.push(
      "",
      `- Must include: ${report.continuity.mustInclude.join(", ")}`,
    );
    if (report.continuity.mustExclude?.length) {
      lines.push(`- Must exclude: ${report.continuity.mustExclude.join(", ")}`);
    }
    if (report.continuity.requiredLabels?.length) {
      lines.push(
        `- Required labels: ${report.continuity.requiredLabels.join(", ")}`,
      );
    }
    lines.push("");
  }
  if (report.judge) {
    lines.push("## Blind Judge", "", "```json", JSON.stringify(report.judge, null, 2), "```", "");
  }
  return `${lines.join("\n")}\n`;
}

function ensureEvalUser(db: DatabaseSync, userId: string): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT OR IGNORE INTO users (
      id, email, display_name, password_hash, password_salt,
      wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
      created_at, last_active_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    userId,
    "experimental-effort-eval@prism.local",
    "Experimental Effort Eval",
    "not-used",
    "not-used",
    "not-used",
    "not-used",
    "not-used",
    now,
    now
  );
}

async function runBlindJudge(args: {
  prompt: string;
  judgeModel: string;
  openAiApiKey: string | undefined;
  runs: readonly EvalRunResult[];
}): Promise<unknown | undefined> {
  if (!args.openAiApiKey?.trim()) return undefined;
  const okRuns = args.runs.filter((run) => run.status === "ok");
  if (okRuns.length < 2) return undefined;
  const { selectProvider } = await import("../providers.ts");
  const provider = selectProvider("openai", args.openAiApiKey);
  const responseLabels = ["A", "B", "C", "D", "E"].slice(0, okRuns.length);
  const responseMap = okRuns
    .map((run, index) => {
      const label = responseLabels[index] ?? String(index + 1);
      return [
        `Response ${label}`,
        "```text",
        run.assistant,
        "```",
      ].join("\n");
    })
    .join("\n\n");
  const raw = await provider.generateResponse(
    [
      {
        role: "system",
        content:
          "You are a strict blind evaluator. Return only JSON. Do not favor longer answers. Score each response from 1 to 10 for correctness, reasoning quality, actionability, and constraint handling.",
      },
      {
        role: "user",
        content: [
          "Original prompt:",
          "```text",
          args.prompt,
          "```",
          "",
          responseMap,
          "",
          "Return JSON with shape:",
          '{"scores":{"A":{"correctness":0,"reasoning":0,"actionability":0,"constraints":0,"total":0,"notes":""}},"ranking":["A"],"winner":"A","summary":""}',
        ].join("\n"),
      },
    ],
    {
      model: args.judgeModel,
      jsonMode: true,
      reasoningEffort: "medium",
      maxTokens: 1400,
      temperature: 0,
    }
  );
  const parsed = extractJsonObject(raw);
  return {
    model: args.judgeModel,
    responseMap: Object.fromEntries(
      okRuns.map((run, index) => [responseLabels[index] ?? String(index + 1), run.id])
    ),
    result: parsed,
  };
}

async function runSinglePromptEval(args: {
  options: CliOptions;
  prompt: string;
  caseId: string;
  createdAt: string;
  outDir: string;
  db: DatabaseSync;
  userId: string;
  userKey: Buffer;
  openAiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  processChatMessage: typeof import("../chat.ts").processChatMessage;
  continuity?: SoftContinuityCase;
}): Promise<{
  report: EvalReport;
  jsonPath: string;
  markdownPath: string;
}> {
  const results: EvalRunResult[] = [];
  for (const run of evalRuns(args.options)) {
    const startedAt = Date.now();
    const missingRequiredKey =
      (run.requiresApiKey === "openai" && !args.openAiApiKey?.trim()) ||
      (run.requiresApiKey === "anthropic" && !args.anthropicApiKey?.trim());
    if (missingRequiredKey) {
      const provenance = evalRunProvenance(run, undefined);
      const envName =
        run.requiresApiKey === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      results.push({
        ...run,
        ...provenance,
        status: "skipped",
        durationMs: 0,
        assistant: "",
        assistantChars: 0,
        error: `${envName} is required for this run.`,
      });
      continue;
    }
    try {
      const conversationId = args.continuity
        ? `eval-${args.caseId || "case"}-${run.id}-${Date.now().toString(36)}`
        : undefined;
      if (args.continuity && conversationId) {
        await seedContinuityConversation({
          db: args.db,
          userId: args.userId,
          userKey: args.userKey,
          conversationId,
          continuity: args.continuity,
        });
      }
      const continuityMode = args.continuity
        ? continuityModeForCase(args.continuity)
        : "sandbox";
      const result = await args.processChatMessage(
        args.db,
        args.userId,
        args.prompt,
        args.userKey,
        {
          preferredProvider: run.provider,
          openAiApiKey: args.openAiApiKey,
          anthropicApiKey: args.anthropicApiKey,
          autoMemory: false,
          incognito: args.continuity ? false : true,
          mode: args.continuity ? continuityMode : "sandbox",
          experimentalAllModelEffortEnabled: run.experimentalAllModelEffortEnabled,
          psychicModeEnabled: run.psychicModeEnabled,
          botOverrides: {
            model: run.model,
            reasoningEffort: run.reasoningEffort,
            temperature: args.options.temperature,
            maxTokens: args.options.maxTokens,
          },
        },
        conversationId,
      );
      const assistant = lastAssistant(result.conversation.messages)?.content ?? "";
      const user = lastUser(result.conversation.messages);
      const scratchpad = result.psychicDebug?.scratchpad ?? "";
      const planningWarnings =
        result.backendEvents
          ?.filter((event) => event.message === "Psychic planning unavailable")
          .map((event) => event.detail?.trim())
          .filter((detail): detail is string => Boolean(detail)) ?? [];
      const continuityScore = args.continuity
        ? scoreContinuityAnswer(assistant, args.continuity)
        : undefined;
      const continuityDigestSeen = args.continuity
        ? planningWarnings.some((warning) =>
            warning.includes("continuity_digest"),
          )
        : undefined;
      const psychicDebug = result.psychicDebug
        ? {
            summary: result.psychicDebug.summary,
            effort: result.psychicDebug.effort,
            provider: result.psychicDebug.provider,
            ...(result.psychicDebug.model
              ? { model: result.psychicDebug.model }
              : {}),
            simulated: result.psychicDebug.simulated,
            passCount: result.psychicDebug.passCount,
            passes: result.psychicDebug.passes,
            guidanceChars: result.psychicDebug.guidanceChars,
            scratchpadChars: scratchpad.length,
            ...(args.options.includeScratchpad ? { scratchpad } : {}),
          }
        : undefined;
      const provenance = evalRunProvenance(run, psychicDebug);
      const strictProvenance = args.options.onlineSimulationModel !== null;
      const provenanceError =
        strictProvenance && !provenance.provenanceVerified
          ? `Eval provenance mismatch: expected simulated=${run.expectedSimulated} with ${run.expectedSimulated ? "nonzero" : "zero"} private passes; observed simulated=${provenance.simulated}, passCount=${provenance.passCount}.`
          : undefined;
      results.push({
        ...run,
        ...provenance,
        status: provenanceError ? "error" : "ok",
        durationMs: Date.now() - startedAt,
        assistant,
        assistantChars: assistant.length,
        ...(provenanceError ? { error: provenanceError } : {}),
        ...(user?.psychicThought ? { psychicThought: user.psychicThought } : {}),
        ...(planningWarnings.length > 0 ? { planningWarnings } : {}),
        ...(continuityScore ? { continuityScore } : {}),
        ...(continuityDigestSeen != null ? { continuityDigestSeen } : {}),
        ...(psychicDebug ? { psychicDebug } : {}),
      });
    } catch (error) {
      const provenance = evalRunProvenance(run, undefined);
      results.push({
        ...run,
        ...provenance,
        status: "error",
        durationMs: Date.now() - startedAt,
        assistant: "",
        assistantChars: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const judge =
    args.options.noJudge
      ? undefined
      : await runBlindJudge({
          prompt: args.prompt,
          judgeModel: args.options.judgeModel,
          openAiApiKey: args.openAiApiKey,
          runs: results,
        });

  const report: EvalReport = {
    schema: "prism-experimental-effort-eval-v1",
    createdAt: args.createdAt,
    prompt: args.prompt,
    options: redactedOptions(args.options),
    tempDbPath: args.options.keepDb ? "<shared-suite-db>" : "<removed>",
    runs: results,
    ...(judge ? { judge } : {}),
    ...(args.continuity
      ? {
          continuity: {
            ...(args.continuity.threadSummary
              ? { threadSummary: args.continuity.threadSummary }
              : {}),
            ...(args.continuity.memoryHints
              ? { memoryHints: [...args.continuity.memoryHints] }
              : {}),
            mode: continuityModeForCase(args.continuity),
            mustInclude: [...args.continuity.mustInclude],
            ...(args.continuity.mustExclude
              ? { mustExclude: [...args.continuity.mustExclude] }
              : {}),
            ...(args.continuity.requiredLabels
              ? { requiredLabels: [...args.continuity.requiredLabels] }
              : {}),
          },
        }
      : {}),
  };
  const baseName = args.caseId
    ? `${reportFilename(args.createdAt)}-${args.caseId}`
    : reportFilename(args.createdAt);
  const jsonPath = join(args.outDir, `${baseName}.json`);
  const markdownPath = join(args.outDir, `${baseName}.md`);
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, markdownReport(report), "utf8");
  return { report, jsonPath, markdownPath };
}

async function main(): Promise<void> {
  const options = readCliOptions(process.argv.slice(2));
  if (!options) return;

  if (options.onlineSimulationModel) {
    console.warn(
      [
        "PAID ONLINE EVAL ACKNOWLEDGED.",
        `Model: openai/${options.onlineSimulationModel}`,
        "Arm A makes one ordinary visible generation call with Effort None.",
        "Arm B makes multiple paid calls for PRISM simulated High private passes plus the visible generation.",
        options.noJudge
          ? "Blind judge disabled."
          : `The blind judge adds a paid OpenAI call using ${options.judgeModel}.`,
        "Private scratchpad content will not be written to artifacts.",
      ].join("\n"),
    );
  }

  const createdAt = new Date().toISOString();
  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(join(tmpdir(), "prism-experimental-effort-"));
  const dbPath = join(tempDir, "eval.db");
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = dbPath;

  const openAiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const userKey = Buffer.alloc(32, 7);
  const userId = "eval-user";
  let db: DatabaseSync | undefined;
  const cases = resolveSuiteCases(options);

  try {
    const { createDatabase } = await import("../db.ts");
    const { processChatMessage } = await import("../chat.ts");
    db = createDatabase();
    ensureEvalUser(db, userId);

    const suiteCaseResults: Array<{
      id: string;
      title: string;
      reportPath: string;
      totals: ReturnType<typeof extractArmTotals>;
      continuity?: {
        baseline: ContinuityScore | null;
        simulated: ContinuityScore | null;
        reference: ContinuityScore | null;
        digestOnSimulated: boolean | null;
      };
    }> = [];

    for (const suiteCase of cases) {
      console.log(`\n=== Case: ${suiteCase.title} (${suiteCase.id}) ===`);
      const namedCase =
        options.suite === "soft-transfer" ||
        options.suite === "soft-continuity" ||
        options.suite === "soft-continuity-memory";
      const { report, jsonPath, markdownPath } = await runSinglePromptEval({
        options,
        prompt: suiteCase.prompt,
        caseId: namedCase ? suiteCase.id : "",
        createdAt,
        outDir,
        db,
        userId,
        userKey,
        openAiApiKey,
        anthropicApiKey,
        processChatMessage,
        continuity: suiteCase.continuity,
      });
      console.log(`JSON: ${jsonPath}`);
      console.log(`Report: ${markdownPath}`);
      for (const result of report.runs) {
        const continuityLabel = result.continuityScore
          ? `; continuity=${result.continuityScore.total}/${result.continuityScore.max}`
          : "";
        console.log(
          `${result.label}: ${result.status} (${result.durationMs}ms, ${result.assistantChars} chars${continuityLabel})`,
        );
      }
      if (!report.judge && !options.noJudge) {
        console.log(
          "Judge skipped: OPENAI_API_KEY missing or fewer than two runs succeeded.",
        );
      }
      const byId = (id: EvalRunId) =>
        report.runs.find((run) => run.id === id);
      suiteCaseResults.push({
        id: suiteCase.id,
        title: suiteCase.title,
        reportPath: markdownPath,
        totals: extractArmTotals(report.judge),
        ...(suiteCase.continuity
          ? {
              continuity: {
                baseline: byId("local-baseline")?.continuityScore ?? null,
                simulated:
                  byId("local-simulated-effort")?.continuityScore ?? null,
                reference: byId("thinking-reference")?.continuityScore ?? null,
                digestOnSimulated:
                  byId("local-simulated-effort")?.continuityDigestSeen ?? null,
              },
            }
          : {}),
      });
    }

    if (
      options.suite === "soft-transfer" ||
      options.suite === "soft-continuity" ||
      options.suite === "soft-continuity-memory"
    ) {
      const suiteMeta =
        options.suite === "soft-continuity-memory"
          ? {
              filePrefix: "soft-continuity-memory",
              schema: "prism-experimental-effort-soft-continuity-memory-suite-v1",
              title: "Soft-continuity-memory Phase B suite",
              winCondition:
                "Win condition for a case: local High sim continuity fact score ≥ local None (seeded encrypted memories only; prompt does not restate keys).",
              label: "Soft-continuity-memory",
            }
          : options.suite === "soft-continuity"
            ? {
                filePrefix: "soft-continuity",
                schema: "prism-experimental-effort-soft-continuity-suite-v1",
                title: "Soft-continuity Phase B suite",
                winCondition:
                  "Win condition for a case: local High sim continuity fact score ≥ local None (seeded thread compact only; prompt does not restate keys).",
                label: "Soft-continuity",
              }
            : {
                filePrefix: "soft-transfer",
                schema: "prism-experimental-effort-soft-transfer-suite-v1",
                title: "Soft-transfer Phase A suite",
                winCondition:
                  "Win condition for a case: local High sim judge total ≥ local None, and preferably closer to the thinking reference on constraints.",
                label: "Soft-transfer",
              };
      const summaryName = `${suiteMeta.filePrefix}-suite-${createdAt.replace(/[:.]/g, "-")}`;
      const summaryJsonPath = join(outDir, `${summaryName}.json`);
      const summaryMdPath = join(outDir, `${summaryName}.md`);
      const summary = {
        schema: suiteMeta.schema,
        createdAt,
        options: redactedOptions(options),
        cases: suiteCaseResults.map((item) => ({
          id: item.id,
          title: item.title,
          reportPath: item.reportPath,
          totals: item.totals,
          ...(item.continuity ? { continuity: item.continuity } : {}),
        })),
      };
      writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      writeFileSync(
        summaryMdPath,
        suiteMarkdownSummary({
          createdAt,
          options,
          title: suiteMeta.title,
          winCondition: suiteMeta.winCondition,
          cases: suiteCaseResults,
        }),
        "utf8",
      );
      console.log(`\n${suiteMeta.label} suite summary: ${summaryMdPath}`);
      console.log(`Suite JSON: ${summaryJsonPath}`);
    } else {
      console.log(`\nExperimental Effort eval complete.`);
    }
  } finally {
    db?.close();
    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
    if (!options.keepDb) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

const directEntry = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (directEntry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
