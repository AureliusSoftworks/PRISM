/**
 * ComfyUI HTTP API — checkpoint discovery and vanilla txt2img via `/prompt`.
 */
import { randomUUID } from "node:crypto";
import { HttpError } from "./utils.http.ts";
import {
  looksLikeBackendModelWarmupMessage,
  MODEL_TIMEOUT_USER_MESSAGE,
  MODEL_WARMUP_USER_MESSAGE,
} from "./image-warmup-heuristics.ts";

const POLL_INTERVAL_MS = 400;

/** Object-info / reachability checks for model lists; stalls like Ollama probes without a cap. */
const COMFY_OBJECT_INFO_FETCH_TIMEOUT_MS = 15_000;

/** Poll `/history` until output appears. First GPU load can exceed several minutes. */
function resolveComfyUiPollTimeoutMs(): number {
  const raw = process.env.COMFYUI_GENERATION_TIMEOUT_MS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    // Clamp so typos cannot hang forever — allow 2 min .. 30 min.
    if (n >= 120_000 && n <= 1_800_000) return n;
  }
  return 600_000;
}

const POLL_TIMEOUT_MS = resolveComfyUiPollTimeoutMs();

function abortError(): Error {
  const e = new Error("Request aborted");
  e.name = "AbortError";
  return e;
}

async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(abortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type ComfyUiWorkflowKind = "flux" | "standard";

/** Infer workflow family from checkpoint filename (Flux pipelines differ from SDXL/SD1.5 sampling defaults). */
export function comfyWorkflowKindFromCheckpoint(filename: string): ComfyUiWorkflowKind {
  return /flux/i.test(filename.trim()) ? "flux" : "standard";
}

export function parseComfyUiDimensions(size: string): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/u.exec(size.trim());
  if (m) {
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (
      Number.isFinite(width) &&
      Number.isFinite(height) &&
      width > 0 &&
      height > 0 &&
      width <= 4096 &&
      height <= 4096
    ) {
      return { width, height };
    }
  }
  return { width: 1024, height: 1024 };
}

/**
 * Reads checkpoint filenames from ComfyUI `/object_info` (see `extractCheckpointNames`).
 */
