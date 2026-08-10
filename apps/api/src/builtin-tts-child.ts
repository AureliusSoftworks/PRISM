import type {
  BuiltinTtsChildRequest,
  BuiltinTtsChildResponse,
} from "./builtin-tts-worker-client.ts";
import {
  isClosedBuiltinTtsIpcError,
  sendBuiltinTtsChildResponse,
} from "./builtin-tts-child-ipc.ts";

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

function send(response: BuiltinTtsChildResponse): Promise<boolean> {
  return sendBuiltinTtsChildResponse(
    process as unknown as import("./builtin-tts-child-ipc.ts").BuiltinTtsChildIpcSender,
    response,
  );
}

let runtimePromise: Promise<typeof import("./builtin-tts-runtime.ts")> | null =
  null;

function loadRuntime(): Promise<typeof import("./builtin-tts-runtime.ts")> {
  runtimePromise ??= import("./builtin-tts-runtime.ts");
  return runtimePromise;
}

// Keep one model and one inference in this process. Serial execution prevents
// two long replies from multiplying CPU and memory pressure.
let queue = Promise.resolve();

process.on("message", (message: unknown) => {
  if (!isGenerateRequest(message)) return;
  queue = queue.then(async () => {
    try {
      const { generatePrismVoicePackWaveInProcess } = await loadRuntime();
      const wave = await generatePrismVoicePackWaveInProcess({
        text: message.text,
        profile: message.profile,
        protectedPhrases: message.protectedPhrases,
      });
      await send({
        type: "result",
        id: message.id,
        waveBase64: wave.toString("base64"),
      });
    } catch (error) {
      await send({
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

// `process.send(..., callback)` handles the ordinary close race. Keep a narrow
// process-level guard as defense in depth for Node versions that still emit an
// IPC error event while native work is finishing. Unknown process errors keep
// a failing exit status instead of being mistaken for a harmless disconnect.
process.on("error", (error) => {
  if (isClosedBuiltinTtsIpcError(error)) return;
  console.error("[builtin-tts] child process error:", error);
  process.exitCode = 1;
});

// An IPC disconnect means the API parent is gone. Drop the listener and let
// Node drain naturally; forcing process.exit while ONNX tears down native
// threads can trip a libc++ mutex failure on macOS.
process.on("disconnect", () => process.removeAllListeners("message"));

// Signal only after the request listener is installed. Loading Kokoro and the
// Emscripten phonemizer stays lazy inside the serialized first job, after this
// child has safely taken ownership of the request.
void send({ type: "ready" });
