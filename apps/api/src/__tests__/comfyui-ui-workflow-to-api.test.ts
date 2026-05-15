import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertComfyUiUiWorkflowToApiPromptUsingObjectInfo,
  diskJsonRootLooksLikeUiWorkflow,
  parseComfyUiDiskWorkflowJson,
} from "../comfyui-ui-workflow-to-api.ts";

describe("parseComfyUiDiskWorkflowJson", () => {
  it("classifies a litegraph save as ui", () => {
    const raw = {
      version: 1,
      nodes: [
        {
          id: 4,
          type: "CheckpointLoaderSimple",
          pos: { "0": 0, "1": 0 },
          size: { "0": 100, "1": 50 },
          flags: {},
          order: 0,
          mode: 0,
          inputs: [],
          outputs: [],
          properties: {},
          widgets_values: ["m.safetensors"],
        },
      ],
      links: [],
    };
    assert.equal(diskJsonRootLooksLikeUiWorkflow(raw as Record<string, unknown>), true);
    const p = parseComfyUiDiskWorkflowJson(JSON.stringify(raw));
    assert.equal(p.kind, "ui");
  });
});

describe("convertComfyUiUiWorkflowToApiPromptUsingObjectInfo", () => {
  it("skips control_after_generate companion values after INT seeds (KSampler)", () => {
    const uiRoot = {
      version: 1,
      nodes: [
        {
          id: 3,
          type: "KSampler",
          pos: { "0": 0, "1": 0 },
          size: { "0": 100, "1": 50 },
          flags: {},
          order: 0,
          mode: 0,
          inputs: [],
          outputs: [],
          properties: {},
          widgets_values: [12345, "randomize", 20, 8, "euler", "normal", 1.0],
        },
      ],
      links: [],
    };
    const objectInfo = {
      KSampler: {
        input: {
          required: {
            model: ["MODEL", {}],
            seed: ["INT", { control_after_generate: true }],
            steps: ["INT", {}],
            cfg: ["FLOAT", {}],
            sampler_name: [["euler"], {}],
            scheduler: [["normal"], {}],
            positive: ["CONDITIONING", {}],
            negative: ["CONDITIONING", {}],
            latent_image: ["LATENT", {}],
            denoise: ["FLOAT", {}],
          },
        },
      },
    };
    const g = convertComfyUiUiWorkflowToApiPromptUsingObjectInfo(
      uiRoot as Record<string, unknown>,
      objectInfo as Record<string, unknown>
    );
    const n = g["3"] as { inputs?: Record<string, unknown> };
    assert.equal(n.inputs?.seed, 12345);
    assert.equal(n.inputs?.steps, 20);
    assert.equal(n.inputs?.cfg, 8);
    assert.equal(n.inputs?.sampler_name, "euler");
    assert.equal(n.inputs?.scheduler, "normal");
    assert.equal(n.inputs?.denoise, 1.0);
  });

  it("maps widgets_values into API inputs using object_info order", () => {
    const uiRoot = {
      version: 1,
      nodes: [
        {
          id: 4,
          type: "CheckpointLoaderSimple",
          pos: { "0": 0, "1": 0 },
          size: { "0": 100, "1": 50 },
          flags: {},
          order: 0,
          mode: 0,
          inputs: [],
          outputs: [],
          properties: {},
          widgets_values: ["custom.safetensors"],
        },
      ],
      links: [],
    };
    const objectInfo = {
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [["a.safetensors", "b.safetensors"], {}],
          },
        },
      },
    };
    const g = convertComfyUiUiWorkflowToApiPromptUsingObjectInfo(
      uiRoot as Record<string, unknown>,
      objectInfo as Record<string, unknown>
    );
    const n = g["4"] as { class_type?: string; inputs?: { ckpt_name?: string } };
    assert.equal(n.class_type, "CheckpointLoaderSimple");
    assert.equal(n.inputs?.ckpt_name, "custom.safetensors");
  });
});
