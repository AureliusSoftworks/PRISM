import { BOTCAST_ELEVENLABS_INTRO_DURATION_MS } from "@localai/shared";

export const SIGNAL_ELEVENLABS_MUSIC_MODEL = "music_v2";
const SIGNAL_INTRO_AUDIO_MAX_BYTES = 4 * 1024 * 1024;

export class ElevenLabsMusicError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ElevenLabsMusicError";
    this.status = status;
  }
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const SIGNAL_IDENT_DIRECTIONS = [
  "glassy tuned-percussion lead over a restrained analog pulse",
  "warm electric-key melody over a subtle low broadcast pulse",
  "precise modular-pluck melody with soft sub-bass punctuation",
  "clean bell-synth melody over a quiet cinematic bed",
  "playful mallet-synth melody over gentle bass movement",
] as const;

export type SignalElevenLabsMusicCompositionPlan = {
  chunks: Array<{
    text: string;
    duration_ms: number;
    positive_styles: string[];
    negative_styles: string[];
    context_adherence: "high";
  }>;
};

export function buildSignalElevenLabsMusicCompositionPlan(args: {
  showId: string;
  accentColor: string;
}): SignalElevenLabsMusicCompositionPlan {
  const direction = SIGNAL_IDENT_DIRECTIONS[
    stableHash(args.showId) % SIGNAL_IDENT_DIRECTIONS.length
  ]!;
  const color = /^#[0-9a-f]{6}$/iu.test(args.accentColor.trim())
    ? args.accentColor.trim().toLowerCase()
    : "#7b5cff";
  const halfDurationMs = BOTCAST_ELEVENLABS_INTRO_DURATION_MS / 2;
  const sharedNegativeStyles = [
    "single sustained chord",
    "one-chord sting",
    "drone",
    "ambient pad-only",
    "static harmony",
    "simultaneous motif notes",
    "vocals",
    "speech",
    "whispers",
    "lyrics",
    "artist imitation",
    "recognizable copyrighted melody",
    "applause",
    "crowd",
  ];
  return {
    chunks: [
      {
        text: "[Motif statement]",
        duration_ms: halfDurationMs,
        positive_styles: [
          "wholly original instrumental interview-podcast ident",
          direction,
          "four clearly separated monophonic pitches played one after another",
          "short articulated attacks with audible space between notes",
          "foreground melody with harmony only as quiet support",
          `understated modern warmth analogous to ${color}`,
          "begin immediately",
          "112 BPM",
        ],
        negative_styles: [...sharedNegativeStyles, "fade in", "long reverb tail"],
        context_adherence: "high",
      },
      {
        text: "[Motif variation and button ending]",
        duration_ms: halfDurationMs,
        positive_styles: [
          "instrumental continuation of the same podcast ident",
          "repeat the four-note melody as a concise rising variation",
          "four clearly separated sequential pitches",
          "one brief resolving chime only after the melodic phrase",
          "decisive broadcast button ending",
          "polished, understated, warm, and modern",
        ],
        negative_styles: [
          ...sharedNegativeStyles,
          "sustained ending",
          "ambient wash",
          "fade out",
          "long reverb tail",
        ],
        context_adherence: "high",
      },
    ],
  };
}

async function musicError(response: Response): Promise<ElevenLabsMusicError> {
  let detail = "ElevenLabs could not compose the Signal intro.";
  try {
    const payload = await response.json() as Record<string, unknown>;
    const nested = payload.detail && typeof payload.detail === "object"
      ? payload.detail as Record<string, unknown>
      : null;
    const message = typeof payload.detail === "string"
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
  return new ElevenLabsMusicError(response.status, detail);
}

export async function requestSignalElevenLabsIntroMusic(args: {
  apiKey: string;
  compositionPlan: SignalElevenLabsMusicCompositionPlan;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<{ audioBytes: Buffer; contentType: string; requestId: string | null }> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    "https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192",
    {
      method: "POST",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "xi-api-key": args.apiKey,
      },
      body: JSON.stringify({
        composition_plan: args.compositionPlan,
        model_id: SIGNAL_ELEVENLABS_MUSIC_MODEL,
      }),
    },
  );
  if (!response.ok) throw await musicError(response);
  const announcedLength = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(announcedLength) && announcedLength > SIGNAL_INTRO_AUDIO_MAX_BYTES) {
    throw new ElevenLabsMusicError(502, "ElevenLabs returned an oversized Signal intro.");
  }
  const audioBytes = Buffer.from(await response.arrayBuffer());
  if (audioBytes.length === 0) {
    throw new ElevenLabsMusicError(502, "ElevenLabs returned an empty Signal intro.");
  }
  if (audioBytes.length > SIGNAL_INTRO_AUDIO_MAX_BYTES) {
    throw new ElevenLabsMusicError(502, "ElevenLabs returned an oversized Signal intro.");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType?.startsWith("audio/")) {
    throw new ElevenLabsMusicError(502, "ElevenLabs returned an invalid Signal intro format.");
  }
  return {
    audioBytes,
    contentType,
    requestId: response.headers.get("request-id"),
  };
}
