import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildImagePromptAttempts,
  runImagePromptAttempts,
} from "../image-prompt-retry.ts";

describe("image prompt retries", () => {
  it("keeps the authored prompt first and ends source edits with a prompt-only alternative", () => {
    const attempts = buildImagePromptAttempts({
      prompt: "Relight this exact studio and preserve its artwork.",
      useSourceImage: true,
      promptOnlyFallback: "A wide daytime two-person studio.",
    });

    assert.deepEqual(
      attempts.map((attempt) => attempt.strategy),
      ["authored", "general-audience", "original-alternative"],
    );
    assert.deepEqual(
      attempts.map((attempt) => attempt.useSourceImage),
      [true, true, false],
    );
    assert.equal(attempts[0]?.prompt, "Relight this exact studio and preserve its artwork.");
    assert.match(attempts[1]?.prompt ?? "", /distinct original visual motifs/u);
    assert.match(attempts[2]?.prompt ?? "", /A wide daytime two-person studio/u);
  });

  it("retries only refusal-like failures and reports the prompt that succeeded", async () => {
    const attempts = buildImagePromptAttempts({ prompt: "A dramatic studio." });
    const calls: string[] = [];
    const result = await runImagePromptAttempts({
      attempts,
      generate: async (attempt) => {
        calls.push(attempt.strategy);
        if (calls.length < 3) throw new Error("content_policy blocked");
        return "image";
      },
    });

    assert.equal(result.value, "image");
    assert.equal(result.strategy, "original-alternative");
    assert.equal(result.attemptCount, 3);
    assert.deepEqual(calls, ["authored", "general-audience", "original-alternative"]);
  });

  it("does not retry transport or account failures", async () => {
    const attempts = buildImagePromptAttempts({ prompt: "A quiet studio." });
    let calls = 0;
    await assert.rejects(
      runImagePromptAttempts({
        attempts,
        generate: async () => {
          calls += 1;
          throw new Error("OpenAI image generation failed (401): invalid API key");
        },
      }),
      /invalid API key/u,
    );
    assert.equal(calls, 1);
  });

  it("softens explicit details in retry prompts without changing the authored attempt", () => {
    const attempts = buildImagePromptAttempts({
      prompt: "An erotic topless portrait in lingerie.",
    });
    assert.equal(attempts[0]?.prompt, "An erotic topless portrait in lingerie.");
    assert.doesNotMatch(attempts[1]?.prompt ?? "", /erotic|topless|lingerie/iu);
    assert.match(attempts[1]?.prompt ?? "", /fully clothed|everyday clothing/iu);
  });
});

