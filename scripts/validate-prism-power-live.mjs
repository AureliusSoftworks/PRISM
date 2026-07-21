#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { composeBotSystemPrompt } from "../apps/api/src/bots.ts";
import {
  LocalOllamaProvider,
  OPENAI_DEFAULT_MODEL,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const bundleArgument = flagValue("--bundle");
const input = flagValue("--input")?.trim();
const providerName = flagValue("--provider")?.trim().toLowerCase() || "local";
const model = flagValue("--model")?.trim() ||
  (providerName === "openai" ? OPENAI_DEFAULT_MODEL : "llama3.2");
const mode = flagValue("--mode")?.trim().toLowerCase() || "chat";

if (
  !bundleArgument ||
  !input ||
  !["chat", "zen"].includes(mode) ||
  !["local", "openai"].includes(providerName)
) {
  throw new Error(
    "Usage: validate-prism-power-live.mjs --bundle PATH --input TEXT [--mode chat|zen] [--provider local|openai] [--model MODEL]",
  );
}
if (providerName === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}

const bundlePath = resolve(bundleArgument);
const { botJson } = parsePrismBotArchive(readFileSync(bundlePath));
const bot = botJson.bot;
const systemPrompt = composeBotSystemPrompt(
  bot.name,
  botJson.systemPrompt,
  bot.flirtEnabled,
  bot.powers,
);
if (!systemPrompt) {
  throw new Error("The bot archive did not produce a system prompt.");
}

const provider = providerName === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : new LocalOllamaProvider();
const response = await provider.generateResponse(
  [
    { role: "system", content: systemPrompt },
    { role: "user", content: input },
  ],
  {
    model,
    temperature: 0.7,
    maxTokens: 220,
  },
);

console.log(JSON.stringify({
  provider: provider.name,
  model,
  mode,
  bot: bot.name,
  input,
  response,
}, null, 2));
