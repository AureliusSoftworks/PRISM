import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage, ReasoningEffort } from "@localai/shared";
import { REASONING_EFFORT_VALUES } from "@localai/shared";
import type { ProviderName } from "../providers.ts";

type EvalRunId =
  | "local-baseline"
  | "thinking-reference"
  | "local-simulated-effort";

interface CliOptions {
  prompt: string;
  suite: "none" | "cafe" | "soft-transfer";
  thinkingProvider: Exclude<ProviderName, "local">;
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
}

interface EvalRunResult {
  id: EvalRunId;
  label: string;
  provider: ProviderName;
  model: string;
  reasoningEffort: ReasoningEffort;
  experimentalAllModelEffortEnabled: boolean;
  psychicModeEnabled: boolean;
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
}

const DEFAULT_PROMPT = [
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
};

function printHelp(): void {
  console.log(`Experimental Effort eval harness

Runs the same prompt through:
  1. local baseline (${DEFAULT_OPTIONS.localModel}, no simulated effort)
  2. thinking reference (${DEFAULT_OPTIONS.thinkingModel}, native effort)
  3. local simulated effort (${DEFAULT_OPTIONS.localModel}, tiered private passes + final pass)

Usage:
  npm run eval:experimental-effort -- [options]
  node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/experimental-effort.ts [options]

Options:
  --prompt <text>              Override the default comparison prompt.
  --suite <id>                 none (default single prompt) | cafe | soft-transfer
                               soft-transfer runs 3 easier Phase A transfer prompts.
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
  --help                       Show this help.
`);
}

function readCliOptions(argv: string[]): CliOptions | null {
  const options: CliOptions = { ...DEFAULT_OPTIONS };
  let thinkingModelProvided = false;
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
        break;
      case "--suite": {
        const suite = next().trim().toLowerCase();
        if (suite !== "none" && suite !== "cafe" && suite !== "soft-transfer") {
          throw new Error(
            `Unsupported suite: ${suite}. Use none|cafe|soft-transfer.`,
          );
        }
        options.suite = suite;
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
  return options;
}

function evalRuns(options: CliOptions): EvalRunConfig[] {
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
  };
}

function resolveSuiteCases(
  options: CliOptions,
): Array<{ id: string; title: string; prompt: string }> {
  if (options.suite === "soft-transfer") {
    return SOFT_TRANSFER_CASES.map((item) => ({ ...item }));
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
    baseline: byId["local-baseline"],
    reference: byId["thinking-reference"],
    simulated: byId["local-simulated-effort"],
    ranking,
  };
}

