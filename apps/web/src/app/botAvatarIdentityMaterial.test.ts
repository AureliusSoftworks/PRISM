import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { botAvatarIdentityMaterialStyle } from "./botAvatarIdentityMaterial.ts";

describe("botAvatarIdentityMaterialStyle", () => {
  it("uses the normalized bot color for the shared frame, LEDs, and ink glow", () => {
    assert.deepEqual(botAvatarIdentityMaterialStyle(), {
      "--zen-live-bot-frame-tint-color": "var(--coffee-bot-color)",
      "--bot-face-frame-led-color": "var(--coffee-bot-color)",
      "--zen-live-bot-face-phosphor-ink": "#ffffff",
      "--zen-live-bot-face-ink": "var(--coffee-bot-color)",
      "--zen-live-bot-glyph-ink":
        "var(--zen-live-bot-face-phosphor-ink)",
    });
  });

  it("neutralizes every identity-colored material in private mode", () => {
    assert.deepEqual(botAvatarIdentityMaterialStyle(true), {
      "--zen-live-bot-frame-tint-color": "#e8eee8",
      "--bot-face-frame-led-color": "#e8eee8",
      "--zen-live-bot-face-phosphor-ink": "#e8eee8",
      "--zen-live-bot-face-ink": "#e8eee8",
      "--zen-live-bot-glyph-ink":
        "var(--zen-live-bot-face-phosphor-ink)",
    });
  });
});
