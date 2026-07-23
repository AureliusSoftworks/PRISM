import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { hexToHsl } from "@localai/shared";

import {
  BOT_CHAT_PERSONA_FILL_FULL_AT_MESSAGES,
  BOT_CHAT_PERSONA_FILL_START_WHISPER,
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
  });

  it("eases persona fill from a whisper toward full over the conversation", () => {
    assert.equal(botChatPersonaFillProgress(0), 0);
    assert.ok(
      botChatPersonaFillProgress(2) >= BOT_CHAT_PERSONA_FILL_START_WHISPER,
    );
    assert.ok(botChatPersonaFillProgress(2) < 0.2);
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

    assert.equal(empty, 0);
    assert.ok(early < full * 0.35);
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
      /buildBotChatGradientVariables\(\s*activeBot\.id,\s*accent,\s*resolvedTheme,\s*personaFillProgress,?\s*\)/,
    );
    assert.match(pageSource, /botChatPersonaFillProgress\(/);
    assert.match(pageSource, /data-bot-gradient-active=/);
    assert.match(
      cssSource,
      /\[data-bot-gradient-active="true"\][\s\S]*background:\s*var\(--bot-chat-gradient\)/,
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
      /const zenPersonaFallbackAtmosphereVisible =[\s\S]{0,260}!selectedBotGradientActive/,
    );
  });

  it("clears the focused Chat persona when open canvas returns to all bots", () => {
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

    assert.match(handlerSource, /zenPersonaBotId !== null/);
    assert.match(handlerSource, /resetEmptyStateBotSelection\(\)/);
  });
});
