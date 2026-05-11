import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildTxt2ImgWorkflow,
  comfyWorkflowKindFromCheckpoint,
  extractCheckpointNames,
  parseComfyUiDimensions,
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
