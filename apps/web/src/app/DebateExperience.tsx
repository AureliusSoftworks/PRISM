"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DEBATE_FORMAT_CATALOG,
  DEBATE_SCHEMA_VERSION,
  debateSpokenText,
  type DebateAdvocacyConsent,
  type DebateCaseCardV1,
  type DebateEventV1,
  type DebateEvidencePacketV1,
  type DebateEvidenceSourceV1,
  type DebateFormatId,
  type DebateMotionSlateV1,
  type DebateBotSnapshotV1,
  type DebatePlayerRole,
  type DebateSessionListItemV1,
  type DebateSessionV1,
  type DebateSideId,
  type DebateTurnaboutFormatStateV1,
  type DebateTurnaboutStatementV1,
  type GraphicsQuality,
  type ResponseMode,
} from "@localai/shared";
import {
  PrismRefractTarget,
  type PrismRefractMagicTarget,
} from "./prismRefract";
import styles from "./DebateExperience.module.css";
import type { DebateForumRole } from "./DebateForumScene";
import {
  copyDebateMotionSlate,
  debateAlignmentPreviewCast,
  debatePrefilledCast,
} from "./debateExperienceState";
import { randomDebateEvidenceQuery } from "./debateEvidenceRandomizer";
import {
  debateMarkdownSource,
  debateGalleryReactingIndices,
  debateGalleryReaction,
  debateRevealDurationMs,
  debateSourceFromMarkdownHref,
  debateTranscriptIsAtLive,
  debateTurnOwnerBotId,
  debateVisibleContentAtProgress,
} from "./debatePresentation";
import {
  DEBATE_STAGE_ALIGNMENT_MAX,
  DEBATE_STAGE_ALIGNMENT_MIN,
  DEBATE_STAGE_ALIGNMENT_ITEMS,
  DEBATE_STAGE_ALIGNMENT_ROLES,
  DEBATE_STAGE_ALIGNMENT_STEP,
  DEBATE_STAGE_LIGHT_BLEND_MODES,
  DEFAULT_DEBATE_STAGE_ALIGNMENT,
  copyDebateStageAlignment,
  debateStageAlignmentOffset,
  debateStageAlignmentStyle,
  debateStageAlignmentTarget,
  formatDebateStageAlignmentClipboard,
  normalizeDebateStageAlignment,
  readDebateStageAlignment,
  updateDebateStageAlignmentOffset,
  updateDebateStageLightBlendMode,
  writeDebateStageAlignment,
  type DebateStageAlignmentItem,
  type DebateStageAlignmentRole,
  type DebateStageAlignmentTarget,
  type DebateStageAlignmentV3,
  type DebateStageOffsetV1,
} from "./debateStageAlignment";
import {
  BotPickerGrid,
  BotPickerTile,
  BotPickerToolbar,
  filterBotPickerItems,
  type BotPickerGroup,
  type BotPickerGlyphRenderer,
} from "./BotPicker";
import { useAmbientBotVocalization } from "./ambient-bot-vocalization";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import {
  type SessionAmbientBotVocalizationCue,
  type SessionAtmosphereMix,
} from "./session-atmosphere-audio";
import { debateVocalFoleyTargetId } from "./debateFoley";
import {
  DEBATE_FORUM_FOLEY_ROOM_SEND,
  DEBATE_TURNABOUT_FOLEY_ROOM_SEND,
} from "./roomAcoustics";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";
import type { ZenLiveBotMouthShape } from "./zenLiveMouth";

export interface DebateBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  avatarDetails?: DebateBotSnapshotV1["avatarDetails"];
  hardMuted: boolean;
}

export interface DebateUtterance {
  event: DebateEventV1;
  format: DebateFormatId;
  sessionId: string;
  speaker: DebateBotSummary | null;
  player: boolean;
  spokenText: string;
  voiceSourceBotId: string | null;
  lifecycle?: {
    onStart?: (
      durationMs: number | null,
      alignment?: VoicePlaybackCharacterAlignment | null,
    ) => void;
    onProgress?: (elapsedMs: number, durationMs: number) => void;
    onEnd?: () => void;
    onCancel?: () => void;
  };
}

export interface DebateSpeechTiming {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment | null;
}

export interface DebateBotAvatarState {
  role: DebateForumRole;
  lookAtRole: DebateForumRole | null;
  compact: boolean;
  talking: boolean;
  thinking: boolean;
  colorCycle: boolean;
  speechTiming: DebateSpeechTiming | null;
  foleyMouthShape: ZenLiveBotMouthShape | null;
  listenerReaction:
    "attentive" | "divided" | "evidence" | "question" | "concession" | null;
}

export interface DebateExperienceProps {
  bots: DebateBotSummary[];
  botGroups?: readonly BotPickerGroup[];
  initialBotIds?: string[];
  storageScopeId: string;
  preferredProvider: "local" | "openai" | "anthropic";
  responseMode: ResponseMode;
  modelOverride?: {
    provider: "local" | "openai" | "anthropic";
    model: string;
  } | null;
  graphicsQuality: GraphicsQuality;
  theme: "light" | "dark";
  audioEnabled: boolean;
  audioVolume: number;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: BotPickerGlyphRenderer;
  renderBotAvatar?: (
    bot: DebateBotSnapshotV1,
    state: DebateBotAvatarState,
  ) => ReactNode;
  onExit: () => void;
  onResetTutorial?: () => void;
  onUtterance?: (utterance: DebateUtterance) => Promise<boolean>;
  onStopUtterance?: () => void;
  onLiveSessionActiveChange?: (active: boolean) => void;
}

type DebateView = "dashboard" | "live";
type DebateStudioPanel = "motion" | "cast" | "evidence" | "archive";
type DebateCastSlot = "moderator" | "forAdvocate" | "againstAdvocate";
type DebateCameraView = "wide" | "left" | "moderator" | "right";
type DebateCameraMode = "auto" | DebateCameraView;
type DebateClipboardState = "idle" | "copying" | "copied" | "failed";
type DebateLiveReveal = {
  eventId: string;
  visibleContent: string;
  speechTiming?: DebateSpeechTiming | null;
};
type DebateDeleteUndo = {
  runId: string;
  sessionId: string;
  motion: string;
};
type DebateStageAlignmentDrag = {
  pointerId: number;
  role: DebateStageAlignmentRole;
  item: DebateStageAlignmentItem;
  target: DebateStageAlignmentTarget;
  startClientX: number;
  startClientY: number;
  stageWidth: number;
  stageHeight: number;
  startAlignment: DebateStageAlignmentV3;
};

const DEBATE_GALLERY_COLORS = [
  "#ff5f8f",
  "#ff9f5f",
  "#f1d65b",
  "#76df89",
  "#42d9ff",
  "#7e8cff",
  "#c277ff",
] as const;
const DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS = 50;
const DEBATE_FOLEY_MIX = {
  background: 0,
  grain: 0,
  foley: 0.34,
} as const satisfies SessionAtmosphereMix;
const DEBATE_VOCAL_FOLEY_PROFILE = {
  minDelayMs: 28_000,
  maxDelayMs: 58_000,
  trim: 0.48,
} as const;

const DEBATE_CAMERA_VIEWS: ReadonlyArray<{
  id: DebateCameraMode;
  label: string;
}> = [
  { id: "auto", label: "Auto" },
  { id: "left", label: "Left" },
  { id: "moderator", label: "Moderator" },
  { id: "right", label: "Right" },
  { id: "wide", label: "Wide" },
];

function debateAutoCameraView(
  activeRole: DebateForumRole | null,
): DebateCameraView {
  if (activeRole === "for") return "left";
  if (activeRole === "moderator") return "moderator";
  if (activeRole === "against") return "right";
  return "wide";
}

const DEBATE_STAGE_ALIGNMENT_LABELS: Record<DebateStageAlignmentRole, string> =
  {
    for: "For advocate",
    moderator: "Moderator",
    against: "Against advocate",
  };
const DEBATE_STAGE_ALIGNMENT_ITEM_LABELS: Record<
  DebateStageAlignmentItem,
  string
> = {
  bot: "Bot",
  nameplate: "Nameplate",
  glyph: "Glyph plate",
};

function DebateForumLightMasks(): React.JSX.Element {
  return (
    <>
      <div
        className={styles.lightMaskFor}
        data-light-depth="backdrop"
        aria-hidden="true"
      />
      <div
        className={styles.lightMaskAgainst}
        data-light-depth="backdrop"
        aria-hidden="true"
      />
      <div
        className={styles.lightMaskModerator}
        data-light-depth="backdrop"
        aria-hidden="true"
      />
      <div
        className={`${styles.lightMaskFor} ${styles.lightMaskForeground}`}
        data-light-depth="foreground"
        aria-hidden="true"
      />
      <div
        className={`${styles.lightMaskAgainst} ${styles.lightMaskForeground}`}
        data-light-depth="foreground"
        aria-hidden="true"
      />
      <div
        className={`${styles.lightMaskModerator} ${styles.lightMaskForeground}`}
        data-light-depth="foreground"
        aria-hidden="true"
      />
    </>
  );
}

function debateAlignmentPreviewSnapshot(
  bot: DebateBotSummary,
  role: DebateBotSnapshotV1["role"],
  sideId: DebateSideId | null,
): DebateBotSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: bot.id,
    name: bot.name,
    systemPrompt: "",
    role,
    sideId,
    color: bot.color,
    glyph: bot.glyph,
    avatarDetails: bot.avatarDetails ?? null,
    voiceProfile: null,
    powers: [],
    provider: "local",
    model: "alignment-preview",
    revision: `alignment-preview:${bot.id}`,
  };
}

const DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS = new Set([
  "intro",
  "phase",
  "speech",
  "silence",
  "testimony",
  "press",
  "objection",
  "evidence",
  "revelation",
  "player_turn",
  "reaction",
  "interjection",
  "moderator_ruling",
  "error",
]);

function debateCaseBoardAtSequence(
  session: DebateSessionV1,
  visibleThroughSequence: number | null,
): DebateCaseCardV1[] {
  if (visibleThroughSequence === null) return session.caseBoard;
  const latestBoardEvent = [...session.events]
    .reverse()
    .find(
      (event) =>
        event.kind === "case_board" && event.sequence <= visibleThroughSequence,
    );
  if (!latestBoardEvent) return [];
  try {
    const board = JSON.parse(latestBoardEvent.content) as unknown;
    return Array.isArray(board)
      ? board.filter(
          (card): card is DebateCaseCardV1 =>
            typeof card === "object" &&
            card !== null &&
            typeof (card as DebateCaseCardV1).id === "string" &&
            ((card as DebateCaseCardV1).sideId === "for" ||
              (card as DebateCaseCardV1).sideId === "against"),
        )
      : [];
  } catch {
    return [];
  }
}

function debateExpectedBotId(session: DebateSessionV1): string | null {
  const step = session.stepKey;
  if (
    step === "intro" ||
    step === "turnabout_intro" ||
    step === "turnabout_spectator_press" ||
    step === "turnabout_ballot_moderator" ||
    step === "moderator_to_rebuttal" ||
    step === "moderator_to_closing" ||
    step.endsWith("_prompt") ||
    step === "ballot_moderator"
  ) {
    return session.moderator.id;
  }
  if (
    step === "challenge_participant_partner" ||
    step === "rebuttal_against_partner" ||
    step === "rebuttal_for_partner"
  ) {
    return session.playerSideId === "against"
      ? session.againstAdvocate.id
      : session.forAdvocate.id;
  }
  if (step === "challenge_opponent_answer") {
    return session.playerSideId === "against"
      ? session.forAdvocate.id
      : session.againstAdvocate.id;
  }
  if (step.includes("against") || step === "ballot_against") {
    return session.againstAdvocate.id;
  }
  if (step.includes("for") || step === "ballot_for") {
    return session.forAdvocate.id;
  }
  return null;
}

function debatePresentationEvents(
  previous: DebateSessionV1 | null,
  next: DebateSessionV1,
): DebateEventV1[] {
  const previousSequence = previous?.events.at(-1)?.sequence ?? 0;
  return next.events.filter(
    (event) =>
      event.sequence > previousSequence &&
      (event.kind === "speech" ||
        event.kind === "phase" ||
        event.kind === "silence" ||
        event.kind === "testimony" ||
        event.kind === "press" ||
        event.kind === "objection" ||
        event.kind === "evidence" ||
        event.kind === "revelation" ||
        event.kind === "player_turn" ||
        event.kind === "reaction" ||
        event.kind === "interjection" ||
        event.kind === "moderator_ruling" ||
        event.kind === "ballot" ||
        (event.kind === "verdict" && event.speakerKind === "player")),
  );
}

const EMPTY_SLATE: DebateMotionSlateV1 = {
  version: DEBATE_SCHEMA_VERSION,
  id: "custom-motion",
  motion: "",
  forSide: { label: "For", brief: "" },
  againstSide: { label: "Against", brief: "" },
};

const EMPTY_EVIDENCE: DebateEvidencePacketV1 = {
  version: DEBATE_SCHEMA_VERSION,
  notes: "",
  sources: [],
  frozenAt: null,
};

function requestBody(value: unknown): RequestInit {
  return { method: "POST", body: JSON.stringify(value) };
}

function mutationKey(label: string, counter: number): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `debate:${label}:${counter}:${random}`;
}

function sessionStatusLabel(session: DebateSessionListItemV1): string {
  if (session.status === "completed") {
    return session.winnerSideId
      ? `${session.winnerSideId === "for" ? "For" : "Against"} prevailed`
      : "Completed";
  }
  if (session.status === "waiting_for_player") return "Your turn";
  if (session.status === "paused") return "Paused";
  if (session.status === "failed") return "Needs attention";
  return `${session.phase.charAt(0).toUpperCase()}${session.phase.slice(1)}`;
}

function phaseLabel(session: DebateSessionV1): string {
  if (session.formatState.format === "turnabout") {
    const phase = session.formatState.phase;
    return `${phase.charAt(0).toUpperCase()}${phase.slice(1)}`;
  }
  return `${session.phase.charAt(0).toUpperCase()}${session.phase.slice(1)}`;
}

function roleDescription(
  role: DebatePlayerRole,
  format: DebateFormatId,
): string {
  if (format === "turnabout") {
    if (role === "judge") {
      return "Press or test any statement against frozen evidence, then issue the final record ruling.";
    }
    if (role === "participant") {
      return "Examine the opposing testimony while your advocate keeps your side’s formal identity.";
    }
    return "Watch the moderator press every statement before the three-bot public-record resolution.";
  }
  if (role === "judge") {
    return "Ask one challenge and make the final ruling. Bot ballots become an agreement and dissent epilogue.";
  }
  if (role === "participant") {
    return "Take the Challenge and Rebuttal slots for one side. Your bot partner opens and closes.";
  }
  return "Watch the moderator challenge both advocates. The three-bot majority decides the verdict.";
}

function roleSummary(
  role: DebatePlayerRole,
  format: DebateFormatId = "forum",
): string {
  if (format === "turnabout") {
    if (role === "judge") return "Examine the record, then issue the ruling.";
    if (role === "participant") {
      return "Examine the opposing testimony for your side.";
    }
    return "Observe a neutral examination of every statement.";
  }
  if (role === "judge") return "Challenge once, then issue the final ruling.";
  if (role === "participant") {
    return "Share the floor with your advocate partner.";
  }
  return "Observe the Duel without taking the floor.";
}

function verdictLabel(session: DebateSessionV1): string {
  if (session.winnerSideId === "for") return session.motion.forSide.label;
  if (session.winnerSideId === "against") {
    return session.motion.againstSide.label;
  }
  return "No prevailing side";
}

function visibleEventName(
  session: DebateSessionV1,
  event: DebateEventV1,
): string {
  if (event.speakerKind === "player") return "You";
  if (event.speakerBotId === session.moderator.id)
    return session.moderator.name;
  if (event.speakerBotId === session.forAdvocate.id) {
    return session.forAdvocate.name;
  }
  if (event.speakerBotId === session.againstAdvocate.id) {
    return session.againstAdvocate.name;
  }
  return session.format === "turnabout" ? "Public record" : "Forum";
}

function debateSideLabel(
  session: DebateSessionV1,
  sideId: DebateSideId | null,
): string {
  if (sideId === "for") return session.motion.forSide.label;
  if (sideId === "against") return session.motion.againstSide.label;
  return "Neutral";
}

