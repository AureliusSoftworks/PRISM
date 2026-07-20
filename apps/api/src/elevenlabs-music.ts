import {
  BOTCAST_ELEVENLABS_INTRO_DURATION_MS,
  type SignalMusicProfile,
} from "@localai/shared";

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

const SIGNAL_IDENT_ARTICULATION_VARIANTS = [
  "close dry articulation with strong negative space",
  "unequal note lengths and one pronounced dynamic contrast",
  "one sharp rhythmic interruption inside an otherwise restrained phrase",
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
  profile: SignalMusicProfile;
  seed: string;
}): SignalElevenLabsMusicCompositionPlan {
  const recipe = args.profile;
  const temperamentNegativeStyles =
    recipe.temperament === "commanding" && recipe.palette === "cinematic"
    ? [
        "cheerful",
        "whimsical",
        "cute",
        "playful",
        "upbeat corporate",
        "inspirational uplift",
        "resolving chime",
        "uplifting ending",
        "major-key triumph",
      ]
    : [];
  const articulation = SIGNAL_IDENT_ARTICULATION_VARIANTS[recipe.variant];
  const halfDurationMs = BOTCAST_ELEVENLABS_INTRO_DURATION_MS / 2;
  const sharedNegativeStyles = [
    "ambient",
    "ambient pad",
    "pad-only",
    "soundscape",
    "slow atmospheric film-score wash",
    "background underscore",
    "wash",
    "single sustained chord",
    "one-chord sting",
    "drone",
    "static harmony",
    "atmospheric introduction",
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
        text: "[Distinct opening phrase]",
        duration_ms: halfDurationMs,
        positive_styles: [
          "wholly original instrumental interview-podcast ident",
          recipe.lead,
          recipe.support,
          recipe.pulse,
          articulation,
          `${recipe.tempoBpm} BPM`,
          `${recipe.register} register`,
          recipe.motifDirection,
          recipe.openingForm,
          "foreground phrase begins immediately and dominates the clip",
        ],
        negative_styles: [
          ...sharedNegativeStyles,
          ...temperamentNegativeStyles,
          ...recipe.avoidStyles,
          "fade in",
          "long reverb tail",
        ],
        context_adherence: "high",
      },
      {
        text: "[New answering phrase and ending]",
        duration_ms: halfDurationMs,
        positive_styles: [
          "instrumental continuation of the same podcast ident",
          recipe.developmentForm,
          recipe.motifDirection,
          recipe.endingDirection,
          "foreground melody remains unmistakable through the final note",
        ],
        negative_styles: [
          ...sharedNegativeStyles,
          ...temperamentNegativeStyles,
          ...recipe.avoidStyles,
          "sustained ending",
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
