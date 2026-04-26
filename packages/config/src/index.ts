function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

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

export interface AppConfig {
  apiPort: number;
  serverName: string;
  sessionCookieName: string;
  sessionTtlHours: number;
  encryptionMasterKey: string;
  ollamaHost: string;
  ollamaModel: string;
  openAiApiKey?: string;
  qdrantUrl: string;
}

export function getAppConfig(): AppConfig {
  return {
    apiPort: Number(process.env.API_PORT ?? "8787"),
    serverName: process.env.PRISM_SERVER_NAME ?? "Prism Server",
    sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "localai_session",
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS ?? "24"),
    encryptionMasterKey: readEnv(
      "ENCRYPTION_MASTER_KEY",
      "local-dev-master-key-change-me"
    ),
    ollamaHost: normalizeOllamaHost(process.env.OLLAMA_HOST),
    ollamaModel: process.env.OLLAMA_MODEL ?? "llama3.2",
    openAiApiKey: process.env.OPENAI_API_KEY,
    qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
  };
}
