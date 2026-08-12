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

test("character brief is a populated universal refract target in the generator", () => {
  assert.match(pageSource, /id="bot-generator-prompt"/u);
  assert.match(
    pageSource,
    /data-tutorial-target="bot-generator-prompt"/u,
  );
  assert.match(pageSource, /maxLength=\{BOT_GENERATION_PROMPT_MAX_LENGTH\}/u);
  assert.match(pageSource, /Character brief/gu);
  assert.match(pageSource, /disabled=\{botGeneratorBusy\}/u);
  assert.match(pageSource, /autoFocus/u);
  assert.match(
    pageSource,
    /\{botGeneratorBusy \? \(\s*<PrismCompanionPresenceBoundary reason="bot-creation" \/>\s*\) : null\}/u,
  );
  assert.doesNotMatch(
    pageSource,
    /<textarea[\s\S]{0,500}data-prism-refract-ignore/u,
  );
  assert.match(ritualCssSource, /\.prismAnchor\s*\{[\s\S]*?opacity:\s*0;/u);
  assert.match(
    ritualCssSource,
    /data-foundry-phase="generation"\] \.prismAnchor\s*\{[\s\S]*?opacity:\s*\.92;/u,
  );
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
    1,
  );
  assert.match(
    pageSource,
    /botFoundryPhase === "generation" \|\|[\s\S]{0,100}botFoundryPhase === "awakening"[\s\S]{0,120}\? "alive"[\s\S]{0,80}: avatarStudioLightMode/u,
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

test("a generated Power enters Avatar Studio as the normal removable draft", () => {
  const applyDraft = functionSource(
    "applyGeneratedBotDraft",
    "generateBotDraftFromPrompt",
  );

  assert.match(applyDraft, /setNewBotPowers\(normalizeBotPowersV1\(draft\.powers\)\)/u);
  assert.match(pageSource, /Pop Power\?/u);
  assert.match(pageSource, /powers: drafts/u);
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

test("foundry generation locks shared top-navbar controls and keeps only wordmark navigation", () => {
  assert.match(
    pageSource,
    /const botFoundryGenerationLocked = botGeneratorOpen && botGeneratorBusy;/u,
  );
  assert.match(
    pageSource,
    /const wordmarkOnlyMode =[\s\S]{0,120}botFoundryGenerationLocked \|\| options\.wordmarkOnlyLock === true;/u,
  );
  assert.match(
    pageSource,
    /Cancel this in-flight bot draft and return to the foundry brief screen without saving a bot\?/u,
  );
  assert.match(pageSource, /onClick: handleBotGeneratorWordmarkNavigation,/u);
  assert.match(
    pageSource,
    /onClick=\{handleBotGeneratorWordmarkNavigation\}/u,
  );
  assert.match(
    pageSource,
    /botGeneratorGenerationSnapshotRef\.current = \{[\s\S]{0,420}currentBotAvatarDraftSnapshot\(\)[\s\S]{0,420}hasGeneratedDraft: botGeneratorHasGeneratedDraft/u,
  );
  assert.match(
    pageSource,
    /applyBotAvatarDraftSnapshot\(generationSnapshot\.draft\)/u,
  );
  assert.match(pageSource, /if \(botGeneratorBusy\) return;/u);
  assert.match(pageSource, /inert=\{wordmarkOnlyMode \? true : undefined\}/u);
  assert.match(pageSource, /botFoundryGenerationLockIsActive\(\)/u);
  assert.match(
    pageSource,
    /renderAppSwitcher\(\{[\s\S]{0,120}disabled: botFoundryGenerationLocked/u,
  );
  assert.match(
    pageSource,
    /const foundryWordmarkOnlyLockActions: UniversalNavbarDisabledMap = \{[\s\S]{0,260}promptCenter: true,[\s\S]{0,180}hub: true,\s*\};/u,
  );
  assert.match(
    pageSource,
    /disabledActions: universalDisabledActions,[\s\S]{0,80}disabledActionTooltips:\s*universalDisabledTooltips/u,
  );
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
    /\.botGeneratorDialog\[data-foundry-phase\]\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*var\(--bot-foundry-workspace-height\)/u,
  );
  assert.doesNotMatch(
    cssSource,
    /\.botGeneratorDialog\[data-foundry-phase\]\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*var\(--app-shell-top-nav-height/u,
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

test("the creation ritual makes the real dormant bot tactile before synthesis", () => {
  assert.doesNotMatch(ritualSource, /creationWords\(prompt\)/u);
  assert.match(ritualSource, /renderBotPreview\(previewState\)/u);
  assert.match(ritualSource, /botAvatarFoundryAtmosphere\(completedDraft\?\.color, theme\)/u);
  assert.match(ritualSource, /data-atmosphere-source=\{atmosphere\.source\}/u);
  assert.match(ritualSource, /data-prism-anchor="authored"/u);
  assert.match(ritualSource, /<PrismOrb aura size="100%"/u);
  assert.doesNotMatch(ritualSource, /window\.addEventListener\("pointermove", followPointer/u);
  assert.match(ritualSource, /botAvatarFoundryRadialRayGeometry\(\s*BOT_AVATAR_FOUNDRY_PRISM_ANCHOR/u);
  assert.doesNotMatch(ritualSource, /setPrismPosition/u);
  assert.doesNotMatch(pageSource, /getPrismCompanionVisualSnapshot/u);
  assert.doesNotMatch(pageSource, /companionOrigin=\{botFoundryCompanionOrigin\}/u);
  assert.match(ritualSource, /botAvatarFoundryInitialPhysicsBody/u);
  assert.match(
    ritualSource,
    /stepBotAvatarFoundryPhysics\(\s*physicsBodyRef\.current,\s*physicsBoundsRef\.current,\s*\(now - previous\) \/ 1_000,?\s*\)/u,
  );
  assert.match(ritualSource, /setPointerCapture\(event\.pointerId\)/u);
  assert.match(ritualSource, /botAvatarFoundryThrowVelocity/u);
  assert.match(ritualSource, /playSpatialUiSfx\("foundry-clank"/u);
  assert.match(ritualSource, /className=\{styles\.prismRadialLight\}/u);
  assert.match(ritualSource, /buckleGlyph: populationFrame\.glyph/u);
  assert.doesNotMatch(ritualSource, /className=\{styles\.synthesisGlyph\}/u);
  assert.match(ritualSource, /className=\{styles\.moduleReadouts\}/u);
  assert.match(ritualSource, /"populating"/u);
  assert.match(ritualSource, /className=\{styles\.awakeningDischarge\}/u);
  assert.match(pageSource, /foundryRitual/u);
  assert.match(pageSource, /botAvatarFoundryScreenMode\(\s*botFoundryPhase/u);
  assert.match(pageSource, /runtimeEffectsEnabled=\{screenMode === "live"\}/u);
  assert.match(pageSource, /previewState\.faceCandidate\.eyes/u);
  assert.match(pageSource, /previewState\.faceCandidate\.mouth/u);
  assert.match(pageSource, /previewState\.buckleGlyph/u);
  assert.match(pageSource, /previewState\.screenFinalizing/u);
  assert.match(pageSource, /BOT_AVATAR_FOUNDRY_TIMING\.finalizationMs/u);
  assert.match(pageSource, /modulePopulation=\{previewState\.modulePopulation\}/u);
  assert.match(pageSource, /voiceLightLevel=\{previewState\.lightLevel\}/u);
  assert.match(pageSource, /frameWearSeed=\{previewState\.frameWearSeed\}/u);
  assert.match(pageSource, /botFrameMetalMaterialStyle\(\s*frameMaterialSeed[^;]+frameWearSeed/u);
  assert.match(ritualCssSource, /\.prismRadialLight\s*\{/u);
  assert.match(ritualCssSource, /\.prismAnchor\s*\{/u);
  assert.doesNotMatch(ritualCssSource, /\.prismFollower\s*\{/u);
  assert.match(ritualCssSource, /\.shellHitTarget\s*\{/u);
  assert.match(ritualCssSource, /\.synthesisFill\s*\{/u);
  assert.match(ritualCssSource, /@keyframes foundryResolvedPhosphorFill/u);
  assert.match(ritualCssSource, /\.moduleReadout\[data-state="populating"\]/u);
  assert.match(ritualCssSource, /@keyframes foundryFinalSpark/u);
  assert.match(ritualCssSource, /@keyframes foundryFinalSmoke/u);
  assert.match(ritualCssSource, /\.chute\s*\{/u);
  assert.match(ritualCssSource, /\.cradle\s*\{/u);
  assert.match(ritualSource, /className=\{styles\.footer\}/u);
  assert.match(
    cssSource,
    /\.botGeneratorDialog\[data-foundry-phase\][\s\S]{0,120}\.botAvatarMannequinPanel\[data-foundry-ritual="true"\]\s*\{[\s\S]*?display:\s*block;[\s\S]*?background:\s*transparent;/u,
  );
  assert.match(
    cssSource,
    /\.botAvatarMannequinPanel\[data-foundry-ritual="true"\][\s\S]{0,120}\.botAvatarMannequinStage\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset:\s*0;[\s\S]*?background:\s*transparent;/u,
  );
  assert.match(ritualCssSource, /\.botDropRig\[data-aligning="true"\]/u);
  assert.match(ritualCssSource, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(ritualCssSource, /@media \(max-width: 760px\)/u);
});

test("Foundry synthesis stays beneath authored glass and separates both liquid screens", () => {
  const overlayIndex = pageSource.indexOf(
    'data-avatar-foundry-screen-overlay="true"',
  );
  const glassIndex = pageSource.indexOf(
    "className={styles.zenLiveBotPresenceScreenGlassOverlay}",
    overlayIndex,
  );
  assert.ok(overlayIndex >= 0);
  assert.ok(glassIndex > overlayIndex);
  assert.match(
    cssSource,
    /data-screen-mode="synthesis"[\s\S]*?\.botAvatarFoundryScreenOverlay\s*\{[\s\S]*?z-index:\s*4;/u,
  );
  assert.match(pageSource, /className=\{styles\.botAvatarFoundryBuckleFill\}/u);
  assert.match(cssSource, /\.botAvatarFoundryBuckleFill::after\s*\{[\s\S]*?inset:\s*var\(--foundry-buckle-unfilled/u);
  assert.match(
    pageSource,
    /className=\{styles\.botAvatarFoundryBuckleGlass\}[\s\S]*?data-avatar-foundry-buckle-glass="true"/u,
  );
  const buckleFillIndex = pageSource.indexOf(
    "className={styles.botAvatarFoundryBuckleFill}",
  );
  const buckleGlyphIndex = pageSource.indexOf(
    "<PhosphorPixelSvgGlyph className={styles.zenLiveBotPresenceBotGlyph}>",
    buckleFillIndex,
  );
  const buckleGlassIndex = pageSource.indexOf(
    "className={styles.botAvatarFoundryBuckleGlass}",
    buckleGlyphIndex,
  );
  assert.ok(buckleFillIndex >= 0);
  assert.ok(buckleGlyphIndex > buckleFillIndex);
  assert.ok(buckleGlassIndex > buckleGlyphIndex);
  assert.match(
    cssSource,
    /\.botAvatarFoundryBuckleFill\s*\{[\s\S]*?--foundry-buckle-screen-size:[\s\S]*?border-radius:\s*50%/u,
  );
  assert.match(cssSource, /data-screen-crest="true"[\s\S]*?z-index:\s*9;/u);
  assert.match(ritualCssSource, /data-synthesis-complete="true"[\s\S]*?background:\s*#fff;/u);
});
