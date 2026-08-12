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
  assert.match(page, /<span>Auto recovery<\/span>/u);
  assert.match(page, /<span>Manage model list<\/span>/u);
  assert.doesNotMatch(page, /Image-request LLM/u);
  assert.doesNotMatch(page, /Saved effort profiles/u);
  assert.doesNotMatch(page, />Image fallback</u);
  assert.doesNotMatch(page, /image panel defaults/u);
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