export function formatDebateVerboseTranscript(
  session: DebateSessionV1,
): string {
  const cast = [
    ["Moderator", session.moderator],
    [`For — ${session.motion.forSide.label}`, session.forAdvocate],
    [`Against — ${session.motion.againstSide.label}`, session.againstAdvocate],
  ] as const;
  const lines = [
    "# PRISM Debate Review — Verbose Transcript",
    "",
    `- Session: ${session.id}`,
    `- Status: ${session.status}`,
    `- Revision: ${session.revision}`,
    `- Format: ${session.format} v${session.formatVersion}`,
    `- Player role: ${session.playerRole}${session.playerSideId ? ` — ${debateSideLabel(session, session.playerSideId)}` : ""}`,
    `- Created: ${session.createdAt}`,
    `- Updated: ${session.updatedAt}`,
    `- Ended early: ${session.endedEarlyAt ?? "No"}`,
    `- Completed: ${session.completedAt ?? "No"}`,
    "",
    "## Motion",
    "",
    session.motion.motion,
    "",
    `- For (${session.motion.forSide.label}): ${session.motion.forSide.brief}`,
    `- Against (${session.motion.againstSide.label}): ${session.motion.againstSide.brief}`,
    "",
    "## Cast and frozen runtime",
    "",
    `- Response mode: ${session.responseMode.toUpperCase()}`,
    `- Frozen generation chain: ${session.generationChain.map((entry) => `${entry.provider}/${entry.model}`).join(" → ")}`,
    ...cast.map(
      ([role, bot]) =>
        `- ${role}: ${bot.name} (${bot.provider}/${bot.model}; bot ${bot.id}; revision ${bot.revision})`,
    ),
    "",
    "## Advocacy consent",
    "",
    ...session.advocacyConsent.map(
      (check) =>
        `- ${visibleEventName(session, {
          speakerKind: "advocate",
          speakerBotId: check.botId,
        } as DebateEventV1)} — ${debateSideLabel(session, check.sideId)}: ${check.status}${check.reason ? ` — ${check.reason}` : ""} (motion ${check.motionHash}; bot revision ${check.botRevision}${check.provider && check.model ? `; ${check.provider}/${check.model}` : ""}${check.autoRecovery ? `; recovered after ${check.autoRecovery.attempts.length} attempts` : ""})`,
    ),
    "",
    "## Frozen evidence",
    "",
    session.evidence.notes
      ? `Player notes:\n\n${session.evidence.notes}`
      : "Player notes: None",
    "",
    ...(session.evidence.sources.length > 0
      ? session.evidence.sources.flatMap((source) => [
          `- [${source.id}] ${source.title}`,
          `  - URL: ${source.url}`,
          `  - Published: ${source.publishedAt ?? "Unknown"}`,
          `  - Snippet: ${source.snippet}`,
        ])
      : ["No frozen sources."]),
    "",
    "## Resolved Powers",
    "",
    ...cast.map(([role, bot]) => {
      const plan = session.powerPlan.bots[bot.id];
      const effects =
        plan?.effects.map(
          ({ powerName, policy }) => `${powerName} (${policy})`,
        ) ?? [];
      return `- ${role}: ${effects.length > 0 ? effects.join(", ") : "None"}${plan?.hardMuted ? "; hard muted" : ""}`;
    }),
    "",
    "## Event stream",
    "",
    ...session.events.flatMap((event) => [
      `### ${String(event.sequence).padStart(3, "0")} · ${event.phase} · ${event.kind}`,
      "",
      `- Speaker: ${visibleEventName(session, event)} (${event.speakerKind})`,
      `- Side: ${debateSideLabel(session, event.sideId)}`,
      `- Step: ${event.stepKey}`,
      `- Statement: ${event.statementId ?? "None"}`,
      `- Evidence item: ${event.evidenceSourceId ?? "None"}`,
      `- Ruling: ${event.ruling ?? "None"}`,
      `- At: ${event.createdAt}`,
      `- Sources: ${event.sourceIds.length > 0 ? event.sourceIds.join(", ") : "None"}`,
      `- Generation: ${event.provider && event.model ? `${event.provider}/${event.model}${event.autoRecovery ? ` after ${event.autoRecovery.attempts.length} attempts` : ""}` : "Not model-generated"}`,
      `- Delivery: ${
        event.interrupted
          ? `Interrupted by ${event.interruptedBy ?? "unknown"}`
          : "Complete"
      }`,
      "",
      event.content,
      "",
    ]),
    ...(session.formatState.format === "turnabout"
      ? [
          "## Turnabout public record",
          "",
          `- Format phase: ${session.formatState.phase}`,
          `- Reversal count: ${Math.max(0, session.formatState.round - 1)}`,
          ...session.formatState.statements.map(
            (statement, index) =>
              `- Statement ${index + 1} · ${debateSideLabel(session, statement.sideId)} · ${statement.status} · bot ${statement.speakerBotId}: ${debateSpokenText(statement.content)}`,
          ),
          ...session.formatState.contradictions.map(
            (contradiction) =>
              `- ${contradiction.ruling} · statement ${contradiction.statementId} · evidence ${contradiction.evidenceSourceId} · grounded ${contradiction.grounded ? "yes" : "no"}`,
          ),
          "",
        ]
      : []),
    "## Final case board",
    "",
    ...(session.caseBoard.length > 0
      ? session.caseBoard.map(
          (card) =>
            `- ${debateSideLabel(session, card.sideId)} · ${card.status}: ${card.summary}${card.sourceIds.length > 0 ? ` [${card.sourceIds.join(", ")}]` : ""}`,
        )
      : ["No public case-board cards."]),
    "",
    "## Ballots and verdict",
    "",
    ...session.ballots.map((ballot) => {
      const voter =
        ballot.voterBotId === session.moderator.id
          ? session.moderator
          : ballot.voterBotId === session.forAdvocate.id
            ? session.forAdvocate
            : session.againstAdvocate;
      return `- ${voter.name}: ${debateSideLabel(session, ballot.sideId)} — ${ballot.reason ?? "Private ballot; no public reason."}${ballot.provider && ballot.model ? ` (${ballot.provider}/${ballot.model}${ballot.autoRecovery ? ` after ${ballot.autoRecovery.attempts.length} attempts` : ""})` : ""}`;
    }),
    `- Player verdict: ${session.playerVerdict ? debateSideLabel(session, session.playerVerdict) : "None"}`,
    `- Winner: ${session.winnerSideId ? debateSideLabel(session, session.winnerSideId) : "Not decided"}`,
  ];
  return lines
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

async function writeDebateClipboardText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Plain-HTTP LAN development may still permit the explicit copy path.
    }
  }

  const previouslyFocused =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy command failed.");
    }
  } finally {
    textarea.remove();
    previouslyFocused?.focus();
  }
}

