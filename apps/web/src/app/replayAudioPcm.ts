/** Copy, never transfer/detach the AudioBuffer's own channel storage. */
export function copyReplayAudioChannels(audioBuffer: Pick<
  AudioBuffer, "sampleRate" | "numberOfChannels" | "getChannelData"
>): ArrayBuffer[] {
  if (audioBuffer.sampleRate !== 48_000 || audioBuffer.numberOfChannels !== 2) {
    throw new Error("Studio Cut windows must be 48 kHz stereo audio.");
  }
  return [0, 1].map((channel) =>
    new Float32Array(audioBuffer.getChannelData(channel)).buffer,
  );
}

/** Runs in the encoder worker; no per-sample JavaScript loop on the UI thread. */
export function interleaveReplayAudioChannels(channels: readonly ArrayBuffer[]): Float32Array {
  if (channels.length !== 2 || channels[0]!.byteLength !== channels[1]!.byteLength) {
    throw new Error("Replay PCM requires equal-length stereo channels.");
  }
  const left = new Float32Array(channels[0]!);
  const right = new Float32Array(channels[1]!);
  const interleaved = new Float32Array(left.length * 2);
  for (let frame = 0; frame < left.length; frame += 1) {
    interleaved[frame * 2] = left[frame]!;
    interleaved[frame * 2 + 1] = right[frame]!;
  }
  return interleaved;
}
