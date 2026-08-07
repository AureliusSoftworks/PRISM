import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAtmosphereSurface } from "./resolveAtmosphereSurface.ts";

describe("resolveAtmosphereSurface", () => {
  it("uses Prism Home wallpaper for new-session / all-bots in chat presentation", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: true,
        focusedBotId: null,
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: "prism-1",
      }),
      "prism",
    );
  });

  it("reuses the shared Home wallpaper when a bot is focused", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: false,
        focusedBotId: "bot-1",
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: "prism-1",
      }),
      "homeBot",
    );
  });

  it("never mounts Home wallpaper during expanded Zen", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "zen",
        prismSession: false,
        focusedBotId: "bot-1",
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: "prism-1",
      }),
      "zenConversation",
    );
  });

  it("returns none when Home atmosphere is disabled or missing", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: false,
        focusedBotId: "bot-1",
        prismAtmosphereEnabled: false,
        prismAtmosphereImageId: "prism-1",
      }),
      "none",
    );
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: true,
        focusedBotId: null,
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: null,
      }),
      "none",
    );
  });
});
