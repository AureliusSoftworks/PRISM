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
  assert.match(pageSource, /data-tutorial-target="bot-generator-routing"/u);
  assert.match(pageSource, /Navbar routing/u);
  assert.match(pageSource, /Auto model/u);
  assert.match(pageSource, /automatic effort/u);
  assert.match(pageSource, /next draft uses those live account settings/u);
  assert.doesNotMatch(pageSource, /ariaLabel="Model for this bot draft"/u);
  assert.match(pageSource, /Nothing is saved until you choose Create bot\./u);
  assert.match(pageSource, /data-mode=/u);
  assert.match(pageSource, /\? "AUTO"/u);
});

test("only a blank new-bot draft has extinguished identity lamps", () => {
  assert.match(
    pageSource,
    /const createDraftIdentityAttributed =\s*createDraftHasChanges \|\|\s*botGeneratorPrompt\.trim\(\)\.length > 0 \|\|\s*botGeneratorHasGeneratedDraft/u,
  );
  assert.match(
    pageSource,
    /const avatarStudioLightMode: "alive" \| "off" =\s*botPanelCreateMode && !editingBotId && !editingDefaultBot[\s\S]{0,180}\? "alive"\s*:\s*"off"[\s\S]{0,80}: "alive"/u,
  );
  assert.equal(
    pageSource.match(/avatarLightMode=\{avatarStudioLightMode\}/gu)?.length,
    2,
  );
  assert.match(cssSource, /botVoiceLightBulbIgnite 600ms ease-out/u);
  assert.match(
    cssSource,
    /data-avatar-light-mode="off"[\s\S]{0,500}opacity:\s*0 !important/u,
  );
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
  assert.match(reroll, /preferredProvider:\s*settings\?\.preferredProvider\s*\?\?\s*"local"/u);
  assert.doesNotMatch(reroll, /\.\.\.\(modelOverride \? \{ modelOverride \} : \{\}\)/u);
  assert.match(pageSource, /function BotFieldRandomizerButton/u);
  assert.match(pageSource, /label="temperature"/u);
  assert.match(pageSource, /BOT_POWER_SIGIL_IDS_V1/u);
});

