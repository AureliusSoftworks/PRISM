import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  BOT_VOICE_PRESET_LABELS,
  type BotVoicePreset,
} from "@localai/shared";

import {
  BOT_FRAME_LED_UNLIT_COLOR,
  BOT_FRAME_METAL_ALLOY_BY_VOICE,
  BOT_FRAME_METAL_ALLOY_IDLE_MIX,
  BOT_FRAME_METAL_ALLOY_MIX,
  BOT_FRAME_METAL_ALLOY_PRIVATE,
  botFrameIdentityPaintColor,
  botFrameLedPaintColor,
  botFrameMetalAlloyColor,
  botFrameMetalAlloyStyle,
} from "./botFrameMetalAlloy.ts";

describe("botFrameMetalAlloyStyle", () => {
  it("maps the seven named communication styles to distinct low-chroma alloys", () => {
    const presets = Object.keys(BOT_FRAME_METAL_ALLOY_BY_VOICE) as BotVoicePreset[];
    assert.deepEqual(presets, [
      "neutral",
      "warm",
      "concise",
      "playful",
      "formal",
      "reflective",
      "direct",
    ] satisfies BotVoicePreset[]);
    assert.deepEqual(
      presets.map((preset) => BOT_VOICE_PRESET_LABELS[preset]),
      [
        "Balanced - clear and adaptable",
        "Warm - friendly and reassuring",
        "Concise - short answers, lean into clarity",
        "Playful - light wit when it fits",
        "Formal - structured and precise",
        "Reflective - thoughtful and probing",
        "Direct - frank and to the point",
      ],
    );
    const colors = new Set(presets.map((preset) => BOT_FRAME_METAL_ALLOY_BY_VOICE[preset]));
    assert.equal(colors.size, presets.length);
    for (const preset of presets) {
      assert.match(BOT_FRAME_METAL_ALLOY_BY_VOICE[preset], /^#[0-9A-Fa-f]{6}$/);
      const rgb = BOT_FRAME_METAL_ALLOY_BY_VOICE[preset]
        .slice(1)
        .match(/.{2}/g)!
        .map((channel) => Number.parseInt(channel, 16));
      const max = Math.max(...rgb);
      const min = Math.min(...rgb);
      const lightnessSum = max + min;
      const saturation = max === min
        ? 0
        : (max - min) / Math.min(lightnessSum, 510 - lightnessSum);
      assert.ok(
        saturation <= 0.24,
        `${preset} alloy should remain below 24% HSL saturation`,
      );
      assert.equal(botFrameMetalAlloyColor(preset), BOT_FRAME_METAL_ALLOY_BY_VOICE[preset]);
      assert.deepEqual(botFrameMetalAlloyStyle(preset), {
        "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE[preset],
        "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
        "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
        "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
      });
    }
  });

  it("falls back to brushed steel for unknown or missing presets", () => {
    assert.deepEqual(botFrameMetalAlloyStyle(null), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
      "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
      "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
    });
    assert.deepEqual(botFrameMetalAlloyStyle(undefined), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
      "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
      "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
    });
  });

  it("neutralizes private mode onto brushed steel without dropping the wash", () => {
    assert.deepEqual(botFrameMetalAlloyStyle("playful", { privateMode: true }), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_PRIVATE,
      "--bot-face-metal-alloy-mix": BOT_FRAME_METAL_ALLOY_MIX,
      "--bot-face-metal-alloy-idle-mix": BOT_FRAME_METAL_ALLOY_IDLE_MIX,
      "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
    });
  });

  it("disables the wash for Default Prism's raw chassis", () => {
    assert.deepEqual(botFrameMetalAlloyStyle("warm", { enabled: false }), {
      "--bot-face-metal-alloy-color": BOT_FRAME_METAL_ALLOY_BY_VOICE.neutral,
      "--bot-face-metal-alloy-mix": "0%",
      "--bot-face-metal-alloy-idle-mix": "0%",
      "--bot-face-frame-led-unlit-color": BOT_FRAME_LED_UNLIT_COLOR,
    });
  });
});

describe("botFrameLedPaintColor", () => {
  it("paints silent LEDs dark gray and restores accent while talking", () => {
    assert.equal(BOT_FRAME_LED_UNLIT_COLOR, "#3A3F46");
    assert.equal(
      botFrameLedPaintColor({
        isTalking: false,
        accentColor: "#42d9ff",
      }),
      BOT_FRAME_LED_UNLIT_COLOR,
    );
    assert.equal(
      botFrameLedPaintColor({
        isTalking: true,
        accentColor: "#42d9ff",
      }),
      "#42d9ff",
    );
  });

  it("falls back to unlit gray when talking without an accent", () => {
    assert.equal(
      botFrameLedPaintColor({
        isTalking: true,
        accentColor: "   ",
      }),
      BOT_FRAME_LED_UNLIT_COLOR,
    );
  });
});

describe("botFrameIdentityPaintColor", () => {
  it("paints silent bots in alloy and restores accent while talking", () => {
    assert.equal(
      botFrameIdentityPaintColor({
        isTalking: false,
        accentColor: "#42d9ff",
        voicePreset: "warm",
      }),
      BOT_FRAME_METAL_ALLOY_BY_VOICE.warm,
    );
    assert.equal(
      botFrameIdentityPaintColor({
        isTalking: true,
        accentColor: "#42d9ff",
        voicePreset: "warm",
      }),
      "#42d9ff",
    );
    assert.equal(BOT_FRAME_METAL_ALLOY_IDLE_MIX, "42%");
  });

  it("keeps explicit accent paint when alloy is disabled", () => {
    assert.equal(
      botFrameIdentityPaintColor({
        isTalking: false,
        accentColor: "#42d9ff",
        voicePreset: "warm",
        metalAlloyEnabled: false,
      }),
      "#42d9ff",
    );
  });
});
