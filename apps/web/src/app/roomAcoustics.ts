export interface RoomAcousticsEarlyReflection {
  delaySeconds: number;
  gain: number;
  stereoOffsetSeconds: number;
}

export interface RoomAcousticsProfile {
  id: string;
  durationSeconds: number;
  preDelaySeconds: number;
  lowCutHz: number;
  highCutHz: number;
  decayExponent: number;
  diffusionGain: number;
  earlyReflections: readonly RoomAcousticsEarlyReflection[];
}

export interface RoomAcousticsSend {
  profile: RoomAcousticsProfile;
  wet: number;
}

export const SIGNAL_STUDIO_ROOM_PROFILE = {
  id: "signal-intimate-treated-studio-v1",
  durationSeconds: 0.48,
  preDelaySeconds: 0.012,
  lowCutHz: 140,
  highCutHz: 3_400,
  decayExponent: 3.2,
  diffusionGain: 0.035,
  earlyReflections: [
    { delaySeconds: 0.013, gain: 0.72, stereoOffsetSeconds: 0.0006 },
    { delaySeconds: 0.021, gain: 0.5, stereoOffsetSeconds: -0.0004 },
    { delaySeconds: 0.033, gain: 0.34, stereoOffsetSeconds: 0.0008 },
    { delaySeconds: 0.048, gain: 0.23, stereoOffsetSeconds: -0.0007 },
    { delaySeconds: 0.071, gain: 0.15, stereoOffsetSeconds: 0.0005 },
  ],
} as const satisfies RoomAcousticsProfile;

export const SIGNAL_STUDIO_VOICE_ROOM_SEND = {
  profile: SIGNAL_STUDIO_ROOM_PROFILE,
  wet: 0.06,
} as const satisfies RoomAcousticsSend;

export const SIGNAL_STUDIO_FOLEY_ROOM_SEND = {
  profile: SIGNAL_STUDIO_ROOM_PROFILE,
  wet: 0.11,
} as const satisfies RoomAcousticsSend;

export interface RoomAcousticsConnection {
  /** Stop immediately, such as when playback is cancelled. */
  disconnect(): void;
  /** Stop feeding the room while allowing its short tail to finish. */
  release(): void;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededSignedUnit(seed: string): () => number {
  let state = stableHash(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff) * 2 - 1;
  };
}

export function buildRoomImpulseChannels(
  profile: RoomAcousticsProfile,
  sampleRate: number,
): readonly [Float32Array, Float32Array] {
  const safeSampleRate = Math.max(8_000, Math.round(sampleRate));
  const length = Math.max(
    1,
    Math.round(Math.max(0.08, profile.durationSeconds) * safeSampleRate),
  );
  const channels = [
    new Float32Array(length),
    new Float32Array(length),
  ] as const;
  const diffuseStart = Math.round(safeSampleRate * 0.008);
  const diffuseFadeSamples = Math.max(1, Math.round(safeSampleRate * 0.012));

  for (
    let channelIndex = 0;
    channelIndex < channels.length;
    channelIndex += 1
  ) {
    const channel = channels[channelIndex]!;
    const random = seededSignedUnit(`${profile.id}:diffusion:${channelIndex}`);
    for (let index = diffuseStart; index < length; index += 1) {
      const progress =
        (index - diffuseStart) / Math.max(1, length - diffuseStart - 1);
      const envelope = Math.pow(
        Math.max(0, 1 - progress),
        Math.max(0.5, profile.decayExponent),
      );
      const fadeIn = Math.min(1, (index - diffuseStart) / diffuseFadeSamples);
      channel[index] =
        random() * Math.max(0, profile.diffusionGain) * envelope * fadeIn;
    }

    for (const reflection of profile.earlyReflections) {
      const channelDirection = channelIndex === 0 ? -1 : 1;
      const reflectionIndex = Math.max(
        0,
        Math.min(
          length - 1,
          Math.round(
            (reflection.delaySeconds +
              reflection.stereoOffsetSeconds * channelDirection) *
              safeSampleRate,
          ),
        ),
      );
      const stereoGain = channelIndex === 0 ? 0.97 : 1.03;
      channel[reflectionIndex] += reflection.gain * stereoGain;
    }
    channel[length - 1] = 0;
  }

  return channels;
}

const impulseCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function roomImpulseBuffer(
  context: BaseAudioContext,
  profile: RoomAcousticsProfile,
): AudioBuffer {
  let byProfile = impulseCache.get(context);
  if (!byProfile) {
    byProfile = new Map();
    impulseCache.set(context, byProfile);
  }
  const cached = byProfile.get(profile.id);
  if (cached) return cached;
  const channels = buildRoomImpulseChannels(profile, context.sampleRate);
  const buffer = context.createBuffer(
    2,
    channels[0].length,
    context.sampleRate,
  );
  buffer.getChannelData(0).set(channels[0]);
  buffer.getChannelData(1).set(channels[1]);
  byProfile.set(profile.id, buffer);
  return buffer;
}

function safeDisconnect(node: AudioNode): void {
  try {
    node.disconnect();
  } catch {
    // A node may already have been disconnected by an overlapping stop path.
  }
}

function connectDryOutput(args: {
  context: BaseAudioContext;
  input: AudioNode;
  destination: AudioNode;
  stereoPan?: number;
}): AudioNode[] {
  const stereoPan = Math.max(-1, Math.min(1, args.stereoPan ?? 0));
  if (
    stereoPan === 0 ||
    typeof args.context.createStereoPanner !== "function"
  ) {
    args.input.connect(args.destination);
    return [];
  }
  const panner = args.context.createStereoPanner();
  panner.pan.value = stereoPan;
  args.input.connect(panner);
  panner.connect(args.destination);
  return [panner];
}

export function connectRoomAcoustics(args: {
  context: BaseAudioContext;
  input: AudioNode;
  destination: AudioNode;
  send?: RoomAcousticsSend | null;
  /** Equal-power dry-path placement. The shared room return stays diffuse. */
  stereoPan?: number;
}): RoomAcousticsConnection {
  const wet = Math.max(0, Math.min(0.35, args.send?.wet ?? 0));
  if (!args.send || wet === 0) {
    const dryNodes = connectDryOutput(args);
    const disconnect = (): void => {
      safeDisconnect(args.input);
      for (const node of dryNodes) safeDisconnect(node);
    };
    return { disconnect, release: disconnect };
  }

  const dryGain = args.context.createGain();
  dryGain.gain.value = 1;
  const dryNodes = connectDryOutput({
    ...args,
    destination: dryGain,
  });
  dryGain.connect(args.destination);

  const { profile } = args.send;
  const preDelay = args.context.createDelay(0.1);
  const convolver = args.context.createConvolver();
  const lowCut = args.context.createBiquadFilter();
  const highCut = args.context.createBiquadFilter();
  const wetGain = args.context.createGain();
  preDelay.delayTime.value = Math.max(
    0,
    Math.min(0.09, profile.preDelaySeconds),
  );
  convolver.buffer = roomImpulseBuffer(args.context, profile);
  // The impulse is authored at a known level; disabling automatic
  // normalization keeps the restrained wet percentages predictable.
  convolver.normalize = false;
  lowCut.type = "highpass";
  lowCut.frequency.value = Math.max(20, profile.lowCutHz);
  lowCut.Q.value = 0.7;
  highCut.type = "lowpass";
  highCut.frequency.value = Math.max(
    lowCut.frequency.value + 100,
    profile.highCutHz,
  );
  highCut.Q.value = 0.7;
  wetGain.gain.value = wet;

  args.input.connect(preDelay);
  preDelay.connect(convolver);
  convolver.connect(lowCut);
  lowCut.connect(highCut);
  highCut.connect(wetGain);
  wetGain.connect(args.destination);

  const wetNodes = [preDelay, convolver, lowCut, highCut, wetGain] as const;
  let closed = false;
  let released = false;
  let tailTimer: ReturnType<typeof setTimeout> | null = null;
  const disconnectWet = (): void => {
    for (const node of wetNodes) safeDisconnect(node);
  };
  const disconnect = (): void => {
    if (closed) return;
    closed = true;
    if (tailTimer !== null) clearTimeout(tailTimer);
    tailTimer = null;
    safeDisconnect(args.input);
    for (const node of dryNodes) safeDisconnect(node);
    safeDisconnect(dryGain);
    disconnectWet();
  };
  const release = (): void => {
    if (closed || released) return;
    released = true;
    safeDisconnect(args.input);
    for (const node of dryNodes) safeDisconnect(node);
    safeDisconnect(dryGain);
    tailTimer = setTimeout(
      () => {
        if (closed) return;
        closed = true;
        tailTimer = null;
        disconnectWet();
      },
      Math.ceil(
        (profile.preDelaySeconds + profile.durationSeconds + 0.05) * 1_000,
      ),
    );
  };
  return { disconnect, release };
}
