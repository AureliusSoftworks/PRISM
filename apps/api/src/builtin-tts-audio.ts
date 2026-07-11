import {
  normalizeBotAudioVoiceProfileV1,
  type BotAudioVoiceId,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

const KITTEN_SPEAKER_BY_VOICE: Record<BotAudioVoiceId, number> = {
  "voice-1": 1,
  "voice-2": 0,
  "voice-3": 3,
  "voice-4": 4,
  "voice-5": 7,
};

export function builtinEnglishGenerationSettings(profile: BotAudioVoiceProfileV1): {
  speakerId: number;
  speed: number;
} {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  return {
    speakerId: KITTEN_SPEAKER_BY_VOICE[normalized.baseVoiceId],
    speed: Number((1 + normalized.pace * 0.24).toFixed(3)),
  };
}

export function encodePcm16Wave(samples: Float32Array, sampleRate: number): Buffer {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const output = Buffer.alloc(44 + dataSize);
  output.write("RIFF", 0, "ascii");
  output.writeUInt32LE(36 + dataSize, 4);
  output.write("WAVE", 8, "ascii");
  output.write("fmt ", 12, "ascii");
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * bytesPerSample, 28);
  output.writeUInt16LE(bytesPerSample, 32);
  output.writeUInt16LE(16, 34);
  output.write("data", 36, "ascii");
  output.writeUInt32LE(dataSize, 40);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index] ?? 0));
    output.writeInt16LE(
      sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff),
      44 + index * bytesPerSample
    );
  }
  return output;
}