function suiteMarkdownSummary(args: {
  createdAt: string;
  options: CliOptions;
  cases: Array<{
    id: string;
    title: string;
    reportPath: string;
    totals: ReturnType<typeof extractArmTotals>;
  }>;
}): string {
  const lines = [
    "# Soft-transfer Phase A suite",
    "",
    `Created: ${args.createdAt}`,
    "",
    `Local model: ${args.options.localModel}`,
    `Thinking model: ${args.options.thinkingProvider} / ${args.options.thinkingModel}`,
    `Effort: ${args.options.effort}`,
    "",
    "Win condition for a case: local High sim judge total ≥ local None, and preferably closer to the thinking reference on constraints.",
    "",
    "| Case | None | High sim | Sol/ref | High ≥ None? |",
    "| --- | ---: | ---: | ---: | --- |",
  ];
  let wins = 0;
  let tiesOrWins = 0;
  for (const item of args.cases) {
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
      `- Simulated effort enabled: ${run.experimentalAllModelEffortEnabled ? "yes" : "no"}`,
      `- Psychic summaries enabled: ${run.psychicModeEnabled ? "yes" : "no"}`,
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
    lines.push("", "```text", run.assistant || "<no answer>", "```", "");
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
        `Run id: ${run.id}`,
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
      const envName =
        run.requiresApiKey === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
      results.push({
        ...run,
        status: "skipped",
        durationMs: 0,
        assistant: "",
        assistantChars: 0,
        error: `${envName} is required for this run.`,
      });
      continue;
    }
    try {
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
          incognito: true,
          mode: "sandbox",
          experimentalAllModelEffortEnabled: run.experimentalAllModelEffortEnabled,
          psychicModeEnabled: run.psychicModeEnabled,
          botOverrides: {
            model: run.model,
            reasoningEffort: run.reasoningEffort,
            temperature: args.options.temperature,
            maxTokens: args.options.maxTokens,
          },
        },
      );
      const assistant = lastAssistant(result.conversation.messages)?.content ?? "";
      const user = lastUser(result.conversation.messages);
      const scratchpad = result.psychicDebug?.scratchpad ?? "";
      const planningWarnings =
        result.backendEvents
          ?.filter((event) => event.message === "Psychic planning unavailable")
          .map((event) => event.detail?.trim())
          .filter((detail): detail is string => Boolean(detail)) ?? [];
      results.push({
        ...run,
        status: "ok",
        durationMs: Date.now() - startedAt,
        assistant,
        assistantChars: assistant.length,
        ...(user?.psychicThought ? { psychicThought: user.psychicThought } : {}),
        ...(planningWarnings.length > 0 ? { planningWarnings } : {}),
        ...(result.psychicDebug
          ? {
              psychicDebug: {
                summary: result.psychicDebug.summary,
                effort: result.psychicDebug.effort,
                provider: result.psychicDebug.provider,
                ...(result.psychicDebug.model ? { model: result.psychicDebug.model } : {}),
                simulated: result.psychicDebug.simulated,
                passCount: result.psychicDebug.passCount,
                passes: result.psychicDebug.passes,
                guidanceChars: result.psychicDebug.guidanceChars,
                scratchpadChars: scratchpad.length,
                ...(args.options.includeScratchpad ? { scratchpad } : {}),
              },
            }
          : {}),
      });
    } catch (error) {
      results.push({
        ...run,
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
    }> = [];

    for (const suiteCase of cases) {
      console.log(`\n=== Case: ${suiteCase.title} (${suiteCase.id}) ===`);
      const { report, jsonPath, markdownPath } = await runSinglePromptEval({
        options,
        prompt: suiteCase.prompt,
        caseId: options.suite === "soft-transfer" ? suiteCase.id : "",
        createdAt,
        outDir,
        db,
        userId,
        userKey,
        openAiApiKey,
        anthropicApiKey,
        processChatMessage,
      });
      console.log(`JSON: ${jsonPath}`);
      console.log(`Report: ${markdownPath}`);
      for (const result of report.runs) {
        console.log(
          `${result.label}: ${result.status} (${result.durationMs}ms, ${result.assistantChars} chars)`,
        );
      }
      if (!report.judge && !options.noJudge) {
        console.log(
          "Judge skipped: OPENAI_API_KEY missing or fewer than two runs succeeded.",
        );
      }
      suiteCaseResults.push({
        id: suiteCase.id,
        title: suiteCase.title,
        reportPath: markdownPath,
        totals: extractArmTotals(report.judge),
      });
    }

    if (options.suite === "soft-transfer") {
      const summaryName = `soft-transfer-suite-${createdAt.replace(/[:.]/g, "-")}`;
      const summaryJsonPath = join(outDir, `${summaryName}.json`);
      const summaryMdPath = join(outDir, `${summaryName}.md`);
      const summary = {
        schema: "prism-experimental-effort-soft-transfer-suite-v1",
        createdAt,
        options: redactedOptions(options),
        cases: suiteCaseResults.map((item) => ({
          id: item.id,
          title: item.title,
          reportPath: item.reportPath,
          totals: item.totals,
        })),
      };
      writeFileSync(summaryJsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      writeFileSync(
        summaryMdPath,
        suiteMarkdownSummary({
          createdAt,
          options,
          cases: suiteCaseResults,
        }),
        "utf8",
      );
      console.log(`\nSoft-transfer suite summary: ${summaryMdPath}`);
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
