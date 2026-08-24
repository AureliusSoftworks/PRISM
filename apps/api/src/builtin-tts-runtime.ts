import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve, sep } from "node:path";
import {
  applyLocalVoiceSpeechprintToIpa,
  applyVoiceAccentFieldToIpa,
  builtinAccentRealizationBlend,
  builtinMelodicityRealizationBlend,
  builtinMoodRealizationBlend,
  enforceAmericanRhoticIpa,
  localVoicePronunciationOverrideIsActive,
  protectedSpeechRanges,
  type BuiltinAccentRealizationBlendV1,
  localVoiceSpeechprintIsActive,
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAudioVoiceProfileForSynthesisV1,
  normalizeLocalVoiceSpeechprintV1,
  prismBuiltinEnglishVoice,
  resolveLocalAccentFallback,
  resolveLocalVoicePronunciationLocale,
  resolveVoiceAccentField,
  voiceAccentDefinitionForId,
  voiceAccentDefinitionForLegacyProfile,
  type BotAudioVoiceProfileV1,
  type PrismBuiltinEnglishVoice,
  type VoiceAccentFieldResolutionV1,
} from "@localai/shared";
import { phonemize } from "phonemizer";
import {
  PRISM_BUILTIN_TTS_MODEL_ID,
  prismBuiltinTtsModelRoot,
} from "./builtin-tts-assets.ts";

export {
  PRISM_BUILTIN_TTS_MODEL_ID,
  prismBuiltinTtsModelRoot,
} from "./builtin-tts-assets.ts";

export interface PrismVoicePackPronunciationPlan {
  sourceText: string;
  engineVoiceId: PrismBuiltinEnglishVoice["engineVoiceId"];
  voiceLocale: string;
  targetLocale: "en-US" | "en-GB";
  targetIpa: string | null;
}

export interface AccentMapTargetIpaPlan {
  sourceText: string;
  targetLocale: "en-US" | "en-GB";
  targetIpa: string | null;
}

let kokoroTtsPromise: Promise<import("kokoro-js").KokoroTTS> | null = null;
let kokoroModelRoot: string | null = null;

function normalizedModelRoot(path: string): string {
  const normalized = resolve(path);
  return normalized.endsWith(sep) ? normalized : `${normalized}${sep}`;
}

async function getKokoroTts(): Promise<import("kokoro-js").KokoroTTS> {
  const modelRoot = prismBuiltinTtsModelRoot();
  if (!modelRoot) {
    throw new Error(
      "PRISM's built-in voice pack is not installed. Re-run the runtime staging step.",
    );
  }
  if (kokoroTtsPromise && kokoroModelRoot === modelRoot) return kokoroTtsPromise;

  kokoroModelRoot = modelRoot;
  kokoroTtsPromise = (async () => {
    const [{ env }, { KokoroTTS }] = await Promise.all([
      import("@huggingface/transformers"),
      import("kokoro-js"),
    ]);
    // A LOCAL speech request must never turn a missing model into a download.
    // Installed desktop and Docker builds stage the pinned model ahead of time.
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = normalizedModelRoot(modelRoot);
    env.useFSCache = false;
    return KokoroTTS.from_pretrained(PRISM_BUILTIN_TTS_MODEL_ID, {
      dtype: "q8",
      device: "cpu",
    });
  })().catch((error) => {
    kokoroTtsPromise = null;
    kokoroModelRoot = null;
    throw error;
  });
  return kokoroTtsPromise;
}

