import type {
  DebateEventV1,
  DebateEvidenceItemV1,
  DebateEvidencePacketV1,
  DebateEvidenceSourceV1,
  DebateSessionV1,
  DebateTurnTimingV1,
} from "@localai/shared";
import {
  debateEstimatedSpeechDurationMs,
  debateEvidenceItemById,
  debateEvidenceTitleCasedForProse,
  debateSpectatorAwaitingFirstWatch,
} from "@localai/shared";
import { defaultUrlTransform } from "react-markdown";

import type { SpeechCharacterAlignment } from "./speechRevealTimeline";

export const DEBATE_SOURCE_LINK_PREFIX = "prism-debate-source:";
export const DEBATE_EVIDENCE_LINK_PREFIX = "prism-debate-evidence:";

const EVIDENCE_MARKER =
  /\[\[(source|exhibit):([a-z0-9][a-z0-9_-]{0,47})\]\]/giu;

/**
 * Keep PRISM evidence packet hrefs intact — react-markdown's default
 * urlTransform otherwise blanks custom protocols and chips never open.
 */
export function debateEvidenceUrlTransform(url: string): string {
  if (
    url.startsWith(DEBATE_EVIDENCE_LINK_PREFIX) ||
    url.startsWith(DEBATE_SOURCE_LINK_PREFIX)
  ) {
    return url;
  }
  return defaultUrlTransform(url);
}

export function debateRevealDurationMs(spokenText: string): number {
  return debateEstimatedSpeechDurationMs(spokenText);
}

export function debateActiveDurationLabel(activeDurationMs: number): string {
  const minutes = Math.max(1, Math.round(activeDurationMs / 60_000));
  return `~${minutes} min active`;
}

/** Delay before a finished floor line lands in Proceedings (court stenographer feel). */
export const DEBATE_PROCEEDINGS_STENOGRAPHER_DELAY_MS = 850;

/**
 * Caption freeze when graceful Pause cuts a live line mid-speech. Keeps the
 * heard fragment and ends with an em dash — Proceedings stay the full saved line.
 */
export function debateInterruptedSpeechCaption(visibleContent: string): string {
  const text = visibleContent.replace(/\s+$/u, "");
  if (!text) return "—";
  if (/[—–…]$/u.test(text)) return text;
  if (/[-]$/u.test(text)) return `${text.slice(0, -1)}—`;
  return `${text}—`;
}

export function debateProceedingsCursorStorageKey(sessionId: string): string {
  return `prism.debate.proceedingsCursor.v1:${sessionId}`;
}

export function debateWatchElapsedStorageKey(sessionId: string): string {
  return `prism.debate.watchElapsed.v1:${sessionId}`;
}

