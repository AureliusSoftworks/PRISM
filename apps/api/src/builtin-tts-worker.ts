import { createRequire } from "node:module";
import { parentPort, workerData } from "node:worker_threads";
import { join } from "node:path";
import { encodePcm16Wave } from "./builtin-tts-audio.ts";

interface SherpaAudio {
  samples: Float32Array;
  sampleRate: number;
}

interface SherpaTts {
  generate(args: {
    text: string;
    generationConfig: unknown;
  }): SherpaAudio;
}

interface SherpaModule {
  OfflineTts: new (config: unknown) => SherpaTts;
  GenerationConfig: new (config: unknown) => unknown;
}

const require = createRequire(import.meta.url);
const sherpa = require("sherpa-onnx-node") as SherpaModule;
const modelDir = String((workerData as { modelDir?: unknown }).modelDir ?? "");
const tts = new sherpa.OfflineTts({
  model: {
    kitten: {
      model: join(modelDir, "model.fp16.onnx"),
      voices: join(modelDir, "voices.bin"),
      tokens: join(modelDir, "tokens.txt"),
      dataDir: join(modelDir, "espeak-ng-data"),
    },
    debug: false,
    numThreads: 1,
    provider: "cpu",
  },
  maxNumSentences: 1,
});

parentPort?.on("message", (message: unknown) => {
  if (!message || typeof message !== "object" || Array.isArray(message)) return;
  const request = message as Record<string, unknown>;
  const id = typeof request.id === "number" ? request.id : -1;
  try {
    const generationConfig = new sherpa.GenerationConfig({
      sid: typeof request.speakerId === "number" ? request.speakerId : 0,
      speed: typeof request.speed === "number" ? request.speed : 1,
      silenceScale: 0.2,
    });
    const audio = tts.generate({
      text: String(request.text ?? ""),
      generationConfig,
    });
    const wave = encodePcm16Wave(audio.samples, audio.sampleRate);
    parentPort?.postMessage({ id, ok: true, wave }, [wave.buffer as ArrayBuffer]);
  } catch (error) {
    parentPort?.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Built-in speech generation failed.",
    });
  }
});
