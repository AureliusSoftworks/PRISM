import { generatePrismVoicePackWaveInProcess } from "./builtin-tts-runtime.ts";
import type {
  BuiltinTtsChildRequest,
  BuiltinTtsChildResponse,
} from "./builtin-tts-worker-client.ts";

function isGenerateRequest(value: unknown): value is BuiltinTtsChildRequest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BuiltinTtsChildRequest>;
  return (
    candidate.type === "generate" &&
    typeof candidate.id === "string" &&
    typeof candidate.text === "string" &&
    candidate.profile !== null &&
    typeof candidate.profile === "object"
  );
}

function send(response: BuiltinTtsChildResponse): void {
  if (process.connected) process.send?.(response);
}

// Keep one model and one inference in this process. Serial execution prevents
// two long replies from multiplying CPU and memory pressure.
let queue = Promise.resolve();

process.on("message", (message: unknown) => {
  if (!isGenerateRequest(message)) return;
  queue = queue.then(async () => {
    try {
      const wave = await generatePrismVoicePackWaveInProcess({
        text: message.text,
        profile: message.profile,
      });
      send({
        type: "result",
        id: message.id,
        waveBase64: wave.toString("base64"),
      });
    } catch (error) {
      send({
        type: "error",
        id: message.id,
        name: error instanceof Error ? error.name : "Error",
        message:
          error instanceof Error
            ? error.message
            : "The local voice worker could not synthesize speech.",
      });
    }
  });
});

// An IPC disconnect means the API parent is gone. Drop the listener and let
// Node drain naturally; forcing process.exit while ONNX tears down native
// threads can trip a libc++ mutex failure on macOS.
process.on("disconnect", () => process.removeAllListeners("message"));
