import {
  applyVoiceDeliveryMoodToProfile,
  compileReplayTimelineV1,
  resolveVoicePlaybackTransform,
  type ReplayRecordingV1,
  type ReplayPremiumSegmentV1,
  type ReplayTimelineV1,
  type ReplayVoiceTakeRecordV1,
} from "@localai/shared";
import { readEnglishVoiceSynthesisClip } from "./englishVoice";
import {
  replayFetch,
  storeCapturedReplayVoiceAudio,
  updateCapturedReplayVoiceTake,
} from "./replayClient";
import {
  SIGNAL_STUDIO_VOICE_ROOM_SEND,
  connectRoomAcoustics,
} from "./roomAcoustics";
import {
  SIGNAL_SOUNDBOARD_CUES,
  signalSoundboardPlaybackPlan,
} from "./signalSoundboard";

const REPLAY_AUDIO_SAMPLE_RATE = 48_000;
const REPLAY_AUDIO_TAIL_MS = 650;

export interface PreparedReplayAudio {
  audioBuffer: AudioBuffer;
  timeline: ReplayTimelineV1;
  takes: ReplayVoiceTakeRecordV1[];
  warnings: string[];
}

export interface PrepareReplayAudioOptions {
  premiumSegments?: readonly ReplayPremiumSegmentV1[];
  includeProductionAssets?: boolean;
}

export function replayAudioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const frameCount = buffer.length;
  const bytes = new ArrayBuffer(44 + frameCount * channels * 2);
  const view = new DataView(bytes);
  const write = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, bytes.byteLength - 8, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frameCount * channels * 2, true);
  const channelData = Array.from({ length: channels }, (_, channel) =>
    buffer.getChannelData(channel),
  );
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[channel]?.[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return bytes;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): () => number {
  let state = stableHash(seed) || 0x9e3779b9;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function proceduralBottishBuffer(args: {
  durationMs: number;
  seed: string;
  tone: number;
}): AudioBuffer {
  const durationSeconds = Math.max(0.08, args.durationMs / 1_000);
  const length = Math.max(1, Math.ceil(durationSeconds * REPLAY_AUDIO_SAMPLE_RATE));
  const context = new OfflineAudioContext(1, length, REPLAY_AUDIO_SAMPLE_RATE);
  const buffer = context.createBuffer(1, length, REPLAY_AUDIO_SAMPLE_RATE);
  const data = buffer.getChannelData(0);
  const random = seededUnit(args.seed);
  const base = 118 + Math.max(0, Math.min(1, args.tone)) * 210;
  let phase = random() * Math.PI * 2;
  for (let index = 0; index < length; index += 1) {
    const time = index / REPLAY_AUDIO_SAMPLE_RATE;
    const syllable = Math.floor(time / 0.105);
    const gatePhase = (time % 0.105) / 0.105;
    const envelope = Math.sin(Math.PI * Math.min(1, gatePhase)) ** 1.7;
    const pitch = base * (0.82 + ((stableHash(`${args.seed}:${syllable}`) % 9) / 20));
    phase += (Math.PI * 2 * pitch) / REPLAY_AUDIO_SAMPLE_RATE;
    const carrier = Math.sin(phase) * 0.68 + Math.sign(Math.sin(phase * 0.51)) * 0.14;
    data[index] = carrier * envelope * 0.28;
  }
  return buffer;
}

async function decodeAudio(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const context = new OfflineAudioContext(2, 1, REPLAY_AUDIO_SAMPLE_RATE);
  return context.decodeAudioData(bytes.slice(0));
}

function alignmentFromClip(
  alignment: Awaited<ReturnType<typeof readEnglishVoiceSynthesisClip>>["alignment"],
) {
  return alignment
    ? {
        characters: [...alignment.characters],
        characterStartTimesSeconds: [...alignment.characterStartTimesSeconds],
        characterEndTimesSeconds: [...alignment.characterEndTimesSeconds],
      }
    : null;
}

async function synthesizeMissingTake(args: {
  take: ReplayVoiceTakeRecordV1;
}): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  const { take } = args;
  const snapshot = take.snapshot;
  if (snapshot.mode !== "english" && snapshot.mode !== "babble") return null;
  const response = await replayFetch("/api/voices/synthesize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: snapshot.mode,
      engine: "builtin",
      explicitVoicePreview: false,
      explicitOnlineContext: false,
      includeAlignment: true,
      profile: snapshot.profile,
      moodKey: snapshot.moodKey,
      seed: snapshot.seed,
      text: snapshot.spokenText,
      elevenLabsText: snapshot.performanceText ?? undefined,
    }),
  });
  if (!response.ok) return null;
  const clip = await readEnglishVoiceSynthesisClip(response);
  const decoded = await decodeAudio(clip.bytes);
  const adjustedProfile = applyVoiceDeliveryMoodToProfile(
    snapshot.profile,
    snapshot.moodKey,
  );
  const durationMs = Math.max(
    1,
    Math.round(
      (decoded.duration / resolveVoicePlaybackTransform(adjustedProfile).tempo) * 1_000,
    ),
  );
  const updated = await storeCapturedReplayVoiceAudio({
    takePromise: Promise.resolve(take),
    bytes: clip.bytes,
    contentType: clip.audioContentType,
    durationMs,
    resolvedEngine: clip.engineUsed,
    alignment: alignmentFromClip(clip.alignment),
  });
  Object.assign(take, updated);
  return { bytes: clip.bytes, contentType: clip.audioContentType };
}

