import { replayAuthHeaders } from "./replayClient";
import { copyReplayAudioChannels } from "./replayAudioPcm";

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
  await encodeReplayAudioWindows({
    recordingId: args.recordingId,
    renderToken: args.renderToken,
    title: args.title,
    uploadPath: `/api/replays/${encodeURIComponent(args.recordingId)}/render-audio-chunk`,
    windows: (async function* () {
      yield args.audioBuffer;
    })(),
  });
}

export async function encodeReplayAudioWindows(args: {
  recordingId: string;
  renderToken: string;
  title: string;
  uploadPath: string;
  windows: AsyncIterable<AudioBuffer>;
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
        sampleRate: 48_000,
        numberOfChannels: 2,
        title: args.title,
        uploadPath: args.uploadPath,
      },
      (response) => response.type === "ready",
    );

    let sequence = 0;
    let timestampFrames = 0;
    for await (const audioBuffer of args.windows) {
      const channels = copyReplayAudioChannels(audioBuffer);
      const frameCount = audioBuffer.length;
      const currentSequence = sequence++;
      await postAndWait(
        worker,
        {
          type: "audio",
          sequence: currentSequence,
          timestamp: timestampFrames / 48_000,
          channels,
        },
        (response) =>
          response.type === "audio-added" &&
          response.sequence === currentSequence,
        channels,
      );
      timestampFrames += frameCount;
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
