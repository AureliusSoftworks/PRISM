import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage, ReasoningEffort } from "@localai/shared";

const LADDER_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ReasoningEffort[];

const PLANNING_TOKEN_BUDGET: Record<(typeof LADDER_EFFORTS)[number], number> = {
  none: 0,
  minimal: 300,
  low: 420,
  medium: 560,
  high: 720,
  xhigh: 900,
};

interface CliOptions {
  model: string;
  prompt: string;
  outDir: string;
  temperature: number;
  maxTokens: number;
  includeScratchpad: boolean;
  keepDb: boolean;
}

interface ConstraintScore {
  total: number;
  max: number;
  wordCount: number;
  checks: Record<string, boolean>;
}

interface LadderRun {
  effort: (typeof LADDER_EFFORTS)[number];
  model: string;
  status: "ok" | "error";
  durationMs: number;
  planningBudgetTokens: number;
  assistant: string;
  assistantChars: number;
  psychicSummary?: string;
  scratchpadChars?: number;
  scratchpad?: string;
  planningWarnings?: string[];
  score?: ConstraintScore;
  error?: string;
}

interface LadderReport {
  schema: "prism-effort-ladder-eval-v1";
  createdAt: string;
  prompt: string;
  options: Omit<CliOptions, "prompt" | "includeScratchpad" | "keepDb"> & {
    includeScratchpad: boolean;
  };
  tempDbPath: string;
  runs: LadderRun[];
}

const DEFAULT_PROMPT = [
  "Create a rollout plan as a compact Markdown table with exactly 6 body rows labeled S1 through S6.",
  "Use columns: ID, Plan.",
  "",
  "Constraints:",
  "- S1 must name the user-facing effort setting.",
  "- S2 must explain the local-only guarantee without using the word cloud.",
  "- S3 must describe the private planning pass.",
  "- S4 must say what happens if planning JSON fails.",
  "- S5 must mention that scratchpads are not persisted.",
  "- S6 must name one UI indicator for Psychic mode.",
  "- Do not expose raw chain-of-thought.",
  "- Keep the answer under 180 words.",
].join("\n");

const DEFAULT_OPTIONS: CliOptions = {
  model: "llama3.2",
  prompt: DEFAULT_PROMPT,
  outDir: "artifacts/effort-ladder-evals",
  temperature: 0.25,
  maxTokens: 900,
  includeScratchpad: false,
  keepDb: false,
};

function printHelp(): void {
  console.log(`Effort ladder eval

Runs one local model across the simulated-effort ladder:
  ${LADDER_EFFORTS.join(" -> ")}

Usage:
  npm run eval:effort-ladder -- [options]
  node --env-file-if-exists=.env --experimental-strip-types apps/api/src/evals/effort-ladder.ts [options]

Options:
  --model <id>             Local model. Default: ${DEFAULT_OPTIONS.model}
  --prompt <text>          Override the default constraint-trap prompt.
  --temperature <number>   Final-answer temperature. Default: ${DEFAULT_OPTIONS.temperature}
  --max-tokens <number>    Max final-answer tokens. Default: ${DEFAULT_OPTIONS.maxTokens}
  --out-dir <path>         Where JSON/Markdown reports are written.
  --include-scratchpad     Include simulated scratchpad in the JSON artifact.
  --keep-db                Keep the temporary SQLite DB for inspection.
  --help                   Show this help.
`);
}

function readCliOptions(argv: string[]): CliOptions | null {
  const options: CliOptions = { ...DEFAULT_OPTIONS };
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
      case "--model":
        options.model = next();
        break;
      case "--prompt":
        options.prompt = next();
        break;
      case "--temperature":
        options.temperature = Number(next());
        break;
      case "--max-tokens":
        options.maxTokens = Number(next());
        break;
      case "--out-dir":
        options.outDir = next();
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
  return options;
}

function lastAssistant(messages: readonly ChatMessage[]): ChatMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "assistant") return message;
  }
  return undefined;
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function wordCount(value: string): number {
  const words = value.trim().match(/\S+/g);
  return words ? words.length : 0;
}

function stepText(answer: string, step: number): string {
  const pattern = new RegExp(
    String.raw`(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:step\s*)?${step}(?:[\).\:-]|\s+[—-])([\s\S]*?)(?=(?:\n\s*(?:#{1,6}\s*)?(?:\*\*)?(?:step\s*)?${step + 1}(?:[\).\:-]|\s+[—-]))|$)`,
    "i"
  );
  return pattern.exec(answer)?.[1] ?? "";
}

function tableRowText(answer: string, rowId: `S${number}`): string {
  const pattern = new RegExp(
    String.raw`(?:^|\n)\s*\|\s*${rowId}\s*\|([\s\S]*?)(?:\|\s*)?(?=\n|$)`,
    "i"
  );
  return pattern.exec(answer)?.[1] ?? "";
}

