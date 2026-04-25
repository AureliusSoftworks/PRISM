"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import styles from "./page.module.css";

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

// Namespace bot-delete keys so they can share the same single "armed" state
// slot used for conversation deletion without id collisions.
const BOT_DELETE_KEY_PREFIX = "bot:";

// Bot-list twin of DELETE_ALL_KEY — armed when a press-and-hold crosses the
// threshold on any bot card ×. Kept separate so the confirmation modal can
// tailor its copy and the bulk action routes to the bots endpoint instead
// of conversations. Both all-delete sentinels live in the same
// `pendingDeleteKey` slot, so outside-click / Escape / auto-disarm still
// apply uniformly.
const DELETE_ALL_BOTS_KEY = "__delete_all_bots__";

// Messages whose content exceeds this character count get rendered with a
// collapsible body: a max-height cap + bottom fade + "Show more" toggle.
// Chosen so ~12 lines of typical prose fit comfortably; under it, there is
// no affordance shown and the message renders as before. Tuned alongside
// the `.messageBodyCollapsed` `max-height` in page.module.css — keep them
// roughly in sync (shorter content than the cap would leave the toggle
// dangling below an already-short message).
const MESSAGE_COLLAPSE_THRESHOLD = 600;

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
// through this component so the five letter colors can be shuffled on
// mount, giving each page load (and each independent instance) a fresh
// chromatic identity while keeping the underlying letterforms unchanged.
// Default ordering matches the original SVG so SSR and the client's
// first paint agree; the shuffle fires in a mount-only effect which
// avoids hydration mismatch warnings.

const PRISM_WORDMARK_PALETTE = [
  PRISM_COLORS.p,
  PRISM_COLORS.r,
  PRISM_COLORS.i,
  PRISM_COLORS.s,
  PRISM_COLORS.m,
] as const;

const PRISM_BOT_SEED_HUE_SPREAD_DEG = 28;
const PRISM_BOT_SEED_SATURATION_MIN = 82;
const PRISM_BOT_SEED_SATURATION_MAX = 100;
const PRISM_BOT_SEED_LIGHTNESS_MIN = 38;
const PRISM_BOT_SEED_LIGHTNESS_MAX = 60;

