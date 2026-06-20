/**
 * ComfyUI workflow bindings for Prism image generation:
 * - Inline API graphs (`comfyui-workflow:<id>`) saved in the account, or
 * - Patch-only bindings for graphs that live on the ComfyUI machine (`remotePath`),
 *   listed at runtime via ComfyUI userdata APIs (`comfyui-remote:<urlencoded path>`).
 *
 * Runtime fields (prompt, size) are injected via an explicit patch map (or a
 * small heuristic when no patch is stored for a remote file).
 */

/** Prism image-picker id prefix for user-registered inline API workflows. */
export const COMFYUI_WORKFLOW_MODEL_PREFIX = "comfyui-workflow:";

/** Prism image-picker id prefix for JSON files under ComfyUI user data (userdata). */
export const COMFYUI_REMOTE_WORKFLOW_PREFIX = "comfyui-remote:";

/** Max workflows / bindings per account (SQLite row size guardrail). */
export const MAX_COMFY_UI_WORKFLOW_REGISTRATIONS = 24;

/** Total serialized JSON size cap for the entire stored workflow list. */
export const MAX_COMFY_UI_WORKFLOWS_STORED_JSON_BYTES = 400_000;

const WORKFLOW_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/u;

export interface ComfyUiWorkflowInputRef {
  nodeId: string;
  inputKey: string;
}

export interface ComfyUiWorkflowPatchMap {
  positivePrompt: ComfyUiWorkflowInputRef;
  negativePrompt?: ComfyUiWorkflowInputRef;
  width?: ComfyUiWorkflowInputRef;
  height?: ComfyUiWorkflowInputRef;
  /** Prefer images from this node's `outputs` entry in `/history` (e.g. SaveImage). */
  outputNodeId?: string;
}

export interface ComfyUiWorkflowRegistration {
  /** Stable slug for this row (used with `comfyui-workflow:<id>` when no remotePath). */
  id: string;
  /** Human label for pickers / Settings. */
  label: string;
  /**
   * When set, the graph is read from ComfyUI userdata at this path (relative to the
   * ComfyUI user root, e.g. `default/workflows/foo.json`). `workflow` is then optional.
   */
  remotePath?: string;
  /** Inline API graph when not using `remotePath`. */
  workflow?: Record<string, unknown>;
  patch: ComfyUiWorkflowPatchMap;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function readInputRef(raw: unknown, field: string): ComfyUiWorkflowInputRef {
  if (!raw || typeof raw !== "object") {
    throw new Error(`ComfyUI workflow patch.${field} must be an object with nodeId and inputKey.`);
  }
  const o = raw as Record<string, unknown>;
  const nodeId = typeof o.nodeId === "string" ? o.nodeId.trim() : "";
  const inputKey = typeof o.inputKey === "string" ? o.inputKey.trim() : "";
  if (!nodeId || !inputKey) {
    throw new Error(`ComfyUI workflow patch.${field} needs non-empty nodeId and inputKey.`);
  }
  return { nodeId, inputKey };
}

function readOptionalInputRef(raw: unknown, field: string): ComfyUiWorkflowInputRef | undefined {
  if (raw === undefined || raw === null) return undefined;
  return readInputRef(raw, field);
}

export function isComfyUiApiWorkflowNode(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o.class_type === "string" &&
    o.class_type.trim().length > 0 &&
    typeof o.inputs === "object" &&
    o.inputs !== null
  );
}

function looksLikeApiWorkflowGraph(obj: Record<string, unknown>): boolean {
  const vals = Object.values(obj);
  if (vals.length === 0) return false;
  return vals.some((v) => isComfyUiApiWorkflowNode(v));
}

function assertWorkflowGraphShape(workflow: Record<string, unknown>): void {
  const keys = Object.keys(workflow);
  if (keys.length === 0) {
    throw new Error("ComfyUI workflow JSON must contain at least one node.");
  }
  for (const key of keys) {
    const node = workflow[key];
    if (!isComfyUiApiWorkflowNode(node)) {
      throw new Error(
        `ComfyUI workflow node "${key}" is invalid — each node needs class_type and inputs (API export format).`
      );
    }
  }
}