test("generation produces only a reviewable draft and keeps manual creation", () => {
  const generateDraft = functionSource(
    "generateBotDraftFromPrompt",
    "openFreshBotCustomizer",
  );
  const manualDraft = functionSource("openManualBotDraft", "applyGeneratedBotDraft");

  assert.match(generateDraft, /"\/api\/bots\/generate-draft"/u);
  assert.match(generateDraft, /\.\.\.\(modelOverride \? \{ modelOverride \} : \{\}\)/u);
  assert.match(generateDraft, /\.\.\.\(reasoningEffort \? \{ reasoningEffort \} : \{\}\)/u);
  assert.match(generateDraft, /preferredProvider,/u);
  assert.match(generateDraft, /generateBotThinkingSfxProfile\(/u);
  assert.match(generateDraft, /audioVoiceProfile: await/u);
  assert.match(generateDraft, /setBotAvatarCustomizerOpen\(true\)/u);
  assert.doesNotMatch(generateDraft, /createBot\(/u);
  assert.match(generateDraft, /replaces the unsaved Avatar Studio draft/u);
  assert.match(manualDraft, /setBotAvatarCustomizerOpen\(true\)/u);
  assert.match(pageSource, /Start manually/u);
  assert.match(pageSource, /voicePreviewLine: newBotVoicePreviewLine \|\| null/u);
});

test("creating a generated draft persists its local casting without an override", () => {
  const start = pageSource.indexOf("async function createBot(): Promise<boolean>");
  const end = pageSource.indexOf("function createDefaultBotGroupName", start + 1);
  assert.ok(start >= 0);
  assert.ok(end > start);
  const createBot = pageSource.slice(start, end);

  assert.match(createBot, /authoredAudioVoiceProfile: createdAudioVoiceProfile/u);
  assert.doesNotMatch(createBot, /audioVoiceProfileOverride/u);
  assert.match(createBot, /initializePremiumVoiceDefaultsForAccount\(true\)/u);
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

test("the generator stays below shared navbar chrome and has a responsive review surface", () => {
  assert.match(
    cssSource,
    /\.botGeneratorBackdrop\[data-avatar-foundry="true"\]\s*\{[\s\S]*?inset:\s*var\(--app-shell-top-nav-height, 60px\) 0 0;[\s\S]*?z-index:\s*170/u,
  );
  assert.match(pageSource, /styles\.botAvatarStudioThemeScope/u);
  assert.doesNotMatch(
    pageSource,
    /data-foundry-phase=\{botFoundryPhase\}[\s\S]{0,120}aria-modal="true"/u,
  );
  assert.match(cssSource, /\.botGeneratorDialog\s*\{/u);
  assert.match(cssSource, /\.botGeneratedBriefCard\s+p\s*\{/u);
  assert.match(cssSource, /@media \(max-width: 640px\)/u);
  assert.match(pageSource, /data-bot-generator-brief-card="true"/u);
  assert.match(
    cssSource,
    /\.botGeneratorDialog\[data-foundry-phase\]\s*>\s*\.botGeneratorBriefCard\s*\{/u,
  );
  assert.match(
    cssSource,
    /--bot-foundry-chrome-inset-inline:\s*clamp\(24px,\s*3\.5vw,\s*54px\)/u,
  );
  assert.match(
    ritualCssSource,
    /left:\s*var\(--bot-foundry-chrome-inset-inline,\s*clamp\(24px,\s*3\.5vw,\s*54px\)\)/u,
  );
  assert.match(
    cssSource,
    /\.themeLight\.botAvatarStudioThemeScope\.botGeneratorBackdrop\[data-avatar-foundry="true"\]/u,
  );
  assert.doesNotMatch(
    cssSource,
    /\.botGeneratorDialog\s*>\s*\.botGeneratorHeader[\s\S]{0,220}transform:\s*translateY\(-100%\)/u,
  );
});

test("prompt generation becomes an accessible PRISM assembly ritual", () => {
  const generateDraft = functionSource(
    "generateBotDraftFromPrompt",
    "openFreshBotCustomizer",
  );

  assert.match(pageSource, /<BotCreationRitual/u);
  assert.match(pageSource, /phase=\{botFoundryPhase\}/u);
  assert.match(pageSource, /completedDraft=\{botGeneratorCompletedDraft\}/u);
  assert.match(pageSource, /theme=\{resolvedTheme\}/u);
  assert.match(generateDraft, /setBotGeneratorCompletedDraft\(generatedDraft\)/u);
  assert.match(generateDraft, /prefers-reduced-motion: reduce/u);
  assert.match(ritualSource, /role="status"/u);
  assert.match(ritualSource, /aria-live="polite"/u);
  assert.match(ritualSource, /aria-busy=\{phase === "handoff" \|\| phase === "generation"\}/u);
  assert.match(ritualSource, /Nothing is saved until you choose Create bot\./u);
  assert.doesNotMatch(ritualSource, /\bpercent(?:age)?\b|% complete/iu);
});

test("the creation ritual drops the real dormant bot and performs a visual-only Prism handoff", () => {
  assert.doesNotMatch(ritualSource, /creationWords\(prompt\)/u);
  assert.match(ritualSource, /\{botPreview\}/u);
  assert.match(ritualSource, /botAvatarFoundryAtmosphere\(completedDraft\?\.color, theme\)/u);
  assert.match(ritualSource, /data-atmosphere-source=\{atmosphere\.source\}/u);
  assert.match(ritualSource, /data-companion-origin=/u);
  assert.match(ritualSource, /<PrismOrb aura=\{false\} className=\{styles\.prismOrb\}/u);
  assert.match(pageSource, /foundryRitual/u);
  assert.match(pageSource, /botAvatarFoundryScreenMode\(\s*botFoundryPhase/u);
  assert.match(pageSource, /runtimeEffectsEnabled=\{screenMode === "live"\}/u);
  assert.match(ritualCssSource, /\.prismOrb\s*\{/u);
  assert.match(ritualCssSource, /\.chute\s*\{/u);
  assert.match(ritualCssSource, /\.cradle\s*\{/u);
  assert.match(ritualCssSource, /\.ritual\[data-foundry-phase="arrival"\]/u);
  assert.match(ritualCssSource, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(ritualCssSource, /@media \(max-width: 760px\)/u);
});
