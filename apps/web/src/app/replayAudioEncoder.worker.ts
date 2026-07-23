import {
  AudioSample,
  AudioSampleSource,
  Output,
  StreamTarget,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  type StreamTargetChunk,
} from "mediabunny";

type InitMessage = {
  type: "init";
  recordingId: string;
  renderToken: string;
  authHeaders: Record<string, string>;
  sampleRate: number;
  numberOfChannels: number;
  title: string;
};

type AudioMessage = {
  type: "audio";
  sequence: number;
  timestamp: number;
  data: ArrayBuffer;
};

type FinishMessage = { type: "finish" };
type WorkerMessage = InitMessage | AudioMessage | FinishMessage;

let output: Output | null = null;
let audioSource: AudioSampleSource | null = null;
let sampleRate = 48_000;
let numberOfChannels = 2;

function post(message: unknown): void {
  self.postMessage(message);
}

async function uploadAudioChunk(args: {
  recordingId: string;
  renderToken: string;
  authHeaders: Record<string, string>;
  chunk: StreamTargetChunk;
}): Promise<void> {
  const response = await fetch(
    new URL(
      `/api/replays/${encodeURIComponent(args.recordingId)}/render-audio-chunk`,
      self.location.origin,
    ),
    {
      method: "POST",
      credentials: "include",
      headers: {
        ...args.authHeaders,
        "content-type": "application/octet-stream",
        "x-prism-replay-token": args.renderToken,
        "x-prism-replay-position": String(args.chunk.position),
      },
      body: args.chunk.data.buffer.slice(
        args.chunk.data.byteOffset,
        args.chunk.data.byteOffset + args.chunk.data.byteLength,
      ) as ArrayBuffer,
    },
  );
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      payload?.error ?? `Replay audio upload failed (${response.status}).`,
    );
  }
}

async function initialize(message: InitMessage): Promise<void> {
  if (typeof AudioEncoder === "undefined") {
    throw new Error("WebCodecs audio encoding is unavailable.");
  }
  const codec = await getFirstEncodableAudioCodec(["opus"], {
    numberOfChannels: message.numberOfChannels,
    sampleRate: message.sampleRate,
    bitrate: 192_000,
  });
  if (codec !== "opus") {
    throw new Error("This Chromium runtime cannot encode Opus replay audio.");
  }
  const target = new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      write: (chunk) =>
        uploadAudioChunk({
          recordingId: message.recordingId,
          renderToken: message.renderToken,
          authHeaders: message.authHeaders,
          chunk,
        }),
    }),
    { chunked: true, chunkSize: 4 * 1024 * 1024 },
  );
  output = new Output({ format: new WebMOutputFormat(), target });
  audioSource = new AudioSampleSource({ codec, bitrate: 192_000 });
  output.addAudioTrack(audioSource, { name: "PRISM replay mix" });
  output.setMetadataTags({
    title: message.title,
    artist: "PRISM",
    comment: "Signal background render audio master",
  });
  sampleRate = message.sampleRate;
  numberOfChannels = message.numberOfChannels;
  await output.start();
  post({ type: "ready" });
}

async function addAudio(message: AudioMessage): Promise<void> {
  if (!audioSource) throw new Error("Replay audio encoder is not initialized.");
  const sample = new AudioSample({
    data: new Float32Array(message.data),
    format: "f32",
    numberOfChannels,
    sampleRate,
    timestamp: message.timestamp,
  });
  try {
    await audioSource.add(sample);
  } finally {
    sample.close();
  }
  post({ type: "audio-added", sequence: message.sequence });
}

async function finish(): Promise<void> {
  if (!output) throw new Error("Replay audio encoder is not initialized.");
  await output.finalize();
  post({ type: "done" });
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  void (async () => {
    try {
      if (event.data.type === "init") await initialize(event.data);
      else if (event.data.type === "audio") await addAudio(event.data);
      else await finish();
    } catch (error) {
      post({
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "Replay audio encoding failed.",
      });
    }
  })();
};
