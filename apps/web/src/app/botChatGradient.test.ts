import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { hexToHsl } from "@localai/shared";

import {
  BOT_CHAT_PERSONA_FILL_EMPTY_ROOM,
  BOT_CHAT_PERSONA_FILL_FULL_AT_MESSAGES,
  botChatGradientPalette,
  botChatPersonaFillProgress,
  buildBotChatGradient,
  buildBotChatGradientVariables,
} from "./botChatGradient.ts";

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

function maxAlphaInGradient(gradient: string): number {
  const alphas = [...gradient.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map(
    (match) => Number(match[1]),
  );
  assert.ok(alphas.length > 0);
  return Math.max(...alphas);
}

describe("selected bot chat gradient", () => {
  it("builds a deterministic code-only gradient for the same bot", () => {
    const first = buildBotChatGradient("bot:echo", "#e92ca6", "dark");
    const repeated = buildBotChatGradient("bot:echo", "#e92ca6", "dark");

    assert.equal(first, repeated);
    assert.match(first, /radial-gradient/);
    assert.equal(first.match(/radial-gradient/g)?.length, 4);
    assert.equal(first.match(/linear-gradient/g)?.length, 1);
    assert.doesNotMatch(first, /url\(|data:|https?:/i);
  });

  it("keeps bot color translucent over an opaque neutral PRISM base", () => {
    const gradient = buildBotChatGradient("bot:echo", "#e92ca6", "dark");
    const alphas = [...gradient.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map(
      (match) => Number(match[1]),
    );

    assert.ok(alphas.length > 0);
    assert.ok(Math.max(...alphas) <= 0.2);
    assert.ok(alphas.includes(0));
    assert.match(
      gradient,
      /linear-gradient\(148deg, var\(--bg-deep\)[^)]*var\(--bg\)/,
    );
  });

  it("keeps every generated stop in the selected bot's color family", () => {
    const palette = botChatGradientPalette(
      "#e92ca6",
      "dark",
      "bot-chat-gradient:bot:echo:#e92ca6:dark",
    );
    const baseHue = hexToHsl(palette.accent).h;

    for (const color of [
      palette.bloom,
      palette.body,
      palette.secondary,
      palette.deep,
    ]) {
      assert.ok(hueDistance(baseHue, hexToHsl(color).h) <= 12.5);
    }
  });

  it("varies geometry by bot and tones by theme", () => {
    const darkA = buildBotChatGradient("bot:a", "#2fbfae", "dark");
    const darkB = buildBotChatGradient("bot:b", "#2fbfae", "dark");
    const lightA = buildBotChatGradient("bot:a", "#2fbfae", "light");

    assert.notEqual(darkA, darkB);
    assert.notEqual(darkA, lightA);
  });

  it("returns the CSS variables consumed by the chat canvas", () => {
    const variables = buildBotChatGradientVariables(
      "bot:calvin",
      "#42c8b5",
      "light",
      0.42,
    );

    assert.match(variables["--bot-chat-gradient"], /^radial-gradient/);
    assert.equal(variables["--bot-chat-persona-fill"], "0.420");
    assert.equal(variables["--bot-primary-color"], "#40c0ae");
    assert.equal(variables["--bot-color"], variables["--bot-primary-color"]);
    assert.match(variables["--bot-accent-color"], /^#[0-9a-f]{6}$/u);
  });

  it("keeps primary light stronger than an explicit warm/cool accent", () => {
    const light = buildBotChatGradient("bot:warm-cool", "#ff5500", "light", {
      accentColor: "#00aaff",
    });
    const dark = buildBotChatGradient("bot:warm-cool", "#ff5500", "dark", {
      accentColor: "#00aaff",
    });
    assert.match(light, /rgba\([^)]*, 0\.120\)/u);
    assert.match(light, /rgba\(0, 170, 255, 0\.075\)/u);
    assert.match(dark, /rgba\([^)]*, 0\.200\)/u);
    assert.match(dark, /rgba\(0, 170, 255, 0\.120\)/u);
  });

  it("eases persona fill from an empty-room wash toward full over the conversation", () => {
    assert.equal(
      botChatPersonaFillProgress(0),
      BOT_CHAT_PERSONA_FILL_EMPTY_ROOM,
    );
    assert.ok(
      botChatPersonaFillProgress(2) >= BOT_CHAT_PERSONA_FILL_EMPTY_ROOM,
    );
    assert.ok(botChatPersonaFillProgress(2) < 0.55);
    assert.ok(botChatPersonaFillProgress(8) > botChatPersonaFillProgress(2));
    assert.ok(botChatPersonaFillProgress(14) > botChatPersonaFillProgress(8));
    assert.equal(
      botChatPersonaFillProgress(BOT_CHAT_PERSONA_FILL_FULL_AT_MESSAGES),
      1,
    );
    assert.equal(
      botChatPersonaFillProgress(BOT_CHAT_PERSONA_FILL_FULL_AT_MESSAGES + 8),
      1,
    );
  });

  it("scales translucent persona color by fill progress without solid fill", () => {
    const full = maxAlphaInGradient(
      buildBotChatGradient("bot:echo", "#e92ca6", "light", { fillProgress: 1 }),
    );
    const early = maxAlphaInGradient(
      buildBotChatGradient("bot:echo", "#e92ca6", "light", {
        fillProgress: botChatPersonaFillProgress(2),
      }),
    );
    const empty = maxAlphaInGradient(
      buildBotChatGradient("bot:echo", "#e92ca6", "light", { fillProgress: 0 }),
    );
    const emptyRoom = maxAlphaInGradient(
      buildBotChatGradient("bot:echo", "#e92ca6", "light", {
        fillProgress: botChatPersonaFillProgress(0),
      }),
    );

    assert.equal(empty, 0);
    assert.ok(emptyRoom > 0);
    assert.ok(early >= emptyRoom);
    assert.ok(early < full);
    assert.ok(full <= 0.12);
  });

  it("wires the generated variable only into selected-bot chat canvases", () => {
    const pageSource = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );
    const cssSource = readFileSync(
      new URL("./page.module.css", import.meta.url),
      "utf8",
    );

    assert.match(
      pageSource,
      /buildBotChatGradientVariables\(\s*activeBot\.id,\s*accent,\s*resolvedTheme,\s*personaFillProgress,\s*activeBot\.accentColor,?\s*\)/,
    );
    assert.match(pageSource, /botChatPersonaFillProgress\(/);
    assert.match(pageSource, /data-bot-gradient-active=/);
    assert.match(
      cssSource,
      /\[data-bot-gradient-active="true"\][\s\S]*background:\s*var\(--bot-chat-gradient\)/,
    );
    assert.match(
      pageSource,
      /Blank \(near-empty\) persona gradients still count as active/u,
    );
    assert.match(
      pageSource,
      /const selectedBotGradientActive = Boolean\([\s\S]{0,160}!appWidePrivateMode/,
    );
    assert.match(
      pageSource,
      /const zenPersonaContinuityWashStyle[\s\S]{0,420}selectedBotGradientActive[\s\S]{0,220}return undefined/,
    );
    assert.match(
      pageSource,
      /const zenPersonaFallbackAtmosphereVisible =[\s\S]{0,360}!zenGeneratedAtmosphereVisible/,
    );
    // Zen API keeps bot_id null; wallpaper eligibility must still see the
    // hub persona so stock Prism mist presets do not cover bot rooms.
    assert.match(
      pageSource,
      /const zenFallbackWallpaperBotId =[\s\S]{0,220}conversationEffectiveBotId\(detail\)/,
    );
    assert.match(
      pageSource,
      /if \(c\.mode === "zen"\) return c\.hubBotId \?\? c\.botId \?\? null;/,
    );
  });

  it("keeps canvas clicks inside the current navbar group", () => {
    const pageSource = readFileSync(
      new URL("./page.tsx", import.meta.url),
      "utf8",
    );
    const handlerStart = pageSource.indexOf(
      "function handleEmptyStateBackgroundClick",
    );
    const handlerEnd = pageSource.indexOf(
      "const openEmptyStateBotSearch",
      handlerStart,
    );
    const handlerSource = pageSource.slice(handlerStart, handlerEnd);
    const jumpStart = pageSource.indexOf("function jumpCanvasToCurrentGroupRoot");
    const jumpEnd = pageSource.indexOf(
      "function handleSandboxHeaderWordmarkClick",
      jumpStart,
    );
    const jumpSource = pageSource.slice(jumpStart, jumpEnd);

    assert.match(
      handlerSource,
      /if \(view === "chat"\) \{[\s\S]{0,500}chatPresentation === "zen"[\s\S]{0,900}jumpCanvasToCurrentGroupRoot\(\)/,
    );
    assert.match(
      pageSource,
      /BOT_CANVAS_BACKGROUND_INTERACTIVE_SELECTOR[\s\S]{0,360}\[data-starter-compose-surface='true'\][\s\S]{0,120}\[data-zen-title-with-hero='true'\][\s\S]{0,120}\[data-tutorial-target='zen-hue-cable'\]/,
    );
    assert.doesNotMatch(
      handlerSource,
      /canvasBackgroundShouldZoomOutFocusedBot|relationshipDepthReturnDepth/,
    );
    assert.doesNotMatch(handlerSource, /returnFromRelationshipDepth\(/);
    assert.match(jumpSource, /resetEmptyStateBotSelection\(\)/);
    assert.match(jumpSource, /performShowAllBotsView\(null,[\s\S]{0,160}preserveGroupFilter: true/);
    assert.doesNotMatch(
      handlerSource,
      /botLibraryGroupFilterId !== BOT_LIBRARY_GROUP_FILTER_ALL/,
    );
    assert.match(
      pageSource,
      /function performShowAllBotsView\([\s\S]{0,900}setBotLibraryGroupFilterId\(BOT_LIBRARY_GROUP_FILTER_ALL\)[\s\S]{0,260}ZEN_HUE_DIRECTORY_ROOT/,
    );
  });
});
