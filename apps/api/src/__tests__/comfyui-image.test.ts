import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyComfyUiWorkflowRuntimePatches,
  buildTxt2ImgWorkflow,
  comfyWorkflowKindFromCheckpoint,
  extractCheckpointNames,
  extractFirstOutputImageFromComfyHistoryJson,
  inferComfyUiWorkflowPatchMap,
  parseComfyUiDimensions,
  parseComfyUiUserdataWorkflowFileToApiGraph,
  randomizeComfyUiWorkflowSeedInputs,
} from "../comfyui-image.ts";

describe("comfyWorkflowKindFromCheckpoint", () => {
  it("uses flux sampling defaults when filename mentions Flux", () => {
    assert.equal(comfyWorkflowKindFromCheckpoint("flux1-dev-fp8.safetensors"), "flux");
    assert.equal(comfyWorkflowKindFromCheckpoint("FLUX.1-dev.safetensors"), "flux");
  });

  it("defaults to standard KSampler settings otherwise", () => {
    assert.equal(comfyWorkflowKindFromCheckpoint("sd_xl_base.safetensors"), "standard");
  });
});

describe("parseComfyUiDimensions", () => {
  it("parses WxH and clamps invalid input to 1024²", () => {
    assert.deepEqual(parseComfyUiDimensions("512x768"), { width: 512, height: 768 });
    assert.deepEqual(parseComfyUiDimensions("not-a-size"), { width: 1024, height: 1024 });
  });
});

describe("extractCheckpointNames", () => {
  it("reads CheckpointLoaderSimple ckpt_name list shape", () => {
    const names = extractCheckpointNames({
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [["a.safetensors", "b.safetensors"], {}],
          },
        },
      },
    });
    assert.deepEqual(names, ["a.safetensors", "b.safetensors"]);
  });

  it("reads ckpt_name from input.optional when required is absent", () => {
    const names = extractCheckpointNames({
      CheckpointLoaderSimple: {
        input: {
          optional: {
            ckpt_name: [["only.safetensors"], {}],
          },
        },
      },
    });
    assert.deepEqual(names, ["only.safetensors"]);
  });

  it("merges names from every node that exposes ckpt_name", () => {
    const names = extractCheckpointNames({
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [["shared.safetensors"], {}],
          },
        },
      },
      SomethingElseWithCkpt: {
        input: {
          required: {
            ckpt_name: [["extra.safetensors"], {}],
          },
        },
      },
    });
    assert.deepEqual(names, ["extra.safetensors", "shared.safetensors"]);
  });

  it("unwraps COMBO widget metadata (not a checkpoint filename)", () => {
    const names = extractCheckpointNames({
      CheckpointLoaderSimple: {
        input: {
          required: {
            ckpt_name: [["COMBO", ["real.safetensors", "other.safetensors"]], {}],
          },
        },
      },
    });
    assert.deepEqual(names, ["other.safetensors", "real.safetensors"]);
  });

  it("does not treat COMBO as a filename in flat lists", () => {
    const names = extractCheckpointNames({
      WeirdNode: {
        input: {
          required: {
            ckpt_name: [["COMBO", "mixed.safetensors"], {}],
          },
        },
      },
    });
    assert.deepEqual(names, ["mixed.safetensors"]);
  });
});

describe("buildTxt2ImgWorkflow", () => {
  it("wires checkpoint + latent dimensions into a minimal graph", () => {
    const g = buildTxt2ImgWorkflow({
      checkpointName: "model.safetensors",
      positive: "cat",
      negative: "",
      width: 768,
      height: 512,
      kind: "standard",
    });
    const loader = g["4"] as { inputs?: { ckpt_name?: string } };
    const latent = g["5"] as { inputs?: { width?: number; height?: number } };
    assert.equal(loader.inputs?.ckpt_name, "model.safetensors");
    assert.equal(latent.inputs?.width, 768);
    assert.equal(latent.inputs?.height, 512);
  });
});

describe("parseComfyUiUserdataWorkflowFileToApiGraph", () => {
  it("unwraps { prompt: { … } } API export", () => {
    const inner = { "6": { class_type: "CLIPTextEncode", inputs: { text: "x", clip: ["4", 1] } } };
    const g = parseComfyUiUserdataWorkflowFileToApiGraph(JSON.stringify({ prompt: inner }));
    assert.ok(g["6"]);
  });

  it("rejects ambiguous or empty graph-editor shells", () => {
    assert.throws(
      () => parseComfyUiUserdataWorkflowFileToApiGraph(JSON.stringify({ nodes: [] })),
      /not a usable ComfyUI graph/
    );
  });
});

describe("inferComfyUiWorkflowPatchMap", () => {
  it("finds CLIP positive + latent size on a minimal txt2img graph", () => {
    const wf = buildTxt2ImgWorkflow({
      checkpointName: "m.safetensors",
      positive: "p",
      negative: "n",
      width: 512,
      height: 768,
      kind: "standard",
    });
    const patch = inferComfyUiWorkflowPatchMap(wf);
    assert.equal(patch.positivePrompt.nodeId, "6");
    assert.equal(patch.positivePrompt.inputKey, "text");
    assert.ok(patch.width && patch.height);
  });
});

