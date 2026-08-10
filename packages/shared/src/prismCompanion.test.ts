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
      storySessionId: " story-1 ",
      imageId: " image-1 ",
      manuscript: "This must never enter the contract.",
      memories: ["also forbidden"],
    }),
    {
      surfaceId: "slate",
      botIds: ["one", "two"],
      slateProjectId: "project-1",
      storySessionId: "story-1",
      imageId: "image-1",
    },
  );
});

test("keeps only bounded unsaved Debate setup context on the Debate surface", () => {
  const draft = {
    studioPanel: "evidence",
    format: "turnabout",
    formality: "heated",
    playerRole: "participant",
    playerSideId: "against",
    juryEnabled: true,
    moderatorTitle: " The Court ",
    topic: "  Transit policy  ",
    motion: "A".repeat(400),
    forLabel: "For",
    forBrief: "Build it.",
    againstLabel: "Against",
    againstBrief: "Limit it.",
    exhibitAdjective: "Rusty",
    exhibitObject: "spoon",
    exhibitObservation: "Its bowl is visibly dented.",
    evidenceItemCount: 99,
  };
  const normalized = normalizePrismCompanionSurfaceReference({
    surfaceId: "debate",
    debateDraft: draft,
  });
  assert.equal(normalized.debateDraft?.topic, "Transit policy");
  assert.equal(normalized.debateDraft?.motion.length, 320);
  assert.equal(normalized.debateDraft?.evidenceItemCount, 12);
  assert.equal(normalized.debateDraft?.exhibitObject, "spoon");
  assert.equal(
    normalizePrismCompanionSurfaceReference({
      surfaceId: "settings",
      debateDraft: draft,
    }).debateDraft,
    undefined,
  );
});

test("keeps only the latest three valid recovery messages", () => {
  const request = normalizePrismCompanionRequest({
    surface: { surfaceId: "coffee" },
    message: " Hello, Prism. ",
    requestId: " request-1 ",
    contextTokenIds: [" token-1 ", "token-1", "token-2"],
    orchestrationOnly: true,
    persistConversationId: " prism-chat-1 ",
    recoveryMessages: [
      { id: "1", role: "user", content: "one", createdAt: "a" },
      { id: "2", role: "assistant", content: "two", createdAt: "b" },
      { id: "bad", role: "system", content: "ignore", createdAt: "c" },
      { id: "3", role: "user", content: "three", createdAt: "d" },
      { id: "4", role: "assistant", content: "four", createdAt: "e" },
    ],
  });
  assert.equal(request.message, "Hello, Prism.");
  assert.equal(request.requestId, "request-1");
  assert.deepEqual(request.contextTokenIds, ["token-1", "token-2"]);
  assert.equal(request.orchestrationOnly, true);
  assert.equal(request.persistConversationId, "prism-chat-1");
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
    () =>
      normalizePrismCompanionRequest({
        surface: { surfaceId: "admin" },
        message: "hello",
      }),
    /valid Prism surface/u,
  );
  assert.throws(
    () =>
      normalizePrismCompanionRequest({
        surface: { surfaceId: "home" },
        message: "x".repeat(4_001),
      }),
    /4,000 characters/u,
  );
});

test("allows persistence only for non-Private orchestration preflight", () => {
  assert.deepEqual(
    normalizePrismCompanionRequest({
      surface: { surfaceId: "home" },
      message: "Open Slate.",
      requestId: "action-1",
      orchestrationOnly: true,
      persistConversationId: " prism-chat-1 ",
    }),
    {
      surface: { surfaceId: "home" },
      message: "Open Slate.",
      recoveryMessages: [],
      requestId: "action-1",
      contextTokenIds: [],
      orchestrationOnly: true,
      persistConversationId: "prism-chat-1",
    },
  );
  assert.throws(
    () =>
      normalizePrismCompanionRequest({
        surface: { surfaceId: "home" },
        message: "Open Slate.",
        orchestrationOnly: true,
        privateMode: true,
        persistConversationId: "prism-chat-1",
      }),
    /Private Prism requests cannot persist/u,
  );
  assert.throws(
    () =>
      normalizePrismCompanionRequest({
        surface: { surfaceId: "home" },
        message: "Open Slate.",
        persistConversationId: "prism-chat-1",
      }),
    /only during orchestration preflight/u,
  );
  assert.throws(
    () =>
      normalizePrismCompanionRequest({
        surface: { surfaceId: "home" },
        message: "Open Slate.",
        orchestrationOnly: true,
        persistConversationId: " ",
      }),
    /valid Prism conversation/u,
  );
});
