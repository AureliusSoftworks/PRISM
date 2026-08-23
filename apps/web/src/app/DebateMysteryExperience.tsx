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
  DEBATE_MYSTERY_PRESETS,
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  DEBATE_MYSTERY_SCHEMA_VERSION,
  debateMysteryTheoryClaimOptions,
  debateMysteryRecipeSeed,
  resolveDebateMysteryConfig,
  type DebateMysteryActionRequestV1,
  type DebateMysteryArtMode,
  type DebateMysteryCaseCodeV1,
  type DebateMysteryDifficulty,
  type DebateMysteryNotebookV2,
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
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import {
  WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_URL,
  mysteryInvestigationMusicMix,
  mysteryInvestigationMusicSessionActive,
} from "./debateMysteryMusic";
import {
  mysteryInvestigationTargetAt,
  mysteryRoomArtworkSrc,
} from "./debateMysteryRoomArt";
import {
  debateMysteryBundledEvidenceAssetPath,
  debateMysteryBundledInventoryAssetPath,
  debateMysteryBundledLockTargetAssetPath,
} from "./debateMysteryBundledProps";
import { MysteryPropVisual } from "./MysteryPropVisual";
import {
  mysteryMapOccupantPosition,
  mysteryRoomSuspectFacing,
  mysteryRoomSuspectWalkProfile,
} from "./debateMysteryRoomWalk";
import {
  debateMysterySfxCueForAction,
  playDebateMysterySfx,
  type DebateMysterySfxCue,
} from "./debateMysterySfx";
import { findAtMentionTokenPlain } from "./botMention";
import type { BotPickerGlyphRenderer } from "./BotPicker";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";
import { mysteryInterviewTranscriptVisibleText } from "./mysteryInterviewTranscriptReveal";
import {
  minimumWhodunnitBotsForCast,
  distinctWhodunnitCastBotIds,
  randomizeWhodunnitCast,
  randomizeWhodunnitCastAroundBot,
} from "./debateMysteryCast";
import {
  createBotDirectedSetupRefractTarget,
  PrismRefractTarget,
} from "./prismRefract";

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
  audioEnabled: boolean;
  audioVolume: number;
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
      blinkEnabled?: boolean;
      facing?: "left" | "right";
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

interface MysteryEvidenceVisualItem {
  id: string;
  title: string;
  object: string;
  emoji: string;
  imageId?: string | null;
}

function MysteryEvidenceVisual({
  item,
  className,
}: {
  item: MysteryEvidenceVisualItem;
  className?: string;
}) {
  return (
    <MysteryPropVisual
      generatedImageId={item.imageId}
      bundledAssetPath={debateMysteryBundledEvidenceAssetPath(item)}
      fallbackGlyph={mysteryEvidenceEmoji(item)}
      className={className}
    />
  );
}

