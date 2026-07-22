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

const LIVE_DEFERRED_UPLOAD_MAX_BYTES = 32 * 1024 * 1024;

type CommonInit = {
  title: string;
  width: number;
  height: number;
  fps: number;
  filmGrainLevel: number;
  videoBitrate: number;
  sampleRate: number;
  numberOfChannels: number;
};

type InitMessage = CommonInit & {
  type: "init";
  recordingId: string;
  renderToken: string;
  authHeaders: Record<string, string>;
  audio: ArrayBuffer;
};

type InitLiveMessage = CommonInit & { type: "init-live" };

type AttachUploadMessage = {
  type: "attach-upload";
  recordingId: string;
  renderToken: string;
  authHeaders: Record<string, string>;
};

type FrameMessage = {
  type: "frame";
  live?: false;
  frame: number;
  timestamp: number;
  duration: number;
  bitmap: ImageBitmap;
};

type LiveFrameMessage = {
  type: "frame";
  live: true;
  frame: number;
  timestamp: number;
  bitmap: ImageBitmap;
};

type LiveAudioMessage = {
  type: "audio";
  timestamp: number;
  data: ArrayBuffer;
};

type FinishMessage = { type: "finish"; duration?: number };
type AbortMessage = { type: "abort" };
type WorkerMessage =
  | InitMessage
  | InitLiveMessage
  | AttachUploadMessage
  | FrameMessage
  | LiveFrameMessage
  | LiveAudioMessage
  | FinishMessage
  | AbortMessage;

type UploadTarget = {
  recordingId: string;
  renderToken: string;
  authHeaders: Record<string, string>;
};

type DeferredChunk = { position: number; data: Uint8Array };

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
let replayFps = 30;
let liveMode = false;
let uploadTarget: UploadTarget | null = null;
let uploadChain: Promise<void> = Promise.resolve();
let deferredChunks: DeferredChunk[] = [];
let deferredChunkBytes = 0;
let postProcessCanvas: OffscreenCanvas | null = null;
let postProcessContext: OffscreenCanvasRenderingContext2D | null = null;
let grainCanvas: OffscreenCanvas | null = null;
let grainContext: OffscreenCanvasRenderingContext2D | null = null;
let grainImageData: ImageData | null = null;
let liveFrameCanvas: OffscreenCanvas | null = null;
let liveFrameContext: OffscreenCanvasRenderingContext2D | null = null;
let liveFrameAvailable = false;
let liveNextVideoTimestamp = 0;
let liveEncodedFrame = 0;
let aborted = false;

function post(message: unknown): void {
  self.postMessage(message);
}

async function uploadChunk(target: UploadTarget, chunk: DeferredChunk): Promise<void> {
  const response = await fetch(
    new URL(
      `/api/replays/${encodeURIComponent(target.recordingId)}/render-chunk`,
      self.location.origin,
    ),
    {
      method: "POST",
      credentials: "include",
      headers: {
        ...target.authHeaders,
        "content-type": "application/octet-stream",
        "x-prism-replay-token": target.renderToken,
        "x-prism-replay-position": String(chunk.position),
      },
      body: chunk.data.buffer.slice(
        chunk.data.byteOffset,
        chunk.data.byteOffset + chunk.data.byteLength,
      ) as ArrayBuffer,
    },
  );
  if (!response.ok) throw new Error(`Replay upload failed (${response.status}).`);
}

function copiedChunk(chunk: StreamTargetChunk): DeferredChunk {
  return {
    position: chunk.position,
    data: new Uint8Array(
      chunk.data.buffer.slice(
        chunk.data.byteOffset,
        chunk.data.byteOffset + chunk.data.byteLength,
      ),
    ),
  };
}

function enqueueUpload(chunk: DeferredChunk): Promise<void> {
  if (!uploadTarget) {
    deferredChunkBytes += chunk.data.byteLength;
    if (deferredChunkBytes > LIVE_DEFERRED_UPLOAD_MAX_BYTES) {
      throw new Error("Live replay exceeded its pre-attachment buffer.");
    }
    deferredChunks.push(chunk);
    return Promise.resolve();
  }
  const target = uploadTarget;
  const pending = uploadChain.then(() => uploadChunk(target, chunk));
  uploadChain = pending.catch(() => undefined);
  return pending;
}

