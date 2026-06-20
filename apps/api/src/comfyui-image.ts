/**
 * ComfyUI HTTP API — checkpoint discovery and vanilla txt2img via `/prompt`,
 * plus user-registered API-format workflows with explicit prompt/size patch maps.
 */
import { randomUUID } from "node:crypto";
import type { ComfyUiWorkflowPatchMap, ComfyUiWorkflowRegistration } from "@localai/shared";
import {
  encodeComfyUiRemoteWorkflowModelId,
  encodeComfyUiWorkflowModelId,
  findComfyUiWorkflowBindingByRemotePath,
  isComfyUiApiWorkflowNode,
} from "@localai/shared";
import { HttpError } from "./utils.http.ts";
import {
  loadComfyUiDiskWorkflowAsApiGraph,
  parseComfyUiDiskWorkflowJson,
} from "./comfyui-ui-workflow-to-api.ts";
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
    const workflowPaths = await listComfyUiWorkflowJsonRelPaths(trimmed);
    const reachable =
      workflowPaths.length > 0 || (await probeComfyUiHostReachable(trimmed));
    return {
      configured: true,
      reachable,
      modelCount: workflowPaths.length,
    };
  } catch {
    return {
      configured: true,
      reachable: await probeComfyUiHostReachable(trimmed),
      modelCount: 0,
    };
  }
}

const USERDATA_FETCH_TIMEOUT_MS = 15_000;
const MAX_REMOTE_WORKFLOW_JSON_BYTES = 12_000_000;
const MAX_LISTED_WORKFLOW_FILES = 400;

export interface ComfyUiUserdataListEntry {
  name: string;
  path: string;
  type: "file" | "directory";
}

function isComfyUiSettingsJsonPath(nameOrPath: string): boolean {
  const basename = nameOrPath.replace(/\\/g, "/").split("/").pop()?.trim().toLowerCase();
  return basename === "comfy.settings.json";
}

async function comfyUiTryFetch(
  base: string,
  pathAndQuery: string,
  signal?: AbortSignal
): Promise<Response | null> {
  const b = base.replace(/\/$/, "");
  const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const candidates = [`${b}${p}`];
  if (!p.startsWith("/api/")) {
    candidates.push(`${b}/api${p}`);
  }
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "GET",
        signal: signal ?? AbortSignal.timeout(USERDATA_FETCH_TIMEOUT_MS),
      });
      if (res.ok) return res;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Lists one userdata directory using ComfyUI v1 or v2 userdata routes (tries `/api/…` and root paths).
 */
