import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("live bake Auto re-resolve", () => {
  it("re-resolves Debate runtime before each bake advance", () => {
    const source = readFileSync(join(root, "live-bake.ts"), "utf8");
    assert.match(
      source,
      /resolveRuntime:\s*\(\)\s*=>\s*Promise<DebateAiRuntime>/u,
    );
    assert.match(
      source,
      /const runtime = await args\.resolveRuntime\(\);\s*session = await advanceDebateSession/u,
    );
  });

  it("re-resolves Signal generation before each bake advance", () => {
    const source = readFileSync(join(root, "live-bake.ts"), "utf8");
    assert.match(
      source,
      /resolveGeneration:\s*\(\)\s*=>\s*Promise<BotcastGenerationOptions>/u,
    );
    assert.match(
      source,
      /const generation = \{\s*\.\.\.\(await args\.resolveGeneration\(\)\)/u,
    );
    assert.match(source, /await runWithUsageSession\(/u);
    assert.match(source, /mode: "signal"/u);
    assert.match(source, /surface: "signal"/u);
  });

  it("wires bake jobs and HTTP starters to per-step resolvers", () => {
    const jobs = readFileSync(join(root, "live-bake-jobs.ts"), "utf8");
    const server = readFileSync(join(root, "server.ts"), "utf8");
    assert.match(jobs, /resolveRuntime:\s*args\.resolveRuntime/u);
    assert.match(jobs, /resolveGeneration:\s*args\.resolveGeneration/u);
    assert.match(
      server,
      /liveBakeJobs\.startDebateBake\(\{[\s\S]*?resolveRuntime:\s*async \(\) =>/u,
    );
    assert.match(
      server,
      /liveBakeJobs\.startSignalBake\(\{[\s\S]*?resolveGeneration:\s*async \(\) =>/u,
    );
  });
});
