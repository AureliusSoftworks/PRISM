"use client";

/* Authenticated, player-owned image routes intentionally bypass Next's public image optimizer. */
/* eslint-disable @next/next/no-img-element */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT,
  DEBATE_MYSTERY_PRESETS,
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  DEBATE_MYSTERY_SCHEMA_VERSION,
  debateMysteryNotebookCharacterCount,
  debateMysteryRecipeSeed,
  resolveDebateMysteryConfig,
  type DebateMysteryActionRequestV1,
  type DebateMysteryArtMode,
  type DebateMysteryCaseCodeV1,
  type DebateMysteryDifficulty,
  type DebateMysteryNotebookBlockV1,
  type DebateMysteryNotebookCleanupProposalV1,
  type DebateMysteryNotebookPageV1,
  type DebateMysteryNotebookV1,
  type DebateMysteryPresetId,
  type DebateMysteryRegionV1,
  type DebateMysteryTheoryV1,
  type DebateSessionV1,
  type DebateWhodunnitCreateConfigV1,
  type DebateWhodunnitFormatStateV1,
  type ProviderReasoningEffort,
  type ResponseMode,
} from "@localai/shared";
import styles from "./debateMystery.module.css";
import { BotAvatarMicro } from "./BotAvatarMicro";
import { mysteryRoomArtworkSrc } from "./debateMysteryRoomArt";
import { findAtMentionTokenPlain } from "./botMention";
import type { BotPickerGlyphRenderer } from "./BotPicker";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";
import {
  minimumWhodunnitBotsForCast,
  distinctWhodunnitCastBotIds,
  randomizeWhodunnitCast,
} from "./debateMysteryCast";

export interface MysteryBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  hardMuted: boolean;
}

interface MysteryRoutingProps {
  preferredProvider: "local" | "openai" | "anthropic";
  responseMode: ResponseMode;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
  modelOverride?: {
    provider: "local" | "openai" | "anthropic";
    model: string;
  } | null;
}

interface MysterySharedProps extends MysteryRoutingProps {
  bots: MysteryBotSummary[];
  theme: "light" | "dark";
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: BotPickerGlyphRenderer;
  /** Full/mini identity renderer supplied by the Debate surface. */
  renderMysteryBotAvatar: (
    bot: MysteryBotSummary,
    presentation: "full" | "mini",
    performance?: {
      demeanor: "suspect" | "partner";
      talking?: boolean;
      thinking?: boolean;
      speechTiming?: MysterySpeechTiming | null;
    },
  ) => ReactNode;
  playMysteryVoice?: (
    sessionId: string,
    bot: MysteryBotSummary,
    text: string,
    messageId: string,
    lifecycle?: MysteryVoiceLifecycle,
  ) => Promise<boolean>;
  /** Player turns reuse Debate's account-configured voice path when enabled. */
  playMysteryPlayerVoice?: (
    sessionId: string,
    text: string,
    messageId: string,
    lifecycle?: MysteryVoiceLifecycle,
  ) => Promise<boolean>;
}

interface MysterySpeechTiming {
  text: string;
  elapsedMs: number;
  durationMs: number;
  alignment: VoicePlaybackCharacterAlignment | null;
}

interface MysteryVoiceLifecycle {
  onStart?: (
    durationMs: number | null,
    alignment?: VoicePlaybackCharacterAlignment | null,
  ) => void;
  onProgress?: (elapsedMs: number, durationMs: number) => void;
  onEnd?: () => void;
  onCancel?: () => void;
}

type MysteryMentionPick = {
  id: string;
  title: string;
  glyph: string;
  token: string;
  kind: "evidence" | "testimony" | "suspect" | "victim" | "lead";
  color?: string | null;
};

function mysteryMentionPicks(
  state: DebateWhodunnitFormatStateV1,
  includeLeads = false,
): MysteryMentionPick[] {
  return [
    ...(includeLeads ? state.leads.map((lead) => ({ id: `${lead.id}@${lead.revision}`, title: `Lead · ${lead.title}`, glyph: "◇", token: `[[mystery:lead:${lead.id}@${lead.revision}]]`, kind: "lead" as const })) : []),
    ...state.discoveredEvidence.map((item) => ({ id: item.id, title: mysteryEvidenceTitle(item.title), glyph: mysteryEvidenceEmoji(item), token: `[[exhibit:${item.id}]]`, kind: "evidence" as const })),
    ...state.testimony.map((item) => ({ id: item.id, title: `Testimony · ${state.suspects.find((suspect) => suspect.seatId === item.speakerSeatId)?.name ?? "Witness"}`, glyph: "💬", token: `[[mystery:testimony:${item.id}]]`, kind: "testimony" as const })),
    ...state.suspects.map((suspect) => ({ id: suspect.seatId, title: suspect.name, glyph: "●", token: `[[mystery:suspect:${suspect.seatId}]]`, kind: "suspect" as const, color: suspect.color })),
    { id: state.victim.id, title: state.victim.name, glyph: "✦", token: `[[mystery:victim:${state.victim.id}]]`, kind: "victim" as const },
  ];
}

function filterMysteryMentions(picks: readonly MysteryMentionPick[], query: string): MysteryMentionPick[] {
  const needle = query.trim().toLowerCase();
  return picks.filter((pick) => !needle || `${pick.title} ${pick.kind}`.toLowerCase().includes(needle)).slice(0, 8);
}

function commitMysteryMentionAtCaret(value: string, caret: number, pick: MysteryMentionPick): { replacement: string; caret: number } | null {
  const token = findAtMentionTokenPlain(value, caret);
  if (!token) return null;
  const replacement = `${value.slice(0, token.atIndex)}${pick.token} ${value.slice(token.endIndex)}`;
  return { replacement, caret: token.atIndex + pick.token.length + 1 };
}

/** Parse only committed picker markers. A plain evidence title stays prose. */
export function parseMysteryInterviewEvidenceMention(
  question: string,
  discoveredEvidence: readonly { id: string }[],
): string | null {
  const matches = [...question.matchAll(/\[\[exhibit:([^\]\s]+)\]\]/gu)];
  if (matches.length !== 1) return null;
  const evidenceId = matches[0]?.[1] ?? "";
  return discoveredEvidence.some((item) => item.id === evidenceId)
    ? evidenceId
    : null;
}

export function mysteryPublicText(
  source: string,
  state: Pick<DebateWhodunnitFormatStateV1, "discoveredEvidence" | "leads" | "suspects" | "testimony" | "victim">,
): string {
  let publicText = source;
  for (const evidence of state.discoveredEvidence) {
    publicText = publicText.replaceAll(`[[exhibit:${evidence.id}]]`, evidence.title);
  }
  for (const testimony of state.testimony) {
    const speaker = state.suspects.find((suspect) => suspect.seatId === testimony.speakerSeatId)?.name ?? "Witness";
    publicText = publicText.replaceAll(`[[mystery:testimony:${testimony.id}]]`, `Testimony from ${speaker}`);
  }
  for (const lead of state.leads) {
    publicText = publicText.replaceAll(`[[mystery:lead:${lead.id}@${lead.revision}]]`, lead.title);
  }
  for (const suspect of state.suspects) {
    publicText = publicText.replaceAll(`[[mystery:suspect:${suspect.seatId}]]`, suspect.name);
  }
  publicText = publicText.replaceAll(`[[mystery:victim:${state.victim.id}]]`, state.victim.name);
  return mysterySeatNames(publicText, state.suspects);
}

function mysterySeatNames(
  source: string,
  suspects: readonly DebateWhodunnitFormatStateV1["suspects"][number][],
): string {
  return suspects.reduce((publicText, suspect) => {
    const escapedSeat = suspect.seatId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return publicText.replace(new RegExp(`\\b${escapedSeat}\\b`, "giu"), suspect.name);
  }, source);
}

function mysteryId(prefix: string): string {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function mysteryRequestBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

function gradeLabel(grade: string): string {
  if (grade === "smoking_gun") return "Smoking Gun";
  if (grade === "strong_case") return "Strong Case";
  if (grade === "lucky_break") return "Lucky Break";
  return "Incorrect";
}

function notebookReferenceLabel(text: string): string {
  return text.replace(/^\[\[(?:room|evidence|testimony|lead):[^\]]+\]\]\s*/u, "").trim();
}

function mysteryEvidenceTitle(title: string): string {
  const cleaned = title.replace(/^recovered\s+(?:a|an|the)\s+/iu, "").trim();
  return cleaned ? `${cleaned[0]!.toLocaleUpperCase()}${cleaned.slice(1)}` : title;
}

function mysteryEvidenceObservation(observation: string): string {
  return observation.replace(/^The recovered\s+(?:a|an|the)\s+/iu, "The ");
}

function mysteryEvidenceEmoji(item: { title: string; object: string; emoji: string }): string {
  const label = `${item.title} ${item.object}`.toLocaleLowerCase();
  if (label.includes("letter opener")) return "🗡️";
  if (/\b(?:gun|pistol|revolver|firearm)\b/u.test(label)) return "🔫";
  if (/\b(?:knife|dagger|blade)\b/u.test(label)) return "🔪";
  if (/\b(?:poison|toxin|venom|chemical)\b/u.test(label)) return "🧪";
  return item.emoji;
}

interface MysterySpoilerEvidence {
  id: string;
  title: string;
  observation: string;
  object: string;
  emoji: string;
}

interface MysterySpoilerProofBundle {
  id: string;
  grade: string;
  requiredEvidenceIds: string[];
  requiredTestimonyIds: string[];
  requiresAccomplice: boolean;
  requiredCourtContradictionId: string | null;
}

function mysterySpoilerTimeline(record: Record<string, unknown> | null): Array<{ at: string; fact: string }> {
  if (!Array.isArray(record?.timeline)) return [];
  return record.timeline.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    return typeof candidate.at === "string" && typeof candidate.fact === "string"
      ? [{ at: candidate.at, fact: candidate.fact }]
      : [];
  });
}

function mysterySpoilerEvidence(record: Record<string, unknown> | null): MysterySpoilerEvidence[] {
  if (!Array.isArray(record?.unseenEvidence)) return [];
  return record.unseenEvidence.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.title !== "string" || typeof candidate.observation !== "string") return [];
    return [{
      id: candidate.id,
      title: candidate.title,
      observation: candidate.observation,
      object: typeof candidate.object === "string" ? candidate.object : candidate.title,
      emoji: typeof candidate.emoji === "string" ? candidate.emoji : "🔎",
    }];
  });
}

function mysterySpoilerProofBundles(record: Record<string, unknown> | null): MysterySpoilerProofBundle[] {
  if (!Array.isArray(record?.proofBundles)) return [];
  return record.proofBundles.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.id !== "string" || typeof candidate.grade !== "string") return [];
    return [{
      id: candidate.id,
      grade: candidate.grade,
      requiredEvidenceIds: Array.isArray(candidate.requiredEvidenceIds) ? candidate.requiredEvidenceIds.filter((id): id is string => typeof id === "string") : [],
      requiredTestimonyIds: Array.isArray(candidate.requiredTestimonyIds) ? candidate.requiredTestimonyIds.filter((id): id is string => typeof id === "string") : [],
      requiresAccomplice: candidate.requiresAccomplice === true,
      requiredCourtContradictionId: typeof candidate.requiredCourtContradictionId === "string" ? candidate.requiredCourtContradictionId : null,
    }];
  });
}

function mysteryCourtBeat(
  source: string,
  suspects: DebateWhodunnitFormatStateV1["suspects"],
): { speaker: "Prosecution" | "Defense" | "PRISM" | "Investigator"; body: string } | null {
  const match = source.match(/^(Prosecution|Defense|PRISM|Investigator):\s*([\s\S]+)$/u);
  if (!match) return null;
  const speaker = match[1] as "Prosecution" | "Defense" | "PRISM" | "Investigator";
  const body = mysteryEvidenceObservation(mysterySeatNames(match[2] ?? "", suspects))
    .replace(/[*_`#]/gu, "")
    .replace(/^\s*[-+]\s+/gmu, "")
    .replace(/\s*\n+\s*/gu, " ")
    .trim();
  return body ? { speaker, body } : null;
}

function mysteryTestimonySpeaker(
  state: DebateWhodunnitFormatStateV1,
  speakerSeatId: string,
): DebateWhodunnitFormatStateV1["suspects"][number] | null {
  return state.suspects.find((suspect) => suspect.seatId === speakerSeatId) ?? null;
}

function mysteryNotebookReferenceLabel(
  block: DebateMysteryNotebookBlockV1,
  state: DebateWhodunnitFormatStateV1,
): string {
  const label = notebookReferenceLabel(block.text);
  if (block.referenceKind === "testimony" && block.referenceId) {
    const testimony = state.testimony.find((item) => item.id === block.referenceId);
    const speaker = testimony ? mysteryTestimonySpeaker(state, testimony.speakerSeatId) : null;
    return speaker && !label.toLocaleLowerCase().startsWith(`${speaker.name.toLocaleLowerCase()}:`)
      ? `${speaker.name}: ${label}`
      : label;
  }
  if (block.referenceKind === "evidence") {
    const cleaned = label
      .replace(/^Recovered\s+(?:a|an|the)\s+/iu, "")
      .replace(/:\s*The recovered\s+(?:a|an|the)\s+/iu, ": The ");
    return mysteryEvidenceObservation(cleaned);
  }
  return label;
}

function partnerMarkdownWithColoredSuspects(
  source: string,
  suspects: readonly DebateWhodunnitFormatStateV1["suspects"][number][],
): string {
  return [...suspects]
    .sort((left, right) => right.name.length - left.name.length)
    .reduce((markdown, suspect) => {
      const escapedName = suspect.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return markdown.replace(
        new RegExp(`\\b${escapedName}\\b`, "giu"),
        () => `[${suspect.name}](#mystery-suspect-${encodeURIComponent(suspect.seatId)})`,
      );
    }, mysterySeatNames(source, suspects));
}

