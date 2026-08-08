import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAtmosphereSurface } from "./resolveAtmosphereSurface.ts";

describe("resolveAtmosphereSurface", () => {
  it("keeps collapsed Chat / all-bots home on the gradient plate", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: true,
        focusedBotId: null,
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: "prism-1",
      }),
      "none",
    );
  });

  it("keeps collapsed Chat focused-bot home on the gradient for every bot", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: false,
        focusedBotId: "bot-1",
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: "prism-1",
      }),
      "none",
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

  it("keeps immersive Zen all-bots home on the gradient plate", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "zen",
        prismSession: true,
        focusedBotId: null,
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: "prism-1",
      }),
      "none",
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
