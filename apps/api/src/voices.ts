import {
  applyPremiumRespelling,
  applyVoiceDeliveryMoodToProfile,
  projectSpeechAbbreviations,
  elevenLabsVoiceDirectionForMood,
  resolveLocalAccentFallback,
  resolvePremiumAccentDirection,
  normalizeBotAudioVoiceProfileV1,
  normalizeEnglishVoiceEngine,
  normalizeElevenLabsVoiceDirection,
  normalizeVoiceMode,
  normalizeVoiceDeliveryMood,
  voicePerformanceTextFromActionCues,
  voiceSpokenText,
  ELEVENLABS_VOICE_STABILITY_DEFAULT,
  applyPlayerNamePronunciation as applySharedPlayerNamePronunciation,
  type BotAudioVoiceProfileV1,
  type EnglishVoiceEngine,
  type VoiceMode,
  type VoiceDeliveryMood,
} from "@localai/shared";
import { prepareAccentMapTargetIpa } from "./builtin-tts-runtime.ts";

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
  protectedPhrases?: readonly string[];
  /** Off for utterances that are not dialogue — a fixed calibration script or
   * a sound-effect prompt seed, where respelling would corrupt the payload
   * rather than accent it. Dialogue leaves this on. */
  respellAccent?: boolean;
  seed?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Test seam for deterministic request-contract coverage. Production uses
   * the same provider-neutral Accent Map IPA resolver as Local synthesis. */
  accentIpaResolver?: typeof prepareAccentMapTargetIpa;
};

/**
 * Keep one provider sampling lane per performer even when several bots share
 * the same ElevenLabs actor. Requests remain stateless; the seed only anchors
 * ElevenLabs' otherwise nondeterministic sampling for this bot.
 */
