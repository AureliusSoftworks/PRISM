import {
  homeBaseRadialRayGeometry,
  type HomeBaseRadialRayGeometry,
} from "./homeBaseRadialLauncher.ts";

export const BOT_AVATAR_FOUNDRY_PHASES = [
  "arrival",
  "brief",
  "handoff",
  "generation",
  "awakening",
  "editing",
  "error",
] as const;

export type BotAvatarFoundryPhase = (typeof BOT_AVATAR_FOUNDRY_PHASES)[number];

export type BotAvatarFoundryCameraMode = "overview" | "face" | "ink";
export type BotAvatarFoundryScreenMode =
  | "off"
  | "synthesis"
  | "live"
  | "editing";
export type BotAvatarFoundryTheme = "light" | "dark";
export type BotAvatarFoundryAtmosphereSource = "neutral" | "bot";

export interface BotAvatarFoundryAtmosphere {
  color: string;
  source: BotAvatarFoundryAtmosphereSource;
}

const BOT_AVATAR_FOUNDRY_NEUTRAL_COLORS = {
  dark: "#91a8bd",
  light: "#6f8498",
} as const satisfies Record<BotAvatarFoundryTheme, string>;

export function botAvatarFoundryAtmosphere(
  color: string | null | undefined,
  theme: BotAvatarFoundryTheme,
): BotAvatarFoundryAtmosphere {
  const raw = color?.trim().toLowerCase() ?? "";
  const shortHex = /^#([0-9a-f]{3})$/u.exec(raw)?.[1];
  if (shortHex) {
    return {
      color: `#${Array.from(shortHex, (part) => `${part}${part}`).join("")}`,
      source: "bot",
    };
  }
  if (/^#[0-9a-f]{6}$/u.test(raw)) {
    return { color: raw, source: "bot" };
  }
  return {
    color: BOT_AVATAR_FOUNDRY_NEUTRAL_COLORS[theme],
    source: "neutral",
  };
}

export type BotAvatarFoundryUpgradeNodeId =
  "eyes" | "mouth" | "screen" | "glyph" | "chassis";
export type BotAvatarFoundryIdentitySurface = "identity-core" | "shell";
export interface BotAvatarFoundryUpgradeNode {
  id: BotAvatarFoundryUpgradeNodeId;
  module: string;
  label: string;
  ariaLabel: string;
  color: string;
}

/** Shared foundry accent for module chrome (lamps/tabs inherit bot color at render). */
export const BOT_AVATAR_FOUNDRY_MODULE_ACCENT = "#91a8bd";

export const BOT_AVATAR_FOUNDRY_UPGRADE_NODES = [
  {
    id: "eyes",
    module: "Module 01",
    label: "Optics",
    ariaLabel: "Open Optics module controls",
    color: BOT_AVATAR_FOUNDRY_MODULE_ACCENT,
  },
  {
    id: "mouth",
    module: "Module 02",
    label: "Vocalizer",
    ariaLabel: "Open Vocalizer module controls",
    color: BOT_AVATAR_FOUNDRY_MODULE_ACCENT,
  },
  {
    id: "screen",
    module: "Module 03",
    label: "Ink display",
    ariaLabel: "Open Ink Display module editor",
    color: BOT_AVATAR_FOUNDRY_MODULE_ACCENT,
  },
  {
    id: "glyph",
    module: "Module 04",
    label: "Identity core",
    ariaLabel: "Open Identity Core module controls",
    color: BOT_AVATAR_FOUNDRY_MODULE_ACCENT,
  },
  {
    id: "chassis",
    module: "Module 05",
    label: "Shell",
    ariaLabel: "Open Shell module controls",
    color: BOT_AVATAR_FOUNDRY_MODULE_ACCENT,
  },
] as const satisfies readonly BotAvatarFoundryUpgradeNode[];

export type BotAvatarFoundryModulePopulation = Readonly<
  Record<BotAvatarFoundryUpgradeNodeId, boolean>
>;

