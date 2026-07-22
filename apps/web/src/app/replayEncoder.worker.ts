import {
  AudioSample,
  AudioSampleSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  VideoSample,
  VideoSampleSource,
  WebMOutputFormat,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  type AudioCodec,
  type StreamTargetChunk,
  type VideoCodec,
} from "mediabunny";
import {
  SIGNAL_FILM_GRAIN_TILE_SIZE,
  paintSignalFilmGrain,
} from "./signalFilmGrain";

type InitMessage = {
  type: "init";
  recordingId: string;
  renderToken: string;
  authHeaders: Record<string, string>;
  title: string;
  width: number;
  height: number;
  fps: number;
  filmGrainLevel: number;
  videoBitrate: number;
  sampleRate: number;
  numberOfChannels: number;
  audio: ArrayBuffer;
};

type FrameMessage = {
  type: "frame";
  frame: number;
  timestamp: number;
  duration: number;
  bitmap: ImageBitmap;
};

type FinishMessage = { type: "finish" };
type WorkerMessage = InitMessage | FrameMessage | FinishMessage;

let output: Output | null = null;
let videoSource: VideoSampleSource | null = null;
let audioSource: AudioSampleSource | null = null;
let audio: Float32Array | null = null;
let audioFrameCursor = 0;
let sampleRate = 48_000;
let numberOfChannels = 2;
let selectedVideoCodec: VideoCodec | null = null;
let selectedAudioCodec: AudioCodec | null = null;
let selectedContentType: "video/mp4" | "video/webm" = "video/mp4";
let filmGrainLevel = 0;
let postProcessCanvas: OffscreenCanvas | null = null;
let postProcessContext: OffscreenCanvasRenderingContext2D | null = null;
let grainCanvas: OffscreenCanvas | null = null;
let grainContext: OffscreenCanvasRenderingContext2D | null = null;
let grainImageData: ImageData | null = null;

function post(message: unknown): void {
  self.postMessage(message);
}

async function uploadChunk(args: {
  recordingId: string;
  renderToken: string;
  authHeaders: Record<string, string>;
  chunk: StreamTargetChunk;
}): Promise<void> {
  const response = await fetch(
    new URL(
      `/api/replays/${encodeURIComponent(args.recordingId)}/render-chunk`,
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
  if (!response.ok) throw new Error(`Replay upload failed (${response.status}).`);
}

async function addAudioThrough(endTimeSeconds: number): Promise<void> {
  if (!audio || !audioSource) return;
  const totalFrames = Math.floor(audio.length / numberOfChannels);
  const targetFrame = Math.min(
    totalFrames,
    Math.ceil(Math.max(0, endTimeSeconds) * sampleRate),
  );
  const chunkFrames = Math.max(1, Math.round(sampleRate * 0.5));
  while (audioFrameCursor < targetFrame) {
    const endFrame = Math.min(targetFrame, audioFrameCursor + chunkFrames);
    const startSample = audioFrameCursor * numberOfChannels;
    const endSample = endFrame * numberOfChannels;
    const chunk = audio.slice(startSample, endSample);
    const sample = new AudioSample({
      data: chunk,
      format: "f32",
      numberOfChannels,
      sampleRate,
      timestamp: audioFrameCursor / sampleRate,
    });
    await audioSource.add(sample);
    sample.close();
    audioFrameCursor = endFrame;
  }
}

async function initialize(message: InitMessage): Promise<void> {
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    throw new Error("WebCodecs is unavailable inside this replay worker.");
  }
  const mp4Video = await getFirstEncodableVideoCodec(["avc"], {
    width: message.width,
    height: message.height,
    bitrate: message.videoBitrate,
  });
  const mp4Audio = await getFirstEncodableAudioCodec(["aac"], {
    numberOfChannels: message.numberOfChannels,
    sampleRate: message.sampleRate,
    bitrate: 192_000,
  });
  const useMp4 = mp4Video === "avc" && mp4Audio === "aac";
  const format = useMp4
    ? new Mp4OutputFormat({ fastStart: "fragmented" })
    : new WebMOutputFormat();
  selectedVideoCodec = useMp4
    ? mp4Video
    : await getFirstEncodableVideoCodec(["vp9", "vp8"], {
        width: message.width,
        height: message.height,
        bitrate: message.videoBitrate,
      });
  selectedAudioCodec = useMp4
    ? mp4Audio
    : await getFirstEncodableAudioCodec(["opus"], {
        numberOfChannels: message.numberOfChannels,
        sampleRate: message.sampleRate,
        bitrate: 192_000,
      });
  if (!selectedVideoCodec || !selectedAudioCodec) {
    throw new Error("No compatible replay encoders are available in this worker.");
  }
  selectedContentType = useMp4 ? "video/mp4" : "video/webm";
  const target = new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      write: (chunk) =>
        uploadChunk({
          recordingId: message.recordingId,
          renderToken: message.renderToken,
          authHeaders: message.authHeaders,
          chunk,
        }),
    }),
    { chunked: true, chunkSize: 4 * 1024 * 1024 },
  );
  output = new Output({ format, target });
  videoSource = new VideoSampleSource({
    codec: selectedVideoCodec,
    bitrate: message.videoBitrate,
    keyFrameInterval: 2,
    latencyMode: "quality",
    contentHint: "detail",
  });
  audioSource = new AudioSampleSource({
    codec: selectedAudioCodec,
    bitrate: 192_000,
  });
  output.addVideoTrack(videoSource, { frameRate: message.fps, name: message.title });
  output.addAudioTrack(audioSource, { name: "PRISM replay mix" });
  output.setMetadataTags({
    title: message.title,
    artist: "PRISM",
    comment: "Deterministic replay v1",
  });
  sampleRate = message.sampleRate;
  numberOfChannels = message.numberOfChannels;
  audio = new Float32Array(message.audio);
  filmGrainLevel = Math.max(0, Math.min(1, message.filmGrainLevel));
  if (filmGrainLevel > 0) {
    if (typeof OffscreenCanvas === "undefined") {
      throw new Error("OffscreenCanvas is required for Signal film grain.");
    }
    postProcessCanvas = new OffscreenCanvas(message.width, message.height);
    postProcessContext = postProcessCanvas.getContext("2d", { alpha: false });
    grainCanvas = new OffscreenCanvas(
      SIGNAL_FILM_GRAIN_TILE_SIZE,
      SIGNAL_FILM_GRAIN_TILE_SIZE,
    );
    grainContext = grainCanvas.getContext("2d", { alpha: false });
    grainImageData = grainContext?.createImageData(
      SIGNAL_FILM_GRAIN_TILE_SIZE,
      SIGNAL_FILM_GRAIN_TILE_SIZE,
    ) ?? null;
    if (!postProcessContext || !grainContext || !grainImageData) {
      throw new Error("Signal film-grain canvas initialization failed.");
    }
  }
  await output.start();
  post({
    type: "ready",
    contentType: selectedContentType,
    codec: `${selectedVideoCodec}/${selectedAudioCodec}`,
  });
}

