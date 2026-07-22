class SignalLiveRecordingProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.capacity = 2048;
    this.left = new Float32Array(this.capacity);
    this.right = new Float32Array(this.capacity);
    this.offset = 0;
    this.chunkStartFrame = 0;
    this.active = true;
    this.port.onmessage = (event) => {
      if (event.data?.type === "stop") {
        this.flush();
        this.active = false;
        this.port.postMessage({ type: "stopped" });
      }
    };
  }

  flush() {
    if (this.offset <= 0) return;
    const interleaved = new Float32Array(this.offset * 2);
    for (let frame = 0; frame < this.offset; frame += 1) {
      interleaved[frame * 2] = this.left[frame] ?? 0;
      interleaved[frame * 2 + 1] = this.right[frame] ?? this.left[frame] ?? 0;
    }
    this.port.postMessage(
      {
        type: "audio",
        startFrame: this.chunkStartFrame,
        frameCount: this.offset,
        sampleRate,
        data: interleaved.buffer,
      },
      [interleaved.buffer],
    );
    this.offset = 0;
  }

  process(inputs) {
    if (!this.active) return false;
    const input = inputs[0] ?? [];
    const left = input[0];
    const right = input[1] ?? left;
    const frameCount = left?.length ?? 128;
    for (let frame = 0; frame < frameCount; frame += 1) {
      if (this.offset === 0) {
        this.chunkStartFrame = currentFrame + frame;
      }
      this.left[this.offset] = left?.[frame] ?? 0;
      this.right[this.offset] = right?.[frame] ?? left?.[frame] ?? 0;
      this.offset += 1;
      if (this.offset >= this.capacity) this.flush();
    }
    return true;
  }
}

registerProcessor("signal-live-recording-processor", SignalLiveRecordingProcessor);
