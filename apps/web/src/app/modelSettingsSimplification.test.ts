import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const api = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);
const assistantSentImage = readFileSync(
  new URL("../../../api/src/assistant-sent-image.ts", import.meta.url),
  "utf8",
);
const slateWorkspace = readFileSync(
  new URL("./SlateWorkspace.tsx", import.meta.url),
  "utf8",
);
const signalExperience = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);

test("keeps Models focused on background work, recovery, and advanced visibility", () => {
  assert.match(page, /Background &amp; Recovery/u);
  assert.match(page, /<span>Background model<\/span>/u);
  assert.match(page, /Ollama Cloud is available only while the global[\s\S]{0,120}mode is ONLINE/u);
  assert.match(page, /<span>Auto routing priorities<\/span>/u);
  assert.match(page, /<span>Manage model list<\/span>/u);
  assert.match(page, /Refresh models/u);
  assert.match(page, /refresh=1/u);
  assert.match(
    api,
    /ctx\.query\.get\("refresh"\) === "1"[\s\S]*refreshModelCatalog/u,
  );
  assert.match(
    page,
    /window\.dispatchEvent\(new Event\(MODEL_CATALOG_REFRESHED_EVENT\)\)/u,
  );
  assert.match(
    slateWorkspace,
    /addEventListener\(MODEL_CATALOG_REFRESHED_EVENT, refreshCatalog\)/u,
  );
  assert.doesNotMatch(page, /Image-request LLM/u);
  assert.doesNotMatch(page, /Saved effort profiles/u);
  assert.doesNotMatch(page, />Image fallback</u);
  assert.doesNotMatch(page, /image panel defaults/u);
});

test("keeps model enablement and manual picker visibility independent", () => {
  assert.match(page, /aria-label=\{`Enable \$\{model\.label\}`\}/u);
  assert.match(page, /aria-label=\{`Show \$\{model\.label\} in picker`\}/u);
  assert.match(page, /checked=\{enabled\}[\s\S]{0,500}setBotModelEnabled/u);
  assert.match(
    page,
    /checked=\{pickerVisible\}[\s\S]{0,400}disabled=\{!enabled\}[\s\S]{0,500}setGlobalPickerModelVisible/u,
  );
  assert.match(page, /hiddenGlobalPickerModelIds: Array\.from\(hidden\)/u);
  assert.match(page, /hiddenBotModelIds: Array\.from\(current\)/u);
  const pickerVisibilitySetter = page.slice(
    page.indexOf("function setGlobalPickerModelVisible"),
    page.indexOf("async function saveTextModelDisplayName"),
  );
  assert.doesNotMatch(
    pickerVisibilitySetter,
    /setGlobalModelChoiceByProvider|preferredLocalModel|preferredOnlineModel|autoFallbackChain/u,
  );
  assert.match(
    page,
    /isHiddenGlobalPickerModelId\(settings, choice\)[\s\S]{0,100}\? options/u,
  );
});

test("applies picker visibility to shared text, image, customizer, and Slate paths", () => {
  assert.match(
    page,
    /function hiddenManualModelIds[\s\S]{0,240}hiddenBotModelIds[\s\S]{0,160}hiddenGlobalPickerModelIds/u,
  );
  assert.match(
    page,
    /function chatModelOptionsForProvider[\s\S]{0,420}hiddenManualModelIds\(settings\)/u,
  );
  assert.match(
    page,
    /filterVisibleModelOptions\(\s*openAiImageModelCatalogEntries,\s*hiddenManualModelIds\(settings\)/u,
  );
  assert.match(
    page,
    /filterVisibleModelOptions\(\s*elevenLabsImageModelCatalogEntries,\s*hiddenManualModelIds\(settings\)/u,
  );
  assert.match(
    slateWorkspace,
    /const disabled = new Set\(response\.hiddenBotModelIds \?\? \[\]\)[\s\S]{0,500}!disabled\.has\(model\.id\)[\s\S]{0,160}model\.showInGlobalPicker !== false/u,
  );
  assert.match(
    api,
    /const hiddenModelIds = parseHiddenBotModelIds\(user\.hidden_bot_model_ids\)[\s\S]{0,5000}eligibleCandidates: candidateAllowlist/u,
  );
  assert.doesNotMatch(api, /AUTO_OPT_IN_MODEL_IDS|hiddenAutoOptInModelIds/u);
});

test("places ComfyUI workflow visibility with its connection", () => {
  const connectionField = page.indexOf("ComfyUI server");
  const workflowVisibility = page.indexOf(
    "renderComfyUiWorkflowVisibilityControls()",
  );

  assert.ok(connectionField >= 0);
  assert.ok(workflowVisibility > connectionField);
  assert.match(page, /<span>Visible ComfyUI workflows<\/span>/u);
});

test("removes account-default and response-Auto controls from secondary text surfaces", () => {
  assert.doesNotMatch(slateWorkspace, /Auto-select from account defaults/u);
  assert.doesNotMatch(slateWorkspace, /Account (?:offline|online) default/u);
  assert.doesNotMatch(
    slateWorkspace,
    /\["offline", "auto", "online"\]/u,
  );
  assert.match(slateWorkspace, /Auto — PRISM chooses model \+ effort/u);
  assert.doesNotMatch(signalExperience, /account default is selected/u);
});

test("routes Prism image intent through Prism and recovers with the saved local image model", () => {
  assert.match(
    api,
    /prismImageToolLlmModel: user\.prism_default_llm_model/u,
  );
  assert.match(
    assistantSentImage,
    /lenientLocalImageFallbackModel\?\.trim\(\) \|\|\s*resolvedLocalImageModel/u,
  );
});
