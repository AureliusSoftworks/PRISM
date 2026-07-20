type FetchLike = typeof fetch;

const ELEVENLABS_SUBSCRIPTION_URL =
  "https://api.elevenlabs.io/v1/user/subscription";
const ELEVENLABS_SUBSCRIPTION_TIMEOUT_MS = 10_000;

interface ElevenLabsSubscriptionPayload {
  tier?: unknown;
  status?: unknown;
  character_count?: unknown;
  character_limit?: unknown;
  next_character_count_reset_unix?: unknown;
}

export interface ElevenLabsCreditBalance {
  usedCredits: number;
  totalCredits: number;
  remainingCredits: number;
  resetAt: string | null;
  tier: string | null;
  status: string | null;
  checkedAt: string;
}

export class ElevenLabsSubscriptionError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ElevenLabsSubscriptionError";
    this.status = status;
  }
}

function creditCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function resetAtFromUnix(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const seconds = creditCount(value);
  if (seconds === null) return null;
  const resetAt = new Date(seconds * 1_000);
  return Number.isNaN(resetAt.getTime()) ? null : resetAt.toISOString();
}

async function subscriptionPayload(
  response: Response,
): Promise<ElevenLabsSubscriptionPayload> {
  try {
    return (await response.json()) as ElevenLabsSubscriptionPayload;
  } catch {
    throw new ElevenLabsSubscriptionError(
      502,
      "ElevenLabs returned an unreadable subscription response.",
    );
  }
}

export async function getElevenLabsCreditBalance(
  apiKey: string,
  fetchImpl: FetchLike = fetch,
): Promise<ElevenLabsCreditBalance> {
  const key = apiKey.trim();
  if (!key) {
    throw new ElevenLabsSubscriptionError(
      409,
      "Save an ElevenLabs API key to this account before checking credits.",
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(ELEVENLABS_SUBSCRIPTION_URL, {
      method: "GET",
      cache: "no-store",
      headers: {
        accept: "application/json",
        "xi-api-key": key,
      },
      signal: AbortSignal.timeout(ELEVENLABS_SUBSCRIPTION_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    throw new ElevenLabsSubscriptionError(
      name === "TimeoutError" || name === "AbortError" ? 504 : 502,
      name === "TimeoutError" || name === "AbortError"
        ? "ElevenLabs credit check timed out."
        : "ElevenLabs could not be reached for a credit check.",
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ElevenLabsSubscriptionError(
        401,
        "ElevenLabs rejected the saved API key.",
      );
    }
    if (response.status === 403) {
      throw new ElevenLabsSubscriptionError(
        403,
        "This ElevenLabs key cannot access subscription details. Update its permissions in ElevenLabs, then try again.",
      );
    }
    if (response.status === 429) {
      throw new ElevenLabsSubscriptionError(
        429,
        "ElevenLabs is receiving too many credit checks. Try again shortly.",
      );
    }
    throw new ElevenLabsSubscriptionError(
      502,
      `ElevenLabs credit check failed (${response.status}).`,
    );
  }

  const payload = await subscriptionPayload(response);
  const usedCredits = creditCount(payload.character_count);
  const totalCredits = creditCount(payload.character_limit);
  if (usedCredits === null || totalCredits === null) {
    throw new ElevenLabsSubscriptionError(
      502,
      "ElevenLabs did not return a usable credit balance.",
    );
  }

  return {
    usedCredits,
    totalCredits,
    remainingCredits: Math.max(0, totalCredits - usedCredits),
    resetAt: resetAtFromUnix(payload.next_character_count_reset_unix),
    tier: optionalText(payload.tier),
    status: optionalText(payload.status),
    checkedAt: new Date().toISOString(),
  };
}
