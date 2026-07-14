import {
  normalizeBotAudioVoiceProfileV1,
  normalizeEnglishVoiceEngine,
  normalizeVoiceMode,
  applyPlayerNamePronunciation as applySharedPlayerNamePronunciation,
  type BotAudioVoiceProfileV1,
  type EnglishVoiceEngine,
  type NormalizedBotAudioVoiceProfileV1,
  type VoiceMode,
} from "@localai/shared";

export function resolveElevenLabsVoiceId(
  profile: BotAudioVoiceProfileV1,
  voiceBank: Partial<Record<string, string | null>>
): string | null {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return normalized.elevenLabsVoiceId || voiceBank[normalized.baseVoiceId] || null;
}

export function applyGlobalEnglishVoiceDefault(
  profile: unknown,
  _engine: EnglishVoiceEngine,
  defaults: { systemVoiceName?: string | null; elevenLabsVoiceId?: string | null }
): NormalizedBotAudioVoiceProfileV1 {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return {
    ...normalized,
    ...(!normalized.systemVoiceName && defaults.systemVoiceName
      ? { systemVoiceName: defaults.systemVoiceName }
      : {}),
    ...(!normalized.elevenLabsVoiceId && defaults.elevenLabsVoiceId
      ? { elevenLabsVoiceId: defaults.elevenLabsVoiceId }
      : {}),
  };
}

export interface VoiceCapabilities {
  modes: VoiceMode[];
  englishEngines: EnglishVoiceEngine[];
  builtinBottish: {
    available: true;
    synthesis: "procedural";
  };
  builtinBabble: {
    available: true;
    synthesis: "system-hybrid";
    proceduralFallback: true;
  };
  builtinEnglish: { available: boolean; model: "system-native" };
  elevenLabs: { available: true; requiresApiKey: true; defaultModel: "eleven_flash_v2_5" };
}

export const VOICE_CAPABILITIES: VoiceCapabilities = {
  modes: ["mute", "english", "babble", "bottish"],
  englishEngines: ["builtin", "elevenlabs"],
  builtinBottish: {
    available: true,
    synthesis: "procedural",
  },
  builtinBabble: {
    available: true,
    synthesis: "system-hybrid",
    proceduralFallback: true,
  },
  builtinEnglish: { available: true, model: "system-native" },
  elevenLabs: {
    available: true,
    requiresApiKey: true,
    defaultModel: "eleven_flash_v2_5",
  },
};

export const ELEVENLABS_TTS_MODELS = [
  "eleven_flash_v2_5",
  "eleven_multilingual_v2",
  "eleven_v3",
] as const;
export type ElevenLabsTtsModel = (typeof ELEVENLABS_TTS_MODELS)[number];

export function normalizeElevenLabsTtsModel(value: unknown): ElevenLabsTtsModel {
  return (ELEVENLABS_TTS_MODELS as readonly unknown[]).includes(value)
    ? value as ElevenLabsTtsModel
    : "eleven_flash_v2_5";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function elevenLabsVoiceSettings(profile: BotAudioVoiceProfileV1): {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
  speed: number;
} {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  const pitchPlaybackRatio = 2 ** ((normalized.pitch * 650) / 1200);
  return {
    stability: Number(clamp(0.52 - normalized.lilt * 0.24, 0.18, 0.86).toFixed(3)),
    similarity_boost: 0.75,
    style: Number(clamp(0.18 + normalized.lilt * 0.18, 0, 0.45).toFixed(3)),
    use_speaker_boost: true,
    speed: Number(clamp(
      (1 + normalized.pace * 0.24) / pitchPlaybackRatio,
      0.7,
      1.2
    ).toFixed(3)),
  };
}

export class ElevenLabsVoiceError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ElevenLabsVoiceError";
    this.status = status;
  }
}

export interface VoiceCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface ElevenLabsTimestampedSpeech {
  audioBase64: string;
  audioContentType: "audio/mpeg";
  alignment: VoiceCharacterAlignment | null;
  normalizedAlignment: VoiceCharacterAlignment | null;
  providerRequestId: string | null;
}

