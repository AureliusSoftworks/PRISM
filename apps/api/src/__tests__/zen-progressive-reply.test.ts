import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildZenProgressiveContinuationMessages,
  buildZenProgressiveFirstBeatMessages,
  joinZenProgressiveSpeech,
  parseZenProgressiveBeat,
  zenProgressiveBeatLimit,
  zenProgressiveContinuationTokenBudget,
} from "../zen-progressive-reply.ts";

describe("Zen progressive reply beats", () => {
  it("parses a fenced beat without exposing the private continuation plan", () => {
    assert.deepEqual(
      parseZenProgressiveBeat(
        '```json\n{"speech":"Start here.\\n\\nThen breathe.","continue":true,"remainingPlan":"Explain the practical next step."}\n```',
      ),
      {
        speech: "Start here.\n\nThen breathe.",
        continue: true,
        remainingPlan: "Explain the practical next step.",
      },
    );
  });

  it("ends instead of continuing without a meaningful remaining plan", () => {
    assert.deepEqual(
      parseZenProgressiveBeat(
        '{"speech":"That is the whole answer.","continue":true,"remainingPlan":""}',
      ),
      {
        speech: "That is the whole answer.",
        continue: false,
        remainingPlan: "",
      },
    );
    assert.equal(parseZenProgressiveBeat("not json"), null);
  });

  it("keeps delivered beats verbatim and bounds the call count", () => {
    assert.equal(
      joinZenProgressiveSpeech([
        { speech: "First complete thought." },
        { speech: "Second complete thought." },
      ]),
      "First complete thought.\n\nSecond complete thought.",
    );
    assert.equal(zenProgressiveBeatLimit(64), 1);
    assert.equal(zenProgressiveBeatLimit(300), 1);
    assert.equal(zenProgressiveBeatLimit(560), 2);
    assert.equal(zenProgressiveBeatLimit(620), 3);
    assert.equal(zenProgressiveBeatLimit(10_000), 6);
    assert.equal(zenProgressiveContinuationTokenBudget(620, 1), 280);
    assert.equal(zenProgressiveContinuationTokenBudget(620, 2), 120);
  });

  it("carries the original prompt and forbids recap in later beats", () => {
    const base = [{ role: "user" as const, content: "Explain this deeply." }];
    const first = buildZenProgressiveFirstBeatMessages(base);
    assert.equal(first[0]?.content, "Explain this deeply.");
    assert.match(first.at(-1)?.content ?? "", /first self-contained/u);

    const continuation = buildZenProgressiveContinuationMessages({
      promptMessages: base,
      spokenText: "Opening thought.",
      remainingPlan: "Give the example.",
      beatIndex: 1,
    });
    assert.equal(continuation.at(-2)?.role, "assistant");
    assert.match(continuation.at(-1)?.content ?? "", /Do not recap/u);
    assert.match(continuation.at(-1)?.content ?? "", /Give the example/u);
  });
});