describe("extractFirstOutputImageFromComfyHistoryJson", () => {
  const pid = "abc-123";

  it("reads standard Comfy wrap { [prompt_id]: { outputs } }", () => {
    const img = extractFirstOutputImageFromComfyHistoryJson(
      {
        [pid]: {
          outputs: {
            "9": {
              images: [{ filename: "out_00001_.png", subfolder: "", type: "output" }],
            },
          },
        },
      },
      pid,
      null
    );
    assert.ok(img);
    assert.equal(img!.filename, "out_00001_.png");
  });

  it("uses promptId to pick the right entry when multiple keys exist", () => {
    const img = extractFirstOutputImageFromComfyHistoryJson(
      {
        "other-prompt": {
          outputs: {
            "1": {
              images: [{ filename: "wrong.png", subfolder: "", type: "output" }],
            },
          },
        },
        [pid]: {
          outputs: {
            "2": {
              images: [{ filename: "right.png", subfolder: "", type: "output" }],
            },
          },
        },
      },
      pid,
      null
    );
    assert.ok(img);
    assert.equal(img!.filename, "right.png");
  });

  it("unwraps nested ui.images (extension / cached UI shapes)", () => {
    const img = extractFirstOutputImageFromComfyHistoryJson(
      {
        [pid]: {
          outputs: {
            "12": {
              ui: {
                images: [{ filename: "nested.png", subfolder: "s", type: "output" }],
              },
            },
          },
        },
      },
      pid,
      null
    );
    assert.ok(img);
    assert.equal(img!.filename, "nested.png");
    assert.equal(img!.subfolder, "s");
  });

  it("accepts a bare history entry with top-level outputs", () => {
    const img = extractFirstOutputImageFromComfyHistoryJson(
      {
        outputs: {
          "3": {
            images: [{ filename: "bare.png", subfolder: "", type: "temp" }],
          },
        },
        status: {},
      } as Record<string, unknown>,
      pid,
      null
    );
    assert.ok(img);
    assert.equal(img!.filename, "bare.png");
    assert.equal(img!.type, "temp");
  });

  it("normalizes a single image object (non-array) from Comfy", () => {
    const img = extractFirstOutputImageFromComfyHistoryJson(
      {
        [pid]: {
          outputs: {
            "9": {
              images: { filename: "single.png", subfolder: "", type: "output" } as unknown,
            },
          },
        },
      },
      pid,
      null
    );
    assert.ok(img);
    assert.equal(img!.filename, "single.png");
  });

  it("unwraps nested output.images", () => {
    const img = extractFirstOutputImageFromComfyHistoryJson(
      {
        [pid]: {
          outputs: {
            "12": {
              output: {
                images: [{ filename: "wrapped.png", subfolder: "", type: "output" }],
              },
            },
          },
        },
      },
      pid,
      null
    );
    assert.ok(img);
    assert.equal(img!.filename, "wrapped.png");
  });

  it("honors preferredOutputNodeId when present", () => {
    const img = extractFirstOutputImageFromComfyHistoryJson(
      {
        [pid]: {
          outputs: {
            "1": {
              images: [{ filename: "first.png", subfolder: "", type: "output" }],
            },
            "2": {
              images: [{ filename: "second.png", subfolder: "", type: "output" }],
            },
          },
        },
      },
      pid,
      "2"
    );
    assert.ok(img);
    assert.equal(img!.filename, "second.png");
  });
});

describe("applyComfyUiWorkflowRuntimePatches", () => {
  it("writes positive, negative, width, and height into mapped inputs", () => {
    const workflow = buildTxt2ImgWorkflow({
      checkpointName: "m.safetensors",
      positive: "old-pos",
      negative: "old-neg",
      width: 256,
      height: 256,
      kind: "standard",
    });
    applyComfyUiWorkflowRuntimePatches({
      workflow,
      patch: {
        positivePrompt: { nodeId: "6", inputKey: "text" },
        negativePrompt: { nodeId: "7", inputKey: "text" },
        width: { nodeId: "5", inputKey: "width" },
        height: { nodeId: "5", inputKey: "height" },
      },
      positive: "new-pos",
      negative: "new-neg",
      width: 888,
      height: 777,
    });
    const pos = workflow["6"] as { inputs?: { text?: string } };
    const neg = workflow["7"] as { inputs?: { text?: string } };
    const latent = workflow["5"] as { inputs?: { width?: number; height?: number } };
    assert.equal(pos.inputs?.text, "new-pos");
    assert.equal(neg.inputs?.text, "new-neg");
    assert.equal(latent.inputs?.width, 888);
    assert.equal(latent.inputs?.height, 777);
  });
});

describe("randomizeComfyUiWorkflowSeedInputs", () => {
  it("replaces fixed numeric seed-like inputs with new values", () => {
    const workflow: Record<string, unknown> = {
      "1": {
        class_type: "KSampler",
        inputs: {
          seed: 12345,
          steps: 20,
        },
      },
      "2": {
        class_type: "RandomNoise",
        inputs: {
          noise_seed: "999",
        },
      },
      "3": {
        class_type: "OtherNode",
        inputs: {
          scheduler: "normal",
          note: "keep-me",
        },
      },
    };
    randomizeComfyUiWorkflowSeedInputs(workflow);
    const sampler = workflow["1"] as { inputs: { seed: number; steps: number } };
    const noise = workflow["2"] as { inputs: { noise_seed: string } };
    const other = workflow["3"] as { inputs: { scheduler: string; note: string } };
    assert.equal(typeof sampler.inputs.seed, "number");
    assert.notEqual(sampler.inputs.seed, 12345);
    assert.match(noise.inputs.noise_seed, /^\d+$/);
    assert.notEqual(noise.inputs.noise_seed, "999");
    assert.equal(other.inputs.scheduler, "normal");
    assert.equal(other.inputs.note, "keep-me");
  });
});
