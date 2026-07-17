export const SIGNAL_ELEVENLABS_ATMOSPHERE_MODEL = "eleven_text_to_sound_v2";
export const SIGNAL_ELEVENLABS_ATMOSPHERE_DURATION_MS = 30_000;
export const SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS = 450;
const SIGNAL_ATMOSPHERE_AUDIO_MAX_BYTES = 4 * 1024 * 1024;

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
}): string {
  return boundSignalAtmospherePrompt(
    [
      "Seamless quiet environmental room-tone loop for an intimate two-person interview studio.",
      `Acoustic identity: ${args.studioIdentity.trim() || args.showName}.`,
      "Stable ventilation air, restrained room resonance, distant exterior hush filtered through the building envelope, and soft microphone-room presence.",
      "Translate the studio architecture, materials, scale, and exterior setting into subtle acoustic color.",
      "Calm, sparse, continuous, even in level, gently spatial, with a smooth loop boundary.",
    ].join(" "),
  );
}

function boundSignalAtmospherePrompt(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS) {
    return normalized;
  }
  const candidate = normalized
    .slice(0, SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS - 1)
    .replace(/\s+\S*$/u, "")
    .trimEnd();
  return `${candidate || normalized.slice(0, SIGNAL_ELEVENLABS_SOUND_PROMPT_MAX_CHARACTERS - 1)}…`;
}

async function soundError(response: Response): Promise<ElevenLabsSoundError> {
  let detail = "ElevenLabs could not create the Signal atmosphere audio.";
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
