"use client";

import {
  DEBATE_FLYTING_LINE_MAX_LENGTH,
  DEBATE_FLYTING_AUDIENCE_COUNT,
  DEBATE_FLYTING_JARL_GUARD_COUNT,
  DEBATE_FORMAT_CATALOG,
  DEBATE_FORMALITY_SPECTRUM,
  DEBATE_FORMAT_VISUAL_THEMES,
  DEBATE_SCHEMA_VERSION,
  debateSpokenText,
  hexToHsl,
  normalizeAccentForTheme,
  normalizeBotIdentityColor,
  normalizeDebateFlytingFormatStateV1,
  DEBATE_SETUP_PRESETS,
  type DebateAdvocacyConsent,
  type DebateBotSnapshotV1,
  type DebateEventV1,
  type DebateFormatId,
  type DebateFlytingAuthoredModeV1,
  type DebateFlytingBoutV1,
  type DebateFlytingChargeKindV1,
  type DebateFlytingFormatStateV1,
  type DebateFlytingHallLeaningV1,
  type DebateFlytingManeuverV1,
  type DebateSessionV1,
  type DebateSideId,
  type ProviderReasoningEffort,
  type ResponseMode,
} from "@localai/shared";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./DebateFlyting.module.css";
import studioStyles from "./DebateExperience.module.css";
import {
  BotPickerGrid,
  BotPickerTile,
  BotPickerToolbar,
  filterBotPickerItems,
  sortBotPickerItems,
  type BotPickerGroup,
  type BotPickerPlacementRefractTarget,
} from "./BotPicker";
import { randomBotPickerPlacements } from "./botPickerPlacement";
import {
  debateCastHueFromLensSliderInput,
  debateCastLensSliderInputValue,
} from "./debateCastHueLens";
import {
  debateFlytingRitualCueForEvent,
  playDebateFlytingRitualCue,
} from "./debateFlytingAudio";
import { flytingAutoCameraView } from "./debateFlytingCamera";
import {
  DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT,
  DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS,
  copyDebateFlytingStageAlignment,
  debateFlytingStageRehearsalItems,
  debateFlytingStageRehearsalViewForItem,
  formatDebateFlytingStageAlignmentClipboard,
  updateDebateFlytingStagePlacement,
  type DebateFlytingStageAlignmentItem,
  type DebateFlytingStageAlignmentV1,
  type DebateFlytingStageAlignmentView,
  type DebateFlytingStagePlacementV1,
  type DebateFlytingStageRehearsalView,
} from "./debateFlytingStageAlignment";
import {
  FLYTING_RGB_KEY_ASSETS,
  remapFlytingRgbKeyPixels,
  type FlytingRgbKeyAsset,
  type FlytingRgbKeyScene,
} from "./debateFlytingRgbKey";
import {
  DEBATE_FLYTING_GALLERY_AUTHORING_MAX_VERTICAL_ROAM_PERCENT,
  DEBATE_FLYTING_GALLERY_DEFAULT_MAX_VERTICAL_ROAM_PERCENT,
  debateAudienceConversationFacing,
  debateFlytingAudienceMillingPlan,
  debateAudienceSeatLayout,
  debateFlytingHallNpcBots,
} from "./debateAudience";
import { prismDeveloperAuthoringEnabled } from "./prismDevGating";
import { SessionAtmosphereLayer } from "./SessionAtmosphereLayer";
import {
  DEBATE_AUDIENCE_CROSSTALK_URL,
  DEBATE_AUDIENCE_MURMUR_URL,
} from "./debateFoley";
import { debateFlytingHallPresentation } from "./debateFlytingHallPresentation";
import type { DebateBotAvatarState } from "./DebateExperience";
import type { VoicePlaybackCharacterAlignment } from "./voiceEffects";

export interface FlytingBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  avatarDetails?: DebateBotSnapshotV1["avatarDetails"];
  voiceProfile?: DebateBotSnapshotV1["voiceProfile"];
  replayVisualSnapshot?: DebateBotSnapshotV1["replayVisualSnapshot"];
  powers?: DebateBotSnapshotV1["powers"];
  systemPrompt?: string;
  hardMuted: boolean;
}

interface FlytingRuntimeProps {
  bots: FlytingBotSummary[];
  botGroups?: readonly BotPickerGroup[];
  theme: "light" | "dark";
  preferredProvider: "local" | "ollama_cloud" | "openai" | "anthropic";
  responseMode: ResponseMode;
  reasoningEffort?: ProviderReasoningEffort;
  turbo?: boolean;
  modelOverride?: {
    provider: "local" | "ollama_cloud" | "openai" | "anthropic";
    model: string;
  } | null;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
  renderBotGlyph: (
    glyph: string | null,
    options: { size: number; strokeWidth: number },
  ) => ReactNode;
  renderBotAvatar?: (
    bot: DebateBotSnapshotV1,
    state: DebateBotAvatarState,
  ) => ReactNode;
  onBotContextMenu?: (botId: string, x: number, y: number) => void;
  onBotContextLongPressStart?: (
    event: ReactPointerEvent<HTMLElement>,
    botId: string,
  ) => void;
  onBotContextLongPressMove?: (event: ReactPointerEvent<HTMLElement>) => void;
  onBotContextLongPressEnd?: (event: ReactPointerEvent<HTMLElement>) => void;
}

export interface DebateFlytingSetupProps extends FlytingRuntimeProps {
  archiveCount: number;
  onBackToFormats: () => void;
  onFormatChange: (format: DebateFormatId) => void;
  onExit: () => void;
  onOpenArchive: () => void;
  onResetTutorial?: () => void;
  onStart: (session: DebateSessionV1) => void;
  onSaved: (session: DebateSessionV1) => void;
}

export interface DebateFlytingLiveProps extends FlytingRuntimeProps {
  session: DebateSessionV1;
  audioEnabled: boolean;
  audioVolume: number;
  playEvent: (
    event: DebateEventV1,
    session: DebateSessionV1,
    lifecycle?: FlytingVoiceLifecycle,
  ) => Promise<void>;
  onSessionChange: (session: DebateSessionV1) => void;
}

interface FlytingVoiceLifecycle {
  onStart?: (
    durationMs: number | null,
    alignment?: VoicePlaybackCharacterAlignment | null,
  ) => void;
  onProgress?: (elapsedMs: number, durationMs: number) => void;
  onEnd?: () => void;
  onCancel?: () => void;
}

type FlytingSetupStep = "summon" | "cast" | "forge" | "review";
type FlytingPlayerRole = "participant" | "judge" | "spectator";
type FlytingCastSeat = "for" | "against" | "host";
type FlytingCameraView = "wide" | "left" | "moderator" | "right";
type FlytingCameraMode = "auto" | FlytingCameraView;
type FlytingStageRole = "for" | "moderator" | "against";

const DEBATE_FLYTING_STAGE_LAYOUT_AUTHORING_ENABLED =
  prismDeveloperAuthoringEnabled({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_PRISM_BRANCH: process.env.NEXT_PUBLIC_PRISM_BRANCH,
  });

const FLYTING_ALIGNMENT_BY_ROLE = {
  wide: {
    for: {
      bot: "wideForBot",
      helmet: "wideForHelmet",
      nameplate: "wideForNameplate",
      heraldry: "wideForHeraldry",
    },
    moderator: {
      bot: "wideModeratorBot",
      helmet: "wideModeratorHelmet",
      nameplate: "wideModeratorNameplate",
      heraldry: "wideModeratorHeraldry",
    },
    against: {
      bot: "wideAgainstBot",
      helmet: "wideAgainstHelmet",
      nameplate: "wideAgainstNameplate",
      heraldry: "wideAgainstHeraldry",
    },
  },
  moderator: {
    for: { heraldry: "moderatorForHeraldry" },
    moderator: {
      bot: "moderatorModeratorBot",
      helmet: "moderatorModeratorHelmet",
      nameplate: "moderatorModeratorNameplate",
      heraldry: "moderatorModeratorHeraldry",
    },
    against: { heraldry: "moderatorAgainstHeraldry" },
  },
  gallery: {
    for: { rugGlyph: "galleryForRugGlyph" },
    moderator: {},
    against: { rugGlyph: "galleryAgainstRugGlyph" },
  },
} as const satisfies Record<
  DebateFlytingStageAlignmentView,
  Partial<
    Record<
      FlytingStageRole,
      Partial<
        Record<
          "bot" | "helmet" | "nameplate" | "heraldry" | "rugGlyph",
          DebateFlytingStageAlignmentItem
        >
      >
    >
  >
>;

function flytingStageAlignmentItemFor(
  view: DebateFlytingStageAlignmentView,
  role: FlytingStageRole,
  kind: "bot" | "helmet" | "nameplate" | "heraldry" | "rugGlyph",
): DebateFlytingStageAlignmentItem | null {
  const roleMap = FLYTING_ALIGNMENT_BY_ROLE[view][role] as
    | Partial<
        Record<
          "bot" | "helmet" | "nameplate" | "heraldry" | "rugGlyph",
          DebateFlytingStageAlignmentItem
        >
      >
    | undefined;
  return roleMap?.[kind] ?? null;
}

const FLYTING_CAMERA_VIEWS: ReadonlyArray<{
  id: FlytingCameraMode;
  label: string;
}> = [
  { id: "auto", label: "Auto" },
  { id: "left", label: "Left" },
  { id: "moderator", label: "Jarl" },
  { id: "right", label: "Right" },
  { id: "wide", label: "Wide" },
];

const FLYTING_SETUP_STEPS: ReadonlyArray<{
  id: FlytingSetupStep;
  label: string;
  detail: string;
}> = [
  { id: "summon", label: "Summon", detail: "Choose your place in the Hall" },
  {
    id: "cast",
    label: "Cast",
    detail: "Seat the Pro, Jarl, and Con",
  },
  { id: "forge", label: "Forge", detail: "Shape the legends and stakes" },
  { id: "review", label: "Review", detail: "Consent, privacy, and Start" },
];

const CHALLENGE_LENSES: ReadonlyArray<{
  id: DebateFlytingChargeKindV1;
  label: string;
  detail: string;
}> = [
  { id: "doubt", label: "Doubt", detail: "Question its truth or scale" },
  {
    id: "expose",
    label: "Expose",
    detail: "Reveal contradiction or hypocrisy",
  },
  { id: "belittle", label: "Belittle", detail: "Make the strength look small" },
  { id: "outdo", label: "Outdo", detail: "Answer with a greater boast" },
];

const REJOINDER_MANEUVERS: ReadonlyArray<{
  id: DebateFlytingManeuverV1;
  label: string;
  detail: string;
}> = [
  { id: "stand", label: "Stand", detail: "Defend the claim directly" },
  { id: "own", label: "Own", detail: "Accept it and make it strength" },
  { id: "turn", label: "Turn", detail: "Reverse the charge" },
  { id: "return", label: "Return", detail: "Answer and strike another claim" },
];

function jsonBody(value: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

let flytingMutationSerial = 0;
function flytingMutationKey(label: string): string {
  flytingMutationSerial += 1;
  return `flyting:${label}:${Date.now().toString(36)}:${flytingMutationSerial.toString(36)}`;
}

function flytingMotion(bout: DebateFlytingBoutV1) {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: bout.id,
    title: bout.title,
    motion: bout.stakes,
    forSide: {
      label: bout.flyters[0].epithet,
      brief: bout.flyters[0].legend.map((facet) => facet.claim).join(" "),
    },
    againstSide: {
      label: bout.flyters[1].epithet,
      brief: bout.flyters[1].legend.map((facet) => facet.claim).join(" "),
    },
  };
}

function botColor(
  bot: { color: string | null } | undefined,
  fallback: string,
): string {
  return (
    normalizeBotIdentityColor(bot?.color) ??
    normalizeBotIdentityColor(fallback) ??
    fallback
  );
}

function flytingStageColor(
  bot: { color: string | null } | undefined,
  fallback: string,
  theme: "light" | "dark",
): string {
  return normalizeAccentForTheme(botColor(bot, fallback), theme);
}

interface FlytingRgbKeySourcePixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const flytingRgbKeySourceCache = new Map<
  string,
  Promise<FlytingRgbKeySourcePixels>
>();

function loadFlytingRgbKeySource(
  asset: Pick<FlytingRgbKeyAsset, "src" | "width" | "height">,
): Promise<FlytingRgbKeySourcePixels> {
  const cached = flytingRgbKeySourceCache.get(asset.src);
  if (cached) return cached;

  const pending = new Promise<FlytingRgbKeySourcePixels>((resolve, reject) => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      try {
        if (
          image.naturalWidth !== asset.width ||
          image.naturalHeight !== asset.height
        ) {
          throw new Error(
            `Flyting RGB-key source dimensions drifted: ${asset.src}`,
          );
        }
        const scratch = document.createElement("canvas");
        scratch.width = asset.width;
        scratch.height = asset.height;
        const context = scratch.getContext("2d", {
          willReadFrequently: true,
        });
        if (!context) {
          throw new Error("Flyting RGB-key canvas is unavailable");
        }
        context.drawImage(image, 0, 0);
        resolve({
          data: new Uint8ClampedArray(
            context.getImageData(0, 0, asset.width, asset.height).data,
          ),
          width: asset.width,
          height: asset.height,
        });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      reject(new Error(`Flyting RGB-key source failed to load: ${asset.src}`));
    };
    image.src = asset.src;
  });
  flytingRgbKeySourceCache.set(asset.src, pending);
  void pending.catch(() => {
    if (flytingRgbKeySourceCache.get(asset.src) === pending) {
      flytingRgbKeySourceCache.delete(asset.src);
    }
  });
  return pending;
}

function FlytingRgbKeyedBackdrop(props: {
  conColor: string;
  jarlColor: string;
  proColor: string;
  scene: FlytingRgbKeyScene;
  theme: "light" | "dark";
}): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const asset = FLYTING_RGB_KEY_ASSETS[props.scene][props.theme];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    canvas.dataset.flytingRgbKeyReady = "false";
    canvas.dataset.flytingRgbKeyState = "loading";
    const context = canvas.getContext("2d");
    context?.clearRect(0, 0, canvas.width, canvas.height);

    void loadFlytingRgbKeySource(asset)
      .then((source) => {
        if (cancelled) return;
        const currentContext = canvas.getContext("2d");
        if (!currentContext) return;
        const output = currentContext.createImageData(
          source.width,
          source.height,
        );
        output.data.set(
          remapFlytingRgbKeyPixels(source.data, source.width, source.height, {
            pro: props.proColor,
            jarl: props.jarlColor,
            con: props.conColor,
          }),
        );
        currentContext.putImageData(output, 0, 0);
        canvas.dataset.flytingRgbKeyReady = "true";
        canvas.dataset.flytingRgbKeyState = "ready";
      })
      .catch(() => {
        if (!cancelled) canvas.dataset.flytingRgbKeyState = "error";
      });

    return () => {
      cancelled = true;
    };
  }, [asset, props.conColor, props.jarlColor, props.proColor]);

  return (
    <canvas
      ref={canvasRef}
      className={styles.flytingRgbKeyedBackdrop}
      data-flyting-rgb-key-scene={props.scene}
      data-flyting-rgb-key-source={asset.src}
      style={
        {
          "--flyting-rgb-key-source": `url("${asset.src}")`,
        } as CSSProperties
      }
      width={asset.width}
      height={asset.height}
      aria-hidden="true"
    />
  );
}

function flytingAlignmentStyle(
  placement: DebateFlytingStagePlacementV1,
): CSSProperties {
  return {
    "--flyting-align-x": `${placement.x}%`,
    "--flyting-align-y": `${placement.y}%`,
    "--flyting-align-scale": placement.scale / 100,
    "--flyting-align-rotation": `${placement.rotation}deg`,
    "--flyting-align-skew-x": `${placement.skewX}deg`,
  } as CSSProperties;
}

async function writeFlytingAlignmentClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Local HTTP authoring can still use the explicit copy fallback.
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

function flytingCastBotHue(bot: { color: string | null }): number | null {
  const normalized = normalizeBotIdentityColor(bot.color);
  if (!normalized) return null;
  const { h, s } = hexToHsl(normalized);
  return s < 8 ? null : h;
}

function circularHueDistance(left: number, right: number): number {
  const delta = Math.abs(left - right) % 360;
  return Math.min(delta, 360 - delta);
}

function FlytingBotMark(props: {
  bot: FlytingBotSummary | undefined;
  fallback: string;
  renderBotGlyph: DebateFlytingSetupProps["renderBotGlyph"];
  size?: number;
}): React.JSX.Element {
  const color = botColor(props.bot, props.fallback);
  return (
    <span
      className={styles.botMark}
      style={{ "--flyting-bot-color": color } as CSSProperties}
      aria-hidden="true"
    >
      {props.bot
        ? props.renderBotGlyph(props.bot.glyph, {
            size: props.size ?? 38,
            strokeWidth: 1.25,
          })
        : "◇"}
    </span>
  );
}

function FlytingStudioSeat(props: {
  bot: FlytingBotSummary | undefined;
  fallback: string;
  label: string;
  name: string;
  renderBotGlyph: DebateFlytingSetupProps["renderBotGlyph"];
  symbol?: string;
}): React.JSX.Element {
  const color = botColor(props.bot, props.fallback);
  return (
    <div
      className={styles.studioCircuitSeat}
      style={{ "--flyting-bot-color": color } as CSSProperties}
    >
      <span aria-hidden="true">
        {props.symbol ??
          (props.bot
            ? props.renderBotGlyph(props.bot.glyph, {
                size: 25,
                strokeWidth: 1.2,
              })
            : "◇")}
      </span>
      <small>{props.label}</small>
      <strong>{props.name}</strong>
    </div>
  );
}

function flytingAlignmentPreviewSnapshot(
  bot: FlytingBotSummary,
  role: DebateBotSnapshotV1["role"],
  sideId: DebateSideId | null,
): DebateBotSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: bot.id,
    name: bot.name,
    systemPrompt: bot.systemPrompt ?? "",
    role,
    sideId,
    color: bot.color,
    glyph: bot.glyph,
    avatarDetails: bot.avatarDetails ?? null,
    voiceProfile: bot.voiceProfile ?? null,
    ...(bot.replayVisualSnapshot
      ? { replayVisualSnapshot: bot.replayVisualSnapshot }
      : {}),
    powers: bot.powers ?? [],
    provider: "local",
    model: "flyting-alignment-preview",
    revision: `flyting-alignment-preview:${bot.id}`,
  };
}

