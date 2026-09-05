import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalVoicePerformancePlanV2,
  normalizeVoicePerformancePlanV2,
  VOICE_PERFORMANCE_RATE_ENVELOPES_V2,
  voicePerformanceRateAtProgressV2,
  voicePerformanceSynthesisTextV2,
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

test("Signal V2 cadence is deterministic, bounded, and presentation-only", () => {
  const canonical =
    "I understand the premise, but there is a practical distinction here; the public result still needs a substantive answer.";
  const first = buildSignalVoicePerformancePlanV2({
    messageId: "message-v2",
    seed: "stable-signal-v2",
    canonicalText: canonical,
  });
  const second = buildSignalVoicePerformancePlanV2({
    messageId: "message-v2",
    seed: "stable-signal-v2",
    canonicalText: canonical,
  });
  assert.deepEqual(second, first);
  assert.ok(first);
  assert.equal(first.canonicalImpact, "none");
  assert.deepEqual(normalizeVoicePerformancePlanV2(first), first);
  assert.ok(first.segments.length >= 1);
  assert.equal(
    first.segments
      .filter((segment) => segment.kind === "speech")
      .map((segment) => segment.text)
      .join(""),
    canonical,
  );
  for (const keyframe of first.rateKeyframes) {
    assert.ok(keyframe.rate >= 0.93 && keyframe.rate <= 1.07);
  }
  for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
    const rate = voicePerformanceRateAtProgressV2(first, progress);
    assert.ok(rate >= 0.93 && rate <= 1.07);
  }
  assert.equal(canonical.includes("uh"), false);
});

test("Signal V2 cadence exposes the deliberate opening and post-hesitation envelopes", () => {
  const canonical =
    "In brief, the first result changes the measurement; after that pause, the longer explanation connects the observation to a practical consequence for the whole experiment.";
  const plans = Array.from({ length: 1_000 }, (_, index) =>
    buildSignalVoicePerformancePlanV2({
      messageId: `envelope-message-${index}`,
      seed: `envelope-seed-${index}`,
      canonicalText: canonical,
    })
  ).filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
  assert.ok(plans.length > 0);
  for (const plan of plans) {
    const opening = plan.rateKeyframes.find((frame) => frame.intent === "opening");
    assert.ok(opening);
    assert.equal(opening.progress, 0);
    assert.ok(opening.rate >= VOICE_PERFORMANCE_RATE_ENVELOPES_V2.opening[0]);
    assert.ok(opening.rate <= VOICE_PERFORMANCE_RATE_ENVELOPES_V2.opening[1]);
    for (const frame of plan.rateKeyframes) {
      if (!frame.intent) continue;
      const [minimum, maximum] = VOICE_PERFORMANCE_RATE_ENVELOPES_V2[frame.intent];
      assert.ok(frame.rate >= minimum, `${frame.intent} below ${minimum}`);
      assert.ok(frame.rate <= maximum, `${frame.intent} above ${maximum}`);
    }
  }
  const hesitating = plans.find((plan) => plan.hesitation);
  assert.ok(hesitating?.hesitation);
  const accelerated = hesitating.rateKeyframes.find(
    (frame) => frame.intent === "post_hesitation",
  );
  assert.ok(accelerated);
  assert.ok(accelerated.progress > hesitating.hesitation.sourceProgress);
  assert.ok(
    accelerated.rate >= VOICE_PERFORMANCE_RATE_ENVELOPES_V2.post_hesitation[0],
  );
  assert.ok(
    accelerated.rate <= VOICE_PERFORMANCE_RATE_ENVELOPES_V2.post_hesitation[1],
  );
  assert.ok(
    plans.some((plan) =>
      plan.rateKeyframes.some((frame) => frame.intent === "short_emphasis")
    ),
  );
});

test("eligible hesitations keep a deterministic three-silent-to-one-filler mix", () => {
  const canonical =
    "This is a safe clause boundary, and the second half explains the exact consequence; nothing in the transcript is rewritten.";
  const hesitations = Array.from({ length: 720 }, (_, index) =>
    buildSignalVoicePerformancePlanV2({
      messageId: `message-${index}`,
      seed: `hesitation-seed-${index}`,
      canonicalText: canonical,
    })?.hesitation
  ).filter((value) => value !== null && value !== undefined);
  const fillers = hesitations.filter((value) => value.kind === "filler");
  assert.ok(hesitations.length >= 190 && hesitations.length <= 290);
  assert.ok(fillers.length / hesitations.length >= 0.18);
  assert.ok(fillers.length / hesitations.length <= 0.32);
  for (const hesitation of hesitations) {
    assert.ok(hesitation.sourceProgress >= 0.2);
    assert.ok(hesitation.sourceProgress <= 0.8);
  }
});

test("filler synthesis changes only the audio projection", () => {
  const canonical =
    "The first clause establishes the claim, while the second clause gives the evidence that makes the answer useful.";
  const fillerPlan = Array.from({ length: 500 }, (_, index) =>
    buildSignalVoicePerformancePlanV2({
      messageId: `filler-${index}`,
      seed: `filler-seed-${index}`,
      canonicalText: canonical,
    })
  ).find((plan) => plan?.hesitation?.kind === "filler");
  assert.ok(fillerPlan);
  const synthesis = voicePerformanceSynthesisTextV2(canonical, fillerPlan);
  assert.notEqual(synthesis, canonical);
  assert.match(synthesis, /\b(?:uh|um|uhh),/u);
  assert.equal(canonical.includes("uh,"), false);
  assert.equal(
    buildSignalVoicePerformancePlanV2({
      messageId: "blocked",
      seed: "blocked",
      canonicalText: canonical,
      exclusion: "producer_or_power_precedence",
    }),
    null,
  );
});

test("V2 segments reject malformed source maps and protect quoted boundaries", () => {
  const canonical =
    'She said "the first result, and the second result," then paused; outside the quote, the practical consequence became much clearer.';
  const plans = Array.from({ length: 500 }, (_, index) =>
    buildSignalVoicePerformancePlanV2({
      messageId: `quoted-${index}`,
      seed: `quoted-seed-${index}`,
      canonicalText: canonical,
    })
  ).filter((plan): plan is NonNullable<typeof plan> => Boolean(plan));
  const quoteStart = canonical.indexOf('"');
  const quoteEnd = canonical.lastIndexOf('"') + 1;
  for (const plan of plans) {
    if (!plan.hesitation) continue;
    assert.ok(
      plan.hesitation.sourceOffset <= quoteStart ||
        plan.hesitation.sourceOffset >= quoteEnd,
    );
  }
  const valid = plans[0];
  assert.ok(valid);
  assert.equal(
    normalizeVoicePerformancePlanV2({
      ...valid,
      segments: [{
        kind: "speech",
        text: "wrong",
        sourceStart: 0,
        sourceEnd: valid.sourceLength,
      }],
    }),
    null,
  );
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