export const BOT_AVATAR_FOUNDRY_ALL_MODULES_POPULATED = {
  eyes: true,
  mouth: true,
  screen: true,
  glyph: true,
  chassis: true,
} as const satisfies BotAvatarFoundryModulePopulation;

export interface BotAvatarFoundryDraftPopulationSignals {
  draftMode: boolean;
  identity: boolean;
  eyes: boolean;
  mouth: boolean;
  screen: boolean;
  chassis: boolean;
}

export function botAvatarFoundryModulePopulation({
  draftMode,
  identity,
  eyes,
  mouth,
  screen,
  chassis,
}: BotAvatarFoundryDraftPopulationSignals): BotAvatarFoundryModulePopulation {
  if (!draftMode) return BOT_AVATAR_FOUNDRY_ALL_MODULES_POPULATED;
  return {
    eyes,
    mouth,
    screen,
    glyph: identity,
    chassis,
  };
}

const BOT_AVATAR_FOUNDRY_CONTROL_MODULES = {
  face: "glyph",
  profile: "glyph",
  powers: "glyph",
  eyes: "eyes",
  mouth: "mouth",
  voice: "mouth",
  sfx: "mouth",
  settings: "chassis",
  details: "screen",
} as const satisfies Record<string, BotAvatarFoundryUpgradeNodeId>;

export function botAvatarFoundryUpgradeNodeForControl(
  control: string,
): (typeof BOT_AVATAR_FOUNDRY_UPGRADE_NODES)[number] {
  const nodeId =
    BOT_AVATAR_FOUNDRY_CONTROL_MODULES[
      control as keyof typeof BOT_AVATAR_FOUNDRY_CONTROL_MODULES
    ] ?? "chassis";
  return (
    BOT_AVATAR_FOUNDRY_UPGRADE_NODES.find((node) => node.id === nodeId) ??
    BOT_AVATAR_FOUNDRY_UPGRADE_NODES[4]
  );
}

export function botAvatarFoundryIdentitySurfaceForNode(
  node: BotAvatarFoundryUpgradeNodeId,
): BotAvatarFoundryIdentitySurface | null {
  if (node === "glyph") return "identity-core";
  if (node === "chassis") return "shell";
  return null;
}

export interface BotAvatarFoundryViewport {
  x: number;
  y: number;
  zoom: number;
}

export const BOT_AVATAR_FOUNDRY_DEFAULT_VIEWPORT: BotAvatarFoundryViewport = {
  x: 0,
  y: 0,
  zoom: 1,
};

export const BOT_AVATAR_FOUNDRY_ZOOM_MIN = 0.72;
export const BOT_AVATAR_FOUNDRY_ZOOM_MAX = 1.85;
export const BOT_AVATAR_FOUNDRY_PIXEL_GRID_ZOOM_THRESHOLD = 1.5;
export const BOT_AVATAR_FOUNDRY_PAN_X_MAX = 320;
export const BOT_AVATAR_FOUNDRY_PAN_Y_MAX = 240;

export function botAvatarFoundryPixelGridVisible(zoom: number): boolean {
  return (
    Number.isFinite(zoom) &&
    zoom >= BOT_AVATAR_FOUNDRY_PIXEL_GRID_ZOOM_THRESHOLD
  );
}

export function normalizeBotAvatarFoundryViewport(
  viewport: Partial<BotAvatarFoundryViewport>,
): BotAvatarFoundryViewport {
  const x = Number.isFinite(viewport.x) ? Number(viewport.x) : 0;
  const y = Number.isFinite(viewport.y) ? Number(viewport.y) : 0;
  const zoom = Number.isFinite(viewport.zoom) ? Number(viewport.zoom) : 1;
  return {
    x: Math.max(
      -BOT_AVATAR_FOUNDRY_PAN_X_MAX,
      Math.min(BOT_AVATAR_FOUNDRY_PAN_X_MAX, x),
    ),
    y: Math.max(
      -BOT_AVATAR_FOUNDRY_PAN_Y_MAX,
      Math.min(BOT_AVATAR_FOUNDRY_PAN_Y_MAX, y),
    ),
    zoom: Math.max(
      BOT_AVATAR_FOUNDRY_ZOOM_MIN,
      Math.min(BOT_AVATAR_FOUNDRY_ZOOM_MAX, zoom),
    ),
  };
}

