import assert from "node:assert/strict";
import test from "node:test";
import {
  PRISM_COMPANION_RECOVERY_LIMIT,
  normalizePrismCompanionActionIntents,
  normalizePrismCompanionRequest,
  normalizePrismCompanionSurfaceReference,
} from "./prismCompanion.ts";

test("normalizes only identifier-based surface context", () => {
  assert.deepEqual(
    normalizePrismCompanionSurfaceReference({
      surfaceId: "slate",
      botIds: [" one ", "one", "two"],
      slateProjectId: " project-1 ",
      manuscript: "This must never enter the contract.",
      memories: ["also forbidden"],
    }),
    {
      surfaceId: "slate",
      botIds: ["one", "two"],
      slateProjectId: "project-1",
    },
  );
});

test("keeps only the latest three valid recovery messages", () => {
  const request = normalizePrismCompanionRequest({
    surface: { surfaceId: "coffee" },
    message: " Hello, Prism. ",
    recoveryMessages: [
      { id: "1", role: "user", content: "one", createdAt: "a" },
      { id: "2", role: "assistant", content: "two", createdAt: "b" },
      { id: "bad", role: "system", content: "ignore", createdAt: "c" },
      { id: "3", role: "user", content: "three", createdAt: "d" },
      { id: "4", role: "assistant", content: "four", createdAt: "e" },
    ],
  });
  assert.equal(request.message, "Hello, Prism.");
  assert.equal(request.recoveryMessages.length, PRISM_COMPANION_RECOVERY_LIMIT);
  assert.deepEqual(
    request.recoveryMessages.map((message) => message.content),
    ["two", "three", "four"],
  );
});

test("accepts only allowlisted companion actions and caps the result", () => {
  assert.deepEqual(
    normalizePrismCompanionActionIntents([
      { type: "navigate", destination: "home" },
      { type: "delete_bot", botId: "danger" },
      { type: "open_tool", tool: "marketplace" },
      { type: "export_bot", botId: " bot-1 " },
      { type: "open_tool", tool: "settings" },
    ]),
    [
      { type: "navigate", destination: "home" },
      { type: "open_tool", tool: "marketplace" },
      { type: "export_bot", botId: "bot-1" },
    ],
  );
});

test("rejects an unknown surface and oversized messages", () => {
  assert.throws(
    () => normalizePrismCompanionRequest({ surface: { surfaceId: "admin" }, message: "hello" }),
    /valid Prism surface/u,
  );
  assert.throws(
    () => normalizePrismCompanionRequest({ surface: { surfaceId: "home" }, message: "x".repeat(4_001) }),
    /4,000 characters/u,
  );
});
