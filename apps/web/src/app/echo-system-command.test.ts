import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(here, "page.tsx"), "utf8");

describe("retired system /echo command", () => {
  it("is removed from built-in Command Center commands", () => {
    assert.doesNotMatch(pageSource, /createBuiltInEchoCommand\(\)/u);
    assert.doesNotMatch(pageSource, /id:\s*"builtin:\/echo"/u);
    assert.doesNotMatch(pageSource, /model:\s*"system\/echo"/u);
    assert.doesNotMatch(pageSource, /parseEchoSlashCommand/u);
    assert.doesNotMatch(pageSource, /looksLikeEchoSlashCommand/u);
  });

  it("keeps echo reserved so stale saved prompts cannot reclaim it", () => {
    assert.match(
      pageSource,
      /BUILT_IN_COMMAND_RESERVED_NAMES[\s\S]*?"echo"/u,
    );
  });
});