function assertPatchTargetsExist(workflow: Record<string, unknown>, patch: ComfyUiWorkflowPatchMap): void {
  const check = (ref: ComfyUiWorkflowInputRef, label: string) => {
    const node = workflow[ref.nodeId];
    if (!isComfyUiApiWorkflowNode(node)) {
      throw new Error(`ComfyUI workflow patch ${label} points to missing node "${ref.nodeId}".`);
    }
    const inputs = node.inputs as Record<string, unknown>;
    if (!(ref.inputKey in inputs)) {
      throw new Error(
        `ComfyUI workflow patch ${label}: node "${ref.nodeId}" has no input "${ref.inputKey}".`
      );
    }
  };
  check(patch.positivePrompt, "positivePrompt");
  if (patch.negativePrompt) check(patch.negativePrompt, "negativePrompt");
  if (patch.width) check(patch.width, "width");
  if (patch.height) check(patch.height, "height");
  if (patch.outputNodeId !== undefined) {
    const id = typeof patch.outputNodeId === "string" ? patch.outputNodeId.trim() : "";
    if (id.length > 0 && !isComfyUiApiWorkflowNode(workflow[id])) {
      throw new Error(`ComfyUI workflow patch outputNodeId "${id}" is not a valid node id in this workflow.`);
    }
  }
}

/** Rejects path traversal and absolute paths for userdata-relative paths. */
export function assertSafeUserdataRelativePath(raw: string): string {
  const t = raw.trim().replace(/\\/g, "/");
  if (t.length === 0) throw new Error("remotePath must be non-empty.");
  if (t.startsWith("/") || /^[a-zA-Z]:/.test(t)) {
    throw new Error("remotePath must be relative to ComfyUI user data (no leading slash or drive letter).");
  }
  const segments = t.split("/");
  if (segments.some((s) => s === "..")) {
    throw new Error('remotePath must not contain ".." segments.');
  }
  return t;
}

function readPatchMap(o: Record<string, unknown>, idForErrors: string): ComfyUiWorkflowPatchMap {
  if (!o.patch || typeof o.patch !== "object" || Array.isArray(o.patch)) {
    throw new Error(`ComfyUI workflow "${idForErrors}" must include a patch object.`);
  }
  const p = o.patch as Record<string, unknown>;
  const patch: ComfyUiWorkflowPatchMap = {
    positivePrompt: readInputRef(p.positivePrompt, "positivePrompt"),
    negativePrompt: readOptionalInputRef(p.negativePrompt, "negativePrompt"),
    width: readOptionalInputRef(p.width, "width"),
    height: readOptionalInputRef(p.height, "height"),
  };
  if (p.outputNodeId !== undefined && p.outputNodeId !== null) {
    if (typeof p.outputNodeId !== "string" || p.outputNodeId.trim().length === 0) {
      throw new Error(`ComfyUI workflow "${idForErrors}": outputNodeId must be a non-empty string when set.`);
    }
    patch.outputNodeId = p.outputNodeId.trim();
  }
  return patch;
}

function normalizeSingleRegistration(raw: unknown): ComfyUiWorkflowRegistration {
  if (!raw || typeof raw !== "object") {
    throw new Error("Each ComfyUI workflow entry must be an object.");
  }
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  const labelRaw = typeof o.label === "string" ? o.label.trim() : "";
  const label = labelRaw.length > 0 ? labelRaw.slice(0, 120) : id;
  if (!WORKFLOW_ID_PATTERN.test(id)) {
    throw new Error(
      "Each ComfyUI workflow needs an id of 1–64 characters: letters, digits, underscore, or hyphen (must start with alphanumeric)."
    );
  }

  const remotePathRaw = typeof o.remotePath === "string" ? o.remotePath.trim() : "";
  const remotePath = remotePathRaw.length > 0 ? assertSafeUserdataRelativePath(remotePathRaw) : undefined;

  const patch = readPatchMap(o, id);

  if (remotePath) {
    return { id, label, remotePath, patch };
  }

  if (!o.workflow || typeof o.workflow !== "object" || Array.isArray(o.workflow)) {
    throw new Error(`ComfyUI workflow "${id}" must include either remotePath or a workflow object (API graph).`);
  }
  const workflow = o.workflow as Record<string, unknown>;
  assertWorkflowGraphShape(workflow);
  assertPatchTargetsExist(workflow, patch);
  return { id, label, workflow, patch };
}

/**
 * Validates and normalizes the `comfyUiWorkflows` array from PATCH /api/settings.
 * Call only when the client sent the field; otherwise keep the current list server-side.
 */
