"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  VOICE_EFFECTS,
  VOICE_EFFECT_LABELS,
  exportVoiceAlignmentTraceJsonV1,
  normalizeVoiceAlignmentTraceV1,
  voiceAlignmentOriginIsAuthoritativeV1,
  type BotAudioVoiceProfileV1,
  type VoiceAlignmentSurfaceV1,
  type VoiceAlignmentTraceV1,
  type VoiceEffect,
} from "@localai/shared";
import {
  VOICE_SYNC_LAB_ENGINE_OPTIONS,
  VOICE_SYNC_LAB_STRESS_CORPUS,
  analyzeVoiceSyncLabPcm,
  createVoiceSyncLabInspectionPlayer,
  createVoiceSyncLabSyntheticCalibrationWav,
  encodeVoiceSyncLabPcmWave,
  estimateVoiceSyncLabPerceptualMetrics,
  loadVoiceSyncLabCapabilities,
  playVoiceSyncLabClip,
  synthesizeVoiceSyncLabClip,
  type VoiceSyncLabCapabilities,
  type VoiceSyncLabEngineId,
  type VoiceSyncLabInspectionPlayer,
  type VoiceSyncLabPlaybackResult,
  type VoiceSyncLabPlaybackSession,
  type VoiceSyncLabPcmAnalysis,
  type VoiceSyncLabSynthesisClip,
  type VoiceSyncLabSyntheticCalibrationWav,
} from "../voiceSyncLabAudio";
import { coffeeSeatPlateGlyph } from "../coffee-seat-plate";
import {
  crtSpeechMouthShapeAtAlignedElapsedMs,
  crtSpeechMouthShapeAtTextCursor,
  englishCrtVisemeTimeline,
  type ZenLiveBotMouthShape,
} from "../zenLiveMouth";
import styles from "./voiceSyncLab.module.css";

const DEFAULT_PHRASE = "Papa packed blue maps beside Mom.";
const FIXTURE_SAMPLE_RATE = 48_000;
const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1] as const;
const MOUTH_SHAPES = new Set<ZenLiveBotMouthShape>([
  "open-wide",
  "closed",
  "speech-closed",
  "narrow",
  "open-small",
  "open-round",
  "dot",
  "at",
  "click",
]);

const PROFILE_PRESETS = [
  { id: "balanced", label: "Factory balanced" },
  { id: "warm", label: "Warm + open" },
  { id: "bright", label: "Bright + nimble" },
  { id: "weighty", label: "Low + weighty" },
] as const;

const SURFACE_OPTIONS = [
  { id: "chat", label: "Chat companion" },
  { id: "zen", label: "Zen live avatar" },
  { id: "coffee", label: "Coffee seat" },
  { id: "signal", label: "Signal studio" },
  { id: "debate", label: "Debate stage" },
  { id: "sandbox", label: "Sandbox" },
] as const satisfies readonly {
  id: VoiceAlignmentSurfaceV1;
  label: string;
}[];

type ProfilePresetId = (typeof PROFILE_PRESETS)[number]["id"];
type AuthState = "checking" | "authenticated" | "anonymous" | "unavailable";
type TraceMode = "engine" | "heuristic" | "synthetic";
type NoticeState = { kind: "error" | "info"; message: string } | null;

interface WavePoint {
  peak: number;
  active: boolean;
}

interface MouthSpan {
  startFrame: number;
  endFrame: number;
  shape: string;
  open: boolean;
}

function isZenMouthShape(value: string | undefined): value is ZenLiveBotMouthShape {
  return Boolean(value && MOUTH_SHAPES.has(value as ZenLiveBotMouthShape));
}

function mouthShapeIsOpen(shape: string): boolean {
  return !["closed", "speech-closed", "narrow", "dot"].includes(shape);
}

function heuristicDurationMs(text: string): number {
  return Math.min(12_000, Math.max(1_400, Array.from(text).length * 72));
}

function heuristicVisemeSpans(
  text: string,
  frameCount: number,
): VoiceAlignmentTraceV1["visemeSpans"] {
  const beats = englishCrtVisemeTimeline(text);
  const totalUnits = beats.reduce((total, beat) => total + beat.durationUnits, 0);
  if (totalUnits <= 0 || frameCount <= 0) return [];
  let elapsedUnits = 0;
  return beats.map((beat) => {
    const startFrame = Math.round((elapsedUnits / totalUnits) * frameCount);
    elapsedUnits += beat.durationUnits;
    return {
      startFrame,
      endFrame: Math.max(
        startFrame + 1,
        Math.round((elapsedUnits / totalUnits) * frameCount),
      ),
      origin: "heuristic" as const,
      confidence: null,
      sourceStart: beat.sourceStart,
      sourceEnd: beat.sourceEnd,
      viseme: beat.shape,
    };
  });
}

function mouthTransitionsForVisemes(
  spans: VoiceAlignmentTraceV1["visemeSpans"],
  frameCount: number,
): VoiceAlignmentTraceV1["mouthTransitions"] {
  const transitions: VoiceAlignmentTraceV1["mouthTransitions"] = [];
  let previous: string | null = null;
  for (const span of spans) {
    if (span.viseme === previous) continue;
    transitions.push({
      atFrame: span.startFrame,
      from: previous,
      to: span.viseme,
      open: mouthShapeIsOpen(span.viseme),
    });
    previous = span.viseme;
  }
  if (previous !== "closed") {
    transitions.push({
      atFrame: frameCount,
      from: previous,
      to: "closed",
      open: false,
    });
  }
  return transitions;
}

function buildHeuristicTrace(
  text: string,
  surface: VoiceAlignmentSurfaceV1,
  requestedEngine: VoiceSyncLabEngineId,
): VoiceAlignmentTraceV1 {
  const frameCount = Math.round(
    (heuristicDurationMs(text) / 1_000) * FIXTURE_SAMPLE_RATE,
  );
  const visemeSpans = heuristicVisemeSpans(text, frameCount);
  return normalizeVoiceAlignmentTraceV1({
    v: 1,
    utteranceId: "visual-heuristic",
    surface,
    engine: {
      requested: requestedEngine,
      resolved: "zenLiveMouth visual heuristic",
      provider: null,
      model: null,
    },
    alignmentStatus: "unaligned",
    alignmentReason:
      "No engine timing or final PCM exists. This is the production visual heuristic only.",
    sourceText: text,
    spokenText: "",
    sampleRate: FIXTURE_SAMPLE_RATE,
    frameCount,
    articulation: { startFrame: 0, endFrame: frameCount },
    presentation: { startFrame: 0, endFrame: frameCount },
    characterSpans: [],
    phonemeSpans: [],
    visemeSpans,
    speechSpans: [],
    silenceSpans: [],
    mouthTransitions: mouthTransitionsForVisemes(visemeSpans, frameCount),
  });
}