function flytingPreviewGalleryVoteCounts(
  votes: Record<DebateSideId, number>,
): { for: number; neutral: number; against: number } {
  const forVotes = Math.max(
    0,
    Math.min(DEBATE_FLYTING_AUDIENCE_COUNT, votes.for),
  );
  const againstVotes = Math.max(
    0,
    Math.min(DEBATE_FLYTING_AUDIENCE_COUNT - forVotes, votes.against),
  );
  return {
    for: forVotes,
    neutral: DEBATE_FLYTING_AUDIENCE_COUNT - forVotes - againstVotes,
    against: againstVotes,
  };
}

function flytingPreviewGalleryVerticalMotion(
  offsetYPercent: number,
  driftYPercent: number,
  maximumPercent: number,
): { offsetYPercent: number; driftYPercent: number } {
  const maximum = Math.max(
    0,
    Math.min(
      DEBATE_FLYTING_GALLERY_AUTHORING_MAX_VERTICAL_ROAM_PERCENT,
      maximumPercent,
    ),
  );
  const scale =
    maximum / DEBATE_FLYTING_GALLERY_DEFAULT_MAX_VERTICAL_ROAM_PERCENT;
  return {
    offsetYPercent: Math.round(offsetYPercent * scale * 10) / 10,
    driftYPercent: Math.round(driftYPercent * scale * 10) / 10,
  };
}

