import { replayAuthHeaders } from "./replayClient";

type WorkerResponse =
  | { type: "ready" }
  | { type: "audio-added"; sequence: number }
  | { type: "done" }
  | { type: "error"; error: string };

function postAndWait(
  worker: Worker,
  message: unknown,
  matches: (response: WorkerResponse) => boolean,
  transfer: Transferable[] = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
    };
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === "error") {
        cleanup();
        reject(new Error(event.data.error));
      } else if (matches(event.data)) {
        cleanup();
        resolve();
      }
    };
    const onError = (event: ErrorEvent) => {
      cleanup();
      reject(new Error(event.message || "Replay audio worker crashed."));
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(message, transfer);
  });
}

export async function encodeReplayRenderAudio(args: {
  recordingId: string;
  renderToken: string;
  title: string;
  audioBuffer: AudioBuffer;
}): Promise<void> {
  if (typeof Worker === "undefined") {
    throw new Error("This Chromium runtime cannot encode replay audio.");
  }
  const worker = new Worker(
    new URL("./replayAudioEncoder.worker.ts", import.meta.url),
    { type: "module" },
  );
  try {
    await postAndWait(
      worker,
      {
        type: "init",
        recordingId: args.recordingId,
        renderToken: args.renderToken,
        authHeaders: replayAuthHeaders(),
        sampleRate: args.audioBuffer.sampleRate,
        numberOfChannels: args.audioBuffer.numberOfChannels,
        title: args.title,
      },
      (response) => response.type === "ready",
    );

    const channels = Array.from(
      { length: args.audioBuffer.numberOfChannels },
      (_, channel) => args.audioBuffer.getChannelData(channel),
    );
    const chunkFrames = Math.max(1, Math.round(args.audioBuffer.sampleRate));
    let sequence = 0;
    for (let cursor = 0; cursor < args.audioBuffer.length; cursor += chunkFrames) {
      const frameCount = Math.min(chunkFrames, args.audioBuffer.length - cursor);
      const interleaved = new Float32Array(
        frameCount * args.audioBuffer.numberOfChannels,
      );
      for (let frame = 0; frame < frameCount; frame += 1) {
        for (let channel = 0; channel < channels.length; channel += 1) {
          interleaved[frame * channels.length + channel] =
            channels[channel]?.[cursor + frame] ?? 0;
        }
      }
      const currentSequence = sequence++;
      await postAndWait(
        worker,
        {
          type: "audio",
          sequence: currentSequence,
          timestamp: cursor / args.audioBuffer.sampleRate,
          data: interleaved.buffer,
        },
        (response) =>
          response.type === "audio-added" &&
          response.sequence === currentSequence,
        [interleaved.buffer],
      );
    }
    await postAndWait(
      worker,
      { type: "finish" },
      (response) => response.type === "done",
    );
  } finally {
    worker.terminate();
  }
}