async function synthesizeLegacyReplayUtterance(text: string): Promise<AudioBuffer | null> {
  const response = await replayFetch("/api/voices/synthesize", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode: "english",
      engine: "builtin",
      text,
      explicitVoicePreview: false,
      explicitOnlineContext: false,
      profile: {
        v: 1,
        baseVoiceId: "builtin-default",
        pitch: 0,
        warmth: 0,
        pace: 0,
        lilt: 0,
      },
      moodKey: "neutral",
    }),
  });
  if (!response.ok) return null;
  const clip = await readEnglishVoiceSynthesisClip(response);
  return decodeAudio(clip.bytes).catch(() => null);
}

async function audioForTake(args: {
  take: ReplayVoiceTakeRecordV1;
  warnings: string[];
}): Promise<AudioBuffer | null> {
  const { take, warnings } = args;
  if (!take.snapshot.audible || take.snapshot.mode === "mute") return null;
  if (take.snapshot.mode === "bottish") {
    return proceduralBottishBuffer({
      durationMs: take.snapshot.durationMs ?? 1_800,
      seed: take.snapshot.seed,
      tone:
        "bottishTone" in take.snapshot.profile
          ? take.snapshot.profile.bottishTone
          : 0.5,
    });
  }
  let bytes: ArrayBuffer | null = null;
  if (take.audioUrl) {
    const response = await replayFetch(take.audioUrl);
    if (response.ok) bytes = await response.arrayBuffer();
  }
  if (!bytes) {
    warnings.push(
      `${take.snapshot.speakerName}: captured voice was missing; local speech fallback used.`,
    );
    const regenerated = await synthesizeMissingTake({ take });
    bytes = regenerated?.bytes ?? null;
  }
  if (!bytes) {
    warnings.push(`${take.snapshot.speakerName}: frozen voice unavailable; rendered silently.`);
    return null;
  }
  try {
    return await decodeAudio(bytes);
  } catch {
    warnings.push(`${take.snapshot.speakerName}: captured audio could not be decoded; rendered silently.`);
    return null;
  }
}

function replaceTake(
  takes: ReplayVoiceTakeRecordV1[],
  next: ReplayVoiceTakeRecordV1,
): void {
  const index = takes.findIndex((take) => take.id === next.id);
  if (index >= 0) takes[index] = next;
}

function finiteMetadataNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function replayAssetBuffer(url: unknown): Promise<AudioBuffer | null> {
  if (typeof url !== "string" || !url.trim()) return null;
  const response = await replayFetch(url).catch(() => null);
  if (!response?.ok) return null;
  return decodeAudio(await response.arrayBuffer()).catch(() => null);
}

function syntheticEventTimeMs(
  recording: ReplayRecordingV1,
  timeline: ReplayTimelineV1,
  event: NonNullable<ReplayRecordingV1["manifest"]>["events"][number],
): number {
  if (event.sourceMessageId) {
    const beat = timeline.beats.find(
      (candidate) => candidate.sourceMessageId === event.sourceMessageId,
    );
    if (beat) return beat.startMs + Math.min(500, (beat.endMs - beat.startMs) * 0.22);
  }
  const runtimeMs = finiteMetadataNumber(
    recording.manifest?.visual.metadata?.runtimeMs,
  );
  const atMs = finiteMetadataNumber(event.payload.atMs);
  const endStart = timeline.beats.find((beat) => beat.kind === "end")?.startMs ?? timeline.durationMs;
  if (runtimeMs && atMs !== null) {
    return 2_100 + Math.max(0, Math.min(1, atMs / runtimeMs)) * Math.max(0, endStart - 2_100);
  }
  const index = recording.manifest?.events.indexOf(event) ?? 0;
  const count = Math.max(1, recording.manifest?.events.length ?? 1);
  return 2_100 + ((index + 1) / (count + 1)) * Math.max(0, endStart - 2_100);
}

