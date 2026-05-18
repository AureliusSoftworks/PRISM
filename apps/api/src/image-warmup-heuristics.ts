/**
 * Detects upstream messages that usually mean the GPU-backed engine is still loading a
 * checkpoint or juggling VRAM — not a permanent failure. Used to return 503 + clearer copy
 * instead of a generic 400/500-style message.
 */
export function looksLikeBackendModelWarmupMessage(message: string): boolean {
  const m = message.toLowerCase();
  if (m.includes("internal server error")) return true;
  if (m.includes("gateway timeout") || m.includes("504")) return true;
  if (m.includes("loading checkpoint") || m.includes("loading model")) return true;
  if (m.includes("model") && (m.includes("not loaded") || m.includes("still loading"))) {
    return true;
  }
  if (m.includes("out of memory") || m.includes("outofmemory") || m.includes("cuda") || m.includes("cudnn")) {
    return true;
  }
  if (m.includes("nvidia") && m.includes("error")) return true;
  if (m.includes("vram") || m.includes("gpu memory")) return true;
  if (m.includes("warm") && (m.includes("up") || m.includes("ing"))) return true;
  return false;
}

export const MODEL_WARMUP_USER_MESSAGE =
  "The image engine is still loading the model into GPU memory (or juggling VRAM). Wait a bit and try again — the first run after idle can take several minutes.";

export const MODEL_TIMEOUT_USER_MESSAGE =
  "Image generation timed out while the model was still loading or rendering. Try again — the next attempt is usually faster once the model stays in memory.";

/**
 * Ollama sometimes returns JSON like `Post "http://127.0.0.1:PORT/completion": EOF`
 * when the llama.cpp-backed runner exits mid-request (VRAM, crash, or slow first load).
 */
export const OLLAMA_IMAGE_RUNNER_INTERRUPTED_MESSAGE =
  "The local image engine stopped mid-run. That often means the model was still loading into GPU memory, the GPU ran out of memory, or Ollama's runner crashed. Wait a minute and try again. If it keeps happening, try a smaller image model or restart Ollama.";

export function looksLikeOllamaRunnerInterruptedMessage(message: string): boolean {
  const m = message.toLowerCase();
  if (!m.includes("eof")) return false;
  return (
    m.includes("completion") ||
    m.includes("127.0.0.1") ||
    m.includes("localhost") ||
    m.includes("post ")
  );
}
