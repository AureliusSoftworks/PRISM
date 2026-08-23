import assert from "node:assert/strict";
import test from "node:test";
import {
  voicePerformancePlanFromText,
  voiceVocalActionFromMarkedText,
} from "./voicePerformance.ts";

test("performance plans preserve ordered speech and action source ranges", () => {
  const source = "Well... *laughs nervously* I suppose. *sighs softly* Fine.";
  const plan = voicePerformancePlanFromText(source);

  assert.equal(plan.v, 1);
  assert.equal(plan.sourceLength, source.length);
  assert.equal(plan.spokenText, "Well... I suppose. Fine.");
  assert.deepEqual(
    plan.segments.map((segment) =>
      segment.kind === "speech"
        ? [segment.kind, segment.text]
        : [segment.kind, segment.action, segment.modifiers],
    ),
    [
      ["speech", "Well..."],
      ["vocal-action", "laugh", ["nervous"]],
      ["speech", "I suppose."],
      ["vocal-action", "sigh", ["soft"]],
      ["speech", "Fine."],
    ],
  );
  for (const segment of plan.segments) {
    assert.ok(segment.sourceEnd > segment.sourceStart);
    if (segment.kind === "vocal-action") {
      assert.equal(
        source.slice(segment.sourceStart, segment.sourceEnd),
        source.slice(segment.sourceStart, segment.sourceEnd),
      );
    }
  }
});

test("all core vocal actions and marked lol resolve", () => {
  const examples = new Map([
    ["lol", "laugh"],
    ["giggles dryly", "chuckle"],
    ["sighs", "sigh"],
    ["exhales", "exhale"],
    ["breath", "exhale"],
    ["breaths", "exhale"],
    ["gasps", "gasp"],
    ["coughs", "cough"],
    ["clears her throat", "throat-clear"],
    ["snorts", "snort"],
    ["groans", "groan"],
    ["sobs", "sob"],
    ["yawns", "yawn"],
  ]);
  for (const [authored, expected] of examples) {
    assert.equal(voiceVocalActionFromMarkedText(authored)?.action, expected);
  }
});

test("phonetic names can place a breath Foley cue between spoken fragments", () => {
  const source =
    "Trololololololololololololololo *breath* lololololololololololololololololololololololololololin' Terry";
  const plan = voicePerformancePlanFromText(source);

  assert.deepEqual(
    plan.segments.map((segment) =>
      segment.kind === "speech"
        ? [segment.kind, segment.text]
        : [segment.kind, segment.action],
    ),
    [
      ["speech", "Trololololololololololololololo"],
      ["vocal-action", "exhale"],
      [
        "speech",
        "lololololololololololololololololololololololololololin' Terry",
      ],
    ],
  );
  assert.equal(plan.spokenText.includes("breath"), false);
});

test("ordinary prose, emphasis, and unsupported stagecraft do not become actions", () => {
  assert.equal(voiceVocalActionFromMarkedText("I laugh every day"), null);
  assert.equal(voiceVocalActionFromMarkedText("laughs over the crowd"), null);
  const plan = voicePerformancePlanFromText(
    "I said lol in prose, *really* meant it, and *waves at everyone*.",
  );
  assert.equal(
    plan.segments.some((segment) => segment.kind === "vocal-action"),
    false,
  );
});