/** Runs only inside the dedicated speech child process. */
export async function generatePrismVoicePackWaveInProcess(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  protectedPhrases?: readonly string[];
  deliveryMood?: unknown;
}): Promise<Buffer> {
  const tts = await getKokoroTts();
  const pronunciation = await preparePrismVoicePackPronunciation(args);
  const options = {
    voice: pronunciation.engineVoiceId,
    // Pace is applied once by PRISM's formant-preserving playback worklet.
    speed: 1,
  } as const;
  // Style dominates phoneme tokens, so both accents and delivery moods are
  // realized as measured directions in style space. The deltas compose: a
  // guarded Texan stays a guarded Texan.
  const profileForBlends =
    normalizeBotAudioVoiceProfileForSynthesisV1(args.profile);
  const blends = [
    builtinAccentRealizationBlend({
      engineVoiceId: pronunciation.engineVoiceId,
      targetLocale: pronunciation.targetLocale,
    }),
    builtinMoodRealizationBlend({
      engineVoiceId: pronunciation.engineVoiceId,
      deliveryMood: args.deliveryMood,
    }),
    // Dialect melodic range: Irish widens, Scottish narrows, South Asian
    // English lifts slightly — the style-space floor under the client-side
    // intonation contour.
    builtinMelodicityRealizationBlend({
      engineVoiceId: pronunciation.engineVoiceId,
      accentDefinitionId: profileForBlends.accentDefinitionId,
      speechprintInfluence: profileForBlends.speechprintInfluence,
    }),
  ].filter(
    (blend): blend is BuiltinAccentRealizationBlendV1 => blend !== null,
  );
  // A mood without an accent pin still needs the direct style path: phonemize
  // the text exactly as the plain engine path would (no enforcement, no
  // accent rules) so only the delivery changes, never the pronunciation.
  const targetIpa =
    pronunciation.targetIpa ??
    (blends.length > 0
      ? await phonemizeEnglish(pronunciation.sourceText, pronunciation.targetLocale)
      : null);
  const audio = targetIpa
    ? await generateTargetIpaAudio({
        sourceText: pronunciation.sourceText,
        targetIpa,
        tts,
        options,
        blends,
      })
    : await tts.generate(pronunciation.sourceText, options);
  return Buffer.from(audio.toWav());
}

let kokoroVoicesDirCache: string | null | undefined;

function kokoroVoicesDirectory(): string | null {
  if (kokoroVoicesDirCache !== undefined) return kokoroVoicesDirCache;
  try {
    // The engine resolves voice styles from its own package layout
    // (`dist/../voices`); mirror that so no network path can ever be involved.
    const requireFromHere = createRequire(import.meta.url);
    kokoroVoicesDirCache = join(
      dirname(requireFromHere.resolve("kokoro-js")),
      "..",
      "voices",
    );
  } catch {
    kokoroVoicesDirCache = null;
  }
  return kokoroVoicesDirCache;
}

const builtinVoiceStyleCache = new Map<string, Float32Array>();

function builtinVoiceStyle(engineVoiceId: string): Float32Array | null {
  if (!/^[a-z]{2}_[a-z]+$/u.test(engineVoiceId)) return null;
  const cached = builtinVoiceStyleCache.get(engineVoiceId);
  if (cached) return cached;
  const voicesDir = kokoroVoicesDirectory();
  if (!voicesDir) return null;
  try {
    const bin = readFileSync(join(voicesDir, `${engineVoiceId}.bin`));
    const style = new Float32Array(
      bin.buffer,
      bin.byteOffset,
      Math.floor(bin.byteLength / 4),
    );
    builtinVoiceStyleCache.set(engineVoiceId, style);
    return style;
  } catch {
    return null;
  }
}

/**
 * Resolve the Accent Map into target IPA without changing the visible source
 * text or the selected voice identity. Explicit map targets always take the
 * phoneme path so pronunciation never falls back to a voice name or locale.
 */
export async function preparePrismVoicePackPronunciation(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  protectedPhrases?: readonly string[];
}): Promise<PrismVoicePackPronunciationPlan> {
  const profile = normalizeBotAudioVoiceProfileForSynthesisV1(args.profile);
  const voice = prismBuiltinEnglishVoice(profile.baseVoiceId);
  const target = await prepareAccentMapTargetIpa({
    ...args,
    voiceLocale: voice.locale,
  });
  return {
    sourceText: target.sourceText,
    engineVoiceId: voice.engineVoiceId,
    voiceLocale: voice.locale,
    targetLocale: target.targetLocale,
    targetIpa: target.targetIpa,
  };
}

/**
 * Resolve the provider-neutral Accent Map into target IPA. This helper stays
 * independent from voice identity so Local and Premium can share the exact
 * same phonology while rendering it through different engines.
 */