async function attachUpload(message: AttachUploadMessage): Promise<void> {
  if (!liveMode || uploadTarget) {
    throw new Error("Live replay upload cannot be attached in this state.");
  }
  uploadTarget = {
    recordingId: message.recordingId,
    renderToken: message.renderToken,
    authHeaders: message.authHeaders,
  };
  const pending = deferredChunks;
  deferredChunks = [];
  deferredChunkBytes = 0;
  for (const chunk of pending) await enqueueUpload(chunk);
  await uploadChain;
  post({ type: "upload-attached" });
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

async function addLiveSilenceThrough(targetFrame: number): Promise<void> {
  if (!audioSource) return;
  const chunkFrames = Math.max(1, Math.round(sampleRate * 0.25));
  while (audioFrameCursor < targetFrame) {
    const frames = Math.min(chunkFrames, targetFrame - audioFrameCursor);
    const sample = new AudioSample({
      data: new Float32Array(frames * numberOfChannels),
      format: "f32",
      numberOfChannels,
      sampleRate,
      timestamp: audioFrameCursor / sampleRate,
    });
    await audioSource.add(sample);
    sample.close();
    audioFrameCursor += frames;
  }
}

async function addLiveAudio(message: LiveAudioMessage): Promise<void> {
  if (!liveMode || !audioSource) throw new Error("Live replay audio is not initialized.");
  const incoming = new Float32Array(message.data);
  const incomingFrames = Math.floor(incoming.length / numberOfChannels);
  const expectedStartFrame = Math.max(0, Math.round(message.timestamp * sampleRate));
  if (expectedStartFrame > audioFrameCursor) {
    await addLiveSilenceThrough(expectedStartFrame);
  }
  const overlapFrames = Math.max(0, audioFrameCursor - expectedStartFrame);
  if (overlapFrames >= incomingFrames) return;
  const startSample = overlapFrames * numberOfChannels;
  const data = incoming.slice(startSample);
  const frames = Math.floor(data.length / numberOfChannels);
  const sample = new AudioSample({
    data,
    format: "f32",
    numberOfChannels,
    sampleRate,
    timestamp: audioFrameCursor / sampleRate,
  });
  await audioSource.add(sample);
  sample.close();
  audioFrameCursor += frames;
  post({ type: "audio-added", frames });
}

async function initialize(message: InitMessage | InitLiveMessage): Promise<void> {
  if (typeof VideoEncoder === "undefined" || typeof AudioEncoder === "undefined") {
    throw new Error("WebCodecs is unavailable inside this replay worker.");
  }
  if (output) throw new Error("Replay worker is already initialized.");
  liveMode = message.type === "init-live";
  replayFps = Math.max(1, Math.round(message.fps));
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
  if (message.type === "init") {
    uploadTarget = {
      recordingId: message.recordingId,
      renderToken: message.renderToken,
      authHeaders: message.authHeaders,
    };
  }
  const target = new StreamTarget(
    new WritableStream<StreamTargetChunk>({
      write: (chunk) => enqueueUpload(copiedChunk(chunk)),
    }),
    { chunked: true, chunkSize: 4 * 1024 * 1024 },
  );
  output = new Output({ format, target });
  videoSource = new VideoSampleSource({
    codec: selectedVideoCodec,
    bitrate: message.videoBitrate,
    keyFrameInterval: 2,
    latencyMode: liveMode ? "realtime" : "quality",
    contentHint: "detail",
  });
  audioSource = new AudioSampleSource({
    codec: selectedAudioCodec,
    bitrate: 192_000,
  });
  output.addVideoTrack(videoSource, { frameRate: replayFps, name: message.title });
  output.addAudioTrack(audioSource, { name: "PRISM replay mix" });
  output.setMetadataTags({
    title: message.title,
    artist: "PRISM",
    comment: liveMode ? "Signal live recording v1" : "Deterministic replay v1",
  });
  sampleRate = message.sampleRate;
  numberOfChannels = message.numberOfChannels;
  audio = message.type === "init" ? new Float32Array(message.audio) : null;
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
  if (liveMode) {
    liveFrameCanvas = new OffscreenCanvas(message.width, message.height);
    liveFrameContext = liveFrameCanvas.getContext("2d", { alpha: false });
    if (!liveFrameContext) throw new Error("Live replay canvas initialization failed.");
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

async function encodeLiveFramesThrough(endTimeSeconds: number): Promise<number> {
  if (!videoSource || !liveFrameCanvas || !liveFrameAvailable) return 0;
  const frameDuration = 1 / replayFps;
  let added = 0;
  while (liveNextVideoTimestamp < endTimeSeconds - frameDuration / 2) {
    const sample = new VideoSample(liveFrameCanvas, {
      timestamp: liveNextVideoTimestamp,
      duration: frameDuration,
    });
    try {
      await videoSource.add(sample, {
        keyFrame: liveEncodedFrame % Math.max(1, replayFps * 2) === 0,
      });
    } finally {
      sample.close();
    }
    liveEncodedFrame += 1;
    liveNextVideoTimestamp += frameDuration;
    added += 1;
  }
  return added;
}

async function addLiveFrame(message: LiveFrameMessage): Promise<void> {
  if (!liveMode || !liveFrameCanvas || !liveFrameContext) {
    message.bitmap.close();
    throw new Error("Live replay video is not initialized.");
  }
  const heldFrames = liveFrameAvailable
    ? await encodeLiveFramesThrough(Math.max(0, message.timestamp))
    : 0;
  liveFrameContext.globalCompositeOperation = "copy";
  liveFrameContext.fillStyle = "#000";
  liveFrameContext.fillRect(0, 0, liveFrameCanvas.width, liveFrameCanvas.height);
  liveFrameContext.globalCompositeOperation = "source-over";
  liveFrameContext.drawImage(
    message.bitmap,
    0,
    0,
    liveFrameCanvas.width,
    liveFrameCanvas.height,
  );
  message.bitmap.close();
  liveFrameAvailable = true;
  post({ type: "frame-added", frame: message.frame, heldFrames });
}

async function finish(durationSeconds?: number): Promise<void> {
  if (!output) throw new Error("Replay worker has not initialized.");
  if (liveMode) {
    if (!uploadTarget) throw new Error("Live replay upload was never attached.");
    const duration = Math.max(
      0.1,
      Number.isFinite(durationSeconds) ? (durationSeconds ?? 0) : 0,
      audioFrameCursor / sampleRate,
    );
    if (!liveFrameAvailable) throw new Error("Live replay captured no video frames.");
    await encodeLiveFramesThrough(duration + 1 / replayFps);
    await addLiveSilenceThrough(Math.ceil(duration * sampleRate));
  } else {
    if (!audio) throw new Error("Replay worker audio is missing.");
    await addAudioThrough(audio.length / numberOfChannels / sampleRate);
  }
  await output.finalize();
  await uploadChain;
  post({
    type: "done",
    contentType: selectedContentType,
    codec: `${selectedVideoCodec}/${selectedAudioCodec}`,
    encodedFrames: liveMode ? liveEncodedFrame : undefined,
  });
  audio = null;
  deferredChunks = [];
  postProcessCanvas = null;
  postProcessContext = null;
  grainCanvas = null;
  grainContext = null;
  grainImageData = null;
  liveFrameCanvas = null;
  liveFrameContext = null;
}

function abort(): void {
  aborted = true;
  deferredChunks = [];
  deferredChunkBytes = 0;
  audio = null;
  liveFrameCanvas = null;
  liveFrameContext = null;
  post({ type: "aborted" });
}

let operationChain = Promise.resolve();

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  operationChain = operationChain.then(async () => {
    try {
      if (aborted) return;
      switch (event.data.type) {
        case "init":
        case "init-live":
          await initialize(event.data);
          break;
        case "attach-upload":
          await attachUpload(event.data);
          break;
        case "frame":
          if (event.data.live === true) await addLiveFrame(event.data);
          else await addFrame(event.data);
          break;
        case "audio":
          await addLiveAudio(event.data);
          break;
        case "finish":
          await finish(event.data.duration);
          break;
        case "abort":
          abort();
          break;
      }
    } catch (error) {
      post({
        type: "error",
        error: error instanceof Error ? error.message : "Replay worker failed.",
      });
    }
  });
};