export function zoomBotAvatarFoundryViewport(
  viewport: BotAvatarFoundryViewport,
  wheelDeltaY: number,
): BotAvatarFoundryViewport {
  const zoomFactor = Math.exp(
    -Math.max(-240, Math.min(240, wheelDeltaY)) * 0.0015,
  );
  return normalizeBotAvatarFoundryViewport({
    ...viewport,
    zoom: viewport.zoom * zoomFactor,
  });
}

/** Keeps the same authored point beneath the cursor while camera zoom changes.
 * `anchor` is measured in screen pixels from the transformed camera-rig center. */
export function zoomBotAvatarFoundryViewportAtAnchor(
  viewport: BotAvatarFoundryViewport,
  wheelDeltaY: number,
  anchor: Readonly<{ x: number; y: number }>,
): BotAvatarFoundryViewport {
  const current = normalizeBotAvatarFoundryViewport(viewport);
  const zoomed = zoomBotAvatarFoundryViewport(current, wheelDeltaY);
  const ratio = zoomed.zoom / current.zoom;
  const anchorX = Number.isFinite(anchor.x) ? anchor.x : 0;
  const anchorY = Number.isFinite(anchor.y) ? anchor.y : 0;
  return normalizeBotAvatarFoundryViewport({
    ...zoomed,
    x: current.x + anchorX * (1 - ratio),
    y: current.y + anchorY * (1 - ratio),
  });
}

export type BotAvatarFoundryCreationPath = "ai" | "manual";

export interface BotAvatarFoundryState {
  phase: BotAvatarFoundryPhase;
  path: BotAvatarFoundryCreationPath | null;
}

export type BotAvatarFoundryEvent =
  | { type: "landed" }
  | { type: "begin"; path: BotAvatarFoundryCreationPath }
  | { type: "handoff-complete" }
  | { type: "generation-resolved" }
  | { type: "wake-complete" }
  | { type: "failed" }
  | { type: "retry" }
  | { type: "cancel" };

/** Fixed Creation chamber station; Foundry Prism never tracks pointer movement. */
export const BOT_AVATAR_FOUNDRY_PRISM_ANCHOR = {
  x: 0.13,
  y: 0.45,
} as const;

export const BOT_AVATAR_FOUNDRY_INTERIM_GLYPHS = [
  "bot",
  "sparkles",
  "heart",
  "star",
  "moon",
  "brain",
] as const;

export const BOT_AVATAR_FOUNDRY_FACE_CANDIDATES = [
  { eyes: "•", mouth: "_" },
  { eyes: "◉", mouth: "⌣" },
  { eyes: "^", mouth: "ᴗ" },
  { eyes: "◆", mouth: "—" },
] as const;

export type BotAvatarFoundryFaceCandidate =
  (typeof BOT_AVATAR_FOUNDRY_FACE_CANDIDATES)[number];

export interface BotAvatarFoundryPopulationModule {
  id: BotAvatarFoundryUpgradeNodeId;
  label: string;
  populated: boolean;
  active: boolean;
}

export interface BotAvatarFoundryPopulationFrame {
  fill: number;
  glyph: (typeof BOT_AVATAR_FOUNDRY_INTERIM_GLYPHS)[number];
  face: BotAvatarFoundryFaceCandidate;
  modules: readonly BotAvatarFoundryPopulationModule[];
  population: BotAvatarFoundryModulePopulation;
  activeModule: BotAvatarFoundryUpgradeNodeId;
  notice: string;
}

