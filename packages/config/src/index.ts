function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function readBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";
const DEFAULT_QDRANT_URL = "http://127.0.0.1:6333";
/** Default ComfyUI listen address (used only when `COMFYUI_HOST` is unset). */
const DEFAULT_COMFYUI_HOST = "";

/**
 * Turn whatever value is in OLLAMA_HOST into a URL that `fetch()` can use.
 *
 * Common real-world inputs we should survive:
 *   - "localhost:11434"        -> "http://localhost:11434"      (no scheme)
 *   - "0.0.0.0:11434"          -> "http://127.0.0.1:11434"      (bind-all is
 *     valid as a listen address for Ollama itself but is not a valid client
 *     target on macOS / Windows; using it trips `fetch()` with
 *     "Failed to parse URL")
 *   - "http://localhost:11434/" -> "http://localhost:11434"     (trailing slash
 *     would produce "//api/chat" once we append paths)
 *   - Anything unparseable falls back to the default to avoid crashing.
 */
function normalizeOllamaHost(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) {
    return DEFAULT_OLLAMA_HOST;
  }

  let normalized = raw;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  normalized = normalized.replace(
    /\/\/0\.0\.0\.0(?=$|[:\/])/i,
    "//127.0.0.1"
  );
  normalized = normalized.replace(/\/+$/, "");

  try {
    // Final sanity check; throws for truly malformed inputs.
    new URL(normalized);
  } catch {
    console.warn(
      `OLLAMA_HOST value ${JSON.stringify(raw)} is not a valid URL; falling back to ${DEFAULT_OLLAMA_HOST}`
    );
    return DEFAULT_OLLAMA_HOST;
  }

  return normalized;
}

/**
 * Normalizes a Qdrant base URL for `fetch` (scheme, bind-all fix, no trailing slash).
 * Mirrors the Swift `QdrantURL` helper in PrismServer.
 */
function normalizeQdrantUrl(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) {
    return DEFAULT_QDRANT_URL;
  }

  let normalized = raw;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  normalized = normalized.replace(
    /\/\/0\.0\.0\.0(?=$|[:\/])/i,
    "//127.0.0.1"
  );
  normalized = normalized.replace(/\/+$/, "");

  try {
    new URL(normalized);
  } catch {
    console.warn(
      `QDRANT_URL value ${JSON.stringify(raw)} is not a valid URL; falling back to ${DEFAULT_QDRANT_URL}`
    );
    return DEFAULT_QDRANT_URL;
  }

  return normalized;
}

/**
 * Normalizes an optional ComfyUI base URL for `fetch()` (scheme, bind-all fix,
 * no trailing slash). Empty input stays empty (ComfyUI is optional per user).
 * Malformed values log a warning and return empty string.
 */
function normalizeComfyUiHost(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) {
    return DEFAULT_COMFYUI_HOST;
  }

  let normalized = raw;
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `http://${normalized}`;
  }
  normalized = normalized.replace(
    /\/\/0\.0\.0\.0(?=$|[:\/])/i,
    "//127.0.0.1"
  );
  normalized = normalized.replace(/\/+$/, "");

  try {
    new URL(normalized);
  } catch {
    console.warn(
      `COMFYUI_HOST value ${JSON.stringify(raw)} is not a valid URL; treating as unset`
    );
    return DEFAULT_COMFYUI_HOST;
  }

  return normalized;
}

export interface AppConfig {
  apiPort: number;
  serverName: string;
  /**
   * Whether other devices on the local network may reach this server. When
   * false (the default), services bind to loopback only and stay private to the
   * host machine. The API server overlays a persisted file value on top of this
   * env-derived default; see `resolveLanAccessEnabled` in the API layer.
   */
  lanAccessEnabled: boolean;
  /**
   * Opt-out for mDNS/Bonjour advertisement. Discovery only ever advertises when
   * `lanAccessEnabled` is also true, so this can never imply network exposure on
   * its own.
   */
  discoveryEnabled: boolean;
  sessionCookieName: string;
  sessionTtlHours: number;
  encryptionMasterKey: string;
  ollamaHost: string;
  ollamaModel: string;
  /** Single model id allowed for POST `/api/ollama/pull-primary` (default flux2-klein). */
  ollamaInAppPullModel: string;
  ollamaAuxiliaryModel: string;
  ollamaEmbeddingModel: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  elevenLabsApiKey?: string;
  braveSearchApiKey?: string;
  qdrantUrl: string;
  /** Optional default ComfyUI base URL from env (per-user setting overrides in practice). */
  comfyUiHost: string;
}

export function getAppConfig(): AppConfig {
  return {
    apiPort: Number(process.env.API_PORT ?? "18787"),
    serverName: process.env.PRISM_SERVER_NAME ?? "Prism Server",
    lanAccessEnabled: readBooleanEnv("PRISM_LAN_ACCESS", false),
    discoveryEnabled: readBooleanEnv("PRISM_DISCOVERY_ENABLED", true),
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "localai_session",
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? "24"),
    encryptionMasterKey: readEnv(
      "ENCRYPTION_MASTER_KEY",
      "local-dev-master-key-change-me"
    ),
    ollamaHost: normalizeOllamaHost(process.env.OLLAMA_HOST),
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
    ollamaInAppPullModel:
      process.env.OLLAMA_IN_APP_PULL_MODEL?.trim() || "flux2-klein",
    ollamaAuxiliaryModel: process.env.OLLAMA_AUXILIARY_MODEL ?? "llama3.2",
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text",
    openAiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    braveSearchApiKey:
      process.env.BRAVE_SEARCH_API_KEY ?? process.env.BRAVE_API_KEY,
    qdrantUrl: normalizeQdrantUrl(process.env.QDRANT_URL),
    comfyUiHost: normalizeComfyUiHost(process.env.COMFYUI_HOST),
  };
}

export { DEFAULT_QDRANT_URL, normalizeComfyUiHost, normalizeQdrantUrl };
