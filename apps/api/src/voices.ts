import {
  BOTCAST_IMMERSIVE_VOICE_TAGS,
  applyVoiceDeliveryMoodToProfile,
  elevenLabsVoiceDirectionForMood,
  normalizeBotAudioVoiceProfileV1,
  normalizeEnglishVoiceEngine,
  normalizeElevenLabsVoiceDirection,
  normalizeVoiceMode,
  normalizeVoiceDeliveryMood,
  ELEVENLABS_VOICE_STABILITY_DEFAULT,
  applyPlayerNamePronunciation as applySharedPlayerNamePronunciation,
  type BotAudioVoiceProfileV1,
  type EnglishVoiceEngine,
  type VoiceMode,
  type VoiceDeliveryMood,
} from "@localai/shared";

export function resolveElevenLabsVoiceId(
  profile: BotAudioVoiceProfileV1
): string | null {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return (
    normalized.elevenLabsVoiceIdOverride || normalized.elevenLabsVoiceId || null
  );
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
  builtinEnglish: { available: boolean; model: "kokoro-82m-q8" };
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
  builtinEnglish: { available: true, model: "kokoro-82m-q8" },
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

export function elevenLabsVoiceSettings(
  profile: BotAudioVoiceProfileV1,
  model: unknown,
): Record<string, number | boolean> {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  const stability = normalized.elevenLabsStability ?? ELEVENLABS_VOICE_STABILITY_DEFAULT;
  // Eleven v3 only supports stability from this profile. Its other settings
  // are model-sensitive, and lilt remains a local melodic control.
  if (normalizeElevenLabsTtsModel(model) === "eleven_v3") {
    return { stability };
  }
  return {
    stability,
    similarity_boost: 0.75,
    style: 0,
    use_speaker_boost: true,
  };
}

export class ElevenLabsVoiceError extends Error {
  readonly status: number;
  readonly providerCode: string | null;

  constructor(status: number, message: string) {
    let providerCode: string | null = null;
    let providerMessage = message;
    try {
      const payload = JSON.parse(message) as {
        detail?: { code?: unknown; message?: unknown };
      };
      if (typeof payload.detail?.code === "string") {
        providerCode = payload.detail.code;
      }
      if (typeof payload.detail?.message === "string") {
        providerMessage = payload.detail.message;
      }
    } catch {
      // Plain-text provider failures are already safe to surface as-is.
    }
    super(providerMessage);
    this.name = "ElevenLabsVoiceError";
    this.status = status;
    this.providerCode = providerCode;
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
  deliveryMood?: VoiceDeliveryMood;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
};

const ELEVENLABS_AUDIO_TAG_PATTERN = /\[([^\]\n]{1,48})\]/giu;

function normalizeElevenLabsTaggedText(
  value: unknown,
  spokenText: string,
): string | null {
  if (typeof value !== "string") return null;
  const taggedText = value.replace(/\s+/gu, " ").trim().slice(0, 4_200);
  if (!taggedText) return null;
  const allowed = new Set<string>(BOTCAST_IMMERSIVE_VOICE_TAGS);
  const matches = [...taggedText.matchAll(ELEVENLABS_AUDIO_TAG_PATTERN)];
  if (
    matches.length === 0 ||
    matches.length > 2 ||
    matches.some((match) => !allowed.has((match[1] ?? "").trim().toLowerCase()))
  ) {
    return null;
  }
  const withoutTags = taggedText
    .replace(ELEVENLABS_AUDIO_TAG_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (withoutTags !== spokenText.replace(/\s+/gu, " ").trim()) return null;
  const firstTag = matches[0];
  const lastTag = matches.at(-1);
  const firstTagAtStart = taggedText.slice(0, firstTag?.index ?? 0).trim() === "";
  const lastTagEnd = (lastTag?.index ?? 0) + (lastTag?.[0]?.length ?? 0);
  const lastTagAtEnd = taggedText.slice(lastTagEnd).trim() === "";
  if (!firstTagAtStart && !lastTagAtEnd) return null;
  return taggedText;
}

function elevenLabsSpeechInput(args: ElevenLabsSpeechArgs): {
  text: string;
  model: ElevenLabsTtsModel;
  directionPrefix: string;
} {
  const authoredDirection = normalizeElevenLabsVoiceDirection(
    normalizeBotAudioVoiceProfileV1(args.profile).elevenLabsDirection
  );
  const hasAudioTags = [...args.text.matchAll(ELEVENLABS_AUDIO_TAG_PATTERN)].some(
    (match) =>
      (BOTCAST_IMMERSIVE_VOICE_TAGS as readonly string[]).includes(
        (match[1] ?? "").trim().toLowerCase(),
      ),
  );
  // Explicit vocal reactions are more specific than the broad mood state.
  // Otherwise mood takes the first of the existing three direction slots and
  // remains ephemeral: it never mutates the bot's saved voice profile.
  const moodDirection = hasAudioTags
    ? null
    : elevenLabsVoiceDirectionForMood(args.deliveryMood);
  const direction = normalizeElevenLabsVoiceDirection(
    [moodDirection, authoredDirection].filter(Boolean).join(", ") || null,
  );
  const model = direction || hasAudioTags
    ? "eleven_v3"
    : normalizeElevenLabsTtsModel(args.model);
  const directionPrefix = direction
    ? `${direction
        .split(",")
        .map((entry) => `[${entry.trim().replace(/[\[\]]/gu, "")}]`)
        .join(" ")} `
    : "";
  return {
    text: `${directionPrefix}${args.text}`,
    model,
    directionPrefix,
  };
}

function elevenLabsSpeechRequestBody(args: ElevenLabsSpeechArgs): string {
  const input = elevenLabsSpeechInput(args);
  return JSON.stringify({
    text: input.text,
    model_id: input.model,
    voice_settings: elevenLabsVoiceSettings(args.profile, input.model),
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

function withoutDirectionPrefixAlignment(
  alignment: VoiceCharacterAlignment | null,
  directionPrefix: string
): VoiceCharacterAlignment | null {
  if (!alignment || !directionPrefix) return alignment;
  const prefixLength = Array.from(directionPrefix).length;
  if (alignment.characters.slice(0, prefixLength).join("") !== directionPrefix) {
    return alignment;
  }
  return {
    characters: alignment.characters.slice(prefixLength),
    characterStartTimesSeconds: alignment.characterStartTimesSeconds.slice(prefixLength),
    characterEndTimesSeconds: alignment.characterEndTimesSeconds.slice(prefixLength),
  };
}

function withoutEmbeddedAudioTagAlignment(
  alignment: VoiceCharacterAlignment | null,
  speechText: string,
): VoiceCharacterAlignment | null {
  if (!alignment || !speechText.includes("[")) return alignment;
  const characters = Array.from(speechText);
  if (alignment.characters.join("") !== characters.join("")) return alignment;
  const remove = new Set<number>();
  const allowed = new Set<string>(BOTCAST_IMMERSIVE_VOICE_TAGS);
  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] !== "[") continue;
    const end = characters.indexOf("]", index + 1);
    if (end < 0) continue;
    const tag = characters.slice(index + 1, end).join("").trim().toLowerCase();
    if (!allowed.has(tag)) continue;
    for (let tagIndex = index; tagIndex <= end; tagIndex += 1) {
      remove.add(tagIndex);
    }
    index = end;
  }
  if (remove.size === 0) return alignment;
  const kept = characters
    .map((character, index) => ({ character, index }))
    .filter(({ index }) => !remove.has(index));
  while (kept[0]?.character.trim() === "") kept.shift();
  while (kept.at(-1)?.character.trim() === "") kept.pop();
  const indexes = kept.map(({ index }) => index);
  return {
    characters: indexes.map((index) => alignment.characters[index]!),
    characterStartTimesSeconds: indexes.map(
      (index) => alignment.characterStartTimesSeconds[index]!,
    ),
    characterEndTimesSeconds: indexes.map(
      (index) => alignment.characterEndTimesSeconds[index]!,
    ),
  };
}

export async function requestElevenLabsSpeech(args: {
  apiKey: string;
  voiceId: string;
  model: unknown;
  text: string;
  profile: BotAudioVoiceProfileV1;
  deliveryMood?: VoiceDeliveryMood;
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
  const input = elevenLabsSpeechInput(args);
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
  const alignment = withoutDirectionPrefixAlignment(
    normalizeVoiceCharacterAlignment(payload.alignment),
    input.directionPrefix
  );
  const normalizedAlignment = withoutDirectionPrefixAlignment(
    normalizeVoiceCharacterAlignment(payload.normalized_alignment),
    input.directionPrefix
  );
  return {
    audioBase64,
    audioContentType: "audio/mpeg",
    alignment: withoutEmbeddedAudioTagAlignment(alignment, args.text),
    normalizedAlignment: withoutEmbeddedAudioTagAlignment(
      normalizedAlignment,
      args.text,
    ),
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

export interface ElevenLabsVoiceIdentity {
  voiceId: string;
  name: string;
}

export interface ElevenLabsVoiceCollectionCatalogEntry {
  collectionId: string;
  name: string;
  voiceCount: number;
  sampleVoiceNames: string[];
}

export async function requestElevenLabsVoiceIdentity(args: {
  apiKey: string;
  voiceId: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ElevenLabsVoiceIdentity> {
  const voiceId = args.voiceId.trim();
  if (!voiceId || voiceId.length > 240) {
    throw new ElevenLabsVoiceError(400, "Enter a valid ElevenLabs voice ID.");
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/voices/${encodeURIComponent(voiceId)}`,
    {
      headers: { "xi-api-key": args.apiKey },
      signal: args.signal,
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new ElevenLabsVoiceError(
      response.status,
      detail || `ElevenLabs voice lookup failed (${response.status}).`,
    );
  }
  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new ElevenLabsVoiceError(
      502,
      "ElevenLabs returned invalid voice metadata.",
    );
  }
  if (
    !rawPayload ||
    typeof rawPayload !== "object" ||
    Array.isArray(rawPayload)
  ) {
    throw new ElevenLabsVoiceError(
      502,
      "ElevenLabs returned invalid voice metadata.",
    );
  }
  const payload = rawPayload as Record<string, unknown>;
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const resolvedVoiceId =
    typeof payload.voice_id === "string" ? payload.voice_id.trim() : voiceId;
  if (!name || !resolvedVoiceId) {
    throw new ElevenLabsVoiceError(
      502,
      "ElevenLabs returned incomplete voice metadata.",
    );
  }
  return { voiceId: resolvedVoiceId, name };
}

export async function requestElevenLabsVoiceCatalog(args: {
  apiKey: string;
  collectionId?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ElevenLabsVoiceCatalogEntry[]> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = new URL("https://api.elevenlabs.io/v2/voices");
  url.searchParams.set("page_size", "100");
  url.searchParams.set("sort", "name");
  url.searchParams.set("sort_direction", "asc");
  url.searchParams.set("include_total_count", "false");
  const collectionId = args.collectionId?.trim();
  if (collectionId) url.searchParams.set("collection_id", collectionId);
  const response = await fetchImpl(url, {
    headers: { "xi-api-key": args.apiKey },
    signal: args.signal,
  });
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

export async function requestElevenLabsVoiceCollections(args: {
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ElevenLabsVoiceCollectionCatalogEntry[]> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const collections = new Map<
    string,
    { voiceIds: Set<string>; voiceNames: string[] }
  >();
  let nextPageToken: string | null = null;

  for (let page = 0; page < 25; page += 1) {
    const url = new URL("https://api.elevenlabs.io/v2/voices");
    url.searchParams.set("page_size", "100");
    url.searchParams.set("sort", "name");
    url.searchParams.set("sort_direction", "asc");
    url.searchParams.set("include_total_count", "false");
    url.searchParams.set("voice_type", "saved");
    if (nextPageToken) {
      url.searchParams.set("next_page_token", nextPageToken);
    }
    const response = await fetchImpl(url, {
      headers: { "xi-api-key": args.apiKey },
      signal: args.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new ElevenLabsVoiceError(
        response.status,
        detail || `ElevenLabs voice collections failed (${response.status}).`,
      );
    }
    const payload = (await response.json()) as {
      voices?: unknown[];
      has_more?: unknown;
      next_page_token?: unknown;
    };
    for (const value of Array.isArray(payload.voices) ? payload.voices : []) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      const voiceId =
        typeof record.voice_id === "string" ? record.voice_id.trim() : "";
      const voiceName =
        typeof record.name === "string" ? record.name.trim() : "";
      const collectionIds = Array.isArray(record.collection_ids)
        ? record.collection_ids
            .filter((candidate): candidate is string =>
              typeof candidate === "string",
            )
            .map((candidate) => candidate.trim())
            .filter(Boolean)
        : [];
      if (!voiceId) continue;
      for (const collectionId of collectionIds) {
        const collection = collections.get(collectionId) ?? {
          voiceIds: new Set<string>(),
          voiceNames: [],
        };
        if (!collection.voiceIds.has(voiceId)) {
          collection.voiceIds.add(voiceId);
          if (voiceName && collection.voiceNames.length < 3) {
            collection.voiceNames.push(voiceName);
          }
        }
        collections.set(collectionId, collection);
      }
    }

    const candidateNextPageToken =
      typeof payload.next_page_token === "string"
        ? payload.next_page_token.trim()
        : "";
    if (
      payload.has_more !== true ||
      !candidateNextPageToken ||
      candidateNextPageToken === nextPageToken
    ) {
      break;
    }
    nextPageToken = candidateNextPageToken;
  }

  const entries = await Promise.all(
    Array.from(collections.entries()).map(
      async ([collectionId, collection]) => {
        let name = "";
        const metadataUrl = new URL(
          `https://api.elevenlabs.io/v1/workspace/resources/${encodeURIComponent(collectionId)}`,
        );
        metadataUrl.searchParams.set("resource_type", "voice_collection");
        try {
          const response = await fetchImpl(metadataUrl, {
            headers: { "xi-api-key": args.apiKey },
            signal: args.signal,
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              resource_name?: unknown;
            };
            name =
              typeof payload.resource_name === "string"
                ? payload.resource_name.trim()
                : "";
          }
        } catch (error) {
          if (args.signal?.aborted) throw error;
        }
        return {
          collectionId,
          name: name || `Collection ${collectionId.slice(0, 8)}`,
          voiceCount: collection.voiceIds.size,
          sampleVoiceNames: collection.voiceNames,
        };
      },
    ),
  );
  return entries.sort(
    (left, right) =>
      left.name.localeCompare(right.name) ||
      left.collectionId.localeCompare(right.collectionId),
  );
}

export type VoiceSynthesisRequest = {
  text: string;
  elevenLabsText: string | null;
  mode: VoiceMode;
  engine: EnglishVoiceEngine;
  profile: BotAudioVoiceProfileV1;
  deliveryMood: VoiceDeliveryMood;
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
  const deliveryMood = normalizeVoiceDeliveryMood(body.moodKey);
  return {
    text,
    elevenLabsText: normalizeElevenLabsTaggedText(body.elevenLabsText, text),
    mode: normalizeVoiceMode(body.mode),
    engine: normalizeEnglishVoiceEngine(body.engine),
    profile: applyVoiceDeliveryMoodToProfile(
      normalizeBotAudioVoiceProfileV1(body.profile),
      deliveryMood,
    ),
    deliveryMood,
    messageId,
    explicitOnlineContext: body.explicitOnlineContext === true,
    includeAlignment: body.includeAlignment === true,
    seed: typeof body.seed === "string" && body.seed.trim()
      ? body.seed.trim().slice(0, 160)
      : null,
  };
}

export function resolveVoiceSynthesisExplicitOnlineContext(args: {
  persistedMessageProvider?: string | null;
  preferredProvider?: string | null;
  explicitOnlineContext: boolean;
  explicitVoicePreview: boolean;
  hasMessageId: boolean;
}): boolean {
  if (args.persistedMessageProvider) {
    return args.persistedMessageProvider !== "local";
  }
  if (!args.explicitOnlineContext) return false;
  if (args.preferredProvider !== "local") return true;
  return args.explicitVoicePreview && !args.hasMessageId;
}

export function resolveVoiceSynthesisBoundary(args: VoiceSynthesisRequest & {
  persistedMessageProvider?: string | null;
}):
  | { ok: true; kind: "builtin-babble"; engineUsed: "builtin-babble"; text: string; profile: BotAudioVoiceProfileV1 }
  | { ok: true; kind: "builtin-english"; engineUsed: "builtin" | "builtin-local-fallback"; text: string; profile: BotAudioVoiceProfileV1 }
  | { ok: true; kind: "elevenlabs-stream"; engineUsed: "elevenlabs"; text: string; elevenLabsText: string; profile: BotAudioVoiceProfileV1 }
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
      elevenLabsText: args.elevenLabsText ?? args.text,
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
