import {
  BOTCAST_ELEVENLABS_INTRO_DURATION_MS,
  BOTCAST_ELEVENLABS_OUTDENT_DURATION_MS,
  type SignalMusicProfile,
} from "@localai/shared";
import { normalizeSignalGenerationKeywords } from "./signal-generation-keywords.ts";

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
  "a clear memorable melodic contour with purposeful negative space",
  "unequal note lengths, one expressive dynamic swell, and a singable contour",
  "one rhythmic surprise inside a coherent two-phrase melody",
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

function signalMotifFingerprint(profile: SignalMusicProfile): string {
  return `four-note host signature at relative semitone steps ${profile.motifIntervals.join(
    ", ",
  )}`;
}

export function buildSignalElevenLabsMusicCompositionPlan(args: {
  profile: SignalMusicProfile;
  seed: string;
  keywords?: readonly string[];
}): SignalElevenLabsMusicCompositionPlan {
  const recipe = args.profile;
  const producerKeywordStyles = normalizeSignalGenerationKeywords(
    args.keywords,
  ).map((keyword) => `producer keyword influence: ${keyword}`);
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
          `emotional core: ${recipe.emotionalCore}`,
          `signature contradiction: ${recipe.signatureContradiction}`,
          recipe.sonicWorld,
          recipe.lead,
          recipe.support,
          recipe.pulse,
          articulation,
          `${recipe.tempoBpm} BPM`,
          `${recipe.register} register`,
          recipe.motifDirection,
          recipe.motifGesture,
          `harmonic language: ${recipe.harmonicLanguage.replaceAll("-", " ")}`,
          signalMotifFingerprint(recipe),
          recipe.openingForm,
          ...producerKeywordStyles,
          "compact genuinely melodic theme with a memorable original motif",
          "foreground melody begins immediately and dominates the clip",
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
          `preserve the emotional contradiction: ${recipe.signatureContradiction}`,
          recipe.sonicWorld,
          recipe.developmentForm,
          recipe.motifDirection,
          signalMotifFingerprint(recipe),
          recipe.endingDirection,
          ...producerKeywordStyles,
          "answering phrase clearly develops the opening motif",
          "foreground melody remains unmistakable through the final note",
          "complete cadence lands before the clip ends, followed by a brief natural release",
        ],
        negative_styles: [
          ...sharedNegativeStyles,
          ...temperamentNegativeStyles,
          ...recipe.avoidStyles,
          "unresolved hanging ending",
          "long reverb tail",
        ],
        context_adherence: "high",
      },
    ],
  };
}

/** Creates the host's paired closing signature, never a generic exit sting. */
export function buildSignalElevenLabsOutdentCompositionPlan(args: {
  profile: SignalMusicProfile;
  seed: string;
  keywords?: readonly string[];
}): SignalElevenLabsMusicCompositionPlan {
  const recipe = args.profile;
  const producerKeywordStyles = normalizeSignalGenerationKeywords(
    args.keywords,
  ).map((keyword) => `producer keyword influence: ${keyword}`);
  const articulation = SIGNAL_IDENT_ARTICULATION_VARIANTS[recipe.variant];
  const sharedNegativeStyles = [
    "ambient",
    "ambient pad",
    "pad-only",
    "soundscape",
    "background underscore",
    "wash",
    "single sustained chord",
    "one-chord sting",
    "drone",
    "static harmony",
    "vocals",
    "speech",
    "whispers",
    "lyrics",
    "artist imitation",
    "recognizable copyrighted melody",
    "applause",
    "crowd",
    ...recipe.avoidStyles,
  ];
  return {
    chunks: [
      {
        text: "[Paired closing recall and final sign-off]",
        duration_ms: BOTCAST_ELEVENLABS_OUTDENT_DURATION_MS,
        positive_styles: [
          "wholly original instrumental interview-podcast closing outdent",
          `emotional core: ${recipe.emotionalCore}`,
          `signature contradiction: ${recipe.signatureContradiction}`,
          recipe.sonicWorld,
          recipe.lead,
          recipe.support,
          recipe.pulse,
          articulation,
          `${recipe.tempoBpm} BPM`,
          `${recipe.register} register`,
          recipe.motifDirection,
          recipe.motifGesture,
          `harmonic language: ${recipe.harmonicLanguage.replaceAll("-", " ")}`,
          signalMotifFingerprint(recipe),
          "begin immediately with a concise, clearly recognizable recall of the opening host signature",
          "same instrumental identity and production language as its paired opening ident",
          ...producerKeywordStyles,
          recipe.endingDirection,
          "compress the host signature into a distinct final answer",
          "complete cadence lands before the clip ends, followed by a brief natural release",
        ],
        negative_styles: [
          ...sharedNegativeStyles,
          "new unrelated theme",
          "generic exit sting",
          "generic resolving chime",
          "unresolved hanging ending",
          "fade in",
          "fade out",
          "long reverb tail",
        ],
        context_adherence: "high",
      },
    ],
  };
}

async function musicError(response: Response): Promise<ElevenLabsMusicError> {
  let detail = "ElevenLabs could not compose the Signal music identity.";
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

export async function requestSignalElevenLabsMusic(args: {
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
    throw new ElevenLabsMusicError(502, "ElevenLabs returned oversized Signal music.");
  }
  const audioBytes = Buffer.from(await response.arrayBuffer());
  if (audioBytes.length === 0) {
    throw new ElevenLabsMusicError(502, "ElevenLabs returned empty Signal music.");
  }
  if (audioBytes.length > SIGNAL_INTRO_AUDIO_MAX_BYTES) {
    throw new ElevenLabsMusicError(502, "ElevenLabs returned oversized Signal music.");
  }
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim();
  if (!contentType?.startsWith("audio/")) {
    throw new ElevenLabsMusicError(502, "ElevenLabs returned invalid Signal music.");
  }
  return {
    audioBytes,
    contentType,
    requestId: response.headers.get("request-id"),
  };
}
