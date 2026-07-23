import { normalizeSignalGenerationKeywords } from "./signal-generation-keywords.ts";

export const SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL = "eleven_text_to_sound_v2";
export const SIGNAL_ELEVENLABS_ATMOSPHERE_DURATION_MS = 30_000;
export const SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS = 450;
const SIGNAL_ATMOSPHERE_AUDIO_MAX_BYTES = 4 * 1024 * 1024;
export const COFFEE_ELEVENLABS_ACTION_SFX_MODEL = "eleven_text_to_sound_v2";
const COFFEE_ACTION_SFX_AUDIO_MAX_BYTES = 512 * 1024;
export const AVATAR_ELEVENLABS_SFX_MODEL = "eleven_text_to_sound_v2";
export const AVATAR_ELEVENLABS_SFX_DURATION_SECONDS = 4;
export const AVATAR_ELEVENLABS_SFX_PROMPT_MAX_CHARACTERS = 400;
export const SOUND_FX_BENCH_PROMPT_MAX_CHARACTERS = 450;
export const SOUND_FX_BENCH_DURATION_SECONDS = 1.2;
const AVATAR_ELEVENLABS_SFX_AUDIO_MAX_BYTES = 1024 * 1024;
const SOUND_FX_BENCH_AUDIO_MAX_BYTES = 1024 * 1024;

export const COFFEE_ELEVENLABS_ACTION_SFX = {
  cup_set_down: {
    durationSeconds: 0.8,
    prompt:
      "A small ceramic coffee mug is set gently onto a wooden cafe table: one soft rounded contact clink, close dry cafe foley, brief natural decay, warm low-mid tone.",
  },
  coffee_pour: {
    durationSeconds: 1.2,
    prompt:
      "A short gentle pour of coffee into a ceramic mug: a soft liquid stream, close warm cafe foley, rounded cup resonance, brief natural finish.",
  },
  spoon_stir: {
    durationSeconds: 1,
    prompt:
      "A small metal spoon stirs coffee in a ceramic mug: two light circular touches, close warm cafe foley, delicate ceramic resonance, brief natural finish.",
  },
  table_knock: {
    durationSeconds: 0.7,
    prompt:
      "Two soft knuckle taps on a wooden cafe table: muted tactile impacts, close dry cafe foley, warm low-mid body, brief natural decay.",
  },
} as const;

export type CoffeeElevenLabsActionSfxKind =
  keyof typeof COFFEE_ELEVENLABS_ACTION_SFX;

export function isCoffeeElevenLabsActionSfxKind(
  value: unknown,
): value is CoffeeElevenLabsActionSfxKind {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(COFFEE_ELEVENLABS_ACTION_SFX, value)
  );
}

export function buildCoffeeElevenLabsActionSfxPrompt(
  kind: CoffeeElevenLabsActionSfxKind,
): string {
  return COFFEE_ELEVENLABS_ACTION_SFX[kind].prompt;
}

export class ElevenLabsSoundError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ElevenLabsSoundError";
    this.status = status;
  }
}

export function buildSignalAtmospherePrompt(args: {
  showName: string;
  studioIdentity: string;
  keywords?: readonly string[];
}): string {
  const silentRoomQuestion =
    "What would it sound like in this room if one were completely silent?";
  const keywords = normalizeSignalGenerationKeywords(args.keywords);
  const keywordDirection = keywords.length
    ? ` Producer cues: ${keywords.join(", ")}.`
    : "";
  const directions = keywords.length
    ? "Seamless non-musical room-and-Foley loop unique to this studio. Let the producer cues shape its sparse material sounds while speech stays clear and the loop boundary stays smooth."
    : "Seamless non-musical room-and-Foley loop unique to this studio. Build a distinctive backing bed from warm low resonance, damped low mids, and several sparse sounds implied by its materials, objects, mechanisms, and setting. Keep highs faint, leave speech space, and smooth the loop boundary.";
  const studioPrefix = "Studio: ";
  const promptEnvelopeLength =
    silentRoomQuestion.length +
    1 +
    studioPrefix.length +
    2 +
    keywordDirection.length +
    directions.length;
  const studioIdentity = boundSignalAtmosphereText(
    cleanSignalAtmosphereStudioIdentity(
      args.studioIdentity.trim() ||
        args.showName.trim() ||
        "the finished studio",
    ),
    SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS - promptEnvelopeLength,
  );
  return boundSignalAtmospherePrompt(
    `${silentRoomQuestion} ${studioPrefix}${studioIdentity}.${keywordDirection} ${directions}`,
  );
}

