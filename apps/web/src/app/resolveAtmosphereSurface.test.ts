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

  it("uses the conversation Atmosphere in transcript Chat", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: false,
        focusedBotId: "bot-1",
        prismAtmosphereEnabled: true,
        prismAtmosphereImageId: "prism-1",
      }),
      "zenConversation",
    );
  });

  it("uses the same conversation Atmosphere in immersive Zen", () => {
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

  it("keeps conversation Atmosphere routing independent from Home wallpaper state", () => {
    assert.equal(
      resolveAtmosphereSurface({
        presentation: "chat",
        prismSession: false,
        focusedBotId: "bot-1",
        prismAtmosphereEnabled: false,
        prismAtmosphereImageId: "prism-1",
      }),
      "zenConversation",
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
