import assert from "node:assert/strict";
import test from "node:test";
import {
  SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL,
  normalizeSlateDirectionScope,
  resolveSlateWordTarget,
  slateClarificationIsCurrent,
  validateSlateClarificationRequest,
  type SlateClarificationChoice,
  type SlateClarificationRequest,
} from "./slateComposition.ts";

test("Slate direction scope normalization stays on the three editable scopes", () => {
  assert.equal(normalizeSlateDirectionScope("BEAT"), "beat");
  assert.equal(normalizeSlateDirectionScope("selection"), "passage");
  assert.equal(normalizeSlateDirectionScope("full scene"), "scene");
  assert.equal(normalizeSlateDirectionScope("novel"), "passage");
});

test("Slate word targets follow explicit, scope, project, prompt, fallback precedence", () => {
  assert.deepEqual(
    resolveSlateWordTarget({
      explicitWordTarget: 777,
      scope: "scene",
      projectNormWordTarget: 900,
      promptDetailWordTarget: 2_000,
    }),
    { wordTarget: 777, source: "explicit" },
  );
  assert.deepEqual(
    resolveSlateWordTarget({
      scope: "beat",
      projectNormWordTarget: 900,
      promptDetailWordTarget: 2_000,
    }),
    { wordTarget: 180, source: "scope" },
  );
  assert.deepEqual(
    resolveSlateWordTarget({
      projectNormWordTarget: 900,
      promptDetailWordTarget: 2_000,
    }),
    { wordTarget: 900, source: "project_norm" },
  );
  assert.deepEqual(
    resolveSlateWordTarget({ promptDetailWordTarget: 2_000 }),
    { wordTarget: 2_000, source: "prompt_detail" },
  );
  assert.deepEqual(resolveSlateWordTarget({}), {
    wordTarget: 500,
    source: "fallback",
  });
});

function choice(id: string): SlateClarificationChoice {
  return {
    id,
    label: `Choice ${id}`,
    description: `Grounded outcome ${id}`,
    resolution: {
      action: "revise_direction",
      intentPatch: { direction: `Take path ${id}` },
    },
  };
}

function clarification(): SlateClarificationRequest {
  return {
    schemaVersion: 1,
    id: "clarification-1",
    operationId: "operation-1",
    trigger: "hard_continuity_conflict",
    status: "pending",
    prompt: "Mara cannot know this yet. Which truth should the scene preserve?",
    choices: [choice("a"), choice("b"), choice("c")],
    customVibe: {
      id: "custom-vibe",
      label: SLATE_CLARIFICATION_CUSTOM_VIBE_LABEL,
      placeholder: "Describe the emotional shape you want…",
    },
    sourceEvidence: [],
    revisionFingerprint: "revision-fingerprint",
    continuityGeneration: 4,
    mirrorProfileVersionId: "mirror-v2",
    idempotencyKey: "idempotency-1",
    answer: null,
    resumeOperationId: null,
    createdAt: "2026-07-29T12:00:00.000Z",
    answeredAt: null,
    staleAt: null,
  };
}

test("Slate clarification requires exactly three fixed choices plus custom vibe", () => {
  const valid = clarification();
  assert.deepEqual(validateSlateClarificationRequest(valid), {
    ok: true,
    issues: [],
  });

  const fourChoices = {
    ...valid,
    choices: [...valid.choices, choice("d")],
  };
  const invalidCount = validateSlateClarificationRequest(fourChoices);
  assert.equal(invalidCount.ok, false);
  assert.ok(
    invalidCount.issues.includes(
      "clarification must provide exactly 3 fixed choices",
    ),
  );

  const wrongVibe = {
    ...valid,
    customVibe: { ...valid.customVibe, label: "Something else" },
  };
  assert.equal(validateSlateClarificationRequest(wrongVibe).ok, false);
});

test("Slate clarification freshness binds revision, generation, and Mirror version", () => {
  const request = clarification();
  assert.equal(
    slateClarificationIsCurrent(request, {
      revisionFingerprint: "revision-fingerprint",
      continuityGeneration: 4,
      mirrorProfileVersionId: "mirror-v2",
    }),
    true,
  );
  assert.equal(
    slateClarificationIsCurrent(request, {
      revisionFingerprint: "revision-fingerprint",
      continuityGeneration: 5,
      mirrorProfileVersionId: "mirror-v2",
    }),
    false,
  );
});
