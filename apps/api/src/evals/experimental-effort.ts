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
      name: "plan" | "draft" | "audit" | "revision";
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
  "You are advising a two-person local-first app team.",
  "They have one weekend to ship a feature that lets non-reasoning local models behave more like thinking models.",
  "Constraints:",
  "- No cloud calls may happen in LOCAL mode.",
  "- Users should never see raw chain-of-thought.",
  "- Developer diagnostics should be useful but not persisted as private scratchpads.",
  "- The UI must stay calm and not turn this into a wall of controls.",
  "",
  "Propose an implementation plan, the key tests, and the main failure modes.",
  "Be concrete enough that an engineer could start coding from your answer.",
].join("\n");

const DEFAULT_OPTIONS: CliOptions = {
  prompt: DEFAULT_PROMPT,
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
      experimentalAllModelEffortEnabled: true,
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

  try {
    const { createDatabase } = await import("../db.ts");
    const { processChatMessage } = await import("../chat.ts");
    db = createDatabase();
    ensureEvalUser(db, userId);

    const results: EvalRunResult[] = [];
    for (const run of evalRuns(options)) {
      const startedAt = Date.now();
      const missingRequiredKey =
        (run.requiresApiKey === "openai" && !openAiApiKey?.trim()) ||
        (run.requiresApiKey === "anthropic" && !anthropicApiKey?.trim());
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
        const result = await processChatMessage(db, userId, options.prompt, userKey, {
          preferredProvider: run.provider,
          openAiApiKey,
          anthropicApiKey,
          autoMemory: false,
          incognito: true,
          mode: "sandbox",
          experimentalAllModelEffortEnabled: run.experimentalAllModelEffortEnabled,
          psychicModeEnabled: run.psychicModeEnabled,
          botOverrides: {
            model: run.model,
            reasoningEffort: run.reasoningEffort,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          },
        });
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
                  ...(options.includeScratchpad ? { scratchpad } : {}),
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
      options.noJudge
        ? undefined
        : await runBlindJudge({
            prompt: options.prompt,
            judgeModel: options.judgeModel,
            openAiApiKey,
            runs: results,
          });

    const report: EvalReport = {
      schema: "prism-experimental-effort-eval-v1",
      createdAt,
      prompt: options.prompt,
      options: redactedOptions(options),
      tempDbPath: options.keepDb ? dbPath : "<removed>",
      runs: results,
      ...(judge ? { judge } : {}),
    };
    const baseName = reportFilename(createdAt);
    const jsonPath = join(outDir, `${baseName}.json`);
    const markdownPath = join(outDir, `${baseName}.md`);
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writeFileSync(markdownPath, markdownReport(report), "utf8");

    console.log(`Experimental Effort eval complete.`);
    console.log(`JSON: ${jsonPath}`);
    console.log(`Report: ${markdownPath}`);
    for (const result of results) {
      console.log(
        `${result.label}: ${result.status} (${result.durationMs}ms, ${result.assistantChars} chars)`
      );
    }
    if (!judge && !options.noJudge) {
      console.log("Judge skipped: OPENAI_API_KEY missing or fewer than two runs succeeded.");
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
