import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BotVoicePreset } from "@localai/shared";

import {
  BOT_FRAME_METAL_ALLOY_BY_VOICE,
  BOT_FRAME_METAL_ALLOY_MIX,
  BOT_FRAME_METAL_ALLOY_PRIVATE,
  botFrameMetalAlloyStyle,
} from "./botFrameMetalAlloy.ts";

describe("botFrameMetalAlloyStyle", () => {
  it("maps every communication style to a distinct metal hex", () => {
    const presets = Object.keys(BOT_FRAME_METAL_ALLOY_BY_VOICE) as BotVoicePreset[];
    assert.equal(presets.length, 7);
    const colors = new Set(presets.map((preset) => BOT_FRAME_METAL_ALLOY_BY_VOICE[preset]));
    assert.equal(colors.size, presets.length);
    for (const preset of presets) {
      assert.match(BOT_FRAME_METAL_ALLOY_BY_VOICE[preset], /^#[0-9A-Fa-f]{6}$/);
      assert.deepEqual(botFrameMetalAlloyStyle(preset), {
        "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE[preset],
        "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
      });
    }
  });

  it("falls back to brushed steel for unknown or missing presets", () => {
    assert.deepEqual(botFrameMetalAlloyStyle(null), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
    });
    assert.deepEqual(botFrameMetalAlloyStyle(undefined), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
    });
  });

  it("neutralizes private mode onto brushed steel without dropping the wash", () => {
    assert.deepEqual(botFrameMetalAlloyStyle("playful", { privateMode: true }), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_PRIVATE,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
    });
  });

  it("disables the wash for Prism's rainbow chassis", () => {
    assert.deepEqual(botFrameMetalAlloyStyle("warm", { enabled: false }), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": "0%",
    });
  });
});
