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
    const runtimeResolveAt = source.indexOf(
      "const runtime = await args.resolveRuntime();",
    );
    const advanceAt = source.indexOf(
      "session = await advanceDebateSession(",
      runtimeResolveAt,
    );
    assert.ok(runtimeResolveAt >= 0 && advanceAt > runtimeResolveAt);
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
    assert.match(
      source,
      /imageContext\?\.phase === "queued"[\s\S]{0,420}lastMessage\?\.speakerRole === "guest"/u,
    );
    assert.match(
      source,
      /internalImageCue \? \{ cue: internalImageCue \} : \{\}[\s\S]{0,180}internalImageCue \? \{ allowWatchBake: true \} : \{\}/u,
    );
  });

  it("wires bake jobs and HTTP starters to per-step resolvers", () => {
    const jobs = readFileSync(join(root, "live-bake-jobs.ts"), "utf8");
    const server = readFileSync(join(root, "server.ts"), "utf8");
    assert.match(jobs, /resolveRuntime:\s*args\.resolveRuntime/u);
    assert.match(
      jobs,
      /resolveGeneration:\s*async \(\) => \(\{[\s\S]{0,220}await args\.resolveGeneration\(\)[\s\S]{0,260}signalEpisodeImage/u,
    );
    assert.match(
      jobs,
      /signalEpisodeImage\?: NonNullable<BotcastGenerationOptions\["signalEpisodeImage"\]>/u,
    );
    assert.match(jobs, /The active Watch image does not match this bake/u);
    assert.match(
      server,
      /liveBakeJobs\.startDebateBake\(\{[\s\S]*?resolveRuntime:\s*async \(\) =>/u,
    );
    assert.match(
      server,
      /liveBakeJobs\.startSignalBake\(\{[\s\S]*?resolveGeneration:\s*async \(\) =>/u,
    );
    assert.match(
      server,
      /normalizeSignalEpisodeImageForTurn\(body\.episodeImage\)/u,
    );
    assert.match(
      server,
      /queueBotcastEpisodeImageContext\([\s\S]{0,900}?allowWatchBake: true/u,
    );
    assert.match(
      server,
      /liveBakeJobs\.startSignalBake\(\{[\s\S]{0,520}?signalEpisodeImage: \{/u,
    );
    assert.match(
      server,
      /if \(existingImageContext\) \{[\s\S]{0,1800}A dismissed[\s\S]{0,2200}else if \(signalEpisodeImage\)/u,
    );
    assert.match(
      server,
      /body\.episodeImage === undefined \|\| signalBakeAlreadyRunning[\s\S]{0,500}!signalBakeAlreadyRunning &&/u,
    );
  });
});
