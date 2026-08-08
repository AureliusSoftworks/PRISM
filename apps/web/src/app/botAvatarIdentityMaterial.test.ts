import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_FRAME_LED_UNLIT_COLOR,
  BOT_FRAME_METAL_ALLOY_BY_VOICE,
  BOT_FRAME_METAL_ALLOY_IDLE_MIX,
  BOT_FRAME_METAL_ALLOY_MIX,
} from "./botFrameMetalAlloy.ts";
import { botAvatarIdentityMaterialStyle } from "./botAvatarIdentityMaterial.ts";

describe("botAvatarIdentityMaterialStyle", () => {
  it("uses the normalized bot color for the shared frame, LEDs, and ink glow", () => {
    assert.deepEqual(botAvatarIdentityMaterialStyle(), {
      "--zen-live-bot-frame-tint-color": "var(--coffee-bot-color)",
      "--bot-face-frame-led-color": "var(--coffee-bot-color)",
      "--zen-live-bot-face-phosphor-ink":
        "color-mix(in srgb, var(--coffee-bot-color) 82%, #ffffff 18%)",
      "--zen-live-bot-face-ink": "var(--coffee-bot-color)",
      "--zen-live-bot-glyph-ink":
        "var(--zen-live-bot-face-phosphor-ink)",
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
      "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
      "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
    });
  });

  it("mixes communication-style metal alloy into the chassis wash", () => {
    assert.deepEqual(
      botAvatarIdentityMaterialStyle({ voicePreset: "warm" }),
      {
        "--zen-live-bot-frame-tint-color": "var(--coffee-bot-color)",
        "--bot-face-frame-led-color": "var(--coffee-bot-color)",
        "--zen-live-bot-face-phosphor-ink":
          "color-mix(in srgb, var(--coffee-bot-color) 82%, #ffffff 18%)",
        "--zen-live-bot-face-ink": "var(--coffee-bot-color)",
        "--zen-live-bot-glyph-ink":
          "var(--zen-live-bot-face-phosphor-ink)",
        "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.warm,
        "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
        "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
        "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
      },
    );
  });

  it("neutralizes every identity-colored material in private mode", () => {
    assert.deepEqual(botAvatarIdentityMaterialStyle(true), {
      "--zen-live-bot-frame-tint-color": "#e8eee8",
      "--bot-face-frame-led-color": "#e8eee8",
      "--zen-live-bot-face-phosphor-ink": "#e8eee8",
      "--zen-live-bot-face-ink": "#e8eee8",
      "--zen-live-bot-glyph-ink":
        "var(--zen-live-bot-face-phosphor-ink)",
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
      "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
      "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
    });
  });

  it("keeps Default Prism's raw chassis free of alloy wash", () => {
    const style = botAvatarIdentityMaterialStyle({
      voicePreset: "playful",
      metalAlloyEnabled: false,
    });
    assert.equal(style["--bot-face-metal-alloy-mix"], "0%");
    assert.equal(style["--bot-face-metal-alloy-idle-mix"], "0%");
    assert.equal(
      style["--bot-face-frame-led-unlit-color"],
      BOT_FRAME_LED_UNLIT_COLOR,
    );
  });
});