function MysteryInventoryVisual({
  item,
  className,
}: {
  item: { id: string; title: string; emoji: string };
  className?: string;
}) {
  return (
    <MysteryPropVisual
      bundledAssetPath={debateMysteryBundledInventoryAssetPath(item)}
      fallbackGlyph={item.emoji}
      className={className}
    />
  );
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

  const randomizeCast = (anchor?: {
    botId: string;
    botName: string;
    direction: string;
  }): void => {
    setError(null);
    const castCandidates = whodunnitCastCandidates.map((botId) => ({
      id: botId,
    }));
    const allocation = anchor
      ? randomizeWhodunnitCastAroundBot(
          castCandidates,
          targetSuspects,
          anchor.botId,
        )
      : randomizeWhodunnitCast(castCandidates, targetSuspects);
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
    if (anchor) {
      setInspiration(
        anchor.direction.trim() ||
          `A mystery centered on ${anchor.botName}'s world, relationships, and contradictions without assuming their guilt.`,
      );
    }
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
                const directedSetupTarget =
                  createBotDirectedSetupRefractTarget({
                    id: `whodunnit-setup-anchor-${bot.id}`,
                    label: `Build a Whodunnit around ${bot.name}`,
                    botId: bot.id,
                    botName: bot.name,
                    disabled: () => !canRandomizeCast,
                    run: randomizeCast,
                  });
                return (
                  <PrismRefractTarget
                    key={bot.id}
                    target={directedSetupTarget}
                  >
                    {(binding) => (
                      <button
                        {...binding}
                        type="button"
                        data-selected={suspect ? "true" : undefined}
                        aria-disabled={counsel}
                        onClick={() => toggleSuspect(bot.id)}
                        style={{ "--mystery-bot-color": bot.color ?? "#9c7cff" } as CSSProperties}
                        aria-pressed={suspect}
                      >
                        <span>{props.renderBotGlyph(bot.glyph, { size: 23, strokeWidth: 1.5 })}</span>
                        <strong>{bot.name}</strong>
                        <small>{counsel ? "Counsel" : suspect ? "Suspect" : "Available"}</small>
                      </button>
                    )}
                  </PrismRefractTarget>
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
  notebook: DebateMysteryNotebookV2;
  cleanupProposal: null;
}

type DeskReferenceKind = "lead" | "evidence" | "testimony";

interface DeskReference {
  kind: DeskReferenceKind;
  id: string;
  label: string;
}

type MysteryClientAction<T = DebateMysteryActionRequestV1> = T extends unknown
  ? Omit<T, "expectedRevision" | "idempotencyKey">
  : never;

function mysteryClientActionKey(action: MysteryClientAction): string {
  if (action.action === "inspect") return `inspect:${action.roomId}:${action.regionId}`;
  if (action.action === "use_access_item") {
    return `access:${action.accessItemId}:${action.targetKind}:${action.targetId}`;
  }
  return action.action;
}

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
  const inFlightMysteryActionKeysRef = useRef(new Set<string>());
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [questionCaret, setQuestionCaret] = useState(0);
  const [suspectRoomFocus, setSuspectRoomFocus] = useState<"observe" | "interview" | "search">("observe");
  const [suspectWalkIteration, setSuspectWalkIteration] = useState(0);
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
  const [notebook, setNotebook] = useState<DebateMysteryNotebookV2 | null>(null);
  const [deskOpen, setDeskOpen] = useState(false);
  const [caseFileOpen, setCaseFileOpen] = useState(false);
  const [spatialView, setSpatialView] = useState<"mansion" | "room">(
    state.activeActivity ? "room" : "mansion",
  );
  const [selectedSuspectSeatId, setSelectedSuspectSeatId] = useState<string | null>(null);
  const [comparisonSlots, setComparisonSlots] = useState<[DeskReference | null, DeskReference | null]>([null, null]);
  const [leadNoteDrafts, setLeadNoteDrafts] = useState<Record<string, string>>({});
  const [notebookSaving, setNotebookSaving] = useState(false);
  const [notebookError, setNotebookError] = useState<string | null>(null);
  const savedDeskRef = useRef("");
  const notebookReadyRef = useRef(false);
  const deskPullStartYRef = useRef<number | null>(null);
  const deskPullHandledRef = useRef(false);
  const [theory, setTheory] = useState<DebateMysteryTheoryV1>(
    state.theory ?? blankTheory(),
  );
  const [theoryBoardOpen, setTheoryBoardOpen] = useState(false);
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
  const remainingInvestigationRegions = activeRegions.filter(
    (region) => !currentRoom.inspectedRegionIds.includes(region.id),
  );
  const firstInspectableRegionId = remainingInvestigationRegions[0]?.id ?? null;
  const usableAccessItems = state.inventoryItems.filter((item) => item.usable);
  const discoveredRoomAccessTargets = currentRoom.observations.flatMap((observation) => {
    const region = template.regions.find((candidate) => candidate.id === observation.regionId);
    if (!region) return [];
    const center = region.polygon.reduce(
      (total, point) => ({
        x: total.x + point.x / region.polygon.length,
        y: total.y + point.y / region.polygon.length,
      }),
      { x: 0, y: 0 },
    );
    return (observation.accessTargets ?? []).map((target) => ({
      ...target,
      regionId: observation.regionId,
      x: Math.min(92, Math.max(8, center.x)),
      y: Math.min(72, Math.max(12, center.y)),
    }));
  });
  const currentSuspect = state.suspects.find(
    (suspect) => suspect.roomId === currentRoom.id,
  );
  const currentSuspectWalk = currentSuspect
    ? mysteryRoomSuspectWalkProfile(sessionId, currentRoom.id, currentSuspect.seatId)
    : null;
  const currentSuspectFacing = currentSuspectWalk
    ? mysteryRoomSuspectFacing(currentSuspectWalk, suspectWalkIteration)
    : "right";
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

  const playMysterySfx = useCallback((cue: DebateMysterySfxCue): void => {
    void playDebateMysterySfx({
      cue,
      enabled: props.audioEnabled,
      volume: props.audioVolume,
    });
  }, [props.audioEnabled, props.audioVolume]);

  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);

  const refreshNotebook = useCallback(async (): Promise<DebateMysteryNotebookV2 | null> => {
    try {
      const result = await request<NotebookResponse>(
        `/api/debates/${encodeURIComponent(sessionId)}/notebook`,
      );
      savedDeskRef.current = JSON.stringify({
        leadAnnotations: result.notebook.leadAnnotations,
        suspectNotes: result.notebook.suspectNotes,
        suspectPins: result.notebook.suspectPins,
      });
      notebookReadyRef.current = true;
      setNotebook(result.notebook);
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
    setSuspectWalkIteration(0);
    setQuestion("");
    setQuestionCaret(0);
  }, [state.currentRoomId]);

  useEffect(() => {
    const activity = state.activeActivity;
    if (activity?.kind === "investigation" && activity.roomId === state.currentRoomId) {
      setSuspectRoomFocus("search");
      return;
    }
    if (
      activity?.kind === "interview" &&
      currentSuspect?.seatId === activity.suspectSeatId
    ) {
      setSuspectRoomFocus("interview");
      return;
    }
    setSuspectRoomFocus("observe");
  }, [currentSuspect?.seatId, state.activeActivity, state.currentRoomId]);

  useEffect(() => {
    if (mysterySessionResetIdRef.current === sessionId) return;
    mysterySessionResetIdRef.current = sessionId;
    setFloor(state.rooms.find((room) => room.id === state.currentRoomId)?.floor ?? 1);
    setSelectedRoomId(state.currentRoomId);
    setSpatialView(state.activeActivity ? "room" : "mansion");
    setCaseFileOpen(false);
    setDeskOpen(state.playPhase === "theory");
    setSelectedSuspectSeatId(null);
    setComparisonSlots([null, null]);
    notebookReadyRef.current = false;
    savedDeskRef.current = "";
    setNotebook(null);
  }, [sessionId, state.activeActivity, state.currentRoomId, state.playPhase, state.rooms]);

  useEffect(() => {
    if (armedAccessItemId && !state.inventoryItems.some((item) => item.id === armedAccessItemId && item.usable)) {
      setArmedAccessItemId(null);
    }
  }, [armedAccessItemId, state.inventoryItems]);

  useEffect(() => {
    if (!selectedSuspectSeatId || state.metSuspectSeatIds.includes(selectedSuspectSeatId)) return;
    setSelectedSuspectSeatId(null);
  }, [selectedSuspectSeatId, state.metSuspectSeatIds]);

  useEffect(() => {
    if (state.playPhase === "theory") setDeskOpen(true);
  }, [state.playPhase]);

  useEffect(() => {
    const closeDeskOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      if (caseFileOpen) {
        setCaseFileOpen(false);
        playMysterySfx("folder");
        return;
      }
      if (deskOpen) {
        setComparisonSlots([null, null]);
        setDeskOpen(false);
        playMysterySfx("folder");
      }
    };
    window.addEventListener("keydown", closeDeskOnEscape);
    return () => window.removeEventListener("keydown", closeDeskOnEscape);
  }, [caseFileOpen, deskOpen, playMysterySfx]);

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
    let cancelled = false;
    let playbackStarted = false;
    let playbackAlignment: VoicePlaybackCharacterAlignment | null = null;
    const revealCompletedReply = (): void => {
      if (cancelled) return;
      setStreamedReply(latest.content);
      setStreamingMessageId((current) => current === latest.id ? null : current);
    };
    const suspect = mysterySuspectsRef.current.find((entry) => entry.seatId === latest.suspectSeatId);
    const playMysteryVoice = playMysteryVoiceRef.current;
    if (!suspect || !playMysteryVoice) {
      revealCompletedReply();
    } else {
      void playMysteryVoice(
        sessionId,
        mysteryBotForSuspectRef.current(suspect),
        latest.content,
        latest.id,
        {
          onStart: (durationMs, alignment) => {
            if (cancelled) return;
            playbackStarted = true;
            playbackAlignment = alignment ?? null;
            setInterviewSpeechTiming({
              text: latest.content,
              elapsedMs: 0,
              durationMs: Math.max(1, durationMs ?? latest.content.length * 42),
              alignment: playbackAlignment,
            });
          },
          onProgress: (elapsedMs, durationMs) => {
            if (cancelled) return;
            setStreamedReply(mysteryInterviewTranscriptVisibleText({
              text: latest.content,
              elapsedMs,
              durationMs,
              alignment: playbackAlignment,
            }));
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
          onEnd: () => {
            if (cancelled) return;
            setInterviewSpeechTiming((current) => current?.text === latest.content ? null : current);
            revealCompletedReply();
          },
          onCancel: () => {
            if (cancelled) return;
            setInterviewSpeechTiming((current) => current?.text === latest.content ? null : current);
            revealCompletedReply();
          },
        },
      ).then((played) => {
        if (!played) revealCompletedReply();
      }).catch(revealCompletedReply);
    }
    return () => {
      cancelled = true;
      // Development effect replay can dispose an utterance before it has
      // become audible. Permit the replayed effect to start it rather than
      // leaving this completed reply hidden indefinitely.
      if (!playbackStarted && playedInterviewMessageRef.current === latest.id) {
        playedInterviewMessageRef.current = null;
      }
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
    const serialized = JSON.stringify({
      leadAnnotations: notebook.leadAnnotations,
      suspectNotes: notebook.suspectNotes,
      suspectPins: notebook.suspectPins,
    });
    if (serialized === savedDeskRef.current) return;
    const timer = window.setTimeout(async () => {
      setNotebookSaving(true);
      setNotebookError(null);
      try {
        const result = await request<NotebookResponse>(
          `/api/debates/${encodeURIComponent(sessionId)}/notebook`,
          { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({
            expectedRevision: notebook.revision,
            idempotencyKey: mysteryId("desk-save"),
            leadAnnotations: notebook.leadAnnotations,
            suspectNotes: notebook.suspectNotes,
            suspectPins: notebook.suspectPins,
          }) },
        );
        savedDeskRef.current = JSON.stringify({ leadAnnotations: result.notebook.leadAnnotations, suspectNotes: result.notebook.suspectNotes, suspectPins: result.notebook.suspectPins });
        setNotebook(result.notebook);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "Desk autosave failed.";
        if (/desk changed in another window/iu.test(message)) void refreshNotebook();
        setNotebookError(message);
      } finally { setNotebookSaving(false); }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [notebook, refreshNotebook, request, sessionId]);

  const perform = async (
    action: MysteryClientAction,
    options: { suppressNavigationSfx?: boolean } = {},
  ): Promise<boolean> => {
    const actionKey = mysteryClientActionKey(action);
    if (busy || inFlightMysteryActionKeysRef.current.has(actionKey)) return false;
    inFlightMysteryActionKeysRef.current.add(actionKey);
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
      if (
        result.session.format === "turnabout" &&
        result.session.formatState.format === "turnabout" &&
        result.session.formatState.mysteryTrial
      ) {
        setTheoryBoardOpen(false);
        playMysterySfx("theory");
        announceAction(
          "Charges filed. The public gallery is assembling while Turnabout prepares the frozen court record.",
        );
        return true;
      }
      const next = result.session.formatState as DebateWhodunnitFormatStateV1;
      if (next.playPhase === "theory") {
        setTheoryBoardOpen(true);
      } else if (next.playPhase === "trial" || next.playPhase === "verdict") {
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
      const sfxCue = debateMysterySfxCueForAction({
        action: action.action,
        acquiredEvidence: Boolean(acquiredEvidence),
        nextPlayPhase: next.playPhase,
      });
      if (sfxCue && (sfxCue === "evidence" || !options.suppressNavigationSfx)) {
        playMysterySfx(sfxCue);
      }
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
      const recoveredActionToken = next.recoveredActionTokens.find((token) =>
        !state.recoveredActionTokens.some((current) => current.id === token.id));
      const changedLeadWasKnown = changedLeads.length === 1
        ? state.leads.some((lead) => lead.id === changedLeads[0]!.id)
        : false;
      const feedback = recoveredActionToken
        ? `Action token recovered · +${recoveredActionToken.amount} action`
        : changedLeads.length === 1
          ? changedLeadWasKnown
            ? `Lead updated · ${changedLeads[0]!.title}`
            : `New lead · ${changedLeads[0]!.title}`
          : changedLeads.length > 1
            ? `${changedLeads.length} leads updated in your notebook.`
            : action.action === "travel"
              ? next.rooms.find((room) => room.id === action.roomId)?.name
                ? `Entered ${next.rooms.find((room) => room.id === action.roomId)?.name}.`
                : "Room selected."
              : action.action === "begin_investigation"
                ? "Room investigation opened · free."
                : action.action === "begin_interview"
                  ? "Suspect interview opened · free."
                  : action.action === "end_activity"
                    ? next.playPhase === "theory"
                      ? "Actions exhausted. Theory Board opened."
                      : "Returned to the room."
                    : action.action === "inspect"
                      ? next.rooms.find((room) => room.id === action.roomId)?.searched
                        ? "All visible areas inspected."
                        : "Area investigated."
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
      inFlightMysteryActionKeysRef.current.delete(actionKey);
      setBusy(false);
    }
  };

  const beginRoomInvestigation = async (): Promise<void> => {
    if (await perform({ action: "begin_investigation", roomId: currentRoom.id })) {
      setSpatialView("room");
      setSuspectRoomFocus("search");
    }
  };

  const beginSuspectInterview = async (): Promise<void> => {
    if (!currentSuspect) return;
    if (await perform({ action: "begin_interview", suspectSeatId: currentSuspect.seatId })) {
      setSpatialView("room");
      setSuspectRoomFocus("interview");
    }
  };

  const finishActiveActivity = async (
    suppressNavigationSfx = false,
  ): Promise<boolean> => {
    if (!state.activeActivity) {
      setSuspectRoomFocus("observe");
      setLens((current) => ({ ...current, visible: false }));
      return true;
    }
    const finished = await perform(
      { action: "end_activity" },
      { suppressNavigationSfx },
    );
    if (finished) {
      setSuspectRoomFocus("observe");
      setLens((current) => ({ ...current, visible: false }));
    }
    return finished;
  };

  const openTheoryBoard = async (): Promise<void> => {
    const hadActiveActivity = Boolean(state.activeActivity);
    if (hadActiveActivity && !(await finishActiveActivity(true))) return;
    setTheoryBoardOpen(true);
    setCaseFileOpen(false);
    setDeskOpen(true);
    playMysterySfx("theory");
    if (!hadActiveActivity) announceAction("Theory Board opened.");
  };

  const closeTheoryBoard = (): void => {
    if (state.playPhase === "theory") return;
    setTheoryBoardOpen(false);
    playMysterySfx("return");
    announceAction("Returned to the mansion.");
  };

  const showMansion = (): void => {
    setSpatialView("mansion");
    setCaseFileOpen(false);
    setDeskOpen(false);
    setFloor(currentRoom.floor);
    setSelectedRoomId(currentRoom.id);
    playMysterySfx("return");
    announceAction("Returned to the mansion.");
  };

  const renderPartnerConsultation = (surface: "case-file" | "theory"): React.JSX.Element => (
    <section className={`${styles.partnerCard} ${surface === "theory" ? styles.theoryPartnerCard : ""}`}>
      <header>
        <div><small>Co-counsel · studies only your record</small><strong>{partner?.name ?? props.session.forAdvocate.name}</strong></div>
        <span className={styles.partnerMini}>{props.renderMysteryBotAvatar(partner ?? { id: props.session.forAdvocate.id, name: props.session.forAdvocate.name, color: null, glyph: null, hardMuted: false }, "mini", { demeanor: "partner", talking: busy, blinkEnabled: true })}</span>
      </header>
      {state.partnerConsultations.length ? (
        <div className={styles.partnerConsultationLog} aria-live="polite">
          {state.partnerConsultations.slice(-6).map((consultation) => (
            <article key={consultation.id}>
              <p><strong>You</strong>{consultation.question}</p>
              <div><strong>{partner?.name ?? "Co-counsel"}</strong><MysteryPublicMarkdown source={consultation.answer} suspects={state.suspects} /></div>
            </article>
          ))}
        </div>
      ) : <p className={styles.partnerStageHint}>Ask for help connecting only the rooms, evidence, testimony, leads, and notes you have uncovered.</p>}
      <textarea value={partnerQuestion} onChange={(event) => setPartnerQuestion(event.currentTarget.value)} placeholder="Ask your partner freely — type @ to reference evidence, testimony, people, or leads…" />
      {partnerMentionPicks.length ? <div className={styles.evidenceMentionMenu} role="listbox" aria-label="Partner case mentions"><small>Reference the public record</small>{partnerMentionPicks.map((pick) => <button type="button" key={`${pick.kind}:${pick.id}`} data-kind={pick.kind} style={{ "--mention-color": pick.color ?? undefined } as CSSProperties} onClick={() => { const action = commitMysteryMentionAtCaret(partnerQuestion, partnerQuestion.length, pick); if (action) setPartnerQuestion(action.replacement); }}>{pick.glyph} {pick.title}</button>)}</div> : null}
      <button type="button" disabled={busy || !partnerQuestion.trim()} onClick={() => { const asked = partnerQuestion.trim(); setPartnerQuestion(""); void perform({ action: "consult_partner", question: asked }); }}>Consult · free</button>
    </section>
  );

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

  const placeOnDeskAt = (reference: DeskReference, index: 0 | 1): void => {
    setComparisonSlots((current) => {
      if (current.some((slot) => slot?.kind === reference.kind && slot.id === reference.id)) return current;
      return index === 0 ? [reference, current[1]] : [current[0], reference];
    });
    setDeskOpen(true);
    playMysterySfx("paper");
    announceAction(`${reference.label} placed on the desk.`);
  };

  const placeOnDesk = (reference: DeskReference): void => {
    const openIndex: 0 | 1 = comparisonSlots[0] ? 1 : 0;
    placeOnDeskAt(reference, openIndex);
  };

  const clearDesk = (close = true): void => {
    setComparisonSlots([null, null]);
    if (close) setDeskOpen(false);
    playMysterySfx("folder");
  };

  const toggleDesk = (): void => {
    if (deskPullHandledRef.current) {
      deskPullHandledRef.current = false;
      return;
    }
    if (deskOpen) clearDesk();
    else {
      setDeskOpen(true);
      playMysterySfx("folder");
    }
  };

  const beginDeskPull = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    deskPullStartYRef.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishDeskPull = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const startY = deskPullStartYRef.current;
    deskPullStartYRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (startY === null) return;
    const deltaY = event.clientY - startY;
    if (!deskOpen && deltaY < -28) {
      deskPullHandledRef.current = true;
      setDeskOpen(true);
      playMysterySfx("folder");
    } else if (deskOpen && deltaY > 28) {
      deskPullHandledRef.current = true;
      clearDesk();
    }
  };

  const updateDesk = (change: (current: DebateMysteryNotebookV2) => DebateMysteryNotebookV2): void => {
    setNotebook((current) => current ? change(current) : current);
  };

  const addLeadAnnotation = (leadId: string): void => {
    const text = leadNoteDrafts[leadId]?.trim();
    const lead = state.leads.find((entry) => entry.id === leadId);
    if (!text || !lead) return;
    updateDesk((current) => ({ ...current, leadAnnotations: [...current.leadAnnotations, { id: mysteryId("lead-note"), leadId, leadRevision: lead.revision, text, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }));
    setLeadNoteDrafts((current) => ({ ...current, [leadId]: "" }));
    playMysterySfx("pencil");
  };

  const editLeadAnnotation = (annotationId: string, text: string): void => {
    updateDesk((current) => ({
      ...current,
      leadAnnotations: current.leadAnnotations.map((annotation) => annotation.id === annotationId
        ? { ...annotation, text, updatedAt: new Date().toISOString() }
        : annotation),
    }));
  };

  const removeLeadAnnotation = (annotationId: string): void => {
    updateDesk((current) => ({ ...current, leadAnnotations: current.leadAnnotations.filter((annotation) => annotation.id !== annotationId) }));
    playMysterySfx("paper");
  };

  const setSuspectNote = (seatId: string, text: string): void => {
    updateDesk((current) => ({ ...current, suspectNotes: [...current.suspectNotes.filter((entry) => entry.seatId !== seatId), ...(text.trim() ? [{ seatId, text, updatedAt: new Date().toISOString() }] : [])] }));
  };

  const togglePin = (reference: DeskReference): void => {
    if (!selectedSuspectSeatId || !notebook) return;
    const existing = notebook.suspectPins.find((pin) => pin.seatId === selectedSuspectSeatId && pin.referenceKind === reference.kind && pin.referenceId === reference.id);
    updateDesk((current) => ({ ...current, suspectPins: existing ? current.suspectPins.filter((pin) => pin.id !== existing.id) : [...current.suspectPins, { id: mysteryId("desk-pin"), referenceKind: reference.kind, referenceId: reference.id, seatId: selectedSuspectSeatId, createdAt: new Date().toISOString() }] }));
    playMysterySfx(existing ? "paper" : "clip");
    announceAction(existing ? "Hypothesis unpinned." : "Pinned as your hypothesis — not evidence.");
  };

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

  const revealedSuspects = state.suspects.filter((suspect) => state.metSuspectSeatIds.includes(suspect.seatId));
  const selectedDeskSuspect = revealedSuspects.find((suspect) => suspect.seatId === selectedSuspectSeatId) ?? null;
  const selectedDeskNote = selectedDeskSuspect ? notebook?.suspectNotes.find((note) => note.seatId === selectedDeskSuspect.seatId)?.text ?? "" : "";
  const deskReferences: DeskReference[] = [
    ...state.leads.map((lead) => ({ kind: "lead" as const, id: lead.id, label: lead.title })),
    ...state.discoveredEvidence.map((item) => ({ kind: "evidence" as const, id: item.id, label: mysteryEvidenceTitle(item.title) })),
    ...state.testimony.map((item) => ({ kind: "testimony" as const, id: item.id, label: `Testimony · ${mysteryTestimonySpeaker(state, item.speakerSeatId)?.name ?? "Witness"}` })),
  ];
  const selectedDeskRoom = selectedDeskSuspect ? state.rooms.find((room) => room.id === selectedDeskSuspect.roomId) ?? null : null;
  const selectedDeskMessages = selectedDeskSuspect ? state.interviewLog.filter((message) => message.suspectSeatId === selectedDeskSuspect.seatId) : [];
  const selectedDeskTestimony = selectedDeskSuspect ? state.testimony.filter((item) => item.speakerSeatId === selectedDeskSuspect.seatId) : [];
  const selectedDeskRoomEvidence = selectedDeskRoom ? state.discoveredEvidence.filter((item) => item.roomId === selectedDeskRoom.id) : [];
  const selectedDeskConfrontedEvidence = [...new Set(selectedDeskMessages.flatMap((message) => message.evidenceId ? [message.evidenceId] : []))]
    .flatMap((id) => state.discoveredEvidence.find((item) => item.id === id) ?? []);
  const selectedDeskLinkedLeads = selectedDeskRoom ? state.leads.filter((lead) =>
    lead.linkedRoomIds.includes(selectedDeskRoom.id)
    || lead.linkedTestimonyIds.some((id) => selectedDeskTestimony.some((item) => item.id === id))) : [];
  const selectedDeskPins = selectedDeskSuspect ? notebook?.suspectPins.filter((pin) => pin.seatId === selectedDeskSuspect.seatId) ?? [] : [];
  const theoryMode = theoryBoardOpen || state.playPhase === "theory";
  const theoryClaimOptions = debateMysteryTheoryClaimOptions(state);
  const investigationMusicMix = mysteryInvestigationMusicMix({
    theoryBoardOpen,
  });
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
    if (nextFloor !== floor) playMysterySfx("map");
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
    if (state.actionsRemaining === 0) return;
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
    if (state.actionsRemaining === 0) return;
    const itemId = accessItemFromDrag(event);
    if (itemId) void applyAccessItem(itemId, targetKind, targetId);
  };
  const beginAccessItemDrag = (
    event: ReactDragEvent<HTMLElement>,
    itemId: string,
    itemTitle: string,
  ): void => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-prism-access-item", itemId);
    announceAction(`Carrying ${itemTitle}. Drop it on a discovered padlock or locked room.`);
  };
  const toggleAccessItem = (itemId: string, itemTitle: string): void => {
    const arming = armedAccessItemId !== itemId;
    setArmedAccessItemId(arming ? itemId : null);
    announceAction(arming
      ? `Using ${itemTitle}. Select a discovered padlock or locked room.`
      : `${itemTitle} returned to the Case Kit.`);
  };
  const enterSelectedRoom = async (): Promise<void> => {
    if (selectedRoom.id === currentRoom.id) {
      setSpatialView("room");
      playMysterySfx("return");
      announceAction(`Entered ${currentRoom.name ?? "the room"}.`);
      return;
    }
    if (await perform({ action: "travel", roomId: selectedRoom.id })) {
      setSpatialView("room");
      setCaseFileOpen(false);
      setDeskOpen(false);
    }
  };
  const selectedRoomActionLabel = selectedRoom.id === currentRoom.id
    ? "Enter room"
    : selectedRoom.discovered
      ? "Go to room"
      : "Discover room · 1 action";
  const nearestInvestigationRegion = (x: number, y: number) =>
    mysteryInvestigationTargetAt(
      activeRegions,
      currentRoom.inspectedRegionIds,
      x,
      y,
    );
  const moveInvestigationLens = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
    const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
    if (!armedAccessItemId && (event.target as Element).closest('[data-mystery-region-id][data-inspected="true"]')) {
      setLens({ x, y, proximity: 0, visible: false, regionId: null });
      return;
    }
    const nearest = nearestInvestigationRegion(x, y);
    if (nearest.inspected) {
      setLens({ x, y, proximity: 0, visible: false, regionId: nearest.regionId });
      return;
    }
    setLens({ x, y, proximity: Number.isFinite(nearest.distance) ? Math.max(0, 1 - nearest.distance / 26) : 0, visible: nearest.regionId !== null, regionId: nearest.regionId });
  };

  const deskReferenceFor = (kind: DeskReferenceKind, id: string): DeskReference | null =>
    deskReferences.find((reference) => reference.kind === kind && reference.id === id) ?? null;

  const selectSuspectFolder = (seatId: string, revealed: boolean): void => {
    if (!revealed) {
      announceAction("Interview this suspect to reveal their folder.");
      return;
    }
    setSelectedSuspectSeatId(seatId);
    setDeskOpen(true);
    playMysterySfx("folder");
  };

  const addPinnedRecordToTheory = (reference: DeskReference): void => {
    if (reference.kind === "evidence") {
      setTheory((current) => current.evidenceIds.includes(reference.id)
        ? current
        : { ...current, evidenceIds: [...current.evidenceIds, reference.id] });
    } else if (reference.kind === "testimony") {
      setTheory((current) => current.testimonyIds.includes(reference.id)
        ? current
        : { ...current, testimonyIds: [...current.testimonyIds, reference.id] });
    } else return;
    playMysterySfx("clip");
    announceAction(`${reference.label} added to the filed theory record.`);
  };

  const renderSuspectFolderRack = (surface: "investigation" | "theory"): React.JSX.Element => (
    <section className={styles.suspectFolderRack} data-surface={surface} aria-label="Suspect folders">
      <header><p className={styles.eyebrow}>Gallery</p><strong>Suspect folders</strong><small>Full HD interview reveals a folder.</small></header>
      <div>{state.suspects.map((suspect) => {
        const revealed = state.metSuspectSeatIds.includes(suspect.seatId);
        return <button key={suspect.seatId} type="button" className={styles.suspectFolder} data-revealed={revealed ? "true" : undefined} aria-pressed={selectedDeskSuspect?.seatId === suspect.seatId} onClick={() => selectSuspectFolder(suspect.seatId, revealed)}>
          {revealed ? <span className={styles.folderAvatar}>{props.renderMysteryBotAvatar(mysteryBotForSuspect(suspect), "mini", { demeanor: "suspect", blinkEnabled: true })}</span> : <span className={styles.folderUnknown} aria-hidden="true"><i /><b>?</b></span>}
          <strong>{revealed ? suspect.name : "Unknown suspect"}</strong><small>{revealed ? state.rooms.find((room) => room.id === suspect.roomId)?.name ?? "Known room" : "Full HD interview required"}</small>
        </button>;
      })}</div>
    </section>
  );

  const renderComparisonSlots = (surface: "investigation" | "theory"): React.JSX.Element => (
    <div className={styles.comparisonSlots} aria-label={`${surface === "theory" ? "Theory " : ""}comparison slots`}>
      {comparisonSlots.map((slot, index) => <div key={index} className={styles.comparisonSlot} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
        const raw = event.dataTransfer.getData("application/x-prism-desk-reference");
        const reference = deskReferences.find((entry) => `${entry.kind}:${entry.id}` === raw);
        if (reference) placeOnDeskAt(reference, index as 0 | 1);
      }}>
        <small>Comparison {index + 1}</small>
        {slot ? <><strong>{slot.label}</strong><button type="button" onClick={() => setComparisonSlots((current) => index === 0 ? [null, current[1]] : [current[0], null])}>Remove</button></> : <span>Place a discovered record here</span>}
      </div>)}
    </div>
  );

  const renderSelectedSuspectFile = (surface: "investigation" | "theory"): React.JSX.Element => {
    if (!selectedDeskSuspect) return <p className={styles.deskEmpty}>Open a revealed suspect folder to {surface === "theory" ? "review notes or pin a compared record" : "write a note or pin a compared record"}.</p>;
    const pinnedReferences = selectedDeskPins.flatMap((pin) => {
      const reference = deskReferenceFor(pin.referenceKind, pin.referenceId);
      return reference ? [{ pin, reference }] : [];
    });
    const comparedReferences = comparisonSlots.filter((reference): reference is DeskReference => reference !== null);
    return <article className={styles.suspectDeskFile}>
      <header><div><small>Revealed folder · public facts only</small><h3>{selectedDeskSuspect.name}</h3></div><button type="button" onClick={() => setSelectedSuspectSeatId(null)}>Close folder</button></header>
      <div className={styles.deskFactSummary}>
        <section><small>Known room</small><strong>{selectedDeskRoom?.name ?? "No room recorded"}</strong></section>
        <section><small>Interview record</small><strong>{selectedDeskMessages.filter((message) => message.role === "suspect").length} exchange{selectedDeskMessages.filter((message) => message.role === "suspect").length === 1 ? "" : "s"}</strong></section>
        <section><small>Room evidence</small><strong>{selectedDeskRoomEvidence.length}</strong></section>
      </div>
      <div className={styles.deskFactGroups}>
        <section><strong>Committed testimony</strong>{selectedDeskTestimony.length ? selectedDeskTestimony.map((item) => <blockquote key={item.id}>{item.exactQuote}</blockquote>) : <p>No exact testimony committed yet.</p>}</section>
        <section><strong>Evidence found in their room</strong>{selectedDeskRoomEvidence.length ? <ul>{selectedDeskRoomEvidence.map((item) => <li key={item.id}>{mysteryEvidenceTitle(item.title)}</li>)}</ul> : <p>No room evidence discovered.</p>}</section>
        <section><strong>Evidence you confronted them with</strong>{selectedDeskConfrontedEvidence.length ? <ul>{selectedDeskConfrontedEvidence.map((item) => <li key={item.id}>{mysteryEvidenceTitle(item.title)}</li>)}</ul> : <p>No explicit evidence confrontation recorded.</p>}</section>
        <section><strong>Linked public leads</strong>{selectedDeskLinkedLeads.length ? <ul>{selectedDeskLinkedLeads.map((lead) => <li key={lead.id}>{lead.title}</li>)}</ul> : <p>No discovered lead currently links here.</p>}</section>
      </div>
      <section className={styles.suspectNotePad}><strong>Private notes</strong>{surface === "theory"
        ? <p className={styles.readOnlyDeskNote}>{selectedDeskNote || "No private notes recorded. Return to the investigation desk to write notes."}</p>
        : <textarea value={selectedDeskNote} onChange={(event) => setSuspectNote(selectedDeskSuspect.seatId, event.currentTarget.value)} onBlur={() => playMysterySfx("pencil")} placeholder="Your plain-text notes — a fallible hypothesis, never evidence." />}</section>
      <section className={styles.comparisonPaperclips}><strong>Paperclip a compared record</strong>{comparedReferences.length ? comparedReferences.map((reference) => {
        const pinned = selectedDeskPins.some((pin) => pin.referenceKind === reference.kind && pin.referenceId === reference.id);
        return <button key={`${reference.kind}:${reference.id}`} type="button" aria-pressed={pinned} onClick={() => togglePin(reference)}>{pinned ? "Unpin" : "Paperclip pin"} · {reference.label}</button>;
      }) : <p>Place a record into either comparison slot first.</p>}</section>
      <section className={styles.playerHypotheses}><strong>Your unverified pinned connections</strong>{pinnedReferences.length ? pinnedReferences.map(({ pin, reference }) => {
        const attached = reference.kind === "evidence" ? theory.evidenceIds.includes(reference.id) : reference.kind === "testimony" ? theory.testimonyIds.includes(reference.id) : false;
        return <div key={pin.id}><span>📎 {reference.label}</span><button type="button" onClick={() => togglePin(reference)}>Unpin</button>{surface === "theory" && reference.kind !== "lead" ? <button type="button" disabled={attached} onClick={() => addPinnedRecordToTheory(reference)}>{attached ? "Added to theory" : "Add to theory"}</button> : null}</div>;
      }) : <p>No player-authored connections pinned.</p>}</section>
    </article>;
  };

  const renderInvestigatorDesk = (surface: "investigation" | "theory"): React.JSX.Element => (
    <section className={styles.investigatorDesk} data-open={deskOpen ? "true" : undefined} data-surface={surface} data-tutorial-target="whodunnit-investigator-desk" aria-label={`Investigator's desk${surface === "theory" ? " on Theory Board" : ""}`}>
      <button type="button" className={styles.deskHandle} aria-expanded={deskOpen} onPointerDown={beginDeskPull} onPointerUp={finishDeskPull} onClick={toggleDesk}>Investigator&apos;s Desk <span>{deskOpen ? "Pull down or press to close" : "Pull up or press to open"}</span></button>
      {deskOpen ? <div className={styles.deskSurface}>
        {renderComparisonSlots(surface)}
        <div className={styles.deskWorkspace}>
          <nav aria-label="Desk records">{deskReferences.map((reference) => <button key={`${reference.kind}:${reference.id}`} type="button" draggable onDragStart={(event) => event.dataTransfer.setData("application/x-prism-desk-reference", `${reference.kind}:${reference.id}`)} onClick={() => placeOnDesk(reference)}>{reference.label}<small>Place on desk</small></button>)}</nav>
          {renderSelectedSuspectFile(surface)}
        </div>
      </div> : null}
      {notebookError ? <p className={styles.error}>{notebookError}</p> : null}
      <small>{notebookSaving ? "Saving desk…" : "Pins are your hypotheses. They never become evidence or satisfy a theory."}</small>
    </section>
  );

  return (
    <main className={styles.play} data-theme="dark" data-phase={state.playPhase}>
      <SessionAtmosphereLayer
        active={Boolean(
          props.audioEnabled &&
          props.audioVolume > 0 &&
          mysteryInvestigationMusicSessionActive(state.playPhase)
        )}
        sessionKey={`whodunnit-investigation:${sessionId}`}
        volume={props.audioVolume}
        backgroundUrl={WHODUNNIT_INVESTIGATION_MUSIC_URL}
        backgroundRecordable={false}
        mix={investigationMusicMix}
        mixTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS}
        lifecycleTransitionMs={WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS}
        ambientFoley={false}
      />
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
          {!inTrial && !atVerdict ? <button type="button" aria-pressed={caseFileOpen} onClick={() => {
            setCaseFileOpen((open) => !open);
            setDeskOpen(false);
            playMysterySfx("folder");
          }}>Case file</button> : null}
          {!inTrial && !atVerdict ? <button type="button" aria-pressed={deskOpen} onClick={() => {
            setDeskOpen((open) => !open);
            setCaseFileOpen(false);
            playMysterySfx("paper");
          }}>Desk</button> : null}
          <button type="button" onClick={() => void openTheoryBoard()} data-tutorial-target="whodunnit-theory-control">Theory</button>
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
                  <div className={styles.spoilerEvidenceGrid}>{spoilerEvidence.map((item) => <article key={item.id}><MysteryEvidenceVisual item={item} /><div><strong>{mysteryEvidenceTitle(item.title)}</strong><p>{mysteryEvidenceObservation(item.observation)}</p></div></article>)}</div>
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
              <button type="button" onClick={() => placeOnDesk({ kind: "testimony", id: activeTestimony.id, label: `Testimony · ${mysteryTestimonySpeaker(state, activeTestimony.speakerSeatId)?.name ?? "Witness"}` })}>Place on desk</button>
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
          <header>{state.playPhase !== "theory" ? <button type="button" className={styles.backToMansion} data-ui-sfx="none" onClick={closeTheoryBoard}>← Return to mansion</button> : null}<p className={styles.eyebrow}>Theory Board</p><h2>Build the chain. Then file.</h2><p>{state.playPhase === "theory" ? "Your investigation actions are exhausted. The mansion record is now closed, but your partner remains available while you build the strongest case possible." : "Filing is free, freezes this theory, and begins the mandatory trial—even if the accusation is wrong."}</p><div className={styles.theoryProgress} aria-label={`${theoryReadyCount} of ${theoryChecklist.length} theory sections ready`}>{theoryChecklist.map((item, index) => <span key={item.label} data-complete={item.complete ? "true" : undefined}><i>{item.complete ? "✓" : index + 1}</i>{item.label}</span>)}</div></header>
          {state.playPhase === "continuance" ? <div className={styles.continuance}>PRISM granted one continuance. The mansion is preserved and {state.actionsRemaining} emergency actions are available.</div> : null}
          <div className={styles.theoryFields}>
            <label>Culprit<select value={theory.culpritSeatId ?? ""} onChange={(event) => {
              const culpritSeatId = event.currentTarget.value || null;
              setTheory((current) => ({ ...current, culpritSeatId }));
            }}><option value="">Choose the accused</option>{state.suspects.map((suspect) => <option key={suspect.seatId} value={suspect.seatId}>{suspect.name}</option>)}</select></label>
            {(["method", "motive", "opportunity"] as const).map((kind, index) => (
              <fieldset key={kind} className={styles.theoryClaimPicker}>
                <legend><b>{index + 2}</b> {kind[0]!.toUpperCase() + kind.slice(1)}</legend>
                <div>{theoryClaimOptions[kind].length ? theoryClaimOptions[kind].map((option) => (
                  <button key={option.id} type="button" aria-pressed={theory[kind] === option.value} onClick={() => setTheory((current) => ({ ...current, [kind]: option.value }))}>
                    <strong>{option.sourceLabel}</strong><span>{option.value}</span>
                  </button>
                )) : <p>Discover a public record before filing this claim.</p>}</div>
              </fieldset>
            ))}
            <label>Optional accomplice<select value={theory.accompliceSeatId ?? ""} onChange={(event) => {
              const accompliceSeatId = event.currentTarget.value || null;
              setTheory((current) => ({ ...current, accompliceSeatId }));
            }}><option value="">No accomplice alleged</option>{state.suspects.filter((suspect) => suspect.seatId !== theory.culpritSeatId).map((suspect) => <option key={suspect.seatId} value={suspect.seatId}>{suspect.name}</option>)}</select></label>
          </div>
          <div className={styles.proofAttach}>
            <fieldset><legend>Physical evidence</legend>{state.discoveredEvidence.length ? state.discoveredEvidence.map((item) => <label key={item.id}><input type="checkbox" checked={theory.evidenceIds.includes(item.id)} onChange={() => setTheory((current) => ({ ...current, evidenceIds: current.evidenceIds.includes(item.id) ? current.evidenceIds.filter((id) => id !== item.id) : [...current.evidenceIds, item.id] }))} /><MysteryEvidenceVisual item={item} /> {mysteryEvidenceTitle(item.title)}</label>) : <p>Search rooms to add evidence to the record.</p>}</fieldset>
            <fieldset><legend>Testimony</legend>{state.testimony.length ? state.testimony.map((item) => {
              const speaker = mysteryTestimonySpeaker(state, item.speakerSeatId);
              return <label key={item.id} className={styles.theoryTestimony}><input type="checkbox" checked={theory.testimonyIds.includes(item.id)} onChange={() => setTheory((current) => ({ ...current, testimonyIds: current.testimonyIds.includes(item.id) ? current.testimonyIds.filter((id) => id !== item.id) : [...current.testimonyIds, item.id] }))} /><span><strong style={{ "--suspect-color": speaker?.color ?? "#a98cff" } as CSSProperties}>{speaker?.name ?? "Witness"}</strong><q>{item.exactQuote}</q></span></label>;
            }) : <p>Interview suspects to add exact testimony.</p>}</fieldset>
          </div>
          {renderSuspectFolderRack("theory")}
          {renderInvestigatorDesk("theory")}
          {renderPartnerConsultation("theory")}
          <button type="button" className={styles.fileTheoryButton} disabled={busy || theoryReadyCount !== theoryChecklist.length} onClick={() => void perform({ action: "file_theory", theory })}>File accusation and prepare Turnabout</button>
        </section>
      ) : (
        <div
          className={styles.investigation}
          data-view={spatialView}
          data-desk-open={deskOpen ? "true" : undefined}
          data-case-file-open={caseFileOpen ? "true" : undefined}
        >
          <section className={styles.floorplan} data-tutorial-target="whodunnit-floorplan">
            <header>
              <div><p className={styles.eyebrow}>The mansion</p><strong>{floorDisplayName(floor)}</strong></div>
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
                    data-searched={room.searched ? "true" : undefined}
                    data-locked={room.locked || (!room.discovered && state.actionsRemaining === 0) ? "true" : undefined}
                    data-access-ready={armedAccessItemId && room.locked ? "true" : undefined}
                    aria-pressed={room.id === selectedRoom.id}
                    aria-label={`${room.discovered ? room.name ?? "Room" : "Undiscovered room"}${room.searched ? ", all visible areas inspected" : ""}${room.locked ? ", locked" : ""}${armedAccessItemId && room.locked ? ", use selected access item" : ""}`}
                    disabled={busy || Boolean(armedAccessItemId && room.locked && state.actionsRemaining === 0)}
                    onDragOver={room.locked ? (event) => event.preventDefault() : undefined}
                    onDrop={room.locked ? (event) => dropAccessItem(event, "room", room.id) : undefined}
                    onClick={() => {
                      if (armedAccessItemId && room.locked) {
                        void applyAccessItem(armedAccessItemId, "room", room.id);
                        return;
                      }
                      setSelectedRoomId(room.id);
                      if (room.id !== selectedRoom.id) playMysterySfx("map");
                      announceAction(room.discovered ? `${room.name ?? "Room"} selected.` : "Undiscovered room selected.");
                    }}
                    style={{ left: `${mapX(room.x)}%`, top: `${mapY(room.y)}%`, width: `${roomWidthPercent(room.width)}%`, height: `${roomHeightPercent(room.height)}%` }}
                  >
                    {room.discovered ? <><strong>{room.name ?? "Unnamed room"}</strong>
                    {state.suspects.filter((suspect) => suspect.roomId === room.id).map((suspect) => {
                      const bot = mysteryBotForSuspect(suspect);
                      const position = mysteryMapOccupantPosition(sessionId, room.id, suspect.seatId);
                      return <i
                        className={styles.mapOccupant}
                        key={suspect.seatId}
                        role="img"
                        aria-label={`${suspect.name} is known to be here`}
                        data-tutorial-target="whodunnit-micro-avatar"
                        style={{ left: `${position.xPct}%`, top: `${position.yPct}%`, color: bot.color ?? "#9c7cff" }}
                      >{props.renderBotGlyph(bot.glyph, { size: 18, strokeWidth: 1.5, className: styles.mapOccupantGlyph })}</i>;
                    })}
                    {room.searched ? <i className={styles.mapRoomCompleteMark} aria-hidden="true">✓</i> : null}
                    {room.neighborIds.some((id) => state.rooms.find((candidate) => candidate.id === id)?.floor !== room.floor) ? <small>Stairs</small> : null}</> : null}
                  </button>
                ))}
              </div>
            </div>
            <section className={styles.mapDetails} aria-live="polite" data-locked={selectedRoomLocked ? "true" : undefined}>
              <div><small>Selected room</small><strong>{selectedRoomIsKnown ? selectedRoom.name ?? "Unnamed room" : "Undiscovered room"}</strong><span>{selectedRoomIsKnown ? `${floorDisplayName(selectedRoom.floor)} · ${selectedRoom.locked ? "Locked · try an access item" : selectedRoom.searched ? "All visible areas inspected" : "Visited"}` : selectedRoomLocked ? "Locked · no actions" : "Discover to reveal"}</span></div>
              {selectedRoomIsKnown ? <dl><div><dt>Known occupant</dt><dd>{selectedRoomOccupant ? selectedRoomOccupant.name : "Unknown"}</dd></div><div><dt>Known clues</dt><dd>{selectedRoomClueCount}</dd></div></dl> : null}
              <button type="button" disabled={busy || Boolean(state.activeActivity) || selectedRoomLocked} onClick={() => void enterSelectedRoom()}>{selectedRoomActionLabel}</button>
            </section>
            <small>Choose where to descend. New rooms cost 1 action; revisits are free.</small>
          </section>
          <section className={styles.roomPanel} data-kind={currentRoom.kind ?? "undiscovered"} data-focus={suspectRoomFocus}>
            <header><div><p className={styles.eyebrow}>{(currentRoom.kind ?? "room").replace("_", " ")}</p><h2>{currentRoom.name ?? "Undiscovered room"}</h2></div><div className={styles.roomHeaderActions}>{suspectRoomFocus === "search" ? <button type="button" className={styles.leaveInvestigation} data-ui-sfx="none" disabled={busy} onClick={() => void finishActiveActivity()}>← Return to room</button> : suspectRoomFocus === "observe" ? <button type="button" className={styles.backToMansion} data-ui-sfx="none" onClick={showMansion}>← Mansion</button> : null}</div></header>
            <div
              className={styles.roomScene}
              data-blurred={currentSuspect && suspectRoomFocus === "interview" ? "true" : undefined}
              data-observing={suspectRoomFocus === "observe" ? "true" : undefined}
              data-investigating={suspectRoomFocus === "search" ? "true" : undefined}
              style={{ "--room-deep": template.palette[0], "--room-mid": template.palette[1], "--room-light": template.palette[2] } as CSSProperties}
              onPointerMove={suspectRoomFocus === "search" ? moveInvestigationLens : undefined}
              onClickCapture={(event) => {
                if (suspectRoomFocus !== "search" || event.detail === 0 || busy || state.actionsRemaining === 0) return;
                // Let a real hotspot own its click. The scene-level fallback is only
                // for the surrounding image, where we resolve the nearest region.
                if ((event.target as Element).closest("[data-mystery-region-id], [data-mystery-room-control]")) return;
                const bounds = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * 100;
                const y = ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * 100;
                const nearest = nearestInvestigationRegion(x, y);
                if (!nearest.regionId || nearest.inspected) return;
                event.preventDefault();
                event.stopPropagation();
                void perform({ action: "inspect", roomId: currentRoom.id, regionId: nearest.regionId });
              }}
              onPointerDown={(event) => {
                if (
                  suspectRoomFocus === "interview" &&
                  !(event.target as Element).closest("[data-mystery-interview-interactive]")
                ) {
                  void finishActiveActivity();
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
              {suspectRoomFocus === "search" ? activeRegions.map((region) => (
                <button
                  type="button"
                  key={region.id}
                  className={styles.hotspot}
                  style={{ clipPath: regionClip(region), zIndex: lens.regionId === region.id ? 5 : 4 }}
                  aria-label={`${currentRoom.inspectedRegionIds.includes(region.id) ? "Already inspected" : "Inspect"} the ${region.label}`}
                  aria-disabled={currentRoom.inspectedRegionIds.includes(region.id) || state.actionsRemaining === 0}
                  title={`${currentRoom.inspectedRegionIds.includes(region.id) ? "Already inspected" : "Inspect"}: ${region.label}`}
                  tabIndex={currentRoom.inspectedRegionIds.includes(region.id) ? -1 : 0}
                  data-inspected={currentRoom.inspectedRegionIds.includes(region.id) ? "true" : undefined}
                  data-mystery-region-id={region.id}
                  disabled={busy || state.actionsRemaining === 0 || currentRoom.inspectedRegionIds.includes(region.id)}
                  onClick={() => {
                    if (state.actionsRemaining === 0 || currentRoom.inspectedRegionIds.includes(region.id)) return;
                    void perform({ action: "inspect", roomId: currentRoom.id, regionId: region.id });
                  }}
                  data-tutorial-target={region.id === firstInspectableRegionId ? "whodunnit-hotspot" : undefined}
                ><span>Inspect {region.label}</span></button>
              )) : null}
              {suspectRoomFocus === "search" ? discoveredRoomAccessTargets.map((target) => (
                <button
                  type="button"
                  key={`${target.targetKind}:${target.targetId}`}
                  className={styles.roomLockTarget}
                  data-mystery-room-control
                  data-access-ready={armedAccessItemId ? "true" : undefined}
                  data-tutorial-target="whodunnit-room-lock"
                  style={{ left: `${target.x}%`, top: `${target.y}%` }}
                  aria-label={`${target.targetLabel}, locked${armedAccessItemId ? ". Try selected Case Kit item" : ". Choose an item from the Case Kit"}`}
                  title={armedAccessItemId ? `Try selected item on ${target.targetLabel}` : `${target.targetLabel} · locked`}
                  disabled={busy || state.actionsRemaining === 0}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => dropAccessItem(event, target.targetKind, target.targetId)}
                  onClick={() => {
                    if (armedAccessItemId) {
                      void applyAccessItem(armedAccessItemId, target.targetKind, target.targetId);
                      return;
                    }
                    announceAction(`Choose or drag a Case Kit item to ${target.targetLabel}.`);
                  }}
                >
                  {debateMysteryBundledLockTargetAssetPath(target.targetLabel)
                    ? <img src={debateMysteryBundledLockTargetAssetPath(target.targetLabel)!} alt="" aria-hidden="true" />
                    : <svg viewBox="0 0 32 36" aria-hidden="true" focusable="false">
                      <path d="M8 16v-5a8 8 0 0 1 16 0v5" />
                      <rect x="4" y="15" width="24" height="18" rx="5" />
                      <circle cx="16" cy="24" r="2.2" />
                    </svg>}
                  <span>{target.targetLabel}</span>
                </button>
              )) : null}
              {suspectRoomFocus === "search" ? <aside className={styles.roomCaseKit} data-mystery-room-control data-tutorial-target="whodunnit-room-case-kit" aria-label="Case Kit">
                <header><strong>Case Kit</strong><span>{usableAccessItems.length}</span></header>
                {usableAccessItems.length ? <div>{usableAccessItems.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    draggable={!busy}
                    disabled={busy}
                    aria-pressed={armedAccessItemId === item.id}
                    title={`${item.title}: ${item.description}`}
                    onDragStart={(event) => beginAccessItemDrag(event, item.id, item.title)}
                    onClick={() => toggleAccessItem(item.id, item.title)}
                  >
                    <MysteryInventoryVisual item={item} />
                    <strong>{item.title}</strong>
                  </button>
                ))}</div> : <p>No access tools recovered yet.</p>}
                <small>{armedAccessItemId ? `Selected: ${state.inventoryItems.find((item) => item.id === armedAccessItemId)?.title ?? "access item"}` : discoveredRoomAccessTargets.length ? "Drag a tool to a padlock, or select one first." : "Recovered keys, codes, and remotes appear here."}</small>
              </aside> : null}
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
                  style={{
                    "--suspect-walk-start": `${currentSuspectWalk?.startPct ?? 26}%`,
                    "--suspect-walk-waypoint": `${currentSuspectWalk?.waypointPct ?? 48}%`,
                    "--suspect-walk-end": `${currentSuspectWalk?.endPct ?? 68}%`,
                    "--suspect-walk-duration": `${currentSuspectWalk?.durationMs ?? 19_000}ms`,
                    "--suspect-walk-delay": `${currentSuspectWalk?.delayMs ?? 0}ms`,
                  } as CSSProperties}
                  data-avatar-facing={currentSuspectFacing}
                  onAnimationIteration={(event) => {
                    if (event.target !== event.currentTarget) return;
                    setSuspectWalkIteration((iteration) => iteration + 1);
                  }}
                  onClick={() => void beginSuspectInterview()}
                  aria-label={`Talk to ${currentSuspect.name}`}
                >
                  <span className={styles.roomSuspectWalker}>
                    {props.renderMysteryBotAvatar(mysteryBotForSuspect(currentSuspect), "mini", { demeanor: "suspect", blinkEnabled: true, facing: currentSuspectFacing })}
                  </span>
                </button>
              ) : null}
              {currentSuspect && suspectRoomFocus === "interview" ? (
                <div className={styles.interviewStage}>
                  <div className={styles.suspectPresence} data-mystery-interview-interactive style={{ "--suspect-color": currentSuspect.color ?? "#9c7cff" } as CSSProperties}>
                    <span className={styles.suspectAvatar} data-tutorial-target="whodunnit-hd-interview">{props.renderMysteryBotAvatar(mysteryBotForSuspect(currentSuspect), "full", { demeanor: "suspect", thinking: interviewGenerating, talking: interviewSpeechTiming !== null, speechTiming: interviewSpeechTiming, blinkEnabled: true })}</span>
                    <strong>{currentSuspect.name}</strong><small>Opening is free · each submitted question costs 1 action</small>
                  </div>
                  <section className={styles.interviewViewport} data-mystery-interview-interactive aria-label={`Interview with ${currentSuspect.name}`} onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      void finishActiveActivity();
                    }
                  }}>
                    <header><div><small>In the room</small><strong>{currentSuspect.name}</strong></div><button type="button" data-ui-sfx="none" disabled={busy} onClick={() => void finishActiveActivity()}>Return to room</button></header>
                    <div ref={interviewTranscriptRef} className={styles.interviewTranscript} aria-live="polite">
                      {interviewGenerating && streamingPlayerMessageId ? <p data-speaker="investigator" data-streaming="true"><strong>You · {playerSpeechTiming ? "voice" : "writing"}</strong><span>{streamedPlayerQuestion || "…"}</span></p> : null}
                      {currentInterview.length ? currentInterview.map((message) => message.id === streamingMessageId && !streamedReply ? null : <p key={message.id} data-speaker={message.role} data-streaming={message.id === streamingMessageId ? "true" : undefined}><strong>{message.role === "investigator" ? "You" : currentSuspect.name}{message.id === streamingMessageId && interviewSpeechTiming ? " · voice" : ""}</strong><span>{message.id === streamingMessageId ? mysteryPublicText(streamedReply, state) : mysteryPublicText(message.content, state)}</span></p>) : <p className={styles.interviewPrompt}>Ask about the timeline, their relationship with the victim, or confront them with discovered evidence using @.</p>}
                      {interviewGenerating ? <p className={styles.interviewTurnState} role="status">{currentSuspect.name} is thinking…</p> : null}
                    </div>
                    <div className={styles.leadGrid}>{suggestedLeads.map((lead) => <button type="button" key={lead} disabled={busy} onClick={() => { setQuestion(lead); setQuestionCaret(lead.length); }}>{lead}</button>)}</div>
                    <div className={styles.questionComposer} data-tutorial-target="whodunnit-evidence-mention"><textarea value={question} maxLength={2_000} onChange={(event) => { setQuestion(event.currentTarget.value); setQuestionCaret(event.currentTarget.selectionStart ?? event.currentTarget.value.length); }} onSelect={(event) => setQuestionCaret(event.currentTarget.selectionStart ?? 0)} placeholder="Ask freely — type @ to mention evidence, testimony, suspects, or the victim…" />{evidenceMentionPicks.length ? <div className={styles.evidenceMentionMenu} role="listbox" aria-label="Case mentions"><small>Reference the public record</small>{evidenceMentionPicks.map((pick) => <button type="button" key={`${pick.kind}:${pick.id}`} data-kind={pick.kind} style={{ "--mention-color": pick.color ?? undefined } as CSSProperties} onClick={() => { const action = commitMysteryMentionAtCaret(question, questionCaret, pick); if (action) { setQuestion(action.replacement); setQuestionCaret(action.caret); } }}>{pick.glyph} {pick.title}</button>)}</div> : null}<button type="button" disabled={busy || state.actionsRemaining === 0 || !question.trim()} onClick={() => { const asked = question.trim(); const evidenceId = parseMysteryInterviewEvidenceMention(asked, state.discoveredEvidence); if (/\[\[exhibit:/u.test(asked) && !evidenceId) { setError("Choose a discovered evidence item from the @ menu."); return; } const messageId = mysteryId("player-interview"); setQuestion(""); streamPlayerQuestion(mysteryPublicText(asked, state), messageId); setInterviewGenerating(true); void perform({ action: "interview", suspectSeatId: currentSuspect.seatId, question: asked, evidenceId }).finally(() => setInterviewGenerating(false)); }}>Ask · 1 action</button></div>
                  </section>
                </div>
              ) : null}
              {suspectRoomFocus !== "interview" ? <div className={styles.stageLowerChrome} aria-live="polite">
              {stageNarration ? <div className={styles.stagePartnerProse}><small>{stageNarration.label}</small><MysteryPublicMarkdown source={stageNarration.text} suspects={state.suspects} /></div> : null}
              {suspectRoomFocus === "observe" ? <div className={styles.roomModeControls} data-mystery-interview-interactive>
                {currentSuspect ? <button type="button" disabled={busy} onClick={() => void beginSuspectInterview()}>Talk to {currentSuspect.name} · free</button> : null}
                <button type="button" disabled={busy || currentRoom.searched} onClick={() => void beginRoomInvestigation()}>{currentRoom.searched ? "✓ Visible areas inspected" : "Investigate room · free"}</button>
              </div> : null}
              <p className={styles.stageActionLine} role="status">{actionFeedback ?? (suspectRoomFocus === "search" ? currentRoom.searched ? `All visible areas inspected${discoveredRoomAccessTargets.length ? ` · ${discoveredRoomAccessTargets.length} unresolved ${discoveredRoomAccessTargets.length === 1 ? "lock" : "locks"}` : ""}.` : "Move the lens around the room; each inspection costs 1 action and never predicts what it will reveal." : currentSuspect ? "Choose whether to question the suspect or investigate the room." : currentRoom.searched ? "All visible areas in this room have been inspected." : "Open investigation view when you are ready to search this room; opening it is free.")}</p>
              </div> : null}
            </div>
            {evidenceExhibitId ? (() => { const exhibit = state.discoveredEvidence.find((item) => item.id === evidenceExhibitId); return exhibit ? <section className={styles.evidenceExhibit} role="dialog" aria-label={`Evidence acquired: ${mysteryEvidenceTitle(exhibit.title)}`}><button type="button" aria-label="Close evidence preview" onClick={() => setEvidenceExhibitId(null)}>×</button><MysteryEvidenceVisual item={exhibit} /><div><small>Evidence acquired</small><h3>{mysteryEvidenceTitle(exhibit.title)}</h3><p>{mysteryEvidenceObservation(exhibit.observation)}</p><button type="button" onClick={() => placeOnDesk({ kind: "evidence", id: exhibit.id, label: mysteryEvidenceTitle(exhibit.title) })}>Place on desk</button></div></section> : null; })() : null}
          </section>

          <aside className={styles.caseRail} aria-label="Case file" hidden={!caseFileOpen}>
            <header className={styles.caseFileHeader}>
              <div><p className={styles.eyebrow}>Case file</p><strong>Public record & tools</strong></div>
              <button type="button" aria-label="Close case file" onClick={() => setCaseFileOpen(false)}>×</button>
            </header>
            <nav className={styles.caseFileTabs} aria-label="Case file sections">
              <button type="button" aria-pressed={caseFileTab === "partner"} onClick={() => setCaseFileTab("partner")}>Counsel</button>
              <button type="button" aria-pressed={caseFileTab === "leads"} onClick={() => setCaseFileTab("leads")} data-tutorial-target="whodunnit-leads">Leads <span>{state.leads.length}</span></button>
              <button type="button" aria-pressed={caseFileTab === "access"} onClick={() => setCaseFileTab("access")}>Access <span>{state.inventoryItems.length}</span></button>
              <button type="button" aria-pressed={caseFileTab === "evidence"} onClick={() => setCaseFileTab("evidence")}>Evidence <span>{state.discoveredEvidence.length}</span></button>
              <button type="button" aria-pressed={caseFileTab === "testimony"} onClick={() => setCaseFileTab("testimony")}>Testimony <span>{state.testimony.length}</span></button>
            </nav>
            {state.actionsRemaining === 0 ? <div className={styles.actionsExhausted}>{state.activeActivity ? "This final paid session remains open. Finish it when ready; leaving will close the mansion and open the Theory Board." : "Investigation actions are exhausted. The mansion is closed; use the Theory Board and consult your partner freely before filing."}</div> : null}
            {state.continuanceUsed && state.playPhase === "continuance" ? <div className={styles.continuance}>PRISM granted the only continuance. You have {state.actionsRemaining} emergency actions before refiling.</div> : null}
            {caseFileTab === "partner" ? renderPartnerConsultation("case-file") : null}
            {caseFileTab === "leads" ? <section className={styles.leadJournal} data-tutorial-target="whodunnit-lead-journal">
              <header><strong>Active leads</strong><span>{state.leads.length}</span></header>
              {state.leads.map((lead) => {
                const annotations = notebook?.leadAnnotations.filter((annotation) => annotation.leadId === lead.id) ?? [];
                return <article key={lead.id} data-status={lead.status}>
                  <div><small>{lead.status.replaceAll("_", " ")} · rev {lead.revision}</small><strong>{lead.title}</strong></div>
                  <p>{lead.summary}</p>
                  <button type="button" onClick={() => placeOnDesk({ kind: "lead", id: lead.id, label: lead.title })}>Place on desk</button>
                  {annotations.map((annotation) => <div className={styles.leadAnnotation} key={annotation.id}>
                    <textarea aria-label={`Comment on ${lead.title}`} value={annotation.text} onChange={(event) => editLeadAnnotation(annotation.id, event.currentTarget.value)} onBlur={() => playMysterySfx("pencil")} />
                    <button type="button" aria-label={`Remove comment from ${lead.title}`} onClick={() => removeLeadAnnotation(annotation.id)}>×</button>
                  </div>)}
                  <div className={styles.leadAnnotationDraft}>
                    <textarea value={leadNoteDrafts[lead.id] ?? ""} onChange={(event) => setLeadNoteDrafts((current) => ({ ...current, [lead.id]: event.currentTarget.value }))} placeholder="Comment on this lead…" />
                    <button type="button" disabled={!leadNoteDrafts[lead.id]?.trim()} onClick={() => addLeadAnnotation(lead.id)}>Save comment</button>
                  </div>
                </article>;
              })}
            </section> : null}
            {caseFileTab === "access" ? <section className={styles.accessInventory} data-tutorial-target="whodunnit-access-inventory">
              <header><strong>Case inventory</strong><span>{state.inventoryItems.length}</span></header>
              {armedAccessItemId ? <p className={styles.accessArmed}>Using <strong>{state.inventoryItems.find((item) => item.id === armedAccessItemId)?.title}</strong>. Select a locked room, locked item, or discovered padlock. <button type="button" onClick={() => setArmedAccessItemId(null)}>Cancel</button></p> : null}
              {state.inventoryItems.length ? state.inventoryItems.map((item) => (
                <article
                  key={item.id}
                  draggable={item.usable && !busy}
                  data-armed={armedAccessItemId === item.id ? "true" : undefined}
                  data-locked={item.locked ? "true" : undefined}
                  data-access-ready={armedAccessItemId && item.locked ? "true" : undefined}
                  onDragStart={(event) => {
                    beginAccessItemDrag(event, item.id, item.title);
                  }}
                  onDragOver={item.locked ? (event) => event.preventDefault() : undefined}
                  onDrop={item.locked ? (event) => dropAccessItem(event, "item", item.id) : undefined}
                >
                  <MysteryInventoryVisual item={item} />
                  <div><strong>{item.title}</strong><p>{item.description}</p><div className={styles.accessActions}>{item.usable ? <button type="button" disabled={busy} onClick={() => toggleAccessItem(item.id, item.title)}>{armedAccessItemId === item.id ? "Cancel use" : "Use"}</button> : null}{item.locked && armedAccessItemId ? <button type="button" disabled={busy || state.actionsRemaining === 0} onClick={() => void applyAccessItem(armedAccessItemId, "item", item.id)}>Try selected item · 1 action</button> : null}</div></div>
                </article>
              )) : <p>No access items recovered.</p>}
              <small>During a room search, the Case Kit keeps usable tools close and discovered padlocks mark valid targets. Selecting a tool is free; applying it to a target costs 1 action.</small>
            </section> : null}
            {caseFileTab === "evidence" ? <section className={styles.inventory}><header><strong>Evidence</strong><span>{state.discoveredEvidence.length}</span></header>{state.discoveredEvidence.length ? state.discoveredEvidence.map((item) => { const finding = state.forensicFindings.find((entry) => entry.evidenceId === item.id); const title = mysteryEvidenceTitle(item.title); const observation = mysteryEvidenceObservation(item.observation); return <article key={item.id}><MysteryEvidenceVisual item={item} /><div><strong>{title}</strong><p>{observation}</p>{finding ? <p className={styles.forensicFinding}>{finding.summary}</p> : item.isPhysical ? <button type="button" disabled={busy || state.actionsRemaining < 3} onClick={() => void perform({ action: "forensic", evidenceId: item.id })}>Forensics · 3 actions</button> : null}<button type="button" onClick={() => placeOnDesk({ kind: "evidence", id: item.id, label: title })}>Place on desk</button></div></article>; }) : <p>No physical evidence acquired.</p>}</section> : null}
            {caseFileTab === "testimony" ? <section className={styles.testimonyList}><header><strong>Testimony</strong><span>{state.testimony.length}</span></header>{state.testimony.length ? state.testimony.map((item) => { const speaker = mysteryTestimonySpeaker(state, item.speakerSeatId); return <article key={item.id}><strong style={{ "--suspect-color": speaker?.color ?? "#a98cff" } as CSSProperties}>{speaker?.name ?? "Witness"}</strong><blockquote>{item.exactQuote}</blockquote><button type="button" onClick={() => placeOnDesk({ kind: "testimony", id: item.id, label: `Testimony · ${speaker?.name ?? "Witness"}` })}>Place on desk</button></article>; }) : <p>No testimony committed.</p>}</section> : null}
            <button type="button" className={styles.openTheoryButton} onClick={() => void openTheoryBoard()}>Open Theory Board{state.actionsRemaining === 0 ? " · filing required" : ""}</button>
          </aside>
          {renderInvestigatorDesk("investigation")}
        </div>
      )}
    </main>
  );
}
