import { existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import {
  normalizeBotAudioVoiceProfileV1,
  prismBuiltinEnglishVoice,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

export const PRISM_BUILTIN_TTS_MODEL_ID =
  "onnx-community/Kokoro-82M-v1.0-ONNX";

const PRISM_BUILTIN_TTS_REQUIRED_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
] as const;

let kokoroTtsPromise: Promise<import("kokoro-js").KokoroTTS> | null = null;
let kokoroModelRoot: string | null = null;

function normalizedModelRoot(path: string): string {
  const normalized = resolve(path);
  return normalized.endsWith(sep) ? normalized : `${normalized}${sep}`;
}

export function prismBuiltinTtsModelRoot(
  cwd = process.cwd(),
  configuredRoot = process.env.PRISM_BUILTIN_TTS_MODEL_DIR,
): string | null {
  const candidates = [
    configuredRoot,
    join(cwd, "models"),
    join(cwd, "runtime", "models"),
    join(cwd, ".cache", "prism-models"),
    // Workspace commands run from either the repo root or apps/api.
    join(cwd, "..", "..", ".cache", "prism-models"),
  ].filter((value): value is string => Boolean(value?.trim()));
  return (
    candidates.find((root) =>
      PRISM_BUILTIN_TTS_REQUIRED_FILES.every((file) =>
        existsSync(join(root, PRISM_BUILTIN_TTS_MODEL_ID, file)),
      ),
    ) ?? null
  );
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
}): Promise<Buffer> {
  const profile = normalizeBotAudioVoiceProfileV1(args.profile);
  const voice = prismBuiltinEnglishVoice(profile.baseVoiceId);
  const tts = await getKokoroTts();
  const audio = await tts.generate(args.text, {
    voice: voice.engineVoiceId,
    // Pace is applied once by PRISM's formant-preserving playback worklet.
    speed: 1,
  });
  return Buffer.from(audio.toWav());
}