type ElevenLabsSpeechArgs = {
  apiKey: string;
  voiceId: string;
  model: unknown;
  text: string;
  profile: BotAudioVoiceProfileV1;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

function elevenLabsSpeechRequestBody(args: ElevenLabsSpeechArgs): string {
  return JSON.stringify({
    text: args.text,
    model_id: normalizeElevenLabsTtsModel(args.model),
    voice_settings: elevenLabsVoiceSettings(args.profile),
  });
}

async function throwElevenLabsSpeechError(response: Response): Promise<never> {
  const detail = (await response.text()).trim();
  throw new ElevenLabsVoiceError(
    response.status,
    detail || `ElevenLabs speech failed (${response.status}).`
  );
}

function normalizeVoiceCharacterAlignment(value: unknown): VoiceCharacterAlignment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const characters = record.characters;
  const starts = record.character_start_times_seconds;
  const ends = record.character_end_times_seconds;
  if (!Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) return null;
  if (characters.length === 0 || characters.length !== starts.length || starts.length !== ends.length) {
    return null;
  }
  if (!characters.every((character) => typeof character === "string")) return null;
  if (!starts.every((start) => typeof start === "number" && Number.isFinite(start) && start >= 0)) {
    return null;
  }
  if (!ends.every((end, index) => (
    typeof end === "number"
    && Number.isFinite(end)
    && end >= (starts[index] as number)
  ))) return null;
  return {
    characters: [...characters] as string[],
    characterStartTimesSeconds: [...starts] as number[],
    characterEndTimesSeconds: [...ends] as number[],
  };
}

export async function requestElevenLabsSpeech(args: {
  apiKey: string;
  voiceId: string;
  model: unknown;
  text: string;
  profile: BotAudioVoiceProfileV1;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(args.voiceId)}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "xi-api-key": args.apiKey,
      },
      body: elevenLabsSpeechRequestBody(args),
    }
  );
  if (!response.ok) await throwElevenLabsSpeechError(response);
  if (!response.body) {
    throw new ElevenLabsVoiceError(502, "ElevenLabs returned an empty audio stream.");
  }
  return response;
}

export async function requestElevenLabsSpeechWithTimestamps(
  args: ElevenLabsSpeechArgs
): Promise<ElevenLabsTimestampedSpeech> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(args.voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: "POST",
      signal: args.signal,
      headers: {
        "content-type": "application/json",
        "xi-api-key": args.apiKey,
      },
      body: elevenLabsSpeechRequestBody(args),
    }
  );
  if (!response.ok) await throwElevenLabsSpeechError(response);
  let payload: Record<string, unknown>;
  try {
    payload = await response.json() as Record<string, unknown>;
  } catch {
    throw new ElevenLabsVoiceError(502, "ElevenLabs returned invalid timestamped speech.");
  }
  const audioBase64 = typeof payload.audio_base64 === "string"
    ? payload.audio_base64.trim()
    : "";
  if (!audioBase64) {
    throw new ElevenLabsVoiceError(502, "ElevenLabs returned empty timestamped audio.");
  }
  return {
    audioBase64,
    audioContentType: "audio/mpeg",
    alignment: normalizeVoiceCharacterAlignment(payload.alignment),
    normalizedAlignment: normalizeVoiceCharacterAlignment(payload.normalized_alignment),
    providerRequestId: response.headers.get("request-id"),
  };
}

export interface ElevenLabsVoiceCatalogEntry {
  voiceId: string;
  name: string;
  category: string | null;
  description: string | null;
  previewUrl: string | null;
  labels: Record<string, string>;
}

export async function requestElevenLabsVoiceCatalog(args: {
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ElevenLabsVoiceCatalogEntry[]> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    "https://api.elevenlabs.io/v2/voices?page_size=100&sort=name&sort_direction=asc&include_total_count=false",
    { headers: { "xi-api-key": args.apiKey }, signal: args.signal }
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new ElevenLabsVoiceError(
      response.status,
      detail || `ElevenLabs voice catalog failed (${response.status}).`
    );
  }
  const payload = await response.json() as { voices?: unknown[] };
  return (Array.isArray(payload.voices) ? payload.voices : []).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const voiceId = typeof record.voice_id === "string" ? record.voice_id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!voiceId || !name) return [];
    const labels = record.labels && typeof record.labels === "object" && !Array.isArray(record.labels)
      ? Object.fromEntries(
          Object.entries(record.labels as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        )
      : {};
    return [{
      voiceId,
      name,
      category: typeof record.category === "string" ? record.category : null,
      description: typeof record.description === "string" ? record.description : null,
      previewUrl: typeof record.preview_url === "string" ? record.preview_url : null,
      labels,
    }];
  });
}