export function validateComfyUiWorkflowsPayload(value: unknown): ComfyUiWorkflowRegistration[] {
  if (!Array.isArray(value)) {
    throw new Error("comfyUiWorkflows must be an array.");
  }
  if (value.length > MAX_COMFY_UI_WORKFLOW_REGISTRATIONS) {
    throw new Error(`You can save at most ${MAX_COMFY_UI_WORKFLOW_REGISTRATIONS} ComfyUI workflows.`);
  }
  const seen = new Set<string>();
  const out: ComfyUiWorkflowRegistration[] = [];
  for (const item of value) {
    const reg = normalizeSingleRegistration(item);
    if (seen.has(reg.id)) {
      throw new Error(`Duplicate ComfyUI workflow id "${reg.id}".`);
    }
    seen.add(reg.id);
    out.push(reg);
  }
  const serialized = JSON.stringify(out);
  if (new TextEncoder().encode(serialized).length > MAX_COMFY_UI_WORKFLOWS_STORED_JSON_BYTES) {
    throw new Error("Saved ComfyUI workflows are too large — remove a workflow or shorten the JSON.");
  }
  return out;
}

/**
 * Lenient parse for DB reads — invalid rows are skipped so a bad migration cannot brick login.
 */
export function parseStoredComfyUiWorkflows(raw: string | null | undefined): ComfyUiWorkflowRegistration[] {
  if (!isNonEmptyString(raw)) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ComfyUiWorkflowRegistration[] = [];
  const seen = new Set<string>();
  for (const item of parsed) {
    try {
      const reg = normalizeSingleRegistration(item);
      if (seen.has(reg.id)) continue;
      seen.add(reg.id);
      out.push(reg);
      if (out.length >= MAX_COMFY_UI_WORKFLOW_REGISTRATIONS) break;
    } catch {
      continue;
    }
  }
  return out;
}

export function encodeComfyUiWorkflowModelId(slug: string): string {
  return `${COMFYUI_WORKFLOW_MODEL_PREFIX}${slug.trim()}`;
}

/** Returns workflow slug when `id` uses {@link COMFYUI_WORKFLOW_MODEL_PREFIX}. */
export function parseComfyUiWorkflowSlug(id: string): string | null {
  const t = id.trim();
  if (!t.startsWith(COMFYUI_WORKFLOW_MODEL_PREFIX)) return null;
  const rest = t.slice(COMFYUI_WORKFLOW_MODEL_PREFIX.length).trim();
  return rest.length > 0 ? rest : null;
}

export function isComfyUiWorkflowModelId(id: string): boolean {
  return parseComfyUiWorkflowSlug(id) !== null;
}

export function encodeComfyUiRemoteWorkflowModelId(relativePath: string): string {
  return `${COMFYUI_REMOTE_WORKFLOW_PREFIX}${encodeURIComponent(assertSafeUserdataRelativePath(relativePath))}`;
}

export function formatComfyUiRemoteWorkflowLabel(relativePath: string): string {
  const normalized = relativePath.trim().replace(/\\/g, "/");
  const withoutWorkflowFolders = normalized
    .replace(/^(?:default\/)?workflows?\//i, "")
    .replace(/\/workflows?\//gi, "/");
  const label = withoutWorkflowFolders
    .split("/")
    .filter((segment) => segment.length > 0)
    .join("/");
  return label || normalized || "Workflow";
}

/** Returns userdata-relative path when `id` uses {@link COMFYUI_REMOTE_WORKFLOW_PREFIX}. */
export function parseComfyUiRemoteWorkflowPath(id: string): string | null {
  const t = id.trim();
  if (!t.startsWith(COMFYUI_REMOTE_WORKFLOW_PREFIX)) return null;
  const enc = t.slice(COMFYUI_REMOTE_WORKFLOW_PREFIX.length).trim();
  if (!enc) return null;
  try {
    return assertSafeUserdataRelativePath(decodeURIComponent(enc));
  } catch {
    return null;
  }
}

export function isComfyUiRemoteWorkflowModelId(id: string): boolean {
  return parseComfyUiRemoteWorkflowPath(id) !== null;
}

export function findComfyUiWorkflowRegistration(
  registrations: readonly ComfyUiWorkflowRegistration[],
  slug: string
): ComfyUiWorkflowRegistration | undefined {
  const key = slug.trim();
  return registrations.find((r) => r.id === key);
}

/** Returns a saved binding whose `remotePath` matches a ComfyUI userdata file path. */
export function findComfyUiWorkflowBindingByRemotePath(
  registrations: readonly ComfyUiWorkflowRegistration[],
  remotePath: string
): ComfyUiWorkflowRegistration | undefined {
  let safe: string;
  try {
    safe = assertSafeUserdataRelativePath(remotePath);
  } catch {
    return undefined;
  }
  return registrations.find((r) => (r.remotePath?.trim() ?? "") === safe);
}
