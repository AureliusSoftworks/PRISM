import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadDevSecretDefaults, parseEnvFileForKeys } from "./dev-secrets.mjs";

test("parses only supported secret keys without shell evaluation", () => {
  const parsed = parseEnvFileForKeys(`
BRAVE_SEARCH_API_KEY=abc$not-a-command!(still-value)
UNRELATED_SECRET=do-not-load
OPENAI_API_KEY="sk-test-value"
ELEVENLABS_API_KEY='eleven-test-value'
BRAVE_API_KEY=legacy-value # local note
`);

  assert.deepEqual(parsed, {
    BRAVE_SEARCH_API_KEY: "abc$not-a-command!(still-value)",
    OPENAI_API_KEY: "sk-test-value",
    ELEVENLABS_API_KEY: "eleven-test-value",
    BRAVE_API_KEY: "legacy-value",
  });
});

test("loads local secrets only for blank or missing env values", () => {
  const dir = mkdtempSync(join(tmpdir(), "prism-dev-secrets-"));
  const secretsPath = join(dir, "secrets.env");
  writeFileSync(
    secretsPath,
    [
      "BRAVE_SEARCH_API_KEY=brave-test",
      "OPENAI_API_KEY=openai-test",
      "UNRELATED_SECRET=ignored",
      "",
    ].join("\n"),
  );

  try {
    const env = {
      BRAVE_SEARCH_API_KEY: "",
      OPENAI_API_KEY: "already-set",
    };
    const result = loadDevSecretDefaults(env, { paths: [secretsPath] });

    assert.equal(result.path, secretsPath);
    assert.deepEqual(result.loadedKeys, ["BRAVE_SEARCH_API_KEY"]);
    assert.equal(env.BRAVE_SEARCH_API_KEY, "brave-test");
    assert.equal(env.OPENAI_API_KEY, "already-set");
    assert.equal(env.UNRELATED_SECRET, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
