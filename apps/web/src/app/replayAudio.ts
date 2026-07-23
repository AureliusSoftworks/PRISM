import {
  applyVoiceDeliveryMoodToProfile,
  compileReplayTimelineV1,
  normalizeBotAudioVoiceProfileV1,
  resolveVoicePlaybackTransform,
  type ReplayRecordingV1,
  type ReplayPremiumSegmentV1,
  type ReplayTimelineV1,
  type ReplayVoiceTakeRecordV1,
  type SignalMusicProfile,
} from "@localai/shared";
import { bundledCoffeeActionSfxPlaybackForSeed } from "./coffee-action-sfx";
import { readEnglishVoiceSynthesisClip } from "./englishVoice";
import { resolvePreSpeechBreathPlan } from "./preSpeechBreath";
import {
  replayFetch,
  storeCapturedReplayVoiceAudio,
  updateCapturedReplayVoiceTake,
} from "./replayClient";
import {
  SIGNAL_STUDIO_FOLEY_ROOM_SEND,
  SIGNAL_STUDIO_VOICE_ROOM_SEND,
  connectRoomAcoustics,
} from "./roomAcoustics";
import {
  SESSION_FOLEY_URLS,
  SIGNAL_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE,
  sessionAtmosphereBusVolume,
} from "./session-atmosphere-audio";
import {
  buildSignalSynthIdentPlan,
  buildSignalSynthOutdentPlan,
  encodeSignalSynthIdentWave,
} from "./signalIntroAudio";
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
    if (beat) {
      return event.kind === "audio_cue" &&
        event.payload.kind === "action_sfx"
        ? beat.startMs
        : beat.startMs + Math.min(500, (beat.endMs - beat.startMs) * 0.22);
    }
  }
  const runtimeMs = finiteMetadataNumber(
    recording.manifest?.visual.metadata?.runtimeMs,
  );
  const atMs = finiteMetadataNumber(event.payload.atMs);
  const endStart = timeline.beats.find((beat) => beat.kind === "end")?.startMs ?? timeline.durationMs;
  const contentStart =
    timeline.beats.find((beat) => beat.kind === "title")?.endMs ?? 2_100;
  if (runtimeMs && atMs !== null) {
    return contentStart +
      Math.max(0, Math.min(1, atMs / runtimeMs)) *
        Math.max(0, endStart - contentStart);
  }
  const index = recording.manifest?.events.indexOf(event) ?? 0;
  const count = Math.max(1, recording.manifest?.events.length ?? 1);
  return (
    contentStart +
    ((index + 1) / (count + 1)) * Math.max(0, endStart - contentStart)
  );
}

