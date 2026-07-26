import type {
  ReplayManifestV2,
  ReplayMouthCueV2,
  ReplayPremiumSegmentV1,
  ReplayRecordingV1,
  ReplayTimelineBeatV1,
  ReplayTimelineV1,
  BotcastSoundboardCueKind,
} from "@localai/shared";
import { replayFetch } from "./replayClient";
import { bundledCoffeeActionSfxPlaybackForSeed } from "./coffee-action-sfx";
import { signalSoundboardPlaybackPlan } from "./signalSoundboard";
import { SIGNAL_REPLAY_DEFAULT_INTRO_DURATION_MS } from "./signalReplayVideoFrame";

const SAMPLE_RATE = 48_000;
const SEGMENT_GAP_MS = 320;
const TAIL_MS = 650;

type ScheduledBuffer = {
  buffer: AudioBuffer;
  startMs: number;
  gain: number;
  loop?: boolean;
  stopMs?: number;
  playbackRate?: number;
};

export interface PreparedSignalStudioCut {
  timeline: ReplayTimelineV1;
  manifest: ReplayManifestV2;
  durationMs: number;
  warnings: string[];
  renderWindows: () => AsyncGenerator<AudioBuffer>;
}

async function decodeAudio(url: string): Promise<AudioBuffer> {
  const response = await replayFetch(url);
  if (!response.ok) throw new Error(`Studio Cut asset is unavailable (${response.status}).`);
  const bytes = await response.arrayBuffer();
  const context = new OfflineAudioContext(2, 1, SAMPLE_RATE);
  return context.decodeAudioData(bytes.slice(0));
}

