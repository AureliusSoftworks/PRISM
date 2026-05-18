import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  encodeComfyUiRemoteWorkflowModelId,
  encodeComfyUiWorkflowModelId,
  parseComfyUiRemoteWorkflowPath,
  parseComfyUiWorkflowSlug,
  parseStoredComfyUiWorkflows,
} from "./comfyUiWorkflow.ts";

describe("comfyUiWorkflow model ids", () => {
  it("encodes and parses workflow slugs", () => {
    assert.equal(encodeComfyUiWorkflowModelId("my-pipeline"), "comfyui-workflow:my-pipeline");
    assert.equal(parseComfyUiWorkflowSlug("comfyui-workflow:my-pipeline"), "my-pipeline");
    assert.equal(parseComfyUiWorkflowSlug("comfyui:x.safetensors"), null);
  });

  it("encodes and parses remote userdata paths", () => {
    const id = encodeComfyUiRemoteWorkflowModelId("default/workflows/foo.json");
    assert.ok(id.startsWith("comfyui-remote:"));
    assert.equal(parseComfyUiRemoteWorkflowPath(id), "default/workflows/foo.json");
    assert.equal(parseComfyUiWorkflowSlug(id), null);
  });
});

describe("parseStoredComfyUiWorkflows", () => {
  it("returns empty array for invalid JSON", () => {
    assert.deepEqual(parseStoredComfyUiWorkflows("{"), []);
  });

  it("skips invalid entries and keeps valid ones", () => {
    const raw = JSON.stringify([
      { id: "bad id!", label: "x", workflow: { "1": { class_type: "X", inputs: {} } }, patch: {} },
      {
        id: "ok",
        label: "OK",
        workflow: {
          "6": { class_type: "CLIPTextEncode", inputs: { text: "t", clip: ["4", 1] } },
        },
        patch: { positivePrompt: { nodeId: "6", inputKey: "text" } },
      },
    ]);
    const out = parseStoredComfyUiWorkflows(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.id, "ok");
  });

  it("parses remotePath-only bindings without a workflow graph", () => {
    const raw = JSON.stringify([
      {
        id: "disk",
        label: "Disk",
        remotePath: "default/workflows/pipe.json",
        patch: { positivePrompt: { nodeId: "6", inputKey: "text" } },
      },
    ]);
    const out = parseStoredComfyUiWorkflows(raw);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.remotePath, "default/workflows/pipe.json");
    assert.equal(out[0]?.workflow, undefined);
  });
});