// Fisher-Yates shuffle. Non-mutating: returns a new array so React state
// updates remain referentially clean. Generic so future callers that
// need to shuffle any 5-item palette (or other tuple) can reuse it.
function shufflePalette<T>(source: readonly T[]): T[] {
  const arr = [...source];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface PrismWordmarkProps {
  className?: string;
}

function PrismWordmark({ className }: PrismWordmarkProps): React.JSX.Element {
  // Initial state = canonical P/R/I/S/M ordering so the server-rendered
  // markup and the client's first paint are byte-identical. The shuffle
  // only runs inside useEffect, which React guarantees not to execute
  // during SSR; this means no hydration warning AND each mount produces
  // its own independent random permutation.
  const [colors, setColors] = useState<readonly string[]>(PRISM_WORDMARK_PALETTE);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setColors(shufflePalette(PRISM_WORDMARK_PALETTE));
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  return (
    <svg
      className={className}
      viewBox="0 0 610 72"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Prism"
    >
      {/* Shared stroke geometry lives on the <g>; only the per-letter
          stroke colors vary, which keeps the DOM diff on shuffle minimal
          (only the five `stroke` attributes change, no path rewrites). */}
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
          suppressHydrationWarning
        />
        {/* R — two subpaths grouped so both subpaths inherit the same
            shuffled color from a single <g stroke>. */}
        <g stroke={colors[1]} suppressHydrationWarning>
          <path d="M134,66V6h50c10.67,0,16,5.33,16,16s-5.33,16-16,16h-38" />
          <path d="M162,38l44,28" />
        </g>
        {/* I */}
        <path stroke={colors[2]} d="M282,6v60" suppressHydrationWarning />
        {/* S */}
        <path
          stroke={colors[3]}
          d="M430,6h-48c-10.67,0-16,5.33-16,16,0,8,4,12.67,12,14l52,2c9.33,1.33,14,6,14,14,0,9.33-5.33,14-16,14h-48"
          suppressHydrationWarning
        />
        {/* M — three subpaths (two uprights + the central chevron). */}
        <g stroke={colors[4]} suppressHydrationWarning>
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
  /** True from level 2 onward: remove the tile gradient. */
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

type PickerDensityStageId = 1 | 2 | 3 | 4 | 5 | 6;

interface PickerDensityBreakpoints {
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
const PICKER_MOBILE_LOW_COUNT_MAX_SIZE = 260;
const PICKER_MOBILE_COLUMN_STACK_MAX_HEIGHT = 340;
const PICKER_DESKTOP_LOW_COUNT_MAX_WIDTH = 460;
const PICKER_DESKTOP_MAX_WIDTH = 1280;
const PICKER_DESKTOP_MAX_HEIGHT = 260;
const PICKER_DESKTOP_ASPECT_RATIO = 16 / 9;
const PICKER_MAX_TILE_SIZE = 220;
const PICKER_SINGLE_BOT_TILE_SIZE_MOBILE = 168;
const PICKER_SINGLE_BOT_TILE_SIZE_DESKTOP = 128;
const PICKER_FEW_BOT_TILE_SIZE_MOBILE = 124;
const PICKER_FEW_BOT_TILE_SIZE_DESKTOP = 104;
const PICKER_LOW_COUNT_TILE_SIZE_MOBILE = 72;
const PICKER_LOW_COUNT_TILE_SIZE_DESKTOP = 76;
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
const DESKTOP_SIDEBAR_WIDTH = 280;
const DESKTOP_MESSAGES_PADDING_X = 40;
const MOBILE_MESSAGES_PADDING_X = 28;
const PICKER_SIDE_GUTTER = 48;
const FLAT_TILE_BASE_COUNT = 60;
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
  const flatTileCountMin = pickerStageBreakpoint(
    FLAT_TILE_BASE_COUNT,
    densityWidth,
    isDesktop
  );
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
      targetCount: Math.max(1, breakpoints.flatTileCountMin - 1),
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
  const raw = typeof text === "string" ? text.trim() : "";
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
  pickerHeight: number
): { cols: number; rows: number } {
  if (totalTiles <= 1) return { cols: 1, rows: 1 };
  const aspectRatio = Math.max(1, pickerWidth / Math.max(1, pickerHeight));
  if (aspectRatio > 1.2 && totalTiles <= 4) {
    return { cols: totalTiles, rows: 1 };
  }
  if (totalTiles === 3) {
    return { cols: 2, rows: 2 };
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

function pickerGeometry(
  totalTiles: number,
  viewportWidth: number,
  viewportHeight: number
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
  const leadingFillerCell = totalTiles > 10 && totalTiles % 2 === 1;
  const gridOccupancyCount = totalTiles + (leadingFillerCell ? 1 : 0);
  const { cols, rows } = pickerGridShape(
    gridOccupancyCount,
    pickerWidth,
    pickerHeight
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
    pickerHeight,
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

function randomHex(): string {
  // Seed from five PRISM wordmark hue families, not five exact hexes.
  // This keeps the library constrained to P/R/I/S/M while preserving the
  // subtle spectrum that makes large swatch grids readable.
  const seed =
    PRISM_WORDMARK_PALETTE[
      Math.floor(Math.random() * PRISM_WORDMARK_PALETTE.length)
    ];
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
  dark: "#0a0a0b",
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
// picks (pure blue, deep red) don't disappear against `#0a0a0b` and
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
  dark: "#121214",
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

// Build the inline `--swatch-border` custom property for the color-picker
// swatch button so its border smoothly ramps from the theme's default
// --line stroke to a near-foreground stroke as the swatch fill approaches
// the surface luminance. Returns a `color-mix()` expression that is
// resolved at paint time against whichever theme (light/dark) the shell
// is currently painting — that way the same math covers both directions
// of the "too dark on dark" / "too light on light" problem without
// hard-coding hex tokens.
function swatchBorderStyle(fillHex: string, resolvedTheme: "light" | "dark"): string {
  const surface = THEME_SURFACE_BG[resolvedTheme];
  const ratio = contrastRatio(fillHex, surface);
  // Ramp bounds (WCAG contrast ratio units). Above `start` the border
  // stays at the default --line; below `end` it flips fully to --fg.
  const START = 2.0;
  const END = 1.05;
  const raw = Math.max(0, Math.min(1, (START - ratio) / (START - END)));
  // Quadratic ease-in-out so the visual crossover doesn't pop.
  const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
  const pct = Math.round(eased * 100);
  return `color-mix(in srgb, var(--line) ${100 - pct}%, var(--fg) ${pct}%)`;
}

// Sidebar conversation row border shade compensation. Similar ramp to
// swatchBorderStyle, but emits just a 0..100 integer percent so the
// consumer can apply the blend in CSS (`color-mix(var(--row-color),
// var(--fg) X%)`). Keeping the computation off the CSS side gives us
// control over easing without shipping a bigger CSS expression per row.
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
  // Slightly higher `start` than swatchBorderStyle (2.5 vs 2.0) so
  // mid-band bot colors get a gentle nudge toward --fg too — keeps the
  // border readable over the actual 22% tint rather than the full-
  // saturation swatch case swatchBorderStyle covers.
  const START = 2.5;
  const END = 1.05;
  const raw = Math.max(0, Math.min(1, (START - ratio) / (START - END)));
  const eased = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
  return Math.round(eased * 100);
}

type Provider = "local" | "openai";
type Theme = "dark" | "light" | "system";
type PanelView = null | "settings" | "bots" | "images";
// Which post-auth surface is currently rendered. "hub" is the landing
// screen shown after login; each mode tile navigates to a specific
// experience. The "chat" mode is scaffolded for a follow-up phase; until
// then, its Hub tile stays disabled and stray ?view=chat URLs fall
// through to the Sandbox shell.
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
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  provider?: Provider;
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
interface ConversationDetail {
  id: string;
  title: string;
  /** Bot locked to this conversation at start. Null = grayscale default / no persona. */
  botId: string | null;
  /** Private chat flag — pinned on the conversation row at creation, read here for accent + provider routing. */
  incognito: boolean;
  /** Bot id of the most recent assistant message; null for Default-last OR no-reply-yet. */
  lastBotId: string | null;
  /** Denormalized color of the last-spoken bot; mirrors the list-endpoint field for post-send UI consistency. */
  lastBotColor: string | null;
  /** True when the conversation has at least one assistant reply; see ConversationSummary for disambiguation semantics. */
  hasAssistantReply: boolean;
  messages: Message[];
}
interface UserSettings {
  theme: Theme;
  preferredProvider: Provider;
  providerLocked: boolean;
  autoMemory: boolean;
  hasOpenAiApiKey: boolean;
  ollamaModel: string;
}
interface UserMemory { id: string; confidence: number; text: string; }
interface Bot {
  id: string;
  name: string;
  system_prompt: string;
  model: string | null;
  temperature: number;
  max_tokens: number;
  color: string | null;
  glyph: string | null;
  chat_enabled: number;
}

const BOT_COLOR_SORT_GRAYSCALE_SATURATION_MAX = 6;
const BOT_COLOR_SORT_GRAYSCALE_GROUP = 10;
const BOT_COLOR_SORT_COLORLESS_GROUP = 11;
// Hue lens filter — refracts the visible bot population to a single
// hue band so a 3000-bot grid can collapse back into a selectable
// subset without paginating. The filter is inactive by default
// (`hueFilterCenter === null`); moving the slider activates it.
// The tolerance is measured in the compressed slider's 0..359 coordinate
// space. This keeps filtering fluid across hard-stop track segments:
// adjacent families overlap slightly near segment boundaries instead of
// behaving like discrete pages.
const HUE_LENS_FILTER_TOLERANCE = 42;
const BOT_PICKER_RETURN_ANIMATION_MS = 360;
const BOT_PANEL_DASHBOARD_MIN_BOTS = 1;
const BOT_PANEL_COLOR_HARMONY_MIN_BOTS = 40;
const BOT_PANEL_COLOR_HARMONY_STRENGTH = 0.42;
const BOT_PANEL_COLOR_HARMONY_SATURATION_TARGET = 70;
const BOT_PANEL_COLOR_HARMONY_LIGHTNESS_TARGET_DARK = 44;
const BOT_PANEL_COLOR_HARMONY_LIGHTNESS_TARGET_LIGHT = 46;

function botIsChatEnabled(bot: Bot): boolean {
  return bot.chat_enabled === 1;
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

// Apply the hue lens to a bot list. Inactive filter (`hueCenter === null`)
// returns the input untouched so callers can use the same downstream
// rendering path. When active, only bots within the tolerance band
// survive; uncolored/grayscale bots are dropped because they cannot
// meaningfully sit in a hue band.
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

function filterBotsByHue(bots: Bot[], hueCenter: number | null): Bot[] {
  if (hueCenter === null) return bots;
  return bots.filter((bot) => {
    if (!botHasFilterableColor(bot)) return false;
    const { h } = hexToHsl(bot.color!.trim());
    const lensPosition = hueLensPositionForHue(h);
    return Math.abs(lensPosition - hueCenter) <= HUE_LENS_FILTER_TOLERANCE;
  });
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
function hueLensGradient(segments: readonly HueLensTrackSegment[]): string {
  if (segments.length === 0) {
    return "linear-gradient(to right, transparent 0%, transparent 100%)";
  }
  const stops: string[] = [];
  for (let i = 0; i < segments.length; i += 1) {
    const color = segments[i].color;
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

// Accent color pre-selected in the bot creation picker. Users can change it
// before clicking Create; existing bots with no color just render no accent.
// No static default color anymore. The bot color picker seeds itself with
// a fresh random hex on mount, every time the Bots panel opens, and every
// time a bot is created — so opening the panel always feels generative.
interface ImageRecord { id: string; prompt: string; url: string; created_at: string; }

// Sentinel color used to paint Default-bot sidebar rows. Picking literal
// white means "no hue" — on dark theme the 22% tint reads as a light
// slate panel (a visible "this row is Default" signal), on light theme
// the tint is barely perceptible, which is fine: Default is the absence
// of a brand identity so looking "basically unpainted" is semantically
// correct.
const DEFAULT_ROW_COLOR = "#ffffff";

// Resolve a sidebar conversation row's tint color from the server-side
// denormalized `lastBotColor`, falling through a four-step chain so
// each conversation paints the color of its CURRENT active bot — the
// same signal that drives the composer dropdown and the editor accent.
//
// Order matters:
//   1. Incognito wins — private rows never pick up a hue (grayscale
//      styling comes from the private-row CSS, not from this resolver).
//   2. `lastBotColor` is the server's denormalized color at the time it
//      responded, so it stays correct even if the bot was later deleted
//      or recolored.
//   3. `hasAssistantReply && !lastBotColor` means the last reply came
//      from the Default bot (no bot_id) — paint WHITE to match
//      "Default has no brand color".
//   4. `botId` → live bots[] lookup. Catches the pre-reply window where
//      a conversation has a locked bot but no assistant message yet.
//   5. WHITE fallback: no locked bot and no reply either — a brand-new
//      empty conversation created with Default, or a ghost row from a
//      failed send. Either way "no bot ever" = Default = WHITE.
function resolveRowColor(
  c: ConversationSummary,
  bots: Bot[]
): string | null {
  if (c.incognito) return null;
  if (c.lastBotColor) return c.lastBotColor;
  if (c.hasAssistantReply) return DEFAULT_ROW_COLOR;
  if (c.botId) {
    const live = bots.find((b) => b.id === c.botId)?.color;
    if (live) return live;
  }
  return DEFAULT_ROW_COLOR;
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

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(options?.headers ?? {}) },
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
  paths: React.ReactNode;
}

// Ordered so related concepts cluster together in the picker grid — players
// tend to scan by category (nature, animals, tech, …) rather than alphabetical
// order. Keep additions grouped with their neighbors.
const BOT_GLYPH_ORDER = [
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

type BotGlyphName = (typeof BOT_GLYPH_ORDER)[number];

// The triangle mark belongs to Prism/Default identity; custom bots choose
// from the same registry minus that reserved glyph.
const CUSTOM_BOT_GLYPH_ORDER = BOT_GLYPH_ORDER.filter(
  (key) => key !== "triangle"
);

const BOT_GLYPHS: Record<BotGlyphName, BotGlyphDefinition> = {
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

const DEFAULT_BOT_GLYPH: BotGlyphName = "bot";

function isBotGlyphName(value: string | null | undefined): value is BotGlyphName {
  return typeof value === "string" && value in BOT_GLYPHS;
}

function randomBotGlyph(): BotGlyphName {
  const index = Math.floor(Math.random() * CUSTOM_BOT_GLYPH_ORDER.length);
  return CUSTOM_BOT_GLYPH_ORDER[index] ?? DEFAULT_BOT_GLYPH;
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
}: {
  bot: Bot;
  resolvedTheme: "light" | "dark";
}): React.JSX.Element {
  const style = botAccentStyle(bot.color, resolvedTheme);

  return (
    <span
      className={styles.emptyStateBotGlyph}
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
//   2. `previewBot` set → Prism triangle, but tinted to the hovered bot's
//      normalized color. This keeps hover feeling like Prism is focusing
//      through the bot rather than replacing the hero with the bot profile.
//
//   3. `bot` set → scaled-up sibling of the .botCardGlyph tile in the
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
  resolvedTheme,
}: EmptyStateIconProps): React.JSX.Element {
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
      <img
        src="/icon.jpg"
        alt=""
        aria-hidden="true"
        className={styles.brandIcon}
      />
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
        const isSelected = key === selected;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            className={`${styles.glyphOption} ${isSelected ? styles.glyphOptionSelected : ""}`}
            onClick={() => onChange(key)}
            title={BOT_GLYPHS[key].label}
            aria-label={BOT_GLYPHS[key].label}
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
  /** Whether to render the active visible/total count next to the slider. */
  showCount?: boolean;
  /** Whether the active state can be cleared back to "All". */
  allowClear?: boolean;
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
  showCount = true,
  allowClear = true,
}: HueLensControlProps): React.JSX.Element | null {
  const handleSliderChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onHueChange(
        hueLensFilterCenterForSliderValue(
          Number(event.currentTarget.value),
          trackSegments
        )
      );
    },
    [onHueChange, trackSegments]
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
  const lensStyle = {
    "--lens-track-gradient": trackGradient,
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
              onClick={() => onHueChange(null)}
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
// Single swatch button that doubles as a glyph preview: the button's
// fill is the bot color, the glyph inside inherits a WCAG-readable text
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
   * Active visual theme, resolved upstream so we never have to peek at
   * the DOM. The swatch button's border is compensated against this
   * theme's surface so dark picks in dark mode and light picks in light
   * mode remain visible instead of blending into the panel.
   */
  resolvedTheme: "light" | "dark";
}

// Peak tilt angles (degrees) for the 3D parallax inside the glyph grid.
// Yaw (Y-axis) gets a bit more room than pitch (X-axis) because the grid
// is wider than it is tall — matching the aspect ratio keeps the "looking
// into a box" cue feeling physical. Hoisted to module scope so the
// mousemove callback's useCallback([]) deps stay honest.
const PARALLAX_MAX_TILT_Y = 6;
const PARALLAX_MAX_TILT_X = 4;

// ── Unified "virtual camera" for the glyph shoebox ────────────────────
// One (nx, ny) camera position drives every cue in the stack: the radial
// vignette (darker on the far wall), the rim-light (brighter on the near
// rim — see ::before in the stylesheet), the perspective tilt, and a
// subtle intensity ramp on the vignette. Two drivers write this camera
// — cursor hover (hover-capable devices only) and scroll progress
// (every device, sole driver on touch). See ColorGlyphPicker for the
// two call sites.
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
    const rotY = cx * PARALLAX_MAX_TILT_Y;
    const rotX = -cy * PARALLAX_MAX_TILT_X;
    inner.style.transform = `rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
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
  // Everything the swatch actually paints — fill, text-contrast glyph,
  // and the border compensator — keys off the band-clamped color, not
  // the raw hex. Legacy bots whose stored color drifts outside the
  // picker's current band still render inside it automatically, and the
  // swatch always matches the accent bars and message bubbles the same
  // bot paints elsewhere. The band tightens in dark mode so deep hues
  // don't disappear against the shell (see `accentLightnessBand`).
  const displayColor = normalizeAccentForTheme(color, resolvedTheme);
  const readable = pickReadableText(displayColor);
  const swatchBorder = swatchBorderStyle(displayColor, resolvedTheme);
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

  // Refs for the two anchors of the 3D stage. shell = outermost clip +
  // perspective frame (also the target of the viewport-position camera
  // and mousemove events); parallax = the element whose transform
  // takes the tilt. Both live inside the popover which is mounted
  // lazily, so the refs are null until `open` flips to true.
  const parallaxRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);

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

  const rerollBoth = useCallback(() => {
    onColorChange(randomHex());
    onGlyphChange(randomBotGlyph());
  }, [onColorChange, onGlyphChange]);

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
    onColorChange(computePickedColor(pending.clientX, pending.clientY, rect));
  }, [onColorChange, computePickedColor]);

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
      onColorChange(
        computePickedColor(event.clientX, event.clientY, dragRectRef.current)
      );
    },
    [onColorChange, computePickedColor]
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
        onColorChange(computePickedColor(pending.clientX, pending.clientY, rect));
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
    [onColorChange, computePickedColor]
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
  // the shell, its position becomes the camera: vignette / rim / tilt
  // all track cursor directly.
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
    <div className={styles.colorPickerWrapper} data-color-affordance="true">
      <button
        type="button"
        className={styles.colorSwatchButton}
        style={{
          // `displayColor` is the band-clamped variant of `color`, so
          // the swatch always reads at a usable fill even when the
          // stored bot color drifts outside the picker's current band.
          background: displayColor,
          color: readable,
          // Typed-as-string because React's CSSProperties doesn't know
          // about app custom properties; the value is a color-mix()
          // expression that resolves live against the current theme.
          ["--swatch-border" as string]: swatchBorder,
        } as React.CSSProperties}
        onClick={onToggle}
        onContextMenu={(e) => {
          e.preventDefault();
          rerollBoth();
        }}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Click to pick · right-click: random color + glyph"
      >
        <BotGlyph
          name={glyph}
          size={BOT_GLYPH_PICKER_GLYPH_SIZE}
          strokeWidth={BOT_GLYPH_PICKER_STROKE_WIDTH}
        />
      </button>
      {open && (
        // Popover is a pure picking surface — no reroll affordance lives
        // here. Randomization is exclusively the swatch's right-click,
        // keeping the popover's two jobs (pick color, pick glyph)
        // unambiguous.
        <div
          className={styles.colorGlyphPopover}
          role="dialog"
          aria-label="Bot color and glyph picker"
        >
          <div
            className={styles.colorSquare}
            onPointerDown={handleSquarePointerDown}
            onPointerMove={handleSquarePointerMove}
            onPointerUp={handleSquarePointerUp}
            onPointerCancel={handleSquarePointerCancel}
            role="slider"
            aria-label="Bot color. Horizontal axis: hue; vertical axis: lightness."
            aria-valuetext={color}
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
              · inner (parallaxRef): tilts in 3D on camera updates.
              Cursor hover overrides the position baseline; mouseleave
              eases back to the viewport-placement baseline. */}
          <div
            ref={shellRef}
            className={styles.glyphGridShell}
            // Pipe the band-clamped wheel color down as a local CSS
            // custom property. The glyph grid's hover/selected/focus
            // rules read it to tint both the glyph and the ring in
            // the exact color currently picked on the wheel. Using
            // displayColor (not raw `color`) mirrors clampAccent-
            // Lightness normalization used everywhere else, so the
            // preview never drifts too bright/too dark for either
            // theme — matching the user's "normalized like other
            // accents" requirement.
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
                <BotGlyphPicker value={glyph} onChange={onGlyphChange} />
              </div>
            </div>
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

// ── Message body with collapsible long content ────────────────────────
// Wraps the <p> text so we can cap the rendered height on long messages
// and reveal a "Show more" toggle. Messages under MESSAGE_COLLAPSE_THRESHOLD
// chars bypass the wrapper entirely — no dangling toggle, no mask cost.
// Shared between Chat and Sandbox so the behaviour stays consistent.

interface MessageBodyProps {
  messageId: string;
  content: string;
  expanded: boolean;
  onToggle: (id: string) => void;
}

function MessageBody({ messageId, content, expanded, onToggle }: MessageBodyProps): React.JSX.Element {
  const isLong = content.length > MESSAGE_COLLAPSE_THRESHOLD;
  if (!isLong) {
    return <p>{content}</p>;
  }
  const collapsed = !expanded;
  return (
    <>
      <div className={collapsed ? `${styles.messageBody} ${styles.messageBodyCollapsed}` : styles.messageBody}>
        <p>{content}</p>
      </div>
      <button
        type="button"
        className={styles.messageExpandToggle}
        onClick={() => onToggle(messageId)}
        aria-expanded={expanded}
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </>
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
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [openAiKey, setOpenAiKey] = useState("");
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [pendingReply, setPendingReply] = useState(false);
  // IDs of messages the user has explicitly expanded past the
  // collapse-long-content cap. Kept as a Set so toggling is O(1) and
  // independent of message order. Lives in-memory only — reloading a
  // conversation resets every message to its default (collapsed if long).
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(() => new Set());
  const toggleMessageExpand = useCallback((id: string) => {
    setExpandedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const [panel, setPanel] = useState<PanelView>(null);
  // Drill-in target for the high-count Prism color dashboard. Null at
  // <40 bots OR while the user is on the dashboard root; set to a
  // letter id while they have a specific group expanded.
  const [botPanelGroup, setBotPanelGroup] = useState<PrismGroupId | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [rightMenuOpen, setRightMenuOpen] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
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
  // the FIRST send of a new conversation creates the row with
  // `incognito = 1`. Once the server persists that flag on the conversation
  // row, every subsequent read path derives privacy from detail.incognito
  // and this pending flag is cleared. Never relevant in Sandbox — that
  // surface has no cross-session memory to "hide from" in the first place.
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
  const [newBotName, setNewBotName] = useState(""); const [newBotPrompt, setNewBotPrompt] = useState("");
  // Lazy initializers so the very first render already picks a random seed
  // without re-randomizing on every re-render.
  const [newBotColor, setNewBotColor] = useState<string>(() => randomHex());
  const [newBotGlyph, setNewBotGlyph] = useState<BotGlyphName>(() => randomBotGlyph());
  const [newBotChatEnabled, setNewBotChatEnabled] = useState(false);
  const [colorWheelOpen, setColorWheelOpen] = useState(false);
  // Single-slot "which existing bot is currently loaded into the top form"
  // (null = create mode). The card itself renders a subtle highlight while
  // it's the editing target; the form above hydrates the name / prompt /
  // color / glyph fields from that bot. No inline per-card edit form, no
  // layered bubble affordances — tapping a bot card is the one and only
  // entry point into edit mode, and the × on the card handles delete
  // (mirroring the chat-row two-stage + press-and-hold pattern).
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  // Two-stage delete confirmation. `pendingDeleteKey` holds either a
  // conversation id (sidebar ×), HEADER_DELETE_KEY (header button), or the
  // DELETE_ALL_KEY sentinel (reached by holding any × past the threshold).
  // Only one target can be armed at a time, and it auto-disarms after
  // DELETE_CONFIRM_WINDOW_MS so the ✓ doesn't linger unexpectedly.
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Two-stage resend confirmation on user-message bubbles. Mirrors the
  // pendingDeleteKey pattern but lives in its own slot so the two armed
  // states stay independent (resend isn't destructive, so it shouldn't
  // block delete and vice versa). Auto-disarms on the same window.
  const [pendingResendId, setPendingResendId] = useState<string | null>(null);
  const pendingResendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
  // `newBotName / newBotPrompt / newBotColor / newBotGlyph / chat toggle` against
  // THIS snapshot rather than the raw bot row so legacy bots with no
  // stored color (where we seed the picker with a random hex) don't
  // immediately appear as "dirty". Cleared when edit mode exits.
  const editOriginalRef = useRef<{
    name: string;
    prompt: string;
    color: string;
    glyph: BotGlyphName;
    chatEnabled: boolean;
  } | null>(null);
  const botNameInputRef = useRef<HTMLInputElement | null>(null);
  // Sentinel at the tail of the message stream. The scroll effect brings it
  // into view so the latest message is always visible without manual scrolling.
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("dark");
  // Bot currently being hover-PREVIEWED in the Chat-mode empty-state
  // picker. Desktop-only: set by onPointerEnter with pointerType mouse,
  // cleared when the cursor leaves the picker container or when the
  // user arms a bot by clicking. Drives the transient "white/black
  // monochrome glyph + real-time accent" preview — does NOT represent a
  // armed selection. Null means "no tile under the cursor".
  const [hoveredBotId, setHoveredBotId] = useState<string | null>(null);
  // Dwell timer for the picker's hover preview. Without this, a fast
  // mouse sweep across 50+ tiny tiles would fire 50+ preview state
  // changes back-to-back — the shell accent, hero glyph, title, and
  // hint would all strobe in lockstep. Debouncing the JS-driven preview
  // (but NOT the CSS-driven per-tile magnification, which stays
  // instant) means the preview only commits once the cursor lingers.
  const hoverDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botPickerReturnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const botPickerReturnEndAtRef = useRef(0);
  const lastBotPickerPointerTypeRef = useRef<string | null>(null);
  const emptyStateSearchInputRef = useRef<HTMLInputElement | null>(null);
  const emptyStateSearchRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const emptyStateSearchOpenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOVER_DWELL_MS = 180;
  // Theme preference used before a user has logged in (or when the user
  // explicitly logs out). Seeded from localStorage so the auth screen
  // respects the last choice across refreshes; defaults to "system" so
  // first-time visitors track OS dark/light preference automatically.
  const [preAuthTheme, setPreAuthTheme] = useState<Theme>("system");
  const viewportWidth = useViewportWidth();
  const viewportHeight = useViewportHeight();
  // Shared close helper for the right-hand panels. Also resets panel-specific
  // transient UI so reopening a panel doesn't resurrect stale state.
  const closePanel = useCallback(() => {
    setPanel(null);
    setRightMenuOpen(false);
    setColorWheelOpen(false);
    setEditingBotId(null);
    editOriginalRef.current = null;
    // A stale "Save failed" shouldn't greet the user next time they open
    // the panel. The composer's `error` state is unaffected.
    setPanelError(null);
    // Drop any selected color group so reopening the Bots drawer always
    // starts on the dashboard root rather than a stale drilled-in view.
    setBotPanelGroup(null);
  }, []);

  const openRightPanel = useCallback((nextPanel: Exclude<PanelView, null>) => {
    setPanel(nextPanel);
    setSidebarOpen(false);
    setRightMenuOpen(false);
  }, []);

  useEffect(() => {
    if (panel !== "bots" || !editingBotId) return;
    const input = botNameInputRef.current;
    if (!input) return;
    input.focus({ preventScroll: true });
  }, [panel, editingBotId]);

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
  }, []);

  useEffect(() => {
    if (!rightMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-right-panel-affordance='true']")
      ) {
        return;
      }
      setRightMenuOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setRightMenuOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [rightMenuOpen]);

  // Cancel any pending picker timers if the component tears down mid-preview
  // or mid-return animation (route change, mode switch, logout).
  useEffect(() => {
    return () => {
      if (hoverDwellTimerRef.current) {
        clearTimeout(hoverDwellTimerRef.current);
        hoverDwellTimerRef.current = null;
      }
      if (botPickerReturnTimerRef.current) {
        clearTimeout(botPickerReturnTimerRef.current);
        botPickerReturnTimerRef.current = null;
      }
      botPickerReturnEndAtRef.current = 0;
      if (emptyStateSearchOpenTimerRef.current) {
        clearTimeout(emptyStateSearchOpenTimerRef.current);
        emptyStateSearchOpenTimerRef.current = null;
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

  // Derive the --accent / --accent-text / --accent-ink triad written
  // onto the app shell. The shell accent is ALWAYS bot-driven — there
  // is no app-level "brand accent" that layers on top of the logo's
  // letter palette; the combination of colors a user sees is whatever
  // the active bot is. When no bot is active, we return undefined and
  // the grayscale defaults from the theme block apply.
  //
  // Chat-mode resolution order (checked below):
  //   1. The OPEN conversation's `detail.lastBotId` — the bot who most
  //      recently SPOKE in this chat. Takes top priority so the editor
  //      accent stays in lockstep with the sidebar row tint (which
  //      also keys off lastBotColor). In Chat mode this equals botId
  //      after the first reply (bot is locked at start); in Sandbox
  //      mode this can drift from botId as the user switches bots
  //      per-send, and the editor follows each reply.
  //   2. The OPEN conversation's `detail.botId` — falls back to the
  //      conversation's initially-locked bot for the pre-first-reply
  //      window where lastBotId hasn't been populated yet.
  //   3. The empty-state picker's `selectedBotId` — the committed
  //      pre-chat pick. Once a user clicks a bot, it owns the empty
  //      state until the hero deselects it; hover previews must not
  //      change who a message will be sent to.
  //   4. The empty-state picker's `hoveredBotId` — the mouse-preview
  //      bot, drives the real-time accent shift and the mono hero
  //      glyph only before a bot is committed. Used by BOTH Chat and
  //      Sandbox empty states (Sandbox now mirrors Chat's tile grid
  //      for "start a new chat" parity).
  //   5. Null — falls through to the grayscale default + brand mark.
  //
  // Private chats (`detail.incognito === true`) force the accent OFF by
  // resolving `activeBot` to null regardless of the persisted bot. This
  // is the "B&W only" clause of the private-chat spec — the bot glyph is
  // still available to the empty state via the brand-mark fallback, but
  // no hue ever bleeds into the shell variables.
  //
  // Note for Sandbox: the composer's "next bot to speak" pick
  // (selectedBotId) no longer directly repaints the editor once a
  // conversation is open — that would decouple the editor from its
  // sidebar tile. The preview happens implicitly on send via the
  // optimistic `setDetail` which threads selectedBotId through as
  // `optimisticLastBotId`, so pressing Send still flips the accent
  // before the server reply lands.
  const activeBot = useMemo<Bot | null>(() => {
    const armedFallback = selectedBotId;
    let activeBotId: string | null = null;
    if (view === "sandbox") {
      activeBotId =
        detail?.lastBotId ?? detail?.botId ?? armedFallback ?? hoveredBotId;
    } else if (view === "chat") {
      // Private chats always render grayscale — do NOT resolve the bot
      // color even if one is persisted on the conversation.
      if (detail?.incognito === true) return null;
      if (pendingIncognito) return null;
      activeBotId =
        detail?.lastBotId
        ?? detail?.botId
        ?? armedFallback
        ?? hoveredBotId;
    }
    return bots.find(b => b.id === activeBotId) ?? null;
  }, [
    view,
    bots,
    selectedBotId,
    hoveredBotId,
    detail,
    detail?.botId,
    detail?.lastBotId,
    detail?.incognito,
    pendingIncognito,
  ]);

  const shellStyle = useMemo<React.CSSProperties | undefined>(() => {
    const raw = activeBot?.color?.trim();
    if (!raw) return undefined;
    return deriveAccentStyle(
      normalizeAccentForTheme(raw, resolvedTheme),
      resolvedTheme
    );
  }, [activeBot, resolvedTheme]);

  const selectedComposeBotAccent = useMemo<string | null>(() => {
    const raw = selectedBotId
      ? bots.find((bot) => bot.id === selectedBotId)?.color?.trim()
      : null;
    return raw ? normalizeAccentForTheme(raw, resolvedTheme) : null;
  }, [bots, resolvedTheme, selectedBotId]);

  const composeStyle = selectedComposeBotAccent
    ? ({ "--compose-bot-color": selectedComposeBotAccent } as React.CSSProperties)
    : undefined;

  // Bot that "owns" the currently-open Chat-mode conversation — used to
  // render the in-stream intro (glyph + name + description) that sits
  // above the first message and scrolls out naturally as messages pile
  // up. Prefer the live bot row (gives us system_prompt for the
  // description preview), and fall back to whatever bot metadata the
  // first assistant message was joined with so deleted bots still show
  // a usable intro instead of a ghost row.
  const conversationBot = useMemo<Bot | null>(() => {
    if (view !== "chat") return null;
    if (!detail?.botId) return null;
    if (detail.incognito) return null;
    const live = bots.find(b => b.id === detail.botId);
    if (live) return live;
    const firstAssistant = detail.messages.find(
      m => m.role === "assistant" && (m.botName || m.botColor || m.botGlyph)
    );
    if (!firstAssistant?.botName) return null;
    return {
      id: detail.botId,
      name: firstAssistant.botName,
      system_prompt: "",
      model: null,
      temperature: 0,
      max_tokens: 0,
      chat_enabled: 1,
      color: firstAssistant.botColor ?? null,
      glyph: firstAssistant.botGlyph ?? null,
    };
  }, [view, detail?.botId, detail?.incognito, detail?.messages, bots]);

  // The sidebar is a place to leave the current chat, not mirror it.
  // Keep the active conversation persisted in `conversations`, but hide
  // its row until the user starts another chat or opens a different one.
  const visibleConversations = useMemo(
    () => conversations.filter(c => c.id !== selectedId),
    [conversations, selectedId]
  );

  const panelColorHarmonyActive = bots.length >= BOT_PANEL_COLOR_HARMONY_MIN_BOTS;
  const sortedPanelBots = useMemo(
    () => [...bots].sort((a, b) => (
      compareBotsByColor(a, b, resolvedTheme, panelColorHarmonyActive)
    )),
    [bots, resolvedTheme, panelColorHarmonyActive]
  );
  const chatAvailableBots = useMemo(
    () => bots.filter(botIsChatEnabled),
    [bots]
  );
  const pickerSourceBots = view === "chat" ? chatAvailableBots : bots;

  // Hue lens filters the large empty-state picker before a thread begins.
  // Once a chat has messages, the composer popout receives the raw bot
  // list and treats the hue value as a scroll/focus target instead, so
  // other colors remain visible.
  const normalizedEmptyStateBotNameFilter =
    emptyStateBotNameFilter.trim().toLocaleLowerCase();
  const filteredBots = useMemo(
    () => {
      const hueFilteredBots = filterBotsByHue(pickerSourceBots, hueFilterCenter);
      if (normalizedEmptyStateBotNameFilter.length === 0) {
        return hueFilteredBots;
      }
      return hueFilteredBots.filter((bot) =>
        bot.name.toLocaleLowerCase().includes(normalizedEmptyStateBotNameFilter)
      );
    },
    [pickerSourceBots, hueFilterCenter, normalizedEmptyStateBotNameFilter]
  );
  const emptyStateSearchActive =
    emptyStateSearchOpen || normalizedEmptyStateBotNameFilter.length > 0;
  const emptyStateTypingSearchAvailable =
    pickerSourceBots.length > 0 &&
    (!detail || detail.messages.length === 0) &&
    (view === "sandbox" || (view === "chat" && !pendingIncognito));
  const hueLensTrackSegments = useMemo(
    () => computeHueLensTrackSegments(pickerSourceBots),
    [pickerSourceBots]
  );
  // A single color category has nothing useful to filter between, even
  // when several bots sit inside that category. Hide the lens until at
  // least two PRISM families are represented.
  const hueLensAvailable = hueLensTrackSegments.length > 1;
  const hueFilterActive = hueFilterCenter !== null;
  const hueLensTrackGradient = useMemo(
    () => hueLensGradient(hueLensTrackSegments),
    [hueLensTrackSegments]
  );

  useEffect(() => {
    if (!hueLensAvailable && hueFilterCenter !== null) {
      setHueFilterCenter(null);
    }
  }, [hueLensAvailable, hueFilterCenter]);

  useEffect(() => {
    if (view !== "chat") return;
    const enabledIds = new Set(chatAvailableBots.map((bot) => bot.id));
    if (!detail && selectedBotId && !enabledIds.has(selectedBotId)) {
      setSelectedBotId(null);
    }
    if (!detail && hoveredBotId && !enabledIds.has(hoveredBotId)) {
      setHoveredBotId(null);
    }
    if (chatBotOverride && !enabledIds.has(chatBotOverride)) {
      setChatBotOverride(undefined);
    }
  }, [view, detail, selectedBotId, hoveredBotId, chatBotOverride, chatAvailableBots]);

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

  // Always five tiles, mirroring the wordmark. No conditional sixth
  // bucket — randomHex() guarantees new bots fall into one of the
  // five, and legacy grayscale bots classify by hue.
  const botGroupOrder = useMemo<readonly PrismGroupDef[]>(() => PRISM_GROUPS, []);

  // PRISM categories are the default collapsed browsing surface for the
  // Bots drawer. Color harmony still waits for high-count libraries, but
  // the category dashboard itself appears as soon as the user has bots.
  const botPanelDashboardActive = bots.length >= BOT_PANEL_DASHBOARD_MIN_BOTS;

  // Drill-in safety: if the active group disappears (count dropped
  // below threshold OR the only bot in that group was deleted), bounce
  // the user back to the dashboard root instead of leaving them on a
  // ghost view.
  useEffect(() => {
    if (!botPanelDashboardActive) {
      if (botPanelGroup !== null) setBotPanelGroup(null);
      return;
    }
    if (botPanelGroup && botGroupBuckets[botPanelGroup].length === 0) {
      setBotPanelGroup(null);
    }
  }, [botPanelDashboardActive, botPanelGroup, botGroupBuckets]);

  const visibleBotPanelBots = useMemo<readonly Bot[]>(() => {
    if (!botPanelDashboardActive) return sortedPanelBots;
    if (!botPanelGroup) return [];
    return botGroupBuckets[botPanelGroup];
  }, [botPanelDashboardActive, botPanelGroup, botGroupBuckets, sortedPanelBots]);

  const activeBotPanelGroup = botPanelGroup
    ? PRISM_GROUPS.find(g => g.id === botPanelGroup) ?? null
    : null;

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
    void bootstrap();
  }, [bootstrap]);
  useEffect(() => { if (!user) return; void refreshAll(); }, [user]);

  // Keep the latest message pinned to the bottom of the stream. Fires when:
  //   - a new conversation is loaded (detail?.id change)
  //   - a message is added, optimistically or from the server (length change)
  //   - the typing indicator toggles on/off (pendingReply change)
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [detail?.id, detail?.messages.length, pendingReply]);

  // Drop any pending mid-thread bot override whenever the open
  // conversation changes OR the post-auth surface flips. Without this,
  // a user who half-picked "try Bot B" in Chat, clicked New Chat, and
  // came back would see their stale pending pick linger on the
  // replacement thread — the opposite of "the override is tied to THIS
  // chat". `view` is in the dep list so switching to Sandbox/Hub also
  // clears it; the state has no meaning outside Chat.
  useEffect(() => {
    setChatBotOverride(undefined);
  }, [selectedId, view]);

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
    setHoveredBotId(null);
    if (hoverDwellTimerRef.current) {
      clearTimeout(hoverDwellTimerRef.current);
      hoverDwellTimerRef.current = null;
    }
    setError(null);
  }, [view]);

  async function refreshAll() { await Promise.all([refreshConversations(), refreshSettings(), refreshMemories(), refreshBots(), refreshImages()]); }
  async function refreshConversations() { const d = await api<{ conversations: ConversationSummary[] }>("/api/conversations"); setConversations(d.conversations); }
  async function refreshConversation(id: string): Promise<void> {
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
  }
  async function refreshSettings() { const d = await api<{ settings: UserSettings }>("/api/settings"); setSettings(d.settings); }
  async function refreshMemories() { const d = await api<{ memories: UserMemory[] }>("/api/memories"); setMemories(d.memories); }
  async function refreshBots() { const d = await api<{ bots: Bot[] }>("/api/bots"); setBots(d.bots); }
  async function refreshImages() { const d = await api<{ images: ImageRecord[] }>("/api/images"); setImages(d.images); }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      if (authMode === "register") await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, displayName, theme: preAuthTheme }) });
      else await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await bootstrap(); setPassword("");
    } catch (err) { setError(err instanceof Error ? err.message : "Auth failed."); }
    finally { setBusy(false); }
  }

  async function logout() {
    await api("/api/auth/logout", { method: "POST", body: "{}" });
    setUser(null);
    setConversations([]);
    setDetail(null);
    setMemories([]);
    setSettings(null);
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
      setBots([]);
      setImages([]);
      window.location.href = "/?mode=register";
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Account deletion failed.");
    } finally {
      setBusy(false);
    }
  }

  // Single source of truth for /api/chat request bodies. Both the normal
  // compose send and the user-bubble Resend flow funnel through this so
  // whatever bot / provider / incognito is live RIGHT NOW — not at the
  // moment the message was originally sent — is what the server sees.
  // That's the whole point of "play with bot settings and rerun".
  //
  // Mode semantics (kept aligned with the server-side contract):
  //   - Chat: bot + privacy are CONVERSATION-LEVEL settings chosen at
  //     chat start. For an existing conversation, both fields are read
  //     from `detail` (the server owns them). For a brand-new chat
  //     (`detail === null`), the bot comes from the empty-state picker
  //     via `selectedBotId` and the privacy flag comes from
  //     `pendingIncognito` (flipped on by the sidebar "Private chat"
  //     button). Once the first send resolves, the server's returned
  //     detail supersedes these pending values and the pending flag is
  //     cleared in sendMessage.
  //   - Sandbox: bot picker in the composer remains the source; cross-
  //     session memory is disabled server-side anyway, so the
  //     `incognito` flag is never sent from here.
  function buildChatRequestBody(message: string): Record<string, unknown> {
    const isChatMode = view === "chat";
    const mode: "chat" | "sandbox" = isChatMode ? "chat" : "sandbox";
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
    // Resolve effective privacy: prefer the persisted flag, then the
    // pending intent for a brand-new chat.
    const chatIncognito =
      isChatMode && (detail?.incognito === true || pendingIncognito);
    const providerForSend = chatIncognito
      ? "local"
      : settings?.preferredProvider;
    return {
      conversationId: selectedId ?? undefined,
      message,
      mode,
      // Chat mode ALWAYS sends botId (string or null) so the server can
      // persist mid-thread switches. Sandbox keeps the legacy "undefined
      // drops the key" behavior since its bot picks never write back to
      // conversations.bot_id.
      botId: isChatMode ? chatBotId : (selectedBotId ?? undefined),
      ...(isChatMode ? { incognito: chatIncognito } : {}),
      preferredProvider: providerForSend,
    };
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || pendingReply) return;
    setHoveredBotId(null);
    setPendingReply(true);
    setError(null);

    const previousDetail = detail;
    const previousPendingIncognito = pendingIncognito;
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
    const optimisticBotId =
      detail?.botId ?? (view === "chat" ? selectedBotId ?? null : null);
    const optimisticIncognito =
      detail?.incognito === true || (view === "chat" && pendingIncognito);
    // For lastBot*, keep whatever the current detail had. Our optimistic
    // update adds a USER message, not an assistant one, so "last bot to
    // speak" hasn't changed — the real update lands when the server's
    // assistant reply comes back. In Sandbox where the user can switch
    // bots per-send, we preview the new pick via the "about to speak"
    // selectedBotId so the sidebar row hints at the next color before
    // the reply lands; the server value overrides on response.
    const optimisticLastBotId =
      detail?.lastBotId ?? (view === "sandbox" ? selectedBotId ?? null : optimisticBotId);
    const optimisticLastBotColor =
      detail?.lastBotColor
      ?? (optimisticLastBotId
            ? bots.find(b => b.id === optimisticLastBotId)?.color ?? null
            : null);
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
    setDraft("");

    try {
      const d = await api<{ conversation: ConversationDetail }>("/api/chat", {
        method: "POST",
        body: JSON.stringify(buildChatRequestBody(trimmed)),
      });
      setDetail(d.conversation);
      setSelectedId(d.conversation.id);
      // Pending chat-level flag has now been persisted on the conversation
      // row by the server; the next read derives privacy from detail.
      if (pendingIncognito) setPendingIncognito(false);
      // Server truth now reflects the user's pick, so the mid-thread
      // override is redundant — drop it so the dropdown goes back to
      // mirroring detail.botId cleanly. Only fires when an override was
      // actually set (keeps the state update a no-op in the common case).
      if (chatBotOverride !== undefined) setChatBotOverride(undefined);
      await refreshConversations();
      await refreshMemories();
    } catch (err) {
      setDetail(previousDetail);
      setPendingIncognito(previousPendingIncognito);
      setDraft(trimmed);
      setError(
        err instanceof Error
          ? err.message
          : "Send failed. Verify the provider is reachable and try again."
      );
    } finally {
      setPendingReply(false);
    }
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
      await refreshSettings();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function switchProvider(provider: Provider) {
    if (!settings || settings.providerLocked || settings.preferredProvider === provider) return;
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

  async function toggleProviderLock() {
    if (!settings) return;
    const previous = settings;
    const nextLocked = !settings.providerLocked;
    setSettings({ ...settings, providerLocked: nextLocked });
    setError(null);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ providerLocked: nextLocked }),
      });
      await refreshSettings();
    } catch (err) {
      setSettings(previous);
      setError(err instanceof Error ? err.message : "Mode lock failed.");
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

  async function deleteMemory(id: string) { await api(`/api/memories/${id}`, { method: "DELETE" }); await refreshMemories(); }

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

  // Rewind this conversation to just before `msg`, then resubmit its
  // original text through the normal /api/chat pipeline so whatever bot
  // / provider / incognito setting is live right now is what runs — a
  // Cursor-style "mid-conversation revert with different settings".
  //
  // Flow:
  //   1. Optimistically truncate the visible messages at `msg` so the
  //      UI snaps to the rewound state instantly (no awkward gap while
  //      the network round-trip runs).
  //   2. POST /api/conversations/:id/rewind — atomically deletes the
  //      target user message + everything newer + any thread-scoped
  //      memory_summaries on the same cutoff. Returns the original
  //      text so we don't have to stash it locally.
  //   3. POST /api/chat with that text via buildChatRequestBody — the
  //      server inserts a fresh user row, generates a fresh assistant
  //      reply, and we hydrate `detail` from the response.
  //   4. On any failure, restore the prior `detail` so the user still
  //      sees their history (the server's transaction rolls back too
  //      if step 2 threw).
  async function resendFromMessage(msg: Message): Promise<void> {
    disarmResend();
    if (!selectedId) return;
    if (pendingReply) return;

    const previousDetail = detail;
    if (!previousDetail) return;

    const cutoffIdx = previousDetail.messages.findIndex(m => m.id === msg.id);
    if (cutoffIdx < 0) return;

    setPendingReply(true);
    setError(null);
    setDetail({
      ...previousDetail,
      messages: previousDetail.messages.slice(0, cutoffIdx),
    });

    try {
      const rewind = await api<{ ok: true; message: string }>(
        `/api/conversations/${selectedId}/rewind`,
        {
          method: "POST",
          body: JSON.stringify({ messageId: msg.id }),
        }
      );
      const d = await api<{ conversation: ConversationDetail }>("/api/chat", {
        method: "POST",
        body: JSON.stringify(buildChatRequestBody(rewind.message)),
      });
      setDetail(d.conversation);
      await refreshConversations();
      await refreshMemories();
    } catch (err) {
      setDetail(previousDetail);
      setError(
        err instanceof Error
          ? err.message
          : "Resend failed. Verify the provider is reachable and try again."
      );
    } finally {
      setPendingReply(false);
    }
  }

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
    setHoveredBotId(null);
    if (hoverDwellTimerRef.current) {
      clearTimeout(hoverDwellTimerRef.current);
      hoverDwellTimerRef.current = null;
    }
    if (hueFilterCenter !== null) {
      startBotPickerReturnToAll();
    } else {
      setHueFilterCenter(null);
    }
  }, [cancelPendingEmptyStateSearchOpen, hueFilterCenter, startBotPickerReturnToAll]);

  const openEmptyStateBotSearch = useCallback(() => {
    cancelPendingEmptyStateSearchOpen();
    setSelectedBotId(null);
    setHoveredBotId(null);
    if (hoverDwellTimerRef.current) {
      clearTimeout(hoverDwellTimerRef.current);
      hoverDwellTimerRef.current = null;
    }
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

  const focusDraftInput = useCallback(() => {
    setHoveredBotId(null);
    window.setTimeout(() => {
      draftInputRef.current?.focus({ preventScroll: true });
    }, 0);
  }, []);

  const closeEmptyStateBotSearchAndFocusDraft = useCallback(() => {
    closeEmptyStateBotSearch();
    focusDraftInput();
  }, [closeEmptyStateBotSearch, focusDraftInput]);

  const commitEmptyStateBotSelection = useCallback((botId: string) => {
    cancelPendingEmptyStateSearchOpen();
    const bot = bots.find((candidate) => candidate.id === botId);
    if (emptyStateSearchActive && bot && botHasFilterableColor(bot)) {
      const { h } = hexToHsl(bot.color!.trim());
      setHueFilterCenter(hueLensPositionForHue(h));
    }
    setSelectedBotId(botId);
    setHoveredBotId(null);
    setEmptyStateSearchOpen(false);
    setEmptyStateBotNameFilter("");
    focusDraftInput();
  }, [bots, cancelPendingEmptyStateSearchOpen, emptyStateSearchActive, focusDraftInput]);

  const openEmptyStateBotSearchFromTyping = useCallback((typedCharacter: string) => {
    cancelPendingEmptyStateSearchOpen();
    setSelectedBotId(null);
    setHoveredBotId(null);
    if (hoverDwellTimerRef.current) {
      clearTimeout(hoverDwellTimerRef.current);
      hoverDwellTimerRef.current = null;
    }
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

  // Touch keyboard-balloon handlers. Shared by both the Chat-mode and
  // Sandbox-mode empty-state picker frames. Active only when the gesture
  // is genuine touch input AND the picker is at a high-density stage
  // (`hideGlyphByDefault` true, i.e. stage 4 onward) where the glyph
  // would normally be hidden and the user can't identify a tile by sight
  // anymore. Below that stage the existing per-tile onClick path handles
  // selection unchanged.
  const handleTouchPickerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>, geom: PickerGeometry) => {
      if (event.pointerType !== "touch") return;
      if (!geom.hideGlyphByDefault) return;
      // Capture so subsequent move/up events route here even if the
      // finger drifts off this element. Without capture, the user's
      // finger crossing into a child tile would lose the gesture.
      event.currentTarget.setPointerCapture(event.pointerId);
      touchPreviewPointerIdRef.current = event.pointerId;
      const botId = findBotIdAtPoint(event.clientX, event.clientY);
      setTouchPreview({ botId, x: event.clientX, y: event.clientY });
      if (botId) {
        setHoveredBotId(botId);
      }
    },
    []
  );

  const handleTouchPickerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== touchPreviewPointerIdRef.current) return;
      const botId = findBotIdAtPoint(event.clientX, event.clientY);
      setTouchPreview({ botId, x: event.clientX, y: event.clientY });
      setHoveredBotId(botId);
    },
    []
  );

  const handleTouchPickerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== touchPreviewPointerIdRef.current) return;
      const botId = findBotIdAtPoint(event.clientX, event.clientY);
      if (botId) {
        commitEmptyStateBotSelection(botId);
      } else {
        // Released over a gap or off the picker — clear hover preview
        // so the hero/title don't keep showing the last touched bot.
        setHoveredBotId(null);
      }
      setTouchPreview(null);
      touchPreviewPointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [commitEmptyStateBotSelection]
  );

  const handleTouchPickerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerId !== touchPreviewPointerIdRef.current) return;
      setTouchPreview(null);
      setHoveredBotId(null);
      touchPreviewPointerIdRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    []
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

  // ── Two-stage resend (user-message bubbles) ───────────────────────────
  // First click arms the target; a second click within
  // DELETE_CONFIRM_WINDOW_MS fires the actual rewind+resend. Kept
  // independent of armDelete so having a chat armed for deletion
  // doesn't swallow a resend click on an unrelated bubble and vice
  // versa — the "one armed affordance at a time" rule in the plan
  // applies inside each family, not across them.
  const disarmResend = useCallback(() => {
    if (pendingResendTimerRef.current) {
      clearTimeout(pendingResendTimerRef.current);
      pendingResendTimerRef.current = null;
    }
    setPendingResendId(null);
  }, []);

  const armResend = useCallback((messageId: string) => {
    if (pendingResendTimerRef.current) {
      clearTimeout(pendingResendTimerRef.current);
      pendingResendTimerRef.current = null;
    }
    setPendingResendId(messageId);
    pendingResendTimerRef.current = setTimeout(() => {
      setPendingResendId(null);
      pendingResendTimerRef.current = null;
    }, DELETE_CONFIRM_WINDOW_MS);
  }, []);

  useEffect(() => () => {
    if (pendingResendTimerRef.current) {
      clearTimeout(pendingResendTimerRef.current);
    }
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

  // Clicking anywhere outside the delete / confirm affordance should disarm it.
  // This prevents the confirm pill from lingering in an awkward in-between
  // state after focus moves elsewhere in the sidebar.
  useEffect(() => {
    if (!pendingDeleteKey) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
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

  // Mirror the outside-click / Escape dismissal for the armed resend
  // pill. Scoped by `[data-resend-affordance='true']` so clicks that
  // hop between the armed bubble and the same bubble's action row stay
  // "inside" and don't collapse the Confirm pill out from under the user.
  useEffect(() => {
    if (!pendingResendId) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-resend-affordance='true']")) {
        return;
      }
      disarmResend();
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        disarmResend();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [pendingResendId, disarmResend]);

  // In create mode, each Bots-panel open gets a fresh color/glyph seed
  // and returns the Chat availability toggle to its default-off state.
  // When a deep link opens the panel directly into edit mode, preserve the
  // selected bot's saved values so the random create seed cannot overwrite
  // the customizer fields.
  useEffect(() => {
    if (panel !== "bots" || editingBotId) return;
    setNewBotColor(randomHex());
    setNewBotGlyph(randomBotGlyph());
    setNewBotChatEnabled(false);
  }, [panel, editingBotId]);

  // Close the color/glyph popover on any outside click or Escape. Only
  // one picker ever lives on screen (the top form in the Bots panel), so
  // a single `colorWheelOpen` flag is enough — no per-bot variant needed.
  useEffect(() => {
    if (!colorWheelOpen) return;
    function handlePointerDown(event: PointerEvent) {
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

  // Reset the top form back to "create" mode with a fresh random
  // color/glyph seed. Called after a successful create, after a
  // successful save, and when the user cancels an in-progress edit.
  const resetBotForm = useCallback(() => {
    setNewBotName("");
    setNewBotPrompt("");
    setNewBotColor(randomHex());
    setNewBotGlyph(randomBotGlyph());
    setNewBotChatEnabled(false);
    setColorWheelOpen(false);
    // Drop any stashed edit-mode snapshot so the next edit compares
    // against the correct starting state. Safe to always clear here:
    // the only places that hold a snapshot are paths that also call
    // resetBotForm on exit.
    editOriginalRef.current = null;
  }, []);

  async function createBot() {
    setPanelError(null);
    try {
      await api("/api/bots", {
        method: "POST",
        body: JSON.stringify({
          name: newBotName,
          systemPrompt: newBotPrompt,
          color: newBotColor,
          glyph: newBotGlyph,
          chatEnabled: newBotChatEnabled,
        }),
      });
      resetBotForm();
      await refreshBots();
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Create bot failed.");
    }
  }

  async function deleteBot(id: string) {
    setPanelError(null);
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

  // User-facing bulk wipe reached via press-and-hold on any bot card ×.
  // Mirrors `deleteAllConversations` exactly: optimistic clear, best-effort
  // server sync, snapshot rollback on failure. This belongs to the normal
  // panel UX and surfaces errors inside `panelError` so they render beside
  // the bot list.
  async function deleteAllBots() {
    setPanelError(null);
    disarmDelete();
    const previousBots = bots;
    const previousSelectedBotId = selectedBotId;
    // Nothing to clear — short-circuit rather than fire a no-op request.
    // Tapping into the empty state via hold-from-nothing is unreachable in
    // practice, but the guard keeps the function safe to call from any
    // future entry point.
    if (previousBots.length === 0) return;
    // Bail out of any in-progress edit so the form doesn't keep pointing at
    // a row that's about to vanish. resetBotForm reseeds the color/glyph
    // so the reopened form still feels generative.
    setEditingBotId(null);
    resetBotForm();
    setBots([]);
    setSelectedBotId(null);
    try {
      await api("/api/bots", { method: "DELETE" });
      await refreshBots();
    } catch (err) {
      setBots(previousBots);
      setSelectedBotId(previousSelectedBotId);
      setPanelError(err instanceof Error ? err.message : "Delete all bots failed.");
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
    setColorWheelOpen(false);
    const seededName = bot.name;
    const seededPrompt = bot.system_prompt ?? "";
    const seededColor = bot.color?.trim() || randomHex();
    const seededGlyph: BotGlyphName = isBotGlyphName(bot.glyph)
      ? bot.glyph
      : DEFAULT_BOT_GLYPH;
    const seededChatEnabled = botIsChatEnabled(bot);
    setNewBotName(seededName);
    setNewBotPrompt(seededPrompt);
    setNewBotColor(seededColor);
    setNewBotGlyph(seededGlyph);
    setNewBotChatEnabled(seededChatEnabled);
    setEditingBotId(bot.id);
    editOriginalRef.current = {
      name: seededName,
      prompt: seededPrompt,
      color: seededColor,
      glyph: seededGlyph,
      chatEnabled: seededChatEnabled,
    };
    setPanelError(null);
  }

  function openActiveBotCustomizer() {
    if (!activeBot) return;
    setBotPanelGroup(null);
    startEditBot(activeBot);
    openRightPanel("bots");
  }

  async function saveBot(id: string) {
    const trimmedName = newBotName.trim();
    if (!trimmedName) return;
    setBusy(true);
    setPanelError(null);
    try {
      await api(`/api/bots/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmedName,
          systemPrompt: newBotPrompt,
          color: newBotColor,
          glyph: newBotGlyph,
          chatEnabled: newBotChatEnabled,
        }),
      });
      setEditingBotId(null);
      resetBotForm();
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

  // ── Auth screen ──
  if (!user) return (
    <main className={`${styles.authLayout} ${themeClass}`}>
      <div className={styles.card}>
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
            <img
              src="/icon.jpg"
              alt=""
              aria-hidden="true"
              className={styles.brandIcon}
            />
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
            title={
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
    const isHolding = holdingKey === c.id;
    const armedAll = pendingDeleteKey === DELETE_ALL_KEY;

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
        data-holding={isHolding ? "true" : undefined}
        aria-label={
          isArmedSingle
            ? `Confirm delete ${c.title}`
            : "Delete chat — click to remove this chat, or press and hold to clear all chats"
        }
        title={isArmedSingle ? undefined : "Delete chat · hold for all"}
        onPointerDown={(e) => {
          // Only start a hold for primary-button presses; right-click
          // (contextmenu) shouldn't begin the gesture.
          if (e.button !== 0) return;
          // Pointer capture guarantees we still get pointerup/pointercancel
          // even if the user drags off the button mid-hold — without it,
          // a finger sliding off a touch target leaves the timer orphaned.
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // Some headless / jsdom environments don't implement pointer
            // capture; we silently fall back to the timer-only path.
          }
          startHoldDelete(c.id);
        }}
        onPointerUp={cancelHoldDelete}
        onPointerCancel={cancelHoldDelete}
        onClick={(e) => {
          e.stopPropagation();
          // A completed hold just armed delete-all; swallow the trailing
          // click so it doesn't also arm the single-chat confirm on
          // this same button.
          if (holdCompletedRef.current) {
            holdCompletedRef.current = false;
            return;
          }
          // Delete-all modal is live — the ×'s are visually present but
          // behind the backdrop. Treat clicks as no-ops (the modal's own
          // Cancel / backdrop / Esc handle dismissal).
          if (armedAll) return;
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

  // ── Delete-all confirmation modal ─────────────────────────────────────
  // Rendered whenever `pendingDeleteKey === DELETE_ALL_KEY`, i.e. the
  // moment a 900 ms hold on any × / Delete button crosses the threshold.
  // The modal is the definitive commit surface for the delete-all action
  // — the button under the user's finger never "becomes" the confirm pill
  // in this flow, because at-scale deletion deserves a dedicated
  // alertdialog with a real Cancel + a real Delete-all button.
  //
  // Focus: the Cancel button is auto-focused on mount (safer default;
  // Enter confirms it). On dismiss, the effect at `isDeleteAllActive`
  // restores focus to the element that opened the modal.
  //
  // Escape: handled globally in the same effect, so any focus target
  // (including the jiggling ×'s behind the backdrop) can cancel.
  const renderDeleteAllModal = () => {
    const isChats = pendingDeleteKey === DELETE_ALL_KEY;
    const isBots = pendingDeleteKey === DELETE_ALL_BOTS_KEY;
    if (!isChats && !isBots) return null;
    // One component, two modes. The chat hold (sidebar × / header Delete)
    // targets conversations; the bot hold (bot card ×) targets bots. We
    // derive every user-visible string + the confirm action from the
    // armed key so both contexts share every a11y / focus / dismissal
    // affordance without forking the JSX.
    const count = isChats ? conversations.length : bots.length;
    const noun = isChats
      ? count === 1 ? "conversation" : "conversations"
      : count === 1 ? "bot" : "bots";
    const title = isChats ? "Delete all chats?" : "Delete all bots?";
    const body = isChats
      ? count === 1
        ? "This will permanently remove your only conversation."
        : `This will permanently remove all ${count} conversations.`
      : count === 1
        ? "This will permanently remove your only bot."
        : `This will permanently remove all ${count} bots.`;
    // What stays behind after the wipe — different trailing copy because
    // the two scopes have different "untouched" surfaces.
    const coda = isChats
      ? " Images and memories stay."
      : " Chats using these bots stay (they fall back to Default).";
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

  // ── Header Delete button ─────────────────────────────────────────────
  // Same hold-gesture contract as the sidebar × buttons (press-and-hold
  // for 900 ms to arm a global delete-all), expressed on a text pill
  // rather than a glyph. The button ITSELF only carries the
  // "Delete" → "✓ Confirm" text swap for the single-chat flow; during a
  // hold it glows (via `data-holding`), and once the threshold crosses
  // it joins the sidebar ×'s in the iOS jiggle (via `data-shaking`)
  // while the modal takes over the actual decision.
  const renderHeaderDeleteButton = (currentChatId: string) => {
    const isArmedSingle = pendingDeleteKey === HEADER_DELETE_KEY;
    const isHolding = holdingKey === HEADER_DELETE_KEY;
    const armedAll = pendingDeleteKey === DELETE_ALL_KEY;

    return (
      <button
        type="button"
        className={isArmedSingle ? styles.headerDeleteArmed : styles.headerDelete}
        data-delete-affordance="true"
        data-holding={isHolding ? "true" : undefined}
        data-shaking={armedAll ? "true" : undefined}
        aria-label={
          isArmedSingle
            ? "Confirm delete this chat"
            : "Delete this chat — click to confirm, or press and hold to clear all chats"
        }
        title={isArmedSingle ? undefined : "Delete chat · hold for all"}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // See renderChatDeleteButton for the jsdom/headless fallback.
          }
          startHoldDelete(HEADER_DELETE_KEY);
        }}
        onPointerUp={cancelHoldDelete}
        onPointerCancel={cancelHoldDelete}
        onClick={() => {
          if (holdCompletedRef.current) {
            holdCompletedRef.current = false;
            return;
          }
          if (armedAll) return;
          if (isArmedSingle) {
            void deleteConversation(currentChatId);
          } else {
            armDelete(HEADER_DELETE_KEY);
          }
        }}
      >
        {isArmedSingle ? "✓ Confirm" : "Delete"}
      </button>
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

    const className = [
      styles.botCardDelete,
      isArmedSingle ? styles.botCardDeleteArmed : "",
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
          isArmedSingle
            ? `Confirm delete ${bot.name}`
            : `Delete ${bot.name} — click to remove this bot, or press and hold to clear all bots`
        }
        title={isArmedSingle ? undefined : "Delete bot · hold for all"}
        onPointerDown={(e) => {
          // Only primary-button presses kick off the hold; right-click
          // (contextmenu) stays out of the gesture entirely.
          if (e.button !== 0) return;
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
          {isArmedSingle ? "✓" : "×"}
        </span>
      </button>
    );
  };

  // ── Mobile right-panel launcher ─────────────────────────────────────
  // Mirrors the left hamburger now that Settings / Bots / Images are
  // spatially right-side drawers on mobile instead of full-screen sheets.
  const renderMobilePanelLauncher = (): React.JSX.Element => {
    const launcherHidden = sidebarOpen || panel !== null;
    return (
      <>
        <button
          type="button"
          className={`${styles.panelMenuToggle} ${launcherHidden ? styles.menuToggleHidden : ""}`}
          data-right-panel-affordance="true"
          onClick={() => {
            setSidebarOpen(false);
            setRightMenuOpen(open => !open);
          }}
          aria-label="Open Settings, Bots, and Images"
          aria-haspopup="menu"
          tabIndex={launcherHidden ? -1 : 0}
        >
          ☰
        </button>
        {rightMenuOpen && !launcherHidden && (
          <div
            className={styles.panelQuickMenu}
            data-right-panel-affordance="true"
            role="menu"
            aria-label="Right-side panels"
          >
            <button type="button" role="menuitem" onClick={() => openRightPanel("settings")}>
              Settings
            </button>
            <button type="button" role="menuitem" onClick={() => openRightPanel("bots")}>
              Bots
            </button>
            <button type="button" role="menuitem" onClick={() => openRightPanel("images")}>
              Images
            </button>
          </div>
        )}
      </>
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
          onClick={closePanel}
          aria-hidden="true"
        />
      )}

      {/* ── Settings panel ── */}
      {panel === "settings" && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}><h3>Settings</h3><button type="button" className={styles.panelClose} onClick={closePanel}>×</button></div>
          {settings && (
            <form className={styles.form} onSubmit={saveSettings}>
              <label>Theme<select value={settings.theme} onChange={e => setSettings(p => p ? { ...p, theme: e.target.value as Theme } : p)}><option value="dark">Dark</option><option value="light">Light</option><option value="system">Auto (system)</option></select></label>
              <label>OpenAI API key<input type="password" placeholder={settings.hasOpenAiApiKey ? "Saved (leave blank to keep; type to replace)" : "sk-..."} value={openAiKey} onChange={e => setOpenAiKey(e.target.value)} /></label>
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
              <button type="submit" disabled={busy}>Save</button>
            </form>
          )}
          <div className={styles.dangerZone}>
            <h4>Danger Zone</h4>
            <p className={styles.muted}>Accounts inactive for over 60 days are removed automatically. You can also permanently delete this account right now.</p>
            <button
              type="button"
              className={styles.dangerButton}
              onClick={() => void deleteAccount()}
              disabled={busy}
            >
              Delete account
            </button>
          </div>
          <h4 className={styles.sectionLabel}>Memories</h4>
          <ul className={styles.memoryList}>
            {memories.map(m => (
              <li key={m.id}><p>{m.text}</p><small className={styles.muted}>confidence {m.confidence.toFixed(2)}</small><button type="button" onClick={() => void deleteMemory(m.id)}>Delete</button></li>
            ))}
          </ul>
          {/* Scoped to panelError so a chat-send 401 doesn't render a
              duplicate error on top of the Settings drawer. */}
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
        const hasEditChanges = editPristine
          ? trimmedName !== editPristine.name
            || newBotPrompt !== editPristine.prompt
            || normalizeColor(newBotColor) !== normalizeColor(editPristine.color)
            || newBotGlyph !== editPristine.glyph
            || newBotChatEnabled !== editPristine.chatEnabled
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

        return (
          <div
            className={`${styles.panel} ${styles.panelBots}`}
            data-color-picker-open={colorWheelOpen ? "true" : undefined}
          >
            <div className={styles.panelHeader}><h3>Bots</h3><button type="button" className={styles.panelClose} onClick={closePanel}>×</button></div>
            {/* One form, two modes. editingBotId hydrates the fields
                with the target bot's values but the layout itself
                doesn't fork — the primary button simply switches
                label + color based on hasEditChanges above. */}
            <form
              className={styles.form}
              onSubmit={(e) => void submitBotForm(e)}
            >
              {editingBotId && (
                <div className={styles.formEditingBanner} role="status">
                  <span className={styles.formEditingBannerLabel}>Editing</span>
                  <strong className={styles.formEditingBannerName}>
                    {editingBot?.name ?? "bot"}
                  </strong>
                </div>
              )}
              <div className={styles.botNameRow}>
                <ColorGlyphPicker
                  color={newBotColor}
                  glyph={newBotGlyph}
                  onColorChange={setNewBotColor}
                  onGlyphChange={setNewBotGlyph}
                  open={colorWheelOpen}
                  onToggle={() => setColorWheelOpen(o => !o)}
                  resolvedTheme={resolvedTheme}
                />
                <input ref={botNameInputRef} required placeholder="Bot name" value={newBotName} onChange={e => setNewBotName(e.target.value)} />
              </div>
              <textarea placeholder="System prompt" value={newBotPrompt} onChange={e => setNewBotPrompt(e.target.value)} />
              <label className={styles.botChatToggle}>
                <input
                  type="checkbox"
                  checked={newBotChatEnabled}
                  onChange={event => setNewBotChatEnabled(event.currentTarget.checked)}
                />
                <span className={styles.botChatToggleCopy}>
                  <strong>Available in Chat mode</strong>
                  <small>
                    Off by default. Disabled bots stay editable here and usable in Sandbox,
                    but do not appear in Chat.
                  </small>
                </span>
              </label>
              <button
                type="submit"
                disabled={!primaryActive}
                style={primaryStyle}
              >
                {primaryLabel}
              </button>
            </form>

            <div className={styles.botsScrollArea}>
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

              {bots.length > 0 && botPanelDashboardActive && !botPanelGroup && (
                // Collapsed PRISM dashboard root: render five color tiles
                // instead of the long bot list. Each tile drills into that
                // color group, keeping the customizer above as the primary
                // drawer surface even for small bot libraries.
                <div className={styles.botGroupGrid} role="list" aria-label="Bot color groups">
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
                        style={tileStyle}
                        onClick={() => setBotPanelGroup(group.id)}
                        disabled={count === 0}
                        aria-label={`Open ${group.label} bots (${count})`}
                      >
                        <span className={styles.botGroupTileLetter} aria-hidden="true">
                          {group.letter}
                        </span>
                        <span className={styles.botGroupTileCount}>
                          {count === 1 ? "1 bot" : `${count} bots`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {bots.length > 0 && botPanelDashboardActive && botPanelGroup && (
                // Drill-in header. Sits above the filtered list and
                // gives the user an obvious way back to the dashboard
                // root without hunting for the panel close affordance.
                <div className={styles.botGroupDrilldown}>
                  <button
                    type="button"
                    className={styles.botGroupBack}
                    onClick={() => setBotPanelGroup(null)}
                    aria-label="Back to all color groups"
                  >
                    <span aria-hidden="true">←</span>
                    <span>All colors</span>
                  </button>
                  {activeBotPanelGroup && (
                    <span
                      className={styles.botGroupDrilldownTitle}
                      style={{ ["--group-color" as string]: activeBotPanelGroup.swatch } as React.CSSProperties}
                    >
                      <span className={styles.botGroupDrilldownLetter} aria-hidden="true">
                        {activeBotPanelGroup.letter}
                      </span>
                      <strong>{activeBotPanelGroup.label}</strong>
                      <span className={styles.botGroupDrilldownCount}>
                        {visibleBotPanelBots.length === 1
                          ? "1 bot"
                          : `${visibleBotPanelBots.length} bots`}
                      </span>
                    </span>
                  )}
                </div>
              )}

              {bots.length > 0 && !(botPanelDashboardActive && !botPanelGroup) && (
                <>
                  {!botPanelDashboardActive && (
                    <h4 className={styles.sectionLabel}>Your bots</h4>
                  )}
                  {/* List-level data attrs mirror the sidebar conversation list:
                      `data-delete-holding` during a press-and-hold on any card ×,
                      `data-delete-armed-all` once the threshold crosses. The CSS
                      keys off both to drive the glow / tilt / iOS-jiggle visuals
                      across every card's × in parallel. Wrapping the map in a
                      div is what gives us a single element to hang those on. */}
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
                      const liveChatEnabled = isEditing
                        ? newBotChatEnabled
                        : botIsChatEnabled(b);
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
                        ? ({ "--bot-color": cardAccent } as React.CSSProperties)
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
                            onClick={() => startEditBot(b)}
                            aria-label={`Edit ${b.name}`}
                            aria-pressed={isEditing}
                          >
                            <span className={styles.botCardGlyph} aria-hidden="true">
                              <BotGlyph name={liveGlyph} />
                            </span>
                            <div className={styles.botCardBody}>
                              <div className={styles.botCardTitleRow}>
                                <strong>{b.name}</strong>
                                <span
                                  className={styles.botCardChatBadge}
                                  data-enabled={liveChatEnabled ? "true" : undefined}
                                >
                                  {liveChatEnabled ? "Chat on" : "Chat off"}
                                </span>
                              </div>
                              <small>{b.system_prompt ? b.system_prompt.slice(0, 80) + "..." : "No system prompt"}</small>
                            </div>
                          </button>
                          {renderBotDeleteButton(b)}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            {/* Errors from createBot / deleteBot / saveBot used to silently
                surface in the composer behind the drawer overlay. They now
                live inside the panel next to the action that triggered
                them. */}
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
          <div className={styles.panel}>
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
                <a key={img.id} href={img.url} target="_blank" rel="noreferrer"><img src={img.url} alt={img.prompt} /></a>
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
    <main className={`${styles.authLayout} ${themeClass}`}>
      <div className={styles.hubCard}>
        <div className={styles.brandLockup}>
          {/* See note on the auth-screen lockup: dark theme uses the boxed
              JPG with animated halos, light theme uses the bare triangle. */}
          <div className={styles.brandIconShell} aria-hidden="true">
            <img
              src="/icon.jpg"
              alt=""
              aria-hidden="true"
              className={styles.brandIcon}
            />
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
            title={
              effectiveThemeMode === "system"
                ? `Theme: Auto (${THEME_LABEL[resolvedTheme]})`
                : `Theme: ${THEME_LABEL[effectiveThemeMode]}`
            }
          >
            <ThemeGlyph mode={effectiveThemeMode} />
          </button>
          <button type="button" onClick={() => void logout()}>Logout</button>
        </div>
      </div>
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
    <main className={`${styles.appLayout} ${themeClass}`} style={shellStyle}>
      {/* Hide the fixed hamburger whenever a drawer is open on either
          side — it otherwise pokes through the sidebar profile tile
          (left) or the panel overlay dimmer (right) at its z-index:201. */}
      <button
        type="button"
        className={`${styles.menuToggle} ${(sidebarOpen || panel !== null) ? styles.menuToggleHidden : ""}`}
        onClick={() => {
          setRightMenuOpen(false);
          setSidebarOpen(o => !o);
        }}
        aria-hidden={sidebarOpen || panel !== null}
        tabIndex={(sidebarOpen || panel !== null) ? -1 : 0}
      >☰</button>
      {renderMobilePanelLauncher()}
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.profile}>
          <div className={styles.profileAvatar} aria-hidden="true">
            {(user.displayName || user.email).charAt(0).toUpperCase()}
          </div>
          <div className={styles.profileInfo}>
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        <div className={styles.newChatGroup}>
          <button
            type="button"
            className={styles.newChatButton}
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
              // Clear the last-picked bot AND any stale hover preview
              // so every fresh chat starts at the neutral "no
              // selection = default" state. Also cancel any pending
              // hover-dwell timer so a stale preview doesn't commit
              // after the picker re-mounts.
              setSelectedBotId(null);
              setHoveredBotId(null);
              closeEmptyStateBotSearch();
              if (hoverDwellTimerRef.current) {
                clearTimeout(hoverDwellTimerRef.current);
                hoverDwellTimerRef.current = null;
              }
              setPendingIncognito(false);
              setSidebarOpen(false);
            }}
          >
            New chat
          </button>
          {/* Private chat = chat-mode-only sibling. One click seeds the
              next send as { provider: local, incognito: true } + clears
              any pending bot pick so the default grayscale Prism persona
              renders. The conversation row created by the first send
              carries the incognito flag forever after (not flippable),
              which the sidebar list and the loaded-detail accent logic
              both key off. */}
          <button
            type="button"
            className={`${styles.privateChatButton} ${pendingIncognito ? styles.privateChatButtonActive : ""}`}
            onClick={() => {
              setSelectedId(null);
              setDetail(null);
              setSelectedBotId(null);
              setHoveredBotId(null);
              closeEmptyStateBotSearch();
              if (hoverDwellTimerRef.current) {
                clearTimeout(hoverDwellTimerRef.current);
                hoverDwellTimerRef.current = null;
              }
              setPendingIncognito(true);
              setSidebarOpen(false);
            }}
            aria-pressed={pendingIncognito}
            title="Private chat — local only, no memory"
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
          <span className={styles.sectionLabel}>Conversations</span>
        )}
        <ul
          className={styles.conversationList}
          data-delete-holding={holdingKey ? "true" : undefined}
          data-delete-armed-all={pendingDeleteKey === DELETE_ALL_KEY ? "true" : undefined}
        >
          {visibleConversations.map(c => {
            const isSelected = c.id === selectedId;
            // Row color comes from the server-denormalized last-bot
            // color (or falls back to the live bots list for the
            // empty-conversation case). Passing --row-color and
            // --row-border-mix as inline CSS vars lets the CSS side
            // do the actual fill/border math with color-mix().
            const rawRowColor = resolveRowColor(c, bots);
            const rowAccent = rawRowColor
              ? normalizeAccentForTheme(rawRowColor, resolvedTheme)
              : null;
            const rowStyle: React.CSSProperties | undefined = rowAccent
              ? ({
                  "--row-color": rowAccent,
                  "--row-border-mix": `${rowBorderMixPercent(rowAccent, resolvedTheme)}%`,
                } as React.CSSProperties)
              : undefined;
            return (
              <li
                key={c.id}
                className={styles.conversationRow}
                data-private={c.incognito ? "true" : undefined}
                style={rowStyle}
              >
                <button
                  type="button"
                  className={`${styles.conversationTitleButton} ${isSelected ? styles.selected : ""}`}
                  onClick={() => { disarmDelete(); void refreshConversation(c.id); setSidebarOpen(false); }}
                >
                  {c.title}
                </button>
                {!isSelected && renderChatDeleteButton(c)}
              </li>
            );
          })}
        </ul>

        <div className={styles.sidebarFooter}>
          <button type="button" onClick={() => openRightPanel("settings")}>Settings</button>
          <button type="button" onClick={() => openRightPanel("bots")}>Bots</button>
          <button type="button" onClick={() => openRightPanel("images")}>Images</button>
          <button type="button" onClick={() => void logout()}>Logout</button>
        </div>
      </aside>

      <section className={styles.chatPane}>
        <header className={styles.chatHeader}>
          <button
            type="button"
            className={styles.hubHomeButton}
            onClick={() => navigateToView("hub")}
            aria-label="Back to Hub"
            title="Back to Hub"
          >
            <PrismWordmark className={styles.hubHomeWordmark} />
          </button>
          <h2>{detail?.title ?? "New conversation"}</h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.themeToggleButton}
              onClick={() => void cycleThemeMode()}
              aria-label={
                effectiveThemeMode === "system"
                  ? `Theme: Auto, currently ${THEME_LABEL[resolvedTheme]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
                  : `Theme: ${THEME_LABEL[effectiveThemeMode]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
              }
              title={
                effectiveThemeMode === "system"
                  ? `Theme: Auto (${THEME_LABEL[resolvedTheme]})`
                  : `Theme: ${THEME_LABEL[effectiveThemeMode]}`
              }
            >
              <ThemeGlyph mode={effectiveThemeMode} />
            </button>
            {detail && selectedId && renderHeaderDeleteButton(selectedId)}
          </div>
        </header>

        <div className={styles.messages}>
          {!detail && !pendingReply && (() => {
            // Chat-mode empty state:
            //   • DEFAULT — no hover, no commit: rainbow brand mark,
            //     grayscale shell, generic title/hint, full picker grid.
            //   • HOVER PREVIEW — hero stays the Prism triangle, tinted
            //     to the hovered bot's normalized color. Title still
            //     previews the bot, and the shell accent swaps to that bot.
            //   • ARMED — hero becomes the bot's full-color glyph, the
            //     selected tile stays visible, and the hero turns into
            //     click-to-deselect until the first message sends.
            // `activeBot` resolves the right bot (hover > armed >
            // persisted), so title/hint/shell just read from it. The hero
            // receives the hovered bot as a separate preview input so it
            // can stay Prism-branded until a click arms the bot.
            // Density math runs against the FILTERED bot subset, not the
            // full library. That's what lets the hue lens collapse a
            // 3000-bot wall back into a low-density grid as soon as the
            // user picks a hue band — the active stage follows what's
            // visible, not what exists. Tiles are also placed in color
            // order via `pickerBots` so the unfiltered grid trends
            // toward a navigable color map.
            const pickerGeom =
              !pendingIncognito && pickerBots.length > 0
                ? pickerGeometry(pickerBots.length, viewportWidth, viewportHeight)
                : null;
            const isArmed =
              !pendingIncognito &&
              selectedBotId !== null &&
              activeBot?.id === selectedBotId;
            const isPreviewing =
              !pendingIncognito && hoveredBotId !== null && activeBot?.id === hoveredBotId;
            const heroBot = pendingIncognito ? null : activeBot;
            const title = pendingIncognito
              ? "Private chat"
              : heroBot?.name?.trim() || "What\u2019s on your mind?";
            const descriptionPreview = heroBot
              ? firstLinesOf(heroBot.system_prompt)
              : "";
            const hint = pendingIncognito
              ? "Local only. Nothing from this chat is remembered."
              : descriptionPreview ||
                (chatAvailableBots.length > 0
                  ? "Pick a bot below, or just start typing."
                  : bots.length > 0
                    ? "Enable a bot for Chat in the Bots panel, or start with Default."
                  : "Say anything. Prism keeps what matters and lets the rest go.");
            const emptyStateStyle = heroBot
              ? botAccentStyle(heroBot.color, resolvedTheme)
              : undefined;
            const emptyStateClassName = [
              styles.emptyState,
              emptyStateSearchActive ? styles.emptyStateSearching : null,
            ].filter(Boolean).join(" ");
            const renderHero = () => (
              <EmptyStateIcon
                bot={isPreviewing ? null : heroBot}
                previewBot={isPreviewing ? heroBot : null}
                previewAsBotGlyph={isPreviewing}
                resolvedTheme={resolvedTheme}
              />
            );
            return (
              <div className={emptyStateClassName} style={emptyStateStyle}>
                {/* Hero is non-interactive until the user has armed
                    a pick — then it becomes the single deselect
                    affordance (click / tap returns to default). */}
                {isArmed ? (
                  <button
                    type="button"
                    className={styles.emptyStateIconButton}
                    onClick={resetEmptyStateBotSelection}
                    title="Change bot"
                    aria-label={`Change bot \u2014 currently ${heroBot?.name ?? "selected"}`}
                  >
                    {renderHero()}
                  </button>
                ) : !pendingIncognito && chatAvailableBots.length > 0 ? (
                  <button
                    type="button"
                    className={`${styles.emptyStateIconButton} ${styles.emptyStateSearchTrigger}`}
                    onClick={openEmptyStateBotSearch}
                    title="Search bots"
                    aria-label="Search bots"
                  >
                    {renderHero()}
                  </button>
                ) : (
                  renderHero()
                )}
                <div className={styles.emptyStateTitle}>{title}</div>
                {emptyStateSearchActive ? (
                  renderEmptyStateBotSearch()
                ) : (
                  <p className={styles.emptyStateHint}>{hint}</p>
                )}
                {/* Chat-mode start-of-conversation bot picker. Absent in
                    private chats (the "stripped down further" spec),
                    absent when the user has no bots yet. Clicking any
                    bot only arms/highlights the selection; the grid
                    stays visible until the first message sends.

                    Interaction model:
                      • Desktop (mouse): onPointerEnter sets
                        hoveredBotId for a transient preview. The
                        picker container's onPointerLeave clears it
                        when the cursor crosses back out. Click arms
                        via setSelectedBotId.
                      • Final compact-pixel stage: hover preview is
                        disabled. Tap/click only arms the selected bot,
                        updates the interface color, and follows the
                        same "visible until Send" contract.
                      • Touch: onPointerEnter is filtered to mouse-only
                        so a stray touch-generated pointerenter doesn't
                        double-fire. Click fires normally on tap and
                        arms the selection.

                    Either way, "Default" is not a tile — it's the
                    no-selection state. Sending with nothing armed
                    routes to the grayscale Prism persona (botId
                    omitted from the request). To go back to default
                    after arming, click the hero. */}
                {!pendingIncognito && pickerBots.length > 0 && (() => {
                  const geom =
                    pickerGeom ?? pickerGeometry(pickerBots.length, viewportWidth, viewportHeight);
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
                      data-bot-picker-frame="true"
                      data-returning-all={botPickerReturnAnimating ? "true" : undefined}
                      data-search-active={emptyStateSearchActive ? "true" : undefined}
                      data-touch-active={touchPreview ? "true" : undefined}
                      style={frameStyle}
                      onPointerLeave={e => {
                        // Leaving the picker cancels any pending dwell
                        // and clears the preview IMMEDIATELY — no
                        // debounce here. If the user has already
                        // armed a bot with their eyes, we shouldn't make
                        // them wait for the preview to fade.
                        if (e.pointerType === "mouse") {
                          if (hoverDwellTimerRef.current) {
                            clearTimeout(hoverDwellTimerRef.current);
                            hoverDwellTimerRef.current = null;
                          }
                          if (!geom.compactPixelGrid) {
                            resetPickerParallax(e.currentTarget);
                          }
                          setHoveredBotId(null);
                        }
                      }}
                      onPointerDown={e => handleTouchPickerDown(e, geom)}
                      onPointerMove={handleTouchPickerMove}
                      onPointerUp={handleTouchPickerUp}
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
                          if (geom.threeBotStack || geom.mobileColumnStack) return null;
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
                        if (geom.flattenTile) {
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
                        const showFeaturedName = geom.singleBot;
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
                            }}
                            onPointerEnter={e => {
                              // Debounce the JS-driven preview (hero
                              // glyph, title/hint, shell accent) so a
                              // fast sweep across many tiles doesn't
                              // strobe. The CSS-driven per-tile
                              // magnification stays instant via pure
                              // :hover. Any pending timer from the
                              // previous tile is cancelled — only the
                              // CURRENT dwell target commits.
                              if (e.pointerType !== "mouse" || geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                              if (hoverDwellTimerRef.current) {
                                clearTimeout(hoverDwellTimerRef.current);
                              }
                              hoverDwellTimerRef.current = setTimeout(() => {
                                setHoveredBotId(b.id);
                                hoverDwellTimerRef.current = null;
                              }, HOVER_DWELL_MS);
                            }}
                            onPointerMove={e => {
                              if (geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                            }}
                            onClick={(e) => {
                              // Explicit click beats the dwell timer —
                              // the user made a deliberate choice, no
                              // reason to wait the 180ms dwell window.
                              if (hoverDwellTimerRef.current) {
                                clearTimeout(hoverDwellTimerRef.current);
                                hoverDwellTimerRef.current = null;
                              }
                              // Dense color-map mode starts at Stage 4
                              // (glyphless cards): the first click snaps
                              // the hue lens to this bot's color group
                              // instead of selecting the individual bot.
                              // Once the lens narrows the visible set,
                              // normal per-tile selection resumes.
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
                                    (geom.hideGlyphByDefault ||
                                      geom.solidSwatch ||
                                      geom.compactPixelGrid)));
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
                                setHoveredBotId(null);
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
          {/* Conversation intro — surfaces AFTER the first message is
              sent, sits above the message list, and scrolls naturally
              out of view as the thread grows. Gives the user a "who
              am I talking to" anchor without pinning it to the viewport.
              Only rendered when the open conversation has a persisted
              bot (no bot = default persona, which has no name/glyph of
              its own to show). */}
          {detail && conversationBot && (() => {
            const introStyle = botAccentStyle(conversationBot.color, resolvedTheme);
            const description = firstLinesOf(conversationBot.system_prompt, 220);
            return (
              <div className={styles.conversationIntro} style={introStyle}>
                <EmptyStateIcon
                  bot={conversationBot}
                  resolvedTheme={resolvedTheme}
                />
                <div className={styles.conversationIntroName}>
                  {conversationBot.name}
                </div>
                {description && (
                  <p className={styles.conversationIntroDescription}>
                    {description}
                  </p>
                )}
              </div>
            );
          })()}
          {detail?.messages.map(msg => {
            const status = getMessageStatus(msg);
            // Historical messages keep their original bot accent bar.
            // The accent is normalized for the active theme so legacy bots
            // whose stored color drifted outside the current safe range still
            // render at a usable fill against the bubble background. Private
            // chats (detail.incognito) suppress the bar entirely so the whole
            // conversation reads B&W.
            const messageStyle =
              msg.role === "assistant" && msg.botColor && !detail?.incognito
                ? ({
                    "--message-accent": normalizeAccentForTheme(
                      msg.botColor,
                      resolvedTheme
                    ),
                  } as React.CSSProperties)
                : undefined;
            return (
              <article
                key={msg.id}
                className={`${styles.message} ${msg.role === "user" ? styles.messageUser : styles.messageAssistant}`}
                style={messageStyle}
              >
                <h4>
                  <span className={styles.messageRoleLabel}>
                    {msg.role === "assistant"
                      ? (msg.botName?.trim() || "Prism")
                      : "You"}
                  </span>
                  {status && (
                    <span
                      className={styles.providerTag}
                      title={STATUS_LABEL[status]}
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
                      <span className={styles.providerLabel}>{STATUS_LABEL[status]}</span>
                    </span>
                  )}
                </h4>
                <MessageBody
                  messageId={msg.id}
                  content={msg.content}
                  expanded={expandedMessageIds.has(msg.id)}
                  onToggle={toggleMessageExpand}
                />
                {(() => {
                  // Chat-mode per-message actions. Identical behavior to
                  // Sandbox: assistant bubbles get a one-click "Fork here"
                  // (non-destructive branch), user bubbles get two-stage
                  // Resend → "Confirm resend?" → rewind+resubmit. Both
                  // flows funnel through `buildChatRequestBody`, which
                  // forces incognito turns to LOCAL and otherwise honors
                  // whatever provider is currently live — so the toggle
                  // below the textarea and the Resend button compose
                  // naturally.
                  const isUser = msg.role === "user";
                  const armed = isUser && pendingResendId === msg.id;
                  return (
                    <div
                      className={styles.messageActionsSlot}
                      data-armed={armed ? "true" : undefined}
                      data-resend-affordance={isUser ? "true" : undefined}
                    >
                      <div className={styles.messageActions}>
                        {isUser ? (
                          <button
                            type="button"
                            className={armed ? styles.messageActionArmed : undefined}
                            onClick={() => {
                              if (armed) {
                                void resendFromMessage(msg);
                              } else {
                                armResend(msg.id);
                              }
                            }}
                          >
                            {armed ? "Confirm resend?" : "Resend"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void forkChat(msg.id)}
                          >
                            Fork here
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </article>
            );
          })}
          {pendingReply && (
            <div className={styles.typingIndicator} role="status" aria-live="polite">
              <span>Thinking</span>
              <span className={styles.typingDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        <form
          className={styles.compose}
          data-compose-bot-selected={selectedComposeBotAccent ? "true" : undefined}
          style={composeStyle}
          onSubmit={sendMessage}
        >
          {error && <p className={`${styles.error} ${styles.composeError}`} role="alert">{error}</p>}
          {(!detail || detail.messages.length === 0) && (
            <HueLensControl
              bots={pickerSourceBots}
              filteredBots={filteredBots}
              hueFilterCenter={hueFilterCenter}
              onHueChange={setHueFilterCenter}
              hueLensAvailable={hueLensAvailable}
              trackGradient={hueLensTrackGradient}
              trackSegments={hueLensTrackSegments}
            />
          )}
          {/* Chat-mode compose carries two knobs now:
               1. Bot picker — mid-thread override of the conversation's
                  bot. The dropdown reflects a "pending" pick instantly
                  (chatBotOverride state), but the shell accent and
                  conversation intro keep following detail.botId (server
                  truth) until the NEXT successful send — which is when
                  chat.ts persists the switch on conversations.bot_id.
                  That's the "only stick after the new bot replies" UX.
               2. LOCAL/ONLINE provider toggle — swap between local
                  Ollama and remote ChatGPT without leaving the chat.
             Privacy stays conversation-level (sidebar "Private chat"
             button at chat start). If the open chat is private
             (detail.incognito) or a brand-new chat is armed as private
             (pendingIncognito), BOTH controls are disabled — private
             chats always run as the Default persona on LOCAL per the
             chat.ts contract. The global "providerLocked" setting
             still applies to the provider toggle so a user who locked
             the rail from Sandbox doesn't get a silent override here.
             No lock dock in this surface: Chat already has Private
             chat for the "don't leave local" guarantee, and piling a
             second lock on top would re-introduce the Sandbox-style
             knob density this mode is supposed to avoid. */}
          {(() => {
            const isLocal = settings?.preferredProvider === "local";
            const globalLocked = settings?.providerLocked ?? false;
            const chatLocked =
              detail?.incognito === true || pendingIncognito;
            const pinnedLocal = chatLocked;
            const displayLocal = pinnedLocal ? true : isLocal;
            const providerDisabled = !settings || globalLocked || chatLocked;
            const lockReason = pinnedLocal
              ? "Private chats always run on LOCAL."
              : globalLocked
                ? `Response mode locked to ${isLocal ? "Local" : "Online"} in Settings.`
                : null;
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
              chatAvailableBots.length === 0;
            const botTitle = chatLocked
              ? "Private chats always run as the Default persona."
              : !detail
                ? "Send your first message to change bots mid-thread."
                : pendingReply
                  ? "Wait for the current reply before switching bots."
                  : chatAvailableBots.length === 0
                    ? "Default is the only Chat option until you enable a custom bot."
                    : undefined;
            // Dropdown is disabled pre-detail, so onChange only fires
            // once the thread exists. Set the override directly; the
            // server persists the switch after the new bot's reply.
            const handleBotSelectChange = (value: string) => {
              setChatBotOverride(value === "" ? null : value);
            };
            return (
              <div className={styles.composeTools}>
                <ComposerBotPicker
                  value={botSelectValue}
                  onChange={handleBotSelectChange}
                  bots={botFiltersEnabled ? chatAvailableBots : filteredBots}
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
                      lockReason
                        ? `${lockReason} (currently ${displayLocal ? "LOCAL" : "ONLINE"})`
                        : displayLocal
                          ? "Response mode: Local. Click to switch to Online."
                          : "Response mode: Online. Click to switch to Local."
                    }
                    aria-pressed={!displayLocal}
                    aria-disabled={providerDisabled}
                    title={
                      lockReason
                        ? lockReason
                        : displayLocal
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
              </div>
            );
          })()}
          <div className={styles.composeInner}>
            <textarea
              ref={draftInputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onFocus={() => setHoveredBotId(null)}
              placeholder="Say something..."
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              enterKeyHint="send"
              lang="en"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(e); } }}
            />
            <button type="submit" disabled={pendingReply || !draft.trim()}>Send</button>
          </div>
        </form>
      </section>

      {renderSharedPanels()}
      {renderDeleteAllModal()}
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
    <main className={`${styles.appLayout} ${themeClass}`} style={shellStyle}>
      {/* Mobile menu toggle — faded out while either drawer is open
          (sidebar on the left, Settings/Bots/Images panel on the right)
          so the fixed hamburger doesn't overlap the profile avatar or
          poke through the panel overlay dimmer. */}
      <button
        type="button"
        className={`${styles.menuToggle} ${(sidebarOpen || panel !== null) ? styles.menuToggleHidden : ""}`}
        onClick={() => {
          setRightMenuOpen(false);
          setSidebarOpen(o => !o);
        }}
        aria-hidden={sidebarOpen || panel !== null}
        tabIndex={(sidebarOpen || panel !== null) ? -1 : 0}
      >☰</button>
      {renderMobilePanelLauncher()}
      {sidebarOpen && <div className={styles.overlay} onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.profile}>
          <div className={styles.profileAvatar} aria-hidden="true">
            {(user.displayName || user.email).charAt(0).toUpperCase()}
          </div>
          <div className={styles.profileInfo}>
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </div>
        </div>

        <button
          type="button"
          className={styles.newChatButton}
          onClick={() => {
            setSelectedId(null);
            setDetail(null);
            // Match Chat-mode semantics: every fresh Sandbox chat lands
            // on the default-unselected state with the tile grid
            // visible, so the user always starts from a clean pick.
            // Also cancel any pending hover dwell so a stale preview
            // doesn't commit after the picker re-mounts.
            setSelectedBotId(null);
            setHoveredBotId(null);
            if (hoverDwellTimerRef.current) {
              clearTimeout(hoverDwellTimerRef.current);
              hoverDwellTimerRef.current = null;
            }
            setSidebarOpen(false);
          }}
        >
          New chat
        </button>

        <div className={styles.sidebarField}>
          <span className={styles.sectionLabel}>Online provider</span>
          {/* Single option today; more online providers (Claude, Gemini, ...) will appear here over time. */}
          <select
            className={styles.sidebarSelect}
            value="openai"
            onChange={() => { /* only one option for now */ }}
            disabled={!settings}
          >
            <option value="openai">ChatGPT</option>
          </select>
        </div>

        <div className={styles.sidebarField}>
          <span className={styles.sectionLabel}>Local model</span>
          <div className={styles.sidebarReadout}>
            {settings?.ollamaModel ?? "Ollama"}
          </div>
        </div>

        {/* Incognito is Chat-mode-only now: it doubles as the
            online/offline toggle there, and Sandbox deliberately has no
            cross-session memory to "hide from" in the first place. */}

        {visibleConversations.length > 0 && (
          <span className={styles.sectionLabel}>Conversations</span>
        )}
        <ul
          className={styles.conversationList}
          data-delete-holding={holdingKey ? "true" : undefined}
          data-delete-armed-all={pendingDeleteKey === DELETE_ALL_KEY ? "true" : undefined}
        >
          {visibleConversations.map(c => {
            const isSelected = c.id === selectedId;
            // Same row-tint resolution as the Chat-mode sidebar — shared
            // CSS tokens do the actual painting, we just push the vars.
            // Sandbox rows "live-update" on each reply because the
            // server's lastBotColor reflects whoever just spoke, and
            // refreshConversations() fires after every send.
            const rawRowColor = resolveRowColor(c, bots);
            const rowAccent = rawRowColor
              ? normalizeAccentForTheme(rawRowColor, resolvedTheme)
              : null;
            const rowStyle: React.CSSProperties | undefined = rowAccent
              ? ({
                  "--row-color": rowAccent,
                  "--row-border-mix": `${rowBorderMixPercent(rowAccent, resolvedTheme)}%`,
                } as React.CSSProperties)
              : undefined;
            return (
              <li
                key={c.id}
                className={styles.conversationRow}
                data-private={c.incognito ? "true" : undefined}
                style={rowStyle}
              >
                <button
                  type="button"
                  className={`${styles.conversationTitleButton} ${isSelected ? styles.selected : ""}`}
                  onClick={() => { disarmDelete(); void refreshConversation(c.id); setSidebarOpen(false); }}
                >
                  {c.title}
                </button>
                {!isSelected && renderChatDeleteButton(c)}
              </li>
            );
          })}
        </ul>

        <div className={styles.sidebarFooter}>
          <button type="button" onClick={() => openRightPanel("settings")}>Settings</button>
          <button type="button" onClick={() => openRightPanel("bots")}>Bots</button>
          <button type="button" onClick={() => openRightPanel("images")}>Images</button>
          <button type="button" onClick={() => void logout()}>Logout</button>
        </div>
      </aside>

      {/* Chat */}
      <section className={styles.chatPane}>
        <header className={styles.chatHeader}>
          <button
            type="button"
            className={styles.hubHomeButton}
            onClick={() => navigateToView("hub")}
            aria-label="Back to Hub"
            title="Back to Hub"
          >
            <PrismWordmark className={styles.hubHomeWordmark} />
          </button>
          <h2>{detail?.title ?? "New conversation"}</h2>
          {activeBot && (
            <button
              type="button"
              className={styles.badge}
              onClick={openActiveBotCustomizer}
              aria-label={`Edit ${activeBot.name}`}
              title={`Edit ${activeBot.name}`}
            >
              <span>EDIT</span>
              <span>BOT</span>
            </button>
          )}
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.themeToggleButton}
              onClick={() => void cycleThemeMode()}
              aria-label={
                effectiveThemeMode === "system"
                  ? `Theme: Auto, currently ${THEME_LABEL[resolvedTheme]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
                  : `Theme: ${THEME_LABEL[effectiveThemeMode]}. Click to switch to ${THEME_LABEL[nextThemeMode(effectiveThemeMode)]}.`
              }
              title={
                effectiveThemeMode === "system"
                  ? `Theme: Auto (${THEME_LABEL[resolvedTheme]})`
                  : `Theme: ${THEME_LABEL[effectiveThemeMode]}`
              }
            >
              <ThemeGlyph mode={effectiveThemeMode} />
            </button>
            {/* Whole-conversation Fork was retired in favor of the per-
                message Fork/Resend affordances on bot/user bubbles —
                forking from nothing in particular was rarely the right
                action. Export + Delete stay in the header since they
                still operate on the whole chat. */}
            {detail && <button type="button" onClick={() => void exportChat()}>Export .md</button>}
            {detail && selectedId && renderHeaderDeleteButton(selectedId)}
          </div>
        </header>

        <div className={styles.messages}>
          {!detail && !pendingReply && (() => {
            // Sandbox empty state — mirrors the Chat-mode empty state so
            // both modes feel like the same "start a new chat" surface:
            //   • DEFAULT — no hover, no armed bot: brand mark hero, full
            //     picker grid, generic title/hint.
            //   • HOVER PREVIEW — hero stays the Prism triangle, tinted
            //     to the hovered bot's normalized color. Title/hint still
            //     preview the bot, and the shell accent swaps to that bot.
            //   • ARMED — hero becomes the bot's full-color glyph, the
            //     selected tile stays visible, compose dropdown
            //     auto-populates, and the hero turns into
            //     click-to-deselect until a message sends.
            //
            // The compose bot dropdown stays DISABLED while !detail so
            // the tile picker is the single arming path pre-chat;
            // once the first send lands, detail exists and the dropdown
            // takes over as the mid-thread bot switcher.
            //
            // Picker geometry runs against the FILTERED subset so the
            // hue lens can step the density stage back when the band
            // contains far fewer bots than the full library.
            const pickerGeom =
              pickerBots.length > 0
                ? pickerGeometry(pickerBots.length, viewportWidth, viewportHeight)
                : null;
            const isArmed =
              selectedBotId !== null &&
              activeBot?.id === selectedBotId;
            const isPreviewing =
              hoveredBotId !== null && activeBot?.id === hoveredBotId;
            const heroBot = activeBot;
            const title =
              heroBot?.name?.trim() || "Start a new conversation";
            const descriptionPreview = heroBot
              ? firstLinesOf(heroBot.system_prompt)
              : "";
            const hint =
              descriptionPreview ||
              (bots.length > 0
                ? "Pick a bot below, or just start typing. You can swap bots between sends."
                : "Type a message below to begin. Hover any bubble to fork a reply or resend your own. Exports and custom bots live in the header.");
            const emptyStateStyle = heroBot
              ? botAccentStyle(heroBot.color, resolvedTheme)
              : undefined;
            const emptyStateClassName = [
              styles.emptyState,
              emptyStateSearchActive ? styles.emptyStateSearching : null,
            ].filter(Boolean).join(" ");
            const renderHero = () => (
              <EmptyStateIcon
                bot={isPreviewing ? null : heroBot}
                previewBot={isPreviewing ? heroBot : null}
                previewAsBotGlyph={isPreviewing}
                resolvedTheme={resolvedTheme}
              />
            );
            return (
              <div className={emptyStateClassName} style={emptyStateStyle}>
                {/* Hero becomes a deselect button once a bot is armed —
                    click it to drop back to Default while keeping the
                    grid available until a message sends. */}
                {isArmed ? (
                  <button
                    type="button"
                    className={styles.emptyStateIconButton}
                    onClick={resetEmptyStateBotSelection}
                    title="Change bot"
                    aria-label={`Change bot \u2014 currently ${heroBot?.name ?? "selected"}`}
                  >
                    {renderHero()}
                  </button>
                ) : bots.length > 0 ? (
                  <button
                    type="button"
                    className={`${styles.emptyStateIconButton} ${styles.emptyStateSearchTrigger}`}
                    onClick={openEmptyStateBotSearch}
                    title="Search bots"
                    aria-label="Search bots"
                  >
                    {renderHero()}
                  </button>
                ) : (
                  renderHero()
                )}
                <div className={styles.emptyStateTitle}>{title}</div>
                {emptyStateSearchActive ? (
                  renderEmptyStateBotSearch()
                ) : (
                  <p className={styles.emptyStateHint}>{hint}</p>
                )}
                {pickerBots.length > 0 && (() => {
                  // Same geometry math as the Chat-mode picker: mobile
                  // stays square, desktop goes widescreen, and density
                  // stages scale from the viewport-driven frame width.
                  // Sourced from `pickerBots` (color-sorted view of the
                  // hue-lens-filtered library) so the unfiltered grid
                  // reads as a navigable color map.
                  const geom =
                    pickerGeom ?? pickerGeometry(pickerBots.length, viewportWidth, viewportHeight);
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
                      data-bot-picker-frame="true"
                      data-returning-all={botPickerReturnAnimating ? "true" : undefined}
                      data-search-active={emptyStateSearchActive ? "true" : undefined}
                      data-touch-active={touchPreview ? "true" : undefined}
                      style={frameStyle}
                      onPointerLeave={e => {
                        // Cursor out → cancel any pending dwell and
                        // clear preview immediately. No debounce on
                        // leave — we don't want the preview to
                        // linger once the cursor has moved on.
                        if (e.pointerType === "mouse") {
                          if (hoverDwellTimerRef.current) {
                            clearTimeout(hoverDwellTimerRef.current);
                            hoverDwellTimerRef.current = null;
                          }
                          if (!geom.compactPixelGrid) {
                            resetPickerParallax(e.currentTarget);
                          }
                          setHoveredBotId(null);
                        }
                      }}
                      onPointerDown={e => handleTouchPickerDown(e, geom)}
                      onPointerMove={handleTouchPickerMove}
                      onPointerUp={handleTouchPickerUp}
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
                          if (geom.threeBotStack || geom.mobileColumnStack) return null;
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
                        if (geom.flattenTile) {
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
                        const showFeaturedName = geom.singleBot;
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
                            }}
                            onPointerEnter={e => {
                              // Debounce the JS-driven preview (hero
                              // glyph, title/hint, shell accent) so a
                              // fast sweep across tiles doesn't strobe.
                              // The CSS-driven per-tile magnification
                              // stays instant via pure :hover. Any
                              // pending timer from the previous tile is
                              // cancelled — only the CURRENT dwell
                              // target commits.
                              if (e.pointerType !== "mouse" || geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                              if (hoverDwellTimerRef.current) {
                                clearTimeout(hoverDwellTimerRef.current);
                              }
                              hoverDwellTimerRef.current = setTimeout(() => {
                                setHoveredBotId(b.id);
                                hoverDwellTimerRef.current = null;
                              }, HOVER_DWELL_MS);
                            }}
                            onPointerMove={e => {
                              if (geom.compactPixelGrid) return;
                              updatePickerParallax(e);
                            }}
                            onClick={(e) => {
                              // Explicit click beats the dwell timer —
                              // the user made a deliberate choice, no
                              // reason to wait the 180ms dwell window.
                              // Setting selectedBotId also makes the
                              // compose dropdown auto-populate (both
                              // read from the same state).
                              if (hoverDwellTimerRef.current) {
                                clearTimeout(hoverDwellTimerRef.current);
                                hoverDwellTimerRef.current = null;
                              }
                              // Dense color-map mode mirrors the Chat
                              // picker. Stage 4 snaps to a hue region
                              // before individual selection; Stage 5+
                              // desktop mouse clicks select the exact
                              // pixel and also move the hue lens there.
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
                                    (geom.hideGlyphByDefault ||
                                      geom.solidSwatch ||
                                      geom.compactPixelGrid)));
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
                                setHoveredBotId(null);
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
            const messageStyle = normalizedBotColor
              ? ({ "--message-accent": normalizedBotColor } as React.CSSProperties)
              : undefined;
            return (
              <article
                key={msg.id}
                className={`${styles.message} ${msg.role === "user" ? styles.messageUser : styles.messageAssistant}`}
                style={messageStyle}
              >
                <h4>
                  <span className={styles.messageRoleLabel}>
                    {msg.role === "assistant" && msg.botGlyph && (
                      <span
                        className={styles.messageBotGlyph}
                        style={normalizedBotColor ? { color: normalizedBotColor } : undefined}
                      >
                        <BotGlyph name={msg.botGlyph} size={12} strokeWidth={2.25} />
                      </span>
                    )}
                    {msg.role === "assistant"
                      ? (msg.botName?.trim() || "Assistant")
                      : "You"}
                  </span>
                  {status && (
                    <span
                      className={styles.providerTag}
                      title={STATUS_LABEL[status]}
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
                      <span className={styles.providerLabel}>{STATUS_LABEL[status]}</span>
                    </span>
                  )}
                </h4>
                <MessageBody
                  messageId={msg.id}
                  content={msg.content}
                  expanded={expandedMessageIds.has(msg.id)}
                  onToggle={toggleMessageExpand}
                />
                {(() => {
                  // Assistant bubbles: one-click "Fork here" (non-destructive
                  // branch into a new conversation).
                  // User bubbles: two-stage Resend → "Confirm resend?" →
                  // rewind-and-resubmit. The armed attribute on the slot
                  // keeps it expanded while the pointer leaves, matching
                  // the delete-confirm pattern used elsewhere in the app.
                  const isUser = msg.role === "user";
                  const armed = isUser && pendingResendId === msg.id;
                  return (
                    <div
                      className={styles.messageActionsSlot}
                      data-armed={armed ? "true" : undefined}
                      data-resend-affordance={isUser ? "true" : undefined}
                    >
                      <div className={styles.messageActions}>
                        {isUser ? (
                          <button
                            type="button"
                            className={armed ? styles.messageActionArmed : undefined}
                            onClick={() => {
                              if (armed) {
                                void resendFromMessage(msg);
                              } else {
                                armResend(msg.id);
                              }
                            }}
                          >
                            {armed ? "Confirm resend?" : "Resend"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void forkChat(msg.id)}
                          >
                            Fork here
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </article>
            );
          })}
          {pendingReply && (
            <div className={styles.typingIndicator} role="status" aria-live="polite">
              <span>Generating response</span>
              <span className={styles.typingDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
          {/* Scroll sentinel: kept at the very end so the scroll effect can
              always bring the latest content into view. */}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        <form
          className={styles.compose}
          data-compose-bot-selected={selectedComposeBotAccent ? "true" : undefined}
          style={composeStyle}
          onSubmit={sendMessage}
        >
          {error && <p className={`${styles.error} ${styles.composeError}`} role="alert">{error}</p>}
          {(!detail || detail.messages.length === 0) && (
            <HueLensControl
              bots={pickerSourceBots}
              filteredBots={filteredBots}
              hueFilterCenter={hueFilterCenter}
              onHueChange={setHueFilterCenter}
              hueLensAvailable={hueLensAvailable}
              trackGradient={hueLensTrackGradient}
              trackSegments={hueLensTrackSegments}
            />
          )}
          <div className={styles.composeTools}>
            {(() => {
              const botHasCommenced = !!detail && detail.messages.length > 0;
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
                  <ComposerBotPicker
                    value={selectedBotId ?? ""}
                    onChange={next => setSelectedBotId(next || null)}
                    bots={botHasCommenced ? bots : filteredBots}
                    resolvedTheme={resolvedTheme}
                    disabled={!detail || bots.length === 0}
                    title={
                      !detail
                        ? "Pick a bot from the grid above to start the chat. You can swap here between sends once it begins."
                        : bots.length === 0
                          ? "Default is the only option until you create a custom bot."
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
                </>
              );
            })()}
            {(() => {
              const isLocal = settings?.preferredProvider === "local";
              const providerLocked = settings?.providerLocked ?? false;
              return (
                <div className={`${styles.modeControl} ${providerLocked ? styles.modeControlLocked : ""}`}>
                  <button
                    type="button"
                    className={`${styles.modeToggleTrack} ${providerLocked ? styles.modeToggleTrackLocked : ""}`}
                    onClick={() => {
                      if (!settings || providerLocked) return;
                      void switchProvider(isLocal ? "openai" : "local");
                    }}
                    aria-label={
                      providerLocked
                        ? `Response mode locked to ${isLocal ? "Local" : "Online"}.`
                        : isLocal
                          ? "Response mode: Local. Click to switch to Online."
                          : "Response mode: Online. Click to switch to Local."
                    }
                    aria-pressed={!isLocal}
                    aria-disabled={!settings || providerLocked}
                    title={
                      providerLocked
                        ? `Locked to ${isLocal ? "Local" : "Online"}`
                        : isLocal
                          ? "Switch to Online"
                          : "Switch to Local"
                    }
                    disabled={!settings}
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
                  <button
                    type="button"
                    className={`${styles.modeLockDock} ${providerLocked ? styles.modeLockDockLocked : ""}`}
                    onClick={() => void toggleProviderLock()}
                    aria-label={
                      providerLocked
                        ? `Unlock response mode. It is currently locked to ${isLocal ? "Local" : "Online"}.`
                        : `Lock response mode to ${isLocal ? "Local" : "Online"}.`
                    }
                    title={
                      providerLocked
                        ? `Unlock (${isLocal ? "Local" : "Online"} locked)`
                        : `Lock ${isLocal ? "Local" : "Online"}`
                    }
                    disabled={!settings}
                  >
                    <svg
                      className={`${styles.modeLockGlyph} ${providerLocked ? styles.modeLockGlyphLocked : ""}`}
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <rect
                        className={styles.modeLockBody}
                        x="3.5"
                        y="7"
                        width="9"
                        height="6"
                        rx="1.4"
                      />
                      {providerLocked ? (
                        <path d="M5.25 7V5.4a2.75 2.75 0 1 1 5.5 0V7" />
                      ) : (
                        <path d="M5.25 7V5.6a2.75 2.75 0 0 1 4.7-1.95" />
                      )}
                    </svg>
                  </button>
                </div>
              );
            })()}
          </div>
          <div className={styles.composeInner}>
            <textarea
              ref={draftInputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onFocus={() => setHoveredBotId(null)}
              placeholder="Ask anything..."
              spellCheck
              autoCorrect="on"
              autoCapitalize="sentences"
              enterKeyHint="send"
              lang="en"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(e); } }}
            />
            <button type="submit" disabled={pendingReply || !draft.trim()}>Send</button>
          </div>
        </form>
      </section>

      {renderSharedPanels()}
      {renderDeleteAllModal()}
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