function metadataUrl(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function mouthShape(character: string): ReplayMouthCueV2["shape"] {
  if (/[\s.,!?;:'"()[\]{}-]/u.test(character)) return "speech-closed";
  if (/[oquw]/iu.test(character)) return "open-round";
  if (/[bmp]/iu.test(character)) return "closed";
  if (/[fv]/iu.test(character)) return "narrow";
  if (/[a]/iu.test(character)) return "open-wide";
  return "open-small";
}

export async function prepareSignalStudioCut(
  recording: ReplayRecordingV1,
  segments: readonly ReplayPremiumSegmentV1[],
): Promise<PreparedSignalStudioCut> {
  if (!recording.manifest || recording.manifest.v !== 2) {
    throw new Error("Studio Cut requires a Replay V2 Signal manifest.");
  }
  const sourceManifest = recording.manifest;
  const sortedSegments = [...segments].sort((left, right) => left.index - right.index);
  if (sortedSegments.length === 0) throw new Error("Studio Cut voice segments are missing.");
  const decodedSegments = await Promise.all(
    sortedSegments.map(async (segment) => ({
      segment,
      buffer: await decodeAudio(segment.audioUrl),
    })),
  );
  const metadata = sourceManifest.visual.metadata ?? {};
  const introUrl = metadataUrl(metadata, "introAudioUrl");
  const outdentUrl = metadataUrl(metadata, "outdentAudioUrl");
  const atmosphereUrl = metadataUrl(metadata, "atmosphereAudioUrl");
  const [intro, outdent, atmosphere] = await Promise.all([
    introUrl ? decodeAudio(introUrl).catch(() => null) : null,
    outdentUrl ? decodeAudio(outdentUrl).catch(() => null) : null,
    atmosphereUrl ? decodeAudio(atmosphereUrl).catch(() => null) : null,
  ]);
  const introDurationMs = intro ? Math.round(intro.duration * 1_000) : 0;
  let cursorMs = Math.max(
    SIGNAL_REPLAY_DEFAULT_INTRO_DURATION_MS,
    introDurationMs + (intro ? 180 : 0),
  );
  const dialogueStartMs = cursorMs;
  const timingByMessageId = new Map<
    string,
    { startMs: number; endMs: number; alignment: ReplayPremiumSegmentV1["timings"][number]["alignment"] }
  >();
  const scheduled: ScheduledBuffer[] = [];
  if (intro) scheduled.push({ buffer: intro, startMs: 0, gain: 1 });
  for (const { segment, buffer } of decodedSegments) {
    scheduled.push({ buffer, startMs: cursorMs, gain: 1 });
    for (const timing of segment.timings) {
      timingByMessageId.set(timing.sourceMessageId, {
        startMs: cursorMs + timing.startMs,
        endMs: cursorMs + Math.max(timing.startMs + 1, timing.endMs),
        alignment: timing.alignment,
      });
    }
    cursorMs += Math.max(segment.durationMs, Math.round(buffer.duration * 1_000)) +
      SEGMENT_GAP_MS;
  }
  const warnings: string[] = [];
  for (const event of sourceManifest.direction) {
    if (event.kind !== "action" || !event.sourceMessageId) continue;
    const messageTiming = timingByMessageId.get(event.sourceMessageId);
    if (!messageTiming) continue;
    const cueKind = typeof event.payload.kind === "string" ? event.payload.kind : "";
    const soundboardKinds = new Set(["applause", "laughter", "gasp", "rimshot"]);
    let url: string | null = null;
    let gain = 0.32;
    let playbackRate = 1;
    if (soundboardKinds.has(cueKind)) {
      const plan = signalSoundboardPlaybackPlan(
        cueKind as BotcastSoundboardCueKind,
        Number(event.payload.variantIndex) || 0,
      );
      url = plan?.src ?? null;
      gain = plan?.trim ?? gain;
      playbackRate = plan?.playbackRate ?? 1;
    } else if (
      cueKind === "action_sfx" &&
      (event.payload.actionKind === "fart" ||
        event.payload.actionKind === "burp" ||
        event.payload.actionKind === "cough")
    ) {
      const plan = bundledCoffeeActionSfxPlaybackForSeed(
        event.payload.actionKind,
        typeof event.payload.seed === "string"
          ? event.payload.seed
          : `${event.sequence}:${event.sourceMessageId}`,
      );
      url = plan.source;
      gain = 0.42;
      playbackRate = plan.playbackRate;
    }
    if (!url) continue;
    const buffer = await decodeAudio(url).catch(() => null);
    if (!buffer) {
      warnings.push(`A saved ${cueKind.replaceAll("_", " ")} cue was unavailable.`);
      continue;
    }
    scheduled.push({
      buffer,
      startMs: messageTiming.startMs,
      gain,
      playbackRate,
    });
  }
  const outdentStartMs = cursorMs + 180;
  if (outdent) {
    scheduled.push({ buffer: outdent, startMs: outdentStartMs, gain: 0.9 });
  }
  const durationMs = Math.max(
    outdentStartMs + (outdent ? Math.round(outdent.duration * 1_000) : 1_200),
    cursorMs + 1_200,
  );
  if (atmosphere) {
    scheduled.push({
      buffer: atmosphere,
      startMs: 0,
      gain: 0.16,
      loop: true,
      stopMs: durationMs,
    });
  }

  const participantById = new Map(
    sourceManifest.participants.map((participant) => [participant.id, participant]),
  );
  const beats: ReplayTimelineBeatV1[] = sourceManifest.utterances.flatMap((utterance) => {
    const timing = timingByMessageId.get(utterance.sourceMessageId);
    if (!timing) return [];
    return [{
      id: `studio-cut:${utterance.id}`,
      kind: "utterance",
      startMs: timing.startMs,
      endMs: timing.endMs,
      utteranceId: utterance.id,
      sourceMessageId: utterance.sourceMessageId,
      speakerId: utterance.speakerId,
      speakerName: participantById.get(utterance.speakerId)?.name ?? utterance.speakerRole,
      text: utterance.text,
      channel: "primary",
    }];
  });
  beats.push({
    id: "studio-cut:title",
    kind: "title",
    startMs: 0,
    endMs: dialogueStartMs,
    utteranceId: null,
    sourceMessageId: null,
    speakerId: null,
    speakerName: null,
    text: sourceManifest.title,
    channel: null,
  });
  beats.push({
    id: "studio-cut:end",
    kind: "end",
    startMs: outdentStartMs,
    endMs: durationMs,
    utteranceId: null,
    sourceMessageId: null,
    speakerId: null,
    speakerName: null,
    text: "",
    channel: null,
  });
  beats.sort((left, right) => left.startMs - right.startMs);
  const timeline: ReplayTimelineV1 = { v: 1, durationMs, beats };

  const sourceSpeechStartByMessage = new Map<string, number>();
  for (const event of sourceManifest.direction) {
    if (
      event.kind === "speech" &&
      event.payload.active !== false &&
      event.sourceMessageId &&
      !sourceSpeechStartByMessage.has(event.sourceMessageId)
    ) {
      sourceSpeechStartByMessage.set(event.sourceMessageId, event.atMs);
    }
  }
  const anchors = [...timingByMessageId.entries()]
    .flatMap(([messageId, timing]) => {
      const sourceAt = sourceSpeechStartByMessage.get(messageId);
      return sourceAt === undefined ? [] : [{ sourceAt, targetAt: timing.startMs }];
    })
    .sort((left, right) => left.sourceAt - right.sourceAt);
  const remapTime = (sourceAt: number): number => {
    if (anchors.length === 0) return Math.max(0, sourceAt);
    let before = anchors[0]!;
    let after = anchors.at(-1)!;
    for (const anchor of anchors) {
      if (anchor.sourceAt <= sourceAt) before = anchor;
      if (anchor.sourceAt >= sourceAt) {
        after = anchor;
        break;
      }
    }
    if (before.sourceAt === after.sourceAt) {
      return Math.max(0, before.targetAt + (sourceAt - before.sourceAt));
    }
    const unit = (sourceAt - before.sourceAt) / (after.sourceAt - before.sourceAt);
    return Math.max(0, Math.round(before.targetAt + unit * (after.targetAt - before.targetAt)));
  };
  const remappedDirection = sourceManifest.direction.flatMap((event) => {
    if (event.kind === "thinking" || event.kind === "overlap") return [];
    if (event.kind === "intro") {
      return [{
        ...event,
        atMs: 0,
        endMs: dialogueStartMs,
      }];
    }
    if (event.kind === "outro") {
      return [{
        ...event,
        atMs: outdentStartMs,
        endMs: durationMs,
      }];
    }
    if (event.kind === "speech" && event.sourceMessageId) {
      const timing = timingByMessageId.get(event.sourceMessageId);
      if (!timing) return [];
      return [{
        ...event,
        atMs: event.payload.active === false ? timing.endMs : timing.startMs,
        endMs: event.payload.active === false ? undefined : timing.endMs,
        payload: { ...event.payload, channel: "primary" },
      }];
    }
    return [{
      ...event,
      atMs: remapTime(event.atMs),
      endMs: event.endMs === undefined ? undefined : remapTime(event.endMs),
    }];
  });
  const generatedOverlaps = [...timingByMessageId.entries()]
    .map(([sourceMessageId, timing]) => ({ sourceMessageId, ...timing }))
    .sort((left, right) => left.startMs - right.startMs)
    .flatMap((timing, index, timings) => {
      const previous = timings[index - 1];
      if (!previous || timing.startMs >= previous.endMs) return [];
      return [{
        sequence: 0,
        atMs: timing.startMs,
        endMs: Math.min(previous.endMs, timing.endMs),
        kind: "overlap" as const,
        sourceMessageId: timing.sourceMessageId,
        payload: {
          active: true,
          messageIds: [previous.sourceMessageId, timing.sourceMessageId],
        },
      }];
    });
  const mouthTracks = sourceManifest.participants.flatMap((participant) => {
    const cues: ReplayMouthCueV2[] = [];
    for (const utterance of sourceManifest.utterances) {
      if (utterance.speakerId !== participant.id) continue;
      const timing = timingByMessageId.get(utterance.sourceMessageId);
      const alignment = timing?.alignment;
      if (!timing || !alignment) continue;
      const alignmentOriginSeconds =
        alignment.characterStartTimesSeconds.find(Number.isFinite) ?? 0;
      alignment.characters.forEach((character, index) => {
        const relativeStart = alignment.characterStartTimesSeconds[index];
        if (!Number.isFinite(relativeStart)) return;
        cues.push({
          atMs: Math.max(
            timing.startMs,
            timing.startMs +
              Math.round((relativeStart! - alignmentOriginSeconds) * 1_000),
          ),
          shape: mouthShape(character),
        });
      });
      cues.push({ atMs: timing.endMs, shape: "closed" });
    }
    return cues.length > 0
      ? [{ participantId: participant.id, cues: cues.sort((a, b) => a.atMs - b.atMs) }]
      : [];
  });
  const manifest: ReplayManifestV2 = {
    ...sourceManifest,
    privacyMode: "online",
    direction: [...remappedDirection, ...generatedOverlaps]
      .sort((left, right) => left.atMs - right.atMs || left.sequence - right.sequence)
      .map((event, sequence) => ({ ...event, sequence })),
    presentation: {
      ...sourceManifest.presentation,
      mouthTracks,
    },
  };
  const renderWindows = async function* (): AsyncGenerator<AudioBuffer> {
    const windowMs = 8_000;
    for (let startMs = 0; startMs < durationMs + TAIL_MS; startMs += windowMs) {
      const currentWindowMs = Math.min(windowMs, durationMs + TAIL_MS - startMs);
      const context = new OfflineAudioContext(
        2,
        Math.max(1, Math.ceil((currentWindowMs / 1_000) * SAMPLE_RATE)),
        SAMPLE_RATE,
      );
      for (const asset of scheduled) {
        const assetEndMs = asset.loop
          ? (asset.stopMs ?? durationMs)
          : asset.startMs + asset.buffer.duration * 1_000;
        const overlapStart = Math.max(startMs, asset.startMs);
        const overlapEnd = Math.min(startMs + currentWindowMs, assetEndMs);
        if (overlapEnd <= overlapStart) continue;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = asset.buffer;
        source.loop = asset.loop === true;
        source.playbackRate.value = asset.playbackRate ?? 1;
        gain.gain.value = asset.gain;
        source.connect(gain).connect(context.destination);
        const offsetSeconds = Math.max(0, (overlapStart - asset.startMs) / 1_000);
        source.start(
          (overlapStart - startMs) / 1_000,
          asset.loop ? offsetSeconds % asset.buffer.duration : offsetSeconds,
          (overlapEnd - overlapStart) / 1_000,
        );
      }
      yield await context.startRendering();
    }
  };
  return { timeline, manifest, durationMs, warnings, renderWindows };
}
