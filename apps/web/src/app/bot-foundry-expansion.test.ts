import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Bot Foundry expansion integration", () => {
  it("launches Create, Inspire, and Batch from one Foundry container", () => {
    assert.match(pageSource, /data-tutorial-target="bot-foundry-launcher"/u);
    assert.match(pageSource, /openNewBotCreator\("standard"\)/u);
    assert.match(pageSource, /openNewBotCreator\("inspire"\)/u);
    assert.match(pageSource, /openNewBotCreator\("batch"\)/u);
    assert.match(pageSource, />Browse bots</u);
    assert.match(pageSource, />Marketplace</u);
  });

  it("keeps optional Power controls for rich creation and forces them off for lean batches", () => {
    const batchChamberMatch = pageSource.match(
      /data-batch-foundry-chamber="true"[\s\S]{0,20000}/u,
    );
    assert.ok(batchChamberMatch, "The Batch Foundry dedicated chamber is present");
    const batchChamberSource = batchChamberMatch[0]!;

    assert.match(pageSource, /data-tutorial-target="bot-foundry-powers"/u);
    assert.match(pageSource, />Create Powers</u);
    assert.match(pageSource, />Social influence \/ craziness</u);
    assert.match(pageSource, /name="bot-foundry-power-count"/u);
    assert.match(pageSource, /weak compound each/u);
    assert.match(pageSource, /resolveBotFoundryGenerationContextForBriefV1\(/u);
    assert.match(pageSource, /setBotFoundryPowerEnabled\(true\)/u);
    assert.match(pageSource, /generationContext,/u);
    assert.match(pageSource, /BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT/u);
    assert.match(batchChamberSource, /Create Powers/u);
    assert.match(
      batchChamberSource,
      /Rich batch members retain the selected Power contract\./u,
    );
    assert.match(
      batchChamberSource,
      /Lean batches use personality-first defaults; Powers and bespoke avatar work stay off\./u,
    );
  });

  it("bounds Inspire selection and sends per-bot influence", () => {
    assert.match(pageSource, /data-tutorial-target="bot-foundry-inspiration"/u);
    assert.match(pageSource, /BOT_FOUNDRY_INSPIRATION_MAX_SOURCES/u);
    assert.match(pageSource, /<BotPickerGrid/u);
    assert.match(pageSource, /<BotPickerTile/u);
    assert.match(pageSource, /<BotLibraryGroupPicker/u);
    assert.match(pageSource, /<HueLensControl/u);
    assert.match(pageSource, /botFoundryInspirationVisibleBots/u);
    assert.match(pageSource, /botFoundryInspirationInfluence\[id\] \?\? 50/u);
    assert.match(pageSource, />Overall resemblance</u);
  });

  it("runs every 2-100 Batch automatically and preserves the rich-to-lean threshold", () => {
    const batchChamberMatch = pageSource.match(
      /data-batch-foundry-chamber="true"[\s\S]{0,20000}/u,
    );
    assert.ok(batchChamberMatch, "The Batch Foundry dedicated chamber is present");
    const batchChamberSource = batchChamberMatch[0]!;
    const batchCountControlMatch = batchChamberSource.match(
      /data-tutorial-target="bot-foundry-batch-count"[\s\S]{0,10000}?<\/label>/u,
    );
    assert.ok(batchCountControlMatch, "The batch cast size control is present");
    const batchCountControl = batchCountControlMatch[0]!;
    assert.match(batchCountControl, /min=\{BOT_FOUNDRY_BATCH_MIN_COUNT\}/u);
    assert.match(batchCountControl, /max=\{BOT_FOUNDRY_BATCH_MAX_COUNT\}/u);
    assert.match(batchCountControl, /step=\{1\}/u);
    assert.match(batchChamberSource, /Cast size/u);
    assert.match(
      batchChamberSource,
      /2–20 reveal as minis · 21–100 as micro orbs/u,
    );
    assert.match(batchCountControl, /type="range"/u);
    assert.match(batchCountControl, /dir="ltr"/u);
    assert.match(batchCountControl, /value=\{displayedBotFoundryBatchCount\}/u);
    assert.doesNotMatch(batchCountControl, /type="number"/u);
    assert.match(pageSource, /aria-label="Batch cast size"/u);
    assert.match(pageSource, /enabled: botFoundryPowerEnabled/u);
    assert.match(pageSource, /applyBotFoundryBatchCountValue\(/u);
    assert.match(pageSource, /2–20 reveal as minis · 21–100 as micro orbs/u);
    assert.match(batchCountControl, /data-batch-count-output="true"/u);
    assert.match(batchCountControl, /\{\s*" bots"\}/u);
    assert.match(pageSource, /data-tutorial-target="bot-foundry-batch-count"/u);
    assert.match(pageSource, /botGeneratorRangeRail/u);
    assert.match(pageSource, /botGeneratorRange/u);
    assert.doesNotMatch(
      pageSource,
      /if \(!initial \|\| initial\.total < BOT_FOUNDRY_LEAN_BATCH_MIN_COUNT\) return;/u,
    );
    assert.match(pageSource, /Rich automatic batch/u);
    assert.match(pageSource, /function beginBotFoundryGeneration\(\)/u);
    assert.match(pageSource, /void runAutomaticBotFoundryBatch\(progress\)/u);
    assert.match(pageSource, /onClick=\{beginBotFoundryGeneration\}/u);
    assert.match(pageSource, /onKeyDown=\{\(event\) => \{[\s\S]*?beginBotFoundryGeneration\(\)/u);
  });

  it("saves automatic batches with honest progress, retry, and dashboard handoff", () => {
    assert.match(pageSource, /runAutomaticBotFoundryJobs\(/u);
    assert.match(pageSource, /data-tutorial-target="bot-foundry-batch-progress"/u);
    assert.match(pageSource, /Created \$\{working\.createdBotIds\.length\} of \$\{working\.total\}/u);
    assert.match(pageSource, /retry continues only the missing members/u);
    assert.match(pageSource, /generatedBotDraftCreatePayload\(generated\.draft\)/u);
    assert.match(pageSource, /await persistBotFoundryBatchGroup\(working\)/u);
    assert.match(pageSource, /focusBotFoundryBatchGroup\(working\.groupId\)/u);
    assert.match(pageSource, /includeBatchGroupIdentity/u);
  });

  it("branches Batch into a dedicated constellation rather than the full Avatar Foundry", () => {
    assert.match(pageSource, /botFoundryCreationMode === "batch" \? \(/u);
    assert.match(pageSource, /data-batch-foundry-chamber="true"/u);
    assert.match(pageSource, /Constellation chamber/u);
    assert.match(pageSource, /projectBotFoundryBatchSlots\(/u);
    assert.match(pageSource, /<BotCreationRitual/u);
    assert.match(pageSource, /\) : \(\s*<>\s*<BotCreationRitual/u);
    const dialogStart = pageSource.indexOf(
      '{botFoundryCreationMode === "batch" ? (',
    );
    const dialogEnd = pageSource.indexOf("document.body,", dialogStart);
    const dialogSource = pageSource.slice(dialogStart, dialogEnd);
    assert.equal(
      dialogSource.match(/botFoundryCreationMode === "batch"/gu)?.length,
      1,
      "Only the dedicated chamber split may branch on Batch mode",
    );
  });

  it("uses the canonical compact tier boundary for batch slots", () => {
    assert.match(pageSource, /botFoundryBatchAvatarTier\(/u);
    assert.match(pageSource, /<ChatMiniBotAvatar/u);
    assert.match(pageSource, /<BotAvatarMicro/u);
    assert.match(pageSource, /faceStyle=\{preview\.face\}/u);
    assert.match(pageSource, /faceEyeCharacter=\{preview\.face\?\.eyeCharacter\}/u);
    assert.match(pageSource, /faceMouthCharacter=\{preview\.face\?\.mouthCharacter\}/u);
    assert.match(pageSource, /data-avatar-render-tier/u);
    assert.match(pageSource, /--bot-foundry-slot-color/u);
  });
});