const BOT_AVATAR_FOUNDRY_POPULATION_SEQUENCE = [
  "chassis",
  "screen",
  "eyes",
  "mouth",
  "glyph",
] as const satisfies readonly BotAvatarFoundryUpgradeNodeId[];

const BOT_AVATAR_FOUNDRY_POPULATION_NOTICES = {
  chassis: "Seating the shell.",
  screen: "Charging the ink display.",
  eyes: "Tuning optics.",
  mouth: "Casting the vocalizer.",
  glyph: "Resolving the identity core.",
} as const satisfies Record<BotAvatarFoundryUpgradeNodeId, string>;

export function botAvatarFoundryPopulationFrame(
  elapsedMs: number,
  reducedMotion = false,
): BotAvatarFoundryPopulationFrame {
  const elapsed = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  const moduleDurationMs = reducedMotion ? 36 : 1_050;
  const activeIndex = Math.min(
    BOT_AVATAR_FOUNDRY_POPULATION_SEQUENCE.length - 1,
    Math.floor(elapsed / moduleDurationMs),
  );
  const activeModule = BOT_AVATAR_FOUNDRY_POPULATION_SEQUENCE[activeIndex]!;
  const population = Object.fromEntries(
    BOT_AVATAR_FOUNDRY_POPULATION_SEQUENCE.map((id, index) => [
      id,
      index < activeIndex,
    ]),
  ) as unknown as BotAvatarFoundryModulePopulation;
  const glyphIndex =
    (reducedMotion ? 0 : Math.floor(elapsed / 430)) %
    BOT_AVATAR_FOUNDRY_INTERIM_GLYPHS.length;
  const faceIndex =
    (reducedMotion ? 0 : Math.floor(elapsed / 360)) %
    BOT_AVATAR_FOUNDRY_FACE_CANDIDATES.length;
  return {
    // Provider work has no honest numeric completion. This is a bounded CRT
    // population ritual: it visibly advances, then patiently holds below full
    // until the real generation request resolves.
    fill: Math.min(0.92, (reducedMotion ? 0.36 : 0.12) + elapsed / 5_800),
    glyph: BOT_AVATAR_FOUNDRY_INTERIM_GLYPHS[glyphIndex]!,
    face: BOT_AVATAR_FOUNDRY_FACE_CANDIDATES[faceIndex]!,
    modules: BOT_AVATAR_FOUNDRY_UPGRADE_NODES.map(({ id, label }) => ({
      id,
      label,
      populated: population[id],
      active: id === activeModule,
    })),
    population,
    activeModule,
    notice: BOT_AVATAR_FOUNDRY_POPULATION_NOTICES[activeModule],
  };
}

export function botAvatarFoundryRadialRayGeometry(
  origin: Readonly<{ x: number; y: number }>,
  target: Readonly<{ x: number; y: number }> = { x: 0.5, y: 0.52 },
): HomeBaseRadialRayGeometry {
  const canvasSize = 1_000;
  const sourceX = Math.max(0, Math.min(1, Number(origin.x) || 0));
  const sourceY = Math.max(0, Math.min(1, Number(origin.y) || 0));
  const targetX = Math.max(0, Math.min(1, Number(target.x) || 0));
  const targetY = Math.max(0, Math.min(1, Number(target.y) || 0));
  return homeBaseRadialRayGeometry(
    { x: sourceX * canvasSize, y: sourceY * canvasSize },
    { x: targetX * canvasSize, y: targetY * canvasSize },
  );
}

export const BOT_AVATAR_FOUNDRY_TIMING = {
  arrivalMs: 760,
  handoffMs: 620,
  minimumGenerationMs: 980,
  finalizationMs: 1_280,
  awakeningMs: 720,
  reducedArrivalMs: 80,
  reducedHandoffMs: 120,
  reducedMinimumGenerationMs: 180,
  reducedFinalizationMs: 120,
  reducedAwakeningMs: 180,
} as const;