function buildSyntheticReferenceTrace(
  surface: VoiceAlignmentSurfaceV1,
  calibration: VoiceSyncLabSyntheticCalibrationWav,
): VoiceAlignmentTraceV1 {
  const { frameCount, sampleRate } = calibration.pcm;
  const [p, ae, k] = calibration.phonemeSpans;
  if (!p || !ae || !k) {
    throw new Error("Synthetic calibration spans are incomplete.");
  }
  return normalizeVoiceAlignmentTraceV1({
    v: 1,
    utteranceId: "synthetic-pack-reference-v1",
    surface,
    engine: {
      requested: "synthetic-reference",
      resolved: "authored /p/ /æ/ /k/ reference",
      provider: "qa-fixture",
      model: null,
    },
    alignmentStatus: "aligned",
    alignmentReason:
      "Synthetic reference with authored engine phoneme, viseme, PCM activity, and mouth events.",
    sourceText: "Pack.",
    spokenText: "Pack.",
    sampleRate,
    frameCount,
    articulation: { startFrame: p.startFrame, endFrame: k.endFrame },
    presentation: { startFrame: 0, endFrame: frameCount },
    characterSpans: [
      {
        startFrame: p.startFrame,
        endFrame: p.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 0,
        sourceEnd: 1,
        character: "P",
      },
      {
        startFrame: ae.startFrame,
        endFrame: ae.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 1,
        sourceEnd: 2,
        character: "a",
      },
      {
        startFrame: k.startFrame,
        endFrame: k.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 2,
        sourceEnd: 4,
        character: "ck",
      },
    ],
    phonemeSpans: [
      {
        startFrame: p.startFrame,
        endFrame: p.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 0,
        sourceEnd: 1,
        phoneme: "/p/",
      },
      {
        startFrame: ae.startFrame,
        endFrame: ae.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 1,
        sourceEnd: 2,
        phoneme: "/æ/",
      },
      {
        startFrame: k.startFrame,
        endFrame: k.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 2,
        sourceEnd: 4,
        phoneme: "/k/",
      },
    ],
    visemeSpans: [
      {
        startFrame: p.startFrame,
        endFrame: p.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 0,
        sourceEnd: 1,
        viseme: "speech-closed",
      },
      {
        startFrame: ae.startFrame,
        endFrame: ae.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 1,
        sourceEnd: 2,
        viseme: "open-wide",
      },
      {
        startFrame: k.startFrame,
        endFrame: k.endFrame,
        origin: "engine",
        confidence: 1,
        sourceStart: 2,
        sourceEnd: 4,
        viseme: "open-round",
      },
    ],
    speechSpans: [
      {
        startFrame: p.startFrame,
        endFrame: p.endFrame,
        origin: "generated",
        confidence: 1,
      },
      {
        startFrame: ae.startFrame,
        endFrame: ae.endFrame,
        origin: "generated",
        confidence: 1,
      },
      {
        startFrame: k.startFrame,
        endFrame: k.endFrame,
        origin: "generated",
        confidence: 1,
      },
    ],
    silenceSpans: [
      {
        startFrame: 0,
        endFrame: p.startFrame,
        origin: "generated",
        confidence: 1,
      },
      {
        startFrame: p.endFrame,
        endFrame: ae.startFrame,
        origin: "generated",
        confidence: 1,
      },
      {
        startFrame: ae.endFrame,
        endFrame: k.startFrame,
        origin: "generated",
        confidence: 1,
      },
      {
        startFrame: k.endFrame,
        endFrame: frameCount,
        origin: "generated",
        confidence: 1,
      },
    ],
    mouthTransitions: calibration.mouthTransitions,
  });
}

function frameForSeconds(seconds: number, sampleRate: number, maximum: number) {
  return Math.min(maximum, Math.max(0, Math.round(seconds * sampleRate)));
}

function buildEngineTrace(
  clip: VoiceSyncLabSynthesisClip,
  surface: VoiceAlignmentSurfaceV1,
): VoiceAlignmentTraceV1 {
  const engineSpokenText = clip.alignment?.characters.join("") ?? "";
  const visualText = engineSpokenText || clip.sourceText;
  const sampleRate = clip.sourcePcm?.sampleRate ?? FIXTURE_SAMPLE_RATE;
  const alignedEndSeconds =
    clip.alignment?.characterEndTimesSeconds.at(-1) ?? 0;
  const fallbackFrameCount = Math.round(
    Math.max(alignedEndSeconds * 1_000, heuristicDurationMs(visualText)) /
      1_000 *
      sampleRate,
  );
  const frameCount = Math.max(1, clip.sourcePcm?.frameCount ?? fallbackFrameCount);
  const activity = clip.sourceAnalysis?.activity ?? [];
  const sourceStart = activity[0]?.startFrame ?? 0;
  const sourceEnd = activity.at(-1)?.endFrame ?? frameCount;
  let sourceCursor = 0;
  const authoritativeOrigin =
    clip.alignmentOrigin === "provider"
      ? ("provider" as const)
      : clip.alignmentOrigin === "generated"
        ? ("generated" as const)
        : ("heuristic" as const);
  const alignedCharacters = clip.alignment
    ? clip.alignment.characters.flatMap((character, index) => {
        const characterCount = Array.from(character).length;
        const startFrame = frameForSeconds(
          clip.alignment!.characterStartTimesSeconds[index] ?? 0,
          sampleRate,
          frameCount,
        );
        const endFrame = frameForSeconds(
          clip.alignment!.characterEndTimesSeconds[index] ?? 0,
          sampleRate,
          frameCount,
        );
        const currentSourceStart = sourceCursor;
        sourceCursor += characterCount;
        if (endFrame <= startFrame) return [];
        return [
          {
            startFrame,
            endFrame,
            origin: authoritativeOrigin,
            confidence: null,
            sourceStart: currentSourceStart,
            sourceEnd: sourceCursor,
            character,
          },
        ];
      })
    : [];
  const visemeSpans = alignedCharacters.length
    ? alignedCharacters.map((span) => ({
        startFrame: span.startFrame,
        endFrame: span.endFrame,
        confidence: span.confidence,
        sourceStart: span.sourceStart,
        sourceEnd: span.sourceEnd,
        origin: "heuristic" as const,
        viseme: crtSpeechMouthShapeAtTextCursor({
          text: visualText,
          cursorIndex: span.sourceStart ?? 0,
        }),
      }))
    : heuristicVisemeSpans(visualText, frameCount);
  return normalizeVoiceAlignmentTraceV1({
    v: 1,
    utteranceId: clip.utteranceId,
    surface,
    engine: {
      requested: clip.requestedEngine,
      resolved: clip.engineUsed ?? "unknown",
      provider:
        clip.engineUsed === "elevenlabs"
          ? "elevenlabs"
          : clip.localEngine ?? clip.engineUsed,
      model: clip.modelHash,
    },
    // Shared normalization derives the strongest honest status. Character
    // timestamps without authoritative phonemes can reach PARTIAL, not ALIGNED.
    alignmentStatus: clip.alignment ? "partial" : "unaligned",
    alignmentReason: clip.alignmentReason,
    sourceText: clip.sourceText,
    spokenText: engineSpokenText,
    sampleRate,
    frameCount,
    articulation: { startFrame: sourceStart, endFrame: sourceEnd },
    presentation: { startFrame: 0, endFrame: frameCount },
    characterSpans: alignedCharacters,
    phonemeSpans: [],
    visemeSpans,
    // Decoded source PCM is reserved for the waveform. This truth track stays
    // empty until the production playback bus reports rendered audio activity.
    speechSpans: [],
    silenceSpans: [],
    mouthTransitions: mouthTransitionsForVisemes(visemeSpans, frameCount),
  });
}

function adjustedTraceForMouthOffset(
  trace: VoiceAlignmentTraceV1,
  offsetMs: number,
): VoiceAlignmentTraceV1 {
  if (!offsetMs) return trace;
  const offsetFrames = Math.round((offsetMs / 1_000) * trace.sampleRate);
  return normalizeVoiceAlignmentTraceV1({
    ...trace,
    mouthTransitions: trace.mouthTransitions.map((transition) => ({
      ...transition,
      atFrame: Math.min(
        trace.frameCount,
        Math.max(0, transition.atFrame + offsetFrames),
      ),
    })),
  });
}

function mouthSpansForTrace(trace: VoiceAlignmentTraceV1): MouthSpan[] {
  return trace.mouthTransitions.flatMap((transition, index) => {
    const endFrame =
      trace.mouthTransitions[index + 1]?.atFrame ?? trace.presentation.endFrame;
    if (endFrame <= transition.atFrame) return [];
    return [
      {
        startFrame: transition.atFrame,
        endFrame,
        shape: transition.to,
        open: transition.open,
      },
    ];
  });
}

function profileForSelection(
  profileId: ProfilePresetId,
  effect: VoiceEffect,
): BotAudioVoiceProfileV1 {
  const tonalPatch =
    profileId === "warm"
      ? { warmth: 0.5, openness: 0.24, weight: 0.14, lilt: 0.08 }
      : profileId === "bright"
        ? { brightness: 0.55, openness: 0.18, pace: 0.12, lilt: 0.18 }
        : profileId === "weighty"
          ? { pitch: -0.26, weight: 0.58, resonance: 0.38, pace: -0.08 }
          : {};
  return {
    ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
    ...tonalPatch,
    v: 2,
    elevenLabsEffect: effect,
  };
}

function durationMsForTrace(trace: VoiceAlignmentTraceV1 | null): number {
  if (!trace || trace.sampleRate <= 0) return 0;
  return (trace.frameCount / trace.sampleRate) * 1_000;
}

