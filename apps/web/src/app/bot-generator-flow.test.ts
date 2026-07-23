import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const cssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);
const ritualSource = readFileSync(
  new URL("./BotCreationRitual.tsx", import.meta.url),
  "utf8",
);
const ritualCssSource = readFileSync(
  new URL("./BotCreationRitual.module.css", import.meta.url),
  "utf8",
);

function functionSource(name: string, nextName: string): string {
  const start = pageSource.indexOf(`function ${name}`);
  const end = pageSource.indexOf(`function ${nextName}`, start + 1);
  assert.ok(start >= 0, `${name} should exist`);
  assert.ok(end > start, `${name} should end before ${nextName}`);
  return pageSource.slice(start, end);
}

test("new bot creation starts with a bounded, privacy-labelled prompt", () => {
  const openCreator = functionSource("openNewBotCreator", "closeBotGenerator");

  assert.match(openCreator, /setBotGeneratorOpen\(true\)/u);
  assert.doesNotMatch(openCreator, /setBotAvatarCustomizerOpen\(true\)/u);
  assert.match(pageSource, /maxLength=\{BOT_GENERATION_PROMPT_MAX_LENGTH\}/u);
  assert.match(pageSource, /data-tutorial-target="bot-generator-prompt"/u);
  assert.match(pageSource, /Nothing is saved until you choose Create bot\./u);
  assert.match(pageSource, /data-mode=/u);
  assert.match(pageSource, /\? "AUTO"/u);
});

test("generation hydrates the full editable Avatar Studio draft", () => {
  const applyDraft = functionSource(
    "applyGeneratedBotDraft",
    "generateBotDraftFromPrompt",
  );

  for (const setter of [
    "setBotProfile",
    "setNewBotAudioVoiceProfile",
    "setNewBotColor",
    "setNewBotGlyph",
    "setNewBotFaceEyesFont",
    "setNewBotFaceEyeCharacter",
    "setNewBotFaceMouthCharacter",
    "setNewBotFaceThinkingFrames",
    "setNewBotAvatarDetails",
    "setNewBotVoicePreviewLine",
    "setNewBotTemperature",
    "setNewBotMaxTokens",
    "setNewBotPowers",
  ]) {
    assert.match(applyDraft, new RegExp(`${setter}\\(`, "u"));
  }

  assert.match(pageSource, /styles\.botGeneratedBriefCard/u);
  assert.match(pageSource, /Regenerate draft/u);
});

test("Avatar Studio exposes atomic semantic and bounded local field dice", () => {
  const reroll = functionSource(
    "randomizeSemanticBotField",
    "applyGeneratedBotDraft",
  );
  assert.match(reroll, /"\/api\/bots\/generate-field"/u);
  assert.match(reroll, /botFieldGenerationRunRef/u);
  assert.match(reroll, /pushBotAvatarUndoSnapshot\(\)/u);
  assert.match(pageSource, /function BotFieldRandomizerButton/u);
  assert.match(pageSource, /label="temperature"/u);
  assert.match(pageSource, /label=\{`\$\{label\} X coordinate`\}/u);
  assert.match(pageSource, /label=\{`\$\{label\} Y coordinate`\}/u);
  assert.match(pageSource, /BOT_POWER_SIGIL_IDS_V1/u);
});

test("generation produces only a reviewable draft and keeps manual creation", () => {
  const generateDraft = functionSource(
    "generateBotDraftFromPrompt",
    "openFreshBotCustomizer",
  );
  const manualDraft = functionSource("openManualBotDraft", "applyGeneratedBotDraft");

  assert.match(generateDraft, /"\/api\/bots\/generate-draft"/u);
  assert.match(generateDraft, /generateBotThinkingSfxProfile\(/u);
  assert.match(generateDraft, /audioVoiceProfile: await/u);
  assert.match(generateDraft, /setBotAvatarCustomizerOpen\(true\)/u);
  assert.doesNotMatch(generateDraft, /createBot\(/u);
  assert.match(generateDraft, /replaces the unsaved Avatar Studio draft/u);
  assert.match(manualDraft, /setBotAvatarCustomizerOpen\(true\)/u);
  assert.match(pageSource, /Start manually/u);
  assert.match(pageSource, /voicePreviewLine: newBotVoicePreviewLine \|\| null/u);
});

test("closing regeneration preserves the current unsaved draft", () => {
  const closeGenerator = functionSource(
    "closeBotGenerator",
    "openManualBotDraft",
  );

  assert.match(closeGenerator, /if \(!botGeneratorHasGeneratedDraft\)/u);
  assert.match(closeGenerator, /resetBotForm\(\)/u);
  assert.match(pageSource, /aria-label="Close bot generator"/u);
  assert.match(pageSource, /event\.key !== "Escape"/u);
  assert.match(pageSource, /Keep current draft/u);
});

test("the generator overlays Avatar Studio and has a responsive review surface", () => {
  assert.match(
    cssSource,
    /\.botGeneratorBackdrop\s*\{[\s\S]*?z-index:\s*4200/u,
  );
  assert.match(cssSource, /\.botGeneratorDialog\s*\{/u);
  assert.match(cssSource, /\.botGeneratedBriefCard\s+p\s*\{/u);
  assert.match(cssSource, /@media \(max-width: 640px\)/u);
});

test("prompt generation becomes an accessible PRISM assembly ritual", () => {
  const generateDraft = functionSource(
    "generateBotDraftFromPrompt",
    "openFreshBotCustomizer",
  );

  assert.match(pageSource, /botGeneratorBusy \? \(\s*<BotCreationRitual/u);
  assert.match(pageSource, /completedDraft=\{botGeneratorCompletedDraft\}/u);
  assert.match(generateDraft, /setBotGeneratorCompletedDraft\(generatedDraft\)/u);
  assert.match(generateDraft, /prefers-reduced-motion: reduce/u);
  assert.match(ritualSource, /role="status"/u);
  assert.match(ritualSource, /aria-live="polite"/u);
  assert.match(ritualSource, /aria-busy=\{!completed\}/u);
  assert.match(ritualSource, /Nothing is saved until you choose Create bot\./u);
  assert.doesNotMatch(ritualSource, /\bpercent(?:age)?\b|% complete/iu);
});

test("the creation ritual refracts prompt words and reveals the generated identity", () => {
  assert.match(ritualSource, /creationWords\(prompt\)/u);
  assert.match(ritualSource, /completedDraft\.name/u);
  assert.match(ritualSource, /completedDraft\?\.color/u);
  assert.match(ritualSource, /completedDraft\?\.face\.eyeCharacter/u);
  assert.match(ritualSource, /completedDraft\?\.face\.mouthCharacter/u);
  assert.match(ritualCssSource, /\.prism\s*\{/u);
  assert.match(ritualCssSource, /\.colorBeam\[data-color="cyan"\]/u);
  assert.match(ritualCssSource, /\.botForm\s*\{/u);
  assert.match(ritualCssSource, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(ritualCssSource, /@media \(max-width: 480px\)/u);
});