export async function fetchComfyUiCheckpointNames(baseUrl: string): Promise<string[]> {
  const base = baseUrl.replace(/\/$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}/object_info`, {
      signal: AbortSignal.timeout(COMFY_OBJECT_INFO_FETCH_TIMEOUT_MS),
    });
  } catch {
    return [];
  }
  if (!response.ok) {
    return [];
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return [];
  }
  return extractCheckpointNames(payload);
}

/**
 * ComfyUI marks dropdown widgets with a leading type tag. Newer `/object_info` shapes include
 * `[ "COMBO", [ "a.safetensors", ... ] ]` — the word COMBO is the widget kind, not a filename.
 */
const COMFY_WIDGET_KIND_STRINGS = new Set([
  "COMBO",
  "INT",
  "FLOAT",
  "STRING",
  "BOOLEAN",
]);

/** Parses ComfyUI widget metadata for `ckpt_name` (flat list or COMBO-wrapped list). */
function addNamesFromCkptWidget(ckpt: unknown, into: Set<string>): void {
  if (!Array.isArray(ckpt)) return;
  const slot = ckpt[0];
  if (Array.isArray(slot)) {
    // Shape: [ "COMBO", [ "checkpoint.safetensors", ... ] ]
    if (
      slot.length >= 2 &&
      typeof slot[0] === "string" &&
      COMFY_WIDGET_KIND_STRINGS.has(slot[0]) &&
      Array.isArray(slot[1])
    ) {
      for (const x of slot[1]) {
        if (typeof x === "string" && x.trim().length > 0) into.add(x.trim());
      }
      return;
    }
    for (const x of slot) {
      if (typeof x === "string" && x.trim().length > 0) {
        if (COMFY_WIDGET_KIND_STRINGS.has(x)) continue;
        into.add(x.trim());
      }
    }
    return;
  }
  if (typeof slot === "string" && slot.trim().length > 0) {
    if (!COMFY_WIDGET_KIND_STRINGS.has(slot)) into.add(slot.trim());
  }
}

/**
 * Collects checkpoint filenames from `/object_info` by scanning every node definition for
 * `ckpt_name` under `input.required` and `input.optional`. Custom builds may move the field
 * or wrap loaders differently than stock `CheckpointLoaderSimple`.
 */
export function extractCheckpointNames(objectInfo: unknown): string[] {
  if (!objectInfo || typeof objectInfo !== "object") return [];
  const root = objectInfo as Record<string, unknown>;
  const names = new Set<string>();

  for (const nodeDef of Object.values(root)) {
    if (!nodeDef || typeof nodeDef !== "object") continue;
    const input = (nodeDef as Record<string, unknown>).input;
    if (!input || typeof input !== "object") continue;
    const inp = input as Record<string, unknown>;
    for (const bucket of ["required", "optional"] as const) {
      const section = inp[bucket];
      if (!section || typeof section !== "object") continue;
      const ckpt = (section as Record<string, unknown>).ckpt_name;
      addNamesFromCkptWidget(ckpt, names);
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

export async function probeComfyUiHostReachable(baseUrl: string): Promise<boolean> {
  const base = baseUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${base}/object_info`, {
      method: "GET",
      signal: AbortSignal.timeout(COMFY_OBJECT_INFO_FETCH_TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function checkComfyUiHostStatus(
  host: string | null | undefined
): Promise<{ configured: boolean; reachable: boolean; modelCount: number }> {
  const trimmed = host?.trim();
  if (!trimmed) {
    return { configured: false, reachable: false, modelCount: 0 };
  }
  try {
    const names = await fetchComfyUiCheckpointNames(trimmed);
    const reachable = names.length > 0 || (await probeComfyUiHostReachable(trimmed));
    return {
      configured: true,
      reachable,
      modelCount: names.length,
    };
  } catch {
    return { configured: true, reachable: false, modelCount: 0 };
  }
}

/**
 * Builds a minimal API-format txt2img workflow (CheckpointLoaderSimple → KSampler → SaveImage).
 */
export function buildTxt2ImgWorkflow(options: {
  checkpointName: string;
  positive: string;
  negative: string;
  width: number;
  height: number;
  kind: ComfyUiWorkflowKind;
}): Record<string, unknown> {
  const seed = Math.floor(Math.random() * 0xffff_ffff);
  const steps = 20;
  const cfg = options.kind === "flux" ? 1 : 8;
  const scheduler = options.kind === "flux" ? "simple" : "normal";

  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg,
        sampler_name: "euler",
        scheduler,
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: {
        ckpt_name: options.checkpointName,
      },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: options.width,
        height: options.height,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: options.positive,
        clip: ["4", 1],
      },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: options.negative,
        clip: ["4", 1],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["3", 0],
        vae: ["4", 2],
      },
    },
    "9": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "PrismComfy",
        images: ["8", 0],
      },
    },
  };
}

interface ComfyHistoryEntry {
  outputs?: Record<
    string,
    {
      images?: Array<{ filename?: string; subfolder?: string; type?: string }>;
    }
  >;
}

function firstOutputImageFromHistory(historyPayload: Record<string, unknown>): {
  filename: string;
  subfolder: string;
  type: string;
} | null {
  const keys = Object.keys(historyPayload);
  if (keys.length === 0) return null;
  const entry = historyPayload[keys[0]] as ComfyHistoryEntry;
  const outputs = entry?.outputs;
  if (!outputs || typeof outputs !== "object") return null;
  for (const nodeId of Object.keys(outputs)) {
    const images = outputs[nodeId]?.images;
    if (!Array.isArray(images)) continue;
    for (const img of images) {
      const filename = typeof img.filename === "string" ? img.filename.trim() : "";
      if (!filename) continue;
      const subfolder = typeof img.subfolder === "string" ? img.subfolder : "";
      const type = typeof img.type === "string" ? img.type : "output";
      return { filename, subfolder, type };
    }
  }
  return null;
}

