import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  defaultEphemeralChatProviderPreferences,
  normalizeEphemeralChatProviderPreferences,
  resolveEphemeralChatProvider,
} from "./ephemeralChat.ts";

describe("ephemeral chat provider preferences", () => {
  it("defaults every mode to the global provider toggle", () => {
    assert.deepEqual(
      normalizeEphemeralChatProviderPreferences(null),
      defaultEphemeralChatProviderPreferences(),
    );
  });

  it("keeps valid per-mode overrides and repairs invalid saved values", () => {
    assert.deepEqual(
      normalizeEphemeralChatProviderPreferences(
        JSON.stringify({ botcast: "online", coffee: "local", zen: "future" }),
      ),
      {
        chat: "global",
        zen: "global",
        coffee: "local",
        botcast: "online",
        slate: "global",
      },
    );
  });

  it("resolves global, local, and online lanes", () => {
    assert.equal(
      resolveEphemeralChatProvider({
        preference: "global",
        globalProvider: "anthropic",
        onlineProvider: "openai",
      }),
      "anthropic",
    );
    assert.equal(
      resolveEphemeralChatProvider({
        preference: "local",
        globalProvider: "openai",
        onlineProvider: "anthropic",
      }),
      "local",
    );
    assert.equal(
      resolveEphemeralChatProvider({
        preference: "online",
        globalProvider: "openai",
        onlineProvider: "anthropic",
      }),
      "anthropic",
    );
    assert.equal(
      resolveEphemeralChatProvider({
        preference: "online",
        globalProvider: "local",
        onlineProvider: "anthropic",
      }),
      "local",
    );
  });
});