export function elevenLabsVoiceIsolationSeed(
  performerIdentity: string | null | undefined,
): number | undefined {
  const identity = performerIdentity?.trim();
  if (!identity) return undefined;
  let hash = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

const ELEVENLABS_AUDIO_TAG_PATTERN =
  /(?<![\\[])\[([^\[\]\n]{1,48})\](?!\])(?!\s*\()/giu;

function normalizeElevenLabsTaggedText(
  value: unknown,
  spokenText: string,
): string | null {
  if (typeof value !== "string") return null;
  const taggedText = value.replace(/\s+/gu, " ").trim().slice(0, 4_200);
  if (!taggedText) return null;
  const matches = [...taggedText.matchAll(ELEVENLABS_AUDIO_TAG_PATTERN)];
  if (
    matches.length === 0 ||
    matches.length > 8 ||
    matches.some((match) => !(match[1] ?? "").trim())
  ) {
    return null;
  }
  const withoutTags = cleanSpeakableAssistantProse(
    taggedText.replace(ELEVENLABS_AUDIO_TAG_PATTERN, " "),
  );
  if (withoutTags !== cleanSpeakableAssistantProse(spokenText)) return null;
  return taggedText;
}

type ElevenLabsTextProjectionSegment = {
  providerText: string;
  sourceText: string;
};

type ElevenLabsSpeechInput = {
  text: string;
  model: ElevenLabsTtsModel;
  directionPrefix: string;
  sourceText: string;
  /** Provider body paired with the written line it stands for. Identity when
   * nothing was respelled. */
  projectionSegments: readonly ElevenLabsTextProjectionSegment[];
  alignmentProjected: boolean;
  /** Second projection from expanded speech back to authored spelling. */
  sourceProjectionSegments: readonly ElevenLabsTextProjectionSegment[];
  sourceAlignmentProjected: boolean;
};

/**
 * Respell the words this accent spells differently, leaving audio tags and
 * the spacing around them exactly as written. Tags map to themselves rather
 * than to nothing, so the projected alignment reconstructs the tagged source
 * line and the ordinary tag-stripping pass still runs against it.
 */
function elevenLabsRespelling(
  args: ElevenLabsSpeechArgs,
  normalizedProfile: ReturnType<typeof normalizeBotAudioVoiceProfileV1>,
): { text: string; segments: ElevenLabsTextProjectionSegment[]; respelled: boolean } {
  const accent = resolveLocalAccentFallback({
    accentDefinitionId: normalizedProfile.accentDefinitionId,
    pronunciationBase: normalizedProfile.pronunciationBase,
    speechprintInfluence: normalizedProfile.speechprintInfluence,
  });
  const segments: ElevenLabsTextProjectionSegment[] = [];
  let respelled = false;
  const pushPlain = (value: string) => {
    if (!value) return;
    const projection = applyPremiumRespelling({
      text: value,
      influence: accent.speechprintInfluence,
      strength: normalizedProfile.speechprintStrength,
      protectedPhrases: args.protectedPhrases,
    });
    segments.push(...projection.segments);
    respelled ||= projection.changed;
  };
  let cursor = 0;
  for (const tag of args.text.matchAll(ELEVENLABS_AUDIO_TAG_PATTERN)) {
    const start = tag.index ?? cursor;
    if (start > cursor) pushPlain(args.text.slice(cursor, start));
    segments.push({ providerText: tag[0], sourceText: tag[0] });
    cursor = start + tag[0].length;
  }
  if (cursor < args.text.length) pushPlain(args.text.slice(cursor));
  return {
    text: segments.map((segment) => segment.providerText).join(""),
    segments,
    respelled,
  };
}

const ELEVENLABS_AUTHORITATIVE_IPA_ACCENTS = new Set([
  "american-english",
  "british-english",
  "scottish-english",
]);

/**
 * Eleven v3 accepts IPA wrapped in forward slashes directly in request text.
 * For the three national Accent Map targets whose identity depends heavily on
 * vowel space and rhoticity, project PRISM's provider-neutral target IPA into
 * the private provider body while retaining the selected voice ID as timbre.
 */
async function elevenLabsAccentIpaProjection(
  args: ElevenLabsSpeechArgs,
  normalizedProfile: ReturnType<typeof normalizeBotAudioVoiceProfileV1>,
): Promise<ElevenLabsTextProjectionSegment[] | null> {
  if (
    !ELEVENLABS_AUTHORITATIVE_IPA_ACCENTS.has(
      normalizedProfile.accentDefinitionId ?? "",
    )
  ) {
    return null;
  }
  const resolveIpa = args.accentIpaResolver ?? prepareAccentMapTargetIpa;
  const segments: ElevenLabsTextProjectionSegment[] = [];
  const pushPlain = async (value: string): Promise<void> => {
    if (!value) return;
    const leadingWhitespace = value.match(/^\s*/u)?.[0] ?? "";
    const trailingWhitespace = value.match(/\s*$/u)?.[0] ?? "";
    const spoken = value.slice(
      leadingWhitespace.length,
      value.length - trailingWhitespace.length,
    );
    if (!/[\p{L}\p{N}]/u.test(spoken)) {
      segments.push({ providerText: value, sourceText: value });
      return;
    }
    const plan = await resolveIpa({
      text: spoken,
      profile: normalizedProfile,
      protectedPhrases: args.protectedPhrases,
    });
    const ipa = plan.targetIpa?.replaceAll("/", "").trim() ?? "";
    segments.push({
      providerText: ipa
        ? `${leadingWhitespace}/${ipa}/${trailingWhitespace}`
        : value,
      sourceText: value,
    });
  };
  try {
    let cursor = 0;
    for (const tag of args.text.matchAll(ELEVENLABS_AUDIO_TAG_PATTERN)) {
      const start = tag.index ?? cursor;
      if (start > cursor) await pushPlain(args.text.slice(cursor, start));
      segments.push({ providerText: tag[0], sourceText: tag[0] });
      cursor = start + tag[0].length;
    }
    if (cursor < args.text.length) await pushPlain(args.text.slice(cursor));
  } catch {
    return null;
  }
  return segments.some(
    (segment) => segment.providerText !== segment.sourceText,
  )
    ? segments
    : null;
}

async function elevenLabsSpeechInput(
  args: ElevenLabsSpeechArgs,
): Promise<ElevenLabsSpeechInput> {
  // Premium previews, replays, and Action SFX bypass the conversation route.
  // Normalize here as the shared provider boundary so every request speaks
  // titles naturally without altering its persisted source text.
  const abbreviationProjection = projectSpeechAbbreviations(args.text);
  const speechArgs = {
    ...args,
    text: abbreviationProjection.synthesisText,
  };
  const normalizedProfile = normalizeBotAudioVoiceProfileV1(speechArgs.profile);
  const authoredDirection = normalizeElevenLabsVoiceDirection(
    normalizedProfile.elevenLabsDirection,
  );
  const accentDirection = resolvePremiumAccentDirection({
    accentDefinitionId: normalizedProfile.accentDefinitionId,
    pronunciationBase: normalizedProfile.pronunciationBase,
    speechprintInfluence: normalizedProfile.speechprintInfluence,
    speechprintStrength: normalizedProfile.speechprintStrength,
    nativeAccentHint: normalizedProfile.elevenLabsNativeAccentHint,
  });
  const hasAudioTags = [...speechArgs.text.matchAll(ELEVENLABS_AUDIO_TAG_PATTERN)]
    .length > 0;
  // Explicit vocal reactions are more specific than the broad mood state.
  // The saved bot identity keeps the existing three direction slots. A mood
  // may use only a remaining slot and remains ephemeral: it never mutates the
  // saved voice profile or displaces one of its defining performance cues.
  const moodDirection = hasAudioTags
    ? null
    : elevenLabsVoiceDirectionForMood(speechArgs.deliveryMood);
  // Accent is a saved character definition and must retain a direction slot.
  // The shared normalizer caps the combined request at Eleven v3's three tags.
  const direction = normalizeElevenLabsVoiceDirection(
    [accentDirection, authoredDirection, moodDirection]
      .filter(Boolean)
      .join(", ") || null,
  );
  const model = direction || hasAudioTags
    ? "eleven_v3"
    : normalizeElevenLabsTtsModel(speechArgs.model);
  const directionPrefix = direction
    ? `${direction
        .split(",")
        .map((entry) => `[${entry.trim().replace(/[\[\]]/gu, "")}]`)
        .join(" ")} `
    : "";
  // The direction carries prosody. On Eleven v3, authoritative IPA supplies
  // American/British/Scottish target phonology; other maps retain the lighter
  // existing respelling projection. Both remain private to the request.
  //
  // No accent direction means the voice already speaks this accent, and
  // respelling on top of it would double the effect.
  const ipaProjection =
    accentDirection && speechArgs.respellAccent !== false
      ? await elevenLabsAccentIpaProjection(speechArgs, normalizedProfile)
      : null;
  const respelling =
    !ipaProjection && accentDirection && speechArgs.respellAccent !== false
      ? elevenLabsRespelling(speechArgs, normalizedProfile)
      : null;
  const projectionSegments =
    ipaProjection ??
    respelling?.segments ??
    (speechArgs.text
      ? [{ providerText: speechArgs.text, sourceText: speechArgs.text }]
      : []);
  const body = projectionSegments
    .map((segment) => segment.providerText)
    .join("");
  return {
    text: `${directionPrefix}${body}`,
    model,
    directionPrefix,
    sourceText: args.text,
    projectionSegments,
    alignmentProjected:
      Boolean(ipaProjection) || respelling?.respelled === true,
    sourceProjectionSegments: abbreviationProjection.segments.map(
      (segment) => ({
        providerText: segment.synthesisText,
        sourceText: segment.sourceText,
      }),
    ),
    sourceAlignmentProjected: abbreviationProjection.changed,
  };
}

function elevenLabsSpeechRequestBody(
  args: ElevenLabsSpeechArgs,
  input: ElevenLabsSpeechInput,
): string {
  return JSON.stringify({
    text: input.text,
    model_id: input.model,
    voice_settings: elevenLabsVoiceSettings(args.profile, input.model),
    ...(args.seed === undefined ? {} : { seed: args.seed }),
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
  for (let index = 0; index < characters.length; index += 1) {
    if (characters[index] !== "[") continue;
    const end = characters.indexOf("]", index + 1);
    if (end < 0) continue;
    const tag = characters.slice(index + 1, end).join("").trim();
    if (!tag || Array.from(tag).length > 48) continue;
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

/**
 * Provider timing is measured against the respelled body. Hand each word's
 * window back to the word as written, so the alignment this route returns
 * reconstructs the source line character for character and the ordinary
 * tag-stripping pass can run against it unchanged.
 */
function projectRespellingAlignmentToSource(
  alignment: VoiceCharacterAlignment | null,
  segments: readonly ElevenLabsTextProjectionSegment[],
): VoiceCharacterAlignment | null {
  if (!alignment) return null;
  const providerCharacters = Array.from(
    segments.map((segment) => segment.providerText).join(""),
  );
  if (
    alignment.characters.length !== providerCharacters.length ||
    alignment.characters.join("") !== providerCharacters.join("")
  ) {
    return null;
  }
  const projected: VoiceCharacterAlignment = {
    characters: [],
    characterStartTimesSeconds: [],
    characterEndTimesSeconds: [],
  };
  let cursor = 0;
  for (const segment of segments) {
    const providerLength = Array.from(segment.providerText).length;
    const end = cursor + providerLength;
    const sourceCharacters = Array.from(segment.sourceText);
    const starts = alignment.characterStartTimesSeconds.slice(cursor, end);
    const ends = alignment.characterEndTimesSeconds.slice(cursor, end);
    if (sourceCharacters.length === providerLength) {
      projected.characters.push(...sourceCharacters);
      projected.characterStartTimesSeconds.push(...starts);
      projected.characterEndTimesSeconds.push(...ends);
    } else if (sourceCharacters.length > 0 && starts.length > 0) {
      // A respelled word is one timing window: spread it evenly across the
      // written letters rather than guessing a letter-to-letter mapping.
      const windowStart = Math.min(...starts);
      const windowEnd = Math.max(...ends);
      const duration = Math.max(0, windowEnd - windowStart);
      for (let index = 0; index < sourceCharacters.length; index += 1) {
        projected.characters.push(sourceCharacters[index]!);
        projected.characterStartTimesSeconds.push(
          windowStart + duration * (index / sourceCharacters.length),
        );
        projected.characterEndTimesSeconds.push(
          windowStart + duration * ((index + 1) / sourceCharacters.length),
        );
      }
    }
    cursor = end;
  }
  return projected;
}

/**
 * ElevenLabs can occasionally return a valid audio envelope whose character
 * timing stops at a strict prefix of the requested line. Treat only that
 * unambiguous prefix case as incomplete; unrelated provider normalization
 * differences remain playable instead of causing a false fallback.
 */
export function voiceCharacterAlignmentIsIncomplete(
  alignment: VoiceCharacterAlignment | null,
  requestedText: string,
): boolean {
  if (!alignment) return false;
  const requested = voiceSpokenText(requestedText)
    .replace(/\s+/gu, " ")
    .trim();
  const aligned = voiceSpokenText(alignment.characters.join(""))
    .replace(/\s+/gu, " ")
    .trim();
  const unheardSuffix = requested.slice(aligned.length);
  return (
    requested.length > aligned.length &&
    requested.startsWith(aligned) &&
    /[\p{L}\p{N}]/u.test(unheardSuffix)
  );
}

export async function requestElevenLabsSpeech(
  args: ElevenLabsSpeechArgs,
): Promise<Response> {
  const input = await elevenLabsSpeechInput(args);
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
      body: elevenLabsSpeechRequestBody(args, input),
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
  const input = await elevenLabsSpeechInput(args);
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
      body: elevenLabsSpeechRequestBody(args, input),
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
  const providerAlignment = normalizeVoiceCharacterAlignment(payload.alignment);
  const providerNormalizedAlignment = normalizeVoiceCharacterAlignment(
    payload.normalized_alignment,
  );
  if (
    voiceCharacterAlignmentIsIncomplete(
      providerAlignment ?? providerNormalizedAlignment,
      input.text,
    )
  ) {
    throw new ElevenLabsVoiceError(
      502,
      "ElevenLabs returned speech that ended before the requested line.",
    );
  }
  const asWritten = (value: VoiceCharacterAlignment | null) => {
    const withoutPrefix = withoutDirectionPrefixAlignment(
      value,
      input.directionPrefix,
    );
    const expandedAlignment = input.alignmentProjected
      ? projectRespellingAlignmentToSource(
          withoutPrefix,
          input.projectionSegments,
        )
      : withoutPrefix;
    return input.sourceAlignmentProjected
      ? projectRespellingAlignmentToSource(
          expandedAlignment,
          input.sourceProjectionSegments,
        )
      : expandedAlignment;
  };
  const alignment = asWritten(providerAlignment);
  const normalizedAlignment = asWritten(providerNormalizedAlignment);
  const spokenAlignment = withoutEmbeddedAudioTagAlignment(
    alignment,
    input.sourceText,
  );
  const spokenNormalizedAlignment = withoutEmbeddedAudioTagAlignment(
    normalizedAlignment,
    input.sourceText,
  );
  if (
    voiceCharacterAlignmentIsIncomplete(
      spokenAlignment ?? spokenNormalizedAlignment,
      input.sourceText,
    )
  ) {
    throw new ElevenLabsVoiceError(
      502,
      "ElevenLabs returned speech that ended before the requested line.",
    );
  }
  return {
    audioBase64,
    audioContentType: "audio/mpeg",
    alignment: spokenAlignment,
    normalizedAlignment: spokenNormalizedAlignment,
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
  /** Present for community voices copied from the public Voice Library. */
  originalVoiceId?: string;
  /** Public owner paired with originalVoiceId by ElevenLabs sharing metadata. */
  publicOwnerId?: string;
}

export interface ElevenLabsSharedVoiceCandidate {
  publicOwnerId: string;
  voiceId: string;
  name: string;
  category: "professional" | "high_quality";
  description: string | null;
  previewUrl: string | null;
  labels: Record<string, string>;
}

type SharedVoiceGenderConstraint = "female" | "male";

type SharedVoiceHardConstraints = {
  accentTerms: readonly (readonly string[])[];
  gender: SharedVoiceGenderConstraint | null;
};

const SHARED_VOICE_ACCENT_CONSTRAINTS: Readonly<
  Record<string, readonly string[]>
> = {
  american: ["american", "us"],
  australian: ["australian", "aussie"],
  british: ["british", "english", "uk"],
  canadian: ["canadian"],
  indian: ["indian"],
  irish: ["irish"],
  "new zealand": ["new", "zealand", "kiwi"],
  scottish: ["scottish", "scots"],
  "south african": ["south", "african"],
};

function sharedVoiceDirectionTokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);
}

/**
 * Refract remains a soft creative direction in general, but a player who
 * explicitly names an accent or gender is making a casting constraint. Only
 * trust provider-returned metadata for that constraint; a missing label is
 * not permission to substitute an incompatible performer.
 */
function sharedVoiceHardConstraints(direction: string): SharedVoiceHardConstraints {
  const tokens = sharedVoiceDirectionTokens(direction);
  const accentTerms = Object.entries(SHARED_VOICE_ACCENT_CONSTRAINTS)
    .filter(([phrase]) => phrase.split(" ").every((term) => tokens.has(term)))
    .map(([, terms]) => terms);
  const gender =
    ["female", "woman", "women", "girl"].some((term) => tokens.has(term))
      ? "female"
      : ["male", "man", "men", "boy"].some((term) => tokens.has(term))
        ? "male"
        : null;
  return { accentTerms, gender };
}

function sharedVoiceCandidateMetadataTokens(
  candidate: ElevenLabsSharedVoiceCandidate,
): Set<string> {
  return sharedVoiceDirectionTokens(
    [
      candidate.name,
      candidate.category,
      candidate.description ?? "",
      ...Object.entries(candidate.labels).flat(),
    ].join(" "),
  );
}

function sharedVoiceSatisfiesHardConstraints(
  candidate: ElevenLabsSharedVoiceCandidate,
  constraints: SharedVoiceHardConstraints,
): boolean {
  const metadata = sharedVoiceCandidateMetadataTokens(candidate);
  return (
    constraints.accentTerms.every((terms) => terms.some((term) => metadata.has(term))) &&
    (!constraints.gender || metadata.has(constraints.gender))
  );
}

export function selectElevenLabsSharedVoiceCandidate(
  candidates: readonly ElevenLabsSharedVoiceCandidate[],
  excludedVoiceIds: ReadonlySet<string>,
  random: () => number = Math.random,
  direction = "",
): ElevenLabsSharedVoiceCandidate | null {
  const eligible = candidates.filter(
    (candidate, index) =>
      Boolean(candidate.previewUrl) &&
      !excludedVoiceIds.has(candidate.voiceId) &&
      candidates.findIndex((other) => other.voiceId === candidate.voiceId) === index,
  );
  if (eligible.length === 0) return null;
  const constraints = sharedVoiceHardConstraints(direction);
  const constrained =
    constraints.accentTerms.length > 0 || constraints.gender
      ? eligible.filter((candidate) =>
          sharedVoiceSatisfiesHardConstraints(candidate, constraints),
        )
      : eligible;
  if (constrained.length === 0) return null;
  const directionTerms = Array.from(
    new Set(direction.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []),
  ).filter((term) => term.length > 1);
  const scored = constrained.map((candidate) => {
    const searchable = [
      candidate.name,
      candidate.category,
      candidate.description ?? "",
      ...Object.entries(candidate.labels).flat(),
    ]
      .join(" ")
      .toLowerCase();
    return {
      candidate,
      score: directionTerms.reduce(
        (total, term) => total + (searchable.includes(term) ? 1 : 0),
        0,
      ),
    };
  });
  const bestScore = Math.max(...scored.map((entry) => entry.score));
  const pool =
    bestScore > 0
      ? scored
          .filter((entry) => entry.score === bestScore)
          .map((entry) => entry.candidate)
      : constrained;
  const randomValue = Math.min(0.999999999, Math.max(0, random()));
  return pool[Math.floor(randomValue * pool.length)] ?? null;
}

export interface ElevenLabsVoiceIdentity {
  voiceId: string;
  name: string;
  labels: Record<string, string>;
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
  const labels =
    payload.labels &&
    typeof payload.labels === "object" &&
    !Array.isArray(payload.labels)
      ? Object.fromEntries(
          Object.entries(payload.labels as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string",
          ),
        )
      : {};
  return { voiceId: resolvedVoiceId, name, labels };
}

export async function requestElevenLabsVoiceCatalog(args: {
  apiKey: string;
  collectionId?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ElevenLabsVoiceCatalogEntry[]> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const collectionId = args.collectionId?.trim();
  const voices = new Map<string, ElevenLabsVoiceCatalogEntry>();
  let nextPageToken: string | null = null;

  for (let page = 0; page < 25; page += 1) {
    const url = new URL("https://api.elevenlabs.io/v2/voices");
    url.searchParams.set("page_size", "100");
    url.searchParams.set("sort", "name");
    url.searchParams.set("sort_direction", "asc");
    url.searchParams.set("include_total_count", "false");
    if (collectionId) url.searchParams.set("collection_id", collectionId);
    if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);
    const response = await fetchImpl(url, {
      headers: { "xi-api-key": args.apiKey },
      signal: args.signal,
    });
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new ElevenLabsVoiceError(
        response.status,
        detail || `ElevenLabs voice catalog failed (${response.status}).`,
      );
    }
    const payload = await response.json() as {
      voices?: unknown[];
      has_more?: unknown;
      next_page_token?: unknown;
    };
    for (const value of Array.isArray(payload.voices) ? payload.voices : []) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      const voiceId = typeof record.voice_id === "string" ? record.voice_id.trim() : "";
      const name = typeof record.name === "string" ? record.name.trim() : "";
      if (!voiceId || !name) continue;
      const labels = record.labels && typeof record.labels === "object" && !Array.isArray(record.labels)
        ? Object.fromEntries(
            Object.entries(record.labels as Record<string, unknown>)
              .filter((entry): entry is [string, string] => typeof entry[1] === "string")
          )
        : {};
      const sharing = record.sharing && typeof record.sharing === "object" && !Array.isArray(record.sharing)
        ? record.sharing as Record<string, unknown>
        : null;
      const originalVoiceId =
        typeof sharing?.original_voice_id === "string"
          ? sharing.original_voice_id.trim()
          : "";
      const publicOwnerId =
        typeof sharing?.public_owner_id === "string"
          ? sharing.public_owner_id.trim()
          : "";
      const previewUrl =
        typeof record.preview_url === "string" &&
        /^https:\/\//iu.test(record.preview_url.trim())
          ? record.preview_url.trim()
          : null;
      voices.set(voiceId, {
        voiceId,
        name,
        category: typeof record.category === "string" ? record.category : null,
        description: typeof record.description === "string" ? record.description : null,
        previewUrl,
        labels,
        ...(originalVoiceId ? { originalVoiceId } : {}),
        ...(publicOwnerId ? { publicOwnerId } : {}),
      });
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

  return Array.from(voices.values());
}

/**
 * Returns only public, English, professional-quality library voices that can
 * be imported into an account. The provider query does most of this work;
 * the local checks make an unexpected provider payload safe by default.
 */
export async function requestElevenLabsSharedVoiceCandidates(args: {
  apiKey: string;
  page?: number;
  category?: "professional" | "high_quality";
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ElevenLabsSharedVoiceCandidate[]> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = new URL("https://api.elevenlabs.io/v1/shared-voices");
  url.searchParams.set("page_size", "100");
  url.searchParams.set("page", String(Math.max(0, Math.floor(args.page ?? 0))));
  const requestedCategory = args.category ?? "professional";
  url.searchParams.set("category", requestedCategory);
  url.searchParams.set("language", "en");
  url.searchParams.set("include_custom_rates", "false");
  url.searchParams.set("include_live_moderated", "false");
  const response = await fetchImpl(url, {
    headers: { "xi-api-key": args.apiKey },
    signal: args.signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new ElevenLabsVoiceError(
      response.status,
      detail || `ElevenLabs Voice Library failed (${response.status}).`,
    );
  }
  let rawPayload: unknown;
  try {
    rawPayload = await response.json();
  } catch {
    throw new ElevenLabsVoiceError(502, "ElevenLabs returned an invalid Voice Library response.");
  }
  const values =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload)
      ? (rawPayload as { voices?: unknown }).voices
      : null;
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const publicOwnerId = typeof record.public_owner_id === "string" ? record.public_owner_id.trim() : "";
    const voiceId = typeof record.voice_id === "string" ? record.voice_id.trim() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const labels = {
      ...(record.labels && typeof record.labels === "object" && !Array.isArray(record.labels)
        ? Object.fromEntries(Object.entries(record.labels as Record<string, unknown>)
            .filter((entry): entry is [string, string] => typeof entry[1] === "string"))
        : {}),
      ...Object.fromEntries(
        ["language", "accent", "gender", "age", "descriptive", "use_case"]
          .flatMap((key): Array<[string, string]> =>
            typeof record[key] === "string" && record[key].trim()
              ? [[key, record[key].trim()]]
              : [],
          ),
      ),
    };
    const language = [record.language, labels.language, labels.locale]
      .filter((item): item is string => typeof item === "string")
      .join(" ").toLowerCase();
    const category = [record.category, labels.category, labels.quality]
      .filter((item): item is string => typeof item === "string")
      .join(" ").toLowerCase().replace(/[\s-]+/gu, "_");
    const liveModerated =
      record.live_moderation_enabled === true ||
      record.live_moderated === true ||
      record.is_live_moderated === true;
    const customRates = record.custom_rates === true || record.has_custom_rates === true ||
      (typeof record.rate === "number" && record.rate > 1) ||
      (record.rate && typeof record.rate === "object" && !Array.isArray(record.rate) &&
        ((record.rate as Record<string, unknown>).custom === true ||
          (record.rate as Record<string, unknown>).is_custom === true));
    if (!publicOwnerId || !voiceId || !name ||
        (language && !(language.includes("en") || language.includes("english"))) ||
        (category && !(category.includes("professional") || category.includes("high_quality"))) ||
        liveModerated || customRates) return [];
    const previewUrl =
      typeof record.preview_url === "string" &&
      /^https:\/\//iu.test(record.preview_url.trim())
        ? record.preview_url.trim()
        : null;
    return [{
      publicOwnerId,
      voiceId,
      name,
      category:
        category.includes("high_quality") || requestedCategory === "high_quality"
          ? "high_quality"
          : "professional",
      description:
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : null,
      previewUrl,
      labels,
    }];
  });
}

export async function importElevenLabsSharedVoice(args: {
  apiKey: string;
  publicOwnerId: string;
  voiceId: string;
  name: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const publicOwnerId = args.publicOwnerId.trim();
  const voiceId = args.voiceId.trim();
  const name = args.name.trim().slice(0, 120);
  if (!publicOwnerId || !voiceId || !name) {
    throw new ElevenLabsVoiceError(400, "ElevenLabs returned an incomplete shared voice.");
  }
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(
    `https://api.elevenlabs.io/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "xi-api-key": args.apiKey },
      body: JSON.stringify({ new_name: name, bookmarked: true }),
      signal: args.signal,
    },
  );
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new ElevenLabsVoiceError(
      response.status,
      detail || `ElevenLabs could not import this voice (${response.status}).`,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ElevenLabsVoiceError(502, "ElevenLabs returned an invalid imported voice.");
  }
  const importedVoiceId = payload && typeof payload === "object" && !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).voice_id === "string"
      ? ((payload as Record<string, unknown>).voice_id as string).trim()
      : "";
  if (!importedVoiceId) {
    throw new ElevenLabsVoiceError(502, "ElevenLabs did not return the imported voice ID.");
  }
  return importedVoiceId;
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
  return voiceSpokenText(value)
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
    elevenLabsText: normalizeElevenLabsTaggedText(
      voicePerformanceTextFromActionCues(body.elevenLabsText),
      text,
    ),
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

export function resolveFrozenReplayVoiceEngine(args: {
  privacyMode: "local" | "online" | "mixed";
  requestedEngine: EnglishVoiceEngine | null;
  resolvedEngine: string | null;
}): EnglishVoiceEngine | null {
  const resolved = args.resolvedEngine?.trim().toLowerCase() ?? "";
  const engine: EnglishVoiceEngine = resolved.includes("builtin")
    ? "builtin"
    : resolved === "elevenlabs"
      ? "elevenlabs"
      : args.requestedEngine ?? "builtin";
  return args.privacyMode === "local" && engine === "elevenlabs"
    ? null
    : engine;
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
