/*
 * Development-only post-effects PCM tap for PRISM's Voice Sync Lab.
 *
 * The node is connected as a silent side branch of the final in-world audio
 * bus. It reports render quanta in the AudioContext's own sample clock; it
 * never replaces or delays the production speaker path.
 */
class PrismVoiceSyncLabCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const requestedChannels = Number(options?.processorOptions?.channelCount);
    this.channelCount = Number.isInteger(requestedChannels)
      ? Math.max(1, Math.min(8, requestedChannels))
      : 2;
    this.sequence = 0;
    this.active = true;
    this.port.onmessage = (event) => {
      if (event?.data?.type !== "stop") return;
      this.active = false;
      this.port.postMessage({
        type: "stopped",
        contextFrame: currentFrame,
        contextTime: currentTime,
      });
    };
  }

  process(inputs, outputs) {
    if (!this.active) return false;
    const input = inputs[0] ?? [];
    const output = outputs[0] ?? [];
    const frameCount =
      input[0]?.length ?? output[0]?.length ?? 128;
    const channels = [];
    const transfer = [];
    for (let channel = 0; channel < this.channelCount; channel += 1) {
      const copy = new Float32Array(frameCount);
      const source = input[channel];
      if (source) copy.set(source.subarray(0, frameCount));
      channels.push(copy.buffer);
      transfer.push(copy.buffer);
      // The side branch is intentionally silent even before its mute gain.
      output[channel]?.fill(0);
    }
    this.port.postMessage(
      {
        type: "quantum",
        sequence: this.sequence,
        contextStartFrame: currentFrame,
        contextStartTime: currentTime,
        frameCount,
        channels,
      },
      transfer,
    );
    this.sequence += 1;
    return true;
  }
}

registerProcessor(
  "prism-voice-sync-lab-capture-v1",
  PrismVoiceSyncLabCaptureProcessor,
);