function cleanSignalAtmosphereStudioIdentity(value: string): string {
  return (
    value
      .replace(
        /\b(?:(?:radio|broadcast|analog|electronic|electrical|microphone|speaker|tape|vinyl)[ -]*)?(?:static|hiss|crackle)\b/giu,
        " ",
      )
      .replace(/\b(?:white|pink|brown)[ -]+noise\b/giu, " ")
      .replace(/\s+([,.;:!?])/gu, "$1")
      .replace(/([,;:])(?:\s*[,;:])+/gu, "$1")
      .replace(/\s+/gu, " ")
      .replace(/^[,.;:\s]+|[,.;:\s]+$/gu, "")
      .trim() || "the finished studio"
  );
}

function boundSignalAtmosphereText(
  value: string,
  maxCharacters: number,
): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxCharacters) {
    return normalized;
  }
  const candidate = normalized
    .slice(0, maxCharacters)
    .replace(/\s+\S*$/u, "")
    .trimEnd();
  return candidate || normalized.slice(0, maxCharacters);
}

function boundSignalAtmospherePrompt(value: string): string {
  return boundSignalAtmosphereText(
    value,
    SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS,
  );
}

async function soundError(
  response: Response,
  fallbackMessage = "ElevenLabs could not create the Signal atmosphere audio.",
): Promise<ElevenLabsSoundError> {
  let detail = fallbackMessage;
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const nested =
      payload.detail && typeof payload.detail === "object"
        ? (payload.detail as Record<string, unknown>)
        : null;
    const message =
      typeof payload.detail === "string"
        ? payload.detail
        : typeof nested?.message === "string"
          ? nested.message
          : typeof payload.message === "string"
            ? payload.message
            : null;
    if (message?.trim()) detail = message.trim();
  } catch {
    // Keep the player-facing fallback above when the provider body is not JSON.
  }
  return new ElevenLabsSoundError(response.status, detail);
}

export function buildAvatarElevenLabsSfxPrompt(value: string): string {
  const request = boundSignalAtmosphereText(
    value,
    AVATAR_ELEVENLABS_SFX_PROMPT_MAX_CHARACTERS,
  );
  return `A seamless looping character sound effect: ${request}. Smooth loop boundary, stable level, and enough space for clear speech.`;
}

export async function requestSoundFxBenchSfx(args: {
  apiKey: string;
  prompt: string;
  durationSeconds?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{
  audioBytes: Buffer;
  contentType: string;
  requestId: string | null;
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const prompt = boundSignalAtmosphereText(
    args.prompt,
    SOUND_FX_BENCH_PROMPT_MAX_CHARACTERS,
  );
  const durationSeconds = Math.min(
    5,
    Math.max(0.5, Number(args.durationSeconds) || SOUND_FX_BENCH_DURATION_SECONDS),
  );
  const response = await fetchImpl(
    "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    {
      method: "POST",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "xi-api-key": args.apiKey,
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: durationSeconds,
        prompt_influence: 0.3,
        loop: false,
        model_id: "eleven_text_to_sound_v2",
      }),
    },
  );
  if (!response.ok) throw await soundError(response, "ElevenLabs could not create this sound effect.");
  const audioBytes = Buffer.from(await response.arrayBuffer());
  if (audioBytes.length === 0 || audioBytes.length > SOUND_FX_BENCH_AUDIO_MAX_BYTES) {
    throw new ElevenLabsSoundError(502, "ElevenLabs returned unusable sound audio.");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType?.startsWith("audio/")) {
    throw new ElevenLabsSoundError(502, "ElevenLabs returned an invalid sound audio format.");
  }
  return { audioBytes, contentType, requestId: response.headers.get("request-id") };
}

