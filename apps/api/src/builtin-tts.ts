import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { type BotAudioVoiceProfileV1 } from "@localai/shared";
import { builtinEnglishGenerationSettings } from "./builtin-tts-audio.ts";

const MODEL_NAME = "kitten-nano-en-v0_2-fp16";

export function resolveBuiltinEnglishModelDir(): string | null {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.PRISM_TTS_MODEL_DIR,
    resolve(moduleDir, "../tts-models", MODEL_NAME),
    resolve(moduleDir, "../../tts-models", MODEL_NAME),
    resolve(process.cwd(), "tts-models", MODEL_NAME),
    resolve(process.cwd(), "apps/api/tts-models", MODEL_NAME),
  ].filter((value): value is string => Boolean(value));
  return candidates.find((candidate) =>
    existsSync(resolve(candidate, "model.fp16.onnx")) &&
    existsSync(resolve(candidate, "voices.bin")) &&
    existsSync(resolve(candidate, "tokens.txt")) &&
    existsSync(resolve(candidate, "espeak-ng-data"))
  ) ?? null;
}

interface PendingRequest {
  resolve: (wave: Buffer) => void;
  reject: (error: Error) => void;
  abortCleanup: () => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

function failWorker(error: Error): void {
  const current = worker;
  worker = null;
  if (current) void current.terminate();
  for (const request of pending.values()) {
    request.abortCleanup();
    request.reject(error);
  }
  pending.clear();
}

function getWorker(modelDir: string): Worker {
  if (worker) return worker;
  const filename = import.meta.url.endsWith(".ts")
    ? "builtin-tts-worker.ts"
    : "builtin-tts-worker.js";
  const created = new Worker(new URL(filename, import.meta.url), {
    workerData: { modelDir },
  });
  created.on("message", (message: unknown) => {
    if (!message || typeof message !== "object" || Array.isArray(message)) return;
    const response = message as Record<string, unknown>;
    const id = typeof response.id === "number" ? response.id : -1;
    const request = pending.get(id);
    if (!request) return;
    pending.delete(id);
    request.abortCleanup();
    if (response.ok === true && response.wave instanceof Uint8Array) {
      request.resolve(Buffer.from(response.wave));
      return;
    }
    request.reject(new Error(
      typeof response.error === "string"
        ? response.error
        : "Built-in speech generation failed."
    ));
  });
  created.on("error", (error) => failWorker(error));
  created.on("exit", (code) => {
    if (worker === created && code !== 0) {
      failWorker(new Error(`Built-in speech worker stopped (${code}).`));
    } else if (worker === created) {
      worker = null;
    }
  });
  // The HTTP server already owns process lifetime. Keeping this cached worker
  // unreferenced lets tests and graceful shutdowns exit once the server closes.
  created.unref();
  worker = created;
  return created;
}

export function builtinEnglishAvailable(): boolean {
  return resolveBuiltinEnglishModelDir() !== null;
}

export function generateBuiltinEnglishWave(args: {
  text: string;
  profile: BotAudioVoiceProfileV1;
  signal?: AbortSignal;
}): Promise<Buffer> {
  const modelDir = resolveBuiltinEnglishModelDir();
  if (!modelDir) {
    return Promise.reject(new Error("Bundled English voice model is unavailable."));
  }
  if (args.signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  const id = nextRequestId++;
  const settings = builtinEnglishGenerationSettings(args.profile);
  return new Promise<Buffer>((resolveRequest, rejectRequest) => {
    const onAbort = () => {
      failWorker(new DOMException("Aborted", "AbortError"));
    };
    args.signal?.addEventListener("abort", onAbort, { once: true });
    pending.set(id, {
      resolve: resolveRequest,
      reject: rejectRequest,
      abortCleanup: () => args.signal?.removeEventListener("abort", onAbort),
    });
    getWorker(modelDir).postMessage({
      id,
      text: args.text,
      speakerId: settings.speakerId,
      speed: settings.speed,
    });
  });
}
