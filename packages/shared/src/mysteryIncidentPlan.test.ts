import assert from "node:assert/strict";
import test from "node:test";
import {
  bindMysteryIncidentPlanV1,
  composeMysteryIncidentPlanV1,
  deterministicMysteryCaseTitleV1,
  inferMysterySparkMotifsV1,
  mysteryIncidentPlanRequiresAccompliceV1,
  mysteryPublicChargeV1,
  resolveMysteryCaseTitleV1,
  validateMysteryCaseTitleV1,
  validateMysteryIncidentPlanV1,
} from "./mysteryIncidentPlan.ts";

test("Spark motifs are deterministic, compositional, and spoiler-safe", () => {
  const interpretation = inferMysterySparkMotifsV1(
    "During a storm, an accomplice steals the diamonds after a murder in a locked room.",
  );
  assert.deepEqual(
    interpretation.motifs.map((motif) => motif.id),
    ["storm", "conspiracy", "grand_theft", "homicide", "locked_room"],
  );
  assert.equal(JSON.stringify(interpretation).includes("seat"), false);
  assert.equal(JSON.stringify(interpretation).includes("culprit"), false);
});

test("difficulty bounds deterministic incident composition", () => {
  const common = {
    spark: "An accomplice steals diamonds while forged records hide the inheritance.",
    nonce: "recipe-42",
  };
  const casual = composeMysteryIncidentPlanV1({ ...common, difficulty: "casual" });
  const classic = composeMysteryIncidentPlanV1({ ...common, difficulty: "classic" });
  const mastermind = composeMysteryIncidentPlanV1({ ...common, difficulty: "mastermind" });
  assert.equal(casual.complications.length, 0);
  assert.equal(casual.primary.kind, "theft");
  assert.equal(casual.primary.subject, "the diamonds");
  assert.deepEqual(classic.complications.map((entry) => entry.kind), ["fraud"]);
  assert.equal(mastermind.complications.length, 2);
  assert.equal(mastermind.complications[0]?.kind, "fraud");
  assert.equal(mastermind.complications[0]?.actorRole, "accomplice");
  assert.equal(mysteryIncidentPlanRequiresAccompliceV1(mastermind), true);
  assert.deepEqual(validateMysteryIncidentPlanV1({ plan: mastermind, difficulty: "mastermind" }), {
    valid: true,
    errors: [],
  });
});

test("blank Spark produces a stable seeded surprise without public motifs", () => {
  assert.deepEqual(inferMysterySparkMotifsV1("  ").motifs, []);
  const first = composeMysteryIncidentPlanV1({
    spark: "",
    difficulty: "classic",
    nonce: "seeded-surprise",
  });
  const second = composeMysteryIncidentPlanV1({
    spark: "",
    difficulty: "classic",
    nonce: "seeded-surprise",
  });
  assert.deepEqual(first, second);
  assert.equal(first.source, "seeded_surprise");
  assert.equal(first.complications.length, 1);
  assert.equal(
    Array.from({ length: 32 }, (_value, index) => composeMysteryIncidentPlanV1({
      spark: "",
      difficulty: "casual",
      nonce: `seeded-${index}`,
    })).some((plan) => plan.primary.kind !== "homicide"),
    true,
  );
});

test("binding keeps actor identities in the private plan", () => {
  const plan = composeMysteryIncidentPlanV1({
    spark: "An accomplice steals a family heirloom.",
    difficulty: "classic",
    nonce: "binding",
  });
  const bound = bindMysteryIncidentPlanV1({
    plan,
    principalSeatId: "suspect-1",
    accompliceSeatId: "suspect-4",
  });
  assert.deepEqual(bound.primary.responsibleSeatIds, ["suspect-1", "suspect-4"]);
  assert.equal(JSON.stringify(mysteryPublicChargeV1(bound)).includes("suspect-"), false);
  assert.throws(
    () => bindMysteryIncidentPlanV1({
      plan,
      principalSeatId: "suspect-1",
      accompliceSeatId: null,
    }),
    /requires an accomplice seat/,
  );
});

test("an explicit homicide and theft remain one charge with a linked complication", () => {
  const plan = composeMysteryIncidentPlanV1({
    spark: "A murder lets an accomplice steal the diamonds.",
    difficulty: "classic",
    nonce: "linked-incidents",
  });
  assert.equal(plan.primary.kind, "homicide");
  assert.deepEqual(plan.complications.map((entry) => entry.kind), ["theft"]);
  assert.equal(plan.complications[0]?.actorRole, "accomplice");
});

test("case titles stay concise, spoiler-safe, and semantically non-repetitive", () => {
  for (const invalid of [
    "The Disappearance of an earlier unexplained disappearance",
    "Vanished in the Vanishing",
    "The Culprit in the Empty Room",
    "Untitled mystery case",
  ]) {
    assert.equal(validateMysteryCaseTitleV1(invalid).valid, false, invalid);
  }
  assert.deepEqual(validateMysteryCaseTitleV1('  “The Missing Hour”  '), {
    valid: true,
    normalizedTitle: "The Missing Hour",
    errors: [],
  });
  assert.equal(
    validateMysteryCaseTitleV1("The Turnabout at Violet Hour").valid,
    true,
  );
});

test("invalid authored titles resolve to a stable incident-specific title", () => {
  const plan = composeMysteryIncidentPlanV1({
    spark: "An unexplained disappearance at a winter lodge",
    difficulty: "classic",
    nonce: "title-regression",
  });
  assert.equal(plan.primary.kind, "disappearance");
  const fallback = deterministicMysteryCaseTitleV1(plan);
  assert.equal(validateMysteryCaseTitleV1(fallback).valid, true);
  assert.equal(
    resolveMysteryCaseTitleV1({
      authoredTitle: "The Disappearance of an earlier disappearance",
      plan,
    }),
    fallback,
  );
  assert.equal(
    resolveMysteryCaseTitleV1({ authoredTitle: "The Missing Hour at Blackwood", plan }),
    "The Missing Hour at Blackwood",
  );
});
