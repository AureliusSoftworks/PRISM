import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { LlmProvider } from "../providers.ts";
import { validateMemoryCandidates } from "../memory-validation.ts";

function providerWithResponse(response: string): LlmProvider {
  return {
    name: "local",
    async generateResponse(): Promise<string> {
      return response;
    },
    async embedText(): Promise<number[]> {
      return [1, 0, 0];
    },
  };
}

function throwingProvider(): LlmProvider {
  return {
    name: "local",
    async generateResponse(): Promise<string> {
      throw new Error("validator unavailable");
    },
    async embedText(): Promise<number[]> {
      return [1, 0, 0];
    },
  };
}

describe("validateMemoryCandidates", () => {
  it("approves clean personal preferences", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "approve",
              text: "You love potatoes.",
              confidence: 0.9,
              reasonCodes: [],
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "I love potatoes.",
        candidates: [{ text: "You love potatoes.", confidence: 0.9 }],
      }
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.text, "You love potatoes.");
    assert.equal(result.candidates[0]?.validationStatus, "approved");
    assert.deepEqual(result.rejected, []);
  });

  it("auto-fixes assistant identity instructions into user preferences", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "auto_fix",
              text: "You prefer Prism not to refer to itself as AI.",
              confidence: 0.92,
              reasonCodes: ["assistant_identity_instruction", "subject_role_confusion"],
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "Remember this: do not refer to yourself as AI.",
        candidates: [{ text: "Do not refer to yourself as AI.", confidence: 0.98 }],
      }
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(
      result.candidates[0]?.text,
      "You prefer Prism not to refer to itself as AI."
    );
    assert.equal(result.candidates[0]?.validationStatus, "auto_fixed");
    assert.deepEqual(result.rejected, []);
  });

  it("rejects assistant identity instructions when the critic leaves command syntax intact", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "approve",
              text: "Do not refer to yourself as AI.",
              confidence: 0.98,
              reasonCodes: [],
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "Remember this: do not refer to yourself as AI.",
        candidates: [{ text: "Do not refer to yourself as AI.", confidence: 0.98 }],
      }
    );

    assert.equal(result.candidates.length, 0);
    assert.deepEqual(result.rejected[0]?.reasonCodes, ["assistant_identity_instruction"]);
  });

  it("rejects task-shaped candidates before calling the critic", async () => {
    const result = await validateMemoryCandidates(throwingProvider(), {
      source: "direct",
      scope: "bot",
      rawContext: "Write a quick email to my landlord.",
      candidates: [
        { text: "Write a quick email to your landlord.", confidence: 0.9 },
      ],
    });

    assert.equal(result.candidates.length, 0);
    assert.deepEqual(result.rejected[0]?.reasonCodes, ["task_request_not_memory"]);
  });

  it("rejects malformed critic output without saving", async () => {
    const result = await validateMemoryCandidates(providerWithResponse("Looks good to me."), {
      source: "direct",
      scope: "bot",
      rawContext: "I prefer matcha.",
      candidates: [{ text: "You prefer matcha.", confidence: 0.86 }],
    });

    assert.equal(result.candidates.length, 0);
    assert.deepEqual(result.rejected[0]?.reasonCodes, [
      "validator_error",
      "malformed_text",
    ]);
  });

  it("rejects weak contradictions against existing single-value memories", async () => {
    const result = await validateMemoryCandidates(throwingProvider(), {
      source: "direct",
      scope: "global",
      rawContext: "My favorite drink is soda.",
      candidates: [{ text: "Your favorite drink is soda.", confidence: 0.62 }],
      existingMemories: ["Your favorite drink is coffee."],
    });

    assert.equal(result.candidates.length, 0);
    assert.deepEqual(result.rejected[0]?.reasonCodes, ["contradiction", "low_confidence"]);
  });
});