async function fetchHistorySnapshot(
  base: string,
  promptId: string,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  const response = await fetch(`${base}/history/${encodeURIComponent(promptId)}`, {
    signal,
  });
  if (!response.ok) return null;
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function waitForOutputImage(
  base: string,
  promptId: string,
  signal?: AbortSignal
): Promise<{ filename: string; subfolder: string; type: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortError();
    const snapshot = await fetchHistorySnapshot(base, promptId, signal);
    if (snapshot) {
      const img = firstOutputImageFromHistory(snapshot);
      if (img) return img;
    }
    await abortableSleep(POLL_INTERVAL_MS, signal);
  }
  throw new HttpError(503, MODEL_TIMEOUT_USER_MESSAGE);
}

async function fetchImageView(
  base: string,
  params: { filename: string; subfolder: string; type: string },
  signal?: AbortSignal
): Promise<Buffer> {
  const search = new URLSearchParams({
    filename: params.filename,
    type: params.type || "output",
  });
  if (params.subfolder && params.subfolder.trim().length > 0) {
    search.set("subfolder", params.subfolder);
  }
  const response = await fetch(`${base}/view?${search.toString()}`, { signal });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `ComfyUI could not load output image (${response.status}): ${errText.trim().slice(0, 400)}`
    );
  }
  const buf = Buffer.from(await response.arrayBuffer());
  return buf;
}

export async function generateImageWithComfyUi(options: {
  comfyUiHost: string;
  checkpointName: string;
  prompt: string;
  negativePrompt?: string;
  size: string;
  signal?: AbortSignal;
}): Promise<{ imageBytes: Buffer; modelUsed: string }> {
  const base = options.comfyUiHost.replace(/\/$/, "");
  const { width, height } = parseComfyUiDimensions(options.size);
  const kind = comfyWorkflowKindFromCheckpoint(options.checkpointName);
  const negative = options.negativePrompt?.trim() ?? "";

  const workflow = buildTxt2ImgWorkflow({
    checkpointName: options.checkpointName,
    positive: options.prompt,
    negative,
    width,
    height,
    kind,
  });

  const clientId = randomUUID();
  const promptResponse = await fetch(`${base}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: workflow,
      client_id: clientId,
    }),
    signal: options.signal,
  });

  const promptText = await promptResponse.text();
  let promptPayload: {
    prompt_id?: string;
    error?: { message?: string };
    node_errors?: Record<string, unknown>;
  };
  try {
    promptPayload = JSON.parse(promptText) as typeof promptPayload;
  } catch {
    throw new Error(
      `ComfyUI returned invalid JSON (${promptResponse.status}): ${promptText.trim().slice(0, 400)}`
    );
  }

  if (!promptResponse.ok) {
    const fromNodes = promptPayload.node_errors
      ? JSON.stringify(promptPayload.node_errors).slice(0, 500)
      : "";
    const detail =
      promptPayload.error?.message ?? (fromNodes || promptText.trim().slice(0, 400));
    if (looksLikeBackendModelWarmupMessage(detail)) {
      throw new HttpError(503, MODEL_WARMUP_USER_MESSAGE);
    }
    throw new Error(`ComfyUI prompt failed (${promptResponse.status}): ${detail}`);
  }

  if (promptPayload.node_errors && Object.keys(promptPayload.node_errors).length > 0) {
    const serialized = JSON.stringify(promptPayload.node_errors).slice(0, 600);
    if (looksLikeBackendModelWarmupMessage(serialized)) {
      throw new HttpError(503, MODEL_WARMUP_USER_MESSAGE);
    }
    throw new Error(`ComfyUI reported node errors: ${serialized}`);
  }

  const promptId = promptPayload.prompt_id?.trim();
  if (!promptId) {
    throw new Error("ComfyUI did not return a prompt_id.");
  }

  const outputRef = await waitForOutputImage(base, promptId, options.signal);
  const imageBytes = await fetchImageView(base, outputRef, options.signal);

  if (imageBytes.length === 0) {
    throw new Error("ComfyUI returned an empty image.");
  }

  return {
    imageBytes,
    modelUsed: `comfyui:${options.checkpointName.trim()}`,
  };
}
