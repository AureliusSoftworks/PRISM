class PrismLiveVoicePlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels = [];
    this.frameCount = 0;
    this.sourcePosition = 0;
    this.sourceStep = 1;
    this.startFrame = 0;
    this.maximumOutputFrames = Number.POSITIVE_INFINITY;
    this.outputFrames = 0;
    this.ready = false;
    this.cancelled = false;
    this.ended = false;
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type === "cancel") {
        this.cancelled = true;
        return;
      }
      if (message?.type !== "load" || !Array.isArray(message.channels)) return;
      this.channels = message.channels.map((buffer) => new Float32Array(buffer));
      this.frameCount = Math.max(0, Math.floor(message.frameCount));
      this.sourceStep =
        Math.max(1, Number(message.sourceSampleRate)) /
        sampleRate *
        Math.max(0.25, Math.min(4, Number(message.playbackRate) || 1));
      this.startFrame = Math.max(currentFrame, Math.floor(message.startFrame));
      this.maximumOutputFrames = Number.isFinite(message.maximumOutputFrames)
        ? Math.max(1, Math.floor(message.maximumOutputFrames))
        : Number.POSITIVE_INFINITY;
      this.ready = this.channels.length > 0 && this.frameCount > 0;
    };
  }

  finish() {
    if (this.ended) return;
    this.ended = true;
    this.channels = [];
    this.port.postMessage({ type: "ended" });
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    for (const channel of output) channel.fill(0);
    if (this.cancelled) return false;
    if (!this.ready) return true;

    const quantumFrames = output[0]?.length ?? 0;
    for (let outputIndex = 0; outputIndex < quantumFrames; outputIndex += 1) {
      if (currentFrame + outputIndex < this.startFrame) continue;
      if (
        this.sourcePosition >= this.frameCount ||
        this.outputFrames >= this.maximumOutputFrames
      ) {
        this.finish();
        return false;
      }
      const sourceIndex = Math.floor(this.sourcePosition);
      const nextSourceIndex = Math.min(this.frameCount - 1, sourceIndex + 1);
      const blend = this.sourcePosition - sourceIndex;
      for (let outputChannel = 0; outputChannel < output.length; outputChannel += 1) {
        const source = this.channels[Math.min(outputChannel, this.channels.length - 1)];
        const left = source?.[sourceIndex] ?? 0;
        const right = source?.[nextSourceIndex] ?? left;
        output[outputChannel][outputIndex] = left + (right - left) * blend;
      }
      this.sourcePosition += this.sourceStep;
      this.outputFrames += 1;
    }
    return true;
  }
}

registerProcessor("prism-live-voice-playback", PrismLiveVoicePlaybackProcessor);