export async function prepareAccentMapTargetIpa(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  protectedPhrases?: readonly string[];
  voiceLocale?: string;
}): Promise<AccentMapTargetIpaPlan> {
  const profile = normalizeBotAudioVoiceProfileForSynthesisV1(args.profile);
  const voiceLocale =
    args.voiceLocale ?? prismBuiltinEnglishVoice(profile.baseVoiceId).locale;
  const localAccent = resolveLocalAccentFallback({
    accentDefinitionId: profile.accentDefinitionId,
    pronunciationBase: profile.pronunciationBase,
    speechprintInfluence: profile.speechprintInfluence,
  });
  const speechprint = normalizeLocalVoiceSpeechprintV1({
    influence: localAccent.speechprintInfluence,
    strength: profile.speechprintStrength,
    variationSeed: profile.speechprintVariationSeed,
  });
  const accentField = resolveVoiceAccentField({
    point: profile.pronunciationMapPoint,
    accentDefinitionId: profile.accentDefinitionId,
    pronunciationBase: profile.pronunciationBase,
    speechprintInfluence: profile.speechprintInfluence,
  });
  const fieldPrimary = accentField.layers[0];
  const targetLocale = resolveLocalVoicePronunciationLocale(
    fieldPrimary?.pronunciationBase ?? localAccent.pronunciationBase,
    voiceLocale,
  );
  const phonemeControlActive =
    (!accentField.legacy && accentField.layers.length > 0) ||
    (voiceAccentDefinitionForId(profile.accentDefinitionId) ??
      voiceAccentDefinitionForLegacyProfile({
        pronunciationBase: profile.pronunciationBase,
        speechprintInfluence: profile.speechprintInfluence,
      })) !== null ||
    localVoiceSpeechprintIsActive(speechprint) ||
    localVoicePronunciationOverrideIsActive(
      localAccent.pronunciationBase,
      voiceLocale,
    );
  return {
    sourceText: args.text,
    targetLocale,
    targetIpa: phonemeControlActive
      ? await buildTargetIpa({
          text: args.text,
          locale: targetLocale,
          speechprint,
          accentField,
          protectedPhrases: args.protectedPhrases,
        })
      : null,
  };
}

export { protectedSpeechRanges };

async function phonemizeEnglish(text: string, locale: string): Promise<string> {
  const lines = await phonemize(text, locale === "en-GB" ? "en" : "en-us");
  return lines.join(" ").trim();
}

async function buildTargetIpa(args: {
  text: string;
  locale: string;
  speechprint: ReturnType<typeof normalizeLocalVoiceSpeechprintV1>;
  accentField: VoiceAccentFieldResolutionV1;
  protectedPhrases?: readonly string[];
}): Promise<string> {
  const ranges = protectedSpeechRanges(args.text, args.protectedPhrases);
  const parts: Array<{ text: string; protected: boolean }> = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({ text: args.text.slice(cursor, range.start), protected: false });
    }
    parts.push({ text: args.text.slice(range.start, range.end), protected: true });
    cursor = range.end;
  }
  if (cursor < args.text.length) {
    parts.push({ text: args.text.slice(cursor), protected: false });
  }
  if (parts.length === 0) parts.push({ text: args.text, protected: false });
  const phonemes: string[] = [];
  for (const part of parts) {
    if (!part.text.trim()) continue;
    const phonemized = await phonemizeEnglish(part.text, args.locale);
    if (!phonemized) continue;
    // Hard-R enforcement is base normalization, not accent styling: it runs on
    // every part — protected ranges included — whenever the target base is
    // en-US, mirroring how the base locale itself applies to protected parts.
    const ipa =
      args.locale === "en-GB"
        ? phonemized
        : enforceAmericanRhoticIpa(phonemized).ipa;
    phonemes.push(
      part.protected
        ? ipa
        : args.accentField.legacy
          ? applyLocalVoiceSpeechprintToIpa({
              ipa,
              speechprint: args.speechprint,
            }).ipa
          : applyVoiceAccentFieldToIpa({
              ipa,
              resolution: args.accentField,
              strength: args.speechprint.strength,
              variationSeed: args.speechprint.variationSeed,
            }).ipa,
    );
  }
  return phonemes.join(" ").replace(/\s+/gu, " ").trim();
}

