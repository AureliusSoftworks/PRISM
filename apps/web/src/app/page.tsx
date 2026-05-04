"use client";

import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  forwardRef,
  useSyncExternalStore,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { LUCIDE_BOT_GLYPHS, LUCIDE_BOT_GLYPH_ORDER } from "./glyphCatalog";
import styles from "./page.module.css";
import {
  BOT_VOICE_PRESET_LABELS,
  defaultBotPurpose,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
  stripPurposeStatementPrefixes,
  type BotProfileFields,
  type BotProfileScaleValue,
  type BotVoicePreset,
} from "@localai/shared";

// How long the two-stage delete (× → ✓) stays armed before auto-disarming.
// Long enough for a deliberate confirmation click, short enough that the armed
// state doesn't linger and cause accidents on a later sidebar return visit.
const DELETE_CONFIRM_WINDOW_MS = 3500;

// How long a pointer must be held on any chat-delete button before the
// "Delete all chats?" armed-all state takes over. Tuned so a normal click
// can't cross the threshold accidentally, but an intentional press-and-hold
// resolves without feeling like a ritual. Must stay in sync with the CSS
// transition duration on `.conversationDelete[data-holding="true"]` so the
// visual morph completes at the same instant the JS timer fires.
const DELETE_ALL_HOLD_MS = 900;

// Sentinel for the chat-header delete button, which has no chat id of its own
// (it always targets the currently open chat).
const HEADER_DELETE_KEY = "__header__";

// Sentinel for the "delete every chat" armed state, reached by holding any
// chat × / Delete button past DELETE_ALL_HOLD_MS. Reuses the single
// `pendingDeleteKey` slot so the existing auto-disarm / outside-click /
// Escape behaviour applies to it without any extra wiring.
const DELETE_ALL_KEY = "__delete_all__";
const NATIVE_SESSION_STORAGE_KEY = "prism_native_session_token";
const CLIENT_ACCESS_STORAGE_KEY = "prism_client_access_token";

// Namespace bot-delete keys so they can share the same single "armed" state
// slot used for conversation deletion without id collisions.
const BOT_DELETE_KEY_PREFIX = "bot:";

// Cinematic zoom + fade transition between memory directory levels.
// The total motion budget (~380ms) is split into matched exit and enter
// halves so the directional zoom reads as one continuous "push through" /
// "pull back" gesture instead of a hard cut.
const MEMORY_TRANSITION_EXIT_MS = 190;
const MEMORY_TRANSITION_ENTER_MS = 190;
const MEMORY_PHYSICS_DURATION_MS = 2400;
// Spring + damping tuned to feel like underdamped drawer-inertia:
// a single leftward overshoot, one gentle rightward bounce, then settle.
// Underdamped (zeta < 1) so the items breathe; not so soft that they
// oscillate forever.
const MEMORY_PHYSICS_SPRING = 36;
const MEMORY_PHYSICS_DAMPING = 7.2;
const MEMORY_PHYSICS_WALL_RESTITUTION = 0.5;
// The drawer slides in from the right (panelIn keyframe: translateX(100% + 32px) -> 0),
// so its deceleration imparts leftward inertia on every child. Negative = leftward.
const MEMORY_PHYSICS_DRAWER_DIR_X = -1;
// How far past their layout target the items "throw" before the spring
// reels them back. Px in the cloud's local space. Tuned for a noticeable
// but not chaotic overshoot.
const MEMORY_PHYSICS_DRAWER_VELOCITY = 540;
// Slight per-item variance keeps the motion from looking lockstep without
// breaking the unified "drawer pushed everything together" feel.
const MEMORY_PHYSICS_VELOCITY_JITTER_X = 90;
const MEMORY_PHYSICS_VELOCITY_JITTER_Y = 140;
const MEMORY_PHYSICS_OFFSET_JITTER_X = 18;
const MEMORY_PHYSICS_OFFSET_JITTER_Y = 14;
const BOT_CONTEXT_LONG_PRESS_MS = 480;
const BOT_CONTEXT_LONG_PRESS_MOVE_CANCEL_PX = 12;

// Bot-list twin of DELETE_ALL_KEY — armed when a press-and-hold crosses the
// threshold on any bot card ×. Kept separate so the confirmation modal can
// tailor its copy and the bulk action routes to the bots endpoint instead
// of conversations. Both all-delete sentinels live in the same
// `pendingDeleteKey` slot, so outside-click / Escape / auto-disarm still
// apply uniformly.
const DELETE_ALL_BOTS_KEY = "__delete_all_bots__";

// Developer Tools are enabled by default for Prism's local/native builds.
// Set NEXT_PUBLIC_DEV_TOOLS=0 only when a distribution build must hide them.
const DEV_TOOLS_ENABLED = process.env.NEXT_PUBLIC_DEV_TOOLS !== "0";
// The pairing placeholder is a production/native shell affordance. Local `next dev`
// should always render the full web UI so frontend iteration is not blocked.
const CLIENT_ACCESS_REQUIRED = process.env.NODE_ENV === "production";

const DEV_TOOLS_BOT_QUANTITY_MIN = 0;
const DEV_TOOLS_BOT_QUANTITY_DEFAULT = 10;
const DEV_TOOLS_BOT_QUANTITY_MAX = 2000;
const DEV_TOOLS_BOT_QUANTITY_PRESETS = [1, 10, 25, 50, 100, 500, 1000, 2000] as const;
const DEV_TOOLS_BOT_CREATE_CHUNK_SIZE = 100;
const DEV_TOOLS_GHOST_COUNT_MIN = 1;
const DEV_TOOLS_GHOST_COUNT_MAX = 99;
const DEV_TOOLS_PANEL_DEFAULT_X = 14;
const DEV_TOOLS_PANEL_DEFAULT_Y = 76;
const DEV_TOOLS_PANEL_VIEWPORT_MARGIN = 14;
const RANDOM_NUDGE_STOP_WORDS = new Set([
  "about",
  "there",
  "would",
  "could",
  "their",
  "which",
  "because",
  "really",
  "maybe",
]);
const MOBILE_SIDEBAR_SWIPE_EDGE_PX = 32;
const MOBILE_SIDEBAR_SWIPE_OPEN_PX = 56;
const MOBILE_SIDEBAR_SWIPE_VERTICAL_CANCEL_PX = 44;
const MOBILE_SIDEBAR_SWIPE_DIRECTION_RATIO = 1.25;
const DEV_TOOLS_MEMORY_CERTAINTY_DEFAULT = 0.45;
const MEMORY_RATIO_EMPTY_SIZE = 42;
// MIN_SIZE is the floor for any non-empty memory bubble. It must be large
// enough to comfortably fit the bot glyph (currently 40px) plus breathing
// room, so the smallest orbs in a dense family drill-down still read as
// "orb with glyph" rather than "glyph in a circle".
const MEMORY_RATIO_MIN_SIZE = 72;
const MEMORY_RATIO_SMALL_MAX_SIZE = 84;
const MEMORY_RATIO_MEDIUM_MAX_SIZE = 116;
const MEMORY_RATIO_LARGE_MAX_SIZE = 184;
type DevToolsBotQuantity = number | "";
type DevToolsMemorySeedSource = "direct" | "inferred" | "compiled";
type DevToolsPanelPosition = { x: number; y: number };
type DevToolsPanelDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};
type SidebarEdgeSwipeState = {
  touchId: number;
  startX: number;
  startY: number;
};

type MessageMenuAnchor = "center" | "below";

const MESSAGE_COPY_FEEDBACK_MS = 1600;
const MEMORY_TOAST_DISMISS_MS = 7000;
const MEMORY_TOAST_REARM_MS = 2500;
const MEMORY_TOAST_VISIBLE_LIMIT = 3;

// ── Prism logo letter palette ─────────────────────────────────────────
// One hex per letter of "prism", mirroring the per-letter stroke colors
// in public/wordmark.svg. This is strictly the logo's constituent
// spectrum — black, white, and these five letter hues — not an app
// accent palette. The app's accent (bot cards, message bubbles, shell
// --accent triad) is always driven by the active bot's color; the
// letter colors only appear inside the 5-color signature glyphs
// themselves (Hub tiles, wordmark). Kept centralized so every place
// that renders the refracted-rainbow look stays in lockstep with the
// wordmark if the palette ever changes.
const PRISM_COLORS = {
  p: "#ff4d6d",
  r: "#ff9f1c",
  i: "#b7e63a",
  s: "#2fd3e3",
  m: "#7b5cff",
} as const;

// ── Prism wordmark ────────────────────────────────────────────────────
// Inline SVG replacement for public/wordmark.svg. The static asset is
// kept on disk as a fallback and for any non-React consumers (meta tags,
// social preview cards) but every in-app render of the wordmark goes
// through this component so every in-app render uses the canonical
// fixed P/R/I/S/M color assignment from the source SVG.

const PRISM_WORDMARK_PALETTE = [
  PRISM_COLORS.p,
  PRISM_COLORS.r,
  PRISM_COLORS.i,
  PRISM_COLORS.s,
  PRISM_COLORS.m,
] as const;

const PRISM_BOT_SEED_HUE_SPREAD_DEG = 54;
const PRISM_BOT_SEED_SATURATION_MIN = 70;
const PRISM_BOT_SEED_SATURATION_MAX = 100;
const PRISM_BOT_SEED_LIGHTNESS_MIN = 32;
const PRISM_BOT_SEED_LIGHTNESS_MAX = 68;
const BOT_COLOR_DIVERSITY_SAMPLE_ATTEMPTS = 40;
const BOT_COLOR_DIVERSITY_MIN_DISTANCE = 0.3;

function clampDevToolsBotQuantity(value: number): number {
  if (!Number.isFinite(value)) return DEV_TOOLS_BOT_QUANTITY_MIN;
  return Math.max(
    DEV_TOOLS_BOT_QUANTITY_MIN,
    Math.min(DEV_TOOLS_BOT_QUANTITY_MAX, Math.round(value))
  );
}

function randomDevToolsGhostCount(): number {
  const range = DEV_TOOLS_GHOST_COUNT_MAX - DEV_TOOLS_GHOST_COUNT_MIN + 1;
  return DEV_TOOLS_GHOST_COUNT_MIN + Math.floor(Math.random() * range);
}

function randomDevToolsGhostMessage(): string {
  const ghostCount = randomDevToolsGhostCount();
  return ghostCount === 1
    ? "1 ghost was added."
    : `${ghostCount} ghosts were added.`;
}

function ratioBubbleSize(count: number, maxCount: number): number {
  if (count <= 0) return MEMORY_RATIO_EMPTY_SIZE;
  const safeMax = Math.max(1, maxCount);
  const ratio = count / safeMax;
  const maxSize =
    safeMax <= 2
      ? MEMORY_RATIO_SMALL_MAX_SIZE
      : safeMax <= 8
        ? MEMORY_RATIO_MEDIUM_MAX_SIZE
        : MEMORY_RATIO_LARGE_MAX_SIZE;
  return Math.max(MEMORY_RATIO_MIN_SIZE, Math.round(ratio * maxSize));
}

function clampDevToolsPanelPosition(
  x: number,
  y: number,
  panelWidth: number,
  panelHeight: number,
  viewportWidth: number,
  viewportHeight: number
): DevToolsPanelPosition {
  const maxX = Math.max(
    DEV_TOOLS_PANEL_VIEWPORT_MARGIN,
    viewportWidth - panelWidth - DEV_TOOLS_PANEL_VIEWPORT_MARGIN
  );
  const maxY = Math.max(
    DEV_TOOLS_PANEL_VIEWPORT_MARGIN,
    viewportHeight - panelHeight - DEV_TOOLS_PANEL_VIEWPORT_MARGIN
  );

  return {
    x: Math.min(Math.max(x, DEV_TOOLS_PANEL_VIEWPORT_MARGIN), maxX),
    y: Math.min(Math.max(y, DEV_TOOLS_PANEL_VIEWPORT_MARGIN), maxY),
  };
}

interface PrismWordmarkProps {
  className?: string;
}

function PrismWordmark({ className }: PrismWordmarkProps): React.JSX.Element {
  const colors = PRISM_WORDMARK_PALETTE;

  return (
    <svg
      className={className}
      viewBox="0 0 610 72"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Prism"
    >
      {/* Shared stroke geometry lives on the <g>; only the per-letter
          stroke colors vary, which keeps the letterforms consistent
          while preserving the canonical Prism palette mapping. */}
      <g
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="12"
      >
        {/* P */}
        <path
          stroke={colors[0]}
          d="M6,66V6h50c10.67,0,16,5.33,16,16s-5.33,16-16,16H18"
        />
        {/* R — two subpaths grouped so both subpaths inherit the same
            fixed color from a single <g stroke>. */}
        <g stroke={colors[1]}>
          <path d="M134,66V6h50c10.67,0,16,5.33,16,16s-5.33,16-16,16h-38" />
          <path d="M162,38l44,28" />
        </g>
        {/* I */}
        <path stroke={colors[2]} d="M282,6v60" />
        {/* S */}
        <path
          stroke={colors[3]}
          d="M430,6h-48c-10.67,0-16,5.33-16,16,0,8,4,12.67,12,14l52,2c9.33,1.33,14,6,14,14,0,9.33-5.33,14-16,14h-48"
        />
        {/* M — three subpaths (two uprights + the central chevron). */}
        <g stroke={colors[4]}>
          <path d="M508,66V6" />
          <path d="M508,6l48,48,48-48" />
          <path d="M604,6v60" />
        </g>
      </g>
    </svg>
  );
}

interface PrismTriangleMarkProps {
  className?: string;
}

function PrismTriangleMark({ className }: PrismTriangleMarkProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 56 56"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M28 6L48 43H8L28 6Z"
        stroke="currentColor"
        strokeLinecap="butt"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
        strokeWidth="7"
      />
    </svg>
  );
}

// ── Chat-mode picker geometry ────────────────────────────────────────
// Adaptive sizing for the start-of-chat bot picker. As the user's bot
// library grows, individual tiles shrink so the whole picker stays
// inside the empty-state column without ever pushing the composer off-
// screen. Low counts stay capped so a single bot reads as a card, not a
// wall; at the other extreme (~hundreds of bots)
// it collapses into a dense palette wall.
//
// The math is intentionally piecewise rather than a smooth log curve —
// each step lands on a rounded pixel size that pairs cleanly with stroke
// widths and gap so adjacent tiles never look jittery. Mirrored CSS
// custom properties (--tile-size / --tile-gap / --tile-hover-scale) are
// what actually drive the layout; this function is the single source of
// truth for that triple.

interface PickerGeometry {
  /** Width of the picker frame, in pixels. Mobile keeps this equal to height. */
  pickerWidth: number;
  /** Height of the picker frame, in pixels. */
  pickerHeight: number;
  /** Edge length of each square tile, in pixels. */
  tileSize: number;
  /** BotGlyph SVG `size` prop — tracks ~50% of the tile so the mark fills the avatar without crowding. */
  glyphSize: number;
  /** SVG stroke width — slightly thinner on big glyphs so heavy lines don't dominate at scale. */
  glyphStroke: number;
  /** Multiplier the hovered tile scales TO. Smaller for big base sizes so the magnified tile doesn't burst out of the picker. */
  hoverScale: number;
  /** Gap between tiles — proportional to tile size so the row's negative space stays balanced visually. */
  tileGap: number;
  /** Column count the grid renders with, biased toward the frame aspect ratio. */
  gridCols: number;
  /** Row count occupied inside the picker frame. */
  gridRows: number;
  /** Blank cells used to keep incomplete final rows from changing the grid footprint. */
  fillerCells: number;
  /** True when the picker is presenting a single featured bot card. */
  singleBot: boolean;
  /** True when three bots use the narrow/mobile pyramid composition. */
  threeBotStack: boolean;
  /** True when mobile low/mid counts use a taller compact column layout. */
  mobileColumnStack: boolean;
  /** True when an odd-count balancing cell should lead the bot buttons. */
  leadingFillerCell: boolean;
  /** True for the bridge stage: flat Stage-2-style tiles that still keep names. */
  namedFlatTile: boolean;
  /** True when mobile density should let the picker replace the hero copy. */
  suppressMobileHeroCopy: boolean;
  /** True from the icon-only flat stage onward. */
  flattenTile: boolean;
  /** True from level 3 onward: increase the glyph-to-container ratio. */
  enlargeGlyph: boolean;
  /** True from level 4 onward: hide the bot glyph inside the tile. */
  hideGlyphByDefault: boolean;
  /** True late in level 2 onward: use a crosshair cursor for denser picking. */
  crosshairCursor: boolean;
  /** True shortly after crosshair in level 2: use a dot cursor before glyphs disappear. */
  dotCursor: boolean;
  /**
   * Level 5: tiny pixel swatches with no border and no rounded corners.
   */
  solidSwatch: boolean;
  /**
   * Level 5: very large bot libraries render as a flat, gapless pixel grid.
   */
  compactPixelGrid: boolean;
  /**
   * Level 5 onward: selected glyph simplifies to an inverted dot.
   */
  selectedDotGlyph: boolean;
  /**
   * Level 6: fully dense picker collapses into a radial rainbow field.
   */
  radialRainbowGradient: boolean;
}

type PickerDensityStageId = 1 | 1.5 | 2 | 3 | 4 | 5 | 6;

interface PickerDensityBreakpoints {
  namedFlatTileCountMin: number;
  flatTileCountMin: number;
  largeGlyphTileCountMin: number;
  crosshairTileCountMin: number;
  dotTileCountMin: number;
  glyphlessCardCountMin: number;
  compactPixelGridCountMin: number;
  radialRainbowCountMin: number;
}

interface PickerDensityStageTarget {
  id: PickerDensityStageId;
  label: string;
  description: string;
  targetCount: number;
}

/**
 * Density breakpoints for the start-of-chat picker.
 *
 * Counts are viewport-scaled below; stage 2 intentionally starts early so
 * the larger glyph-to-box treatment appears before the grid feels crowded.
 * Later stages simplify more slowly: remove glyph, then card chrome, then
 * collapse into the pixel-grid states.
 */
const PICKER_MOBILE_MAX_SQUARE_SIZE = 320;
const PICKER_LOW_COUNT_MAX = 10;
const PICKER_ICON_ONLY_FLAT_COUNT = PICKER_LOW_COUNT_MAX + 1;
const PICKER_MOBILE_LOW_COUNT_MAX_SIZE = 260;
const PICKER_MOBILE_COLUMN_STACK_MAX_HEIGHT = 340;
const PICKER_DESKTOP_LOW_COUNT_MAX_WIDTH = 460;
const PICKER_DESKTOP_MAX_WIDTH = 1280;
const PICKER_DESKTOP_MAX_HEIGHT = 260;
const PICKER_DESKTOP_ASPECT_RATIO = 16 / 9;
const PICKER_MAX_TILE_SIZE = 220;
const PICKER_SINGLE_BOT_TILE_SIZE_MOBILE = 168;
/** Larger than legacy 128 — single-bot reads as an intentional hero tile on widescreen */
const PICKER_SINGLE_BOT_TILE_SIZE_DESKTOP = 168;
const PICKER_FEW_BOT_TILE_SIZE_MOBILE = 124;
const PICKER_FEW_BOT_TILE_SIZE_DESKTOP = 104;
const PICKER_LOW_COUNT_TILE_SIZE_MOBILE = 72;
const PICKER_LOW_COUNT_TILE_SIZE_DESKTOP = 76;
const PICKER_TILE_NAME_MIN_SIZE = PICKER_LOW_COUNT_TILE_SIZE_MOBILE;
const PICKER_TILE_COMPACT_NAME_MAX_SIZE = 92;
const PICKER_LOW_COUNT_FRAME_VERTICAL_PAD = 24;
const PICKER_THREE_STACK_TILE_SIZE_MOBILE = 128;
const PICKER_DEFAULT_GLYPH_RATIO = 0.5;
const PICKER_STAGE_TWO_GLYPH_RATIO = 0.82;
const PICKER_PIXEL_GLYPH_RATIO = 0.86;
const PICKER_PIXEL_GLYPH_MIN_SIZE = 9;
const PICKER_PIXEL_GLYPH_STROKE = 0.9;
const PICKER_CROSSHAIR_STAGE_TWO_PROGRESS = 0;
const PICKER_DOT_STAGE_TWO_PROGRESS = 0.2;
const PICKER_REFERENCE_SIZE = 480;
const PICKER_MIN_AVAILABLE_WIDTH = 180;
const PICKER_MIN_AVAILABLE_HEIGHT = 180;
const PICKER_BREAKPOINT_SCALE_EXPONENT = 1.2;
const PICKER_BREAKPOINT_SCALE_MIN = 0.45;
const PICKER_BREAKPOINT_SCALE_MAX = 2.5;
const PICKER_MOBILE_BREAKPOINT = 720;
const SIDEBAR_DRAWER_BREAKPOINT = 1080;
const DESKTOP_SIDEBAR_WIDTH = 280;
const DESKTOP_MESSAGES_PADDING_X = 40;
const MOBILE_MESSAGES_PADDING_X = 28;
const PICKER_SIDE_GUTTER = 48;
const PICKER_NAMED_FLAT_MOBILE_COUNT = 5;
const PICKER_NAMED_FLAT_DESKTOP_COUNT = 8;
const LARGE_GLYPH_BASE_COUNT = 180;
const GLYPHLESS_CARD_BASE_COUNT = 360;
const COMPACT_PIXEL_GRID_BASE_COUNT = 480;
const RADIAL_RAINBOW_BASE_COUNT = 720;
const PICKER_PARALLAX_X = 3;
const PICKER_PARALLAX_Y = 2;
const CHAT_HEADER_HEIGHT_ESTIMATE = 64;
const COMPOSE_HEIGHT_ESTIMATE = 138;
const EMPTY_STATE_CHROME_HEIGHT_ESTIMATE = 220;

const subscribeViewportWidth = (onStoreChange: () => void): (() => void) => {
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
};

const getViewportWidthSnapshot = (): number =>
  typeof window === "undefined" ? PICKER_REFERENCE_SIZE : window.innerWidth;

const getViewportHeightSnapshot = (): number =>
  typeof window === "undefined" ? 900 : window.innerHeight;

const getServerViewportWidthSnapshot = (): number => PICKER_REFERENCE_SIZE;
const getServerViewportHeightSnapshot = (): number => 900;

function useViewportWidth(): number {
  return useSyncExternalStore(
    subscribeViewportWidth,
    getViewportWidthSnapshot,
    getServerViewportWidthSnapshot
  );
}

function useViewportHeight(): number {
  return useSyncExternalStore(
    subscribeViewportWidth,
    getViewportHeightSnapshot,
    getServerViewportHeightSnapshot
  );
}

function pickerAvailableWidth(viewportWidth: number): number {
  const isMobile = viewportWidth <= PICKER_MOBILE_BREAKPOINT;
  const chatPaneWidth = isMobile
    ? viewportWidth
    : Math.max(PICKER_MIN_AVAILABLE_WIDTH, viewportWidth - DESKTOP_SIDEBAR_WIDTH);
  const messagesPadding = isMobile
    ? MOBILE_MESSAGES_PADDING_X
    : DESKTOP_MESSAGES_PADDING_X;
  const availableWidth = chatPaneWidth - messagesPadding - PICKER_SIDE_GUTTER;

  return Math.max(
    PICKER_MIN_AVAILABLE_WIDTH,
    Math.min(
      isMobile ? PICKER_MOBILE_MAX_SQUARE_SIZE : PICKER_DESKTOP_MAX_WIDTH,
      availableWidth
    )
  );
}

function pickerAvailableHeight(viewportHeight: number): number {
  return Math.max(
    PICKER_MIN_AVAILABLE_HEIGHT,
    viewportHeight -
      CHAT_HEADER_HEIGHT_ESTIMATE -
      COMPOSE_HEIGHT_ESTIMATE -
      EMPTY_STATE_CHROME_HEIGHT_ESTIMATE
  );
}

function pickerFrameSize(
  viewportWidth: number,
  viewportHeight: number
): { width: number; height: number } {
  const isMobile = viewportWidth <= PICKER_MOBILE_BREAKPOINT;
  const availableWidth = pickerAvailableWidth(viewportWidth);
  const availableHeight = pickerAvailableHeight(viewportHeight);

  if (isMobile) {
    const squareSize = Math.max(
      PICKER_MIN_AVAILABLE_WIDTH,
      Math.min(PICKER_MOBILE_MAX_SQUARE_SIZE, availableWidth, availableHeight)
    );

    return { width: squareSize, height: squareSize };
  }

  const width = Math.max(PICKER_MIN_AVAILABLE_WIDTH, availableWidth);
  const height = Math.max(
    PICKER_MIN_AVAILABLE_HEIGHT,
    Math.min(
      availableHeight,
      PICKER_DESKTOP_MAX_HEIGHT,
      width / PICKER_DESKTOP_ASPECT_RATIO
    )
  );

  return { width, height };
}

function lowCountPickerFrameSize(
  totalTiles: number,
  viewportWidth: number,
  viewportHeight: number,
  baseFrame: { width: number; height: number }
): { width: number; height: number } {
  if (totalTiles > PICKER_LOW_COUNT_MAX) return baseFrame;

  const isDesktop = viewportWidth > PICKER_MOBILE_BREAKPOINT;
  const availableHeight = pickerAvailableHeight(viewportHeight);

  if (isDesktop) {
    const width = Math.min(baseFrame.width, PICKER_DESKTOP_LOW_COUNT_MAX_WIDTH);
    const height = Math.max(
      PICKER_MIN_AVAILABLE_HEIGHT,
      Math.min(
        availableHeight,
        PICKER_DESKTOP_MAX_HEIGHT,
        width / PICKER_DESKTOP_ASPECT_RATIO
      )
    );

    return { width, height };
  }

  const width = Math.min(baseFrame.width, PICKER_MOBILE_LOW_COUNT_MAX_SIZE);
  const height =
    totalTiles >= 5
      ? Math.min(availableHeight, PICKER_MOBILE_COLUMN_STACK_MAX_HEIGHT)
      : width;

  return { width, height };
}

function pickerMaxTileSize(totalTiles: number, isDesktop: boolean): number {
  if (totalTiles > PICKER_LOW_COUNT_MAX) return PICKER_MAX_TILE_SIZE;
  if (totalTiles === 1) {
    return isDesktop
      ? PICKER_SINGLE_BOT_TILE_SIZE_DESKTOP
      : PICKER_SINGLE_BOT_TILE_SIZE_MOBILE;
  }
  if (totalTiles <= 4) {
    return isDesktop
      ? PICKER_FEW_BOT_TILE_SIZE_DESKTOP
      : PICKER_FEW_BOT_TILE_SIZE_MOBILE;
  }

  return isDesktop
    ? PICKER_LOW_COUNT_TILE_SIZE_DESKTOP
    : PICKER_LOW_COUNT_TILE_SIZE_MOBILE;
}

function lowCountPickerContentHeight(
  totalTiles: number,
  pickerHeight: number,
  gridRows: number,
  tileSize: number,
  tileGap: number
): number {
  if (totalTiles > PICKER_LOW_COUNT_MAX) return pickerHeight;

  const contentHeight = gridRows * tileSize + Math.max(0, gridRows - 1) * tileGap;
  return Math.min(
    pickerHeight,
    Math.ceil(contentHeight + PICKER_LOW_COUNT_FRAME_VERTICAL_PAD)
  );
}

function scaledPickerBreakpoint(baseCount: number, pickerWidth: number): number {
  const linearScale = pickerWidth / PICKER_REFERENCE_SIZE;
  const scale = Math.max(
    PICKER_BREAKPOINT_SCALE_MIN,
    Math.min(
      PICKER_BREAKPOINT_SCALE_MAX,
      Math.pow(linearScale, PICKER_BREAKPOINT_SCALE_EXPONENT)
    )
  );
  return Math.max(1, Math.round(baseCount * scale));
}

function pickerStageBreakpoint(
  baseCount: number,
  pickerWidth: number,
  isDesktop: boolean
): number {
  const scaled = scaledPickerBreakpoint(baseCount, pickerWidth);
  return isDesktop ? Math.max(1, scaled) : scaled;
}

function pickerDensityBreakpoints(
  viewportWidth: number,
  viewportHeight: number
): PickerDensityBreakpoints {
  const { width: pickerWidth, height: pickerHeight } = pickerFrameSize(
    viewportWidth,
    viewportHeight
  );
  const isDesktop = viewportWidth > PICKER_MOBILE_BREAKPOINT;
  const densityWidth =
    isDesktop
      ? Math.min(pickerWidth, pickerHeight * PICKER_DESKTOP_ASPECT_RATIO)
      : pickerWidth;
  const namedFlatTileCountMin = isDesktop
    ? PICKER_NAMED_FLAT_DESKTOP_COUNT
    : PICKER_NAMED_FLAT_MOBILE_COUNT;
  const flatTileCountMin = PICKER_ICON_ONLY_FLAT_COUNT;
  const largeGlyphTileCountMin = pickerStageBreakpoint(
    LARGE_GLYPH_BASE_COUNT,
    densityWidth,
    isDesktop
  );
  const crosshairTileCountMin =
    flatTileCountMin +
    Math.round(
      (largeGlyphTileCountMin - flatTileCountMin) *
        PICKER_CROSSHAIR_STAGE_TWO_PROGRESS
    );
  const dotTileCountMin =
    flatTileCountMin +
    Math.round(
      (largeGlyphTileCountMin - flatTileCountMin) *
        PICKER_DOT_STAGE_TWO_PROGRESS
    );
  const glyphlessCardCountMin = pickerStageBreakpoint(
    GLYPHLESS_CARD_BASE_COUNT,
    densityWidth,
    isDesktop
  );
  const compactPixelGridCountMin = pickerStageBreakpoint(
    COMPACT_PIXEL_GRID_BASE_COUNT,
    densityWidth,
    isDesktop
  );
  const radialRainbowCountMin = pickerStageBreakpoint(
    RADIAL_RAINBOW_BASE_COUNT,
    densityWidth,
    isDesktop
  );

  return {
    namedFlatTileCountMin,
    flatTileCountMin,
    largeGlyphTileCountMin,
    crosshairTileCountMin,
    dotTileCountMin,
    glyphlessCardCountMin,
    compactPixelGridCountMin,
    radialRainbowCountMin,
  };
}

function pickerDensityStageTargets(
  viewportWidth: number,
  viewportHeight: number
): PickerDensityStageTarget[] {
  const breakpoints = pickerDensityBreakpoints(viewportWidth, viewportHeight);

  return [
    {
      id: 1,
      label: "Stage 1",
      description: "full cards",
      targetCount: Math.max(1, breakpoints.namedFlatTileCountMin - 1),
    },
    {
      id: 1.5,
      label: "Stage 1.5",
      description: "named flat cards",
      targetCount: breakpoints.namedFlatTileCountMin,
    },
    {
      id: 2,
      label: "Stage 2",
      description: "flat cards",
      targetCount: breakpoints.flatTileCountMin,
    },
    {
      id: 3,
      label: "Stage 3",
      description: "larger glyphs",
      targetCount: breakpoints.largeGlyphTileCountMin,
    },
    {
      id: 4,
      label: "Stage 4",
      description: "glyphless cards",
      targetCount: breakpoints.glyphlessCardCountMin,
    },
    {
      id: 5,
      label: "Stage 5",
      description: "pixel grid + dot",
      targetCount: breakpoints.compactPixelGridCountMin,
    },
    {
      id: 6,
      label: "Stage 6",
      description: "radial rainbow",
      targetCount: breakpoints.radialRainbowCountMin,
    },
  ];
}

/**
 * Trim a bot's system_prompt down to a compact preview suitable for the
 * empty-state / conversation-intro hint. Preserves the first paragraph
 * (treats `\n\n+` as a hard break), collapses intra-paragraph newlines,
 * and truncates at a word boundary if the result would exceed
 * `maxChars`. Empty input returns an empty string so the caller can
 * decide whether to render a fallback hint or nothing at all.
 */
function firstLinesOf(text: string | null | undefined, maxChars = 140): string {
  const raw =
    typeof text === "string" ? stripBotProfileMetaSuffix(text).trim() : "";
  if (!raw) return "";
  const firstPara = raw.split(/\n\n+/)[0]?.replace(/\n/g, " ").trim() ?? "";
  if (firstPara.length <= maxChars) return firstPara;
  const sliced = firstPara.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  // Only snap back to the last space if it lands reasonably far from
  // the start — otherwise mid-word truncation is better than a silly
  // one-or-two-word preview.
  const cut = lastSpace > maxChars * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.trim()}\u2026`;
}

function formatBotHeroSentence(value: string): string {
  return value.replace(
    /^(I am [^,]+,\s+)(A|An|The)\b/u,
    (_match, prefix: string, article: string) =>
      `${prefix}${article.toLocaleLowerCase()}`
  );
}

function botHeroPreview(text: string | null | undefined, maxChars = 140): string {
  const raw =
    typeof text === "string" ? stripBotProfileMetaSuffix(text).trim() : "";
  if (!raw) return "";
  const purposeMatch = raw.match(/(?:^|\n)Purpose:\s*\n\s*(You are .+?)(?:\n\n|$)/i);
  const purpose = purposeMatch?.[1]?.trim();
  const source = purpose || firstLinesOf(raw, maxChars);
  const firstPerson = formatBotHeroSentence(
    source.replace(/^You are\b/i, "I am")
  );
  if (firstPerson.length <= maxChars) return firstPerson;
  const sliced = firstPerson.slice(0, maxChars);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > maxChars * 0.6 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut.trim()}\u2026`;
}

/**
 * Geometry for the Chat-mode bot picker.
 *
 * Strategy:
 *   1. Claim a stable frame from the available viewport space.
 *   2. Pick a grid shape that follows the frame's aspect ratio.
 *   3. Fit each bot tile into that grid, shrinking tiles as count grows.
 *
 * Example outcomes:
 *   N=1  → 1×1, one capped tile centered inside the frame.
 *   Mobile N=9  → 3×3.
 *   Desktop N=10 → 5×2-ish widescreen rows.
 */
function pickerGridShape(
  totalTiles: number,
  pickerWidth: number,
  pickerHeight: number,
  preferredRows?: number,
  preferredCols?: number
): { cols: number; rows: number } {
  if (totalTiles <= 1) return { cols: 1, rows: 1 };
  if (preferredRows && preferredCols && totalTiles <= preferredRows * preferredCols) {
    return {
      cols: preferredCols,
      rows: preferredRows,
    };
  }
  if (preferredRows && totalTiles > preferredRows) {
    return {
      cols: Math.ceil(totalTiles / preferredRows),
      rows: preferredRows,
    };
  }
  const aspectRatio = Math.max(1, pickerWidth / Math.max(1, pickerHeight));
  if (aspectRatio > 1.2 && totalTiles <= 4) {
    return { cols: totalTiles, rows: 1 };
  }
  if (totalTiles === 3) {
    return { cols: 2, rows: 2 };
  }
  if (aspectRatio <= 1.2 && totalTiles >= 7 && totalTiles <= 9) {
    return { cols: 3, rows: Math.ceil(totalTiles / 3) };
  }
  if (aspectRatio <= 1.2 && totalTiles === 10) {
    return { cols: 4, rows: 3 };
  }
  if (aspectRatio <= 1.2 && totalTiles >= 5 && totalTiles <= 10) {
    return { cols: 2, rows: Math.ceil(totalTiles / 2) };
  }
  if (totalTiles <= 4) {
    const side = Math.ceil(Math.sqrt(totalTiles));
    return { cols: side, rows: side };
  }
  const cols = Math.max(1, Math.ceil(Math.sqrt(totalTiles * aspectRatio)));
  const rows = Math.max(1, Math.ceil(totalTiles / cols));
  return { cols, rows };
}

function pickerFormationCells<T>(
  items: T[],
  geom: PickerGeometry
): Array<T | null> {
  const cells = Array<T | null>(geom.gridCols * geom.gridRows).fill(null);
  let cellIndex = geom.leadingFillerCell ? 1 : 0;

  for (const item of items) {
    cells[cellIndex] = item;
    cellIndex += 1;
    if (cellIndex >= cells.length) break;
  }

  return cells;
}

interface PickerGeometryOptions {
  balanceOddRows?: boolean;
  preferredRows?: number;
  preferredCols?: number;
}

function pickerGeometry(
  totalTiles: number,
  viewportWidth: number,
  viewportHeight: number,
  options: PickerGeometryOptions = {}
): PickerGeometry {
  // Mobile owns the old square frame; desktop owns a widescreen frame whose
  // width scales with the available viewport. Density thresholds use the
  // viewport-derived width on desktop so short windows don't prematurely
  // collapse the visual treatment into later stages.
  const baseFrame = pickerFrameSize(
    viewportWidth,
    viewportHeight
  );
  const { width: pickerWidth, height: basePickerHeight } = lowCountPickerFrameSize(
    totalTiles,
    viewportWidth,
    viewportHeight,
    baseFrame
  );
  const isDesktop = viewportWidth > PICKER_MOBILE_BREAKPOINT;
  const pickerHeight =
    !isDesktop && totalTiles >= 5 && totalTiles <= 10
      ? Math.min(
          pickerAvailableHeight(viewportHeight),
          PICKER_MOBILE_COLUMN_STACK_MAX_HEIGHT
        )
      : basePickerHeight;
  const {
    namedFlatTileCountMin,
    flatTileCountMin,
    largeGlyphTileCountMin,
    crosshairTileCountMin,
    dotTileCountMin,
    glyphlessCardCountMin,
    compactPixelGridCountMin,
    radialRainbowCountMin,
  } = pickerDensityBreakpoints(viewportWidth, viewportHeight);
  const enlargeGlyph = totalTiles >= largeGlyphTileCountMin;
  const hideGlyphByDefault = totalTiles >= glyphlessCardCountMin;
  const isCompactPixelGrid = totalTiles >= compactPixelGridCountMin;
  const selectedDotGlyph = isCompactPixelGrid;
  const radialRainbowGradient =
    isCompactPixelGrid && totalTiles >= radialRainbowCountMin;
  const isSolidSwatch = isCompactPixelGrid;
  if (totalTiles <= 0) {
    return {
      pickerWidth,
      pickerHeight,
      tileSize: 192,
      glyphSize: 96,
      glyphStroke: 1.6,
      hoverScale: 1.06,
      tileGap: 14,
      gridCols: 1,
      gridRows: 1,
      fillerCells: 0,
      singleBot: false,
      threeBotStack: false,
      mobileColumnStack: false,
      leadingFillerCell: false,
      namedFlatTile: false,
      suppressMobileHeroCopy: false,
      flattenTile: false,
      enlargeGlyph: false,
      hideGlyphByDefault: false,
      crosshairCursor: false,
      dotCursor: false,
      solidSwatch: false,
      compactPixelGrid: false,
      selectedDotGlyph: false,
      radialRainbowGradient: false,
    };
  }

  // Breakpoints scale with available width. The ladder now removes one
  // visual affordance at a time: gradient, then larger glyphs, then glyphs,
  // then card chrome/pixel gaps, then the fully abstract rainbow field.
  const balanceOddRows = options.balanceOddRows ?? true;
  const leadingFillerCell =
    balanceOddRows && totalTiles > 10 && totalTiles % 2 === 1;
  const namedFlatTile =
    totalTiles >= namedFlatTileCountMin && totalTiles < flatTileCountMin;
  const gridOccupancyCount = totalTiles + (leadingFillerCell ? 1 : 0);
  const { cols, rows } = pickerGridShape(
    gridOccupancyCount,
    pickerWidth,
    pickerHeight,
    options.preferredRows,
    options.preferredCols
  );
  const fillerCells = cols * rows - gridOccupancyCount;
  const gap = isCompactPixelGrid
    ? 0
    : Math.max(
        isSolidSwatch ? 2 : 4,
        Math.min(
          14,
          Math.round(
            Math.min(
              pickerWidth * 0.018,
              rows > 1 ? pickerHeight * 0.012 : pickerWidth * 0.018
            )
          )
        )
      );
  const baseMaxTileSize = pickerMaxTileSize(totalTiles, isDesktop);
  const maxTileSize =
    !isDesktop && totalTiles === 3
      ? Math.min(PICKER_THREE_STACK_TILE_SIZE_MOBILE, baseMaxTileSize)
      : isDesktop && totalTiles > 1 && totalTiles <= 4
        ? Math.min(
            baseMaxTileSize,
            Math.floor((pickerWidth - (cols - 1) * gap) / cols)
          )
        : baseMaxTileSize;
  const tileSize = Math.min(
    maxTileSize,
    Math.floor(
      Math.min(
        (pickerWidth - (cols - 1) * gap) / cols,
        (pickerHeight - (rows - 1) * gap) / rows
      )
    )
  );
  const contentAlignedPickerHeight = lowCountPickerContentHeight(
    totalTiles,
    pickerHeight,
    rows,
    tileSize,
    gap
  );

  const glyphRatio = hideGlyphByDefault || isSolidSwatch
    ? 0
    : enlargeGlyph
      ? PICKER_STAGE_TWO_GLYPH_RATIO
      : PICKER_DEFAULT_GLYPH_RATIO;
  const glyphSize = Math.max(14, Math.round(tileSize * glyphRatio));
  const glyphStroke = botGlyphStrokeForSize(glyphSize);
  // Magnification target: dramatic on tiny tiles (where the small pop
  // still reads as a satisfying nudge), restrained on giant tiles (where
  // the same multiplier would pop the tile clear out of the empty-state
  // column). Break-points scale alongside the tile ladder: tiles sized
  // for 1-4 bots land in the 120+ "restrained" band, 5-16 bots sit in
  // the 80+ "medium" band, and denser packings get the strongest pop.
  // Values were halved (relative to "amount over 1.0") to soften the
  // first-stage zoom while keeping the relative shape across the ladder.
  const hoverScale = isCompactPixelGrid
    ? 1
    : tileSize >= 120
      ? 1.06
      : tileSize >= 80
        ? 1.1
        : 1.16;

  return {
    pickerWidth,
    pickerHeight: contentAlignedPickerHeight,
    tileSize,
    glyphSize,
    glyphStroke,
    hoverScale,
    tileGap: gap,
    gridCols: cols,
    gridRows: rows,
    fillerCells,
    singleBot: totalTiles === 1,
    threeBotStack: !isDesktop && totalTiles === 3,
    mobileColumnStack: !isDesktop && totalTiles >= 5 && totalTiles <= 10,
    leadingFillerCell,
    namedFlatTile,
    suppressMobileHeroCopy: false,
    flattenTile: totalTiles >= flatTileCountMin,
    enlargeGlyph,
    hideGlyphByDefault,
    crosshairCursor: totalTiles >= crosshairTileCountMin,
    dotCursor: totalTiles >= dotTileCountMin,
    solidSwatch: isSolidSwatch,
    compactPixelGrid: isCompactPixelGrid,
    selectedDotGlyph,
    radialRainbowGradient,
  };
}

function pickerUsesHueNavigation(geom: PickerGeometry, viewportWidth: number): boolean {
  const mobileLargeGrid =
    viewportWidth <= PICKER_MOBILE_BREAKPOINT && geom.enlargeGlyph;
  return mobileLargeGrid || geom.hideGlyphByDefault || geom.solidSwatch || geom.compactPixelGrid;
}

function updatePickerParallax(
  event: React.PointerEvent<HTMLButtonElement>
): void {
  if (event.pointerType !== "mouse") return;

  const picker = event.currentTarget.closest("[data-bot-picker-frame='true']");
  if (!(picker instanceof HTMLDivElement)) return;

  const rect = picker.getBoundingClientRect();
  const normalizedX = (event.clientX - rect.left) / rect.width - 0.5;
  const normalizedY = (event.clientY - rect.top) / rect.height - 0.5;
  const x = normalizedX * -2 * PICKER_PARALLAX_X;
  const y = normalizedY * -2 * PICKER_PARALLAX_Y;

  picker.style.setProperty(
    "--picker-parallax-x",
    `${x.toFixed(2)}px`
  );
  picker.style.setProperty(
    "--picker-parallax-y",
    `${y.toFixed(2)}px`
  );
}

function resetPickerParallax(element: HTMLDivElement): void {
  element.style.setProperty("--picker-parallax-x", "0px");
  element.style.setProperty("--picker-parallax-y", "0px");
}

// Hit-test the picker grid at a viewport coordinate and return the bot id
// of the tile under that point. Each tile button carries `data-bot-id`
// (set in the JSX) so we can reuse the existing element layout instead
// of recomputing grid coordinates against filler cells or the optional
// leading filler. Returns null when the point misses every tile (e.g.
// finger is over a placeholder, gap, or off the picker entirely) so
// callers can park the preview in a "no target" state.
function findBotIdAtPoint(x: number, y: number): string | null {
  if (typeof document === "undefined") return null;
  const target = document.elementFromPoint(x, y);
  if (!(target instanceof Element)) return null;
  const tile = target.closest("[data-bot-id]");
  if (!(tile instanceof HTMLElement)) return null;
  return tile.dataset.botId ?? null;
}

// ── Color math for the bot color wheel ────────────────────────────────
// The wheel paints a HSL hue ring via conic-gradient with a white-centered
// radial for saturation; these helpers map clicks on the wheel to/from hex.

function randomHexSeed(seedIndex?: number): string {
  // Seed from five PRISM wordmark hue families, not five exact hexes.
  // This keeps the library constrained to P/R/I/S/M while preserving the
  // subtle spectrum that makes large swatch grids readable.
  const safeSeedIndex =
    typeof seedIndex === "number"
      ? Math.max(0, Math.min(PRISM_WORDMARK_PALETTE.length - 1, seedIndex))
      : Math.floor(Math.random() * PRISM_WORDMARK_PALETTE.length);
  const seed = PRISM_WORDMARK_PALETTE[safeSeedIndex];
  const { h } = hexToHsl(seed);
  const hue =
    (h -
      PRISM_BOT_SEED_HUE_SPREAD_DEG / 2 +
      Math.random() * PRISM_BOT_SEED_HUE_SPREAD_DEG +
      360) %
    360;
  const saturation =
    PRISM_BOT_SEED_SATURATION_MIN +
    Math.random() * (PRISM_BOT_SEED_SATURATION_MAX - PRISM_BOT_SEED_SATURATION_MIN);
  const lightness =
    PRISM_BOT_SEED_LIGHTNESS_MIN +
    Math.random() * (PRISM_BOT_SEED_LIGHTNESS_MAX - PRISM_BOT_SEED_LIGHTNESS_MIN);
  return hslToHex(hue, saturation, lightness);
}

function botColorDistanceScore(aHex: string, bHex: string): number {
  const a = hexToHsl(aHex);
  const b = hexToHsl(bHex);
  const hueDistance = circularHueDistance(a.h, b.h) / 180;
  const saturationDistance = Math.abs(a.s - b.s) / 100;
  const lightnessDistance = Math.abs(a.l - b.l) / 100;
  return hueDistance * 0.68 + saturationDistance * 0.2 + lightnessDistance * 0.12;
}

function randomHex(existingHexes: readonly string[] = []): string {
  const existing = existingHexes
    .map((hex) => hex.trim())
    .filter((hex) => hexChannels(hex) !== null);
  if (existing.length === 0) return randomHexSeed();
  const normalizedExisting = existing.map((hex) => normalizeAccentForTheme(hex, "dark"));
  const segmentCounts = new Array<number>(PRISM_WORDMARK_PALETTE.length).fill(0);
  for (const hex of normalizedExisting) {
    const { h } = hexToHsl(hex);
    segmentCounts[hueLensSegmentIndexForHue(h)] += 1;
  }
  const prioritizedSegments = segmentCounts
    .map((count, segment) => ({ count, segment }))
    .sort((a, b) => a.count - b.count)
    .map((entry) => entry.segment);

  let bestCandidate = randomHexSeed(prioritizedSegments[0]);
  let bestMinDistance = -1;

  for (let attempt = 0; attempt < BOT_COLOR_DIVERSITY_SAMPLE_ATTEMPTS; attempt += 1) {
    const segment = prioritizedSegments[attempt % prioritizedSegments.length];
    const candidate = randomHexSeed(segment);
    const normalizedCandidate = normalizeAccentForTheme(candidate, "dark");
    let minDistance = Number.POSITIVE_INFINITY;
    for (const existingHex of normalizedExisting) {
      minDistance = Math.min(
        minDistance,
        botColorDistanceScore(normalizedCandidate, existingHex)
      );
    }
    if (minDistance > bestMinDistance) {
      bestMinDistance = minDistance;
      bestCandidate = candidate;
    }
    if (minDistance >= BOT_COLOR_DIVERSITY_MIN_DISTANCE) {
      return candidate;
    }
  }

  return bestCandidate;
}

function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number) =>
    lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (v: number) =>
    Math.round(v * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return { h: 0, s: 0, l: 50 };
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let s = 0;
  let h = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

// WCAG 2 color helpers, duplicated here so the frontend doesn't need to
// pull in the @localai/shared package at runtime. Mirrored in
// packages/shared/src/color.ts, which is where the unit tests live —
// keep these in sync if you tweak the math.

function hexChannels(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, "").trim();
  if (clean.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const parsed = hexChannels(hex);
  if (!parsed) return 0;
  const toLinear = (channel: number): number => {
    const n = channel / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = parsed;
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function pickReadableText(hex: string): string {
  // WCAG threshold: anything brighter than ~0.179 gets a higher contrast
  // ratio with near-black text than with white text. Bright limes and
  // yellows sit well above this; deep reds and blues sit well below.
  return relativeLuminance(hex) > 0.179 ? "#0b0b0d" : "#ffffff";
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function hexChannelToByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function mixHex(a: string, b: string, amount: number): string {
  const pa = hexChannels(a);
  const pb = hexChannels(b);
  if (!pa || !pb) return a;
  const t = Math.max(0, Math.min(1, amount));
  return `#${hexChannelToByte(pa[0] + (pb[0] - pa[0]) * t)}${hexChannelToByte(
    pa[1] + (pb[1] - pa[1]) * t
  )}${hexChannelToByte(pa[2] + (pb[2] - pa[2]) * t)}`;
}

// Darken/lighten a color toward black or white until it meets the target
// contrast ratio against `background`. Keeps the original hue recognisable
// as long as possible.
function ensureContrast(foreground: string, background: string, targetRatio = 4.5): string {
  if (contrastRatio(foreground, background) >= targetRatio) return foreground;
  const anchor = relativeLuminance(background) > 0.5 ? "#000000" : "#ffffff";
  let lo = 0;
  let hi = 1;
  let best: string = anchor;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const blended = mixHex(foreground, anchor, mid);
    if (contrastRatio(blended, background) >= targetRatio) {
      best = blended;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return best;
}

// Theme-specific baseline backgrounds. Kept as named constants so any
// helper that needs to reason about "what does --bg evaluate to right
// now?" doesn't have to duplicate literals. Mirrored in page.module.css
// under .themeDark / .themeLight — keep these in sync.
const THEME_BG: Record<"light" | "dark", string> = {
  light: "#eee7dc",
  dark: "#0b0a09",
};

// HSL lightness alone underestimates perceived brightness for warm yellows
// and oranges on the light theme's ivory surface. After hue-preserving HSL
// clamping, cap WCAG luminance so bot glyphs/tiles keep enough edge contrast.
const ACCENT_LUMINANCE_MAX_LIGHT = 0.42;
const ACCENT_LUMINANCE_MAX_LIGHT_YELLOW = 0.3;
const YELLOW_HUE_MIN = 40;
const YELLOW_HUE_MAX = 75;

// Clamp a color's luminance into [min, max] by blending toward black (to
// lower) or white (to raise). Used so light mode can't display eye-searing
// bright accents and dark mode can't display ink-black accents that
// disappear into the background.
function clampLuminance(hex: string, opts: { min?: number; max?: number }): string {
  const lum = relativeLuminance(hex);
  const runBinarySearch = (anchor: "#000000" | "#ffffff", target: number): string => {
    let lo = 0;
    let hi = 1;
    let best: string = anchor;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const blended = mixHex(hex, anchor, mid);
      const l = relativeLuminance(blended);
      const satisfies = anchor === "#000000" ? l <= target : l >= target;
      if (satisfies) {
        best = blended;
        hi = mid;
      } else {
        lo = mid;
      }
    }
    return best;
  };
  if (opts.max !== undefined && lum > opts.max) {
    return runBinarySearch("#000000", opts.max);
  }
  if (opts.min !== undefined && lum < opts.min) {
    return runBinarySearch("#ffffff", opts.min);
  }
  return hex;
}

// Build the --accent / --accent-text / --accent-ink triad for a given raw
// hex against the active theme background. Shared between the Sandbox
// bot-color override and the Chat-mode P-color pinning so both code paths
// apply the same clamp + contrast treatment.
function deriveAccentStyle(
  rawHex: string,
  resolvedTheme: "light" | "dark"
): React.CSSProperties {
  const themeBg = THEME_BG[resolvedTheme];
  const accent =
    resolvedTheme === "light"
      ? clampLuminance(rawHex, { max: 0.55 })
      : clampLuminance(rawHex, { min: 0.1 });
  const accentText = pickReadableText(accent);
  const accentInk = ensureContrast(accent, themeBg, 4.5);
  return {
    ["--accent" as string]: accent,
    ["--accent-text" as string]: accentText,
    ["--accent-ink" as string]: accentInk,
  } as React.CSSProperties;
}

// HSL-lightness band the color picker is allowed to produce. Clamping
// both ends (not just one) means bot colors never go dark enough to
// vanish into the dark-mode shell nor pale enough to wash out against
// the light-mode shell, while preserving shade variation in the middle.
//
// The "_DARK" pair compresses both ends 8 units toward L=50 so deep
// picks (pure blue, deep red) don't disappear against `#0b0a09` and
// pale picks don't glare — saturation stays identical, only L moves.
//
// Kept in lockstep with `ACCENT_LIGHTNESS_*` constants in
// packages/shared/src/color.ts. The picker math, the render-time
// clamp, and the CSS gradient overlays all key off these numbers — if
// you nudge the band, nudge all three places (here, the shared module,
// and the `.colorSquare` overlay alpha in page.module.css).
const ACCENT_LIGHTNESS_MIN = 30;
const ACCENT_LIGHTNESS_MAX = 70;
const ACCENT_LIGHTNESS_MIN_DARK = 38;
const ACCENT_LIGHTNESS_MAX_DARK = 62;

function accentLightnessBand(
  theme?: "light" | "dark"
): { min: number; max: number } {
  if (theme === "dark") {
    return { min: ACCENT_LIGHTNESS_MIN_DARK, max: ACCENT_LIGHTNESS_MAX_DARK };
  }
  return { min: ACCENT_LIGHTNESS_MIN, max: ACCENT_LIGHTNESS_MAX };
}

// Pull a color's HSL lightness into the safe band, preserving hue and
// saturation. The canonical normalizer for any surface painting a user-
// chosen bot color (bot card bar, glyph tile, message bubble, inline
// name glyph, swatch button, shell --accent triad). Unlike the older
// "pin to 50%" approach this keeps the shade a user picked whenever it
// already sits in-range, so two bots that differ only slightly in
// lightness still read as distinct colors — they just can't both race
// to near-white or near-black.
//
// Pass `theme: "dark"` to apply the tighter dark-mode band so the same
// user-chosen hex renders readable on both theme shells — a deep navy
// that sits at L=30 in light mode lifts to L=38 against the dark shell.
//
// Mirrors `clampAccentLightness` in packages/shared/src/color.ts — keep
// the two implementations in sync.
function clampAccentLightness(
  hex: string,
  theme?: "light" | "dark"
): string {
  const { h, s, l } = hexToHsl(hex);
  const { min, max } = accentLightnessBand(theme);
  const clamped = Math.max(min, Math.min(max, l));
  return hslToHex(h, s, clamped);
}

// Mirrors `normalizeAccentForTheme` in packages/shared/src/color.ts — keep
// the two implementations in sync. This is the canonical render-time bot
// accent normalizer for surfaces that paint user-chosen colors.
function normalizeAccentForTheme(hex: string, theme?: "light" | "dark"): string {
  const lightnessClamped = clampAccentLightness(hex, theme);
  if (theme === "dark") return lightnessClamped;
  const { h } = hexToHsl(lightnessClamped);
  const max = h >= YELLOW_HUE_MIN && h <= YELLOW_HUE_MAX
    ? ACCENT_LUMINANCE_MAX_LIGHT_YELLOW
    : ACCENT_LUMINANCE_MAX_LIGHT;
  return clampLuminance(lightnessClamped, { max });
}

// --bg-surface hex per theme. Mirrored from .themeDark / .themeLight in
// page.module.css so the swatch-border compensator can reason about what
// surface the swatch actually sits on.
const THEME_SURFACE_BG: Record<"light" | "dark", string> = {
  light: "#faf3e9",
  dark: "#151311",
};
const COMPOSE_BOT_LIGHT_INK_CONTRAST_RATIO = 5.8;

function botAccentStyle(
  rawHex: string | null | undefined,
  resolvedTheme: "light" | "dark"
): React.CSSProperties | undefined {
  const raw = rawHex?.trim();
  if (!raw) return undefined;
  const accent = normalizeAccentForTheme(raw, resolvedTheme);
  const ink = ensureContrast(accent, THEME_SURFACE_BG[resolvedTheme], 4.5);
  return {
    ["--bot-color" as string]: accent,
    ["--bot-ink" as string]: ink,
  } as React.CSSProperties;
}

// Sidebar conversation row border shade compensation. Emits a 0..100
// integer percent so the consumer can apply the blend in CSS
// (`color-mix(var(--row-color), var(--fg) X%)`). Keeping the computation
// off the CSS side gives us control over easing without shipping a bigger
// CSS expression per row.
//
// Semantics: a conversation tile fill is ~22% of the bot color over the
// theme surface. When the bot color is bright on a light theme (or dark
// on a dark theme), the effective fill reads very close to the surface
// and the row border needs to lean toward --fg for visibility. When the
// fill has healthy contrast already (mid-band pinks, teals, oranges),
// the border stays close to the bot color itself so the row keeps its
// brand identity.
function rowBorderMixPercent(
  fillHex: string,
  resolvedTheme: "light" | "dark"
): number {
  const surface = THEME_SURFACE_BG[resolvedTheme];
  const ratio = contrastRatio(fillHex, surface);
  // Mid-band bot colors get a gentle nudge toward --fg too — keeps the
  // border readable over the actual 22% tint rather than the raw color.
  const START = 2.5;
  const END = 1.05;
  const raw = Math.max(0, Math.min(1, (START - ratio) / (START - END)));
  const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
  return Math.round(eased * 100);
}

type Provider = "local" | "openai";
type Theme = "dark" | "light" | "system";
type PanelView = null | "settings" | "bots" | "images" | "memories";
type MemoryPanelScope = "bot" | "default" | "session" | "all";
type ClientAccessState = "checking" | "allowed" | "blocked";
const AUTO_TITLE_REFRESH_DELAYS_MS = [1500, 4000, 8000] as const;
// Which post-auth surface is currently rendered. "hub" is the landing
// screen shown after login; each mode tile navigates to a specific
// experience. Future modes can be advertised as disabled Hub tiles
// without entering this route union until their shells actually exist.
type View = "hub" | "chat" | "sandbox";

interface SessionUser { id: string; email: string; displayName: string; theme: Theme; preferredProvider: Provider; }
interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string;
  /** Bot locked to this chat when it was first created; `null` = default grayscale persona. */
  botId: string | null;
  /** Private chat flag — drives the sidebar privacy marker and, when opened, the grayscale-shell override. */
  incognito: boolean;
  /** Bot id of the most recent assistant message; null for Default-last OR no-reply-yet (disambiguate via hasAssistantReply). */
  lastBotId: string | null;
  /** Denormalized color of the last-spoken bot; null when lastBotId is null. */
  lastBotColor: string | null;
  /** True when the conversation has at least one assistant reply; distinguishes "Default was last" from "no reply yet". */
  hasAssistantReply: boolean;
}
interface ConversationGroupSummary {
  key: string;
  botId: string | null;
  name: string;
  glyph: BotGlyphName;
  color: string | null;
  count: number;
  conversations: ConversationSummary[];
  latestUpdatedAt: string;
  unread: boolean;
}
type SidebarConversationItem =
  | { kind: "conversation"; conversation: ConversationSummary }
  | { kind: "group"; group: ConversationGroupSummary };
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  provider?: Provider;
  model?: string;
  botName?: string;
  botColor?: string;
  botGlyph?: string;
}

type StatusTag = "human" | "local" | "online";

const STATUS_LABEL: Record<StatusTag, string> = {
  human: "HUMAN",
  local: "LOCAL ASSISTANT",
  online: "ONLINE ASSISTANT",
};

function getMessageStatus(msg: Message): StatusTag | null {
  if (msg.role === "user") return "human";
  if (msg.provider === "openai") return "online";
  if (msg.provider === "local") return "local";
  // Pre-existing assistant messages without a provider record: no indicator.
  return null;
}

/** Line shown while the assistant slot is loading — variant index from hash(salt). */
const GENERATING_PHRASE_BUILDERS = [
  (name: string) => `${name} is thinking`,
  (name: string) => `${name} is composing`,
  (name: string) => `${name} is shaping a reply`,
  (name: string) => `${name} is gathering words`,
  (name: string) => `${name} is tuning in`,
  (name: string) => `${name} is reflecting`,
] as const;

function hashToUnsignedInt(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pickGeneratingLabel(displayName: string, salt: string): string {
  const idx = hashToUnsignedInt(salt) % GENERATING_PHRASE_BUILDERS.length;
  return GENERATING_PHRASE_BUILDERS[idx](displayName);
}
interface ConversationDetail {
  id: string;
  title: string;
  /** Bot locked to this conversation at start. Null = PRISM Default / no custom bot. */
  botId: string | null;
  /** Private chat flag — saved chats read it from storage; private sessions receive it from the ephemeral API response. */
  incognito: boolean;
  /** Bot id of the most recent assistant message; null for Default-last OR no-reply-yet. */
  lastBotId: string | null;
  /** Denormalized color of the last-spoken bot; mirrors the list-endpoint field for post-send UI consistency. */
  lastBotColor: string | null;
  /** True when the conversation has at least one assistant reply; see ConversationSummary for disambiguation semantics. */
  hasAssistantReply: boolean;
  messages: Message[];
}

/** POST /api/chat success envelope — `conversationStarters` only appears after “Talk to me!”. */
interface ChatPostEnvelope {
  conversation: ConversationDetail;
  conversationStarters?: string[];
  memoryLearned?: {
    created?: MemoryEventPayload[];
    retracted?: MemoryEventPayload[];
    rejected?: MemoryRejectedEventPayload[];
    maxConfidence?: number;
  };
}
interface UserSettings {
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: boolean;
  autoMemory: boolean;
  hiddenBotModelIds: string[];
  hasOpenAiApiKey: boolean;
  ollamaModel: string;
  secondaryOllamaHost: string;
}
interface PairingCode {
  code: string;
  expiresAt: string;
}
interface UserMemory {
  id: string;
  conversationId?: string;
  botId?: string;
  createdAt: string;
  confidence: number;
  text: string;
  source?: "direct" | "inferred" | "compiled";
  certainty?: number;
  sourceMessageIds?: string[];
}

type MemoryValidationStatus = "approved" | "auto_fixed";
type MemoryValidationReasonCode =
  | "subject_role_confusion"
  | "assistant_identity_instruction"
  | "task_request_not_memory"
  | "question_fragment"
  | "trailing_conversation_tag"
  | "lost_preference_payload"
  | "contradiction"
  | "low_confidence"
  | "malformed_text"
  | "validator_error";

interface MemoryEventPayload {
  id: string;
  text: string;
  botId: string | null;
  conversationId?: string;
  confidence: number;
  source?: "direct" | "inferred" | "compiled";
  certainty?: number;
  sourceMessageIds?: string[];
  validationStatus?: MemoryValidationStatus;
  originalText?: string;
  reasonCodes?: MemoryValidationReasonCode[];
}

interface MemoryRejectedEventPayload {
  originalText: string;
  reasonCodes: MemoryValidationReasonCode[];
  notes?: string;
}

type MemoryToast =
  | {
      id: string;
      kind: "created" | "retracted";
      memory: MemoryEventPayload;
      expiresAt: number;
    }
  | {
      id: string;
      kind: "rejected";
      rejected: MemoryRejectedEventPayload;
      expiresAt: number;
    };
interface ModelCatalogEntry {
  id: string;
  label: string;
  provider: Provider;
  isDefault?: boolean;
  localHost?: "primary" | "secondary";
  hostLabel?: string;
}
interface ModelCatalog {
  local: ModelCatalogEntry[];
  online: ModelCatalogEntry[];
  defaults: {
    local: string;
    online: string;
  };
}
interface SecondaryOllamaStatus {
  configured: boolean;
  reachable: boolean;
  modelCount: number;
}
type SecondaryOllamaUiStatus =
  | "unconfigured"
  | "checking"
  | "connected"
  | "empty"
  | "error";
interface Bot {
  id: string;
  name: string;
  system_prompt: string;
  model: string | null;
  local_model: string | null;
  online_model: string | null;
  online_enabled?: number | null;
  delete_protected?: number | null;
  temperature: number;
  max_tokens: number;
  color: string | null;
  glyph: string | null;
  chat_enabled: number;
}

const BOT_COLOR_SORT_GRAYSCALE_SATURATION_MAX = 6;
const BOT_COLOR_SORT_GRAYSCALE_GROUP = 10;
const BOT_COLOR_SORT_COLORLESS_GROUP = 11;
// Hue lens ribbon — active lens movement pans a fixed-size window across
// a circular hue-sorted bot strip. Sparse libraries can show every bot,
// while dense libraries move through many more bots over the same slider
// travel because the center index scales with total ribbon length.
const HUE_RIBBON_MIN_VISIBLE_BOTS = 3;
const HUE_RIBBON_DESKTOP_COLUMNS = 12;
const HUE_RIBBON_DESKTOP_ROWS = 3;
const HUE_RIBBON_MOBILE_COLUMNS = 5;
const HUE_RIBBON_MOBILE_ROWS = 6;
const HUE_LENS_RAIL_BG_LIGHT = "color-mix(in srgb, #000000 16%, transparent)";
const HUE_LENS_RAIL_BG_DARK = "color-mix(in srgb, #ffffff 28%, transparent)";
const HUE_LENS_THUMB_FILL_LIGHT = "#12100e";
const HUE_LENS_THUMB_FILL_DARK = "#f4f1ea";
const HUE_LENS_THUMB_SHADOW_LIGHT = "0 2px 6px rgba(0, 0, 0, 0.28)";
const HUE_LENS_THUMB_SHADOW_DARK = "0 2px 7px rgba(0, 0, 0, 0.52)";
const HUE_LENS_FOCUS_RING_LIGHT = "0 0 0 2px color-mix(in srgb, #000000 35%, transparent)";
const HUE_LENS_FOCUS_RING_DARK = "0 0 0 2px color-mix(in srgb, #ffffff 54%, transparent)";
const BOT_PICKER_RETURN_ANIMATION_MS = 360;
const BOT_PANEL_DASHBOARD_MIN_BOTS = 1;
const BOT_PANEL_COLOR_HARMONY_MIN_BOTS = 40;
const BOT_PANEL_COLOR_HARMONY_STRENGTH = 0.42;
const BOT_PANEL_COLOR_HARMONY_SATURATION_TARGET = 70;
const BOT_PANEL_COLOR_HARMONY_LIGHTNESS_TARGET_DARK = 44;
const BOT_PANEL_COLOR_HARMONY_LIGHTNESS_TARGET_LIGHT = 46;

const AUTO_MODEL_CHOICE = "auto";
const ONLINE_MODEL_FALLBACK_ID = "gpt-4o-mini";
const BOT_TEMPERATURE_DEFAULT = 0.7;
const BOT_TEMPERATURE_MIN = 0;
const BOT_TEMPERATURE_MAX = 1.2;
const BOT_TEMPERATURE_STEP = "any";
const BOT_REPLY_LENGTH_PRESETS = [
  {
    id: "short",
    label: "Quick",
    tokens: 768,
    description: "Best for fast, low-friction replies.",
  },
  {
    id: "medium",
    label: "Roomy",
    tokens: 2048,
    description: "Enough space for detail without turning every answer into an essay.",
  },
  {
    id: "long",
    label: "Deep dive",
    tokens: 4096,
    description: "Gives the bot room to reason, explain, and explore.",
  },
] as const;
const BOT_REPLY_LENGTH_DEFAULT_TOKENS = 2048;
const BOT_RANDOM_TEMPERATURES = [0.25, 0.45, 0.7, 0.95, 1.1] as const;

type BotProfileBuilderPageId = "purpose" | "personality" | "character";

const BOT_PROFILE_BUILDER_PAGE_ORDER: readonly BotProfileBuilderPageId[] = [
  "purpose",
  "personality",
  "character",
] as const;

const BOT_PROFILE_BUILDER_PAGE_LABELS: Record<BotProfileBuilderPageId, string> = {
  purpose: "Purpose",
  personality: "Personality",
  character: "Character",
};

const BOT_PROFILE_PAGE_COPY: Record<
  BotProfileBuilderPageId,
  { label: string; description: string }
> = {
  purpose: {
    label: "Purpose",
    description: "The one line that explains what this bot is here to be.",
  },
  personality: {
    label: "Personality",
    description: "Temperament, style, interests, and boundaries.",
  },
  character: {
    label: "Character",
    description: "Identity, appearance, and optional worldview in one place.",
  },
};

function blankBotProfile(): BotProfileFields {
  return parseStoredBotPrompt("").fields;
}

function randomArrayItem<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)] ?? values[0];
}

function randomBotTemperatureSetting(): number {
  return randomArrayItem(BOT_RANDOM_TEMPERATURES);
}

function randomBotReplyLengthTokens(): number {
  return randomArrayItem(BOT_REPLY_LENGTH_PRESETS).tokens;
}

function profileTextFilled(...values: Array<string | null | undefined>): number {
  return values.filter((value) => typeof value === "string" && value.trim()).length;
}

function profileScaleFilled(...values: Array<BotProfileScaleValue | null>): number {
  return values.filter((value) => value !== null).length;
}

function botProfileCategoryCount(
  profile: BotProfileFields,
  category: BotProfileBuilderPageId
): number {
  switch (category) {
    case "purpose":
      return profileTextFilled(profile.purpose.statement, profile.purpose.legacyNotes);
    case "personality":
      return (
        profileTextFilled(
          profile.core.traits,
          profile.core.interests,
          profile.core.boundaries,
          profile.core.quirks
        ) + profileScaleFilled(
          profile.core.openness,
          profile.core.conscientiousness,
          profile.core.extraversion,
          profile.core.agreeableness,
          profile.core.emotionalStability,
          profile.core.humor,
          profile.core.curiosity,
          profile.core.directness
        )
      );
    case "character":
      return (
        profileTextFilled(
          profile.identity.age,
          profile.identity.species,
          profile.identity.pronouns,
          profile.identity.background,
          profile.identity.role,
          profile.worldview.religion,
          profile.worldview.values,
          profile.appearance.description,
          profile.appearance.style,
          profile.appearance.presence
        )
        + profileScaleFilled(
          profile.worldview.politicalView,
          profile.worldview.optimism,
          profile.worldview.tradition
        )
      );
    default:
      return 0;
  }
}

function botProfileCategorySummary(
  profile: BotProfileFields,
  category: BotProfileBuilderPageId,
  botName: string
): string {
  const count = botProfileCategoryCount(profile, category);
  if (category === "purpose") {
    return profile.purpose.statement.trim() || defaultBotPurpose(botName) || "Name the bot to seed a purpose";
  }
  if (count === 0) return "Optional details not set";
  return count === 1 ? "1 detail set" : `${count} details set`;
}

function botProfileCategoryComplete(
  profile: BotProfileFields,
  category: BotProfileBuilderPageId,
  botName: string
): boolean {
  if (category === "purpose") {
    return Boolean(profile.purpose.statement.trim() || botName.trim());
  }
  return botProfileCategoryCount(profile, category) > 0;
}

function botProfileCompletionCount(profile: BotProfileFields): number {
  return BOT_PROFILE_BUILDER_PAGE_ORDER.reduce(
    (total, category) => total + (botProfileCategoryCount(profile, category) > 0 ? 1 : 0),
    0
  );
}

/** True if the top bot form has any user-authored create-mode content. */
function createBotFormHasEnteredData(options: {
  name: string;
  profile: BotProfileFields;
  localModel: string;
  onlineModel: string;
  onlineEnabled: boolean;
  deleteProtected: boolean;
  temperature: number;
  maxTokens: number;
}): boolean {
  if (options.name.trim().length > 0) return true;
  if (botProfileCompletionCount(options.profile) > 0) return true;
  if (options.localModel !== AUTO_MODEL_CHOICE) return true;
  if (options.onlineModel !== AUTO_MODEL_CHOICE) return true;
  if (!options.onlineEnabled) return true;
  if (options.deleteProtected) return true;
  if (options.temperature !== BOT_TEMPERATURE_DEFAULT) return true;
  if (options.maxTokens !== BOT_REPLY_LENGTH_DEFAULT_TOKENS) return true;
  return false;
}

function normalizeBotTemperature(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return BOT_TEMPERATURE_DEFAULT;
  }
  const clamped = Math.min(
    BOT_TEMPERATURE_MAX,
    Math.max(BOT_TEMPERATURE_MIN, value)
  );
  return Number(clamped.toFixed(2));
}

function botTemperatureLabel(value: number): string {
  if (value <= 0.35) return "Focused";
  if (value >= 0.9) return "Adventurous";
  return "Balanced";
}

function botTemperatureDescription(value: number): string {
  if (value <= 0.35) {
    return "Stays close to your instructions and repeats itself less.";
  }
  if (value >= 0.9) {
    return "More willing to riff, surprise you, and try unusual phrasing.";
  }
  return "A middle path: steady enough for usefulness, lively enough for personality.";
}

function normalizeBotMaxTokens(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return BOT_REPLY_LENGTH_DEFAULT_TOKENS;
  }
  return Math.round(value);
}

function botReplyLengthPresetForTokens(tokens: number) {
  return BOT_REPLY_LENGTH_PRESETS.find((preset) => preset.tokens === tokens) ?? null;
}

function normalizeModelChoice(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : AUTO_MODEL_CHOICE;
}

const SECONDARY_OLLAMA_MODEL_PREFIX = "ollama-secondary:";
const REQUIRED_PRIMARY_LOCAL_MODEL_ID = "llama3.2";

function modelLabelFromId(id: string): string {
  const parts = id
    .split(/[-_:]/)
    .filter(Boolean)
    .filter((part, index, allParts) =>
      !(index === allParts.length - 1 && part.toLowerCase() === "latest")
    );
  const displayParts = parts.length > 0 ? parts : [id];
  return displayParts
    .map((part) =>
      part.toUpperCase() === part
        ? part
        : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`
    )
    .join(" ");
}

function localModelDuplicateKey(model: ModelCatalogEntry): string {
  const rawId = model.id.startsWith(SECONDARY_OLLAMA_MODEL_PREFIX)
    ? model.id.slice(SECONDARY_OLLAMA_MODEL_PREFIX.length)
    : model.id;
  return modelLabelFromId(rawId).toLocaleLowerCase();
}

function preferPrimaryLocalModelEntries(models: ModelCatalogEntry[]): ModelCatalogEntry[] {
  const primaryKeys = new Set(
    models
      .filter((model) => model.localHost !== "secondary")
      .map(localModelDuplicateKey)
  );
  return models.filter(
    (model) =>
      model.localHost !== "secondary" || !primaryKeys.has(localModelDuplicateKey(model))
  );
}

function isRequiredPrimaryLocalModel(model: ModelCatalogEntry): boolean {
  return (
    model.provider === "local" &&
    model.localHost !== "secondary" &&
    model.id === REQUIRED_PRIMARY_LOCAL_MODEL_ID
  );
}

function modelOptionsForProvider(
  catalog: ModelCatalog | null,
  settings: UserSettings | null,
  provider: Provider
): ModelCatalogEntry[] {
  if (provider === "local") {
    const fallbackId = settings?.ollamaModel?.trim() || "Local default";
    return catalog?.local.length
      ? preferPrimaryLocalModelEntries(catalog.local)
      : [{ id: fallbackId, label: fallbackId, provider: "local", isDefault: true }];
  }
  return catalog?.online.length
    ? catalog.online
    : [{
        id: ONLINE_MODEL_FALLBACK_ID,
        label: "GPT 4o Mini",
        provider: "openai",
        isDefault: true,
      }];
}

function botCustomizerModelOptionsForProvider(
  catalog: ModelCatalog | null,
  settings: UserSettings | null,
  provider: Provider
): ModelCatalogEntry[] {
  return availableModelOptionsForProvider(catalog, settings, provider);
}

function availableModelOptionsForProvider(
  catalog: ModelCatalog | null,
  settings: UserSettings | null,
  provider: Provider
): ModelCatalogEntry[] {
  const hidden = new Set(settings?.hiddenBotModelIds ?? []);
  return modelOptionsForProvider(catalog, settings, provider).filter(
    (model) => isRequiredPrimaryLocalModel(model) || !hidden.has(model.id)
  );
}

function botCustomizerModelChoiceVisible(
  settings: UserSettings | null,
  choice: string
): boolean {
  return (
    choice === REQUIRED_PRIMARY_LOCAL_MODEL_ID ||
    choice === AUTO_MODEL_CHOICE ||
    !new Set(settings?.hiddenBotModelIds ?? []).has(choice)
  );
}

function visibleBotCustomizerModelChoice(
  settings: UserSettings | null,
  choice: string
): string {
  return botCustomizerModelChoiceVisible(settings, choice)
    ? choice
    : AUTO_MODEL_CHOICE;
}

function allBotCustomizerModelOptions(
  catalog: ModelCatalog | null,
  settings: UserSettings | null
): ModelCatalogEntry[] {
  const seen = new Set<string>();
  return (["local", "openai"] as const)
    .flatMap((provider) => modelOptionsForProvider(catalog, settings, provider))
    .filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
}

function includeSelectedModelOption(
  options: ModelCatalogEntry[],
  choice: string,
  provider: Provider
): ModelCatalogEntry[] {
  if (choice === AUTO_MODEL_CHOICE || options.some((model) => model.id === choice)) {
    return options;
  }
  return [
    ...options,
    { id: choice, label: choice, provider },
  ];
}

function blendToward(value: number, target: number, amount: number): number {
  return value + (target - value) * amount;
}

function botColorFamilyGroup(hue: number): number {
  if (hue < 15 || hue >= 345) return 0; // red
  if (hue < 45) return 1; // orange
  if (hue < 75) return 2; // yellow
  if (hue < 110) return 3; // lime
  if (hue < 155) return 4; // green
  if (hue < 240) return 5; // cyan/blue
  if (hue < 275) return 7; // indigo
  if (hue < 315) return 8; // violet
  return 9; // magenta
}

function botHueSortValue(hue: number): number {
  return hue >= 345 ? hue - 360 : hue;
}

// Smallest angular distance between two hues on the 360° wheel. Both
// inputs are normalized into [0, 360) first so callers don't have to
// pre-clamp slider values that drift slightly outside the range.
function circularHueDistance(a: number, b: number): number {
  const wrap = (value: number): number => {
    const mod = value % 360;
    return mod < 0 ? mod + 360 : mod;
  };
  const diff = Math.abs(wrap(a) - wrap(b));
  return Math.min(diff, 360 - diff);
}

// True when a bot has a usable, non-grayscale color the hue lens can
// match against. Uncolored or near-grayscale bots intentionally fall
// out of the filter so the lens reads as "show me bots in this hue
// band" rather than "show me everything tinted at all".
function botHasFilterableColor(bot: Bot): boolean {
  const raw = bot.color?.trim();
  if (!raw || !hexChannels(raw)) return false;
  const { s } = hexToHsl(raw);
  return s > BOT_COLOR_SORT_GRAYSCALE_SATURATION_MAX;
}

// Hue availability buckets — the lens slider's gradient and the dense
// color-map's snap behavior both need a histogram of which hue families
// the user actually owns. Twelve 30° buckets keep adjacent families
// (red/orange/yellow) visually distinct on the slider while still being
// coarse enough that snapping to a region doesn't feel jittery near a
// boundary.
const HUE_BUCKET_COUNT = 12;
const HUE_BUCKET_WIDTH_DEG = 360 / HUE_BUCKET_COUNT;

interface HueBucket {
  /** Hue (degrees) at the center of this bucket. */
  center: number;
  /** Number of filterable bots whose color falls in this bucket. */
  count: number;
}

interface HueLensTrackSegment {
  prismIndex: number;
  color: string;
}

const EMPTY_HUE_LENS_TRACK_SEGMENTS: readonly HueLensTrackSegment[] = [];
const PRISM_HUE_LENS_TRACK_SEGMENTS: readonly HueLensTrackSegment[] =
  PRISM_WORDMARK_PALETTE.map((color, prismIndex) => ({ prismIndex, color }));

function hueBucketIndex(hue: number): number {
  const wrapped = ((hue % 360) + 360) % 360;
  return Math.min(
    HUE_BUCKET_COUNT - 1,
    Math.floor(wrapped / HUE_BUCKET_WIDTH_DEG)
  );
}

function hueBucketCenter(index: number): number {
  return index * HUE_BUCKET_WIDTH_DEG + HUE_BUCKET_WIDTH_DEG / 2;
}

// Tally bot hues into a fixed-width bucket histogram, ignoring
// uncolored/grayscale bots so the lens reflects only the population it
// can actually filter against.
function computeHueBuckets(bots: readonly Bot[]): HueBucket[] {
  const counts = new Array<number>(HUE_BUCKET_COUNT).fill(0);
  for (const bot of bots) {
    if (!botHasFilterableColor(bot)) continue;
    const { h } = hexToHsl(bot.color!.trim());
    counts[hueBucketIndex(h)] += 1;
  }
  return counts.map((count, i) => ({ center: hueBucketCenter(i), count }));
}

function hueLensSegmentIndexForHue(hue: number): number {
  const prismHues = PRISM_WORDMARK_PALETTE.map((color) => hexToHsl(color).h);
  let segmentIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < prismHues.length; i += 1) {
    const distance = circularHueDistance(prismHues[i], hue);
    if (distance < bestDistance) {
      bestDistance = distance;
      segmentIndex = i;
    }
  }
  return segmentIndex;
}

function hueLensPositionForHue(hue: number): number {
  const prismHues = PRISM_WORDMARK_PALETTE.map((color) => hexToHsl(color).h);
  const segmentIndex = hueLensSegmentIndexForHue(hue);
  const segmentWidth = 360 / prismHues.length;
  const center = segmentIndex * segmentWidth + segmentWidth / 2;
  const signedHueOffset =
    (((hue - prismHues[segmentIndex] + 540) % 360) - 180) /
    (PRISM_BOT_SEED_HUE_SPREAD_DEG / 2);
  const maxOffset = segmentWidth / 2 - 1;
  const offset = Math.max(-maxOffset, Math.min(maxOffset, signedHueOffset * maxOffset));
  return Math.max(0, Math.min(359, center + offset));
}

function computeHueLensTrackSegments(bots: readonly Bot[]): HueLensTrackSegment[] {
  const populatedSegments = new Array<boolean>(PRISM_WORDMARK_PALETTE.length).fill(false);
  for (const bot of bots) {
    if (!botHasFilterableColor(bot)) continue;
    const { h } = hexToHsl(bot.color!.trim());
    populatedSegments[hueLensSegmentIndexForHue(h)] = true;
  }
  return populatedSegments.flatMap((populated, prismIndex) =>
    populated
      ? [{ prismIndex, color: PRISM_WORDMARK_PALETTE[prismIndex] }]
      : []
  );
}

// Build the lens track from the bot colors that actually exist. Populated
// families expand to fill the whole rail, so a one-green-bot library paints
// one full-width green bar instead of a green island with empty gaps.
function hueLensGradient(
  segments: readonly HueLensTrackSegment[],
  theme: "light" | "dark"
): string {
  if (segments.length === 0) {
    return "linear-gradient(to right, transparent 0%, transparent 100%)";
  }
  const stops: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const color = normalizeAccentForTheme(segments[i].color, theme);
    const start = (i / segments.length) * 100;
    const end = ((i + 1) / segments.length) * 100;
    stops.push(`${color} ${start.toFixed(2)}%`);
    stops.push(`${color} ${end.toFixed(2)}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

function hueLensFilterCenterForSliderValue(
  sliderValue: number,
  segments: readonly HueLensTrackSegment[]
): number {
  if (segments.length === 0) return sliderValue;
  const clamped = Math.max(0, Math.min(359, sliderValue));
  const compactSegmentWidth = 360 / segments.length;
  const compactIndex = Math.min(
    segments.length - 1,
    Math.floor(clamped / compactSegmentWidth)
  );
  const compactStart = compactIndex * compactSegmentWidth;
  const progress = (clamped - compactStart) / compactSegmentWidth;
  const prismSegmentWidth = 360 / PRISM_WORDMARK_PALETTE.length;
  const prismStart = segments[compactIndex].prismIndex * prismSegmentWidth;
  return Math.max(0, Math.min(359, prismStart + progress * prismSegmentWidth));
}

function hueLensSliderValueForFilterCenter(
  hueCenter: number,
  segments: readonly HueLensTrackSegment[]
): number {
  if (segments.length === 0) return hueCenter;
  const prismSegmentWidth = 360 / PRISM_WORDMARK_PALETTE.length;
  const compactSegmentWidth = 360 / segments.length;
  const prismIndex = Math.min(
    PRISM_WORDMARK_PALETTE.length - 1,
    Math.floor(Math.max(0, Math.min(359, hueCenter)) / prismSegmentWidth)
  );
  let compactIndex = segments.findIndex((segment) => segment.prismIndex === prismIndex);
  if (compactIndex < 0) {
    compactIndex = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < segments.length; i += 1) {
      const center = segments[i].prismIndex * prismSegmentWidth + prismSegmentWidth / 2;
      const distance = Math.abs(center - hueCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        compactIndex = i;
      }
    }
    return compactIndex * compactSegmentWidth + compactSegmentWidth / 2;
  }
  const prismStart = prismIndex * prismSegmentWidth;
  const progress = (hueCenter - prismStart) / prismSegmentWidth;
  return Math.max(
    0,
    Math.min(359, compactIndex * compactSegmentWidth + progress * compactSegmentWidth)
  );
}

function compareBotsByHueRibbonPosition(a: Bot, b: Bot): number {
  const aColor = a.color?.trim();
  const bColor = b.color?.trim();
  const aPosition = aColor ? hueLensPositionForHue(hexToHsl(aColor).h) : 0;
  const bPosition = bColor ? hueLensPositionForHue(hexToHsl(bColor).h) : 0;
  return (
    aPosition - bPosition ||
    a.name.localeCompare(b.name) ||
    a.id.localeCompare(b.id)
  );
}

function hueRibbonWindowSize(
  totalBots: number,
  viewportWidth: number,
  viewportHeight: number,
  preferredRows?: number,
  preferredCols?: number
): number {
  if (totalBots <= 0) return 0;
  if (preferredRows && preferredCols) {
    return Math.min(totalBots, preferredRows * preferredCols);
  }
  const { flatTileCountMin } = pickerDensityBreakpoints(
    viewportWidth,
    viewportHeight
  );
  const showAllMax = Math.max(
    HUE_RIBBON_MIN_VISIBLE_BOTS,
    flatTileCountMin - 1
  );
  const targetCount =
    totalBots <= showAllMax
      ? totalBots
      : Math.min(
          totalBots,
          Math.max(HUE_RIBBON_MIN_VISIBLE_BOTS, flatTileCountMin)
        );

  for (let offset = 0; offset < totalBots; offset += 1) {
    const larger = targetCount + offset;
    if (
      larger <= totalBots &&
      hueRibbonWindowFillsGrid(larger, viewportWidth, viewportHeight, preferredRows)
    ) {
      return larger;
    }

    const smaller = targetCount - offset;
    if (
      smaller >= HUE_RIBBON_MIN_VISIBLE_BOTS &&
      hueRibbonWindowFillsGrid(smaller, viewportWidth, viewportHeight, preferredRows)
    ) {
      return smaller;
    }
  }

  return targetCount;
}

function hueRibbonWindowFillsGrid(
  count: number,
  viewportWidth: number,
  viewportHeight: number,
  preferredRows?: number
): boolean {
  const geom = pickerGeometry(count, viewportWidth, viewportHeight, {
    balanceOddRows: false,
    preferredRows,
  });
  return geom.fillerCells === 0;
}

function hueRibbonWindowBots(
  bots: Bot[],
  hueCenter: number | null,
  trackSegments: readonly HueLensTrackSegment[],
  viewportWidth: number,
  viewportHeight: number,
  preferredRows?: number,
  preferredCols?: number
): Bot[] {
  if (hueCenter === null) return bots;

  const ribbon = bots
    .filter(botHasFilterableColor)
    .sort(compareBotsByHueRibbonPosition);
  const windowSize = hueRibbonWindowSize(
    ribbon.length,
    viewportWidth,
    viewportHeight,
    preferredRows,
    preferredCols
  );
  if (windowSize <= 0) return [];
  if (windowSize >= ribbon.length) return ribbon;

  const sliderValue = hueLensSliderValueForFilterCenter(
    hueCenter,
    trackSegments
  );
  const sliderProgress = Math.max(
    0,
    Math.min(1, sliderValue / HUE_LENS_SLIDER_RANGE)
  );
  const centerIndex = Math.floor(sliderProgress * ribbon.length) % ribbon.length;
  const startIndex =
    centerIndex - Math.floor(windowSize / 2) + ribbon.length;

  return Array.from({ length: windowSize }, (_, offset) => (
    ribbon[(startIndex + offset) % ribbon.length]
  ));
}

// Slider's native [0..359] range maps linearly to a 0..100 percentage that
// approximates the thumb's center as a fraction of the track. The native
// thumb has a small inset relative to the track ends, so this isn't pixel-
// perfect at the extremes — but the orb it drives in `.messagesFrame::after`
// is a wide, soft radial gradient masked at the rails, so visually 1px of
// thumb-vs-orb offset reads as zero. `null` filter parks the orb at 50%,
// which lines up with the slider's 180-resting position.
const HUE_LENS_SLIDER_RANGE = 359;
function hueLensSliderPercent(
  hueCenter: number | null,
  segments: readonly HueLensTrackSegment[]
): number {
  if (hueCenter === null) return 50;
  const sliderValue = hueLensSliderValueForFilterCenter(hueCenter, segments);
  return Math.max(0, Math.min(100, (sliderValue / HUE_LENS_SLIDER_RANGE) * 100));
}

// Match the page accent to the compacted PRISM track segment currently
// under the slider thumb. This keeps the hero triangle and ambient glow
// visually anchored to the user's actual thumb position instead of drifting
// around a separate full-spectrum hue wheel.
function hueLensSliderTintHex(
  hueCenter: number | null,
  segments: readonly HueLensTrackSegment[]
): string | null {
  if (hueCenter === null) return null;
  const sliderValue = hueLensSliderValueForFilterCenter(hueCenter, segments);
  if (segments.length === 0) return null;
  const compactSegmentWidth = 360 / segments.length;
  const compactIndex = Math.min(
    segments.length - 1,
    Math.floor(Math.max(0, Math.min(359, sliderValue)) / compactSegmentWidth)
  );
  return segments[compactIndex]?.color ?? null;
}

function panelBotDisplayAccent(
  rawHex: string,
  theme: "light" | "dark",
  harmonyActive: boolean
): string {
  const normalized = normalizeAccentForTheme(rawHex, theme);
  if (!harmonyActive) return normalized;

  const { h, s, l } = hexToHsl(normalized);
  const targetLightness = theme === "dark"
    ? BOT_PANEL_COLOR_HARMONY_LIGHTNESS_TARGET_DARK
    : BOT_PANEL_COLOR_HARMONY_LIGHTNESS_TARGET_LIGHT;
  return normalizeAccentForTheme(
    hslToHex(
      h,
      blendToward(s, BOT_PANEL_COLOR_HARMONY_SATURATION_TARGET, BOT_PANEL_COLOR_HARMONY_STRENGTH),
      blendToward(l, targetLightness, BOT_PANEL_COLOR_HARMONY_STRENGTH)
    ),
    theme
  );
}

function botColorSortKey(
  bot: Bot,
  theme: "light" | "dark",
  harmonyActive: boolean
): {
  hueGroup: number;
  hue: number;
  luminance: number;
  saturation: number;
  name: string;
} {
  const rawColor = bot.color?.trim();
  if (!rawColor || !hexChannels(rawColor)) {
    return {
      hueGroup: BOT_COLOR_SORT_COLORLESS_GROUP,
      hue: 0,
      luminance: 0,
      saturation: 0,
      name: bot.name,
    };
  }

  const displayColor = panelBotDisplayAccent(rawColor, theme, harmonyActive);
  const { h, s } = hexToHsl(displayColor);
  const isGrayscale = s <= BOT_COLOR_SORT_GRAYSCALE_SATURATION_MAX;
  return {
    hueGroup: isGrayscale
      ? BOT_COLOR_SORT_GRAYSCALE_GROUP
      : botColorFamilyGroup(h),
    hue: botHueSortValue(h),
    luminance: relativeLuminance(displayColor),
    saturation: s,
    name: bot.name,
  };
}

function compareBotsByColor(
  a: Bot,
  b: Bot,
  theme: "light" | "dark",
  harmonyActive: boolean
): number {
  const aKey = botColorSortKey(a, theme, harmonyActive);
  const bKey = botColorSortKey(b, theme, harmonyActive);
  if (aKey.hueGroup !== bKey.hueGroup) return aKey.hueGroup - bKey.hueGroup;
  if (aKey.luminance !== bKey.luminance) return bKey.luminance - aKey.luminance;
  if (aKey.hue !== bKey.hue) return aKey.hue - bKey.hue;
  if (aKey.saturation !== bKey.saturation) return bKey.saturation - aKey.saturation;
  return aKey.name.localeCompare(bKey.name, undefined, { sensitivity: "base" });
}

// At high bot counts the right drawer stops being a list and becomes a
// Prism-colored dashboard. The five wordmark letters give us five
// semantic buckets for the user's bots: P/R/I/S/M. randomHex() now
// always seeds saturated colors inside the accent band, so every
// newly generated bot lands in one of these five buckets — there is
// no separate neutral group.
type PrismGroupId = "p" | "r" | "i" | "s" | "m";
type BotLibraryFilterId = "all" | PrismGroupId;
const BOT_LIBRARY_FILTER_ALL = "all" as const;
const BOT_LIBRARY_DRAWER_ANIMATION_MS = 220;
const PANEL_CLOSE_ANIMATION_MS = 180;

interface PrismGroupDef {
  id: PrismGroupId;
  letter: string;
  label: string;
  swatch: string;
}

const PRISM_GROUPS: readonly PrismGroupDef[] = [
  { id: "p", letter: "P", label: "Pink & red", swatch: PRISM_COLORS.p },
  { id: "r", letter: "R", label: "Orange & yellow", swatch: PRISM_COLORS.r },
  { id: "i", letter: "I", label: "Lime & green", swatch: PRISM_COLORS.i },
  { id: "s", letter: "S", label: "Cyan & blue", swatch: PRISM_COLORS.s },
  { id: "m", letter: "M", label: "Indigo & violet", swatch: PRISM_COLORS.m },
] as const;

// The bot-library color-group dashboard renders the All-bots △ tile in
// row 1 col 1, then the five PRISM_GROUPS in iteration order across a
// 2-column grid: pink/red (r1c2), orange/yellow (r2c1), lime/green
// (r2c2), cyan/blue (r3c1), indigo/violet (r3c2). Read column-major
// (left col r2→r3, then right col r1→r3) the five color tiles arrive
// in the sequence orange, cyan, pink, green, violet — so we override
// each tile's displayed glyph below to spell the PRISM brand wordmark
// in that reading order. The underlying group ids, labels, swatches,
// and aria-labels still carry the canonical color identity; only the
// visible letter glyph is remapped for the wordmark layout.
const GROUP_LETTER_OVERRIDES: Record<PrismGroupId, string> = {
  r: "P", // orange/yellow → 1st in column-major reading
  s: "R", // cyan/blue     → 2nd
  p: "I", // pink/red      → 3rd
  i: "S", // lime/green    → 4th
  m: "M", // indigo/violet → 5th
};

interface MemoryFamilyDirectory {
  id: PrismGroupId;
  letter: string;
  label: string;
  color: string;
  itemCount: number;
  memoryCount: number;
  style: React.CSSProperties;
}

interface MemoryClusterInnerBubble {
  id: string;
  style: React.CSSProperties;
}

interface MemoryFamilyBotCluster {
  id: string;
  botId: string | null;
  botName: string;
  botGlyph: string | null;
  color: string;
  memoryCount: number;
  style: React.CSSProperties;
  innerBubbles: MemoryClusterInnerBubble[];
}

const MEMORY_FAMILY_DIRECTORY_SLOTS: readonly (readonly [number, number])[] = [
  [50, 28],
  [87, 43],
  [73, 68],
  [27, 68],
  [13, 43],
] as const;

const MEMORY_BUBBLE_CLOUD_SLOTS: readonly (readonly [number, number])[] = [
  [18, 22],
  [48, 17],
  [79, 24],
  [24, 50],
  [52, 46],
  [78, 52],
  [18, 76],
  [48, 80],
  [74, 75],
] as const;

const MEMORY_UNCERTAIN_CONFIDENCE_MAX = 0.48;
// Individual memory bubbles are intentionally compact. The prose can trail
// off at rest; clicking a bubble opens a full-text detail card below.
const MEMORY_BUBBLE_MIN_SIZE = 82;
const MEMORY_BUBBLE_MAX_SIZE = 136;
const MEMORY_UNCERTAIN_BUBBLE_MIN_SIZE = 38;
const MEMORY_UNCERTAIN_BUBBLE_MAX_SIZE = 68;

function memoryConfidenceValue(memory: UserMemory): number {
  return Number.isFinite(memory.confidence) ? Math.max(0, Math.min(1, memory.confidence)) : 0.5;
}

function isAssumptionMemory(memory: UserMemory): boolean {
  return memory.source === "inferred" || memory.source === "compiled";
}

function assumptionMemoryOpacity(memory: UserMemory): number {
  const certainty = Number.isFinite(memory.certainty)
    ? Math.max(0, Math.min(1, memory.certainty as number))
    : memoryConfidenceValue(memory);
  return 0.2 + certainty * 0.8;
}

function memoryBubbleSignalValue(memory: UserMemory): number {
  if (!isAssumptionMemory(memory)) return memoryConfidenceValue(memory);
  return Number.isFinite(memory.certainty)
    ? Math.max(0, Math.min(1, memory.certainty as number))
    : memoryConfidenceValue(memory);
}

function stableUnitValue(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

// Build a left-to-right gradient from up to N bot colors in a group so
// each editor dashboard button reads as an ordered slice of its bucket's
// actual spectrum. Stops are color-mixed against `--bg` so the tile still
// feels like a calm card.
// Returns null when no bot has a usable color.
function buildBotGroupGradient(
  groupBots: readonly Bot[],
  theme: "light" | "dark",
  harmonyActive: boolean,
  mixPercent: number
): string | null {
  if (groupBots.length === 0) return null;
  const sampleSize = Math.min(groupBots.length, 6);
  const stride = groupBots.length / sampleSize;
  const stops: string[] = [];
  for (let i = 0; i < sampleSize; i++) {
    const idx = Math.min(groupBots.length - 1, Math.floor(i * stride));
    const bot = groupBots[idx];
    const accent = bot.color
      ? panelBotDisplayAccent(bot.color, theme, harmonyActive)
      : null;
    if (!accent) continue;
    stops.push(
      `color-mix(in srgb, ${accent} ${mixPercent}%, var(--bg) ${100 - mixPercent}%)`
    );
  }
  if (stops.length === 0) return null;
  if (stops.length === 1) return stops[0];
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

// Map a hex color to one of the five Prism letter buckets. Hue cuts
// mirror botColorFamilyGroup but collapse adjacent fine-grained
// families into the closest wordmark letter so the dashboard reads
// as the Prism color family the user already sees in the brand mark.
// Invalid/grayscale legacy colors still classify by hue so every bot
// can find a home in one of the five letters — randomHex() prevents
// new bots from ever being grayscale in the first place.
function botPrismGroup(hex: string | null | undefined): PrismGroupId {
  const raw = hex?.trim();
  if (!raw || !hexChannels(raw)) return "p";
  const { h } = hexToHsl(raw);
  if (h >= 315) return "p";
  if (h < 15) return "p";
  if (h < 75) return "r"; // orange + yellow
  if (h < 165) return "i"; // lime + green
  if (h < 245) return "s"; // cyan + blue
  return "m"; // indigo + violet + magenta-leaning purple
}

// Accent color for new bots defaults to randomHex() via component state on
// first paint. Subsequent random seeds run only when the Bots panel opens
// in create mode before the user has typed anything — closing the panel and
// reopening preserves picks + text (see bots-panel seed useEffect below).
interface ImageRecord { id: string; prompt: string; url: string; created_at: string; }

const DEFAULT_ASSISTANT_NAME = "Prism";
const PRISM_MESSAGE_ROLE_LETTERS = ["P", "R", "I", "S", "M"] as const;

function messageHasCustomBotIdentity(message: Message): boolean {
  return Boolean(
    message.botName?.trim() ||
    message.botColor?.trim() ||
    message.botGlyph?.trim()
  );
}

function shouldRenderPrismMessageRoleLabel(message: Message, incognito: boolean): boolean {
  return (
    message.role === "assistant" &&
    !incognito &&
    !messageHasCustomBotIdentity(message)
  );
}

function PrismMessageRoleLabel(): React.JSX.Element {
  return (
    <span className={styles.prismMessageRoleLabel}>
      <span className={styles.messageRoleVisuallyHidden}>
        {DEFAULT_ASSISTANT_NAME}
      </span>
      <span className={styles.prismMessageRoleLetters} aria-hidden="true">
        {PRISM_MESSAGE_ROLE_LETTERS.map((letter) => (
          <span
            key={letter}
            className={styles.prismMessageRoleLetter}
          >
            {letter}
          </span>
        ))}
      </span>
    </span>
  );
}

// PRISM fallback for non-private Default/no-bot surfaces that still need a
// single accent token. Private/incognito remains the only monochrome path.
const PRISM_DEFAULT_ACCENT = PRISM_COLORS.s;

function neutralRowColor(resolvedTheme: "light" | "dark"): string {
  return resolvedTheme === "dark" ? "#ffffff" : "#000000";
}

// Resolve a sidebar conversation row's custom-bot tint color from the server-side
// denormalized `lastBotColor`. Default/no-bot chats are handled separately so
// they can keep the same row-gradient structure with a neutral black/white tint.
//
// Order matters:
//   1. Incognito wins — private rows never pick up a hue (grayscale
//      styling comes from the private-row CSS, not from this resolver).
//   2. `lastBotColor` is the server's denormalized color at the time it
//      responded, so it stays correct even if the bot was later deleted
//      or recolored.
//   3. `hasAssistantReply && !lastBotColor` means the last reply came
//      from the Default bot (no bot_id) — no custom hue.
//   4. `botId` → live bots[] lookup. Catches the pre-reply window where
//      a conversation has a locked bot but no assistant message yet.
//   5. No locked bot and no reply either — no custom hue.
function resolveRowColor(
  c: ConversationSummary,
  bots: Bot[]
): string | null {
  if (c.incognito) return null;
  if (c.lastBotColor) return c.lastBotColor;
  if (c.hasAssistantReply) return null;
  if (c.botId) {
    const live = bots.find((b) => b.id === c.botId)?.color;
    if (live) return live;
  }
  return null;
}

function conversationGroupKey(c: ConversationSummary): string {
  return c.botId ? `bot:${c.botId}` : "default";
}

/** Mirror of `conversationGroupKey` for cases where only the bot id is in
 *  hand — e.g. picking a panel to auto-open after a new chat is committed. */
function conversationGroupKeyForBotId(botId: string): string {
  return `bot:${botId}`;
}

function conversationGroupBotId(key: string): string | null {
  return key.startsWith("bot:") ? key.slice("bot:".length) : null;
}

function conversationGroupDeleteKey(key: string): string {
  return `group:${key}`;
}

function buildConversationGroupSummary(
  key: string,
  conversations: ConversationSummary[],
  bots: Bot[],
  unreadConversationIds: Set<string>
): ConversationGroupSummary {
  const botId = conversationGroupBotId(key);
  const bot = botId ? bots.find((candidate) => candidate.id === botId) : null;
  const fallbackColor =
    conversations.find((conversation) => conversation.lastBotColor)?.lastBotColor ?? null;
  return {
    key,
    botId,
    name: bot?.name?.trim() || (botId ? "Deleted bot" : DEFAULT_ASSISTANT_NAME),
    glyph: bot
      ? isBotGlyphName(bot.glyph)
        ? bot.glyph
        : DEFAULT_BOT_GLYPH
      : "triangle",
    color: bot?.color ?? fallbackColor,
    count: conversations.length,
    conversations,
    latestUpdatedAt: conversations[0]?.updatedAt ?? "",
    unread: conversations.some((conversation) => unreadConversationIds.has(conversation.id)),
  };
}

function buildConversationGroups(
  conversations: ConversationSummary[],
  bots: Bot[],
  unreadConversationIds: Set<string>
): ConversationGroupSummary[] {
  const grouped = new Map<string, ConversationSummary[]>();
  for (const conversation of conversations) {
    const key = conversationGroupKey(conversation);
    const existing = grouped.get(key);
    if (existing) existing.push(conversation);
    else grouped.set(key, [conversation]);
  }
  return [...grouped.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) =>
      buildConversationGroupSummary(key, rows, bots, unreadConversationIds)
    );
}

function ThemeGlyph({ mode }: { mode: Theme }): React.ReactElement {
  // Stroke-only 16x16 glyphs that take their color from currentColor, so the
  // same button can shift between muted/hover/locked hues purely via CSS.
  // Matches the lock glyph's visual weight (14px glyph inside a 30px button).
  return (
    <svg
      className={styles.themeToggleGlyph}
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      {mode === "light" && (
        <>
          {/* Sun: central disc + 8 radial rays. */}
          <circle cx="8" cy="8" r="3" suppressHydrationWarning />
          <path
            d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5l1.5 1.5M3 13l1.5-1.5M11.5 4.5l1.5-1.5"
            suppressHydrationWarning
          />
        </>
      )}
      {mode === "dark" && (
        /* Crescent moon: one arc carved out of a larger one. */
        <path
          d="M13 9A5.5 5.5 0 1 1 7 3a4.5 4.5 0 0 0 6 6Z"
          suppressHydrationWarning
        />
      )}
      {mode === "system" && (
        <>
          {/* Half-filled circle: outline the full disc, then fill the right
             hemisphere so it reads as "sun on one side, moon on the other". */}
          <circle cx="8" cy="8" r="5.5" suppressHydrationWarning />
          <path
            d="M8 2.5A5.5 5.5 0 0 1 8 13.5Z"
            fill="currentColor"
            stroke="none"
            suppressHydrationWarning
          />
        </>
      )}
    </svg>
  );
}

function SearchGlyph(): React.ReactElement {
  return (
    <svg className={styles.headerIconGlyph} viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  );
}

function HomeGlyph(): React.ReactElement {
  return (
    <svg className={styles.headerIconGlyph} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 7.25 8 2.75l5.5 4.5" />
      <path d="M4.25 6.75v6h7.5v-6" />
      <path d="M6.75 12.75V9h2.5v3.75" />
    </svg>
  );
}

/** Wrench — clearer than a gear for “conversation tools” (overflow menu). */
function WrenchGlyph(): React.ReactElement {
  return (
    <svg
      className={styles.chatGearGlyph}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

const THEME_LABEL: Record<Theme, string> = {
  light: "Light",
  dark: "Dark",
  system: "Auto",
};

function nextThemeMode(current: Theme): Theme {
  if (current === "light") return "dark";
  if (current === "dark") return "system";
  return "light";
}

function isPrimaryPointerDismissal(event: MouseEvent | PointerEvent): boolean {
  // Outside-click dismissal should never fire for secondary/context clicks.
  // On macOS, Ctrl+click is also a context-menu gesture even though it can
  // report as button 0, so keep it out of the dismissal path too.
  return event.button === 0 && !(event.ctrlKey && (!("pointerType" in event) || event.pointerType === "mouse"));
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  let nativeSessionToken: string | null = null;
  let clientAccessToken: string | null = null;
  if (typeof window !== "undefined") {
    try {
      nativeSessionToken = window.localStorage.getItem(NATIVE_SESSION_STORAGE_KEY);
      clientAccessToken = window.localStorage.getItem(CLIENT_ACCESS_STORAGE_KEY);
    } catch {
      nativeSessionToken = null;
      clientAccessToken = null;
    }
  }
  const headers: HeadersInit = {
    "content-type": "application/json",
    ...(nativeSessionToken ? { authorization: `Bearer ${nativeSessionToken}` } : {}),
    ...(clientAccessToken ? { "x-prism-client-access": clientAccessToken } : {}),
    ...(options?.headers ?? {}),
  };
  const res = await fetch(path, {
    credentials: "include",
    headers,
    ...options,
  });
  // Next rewrite failures can come back as plain text, so parse the body
  // defensively and surface the actual message instead of a JSON parse error.
  const raw = await res.text();
  let payload: (T & { ok?: boolean; error?: string }) | null = null;
  if (raw.trim().length > 0) {
    try {
      payload = JSON.parse(raw) as T & { ok?: boolean; error?: string };
    } catch {
      payload = null;
    }
  }
  if (!res.ok || payload?.ok === false) {
    const fallbackMessage = raw.trim() || `Request failed (${res.status})`;
    throw new Error(payload?.error ?? fallbackMessage);
  }
  return (payload ?? {}) as T;
}

async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path below; LAN dev over plain HTTP is not
      // always treated as a secure context even when the user explicitly clicks.
    }
  }

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
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Clipboard copy command failed.");
    }
  } finally {
    textarea.remove();
  }
}

function clearNativeSessionToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NATIVE_SESSION_STORAGE_KEY);
  } catch {
    // Non-fatal: cookie-backed browser auth can still continue normally.
  }
}

// ── Inline SVG glyphs ─────────────────────────────────────────────────
// Kept light-weight and uniform (14px, stroke 2, round caps) so any
// action glyph we render in the shell feels like it belongs to the same
// set. The bot card × / armed ✓ uses raw character glyphs (matching
// .conversationDelete), so those intentionally don't live here.
const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconKey(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="7.5" cy="15.5" r="4" />
      <path d="M10.5 12.5L20 3" />
      <path d="M16 7l3 3" />
      <path d="M18 5l2 2" />
    </svg>
  );
}

// ── Bot glyph registry ────────────────────────────────────────────────
// Sixteen distinct stroke-only icons drawn on a 24x24 viewBox. These are
// the options a user can pick from when creating or editing a bot. The
// database stores the opaque key (e.g. "sparkles"); unknown keys fall
// back to the default "bot" icon so old rows stay usable if we ever
// rename / remove an entry.
//
// Visually the icons are small pictographs — no single-letter glyphs,
// no emoji — so bot identity reads clearly even at 16px in a chat bubble
// header. They inherit `currentColor` from the nearest color carrier,
// which lets the same component appear gray in the picker, tinted in the
// bot color on cards, and muted in the sidebar.
interface BotGlyphDefinition {
  label: string;
  paths?: React.ReactNode;
  icon?: React.ComponentType<{
    className?: string;
    size?: number;
    strokeWidth?: number;
    "aria-hidden"?: boolean;
  }>;
}

interface InlineBotGlyphDefinition {
  label: string;
  paths: React.ReactNode;
}

// Ordered so related concepts cluster together in the picker grid — players
// tend to scan by category (nature, animals, tech, …) rather than alphabetical
// order. Keep additions grouped with their neighbors.
const LEGACY_BOT_GLYPH_ORDER = [
  // ── Core / abstract identity ────────────────────────────────────────
  "bot",
  "sparkles",
  "brain",
  "heart",
  "flame",
  "ghost",
  "star",
  "rocket",
  "wand",
  "puzzle",
  "infinity",
  "spiral",
  "target",
  "radar",
  "atom",
  "dna",
  "yinYang",
  "pulse",
  "eye",
  "peace",
  // ── Tools of thought ────────────────────────────────────────────────
  "terminal",
  "book",
  "feather",
  "compass",
  "shield",
  "music",
  "lightbulb",
  "lens",
  "key",
  "lock",
  "clock",
  "scissors",
  "paperclip",
  "magnet",
  "umbrella",
  "gift",
  "pencil",
  "scroll",
  "hammer",
  "beaker",
  "telescope",
  // ── Tech & signal ───────────────────────────────────────────────────
  "cpu",
  "database",
  "globe",
  "wifi",
  "satellite",
  "antenna",
  "camera",
  "headphones",
  "battery",
  "plug",
  "bolt",
  "signal",
  "floppy",
  "broadcast",
  // ── Nature & weather ────────────────────────────────────────────────
  "leaf",
  "tree",
  "mountain",
  "sun",
  "moon",
  "cloud",
  "snowflake",
  "droplet",
  "wave",
  "flower",
  "seedling",
  "cactus",
  "rainbow",
  "tornado",
  "palm",
  // ── Animals ─────────────────────────────────────────────────────────
  "cat",
  "dog",
  "fish",
  "bird",
  "butterfly",
  "rabbit",
  "owl",
  "turtle",
  "spider",
  "paw",
  "snake",
  "whale",
  "octopus",
  "bee",
  "frog",
  "fox",
  "bear",
  "penguin",
  "dragon",
  "unicorn",
  // ── Celestial ───────────────────────────────────────────────────────
  "planet",
  "comet",
  "constellation",
  "galaxy",
  // ── Faces / expression ──────────────────────────────────────────────
  "smile",
  "skull",
  "hand",
  // ── Food ────────────────────────────────────────────────────────────
  "cherry",
  "mushroom",
  "carrot",
  "egg",
  "pepper",
  "apple",
  "coffee",
  "cake",
  "pineapple",
  "strawberry",
  "banana",
  "donut",
  "pizza",
  "icecream",
  // ── Travel & activity ───────────────────────────────────────────────
  "car",
  "airplane",
  "balloon",
  "anchor",
  "dice",
  "flag",
  "crown",
  "medal",
  "trophy",
  "gamepad",
  "bike",
  "boat",
  "train",
  "kite",
  // ── Shapes ──────────────────────────────────────────────────────────
  "hexagon",
  "triangle",
  "diamond",
  "origami",
  "circle",
  "square",
  "pentagon",
  "checkmark",
  // ── Sports ──────────────────────────────────────────────────────────
  "soccer",
  "basketball",
  "baseball",
  // ── Music instruments ───────────────────────────────────────────────
  "guitar",
  "piano",
  "drum",
  // ── Objects ─────────────────────────────────────────────────────────
  "candle",
  "ring",
  "bell",
  // ── Math / symbols ──────────────────────────────────────────────────
  "pi",
  "sigma",
  "hashtag",
  "at",
  // ── Time ────────────────────────────────────────────────────────────
  "hourglass",
  "calendar",
] as const;

const BOT_GLYPH_ORDER = [
  ...LEGACY_BOT_GLYPH_ORDER,
  ...LUCIDE_BOT_GLYPH_ORDER,
] as const;

type BotGlyphName = string;

// The triangle mark belongs to Prism/Default identity; custom bots choose
// from the same registry minus that reserved glyph.
const CUSTOM_BOT_GLYPH_ORDER = BOT_GLYPH_ORDER.filter(
  (key) => key !== "triangle"
);

const INLINE_BOT_GLYPHS: Record<string, InlineBotGlyphDefinition> = {
  bot: {
    label: "Bot",
    paths: (
      <>
        <path d="M12 4v3" />
        <circle cx="12" cy="3" r="1" />
        <rect x="4" y="7" width="16" height="13" rx="2" />
        <path d="M2 14h2" />
        <path d="M20 14h2" />
        <circle cx="9" cy="13" r="1" />
        <circle cx="15" cy="13" r="1" />
        <path d="M9 17h6" />
      </>
    ),
  },
  sparkles: {
    label: "Sparkles",
    paths: (
      <>
        <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z" />
        <path d="M18 15l0.75 2.25L21 18l-2.25 0.75L18 21l-0.75-2.25L15 18l2.25-0.75L18 15z" />
      </>
    ),
  },
  brain: {
    label: "Brain",
    paths: (
      <>
        <path d="M9.5 4a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 4.5 9 2.5 2.5 0 0 0 4.5 14 2.5 2.5 0 0 0 7 16.5 2.5 2.5 0 0 0 9.5 19 2.5 2.5 0 0 0 12 17V6.5A2.5 2.5 0 0 0 9.5 4z" />
        <path d="M14.5 4a2.5 2.5 0 0 1 2.5 2.5A2.5 2.5 0 0 1 19.5 9 2.5 2.5 0 0 1 19.5 14 2.5 2.5 0 0 1 17 16.5 2.5 2.5 0 0 1 14.5 19 2.5 2.5 0 0 1 12 17" />
      </>
    ),
  },
  heart: {
    label: "Heart",
    paths: (
      <path d="M12 20s-7-4.5-7-10a4.5 4.5 0 0 1 7-3.5 4.5 4.5 0 0 1 7 3.5c0 5.5-7 10-7 10z" />
    ),
  },
  flame: {
    label: "Flame",
    paths: (
      <>
        <path d="M12 3c2.5 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4-1-2 1-4 3-5z" />
        <path d="M12 14c1.5 1 2 2 2 3a2 2 0 0 1-4 0c0-1 0.5-2 2-3z" />
      </>
    ),
  },
  ghost: {
    label: "Ghost",
    paths: (
      <>
        <path d="M5 11a7 7 0 0 1 14 0v9l-2-1.5L15 20l-3-1.5L9 20l-2-1.5L5 20V11z" />
        <circle cx="10" cy="12" r="1" />
        <circle cx="14" cy="12" r="1" />
      </>
    ),
  },
  star: {
    label: "Star",
    paths: (
      <path d="M12 3l2.6 5.4 6 0.9-4.3 4.2 1 6L12 16.7 6.7 19.5l1-6L3.4 9.3l6-0.9L12 3z" />
    ),
  },
  rocket: {
    label: "Rocket",
    paths: (
      <>
        <path d="M12 3c3 2 5 5 5 9v4H7v-4c0-4 2-7 5-9z" />
        <path d="M7 16c-2 1-3 3-3 5 2 0 4-1 5-3" />
        <path d="M17 16c2 1 3 3 3 5-2 0-4-1-5-3" />
        <circle cx="12" cy="11" r="1.8" />
      </>
    ),
  },
  terminal: {
    label: "Terminal",
    paths: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 9l3 3-3 3" />
        <path d="M13 15h4" />
      </>
    ),
  },
  book: {
    label: "Book",
    paths: (
      <>
        <path d="M12 5v15" />
        <path d="M4 5c3 0 6 1 8 3 2-2 5-3 8-3v14c-3 0-6 1-8 3-2-2-5-3-8-3V5z" />
      </>
    ),
  },
  feather: {
    label: "Feather",
    paths: (
      <>
        <path d="M19 5L8 16c-1 1-1 3 0 4s3 1 4 0L23 8c0-2-2-4-4-3z" />
        <path d="M9 15L21 3" />
        <path d="M15 10l-4 4" />
      </>
    ),
  },
  compass: {
    label: "Compass",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M16 8l-2.5 6.5L7 17l2.5-6.5L16 8z" />
      </>
    ),
  },
  shield: {
    label: "Shield",
    paths: (
      <path d="M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3z" />
    ),
  },
  wand: {
    label: "Wand",
    paths: (
      <>
        <path d="M7 17L17 7" />
        <path d="M17 5l2 2 -2 2 -2 -2z" />
        <path d="M5 19l1 1" />
        <path d="M8 20l0.5 0.5" />
      </>
    ),
  },
  music: {
    label: "Music",
    paths: (
      <>
        <path d="M9 18V6l12-3v12" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="19" cy="15" r="2" />
      </>
    ),
  },
  puzzle: {
    label: "Puzzle",
    paths: (
      <path d="M10 4h4v2a2 2 0 0 0 4 0h3v4a2 2 0 0 1 0 4v4h-3a2 2 0 0 0-4 0h-4v-4a2 2 0 0 1 0-4V4z" />
    ),
  },

  // ── Abstract ────────────────────────────────────────────────────────
  infinity: {
    label: "Infinity",
    // Feather-style infinity: control points are tuned so both lobes bulge
    // symmetrically and the whole glyph sits centered around (12, 12) in
    // the 24×24 viewBox (critical for the swatch, where any visual drift
    // reads immediately against the solid color fill).
    paths: (
      <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
    ),
  },
  spiral: {
    label: "Spiral",
    paths: (
      <path d="M12 12a3 3 0 0 1 3-3 5 5 0 0 1-5 5 7 7 0 0 1 7-7 9 9 0 0 1-9 9" />
    ),
  },
  target: {
    label: "Target",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" />
      </>
    ),
  },
  radar: {
    label: "Radar",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="5" />
        <path d="M12 12L20 6" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
  },
  atom: {
    label: "Atom",
    paths: (
      <>
        <circle cx="12" cy="12" r="1.3" />
        <ellipse cx="12" cy="12" rx="9" ry="3.5" />
        <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)" />
        <ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(120 12 12)" />
      </>
    ),
  },
  dna: {
    label: "DNA",
    paths: (
      <>
        <path d="M7 3c0 5 10 5 10 10s-10 5-10 10" />
        <path d="M17 3c0 5-10 5-10 10s10 5 10 10" />
        <path d="M8 7h8M8 11h8M8 17h8" />
      </>
    ),
  },
  yinYang: {
    label: "Yin-Yang",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9" />
        <circle cx="12" cy="7.5" r="0.8" />
        <circle cx="12" cy="16.5" r="0.8" />
      </>
    ),
  },
  pulse: {
    label: "Pulse",
    paths: <path d="M3 12h4l2-5 3 10 2-6 2 3h5" />,
  },
  eye: {
    label: "Eye",
    paths: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  peace: {
    label: "Peace",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v18M12 12l-6 6M12 12l6 6" />
      </>
    ),
  },

  // ── Tools of thought ────────────────────────────────────────────────
  lightbulb: {
    label: "Lightbulb",
    paths: (
      <>
        <path d="M9 17h6M10 20h4" />
        <path d="M12 3a6 6 0 0 0-4 10c.7.7 1 1.5 1 2h6c0-.5.3-1.3 1-2a6 6 0 0 0-4-10z" />
      </>
    ),
  },
  lens: {
    label: "Magnifier",
    paths: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="M14.5 14.5L21 21" />
      </>
    ),
  },
  key: {
    label: "Key",
    paths: (
      <>
        <circle cx="7" cy="17" r="3" />
        <path d="M9 15L21 3" />
        <path d="M18 6l2 2M15 9l2 2" />
      </>
    ),
  },
  lock: {
    label: "Lock",
    paths: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="1" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        <circle cx="12" cy="16" r="0.8" />
      </>
    ),
  },
  clock: {
    label: "Clock",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  },
  scissors: {
    label: "Scissors",
    paths: (
      <>
        <circle cx="6" cy="6" r="2" />
        <circle cx="6" cy="18" r="2" />
        <path d="M8 7l12 10M8 17L20 7" />
      </>
    ),
  },
  paperclip: {
    label: "Paperclip",
    paths: (
      <path d="M20 12l-8 8a5 5 0 0 1-7-7l10-10a3.5 3.5 0 0 1 5 5L10 18a2 2 0 0 1-3-3l8-8" />
    ),
  },
  magnet: {
    label: "Magnet",
    paths: (
      <>
        <path d="M5 4h4v7a3 3 0 0 0 6 0V4h4v7a7 7 0 0 1-14 0z" />
        <path d="M5 7h4M15 7h4" />
      </>
    ),
  },
  umbrella: {
    label: "Umbrella",
    paths: (
      <>
        <path d="M3 12a9 9 0 0 1 18 0H3z" />
        <path d="M12 12v7a2 2 0 0 0 4 0" />
      </>
    ),
  },
  gift: {
    label: "Gift",
    paths: (
      <>
        <rect x="3" y="8" width="18" height="4" />
        <rect x="5" y="12" width="14" height="9" />
        <path d="M12 8v13" />
        <path d="M12 8c-2-4-6-4-6-1s4 1 6 1z" />
        <path d="M12 8c2-4 6-4 6-1s-4 1-6 1z" />
      </>
    ),
  },
  pencil: {
    label: "Pencil",
    paths: (
      <>
        <path d="M4 20l3-1L19 7l-2-2L5 17l-1 3z" />
        <path d="M15 7l2 2" />
        <path d="M4 20l3-1" />
      </>
    ),
  },
  scroll: {
    label: "Scroll",
    paths: (
      <>
        <path d="M5 7a2 2 0 0 1 2-2h10v14H7a2 2 0 0 1 0-4h10" />
        <path d="M17 5a2 2 0 0 1 4 0v14a2 2 0 0 1-4 0" />
      </>
    ),
  },
  hammer: {
    label: "Hammer",
    paths: (
      <>
        <path d="M13 6l3-3 5 5-3 3-2-2-5 5-3-3z" />
        <path d="M11 11l-7 7 2 2 7-7" />
      </>
    ),
  },
  beaker: {
    label: "Beaker",
    paths: (
      <>
        <path d="M9 3h6" />
        <path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
        <path d="M7 15h10" />
      </>
    ),
  },
  telescope: {
    label: "Telescope",
    paths: (
      <>
        <path d="M3 18L15 6l4 4L7 22l-4-4z" />
        <path d="M15 6l3-3 3 3-3 3" />
        <path d="M6 18l-3 4" />
      </>
    ),
  },

  // ── Tech & signal ───────────────────────────────────────────────────
  cpu: {
    label: "CPU",
    paths: (
      <>
        <rect x="6" y="6" width="12" height="12" rx="1" />
        <rect x="9" y="9" width="6" height="6" />
        <path d="M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3" />
        <path d="M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3" />
      </>
    ),
  },
  database: {
    label: "Database",
    paths: (
      <>
        <ellipse cx="12" cy="5" rx="7" ry="2.5" />
        <path d="M5 5v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V5" />
        <path d="M5 11v6c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-6" />
      </>
    ),
  },
  globe: {
    label: "Globe",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
      </>
    ),
  },
  wifi: {
    label: "Wi-Fi",
    paths: (
      <>
        <path d="M3 9a14 14 0 0 1 18 0" />
        <path d="M6 13a9 9 0 0 1 12 0" />
        <path d="M9 17a4 4 0 0 1 6 0" />
        <circle cx="12" cy="20" r="0.5" />
      </>
    ),
  },
  satellite: {
    label: "Satellite",
    paths: (
      <>
        <rect x="8" y="6" width="4" height="4" transform="rotate(45 10 8)" />
        <rect x="14" y="12" width="4" height="4" transform="rotate(45 16 14)" />
        <path d="M10 10l4 4" />
        <path d="M4 20l4-4M4 20l-1-3 3 1z" />
        <path d="M17 3a4 4 0 0 1 4 4" />
      </>
    ),
  },
  antenna: {
    label: "Antenna",
    paths: (
      <>
        <path d="M5 5a9 9 0 0 1 14 0" />
        <path d="M8 9a5 5 0 0 1 8 0" />
        <path d="M12 3v12" />
        <path d="M8 21l4-6 4 6" />
      </>
    ),
  },
  camera: {
    label: "Camera",
    paths: (
      <>
        <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
        <circle cx="12" cy="13" r="3.5" />
        <circle cx="18" cy="10" r="0.5" />
      </>
    ),
  },
  headphones: {
    label: "Headphones",
    paths: (
      <>
        <path d="M3 15v-3a9 9 0 0 1 18 0v3" />
        <rect x="3" y="15" width="4" height="6" rx="1" />
        <rect x="17" y="15" width="4" height="6" rx="1" />
      </>
    ),
  },
  battery: {
    label: "Battery",
    paths: (
      <>
        <rect x="3" y="8" width="16" height="8" rx="1" />
        <rect x="19" y="10" width="2" height="4" />
        <path d="M6 11v2M9 11v2M12 11v2" />
      </>
    ),
  },
  plug: {
    label: "Plug",
    paths: (
      <>
        <path d="M9 3v5M15 3v5" />
        <path d="M6 8h12v3a6 6 0 0 1-12 0V8z" />
        <path d="M12 17v4" />
      </>
    ),
  },
  bolt: {
    label: "Bolt",
    paths: (
      <path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" />
    ),
  },
  signal: {
    label: "Signal",
    paths: (
      <>
        <path d="M5 20v-4" />
        <path d="M10 20v-8" />
        <path d="M15 20V8" />
        <path d="M20 20V5" />
      </>
    ),
  },
  floppy: {
    label: "Floppy Disk",
    paths: (
      <>
        <path d="M4 4h12l4 4v12H4z" />
        <path d="M7 4v6h10V4" />
        <rect x="8" y="13" width="8" height="7" />
      </>
    ),
  },
  broadcast: {
    label: "Broadcast",
    paths: (
      <>
        <circle cx="12" cy="12" r="2" />
        <path d="M8 8a5.66 5.66 0 0 0 0 8M16 8a5.66 5.66 0 0 1 0 8" />
        <path d="M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" />
      </>
    ),
  },

  // ── Nature & weather ────────────────────────────────────────────────
  leaf: {
    label: "Leaf",
    paths: (
      <>
        <path d="M4 20c0-8 6-14 16-14 0 10-6 16-14 16-1 0-2 0-2-2z" />
        <path d="M4 20l10-10" />
      </>
    ),
  },
  tree: {
    label: "Tree",
    paths: (
      <>
        <path d="M12 3l-5 7h3l-3 5h3l-3 5h10l-3-5h3l-3-5h3l-5-7z" />
        <path d="M12 20v2" />
      </>
    ),
  },
  mountain: {
    label: "Mountain",
    paths: (
      <>
        <path d="M3 19l6-10 4 6 3-4 5 8H3z" />
        <path d="M8 14l2-3" />
      </>
    ),
  },
  sun: {
    label: "Sun",
    paths: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <path d="M4.5 4.5l2 2M17.5 17.5l2 2M4.5 19.5l2-2M17.5 6.5l2-2" />
      </>
    ),
  },
  moon: {
    label: "Moon",
    paths: (
      <path d="M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10z" />
    ),
  },
  cloud: {
    label: "Cloud",
    paths: (
      <path d="M6 18a4 4 0 0 1 0-8 5 5 0 0 1 9-2 4 4 0 0 1 3 10H6z" />
    ),
  },
  snowflake: {
    label: "Snowflake",
    paths: (
      <>
        <path d="M12 2v20" />
        <path d="M4 6l16 12M4 18l16-12" />
        <path d="M9 3l3 3 3-3M9 21l3-3 3 3" />
        <path d="M3 9l3 3-3 3M21 9l-3 3 3 3" />
      </>
    ),
  },
  droplet: {
    label: "Droplet",
    paths: (
      <path d="M12 3c-3 5-6 8-6 11a6 6 0 0 0 12 0c0-3-3-6-6-11z" />
    ),
  },
  wave: {
    label: "Wave",
    paths: (
      <>
        <path d="M3 12c3 0 3-4 6-4s3 4 6 4 3-4 6-4" />
        <path d="M3 18c3 0 3-4 6-4s3 4 6 4 3-4 6-4" />
      </>
    ),
  },
  flower: {
    label: "Flower",
    paths: (
      <>
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 3a4 4 0 0 1 0 7 4 4 0 0 1 0-7z" />
        <path d="M12 14a4 4 0 0 1 0 7 4 4 0 0 1 0-7z" />
        <path d="M3 12a4 4 0 0 1 7 0 4 4 0 0 1-7 0z" />
        <path d="M14 12a4 4 0 0 1 7 0 4 4 0 0 1-7 0z" />
      </>
    ),
  },
  seedling: {
    label: "Seedling",
    paths: (
      <>
        <path d="M12 20v-8" />
        <path d="M12 12c-4 0-6-3-6-6 4 0 6 3 6 6z" />
        <path d="M12 12c4 0 6-3 6-6-4 0-6 3-6 6z" />
        <path d="M8 20h8" />
      </>
    ),
  },
  cactus: {
    label: "Cactus",
    paths: (
      <>
        <path d="M12 20V8" />
        <path d="M12 14H8a2 2 0 0 1-2-2v-2" />
        <path d="M12 12h4a2 2 0 0 0 2-2V7" />
        <path d="M10 8a2 2 0 0 1 4 0" />
        <path d="M9 20h6" />
      </>
    ),
  },
  rainbow: {
    label: "Rainbow",
    paths: (
      <>
        <path d="M3 20a9 9 0 0 1 18 0" />
        <path d="M6 20a6 6 0 0 1 12 0" />
        <path d="M9 20a3 3 0 0 1 6 0" />
      </>
    ),
  },
  tornado: {
    label: "Tornado",
    paths: (
      <>
        <path d="M3 5h18" />
        <path d="M4 9h16" />
        <path d="M6 13h12" />
        <path d="M9 17h6" />
        <path d="M11 21h2" />
      </>
    ),
  },
  palm: {
    label: "Palm Tree",
    paths: (
      <>
        <path d="M12 10v11" />
        <path d="M12 10c-4-4-9-3-9-3s3 4 9 3z" />
        <path d="M12 10c4-4 9-3 9-3s-3 4-9 3z" />
        <path d="M12 10c0-4-3-6-3-6s-2 3 3 6z" />
        <path d="M12 10c0-4 3-6 3-6s2 3-3 6z" />
      </>
    ),
  },

  // ── Animals ─────────────────────────────────────────────────────────
  cat: {
    label: "Cat",
    paths: (
      <>
        <path d="M5 12l-2-5 4 2c1-1 3-2 5-2s4 1 5 2l4-2-2 5" />
        <path d="M5 12v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
        <circle cx="9" cy="14" r="0.6" />
        <circle cx="15" cy="14" r="0.6" />
        <path d="M11 17c.4.4 1.6.4 2 0" />
      </>
    ),
  },
  dog: {
    label: "Dog",
    paths: (
      <>
        <path d="M4 12V7l3 2h2l1-2 2 2 2-2 1 2h2l3-2v5" />
        <path d="M4 12v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
        <circle cx="9" cy="14" r="0.6" />
        <circle cx="15" cy="14" r="0.6" />
        <path d="M11 17h2" />
      </>
    ),
  },
  fish: {
    label: "Fish",
    paths: (
      <>
        <path d="M3 12c3-5 9-6 13-3 3 2 4 5 4 5s-1 3-4 5c-4 3-10 2-13-3" />
        <path d="M20 12l2-2v4l-2-2" />
        <circle cx="15" cy="10" r="0.6" />
      </>
    ),
  },
  bird: {
    label: "Bird",
    paths: (
      <>
        <path d="M4 18c4 0 8-4 8-8s4-6 8-4l-2 4 2 2-4 2-2-2-2 4c-2 4-6 4-10 2z" />
        <circle cx="17" cy="8" r="0.6" />
      </>
    ),
  },
  butterfly: {
    label: "Butterfly",
    paths: (
      <>
        <path d="M12 5v14" />
        <path d="M12 9c-3-4-9-4-9 0 0 3 2 4 4 5-2 1-4 2-4 5 0 4 6 4 9 0" />
        <path d="M12 9c3-4 9-4 9 0 0 3-2 4-4 5 2 1 4 2 4 5 0 4-6 4-9 0" />
      </>
    ),
  },
  rabbit: {
    label: "Rabbit",
    paths: (
      <>
        <path d="M9 5v6M15 5v6" />
        <circle cx="12" cy="14" r="5" />
        <circle cx="10" cy="13" r="0.6" />
        <circle cx="14" cy="13" r="0.6" />
        <path d="M11 16h2" />
      </>
    ),
  },
  owl: {
    label: "Owl",
    paths: (
      <>
        <path d="M6 11a6 6 0 0 1 12 0v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-6z" />
        <circle cx="9" cy="11" r="1.5" />
        <circle cx="15" cy="11" r="1.5" />
        <path d="M11 14l1 1 1-1" />
        <path d="M8 5l-2-2M16 5l2-2" />
      </>
    ),
  },
  turtle: {
    label: "Turtle",
    paths: (
      <>
        <path d="M6 14a6 6 0 0 1 12 0v3a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-3z" />
        <path d="M12 8v6" />
        <path d="M4 14h2M18 14h2" />
        <path d="M7 19l-1 2M17 19l1 2" />
        <circle cx="20" cy="11" r="1" />
      </>
    ),
  },
  spider: {
    label: "Spider",
    paths: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M9 12L4 8M9 12L4 12M9 12L4 16M15 12l5-4M15 12h5M15 12l5 4" />
        <path d="M12 9V4M12 15v5" />
      </>
    ),
  },
  paw: {
    label: "Paw",
    paths: (
      <>
        <ellipse cx="12" cy="16" rx="4" ry="3" />
        <circle cx="7" cy="11" r="1.5" />
        <circle cx="17" cy="11" r="1.5" />
        <circle cx="9" cy="7" r="1.5" />
        <circle cx="15" cy="7" r="1.5" />
      </>
    ),
  },
  snake: {
    label: "Snake",
    paths: (
      <>
        <path d="M17 5c-5 0-5 6 0 6s5 6 0 6H7" />
        <path d="M16 4l-1 1M18 4l1 1" />
        <circle cx="17" cy="5" r="0.5" />
      </>
    ),
  },
  whale: {
    label: "Whale",
    paths: (
      <>
        <path d="M3 14c1-5 5-7 9-7 4 0 7 2 8 5l3-3v8l-3-3c-1 3-4 5-8 5-4 0-8-2-9-4z" />
        <circle cx="15" cy="11" r="0.6" />
        <path d="M7 8c0-2 2-3 2-3" />
      </>
    ),
  },
  octopus: {
    label: "Octopus",
    paths: (
      <>
        <path d="M6 12a6 6 0 0 1 12 0" />
        <path d="M6 12v3l-2 6M10 12v4l-2 7M14 12v4l2 7M18 12v3l2 6M12 12v7" />
        <circle cx="10" cy="10" r="0.6" />
        <circle cx="14" cy="10" r="0.6" />
      </>
    ),
  },
  bee: {
    label: "Bee",
    paths: (
      <>
        <ellipse cx="12" cy="14" rx="4" ry="6" />
        <path d="M9 11h6M9 14h6M9 17h6" />
        <path d="M8 10c-3-2-5-3-3-4s4 1 4 3z" />
        <path d="M16 10c3-2 5-3 3-4s-4 1-4 3z" />
      </>
    ),
  },
  frog: {
    label: "Frog",
    paths: (
      <>
        <circle cx="8" cy="8" r="2" />
        <circle cx="16" cy="8" r="2" />
        <path d="M4 13a8 6 0 0 0 16 0" />
        <path d="M4 17l-1 2M20 17l1 2" />
        <path d="M8 18l-1 2M16 18l1 2" />
      </>
    ),
  },
  fox: {
    label: "Fox",
    paths: (
      <>
        <path d="M4 5l4 7 4-2 4 2 4-7-4 3-4-2-4 2-4-3z" />
        <path d="M8 12v3c0 3 2 5 4 5s4-2 4-5v-3" />
        <circle cx="10" cy="14" r="0.5" />
        <circle cx="14" cy="14" r="0.5" />
        <path d="M11 17h2" />
      </>
    ),
  },
  bear: {
    label: "Bear",
    paths: (
      <>
        <circle cx="7" cy="7" r="2" />
        <circle cx="17" cy="7" r="2" />
        <circle cx="12" cy="14" r="6" />
        <circle cx="10" cy="13" r="0.5" />
        <circle cx="14" cy="13" r="0.5" />
        <path d="M11 17c.5.5 1.5.5 2 0" />
      </>
    ),
  },
  penguin: {
    label: "Penguin",
    paths: (
      <>
        <path d="M12 3a5 5 0 0 0-5 5v10a5 5 0 0 0 10 0V8a5 5 0 0 0-5-5z" />
        <path d="M10 11l2 2 2-2" />
        <circle cx="10" cy="9" r="0.5" />
        <circle cx="14" cy="9" r="0.5" />
        <path d="M8 20l-1 2M16 20l1 2" />
      </>
    ),
  },
  dragon: {
    label: "Dragon",
    paths: (
      <>
        <path d="M3 18c2 0 3-2 5-2s3 2 5 2 3-2 5-2" />
        <path d="M18 16c2-2 2-6 0-8-1-1-3-1-4 0l-3 3" />
        <path d="M17 6l1-3M20 5l2-1" />
        <circle cx="19" cy="9" r="0.5" />
      </>
    ),
  },
  unicorn: {
    label: "Unicorn",
    paths: (
      <>
        <path d="M8 10l-2-6 3 2 3-1 3 1 3-2-2 6" />
        <path d="M7 14a5 5 0 0 0 10 0V8" />
        <path d="M14 3l4-1-2 4" />
        <circle cx="11" cy="12" r="0.5" />
      </>
    ),
  },

  // ── Celestial ───────────────────────────────────────────────────────
  planet: {
    label: "Planet",
    paths: (
      <>
        <circle cx="12" cy="12" r="5" />
        <ellipse cx="12" cy="12" rx="10" ry="3" transform="rotate(-20 12 12)" />
      </>
    ),
  },
  comet: {
    label: "Comet",
    paths: (
      <>
        <circle cx="16" cy="8" r="3" />
        <path d="M14 10L3 21" />
        <path d="M12 8l-5 2M16 14l-2 5" />
      </>
    ),
  },
  constellation: {
    label: "Constellation",
    paths: (
      <>
        <circle cx="5" cy="5" r="0.8" />
        <circle cx="10" cy="9" r="0.8" />
        <circle cx="16" cy="6" r="0.8" />
        <circle cx="19" cy="13" r="0.8" />
        <circle cx="13" cy="16" r="0.8" />
        <circle cx="7" cy="19" r="0.8" />
        <path d="M5 5l5 4 6-3 3 7-6 3-6 3" />
      </>
    ),
  },
  galaxy: {
    label: "Galaxy",
    paths: (
      <>
        <circle cx="12" cy="12" r="1" />
        <path d="M12 12a5 5 0 0 1 5 5c-5 2-10-3-10-7s3-7 7-7a5 5 0 0 1 5 5c0 4-4 8-8 9" />
      </>
    ),
  },

  // ── Faces / expression ──────────────────────────────────────────────
  smile: {
    label: "Smile",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 14c1.5 2 6.5 2 8 0" />
        <circle cx="9" cy="10" r="0.8" />
        <circle cx="15" cy="10" r="0.8" />
      </>
    ),
  },
  skull: {
    label: "Skull",
    paths: (
      <>
        <path d="M5 11a7 7 0 0 1 14 0v3l-1 2h-3v3H9v-3H6l-1-2v-3z" />
        <circle cx="9" cy="12" r="1.3" />
        <circle cx="15" cy="12" r="1.3" />
        <path d="M10 17h4" />
      </>
    ),
  },
  hand: {
    label: "Hand",
    paths: (
      <path d="M7 13V7a2 2 0 0 1 4 0v4M11 11V5a2 2 0 0 1 4 0v6M15 11V7a2 2 0 0 1 4 0v8a6 6 0 0 1-12 0v-3a2 2 0 0 1 4 0" />
    ),
  },

  // ── Food ────────────────────────────────────────────────────────────
  cherry: {
    label: "Cherry",
    paths: (
      <>
        <circle cx="8" cy="17" r="3" />
        <circle cx="16" cy="17" r="3" />
        <path d="M8 14C8 10 12 8 15 5M16 14C16 10 17 7 19 5" />
        <path d="M15 5h4" />
      </>
    ),
  },
  mushroom: {
    label: "Mushroom",
    paths: (
      <>
        <path d="M4 12a8 8 0 0 1 16 0v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-1z" />
        <path d="M10 14v6a2 2 0 0 0 4 0v-6" />
        <circle cx="10" cy="9" r="0.8" />
        <circle cx="14" cy="11" r="0.8" />
      </>
    ),
  },
  carrot: {
    label: "Carrot",
    paths: (
      <>
        <path d="M6 20L18 8a3 3 0 0 0-4-4L2 16l4 4z" />
        <path d="M17 7l2-3M20 10l3-2M14 4l1-2" />
      </>
    ),
  },
  egg: {
    label: "Egg",
    paths: (
      <path d="M12 3c-4 0-7 6-7 11a7 7 0 0 0 14 0c0-5-3-11-7-11z" />
    ),
  },
  pepper: {
    label: "Pepper",
    paths: (
      <>
        <path d="M10 20c-4 0-7-3-7-7 0-3 2-5 4-5 3 0 5 2 9 2s4-3 4-3-1 13-10 13z" />
        <path d="M14 7c2-2 3-4 3-4M14 7c-1 0-3 0-5-2" />
      </>
    ),
  },
  apple: {
    label: "Apple",
    paths: (
      <>
        <path d="M12 7c-5 0-7 4-7 8s2 6 5 6c1 0 2-1 2-1s1 1 2 1c3 0 5-1 5-6s-2-8-7-8z" />
        <path d="M12 7V4" />
        <path d="M12 5c2 0 3-1 3-3-2 0-3 1-3 3z" />
      </>
    ),
  },
  coffee: {
    label: "Coffee",
    paths: (
      <>
        <path d="M4 9h13v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9z" />
        <path d="M17 12h2a2 2 0 0 1 0 4h-2" />
        <path d="M8 6c0-1 1-2 2-2s2 1 1 3M13 6c0-1 1-2 2-2s2 1 1 3" />
      </>
    ),
  },
  cake: {
    label: "Cake",
    paths: (
      <>
        <path d="M4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7H4v-7z" />
        <path d="M4 16c2 0 2-1 4-1s2 1 4 1 2-1 4-1 2 1 4 1" />
        <path d="M12 11V7M9 4l3 3 3-3" />
      </>
    ),
  },
  pineapple: {
    label: "Pineapple",
    paths: (
      <>
        <path d="M10 2l2 2 2-2M8 3l1 3M16 3l-1 3M12 4v3" />
        <path d="M6 9h12l-1 10a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3L6 9z" />
        <path d="M9 11l6 8M15 11l-6 8" />
      </>
    ),
  },
  strawberry: {
    label: "Strawberry",
    paths: (
      <>
        <path d="M4 8c0 5 3 13 8 13s8-8 8-13c-1-1-4-1-7 1-3-2-7-2-9 0z" />
        <path d="M5 7l3-3h8l3 3" />
        <circle cx="9" cy="12" r="0.5" />
        <circle cx="14" cy="14" r="0.5" />
        <circle cx="11" cy="17" r="0.5" />
      </>
    ),
  },
  banana: {
    label: "Banana",
    paths: (
      <path d="M4 6c0 8 5 13 13 13 2 0 3-1 3-2-6 0-9-4-11-12 0-1-4-1-5 1z" />
    ),
  },
  donut: {
    label: "Donut",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3" />
        <circle cx="7" cy="9" r="0.5" />
        <circle cx="14" cy="5" r="0.5" />
        <circle cx="18" cy="10" r="0.5" />
        <circle cx="17" cy="16" r="0.5" />
        <circle cx="10" cy="18" r="0.5" />
        <circle cx="6" cy="15" r="0.5" />
      </>
    ),
  },
  pizza: {
    label: "Pizza Slice",
    paths: (
      <>
        <path d="M12 3L3 21h18L12 3z" />
        <circle cx="10" cy="14" r="0.8" />
        <circle cx="14" cy="14" r="0.8" />
        <circle cx="12" cy="18" r="0.8" />
        <circle cx="12" cy="10" r="0.8" />
      </>
    ),
  },
  icecream: {
    label: "Ice Cream",
    paths: (
      <>
        <path d="M7 11a5 5 0 0 1 10 0H7z" />
        <path d="M8 11l4 10 4-10" />
        <path d="M12 11v10" />
      </>
    ),
  },

  // ── Travel & activity ───────────────────────────────────────────────
  car: {
    label: "Car",
    paths: (
      <>
        <path d="M3 14l2-6h14l2 6M3 14h18v4H3z" />
        <circle cx="7" cy="18" r="1.5" />
        <circle cx="17" cy="18" r="1.5" />
      </>
    ),
  },
  airplane: {
    label: "Airplane",
    paths: (
      <path d="M3 13l8-1 4-9 2 0-1 9 6 2-1 2-6-1-3 7-2 0 1-6-6-1z" />
    ),
  },
  balloon: {
    label: "Balloon",
    paths: (
      <>
        <path d="M12 3a6 6 0 0 1 0 12 6 6 0 0 1 0-12z" />
        <path d="M12 15v2l-1 1 1 1-1 1 1 1" />
      </>
    ),
  },
  anchor: {
    label: "Anchor",
    paths: (
      <>
        <circle cx="12" cy="5" r="2" />
        <path d="M12 7v14" />
        <path d="M9 11h6" />
        <path d="M5 15a8 8 0 0 0 14 0" />
      </>
    ),
  },
  dice: {
    label: "Dice",
    paths: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="8" cy="8" r="0.8" />
        <circle cx="16" cy="8" r="0.8" />
        <circle cx="12" cy="12" r="0.8" />
        <circle cx="8" cy="16" r="0.8" />
        <circle cx="16" cy="16" r="0.8" />
      </>
    ),
  },
  flag: {
    label: "Flag",
    paths: (
      <>
        <path d="M5 3v18" />
        <path d="M5 4h11l-2 4 2 4H5" />
      </>
    ),
  },
  crown: {
    label: "Crown",
    paths: (
      <>
        <path d="M3 8l4 8h10l4-8-5 3-4-6-4 6-5-3z" />
        <path d="M5 20h14" />
      </>
    ),
  },
  medal: {
    label: "Medal",
    paths: (
      <>
        <circle cx="12" cy="15" r="5" />
        <path d="M8 4l4 6 4-6M6 4h4M14 4h4" />
        <path d="M12 13l0.5 1.5H14l-1.2 1 .4 1.5-1.2-1-1.2 1 .4-1.5-1.2-1h1.5z" />
      </>
    ),
  },
  trophy: {
    label: "Trophy",
    paths: (
      <>
        <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
        <path d="M7 5H4a2 2 0 0 0 0 4h3M17 5h3a2 2 0 0 1 0 4h-3" />
        <path d="M10 15v3h4v-3M8 21h8" />
      </>
    ),
  },
  gamepad: {
    label: "Gamepad",
    paths: (
      <>
        <path d="M4 9a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6a3 3 0 0 1-5 2l-2-2h-2l-2 2a3 3 0 0 1-5-2z" />
        <path d="M8 11v2M7 12h2" />
        <circle cx="16" cy="12" r="0.8" />
        <circle cx="14" cy="10" r="0.8" />
        <circle cx="18" cy="10" r="0.8" />
      </>
    ),
  },
  bike: {
    label: "Bike",
    paths: (
      <>
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M5.5 17.5L10 10h4l4 7.5" />
        <path d="M10 10L7 7h-2" />
        <path d="M14 10l-1-3h3" />
      </>
    ),
  },
  boat: {
    label: "Boat",
    paths: (
      <>
        <path d="M3 18h18" />
        <path d="M5 15l2 3h10l2-3" />
        <path d="M12 3v14" />
        <path d="M12 6l-5 9M12 6l5 9" />
      </>
    ),
  },
  train: {
    label: "Train",
    paths: (
      <>
        <rect x="4" y="4" width="16" height="14" rx="2" />
        <path d="M4 12h16" />
        <circle cx="8" cy="15" r="1" />
        <circle cx="16" cy="15" r="1" />
        <path d="M7 21l2-3M15 18l2 3" />
      </>
    ),
  },
  kite: {
    label: "Kite",
    paths: (
      <>
        <path d="M12 3L5 10l7 7 7-7-7-7z" />
        <path d="M5 10h14M12 3v14" />
        <path d="M12 17l-2 3 2 1" />
      </>
    ),
  },

  // ── Shapes ──────────────────────────────────────────────────────────
  hexagon: {
    label: "Hexagon",
    paths: (
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    ),
  },
  triangle: {
    label: "Triangle",
    paths: <path d="M12 3l10 18H2L12 3z" />,
  },
  diamond: {
    label: "Diamond",
    paths: (
      <>
        <path d="M12 3L3 10l9 11 9-11L12 3z" />
        <path d="M3 10h18M8 10L12 3l4 7" />
      </>
    ),
  },
  origami: {
    label: "Origami",
    paths: (
      <>
        <path d="M3 10L12 3l9 7-9 11L3 10z" />
        <path d="M3 10l9 3 9-3M12 13v8" />
      </>
    ),
  },
  circle: {
    label: "Circle",
    paths: <circle cx="12" cy="12" r="8" />,
  },
  square: {
    label: "Square",
    paths: <rect x="5" y="5" width="14" height="14" rx="1" />,
  },
  pentagon: {
    label: "Pentagon",
    paths: <path d="M12 3l9 7-3 10H6l-3-10 9-7z" />,
  },
  checkmark: {
    label: "Check",
    paths: <path d="M4 13l5 5L20 7" />,
  },

  // ── Sports ──────────────────────────────────────────────────────────
  soccer: {
    label: "Soccer Ball",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
        <path d="M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
  },
  basketball: {
    label: "Basketball",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3v18" />
        <path d="M5.6 5.6a9 9 0 0 1 12.8 12.8" />
        <path d="M5.6 18.4a9 9 0 0 1 12.8-12.8" />
      </>
    ),
  },
  baseball: {
    label: "Baseball",
    paths: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M7 6c-1 3 0 7 3 10M17 6c1 3 0 7-3 10" />
      </>
    ),
  },

  // ── Music instruments ───────────────────────────────────────────────
  guitar: {
    label: "Guitar",
    paths: (
      <>
        <path d="M13 11L21 3" />
        <path d="M21 1l2 2-1 1 1 1-2 1-1-2-1-1z" />
        <circle cx="9" cy="15" r="5" />
        <circle cx="9" cy="15" r="1.5" />
      </>
    ),
  },
  piano: {
    label: "Piano",
    paths: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="1" />
        <path d="M8 6v12M12 6v12M16 6v12" />
        <path d="M6 6v7M10 6v7M14 6v7M18 6v7" />
      </>
    ),
  },
  drum: {
    label: "Drum",
    paths: (
      <>
        <ellipse cx="12" cy="8" rx="8" ry="3" />
        <path d="M4 8v8c0 1.7 3.6 3 8 3s8-1.3 8-3V8" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        <path d="M6 4l2 2M18 4l-2 2" />
      </>
    ),
  },

  // ── Objects ─────────────────────────────────────────────────────────
  candle: {
    label: "Candle",
    paths: (
      <>
        <path d="M9 9h6v11a2 2 0 0 1-6 0V9z" />
        <path d="M12 9V6c0-1 1-1.5 1-3 1 1.5 0 3-1 3z" />
      </>
    ),
  },
  ring: {
    label: "Ring",
    paths: (
      <>
        <circle cx="12" cy="16" r="5" />
        <path d="M8 11l4-7 4 7" />
      </>
    ),
  },
  bell: {
    label: "Bell",
    paths: (
      <>
        <path d="M6 17h12l-1-6a5 5 0 0 0-10 0l-1 6z" />
        <path d="M12 3v2" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </>
    ),
  },

  // ── Math / symbols ──────────────────────────────────────────────────
  pi: {
    label: "Pi",
    paths: (
      <>
        <path d="M4 8h16" />
        <path d="M8 8v12" />
        <path d="M16 8v10c0 2 2 2 3 1" />
      </>
    ),
  },
  sigma: {
    label: "Sigma",
    paths: <path d="M5 4h14l-8 8 8 8H5" />,
  },
  hashtag: {
    label: "Hashtag",
    paths: (
      <>
        <path d="M4 9h16M4 15h16" />
        <path d="M10 4l-2 16M17 4l-2 16" />
      </>
    ),
  },
  at: {
    label: "At",
    paths: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M16 8v6a2 2 0 0 0 4 0v-2a8 8 0 1 0-3 6" />
      </>
    ),
  },

  // ── Time ────────────────────────────────────────────────────────────
  hourglass: {
    label: "Hourglass",
    paths: (
      <path d="M6 3h12v3l-5 6 5 6v3H6v-3l5-6-5-6V3z" />
    ),
  },
  calendar: {
    label: "Calendar",
    paths: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M8 3v4M16 3v4" />
        <circle cx="8" cy="14" r="0.5" />
        <circle cx="12" cy="14" r="0.5" />
        <circle cx="16" cy="14" r="0.5" />
        <circle cx="8" cy="18" r="0.5" />
        <circle cx="12" cy="18" r="0.5" />
      </>
    ),
  },
};

const BOT_GLYPHS: Record<string, BotGlyphDefinition> = {
  ...INLINE_BOT_GLYPHS,
  ...LUCIDE_BOT_GLYPHS,
};

const DEFAULT_BOT_GLYPH: BotGlyphName = "bot";

function isBotGlyphName(value: string | null | undefined): value is BotGlyphName {
  return typeof value === "string" && value in BOT_GLYPHS;
}

function randomBotGlyph(): BotGlyphName {
  const index = Math.floor(Math.random() * CUSTOM_BOT_GLYPH_ORDER.length);
  return CUSTOM_BOT_GLYPH_ORDER[index] ?? DEFAULT_BOT_GLYPH;
}

const RANDOM_BOT_NAMES = [
  "Alex", "Avery", "Bailey", "Blake", "Cameron", "Casey", "Charlie",
  "Dakota", "Drew", "Eden", "Elliot", "Emerson", "Finley", "Harper",
  "Hayden", "Jamie", "Jordan", "Kai", "Kendall", "Logan", "Morgan",
  "Parker", "Quinn", "Reese", "Riley", "Robin", "Rowan", "Sage",
  "Sam", "Skyler", "Taylor", "Terry", "Zion",
  "Abigail", "Amelia", "Aria", "Audrey", "Aurora", "Bella", "Chloe",
  "Clara", "Daisy", "Eleanor", "Elena", "Eliza", "Ella", "Emily",
  "Emma", "Evelyn", "Fiona", "Grace", "Hazel", "Iris", "Isla", "Ivy",
  "Jade", "Julia", "Lena", "Lila", "Lily", "Lucy", "Luna", "Maya",
  "Mia", "Nina", "Nora", "Olivia", "Paige", "Ruby", "Sadie", "Sofia",
  "Stella", "Violet", "Zoe",
  "Aaron", "Adrian", "Andrew", "Asher", "Austin", "Benjamin", "Caleb",
  "Daniel", "David", "Elias", "Ethan", "Ezra", "Felix", "Finn",
  "Gabriel", "Henry", "Isaac", "Jack", "James", "Jonah", "Julian",
  "Leo", "Liam", "Lucas", "Mateo", "Miles", "Nathan", "Noah", "Oliver",
  "Owen", "Theo", "Thomas", "Wesley", "Wyatt",
] as const;

function randomBotName(): string {
  return randomArrayItem(RANDOM_BOT_NAMES);
}

function sampleBotNames(count: number): string[] {
  const pool = [...RANDOM_BOT_NAMES];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const names: string[] = pool.slice(0, Math.min(count, pool.length));
  while (names.length < count) {
    names.push(randomArrayItem(RANDOM_BOT_NAMES));
  }
  return names;
}

interface BotGlyphProps {
  name: string | null | undefined;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

const BOT_GLYPH_STANDARD_SIZE = 28;
const BOT_GLYPH_STANDARD_STROKE_WIDTH = 1.45;
const BOT_GLYPH_STROKE_MIN_SIZE = 14;
const BOT_GLYPH_STROKE_MAX_SIZE = 56;
const BOT_GLYPH_STROKE_HEAVY = 2.25;
const BOT_GLYPH_STROKE_THIN = 1.1;

function botGlyphStrokeForSize(size: number): number {
  if (size === BOT_GLYPH_STANDARD_SIZE) return BOT_GLYPH_STANDARD_STROKE_WIDTH;

  const clampedSize = Math.max(
    BOT_GLYPH_STROKE_MIN_SIZE,
    Math.min(BOT_GLYPH_STROKE_MAX_SIZE, size)
  );
  const t =
    (clampedSize - BOT_GLYPH_STROKE_MIN_SIZE) /
    (BOT_GLYPH_STROKE_MAX_SIZE - BOT_GLYPH_STROKE_MIN_SIZE);
  const stroke =
    BOT_GLYPH_STROKE_HEAVY +
    (BOT_GLYPH_STROKE_THIN - BOT_GLYPH_STROKE_HEAVY) * t;

  return Number(stroke.toFixed(2));
}

function BotGlyph({
  name,
  size = BOT_GLYPH_STANDARD_SIZE,
  strokeWidth,
  className,
}: BotGlyphProps): React.JSX.Element {
  const key: BotGlyphName = isBotGlyphName(name) ? name : DEFAULT_BOT_GLYPH;
  const definition = BOT_GLYPHS[key];
  const resolvedStrokeWidth = strokeWidth ?? botGlyphStrokeForSize(size);

  if (definition.icon) {
    const Icon = definition.icon;
    return (
      <Icon
        className={className}
        size={size}
        strokeWidth={resolvedStrokeWidth}
        aria-hidden={true}
      />
    );
  }

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={resolvedStrokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {definition.paths}
    </svg>
  );
}

function EmptyStateBotGlyph({
  bot,
  resolvedTheme,
  privateMode = false,
}: {
  bot: Bot;
  resolvedTheme: "light" | "dark";
  privateMode?: boolean;
}): React.JSX.Element {
  const style = botAccentStyle(bot.color, resolvedTheme);

  return (
    <span
      className={`${styles.emptyStateBotGlyph} ${
        privateMode ? styles.emptyStatePrivateBotGlyph : ""
      }`}
      aria-hidden="true"
      style={style}
    >
      <BotGlyph name={bot.glyph} />
    </span>
  );
}

// ── Empty-state icon ──────────────────────────────────────────────────
// Rendered at the top of the "new conversation" placeholder in Chat and
// Sandbox. Three rendering modes, chosen by preview/commit state:
//
//   1. No bot state → the same Prism mark used by the auth screen:
//      dark mode gets the boxed static triangle with animated RGB halos;
//      light mode gets the hue-rotating rainbow triangle with its static
//      drop-shadow.
//
//   2. `privateHero` set → private styling. Default/Prism keeps the
//      hub-style black tile with grayscale glow; selected bots keep their
//      glyph/color but render through a more restrained inverted private tile.
//
//   3. `previewBot` set → Prism triangle, but tinted to the hovered bot's
//      normalized color. This keeps hover feeling like Prism is focusing
//      through the bot rather than replacing the hero with the bot profile.
//
//   4. `bot` set → scaled-up sibling of the .botCardGlyph tile in the
//      bot's full color. Same visual language (tinted bg + border,
//      bot-color stroke) as every other place a bot is represented. The
//      stored color is normalized so legacy bots whose picked hex drifted
//      outside the current safe range still render readably. Used once the
//      user commits the bot selection.
//
// All modes paint at the same 56×56 footprint so the layout never
// jumps when the user scans across tiles.
interface EmptyStateIconProps {
  bot: Bot | null;
  previewBot?: Bot | null;
  previewAsBotGlyph?: boolean;
  /**
   * Private chats borrow the hub/profile avatar treatment for Default, while
   * selected bots render as a subdued inverted bot glyph.
   */
  privateHero?: boolean;
  /**
   * Force the bare Prism-triangle preview regardless of bot/previewBot.
   * Used by the empty-state surface during an active hue-lens drag so the
   * hero collapses to a single tintable triangle while the slider is
   * being engaged — the triangle's stroke inherits `--accent`, so any
   * shell-level lens tint flows through automatically.
   */
  forceTrianglePreview?: boolean;
  /**
   * Active theme, resolved upstream. The bot's stored color runs through
   * `normalizeAccentForTheme(_, resolvedTheme)` so deep hues lift in dark
   * mode and bright warm hues dim in light mode before painting glyphs.
   */
  resolvedTheme: "light" | "dark";
}

function EmptyStateIcon({
  bot,
  previewBot = null,
  previewAsBotGlyph = false,
  privateHero = false,
  forceTrianglePreview = false,
  resolvedTheme,
}: EmptyStateIconProps): React.JSX.Element {
  if (privateHero && bot) {
    return (
      <EmptyStateBotGlyph
        bot={bot}
        resolvedTheme={resolvedTheme}
        privateMode
      />
    );
  }

  if (privateHero) {
    return (
      <div
        className={`${styles.brandIconShell} ${styles.userHeroAvatar} ${styles.emptyStatePrivateHero}`}
        aria-hidden="true"
      >
        {/* Decorative shell art; keeping native img avoids layout shifts in this icon stack. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/icon.jpg"
          alt=""
          aria-hidden="true"
          className={styles.brandIcon}
        />
      </div>
    );
  }

  if (forceTrianglePreview) {
    return (
      <div
        className={`${styles.emptyStateBrand} ${styles.emptyStateBrandPreview}`}
        aria-hidden="true"
      >
        <PrismTriangleMark className={styles.emptyStateBrandTriangle} />
      </div>
    );
  }

  if (!bot && previewBot) {
    if (previewAsBotGlyph) {
      return (
        <EmptyStateBotGlyph bot={previewBot} resolvedTheme={resolvedTheme} />
      );
    }

    return (
      <div
        className={`${styles.emptyStateBrand} ${styles.emptyStateBrandPreview}`}
        aria-hidden="true"
      >
        <PrismTriangleMark className={styles.emptyStateBrandTriangle} />
      </div>
    );
  }

  if (bot) {
    return <EmptyStateBotGlyph bot={bot} resolvedTheme={resolvedTheme} />;
  }
  return (
    <div className={styles.brandIconShell} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon.jpg"
        alt=""
        aria-hidden="true"
        className={styles.brandIcon}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icon-triangle.svg"
        alt=""
        aria-hidden="true"
        className={styles.brandIconLight}
      />
    </div>
  );
}

interface BotGlyphPickerProps {
  value: string | null | undefined;
  onChange: (next: BotGlyphName) => void;
}

const BOT_GLYPH_PICKER_GLYPH_SIZE = 56;
const BOT_GLYPH_PICKER_STROKE_WIDTH = 0.85;

function BotGlyphPicker({ value, onChange }: BotGlyphPickerProps): React.JSX.Element {
  const selected: BotGlyphName = isBotGlyphName(value) ? value : DEFAULT_BOT_GLYPH;
  return (
    <div className={styles.glyphPicker} role="radiogroup" aria-label="Bot glyph">
      {CUSTOM_BOT_GLYPH_ORDER.map((key) => {
        const definition = BOT_GLYPHS[key];
        if (!definition) return null;
        const isSelected = key === selected;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`${styles.glyphOption} ${isSelected ? styles.glyphOptionSelected : ""}`}
            onClick={() => onChange(key)}
            title={definition.label}
            aria-label={definition.label}
          >
            <BotGlyph
              name={key}
              size={BOT_GLYPH_PICKER_GLYPH_SIZE}
              strokeWidth={BOT_GLYPH_PICKER_STROKE_WIDTH}
              className={styles.glyphOptionIcon}
            />
          </button>
        );
      })}
    </div>
  );
}

// ── Composer bot picker (custom dropdown) ────────────────────────────
// Replaces the native <select> in the composer rail so each option can
// render with its bot's glyph + tinted background. The native <select>
// can't show per-option glyphs or color tints on any OS — the options
// are always plain text rendered by the system popup — so we build a
// small CSS+React popover instead.
//
// Trigger states:
//   - Default selected (value === ""): shows the "BOT" mono-caps label
//     only. Communicates "no bot picked = Default" without repeating
//     the word "Default" in the trigger, which would be redundant with
//     the ever-present label.
//   - Bot selected: shows the bot's glyph + name, both tinted in the
//     bot's color. The surrounding pill also picks up a soft tint via
//     `data-bot-selected` so the control reads as "this bot is active".
//
// Popover is absolutely positioned above the trigger (compose sits at
// the bottom of the screen; opening downward would clip against the
// viewport floor). Closes on outside click, on Escape, on selection,
// and automatically if the trigger becomes disabled mid-open.
//
// Accessibility:
//   - Trigger: role=combobox via aria-haspopup=listbox + aria-expanded.
//   - Menu: role=listbox, each option role=option + aria-selected.
//   - Full keyboard nav is left to browser defaults (Tab between
//     options) for this pass — arrow-key nav can come later if needed.
interface ComposerBotPickerProps {
  /** Currently-selected bot id, or empty string for Default. */
  value: string;
  onChange: (nextValue: string) => void;
  bots: Bot[];
  resolvedTheme: "light" | "dark";
  disabled?: boolean;
  /** Native title tooltip — used to explain disabled states. */
  title?: string;
  /** Visible-label equivalent for screen readers. */
  ariaLabel: string;
  /**
   * Whether the trigger should render the selected bot's NAME next to
   * its glyph. Defaults to true (Sandbox behavior). Chat-mode sets this
   * false until the conversation has at least one message so the
   * pre-send trigger reads as a compact "glyph + color" preview and
   * doesn't duplicate the name already shown on the hero title.
   */
  showName?: boolean;
  /**
   * Once a thread has actual messages, the picker becomes the main way
   * to browse a large bot library mid-chat. These controls let that
   * popout narrow by both name and color without moving the user into a
   * separate management panel.
   */
  enableFilters?: boolean;
  hueFilterCenter?: number | null;
  onHueChange?: (next: number | null) => void;
  hueLensAvailable?: boolean;
  hueLensTrackGradient?: string;
  hueLensTrackSegments?: readonly HueLensTrackSegment[];
}

function ComposerBotPicker({
  value,
  onChange,
  bots,
  resolvedTheme,
  disabled,
  title,
  ariaLabel,
  showName = true,
  enableFilters = false,
  hueFilterCenter = null,
  onHueChange,
  hueLensAvailable = false,
  hueLensTrackGradient = "",
  hueLensTrackSegments = EMPTY_HUE_LENS_TRACK_SEGMENTS,
}: ComposerBotPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [botNameFilter, setBotNameFilter] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const selectedBot = value ? bots.find(b => b.id === value) ?? null : null;
  const selectedAccent = selectedBot?.color
    ? normalizeAccentForTheme(selectedBot.color, resolvedTheme)
    : null;
  const controlStyle: React.CSSProperties | undefined = selectedAccent
    ? ({ "--bot-color": selectedAccent } as React.CSSProperties)
    : undefined;
  const filtersEnabled = enableFilters && !disabled;
  const colorSortedBots = useMemo(
    () => filtersEnabled
      ? [...bots].sort((a, b) => compareBotsByColor(a, b, resolvedTheme, false))
      : bots,
    [bots, filtersEnabled, resolvedTheme]
  );
  const normalizedBotNameFilter = botNameFilter.trim().toLocaleLowerCase();
  const visibleBots = useMemo(() => {
    if (!filtersEnabled || normalizedBotNameFilter.length === 0) {
      return colorSortedBots;
    }
    return colorSortedBots.filter((bot) =>
      bot.name.toLocaleLowerCase().includes(normalizedBotNameFilter)
    );
  }, [colorSortedBots, filtersEnabled, normalizedBotNameFilter]);
  const showFilterControls = filtersEnabled && bots.length > 0;
  const showHueLensInMenu =
    showFilterControls && !!onHueChange && hueLensAvailable;
  const filterSummaryVisible =
    showFilterControls &&
    normalizedBotNameFilter.length > 0;
  const hueFocusBotId = useMemo(() => {
    if (!filtersEnabled || hueFilterCenter === null) return null;
    let bestBotId: string | null = null;
    let bestDistance = Infinity;
    for (const bot of visibleBots) {
      if (!botHasFilterableColor(bot)) continue;
      const { h } = hexToHsl(bot.color!.trim());
      const distance = Math.abs(hueLensPositionForHue(h) - hueFilterCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestBotId = bot.id;
      }
    }
    return bestBotId;
  }, [filtersEnabled, hueFilterCenter, visibleBots]);
  const menuOpen = open && !disabled;

  const randomizeHueOnOpen = useCallback(() => {
    if (!filtersEnabled || !onHueChange || !hueLensAvailable) {
      return;
    }
    const populatedBuckets = computeHueBuckets(bots)
      .filter((bucket) => bucket.count > 0);
    if (populatedBuckets.length === 0) return;
    const nextBucket =
      populatedBuckets[Math.floor(Math.random() * populatedBuckets.length)];
    onHueChange(hueLensPositionForHue(nextBucket.center));
  }, [bots, filtersEnabled, hueLensAvailable, onHueChange]);

  const toggleMenu = (): void => {
    const opening = !open;
    if (opening) {
      randomizeHueOnOpen();
    }
    setOpen(opening);
  };

  // Outside-click closes. Using mousedown (not click) so a click that
  // lands on a menu option isn't intercepted by this handler.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!isPrimaryPointerDismissal(event)) return;
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Escape closes and returns focus to the trigger so keyboard users
  // stay oriented in the compose rail instead of dropping focus to
  // the document body.
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen]);

  // If the control becomes disabled while the menu is open (e.g.,
  // send-in-flight disables mid-thread bot switching), close it so a
  // stale floating popover isn't left stranded on screen.
  useEffect(() => {
    if (!disabled || !open) return;
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [disabled, open]);

  useEffect(() => {
    if (!menuOpen || !hueFocusBotId) return;
    const timeout = window.setTimeout(() => {
      optionRefs.current.get(hueFocusBotId)?.scrollIntoView({
        block: "center",
      });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [hueFocusBotId, menuOpen]);

  const pick = (nextValue: string): void => {
    onChange(nextValue);
    setBotNameFilter("");
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className={styles.composeBotControl}
      data-bot-selected={selectedBot ? "true" : undefined}
      data-disabled={disabled ? "true" : undefined}
      data-open={menuOpen ? "true" : undefined}
      style={controlStyle}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.composeBotTrigger}
        onClick={toggleMenu}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label={ariaLabel}
      >
        {selectedBot ? (
          <>
            <span
              className={styles.composeBotTriggerGlyph}
              aria-hidden="true"
            >
              <BotGlyph
                name={selectedBot.glyph}
                size={14}
                strokeWidth={2.25}
              />
            </span>
            {showName && (
              <span className={styles.composeBotTriggerName}>
                {selectedBot.name}
              </span>
            )}
          </>
        ) : (
          <span className={styles.composeControlLabel}>Bot</span>
        )}
        <span
          className={styles.composeBotTriggerChevron}
          aria-hidden="true"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3.5 L5 6.5 L8 3.5" />
          </svg>
        </span>
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className={styles.composeBotMenu}
        >
          {showFilterControls && (
            <div className={styles.composeBotFilters}>
              <div className={styles.composeBotSearchRow}>
                <input
                  type="search"
                  value={botNameFilter}
                  onChange={(event) =>
                    setBotNameFilter(event.currentTarget.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                    }
                  }}
                  className={styles.composeBotSearch}
                  placeholder="Filter bots..."
                  aria-label="Filter bots by name"
                />
                {filterSummaryVisible && (
                  <span
                    className={styles.composeBotFilterCount}
                    aria-live="polite"
                  >
                    {visibleBots.length}/{bots.length}
                  </span>
                )}
              </div>
              {showHueLensInMenu && onHueChange && (
                <HueLensControl
                  bots={bots}
                  filteredBots={visibleBots}
                  hueFilterCenter={hueFilterCenter}
                  onHueChange={onHueChange}
                  hueLensAvailable={hueLensAvailable}
                  trackGradient={hueLensTrackGradient}
                  trackSegments={hueLensTrackSegments}
                  resolvedTheme={resolvedTheme}
                  compact
                  showCount={false}
                  allowClear={false}
                />
              )}
            </div>
          )}
          <div
            className={styles.composeBotListbox}
            role="listbox"
            aria-label={ariaLabel}
          >
            <button
              type="button"
              className={`${styles.composeBotOption} ${styles.composeBotOptionDefault}`}
              role="option"
              aria-selected={value === ""}
              onClick={() => pick("")}
            >
              {/* Empty glyph slot preserves the grid alignment with the
                  bot rows below; no icon needed because Default has no
                  brand identity. */}
              <span
                className={styles.composeBotOptionGlyph}
                aria-hidden="true"
              />
              <span className={styles.composeBotOptionName}>Default</span>
            </button>
            {visibleBots.length === 0 && (
              <div
                className={styles.composeBotNoMatches}
                role="option"
                aria-selected="false"
                aria-disabled="true"
              >
                No bots match.
              </div>
            )}
            {visibleBots.map(b => {
              const isSelected = value === b.id;
              const accent = b.color
                ? normalizeAccentForTheme(b.color, resolvedTheme)
                : null;
              const optionStyle: React.CSSProperties | undefined = accent
                ? ({
                    "--bot-color": accent,
                    "--bot-menu-color":
                      resolvedTheme === "light"
                        ? ensureContrast(
                            accent,
                            THEME_SURFACE_BG.light,
                            COMPOSE_BOT_LIGHT_INK_CONTRAST_RATIO
                          )
                        : accent,
                  } as React.CSSProperties)
                : undefined;
              return (
                <button
                  key={b.id}
                  ref={(node) => {
                    if (node) {
                      optionRefs.current.set(b.id, node);
                    } else {
                      optionRefs.current.delete(b.id);
                    }
                  }}
                  type="button"
                  className={styles.composeBotOption}
                  role="option"
                  aria-selected={isSelected}
                  style={optionStyle}
                  onClick={() => pick(b.id)}
                >
                  <span
                    className={styles.composeBotOptionGlyph}
                    aria-hidden="true"
                  >
                    <BotGlyph
                      name={b.glyph}
                      size={14}
                      strokeWidth={2.25}
                    />
                  </span>
                  <span className={styles.composeBotOptionName}>
                    {b.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ComposerModelPickerProps {
  value: string;
  onChange: (nextValue: string) => void;
  options: ModelCatalogEntry[];
  provider: Provider;
  disabled?: boolean;
  title?: string;
  ariaLabel: string;
}

function ComposerModelPicker({
  value,
  onChange,
  options,
  provider,
  disabled,
  title,
  ariaLabel,
}: ComposerModelPickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedModel =
    value === AUTO_MODEL_CHOICE
      ? null
      : options.find((model) => model.id === value) ?? null;
  const selectedLabel =
    value === AUTO_MODEL_CHOICE
      ? "Auto"
      : selectedModel?.label ?? value;
  const menuOpen = open && !disabled;

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (!isPrimaryPointerDismissal(event)) return;
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!disabled || !open) return;
    const timeout = window.setTimeout(() => setOpen(false), 0);
    return () => window.clearTimeout(timeout);
  }, [disabled, open]);

  const pick = (nextValue: string): void => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div
      className={styles.composeModelControl}
      data-disabled={disabled ? "true" : undefined}
      data-open={menuOpen ? "true" : undefined}
      data-provider={provider}
    >
      <button
        ref={triggerRef}
        type="button"
        className={styles.composeModelTrigger}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        title={title}
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label={ariaLabel}
      >
        <span className={styles.composeControlLabel}>Model</span>
        <span className={styles.composeModelTriggerName}>
          {selectedLabel}
        </span>
        <span
          className={styles.composeModelTriggerChevron}
          aria-hidden="true"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M2 3.5 L5 6.5 L8 3.5" />
          </svg>
        </span>
      </button>
      {menuOpen && (
        <div
          ref={menuRef}
          className={`${styles.composeBotMenu} ${styles.composeModelMenu}`}
        >
          <div
            className={styles.composeBotListbox}
            role="listbox"
            aria-label={ariaLabel}
          >
            <button
              type="button"
              className={`${styles.composeBotOption} ${styles.composeModelOption}`}
              role="option"
              aria-selected={value === AUTO_MODEL_CHOICE}
              onClick={() => pick(AUTO_MODEL_CHOICE)}
            >
              <span className={styles.composeModelOptionMain}>
                <span className={styles.composeModelOptionName}>Auto</span>
                <span className={styles.composeModelOptionMeta}>
                  Uses default routing
                </span>
              </span>
            </button>
            {options.map((model) => {
              const isSelected = value === model.id;
              return (
                <button
                  key={model.id}
                  type="button"
                  className={`${styles.composeBotOption} ${styles.composeModelOption}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => pick(model.id)}
                >
                  <span className={styles.composeModelOptionMain}>
                    <span className={styles.composeModelOptionName}>
                      {model.label}
                    </span>
                    {model.hostLabel && (
                      <span className={styles.composeModelOptionMeta}>
                        {model.hostLabel}
                      </span>
                    )}
                  </span>
                  {model.isDefault && (
                    <span className={styles.composeModelDefaultBadge}>
                      Default
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hue lens (color filter) ──────────────────────────────────────────
// Color-band filter for bot-heavy picking surfaces. Pre-chat it sits
// above the compose tools so it can reshape the big starter grid; once a
// chat has messages it embeds inside the bot popout alongside name
// search. Moving the slider activates the filter at that hue; "All"
// clears it. Active state exposes the visible-bot count so the user
// knows exactly what slice of their library is showing.
//
// Renders only when at least two color families are available — otherwise
// the lens has no meaningful choice to offer and would just be visual noise.
interface HueLensControlProps {
  /** Total bot library — drives the "of N" count. */
  bots: Bot[];
  /** Visible bots to count beside the slider when counts are enabled. */
  filteredBots: Bot[];
  /** Active PRISM lens position in the slider's 0..359 range, or null when inactive. */
  hueFilterCenter: number | null;
  /** Setter; receives a PRISM lens position to activate, or null to clear. */
  onHueChange: (next: number | null) => void;
  /** True when at least two populated color families are worth filtering. */
  hueLensAvailable: boolean;
  /** Pre-computed CSS `linear-gradient(...)` string for populated PRISM bars. */
  trackGradient: string;
  /** Populated PRISM families, ordered as they appear on the compacted track. */
  trackSegments: readonly HueLensTrackSegment[];
  /** Compact layout for embedding inside the bot popout. */
  compact?: boolean;
  /** Active app theme for rail/thumb contrast tuning. */
  resolvedTheme: "light" | "dark";
  /** Whether to render the active visible/total count next to the slider. */
  showCount?: boolean;
  /** Whether the active state can be cleared back to "All". */
  allowClear?: boolean;
  /**
   * Notifies the parent shell when the user is actively pressing/touching
   * the slider thumb. The empty-state surface uses this to drive a
   * "drag-only preview" mode (hero collapses to a Prism triangle, shell
   * accent tints to the lens hue) while keeping the control's filter
   * commit semantics unchanged. Optional — embedders that don't care
   * about drag state (e.g. the popout) can omit it.
   */
  onInteractionChange?: (active: boolean) => void;
}

function HueLensControl({
  bots,
  filteredBots,
  hueFilterCenter,
  onHueChange,
  hueLensAvailable,
  trackGradient,
  trackSegments,
  compact = false,
  resolvedTheme,
  showCount = true,
  allowClear = true,
  onInteractionChange,
}: HueLensControlProps): React.JSX.Element | null {
  const hueChangeFrameRef = useRef<number | null>(null);
  const pendingHueChangeRef = useRef<number | null>(null);
  const latestOnHueChangeRef = useRef(onHueChange);

  useEffect(() => {
    latestOnHueChangeRef.current = onHueChange;
  }, [onHueChange]);

  useEffect(() => {
    return () => {
      if (hueChangeFrameRef.current !== null) {
        cancelAnimationFrame(hueChangeFrameRef.current);
      }
    };
  }, []);

  const scheduleHueChange = useCallback((next: number | null) => {
    if (next === null) {
      if (hueChangeFrameRef.current !== null) {
        cancelAnimationFrame(hueChangeFrameRef.current);
        hueChangeFrameRef.current = null;
      }
      pendingHueChangeRef.current = null;
      latestOnHueChangeRef.current(null);
      return;
    }

    pendingHueChangeRef.current = next;
    if (hueChangeFrameRef.current !== null) return;

    hueChangeFrameRef.current = requestAnimationFrame(() => {
      hueChangeFrameRef.current = null;
      latestOnHueChangeRef.current(pendingHueChangeRef.current);
    });
  }, []);

  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      scheduleHueChange(
        hueLensFilterCenterForSliderValue(
          Number(event.currentTarget.value),
          trackSegments
        )
      );
    },
    [scheduleHueChange, trackSegments]
  );
  // Pointer + touch start/end fire the drag-state callback so the shell
  // can flip preview UI on for the duration of an active drag without
  // the lens itself owning any of that surrounding state. Pointer events
  // cover both mouse and stylus on modern browsers; touch handlers stay
  // as a fallback for legacy mobile webviews that gate pointer events.
  const handleInteractionStart = useCallback(
    () => onInteractionChange?.(true),
    [onInteractionChange]
  );
  const handleInteractionEnd = useCallback(
    () => onInteractionChange?.(false),
    [onInteractionChange]
  );
  if (!hueLensAvailable) return null;
  const active = hueFilterCenter !== null;
  // Inactive state still parks the slider thumb at a neutral resting
  // position so the control reads as "ready to use" rather than empty.
  // The value is a presentation-only fallback; activation depends on
  // `active`/`hueFilterCenter`, not on the slider's reported value.
  const sliderValue = active
    ? hueLensSliderValueForFilterCenter(hueFilterCenter, trackSegments)
    : 180;
  const isDarkTheme = resolvedTheme === "dark";
  const lensStyle = {
    "--lens-track-gradient": trackGradient,
    "--hue-lens-rail-bg": isDarkTheme ? HUE_LENS_RAIL_BG_DARK : HUE_LENS_RAIL_BG_LIGHT,
    "--hue-lens-thumb-fill": isDarkTheme ? HUE_LENS_THUMB_FILL_DARK : HUE_LENS_THUMB_FILL_LIGHT,
    "--hue-lens-thumb-shadow": isDarkTheme
      ? HUE_LENS_THUMB_SHADOW_DARK
      : HUE_LENS_THUMB_SHADOW_LIGHT,
    "--hue-lens-focus-ring": isDarkTheme ? HUE_LENS_FOCUS_RING_DARK : HUE_LENS_FOCUS_RING_LIGHT,
  } as React.CSSProperties;
  return (
    <div
      className={`${styles.hueLensRow} ${compact ? styles.hueLensRowCompact : ""}`}
      data-active={active ? "true" : undefined}
      style={lensStyle}
    >
      <span className={styles.hueLensLabel} aria-hidden="true">
        Lens
      </span>
      <input
        type="range"
        min={0}
        max={359}
        step={1}
        value={sliderValue}
        onChange={handleSliderChange}
        onPointerDown={handleInteractionStart}
        onPointerUp={handleInteractionEnd}
        onPointerCancel={handleInteractionEnd}
        onTouchStart={handleInteractionStart}
        onTouchEnd={handleInteractionEnd}
        onTouchCancel={handleInteractionEnd}
        aria-label="Color lens — filter bots by hue"
        title="Filter bots by hue"
        className={styles.hueLensSlider}
      />
      {active && (
        <>
          {showCount && (
            <span
              className={styles.hueLensCount}
              aria-live="polite"
            >
              {filteredBots.length}/{bots.length}
            </span>
          )}
          {allowClear && (
            <button
              type="button"
              className={styles.hueLensClear}
              onClick={() => scheduleHueChange(null)}
              aria-label="Show all bots — clear color filter"
              title="Show all bots"
            >
              All
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ── Touch preview balloon ────────────────────────────────────────────
// Mobile keyboard-style "lifted key" preview that floats above the
// user's finger when they touch the bot picker at high-density stages.
// At those stages the tile under the finger is too small (or has lost
// its glyph) to identify by sight, so we lift the visual feedback off
// the touch point — the same trick iOS/Android keyboards use to show
// the pressed key above the thumb.
//
// The balloon mirrors the resting visual identity of `.chatBotTile`
// (rounded card, soft shadow, bot-color fill, glyph centered) but at a
// readable size, plus the bot's name underneath. On the top edge of
// the picker it auto-flips below the finger so it stays in view.
//
// Position is `fixed` so the balloon escapes any clipping / transform
// container — the picker itself uses `transform: translate3d` and
// `position: absolute`, both of which would otherwise cap or warp a
// child. Coordinates come from the captured `clientX`/`clientY` so the
// balloon tracks the finger directly without a re-layout.
interface TouchPreviewBalloonProps {
  bot: Bot | null;
  x: number;
  y: number;
  resolvedTheme: "light" | "dark";
}

const TOUCH_PREVIEW_BALLOON_HEIGHT = 112;
const TOUCH_PREVIEW_BALLOON_OFFSET = 24;

function TouchPreviewBalloon({
  bot,
  x,
  y,
  resolvedTheme,
}: TouchPreviewBalloonProps): React.JSX.Element | null {
  if (!bot) return null;
  // Auto-flip below the finger when the touch sits near the top of the
  // viewport — without this, a user dragging across the top row would
  // see the balloon escape upward and either clip or hide off-screen.
  const flipBelow =
    y < TOUCH_PREVIEW_BALLOON_HEIGHT + TOUCH_PREVIEW_BALLOON_OFFSET + 12;
  const top = flipBelow
    ? y + TOUCH_PREVIEW_BALLOON_OFFSET
    : y - TOUCH_PREVIEW_BALLOON_HEIGHT - TOUCH_PREVIEW_BALLOON_OFFSET;
  const accent = bot.color?.trim()
    ? normalizeAccentForTheme(bot.color.trim(), resolvedTheme)
    : null;
  const balloonStyle: React.CSSProperties = {
    left: `${x}px`,
    top: `${top}px`,
  };
  if (accent) {
    (balloonStyle as React.CSSProperties & Record<string, string>)[
      "--bot-color"
    ] = accent;
  }
  const glyphName: BotGlyphName = isBotGlyphName(bot.glyph)
    ? bot.glyph
    : DEFAULT_BOT_GLYPH;
  return (
    <div
      className={styles.touchPreviewBalloon}
      data-flip-below={flipBelow ? "true" : undefined}
      style={balloonStyle}
      aria-hidden="true"
    >
      <span className={styles.touchPreviewBalloonGlyph}>
        <BotGlyph name={glyphName} size={56} strokeWidth={1.45} />
      </span>
      <span className={styles.touchPreviewBalloonName}>{bot.name}</span>
    </div>
  );
}

// ── Combined color + glyph picker ────────────────────────────────────
// Single swatch button that doubles as a glyph preview: the button paints
// as a solid bot-color tile, and the glyph inside inherits a readable text
// color so the mark stays legible on any accent. Click opens a popover
// containing BOTH the color wheel AND the full glyph grid so the two
// parts of "bot identity" (hue + mark) live in one affordance. Right-
// clicking the swatch or the popover re-rolls BOTH color + glyph — a
// single tap to resample a whole new identity.
interface ColorGlyphPickerProps {
  color: string;
  glyph: BotGlyphName;
  onColorChange: (next: string) => void;
  onGlyphChange: (next: BotGlyphName) => void;
  open: boolean;
  onToggle: () => void;
  /** Optional label override for accessibility (defaults are fine for both forms). */
  ariaLabel?: string;
  /**
   * Active visual theme, resolved upstream so we never have to peek at the
   * DOM. The color is normalized against this theme before it paints the
   * solid preview tile and glyph-grid selection states.
   */
  resolvedTheme: "light" | "dark";
}

// ── Unified "virtual camera" for the glyph shoebox ────────────────────
// One (nx, ny) camera position drives every cue in the stack: the radial
// vignette (darker on the far wall), the rim-light (brighter on the near
// rim — see ::before in the stylesheet), and a subtle intensity ramp on
// the vignette. The button grid itself intentionally stays untransformed
// so pointer hit targets remain aligned with the visible glyph boxes.
function updateGlyphCamera(
  shell: HTMLElement,
  inner: HTMLElement | null,
  nx: number,
  ny: number,
): void {
  const x = Math.max(0, Math.min(1, nx));
  const y = Math.max(0, Math.min(1, ny));
  shell.style.setProperty("--vignette-x", `${(x * 100).toFixed(1)}%`);
  shell.style.setProperty("--vignette-y", `${(y * 100).toFixed(1)}%`);
  // Intensity ramp 1.0 → 1.35 with camera distance from center. Baseline
  // is 1.0 (matching the original static vignette strength) so "at rest"
  // doesn't look suddenly dimmer than it did before — the ramp only
  // ADDS depth when the camera pulls toward a corner, never subtracts.
  const cx = (x - 0.5) * 2;
  const cy = (y - 0.5) * 2;
  const dist = Math.min(1, Math.hypot(cx, cy));
  shell.style.setProperty("--vignette-intensity", (1 + dist * 0.35).toFixed(3));
  if (inner) {
    // Keep glyph hit targets exactly aligned with their visible boxes.
    // The shell still gets the camera-driven vignette/rim light; tilting
    // the scrollable button grid itself can create fixed dead zones in
    // browser hit-testing.
    inner.style.transform = "none";
  }
}

function ColorGlyphPicker({
  color,
  glyph,
  onColorChange,
  onGlyphChange,
  open,
  onToggle,
  ariaLabel = "Bot color and glyph. Click to open the picker, right-click for random.",
  resolvedTheme,
}: ColorGlyphPickerProps): React.JSX.Element {
  const [mobilePickerActive, setMobilePickerActive] = useState(false);
  const [draftColor, setDraftColor] = useState(color);
  const [draftGlyph, setDraftGlyph] = useState<BotGlyphName>(glyph);
  const pickerColor = mobilePickerActive && open ? draftColor : color;
  const pickerGlyph = mobilePickerActive && open ? draftGlyph : glyph;
  // Everything the swatch paints keys off the band-clamped color, not the
  // raw hex. The editor preview intentionally uses a solid selected-tile
  // treatment; the empty-state hero gets its own softer ambient styling.
  const displayColor = normalizeAccentForTheme(pickerColor, resolvedTheme);
  const readable = pickReadableText(displayColor);
  // Indicator position on the square tracks the current color so users
  // see where they are without a sliders UI. X → hue, Y → lightness
  // (inverted: top = lighter). The Y axis is bounded to the safe
  // accent band for the active theme — top row = band.max, bottom row =
  // band.min — which matches what the click handler emits and the CSS
  // overlays paint.
  const { min: bandMin, max: bandMax } = accentLightnessBand(resolvedTheme);
  const { h: currentHue, l: currentLightness } = hexToHsl(displayColor);
  const lightnessRange = bandMax - bandMin;
  const indicatorLeft = (currentHue / 360) * 100;
  const indicatorTop =
    ((bandMax - currentLightness) / lightnessRange) * 100;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 799px)");
    const update = () => setMobilePickerActive(media.matches);
    update();
    media.addEventListener?.("change", update);
    media.addListener?.(update);
    return () => {
      media.removeEventListener?.("change", update);
      media.removeListener?.(update);
    };
  }, []);

  const togglePicker = useCallback(() => {
    if (!open) {
      setDraftColor(color);
      setDraftGlyph(glyph);
    }
    onToggle();
  }, [color, glyph, onToggle, open]);

  const commitColorPick = useCallback(
    (next: string) => {
      if (mobilePickerActive) {
        setDraftColor(next);
        return;
      }
      onColorChange(next);
    },
    [mobilePickerActive, onColorChange]
  );

  const commitGlyphPick = useCallback(
    (next: BotGlyphName) => {
      if (mobilePickerActive) {
        setDraftGlyph(next);
        return;
      }
      onGlyphChange(next);
    },
    [mobilePickerActive, onGlyphChange]
  );

  const applyMobileDraft = useCallback(() => {
    onColorChange(draftColor);
    onGlyphChange(draftGlyph);
    onToggle();
  }, [draftColor, draftGlyph, onColorChange, onGlyphChange, onToggle]);

  // Refs for the two glyph-grid layers. shell = outermost clip + camera
  // target for the vignette/rim light; parallaxRef points at the scroll
  // content but is kept untransformed so the visible glyph boxes and hit
  // targets remain perfectly aligned.
  const parallaxRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // The .colorPickerWrapper itself. Its viewport rect is the anchor
  // for the floating popover — we read it on open (and on resize)
  // and feed an inline `top`/`left` (already projected into the
  // dimmed area to the LEFT of the panel) so the popover can render
  // with `position: fixed` and escape the panel's overflow clip,
  // mirroring the parameter-help tooltip pattern. Without this, the
  // popover would fall back to `position: absolute` inside the panel
  // (where it overlaps the system-prompt textarea + parameter card
  // and intercepts clicks).
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Final viewport coords for the popover's top-left corner (NOT the
  // raw swatch rect — the leftward shift is folded in here so the
  // inline style is self-sufficient and doesn't depend on a CSS
  // `transform`). `null` while the popover is closed OR while the
  // viewport is narrow enough that the popover should fall back to
  // the centered-modal mobile layout (the `@media (max-width: 799px)`
  // override in the stylesheet ignores inline top/left only when we
  // skip setting them, hence the explicit null on mobile).
  const [popoverAnchor, setPopoverAnchor] =
    useState<{ top: number; left: number } | null>(null);
  // Below this width, the popover renders as a centered modal
  // (the existing mobile fallback). Mirrors the @media breakpoint
  // in page.module.css so JS and CSS agree on when the side-anchored
  // layout is active.
  const POPOVER_WIDE_BREAKPOINT_PX = 800;
  // Popover footprint: width (matches the CSS `width: 320px`) and the
  // gap between the popover's right edge and the swatch's left edge
  // when projecting the anchor leftward. Hoisting these as constants
  // keeps the JS-side projection in lockstep with the CSS — change
  // both together if the popover's footprint ever moves.
  const POPOVER_WIDTH_PX = 320;
  const POPOVER_GAP_FROM_SWATCH_PX = 32;

  // ── Drag state for the color square ───────────────────────────────
  // Pointer drag wiring (mouse / touch / stylus, unified via the
  // Pointer Events API). A single pointerdown grabs `setPointerCapture`
  // so the drag continues even if the cursor leaves the square, and a
  // short rAF loop coalesces the ~120Hz pointermove firehose into one
  // commit per painted frame — the swatch, indicator, and (through
  // `shellStyle` upstream) the whole app shell repaint at display
  // refresh rate instead of re-rendering for intermediate positions
  // the user would never see.
  //
  // draggingRef:     is a pointer currently captured?
  // dragRectRef:     the square's bounding rect, cached at pointerdown
  //                  so we skip a layout-flushing getBoundingClientRect
  //                  on every move. The popover is position: fixed /
  //                  mounted-while-open, so the rect is stable for the
  //                  lifetime of a drag.
  // pendingPointRef: latest pointer position awaiting commit. The rAF
  //                  tick reads and clears it.
  // dragFrameRef:    handle of the scheduled rAF, so we can coalesce
  //                  and cancel.
  const draggingRef = useRef(false);
  const dragRectRef = useRef<DOMRect | null>(null);
  const pendingPointRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const dragFrameRef = useRef<number | null>(null);

  // Map a pointer position inside `rect` to an HSL-picked hex using the
  // same axis convention as the visible gradient overlay: X → hue
  // 0..360, Y → lightness band.max..band.min (top row brightest
  // allowed, bottom row darkest allowed), where `band` tightens in
  // dark mode via `accentLightnessBand`. Clamping both axes to [0, 1]
  // lets captured pointers that wander past the square's edge still
  // resolve to the nearest in-bounds color rather than overshooting.
  const computePickedColor = useCallback(
    (clientX: number, clientY: number, rect: DOMRect): string => {
      const nx = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const ny = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      const hue = nx * 360;
      const { min, max } = accentLightnessBand(resolvedTheme);
      const lightness = max - ny * (max - min);
      return hslToHex(hue, 100, lightness);
    },
    [resolvedTheme]
  );

  // rAF callback: commit the freshest pending pointer position, if
  // any. Written as a ref-reading function (not a useState-reading
  // closure) so we never capture a stale onColorChange — the ref
  // values are always current at flush time.
  const flushPendingPick = useCallback(() => {
    dragFrameRef.current = null;
    const pending = pendingPointRef.current;
    const rect = dragRectRef.current;
    if (!pending || !rect) return;
    pendingPointRef.current = null;
    commitColorPick(computePickedColor(pending.clientX, pending.clientY, rect));
  }, [commitColorPick, computePickedColor]);

  const schedulePickFlush = useCallback(() => {
    if (dragFrameRef.current != null) return;
    dragFrameRef.current = requestAnimationFrame(flushPendingPick);
  }, [flushPendingPick]);

  const handleSquarePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      // Preempt the browser's native text-selection + drag-ghost
      // behavior so a press-and-drag on the square doesn't highlight
      // nearby UI or start a phantom "drag image".
      event.preventDefault();
      const target = event.currentTarget;
      // Capture the pointer so subsequent move events land on this
      // element even when the cursor leaves it — the user shouldn't
      // have to stay inside the square to finish a pick.
      target.setPointerCapture(event.pointerId);
      draggingRef.current = true;
      dragRectRef.current = target.getBoundingClientRect();
      // Commit the landing position synchronously so a tap (no drag)
      // feels instant; subsequent moves are rAF-coalesced.
      commitColorPick(
        computePickedColor(event.clientX, event.clientY, dragRectRef.current)
      );
    },
    [commitColorPick, computePickedColor]
  );

  const handleSquarePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      pendingPointRef.current = { clientX: event.clientX, clientY: event.clientY };
      schedulePickFlush();
    },
    [schedulePickFlush]
  );

  const handleSquarePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      // Flush any queued rAF synchronously so the final release
      // position is committed immediately — without this, releasing
      // between two animation frames would drop the last movement
      // and leave the swatch on the previous frame's color.
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      const pending = pendingPointRef.current;
      const rect = dragRectRef.current;
      if (pending && rect) {
        commitColorPick(computePickedColor(pending.clientX, pending.clientY, rect));
      }
      pendingPointRef.current = null;
      dragRectRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Capture may have already been released by the browser
        // (e.g. on some touch-end paths); releasing twice throws.
      }
    },
    [commitColorPick, computePickedColor]
  );

  // Mirror of Up for interrupted drags (OS alerts, touch cancellation,
  // context menus, viewport changes). Drops any pending state without
  // committing a partial pick — the last successfully-moved frame
  // stays as the current color.
  const handleSquarePointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      draggingRef.current = false;
      pendingPointRef.current = null;
      dragRectRef.current = null;
      if (dragFrameRef.current != null) {
        cancelAnimationFrame(dragFrameRef.current);
        dragFrameRef.current = null;
      }
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // See handleSquarePointerUp — capture may be gone already.
      }
    },
    []
  );

  // Drop any in-flight drag state when the popover closes. Without
  // this, a scheduled rAF could fire after the square is unmounted,
  // call onColorChange with a stale rect, and quietly overwrite the
  // user's picked color.
  useEffect(() => {
    if (open) return;
    draggingRef.current = false;
    pendingPointRef.current = null;
    dragRectRef.current = null;
    if (dragFrameRef.current != null) {
      cancelAnimationFrame(dragFrameRef.current);
      dragFrameRef.current = null;
    }
  }, [open]);

  // Position driver — the baseline camera. Maps the shell's viewport
  // position to the camera coords so the vignette + rim light pool on
  // the side facing the nearest viewport edge. Popover floating near
  // the top-right of the screen → camera at (1, 0) → rim-light on the
  // top-right edges, shadow on the bottom-left. Popover centered → even
  // ring. Simulates light bouncing off the edges of a physical 3D box
  // being pushed against a wall.
  const positionCamera = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    // Shell's center as a [0, 1] coordinate inside the viewport. Clamp
    // defensively — if the popover ever ends up partially off-screen,
    // the vignette stays on the visible side instead of going out of
    // range and producing a flat background.
    const nx = Math.max(
      0,
      Math.min(1, (rect.left + rect.width / 2) / window.innerWidth),
    );
    const ny = Math.max(
      0,
      Math.min(1, (rect.top + rect.height / 2) / window.innerHeight),
    );
    updateGlyphCamera(shell, parallaxRef.current, nx, ny);
  }, []);

  // Floating-popover anchor driver. Captures the swatch wrapper's
  // viewport rect synchronously before paint (useLayoutEffect) and
  // projects it leftward by (popover width + gap) so the popover's
  // right edge lands a clean POPOVER_GAP_FROM_SWATCH_PX from the
  // swatch — placing it cleanly outside the panel chrome in the
  // dimmed area. The projection happens here in JS rather than via
  // a CSS `transform` so the inline style is fully self-sufficient
  // (immune to CSS HMR oddities and ancestor stacking-context
  // surprises). Re-measures on resize so the popover stays glued
  // to the swatch when the viewport changes. On narrow viewports
  // (< POPOVER_WIDE_BREAKPOINT_PX) we leave anchor `null` so the
  // `@media (max-width: 799px)` centered-modal fallback in
  // page.module.css can take over.
  useLayoutEffect(() => {
    if (!open) {
      // Resetting the anchor when the popover closes is the intended
      // synchronization between component-state and the projected
      // viewport-rect cache; the cascading-render concern the lint rule
      // raises doesn't apply here because `popoverAnchor` is not in the
      // effect's dep array, so this never re-fires the effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPopoverAnchor(null);
      return;
    }
    function measure() {
      if (typeof window === "undefined") return;
      if (window.innerWidth < POPOVER_WIDE_BREAKPOINT_PX) {
        setPopoverAnchor(null);
        return;
      }
      const wrapper = wrapperRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      setPopoverAnchor({
        top: rect.top,
        left: rect.left - POPOVER_WIDTH_PX - POPOVER_GAP_FROM_SWATCH_PX,
      });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  // Wire the position driver only while the popover is open (the DOM
  // doesn't exist until then, and leaving listeners attached to window
  // after unmount leaks). Window scroll + resize both move the shell
  // within the viewport, so both trigger a re-compute.
  useEffect(() => {
    if (!open) return;
    const shell = shellRef.current;
    if (!shell) return;
    window.addEventListener("scroll", positionCamera, { passive: true });
    window.addEventListener("resize", positionCamera);
    // Initial pass once the popover has mounted — gives the opening
    // animation a baseline to ease into instead of a 50%/50% flash.
    positionCamera();
    return () => {
      window.removeEventListener("scroll", positionCamera);
      window.removeEventListener("resize", positionCamera);
    };
  }, [open, positionCamera]);

  // Cursor driver — hover-capable override. While the cursor is over
  // the shell, its position becomes the vignette/rim camera directly.
  const handleGridMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const shell = event.currentTarget;
      const rect = shell.getBoundingClientRect();
      const nx = (event.clientX - rect.left) / rect.width;
      const ny = (event.clientY - rect.top) / rect.height;
      updateGlyphCamera(shell, parallaxRef.current, nx, ny);
    },
    []
  );

  // On leave, re-invoke the position driver so the camera eases back
  // to match the shell's current viewport placement (NOT a hard 50%/50%
  // reset). Cursor effect softly hands off to the ambient "where on the
  // screen the box is" cue.
  const handleGridMouseLeave = useCallback(() => {
    positionCamera();
  }, [positionCamera]);

  return (
    <div ref={wrapperRef} className={styles.colorPickerWrapper} data-color-affordance="true">
      <button
        type="button"
        className={styles.colorSwatchButton}
        style={{
          ["--bot-color" as string]: displayColor,
          ["--bot-tile-ink" as string]: readable,
        } as React.CSSProperties}
        onClick={togglePicker}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Click to pick color and glyph"
      >
        <BotGlyph name={pickerGlyph} />
      </button>
      {open && (
        // Popover is a pure picking surface — no reroll affordance lives
        // here. Randomization is exclusively the swatch's right-click,
        // keeping the popover's two jobs (pick color, pick glyph)
        // unambiguous.
        //
        // Inline `position`/`top`/`left` only fire on wide viewports —
        // `popoverAnchor` already encodes the leftward shift into the
        // dimmed area beside the panel (see useLayoutEffect above).
        // We force `position: fixed` inline because (a) the popover
        // MUST escape the panel's overflow clip to render in the
        // dimmed area, and (b) inlining the position keeps us robust
        // against any CSS HMR / cascade weirdness in dev. On narrow
        // viewports we leave the style off entirely so the
        // `@media (max-width: 799px)` rule in page.module.css wins
        // and the popover recenters as a modal.
        <div
          className={styles.colorGlyphPopover}
          style={popoverAnchor ? {
            position: "fixed",
            top: `${popoverAnchor.top}px`,
            left: `${popoverAnchor.left}px`,
            transform: "none",
          } : undefined}
          role="dialog"
          aria-label="Bot color and glyph picker"
        >
          <div
            className={styles.colorSquare}
            onPointerDown={handleSquarePointerDown}
            onPointerMove={handleSquarePointerMove}
            onPointerUp={handleSquarePointerUp}
            onPointerCancel={handleSquarePointerCancel}
            role="group"
            aria-label="Bot color. Horizontal axis: hue; vertical axis: lightness."
          >
            <div
              className={styles.colorPickerIndicator}
              style={{ left: `${indicatorLeft}%`, top: `${indicatorTop}%` }}
              aria-hidden="true"
            />
          </div>
          <div className={styles.popoverDivider} aria-hidden="true" />
          {/* glyph picker lives in a three-layer stack:
              · shell (shellRef): clips, hosts the dynamic vignette +
                rim light (both read --vignette-x/y; rim is a masked
                radial on the ::before). Anchors the perspective frame
                and is the target of the viewport-position camera so
                where the popover SITS on the user's screen biases
                where the bright point of the vignette pools.
              · scroll: native overflow container. Scrollbar hidden;
                scrolling the grid doesn't shift the vignette, only
                the glyphs move.
              · inner (parallaxRef): scroll content, intentionally kept
                untransformed so glyph hit targets stay reliable.
              Cursor hover overrides the position baseline; mouseleave
              eases back to the viewport-placement baseline. */}
          <div
            ref={shellRef}
            className={styles.glyphGridShell}
            // Keep the picked color available to future picker affordances.
            // The glyph buttons themselves are deliberately theme-polarity
            // black/white so their click targets stay visually stable.
            style={
              {
                ["--picker-color" as string]: displayColor,
                ["--picker-ink" as string]: readable,
              } as React.CSSProperties
            }
            onMouseMove={handleGridMouseMove}
            onMouseLeave={handleGridMouseLeave}
          >
            <div className={styles.glyphGridScroll}>
              <div ref={parallaxRef} className={styles.glyphGridInner}>
                <BotGlyphPicker value={pickerGlyph} onChange={commitGlyphPick} />
              </div>
            </div>
          </div>
          <div className={styles.colorGlyphApplyBar}>
            <div
              className={styles.colorGlyphApplyPreview}
              style={{
                ["--bot-color" as string]: displayColor,
                ["--bot-tile-ink" as string]: readable,
              } as React.CSSProperties}
              aria-hidden="true"
            >
              <BotGlyph name={pickerGlyph} />
            </div>
            <button
              type="button"
              className={styles.colorGlyphApplyButton}
              onClick={applyMobileDraft}
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hub glyphs ────────────────────────────────────────────────────────
// Each Hub tile carries a large 5-color glyph echoing the wordmark's
// per-letter palette (P / R / I / S / M). Drawn as inline SVG with one
// coloured element per prism letter so the icons read as miniature
// wordmark refractions — no single-color fill, no gradient shortcut.

interface GlyphProps {
  size?: number;
}

function GlyphChat({ size = 88 }: GlyphProps): React.JSX.Element {
  // Speech bubble whose perimeter is split into four 90° arcs (P / R / I
  // / S) plus a small tail (M). Each arc is its own <path> so the colour
  // transitions happen at the cardinal points, giving the bubble a
  // refracted-rainbow look without needing gradients.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeWidth={3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Arc 1 (P): top -> right */}
      <path d="M24 6 A 16 16 0 0 1 40 22" stroke={PRISM_COLORS.p} />
      {/* Arc 2 (R): right -> bottom */}
      <path d="M40 22 A 16 16 0 0 1 24 38" stroke={PRISM_COLORS.r} />
      {/* Arc 3 (I): bottom -> left */}
      <path d="M24 38 A 16 16 0 0 1 8 22" stroke={PRISM_COLORS.i} />
      {/* Arc 4 (S): left -> top */}
      <path d="M8 22 A 16 16 0 0 1 24 6" stroke={PRISM_COLORS.s} />
      {/* Tail (M): small chevron hanging off the bottom-left of the bubble */}
      <path d="M18 36 L10 44 L22 38" stroke={PRISM_COLORS.m} />
    </svg>
  );
}

function GlyphSandbox({ size = 88 }: GlyphProps): React.JSX.Element {
  // Triangular prism with a monochrome input ray striking the left face
  // and five coloured rays (P / R / I / S / M) fanning out of the right
  // face. The triangle outline stays in currentColor so it reads on both
  // themes without us having to thread theme-aware colours in.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Prism body */}
      <path
        d="M24 8 L10 34 L38 34 Z"
        stroke="currentColor"
        strokeWidth={2.5}
      />
      {/* Input ray: neutral "white light" entering the left face */}
      <path
        d="M2 24 L15 24"
        stroke="currentColor"
        strokeWidth={2}
        opacity="0.55"
      />
      {/* Output rays: 5 prism-coloured beams fanning out of the right face */}
      <path d="M31 24 L46 8" stroke={PRISM_COLORS.p} strokeWidth={2.5} />
      <path d="M31 24 L46 16" stroke={PRISM_COLORS.r} strokeWidth={2.5} />
      <path d="M31 24 L46 24" stroke={PRISM_COLORS.i} strokeWidth={2.5} />
      <path d="M31 24 L46 32" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      <path d="M31 24 L46 40" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphArena({ size = 88 }: GlyphProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 38 H42" stroke="currentColor" strokeWidth={2.5} opacity="0.45" />
      <path d="M10 20 H20 L18 38 H12 Z" stroke={PRISM_COLORS.p} strokeWidth={2.5} />
      <path d="M28 20 H38 L36 38 H30 Z" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      <path d="M16 14 C18 10 22 8 24 8 C26 8 30 10 32 14" stroke={PRISM_COLORS.i} strokeWidth={2.5} />
      <path d="M20 17 L24 21 L28 17" stroke={PRISM_COLORS.r} strokeWidth={2.5} />
      <path d="M24 22 V31" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphPolling({ size = 88 }: GlyphProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 40 H40" stroke="currentColor" strokeWidth={2.5} opacity="0.45" />
      <path d="M12 40 V25" stroke={PRISM_COLORS.p} strokeWidth={5} />
      <path d="M20 40 V16" stroke={PRISM_COLORS.r} strokeWidth={5} />
      <path d="M28 40 V22" stroke={PRISM_COLORS.i} strokeWidth={5} />
      <path d="M36 40 V10" stroke={PRISM_COLORS.s} strokeWidth={5} />
      <circle cx="13" cy="14" r="3" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
      <circle cx="27" cy="10" r="3" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
      <circle cx="39" cy="21" r="3" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphCoffee({ size = 88 }: GlyphProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 21 H31 V31 C31 36 27 39 22 39 H20 C15 39 12 36 12 31 V23 C12 22 13 21 14 21 Z" stroke={PRISM_COLORS.p} strokeWidth={2.5} />
      <path d="M31 25 H35 C38 25 40 27 40 30 C40 33 38 35 35 35 H31" stroke={PRISM_COLORS.r} strokeWidth={2.5} />
      <path d="M16 14 C14 11 17 9 16 6" stroke={PRISM_COLORS.i} strokeWidth={2.5} />
      <path d="M24 14 C22 11 25 9 24 6" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      <path d="M8 42 H37" stroke="currentColor" strokeWidth={2.5} opacity="0.45" />
      <circle cx="35" cy="11" r="3" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
      <circle cx="41" cy="17" r="2.5" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphGames({ size = 88 }: GlyphProps): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 9 H39 V39 H9 Z" stroke="currentColor" strokeWidth={2.5} opacity="0.45" />
      <path d="M9 19 H39" stroke={PRISM_COLORS.p} strokeWidth={2.5} />
      <path d="M9 29 H39" stroke={PRISM_COLORS.r} strokeWidth={2.5} />
      <path d="M19 9 V39" stroke={PRISM_COLORS.i} strokeWidth={2.5} />
      <path d="M29 9 V39" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      <circle cx="14" cy="14" r="3" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
      <path d="M31 33 H37" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
      <path d="M34 30 V36" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphStory({ size = 88 }: GlyphProps): React.JSX.Element {
  // Story mode is about stepping into a scene with bots, so the glyph
  // combines an open-book frame with a horizon, doorway, and two bot actors.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Open-book / world frame */}
      <path
        d="M7 11 H20 C22 11 24 13 24 15 V41 C24 38 22 36 19 36 H7 Z"
        stroke="currentColor"
        strokeWidth={2.5}
        opacity="0.45"
      />
      <path
        d="M41 11 H28 C26 11 24 13 24 15 V41 C24 38 26 36 29 36 H41 Z"
        stroke="currentColor"
        strokeWidth={2.5}
        opacity="0.45"
      />
      {/* Immersive environment cues */}
      <path d="M12 29 C17 23 20 23 24 29 C28 23 31 23 36 29" stroke={PRISM_COLORS.p} strokeWidth={2.5} />
      <path d="M24 18 V31" stroke={PRISM_COLORS.r} strokeWidth={2.5} />
      <path d="M18 19 H30" stroke={PRISM_COLORS.i} strokeWidth={2.5} />
      {/* Bot actors */}
      <circle cx="16" cy="24" r="2.5" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      <circle cx="32" cy="24" r="2.5" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphLibrary({ size = 88 }: GlyphProps): React.JSX.Element {
  // Library is the training shelf: source material flows into a small
  // memory core before it becomes usable context for bots.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Shelves / archive frame */}
      <path d="M8 38 H40" stroke="currentColor" strokeWidth={2.5} opacity="0.45" />
      <path d="M10 12 H38 V38 H10 Z" stroke="currentColor" strokeWidth={2.5} opacity="0.45" />
      {/* Ingestible materials */}
      <path d="M15 18 V31" stroke={PRISM_COLORS.p} strokeWidth={3} />
      <path d="M21 16 V31" stroke={PRISM_COLORS.r} strokeWidth={3} />
      <path d="M27 20 V31" stroke={PRISM_COLORS.i} strokeWidth={3} />
      {/* Context flow into memory */}
      <path d="M14 34 C20 28 28 28 34 34" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      <circle cx="34" cy="23" r="4" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphSlate({ size = 88 }: GlyphProps): React.JSX.Element {
  // Document-with-folded-corner silhouette housing three text lines and
  // a blinking-cursor caret. Each PRISM letter gets exactly one element
  // so the tile reads as a refracted "page in progress":
  //   P → folded top-right corner crease
  //   R → first (longest) text line
  //   I → second text line
  //   S → third text line
  //   M → vertical cursor caret hanging at the end of the last line
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Page outline (neutral, like the prism body in GlyphSandbox) */}
      <path
        d="M11 6 H30 L37 13 V42 H11 Z"
        stroke="currentColor"
        strokeWidth={2.5}
        opacity="0.45"
      />
      {/* Folded corner crease (P) */}
      <path d="M30 6 V13 H37" stroke={PRISM_COLORS.p} strokeWidth={2.5} />
      {/* Text line 1 — longest (R) */}
      <path d="M16 20 H32" stroke={PRISM_COLORS.r} strokeWidth={2.5} />
      {/* Text line 2 — medium (I) */}
      <path d="M16 26 H29" stroke={PRISM_COLORS.i} strokeWidth={2.5} />
      {/* Text line 3 — shortest (S) */}
      <path d="M16 32 H24" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      {/* Cursor caret at end of last line (M) */}
      <path d="M27 30 V35" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

function GlyphPseudo({ size = 88 }: GlyphProps): React.JSX.Element {
  // Notebook + pseudo-flow cue. The page and line blocks imply "code-ish
  // structure" without reading as a full IDE or terminal.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* Notebook page */}
      <path
        d="M10 7 H35 L40 12 V41 H10 Z"
        stroke="currentColor"
        strokeWidth={2.5}
        opacity="0.45"
      />
      {/* Fold line (P) */}
      <path d="M35 7 V12 H40" stroke={PRISM_COLORS.p} strokeWidth={2.5} />
      {/* Pseudocode lines */}
      <path d="M15 19 H32" stroke={PRISM_COLORS.r} strokeWidth={2.5} />
      <path d="M15 25 H29" stroke={PRISM_COLORS.i} strokeWidth={2.5} />
      <path d="M19 31 H29" stroke={PRISM_COLORS.s} strokeWidth={2.5} />
      {/* Control-flow branch marker */}
      <path d="M15 31 V36 H22" stroke={PRISM_COLORS.m} strokeWidth={2.5} />
    </svg>
  );
}

interface MessageBodyProps {
  content: string;
}

/** Imperative focus for plain textarea vs TipTap WYSIWYG compose field. */
interface ComposerInputHandle {
  focus: (options?: FocusOptions) => void;
}

interface ComposerInputProps {
  enabled: boolean;
  value: string;
  placeholder: string;
  submitDisabled: boolean;
  submitLabel: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onValueChange: (value: string) => void;
  onFocus: () => void;
  hideSubmitButton?: boolean;
}

interface ProseMirrorSelectionState {
  selection: {
    $from: {
      depth: number;
      node: (depth: number) => { type: { name: string } };
    };
  };
}

function selectionIsInsideMarkdownList(state: ProseMirrorSelectionState): boolean {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const nodeName = $from.node(depth).type.name;
    if (
      nodeName === "listItem" ||
      nodeName === "bulletList" ||
      nodeName === "orderedList"
    ) {
      return true;
    }
  }
  return false;
}

function domSelectionIsInsideMarkdownList(root: HTMLElement): boolean {
  const selection = root.ownerDocument.getSelection();
  const anchor = selection?.anchorNode;
  if (!anchor) return false;

  const anchorElement =
    anchor instanceof Element ? anchor : anchor.parentElement;

  return Boolean(
    anchorElement &&
    root.contains(anchorElement) &&
    anchorElement.closest("li, ol, ul")
  );
}

function editorSelectionIsInsideMarkdownList(editor: Editor): boolean {
  return (
    editor.isActive("listItem") ||
    editor.isActive("bulletList") ||
    editor.isActive("orderedList")
  );
}

function useMobileKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (!active || typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;
    let frame = 0;
    const updateInset = () => {
      const nextInset = Math.max(
        0,
        Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      );
      setInset(nextInset);
    };
    const scheduleUpdate = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateInset);
    };

    scheduleUpdate();
    viewport.addEventListener("resize", scheduleUpdate);
    viewport.addEventListener("scroll", scheduleUpdate);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", scheduleUpdate);
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [active]);

  return active ? inset : 0;
}

function MessageBody({ content }: MessageBodyProps): React.JSX.Element {
  return (
    <div className={styles.markdownBody}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

interface DesktopMarkdownComposerHandle {
  focus: (options?: FocusOptions) => void;
}

interface DesktopMarkdownComposerProps {
  value: string;
  placeholder: string;
  onValueChange: (value: string) => void;
  onFocus: () => void;
  submitDisabled: boolean;
  submitLabel: string;
  /** Omit Send pill on narrow viewports when empty — IME Send / Enter submits. */
  hideSubmitButton?: boolean;
}

const DesktopMarkdownComposer = forwardRef<DesktopMarkdownComposerHandle, DesktopMarkdownComposerProps>(
  function DesktopMarkdownComposer(
    {
      value,
      placeholder,
      onValueChange,
      onFocus,
      submitDisabled,
      submitLabel,
      hideSubmitButton,
    },
    ref
  ): React.JSX.Element {
    const lastEmittedRef = useRef(value);
    const onValueChangeRef = useRef(onValueChange);
    const onFocusRef = useRef(onFocus);
    const editorRef = useRef<Editor | null>(null);

    useLayoutEffect(() => {
      onValueChangeRef.current = onValueChange;
      onFocusRef.current = onFocus;
    }, [onFocus, onValueChange]);

    const editor = useEditor(
      {
        immediatelyRender: false,
        extensions: [
          StarterKit.configure({
            heading: { levels: [1, 2, 3] },
          }),
          Link.configure({
            openOnClick: false,
            autolink: true,
            defaultProtocol: "https",
          }),
          Placeholder.configure({ placeholder }),
          Markdown.configure({
            markedOptions: {
              gfm: true,
              breaks: false,
            },
          }),
        ],
        content: value,
        contentType: "markdown",
        editorProps: {
          attributes: {
            class: styles.markdownTiptapContent,
            spellcheck: "true",
            autocorrect: "on",
            autocapitalize: "sentences",
            enterkeyhint: "send",
            lang: "en",
            "aria-multiline": "true",
          },
          handleDOMEvents: {
            focus: () => {
              onFocusRef.current();
              return false;
            },
          },
          handleKeyDown: (view, event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              const activeEditor = editorRef.current;
              const insideMarkdownList = Boolean(
                (activeEditor && editorSelectionIsInsideMarkdownList(activeEditor)) ||
                selectionIsInsideMarkdownList(view.state) ||
                domSelectionIsInsideMarkdownList(view.dom)
              );
              if (activeEditor && insideMarkdownList) {
                event.preventDefault();
                event.stopPropagation();
                if (
                  activeEditor.commands.splitListItem("listItem") ||
                  activeEditor.commands.liftListItem("listItem")
                ) {
                  return true;
                }
                const form = (event.target as HTMLElement).closest("form");
                form?.requestSubmit();
                return true;
              }
              if (
                selectionIsInsideMarkdownList(view.state) ||
                domSelectionIsInsideMarkdownList(view.dom)
              ) {
                event.stopPropagation();
                return false;
              }
              event.preventDefault();
              const form = (event.target as HTMLElement).closest("form");
              form?.requestSubmit();
              return true;
            }
            return false;
          },
        },
        onUpdate: ({ editor: ed }) => {
          const md = ed.getMarkdown();
          if (md === lastEmittedRef.current) return;
          lastEmittedRef.current = md;
          onValueChangeRef.current(md);
        },
      },
      [placeholder]
    );

    useEffect(() => {
      editorRef.current = editor;
      return () => {
        if (editorRef.current === editor) editorRef.current = null;
      };
    }, [editor]);

    useEffect(() => {
      if (!editor || editor.isDestroyed) return;
      const current = editor.getMarkdown();
      if (current === value) return;
      lastEmittedRef.current = value;
      editor.commands.setContent(value || "", { contentType: "markdown" });
    }, [value, editor]);

    useImperativeHandle(
      ref,
      () => ({
        focus: (options?: FocusOptions) => {
          const dom = editor?.view.dom;
          if (dom && typeof dom.focus === "function") {
            dom.focus(options);
          } else {
            editor?.commands.focus();
          }
        },
      }),
      [editor]
    );

    const handleRichEditorKeyDownCapture = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== "Enter") return;

        const activeEditor = editor;
        const root = event.currentTarget;
        const insideMarkdownList = Boolean(
          (activeEditor && editorSelectionIsInsideMarkdownList(activeEditor)) ||
          domSelectionIsInsideMarkdownList(root)
        );

        if (event.shiftKey) {
          if (!insideMarkdownList) return;
          event.preventDefault();
          event.stopPropagation();
          const form = root.closest("form");
          form?.requestSubmit();
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (
          insideMarkdownList &&
          activeEditor &&
          (
            activeEditor.commands.splitListItem("listItem") ||
            activeEditor.commands.liftListItem("listItem")
          )
        ) {
          return;
        }

        const form = root.closest("form");
        form?.requestSubmit();
      },
      [editor]
    );

    return (
      <div className={styles.markdownComposerSurface}>
        <div className={styles.markdownComposerMain}>
          <div
            className={`${styles.markdownComposerInputRow} ${hideSubmitButton ? styles.markdownComposerInputRowSingle : ""}`}
          >
            <div
              className={styles.markdownRichEditorHost}
              data-markdown-cm-host="true"
              onKeyDownCapture={handleRichEditorKeyDownCapture}
            >
              <EditorContent editor={editor} />
            </div>
            {!hideSubmitButton && (
              <button type="submit" disabled={submitDisabled}>
                {submitLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

DesktopMarkdownComposer.displayName = "DesktopMarkdownComposer";

const ComposerInput = forwardRef<ComposerInputHandle, ComposerInputProps>(function ComposerInput(
  {
    enabled,
    value,
    placeholder,
    submitDisabled,
    submitLabel,
    onChange,
    onValueChange,
    onFocus,
    hideSubmitButton,
  },
  ref
): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const wysiwygRef = useRef<DesktopMarkdownComposerHandle | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: (options?: FocusOptions) => {
        if (enabled) {
          wysiwygRef.current?.focus(options);
        } else {
          textareaRef.current?.focus(options);
        }
      },
    }),
    [enabled]
  );

  return (
      <div
      className={styles.composeEditorShell}
      data-markdown-enabled={enabled ? "true" : undefined}
    >
      {enabled ? (
        <DesktopMarkdownComposer
          ref={wysiwygRef}
          value={value}
          placeholder={placeholder}
          onValueChange={onValueChange}
          onFocus={onFocus}
          submitDisabled={submitDisabled}
          submitLabel={submitLabel}
          hideSubmitButton={hideSubmitButton}
        />
      ) : (
        <div
          className={`${styles.composeInner} ${hideSubmitButton ? styles.composeInnerSingle : ""}`}
        >
          <textarea
            ref={textareaRef}
            value={value}
            onChange={onChange}
            onFocus={onFocus}
            placeholder={placeholder}
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
            enterKeyHint="send"
            lang="en"
          />
          {!hideSubmitButton && (
            <button type="submit" disabled={submitDisabled}>
              {submitLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
});

ComposerInput.displayName = "ComposerInput";

type BotProfileTextSection = "identity" | "worldview" | "appearance";

interface BotProfileBuilderProps {
  open: boolean;
  activePage: BotProfileBuilderPageId;
  profile: BotProfileFields;
  botName: string;
  onActivePageChange: (page: BotProfileBuilderPageId) => void;
  onProfileChange: (updater: (profile: BotProfileFields) => BotProfileFields) => void;
  onClose: () => void;
}

function optionalScaleLabel(
  value: BotProfileScaleValue | null,
  labels: readonly [string, string, string, string, string]
): string {
  if (value === null) return "Unspecified";
  return labels[value + 2] ?? "Unspecified";
}

function BotProfileScaleControl({
  label,
  value,
  labels,
  leftLabel,
  rightLabel,
  onChange,
}: {
  label: string;
  value: BotProfileScaleValue | null;
  labels: readonly [string, string, string, string, string];
  leftLabel: string;
  rightLabel: string;
  onChange: (value: BotProfileScaleValue | null) => void;
}): React.JSX.Element {
  return (
    <div className={styles.botProfileScaleControl}>
      <div className={styles.botProfileScaleHeader}>
        <span>{label}</span>
        <strong>{optionalScaleLabel(value, labels)}</strong>
      </div>
      <input
        type="range"
        min={-2}
        max={2}
        step={1}
        value={value ?? 0}
        data-active={value !== null ? "true" : undefined}
        onChange={(event) => onChange(Number(event.currentTarget.value) as BotProfileScaleValue)}
        aria-label={label}
      />
      <div className={styles.botProfileScaleEnds} aria-hidden="true">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
      <button
        type="button"
        className={styles.botProfileClearButton}
        onClick={() => onChange(null)}
        disabled={value === null}
      >
        Leave unspecified
      </button>
    </div>
  );
}

function BotProfileBuilder({
  open,
  activePage,
  profile,
  botName,
  onActivePageChange,
  onProfileChange,
  onClose,
}: BotProfileBuilderProps): React.JSX.Element | null {
  if (!open) return null;

  const activeIndex = BOT_PROFILE_BUILDER_PAGE_ORDER.indexOf(activePage);
  const previousPage = BOT_PROFILE_BUILDER_PAGE_ORDER[Math.max(0, activeIndex - 1)];
  const nextPage =
    BOT_PROFILE_BUILDER_PAGE_ORDER[
      Math.min(BOT_PROFILE_BUILDER_PAGE_ORDER.length - 1, activeIndex + 1)
    ];
  const pageCopy = BOT_PROFILE_PAGE_COPY[activePage];
  const seededPurpose = defaultBotPurpose(botName);
  const updatePurpose = (field: keyof BotProfileFields["purpose"], value: string) => {
    onProfileChange((previous) => ({
      ...previous,
      purpose: { ...previous.purpose, [field]: value },
    }));
  };
  const updateCore = (
    field: keyof BotProfileFields["core"],
    value: string | BotVoicePreset | BotProfileScaleValue | null
  ) => {
    onProfileChange((previous) => ({
      ...previous,
      core: { ...previous.core, [field]: value },
    }));
  };
  const updateTextSection = (
    section: BotProfileTextSection,
    field: string,
    value: string
  ) => {
    onProfileChange((previous) => ({
      ...previous,
      [section]: {
        ...previous[section],
        [field]: value,
      },
    }));
  };
  const updateWorldviewScale = (
    field: keyof Pick<BotProfileFields["worldview"], "politicalView" | "optimism" | "tradition">,
    value: BotProfileScaleValue | null
  ) => {
    onProfileChange((previous) => ({
      ...previous,
      worldview: { ...previous.worldview, [field]: value },
    }));
  };

  const renderPage = () => {
    switch (activePage) {
      case "purpose":
        return (
          <>
            <div className={styles.botPurposeEditorBlock}>
              <div className={styles.botPurposeFieldHeading} id="bot-profile-purpose-q">
                What is my purpose?
              </div>
              <div className={styles.botPurposePrefixWrap} aria-hidden="true">
                <div className={styles.botPurposePrefix}>
                  You are {botName.trim() || "[Name]"}...
                </div>
              </div>
              <label className={styles.botProfileField} htmlFor="bot-profile-purpose-input">
                <textarea
                  id="bot-profile-purpose-input"
                  aria-labelledby="bot-profile-purpose-q"
                  value={stripPurposeStatementPrefixes(
                    profile.purpose.statement,
                    botName
                  )}
                  onChange={(event) =>
                    updatePurpose("statement", event.currentTarget.value)
                  }
                  placeholder="a gentle strategist who helps turn messy thoughts into one clear next step"
                />
                <small>
                  Leave blank to use <strong>{seededPurpose || "the bot name"}</strong>.
                </small>
              </label>
            </div>
            {profile.purpose.legacyNotes.trim() && (
              <label className={styles.botProfileField}>
                <span>Advanced notes</span>
                <textarea
                  value={profile.purpose.legacyNotes}
                  onChange={(event) => updatePurpose("legacyNotes", event.currentTarget.value)}
                  placeholder="Old prompt text or one-off instructions, optional"
                />
              </label>
            )}
          </>
        );
      case "personality":
        return (
          <>
            <label className={styles.botProfileField}>
              <span>Communication style</span>
              <select
                value={profile.core.communicationStyle}
                onChange={(event) => updateCore("communicationStyle", event.currentTarget.value as BotVoicePreset)}
              >
                {(Object.keys(BOT_VOICE_PRESET_LABELS) as BotVoicePreset[]).map((preset) => (
                  <option key={preset} value={preset}>
                    {BOT_VOICE_PRESET_LABELS[preset]}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.botProfileSubsection}>
              <span>OCEAN balance</span>
              <small>Small shifts change the bot&apos;s center of gravity without locking it into a type.</small>
            </div>
            <BotProfileScaleControl
              label="Openness"
              value={profile.core.openness}
              labels={["Grounded", "Practical", "Balanced", "Imaginative", "Highly exploratory"]}
              leftLabel="Grounded"
              rightLabel="Imaginative"
              onChange={(value) => updateCore("openness", value)}
            />
            <BotProfileScaleControl
              label="Conscientiousness"
              value={profile.core.conscientiousness}
              labels={["Spontaneous", "Loose", "Balanced", "Methodical", "Highly organized"]}
              leftLabel="Spontaneous"
              rightLabel="Methodical"
              onChange={(value) => updateCore("conscientiousness", value)}
            />
            <BotProfileScaleControl
              label="Extraversion"
              value={profile.core.extraversion}
              labels={["Reserved", "Quiet", "Balanced", "Expressive", "Highly energetic"]}
              leftLabel="Reserved"
              rightLabel="Expressive"
              onChange={(value) => updateCore("extraversion", value)}
            />
            <BotProfileScaleControl
              label="Agreeableness"
              value={profile.core.agreeableness}
              labels={["Challenging", "Questioning", "Balanced", "Cooperative", "Highly accommodating"]}
              leftLabel="Challenging"
              rightLabel="Cooperative"
              onChange={(value) => updateCore("agreeableness", value)}
            />
            <BotProfileScaleControl
              label="Emotional baseline"
              value={profile.core.emotionalStability}
              labels={["Reactive", "Sensitive", "Balanced", "Steady", "Very composed"]}
              leftLabel="Reactive"
              rightLabel="Steady"
              onChange={(value) => updateCore("emotionalStability", value)}
            />
            <label className={styles.botProfileField}>
              <span>Trait notes / flavor text</span>
              <input
                value={profile.core.traits}
                onChange={(event) => updateCore("traits", event.currentTarget.value)}
                placeholder="patient, strange, decisive, gentle..."
              />
            </label>
            <label className={styles.botProfileField}>
              <span>What they lean into</span>
              <input
                value={profile.core.interests}
                onChange={(event) => updateCore("interests", event.currentTarget.value)}
                placeholder="topics, goals, favorite angles..."
              />
            </label>
            <label className={styles.botProfileField}>
              <span>What they avoid</span>
              <input
                value={profile.core.boundaries}
                onChange={(event) => updateCore("boundaries", event.currentTarget.value)}
                placeholder="limits, refusals, sensitive areas..."
              />
            </label>
            <label className={styles.botProfileField}>
              <span>Signature flourish</span>
              <input
                value={profile.core.quirks}
                onChange={(event) => updateCore("quirks", event.currentTarget.value)}
                placeholder="catchphrases, habits, running jokes..."
              />
            </label>
          </>
        );
      case "character":
        return (
          <>
            <div className={styles.botProfileSubsection}>
              <span>Identity</span>
              <small>Who or what this bot is.</small>
            </div>
            <label className={styles.botProfileField}>
              <span>Identity snapshot</span>
              <textarea
                value={profile.identity.role}
                onChange={(event) => updateTextSection("identity", "role", event.currentTarget.value)}
                placeholder="ageless raven oracle, they/them, former royal cartographer..."
              />
            </label>
            <label className={styles.botProfileField}>
              <span>Background</span>
              <textarea
                value={profile.identity.background}
                onChange={(event) => updateTextSection("identity", "background", event.currentTarget.value)}
                placeholder="where they come from, what shaped them..."
              />
            </label>
            <div className={styles.botProfileSubsection}>
              <span>Appearance</span>
              <small>Useful for avatars, images, and a stronger mental picture.</small>
            </div>
            <label className={styles.botProfileField}>
              <span>Visual description</span>
              <textarea
                value={profile.appearance.description}
                onChange={(event) => updateTextSection("appearance", "description", event.currentTarget.value)}
                placeholder="what they look like, how they dress, the feeling they give off..."
              />
            </label>
            <div className={styles.botProfileSubsection}>
              <span>Worldview</span>
              <small>Optional lenses for future debates, polls, and experiments.</small>
            </div>
            <BotProfileScaleControl
              label="Political perspective"
              value={profile.worldview.politicalView}
              labels={["Left-leaning", "Somewhat left", "Mixed / centrist", "Somewhat right", "Right-leaning"]}
              leftLabel="Left"
              rightLabel="Right"
              onChange={(value) => updateWorldviewScale("politicalView", value)}
            />
            <label className={styles.botProfileField}>
              <span>Worldview & values</span>
              <textarea
                value={profile.worldview.values}
                onChange={(event) => updateTextSection("worldview", "values", event.currentTarget.value)}
                placeholder="religion, values, optimism, tradition, taboos, causes..."
              />
            </label>
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className={styles.botProfileBuilderBackdrop} role="presentation">
      <section
        className={styles.botProfileBuilder}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bot-profile-builder-title"
      >
        <header className={styles.botProfileBuilderHeader}>
          <div>
            <span>Bot Profile Builder</span>
            <h4 id="bot-profile-builder-title">{pageCopy.label}</h4>
            <p>{pageCopy.description}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close profile builder">
            ×
          </button>
        </header>
        <nav className={styles.botProfileBuilderNav} aria-label="Bot profile categories">
          {BOT_PROFILE_BUILDER_PAGE_ORDER.map((category) => (
            <button
              key={category}
              type="button"
              data-active={activePage === category ? "true" : undefined}
              onClick={() => onActivePageChange(category)}
            >
              <span>{BOT_PROFILE_BUILDER_PAGE_LABELS[category]}</span>
              <small>
                {botProfileCategoryCount(profile, category) > 0 ? "Filled" : "Optional"}
              </small>
            </button>
          ))}
        </nav>
        <div className={styles.botProfileBuilderBody}>{renderPage()}</div>
        <footer className={styles.botProfileBuilderFooter}>
          <button
            type="button"
            onClick={() => onActivePageChange(previousPage)}
            disabled={activeIndex <= 0}
          >
            Back
          </button>
          <button
            type="button"
            onClick={
              activeIndex >= BOT_PROFILE_BUILDER_PAGE_ORDER.length - 1
                ? onClose
                : () => onActivePageChange(nextPage)
            }
          >
            {activeIndex >= BOT_PROFILE_BUILDER_PAGE_ORDER.length - 1 ? "Done" : "Next"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function HomeContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const router = useRouter();
  const authMode = searchParams.get("mode") === "login" ? "login" : "register";
  // Post-auth surface is derived from the URL so refreshes preserve the
  // current mode and browser back/forward walk naturally between Hub,
  // Chat, and Sandbox. Anything unrecognised (missing param, stale
  // values) resolves to the Hub.
  const viewParam = searchParams.get("view");
  const view: View =
    viewParam === "chat" ? "chat"
      : viewParam === "sandbox" ? "sandbox"
        : "hub";
  const navigateToView = useCallback((next: View) => {
    const href = next === "hub" ? "/" : `/?view=${next}`;
    router.replace(href);
  }, [router]);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [clientAccessState, setClientAccessState] = useState<ClientAccessState>(
    CLIENT_ACCESS_REQUIRED ? "checking" : "allowed"
  );
  // Two error states on purpose:
  //   - `error` is the global / compose-adjacent surface. It catches auth,
  //     sidebar actions (switch provider, theme, delete chat), and chat send
  //     failures. Rendered above the composer and on the auth form.
  //   - `panelError` is scoped to the right-hand drawers (Settings / Bots /
  //     Images). It exists so a chat-send 401 doesn't leak into the Settings
  //     panel on top of whatever the user was doing there.
  // Actions that originate inside a panel (saveSettings, clearSavedKey,
  // save/deleteBot, generateImg, deleteAccount) route to `panelError`;
  // everything else stays on `error`.
  const [error, setError] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelNotice, setPanelNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingOriginalText, setEditingOriginalText] = useState("");
  const [composerPrimed, setComposerPrimed] = useState(false);
  const [composerFocused, setComposerFocused] = useState(false);
  /** Quick-replies after “Talk to me!”; scoped to `conversationId` so thread switches cannot show stale chips. */
  const [conversationStarterPrompts, setConversationStarterPrompts] = useState<{
    conversationId: string;
    prompts: string[];
  } | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog | null>(null);
  const [secondaryOllamaStatus, setSecondaryOllamaStatus] =
    useState<SecondaryOllamaStatus | null>(null);
  const [secondaryOllamaStatusChecking, setSecondaryOllamaStatusChecking] = useState(false);
  const [openAiKey, setOpenAiKey] = useState("");
  const [pairingCode, setPairingCode] = useState<PairingCode | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingCopyStatus, setPairingCopyStatus] = useState<string | null>(null);
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [botMemories, setBotMemories] = useState<UserMemory[]>([]);
  const [memoryToasts, setMemoryToasts] = useState<MemoryToast[]>([]);
  const [pausedMemoryToastIds, setPausedMemoryToastIds] = useState<Set<string>>(
    () => new Set()
  );
  const [directMemoryCountsByBotId, setDirectMemoryCountsByBotId] = useState<Record<string, number>>({});
  const [defaultDirectMemoryCount, setDefaultDirectMemoryCount] = useState(0);
  const [memoryPanelScope, setMemoryPanelScope] = useState<MemoryPanelScope>("bot");
  const [memoryPanelBotId, setMemoryPanelBotId] = useState<string | null>(null);
  const [memoryPanelSelectedFamily, setMemoryPanelSelectedFamily] = useState<PrismGroupId | null>(null);
  const [focusedMemoryId, setFocusedMemoryId] = useState<string | null>(null);
  // Phase + direction drive the cinematic zoom + fade between memory
  // directory levels. We keep them as separate state so React can apply
  // the data attributes in lockstep when a navigation begins.
  const [memoryTransitionPhase, setMemoryTransitionPhase] =
    useState<"idle" | "exiting" | "entering">("idle");
  const [memoryTransitionDirection, setMemoryTransitionDirection] =
    useState<"forward" | "backward">("forward");
  const [memoryPhysicsSeed, setMemoryPhysicsSeed] = useState(0);
  const memoryPanelRef = useRef<HTMLDivElement | null>(null);
  const memoryPhysicsFrameRef = useRef<number | null>(null);
  const [memoryPhysicsActive, setMemoryPhysicsActive] = useState(false);
  const [pendingReply, setPendingReply] = useState(false);
  const [pendingReplyConversationId, setPendingReplyConversationId] =
    useState<string | null>(null);
  const [pendingReplyIsNewConversation, setPendingReplyIsNewConversation] =
    useState(false);
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(
    () => new Set()
  );
  const [unreadConversationOrder, setUnreadConversationOrder] = useState<string[]>([]);
  const [openConversationGroupKey, setOpenConversationGroupKey] = useState<string | null>(null);
  const [conversationListScrollTop, setConversationListScrollTop] = useState(0);
  const selectedIdRef = useRef<string | null>(null);
  const detailIdRef = useRef<string | null>(null);
  const memoryTransitionRunRef = useRef(0);
  const [modelRevealMessageId, setModelRevealMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedMessageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [messageContextMenu, setMessageContextMenu] = useState<{
    message: Message;
    x: number;
    y: number;
    anchor: MessageMenuAnchor;
  } | null>(null);
  const [botContextMenu, setBotContextMenu] = useState<{
    botId: string;
    x: number;
    y: number;
  } | null>(null);
  const [contextFocusedMessageId, setContextFocusedMessageId] = useState<string | null>(null);
  const [mobileFocusedMessageId, setMobileFocusedMessageId] = useState<string | null>(null);
  /** Message-actions popover (`role="menu"`) root for tap-outside + touch dismiss. */
  const messageActionsMenuRef = useRef<HTMLDivElement | null>(null);
  const botContextMenuRef = useRef<HTMLDivElement | null>(null);
  const botContextLongPressRef = useRef<{
    pointerId: number;
    botId: string;
    timer: ReturnType<typeof setTimeout>;
    startX: number;
    startY: number;
  } | null>(null);
  const botContextSuppressClickRef = useRef(false);
  const [panel, setPanel] = useState<PanelView>(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  selectedIdRef.current = selectedId;
  detailIdRef.current = detail?.id ?? null;
  // Drill-in target for the high-count Prism color dashboard. Null at
  // <40 bots OR while the user is on the dashboard root; set to a
  // letter id while they have a specific group expanded.
  const [botPanelGroup, setBotPanelGroup] = useState<BotLibraryFilterId>(
    BOT_LIBRARY_FILTER_ALL
  );
  const [botLibraryExpanded, setBotLibraryExpanded] = useState(false);
  const [botLibraryClosing, setBotLibraryClosing] = useState(false);
  const [botPanelLibraryEnabled, setBotPanelLibraryEnabled] = useState(true);
  const botLibraryCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  /** Memories / Edit bot / Export / Delete overflow — mirrors ☰ toggle styling on mobile. */
  const [chatOverflowMenuOpen, setChatOverflowMenuOpen] = useState(false);
  const chatOverflowMenuRef = useRef<HTMLDivElement>(null);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [devToolsBusy, setDevToolsBusy] = useState(false);
  const [devToolsMessage, setDevToolsMessage] = useState<string | null>(null);
  const [devToolsBotQuantity, setDevToolsBotQuantity] =
    useState<DevToolsBotQuantity>(DEV_TOOLS_BOT_QUANTITY_DEFAULT);
  const [devToolsMemorySeedSource, setDevToolsMemorySeedSource] =
    useState<DevToolsMemorySeedSource>("direct");
  const [devToolsMemoryCertainty, setDevToolsMemoryCertainty] = useState(
    DEV_TOOLS_MEMORY_CERTAINTY_DEFAULT
  );
  const [devToolsPanelPosition, setDevToolsPanelPosition] =
    useState<DevToolsPanelPosition>({
      x: DEV_TOOLS_PANEL_DEFAULT_X,
      y: DEV_TOOLS_PANEL_DEFAULT_Y,
    });
  const devToolsPanelRef = useRef<HTMLDivElement | null>(null);
  const devToolsPanelDragRef = useRef<DevToolsPanelDragState | null>(null);
  const resolvedDevToolsBotQuantity =
    devToolsBotQuantity === "" ? 0 : devToolsBotQuantity;
  const closeDevTools = useCallback(() => {
    setDevToolsOpen(false);
    setDevToolsMessage(null);
  }, []);

  const closeBotContextMenu = useCallback(() => {
    setBotContextMenu(null);
  }, []);

  const cancelBotContextLongPress = useCallback((pointerId?: number) => {
    const pending = botContextLongPressRef.current;
    if (!pending) return;
    if (pointerId !== undefined && pending.pointerId !== pointerId) return;
    clearTimeout(pending.timer);
    botContextLongPressRef.current = null;
  }, []);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [chatModelChoiceByProvider, setChatModelChoiceByProvider] =
    useState<Record<Provider, string>>({
      local: AUTO_MODEL_CHOICE,
      openai: AUTO_MODEL_CHOICE,
    });
  // Active hue lens center, in degrees on the 360° color wheel. `null`
  // means "show all bots" for the pre-chat starter-grid filter. After a
  // chat has messages, the compact bot popout seeds this to a random
  // populated hue on open and uses it only as a non-destructive
  // scroll/focus target; there is no "All" affordance in that popout.
  const [hueFilterCenter, setHueFilterCenter] = useState<number | null>(null);
  // Floating "keyboard balloon" preview for touch users at high-density
  // picker stages. Tracks the bot under the user's finger plus the touch
  // coordinates so the lifted tile can sit cleanly above the finger and
  // follow drags. Mobile-keyboard pattern: tap-and-scrub previews each
  // bot, lifting the visual feedback off the touch point so the finger
  // doesn't occlude the target. Stays null on desktop and at low density.
  const [touchPreview, setTouchPreview] = useState<{
    botId: string | null;
    x: number;
    y: number;
  } | null>(null);
  // Tracks which pointer the touch preview captured. Subsequent move/up
  // events that don't match this id are ignored so a second finger can't
  // hijack the in-flight gesture.
  const touchPreviewPointerIdRef = useRef<number | null>(null);
  const [botPickerReturnAnimating, setBotPickerReturnAnimating] = useState(false);
  const [emptyStateSearchOpen, setEmptyStateSearchOpen] = useState(false);
  const [emptyStateBotNameFilter, setEmptyStateBotNameFilter] = useState("");
  // Sticky "the next new chat is private" intent. Flipped on by the Chat-
  // mode "Private chat" sidebar button and read by buildChatRequestBody so
  // the next send uses the incognito server path. Private chats are
  // client-held: the server returns an in-memory detail but never creates a
  // conversation row or message history. Sandbox can arm the same path from
  // its sidebar, but private sends route through the Chat-mode server
  // contract so they still mean no memory/no history while preserving
  // the selected bot as prompt identity.
  const [pendingIncognito, setPendingIncognito] = useState(false);
  // Pending mid-thread bot switch for the OPEN Chat-mode conversation.
  // Three-valued so the dropdown can distinguish "match the server's
  // current botId" (undefined) from "explicitly pick Default" (null)
  // from "switch to this specific bot" (string). The value feeds
  // `buildChatRequestBody` as the Chat-mode botId on the next send,
  // and the server only persists the switch AFTER the new bot
  // successfully produces a reply. Cleared whenever the user changes
  // conversations (see the effect below) or after a successful send
  // (in sendMessage, once server truth has caught up to the pick).
  const [chatBotOverride, setChatBotOverride] =
    useState<string | null | undefined>(undefined);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imagePrompt, setImagePrompt] = useState("");
  // Single bot-form state used for BOTH create and edit modes. The top
  // form in the Bots panel is the only place a color + glyph picker ever
  // renders; when the user clicks a bot's pencil, we hydrate these same
  // fields with that bot's values and set `editingBotId` to flip the form
  // into edit mode. No inline per-card edit form, no duplicated picker.
  const [newBotName, setNewBotName] = useState("");
  const [botProfile, setBotProfile] = useState<BotProfileFields>(() => blankBotProfile());
  const [newBotLocalModel, setNewBotLocalModel] = useState(AUTO_MODEL_CHOICE);
  const [newBotOnlineModel, setNewBotOnlineModel] = useState(AUTO_MODEL_CHOICE);
  const [newBotOnlineEnabled, setNewBotOnlineEnabled] = useState(true);
  const [newBotDeleteProtected, setNewBotDeleteProtected] = useState(false);
  const [newBotTemperature, setNewBotTemperature] = useState(BOT_TEMPERATURE_DEFAULT);
  const [newBotMaxTokens, setNewBotMaxTokens] = useState(BOT_REPLY_LENGTH_DEFAULT_TOKENS);
  // Lazy initializers so the very first render already picks a random seed
  // without re-randomizing on every re-render.
  const [newBotColor, setNewBotColor] = useState<string>(() => randomHex());
  const [newBotGlyph, setNewBotGlyph] = useState<BotGlyphName>(() => randomBotGlyph());
  const [colorWheelOpen, setColorWheelOpen] = useState(false);
  const [botProfileBuilderOpen, setBotProfileBuilderOpen] = useState(false);
  const [botPreferredModelsModalOpen, setBotPreferredModelsModalOpen] = useState(false);
  const [settingsAboutModalOpen, setSettingsAboutModalOpen] = useState(false);
  const [changePasswordModalOpen, setChangePasswordModalOpen] = useState(false);
  const [changePasswordNew, setChangePasswordNew] = useState("");
  const [changePasswordConfirm, setChangePasswordConfirm] = useState("");
  const [botProfileActivePage, setBotProfileActivePage] =
    useState<BotProfileBuilderPageId>("purpose");
  // Side-tooltip state for the bot editor's parameter help text. The
  // form panel sits flush against the right edge of the screen with
  // overflow: hidden, so any in-DOM tooltip would be clipped. We
  // instead capture the hovered/focused field's bounding rect and
  // render a single fixed-positioned tooltip into the blurred area
  // to the LEFT of the panel.
  const [activeFieldHelp, setActiveFieldHelp] = useState<
    { text: string; top: number; left: number } | null
  >(null);
  const fieldHelpHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showFieldHelp = useCallback((text: string, target: HTMLElement) => {
    if (fieldHelpHideTimerRef.current) {
      clearTimeout(fieldHelpHideTimerRef.current);
      fieldHelpHideTimerRef.current = null;
    }
    const rect = target.getBoundingClientRect();
    setActiveFieldHelp({ text, top: rect.top, left: rect.left });
  }, []);
  const hideFieldHelp = useCallback(() => {
    if (fieldHelpHideTimerRef.current) {
      clearTimeout(fieldHelpHideTimerRef.current);
    }
    fieldHelpHideTimerRef.current = setTimeout(() => {
      setActiveFieldHelp(null);
      fieldHelpHideTimerRef.current = null;
    }, 80);
  }, []);
  // Single-slot "which existing bot is currently loaded into the top form"
  // (null = create mode). The card itself renders a subtle highlight while
  // it's the editing target; the form above hydrates the name / prompt /
  // color / glyph fields from that bot. No inline per-card edit form, no
  // layered bubble affordances — tapping a bot card is the one and only
  // entry point into edit mode, and the × on the card handles delete
  // (mirroring the chat-row two-stage + press-and-hold pattern).
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  /** Set when the user manually changes color/glyph during create (swatch / grid). */
  const createBotAppearanceTouchedRef = useRef(false);
  /** Mirrors create-form state for the bots-panel seed effect (avoids effect deps on every keystroke). */
  const latestCreateBotDraftRef = useRef({
    name: "",
    profile: blankBotProfile(),
    localModel: AUTO_MODEL_CHOICE,
    onlineModel: AUTO_MODEL_CHOICE,
    onlineEnabled: true,
    deleteProtected: false,
    temperature: BOT_TEMPERATURE_DEFAULT,
    maxTokens: BOT_REPLY_LENGTH_DEFAULT_TOKENS,
  });
  latestCreateBotDraftRef.current = {
    name: newBotName,
    profile: botProfile,
    localModel: newBotLocalModel,
    onlineModel: newBotOnlineModel,
    onlineEnabled: newBotOnlineEnabled,
    deleteProtected: newBotDeleteProtected,
    temperature: newBotTemperature,
    maxTokens: newBotMaxTokens,
  };

  const handleNewBotColorChange = useCallback((next: string) => {
    createBotAppearanceTouchedRef.current = true;
    setNewBotColor(next);
  }, []);

  const handleNewBotGlyphChange = useCallback((next: BotGlyphName) => {
    createBotAppearanceTouchedRef.current = true;
    setNewBotGlyph(next);
  }, []);
  // Two-stage delete confirmation. `pendingDeleteKey` holds either a
  // conversation id (sidebar ×), HEADER_DELETE_KEY (header button), or the
  // DELETE_ALL_KEY sentinel (reached by holding any × past the threshold).
  // Only one target can be armed at a time, and it auto-disarms after
  // DELETE_CONFIRM_WINDOW_MS so the ✓ doesn't linger unexpectedly.
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hold-to-delete-all gesture: `holdingKey` tracks which button is currently
  // being pressed, which the CSS keys off (via `data-holding`) to light up
  // the held × / header button AND — through the list-level
  // `data-delete-holding` attribute — every other × so the user can see
  // the gesture's scope. Released before the threshold → CSS snaps back.
  // Held past it → the timer arms DELETE_ALL_KEY, which in turn reveals a
  // centered alertdialog modal and kicks the ×'s into an iOS-style jiggle.
  // `holdCompletedRef` is the handshake that tells the trailing `onClick`
  // to stay out of the way after a completed hold (so a hold-then-release
  // doesn't also arm the single-chat delete on the same button).
  const [holdingKey, setHoldingKey] = useState<string | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdCompletedRef = useRef(false);
  // Element that had focus immediately before the armed-all modal opened.
  // Stored so we can restore focus to it when the modal dismisses — a
  // screen-reader / keyboard-user's "where was I?" anchor.
  const preModalFocusRef = useRef<HTMLElement | null>(null);
  // Pristine snapshot of the form values at the moment edit mode was
  // entered. The primary button's `hasEditChanges` check compares
  // `newBotName / serialized bot personality fields / newBotColor / newBotGlyph` against
  // THIS snapshot rather than the raw bot row so legacy bots with no
  // stored color (where we seed the picker with a random hex) don't
  // immediately appear as "dirty". Cleared when edit mode exits.
  const editOriginalRef = useRef<{
    name: string;
    prompt: string;
    localModel: string;
    onlineModel: string;
    onlineEnabled: boolean;
    deleteProtected: boolean;
    temperature: number;
    maxTokens: number;
    color: string;
    glyph: BotGlyphName;
  } | null>(null);
  const botNameInputRef = useRef<HTMLInputElement | null>(null);
  // Sentinel at the tail of the message stream. The scroll effect brings it
  // into view so the latest message is always visible without manual scrolling.
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("dark");
  const botPickerReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botPickerReturnEndAtRef = useRef(0);
  const lastBotPickerPointerTypeRef = useRef<string | null>(null);
  const sidebarEdgeSwipeRef = useRef<SidebarEdgeSwipeState | null>(null);
  const emptyStateSearchInputRef = useRef<HTMLInputElement | null>(null);
  const emptyStateSearchRef = useRef<HTMLDivElement | null>(null);
  const draftComposerRef = useRef<ComposerInputHandle | null>(null);
  const emptyStateSearchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Theme preference used before a user has logged in (or when the user
  // explicitly logs out). Seeded from localStorage so the auth screen
  // respects the last choice across refreshes; defaults to "system" so
  // first-time visitors track OS dark/light preference automatically.
  const [preAuthTheme, setPreAuthTheme] = useState<Theme>("system");
  const viewportWidth = useViewportWidth();
  const viewportHeight = useViewportHeight();
  const sidebarDrawerMode = viewportWidth <= SIDEBAR_DRAWER_BREAKPOINT;
  const secondaryOllamaDraftHost = settings?.secondaryOllamaHost?.trim() ?? "";
  const mobileBotsPanel = viewportWidth <= PICKER_MOBILE_BREAKPOINT;
  const mobileKeyboardInset = useMobileKeyboardInset(
    composerFocused && viewportWidth <= PICKER_MOBILE_BREAKPOINT
  );
  useEffect(() => {
    if (sidebarOpen || panel !== null) setChatOverflowMenuOpen(false);
  }, [sidebarOpen, panel]);

  useEffect(() => {
    if (!botPreferredModelsModalOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setBotPreferredModelsModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [botPreferredModelsModalOpen]);

  useEffect(() => {
    if (!mobileBotsPanel && botPreferredModelsModalOpen) {
      setBotPreferredModelsModalOpen(false);
    }
  }, [botPreferredModelsModalOpen, mobileBotsPanel]);

  useEffect(() => {
    if (!settingsAboutModalOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSettingsAboutModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsAboutModalOpen]);

  useEffect(() => {
    if (!changePasswordModalOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setChangePasswordModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [changePasswordModalOpen]);

  useEffect(() => {
    setChatOverflowMenuOpen(false);
  }, [detail?.id]);

  useEffect(() => {
    if (!chatOverflowMenuOpen) return;
    function onDocPointerDownCapture(event: PointerEvent) {
      if (!isPrimaryPointerDismissal(event)) return;
      const root = chatOverflowMenuRef.current;
      if (!root?.contains(event.target as Node)) {
        setChatOverflowMenuOpen(false);
      }
    }
    // Capture + pointer events keeps mobile taps from leaking into message
    // bubbles while the wrench menu is open.
    document.addEventListener("pointerdown", onDocPointerDownCapture, true);
    return () =>
      document.removeEventListener("pointerdown", onDocPointerDownCapture, true);
  }, [chatOverflowMenuOpen]);

  useEffect(() => {
    if (!chatOverflowMenuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setChatOverflowMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOverflowMenuOpen]);

  const beginSidebarEdgeSwipe = useCallback((event: React.TouchEvent<HTMLElement>) => {
    if (viewportWidth > PICKER_MOBILE_BREAKPOINT) return;
    if (sidebarOpen || panel !== null) return;
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    if (touch.clientX > MOBILE_SIDEBAR_SWIPE_EDGE_PX) return;

    sidebarEdgeSwipeRef.current = {
      touchId: touch.identifier,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }, [panel, sidebarOpen, viewportWidth]);

  const continueSidebarEdgeSwipe = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const swipe = sidebarEdgeSwipeRef.current;
    if (!swipe) return;

    const touch = Array.from(event.touches).find(
      candidate => candidate.identifier === swipe.touchId
    );
    if (!touch) return;

    const dx = touch.clientX - swipe.startX;
    const dy = Math.abs(touch.clientY - swipe.startY);

    if (dx < 0 || (dy > MOBILE_SIDEBAR_SWIPE_VERTICAL_CANCEL_PX && dy > dx)) {
      sidebarEdgeSwipeRef.current = null;
      return;
    }

    if (
      dx >= MOBILE_SIDEBAR_SWIPE_OPEN_PX &&
      dx > dy * MOBILE_SIDEBAR_SWIPE_DIRECTION_RATIO
    ) {
      event.preventDefault();
      sidebarEdgeSwipeRef.current = null;
      setSidebarOpen(true);
    }
  }, []);

  const endSidebarEdgeSwipe = useCallback((event: React.TouchEvent<HTMLElement>) => {
    const swipe = sidebarEdgeSwipeRef.current;
    if (!swipe) return;

    const touchEnded = Array.from(event.changedTouches).some(
      candidate => candidate.identifier === swipe.touchId
    );
    if (touchEnded) {
      sidebarEdgeSwipeRef.current = null;
    }
  }, []);
  const startDevToolsPanelDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const panel = devToolsPanelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    devToolsPanelDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is missing in some test environments.
    }
    event.preventDefault();
  }, []);
  const dragDevToolsPanel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = devToolsPanelDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    const panel = devToolsPanelRef.current;
    if (!panel) return;

    const rect = panel.getBoundingClientRect();
    const next = clampDevToolsPanelPosition(
      event.clientX - dragState.offsetX,
      event.clientY - dragState.offsetY,
      rect.width,
      rect.height,
      window.innerWidth,
      window.innerHeight
    );
    panel.style.left = `${next.x}px`;
    panel.style.top = `${next.y}px`;
    setDevToolsPanelPosition(next);
  }, []);
  const endDevToolsPanelDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = devToolsPanelDragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    devToolsPanelDragRef.current = null;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Safe no-op for environments without pointer capture support.
    }
  }, []);
  // Shared close helper for the right-hand panels. Also resets panel-specific
  // transient UI so reopening a panel doesn't resurrect stale state.
  const resetPanelTransientState = useCallback(() => {
    setColorWheelOpen(false);
    setBotPreferredModelsModalOpen(false);
    setSettingsAboutModalOpen(false);
    setChangePasswordModalOpen(false);
    setChangePasswordNew("");
    setChangePasswordConfirm("");
    setEditingBotId(null);
    if (botLibraryCloseTimerRef.current) {
      clearTimeout(botLibraryCloseTimerRef.current);
      botLibraryCloseTimerRef.current = null;
    }
    setBotLibraryClosing(false);
    editOriginalRef.current = null;
    // A stale "Save failed" shouldn't greet the user next time they open
    // the panel. The composer's `error` state is unaffected.
    setPanelError(null);
    // Drop any selected color group so reopening the Bots drawer always
    // starts on the dashboard root rather than a stale drilled-in view.
    setBotPanelGroup(BOT_LIBRARY_FILTER_ALL);
    setBotLibraryExpanded(false);
    setBotPanelLibraryEnabled(true);
  }, []);

  const closePanel = useCallback(() => {
    if (!panel || panelClosing) return;
    if (panelCloseTimerRef.current) {
      clearTimeout(panelCloseTimerRef.current);
      panelCloseTimerRef.current = null;
    }
    setPanelClosing(true);
    panelCloseTimerRef.current = setTimeout(() => {
      setPanel(null);
      setPanelClosing(false);
      resetPanelTransientState();
      panelCloseTimerRef.current = null;
    }, PANEL_CLOSE_ANIMATION_MS);
  }, [panel, panelClosing, resetPanelTransientState]);

  const openRightPanel = useCallback((nextPanel: Exclude<PanelView, null>) => {
    if (panelCloseTimerRef.current) {
      clearTimeout(panelCloseTimerRef.current);
      panelCloseTimerRef.current = null;
    }
    setPanelClosing(false);
    setPanel(nextPanel);
    setSidebarOpen(false);
    if (nextPanel === "bots") {
      setBotPanelLibraryEnabled(true);
    }
    if (nextPanel === "memories") {
      setMemoryPhysicsSeed((seed) => seed + 1);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (panelCloseTimerRef.current) {
        clearTimeout(panelCloseTimerRef.current);
        panelCloseTimerRef.current = null;
      }
    };
  }, []);

  const openBotLibraryDrawer = useCallback(() => {
    if (botLibraryCloseTimerRef.current) {
      clearTimeout(botLibraryCloseTimerRef.current);
      botLibraryCloseTimerRef.current = null;
    }
    setBotLibraryClosing(false);
    setBotLibraryExpanded(true);
  }, []);

  const closeBotLibraryDrawer = useCallback(() => {
    if (botLibraryCloseTimerRef.current) {
      clearTimeout(botLibraryCloseTimerRef.current);
    }
    setBotLibraryClosing(true);
    botLibraryCloseTimerRef.current = setTimeout(() => {
      setBotLibraryExpanded(false);
      setBotLibraryClosing(false);
      botLibraryCloseTimerRef.current = null;
    }, BOT_LIBRARY_DRAWER_ANIMATION_MS);
  }, []);

  const toggleBotLibraryDrawer = useCallback(() => {
    if (botLibraryExpanded && !botLibraryClosing) {
      closeBotLibraryDrawer();
      return;
    }
    openBotLibraryDrawer();
  }, [
    botLibraryExpanded,
    botLibraryClosing,
    closeBotLibraryDrawer,
    openBotLibraryDrawer,
  ]);

  useEffect(() => {
    if (panel !== "bots" || !editingBotId) return;
    const input = botNameInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
  }, [panel, editingBotId, bots]);

  useEffect(() => {
    if (!devToolsOpen) return;
    const panelNode = devToolsPanelRef.current;
    if (!panelNode) return;
    const rect = panelNode.getBoundingClientRect();

    setDevToolsPanelPosition((position) => {
      const next = clampDevToolsPanelPosition(
        position.x,
        position.y,
        rect.width,
        rect.height,
        viewportWidth,
        viewportHeight
      );
      return next.x === position.x && next.y === position.y ? position : next;
    });
  }, [devToolsOpen, viewportHeight, viewportWidth]);

  useEffect(() => {
    const panelNode = devToolsPanelRef.current;
    if (!panelNode) return;
    panelNode.style.left = `${devToolsPanelPosition.x}px`;
    panelNode.style.top = `${devToolsPanelPosition.y}px`;
  }, [devToolsPanelPosition]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener?.("change", update);
    media.addListener?.(update);
    return () => {
      media.removeEventListener?.("change", update);
      media.removeListener?.(update);
    };
  }, [bots]);

  // Starter "hello" intent (composerPrimed) disarms on outside taps — keep
  // hero / compose / picker surfaces from clearing each other accidentally.
  useEffect(() => {
    if (!composerPrimed) return;
    function handlePointerDown(event: PointerEvent) {
      if (!isPrimaryPointerDismissal(event)) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          "[data-starter-compose-surface='true'], [data-starter-bot-affordance='true'], [data-bot-talk-hero='true']"
        )
      ) {
        return;
      }
      setComposerPrimed(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [composerPrimed]);

  // Cancel any pending picker timers if the component tears down mid-preview
  // or mid-return animation (route change, mode switch, logout).
  useEffect(() => {
    return () => {
      if (botPickerReturnTimerRef.current) {
        clearTimeout(botPickerReturnTimerRef.current);
        botPickerReturnTimerRef.current = null;
      }
      botPickerReturnEndAtRef.current = 0;
      if (emptyStateSearchOpenTimerRef.current) {
        clearTimeout(emptyStateSearchOpenTimerRef.current);
        emptyStateSearchOpenTimerRef.current = null;
      }
      if (copiedMessageTimerRef.current) {
        clearTimeout(copiedMessageTimerRef.current);
        copiedMessageTimerRef.current = null;
      }
      if (fieldHelpHideTimerRef.current) {
        clearTimeout(fieldHelpHideTimerRef.current);
        fieldHelpHideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!emptyStateSearchOpen) return;
    const timeout = window.setTimeout(() => {
      emptyStateSearchInputRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [emptyStateSearchOpen]);

  const cancelPendingEmptyStateSearchOpen = useCallback(() => {
    if (emptyStateSearchOpenTimerRef.current) {
      clearTimeout(emptyStateSearchOpenTimerRef.current);
      emptyStateSearchOpenTimerRef.current = null;
    }
  }, []);

  const startBotPickerReturnToAll = useCallback(() => {
    if (botPickerReturnTimerRef.current) {
      clearTimeout(botPickerReturnTimerRef.current);
      botPickerReturnTimerRef.current = null;
    }
    setBotPickerReturnAnimating(true);
    botPickerReturnEndAtRef.current = Date.now() + BOT_PICKER_RETURN_ANIMATION_MS;
    botPickerReturnTimerRef.current = setTimeout(() => {
      setBotPickerReturnAnimating(false);
      botPickerReturnEndAtRef.current = 0;
      botPickerReturnTimerRef.current = null;
    }, BOT_PICKER_RETURN_ANIMATION_MS);
    setHueFilterCenter(null);
  }, []);

  const showEmptyStateSearchAfterReturn = useCallback(() => {
    cancelPendingEmptyStateSearchOpen();
    const remainingReturnMs = Math.max(0, botPickerReturnEndAtRef.current - Date.now());
    if (remainingReturnMs === 0) {
      setEmptyStateSearchOpen(true);
      return;
    }
    emptyStateSearchOpenTimerRef.current = setTimeout(() => {
      setEmptyStateSearchOpen(true);
      emptyStateSearchOpenTimerRef.current = null;
    }, remainingReturnMs);
  }, [cancelPendingEmptyStateSearchOpen]);

  const focusEmptyStateSearchAfterReturn = useCallback(() => {
    showEmptyStateSearchAfterReturn();
    const remainingReturnMs = Math.max(0, botPickerReturnEndAtRef.current - Date.now());
    window.setTimeout(() => {
      emptyStateSearchInputRef.current?.focus({ preventScroll: true });
    }, remainingReturnMs);
  }, [showEmptyStateSearchAfterReturn]);

  // Hydrate the pre-auth theme choice from localStorage. We read it after
  // mount to avoid SSR / hydration mismatches — the initial paint uses the
  // default ("system"), then flips to the stored choice on the client.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("prism_theme");
      if (stored === "light" || stored === "dark" || stored === "system") {
        setPreAuthTheme(stored);
      }
    } catch {
      // localStorage can throw (privacy mode, quota); non-fatal.
    }
  }, []);

  // Effective mode: the user's saved choice when logged in, the pre-auth
  // choice otherwise. Both can be "system", which delegates to the OS.
  const effectiveThemeMode: Theme = settings?.theme ?? preAuthTheme;
  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (effectiveThemeMode === "system") return systemTheme;
    return effectiveThemeMode;
  }, [effectiveThemeMode, systemTheme]);

  const themeClass = useMemo(
    () => (resolvedTheme === "light" ? styles.themeLight : styles.themeDark),
    [resolvedTheme]
  );

  useEffect(() => {
    if (panel !== "settings") return;
    if (!secondaryOllamaDraftHost) {
      setSecondaryOllamaStatus(null);
      setSecondaryOllamaStatusChecking(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshSecondaryOllamaStatus(secondaryOllamaDraftHost);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [panel, secondaryOllamaDraftHost]);

  // Derive the --accent / --accent-text / --accent-ink triad written
  // onto the app shell. A selected/active bot owns this single-color
  // accent. When no bot is active, PRISM identity comes from the home
  // frame/brand effects instead of forcing a fake shell accent.
  //
  // Visual bot resolution order (checked below):
  //   1. Pending compose picker choices. Chat uses `chatBotOverride`
  //      (three-valued so explicit Default is preserved); Sandbox uses
  //      `selectedBotId` once a thread exists because its compose picker is
  //      the "next bot to speak" selector. This is intentionally visual-only:
  //      send/persistence semantics still live in `buildChatRequestBody`.
  //   2. The OPEN conversation's `detail.lastBotId` — the bot who most
  //      recently SPOKE in this chat. In Chat mode this equals botId after
  //      the first reply (bot is locked at start); in Sandbox mode this can
  //      drift from botId as the user switches bots per-send.
  //   3. The OPEN conversation's `detail.botId` — falls back to the
  //      conversation's initially-locked bot for the pre-first-reply window.
  //   4. The empty-state picker's `selectedBotId` — the committed pre-chat
  //      pick before a conversation exists.
  //   5. Null — falls through to the PRISM home/default identity.
  //
  // Private chats with Default/Prism still resolve to null for the monochrome
  // Prism treatment. Private chats with a selected custom bot keep that bot
  // for prompt identity and subdued visual identity; memory/history isolation
  // is handled by the incognito request path, not by hiding the bot.
  //
  const privateChatActive = detail?.incognito === true || pendingIncognito;

  const visualBotSelection = useMemo<{
    botId: string | null;
    explicitDefault: boolean;
  }>(() => {
    if (privateChatActive) {
      return {
        botId: detail?.botId ?? selectedBotId,
        explicitDefault: false,
      };
    }
    if (view === "sandbox") {
      if (detail) {
        return { botId: selectedBotId, explicitDefault: selectedBotId === null };
      }
      return {
        botId: selectedBotId,
        explicitDefault: false,
      };
    } else if (view === "chat") {
      if (chatBotOverride !== undefined) {
        return {
          botId: chatBotOverride,
          explicitDefault: chatBotOverride === null,
        };
      }
      return {
        botId: detail?.lastBotId
          ?? detail?.botId
          ?? selectedBotId,
        explicitDefault: false,
      };
    }
    return { botId: null, explicitDefault: false };
  }, [
    view,
    selectedBotId,
    detail,
    chatBotOverride,
    privateChatActive,
  ]);

  const activeBot = useMemo<Bot | null>(() => {
    return bots.find(b => b.id === visualBotSelection.botId) ?? null;
  }, [
    bots,
    visualBotSelection.botId,
  ]);
  const privateCustomBotActive = privateChatActive && activeBot !== null;

  const defaultConversationUsesPrismIdentity =
    !privateChatActive &&
    visualBotSelection.botId === null &&
    (detail !== null || visualBotSelection.explicitDefault);

  const shellStyle = useMemo<React.CSSProperties | undefined>(() => {
    const raw = activeBot?.color?.trim();
    if (!raw) return undefined;
    return deriveAccentStyle(
      normalizeAccentForTheme(raw, resolvedTheme),
      resolvedTheme
    );
  }, [activeBot, resolvedTheme]);

  const composeBotAccentId = useMemo<string | null>(() => {
    if (privateChatActive) return detail?.botId ?? selectedBotId;
    if (view === "chat") {
      if (chatBotOverride !== undefined) return chatBotOverride;
      if (detail) return detail.botId;
    }
    return selectedBotId;
  }, [
    view,
    detail,
    chatBotOverride,
    privateChatActive,
    selectedBotId,
  ]);

  const selectedComposeBotAccent = useMemo<string | null>(() => {
    const raw = composeBotAccentId
      ? bots.find((bot) => bot.id === composeBotAccentId)?.color?.trim()
      : null;
    return raw ? normalizeAccentForTheme(raw, resolvedTheme) : null;
  }, [bots, composeBotAccentId, resolvedTheme]);

  const composeStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!selectedComposeBotAccent && mobileKeyboardInset <= 0) return undefined;
    const style = {} as React.CSSProperties & Record<string, string>;
    if (selectedComposeBotAccent) {
      style["--compose-bot-color"] = selectedComposeBotAccent;
    }
    if (mobileKeyboardInset > 0) {
      style["--compose-keyboard-inset"] = `${mobileKeyboardInset}px`;
    }
    return style;
  }, [mobileKeyboardInset, selectedComposeBotAccent]);

  const privateChatButtonStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!selectedComposeBotAccent) return undefined;
    return {
      ["--private-chat-color" as string]: selectedComposeBotAccent,
    };
  }, [selectedComposeBotAccent]);

  /** Normalized hue for user ink + mobile focus ring fallback (any mode with a thread bot). */
  const threadConversationAccentInk = useMemo(() => {
    if (!detail || detail.incognito) return undefined;
    const liveBot = detail.botId ? bots.find((b) => b.id === detail.botId) : undefined;
    const fromLive = liveBot?.color?.trim();
    const fromAssistant = detail.messages.find((m) => m.role === "assistant" && m.botColor?.trim());
    const raw = fromLive ?? fromAssistant?.botColor?.trim();
    if (!raw) return undefined;
    return normalizeAccentForTheme(raw, resolvedTheme);
  }, [detail, bots, resolvedTheme]);

  const deriveMobileMessageFocusAccent = useCallback(
    (msg: Message): string => {
      if (!detail?.incognito && msg.role === "assistant" && msg.botColor?.trim()) {
        return normalizeAccentForTheme(msg.botColor.trim(), resolvedTheme);
      }
      if (threadConversationAccentInk) return threadConversationAccentInk;
      return resolvedTheme === "light" ? "#312b24" : "#d7cfc3";
    },
    [detail?.incognito, resolvedTheme, threadConversationAccentInk]
  );

  const headerIdentity = useMemo<{
    name: string;
    glyph: BotGlyphName;
    color: string | null;
  } | null>(() => {
    if (!detail) return null;
    if (activeBot) {
      return {
        name: activeBot.name,
        glyph: isBotGlyphName(activeBot.glyph) ? activeBot.glyph : DEFAULT_BOT_GLYPH,
        color: activeBot.color,
      };
    }
    if (defaultConversationUsesPrismIdentity) {
      return {
        name: DEFAULT_ASSISTANT_NAME,
        glyph: "triangle",
        color: null,
      };
    }
    const lastAssistantWithBot = detail.messages
      .slice()
      .reverse()
      .find(message =>
        message.role === "assistant" &&
        (message.botName || message.botGlyph || message.botColor)
      );
    if (lastAssistantWithBot?.botName) {
      return {
        name: lastAssistantWithBot.botName,
        glyph: isBotGlyphName(lastAssistantWithBot.botGlyph)
          ? lastAssistantWithBot.botGlyph
          : DEFAULT_BOT_GLYPH,
        color: lastAssistantWithBot.botColor ?? null,
      };
    }
    return {
      name: detail.incognito ? "Private" : "Default",
      glyph: "triangle",
      color: null,
    };
  }, [detail, activeBot, defaultConversationUsesPrismIdentity]);

  // The sidebar is a place to leave the current chat, not mirror it.
  // Keep the active conversation persisted in `conversations`, but hide
  // its row until the user starts another chat or opens a different one.
  // Private rows are filtered here as a client-side guard for older API
  // payloads or pre-ephemeral rows that should never reach the sidebar UI.
  const visibleConversations = useMemo(
    () => {
      if (privateChatActive) return [];
      const order = new Map(
        unreadConversationOrder.map((conversationId, index) => [conversationId, index])
      );
      return conversations
        .filter(c => !c.incognito && c.id !== selectedId)
        .slice()
        .sort((a, b) => {
          const aOrder = order.get(a.id);
          const bOrder = order.get(b.id);
          if (aOrder !== undefined && bOrder !== undefined) return aOrder - bOrder;
          if (aOrder !== undefined) return -1;
          if (bOrder !== undefined) return 1;
          return 0;
        });
    },
    [conversations, privateChatActive, selectedId, unreadConversationOrder]
  );
  const conversationGroups = useMemo(
    () => buildConversationGroups(visibleConversations, bots, unreadConversationIds),
    [visibleConversations, bots, unreadConversationIds]
  );
  const conversationGroupsByKey = useMemo(
    () => new Map(conversationGroups.map((group) => [group.key, group])),
    [conversationGroups]
  );
  const openConversationGroup = openConversationGroupKey
    ? conversationGroupsByKey.get(openConversationGroupKey) ?? null
    : null;
  const sidebarConversationItems = useMemo<SidebarConversationItem[]>(() => {
    if (openConversationGroup) {
      return openConversationGroup.conversations.map((conversation) => ({
        kind: "conversation",
        conversation,
      }));
    }
    const renderedGroupKeys = new Set<string>();
    return visibleConversations.flatMap((conversation): SidebarConversationItem[] => {
      const key = conversationGroupKey(conversation);
      const group = conversationGroupsByKey.get(key);
      if (group && group.count > 1) {
        if (renderedGroupKeys.has(key)) return [];
        renderedGroupKeys.add(key);
        return [{ kind: "group", group }];
      }
      return [{ kind: "conversation", conversation }];
    });
  }, [conversationGroupsByKey, openConversationGroup, visibleConversations]);

  useEffect(() => {
    if (openConversationGroupKey && !conversationGroupsByKey.has(openConversationGroupKey)) {
      setOpenConversationGroupKey(null);
    }
  }, [conversationGroupsByKey, openConversationGroupKey]);

  const showPrivateConversationEmptyState =
    privateChatActive && visibleConversations.length === 0;
  const pendingReplyVisible =
    pendingReply &&
    (
      (pendingReplyConversationId !== null && detail?.id === pendingReplyConversationId) ||
      (pendingReplyIsNewConversation && detail?.id === "pending")
    );

  const typingIndicatorNode = useMemo(() => {
    if (!pendingReplyVisible) return null;
    const pendingRespondent =
      composeBotAccentId !== null
        ? bots.find((b) => b.id === composeBotAccentId)
        : null;
    const displayName =
      pendingRespondent?.name?.trim() ??
      headerIdentity?.name ??
      DEFAULT_ASSISTANT_NAME;
    const salt = `${composeBotAccentId ?? "none"}:${detail?.messages.length ?? 0}:${pendingReplyConversationId ?? "new"}`;
    const label = pickGeneratingLabel(displayName, salt);
    const style = selectedComposeBotAccent
      ? ({ ["--typing-accent" as string]: selectedComposeBotAccent } as React.CSSProperties)
      : undefined;
    return (
      <div
        className={styles.typingIndicator}
        style={style}
        role="status"
        aria-live="polite"
        aria-label={label}
      >
        <span>{label}</span>
        <span className={styles.typingDots} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }, [
    pendingReplyVisible,
    composeBotAccentId,
    bots,
    headerIdentity?.name,
    detail?.messages.length,
    pendingReplyConversationId,
    selectedComposeBotAccent,
  ]);

  const clearConversationUnread = useCallback((conversationId: string) => {
    setUnreadConversationIds(previous => {
      if (!previous.has(conversationId)) return previous;
      const next = new Set(previous);
      next.delete(conversationId);
      return next;
    });
    setUnreadConversationOrder(previous =>
      previous.includes(conversationId)
        ? previous.filter(id => id !== conversationId)
        : previous
    );
  }, []);

  const conversationRowGlowStyle = useCallback((index: number): React.CSSProperties => {
    const estimatedRowStridePx = 42;
    const rowHeightPx = 36;
    const glowFalloffPx = 1200;
    const rowTopInViewport = Math.max(0, index * estimatedRowStridePx - conversationListScrollTop);
    // Linear intensity (no easing) so adjacent rows differ by a constant
    // delta and the gradient feels continuous across tiles. The raw
    // viewport-derived value is remapped from [0, 1] to [0, 0.45] so
    // the bottom of the list resolves to fully transparent fill and
    // the top peaks at a calm 45% color band.
    const baseIntensity = Math.max(0, Math.min(1, 1 - rowTopInViewport / glowFalloffPx));
    const intensity = baseIntensity * 0.45;
    const baseFill = intensity * 60;
    const innerGlow = intensity * 90;
    const outerGlow = intensity * 40;
    const fillGlow = intensity * 22;
    // Bottom-of-list shade: pulls each row toward black as its row
    // color band fades out, so the very bottom rows feel slightly
    // darker than the sidebar surface instead of disappearing.
    const bottomShade = (1 - baseIntensity) * 14;
    // Anchor the diagonal "bright" and "counter" spots to absolute
    // viewport positions in the conversation list so each row only
    // exposes its own slice of a single continuous gradient.
    const sunYInRow = 4 - rowTopInViewport;
    const sunYPct = (sunYInRow / rowHeightPx) * 100;
    const counterYInRow = 320 - rowTopInViewport;
    const counterYPct = (counterYInRow / rowHeightPx) * 100;
    // Smooth black-to-white text transition matched to the same fill
    // intensity curve. baseIntensity = 1 at the very top (text is
    // near-black) and = 0 once the row is past the falloff distance
    // (text is white), with a continuous gray ramp between.
    const textChannel = Math.round(255 - baseIntensity * 244);
    const textChannelHex = textChannel.toString(16).padStart(2, "0");
    const rowText = `#${textChannelHex}${textChannelHex}${textChannelHex}`;
    return {
      "--row-depth-base": `${baseFill.toFixed(1)}%`,
      "--row-depth-glow": `${innerGlow.toFixed(1)}%`,
      "--row-depth-glow-outer": `${outerGlow.toFixed(1)}%`,
      "--row-depth-fill": `${fillGlow.toFixed(1)}%`,
      "--row-depth-shade": `${bottomShade.toFixed(1)}%`,
      "--row-glow-y": `${sunYPct.toFixed(1)}%`,
      "--row-counter-y": `${counterYPct.toFixed(1)}%`,
      "--row-text-color": rowText,
    } as React.CSSProperties;
  }, [conversationListScrollTop]);

  const panelColorHarmonyActive = bots.length >= BOT_PANEL_COLOR_HARMONY_MIN_BOTS;
  const sortedPanelBots = useMemo(
    () => [...bots].sort((a, b) => (
      compareBotsByColor(a, b, resolvedTheme, panelColorHarmonyActive)
    )),
    [bots, resolvedTheme, panelColorHarmonyActive]
  );
  const pickerSourceBots = bots;

  const hueLensTrackSegments = useMemo(
    () => computeHueLensTrackSegments(pickerSourceBots),
    [pickerSourceBots]
  );
  const hueLensFilterableBotCount = useMemo(
    () => pickerSourceBots.filter(botHasFilterableColor).length,
    [pickerSourceBots]
  );
  const hueLensWindowCapacity =
    viewportWidth > PICKER_MOBILE_BREAKPOINT
      ? HUE_RIBBON_DESKTOP_COLUMNS * HUE_RIBBON_DESKTOP_ROWS
      : HUE_RIBBON_MOBILE_COLUMNS * HUE_RIBBON_MOBILE_ROWS;
  // Active hue lens turns the large empty-state picker into a moving
  // window over a circular hue-sorted ribbon. Once a chat has messages,
  // the composer popout receives the raw bot list and treats the hue
  // value as a scroll/focus target instead, so other colors remain visible.
  const normalizedEmptyStateBotNameFilter =
    emptyStateBotNameFilter.trim().toLocaleLowerCase();
  const filteredBots = useMemo(
    () => {
      const hueLensActive = hueFilterCenter !== null;
      const isDesktopViewport = viewportWidth > PICKER_MOBILE_BREAKPOINT;
      const hueLensPreferredRows = !hueLensActive
        ? undefined
        : isDesktopViewport
          ? HUE_RIBBON_DESKTOP_ROWS
          : HUE_RIBBON_MOBILE_ROWS;
      const hueLensPreferredCols = !hueLensActive
        ? undefined
        : isDesktopViewport
          ? HUE_RIBBON_DESKTOP_COLUMNS
          : HUE_RIBBON_MOBILE_COLUMNS;
      const hueFilteredBots = hueRibbonWindowBots(
        pickerSourceBots,
        hueFilterCenter,
        hueLensTrackSegments,
        viewportWidth,
        viewportHeight,
        hueLensPreferredRows,
        hueLensPreferredCols
      );
      if (normalizedEmptyStateBotNameFilter.length === 0) {
        return hueFilteredBots;
      }
      return hueFilteredBots.filter((bot) =>
        bot.name.toLocaleLowerCase().includes(normalizedEmptyStateBotNameFilter)
      );
    },
    [
      pickerSourceBots,
      hueFilterCenter,
      hueLensTrackSegments,
      normalizedEmptyStateBotNameFilter,
      viewportWidth,
      viewportHeight,
    ]
  );
  const activeHueLensGridOptions = useMemo<PickerGeometryOptions>(() => {
    if (hueFilterCenter === null) return { balanceOddRows: true };
    const isDesktopViewport = viewportWidth > PICKER_MOBILE_BREAKPOINT;
    return {
      balanceOddRows: false,
      preferredRows: isDesktopViewport
        ? HUE_RIBBON_DESKTOP_ROWS
        : HUE_RIBBON_MOBILE_ROWS,
      preferredCols: isDesktopViewport
        ? HUE_RIBBON_DESKTOP_COLUMNS
        : HUE_RIBBON_MOBILE_COLUMNS,
    };
  }, [hueFilterCenter, viewportWidth]);
  const emptyStateSearchActive =
    emptyStateSearchOpen || normalizedEmptyStateBotNameFilter.length > 0;
  const emptyStateTypingSearchAvailable =
    pickerSourceBots.length > 0 &&
    (!detail || detail.messages.length === 0) &&
    !privateChatActive;
  // Hide the lens until it can actually reveal hidden color territory.
  // If every filterable bot already fits in the active ribbon window,
  // the slider is decorative friction rather than useful navigation.
  const hueLensHasHiddenRange =
    hueLensTrackSegments.length > 1 &&
    hueLensFilterableBotCount > hueLensWindowCapacity;
  // Mobile can enter hue drill mode from a tile tap before the slider is
  // visible; keep the lens available while drilled in so users can steer
  // or clear that focused color space.
  const hueLensAvailable =
    hueLensHasHiddenRange || hueFilterCenter !== null;
  const hueFilterActive = hueFilterCenter !== null;
  const hueLensTrackGradient = useMemo(
    () => hueLensGradient(hueLensTrackSegments, resolvedTheme),
    [hueLensTrackSegments, resolvedTheme]
  );
  // Empty-state lens slider lives in the compose form just below the
  // messages frame while the user is browsing/filtering bots. Once a bot
  // is committed, the bot owns the shell accent and the lens disappears
  // so interface color and bot accent cannot drift apart.
  const emptyStateLensVisible =
    hueLensAvailable &&
    (!detail || detail.messages.length === 0) &&
    !privateChatActive &&
    !selectedBotId;
  const lensThumbXPct = useMemo(
    () => hueLensSliderPercent(hueFilterCenter, hueLensTrackSegments),
    [hueFilterCenter, hueLensTrackSegments]
  );
  // Three semantic moods drive the messages-frame ::after orb glow:
  //   • "private"  — Private chat is armed or active. Mono theme-color
  //     glow + mono triangle hero. No accent leakage anywhere, in
  //     keeping with Private's "B&W only" design pillar.
  //   • "home"     — Prism identity surface: untouched empty state OR a
  //     Default/no-bot conversation. Horizontal RAINBOW band at the bottom
  //     + the existing rainbow brand mark. This state is PRISM-owned even
  //     when the user has zero bots, so it must not depend on populated
  //     bot color families.
  //   • "engaged"  — Anything else: filter active, bot armed, or mid-
  //     thread chat. Lens-driven hue (the existing `var(--accent)` orb
  //     behavior).
  const activeConversationIsEmpty = !detail || detail.messages.length === 0;
  /** Hybrid Markdown compose: typed Markdown markers render live while the draft remains Markdown text. */
  const composerMarkdownEditorEnabled = true;
  const messagesFrameMode = useMemo<"private" | "home" | "engaged">(() => {
    if (privateChatActive) return "private";
    if (defaultConversationUsesPrismIdentity) return "home";
    const isUntouchedHome =
      activeConversationIsEmpty &&
      hueFilterCenter === null &&
      !selectedBotId &&
      !detail?.botId;
    return isUntouchedHome ? "home" : "engaged";
  }, [
    privateChatActive,
    activeConversationIsEmpty,
    hueFilterCenter,
    selectedBotId,
    detail?.botId,
    defaultConversationUsesPrismIdentity,
  ]);
  // Home-mode rainbow halos use populated bot families when they exist,
  // otherwise they fall back to the five PRISM brand colors. That keeps
  // Default/no-bot non-private UI colorful while preserving custom bot
  // accent behavior once a real bot is selected.
  const HOME_HALO_SLOTS = 5;
  const homeRainbowVars = useMemo<Record<string, string> | null>(() => {
    if (messagesFrameMode !== "home") return null;
    const haloSegments = hueLensTrackSegments.length > 0
      ? hueLensTrackSegments
      : PRISM_HUE_LENS_TRACK_SEGMENTS;
    const vars: Record<string, string> = {};
    for (let i = 0; i < HOME_HALO_SLOTS; i += 1) {
      if (i < haloSegments.length) {
        const x = (100 * (i + 0.5)) / haloSegments.length;
        vars[`--home-halo-${i + 1}-x`] = `${x.toFixed(1)}%`;
        vars[`--home-halo-${i + 1}-color`] = haloSegments[i].color;
      } else {
        vars[`--home-halo-${i + 1}-x`] = "50%";
        vars[`--home-halo-${i + 1}-color`] = "transparent";
      }
    }
    return vars;
  }, [messagesFrameMode, hueLensTrackSegments]);
  const messagesFrameStyle = useMemo<React.CSSProperties | undefined>(
    () => {
      const lensThumb: Record<string, string> = emptyStateLensVisible
        ? { "--lens-thumb-x": `${lensThumbXPct.toFixed(2)}%` }
        : {};
      const homeVars = homeRainbowVars ?? {};
      const merged = { ...lensThumb, ...homeVars };
      return Object.keys(merged).length > 0
        ? (merged as unknown as React.CSSProperties)
        : undefined;
    },
    [emptyStateLensVisible, lensThumbXPct, homeRainbowVars]
  );
  // Hero override is drag-only — the Prism triangle replaces a bot glyph
  // only while the user is actively pressing/touching the slider thumb.
  // When a bot is committed, the lens unmounts and the bot accent takes
  // over the shell.
  const [lensInteracting, setLensInteracting] = useState(false);
  // Continuous-hue accent driven by the slider only while the lens is
  // visible. A selected bot hides the lens, making `shellStyle` below the
  // source of truth for both interface and accent color.
  const lensAccentColor = useMemo<string | null>(
    () =>
      emptyStateLensVisible
        ? hueLensSliderTintHex(hueFilterCenter, hueLensTrackSegments)
        : null,
    [emptyStateLensVisible, hueFilterCenter, hueLensTrackSegments]
  );
  // Resolution priority:
  //   1. Lens accent while browsing/filtering before a bot is selected.
  //   2. Bot accent (`shellStyle`) once a bot is committed or mid-thread.
  //   3. Undefined — root theme defaults.
  const mergedShellStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (lensAccentColor) {
      return deriveAccentStyle(
        normalizeAccentForTheme(lensAccentColor, resolvedTheme),
        resolvedTheme
      );
    }
    if (shellStyle) return shellStyle;
    return undefined;
  }, [shellStyle, lensAccentColor, resolvedTheme]);

  // App-shell style consumed by chat/sandbox `<main>`. Keep this scoped to
  // the active shell accent; the PRISM hero halo remains the fixed rainbow
  // from main rather than deriving from the user's bot palette.
  const appShellStyle = mergedShellStyle;

  useEffect(() => {
    if (!hueLensAvailable && hueFilterCenter !== null) {
      setHueFilterCenter(null);
    }
  }, [hueLensAvailable, hueFilterCenter]);

  useEffect(() => {
    if (view !== "chat") return;
    const botIds = new Set(bots.map((bot) => bot.id));
    if (!detail && selectedBotId && !botIds.has(selectedBotId)) {
      setSelectedBotId(null);
    }
    if (chatBotOverride && !botIds.has(chatBotOverride)) {
      setChatBotOverride(undefined);
    }
  }, [view, detail, selectedBotId, chatBotOverride, bots]);

  // Empty-state picker (Chat + Sandbox) renders bots in color order so
  // the unfiltered grid trends toward a color-wheel/color-square map.
  // Sorted off `filteredBots` so the lens stays the source of truth for
  // which bots are visible; only the ORDER is recomputed here. Reuse
  // `panelColorHarmonyActive` so the visual harmony of the dashboard
  // matches the empty-state grid in dense libraries.
  const pickerBots = useMemo(
    () => [...filteredBots].sort((a, b) => (
      compareBotsByColor(a, b, resolvedTheme, panelColorHarmonyActive)
    )),
    [filteredBots, resolvedTheme, panelColorHarmonyActive]
  );

  // Bucket the already color-sorted list into the five Prism letters
  // (plus an `other` bucket for grayscale/colorless bots). Rendered
  // only at high bot counts; the underlying sortedPanelBots ordering
  // is preserved inside each bucket so drilling into a group still
  // reads light-to-dark.
  const botGroupBuckets = useMemo(() => {
    const buckets: Record<PrismGroupId, Bot[]> = {
      p: [], r: [], i: [], s: [], m: [],
    };
    for (const bot of sortedPanelBots) {
      buckets[botPrismGroup(bot.color)].push(bot);
    }
    return buckets;
  }, [sortedPanelBots]);

  // The library browser always starts with a neutral "all bots" filter,
  // followed by the five PRISM wordmark buckets.
  const botGroupOrder = useMemo<readonly PrismGroupDef[]>(() => PRISM_GROUPS, []);

  // PRISM categories are the default collapsed browsing surface for the
  // Bots drawer. Color harmony still waits for high-count libraries, but
  // the category dashboard itself appears as soon as the user has bots.
  const botPanelDashboardActive = bots.length >= BOT_PANEL_DASHBOARD_MIN_BOTS;

  // Filter safety: if the active group disappears (count dropped below
  // threshold OR the only bot in that group was deleted), bounce the user
  // back to the all-bots filter instead of leaving them on a ghost view.
  useEffect(() => {
    if (!botPanelDashboardActive) {
      if (botPanelGroup !== BOT_LIBRARY_FILTER_ALL) {
        setBotPanelGroup(BOT_LIBRARY_FILTER_ALL);
      }
      return;
    }
    if (
      botPanelGroup !== BOT_LIBRARY_FILTER_ALL &&
      botGroupBuckets[botPanelGroup].length === 0
    ) {
      setBotPanelGroup(BOT_LIBRARY_FILTER_ALL);
    }
  }, [botPanelDashboardActive, botPanelGroup, botGroupBuckets]);

  const visibleBotPanelBots = useMemo<readonly Bot[]>(() => {
    if (!botPanelDashboardActive) return sortedPanelBots;
    if (botPanelGroup === BOT_LIBRARY_FILTER_ALL) return sortedPanelBots;
    return botGroupBuckets[botPanelGroup];
  }, [botPanelDashboardActive, botPanelGroup, botGroupBuckets, sortedPanelBots]);

  const activeBotPanelGroup = botPanelGroup !== BOT_LIBRARY_FILTER_ALL
    ? PRISM_GROUPS.find(g => g.id === botPanelGroup) ?? null
    : null;
  const activeBotPanelFilterLabel =
    botPanelGroup === BOT_LIBRARY_FILTER_ALL
      ? "All bots"
      : activeBotPanelGroup?.label ?? "Filtered bots";
  const botPanelListVisible =
    !botPanelDashboardActive || botPanelGroup !== BOT_LIBRARY_FILTER_ALL;

  const bootstrap = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const d = await api<{ user: SessionUser }>("/api/auth/me", { signal: controller.signal });
      setUser(d.user);
    } catch {
      setUser(null);
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    if (!CLIENT_ACCESS_REQUIRED) {
      setClientAccessState("allowed");
      return;
    }
    let cancelled = false;
    async function validateClientAccess(): Promise<void> {
      try {
        await api("/api/client-access/me");
        if (!cancelled) setClientAccessState("allowed");
      } catch {
        if (!cancelled) {
          setClientAccessState("blocked");
          setUser(null);
        }
      }
    }

    void validateClientAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (clientAccessState !== "allowed") return;
    void bootstrap();
  }, [bootstrap, clientAccessState]);
  // refreshAll is intentionally a local function declaration in this component.
  // This effect should run on auth transitions, not on every render identity churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!user) return; void refreshAll(); }, [user]);
  useEffect(() => {
    return () => {
      if (botLibraryCloseTimerRef.current) {
        clearTimeout(botLibraryCloseTimerRef.current);
      }
    };
  }, []);

  // Keep the latest message pinned to the bottom of the stream. Fires when:
  //   - a new conversation is loaded (detail?.id change)
  //   - a message is added, optimistically or from the server (length change)
  //   - the visible typing indicator toggles on/off
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [
    detail?.id,
    detail?.messages.length,
    pendingReplyVisible,
  ]);

  useEffect(() => {
    if (viewportWidth > PICKER_MOBILE_BREAKPOINT) {
      setMobileFocusedMessageId(null);
    }
  }, [viewportWidth]);

  // Drop any pending mid-thread bot override whenever the open
  // conversation changes OR the post-auth surface flips. Without this,
  // a user who half-picked "try Bot B" in Chat, clicked New Chat, and
  // came back would see their stale pending pick linger on the
  // replacement thread — the opposite of "the override is tied to THIS
  // chat". `view` is in the dep list so switching to Sandbox/Hub also
  // clears it; the state has no meaning outside Chat.
  useEffect(() => {
    setChatBotOverride(undefined);
    setComposerPrimed(false);
  }, [selectedId, view]);

  useEffect(() => {
    if (memoryToasts.length === 0) return;
    const timer = window.setInterval(() => {
      const now = Date.now();
      setMemoryToasts((current) =>
        current.filter((toast) =>
          pausedMemoryToastIds.has(toast.id) || toast.expiresAt > now
        )
      );
    }, 500);
    return () => window.clearInterval(timer);
  }, [memoryToasts.length, pausedMemoryToastIds]);

  // Every entrance into Sandbox lands on a fresh, empty chat. Sandbox
  // is a playground — users expect each visit to start from zero, not
  // resume whatever thread was last open. Fires on:
  //   • Hub → Sandbox transitions (Hub tile click).
  //   • Direct URL loads at `/?view=sandbox` (effect runs on mount).
  //   • Chat → Sandbox via URL / back-forward nav.
  // Clicking a conversation row IN the Sandbox sidebar does NOT re-fire
  // this effect — `view` stays "sandbox" while `refreshConversation`
  // repopulates detail/selectedId — so loading past chats still works
  // as expected. Chat mode is intentionally unaffected: its bot and
  // privacy flags are conversation-level commitments, so remembering
  // the last open thread is the right default there.
  useEffect(() => {
    if (view !== "sandbox") return;
    setSelectedId(null);
    setDetail(null);
    setSelectedBotId(null);
    setError(null);
  }, [view]);

  async function refreshAll() { await Promise.all([refreshConversations(), refreshSettings(), refreshMemories(), refreshBots(), refreshImages(), refreshModels()]); }
  async function refreshConversations(): Promise<ConversationSummary[]> {
    const d = await api<{ conversations: ConversationSummary[] }>("/api/conversations");
    const next = d.conversations.filter(c => !c.incognito);
    setConversations(next);
    return next;
  }
  async function refreshConversation(id: string): Promise<void> {
    clearConversationUnread(id);
    const d = await api<{ conversation: ConversationDetail }>(
      `/api/conversations/${id}`
    );
    setDetail(d.conversation);
    setSelectedId(id);
    // Sync the composer's bot dropdown to match whoever was last active
    // in the chat we're switching into. Without this, picking a chat
    // where Spongebob last spoke still shows "Default" in the dropdown,
    // and the user's next send goes to Default by accident.
    //
    // Priority order:
    //   - hasAssistantReply: the conversation has a real history; use
    //     lastBotId (which is null when Default was the last to speak,
    //     collapsing the dropdown to "Default" — correct).
    //   - else: no replies yet (edge case from a failed send), fall
    //     back to the locked botId so the dropdown reflects the user's
    //     original intent.
    const nextPickedBotId = d.conversation.hasAssistantReply
      ? d.conversation.lastBotId
      : d.conversation.botId;
    setSelectedBotId(nextPickedBotId);
    if (nextPickedBotId) {
      await refreshBotMemories(nextPickedBotId);
    } else {
      setBotMemories([]);
    }
  }
  async function refreshSettings() {
    const d = await api<{ settings: UserSettings }>("/api/settings");
    const secondaryHost =
      typeof d.settings.secondaryOllamaHost === "string"
        ? d.settings.secondaryOllamaHost
        : "";
    setSettings({
      ...d.settings,
      hiddenBotModelIds: Array.isArray(d.settings.hiddenBotModelIds)
        ? d.settings.hiddenBotModelIds
        : [],
      secondaryOllamaHost: secondaryHost,
    });
  }
  async function refreshModels() { const d = await api<{ catalog: ModelCatalog }>("/api/models"); setModelCatalog(d.catalog); }
  async function refreshSecondaryOllamaStatus(hostOverride?: string) {
    setSecondaryOllamaStatusChecking(true);
    try {
      const statusUrl = hostOverride !== undefined
        ? `/api/settings/secondary-ollama-status?host=${encodeURIComponent(hostOverride)}`
        : "/api/settings/secondary-ollama-status";
      const d = await api<{ status: SecondaryOllamaStatus }>(
        statusUrl
      );
      setSecondaryOllamaStatus(d.status);
    } catch {
      setSecondaryOllamaStatus({
        configured: Boolean(hostOverride?.trim()),
        reachable: false,
        modelCount: 0,
      });
    } finally {
      setSecondaryOllamaStatusChecking(false);
    }
  }
  async function refreshMemories() {
    const d = await api<{
      memories: UserMemory[];
      memoryCountsByBotId?: Record<string, number>;
      defaultMemoryCount?: number;
      directCountsByBotId?: Record<string, number>;
      defaultDirectCount?: number;
    }>("/api/memories");
    setMemories(d.memories);
    setDirectMemoryCountsByBotId(d.memoryCountsByBotId ?? d.directCountsByBotId ?? {});
    setDefaultDirectMemoryCount(
      typeof d.defaultMemoryCount === "number"
        ? d.defaultMemoryCount
        : typeof d.defaultDirectCount === "number"
          ? d.defaultDirectCount
          : 0
    );
  }
  async function refreshBotMemories(botId: string) {
    const d = await api<{ memories: UserMemory[] }>(
      `/api/memories?botId=${encodeURIComponent(botId)}`
    );
    setBotMemories(d.memories);
  }
  async function refreshDefaultMemories() {
    const d = await api<{ memories: UserMemory[] }>("/api/memories?scope=default");
    setBotMemories(d.memories);
  }
  async function refreshOpenMemoryViews() {
    await refreshMemories();
    if (memoryPanelScope === "default") {
      await refreshDefaultMemories();
    } else if (memoryPanelBot?.id) {
      await refreshBotMemories(memoryPanelBot.id);
    }
  }
  async function refreshBots() { const d = await api<{ bots: Bot[] }>("/api/bots"); setBots(d.bots); }
  async function refreshImages() { const d = await api<{ images: ImageRecord[] }>("/api/images"); setImages(d.images); }

  async function runMemoryTransition(
    work: () => void | Promise<void>,
    direction: "forward" | "backward",
  ) {
    // A monotonic run id lets a fresher navigation pre-empt an older one
    // (e.g. rapid back-back-back) without the older run flipping the
    // phase back to "idle" out from under it.
    const runId = memoryTransitionRunRef.current + 1;
    memoryTransitionRunRef.current = runId;
    const isCurrent = () => memoryTransitionRunRef.current === runId;

    setMemoryTransitionDirection(direction);
    setMemoryTransitionPhase("exiting");

    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, MEMORY_TRANSITION_EXIT_MS),
    );
    if (!isCurrent()) return;

    try {
      await work();
    } catch (err) {
      if (isCurrent()) setMemoryTransitionPhase("idle");
      throw err;
    }
    if (!isCurrent()) return;

    // Give React one frame to commit the new content at the enter
    // animation's keyframe-0 (scaled + transparent) before we trigger the
    // animation. Without this, the new content can flash at full size.
    await new Promise<void>((resolve) =>
      window.requestAnimationFrame(() => resolve()),
    );
    if (!isCurrent()) return;

    setMemoryTransitionPhase("entering");

    await new Promise<void>((resolve) =>
      window.setTimeout(resolve, MEMORY_TRANSITION_ENTER_MS),
    );
    if (!isCurrent()) return;

    setMemoryTransitionPhase("idle");
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (authMode === "register") await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, displayName, theme: preAuthTheme }) });
      else await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      clearNativeSessionToken();
      await bootstrap(); setPassword("");
    } catch (err) { setError(err instanceof Error ? err.message : "Auth failed."); }
    finally { setBusy(false); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    clearNativeSessionToken();
    setUser(null);
    setConversations([]);
    setDetail(null);
    setMemories([]);
    setBotMemories([]);
    setSettings(null);
    setModelCatalog(null);
    setBots([]);
    setImages([]);
    // Drop any ?view= param so the next login lands on the Hub instead
    // of whichever mode the user was last browsing.
    navigateToView("hub");
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      "Delete your account and all associated chats, memories, bots, images, and exports? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setPanelError(null);
    try {
      await api("/api/account", { method: "DELETE" });
      setUser(null);
      setConversations([]);
      setDetail(null);
      setMemories([]);
      setSettings(null);
      setModelCatalog(null);
      setBots([]);
      setImages([]);
      window.location.href = "/?mode=register";
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Account deletion failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitChangePassword() {
    setPanelError(null);
    if (changePasswordNew !== changePasswordConfirm) {
      setPanelError("New password and confirmation do not match.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          newPassword: changePasswordNew,
        }),
      });
      setChangePasswordModalOpen(false);
      setChangePasswordNew("");
      setChangePasswordConfirm("");
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Password change failed.");
    } finally {
      setBusy(false);
    }
  }

  // Single source of truth for /api/chat request bodies. Normal sends and
  // edit-rerun both funnel through this so
  // whatever bot / provider / incognito is live RIGHT NOW — not at the
  // moment the message was originally sent — is what the server sees.
  // That's the whole point of "play with bot settings and rerun".
  //
  // Mode semantics (kept aligned with the server-side contract):
  //   - Chat: bot is a conversation-level setting for saved chats. Private
  //     chats use the same Chat-mode request contract but send prior
  //     messages back as `ephemeralMessages`, so the server can continue
  //     the in-memory session without writing rows.
  //   - Sandbox: regular sends keep the existing per-send bot picker and
  //     thread-only memory behavior. Private sends intentionally reuse the
  //     Chat-mode incognito contract so they stay ephemeral/no-memory while
  //     keeping the selected bot as prompt identity.
  function buildChatRequestBody(
    message: string,
    options: {
      starterPrompt?: boolean;
      ephemeralMessages?: Message[];
    } = {}
  ): Record<string, unknown> {
    const isChatMode = view === "chat";
    const privateForSend = detail?.incognito === true || pendingIncognito;
    const mode: "chat" | "sandbox" =
      isChatMode || privateForSend ? "chat" : "sandbox";
    // Resolve effective bot. Chat-mode priority is:
    //   1. chatBotOverride (mid-thread dropdown pick; string = specific,
    //      null = "Default persona"). `undefined` means "no pending
    //      pick, just use whatever the conversation already resolves
    //      to", which keeps the send idempotent on bot_id when the
    //      user hasn't touched the dropdown.
    //   2. detail.botId (the conversation's persisted bot, if any).
    //   3. selectedBotId (empty-state picker for brand-new chats).
    //   4. null — sent explicitly so the server's three-valued botId
    //      parse can persist a demotion to Default. Contrast with
    //      Sandbox below, which still drops the key (legacy behavior:
    //      Sandbox doesn't touch conversation.bot_id persistence).
    const chatBotId: string | null =
      chatBotOverride !== undefined
        ? chatBotOverride
        : (detail?.botId ?? selectedBotId ?? null);
    // Private chats do not override the provider; they only change the
    // persistence/memory path.
    const providerForSend = settings?.preferredProvider;
    const modelChoice = providerForSend
      ? visibleBotCustomizerModelChoice(
          settings,
          chatModelChoiceByProvider[providerForSend]
        )
      : AUTO_MODEL_CHOICE;
    const modelOverride =
      modelChoice !== AUTO_MODEL_CHOICE
        ? modelChoice
        : undefined;
    return {
      conversationId: selectedId ?? undefined,
      message,
      ...(options.starterPrompt ? { starterPrompt: true } : {}),
      mode,
      // Chat mode ALWAYS sends botId (string or null) so the server can
      // persist mid-thread switches. Private sends also send botId, but the
      // server treats it as prompt identity only: no conversation/message rows,
      // memory writes, or summaries are created. Regular Sandbox keeps the
      // legacy "undefined drops the key" behavior since its bot picks never
      // write back to conversations.bot_id.
      botId: isChatMode || privateForSend ? chatBotId : (selectedBotId ?? undefined),
      ...(mode === "chat" ? { incognito: privateForSend } : {}),
      ...(privateForSend
        ? { ephemeralMessages: options.ephemeralMessages ?? detail?.messages ?? [] }
        : {}),
      preferredProvider: providerForSend,
      ...(modelOverride ? { modelOverride } : {}),
    };
  }

  function beginEditMessage(msg: Message): void {
    closeMessageContextOverlay();
    setEditingMessageId(msg.id);
    setEditingOriginalText(msg.content);
    setDraft(msg.content);
    queueMicrotask(() => draftComposerRef.current?.focus());
  }

  function cancelEditMessage(): void {
    setEditingMessageId(null);
    setEditingOriginalText("");
    setDraft("");
  }

  async function performMessageEdit(messageId: string, text: string): Promise<void> {
    if (!detail || !selectedId) return;
    const cutoffIdx = detail.messages.findIndex((message) => message.id === messageId);
    if (cutoffIdx < 0) return;

    setPendingReply(true);
    setPendingReplyIsNewConversation(false);
    setError(null);
    const previousDetail = detail;
    const rewoundMessages = previousDetail.messages.slice(0, cutoffIdx);
    const optimisticEditedMessage: Message = {
      id: messageId,
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    let editedConversation: ConversationDetail | null = null;
    try {
      if (previousDetail.incognito) {
        setPendingReplyConversationId(previousDetail.id);
        setDetail({
          ...previousDetail,
          messages: [...rewoundMessages, optimisticEditedMessage],
        });
        const d = await api<ChatPostEnvelope>("/api/chat", {
          method: "POST",
          body: JSON.stringify(
            buildChatRequestBody(text, {
              ephemeralMessages: rewoundMessages,
            })
          ),
        });
        pushMemoryToasts(d.memoryLearned);
        setDetail(d.conversation);
        editedConversation = d.conversation;
      } else {
        setPendingReplyConversationId(selectedId);
        setDetail({
          ...previousDetail,
          messages: [...rewoundMessages, optimisticEditedMessage],
        });
        await api<{
          ok: true;
          message: string;
          deletedMessages: number;
          deletedMemories: number;
        }>(
          `/api/conversations/${selectedId}/rewind`,
          {
            method: "POST",
            body: JSON.stringify({ messageId }),
          }
        );
        const d = await api<ChatPostEnvelope>("/api/chat", {
          method: "POST",
          body: JSON.stringify(buildChatRequestBody(text)),
        });
        pushMemoryToasts(d.memoryLearned);
        setDetail(d.conversation);
        editedConversation = d.conversation;
      }
      setEditingMessageId(null);
      setEditingOriginalText("");
      setDraft("");
      await refreshConversations();
      if (
        editedConversation &&
        !editedConversation.incognito &&
        editedConversation.messages.filter((message) => message.role === "assistant").length === 1
      ) {
        for (const delayMs of AUTO_TITLE_REFRESH_DELAYS_MS) {
          window.setTimeout(() => {
            void refreshConversations();
          }, delayMs);
        }
      }
      await refreshOpenMemoryViews();
    } catch (err) {
      setDetail(previousDetail);
      setError(err instanceof Error ? err.message : "Message edit failed.");
    } finally {
      setPendingReply(false);
      setPendingReplyConversationId(null);
      setPendingReplyIsNewConversation(false);
    }
  }

  function requestMessageEdit(messageId: string, text: string): void {
    void performMessageEdit(messageId, text);
  }

  async function sendMessage(
    e: React.FormEvent | React.KeyboardEvent<HTMLTextAreaElement | HTMLFormElement>,
    options: { starterPrompt?: boolean; draftOverride?: string } = {}
  ) {
    e.preventDefault();
    const rawDraft = options.draftOverride ?? draft;
    const trimmed = rawDraft.trim();
    const isStarterPrompt =
      options.starterPrompt === true &&
      (!detail || detail.messages.length === 0);
    if ((!trimmed && !isStarterPrompt) || pendingReply) return;
    if (editingMessageId && !isStarterPrompt) {
      requestMessageEdit(editingMessageId, trimmed);
      return;
    }
    // Any typed/chosen follow-up supersedes the starter quick-replies row.
    if (!isStarterPrompt) {
      setConversationStarterPrompts(null);
    }
    const requestConversationId =
      detail?.id && detail.id !== "pending"
        ? detail.id
        : selectedId;
    const requestStartedNewConversation = requestConversationId === null;
    setPendingReply(true);
    setPendingReplyConversationId(requestConversationId);
    setPendingReplyIsNewConversation(requestStartedNewConversation);
    setError(null);

    const previousDetail = detail;
    const previousPendingIncognito = pendingIncognito;
    const optimisticIncognito = detail?.incognito === true || pendingIncognito;
    const optimisticBotId =
      detail?.botId ?? ((view === "chat" || optimisticIncognito) ? selectedBotId ?? null : null);
    const optimisticLastBotId =
      detail?.lastBotId ??
      (view === "sandbox" && !optimisticIncognito ? selectedBotId ?? null : optimisticBotId);
    const optimisticLastBotColor =
      detail?.lastBotColor
      ?? (optimisticLastBotId
            ? bots.find(b => b.id === optimisticLastBotId)?.color ?? null
            : null);
    if (isStarterPrompt && requestStartedNewConversation) {
      setDetail({
        id: "pending",
        title: "New chat",
        botId: optimisticBotId,
        incognito: optimisticIncognito,
        lastBotId: optimisticLastBotId,
        lastBotColor: optimisticLastBotColor,
        hasAssistantReply: false,
        messages: [],
      });
    } else if (!isStarterPrompt) {
      const optimisticMessage: Message = {
        id: `pending-${Date.now()}`,
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const optimisticTitle =
        detail?.title ?? (trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed);
      // Forward the chat-mode conversation-level settings (bot + privacy)
      // into the optimistic detail so the shell accent + privacy affordances
      // don't flicker between send and server reply. Once the server answers
      // with the persisted row, this optimistic detail is replaced.
      // For lastBot*, keep whatever the current detail had. Our optimistic
      // update adds a USER message, not an assistant one, so "last bot to
      // speak" hasn't changed — the real update lands when the server's
      // assistant reply comes back. In Sandbox where the user can switch
      // bots per-send, we preview the new pick via the "about to speak"
      // selectedBotId so the sidebar row hints at the next color before
      // the reply lands; the server value overrides on response.
      setDetail({
        id: detail?.id ?? "pending",
        title: optimisticTitle,
        botId: optimisticBotId,
        incognito: optimisticIncognito,
        lastBotId: optimisticLastBotId,
        lastBotColor: optimisticLastBotColor,
        // hasAssistantReply reflects the PRE-SEND state (whatever detail
        // already had) — the optimistic update only inserts a USER
        // message, not an assistant one. The server's real response
        // flips this to true once the assistant reply is in the db.
        hasAssistantReply: detail?.hasAssistantReply ?? false,
        messages: [...(detail?.messages ?? []), optimisticMessage],
      });
    }
    setDraft("");

    try {
      const d = await api<ChatPostEnvelope>("/api/chat", {
        method: "POST",
        body: JSON.stringify(
          buildChatRequestBody(isStarterPrompt ? "" : trimmed, {
            starterPrompt: isStarterPrompt,
          })
        ),
      });
      pushMemoryToasts(d.memoryLearned);
      const stillViewingRequest = requestConversationId
        ? selectedIdRef.current === requestConversationId ||
          detailIdRef.current === requestConversationId
        : selectedIdRef.current === null && detailIdRef.current === "pending";
      if (stillViewingRequest) {
        setDetail(d.conversation);
        setSelectedId(d.conversation.id);
        setUnreadConversationIds(previous => {
          if (!previous.has(d.conversation.id)) return previous;
          const next = new Set(previous);
          next.delete(d.conversation.id);
          return next;
        });
        setUnreadConversationOrder(previous =>
          previous.includes(d.conversation.id)
            ? previous.filter(id => id !== d.conversation.id)
            : previous
        );
      } else if (!d.conversation.incognito) {
        setUnreadConversationIds(previous => {
          const next = new Set(previous);
          next.add(d.conversation.id);
          return next;
        });
        setUnreadConversationOrder(previous =>
          previous.includes(d.conversation.id)
            ? previous
            : [...previous, d.conversation.id]
        );
      }
      if (stillViewingRequest && isStarterPrompt) {
        if (
          Array.isArray(d.conversationStarters) &&
          d.conversationStarters.length >= 3
        ) {
          setConversationStarterPrompts({
            conversationId: d.conversation.id,
            prompts: d.conversationStarters.slice(0, 4),
          });
        } else {
          setConversationStarterPrompts(null);
        }
      }
      // Pending private intent has now become the open detail returned by
      // the server. For private chats that detail is ephemeral, not a saved
      // conversation row, but detail.incognito keeps the UI isolated.
      if (pendingIncognito && stillViewingRequest) setPendingIncognito(false);
      // Server truth now reflects the user's pick, so the mid-thread
      // override is redundant — drop it so the dropdown goes back to
      // mirroring detail.botId cleanly. Only fires when an override was
      // actually set (keeps the state update a no-op in the common case).
      if (chatBotOverride !== undefined && stillViewingRequest) setChatBotOverride(undefined);
      const refreshedConversations = await refreshConversations();
      // Auto-drill into the new chat's bot panel after a brand-new chat
      // commits. Two halves of the same rule:
      //   • new chat with bot X and X has 2+ saved chats now (group exists)
      //     → open `bot:X` panel so the user lands inside it.
      //   • new chat with no bot, or a bot that doesn't form a group yet
      //     → close any open group panel so the new chat stays visible at
      //     the top level instead of being hidden behind a stale drill-in.
      // Gated on `stillViewingRequest` so a backgrounded send that lands
      // after the user navigated elsewhere never yanks the sidebar. The
      // functional setter makes the "already viewing this bot's panel"
      // case a free no-op.
      if (
        stillViewingRequest &&
        requestStartedNewConversation &&
        !d.conversation.incognito
      ) {
        const newBotId = d.conversation.botId;
        let nextOpenKey: string | null = null;
        if (newBotId) {
          const sameBotCount = refreshedConversations.filter(
            (c) => c.botId === newBotId && !c.incognito,
          ).length;
          if (sameBotCount >= 2) {
            nextOpenKey = conversationGroupKeyForBotId(newBotId);
          }
        }
        setOpenConversationGroupKey((prev) =>
          prev === nextOpenKey ? prev : nextOpenKey,
        );
      }
      if (
        !d.conversation.incognito &&
        d.conversation.messages.filter((message) => message.role === "assistant").length === 1
      ) {
        for (const delayMs of AUTO_TITLE_REFRESH_DELAYS_MS) {
          window.setTimeout(() => {
            void refreshConversations();
          }, delayMs);
        }
      }
      await refreshOpenMemoryViews();
      if (stillViewingRequest) {
        const nextBotId = d.conversation.lastBotId ?? d.conversation.botId;
        if (memoryPanelScope === "default") {
          await refreshDefaultMemories();
        } else if (nextBotId) {
          await refreshBotMemories(nextBotId);
        } else {
          setBotMemories([]);
        }
      }
    } catch (err) {
      const stillViewingRequest = requestConversationId
        ? selectedIdRef.current === requestConversationId ||
          detailIdRef.current === requestConversationId
        : selectedIdRef.current === null && detailIdRef.current === "pending";
      if (stillViewingRequest) {
        setDetail(previousDetail);
        setPendingIncognito(previousPendingIncognito);
        setDraft(isStarterPrompt ? "" : trimmed);
      }
      setError(
        err instanceof Error
          ? err.message
          : "Send failed. Verify the provider is reachable and try again."
      );
    } finally {
      setPendingReply(false);
      setPendingReplyConversationId(null);
      setPendingReplyIsNewConversation(false);
    }
  }

  function handleConversationStarterPick(prompt: string): void {
    setConversationStarterPrompts(null);
    const syntheticSubmit = {
      preventDefault: () => {
        /* no-op — used so sendMessage can share the submit pathway */
      },
    } as React.FormEvent<HTMLFormElement>;
    void sendMessage(syntheticSubmit, { draftOverride: prompt });
  }

  function randomChatNudgeFromContext(): string {
    const activeBotId =
      chatBotOverride !== undefined ? chatBotOverride : detail?.botId ?? selectedBotId ?? null;
    const activeBotName =
      activeBotId !== null
        ? bots.find((candidate) => candidate.id === activeBotId)?.name ?? "this bot"
        : "you";
    const latestAssistant = [...(detail?.messages ?? [])]
      .reverse()
      .find((message) => message.role === "assistant");
    const candidateTopicWords =
      latestAssistant?.content
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 5)
        .filter((word) => !RANDOM_NUDGE_STOP_WORDS.has(word)) ?? [];
    const topicSeed = candidateTopicWords[0] ?? "that";
    const templates = [
      `Give me one surprising angle on ${topicSeed}.`,
      `Ask me a thoughtful follow-up about ${topicSeed}.`,
      `Challenge my thinking on ${topicSeed} in one short question.`,
      `Teach me ${topicSeed} with a playful metaphor.`,
      `What should I explore next with ${activeBotName}?`,
      "Give me one tiny action I can do in the next 2 minutes.",
    ];
    return randomArrayItem(templates);
  }

  function sendRandomConversationNudge(): void {
    if (pendingReply) return;
    const starterPromptChoices =
      conversationStarterPrompts &&
      detail?.id &&
      detail.id !== "pending" &&
      detail.id === conversationStarterPrompts.conversationId
        ? conversationStarterPrompts.prompts
        : [];
    const chosenPrompt =
      starterPromptChoices.length > 0
        ? randomArrayItem(starterPromptChoices)
        : randomChatNudgeFromContext();
    const syntheticSubmit = {
      preventDefault: () => {
        /* no-op — used so sendMessage can share the submit pathway */
      },
    } as React.FormEvent<HTMLFormElement>;
    void sendMessage(syntheticSubmit, { draftOverride: chosenPrompt });
  }

  function renderConversationStarterRail(): React.ReactNode {
    const ready =
      conversationStarterPrompts &&
      detail?.id !== undefined &&
      detail.id !== "pending" &&
      detail.id === conversationStarterPrompts.conversationId &&
      conversationStarterPrompts.prompts.length > 0;
    if (!ready || !conversationStarterPrompts) {
      return null;
    }
    const { prompts } = conversationStarterPrompts;
    return (
      <div
        role="group"
        aria-label="Suggested replies"
        className={styles.conversationStarterRail}
      >
        {prompts.map((prompt, chipIndex) => (
          <button
            key={`${prompt.slice(0, 48)}-${chipIndex}`}
            type="button"
            disabled={pendingReply}
            className={styles.conversationStarterChip}
            onClick={() => handleConversationStarterPick(prompt)}
          >
            {prompt}
          </button>
        ))}
      </div>
    );
  }

  function isStarterPromptAvailable(value: string): boolean {
    return value.trim().length === 0 && (!detail || detail.messages.length === 0);
  }

  function isStarterPromptReady(value: string): boolean {
    return composerPrimed && isStarterPromptAvailable(value);
  }

  function composerSubmitLabel(value: string): string {
    if (editingMessageId) return "Save edit";
    return value.trim().length > 0 ? "Send" : "";
  }

  function composerSubmitDisabled(value: string): boolean {
    return (
      pendingReply ||
      value.trim().length === 0 ||
      (editingMessageId !== null && value.trim() === editingOriginalText.trim())
    );
  }

  function handleComposerSubmit(e: React.FormEvent<HTMLFormElement>) {
    void sendMessage(e, {
      starterPrompt: isStarterPromptReady(draft),
    });
  }

  const primeStarterComposer = useCallback((value: string) => {
    if (value.trim().length === 0 && (!detail || detail.messages.length === 0)) {
      setComposerPrimed(true);
    }
  }, [detail]);

  function updateComposerDraft(nextDraft: string) {
    setDraft(nextDraft);
  }

  function handleComposerChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    updateComposerDraft(e.currentTarget.value);
  }

  function handleComposerFocus() {
    setComposerFocused(true);
  }

  function handleComposerBlur(e: React.FocusEvent<HTMLFormElement>) {
    const nextFocus = e.relatedTarget;
    if (nextFocus instanceof Node && e.currentTarget.contains(nextFocus)) return;
    setComposerFocused(false);
    setComposerPrimed(false);
  }

  function handleComposerKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const fromMarkdownEditor = target.closest("[data-markdown-cm-host='true']") !== null;
    const fromPlainTextarea = target instanceof HTMLTextAreaElement;
    if (fromMarkdownEditor) return;
    if (!fromMarkdownEditor && !fromPlainTextarea) return;
    e.preventDefault();
    void sendMessage(e, {
      starterPrompt: isStarterPromptReady(draft),
    });
  }

  /** Narrow screens omit the Send pill while empty — IME “send” / Enter submits. */
  const hideMobileEmptySend =
    viewportWidth <= PICKER_MOBILE_BREAKPOINT && draft.trim().length === 0;

  function startFreshConversation(privateMode: boolean) {
    const normalStarterBotId = detail
      ? chatBotOverride !== undefined
        ? chatBotOverride
        : detail.botId
      : selectedBotId;
    const privateStarterBotId = privateMode
      ? chatBotOverride !== undefined
        ? chatBotOverride
        : detail?.botId ?? selectedBotId
      : null;
    const starterBotId = privateMode ? privateStarterBotId : normalStarterBotId;
    // A selected Chat-mode bot should leave the picker surface immediately;
    // the real saved conversation is still created by the first send.
    const draftConversation: ConversationDetail | null =
      view === "chat" && !privateMode && starterBotId
        ? {
            id: "pending",
            title: "New chat",
            botId: starterBotId,
            incognito: false,
            lastBotId: starterBotId,
            lastBotColor: bots.find((bot) => bot.id === starterBotId)?.color ?? null,
            hasAssistantReply: false,
            messages: [],
          }
        : null;
    setConversationStarterPrompts(null);
    setSelectedId(null);
    setDetail(draftConversation);
    setSelectedBotId(starterBotId);
    setChatBotOverride(undefined);
    closeEmptyStateBotSearch();
    if (hueFilterCenter !== null) {
      startBotPickerReturnToAll();
    } else {
      setHueFilterCenter(null);
    }
    setPendingIncognito(privateMode);
    setSidebarOpen(false);
  }

  function resetChatHeaderToNewChat() {
    if (!detail && selectedBotId !== null) {
      resetEmptyStateToPrismHome();
      setComposerPrimed(false);
      return;
    }
    startFreshConversation(false);
    setComposerPrimed(false);
  }

  /** Click-to-start: dispatches a starter prompt request as if the user typed
   *  nothing and submitted. The bot (or default Prism) opens the conversation
   *  with its own first message. */
  function handleHeroStartConversation(
    event: React.MouseEvent<HTMLButtonElement>
  ): void {
    event.stopPropagation();
    if (pendingReply) return;
    if (!isStarterPromptAvailable(draft)) return;
    void sendMessage(
      { preventDefault: () => {} } as React.FormEvent<HTMLFormElement>,
      { starterPrompt: true }
    );
  }

  function resetChatHeaderToSpotlight() {
    startFreshConversation(false);
    setComposerPrimed(false);
    showEmptyStateSearchAfterReturn();
  }

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setBusy(true);
    setPanelError(null);
    try {
      // Only include the key field when the user typed something; otherwise
      // the backend would have no way to tell "no change" apart from "clear".
      // Server re-sanitizes via `sanitizeOpenAiKeyInput`, so a paste of
      // `OPENAI_API_KEY=sk-...` (or a quoted variant) is stripped before
      // it ever gets encrypted into the user row.
      const body: Record<string, unknown> = { ...settings };
      const trimmedKey = openAiKey.trim();
      if (trimmedKey.length > 0) {
        body.openAiApiKey = trimmedKey;
      }
      await api("/api/settings", { method: "PATCH", body: JSON.stringify(body) });
      setOpenAiKey("");
      await Promise.all([refreshSettings(), refreshModels()]);
      await refreshSecondaryOllamaStatus();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  function setBotCustomizerModelVisible(modelId: string, visible: boolean) {
    if (modelId === REQUIRED_PRIMARY_LOCAL_MODEL_ID) {
      return;
    }
    if (!visible) {
      setNewBotLocalModel((current) =>
        current === modelId ? AUTO_MODEL_CHOICE : current
      );
      setNewBotOnlineModel((current) =>
        current === modelId ? AUTO_MODEL_CHOICE : current
      );
    }
    setSettings((previous) => {
      if (!previous) return previous;
      const current = new Set(previous.hiddenBotModelIds ?? []);
      if (visible) {
        current.delete(modelId);
      } else {
        current.add(modelId);
      }
      return {
        ...previous,
        hiddenBotModelIds: Array.from(current),
      };
    });
  }

  async function generatePairingCode() {
    setPairingBusy(true);
    setPairingCopyStatus(null);
    setPanelError(null);
    try {
      const response = await api<{ pairingCode: PairingCode }>(
        "/api/pairing/codes",
        { method: "POST" }
      );
      setPairingCode(response.pairingCode);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Pairing code failed.");
    } finally {
      setPairingBusy(false);
    }
  }

  async function copyPairingCode() {
    if (!pairingCode) return;
    try {
      await writeClipboardText(pairingCode.code);
      setPairingCopyStatus("Copied");
    } catch {
      setPanelError("Copy failed. Select the code and copy it manually.");
    }
  }

  function formatPairingExpiry(expiresAt: string): string {
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) {
      return "Expires soon";
    }
    return `Expires at ${expiry.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  async function switchProvider(provider: Provider) {
    if (!settings || settings.preferredProvider === provider) return;
    const previous = settings;
    // Optimistically flip the UI; a failed PATCH rolls back.
    setSettings({ ...settings, preferredProvider: provider });
    setError(null);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ preferredProvider: provider }),
      });
      await refreshSettings();
    } catch (err) {
      setSettings(previous);
      setError(err instanceof Error ? err.message : "Provider switch failed.");
    }
  }

  async function cycleThemeMode() {
    const nextTheme = nextThemeMode(effectiveThemeMode);

    if (settings) {
      // Logged in: persist the choice server-side, optimistically update the UI.
      const previous = settings;
      setSettings({ ...settings, theme: nextTheme });
      setError(null);
      try {
        await api("/api/settings", {
          method: "PATCH",
          body: JSON.stringify({ theme: nextTheme }),
        });
        await refreshSettings();
      } catch (err) {
        setSettings(previous);
        setError(err instanceof Error ? err.message : "Theme switch failed.");
      }
      return;
    }

    // Pre-auth: stash in localStorage so the choice survives reloads and
    // seeds the new user's theme if they register next.
    setPreAuthTheme(nextTheme);
    try {
      window.localStorage.setItem("prism_theme", nextTheme);
    } catch {
      // Non-fatal: if storage is blocked the toggle still works in-memory.
    }
  }

  async function clearSavedKey() {
    const confirmed = window.confirm(
      "Remove the saved OpenAI API key from this account? Chat will fall back to the server default if one is configured."
    );
    if (!confirmed) return;
    setBusy(true);
    setPanelError(null);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ openAiApiKey: null }),
      });
      setOpenAiKey("");
      await refreshSettings();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Clear failed.");
    } finally {
      setBusy(false);
    }
  }

  function memoryToastScopeLabel(memory: MemoryEventPayload): string {
    if (!memory.botId) return "Global";
    return bots.find((bot) => bot.id === memory.botId)?.name ?? "Bot";
  }

  function pushMemoryToasts(memoryLearned: ChatPostEnvelope["memoryLearned"]): void {
    const created = memoryLearned?.created ?? [];
    const retracted = memoryLearned?.retracted ?? [];
    const rejected = memoryLearned?.rejected ?? [];
    if (created.length === 0 && retracted.length === 0 && rejected.length === 0) return;

    const now = Date.now();
    const nextToasts: MemoryToast[] = [
      ...created.map((memory) => ({
        id: `created:${memory.id}:${now}`,
        kind: "created" as const,
        memory,
        expiresAt: now + MEMORY_TOAST_DISMISS_MS,
      })),
      ...retracted.map((memory) => ({
        id: `retracted:${memory.id}:${now}`,
        kind: "retracted" as const,
        memory,
        expiresAt: now + MEMORY_TOAST_DISMISS_MS,
      })),
      ...rejected.map((memory, index) => ({
        id: `rejected:${index}:${now}`,
        kind: "rejected" as const,
        rejected: memory,
        expiresAt: now + MEMORY_TOAST_DISMISS_MS,
      })),
    ];
    setMemoryToasts((current) => [...nextToasts, ...current].slice(0, 8));
  }

  async function undoMemoryToast(toast: MemoryToast) {
    setMemoryToasts((current) => current.filter((item) => item.id !== toast.id));
    if (toast.kind === "rejected") return;
    if (toast.kind === "created") {
      await api(`/api/memories/${toast.memory.id}`, { method: "DELETE" });
    } else {
      await api("/api/memories/restore", {
        method: "POST",
        body: JSON.stringify({
          text: toast.memory.text,
          botId: toast.memory.botId,
          conversationId: toast.memory.conversationId,
          confidence: toast.memory.confidence,
          source: toast.memory.source,
          certainty: toast.memory.certainty,
          sourceMessageIds: toast.memory.sourceMessageIds ?? [],
        }),
      });
    }
    await refreshOpenMemoryViews();
  }

  function memoryToastTitle(toast: MemoryToast): string {
    if (toast.kind === "rejected") return "Memory skipped";
    const memory = toast.memory;
    if (toast.kind === "created" && memory.validationStatus === "auto_fixed") {
      return "Memory cleaned up";
    }
    return toast.kind === "created" ? "Memory saved" : "Memory forgotten";
  }

  function memoryToastDetail(toast: MemoryToast): string {
    if (toast.kind === "rejected") {
      return `Not saved · ${toast.rejected.originalText}`;
    }
    const memory = toast.memory;
    const prefix =
      toast.kind === "created" && memory.validationStatus === "auto_fixed"
        ? "edited for clarity"
        : "tap to undo";
    return `${memoryToastScopeLabel(memory)} · ${prefix} · ${memory.text}`;
  }

  async function deleteMemory(id: string) {
    await api(`/api/memories/${id}`, { method: "DELETE" });
    setFocusedMemoryId((current) => (current === id ? null : current));
    await refreshOpenMemoryViews();
  }

  // Fork is always anchored to an assistant bubble now (per-message
  // "Fork here" is the only entry point), so `messageId` is mandatory.
  // The backend endpoint remains tolerant of a missing id for
  // compatibility with older clients; the client-side tightening just
  // removes the whole-conversation clone code path we're no longer
  // exposing.
  async function forkChat(messageId: string) {
    if (!selectedId) return;
    const d = await api<{ conversationId: string }>(`/api/conversations/${selectedId}/fork`, { method: "POST", body: JSON.stringify({ messageId }) });
    await refreshConversations(); await refreshConversation(d.conversationId);
  }

  async function copyMessageToClipboard(msg: Message): Promise<void> {
    try {
      await writeClipboardText(msg.content);
      setCopiedMessageId(msg.id);
      if (copiedMessageTimerRef.current) {
        clearTimeout(copiedMessageTimerRef.current);
      }
      copiedMessageTimerRef.current = setTimeout(() => {
        setCopiedMessageId(current => current === msg.id ? null : current);
        copiedMessageTimerRef.current = null;
      }, MESSAGE_COPY_FEEDBACK_MS);
    } catch {
      setError("Copy failed. Select the message and copy it manually.");
    }
  }

  const closeMessageContextOverlay = useCallback(() => {
    setMessageContextMenu(null);
    setContextFocusedMessageId(null);
    setMobileFocusedMessageId(null);
    setModelRevealMessageId(null);
  }, []);

  const openBotContextMenu = useCallback((bot: Bot, x: number, y: number) => {
    setBotContextMenu({ botId: bot.id, x, y });
    closeMessageContextOverlay();
    setChatOverflowMenuOpen(false);
  }, [closeMessageContextOverlay]);

  const startBotContextLongPress = useCallback((
    event: React.PointerEvent<HTMLElement>,
    bot: Bot
  ) => {
    if (event.pointerType !== "touch") return;
    cancelBotContextLongPress();
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const timer = setTimeout(() => {
      botContextSuppressClickRef.current = true;
      botContextLongPressRef.current = null;
      openBotContextMenu(bot, startX, startY);
    }, BOT_CONTEXT_LONG_PRESS_MS);
    botContextLongPressRef.current = {
      pointerId,
      botId: bot.id,
      timer,
      startX,
      startY,
    };
  }, [cancelBotContextLongPress, openBotContextMenu]);

  const handleBotContextPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const pending = botContextLongPressRef.current;
    if (!pending || pending.pointerId !== event.pointerId) return;
    const dx = event.clientX - pending.startX;
    const dy = event.clientY - pending.startY;
    if (Math.hypot(dx, dy) > BOT_CONTEXT_LONG_PRESS_MOVE_CANCEL_PX) {
      cancelBotContextLongPress(event.pointerId);
    }
  }, [cancelBotContextLongPress]);

  const handleBotContextPointerEnd = useCallback((event: React.PointerEvent<HTMLElement>) => {
    cancelBotContextLongPress(event.pointerId);
  }, [cancelBotContextLongPress]);

  useEffect(() => {
    if (!botContextMenu) return;
    if (!bots.some((bot) => bot.id === botContextMenu.botId)) {
      closeBotContextMenu();
    }
  }, [botContextMenu, bots, closeBotContextMenu]);

  useEffect(() => {
    if (!botContextMenu) return;

    function handlePointerDown(event: PointerEvent) {
      if (!isPrimaryPointerDismissal(event)) return;
      const target = event.target;
      if (target instanceof Node && botContextMenuRef.current?.contains(target)) {
        return;
      }
      closeBotContextMenu();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeBotContextMenu();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [botContextMenu, closeBotContextMenu]);

  // Mobile spotlight: backdrop is visually present but ignores pointer-events so the
  // focused bubble stays tappable; we dismiss on taps outside bubble + menu.
  useEffect(() => {
    if (!mobileFocusedMessageId || !messageContextMenu) return;
    const onPointerDownCapture = (event: PointerEvent) => {
      if (!isPrimaryPointerDismissal(event)) return;
      const node = event.target as Node | null;
      const menuRoot = messageActionsMenuRef.current;
      if (node && menuRoot?.contains(node)) return;
      const focusRoot =
        typeof document !== "undefined"
          ? document.querySelector("[data-msg-mobile-focus-root='true']")
          : null;
      if (node && focusRoot?.contains(node)) return;
      closeMessageContextOverlay();
    };
    document.addEventListener("pointerdown", onPointerDownCapture, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
  }, [mobileFocusedMessageId, messageContextMenu, closeMessageContextOverlay]);

  const openMessageContextMenu = useCallback(
    (
      msg: Message,
      x: number,
      y: number,
      opts?: {
        anchor?: MessageMenuAnchor;
        mobileActivate?: boolean;
      }
    ) => {
      const anchor: MessageMenuAnchor = opts?.anchor ?? "center";
      const minY = anchor === "below" ? 64 : 96;
      const maxY = anchor === "below" ? window.innerHeight - 120 : window.innerHeight - 96;
      setMessageContextMenu({
        message: msg,
        x: Math.min(Math.max(x, 88), window.innerWidth - 88),
        y: Math.min(Math.max(y, minY), maxY),
        anchor,
      });
      setContextFocusedMessageId(msg.id);
      setModelRevealMessageId(msg.role === "assistant" ? msg.id : null);

      const vpMobile = viewportWidth <= PICKER_MOBILE_BREAKPOINT;
      if (opts?.mobileActivate && vpMobile) {
        setMobileFocusedMessageId(msg.id);
      }
    },
    [viewportWidth]
  );

  async function exportChat() {
    if (!selectedId) return;
    const d = await api<{ markdown: string }>(`/api/conversations/${selectedId}/export`, { method: "POST", body: "{}" });
    const blob = new Blob([d.markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `chat-${selectedId}.md`; a.click(); URL.revokeObjectURL(url);
  }

  const resetEmptyStateBotSelection = useCallback(() => {
    cancelPendingEmptyStateSearchOpen();
    setSelectedBotId(null);
  }, [cancelPendingEmptyStateSearchOpen]);

  const handleEmptyStateBackgroundClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (detail || pendingIncognito) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const interactiveTarget = target.closest(
      "button, input, textarea, select, a, [role='button'], [data-starter-bot-affordance='true']"
    );
    if (interactiveTarget) return;
    if (selectedBotId !== null) {
      resetEmptyStateBotSelection();
      return;
    }
    if (hueFilterCenter !== null) {
      setEmptyStateSearchOpen(false);
      setEmptyStateBotNameFilter("");
      startBotPickerReturnToAll();
    }
  }, [
    detail,
    hueFilterCenter,
    pendingIncognito,
    resetEmptyStateBotSelection,
    selectedBotId,
    startBotPickerReturnToAll,
  ]);

  const openEmptyStateBotSearch = useCallback(() => {
    cancelPendingEmptyStateSearchOpen();
    setSelectedBotId(null);
    if (botPickerReturnEndAtRef.current > Date.now()) return;
    if (emptyStateSearchActive) {
      setEmptyStateSearchOpen(false);
      setEmptyStateBotNameFilter("");
      return;
    }
    if (hueFilterCenter !== null) {
      setEmptyStateSearchOpen(false);
      setEmptyStateBotNameFilter("");
      startBotPickerReturnToAll();
      return;
    }
    setHueFilterCenter(null);
    setEmptyStateSearchOpen(true);
  }, [cancelPendingEmptyStateSearchOpen, emptyStateSearchActive, hueFilterCenter, startBotPickerReturnToAll]);

  const closeEmptyStateBotSearch = useCallback(() => {
    cancelPendingEmptyStateSearchOpen();
    setEmptyStateSearchOpen(false);
    setEmptyStateBotNameFilter("");
  }, [cancelPendingEmptyStateSearchOpen]);

  function resetEmptyStateToPrismHome(): void {
    closeEmptyStateBotSearch();
    resetEmptyStateBotSelection();
    setPendingIncognito(false);
    if (hueFilterCenter !== null) {
      startBotPickerReturnToAll();
    } else {
      setHueFilterCenter(null);
    }
  }

  const focusDraftInput = useCallback(() => {
    window.setTimeout(() => {
      draftComposerRef.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const closeEmptyStateBotSearchAndFocusDraft = useCallback(() => {
    closeEmptyStateBotSearch();
    focusDraftInput();
  }, [closeEmptyStateBotSearch, focusDraftInput]);

  const commitEmptyStateBotSelection = useCallback((botId: string) => {
    cancelPendingEmptyStateSearchOpen();
    // Committing a bot exits visible lens mode, but keeps the current
    // filtered/zoomed bot view intact. `emptyStateLensVisible` hides the
    // slider while `shellStyle` lets the selected bot own the interface
    // color, so the hue lens no longer competes with the bot accent.
    setSelectedBotId(botId);
    setEmptyStateSearchOpen(false);
    setEmptyStateBotNameFilter("");
    focusDraftInput();
  }, [cancelPendingEmptyStateSearchOpen, focusDraftInput]);

  const openEmptyStateBotSearchFromTyping = useCallback((typedCharacter: string) => {
    cancelPendingEmptyStateSearchOpen();
    setSelectedBotId(null);
    setEmptyStateBotNameFilter((current) =>
      current.length > 0 ? `${current}${typedCharacter}` : typedCharacter
    );
    if (hueFilterCenter !== null) {
      setEmptyStateSearchOpen(false);
      startBotPickerReturnToAll();
      showEmptyStateSearchAfterReturn();
      return;
    }
    setHueFilterCenter(null);
    showEmptyStateSearchAfterReturn();
  }, [
    cancelPendingEmptyStateSearchOpen,
    hueFilterCenter,
    showEmptyStateSearchAfterReturn,
    startBotPickerReturnToAll,
  ]);

  useEffect(() => {
    if (!emptyStateTypingSearchAvailable) return;
    function handlePageTyping(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const activeElement = document.activeElement;
      if (event.key === "Tab") {
        const spotlightInput = emptyStateSearchInputRef.current;
        const focusSpotlight = () => {
          if (hueFilterCenter !== null) {
            setEmptyStateSearchOpen(false);
            startBotPickerReturnToAll();
            focusEmptyStateSearchAfterReturn();
            return;
          }
          setHueFilterCenter(null);
          setEmptyStateSearchOpen(true);
          window.setTimeout(() => {
            spotlightInput?.focus({ preventScroll: true });
          }, 0);
        };

        event.preventDefault();
        if (!emptyStateSearchActive) {
          focusSpotlight();
          return;
        }
        if (activeElement === spotlightInput) {
          closeEmptyStateBotSearchAndFocusDraft();
          return;
        }
        spotlightInput?.focus({ preventScroll: true });
        return;
      }
      const activeElementIsEditable =
        activeElement instanceof HTMLElement &&
        (
          activeElement.isContentEditable ||
          activeElement instanceof HTMLInputElement ||
          activeElement instanceof HTMLTextAreaElement ||
          activeElement instanceof HTMLSelectElement
        );
      if (activeElementIsEditable) return;
      const pageHasFocus =
        !activeElement ||
        activeElement === document.body ||
        activeElement === document.documentElement;
      const spotlightHasFocusFallback = emptyStateSearchActive || pageHasFocus;
      if (!spotlightHasFocusFallback) return;

      if (event.key === "Backspace" && emptyStateSearchActive) {
        event.preventDefault();
        setEmptyStateBotNameFilter((current) => {
          if (current.length <= 1) {
            window.setTimeout(closeEmptyStateBotSearchAndFocusDraft, 0);
            return "";
          }
          return current.slice(0, -1);
        });
        return;
      }
      if (event.key === "Escape" && emptyStateSearchActive) {
        event.preventDefault();
        closeEmptyStateBotSearch();
        return;
      }
      if (event.key.length !== 1 || event.key.trim().length === 0) return;
      if (!emptyStateSearchActive && !pageHasFocus) return;
      event.preventDefault();
      openEmptyStateBotSearchFromTyping(event.key);
    }
    window.addEventListener("keydown", handlePageTyping);
    return () => window.removeEventListener("keydown", handlePageTyping);
  }, [
    closeEmptyStateBotSearchAndFocusDraft,
    closeEmptyStateBotSearch,
    emptyStateSearchActive,
    emptyStateTypingSearchAvailable,
    focusEmptyStateSearchAfterReturn,
    hueFilterCenter,
    openEmptyStateBotSearchFromTyping,
    startBotPickerReturnToAll,
  ]);

  useEffect(() => {
    if (!emptyStateSearchActive) return;
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (emptyStateSearchRef.current?.contains(target)) return;
      closeEmptyStateBotSearch();
    }
    document.addEventListener("click", handleDocumentClick);
    return () => document.removeEventListener("click", handleDocumentClick);
  }, [closeEmptyStateBotSearch, emptyStateSearchActive]);

  const relocateHueLensToBot = useCallback(
    (botId: string, geom: PickerGeometry): boolean => {
      if (emptyStateSearchActive || hueFilterCenter !== null) return false;
      if (!pickerUsesHueNavigation(geom, viewportWidth)) return false;
      const bot = pickerSourceBots.find((candidate) => candidate.id === botId);
      if (!bot || !botHasFilterableColor(bot)) return false;
      const { h } = hexToHsl(bot.color!.trim());
      setHueFilterCenter(hueLensPositionForHue(h));
      setSelectedBotId(null);
      return true;
    },
    [emptyStateSearchActive, hueFilterCenter, pickerSourceBots, viewportWidth]
  );

  // Touch keyboard-balloon handlers. Shared by both the Chat-mode and
  // Sandbox-mode empty-state picker frames. Active only when the gesture
  // is genuine touch input AND the picker is in hue-navigation territory:
  // Stage 3+ on mobile, Stage 4+ elsewhere. The first tap zooms/snaps the
  // hue lens; once narrowed, taps select individual bots again.
  const handleTouchPickerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, geom: PickerGeometry) => {
      if (event.pointerType !== "touch") return;
      if (!pickerUsesHueNavigation(geom, viewportWidth)) return;
      // Capture so subsequent move/up events route here even if the
      // finger drifts off this element. Without capture, the user's
      // finger crossing into a child tile would lose the gesture.
      event.currentTarget.setPointerCapture(event.pointerId);
      touchPreviewPointerIdRef.current = event.pointerId;
    },
    [viewportWidth]
  );

  const handleTouchPickerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== touchPreviewPointerIdRef.current) return;
      cancelBotContextLongPress(event.pointerId);
    },
    [cancelBotContextLongPress]
  );

  const handleTouchPickerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, geom: PickerGeometry) => {
      if (event.pointerId !== touchPreviewPointerIdRef.current) return;
      cancelBotContextLongPress(event.pointerId);
      if (botContextSuppressClickRef.current) {
        event.preventDefault();
        setTouchPreview(null);
        touchPreviewPointerIdRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        window.setTimeout(() => {
          botContextSuppressClickRef.current = false;
        }, 150);
        return;
      }
      const botId = findBotIdAtPoint(event.clientX, event.clientY);
      if (botId) {
        const relocated = relocateHueLensToBot(botId, geom);
        if (!relocated) {
          commitEmptyStateBotSelection(botId);
        }
      }
      setTouchPreview(null);
      touchPreviewPointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [cancelBotContextLongPress, commitEmptyStateBotSelection, relocateHueLensToBot]
  );

  const handleTouchPickerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== touchPreviewPointerIdRef.current) return;
      cancelBotContextLongPress(event.pointerId);
      setTouchPreview(null);
      touchPreviewPointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [cancelBotContextLongPress]
  );

  const renderEmptyStateBotSearch = (): React.JSX.Element | null => {
    if (!emptyStateSearchActive || pickerSourceBots.length === 0) return null;
    const resultLabel =
      normalizedEmptyStateBotNameFilter.length === 0
        ? "Start typing to filter bots by name."
        : filteredBots.length === 1
          ? "1 bot found"
          : `${filteredBots.length} bots found`;
    return (
      <div
        ref={emptyStateSearchRef}
        className={styles.emptyStateSearch}
        role="search"
        onBlur={(event) => {
          const nextFocus = event.relatedTarget;
          if (nextFocus instanceof Node && event.currentTarget.contains(nextFocus)) return;
          closeEmptyStateBotSearch();
        }}
      >
        <div className={styles.emptyStateSearchField}>
          <span className={styles.emptyStateSearchGlyph} aria-hidden="true">
            ⌕
          </span>
          <input
            ref={emptyStateSearchInputRef}
            type="search"
            value={emptyStateBotNameFilter}
            onChange={(event) => setEmptyStateBotNameFilter(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                closeEmptyStateBotSearch();
                return;
              }
              if (event.key === "Backspace" && emptyStateBotNameFilter.length <= 1) {
                event.preventDefault();
                closeEmptyStateBotSearchAndFocusDraft();
              }
            }}
            className={styles.emptyStateSearchInput}
            placeholder="Search bots"
            aria-label="Search bots by name"
          />
        </div>
        <div className={styles.emptyStateSearchMeta} aria-live="polite">
          {resultLabel}
        </div>
      </div>
    );
  };

  const disarmDelete = useCallback(() => {
    if (pendingDeleteTimerRef.current) {
      clearTimeout(pendingDeleteTimerRef.current);
      pendingDeleteTimerRef.current = null;
    }
    setPendingDeleteKey(null);
  }, []);

  const armDelete = useCallback((key: string) => {
    if (pendingDeleteTimerRef.current) {
      clearTimeout(pendingDeleteTimerRef.current);
      pendingDeleteTimerRef.current = null;
    }
    setPendingDeleteKey(key);
    // DELETE_ALL_KEY / DELETE_ALL_BOTS_KEY are special: their confirm
    // surface is a centered modal, and the 3.5 s window that makes the
    // inline "Are you sure?" pill feel snappy would instead pull the
    // modal out from under the user mid-read. We skip auto-disarm for
    // them and rely on Cancel / backdrop / Esc to dismiss explicitly.
    if (key === DELETE_ALL_KEY || key === DELETE_ALL_BOTS_KEY) return;
    pendingDeleteTimerRef.current = setTimeout(() => {
      setPendingDeleteKey(null);
      pendingDeleteTimerRef.current = null;
    }, DELETE_CONFIRM_WINDOW_MS);
  }, []);

  // Clean up the pending-delete timer on unmount so an in-flight auto-disarm
  // doesn't call setState on a torn-down component.
  useEffect(() => () => {
    if (pendingDeleteTimerRef.current) {
      clearTimeout(pendingDeleteTimerRef.current);
    }
  }, []);

  // Right-click is suppressed app-wide: we intend to ship our own
  // context menu eventually. Until then, secondary clicks should do
  // nothing at all (no dismissal, no native menu) so the gesture
  // doesn't conflict with future custom affordances.
  const handleAppContextMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
  }, []);

  // ── Hold-to-delete-all gesture ────────────────────────────────────────
  // `startHoldDelete` / `cancelHoldDelete` are called from pointer events
  // on every chat-clear affordance (sidebar × rows + header Delete). The
  // discrete React state change (holdingKey set/cleared) drives the CSS
  // `[data-holding="true"]` attribute, which owns the actual 900 ms morph
  // animation — we never re-render on intermediate progress, so even a
  // long hold doesn't thrash React's reconciler.
  const cancelHoldDelete = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHoldingKey(null);
  }, []);

  const startHoldDelete = useCallback((key: string) => {
    // Refuse to start a new hold while anything is already armed: the
    // active confirm pill / modal deserves the user's attention first,
    // and a second gesture layering on top would be disorienting.
    if (pendingDeleteKey) return;
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }
    holdCompletedRef.current = false;
    setHoldingKey(key);
    // Route to the bots sentinel when the holding key is a bot × so the
    // confirmation modal asks the right question and the bulk action
    // wipes the right dataset. Any non-bot key (sidebar chat ×, header
    // Delete) stays on the original DELETE_ALL_KEY path.
    const allKey = key.startsWith(BOT_DELETE_KEY_PREFIX)
      ? DELETE_ALL_BOTS_KEY
      : DELETE_ALL_KEY;
    holdTimerRef.current = setTimeout(() => {
      // Threshold crossed — snap out of "holding" visuals and into the
      // armed-all state. The list-level data attribute flip takes the
      // ×'s from tilted-and-glowing straight into iOS jiggle, and
      // `armDelete` renders the confirmation modal.
      holdCompletedRef.current = true;
      setHoldingKey(null);
      holdTimerRef.current = null;
      armDelete(allKey);
    }, DELETE_ALL_HOLD_MS);
  }, [armDelete, pendingDeleteKey]);

  // Clean up the hold timer on unmount.
  useEffect(() => () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }
  }, []);

  // Armed-all modal a11y: when the modal mounts, capture whatever had
  // focus (usually the × / header Delete the user was holding) so we can
  // restore focus to it on dismiss. While the modal is open, Escape
  // cancels — keeping the keyboard escape hatch consistent with every
  // other confirm surface in the app. Both the chat-scoped and bot-scoped
  // armed-all states share this contract so the two modals behave
  // identically from the keyboard / screen-reader side.
  const isDeleteAllActive =
    pendingDeleteKey === DELETE_ALL_KEY ||
    pendingDeleteKey === DELETE_ALL_BOTS_KEY;
  useEffect(() => {
    if (!isDeleteAllActive) {
      // On close, return focus to the element that opened the modal
      // (if it still exists in the DOM and is focusable).
      const prev = preModalFocusRef.current;
      preModalFocusRef.current = null;
      if (prev && typeof prev.focus === "function" && document.contains(prev)) {
        // Use a microtask so React has flushed the modal-removal render
        // before we refocus — otherwise the browser may steal focus
        // back to <body> between our call and the reconciliation tick.
        queueMicrotask(() => {
          try { prev.focus({ preventScroll: true }); } catch { /* focus can fail on detached nodes */ }
        });
      }
      return;
    }
    // Modal is opening — remember where focus came from.
    const active = document.activeElement;
    preModalFocusRef.current =
      active instanceof HTMLElement ? active : null;

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        disarmDelete();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isDeleteAllActive, disarmDelete]);

  useEffect(() => {
    if (!devToolsOpen) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeDevTools();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [devToolsOpen, closeDevTools]);

  // Clicking anywhere outside the delete / confirm affordance should disarm it.
  // This prevents the confirm pill from lingering in an awkward in-between
  // state after focus moves elsewhere in the sidebar.
  useEffect(() => {
    if (!pendingDeleteKey) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!isPrimaryPointerDismissal(event)) return;
      const target = event.target;
      // `Element` (not HTMLElement) is deliberate: clicks on inline SVG
      // glyphs have an SVGElement target, which is NOT an HTMLElement but
      // IS an Element (and has .closest). Narrowing to HTMLElement here
      // would treat glyph-icon taps as "outside" and collapse the
      // affordance the user just tried to act on.
      if (target instanceof Element && target.closest("[data-delete-affordance='true']")) {
        return;
      }
      disarmDelete();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [pendingDeleteKey, disarmDelete]);

  // Create mode: seed random color/glyph when the Bots panel opens only if
  // the compose form is still empty and the user hasn't picked a swatch/glyph
  // yet — so closing the panel mid-draft (or after a mis-tap) preserves work.
  useEffect(() => {
    if (panel !== "bots" || editingBotId) return;

    const draft = latestCreateBotDraftRef.current;
    if (
      createBotFormHasEnteredData(draft) ||
      createBotAppearanceTouchedRef.current
    ) {
      return;
    }

    setNewBotColor(randomHex(
      bots.map((bot) => bot.color?.trim() ?? "").filter((hex) => hex.length > 0)
    ));
    setNewBotGlyph(randomBotGlyph());
  }, [panel, editingBotId]);

  useEffect(() => {
    if (botProfileBuilderOpen && !newBotName.trim()) {
      setBotProfileBuilderOpen(false);
    }
  }, [botProfileBuilderOpen, newBotName]);

  // Close the color/glyph popover on any outside click or Escape. Only
  // one picker ever lives on screen (the top form in the Bots panel), so
  // a single `colorWheelOpen` flag is enough — no per-bot variant needed.
  useEffect(() => {
    if (!colorWheelOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!isPrimaryPointerDismissal(event)) return;
      const target = event.target;
      // `Element` (not HTMLElement) is deliberate: a click inside the
      // glyph grid typically lands on an SVG <path>/<circle>, which is
      // an SVGElement — an Element subtype but NOT an HTMLElement. The
      // previous HTMLElement narrowing silently collapsed the popover
      // whenever the user hit an actual glyph icon (the whole point of
      // the grid), while clicks on gaps/padding worked fine.
      if (
        target instanceof Element &&
        target.closest("[data-color-affordance='true']")
      ) {
        return;
      }
      setColorWheelOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setColorWheelOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [colorWheelOpen]);

  async function deleteConversation(id: string) {
    setError(null);
    disarmDelete();
    // Optimistic update: drop the chat from the sidebar immediately and, if
    // it was open, clear the main pane. Roll everything back on failure.
    const previousConversations = conversations;
    const previousSelectedId = selectedId;
    const previousDetail = detail;
    setConversations(list => list.filter(c => c.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setDetail(null);
    }
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      // Resync from the server so updatedAt order / any server-side fixups
      // (e.g. race with another tab) are reflected.
      await refreshConversations();
    } catch (err) {
      setConversations(previousConversations);
      setSelectedId(previousSelectedId);
      setDetail(previousDetail);
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function deleteConversationGroup(group: ConversationGroupSummary) {
    setError(null);
    disarmDelete();
    const previousConversations = conversations;
    const previousSelectedId = selectedId;
    const previousDetail = detail;
    const previousUnreadIds = unreadConversationIds;
    const previousUnreadOrder = unreadConversationOrder;
    const previousOpenGroupKey = openConversationGroupKey;
    const groupConversationIds = new Set(
      previousConversations
        .filter((conversation) => conversationGroupKey(conversation) === group.key)
        .map((conversation) => conversation.id)
    );
    const selectedGroupKey = previousDetail?.incognito
      ? null
      : previousDetail
        ? previousDetail.botId
          ? `bot:${previousDetail.botId}`
          : "default"
        : null;

    setConversations((list) =>
      list.filter((conversation) => conversationGroupKey(conversation) !== group.key)
    );
    setUnreadConversationIds((previous) => {
      const next = new Set(previous);
      for (const id of groupConversationIds) next.delete(id);
      return next;
    });
    setUnreadConversationOrder((previous) =>
      previous.filter((id) => !groupConversationIds.has(id))
    );
    setOpenConversationGroupKey(null);
    if (selectedGroupKey === group.key) {
      setSelectedId(null);
      setDetail(null);
    }

    try {
      const routeBotId = group.botId ? encodeURIComponent(group.botId) : "_default";
      await api(`/api/conversations/by-bot/${routeBotId}`, { method: "DELETE" });
      await refreshConversations();
      await refreshOpenMemoryViews();
    } catch (err) {
      setConversations(previousConversations);
      setSelectedId(previousSelectedId);
      setDetail(previousDetail);
      setUnreadConversationIds(previousUnreadIds);
      setUnreadConversationOrder(previousUnreadOrder);
      setOpenConversationGroupKey(previousOpenGroupKey);
      setError(err instanceof Error ? err.message : "Delete conversation group failed.");
    }
  }

  // Bulk-clear every chat, triggered by the hold-to-delete-all gesture.
  // Optimistically wipes the sidebar + open pane so the UI matches the
  // user's intent instantly; on failure we roll back to the previous
  // snapshot and surface the error rather than silently recovering.
  async function deleteAllConversations() {
    setError(null);
    disarmDelete();
    const previousConversations = conversations;
    const previousSelectedId = selectedId;
    const previousDetail = detail;
    // Nothing to clear — short-circuit rather than fire a no-op request.
    if (previousConversations.length === 0) return;
    setConversations([]);
    setSelectedId(null);
    setDetail(null);
    try {
      await api("/api/conversations", { method: "DELETE" });
      await refreshConversations();
    } catch (err) {
      setConversations(previousConversations);
      setSelectedId(previousSelectedId);
      setDetail(previousDetail);
      setError(err instanceof Error ? err.message : "Delete all failed.");
    }
  }

  function buildRandomBotDraft(name = randomBotName()) {
    return {
      name,
      profile: randomBotProfile(name),
      temperature: randomBotTemperatureSetting(),
      maxTokens: randomBotReplyLengthTokens(),
      color: randomHex(
        bots.map((bot) => bot.color?.trim() ?? "").filter((hex) => hex.length > 0)
      ),
      glyph: randomBotGlyph(),
    };
  }

  function applyRandomBotDraft() {
    const draft = buildRandomBotDraft();
    setPanelNotice(null);
    setNewBotName(draft.name);
    setBotProfile(draft.profile);
    setNewBotTemperature(draft.temperature);
    setNewBotMaxTokens(draft.maxTokens);
    createBotAppearanceTouchedRef.current = true;
    setNewBotColor(draft.color);
    setNewBotGlyph(draft.glyph);
    setColorWheelOpen(false);
    setBotProfileBuilderOpen(false);
    setBotProfileActivePage("purpose");
  }

  // Reset the top form back to "create" mode with a fresh random
  // color/glyph seed. Clears draft/touch guards so the next open behaves
  // like an empty compose. Called after a successful create and when the
  // user cancels or deletes an in-progress edit.
  const resetBotForm = useCallback(() => {
    setNewBotName("");
    setBotProfile(blankBotProfile());
    setNewBotLocalModel(AUTO_MODEL_CHOICE);
    setNewBotOnlineModel(AUTO_MODEL_CHOICE);
    setNewBotOnlineEnabled(true);
    setNewBotDeleteProtected(false);
    setNewBotTemperature(BOT_TEMPERATURE_DEFAULT);
    setNewBotMaxTokens(BOT_REPLY_LENGTH_DEFAULT_TOKENS);
    createBotAppearanceTouchedRef.current = false;
    setNewBotColor(randomHex(
      bots.map((bot) => bot.color?.trim() ?? "").filter((hex) => hex.length > 0)
    ));
    setNewBotGlyph(randomBotGlyph());
    setColorWheelOpen(false);
    setBotProfileBuilderOpen(false);
    setBotProfileActivePage("purpose");
    // Drop any stashed edit-mode snapshot so the next edit compares
    // against the correct starting state. Safe to always clear here:
    // the only places that hold a snapshot are paths that also call
    // resetBotForm on exit.
    editOriginalRef.current = null;
  }, []);

  async function createBot() {
    setPanelError(null);
    setPanelNotice(null);
    const createdBotName = newBotName.trim();
    const localModel = visibleBotCustomizerModelChoice(settings, newBotLocalModel);
    const onlineModel = visibleBotCustomizerModelChoice(settings, newBotOnlineModel);
    try {
      await api("/api/bots", {
        method: "POST",
        body: JSON.stringify({
          name: newBotName,
          systemPrompt: serializeStoredBotPrompt(botProfile, newBotName),
          localModel: localModel === AUTO_MODEL_CHOICE ? "" : localModel,
          onlineModel: onlineModel === AUTO_MODEL_CHOICE ? "" : onlineModel,
          onlineEnabled: newBotOnlineEnabled,
          deleteProtected: newBotDeleteProtected,
          temperature: newBotTemperature,
          maxTokens: newBotMaxTokens,
          color: newBotColor,
          glyph: newBotGlyph,
        }),
      });
      resetBotForm();
      setPanelNotice(`${createdBotName} created.`);
      await refreshBots();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Create bot failed.");
    }
  }

  async function deleteBot(id: string) {
    setPanelError(null);
    setPanelNotice(null);
    disarmDelete();
    // If the deleted bot was the one loaded into the top form, collapse
    // back to create mode so the editor doesn't keep pointing at a row
    // that no longer exists.
    if (editingBotId === id) {
      setEditingBotId(null);
      resetBotForm();
    }
    // Optimistic update: drop the bot from the panel immediately, and if the
    // user had it selected in the sidebar clear that too so subsequent chats
    // don't try to reference a bot that's already gone. Roll back on failure.
    const previousBots = bots;
    const previousSelectedBotId = selectedBotId;
    setBots(list => list.filter(b => b.id !== id));
    if (selectedBotId === id) {
      setSelectedBotId(null);
    }
    try {
      await api(`/api/bots/${id}`, { method: "DELETE" });
      await refreshBots();
    } catch (err) {
      setBots(previousBots);
      setSelectedBotId(previousSelectedBotId);
      setPanelError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  async function cloneBot(bot: Bot) {
    setPanelError(null);
    setPanelNotice(null);
    closeBotContextMenu();
    try {
      const result = await api<{ bot?: { id?: string } }>("/api/bots", {
        method: "POST",
        body: JSON.stringify({
          name: `${bot.name} (copy)`,
          systemPrompt: bot.system_prompt,
          localModel: bot.local_model ?? "",
          onlineModel: bot.online_model ?? "",
          onlineEnabled: bot.online_enabled !== 0,
          deleteProtected: bot.delete_protected === 1,
          temperature: normalizeBotTemperature(bot.temperature),
          maxTokens: normalizeBotMaxTokens(bot.max_tokens),
          color: bot.color,
          glyph: bot.glyph,
        }),
      });
      await refreshBots();
      if (result.bot?.id) {
        setEditingBotId(result.bot.id);
        openRightPanel("bots");
        setBotPanelGroup(BOT_LIBRARY_FILTER_ALL);
        setBotLibraryExpanded(false);
        setBotLibraryClosing(false);
        setBotPanelLibraryEnabled(false);
      }
      setPanelNotice(`${bot.name} cloned.`);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Clone bot failed.");
    }
  }

  // User-facing bulk wipe reached via press-and-hold on any bot card ×.
  // Mirrors `deleteAllConversations` exactly: optimistic clear, best-effort
  // server sync, snapshot rollback on failure. This belongs to the normal
  // panel UX and surfaces errors inside `panelError` so they render beside
  // the bot list.
  async function deleteAllBots() {
    setPanelError(null);
    setPanelNotice(null);
    disarmDelete();
    const previousBots = bots;
    const previousSelectedBotId = selectedBotId;
    const protectedBots = previousBots.filter((bot) => bot.delete_protected === 1);
    const protectedBotIds = new Set(protectedBots.map((bot) => bot.id));
    const unprotectedCount = previousBots.length - protectedBots.length;
    // Nothing to clear — short-circuit rather than fire a no-op request.
    // Tapping into the empty state via hold-from-nothing is unreachable in
    // practice, but the guard keeps the function safe to call from any
    // future entry point.
    if (unprotectedCount === 0) return;
    // Bail out of any in-progress edit so the form doesn't keep pointing at
    // a row that's about to vanish. resetBotForm reseeds the color/glyph
    // so the reopened form still feels generative.
    if (!editingBotId || !protectedBotIds.has(editingBotId)) {
      setEditingBotId(null);
      resetBotForm();
    }
    setBots(protectedBots);
    if (previousSelectedBotId && !protectedBotIds.has(previousSelectedBotId)) {
      setSelectedBotId(null);
    }
    try {
      await api("/api/bots", { method: "DELETE" });
      await refreshBots();
    } catch (err) {
      setBots(previousBots);
      setSelectedBotId(previousSelectedBotId);
      setPanelError(err instanceof Error ? err.message : "Delete all bots failed.");
    }
  }

  async function devToolsDeleteAllBots() {
    setDevToolsMessage(null);
    setDevToolsBusy(true);
    const previousBots = bots;
    const previousSelectedBotId = selectedBotId;
    setBots([]);
    setSelectedBotId(null);
    try {
      const result = await api<{ deleted?: number }>("/api/bots", {
        method: "DELETE",
      });
      await refreshBots();
      const deleted = typeof result?.deleted === "number" ? result.deleted : 0;
      setDevToolsMessage(
        deleted === 0
          ? "No bots to delete."
          : deleted === 1
            ? "Deleted 1 bot."
            : `Deleted ${deleted} bots.`
      );
    } catch (err) {
      setBots(previousBots);
      setSelectedBotId(previousSelectedBotId);
      setDevToolsMessage(
        err instanceof Error ? err.message : "Delete all bots failed."
      );
    } finally {
      setDevToolsBusy(false);
    }
  }

  async function devToolsCreateRandomBotBatch(batchSize: number) {
    if (batchSize <= 0) return;

    const names = sampleBotNames(batchSize);
    for (let start = 0; start < names.length; start += DEV_TOOLS_BOT_CREATE_CHUNK_SIZE) {
      const chunk = names.slice(start, start + DEV_TOOLS_BOT_CREATE_CHUNK_SIZE);
      await Promise.all(
        chunk.map((name) => {
          const draft = buildRandomBotDraft(name);
          return api("/api/bots", {
            method: "POST",
            body: JSON.stringify({
              name: draft.name,
              systemPrompt: serializeStoredBotPrompt(draft.profile, draft.name),
              temperature: draft.temperature,
              maxTokens: draft.maxTokens,
              color: draft.color,
              glyph: draft.glyph,
            }),
          });
        })
      );
    }
  }

  async function devToolsAddRandomBots() {
    const batchSize = resolvedDevToolsBotQuantity;
    if (batchSize <= 0) {
      setDevToolsMessage(randomDevToolsGhostMessage());
      return;
    }

    setDevToolsMessage(null);
    setDevToolsBusy(true);
    try {
      await devToolsCreateRandomBotBatch(batchSize);
      await refreshBots();
      setDevToolsMessage(
        batchSize === 1 ? "Added 1 random bot." : `Added ${batchSize} random bots.`
      );
    } catch (err) {
      try { await refreshBots(); } catch { /* best-effort refresh */ }
      setDevToolsMessage(
        err instanceof Error ? err.message : "Add random bots failed."
      );
    } finally {
      setDevToolsBusy(false);
    }
  }

  async function devToolsAddSeedChats() {
    const count = resolvedDevToolsBotQuantity;
    if (count <= 0) {
      setDevToolsMessage(randomDevToolsGhostMessage());
      return;
    }

    setDevToolsMessage(null);
    setDevToolsBusy(true);
    try {
      const result = await api<{ created?: number }>("/api/conversations/dev-seed", {
        method: "POST",
        body: JSON.stringify({ count }),
      });
      await refreshConversations();
      const created = typeof result?.created === "number" ? result.created : count;
      setDevToolsMessage(
        created === 1 ? "Added 1 seed chat." : `Added ${created} seed chats.`
      );
    } catch (err) {
      try { await refreshConversations(); } catch { /* best-effort refresh */ }
      setDevToolsMessage(
        err instanceof Error ? err.message : "Add seed chats failed."
      );
    } finally {
      setDevToolsBusy(false);
    }
  }

  // Distribute random seed memories across every bot the user owns. Used
  // when the Memories panel is showing the All-memories view, so the
  // bubble cluster has something to chew on without having to wire each
  // bot up by hand.
  async function devToolsAddAllMemories() {
    const count = resolvedDevToolsBotQuantity;
    if (count <= 0) {
      setDevToolsMessage(randomDevToolsGhostMessage());
      return;
    }
    if (bots.length === 0) {
      setDevToolsMessage("Create at least one bot before seeding memories.");
      return;
    }

    setDevToolsMessage(null);
    setDevToolsBusy(true);
    try {
      const seedPayload: Record<string, unknown> = {
        count,
        source: devToolsMemorySeedSource,
      };
      if (devToolsMemorySeedSource !== "direct") {
        seedPayload.certainty = devToolsMemoryCertainty;
      }
      const result = await api<{ created?: number }>("/api/memories/dev-seed", {
        method: "POST",
        body: JSON.stringify(seedPayload),
      });
      await refreshMemories();
      const created = typeof result?.created === "number" ? result.created : count;
      setDevToolsMessage(
        created === 1
          ? `Added 1 ${devToolsMemorySeedSource} memory across bots.`
          : `Added ${created} ${devToolsMemorySeedSource} memories across ${bots.length} bots.`
      );
    } catch (err) {
      try { await refreshMemories(); } catch { /* best-effort refresh */ }
      setDevToolsMessage(
        err instanceof Error ? err.message : "Add memories failed."
      );
    } finally {
      setDevToolsBusy(false);
    }
  }

  // Seed memories for whichever bot is currently focused in the
  // Memories panel. Falls back to a clear status message if the panel
  // isn't on a specific bot — keeps the operator from accidentally
  // dumping memories on the wrong bot.
  async function devToolsAddBotMemories() {
    const targetBot = memoryPanelBot ?? activeBot;
    if (!targetBot?.id) {
      setDevToolsMessage("Open a bot's memories panel first to seed for that bot.");
      return;
    }
    const count = resolvedDevToolsBotQuantity;
    if (count <= 0) {
      setDevToolsMessage(randomDevToolsGhostMessage());
      return;
    }

    setDevToolsMessage(null);
    setDevToolsBusy(true);
    try {
      const seedPayload: Record<string, unknown> = {
        count,
        botId: targetBot.id,
        source: devToolsMemorySeedSource,
      };
      if (devToolsMemorySeedSource !== "direct") {
        seedPayload.certainty = devToolsMemoryCertainty;
      }
      const result = await api<{ created?: number }>("/api/memories/dev-seed", {
        method: "POST",
        body: JSON.stringify(seedPayload),
      });
      await refreshMemories();
      await refreshBotMemories(targetBot.id);
      const created = typeof result?.created === "number" ? result.created : count;
      setDevToolsMessage(
        created === 1
          ? `Added 1 ${devToolsMemorySeedSource} memory to ${targetBot.name}.`
          : `Added ${created} ${devToolsMemorySeedSource} memories to ${targetBot.name}.`
      );
    } catch (err) {
      try {
        await refreshMemories();
        await refreshBotMemories(targetBot.id);
      } catch { /* best-effort refresh */ }
      setDevToolsMessage(
        err instanceof Error ? err.message : "Add bot memories failed."
      );
    } finally {
      setDevToolsBusy(false);
    }
  }

  // Wipe every memory (global + bot-scoped) for the current user.
  // Server-side this is `DELETE /api/memories` — there's no per-bot
  // endpoint today, so this is intentionally a blunt instrument for
  // dev resets.
  async function devToolsClearAllMemories() {
    setDevToolsMessage(null);
    setDevToolsBusy(true);
    try {
      const result = await api<{ deleted?: number }>("/api/memories", {
        method: "DELETE",
      });
      await refreshMemories();
      if (memoryPanelBot?.id) {
        await refreshBotMemories(memoryPanelBot.id);
      }
      const deleted = typeof result?.deleted === "number" ? result.deleted : 0;
      setDevToolsMessage(
        deleted === 0
          ? "No memories to clear."
          : deleted === 1
            ? "Cleared 1 memory."
            : `Cleared ${deleted} memories.`
      );
    } catch (err) {
      try {
        await refreshMemories();
        if (memoryPanelBot?.id) {
          await refreshBotMemories(memoryPanelBot.id);
        }
      } catch { /* best-effort refresh */ }
      setDevToolsMessage(
        err instanceof Error ? err.message : "Clear memories failed."
      );
    } finally {
      setDevToolsBusy(false);
    }
  }

  async function devToolsSetBotDensityStage(stageId: PickerDensityStageId) {
    const liveViewportWidth =
      typeof window === "undefined" ? viewportWidth : window.innerWidth;
    const liveViewportHeight =
      typeof window === "undefined" ? viewportHeight : window.innerHeight;
    const stage = pickerDensityStageTargets(
      liveViewportWidth,
      liveViewportHeight
    ).find((target) => target.id === stageId);
    if (!stage) return;

    const targetCount = clampDevToolsBotQuantity(stage.targetCount);
    const delta = targetCount - bots.length;
    setDevToolsBotQuantity(targetCount);

    if (delta === 0) {
      setDevToolsMessage(
        `${stage.label} (${stage.description}) is already active at ${targetCount} bots for ${liveViewportWidth}x${liveViewportHeight}.`
      );
      return;
    }

    setDevToolsMessage(null);
    setDevToolsBusy(true);
    const previousBots = bots;
    const previousSelectedBotId = selectedBotId;

    try {
      if (delta > 0) {
        await devToolsCreateRandomBotBatch(delta);
        await refreshBots();
        setDevToolsMessage(
          `${stage.label} (${stage.description}) target: ${targetCount} bots for ${liveViewportWidth}x${liveViewportHeight}. Added ${delta} bots.`
        );
        return;
      }

      const deleteCount = Math.abs(delta);
      const optimisticDeletedIds = new Set(
        previousBots.slice(0, deleteCount).map((bot) => bot.id)
      );
      setBots((list) => list.filter((bot) => !optimisticDeletedIds.has(bot.id)));
      if (selectedBotId && optimisticDeletedIds.has(selectedBotId)) {
        setSelectedBotId(null);
      }

      const result = await api<{ deleted?: number }>(
        `/api/bots?limit=${deleteCount}`,
        { method: "DELETE" }
      );
      await refreshBots();
      const deleted = typeof result?.deleted === "number" ? result.deleted : deleteCount;
      setDevToolsMessage(
        `${stage.label} (${stage.description}) target: ${targetCount} bots for ${liveViewportWidth}x${liveViewportHeight}. Deleted ${deleted} bots.`
      );
    } catch (err) {
      setBots(previousBots);
      setSelectedBotId(previousSelectedBotId);
      try { await refreshBots(); } catch { /* best-effort refresh */ }
      setDevToolsMessage(
        err instanceof Error ? err.message : `Set ${stage.label} failed.`
      );
    } finally {
      setDevToolsBusy(false);
    }
  }

  // Load a specific bot into the top form for editing. The form itself
  // doesn't change shape — it just flips from "create" to "edit" mode
  // via editingBotId, and the name / prompt / color / glyph fields are
  // hydrated from the bot. Any other layered UI (armed delete pill, open
  // color picker) is collapsed so the user's attention rests squarely on
  // the one active form.
  //
  // We also stash the seeded values into editOriginalRef so the primary
  // button can ask "did the user change anything?" against the ACTUAL
  // starting state — this matters for bots with no stored color, where
  // we seed the picker with a random hex and would otherwise read as
  // "dirty" on the very first frame.
  //
  // Swapping targets (edit Bot A → click Bot B) just replaces the
  // hydrated values: the previous unsaved edits on Bot A are dropped,
  // which is one of the three advertised "cancel" paths (alongside the
  // panel backdrop and the × in the panel header).
  function startEditBot(bot: Bot) {
    disarmDelete();
    createBotAppearanceTouchedRef.current = false;
    setColorWheelOpen(false);
    const seededName = bot.name;
    const rawStoredPrompt = bot.system_prompt ?? "";
    const { fields: seededProfile } = parseStoredBotPrompt(rawStoredPrompt);
    const normalizedStoredPrompt = serializeStoredBotPrompt(seededProfile, seededName);
    const seededLocalModel = normalizeModelChoice(bot.local_model ?? bot.model);
    const seededOnlineModel = normalizeModelChoice(bot.online_model);
    const seededOnlineEnabled = bot.online_enabled !== 0;
    const seededDeleteProtected = bot.delete_protected === 1;
    const seededTemperature = normalizeBotTemperature(bot.temperature);
    const seededMaxTokens = normalizeBotMaxTokens(bot.max_tokens);
    const seededColor = bot.color?.trim() || randomHex(
      bots
        .filter((candidate) => candidate.id !== bot.id)
        .map((candidate) => candidate.color?.trim() ?? "")
        .filter((hex) => hex.length > 0)
    );
    const seededGlyph: BotGlyphName = isBotGlyphName(bot.glyph)
      ? bot.glyph
      : DEFAULT_BOT_GLYPH;
    setNewBotName(seededName);
    setBotProfile(seededProfile);
    setNewBotLocalModel(seededLocalModel);
    setNewBotOnlineModel(seededOnlineModel);
    setNewBotOnlineEnabled(seededOnlineEnabled);
    setNewBotDeleteProtected(seededDeleteProtected);
    setNewBotTemperature(seededTemperature);
    setNewBotMaxTokens(seededMaxTokens);
    setNewBotColor(seededColor);
    setNewBotGlyph(seededGlyph);
    setBotProfileBuilderOpen(false);
    setBotProfileActivePage("purpose");
    setEditingBotId(bot.id);
    editOriginalRef.current = {
      name: seededName,
      prompt: normalizedStoredPrompt,
      localModel: seededLocalModel,
      onlineModel: seededOnlineModel,
      onlineEnabled: seededOnlineEnabled,
      deleteProtected: seededDeleteProtected,
      temperature: seededTemperature,
      maxTokens: seededMaxTokens,
      color: seededColor,
      glyph: seededGlyph,
    };
    setPanelError(null);
  }

  function openActiveBotCustomizer() {
    if (!activeBot) return;
    openBotCustomizer(activeBot);
  }

  function openBotCustomizer(bot: Bot) {
    setBotPanelGroup(BOT_LIBRARY_FILTER_ALL);
    startEditBot(bot);
    openRightPanel("bots");
    setBotLibraryExpanded(false);
    setBotLibraryClosing(false);
    setBotPanelLibraryEnabled(false);
  }

  function openMemoriesPanelForBot(bot: Bot) {
    setMemoryPanelScope("bot");
    setMemoryPanelBotId(bot.id);
    // Pre-select the PRISM family this bot belongs to so the bot-view
    // back button has a sensible destination (the family drill-down)
    // even when the user opened bot memories straight from the chat
    // header instead of drilling in through the directory.
    setMemoryPanelSelectedFamily(botPrismGroup(bot.color));
    void refreshBotMemories(bot.id);
    openRightPanel("memories");
  }

  function openActiveBotMemoriesPanel() {
    if (!activeBot?.id) return;
    openMemoriesPanelForBot(activeBot);
  }

  function openDefaultMemoriesPanel() {
    setMemoryPanelScope("default");
    setMemoryPanelBotId(null);
    setMemoryPanelSelectedFamily(null);
    setFocusedMemoryId(null);
    void refreshDefaultMemories();
    openRightPanel("memories");
  }

  function openAllMemoriesPanel() {
    setMemoryPanelScope("all");
    setMemoryPanelBotId(null);
    setMemoryPanelSelectedFamily(null);
    void refreshMemories();
    openRightPanel("memories");
  }

  function handleHeaderHubClick() {
    navigateToView("hub");
  }

  function renderProfileCard(): React.JSX.Element {
    if (!user) return <div className={styles.profile} />;
    const initial = (user.displayName || user.email).charAt(0).toUpperCase();
    return (
      <div className={styles.profile}>
        <div className={styles.profileAvatar} aria-hidden="true">
          {initial}
        </div>
        <div className={styles.profileInfo}>
          <strong>{user.displayName}</strong>
          <span>{user.email}</span>
        </div>
      </div>
    );
  }

  const memoryPanelBot = useMemo<Bot | null>(() => {
    if (memoryPanelScope !== "bot") return null;
    if (memoryPanelBotId) {
      const explicit = bots.find((bot) => bot.id === memoryPanelBotId) ?? null;
      if (explicit) return explicit;
    }
    return activeBot;
  }, [memoryPanelScope, memoryPanelBotId, bots, activeBot]);

  const memoryPanelAccent = normalizeAccentForTheme(
    memoryPanelScope === "bot"
      ? memoryPanelBot?.color ?? PRISM_DEFAULT_ACCENT
      : PRISM_DEFAULT_ACCENT,
    resolvedTheme
  );
  const memoryPanelStyle = (() => {
    const base = deriveAccentStyle(memoryPanelAccent, resolvedTheme);
    const style: React.CSSProperties = {
      ["--memory-panel-color" as string]: memoryPanelAccent,
      ["--memory-panel-text" as string]: base["--accent-text" as keyof typeof base],
      ["--memory-panel-ink" as string]: base["--accent-ink" as keyof typeof base],
    };
    // Surface the active PRISM family's color so the left-edge bar in
    // the drill-down view can match the family being observed instead
    // of using the global rainbow gradient. We resolve the swatch from
    // PRISM_GROUPS directly to avoid forward-referencing
    // `selectedMemoryFamilyDirectory`, which is declared further down.
    if (memoryPanelScope === "all" && memoryPanelSelectedFamily) {
      const familyGroup = PRISM_GROUPS.find(
        (group) => group.id === memoryPanelSelectedFamily
      );
      if (familyGroup?.swatch) {
        (style as Record<string, string>)["--memory-family-bar-color"] =
          normalizeAccentForTheme(familyGroup.swatch, resolvedTheme);
      }
    }
    return style;
  })();

  const memoryFamilyDirectories = useMemo<MemoryFamilyDirectory[]>(() => {
    const memoryCounts: Record<PrismGroupId, number> = { p: 0, r: 0, i: 0, s: 0, m: 0 };
    const botCounts: Record<PrismGroupId, number> = { p: 0, r: 0, i: 0, s: 0, m: 0 };

    for (const bot of bots) {
      const family = botPrismGroup(bot.color);
      botCounts[family] += 1;
      memoryCounts[family] += directMemoryCountsByBotId[bot.id] ?? 0;
    }

    const itemCounts = PRISM_GROUPS.reduce<Record<PrismGroupId, number>>((acc, group) => {
      acc[group.id] = botCounts[group.id];
      return acc;
    }, { p: 0, r: 0, i: 0, s: 0, m: 0 });
    // Bubble size now reflects memory volume in the family (not bot count),
    // so a family with many bots but no memories collapses to the empty
    // size — visually matching the "No memories yet" drill-in state. The
    // numeric badge below still shows bot count for roster context.
    const maxCount = Math.max(defaultDirectMemoryCount, ...Object.values(memoryCounts));

    return PRISM_GROUPS.map((group, index) => {
      const itemCount = itemCounts[group.id];
      const memoryCount = memoryCounts[group.id];
      const size = ratioBubbleSize(memoryCount, maxCount);
      const slot = MEMORY_FAMILY_DIRECTORY_SLOTS[index % MEMORY_FAMILY_DIRECTORY_SLOTS.length];
      return {
        id: group.id,
        letter: group.letter,
        label: group.label,
        color: group.swatch,
        itemCount,
        memoryCount,
        style: {
          ["--memory-family-x" as string]: `${slot[0]}%`,
          ["--memory-family-y" as string]: `${slot[1]}%`,
          ["--memory-family-size" as string]: `${size}px`,
          ["--memory-family-color" as string]: group.swatch,
          ["--memory-family-delay" as string]: `${(index * 0.18).toFixed(2)}s`,
        } as React.CSSProperties,
      };
    });
  }, [bots, defaultDirectMemoryCount, directMemoryCountsByBotId]);

  const defaultMemoryDirectoryStyle = useMemo(() => {
    // Share the family bubbles' memory-volume scale so the default Prism
    // orb is visually comparable (apples-to-apples) instead of being
    // measured against bot counts.
    const maxCount = Math.max(
      defaultDirectMemoryCount,
      ...memoryFamilyDirectories.map((family) => family.memoryCount)
    );
    const size = ratioBubbleSize(defaultDirectMemoryCount, maxCount);
    return {
      ["--memory-family-x" as string]: "50%",
      ["--memory-family-y" as string]: "50%",
      ["--memory-family-size" as string]: `${size}px`,
      ["--memory-family-color" as string]: PRISM_DEFAULT_ACCENT,
      ["--memory-family-delay" as string]: "0.42s",
    } as React.CSSProperties;
  }, [memoryFamilyDirectories, defaultDirectMemoryCount]);

  const selectedMemoryFamilyDirectory = useMemo(
    () => memoryFamilyDirectories.find((family) => family.id === memoryPanelSelectedFamily) ?? null,
    [memoryFamilyDirectories, memoryPanelSelectedFamily]
  );

  const selectedFamilyBotClusters = useMemo<MemoryFamilyBotCluster[]>(() => {
    if (!memoryPanelSelectedFamily) return [];
    const familyBots = bots.filter((bot) => botPrismGroup(bot.color) === memoryPanelSelectedFamily);
    // Bots with zero memories are intentionally omitted from the family
    // drill-down so the orb cloud reads as "memories present" rather than
    // "complete bot roster". A family with bots but no memories falls
    // through to the empty-state messaging below.
    const baseClusters: Omit<MemoryFamilyBotCluster, "style" | "innerBubbles">[] = familyBots
      .map((bot) => ({
        id: bot.id,
        botId: bot.id,
        botName: bot.name,
        botGlyph: bot.glyph,
        color: normalizeAccentForTheme(bot.color ?? selectedMemoryFamilyDirectory?.color ?? PRISM_DEFAULT_ACCENT, resolvedTheme),
        memoryCount: directMemoryCountsByBotId[bot.id] ?? 0,
      }))
      .filter((cluster) => cluster.memoryCount > 0);

    const maxCount = Math.max(1, ...baseClusters.map((cluster) => cluster.memoryCount));
    const buildInnerBubbles = (
      clusterId: string,
      count: number,
      clusterSize: number
    ): MemoryClusterInnerBubble[] => {
      if (count <= 0) return [];
      // Inner motes are a direct preview of memories. Cap only at high counts
      // and scale dot count with the parent size so tiny clusters stay sparse.
      const sizeRatio = Math.max(0.12, clusterSize / MEMORY_RATIO_LARGE_MAX_SIZE);
      const density = Math.min(1, count / Math.max(1, maxCount));
      const bubbleCount = Math.max(1, Math.min(count, Math.round(20 * sizeRatio)));
      const placed: Array<{ x: number; y: number; radius: number }> = [];
      const bubbles: MemoryClusterInnerBubble[] = [];
      for (let i = 0; i < bubbleCount; i += 1) {
        // Larger memory families get slightly larger motes in addition to more
        // of them, so volume is readable at a glance.
        const size = 4.4 + density * 3.2 + ((i + count) % 3) * 1.15;
        const radius = size / 2;
        const minCenterRadius = 10 + radius;
        const maxCenterRadius = Math.max(minCenterRadius + 1, 32 - radius);
        let candidate: { x: number; y: number; radius: number } | null = null;
        for (let attempt = 0; attempt < 48; attempt += 1) {
          const angle = stableUnitValue(`${clusterId}:inner:${i}:a:${attempt}`) * Math.PI * 2;
          // Bias outward: most motes hug the outer ring while still permitting
          // occasional inner placements so the full orb stays alive.
          const radialSeed = stableUnitValue(`${clusterId}:inner:${i}:r:${attempt}`);
          const radialT = Math.pow(radialSeed, 0.36);
          const distance = minCenterRadius + radialT * (maxCenterRadius - minCenterRadius);
          const x = Math.cos(angle) * distance;
          const y = Math.sin(angle) * distance;
          const overlaps = placed.some((other) => {
            const dx = x - other.x;
            const dy = y - other.y;
            const minDistance = radius + other.radius + 2.2;
            return dx * dx + dy * dy < minDistance * minDistance;
          });
          if (!overlaps) {
            candidate = { x, y, radius };
            break;
          }
        }
        if (!candidate) {
          const fallbackAngle = ((i * 137.50776405) % 360) * (Math.PI / 180);
          const fallbackDistance = Math.min(maxCenterRadius, 14 + i * 1.7);
          candidate = {
            x: Math.cos(fallbackAngle) * fallbackDistance,
            y: Math.sin(fallbackAngle) * fallbackDistance,
            radius,
          };
        }
        placed.push(candidate);
        bubbles.push({
          id: `${clusterId}-inner-${i}`,
          style: {
            ["--memory-inner-x" as string]: `${candidate.x.toFixed(2)}px`,
            ["--memory-inner-y" as string]: `${candidate.y.toFixed(2)}px`,
            ["--memory-inner-size" as string]: `${size.toFixed(2)}px`,
            ["--memory-inner-dx" as string]: `${((stableUnitValue(`${clusterId}:inner:${i}:dx`) - 0.5) * 6).toFixed(2)}px`,
            ["--memory-inner-dy" as string]: `${((stableUnitValue(`${clusterId}:inner:${i}:dy`) - 0.5) * 6).toFixed(2)}px`,
            ["--memory-inner-duration" as string]: `${(2.8 + stableUnitValue(`${clusterId}:inner:${i}:dur`) * 2.2).toFixed(2)}s`,
            ["--memory-inner-delay" as string]: `${(i * 0.14).toFixed(2)}s`,
          } as React.CSSProperties,
        });
      }
      return bubbles;
    };

    const orderedClusters = baseClusters.sort(
      (a, b) => b.memoryCount - a.memoryCount || a.botName.localeCompare(b.botName)
    );
    const crowdScale = Math.min(1, Math.max(0.68, Math.sqrt(8 / Math.max(1, orderedClusters.length))));
    const placedClusters: Array<{ x: number; y: number; radiusPct: number }> = [];
    const pxToPct = 100 / 520;
    const placeWithoutOverlap = (
      clusterId: string,
      slotX: number,
      slotY: number,
      radiusPct: number
    ): { x: number; y: number } => {
      const minX = 8 + radiusPct;
      const maxX = 92 - radiusPct;
      const minY = 10 + radiusPct;
      const maxY = 90 - radiusPct;
      let bestCandidate = {
        x: Math.max(minX, Math.min(maxX, slotX)),
        y: Math.max(minY, Math.min(maxY, slotY)),
      };
      let bestPenalty = Number.POSITIVE_INFINITY;

      for (let attempt = 0; attempt < 140; attempt += 1) {
        const ring = Math.floor(attempt / 14);
        const step = 1.55 + radiusPct * 0.34;
        const angleSeed = stableUnitValue(`${clusterId}:layout:angle:${attempt}`);
        const angle = angleSeed * Math.PI * 2;
        const x = Math.max(minX, Math.min(maxX, slotX + Math.cos(angle) * ring * step));
        const y = Math.max(minY, Math.min(maxY, slotY + Math.sin(angle) * ring * step));
        let collision = false;
        let penalty = 0;
        for (const placed of placedClusters) {
          const dx = x - placed.x;
          const dy = y - placed.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = radiusPct + placed.radiusPct + 0.9;
          if (distance < minDistance) {
            collision = true;
            penalty += minDistance - distance;
          }
        }
        if (!collision) return { x, y };
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          bestCandidate = { x, y };
        }
      }
      return bestCandidate;
    };

    // Pass 1: greedy placement. For each cluster, compute its size and a
    // best-effort non-overlapping initial position. The shrink-on-collision
    // heuristic is preserved as a cheap first pass, but with the new 72px
    // floor it rarely changes anything — the real overlap cleanup happens
    // in pass 2 below.
    const layouts: Array<{
      cluster: typeof orderedClusters[number];
      size: number;
      radiusPct: number;
    }> = [];
    for (let index = 0; index < orderedClusters.length; index += 1) {
      const cluster = orderedClusters[index];
      const slot = MEMORY_BUBBLE_CLOUD_SLOTS[index % MEMORY_BUBBLE_CLOUD_SLOTS.length];
      const slotLoop = Math.floor(index / MEMORY_BUBBLE_CLOUD_SLOTS.length);
      const baseSize = ratioBubbleSize(cluster.memoryCount, maxCount);
      let size = Math.max(MEMORY_RATIO_MIN_SIZE, Math.round(baseSize * crowdScale));
      let radiusPct = (size / 2) * pxToPct;
      let baseX = slot[0] + ((slotLoop % 3) - 1) * 4 + (stableUnitValue(`${cluster.id}:x`) - 0.5) * 6;
      let baseY = slot[1] + ((slotLoop % 2) * 5 - 2.5) + (stableUnitValue(`${cluster.id}:y`) - 0.5) * 6;
      let placed = placeWithoutOverlap(cluster.id, baseX, baseY, radiusPct);

      for (let shrink = 0; shrink < 3; shrink += 1) {
        let collides = false;
        for (const existing of placedClusters) {
          const dx = placed.x - existing.x;
          const dy = placed.y - existing.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < radiusPct + existing.radiusPct + 0.9) {
            collides = true;
            break;
          }
        }
        if (!collides) break;
        size = Math.max(MEMORY_RATIO_MIN_SIZE, Math.round(size * 0.9));
        radiusPct = (size / 2) * pxToPct;
        baseX = Math.max(8 + radiusPct, Math.min(92 - radiusPct, baseX));
        baseY = Math.max(10 + radiusPct, Math.min(90 - radiusPct, baseY));
        placed = placeWithoutOverlap(`${cluster.id}:shrink:${shrink}`, baseX, baseY, radiusPct);
      }

      placedClusters.push({ x: placed.x, y: placed.y, radiusPct });
      layouts.push({ cluster, size, radiusPct });
    }

    // Pass 2: relaxation. Iteratively push apart any overlapping pairs
    // along the connecting line until everyone settles. This catches the
    // cases where greedy placement landed two orbs in each other's space
    // because later orbs had to thread through gaps. The buffer (1.4%) is
    // wider than the placement buffer (0.9%) so neighbors get a small
    // breathing gap rather than touching edges.
    const RELAX_BUFFER_PCT = 1.4;
    const RELAX_ITERATIONS = 80;
    const RELAX_PUSH = 0.52;
    const RELAX_SETTLE_THRESHOLD = 0.04;
    for (let iter = 0; iter < RELAX_ITERATIONS; iter += 1) {
      let maxOverlap = 0;
      for (let i = 0; i < placedClusters.length; i += 1) {
        for (let j = i + 1; j < placedClusters.length; j += 1) {
          const a = placedClusters[i];
          const b = placedClusters[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rawDistance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = a.radiusPct + b.radiusPct + RELAX_BUFFER_PCT;
          if (rawDistance < minDistance) {
            // Co-located orbs: pick a stable fallback direction so they
            // don't divide-by-zero into NaN positions.
            const distance = rawDistance > 0.0001 ? rawDistance : 0.0001;
            const nx = rawDistance > 0.0001 ? dx / distance : 1;
            const ny = rawDistance > 0.0001 ? dy / distance : 0;
            const overlap = minDistance - distance;
            maxOverlap = Math.max(maxOverlap, overlap);
            const push = overlap * RELAX_PUSH;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            a.x = Math.max(8 + a.radiusPct, Math.min(92 - a.radiusPct, a.x));
            a.y = Math.max(10 + a.radiusPct, Math.min(90 - a.radiusPct, a.y));
            b.x = Math.max(8 + b.radiusPct, Math.min(92 - b.radiusPct, b.x));
            b.y = Math.max(10 + b.radiusPct, Math.min(90 - b.radiusPct, b.y));
          }
        }
      }
      if (maxOverlap < RELAX_SETTLE_THRESHOLD) break;
    }

    return layouts.map(({ cluster, size }, index) => {
      const placed = placedClusters[index];
      const fill = mixHex(cluster.color, resolvedTheme === "dark" ? "#111114" : "#fbf3e6", 0.72);
      const border = ensureContrast(
        mixHex(cluster.color, resolvedTheme === "dark" ? "#ffffff" : "#20170f", resolvedTheme === "dark" ? 0.38 : 0.18),
        fill,
        2.1
      );
      const ink = pickReadableText(fill);
      return {
        ...cluster,
        style: {
          "--memory-bubble-size": `${size}px`,
          "--memory-cloud-x": `${placed.x.toFixed(2)}%`,
          "--memory-cloud-y": `${placed.y.toFixed(2)}%`,
          "--memory-bubble-color": fill,
          "--memory-bubble-border": border,
          "--memory-bubble-ink": ink,
          "--memory-bubble-source-color": cluster.color,
          "--memory-bubble-glow": cluster.color,
          "--memory-source-glyph-color": ensureContrast(cluster.color, fill, 2),
          "--memory-bubble-tilt": `${Math.round((stableUnitValue(`${cluster.id}:tilt`) - 0.5) * 8)}deg`,
          "--memory-bubble-z": `${20 + index}`,
        } as React.CSSProperties,
        innerBubbles: buildInnerBubbles(cluster.id, cluster.memoryCount, size),
      };
    });
  }, [
    memoryPanelSelectedFamily,
    bots,
    directMemoryCountsByBotId,
    selectedMemoryFamilyDirectory?.color,
    resolvedTheme,
  ]);

  const visibleMemoryBubbles = useMemo(
    () => (
      memoryPanelScope === "all"
        ? []
        : botMemories
    ),
    [memoryPanelScope, botMemories]
  );

  const memoryBubbleLayoutById = useMemo(() => {
    const layoutById = new Map<string, { style: React.CSSProperties; uncertain: boolean }>();
    if (memoryPanelScope !== "bot" && memoryPanelScope !== "default") return layoutById;
    if (visibleMemoryBubbles.length === 0) return layoutById;

    const pxToPct = 100 / 520;
    const bounds = { minX: 8, maxX: 92, minY: 10, maxY: 90 };
    const shadePattern = [0.08, 0.16, 0.24, 0.12, 0.28, 0.2];
    const shadeTarget = resolvedTheme === "dark" ? "#ffffff" : "#000000";
    const placed: Array<{ x: number; y: number; radiusPct: number }> = [];

    const entries = visibleMemoryBubbles.map((memory) => {
      const confidence = memoryBubbleSignalValue(memory);
      const uncertain = confidence <= MEMORY_UNCERTAIN_CONFIDENCE_MAX;
      const confidenceScale = uncertain
        ? Math.max(0, Math.min(1, confidence / MEMORY_UNCERTAIN_CONFIDENCE_MAX))
        : Math.max(0, Math.min(1, (confidence - MEMORY_UNCERTAIN_CONFIDENCE_MAX) / (1 - MEMORY_UNCERTAIN_CONFIDENCE_MAX)));
      // Use the visible confidence band, not raw 0..1, so normal direct
      // memories (roughly 0.62-0.92 in dev seeding) spread across the compact
      // size range instead of bunching into near-identical circles.
      const easedConfidence = Math.pow(confidenceScale, 0.82);
      const size = uncertain
        ? Math.round(MEMORY_UNCERTAIN_BUBBLE_MIN_SIZE + easedConfidence * (MEMORY_UNCERTAIN_BUBBLE_MAX_SIZE - MEMORY_UNCERTAIN_BUBBLE_MIN_SIZE))
        : Math.round(MEMORY_BUBBLE_MIN_SIZE + easedConfidence * (MEMORY_BUBBLE_MAX_SIZE - MEMORY_BUBBLE_MIN_SIZE));
      return { memory, confidence, uncertain, size };
    });

    const sorted = [...entries].sort((a, b) => b.size - a.size);

    const findPlacement = (
      seed: string,
      anchorX: number,
      anchorY: number,
      radiusPct: number
    ): { x: number; y: number } => {
      const minX = bounds.minX + radiusPct;
      const maxX = bounds.maxX - radiusPct;
      const minY = bounds.minY + radiusPct;
      const maxY = bounds.maxY - radiusPct;

      let best = {
        x: Math.max(minX, Math.min(maxX, anchorX)),
        y: Math.max(minY, Math.min(maxY, anchorY)),
      };
      let bestPenalty = Number.POSITIVE_INFINITY;
      for (let attempt = 0; attempt < 220; attempt += 1) {
        const ring = Math.floor(attempt / 20);
        const step = 1.4 + radiusPct * 0.3;
        const angle = stableUnitValue(`${seed}:a:${attempt}`) * Math.PI * 2;
        const x = Math.max(minX, Math.min(maxX, anchorX + Math.cos(angle) * ring * step));
        const y = Math.max(minY, Math.min(maxY, anchorY + Math.sin(angle) * ring * step));

        let collision = false;
        let penalty = 0;
        for (const other of placed) {
          const dx = x - other.x;
          const dy = y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = radiusPct + other.radiusPct + 0.85;
          if (distance < minDistance) {
            collision = true;
            penalty += minDistance - distance;
          }
        }
        if (!collision) return { x, y };
        if (penalty < bestPenalty) {
          bestPenalty = penalty;
          best = { x, y };
        }
      }
      return best;
    };

    const layoutEntries: Array<{
      entry: (typeof sorted)[number];
      sortedIndex: number;
      size: number;
    }> = [];

    sorted.forEach((entry, sortedIndex) => {
      const slot = MEMORY_BUBBLE_CLOUD_SLOTS[sortedIndex % MEMORY_BUBBLE_CLOUD_SLOTS.length];
      const slotLoop = Math.floor(sortedIndex / MEMORY_BUBBLE_CLOUD_SLOTS.length);
      let size = entry.size;
      let radiusPct = (size / 2) * pxToPct;
      let baseX =
        slot[0] + ((slotLoop % 3) - 1) * 4 + (stableUnitValue(`${entry.memory.id}:x`) - 0.5) * 7;
      let baseY =
        slot[1] + ((slotLoop % 2) * 5 - 2.5) + (stableUnitValue(`${entry.memory.id}:y`) - 0.5) * 7;
      let placedPoint = findPlacement(entry.memory.id, baseX, baseY, radiusPct);

      for (let shrink = 0; shrink < 4; shrink += 1) {
        const overlaps = placed.some((other) => {
          const dx = placedPoint.x - other.x;
          const dy = placedPoint.y - other.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          return distance < radiusPct + other.radiusPct + 0.85;
        });
        if (!overlaps) break;
        size = Math.max(entry.uncertain ? MEMORY_UNCERTAIN_BUBBLE_MIN_SIZE : MEMORY_BUBBLE_MIN_SIZE, Math.round(size * 0.94));
        radiusPct = (size / 2) * pxToPct;
        baseX = Math.max(bounds.minX + radiusPct, Math.min(bounds.maxX - radiusPct, baseX));
        baseY = Math.max(bounds.minY + radiusPct, Math.min(bounds.maxY - radiusPct, baseY));
        placedPoint = findPlacement(`${entry.memory.id}:shrink:${shrink}`, baseX, baseY, radiusPct);
      }

      placed.push({ x: placedPoint.x, y: placedPoint.y, radiusPct });
      layoutEntries.push({ entry, sortedIndex, size });
    });

    // A second relaxation pass keeps compact prose bubbles from piling up
    // after the greedy placement fallback chooses "least bad" positions.
    // The bubbles are small enough now that this can usually separate all
    // of them without additional shrinkage.
    const RELAX_BUFFER_PCT = 1.05;
    const RELAX_ITERATIONS = 100;
    const RELAX_PUSH = 0.56;
    const RELAX_SETTLE_THRESHOLD = 0.035;
    for (let iter = 0; iter < RELAX_ITERATIONS; iter += 1) {
      let maxOverlap = 0;
      for (let i = 0; i < placed.length; i += 1) {
        for (let j = i + 1; j < placed.length; j += 1) {
          const a = placed[i];
          const b = placed[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const rawDistance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = a.radiusPct + b.radiusPct + RELAX_BUFFER_PCT;
          if (rawDistance >= minDistance) continue;

          const distance = rawDistance > 0.0001 ? rawDistance : 0.0001;
          const nx = rawDistance > 0.0001 ? dx / distance : 1;
          const ny = rawDistance > 0.0001 ? dy / distance : 0;
          const overlap = minDistance - distance;
          maxOverlap = Math.max(maxOverlap, overlap);

          const push = overlap * RELAX_PUSH;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;

          a.x = Math.max(bounds.minX + a.radiusPct, Math.min(bounds.maxX - a.radiusPct, a.x));
          a.y = Math.max(bounds.minY + a.radiusPct, Math.min(bounds.maxY - a.radiusPct, a.y));
          b.x = Math.max(bounds.minX + b.radiusPct, Math.min(bounds.maxX - b.radiusPct, b.x));
          b.y = Math.max(bounds.minY + b.radiusPct, Math.min(bounds.maxY - b.radiusPct, b.y));
        }
      }
      if (maxOverlap < RELAX_SETTLE_THRESHOLD) break;
    }

    layoutEntries.forEach(({ entry, sortedIndex, size }, index) => {
      const placedPoint = placed[index];
      const bubbleAccent =
        memoryPanelScope === "default"
          ? resolvedTheme === "dark"
            ? "#cccccc"
            : "#444444"
          : memoryPanelAccent;
      const shade = mixHex(
        bubbleAccent,
        shadeTarget,
        shadePattern[sortedIndex % shadePattern.length]
      );
      const textLength = entry.memory.text.length;
      const fontDivisor = textLength > 92 ? 10.2 : textLength > 68 ? 9.2 : textLength > 46 ? 8.4 : 7.8;
      const fontSize = Math.max(11, Math.min(14, Math.round(size / fontDivisor)));
      const scoreSize = Math.max(13, Math.min(26, Math.round(size * 0.22)));
      const lineCount = size >= 118 ? 4 : 3;
      layoutById.set(entry.memory.id, {
        uncertain: entry.uncertain,
        style: {
          "--memory-bubble-size": `${size}px`,
          "--memory-bubble-color": shade,
          "--memory-bubble-source-color": bubbleAccent,
          "--memory-bubble-ink": pickReadableText(shade),
          "--memory-bubble-font-size": `${fontSize}px`,
          "--memory-bubble-score-size": `${scoreSize}px`,
          "--memory-bubble-line-count": lineCount,
          "--memory-cloud-x": `${placedPoint.x.toFixed(2)}%`,
          "--memory-cloud-y": `${placedPoint.y.toFixed(2)}%`,
          "--memory-bubble-tilt": `${Math.round((stableUnitValue(`${entry.memory.id}:tilt`) - 0.5) * 9)}deg`,
          "--memory-bubble-z": `${14 + sortedIndex}`,
        } as React.CSSProperties,
      });
    });
    return layoutById;
  }, [memoryPanelScope, visibleMemoryBubbles, memoryPanelAccent, resolvedTheme]);

  const selectedVisibleMemory = useMemo(
    () => visibleMemoryBubbles.find((memory) => memory.id === focusedMemoryId) ?? null,
    [focusedMemoryId, visibleMemoryBubbles]
  );

  useEffect(() => {
    if (memoryPanelScope !== "bot" && memoryPanelScope !== "default") {
      setFocusedMemoryId(null);
      return;
    }
    if (focusedMemoryId && !visibleMemoryBubbles.some((memory) => memory.id === focusedMemoryId)) {
      setFocusedMemoryId(null);
    }
  }, [focusedMemoryId, memoryPanelScope, visibleMemoryBubbles]);

  useEffect(() => {
    if (panel !== "memories") return;
    const root = memoryPanelRef.current;
    if (!root) return;

    const startPhysics = () => {
      const cloud = root.querySelector<HTMLElement>(`.${styles.memoryBubbleCloud}`);
      if (!cloud) return;
      const nodes = Array.from(
        cloud.querySelectorAll<HTMLElement>("[data-memory-physics-id]")
      );
      if (nodes.length === 0) return;

      // Keep hit targets stable on narrow/drawer layouts. The one-shot
      // drawer inertia effect slightly moves absolute-positioned orb bounds,
      // which can cause pointer/default cursor flapping when a pointer sits
      // near an edge. Desktop keeps the physics flourish.
      if (viewportWidth <= SIDEBAR_DRAWER_BREAKPOINT) {
        for (const node of nodes) {
          node.style.setProperty("--memory-physics-x", "0px");
          node.style.setProperty("--memory-physics-y", "0px");
        }
        setMemoryPhysicsActive(false);
        return;
      }

      if (memoryPhysicsFrameRef.current !== null) {
        window.cancelAnimationFrame(memoryPhysicsFrameRef.current);
        memoryPhysicsFrameRef.current = null;
      }

      // Reset every body's offset BEFORE measuring so getBoundingClientRect
      // reads the true layout target — not a residual physics offset from a
      // previous open. Without this, reopening the drawer measures stale
      // positions and the next sim looks "pre-scripted" / glitchy.
      for (const node of nodes) {
        node.style.setProperty("--memory-physics-x", "0px");
        node.style.setProperty("--memory-physics-y", "0px");
      }

      const cloudRect = cloud.getBoundingClientRect();
      // Unified drawer-inertia impulse. The right-hand panel slides in from
      // off-screen-right and decelerates to a stop, so its children feel a
      // simultaneous leftward "g-force" — like passengers in a car that
      // just braked. Random per-item jitter (in BOTH starting offset and
      // velocity) keeps it from feeling like a synchronized swim while
      // preserving the shared direction cue.
      const drawerDirX = MEMORY_PHYSICS_DRAWER_DIR_X;
      const bodies = nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        const radiusX = rect.width / 2;
        const radiusY = rect.height / 2;
        const targetX = rect.left - cloudRect.left + radiusX;
        const targetY = rect.top - cloudRect.top + radiusY;
        const minX = radiusX;
        const maxX = Math.max(minX, cloudRect.width - radiusX);
        const minY = radiusY;
        const maxY = Math.max(minY, cloudRect.height - radiusY);
        // Initial offset: tiny — items lag the drawer's leftward slide
        // by a few px so they appear to "still be catching up" the moment
        // the drawer parks.
        const offsetX = -drawerDirX * 6 + (Math.random() - 0.5) * MEMORY_PHYSICS_OFFSET_JITTER_X;
        const offsetY = (Math.random() - 0.5) * MEMORY_PHYSICS_OFFSET_JITTER_Y;
        // Velocity: the bulk leftward kick + symmetric jitter. Y component
        // has more spread because there's no shared vertical impulse, so
        // the noise reads as natural unsettling.
        const vx =
          drawerDirX * MEMORY_PHYSICS_DRAWER_VELOCITY +
          (Math.random() - 0.5) * MEMORY_PHYSICS_VELOCITY_JITTER_X;
        const vy = (Math.random() - 0.5) * MEMORY_PHYSICS_VELOCITY_JITTER_Y;
        node.style.setProperty("--memory-physics-x", `${offsetX.toFixed(2)}px`);
        node.style.setProperty("--memory-physics-y", `${offsetY.toFixed(2)}px`);
        return {
          node,
          targetX,
          targetY,
          minX,
          maxX,
          minY,
          maxY,
          x: offsetX,
          y: offsetY,
          vx,
          vy,
        };
      });

      setMemoryPhysicsActive(true);

      let lastTime: number | null = null;
      let elapsed = 0;
      const step = (time: number) => {
        if (lastTime === null) lastTime = time;
        const dt = Math.min(0.033, (time - lastTime) / 1000);
        lastTime = time;
        elapsed += dt * 1000;

        for (const body of bodies) {
          const ax = -body.x * MEMORY_PHYSICS_SPRING - body.vx * MEMORY_PHYSICS_DAMPING;
          const ay = -body.y * MEMORY_PHYSICS_SPRING - body.vy * MEMORY_PHYSICS_DAMPING;
          body.vx += ax * dt;
          body.vy += ay * dt;
          body.x += body.vx * dt;
          body.y += body.vy * dt;

          const worldX = body.targetX + body.x;
          const worldY = body.targetY + body.y;
          if (worldX < body.minX) {
            body.x = body.minX - body.targetX;
            body.vx = Math.abs(body.vx) * MEMORY_PHYSICS_WALL_RESTITUTION;
          }
          if (worldX > body.maxX) {
            body.x = body.maxX - body.targetX;
            body.vx = -Math.abs(body.vx) * MEMORY_PHYSICS_WALL_RESTITUTION;
          }
          if (worldY < body.minY) {
            body.y = body.minY - body.targetY;
            body.vy = Math.abs(body.vy) * MEMORY_PHYSICS_WALL_RESTITUTION;
          }
          if (worldY > body.maxY) {
            body.y = body.maxY - body.targetY;
            body.vy = -Math.abs(body.vy) * MEMORY_PHYSICS_WALL_RESTITUTION;
          }

          body.node.style.setProperty("--memory-physics-x", `${body.x.toFixed(2)}px`);
          body.node.style.setProperty("--memory-physics-y", `${body.y.toFixed(2)}px`);
        }

        const stillMoving = bodies.some((body) =>
          Math.abs(body.x) > 0.35 ||
          Math.abs(body.y) > 0.35 ||
          Math.abs(body.vx) > 2 ||
          Math.abs(body.vy) > 2
        );
        if (elapsed < MEMORY_PHYSICS_DURATION_MS && stillMoving) {
          memoryPhysicsFrameRef.current = window.requestAnimationFrame(step);
          return;
        }
        for (const body of bodies) {
          body.node.style.setProperty("--memory-physics-x", "0px");
          body.node.style.setProperty("--memory-physics-y", "0px");
        }
        memoryPhysicsFrameRef.current = null;
        setMemoryPhysicsActive(false);
      };

      memoryPhysicsFrameRef.current = window.requestAnimationFrame(step);
    };

    // Time the physics kick to coincide with the panelIn animation's
    // settle (the panel slides for ~200ms then snaps to rest). Firing
    // ~140ms in lets the drawer reach its decelerating tail before the
    // contents register the "stop", so the leftward overshoot reads as
    // a consequence of the drawer braking — not as the bubbles moving on
    // their own. Two rAFs after the timeout guarantee layout has stabilized
    // before we measure each node's target position.
    const startTimeout = window.setTimeout(() => {
      const firstFrame = window.requestAnimationFrame(() => {
        window.requestAnimationFrame(startPhysics);
      });
      memoryPhysicsFrameRef.current = firstFrame;
    }, 140);
    return () => {
      window.clearTimeout(startTimeout);
      if (memoryPhysicsFrameRef.current !== null) {
        window.cancelAnimationFrame(memoryPhysicsFrameRef.current);
        memoryPhysicsFrameRef.current = null;
      }
      setMemoryPhysicsActive(false);
    };
  }, [panel, memoryPhysicsSeed, viewportWidth]);

  function renderComposeUtilityActions(): React.JSX.Element {
    return (
      <div className={styles.composeUtilityActions}>
        <button
          type="button"
          className={`${styles.headerIconButton} ${styles.composeUtilityButton}`}
          onClick={resetChatHeaderToSpotlight}
          aria-label="Open Spotlight search"
          title="Open Spotlight search"
        >
          <SearchGlyph />
        </button>
        <button
          type="button"
          className={`${styles.headerIconButton} ${styles.composeUtilityButton}`}
          onClick={handleHeaderHubClick}
          aria-label="Back to Hub"
          title="Back to Hub"
        >
          <HomeGlyph />
        </button>
        <button
          type="button"
          className={`${styles.themeToggleButton} ${styles.composeUtilityButton}`}
          onClick={() => void cycleThemeMode()}
          aria-label={
            effectiveThemeMode === "system"
              ? `Theme: Auto, currently ${THEME_LABEL[resolvedTheme]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
              : `Theme: ${THEME_LABEL[effectiveThemeMode]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
          }
          data-title={
            effectiveThemeMode === "system"
              ? `Theme: Auto (${THEME_LABEL[resolvedTheme]})`
              : `Theme: ${THEME_LABEL[effectiveThemeMode]}`
          }
        >
          <ThemeGlyph mode={effectiveThemeMode} />
        </button>
        <button
          type="button"
          className={`${styles.headerIconButton} ${styles.composeUtilityButton}`}
          onClick={sendRandomConversationNudge}
          aria-label="Send random suggested prompt"
          title="Send random suggested prompt"
          disabled={pendingReply}
        >
          <BotGlyph name="dice" size={16} strokeWidth={1.85} />
        </button>
        {renderDevToolsButton()}
      </div>
    );
  }


  async function saveBot(id: string) {
    const trimmedName = newBotName.trim();
    if (!trimmedName) return;
    const localModel = visibleBotCustomizerModelChoice(settings, newBotLocalModel);
    const onlineModel = visibleBotCustomizerModelChoice(settings, newBotOnlineModel);
    setBusy(true);
    setPanelError(null);
    setPanelNotice(null);
    try {
      await api(`/api/bots/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmedName,
          systemPrompt: serializeStoredBotPrompt(botProfile, trimmedName),
          localModel: localModel === AUTO_MODEL_CHOICE ? "" : localModel,
          onlineModel: onlineModel === AUTO_MODEL_CHOICE ? "" : onlineModel,
          onlineEnabled: newBotOnlineEnabled,
          deleteProtected: newBotDeleteProtected,
          temperature: newBotTemperature,
          maxTokens: newBotMaxTokens,
          color: newBotColor,
          glyph: newBotGlyph,
        }),
      });
      setNewBotLocalModel(localModel);
      setNewBotOnlineModel(onlineModel);
      editOriginalRef.current = {
        name: trimmedName,
        prompt: serializeStoredBotPrompt(botProfile, trimmedName),
        localModel,
        onlineModel,
        onlineEnabled: newBotOnlineEnabled,
        deleteProtected: newBotDeleteProtected,
        temperature: newBotTemperature,
        maxTokens: newBotMaxTokens,
        color: newBotColor,
        glyph: newBotGlyph,
      };
      setEditingBotId(id);
      setColorWheelOpen(false);
      await refreshBots();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  // Single submit handler for the top form: routes to createBot or
  // saveBot based on whether editingBotId is set. Keeps the JSX's
  // onSubmit one line and lets mode-switch logic live next to the API
  // calls it dispatches to.
  async function submitBotForm(event: React.FormEvent) {
    event.preventDefault();
    if (!newBotName.trim()) return;
    if (editingBotId) {
      await saveBot(editingBotId);
    } else {
      await createBot();
    }
  }

  async function generateImg(e: React.FormEvent) {
    e.preventDefault(); if (!imagePrompt.trim()) return; setBusy(true); setPanelError(null);
    try { await api("/api/images/generate", { method: "POST", body: JSON.stringify({ prompt: imagePrompt, conversationId: selectedId }) }); setImagePrompt(""); await refreshImages(); }
    catch (err) { setPanelError(err instanceof Error ? err.message : "Image gen failed."); }
    finally { setBusy(false); }
  }

  const secondaryOllamaUiStatus: SecondaryOllamaUiStatus =
    !secondaryOllamaDraftHost
      ? "unconfigured"
      : secondaryOllamaStatusChecking
          ? "checking"
          : secondaryOllamaStatus?.reachable
            ? secondaryOllamaStatus.modelCount > 0
              ? "connected"
              : "empty"
            : "error";
  const secondaryOllamaStatusText =
    secondaryOllamaUiStatus === "connected"
      ? `Connected · ${secondaryOllamaStatus?.modelCount ?? 0} model${
          secondaryOllamaStatus?.modelCount === 1 ? "" : "s"
        }`
      : secondaryOllamaUiStatus === "empty"
        ? "Connected · no models"
        : secondaryOllamaUiStatus === "checking"
          ? "Checking..."
          : secondaryOllamaUiStatus === "error"
              ? "Not reachable"
              : "Optional";

  if (clientAccessState !== "allowed") {
    const isChecking = clientAccessState === "checking";
    return (
      <main className={`${styles.authLayout} ${themeClass}`}>
        <div className={styles.card}>
          <div className={styles.brandLockup}>
            <div className={styles.brandIconShell} aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon.jpg" alt="" aria-hidden="true" className={styles.brandIcon} />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/icon-triangle.svg" alt="" aria-hidden="true" className={styles.brandIconLight} />
            </div>
            <PrismWordmark className={styles.brandWordmark} />
          </div>
          <p className={styles.muted}>Local-first AI playground. ChatGPT Gov fidelity, FL Studio creativity.</p>
          <h2 className={styles.authHeading}>
            {isChecking ? "Connecting to Prism" : "Open Prism in the app"}
          </h2>
          <p className={styles.muted}>
            {isChecking
              ? "Checking native client access..."
              : "This web surface is available after pairing through the Prism iOS or Mac client."}
          </p>
        </div>
      </main>
    );
  }

  function renderMessageContextMenu(): React.JSX.Element | null {
    if (!messageContextMenu) return null;
    const msg = messageContextMenu.message;
    const isUser = msg.role === "user";
    const showFork = !detail?.incognito;
    return (
      <>
        <button
          type="button"
          className={styles.messageContextBackdrop}
          aria-label="Close message actions"
          data-msg-focus-overlay={mobileFocusedMessageId ? "true" : undefined}
          onClick={() => closeMessageContextOverlay()}
        />
        <div
          ref={messageActionsMenuRef}
          className={styles.messageContextMenu}
          data-anchor={messageContextMenu.anchor}
          style={{
            left: `${messageContextMenu.x}px`,
            top: `${messageContextMenu.y}px`,
            "--message-context-accent": deriveMobileMessageFocusAccent(msg),
          } as React.CSSProperties}
          role="menu"
          aria-label="Message actions"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMessageContextOverlay();
              void copyMessageToClipboard(msg);
            }}
          >
            Copy
          </button>
          {isUser && (
            <>
              <button
                key={`default:${memoryPhysicsSeed}`}
                type="button"
                role="menuitem"
                onClick={() => beginEditMessage(msg)}
              >
                Edit
              </button>
            </>
          )}
          {showFork && !isUser && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                closeMessageContextOverlay();
                void forkChat(msg.id);
              }}
            >
              Fork
            </button>
          )}
        </div>
      </>
    );
  }

  function renderBotContextMenu(): React.JSX.Element | null {
    if (!botContextMenu) return null;
    const bot = bots.find((candidate) => candidate.id === botContextMenu.botId);
    if (!bot) return null;
    const menuStyle = {
      left: `${botContextMenu.x}px`,
      top: `${botContextMenu.y}px`,
      "--bot-color": normalizeAccentForTheme(bot.color ?? PRISM_DEFAULT_ACCENT, resolvedTheme),
    } as React.CSSProperties;
    return (
      <div
        ref={botContextMenuRef}
        className={`${styles.messageContextMenu} ${styles.botContextMenu}`}
        style={menuStyle}
        role="menu"
        aria-label={`${bot.name} actions`}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => void cloneBot(bot)}
        >
          Clone bot
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            closeBotContextMenu();
            openBotCustomizer(bot);
          }}
        >
          Edit bot
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            closeBotContextMenu();
            openMemoriesPanelForBot(bot);
          }}
        >
          View memories
        </button>
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            closeBotContextMenu();
            const confirmed = window.confirm(`Delete ${bot.name}? This cannot be undone.`);
            if (confirmed) void deleteBot(bot.id);
          }}
        >
          Delete bot
        </button>
      </div>
    );
  }

  // ── Auth screen ──
  if (!user) return (
    <main className={`${styles.authLayout} ${themeClass}`}>
      <div className={`${styles.card} ${styles.authCard}`}>
        <div className={styles.brandLockup}>
          {/* Static icon artwork wrapped in a dedicated halo shell. The shell's
              pseudo-elements own the animated prismatic glows so the icon
              itself stays crisp while the color motion happens behind it.
              Two icon variants live here; CSS picks which one is visible
              based on the current theme:
                - .brandIcon (dark): the black-tile JPG + animated halos
                - .brandIconLight (light): a clean rainbow-stroke triangle,
                  no tile, no halos, just a soft drop-shadow. */}
          <div className={styles.brandIconShell} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.jpg"
              alt=""
              aria-hidden="true"
              className={styles.brandIcon}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-triangle.svg"
              alt=""
              aria-hidden="true"
              className={styles.brandIconLight}
            />
          </div>
          <PrismWordmark className={styles.brandWordmark} />
        </div>
        <p className={styles.muted}>Local-first AI playground. ChatGPT Gov fidelity, FL Studio creativity.</p>
        <div className={styles.authControls}>
          <div className={styles.authToggle}>
            <a
              href="?mode=register"
              className={authMode === "register" ? styles.selected : ""}
              onClick={() => setError(null)}
            >
              Register
            </a>
            <a
              href="?mode=login"
              className={authMode === "login" ? styles.selected : ""}
              onClick={() => setError(null)}
            >
              Login
            </a>
          </div>
          <button
            type="button"
            className={styles.themeToggleButton}
            onClick={() => void cycleThemeMode()}
            aria-label={
              effectiveThemeMode === "system"
                ? `Theme: Auto, currently ${THEME_LABEL[resolvedTheme]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
                : `Theme: ${THEME_LABEL[effectiveThemeMode]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
            }
            data-title={
              effectiveThemeMode === "system"
                ? `Theme: Auto (${THEME_LABEL[resolvedTheme]})`
                : `Theme: ${THEME_LABEL[effectiveThemeMode]}`
            }
          >
            <ThemeGlyph mode={effectiveThemeMode} />
          </button>
        </div>
        <h2 className={styles.authHeading}>{authMode === "register" ? "Create your account" : "Welcome back"}</h2>
        <form onSubmit={submitAuth} className={styles.form}>
          {authMode === "register" && <input required value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Display name" />}
          <input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
          <input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
          <button disabled={busy} type="submit">{busy ? "Working..." : authMode === "register" ? "Create account" : "Log in"}</button>
          {error && <p className={styles.error}>{error}</p>}
        </form>
      </div>
    </main>
  );

  // ── Sidebar × delete button ─────────────────────────────────────────
  // Shared renderer used by both the Chat-mode and Sandbox-mode sidebars
  // so the hold-to-delete-all gesture and the two-stage single-chat
  // confirm stay in lockstep. Visually the button only ever expresses
  // four states itself: idle (muted × glyph), hover (embossed red),
  // holding (immediate glow + static tilt driven by nth-child), and
  // armed-single (the inline "Are you sure? ✓" pill). The armed-all
  // state is NOT rendered on the button — it surfaces as a centered
  // alertdialog modal instead. The list-level `data-delete-holding` /
  // `data-delete-armed-all` attributes are what turn the siblings into
  // ambient participants (glow, tilt, jiggle).
  const renderChatDeleteButton = (c: ConversationSummary) => {
    const isArmedSingle = pendingDeleteKey === c.id;

    const className = [
      styles.conversationDelete,
      isArmedSingle ? styles.conversationDeleteArmed : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        type="button"
        className={className}
        data-delete-affordance="true"
        aria-label={
          isArmedSingle
            ? `Confirm delete ${c.title}`
            : `Delete ${c.title}`
        }
        title={isArmedSingle ? undefined : "Delete chat"}
        onClick={(e) => {
          e.stopPropagation();
          if (isArmedSingle) {
            void deleteConversation(c.id);
          } else {
            armDelete(c.id);
          }
        }}
      >
        {isArmedSingle && (
          <span className={styles.conversationDeletePrompt}>Are you sure?</span>
        )}
        <span className={styles.conversationDeleteGlyph}>
          {isArmedSingle ? "✓" : "×"}
        </span>
      </button>
    );
  };

  const conversationRowStyle = (
    c: ConversationSummary,
    index: number
  ): React.CSSProperties => {
    const rawRowColor = privateChatActive ? null : resolveRowColor(c, bots);
    const rowAccent = rawRowColor
      ? normalizeAccentForTheme(rawRowColor, resolvedTheme)
      : !privateChatActive && !c.incognito
        ? neutralRowColor(resolvedTheme)
        : null;
    return {
      ...conversationRowGlowStyle(index),
      ...(rowAccent
        ? {
            "--row-color": rowAccent,
            "--row-border-mix": `${rowBorderMixPercent(rowAccent, resolvedTheme)}%`,
          }
        : {}),
    } as React.CSSProperties;
  };

  const conversationGroupStyle = (
    group: ConversationGroupSummary,
    index: number
  ): React.CSSProperties => {
    const rawRowColor = group.color;
    const rowAccent = rawRowColor
      ? normalizeAccentForTheme(rawRowColor, resolvedTheme)
      : neutralRowColor(resolvedTheme);
    return {
      ...conversationRowGlowStyle(index),
      "--row-color": rowAccent,
      "--row-border-mix": `${rowBorderMixPercent(rowAccent, resolvedTheme)}%`,
    } as React.CSSProperties;
  };

  const renderConversationRow = (
    c: ConversationSummary,
    index: number
  ): React.JSX.Element => {
    const isSelected = c.id === selectedId;
    const isUnread = unreadConversationIds.has(c.id);
    return (
      <li
        key={c.id}
        className={styles.conversationRow}
        data-private={c.incognito ? "true" : undefined}
        data-unread={isUnread ? "true" : undefined}
        style={conversationRowStyle(c, index)}
      >
        <button
          type="button"
          className={`${styles.conversationTitleButton} ${isSelected ? styles.selected : ""}`}
          onClick={() => {
            disarmDelete();
            clearConversationUnread(c.id);
            void refreshConversation(c.id);
            setSidebarOpen(false);
          }}
        >
          {c.title}
        </button>
        {!isSelected && renderChatDeleteButton(c)}
      </li>
    );
  };

  function renderConversationGroupDeleteButton(group: ConversationGroupSummary): React.JSX.Element {
    const deleteKey = conversationGroupDeleteKey(group.key);
    const isArmedSingle = pendingDeleteKey === deleteKey;
    const className = [
      styles.conversationDelete,
      isArmedSingle ? styles.conversationDeleteArmed : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        type="button"
        className={className}
        data-delete-affordance="true"
        aria-label={
          isArmedSingle
            ? `Confirm delete ${group.name} conversations`
            : `Delete ${group.name} conversations`
        }
        title={isArmedSingle ? undefined : `Delete ${group.name} chats`}
        onClick={(event) => {
          event.stopPropagation();
          if (isArmedSingle) {
            void deleteConversationGroup(group);
          } else {
            armDelete(deleteKey);
          }
        }}
      >
        {isArmedSingle && (
          <span className={styles.conversationDeletePrompt}>Are you sure?</span>
        )}
        <span className={styles.conversationDeleteGlyph}>
          {isArmedSingle ? "✓" : "×"}
        </span>
      </button>
    );
  }

  const renderConversationGroupTile = (
    group: ConversationGroupSummary,
    index: number
  ): React.JSX.Element => {
    return (
      <li
        key={group.key}
        className={styles.conversationRow}
        data-unread={group.unread ? "true" : undefined}
        style={conversationGroupStyle(group, index)}
      >
        <button
          type="button"
          className={styles.conversationGroupTile}
          onClick={() => {
            disarmDelete();
            setOpenConversationGroupKey(group.key);
            setConversationListScrollTop(0);
          }}
          aria-label={`Open ${group.name} conversations`}
        >
          <span className={styles.conversationGroupGlyph} aria-hidden="true">
            <BotGlyph name={group.glyph} size={20} strokeWidth={1.5} />
          </span>
          <span className={styles.conversationGroupText}>
            <span className={styles.conversationGroupName}>{group.name}</span>
            <span className={styles.conversationGroupCount}>
              {group.count} chats
            </span>
          </span>
        </button>
        {renderConversationGroupDeleteButton(group)}
      </li>
    );
  };

  const renderConversationListContents = (): React.JSX.Element[] => {
    const rows: React.JSX.Element[] = [];
    if (showPrivateConversationEmptyState) {
      rows.push(
        <li key="private-empty" className={styles.conversationListEmptyState}>
          Private chats aren&apos;t saved.
        </li>
      );
    }
    if (openConversationGroup) {
      rows.push(
        <li key="group-back" className={styles.conversationGroupBackRow}>
          <button
            type="button"
            className={styles.conversationGroupBackButton}
            onClick={() => {
              disarmDelete();
              setOpenConversationGroupKey(null);
            }}
          >
            ← Back to conversations
          </button>
          <div className={styles.conversationGroupOpenHeader}>
            <span className={styles.conversationGroupGlyph} aria-hidden="true">
              <BotGlyph name={openConversationGroup.glyph} size={18} strokeWidth={1.5} />
            </span>
            <span className={styles.conversationGroupText}>
              <span className={styles.conversationGroupName}>{openConversationGroup.name}</span>
              <span className={styles.conversationGroupCount}>
                {openConversationGroup.count} chats
              </span>
            </span>
          </div>
        </li>
      );
    }
    sidebarConversationItems.forEach((item) => {
      rows.push(
        item.kind === "group"
          ? renderConversationGroupTile(item.group, rows.length)
          : renderConversationRow(item.conversation, rows.length)
      );
    });
    return rows;
  };

  // ── Delete-all confirmation modal ─────────────────────────────────────
  // Rendered whenever `pendingDeleteKey` points at one of the bulk-delete
  // sentinels: the sidebar Conversations × for chats, or the existing
  // hold gesture for bots.
  // The modal is the definitive commit surface for the delete-all action
  // — the button under the user's finger never "becomes" the confirm pill
  // in this flow, because at-scale deletion deserves a dedicated
  // alertdialog with a real Cancel + a real Delete-all button.
  //
  // Focus: the Cancel button is auto-focused on mount (safer default;
  // Enter confirms it). On dismiss, the effect at `isDeleteAllActive`
  // restores focus to the element that opened the modal.
  //
  // Escape: handled globally in the same effect, so any focus target can cancel.
  const renderDeleteAllModal = () => {
    const isChats = pendingDeleteKey === DELETE_ALL_KEY;
    const isBots = pendingDeleteKey === DELETE_ALL_BOTS_KEY;
    if (!isChats && !isBots) return null;
    // One component, two modes. The sidebar Conversations × targets
    // conversations; the bot hold targets bots. We derive every
    // user-visible string + the confirm action from the armed key so both
    // contexts share every a11y / focus / dismissal affordance without
    // forking the JSX.
    const protectedBotCount = isBots
      ? bots.filter((bot) => bot.delete_protected === 1).length
      : 0;
    const count = isChats ? conversations.length : Math.max(0, bots.length - protectedBotCount);
    const noun = isChats
      ? count === 1 ? "conversation" : "conversations"
      : count === 1 ? "bot" : "bots";
    const title = isChats ? "Delete all chats?" : "Delete all unprotected bots?";
    const body = isChats
      ? count === 1
        ? "This will permanently remove your only conversation."
        : `This will permanently remove all ${count} conversations.`
      : count === 1
        ? "This will permanently remove your only unprotected bot."
        : `This will permanently remove all ${count} unprotected ${noun}.`;
    // What stays behind after the wipe — different trailing copy because
    // the two scopes have different "untouched" surfaces.
    const coda = isChats
      ? " Images and memories stay."
      : `${protectedBotCount > 0 ? " Protected bots will be kept." : ""} Chats using deleted bots stay (they fall back to Default).`;
    const onConfirm = () => {
      if (isChats) void deleteAllConversations();
      else void deleteAllBots();
    };
    return (
      <div
        className={styles.deleteAllModalBackdrop}
        data-delete-affordance="true"
        onClick={(event) => {
          // Clicks that originate on the backdrop itself dismiss; clicks
          // that bubble up from the panel have a stopPropagation guard
          // on the panel, so they never reach here.
          if (event.target === event.currentTarget) disarmDelete();
        }}
      >
        <div
          className={styles.deleteAllModalPanel}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-all-title"
          aria-describedby="delete-all-desc"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="delete-all-title" className={styles.deleteAllModalTitle}>
            {title}
          </h2>
          <p id="delete-all-desc" className={styles.deleteAllModalBody}>
            {body}{coda}
          </p>
          <div className={styles.deleteAllModalActions}>
            <button
              type="button"
              className={styles.deleteAllModalCancel}
              ref={(node) => {
                // Autofocus in a microtask so the modal's scale-in has
                // begun before the browser pulls focus, avoiding a
                // one-frame flash of unfocused Cancel.
                if (node) queueMicrotask(() => {
                  try { node.focus({ preventScroll: true }); } catch { /* ignore */ }
                });
              }}
              onClick={disarmDelete}
            >
              Cancel
            </button>
            <button
              type="button"
              className={styles.deleteAllModalConfirm}
              onClick={onConfirm}
              aria-label={`Delete all ${noun}`}
            >
              Delete all
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderMemoryToasts = () => {
    if (memoryToasts.length === 0) return null;
    const visible = memoryToasts.slice(0, MEMORY_TOAST_VISIBLE_LIMIT);
    const overflow = Math.max(0, memoryToasts.length - visible.length);
    return (
      <div className={styles.memoryToastStack} aria-live="polite">
        {visible.map((toast) => (
          <button
            key={toast.id}
            type="button"
            className={styles.memoryLearnedNotice}
            data-memory-toast-kind={toast.kind}
            onClick={() => void undoMemoryToast(toast)}
            onMouseEnter={() =>
              setPausedMemoryToastIds((current) => new Set(current).add(toast.id))
            }
            onMouseLeave={() => {
              setPausedMemoryToastIds((current) => {
                const next = new Set(current);
                next.delete(toast.id);
                return next;
              });
              setMemoryToasts((current) =>
                current.map((item) =>
                  item.id === toast.id
                    ? { ...item, expiresAt: Date.now() + MEMORY_TOAST_REARM_MS }
                    : item
                )
              );
            }}
            title={toast.kind === "rejected" ? "Tap to dismiss" : "Tap to undo"}
          >
            <span aria-hidden="true">
              {toast.kind === "created" ? "◆" : toast.kind === "retracted" ? "↺" : "◇"}
            </span>
            <strong>{memoryToastTitle(toast)}</strong>
            <small>{memoryToastDetail(toast)}</small>
          </button>
        ))}
        {overflow > 0 && (
          <div className={styles.memoryToastOverflow}>+{overflow} more</div>
        )}
      </div>
    );
  };

  /** Conversation tools — Memories / Edit bot / Export / Delete.
   *  Desktop renders inline in the chat header bar.
   *  Mobile floats a wrench gear at top-right that opens the menu as a popout. */
  const renderChatOverflowGear = (): React.JSX.Element | null => {
    if (!detail && !activeBot) return null;
    const gearHidden = sidebarOpen || panel !== null;
    const deleteArmed = pendingDeleteKey === HEADER_DELETE_KEY;
    const canBotActions = Boolean(activeBot);
    const canMemoryActions = Boolean(activeBot || defaultConversationUsesPrismIdentity);
    const canExport = Boolean(detail && selectedId);
    const canDelete = Boolean(detail && selectedId);
    const isMobileGear = viewportWidth <= PICKER_MOBILE_BREAKPOINT;

    const closeMenu = () => setChatOverflowMenuOpen(false);

    const handleMemories = () => {
      closeMenu();
      if (activeBot) {
        openMemoriesPanelForBot(activeBot);
      } else if (defaultConversationUsesPrismIdentity) {
        openDefaultMemoriesPanel();
      }
    };
    const handleEditBot = () => {
      closeMenu();
      openActiveBotCustomizer();
    };
    const handleExport = () => {
      closeMenu();
      void exportChat();
    };
    const handleDelete = () => {
      if (!selectedId) return;
      if (deleteArmed) {
        void deleteConversation(selectedId);
        closeMenu();
      } else {
        armDelete(HEADER_DELETE_KEY);
        closeMenu();
      }
    };
    const swallowMenuPointerDown = (
      event: React.PointerEvent<HTMLElement>
    ) => {
      event.stopPropagation();
    };
    const swallowMenuEvent = (
      event:
        | React.MouseEvent<HTMLElement>
        | React.SyntheticEvent<HTMLElement>
    ) => {
      event.preventDefault();
      event.stopPropagation();
    };

    if (!isMobileGear) {
      // Desktop: surface the four actions directly in the chat header so
      // there's no extra click to reach Memories / Edit bot / Export / Delete.
      return (
        <div
          className={`${styles.chatHeaderActions} ${
            gearHidden ? styles.chatHeaderActionsHidden : ""
          }`}
          aria-label="Conversation tools"
        >
          {renderMemoryToasts()}
          <button
            type="button"
            className={styles.chatHeaderAction}
            disabled={!canMemoryActions}
            onClick={handleMemories}
            title={activeBot ? "Bot memories" : "Default Prism memories"}
          >
            Memories
          </button>
          {canBotActions && (
            <button
              type="button"
              className={styles.chatHeaderAction}
              onClick={handleEditBot}
              title="Edit bot"
            >
              Edit bot
            </button>
          )}
          <button
            type="button"
            className={styles.chatHeaderAction}
            disabled={!canExport}
            onClick={handleExport}
            title="Export chat as Markdown"
          >
            Export .md
          </button>
          <button
            type="button"
            className={`${styles.chatHeaderAction} ${
              deleteArmed ? styles.chatHeaderActionDanger : ""
            }`}
            disabled={!canDelete}
            data-delete-affordance="true"
            aria-label={
              deleteArmed ? "Confirm delete this chat" : "Delete this chat"
            }
            title={deleteArmed ? "Tap to confirm" : "Delete chat"}
            onClick={handleDelete}
          >
            {deleteArmed ? "✓ Confirm" : "Delete"}
          </button>
        </div>
      );
    }

    return (
      <div
        ref={chatOverflowMenuRef}
        className={`${styles.chatGearAnchor} ${gearHidden ? styles.chatGearAnchorHidden : ""}`}
      >
        <button
          type="button"
          className={styles.chatGearButton}
          aria-expanded={chatOverflowMenuOpen}
          aria-haspopup="menu"
          aria-label="Conversation tools menu"
          title="Conversation tools"
          onPointerDownCapture={swallowMenuPointerDown}
          onClick={(event) => {
            swallowMenuEvent(event);
            setChatOverflowMenuOpen(open => !open);
          }}
        >
          <WrenchGlyph />
        </button>
        {chatOverflowMenuOpen && (
          <div
            className={styles.chatOverflowMenu}
            role="menu"
            aria-label="Conversation tools"
            onPointerDownCapture={swallowMenuPointerDown}
            onContextMenu={swallowMenuEvent}
          >
            <button
              type="button"
              role="menuitem"
              className={styles.chatOverflowMenuItem}
              disabled={!canMemoryActions}
              onClick={(event) => {
                swallowMenuEvent(event);
                handleMemories();
              }}
            >
              Memories
            </button>
            {canBotActions && (
              <button
                type="button"
                role="menuitem"
                className={styles.chatOverflowMenuItem}
                onClick={(event) => {
                  swallowMenuEvent(event);
                  handleEditBot();
                }}
              >
                Edit bot
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className={styles.chatOverflowMenuItem}
              disabled={!canExport}
              onClick={(event) => {
                swallowMenuEvent(event);
                handleExport();
              }}
            >
              Export .md
            </button>
            <button
              type="button"
              role="menuitem"
              className={`${styles.chatOverflowMenuItem} ${deleteArmed ? styles.chatOverflowMenuItemDanger : ""}`}
              disabled={!canDelete}
              data-delete-affordance="true"
              aria-label={
                deleteArmed ? "Confirm delete this chat" : "Delete this chat"
              }
              onClick={(event) => {
                swallowMenuEvent(event);
                handleDelete();
              }}
            >
              {deleteArmed ? "✓ Confirm delete" : "Delete chat"}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Bot card × delete button ────────────────────────────────────────
  // Bot panel twin of `renderChatDeleteButton`. Same four visual states —
  // idle (muted × glyph), hover (embossed red), holding (immediate glow
  // via `data-holding`), and armed-single ("Are you sure? ✓" pill) — plus
  // the same bulk-wipe escape hatch: press and hold for 900 ms to arm
  // `DELETE_ALL_BOTS_KEY`, which surfaces the shared alertdialog modal.
  //
  // The click handler lives on the button itself so it can `stopPropagation`
  // and keep a tap from bubbling up to the card body, which now listens
  // for "tap anywhere to start editing this bot" via
  // `startEditBot`. Without that guard, a single × tap would arm delete
  // AND hydrate the form at the same time.
  const renderBotDeleteButton = (bot: Bot) => {
    const botKey = `${BOT_DELETE_KEY_PREFIX}${bot.id}`;
    const isArmedSingle = pendingDeleteKey === botKey;
    const isHolding = holdingKey === botKey;
    const armedAll = pendingDeleteKey === DELETE_ALL_BOTS_KEY;
    const isProtected = bot.delete_protected === 1;

    const className = [
      styles.botCardDelete,
      isArmedSingle ? styles.botCardDeleteArmed : "",
      isProtected ? styles.botCardDeleteProtected : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        type="button"
        className={className}
        data-delete-affordance="true"
        data-holding={isHolding ? "true" : undefined}
        aria-label={
          isProtected
            ? `${bot.name} is protected from deletion`
            : isArmedSingle
            ? `Confirm delete ${bot.name}`
            : `Delete ${bot.name} — click to remove this bot, or press and hold to clear all bots`
        }
        title={
          isProtected
            ? "Protected bot · toggle delete protection off to delete"
            : isArmedSingle
              ? undefined
              : "Delete bot · hold for all"
        }
        onPointerDown={(e) => {
          // Only primary-button presses kick off the hold; right-click
          // (contextmenu) stays out of the gesture entirely.
          if (e.button !== 0) return;
          if (isProtected) return;
          // Pointer capture guarantees pointerup/pointercancel even if the
          // finger drags off the target mid-hold — without it, a touch
          // sliding off would orphan the 900 ms timer.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Some headless / jsdom environments don't implement pointer
            // capture; we silently fall back to the timer-only path.
          }
          startHoldDelete(botKey);
        }}
        onPointerUp={cancelHoldDelete}
        onPointerCancel={cancelHoldDelete}
        onClick={(e) => {
          // Keep the tap from bubbling to the card body's "tap to edit"
          // handler — × and edit are mutually exclusive intents.
          e.stopPropagation();
          // A completed hold just armed delete-all; swallow the trailing
          // click so it doesn't also arm the single-bot confirm on this
          // same button.
          if (holdCompletedRef.current) {
            holdCompletedRef.current = false;
            return;
          }
          // Delete-all modal is live — the ×'s are visually present but
          // behind the backdrop. Treat clicks as no-ops (the modal's own
          // Cancel / backdrop / Esc handle dismissal).
          if (armedAll) return;
          if (isProtected) {
            setPanelError("This bot is protected. Toggle delete protection off first.");
            return;
          }
          if (isArmedSingle) {
            void deleteBot(bot.id);
          } else {
            armDelete(botKey);
          }
        }}
      >
        {isArmedSingle && (
          <span className={styles.conversationDeletePrompt}>Are you sure?</span>
        )}
        <span className={styles.conversationDeleteGlyph}>
          {isArmedSingle ? "✓" : isProtected ? (
            <BotGlyph name="lock" size={14} strokeWidth={2.05} />
          ) : "×"}
        </span>
      </button>
    );
  };

  const renderDevToolsButton = (): React.JSX.Element | null => {
    if (!DEV_TOOLS_ENABLED) return null;
    return (
      <button
        type="button"
        className={`${styles.headerIconButton} ${styles.composeUtilityButton} ${styles.devToolsButton}`}
        onClick={() => {
          setDevToolsMessage(null);
          setDevToolsOpen((open) => !open);
        }}
        aria-label="Open developer tools"
        title="Developer tools"
      >
        <IconKey />
      </button>
    );
  };

  const renderDevToolsPanel = (): React.JSX.Element | null => {
    if (!DEV_TOOLS_ENABLED || !devToolsOpen) return null;
    const densityStageTargets = pickerDensityStageTargets(
      viewportWidth,
      viewportHeight
    );
    const devToolsMemoryPanelOpen = panel === "memories";
    const devToolsMemoryScopeLabel =
      memoryPanelScope === "bot" && memoryPanelBot
        ? memoryPanelBot.name
        : "all bots";
    return (
      <div
        ref={devToolsPanelRef}
        className={styles.devToolsFloatingPanel}
        role="dialog"
        aria-labelledby="dev-tools-title"
      >
        <div
          className={styles.devToolsHeader}
          onPointerDown={startDevToolsPanelDrag}
          onPointerMove={dragDevToolsPanel}
          onPointerUp={endDevToolsPanelDrag}
          onPointerCancel={endDevToolsPanelDrag}
        >
          <h2 id="dev-tools-title" className={styles.deleteAllModalTitle}>
            Developer tools
          </h2>
          <span className={styles.devToolsDragHint} aria-hidden="true">
            ::
          </span>
        </div>
        <div className={styles.devToolsSection}>
          <h3 className={styles.devToolsSectionTitle}>Viewport</h3>
          <p className={styles.devToolsViewportStatus} aria-live="polite">
            <span>
              Width <strong>{viewportWidth}px</strong>
            </span>
            <span>
              Height <strong>{viewportHeight}px</strong>
            </span>
          </p>
        </div>

        <div className={styles.devToolsSection}>
          <h3 className={styles.devToolsSectionTitle}>Seed data</h3>
          <p className={styles.devToolsSectionHint}>
            Bots: <strong>{bots.length}</strong> | Sidebar chats:{" "}
            <strong>{visibleConversations.length}</strong>
          </p>
          <label className={styles.devToolsCountControl}>
            <span>Quantity</span>
            <input
              type="number"
              min={DEV_TOOLS_BOT_QUANTITY_MIN}
              max={DEV_TOOLS_BOT_QUANTITY_MAX}
              step={1}
              value={devToolsBotQuantity}
              aria-label="Quantity for developer tools add actions"
              onChange={(event) => {
                const next = event.currentTarget.value;
                setDevToolsBotQuantity(
                  next === "" ? "" : clampDevToolsBotQuantity(Number(next))
                );
              }}
              disabled={devToolsBusy}
            />
          </label>
          <div className={styles.devToolsQuantityRail} aria-label="Quick quantities">
            {DEV_TOOLS_BOT_QUANTITY_PRESETS.map((quantity) => (
              <button
                key={quantity}
                type="button"
                className={`${styles.devToolsPresetButton} ${
                  resolvedDevToolsBotQuantity === quantity ? styles.devToolsPresetButtonActive : ""
                }`}
                onClick={() => setDevToolsBotQuantity(quantity)}
                disabled={devToolsBusy}
              >
                {quantity}
              </button>
            ))}
          </div>
          <p className={styles.devToolsSectionHint}>
            Stage buttons set total bots for the current viewport.
          </p>
          <div
            className={styles.devToolsStageRail}
            aria-label="Bot picker density stages"
          >
            {densityStageTargets.map((stage) => {
              const isCurrentTarget = bots.length === stage.targetCount;
              return (
                <button
                  key={stage.id}
                  type="button"
                  className={`${styles.devToolsStageButton} ${
                    isCurrentTarget ? styles.devToolsStageButtonActive : ""
                  }`}
                  onClick={() => void devToolsSetBotDensityStage(stage.id)}
                  disabled={devToolsBusy}
                >
                  <span>{stage.label}</span>
                  <strong>{stage.targetCount}</strong>
                  <small>{stage.description}</small>
                </button>
              );
            })}
          </div>
          <div className={styles.devToolsActions}>
            <button
              type="button"
              className={styles.devToolsAction}
              onClick={() => void devToolsAddRandomBots()}
              disabled={devToolsBusy}
            >
              Add bots
            </button>
            <button
              type="button"
              className={styles.devToolsAction}
              onClick={() => void devToolsAddSeedChats()}
              disabled={devToolsBusy}
            >
              Add chats
            </button>
            <button
              type="button"
              className={`${styles.devToolsAction} ${styles.devToolsActionDanger}`}
              onClick={() => void devToolsDeleteAllBots()}
              disabled={devToolsBusy || bots.length === 0}
            >
              Delete all bots
            </button>
          </div>
        </div>

        {devToolsMemoryPanelOpen && (
          <div className={styles.devToolsSection}>
            <h3 className={styles.devToolsSectionTitle}>Memories</h3>
            <p className={styles.devToolsSectionHint}>
              All: <strong>{memories.length}</strong>
              {memoryPanelScope === "bot" && memoryPanelBot ? (
                <>
                  {" "}· {memoryPanelBot.name}: <strong>{botMemories.length}</strong>
                </>
              ) : null}
            </p>
            <p className={styles.devToolsSectionHint}>
              {memoryPanelScope === "bot" && memoryPanelBot
                ? `Adds the chosen quantity to ${devToolsMemoryScopeLabel}.`
                : "Distributes the chosen quantity randomly across all bots."}
            </p>
            <label className={styles.devToolsCountControl}>
              <span>Seed type</span>
              <select
                value={devToolsMemorySeedSource}
                onChange={(event) =>
                  setDevToolsMemorySeedSource(event.currentTarget.value as DevToolsMemorySeedSource)
                }
                disabled={devToolsBusy}
              >
                <option value="direct">Direct memories</option>
                <option value="inferred">Inferred assumptions</option>
                <option value="compiled">Compiled assumptions</option>
              </select>
            </label>
            <label className={styles.devToolsCountControl}>
              <span>
                Certainty{" "}
                <strong>{Math.round(devToolsMemoryCertainty * 100)}%</strong>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={devToolsMemoryCertainty}
                onChange={(event) =>
                  setDevToolsMemoryCertainty(
                    Math.max(0, Math.min(1, Number(event.currentTarget.value)))
                  )
                }
                disabled={devToolsBusy || devToolsMemorySeedSource === "direct"}
              />
            </label>
            <div className={styles.devToolsActions}>
              {memoryPanelScope === "bot" || memoryPanelScope === "default" ? (
                <button
                  type="button"
                  className={styles.devToolsAction}
                  onClick={() => void devToolsAddBotMemories()}
                  disabled={devToolsBusy || !memoryPanelBot}
                >
                  Add {devToolsMemorySeedSource}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.devToolsAction}
                  onClick={() => void devToolsAddAllMemories()}
                  disabled={devToolsBusy || bots.length === 0}
                >
                  Add {devToolsMemorySeedSource}
                </button>
              )}
              <button
                type="button"
                className={`${styles.devToolsAction} ${styles.devToolsActionDanger}`}
                onClick={() => void devToolsClearAllMemories()}
                disabled={devToolsBusy || memories.length === 0}
              >
                Clear all memories
              </button>
            </div>
          </div>
        )}

        {devToolsMessage && (
          <p className={styles.devToolsStatus} role="status">
            {devToolsMessage}
          </p>
        )}

        <div className={styles.deleteAllModalActions}>
          <button
            type="button"
            className={styles.deleteAllModalCancel}
            onClick={closeDevTools}
          >
            Close
          </button>
        </div>
      </div>
    );
  };

  // ── Shared right-hand panels (Settings / Bots / Images) ─────────────
  // Both the Chat shell and the Sandbox shell reach these three drawers
  // via the sidebar footer. Extracted into a single helper so the
  // surfaces stay in lockstep — a fix to the Bots panel shouldn't need
  // to be applied twice, and the shell backdrop click behaviour must
  // match in both modes so the overlay feels like one system, not two
  // parallel implementations.
  //
  // Returned JSX is a fragment so the helper plugs straight into the
  // existing render tree without introducing a wrapper element that
  // would perturb CSS grid/flex layout in the parent <main>.
  const renderSharedPanels = (): React.JSX.Element => (
    <>
      {panel && (
        <div
          className={styles.panelOverlay}
          data-closing={panelClosing ? "true" : undefined}
          onClick={(event) => {
            if (event.button !== 0 || event.ctrlKey) return;
            closePanel();
          }}
          aria-hidden="true"
        />
      )}

      {/* ── Memories panel ── */}
      {panel === "memories" && (
        <div
          ref={memoryPanelRef}
          className={`${styles.panel} ${styles.panelMemories}`}
          data-closing={panelClosing ? "true" : undefined}
          data-memory-scope={memoryPanelScope}
          data-memory-physics-active={memoryPhysicsActive ? "true" : undefined}
          data-memory-family={
            memoryPanelScope === "all" && memoryPanelSelectedFamily
              ? memoryPanelSelectedFamily
              : undefined
          }
          style={memoryPanelStyle}
        >
          <div className={styles.panelHeader}>
            <div className={styles.panelHeaderTitle}>
              {memoryPanelScope === "bot" || memoryPanelScope === "default" ? (
                <button
                  type="button"
                  className={styles.panelBack}
                  onClick={() => void runMemoryTransition(() => {
                    // Drop back to the all-memories scope. If a family
                    // is still selected (either preserved from the
                    // drill-down or derived from the bot's color), the
                    // user lands on that family's cluster view; if
                    // none is set, they land on the directory root.
                    setMemoryPanelScope("all");
                    setMemoryPanelBotId(null);
                    setFocusedMemoryId(null);
                  }, "backward")}
                  aria-label={
                    memoryPanelSelectedFamily
                      ? "Back to PRISM family"
                      : "Back to PRISM directories"
                  }
                  title={
                    memoryPanelSelectedFamily
                      ? "Back to PRISM family"
                      : "Back to PRISM directories"
                  }
                >
                  ←
                </button>
              ) : memoryPanelScope === "all" && memoryPanelSelectedFamily ? (
                <button
                  type="button"
                  className={styles.panelBack}
                  onClick={() => void runMemoryTransition(() => {
                    setMemoryPanelSelectedFamily(null);
                    setFocusedMemoryId(null);
                  }, "backward")}
                  aria-label="Back to PRISM directories"
                  title="Back to PRISM directories"
                >
                  ←
                </button>
              ) : null}
              <h3>
                {memoryPanelScope === "all"
                  ? "All memories"
                  : memoryPanelScope === "default"
                    ? "Default memories"
                    : "Bot memories"}
              </h3>
            </div>
            <button type="button" className={styles.panelClose} onClick={closePanel}>×</button>
          </div>
          {/* Transition layer: receives the directional zoom + fade so
              the navigation reads as "drilling into" or "pulling out of"
              a directory instead of a hard cut. The phase + direction
              data attributes drive the CSS keyframes; idle state leaves
              the layer at scale 1 / opacity 1. */}
          <div
            className={styles.memoryTransitionLayer}
            data-memory-transition-phase={memoryTransitionPhase}
            data-memory-transition-direction={memoryTransitionDirection}
          >
          {memoryPanelBot && (
            <div className={styles.memoryBotHeader}>
              <span className={styles.memoryBotGlyph} aria-hidden="true">
                <BotGlyph name={memoryPanelBot.glyph} size={24} strokeWidth={1.9} />
              </span>
              <div>
                <strong>{memoryPanelBot.name}</strong>
                <span>Only this bot can use these memories.</span>
              </div>
            </div>
          )}
          {memoryPanelScope === "default" && (
            <div className={styles.memoryBotHeader}>
              <span className={styles.memoryBotGlyph} aria-hidden="true">
                <PrismTriangleMark />
              </span>
              <div>
                <strong>Prism</strong>
                <span>Shared memories every bot may draw from.</span>
              </div>
            </div>
          )}
          <p className={styles.memoryPanelHint}>
            {memoryPanelScope === "all"
              ? memoryPanelSelectedFamily
                ? `${selectedMemoryFamilyDirectory?.letter ?? "?"} family: each orb is a bot; orbit dots indicate saved memories.`
                : "PRISM directories and your shared Prism memory. Tap to drill in."
              : memoryPanelScope === "default"
                ? "Prism also reflects on patterns it notices across your bots. Uncertain memories appear as smaller unlabeled bubbles."
                : "Memories this bot has gathered across chats. Uncertain memories appear as smaller unlabeled bubbles."}
          </p>
          {memoryPanelScope === "all" && !memoryPanelSelectedFamily ? (
            <div className={styles.memoryBubbleCloud} role="list" aria-label="PRISM memory directories">
              <button
                type="button"
                role="listitem"
                className={styles.memoryFamilyCluster}
                data-memory-default="true"
                data-memory-physics-id="default:prism"
                style={defaultMemoryDirectoryStyle}
                onClick={() => void runMemoryTransition(openDefaultMemoriesPanel, "forward")}
                aria-label={`Prism default: ${defaultDirectMemoryCount} memories. Open default memories.`}
                title={`Prism default: ${defaultDirectMemoryCount} memories`}
              >
                <span className={styles.memoryDefaultGlyph} aria-hidden="true">
                  <PrismTriangleMark />
                </span>
              </button>
              {memoryFamilyDirectories.map((family) => (
                <button
                  key={`family:${memoryPhysicsSeed}:${family.id}`}
                  type="button"
                  role="listitem"
                  className={styles.memoryFamilyCluster}
                  data-memory-family-empty={family.itemCount === 0 ? "true" : undefined}
                  data-memory-physics-id={`family:${family.id}`}
                  style={family.style}
                  onClick={() => void runMemoryTransition(() => {
                    setMemoryPanelSelectedFamily(family.id);
                    setFocusedMemoryId(null);
                  }, "forward")}
                  disabled={family.itemCount === 0}
                  aria-label={
                    family.itemCount > 0
                      ? `${family.label}: ${family.itemCount} bot${family.itemCount === 1 ? "" : "s"}, ${family.memoryCount} memories. Open directory.`
                      : `${family.label}: empty directory.`
                  }
                  title={
                    family.itemCount > 0
                      ? `${family.label}: ${family.itemCount} bot${family.itemCount === 1 ? "" : "s"}, ${family.memoryCount} memories`
                      : `${family.label}: empty`
                  }
                >
                  {family.itemCount > 0 && (
                    <span className={styles.memoryFamilyClusterLabel}>{family.letter}</span>
                  )}
                </button>
              ))}
            </div>
          ) : memoryPanelScope === "all" && memoryPanelSelectedFamily ? (
            selectedFamilyBotClusters.length > 0 ? (
              <ul className={styles.memoryBubbleCloud}>
                {selectedFamilyBotClusters.map((cluster) => (
                  <li
                    key={`cluster:${memoryPhysicsSeed}:${cluster.id}`}
                    className={styles.memoryBubble}
                    data-clickable="true"
                    data-source-cluster="true"
                    data-memory-physics-id={`cluster:${cluster.id}`}
                    style={cluster.style}
                    onClick={() => void runMemoryTransition(async () => {
                      if (!cluster.botId) return;
                      setMemoryPanelScope("bot");
                      setMemoryPanelBotId(cluster.botId);
                      setFocusedMemoryId(null);
                      // Keep `memoryPanelSelectedFamily` set so the
                      // bot-view back button returns to this family's
                      // drill-down view instead of jumping all the way
                      // to the directory.
                      await refreshBotMemories(cluster.botId);
                    }, "forward")}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (!cluster.botId) return;
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      void runMemoryTransition(async () => {
                        if (!cluster.botId) return;
                        setMemoryPanelScope("bot");
                        setMemoryPanelBotId(cluster.botId);
                        setFocusedMemoryId(null);
                        await refreshBotMemories(cluster.botId);
                      }, "forward");
                    }}
                    aria-label={
                      cluster.botId
                        ? `${cluster.botName}: ${cluster.memoryCount} memories. Open bot memories.`
                        : `Prism default: ${cluster.memoryCount} memories.`
                    }
                    title={`${cluster.botName}: ${cluster.memoryCount} memories`}
                  >
                    <span className={styles.memorySourceClusterGlyph}>
                      <BotGlyph
                        name={cluster.botGlyph}
                        size={40}
                        strokeWidth={1.95}
                      />
                    </span>
                    <div className={styles.memorySourceClusterInnerBubbles} aria-hidden="true">
                      {cluster.innerBubbles.map((dot) => (
                        <span key={dot.id} style={dot.style} />
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (selectedMemoryFamilyDirectory?.itemCount ?? 0) > 0 ? (
              <div className={styles.memoryEmptyState}>
                <strong>No memories in this family yet</strong>
                <p>Bots in this PRISM category haven&rsquo;t gathered memories yet. Chat with one to start filling it in.</p>
              </div>
            ) : (
              <div className={styles.memoryEmptyState}>
                <strong>No bots in this family</strong>
                <p>Add or recolor bots in this PRISM category to populate it.</p>
              </div>
            )
          ) : visibleMemoryBubbles.length > 0 ? (
            <ul
              className={styles.memoryBubbleCloud}
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  setFocusedMemoryId(null);
                }
              }}
            >
              {visibleMemoryBubbles.map((memory) => {
                const layout = memoryBubbleLayoutById.get(memory.id);
                const uncertain = layout?.uncertain ?? false;
                const selected = focusedMemoryId === memory.id;
                const dimmed = Boolean(focusedMemoryId && !selected);
                const inferred = isAssumptionMemory(memory);
                const signalPercent = Math.round(memoryBubbleSignalValue(memory) * 100);
                return (
                  <li
                    key={`memory:${memoryPhysicsSeed}:${memory.id}`}
                    className={styles.memoryBubble}
                    data-clickable="true"
                    data-memory-uncertain={uncertain ? "true" : undefined}
                    data-memory-selected={selected ? "true" : undefined}
                    data-memory-dimmed={dimmed ? "true" : undefined}
                    data-memory-inferred={inferred ? "true" : undefined}
                    data-memory-physics-id={`memory:${memory.id}`}
                    style={{
                      ...layout?.style,
                      ...(inferred
                        ? { "--memory-assumption-opacity": assumptionMemoryOpacity(memory) } as React.CSSProperties
                        : {}),
                    }}
                    title={memory.text}
                    role="button"
                    tabIndex={0}
                    aria-label={`${memory.text}. ${inferred ? "Certainty" : "Confidence"} ${signalPercent} percent.`}
                    onClick={() => {
                      setFocusedMemoryId((current) => (current === memory.id ? null : memory.id));
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      setFocusedMemoryId((current) => (current === memory.id ? null : memory.id));
                    }}
                  >
                    {selected ? (
                      <span className={styles.memoryBubbleScore}>
                        {signalPercent}%
                      </span>
                    ) : uncertain ? (
                      <span className={styles.memoryUncertainCore} aria-hidden="true" />
                    ) : (
                      <p>{memory.text}</p>
                    )}
                  </li>
                );
              })}
              {selectedVisibleMemory && (
                <li className={styles.memoryFullProseCard} role="status" aria-live="polite">
                  <strong>{isAssumptionMemory(selectedVisibleMemory) ? "Assumption" : "Memory"}</strong>
                  <p>{selectedVisibleMemory.text}</p>
                  <button
                    type="button"
                    className={styles.memoryFullProseDeleteButton}
                    onClick={(event) => {
                      event.stopPropagation();
                      void deleteMemory(selectedVisibleMemory.id);
                    }}
                    aria-label={`Delete memory: ${selectedVisibleMemory.text}`}
                  >
                    Delete memory
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <div className={styles.memoryEmptyState}>
              <strong>No memories yet</strong>
              <p>
                {memoryPanelScope === "all"
                  ? memoryPanelSelectedFamily
                    ? "No memories are saved in this PRISM family yet."
                    : "When Prism saves memories, they will appear in these directories."
                  : memoryPanelScope === "default"
                    ? "When Prism saves shared memories, they will float here."
                    : "When this bot saves a memory, it will float here."}
              </p>
            </div>
          )}
          </div>
          {panelError && <p className={styles.error} role="alert">{panelError}</p>}
        </div>
      )}

      {/* ── Settings panel ── */}
      {panel === "settings" && (
        <div
          className={`${styles.panel} ${styles.panelSettings}`}
          data-closing={panelClosing ? "true" : undefined}
        >
          <div className={styles.panelHeader}><h3>Settings</h3><button type="button" className={styles.panelClose} onClick={closePanel}>×</button></div>
          {settings && (
            <form className={styles.form} onSubmit={saveSettings}>
              <label>OpenAI API key<input type="password" placeholder={settings.hasOpenAiApiKey ? "Saved (leave blank to keep; type to replace)" : "sk-..."} value={openAiKey} onChange={e => setOpenAiKey(e.target.value)} /></label>
              <label className={styles.settingsHostField}>
                <span className={styles.settingsHostLabel}>Second Ollama host</span>
                <span
                  className={styles.settingsHostInputWrap}
                  data-status={secondaryOllamaUiStatus}
                >
                  <input
                    type="text"
                    placeholder="192.168.1.50:11434"
                    value={settings.secondaryOllamaHost ?? ""}
                    onChange={e => setSettings(p => p ? { ...p, secondaryOllamaHost: e.target.value } : p)}
                  />
                  <span className={styles.settingsHostStatus} aria-live="polite">
                    {secondaryOllamaStatusText}
                  </span>
                </span>
              </label>
              {settings.hasOpenAiApiKey && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => void clearSavedKey()}
                  disabled={busy}
                >
                  Clear saved key
                </button>
              )}
              <label className={styles.checkbox}><input type="checkbox" checked={settings.autoMemory} onChange={e => setSettings(p => p ? { ...p, autoMemory: e.target.checked } : p)} />Auto memory</label>
              <button
                type="button"
                className={styles.settingsInfoButton}
                aria-haspopup="dialog"
                aria-expanded={settingsAboutModalOpen ? "true" : undefined}
                onClick={() => setSettingsAboutModalOpen(true)}
              >
                <strong>App info</strong>
            <span>What Prism is, how it works, and what you control.</span>
              </button>
              <details className={styles.settingsModelDropdown}>
                <summary>
                  <span>Bot customizer models</span>
                  <small>
                    {settings.hiddenBotModelIds.length === 0
                      ? "All model choices visible"
                      : `${settings.hiddenBotModelIds.length} hidden`}
                  </small>
                </summary>
                <div className={styles.settingsModelList}>
                  {allBotCustomizerModelOptions(modelCatalog, settings).map((model) => {
                    const required = isRequiredPrimaryLocalModel(model);
                    const visible = required || !settings.hiddenBotModelIds.includes(model.id);
                    return (
                      <label key={model.id} className={styles.settingsModelToggle}>
                        <input
                          type="checkbox"
                          checked={visible}
                          disabled={required}
                          onChange={(event) =>
                            setBotCustomizerModelVisible(model.id, event.currentTarget.checked)
                          }
                        />
                        <span>{model.label}</span>
                        <small>
                          {required
                            ? "Required"
                            : model.provider === "local"
                            ? `Offline${model.hostLabel ? ` · ${model.hostLabel}` : ""}`
                            : "Online"}
                        </small>
                      </label>
                    );
                  })}
                </div>
              </details>
              <button type="submit" disabled={busy}>Save</button>
            </form>
          )}
          {settingsAboutModalOpen && (
            <div
              className={styles.settingsAboutModalBackdrop}
              role="presentation"
              onClick={() => setSettingsAboutModalOpen(false)}
            >
              <div
                className={styles.settingsAboutModal}
                role="dialog"
                aria-modal="true"
                aria-label="About this app"
                onClick={(event) => event.stopPropagation()}
              >
                <header className={styles.settingsAboutModalHeader}>
                  <div>
                    <span>App details</span>
                    <h4>About this app</h4>
                    <p>A quick guide to PRISM&apos;s vision and how it behaves today.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsAboutModalOpen(false)}
                    aria-label="Close app info"
                  >
                    ×
                  </button>
                </header>
                <div className={styles.settingsAboutModalBody}>
                  <p>
                    PRISM is a playful, personal AI workspace: surreal in style, practical in interaction.
                  </p>
                  <p>
                    The Hub currently centers two modes: Chat for grounded conversation and Sandbox for
                    open-ended exploration.
                  </p>
                  <p>
                    Bots let you shape personality, creativity, and response depth without permanently changing
                    the underlying model.
                  </p>
                  <p>
                    You stay in control: choose offline/online behavior, manage memories, and tune responses
                    per bot.
                  </p>
                  <p>
                    This PRISM workspace can also pair with companion clients, so your same environment can
                    travel across devices.
                  </p>
                </div>
              </div>
            </div>
          )}
          <div className={styles.pairingActions}>
            <h4>Pair a device</h4>
            <p className={styles.muted}>
              Generate a short-lived code to connect the future Prism iOS/Mac app
              to this server.
            </p>
            {pairingCode && (
              <div className={styles.pairingCodeCard} aria-live="polite">
                <strong className={styles.pairingCodeValue}>{pairingCode.code}</strong>
                <small className={styles.pairingCodeMeta}>
                  {formatPairingExpiry(pairingCode.expiresAt)}
                </small>
              </div>
            )}
            <div className={styles.pairingButtonRow}>
              <button
                type="button"
                className={styles.accountLogoutButton}
                onClick={() => void generatePairingCode()}
                disabled={busy || pairingBusy}
              >
                {pairingBusy ? "Generating..." : pairingCode ? "Generate new code" : "Generate code"}
              </button>
              {pairingCode && (
                <button
                  type="button"
                  className={styles.linkButton}
                  onClick={() => void copyPairingCode()}
                  disabled={pairingBusy}
                >
                  {pairingCopyStatus ?? "Copy code"}
                </button>
              )}
            </div>
          </div>
          <div className={styles.accountActions}>
            <h4>Account</h4>
            <p className={styles.muted}>Sign out, change your password, or permanently delete this account.</p>
            <div className={styles.accountActionsButtonRow}>
              <button
                type="button"
                className={styles.accountLogoutButton}
                onClick={() => void logout()}
                disabled={busy}
              >
                Log out
              </button>
              <button
                type="button"
                className={styles.accountLogoutButton}
                onClick={() => {
                  setPanelError(null);
                  setChangePasswordNew("");
                  setChangePasswordConfirm("");
                  setChangePasswordModalOpen(true);
                }}
                disabled={busy}
              >
                Change password
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={() => void deleteAccount()}
                disabled={busy}
              >
                Delete account
              </button>
            </div>
          </div>
          {changePasswordModalOpen && (
            <div
              className={styles.settingsAboutModalBackdrop}
              role="presentation"
              onClick={() => {
                setChangePasswordModalOpen(false);
              }}
            >
              <div
                className={styles.settingsAboutModal}
                role="dialog"
                aria-modal="true"
                aria-label="Change password"
                onClick={(event) => event.stopPropagation()}
              >
                <header className={styles.settingsAboutModalHeader}>
                  <div>
                    <span>Security</span>
                    <h4>Change password</h4>
                    <p>You&apos;re already signed in, so you can set a new password without the old one.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChangePasswordModalOpen(false)}
                    aria-label="Close change password"
                  >
                    ×
                  </button>
                </header>
                <div className={styles.settingsAboutModalBody}>
                  <form
                    className={styles.form}
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitChangePassword();
                    }}
                  >
                    <label>
                      New password
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={changePasswordNew}
                        onChange={(event) => setChangePasswordNew(event.target.value)}
                      />
                    </label>
                    <label>
                      Confirm new password
                      <input
                        type="password"
                        autoComplete="new-password"
                        value={changePasswordConfirm}
                        onChange={(event) => setChangePasswordConfirm(event.target.value)}
                      />
                    </label>
                    <button type="submit" disabled={busy}>
                      {busy ? "Saving…" : "Update password"}
                    </button>
                  </form>
                </div>
              </div>
            </div>
          )}
          {/* Scoped to panelError so a chat-send 401 doesn't render a
              duplicate error on top of the Settings drawer. The legacy
              in-settings memory list was removed once the dedicated
              memories panel (with the cinematic directory transitions)
              became the canonical management surface. */}
          {panelError && <p className={styles.error} role="alert">{panelError}</p>}
        </div>
      )}

      {/* ── Bots panel ── */}
      {panel === "bots" && (() => {
        // `panelBots` neutralises the shell --accent triad that bleeds
        // in from the active bot's color. See .panelBots in
        // page.module.css for the override; without it, every button
        // and focus ring inside the panel would paint in whichever
        // bot's hue is driving the app shell right now.
        //
        // The form's primary button is the one exception that OPTS
        // BACK IN to a color — see primaryStyle below — so it can
        // preview the bot's picked color ("Like the new-chat button")
        // exactly when pressing it will do something useful. In every
        // other state we keep the panelBots B/W override in place so
        // the button reads as inert.

        // ── Primary button state machine ───────────────────────────
        //   create + disabled (no name)        → B/W "Create bot"
        //   create + enabled  (name filled)    → bot-color "Create bot"
        //   edit   + no changes                → B/W "Update" (disabled)
        //   edit   + has changes               → bot-color "Update"
        const editingBot = editingBotId
          ? bots.find(b => b.id === editingBotId) ?? null
          : null;
        const trimmedName = newBotName.trim();
        const nameIsPresent = trimmedName.length > 0;

        // Normalize colors to lower-case hex so comparison isn't tripped
        // up by the picker returning "#ABCDEF" while the DB stored
        // "#abcdef" (or vice versa). Everything downstream in the
        // form already tolerates either case.
        const normalizeColor = (hex: string | null | undefined) =>
          (hex ?? "").trim().toLowerCase();
        // Compare against the seeded snapshot (startEditBot stored the
        // hydrated values into editOriginalRef.current) rather than the
        // raw bot row. This keeps legacy bots with no stored color from
        // reading as "dirty" the instant edit mode opens, since the
        // picker's random seed color matches the seed we captured.
        const editPristine = editingBot ? editOriginalRef.current : null;
        const visibleLocalModelChoice = visibleBotCustomizerModelChoice(
          settings,
          newBotLocalModel
        );
        const visibleOnlineModelChoice = visibleBotCustomizerModelChoice(
          settings,
          newBotOnlineModel
        );
        const hasEditChanges = editPristine
          ? trimmedName !== editPristine.name
            || serializeStoredBotPrompt(botProfile, trimmedName) !== editPristine.prompt
            || visibleLocalModelChoice !== editPristine.localModel
            || visibleOnlineModelChoice !== editPristine.onlineModel
            || newBotOnlineEnabled !== editPristine.onlineEnabled
            || newBotDeleteProtected !== editPristine.deleteProtected
            || newBotTemperature !== editPristine.temperature
            || newBotMaxTokens !== editPristine.maxTokens
            || normalizeColor(newBotColor) !== normalizeColor(editPristine.color)
            || newBotGlyph !== editPristine.glyph
          : false;

        // "Active" = pressing the button commits something useful.
        // Drives BOTH the enabled/disabled flag AND whether the bot
        // color leaks into the button styling (so the picker feels
        // live as you type a name / tweak the swatch).
        const primaryActive = editingBotId
          ? (nameIsPresent && hasEditChanges && !busy)
          : (nameIsPresent && !busy);

        // Edit mode locks the label to "Update" from the moment edit
        // starts (even before any field changes) so the user's intent
        // reads correctly: you're editing, not creating. The B/W vs.
        // bot-color styling still hinges on hasEditChanges below, so
        // the inert "Update" button remains visually identical to the
        // inert "Create bot" button — same chrome, different word.
        const primaryLabel = editingBotId ? "Update" : "Create bot";

        // Derive the inline --accent / --accent-text / --accent-ink
        // triad from the currently-picked color so the primary button
        // paints in the bot's hue whenever it would do something
        // useful. We also set --accent-hover because the panelBots
        // scope otherwise pulls it back to a B/W mix; without this,
        // hovering a bot-colored button would snap to grayscale for
        // one animation frame.
        const primaryStyle = primaryActive
          ? (() => {
              const accentNormalized = normalizeAccentForTheme(newBotColor, resolvedTheme);
              const base = deriveAccentStyle(accentNormalized, resolvedTheme);
              const hoverMix = resolvedTheme === "light"
                ? `color-mix(in srgb, ${accentNormalized} 85%, #000000 15%)`
                : `color-mix(in srgb, ${accentNormalized} 88%, #ffffff 12%)`;
              return { ...base, ["--accent-hover" as string]: hoverMix } as React.CSSProperties;
            })()
          : undefined;
        const selectedLengthPreset = botReplyLengthPresetForTokens(newBotMaxTokens);
        const localModelOptions = includeSelectedModelOption(
          botCustomizerModelOptionsForProvider(modelCatalog, settings, "local"),
          visibleLocalModelChoice,
          "local"
        );
        const onlineModelOptions = includeSelectedModelOption(
          botCustomizerModelOptionsForProvider(modelCatalog, settings, "openai"),
          visibleOnlineModelChoice,
          "openai"
        );
        const botLibraryTotal = bots.length + 1;
        const botLibrarySummary =
          botLibraryTotal === 1 ? "Default only" : `${botLibraryTotal} bots`;
        const editorPanelStyle = (() => {
          const accentNormalized = normalizeAccentForTheme(newBotColor, resolvedTheme);
          const base = deriveAccentStyle(accentNormalized, resolvedTheme);
          return {
            ["--editor-bot-color" as string]: accentNormalized,
            ["--editor-bot-text" as string]: base["--accent-text" as keyof typeof base],
            ["--editor-bot-ink" as string]: base["--accent-ink" as keyof typeof base],
            ["--editor-bot-soft" as string]: base["--accent-soft" as keyof typeof base],
            ["--editor-bot-glow" as string]: base["--accent-glow" as keyof typeof base],
          } as React.CSSProperties;
        })();
        const completedProfileCategories = botProfileCompletionCount(botProfile);
        const profileSummary =
          !nameIsPresent
            ? "Name this bot to unlock profile details"
            : completedProfileCategories === 0
            ? "Purpose only"
            : `${completedProfileCategories} profile section${completedProfileCategories === 1 ? "" : "s"} filled`;

        return (
          <div
            className={`${styles.panel} ${styles.panelBots}`}
            data-closing={panelClosing ? "true" : undefined}
            data-color-picker-open={colorWheelOpen ? "true" : undefined}
            data-profile-builder-open={botProfileBuilderOpen ? "true" : undefined}
            data-library-expanded={
              botPanelLibraryEnabled && botLibraryExpanded ? "true" : undefined
            }
            data-editor-only={!botPanelLibraryEnabled ? "true" : undefined}
            style={editorPanelStyle}
          >
            <div className={styles.panelHeader}><h3>{!botPanelLibraryEnabled ? "Edit Bot" : "Bots"}</h3><button type="button" className={styles.panelClose} onClick={closePanel}>×</button></div>
            {activeFieldHelp && (
              <div
                className={styles.botParameterHelpTooltip}
                style={{
                  top: `${activeFieldHelp.top}px`,
                  left: `${activeFieldHelp.left}px`,
                }}
                role="tooltip"
                aria-live="polite"
              >
                {activeFieldHelp.text}
              </div>
            )}
            {/* One form, two modes. editingBotId hydrates the fields
                with the target bot's values but the layout itself
                doesn't fork — the primary button simply switches
                label + color based on hasEditChanges above. */}
            {!botLibraryExpanded && (
              <form
                className={styles.form}
                onSubmit={(e) => void submitBotForm(e)}
              >
              <div className={styles.botNameRow}>
                <ColorGlyphPicker
                  color={newBotColor}
                  glyph={newBotGlyph}
                  onColorChange={handleNewBotColorChange}
                  onGlyphChange={handleNewBotGlyphChange}
                  open={colorWheelOpen}
                  onToggle={() => setColorWheelOpen(o => !o)}
                  resolvedTheme={resolvedTheme}
                />
                <input ref={botNameInputRef} required placeholder="Bot name" value={newBotName} onChange={e => setNewBotName(e.target.value)} />
                <button
                  type="button"
                  className={styles.botRandomizeButton}
                  onClick={applyRandomBotDraft}
                  aria-label="Randomize bot"
                  title="Randomize bot"
                >
                  <BotGlyph name="dice" size={20} strokeWidth={1.8} />
                </button>
              </div>
              <section
                className={`${styles.botParameterCard} ${styles.botProfileSummaryCard}`}
                aria-label="Profile Builder"
              >
                <div className={styles.botParameterHeader}>
                  <small>
                    {profileSummary}. These details become hidden context for the model.
                  </small>
                </div>
                <div className={styles.botProfileSummaryGrid}>
                  {BOT_PROFILE_BUILDER_PAGE_ORDER.map((category) => (
                    (() => {
                      const complete = botProfileCategoryComplete(
                        botProfile,
                        category,
                        trimmedName
                      );
                      return (
                        <button
                          key={category}
                          type="button"
                          className={styles.botProfileSummaryButton}
                          data-complete={complete ? "true" : undefined}
                          data-locked={!nameIsPresent ? "true" : undefined}
                          disabled={!nameIsPresent}
                          onClick={() => {
                            if (!nameIsPresent) return;
                            setColorWheelOpen(false);
                            setBotProfileActivePage(category);
                            setBotProfileBuilderOpen(true);
                          }}
                        >
                          <span>{BOT_PROFILE_BUILDER_PAGE_LABELS[category]}</span>
                          <small>
                            {nameIsPresent
                              ? botProfileCategorySummary(botProfile, category, trimmedName)
                              : "Enter a name first"}
                          </small>
                          <strong>{!nameIsPresent ? "Locked" : complete ? "Complete" : "Optional"}</strong>
                        </button>
                      );
                    })()
                  ))}
                </div>
              </section>
              <BotProfileBuilder
                open={botProfileBuilderOpen}
                activePage={botProfileActivePage}
                profile={botProfile}
                botName={trimmedName}
                onActivePageChange={setBotProfileActivePage}
                onProfileChange={setBotProfile}
                onClose={() => setBotProfileBuilderOpen(false)}
              />
              <section className={styles.botParameterCard} aria-label="Response settings">
                <div className={styles.botParameterHeader}>
                  <small>Plain-language choices for model routing, creativity, and answer size.</small>
                </div>
                <div className={styles.botParameterToggleRow}>
                  <label className={`${styles.botParameterField} ${styles.botOnlineCapabilityToggle}`}>
                    <span>Delete protection</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={newBotDeleteProtected}
                      data-enabled={newBotDeleteProtected ? "true" : undefined}
                      onClick={() => setNewBotDeleteProtected((protectedNow) => !protectedNow)}
                    >
                      <strong>{newBotDeleteProtected ? "Protected" : "Deletes normally"}</strong>
                      <small>
                        {newBotDeleteProtected
                          ? "This bot cannot be deleted by single or bulk delete."
                          : "This bot can be deleted normally."}
                      </small>
                    </button>
                  </label>
                  <label className={`${styles.botParameterField} ${styles.botOnlineCapabilityToggle}`}>
                    <span>Online capability</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={newBotOnlineEnabled}
                      data-enabled={newBotOnlineEnabled ? "true" : undefined}
                      onClick={() => setNewBotOnlineEnabled((enabled) => !enabled)}
                    >
                      <strong>{newBotOnlineEnabled ? "Allowed" : "Offline only"}</strong>
                      <small>
                        {newBotOnlineEnabled
                          ? "This bot may use its preferred online model."
                          : "Online model preference is ignored for this bot."}
                      </small>
                    </button>
                  </label>
                </div>
                {mobileBotsPanel ? (
                  <div className={styles.botParameterField}>
                    <span>Response tuning</span>
                    <button
                      type="button"
                      className={styles.botPreferredModelsButton}
                      aria-haspopup="dialog"
                      aria-expanded={botPreferredModelsModalOpen ? "true" : undefined}
                      onClick={() => {
                        setActiveFieldHelp(null);
                        setBotPreferredModelsModalOpen(true);
                      }}
                    >
                      <strong>Open response tuning</strong>
                      <span>
                        {botTemperatureLabel(newBotTemperature)} · {selectedLengthPreset?.label ?? "Custom"} replies
                      </span>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className={styles.botParameterModelRow}>
                      <div
                        className={`${styles.botParameterField} ${styles.botParameterModelField}`}
                        onMouseEnter={(event) => showFieldHelp(
                          "Used when this bot replies while the editor is set to LOCAL.",
                          event.currentTarget
                        )}
                        onMouseLeave={hideFieldHelp}
                        onFocus={(event) => showFieldHelp(
                          "Used when this bot replies while the editor is set to LOCAL.",
                          event.currentTarget
                        )}
                        onBlur={hideFieldHelp}
                      >
                        <span>Preferred offline model</span>
                        <select
                          value={visibleLocalModelChoice}
                          onChange={(event) => setNewBotLocalModel(event.currentTarget.value)}
                          aria-label="Preferred offline model for this bot"
                        >
                          <option value={AUTO_MODEL_CHOICE}>Auto</option>
                          {localModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}{model.isDefault ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                        <small>Used when this bot replies while the editor is set to LOCAL.</small>
                      </div>
                      <div
                        className={`${styles.botParameterField} ${styles.botParameterModelField}`}
                        onMouseEnter={(event) => showFieldHelp(
                          "Used when this bot replies while the editor is set to ONLINE.",
                          event.currentTarget
                        )}
                        onMouseLeave={hideFieldHelp}
                        onFocus={(event) => showFieldHelp(
                          "Used when this bot replies while the editor is set to ONLINE.",
                          event.currentTarget
                        )}
                        onBlur={hideFieldHelp}
                      >
                        <span>Preferred online model</span>
                        <select
                          value={visibleOnlineModelChoice}
                          onChange={(event) => setNewBotOnlineModel(event.currentTarget.value)}
                          aria-label="Preferred online model for this bot"
                          disabled={!newBotOnlineEnabled}
                        >
                          <option value={AUTO_MODEL_CHOICE}>Auto</option>
                          {onlineModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}{model.isDefault ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                        <small>
                          {newBotOnlineEnabled
                            ? "Used when this bot replies while the editor is set to ONLINE."
                            : "Disabled while online capability is off."}
                        </small>
                      </div>
                    </div>
                    <div
                      className={styles.botParameterField}
                      onMouseEnter={(event) => showFieldHelp(
                        botTemperatureDescription(newBotTemperature),
                        event.currentTarget
                      )}
                      onMouseLeave={hideFieldHelp}
                      onFocus={(event) => showFieldHelp(
                        botTemperatureDescription(newBotTemperature),
                        event.currentTarget
                      )}
                      onBlur={hideFieldHelp}
                    >
                      <div className={styles.botParameterQuestionRow}>
                        <span>Reply creativity</span>
                        <strong>{botTemperatureLabel(newBotTemperature)}</strong>
                      </div>
                      <small className={styles.botParameterInlineHelp}>
                        Lower values keep answers predictable; higher values allow more surprise.
                      </small>
                      <input
                        type="range"
                        min={BOT_TEMPERATURE_MIN}
                        max={BOT_TEMPERATURE_MAX}
                        step={BOT_TEMPERATURE_STEP}
                        value={newBotTemperature}
                        onChange={event => setNewBotTemperature(
                          normalizeBotTemperature(Number(event.currentTarget.value))
                        )}
                        className={styles.botParameterRange}
                        aria-label="Reply creativity for this bot"
                        style={{
                          ["--slider-pos" as string]: String(
                            (newBotTemperature - BOT_TEMPERATURE_MIN)
                              / (BOT_TEMPERATURE_MAX - BOT_TEMPERATURE_MIN)
                          ),
                        } as React.CSSProperties}
                      />
                      <div className={styles.botParameterScale} aria-hidden="true">
                        <span>Predictable</span>
                        <span>Balanced</span>
                        <span>Inventive</span>
                      </div>
                    </div>
                    <fieldset
                      className={styles.botParameterField}
                      onMouseEnter={(event) => showFieldHelp(
                        selectedLengthPreset?.description ?? "A custom saved length. Pick a preset to change it.",
                        event.currentTarget
                      )}
                      onMouseLeave={hideFieldHelp}
                      onFocus={(event) => showFieldHelp(
                        selectedLengthPreset?.description ?? "A custom saved length. Pick a preset to change it.",
                        event.currentTarget
                      )}
                      onBlur={hideFieldHelp}
                    >
                      <legend>Reply depth</legend>
                      <small className={styles.botParameterInlineHelp}>
                        Pick the size of answer this bot should naturally aim for.
                      </small>
                      <div className={styles.botLengthOptions}>
                        {BOT_REPLY_LENGTH_PRESETS.map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            className={styles.botLengthOption}
                            data-selected={newBotMaxTokens === preset.tokens ? "true" : undefined}
                            onClick={() => setNewBotMaxTokens(preset.tokens)}
                          >
                            <span>{preset.label}</span>
                            <small>{preset.description}</small>
                          </button>
                        ))}
                      </div>
                    </fieldset>
                  </>
                )}
              </section>
              {mobileBotsPanel && botPreferredModelsModalOpen && (
                <div
                  className={styles.botPreferredModelsModalBackdrop}
                  role="presentation"
                  onClick={() => setBotPreferredModelsModalOpen(false)}
                >
                  <div
                    className={styles.botPreferredModelsModal}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Response tuning"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <header className={styles.botPreferredModelsModalHeader}>
                      <div>
                        <span>Model routing</span>
                        <h4>Response tuning</h4>
                        <p>Adjust model routing, creativity, and natural answer size.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setBotPreferredModelsModalOpen(false)}
                        aria-label="Close response tuning"
                      >
                        ×
                      </button>
                    </header>
                    <div className={styles.botPreferredModelsModalBody}>
                      <div className={`${styles.botParameterField} ${styles.botParameterModelField}`}>
                        <span>Preferred offline model</span>
                        <select
                          value={visibleLocalModelChoice}
                          onChange={(event) => setNewBotLocalModel(event.currentTarget.value)}
                          aria-label="Preferred offline model for this bot"
                        >
                          <option value={AUTO_MODEL_CHOICE}>Auto</option>
                          {localModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}{model.isDefault ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                        <small>Used when this bot replies while the editor is set to LOCAL.</small>
                      </div>
                      <div className={`${styles.botParameterField} ${styles.botParameterModelField}`}>
                        <span>Preferred online model</span>
                        <select
                          value={visibleOnlineModelChoice}
                          onChange={(event) => setNewBotOnlineModel(event.currentTarget.value)}
                          aria-label="Preferred online model for this bot"
                          disabled={!newBotOnlineEnabled}
                        >
                          <option value={AUTO_MODEL_CHOICE}>Auto</option>
                          {onlineModelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                              {model.label}{model.isDefault ? " (default)" : ""}
                            </option>
                          ))}
                        </select>
                        <small>
                          {newBotOnlineEnabled
                            ? "Used when this bot replies while the editor is set to ONLINE."
                            : "Disabled while online capability is off."}
                        </small>
                      </div>
                      <div className={styles.botParameterField}>
                        <div className={styles.botParameterQuestionRow}>
                          <span>Reply creativity</span>
                          <strong>{botTemperatureLabel(newBotTemperature)}</strong>
                        </div>
                        <small className={styles.botParameterInlineHelp}>
                          Lower values keep answers predictable; higher values allow more surprise.
                        </small>
                        <input
                          type="range"
                          min={BOT_TEMPERATURE_MIN}
                          max={BOT_TEMPERATURE_MAX}
                          step={BOT_TEMPERATURE_STEP}
                          value={newBotTemperature}
                          onChange={event => setNewBotTemperature(
                            normalizeBotTemperature(Number(event.currentTarget.value))
                          )}
                          className={styles.botParameterRange}
                          aria-label="Reply creativity for this bot"
                          style={{
                            ["--slider-pos" as string]: String(
                              (newBotTemperature - BOT_TEMPERATURE_MIN)
                                / (BOT_TEMPERATURE_MAX - BOT_TEMPERATURE_MIN)
                            ),
                          } as React.CSSProperties}
                        />
                      </div>
                      <fieldset className={styles.botParameterField}>
                        <legend>Reply depth</legend>
                        <small className={styles.botParameterInlineHelp}>
                          Pick the size of answer this bot should naturally aim for.
                        </small>
                        <div className={styles.botLengthOptions}>
                          {BOT_REPLY_LENGTH_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              className={styles.botLengthOption}
                              data-selected={newBotMaxTokens === preset.tokens ? "true" : undefined}
                              onClick={() => setNewBotMaxTokens(preset.tokens)}
                            >
                              <span>{preset.label}</span>
                              <small>{preset.description}</small>
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    </div>
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={!primaryActive}
                style={primaryStyle}
              >
                {primaryLabel}
              </button>
              </form>
            )}

            {botPanelLibraryEnabled && (
            <section
              className={styles.botLibraryDrawer}
              data-expanded={botLibraryExpanded ? "true" : undefined}
              aria-label="Bot library"
            >
              <button
                type="button"
                className={styles.botLibraryHandle}
                onClick={toggleBotLibraryDrawer}
                aria-expanded={botLibraryExpanded}
                aria-controls="bot-library-drawer-content"
              >
                <span className={styles.botLibraryGrip} aria-hidden="true" />
                {/* Handle label is the click *destination*, not the current
                    view: collapsed → "Bot library" (click to open the drawer),
                    expanded → "Bot Creator" (click to collapse back to the
                    create-bot form). */}
                <span className={styles.botLibraryHandleCopy}>
                  <strong>
                    {botLibraryExpanded ? "Bot Creator" : "Bot library"}
                  </strong>
                  <small>{botLibrarySummary}</small>
                </span>
                <span className={styles.botLibraryHandleChevron} aria-hidden="true">
                  {botLibraryExpanded ? "↓" : "↑"}
                </span>
              </button>

              {botLibraryExpanded && (
                <div
                  id="bot-library-drawer-content"
                  className={`${styles.botsScrollArea} ${styles.botLibraryContent}`}
                  data-closing={botLibraryClosing ? "true" : undefined}
                  data-dashboard-active={botPanelDashboardActive ? "true" : undefined}
                  data-list-visible={botPanelListVisible ? "true" : undefined}
                >
                  <h4 className={styles.sectionLabel}>Built-in</h4>
              <div
                className={`${styles.botCard} ${styles.botCardDefault}`}
                aria-label="Default bot: always available, cannot be deleted"
              >
                <span className={styles.botCardGlyph} aria-hidden="true">
                  <BotGlyph name="bot" />
                </span>
                <div className={styles.botCardBody}>
                  <div className={styles.botCardDefaultHeader}>
                    <strong>Default</strong>
                    <span className={styles.botCardBadge}>Always on</span>
                  </div>
                  <small>
                    Plain chat with no custom system prompt. Kept as a permanent fallback so you can always talk to your model, even if every other bot is deleted.
                  </small>
                </div>
              </div>

              {bots.length > 0 && botPanelDashboardActive && (
                <div className={styles.botGroupGrid} role="list" aria-label="Bot color groups">
                  <button
                    type="button"
                    role="listitem"
                    className={`${styles.botGroupTile} ${styles.botGroupTileNeutral}`}
                    data-selected={botPanelGroup === BOT_LIBRARY_FILTER_ALL ? "true" : undefined}
                    onClick={() => setBotPanelGroup(BOT_LIBRARY_FILTER_ALL)}
                    aria-label={`Show all bots (${bots.length})`}
                  >
                    <span className={styles.botGroupTileLetter} aria-hidden="true">
                      <BotGlyph name="triangle" size={16} strokeWidth={2.3} />
                    </span>
                    <span className={styles.botGroupTileCount}>
                      {bots.length === 1 ? "1 bot" : `${bots.length} bots`}
                    </span>
                  </button>
                  {botGroupOrder.map(group => {
                    const groupBots = botGroupBuckets[group.id];
                    const count = groupBots.length;
                    // Build the rest/hover gradients from the actual
                    // bot colors in this bucket so each tile reads as
                    // its own spectrum slice while the prism border
                    // still anchors the letter identity.
                    const gradientRest = buildBotGroupGradient(
                      groupBots, resolvedTheme, panelColorHarmonyActive, 22
                    );
                    const gradientHover = buildBotGroupGradient(
                      groupBots, resolvedTheme, panelColorHarmonyActive, 32
                    );
                    const tileStyle: React.CSSProperties = {
                      ["--group-color" as string]: group.swatch,
                      ...(gradientRest
                        ? { ["--group-gradient" as string]: gradientRest }
                        : {}),
                      ...(gradientHover
                        ? { ["--group-gradient-hover" as string]: gradientHover }
                        : {}),
                    };
                    return (
                      <button
                        key={group.id}
                        type="button"
                        role="listitem"
                        className={styles.botGroupTile}
                        data-selected={botPanelGroup === group.id ? "true" : undefined}
                        style={tileStyle}
                        onClick={() => setBotPanelGroup(group.id)}
                        disabled={count === 0}
                        aria-label={`Open ${group.label} bots (${count})`}
                      >
                        <span className={styles.botGroupTileLetter} aria-hidden="true">
                          {GROUP_LETTER_OVERRIDES[group.id]}
                        </span>
                        <span className={styles.botGroupTileCount}>
                          {count === 1 ? "1 bot" : `${count} bots`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {bots.length > 0 && botPanelListVisible && (
                <div className={styles.botLibraryListArea}>
                  <div className={styles.botLibraryListHeader}>
                    <h4 className={styles.sectionLabel}>{activeBotPanelFilterLabel}</h4>
                    <span className={styles.botGroupDrilldownCount}>
                      {visibleBotPanelBots.length === 1
                        ? "1 bot"
                        : `${visibleBotPanelBots.length} bots`}
                    </span>
                  </div>
                  {/* List-level data attrs mirror the sidebar conversation list:
                      `data-delete-holding` during a press-and-hold on any card ×,
                      `data-delete-armed-all` once the threshold crosses. The CSS
                      keys off both to drive the glow / tilt / iOS-jiggle visuals
                      across every card's × in parallel. Wrapping the map in a
                      div is what gives us a single element to hang those on. */}
                  <div className={styles.botLibraryInnerScroll}>
                    <div
                      className={styles.botList}
                      data-delete-holding={
                        holdingKey && holdingKey.startsWith(BOT_DELETE_KEY_PREFIX)
                          ? "true"
                          : undefined
                      }
                      data-delete-armed-all={
                        pendingDeleteKey === DELETE_ALL_BOTS_KEY ? "true" : undefined
                      }
                    >
                      {visibleBotPanelBots.map(b => {
                      const isEditing = editingBotId === b.id;
                      // Live preview during editing — the card mirrors the
                      // values currently in the top form so color/glyph
                      // changes are visible on the card itself before
                      // "Update" commits.
                      const liveColor = isEditing ? newBotColor : b.color;
                      const liveGlyph = isEditing
                        ? newBotGlyph
                        : (isBotGlyphName(b.glyph) ? b.glyph : DEFAULT_BOT_GLYPH);
                      // Adornments use a display-only harmony pass at large
                      // counts so stacked card accents read as one spectrum;
                      // the saved bot color and edit swatch stay exact.
                      const cardAccent = liveColor
                        ? panelBotDisplayAccent(
                            liveColor,
                            resolvedTheme,
                            panelColorHarmonyActive
                          )
                        : null;
                      const cardStyle = cardAccent
                        ? ({
                            "--bot-color": cardAccent,
                            "--bot-tile-ink": pickReadableText(cardAccent),
                          } as React.CSSProperties)
                        : undefined;
                      const cardClassName = isEditing
                        ? `${styles.botCard} ${styles.botCardEditing}`
                        : styles.botCard;

                      return (
                        // Two siblings inside a plain wrapper: the tile area
                        // (a real <button> so keyboard + screen-reader tap
                        // parity works) and the × delete affordance. Nesting
                        // <button> inside <button> is invalid HTML, which is
                        // why the card itself is a div — matches the sidebar
                        // conversation row's "title-button + delete-button"
                        // pattern exactly. `draggable` lifts the wrapper for
                        // reorder; nested <button> children are drag-inert
                        // by default so the × and the edit-tap still work.
                        <div key={b.id} className={cardClassName} style={cardStyle}>
                          <button
                            type="button"
                            className={styles.botCardTile}
                            onClick={() => {
                              startEditBot(b);
                              closeBotLibraryDrawer();
                            }}
                            aria-label={`Edit ${b.name}`}
                            aria-pressed={isEditing}
                          >
                            <span className={styles.botCardGlyph} aria-hidden="true">
                              <BotGlyph name={liveGlyph} />
                            </span>
                            <div className={styles.botCardBody}>
                              <div className={styles.botCardTitleRow}>
                                <strong>{b.name}</strong>
                              </div>
                              <small>
                                {(() => {
                                  const preview = stripBotProfileMetaSuffix(
                                    b.system_prompt
                                  ).trim();
                                  if (!preview) return "No personality copy yet";
                                  const clipped = preview.slice(0, 80);
                                  return preview.length > 80 ? `${clipped}…` : clipped;
                                })()}
                              </small>
                            </div>
                          </button>
                          {renderBotDeleteButton(b)}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                </div>
              )}
                </div>
              )}
            </section>
            )}
            {/* Errors from createBot / deleteBot / saveBot used to silently
                surface in the composer behind the drawer overlay. They now
                live inside the panel next to the action that triggered
                them. */}
            {panelNotice && <p className={styles.panelNotice} role="status">{panelNotice}</p>}
            {panelError && <p className={styles.error} role="alert">{panelError}</p>}
          </div>
        );
      })()}

      {/* ── Images panel ── */}
      {panel === "images" && (() => {
        // Image generation always calls OpenAI DALL-E. Honor the LOCAL
        // invariant by hiding the form when LOCAL is selected; past images
        // stay visible so the gallery remains useful.
        const canGenerate = settings?.preferredProvider === "openai";
        return (
          <div
            className={`${styles.panel} ${styles.panelImages}`}
            data-closing={panelClosing ? "true" : undefined}
          >
            <div className={styles.panelHeader}><h3>Images</h3><button type="button" className={styles.panelClose} onClick={closePanel}>×</button></div>
            {canGenerate ? (
              <form className={styles.form} onSubmit={generateImg}>
                <input required placeholder="Describe an image..." value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} />
                <button type="submit" disabled={busy}>{busy ? "Generating..." : "Generate"}</button>
              </form>
            ) : (
              <div className={styles.imagesGate} role="note">
                <div className={styles.imagesGateTitle}>Online mode required</div>
                <p className={styles.muted}>
                  Image generation uses OpenAI DALL-E, so it only runs when the response
                  mode is set to <strong>ONLINE</strong>. Flip the toggle above the composer
                  (or in the sidebar) to enable it.
                </p>
              </div>
            )}
            {images.length > 0 && <h4 className={styles.sectionLabel}>Recent</h4>}
            <div className={styles.imageGrid}>
              {images.map(img => (
                <a key={img.id} href={img.url} target="_blank" rel="noreferrer">
                  {/* User-generated remote URLs are rendered directly in the gallery surface. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.prompt} />
                </a>
              ))}
            </div>
            {/* Scoped to panelError so a chat-send 401 from the composer
                doesn't double up inside the Images drawer. */}
            {panelError && <p className={styles.error} role="alert">{panelError}</p>}
          </div>
        );
      })()}
    </>
  );

  // ── Hub ──
  // Landing screen shown immediately after login. Reuses the auth
  // background verbatim so the visual transition from login to hub feels
  // like a single continuous surface. Each tile represents a post-auth
  // mode; Chat stays disabled in Phase 1 and lights up once the mode is
  // built out.
  if (view === "hub") return (
    <main
      className={`${styles.authLayout} ${themeClass}`}
      onContextMenu={handleAppContextMenu}
    >
      <div className={styles.hubCard}>
        <div className={styles.brandLockup}>
          {/* See note on the auth-screen lockup: dark theme uses the boxed
              JPG with animated halos, light theme uses the bare triangle. */}
          <div className={`${styles.brandIconShell} ${styles.userHeroAvatar}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon.jpg"
              alt=""
              aria-hidden="true"
              className={styles.brandIcon}
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/icon-triangle.svg"
              alt=""
              aria-hidden="true"
              className={styles.brandIconLight}
            />
          </div>
          <PrismWordmark className={styles.brandWordmark} />
        </div>
        <p className={styles.hubGreeting}>
          Welcome back, <span className={styles.hubGreetingName}>{user.displayName}</span>.
        </p>
        <div className={styles.hubTiles}>
          <button
            type="button"
            className={styles.hubTile}
            onClick={() => navigateToView("chat")}
          >
            <div className={styles.hubTileGlyph}>
              <GlyphChat size={88} />
            </div>
            <div className={styles.hubTileLabel}>Chat</div>
            <div className={styles.hubTileTagline}>
              A calm, personal chat with your AI. Just say hello.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            onClick={() => navigateToView("sandbox")}
          >
            <div className={styles.hubTileGlyph}>
              <GlyphSandbox size={88} />
            </div>
            <div className={styles.hubTileLabel}>Sandbox</div>
            <div className={styles.hubTileTagline}>
              Full playground: bots, providers, memory, images, and more.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Arena mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphArena size={88} />
            </div>
            <div className={styles.hubTileLabel}>Arena</div>
            <div className={styles.hubTileTagline}>
              Moderated 1 v 1 debate between bots.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Polling mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphPolling size={88} />
            </div>
            <div className={styles.hubTileLabel}>Polling</div>
            <div className={styles.hubTileTagline}>
              AI-powered polls across full bot groups.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Coffee mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphCoffee size={88} />
            </div>
            <div className={styles.hubTileLabel}>Coffee</div>
            <div className={styles.hubTileTagline}>
              Group chat for 2-5 reactive bots.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Games mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphGames size={88} />
            </div>
            <div className={styles.hubTileLabel}>Games</div>
            <div className={styles.hubTileTagline}>
              Boardgame-like bot matches: chess, four-in-a-row, and more.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Story mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphStory size={88} />
            </div>
            <div className={styles.hubTileLabel}>Story</div>
            <div className={styles.hubTileTagline}>
              A door into somewhere else. The shape is still forming.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Library mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphLibrary size={88} />
            </div>
            <div className={styles.hubTileLabel}>Library</div>
            <div className={styles.hubTileTagline}>
              Where gathered things learn how to be remembered.
            </div>
          </button>
          {/* Slate — bot-free document editor (akin to ChatGPT's canvas
              minus the model). Disabled placeholder until the editor
              shell is built; advertised here so the Hub previews the
              full mode roadmap and the auto-fit grid keeps its rhythm
              as future tiles are dropped in. */}
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Slate mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphSlate size={88} />
            </div>
            <div className={styles.hubTileLabel}>Slate</div>
            <div className={styles.hubTileTagline}>
              Distraction-free writing canvas — no bots, just words.
            </div>
          </button>
          <button
            type="button"
            className={styles.hubTile}
            disabled
            title="Pseudo mode is not available yet."
          >
            <div className={styles.hubTileGlyph}>
              <GlyphPseudo size={88} />
            </div>
            <div className={styles.hubTileLabel}>Pseudo</div>
            <div className={styles.hubTileTagline}>
              Half sketch, half system. A place for almost-code.
            </div>
          </button>
        </div>
        <div className={styles.hubFooter}>
          <button
            type="button"
            className={styles.themeToggleButton}
            onClick={() => void cycleThemeMode()}
            aria-label={
              effectiveThemeMode === "system"
                ? `Theme: Auto, currently ${THEME_LABEL[resolvedTheme]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
                : `Theme: ${THEME_LABEL[effectiveThemeMode]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
            }
            data-title={
              effectiveThemeMode === "system"
                ? `Theme: Auto (${THEME_LABEL[resolvedTheme]})`
                : `Theme: ${THEME_LABEL[effectiveThemeMode]}`
            }
          >
            <ThemeGlyph mode={effectiveThemeMode} />
          </button>
          {renderDevToolsButton()}
          <button type="button" onClick={openAllMemoriesPanel}>Memories</button>
        </div>
      </div>
      {renderSharedPanels()}
      {renderDevToolsPanel()}
    </main>
  );

  // ── Chat mode ──
  // Stripped-down "personal Prism" surface. Shares the sandbox layout
  // primitives (sidebar, chat pane, messages, composer, Settings panel)
  // but hides every knob that makes the composer feel technical — no bot
  // picker, no Local/Online toggle, no fork/export, no Incognito, no
  // Bots/Images panels. Default persona is silent; provider routing is
  // whatever the user saved in Settings.
  if (view === "chat") return (
    <main
      className={`${styles.appLayout} ${themeClass}`}
      data-private-active={privateChatActive ? "true" : undefined}
      data-accent-active={appShellStyle ? "true" : undefined}
      style={appShellStyle}
      onContextMenu={handleAppContextMenu}
      onTouchStart={beginSidebarEdgeSwipe}
      onTouchMove={continueSidebarEdgeSwipe}
      onTouchEnd={endSidebarEdgeSwipe}
      onTouchCancel={endSidebarEdgeSwipe}
    >
      {/* Hide the fixed hamburger whenever a drawer is open on either
          side — it otherwise pokes through the sidebar profile tile
          (left) or the panel overlay dimmer (right) at its z-index:201. */}
      <button
        type="button"
        className={`${styles.menuToggle} ${(sidebarOpen || panel !== null) ? styles.menuToggleHidden : ""}`}
        onClick={() => {
          setSidebarOpen(o => !o);
        }}
        aria-hidden={sidebarOpen || panel !== null}
        tabIndex={(sidebarOpen || panel !== null) ? -1 : 0}
      >☰</button>
      <button
        type="button"
        className={`${styles.sidebarHandle} ${sidebarOpen ? styles.sidebarHandleOpen : ""} ${
          panel !== null ? styles.sidebarHandleHidden : ""
        }`}
        onClick={() => {
          setSidebarOpen(o => !o);
        }}
        aria-label={sidebarOpen ? "Close conversation panel" : "Open conversation panel"}
        aria-pressed={sidebarOpen}
        title={sidebarOpen ? "Close conversations" : "Open conversations"}
      >
        <span aria-hidden="true">{sidebarOpen ? "‹" : "›"}</span>
      </button>
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
        aria-hidden={sidebarDrawerMode && !sidebarOpen ? true : undefined}
        inert={sidebarDrawerMode && !sidebarOpen ? true : undefined}
      >
        {renderProfileCard()}

        <div className={styles.newChatGroup}>
          <button
            type="button"
            className={styles.newChatButton}
            onClick={() => startFreshConversation(false)}
          >
            New chat
          </button>
          {/* Private chat = chat-mode-only sibling. One click seeds the
              next send as { incognito: true } and preserves the selected
              bot as prompt identity. The returned detail stays in memory
              only; no conversation row or messages are saved. */}
          <button
            type="button"
            className={`${styles.privateChatButton} ${pendingIncognito ? styles.privateChatButtonActive : ""}`}
            style={privateChatButtonStyle}
            onClick={() => startFreshConversation(true)}
            aria-pressed={pendingIncognito}
            title="Private chat — no saved history or memory"
          >
            <span className={styles.privateChatButtonIcon} aria-hidden="true">
              {/* Stroke-only lock glyph so it inherits currentColor and
                  stays crisp in both themes without a separate asset. */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            Private chat
          </button>
        </div>

        {visibleConversations.length > 0 && (
          <div className={styles.conversationHeaderRow}>
            <span className={styles.sectionLabel}>Conversations</span>
            <button
              type="button"
              className={styles.conversationDeleteAllButton}
              onClick={() => armDelete(DELETE_ALL_KEY)}
              aria-label="Delete all chats"
              title="Delete all chats"
            >
              ×
            </button>
          </div>
        )}
        <ul
          className={styles.conversationList}
          data-private-empty={showPrivateConversationEmptyState ? "true" : undefined}
          onScroll={event => setConversationListScrollTop(event.currentTarget.scrollTop)}
        >
          {renderConversationListContents()}
        </ul>

        <div className={styles.sidebarFooter}>
          <button type="button" onClick={() => openRightPanel("settings")}>Settings</button>
          <button type="button" onClick={() => openRightPanel("bots")}>Bots</button>
          <button type="button" onClick={() => openRightPanel("images")}>Images</button>
          <button type="button" onClick={openAllMemoriesPanel}>Memories</button>
        </div>
      </aside>

      <section
        className={styles.chatPane}
        data-chat-mobile-msg-focus={mobileFocusedMessageId ? "true" : undefined}
      >
        <header className={styles.chatHeader}>
          <div className={styles.chatHeaderIdentityGroup}>
            <button
              type="button"
              className={styles.hubHomeButton}
              onClick={resetChatHeaderToNewChat}
              aria-label="Back to new chat"
              title="Back to new chat"
            >
              {headerIdentity ? (
                <span
                  className={styles.headerIdentity}
                  data-private-bot={privateCustomBotActive ? "true" : undefined}
                  style={
                    headerIdentity.color
                      ? ({
                          "--header-identity-color": normalizeAccentForTheme(
                            headerIdentity.color,
                            resolvedTheme
                          ),
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <span className={styles.headerIdentityGlyph} aria-hidden="true">
                    <BotGlyph name={headerIdentity.glyph} size={32} strokeWidth={1.55} />
                  </span>
                  <span className={styles.headerIdentityName}>{headerIdentity.name}</span>
                </span>
              ) : (
                <PrismWordmark className={styles.hubHomeWordmark} />
              )}
            </button>
            {viewportWidth <= PICKER_MOBILE_BREAKPOINT ? renderMemoryToasts() : null}
          </div>
          <h2>{detail?.title ?? "New conversation"}</h2>
          {renderChatOverflowGear()}
        </header>

        <div
          className={styles.messagesFrame}
          data-mode={messagesFrameMode}
          data-private-bot={privateCustomBotActive ? "true" : undefined}
          style={messagesFrameStyle}
        >
          <div
            className={`${styles.messages} ${
              !detail && !pendingReplyVisible ? styles.messagesEmptyState : ""
            }`}
            ref={messagesScrollRef}
            data-mobile-msg-focus={mobileFocusedMessageId ? "true" : undefined}
          >
            {!detail && !pendingReplyVisible && (() => {
            // Chat-mode empty state:
            //   • DEFAULT — no hover, no commit: rainbow brand mark,
            //     PRISM home effects, generic title/hint, full picker grid.
            //   • ARMED — hero becomes the bot's full-color glyph, the
            //     selected tile stays visible; tapping the hero primes the
            //     starter hello + focuses compose (tap outside clears bot).
            // `activeBot` resolves the committed bot only, so hover never
            // changes the hero, title, hint, or shell accent.
            // Density math runs against the visible bot window, not the
            // full library. The hue lens pans that window over a circular
            // hue-sorted ribbon so dense libraries move quickly while
            // sparse libraries linger.
            const pickerGeom =
              !pendingIncognito && pickerBots.length > 0
                ? pickerGeometry(
                    pickerBots.length,
                    viewportWidth,
                    viewportHeight,
                    activeHueLensGridOptions
                  )
                : null;
            const suppressHeroCopy =
              pickerGeom?.suppressMobileHeroCopy === true && !emptyStateSearchActive;
            const isPreviewing = false;
            const heroBot = activeBot;
            const privateBotName = pendingIncognito ? heroBot?.name?.trim() : "";
            const title = pendingIncognito
              ? privateBotName
                ? `Private chat with ${privateBotName}`
                : "Private chat"
              : heroBot?.name?.trim() || "What\u2019s on your mind?";
            const descriptionPreview = heroBot
              ? botHeroPreview(heroBot.system_prompt)
              : "";
            const selectedBotPromptPreview =
              !pendingIncognito && selectedBotId !== null && heroBot?.id === selectedBotId
                ? descriptionPreview
                : "";
            // While the hue lens has zoomed into a color group AND nothing is
            // armed yet, the hero is just a tinted Prism placeholder
            // — tapping it would commit the user to a "start with default"
            // conversation when their actual intent is "let me pick from this
            // filtered group." Block the click + nudge them to pick a tile.
            const heroLensPlaceholder =
              hueFilterCenter !== null && !heroBot;
            const heroStartLabel = pendingIncognito
              ? privateBotName
                ? `Tap the symbol above to begin a private chat with ${privateBotName}.`
                : "Tap the symbol above to begin a private chat."
              : heroLensPlaceholder
                ? "Pick a bot from the filtered grid below to begin."
                : heroBot?.name?.trim()
                  ? `Tap the symbol above to have ${heroBot.name.trim()} start the conversation.`
                  : bots.length > 0
                    ? "Tap the symbol above to begin, or pick a bot below."
                    : "Tap the symbol above to begin.";
            const hint = (() => {
              if (pendingIncognito) return `${heroStartLabel} No memories are saved.`;
              if (selectedBotPromptPreview) return selectedBotPromptPreview;
              if (descriptionPreview) return `${descriptionPreview} ${heroStartLabel}`;
              return heroStartLabel;
            })();
            const emptyStateStyle = heroBot
              ? botAccentStyle(heroBot.color, resolvedTheme)
              : undefined;
            const emptyStateClassName = [
              styles.emptyState,
              emptyStateSearchActive ? styles.emptyStateSearching : null,
              suppressHeroCopy ? styles.emptyStateDensePicker : null,
            ].filter(Boolean).join(" ");
            const renderHero = () => (
              <EmptyStateIcon
                bot={isPreviewing ? null : heroBot}
                previewBot={isPreviewing ? heroBot : null}
                previewAsBotGlyph={isPreviewing}
                privateHero={privateChatActive}
                /* Triangle hero replaces the rainbow brand mark whenever
                   the surface isn't in home mode and there's no bot
                   armed — its currentColor follows --accent, which
                   means the triangle matches whatever the rest of the
                   interface is currently tinted to (lens hue while
                   engaged, theme fg in private). Drag-mode keeps its
                   override regardless. */
                forceTrianglePreview={
                  lensInteracting ||
                  (messagesFrameMode !== "home" && !heroBot)
                }
                resolvedTheme={resolvedTheme}
              />
            );
            const heroStartDisabled =
              pendingReply ||
              !isStarterPromptAvailable(draft) ||
              heroLensPlaceholder;
            const heroStartTitle = heroLensPlaceholder
              ? "Pick a bot from the filtered grid to begin"
              : heroBot?.name?.trim()
                ? `Tap to have ${heroBot.name.trim()} start the conversation`
                : "Tap to start the conversation";
            const heroStartAriaLabel = heroLensPlaceholder
              ? "Pick a bot from the filtered grid to begin"
              : heroBot?.name?.trim()
                ? `Start conversation with ${heroBot.name.trim()}`
                : "Start conversation";
            return (
              <div
                className={emptyStateClassName}
                style={emptyStateStyle}
                onClick={handleEmptyStateBackgroundClick}
              >
                {/* Tap any hero (armed bot or default Prism) to dispatch a
                    starter prompt — the bot opens the conversation with its
                    own first message. Disabled mid-draft so accidental clicks
                    don't drop the user's typed text. */}
                {!suppressHeroCopy && (
                  <button
                    type="button"
                    className={styles.emptyStateIconButton}
                    data-bot-talk-hero="true"
                    onClick={handleHeroStartConversation}
                    disabled={heroStartDisabled}
                    title={heroStartTitle}
                    aria-label={heroStartAriaLabel}
                  >
                    {renderHero()}
                  </button>
                )}
                {!suppressHeroCopy && <div className={styles.emptyStateTitle}>{title}</div>}
                {emptyStateSearchActive ? (
                  renderEmptyStateBotSearch()
                ) : suppressHeroCopy ? null : (
                  <p className={styles.emptyStateHint}>{hint}</p>
                )}
                {/* Chat-mode start-of-conversation bot picker. Absent in
                    private chats (the "stripped down further" spec),
                    absent when the user has no bots yet. Clicking any
                    bot only arms/highlights the selection; the grid
                    stays visible until the first message sends.

                    Interaction model:
                      • Hover may animate the tile itself, but it never
                        previews or switches the active bot.
                      • Tap/click arms the selected bot, updates the
                        interface color, and follows the same "visible
                        until Send" contract.

                    Either way, "Default" is not a tile — it's the
                    no-selection state. Sending with nothing armed
                    routes to the PRISM Default persona (botId
                    omitted from the request). To go back to default
                    after arming, tap outside the picker on empty chrome. */}
                {!pendingIncognito && pickerBots.length > 0 && (() => {
                  const geom =
                    pickerGeom ?? pickerGeometry(
                      pickerBots.length,
                      viewportWidth,
                      viewportHeight,
                    activeHueLensGridOptions
                    );
                  // Outer frame is square on mobile and widescreen on
                  // desktop; inner picker is pinned to the computed grid
                  // width so the formation stays centered inside it.
                  const rowWidth =
                    geom.gridCols * geom.tileSize +
                    (geom.gridCols - 1) * geom.tileGap;
                  const frameStyle: React.CSSProperties = {
                    "--picker-width": `${geom.pickerWidth}px`,
                    "--picker-height": `${geom.pickerHeight}px`,
                    "--picker-parallax-x": "0px",
                    "--picker-parallax-y": "0px",
                    "--picker-return-duration": `${BOT_PICKER_RETURN_ANIMATION_MS}ms`,
                  } as React.CSSProperties;
                  const pickerStyle: React.CSSProperties = {
                    "--tile-size": `${geom.tileSize}px`,
                    "--tile-gap": `${geom.tileGap}px`,
                    "--tile-hover-scale": String(geom.hoverScale),
                    "--grid-cols": geom.gridCols,
                    width: `${rowWidth}px`,
                  } as React.CSSProperties;
                  const pickerClassName = [
                    styles.chatBotPicker,
                    geom.singleBot ? styles.chatBotPickerSingle : null,
                    geom.threeBotStack ? styles.chatBotPickerThreeStack : null,
                    geom.mobileColumnStack ? styles.chatBotPickerMobileColumnStack : null,
                    geom.crosshairCursor ? styles.chatBotPickerCrosshair : null,
                    geom.dotCursor ? styles.chatBotPickerDotCursor : null,
                    geom.solidSwatch ? styles.chatBotPickerSolidSwatch : null,
                    geom.compactPixelGrid ? styles.chatBotPickerPixelGrid : null,
                    geom.radialRainbowGradient ? styles.chatBotPickerRainbowGradient : null,
                  ].filter(Boolean).join(" ");
                  const pickerCells = pickerFormationCells(pickerBots, geom);
                  return (
                    <div
                      className={styles.chatBotPickerFrame}
                      data-starter-bot-affordance="true"
                      data-bot-picker-frame="true"
                      data-single-bot={geom.singleBot ? "true" : undefined}
                      data-returning-all={botPickerReturnAnimating ? "true" : undefined}
                      data-search-active={emptyStateSearchActive ? "true" : undefined}
                      data-touch-active={touchPreview ? "true" : undefined}
                      style={frameStyle}
                      onPointerLeave={e => {
                        if (e.pointerType === "mouse") {
                          if (!geom.compactPixelGrid) {
                            resetPickerParallax(e.currentTarget);
                          }
                        }
                      }}
                      onPointerDown={e => handleTouchPickerDown(e, geom)}
                      onPointerMove={handleTouchPickerMove}
                      onPointerUp={e => handleTouchPickerUp(e, geom)}
                      onPointerCancel={handleTouchPickerCancel}
                    >
                      <div
                        className={pickerClassName}
                        role="radiogroup"
                        aria-label="Bot for this chat"
                        style={pickerStyle}
                      >
                        {pickerCells.map((b, cellIndex) => {
                        if (!b) {
                          if (
                            hueFilterActive ||
                            pickerBots.length < pickerSourceBots.length ||
                            geom.threeBotStack ||
                            geom.mobileColumnStack
                          ) return null;
                          return (
                            <span
                              key={`blank-${cellIndex}`}
                              className={styles.chatBotTilePlaceholder}
                              aria-hidden="true"
                            />
                          );
                        }
                        const isSelected = selectedBotId === b.id;
                        const rawColor = b.color?.trim();
                        const accent = rawColor
                          ? normalizeAccentForTheme(rawColor, resolvedTheme)
                          : null;
                        const tileStyle = accent
                          ? ({ "--bot-color": accent } as React.CSSProperties)
                          : undefined;
                        // Six density levels: full card, flat card,
                        // larger glyph, glyphless card, selected-dot pixel
                        // grid, then radial-rainbow abstraction.
                        let tileClassName = styles.chatBotTile;
                        if (isSelected) {
                          tileClassName += ` ${styles.chatBotTileSelected}`;
                        }
                        if (geom.namedFlatTile || geom.flattenTile) {
                          tileClassName += ` ${styles.chatBotTileFlat}`;
                        }
                        if (geom.solidSwatch) {
                          tileClassName += ` ${styles.chatBotTileSolidSwatch}`;
                        } else if (geom.hideGlyphByDefault) {
                          tileClassName += ` ${styles.chatBotTileSwatchOnly}`;
                        }
                        const showPixelGridGlyph = geom.compactPixelGrid;
                        const showSelectedDotGlyph =
                          geom.selectedDotGlyph && isSelected;
                        const showTileGlyph =
                          !geom.hideGlyphByDefault || showPixelGridGlyph;
                        const showFeaturedName =
                          !geom.compactPixelGrid &&
                          geom.tileSize >= PICKER_TILE_NAME_MIN_SIZE;
                        if (showFeaturedName) {
                          tileClassName += ` ${styles.chatBotTileWithName}`;
                          if (
                            geom.namedFlatTile ||
                            geom.flattenTile ||
                            geom.tileSize <= PICKER_TILE_COMPACT_NAME_MAX_SIZE
                          ) {
                            tileClassName += ` ${styles.chatBotTileNamedFlat}`;
                          }
                        }
                        const tileGlyphSize = showPixelGridGlyph
                          ? Math.max(
                              PICKER_PIXEL_GLYPH_MIN_SIZE,
                              Math.round(geom.tileSize * PICKER_PIXEL_GLYPH_RATIO)
                            )
                          : geom.glyphSize;
                        const tileGlyphStroke = showPixelGridGlyph
                          ? PICKER_PIXEL_GLYPH_STROKE
                          : geom.glyphStroke;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={b.name}
                            className={tileClassName}
                            data-bot-id={b.id}
                            onPointerDown={e => {
                              lastBotPickerPointerTypeRef.current = e.pointerType;
                              startBotContextLongPress(e, b);
                            }}
                            onPointerUp={handleBotContextPointerEnd}
                            onPointerCancel={handleBotContextPointerEnd}
                            onPointerEnter={e => {
                              if (e.pointerType !== "mouse" || geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                            }}
                            onPointerMove={e => {
                              handleBotContextPointerMove(e);
                              if (geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openBotContextMenu(b, event.clientX, event.clientY);
                            }}
                            onClick={(e) => {
                              if (botContextSuppressClickRef.current) {
                                botContextSuppressClickRef.current = false;
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              // Dense color-map mode starts at Stage 3 on
                              // mobile and Stage 4 elsewhere: the first
                              // click snaps the hue lens to this bot's
                              // color group instead of selecting the
                              // individual bot. Once the lens narrows the
                              // visible set, normal per-tile selection
                              // resumes.
                              // Grayscale/colorless bots still fall
                              // through because the lens cannot
                              // meaningfully target them.
                              const isDesktopMousePixelClick =
                                geom.compactPixelGrid &&
                                e.detail > 0 &&
                                lastBotPickerPointerTypeRef.current === "mouse";
                              const shouldRelocateHue =
                                !emptyStateSearchActive &&
                                botHasFilterableColor(b) &&
                                (isDesktopMousePixelClick ||
                                  (!hueFilterActive &&
                                    pickerUsesHueNavigation(geom, viewportWidth)));
                              if (
                                shouldRelocateHue
                              ) {
                                const { h } = hexToHsl(b.color!.trim());
                                const lensPosition = hueLensPositionForHue(h);
                                setHueFilterCenter(lensPosition);
                                if (isDesktopMousePixelClick) {
                                  commitEmptyStateBotSelection(b.id);
                                  return;
                                }
                                setSelectedBotId(null);
                                return;
                              }
                              commitEmptyStateBotSelection(b.id);
                            }}
                            title={b.name}
                            style={tileStyle}
                          >
                            {showTileGlyph && (
                              <span className={styles.chatBotTileBotGlyph}>
                                {showSelectedDotGlyph ? (
                                  <>
                                    <span
                                      className={styles.chatBotTileSelectedDotGlyph}
                                      aria-hidden="true"
                                    />
                                    <BotGlyph
                                      name={b.glyph}
                                      size={tileGlyphSize}
                                      strokeWidth={tileGlyphStroke}
                                      className={styles.chatBotTileSelectedHoverGlyph}
                                    />
                                  </>
                                ) : (
                                  <BotGlyph
                                    name={b.glyph}
                                    size={tileGlyphSize}
                                    strokeWidth={tileGlyphStroke}
                                  />
                                )}
                              </span>
                            )}
                            {showFeaturedName && (
                              <span className={styles.chatBotTileFeaturedName}>
                                {b.name}
                              </span>
                            )}
                          </button>
                        );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          {detail?.messages.map(msg => {
            const status = getMessageStatus(msg);
            const modelLabel =
              msg.role === "assistant" && typeof msg.model === "string"
                ? msg.model.trim()
                : "";
            const modelRevealLabel =
              modelLabel ||
              (msg.role === "assistant"
                ? "not recorded"
                : "");
            const messageEdge =
              msg.role !== "assistant"
                ? undefined
                : detail?.incognito
                  ? "private"
                  : messageHasCustomBotIdentity(msg)
                    ? "bot"
                    : "prism";
            // Historical bot messages keep their original bot accent bar.
            // Default/Prism and private messages use CSS-only edge treatments
            // keyed by data-message-edge so the role text can stay neutral.
            const messageStyle =
              msg.role === "assistant" && msg.botColor && !detail?.incognito
                ? ({
                    "--message-accent": normalizeAccentForTheme(
                      msg.botColor,
                      resolvedTheme
                    )
                  } as React.CSSProperties)
                : undefined;
            const userInkStyle =
              msg.role === "user" && threadConversationAccentInk
                ? ({ "--user-msg-tink": threadConversationAccentInk } as React.CSSProperties)
                : undefined;
            const mobileFocusAccentStyle =
              contextFocusedMessageId === msg.id
                ? ({
                    "--message-context-accent": deriveMobileMessageFocusAccent(msg),
                  } as React.CSSProperties)
                : undefined;
            const copied = copiedMessageId === msg.id;
            const mobileContextMenu = viewportWidth <= PICKER_MOBILE_BREAKPOINT;
            return (
              <article
                key={msg.id}
                className={`${styles.message} ${
                  msg.role === "user" ? styles.messageUser : styles.messageAssistant
                }`}
                style={{
                  ...(messageStyle ?? {}),
                  ...userInkStyle,
                  ...mobileFocusAccentStyle,
                }}
                data-model-revealed={modelRevealMessageId === msg.id ? "true" : undefined}
                data-msg-mobile-focus-root={
                  mobileFocusedMessageId === msg.id ? "true" : undefined
                }
                data-msg-context-root={
                  contextFocusedMessageId === msg.id ? "true" : undefined
                }
                data-mobile-context={mobileContextMenu ? "true" : undefined}
                data-message-id={msg.id}
                data-message-edge={messageEdge}
                onContextMenuCapture={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  openMessageContextMenu(msg, event.clientX, event.clientY, {
                    anchor: "center",
                    mobileActivate: mobileContextMenu,
                  });
                }}
                onClick={(event) => {
                  if (!mobileContextMenu) {
                    return;
                  }
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  openMessageContextMenu(msg, rect.left + rect.width * 0.5, rect.bottom + 14, {
                    anchor: "below",
                    mobileActivate: true,
                  });
                }}
              >
                <h4>
                  <span className={styles.messageRoleLabel}>
                    {shouldRenderPrismMessageRoleLabel(msg, detail?.incognito === true) ? (
                      <PrismMessageRoleLabel />
                    ) : msg.role === "assistant" ? (
                      msg.botName?.trim() || DEFAULT_ASSISTANT_NAME
                    ) : (
                      "You"
                    )}
                  </span>
                  {status && (() => {
                    const titleModelCopy = modelLabel
                      ? `Model: ${modelLabel}`
                      : modelRevealLabel
                        ? "Model was not recorded for this earlier message."
                        : "";
                    return (
                      <span
                        className={styles.providerTag}
                        title={titleModelCopy ? `${STATUS_LABEL[status]} · ${titleModelCopy}` : STATUS_LABEL[status]}
                      >
                        <span
                          className={`${styles.providerDot} ${
                            status === "human"
                              ? styles.providerDotHuman
                              : status === "online"
                                ? styles.providerDotOnline
                                : styles.providerDotLocal
                          }`}
                          aria-hidden="true"
                        />
                        {modelRevealLabel && (
                          <span className={styles.providerLabel}>{modelRevealLabel}</span>
                        )}
                      </span>
                    );
                  })()}
                </h4>
                <MessageBody
                  content={msg.content}
                />
                {copied && (
                  <span
                    className={styles.messageCopyToast}
                    role="status"
                    aria-live="polite"
                  >
                    copied
                  </span>
                )}
                {(() => {
                  // Chat-mode per-message actions. Identical behavior to
                  // Sandbox: assistant bubbles get a one-click "Fork here"
                  // (non-destructive branch), user bubbles get Edit, which
                  // rewinds from the message and sends the revised text via
                  // `buildChatRequestBody`.
                  // keeps incognito turns ephemeral while honoring whatever
                  // provider is currently live.
                  const isUser = msg.role === "user";
                  return (
                    <div
                      className={styles.messageActionsSlot}
                      data-copied={copied ? "true" : undefined}
                      data-model-revealed={modelRevealMessageId === msg.id ? "true" : undefined}
                    >
                      <div className={styles.messageActions}>
                        <button
                          type="button"
                          aria-label="Copy message text"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyMessageToClipboard(msg);
                          }}
                        >
                          {copied ? "copied" : "Copy"}
                        </button>
                        {isUser ? (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                beginEditMessage(msg);
                              }}
                            >
                              Edit
                            </button>
                          </>
                        ) : detail?.incognito ? null : (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void forkChat(msg.id);
                              }}
                            >
                              Fork here
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </article>
            );
          })}
          {typingIndicatorNode}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
          {renderConversationStarterRail()}
        </div>

        <form
          className={styles.compose}
          data-starter-compose-surface="true"
          data-compose-bot-selected={selectedComposeBotAccent ? "true" : undefined}
          data-compose-ready={!composerSubmitDisabled(draft) ? "true" : undefined}
          data-keyboard-lifted={mobileKeyboardInset > 0 ? "true" : undefined}
          style={composeStyle}
          onSubmit={handleComposerSubmit}
          onBlur={handleComposerBlur}
          onKeyDown={handleComposerKeyDown}
        >
          {error && <p className={`${styles.error} ${styles.composeError}`} role="alert">{error}</p>}
          {emptyStateLensVisible && (
            <HueLensControl
              bots={pickerSourceBots}
              filteredBots={filteredBots}
              hueFilterCenter={hueFilterCenter}
              onHueChange={setHueFilterCenter}
              hueLensAvailable={hueLensAvailable}
              trackGradient={hueLensTrackGradient}
              trackSegments={hueLensTrackSegments}
              resolvedTheme={resolvedTheme}
              onInteractionChange={setLensInteracting}
            />
          )}
          {/* Chat-mode compose carries two knobs now:
               1. Bot picker — mid-thread override of the conversation's
                  bot. The dropdown reflects a "pending" pick instantly
                  (chatBotOverride state), and the shell accent follows it
                  immediately so the interface feels like that bot is about
                  to speak. Server persistence still waits for the NEXT
                  successful send/reply, which is when chat.ts persists the
                  switch on conversations.bot_id.
               2. LOCAL/ONLINE provider toggle — swap between local
                  Ollama and remote ChatGPT without leaving the chat.
             Privacy stays conversation-level (sidebar "Private chat"
             button at chat start). If the open chat is private
             (detail.incognito) or a brand-new chat is armed as private
             (pendingIncognito), the bot control is disabled — the starter
             bot is locked for the private session — but the provider toggle
             remains usable. */}
          {(() => {
            const isLocal = settings?.preferredProvider === "local";
            const chatLocked =
              detail?.incognito === true || pendingIncognito;
            const displayLocal = isLocal;
            const providerDisabled = !settings;
            // Bot-dropdown value resolves in priority order:
            //   1. chatBotOverride (string | null) — post-detail dropdown
            //      pick; the pending mid-thread switch.
            //   2. detail.botId — the conversation's persisted bot
            //      (authoritative once a thread exists; null = Default
            //      and must NOT fall through to selectedBotId, which
            //      could be a stale sync value from an earlier chat).
            //   3. selectedBotId — only when there's NO conversation yet.
            //      This makes the dropdown trigger mirror whatever the
            //      user armed via the empty-state tile picker, so
            //      its color + glyph match the hero icon.
            //   4. "" — maps to the Default option.
            const botSelectValue =
              chatBotOverride !== undefined
                ? (chatBotOverride ?? "")
                : detail
                  ? (detail.botId ?? "")
                  : (selectedBotId ?? "");
            // `showName` gates whether the trigger renders the bot's
            // NAME next to its glyph. Pre-first-message, the glyph +
            // pill tint communicate "this bot is armed" without
            // duplicating the name that's already prominent on the
            // hero title above. Once the conversation has any message
            // (optimistic user message counts — the name stays visible
            // through the first reply), the dropdown becomes a full
            // "[glyph] [name]" identity pill.
            const botShowName =
              !!detail && detail.messages.length > 0;
            const botFiltersEnabled = botShowName;
            // The dropdown is deliberately gated until the chat is
            // actually underway. Rationale: the empty-state tile
            // picker is already the "starter bot" affordance, so
            // surfacing a second picker that does the same thing just
            // dilutes the UI. Flipping this dropdown only becomes
            // meaningful once there's an existing thread to steer
            // onto a different bot.
            const botDisabled =
              !settings ||
              chatLocked ||
              pendingReply ||
              !detail ||
              bots.length === 0;
            const botTitle = chatLocked
              ? "Private chats keep their starter bot and do not save memories."
              : !detail
                ? "Send your first message to change bots mid-thread."
                : pendingReply
                  ? "Wait for the current reply before switching bots."
                  : bots.length === 0
                    ? "Default is the only Chat option until you create a custom bot."
                    : undefined;
            // Dropdown is disabled pre-detail, so onChange only fires
            // once the thread exists. Set the override directly; the
            // server persists the switch after the new bot's reply.
            const handleBotSelectChange = (value: string) => {
              setChatBotOverride(value === "" ? null : value);
            };
            const modelProvider: Provider = displayLocal ? "local" : "openai";
            const rawModelChoice = chatModelChoiceByProvider[modelProvider];
            const visibleModelChoice = visibleBotCustomizerModelChoice(
              settings,
              rawModelChoice
            );
            const modelOptions = includeSelectedModelOption(
              availableModelOptionsForProvider(modelCatalog, settings, modelProvider),
              visibleModelChoice,
              modelProvider
            );
            const modelSelectDisabled =
              !settings || pendingReply;
            return (
              <div className={styles.composeTools}>
                {bots.length > 0 && (
                  <ComposerBotPicker
                    value={botSelectValue}
                    onChange={handleBotSelectChange}
                    bots={botFiltersEnabled ? bots : filteredBots}
                    resolvedTheme={resolvedTheme}
                    disabled={botDisabled}
                    title={botTitle}
                    ariaLabel="Bot for this chat"
                    showName={botShowName}
                    enableFilters={botFiltersEnabled}
                    hueFilterCenter={hueFilterCenter}
                    onHueChange={setHueFilterCenter}
                    hueLensAvailable={hueLensAvailable}
                    hueLensTrackGradient={hueLensTrackGradient}
                    hueLensTrackSegments={hueLensTrackSegments}
                  />
                )}
                <div
                  className={`${styles.modeControl} ${providerDisabled ? styles.modeControlLocked : ""}`}
                >
                  <button
                    type="button"
                    className={`${styles.modeToggleTrack} ${providerDisabled ? styles.modeToggleTrackLocked : ""}`}
                    onClick={() => {
                      if (providerDisabled) return;
                      void switchProvider(isLocal ? "openai" : "local");
                    }}
                    aria-label={
                      displayLocal
                        ? "Response mode: Local. Click to switch to Online."
                        : "Response mode: Online. Click to switch to Local."
                    }
                    aria-pressed={!displayLocal}
                    aria-disabled={providerDisabled}
                    title={
                      displayLocal
                        ? "Switch to Online"
                        : "Switch to Local"
                    }
                    disabled={providerDisabled}
                  >
                    <span
                      className={`${styles.modeThumb} ${
                        displayLocal ? styles.modeThumbLocal : styles.modeThumbOnline
                      }`}
                    >
                      <span
                        className={`${styles.providerDot} ${
                          displayLocal ? styles.providerDotLocal : styles.providerDotOnline
                        }`}
                        aria-hidden="true"
                      />
                      <span className={styles.modeThumbLabel}>
                        {displayLocal ? "LOCAL" : "ONLINE"}
                      </span>
                    </span>
                  </button>
                </div>
                <ComposerModelPicker
                  value={visibleModelChoice}
                  onChange={(nextChoice) => {
                    setChatModelChoiceByProvider((previous) => ({
                      ...previous,
                      [modelProvider]: nextChoice,
                    }));
                  }}
                  options={modelOptions}
                  provider={modelProvider}
                  disabled={modelSelectDisabled}
                  title={`Model for ${displayLocal ? "LOCAL" : "ONLINE"} replies`}
                  ariaLabel={`Model for ${displayLocal ? "local" : "online"} replies`}
                />
                {renderComposeUtilityActions()}
              </div>
            );
          })()}
          {editingMessageId && (
            <div className={styles.composeEditNotice} role="status">
              <span>Editing message. Save creates a new fork and sends the revised text.</span>
              <button type="button" onClick={cancelEditMessage}>Cancel</button>
            </div>
          )}
          <ComposerInput
            ref={draftComposerRef}
            enabled={composerMarkdownEditorEnabled}
            value={draft}
            placeholder="Say something..."
            submitDisabled={composerSubmitDisabled(draft)}
            submitLabel={composerSubmitLabel(draft)}
            hideSubmitButton={hideMobileEmptySend}
            onChange={handleComposerChange}
            onValueChange={updateComposerDraft}
            onFocus={handleComposerFocus}
          />
        </form>
        {renderMessageContextMenu()}
        {renderBotContextMenu()}
      </section>

      {renderSharedPanels()}
      {renderDeleteAllModal()}
      {renderDevToolsPanel()}
      {touchPreview && (
        <TouchPreviewBalloon
          bot={
            touchPreview.botId
              ? bots.find((candidate) => candidate.id === touchPreview.botId) ?? null
              : null
          }
          x={touchPreview.x}
          y={touchPreview.y}
          resolvedTheme={resolvedTheme}
        />
      )}
    </main>
  );

  // ── App shell (Sandbox mode) ──
  // Reached when view !== "hub" and view !== "chat". Any stray ?view=
  // value falls through here so the user still sees a usable surface
  // instead of a blank page.
  return (
    <main
      className={`${styles.appLayout} ${themeClass}`}
      data-private-active={privateChatActive ? "true" : undefined}
      data-accent-active={appShellStyle ? "true" : undefined}
      style={appShellStyle}
      onContextMenu={handleAppContextMenu}
      onTouchStart={beginSidebarEdgeSwipe}
      onTouchMove={continueSidebarEdgeSwipe}
      onTouchEnd={endSidebarEdgeSwipe}
      onTouchCancel={endSidebarEdgeSwipe}
    >
      {/* Mobile menu toggle — faded out while either drawer is open
          (sidebar on the left, Settings/Bots/Images panel on the right)
          so the fixed hamburger doesn't overlap the profile avatar or
          poke through the panel overlay dimmer. */}
      <button
        type="button"
        className={`${styles.menuToggle} ${(sidebarOpen || panel !== null) ? styles.menuToggleHidden : ""}`}
        onClick={() => {
          setSidebarOpen(o => !o);
        }}
        aria-hidden={sidebarOpen || panel !== null}
        tabIndex={(sidebarOpen || panel !== null) ? -1 : 0}
      >☰</button>
      <button
        type="button"
        className={`${styles.sidebarHandle} ${sidebarOpen ? styles.sidebarHandleOpen : ""} ${
          panel !== null ? styles.sidebarHandleHidden : ""
        }`}
        onClick={() => {
          setSidebarOpen(o => !o);
        }}
        aria-label={sidebarOpen ? "Close conversation panel" : "Open conversation panel"}
        aria-pressed={sidebarOpen}
        title={sidebarOpen ? "Close conversations" : "Open conversations"}
      >
        <span aria-hidden="true">{sidebarOpen ? "‹" : "›"}</span>
      </button>
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
        aria-hidden={sidebarDrawerMode && !sidebarOpen ? true : undefined}
        inert={sidebarDrawerMode && !sidebarOpen ? true : undefined}
      >
        {renderProfileCard()}

        <div className={styles.newChatGroup}>
          <button
            type="button"
            className={styles.newChatButton}
            onClick={() => startFreshConversation(false)}
          >
            New chat
          </button>
          <button
            type="button"
            className={`${styles.privateChatButton} ${pendingIncognito ? styles.privateChatButtonActive : ""}`}
            style={privateChatButtonStyle}
            onClick={() => startFreshConversation(true)}
            aria-pressed={pendingIncognito}
            title="Private chat — no saved history or memory"
          >
            <span className={styles.privateChatButtonIcon} aria-hidden="true">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
            </span>
            Private chat
          </button>
        </div>

        {visibleConversations.length > 0 && (
          <div className={styles.conversationHeaderRow}>
            <span className={styles.sectionLabel}>Conversations</span>
            <button
              type="button"
              className={styles.conversationDeleteAllButton}
              onClick={() => armDelete(DELETE_ALL_KEY)}
              aria-label="Delete all chats"
              title="Delete all chats"
            >
              ×
            </button>
          </div>
        )}
        <ul
          className={styles.conversationList}
          data-private-empty={showPrivateConversationEmptyState ? "true" : undefined}
          onScroll={event => setConversationListScrollTop(event.currentTarget.scrollTop)}
        >
          {renderConversationListContents()}
        </ul>

        <div className={styles.sidebarFooter}>
          <button type="button" onClick={() => openRightPanel("settings")}>Settings</button>
          <button type="button" onClick={() => openRightPanel("bots")}>Bots</button>
          <button type="button" onClick={() => openRightPanel("images")}>Images</button>
          <button type="button" onClick={openAllMemoriesPanel}>Memories</button>
        </div>
      </aside>

      {/* Chat */}
      <section
        className={styles.chatPane}
        data-chat-mobile-msg-focus={mobileFocusedMessageId ? "true" : undefined}
      >
        <header className={styles.chatHeader}>
          <div className={styles.chatHeaderIdentityGroup}>
            <button
              type="button"
              className={styles.hubHomeButton}
              onClick={resetChatHeaderToNewChat}
              aria-label="Back to new chat"
              title="Back to new chat"
            >
              {headerIdentity ? (
                <span
                  className={styles.headerIdentity}
                  data-private-bot={privateCustomBotActive ? "true" : undefined}
                  style={
                    headerIdentity.color
                      ? ({
                          "--header-identity-color": normalizeAccentForTheme(
                            headerIdentity.color,
                            resolvedTheme
                          ),
                        } as React.CSSProperties)
                      : undefined
                  }
                >
                  <span className={styles.headerIdentityGlyph} aria-hidden="true">
                    <BotGlyph name={headerIdentity.glyph} size={32} strokeWidth={1.55} />
                  </span>
                  <span className={styles.headerIdentityName}>{headerIdentity.name}</span>
                </span>
              ) : (
                <PrismWordmark className={styles.hubHomeWordmark} />
              )}
            </button>
            {viewportWidth <= PICKER_MOBILE_BREAKPOINT ? renderMemoryToasts() : null}
          </div>
          <h2>{detail?.title ?? "New conversation"}</h2>
          {renderChatOverflowGear()}
        </header>

        <div
          className={styles.messagesFrame}
          data-mode={messagesFrameMode}
          data-private-bot={privateCustomBotActive ? "true" : undefined}
          style={messagesFrameStyle}
        >
          <div
            className={`${styles.messages} ${
              !detail && !pendingReplyVisible ? styles.messagesEmptyState : ""
            }`}
            ref={messagesScrollRef}
            data-mobile-msg-focus={mobileFocusedMessageId ? "true" : undefined}
          >
            {!detail && !pendingReplyVisible && (() => {
            // Sandbox empty state — mirrors the Chat-mode empty state so
            // both modes feel like the same "start a new chat" surface:
            //   • DEFAULT — no hover, no armed bot: brand mark hero, full
            //     picker grid, generic title/hint.
            //   • ARMED — hero becomes the bot's full-color glyph, the
            //     selected tile stays visible; tapping the hero primes the
            //     starter hello + focuses compose (tap outside clears bot).
            //
            // The compose bot dropdown stays DISABLED while !detail so
            // the tile picker is the single arming path pre-chat;
            // once the first send lands, detail exists and the dropdown
            // takes over as the mid-thread bot switcher.
            //
            // Picker geometry runs against the visible bot window so the
            // hue lens can step the density stage back when the ribbon
            // window contains far fewer bots than the full library.
            const pickerGeom =
              !pendingIncognito && pickerBots.length > 0
                ? pickerGeometry(
                    pickerBots.length,
                    viewportWidth,
                    viewportHeight,
                    activeHueLensGridOptions
                  )
                : null;
            const suppressHeroCopy =
              pickerGeom?.suppressMobileHeroCopy === true && !emptyStateSearchActive;
            const isPreviewing = false;
            const heroBot = activeBot;
            const privateBotName = pendingIncognito ? heroBot?.name?.trim() : "";
            const title = pendingIncognito
              ? privateBotName
                ? `Private chat with ${privateBotName}`
                : "Private chat"
              : heroBot?.name?.trim() || "Start a new conversation";
            const descriptionPreview = heroBot
              ? botHeroPreview(heroBot.system_prompt)
              : "";
            const selectedBotPromptPreview =
              !pendingIncognito && selectedBotId !== null && heroBot?.id === selectedBotId
                ? descriptionPreview
                : "";
            // While the hue lens has zoomed into a color group AND nothing is
            // armed yet, the hero is just a tinted Prism placeholder
            // — tapping it would commit the user to a "start with default"
            // conversation when their actual intent is "let me pick from this
            // filtered group." Block the click + nudge them to pick a tile.
            const heroLensPlaceholder =
              hueFilterCenter !== null && !heroBot;
            const heroStartLabel = pendingIncognito
              ? privateBotName
                ? `Tap the symbol above to begin a private chat with ${privateBotName}.`
                : "Tap the symbol above to begin a private chat."
              : heroLensPlaceholder
                ? "Pick a bot from the filtered grid below to begin."
                : heroBot?.name?.trim()
                  ? `Tap the symbol above to have ${heroBot.name.trim()} start the conversation.`
                  : bots.length > 0
                    ? "Tap the symbol above to begin, or pick a bot below."
                    : "Tap the symbol above to begin.";
            const hint = (() => {
              if (pendingIncognito) return `${heroStartLabel} No memories are saved.`;
              if (selectedBotPromptPreview) return selectedBotPromptPreview;
              if (descriptionPreview) return `${descriptionPreview} ${heroStartLabel}`;
              return heroStartLabel;
            })();
            const emptyStateStyle = heroBot
              ? botAccentStyle(heroBot.color, resolvedTheme)
              : undefined;
            const emptyStateClassName = [
              styles.emptyState,
              emptyStateSearchActive ? styles.emptyStateSearching : null,
              suppressHeroCopy ? styles.emptyStateDensePicker : null,
            ].filter(Boolean).join(" ");
            const renderHero = () => (
              <EmptyStateIcon
                bot={isPreviewing ? null : heroBot}
                previewBot={isPreviewing ? heroBot : null}
                previewAsBotGlyph={isPreviewing}
                privateHero={privateChatActive}
                /* Triangle hero replaces the rainbow brand mark whenever
                   the surface isn't in home mode and there's no bot
                   armed — its currentColor follows --accent, which
                   means the triangle matches whatever the rest of the
                   interface is currently tinted to (lens hue while
                   engaged, theme fg in private). Drag-mode keeps its
                   override regardless. */
                forceTrianglePreview={
                  lensInteracting ||
                  (messagesFrameMode !== "home" && !heroBot)
                }
                resolvedTheme={resolvedTheme}
              />
            );
            const heroStartDisabled =
              pendingReply ||
              !isStarterPromptAvailable(draft) ||
              heroLensPlaceholder;
            const heroStartTitle = heroLensPlaceholder
              ? "Pick a bot from the filtered grid to begin"
              : heroBot?.name?.trim()
                ? `Tap to have ${heroBot.name.trim()} start the conversation`
                : "Tap to start the conversation";
            const heroStartAriaLabel = heroLensPlaceholder
              ? "Pick a bot from the filtered grid to begin"
              : heroBot?.name?.trim()
                ? `Start conversation with ${heroBot.name.trim()}`
                : "Start conversation";
            return (
              <div
                className={emptyStateClassName}
                style={emptyStateStyle}
                onClick={handleEmptyStateBackgroundClick}
              >
                {/* Tap any hero (armed bot or default Prism) to dispatch a
                    starter prompt — the bot opens the conversation with its
                    own first message. Disabled mid-draft so accidental clicks
                    don't drop the user's typed text. */}
                {!suppressHeroCopy && (
                  <button
                    type="button"
                    className={styles.emptyStateIconButton}
                    data-bot-talk-hero="true"
                    onClick={handleHeroStartConversation}
                    disabled={heroStartDisabled}
                    title={heroStartTitle}
                    aria-label={heroStartAriaLabel}
                  >
                    {renderHero()}
                  </button>
                )}
                {!suppressHeroCopy && <div className={styles.emptyStateTitle}>{title}</div>}
                {emptyStateSearchActive ? (
                  renderEmptyStateBotSearch()
                ) : suppressHeroCopy ? null : (
                  <p className={styles.emptyStateHint}>{hint}</p>
                )}
                {!pendingIncognito && pickerBots.length > 0 && (() => {
                  // Same geometry math as the Chat-mode picker: mobile
                  // stays square, desktop goes widescreen, and density
                  // stages scale from the viewport-driven frame width.
                  // Sourced from `pickerBots` (color-sorted view of the
                  // hue-lens-filtered library) so the unfiltered grid
                  // reads as a navigable color map.
                  const geom =
                    pickerGeom ?? pickerGeometry(
                      pickerBots.length,
                      viewportWidth,
                      viewportHeight,
                      activeHueLensGridOptions
                    );
                  const rowWidth =
                    geom.gridCols * geom.tileSize +
                    (geom.gridCols - 1) * geom.tileGap;
                  const frameStyle: React.CSSProperties = {
                    "--picker-width": `${geom.pickerWidth}px`,
                    "--picker-height": `${geom.pickerHeight}px`,
                    "--picker-parallax-x": "0px",
                    "--picker-parallax-y": "0px",
                    "--picker-return-duration": `${BOT_PICKER_RETURN_ANIMATION_MS}ms`,
                  } as React.CSSProperties;
                  const pickerStyle: React.CSSProperties = {
                    "--tile-size": `${geom.tileSize}px`,
                    "--tile-gap": `${geom.tileGap}px`,
                    "--tile-hover-scale": String(geom.hoverScale),
                    "--grid-cols": geom.gridCols,
                    width: `${rowWidth}px`,
                  } as React.CSSProperties;
                  const pickerClassName = [
                    styles.chatBotPicker,
                    geom.singleBot ? styles.chatBotPickerSingle : null,
                    geom.threeBotStack ? styles.chatBotPickerThreeStack : null,
                    geom.mobileColumnStack ? styles.chatBotPickerMobileColumnStack : null,
                    geom.crosshairCursor ? styles.chatBotPickerCrosshair : null,
                    geom.dotCursor ? styles.chatBotPickerDotCursor : null,
                    geom.solidSwatch ? styles.chatBotPickerSolidSwatch : null,
                    geom.compactPixelGrid ? styles.chatBotPickerPixelGrid : null,
                    geom.radialRainbowGradient ? styles.chatBotPickerRainbowGradient : null,
                  ].filter(Boolean).join(" ");
                  const pickerCells = pickerFormationCells(pickerBots, geom);
                  return (
                    <div
                      className={styles.chatBotPickerFrame}
                      data-starter-bot-affordance="true"
                      data-bot-picker-frame="true"
                      data-single-bot={geom.singleBot ? "true" : undefined}
                      data-returning-all={botPickerReturnAnimating ? "true" : undefined}
                      data-search-active={emptyStateSearchActive ? "true" : undefined}
                      data-touch-active={touchPreview ? "true" : undefined}
                      style={frameStyle}
                      onPointerLeave={e => {
                        if (e.pointerType === "mouse") {
                          if (!geom.compactPixelGrid) {
                            resetPickerParallax(e.currentTarget);
                          }
                        }
                      }}
                      onPointerDown={e => handleTouchPickerDown(e, geom)}
                      onPointerMove={handleTouchPickerMove}
                      onPointerUp={e => handleTouchPickerUp(e, geom)}
                      onPointerCancel={handleTouchPickerCancel}
                    >
                      <div
                        className={pickerClassName}
                        role="radiogroup"
                        aria-label="Bot for this chat"
                        style={pickerStyle}
                      >
                        {pickerCells.map((b, cellIndex) => {
                        if (!b) {
                          if (
                            hueFilterActive ||
                            pickerBots.length < pickerSourceBots.length ||
                            geom.threeBotStack ||
                            geom.mobileColumnStack
                          ) return null;
                          return (
                            <span
                              key={`blank-${cellIndex}`}
                              className={styles.chatBotTilePlaceholder}
                              aria-hidden="true"
                            />
                          );
                        }
                        const isSelected = selectedBotId === b.id;
                        const rawColor = b.color?.trim();
                        const accent = rawColor
                          ? normalizeAccentForTheme(rawColor, resolvedTheme)
                          : null;
                        const tileStyle = accent
                          ? ({ "--bot-color": accent } as React.CSSProperties)
                          : undefined;
                        // Six density levels: full card, flat card,
                        // glyphless card, borderless square pixel, compact
                        // gapless pixel grid, then selected-dot pixel grid.
                        let tileClassName = styles.chatBotTile;
                        if (isSelected) {
                          tileClassName += ` ${styles.chatBotTileSelected}`;
                        }
                        if (geom.namedFlatTile || geom.flattenTile) {
                          tileClassName += ` ${styles.chatBotTileFlat}`;
                        }
                        if (geom.solidSwatch) {
                          tileClassName += ` ${styles.chatBotTileSolidSwatch}`;
                        } else if (geom.hideGlyphByDefault) {
                          tileClassName += ` ${styles.chatBotTileSwatchOnly}`;
                        }
                        const showPixelGridGlyph = geom.compactPixelGrid;
                        const showSelectedDotGlyph =
                          geom.selectedDotGlyph && isSelected;
                        const showTileGlyph =
                          !geom.hideGlyphByDefault || showPixelGridGlyph;
                        const showFeaturedName =
                          !geom.compactPixelGrid &&
                          geom.tileSize >= PICKER_TILE_NAME_MIN_SIZE;
                        if (showFeaturedName) {
                          tileClassName += ` ${styles.chatBotTileWithName}`;
                          if (
                            geom.namedFlatTile ||
                            geom.flattenTile ||
                            geom.tileSize <= PICKER_TILE_COMPACT_NAME_MAX_SIZE
                          ) {
                            tileClassName += ` ${styles.chatBotTileNamedFlat}`;
                          }
                        }
                        const tileGlyphSize = showPixelGridGlyph
                          ? Math.max(
                              PICKER_PIXEL_GLYPH_MIN_SIZE,
                              Math.round(geom.tileSize * PICKER_PIXEL_GLYPH_RATIO)
                            )
                          : geom.glyphSize;
                        const tileGlyphStroke = showPixelGridGlyph
                          ? PICKER_PIXEL_GLYPH_STROKE
                          : geom.glyphStroke;
                        return (
                          <button
                            key={b.id}
                            type="button"
                            role="radio"
                            aria-checked={isSelected}
                            aria-label={b.name}
                            className={tileClassName}
                            data-bot-id={b.id}
                            onPointerDown={e => {
                              lastBotPickerPointerTypeRef.current = e.pointerType;
                              startBotContextLongPress(e, b);
                            }}
                            onPointerUp={handleBotContextPointerEnd}
                            onPointerCancel={handleBotContextPointerEnd}
                            onPointerEnter={e => {
                              if (e.pointerType !== "mouse" || geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                            }}
                            onPointerMove={e => {
                              handleBotContextPointerMove(e);
                              if (geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              openBotContextMenu(b, event.clientX, event.clientY);
                            }}
                            onClick={(e) => {
                              if (botContextSuppressClickRef.current) {
                                botContextSuppressClickRef.current = false;
                                e.preventDefault();
                                e.stopPropagation();
                                return;
                              }
                              // Setting selectedBotId also makes the
                              // compose dropdown auto-populate (both
                              // read from the same state).
                              // Dense color-map mode mirrors the Chat
                              // picker. Mobile Stage 3+ / desktop Stage 4+
                              // snaps to a hue region before individual
                              // selection; Stage 5+ desktop mouse clicks
                              // select the exact pixel and also move the
                              // hue lens there.
                              // Grayscale bots fall through to direct
                              // selection because the lens cannot target
                              // them.
                              const isDesktopMousePixelClick =
                                geom.compactPixelGrid &&
                                e.detail > 0 &&
                                lastBotPickerPointerTypeRef.current === "mouse";
                              const shouldRelocateHue =
                                !emptyStateSearchActive &&
                                botHasFilterableColor(b) &&
                                (isDesktopMousePixelClick ||
                                  (!hueFilterActive &&
                                    pickerUsesHueNavigation(geom, viewportWidth)));
                              if (
                                shouldRelocateHue
                              ) {
                                const { h } = hexToHsl(b.color!.trim());
                                const lensPosition = hueLensPositionForHue(h);
                                setHueFilterCenter(lensPosition);
                                if (isDesktopMousePixelClick) {
                                  commitEmptyStateBotSelection(b.id);
                                  return;
                                }
                                setSelectedBotId(null);
                                return;
                              }
                              commitEmptyStateBotSelection(b.id);
                            }}
                            title={b.name}
                            style={tileStyle}
                          >
                            {showTileGlyph && (
                              <span className={styles.chatBotTileBotGlyph}>
                                {showSelectedDotGlyph ? (
                                  <>
                                    <span
                                      className={styles.chatBotTileSelectedDotGlyph}
                                      aria-hidden="true"
                                    />
                                    <BotGlyph
                                      name={b.glyph}
                                      size={tileGlyphSize}
                                      strokeWidth={tileGlyphStroke}
                                      className={styles.chatBotTileSelectedHoverGlyph}
                                    />
                                  </>
                                ) : (
                                  <BotGlyph
                                    name={b.glyph}
                                    size={tileGlyphSize}
                                    strokeWidth={tileGlyphStroke}
                                  />
                                )}
                              </span>
                            )}
                            {showFeaturedName && (
                              <span className={styles.chatBotTileFeaturedName}>
                                {b.name}
                              </span>
                            )}
                          </button>
                        );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          {detail?.messages.map(msg => {
            const status = getMessageStatus(msg);
            const modelLabel =
              msg.role === "assistant" && typeof msg.model === "string"
                ? msg.model.trim()
                : "";
            const modelRevealLabel =
              modelLabel ||
              (msg.role === "assistant"
                ? "not recorded"
                : "");
            // Push the bot's color into the assistant bubble itself so
            // the message owns the accent visually, leaving the header
            // dots free for HUMAN / LOCAL / ONLINE status only. The
            // color runs through normalizeAccentForTheme so any legacy
            // shade outside the theme's safe range gets pulled into it
            // at render time — the bubble never paints a near-black,
            // near-white, or over-bright stripe, and the inline name glyph
            // inherits the same in-range hex.
            const normalizedBotColor =
              msg.role === "assistant" && msg.botColor
                ? normalizeAccentForTheme(msg.botColor, resolvedTheme)
                : null;
            const messageEdge =
              msg.role !== "assistant"
                ? undefined
                : detail?.incognito
                  ? "private"
                  : messageHasCustomBotIdentity(msg)
                    ? "bot"
                    : "prism";
            const messageStyle = normalizedBotColor
              ? ({ "--message-accent": normalizedBotColor } as React.CSSProperties)
              : undefined;
            const userInkStyle =
              msg.role === "user" && threadConversationAccentInk
                ? ({ "--user-msg-tink": threadConversationAccentInk } as React.CSSProperties)
                : undefined;
            const mobileFocusAccentStyle =
              contextFocusedMessageId === msg.id
                ? ({
                    "--message-context-accent": deriveMobileMessageFocusAccent(msg),
                  } as React.CSSProperties)
                : undefined;
            const copied = copiedMessageId === msg.id;
            const mobileContextMenu = viewportWidth <= PICKER_MOBILE_BREAKPOINT;
            return (
              <article
                key={msg.id}
                className={`${styles.message} ${
                  msg.role === "user" ? styles.messageUser : styles.messageAssistant
                }`}
                style={{
                  ...(messageStyle ?? {}),
                  ...userInkStyle,
                  ...mobileFocusAccentStyle,
                }}
                data-model-revealed={modelRevealMessageId === msg.id ? "true" : undefined}
                data-msg-mobile-focus-root={
                  mobileFocusedMessageId === msg.id ? "true" : undefined
                }
                data-msg-context-root={
                  contextFocusedMessageId === msg.id ? "true" : undefined
                }
                data-mobile-context={mobileContextMenu ? "true" : undefined}
                data-message-id={msg.id}
                data-message-edge={messageEdge}
                onContextMenuCapture={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  openMessageContextMenu(msg, event.clientX, event.clientY, {
                    anchor: "center",
                    mobileActivate: mobileContextMenu,
                  });
                }}
                onClick={(event) => {
                  if (!mobileContextMenu) {
                    return;
                  }
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  openMessageContextMenu(msg, rect.left + rect.width * 0.5, rect.bottom + 14, {
                    anchor: "below",
                    mobileActivate: true,
                  });
                }}
              >
                <h4>
                  <span className={styles.messageRoleLabel}>
                    {shouldRenderPrismMessageRoleLabel(msg, detail?.incognito === true) ? (
                      <PrismMessageRoleLabel />
                    ) : msg.role === "assistant" ? (
                      msg.botName?.trim() || DEFAULT_ASSISTANT_NAME
                    ) : (
                      "You"
                    )}
                  </span>
                  {status && (
                    <span
                      className={styles.providerTag}
                      title={
                        modelLabel
                          ? `${STATUS_LABEL[status]} · Model: ${modelLabel}`
                          : STATUS_LABEL[status]
                      }
                    >
                      <span
                        className={`${styles.providerDot} ${
                          status === "human"
                            ? styles.providerDotHuman
                            : status === "online"
                              ? styles.providerDotOnline
                              : styles.providerDotLocal
                        }`}
                        aria-hidden="true"
                      />
                      {modelRevealLabel && (
                        <span className={styles.providerLabel}>{modelRevealLabel}</span>
                      )}
                    </span>
                  )}
                </h4>
                <MessageBody
                  content={msg.content}
                />
                {copied && (
                  <span
                    className={styles.messageCopyToast}
                    role="status"
                    aria-live="polite"
                  >
                    copied
                  </span>
                )}
                {(() => {
                  // Assistant bubbles: one-click "Fork here" (non-destructive
                  // branch into a new conversation). User bubbles get Edit,
                  // which rewinds from that message and sends the revised text.
                  const isUser = msg.role === "user";
                  return (
                    <div
                      className={styles.messageActionsSlot}
                      data-copied={copied ? "true" : undefined}
                      data-model-revealed={modelRevealMessageId === msg.id ? "true" : undefined}
                    >
                      <div className={styles.messageActions}>
                        <button
                          type="button"
                          aria-label="Copy message text"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyMessageToClipboard(msg);
                          }}
                        >
                          {copied ? "copied" : "Copy"}
                        </button>
                        {isUser ? (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                beginEditMessage(msg);
                              }}
                            >
                              Edit
                            </button>
                          </>
                        ) : detail?.incognito ? null : (
                          <>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void forkChat(msg.id);
                              }}
                            >
                              Fork here
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </article>
            );
          })}
          {typingIndicatorNode}
          {/* Scroll sentinel: kept at the very end so the scroll effect can
              always bring the latest content into view. */}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>
          {renderConversationStarterRail()}
        </div>

        <form
          className={styles.compose}
          data-starter-compose-surface="true"
          data-compose-bot-selected={selectedComposeBotAccent ? "true" : undefined}
          data-compose-ready={!composerSubmitDisabled(draft) ? "true" : undefined}
          data-keyboard-lifted={mobileKeyboardInset > 0 ? "true" : undefined}
          style={composeStyle}
          onSubmit={handleComposerSubmit}
          onBlur={handleComposerBlur}
          onKeyDown={handleComposerKeyDown}
        >
          {error && <p className={`${styles.error} ${styles.composeError}`} role="alert">{error}</p>}
          {emptyStateLensVisible && (
            <HueLensControl
              bots={pickerSourceBots}
              filteredBots={filteredBots}
              hueFilterCenter={hueFilterCenter}
              onHueChange={setHueFilterCenter}
              hueLensAvailable={hueLensAvailable}
              trackGradient={hueLensTrackGradient}
              trackSegments={hueLensTrackSegments}
              resolvedTheme={resolvedTheme}
              onInteractionChange={setLensInteracting}
            />
          )}
          <div className={styles.composeTools}>
            {(() => {
              const botHasCommenced = !!detail && detail.messages.length > 0;
              const botDisabled = privateChatActive || !detail;
              return (
                <>
                  {/* Pre-chat (!detail): dropdown is disabled so the tile
                      picker above is the sole bot-arming path. The dropdown
                      still mirrors selectedBotId visually — clicking a tile
                      populates it automatically.
                      Post-chat (detail set): dropdown becomes the mid-thread
                      bot switcher. Consecutive sends reuse whatever bot is
                      currently in selectedBotId; the user explicitly switches
                      by changing this dropdown. */}
                  {bots.length > 0 && (
                    <ComposerBotPicker
                      value={privateChatActive ? "" : selectedBotId ?? ""}
                      onChange={next => setSelectedBotId(next || null)}
                      bots={botHasCommenced ? bots : filteredBots}
                      resolvedTheme={resolvedTheme}
                      disabled={botDisabled}
                      title={
                        privateChatActive
                          ? "Private chats always run as the Default persona."
                          : !detail
                            ? "Pick a bot from the grid above to start the chat. You can swap here between sends once it begins."
                            : undefined
                      }
                      ariaLabel="Bot for the next message"
                      // Same "hide name until a message exists" policy as Chat
                      // mode. The grid picker above is the loud identity
                      // affordance pre-send; the compose rail just reflects the
                      // choice as a tinted glyph. Once a message is in the
                      // thread, the pill becomes a full "[glyph] [name]" pick.
                      showName={botHasCommenced}
                      enableFilters={botHasCommenced}
                      hueFilterCenter={hueFilterCenter}
                      onHueChange={setHueFilterCenter}
                      hueLensAvailable={hueLensAvailable}
                      hueLensTrackGradient={hueLensTrackGradient}
                      hueLensTrackSegments={hueLensTrackSegments}
                    />
                  )}
                </>
              );
            })()}
            {(() => {
              const isLocal = settings?.preferredProvider === "local";
              const providerDisabled = !settings;
              return (
                <div className={`${styles.modeControl} ${providerDisabled ? styles.modeControlLocked : ""}`}>
                  <button
                    type="button"
                    className={`${styles.modeToggleTrack} ${providerDisabled ? styles.modeToggleTrackLocked : ""}`}
                    onClick={() => {
                      if (providerDisabled) return;
                      void switchProvider(isLocal ? "openai" : "local");
                    }}
                    aria-label={
                      isLocal
                        ? "Response mode: Local. Click to switch to Online."
                        : "Response mode: Online. Click to switch to Local."
                    }
                    aria-pressed={!isLocal}
                    aria-disabled={providerDisabled}
                    title={
                      isLocal
                        ? "Switch to Online"
                        : "Switch to Local"
                    }
                    disabled={providerDisabled}
                  >
                    <span
                      className={`${styles.modeThumb} ${
                        isLocal ? styles.modeThumbLocal : styles.modeThumbOnline
                      }`}
                    >
                      <span
                        className={`${styles.providerDot} ${
                          isLocal ? styles.providerDotLocal : styles.providerDotOnline
                        }`}
                        aria-hidden="true"
                      />
                      <span className={styles.modeThumbLabel}>
                        {isLocal ? "LOCAL" : "ONLINE"}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })()}
            {(() => {
              const isLocal = settings?.preferredProvider !== "openai";
              const modelProvider: Provider = isLocal ? "local" : "openai";
              const rawModelChoice = chatModelChoiceByProvider[modelProvider];
              const visibleModelChoice = visibleBotCustomizerModelChoice(
                settings,
                rawModelChoice
              );
              const modelOptions = includeSelectedModelOption(
                availableModelOptionsForProvider(modelCatalog, settings, modelProvider),
                visibleModelChoice,
                modelProvider
              );
              return (
                <>
                  <ComposerModelPicker
                    value={visibleModelChoice}
                    onChange={(nextChoice) => {
                      setChatModelChoiceByProvider((previous) => ({
                        ...previous,
                        [modelProvider]: nextChoice,
                      }));
                    }}
                    options={modelOptions}
                    provider={modelProvider}
                    disabled={!settings || pendingReply}
                    title={`Model for ${isLocal ? "LOCAL" : "ONLINE"} replies`}
                    ariaLabel={`Model for ${isLocal ? "local" : "online"} replies`}
                  />
                  {renderComposeUtilityActions()}
                </>
              );
            })()}
          </div>
          {editingMessageId && (
            <div className={styles.composeEditNotice} role="status">
              <span>Editing message. Save creates a new fork and sends the revised text.</span>
              <button type="button" onClick={cancelEditMessage}>Cancel</button>
            </div>
          )}
          <ComposerInput
            ref={draftComposerRef}
            enabled={composerMarkdownEditorEnabled}
            value={draft}
            placeholder="Ask anything..."
            submitDisabled={composerSubmitDisabled(draft)}
            submitLabel={composerSubmitLabel(draft)}
            hideSubmitButton={hideMobileEmptySend}
            onChange={handleComposerChange}
            onValueChange={updateComposerDraft}
            onFocus={handleComposerFocus}
          />
        </form>
        {renderMessageContextMenu()}
        {renderBotContextMenu()}
      </section>

      {renderSharedPanels()}
      {renderDeleteAllModal()}
      {renderDevToolsPanel()}
      {touchPreview && (
        <TouchPreviewBalloon
          bot={
            touchPreview.botId
              ? bots.find((candidate) => candidate.id === touchPreview.botId) ?? null
              : null
          }
          x={touchPreview.x}
          y={touchPreview.y}
          resolvedTheme={resolvedTheme}
        />
      )}
    </main>
  );
}

export default function Home(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <HomeContent />
    </Suspense>
  );
}
