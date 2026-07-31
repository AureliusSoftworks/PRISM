import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pageSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "page.tsx"),
  "utf8",
);

describe("system /echo command wiring", () => {
  it("reserves echo as a built-in Command Center command", () => {
    assert.match(pageSource, /createBuiltInEchoCommand\(\)/u);
    assert.match(pageSource, /id:\s*"builtin:\/echo"/u);
    assert.match(
      pageSource,
      /BUILT_IN_COMMAND_RESERVED_NAMES[\s\S]*?"echo"/u,
    );
  });

  it("handles Chat/Zen echo after wildcard expansion", () => {
    assert.match(
      pageSource,
      /resolveComposerWildcardDraft[\s\S]*?parseEchoSlashCommand\(outboundPrompt\)/u,
    );
    assert.match(pageSource, /model:\s*"system\/echo"/u);
  });

  it("addresses Coffee echo to a mentioned seat instead of a random seat", () => {
    assert.match(
      pageSource,
      /coffeeDirectedMentionBotIds\([\s\S]*?seats\.map/u,
    );
    assert.doesNotMatch(
      pageSource,
      /Math\.floor\(Math\.random\(\) \* seats\.length\)[\s\S]{0,80}coffeeCommand\.message/u,
    );
  });
});