function FlytingSetupStageAlignmentPreview(props: {
  againstBot: FlytingBotSummary | undefined;
  alignment: DebateFlytingStageAlignmentV1;
  forBot: FlytingBotSummary | undefined;
  galleryBotScale: number;
  galleryMaxVerticalRoam: number;
  galleryVotes: Record<DebateSideId, number>;
  hostBot: FlytingBotSummary | undefined;
  item: DebateFlytingStageAlignmentItem;
  onClose: () => void;
  onSelectItem: (item: DebateFlytingStageAlignmentItem) => void;
  onToggleTheme: () => void;
  onUpdatePlacement: (
    item: DebateFlytingStageAlignmentItem,
    update: Partial<DebateFlytingStagePlacementV1>,
  ) => void;
  renderBotAvatar?: FlytingRuntimeProps["renderBotAvatar"];
  renderBotGlyph: FlytingRuntimeProps["renderBotGlyph"];
  theme: FlytingRuntimeProps["theme"];
  view: DebateFlytingStageRehearsalView;
}): React.JSX.Element {
  const forBot = props.forBot ?? {
    id: "flyting-alignment-preview-for",
    name: "Pro flyter",
    color: "#d8b25d",
    glyph: "triangle",
    hardMuted: true,
  };
  const hostBot = props.hostBot ?? {
    id: "flyting-alignment-preview-host",
    name: "PRISM",
    color: "#9f8a68",
    glyph: "triangle",
    hardMuted: true,
  };
  const againstBot = props.againstBot ?? {
    id: "flyting-alignment-preview-against",
    name: "Con flyter",
    color: "#c56b53",
    glyph: "triangle",
    hardMuted: true,
  };
  const forColor = flytingStageColor(forBot, "#d8b25d", props.theme);
  const hostColor = flytingStageColor(hostBot, "#9f8a68", props.theme);
  const againstColor = flytingStageColor(againstBot, "#c56b53", props.theme);
  const cameraView: FlytingCameraView =
    props.view === "moderator" ? "moderator" : "wide";
  const previewBots = [
    {
      role: "for" as const,
      roleLabel: "Pro",
      snapshot: flytingAlignmentPreviewSnapshot(forBot, "advocate", "for"),
      color: forColor,
    },
    {
      role: "moderator" as const,
      roleLabel: "Jarl",
      snapshot: flytingAlignmentPreviewSnapshot(hostBot, "moderator", null),
      color: hostColor,
    },
    {
      role: "against" as const,
      roleLabel: "Con",
      snapshot: flytingAlignmentPreviewSnapshot(
        againstBot,
        "advocate",
        "against",
      ),
      color: againstColor,
    },
  ];
  const previewHallBots = useMemo(
    () =>
      debateFlytingHallNpcBots(
        "flyting-stage-authoring-preview",
        DEBATE_FLYTING_AUDIENCE_COUNT + DEBATE_FLYTING_JARL_GUARD_COUNT,
      ),
    [],
  );
  const previewHallMilling = useMemo(
    () =>
      Array.from(
        {
          length:
            DEBATE_FLYTING_AUDIENCE_COUNT + DEBATE_FLYTING_JARL_GUARD_COUNT,
        },
        (_, index) =>
          debateFlytingAudienceMillingPlan(
            `flyting-stage-authoring-preview:hall-seat-${index}`,
            debateAudienceSeatLayout(
              index,
              DEBATE_FLYTING_AUDIENCE_COUNT + DEBATE_FLYTING_JARL_GUARD_COUNT,
            ).depthRow,
          ),
      ),
    [],
  );
  const previewVotes = flytingPreviewGalleryVoteCounts(props.galleryVotes);
  const previewHallSeats = previewHallBots.map((bot, index) => {
    const guard = index >= DEBATE_FLYTING_AUDIENCE_COUNT;
    const leaning: DebateFlytingHallLeaningV1 = guard
      ? "neutral"
      : index < previewVotes.for
        ? "for"
        : index >= DEBATE_FLYTING_AUDIENCE_COUNT - previewVotes.against
          ? "against"
          : "neutral";
    return {
      id: `flyting-stage-authoring-preview:${index}`,
      bot,
      index,
      leaning,
      guard,
    };
  });
  const alignmentDragRef = useRef<{
    item: DebateFlytingStageAlignmentItem;
    pointerId: number;
    clientX: number;
    clientY: number;
    parentWidth: number;
    parentHeight: number;
    placement: DebateFlytingStagePlacementV1;
  } | null>(null);
  const alignmentHandleProps = (
    item: DebateFlytingStageAlignmentItem,
  ): {
    "data-flyting-alignment-handle": "true";
    "data-flyting-alignment-item": DebateFlytingStageAlignmentItem;
    "data-flyting-alignment-selected"?: "true";
    onClick: (event: React.MouseEvent<HTMLElement>) => void;
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  } => ({
    "data-flyting-alignment-handle": "true",
    "data-flyting-alignment-item": item,
    "data-flyting-alignment-selected": props.item === item ? "true" : undefined,
    onClick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      props.onSelectItem(item);
    },
    onPointerDown: (event) => {
      if (event.button !== 0) return;
      const parent = event.currentTarget.offsetParent;
      if (!(parent instanceof HTMLElement)) return;
      const bounds = parent.getBoundingClientRect();
      event.preventDefault();
      event.stopPropagation();
      props.onSelectItem(item);
      alignmentDragRef.current = {
        item,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        parentWidth: Math.max(1, bounds.width),
        parentHeight: Math.max(1, bounds.height),
        placement: props.alignment.placements[item],
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event) => {
      const drag = alignmentDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      props.onUpdatePlacement(drag.item, {
        x:
          drag.placement.x +
          ((event.clientX - drag.clientX) / drag.parentWidth) * 100,
        y:
          drag.placement.y +
          ((event.clientY - drag.clientY) / drag.parentHeight) * 100,
      });
    },
    onPointerUp: (event) => {
      const drag = alignmentDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      alignmentDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    onPointerCancel: (event) => {
      if (alignmentDragRef.current?.pointerId !== event.pointerId) return;
      alignmentDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
  });
  const renderPreviewAvatar = (
    bot: DebateBotSnapshotV1,
    role: DebateBotAvatarState["role"],
    presentation: "full" | "mini",
    facing?: DebateBotAvatarState["facing"],
  ): ReactNode =>
    props.renderBotAvatar?.(bot, {
      role,
      lookAtRole:
        role === "for" ? "against" : role === "against" ? "for" : null,
      consumer: role === "audience" ? "gallery" : "forum",
      presentation,
      talking: false,
      thinking: false,
      voiceLevel: 1,
      colorCycle: false,
      speechTiming: null,
      foleyMouthShape: null,
      listenerReaction: null,
      blinkEnabled: false,
      facing,
      speechInkVisible: false,
    }) ??
    props.renderBotGlyph(bot.glyph, {
      size: presentation === "full" ? 84 : 21,
      strokeWidth: 1.2,
    });

  const previewGallery = (
    <section
      className={`${studioStyles.debateAudienceRow} ${styles.flytingCourtGallery} ${styles.stageAlignmentPreviewGallery}`}
      data-debate-audience="true"
      data-audience-placement="below-screen"
      data-flyting-preview-gallery="true"
      aria-label={`${DEBATE_FLYTING_AUDIENCE_COUNT} generic PRISM spectators and ${DEBATE_FLYTING_JARL_GUARD_COUNT} Jarl guards`}
      style={
        {
          "--flyting-preview-gallery-bot-scale": props.galleryBotScale / 100,
        } as CSSProperties
      }
    >
      <FlytingRgbKeyedBackdrop
        scene="gallery"
        theme={props.theme}
        proColor={forColor}
        jarlColor={hostColor}
        conColor={againstColor}
      />
      <div className={styles.galleryRugGlyphs} aria-hidden="true">
        {(
          [
            ["for", forBot, forColor],
            ["against", againstBot, againstColor],
          ] as const
        ).map(([role, bot, color]) => {
          const item = flytingStageAlignmentItemFor(
            "gallery",
            role,
            "rugGlyph",
          )!;
          return (
            <span
              data-role={role}
              key={`preview-rug-glyph:${role}:${bot.id}`}
              style={
                {
                  "--flyting-bot-color": color,
                  "--flyting-rug-glyph-color": color,
                  ...flytingAlignmentStyle(props.alignment.placements[item]),
                } as CSSProperties
              }
              {...alignmentHandleProps(item)}
            >
              {props.renderBotGlyph(bot.glyph, {
                size: 58,
                strokeWidth: 1.45,
              })}
            </span>
          );
        })}
      </div>
      {(["rear", "front"] as const).map((depthRow) => (
        <span
          className={`${studioStyles.debateAudienceLayer} ${styles.flytingAudienceLayer}`}
          data-depth-row={depthRow}
          key={depthRow}
          aria-hidden="true"
        >
          {(["for", "neutral", "against"] as const).map((leaning) => {
            const clusterSeats = previewHallSeats.filter(
              (seat) =>
                seat.leaning === leaning &&
                debateAudienceSeatLayout(seat.index, previewHallSeats.length)
                  .depthRow === depthRow,
            );
            return (
              <span
                className={styles.flytingAudienceCluster}
                data-flyting-leaning={leaning}
                key={`${depthRow}:${leaning}`}
              >
                {clusterSeats.map((seat, clusterIndex) => {
                  const facing = debateAudienceConversationFacing(
                    clusterIndex,
                    clusterSeats.length,
                  );
                  const seatColor =
                    seat.leaning === "for"
                      ? forColor
                      : seat.leaning === "against"
                        ? againstColor
                        : hostColor;
                  const milling = previewHallMilling[seat.index]!;
                  const verticalMotion = flytingPreviewGalleryVerticalMotion(
                    milling.offsetYPercent,
                    milling.driftYPercent,
                    props.galleryMaxVerticalRoam,
                  );
                  return (
                    <span
                      className={styles.flytingAudienceMillingSlot}
                      key={seat.id}
                      style={
                        {
                          "--flyting-gallery-offset-x": `${milling.offsetXPercent}%`,
                          "--flyting-gallery-offset-y": `${verticalMotion.offsetYPercent}%`,
                          "--flyting-gallery-drift-x": `${milling.driftXPercent}%`,
                          "--flyting-gallery-drift-y": `${verticalMotion.driftYPercent}%`,
                          "--flyting-gallery-mill-duration": `${milling.durationMs}ms`,
                          "--flyting-gallery-mill-delay": `${milling.delayMs}ms`,
                          "--flyting-gallery-layer": milling.layer,
                        } as CSSProperties
                      }
                    >
                      <span
                        className={`${studioStyles.debateAudienceBotPortrait} ${styles.flytingAudiencePortrait}`}
                        data-conversation-facing={facing}
                        data-gallery-arrived="true"
                        data-flyting-leaning={seat.leaning}
                        data-flyting-guard={seat.guard ? "true" : undefined}
                        style={
                          {
                            "--flyting-bot-color": seatColor,
                            "--debate-audience-depth": milling.depthScale,
                            "--debate-audience-index": seat.index,
                            "--debate-gallery-enter-x": "0%",
                            "--debate-gallery-exit-x": "0%",
                          } as CSSProperties
                        }
                      >
                        <span
                          className={styles.galleryVikingHelmet}
                          data-flyting-hall-asset="mini-pixel-crown"
                          aria-hidden="true"
                        />
                        {renderPreviewAvatar(
                          seat.bot,
                          "audience",
                          "mini",
                          facing,
                        )}
                        {seat.guard ? (
                          <span
                            className={styles.jarlGuardMark}
                            aria-hidden="true"
                          >
                            III
                          </span>
                        ) : null}
                      </span>
                    </span>
                  );
                })}
              </span>
            );
          })}
        </span>
      ))}
    </section>
  );

  return (
    <section
      className={`${studioStyles.live} ${styles.liveShell} ${styles.stageAlignmentPreview}`}
      data-debate-format="flyting"
      data-flyting-stage-preview={props.view}
      data-theme={props.theme}
      aria-label={`Flyting ${props.view === "moderator" ? "Jarl" : props.view} stage layout preview`}
      style={
        {
          "--flyting-for": forColor,
          "--flyting-against": againstColor,
          "--debate-active-color": hostColor,
          "--debate-for-color": forColor,
          "--debate-against-color": againstColor,
          "--debate-moderator-color": hostColor,
          "--flyting-lane-left": forColor,
          "--flyting-lane-host": hostColor,
          "--flyting-lane-right": againstColor,
        } as CSSProperties
      }
    >
      <header className={styles.stageAlignmentPreviewHeader}>
        <div>
          <span>Rehearsal mode</span>
          <strong>Rehearse the Mead Hall</strong>
        </div>
        <div className={styles.stageAlignmentPreviewTools}>
          <small>
            {props.view === "moderator"
              ? "Jarl throne"
              : "Wide hall and gallery"}
            {" · Click an outlined element, then fine-tune it."}
          </small>
          <button
            type="button"
            data-flyting-preview-theme-toggle="true"
            aria-pressed={props.theme === "light"}
            onClick={props.onToggleTheme}
          >
            {props.theme === "light" ? "Preview dark" : "Preview light"}
          </button>
          <button type="button" onClick={props.onClose}>
            Done
          </button>
        </div>
      </header>
      <div
        className={styles.stageAlignmentPreviewCanvas}
        data-gallery-stacked={props.view === "wide" ? "true" : undefined}
      >
        <section
          className={`${studioStyles.forum} ${styles.hallStage} ${styles.courtStage} ${styles.stageAlignmentPreviewStage}`}
          aria-label="Mead Hall stage alignment preview"
          data-debate-stage-viewport="authoring-preview"
        >
          <div
            className={`${studioStyles.forumCamera} ${styles.hallCamera}`}
            data-camera-view={cameraView}
            data-camera-mode="manual"
            data-camera-transition="cut"
          >
            <FlytingRgbKeyedBackdrop
              scene={cameraView === "moderator" ? "jarl" : "wide"}
              theme={props.theme}
              proColor={forColor}
              jarlColor={hostColor}
              conColor={againstColor}
            />
            <div className={styles.hallHeraldryGlyphs}>
              {(
                [
                  ["for", forBot, forColor],
                  ["moderator", hostBot, hostColor],
                  ["against", againstBot, againstColor],
                ] as const
              ).map(([role, bot, color]) => {
                const item = flytingStageAlignmentItemFor(
                  cameraView === "moderator" ? "moderator" : "wide",
                  role,
                  "heraldry",
                );
                if (!item) return null;
                return (
                  <span
                    data-role={role}
                    key={`preview-banner-glyph:${role}:${bot.id}`}
                    style={
                      {
                        "--flyting-bot-color": color,
                        ...flytingAlignmentStyle(
                          props.alignment.placements[item],
                        ),
                      } as CSSProperties
                    }
                    {...alignmentHandleProps(item)}
                  >
                    {props.renderBotGlyph(bot.glyph, {
                      size: role === "moderator" ? 30 : 38,
                      strokeWidth: 1.35,
                    })}
                  </span>
                );
              })}
            </div>
            <div className={styles.hallFixtureLight} aria-hidden="true" />
            {previewBots.map(({ role, roleLabel, snapshot, color }) => {
              const alignmentView =
                cameraView === "moderator" ? "moderator" : "wide";
              const botItem =
                flytingStageAlignmentItemFor(alignmentView, role, "bot") ??
                flytingStageAlignmentItemFor("wide", role, "bot")!;
              const helmetItem =
                flytingStageAlignmentItemFor(alignmentView, role, "helmet") ??
                flytingStageAlignmentItemFor("wide", role, "helmet")!;
              const nameplateItem =
                flytingStageAlignmentItemFor(
                  alignmentView,
                  role,
                  "nameplate",
                ) ?? flytingStageAlignmentItemFor("wide", role, "nameplate")!;
              const botPlacement = props.alignment.placements[botItem];
              const helmetPlacement = props.alignment.placements[helmetItem];
              const nameplatePlacement =
                props.alignment.placements[nameplateItem];
              const avatarPresentation =
                role === "moderator" && cameraView !== "moderator"
                  ? "mini"
                  : "full";
              return (
                <div key={`preview-stage:${role}:${snapshot.id}`}>
                  <div
                    className={`${studioStyles.botPosition} ${styles.courtBotPosition}`}
                    data-role={role}
                    style={
                      {
                        "--flyting-bot-color": color,
                        ...flytingAlignmentStyle(botPlacement),
                      } as CSSProperties
                    }
                    {...alignmentHandleProps(botItem)}
                  >
                    <div
                      className={studioStyles.botStagePresence}
                      data-debate-stage-compact={
                        avatarPresentation === "mini" ? "true" : undefined
                      }
                      data-flyting-bot-avatar={
                        role === "moderator" ? "host" : role
                      }
                    >
                      {role !== "moderator" ? (
                        <span
                          className={styles.keyedVikingHelmet}
                          data-flyting-hall-asset="participant-helmet"
                          style={flytingAlignmentStyle(helmetPlacement)}
                          {...alignmentHandleProps(helmetItem)}
                          aria-hidden="true"
                        />
                      ) : cameraView === "moderator" ? (
                        <span
                          className={styles.moderatorVikingHelmet}
                          data-flyting-hall-asset="moderator-helmet"
                          style={flytingAlignmentStyle(helmetPlacement)}
                          {...alignmentHandleProps(helmetItem)}
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className={styles.moderatorPixelVikingHelmet}
                          data-flyting-hall-asset="mini-pixel-crown"
                          style={flytingAlignmentStyle(helmetPlacement)}
                          {...alignmentHandleProps(helmetItem)}
                          aria-hidden="true"
                        />
                      )}
                      {renderPreviewAvatar(
                        snapshot,
                        role,
                        avatarPresentation,
                      )}
                    </div>
                  </div>
                  <div
                    className={`${studioStyles.botIdentityPosition} ${styles.courtIdentityPosition}`}
                    data-role={role}
                    style={flytingAlignmentStyle(nameplatePlacement)}
                    {...alignmentHandleProps(nameplateItem)}
                  >
                    <div className={studioStyles.botIdentityPlate}>
                      <strong>{snapshot.name}</strong>
                      <small>{roleLabel}</small>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
        {props.view === "wide" ? previewGallery : null}
      </div>
    </section>
  );
}

function FlytingAtmosphereControl(): React.JSX.Element {
  const lastAtmosphereIndex = DEBATE_FORMALITY_SPECTRUM.length - 1;
  return (
    <div
      className={`${studioStyles.rowdinessControl} ${styles.flytingAtmosphereDisabled}`}
      data-rowdiness="free_for_all"
      data-disabled="true"
      data-tutorial-target="debate-rowdiness"
      aria-disabled="true"
      style={
        {
          "--debate-rowdiness-accent": "var(--debate-studio-accent)",
          "--debate-rowdiness-progress": "100%",
        } as CSSProperties
      }
    >
      <div className={studioStyles.rowdinessReadout}>
        <span>Atmosphere</span>
        <strong>Mead Hall</strong>
        <small>Locked to the Hall. It is already atmospheric enough.</small>
      </div>
      <div className={studioStyles.rowdinessInstrument}>
        <div className={studioStyles.rowdinessEndpoints} aria-hidden="true">
          <span>University Union</span>
          <span>Daytime Showdown</span>
        </div>
        <div className={studioStyles.rowdinessRange}>
          <div className={studioStyles.rowdinessTrack} aria-hidden="true">
            <span>
              {DEBATE_FORMALITY_SPECTRUM.map((level, index) => (
                <i
                  key={level.id}
                  data-reached="true"
                  data-current={
                    index === lastAtmosphereIndex ? "true" : undefined
                  }
                />
              ))}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={lastAtmosphereIndex}
            value={lastAtmosphereIndex}
            disabled
            readOnly
            aria-label="Debate atmosphere (disabled for Flyting)"
            aria-valuetext="Locked at maximum: Mead Hall"
          />
        </div>
        <p>Flyting carries its own heat, pacing, and ritual pressure.</p>
      </div>
    </div>
  );
}

export function DebateFlytingSetup(
  props: DebateFlytingSetupProps,
): React.JSX.Element {
  useEffect(() => {
    for (const sceneAssets of Object.values(FLYTING_RGB_KEY_ASSETS)) {
      void loadFlytingRgbKeySource(sceneAssets[props.theme]).catch(() => {
        // The visible canvas owns retry/error state. This speculative warmup
        // only keeps a first Jarl or Gallery switch from flashing blank.
      });
    }
  }, [props.theme]);

  const defaultJudge = props.bots.length < 3;
  const [step, setStep] = useState<FlytingSetupStep>("summon");
  const [playerRole, setPlayerRole] = useState<FlytingPlayerRole>(
    defaultJudge ? "judge" : "participant",
  );
  const [playerSideId, setPlayerSideId] = useState<DebateSideId>("for");
  const [rivalrySpark, setRivalrySpark] = useState("");
  const [forbiddenTopics, setForbiddenTopics] = useState("");
  const [forBotId, setForBotId] = useState(props.bots[0]?.id ?? "");
  const [againstBotId, setAgainstBotId] = useState(props.bots[1]?.id ?? "");
  const [hostBotId, setHostBotId] = useState(props.bots[2]?.id ?? "");
  const [activeCastSeat, setActiveCastSeat] = useState<FlytingCastSeat>("for");
  const [castPickerSearch, setCastPickerSearch] = useState("");
  const [castPickerGroupId, setCastPickerGroupId] = useState("all");
  const [castHueLensCenter, setCastHueLensCenter] = useState<number | null>(
    null,
  );
  const [stageLayoutOpen, setStageLayoutOpen] = useState(false);
  const [stageLayoutView, setStageLayoutView] =
    useState<DebateFlytingStageRehearsalView>("wide");
  const [stageLayoutItem, setStageLayoutItem] =
    useState<DebateFlytingStageAlignmentItem>("wideForBot");
  const [stageLayoutDraft, setStageLayoutDraft] =
    useState<DebateFlytingStageAlignmentV1>(() =>
      copyDebateFlytingStageAlignment(DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT),
    );
  const [stageGalleryBotScale, setStageGalleryBotScale] = useState(100);
  const [stageGalleryMaxVerticalRoam, setStageGalleryMaxVerticalRoam] =
    useState(DEBATE_FLYTING_GALLERY_DEFAULT_MAX_VERTICAL_ROAM_PERCENT);
  const [stageGalleryVotes, setStageGalleryVotes] = useState<
    Record<DebateSideId, number>
  >({ for: 0, against: 0 });
  const [stagePreviewTheme, setStagePreviewTheme] = useState<"light" | "dark">(
    props.theme,
  );
  const [stageLayoutCopyState, setStageLayoutCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const [bout, setBout] = useState<DebateFlytingBoutV1 | null>(null);
  const [checks, setChecks] = useState<DebateAdvocacyConsent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const castPickerGridShellRef = useRef<HTMLDivElement | null>(null);

  const botById = useMemo(
    () => new Map(props.bots.map((bot) => [bot.id, bot] as const)),
    [props.bots],
  );
  const forBot = botById.get(forBotId);
  const againstBot = botById.get(againstBotId);
  const hostBot = botById.get(hostBotId);
  const needsBotHost = playerRole !== "judge";
  const effectiveActiveCastSeat =
    !needsBotHost && activeCastSeat === "host" ? "for" : activeCastSeat;
  const activeCastBotId =
    effectiveActiveCastSeat === "for"
      ? forBotId
      : effectiveActiveCastSeat === "against"
        ? againstBotId
        : hostBotId;
  const castReady = Boolean(
    forBot &&
    againstBot &&
    forBot.id !== againstBot.id &&
    (!needsBotHost ||
      (hostBot && hostBot.id !== forBot.id && hostBot.id !== againstBot.id)),
  );
  const consentReady =
    checks.length === 2 &&
    checks.every(
      (check) =>
        check.status === "accept" || check.status === "devils_advocate",
    );
  const stepReady: Record<FlytingSetupStep, boolean> = {
    summon: true,
    cast: castReady,
    forge: Boolean(bout),
    review: consentReady,
  };
  const readinessCount = Object.values(stepReady).filter(Boolean).length;
  const roleLabel =
    playerRole === "participant"
      ? `Coach · ${playerSideId === "for" ? "Pro" : "Con"}`
      : playerRole === "judge"
        ? "Jarl of the Hall"
        : "Spectator";
  const hostName =
    playerRole === "judge" ? "You" : (hostBot?.name ?? "Surprise");
  const flytingTheme = DEBATE_FORMAT_VISUAL_THEMES.flyting;
  const setupAccent =
    props.theme === "light"
      ? flytingTheme.accentLight
      : flytingTheme.accentDark;
  const proceedingTitle = consentReady
    ? "Ready to open"
    : bout
      ? "Awaiting consent"
      : step === "summon"
        ? "Choose your place"
        : step === "cast"
          ? "Seat the Hall"
          : "Forge the bout";
  const flytingPickerGroups = useMemo<BotPickerGroup[]>(() => {
    const availableIds = new Set(props.bots.map((bot) => bot.id));
    return [
      {
        id: "all",
        name: "All bots",
        botIds: props.bots.map((bot) => bot.id),
        count: props.bots.length,
      },
      ...(props.botGroups ?? [])
        .map((group) => {
          const botIds = group.botIds.filter((botId) =>
            availableIds.has(botId),
          );
          return { ...group, botIds, count: botIds.length };
        })
        .filter((group) => group.botIds.length > 0),
    ];
  }, [props.botGroups, props.bots]);
  const effectiveCastPickerGroupId = flytingPickerGroups.some(
    (group) => group.id === castPickerGroupId,
  )
    ? castPickerGroupId
    : "all";
  const castHueLensAvailable = useMemo(() => {
    let chromatic = 0;
    for (const bot of props.bots) {
      if (flytingCastBotHue(bot) !== null) {
        chromatic += 1;
        if (chromatic >= 2) return true;
      }
    }
    return false;
  }, [props.bots]);
  const visibleCastBots = useMemo(() => {
    const filtered = filterBotPickerItems(
      props.bots,
      castPickerSearch,
      effectiveCastPickerGroupId,
      flytingPickerGroups,
    );
    return sortBotPickerItems(
      filtered,
      castHueLensCenter !== null,
      (left, right) => {
        const leftHue = flytingCastBotHue(left);
        const rightHue = flytingCastBotHue(right);
        if (leftHue === null && rightHue !== null) return 1;
        if (leftHue !== null && rightHue === null) return -1;
        if (
          leftHue !== null &&
          rightHue !== null &&
          castHueLensCenter !== null
        ) {
          const leftDistance = circularHueDistance(leftHue, castHueLensCenter);
          const rightDistance = circularHueDistance(
            rightHue,
            castHueLensCenter,
          );
          if (leftDistance !== rightDistance) {
            return leftDistance - rightDistance;
          }
          if (leftHue !== rightHue) return leftHue - rightHue;
        }
        return left.name.localeCompare(right.name, undefined, {
          sensitivity: "base",
        });
      },
    );
  }, [
    castHueLensCenter,
    castPickerSearch,
    effectiveCastPickerGroupId,
    flytingPickerGroups,
    props.bots,
  ]);
  const stageLayoutItems = useMemo(
    () => debateFlytingStageRehearsalItems(stageLayoutView),
    [stageLayoutView],
  );
  const stageLayoutDefinition =
    DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.find(
      (item) => item.id === stageLayoutItem,
    ) ?? DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS[0]!;
  const stageLayoutPlacement = stageLayoutDraft.placements[stageLayoutItem];
  const stageGalleryVoteCounts = flytingPreviewGalleryVoteCounts(
    stageGalleryVotes,
  );

  useEffect(() => {
    if (needsBotHost || activeCastSeat !== "host") return;
    setActiveCastSeat("for");
  }, [activeCastSeat, needsBotHost]);

  useEffect(() => {
    if (castHueLensCenter === null || !castPickerGridShellRef.current) return;
    let closestBotId: string | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const bot of visibleCastBots) {
      const hue = flytingCastBotHue(bot);
      if (hue === null) continue;
      const distance = circularHueDistance(hue, castHueLensCenter);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestBotId = bot.id;
      }
    }
    if (!closestBotId) return;
    const tile = castPickerGridShellRef.current.querySelector<HTMLElement>(
      `button[data-bot-id="${CSS.escape(closestBotId)}"]`,
    );
    tile?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [castHueLensCenter, visibleCastBots]);

  const invalidateForge = useCallback(() => {
    setBout(null);
    setChecks([]);
    setSavedNotice(null);
  }, []);

  const occupiedCastSeats: Array<readonly [FlytingCastSeat, string]> = [
    ["for", forBotId],
    ["against", againstBotId],
    ...(needsBotHost ? ([["host", hostBotId]] as const) : []),
  ];
  const castPickerBotUnavailableReason = (
    bot: FlytingBotSummary,
  ): string | null =>
    occupiedCastSeats.some(
      ([seat, botId]) => seat !== effectiveActiveCastSeat && botId === bot.id,
    )
      ? "Already seated in the contest"
      : null;
  const singleActionableCastPickerBot =
    castPickerSearch.trim() &&
    visibleCastBots.filter(
      (bot) => castPickerBotUnavailableReason(bot) === null,
    ).length === 1
      ? (visibleCastBots.find(
          (bot) => castPickerBotUnavailableReason(bot) === null,
        ) ?? null)
      : null;
  const activeCastSeatLabel =
    effectiveActiveCastSeat === "for"
      ? "Pro flyter"
      : effectiveActiveCastSeat === "against"
        ? "Con flyter"
        : "Jarl of the Hall";

  const assignBotToCastSeat = (seat: FlytingCastSeat, botId: string): void => {
    const bot = botById.get(botId);
    if (!bot || castPickerBotUnavailableReason(bot)) return;
    if (seat === "for") setForBotId(bot.id);
    else if (seat === "against") setAgainstBotId(bot.id);
    else setHostBotId(bot.id);
    invalidateForge();
  };

  const chooseCastPickerBot = (botId: string): void =>
    assignBotToCastSeat(effectiveActiveCastSeat, botId);

  const randomizeFlytingCastPlacements = useCallback(
    (visibleBotIds: readonly string[]): boolean => {
      const selectedBotIds = randomBotPickerPlacements({
        visibleBotIds,
        placementCount: needsBotHost ? 3 : 2,
      });
      if (!selectedBotIds) {
        setError(
          `The active Library view needs ${needsBotHost ? "three" : "two"} distinct bots to seat this Hall.`,
        );
        return false;
      }
      setForBotId(selectedBotIds[0]!);
      if (needsBotHost) setHostBotId(selectedBotIds[1]!);
      setAgainstBotId(selectedBotIds[needsBotHost ? 2 : 1]!);
      setActiveCastSeat("for");
      setError(null);
      invalidateForge();
      return true;
    },
    [invalidateForge, needsBotHost],
  );

  const addStageGalleryVote = (sideId: DebateSideId): void => {
    setStageGalleryVotes((current) => {
      const neutralCount =
        DEBATE_FLYTING_AUDIENCE_COUNT - current.for - current.against;
      if (sideId === "for") {
        if (current.for >= DEBATE_FLYTING_AUDIENCE_COUNT) return current;
        return {
          for: current.for + 1,
          against:
            neutralCount > 0
              ? current.against
              : Math.max(0, current.against - 1),
        };
      }
      if (current.against >= DEBATE_FLYTING_AUDIENCE_COUNT) return current;
      return {
        for: neutralCount > 0 ? current.for : Math.max(0, current.for - 1),
        against: current.against + 1,
      };
    });
  };

  const flytingCastPlacementRefractTarget =
    useMemo<BotPickerPlacementRefractTarget>(
      () => ({
        id: "debate:flyting:cast-placement-grid",
        label: "the visible Flyting cast",
        kind: "magic",
        interaction: "choice",
        keepOpen: true,
        ownsPresentation: true,
        disabled: () => busy || props.bots.length < (needsBotHost ? 3 : 2),
        choices: () => [
          {
            value: "random",
            label: `Random · all ${props.bots.length} bots`,
            disabled: props.bots.length < (needsBotHost ? 3 : 2),
          },
          ...flytingPickerGroups
            .filter((group) => group.id !== "all")
            .map((group) => ({
              value: group.id,
              label: `${group.name} · ${group.count ?? group.botIds.length} bots`,
              disabled: group.botIds.length < (needsBotHost ? 3 : 2),
            })),
        ],
        run: (choice) => {
          const groupId = choice === "random" ? "all" : choice;
          const groupVisibleBotIds = filterBotPickerItems(
            props.bots,
            castPickerSearch,
            groupId,
            flytingPickerGroups,
          ).map((bot) => bot.id);
          setCastPickerGroupId(groupId);
          randomizeFlytingCastPlacements(groupVisibleBotIds);
        },
        rerollVisible: () =>
          randomizeFlytingCastPlacements(visibleCastBots.map((bot) => bot.id)),
      }),
      [
        busy,
        castPickerSearch,
        flytingPickerGroups,
        needsBotHost,
        props.bots,
        randomizeFlytingCastPlacements,
        visibleCastBots,
      ],
    );

  const clearCastSeat = (seat: FlytingCastSeat): void => {
    if (seat === "for") setForBotId("");
    else if (seat === "against") setAgainstBotId("");
    else setHostBotId("");
    setActiveCastSeat(seat);
    invalidateForge();
  };

  const chooseStageLayoutView = (
    view: DebateFlytingStageRehearsalView,
  ): void => {
    setStageLayoutView(view);
    setStageLayoutItem(
      debateFlytingStageRehearsalItems(view)[0]!.id,
    );
  };

  const updateStageLayoutPlacement = (
    item: DebateFlytingStageAlignmentItem,
    update: Partial<DebateFlytingStagePlacementV1>,
  ): void => {
    setStageLayoutDraft((current) =>
      updateDebateFlytingStagePlacement(current, item, update),
    );
    setStageLayoutCopyState("idle");
  };

  const copyStageLayout = async (): Promise<void> => {
    try {
      await writeFlytingAlignmentClipboard(
        formatDebateFlytingStageAlignmentClipboard(stageLayoutDraft, {
          galleryBotScale: stageGalleryBotScale,
          galleryMaxVerticalRoam: stageGalleryMaxVerticalRoam,
        }),
      );
      setStageLayoutCopyState("copied");
    } catch {
      setStageLayoutCopyState("failed");
    }
  };

  const choosePlayerRole = (nextRole: FlytingPlayerRole): void => {
    if (nextRole === "judge" && activeCastSeat === "host") {
      setActiveCastSeat("for");
    }
    setPlayerRole(nextRole);
    invalidateForge();
  };

  const renderFlytingCastSeat = ({
    seat,
    label,
    fallback,
  }: {
    seat: FlytingCastSeat;
    label: string;
    fallback: string;
  }): React.JSX.Element => {
    const fixedPlayerHost = seat === "host" && !needsBotHost;
    const botId =
      seat === "for" ? forBotId : seat === "against" ? againstBotId : hostBotId;
    const bot = fixedPlayerHost ? undefined : botById.get(botId);
    const active = !fixedPlayerHost && effectiveActiveCastSeat === seat;
    const emptyName = seat === "host" ? "Choose a Jarl" : "Choose a flyter";
    const accent = bot?.color ?? fallback;
    return (
      <article
        key={seat}
        className={`${studioStyles.castSlot} ${styles.flytingCastSeat}`}
        data-active={active ? "true" : undefined}
        data-filled={bot || fixedPlayerHost ? "true" : undefined}
        data-fixed={fixedPlayerHost ? "player-judge" : undefined}
        style={{ "--debate-cast-color": accent } as CSSProperties}
      >
        <button
          type="button"
          className={`${studioStyles.castSlotSelect} ${styles.flytingCastSeatButton}`}
          aria-pressed={active}
          disabled={fixedPlayerHost}
          data-bot-id={bot?.id}
          onClick={() => setActiveCastSeat(seat)}
        >
          <span className={studioStyles.castSlotGlyph} aria-hidden="true">
            {fixedPlayerHost
              ? "◇"
              : props.renderBotGlyph(bot?.glyph ?? "dice", {
                  size: 30,
                  strokeWidth: 1.65,
                })}
          </span>
          <span>
            <small>{label}</small>
            <strong>
              {fixedPlayerHost ? "You" : (bot?.name ?? emptyName)}
            </strong>
            {fixedPlayerHost ? <em>Final ruling · Fixed</em> : null}
            {bot?.hardMuted ? <em>Hard-muted</em> : null}
          </span>
        </button>
        {bot ? (
          <button
            type="button"
            className={`${studioStyles.castSlotClear} ${styles.flytingCastSeatClear}`}
            aria-label={`Remove ${bot.name} from ${label}`}
            onClick={() => clearCastSeat(seat)}
          >
            ×
          </button>
        ) : null}
      </article>
    );
  };

  const chooseStep = (next: FlytingSetupStep): void => {
    const index = FLYTING_SETUP_STEPS.findIndex(
      (candidate) => candidate.id === next,
    );
    const current = FLYTING_SETUP_STEPS.findIndex(
      (candidate) => candidate.id === step,
    );
    if (
      index <= current ||
      next === "cast" ||
      (next === "forge" && castReady) ||
      (next === "review" && bout)
    ) {
      setStep(next);
    }
  };

  const forgeBout = async (): Promise<void> => {
    if (!castReady || busy) return;
    setBusy(true);
    setError(null);
    setChecks([]);
    try {
      const result = await props.request<{
        bout: DebateFlytingBoutV1;
      }>(
        "/api/debates/flyting/forge",
        jsonBody({
          forAdvocateBotId: forBotId,
          againstAdvocateBotId: againstBotId,
          rivalrySpark,
          forbiddenTopics: forbiddenTopics
            .split(/[\n,]/gu)
            .map((topic) => topic.trim())
            .filter(Boolean),
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo,
        }),
      );
      setBout(result.bout);
      setStep("review");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Bout Forge could not temper this contest.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updateBout = (next: DebateFlytingBoutV1): void => {
    setBout(next);
    setChecks([]);
    setSavedNotice(null);
  };

  const secureConsent = async (): Promise<DebateAdvocacyConsent[] | null> => {
    if (!bout || busy) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ checks: DebateAdvocacyConsent[] }>(
        "/api/debates/role-checks",
        jsonBody({
          format: "flyting",
          formality: "free_for_all",
          motion: flytingMotion(bout),
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          forAdvocateBotId: forBotId,
          againstAdvocateBotId: againstBotId,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo,
        }),
      );
      setChecks(result.checks);
      return result.checks;
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The flyters could not review their roles.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createBout = async (deferStart: boolean): Promise<void> => {
    if (!bout || busy) return;
    let acceptedChecks = checks;
    if (!consentReady) {
      const refreshed = await secureConsent();
      if (
        !refreshed ||
        !refreshed.every(
          (check) =>
            check.status === "accept" || check.status === "devils_advocate",
        )
      )
        return;
      acceptedChecks = refreshed;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ session: DebateSessionV1 }>(
        "/api/debates",
        jsonBody({
          format: "flyting",
          flyting: { version: 1, bout },
          formality: "free_for_all",
          presetId: "custom",
          motion: flytingMotion(bout),
          evidence: {
            version: DEBATE_SCHEMA_VERSION,
            notes: "",
            sources: [],
            exhibits: [],
            frozenAt: null,
          },
          moderatorTitle: "Jarl of the Hall",
          moderatorBotId: needsBotHost ? hostBotId : "",
          playerJudgeUsesPrism: playerRole === "judge",
          forAdvocateBotId: forBotId,
          againstAdvocateBotId: againstBotId,
          playerRole,
          playerSideId: playerRole === "participant" ? playerSideId : null,
          jury: {
            enabled: false,
          },
          advocacyConsent: acceptedChecks,
          preferredProvider:
            props.modelOverride?.provider ?? props.preferredProvider,
          modelOverride: props.modelOverride?.model ?? null,
          responseMode: props.responseMode,
          reasoningEffort: props.reasoningEffort,
          turbo: props.turbo,
          theme: props.theme,
          ...(deferStart ? { deferStart: true } : {}),
          idempotencyKey: flytingMutationKey(deferStart ? "save" : "create"),
        }),
      );
      if (deferStart) {
        setSavedNotice(
          "Saved to Archive · Open. The approved legends and Hall cast are frozen.",
        );
        props.onSaved(result.session);
      } else {
        props.onStart(result.session);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Hall doors would not open.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className={`${studioStyles.lobby} ${studioStyles.dashboard} ${styles.setupShell}`}
      data-theme={props.theme}
      data-debate-surface="dashboard"
      data-debate-format="flyting"
      data-tutorial-target="debate-flyting-setup"
      style={{ "--debate-studio-accent": setupAccent } as CSSProperties}
    >
      <header className={studioStyles.lobbyHeader}>
        <button
          type="button"
          className={studioStyles.exitButton}
          onClick={props.onExit}
        >
          ← Exit
        </button>
        <div className={studioStyles.studioIdentity}>
          <p className={studioStyles.eyebrow}>PRISM / Debate</p>
          <h1>Debate Studio</h1>
          <span>Flyting · Mead Hall · Prism fills the bout</span>
        </div>
        <div className={studioStyles.lobbyActions}>
          <button
            type="button"
            className={`${studioStyles.primaryButton} ${styles.changeFormatAction}`}
            onClick={props.onBackToFormats}
          >
            Change format
          </button>
          {props.onResetTutorial ? (
            <button
              type="button"
              className={studioStyles.tutorialButton}
              onClick={props.onResetTutorial}
            >
              Replay walkthrough
            </button>
          ) : null}
        </div>
      </header>

      <div className={studioStyles.dashboardLayout}>
        <nav className={studioStyles.studioNav} aria-label="Debate Studio">
          <p>Shape the Debate</p>
          {FLYTING_SETUP_STEPS.map((item, index) => (
            <button
              type="button"
              key={item.id}
              className={studioStyles.studioNavButton}
              data-active={step === item.id ? "true" : undefined}
              data-complete={stepReady[item.id] ? "true" : undefined}
              aria-pressed={step === item.id}
              disabled={
                (item.id === "forge" && !castReady) ||
                (item.id === "review" && !bout)
              }
              onClick={() => chooseStep(item.id)}
            >
              <span>0{index + 1}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
              <i aria-hidden="true">{stepReady[item.id] ? "✓" : "·"}</i>
            </button>
          ))}
          <span className={studioStyles.studioNavRule} />
          <button
            type="button"
            className={studioStyles.studioNavButton}
            aria-label="Open proceeding archive"
            onClick={props.onOpenArchive}
          >
            <span>↳</span>
            <strong>Archive</strong>
            <small>
              {props.archiveCount} proceeding
              {props.archiveCount === 1 ? "" : "s"}
            </small>
            <i aria-hidden="true">›</i>
          </button>
          {DEBATE_FLYTING_STAGE_LAYOUT_AUTHORING_ENABLED ? (
            <button
              type="button"
              className={studioStyles.studioUtilityButton}
              data-tutorial-target="debate-stage-layout"
              data-selected={stageLayoutOpen ? "true" : undefined}
              onClick={() => {
                setStagePreviewTheme(props.theme);
                setStageLayoutOpen(true);
              }}
              aria-label="Edit stage layout"
              title="Place every Mead Hall stage element and copy source-ready defaults."
            >
              <span aria-hidden="true">⌖</span>
              Stage layout
            </button>
          ) : null}
          <div
            className={studioStyles.studioNavStatus}
            data-ready={consentReady ? "true" : undefined}
          >
            <span>Proceeding</span>
            <strong>
              {consentReady ? "Ready" : `${readinessCount} of 4 ready`}
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

        <div className={studioStyles.dashboardDesk}>
          <section
            className={`${studioStyles.setupPanel} ${studioStyles.dashboardPanel} ${styles.setupPanel}`}
            data-debate-dashboard-section={step}
          >
            {step === "summon" ? (
              <>
                <header className={styles.panelHeading}>
                  <div>
                    <small>01 / Summon</small>
                    <h2>Choose your place in the Hall</h2>
                    <p>
                      Choose whether you coach a voice, hold the final word, or
                      watch the contest unfold.
                    </p>
                  </div>
                  <span>No timer · four exchanges</span>
                </header>
                <section
                  className={studioStyles.roomTuning}
                  data-tutorial-target="debate-room"
                  data-flyting-selector="true"
                >
                  <header>
                    <span aria-hidden="true">◇</span>
                    <span>
                      <strong>Tune the Hall</strong>
                      <small>Flyting · Mead Hall · Four exchanges</small>
                    </span>
                    <em>Always visible</em>
                  </header>
                  <div className={studioStyles.roomTuningBody}>
                    <div
                      className={studioStyles.proceedingPresets}
                      data-tutorial-target="debate-presets"
                    >
                      <div>
                        <span>Proceeding preset</span>
                        <strong>Custom</strong>
                      </div>
                      <div role="group" aria-label="Debate proceeding presets">
                        {DEBATE_SETUP_PRESETS.map((preset) => (
                          <button
                            type="button"
                            key={preset.id}
                            className={styles.flytingPresetControl}
                            disabled
                            title="Presets tune Forum and Turnabout; Flyting keeps its own Hall rules."
                          >
                            {preset.name}
                          </button>
                        ))}
                        <span className={studioStyles.customPresetChip}>
                          Custom
                        </span>
                      </div>
                    </div>
                    <FlytingAtmosphereControl />
                    <fieldset
                      className={`${studioStyles.formatPicker} ${styles.flytingFormatPicker}`}
                      data-tutorial-target="debate-format"
                    >
                      <legend>Debate format</legend>
                      {DEBATE_FORMAT_CATALOG.filter(
                        (option) => option.availability === "available",
                      ).map((option) => (
                        <label
                          key={option.id}
                          data-selected={
                            option.id === "flyting" ? "true" : undefined
                          }
                          data-tutorial-target={
                            option.id === "flyting"
                              ? "debate-format-flyting"
                              : undefined
                          }
                        >
                          <input
                            type="radio"
                            name="flyting-debate-format"
                            value={option.id}
                            checked={option.id === "flyting"}
                            onChange={() => {
                              if (option.id !== "flyting") {
                                props.onFormatChange(
                                  option.id as DebateFormatId,
                                );
                              }
                            }}
                          />
                          <strong>
                            {option.name}
                            <em>{option.productionName}</em>
                          </strong>
                          <span>{option.summary}</span>
                          <small>{option.cadence}</small>
                        </label>
                      ))}
                    </fieldset>
                    <div
                      className={`${studioStyles.proceedingPresets} ${styles.flytingCoachChoice}`}
                      data-tutorial-target="debate-flyting-side"
                    >
                      <div>
                        <span>Which flyter will you coach?</span>
                        <strong>
                          {playerRole === "participant"
                            ? playerSideId === "for"
                              ? "Pro · left"
                              : "Con · right"
                            : "Not assigned"}
                        </strong>
                      </div>
                      {playerRole === "participant" ? (
                        <div
                          className={styles.flytingCoachChoiceControls}
                          role="radiogroup"
                          aria-label="Which flyter will you coach"
                        >
                          <label
                            data-selected={
                              playerSideId === "for" ? "true" : undefined
                            }
                          >
                            <input
                              type="radio"
                              name="flyting-side-selector"
                              value="for"
                              checked={playerSideId === "for"}
                              onChange={() => {
                                setPlayerSideId("for");
                                setChecks([]);
                              }}
                            />
                            Pro · left
                          </label>
                          <label
                            data-selected={
                              playerSideId === "against" ? "true" : undefined
                            }
                          >
                            <input
                              type="radio"
                              name="flyting-side-selector"
                              value="against"
                              checked={playerSideId === "against"}
                              onChange={() => {
                                setPlayerSideId("against");
                                setChecks([]);
                              }}
                            />
                            Con · right
                          </label>
                        </div>
                      ) : (
                        <span className={styles.flytingCoachChoiceUnavailable}>
                          serve as Jarl or watch the rite
                        </span>
                      )}
                    </div>
                  </div>
                </section>
                <div
                  className={styles.roleCards}
                  role="radiogroup"
                  aria-label="Flyting role"
                >
                  {(
                    [
                      [
                        "participant",
                        "Coach a flyter",
                        "Choose tactics, author or Wield a line, and hear your bot perform it.",
                      ],
                      [
                        "judge",
                        "Sit as Jarl",
                        "Hear the Hall, then send your three guards as the final vote.",
                      ],
                      [
                        "spectator",
                        "Watch the rite",
                        "Let both flyters and the Jarl carry the full contest.",
                      ],
                    ] as const
                  ).map(([id, label, detail]) => (
                    <label
                      key={id}
                      data-selected={playerRole === id ? "true" : undefined}
                    >
                      <input
                        type="radio"
                        name="flyting-role"
                        value={id}
                        checked={playerRole === id}
                        onChange={() => choosePlayerRole(id)}
                      />
                      <strong>{label}</strong>
                      <span>{detail}</span>
                    </label>
                  ))}
                </div>
                <label className={styles.field}>
                  <span>
                    <strong>Rivalry Spark</strong>
                    <em>Optional</em>
                  </span>
                  <textarea
                    rows={4}
                    value={rivalrySpark}
                    maxLength={800}
                    placeholder="Leave blank for Surprise me—or name the absurd grudge, disputed glory, or impossible pairing."
                    onChange={(event) => {
                      setRivalrySpark(event.currentTarget.value);
                      invalidateForge();
                    }}
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    <strong>Subjects the Hall must avoid</strong>
                    <em>Optional · one per line</em>
                  </span>
                  <textarea
                    rows={3}
                    value={forbiddenTopics}
                    maxLength={900}
                    placeholder="Add boundaries beyond PRISM’s permanent sporting-but-cutting rules."
                    onChange={(event) => {
                      setForbiddenTopics(event.currentTarget.value);
                      invalidateForge();
                    }}
                  />
                </label>
                <footer className={styles.panelActions}>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={() => setStep("cast")}
                  >
                    Enter the Cast
                  </button>
                </footer>
              </>
            ) : null}

            {step === "cast" ? (
              <>
                <header className={styles.panelHeading}>
                  <div>
                    <small>02 / Cast</small>
                    <h2>Seat the contest</h2>
                    <p>
                      Select Pro, Jarl, or Con, then choose that voice from the
                      Library. PRISM fills the gallery automatically.
                    </p>
                  </div>
                  <span>{activeCastSeatLabel} · Active seat</span>
                </header>
                <div
                  className={styles.flytingCastRoster}
                  data-tutorial-target="debate-flyting-cast"
                >
                  <div
                    className={`${studioStyles.castSlotGrid} ${styles.flytingPrincipalCast}`}
                    data-seat-count="3"
                  >
                    {renderFlytingCastSeat({
                      seat: "for",
                      label: "Pro · left",
                      fallback: "#d8b25d",
                    })}
                    {renderFlytingCastSeat({
                      seat: "host",
                      label: "Jarl · guard vote ×3",
                      fallback: "#78c8b2",
                    })}
                    {renderFlytingCastSeat({
                      seat: "against",
                      label: "Con · right",
                      fallback: "#c56b53",
                    })}
                  </div>
                  <div className={styles.gallerySeed}>
                    <span aria-hidden="true">᛫ ᛫</span>
                    <div>
                      <strong>PRISM fills the gallery.</strong>
                      <small>
                        Fifteen generic Hall spectators and the Jarl's three
                        guards arrive with the proceeding. No Library casting is
                        required.
                      </small>
                    </div>
                  </div>
                </div>
                <div
                  className={`${studioStyles.castPicker} ${styles.flytingCastPicker}`}
                >
                  <BotPickerToolbar
                    searchValue={castPickerSearch}
                    onSearchChange={setCastPickerSearch}
                    searchAriaLabel="Search bots for Flyting"
                    searchPlaceholder="Search the Library…"
                    groups={flytingPickerGroups}
                    groupItems={props.bots}
                    groupValue={effectiveCastPickerGroupId}
                    onGroupChange={setCastPickerGroupId}
                    groupTheme={props.theme}
                    resultLabel={`${visibleCastBots.length} bot${visibleCastBots.length === 1 ? "" : "s"}`}
                    singleActionableResult={singleActionableCastPickerBot}
                    onSingleActionableResultSelect={chooseCastPickerBot}
                  />
                  <div
                    className={studioStyles.castPickerBody}
                    data-hue-lens={castHueLensAvailable ? "true" : undefined}
                  >
                    {visibleCastBots.length > 0 ? (
                      <div
                        ref={castPickerGridShellRef}
                        className={studioStyles.castPickerGridShell}
                      >
                        <BotPickerGrid
                          className={`${studioStyles.castPickerGrid} ${styles.flytingCastPickerGrid}`}
                          role="radiogroup"
                          ariaLabel={`Bot for ${activeCastSeatLabel}`}
                          placementRefractTarget={
                            flytingCastPlacementRefractTarget
                          }
                          style={
                            {
                              "--tile-size": "82px",
                              "--tile-gap": "9px",
                              "--tile-hover-scale": "1.055",
                            } as CSSProperties
                          }
                        >
                          {visibleCastBots.map((bot) => {
                            const selected = activeCastBotId === bot.id;
                            const unavailableReason =
                              castPickerBotUnavailableReason(bot);
                            return (
                              <BotPickerTile
                                key={bot.id}
                                item={bot}
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
                                className={`${studioStyles.castPickerTile} ${styles.flytingCastPickerTile}`}
                                buttonProps={{
                                  role: "radio",
                                  "aria-checked": selected,
                                  "aria-disabled": unavailableReason
                                    ? true
                                    : undefined,
                                  "aria-label": unavailableReason
                                    ? `${bot.name}, ${unavailableReason}`
                                    : `${bot.name}${selected ? ", selected" : ""}`,
                                  title: unavailableReason ?? undefined,
                                  onPointerDown: (event) =>
                                    props.onBotContextLongPressStart?.(
                                      event,
                                      bot.id,
                                    ),
                                  onPointerUp: props.onBotContextLongPressEnd,
                                  onPointerCancel:
                                    props.onBotContextLongPressEnd,
                                  onPointerMove:
                                    props.onBotContextLongPressMove,
                                  onContextMenu: (event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    props.onBotContextMenu?.(
                                      bot.id,
                                      event.clientX,
                                      event.clientY,
                                    );
                                  },
                                  onClick: () => {
                                    if (unavailableReason) return;
                                    chooseCastPickerBot(bot.id);
                                  },
                                }}
                              />
                            );
                          })}
                        </BotPickerGrid>
                      </div>
                    ) : (
                      <p className={studioStyles.castPickerEmpty}>
                        No bots match this view.
                      </p>
                    )}
                    {castHueLensAvailable ? (
                      <div
                        className={studioStyles.castPickerHueLens}
                        data-active={
                          castHueLensCenter !== null ? "true" : undefined
                        }
                        data-tutorial-target="debate-flyting-cast-hue-lens"
                      >
                        <span aria-hidden="true">Hue</span>
                        <input
                          type="range"
                          min={0}
                          max={359}
                          step={1}
                          value={debateCastLensSliderInputValue(
                            castHueLensCenter,
                          )}
                          onChange={(event) =>
                            setCastHueLensCenter(
                              debateCastHueFromLensSliderInput(
                                Number(event.currentTarget.value),
                              ),
                            )
                          }
                          aria-label="Browse Flyting cast bots by hue"
                        />
                        <button
                          type="button"
                          onClick={() => setCastHueLensCenter(null)}
                          disabled={castHueLensCenter === null}
                          aria-label="Clear Flyting cast hue lens"
                        >
                          ×
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
                <footer className={styles.panelActions}>
                  <button type="button" onClick={() => setStep("summon")}>
                    Back
                  </button>
                  <button
                    type="button"
                    data-tutorial-target="debate-flyting-shuffle-cast"
                    disabled={
                      busy || visibleCastBots.length < (needsBotHost ? 3 : 2)
                    }
                    onClick={() =>
                      randomizeFlytingCastPlacements(
                        visibleCastBots.map((bot) => bot.id),
                      )
                    }
                  >
                    Shuffle cast
                  </button>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={!castReady}
                    onClick={() => setStep("forge")}
                  >
                    Approach the Forge
                  </button>
                </footer>
              </>
            ) : null}

            {step === "forge" ? (
              <>
                <header className={styles.panelHeading}>
                  <div>
                    <small>03 / Forge</small>
                    <h2>Temper the bout</h2>
                    <p>
                      PRISM shapes public legends and stakes around this frozen
                      cast; everything remains editable before consent.
                    </p>
                  </div>
                  <span>Editable before Start</span>
                </header>
                <div className={styles.forgePreview}>
                  <div>
                    <FlytingBotMark
                      bot={forBot}
                      fallback="#d8b25d"
                      renderBotGlyph={props.renderBotGlyph}
                      size={56}
                    />
                    <strong>{forBot?.name}</strong>
                  </div>
                  <span>Boast · Flyte · Rejoinder · Acclamation</span>
                  <div>
                    <FlytingBotMark
                      bot={againstBot}
                      fallback="#c56b53"
                      renderBotGlyph={props.renderBotGlyph}
                      size={56}
                    />
                    <strong>{againstBot?.name}</strong>
                  </div>
                </div>
                <p className={styles.forgeCopy}>
                  PRISM will forge one title, one set of stakes, an epithet, and
                  three boastable Legend facets for each flyter. No private
                  relationship memory or live research enters the Hall.
                </p>
                <footer className={styles.panelActions}>
                  <button type="button" onClick={() => setStep("cast")}>
                    Back
                  </button>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={!castReady || busy}
                    onClick={() => void forgeBout()}
                  >
                    {busy
                      ? "Forging…"
                      : bout
                        ? "Reforge the bout"
                        : "Forge the bout"}
                  </button>
                </footer>
              </>
            ) : null}

            {step === "review" && bout ? (
              <>
                <header className={styles.panelHeading}>
                  <div>
                    <small>04 / Review</small>
                    <h2>{bout.title}</h2>
                    <p>
                      Review the public record, secure both flyters’ consent,
                      then open the Mead Hall.
                    </p>
                  </div>
                  <span>Fictional · non-canonical</span>
                </header>
                <label className={styles.field}>
                  <span>
                    <strong>Bout title</strong>
                    <em>Public</em>
                  </span>
                  <input
                    value={bout.title}
                    maxLength={120}
                    onChange={(event) =>
                      updateBout({ ...bout, title: event.currentTarget.value })
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span>
                    <strong>Stakes</strong>
                    <em>What the Hall will decide</em>
                  </span>
                  <textarea
                    rows={3}
                    value={bout.stakes}
                    maxLength={600}
                    onChange={(event) =>
                      updateBout({ ...bout, stakes: event.currentTarget.value })
                    }
                  />
                </label>
                <div className={styles.legendColumns}>
                  {bout.flyters.map((flyter, flyterIndex) => (
                    <section
                      key={flyter.botId}
                      style={
                        {
                          "--flyting-bot-color": botColor(
                            props.bots.find((bot) => bot.id === flyter.botId),
                            flyterIndex === 0 ? "#d8b25d" : "#c56b53",
                          ),
                        } as CSSProperties
                      }
                    >
                      <header>
                        <strong>{flyter.name}</strong>
                        <input
                          value={flyter.epithet}
                          maxLength={96}
                          aria-label={`${flyter.name} epithet`}
                          onChange={(event) => {
                            const flyters = [
                              ...bout.flyters,
                            ] as DebateFlytingBoutV1["flyters"];
                            flyters[flyterIndex] = {
                              ...flyter,
                              epithet: event.currentTarget.value,
                            };
                            updateBout({ ...bout, flyters });
                          }}
                        />
                      </header>
                      {flyter.legend.map((facet, facetIndex) => (
                        <div key={facet.id}>
                          <input
                            value={facet.title}
                            maxLength={80}
                            aria-label={`${flyter.name} Legend ${facetIndex + 1} title`}
                            onChange={(event) => {
                              const flyters = [
                                ...bout.flyters,
                              ] as DebateFlytingBoutV1["flyters"];
                              const legend = flyter.legend.map(
                                (candidate, index) =>
                                  index === facetIndex
                                    ? {
                                        ...candidate,
                                        title: event.currentTarget.value,
                                      }
                                    : candidate,
                              );
                              flyters[flyterIndex] = { ...flyter, legend };
                              updateBout({ ...bout, flyters });
                            }}
                          />
                          <textarea
                            value={facet.claim}
                            rows={2}
                            maxLength={280}
                            aria-label={`${flyter.name} Legend ${facetIndex + 1} claim`}
                            onChange={(event) => {
                              const flyters = [
                                ...bout.flyters,
                              ] as DebateFlytingBoutV1["flyters"];
                              const legend = flyter.legend.map(
                                (candidate, index) =>
                                  index === facetIndex
                                    ? {
                                        ...candidate,
                                        claim: event.currentTarget.value,
                                      }
                                    : candidate,
                              );
                              flyters[flyterIndex] = { ...flyter, legend };
                              updateBout({ ...bout, flyters });
                            }}
                          />
                        </div>
                      ))}
                    </section>
                  ))}
                </div>
                <div className={styles.reviewLock}>
                  <div>
                    <span>Privacy</span>
                    <strong>
                      {props.responseMode === "local"
                        ? "LOCAL · never leaves this device"
                        : "ONLINE · approved provider"}
                    </strong>
                  </div>
                  <div>
                    <span>Delivery</span>
                    <strong>Cadenced · no timer · no required rhyme</strong>
                  </div>
                  <div>
                    <span>Record</span>
                    <strong>Four exchanges · one decisive winner</strong>
                  </div>
                </div>
                <section className={styles.consentPanel}>
                  <header>
                    <div>
                      <strong>Flyter consent</strong>
                      <small>
                        Each bot privately reviews its role and frozen legends.
                      </small>
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void secureConsent()}
                    >
                      {busy
                        ? "Asking…"
                        : checks.length
                          ? "Ask again"
                          : "Secure consent"}
                    </button>
                  </header>
                  {checks.length ? (
                    <ul>
                      {checks.map((check) => (
                        <li key={check.botId} data-status={check.status}>
                          <span>
                            {props.bots.find((bot) => bot.id === check.botId)
                              ?.name ?? check.botId}
                          </span>
                          <strong>
                            {check.status === "accept"
                              ? "Accepts"
                              : check.status === "devils_advocate"
                                ? "Accepts as Devil’s Advocate"
                                : "Declines"}
                          </strong>
                          <small>{check.reason}</small>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>Start will remain sealed until both flyters answer.</p>
                  )}
                </section>
                <footer className={styles.panelActions}>
                  <button type="button" onClick={() => setStep("forge")}>
                    Back
                  </button>
                  <span>
                    Save and Start are waiting in the Proceeding Card.
                  </span>
                  <button
                    type="button"
                    className={styles.mobileReviewAction}
                    disabled={busy || !consentReady}
                    onClick={() => void createBout(true)}
                  >
                    Save for later
                  </button>
                  <button
                    type="button"
                    className={`${styles.primaryAction} ${styles.mobileReviewAction}`}
                    disabled={busy || !consentReady}
                    onClick={() => void createBout(false)}
                  >
                    Open the Hall
                  </button>
                </footer>
              </>
            ) : null}

            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {savedNotice ? (
              <p className={styles.notice} role="status">
                {savedNotice}
              </p>
            ) : null}
          </section>
        </div>

        <aside className={studioStyles.dashboardRail}>
          <section
            className={styles.studioReadout}
            aria-label="Mead Hall schematic"
          >
            <header>
              <span>Mead Hall floor</span>
              <strong>Flyting</strong>
            </header>
            <div className={styles.studioCircuit}>
              <span className={styles.studioBeam} aria-hidden="true" />
              <FlytingStudioSeat
                bot={forBot}
                fallback="#2fd3e3"
                label="Pro · left"
                name={forBot?.name ?? "Uncast Pro"}
                renderBotGlyph={props.renderBotGlyph}
              />
              <FlytingStudioSeat
                bot={playerRole === "judge" ? undefined : hostBot}
                fallback={setupAccent}
                label="Jarl"
                name={hostName}
                renderBotGlyph={props.renderBotGlyph}
                symbol="ᛉ"
              />
              <FlytingStudioSeat
                bot={againstBot}
                fallback="#ff5f8f"
                label="Con · right"
                name={againstBot?.name ?? "Uncast Con"}
                renderBotGlyph={props.renderBotGlyph}
              />
            </div>
            <p>{bout?.stakes || "The bout has not been forged yet."}</p>
            <small>
              Sporting · cutting · four exchanges · one decisive winner
            </small>
          </section>

          <section
            className={`${studioStyles.readinessPanel} ${styles.proceedingCard}`}
          >
            <div className={studioStyles.setupCopy}>
              <p className={studioStyles.eyebrow}>Proceeding card</p>
              <h2>{proceedingTitle}</h2>
              <p>
                Summon, Cast, Forge, and Review form one editable Flyting
                contest. Start freezes the Hall and its public record.
              </p>
            </div>
            <div className={studioStyles.reviewGrid}>
              <article>
                <span>Role</span>
                <strong>{roleLabel}</strong>
                <p>
                  {playerRole === "judge"
                    ? "Your ruling is the fifth word"
                    : playerRole === "participant"
                      ? "Write through a bot body and voice"
                      : "The cast carries every exchange"}
                </p>
              </article>
              <article>
                <span>Cast</span>
                <strong>
                  {castReady ? "Duel cast ready" : "Choose Pro and Con"}
                </strong>
                <p>
                  Pro · {forBot?.name ?? "Uncast"} · Con ·{" "}
                  {againstBot?.name ?? "Uncast"}
                </p>
              </article>
              <article>
                <span>Bout</span>
                <strong>{bout?.title || "Not yet forged"}</strong>
                <p>
                  {bout
                    ? "Editable legends and stakes"
                    : "PRISM will shape the public record"}
                </p>
              </article>
              <article>
                <span>Room</span>
                <strong>Flyting · Mead Hall</strong>
                <p>
                  No timer · four exchanges · fifteen swayed voices · three Jarl
                  guards
                </p>
              </article>
            </div>
            <div className={studioStyles.setupActions}>
              <span className={studioStyles.launchThreshold}>
                {consentReady
                  ? "Both flyters consent. The Hall can open."
                  : bout
                    ? "Secure both flyters’ consent to continue."
                    : "Forge the bout to prepare consent and Start."}
              </span>
              <button
                type="button"
                className={studioStyles.secondaryButton}
                disabled={busy || !consentReady}
                onClick={() => void createBout(true)}
              >
                Save for later
              </button>
              <button
                type="button"
                className={`${studioStyles.primaryButton} ${styles.openHallAction}`}
                disabled={busy || !consentReady}
                onClick={() => void createBout(false)}
              >
                Open the Hall
              </button>
            </div>
          </section>
        </aside>
      </div>
      {stageLayoutOpen &&
      DEBATE_FLYTING_STAGE_LAYOUT_AUTHORING_ENABLED &&
      typeof document !== "undefined"
        ? createPortal(
            <div
              className={styles.stageAlignmentModal}
              data-theme={stagePreviewTheme}
              data-flyting-stage-rehearsal="true"
              role="dialog"
              aria-modal="true"
              aria-label="Rehearse the Mead Hall"
            >
              <FlytingSetupStageAlignmentPreview
                forBot={forBot}
                hostBot={needsBotHost ? hostBot : undefined}
                againstBot={againstBot}
                view={stageLayoutView}
                item={stageLayoutItem}
                alignment={stageLayoutDraft}
                galleryBotScale={stageGalleryBotScale}
                galleryMaxVerticalRoam={stageGalleryMaxVerticalRoam}
                galleryVotes={stageGalleryVotes}
                onClose={() => setStageLayoutOpen(false)}
                onSelectItem={setStageLayoutItem}
                onToggleTheme={() =>
                  setStagePreviewTheme((current) =>
                    current === "light" ? "dark" : "light",
                  )
                }
                onUpdatePlacement={updateStageLayoutPlacement}
                renderBotAvatar={props.renderBotAvatar}
                renderBotGlyph={props.renderBotGlyph}
                theme={stagePreviewTheme}
              />
              <aside
                className={styles.stageAlignmentPanel}
                data-flyting-stage-alignment="true"
                data-flyting-stage-alignment-context="setup"
                aria-label="Flyting stage fine tuning"
              >
                <header>
                  <div>
                    <span>Fine tuning</span>
                    <h2>
                      {stageLayoutView === "moderator"
                        ? "Jarl layout"
                        : "Wide + gallery layout"}
                    </h2>
                  </div>
                </header>
                <div className={styles.stageAlignmentTabs} role="tablist">
                  {(
                    [
                      ["wide", "Wide"],
                      ["moderator", "Jarl"],
                    ] as const
                  ).map(([view, label]) => (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={stageLayoutView === view}
                      data-selected={
                        stageLayoutView === view ? "true" : undefined
                      }
                      onClick={() => chooseStageLayoutView(view)}
                      key={view}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {stageLayoutView === "wide" ? (
                  <section
                    className={styles.stageAlignmentGalleryControls}
                    aria-label="Gallery rehearsal controls"
                  >
                    <div
                      className={`${styles.stageAlignmentVoteControls} ${styles.stageAlignmentPanelVotes}`}
                      data-flyting-preview-vote-controls="true"
                    >
                      <button
                        type="button"
                        data-side="for"
                        disabled={
                          stageGalleryVoteCounts.for >=
                          DEBATE_FLYTING_AUDIENCE_COUNT
                        }
                        onClick={() => addStageGalleryVote("for")}
                        aria-label={`Add one gallery vote for ${forBot?.name ?? "the Pro flyter"}`}
                        style={
                          {
                            "--flyting-vote-color": flytingStageColor(
                              forBot,
                              "#d8b25d",
                              stagePreviewTheme,
                            ),
                          } as CSSProperties
                        }
                      >
                        <span>{forBot?.name ?? "Pro"}</span>
                        <b aria-hidden="true">↑</b>
                        <em>{stageGalleryVoteCounts.for}</em>
                      </button>
                      <output>{stageGalleryVoteCounts.neutral} neutral</output>
                      <button
                        type="button"
                        data-side="against"
                        disabled={
                          stageGalleryVoteCounts.against >=
                          DEBATE_FLYTING_AUDIENCE_COUNT
                        }
                        onClick={() => addStageGalleryVote("against")}
                        aria-label={`Add one gallery vote for ${againstBot?.name ?? "the Con flyter"}`}
                        style={
                          {
                            "--flyting-vote-color": flytingStageColor(
                              againstBot,
                              "#c56b53",
                              stagePreviewTheme,
                            ),
                          } as CSSProperties
                        }
                      >
                        <span>{againstBot?.name ?? "Con"}</span>
                        <b aria-hidden="true">↑</b>
                        <em>{stageGalleryVoteCounts.against}</em>
                      </button>
                    </div>
                    <label
                      className={styles.stageAlignmentGalleryScale}
                      data-flyting-preview-gallery-scale="true"
                    >
                      <span>Gallery bot size</span>
                      <div>
                        <input
                          type="range"
                          min={60}
                          max={160}
                          step={5}
                          value={stageGalleryBotScale}
                          onChange={(event) =>
                            setStageGalleryBotScale(
                              Number(event.currentTarget.value),
                            )
                          }
                          aria-label="Gallery bot size"
                        />
                        <output>{stageGalleryBotScale}%</output>
                      </div>
                    </label>
                    <label className={styles.stageAlignmentGalleryScale}>
                      <span>Maximum vertical roam</span>
                      <div>
                        <input
                          type="range"
                          min={0}
                          max={
                            DEBATE_FLYTING_GALLERY_AUTHORING_MAX_VERTICAL_ROAM_PERCENT
                          }
                          step={1}
                          value={stageGalleryMaxVerticalRoam}
                          onChange={(event) =>
                            setStageGalleryMaxVerticalRoam(
                              Number(event.currentTarget.value),
                            )
                          }
                          aria-label="Maximum random gallery vertical roam"
                        />
                        <output>{stageGalleryMaxVerticalRoam}%</output>
                      </div>
                    </label>
                  </section>
                ) : null}
                <label className={styles.stageAlignmentSelect}>
                  <span>Element</span>
                  <select
                    value={stageLayoutItem}
                    onChange={(event) =>
                      setStageLayoutItem(
                        event.currentTarget
                          .value as DebateFlytingStageAlignmentItem,
                      )
                    }
                  >
                    {stageLayoutItems.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className={styles.stageAlignmentHint}>
                  Drag the selected outline onstage, then use these fields for
                  the final nudge.
                </p>
                <div className={styles.stageAlignmentFields}>
                  {(
                    [
                      ["x", "X", 0.25],
                      ["y", "Y", 0.25],
                      ["scale", "Scale", 1],
                    ] as const
                  ).map(([field, label, step]) => (
                    <label key={field}>
                      <span>{label}</span>
                      <input
                        type="number"
                        value={stageLayoutPlacement[field]}
                        step={step}
                        onChange={(event) =>
                          updateStageLayoutPlacement(stageLayoutItem, {
                            [field]: Number(event.currentTarget.value),
                          })
                        }
                      />
                      <em>%</em>
                    </label>
                  ))}
                  {stageLayoutDefinition.supportsRotation ? (
                    <label>
                      <span>Rotate</span>
                      <input
                        type="number"
                        value={stageLayoutPlacement.rotation}
                        step={0.25}
                        onChange={(event) =>
                          updateStageLayoutPlacement(stageLayoutItem, {
                            rotation: Number(event.currentTarget.value),
                          })
                        }
                      />
                      <em>°</em>
                    </label>
                  ) : null}
                  {stageLayoutDefinition.supportsSkew ? (
                    <label>
                      <span>Skew X</span>
                      <input
                        type="number"
                        value={stageLayoutPlacement.skewX}
                        step={0.25}
                        onChange={(event) =>
                          updateStageLayoutPlacement(stageLayoutItem, {
                            skewX: Number(event.currentTarget.value),
                          })
                        }
                      />
                      <em>°</em>
                    </label>
                  ) : null}
                </div>
                <div className={styles.stageAlignmentActions}>
                  <button
                    type="button"
                    onClick={() =>
                      updateStageLayoutPlacement(
                        stageLayoutItem,
                        DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements[
                          stageLayoutItem
                        ],
                      )
                    }
                  >
                    Reset element
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStageLayoutDraft(
                        copyDebateFlytingStageAlignment(
                          DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT,
                        ),
                      );
                      setStageGalleryBotScale(100);
                      setStageGalleryMaxVerticalRoam(
                        DEBATE_FLYTING_GALLERY_DEFAULT_MAX_VERTICAL_ROAM_PERCENT,
                      );
                      setStageGalleryVotes({ for: 0, against: 0 });
                      setStageLayoutCopyState("idle");
                    }}
                  >
                    Reset all
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.stageAlignmentCopyButton}
                  onClick={() => void copyStageLayout()}
                >
                  {stageLayoutCopyState === "copied"
                    ? "Copied — send me the values"
                    : stageLayoutCopyState === "failed"
                      ? "Copy failed — retry"
                      : "Copy alignment values"}
                </button>
              </aside>
            </div>,
            document.body,
          )
        : null}
    </main>
  );
}

function flytingState(session: DebateSessionV1): DebateFlytingFormatStateV1 {
  if (session.formatState.format !== "flyting") {
    throw new Error("Expected a Flyting session.");
  }
  // Archive list rows may hold the exact schema that was saved before the
  // fifteen-member Hall existed. Normalize again at the presentation boundary
  // so old replays gain the new neutral crowd without a destructive migration.
  return normalizeDebateFlytingFormatStateV1(session.formatState);
}

function sideName(session: DebateSessionV1, sideId: DebateSideId): string {
  return sideId === "for"
    ? session.forAdvocate.name
    : session.againstAdvocate.name;
}

function resolutionLabel(value: string | null): string {
  return value
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : "Awaiting answer";
}

export function DebateFlytingLive(
  props: DebateFlytingLiveProps,
): React.JSX.Element {
  const state = flytingState(props.session);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presentingEvent, setPresentingEvent] = useState<DebateEventV1 | null>(
    null,
  );
  const [speechTiming, setSpeechTiming] =
    useState<DebateBotAvatarState["speechTiming"]>(null);
  const [voiceActiveEventId, setVoiceActiveEventId] = useState<string | null>(
    null,
  );
  const [withheldRecordEventIds, setWithheldRecordEventIds] = useState<
    Set<string>
  >(() => new Set());
  const [fallbackMouthPhase, setFallbackMouthPhase] = useState(0);
  const [galleryMouthPhase, setGalleryMouthPhase] = useState(0);
  const [galleryHopWave, setGalleryHopWave] = useState(0);
  const [cameraMode, setCameraMode] = useState<FlytingCameraMode>("auto");
  const [stageAlignmentOpen, setStageAlignmentOpen] = useState(false);
  const [stageAlignmentView, setStageAlignmentView] =
    useState<DebateFlytingStageRehearsalView>("wide");
  const [stageAlignmentItem, setStageAlignmentItem] =
    useState<DebateFlytingStageAlignmentItem>("wideForBot");
  const [stageAlignmentDraft, setStageAlignmentDraft] =
    useState<DebateFlytingStageAlignmentV1>(() =>
      copyDebateFlytingStageAlignment(DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT),
    );
  const [stageAlignmentCopyState, setStageAlignmentCopyState] = useState<
    "idle" | "copied" | "failed"
  >("idle");
  const stageAlignmentDragRef = useRef<{
    item: DebateFlytingStageAlignmentItem;
    pointerId: number;
    clientX: number;
    clientY: number;
    parentWidth: number;
    parentHeight: number;
    placement: DebateFlytingStagePlacementV1;
  } | null>(null);
  const [draft, setDraft] = useState("");
  const [authoredMode, setAuthoredMode] =
    useState<Exclude<DebateFlytingAuthoredModeV1, "bot">>("custom");
  const [facetId, setFacetId] = useState("");
  const [targetClaimId, setTargetClaimId] = useState("");
  const [lens, setLens] = useState<DebateFlytingChargeKindV1>("doubt");
  const [maneuver, setManeuver] = useState<DebateFlytingManeuverV1>("stand");
  const [returnClaimId, setReturnClaimId] = useState("");
  const [winnerSideId, setWinnerSideId] = useState<DebateSideId>("for");
  const autoTimerRef = useRef<number | null>(null);
  const mutateRef = useRef<
    (body: Record<string, unknown>, label: string) => Promise<void>
  >(async () => undefined);

  const stageAlignmentItems = useMemo(
    () => debateFlytingStageRehearsalItems(stageAlignmentView),
    [stageAlignmentView],
  );
  const stageAlignmentDefinition =
    DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.find(
      (item) => item.id === stageAlignmentItem,
    ) ?? DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS[0]!;
  const stageAlignmentPlacement =
    stageAlignmentDraft.placements[stageAlignmentItem];

  const chooseStageAlignmentView = useCallback(
    (view: DebateFlytingStageRehearsalView): void => {
      setStageAlignmentView(view);
      setStageAlignmentItem(debateFlytingStageRehearsalItems(view)[0]!.id);
      setCameraMode(view === "moderator" ? "moderator" : "wide");
    },
    [],
  );

  const updateStageAlignmentPlacement = useCallback(
    (
      item: DebateFlytingStageAlignmentItem,
      update: Partial<DebateFlytingStagePlacementV1>,
    ): void => {
      setStageAlignmentDraft((current) =>
        updateDebateFlytingStagePlacement(current, item, update),
      );
      setStageAlignmentCopyState("idle");
    },
    [],
  );

  const beginStageAlignmentDrag = useCallback(
    (
      event: ReactPointerEvent<HTMLElement>,
      item: DebateFlytingStageAlignmentItem,
    ): void => {
      if (!stageAlignmentOpen || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const parent = event.currentTarget.offsetParent;
      if (!(parent instanceof HTMLElement)) return;
      const parentBounds = parent.getBoundingClientRect();
      stageAlignmentDragRef.current = {
        item,
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        parentWidth: Math.max(1, parentBounds.width),
        parentHeight: Math.max(1, parentBounds.height),
        placement: stageAlignmentDraft.placements[item],
      };
      setStageAlignmentItem(item);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [stageAlignmentDraft.placements, stageAlignmentOpen],
  );

  const moveStageAlignmentDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const drag = stageAlignmentDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      updateStageAlignmentPlacement(drag.item, {
        x:
          drag.placement.x +
          ((event.clientX - drag.clientX) / drag.parentWidth) * 100,
        y:
          drag.placement.y +
          ((event.clientY - drag.clientY) / drag.parentHeight) * 100,
      });
    },
    [updateStageAlignmentPlacement],
  );

  const endStageAlignmentDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>): void => {
      const drag = stageAlignmentDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      stageAlignmentDragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [],
  );

  const stageAlignmentHandleProps = (
    item: DebateFlytingStageAlignmentItem,
  ): {
    "data-flyting-alignment-handle"?: "true";
    "data-flyting-alignment-selected"?: "true";
    onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerUp?: (event: ReactPointerEvent<HTMLElement>) => void;
    onPointerCancel?: (event: ReactPointerEvent<HTMLElement>) => void;
  } =>
    stageAlignmentOpen &&
    DEBATE_FLYTING_STAGE_ALIGNMENT_ITEMS.some(
      (definition) =>
        definition.id === item &&
        debateFlytingStageRehearsalViewForItem(definition) ===
          stageAlignmentView,
    )
      ? {
          "data-flyting-alignment-handle": "true",
          "data-flyting-alignment-selected":
            stageAlignmentItem === item ? "true" : undefined,
          onPointerDown: (event) => beginStageAlignmentDrag(event, item),
          onPointerMove: moveStageAlignmentDrag,
          onPointerUp: endStageAlignmentDrag,
          onPointerCancel: endStageAlignmentDrag,
        }
      : {};

  const copyStageAlignment = useCallback(async (): Promise<void> => {
    try {
      await writeFlytingAlignmentClipboard(
        formatDebateFlytingStageAlignmentClipboard(stageAlignmentDraft),
      );
      setStageAlignmentCopyState("copied");
    } catch {
      setStageAlignmentCopyState("failed");
    }
  }, [stageAlignmentDraft]);

  const activeExchange = state.exchanges[state.activeExchangeIndex];
  const floorFlyter = state.floorSideId
    ? state.bout?.flyters.find((flyter) => flyter.sideId === state.floorSideId)
    : null;
  const unusedFacets =
    floorFlyter?.legend.filter(
      (facet) =>
        !state.exchanges.some(
          (exchange) => exchange.boast?.legendFacetId === facet.id,
        ),
    ) ?? [];
  const opponentClaims = state.exchanges
    .map((exchange) => exchange.boast)
    .filter((boast): boast is NonNullable<typeof boast> =>
      Boolean(boast && boast.sideId !== state.floorSideId),
    );

  useEffect(() => {
    if (voiceActiveEventId === null || speechTiming !== null) return;
    const intervalId = window.setInterval(() => {
      setFallbackMouthPhase((current) => (current + 1) % 2);
    }, 150);
    return () => window.clearInterval(intervalId);
  }, [speechTiming, voiceActiveEventId]);

  useEffect(() => {
    setDraft("");
    setAuthoredMode("custom");
    setFacetId(unusedFacets[0]?.id ?? "");
    setTargetClaimId(activeExchange?.boast?.id ?? opponentClaims[0]?.id ?? "");
    setLens("doubt");
    setManeuver("stand");
    setReturnClaimId(opponentClaims[0]?.id ?? "");
    setWinnerSideId(
      state.hallMembers.filter((member) => member.leaning === "for").length >=
        state.hallMembers.filter((member) => member.leaning === "against")
          .length
        ? "for"
        : "against",
    );
  }, [props.session.revision]);

  const adoptWithPresentation = useCallback(
    async (next: DebateSessionV1, priorSequence: number): Promise<void> => {
      const events = next.events.filter(
        (event) => event.sequence > priorSequence,
      );
      if (events.length > 0) {
        setWithheldRecordEventIds((current) => {
          const updated = new Set(current);
          events.forEach((event) => updated.add(event.id));
          return updated;
        });
      }
      props.onSessionChange(next);
      for (const event of events) {
        const cue = debateFlytingRitualCueForEvent(event);
        if (cue && props.audioEnabled) {
          playDebateFlytingRitualCue(cue, props.audioVolume);
        }
        const spokenText = debateSpokenText(event.content).trim();
        if (event.speakerBotId && spokenText) {
          setPresentingEvent(event);
          setSpeechTiming(null);
        }
        const clearPresentation = (): void => {
          setPresentingEvent((current) =>
            current?.id === event.id ? null : current,
          );
          setVoiceActiveEventId((current) =>
            current === event.id ? null : current,
          );
          setSpeechTiming(null);
        };
        try {
          await props.playEvent(event, next, {
            onStart: (durationMs, alignment) => {
              if (!event.speakerBotId || !spokenText) return;
              setVoiceActiveEventId(event.id);
              if (durationMs === null) return;
              setSpeechTiming({
                text: spokenText,
                elapsedMs: 0,
                durationMs,
                alignment: alignment ?? null,
              });
            },
            onProgress: (elapsedMs, durationMs) => {
              if (!event.speakerBotId || !spokenText) return;
              setVoiceActiveEventId(event.id);
              setSpeechTiming((current) => ({
                text: spokenText,
                elapsedMs,
                durationMs,
                alignment: current?.alignment ?? null,
              }));
            },
            onEnd: clearPresentation,
            onCancel: clearPresentation,
          });
        } finally {
          clearPresentation();
          setWithheldRecordEventIds((current) => {
            if (!current.has(event.id)) return current;
            const updated = new Set(current);
            updated.delete(event.id);
            return updated;
          });
        }
      }
    },
    [
      props.audioEnabled,
      props.audioVolume,
      props.onSessionChange,
      props.playEvent,
    ],
  );

  const mutate = useCallback(
    async (body: Record<string, unknown>, label: string): Promise<void> => {
      if (busy) return;
      setBusy(true);
      setError(null);
      const priorSequence = props.session.events.at(-1)?.sequence ?? 0;
      try {
        const result = await props.request<{ session: DebateSessionV1 }>(
          `/api/debates/${encodeURIComponent(props.session.id)}/flyting-action`,
          jsonBody({
            ...body,
            expectedRevision: props.session.revision,
            idempotencyKey: flytingMutationKey(label),
          }),
        );
        await adoptWithPresentation(result.session, priorSequence);
      } catch (caught) {
        setError(
          caught instanceof Error
            ? caught.message
            : "The Hall could not record that action.",
        );
      } finally {
        setBusy(false);
      }
    },
    [adoptWithPresentation, busy, props.request, props.session],
  );

  useEffect(() => {
    mutateRef.current = mutate;
  }, [mutate]);

  useEffect(() => {
    if (
      busy ||
      props.session.status !== "live" ||
      state.expectedAction !== "advance"
    )
      return;
    autoTimerRef.current = window.setTimeout(() => {
      autoTimerRef.current = null;
      void mutateRef.current({ action: "advance" }, "advance");
    }, 720);
    return () => {
      if (autoTimerRef.current !== null)
        window.clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    };
  }, [
    busy,
    props.session.status,
    props.session.revision,
    state.expectedAction,
  ]);

  const wield = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await props.request<{ content: string }>(
        `/api/debates/${encodeURIComponent(props.session.id)}/flyting-wield`,
        jsonBody({
          expectedRevision: props.session.revision,
          action: state.expectedAction,
          legendFacetId: facetId || null,
          targetClaimId: targetClaimId || null,
          lens,
          targetChallengeId: activeExchange?.challenge?.id ?? null,
          maneuver,
          returnClaimId: maneuver === "return" ? returnClaimId || null : null,
          winnerSideId:
            state.expectedAction === "host_verdict" ? winnerSideId : null,
        }),
      );
      setDraft(result.content);
      setAuthoredMode("wielded");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "PRISM could not shape a draft.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submitPlayerAction = (): void => {
    if (state.expectedAction === "boast") {
      void mutate(
        {
          action: "boast",
          legendFacetId: facetId,
          content: draft,
          authoredMode,
        },
        "boast",
      );
    } else if (state.expectedAction === "challenge") {
      void mutate(
        {
          action: "challenge",
          targetClaimId,
          lens,
          content: draft,
          authoredMode,
        },
        "challenge",
      );
    } else if (state.expectedAction === "rejoinder") {
      void mutate(
        {
          action: "rejoinder",
          targetChallengeId: activeExchange?.challenge?.id ?? null,
          maneuver,
          returnClaimId: maneuver === "return" ? returnClaimId : null,
          content: draft,
          authoredMode,
        },
        "rejoinder",
      );
    } else if (state.expectedAction === "host_verdict") {
      void mutate(
        { action: "host_verdict", winnerSideId, content: draft, authoredMode },
        "host-verdict",
      );
    }
  };

  const pauseOrResume = async (): Promise<void> => {
    if (busy || props.session.status === "completed") return;
    setBusy(true);
    setError(null);
    try {
      const action = props.session.status === "paused" ? "resume" : "pause";
      const result = await props.request<{ session: DebateSessionV1 }>(
        `/api/debates/${encodeURIComponent(props.session.id)}/${action}`,
        jsonBody({
          expectedRevision: props.session.revision,
          idempotencyKey: flytingMutationKey(action),
          presentationEventId: props.session.events.at(-1)?.id ?? null,
          quietSave: true,
        }),
      );
      props.onSessionChange(result.session);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The Hall could not change its pace.",
      );
    } finally {
      setBusy(false);
    }
  };

  const forColor = flytingStageColor(
    props.session.forAdvocate,
    "#d8b25d",
    props.theme,
  );
  const againstColor = flytingStageColor(
    props.session.againstAdvocate,
    "#c56b53",
    props.theme,
  );
  const hostColor = flytingStageColor(
    props.session.moderator,
    "#9f8a68",
    props.theme,
  );
  const hallPresentation = debateFlytingHallPresentation(
    state,
    props.session.status,
  );
  const galleryIsSubdued =
    hallPresentation.galleryIsQuiet || voiceActiveEventId !== null;
  const hallNpcBots = useMemo(
    () =>
      debateFlytingHallNpcBots(
        props.session.id,
        DEBATE_FLYTING_AUDIENCE_COUNT + DEBATE_FLYTING_JARL_GUARD_COUNT,
      ),
    [props.session.id],
  );
  const hallAudienceMilling = useMemo(
    () =>
      Array.from(
        {
          length:
            DEBATE_FLYTING_AUDIENCE_COUNT + DEBATE_FLYTING_JARL_GUARD_COUNT,
        },
        (_, index) =>
          debateFlytingAudienceMillingPlan(
            `${props.session.id}:hall-seat-${index}`,
            debateAudienceSeatLayout(
              index,
              DEBATE_FLYTING_AUDIENCE_COUNT + DEBATE_FLYTING_JARL_GUARD_COUNT,
            ).depthRow,
          ),
      ),
    [props.session.id],
  );
  const hallAudienceSeats = useMemo(
    () => [
      ...state.hallMembers.map((member, index) => ({
        id: member.id,
        bot: hallNpcBots[index]!,
        index,
        leaning: member.leaning,
        guard: false,
      })),
      ...state.jarlGuards.map((guard, guardIndex) => ({
        id: guard.id,
        bot: hallNpcBots[DEBATE_FLYTING_AUDIENCE_COUNT + guardIndex]!,
        index: DEBATE_FLYTING_AUDIENCE_COUNT + guardIndex,
        leaning: (guard.sideId ?? "neutral") as DebateFlytingHallLeaningV1,
        guard: true,
      })),
    ],
    [hallNpcBots, state.hallMembers, state.jarlGuards],
  );
  const hallLeaningCounts = useMemo(
    () => ({
      for: state.hallMembers.filter((member) => member.leaning === "for")
        .length,
      neutral: state.hallMembers.filter(
        (member) => member.leaning === "neutral",
      ).length,
      against: state.hallMembers.filter(
        (member) => member.leaning === "against",
      ).length,
    }),
    [state.hallMembers],
  );
  const fireColor =
    hallPresentation.fireSeatId === "host"
      ? hostColor
      : hallPresentation.fireSeatId === "for"
        ? forColor
        : againstColor;
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setGalleryMouthPhase((current) => (current + 1) % 4);
    }, 170);
    return () => window.clearInterval(intervalId);
  }, []);
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setGalleryHopWave((current) => (current + 1) % 198);
    }, 1_450);
    return () => window.clearInterval(intervalId);
  }, []);
  const exchangeProgress =
    state.phase === "final_acclamation" ||
    state.phase === "verdict" ||
    state.phase === "complete"
      ? 4
      : state.activeExchangeIndex + 1;
  const voiceActiveEvent =
    voiceActiveEventId === presentingEvent?.id ? presentingEvent : null;
  const autoCameraView = flytingAutoCameraView(
    voiceActiveEvent?.speakerBotId ?? null,
    {
      forBotId: props.session.forAdvocate.id,
      againstBotId: props.session.againstAdvocate.id,
      moderatorBotId: props.session.moderator.id,
    },
  );
  const cameraView: FlytingCameraView =
    cameraMode === "auto" ? autoCameraView : cameraMode;
  const activeStageRole =
    autoCameraView === "left"
      ? "for"
      : autoCameraView === "right"
        ? "against"
        : autoCameraView === "moderator"
          ? "moderator"
          : null;
  const fallbackMouthShape: DebateBotAvatarState["foleyMouthShape"] =
    voiceActiveEvent && speechTiming === null
      ? fallbackMouthPhase === 0
        ? "open-small"
        : "speech-closed"
      : null;
  const eventIsAudiblyActive = (botId: string): boolean =>
    voiceActiveEvent?.speakerBotId === botId;
  const renderHallAvatar = (
    bot: DebateBotSnapshotV1,
    role: "for" | "against" | "moderator" | "audience",
    options: {
      presentation: "full" | "mini";
      talking?: boolean;
      thinking?: boolean;
      foleyMouthShape?: DebateBotAvatarState["foleyMouthShape"];
      facing?: DebateBotAvatarState["facing"];
      listenerReaction?: DebateBotAvatarState["listenerReaction"];
    },
  ): ReactNode =>
    props.renderBotAvatar?.(bot, {
      role,
      lookAtRole:
        role === "for"
          ? "against"
          : role === "against"
            ? "for"
            : role === "moderator"
              ? state.floorSideId
              : null,
      consumer: role === "audience" ? "gallery" : "forum",
      presentation: options.presentation,
      talking: options.talking === true,
      thinking: options.thinking === true,
      voiceLevel: 1,
      colorCycle: false,
      speechTiming: options.talking ? speechTiming : null,
      foleyMouthShape:
        options.foleyMouthShape ??
        (options.talking ? fallbackMouthShape : null),
      listenerReaction: options.listenerReaction ?? null,
      blinkEnabled: true,
      facing: options.facing,
      speechInkVisible: options.talking === true,
    }) ??
    props.renderBotGlyph(bot.glyph, {
      size: options.presentation === "full" ? 84 : 21,
      strokeWidth: 1.2,
    });

  return (
    <main
      className={`${studioStyles.live} ${styles.liveShell}`}
      data-debate-surface="live"
      data-debate-format="flyting"
      data-theme={props.theme}
      data-status={props.session.status}
      data-session-status={props.session.status}
      data-tutorial-target="debate-flyting-live"
      style={
        {
          "--flyting-for": forColor,
          "--flyting-against": againstColor,
          "--debate-active-color": fireColor,
          "--debate-for-color": forColor,
          "--debate-against-color": againstColor,
          "--debate-moderator-color": hostColor,
          // The authored color keys resolve here, before anything reaches the
          // playable Hall: left → Pro, host → Jarl, right → Con.
          "--flyting-lane-left": forColor,
          "--flyting-lane-host": hostColor,
          "--flyting-lane-right": againstColor,
        } as CSSProperties
      }
    >
      <SessionAtmosphereLayer
        active={props.audioEnabled && props.audioVolume > 0}
        sessionKey={`debate-flyting-gallery:${props.session.id}`}
        volume={props.audioVolume}
        backgroundUrl={DEBATE_AUDIENCE_MURMUR_URL}
        grainUrl={DEBATE_AUDIENCE_CROSSTALK_URL}
        backgroundTone="warm-low"
        mix={
          galleryIsSubdued
            ? { background: 0.08, grain: 0.018, foley: 0 }
            : { background: 0.15, grain: 0.085, foley: 0 }
        }
        mixTransitionMs={260}
        lifecycleTransitionMs={320}
        ambientFoley={false}
      />
      <header className={`${studioStyles.liveHeader} ${styles.liveHeader}`}>
        <div className={styles.liveHeaderDockSpace} aria-hidden="true" />
        <div>
          <p>Flyting · Mead Hall</p>
          <h1>
            {props.session.forAdvocate.name} vs.{" "}
            {props.session.againstAdvocate.name}
          </h1>
          <span>{state.bout?.stakes}</span>
        </div>
        <div className={styles.liveHeaderActions}>
          <span>Exchange {exchangeProgress} / 4</span>
          {props.session.status !== "completed" ? (
            <button
              type="button"
              onClick={() => void pauseOrResume()}
              disabled={busy}
            >
              {props.session.status === "paused" ? "Resume" : "Pause"}
            </button>
          ) : (
            <strong>Recorded</strong>
          )}
        </div>
      </header>

      <div className={`${studioStyles.liveWorkspace} ${styles.courtWorkspace}`}>
        <div className={studioStyles.stageColumn}>
          <section
            className={`${studioStyles.forum} ${styles.hallStage} ${styles.courtStage}`}
            aria-label="Mead Hall stage"
            data-debate-stage-viewport="live"
          >
            <div
              className={`${studioStyles.forumCamera} ${styles.hallCamera}`}
              data-camera-view={cameraView}
              data-camera-mode={cameraMode}
              data-camera-transition={cameraMode === "auto" ? "cut" : "move"}
              data-active-role={activeStageRole ?? undefined}
            >
              <FlytingRgbKeyedBackdrop
                scene={cameraView === "moderator" ? "jarl" : "wide"}
                theme={props.theme}
                proColor={forColor}
                jarlColor={hostColor}
                conColor={againstColor}
              />
              <div className={styles.hallHeraldryGlyphs} aria-hidden="true">
                {(
                  [
                    ["for", props.session.forAdvocate, forColor],
                    ["moderator", props.session.moderator, hostColor],
                    ["against", props.session.againstAdvocate, againstColor],
                  ] as const
                ).map(([role, bot, color]) => {
                  const item = flytingStageAlignmentItemFor(
                    cameraView === "moderator" ? "moderator" : "wide",
                    role,
                    "heraldry",
                  );
                  const placement = item
                    ? stageAlignmentDraft.placements[item]
                    : DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements
                        .wideForHeraldry;
                  return (
                    <span
                      data-role={role}
                      key={`banner-glyph:${role}:${bot.id}`}
                      style={
                        {
                          "--flyting-bot-color": color,
                          ...flytingAlignmentStyle(placement),
                        } as CSSProperties
                      }
                      {...(item ? stageAlignmentHandleProps(item) : {})}
                    >
                      {props.renderBotGlyph(bot.glyph, {
                        size: role === "moderator" ? 30 : 38,
                        strokeWidth: 1.35,
                      })}
                    </span>
                  );
                })}
              </div>
              <div className={styles.hallFixtureLight} aria-hidden="true" />
              {(
                [
                  ["for", props.session.forAdvocate, forColor, "Pro"],
                  ["moderator", props.session.moderator, hostColor, "Jarl"],
                  [
                    "against",
                    props.session.againstAdvocate,
                    againstColor,
                    "Con",
                  ],
                ] as const
              ).map(([role, bot, color, roleLabel]) => {
                const flyter =
                  role === "moderator"
                    ? null
                    : state.bout?.flyters.find(
                        (candidate) => candidate.sideId === role,
                      );
                const talking = eventIsAudiblyActive(bot.id);
                const thinking =
                  busy &&
                  presentingEvent === null &&
                  (role === "moderator"
                    ? state.expectedAction === "host_verdict"
                    : state.floorSideId === role);
                const avatarPresentation =
                  role === "moderator" && cameraView !== "moderator"
                    ? "mini"
                    : "full";
                const alignmentCameraView =
                  cameraView === "moderator" ? "moderator" : "wide";
                const botItem =
                  flytingStageAlignmentItemFor(
                    alignmentCameraView,
                    role,
                    "bot",
                  ) ?? flytingStageAlignmentItemFor("wide", role, "bot")!;
                const helmetItem =
                  flytingStageAlignmentItemFor(
                    alignmentCameraView,
                    role,
                    "helmet",
                  ) ?? flytingStageAlignmentItemFor("wide", role, "helmet")!;
                const nameplateItem =
                  flytingStageAlignmentItemFor(
                    alignmentCameraView,
                    role,
                    "nameplate",
                  ) ?? flytingStageAlignmentItemFor("wide", role, "nameplate")!;
                const botPlacement = stageAlignmentDraft.placements[botItem];
                const helmetPlacement =
                  stageAlignmentDraft.placements[helmetItem];
                const nameplatePlacement =
                  stageAlignmentDraft.placements[nameplateItem];
                return (
                  <div key={`stage:${role}:${bot.id}`}>
                    <div
                      className={`${studioStyles.botPosition} ${styles.courtBotPosition}`}
                      data-role={role}
                      style={
                        {
                          "--flyting-bot-color": color,
                          ...flytingAlignmentStyle(botPlacement),
                        } as CSSProperties
                      }
                      {...stageAlignmentHandleProps(botItem)}
                    >
                      <div
                        className={studioStyles.botStagePresence}
                        data-speaking={talking ? "true" : undefined}
                        data-thinking={thinking ? "true" : undefined}
                        data-debate-stage-compact={
                          avatarPresentation === "mini" ? "true" : undefined
                        }
                        data-flyting-bot-avatar={
                          role === "moderator" ? "host" : role
                        }
                      >
                        {role !== "moderator" ? (
                          <span
                            className={styles.keyedVikingHelmet}
                            data-flyting-hall-asset="participant-helmet"
                            style={flytingAlignmentStyle(helmetPlacement)}
                            {...stageAlignmentHandleProps(helmetItem)}
                            aria-hidden="true"
                          />
                        ) : cameraView === "moderator" ? (
                          <span
                            className={styles.moderatorVikingHelmet}
                            data-flyting-hall-asset="moderator-helmet"
                            style={flytingAlignmentStyle(helmetPlacement)}
                            {...stageAlignmentHandleProps(helmetItem)}
                            aria-hidden="true"
                          />
                        ) : (
                          <span
                            className={styles.moderatorPixelVikingHelmet}
                            data-flyting-hall-asset="mini-pixel-crown"
                            style={flytingAlignmentStyle(helmetPlacement)}
                            {...stageAlignmentHandleProps(helmetItem)}
                            aria-hidden="true"
                          />
                        )}
                        {renderHallAvatar(bot, role, {
                          presentation: avatarPresentation,
                          talking,
                          thinking,
                        })}
                      </div>
                    </div>
                    <div
                      className={`${studioStyles.botIdentityPosition} ${styles.courtIdentityPosition}`}
                      data-role={role}
                      data-speaking={talking ? "true" : undefined}
                      style={flytingAlignmentStyle(nameplatePlacement)}
                      {...stageAlignmentHandleProps(nameplateItem)}
                    >
                      <div className={studioStyles.botIdentityPlate}>
                        <strong>
                          {role === "moderator" &&
                          props.session.playerRole === "judge"
                            ? "You hold the Hall"
                            : `${bot.name}${flyter?.epithet ? `, ${flyter.epithet}` : ""}`}
                        </strong>
                        <small>{roleLabel}</small>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div
              className={studioStyles.debaterFocusDepthOverlay}
              data-blur-side="right"
              data-camera-transition={cameraMode === "auto" ? "cut" : "move"}
              data-visible={cameraView === "left" ? "true" : "false"}
              aria-hidden="true"
            />
            <div
              className={studioStyles.debaterFocusDepthOverlay}
              data-blur-side="left"
              data-camera-transition={cameraMode === "auto" ? "cut" : "move"}
              data-visible={cameraView === "right" ? "true" : "false"}
              aria-hidden="true"
            />
            {voiceActiveEvent ? (
              <div
                className={styles.flytingCaption}
                role="status"
                aria-live="polite"
              >
                <strong>
                  {voiceActiveEvent.speakerBotId === props.session.moderator.id
                    ? props.session.moderator.name
                    : voiceActiveEvent.sideId
                      ? sideName(props.session, voiceActiveEvent.sideId)
                      : "The Hall"}
                </strong>
                <span>{debateSpokenText(voiceActiveEvent.content)}</span>
              </div>
            ) : null}
            <div
              className={studioStyles.floorStatus}
              data-kind={voiceActiveEvent?.kind ?? "waiting"}
              aria-live="polite"
            >
              <span>{voiceActiveEvent ? "On the floor" : "Mead Hall"}</span>
              <strong>
                {voiceActiveEvent?.speakerBotId === props.session.moderator.id
                  ? props.session.moderator.name
                  : autoCameraView === "left"
                    ? props.session.forAdvocate.name
                    : autoCameraView === "right"
                      ? props.session.againstAdvocate.name
                      : "The Hall awaits the word"}
              </strong>
            </div>
            <div
              className={studioStyles.cameraControls}
              aria-label="Flyting stage cameras"
              data-tutorial-target="debate-camera"
            >
              <span>Camera</span>
              {FLYTING_CAMERA_VIEWS.map((camera) => (
                <button
                  type="button"
                  data-selected={cameraMode === camera.id ? "true" : undefined}
                  aria-pressed={cameraMode === camera.id}
                  onClick={() => setCameraMode(camera.id)}
                  key={camera.id}
                >
                  {camera.label}
                </button>
              ))}
              {DEBATE_FLYTING_STAGE_LAYOUT_AUTHORING_ENABLED ? (
                <button
                  type="button"
                  className={styles.stageAlignmentLaunchButton}
                  data-selected={stageAlignmentOpen ? "true" : undefined}
                  aria-pressed={stageAlignmentOpen}
                  onClick={() => {
                    if (stageAlignmentOpen) {
                      setStageAlignmentOpen(false);
                      return;
                    }
                    setStageAlignmentOpen(true);
                    chooseStageAlignmentView("wide");
                  }}
                >
                  Align
                </button>
              ) : null}
            </div>
            {props.session.status !== "completed" ? (
              <div
                className={studioStyles.stageTransportControls}
                aria-label="Flyting stage transport"
              >
                <button
                  type="button"
                  className={studioStyles.stagePauseButton}
                  onClick={() => void pauseOrResume()}
                  disabled={busy}
                >
                  {props.session.status === "paused" ? "Play" : "Pause"}
                </button>
              </div>
            ) : null}
          </section>
          <section
            className={`${studioStyles.debateAudienceRow} ${styles.flytingCourtGallery}`}
            data-debate-audience="true"
            data-audience-placement="below-screen"
            data-audience-chattering="true"
            data-audience-talking-audio={
              props.audioEnabled ? "audible" : "silent"
            }
            data-audience-pressure={galleryIsSubdued ? "settled" : "restless"}
            data-audience-count={hallAudienceSeats.length}
            aria-label={`${DEBATE_FLYTING_AUDIENCE_COUNT} Hall spectators and ${DEBATE_FLYTING_JARL_GUARD_COUNT} Jarl guards`}
          >
            <div className={studioStyles.debateAudienceStatus}>
              <div
                className={studioStyles.debateAudienceIdentity}
                aria-live="polite"
                aria-atomic="true"
              >
                <span>Hall gallery</span>
                <strong>{galleryIsSubdued ? "Muttering" : "Rowdy"}</strong>
              </div>
              <span
                className={studioStyles.debateAudienceMeter}
                role="meter"
                aria-label="Hall rowdiness"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={galleryIsSubdued ? 42 : 100}
                aria-valuetext={galleryIsSubdued ? "Muttering" : "Rowdy"}
              >
                {[0, 1, 2, 3].map((level) => (
                  <i
                    key={level}
                    data-active={
                      galleryIsSubdued && level > 1 ? undefined : "true"
                    }
                    aria-hidden="true"
                  />
                ))}
              </span>
            </div>
            <FlytingRgbKeyedBackdrop
              scene="gallery"
              theme={props.theme}
              proColor={forColor}
              jarlColor={hostColor}
              conColor={againstColor}
            />
            <div className={styles.galleryRugGlyphs} aria-hidden="true">
              {(
                [
                  ["for", props.session.forAdvocate, forColor],
                  ["against", props.session.againstAdvocate, againstColor],
                ] as const
              ).map(([role, bot, color]) => {
                const item = flytingStageAlignmentItemFor(
                  "gallery",
                  role,
                  "rugGlyph",
                )!;
                return (
                  <span
                    data-role={role}
                    key={`rug-glyph:${role}:${bot.id}`}
                    style={
                      {
                        "--flyting-bot-color": color,
                        "--flyting-rug-glyph-color": color,
                        ...flytingAlignmentStyle(
                          stageAlignmentDraft.placements[item],
                        ),
                      } as CSSProperties
                    }
                    {...stageAlignmentHandleProps(item)}
                  >
                    {props.renderBotGlyph(bot.glyph, {
                      size: 58,
                      strokeWidth: 1.45,
                    })}
                  </span>
                );
              })}
            </div>
            {(["rear", "front"] as const).map((depthRow) => (
              <span
                className={`${studioStyles.debateAudienceLayer} ${styles.flytingAudienceLayer}`}
                data-depth-row={depthRow}
                key={depthRow}
                aria-hidden="true"
              >
                {(["for", "neutral", "against"] as const).map((leaning) => {
                  const clusterSeats = hallAudienceSeats.filter(
                    (seat) =>
                      seat.leaning === leaning &&
                      debateAudienceSeatLayout(
                        seat.index,
                        hallAudienceSeats.length,
                      ).depthRow === depthRow,
                  );
                  return (
                    <span
                      className={styles.flytingAudienceCluster}
                      data-flyting-leaning={leaning}
                      key={`${depthRow}:${leaning}`}
                    >
                      {clusterSeats.map((seat, clusterIndex) => {
                        const talking = galleryIsSubdued
                          ? (seat.index + galleryMouthPhase) % 9 === 0
                          : (seat.index + galleryMouthPhase) % 4 !== 0;
                        const hopping =
                          (seat.index * 5 + galleryHopWave) % 13 === 0;
                        const facing = debateAudienceConversationFacing(
                          clusterIndex,
                          clusterSeats.length,
                        );
                        const seatColor =
                          seat.leaning === "for"
                            ? forColor
                            : seat.leaning === "against"
                              ? againstColor
                              : hostColor;
                        const milling = hallAudienceMilling[seat.index]!;
                        return (
                          <span
                            className={styles.flytingAudienceMillingSlot}
                            key={seat.id}
                            style={
                              {
                                "--flyting-gallery-offset-x": `${milling.offsetXPercent}%`,
                                "--flyting-gallery-offset-y": `${milling.offsetYPercent}%`,
                                "--flyting-gallery-drift-x": `${milling.driftXPercent}%`,
                                "--flyting-gallery-drift-y": `${milling.driftYPercent}%`,
                                "--flyting-gallery-mill-duration": `${milling.durationMs}ms`,
                                "--flyting-gallery-mill-delay": `${milling.delayMs}ms`,
                                "--flyting-gallery-layer": milling.layer,
                              } as CSSProperties
                            }
                          >
                            <span
                              className={`${studioStyles.debateAudienceBotPortrait} ${styles.flytingAudiencePortrait}`}
                              data-talking={talking ? "true" : undefined}
                              data-audience-bounce={
                                hopping ? "true" : undefined
                              }
                              data-conversation-facing={facing}
                              data-gallery-arrived="true"
                              data-flyting-leaning={seat.leaning}
                              data-flyting-guard={
                                seat.guard ? "true" : undefined
                              }
                              style={
                                {
                                  "--flyting-bot-color": seatColor,
                                  "--debate-audience-depth": milling.depthScale,
                                  "--debate-audience-index": seat.index,
                                  "--debate-gallery-enter-x": "0%",
                                  "--debate-gallery-exit-x": "0%",
                                } as CSSProperties
                              }
                              title={
                                seat.guard ? "Jarl guard" : "Hall spectator"
                              }
                            >
                              <span
                                className={styles.galleryVikingHelmet}
                                data-flyting-hall-asset="mini-pixel-crown"
                                aria-hidden="true"
                              />
                              {renderHallAvatar(seat.bot, "audience", {
                                presentation: "mini",
                                talking: false,
                                foleyMouthShape: talking
                                  ? (seat.index + galleryMouthPhase) % 2 === 0
                                    ? "open-small"
                                    : "speech-closed"
                                  : null,
                                facing,
                                listenerReaction: hopping
                                  ? "divided"
                                  : "attentive",
                              })}
                              {seat.guard ? (
                                <span
                                  className={styles.jarlGuardMark}
                                  aria-hidden="true"
                                >
                                  III
                                </span>
                              ) : null}
                              {talking ? (
                                <span
                                  className={`${studioStyles.debateAudienceChatterChip} ${
                                    styles.flytingAudienceChatterChip
                                  }`}
                                  aria-hidden="true"
                                >
                                  ...
                                </span>
                              ) : null}
                            </span>
                          </span>
                        );
                      })}
                    </span>
                  );
                })}
              </span>
            ))}
          </section>
        </div>

        <div className={`${styles.liveLayout} ${styles.courtRail}`}>
          <section
            className={styles.hallRecord}
            data-tutorial-target="debate-flyting-record"
          >
            <header>
              <div>
                <small>Live transcript</small>
                <h2>Hall Record</h2>
              </div>
              <span>
                {
                  state.exchanges.filter((exchange) => exchange.resolution)
                    .length
                }{" "}
                answered exchanges
              </span>
            </header>
            <div className={styles.exchangeTrack}>
              {state.exchanges.map((exchange) => (
                <article
                  key={exchange.id}
                  data-active={
                    exchange.index === state.activeExchangeIndex &&
                    state.phase !== "complete"
                      ? "true"
                      : undefined
                  }
                  data-resolution={exchange.resolution ?? undefined}
                >
                  <header>
                    <span>Rune {exchange.index + 1}</span>
                    <strong>
                      {sideName(props.session, exchange.boastingSideId)} boasts
                    </strong>
                    <em>{resolutionLabel(exchange.resolution)}</em>
                  </header>
                  {exchange.boast &&
                  !withheldRecordEventIds.has(exchange.boast.createdEventId) ? (
                    <p>
                      <b>Boast</b>
                      {exchange.boast.content}
                    </p>
                  ) : (
                    <p className={styles.emptyRune}>The wood is unmarked.</p>
                  )}
                  {exchange.challenge &&
                  !withheldRecordEventIds.has(
                    exchange.challenge.createdEventId,
                  ) ? (
                    <p>
                      <b>
                        {CHALLENGE_LENSES.find(
                          (candidate) =>
                            candidate.id === exchange.challenge?.lens,
                        )?.label ?? "Challenge"}
                      </b>
                      {exchange.challenge.content}
                    </p>
                  ) : null}
                  {exchange.yielded ? (
                    <p className={styles.yieldRune}>
                      <b>Yield</b>The charge stands unanswered.
                    </p>
                  ) : exchange.rejoinder &&
                    !withheldRecordEventIds.has(
                      exchange.rejoinder.createdEventId,
                    ) ? (
                    <p>
                      <b>
                        {REJOINDER_MANEUVERS.find(
                          (candidate) =>
                            candidate.id === exchange.rejoinder?.maneuver,
                        )?.label ?? "Rejoinder"}
                      </b>
                      {exchange.rejoinder.content}
                    </p>
                  ) : null}
                  {exchange.acclamation ? (
                    <blockquote>{exchange.acclamation}</blockquote>
                  ) : null}
                </article>
              ))}
            </div>
            {state.hallLeaningHistory.length ? (
              <section className={styles.voteRecord}>
                <h3>Hall Leaning</h3>
                <p>
                  <strong>
                    {hallLeaningCounts.for} Pro · {hallLeaningCounts.neutral}{" "}
                    Neutral · {hallLeaningCounts.against} Con
                  </strong>
                  <span>
                    {state.finalTally?.jarlSideId
                      ? `The Jarl sent three guards to ${sideName(props.session, state.finalTally.jarlSideId)}.`
                      : "The Jarl's three guards hold the center."}
                  </span>
                </p>
              </section>
            ) : null}
            {state.hostVerdict ? (
              <section className={styles.finalVerdict}>
                <small>The Jarl gives the word</small>
                <h3>
                  {state.hostVerdict.outcome === "double_loss" ||
                  !state.hostVerdict.sideId
                    ? "Both flyters are dismissed"
                    : `${sideName(props.session, state.hostVerdict.sideId)} prevails`}
                </h3>
                <p>{state.hostVerdict.ruling}</p>
              </section>
            ) : null}
          </section>

          <aside
            className={styles.floorPanel}
            data-tutorial-target="debate-flyting-actions"
          >
            <header className={styles.flytDeskHeader}>
              <div>
                <small>Flyt desk</small>
                <strong>
                  {state.expectedAction === "host_verdict"
                    ? "The Jarl's ruling"
                    : "Shape the next exchange"}
                </strong>
              </div>
              <span>
                <b>{hallLeaningCounts.for}</b> Pro
                <i aria-hidden="true">·</i>
                <b>{hallLeaningCounts.neutral}</b> Neutral
                <i aria-hidden="true">·</i>
                <b>{hallLeaningCounts.against}</b> Con
              </span>
            </header>
            {props.session.status === "paused" ? (
              <div className={styles.waitingPanel}>
                <span>ᛉ</span>
                <h2>The Hall is held.</h2>
                <p>Resume when you are ready. No clock is running.</p>
              </div>
            ) : props.session.status === "completed" ? (
              <div className={styles.waitingPanel}>
                <span>◇</span>
                <h2>The contest is carved.</h2>
                <p>
                  Every claim, answer, vote, and delivered Power remains in the
                  replayable record.
                </p>
              </div>
            ) : props.session.status === "waiting_for_player" ? (
              <>
                <header className={styles.floorHeading}>
                  <small>
                    {state.expectedAction === "challenge"
                      ? "Challenge / Flyte"
                      : state.expectedAction === "rejoinder"
                        ? "Answer / Rejoinder"
                        : state.expectedAction === "host_verdict"
                          ? "Rule / Give the word"
                          : "Claim / Boast"}
                  </small>
                  <h2>
                    {state.expectedAction === "host_verdict"
                      ? "The Hall awaits your ruling."
                      : `${floorFlyter?.name ?? "Your flyter"} awaits your direction.`}
                  </h2>
                  <p>
                    {state.expectedAction === "challenge"
                      ? "Choose the exact boast and how to attack it."
                      : state.expectedAction === "rejoinder"
                        ? "Meet the charge—or Yield and let it stand."
                        : state.expectedAction === "host_verdict"
                          ? "The fifteen Hall members have leaned. Send your three guards to the flyter you judge best; their vote carries weight three."
                          : "Choose an unused Legend facet, then give it voice."}
                  </p>
                </header>
                {state.expectedAction === "boast" ? (
                  <div className={styles.tacticGrid}>
                    {unusedFacets.map((facet) => (
                      <button
                        type="button"
                        key={facet.id}
                        data-selected={
                          facetId === facet.id ? "true" : undefined
                        }
                        onClick={() => setFacetId(facet.id)}
                      >
                        <strong>{facet.title}</strong>
                        <span>{facet.claim}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {state.expectedAction === "challenge" ? (
                  <>
                    <label className={styles.floorSelect}>
                      <span>Targeted claim</span>
                      <select
                        value={targetClaimId}
                        onChange={(event) =>
                          setTargetClaimId(event.currentTarget.value)
                        }
                      >
                        {opponentClaims.map((claim) => (
                          <option key={claim.id} value={claim.id}>
                            {claim.content}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className={styles.tacticGrid}>
                      {CHALLENGE_LENSES.map((candidate) => (
                        <button
                          type="button"
                          key={candidate.id}
                          data-selected={
                            lens === candidate.id ? "true" : undefined
                          }
                          onClick={() => setLens(candidate.id)}
                        >
                          <strong>{candidate.label}</strong>
                          <span>{candidate.detail}</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                {state.expectedAction === "rejoinder" ? (
                  <>
                    <blockquote className={styles.activeCharge}>
                      {activeExchange?.challenge?.content}
                    </blockquote>
                    <div className={styles.tacticGrid}>
                      {REJOINDER_MANEUVERS.map((candidate) => (
                        <button
                          type="button"
                          key={candidate.id}
                          data-selected={
                            maneuver === candidate.id ? "true" : undefined
                          }
                          onClick={() => setManeuver(candidate.id)}
                        >
                          <strong>{candidate.label}</strong>
                          <span>{candidate.detail}</span>
                        </button>
                      ))}
                    </div>
                    {maneuver === "return" ? (
                      <label className={styles.floorSelect}>
                        <span>Return against</span>
                        <select
                          value={returnClaimId}
                          onChange={(event) =>
                            setReturnClaimId(event.currentTarget.value)
                          }
                        >
                          {opponentClaims.map((claim) => (
                            <option key={claim.id} value={claim.id}>
                              {claim.content}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </>
                ) : null}
                {state.expectedAction === "host_verdict" ? (
                  <div className={styles.winnerChoice}>
                    {(["for", "against"] as const).map((sideId) => (
                      <button
                        type="button"
                        key={sideId}
                        data-selected={
                          winnerSideId === sideId ? "true" : undefined
                        }
                        onClick={() => setWinnerSideId(sideId)}
                      >
                        <strong>
                          Send guards to {sideName(props.session, sideId)}
                        </strong>
                        <span>
                          {
                            state.hallMembers.filter(
                              (member) => member.leaning === sideId,
                            ).length
                          }{" "}
                          Hall members · +3 Jarl guards
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <label className={styles.composer}>
                  <span>
                    <strong>Your line</strong>
                    <em>
                      {draft.length} / {DEBATE_FLYTING_LINE_MAX_LENGTH}
                    </em>
                  </span>
                  <textarea
                    value={draft}
                    rows={5}
                    maxLength={DEBATE_FLYTING_LINE_MAX_LENGTH}
                    placeholder="The line begins blank. Write it yourself or Wield PRISM once for an editable draft."
                    onChange={(event) => {
                      setDraft(event.currentTarget.value);
                      if (!event.currentTarget.value) setAuthoredMode("custom");
                    }}
                  />
                </label>
                <div className={styles.composerActions}>
                  {state.expectedAction === "rejoinder" ? (
                    <button
                      type="button"
                      className={styles.yieldAction}
                      disabled={busy}
                      onClick={() => void mutate({ action: "yield" }, "yield")}
                    >
                      Yield · leave unanswered
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void wield()}
                  >
                    {busy ? "Wielding…" : "◇ Wield PRISM"}
                  </button>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    disabled={
                      busy ||
                      !draft.trim() ||
                      (state.expectedAction === "boast" && !facetId) ||
                      (state.expectedAction === "challenge" &&
                        !targetClaimId) ||
                      (state.expectedAction === "rejoinder" &&
                        maneuver === "return" &&
                        !returnClaimId)
                    }
                    onClick={submitPlayerAction}
                  >
                    {state.expectedAction === "host_verdict"
                      ? "Give the word"
                      : "Send to the floor"}
                  </button>
                </div>
              </>
            ) : (
              <div className={styles.waitingPanel}>
                <span>ᚦ</span>
                <h2>
                  {busy ? "The word is taking shape…" : "The Hall listens."}
                </h2>
                <p>
                  {state.phase === "final_acclamation"
                    ? "The fifteen helmets settle into their final leanings."
                    : state.phase === "verdict"
                      ? "The Jarl weighs the Hall and readies three guards."
                      : "Boast, challenge, and answer remain bound to the carved record."}
                </p>
              </div>
            )}
            {error ? (
              <div className={styles.liveError} role="alert">
                <p>{error}</p>
                <div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError(null);
                      void mutate({ action: "advance" }, "retry");
                    }}
                  >
                    Retry
                  </button>
                  {state.expectedAction === "advance" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setError(null);
                        void mutate({ action: "advance", skip: true }, "skip");
                      }}
                    >
                      Skip this beat
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
      {stageAlignmentOpen && DEBATE_FLYTING_STAGE_LAYOUT_AUTHORING_ENABLED ? (
        <aside
          className={styles.stageAlignmentPanel}
          data-flyting-stage-alignment="true"
          aria-label="Flyting stage alignment"
        >
          <header>
            <div>
              <span>Developer authoring</span>
              <h2>Flyting alignment</h2>
            </div>
            <button
              type="button"
              aria-label="Close Flyting alignment"
              onClick={() => setStageAlignmentOpen(false)}
            >
              ×
            </button>
          </header>

          <div className={styles.stageAlignmentTabs} role="tablist">
            {(
              [
                ["wide", "Wide"],
                ["moderator", "Jarl"],
              ] as const
            ).map(([view, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={stageAlignmentView === view}
                data-selected={stageAlignmentView === view ? "true" : undefined}
                onClick={() => chooseStageAlignmentView(view)}
                key={view}
              >
                {label}
              </button>
            ))}
          </div>

          <label className={styles.stageAlignmentSelect}>
            <span>Element</span>
            <select
              value={stageAlignmentItem}
              onChange={(event) =>
                setStageAlignmentItem(
                  event.currentTarget.value as DebateFlytingStageAlignmentItem,
                )
              }
            >
              {stageAlignmentItems.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <p className={styles.stageAlignmentHint}>
            Choose a view and element, then drag its gold outline directly on
            the Hall. Use the fields for the final nudge; Copy alignment values
            gives you one source-ready block to paste back into chat.
          </p>

          <div className={styles.stageAlignmentFields}>
            {(
              [
                ["x", "X", 0.25],
                ["y", "Y", 0.25],
                ["scale", "Scale", 1],
              ] as const
            ).map(([field, label, step]) => (
              <label key={field}>
                <span>{label}</span>
                <input
                  type="number"
                  value={stageAlignmentPlacement[field]}
                  step={step}
                  onChange={(event) =>
                    updateStageAlignmentPlacement(stageAlignmentItem, {
                      [field]: Number(event.currentTarget.value),
                    })
                  }
                />
                <em>{field === "scale" ? "%" : "%"}</em>
              </label>
            ))}
            {stageAlignmentDefinition.supportsRotation ? (
              <label>
                <span>Rotate</span>
                <input
                  type="number"
                  value={stageAlignmentPlacement.rotation}
                  step={0.25}
                  onChange={(event) =>
                    updateStageAlignmentPlacement(stageAlignmentItem, {
                      rotation: Number(event.currentTarget.value),
                    })
                  }
                />
                <em>°</em>
              </label>
            ) : null}
            {stageAlignmentDefinition.supportsSkew ? (
              <label>
                <span>Skew X</span>
                <input
                  type="number"
                  value={stageAlignmentPlacement.skewX}
                  step={0.25}
                  onChange={(event) =>
                    updateStageAlignmentPlacement(stageAlignmentItem, {
                      skewX: Number(event.currentTarget.value),
                    })
                  }
                />
                <em>°</em>
              </label>
            ) : null}
          </div>

          <div className={styles.stageAlignmentActions}>
            <button
              type="button"
              onClick={() =>
                updateStageAlignmentPlacement(
                  stageAlignmentItem,
                  DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT.placements[
                    stageAlignmentItem
                  ],
                )
              }
            >
              Reset element
            </button>
            <button
              type="button"
              onClick={() => {
                setStageAlignmentDraft(
                  copyDebateFlytingStageAlignment(
                    DEFAULT_DEBATE_FLYTING_STAGE_ALIGNMENT,
                  ),
                );
                setStageAlignmentCopyState("idle");
              }}
            >
              Reset all
            </button>
          </div>
          <button
            type="button"
            className={styles.stageAlignmentCopyButton}
            onClick={() => void copyStageAlignment()}
          >
            {stageAlignmentCopyState === "copied"
              ? "Copied — send me the values"
              : stageAlignmentCopyState === "failed"
                ? "Copy failed — retry"
                : "Copy alignment values"}
          </button>
          <small>
            Preview-only. Copied values are source-ready; normal Flyting stays
            unchanged until they are codified.
          </small>
        </aside>
      ) : null}
    </main>
  );
}
