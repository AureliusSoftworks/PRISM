import { resolve, sep } from "node:path";
import {
  applyLocalVoiceSpeechprintToIpa,
  localVoicePronunciationOverrideIsActive,
  localVoiceSpeechprintIsActive,
  normalizeBotAudioVoiceProfileV1,
  normalizeLocalVoiceSpeechprintV1,
  prismBuiltinEnglishVoice,
  resolveLocalVoicePronunciationLocale,
  type BotAudioVoiceProfileV1,
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
}): Promise<Buffer> {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const voice = prismBuiltinEnglishVoice(profile.baseVoiceId);
  const tts = await getKokoroTts();
  const speechprint = normalizeLocalVoiceSpeechprintV1({
    influence: profile.speechprintInfluence,
    strength: profile.speechprintStrength,
    variationSeed: profile.speechprintVariationSeed,
  });
  const options = {
    voice: voice.engineVoiceId,
    // Pace is applied once by PRISM's formant-preserving playback worklet.
    speed: 1,
  } as const;
  const pronunciationLocale = resolveLocalVoicePronunciationLocale(
    profile.pronunciationBase,
    voice.locale,
  );
  const phonemeControlActive =
    localVoiceSpeechprintIsActive(speechprint) ||
    localVoicePronunciationOverrideIsActive(
      profile.pronunciationBase,
      voice.locale,
    );
  const audio = phonemeControlActive
    ? await generateSpeechprintAudio({
        text: args.text,
        locale: pronunciationLocale,
        speechprint,
        protectedPhrases: args.protectedPhrases,
        tts,
        options,
      })
    : await tts.generate(args.text, options);
  return Buffer.from(audio.toWav());
}

function escapedPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function protectedSpeechRanges(
  text: string,
  phrases: readonly string[] | undefined,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const normalizedPhrases = [...new Set(
    (phrases ?? [])
      .map((phrase) => phrase.replace(/\s+/gu, " ").trim())
      .filter((phrase) => phrase.length > 0 && phrase.length <= 160),
  )].sort((left, right) => right.length - left.length);
  if (normalizedPhrases.length > 0) {
    const phrasePattern = new RegExp(
      normalizedPhrases.map(escapedPattern).join("|"),
      "giu",
    );
    for (const match of text.matchAll(phrasePattern)) {
      if (match.index === undefined) continue;
      ranges.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  const tokenPattern = /\b[\p{L}\p{N}]+(?:[-_/\\][\p{L}\p{N}_/\\-]+)+\b|\b[A-Z]{2,}\b|\b[\p{L}\p{N}]*\d[\p{L}\p{N}]*\b/gu;
  for (const match of text.matchAll(tokenPattern)) {
    if (match.index === undefined) continue;
    ranges.push({ start: match.index, end: match.index + match[0].length });
  }
  return ranges
    .sort((left, right) => left.start - right.start || right.end - left.end)
    .reduce<Array<{ start: number; end: number }>>((merged, range) => {
      const previous = merged.at(-1);
      if (!previous || range.start > previous.end) {
        merged.push({ ...range });
      } else {
        previous.end = Math.max(previous.end, range.end);
      }
      return merged;
    }, []);
}

async function phonemizeEnglish(text: string, locale: string): Promise<string> {
  const lines = await phonemize(text, locale === "en-GB" ? "en" : "en-us");
  return lines.join(" ").trim();
}

async function generateSpeechprintAudio(args: {
  text: string;
  locale: string;
  speechprint: ReturnType<typeof normalizeLocalVoiceSpeechprintV1>;
  protectedPhrases?: readonly string[];
  tts: import("kokoro-js").KokoroTTS;
  options: NonNullable<Parameters<import("kokoro-js").KokoroTTS["generate"]>[1]>;
}): Promise<Awaited<ReturnType<import("kokoro-js").KokoroTTS["generate"]>>> {
  if (
    typeof args.tts.tokenizer !== "function" ||
    typeof args.tts.generate_from_ids !== "function"
  ) {
    throw new Error(
      "Pinned Kokoro 1.2.1 phoneme/token-ID interface is unavailable.",
    );
  }
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
    const ipa = await phonemizeEnglish(part.text, args.locale);
    if (!ipa) continue;
    phonemes.push(
      part.protected
        ? ipa
        : applyLocalVoiceSpeechprintToIpa({
            ipa,
            speechprint: args.speechprint,
          }).ipa,
    );
  }
  const transformedIpa = phonemes.join(" ").replace(/\s+/gu, " ").trim();
  if (!transformedIpa) return args.tts.generate(args.text, args.options);
  const { input_ids } = args.tts.tokenizer(transformedIpa, {
    truncation: true,
  });
  return args.tts.generate_from_ids(input_ids, args.options);
}
