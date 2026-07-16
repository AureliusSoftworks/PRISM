import {
  BOTCAST_ELEVENLABS_INTRO_DURATION_MS,
  type SignalPersonaTemperament,
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

type SignalElevenLabsTemperamentRecipe = {
  tempoBpm: number;
  lead: string;
  pulse: string;
  register: string;
  contour: string;
  ending: string;
  negativeStyles?: readonly string[];
};

const SIGNAL_ELEVENLABS_TEMPERAMENT_RECIPES: Record<
  SignalPersonaTemperament,
  SignalElevenLabsTemperamentRecipe
> = {
  commanding: {
    tempoBpm: 92,
    lead: "low brass-synth and dark metallic-pluck lead",
    pulse: "deliberate severe low pulse with disciplined restraint",
    register: "low register",
    contour: "descending minor-tonal four-note motif",
    ending: "abrupt dry hard-button ending",
    negativeStyles: [
      "cheerful",
      "whimsical",
      "cute",
      "playful",
      "upbeat corporate",
      "inspirational uplift",
      "resolving chime",
      "uplifting ending",
      "major-key triumph",
    ],
  },
  contemplative: {
    tempoBpm: 94,
    lead: "restrained soft-bell and felt electric-key lead",
    pulse: "sparse measured movement with deliberate silence",
    register: "low-middle register",
    contour: "gently turning four-note motif with a downward final step",
    ending: "quiet dry resolve",
  },
  playful: {
    tempoBpm: 118,
    lead: "bright articulated mallet-synth lead",
    pulse: "buoyant compact rhythmic pulse",
    register: "middle-high register",
    contour: "bouncing four-note motif with one light upward turn",
    ending: "brief lifted button ending",
  },
  analytical: {
    tempoBpm: 108,
    lead: "precise modular-pluck lead",
    pulse: "measured geometric pulse with clean spacing",
    register: "middle register",
    contour: "stepwise four-note motif with one revealing interval",
    ending: "exact dry broadcast button ending",
  },
  inventive: {
    tempoBpm: 114,
    lead: "mechanical modular-pluck and clean synth lead",
    pulse: "compact syncopated machine pulse",
    register: "middle register",
    contour: "asymmetric rising four-note motif",
    ending: "crisp engineered button ending",
  },
  warm: {
    tempoBpm: 100,
    lead: "rounded electric-key lead",
    pulse: "gentle human-scale pulse with clean articulation",
    register: "middle register",
    contour: "rounded arch-shaped four-note motif",
    ending: "soft compact resolved button ending",
  },
  creative: {
    tempoBpm: 110,
    lead: "glassy tuned-percussion and expressive mallet lead",
    pulse: "confident asymmetric rhythmic support",
    register: "middle-high register",
    contour: "expressive asymmetric four-note motif",
    ending: "confident dry resolve",
  },
  adventurous: {
    tempoBpm: 120,
    lead: "bold brass-pluck and articulated synth lead",
    pulse: "driving forward pulse",
    register: "middle register",
    contour: "ascending four-note motif with decisive momentum",
    ending: "decisive compact button ending",
  },
  neutral: {
    tempoBpm: 104,
    lead: "clean bell-synth and restrained pluck lead",
    pulse: "restrained broadcast pulse",
    register: "middle register",
    contour: "balanced arch-shaped four-note motif",
    ending: "dry neutral broadcast button ending",
  },
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const SIGNAL_IDENT_ACCENT_TEXTURES = [
  "dry muted pulse punctuation",
  "short tactile percussion accents",
  "restrained analog pulse accents",
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
  temperament: SignalPersonaTemperament;
  seed: string;
}): SignalElevenLabsMusicCompositionPlan {
  const recipe = SIGNAL_ELEVENLABS_TEMPERAMENT_RECIPES[args.temperament];
  const accentTexture = SIGNAL_IDENT_ACCENT_TEXTURES[
    stableHash(args.seed) % SIGNAL_IDENT_ACCENT_TEXTURES.length
  ]!;
  const halfDurationMs = BOTCAST_ELEVENLABS_INTRO_DURATION_MS / 2;
  const sharedNegativeStyles = [
    "ambient",
    "ambient pad",
    "pad-only",
    "soundscape",
    "cinematic atmosphere",
    "background underscore",
    "wash",
    "single sustained chord",
    "one-chord sting",
    "drone",
    "static harmony",
    "atmospheric introduction",
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
          recipe.lead,
          recipe.pulse,
          accentTexture,
          `${recipe.tempoBpm} BPM`,
          recipe.register,
          recipe.contour,
          "foreground four-note hook begins immediately and dominates the clip",
          "four clearly separated monophonic pitches played one after another",
          "short articulated attacks with audible space between notes",
        ],
        negative_styles: [
          ...sharedNegativeStyles,
          ...(recipe.negativeStyles ?? []),
          "fade in",
          "long reverb tail",
        ],
        context_adherence: "high",
      },
      {
        text: "[Motif variation and ending]",
        duration_ms: halfDurationMs,
        positive_styles: [
          "instrumental continuation of the same podcast ident",
          `repeat the hook as ${recipe.contour}`,
          "four clearly separated sequential pitches",
          recipe.ending,
          "foreground melody remains unmistakable through the final note",
        ],
        negative_styles: [
          ...sharedNegativeStyles,
          ...(recipe.negativeStyles ?? []),
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