async function generateTargetIpaAudio(args: {
  sourceText: string;
  targetIpa: string;
  tts: import("kokoro-js").KokoroTTS;
  options: NonNullable<Parameters<import("kokoro-js").KokoroTTS["generate"]>[1]>;
  blends?: readonly BuiltinAccentRealizationBlendV1[];
}): Promise<Awaited<ReturnType<import("kokoro-js").KokoroTTS["generate"]>>> {
  if (
    typeof args.tts.tokenizer !== "function" ||
    typeof args.tts.generate_from_ids !== "function"
  ) {
    throw new Error(
      "Pinned Kokoro 1.2.1 phoneme/token-ID interface is unavailable.",
    );
  }
  if (!args.targetIpa) return args.tts.generate(args.sourceText, args.options);
  const { input_ids } = args.tts.tokenizer(args.targetIpa, {
    truncation: true,
  });
  if (args.blends && args.blends.length > 0) {
    const blended = await generateBlendedStyleAudio({
      input_ids,
      tts: args.tts,
      voice: String(args.options.voice ?? ""),
      blends: args.blends,
    });
    if (blended) return blended;
    // A missing style surface falls back to the plain voice: speech keeps
    // working and the accent still carries the target IPA.
  }
  return args.tts.generate_from_ids(input_ids, args.options);
}

function builtinVoiceStyleGroupMean(
  engineVoiceIds: readonly string[],
  offset: number,
): Float64Array | null {
  if (engineVoiceIds.length === 0) return null;
  const mean = new Float64Array(256);
  for (const engineVoiceId of engineVoiceIds) {
    const style = builtinVoiceStyle(engineVoiceId);
    if (!style || style.length < offset + 256) return null;
    for (let index = 0; index < 256; index += 1) {
      mean[index] += style[offset + index]!;
    }
  }
  for (let index = 0; index < 256; index += 1) {
    mean[index] /= engineVoiceIds.length;
  }
  return mean;
}

/**
 * Reproduces the pinned Kokoro 1.2.1 style path (256-float row selected by
 * token count) with one change: the row is translated by the accent
 * directions — accent (target region minus native region) and delivery mood,
 * summed. Each direction's groups are balanced so only the intended quality
 * moves, and a uniform translation preserves each voice's distance from every
 * other voice, so bots keep distinct voices. Tokens and pacing are untouched.
 */
async function generateBlendedStyleAudio(args: {
  input_ids: ReturnType<import("kokoro-js").KokoroTTS["tokenizer"]>["input_ids"];
  tts: import("kokoro-js").KokoroTTS;
  voice: string;
  blends: readonly BuiltinAccentRealizationBlendV1[];
}): Promise<Awaited<ReturnType<import("kokoro-js").KokoroTTS["generate"]>> | null> {
  const model = (args.tts as unknown as {
    model?: (inputs: Record<string, unknown>) => Promise<{
      waveform: { data: Float32Array };
    }>;
  }).model;
  if (typeof model !== "function") return null;
  const baseStyle = builtinVoiceStyle(args.voice);
  if (!baseStyle) return null;
  const tokenCount = Math.min(
    Math.max((args.input_ids.dims.at(-1) ?? 2) - 2, 0),
    509,
  );
  const offset = 256 * tokenCount;
  if (baseStyle.length < offset + 256) return null;
  const mixed = new Float32Array(256);
  for (let index = 0; index < 256; index += 1) {
    mixed[index] = baseStyle[offset + index]!;
  }
  for (const blend of args.blends) {
    const toward = builtinVoiceStyleGroupMean(blend.towardEngineVoiceIds, offset);
    const away = builtinVoiceStyleGroupMean(blend.awayEngineVoiceIds, offset);
    if (!toward || !away) return null;
    const weight = Math.max(0, Math.min(2, blend.weight));
    for (let index = 0; index < 256; index += 1) {
      mixed[index] += weight * (toward[index]! - away[index]!);
    }
  }
  const { Tensor, RawAudio } = await import("@huggingface/transformers");
  const { waveform } = await model({
    input_ids: args.input_ids,
    style: new Tensor("float32", mixed, [1, 256]),
    speed: new Tensor("float32", [1], [1]),
  });
  return new RawAudio(waveform.data, 24_000);
}