function signalReplayAudioMix(recording: ReplayRecordingV1): {
  enabled: boolean;
  masterVolume: number;
  atmosphereMix: Record<string, unknown>;
} {
  const metadata = recording.manifest?.visual.metadata ?? {};
  const stored =
    metadata.signalAudioMix &&
    typeof metadata.signalAudioMix === "object" &&
    !Array.isArray(metadata.signalAudioMix)
      ? (metadata.signalAudioMix as Record<string, unknown>)
      : {};
  const masterVolume = Math.max(
    0,
    Math.min(1, Number(stored.masterVolume ?? 1)),
  );
  return {
    enabled: stored.enabled !== false && masterVolume > 0,
    masterVolume,
    atmosphereMix:
      metadata.atmosphereMix &&
      typeof metadata.atmosphereMix === "object" &&
      !Array.isArray(metadata.atmosphereMix)
        ? (metadata.atmosphereMix as Record<string, unknown>)
        : {},
  };
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
  if (recording.surface === "signal" && recording.audioUrl) {
    const response = await replayFetch(recording.audioUrl);
    if (response.ok) {
      const audioBuffer = await decodeAudio(await response.arrayBuffer());
      const savedTimeline =
        recording.timeline ??
        compileReplayTimelineV1(recording.manifest, initialTakes);
      const durationMs = Math.max(
        savedTimeline.durationMs,
        recording.audioDurationMs ?? 0,
        Math.round(audioBuffer.duration * 1_000),
      );
      const timeline: ReplayTimelineV1 = {
        ...savedTimeline,
        durationMs,
        beats: savedTimeline.beats.map((beat) =>
          beat.kind === "end"
            ? {
                ...beat,
                endMs: Math.max(beat.endMs, durationMs),
              }
            : beat,
        ),
      };
      return {
        audioBuffer,
        timeline,
        takes: initialTakes.map((take) => ({
          ...take,
          snapshot: { ...take.snapshot },
        })),
        warnings: [],
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
  const primaryTakeByMessageId = new Map(
    takes
      .filter(
        (take) =>
          take.snapshot.channel === "primary" &&
          take.snapshot.sourceMessageId,
      )
      .map((take) => [take.snapshot.sourceMessageId as string, take]),
  );
  if (options.premiumSegments?.length) {
    let cursorMs =
      (timeline.beats.find((beat) => beat.kind === "title")?.endMs ?? 2_100) +
      260;
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
    stopMs?: number;
    playbackRate?: number;
    lowCutHz?: number;
    highCutHz?: number;
    stereoPan?: number;
    room?: "voice" | "foley";
    fadeOutMs?: number;
  }> = [];
  if (recording.surface === "signal" && options.includeProductionAssets !== false) {
    const metadata = recording.manifest.visual.metadata ?? {};
    const audioMix = signalReplayAudioMix(recording);
    const atmosphereMix =
      audioMix.atmosphereMix as Parameters<
        typeof sessionAtmosphereBusVolume
      >[0]["mix"];
    const foleyGain = sessionAtmosphereBusVolume({
      volume: audioMix.masterVolume,
      mix: atmosphereMix,
      bus: "foley",
    });
    const [initialIntro, initialOutdent, atmosphere] = await Promise.all([
      replayAssetBuffer(metadata.introAudioUrl),
      replayAssetBuffer(metadata.outdentAudioUrl),
      replayAssetBuffer(metadata.atmosphereAudioUrl),
    ]);
    let intro = initialIntro;
    let outdent = initialOutdent;
    const musicProfile =
      metadata.musicProfile &&
      typeof metadata.musicProfile === "object" &&
      !Array.isArray(metadata.musicProfile)
        ? (metadata.musicProfile as SignalMusicProfile)
        : null;
    const musicSeed =
      typeof metadata.musicSeed === "string" ? metadata.musicSeed : null;
    if (metadata.introAudioSource === "local" && musicProfile && musicSeed) {
      intro = await decodeAudio(
        encodeSignalSynthIdentWave(
          buildSignalSynthIdentPlan({ profile: musicProfile, seed: musicSeed }),
        ),
      );
      outdent = await decodeAudio(
        encodeSignalSynthIdentWave(
          buildSignalSynthOutdentPlan({ profile: musicProfile, seed: musicSeed }),
        ),
      );
    }
    if (audioMix.enabled && intro) {
      scheduledAssets.push({
        buffer: intro,
        startMs: 0,
        gain: audioMix.masterVolume,
      });
    }
    if (outdent) {
      const endStart = timeline.beats.find((beat) => beat.kind === "end")?.startMs ?? timeline.durationMs - 2_000;
      if (audioMix.enabled) {
        scheduledAssets.push({
          buffer: outdent,
          startMs: Math.max(0, endStart),
          gain: audioMix.masterVolume * 0.9,
        });
      }
    }
    if (audioMix.enabled && atmosphere) {
      scheduledAssets.push({
        buffer: atmosphere,
        startMs: 0,
        gain: sessionAtmosphereBusVolume({
          volume: audioMix.masterVolume,
          mix: atmosphereMix,
          bus: "background",
        }),
        loop: true,
        stopMs: timeline.durationMs,
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
      const fallbackVariantIndex =
        soundboardCueCountByKind.get(cue.kind) ?? 0;
      const savedVariantIndex = finiteMetadataNumber(
        event.payload.variantIndex,
      );
      const variantIndex = savedVariantIndex ?? fallbackVariantIndex;
      soundboardCueCountByKind.set(
        cue.kind,
        Math.max(fallbackVariantIndex + 1, variantIndex + 1),
      );
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
        gain:
          finiteMetadataNumber(event.payload.gain) ??
          sessionAtmosphereBusVolume({
            volume: audioMix.masterVolume,
            mix: atmosphereMix,
            bus: "foley",
            trim: plan.trim,
          }),
        playbackRate: plan.playbackRate,
        lowCutHz: plan.lowCutHz,
        highCutHz: plan.highCutHz,
        stereoPan: plan.stereoPan,
        room: "foley",
      });
    }
    for (const event of recording.manifest.events) {
      if (event.kind !== "audio_cue") continue;
      const cueKind = event.payload.kind;
      let src: string | null = null;
      let gain = foleyGain;
      let playbackRate = 1;
      if (cueKind === "coffee_sip") {
        src = SESSION_FOLEY_URLS.coffeeSip;
        gain = sessionAtmosphereBusVolume({
          volume: audioMix.masterVolume,
          mix: atmosphereMix,
          bus: "foley",
          trim: 1.25,
        });
      } else if (cueKind === "coffee_cup_place") {
        src = SESSION_FOLEY_URLS.coffeeCupPlace;
        gain = sessionAtmosphereBusVolume({
          volume: audioMix.masterVolume,
          mix: atmosphereMix,
          bus: "foley",
          trim: 1.0625,
        });
      } else if (
        cueKind === "ambient_vocalization" &&
        typeof event.payload.url === "string" &&
        event.payload.url.startsWith("/audio/")
      ) {
        src = event.payload.url;
        gain = sessionAtmosphereBusVolume({
          volume: audioMix.masterVolume,
          mix: atmosphereMix,
          bus: "foley",
          trim: SIGNAL_SESSION_AMBIENT_BOT_VOCALIZATION_PROFILE.trim,
        });
      } else if (
        cueKind === "action_sfx" &&
        typeof event.payload.actionKind === "string"
      ) {
        const actionKind = event.payload.actionKind;
        if (
          actionKind !== "fart" &&
          actionKind !== "burp" &&
          actionKind !== "cough"
        ) {
          continue;
        }
        const plan = bundledCoffeeActionSfxPlaybackForSeed(
          actionKind,
          typeof event.payload.seed === "string"
            ? event.payload.seed
            : event.id,
        );
        src = plan.source;
        playbackRate = plan.playbackRate;
        gain = Math.min(0.48, audioMix.masterVolume * 0.42);
      }
      const savedGain = finiteMetadataNumber(event.payload.gain);
      if (savedGain !== null) gain = Math.min(1.5, savedGain);
      if (!src || gain <= 0) continue;
      const buffer = await replayAssetBuffer(src);
      if (!buffer) {
        warnings.push(`A saved Signal ${String(cueKind).replaceAll("_", " ")} cue was unavailable.`);
        continue;
      }
      scheduledAssets.push({
        buffer,
        startMs: syntheticEventTimeMs(recording, timeline, event),
        gain,
        playbackRate,
        room: cueKind !== "action_sfx" ? "foley" : undefined,
      });
    }
    if (foleyGain > 0) {
      for (const participant of recording.manifest.participants) {
        const visual = participant.metadata?.visualSnapshot;
        if (!visual || typeof visual !== "object" || Array.isArray(visual)) continue;
        const avatarSfx = (visual as Record<string, unknown>).avatarSfx;
        if (
          !avatarSfx ||
          typeof avatarSfx !== "object" ||
          Array.isArray(avatarSfx)
        ) continue;
        const sfx = avatarSfx as Record<string, unknown>;
        const src =
          typeof sfx.audioDataUrl === "string" ? sfx.audioDataUrl : "";
        const configuredVolume = Number(sfx.volume);
        if (!src || !Number.isFinite(configuredVolume) || configuredVolume <= 0) {
          continue;
        }
        const buffer = await replayAssetBuffer(src);
        if (!buffer) {
          warnings.push(`${participant.name}: saved avatar effect was unavailable.`);
          continue;
        }
        const pan = participant.seatIndex === 0 ? -0.32 : participant.seatIndex === 1 ? 0.32 : 0;
        const utteranceBeats = timeline.beats.filter(
          (beat) => beat.kind === "utterance",
        );
        const firstUtterance = utteranceBeats[0];
        const lastUtterance = utteranceBeats.at(-1);
        if (!firstUtterance || !lastUtterance) continue;
        const states = {
          idle: sfx.playWhileIdle === true,
          talking: sfx.playWhileTalking === true,
          thinking: sfx.playWhileThinking === true,
        } as const;
        const boundaries = Array.from(
          new Set([
            firstUtterance.startMs,
            lastUtterance.endMs,
            ...utteranceBeats.flatMap((beat) => [
              beat.startMs,
              beat.endMs,
            ]),
          ]),
        ).sort((left, right) => left - right);
        for (let index = 0; index < boundaries.length - 1; index += 1) {
          const startMs = boundaries[index]!;
          const stopMs = boundaries[index + 1]!;
          const activeBeat = timeline.beats.find(
            (beat) =>
              beat.kind === "utterance" &&
              beat.speakerId === participant.id &&
              startMs >= beat.startMs &&
              startMs < beat.endMs,
          );
          const nextBeat = activeBeat
            ? null
            : utteranceBeats.find((beat) => beat.startMs >= stopMs);
          const state = activeBeat
            ? "talking"
            : nextBeat?.speakerId === participant.id
              ? "thinking"
              : "idle";
          if (!states[state] || stopMs - startMs < 50) continue;
          scheduledAssets.push({
            buffer,
            startMs,
            stopMs,
            loop: true,
            gain: Math.min(1, configuredVolume) * foleyGain,
            stereoPan: pan,
          });
        }
      }
    }
    for (const beat of timeline.beats) {
      if (beat.kind !== "utterance" || !beat.sourceMessageId) continue;
      const take = primaryTakeByMessageId.get(beat.sourceMessageId);
      if (
        !take ||
        take.snapshot.speakerId === "prism-player" ||
        take.snapshot.effectsEnabled === false
      ) {
        continue;
      }
      const profile = normalizeBotAudioVoiceProfileV1(take.snapshot.profile);
      const plan = resolvePreSpeechBreathPlan({
        seed: take.snapshot.seed,
        text: take.snapshot.spokenText,
        surface: "signal",
        mood: take.snapshot.moodKey,
        authoredPerformanceText: [
          take.snapshot.performanceText,
          profile.elevenLabsDirection,
        ]
          .filter(Boolean)
          .join(" "),
        enabled: true,
      });
      if (!plan) continue;
      const buffer = await replayAssetBuffer(plan.url);
      if (!buffer) {
        warnings.push(
          `${take.snapshot.speakerName}: saved mic-ready breath was unavailable.`,
        );
        continue;
      }
      const durationMs = Math.max(1, Math.round(buffer.duration * 1_000));
      scheduledAssets.push({
        buffer,
        startMs: Math.max(
          0,
          beat.startMs - Math.max(0, durationMs - plan.voiceOverlapMs),
        ),
        gain:
          Math.min(1.25, Math.max(0, Number(profile.volume ?? 1))) *
          plan.gain,
        lowCutHz: 90,
        highCutHz: 12_000,
        stereoPan: take.snapshot.stereoPan,
        room: "voice",
        fadeOutMs: durationMs,
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
  for (const utterance of recording.manifest.utterances) {
    if (
      utterance.audible &&
      !premiumMessageIds.has(utterance.sourceMessageId) &&
      !primaryTakeByMessageId.has(utterance.sourceMessageId) &&
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
    const take = primaryTakeByMessageId.get(beat.sourceMessageId);
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
    const timings = premium.segment.timings.filter(
      (timing) => timing.endMs > timing.startMs,
    );
    if (timings.length === 0) {
      const source = context.createBufferSource();
      source.buffer = premium.buffer;
      source.connect(compressor);
      source.start(premium.startMs / 1_000);
      continue;
    }
    for (const timing of timings) {
      const offsetSeconds = Math.max(
        0,
        Math.min(premium.buffer.duration, timing.startMs / 1_000),
      );
      const durationSeconds = Math.max(
        0,
        Math.min(
          premium.buffer.duration - offsetSeconds,
          (timing.endMs - timing.startMs) / 1_000,
        ),
      );
      if (durationSeconds <= 0) continue;
      const take = primaryTakeByMessageId.get(timing.sourceMessageId);
      const profileVolume =
        take && "volume" in take.snapshot.profile
          ? take.snapshot.profile.volume
          : 1;
      const source = context.createBufferSource();
      source.buffer = premium.buffer;
      const gain = context.createGain();
      gain.gain.value = Math.max(
        0,
        Math.min(1.5, (take?.snapshot.gain ?? 1) * profileVolume),
      );
      source.connect(gain);
      connectRoomAcoustics({
        context,
        input: gain,
        destination: compressor,
        send:
          recording.surface === "signal" &&
          (take?.snapshot.effectsEnabled ?? true)
            ? SIGNAL_STUDIO_VOICE_ROOM_SEND
            : null,
        stereoPan: take?.snapshot.stereoPan ?? 0,
      });
      source.start(
        (premium.startMs + timing.startMs) / 1_000,
        offsetSeconds,
        durationSeconds,
      );
    }
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
    source.playbackRate.value = Math.max(
      0.85,
      Math.min(1.15, asset.playbackRate ?? 1),
    );
    source.detune.value = 0;
    const gain = context.createGain();
    const assetStartSeconds = asset.startMs / 1_000;
    gain.gain.setValueAtTime(asset.gain, assetStartSeconds);
    if (asset.fadeOutMs) {
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        assetStartSeconds + Math.max(1, asset.fadeOutMs) / 1_000,
      );
    }
    let output: AudioNode = source;
    if (asset.lowCutHz) {
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = asset.lowCutHz;
      output.connect(highpass);
      output = highpass;
    }
    if (asset.highCutHz) {
      const lowpass = context.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = asset.highCutHz;
      output.connect(lowpass);
      output = lowpass;
    }
    output.connect(gain);
    if (asset.room) {
      connectRoomAcoustics({
        context,
        input: gain,
        destination: compressor,
        send:
          asset.room === "foley"
            ? SIGNAL_STUDIO_FOLEY_ROOM_SEND
            : SIGNAL_STUDIO_VOICE_ROOM_SEND,
        stereoPan: asset.stereoPan ?? 0,
      });
    } else if (asset.stereoPan) {
      const panner = context.createStereoPanner();
      panner.pan.value = asset.stereoPan;
      gain.connect(panner);
      panner.connect(compressor);
    } else {
      gain.connect(compressor);
    }
    source.start(asset.startMs / 1_000);
    if (source.loop || asset.stopMs !== undefined) {
      source.stop(
        Math.max(
          asset.startMs + 1,
          Math.min(timeline.durationMs, asset.stopMs ?? timeline.durationMs),
        ) / 1_000,
      );
    }
  }
  return {
    audioBuffer: await context.startRendering(),
    timeline,
    takes,
    warnings: [...new Set(warnings)],
  };
}
