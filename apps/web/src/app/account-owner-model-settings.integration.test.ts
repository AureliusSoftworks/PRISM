import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
function sourceBetween(start: string, end: string): string {
  const startIndex = page.indexOf(start);
  const endIndex = page.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `Missing source start: ${start}`);
  assert.ok(endIndex > startIndex, `Missing source end: ${end}`);
  return page.slice(startIndex, endIndex);
}

describe("account-owned Models settings integration", () => {
  it("changes the owner boundary before publishing an authenticated user", () => {
    const bootstrap = sourceBetween(
      "const bootstrap = useCallback",
      "if (!CLIENT_ACCESS_REQUIRED)",
    );
    assert.match(
      bootstrap,
      /transitionAccountOwnerGeneration\(d\.user\?\.id \?\? null\);\s*setUser\(d\.user\)/u,
    );

    const teardown = sourceBetween(
      "const clearAuthenticatedSessionState = useCallback",
      "const handleAuthReauthRequired",
    );
    assert.match(
      teardown,
      /authBootstrapRequestGenerationRef\.current \+= 1;\s*transitionAccountOwnerGeneration\(null\)/u,
    );
  });

  it("clears owner-bound Models state and pending queues on owner change", () => {
    const transition = sourceBetween(
      "const transitionAccountOwnerGeneration = useCallback",
      "// Derive the --accent",
    );
    for (const expected of [
      "modelEffortMutationVersionRef.current.clear()",
      "modelEffortMutationQueueRef.current.clear()",
      "modelTurboMutationVersionRef.current.clear()",
      "modelTurboMutationQueueRef.current.clear()",
      "modelTurboResetQueueRef.current = Promise.resolve()",
      "globalModelSelectionMutationVersionRef.current += 1",
      "modelCatalogRefreshTokenRef.current += 1",
      "clearEnglishPacingProfileCache()",
      "clearActionSfxPackClientState()",
      "clearLiveVoiceDecodeRuntime()",
      "clearLiveSessionFocusRuntime()",
      "clearSessionAtmosphereAccountAudioCache()",
      "clearZenActionPresentationCache()",
      "clearChatRevealTokenCache()",
      "setSettings(null)",
      "setModelCatalog(null)",
      "setProviderKeyStatus(null)",
      "setApiKeyDraftValidation(createApiKeyDraftValidationMap())",
    ]) {
      assert.ok(transition.includes(expected), `Missing teardown: ${expected}`);
    }
  });

  it("guards queued effort, Turbo, and selected-model mutations", () => {
    for (const [start, end] of [
      ["const persistModelEffortPreference", "const persistModelTurboPreference"],
      ["const persistModelTurboPreference", "const persistAutoTurboPreference"],
      ["const resetAllModelTurboPreferences", "disableTurboForSafetyTransitionRef.current"],
      ["const resetAllModelEffortPreferences", "const notifySimulatedEffortEducation"],
      ["const persistGlobalModelSelection", "const botGeneratorResponseMode"],
    ] as const) {
      const mutation = sourceBetween(start, end);
      assert.match(mutation, /captureAccountOwnerGeneration\(\)/u);
      assert.match(mutation, /runForAccountOwner\(ownerGeneration/u);
    }
  });

  it("guards catalog, provider-key status, and complete Models settings saves", () => {
    for (const [start, end] of [
      ["async function refreshSettings", "async function persistPreferredImageModel"],
      ["async function refreshModels", "async function refreshSecondaryOllamaStatus"],
      ["async function refreshProviderKeyStatus", "async function refreshMemories"],
      ["async function saveSettings", "function setBotModelEnabled"],
    ] as const) {
      assert.match(sourceBetween(start, end), /runForAccountOwner\(ownerGeneration/u);
    }
  });

  it("hydrates every reported Models state only through the guarded settings response", () => {
    const hydration = sourceBetween(
      "async function refreshSettings",
      "async function persistPreferredImageModel",
    );
    for (const field of [
      "hiddenBotModelIds",
      "hiddenGlobalPickerModelIds",
      "autoFallbackChain",
      "onlineAutoProviderBias",
      "onlineAutoProviderWeights",
      "onlineAutoQualityPosture",
      "preferredLocalModel",
      "preferredOnlineModel",
      "modelEffortPreferences",
      "modelTurboPreferences",
    ]) {
      assert.ok(hydration.includes(field), `Missing guarded Models field: ${field}`);
    }
    assert.match(
      hydration,
      /const keySettings = normalizeSavedApiKeySettingsState\(d\.settings\)[\s\S]*\.\.\.keySettings/u,
    );
    for (const keySourceField of [
      "openAiApiKeySource",
      "anthropicApiKeySource",
      "ollamaCloudApiKeySource",
    ]) {
      assert.ok(page.includes(keySourceField), `Missing key status field: ${keySourceField}`);
    }
  });

  it("keeps transient Models notices and applet context in owner-aware process memory", () => {
    assert.match(
      page,
      /simulatedEffortEducationShownOwnerIdsRef\.current\.has\(user\.id\)[\s\S]*simulatedEffortEducationShownOwnerIdsRef\.current\.add\(user\.id\)/u,
    );
    assert.match(
      page,
      /const turboAppletContextRef = useRef<string \| null>\(null\)[\s\S]*syncTurboAppletSessionContext\(\s*previousContext,\s*nextContext,\s*user\.id/u,
    );
    assert.doesNotMatch(
      sourceBetween(
        "const simulatedEffortEducationShownOwnerIdsRef",
        "const effortControlForTarget",
      ),
      /(?:localStorage|sessionStorage)/u,
    );
    assert.doesNotMatch(
      sourceBetween("const turboAppletContextRef", "panelPopupCleanupLastPanelRef"),
      /(?:localStorage|sessionStorage)/u,
    );
  });
});