export function botAvatarFoundryTiming(reducedMotion: boolean): {
  arrivalMs: number;
  handoffMs: number;
  minimumGenerationMs: number;
  finalizationMs: number;
  awakeningMs: number;
} {
  return reducedMotion
    ? {
        arrivalMs: BOT_AVATAR_FOUNDRY_TIMING.reducedArrivalMs,
        handoffMs: BOT_AVATAR_FOUNDRY_TIMING.reducedHandoffMs,
        minimumGenerationMs:
          BOT_AVATAR_FOUNDRY_TIMING.reducedMinimumGenerationMs,
        finalizationMs: BOT_AVATAR_FOUNDRY_TIMING.reducedFinalizationMs,
        awakeningMs: BOT_AVATAR_FOUNDRY_TIMING.reducedAwakeningMs,
      }
    : {
        arrivalMs: BOT_AVATAR_FOUNDRY_TIMING.arrivalMs,
        handoffMs: BOT_AVATAR_FOUNDRY_TIMING.handoffMs,
        minimumGenerationMs: BOT_AVATAR_FOUNDRY_TIMING.minimumGenerationMs,
        finalizationMs: BOT_AVATAR_FOUNDRY_TIMING.finalizationMs,
        awakeningMs: BOT_AVATAR_FOUNDRY_TIMING.awakeningMs,
      };
}

export function botAvatarFoundryGenerationHoldMs(
  elapsedMs: number,
  reducedMotion: boolean,
): number {
  const minimumMs = botAvatarFoundryTiming(reducedMotion).minimumGenerationMs;
  return Math.max(0, minimumMs - Math.max(0, elapsedMs));
}

/**
 * Pure transition contract for creation choreography. UI work may occur
 * between these events, but invalid or late events cannot advance the shell.
 */
export function transitionBotAvatarFoundry(
  state: BotAvatarFoundryState,
  event: BotAvatarFoundryEvent,
): BotAvatarFoundryState {
  if (event.type === "cancel") return { phase: "brief", path: null };
  if (event.type === "failed") {
    return state.phase === "handoff" || state.phase === "generation"
      ? { ...state, phase: "error" }
      : state;
  }
  if (event.type === "retry") {
    return state.phase === "error" ? { phase: "handoff", path: "ai" } : state;
  }

  switch (state.phase) {
    case "arrival":
      return event.type === "landed" ? { phase: "brief", path: null } : state;
    case "brief":
    case "error":
      return event.type === "begin"
        ? { phase: "handoff", path: event.path }
        : state;
    case "handoff":
      return event.type === "handoff-complete"
        ? {
            ...state,
            phase: state.path === "manual" ? "awakening" : "generation",
          }
        : state;
    case "generation":
      return event.type === "generation-resolved"
        ? { ...state, phase: "awakening" }
        : state;
    case "awakening":
      return event.type === "wake-complete"
        ? { ...state, phase: "editing" }
        : state;
    case "editing":
      return state;
  }
}

export function botAvatarFoundryStatus(
  phase: BotAvatarFoundryPhase,
  botName?: string | null,
): string {
  const name = botName?.trim() || "Your bot";
  switch (phase) {
    case "arrival":
      return "Fresh shell inbound—mind your toes.";
    case "brief":
      return "Grab it, fling it, then give it a spark.";
    case "handoff":
      return "Hands clear. Aligning the chassis.";
    case "generation":
      return "Prism is shaping the draft.";
    case "awakening":
      return `${name} is coming online.`;
    case "editing":
      return "Choose an upgrade node.";
    case "error":
      return "The shell is safe. Try again or begin manually.";
  }
}

export function botAvatarFoundryScreenMode(
  phase: BotAvatarFoundryPhase,
): BotAvatarFoundryScreenMode {
  return phase === "editing"
    ? "editing"
    : phase === "awakening"
      ? "live"
      : phase === "generation"
        ? "synthesis"
      : "off";
}

export function botAvatarFoundryCameraForControl(
  control: string,
): BotAvatarFoundryCameraMode {
  if (control === "details") return "ink";
  return "overview";
}