function MysteryPublicMarkdown(props: {
  source: string;
  suspects: DebateWhodunnitFormatStateV1["suspects"];
}): React.JSX.Element {
  const markdown = partnerMarkdownWithColoredSuspects(props.source, props.suspects);
  return (
    <div className={styles.partnerProse}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const prefix = "#mystery-suspect-";
            if (href?.startsWith(prefix)) {
              const seatId = decodeURIComponent(href.slice(prefix.length));
              const suspect = props.suspects.find((entry) => entry.seatId === seatId);
              return <span className={styles.partnerSuspectName} style={{ "--suspect-color": suspect?.color ?? "#a98cff" } as CSSProperties}>{children}</span>;
            }
            return <span>{children}</span>;
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function presetSuspectCount(preset: DebateMysteryPresetId): number {
  return DEBATE_MYSTERY_PRESETS.find((candidate) => candidate.id === preset)
    ?.suspects ?? 4;
}

function fillCast(
  bots: readonly MysteryBotSummary[],
  current: readonly string[],
  count: number,
  excluded: readonly string[] = [],
): string[] {
  const allowed = new Set(bots.map((bot) => bot.id));
  const blocked = new Set(excluded);
  const selected = current.filter(
    (id, index) =>
      allowed.has(id) && !blocked.has(id) && current.indexOf(id) === index,
  );
  for (const bot of bots) {
    if (selected.length >= count) break;
    if (!blocked.has(bot.id) && !selected.includes(bot.id)) selected.push(bot.id);
  }
  return selected.slice(0, count);
}

const COMPILATION_STAGES = [
  ["casting", "Checking the ensemble"],
  ["building_mansion", "Building the mansion"],
  ["writing_alibis", "Writing alibis"],
  ["hiding_evidence", "Hiding evidence"],
  ["testing_theories", "Testing three ways through the case"],
  ["preparing_rooms", "Preparing the rooms"],
] as const;
interface InspectedMysterySeed {
  version: number;
  generatorVersion: number;
  title: string;
  floors: number;
  totalRooms: number;
  seats: Array<{
    seatId: string;
    exportHash: string | null;
    suggestedBotId: string | null;
  }>;
}

export function DebateMysterySetup(
  props: MysterySharedProps & {
    onCancel: () => void;
    onCreated: (session: DebateSessionV1) => void;
  },
): React.JSX.Element {
  const stableSetupId = useId();
  const [preset, setPreset] = useState<DebateMysteryPresetId>("compact");
  const [difficulty, setDifficulty] =
    useState<DebateMysteryDifficulty>("classic");
  const [artMode, setArtMode] = useState<DebateMysteryArtMode>("bundled");
  const [inspiration, setInspiration] = useState("");
  const [nonce, setNonce] = useState(`surprise-${stableSetupId}`);
  const [floors, setFloors] = useState(1);
  const [totalRooms, setTotalRooms] = useState(5);
  const [customSuspectCount, setCustomSuspectCount] = useState(4);
  const initialSuspects = fillCast(props.bots, [], 4);
  const initialProsecutorBotId = props.bots.find(
    (bot) => !initialSuspects.includes(bot.id),
  )?.id ?? "";
  const suggestedDefenseBotId = props.bots.find(
    (bot) => !initialSuspects.includes(bot.id) && bot.id !== initialProsecutorBotId,
  )?.id ?? "";
  const [suspectSelection, setSuspectSelection] = useState(initialSuspects);
  const [prosecutorPartnerBotId, setProsecutorPartnerBotId] = useState(
    initialProsecutorBotId,
  );
  const [rivalDefenseBotId, setRivalDefenseBotId] = useState(
    suggestedDefenseBotId,
  );
  const [importCode, setImportCode] = useState("");
  const [inspectedSeed, setInspectedSeed] =
    useState<InspectedMysterySeed | null>(null);
  const [importAssignments, setImportAssignments] = useState<
    Record<string, string>
  >({});
  const [compiling, setCompiling] = useState(false);
  const [compileStageIndex, setCompileStageIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const targetSuspects =
    preset === "custom" ? customSuspectCount : presetSuspectCount(preset);
  const whodunnitCastCandidates = useMemo(
    () => distinctWhodunnitCastBotIds(props.bots),
    [props.bots],
  );
  const suspectBotIds = useMemo(
    () =>
      fillCast(
        props.bots,
        suspectSelection,
        targetSuspects,
        [prosecutorPartnerBotId, rivalDefenseBotId],
      ),
    [
      props.bots,
      prosecutorPartnerBotId,
      rivalDefenseBotId,
      suspectSelection,
      targetSuspects,
    ],
  );
  const whodunnitCastRequirement = minimumWhodunnitBotsForCast(targetSuspects);
  const canRandomizeCast = whodunnitCastCandidates.length >= whodunnitCastRequirement;
  const castPoolError =
    whodunnitCastCandidates.length < whodunnitCastRequirement
      ? `Whodunnit needs ${whodunnitCastRequirement} Library bots for ${targetSuspects} suspects, prosecutor partner, and rival defense.`
      : null;

  useEffect(() => {
    if (!compiling) return;
    const timer = window.setInterval(() => {
      setCompileStageIndex((current) =>
        Math.min(current + 1, COMPILATION_STAGES.length - 1),
      );
    }, 2_700);
    return () => window.clearInterval(timer);
  }, [compiling]);

  const config = useMemo<DebateWhodunnitCreateConfigV1>(
    () => ({
      version: DEBATE_MYSTERY_SCHEMA_VERSION,
      preset,
      difficulty,
      artMode,
      inspiration,
      nonce,
      ...(preset === "custom" ? { floors, totalRooms } : {}),
      suspectBotIds,
      prosecutorPartnerBotId,
      rivalDefenseBotId,
    }),
    [
      artMode,
      difficulty,
      floors,
      inspiration,
      nonce,
      preset,
      prosecutorPartnerBotId,
      rivalDefenseBotId,
      suspectBotIds,
      totalRooms,
    ],
  );
  const resolved = useMemo(() => {
    try {
      return { value: resolveDebateMysteryConfig(config), error: null };
    } catch (caught) {
      return {
        value: null,
        error: caught instanceof Error ? caught.message : "The cast is incomplete.",
      };
    }
  }, [config]);
  const recipeSeed = resolved.value
    ? debateMysteryRecipeSeed(resolved.value)
    : "Recipe seed forms when the cast is complete";
  const botById = useMemo(
    () => new Map(props.bots.map((bot) => [bot.id, bot])),
    [props.bots],
  );
  const selectedBots = new Set([
    ...suspectBotIds,
    prosecutorPartnerBotId,
    rivalDefenseBotId,
  ]);

  const choosePreset = (next: DebateMysteryPresetId): void => {
    setPreset(next);
    const descriptor = DEBATE_MYSTERY_PRESETS.find(
      (candidate) => candidate.id === next,
    );
    if (descriptor) {
      setFloors(descriptor.floors);
      setTotalRooms(descriptor.rooms);
      setCustomSuspectCount(descriptor.suspects);
    }
    setNonce(mysteryId("recipe"));
  };

  const randomizeCast = (): void => {
    setError(null);
    const allocation = randomizeWhodunnitCast(
      whodunnitCastCandidates.map((botId) => ({ id: botId })),
      targetSuspects,
    );
    if (!allocation) {
      setError(
        `Whodunnit needs ${whodunnitCastRequirement} Library bots for ${
          targetSuspects
        } suspects, prosecutor partner, and rival defense.`,
      );
      return;
    }
    setSuspectSelection(allocation.suspectBotIds);
    setProsecutorPartnerBotId(allocation.prosecutorPartnerBotId);
    setRivalDefenseBotId(allocation.rivalDefenseBotId);
    setNonce(mysteryId("recipe"));
  };

  const toggleSuspect = (botId: string): void => {
    if (botId === prosecutorPartnerBotId || botId === rivalDefenseBotId) return;
    setSuspectSelection((currentSelection) => {
      const current = fillCast(
        props.bots,
        currentSelection,
        targetSuspects,
        [prosecutorPartnerBotId, rivalDefenseBotId],
      );
      if (current.includes(botId)) return current.filter((id) => id !== botId);
      if (current.length >= targetSuspects) return [...current.slice(1), botId];
      return [...current, botId];
    });
  };

  const parsedImportCode = (): DebateMysteryCaseCodeV1 => {
    try {
      return JSON.parse(importCode) as DebateMysteryCaseCodeV1;
    } catch {
      throw new Error("Paste the complete JSON Case Seed from another Archive.");
    }
  };

  const inspectSeed = async (): Promise<void> => {
    setError(null);
    try {
      const result = await props.request<{ manifest: InspectedMysterySeed }>(
        "/api/debates/mystery-seed/inspect",
        mysteryRequestBody({ caseCode: parsedImportCode() }),
      );
      const used = new Set<string>();
      const assignments: Record<string, string> = {};
      for (const seat of result.manifest.seats) {
        const suggested = seat.suggestedBotId;
        const fallback = props.bots.find(
          (bot) =>
            !used.has(bot.id) &&
            bot.id !== prosecutorPartnerBotId &&
            bot.id !== rivalDefenseBotId,
        )?.id;
        const botId = suggested && !used.has(suggested) ? suggested : fallback;
        if (botId) {
          assignments[seat.seatId] = botId;
          used.add(botId);
        }
      }
      setInspectedSeed(result.manifest);
      setImportAssignments(assignments);
    } catch (caught) {
      setInspectedSeed(null);
      setError(caught instanceof Error ? caught.message : "Case Seed inspection failed.");
    }
  };

  const prepareGeneratedAssets = async (
    session: DebateSessionV1,
  ): Promise<DebateSessionV1> => {
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(session.id)}/mystery-assets/prepare`,
        mysteryRequestBody({}),
      );
      return result.session;
    } catch {
      // Art is presentation-only. The server deliberately preserves the
      // aligned bundled room and keyword emoji when generation cannot finish.
      return session;
    }
  };

  const startCase = async (): Promise<void> => {
    if (!resolved.value || compiling) return;
    setCompiling(true);
    setCompileStageIndex(0);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates",
        mysteryRequestBody({
          format: "whodunnit",
          whodunnit: config,
          preferredProvider: props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo === true,
          idempotencyKey: mysteryId("mystery-create"),
        }),
      );
      const session = config.artMode === "generated"
        ? await prepareGeneratedAssets(result.session)
        : result.session;
      props.onCreated(session);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "PRISM could not compile the case.",
      );
      setCompiling(false);
    }
  };

  const importCase = async (): Promise<void> => {
    if (!inspectedSeed || compiling) return;
    const assigned = inspectedSeed.seats.map((seat) => ({
      seatId: seat.seatId,
      botId: importAssignments[seat.seatId] ?? "",
    }));
    if (
      assigned.some((entry) => !entry.botId) ||
      new Set(assigned.map((entry) => entry.botId)).size !== assigned.length
    ) {
      setError("Assign one different Library bot to every hidden role seat.");
      return;
    }
    setCompiling(true);
    setCompileStageIndex(0);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates/mystery-seed/import",
        mysteryRequestBody({
          caseCode: parsedImportCode(),
          seatAssignments: assigned,
          prosecutorPartnerBotId,
          rivalDefenseBotId,
          preferredProvider: props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo === true,
          idempotencyKey: mysteryId("mystery-import"),
        }),
      );
      const session = await prepareGeneratedAssets(result.session);
      props.onCreated(session);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Case Seed import failed.");
      setCompiling(false);
    }
  };

  if (compiling) {
    const stage = COMPILATION_STAGES[compileStageIndex]!;
    return (
      <main className={styles.compiler} data-theme="dark">
        <button type="button" onClick={props.onCancel} className={styles.exitButton}>
          ← Leave compilation
        </button>
        <section className={styles.compilerCard} aria-live="polite">
          <div className={styles.casePrism} aria-hidden="true">◇</div>
          <p className={styles.eyebrow}>PRISM / Casekeeper</p>
          <h1>Compiling your murder mystery</h1>
          <strong>{stage[1]}</strong>
          <div className={styles.compileRail} aria-label={stage[1]}>
            {COMPILATION_STAGES.map(([id, label], index) => (
              <span
                key={id}
                data-complete={index < compileStageIndex ? "true" : undefined}
                data-active={index === compileStageIndex ? "true" : undefined}
                title={label}
              />
            ))}
          </div>
          <p className={styles.compilePromise}>Your private notebook will be waiting when the doors open.</p>
          <small>The mansion, testimony, and three valid proof routes are being checked before play.</small>
          {error ? <p className={styles.error}>{error}</p> : null}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.setup} data-theme="dark">
      <header className={styles.setupHeader}>
        <button type="button" onClick={props.onCancel} className={styles.exitButton}>
          ← Debate Studio
        </button>
        <div>
          <p className={styles.eyebrow}>PRISM / Debate</p>
          <h1>Whodunnit?</h1>
          <span>A Murder Mystery</span>
        </div>
        <small>Fictional, non-canonical case</small>
      </header>

      <div className={styles.setupGrid}>
        <section className={styles.setupMain}>
          <div className={styles.setupSection} data-tutorial-target="whodunnit-preset">
            <header>
              <div><small>01</small><h2>Choose the scale</h2></div>
              <span>{resolved.value?.actionBudget ?? "—"} actions</span>
            </header>
            <div className={styles.presetGrid}>
              {DEBATE_MYSTERY_PRESETS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  data-selected={preset === option.id ? "true" : undefined}
                  onClick={() => choosePreset(option.id)}
                >
                  <strong>{option.id[0]!.toUpperCase() + option.id.slice(1)}</strong>
                  <span>{option.floors} floor{option.floors === 1 ? "" : "s"} · {option.rooms} rooms</span>
                  <small>{option.suspects} suspects · {option.classicActions} Classic actions</small>
                </button>
              ))}
              <button
                type="button"
                data-selected={preset === "custom" ? "true" : undefined}
                onClick={() => choosePreset("custom")}
              >
                <strong>Custom</strong>
                <span>1–3 floors · 5–18 rooms</span>
                <small>4–8 suspects</small>
              </button>
            </div>
            {preset === "custom" ? (
              <div className={styles.advancedGrid}>
                <label>Floors <input type="number" min={1} max={3} value={floors} onChange={(event) => { const nextFloors = Math.max(1, Math.min(3, Number(event.currentTarget.value) || 1)); setFloors(nextFloors); setTotalRooms(Math.min(18, Math.max(customSuspectCount + 1, nextFloors * 5))); }} /></label>
                <label>Rooms <input type="number" min={Math.max(5, customSuspectCount + 1)} max={18} value={totalRooms} onChange={(event) => setTotalRooms(Number(event.currentTarget.value))} /></label>
                <label>Suspects <input type="number" min={4} max={8} value={customSuspectCount} onChange={(event) => setCustomSuspectCount(Number(event.currentTarget.value))} /></label>
              </div>
            ) : null}
          </div>

          <div className={styles.setupSection} data-tutorial-target="whodunnit-cast">
            <header>
              <div><small>02</small><h2>Cast the suspects</h2></div>
              <div className={styles.mysteryCastHeaderActions}>
                <span>{suspectBotIds.length} / {targetSuspects}</span>
                <button
                  type="button"
                  onClick={() => void randomizeCast()}
                  disabled={!canRandomizeCast}
                  className={styles.castRandomizeButton}
                  aria-label="Randomly assign all Whodunnit cast roles"
                  title={canRandomizeCast
                    ? `Pick ${targetSuspects} suspects plus 2 counsel bots`
                    : `Need at least ${whodunnitCastRequirement} Library bots`}
                  data-tutorial-target="whodunnit-random-cast"
                >
                  <span aria-hidden="true">
                    {props.renderBotGlyph("dice", { size: 18, strokeWidth: 1.8 })}
                  </span>
                  <strong>Surprise me</strong>
                  <small>Random cast</small>
                </button>
              </div>
            </header>
            <p>Every selected bot remains active. PRISM authors the victim, then secretly assigns the murderer.</p>
            <div className={styles.botGrid}>
              {props.bots.map((bot) => {
                const suspect = suspectBotIds.includes(bot.id);
                const counsel = bot.id === prosecutorPartnerBotId || bot.id === rivalDefenseBotId;
                return (
                  <button
                    type="button"
                    key={bot.id}
                    data-selected={suspect ? "true" : undefined}
                    disabled={counsel}
                    onClick={() => toggleSuspect(bot.id)}
                    style={{ "--mystery-bot-color": bot.color ?? "#9c7cff" } as CSSProperties}
                    aria-pressed={suspect}
                  >
                    <span>{props.renderBotGlyph(bot.glyph, { size: 23, strokeWidth: 1.5 })}</span>
                    <strong>{bot.name}</strong>
                    <small>{counsel ? "Counsel" : suspect ? "Suspect" : "Available"}</small>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.setupSection} data-tutorial-target="whodunnit-counsel">
            <header><div><small>03</small><h2>Choose counsel</h2></div></header>
            <div className={styles.counselGrid}>
              <label>
                <span>Prosecutor partner</span>
                <select value={prosecutorPartnerBotId} onChange={(event) => setProsecutorPartnerBotId(event.currentTarget.value)}>
                  <option value="">Choose your partner</option>
                  {props.bots.filter((bot) => !suspectBotIds.includes(bot.id) && bot.id !== rivalDefenseBotId).map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
                </select>
                <small>Reads discovered facts and your fallible notebook during consultation.</small>
              </label>
              <label>
                <span>Rival defense</span>
                <select value={rivalDefenseBotId} onChange={(event) => setRivalDefenseBotId(event.currentTarget.value)}>
                  <option value="">Choose defense counsel</option>
                  {props.bots.filter((bot) => !suspectBotIds.includes(bot.id) && bot.id !== prosecutorPartnerBotId).map((bot) => <option key={bot.id} value={bot.id}>{bot.id === suggestedDefenseBotId ? `PRISM suggests · ${bot.name}` : bot.name}</option>)}
                </select>
                <small>Receives only the admissible public record and argues its strongest alternative.</small>
              </label>
            </div>
          </div>
        </section>

        <aside className={styles.setupAside}>
          <div className={styles.caseDial}>
            <p className={styles.eyebrow}>Case direction</p>
            <label>Inspiration <input value={inspiration} maxLength={240} onChange={(event) => setInspiration(event.currentTarget.value)} placeholder="Surprise Me" /></label>
            <label>Difficulty <select value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value as DebateMysteryDifficulty)}><option value="casual">Casual</option><option value="classic">Classic</option><option value="mastermind">Mastermind</option></select></label>
            <label>Room art <select value={artMode} onChange={(event) => setArtMode(event.currentTarget.value as DebateMysteryArtMode)}><option value="bundled">Bundled PRISM rooms</option><option value="generated">Generated reskins</option></select></label>
            <button type="button" className={styles.seedButton} onClick={() => setNonce(mysteryId("recipe"))}>
              <span>Recipe Seed</span><code>{recipeSeed}</code><small>Change the recipe</small>
            </button>
          </div>
          <div className={styles.castSummary}>
            <strong>The ensemble</strong>
            {[...selectedBots].filter(Boolean).map((id) => {
              const bot = botById.get(id);
              if (!bot) return null;
              return <span key={id}><i style={{ background: bot.color ?? "#9c7cff" }} />{bot.name}</span>;
            })}
          </div>
          <details className={styles.seedImport} data-tutorial-target="whodunnit-seed-import">
            <summary>Import a shared Case Seed</summary>
            <textarea
              value={importCode}
              onChange={(event) => {
                setImportCode(event.currentTarget.value);
                setInspectedSeed(null);
              }}
              placeholder="Paste the Case Seed JSON…"
            />
            <button type="button" disabled={!importCode.trim()} onClick={() => void inspectSeed()}>
              Inspect without spoilers
            </button>
            {inspectedSeed ? (
              <div className={styles.seedMapping}>
                <strong>{inspectedSeed.title}</strong>
                <small>{inspectedSeed.floors} floor{inspectedSeed.floors === 1 ? "" : "s"} · {inspectedSeed.totalRooms} rooms · {inspectedSeed.seats.length} hidden seats</small>
                {inspectedSeed.seats.map((seat, index) => (
                  <label key={seat.seatId}>
                    Role seat {index + 1}
                    <select
                      value={importAssignments[seat.seatId] ?? ""}
                      onChange={(event) => {
                        const value = event.currentTarget.value;
                        setImportAssignments((current) => ({ ...current, [seat.seatId]: value }));
                      }}
                    >
                      <option value="">Assign a Library bot</option>
                      {props.bots
                        .filter((bot) => bot.id !== prosecutorPartnerBotId && bot.id !== rivalDefenseBotId)
                        .map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
                    </select>
                  </label>
                ))}
                <button type="button" onClick={() => void importCase()}>
                  Compile imported case
                </button>
              </div>
            ) : null}
          </details>
            {error || resolved.error || castPoolError
              ? <p className={styles.error}>{error ?? resolved.error ?? castPoolError}</p> : null}
          <button
            type="button"
            className={styles.compileButton}
            disabled={!resolved.value || props.bots.length < whodunnitCastRequirement}
            onClick={() => void startCase()}
            data-tutorial-target="whodunnit-compile"
          >
            <span aria-hidden="true">◇</span>
            Compile the case
            <small>Settings and cast freeze here</small>
          </button>
        </aside>
      </div>
    </main>
  );
}

interface NotebookResponse {
  notebook: DebateMysteryNotebookV1;
  cleanupProposal: DebateMysteryNotebookCleanupProposalV1 | null;
}

type MysteryClientAction<T = DebateMysteryActionRequestV1> = T extends unknown
  ? Omit<T, "expectedRevision" | "idempotencyKey">
  : never;

function roomTemplate(templateId: string | null) {
  return (
    DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === templateId) ??
    DEBATE_MYSTERY_ROOM_TEMPLATES[0]!
  );
}

function regionClip(region: DebateMysteryRegionV1): string {
  return `polygon(${region.polygon.map((point) => `${point.x}% ${point.y}%`).join(", ")})`;
}

function blankTheory(): DebateMysteryTheoryV1 {
  return {
    culpritSeatId: null,
    method: "",
    motive: "",
    opportunity: "",
    accompliceSeatId: null,
    evidenceIds: [],
    testimonyIds: [],
  };
}

export function DebateMysteryCompilationResume(
  props: MysterySharedProps & {
    session: DebateSessionV1;
    onSessionChange: (session: DebateSessionV1) => void;
    onExit: () => void;
  },
): React.JSX.Element {
  const state = props.session.formatState as DebateWhodunnitFormatStateV1;
  const request = props.request;
  const onSessionChange = props.onSessionChange;
  const sessionId = props.session.id;
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void request<{ session: DebateSessionV1 }>(
      `/api/debates/${encodeURIComponent(sessionId)}/mystery-resume-compilation`,
      mysteryRequestBody({}),
    ).then((result) => {
      if (!cancelled) onSessionChange(result.session);
    }).catch((caught) => {
      if (!cancelled) setError(caught instanceof Error ? caught.message : "Compilation could not resume.");
    });
    return () => { cancelled = true; };
  }, [attempt, onSessionChange, request, sessionId]);

  return (
    <main className={styles.compiler} data-theme="dark">
      <button type="button" onClick={props.onExit} className={styles.exitButton}>← Archive</button>
      <section className={styles.compilerCard} aria-live="polite">
        <div className={styles.casePrism} aria-hidden="true">◇</div>
        <p className={styles.eyebrow}>PRISM / Durable Casekeeper</p>
        <h1>Resuming your murder mystery</h1>
        <strong>{state.compileStage.replaceAll("_", " ")}</strong>
        <p>The frozen cast, lane, recipe, and partial compilation are intact.</p>
        {error ? <><p className={styles.error}>{error}</p><button type="button" onClick={() => { setError(null); setAttempt((current) => current + 1); }}>Try resuming again</button></> : <small>PRISM is rebuilding only the unfinished private stages.</small>}
      </section>
    </main>
  );
}

export function DebateMysteryPlay(
  props: MysterySharedProps & {
    session: DebateSessionV1;
    onSessionChange: (session: DebateSessionV1) => void;
    onExit: () => void;
  },
): React.JSX.Element {
  const state = props.session.formatState as DebateWhodunnitFormatStateV1;
  const request = props.request;
  const onSessionChange = props.onSessionChange;
  const sessionId = props.session.id;
  const mysterySessionResetIdRef = useRef(sessionId);
  const [floor, setFloor] = useState(
    state.rooms.find((room) => room.id === state.currentRoomId)?.floor ?? 1,
  );
  const [selectedRoomId, setSelectedRoomId] = useState(state.currentRoomId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [questionCaret, setQuestionCaret] = useState(0);
  const [suspectRoomFocus, setSuspectRoomFocus] = useState<"observe" | "interview" | "search">("observe");
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [stageNarration, setStageNarration] = useState<{ label: string; text: string } | null>(() => {
    const opening = state.partnerJournal.length === 1 ? state.partnerJournal[0] : null;
    return opening ? { label: "Casekeeper", text: opening } : null;
  });
  const [armedAccessItemId, setArmedAccessItemId] = useState<string | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const [lens, setLens] = useState({ x: 50, y: 50, proximity: 0, visible: false, regionId: null as string | null });
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamedReply, setStreamedReply] = useState("");
  const [streamingPlayerMessageId, setStreamingPlayerMessageId] = useState<string | null>(null);
  const [streamedPlayerQuestion, setStreamedPlayerQuestion] = useState("");
  const [playerSpeechTiming, setPlayerSpeechTiming] = useState<MysterySpeechTiming | null>(null);
  const [interviewGenerating, setInterviewGenerating] = useState(false);
  const [interviewSpeechTiming, setInterviewSpeechTiming] =
    useState<MysterySpeechTiming | null>(null);
  const playedInterviewMessageRef = useRef(state.interviewLog.at(-1)?.id ?? null);
  const interviewTranscriptRef = useRef<HTMLDivElement | null>(null);
  const [partnerQuestion, setPartnerQuestion] = useState("");
  const [notebook, setNotebook] = useState<DebateMysteryNotebookV1 | null>(null);
  const [cleanupProposal, setCleanupProposal] =
    useState<DebateMysteryNotebookCleanupProposalV1 | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [notebookView, setNotebookView] = useState<"leads" | "notes" | "evidence" | "testimony">("leads");
  const [leadNoteDrafts, setLeadNoteDrafts] = useState<Record<string, string>>({});
  const [notebookSaving, setNotebookSaving] = useState(false);
  const [notebookError, setNotebookError] = useState<string | null>(null);
  const [pendingAutoPolish, setPendingAutoPolish] = useState<{ pageId: string; blockId: string } | null>(null);
  const savedPagesRef = useRef("");
  const notebookReadyRef = useRef(false);
  const [theory, setTheory] = useState<DebateMysteryTheoryV1>(
    state.theory ?? blankTheory(),
  );
  const [theoryBoardOpen, setTheoryBoardOpen] = useState(false);
  const [caseFileOpen, setCaseFileOpen] = useState(false);
  const [caseFileTab, setCaseFileTab] = useState<
    "partner" | "leads" | "access" | "evidence" | "testimony"
  >("partner");
  const [presentEvidenceId, setPresentEvidenceId] = useState<string>("");
  const [courtStatement, setCourtStatement] = useState("");
  const [caseCode, setCaseCode] = useState<string | null>(null);
  const [evidenceExhibitId, setEvidenceExhibitId] = useState<string | null>(null);
  const [spoilerRecord, setSpoilerRecord] = useState<Record<string, unknown> | null>(null);
  const [replayActions, setReplayActions] = useState<Array<{
    sequence: number;
    action: string;
    occurredAt: string;
  }>>([]);

  const currentRoom =
    state.rooms.find((room) => room.id === state.currentRoomId) ?? state.rooms[0]!;
  const selectedRoom =
    state.rooms.find((room) => room.id === selectedRoomId) ?? currentRoom;
  const template = roomTemplate(currentRoom.templateId);
  const roomArtworkSrc = mysteryRoomArtworkSrc(currentRoom.imageId, template);
  const activeRegions = template.regions.filter(
    (region) => currentRoom.activeRegionIds.includes(region.id),
  );
  const currentSuspect = state.suspects.find(
    (suspect) => suspect.roomId === currentRoom.id,
  );
  const suggestedLeads = currentSuspect
    ? state.config.difficulty === "mastermind"
      ? [
          `Which detail of your movements are you least certain about?`,
          `Whose account deserves a second hearing?`,
          `What ordinary detail in ${currentRoom.name ?? "this room"} could be misleading us?`,
        ]
      : [
          `Give me your exact timeline around the victim’s death.`,
          `What did you notice elsewhere in the mansion tonight?`,
          state.config.difficulty === "casual"
            ? `Name the person whose alibi I should verify next, and why.`
            : `What was your relationship with the victim?`,
        ]
    : [];
  const currentInterview = currentSuspect
    ? state.interviewLog.filter((message) => message.suspectSeatId === currentSuspect.seatId)
    : [];
  const evidenceMentionToken = findAtMentionTokenPlain(question, questionCaret);
  const evidenceMentionPicks = evidenceMentionToken
    ? filterMysteryMentions(mysteryMentionPicks(state), evidenceMentionToken.query)
    : [];
  const partnerMentionToken = findAtMentionTokenPlain(partnerQuestion, partnerQuestion.length);
  const partnerMentionPicks = partnerMentionToken
    ? filterMysteryMentions(mysteryMentionPicks(state, true), partnerMentionToken.query)
    : [];
  const botById = useMemo(
    () => new Map(props.bots.map((bot) => [bot.id, bot])),
    [props.bots],
  );
  const mysteryBotForSuspect = useCallback(
    (suspect: DebateWhodunnitFormatStateV1["suspects"][number]): MysteryBotSummary =>
      botById.get(suspect.botId) ?? {
        id: suspect.botId,
        name: suspect.name,
        color: suspect.color,
        glyph: suspect.glyph,
        hardMuted: false,
      },
    [botById],
  );
  // Debate builds these voice/avatar bridges inline. Keep their newest
  // implementations available without making an active transcript stream
  // restart whenever the parent surface renders.
  const playMysteryVoiceRef = useRef(props.playMysteryVoice);
  playMysteryVoiceRef.current = props.playMysteryVoice;
  const mysteryBotForSuspectRef = useRef(mysteryBotForSuspect);
  mysteryBotForSuspectRef.current = mysteryBotForSuspect;
  const mysterySuspectsRef = useRef(state.suspects);
  mysterySuspectsRef.current = state.suspects;
  const partner = botById.get(props.session.forAdvocate.id);
  const defense = botById.get(props.session.againstAdvocate.id);
  const activeTestimony = state.court?.activeTestimonyId
    ? state.testimony.find((entry) => entry.id === state.court?.activeTestimonyId)
    : null;

  const announceAction = useCallback((message: string): void => {
    setActionFeedback(message);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => {
      setActionFeedback(null);
      feedbackTimerRef.current = null;
    }, 2_200);
  }, []);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const refreshNotebook = useCallback(async (): Promise<DebateMysteryNotebookV1 | null> => {
    try {
      const result = await request<NotebookResponse>(
        `/api/debates/${encodeURIComponent(sessionId)}/notebook`,
      );
      savedPagesRef.current = JSON.stringify(result.notebook.pages);
      notebookReadyRef.current = true;
      setNotebook(result.notebook);
      setCleanupProposal(result.cleanupProposal);
      setActivePageId((current) => current ?? result.notebook.pages[0]?.id ?? null);
      setNotebookError(null);
      return result.notebook;
    } catch (caught) {
      setNotebookError(caught instanceof Error ? caught.message : "Notebook unavailable.");
      return null;
    }
  }, [request, sessionId]);

  useEffect(() => {
    void refreshNotebook();
  }, [refreshNotebook]);

  useEffect(() => {
    setSuspectRoomFocus("observe");
    setQuestion("");
    setQuestionCaret(0);
  }, [state.currentRoomId]);

  useEffect(() => {
    if (mysterySessionResetIdRef.current === sessionId) return;
    mysterySessionResetIdRef.current = sessionId;
    setFloor(state.rooms.find((room) => room.id === state.currentRoomId)?.floor ?? 1);
    setSelectedRoomId(state.currentRoomId);
  }, [sessionId, state.currentRoomId, state.rooms]);

  useEffect(() => {
    if (armedAccessItemId && !state.inventoryItems.some((item) => item.id === armedAccessItemId && item.usable)) {
      setArmedAccessItemId(null);
    }
  }, [armedAccessItemId, state.inventoryItems]);

  const latestInterviewMessage = state.interviewLog.at(-1);

  useEffect(() => {
    if (suspectRoomFocus !== "interview") return;
    const transcript = interviewTranscriptRef.current;
    if (!transcript) return;
    const frame = window.requestAnimationFrame(() => {
      transcript.scrollTop = transcript.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentInterview.length, interviewGenerating, streamedPlayerQuestion, streamedReply, suspectRoomFocus]);
  const latestInterviewMessageRef = useRef(latestInterviewMessage);
  latestInterviewMessageRef.current = latestInterviewMessage;
  const latestInterviewContent = latestInterviewMessage?.content;
  const latestInterviewId = latestInterviewMessage?.id;
  const latestInterviewRole = latestInterviewMessage?.role;
  const latestInterviewSeatId = latestInterviewMessage?.suspectSeatId;

  useEffect(() => {
    const latest = latestInterviewMessageRef.current;
    if (!latest || latest.role !== "suspect" || latest.id === playedInterviewMessageRef.current) return;
    playedInterviewMessageRef.current = latest.id;
    setStreamingMessageId(latest.id);
    setStreamedReply("");
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed = Math.min(latest.content.length, revealed + Math.max(2, Math.ceil(latest.content.length / 90)));
      setStreamedReply(latest.content.slice(0, revealed));
      if (revealed >= latest.content.length) {
        window.clearInterval(timer);
        setStreamedReply(latest.content);
        setStreamingMessageId((current) => current === latest.id ? null : current);
      }
    }, 22);
    const suspect = mysterySuspectsRef.current.find((entry) => entry.seatId === latest.suspectSeatId);
    if (suspect) {
      void playMysteryVoiceRef.current?.(
        sessionId,
        mysteryBotForSuspectRef.current(suspect),
        latest.content,
        latest.id,
        {
          onStart: (durationMs, alignment) => {
            setInterviewSpeechTiming({
              text: latest.content,
              elapsedMs: 0,
              durationMs: Math.max(1, durationMs ?? latest.content.length * 42),
              alignment: alignment ?? null,
            });
          },
          onProgress: (elapsedMs, durationMs) => {
            setInterviewSpeechTiming((current) =>
              current?.text === latest.content
                ? {
                    ...current,
                    elapsedMs: Math.min(Math.max(0, elapsedMs), Math.max(1, durationMs)),
                    durationMs: Math.max(1, durationMs),
                  }
                : current,
            );
          },
          onEnd: () => setInterviewSpeechTiming((current) => current?.text === latest.content ? null : current),
          onCancel: () => setInterviewSpeechTiming((current) => current?.text === latest.content ? null : current),
        },
      );
    }
    return () => {
      window.clearInterval(timer);
      // React development replay and a rapid session refresh can dispose this
      // effect after speech has already started. Never leave the visible
      // transcript stranded at a partial word while the voice continues.
      setStreamedReply(latest.content);
      setStreamingMessageId((current) => current === latest.id ? null : current);
    };
  }, [
    latestInterviewContent,
    latestInterviewId,
    latestInterviewRole,
    latestInterviewSeatId,
    sessionId,
  ]);

  useEffect(() => {
    if (state.playPhase !== "verdict") return;
    let cancelled = false;
    void request<{
      actions: Array<{ sequence: number; action: string; occurredAt: string }>;
    }>(`/api/debates/${encodeURIComponent(sessionId)}/mystery-actions`)
      .then((result) => {
        if (!cancelled) setReplayActions(result.actions);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [request, sessionId, state.playPhase]);

  useEffect(() => {
    if (!notebook || !notebookReadyRef.current) return;
    const serialized = JSON.stringify(notebook.pages);
    if (serialized === savedPagesRef.current) return;
    const timer = window.setTimeout(async () => {
      setNotebookSaving(true);
      setNotebookError(null);
      try {
        const result = await request<NotebookResponse>(
          `/api/debates/${encodeURIComponent(sessionId)}/notebook`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operation: "replace",
              expectedRevision: notebook.revision,
              idempotencyKey: mysteryId("notebook-save"),
              pages: notebook.pages,
            }),
          },
        );
        savedPagesRef.current = JSON.stringify(result.notebook.pages);
        setNotebook((current) =>
          current && JSON.stringify(current.pages) !== serialized
            ? { ...current, revision: result.notebook.revision }
            : result.notebook,
        );
        setCleanupProposal(result.cleanupProposal);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Notebook autosave failed.";
        // A mystery action can add an automatic, private reference while this
        // window is autosaving. That is not a competing editor: retain local
        // writing, fold in server-only reference blocks, and retry at the new
        // revision. A genuine second-window edit still remains visible.
        if (/notebook changed in another window/iu.test(message)) {
          try {
            const result = await request<NotebookResponse>(
              `/api/debates/${encodeURIComponent(sessionId)}/notebook`,
            );
            const latest = result.notebook;
            savedPagesRef.current = JSON.stringify(latest.pages);
            setCleanupProposal(result.cleanupProposal);
            setNotebook((current) => {
              const localNotebook = current ?? notebook;
              const localPages = new Map(localNotebook.pages.map((page) => [page.id, page]));
              const mergedPages = latest.pages.map((serverPage) => {
                const localPage = localPages.get(serverPage.id);
                if (!localPage) return serverPage;
                const localBlockIds = new Set(localPage.blocks.map((block) => block.id));
                return {
                  ...localPage,
                  blocks: [
                    ...localPage.blocks,
                    ...serverPage.blocks.filter((block) => !localBlockIds.has(block.id)),
                  ],
                };
              });
              for (const localPage of localNotebook.pages) {
                if (!latest.pages.some((page) => page.id === localPage.id)) mergedPages.push(localPage);
              }
              return { ...localNotebook, revision: latest.revision, pages: mergedPages };
            });
            setNotebookError(null);
            return;
          } catch {
            // Fall through to the original conflict below when the fresh
            // server document cannot be read and safely rebased.
          }
        }
        setNotebookError(message);
      } finally {
        setNotebookSaving(false);
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [notebook, refreshNotebook, request, sessionId]);

  const perform = async (
    action: MysteryClientAction,
  ): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/mystery-action`,
        mysteryRequestBody({
          ...action,
          expectedRevision: props.session.revision,
          idempotencyKey: mysteryId(`mystery-${action.action}`),
        }),
      );
      onSessionChange(result.session);
      const next = result.session.formatState as DebateWhodunnitFormatStateV1;
      if (next.playPhase === "trial" || next.playPhase === "verdict") {
        setTheoryBoardOpen(false);
      }
      const nextRoom = next.rooms.find((room) => room.id === next.currentRoomId);
      if (nextRoom) {
        setFloor(nextRoom.floor);
        setSelectedRoomId(nextRoom.id);
      }
      const acquiredEvidence = next.discoveredEvidence.find(
        (item) => !state.discoveredEvidence.some((known) => known.id === item.id),
      );
      if (acquiredEvidence) setEvidenceExhibitId(acquiredEvidence.id);
      const latestJournal = next.partnerJournal.at(-1);
      const journalChanged = latestJournal && latestJournal !== state.partnerJournal.at(-1);
      if (action.action === "travel") {
        setStageNarration(null);
      } else if (action.action === "inspect" && action.regionId && nextRoom) {
        const observation = nextRoom.observations.find(
          (entry) => entry.regionId === action.regionId,
        )?.observation ?? nextRoom.publicObservation;
        if (observation) {
          setStageNarration({ label: "Investigation", text: observation });
        }
      } else if (journalChanged && ["inspect", "use_access_item", "consult_partner"].includes(action.action)) {
        setStageNarration({
          label: action.action === "consult_partner" ? "Co-counsel" : "Investigation",
          text: latestJournal,
        });
      }
      const changedLeads = next.leads.filter((lead) =>
        state.leads.find((current) => current.id === lead.id)?.revision !== lead.revision);
      const changedLeadWasKnown = changedLeads.length === 1
        ? state.leads.some((lead) => lead.id === changedLeads[0]!.id)
        : false;
      const feedback = changedLeads.length === 1
        ? changedLeadWasKnown
          ? `Lead updated · ${changedLeads[0]!.title}`
          : `New lead · ${changedLeads[0]!.title}`
        : changedLeads.length > 1
          ? `${changedLeads.length} leads updated in your notebook.`
          : action.action === "travel"
        ? next.rooms.find((room) => room.id === action.roomId)?.name
          ? `Entered ${next.rooms.find((room) => room.id === action.roomId)?.name}.`
          : "Room selected."
        : action.action === "inspect"
          ? "Area inspected. You can inspect it again at any time."
          : action.action === "use_access_item"
            ? next.accessHistory.at(-1)?.observation ?? "Access attempt recorded."
          : action.action === "interview"
            ? "Question answered."
            : action.action === "consult_partner"
              ? "Co-counsel added an analysis."
              : action.action === "file_theory"
                ? "Charges filed. Court is now in session."
                : action.action.startsWith("court_")
                  ? "Court record updated."
                  : "Case updated.";
      announceAction(feedback);
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That action was unavailable.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const updatePage = (
    pageId: string,
    change: (page: DebateMysteryNotebookPageV1) => DebateMysteryNotebookPageV1,
  ): void => {
    setNotebook((current) =>
      current
        ? {
            ...current,
            pages: current.pages.map((page) =>
              page.id === pageId ? change(page) : page,
            ),
          }
        : current,
    );
  };

  const streamPlayerQuestion = (text: string, messageId: string): void => {
    setStreamingPlayerMessageId(messageId);
    setStreamedPlayerQuestion("");
    let revealed = 0;
    const timer = window.setInterval(() => {
      revealed = Math.min(text.length, revealed + Math.max(2, Math.ceil(text.length / 64)));
      setStreamedPlayerQuestion(text.slice(0, revealed));
      if (revealed >= text.length) window.clearInterval(timer);
    }, 22);
    void props.playMysteryPlayerVoice?.(sessionId, text, messageId, {
      onStart: (durationMs, alignment) => setPlayerSpeechTiming({
        text,
        elapsedMs: 0,
        durationMs: Math.max(1, durationMs ?? text.length * 42),
        alignment: alignment ?? null,
      }),
      onProgress: (elapsedMs, durationMs) => setPlayerSpeechTiming((current) =>
        current?.text === text ? { ...current, elapsedMs, durationMs: Math.max(1, durationMs) } : current,
      ),
      onEnd: () => setPlayerSpeechTiming(null),
      onCancel: () => setPlayerSpeechTiming(null),
    });
  };

  const addNotebookReference = async (
    referenceKind: "room" | "evidence" | "testimony",
    referenceId: string,
    label: string,
  ): Promise<void> => {
    const availableNotebook = notebook ?? await refreshNotebook();
    if (!availableNotebook) return;
    const pageId = activePageId ?? availableNotebook.pages[0]?.id;
    if (!pageId) return;
    setNotebook((current) => {
      const source = current ?? availableNotebook;
      return {
        ...source,
        pages: source.pages.map((page) => page.id === pageId ? {
          ...page,
          blocks: [...page.blocks, {
            id: mysteryId("block"),
            kind: "reference",
            text: `[[${referenceKind}:${referenceId}]] ${label}`,
            referenceKind,
            referenceId,
          }],
        } : page),
      };
    });
    setNotebookView("notes");
    announceAction("Added to Case Notes.");
  };

  const [draftBlockText, setDraftBlockText] = useState("");

  const addAuthoredBlock = (): void => {
    if (!activePageId || !draftBlockText.trim()) return;
    const text = draftBlockText.trim();
    updatePage(activePageId, (page) => ({
      ...page,
      blocks: [
        ...page.blocks,
        {
          id: mysteryId("block"),
          kind: "paragraph",
          text,
        },
      ],
    }));
    setDraftBlockText("");
  };

  const addLeadAnnotation = (leadId: string, leadRevision: number): void => {
    const text = leadNoteDrafts[leadId]?.trim();
    const pageId = activePageId ?? notebook?.pages[0]?.id;
    if (!text || !pageId) return;
    updatePage(pageId, (page) => ({
      ...page,
      blocks: [...page.blocks, {
        id: mysteryId("block"),
        kind: "paragraph",
        text,
        leadId,
        leadRevision,
      }],
    }));
    setLeadNoteDrafts((current) => ({ ...current, [leadId]: "" }));
    announceAction("Note added to lead.");
  };

  const applyCleanupProposal = async (
    sourceNotebook: DebateMysteryNotebookV1,
    proposal: DebateMysteryNotebookCleanupProposalV1,
    announce = false,
  ): Promise<void> => {
    const changesNotebook = proposal.pages.some((page) => {
      const sourcePage = sourceNotebook.pages.find((entry) => entry.id === page.pageId);
      if (!sourcePage) return false;
      const proposedBlocks = page.proposedBlocks.map(({ sourceBlockIds, ...block }) => {
        void sourceBlockIds;
        return block;
      });
      return page.proposedTitle !== sourcePage.title || JSON.stringify(proposedBlocks) !== JSON.stringify(sourcePage.blocks);
    });
    const result = await request<NotebookResponse>(
      `/api/debates/${encodeURIComponent(sessionId)}/notebook`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: changesNotebook ? "accept_cleanup" : "reject_cleanup",
          expectedRevision: sourceNotebook.revision,
          proposalId: proposal.id,
          idempotencyKey: mysteryId(changesNotebook ? "notebook-accept_cleanup" : "notebook-already-polished"),
        }),
      },
    );
    savedPagesRef.current = JSON.stringify(result.notebook.pages);
    setNotebook(result.notebook);
    setCleanupProposal(result.cleanupProposal);
    if (announce) announceAction(changesNotebook ? "Notes polished. Undo is available." : "These notes are already polished.");
  };

  const proposeCleanup = async (
    pageIds?: string[],
    blockIds?: string[],
    autoAccept = false,
  ): Promise<void> => {
    if (!notebook || notebookSaving || JSON.stringify(notebook.pages) !== savedPagesRef.current) return;
    setNotebookError(null);
    try {
      const result = await request<{ proposal: DebateMysteryNotebookCleanupProposalV1 }>(
        `/api/debates/${encodeURIComponent(sessionId)}/notebook/cleanup`,
        mysteryRequestBody({ expectedRevision: notebook.revision, pageIds, blockIds }),
      );
      if (autoAccept) await applyCleanupProposal(notebook, result.proposal, true);
      else setCleanupProposal(result.proposal);
    } catch (caught) {
      setNotebookError(caught instanceof Error ? caught.message : "Cleanup was unavailable.");
    }
  };
  const proposeCleanupRef = useRef(proposeCleanup);
  proposeCleanupRef.current = proposeCleanup;

  const resolveCleanup = async (
    operation: "accept_cleanup" | "reject_cleanup" | "undo",
  ): Promise<void> => {
    if (!notebook) return;
    setNotebookError(null);
    try {
      const result = await request<NotebookResponse>(
        `/api/debates/${encodeURIComponent(sessionId)}/notebook`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            operation,
            expectedRevision: notebook.revision,
            proposalId: cleanupProposal?.id,
            idempotencyKey: mysteryId(`notebook-${operation}`),
          }),
        },
      );
      savedPagesRef.current = JSON.stringify(result.notebook.pages);
      setNotebook(result.notebook);
      setCleanupProposal(result.cleanupProposal);
    } catch (caught) {
      setNotebookError(caught instanceof Error ? caught.message : "Notebook revision failed.");
    }
  };

  useEffect(() => {
    if (!pendingAutoPolish || !notebook || notebookSaving) return;
    if (JSON.stringify(notebook.pages) !== savedPagesRef.current) return;
    const page = notebook.pages.find((entry) => entry.id === pendingAutoPolish.pageId);
    const block = page?.blocks.find((entry) => entry.id === pendingAutoPolish.blockId);
    setPendingAutoPolish(null);
    if (!block?.text.trim()) return;
    void proposeCleanupRef.current([pendingAutoPolish.pageId], [pendingAutoPolish.blockId], true);
  }, [notebook, notebookSaving, pendingAutoPolish]);

  const requestCaseCode = async (): Promise<void> => {
    const result = await request<{ caseCode: DebateMysteryCaseCodeV1 }>(
      `/api/debates/${encodeURIComponent(sessionId)}/mystery-seed`,
    );
    const encoded = JSON.stringify(result.caseCode);
    setCaseCode(encoded);
    await navigator.clipboard?.writeText(encoded).catch(() => undefined);
  };

  const revealSpoilers = async (): Promise<void> => {
    await perform({ action: "reveal_spoilers" });
    const replay = await request<{
      actions: Array<{ sequence: number; action: string; payload: Record<string, unknown>; occurredAt: string }>;
    }>(`/api/debates/${encodeURIComponent(sessionId)}/mystery-actions`);
    setReplayActions(replay.actions);
    const reveal = [...replay.actions].reverse().find((entry) => entry.action === "reveal_spoilers");
    setSpoilerRecord(reveal?.payload ?? null);
  };

  const activePage = notebook?.pages.find((page) => page.id === activePageId) ?? notebook?.pages[0];
  const noteCount = notebook ? debateMysteryNotebookCharacterCount(notebook) : 0;
  const theoryMode = theoryBoardOpen;
  const theoryChecklist = [
    { label: "Accused", complete: Boolean(theory.culpritSeatId) },
    { label: "Method", complete: Boolean(theory.method.trim()) },
    { label: "Motive", complete: Boolean(theory.motive.trim()) },
    { label: "Opportunity", complete: Boolean(theory.opportunity.trim()) },
    { label: "Record", complete: theory.evidenceIds.length + theory.testimonyIds.length > 0 },
  ];
  const theoryReadyCount = theoryChecklist.filter((item) => item.complete).length;
  const inTrial = state.playPhase === "trial";
  const atVerdict = state.playPhase === "verdict" && state.verdict;
  const courtBeats = state.partnerJournal
    .map((entry) => mysteryCourtBeat(entry, state.suspects))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(-3);
  const spoilerTimeline = mysterySpoilerTimeline(spoilerRecord);
  const spoilerEvidence = mysterySpoilerEvidence(spoilerRecord);
  const spoilerProofBundles = mysterySpoilerProofBundles(spoilerRecord);
  const spoilerCulpritSeatId = typeof spoilerRecord?.culpritSeatId === "string" ? spoilerRecord.culpritSeatId : null;
  const spoilerAccompliceSeatId = typeof spoilerRecord?.accompliceSeatId === "string" ? spoilerRecord.accompliceSeatId : null;
  const spoilerCulprit = state.suspects.find((suspect) => suspect.seatId === spoilerCulpritSeatId) ?? null;
  const spoilerAccomplice = state.suspects.find((suspect) => suspect.seatId === spoilerAccompliceSeatId) ?? null;
  const spoilerEvidenceById = new Map([
    ...state.discoveredEvidence.map((item) => [item.id, { title: mysteryEvidenceTitle(item.title) }] as const),
    ...spoilerEvidence.map((item) => [item.id, { title: mysteryEvidenceTitle(item.title) }] as const),
  ]);
  const floorRooms = state.rooms.filter((room) => room.floor === floor);
  const floorMinX = floorRooms.length ? Math.min(...floorRooms.map((room) => room.x)) : 0;
  const floorMinY = floorRooms.length ? Math.min(...floorRooms.map((room) => room.y)) : 0;
  const floorMaxX = Math.max(1, ...floorRooms.map((room) => room.x + room.width));
  const floorMaxY = Math.max(1, ...floorRooms.map((room) => room.y + room.height));
  const floorContentWidth = Math.max(1, floorMaxX - floorMinX);
  const floorContentHeight = Math.max(1, floorMaxY - floorMinY);
  // The blueprint uses one shared scale inside a 4:3 drawing area. Scaling the
  // axes independently makes small rooms look huge and wide rooms look narrow.
  const mapDrawingWidth = 100;
  const mapDrawingHeight = 75;
  const mapPadding = 4;
  const mapScale = Math.min(
    (mapDrawingWidth - mapPadding * 2) / floorContentWidth,
    (mapDrawingHeight - mapPadding * 2) / floorContentHeight,
  );
  const mapOffsetX = (mapDrawingWidth - floorContentWidth * mapScale) / 2;
  const mapOffsetY = (mapDrawingHeight - floorContentHeight * mapScale) / 2;
  const mapX = (value: number): number => mapOffsetX + (value - floorMinX) * mapScale;
  const mapY = (value: number): number => ((mapOffsetY + (value - floorMinY) * mapScale) / mapDrawingHeight) * 100;
  const roomWidthPercent = (width: number): number => width * mapScale;
  const roomHeightPercent = (height: number): number => ((height * mapScale) / mapDrawingHeight) * 100;
  const floorDisplayName = (floorNumber: number): string => {
    const rooms = state.rooms.filter((room) => room.floor === floorNumber);
    if (rooms.some((room) => room.templateId === "rooftop-lounge")) return "Roof";
    const groundFloor = state.rooms.find((room) => room.templateId === "foyer")?.floor ?? 1;
    if (floorNumber === groundFloor) return "Ground floor";
    if (floorNumber < groundFloor) return "Lower floor";
    return "Upper floor";
  };
  const selectFloor = (nextFloor: number): void => {
    setFloor(nextFloor);
    const currentOnFloor = state.rooms.find(
      (room) => room.id === state.currentRoomId && room.floor === nextFloor,
    );
    const firstOnFloor = state.rooms.find((room) => room.floor === nextFloor);
    setSelectedRoomId(currentOnFloor?.id ?? firstOnFloor?.id ?? state.currentRoomId);
    announceAction(`${floorDisplayName(nextFloor)} shown.`);
  };
  const floorDoors: Array<{
    key: string;
    orientation: "vertical" | "horizontal";
    x: number;
    y: number;
  }> = [];
  for (const room of floorRooms) {
    for (const neighborId of room.neighborIds.filter((id) => room.id < id)) {
      const neighbor = floorRooms.find((candidate) => candidate.id === neighborId);
      if (!neighbor) continue;
      const verticalEdge = room.x + room.width === neighbor.x || neighbor.x + neighbor.width === room.x;
      if (verticalEdge) {
        floorDoors.push({
          key: `${room.id}-${neighbor.id}`,
          orientation: "vertical",
          x: room.x + room.width === neighbor.x ? neighbor.x : room.x,
          y: Math.max(room.y, neighbor.y) + (Math.min(room.y + room.height, neighbor.y + neighbor.height) - Math.max(room.y, neighbor.y)) / 2,
        });
      } else {
        floorDoors.push({
          key: `${room.id}-${neighbor.id}`,
          orientation: "horizontal",
          x: Math.max(room.x, neighbor.x) + (Math.min(room.x + room.width, neighbor.x + neighbor.width) - Math.max(room.x, neighbor.x)) / 2,
          y: room.y + room.height === neighbor.y ? neighbor.y : room.y,
        });
      }
    }
  }
  const selectedRoomOccupant =
    state.suspects.find((suspect) => suspect.roomId === selectedRoom.id) ?? null;
  const selectedRoomIsKnown = selectedRoom.discovered === true;
  const selectedRoomClueCount = state.discoveredEvidence.filter(
    (item) => item.roomId === selectedRoom.id,
  ).length;
  const selectedRoomLocked = selectedRoom.locked || (!selectedRoom.discovered && state.actionsRemaining === 0);
  const applyAccessItem = async (
    accessItemId: string,
    targetKind: "item" | "room" | "region",
    targetId: string,
  ): Promise<void> => {
    await perform({ action: "use_access_item", accessItemId, targetKind, targetId });
  };
  const accessItemFromDrag = (event: ReactDragEvent<HTMLElement>): string | null => {
    const itemId = event.dataTransfer.getData("application/x-prism-access-item");
    return state.inventoryItems.some((item) => item.id === itemId && item.usable) ? itemId : null;
  };
  const dropAccessItem = (
    event: ReactDragEvent<HTMLElement>,
    targetKind: "item" | "room" | "region",
    targetId: string,
  ): void => {
    event.preventDefault();
    const itemId = accessItemFromDrag(event);
    if (itemId) void applyAccessItem(itemId, targetKind, targetId);
  };
  const enterSelectedRoom = async (): Promise<void> => {
    await perform({ action: "travel", roomId: selectedRoom.id });
  };
  const selectedRoomActionLabel = selectedRoom.id === currentRoom.id
    ? "Current room"
    : selectedRoom.discovered
      ? "Go to room"
      : "Discover room · 1 action";
  const nearestInvestigationRegion = (x: number, y: number): { regionId: string | null; distance: number } =>
    activeRegions.reduce<{ regionId: string | null; distance: number }>((result, region) => {
      const center = region.polygon.reduce(
        (total, point) => ({ x: total.x + point.x / region.polygon.length, y: total.y + point.y / region.polygon.length }),
        { x: 0, y: 0 },
      );
      const distance = Math.hypot(center.x - x, center.y - y);
      return distance < result.distance ? { regionId: region.id, distance } : result;
    }, { regionId: null, distance: Number.POSITIVE_INFINITY });
  const moveInvestigationLens = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
    const nearest = nearestInvestigationRegion(x, y);
    setLens({ x, y, proximity: Number.isFinite(nearest.distance) ? Math.max(0, 1 - nearest.distance / 26) : 0, visible: true, regionId: nearest.regionId });
  };

  return (
    <main className={styles.play} data-theme="dark" data-phase={state.playPhase}>
      <header className={styles.playHeader}>
        <button type="button" className={styles.exitButton} onClick={props.onExit}>← Archive</button>
        <div className={styles.caseIdentity}>
          <p className={styles.eyebrow}>Whodunnit? · A Murder Mystery · {state.playPhase}</p>
          <strong>{state.caseTitle}</strong>
          <span data-tutorial-target="whodunnit-mission"><b>Mission</b> Determine who killed {state.victim.name}, then prove it in court.</span>
          <small>{state.fictionLabel}</small>
        </div>
        <div className={styles.actionCounter} data-empty={!inTrial && !atVerdict && state.actionsRemaining === 0 ? "true" : undefined}>
          {inTrial
            ? <><small>Credibility</small><strong>{state.credibilityRemaining}</strong></>
            : atVerdict
              ? <><small>Case</small><strong>Closed</strong></>
              : <><small>Actions</small><strong>{state.actionsRemaining}</strong></>}
        </div>
        <div className={styles.hudControls} data-tutorial-target="whodunnit-hud-controls">
          <button type="button" aria-pressed={caseFileOpen} onClick={() => { setCaseFileOpen((current) => !current); announceAction(caseFileOpen ? "Case file closed." : "Case file opened."); }} data-tutorial-target="whodunnit-case-file">Case file</button>
          <button type="button" onClick={() => { setTheoryBoardOpen(true); announceAction("Theory Board opened."); }} data-tutorial-target="whodunnit-theory-control">Theory</button>
        </div>
      </header>

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}

      {atVerdict ? (
        <section className={styles.verdict} data-grade={state.verdict?.grade}>
          <p className={styles.eyebrow}>PRISM’s deterministic verdict</p>
          <h2>{gradeLabel(state.verdict!.grade)}</h2>
          <p>{state.verdict!.reason}</p>
          <div className={styles.verdictStats}><span>Culprit <b>{state.verdict!.culpritCorrect ? "Proved" : "Not proved"}</b></span><span>Credibility <b>{state.verdict!.credibilityRemaining} / 3</b></span></div>
          <div className={styles.verdictActions}>
            <button type="button" onClick={() => void requestCaseCode()}>{caseCode ? "Case Seed copied" : "Copy Case Seed"}</button>
            {!state.spoilersRevealed ? <button type="button" onClick={() => void revealSpoilers()}>Reveal complete case spoilers</button> : null}
          </div>
          {caseCode ? <textarea readOnly value={caseCode} aria-label="Portable Case Seed" /> : null}
          {replayActions.length ? <details className={styles.replayRecord}><summary>Case replay record · {replayActions.length} committed actions</summary><ol>{replayActions.map((entry) => <li key={entry.sequence}><span>{entry.action.replaceAll("_", " ")}</span><time>{new Date(entry.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></li>)}</ol></details> : null}
          {state.spoilersRevealed ? (
            <div className={styles.spoilerDossier}>
              <header className={styles.spoilerTruth}>
                <p className={styles.eyebrow}>Casekeeper’s sealed record</p>
                <small>The truth</small>
                <h3 style={{ "--culprit-color": spoilerCulprit?.color ?? "#ff7185" } as CSSProperties}>{spoilerCulprit?.name ?? "Unknown culprit"}</h3>
                <p>{spoilerAccomplice ? `Aided by ${spoilerAccomplice.name}.` : "The culprit acted alone."}</p>
              </header>
              {spoilerTimeline.length ? (
                <section className={styles.spoilerSection}>
                  <h4>What happened</h4>
                  <ol className={styles.spoilerTimeline}>{spoilerTimeline.map((entry, index) => <li key={`${entry.at}:${index}`}><time>{entry.at}</time><p>{entry.fact}</p></li>)}</ol>
                </section>
              ) : null}
              {spoilerEvidence.length ? (
                <section className={styles.spoilerSection}>
                  <h4>Clues left behind</h4>
                  <div className={styles.spoilerEvidenceGrid}>{spoilerEvidence.map((item) => <article key={item.id}><span aria-hidden="true">{mysteryEvidenceEmoji(item)}</span><div><strong>{mysteryEvidenceTitle(item.title)}</strong><p>{mysteryEvidenceObservation(item.observation)}</p></div></article>)}</div>
                </section>
              ) : null}
              {spoilerProofBundles.length ? (
                <section className={styles.spoilerSection}>
                  <h4>The three ways to prove it</h4>
                  <div className={styles.spoilerRoutes}>{spoilerProofBundles.map((bundle) => (
                    <article key={bundle.id} data-grade={bundle.grade}>
                      <span>{gradeLabel(bundle.grade)}</span>
                      <strong>{bundle.requiredEvidenceIds.length} physical link{bundle.requiredEvidenceIds.length === 1 ? "" : "s"}{bundle.requiredCourtContradictionId ? " · courtroom contradiction" : ""}</strong>
                      <ul>
                        {bundle.requiredEvidenceIds.map((id) => <li key={id}>{spoilerEvidenceById.get(id)?.title ?? "Unseen physical clue"}</li>)}
                        {bundle.requiredTestimonyIds.map((id) => {
                          const testimony = state.testimony.find((item) => item.id === id);
                          const speaker = testimony ? mysteryTestimonySpeaker(state, testimony.speakerSeatId) : null;
                          return <li key={id}>{speaker ? `${speaker.name}’s testimony` : "Witness testimony"}</li>;
                        })}
                        {bundle.requiresAccomplice ? <li>Name the accomplice</li> : null}
                      </ul>
                    </article>
                  ))}</div>
                </section>
              ) : null}
              {!spoilerRecord ? <p>The sealed truth is revealed in this case’s replay record.</p> : null}
            </div>
          ) : <p className={styles.spoilerCover}>The complete timeline, accomplice, unseen clues, and unused proof routes remain covered.</p>}
        </section>
      ) : inTrial ? (
        <section className={styles.courtroom} data-tutorial-target="whodunnit-court">
          <header>
            <div><small>Prosecution</small><strong>{partner?.name ?? props.session.forAdvocate.name} + Investigator</strong></div>
            <span>PRISM · Judge</span>
            <div><small>Defense</small><strong>{defense?.name ?? props.session.againstAdvocate.name}</strong></div>
          </header>
          <div className={styles.credibility} aria-label={`${state.credibilityRemaining} credibility remaining`}>
            {[0, 1, 2].map((index) => <i key={index} data-live={index < state.credibilityRemaining ? "true" : undefined} />)}
          </div>
          {activeTestimony ? (
            <article className={styles.testimonyRail}>
              <p className={styles.eyebrow}>Exact testimony / {mysteryTestimonySpeaker(state, activeTestimony.speakerSeatId)?.name ?? "Witness"}</p>
              <blockquote>{activeTestimony.exactQuote}</blockquote>
              <button type="button" onClick={() => void addNotebookReference("testimony", activeTestimony.id, activeTestimony.exactQuote)}>Add to notebook</button>
              <div className={styles.courtRecord}>
                {courtBeats.map((entry, index) => <article key={`${entry.speaker}:${index}:${entry.body}`} data-speaker={entry.speaker.toLocaleLowerCase()}><strong>{entry.speaker}</strong><p>{entry.body}</p></article>)}
              </div>
              <div className={styles.courtActions}>
                <button type="button" disabled={busy} onClick={() => void perform({ action: "court_press", testimonyId: activeTestimony.id })}>Press</button>
                <label>Present evidence<select value={presentEvidenceId} onChange={(event) => setPresentEvidenceId(event.currentTarget.value)}><option value="">Choose evidence</option>{state.discoveredEvidence.map((item) => <option key={item.id} value={item.id}>{mysteryEvidenceTitle(item.title)}</option>)}</select></label>
                <button type="button" disabled={busy || !presentEvidenceId} onClick={() => void perform({ action: "court_present", testimonyId: activeTestimony.id, evidenceId: presentEvidenceId })}>Present Evidence</button>
                <button type="button" disabled={busy} onClick={() => void perform({ action: "court_pass", testimonyId: activeTestimony.id })}>Pass</button>
              </div>
              <div className={styles.courtStatement}>
                <textarea value={courtStatement} maxLength={600} onChange={(event) => setCourtStatement(event.currentTarget.value)} placeholder="Address the court briefly…" />
                <button type="button" disabled={busy || !courtStatement.trim()} onClick={() => { const content = courtStatement.trim(); setCourtStatement(""); void perform({ action: "court_speak", content }); }}>Speak</button>
              </div>
            </article>
          ) : <p>PRISM is preparing the deterministic ruling.</p>}
        </section>
      ) : theoryMode ? (
        <section className={styles.theoryBoard} data-tutorial-target="whodunnit-theory-board">
          <header><button type="button" className={styles.backToMansion} onClick={() => setTheoryBoardOpen(false)}>← Return to mansion</button><p className={styles.eyebrow}>Theory Board</p><h2>Build the chain. Then file.</h2><p>Filing is free, freezes this theory, and begins the mandatory trial—even if the accusation is wrong.</p><div className={styles.theoryProgress} aria-label={`${theoryReadyCount} of ${theoryChecklist.length} theory sections ready`}>{theoryChecklist.map((item, index) => <span key={item.label} data-complete={item.complete ? "true" : undefined}><i>{item.complete ? "✓" : index + 1}</i>{item.label}</span>)}</div></header>
          {state.playPhase === "continuance" ? <div className={styles.continuance}>PRISM granted one continuance. The mansion is preserved and {state.actionsRemaining} emergency actions are available.</div> : null}
          <div className={styles.theoryFields}>
            <label>Culprit<select value={theory.culpritSeatId ?? ""} onChange={(event) => {
              const culpritSeatId = event.currentTarget.value || null;
              setTheory((current) => ({ ...current, culpritSeatId }));
            }}><option value="">Choose the accused</option>{state.suspects.map((suspect) => <option key={suspect.seatId} value={suspect.seatId}>{suspect.name}</option>)}</select></label>
            <label><span><b>2</b> Method</span><textarea placeholder="How was the victim killed?" value={theory.method} onChange={(event) => {
              const method = event.currentTarget.value;
              setTheory((current) => ({ ...current, method }));
            }} /></label>
            <label><span><b>3</b> Motive</span><textarea placeholder="Why would the accused do it?" value={theory.motive} onChange={(event) => {
              const motive = event.currentTarget.value;
              setTheory((current) => ({ ...current, motive }));
            }} /></label>
            <label><span><b>4</b> Opportunity</span><textarea placeholder="When and how could they act?" value={theory.opportunity} onChange={(event) => {
              const opportunity = event.currentTarget.value;
              setTheory((current) => ({ ...current, opportunity }));
            }} /></label>
            <label>Optional accomplice<select value={theory.accompliceSeatId ?? ""} onChange={(event) => {
              const accompliceSeatId = event.currentTarget.value || null;
              setTheory((current) => ({ ...current, accompliceSeatId }));
            }}><option value="">No accomplice alleged</option>{state.suspects.filter((suspect) => suspect.seatId !== theory.culpritSeatId).map((suspect) => <option key={suspect.seatId} value={suspect.seatId}>{suspect.name}</option>)}</select></label>
          </div>
          <div className={styles.proofAttach}>
            <fieldset><legend>Physical evidence</legend>{state.discoveredEvidence.length ? state.discoveredEvidence.map((item) => <label key={item.id}><input type="checkbox" checked={theory.evidenceIds.includes(item.id)} onChange={() => setTheory((current) => ({ ...current, evidenceIds: current.evidenceIds.includes(item.id) ? current.evidenceIds.filter((id) => id !== item.id) : [...current.evidenceIds, item.id] }))} /><span aria-hidden="true">{mysteryEvidenceEmoji(item)}</span> {mysteryEvidenceTitle(item.title)}</label>) : <p>Search rooms to add evidence to the record.</p>}</fieldset>
            <fieldset><legend>Testimony</legend>{state.testimony.length ? state.testimony.map((item) => {
              const speaker = mysteryTestimonySpeaker(state, item.speakerSeatId);
              return <label key={item.id} className={styles.theoryTestimony}><input type="checkbox" checked={theory.testimonyIds.includes(item.id)} onChange={() => setTheory((current) => ({ ...current, testimonyIds: current.testimonyIds.includes(item.id) ? current.testimonyIds.filter((id) => id !== item.id) : [...current.testimonyIds, item.id] }))} /><span><strong style={{ "--suspect-color": speaker?.color ?? "#a98cff" } as CSSProperties}>{speaker?.name ?? "Witness"}</strong><q>{item.exactQuote}</q></span></label>;
            }) : <p>Interview suspects to add exact testimony.</p>}</fieldset>
          </div>
          <button type="button" className={styles.fileTheoryButton} disabled={busy || !theory.culpritSeatId} onClick={() => void perform({ action: "file_theory", theory })}>File charges and enter court</button>
        </section>
      ) : (
        <div className={styles.investigation} data-case-file-open={caseFileOpen ? "true" : undefined}>
          <section className={styles.floorplan} data-tutorial-target="whodunnit-floorplan">
            <header>
              <div><p className={styles.eyebrow}>Mansion blueprint</p><strong>{floorDisplayName(floor)}</strong></div>
              <div>{Array.from({ length: state.config.floors }, (_, index) => {
                const floorNumber = index + 1;
                const label = floorDisplayName(floorNumber);
                return <button type="button" key={floorNumber} aria-label={`Show ${label}`} title={label} data-selected={floor === floorNumber ? "true" : undefined} onClick={() => selectFloor(floorNumber)}>{floorNumber}</button>;
              })}</div>
            </header>
            <div className={styles.mapViewport}>
              <div className={styles.mapCanvas}>
                {floorDoors.map((door) => <i key={door.key} className={styles.mapDoor} data-orientation={door.orientation} aria-hidden="true" style={{ left: `${mapX(door.x)}%`, top: `${mapY(door.y)}%` }} />)}
                {floorRooms.map((room) => (
                  <button
                    type="button"
                    key={room.id}
                    className={styles.mapRoom}
                    data-discovered={room.discovered ? "true" : undefined}
                    data-current={room.id === currentRoom.id ? "true" : undefined}
                    data-selected={room.id === selectedRoom.id ? "true" : undefined}
                    data-visited={room.discovered ? "true" : undefined}
                    data-locked={room.locked || (!room.discovered && state.actionsRemaining === 0) ? "true" : undefined}
                    data-access-ready={armedAccessItemId ? "true" : undefined}
                    aria-pressed={room.id === selectedRoom.id}
                    aria-label={`${room.discovered ? room.name ?? "Room" : "Undiscovered room"}${room.locked ? ", locked" : ""}${armedAccessItemId ? ", use selected access item" : ""}`}
                    disabled={busy}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropAccessItem(event, "room", room.id)}
                    onClick={() => {
                      if (armedAccessItemId) {
                        void applyAccessItem(armedAccessItemId, "room", room.id);
                        return;
                      }
                      setSelectedRoomId(room.id);
                      announceAction(room.discovered ? `${room.name ?? "Room"} selected.` : "Undiscovered room selected.");
                    }}
                    style={{ left: `${mapX(room.x)}%`, top: `${mapY(room.y)}%`, width: `${roomWidthPercent(room.width)}%`, height: `${roomHeightPercent(room.height)}%` }}
                  >
                    {room.discovered ? <><span>{roomTemplate(room.templateId).emoji}</span>
                    <strong>{room.name ?? "Unnamed room"}</strong>
                    {state.suspects.filter((suspect) => suspect.roomId === room.id).map((suspect) => {
                      const bot = mysteryBotForSuspect(suspect);
                      return <i className={styles.mapOccupant} key={suspect.seatId} aria-label={`${suspect.name} is known to be here`} data-tutorial-target="whodunnit-micro-avatar"><BotAvatarMicro color={bot.color} moodKey="neutral" glyph={props.renderBotGlyph(bot.glyph, { size: 15, strokeWidth: 1.3 })} renderSizePx={40} scheduleKey={`mystery-map-${sessionId}-${suspect.seatId}`} /></i>;
                    })}
                    {room.neighborIds.some((id) => state.rooms.find((candidate) => candidate.id === id)?.floor !== room.floor) ? <small>Stairs</small> : null}</> : null}
                  </button>
                ))}
              </div>
            </div>
            <section className={styles.mapDetails} aria-live="polite" data-locked={selectedRoomLocked ? "true" : undefined}>
              <div><small>Selected room</small><strong>{selectedRoomIsKnown ? selectedRoom.name ?? "Unnamed room" : "Undiscovered room"}</strong><span>{selectedRoomIsKnown ? `${floorDisplayName(selectedRoom.floor)} · ${selectedRoom.locked ? "Locked · try an access item" : "Visited"}` : selectedRoomLocked ? "Locked · no actions" : "Discover to reveal"}</span></div>
              {selectedRoomIsKnown ? <dl><div><dt>Known occupant</dt><dd>{selectedRoomOccupant ? selectedRoomOccupant.name : "Unknown"}</dd></div><div><dt>Known clues</dt><dd>{selectedRoomClueCount}</dd></div></dl> : null}
              <button type="button" disabled={busy || selectedRoomLocked || selectedRoom.id === currentRoom.id} onClick={() => void enterSelectedRoom()}>{selectedRoomActionLabel}</button>
            </section>
            <small>Select a room, then travel. New rooms cost 1 action; revisits are free.</small>
          </section>
          <section className={styles.roomPanel} data-kind={currentRoom.kind ?? "undiscovered"} data-focus={suspectRoomFocus}>
            <header><div><p className={styles.eyebrow}>{(currentRoom.kind ?? "room").replace("_", " ")}</p><h2>{currentRoom.name ?? "Undiscovered room"}</h2></div><div className={styles.roomHeaderActions}>{suspectRoomFocus === "search" ? <button type="button" className={styles.leaveInvestigation} onClick={() => { setSuspectRoomFocus("observe"); setLens((current) => ({ ...current, visible: false })); announceAction("Returned to the room."); }}>← Return to room</button> : null}<button type="button" onClick={() => void addNotebookReference("room", currentRoom.id, currentRoom.name ?? currentRoom.id)}>Add room to notebook</button></div></header>
            <div
              className={styles.roomScene}
              data-blurred={currentSuspect && suspectRoomFocus === "interview" ? "true" : undefined}
              data-observing={suspectRoomFocus === "observe" ? "true" : undefined}
              data-investigating={suspectRoomFocus === "search" ? "true" : undefined}
              style={{ "--room-deep": template.palette[0], "--room-mid": template.palette[1], "--room-light": template.palette[2] } as CSSProperties}
              onPointerMove={suspectRoomFocus === "search" ? moveInvestigationLens : undefined}
              onClickCapture={(event) => {
                if (suspectRoomFocus !== "search" || event.detail === 0 || busy) return;
                // Let a real hotspot own its click. The scene-level fallback is only
                // for the surrounding image, where we resolve the nearest region.
                if ((event.target as Element).closest("[data-mystery-region-id]")) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
                const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
                const nearest = nearestInvestigationRegion(x, y);
                if (!nearest.regionId) return;
                event.preventDefault();
                event.stopPropagation();
                if (armedAccessItemId) {
                  void applyAccessItem(armedAccessItemId, "region", `${currentRoom.id}:${nearest.regionId}`);
                  return;
                }
                void perform({ action: "inspect", roomId: currentRoom.id, regionId: nearest.regionId });
              }}
              onPointerDown={(event) => {
                if (
                  suspectRoomFocus === "interview" &&
                  !(event.target as Element).closest("[data-mystery-interview-interactive]")
                ) {
                  setSuspectRoomFocus("observe");
                  announceAction("Returned to the room.");
                }
              }}
              onPointerLeave={() => setLens((current) => ({ ...current, visible: false }))}
            >
              {roomArtworkSrc ? (
                <img className={styles.generatedRoom} src={roomArtworkSrc} alt="" />
              ) : (
                <>
                  <div className={styles.roomArchitecture} aria-hidden="true"><span /><span /><span /><i /><i /></div>
                  <div className={styles.roomObjects} aria-hidden="true">
                    {template.regions.map((region) => (
                      <span key={region.id} style={{ clipPath: regionClip(region) }} />
                    ))}
                  </div>
                </>
              )}
              {suspectRoomFocus === "search" ? activeRegions.map((region, index) => (
                <button
                  type="button"
                  key={region.id}
                  className={styles.hotspot}
                  style={{ clipPath: regionClip(region), zIndex: lens.regionId === region.id ? 5 : 4 }}
                  aria-label={`${currentRoom.inspectionCounts?.[region.id] ? "Inspect again" : "Inspect"} the ${region.label}${armedAccessItemId ? " with selected access item" : ""}`}
                  title={`${currentRoom.inspectionCounts?.[region.id] ? "Inspect again" : "Inspect"} ${region.label}`}
                  data-inspected={currentRoom.inspectionCounts?.[region.id] ? "true" : undefined}
                  data-access-ready={armedAccessItemId ? "true" : undefined}
                  data-mystery-region-id={region.id}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropAccessItem(event, "region", `${currentRoom.id}:${region.id}`)}
                  onClick={() => {
                    if (armedAccessItemId) {
                      void applyAccessItem(armedAccessItemId, "region", `${currentRoom.id}:${region.id}`);
                      return;
                    }
                    void perform({ action: "inspect", roomId: currentRoom.id, regionId: region.id });
                  }}
                  data-tutorial-target={index === 0 ? "whodunnit-hotspot" : undefined}
                ><span>Inspect {region.label}</span></button>
              )) : null}
              {suspectRoomFocus === "search" ? <i
                className={styles.investigationLens}
                aria-hidden="true"
                data-visible={lens.visible ? "true" : undefined}
                style={{ left: `${lens.x}%`, top: `${lens.y}%`, "--lens-proximity": lens.proximity } as CSSProperties}
              /> : null}
              {currentSuspect && suspectRoomFocus === "observe" ? (
                <button
                  type="button"
                  className={styles.roomSuspectPresence}
                  data-tutorial-target="whodunnit-room-suspect"
                  style={{ "--suspect-color": currentSuspect.color ?? "#9c7cff" } as CSSProperties}
                  onClick={() => { setSuspectRoomFocus("interview"); announceAction(`Interviewing ${currentSuspect.name}.`); }}
                  aria-label={`Talk to ${currentSuspect.name}`}
                >
                  {props.renderMysteryBotAvatar(mysteryBotForSuspect(currentSuspect), "mini", { demeanor: "suspect" })}
                  <span className={styles.roomSuspectName}>{currentSuspect.name}</span>
                </button>
              ) : null}
              {currentSuspect && suspectRoomFocus === "interview" ? (
                <div className={styles.interviewStage}>
                  <div className={styles.suspectPresence} data-mystery-interview-interactive style={{ "--suspect-color": currentSuspect.color ?? "#9c7cff" } as CSSProperties}>
                    <span className={styles.suspectAvatar} data-tutorial-target="whodunnit-hd-interview">{props.renderMysteryBotAvatar(mysteryBotForSuspect(currentSuspect), "full", { demeanor: "suspect", thinking: interviewGenerating, talking: interviewSpeechTiming !== null, speechTiming: interviewSpeechTiming })}</span>
                    <strong>{currentSuspect.name}</strong><small>Interview · free questioning</small>
                  </div>
                  <section className={styles.interviewViewport} data-mystery-interview-interactive aria-label={`Interview with ${currentSuspect.name}`} onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSuspectRoomFocus("observe");
                      announceAction("Returned to the room.");
                    }
                  }}>
                    <header><div><small>In the room</small><strong>{currentSuspect.name}</strong></div><button type="button" onClick={() => { setSuspectRoomFocus("observe"); announceAction("Returned to the room."); }}>Return to room</button></header>
                    <div ref={interviewTranscriptRef} className={styles.interviewTranscript} aria-live="polite">
                      {interviewGenerating && streamingPlayerMessageId ? <p data-speaker="investigator" data-streaming="true"><strong>You · {playerSpeechTiming ? "voice" : "writing"}</strong><span>{streamedPlayerQuestion || "…"}</span></p> : null}
                      {currentInterview.length ? currentInterview.map((message) => <p key={message.id} data-speaker={message.role} data-streaming={message.id === streamingMessageId ? "true" : undefined}><strong>{message.role === "investigator" ? "You" : currentSuspect.name}{message.id === streamingMessageId && interviewSpeechTiming ? " · voice" : ""}</strong><span>{message.id === streamingMessageId ? mysteryPublicText(streamedReply || "…", state) : mysteryPublicText(message.content, state)}</span></p>) : <p className={styles.interviewPrompt}>Ask about the timeline, their relationship with the victim, or confront them with discovered evidence using @.</p>}
                      {interviewGenerating ? <p className={styles.interviewTurnState} role="status">{currentSuspect.name} is thinking…</p> : null}
                    </div>
                    <div className={styles.leadGrid}>{suggestedLeads.map((lead) => <button type="button" key={lead} disabled={busy} onClick={() => { setQuestion(lead); setQuestionCaret(lead.length); }}>{lead}</button>)}</div>
                    <div className={styles.questionComposer} data-tutorial-target="whodunnit-evidence-mention"><textarea value={question} maxLength={2_000} onChange={(event) => { setQuestion(event.currentTarget.value); setQuestionCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length); }} onSelect={(event) => setQuestionCaret(event.currentTarget.selectionStart ?? 0)} placeholder="Ask freely — type @ to mention evidence, testimony, suspects, or the victim…" />{evidenceMentionPicks.length ? <div className={styles.evidenceMentionMenu} role="listbox" aria-label="Case mentions"><small>Reference the public record</small>{evidenceMentionPicks.map((pick) => <button type="button" key={`${pick.kind}:${pick.id}`} data-kind={pick.kind} style={{ "--mention-color": pick.color ?? undefined } as CSSProperties} onClick={() => { const action = commitMysteryMentionAtCaret(question, questionCaret, pick); if (action) { setQuestion(action.replacement); setQuestionCaret(action.caret); } }}>{pick.glyph} {pick.title}</button>)}</div> : null}<button type="button" disabled={busy || !question.trim()} onClick={() => { const asked = question.trim(); const evidenceId = parseMysteryInterviewEvidenceMention(asked, state.discoveredEvidence); if (/\[\[exhibit:/u.test(asked) && !evidenceId) { setError("Choose a discovered evidence item from the @ menu."); return; } const messageId = mysteryId("player-interview"); setQuestion(""); streamPlayerQuestion(mysteryPublicText(asked, state), messageId); setInterviewGenerating(true); void perform({ action: "interview", suspectSeatId: currentSuspect.seatId, question: asked, evidenceId }).finally(() => setInterviewGenerating(false)); }}>Ask</button></div>
                  </section>
                </div>
              ) : null}
              {suspectRoomFocus !== "interview" ? <div className={styles.stageLowerChrome} aria-live="polite">
              {stageNarration ? <div className={styles.stagePartnerProse}><small>{stageNarration.label}</small><MysteryPublicMarkdown source={stageNarration.text} suspects={state.suspects} /></div> : null}
              {suspectRoomFocus === "observe" ? <div className={styles.roomModeControls} data-mystery-interview-interactive>
                {currentSuspect ? <button type="button" onClick={() => { setSuspectRoomFocus("interview"); announceAction(`Interviewing ${currentSuspect.name}.`); }}>Talk to {currentSuspect.name}</button> : null}
                <button type="button" onClick={() => { setSuspectRoomFocus("search"); announceAction(`Investigating ${currentRoom.name ?? "the room"}.`); }}>Investigate room</button>
              </div> : null}
              <p className={styles.stageActionLine} role="status">{actionFeedback ?? (suspectRoomFocus === "search" ? "Move the lens around the room; it never predicts what an inspection will reveal." : currentSuspect ? "Choose whether to question the suspect or investigate the room." : "Enter investigation view when you are ready to search this room.")}</p>
              </div> : null}
            </div>
            {evidenceExhibitId ? (() => { const exhibit = state.discoveredEvidence.find((item) => item.id === evidenceExhibitId); return exhibit ? <section className={styles.evidenceExhibit} role="dialog" aria-label={`Evidence acquired: ${mysteryEvidenceTitle(exhibit.title)}`}><button type="button" aria-label="Close evidence preview" onClick={() => setEvidenceExhibitId(null)}>×</button>{exhibit.imageId ? <img src={`/api/images/${encodeURIComponent(exhibit.imageId)}/file`} alt="" /> : <span aria-hidden="true">{mysteryEvidenceEmoji(exhibit)}</span>}<div><small>Evidence acquired</small><h3>{mysteryEvidenceTitle(exhibit.title)}</h3><p>{mysteryEvidenceObservation(exhibit.observation)}</p><button type="button" onClick={() => void addNotebookReference("evidence", exhibit.id, `${mysteryEvidenceTitle(exhibit.title)}: ${mysteryEvidenceObservation(exhibit.observation)}`)}>Add to notebook</button></div></section> : null; })() : null}
          </section>

          <aside className={styles.caseRail} data-open={caseFileOpen ? "true" : undefined} aria-label="Case file" inert={!caseFileOpen}>
            <header className={styles.caseFileHeader}>
              <div><p className={styles.eyebrow}>Case file</p><strong>Public record & tools</strong></div>
              <button type="button" onClick={() => { setCaseFileOpen(false); announceAction("Case file closed."); }} aria-label="Close Case file">×</button>
            </header>
            <nav className={styles.caseFileTabs} aria-label="Case file sections">
              <button type="button" aria-pressed={caseFileTab === "partner"} onClick={() => setCaseFileTab("partner")}>Counsel</button>
              <button type="button" aria-pressed={caseFileTab === "leads"} onClick={() => setCaseFileTab("leads")} data-tutorial-target="whodunnit-leads">Leads <span>{state.leads.length}</span></button>
              <button type="button" aria-pressed={caseFileTab === "access"} onClick={() => setCaseFileTab("access")}>Access <span>{state.inventoryItems.length}</span></button>
              <button type="button" aria-pressed={caseFileTab === "evidence"} onClick={() => setCaseFileTab("evidence")}>Evidence <span>{state.discoveredEvidence.length}</span></button>
              <button type="button" aria-pressed={caseFileTab === "testimony"} onClick={() => setCaseFileTab("testimony")}>Testimony <span>{state.testimony.length}</span></button>
            </nav>
            {state.actionsRemaining === 0 ? <div className={styles.actionsExhausted}>Discovery actions are exhausted. Travel, room searches, suspect interviews, and the notebook remain free; file a theory when you are ready for court.</div> : null}
            {state.continuanceUsed && state.playPhase === "continuance" ? <div className={styles.continuance}>PRISM granted the only continuance. You have {state.actionsRemaining} emergency actions before refiling.</div> : null}
            {caseFileTab === "partner" ? <section className={styles.partnerCard}><header><div><small>Co-counsel · studies the record</small><strong>{partner?.name ?? props.session.forAdvocate.name}</strong></div><span className={styles.partnerMini}>{props.renderMysteryBotAvatar(partner ?? { id: props.session.forAdvocate.id, name: props.session.forAdvocate.name, color: null, glyph: null, hardMuted: false }, "mini", { demeanor: "partner", talking: busy })}</span></header><p className={styles.partnerStageHint}>Their latest reading stays at the lower edge of the stage.</p><textarea value={partnerQuestion} onChange={(event) => setPartnerQuestion(event.currentTarget.value)} placeholder="Ask your partner freely — type @ to reference evidence, testimony, people, or leads…" />{partnerMentionPicks.length ? <div className={styles.evidenceMentionMenu} role="listbox" aria-label="Partner case mentions"><small>Reference the public record</small>{partnerMentionPicks.map((pick) => <button type="button" key={`${pick.kind}:${pick.id}`} data-kind={pick.kind} style={{ "--mention-color": pick.color ?? undefined } as CSSProperties} onClick={() => { const action = commitMysteryMentionAtCaret(partnerQuestion, partnerQuestion.length, pick); if (action) setPartnerQuestion(action.replacement); }}>{pick.glyph} {pick.title}</button>)}</div> : null}<button type="button" disabled={busy || !partnerQuestion.trim()} onClick={() => { const asked = partnerQuestion.trim(); setPartnerQuestion(""); void perform({ action: "consult_partner", question: asked }); }}>Consult · free</button></section> : null}
            {caseFileTab === "leads" ? <section className={styles.leadJournal} data-tutorial-target="whodunnit-lead-journal"><header><strong>Active leads</strong><span>{state.leads.length}</span></header>{state.leads.map((lead) => <article key={lead.id} data-status={lead.status}><div><small>{lead.status.replaceAll("_", " ")} · rev {lead.revision}</small><strong>{lead.title}</strong></div><p>{lead.summary}</p></article>)}<button type="button" onClick={() => setNotebookView("leads")}>Show in Case Notes</button></section> : null}
            {caseFileTab === "access" ? <section className={styles.accessInventory} data-tutorial-target="whodunnit-access-inventory">
              <header><strong>Case inventory</strong><span>{state.inventoryItems.length}</span></header>
              {armedAccessItemId ? <p className={styles.accessArmed}>Using <strong>{state.inventoryItems.find((item) => item.id === armedAccessItemId)?.title}</strong>. Select a room, locked item, or room area. <button type="button" onClick={() => setArmedAccessItemId(null)}>Cancel</button></p> : null}
              {state.inventoryItems.length ? state.inventoryItems.map((item) => (
                <article
                  key={item.id}
                  draggable={item.usable && !busy}
                  data-armed={armedAccessItemId === item.id ? "true" : undefined}
                  data-locked={item.locked ? "true" : undefined}
                  data-access-ready={armedAccessItemId && item.locked ? "true" : undefined}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("application/x-prism-access-item", item.id);
                    announceAction(`Carrying ${item.title}. Drop it on a room, item, or room area.`);
                  }}
                  onDragOver={item.locked ? (event) => event.preventDefault() : undefined}
                  onDrop={item.locked ? (event) => dropAccessItem(event, "item", item.id) : undefined}
                >
                  <span aria-hidden="true">{item.emoji}</span>
                  <div><strong>{item.title}</strong><p>{item.description}</p><div className={styles.accessActions}>{item.usable ? <button type="button" disabled={busy} onClick={() => setArmedAccessItemId((current) => current === item.id ? null : item.id)}>{armedAccessItemId === item.id ? "Cancel use" : "Use"}</button> : null}{item.locked && armedAccessItemId ? <button type="button" disabled={busy} onClick={() => void applyAccessItem(armedAccessItemId, "item", item.id)}>Try selected item</button> : null}</div></div>
                </article>
              )) : <p>No access items recovered.</p>}
              <small>Drag a usable item onto a locked object, mansion room, or room area. Or choose Use, then select a target.</small>
            </section> : null}
            {caseFileTab === "evidence" ? <section className={styles.inventory}><header><strong>Evidence</strong><span>{state.discoveredEvidence.length}</span></header>{state.discoveredEvidence.length ? state.discoveredEvidence.map((item) => { const finding = state.forensicFindings.find((entry) => entry.evidenceId === item.id); const title = mysteryEvidenceTitle(item.title); const observation = mysteryEvidenceObservation(item.observation); return <article key={item.id}>{item.imageId ? <img src={`/api/images/${encodeURIComponent(item.imageId)}/file`} alt="" /> : <span>{mysteryEvidenceEmoji(item)}</span>}<div><strong>{title}</strong><p>{observation}</p>{finding ? <p className={styles.forensicFinding}>{finding.summary}</p> : item.isPhysical ? <button type="button" disabled={busy || state.actionsRemaining < 3} onClick={() => void perform({ action: "forensic", evidenceId: item.id })}>Forensics · 3 actions</button> : null}<button type="button" onClick={() => void addNotebookReference("evidence", item.id, `${title}: ${observation}`)}>Add to notebook</button></div></article>; }) : <p>No physical evidence acquired.</p>}</section> : null}
            {caseFileTab === "testimony" ? <section className={styles.testimonyList}><header><strong>Testimony</strong><span>{state.testimony.length}</span></header>{state.testimony.length ? state.testimony.map((item) => { const speaker = mysteryTestimonySpeaker(state, item.speakerSeatId); return <article key={item.id}><strong style={{ "--suspect-color": speaker?.color ?? "#a98cff" } as CSSProperties}>{speaker?.name ?? "Witness"}</strong><blockquote>{item.exactQuote}</blockquote><button type="button" onClick={() => void addNotebookReference("testimony", item.id, item.exactQuote)}>Add to notebook</button></article>; }) : <p>No testimony committed.</p>}</section> : null}
            <button type="button" className={styles.openTheoryButton} onClick={() => setTheoryBoardOpen(true)}>Open Theory Board{state.actionsRemaining === 0 ? " · filing required" : ""}</button>
          </aside>
          <section className={styles.notebook} role="complementary" aria-label="Investigator's Notebook" data-tutorial-target="whodunnit-notebook-editor" data-view={notebookView}>
            <header><div><p className={styles.eyebrow}>Persistent case desk</p><h2>{notebookSaving ? "Saving…" : "Your working record"}</h2></div><div><span>{noteCount.toLocaleString()} / {DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT.toLocaleString()}</span></div></header>
            {notebookError ? <p className={styles.error}>{notebookError}</p> : null}
            <div className={styles.notebookBody}>
              <nav>
                <div data-active={notebookView === "leads" ? "true" : undefined}>
                  <button type="button" onClick={() => setNotebookView("leads")}>Leads <small>{state.leads.length}</small></button>
                </div>
                <div data-active={notebookView === "evidence" ? "true" : undefined}>
                  <button type="button" onClick={() => setNotebookView("evidence")}>Evidence <small>{state.discoveredEvidence.length}</small></button>
                </div>
                <div data-active={notebookView === "testimony" ? "true" : undefined}>
                  <button type="button" onClick={() => setNotebookView("testimony")}>Testimony <small>{state.testimony.length}</small></button>
                </div>
                {notebook?.pages.map((page, index) => (
                  <div key={page.id} data-active={notebookView === "notes" && page.id === activePage?.id ? "true" : undefined}>
                    <button type="button" onClick={() => { setNotebookView("notes"); setActivePageId(page.id); }}>{page.title}</button>
                    <span>
                      <button
                        type="button"
                        disabled={index === 0}
                        aria-label={`Move ${page.title} up`}
                        onClick={() => setNotebook((current) => {
                          if (!current || index === 0) return current;
                          const pages = [...current.pages];
                          [pages[index - 1], pages[index]] = [pages[index]!, pages[index - 1]!];
                          return { ...current, pages };
                        })}
                      >↑</button>
                      <button
                        type="button"
                        disabled={(notebook?.pages.length ?? 0) <= 1}
                        aria-label={`Delete ${page.title}`}
                        onClick={() => {
                          const nextPageId = notebook?.pages[index - 1]?.id ?? notebook?.pages[index + 1]?.id ?? null;
                          setNotebook((current) => current ? { ...current, pages: current.pages.filter((entry) => entry.id !== page.id) } : current);
                          if (activePageId === page.id) setActivePageId(nextPageId);
                        }}
                      >×</button>
                    </span>
                  </div>
                ))}
                <button type="button" onClick={() => { const now = new Date().toISOString(); const page = { id: mysteryId("page"), title: "New Page", blocks: [], createdAt: now, updatedAt: now }; setNotebook((current) => current ? { ...current, pages: [...current.pages, page] } : current); setNotebookView("notes"); setActivePageId(page.id); }}>+ New page</button>
              </nav>
              <div className={styles.notebookPage}>
                {notebookView === "leads" ? <div className={styles.leadNotebook} data-tutorial-target="whodunnit-lead-notebook"><header className={styles.leadNotebookIntro}><div><p className={styles.eyebrow}>Automatically updated</p><h3>Leads</h3></div><p>PRISM advances these threads only from facts you have discovered. A stalled or unresolved lead may never close.</p></header>{state.leads.map((lead) => { const annotations = notebook?.pages.flatMap((page) => page.blocks.filter((block) => block.leadId === lead.id).map((block) => ({ page, block }))) ?? []; const linkedLabels = [...lead.linkedRoomIds.map((id) => state.rooms.find((room) => room.id === id)?.name ?? id), ...lead.linkedEvidenceIds.map((id) => state.discoveredEvidence.find((item) => item.id === id)?.title ?? id), ...lead.linkedTestimonyIds.map((id) => `Testimony · ${state.suspects.find((suspect) => suspect.seatId === state.testimony.find((item) => item.id === id)?.speakerSeatId)?.name ?? "Witness"}`)]; return <article key={lead.id} data-status={lead.status}><header><div><small>{lead.status.replaceAll("_", " ")} · revision {lead.revision}</small><h4>{lead.title}</h4></div><span>◇</span></header><p>{lead.summary}</p>{linkedLabels.length ? <div className={styles.leadLinks}>{linkedLabels.map((label) => <span key={label}>{label}</span>)}</div> : null}{annotations.map(({ page, block }) => <div className={styles.leadAnnotation} key={`${page.id}:${block.id}`}><textarea value={block.text} onChange={(event) => {
                  const text = event.currentTarget.value;
                  updatePage(page.id, (candidate) => ({ ...candidate, blocks: candidate.blocks.map((entry) => entry.id === block.id ? { ...entry, text } : entry) }));
                }} onBlur={() => setPendingAutoPolish({ pageId: page.id, blockId: block.id })} /><button type="button" aria-label={`Remove note from ${lead.title}`} onClick={() => updatePage(page.id, (candidate) => ({ ...candidate, blocks: candidate.blocks.filter((entry) => entry.id !== block.id) }))}>×</button></div>)}<div className={styles.leadAnnotationDraft}><textarea value={leadNoteDrafts[lead.id] ?? ""} onChange={(event) => {
                  const value = event.currentTarget.value;
                  setLeadNoteDrafts((current) => ({ ...current, [lead.id]: value }));
                }} placeholder="Add your own thought to this lead…" /><button type="button" disabled={!leadNoteDrafts[lead.id]?.trim()} onClick={() => addLeadAnnotation(lead.id, lead.revision)}>Add note</button></div></article>; })}</div>
                : notebookView === "evidence" ? <div className={styles.deskRecord}><section className={styles.inventory}><header><strong>Evidence</strong><span>{state.discoveredEvidence.length}</span></header>{state.discoveredEvidence.length ? state.discoveredEvidence.map((item) => { const finding = state.forensicFindings.find((entry) => entry.evidenceId === item.id); const title = mysteryEvidenceTitle(item.title); const observation = mysteryEvidenceObservation(item.observation); return <article key={item.id}>{item.imageId ? <img src={`/api/images/${encodeURIComponent(item.imageId)}/file`} alt="" /> : <span>{mysteryEvidenceEmoji(item)}</span>}<div><strong>{title}</strong><p>{observation}</p>{finding ? <p className={styles.forensicFinding}>{finding.summary}</p> : item.isPhysical ? <button type="button" disabled={busy || state.actionsRemaining < 3} onClick={() => void perform({ action: "forensic", evidenceId: item.id })}>Forensics · 3 actions</button> : null}<button type="button" onClick={() => void addNotebookReference("evidence", item.id, `${title}: ${observation}`)}>Add to notes</button></div></article>; }) : <p>No physical evidence acquired.</p>}</section></div>
                : notebookView === "testimony" ? <div className={styles.deskRecord}><section className={styles.testimonyList}><header><strong>Testimony</strong><span>{state.testimony.length}</span></header>{state.testimony.length ? state.testimony.map((item) => { const speaker = mysteryTestimonySpeaker(state, item.speakerSeatId); return <article key={item.id}><strong style={{ "--suspect-color": speaker?.color ?? "#a98cff" } as CSSProperties}>{speaker?.name ?? "Witness"}</strong><blockquote>{item.exactQuote}</blockquote><button type="button" onClick={() => void addNotebookReference("testimony", item.id, item.exactQuote)}>Add to notes</button></article>; }) : <p>No testimony committed.</p>}</section></div>
                : activePage ? <><input className={styles.pageTitle} value={activePage.title} onChange={(event) => {
                  const title = event.currentTarget.value;
                  updatePage(activePage.id, (page) => ({ ...page, title }));
                }} />
                  <div className={styles.authoredBlockDraft}><textarea value={draftBlockText} onChange={(event) => setDraftBlockText(event.currentTarget.value)} placeholder="Write a note in plain language or Markdown…" /><div><button type="button" disabled={!draftBlockText.trim()} onClick={addAuthoredBlock}>Add note</button></div></div>
                  <div className={styles.notebookBlocks}>{activePage.blocks.map((block) => <div key={block.id} data-kind={block.kind}>
                    {block.kind === "checkbox" ? <input type="checkbox" checked={block.checked === true} onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      updatePage(activePage.id, (page) => ({ ...page, blocks: page.blocks.map((entry) => entry.id === block.id ? { ...entry, checked } : entry) }));
                    }} /> : null}
                    {block.kind === "reference" || block.kind === "quote" ? <div className={styles.notebookReference}><small>{block.referenceKind ?? "testimony"}</small><span>{mysteryNotebookReferenceLabel(block, state)}</span></div> : <textarea value={block.text} placeholder={block.kind === "heading" ? "Heading" : "Write Markdown notes…"} onChange={(event) => {
                      const text = event.currentTarget.value;
                      updatePage(activePage.id, (page) => ({ ...page, blocks: page.blocks.map((entry) => entry.id === block.id ? { ...entry, text } : entry) }));
                    }} onBlur={() => setPendingAutoPolish({ pageId: activePage.id, blockId: block.id })} />}
                    <span className={styles.blockActions}>{block.kind !== "reference" && block.kind !== "quote" ? <button type="button" disabled={!notebook || notebookSaving || JSON.stringify(notebook.pages) !== savedPagesRef.current} onClick={() => void proposeCleanup([activePage.id], [block.id])}>Polish</button> : null}<button type="button" aria-label="Remove block" onClick={() => updatePage(activePage.id, (page) => ({ ...page, blocks: page.blocks.filter((entry) => entry.id !== block.id) }))}>×</button></span>
                  </div>)}</div>
                </> : <p>Loading Case Notes…</p>}
              </div>
            </div>
            <footer><span>{notebookView === "leads" ? "Lead statuses update automatically from the public facts you uncover. Your annotations remain your own." : notebookView === "evidence" ? "Recovered evidence stays available here while you investigate and build your theory." : notebookView === "testimony" ? "Exact testimony remains part of the public record and can be cited during interviews or in court." : "Plain language and Markdown are both welcome. PRISM safely polishes authored notes after you leave a field."}</span>{notebookView === "notes" ? <button type="button" disabled={!notebook || notebookSaving || JSON.stringify(notebook.pages) !== savedPagesRef.current} onClick={() => void proposeCleanup(activePage ? [activePage.id] : undefined)}>Review page polish</button> : null}<button type="button" disabled={!notebook || notebook.revision <= 1} onClick={() => void resolveCleanup("undo")}>Undo revision</button></footer>
            {cleanupProposal ? <div className={styles.cleanupPreview}><header><div><p className={styles.eyebrow}>Notes polish</p><h3>Review the proposed wording</h3></div><button type="button" onClick={() => void resolveCleanup("reject_cleanup")}>Close</button></header>{cleanupProposal.pages.map((page) => { const source = notebook?.pages.find((entry) => entry.id === page.pageId); return <article key={page.pageId}><strong>{source?.title} → {page.proposedTitle}</strong><div><pre>{source?.blocks.map((block) => notebookReferenceLabel(block.text)).join("\n\n")}</pre><span aria-hidden="true">→</span><pre>{page.proposedBlocks.map((block) => notebookReferenceLabel(block.text)).join("\n\n")}</pre></div></article>; })}<footer><button type="button" onClick={() => void resolveCleanup("reject_cleanup")}>Keep original</button><button type="button" onClick={() => void resolveCleanup("accept_cleanup")}>Apply polish</button></footer></div> : null}
          </section>
        </div>
      )}
    </main>
  );
}
