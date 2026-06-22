import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  psychicThoughtDisplayLineForMessage,
  type PsychicThoughtMessageLike,
} from "./psychicThoughtDisplay.ts";

describe("psychicThoughtDisplayLineForMessage", () => {
  it("returns a subtle Psychic line for user messages with a summary", () => {
    assert.deepEqual(
      psychicThoughtDisplayLineForMessage({
        role: "user",
        psychicThought: {
          v: 1,
          summary: "  I checked the constraints first.  ",
          effort: "high",
          provider: "local",
          model: "llama3.2",
          createdAt: "2026-06-22T00:00:00.000Z",
        },
      }),
      {
        label: "Psychic",
        summary: "I checked the constraints first.",
        state: "summary",
        animated: false,
        ariaLabel: "Psychic summary: I checked the constraints first.",
      }
    );
  });

  it("does not render under assistant messages or empty summaries", () => {
    assert.equal(
      psychicThoughtDisplayLineForMessage({
        role: "assistant",
        psychicThought: {
          v: 1,
          summary: "Hidden from assistant rows.",
          effort: "medium",
          provider: "local",
          createdAt: "2026-06-22T00:00:00.000Z",
        },
      }),
      null
    );
    assert.equal(
      psychicThoughtDisplayLineForMessage({
        role: "user",
        psychicThought: {
          v: 1,
          summary: "   ",
          effort: "medium",
          provider: "openai",
          createdAt: "2026-06-22T00:00:00.000Z",
        },
      }),
      null
    );
  });

  it("shows a delayed thinking state for pending user turns", () => {
    assert.equal(
      psychicThoughtDisplayLineForMessage(
        { role: "user" },
        { pendingThinking: true, pendingDelayElapsed: false }
      ),
      null
    );
    assert.deepEqual(
      psychicThoughtDisplayLineForMessage(
        { role: "user" },
        { pendingThinking: true, pendingDelayElapsed: true }
      ),
      {
        label: "Psychic",
        summary: "Considering what matters for this reply...",
        state: "thinking",
        animated: true,
        ariaLabel: "Psychic is considering the reply.",
      }
    );
  });

  it("collapses a pending state into the saved concise summary", () => {
    assert.deepEqual(
      psychicThoughtDisplayLineForMessage(
        {
          role: "user",
          psychicThought: {
            v: 1,
            summary: "I checked the exact format and privacy boundary.",
            effort: "medium",
            provider: "local",
            createdAt: "2026-06-22T00:00:00.000Z",
          },
        },
        { pendingThinking: true, pendingDelayElapsed: true }
      ),
      {
        label: "Psychic",
        summary: "I checked the exact format and privacy boundary.",
        state: "summary",
        animated: false,
        ariaLabel:
          "Psychic summary: I checked the exact format and privacy boundary.",
      }
    );
  });

  it("does not render private scratchpad, draft, audit, or revision artifacts", () => {
    const messageWithPrivateArtifacts: PsychicThoughtMessageLike & {
      scratchpad: string;
      draft: string;
      audit: string;
      revision: string;
    } = {
      role: "user",
      psychicThought: {
        v: 1,
        summary: "I checked the short public summary only.",
        effort: "high",
        provider: "local",
        createdAt: "2026-06-22T00:00:00.000Z",
      },
      scratchpad: "raw scratchpad",
      draft: "private draft",
      audit: "private audit",
      revision: "private revision",
    };
    const displayLine = psychicThoughtDisplayLineForMessage(messageWithPrivateArtifacts);

    assert.equal(displayLine?.summary, "I checked the short public summary only.");
    assert.equal(JSON.stringify(displayLine).includes("raw scratchpad"), false);
    assert.equal(JSON.stringify(displayLine).includes("private draft"), false);
    assert.equal(JSON.stringify(displayLine).includes("private audit"), false);
    assert.equal(JSON.stringify(displayLine).includes("private revision"), false);
  });

  it("softens the pending thinking state for reduced motion", () => {
    assert.deepEqual(
      psychicThoughtDisplayLineForMessage(
        { role: "user" },
        {
          pendingThinking: true,
          pendingDelayElapsed: true,
          reducedMotion: true,
        }
      ),
      {
        label: "Psychic",
        summary: "Considering what matters for this reply...",
        state: "thinking",
        animated: false,
        ariaLabel: "Psychic is considering the reply.",
      }
    );
  });
});
