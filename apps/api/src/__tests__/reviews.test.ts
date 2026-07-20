import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PrismReviewArtifactV1 } from "@localai/shared";
import type { ProviderMessage } from "../providers.ts";
import {
  buildPrismReviewMessagesV1,
  prismReviewHashV1,
  runPrismReviewV1,
} from "../reviews.ts";

const artifact: PrismReviewArtifactV1 = {
  version: 1,
  appletId: "signal",
  subjectId: "episode-1",
  subjectTitle: "The Empty Chair",
  perspective: "audience",
  perspectiveLabel: "Signal broadcast audience",
  context: { host: "Silent Jack", guest: "Ryuk" },
  evidence: [
    {
      id: "line-1",
      channel: "audio",
      label: "Silent Jack",
      transcript: "...",
    },
  ],
  createdAt: "2026-07-20T00:00:00.000Z",
};

const rubric = {
  id: "signal.audience-pulse",
  version: 1,
  instructions: ["Judge the broadcast as one subjective listener."],
  outputInstruction: 'Return {"rating":number}.',
  parse(raw: string): { rating: number } | null {
    const rating = Number(JSON.parse(raw).rating);
    return Number.isFinite(rating) ? { rating } : null;
  },
};

describe("generic PRISM reviews", () => {
  it("builds the prompt only from the projected artifact", () => {
    const messages = buildPrismReviewMessagesV1({
      artifact,
      reviewer: {
        version: 1,
        reviewerId: "critic-1",
        reviewerName: "Nia",
        systemPrompt: "A skeptical listener.",
      },
      rubric,
    });
    const prompt = messages.map((message) => message.content).join("\n");
    assert.match(prompt, /Signal broadcast audience/u);
    assert.match(prompt, /Anything absent from the artifact was not experienced/u);
    assert.match(prompt, /\[audio:line-1\] Silent Jack: \.\.\./u);
    assert.doesNotMatch(prompt, /raw runtime|Ryuk said/u);
  });

  it("returns typed output with stable artifact and reviewer provenance", async () => {
    const captures: ProviderMessage[][] = [];
    const result = await runPrismReviewV1({
      artifact,
      reviewer: {
        version: 1,
        reviewerId: "critic-1",
        reviewerName: "Nia",
        systemPrompt: "A skeptical listener.",
      },
      rubric,
      provider: {
        name: "local",
        async generateResponse(messages) {
          captures.push(messages);
          return '{"rating":2.5}';
        },
        async embedText() {
          return [];
        },
      },
      model: "review-model",
      now: () => "2026-07-20T01:00:00.000Z",
    });
    assert.equal(captures.length, 1);
    assert.deepEqual(result?.output, { rating: 2.5 });
    assert.equal(result?.artifactHash, prismReviewHashV1(artifact));
    assert.equal(result?.reviewerSnapshot.reviewerId, "critic-1");
    assert.equal(result?.provider, "local");
    assert.equal(result?.model, "review-model");
  });
});
