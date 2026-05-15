/**
 * Converts ComfyUI graph-editor (litegraph) workflow JSON into the flat API graph
 * shape required by POST `/prompt`. Prefers ComfyUI's optional `/workflow_to_prompt`
 * endpoint when present; otherwise uses `/object_info` widget metadata + link tables.
 */
import { isComfyUiApiWorkflowNode } from "@localai/shared";

const COMFY_POST_CONVERT_TIMEOUT_MS = 45_000;

const SKIP_NODE_TYPES = new Set([
  "Note",
  "Reroute",
  "PrimitiveNode",
  "MarkdownNote",
]);

const WIDGET_PRIMITIVE_TYPES = new Set(["INT", "FLOAT", "STRING", "BOOLEAN", "COMBO"]);

/** ComfyUI socket-style inputs are uppercase type tokens (MODEL, LATENT, …). */
function isSocketInputSpec(spec: unknown): boolean {
  if (!Array.isArray(spec) || spec.length < 1) return false;
  const t = spec[0];
  if (typeof t !== "string") return false;
  if (WIDGET_PRIMITIVE_TYPES.has(t)) return false;
  if (t === "*" || t === "COMBO") return false;
  return /^[A-Z][A-Z0-9_]*$/u.test(t);
}

function isUiWorkflowNodeShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const o = value as Record<string, unknown>;
  return typeof o.type === "string" && o.type.trim().length > 0 && ("id" in o);
}

export function diskJsonRootLooksLikeApiPromptGraph(root: Record<string, unknown>): boolean {
  const prompt = root.prompt;
  if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) {
    const inner = prompt as Record<string, unknown>;
    if (Object.keys(inner).length > 0) {
      return Object.values(inner).some((v) => isComfyUiApiWorkflowNode(v));
    }
  }
  const vals = Object.values(root);
  if (vals.length === 0) return false;
  return vals.some((v) => isComfyUiApiWorkflowNode(v));
}

export function diskJsonRootLooksLikeUiWorkflow(root: Record<string, unknown>): boolean {
  const nodes = root.nodes;
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  return isUiWorkflowNodeShape(nodes[0]);
}

export type ParsedComfyDiskWorkflow =
  | { kind: "api"; graph: Record<string, unknown> }
  | { kind: "ui"; root: Record<string, unknown> };

/**
 * Classifies userdata workflow JSON as either an API `/prompt` graph or a litegraph UI save.
 */
export function parseComfyUiDiskWorkflowJson(jsonText: string): ParsedComfyDiskWorkflow {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText) as unknown;
  } catch {
    throw new Error("ComfyUI returned invalid JSON for that workflow file.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Workflow file must contain a JSON object.");
  }
  const root = parsed as Record<string, unknown>;

  const wrapped = root.prompt;
  if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
    const inner = wrapped as Record<string, unknown>;
    if (Object.keys(inner).length > 0 && Object.values(inner).some((v) => isComfyUiApiWorkflowNode(v))) {
      return { kind: "api", graph: inner };
    }
  }

  if (diskJsonRootLooksLikeApiPromptGraph(root)) {
    if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
      return { kind: "api", graph: wrapped as Record<string, unknown> };
    }
    return { kind: "api", graph: root };
  }

  if (diskJsonRootLooksLikeUiWorkflow(root)) {
    return { kind: "ui", root };
  }

  throw new Error(
    "That workflow file is not a usable ComfyUI graph — it is neither API-format nor a recognized graph-editor save."
  );
}

async function comfyUiTryPostJson(
  baseUrl: string,
  pathAndQuery: string,
  body: string,
  signal?: AbortSignal
): Promise<Response | null> {
  const b = baseUrl.replace(/\/$/, "");
  const p = pathAndQuery.startsWith("/") ? pathAndQuery : `/${pathAndQuery}`;
  const candidates = [`${b}${p}`];
  if (!p.startsWith("/api/")) {
    candidates.push(`${b}/api${p}`);
  }
  const timeout = signal ?? AbortSignal.timeout(COMFY_POST_CONVERT_TIMEOUT_MS);
  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: timeout,
      });
      if (res.ok) return res;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Some ComfyUI builds expose POST `/workflow_to_prompt` with body = full UI workflow JSON.
 */
