import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDebateMysteryProsecutionStageCueV1,
  debateMysteryPressQuestionCanonicalTextV1,
  debateMysteryProsecutionKeywordFragmentsV1,
  validateDebateMysteryProsecutionPerformanceV1,
} from "../debate-mystery-prosecution-persona.ts";

const question = "What was your working relationship with Avery Vale like tonight?";

function questionCue() {
  return buildDebateMysteryProsecutionStageCueV1({
    kind: "talk_question",
    lineId: "line-talk-suspect-3-topic-sarah-avery",
    canonicalText: question,
    mood: "probing",
    suspectName: "Sassy Sarah",
    subjectLabel: "Avery Vale",
    subjectMentions: ["Avery Vale"],
    familiar: false,
    forbiddenDisclosures: ["the culprit is", "Sassy Sarah is the culprit"],
  });
}

test("keeps a question on its subject through names and content words", () => {
  assert.deepEqual(
    debateMysteryProsecutionKeywordFragmentsV1(question),
    ["working", "relationship", "Avery", "Vale", "tonight"],
  );
  const cue = questionCue();
  const subject = cue.allowedFacts.find((fact) => fact.id === "subject");
  assert.ok(subject?.required);
  assert.deepEqual(
    subject.mentionFragments.slice(0, 3),
    ["Avery Vale", "Avery", "Vale"],
    "the named subject comes first, whole and by its longer words",
  );
  assert.equal(cue.deterministicFallbackText, question);
  assert.match(cue.objective, /Sassy Sarah/u);
  assert.match(cue.objective, /own voice/u);
  assert.equal(cue.forbiddenDisclosures.length, 2);
  assert.ok(cue.maxCharacters >= question.length * 2 || cue.maxCharacters === 320);
});

test("accepts a persona rewrite that keeps the subject, cleans labels, and still asks", () => {
  const cue = questionCue();
  const performed = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "talk_question",
    text: "Peter Griffin: *leans in* \"So, uh, what was the deal with you and Avery Vale tonight, huh?\"",
    canonicalText: question,
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(performed.valid, true, performed.errors.join(" "));
  assert.equal(performed.text, "So, uh, what was the deal with you and Avery Vale tonight, huh?");
  assert.equal(performed.unchanged, false);
});

test("refuses a performance that drops the subject, spoils the case, or stops asking", () => {
  const cue = questionCue();
  const drifted = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "talk_question",
    text: "So where were you when the lights went out, huh?",
    canonicalText: question,
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(drifted.valid, false);
  assert.match(drifted.errors.join(" "), /omits required fact subject/u);
  const spoiled = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "talk_question",
    text: "Everyone knows the culprit is you, so what was Avery Vale to you tonight?",
    canonicalText: question,
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(spoiled.valid, false);
  assert.match(spoiled.errors.join(" "), /forbidden disclosure/u);
  const flat = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "talk_question",
    text: "Tell me about you and Avery Vale tonight.",
    canonicalText: question,
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(flat.valid, false);
  assert.match(flat.errors.join(" "), /question mark/u);
});

test("treats the canonical line handed back unchanged as a keep, never a retry", () => {
  const cue = questionCue();
  const same = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "talk_question",
    text: `"${question}"`,
    canonicalText: question,
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(same.valid, false);
  assert.equal(same.unchanged, true);
});

test("a Present prompt must name the item but may be a statement", () => {
  const cue = buildDebateMysteryProsecutionStageCueV1({
    kind: "present_prompt",
    lineId: "line-present-suspect-3-evidence-silver-key",
    canonicalText: "Take a look at this: the Silver Key.",
    mood: "measured",
    suspectName: "Sassy Sarah",
    subjectLabel: "Silver Key",
    subjectMentions: ["Silver Key"],
    familiar: true,
    forbiddenDisclosures: [],
  });
  assert.match(cue.emotionalState, /already know/u);
  const performed = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "present_prompt",
    text: "Sarah, you're gonna wanna explain this Silver Key.",
    canonicalText: "Take a look at this: the Silver Key.",
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(performed.valid, true, performed.errors.join(" "));
  const unnamed = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "present_prompt",
    text: "Sarah, you're gonna wanna explain this.",
    canonicalText: "Take a look at this: the Silver Key.",
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(unnamed.valid, false);
});

test("a press quotes the sworn words back and must stay a question about them", () => {
  const canonical = debateMysteryPressQuestionCanonicalTextV1("I was in the galley all night");
  assert.equal(canonical, 'You said, "I was in the galley all night." Is that the whole of it, or is there something you left out?');
  const cue = buildDebateMysteryProsecutionStageCueV1({
    kind: "press_question",
    lineId: "line-press-question-version-statement-suspect-1-1-1",
    canonicalText: canonical,
    mood: "pressing, precise",
    suspectName: "Lois Griffin",
    subjectLabel: "their sworn statement",
    subjectMentions: [],
    familiar: false,
    forbiddenDisclosures: ["the culprit is"],
  });
  assert.match(cue.objective, /Press Lois Griffin/u);
  const subject = cue.allowedFacts.find((fact) => fact.id === "subject");
  assert.ok(subject?.required);
  assert.ok(subject.mentionFragments.includes("galley"), "the statement's own words anchor the press");
  const performed = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "press_question",
    text: "Peter Griffin: All night in the galley, huh? Every single minute of it?",
    canonicalText: canonical,
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(performed.valid, true, performed.errors.join(" "));
  assert.equal(performed.text, "All night in the galley, huh? Every single minute of it?");
  const statement = validateDebateMysteryProsecutionPerformanceV1({
    cue,
    kind: "press_question",
    text: "The galley. All night. We'll see about that.",
    canonicalText: canonical,
    speakerNames: ["Peter Griffin"],
  });
  assert.equal(statement.valid, false);
  assert.match(statement.errors.join(" "), /question mark/u);
});