async function addFrame(message: FrameMessage): Promise<void> {
  if (!videoSource) throw new Error("Replay worker has not initialized.");
  await addAudioThrough(message.timestamp + message.duration + 0.5);
  let frameSource: ImageBitmap | OffscreenCanvas = message.bitmap;
  if (
    filmGrainLevel > 0 &&
    postProcessCanvas &&
    postProcessContext &&
    grainCanvas &&
    grainContext &&
    grainImageData
  ) {
    postProcessContext.globalAlpha = 1;
    postProcessContext.globalCompositeOperation = "copy";
    postProcessContext.drawImage(
      message.bitmap,
      0,
      0,
      postProcessCanvas.width,
      postProcessCanvas.height,
    );
    postProcessContext.globalCompositeOperation = "source-over";
    paintSignalFilmGrain({
      targetContext: postProcessContext,
      noiseCanvas: grainCanvas,
      noiseContext: grainContext,
      noiseImageData: grainImageData,
      width: postProcessCanvas.width,
      height: postProcessCanvas.height,
      level: filmGrainLevel,
      frame: message.frame,
    });
    frameSource = postProcessCanvas;
  }
  const sample = new VideoSample(frameSource, {
    timestamp: message.timestamp,
    duration: message.duration,
  });
  try {
    await videoSource.add(sample, { keyFrame: message.frame % 60 === 0 });
  } finally {
    sample.close();
    message.bitmap.close();
  }
  post({ type: "frame-added", frame: message.frame });
}

async function finish(): Promise<void> {
  if (!output || !audio) throw new Error("Replay worker has not initialized.");
  await addAudioThrough(audio.length / numberOfChannels / sampleRate);
  await output.finalize();
  post({
    type: "done",
    contentType: selectedContentType,
    codec: `${selectedVideoCodec}/${selectedAudioCodec}`,
  });
  audio = null;
  postProcessCanvas = null;
  postProcessContext = null;
  grainCanvas = null;
  grainContext = null;
  grainImageData = null;
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  void (async () => {
    try {
      if (event.data.type === "init") await initialize(event.data);
      else if (event.data.type === "frame") await addFrame(event.data);
      else await finish();
    } catch (error) {
      post({
        type: "error",
        error: error instanceof Error ? error.message : "Replay worker failed.",
      });
    }
  })();
};
