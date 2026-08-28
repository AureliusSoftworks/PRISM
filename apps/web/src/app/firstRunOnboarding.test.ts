import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  FIRST_RUN_SETUP_STORAGE_KEY,
  FIRST_RUN_SETUP_STEPS,
  FIRST_RUN_BATCH_FOUNDRY_GUIDANCE,
  FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE,
  FIRST_RUN_COFFEE_GROUP_GUIDANCE,
  clampFirstRunSetupStepIndex,
  clearFirstRunSetupCompletion,
  firstRunSetupProgressPercent,
  firstRunSetupStepAt,
} from "./firstRunOnboarding.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("first-run onboarding", () => {
  it("presents Premium voice as available through a PRISM-managed connection", () => {
    const voiceStep = FIRST_RUN_SETUP_STEPS.find(
      (step) => step.id === "elevenlabs",
    );
    assert.equal(voiceStep?.title, "Premium voice & music");
    assert.match(
      pageSource,
      /activeKeyProvider === "elevenlabs"[\s\S]*settings\?\.elevenLabsApiKeySource === "server"/u,
    );
    assert.match(
      pageSource,
      /Continue without an ElevenLabs account, or add your own key later in Settings\./u,
    );
  });
  it("keeps setup choices one step at a time", () => {
    assert.deepEqual(
      FIRST_RUN_SETUP_STEPS.map((step) => step.id),
      [
        "place",
        "atmosphere",
        "provider",
        "ollama-cloud",
        "openai",
        "anthropic",
        "elevenlabs",
        "auto-models",
        "ready",
      ],
    );
  });

  it("keeps living club rooms in contextual guidance, not first-run setup", () => {
    // Reviewed with the living-room launch: club roster, compact LOD, and
    // focused-bot actions require an authored saved group, so they belong in
    // the Zen contextual walkthrough rather than account setup.
    const setupLabels = FIRST_RUN_SETUP_STEPS.map(
      (step) => `${step.id} ${step.title} ${step.shortTitle}`,
    ).join(" ");
    assert.doesNotMatch(
      setupLabels,
      /living club|group room|micro avatar|Talk to me|bot assets/iu,
    );
  });

  it("chooses the workspace atmosphere before connection setup", () => {
    const atmosphereIndex = FIRST_RUN_SETUP_STEPS.findIndex(
      (step) => step.id === "atmosphere",
    );
    assert.ok(atmosphereIndex > 0);
    assert.ok(
      atmosphereIndex <
        FIRST_RUN_SETUP_STEPS.findIndex((step) => step.id === "openai"),
    );
    assert.match(pageSource, /Your first Home scene starts rendering quietly/u);
    assert.match(pageSource, /appears automatically when you enter/u);
    assert.match(pageSource, /local asset library/u);
    assert.match(pageSource, /wield\s*Prism onto \+/u);
  });

  it("marks credentials and contextual Auto guidance as skippable", () => {
    for (const stepId of [
      "ollama-cloud",
      "openai",
      "anthropic",
      "elevenlabs",
      "auto-models",
    ]) {
      assert.equal(
        FIRST_RUN_SETUP_STEPS.find((step) => step.id === stepId)?.optional,
        true,
      );
    }
  });

  it("offers Ollama Cloud as an optional encrypted account connection", () => {
    const cloudStep = FIRST_RUN_SETUP_STEPS.find(
      (step) => step.id === "ollama-cloud",
    );
    assert.equal(cloudStep?.title, "Connect Ollama Cloud");
    assert.equal(cloudStep?.optional, true);
    assert.match(pageSource, /keyProvider = "ollama_cloud"/u);
    assert.match(pageSource, /patch\.ollamaCloudApiKey = keyValue/u);
    assert.match(pageSource, /Ollama Cloud API key/u);
  });

  it("introduces contextual Auto and lane-specific recovery", () => {
    assert.match(pageSource, /Auto is the default text model/u);
    assert.match(pageSource, /fastest\s*suitable model and Effort/u);
    assert.match(pageSource, /hollow\s*triangle/u);
    assert.match(pageSource, /separate optional Auto routing\s*priorities/u);
    assert.match(pageSource, /Auto appends every other eligible\s*model/u);
    assert.match(pageSource, /Recovery uses no thinking/u);
    assert.match(pageSource, /LOCAL never evaluates or calls an online model/u);
  });

  it("introduces Debate as one guided path with optional tuning", () => {
    assert.match(
      pageSource,
      /Debate follows one guided path: name the idea, let Prism\s*prepare the balanced motion and side briefs/u,
    );
    assert.match(
      pageSource,
      /choose the\s*debaters, then add or skip evidence/u,
    );
    assert.match(pageSource, /Tune the room and Your\s*seat &amp; the Jury/u);
    assert.match(pageSource, /Forum, Turnabout, atmosphere, roles/u);
    assert.match(pageSource, /without crowding the setup/u);
  });

  it("introduces the rich and lean automatic Batch Foundry thresholds", () => {
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /2–10 bots/u);
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /11–100/u);
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /rich full drafts/u);
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /recoverable progress still saves automatically/u);
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /model-authored Library group/u);
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /constellation chamber/u);
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /not Avatar Studio/u);
    assert.match(FIRST_RUN_BATCH_FOUNDRY_GUIDANCE, /mini-avatar slot/u);
    assert.match(
      FIRST_RUN_BATCH_FOUNDRY_GUIDANCE,
      /glyph-only Micro identities inside each generated color-and-glyph orb/u,
    );
    assert.match(pageSource, /FIRST_RUN_BATCH_FOUNDRY_GUIDANCE/u);
  });

  it("teaches bot-directed Wield setup without implying auto-start", () => {
    assert.match(FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE, /hold Option/u);
    assert.match(FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE, /stays fixed/u);
    assert.match(FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE, /nothing begins/u);
    assert.match(FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE, /named stage presets/u);
    assert.match(FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE, /never replace a show’s identity, cast, or artwork/u);
    assert.match(FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE, /I Feel Lucky!/u);
    assert.match(FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE, /immediately starts/u);
    assert.match(pageSource, /FIRST_RUN_BOT_DIRECTED_SETUP_GUIDANCE/u);
  });

  it("teaches permanent Coffee Group membership separately from attendance", () => {
    assert.match(FIRST_RUN_COFFEE_GROUP_GUIDANCE, /2–5 Library bots/u);
    assert.match(FIRST_RUN_COFFEE_GROUP_GUIDANCE, /permanent members/u);
    assert.match(FIRST_RUN_COFFEE_GROUP_GUIDANCE, /Invited and Away/u);
    assert.match(FIRST_RUN_COFFEE_GROUP_GUIDANCE, /original cast/u);
    assert.match(pageSource, /FIRST_RUN_COFFEE_GROUP_GUIDANCE/u);
  });

  it("names chat routing separately from image and voice routing", () => {
    const providerStep = FIRST_RUN_SETUP_STEPS.find(
      (step) => step.id === "provider",
    );
    assert.equal(providerStep?.title, "Choose your chat home base");
    assert.match(
      pageSource,
      /Image generation has its own LOCAL\/ONLINE choice/u,
    );
    assert.match(
      pageSource,
      /English always uses each bot(?:&apos;|’)s local\s*PRISM or optional operating-system voice without ElevenLabs\s*credits\. Premium uses its ElevenLabs identity for AUTO and\s*ONLINE speech, then falls back locally/u,
    );
    assert.match(pageSource, /Chat home base/u);
  });

  it("explains Premium identity initialization without changing English", () => {
    assert.match(
      pageSource,
      /English remains local and uses no ElevenLabs credits/u,
    );
    assert.match(
      pageSource,
      /assigns stable Premium defaults from the collection you choose in Voice Settings/u,
    );
    assert.match(
      pageSource,
      /one Accent Map pin shapes both Local and Premium voice/u,
    );
    assert.match(pageSource, /keeping the spoken language English/u);
  });

  it("clamps restored progress and reaches a full final bar", () => {
    assert.equal(firstRunSetupStepAt(-4).id, "place");
    assert.equal(firstRunSetupStepAt(999).id, "ready");
    assert.equal(clampFirstRunSetupStepIndex(2.9), 2);
    assert.equal(firstRunSetupProgressPercent(0), 0);
    assert.equal(firstRunSetupProgressPercent(999), 100);
  });

  it("clears the completion marker without making blocked storage fatal", () => {
    const removedKeys: string[] = [];
    assert.equal(
      clearFirstRunSetupCompletion({
        removeItem(key) {
          removedKeys.push(key);
        },
      }),
      true,
    );
    assert.deepEqual(removedKeys, [FIRST_RUN_SETUP_STORAGE_KEY]);

    assert.equal(
      clearFirstRunSetupCompletion({
        removeItem() {
          throw new Error("storage unavailable");
        },
      }),
      false,
    );
  });

  it("keeps guided setup available from Settings", () => {
    assert.match(pageSource, /data-first-run-setup-reentry="true"/u);
    assert.match(pageSource, />Run guided setup again</u);
    assert.match(pageSource, /onClick=\{reopenDesktopFirstRunChecklist\}/u);
  });
});
