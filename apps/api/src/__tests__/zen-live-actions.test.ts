import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import {
  generateZenLiveActionReaction,
  parseZenLiveActionReactionResponse,
} from "../zen-live-actions.ts";
import type { ZenLiveActionReactionRequest } from "@localai/shared";

function request(overrides: Partial<ZenLiveActionReactionRequest> = {}): ZenLiveActionReactionRequest {
  return {
    source: "draft_action",
    activeBotId: "vader",
    userAction: "bows head",
    clientSequenceId: "seq-1",
    ...overrides,
  };
}

describe("parseZenLiveActionReactionResponse", () => {
  it("accepts persona-appropriate actions and normalizes mood hints", () => {
    const response = parseZenLiveActionReactionResponse(
      JSON.stringify({
        kind: "show_action",
        botAction: "*motions you to rise*",
        moodHint: "commanding",
        confidence: 0.71,
      }),
      request()
    );

    assert.equal(response.kind, "show_action");
    assert.equal(response.botAction, "motions you to rise");
    assert.equal(response.moodHint, "stern");
    assert.equal(response.botId, "vader");
    assert.equal(response.clientSequenceId, "seq-1");
  });

  it("rejects goofy out-of-persona actions", () => {
    const response = parseZenLiveActionReactionResponse(
      JSON.stringify({
        kind: "show_action",
        botAction: "twerks like never before",
        moodHint: "amused",
        confidence: 0.99,
      }),
      request()
    );

    assert.equal(response.kind, "silent");
    assert.equal(response.botAction, undefined);
  });

  it("strips quoted dialogue from visible action text", () => {
    const response = parseZenLiveActionReactionResponse(
      JSON.stringify({
        kind: "show_action",
        botAction:
          'Smiles warmly, gestures to the dancing, and sings softly "You are a joy to see"',
        moodHint: "warm",
        confidence: 0.77,
      }),
      request()
    );

    assert.equal(response.kind, "show_action");
    assert.equal(response.botAction, "Smiles warmly, gestures to the dancing");
  });

  it("strips dangling speech bridge words from visible action text", () => {
    const response = parseZenLiveActionReactionResponse(
      JSON.stringify({
        kind: "show_action",
        botAction: "offers a warm smile and a gentle wave back, saying",
        moodHint: "warm",
        confidence: 0.77,
      }),
      request()
    );

    assert.equal(response.kind, "show_action");
    assert.equal(response.botAction, "offers a warm smile and a gentle wave back");
  });

  it("keeps fuller stage directions for the action plate", () => {
    const action =
      "rests one hand over his heart, then offers a small, careful nod toward your courage";
    const response = parseZenLiveActionReactionResponse(
      JSON.stringify({
        kind: "show_action",
        botAction: action,
        moodHint: "warm",
        confidence: 0.77,
      }),
      request()
    );

    assert.equal(response.kind, "show_action");
    assert.equal(response.botAction, action);
  });

  it("requires stricter confidence for interrupt candidates", () => {
    const downgraded = parseZenLiveActionReactionResponse(
      JSON.stringify({
        kind: "interrupt_candidate",
        botAction: "rises from the chair",
        moodHint: "stern",
        confidence: 0.82,
      }),
      request({ userAction: "begins breakdancing" })
    );
    const accepted = parseZenLiveActionReactionResponse(
      JSON.stringify({
        kind: "interrupt_candidate",
        botAction: "rises from the chair",
        moodHint: "stern",
        confidence: 0.93,
        interruptReason: "The action violates the persona's formal presence.",
      }),
      request({ userAction: "begins breakdancing" })
    );

    assert.equal(downgraded.kind, "show_action");
    assert.equal(accepted.kind, "interrupt_candidate");
    assert.equal(accepted.interruptReason, "The action violates the persona's formal presence");
  });
});

describe("generateZenLiveActionReaction", () => {
  it("uses a local auxiliary provider with JSON-only generation options", async () => {
    let capturedMessages: ProviderMessage[] = [];
    let capturedOptions: GenerateOptions | undefined;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages, options) {
        capturedMessages = messages;
        capturedOptions = options;
        return JSON.stringify({
          kind: "show_action",
          botAction: "waves back warmly",
          moodHint: "warm",
          confidence: 0.66,
        });
      },
      async embedText() {
        return [];
      },
    };

    const response = await generateZenLiveActionReaction({
      provider,
      request: request({ activeBotId: "santa", userAction: "waves" }),
      personaName: "Santa",
      personaSystemPrompt: "You are Santa Claus.",
    });

    assert.equal(provider.name, "local");
    assert.equal(capturedOptions?.jsonMode, true);
    assert.equal(response.kind, "show_action");
    assert.equal(response.botAction, "waves back warmly");
    assert.ok(capturedMessages.some((message) => message.content.includes("Latest visible user action")));
  });
});