function DebateMarkdownBody({
  content,
  evidence,
  onSource,
}: {
  content: string;
  evidence: DebateEvidencePacketV1;
  onSource: (id: string) => void;
}): React.JSX.Element {
  return (
    <div className={styles.transcriptMarkdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) => {
            const source = debateSourceFromMarkdownHref(href, evidence);
            if (source) {
              return (
                <button
                  type="button"
                  className={styles.sourceChip}
                  onClick={() => onSource(source.id)}
                  aria-label={`Open source ${source.title}`}
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
          img: () => null,
        }}
      >
        {debateMarkdownSource(content, evidence)}
      </ReactMarkdown>
    </div>
  );
}

const DEBATE_FALSE_NAMES = [
  "Arden",
  "Clio",
  "Dorian",
  "Ione",
  "Mara",
  "Noor",
  "Orion",
  "Selene",
] as const;

function stableIndex(seed: string, length: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return length > 0 ? hash % length : 0;
}

function debateBotSnapshot(
  session: DebateSessionV1,
  botId: string | null | undefined,
): DebateBotSnapshotV1 | null {
  if (botId === session.moderator.id) return session.moderator;
  if (botId === session.forAdvocate.id) return session.forAdvocate;
  if (botId === session.againstAdvocate.id) return session.againstAdvocate;
  return null;
}

function debateBotPresentation(
  session: DebateSessionV1,
  bot: DebateBotSnapshotV1,
  beforeSequence = Number.POSITIVE_INFINITY,
): {
  displayName: string;
  identityLabel: string | null;
  glyph: string | null;
  voiceSourceBotId: string;
  visibility: "visible" | "hidden" | "translucent" | "speaking_only";
  scale: "normal" | "larger" | "smaller";
  colorCycle: boolean;
} {
  const effects =
    session.powerPlan.bots[bot.id]?.effects.map(({ effect }) => effect) ?? [];
  const designation = effects.find((effect) => effect.type === "designation");
  const displayName =
    designation?.type === "designation"
      ? designation.placement === "prefix"
        ? `${designation.text} ${bot.name}`
        : `${bot.name} ${designation.text}`
      : bot.name;
  const cast = [
    session.moderator,
    session.forAdvocate,
    session.againstAdvocate,
  ];
  let identitySource: DebateBotSnapshotV1 | null = null;
  if (effects.some((effect) => effect.type === "identity_mirror")) {
    const priorSpeakerId = [...session.events]
      .reverse()
      .find(
        (event) =>
          event.sequence < beforeSequence &&
          event.speakerBotId &&
          event.speakerBotId !== bot.id,
      )?.speakerBotId;
    identitySource = debateBotSnapshot(session, priorSpeakerId);
  }
  if (
    !identitySource &&
    effects.some((effect) => effect.type === "identity_shapeshift")
  ) {
    const candidates = cast.filter((candidate) => candidate.id !== bot.id);
    identitySource =
      candidates[stableIndex(`${session.id}:${bot.id}`, candidates.length)] ??
      null;
  }
  const falseName = effects.some((effect) => effect.type === "false_name")
    ? DEBATE_FALSE_NAMES[
        stableIndex(
          `${session.id}:${bot.id}:false-name`,
          DEBATE_FALSE_NAMES.length,
        )
      ]
    : null;
  const visibilityEffect = effects.find(
    (effect) => effect.type === "avatar_visibility",
  );
  const scaleEffect = effects.find((effect) => effect.type === "avatar_scale");
  return {
    displayName,
    identityLabel: identitySource
      ? `Appearing as ${identitySource.name}`
      : falseName
        ? `Believes: ${falseName}`
        : null,
    glyph: identitySource?.glyph ?? bot.glyph,
    voiceSourceBotId: identitySource?.id ?? bot.id,
    visibility:
      visibilityEffect?.type === "avatar_visibility"
        ? visibilityEffect.mode
        : "visible",
    scale: scaleEffect?.type === "avatar_scale" ? scaleEffect.mode : "normal",
    colorCycle: effects.some((effect) => effect.type === "avatar_color_cycle"),
  };
}

export function DebateExperience(
  props: DebateExperienceProps,
): React.JSX.Element {
  const {
    bots,
    botGroups = [],
    onLiveSessionActiveChange,
    onStopUtterance,
    onUtterance,
    preferredProvider,
    request,
  } = props;
  const [view, setView] = useState<DebateView>("dashboard");
  const [studioPanel, setStudioPanel] = useState<DebateStudioPanel>("motion");
  const [sessions, setSessions] = useState<DebateSessionListItemV1[]>([]);
  const [activeSession, setActiveSession] = useState<DebateSessionV1 | null>(
    null,
  );
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState<DebateFormatId>("forum");
  const [slates, setSlates] = useState<DebateMotionSlateV1[]>([]);
  const [motion, setMotion] = useState<DebateMotionSlateV1>(EMPTY_SLATE);
  const [cast, setCast] = useState(() =>
    debatePrefilledCast(props.initialBotIds),
  );
  const [activeCastSlot, setActiveCastSlot] =
    useState<DebateCastSlot>("moderator");
  const [castPickerSearch, setCastPickerSearch] = useState("");
  const [castPickerGroupId, setCastPickerGroupId] = useState("all");
  const [playerRole, setPlayerRole] = useState<DebatePlayerRole>("judge");
  const [playerSideId, setPlayerSideId] = useState<DebateSideId>("for");
  const [roleChecks, setRoleChecks] = useState<DebateAdvocacyConsent[]>([]);
  const [evidence, setEvidence] =
    useState<DebateEvidencePacketV1>(EMPTY_EVIDENCE);
  const [researchQuery, setResearchQuery] = useState("");
  const [evidenceGenerating, setEvidenceGenerating] = useState(false);
  const [playerDraft, setPlayerDraft] = useState("");
  const [turnaboutObjecting, setTurnaboutObjecting] = useState(false);
  const [turnaboutEvidenceSourceId, setTurnaboutEvidenceSourceId] =
    useState("");
  const [judgeTarget, setJudgeTarget] = useState<DebateSideId>("for");
  const [sourceDrawerId, setSourceDrawerId] = useState<string | null>(null);
  const [transcriptCopyState, setTranscriptCopyState] =
    useState<DebateClipboardState>("idle");
  const [pendingDeleteSession, setPendingDeleteSession] =
    useState<DebateSessionListItemV1 | null>(null);
  const [earlyEndOpen, setEarlyEndOpen] = useState(false);
  const [deleteUndo, setDeleteUndo] = useState<DebateDeleteUndo | null>(null);
  const [transcriptAtLive, setTranscriptAtLive] = useState(true);
  const [liveReveal, setLiveReveal] = useState<DebateLiveReveal | null>(null);
  const [
    transcriptVisibleThroughSequence,
    setTranscriptVisibleThroughSequence,
  ] = useState<number | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [interjectionDraft, setInterjectionDraft] = useState("");
  const [cameraMode, setCameraMode] = useState<DebateCameraMode>("auto");
  const [stageAlignment, setStageAlignment] = useState<DebateStageAlignmentV3>(
    () => copyDebateStageAlignment(DEFAULT_DEBATE_STAGE_ALIGNMENT),
  );
  const [stageAlignmentDraft, setStageAlignmentDraft] =
    useState<DebateStageAlignmentV3>(() =>
      copyDebateStageAlignment(DEFAULT_DEBATE_STAGE_ALIGNMENT),
    );
  const [stageAlignmentOpen, setStageAlignmentOpen] = useState(false);
  const [stageAlignmentCopyState, setStageAlignmentCopyState] =
    useState<DebateClipboardState>("idle");
  const [stageAlignmentPreviewCamera, setStageAlignmentPreviewCamera] =
    useState<"wide" | "moderator">("wide");
  const [stageAlignmentPreviewTheme, setStageAlignmentPreviewTheme] = useState<
    "light" | "dark"
  >(props.theme);
  const [stageAlignmentSelectedItems, setStageAlignmentSelectedItems] =
    useState<Record<DebateStageAlignmentRole, DebateStageAlignmentItem>>({
      for: "bot",
      moderator: "bot",
      against: "bot",
    });
  const [stageAlignmentDraggingTarget, setStageAlignmentDraggingTarget] =
    useState<DebateStageAlignmentTarget | null>(null);
  const [presentationEventId, setPresentationEventId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRecoveryNotice, setAutoRecoveryNotice] = useState<string | null>(
    null,
  );
  const {
    active: debateAmbientBotVocalization,
    start: startDebateAmbientBotVocalization,
    stop: stopDebateAmbientBotVocalization,
    mouthShapeForTarget: debateAmbientBotVocalizationMouthShape,
  } = useAmbientBotVocalization();
  const mutationCounterRef = useRef(0);
  const presentationRunRef = useRef(0);
  const transcriptAutoFollowRef = useRef(true);
  const transcriptUserOwnsViewportRef = useRef(false);
  const transcriptTouchYRef = useRef<number | null>(null);
  const transcriptCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const stageAlignmentCopyResetTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  useEffect(() => {
    if (!autoRecoveryNotice) return;
    const timeout = window.setTimeout(() => setAutoRecoveryNotice(null), 5_200);
    return () => window.clearTimeout(timeout);
  }, [autoRecoveryNotice]);
  const deleteUndoResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const transcriptFollowFrameRef = useRef<number | null>(null);
  const speechRevealRunRef = useRef<{
    frameId: number | null;
    cancel: () => void;
  } | null>(null);
  const transcriptFeedRef = useRef<HTMLDivElement | null>(null);
  const transcriptContentRef = useRef<HTMLDivElement | null>(null);
  const deleteConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const earlyEndConfirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const sourceDrawerCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const sourceDrawerReturnFocusRef = useRef<HTMLElement | null>(null);
  const stageAlignmentSaveButtonRef = useRef<HTMLButtonElement | null>(null);
  const stageAlignmentDragRef = useRef<DebateStageAlignmentDrag | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    if (
      view === "live" &&
      (activeSession?.status === "live" ||
        activeSession?.status === "waiting_for_player") &&
      props.audioEnabled &&
      props.audioVolume > 0
    ) {
      return;
    }
    stopDebateAmbientBotVocalization();
  }, [
    activeSession?.status,
    props.audioEnabled,
    props.audioVolume,
    stopDebateAmbientBotVocalization,
    view,
  ]);

  const nextMutationKey = useCallback((label: string): string => {
    mutationCounterRef.current += 1;
    return mutationKey(label, mutationCounterRef.current);
  }, []);

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const result = await request<{
        sessions: DebateSessionListItemV1[];
      }>("/api/debates");
      if (mountedRef.current) setSessions(result.sessions);
    } catch (caught) {
      if (mountedRef.current) {
        setError(
          caught instanceof Error ? caught.message : "Could not load Debates.",
        );
      }
    }
  }, [request]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSessions();
    return () => {
      mountedRef.current = false;
      onStopUtterance?.();
      if (transcriptCopyResetTimerRef.current) {
        clearTimeout(transcriptCopyResetTimerRef.current);
        transcriptCopyResetTimerRef.current = null;
      }
      if (stageAlignmentCopyResetTimerRef.current) {
        clearTimeout(stageAlignmentCopyResetTimerRef.current);
        stageAlignmentCopyResetTimerRef.current = null;
      }
      if (deleteUndoResetTimerRef.current) {
        clearTimeout(deleteUndoResetTimerRef.current);
        deleteUndoResetTimerRef.current = null;
      }
      if (transcriptFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(transcriptFollowFrameRef.current);
        transcriptFollowFrameRef.current = null;
      }
      if (speechRevealRunRef.current) {
        if (speechRevealRunRef.current.frameId !== null) {
          window.cancelAnimationFrame(speechRevealRunRef.current.frameId);
        }
        speechRevealRunRef.current.cancel();
        speechRevealRunRef.current = null;
      }
    };
  }, [loadSessions, onStopUtterance]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = readDebateStageAlignment(
      window.localStorage,
      props.storageScopeId,
    );
    setStageAlignment(stored);
    setStageAlignmentDraft(copyDebateStageAlignment(stored));
  }, [props.storageScopeId]);
  useEffect(() => {
    if (!stageAlignmentOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      stageAlignmentSaveButtonRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      stageAlignmentDragRef.current = null;
      setStageAlignmentDraggingTarget(null);
      setStageAlignmentDraft(copyDebateStageAlignment(stageAlignment));
      setStageAlignmentOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [stageAlignment, stageAlignmentOpen]);

  const liveSessionActive = view === "live" && activeSession !== null;
  useEffect(() => {
    onLiveSessionActiveChange?.(liveSessionActive);
  }, [liveSessionActive, onLiveSessionActiveChange]);
  useEffect(
    () => () => onLiveSessionActiveChange?.(false),
    [onLiveSessionActiveChange],
  );

  const botById = useMemo(
    () => new Map(bots.map((bot) => [bot.id, bot])),
    [bots],
  );
  const dashboardAlignmentPreviewCast = useMemo(() => {
    const previewIds = debateAlignmentPreviewCast(
      bots.map((bot) => bot.id),
      cast,
    );
    if (!previewIds) return null;
    const moderator = botById.get(previewIds.moderator);
    const forAdvocate = botById.get(previewIds.forAdvocate);
    const againstAdvocate = botById.get(previewIds.againstAdvocate);
    if (!moderator || !forAdvocate || !againstAdvocate) return null;
    return { moderator, forAdvocate, againstAdvocate };
  }, [botById, bots, cast]);
  const selectedSource = sourceDrawerId
    ? (activeSession?.evidence.sources.find(
        (source) => source.id === sourceDrawerId,
      ) ??
      evidence.sources.find((source) => source.id === sourceDrawerId) ??
      null)
    : null;
  useEffect(() => {
    if (!sourceDrawerId) return;
    sourceDrawerReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frameId = window.requestAnimationFrame(() => {
      sourceDrawerCloseButtonRef.current?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSourceDrawerId(null);
        return;
      }
      if (event.key !== "Tab") return;
      const drawer =
        sourceDrawerCloseButtonRef.current?.closest<HTMLElement>(
          '[role="dialog"]',
        ) ?? null;
      if (!drawer) return;
      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", handleKeyDown);
      sourceDrawerReturnFocusRef.current?.focus();
      sourceDrawerReturnFocusRef.current = null;
    };
  }, [sourceDrawerId]);
  const activeSessionId = activeSession?.id ?? null;
  const activeSessionEventCount = activeSession?.events.length ?? 0;
  const clampTranscriptToLive = useCallback((): void => {
    const feed = transcriptFeedRef.current;
    if (!feed) return;
    feed.scrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight);
    transcriptAutoFollowRef.current = true;
    transcriptUserOwnsViewportRef.current = false;
    setTranscriptAtLive(true);
  }, []);
  useLayoutEffect(() => {
    transcriptAutoFollowRef.current = true;
    transcriptUserOwnsViewportRef.current = false;
    setTranscriptAtLive(true);
  }, [activeSessionId]);
  useLayoutEffect(() => {
    if (!transcriptAutoFollowRef.current) return;
    const frameId = window.requestAnimationFrame(() => {
      clampTranscriptToLive();
      transcriptFollowFrameRef.current = window.requestAnimationFrame(() => {
        clampTranscriptToLive();
        transcriptFollowFrameRef.current = null;
      });
    });
    return () => {
      window.cancelAnimationFrame(frameId);
      if (transcriptFollowFrameRef.current !== null) {
        window.cancelAnimationFrame(transcriptFollowFrameRef.current);
        transcriptFollowFrameRef.current = null;
      }
    };
  }, [
    activeSessionEventCount,
    activeSessionId,
    busy,
    clampTranscriptToLive,
    liveReveal?.visibleContent.length,
  ]);
  useEffect(() => {
    const feed = transcriptFeedRef.current;
    const content = transcriptContentRef.current;
    if (!feed || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (transcriptAutoFollowRef.current) clampTranscriptToLive();
    });
    observer.observe(feed);
    observer.observe(content);
    return () => observer.disconnect();
  }, [activeSessionId, clampTranscriptToLive]);
  useEffect(() => {
    if (!pendingDeleteSession) return;
    const frameId = window.requestAnimationFrame(() => {
      deleteConfirmButtonRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingDeleteSession(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pendingDeleteSession]);
  useEffect(() => {
    if (!earlyEndOpen) return;
    const frameId = window.requestAnimationFrame(() => {
      earlyEndConfirmButtonRef.current?.focus();
    });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setEarlyEndOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [earlyEndOpen]);

  const copyVerboseTranscript = useCallback(async (): Promise<void> => {
    if (!activeSession || transcriptCopyState === "copying") return;
    if (transcriptCopyResetTimerRef.current) {
      clearTimeout(transcriptCopyResetTimerRef.current);
      transcriptCopyResetTimerRef.current = null;
    }
    setTranscriptCopyState("copying");
    try {
      await writeDebateClipboardText(
        formatDebateVerboseTranscript(activeSession),
      );
      setTranscriptCopyState("copied");
    } catch {
      setTranscriptCopyState("failed");
    }
    transcriptCopyResetTimerRef.current = setTimeout(() => {
      setTranscriptCopyState("idle");
      transcriptCopyResetTimerRef.current = null;
    }, 1_800);
  }, [activeSession, transcriptCopyState]);

  const castIds = [cast.moderator, cast.forAdvocate, cast.againstAdvocate];
  const castComplete =
    castIds.every(Boolean) && new Set(castIds).size === castIds.length;
  const motionComplete = Boolean(
    motion.motion.trim() &&
    motion.forSide.label.trim() &&
    motion.forSide.brief.trim() &&
    motion.againstSide.label.trim() &&
    motion.againstSide.brief.trim(),
  );
  const moderatorMuted = botById.get(cast.moderator)?.hardMuted === true;
  const mutedAdvocates = [cast.forAdvocate, cast.againstAdvocate]
    .map((id) => botById.get(id))
    .filter((bot): bot is DebateBotSummary => bot?.hardMuted === true);
  const declinedChecks = roleChecks.filter(
    (check) => check.status === "decline",
  );
  const roleChecksComplete =
    roleChecks.length === 2 && declinedChecks.length === 0;
  const debateCanStart =
    motionComplete && castComplete && !moderatorMuted && roleChecksComplete;
  const readinessCount = [
    motionComplete,
    castComplete && !moderatorMuted,
    roleChecksComplete,
    true,
  ].filter(Boolean).length;
  const debatePickerGroups = useMemo<BotPickerGroup[]>(() => {
    const availableIds = new Set(bots.map((bot) => bot.id));
    return [
      {
        id: "all",
        name: "All bots",
        botIds: bots.map((bot) => bot.id),
        count: bots.length,
      },
      ...botGroups
        .map((group) => {
          const groupBotIds = group.botIds.filter((botId) =>
            availableIds.has(botId),
          );
          return {
            ...group,
            botIds: groupBotIds,
            count: groupBotIds.length,
          };
        })
        .filter((group) => group.botIds.length > 0),
    ];
  }, [botGroups, bots]);
  const effectiveCastPickerGroupId = debatePickerGroups.some(
    (group) => group.id === castPickerGroupId,
  )
    ? castPickerGroupId
    : "all";
  const visibleCastBots = useMemo(
    () =>
      filterBotPickerItems(
        bots,
        castPickerSearch,
        effectiveCastPickerGroupId,
        debatePickerGroups,
      ),
    [bots, castPickerSearch, debatePickerGroups, effectiveCastPickerGroupId],
  );

  const startNewDebate = (): void => {
    setView("dashboard");
    setStudioPanel("motion");
    setActiveSession(null);
    setTopic("");
    setFormat("forum");
    setSlates([]);
    setMotion(EMPTY_SLATE);
    setCast(debatePrefilledCast(props.initialBotIds));
    setActiveCastSlot("moderator");
    setCastPickerSearch("");
    setCastPickerGroupId("all");
    setPlayerRole("judge");
    setPlayerSideId("for");
    setRoleChecks([]);
    setEvidence(EMPTY_EVIDENCE);
    setResearchQuery("");
    setPlayerDraft("");
    setTurnaboutObjecting(false);
    setTurnaboutEvidenceSourceId("");
    setError(null);
  };

  const assignBotToCastSlot = (slot: DebateCastSlot, botId: string): void => {
    const bot = botById.get(botId);
    if (!bot || (slot === "moderator" && bot.hardMuted)) return;
    const duplicateSlot = (
      ["moderator", "forAdvocate", "againstAdvocate"] as const
    ).find((candidate) => candidate !== slot && cast[candidate] === botId);
    if (duplicateSlot) return;
    const nextCast = { ...cast, [slot]: botId };
    setCast(nextCast);
    setRoleChecks([]);
    const slotOrder: DebateCastSlot[] = [
      "moderator",
      "forAdvocate",
      "againstAdvocate",
    ];
    const activeIndex = slotOrder.indexOf(slot);
    const nextIncomplete = [
      ...slotOrder.slice(activeIndex + 1),
      ...slotOrder.slice(0, activeIndex + 1),
    ].find((candidate) => !nextCast[candidate]);
    if (nextIncomplete) setActiveCastSlot(nextIncomplete);
  };

  const clearCastSlot = (slot: DebateCastSlot): void => {
    setCast((current) => ({ ...current, [slot]: "" }));
    setRoleChecks([]);
    setActiveCastSlot(slot);
  };

  const openStageAlignment = (): void => {
    setStageAlignmentDraft(copyDebateStageAlignment(stageAlignment));
    setStageAlignmentPreviewCamera("wide");
    setStageAlignmentPreviewTheme(props.theme);
    setStageAlignmentCopyState("idle");
    setStageAlignmentSelectedItems({
      for: "bot",
      moderator: "bot",
      against: "bot",
    });
    setStageAlignmentDraggingTarget(null);
    stageAlignmentDragRef.current = null;
    setStageAlignmentOpen(true);
  };

  const cancelStageAlignment = (): void => {
    setStageAlignmentDraft(copyDebateStageAlignment(stageAlignment));
    setStageAlignmentCopyState("idle");
    setStageAlignmentDraggingTarget(null);
    stageAlignmentDragRef.current = null;
    setStageAlignmentOpen(false);
  };

  const saveStageAlignment = (): void => {
    const normalized = normalizeDebateStageAlignment(stageAlignmentDraft);
    try {
      writeDebateStageAlignment(
        window.localStorage,
        props.storageScopeId,
        normalized,
      );
      setStageAlignment(normalized);
      setStageAlignmentDraft(copyDebateStageAlignment(normalized));
      setStageAlignmentOpen(false);
    } catch {
      setError("Debate stage alignment could not be saved on this device.");
    }
  };

  const copyStageAlignmentData = async (): Promise<void> => {
    if (stageAlignmentCopyState === "copying") return;
    if (stageAlignmentCopyResetTimerRef.current) {
      clearTimeout(stageAlignmentCopyResetTimerRef.current);
      stageAlignmentCopyResetTimerRef.current = null;
    }
    setStageAlignmentCopyState("copying");
    try {
      await writeDebateClipboardText(
        formatDebateStageAlignmentClipboard(stageAlignmentDraft),
      );
      setStageAlignmentCopyState("copied");
    } catch {
      setStageAlignmentCopyState("failed");
    }
    stageAlignmentCopyResetTimerRef.current = setTimeout(() => {
      setStageAlignmentCopyState("idle");
      stageAlignmentCopyResetTimerRef.current = null;
    }, 1_800);
  };

  const stageAlignmentTargetForRole = (
    role: DebateStageAlignmentRole,
    item: DebateStageAlignmentItem = stageAlignmentSelectedItems[role],
  ): DebateStageAlignmentTarget =>
    debateStageAlignmentTarget(role, item, stageAlignmentPreviewCamera);

  const updateStageAlignmentTarget = (
    target: DebateStageAlignmentTarget,
    update: Partial<DebateStageOffsetV1>,
  ): void => {
    setStageAlignmentDraft((current) =>
      updateDebateStageAlignmentOffset(current, target, update),
    );
  };

  const beginStageAlignmentDrag = (
    event: ReactPointerEvent<HTMLElement>,
    role: DebateStageAlignmentRole,
    item: DebateStageAlignmentItem,
  ): void => {
    if (event.button !== 0) return;
    const stage = event.currentTarget.closest<HTMLElement>(
      '[data-debate-alignment-stage="true"]',
    );
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const target = stageAlignmentTargetForRole(role, item);
    stageAlignmentDragRef.current = {
      pointerId: event.pointerId,
      role,
      item,
      target,
      startClientX: event.clientX,
      startClientY: event.clientY,
      stageWidth: bounds.width,
      stageHeight: bounds.height,
      startAlignment: copyDebateStageAlignment(stageAlignmentDraft),
    };
    setStageAlignmentSelectedItems((current) => ({
      ...current,
      [role]: item,
    }));
    setStageAlignmentDraggingTarget(target);
  };

  const moveStageAlignmentDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = stageAlignmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const start = debateStageAlignmentOffset(drag.startAlignment, drag.target);
    setStageAlignmentDraft(
      updateDebateStageAlignmentOffset(drag.startAlignment, drag.target, {
        x:
          start.x +
          ((event.clientX - drag.startClientX) / drag.stageWidth) * 100,
        y:
          start.y +
          ((event.clientY - drag.startClientY) / drag.stageHeight) * 100,
      }),
    );
  };

  const finishStageAlignmentDrag = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    const drag = stageAlignmentDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    stageAlignmentDragRef.current = null;
    setStageAlignmentDraggingTarget(null);
  };

  const nudgeStageAlignmentItem = (
    event: ReactKeyboardEvent<HTMLElement>,
    role: DebateStageAlignmentRole,
    item: DebateStageAlignmentItem,
  ): void => {
    const direction = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[event.key];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) return;
    const step = DEBATE_STAGE_ALIGNMENT_STEP * (event.shiftKey ? 4 : 1);
    const target = stageAlignmentTargetForRole(role, item);
    setStageAlignmentSelectedItems((current) => ({
      ...current,
      [role]: item,
    }));
    const offset = debateStageAlignmentOffset(stageAlignmentDraft, target);
    updateStageAlignmentTarget(target, {
      x: offset.x + direction[0]! * step,
      y: offset.y + direction[1]! * step,
    });
  };

  const synthesize = useCallback(async (): Promise<void> => {
    if (!topic.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ slates: DebateMotionSlateV1[] }>(
        "/api/debates/synthesize",
        requestBody({
          topic,
          preferredProvider: props.modelOverride?.provider ?? preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
        }),
      );
      setSlates(result.slates);
      setMotion(result.slates[0] ?? EMPTY_SLATE);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Synthesis was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    preferredProvider,
    props.modelOverride?.model,
    props.modelOverride?.provider,
    props.responseMode,
    request,
    topic,
  ]);

  const synthesisMagic = useMemo<PrismRefractMagicTarget>(
    () => ({
      id: "debate:synthesize-motion-options",
      label: "Synthesize debate options",
      kind: "magic",
      disabled: () => !topic.trim() || busy,
      run: () => synthesize(),
    }),
    [busy, synthesize, topic],
  );

  const selectSlate = (slate: DebateMotionSlateV1): void => {
    setMotion(copyDebateMotionSlate(slate));
    setRoleChecks([]);
  };

  const checkRoles = async (): Promise<boolean> => {
    if (!castComplete || moderatorMuted) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ checks: DebateAdvocacyConsent[] }>(
        "/api/debates/role-checks",
        requestBody({
          format,
          motion,
          forAdvocateBotId: cast.forAdvocate,
          againstAdvocateBotId: cast.againstAdvocate,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
        }),
      );
      setRoleChecks(result.checks);
      return result.checks.every((check) => check.status !== "decline");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The private role check was unavailable.",
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const swapAdvocates = (): void => {
    setCast((current) => ({
      ...current,
      forAdvocate: current.againstAdvocate,
      againstAdvocate: current.forAdvocate,
    }));
    setRoleChecks([]);
  };

  const research = async (
    queryOverride?: string,
    generated = false,
  ): Promise<void> => {
    const query = (queryOverride ?? researchQuery).trim();
    if (!query || props.responseMode === "local") return;
    setBusy(true);
    setEvidenceGenerating(generated);
    setError(null);
    try {
      const result = await props.request<{
        sources: DebateEvidenceSourceV1[];
      }>(
        "/api/debates/research",
        requestBody({
          query,
          preferredProvider: props.preferredProvider,
          responseMode: props.responseMode,
        }),
      );
      setEvidence((current) => ({
        ...current,
        sources: result.sources.slice(0, 12),
      }));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Research was unavailable.",
      );
    } finally {
      setEvidenceGenerating(false);
      setBusy(false);
    }
  };

  const generateEvidence = async (): Promise<void> => {
    const query = randomDebateEvidenceQuery(motion.motion, topic);
    if (!query) {
      setError("Shape the motion before generating evidence.");
      return;
    }
    setResearchQuery(query);
    await research(query, true);
  };

  const revealEventSilently = useCallback(
    (event: DebateEventV1, spokenText: string): Promise<void> =>
      new Promise((resolve) => {
        if (!event.content) {
          resolve();
          return;
        }
        const durationMs = debateRevealDurationMs(spokenText || event.content);
        const speechText = spokenText || event.content;
        if (durationMs <= 0) {
          setLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
            speechTiming: null,
          });
          resolve();
          return;
        }
        const startedAt = performance.now();
        let settled = false;
        const settle = (complete: boolean): void => {
          if (settled) return;
          settled = true;
          if (complete) {
            setLiveReveal({
              eventId: event.id,
              visibleContent: event.content,
              speechTiming: {
                text: speechText,
                elapsedMs: durationMs,
                durationMs,
                alignment: null,
              },
            });
          }
          if (speechRevealRunRef.current?.cancel === cancel) {
            speechRevealRunRef.current = null;
          }
          resolve();
        };
        const finish = (): void => settle(true);
        const cancel = (): void => settle(false);
        const tick = (now: number): void => {
          if (!mountedRef.current) {
            finish();
            return;
          }
          const progress = Math.min(1, (now - startedAt) / durationMs);
          setLiveReveal({
            eventId: event.id,
            visibleContent: debateVisibleContentAtProgress(
              event.content,
              progress,
            ),
            speechTiming: {
              text: speechText,
              elapsedMs: progress * durationMs,
              durationMs,
              alignment: null,
            },
          });
          if (progress >= 1) {
            finish();
            return;
          }
          const frameId = window.requestAnimationFrame(tick);
          if (speechRevealRunRef.current?.cancel === cancel) {
            speechRevealRunRef.current.frameId = frameId;
          }
        };
        const frameId = window.requestAnimationFrame(tick);
        speechRevealRunRef.current = { frameId, cancel };
      }),
    [],
  );

  const consumeNewEvents = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
      runId: number,
    ): Promise<void> => {
      const fresh = debatePresentationEvents(previous, next);
      const recovery = [...fresh]
        .reverse()
        .find((event) => event.autoRecovery)?.autoRecovery;
      if (recovery) {
        setAutoRecoveryNotice(
          recovery.crossedOnline
            ? `Local stalled — recovered online with ${recovery.finalModel}.`
            : `Recovered with ${recovery.finalModel}.`,
        );
      }
      for (const event of fresh) {
        if (presentationRunRef.current !== runId) return;
        setTranscriptVisibleThroughSequence(event.sequence);
        setPresentationEventId(event.id);
        if (event.kind === "silence") {
          setLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
          });
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        if (
          event.kind === "ballot" &&
          next.ballots.find(
            (ballot) => ballot.voterBotId === event.speakerBotId,
          )?.privateReason
        ) {
          setLiveReveal(null);
          await new Promise((resolve) => window.setTimeout(resolve, 900));
          continue;
        }
        const speaker = event.speakerBotId
          ? (bots.find((bot) => bot.id === event.speakerBotId) ?? null)
          : null;
        const spokenText = debateSpokenText(event.content);
        const snapshot = debateBotSnapshot(next, event.speakerBotId);
        setLiveReveal({ eventId: event.id, visibleContent: "" });
        let playbackProgressSeen = false;
        let playbackAlignment: VoicePlaybackCharacterAlignment | null = null;
        let playbackDurationMs = Math.max(
          1,
          debateRevealDurationMs(spokenText || event.content),
        );
        let lastSpeechRenderAt = 0;
        const played = await onUtterance?.({
          event,
          format: next.format,
          sessionId: next.id,
          speaker,
          player: event.speakerKind === "player",
          spokenText,
          voiceSourceBotId: snapshot
            ? debateBotPresentation(next, snapshot, event.sequence)
                .voiceSourceBotId
            : null,
          lifecycle: {
            onStart: (durationMs, alignment) => {
              if (presentationRunRef.current !== runId) return;
              playbackAlignment = alignment ?? null;
              playbackDurationMs = Math.max(
                1,
                durationMs ?? playbackDurationMs,
              );
              lastSpeechRenderAt = performance.now();
              setLiveReveal((current) =>
                current?.eventId === event.id
                  ? {
                      ...current,
                      speechTiming: {
                        text: spokenText,
                        elapsedMs: 0,
                        durationMs: playbackDurationMs,
                        alignment: playbackAlignment,
                      },
                    }
                  : current,
              );
            },
            onProgress: (elapsedMs, durationMs) => {
              if (presentationRunRef.current !== runId) return;
              playbackProgressSeen = true;
              playbackDurationMs = Math.max(1, durationMs);
              const now = performance.now();
              if (
                elapsedMs < playbackDurationMs &&
                now - lastSpeechRenderAt < DEBATE_LIVE_SPEECH_RENDER_INTERVAL_MS
              ) {
                return;
              }
              lastSpeechRenderAt = now;
              setLiveReveal({
                eventId: event.id,
                visibleContent: debateVisibleContentAtProgress(
                  event.content,
                  elapsedMs / playbackDurationMs,
                ),
                speechTiming: {
                  text: spokenText,
                  elapsedMs: Math.min(playbackDurationMs, elapsedMs),
                  durationMs: playbackDurationMs,
                  alignment: playbackAlignment,
                },
              });
            },
            onEnd: () => {
              if (presentationRunRef.current !== runId) return;
              setLiveReveal({
                eventId: event.id,
                visibleContent: event.content,
                speechTiming: {
                  text: spokenText,
                  elapsedMs: playbackDurationMs,
                  durationMs: playbackDurationMs,
                  alignment: playbackAlignment,
                },
              });
            },
          },
        });
        if (presentationRunRef.current !== runId) return;
        if (!played || !playbackProgressSeen) {
          await revealEventSilently(event, spokenText);
          if (presentationRunRef.current !== runId) return;
        } else {
          setLiveReveal({
            eventId: event.id,
            visibleContent: event.content,
          });
        }
      }
      if (presentationRunRef.current !== runId) return;
      setLiveReveal(null);
      setTranscriptVisibleThroughSequence(null);
    },
    [bots, onUtterance, revealEventSilently],
  );

  const adoptSession = useCallback(
    async (
      previous: DebateSessionV1 | null,
      next: DebateSessionV1,
    ): Promise<void> => {
      const runId = presentationRunRef.current + 1;
      presentationRunRef.current = runId;
      const fresh = debatePresentationEvents(previous, next);
      const first = fresh[0] ?? null;
      if (first) {
        setTranscriptVisibleThroughSequence(first.sequence);
        setPresentationEventId(first.id);
        setLiveReveal({ eventId: first.id, visibleContent: "" });
      } else {
        setTranscriptVisibleThroughSequence(null);
        setPresentationEventId(null);
        setLiveReveal(null);
      }
      setPresenting(fresh.length > 0);
      setTurnaboutObjecting(false);
      setTurnaboutEvidenceSourceId("");
      setActiveSession(next);
      try {
        await consumeNewEvents(previous, next, runId);
      } finally {
        if (presentationRunRef.current === runId) {
          setPresenting(false);
        }
      }
      void loadSessions();
    },
    [consumeNewEvents, loadSessions],
  );

  const openSession = async (id: string): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(id)}`,
      );
      setCameraMode("auto");
      setTurnaboutObjecting(false);
      setTurnaboutEvidenceSourceId("");
      setActiveSession(result.session);
      setView("live");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Debate not found.");
    } finally {
      setBusy(false);
    }
  };

  const startDebate = async (): Promise<void> => {
    if (!debateCanStart) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates",
        requestBody({
          format,
          motion,
          evidence,
          moderatorBotId: cast.moderator,
          forAdvocateBotId: cast.forAdvocate,
          againstAdvocateBotId: cast.againstAdvocate,
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          advocacyConsent: roleChecks,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model,
          responseMode: props.responseMode,
          theme: props.theme,
          idempotencyKey: nextMutationKey("create"),
        }),
      );
      if (mountedRef.current) setBusy(false);
      setCameraMode("auto");
      setView("live");
      await adoptSession(null, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Debate could not start.",
      );
    } finally {
      setBusy(false);
    }
  };

  const advance = useCallback(
    async (skip = false): Promise<void> => {
      const previous = activeSession;
      if (!previous || busy || presenting) return;
      setBusy(true);
      setError(null);
      try {
        const result = await request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(previous.id)}/advance`,
          requestBody({
            expectedRevision: previous.revision,
            idempotencyKey: nextMutationKey(skip ? "skip" : "advance"),
            skip,
            preferredProvider,
          }),
        );
        if (mountedRef.current) setBusy(false);
        await adoptSession(previous, result.session);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The turn was unavailable.",
        );
      } finally {
        if (mountedRef.current) setBusy(false);
      }
    },
    [
      activeSession,
      adoptSession,
      busy,
      nextMutationKey,
      preferredProvider,
      presenting,
      request,
    ],
  );

  useEffect(() => {
    if (
      view !== "live" ||
      !activeSession ||
      activeSession.status !== "live" ||
      busy ||
      presenting
    ) {
      return;
    }
    const timer = window.setTimeout(() => void advance(false), 520);
    return () => window.clearTimeout(timer);
  }, [activeSession, advance, busy, presenting, view]);

  const submitPlayerTurn = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const previous = activeSession;
    if (!previous || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/player-turn`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("player-turn"),
          content: playerDraft,
          targetSideId:
            previous.stepKey === "challenge_judge_question"
              ? judgeTarget
              : undefined,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your turn could not be saved.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const passPlayerTurn = async (): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/player-turn`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("pass"),
          pass: true,
          targetSideId:
            previous.stepKey === "challenge_judge_question"
              ? judgeTarget
              : undefined,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Pass was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const submitTurnaboutAction = async (
    action: "press" | "present_evidence" | "pass",
    statementId: string,
  ): Promise<void> => {
    const previous = activeSession;
    if (!previous || previous.format !== "turnabout" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/turnabout-action`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey(`turnabout-${action}`),
          action,
          statementId,
          evidenceSourceId:
            action === "present_evidence"
              ? turnaboutEvidenceSourceId
              : undefined,
        }),
      );
      if (mountedRef.current) setBusy(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The record action was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const submitVerdict = async (sideId: DebateSideId): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/verdict`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("verdict"),
          sideId,
          reason: playerDraft,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setPlayerDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The verdict was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const cancelCurrentPresentation = (): void => {
    presentationRunRef.current += 1;
    props.onStopUtterance?.();
    if (speechRevealRunRef.current) {
      if (speechRevealRunRef.current.frameId !== null) {
        window.cancelAnimationFrame(speechRevealRunRef.current.frameId);
      }
      speechRevealRunRef.current.cancel();
      speechRevealRunRef.current = null;
    }
    setPresenting(false);
  };

  const pauseOrResume = async (): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy) return;
    const resume = previous.status === "paused";
    const pausedPresentationEvent = presentationEventId
      ? (previous.events.find((event) => event.id === presentationEventId) ??
        null)
      : null;
    const shouldReplayPausedPresentation =
      resume &&
      pausedPresentationEvent !== null &&
      liveReveal?.eventId === pausedPresentationEvent.id &&
      liveReveal.visibleContent.length < pausedPresentationEvent.content.length;
    if (!resume) cancelCurrentPresentation();
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/${
          resume ? "resume" : "pause"
        }`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey(resume ? "resume" : "pause"),
        }),
      );
      if (shouldReplayPausedPresentation && pausedPresentationEvent) {
        if (mountedRef.current) setBusy(false);
        await adoptSession(
          {
            ...previous,
            events: previous.events.filter(
              (event) => event.sequence < pausedPresentationEvent.sequence,
            ),
          },
          result.session,
        );
      } else {
        setActiveSession(result.session);
      }
      void loadSessions();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `${resume ? "Resume" : "Pause"} was unavailable.`,
      );
      if (!resume) {
        setTranscriptVisibleThroughSequence(null);
        setLiveReveal(null);
      }
    } finally {
      setBusy(false);
    }
  };

  const endDebateEarly = async (): Promise<void> => {
    const previous = activeSession;
    if (!previous || busy || presenting) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/end-early`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("end-early"),
        }),
      );
      setEarlyEndOpen(false);
      setPlayerDraft("");
      if (mountedRef.current) setBusy(false);
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The early conclusion was unavailable.",
      );
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const submitInterjection = async (
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    event.preventDefault();
    const previous = activeSession;
    const target = previous?.events.find(
      (candidate) => candidate.id === presentationEventId,
    );
    if (
      !previous ||
      !target ||
      target.kind !== "speech" ||
      target.sideId === previous.playerSideId ||
      !liveReveal ||
      liveReveal.eventId !== target.id ||
      liveReveal.visibleContent.length < 24 ||
      !interjectionDraft.trim() ||
      busy
    ) {
      return;
    }
    cancelCurrentPresentation();
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(previous.id)}/interject`,
        requestBody({
          expectedRevision: previous.revision,
          idempotencyKey: nextMutationKey("interject"),
          eventId: target.id,
          heardCharacterCount: liveReveal.visibleContent.length,
          content: interjectionDraft,
        }),
      );
      if (mountedRef.current) setBusy(false);
      setInterjectionDraft("");
      await adoptSession(previous, result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The moderator could not hear the interjection.",
      );
      setTranscriptVisibleThroughSequence(null);
      setLiveReveal(null);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  };

  const deleteSession = async (): Promise<void> => {
    const session = pendingDeleteSession;
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const detail = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(session.id)}`,
      );
      const result = await props.request<{
        actionRun: { id: string };
      }>(`/api/debates/${encodeURIComponent(session.id)}`, {
        method: "DELETE",
        body: JSON.stringify({
          expectedRevision: detail.session.revision,
          idempotencyKey: nextMutationKey("delete"),
        }),
      });
      setPendingDeleteSession(null);
      setSessions((current) =>
        current.filter((candidate) => candidate.id !== session.id),
      );
      if (deleteUndoResetTimerRef.current) {
        clearTimeout(deleteUndoResetTimerRef.current);
      }
      setDeleteUndo({
        runId: result.actionRun.id,
        sessionId: session.id,
        motion: session.motion,
      });
      deleteUndoResetTimerRef.current = setTimeout(() => {
        setDeleteUndo(null);
        deleteUndoResetTimerRef.current = null;
      }, 8_000);
      if (activeSession?.id === session.id) {
        setActiveSession(null);
        setView("dashboard");
      }
    } catch (caught) {
      setPendingDeleteSession(null);
      setError(
        caught instanceof Error ? caught.message : "Delete was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const undoDeleteSession = async (): Promise<void> => {
    const undo = deleteUndo;
    if (!undo || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.request(
        "/api/prism/actions/undo",
        requestBody({
          runId: undo.runId,
          surface: {
            surfaceId: "debate",
            debateSessionId: undo.sessionId,
          },
        }),
      );
      if (deleteUndoResetTimerRef.current) {
        clearTimeout(deleteUndoResetTimerRef.current);
        deleteUndoResetTimerRef.current = null;
      }
      setDeleteUndo(null);
      await loadSessions();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Undo was unavailable.",
      );
    } finally {
      setBusy(false);
    }
  };

  const renderArchive = (): React.JSX.Element => (
    <section className={`${styles.historySection} ${styles.archivePanel}`}>
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.eyebrow}>Proceeding archive</p>
          <h2>Return to a proceeding</h2>
          <p>
            Resume a live proceeding or revisit the final record without
            disturbing the workbench.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadSessions()}
          disabled={busy}
        >
          Refresh archive
        </button>
      </div>
      {sessions.length === 0 ? (
        <div className={styles.emptyHistory}>
          <span aria-hidden="true">◇</span>
          <strong>The archive is quiet.</strong>
          <p>Your first completed or paused Duel will wait here.</p>
        </div>
      ) : (
        <ul className={styles.sessionList}>
          {sessions.map((session, index) => (
            <li key={session.id} data-status={session.status}>
              <span className={styles.archiveIndex} aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <button
                type="button"
                className={styles.sessionOpen}
                onClick={() => void openSession(session.id)}
                disabled={busy}
              >
                <strong>{session.motion}</strong>
                <span>
                  {session.format === "turnabout"
                    ? "Turnabout · Court of Record"
                    : "Forum · Assembly Chamber"}{" "}
                  ·{" "}
                  {sessionStatusLabel(session)} · {session.playerRole}
                </span>
              </button>
              <button
                type="button"
                className={styles.deleteButton}
                onClick={() => setPendingDeleteSession(session)}
                aria-label={`Delete ${session.motion}`}
                disabled={busy}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const renderForumReadout = (): React.JSX.Element => {
    const seats = [
      {
        id: "for",
        label: motion.forSide.label || "For",
        bot: botById.get(cast.forAdvocate) ?? null,
        fallback: "#42d9ff",
      },
      {
        id: "moderator",
        label: "Moderator",
        bot: botById.get(cast.moderator) ?? null,
        fallback: "#a995ff",
      },
      {
        id: "against",
        label: motion.againstSide.label || "Against",
        bot: botById.get(cast.againstAdvocate) ?? null,
        fallback: "#ff5f8f",
      },
    ] as const;
    return (
      <section
        className={styles.forumReadout}
        aria-label={
          format === "turnabout"
            ? "Court of Record schematic"
            : "Assembly Chamber schematic"
        }
        data-format={format}
        data-ready={debateCanStart ? "true" : undefined}
      >
        <header>
          <span>
            {format === "turnabout"
              ? "Court of Record schematic"
              : "Assembly Chamber schematic"}
          </span>
          <strong>{readinessCount}/4 locked</strong>
        </header>
        <div className={styles.forumCircuit}>
          <span className={styles.forumBeam} aria-hidden="true" />
          {seats.map((seat) => {
            const accent = seat.bot?.color ?? seat.fallback;
            return (
              <div
                className={styles.forumCircuitSeat}
                data-role={seat.id}
                key={seat.id}
                style={{ "--debate-seat-color": accent } as CSSProperties}
              >
                <span aria-hidden="true">
                  {seat.bot
                    ? props.renderBotGlyph(seat.bot.glyph, {
                        size: 22,
                        strokeWidth: 1.45,
                      })
                    : "◇"}
                </span>
                <small>{seat.label}</small>
                <strong>{seat.bot?.name ?? "Uncast"}</strong>
              </div>
            );
          })}
          <span className={styles.forumCircuitPrism} aria-hidden="true">
            ◇
          </span>
        </div>
        <p>{motion.motion || "The motion has not entered the chamber."}</p>
        <small className={styles.formatReadout}>
          {format === "turnabout"
            ? "Two pressable statements per side · frozen evidence only"
            : "Openings · challenges · rebuttals · closings"}
        </small>
      </section>
    );
  };

  const renderLobby = (): React.JSX.Element => (
    <main
      className={`${styles.lobby} ${styles.dashboard}`}
      data-debate-surface="dashboard"
      data-debate-format={format}
      data-theme={props.theme}
    >
      <header className={styles.lobbyHeader}>
        <button
          type="button"
          className={styles.exitButton}
          onClick={props.onExit}
        >
          ← Exit
        </button>
        <div className={styles.studioIdentity}>
          <p className={styles.eyebrow}>PRISM / Debate</p>
          <h1>Debate Studio</h1>
          <span>
            {format === "turnabout"
              ? "Turnabout · Court of Record"
              : "Forum · Assembly Chamber"}
          </span>
        </div>
        <div className={styles.lobbyActions}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={startNewDebate}
            disabled={props.bots.length < 3}
            data-tutorial-target="debate-new"
          >
            <span aria-hidden="true">＋</span>
            New Duel
          </button>
          {props.onResetTutorial ? (
            <button
              type="button"
              className={styles.tutorialButton}
              onClick={props.onResetTutorial}
            >
              Replay walkthrough
            </button>
          ) : null}
        </div>
      </header>
      {props.bots.length < 3 ? (
        <p className={styles.notice} role="status">
          Create at least three Library bots to enter Debate.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.dashboardLayout}>
        <nav className={styles.studioNav} aria-label="Debate Studio">
          <p>Build the Duel</p>
          {(
            [
              {
                id: "motion",
                index: "01",
                label: "Motion",
                detail: motionComplete ? "Bound" : "Shape the question",
                complete: motionComplete,
                tutorial: undefined,
              },
              {
                id: "cast",
                index: "02",
                label: "Cast",
                detail: roleChecksComplete
                  ? "Consent secured"
                  : castComplete
                    ? "Check consent"
                    : "Seat the proceeding",
                complete: castComplete && !moderatorMuted && roleChecksComplete,
                tutorial: "debate-cast",
              },
              {
                id: "evidence",
                index: "03",
                label: "Evidence",
                detail:
                  evidence.sources.length > 0 || evidence.notes.trim()
                    ? "Packet prepared"
                    : "Optional packet",
                complete: true,
                tutorial: "debate-evidence",
              },
            ] as const
          ).map((panel) => (
            <button
              type="button"
              className={styles.studioNavButton}
              data-active={studioPanel === panel.id ? "true" : undefined}
              data-complete={panel.complete ? "true" : undefined}
              data-tutorial-target={panel.tutorial}
              aria-pressed={studioPanel === panel.id}
              onClick={() => setStudioPanel(panel.id)}
              key={panel.id}
            >
              <span>{panel.index}</span>
              <strong>{panel.label}</strong>
              <small>{panel.detail}</small>
              <i aria-hidden="true">{panel.complete ? "✓" : "·"}</i>
            </button>
          ))}
          <span className={styles.studioNavRule} />
          <button
            type="button"
            className={styles.studioNavButton}
            data-active={studioPanel === "archive" ? "true" : undefined}
            aria-pressed={studioPanel === "archive"}
            aria-label="Open proceeding archive"
            onClick={() => setStudioPanel("archive")}
          >
            <span>↳</span>
            <strong>Archive</strong>
            <small>
              {sessions.length} proceeding{sessions.length === 1 ? "" : "s"}
            </small>
            <i aria-hidden="true">›</i>
          </button>
          <button
            type="button"
            className={styles.studioUtilityButton}
            onClick={openStageAlignment}
            disabled={!dashboardAlignmentPreviewCast}
            aria-label="Align stage"
            title={
              dashboardAlignmentPreviewCast
                ? "Advanced stage geometry for this account and device."
                : "Create at least three Library bots to calibrate the Debate stage."
            }
            data-tutorial-target="debate-align-stage"
          >
            <span aria-hidden="true">⌖</span>
            Stage geometry
          </button>
          <div className={styles.studioNavStatus}>
            <span>Launch circuit</span>
            <strong>
              {debateCanStart
                ? format === "turnabout"
                  ? "Record ready"
                  : "Forum ready"
                : "Stand by"}
            </strong>
            <div aria-hidden="true">
              <i
                style={
                  {
                    "--debate-readiness": `${readinessCount / 4}`,
                  } as CSSProperties
                }
              />
            </div>
          </div>
        </nav>
        <div className={styles.dashboardDesk} data-studio-panel={studioPanel}>
          {studioPanel === "motion" ? renderMotionStep() : null}
          {studioPanel === "cast" ? renderCastStep() : null}
          {studioPanel === "evidence" ? renderEvidenceStep() : null}
          {studioPanel === "archive" ? renderArchive() : null}
        </div>
        <aside className={styles.dashboardRail}>
          {renderForumReadout()}
          {renderReviewStep()}
        </aside>
      </div>
      {selectedSource ? (
        <aside
          className={styles.sourceDrawer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="debate-source-title"
        >
          <button
            ref={sourceDrawerCloseButtonRef}
            type="button"
            onClick={() => setSourceDrawerId(null)}
          >
            Close
          </button>
          <span>{selectedSource.id}</span>
          <h2 id="debate-source-title">{selectedSource.title}</h2>
          <p>{selectedSource.snippet}</p>
          {selectedSource.publishedAt ? (
            <small>{selectedSource.publishedAt}</small>
          ) : null}
          <a href={selectedSource.url} target="_blank" rel="noreferrer">
            Open original source
          </a>
        </aside>
      ) : null}
      {pendingDeleteSession ? (
        <div
          className={styles.confirmBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) {
              setPendingDeleteSession(null);
            }
          }}
        >
          <section
            className={styles.confirmDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="debate-delete-title"
            aria-describedby="debate-delete-description"
          >
            <p className={styles.eyebrow}>Remove proceeding</p>
            <h2 id="debate-delete-title">Delete this Debate?</h2>
            <p id="debate-delete-description">
              “{pendingDeleteSession.motion}” will leave Debate history
              immediately. PRISM can restore it through Undo for 30 days.
            </p>
            <div>
              <button
                type="button"
                onClick={() => setPendingDeleteSession(null)}
                disabled={busy}
              >
                Keep Debate
              </button>
              <button
                ref={deleteConfirmButtonRef}
                type="button"
                className={styles.confirmDeleteButton}
                onClick={() => void deleteSession()}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Delete Debate"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {deleteUndo ? (
        <div className={styles.undoToast} role="status">
          <span>“{deleteUndo.motion}” was removed.</span>
          <button
            type="button"
            onClick={() => void undoDeleteSession()}
            disabled={busy}
          >
            Undo
          </button>
        </div>
      ) : null}
      {renderStageAlignmentModal(null)}
    </main>
  );

  const renderMotionStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.dashboardPanel}`}
      data-debate-dashboard-section="motion"
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>01 / Motion chamber</p>
        <h2>Shape the fault line</h2>
        <p>
          Choose the rules of the room, give Prism the territory, then tune both
          sides until the argument feels genuinely live.
        </p>
      </div>
      <fieldset
        className={styles.formatPicker}
        data-tutorial-target="debate-format"
      >
        <legend>Debate format</legend>
        {DEBATE_FORMAT_CATALOG.map((option) => (
          <label
            key={option.id}
            data-selected={
              option.availability === "available" && format === option.id
                ? "true"
                : undefined
            }
            data-availability={option.availability}
            aria-disabled={
              option.availability === "coming_soon" ? "true" : undefined
            }
            tabIndex={option.availability === "coming_soon" ? 0 : undefined}
          >
            <input
              type="radio"
              name="debate-format"
              value={option.id}
              checked={
                option.availability === "available" && format === option.id
              }
              disabled={option.availability === "coming_soon"}
              onChange={() => {
                if (option.availability !== "available") return;
                setFormat(option.id);
                setRoleChecks([]);
              }}
            />
            <strong>
              {option.name}
              <em>{option.productionName}</em>
            </strong>
            <span>{option.summary}</span>
            <small>{option.cadence}</small>
            {option.availability === "coming_soon" ? (
              <b>Coming later</b>
            ) : null}
          </label>
        ))}
      </fieldset>
      <div className={styles.motionSeed}>
        <label className={styles.field}>
          <span>Territory</span>
          <textarea
            value={topic}
            onChange={(event) => setTopic(event.currentTarget.value)}
            placeholder="Housing near transit, whether art can be separated from its creator…"
            rows={3}
          />
        </label>
        <PrismRefractTarget target={synthesisMagic}>
          {(binding) => (
            <button
              {...binding}
              type="button"
              className={styles.synthesizeButton}
              onClick={() => void synthesize()}
              disabled={!topic.trim() || busy}
              data-tutorial-target="debate-synthesize"
            >
              <span aria-hidden="true">◇</span>
              {busy ? "Refracting…" : "Refract into motions"}
              <small>Create three balanced options</small>
            </button>
          )}
        </PrismRefractTarget>
      </div>
      {slates.length > 0 ? (
        <div className={styles.slateGrid} aria-label="Balanced motion options">
          {slates.map((slate) => (
            <button
              type="button"
              key={slate.id}
              onClick={() => selectSlate(slate)}
              data-selected={motion.id === slate.id ? "true" : undefined}
            >
              <strong>{slate.motion}</strong>
              <span>
                {slate.forSide.label} ↔ {slate.againstSide.label}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.motionEditor}>
        <label className={styles.fieldWide}>
          <span>Motion</span>
          <textarea
            value={motion.motion}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setMotion((current) => ({
                ...current,
                id: "custom-motion",
                motion: value,
              }));
              setRoleChecks([]);
            }}
            rows={3}
          />
        </label>
        {(["for", "against"] as const).map((sideId) => {
          const side = sideId === "for" ? motion.forSide : motion.againstSide;
          return (
            <div className={styles.sideEditor} key={sideId} data-side={sideId}>
              <label className={styles.field}>
                <span>{sideId === "for" ? "For" : "Against"} label</span>
                <input
                  value={side.label}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMotion((current) => ({
                      ...current,
                      id: "custom-motion",
                      [sideId === "for" ? "forSide" : "againstSide"]: {
                        ...side,
                        label: value,
                      },
                    }));
                    setRoleChecks([]);
                  }}
                />
              </label>
              <label className={styles.field}>
                <span>{sideId === "for" ? "For" : "Against"} brief</span>
                <textarea
                  value={side.brief}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setMotion((current) => ({
                      ...current,
                      id: "custom-motion",
                      [sideId === "for" ? "forSide" : "againstSide"]: {
                        ...side,
                        brief: value,
                      },
                    }));
                    setRoleChecks([]);
                  }}
                  rows={5}
                />
              </label>
            </div>
          );
        })}
      </div>
      <div className={styles.panelAdvance}>
        <span>
          {motionComplete
            ? "The motion and both positions are bound."
            : "Complete the motion, labels, and both briefs to continue."}
        </span>
        <button
          type="button"
          onClick={() => setStudioPanel("cast")}
          disabled={!motionComplete}
        >
          Cast the proceeding <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  );

  const renderCastStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.dashboardPanel}`}
      data-debate-dashboard-section="cast"
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>
          02 / {format === "turnabout" ? "Turnabout cast" : "Forum cast"}
        </p>
        <h2>Seat every voice</h2>
        <p>
          Select a seat, cast directly from your Library, then set your place in
          the room. Advocacy consent stays private and motion-specific.
        </p>
      </div>
      <div className={styles.castSlotGrid}>
        {(
          [
            [
              "moderator",
              format === "turnabout" ? "Moderator / Judge" : "Moderator",
            ],
            ["forAdvocate", motion.forSide.label || "For advocate"],
            ["againstAdvocate", motion.againstSide.label || "Against advocate"],
          ] as const
        ).map(([key, label]) => {
          const bot = botById.get(cast[key]) ?? null;
          const accent = bot?.color ?? "#8f7cff";
          return (
            <article
              className={styles.castSlot}
              key={key}
              data-active={activeCastSlot === key ? "true" : undefined}
              data-filled={bot ? "true" : undefined}
              style={{ "--debate-cast-color": accent } as CSSProperties}
            >
              <button
                type="button"
                className={styles.castSlotSelect}
                aria-pressed={activeCastSlot === key}
                onClick={() => setActiveCastSlot(key)}
              >
                <span className={styles.castSlotGlyph} aria-hidden="true">
                  {bot
                    ? props.renderBotGlyph(bot.glyph, {
                        size: 30,
                        strokeWidth: 1.65,
                      })
                    : "◇"}
                </span>
                <span>
                  <small>{label}</small>
                  <strong>{bot?.name ?? "Choose a bot"}</strong>
                  {bot?.hardMuted ? <em>Hard-muted</em> : null}
                </span>
              </button>
              {bot ? (
                <button
                  type="button"
                  className={styles.castSlotClear}
                  aria-label={`Clear ${label}`}
                  onClick={() => clearCastSlot(key)}
                >
                  ×
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
      <div className={styles.castPicker}>
        <BotPickerToolbar
          searchValue={castPickerSearch}
          onSearchChange={setCastPickerSearch}
          searchAriaLabel="Search bots for Debate"
          searchPlaceholder="Search the Library…"
          groups={debatePickerGroups}
          groupValue={effectiveCastPickerGroupId}
          onGroupChange={setCastPickerGroupId}
          resultLabel={`${visibleCastBots.length} bot${visibleCastBots.length === 1 ? "" : "s"}`}
        />
        {visibleCastBots.length > 0 ? (
          <BotPickerGrid
            className={styles.castPickerGrid}
            role="radiogroup"
            ariaLabel={`Bot for ${
              activeCastSlot === "moderator"
                ? "Moderator"
                : activeCastSlot === "forAdvocate"
                  ? motion.forSide.label || "For advocate"
                  : motion.againstSide.label || "Against advocate"
            }`}
            style={
              {
                "--tile-size": "82px",
                "--tile-gap": "9px",
                "--tile-hover-scale": "1.055",
              } as CSSProperties
            }
          >
            {visibleCastBots.map((bot) => {
              const selected = cast[activeCastSlot] === bot.id;
              const otherSlot = (
                ["moderator", "forAdvocate", "againstAdvocate"] as const
              ).find(
                (slot) => slot !== activeCastSlot && cast[slot] === bot.id,
              );
              const disabledReason = otherSlot
                ? "Already cast"
                : activeCastSlot === "moderator" && bot.hardMuted
                  ? "Hard-muted bots cannot moderate"
                  : null;
              return (
                <BotPickerTile
                  key={bot.id}
                  item={{
                    id: bot.id,
                    name: bot.name,
                    color: bot.color,
                    glyph: bot.glyph,
                  }}
                  selected={selected}
                  forceName
                  accentColor={bot.color ?? "#8f7cff"}
                  geometry={{
                    tileSize: 82,
                    glyphSize: 29,
                    glyphStroke: 1.65,
                    namedFlatTile: true,
                  }}
                  renderGlyph={props.renderBotGlyph}
                  className={styles.castPickerTile}
                  buttonProps={{
                    role: "radio",
                    "aria-checked": selected,
                    "aria-label": disabledReason
                      ? `${bot.name}, ${disabledReason}`
                      : `${bot.name}${selected ? ", selected" : ""}`,
                    disabled: Boolean(disabledReason),
                    title: disabledReason ?? undefined,
                    onClick: () => assignBotToCastSlot(activeCastSlot, bot.id),
                  }}
                />
              );
            })}
          </BotPickerGrid>
        ) : (
          <p className={styles.castPickerEmpty}>No bots match this view.</p>
        )}
      </div>
      {moderatorMuted ? (
        <p className={styles.error} role="alert">
          A hard-muted bot cannot moderate. Its Power remains canonical; choose
          another moderator.
        </p>
      ) : null}
      <fieldset className={styles.rolePicker}>
        <legend>Your role</legend>
        {(["judge", "participant", "spectator"] as const).map((role) => (
          <label
            key={role}
            data-selected={playerRole === role ? "true" : undefined}
          >
            <input
              type="radio"
              name="debate-player-role"
              value={role}
              checked={playerRole === role}
              onChange={() => setPlayerRole(role)}
            />
            <strong>{role.charAt(0).toUpperCase() + role.slice(1)}</strong>
            <span>{roleDescription(role, format)}</span>
          </label>
        ))}
      </fieldset>
      {playerRole === "participant" ? (
        <fieldset className={styles.sidePicker}>
          <legend>Your side</legend>
          {(["for", "against"] as const).map((sideId) => (
            <label key={sideId}>
              <input
                type="radio"
                name="participant-side"
                checked={playerSideId === sideId}
                onChange={() => setPlayerSideId(sideId)}
              />
              {sideId === "for"
                ? motion.forSide.label || "For"
                : motion.againstSide.label || "Against"}
            </label>
          ))}
        </fieldset>
      ) : null}
      {roleChecks.length > 0 ? (
        <div className={styles.consentList}>
          {roleChecks.map((check) => {
            const bot = botById.get(check.botId);
            return (
              <article key={check.botId} data-status={check.status}>
                <div>
                  <strong>{bot?.name ?? check.botId}</strong>
                  <span>
                    {check.sideId === "for"
                      ? motion.forSide.label
                      : motion.againstSide.label}
                  </span>
                </div>
                <b>
                  {check.status === "accept"
                    ? "Accepted"
                    : check.status === "devils_advocate"
                      ? "Devil’s Advocate"
                      : "Declined"}
                </b>
                {check.reason ? <p>{check.reason}</p> : null}
              </article>
            );
          })}
        </div>
      ) : null}
      {declinedChecks.length > 0 ? (
        <div className={styles.refusalRecovery}>
          <p>
            A declined assignment cannot be overridden. Preserve the bot’s
            authored boundary.
          </p>
          <div>
            <button type="button" onClick={swapAdvocates}>
              Swap sides
            </button>
            <button type="button" onClick={() => setRoleChecks([])}>
              Change bot
            </button>
            <button type="button" onClick={() => setStudioPanel("motion")}>
              Revise motion
            </button>
          </div>
        </div>
      ) : null}
      <div className={styles.setupActions}>
        <button
          type="button"
          onClick={swapAdvocates}
          disabled={!cast.forAdvocate && !cast.againstAdvocate}
        >
          Swap advocates
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={!castComplete || moderatorMuted || busy}
          onClick={() => {
            if (roleChecksComplete) {
              setStudioPanel("evidence");
              return;
            }
            void checkRoles();
          }}
          data-tutorial-target="debate-consent"
        >
          {busy
            ? "Checking privately…"
            : roleChecksComplete
              ? "Prepare evidence →"
              : "Check advocacy consent"}
        </button>
      </div>
    </section>
  );

  const renderEvidenceStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.dashboardPanel}`}
      data-debate-dashboard-section="evidence"
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>03 / Evidence vault</p>
        <h2>Choose what enters the room</h2>
        <p>
          {format === "turnabout"
            ? "Every participant receives this same immutable packet. When the record opens, only these frozen sources may be presented."
            : "Every participant receives this same immutable packet. When the Forum opens, outside research stops."}
        </p>
      </div>
      <label className={styles.fieldWide}>
        <span>Player notes</span>
        <textarea
          value={evidence.notes}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setEvidence((current) => ({
              ...current,
              notes: value,
            }));
          }}
          placeholder="Facts, definitions, constraints, or context you want all three bots to share."
          rows={8}
        />
      </label>
      <div className={styles.researchBox}>
        <label className={styles.field}>
          <span>Optional Brave Search</span>
          <input
            value={researchQuery}
            onChange={(event) => setResearchQuery(event.currentTarget.value)}
            placeholder="Search for frozen public evidence"
            disabled={props.responseMode === "local"}
          />
        </label>
        <div className={styles.researchActions}>
          <button
            type="button"
            onClick={() => void research()}
            disabled={
              props.responseMode === "local" || !researchQuery.trim() || busy
            }
          >
            Search once
          </button>
          <button
            type="button"
            className={styles.generateEvidenceButton}
            onClick={() => void generateEvidence()}
            disabled={
              props.responseMode === "local" || !motion.motion.trim() || busy
            }
            aria-label="Generate randomized evidence from the current motion"
          >
            <span aria-hidden="true">◇</span>
            {evidenceGenerating ? "Generating…" : "Generate evidence"}
          </button>
        </div>
        {props.responseMode === "local" ? (
          <p>
            LOCAL blocks Brave before network access. Manual and generated
            research stay unavailable; player notes remain local.
          </p>
        ) : (
          <p>
            Search manually, or let Prism vary a real-source query from the
            current motion. Nothing is fabricated; research ends permanently
            when the Duel starts.
          </p>
        )}
      </div>
      {evidence.sources.length > 0 ? (
        <ul className={styles.evidenceList}>
          {evidence.sources.map((source) => (
            <li key={source.id}>
              <button
                type="button"
                onClick={() => setSourceDrawerId(source.id)}
              >
                <span>{source.id}</span>
                <strong>{source.title}</strong>
                <small>{source.snippet}</small>
              </button>
              <button
                type="button"
                aria-label={`Remove ${source.title}`}
                onClick={() =>
                  setEvidence((current) => ({
                    ...current,
                    sources: current.sources.filter(
                      (candidate) => candidate.id !== source.id,
                    ),
                  }))
                }
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={styles.packetSeal}>
        <span aria-hidden="true">◇</span>
        <div>
          <strong>
            {evidence.sources.length > 0 || evidence.notes.trim()
              ? "Packet staged"
              : "Empty packet staged"}
          </strong>
          <small>
            {evidence.sources.length} frozen source
            {evidence.sources.length === 1 ? "" : "s"} ·{" "}
            {evidence.notes.trim() ? "notes included" : "no player notes"}
          </small>
        </div>
        <b>Seals at Start</b>
      </div>
    </section>
  );

  const renderReviewStep = (): React.JSX.Element => (
    <section
      className={`${styles.setupPanel} ${styles.readinessPanel}`}
      data-tutorial-target="debate-readiness"
      data-ready={debateCanStart ? "true" : undefined}
      data-ready-count={readinessCount}
    >
      <div className={styles.setupCopy}>
        <p className={styles.eyebrow}>Launch circuit</p>
        <h2>
          {debateCanStart
            ? format === "turnabout"
              ? "The record is ready"
              : "The Forum is ready"
            : "Complete the circuit"}
        </h2>
        <p>
          Start locks the format, motion, cast, consent, model, Powers, and
          evidence into one proceeding.
        </p>
      </div>
      <ul className={styles.readinessList}>
        <li data-ready={motionComplete ? "true" : undefined}>
          <span aria-hidden="true">{motionComplete ? "✓" : "1"}</span>
          <div>
            <strong>Motion shaped</strong>
            <small>
              {motionComplete
                ? "Both positions have a clear brief."
                : "Complete the motion, labels, and briefs."}
            </small>
          </div>
        </li>
        <li data-ready={castComplete && !moderatorMuted ? "true" : undefined}>
          <span aria-hidden="true">
            {castComplete && !moderatorMuted ? "✓" : "2"}
          </span>
          <div>
            <strong>Proceeding cast</strong>
            <small>
              {castComplete && !moderatorMuted
                ? "Three unique seats are filled."
                : moderatorMuted
                  ? "Choose an audible moderator."
                  : "Fill all three seats with unique bots."}
            </small>
          </div>
        </li>
        <li data-ready={roleChecksComplete ? "true" : undefined}>
          <span aria-hidden="true">{roleChecksComplete ? "✓" : "3"}</span>
          <div>
            <strong>Advocacy consent</strong>
            <small>
              {roleChecksComplete
                ? "Both advocates accepted their roles."
                : declinedChecks.length > 0
                  ? "Resolve the declined assignment."
                  : "Run the private role check."}
            </small>
          </div>
        </li>
        <li data-ready="true">
          <span aria-hidden="true">✓</span>
          <div>
            <strong>Evidence packet</strong>
            <small>
              {evidence.sources.length > 0 || evidence.notes.trim()
                ? `${evidence.sources.length} source${evidence.sources.length === 1 ? "" : "s"} and player notes will freeze at Start.`
                : "Evidence is optional; the empty packet will freeze at Start."}
            </small>
          </div>
        </li>
      </ul>
      <div className={styles.reviewGrid}>
        <article>
          <span>Format</span>
          <strong>
            {format === "turnabout"
              ? "Turnabout · Court of Record"
              : "Forum · Assembly Chamber"}
          </strong>
          <p>
            {format === "turnabout"
              ? "Pressable testimony and frozen-evidence objections"
              : "Structured civic speech and rebuttal"}
          </p>
        </article>
        <article>
          <span>Motion</span>
          <strong>{motion.motion}</strong>
          <p>
            {motion.forSide.label} ↔ {motion.againstSide.label}
          </p>
        </article>
        <article>
          <span>Cast</span>
          <strong>{botById.get(cast.moderator)?.name} · Moderator</strong>
          <p>
            {botById.get(cast.forAdvocate)?.name} vs.{" "}
            {botById.get(cast.againstAdvocate)?.name}
          </p>
        </article>
        <article>
          <span>Your role</span>
          <strong>
            {playerRole.charAt(0).toUpperCase() + playerRole.slice(1)}
          </strong>
          <p>
            {playerRole === "participant"
              ? `Speaking for ${
                  playerSideId === "for"
                    ? motion.forSide.label
                    : motion.againstSide.label
                }`
              : roleSummary(playerRole, format)}
          </p>
        </article>
        <article>
          <span>Evidence</span>
          <strong>
            {evidence.sources.length} source
            {evidence.sources.length === 1 ? "" : "s"}
          </strong>
          <p>{evidence.notes ? "Player notes included" : "No player notes"}</p>
        </article>
      </div>
      {roleChecks.some((check) => check.status === "devils_advocate") ? (
        <p className={styles.devilsNotice}>
          Devil’s Advocate framing will appear as one brief moderator
          disclosure. It never changes the bot’s saved identity.
        </p>
      ) : null}
      {mutedAdvocates.length > 0 ? (
        <p className={styles.warning} role="alert">
          {mutedAdvocates.map((bot) => bot.name).join(" and ")}{" "}
          {mutedAdvocates.length === 1 ? "is" : "are"} hard-muted. Their
          scheduled floor remains canonical silence, and private ballots expose
          no spoken reason.
        </p>
      ) : null}
      <div className={styles.setupActions}>
        <span className={styles.launchThreshold}>
          {debateCanStart
            ? "Crossing this threshold freezes the record."
            : `${4 - readinessCount} lock${4 - readinessCount === 1 ? "" : "s"} remain.`}
        </span>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={busy || !debateCanStart}
          onClick={() => void startDebate()}
          data-tutorial-target="debate-start"
        >
          {busy
            ? format === "turnabout"
              ? "Opening the record…"
              : "Opening the Forum…"
            : format === "turnabout"
              ? "Start Turnabout"
              : "Start Forum"}
        </button>
      </div>
    </section>
  );

  const renderTurnaboutRecord = (
    session: DebateSessionV1,
  ): React.JSX.Element => {
    const state =
      session.formatState.format === "turnabout" ? session.formatState : null;
    return (
      <aside
        className={`${styles.caseBoard} ${styles.turnaboutRecord}`}
        aria-label="Turnabout public record"
        data-tutorial-target="debate-case-board"
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Public record</p>
            <span>Statement-bound · frozen evidence only</span>
          </div>
          <strong>Reversal {state ? Math.max(0, state.round - 1) : 0}</strong>
        </header>
        <div className={styles.caseColumns}>
          {(["for", "against"] as const).map((sideId) => (
            <section key={sideId} data-side={sideId}>
              <h2>
                {sideId === "for"
                  ? session.motion.forSide.label
                  : session.motion.againstSide.label}
              </h2>
              <ol>
                {(state?.statements ?? [])
                  .filter((statement) => statement.sideId === sideId)
                  .map((statement, index) => (
                    <li
                      key={statement.id}
                      data-status={statement.status}
                      data-active={
                        state?.activeStatementId === statement.id
                          ? "true"
                          : undefined
                      }
                    >
                      <span>Statement {index + 1}</span>
                      <p>{debateSpokenText(statement.content)}</p>
                      <div>
                        <small>{statement.status}</small>
                        {statement.sourceIds.map((id) => (
                          <button
                            type="button"
                            key={id}
                            className={styles.sourceChip}
                            onClick={() => setSourceDrawerId(id)}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
              </ol>
            </section>
          ))}
        </div>
        {state && state.contradictions.length > 0 ? (
          <footer>
            {state.contradictions.map((contradiction) => (
              <span key={contradiction.id} data-ruling={contradiction.ruling}>
                {contradiction.ruling} · {contradiction.evidenceSourceId}
              </span>
            ))}
          </footer>
        ) : null}
      </aside>
    );
  };

  const renderCaseBoard = (session: DebateSessionV1): React.JSX.Element => {
    const visibleBoard = debateCaseBoardAtSequence(
      session,
      transcriptVisibleThroughSequence,
    );
    return (
      <aside
        className={styles.caseBoard}
        aria-label="Living case board"
        data-tutorial-target="debate-case-board"
      >
        <header>
          <p className={styles.eyebrow}>Living case board</p>
          <span>Scoreless · heard speech only</span>
        </header>
        <div className={styles.caseColumns}>
          {(["for", "against"] as const).map((sideId) => (
            <section key={sideId} data-side={sideId}>
              <h2>
                {sideId === "for"
                  ? session.motion.forSide.label
                  : session.motion.againstSide.label}
              </h2>
              <ul>
                {visibleBoard
                  .filter((card) => card.sideId === sideId)
                  .map((card) => (
                    <li key={card.id} data-status={card.status}>
                      <span>{card.status}</span>
                      <p>{card.summary}</p>
                      <div>
                        {card.sourceIds.map((id) => (
                          <button
                            type="button"
                            key={id}
                            className={styles.sourceChip}
                            onClick={() => setSourceDrawerId(id)}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </aside>
    );
  };

  const renderPlayerWindow = (
    session: DebateSessionV1,
  ): React.JSX.Element | null => {
    if (session.status !== "waiting_for_player") return null;
    if (
      session.stepKey === "verdict_player" ||
      session.stepKey === "turnabout_verdict_player"
    ) {
      return (
        <div className={styles.playerWindow} data-kind="verdict">
          <p className={styles.eyebrow}>Your ruling is final</p>
          <h2>Which side carried the motion?</h2>
          <textarea
            value={playerDraft}
            onChange={(event) => setPlayerDraft(event.currentTarget.value)}
            placeholder="Optional reason for your ruling"
            rows={3}
          />
          <div>
            <button
              type="button"
              data-side="for"
              onClick={() => void submitVerdict("for")}
              disabled={busy}
            >
              {session.motion.forSide.label}
            </button>
            <button
              type="button"
              data-side="against"
              onClick={() => void submitVerdict("against")}
              disabled={busy}
            >
              {session.motion.againstSide.label}
            </button>
          </div>
        </div>
      );
    }
    if (
      session.stepKey === "turnabout_action" &&
      session.formatState.format === "turnabout"
    ) {
      const state: DebateTurnaboutFormatStateV1 = session.formatState;
      const statement: DebateTurnaboutStatementV1 | null =
        state.statements.find(
          (candidate) => candidate.id === state.activeStatementId,
        ) ?? null;
      if (!statement) return null;
      const speaker =
        statement.speakerBotId === session.forAdvocate.id
          ? session.forAdvocate
          : session.againstAdvocate;
      return (
        <section
          className={`${styles.playerWindow} ${styles.turnaboutActions}`}
          data-kind="turnabout"
          data-tutorial-target="debate-turnabout-actions"
        >
          <div>
            <p className={styles.eyebrow}>Statement on the record</p>
            <h2>Examine {speaker.name}</h2>
            <blockquote>{debateSpokenText(statement.content)}</blockquote>
          </div>
          {turnaboutObjecting ? (
            <fieldset className={styles.turnaboutEvidencePicker}>
              <legend>Object with frozen evidence</legend>
              {session.evidence.sources.length > 0 ? (
                session.evidence.sources.map((source) => (
                  <label
                    key={source.id}
                    data-selected={
                      turnaboutEvidenceSourceId === source.id
                        ? "true"
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="turnabout-evidence"
                      value={source.id}
                      checked={turnaboutEvidenceSourceId === source.id}
                      onChange={() => setTurnaboutEvidenceSourceId(source.id)}
                    />
                    <strong>{source.title}</strong>
                    <span>{source.snippet}</span>
                    <small>{source.id}</small>
                  </label>
                ))
              ) : (
                <p>
                  No evidence item was frozen before Start. You can still Press
                  or Pass.
                </p>
              )}
            </fieldset>
          ) : null}
          <div className={styles.turnaboutActionRow}>
            <button
              type="button"
              onClick={() => void submitTurnaboutAction("press", statement.id)}
              disabled={busy || statement.status !== "ready"}
            >
              Press
            </button>
            <button
              type="button"
              aria-pressed={turnaboutObjecting}
              onClick={() => setTurnaboutObjecting((current) => !current)}
              disabled={busy || session.evidence.sources.length === 0}
            >
              Object
            </button>
            {turnaboutObjecting ? (
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() =>
                  void submitTurnaboutAction("present_evidence", statement.id)
                }
                disabled={busy || !turnaboutEvidenceSourceId}
              >
                Present Evidence
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void submitTurnaboutAction("pass", statement.id)}
              disabled={busy}
            >
              Pass
            </button>
          </div>
        </section>
      );
    }
    return (
      <form className={styles.playerWindow} onSubmit={submitPlayerTurn}>
        <p className={styles.eyebrow}>Your floor</p>
        <h2>
          {session.stepKey === "challenge_judge_question"
            ? "Ask one side a question"
            : session.phase === "challenge"
              ? "Answer the moderator’s challenge"
              : "Deliver your rebuttal"}
        </h2>
        {session.stepKey === "challenge_judge_question" ? (
          <div className={styles.targetToggle}>
            {(["for", "against"] as const).map((sideId) => (
              <label key={sideId}>
                <input
                  type="radio"
                  checked={judgeTarget === sideId}
                  onChange={() => setJudgeTarget(sideId)}
                />
                {sideId === "for"
                  ? session.motion.forSide.label
                  : session.motion.againstSide.label}
              </label>
            ))}
          </div>
        ) : null}
        <textarea
          value={playerDraft}
          onChange={(event) => setPlayerDraft(event.currentTarget.value)}
          placeholder="Speak plainly. You can cite frozen evidence with [[source:id]]."
          rows={4}
          autoFocus
        />
        <div>
          <button
            type="button"
            onClick={() => void passPlayerTurn()}
            disabled={busy}
          >
            {session.stepKey === "challenge_judge_question"
              ? "Pass question"
              : session.playerRole === "participant"
                ? "Pass to partner"
                : "Pass"}
          </button>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={busy || !playerDraft.trim()}
          >
            Commit turn
          </button>
        </div>
      </form>
    );
  };

  const renderTranscript = (session: DebateSessionV1): React.JSX.Element => (
    <section className={styles.transcript} aria-label="Debate transcript">
      <header className={styles.transcriptHeader}>
        <div>
          <p className={styles.eyebrow}>Proceedings</p>
          <span>Public floor · source-linked</span>
        </div>
        <button
          type="button"
          data-tutorial-target="debate-copy-transcript"
          onClick={() => void copyVerboseTranscript()}
          disabled={transcriptCopyState === "copying"}
        >
          {transcriptCopyState === "copying"
            ? "Copying…"
            : transcriptCopyState === "copied"
              ? "Copied"
              : transcriptCopyState === "failed"
                ? "Copy failed"
                : "Copy verbose transcript"}
        </button>
      </header>
      <div
        ref={transcriptFeedRef}
        className={styles.transcriptFeed}
        role="log"
        aria-label="Live Debate proceedings"
        aria-relevant="additions"
        tabIndex={0}
        onWheelCapture={(event) => {
          if (event.deltaY >= 0) return;
          transcriptUserOwnsViewportRef.current = true;
          transcriptAutoFollowRef.current = false;
          setTranscriptAtLive(false);
        }}
        onTouchStart={(event) => {
          transcriptTouchYRef.current = event.touches[0]?.clientY ?? null;
        }}
        onTouchMove={(event) => {
          const previousY = transcriptTouchYRef.current;
          const nextY = event.touches[0]?.clientY ?? null;
          transcriptTouchYRef.current = nextY;
          if (previousY === null || nextY === null || nextY <= previousY) {
            return;
          }
          transcriptUserOwnsViewportRef.current = true;
          transcriptAutoFollowRef.current = false;
          setTranscriptAtLive(false);
        }}
        onKeyDown={(event) => {
          if (!["ArrowUp", "PageUp", "Home"].includes(event.key)) return;
          transcriptUserOwnsViewportRef.current = true;
          transcriptAutoFollowRef.current = false;
          setTranscriptAtLive(false);
        }}
        onScroll={(event) => {
          const feed = event.currentTarget;
          const atLive = debateTranscriptIsAtLive(feed);
          if (atLive) {
            transcriptAutoFollowRef.current = true;
            transcriptUserOwnsViewportRef.current = false;
            setTranscriptAtLive(true);
          } else if (transcriptUserOwnsViewportRef.current) {
            transcriptAutoFollowRef.current = false;
            setTranscriptAtLive(false);
          }
        }}
      >
        <div ref={transcriptContentRef} className={styles.transcriptContent}>
          {session.events
            .filter(
              (event) =>
                DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS.has(event.kind) &&
                (transcriptVisibleThroughSequence === null ||
                  event.sequence <= transcriptVisibleThroughSequence),
            )
            .map((event) => {
              const streaming = liveReveal?.eventId === event.id;
              const content = streaming
                ? liveReveal.visibleContent
                : event.content;
              return (
                <article
                  key={event.id}
                  data-kind={event.kind}
                  data-side={event.sideId ?? undefined}
                  data-streaming={streaming ? "true" : undefined}
                >
                  <header>
                    <strong>{visibleEventName(session, event)}</strong>
                    <span>
                      {event.interrupted
                        ? "interrupted"
                        : event.kind.replace("_", " ")}{" "}
                      · {event.phase}
                    </span>
                  </header>
                  {content ? (
                    <DebateMarkdownBody
                      content={content}
                      evidence={session.evidence}
                      onSource={setSourceDrawerId}
                    />
                  ) : (
                    <span
                      className={styles.liveProseCursor}
                      aria-label="Speaker is beginning"
                    />
                  )}
                </article>
              );
            })}
          {busy ? (
            <div className={styles.turnPending} role="status">
              <span />
              <span />
              <span />
              {session.format === "turnabout"
                ? "The record is preparing the next action"
                : "The Forum is preparing the next turn"}
            </div>
          ) : null}
        </div>
      </div>
      {!transcriptAtLive ? (
        <button
          type="button"
          className={styles.returnToLiveButton}
          onClick={clampTranscriptToLive}
        >
          ↓ Live
        </button>
      ) : null}
    </section>
  );

  const renderGallery = (session: DebateSessionV1): React.JSX.Element => {
    const latestPublicEvent =
      (presentationEventId
        ? session.events.find((event) => event.id === presentationEventId)
        : null) ??
      [...session.events]
        .reverse()
        .find((event) =>
          DEBATE_VISIBLE_TRANSCRIPT_EVENT_KINDS.has(event.kind),
        ) ??
      null;
    const latestPublicContent =
      latestPublicEvent && liveReveal?.eventId === latestPublicEvent.id
        ? liveReveal.visibleContent
        : (latestPublicEvent?.content ?? "");
    const reaction = debateGalleryReaction(latestPublicContent);
    const reactingIndices = new Set(
      latestPublicEvent
        ? debateGalleryReactingIndices(
            latestPublicContent,
            latestPublicEvent.sequence,
          )
        : [],
    );
    const pulse =
      session.status === "completed"
        ? "The gallery settles as the verdict lands."
        : reaction === "evidence"
          ? "A frozen source catches the room’s attention."
          : reaction === "concession"
            ? "A few prisms soften at the concession."
            : reaction === "question"
              ? "The gallery sharpens around the question."
              : reaction === "divided"
                ? "The room divides along the claim."
                : "The gallery follows the floor.";
    return (
      <aside
        className={styles.audienceGallery}
        aria-label="Nonbinding gallery sample"
        data-phase={session.phase}
        data-reaction={reaction}
      >
        <header>
          <div>
            <p className={styles.eyebrow}>Gallery sample</p>
            <span>7 of many · nonbinding</span>
          </div>
          <small>Session-only reactions</small>
        </header>
        <div className={styles.audienceSeats} aria-hidden="true">
          {DEBATE_GALLERY_COLORS.map((color, index) => (
            <span
              className={styles.audiencePrism}
              data-reacting={reactingIndices.has(index) ? "true" : undefined}
              key={color}
              style={{ "--gallery-prism-color": color } as CSSProperties}
            >
              {props.renderBotGlyph("lucideTriangle", {
                size: 24,
                strokeWidth: 1.5,
              })}
            </span>
          ))}
        </div>
        <p>{pulse}</p>
      </aside>
    );
  };

  const renderStageAlignmentModal = (
    session: DebateSessionV1 | null,
  ): React.JSX.Element | null => {
    if (!stageAlignmentOpen) return null;
    if (!session && !dashboardAlignmentPreviewCast) return null;
    const alignmentMotion = session?.motion ?? motion;
    const forBot =
      session?.forAdvocate ??
      debateAlignmentPreviewSnapshot(
        dashboardAlignmentPreviewCast!.forAdvocate,
        "advocate",
        "for",
      );
    const moderatorBot =
      session?.moderator ??
      debateAlignmentPreviewSnapshot(
        dashboardAlignmentPreviewCast!.moderator,
        "moderator",
        null,
      );
    const againstBot =
      session?.againstAdvocate ??
      debateAlignmentPreviewSnapshot(
        dashboardAlignmentPreviewCast!.againstAdvocate,
        "advocate",
        "against",
      );
    const alignmentCast = [
      {
        role: "for" as const,
        bot: forBot,
        roleLabel: alignmentMotion.forSide.label.trim() || "For",
      },
      {
        role: "moderator" as const,
        bot: moderatorBot,
        roleLabel:
          session?.format === "turnabout" ? "Moderator / Judge" : "Moderator",
      },
      {
        role: "against" as const,
        bot: againstBot,
        roleLabel: alignmentMotion.againstSide.label.trim() || "Against",
      },
    ].map((entry) => {
      const presentation = session
        ? debateBotPresentation(session, entry.bot)
        : {
            displayName: entry.bot.name,
            identityLabel: null,
            glyph: entry.bot.glyph,
            voiceSourceBotId: entry.bot.id,
            visibility: "visible" as const,
            scale: "normal" as const,
            colorCycle: false,
          };
      return { ...entry, presentation };
    });
    const interactiveAlignmentCast =
      stageAlignmentPreviewCamera === "moderator"
        ? alignmentCast.filter((entry) => entry.role === "moderator")
        : alignmentCast;
    const previewTargets: readonly DebateStageAlignmentTarget[] =
      stageAlignmentPreviewCamera === "moderator"
        ? DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) =>
            debateStageAlignmentTarget("moderator", item, "moderator"),
          )
        : DEBATE_STAGE_ALIGNMENT_ROLES.flatMap((role) =>
            DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) =>
              debateStageAlignmentTarget(role, item, "wide"),
            ),
          );
    const previewIsDefault = previewTargets.every((target) => {
      const offset = debateStageAlignmentOffset(stageAlignmentDraft, target);
      return offset.x === 0 && offset.y === 0;
    });
    const lightBlendModesAreDefault = (["dark", "light"] as const).every(
      (theme) =>
        stageAlignmentDraft.lightBlendModes[theme] ===
        DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes[theme],
    );
    return (
      <div
        className={styles.alignmentModalBackdrop}
        data-preview-theme={stageAlignmentPreviewTheme}
        data-alignment-source={session ? "session" : "dashboard"}
      >
        <section
          className={styles.alignmentModal}
          role="dialog"
          aria-modal="true"
          aria-labelledby="debate-stage-alignment-title"
          data-debate-stage-alignment-modal="true"
        >
          <header className={styles.alignmentModalHeader}>
            <div>
              <span className={styles.eyebrow}>Stage placement</span>
              <h2 id="debate-stage-alignment-title">
                Align the Prismatic Forum
              </h2>
              <p>
                {session
                  ? "Calibrate the three frozen roles once for this account and device."
                  : "Calibrate the Forum at any time. The current draft cast is shown; empty roles use temporary Library stand-ins."}
              </p>
            </div>
            <div>
              <button
                type="button"
                data-debate-stage-alignment-copy="true"
                data-copy-state={stageAlignmentCopyState}
                onClick={() => void copyStageAlignmentData()}
                disabled={stageAlignmentCopyState === "copying"}
              >
                {stageAlignmentCopyState === "copying"
                  ? "Copying…"
                  : stageAlignmentCopyState === "copied"
                    ? "Copied"
                    : stageAlignmentCopyState === "failed"
                      ? "Copy failed"
                      : "Copy alignment data"}
              </button>
              <button type="button" onClick={cancelStageAlignment}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.alignmentSaveButton}
                ref={stageAlignmentSaveButtonRef}
                onClick={saveStageAlignment}
              >
                Save alignment
              </button>
            </div>
          </header>
          <div className={styles.alignmentModalBody}>
            <div className={styles.alignmentEditorHeader}>
              <p>
                {stageAlignmentPreviewCamera === "moderator"
                  ? "Align the moderator bot, nameplate, and glyph plate independently from Wide."
                  : "Align every bot, nameplate, and glyph plate in the wide Forum without changing the moderator close-up."}{" "}
                Drag an item or use arrow keys to nudge by 0.5%; hold Shift for
                2%. Select the active item in the exact controls below.
              </p>
              <div>
                <div
                  className={styles.alignmentViewToggle}
                  role="group"
                  aria-label="Debate alignment preview camera"
                >
                  {(["wide", "moderator"] as const).map((previewCamera) => (
                    <button
                      type="button"
                      aria-pressed={
                        stageAlignmentPreviewCamera === previewCamera
                      }
                      onClick={() =>
                        setStageAlignmentPreviewCamera(previewCamera)
                      }
                      key={previewCamera}
                    >
                      {previewCamera === "wide" ? "Wide" : "Moderator"}
                    </button>
                  ))}
                </div>
                <div
                  className={styles.alignmentThemeToggle}
                  role="group"
                  aria-label="Debate alignment preview theme"
                >
                  {(["light", "dark"] as const).map((previewTheme) => (
                    <button
                      type="button"
                      aria-pressed={stageAlignmentPreviewTheme === previewTheme}
                      onClick={() =>
                        setStageAlignmentPreviewTheme(previewTheme)
                      }
                      key={previewTheme}
                    >
                      {previewTheme === "light" ? "Light" : "Dark"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setStageAlignmentDraft((current) =>
                      stageAlignmentPreviewCamera === "moderator"
                        ? normalizeDebateStageAlignment({
                            ...current,
                            moderator: DEFAULT_DEBATE_STAGE_ALIGNMENT.moderator,
                          })
                        : normalizeDebateStageAlignment({
                            ...current,
                            wide: DEFAULT_DEBATE_STAGE_ALIGNMENT.wide,
                          }),
                    )
                  }
                  disabled={previewIsDefault}
                >
                  {stageAlignmentPreviewCamera === "moderator"
                    ? "Reset moderator"
                    : "Reset positions"}
                </button>
              </div>
            </div>
            <div className={styles.alignmentViewportColumn}>
              <div
                className={`${styles.live} ${styles.alignmentPreviewThemeScope}`}
                data-theme={stageAlignmentPreviewTheme}
                style={
                  {
                    "--debate-active-color": "#9c8cff",
                    "--debate-for-color": forBot.color ?? "#42d9ff",
                    "--debate-against-color": againstBot.color ?? "#ff5f8f",
                    "--debate-moderator-color": moderatorBot.color ?? "#d9d2ff",
                  } as CSSProperties
                }
              >
                <div
                  className={`${styles.forum} ${styles.alignmentForum}`}
                  data-debate-alignment-stage="true"
                  data-debate-stage-viewport="alignment"
                >
                  <div
                    className={styles.forumCamera}
                    data-camera-view={stageAlignmentPreviewCamera}
                    style={debateStageAlignmentStyle(stageAlignmentDraft)}
                  >
                    <div className={styles.receiverMatte} aria-hidden="true" />
                    <DebateForumLightMasks />
                    {interactiveAlignmentCast.map(
                      ({ role, bot, presentation }) => {
                        const appearanceBot = session
                          ? (debateBotSnapshot(
                              session,
                              presentation.voiceSourceBotId,
                            ) ?? bot)
                          : bot;
                        const target = stageAlignmentTargetForRole(role, "bot");
                        return (
                          <div
                            className={`${styles.botPosition} ${styles.alignmentHandle}`}
                            data-role={role}
                            data-dragging={
                              stageAlignmentDraggingTarget === target
                                ? "true"
                                : undefined
                            }
                            data-selected={
                              stageAlignmentSelectedItems[role] === "bot"
                                ? "true"
                                : undefined
                            }
                            data-alignment-item="bot"
                            role="button"
                            tabIndex={0}
                            aria-label={`Move ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} bot. Use arrow keys to nudge.`}
                            onPointerDown={(event) =>
                              beginStageAlignmentDrag(event, role, "bot")
                            }
                            onPointerMove={moveStageAlignmentDrag}
                            onPointerUp={finishStageAlignmentDrag}
                            onPointerCancel={finishStageAlignmentDrag}
                            onKeyDown={(event) =>
                              nudgeStageAlignmentItem(event, role, "bot")
                            }
                            key={`alignment-avatar:${bot.id}`}
                          >
                            <div
                              className={styles.botStagePresence}
                              data-scale={presentation.scale}
                            >
                              {props.renderBotAvatar ? (
                                props.renderBotAvatar(appearanceBot, {
                                  role,
                                  lookAtRole: null,
                                  compact:
                                    role === "moderator" &&
                                    stageAlignmentPreviewCamera !== "moderator",
                                  talking: false,
                                  thinking: false,
                                  colorCycle: presentation.colorCycle,
                                  speechTiming: null,
                                  foleyMouthShape: null,
                                  listenerReaction: null,
                                })
                              ) : (
                                <span className={styles.botGlyphFallback}>
                                  {props.renderBotGlyph(presentation.glyph, {
                                    size: 42,
                                    strokeWidth: 1.35,
                                  })}
                                </span>
                              )}
                            </div>
                            <span className={styles.alignmentHandleLabel}>
                              {DEBATE_STAGE_ALIGNMENT_LABELS[role]} · Bot
                            </span>
                          </div>
                        );
                      },
                    )}
                    <div
                      className={styles.podiumForeground}
                      aria-hidden="true"
                    />
                    {interactiveAlignmentCast.map(
                      ({ role, bot, presentation }) => {
                        const target = stageAlignmentTargetForRole(
                          role,
                          "glyph",
                        );
                        return (
                          <div
                            className={`${styles.podiumGlyphPosition} ${styles.alignmentHandle}`}
                            data-role={role}
                            data-visibility={presentation.visibility}
                            data-dragging={
                              stageAlignmentDraggingTarget === target
                                ? "true"
                                : undefined
                            }
                            data-selected={
                              stageAlignmentSelectedItems[role] === "glyph"
                                ? "true"
                                : undefined
                            }
                            data-alignment-item="glyph"
                            role="button"
                            tabIndex={0}
                            aria-label={`Move ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} glyph plate. Use arrow keys to nudge.`}
                            onPointerDown={(event) =>
                              beginStageAlignmentDrag(event, role, "glyph")
                            }
                            onPointerMove={moveStageAlignmentDrag}
                            onPointerUp={finishStageAlignmentDrag}
                            onPointerCancel={finishStageAlignmentDrag}
                            onKeyDown={(event) =>
                              nudgeStageAlignmentItem(event, role, "glyph")
                            }
                            key={`alignment-podium-glyph:${bot.id}`}
                          >
                            <span className={styles.podiumGlyphScreen}>
                              <span className={styles.podiumGlyphMark}>
                                {props.renderBotGlyph(presentation.glyph, {
                                  size: 48,
                                  strokeWidth: 1.5,
                                })}
                              </span>
                            </span>
                            <span className={styles.alignmentHandleLabel}>
                              {DEBATE_STAGE_ALIGNMENT_LABELS[role]} · Glyph
                            </span>
                          </div>
                        );
                      },
                    )}
                    {interactiveAlignmentCast.map(
                      ({ role, bot, presentation, roleLabel }) => {
                        const target = stageAlignmentTargetForRole(
                          role,
                          "nameplate",
                        );
                        return (
                          <div
                            className={`${styles.botIdentityPosition} ${styles.alignmentHandle}`}
                            data-role={role}
                            data-dragging={
                              stageAlignmentDraggingTarget === target
                                ? "true"
                                : undefined
                            }
                            data-selected={
                              stageAlignmentSelectedItems[role] === "nameplate"
                                ? "true"
                                : undefined
                            }
                            data-alignment-item="nameplate"
                            role="button"
                            tabIndex={0}
                            aria-label={`Move ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} nameplate. Use arrow keys to nudge.`}
                            onPointerDown={(event) =>
                              beginStageAlignmentDrag(event, role, "nameplate")
                            }
                            onPointerMove={moveStageAlignmentDrag}
                            onPointerUp={finishStageAlignmentDrag}
                            onPointerCancel={finishStageAlignmentDrag}
                            onKeyDown={(event) =>
                              nudgeStageAlignmentItem(event, role, "nameplate")
                            }
                            key={`alignment-identity:${bot.id}`}
                          >
                            <div className={styles.botIdentityPlate}>
                              <strong>{presentation.displayName}</strong>
                              <small>{roleLabel}</small>
                            </div>
                            <span className={styles.alignmentHandleLabel}>
                              {DEBATE_STAGE_ALIGNMENT_LABELS[role]} · Nameplate
                            </span>
                          </div>
                        );
                      },
                    )}
                    <div className={styles.motionPlinth}>
                      <span>The motion</span>
                      <strong>
                        {alignmentMotion.motion.trim() ||
                          "Your next motion will appear here."}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>
              <section
                className={styles.alignmentLightingTuner}
                aria-label="Debate light color blend modes"
              >
                <header>
                  <div>
                    <span className={styles.eyebrow}>Color blend</span>
                    <strong>Architectural bounce</strong>
                  </div>
                  <button
                    type="button"
                    disabled={lightBlendModesAreDefault}
                    onClick={() =>
                      setStageAlignmentDraft((current) =>
                        normalizeDebateStageAlignment({
                          ...current,
                          lightBlendModes:
                            DEFAULT_DEBATE_STAGE_ALIGNMENT.lightBlendModes,
                        }),
                      )
                    }
                  >
                    Reset
                  </button>
                </header>
                <div className={styles.alignmentLightingTunerRows}>
                  {(["dark", "light"] as const).map((theme) => {
                    const label = theme === "dark" ? "Dark" : "Light";
                    return (
                      <div
                        className={styles.alignmentLightingTunerRow}
                        data-active={
                          stageAlignmentPreviewTheme === theme
                            ? "true"
                            : undefined
                        }
                        key={theme}
                      >
                        <strong>{label}</strong>
                        <div
                          className={styles.alignmentLightingBlendToggle}
                          role="group"
                          aria-label={`${label} Debate light blend mode`}
                        >
                          {DEBATE_STAGE_LIGHT_BLEND_MODES.map((blendMode) => (
                            <button
                              type="button"
                              aria-pressed={
                                stageAlignmentDraft.lightBlendModes[theme] ===
                                blendMode
                              }
                              onClick={() => {
                                setStageAlignmentPreviewTheme(theme);
                                setStageAlignmentDraft((current) =>
                                  updateDebateStageLightBlendMode(
                                    current,
                                    theme,
                                    blendMode,
                                  ),
                                );
                              }}
                              key={blendMode}
                            >
                              {blendMode === "screen" ? "Screen" : "Overlay"}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <small>
                  Saved separately for Light and Dark on this account and
                  device.
                </small>
              </section>
              <section
                className={styles.alignmentTuner}
                aria-label="Debate stage position controls"
                data-camera-view={stageAlignmentPreviewCamera}
              >
                {interactiveAlignmentCast.map(({ role, bot }) => {
                  const selectedItem = stageAlignmentSelectedItems[role];
                  const target = stageAlignmentTargetForRole(
                    role,
                    selectedItem,
                  );
                  const offset = debateStageAlignmentOffset(
                    stageAlignmentDraft,
                    target,
                  );
                  return (
                    <div className={styles.alignmentTunerRole} key={role}>
                      <header>
                        <div>
                          <span>{DEBATE_STAGE_ALIGNMENT_LABELS[role]}</span>
                          <strong>{bot.name}</strong>
                        </div>
                        <button
                          type="button"
                          disabled={offset.x === 0 && offset.y === 0}
                          aria-label={`Reset ${DEBATE_STAGE_ALIGNMENT_LABELS[role]} ${DEBATE_STAGE_ALIGNMENT_ITEM_LABELS[selectedItem].toLowerCase()} position`}
                          onClick={() =>
                            updateStageAlignmentTarget(target, { x: 0, y: 0 })
                          }
                        >
                          Reset
                        </button>
                      </header>
                      <div
                        className={styles.alignmentItemToggle}
                        role="group"
                        aria-label={`${DEBATE_STAGE_ALIGNMENT_LABELS[role]} item`}
                      >
                        {DEBATE_STAGE_ALIGNMENT_ITEMS.map((item) => (
                          <button
                            type="button"
                            aria-pressed={selectedItem === item}
                            onClick={() =>
                              setStageAlignmentSelectedItems((current) => ({
                                ...current,
                                [role]: item,
                              }))
                            }
                            key={item}
                          >
                            {DEBATE_STAGE_ALIGNMENT_ITEM_LABELS[item]}
                          </button>
                        ))}
                      </div>
                      {(["x", "y"] as const).map((axis) => (
                        <label key={axis}>
                          <span>
                            {axis === "x" ? "Horizontal" : "Vertical"}
                            <output>
                              {offset[axis] > 0 ? "+" : ""}
                              {offset[axis].toFixed(1)}%
                            </output>
                          </span>
                          <input
                            type="range"
                            min={DEBATE_STAGE_ALIGNMENT_MIN}
                            max={DEBATE_STAGE_ALIGNMENT_MAX}
                            step={DEBATE_STAGE_ALIGNMENT_STEP}
                            value={offset[axis]}
                            aria-label={`${DEBATE_STAGE_ALIGNMENT_LABELS[role]} ${DEBATE_STAGE_ALIGNMENT_ITEM_LABELS[selectedItem]} ${
                              axis === "x" ? "horizontal" : "vertical"
                            } position`}
                            onChange={(event) =>
                              updateStageAlignmentTarget(target, {
                                [axis]: Number(event.currentTarget.value),
                              })
                            }
                          />
                        </label>
                      ))}
                    </div>
                  );
                })}
              </section>
            </div>
          </div>
        </section>
      </div>
    );
  };

  const renderLive = (): React.JSX.Element => {
    if (!activeSession) return renderLobby();
    const session = activeSession;
    const activeEvent =
      (presentationEventId
        ? session.events.find((event) => event.id === presentationEventId)
        : null) ??
      [...session.events]
        .reverse()
        .find(
          (event) =>
            [
              "intro",
              "phase",
              "speech",
              "silence",
              "testimony",
              "press",
              "objection",
              "evidence",
              "revelation",
              "player_turn",
              "reaction",
              "interjection",
              "moderator_ruling",
              "ballot",
            ].includes(event.kind) ||
            (event.kind === "verdict" && event.speakerKind === "player"),
        ) ??
      null;
    const activeSpeakerId = activeEvent?.speakerBotId ?? null;
    const activeColor =
      activeSpeakerId === session.moderator.id
        ? session.moderator.color
        : activeSpeakerId === session.forAdvocate.id
          ? session.forAdvocate.color
          : activeSpeakerId === session.againstAdvocate.id
            ? session.againstAdvocate.color
            : null;
    const activeRole: DebateForumRole | null =
      activeSpeakerId === session.moderator.id
        ? "moderator"
        : activeSpeakerId === session.forAdvocate.id
          ? "for"
          : activeSpeakerId === session.againstAdvocate.id
            ? "against"
            : null;
    const cameraView =
      cameraMode === "auto" ? debateAutoCameraView(activeRole) : cameraMode;
    const canInterject =
      session.format === "forum" &&
      session.playerRole === "participant" &&
      session.status === "live" &&
      presenting &&
      activeEvent?.kind === "speech" &&
      activeEvent.sideId !== null &&
      activeEvent.sideId !== session.playerSideId &&
      liveReveal?.eventId === activeEvent.id &&
      liveReveal.visibleContent.length >= 24 &&
      liveReveal.visibleContent.length < activeEvent.content.length;
    const activePublicContent =
      activeEvent && liveReveal?.eventId === activeEvent.id
        ? liveReveal.visibleContent
        : (activeEvent?.content ?? "");
    const activeCaptionText =
      activeEvent?.kind === "silence"
        ? ""
        : debateSpokenText(activePublicContent).trim();
    const listenerReaction = debateGalleryReaction(activePublicContent);
    const floorLabel =
      activeEvent?.kind === "moderator_ruling"
        ? "Moderator ruling"
        : activeEvent?.kind === "testimony"
          ? "Statement entered"
          : activeEvent?.kind === "press"
            ? "Statement pressed"
            : activeEvent?.kind === "objection"
              ? "Objection"
              : activeEvent?.kind === "evidence"
                ? "Frozen evidence"
                : activeEvent?.kind === "revelation"
                  ? "Reversal"
                  : activeEvent?.kind === "interjection"
                    ? "Floor interrupted"
                    : activeEvent?.kind === "phase"
                      ? "Moderator transition"
                      : activeEvent?.kind === "ballot"
                        ? "Ballot"
                        : activeEvent
                          ? "On the floor"
                          : "Awaiting the floor";
    const forPresentation = debateBotPresentation(session, session.forAdvocate);
    const againstPresentation = debateBotPresentation(
      session,
      session.againstAdvocate,
    );
    const moderatorPresentation = debateBotPresentation(
      session,
      session.moderator,
    );
    const thinkingBotId =
      busy && !presenting && session.status === "live"
        ? debateExpectedBotId(session)
        : null;
    const turnaboutFloorOwnerBotId =
      session.formatState.format === "turnabout"
        ? session.formatState.floorOwnerBotId
        : null;
    const turnOwnerBotId =
      presenting && activeSpeakerId
        ? activeSpeakerId
        : (turnaboutFloorOwnerBotId ??
          debateTurnOwnerBotId({
            thinkingBotId,
            presenting,
            presentationSpeakerBotId: activeSpeakerId,
          }));
    const turnOwnerRole: DebateForumRole | null =
      turnOwnerBotId === session.moderator.id
        ? "moderator"
        : turnOwnerBotId === session.forAdvocate.id
          ? "for"
          : turnOwnerBotId === session.againstAdvocate.id
            ? "against"
            : null;
    const stageCast = [
      {
        role: "for" as const,
        bot: session.forAdvocate,
        presentation: forPresentation,
        roleLabel: session.motion.forSide.label,
        listenerReaction:
          activeSpeakerId === session.againstAdvocate.id
            ? listenerReaction
            : null,
      },
      {
        role: "moderator" as const,
        bot: session.moderator,
        presentation: moderatorPresentation,
        roleLabel:
          session.format === "turnabout" ? "Moderator / Judge" : "Moderator",
        listenerReaction: null,
      },
      {
        role: "against" as const,
        bot: session.againstAdvocate,
        presentation: againstPresentation,
        roleLabel: session.motion.againstSide.label,
        listenerReaction:
          activeSpeakerId === session.forAdvocate.id ? listenerReaction : null,
      },
    ];
    const handleDebateAmbientBotVocalization = (
      cue: SessionAmbientBotVocalizationCue,
    ): boolean => {
      if (
        !props.audioEnabled ||
        props.audioVolume <= 0 ||
        (session.status !== "live" &&
          session.status !== "waiting_for_player") ||
        (busy && !presenting) ||
        cue.kind === "mouth-sound" ||
        cue.kind === "lip-smack"
      ) {
        return false;
      }
      const targetId = debateVocalFoleyTargetId({
        sessionId: session.id,
        cueIndex: cue.index,
        kind: cue.kind,
        participants: stageCast.map(({ role, bot, presentation }) => ({
          id: bot.id,
          role,
          active: bot.id === activeSpeakerId,
          thinking: bot.id === thinkingBotId,
          hardMuted:
            bots.find((candidate) => candidate.id === bot.id)?.hardMuted ===
            true,
          hidden: presentation.visibility === "hidden",
        })),
      });
      if (!targetId) return false;
      startDebateAmbientBotVocalization(targetId, cue);
      return true;
    };
    return (
      <>
        <SessionAtmosphereLayer
          active={Boolean(
            props.audioEnabled &&
            props.audioVolume > 0 &&
            (session.status === "live" ||
              session.status === "waiting_for_player"),
          )}
          sessionKey={`debate:${session.id}`}
          volume={props.audioVolume}
          mix={DEBATE_FOLEY_MIX}
          foleyRoomAcoustics={
            session.format === "turnabout"
              ? DEBATE_TURNABOUT_FOLEY_ROOM_SEND
              : DEBATE_FORUM_FOLEY_ROOM_SEND
          }
          ambientFoley={false}
          deferFoley
          deferBotVocalization={busy && !presenting}
          ambientBotVocalizations
          ambientBotVocalizationProfile={DEBATE_VOCAL_FOLEY_PROFILE}
          onAmbientBotVocalization={handleDebateAmbientBotVocalization}
        />
        <main
          className={styles.live}
          data-debate-surface="live"
          data-debate-format={session.format}
          data-theme={props.theme}
          data-session-status={session.status}
          data-session-phase={session.phase}
          style={
            {
              "--debate-active-color": activeColor ?? "#9c8cff",
              "--debate-for-color": session.forAdvocate.color ?? "#42d9ff",
              "--debate-against-color":
                session.againstAdvocate.color ?? "#ff5f8f",
              "--debate-moderator-color": session.moderator.color ?? "#d9d2ff",
            } as CSSProperties
          }
        >
          <header className={styles.liveHeader}>
            <button
              type="button"
              className={styles.exitButton}
              onClick={() => {
                props.onStopUtterance?.();
                setEarlyEndOpen(false);
                setView("dashboard");
                setActiveSession(null);
                void loadSessions();
              }}
            >
              ← Studio
            </button>
            <div className={styles.liveIdentity}>
              <p className={styles.eyebrow}>
                <span className={styles.liveStateBeacon} aria-hidden="true" />
                {session.format === "turnabout" ? "Turnabout" : "Forum"} ·{" "}
                {phaseLabel(session)} · {session.playerRole}
              </p>
              <h1>
                {session.format === "turnabout"
                  ? "Court of Record"
                  : "Assembly Chamber"}
              </h1>
            </div>
            <div className={styles.liveControls}>
              {session.status !== "completed" &&
              session.status !== "failed" &&
              session.status !== "cancelled" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void pauseOrResume()}
                    disabled={busy}
                  >
                    {session.status === "paused" ? "Resume" : "Pause"}
                  </button>
                  {session.phase !== "verdict" ? (
                    <button
                      type="button"
                      className={styles.endEarlyButton}
                      onClick={() => setEarlyEndOpen(true)}
                      disabled={busy || presenting}
                      aria-label="End the Debate early"
                    >
                      End early
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </header>
          <div className={styles.liveWorkspace}>
            <div className={styles.stageColumn}>
              <div className={styles.forum} data-debate-stage-viewport="live">
                <div
                  className={styles.forumCamera}
                  data-camera-view={cameraView}
                  data-camera-mode={cameraMode}
                  data-active-role={activeRole ?? undefined}
                  style={debateStageAlignmentStyle(stageAlignment)}
                >
                  <div className={styles.receiverMatte} aria-hidden="true" />
                  <DebateForumLightMasks />
                  {stageCast.map(
                    ({
                      role,
                      bot,
                      presentation,
                      listenerReaction: botListenerReaction,
                    }) => {
                      const appearanceBot =
                        debateBotSnapshot(
                          session,
                          presentation.voiceSourceBotId,
                        ) ?? bot;
                      const talking =
                        presenting &&
                        activeSpeakerId === bot.id &&
                        activeEvent?.kind !== "silence";
                      const speechTiming =
                        talking &&
                        liveReveal &&
                        liveReveal.eventId === activeEvent?.id
                          ? (liveReveal.speechTiming ?? null)
                          : null;
                      const foleyMouthShape =
                        !talking &&
                        debateAmbientBotVocalization?.targetId === bot.id
                          ? debateAmbientBotVocalizationMouthShape(bot.id)
                          : null;
                      return (
                        <div
                          className={styles.botPosition}
                          data-role={role}
                          key={`avatar:${bot.id}`}
                        >
                          <div
                            className={styles.botStagePresence}
                            data-speaking={talking ? "true" : undefined}
                            data-thinking={
                              thinkingBotId === bot.id ? "true" : undefined
                            }
                            data-visibility={presentation.visibility}
                            data-scale={presentation.scale}
                            data-color-cycle={
                              presentation.colorCycle ? "true" : undefined
                            }
                            data-listening-reaction={
                              botListenerReaction ?? undefined
                            }
                            data-vocal-foley={
                              foleyMouthShape ? "true" : undefined
                            }
                          >
                            {props.renderBotAvatar ? (
                              props.renderBotAvatar(appearanceBot, {
                                role,
                                lookAtRole:
                                  role === "moderator" ? turnOwnerRole : null,
                                compact:
                                  role === "moderator" &&
                                  cameraView !== "moderator",
                                talking,
                                thinking: thinkingBotId === bot.id,
                                colorCycle: presentation.colorCycle,
                                speechTiming,
                                foleyMouthShape,
                                listenerReaction: botListenerReaction,
                              })
                            ) : (
                              <span className={styles.botGlyphFallback}>
                                {props.renderBotGlyph(presentation.glyph, {
                                  size: 42,
                                  strokeWidth: 1.35,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    },
                  )}
                  <div className={styles.podiumForeground} aria-hidden="true" />
                  {stageCast.map(({ role, bot, presentation }) => (
                    <div
                      className={styles.podiumGlyphPosition}
                      data-role={role}
                      data-turn-active={
                        turnOwnerBotId === bot.id ? "true" : undefined
                      }
                      data-visibility={presentation.visibility}
                      key={`podium-glyph:${bot.id}`}
                      aria-hidden="true"
                    >
                      <span className={styles.podiumGlyphScreen}>
                        <span className={styles.podiumGlyphMark}>
                          {props.renderBotGlyph(presentation.glyph, {
                            size: 48,
                            strokeWidth: 1.5,
                          })}
                        </span>
                      </span>
                    </div>
                  ))}
                  {stageCast.map(({ role, bot, presentation, roleLabel }) => (
                    <div
                      className={styles.botIdentityPosition}
                      data-role={role}
                      data-speaking={
                        activeSpeakerId === bot.id ? "true" : undefined
                      }
                      data-visibility={presentation.visibility}
                      key={`identity:${bot.id}`}
                    >
                      <div className={styles.botIdentityPlate}>
                        <strong>{presentation.displayName}</strong>
                        <small>{roleLabel}</small>
                        {presentation.identityLabel ? (
                          <em>{presentation.identityLabel}</em>
                        ) : null}
                        {role !== "moderator" &&
                        session.advocacyConsent.some(
                          (check) =>
                            check.botId === bot.id &&
                            check.status === "devils_advocate",
                        ) ? (
                          <b>Devil’s Advocate</b>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {session.playerRole === "judge" ? (
                    <div className={styles.playerPresence} data-role="judge">
                      <span>◇</span>
                      Judge
                    </div>
                  ) : session.playerRole === "participant" ? (
                    <div
                      className={styles.playerPresence}
                      data-role="participant"
                      data-side={session.playerSideId ?? undefined}
                    >
                      <span>◇</span>
                      You
                    </div>
                  ) : null}
                </div>
                <div
                  className={styles.stageTitle}
                  data-debate-stage-title="true"
                >
                  <span>The motion</span>
                  <strong>{session.motion.motion}</strong>
                </div>
                {presenting && activeEvent && activeCaptionText ? (
                  <div
                    className={styles.liveCaption}
                    data-debate-live-caption="true"
                    data-event-id={activeEvent.id}
                    data-speaker-kind={activeEvent.speakerKind}
                    aria-live="off"
                  >
                    <strong>{visibleEventName(session, activeEvent)}</strong>
                    <span>{activeCaptionText}</span>
                  </div>
                ) : null}
                {session.status === "paused" ? (
                  <div className={styles.stageStateOverlay} data-kind="paused">
                    <span aria-hidden="true">Ⅱ</span>
                    <strong>
                      {session.format === "turnabout"
                        ? "Record suspended"
                        : "Forum suspended"}
                    </strong>
                    <small>The exact next action is preserved.</small>
                  </div>
                ) : session.status === "waiting_for_player" ? (
                  <div
                    className={styles.stageStateOverlay}
                    data-kind="player"
                    aria-hidden="true"
                  >
                    <span>◇</span>
                    <strong>The floor turns to you</strong>
                  </div>
                ) : session.status === "completed" ? (
                  <div
                    className={styles.stageStateOverlay}
                    data-kind="verdict"
                    aria-hidden="true"
                  >
                    <span>Verdict</span>
                    <strong>{verdictLabel(session)}</strong>
                    <small>
                      {session.endedEarlyAt
                        ? "The abbreviated proceeding is sealed."
                        : "The proceeding is sealed."}
                    </small>
                  </div>
                ) : session.status === "failed" ||
                  session.status === "cancelled" ? (
                  <div className={styles.stageStateOverlay} data-kind="failed">
                    <span aria-hidden="true">!</span>
                    <strong>Proceeding interrupted</strong>
                    <small>The preserved record remains available.</small>
                  </div>
                ) : null}
                <div
                  className={styles.floorStatus}
                  data-kind={activeEvent?.kind ?? "waiting"}
                  aria-live="polite"
                >
                  <span>{floorLabel}</span>
                  <strong>
                    {activeEvent
                      ? visibleEventName(session, activeEvent)
                      : session.format === "turnabout"
                        ? "The record"
                        : "The Forum"}
                  </strong>
                </div>
                <div
                  className={styles.cameraControls}
                  aria-label="Debate stage cameras"
                  data-tutorial-target="debate-camera"
                >
                  <span>Camera</span>
                  {DEBATE_CAMERA_VIEWS.map((camera) => (
                    <button
                      type="button"
                      data-selected={
                        cameraMode === camera.id ? "true" : undefined
                      }
                      aria-pressed={cameraMode === camera.id}
                      onClick={() => setCameraMode(camera.id)}
                      key={camera.id}
                    >
                      {camera.label}
                    </button>
                  ))}
                  <details className={styles.cameraAdvanced}>
                    <summary
                      aria-label="More stage controls"
                      title="More stage controls"
                      data-tutorial-target="debate-align-stage"
                    >
                      •••
                    </summary>
                    <div>
                      <button
                        type="button"
                        className={styles.alignmentLaunchButton}
                        onClick={(event) => {
                          event.currentTarget
                            .closest("details")
                            ?.removeAttribute("open");
                          openStageAlignment();
                        }}
                        aria-label="Align stage"
                      >
                        Stage geometry
                      </button>
                    </div>
                  </details>
                </div>
              </div>
              <div className={styles.stageSupport}>
                {session.format === "turnabout"
                  ? renderTurnaboutRecord(session)
                  : renderCaseBoard(session)}
                {renderGallery(session)}
              </div>
            </div>
            <aside
              className={styles.debateRail}
              data-completed={
                session.status === "completed" ? "true" : undefined
              }
              data-player-window-active={
                session.status === "waiting_for_player" ? "true" : undefined
              }
            >
              {autoRecoveryNotice ? (
                <p className={styles.autoRecoveryNotice} role="status">
                  {autoRecoveryNotice}
                </p>
              ) : null}
              {session.error ? (
                <div className={styles.turnUnavailable} role="alert">
                  <strong>Turn unavailable</strong>
                  <p>{session.error}</p>
                  <div>
                    <button
                      type="button"
                      onClick={() => void advance(false)}
                      disabled={busy}
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => void advance(true)}
                      disabled={busy}
                    >
                      Skip without dialogue
                    </button>
                  </div>
                </div>
              ) : null}
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {renderTranscript(session)}
              {session.status === "completed" ? (
                <section className={styles.resultCard}>
                  <p className={styles.eyebrow}>Verdict</p>
                  <h2>{verdictLabel(session)}</h2>
                  <p>
                    {session.endedEarlyAt
                      ? session.playerRole === "judge"
                        ? "Your limited-record ruling is final. The bot ballots below show agreement and dissent."
                        : "The three-bot majority reached a brief verdict from the limited public record."
                      : session.playerRole === "judge"
                        ? session.format === "turnabout"
                          ? "Your public-record ruling is final. The bot ballots below show agreement and dissent."
                          : "Your ruling is final. The bot ballots below show agreement and dissent."
                        : session.format === "turnabout"
                          ? "The three-bot majority resolved the public record."
                          : "The three-bot majority decided the Duel."}
                  </p>
                  <ul>
                    {session.ballots.map((ballot) => {
                      const voter =
                        ballot.voterBotId === session.moderator.id
                          ? session.moderator
                          : ballot.voterBotId === session.forAdvocate.id
                            ? session.forAdvocate
                            : session.againstAdvocate;
                      return (
                        <li key={ballot.voterBotId}>
                          <strong>{voter.name}</strong>
                          <span>
                            {ballot.sideId === "for"
                              ? session.motion.forSide.label
                              : session.motion.againstSide.label}
                          </span>
                          <p>
                            {ballot.reason ??
                              "Private ballot — no spoken reason exposed."}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  <button type="button" onClick={() => setView("dashboard")}>
                    Return to studio
                  </button>
                </section>
              ) : null}
            </aside>
          </div>
          {canInterject ? (
            <div className={styles.liveCommandDeck} data-kind="interjection">
              <form
                className={styles.interjectionBar}
                onSubmit={submitInterjection}
                data-tutorial-target="debate-interject"
              >
                <div>
                  <p className={styles.eyebrow}>Break the floor</p>
                  <span>The moderator will rule after you cut in.</span>
                </div>
                <textarea
                  value={interjectionDraft}
                  onChange={(event) =>
                    setInterjectionDraft(event.currentTarget.value)
                  }
                  maxLength={600}
                  rows={2}
                  placeholder="Point of order, correction, or direct challenge…"
                />
                <button
                  type="submit"
                  disabled={busy || !interjectionDraft.trim()}
                >
                  Interject now
                </button>
              </form>
            </div>
          ) : null}
          {session.status === "waiting_for_player" ? (
            <div className={styles.liveCommandDeck} data-kind="player">
              {renderPlayerWindow(session)}
            </div>
          ) : null}
          {selectedSource ? (
            <aside
              className={styles.sourceDrawer}
              role="dialog"
              aria-modal="true"
              aria-labelledby="debate-source-title"
            >
              <button
                ref={sourceDrawerCloseButtonRef}
                type="button"
                onClick={() => setSourceDrawerId(null)}
              >
                Close
              </button>
              <span>{selectedSource.id}</span>
              <h2 id="debate-source-title">{selectedSource.title}</h2>
              <p>{selectedSource.snippet}</p>
              {selectedSource.publishedAt ? (
                <small>{selectedSource.publishedAt}</small>
              ) : null}
              <a href={selectedSource.url} target="_blank" rel="noreferrer">
                Open original source
              </a>
            </aside>
          ) : null}
          {earlyEndOpen ? (
            <div
              className={styles.confirmBackdrop}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget && !busy) {
                  setEarlyEndOpen(false);
                }
              }}
            >
              <section
                className={styles.confirmDialog}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="debate-end-early-title"
                aria-describedby="debate-end-early-description"
              >
                <p className={styles.eyebrow}>Accelerated verdict</p>
                <h2 id="debate-end-early-title">End this Debate early?</h2>
                <p id="debate-end-early-description">
                  {session.playerRole === "judge"
                    ? "The remaining rounds will be skipped. You will rule immediately from only the limited public record heard so far."
                    : "The remaining rounds will be skipped. The three-bot panel will cast brief ballots from only the limited public record heard so far."}
                </p>
                <div>
                  <button
                    type="button"
                    onClick={() => setEarlyEndOpen(false)}
                    disabled={busy}
                  >
                    Continue Debate
                  </button>
                  <button
                    ref={earlyEndConfirmButtonRef}
                    type="button"
                    className={styles.confirmEarlyEndButton}
                    onClick={() => void endDebateEarly()}
                    disabled={busy || presenting}
                  >
                    {busy ? "Concluding…" : "Conclude now"}
                  </button>
                </div>
              </section>
            </div>
          ) : null}
        </main>
        {renderStageAlignmentModal(session)}
      </>
    );
  };

  if (view === "live") return renderLive();
  return renderLobby();
}