export async function requestAvatarElevenLabsSfx(args: {
  apiKey: string;
  prompt: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{
  audioBytes: Buffer;
  contentType: string;
  requestId: string | null;
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    {
      method: "POST",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "xi-api-key": args.apiKey,
      },
      body: JSON.stringify({
        text: buildAvatarElevenLabsSfxPrompt(args.prompt),
        duration_seconds: AVATAR_ELEVENLABS_SFX_DURATION_SECONDS,
        prompt_influence: 0.35,
        loop: true,
        model_id: AVATAR_ELEVENLABS_SFX_MODEL,
      }),
    },
  );
  if (!response.ok) {
    throw await soundError(
      response,
      "ElevenLabs could not create the avatar sound loop.",
    );
  }
  const announcedLength = Number(response.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(announcedLength) &&
    announcedLength > AVATAR_ELEVENLABS_SFX_AUDIO_MAX_BYTES
  ) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned oversized avatar sound audio.",
    );
  }
  const audioBytes = Buffer.from(await response.arrayBuffer());
  if (audioBytes.length === 0) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned empty avatar sound audio.",
    );
  }
  if (audioBytes.length > AVATAR_ELEVENLABS_SFX_AUDIO_MAX_BYTES) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned oversized avatar sound audio.",
    );
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (!contentType?.startsWith("audio/")) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned an invalid avatar sound audio format.",
    );
  }
  return {
    audioBytes,
    contentType,
    requestId: response.headers.get("request-id"),
  };
}

export async function requestCoffeeElevenLabsActionSfx(args: {
  apiKey: string;
  kind: CoffeeElevenLabsActionSfxKind;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{
  audioBytes: Buffer;
  contentType: string;
  requestId: string | null;
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const recipe = COFFEE_ELEVENLABS_ACTION_SFX[args.kind];
  const response = await fetchImpl(
    "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    {
      method: "POST",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "xi-api-key": args.apiKey,
      },
      body: JSON.stringify({
        text: recipe.prompt,
        duration_seconds: recipe.durationSeconds,
        prompt_influence: 0.3,
        loop: false,
        model_id: COFFEE_ELEVENLABS_ACTION_SFX_MODEL,
      }),
    },
  );
  if (!response.ok) throw await soundError(response);
  const announcedLength = Number(response.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(announcedLength) &&
    announcedLength > COFFEE_ACTION_SFX_AUDIO_MAX_BYTES
  ) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned oversized Coffee action audio.",
    );
  }
  const audioBytes = Buffer.from(await response.arrayBuffer());
  if (audioBytes.length === 0) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned empty Coffee action audio.",
    );
  }
  if (audioBytes.length > COFFEE_ACTION_SFX_AUDIO_MAX_BYTES) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned oversized Coffee action audio.",
    );
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (!contentType?.startsWith("audio/")) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned an invalid Coffee action audio format.",
    );
  }
  return {
    audioBytes,
    contentType,
    requestId: response.headers.get("request-id"),
  };
}

export async function requestSignalElevenLabsAtmosphere(args: {
  apiKey: string;
  prompt: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{
  audioBytes: Buffer;
  contentType: string;
  requestId: string | null;
}> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
    {
      method: "POST",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "xi-api-key": args.apiKey,
      },
      body: JSON.stringify({
        text: boundSignalAtmospherePrompt(args.prompt),
        duration_seconds: SIGNAL_ELEVENLABS_ATMOSPHERE_DURATION_MS / 1_000,
        prompt_influence: 0.3,
        loop: true,
        model_id: SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL,
      }),
    },
  );
  if (!response.ok) throw await soundError(response);
  const announcedLength = Number(response.headers.get("content-length") ?? 0);
  if (
    Number.isFinite(announcedLength) &&
    announcedLength > SIGNAL_ATMOSPHERE_AUDIO_MAX_BYTES
  ) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned oversized Signal atmosphere audio.",
    );
  }
  const audioBytes = Buffer.from(await response.arrayBuffer());
  if (audioBytes.length === 0) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned empty Signal atmosphere audio.",
    );
  }
  if (audioBytes.length > SIGNAL_ATMOSPHERE_AUDIO_MAX_BYTES) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned oversized Signal atmosphere audio.",
    );
  }
  const contentType = response.headers
    .get("content-type")
    ?.split(";")[0]
    ?.trim();
  if (!contentType?.startsWith("audio/")) {
    throw new ElevenLabsSoundError(
      502,
      "ElevenLabs returned an invalid Signal atmosphere audio format.",
    );
  }
  return {
    audioBytes,
    contentType,
    requestId: response.headers.get("request-id"),
  };
}
