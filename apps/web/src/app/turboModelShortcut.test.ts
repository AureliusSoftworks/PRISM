import assert from "node:assert/strict";
import test from "node:test";
import { turboModelShortcutCandidate } from "./turboModelShortcut.ts";

const candidates = [
  { id: "claude-sonnet-4-5", provider: "anthropic" as const },
  { id: "gpt-5.6-terra", provider: "openai" as const },
  { id: "gpt-5.4-mini", provider: "openai" as const },
];

test("keeps an online Fast route with its current provider", () => {
  assert.deepEqual(
    turboModelShortcutCandidate(candidates, "openai"),
    candidates[1],
  );
});

test("uses the existing route ordering to pick the lowest Fast option for that provider", () => {
  assert.deepEqual(
    turboModelShortcutCandidate(candidates, "openai", "gpt-5.4-mini"),
    candidates[2],
  );
});

test("falls through from an unsupported or local route to the preferred Fast online model", () => {
  assert.deepEqual(
    turboModelShortcutCandidate(candidates, "anthropic", "gpt-5.4-mini"),
    candidates[2],
  );
  assert.deepEqual(
    turboModelShortcutCandidate(candidates, "local", "gpt-5.4-mini"),
    candidates[2],
  );
});