function numberedStepCount(answer: string): number {
  const matches = answer.match(
    /(?:^|\n)\s*(?:#{1,6}\s*)?(?:\*\*)?(?:step\s*)?[1-9](?:[\).\:-]|\s+[—-])/gi
  );
  return matches?.length ?? 0;
}

function labeledRowCount(answer: string): number {
  const labels = new Set<string>();
  for (const match of answer.matchAll(/(?:^|\n)\s*\|\s*(S[1-6])\s*\|/gi)) {
    labels.add(match[1]?.toUpperCase() ?? "");
  }
  return labels.size;
}

function containsAny(value: string, needles: readonly string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function scoreAnswer(answer: string): ConstraintScore {
  const normalized = normalizeText(answer);
  const section1 = normalizeText(tableRowText(answer, "S1") || stepText(answer, 1));
  const section2 = normalizeText(tableRowText(answer, "S2") || stepText(answer, 2));
  const section3 = normalizeText(tableRowText(answer, "S3") || stepText(answer, 3));
  const section4 = normalizeText(tableRowText(answer, "S4") || stepText(answer, 4));
  const section5 = normalizeText(tableRowText(answer, "S5") || stepText(answer, 5));
  const section6 = normalizeText(tableRowText(answer, "S6") || stepText(answer, 6));
  const rowCount = labeledRowCount(answer);
  const count = wordCount(answer);
  const checks: Record<string, boolean> = {
    exactlySixLabeledRows: rowCount > 0 ? rowCount === 6 : numberedStepCount(answer) === 6,
    s1NamesUserFacingSetting:
      section1.includes("setting") &&
      containsAny(section1, ["effort", "thinking", "experimental", "model"]),
    s2ExplainsLocalOnlyWithoutCloud:
      section2.includes("local") &&
      containsAny(section2, ["ollama", "network", "device", "machine", "provider"]) &&
      !section2.includes("cloud"),
    s3DescribesPrivatePlanningPass:
      section3.includes("private") &&
      section3.includes("planning") &&
      section3.includes("pass"),
    s4HandlesPlanningJsonFailure:
      section4.includes("json") &&
      containsAny(section4, ["fail", "invalid", "fallback", "fall back", "normal"]),
    s5SaysScratchpadsNotPersisted:
      section5.includes("scratchpad") &&
      containsAny(section5, ["not persisted", "never persisted", "not saved", "not stored"]),
    s6NamesPsychicUiIndicator:
      section6.includes("psychic") &&
      containsAny(section6, ["toast", "indicator", "badge", "line", "label"]),
    avoidsCloudWord: !normalized.includes("cloud"),
    underWordLimit: count < 180,
    avoidsRawChainOfThought:
      !normalized.includes("chain-of-thought:") &&
      !normalized.includes("chain of thought:") &&
      !normalized.includes("scratchpad:"),
  };
  const total = Object.values(checks).filter(Boolean).length;
  return {
    total,
    max: Object.keys(checks).length,
    wordCount: count,
    checks,
  };
}

function redactedOptions(options: CliOptions): LadderReport["options"] {
  return {
    model: options.model,
    outDir: options.outDir,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    includeScratchpad: options.includeScratchpad,
  };
}

function reportFilename(createdAt: string): string {
  return `effort-ladder-${createdAt.replace(/[:.]/g, "-")}`;
}

function markdownReport(report: LadderReport): string {
  const lines: string[] = [
    "# Effort Ladder Eval",
    "",
    `Created: ${report.createdAt}`,
    "",
    "## Prompt",
    "",
    "```text",
    report.prompt,
    "```",
    "",
    "## Summary",
    "",
    "| Effort | Score | Words | Duration | Planning budget | Scratchpad chars | Planning warnings |",
    "| --- | ---: | ---: | ---: | ---: | ---: | --- |",
  ];
  for (const run of report.runs) {
    lines.push(
      `| ${run.effort} | ${run.score ? `${run.score.total}/${run.score.max}` : run.status} | ${
        run.score?.wordCount ?? ""
      } | ${run.durationMs}ms | ${run.planningBudgetTokens} | ${
        run.scratchpadChars ?? ""
      } | ${run.planningWarnings?.join("; ") ?? ""} |`
    );
  }
  lines.push("", "## Runs", "");
  for (const run of report.runs) {
    lines.push(
      `### ${run.effort}`,
      "",
      `- Status: ${run.status}`,
      `- Model: ${run.model}`,
      `- Planning budget tokens: ${run.planningBudgetTokens}`,
      `- Duration: ${run.durationMs}ms`,
      `- Assistant chars: ${run.assistantChars}`
    );
    if (run.score) {
      lines.push(`- Score: ${run.score.total}/${run.score.max}`);
      for (const [name, passed] of Object.entries(run.score.checks)) {
        lines.push(`  - ${passed ? "pass" : "fail"}: ${name}`);
      }
    }
    if (run.psychicSummary) {
      lines.push(`- Psychic summary: ${run.psychicSummary}`);
    }
    if (typeof run.scratchpadChars === "number") {
      lines.push(`- Planning scratchpad chars: ${run.scratchpadChars}`);
    }
    if (run.planningWarnings && run.planningWarnings.length > 0) {
      for (const warning of run.planningWarnings) {
        lines.push(`- Planning warning: ${warning}`);
      }
    }
    if (run.error) {
      lines.push(`- Error: ${run.error}`);
    }
    lines.push("", "```text", run.assistant || "<no answer>", "```", "");
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
    "effort-ladder-eval@prism.local",
    "Effort Ladder Eval",
    "not-used",
    "not-used",
    "not-used",
    "not-used",
    "not-used",
    now,
    now
  );
}

async function main(): Promise<void> {
  const options = readCliOptions(process.argv.slice(2));
  if (!options) return;

  const createdAt = new Date().toISOString();
  const outDir = resolve(options.outDir);
  mkdirSync(outDir, { recursive: true });
  const tempDir = mkdtempSync(join(tmpdir(), "prism-effort-ladder-"));
  const dbPath = join(tempDir, "eval.db");
  const previousDbPath = process.env.DB_PATH;
  process.env.DB_PATH = dbPath;

  const userKey = Buffer.alloc(32, 9);
  const userId = "eval-user";
  let db: DatabaseSync | undefined;

  try {
    const { createDatabase } = await import("../db.ts");
    const { processChatMessage } = await import("../chat.ts");
    db = createDatabase();
    ensureEvalUser(db, userId);

    const runs: LadderRun[] = [];
    for (const effort of LADDER_EFFORTS) {
      const startedAt = Date.now();
      try {
        const result = await processChatMessage(db, userId, options.prompt, userKey, {
          preferredProvider: "local",
          autoMemory: false,
          incognito: true,
          mode: "sandbox",
          experimentalAllModelEffortEnabled: true,
          psychicModeEnabled: false,
          botOverrides: {
            model: options.model,
            reasoningEffort: effort,
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          },
        });
        const assistant = lastAssistant(result.conversation.messages)?.content ?? "";
        const scratchpad = result.psychicDebug?.scratchpad ?? "";
        const planningWarnings =
          result.backendEvents
            ?.filter((event) => event.message === "Psychic planning unavailable")
            .map((event) => event.detail?.trim())
            .filter((detail): detail is string => Boolean(detail)) ?? [];
        runs.push({
          effort,
          model: options.model,
          status: "ok",
          durationMs: Date.now() - startedAt,
          planningBudgetTokens: PLANNING_TOKEN_BUDGET[effort],
          assistant,
          assistantChars: assistant.length,
          ...(result.psychicDebug?.summary
            ? { psychicSummary: result.psychicDebug.summary }
            : {}),
          ...(result.psychicDebug
            ? {
                scratchpadChars: scratchpad.length,
                ...(options.includeScratchpad ? { scratchpad } : {}),
              }
            : {}),
          ...(planningWarnings.length > 0 ? { planningWarnings } : {}),
          score: scoreAnswer(assistant),
        });
      } catch (error) {
        runs.push({
          effort,
          model: options.model,
          status: "error",
          durationMs: Date.now() - startedAt,
          planningBudgetTokens: PLANNING_TOKEN_BUDGET[effort],
          assistant: "",
          assistantChars: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const report: LadderReport = {
      schema: "prism-effort-ladder-eval-v1",
      createdAt,
      prompt: options.prompt,
      options: redactedOptions(options),
      tempDbPath: options.keepDb ? dbPath : "<removed>",
      runs,
    };
    const baseName = reportFilename(createdAt);
    const jsonPath = join(outDir, `${baseName}.json`);
    const markdownPath = join(outDir, `${baseName}.md`);
    writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    writeFileSync(markdownPath, markdownReport(report), "utf8");

    console.log("Effort ladder eval complete.");
    console.log(`JSON: ${jsonPath}`);
    console.log(`Report: ${markdownPath}`);
    for (const run of runs) {
      const score = run.score ? `${run.score.total}/${run.score.max}` : run.status;
      const scratchpad = typeof run.scratchpadChars === "number" ? run.scratchpadChars : 0;
      const warnings = run.planningWarnings?.length ?? 0;
      console.log(
        `${run.effort}: score=${score}; duration=${run.durationMs}ms; scratchpad=${scratchpad}; warnings=${warnings}`
      );
    }
  } finally {
    if (db) db.close();
    if (previousDbPath === undefined) {
      delete process.env.DB_PATH;
    } else {
      process.env.DB_PATH = previousDbPath;
    }
    if (!options?.keepDb) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
