type FetchLike = typeof fetch;

export type ApiKeyValidationProvider = "openai" | "anthropic" | "elevenlabs";

export interface ApiKeyValidationResult {
  valid: boolean;
  status?: number;
  detail?: string;
}

const API_KEY_VALIDATION_TIMEOUT_MS = 10_000;
const ANTHROPIC_API_VERSION = "2023-06-01";

function validationSignal(): AbortSignal {
  return AbortSignal.timeout(API_KEY_VALIDATION_TIMEOUT_MS);
}

function providerLabel(provider: ApiKeyValidationProvider): string {
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "ElevenLabs";
}

function validationRequest(provider: ApiKeyValidationProvider, apiKey: string): RequestInit & {
  url: string;
} {
  if (provider === "openai") {
    return {
      url: "https://api.openai.com/v1/models",
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      signal: validationSignal(),
    };
  }
  if (provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/models",
      method: "GET",
      headers: {
        accept: "application/json",
        "anthropic-version": ANTHROPIC_API_VERSION,
        "x-api-key": apiKey,
      },
      signal: validationSignal(),
    };
  }
  return {
    url: "https://api.elevenlabs.io/v1/models",
    method: "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "xi-api-key": apiKey,
    },
    signal: validationSignal(),
  };
}

async function readProviderErrorStatus(response: Response): Promise<string | null> {
  let raw = "";
  try {
    raw = await response.text();
  } catch {
    return null;
  }
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as {
      detail?: { status?: unknown; message?: unknown } | string;
      message?: unknown;
    };
    if (typeof parsed.detail === "object" && parsed.detail !== null) {
      if (typeof parsed.detail.status === "string") return parsed.detail.status;
      if (typeof parsed.detail.message === "string") return parsed.detail.message;
    }
    if (typeof parsed.detail === "string") return parsed.detail;
    if (typeof parsed.message === "string") return parsed.message;
  } catch {
    return raw.slice(0, 120);
  }
  return null;
}

export async function validateApiKeyCredential(
  provider: ApiKeyValidationProvider,
  apiKey: string,
  fetchImpl: FetchLike = fetch
): Promise<ApiKeyValidationResult> {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { valid: false, detail: "API key is empty." };
  }

  const request = validationRequest(provider, trimmed);
  try {
    const response = await fetchImpl(request.url, request);
    if (response.ok) {
      return { valid: true, status: response.status };
    }
    const errorStatus = await readProviderErrorStatus(response);
    if (provider === "elevenlabs" && errorStatus === "missing_permissions") {
      return {
        valid: true,
        status: response.status,
        detail:
          "ElevenLabs recognized this key, but it is scoped away from the validation probe.",
      };
    }
    const label = providerLabel(provider);
    const detail =
      response.status === 401 || response.status === 403
        ? `${label} rejected this key.`
        : `${label} validation failed (${response.status}).`;
    return { valid: false, status: response.status, detail };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      return {
        valid: false,
        detail: `${providerLabel(provider)} validation timed out.`,
      };
    }
    return {
      valid: false,
      detail: `${providerLabel(provider)} could not be reached.`,
    };
  }
}