export async function prepareReplayAudio(
  recording: ReplayRecordingV1,
  initialTakes: readonly ReplayVoiceTakeRecordV1[],
  options: PrepareReplayAudioOptions = {},
): Promise<PreparedReplayAudio> {
  if (!recording.manifest) throw new Error("Replay manifest is missing.");
  const warnings: string[] = [];
  if (
    options.premiumSegments?.length &&
    recording.premiumProduction?.audioUrl &&
    recording.premiumProduction.timeline
  ) {
    const response = await replayFetch(recording.premiumProduction.audioUrl);
    if (response.ok) {
      return {
        audioBuffer: await decodeAudio(await response.arrayBuffer()),
        timeline: recording.premiumProduction.timeline,
        takes: initialTakes.map((take) => ({
          ...take,
          snapshot: { ...take.snapshot },
        })),
        warnings: recording.premiumProduction.warning
          ? [recording.premiumProduction.warning]
          : [],
      };
    }
  }
  const takes = initialTakes.map((take) => ({
    ...take,
    snapshot: { ...take.snapshot },
  }));
  const premiumMessageIds = new Set(
    options.premiumSegments?.flatMap((segment) => segment.sourceMessageIds) ?? [],
  );
  for (const take of takes) {
    if (
      take.snapshot.channel === "primary" &&
      take.snapshot.sourceMessageId &&
      premiumMessageIds.has(take.snapshot.sourceMessageId)
    ) {
      continue;
    }
    if (take.snapshot.durationMs || take.snapshot.mode === "mute") continue;
    if (take.snapshot.mode === "bottish") {
      const updated = await updateCapturedReplayVoiceTake(Promise.resolve(take), {
        durationMs: Math.max(1_200, take.snapshot.spokenText.split(/\s+/u).length * 260),
      });
      replaceTake(takes, updated);
    }
  }
  const buffers = new Map<string, AudioBuffer | null>();
  for (const take of takes) {
    const buffer = await audioForTake({ take, warnings }).catch(() => {
      warnings.push(`${take.snapshot.speakerName}: frozen voice unavailable; rendered silently.`);
      return null;
    });
    buffers.set(take.id, buffer);
    if (buffer && !take.snapshot.durationMs) {
      const adjustedProfile = applyVoiceDeliveryMoodToProfile(
        take.snapshot.profile,
        take.snapshot.moodKey,
      );
      const durationMs = Math.max(
        1,
        Math.round(
          (buffer.duration / resolveVoicePlaybackTransform(adjustedProfile).tempo) * 1_000,
        ),
      );
      const updated = await updateCapturedReplayVoiceTake(Promise.resolve(take), {
        durationMs,
      });
      replaceTake(takes, updated);
    }
  }
  const fallbackBuffersByMessageId = new Map<string, AudioBuffer>();
  const capturedPrimaryMessageIds = new Set(
    takes.flatMap((take) =>
      take.snapshot.channel === "primary" && take.snapshot.sourceMessageId
        ? [take.snapshot.sourceMessageId]
        : [],
    ),
  );
  for (const utterance of recording.manifest.utterances) {
    if (
      !utterance.audible ||
      premiumMessageIds.has(utterance.sourceMessageId) ||
      capturedPrimaryMessageIds.has(utterance.sourceMessageId)
    ) continue;
    const fallback = await synthesizeLegacyReplayUtterance(
      utterance.spokenText || utterance.text,
    ).catch(() => null);
    if (fallback) {
      fallbackBuffersByMessageId.set(utterance.sourceMessageId, fallback);
      warnings.push(
        `${recording.manifest.participants.find((participant) => participant.id === utterance.speakerId)?.name ?? utterance.speakerRole}: captured voice was missing; local speech fallback used.`,
      );
    }
  }
  let timeline = compileReplayTimelineV1(recording.manifest, takes);
  const premiumBuffers: Array<{
    segment: ReplayPremiumSegmentV1;
    buffer: AudioBuffer;
    startMs: number;
  }> = [];
  if (options.premiumSegments?.length) {
    let cursorMs = 2_360;
    const timingByMessageId = new Map<string, { startMs: number; endMs: number }>();
    for (const segment of [...options.premiumSegments].sort((a, b) => a.index - b.index)) {
      const response = await replayFetch(segment.audioUrl);
      if (!response.ok) throw new Error("A cached Premium voice segment is unavailable.");
      const buffer = await decodeAudio(await response.arrayBuffer());
      premiumBuffers.push({ segment, buffer, startMs: cursorMs });
      for (const timing of segment.timings) {
        timingByMessageId.set(timing.sourceMessageId, {
          startMs: cursorMs + timing.startMs,
          endMs: cursorMs + Math.max(timing.startMs + 1, timing.endMs),
        });
      }
      cursorMs += Math.max(segment.durationMs, Math.round(buffer.duration * 1_000)) + 420;
    }
    const beats = timeline.beats.map((beat) => {
      if (beat.kind !== "utterance" || !beat.sourceMessageId) return beat;
      const timing = timingByMessageId.get(beat.sourceMessageId);
      return timing ? { ...beat, ...timing } : beat;
    });
    const end = beats.find((beat) => beat.kind === "end");
    if (end) {
      end.startMs = Math.max(cursorMs + 240, 3_100);
      end.endMs = end.startMs + 2_000;
    }
    timeline = {
      ...timeline,
      beats: beats.sort((a, b) => a.startMs - b.startMs),
      durationMs: Math.max(...beats.map((beat) => beat.endMs)),
    };
  }
  const scheduledAssets: Array<{
    buffer: AudioBuffer;
    startMs: number;
    gain: number;
    loop?: boolean;
  }> = [];
  if (recording.surface === "signal" && options.includeProductionAssets !== false) {
    const metadata = recording.manifest.visual.metadata ?? {};
    const [intro, outdent, atmosphere] = await Promise.all([
      replayAssetBuffer(metadata.introAudioUrl),
      replayAssetBuffer(metadata.outdentAudioUrl),
      replayAssetBuffer(metadata.atmosphereAudioUrl),
    ]);
    if (intro) scheduledAssets.push({ buffer: intro, startMs: 0, gain: 0.82 });
    if (outdent) {
      const endStart = timeline.beats.find((beat) => beat.kind === "end")?.startMs ?? timeline.durationMs - 2_000;
      scheduledAssets.push({ buffer: outdent, startMs: Math.max(0, endStart), gain: 0.78 });
    }
    if (atmosphere) {
      const mix = metadata.atmosphereMix as Record<string, unknown> | undefined;
      scheduledAssets.push({
        buffer: atmosphere,
        startMs: 0,
        gain: Math.max(0.04, Math.min(0.28, Number(mix?.background ?? 0.12))),
        loop: true,
      });
    }
    const soundboardCueCountByKind = new Map<
      (typeof SIGNAL_SOUNDBOARD_CUES)[number]["kind"],
      number
    >();
    for (const event of recording.manifest.events) {
      if (event.kind !== "soundboard_cue") continue;
      const cue = SIGNAL_SOUNDBOARD_CUES.find(
        (candidate) => candidate.kind === event.payload.kind,
      );
      if (!cue) continue;
      const variantIndex = soundboardCueCountByKind.get(cue.kind) ?? 0;
      soundboardCueCountByKind.set(cue.kind, variantIndex + 1);
      const plan = signalSoundboardPlaybackPlan(cue.kind, variantIndex);
      if (!plan) continue;
      const buffer = await replayAssetBuffer(plan.src);
      if (!buffer) {
        warnings.push(`Signal ${cue.label.toLowerCase()} cue was unavailable.`);
        continue;
      }
      scheduledAssets.push({
        buffer,
        startMs: syntheticEventTimeMs(recording, timeline, event),
        gain: plan.trim,
      });
    }
  }
  const frameCount = Math.max(
    1,
    Math.ceil(((timeline.durationMs + REPLAY_AUDIO_TAIL_MS) / 1_000) * REPLAY_AUDIO_SAMPLE_RATE),
  );
  const context = new OfflineAudioContext(2, frameCount, REPLAY_AUDIO_SAMPLE_RATE);
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 16;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.22;
  compressor.connect(context.destination);
  const takeByMessageId = new Map(
    takes
      .filter(
        (take) =>
          take.snapshot.sourceMessageId && take.snapshot.channel === "primary",
      )
      .map((take) => [take.snapshot.sourceMessageId as string, take]),
  );
  for (const utterance of recording.manifest.utterances) {
    if (
      utterance.audible &&
      !premiumMessageIds.has(utterance.sourceMessageId) &&
      !takeByMessageId.has(utterance.sourceMessageId) &&
      !fallbackBuffersByMessageId.has(utterance.sourceMessageId)
    ) {
      const speaker = recording.manifest.participants.find(
        (participant) => participant.id === utterance.speakerId,
      );
      warnings.push(
        `${speaker?.name ?? utterance.speakerRole}: no frozen voice take was captured; rendered silently.`,
      );
    }
  }
  for (const beat of timeline.beats) {
    if (beat.kind !== "utterance" || !beat.sourceMessageId) continue;
    const take = takeByMessageId.get(beat.sourceMessageId);
    if (premiumMessageIds.has(beat.sourceMessageId)) continue;
    const buffer = take
      ? buffers.get(take.id)
      : fallbackBuffersByMessageId.get(beat.sourceMessageId);
    if (!buffer) continue;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const adjustedProfile = take
      ? applyVoiceDeliveryMoodToProfile(
          take.snapshot.profile,
          take.snapshot.moodKey,
        )
      : null;
    const transform = adjustedProfile
      ? resolveVoicePlaybackTransform(adjustedProfile)
      : { tempo: 1, pitchCents: 0 };
    source.playbackRate.value = transform.tempo;
    source.detune.value = transform.pitchCents;
    const gain = context.createGain();
    const profileVolume =
      take && "volume" in take.snapshot.profile ? take.snapshot.profile.volume : 1;
    gain.gain.value = Math.max(
      0,
      Math.min(1.5, (take?.snapshot.gain ?? 1) * profileVolume),
    );
    const lowpass = context.createBiquadFilter();
    lowpass.type = "lowpass";
    const warmth = Math.max(-1, Math.min(1, take?.snapshot.profile.warmth ?? 0));
    lowpass.frequency.value = 16_000 - Math.max(0, warmth) * 5_000;
    source.connect(lowpass);
    lowpass.connect(gain);
    connectRoomAcoustics({
      context,
      input: gain,
      destination: compressor,
      send:
        recording.surface === "signal" && (take?.snapshot.effectsEnabled ?? true)
          ? SIGNAL_STUDIO_VOICE_ROOM_SEND
          : null,
      stereoPan: take?.snapshot.stereoPan ?? 0,
    });
    source.start(beat.startMs / 1_000);
  }
  for (const premium of premiumBuffers) {
    const source = context.createBufferSource();
    source.buffer = premium.buffer;
    const gain = context.createGain();
    gain.gain.value = 1;
    source.connect(gain);
    gain.connect(compressor);
    source.start(premium.startMs / 1_000);
  }
  for (const take of takes) {
    if (take.snapshot.channel === "primary" || !take.snapshot.sourceMessageId) {
      continue;
    }
    const buffer = buffers.get(take.id);
    const primaryBeat = timeline.beats.find(
      (beat) => beat.sourceMessageId === take.snapshot.sourceMessageId,
    );
    if (!buffer || !primaryBeat) continue;
    const event = recording.manifest.events.find(
      (candidate) =>
        candidate.kind === "listener_reaction" &&
        ((candidate.payload.plan as Record<string, unknown> | undefined)?.messageId ===
          take.snapshot.sourceMessageId ||
          candidate.payload.messageId === take.snapshot.sourceMessageId),
    );
    const plan = event?.payload.plan as Record<string, unknown> | undefined;
    const targetProgress = Math.max(
      0.3,
      Math.min(0.75, Number(plan?.targetProgress ?? event?.payload.targetProgress ?? 0.55)),
    );
    const source = context.createBufferSource();
    source.buffer = buffer;
    const adjustedProfile = applyVoiceDeliveryMoodToProfile(
      take.snapshot.profile,
      take.snapshot.moodKey,
    );
    const transform = resolveVoicePlaybackTransform(adjustedProfile);
    source.playbackRate.value = transform.tempo;
    source.detune.value = transform.pitchCents;
    const gain = context.createGain();
    gain.gain.value = Math.max(0, Math.min(1.5, take.snapshot.gain));
    source.connect(gain);
    connectRoomAcoustics({
      context,
      input: gain,
      destination: compressor,
      send: take.snapshot.effectsEnabled ? SIGNAL_STUDIO_VOICE_ROOM_SEND : null,
      stereoPan: take.snapshot.stereoPan,
    });
    const startMs =
      primaryBeat.startMs +
      (primaryBeat.endMs - primaryBeat.startMs) * targetProgress +
      (take.snapshot.channel === "crosstalk" ? 280 : 0);
    source.start(startMs / 1_000);
  }
  for (const asset of scheduledAssets) {
    const source = context.createBufferSource();
    source.buffer = asset.buffer;
    source.loop = asset.loop === true;
    const gain = context.createGain();
    gain.gain.value = asset.gain;
    source.connect(gain);
    gain.connect(compressor);
    source.start(asset.startMs / 1_000);
    if (source.loop) source.stop(timeline.durationMs / 1_000);
  }
  return {
    audioBuffer: await context.startRendering(),
    timeline,
    takes,
    warnings: [...new Set(warnings)],
  };
}
