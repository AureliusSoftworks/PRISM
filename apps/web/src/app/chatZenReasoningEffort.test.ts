import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  reasoningEffortForSend,
  resolveChatZenReasoningEffortAvailability,
} from "./chatZenReasoningEffort.ts";

describe("Chat/Zen reasoning effort policy", () => {
  it("keeps local effort visible but disabled until experimental effort is enabled", () => {
    assert.deepEqual(
      resolveChatZenReasoningEffortAvailability({
        provider: "local",
        modelChoice: "llama3.2",
        experimentalAllModelEffortEnabled: false,
      }),
      {
        visible: true,
        enabled: false,
        disabledReason: "Enable experimental simulated effort for local models.",
      }
    );
    assert.equal(
      reasoningEffortForSend("local", "llama3.2", "high", false),
      undefined
    );
  });

  it("enables local simulated effort when the experimental setting is on", () => {
    assert.deepEqual(
      resolveChatZenReasoningEffortAvailability({
        provider: "local",
        modelChoice: "llama3.2",
        experimentalAllModelEffortEnabled: true,
      }),
      { visible: true, enabled: true }
    );
    assert.equal(reasoningEffortForSend("local", "llama3.2", "high", true), "high");
    assert.equal(reasoningEffortForSend("local", undefined, "medium", true), "medium");
  });

  it("enables native effort for supported OpenAI reasoning models", () => {
    for (const model of ["gpt-5", "o3"]) {
      assert.deepEqual(
        resolveChatZenReasoningEffortAvailability({
          provider: "openai",
          modelChoice: model,
          experimentalAllModelEffortEnabled: false,
        }),
        { visible: true, enabled: true },
        model
      );
      assert.equal(reasoningEffortForSend("openai", model, "high", false), "high");
    }
  });

  it("keeps non-capable OpenAI models disabled even when experimental effort is on", () => {
    const availability = resolveChatZenReasoningEffortAvailability({
      provider: "openai",
      modelChoice: "gpt-4o",
      experimentalAllModelEffortEnabled: true,
    });

    assert.equal(availability.visible, true);
    assert.equal(availability.enabled, false);
    assert.equal(reasoningEffortForSend("openai", "gpt-4o", "high", true), undefined);
  });

  it("keeps Anthropic effort disabled even when experimental effort is on", () => {
    const availability = resolveChatZenReasoningEffortAvailability({
      provider: "anthropic",
      modelChoice: "claude-sonnet-4-6",
      experimentalAllModelEffortEnabled: true,
    });

    assert.equal(availability.visible, true);
    assert.equal(availability.enabled, false);
    assert.equal(
      reasoningEffortForSend("anthropic", "claude-sonnet-4-6", "xhigh", true),
      undefined
    );
  });

  it("keeps unresolved online Auto disabled and omits effort from sends", () => {
    const availability = resolveChatZenReasoningEffortAvailability({
      provider: "openai",
      modelChoice: "auto",
      experimentalAllModelEffortEnabled: true,
    });

    assert.equal(availability.visible, true);
    assert.equal(availability.enabled, false);
    assert.equal(reasoningEffortForSend("openai", undefined, "medium", true), undefined);
  });

  it("omits auto and none effort values even for enabled providers", () => {
    assert.equal(reasoningEffortForSend("local", "llama3.2", "auto", true), undefined);
    assert.equal(reasoningEffortForSend("local", "llama3.2", "none", true), undefined);
  });
});