export async function fetchComfyUiUserdataDirectory(
  baseUrl: string,
  dirPath: string,
  signal?: AbortSignal
): Promise<ComfyUiUserdataListEntry[]> {
  const v2 = await comfyUiTryFetch(
    baseUrl,
    `/v2/userdata?${new URLSearchParams({ path: dirPath })}`,
    signal
  );
  if (v2) {
    try {
      const data = (await v2.json()) as unknown;
      if (!Array.isArray(data)) return [];
      const out: ComfyUiUserdataListEntry[] = [];
      for (const item of data) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const name = typeof o.name === "string" ? o.name : "";
        const path = typeof o.path === "string" ? o.path : "";
        const type = o.type === "file" || o.type === "directory" ? o.type : null;
        if (!name || !path || !type) continue;
        out.push({ name, path, type });
      }
      return out;
    } catch {
      return [];
    }
  }

  const v1 = await comfyUiTryFetch(
    baseUrl,
    `/userdata?${new URLSearchParams({
      dir: dirPath,
      recurse: "false",
      full_info: "true",
    })}`,
    signal
  );
  if (!v1) return [];
  try {
    const data = (await v1.json()) as unknown;
    if (!Array.isArray(data)) return [];
    const out: ComfyUiUserdataListEntry[] = [];
    for (const item of data) {
      if (typeof item === "string" && item.trim()) {
        const name = item.trim();
        const joinPath = dirPath.replace(/\/$/, "");
        out.push({
          name,
          path: joinPath.length > 0 ? `${joinPath}/${name}` : name,
          type: name.endsWith("/") ? "directory" : "file",
        });
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name : "";
      const path = typeof o.path === "string" ? o.path : "";
      const type = o.type === "file" || o.type === "directory" ? o.type : null;
      if (name && path && type) out.push({ name, path, type });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Recursively collects `.json` userdata paths that look like saved workflows.
 */
export async function listComfyUiWorkflowJsonRelPaths(
  baseUrl: string,
  signal?: AbortSignal
): Promise<string[]> {
  const roots = ["workflows", "default/workflows", ""];
  const out: string[] = [];
  const seen = new Set<string>();

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 12 || out.length >= MAX_LISTED_WORKFLOW_FILES) return;
    const entries = await fetchComfyUiUserdataDirectory(baseUrl, dir, signal);
    for (const e of entries) {
      if (e.type === "directory") {
        await walk(e.path, depth + 1);
      } else if (
        e.type === "file" &&
        /\.json$/i.test(e.name) &&
        !/\.pending\.json$/i.test(e.name) &&
        !isComfyUiSettingsJsonPath(e.name) &&
        !isComfyUiSettingsJsonPath(e.path)
      ) {
        if (!seen.has(e.path)) {
          seen.add(e.path);
          out.push(e.path);
        }
      }
    }
  }

  for (const r of roots) {
    await walk(r, 0);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export async function fetchComfyUiUserdataFileText(
  baseUrl: string,
  relativePath: string,
  signal?: AbortSignal
): Promise<string> {
  const enc = encodeURIComponent(relativePath);
  const res = await comfyUiTryFetch(baseUrl, `/userdata/${enc}`, signal);
  if (!res) {
    throw new Error(
      `Could not read workflow file from ComfyUI userdata ("${relativePath}"). Is this ComfyUI new enough to expose /userdata or /api/userdata?`
    );
  }
  const text = await res.text();
  if (new TextEncoder().encode(text).length > MAX_REMOTE_WORKFLOW_JSON_BYTES) {
    throw new Error("That ComfyUI workflow file is too large for Prism to load safely.");
  }
  return text;
}

/**
 * Parses a userdata workflow file that is **already** in API `/prompt` graph shape.
 * Graph-editor (litegraph) saves are rejected here — use {@link loadComfyUiDiskWorkflowAsApiGraph} at runtime.
 */
export function parseComfyUiUserdataWorkflowFileToApiGraph(jsonText: string): Record<string, unknown> {
  const parsed = parseComfyUiDiskWorkflowJson(jsonText);
  if (parsed.kind === "ui") {
    throw new Error(
      "That file is ComfyUI graph-editor JSON, not an API graph. Prism converts graph saves automatically when you run them — this helper only accepts API-format JSON."
    );
  }
  return parsed.graph;
}

/** Best-effort patch map for simple txt2img-style API graphs when no binding exists. */
export function inferComfyUiWorkflowPatchMap(workflow: Record<string, unknown>): ComfyUiWorkflowPatchMap {
  const clipEncodes: ComfyUiWorkflowPatchMap["positivePrompt"][] = [];
  const latentIds: string[] = [];
  let lastSaveImage: string | undefined;
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!isComfyUiApiWorkflowNode(node)) continue;
    const classType = String((node as { class_type?: unknown }).class_type ?? "").trim();
    if (classType === "CLIPTextEncode") {
      const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
      if (inputs && "text" in inputs) {
        clipEncodes.push({ nodeId, inputKey: "text" });
      }
    }
    if (classType === "EmptyLatentImage") {
      latentIds.push(nodeId);
    }
    if (classType === "SaveImage") {
      lastSaveImage = nodeId;
    }
  }
  if (clipEncodes.length < 1) {
    throw new Error(
      "Prism could not infer where to put the text prompt (no CLIPTextEncode with a `text` input). Try a simpler txt2img-style graph, or export the workflow in API format from ComfyUI and adjust node ids."
    );
  }
  const positivePrompt = clipEncodes[0]!;
  const negativePrompt = clipEncodes.length >= 2 ? clipEncodes[1] : undefined;
  const latent0 = latentIds[0];
  const width =
    latent0 !== undefined ? { nodeId: latent0, inputKey: "width" } : undefined;
  const height =
    latent0 !== undefined ? { nodeId: latent0, inputKey: "height" } : undefined;
  return {
    positivePrompt,
    negativePrompt,
    width,
    height,
    outputNodeId: lastSaveImage,
  };
}

function assertPatchAgainstWorkflow(
  workflow: Record<string, unknown>,
  patch: ComfyUiWorkflowPatchMap
): void {
  const check = (ref: ComfyUiWorkflowPatchMap["positivePrompt"], label: string) => {
    const node = workflow[ref.nodeId];
    if (!isComfyUiApiWorkflowNode(node)) {
      throw new Error(`Patch ${label} points to missing node "${ref.nodeId}".`);
    }
    const inputs = (node as { inputs: Record<string, unknown> }).inputs;
    if (!(ref.inputKey in inputs)) {
      throw new Error(`Patch ${label}: node "${ref.nodeId}" has no input "${ref.inputKey}".`);
    }
  };
  check(patch.positivePrompt, "positivePrompt");
  if (patch.negativePrompt) check(patch.negativePrompt, "negativePrompt");
  if (patch.width) check(patch.width, "width");
  if (patch.height) check(patch.height, "height");
}

/**
 * Loads a workflow JSON from ComfyUI userdata and prepares a runnable registration
 * (saved patch binding wins; otherwise Prism infers CLIP / latent / SaveImage wiring).
 */
export async function resolveComfyUiRemoteWorkflowForGeneration(options: {
  comfyUiHost: string;
  remotePath: string;
  bindings: readonly ComfyUiWorkflowRegistration[];
  signal?: AbortSignal;
}): Promise<{ registration: ComfyUiWorkflowRegistration; modelUsedTag: string }> {
  const text = await fetchComfyUiUserdataFileText(options.comfyUiHost, options.remotePath, options.signal);
  const workflow = await loadComfyUiDiskWorkflowAsApiGraph({
    baseUrl: options.comfyUiHost,
    jsonText: text,
    signal: options.signal,
  });
  const binding = findComfyUiWorkflowBindingByRemotePath(options.bindings, options.remotePath);
  const patch =
    binding !== undefined ? binding.patch : inferComfyUiWorkflowPatchMap(workflow);
  assertPatchAgainstWorkflow(workflow, patch);
  const modelUsedTag = encodeComfyUiRemoteWorkflowModelId(options.remotePath);
  const baseName =
    options.remotePath.split("/").pop()?.replace(/\.json$/i, "") ?? "workflow";
  return {
    registration: {
      id: binding?.id ?? baseName,
      label: binding?.label ?? baseName,
      workflow,
      patch,
    },
    modelUsedTag,
  };
}

export async function generateImageWithComfyUiRemoteUserdataWorkflow(options: {
  comfyUiHost: string;
  remotePath: string;
  bindings: readonly ComfyUiWorkflowRegistration[];
  prompt: string;
  negativePrompt?: string;
  size: string;
  signal?: AbortSignal;
}): Promise<{ imageBytes: Buffer; modelUsed: string }> {
  const resolved = await resolveComfyUiRemoteWorkflowForGeneration({
    comfyUiHost: options.comfyUiHost,
    remotePath: options.remotePath,
    bindings: options.bindings,
    signal: options.signal,
  });
  return generateImageWithComfyUiRegisteredWorkflow({
    comfyUiHost: options.comfyUiHost,
    registration: resolved.registration,
    prompt: options.prompt,
    negativePrompt: options.negativePrompt,
    size: options.size,
    signal: options.signal,
    modelUsedTag: resolved.modelUsedTag,
  });
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

type ComfyHistoryImageRef = {
  filename?: string;
  subfolder?: string;
  type?: string;
};

/**
 * Normalizes `images` from a Comfy `/history` output slot: arrays, or a single `{ filename }` object.
 */
function normalizeComfyHistoryImageList(images: unknown): ComfyHistoryImageRef[] | null {
  if (images === undefined || images === null) return null;
  if (Array.isArray(images)) return images as ComfyHistoryImageRef[];
  if (typeof images === "object") {
    const o = images as Record<string, unknown>;
    if (typeof o.filename === "string") return [o as ComfyHistoryImageRef];
  }
  return null;
}

/**
 * Stock ComfyUI stores `outputs[nodeId]` as `{ images: [...] }`. Some builds, cached UI, or
 * custom nodes nest the same list under `ui` / `output` — unwrap those so polling can fetch the file.
 */
function extractImageListFromHistoryOutputSlot(nodeOutput: unknown): ComfyHistoryImageRef[] | null {
  if (!nodeOutput || typeof nodeOutput !== "object") return null;
  const o = nodeOutput as Record<string, unknown>;
  const tryBucket = (images: unknown): ComfyHistoryImageRef[] | null => {
    const list = normalizeComfyHistoryImageList(images);
    return list && list.length > 0 ? list : null;
  };
  const direct = tryBucket(o.images);
  if (direct) return direct;
  const ui = o.ui;
  if (ui && typeof ui === "object") {
    const nested = tryBucket((ui as Record<string, unknown>).images);
    if (nested) return nested;
  }
  const output = o.output;
  if (output && typeof output === "object") {
    const nested = tryBucket((output as Record<string, unknown>).images);
    if (nested) return nested;
  }
  return null;
}

function resolveComfyHistoryOutputsMap(
  historyPayload: Record<string, unknown>,
  promptId: string
): Record<string, unknown> | null {
  const pid = promptId.trim();
  if (pid.length > 0) {
    const byId = historyPayload[pid];
    if (byId && typeof byId === "object") {
      const out = (byId as Record<string, unknown>).outputs;
      if (out && typeof out === "object") return out as Record<string, unknown>;
    }
  }
  const keys = Object.keys(historyPayload);
  if (keys.length === 1) {
    const only = historyPayload[keys[0]!];
    if (only && typeof only === "object") {
      const out = (only as Record<string, unknown>).outputs;
      if (out && typeof out === "object") return out as Record<string, unknown>;
    }
  }
  // Bare history entry (`{ outputs, status, … }`) — some proxies or forks omit the outer prompt id.
  const top = historyPayload.outputs;
  if (top && typeof top === "object") return top as Record<string, unknown>;
  return null;
}

function firstImageRefFromOutputsMap(
  outputs: Record<string, unknown>,
  nodeIdOrder: string[]
): { filename: string; subfolder: string; type: string } | null {
  for (const nodeId of nodeIdOrder) {
    const images = extractImageListFromHistoryOutputSlot(outputs[nodeId]);
    if (!images) continue;
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

/**
 * Finds the first image file reference in a `/history/{promptId}` (or equivalent) JSON payload.
 * Exported for unit tests and for diagnosing Comfy response-shape mismatches in the field.
 */
export function extractFirstOutputImageFromComfyHistoryJson(
  historyPayload: Record<string, unknown>,
  promptId: string,
  preferredOutputNodeId?: string | null
): { filename: string; subfolder: string; type: string } | null {
  const outputs = resolveComfyHistoryOutputsMap(historyPayload, promptId);
  if (!outputs) return null;
  const outKeys = Object.keys(outputs);
  const pref = preferredOutputNodeId?.trim() ?? "";
  const order =
    pref.length > 0 && outKeys.includes(pref)
      ? [pref, ...outKeys.filter((k) => k !== pref)]
      : outKeys;
  return firstImageRefFromOutputsMap(outputs, order);
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
  signal: AbortSignal | undefined,
  preferredOutputNodeId?: string | null
): Promise<{ filename: string; subfolder: string; type: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (signal?.aborted) throw abortError();
    const snapshot = await fetchHistorySnapshot(base, promptId, signal);
    if (snapshot) {
      const img = extractFirstOutputImageFromComfyHistoryJson(
        snapshot,
        promptId,
        preferredOutputNodeId
      );
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

export function cloneComfyUiApiWorkflow(workflow: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(workflow)) as Record<string, unknown>;
}

function generateComfyUiSeed(): number {
  return Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
}

/**
 * Many user workflows keep a static seed baked into sampler/noise nodes, which
 * yields the same image every run. Randomize those seed-like numeric inputs at
 * runtime so repeated requests vary naturally.
 */
export function randomizeComfyUiWorkflowSeedInputs(workflow: Record<string, unknown>): void {
  const seedLikeKey = /(^|_)(seed|noise_seed)$/i;
  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== "object") continue;
    const inputs = (node as { inputs?: unknown }).inputs;
    if (!inputs || typeof inputs !== "object") continue;
    const inputRecord = inputs as Record<string, unknown>;
    for (const [inputKey, value] of Object.entries(inputRecord)) {
      if (!seedLikeKey.test(inputKey)) continue;
      if (typeof value === "number" && Number.isFinite(value)) {
        inputRecord[inputKey] = generateComfyUiSeed();
        continue;
      }
      if (typeof value === "string" && /^\d+$/u.test(value.trim())) {
        inputRecord[inputKey] = String(generateComfyUiSeed());
      }
    }
  }
}

/**
 * Writes prompt / optional negative / dimensions into a cloned API workflow using
 * the user's patch map (node id + input key per field).
 */
export function applyComfyUiWorkflowRuntimePatches(options: {
  workflow: Record<string, unknown>;
  patch: ComfyUiWorkflowPatchMap;
  positive: string;
  negative: string;
  width: number;
  height: number;
}): void {
  const setInput = (nodeId: string, inputKey: string, value: unknown) => {
    const node = options.workflow[nodeId];
    if (!node || typeof node !== "object") {
      throw new Error(`ComfyUI workflow has no node "${nodeId}".`);
    }
    const inputs = (node as Record<string, unknown>).inputs;
    if (!inputs || typeof inputs !== "object") {
      throw new Error(`ComfyUI workflow node "${nodeId}" has no inputs object.`);
    }
    (inputs as Record<string, unknown>)[inputKey] = value;
  };
  const p = options.patch;
  setInput(p.positivePrompt.nodeId, p.positivePrompt.inputKey, options.positive);
  if (p.negativePrompt) {
    setInput(p.negativePrompt.nodeId, p.negativePrompt.inputKey, options.negative);
  }
  if (p.width) {
    setInput(p.width.nodeId, p.width.inputKey, options.width);
  }
  if (p.height) {
    setInput(p.height.nodeId, p.height.inputKey, options.height);
  }
}

function fillMissingDimensionPatchRefs(
  workflow: Record<string, unknown>,
  patch: ComfyUiWorkflowPatchMap
): ComfyUiWorkflowPatchMap {
  if (patch.width && patch.height) {
    return patch;
  }
  for (const [nodeId, node] of Object.entries(workflow)) {
    if (!isComfyUiApiWorkflowNode(node)) continue;
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs || typeof inputs !== "object") continue;
    const hasWidth = "width" in inputs;
    const hasHeight = "height" in inputs;
    if (!hasWidth && !hasHeight) continue;
    return {
      ...patch,
      width: patch.width ?? (hasWidth ? { nodeId, inputKey: "width" } : undefined),
      height: patch.height ?? (hasHeight ? { nodeId, inputKey: "height" } : undefined),
    };
  }
  return patch;
}

function formatComfyPromptFailureMessage(
  status: number,
  payload: {
    error?: { message?: string; details?: string; type?: string };
    node_errors?: Record<string, unknown>;
  },
  rawText: string
): string {
  const err = payload.error;
  const parts: string[] = [];
  const msg = typeof err?.message === "string" ? err.message.trim() : "";
  const details = typeof err?.details === "string" ? err.details.trim() : "";
  if (msg) parts.push(msg);
  if (details) parts.push(details);
  const ne = payload.node_errors;
  if (ne && typeof ne === "object" && Object.keys(ne).length > 0) {
    parts.push(JSON.stringify(ne).slice(0, 1800));
  }
  if (parts.length === 0 && rawText.trim()) {
    parts.push(rawText.trim().slice(0, 800));
  }
  return `ComfyUI prompt failed (${status}): ${parts.join(" — ")}`;
}

async function postComfyUiPromptAndReadImage(options: {
  base: string;
  workflow: Record<string, unknown>;
  signal?: AbortSignal;
  preferredOutputNodeId?: string | null;
  modelUsedTag: string;
}): Promise<{ imageBytes: Buffer; modelUsed: string }> {
  const clientId = randomUUID();
  const promptResponse = await fetch(`${options.base}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      prompt: options.workflow,
      client_id: clientId,
    }),
    signal: options.signal,
  });

  const promptText = await promptResponse.text();
  let promptPayload: {
    prompt_id?: string;
    error?: { message?: string; details?: string; type?: string };
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
    const detail = formatComfyPromptFailureMessage(promptResponse.status, promptPayload, promptText);
    if (looksLikeBackendModelWarmupMessage(detail)) {
      throw new HttpError(503, MODEL_WARMUP_USER_MESSAGE);
    }
    throw new Error(detail);
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

  const outputRef = await waitForOutputImage(
    options.base,
    promptId,
    options.signal,
    options.preferredOutputNodeId
  );
  const imageBytes = await fetchImageView(options.base, outputRef, options.signal);

  if (imageBytes.length === 0) {
    throw new Error("ComfyUI returned an empty image.");
  }

  return {
    imageBytes,
    modelUsed: options.modelUsedTag,
  };
}

export async function generateImageWithComfyUiRegisteredWorkflow(options: {
  comfyUiHost: string;
  registration: ComfyUiWorkflowRegistration;
  prompt: string;
  negativePrompt?: string;
  size: string;
  signal?: AbortSignal;
  /** When set (e.g. `comfyui-remote:…`), overrides the default `comfyui-workflow:<registration.id>` tag. */
  modelUsedTag?: string;
}): Promise<{ imageBytes: Buffer; modelUsed: string }> {
  const base = options.comfyUiHost.replace(/\/$/, "");
  const { width, height } = parseComfyUiDimensions(options.size);
  const wf = options.registration.workflow;
  if (!wf || typeof wf !== "object") {
    throw new Error("Internal error: workflow graph missing on registration.");
  }
  const workflow = cloneComfyUiApiWorkflow(wf as Record<string, unknown>);
  const runtimePatch = fillMissingDimensionPatchRefs(workflow, options.registration.patch);
  if (!runtimePatch.width || !runtimePatch.height) {
    console.warn(
      `[comfyui-image] workflow "${options.registration.label}" has no width/height patch mapping; requested size ${options.size} may be ignored by that graph.`
    );
  }
  applyComfyUiWorkflowRuntimePatches({
    workflow,
    patch: runtimePatch,
    positive: options.prompt,
    negative: options.negativePrompt?.trim() ?? "",
    width,
    height,
  });
  randomizeComfyUiWorkflowSeedInputs(workflow);
  const pref = runtimePatch.outputNodeId?.trim();
  const modelUsedTag =
    options.modelUsedTag?.trim() ?? encodeComfyUiWorkflowModelId(options.registration.id);
  return postComfyUiPromptAndReadImage({
    base,
    workflow,
    signal: options.signal,
    preferredOutputNodeId: pref && pref.length > 0 ? pref : null,
    modelUsedTag,
  });
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

  return postComfyUiPromptAndReadImage({
    base,
    workflow,
    signal: options.signal,
    preferredOutputNodeId: null,
    modelUsedTag: `comfyui:${options.checkpointName.trim()}`,
  });
}