export async function tryComfyUiWorkflowToPromptEndpoint(
  baseUrl: string,
  uiRoot: Record<string, unknown>,
  signal?: AbortSignal
): Promise<Record<string, unknown> | null> {
  const body = JSON.stringify(uiRoot);
  for (const path of ["/workflow_to_prompt", "/api/workflow_to_prompt"]) {
    const res = await comfyUiTryPostJson(baseUrl, path, body, signal);
    if (!res) continue;
    try {
      const data = (await res.json()) as Record<string, unknown>;
      const prompt = data.prompt;
      if (prompt && typeof prompt === "object" && !Array.isArray(prompt)) {
        const g = prompt as Record<string, unknown>;
        if (Object.keys(g).length > 0) return g;
      }
    } catch {
      /* continue */
    }
  }
  return null;
}

type LinkRec = {
  id: number;
  origin_id: string;
  origin_slot: number;
  target_id: string;
  target_slot: number;
};

function normalizeLinks(raw: unknown): Map<number, LinkRec> {
  const m = new Map<number, LinkRec>();
  if (!Array.isArray(raw)) return m;
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 6) {
      const id = Number(item[0]);
      m.set(id, {
        id,
        origin_id: String(item[1]),
        origin_slot: Number(item[2]),
        target_id: String(item[3]),
        target_slot: Number(item[4]),
      });
      continue;
    }
    if (item && typeof item === "object" && !Array.isArray(item)) {
      const o = item as Record<string, unknown>;
      const id = Number(o.id);
      if (!Number.isFinite(id)) continue;
      m.set(id, {
        id,
        origin_id: String(o.origin_id ?? ""),
        origin_slot: Number(o.origin_slot ?? 0),
        target_id: String(o.target_id ?? ""),
        target_slot: Number(o.target_slot ?? 0),
      });
    }
  }
  return m;
}

function collectWidgetInputKeys(classType: string, objectInfo: Record<string, unknown>): string[] {
  const def = objectInfo[classType];
  if (!def || typeof def !== "object") return [];
  const input = (def as Record<string, unknown>).input;
  if (!input || typeof input !== "object") return [];
  const inp = input as Record<string, unknown>;
  const out: string[] = [];
  for (const bucket of ["required", "optional"] as const) {
    const section = inp[bucket];
    if (!section || typeof section !== "object") continue;
    for (const key of Object.keys(section as Record<string, unknown>)) {
      const spec = (section as Record<string, unknown>)[key];
      if (!isSocketInputSpec(spec)) {
        out.push(key);
      }
    }
  }
  return out;
}

function getInputSpecForKey(
  classType: string,
  inputKey: string,
  objectInfo: Record<string, unknown>
): unknown {
  const def = objectInfo[classType];
  if (!def || typeof def !== "object") return undefined;
  const input = (def as Record<string, unknown>).input;
  if (!input || typeof input !== "object") return undefined;
  const inp = input as Record<string, unknown>;
  for (const bucket of ["required", "optional"] as const) {
    const section = inp[bucket];
    if (!section || typeof section !== "object") continue;
    const sec = section as Record<string, unknown>;
    if (inputKey in sec) return sec[inputKey];
  }
  return undefined;
}

/** Comfy UI stores an extra widgets_values slot after INT seeds (randomize / fixed / …). */
function inputSpecHasControlAfterGenerate(spec: unknown): boolean {
  if (!Array.isArray(spec) || spec.length < 2) return false;
  const meta = spec[1];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return false;
  return (meta as Record<string, unknown>).control_after_generate === true;
}

