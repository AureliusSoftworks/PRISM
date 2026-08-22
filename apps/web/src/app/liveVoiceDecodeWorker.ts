import {
  ALL_FORMATS,
  AudioSampleSink,
  BufferSource,
  Input,
} from "mediabunny";

interface LiveVoiceDecodeRequest {
  id: number;
  bytes: ArrayBuffer;
}

interface LiveVoiceDecodeSuccess {
  id: number;
  ok: true;
  sampleRate: number;
  frameCount: number;
  channels: ArrayBuffer[];
}

const MAX_DECODED_FRAMES = 44_100 * 60 * 5;
let decodeQueue = Promise.resolve();
const workerPostMessage = (
  message: unknown,
  transfer: Transferable[] = [],
): void => {
  (
    globalThis as unknown as {
      postMessage: (value: unknown, transfer: Transferable[]) => void;
    }
  ).postMessage(message, transfer);
};

async function decodeRequest(request: LiveVoiceDecodeRequest): Promise<void> {
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BufferSource(request.bytes),
  });
  let decodeError: unknown = null;
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track || !(await track.canDecode())) {
      throw new Error("The live voice codec is unavailable.");
    }
    const sink = new AudioSampleSink(track);
    const chunksByChannel: Float32Array[][] = [];
    let sampleRate = 0;
    let frameCount = 0;
    let channelCount = 0;

    for await (const sample of sink.samples()) {
      try {
        if (sampleRate === 0) {
          sampleRate = sample.sampleRate;
          channelCount = sample.numberOfChannels;
          for (let channel = 0; channel < channelCount; channel += 1) {
            chunksByChannel.push([]);
          }
        }
        if (
          sample.sampleRate !== sampleRate ||
          sample.numberOfChannels !== channelCount ||
          channelCount < 1 ||
          channelCount > 8
        ) {
          throw new Error("The live voice format changed mid-clip.");
        }
        frameCount += sample.numberOfFrames;
        if (frameCount > MAX_DECODED_FRAMES) {
          throw new Error("The live voice clip is too long.");
        }
        for (let channel = 0; channel < channelCount; channel += 1) {
          const chunk = new Float32Array(sample.numberOfFrames);
          sample.copyTo(chunk, {
            planeIndex: channel,
            format: "f32-planar",
          });
          chunksByChannel[channel]!.push(chunk);
        }
      } finally {
        sample.close();
      }
    }
    if (sampleRate <= 0 || frameCount <= 0 || channelCount <= 0) {
      throw new Error("The live voice clip contained no audio.");
    }

    const channels = chunksByChannel.map((chunks) => {
      const output = new Float32Array(frameCount);
      let offset = 0;
      for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.length;
      }
      return output.buffer;
    });
    const reply: LiveVoiceDecodeSuccess = {
      id: request.id,
      ok: true,
      sampleRate,
      frameCount,
      channels,
    };
    workerPostMessage(reply, channels);
  } catch (error) {
    decodeError = error;
  } finally {
    input.dispose();
  }
  if (decodeError) {
    workerPostMessage(
      {
        id: request.id,
        ok: false,
        error:
          decodeError instanceof Error
            ? decodeError.message
            : "Live voice decode failed.",
        bytes: request.bytes,
      },
      [request.bytes],
    );
  }
}

self.addEventListener("message", (event: MessageEvent<LiveVoiceDecodeRequest>) => {
  const request = event.data;
  if (
    !request ||
    typeof request.id !== "number" ||
    !(request.bytes instanceof ArrayBuffer)
  ) {
    return;
  }
  decodeQueue = decodeQueue
    .catch(() => undefined)
    .then(() => decodeRequest(request));
});