export type VoiceSynthesisRequest = {
  text: string;
  mode: VoiceMode;
  engine: EnglishVoiceEngine;
  profile: BotAudioVoiceProfileV1;
  messageId: string | null;
  explicitOnlineContext: boolean;
  includeAlignment: boolean;
  seed: string | null;
};

export function cleanSpeakableAssistantProse(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<tool\b[\s\S]*?<\/tool>/gi, " ")
    .replace(/\[\[(?:tool|action|stage)[^\]]*\]\]/gi, " ")
    .replace(/^\s*(?:\*[^*\n]+\*|_[^_\n]+_|\[[^\]\n]+\]|\([^\)\n]+\))\s*$/gm, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/[^\s)]+/gi, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[\s>*#-]+/gm, "")
    .replace(/\*{1,3}|_{1,3}|~{2}/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

export function applyPlayerNamePronunciation(
  text: unknown,
  displayName: string | null | undefined,
  pronunciation: string | null | undefined
): unknown {
  return applySharedPlayerNamePronunciation(text, displayName, pronunciation);
}

export function validateVoiceSynthesisRequest(body: Record<string, unknown>): VoiceSynthesisRequest {
  const text = cleanSpeakableAssistantProse(body.text);
  if (!text) throw new Error("Speakable assistant text is required.");
  const messageId = typeof body.messageId === "string" && body.messageId.trim()
    ? body.messageId.trim().slice(0, 160)
    : null;
  return {
    text,
    mode: normalizeVoiceMode(body.mode),
    engine: normalizeEnglishVoiceEngine(body.engine),
    profile: normalizeBotAudioVoiceProfileV1(body.profile),
    messageId,
    explicitOnlineContext: body.explicitOnlineContext === true,
    includeAlignment: body.includeAlignment === true,
    seed: typeof body.seed === "string" && body.seed.trim()
      ? body.seed.trim().slice(0, 160)
      : null,
  };
}

export function resolveVoiceSynthesisBoundary(args: VoiceSynthesisRequest & {
  persistedMessageProvider?: string | null;
}):
  | { ok: true; kind: "builtin-babble"; engineUsed: "builtin-babble"; text: string; profile: BotAudioVoiceProfileV1 }
  | { ok: true; kind: "builtin-english"; engineUsed: "builtin" | "builtin-local-fallback"; text: string; profile: BotAudioVoiceProfileV1 }
  | { ok: true; kind: "elevenlabs-stream"; engineUsed: "elevenlabs"; text: string; profile: BotAudioVoiceProfileV1 }
  | { ok: false; status: 409 | 503; code: "muted" | "procedural-client-only" | "online-context-required" | "english-worker-unavailable" | "elevenlabs-unavailable"; engineUsed?: "builtin-local-fallback" } {
  const localFallback = args.engine === "elevenlabs" && args.persistedMessageProvider === "local";
  const engineUsed = localFallback ? "builtin-local-fallback" : args.engine;
  if (args.mode === "mute") {
    return { ok: false, status: 409, code: "muted" };
  }
  if (args.mode === "bottish") {
    return { ok: false, status: 409, code: "procedural-client-only" };
  }
  if (args.mode === "babble") {
    return {
      ok: true,
      kind: "builtin-babble",
      engineUsed: "builtin-babble",
      text: args.text,
      profile: args.profile,
    };
  }
  if (localFallback) {
    return {
      ok: true,
      kind: "builtin-english",
      engineUsed: "builtin-local-fallback",
      text: args.text,
      profile: args.profile,
    };
  }
  if (args.engine === "elevenlabs" && !args.explicitOnlineContext) {
    return { ok: false, status: 409, code: "online-context-required" };
  }
  if (args.engine === "elevenlabs") {
    return {
      ok: true,
      kind: "elevenlabs-stream",
      engineUsed: "elevenlabs",
      text: args.text,
      profile: args.profile,
    };
  }
  return {
    ok: true,
    kind: "builtin-english",
    engineUsed: "builtin",
    text: args.text,
    profile: args.profile,
  };
}
