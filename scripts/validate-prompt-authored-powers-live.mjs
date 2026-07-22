#!/usr/bin/env node

import assert from "node:assert/strict";
import { compileBotPowers } from "../apps/api/src/bot-powers.ts";
import {
  generateBotDraft,
  generateBotField,
} from "../apps/api/src/bot-generator.ts";
import { LocalOllamaProvider } from "../apps/api/src/providers.ts";

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const model = flagValue("--model")?.trim() || "llama3.2:latest";
const provider = new LocalOllamaProvider();
const targets = [
  { id: "plankton-live", name: "Plankton" },
  { id: "lincoln-live", name: "Abraham Lincoln" },
];
const authoredPrompt =
  "He's invisible, and he can only talk to Plankton. He, however, can't be seen by Plankton; he can only be seen by everyone else.";

const compiled = await compileBotPowers({
  provider,
  botName: "Ryuk",
  targetBots: targets,
  powers: [{
    version: 1,
    id: "prompt-authored-live",
    authoringMode: "prompt",
    name: "",
    intent: authoredPrompt,
    enabled: true,
    compileStatus: "draft",
    compiled: null,
  }],
});
const compiledPower = compiled.powers[0];
assert.equal(compiledPower?.compileStatus, "ready");
assert.ok(compiledPower?.name);
assert.ok(compiledPower?.sigil);
assert.deepEqual(compiledPower?.compiled?.effects, [
  {
    type: "awareness",
    allowed: [{ kind: "all" }],
    excluded: [{ kind: "bot", name: "Plankton", botId: "plankton-live" }],
  },
  {
    type: "speech_audience",
    allowed: [{ kind: "bot", name: "Plankton", botId: "plankton-live" }],
  },
  { type: "avatar_visibility", mode: "translucent" },
]);

const generated = await generateBotDraft({
  prompt:
    "Create an eerie, dryly funny supernatural observer named Ryuk. Persistent Power: he is invisible; only Plankton can hear him; everyone except Plankton can see him. Treat this as a Power, not a personality quirk.",
  provider,
  providerName: "local",
  model,
  responseMode: "local",
  voiceCatalog: [],
});
assert.equal(generated.providerNameUsed, "local");
assert.equal(generated.draft.powers.length, 1);
assert.equal(generated.draft.powers[0]?.authoringMode, "prompt");

const trustedCompilation = await compileBotPowers({
  provider,
  botName: generated.draft.name,
  targetBots: targets,
  powers: generated.draft.powers,
});
assert.equal(trustedCompilation.powers[0]?.compileStatus, "ready");

const currentAppearance = generated.draft.profile.appearance.description;
const field = await generateBotField({
  fieldKey: "profile.appearance.description",
  currentValue: currentAppearance,
  context: {
    name: generated.draft.name,
    profile: generated.draft.profile,
    power: generated.draft.powers[0]?.intent,
  },
  provider,
  providerName: "local",
  model,
  responseMode: "local",
});
assert.equal(field.providerNameUsed, "local");
assert.notEqual(field.value, currentAppearance);

console.log(JSON.stringify({
  pass: true,
  provider: provider.name,
  model,
  responseMode: "LOCAL",
  compoundPowerCompiled: true,
  uniqueTargetBoundToId: true,
  masterDraftPowerCount: generated.draft.powers.length,
  trustedMasterPowerCompiled: true,
  semanticFieldChanged: true,
}, null, 2));
