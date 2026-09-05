import { existsSync } from "node:fs";
import { join } from "node:path";

export const PRISM_BUILTIN_TTS_MODEL_ID =
  "onnx-community/Kokoro-82M-v1.0-ONNX";

const PRISM_BUILTIN_TTS_REQUIRED_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "onnx/model_quantized.onnx",
] as const;

/**
 * Lightweight model discovery shared by the API parent and speech worker.
 * Keep native synthesis imports out of this module so merely starting the API
 * or an integration test never initializes the Emscripten phonemizer.
 */
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
