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

  it("normalizes bullet-style name-led memories into second-person voice", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "auto_fix",
              text: "- Jared enjoys working on an app.",
              confidence: 0.87,
              reasonCodes: ["subject_role_confusion"],
            },
          ],
        })
      ),
      {
        source: "compiled",
        scope: "bot",
        rawContext: "Summary output from prior chats.",
        candidates: [{ text: "- Jared enjoys working on an app.", confidence: 0.87 }],
      }
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.text, "You enjoy working on an app.");
    assert.deepEqual(result.rejected, []);
  });

  it("preserves the display name for human-user memories", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "approve",
              text: "Jared prefers spending time with kind people.",
              confidence: 0.86,
              reasonCodes: [],
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "I prefer kind people.",
        candidates: [{ text: "You prefer kind people.", confidence: 0.9 }],
        userDisplayName: "Jared",
      }
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(
      result.candidates[0]?.text,
      "Jared prefers spending time with kind people."
    );
    assert.deepEqual(result.rejected, []);
  });

  it("rewrites figurative allergy jokes into stable user preferences", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "auto_fix",
              text: "Jared prefers spending time with kind people.",
              confidence: 0.82,
              reasonCodes: ["figurative_preference"],
              notes: "The allergy phrasing is a joke about disliking mean people.",
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "Fun fact: I am allergic to mean people.",
        candidates: [{ text: "You are allergic to mean people.", confidence: 0.9 }],
        userDisplayName: "Jared",
      }
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(
      result.candidates[0]?.text,
      "Jared prefers spending time with kind people."
    );
    assert.equal(result.candidates[0]?.validationStatus, "auto_fixed");
    assert.deepEqual(result.candidates[0]?.reasonCodes, ["figurative_preference"]);
    assert.deepEqual(result.rejected, []);
  });

  it("normalizes third-person pronouns into second-person voice", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "auto_fix",
              text: "He plans a mix of relaxation and adventure for his upcoming PTO.",
              confidence: 0.81,
              reasonCodes: ["subject_role_confusion"],
            },
          ],
        })
      ),
      {
        source: "compiled",
        scope: "bot",
        rawContext: "Summary output from prior chats.",
        candidates: [
          {
            text: "He plans a mix of relaxation and adventure for his upcoming PTO.",
            confidence: 0.81,
          },
        ],
      }
    );

    assert.equal(result.candidates.length, 1);
    assert.equal(
      result.candidates[0]?.text,
      "You plan a mix of relaxation and adventure for your upcoming PTO."
    );
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

  it("rejects answer-shaped compiled memories before calling the critic", async () => {
    const result = await validateMemoryCandidates(throwingProvider(), {
      source: "compiled",
      scope: "global",
      rawContext: "assistant: Here is how to open a folder from the console.",
      candidates: [
        {
          text:
            "In PowerShell you can use this command: ``` explorer C:\\Path\\To\\Folder ``` and then hit Enter.",
          confidence: 0.52,
        },
      ],
    });

    assert.equal(result.candidates.length, 0);
    assert.deepEqual(result.rejected[0]?.reasonCodes, ["task_request_not_memory"]);
  });

  it("pre-approves explicit preferred-name memories without the critic", async () => {
    const result = await validateMemoryCandidates(throwingProvider(), {
      source: "direct",
      scope: "bot",
      rawContext: "Do not forget my name is Jared.",
      candidates: [{ text: "You prefer to be called Jared.", confidence: 0.98 }],
      userDisplayName: "Jared",
    });

    assert.equal(result.rejected.length, 0);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.text, "You prefer to be called Jared.");
    assert.equal(result.candidates[0]?.validationStatus, "approved");
  });

  it("pre-approves low-certainty Coffee observer user facts without the critic", async () => {
    const result = await validateMemoryCandidates(throwingProvider(), {
      source: "inferred",
      scope: "bot",
      rawContext: "[Coffee speaker: Alice]\nJared prefers short answers.",
      candidates: [
        {
          text: "You prefer short answers.",
          confidence: 0.64,
          category: "user",
        },
      ],
      userDisplayName: "Jared",
    });

    assert.equal(result.rejected.length, 0);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.text, "You prefer short answers.");
    assert.equal(result.candidates[0]?.category, "user");
  });

  it("pre-approves low-certainty Coffee observer bot relations without the critic", async () => {
    const result = await validateMemoryCandidates(throwingProvider(), {
      source: "inferred",
      scope: "bot",
      rawContext: "[Coffee speaker: Alice]\nBoris, I agree with your approach.",
      candidates: [
        {
          text: "Alice tended to agree with Boris during Coffee.",
          confidence: 0.56,
          category: "bot_relation",
        },
      ],
    });

    assert.equal(result.rejected.length, 0);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.text, "Alice tended to agree with Boris during Coffee.");
    assert.equal(result.candidates[0]?.category, "bot_relation");
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

  it("uses the critic for explicit fun-fact disclosures in direct user context", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "approve",
              text: "Jared lives on land.",
              confidence: 0.86,
              reasonCodes: [],
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "Fun: fact, I live on land!",
        candidates: [{ text: "You live on land.", confidence: 0.9 }],
        userDisplayName: "Jared",
      }
    );

    assert.equal(result.rejected.length, 0);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.text, "Jared lives on land.");
    assert.equal(result.candidates[0]?.validationStatus, "approved");
  });

  it("uses the critic for explicit funny-enough disclosures in direct user context", async () => {
    const result = await validateMemoryCandidates(
      providerWithResponse(
        JSON.stringify({
          results: [
            {
              index: 0,
              decision: "approve",
              text: "Jared lives on land.",
              confidence: 0.86,
              reasonCodes: [],
            },
          ],
        })
      ),
      {
        source: "direct",
        scope: "bot",
        rawContext: "Funny enough, I live on land!",
        candidates: [{ text: "You live on land.", confidence: 0.9 }],
        userDisplayName: "Jared",
      }
    );

    assert.equal(result.rejected.length, 0);
    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.text, "Jared lives on land.");
    assert.equal(result.candidates[0]?.validationStatus, "approved");
  });
});