function assignWidgetInputsSequential(
  classType: string,
  objectInfo: Record<string, unknown>,
  inputs: Record<string, unknown>,
  widgetKeys: string[],
  widgetValues: unknown[]
): void {
  let wi = 0;
  for (const key of widgetKeys) {
    if (key in inputs) continue;
    if (wi >= widgetValues.length) break;
    inputs[key] = widgetValues[wi];
    wi += 1;
    const spec = getInputSpecForKey(classType, key, objectInfo);
    if (inputSpecHasControlAfterGenerate(spec) && wi < widgetValues.length) {
      wi += 1;
    }
  }
}

/**
 * Best-effort UI → API conversion using ComfyUI `/object_info` (widget order + links).
 */
export function convertComfyUiUiWorkflowToApiPromptUsingObjectInfo(
  uiRoot: Record<string, unknown>,
  objectInfo: Record<string, unknown>
): Record<string, unknown> {
  const nodesRaw = uiRoot.nodes;
  if (!Array.isArray(nodesRaw) || nodesRaw.length === 0) {
    throw new Error("That ComfyUI workflow file has no nodes to run.");
  }
  const linkById = normalizeLinks(uiRoot.links);
  const out: Record<string, unknown> = {};

  for (const raw of nodesRaw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const node = raw as Record<string, unknown>;
    const mode = typeof node.mode === "number" ? node.mode : 0;
    if (mode === 2 || mode === 4) continue;

    const classType = typeof node.type === "string" ? node.type.trim() : "";
    if (!classType || SKIP_NODE_TYPES.has(classType)) continue;

    const nodeId = String(node.id ?? "").trim();
    if (!nodeId) continue;

    const inputs: Record<string, unknown> = {};

    const inputsList = Array.isArray(node.inputs) ? node.inputs : [];
    for (const slot of inputsList) {
      if (!slot || typeof slot !== "object" || Array.isArray(slot)) continue;
      const s = slot as Record<string, unknown>;
      const name = typeof s.name === "string" ? s.name : "";
      if (!name) continue;
      const linkId = s.link;
      if (typeof linkId === "number" && Number.isFinite(linkId)) {
        const L = linkById.get(linkId);
        if (L && L.target_id === nodeId) {
          inputs[name] = [L.origin_id, L.origin_slot];
        }
      }
    }

    const widgetKeys = collectWidgetInputKeys(classType, objectInfo);
    let wv = node.widgets_values;
    if (wv && typeof wv === "object" && !Array.isArray(wv)) {
      const o = wv as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        if (!(k in inputs)) inputs[k] = o[k];
      }
      wv = undefined;
    }
    const widgetValues = Array.isArray(wv) ? wv : [];
    assignWidgetInputsSequential(classType, objectInfo, inputs, widgetKeys, widgetValues);

    out[nodeId] = { class_type: classType, inputs };
  }

  if (Object.keys(out).length === 0) {
    throw new Error("Prism could not convert that graph-editor workflow into a runnable API graph.");
  }
  return out;
}

const COMFY_OBJECT_INFO_FETCH_TIMEOUT_MS = 15_000;

export async function fetchComfyUiObjectInfo(
  baseUrl: string,
  signal?: AbortSignal
): Promise<Record<string, unknown>> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/object_info`, {
    signal: signal ?? AbortSignal.timeout(COMFY_OBJECT_INFO_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(
      `ComfyUI /object_info returned ${res.status} — Prism needs it to turn graph-editor workflow files into API graphs.`
    );
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Resolves userdata workflow JSON to an API `/prompt` graph (API export, optional
 * `/workflow_to_prompt`, or litegraph + `/object_info` conversion).
 */
export async function loadComfyUiDiskWorkflowAsApiGraph(options: {
  baseUrl: string;
  jsonText: string;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const parsed = parseComfyUiDiskWorkflowJson(options.jsonText);
  if (parsed.kind === "api") {
    return parsed.graph;
  }
  const fromEp = await tryComfyUiWorkflowToPromptEndpoint(
    options.baseUrl,
    parsed.root,
    options.signal
  );
  if (fromEp) return fromEp;
  const objectInfo = await fetchComfyUiObjectInfo(options.baseUrl, options.signal);
  return convertComfyUiUiWorkflowToApiPromptUsingObjectInfo(parsed.root, objectInfo);
}