export function readDebateProceedingsCursor(sessionId: string): number | null {
  try {
    const raw = sessionStorage.getItem(
      debateProceedingsCursorStorageKey(sessionId),
    );
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

export function writeDebateProceedingsCursor(
  sessionId: string,
  sequence: number | null,
): void {
  try {
    const key = debateProceedingsCursorStorageKey(sessionId);
    if (sequence === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(sequence));
  } catch {
    // Private mode or blocked storage should not break the chamber.
  }
}

export function readDebateWatchElapsedMs(sessionId: string): number {
  try {
    const raw = sessionStorage.getItem(debateWatchElapsedStorageKey(sessionId));
    if (raw === null || raw === "") return 0;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function writeDebateWatchElapsedMs(
  sessionId: string,
  elapsedMs: number,
): void {
  try {
    sessionStorage.setItem(
      debateWatchElapsedStorageKey(sessionId),
      String(Math.max(0, Math.floor(elapsedMs))),
    );
  } catch {
    // Private mode or blocked storage should not break the chamber.
  }
}

/**
 * Count-up Debate time while the chamber is live. Freezes during recess and
 * before Spectator Start so bake/wait time never inflates the readout.
 */
export function debateWatchElapsedMs(args: {
  accumulatedMs: number;
  runningSinceMs: number | null;
  nowMs: number;
}): number {
  const runningMs =
    args.runningSinceMs === null
      ? 0
      : Math.max(0, args.nowMs - args.runningSinceMs);
  return Math.max(0, args.accumulatedMs + runningMs);
}

/**
 * Proceedings open only through already-heard lines. `null` means the rail is
 * still empty (Spectator hold, fresh Start, or mid-line recess before commit).
 */
export function debateInitialProceedingsCursor(
  session: Pick<
    DebateSessionV1,
    | "id"
    | "status"
    | "events"
    | "pausedPresentationEventId"
    | "playerRole"
    | "stepKey"
    | "completedAt"
  >,
  awaitingFirstWatch: boolean,
): number | null {
  if (
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
  ) {
    return session.events.at(-1)?.sequence ?? null;
  }
  if (awaitingFirstWatch) return null;
  const heldId = session.pausedPresentationEventId;
  if (heldId) {
    const held = session.events.find((event) => event.id === heldId);
    if (held) {
      const prior = [...session.events]
        .reverse()
        .find((event) => event.sequence < held.sequence);
      return prior?.sequence ?? null;
    }
  }
  return readDebateProceedingsCursor(session.id);
}

/**
 * Proceedings cursor when adopting a new session snapshot for presentation.
 * Never inherits a full baked Spectator tail during Resume/lifecycle adopts —
 * only a true one-step presentation prefix may advance the rail.
 */
export function debateAdoptProceedingsCursor(
  previous: Pick<DebateSessionV1, "id" | "events"> | null,
  next: Pick<
    DebateSessionV1,
    | "id"
    | "status"
    | "events"
    | "pausedPresentationEventId"
    | "playerRole"
    | "stepKey"
    | "completedAt"
  >,
): number | null {
  // Brand-new Spectator presentation runs (Start after progressive or full bake)
  // must open an empty Proceedings rail — never inherit a stenographer cursor
  // or only the post-hold delta from Resume.
  if (
    (!previous || previous.id !== next.id) &&
    next.playerRole === "spectator"
  ) {
    return null;
  }

  const safe = debateInitialProceedingsCursor(
    next,
    debateSpectatorAwaitingFirstWatch(next),
  );
  if (!previous || previous.id !== next.id) return safe;

  const heldId = next.pausedPresentationEventId;
  if (heldId) {
    const held = next.events.find((event) => event.id === heldId);
    if (
      held &&
      previous.events.some((event) => event.sequence > held.sequence)
    ) {
      return safe;
    }
  }

  // A full baked session still carries many unheard lines past the safe
  // stenographer cursor — clamping prevents Resume from dumping the gallery.
  if (safe !== null) {
    const pastSafe = previous.events.filter(
      (event) => event.sequence > safe,
    ).length;
    if (pastSafe > 1) return safe;
  }

  const previousIsPrefix =
    previous.events.length > 0 &&
    previous.events.length <= next.events.length &&
    previous.events.every(
      (event, index) => next.events[index]?.id === event.id,
    );
  if (!previousIsPrefix) return safe;
  return previous.events.at(-1)?.sequence ?? safe;
}

/** Canonical final-text duration used when no live voice clock is available. */
export function debateEventSpokenLineDurationMs(
  event: Pick<
    DebateEventV1,
    "content" | "kind" | "speakerKind" | "gavelReason"
  >,
): number | null {
  if (
    event.speakerKind === "system" ||
    event.kind === "silence" ||
    (event.kind === "judge_gavel" && event.gavelReason === "intervention")
  ) {
    return null;
  }
  const durationMs = debateRevealDurationMs(event.content);
  return durationMs > 0 ? durationMs : null;
}

export function formatDebateSpokenDuration(durationMs: number): string {
  const totalTenths = Math.max(0, Math.round(durationMs / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
}

type DebateElapsedSession = Pick<
  DebateSessionV1,
  | "completedAt"
  | "createdAt"
  | "events"
  | "pausedAt"
  | "pausedDurationMs"
  | "status"
  | "updatedAt"
>;

/**
 * Wall-clock Debate runtime with explicit recesses removed. Generation and
 * player-wait time remain part of the live proceeding's overall elapsed time.
 */
export function debateLiveElapsedDurationMs(
  session: DebateElapsedSession,
  nowMs: number,
): number {
  const eventTimes = [...session.events]
    .sort((left, right) => left.sequence - right.sequence)
    .map((event) => ({ event, timeMs: Date.parse(event.createdAt) }))
    .filter(({ timeMs }) => Number.isFinite(timeMs));
  const createdAtMs = Date.parse(session.createdAt);
  const startedAtMs = Number.isFinite(createdAtMs)
    ? createdAtMs
    : (eventTimes[0]?.timeMs ?? nowMs);
  const terminalAtMs = Date.parse(
    session.completedAt ?? session.updatedAt,
  );
  const endAtMs =
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
      ? Number.isFinite(terminalAtMs)
        ? terminalAtMs
        : nowMs
      : nowMs;

  const hasSilentLifecycleTiming =
    typeof session.pausedDurationMs === "number" ||
    typeof session.pausedAt === "string";
  let recessDurationMs = Math.max(0, session.pausedDurationMs ?? 0);
  if (hasSilentLifecycleTiming) {
    const pausedAtMs = Date.parse(session.pausedAt ?? "");
    if (Number.isFinite(pausedAtMs)) {
      recessDurationMs += Math.max(0, endAtMs - pausedAtMs);
    }
  } else {
    // Backward compatibility for archived sessions that stored lifecycle
    // events before pause and resume became silent session metadata.
    let recessStartedAtMs: number | null = null;
    for (const { event, timeMs } of eventTimes) {
      if (timeMs < startedAtMs || timeMs > endAtMs) continue;
      if (event.stepKey === "pause" && recessStartedAtMs === null) {
        recessStartedAtMs = timeMs;
      } else if (event.stepKey === "resume" && recessStartedAtMs !== null) {
        recessDurationMs += Math.max(0, timeMs - recessStartedAtMs);
        recessStartedAtMs = null;
      }
    }
    if (recessStartedAtMs !== null) {
      recessDurationMs += Math.max(0, endAtMs - recessStartedAtMs);
    }
  }
  return Math.max(0, endAtMs - startedAtMs - recessDurationMs);
}

export function formatDebateElapsedDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export interface DebateTurnClockState {
  elapsedMs: number;
  limitMs: number;
  progress: number;
  remainingMs: number;
  status: "running" | "overtime";
  timing: DebateTurnTimingV1;
}

export function debateTurnClockState(
  event: DebateEventV1 | null,
  speechTiming: { elapsedMs: number; durationMs: number } | null,
): DebateTurnClockState | null {
  if (!event?.timing) return null;
  // Advance from the presentation clock itself. Scaling the authored duration
  // estimate across a shorter clip made displayed seconds pass too quickly.
  const elapsedMs = speechTiming
    ? Math.max(
        0,
        Math.min(
          Math.max(0, speechTiming.durationMs),
          speechTiming.elapsedMs,
        ),
      )
    : 0;
  const remainingMs = event.timing.limitMs - elapsedMs;
  return {
    elapsedMs,
    limitMs: event.timing.limitMs,
    progress: Math.max(0, Math.min(1, elapsedMs / event.timing.limitMs)),
    remainingMs,
    status: remainingMs < 0 ? "overtime" : "running",
    timing: event.timing,
  };
}

/** Late-clock threshold: last ~20% of the turn budget or already overtime. */
export const DEBATE_UTTERANCE_PACE_LATE_PROGRESS = 0.8;
/** Temporary pace delta applied to advocate voice when short on time (−1…1). */
export const DEBATE_UTTERANCE_PACE_BOOST = 0.35;

/**
 * Returns a temporary voice-profile pace boost for Forum advocate turns when
 * the turn clock is already overtime or the expected fill of the limit is late.
 * Omit speechProgress to use estimatedDurationMs / limitMs at utterance start.
 */
export function debateUtterancePaceBoost(
  timing: DebateTurnTimingV1 | null | undefined,
  speechProgress?: number | null,
): number {
  if (!timing || !(timing.limitMs > 0)) return 0;
  const progress =
    speechProgress != null && Number.isFinite(speechProgress)
      ? Math.max(0, Math.min(1, speechProgress))
      : Math.max(0, timing.estimatedDurationMs / timing.limitMs);
  const late =
    timing.status === "overtime" ||
    timing.overtimeMs > 0 ||
    progress >= DEBATE_UTTERANCE_PACE_LATE_PROGRESS;
  return late ? DEBATE_UTTERANCE_PACE_BOOST : 0;
}

export function debateAudioEnabled(args: {
  voiceMode: string;
  voiceVolume: number;
}): boolean {
  return args.voiceMode !== "mute" && args.voiceVolume > 0;
}

/** Procedural gavel Foley remains audible when speech is explicitly muted. */
export function debateGavelAudioEnabled(voiceVolume: number): boolean {
  return Number.isFinite(voiceVolume) && voiceVolume > 0;
}

export function debateVisibleContentAtProgress(
  content: string,
  progress: number,
): string {
  if (!content) return "";
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0) return "";
  if (clamped >= 1) return content;

  const target = Math.max(1, Math.floor(content.length * clamped));
  let end = target;

  const markerStart = content.lastIndexOf("[[", target);
  if (markerStart >= 0) {
    const markerEnd = content.indexOf("]]", markerStart);
    const marker = content.slice(markerStart, markerEnd + 2);
    if (
      markerEnd >= target &&
      /^\[\[(?:source|exhibit):[^\]]+\]\]$/iu.test(marker)
    ) {
      end = markerStart;
    }
  }

  const candidate = content.slice(0, end);
  const safeBoundary = Math.max(
    candidate.lastIndexOf(" "),
    candidate.lastIndexOf("\n"),
    candidate.lastIndexOf("."),
    candidate.lastIndexOf(","),
    candidate.lastIndexOf(";"),
    candidate.lastIndexOf(":"),
    candidate.lastIndexOf("!"),
    candidate.lastIndexOf("?"),
  );
  if (safeBoundary >= Math.max(0, end - 22)) {
    end = safeBoundary + 1;
  }

  return content.slice(0, Math.max(0, end));
}

function debateAlignedSpokenProgress(args: {
  spokenText: string;
  elapsedMs: number;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
}): number {
  const durationMs = Math.max(1, args.durationMs);
  const elapsedMs = Math.max(0, Math.min(durationMs, args.elapsedMs));

  const spokenCharacters = Array.from(args.spokenText);
  const alignment = args.alignment;
  const alignedCount = alignment?.characters.length ?? 0;
  if (
    !alignment ||
    alignedCount === 0 ||
    alignedCount !== alignment.characterStartTimesSeconds.length ||
    alignedCount !== alignment.characterEndTimesSeconds.length
  ) {
    return elapsedMs / durationMs;
  }

  const elapsedSeconds = elapsedMs / 1_000;
  let completedAlignedCharacters = 0;
  let previousStart = 0;
  let previousEnd = 0;
  for (let index = 0; index < alignedCount; index += 1) {
    const start = alignment.characterStartTimesSeconds[index];
    const end = alignment.characterEndTimesSeconds[index];
    if (
      typeof start !== "number" ||
      typeof end !== "number" ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      start < 0 ||
      end < start ||
      start < previousStart ||
      end < previousEnd
    ) {
      return elapsedMs / durationMs;
    }
    previousStart = start;
    previousEnd = end;
    if (end <= elapsedSeconds) completedAlignedCharacters = index + 1;
  }

  const alignedText = alignment.characters.join("");
  const exactAlignment = alignedText === args.spokenText;
  const compactSpokenText = args.spokenText.replace(/\s+/gu, " ").trim();
  const compactAlignedText = alignedText.replace(/\s+/gu, " ").trim();
  // A provider can return a valid audio file whose timing covers only a strict
  // prefix of the requested line. At natural audio end that prefix is all the
  // room heard; never scale it up to the complete canonical statement.
  const strictAlignedPrefix =
    compactAlignedText.length < compactSpokenText.length &&
    compactSpokenText.startsWith(compactAlignedText) &&
    /[\p{L}\p{N}]/u.test(
      compactSpokenText.slice(compactAlignedText.length),
    );
  const completedSpokenCharacters = exactAlignment
    ? completedAlignedCharacters
    : strictAlignedPrefix
      ? Math.min(spokenCharacters.length, completedAlignedCharacters)
      : Math.round(
          (completedAlignedCharacters / alignedCount) *
            spokenCharacters.length,
        );
  return Math.max(
    0,
    Math.min(
      1,
      completedSpokenCharacters / Math.max(1, spokenCharacters.length),
    ),
  );
}

/** Public transcript prefix synchronized to the real voice playback clock. */
export function debateVisibleContentAtSpeechTime(args: {
  content: string;
  spokenText: string;
  elapsedMs: number;
  durationMs: number;
  alignment?: SpeechCharacterAlignment | null;
}): string {
  return debateVisibleContentAtProgress(
    args.content,
    debateAlignedSpokenProgress(args),
  );
}

export function debateTranscriptIsAtLive(
  metrics: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  thresholdPx = 2,
): boolean {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <=
    thresholdPx
  );
}

export function debateTurnOwnerBotId(args: {
  thinkingBotId: string | null;
  presenting: boolean;
  presentationSpeakerBotId: string | null;
}): string | null {
  return (
    args.thinkingBotId ??
    (args.presenting ? args.presentationSpeakerBotId : null)
  );
}

export function debateMarkdownSource(
  content: string,
  evidence: DebateEvidencePacketV1,
): string {
  return content.replace(
    EVIDENCE_MARKER,
    (_marker, _kind: string, rawId: string, offset: number, full: string) => {
      const item = debateEvidenceItemById(evidence, rawId);
      if (!item) return "";
      // Titles can include punctuation; strip brackets so Markdown links stay intact.
      const rawLabel =
        item.value.title.replace(/[[\]]/gu, "").trim() || item.value.id;
      const label = debateEvidenceTitleCasedForProse(
        rawLabel,
        full.slice(0, offset),
      );
      return `[${label}](${DEBATE_EVIDENCE_LINK_PREFIX}${item.value.id})`;
    },
  );
}

export function debateEvidenceFromMarkdownHref(
  href: string | undefined,
  evidence: DebateEvidencePacketV1,
): DebateEvidenceItemV1 | null {
  if (!href) return null;
  const prefix = href.startsWith(DEBATE_EVIDENCE_LINK_PREFIX)
    ? DEBATE_EVIDENCE_LINK_PREFIX
    : href.startsWith(DEBATE_SOURCE_LINK_PREFIX)
      ? DEBATE_SOURCE_LINK_PREFIX
      : null;
  if (!prefix) return null;
  const id = href.slice(prefix.length).toLowerCase();
  const source = evidence.sources.find((candidate) => candidate.id === id);
  if (source) return { kind: "source", value: source };
  const exhibit = (evidence.exhibits ?? []).find(
    (candidate) => candidate.id === id,
  );
  return exhibit ? { kind: "exhibit", value: exhibit } : null;
}

export function debateSourceFromMarkdownHref(
  href: string | undefined,
  evidence: DebateEvidencePacketV1,
): DebateEvidenceSourceV1 | null {
  const item = debateEvidenceFromMarkdownHref(href, evidence);
  return item?.kind === "source" ? item.value : null;
}

export type DebateGalleryReaction =
  "attentive" | "divided" | "evidence" | "question" | "concession";

export function debateGalleryReaction(content: string): DebateGalleryReaction {
  const normalized = content.toLowerCase();
  if (/\[\[(?:source|exhibit):[^\]]+\]\]/u.test(normalized)) {
    return "evidence";
  }
  if (
    /\b(?:i concede|we concede|fair point|grant that|acknowledge)\b/u.test(
      normalized,
    )
  ) {
    return "concession";
  }
  if (content.includes("?")) return "question";
  if (/\b(?:but|however|instead|yet|cannot|wrong|reject)\b/u.test(normalized)) {
    return "divided";
  }
  return "attentive";
}

export function debateGalleryReactingIndices(
  content: string,
  sequence: number,
  seatCount = 7,
): number[] {
  if (!content.trim() || seatCount <= 0) return [];
  const clauseCount = Math.max(
    1,
    content.split(/[.!?;:](?:\s|$)/u).filter((part) => part.trim()).length,
  );
  const first =
    Math.abs(sequence * 5 + clauseCount * 3 + content.length) % seatCount;
  const second =
    (first + 2 + (content.length % Math.max(2, seatCount - 1))) % seatCount;
  return first === second ? [first] : [first, second];
}

/**
 * True while a Spectator bake is held or playing but not yet sealed. The
 * session floor is already complete on the server, so chrome must follow
 * presentation progress instead of the baked end-state.
 */
export function debateSpectatorBakeUnsealed(
  session: Pick<
    DebateSessionV1,
    "playerRole" | "stepKey" | "completedAt" | "status"
  >,
): boolean {
  return (
    session.playerRole === "spectator" &&
    session.stepKey === "completed" &&
    session.completedAt === null &&
    (session.status === "live" || session.status === "paused")
  );
}

/** Canonical phase label from session state (live Judge/Participant flows). */
export function debateSessionPhaseLabel(
  session: Pick<DebateSessionV1, "phase" | "formatState">,
): string {
  if (session.formatState.format === "turnabout") {
    const phase = session.formatState.phase;
    return `${phase.charAt(0).toUpperCase()}${phase.slice(1)}`;
  }
  if (session.phase === "rebuttal" && session.formatState.format === "forum") {
    return `Rebuttal ${session.formatState.rebuttalRound} of ${session.formatState.rebuttalRoundTarget}`;
  }
  return `${session.phase.charAt(0).toUpperCase()}${session.phase.slice(1)}`;
}

/** Map a floor/step key to the phase chip without reading baked end-state. */
export function debatePhaseLabelFromStepKey(
  session: Pick<DebateSessionV1, "format">,
  stepKey: string,
): string {
  if (session.format === "turnabout") {
    if (
      stepKey.startsWith("jury") ||
      stepKey.includes("verdict") ||
      stepKey.includes("ballot") ||
      stepKey === "moderator_to_jury" ||
      stepKey.includes("resolution")
    ) {
      return "Resolution";
    }
    if (stepKey.includes("reversal")) return "Reversal";
    if (
      stepKey.includes("examination") ||
      stepKey.includes("press") ||
      stepKey.includes("object") ||
      stepKey.includes("ruling")
    ) {
      return "Examination";
    }
    return "Testimony";
  }
  if (stepKey === "intro" || stepKey.startsWith("opening")) return "Opening";
  if (stepKey.startsWith("challenge")) return "Challenge";
  if (stepKey.startsWith("rebuttal") || stepKey === "moderator_to_rebuttal") {
    return "Rebuttal";
  }
  if (stepKey.startsWith("closing") || stepKey === "moderator_to_closing") {
    return "Closing";
  }
  if (
    stepKey.startsWith("jury") ||
    stepKey.includes("verdict") ||
    stepKey.includes("ballot") ||
    stepKey === "moderator_to_jury" ||
    stepKey === "closing_moderator" ||
    stepKey === "judge_closing_moderator"
  ) {
    return "Verdict";
  }
  return "Opening";
}

/**
 * Phase chip for the live header. Baked Spectator sessions stay on Opening /
 * Testimony until Start, then follow the heard/presenting event — never the
 * baked Verdict/Resolution end-state.
 */
export function debateLivePhaseLabel(
  session: DebateSessionV1,
  args: {
    awaitingFirstWatch: boolean;
    activeEvent: DebateEventV1 | null;
    heardThroughSequence: number | null;
  },
): string {
  if (!debateSpectatorBakeUnsealed(session)) {
    return debateSessionPhaseLabel(session);
  }
  if (args.awaitingFirstWatch || args.heardThroughSequence === null) {
    return session.format === "turnabout" ? "Testimony" : "Opening";
  }
  const anchor =
    args.activeEvent ??
    [...session.events]
      .reverse()
      .find((event) => event.sequence <= args.heardThroughSequence!);
  if (!anchor) {
    return session.format === "turnabout" ? "Testimony" : "Opening";
  }
  return debatePhaseLabelFromStepKey(session, anchor.stepKey);
}

/** Whether the Jury split may appear in Spectator chrome. */
export function debateJuryOutcomeRevealed(
  session: Pick<
    DebateSessionV1,
    "status" | "playerRole" | "stepKey" | "completedAt" | "events" | "jury"
  >,
  heardThroughSequence: number | null,
): boolean {
  if (!session.jury.enabled || session.jury.phase !== "complete") {
    return false;
  }
  if (!debateSpectatorBakeUnsealed(session)) {
    return true;
  }
  if (heardThroughSequence === null) return false;
  return session.events.some(
    (event) =>
      event.sequence <= heardThroughSequence && event.kind === "jury_verdict",
  );
}

/** Whether Jury deliberation chrome may open during a Spectator bake watch. */
export function debateJuryChamberOpenedInPresentation(
  session: Pick<DebateSessionV1, "events" | "jury">,
  heardThroughSequence: number | null,
): boolean {
  if (!session.jury.enabled || heardThroughSequence === null) return false;
  return session.events.some(
    (event) =>
      event.sequence <= heardThroughSequence &&
      (event.kind === "jury_deliberation" ||
        event.kind === "jury_verdict" ||
        event.stepKey === "moderator_to_jury" ||
        (event.kind === "ballot" && event.speakerKind === "juror")),
  );
}

export function debateJuryRosterStatusLabel(args: {
  participantView: boolean;
  juryOutcomeRevealed: boolean;
  juryChamberOpened: boolean;
}): string {
  if (args.participantView) return "Identity sealed";
  if (args.juryOutcomeRevealed) return "Returned";
  if (args.juryChamberOpened) return "In session";
  return "Frozen at Start";
}

export function debateJuryRosterFooterCopy(args: {
  participantView: boolean;
  jury: Pick<DebateSessionV1["jury"], "phase" | "forVotes" | "againstVotes">;
  juryOutcomeRevealed: boolean;
  juryChamberOpened: boolean;
}): string {
  if (args.participantView) {
    return "Five anonymous seats follow the public floor. Their chamber remains sealed until the aggregate verdict.";
  }
  if (args.juryOutcomeRevealed && args.jury.phase === "complete") {
    return `The Jury has returned ${args.jury.forVotes}–${args.jury.againstVotes}.`;
  }
  if (args.juryChamberOpened) {
    return "The Jury chamber is now in session.";
  }
  return "The frozen roster follows the public floor; hover an ellipsis to read a thought. PRISM enters the chamber automatically when deliberation begins.";
}