function formatTimecode(milliseconds: number): string {
  const safe = Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0);
  const seconds = Math.floor(safe / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}.${String(
    Math.floor(safe % 1_000),
  ).padStart(3, "0")}`;
}

function formatSignedMilliseconds(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < 0.0005) return "0.0";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;
}

function formatSignedFrames(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "not observed";
  if (value === 0) return "0 frames";
  return `${value > 0 ? "+" : "−"}${Math.abs(value).toLocaleString()} frames`;
}

function percent(frame: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  return Math.min(100, Math.max(0, (frame / frameCount) * 100));
}

function spanStyle(
  startFrame: number,
  endFrame: number,
  frameCount: number,
): CSSProperties {
  return {
    left: `${percent(startFrame, frameCount)}%`,
    width: `${Math.max(0.15, percent(endFrame - startFrame, frameCount))}%`,
  };
}

function compactWaveform(
  analysis: VoiceSyncLabPcmAnalysis | null,
): WavePoint[] {
  const waveform = analysis?.waveform ?? [];
  if (waveform.length <= 180) {
    return waveform.map(({ peak, active }) => ({ peak, active }));
  }
  const stride = Math.ceil(waveform.length / 180);
  const points: WavePoint[] = [];
  for (let index = 0; index < waveform.length; index += stride) {
    const bucket = waveform.slice(index, index + stride);
    points.push({
      peak: Math.max(...bucket.map((point) => point.peak)),
      active: bucket.some((point) => point.active),
    });
  }
  return points;
}

function downloadBytes(bytes: BlobPart, type: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]+/giu, "-").replace(/^-+|-+$/gu, "") || "voice-sync";
}

function currentSymbol(
  spans: VoiceAlignmentTraceV1["visemeSpans"],
  frame: number,
): string | null {
  return (
    spans.find((span) => frame >= span.startFrame && frame < span.endFrame)
      ?.viseme ?? null
  );
}

function traceMouthShapeAtFrame(
  trace: VoiceAlignmentTraceV1,
  frame: number,
): ZenLiveBotMouthShape {
  const transition = trace.mouthTransitions.findLast(
    (candidate) => candidate.atFrame <= frame,
  );
  if (isZenMouthShape(transition?.to)) return transition.to;
  return crtSpeechMouthShapeAtAlignedElapsedMs({
    text: trace.spokenText || trace.sourceText,
    elapsedMs: (frame / trace.sampleRate) * 1_000,
    durationMs: durationMsForTrace(trace),
    alignment: null,
  });
}

export function VoiceSyncLab(): React.JSX.Element {
  const [phrase, setPhrase] = useState(DEFAULT_PHRASE);
  const [engine, setEngine] = useState<VoiceSyncLabEngineId>("local-auto");
  const [profilePreset, setProfilePreset] =
    useState<ProfilePresetId>("balanced");
  const [effect, setEffect] = useState<VoiceEffect>("clean");
  const [surface, setSurface] =
    useState<VoiceAlignmentSurfaceV1>("zen");
  const [systemVoiceName, setSystemVoiceName] = useState("");
  const [traceMode, setTraceMode] = useState<TraceMode>("heuristic");
  const [clip, setClip] = useState<VoiceSyncLabSynthesisClip | null>(null);
  const [engineTrace, setEngineTrace] = useState<VoiceAlignmentTraceV1 | null>(
    null,
  );
  const [authState, setAuthState] = useState<AuthState>("checking");
  const [capabilities, setCapabilities] =
    useState<VoiceSyncLabCapabilities | null>(null);
  const [notice, setNotice] = useState<NoticeState>(null);
  const [generating, setGenerating] = useState(false);
  const [productionRunning, setProductionRunning] = useState(false);
  const [playbackResult, setPlaybackResult] =
    useState<VoiceSyncLabPlaybackResult | null>(null);
  const [productionMouthShape, setProductionMouthShape] =
    useState<ZenLiveBotMouthShape | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cursorMs, setCursorMs] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [loop, setLoop] = useState(false);
  const [mouthOffsetMs, setMouthOffsetMs] = useState(0);
  const [shhAtMs, setShhAtMs] = useState<number | null>(null);
  const [shhCaptureFrame, setShhCaptureFrame] = useState<number | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const inspectionPlayerRef = useRef<VoiceSyncLabInspectionPlayer | null>(null);
  const productionSessionRef = useRef<VoiceSyncLabPlaybackSession | null>(null);
  const clockRef = useRef({ cursorMs: 0, startedAtMs: 0 });
  const cursorMsRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/me", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          setAuthState(response.status === 401 || response.status === 403 ? "anonymous" : "unavailable");
          return;
        }
        const payload = (await response.json().catch(() => null)) as
          | { user?: unknown }
          | null;
        setAuthState(payload?.user ? "authenticated" : "anonymous");
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name !== "AbortError") {
          setAuthState("unavailable");
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      generationAbortRef.current?.abort();
      productionSessionRef.current?.stop();
    },
    [],
  );

  useEffect(() => {
    if (authState !== "authenticated") {
      setCapabilities(null);
      return;
    }
    const controller = new AbortController();
    void loadVoiceSyncLabCapabilities({ signal: controller.signal })
      .then((nextCapabilities) => {
        if (controller.signal.aborted) return;
        setCapabilities(nextCapabilities);
        setSystemVoiceName(
          (current) =>
            current || nextCapabilities.systemVoices[0]?.name || "",
        );
      })
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "AbortError") return;
        setCapabilities(null);
      });
    return () => controller.abort();
  }, [authState]);

  const selectedEngine = useMemo(
    () =>
      VOICE_SYNC_LAB_ENGINE_OPTIONS.find((option) => option.id === engine) ??
      VOICE_SYNC_LAB_ENGINE_OPTIONS[0],
    [engine],
  );
  const syntheticCalibration = useMemo(
    () => createVoiceSyncLabSyntheticCalibrationWav(FIXTURE_SAMPLE_RATE),
    [],
  );
  const syntheticAnalysis = useMemo(
    () =>
      analyzeVoiceSyncLabPcm(syntheticCalibration.pcm, {
        maxWaveformPoints: 180,
      }),
    [syntheticCalibration],
  );
  const syntheticTrace = useMemo(
    () => buildSyntheticReferenceTrace(surface, syntheticCalibration),
    [surface, syntheticCalibration],
  );
  const heuristicTrace = useMemo(
    () =>
      phrase.trim()
        ? buildHeuristicTrace(phrase.trim(), surface, engine)
        : null,
    [engine, phrase, surface],
  );
  const sourceTrace =
    traceMode === "synthetic"
      ? syntheticTrace
      : traceMode === "engine"
        ? engineTrace
        : heuristicTrace;
  const trace = useMemo(
    () =>
      sourceTrace
        ? adjustedTraceForMouthOffset(sourceTrace, mouthOffsetMs)
        : null,
    [mouthOffsetMs, sourceTrace],
  );
  const perceptualMetricsEstimate = useMemo(
    () =>
      trace &&
      traceMode === "engine" &&
      playbackResult?.finalAudio.deviceLatencyEstimateMs !== null &&
      playbackResult?.finalAudio.deviceLatencyEstimateMs !== undefined
        ? estimateVoiceSyncLabPerceptualMetrics({
            trace,
            deviceLatencyEstimateMs:
              playbackResult.finalAudio.deviceLatencyEstimateMs,
          })
        : null,
    [playbackResult?.finalAudio.deviceLatencyEstimateMs, trace, traceMode],
  );
  const durationMs = durationMsForTrace(trace);
  const cursorFrame = trace
    ? Math.min(
        trace.frameCount,
        Math.max(0, Math.round((cursorMs / 1_000) * trace.sampleRate)),
      )
    : 0;
  const tracedMouthShape = trace
    ? traceMouthShapeAtFrame(trace, cursorFrame)
    : "closed";
  const currentMouthShape =
    productionRunning && productionMouthShape
      ? productionMouthShape
      : tracedMouthShape;
  const currentFace = coffeeSeatPlateGlyph("warm", currentMouthShape);
  const currentMouthGlyph = Array.from(currentFace.text).at(-1) ?? "|";
  const currentViseme = trace
    ? currentSymbol(trace.visemeSpans, cursorFrame)
    : null;
  const currentPhoneme = trace
    ? trace.phonemeSpans.find(
        (span) => cursorFrame >= span.startFrame && cursorFrame < span.endFrame,
      )?.phoneme ?? null
    : null;
  const currentCharacter = trace
    ? trace.characterSpans.find(
        (span) => cursorFrame >= span.startFrame && cursorFrame < span.endFrame,
      )?.character ?? null
    : null;
  const softwareClockVerified =
    playbackResult?.traceVerification === "software-clock-verified";
  const finalAudioReady =
    traceMode === "synthetic" ||
    (traceMode === "engine" && softwareClockVerified);
  const currentAudioActive =
    trace && finalAudioReady
      ? trace.speechSpans.some(
          (span) => cursorFrame >= span.startFrame && cursorFrame < span.endFrame,
        )
      : null;
  const mouthSpans = useMemo(
    () => (trace ? mouthSpansForTrace(trace) : []),
    [trace],
  );
  const waveform = useMemo(
    () =>
      traceMode === "synthetic"
        ? compactWaveform(syntheticAnalysis)
        : compactWaveform(
            softwareClockVerified
              ? playbackResult?.finalAudio.rawSoftwareBusAnalysis ?? null
              : clip?.sourceAnalysis ?? null,
          ),
    [
      clip?.sourceAnalysis,
      playbackResult?.finalAudio.rawSoftwareBusAnalysis,
      softwareClockVerified,
      syntheticAnalysis,
      traceMode,
    ],
  );
  const waveformFrameCount =
    traceMode === "synthetic"
      ? syntheticCalibration.pcm.frameCount
      : softwareClockVerified
        ? playbackResult?.finalAudio.rawSoftwareBusPcm?.frameCount ?? 0
        : clip?.sourcePcm?.frameCount ?? 0;
  const waveformWidthPercent = trace
    ? percent(waveformFrameCount, trace.frameCount)
    : 100;
  const canGenerateWithoutAuth = engine === "bottish";
  const authRequired =
    authState !== "authenticated" && !canGenerateWithoutAuth;
  const systemVoiceMissing =
    engine === "system" &&
    (!capabilities?.systemVoiceAvailable || !systemVoiceName.trim());
  const capturedAppOutputAvailable = Boolean(
    playbackResult?.finalAudio.rawSoftwareBusWavBytes,
  );
  const inspectorTransportLabel =
    traceMode === "synthetic"
      ? "synthetic calibration WAV"
      : traceMode !== "engine"
        ? "visual clock only"
        : capturedAppOutputAvailable
          ? softwareClockVerified
            ? "captured software app-output WAV; same frame-zero clock as trace"
            : "dry source WAV on the trace clock; captured app-output WAV is export-only and unregistered"
          : "dry synthesized source bytes before capture; no production effects claim";
  const productionCaptureLabel = softwareClockVerified
    ? "gap-free software app-output clock"
    : capturedAppOutputAvailable
      ? "captured output; clock verification unavailable"
      : "not measured";

  useEffect(() => {
    inspectionPlayerRef.current?.dispose();
    inspectionPlayerRef.current = null;
    const capturedAppOutputWav =
      playbackResult?.finalAudio.rawSoftwareBusWavBytes ?? null;
    const audioSource =
      traceMode === "synthetic"
        ? {
            bytes: syntheticCalibration.bytes,
            audioContentType: syntheticCalibration.audioContentType,
          }
        : traceMode === "engine" && capturedAppOutputWav && softwareClockVerified
          ? { bytes: capturedAppOutputWav, audioContentType: "audio/wav" }
          : traceMode === "engine" && clip
            ? { bytes: clip.bytes, audioContentType: clip.audioContentType }
          : null;
    if (!audioSource) return;
    const player = createVoiceSyncLabInspectionPlayer({
      ...audioSource,
      offsetMs: 0,
      rate: 1,
      loop: false,
      onProgress: (progress) => {
        setCursorMs(progress.currentMs);
        setPlaying(progress.playing);
      },
      onEnded: () => setPlaying(false),
      onError: (error) => {
        setPlaying(false);
        setNotice({ kind: "error", message: error.message });
      },
    });
    inspectionPlayerRef.current = player;
    return () => {
      if (inspectionPlayerRef.current === player) {
        inspectionPlayerRef.current = null;
      }
      player.dispose();
    };
  }, [
    clip,
    playbackResult?.finalAudio.rawSoftwareBusWavBytes,
    softwareClockVerified,
    syntheticCalibration,
    traceMode,
  ]);

  useEffect(() => {
    inspectionPlayerRef.current?.setRate(playbackRate);
  }, [playbackRate]);

  useEffect(() => {
    inspectionPlayerRef.current?.setLoop(loop);
  }, [loop]);

  useEffect(() => {
    cursorMsRef.current = cursorMs;
  }, [cursorMs]);

  useEffect(() => {
    if (!playing || !trace || durationMs <= 0) return;
    if (inspectionPlayerRef.current) return;
    clockRef.current = {
      cursorMs: cursorMsRef.current,
      startedAtMs: performance.now(),
    };
    let frame = 0;
    const tick = (nowMs: number) => {
      const elapsed = (nowMs - clockRef.current.startedAtMs) * playbackRate;
      const next = clockRef.current.cursorMs + elapsed;
      if (next >= durationMs) {
        if (loop) {
          clockRef.current = {
            cursorMs: 0,
            startedAtMs: nowMs,
          };
          setCursorMs(0);
          frame = window.requestAnimationFrame(tick);
          return;
        }
        setCursorMs(durationMs);
        setPlaying(false);
        return;
      }
      setCursorMs(next);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [durationMs, loop, playbackRate, playing, trace]);

  useEffect(() => {
    setCursorMs((current) => Math.min(current, durationMs));
  }, [durationMs]);

  const resetToHeuristic = useCallback(() => {
    generationAbortRef.current?.abort();
    productionSessionRef.current?.stop();
    productionSessionRef.current = null;
    setClip(null);
    setEngineTrace(null);
    setPlaybackResult(null);
    setTraceMode("heuristic");
    setCursorMs(0);
    setPlaying(false);
    setProductionRunning(false);
    setProductionMouthShape(null);
    setShhAtMs(null);
    setShhCaptureFrame(null);
    setNotice(null);
  }, []);

  const generate = useCallback(async () => {
    const text = phrase.trim();
    if (!text) {
      setNotice({ kind: "error", message: "Enter a phrase before generating." });
      return;
    }
    if (authRequired) {
      setNotice({
        kind: "error",
        message:
          "Sign in to run production synthesis. The visual heuristic and synthetic reference stay available without an account.",
      });
      return;
    }
    if (systemVoiceMissing) {
      setNotice({
        kind: "error",
        message: "Choose an installed System voice before generating.",
      });
      return;
    }
    generationAbortRef.current?.abort();
    const controller = new AbortController();
    generationAbortRef.current = controller;
    setGenerating(true);
    setNotice(null);
    setPlaying(false);
    productionSessionRef.current?.stop();
    productionSessionRef.current = null;
    setProductionRunning(false);
    setProductionMouthShape(null);
    setPlaybackResult(null);
    setShhAtMs(null);
    setShhCaptureFrame(null);
    try {
      const nextClip = await synthesizeVoiceSyncLabClip({
        text,
        engine,
        profile: profileForSelection(profilePreset, effect),
        systemVoiceName: systemVoiceName.trim() || null,
        seed: `voice-sync-lab:${engine}:${profilePreset}:${effect}:${text}`,
        signal: controller.signal,
        effectsEnabled: true,
        analysisOptions: { maxWaveformPoints: 720 },
      });
      if (controller.signal.aborted) return;
      setClip(nextClip);
      setEngineTrace(buildEngineTrace(nextClip, surface));
      setTraceMode("engine");
      setCursorMs(0);
      setMouthOffsetMs(0);
      setNotice(
        nextClip.notice
          ? { kind: "info", message: nextClip.notice }
          : null,
      );
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
      const message = error instanceof Error ? error.message : "Voice synthesis failed.";
      if (/auth|sign in|session|401|403/iu.test(message)) setAuthState("anonymous");
      setNotice({ kind: "error", message });
    } finally {
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
        setGenerating(false);
      }
    }
  }, [authRequired, effect, engine, phrase, profilePreset, surface, systemVoiceMissing, systemVoiceName]);

  const loadSyntheticReference = useCallback(() => {
    generationAbortRef.current?.abort();
    productionSessionRef.current?.stop();
    productionSessionRef.current = null;
    setPhrase("Pack.");
    setClip(null);
    setEngineTrace(null);
    setTraceMode("synthetic");
    setCursorMs(0);
    setPlaying(false);
    setProductionRunning(false);
    setProductionMouthShape(null);
    setMouthOffsetMs(0);
    setShhAtMs(null);
    setShhCaptureFrame(null);
    setPlaybackResult(null);
    setNotice(null);
  }, []);

  const handleProductionPlay = useCallback(() => {
    if (!clip || productionRunning) return;
    inspectionPlayerRef.current?.pause();
    inspectionPlayerRef.current?.seek(0);
    productionSessionRef.current?.stop();
    setPlaying(false);
    setProductionRunning(true);
    setProductionMouthShape("closed");
    setPlaybackResult(null);
    setCursorMs(0);
    setMouthOffsetMs(0);
    setShhAtMs(null);
    setShhCaptureFrame(null);
    setNotice(null);

    const session = playVoiceSyncLabClip({
      clip,
      effectsEnabled: true,
      captureFinalPcm: true,
      analysisOptions: { maxWaveformPoints: 720 },
      onEvent: (event) => {
        if (typeof event.elapsedMs === "number") {
          setCursorMs(Math.max(0, event.elapsedMs));
        }
        if (event.kind === "shh" && event.captureFrame !== null) {
          setShhCaptureFrame(event.captureFrame);
        }
      },
      onMouthShape: (shape) => setProductionMouthShape(shape),
    });
    productionSessionRef.current = session;
    void session.done
      .then((result) => {
        if (productionSessionRef.current !== session) return;
        productionSessionRef.current = null;
        setPlaybackResult(result);
        setProductionRunning(false);
        setProductionMouthShape("closed");
        if (result.trace) {
          const engineSpokenText = clip.alignment?.characters.join("") ?? "";
          const measuredTrace = normalizeVoiceAlignmentTraceV1({
            ...result.trace,
            surface,
            spokenText: engineSpokenText,
          });
          setEngineTrace(measuredTrace);
          setTraceMode("engine");
          setNotice({
            kind: "info",
            message: result.interrupted
              ? "Production playback was interrupted. Final app-output PCM and the cutoff trace were captured on one AudioContext clock."
              : "Production playback completed. Final app-output PCM and rendered mouth events share one verified AudioContext clock.",
          });
          return;
        }
        setNotice({
          kind: "info",
          message:
            result.traceUnavailableReason ??
            "Production playback completed, but a verified common-clock trace was unavailable.",
        });
      })
      .catch((error: unknown) => {
        if (productionSessionRef.current !== session) return;
        productionSessionRef.current = null;
        setProductionRunning(false);
        setProductionMouthShape("closed");
        setNotice({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Production voice playback failed.",
        });
      });
  }, [clip, productionRunning, surface]);

  const handlePlay = useCallback(() => {
    if (!trace || durationMs <= 0 || productionRunning) return;
    const restart = cursorMs >= durationMs;
    const player = inspectionPlayerRef.current;
    if (player) {
      if (restart) {
        player.seek(0);
        setCursorMs(0);
      }
      void player.play().catch((error: unknown) => {
        setPlaying(false);
        setNotice({
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "Trace inspection audio could not play.",
        });
      });
      return;
    }
    if (restart) setCursorMs(0);
    setPlaying(true);
  }, [cursorMs, durationMs, productionRunning, trace]);

  const handlePause = useCallback(() => {
    inspectionPlayerRef.current?.pause();
    setPlaying(false);
  }, []);

  const handleShh = useCallback(() => {
    if (!trace) return;
    setShhAtMs(cursorMs);
    if (productionSessionRef.current) {
      productionSessionRef.current.shh();
      return;
    }
    inspectionPlayerRef.current?.pause();
    setPlaying(false);
  }, [cursorMs, trace]);

  const exportJson = useCallback(() => {
    if (!sourceTrace) return;
    downloadBytes(
      exportVoiceAlignmentTraceJsonV1(sourceTrace),
      "application/json",
      `${safeFilename(sourceTrace.utteranceId)}.voice-alignment.json`,
    );
  }, [sourceTrace]);

  const exportFinalWav = useCallback(() => {
    if (traceMode === "synthetic") {
      downloadBytes(
        syntheticCalibration.bytes,
        syntheticCalibration.audioContentType,
        "synthetic-pack-reference.wav",
      );
      return;
    }
    const bytes = playbackResult?.finalAudio.rawSoftwareBusWavBytes ?? null;
    if (!bytes) {
      setNotice({
        kind: "error",
        message: "Run Play production to capture an app-output PCM WAV first.",
      });
      return;
    }
    downloadBytes(
      bytes,
      "audio/wav",
      `${safeFilename(playbackResult?.utteranceId ?? "voice-sync")}.app-output.wav`,
    );
  }, [playbackResult, syntheticCalibration, traceMode]);

  const exportSourceWav = useCallback(() => {
    if (!clip) return;
    const bytes =
      clip.rawWavBytes ??
      (clip.sourcePcm ? encodeVoiceSyncLabPcmWave(clip.sourcePcm) : null);
    if (!bytes) return;
    downloadBytes(
      bytes,
      "audio/wav",
      `${safeFilename(clip.utteranceId)}.source.wav`,
    );
  }, [clip]);

  const shhMarkerUsesSoftwareClock =
    softwareClockVerified && shhCaptureFrame !== null;
  const shhFrame =
    trace && shhMarkerUsesSoftwareClock
      ? shhCaptureFrame
      : trace && shhAtMs !== null
        ? Math.round((shhAtMs / 1_000) * trace.sampleRate)
        : null;
  const shhMarkerTitle = shhMarkerUsesSoftwareClock
    ? "Shh cutoff on the verified software app-output clock"
    : "Shh inspection marker on the source timeline; no common-clock cutoff claim";
  const probeCharacterCount = trace
    ? Math.round(
        Array.from(trace.spokenText || trace.sourceText).length *
          (durationMs > 0 ? cursorMs / durationMs : 0),
      )
    : 0;
  const probeText = trace
    ? Array.from(trace.spokenText || trace.sourceText)
        .slice(0, probeCharacterCount)
        .join("")
    : "";
  const traceProvenance =
    traceMode === "synthetic"
      ? "Synthetic reference"
      : traceMode === "engine"
        ? "Engine trace"
        : "Visual heuristic";

  return (
    <main className={styles.shell} data-testid="qa-voice-sync-lab">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>PRISM diagnostics</span>
          <h1>Voice Sync Lab</h1>
          <p>
            Inspect engine timing, software app-output PCM, and the mouth pose
            on one signed frame clock. Missing engine truth stays visibly
            unaligned; physical speaker output is not measured.
          </p>
        </div>
        <div className={styles.headerMeta} aria-label="Lab environment">
          <span className={styles.metaPill}>Dev only</span>
          <span className={styles.metaPill}>No lab persistence</span>
          <span className={styles.authPill} data-state={authState}>
            {authState === "authenticated"
              ? "Signed in"
              : authState === "anonymous"
                ? "Signed out"
                : authState === "unavailable"
                  ? "Auth unavailable"
                  : "Checking auth"}
          </span>
        </div>
      </header>

      <div className={styles.bench}>
        <section className={`${styles.panel} ${styles.setupPanel}`} aria-label="Voice trace setup">
          <div className={styles.phraseColumn}>
            <label htmlFor="voice-sync-phrase" className={styles.fieldLabel}>
              Phrase under test
            </label>
            <textarea
              id="voice-sync-phrase"
              className={styles.phraseField}
              rows={3}
              value={phrase}
              onChange={(event) => {
                setPhrase(event.target.value);
                resetToHeuristic();
              }}
              spellCheck
            />
            <div className={styles.corpusRow} aria-label="Stress corpus">
              <span className={styles.corpusLabel}>Stress corpus</span>
              {VOICE_SYNC_LAB_STRESS_CORPUS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={styles.corpusButton}
                  title={entry.tags.join(" · ")}
                  onClick={() => {
                    setPhrase(entry.text);
                    resetToHeuristic();
                  }}
                >
                  {entry.label}
                </button>
              ))}
              <button
                type="button"
                className={styles.corpusButton}
                aria-pressed={traceMode === "synthetic"}
                onClick={loadSyntheticReference}
              >
                Synthetic /p æ k/
              </button>
            </div>
          </div>

          <div className={styles.settingsColumn}>
            <div className={styles.selectorGrid}>
              <label>
                <span className={styles.groupLabel}>Engine</span>
                <select
                  className={styles.select}
                  aria-label="Engine"
                  value={engine}
                  onChange={(event) => {
                    setEngine(event.target.value as VoiceSyncLabEngineId);
                    resetToHeuristic();
                  }}
                >
                  {VOICE_SYNC_LAB_ENGINE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}{option.requiresOnline ? " · ONLINE / external" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={styles.groupLabel}>Voice profile</span>
                <select
                  className={styles.select}
                  aria-label="Voice profile"
                  value={profilePreset}
                  onChange={(event) => {
                    setProfilePreset(event.target.value as ProfilePresetId);
                    resetToHeuristic();
                  }}
                >
                  {PROFILE_PRESETS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={styles.groupLabel}>Voice effect</span>
                <select
                  className={styles.select}
                  aria-label="Voice effect"
                  value={effect}
                  onChange={(event) => {
                    setEffect(event.target.value as VoiceEffect);
                    resetToHeuristic();
                  }}
                >
                  {VOICE_EFFECTS.map((voiceEffect) => (
                    <option key={voiceEffect} value={voiceEffect}>
                      {VOICE_EFFECT_LABELS[voiceEffect]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={styles.groupLabel}>Surface context (metadata)</span>
                <select
                  className={styles.select}
                  aria-label="Surface context"
                  value={surface}
                  onChange={(event) => {
                    setSurface(event.target.value as VoiceAlignmentSurfaceV1);
                    resetToHeuristic();
                  }}
                >
                  {SURFACE_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {engine === "system" ? (
              <label>
                <span className={styles.groupLabel}>Installed System voice</span>
                <select
                  className={styles.select}
                  aria-label="System voice"
                  value={systemVoiceName}
                  disabled={
                    authState !== "authenticated" ||
                    !capabilities?.systemVoiceAvailable
                  }
                  onChange={(event) => {
                    setSystemVoiceName(event.target.value);
                    resetToHeuristic();
                  }}
                >
                  {capabilities?.systemVoices.length ? (
                    capabilities.systemVoices.map((voice) => (
                      <option key={`${voice.name}:${voice.locale}`} value={voice.name}>
                        {voice.label}
                      </option>
                    ))
                  ) : (
                    <option value="">
                      {authState === "authenticated"
                        ? "No installed voices available"
                        : "Sign in to load installed voices"}
                    </option>
                  )}
                </select>
              </label>
            ) : null}
            <div className={styles.actionRow}>
              <div className={styles.sourceNote}>
                <span className={styles.sourceDot} aria-hidden="true" />
                <span>
                  <strong>{selectedEngine.label}</strong> · {selectedEngine.alignmentExpectation} timing
                </span>
              </div>
              <div className={styles.actionButtons}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={!clip || generating || productionRunning}
                  onClick={handleProductionPlay}
                  title="Run the shipping enqueue, effects, output, mouth, and interruption path"
                >
                  <span aria-hidden="true">▶</span>
                  {productionRunning ? "Capturing output…" : "Play production"}
                </button>
                <button
                  type="button"
                  className={`${styles.button} ${styles.buttonPrimary}`}
                  disabled={generating || productionRunning || !phrase.trim() || authRequired || systemVoiceMissing}
                  onClick={() => void generate()}
                >
                  <span aria-hidden="true">◇</span>
                  {generating ? "Generating…" : "Generate trace"}
                </button>
              </div>
            </div>
          </div>
        </section>

        {authState === "anonymous" ? (
          <div className={styles.notice} role="status">
            <span className={styles.noticeIcon} aria-hidden="true">!</span>
            <span>
              Signed out. Production synthesis requires authentication; the
              visual heuristic, Bottish fixture, scrubber, and synthetic
              reference remain available.
            </span>
          </div>
        ) : null}
        {notice ? (
          <div className={styles.notice} data-kind={notice.kind} role={notice.kind === "error" ? "alert" : "status"}>
            <span className={styles.noticeIcon} aria-hidden="true">
              {notice.kind === "error" ? "×" : "i"}
            </span>
            <span>{notice.message}</span>
          </div>
        ) : null}

        <div className={styles.workspaceGrid}>
          <section className={`${styles.panel} ${styles.timelinePanel}`} aria-label="Alignment trace">
            <div className={styles.transport}>
              <div className={styles.transportControls}>
                <button
                  type="button"
                  className={styles.transportButton}
                  data-primary="true"
                  disabled={!trace || playing || productionRunning}
                  onClick={handlePlay}
                  aria-label="Play trace"
                >
                  ▶ Play
                </button>
                <button
                  type="button"
                  className={styles.transportButton}
                  disabled={!playing || productionRunning}
                  onClick={handlePause}
                  aria-label="Pause trace"
                >
                  Ⅱ Pause
                </button>
                <button
                  type="button"
                  className={styles.toggle}
                  data-active={loop ? "true" : "false"}
                  aria-pressed={loop}
                  disabled={productionRunning}
                  onClick={() => setLoop((current) => !current)}
                >
                  ↻ Loop
                </button>
              </div>
              <div className={styles.scrubGroup}>
                <span className={styles.timecode}>{formatTimecode(cursorMs)}</span>
                <input
                  className={styles.scrubber}
                  type="range"
                  min={0}
                  max={Math.max(1, durationMs)}
                  step={1}
                  value={Math.min(cursorMs, Math.max(1, durationMs))}
                  disabled={!trace || productionRunning}
                  aria-label="Trace cursor"
                  aria-valuetext={`${Math.round(cursorMs)} milliseconds`}
                  onChange={(event) => {
                    const nextCursorMs = Number(event.target.value);
                    inspectionPlayerRef.current?.pause();
                    inspectionPlayerRef.current?.seek(nextCursorMs);
                    setCursorMs(nextCursorMs);
                    setPlaying(false);
                  }}
                />
                <span className={styles.timecode}>{formatTimecode(durationMs)}</span>
              </div>
              <div className={styles.speedControls} aria-label="Trace inspection controls">
                <span className={styles.speedLabel}>Inspect</span>
                {PLAYBACK_RATES.map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    className={styles.speedButton}
                    data-active={playbackRate === rate ? "true" : "false"}
                    aria-pressed={playbackRate === rate}
                    disabled={productionRunning}
                    onClick={() => setPlaybackRate(rate)}
                  >
                    {rate}×
                  </button>
                ))}
                <div className={styles.offsetControl}>
                  <label htmlFor="mouth-offset">Mouth Δ</label>
                  <input
                    id="mouth-offset"
                    className={styles.offsetSlider}
                    type="range"
                    min={-250}
                    max={250}
                    step={5}
                    value={mouthOffsetMs}
                    disabled={productionRunning}
                    aria-label="Mouth timing offset"
                    aria-valuetext={`${mouthOffsetMs > 0 ? "+" : ""}${mouthOffsetMs} milliseconds; negative leads and positive lags`}
                    onChange={(event) => setMouthOffsetMs(Number(event.target.value))}
                  />
                  <span className={styles.offsetValue}>
                    {mouthOffsetMs > 0 ? "+" : ""}{mouthOffsetMs} ms
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.metrics} aria-live="polite">
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Alignment status</span>
                <span className={styles.alignmentBadge} data-status={trace?.alignmentStatus ?? "unaligned"}>
                  {(trace?.alignmentStatus ?? "unaligned").toUpperCase()}
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>App-bus first-open vs speech Δ</span>
                <span className={styles.metricValue}>
                  {trace && finalAudioReady ? formatSignedMilliseconds(trace.metrics.onsetDeltaMs) : "—"}
                  <small>ms</small>
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>App-bus last-open vs speech Δ</span>
                <span className={styles.metricValue}>
                  {trace && finalAudioReady ? formatSignedMilliseconds(trace.metrics.offsetDeltaMs) : "—"}
                  <small>ms</small>
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Device-est. first-open vs speech Δ</span>
                <span className={styles.metricValue}>
                  {perceptualMetricsEstimate ? formatSignedMilliseconds(perceptualMetricsEstimate.onsetDeltaMs) : "—"}
                  <small>ms</small>
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Device-est. last-open vs speech Δ</span>
                <span className={styles.metricValue}>
                  {perceptualMetricsEstimate ? formatSignedMilliseconds(perceptualMetricsEstimate.offsetDeltaMs) : "—"}
                  <small>ms</small>
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>App-bus drift</span>
                <span className={styles.metricValue}>
                  {trace && finalAudioReady ? formatSignedMilliseconds(trace.metrics.driftMs) : "—"}
                  <small>ms</small>
                </span>
              </div>
              <div className={styles.metric}>
                <span className={styles.metricLabel}>Silent mouth-open</span>
                <span className={styles.metricValue}>
                  {trace && finalAudioReady ? trace.metrics.silenceOpenViolationCount : "—"}
                  <small>events</small>
                </span>
              </div>
            </div>

            <div className={styles.timelineHeader}>
              <div>
                <h2 className={styles.timelineTitle}>Frame-domain trace</h2>
                <span className={styles.timelineProvenance}>
                  {trace?.engine.resolved ?? "No trace"}
                </span>
              </div>
              {traceMode === "synthetic" ? (
                <span className={styles.syntheticTag}>Synthetic reference</span>
              ) : traceMode === "heuristic" ? (
                <span className={styles.syntheticTag}>Visual heuristic · not engine truth</span>
              ) : null}
            </div>

            <div className={styles.textTruth}>
              <div className={styles.truthItem}>
                <span>Submitted source</span>
                <strong data-empty={trace?.sourceText ? "false" : "true"}>
                  {trace?.sourceText || "Enter a phrase"}
                </strong>
              </div>
              <div className={styles.truthItem}>
                <span>Engine spoken text</span>
                <strong data-empty={trace?.spokenText ? "false" : "true"}>
                  {trace?.spokenText || "Unavailable — engine supplied no transcript"}
                </strong>
              </div>
            </div>

            <div className={styles.timelineScroller}>
              <div
                className={styles.timelineCanvas}
                role="img"
                aria-label={`${traceProvenance} with waveform, engine timing, final audio activity, and mouth transitions`}
              >
                <div className={styles.ruler} aria-hidden="true">
                  <span />
                  <div className={styles.rulerTicks}>
                    {[0, 0.25, 0.5, 0.75, 1].map((position) => (
                      <span key={position}>{Math.round(durationMs * position)} ms</span>
                    ))}
                  </div>
                </div>

                <div className={styles.track}>
                  <div className={styles.trackLabel}>
                    <strong>
                      {softwareClockVerified
                        ? "App-output waveform"
                        : "Decoded waveform"}
                    </strong>
                    <span>
                      {traceMode === "engine"
                        ? softwareClockVerified
                          ? "app output PCM"
                          : capturedAppOutputAvailable
                            ? "source bytes; captured output unregistered"
                            : "source bytes"
                        : traceMode === "synthetic"
                          ? "authored fixture WAV"
                          : "no audio"}
                    </span>
                  </div>
                  <div className={styles.trackBody}>
                    {waveform.length ? (
                      <div
                        className={styles.waveform}
                        style={{
                          right: "auto",
                          width: `calc(${waveformWidthPercent}% - 8px)`,
                        }}
                      >
                        {waveform.map((point, index) => (
                          <span
                            key={index}
                            className={styles.waveBar}
                            style={{
                              height: `${Math.max(3, point.peak * 100)}%`,
                              opacity: point.active ? 1 : 0.34,
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <em className={styles.emptyTrack}>Generate audio to inspect its decoded waveform.</em>
                    )}
                    {shhFrame !== null && trace ? (
                      <span
                        className={styles.eventMarker}
                        title={shhMarkerTitle}
                        style={{ left: `${percent(shhFrame, trace.frameCount)}%` }}
                      />
                    ) : null}
                  </div>
                </div>

                <div className={styles.track} data-symbol-track="true">
                  <div className={styles.trackLabel}>
                    <strong>Engine character / phoneme / viseme</strong>
                    <span>{trace?.alignmentStatus === "unaligned" ? "heuristic or missing" : "timed metadata"}</span>
                  </div>
                  <div className={styles.trackBody}>
                    {trace && (trace.characterSpans.length || trace.phonemeSpans.length || trace.visemeSpans.length) ? (
                      <>
                        {trace.characterSpans.map((span, index) => (
                          <span
                            key={`character-${index}`}
                            className={styles.span}
                            data-lane="character"
                            data-authoritative={voiceAlignmentOriginIsAuthoritativeV1(span.origin) ? "true" : "false"}
                            title={`${span.character} · ${span.origin} character timing`}
                            style={spanStyle(span.startFrame, span.endFrame, trace.frameCount)}
                          >
                            {span.character}
                          </span>
                        ))}
                        {trace.phonemeSpans.map((span, index) => (
                          <span
                            key={`phoneme-${index}`}
                            className={styles.span}
                            data-lane="phoneme"
                            data-authoritative={voiceAlignmentOriginIsAuthoritativeV1(span.origin) ? "true" : "false"}
                            title={`${span.phoneme} · ${span.origin}`}
                            style={spanStyle(span.startFrame, span.endFrame, trace.frameCount)}
                          >
                            {span.phoneme}
                          </span>
                        ))}
                        {trace.visemeSpans.map((span, index) => (
                          <span
                            key={`viseme-${index}`}
                            className={styles.span}
                            data-lane="viseme"
                            data-authoritative={voiceAlignmentOriginIsAuthoritativeV1(span.origin) ? "true" : "false"}
                            title={`${span.viseme} · ${span.origin}`}
                            style={spanStyle(span.startFrame, span.endFrame, trace.frameCount)}
                          >
                            {span.viseme}
                          </span>
                        ))}
                      </>
                    ) : (
                      <em className={styles.emptyTrack}>No engine character, phoneme, or viseme timing supplied.</em>
                    )}
                    {shhFrame !== null && trace ? (
                      <span
                        className={styles.eventMarker}
                        title={shhMarkerTitle}
                        style={{ left: `${percent(shhFrame, trace.frameCount)}%` }}
                      />
                    ) : null}
                  </div>
                </div>

                <div className={styles.track}>
                  <div className={styles.trackLabel}>
                    <strong>Final audio activity</strong>
                    <span>
                      {finalAudioReady
                        ? traceMode === "engine"
                          ? "software app-output clock"
                          : "synthetic app-output clock"
                        : "awaiting output PCM tap"}
                    </span>
                  </div>
                  <div className={styles.trackBody}>
                    {trace && finalAudioReady && trace.speechSpans.length ? (
                      <>
                        {trace.silenceSpans.map((span, index) => (
                          <span
                            key={`silence-${index}`}
                            className={styles.silenceSpan}
                            style={spanStyle(span.startFrame, span.endFrame, trace.frameCount)}
                          />
                        ))}
                        {trace.speechSpans.map((span, index) => (
                          <span
                            key={`activity-${index}`}
                            className={styles.activitySpan}
                            title={`Software app-output activity · ${span.origin}`}
                            style={spanStyle(span.startFrame, span.endFrame, trace.frameCount)}
                          />
                        ))}
                      </>
                    ) : (
                      <em className={styles.emptyTrack}>No final software app-output PCM measurement yet.</em>
                    )}
                    {shhFrame !== null && trace ? (
                      <span
                        className={styles.eventMarker}
                        title={shhMarkerTitle}
                        style={{ left: `${percent(shhFrame, trace.frameCount)}%` }}
                      />
                    ) : null}
                  </div>
                </div>

                <div className={styles.track}>
                  <div className={styles.trackLabel}>
                    <strong>Rendered mouth transitions</strong>
                    <span>production zenLiveMouth</span>
                  </div>
                  <div className={styles.trackBody}>
                    {trace && mouthSpans.length ? (
                      mouthSpans.map((span, index) => (
                        <span
                          key={`mouth-${index}`}
                          className={styles.mouthSpan}
                          data-open={span.open ? "true" : "false"}
                          title={`${span.shape} · ${span.open ? "open" : "closed"}`}
                          style={spanStyle(span.startFrame, span.endFrame, trace.frameCount)}
                        >
                          {span.shape}
                        </span>
                      ))
                    ) : (
                      <em className={styles.emptyTrack}>Enter a phrase to render mouth transitions.</em>
                    )}
                    {shhFrame !== null && trace ? (
                      <span
                        className={styles.eventMarker}
                        title={shhMarkerTitle}
                        style={{ left: `${percent(shhFrame, trace.frameCount)}%` }}
                      />
                    ) : null}
                  </div>
                </div>

                {trace ? (
                  <div className={styles.cursorLayer} aria-hidden="true">
                    <span
                      className={styles.cursor}
                      style={{ left: `${percent(cursorFrame, trace.frameCount)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div className={styles.timelineFooter}>
              <div className={styles.legend} aria-label="Timeline legend">
                <span className={styles.legendItem}><span className={styles.legendSwatch} /> engine timing</span>
                <span className={styles.legendItem}><span className={styles.legendSwatch} data-kind="audio" /> app-output PCM</span>
                <span className={styles.legendItem}><span className={styles.legendSwatch} data-kind="mouth" /> mouth pose</span>
                <span className={styles.legendItem}><span className={styles.legendSwatch} data-kind="shh" /> Shh cutoff</span>
              </div>
              <span className={styles.timelineHint}>
                signed app-bus Δ = mouth − software output · negative leads · positive lags
              </span>
            </div>
            <div className={styles.clockCaveat}>
              <span>
                <strong>Inspector transport</strong> · {inspectorTransportLabel}
              </span>
              <span>
                <strong>Production capture</strong> · {productionCaptureLabel}
              </span>
              <span>
                Device latency estimate · {playbackResult?.finalAudio.deviceLatencyEstimateMs === null || playbackResult?.finalAudio.deviceLatencyEstimateMs === undefined ? "not measured" : `${playbackResult.finalAudio.deviceLatencyEstimateMs.toFixed(1)} ms`}
              </span>
              <span>Physical speaker loopback · not measured</span>
              <span>Surface · {surface} context metadata; renderer not mounted</span>
            </div>
          </section>

          <aside className={`${styles.panel} ${styles.previewPanel}`} aria-label="Live mouth preview">
            <div className={styles.previewHeader}>
              <h2>Live mouth probe</h2>
              <span>{traceMode === "heuristic" ? "Visual heuristic" : "Trace pose"}</span>
            </div>
            <div className={styles.avatarStage}>
              <div className={styles.avatarHousing} aria-hidden="true">
                <div className={styles.avatarScreen}>
                  <div className={styles.avatarFace}>
                    <span className={styles.avatarEyes}>• •</span>
                    <span className={styles.avatarMouth} data-open={mouthShapeIsOpen(currentMouthShape) ? "true" : "false"}>
                      {currentMouthGlyph}
                    </span>
                  </div>
                </div>
                <span className={styles.avatarLed} />
              </div>
              <div className={styles.avatarCaption}>
                <span>Production glyph map</span>
                <strong>{currentMouthShape}</strong>
              </div>
            </div>
            <div className={styles.cursorReadout}>
              <div className={styles.readoutItem}>
                <span>Frame</span>
                <strong>{trace ? cursorFrame.toLocaleString() : "—"}</strong>
              </div>
              <div className={styles.readoutItem}>
                <span>Engine</span>
                <strong>{currentPhoneme ?? currentCharacter ?? currentViseme ?? "—"}</strong>
              </div>
              <div className={styles.readoutItem}>
                <span>App output</span>
                <strong>{currentAudioActive === null ? "NO PCM TRUTH" : currentAudioActive ? "ACTIVE" : "SILENT"}</strong>
              </div>
              <div className={styles.readoutItem}>
                <span>Mouth pose</span>
                <strong>{currentMouthShape}</strong>
              </div>
            </div>
            <div className={styles.probeArea}>
              <button
                type="button"
                className={`${styles.button} ${styles.shhButton}`}
                disabled={!trace}
                onClick={handleShh}
              >
                <span aria-hidden="true">■</span>{" "}
                {productionRunning ? "Shh · interrupt production" : "Shh at cursor"}
              </button>
              <p className={styles.probeCopy} aria-live="polite">
                {shhAtMs === null ? (
                  productionRunning
                    ? "Stops the shipping voice queue and records the common-clock cutoff frame."
                    : "Places an inspection marker and pauses dry-byte or visual playback."
                ) : (
                  <>
                    <strong>
                      {playbackResult?.interruptionAudit
                        ? softwareClockVerified
                          ? `Production cutoff frame ${playbackResult.interruptionAudit.shhFrame.toLocaleString()}`
                          : `Captured cutoff frame ${playbackResult.interruptionAudit.shhFrame.toLocaleString()} · timeline marker inspection-only`
                        : `Cutoff ${formatTimecode(shhAtMs)}`}
                    </strong>{" "}
                    {playbackResult?.interruptionAudit ? (
                      <span className={styles.auditVerdicts}>
                        <span className={styles.auditVerdict}>
                          <span>Immediate audio cutoff</span>
                          <b data-result={playbackResult.interruptionAudit.immediateCutoffObserved ? "pass" : "fail"}>
                            {playbackResult.interruptionAudit.immediateCutoffObserved ? "PASS" : "FAIL"}
                          </b>
                          <small>
                            last active − Shh {formatSignedFrames(playbackResult.interruptionAudit.cutoffDeltaFrames)} · tolerance ≤ {playbackResult.interruptionAudit.cutoffToleranceFrames.toLocaleString()} frames
                          </small>
                        </span>
                        <span className={styles.auditVerdict}>
                          <span>Immediate mouth close</span>
                          <b data-result={playbackResult.interruptionAudit.mouthClosedImmediately === null ? "na" : playbackResult.interruptionAudit.mouthClosedImmediately ? "pass" : "fail"}>
                            {playbackResult.interruptionAudit.mouthClosedImmediately === null ? "N/A" : playbackResult.interruptionAudit.mouthClosedImmediately ? "PASS" : "FAIL"}
                          </b>
                          <small>
                            close − Shh {formatSignedFrames(playbackResult.interruptionAudit.mouthCloseDeltaFrames)} · tolerance ≤ {playbackResult.interruptionAudit.cutoffToleranceFrames.toLocaleString()} frames
                          </small>
                        </span>
                        <span className={styles.auditDetail}>
                          Post-cut silence · {playbackResult.interruptionAudit.observedPostCutSilenceMs.toFixed(1)} ms · {playbackResult.interruptionAudit.postCutSilenceObserved ? "observed" : "not verified"}
                        </span>
                      </span>
                    ) : (
                      <>
                        · {trace?.spokenText ? "engine-spoken" : "visual-source"} probe “{probeText || "∅"}”
                      </>
                    )}
                  </>
                )}
              </p>
            </div>
          </aside>
        </div>

        <section className={`${styles.panel} ${styles.exportPanel}`} aria-label="Trace export">
          <div className={styles.exportCopy}>
            <strong>Ephemeral by design</strong>
            <span>
              This lab does not persist state or add it to a canonical conversation · ElevenLabs sends the phrase through PRISM&apos;s API to an external provider · exports happen only on click · Mouth Δ is view-only and never alters raw JSON
            </span>
          </div>
          <div className={styles.exportActions}>
            <button type="button" className={styles.button} disabled={!trace} onClick={exportJson}>
              <span className={styles.buttonIcon} aria-hidden="true">{`{}`}</span>
              Export JSON
            </button>
            <button
              type="button"
              className={styles.button}
              disabled={
                traceMode !== "synthetic" &&
                !playbackResult?.finalAudio.rawSoftwareBusWavBytes
              }
              onClick={exportFinalWav}
            >
              <span className={styles.buttonIcon} aria-hidden="true">≈</span>
              {traceMode === "synthetic" ? "Export fixture WAV" : "Export app-output WAV"}
            </button>
            {clip?.sourcePcm ? (
              <button type="button" className={styles.button} onClick={exportSourceWav}>
                <span className={styles.buttonIcon} aria-hidden="true">≈</span>
                Export source WAV
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
