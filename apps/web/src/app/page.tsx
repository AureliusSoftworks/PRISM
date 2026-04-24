"use client";

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from "react";
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
    setColors(shufflePalette(PRISM_WORDMARK_PALETTE));
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
        />
        {/* R — two subpaths grouped so both subpaths inherit the same
            shuffled color from a single <g stroke>. */}
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

// ── Color math for the bot color wheel ────────────────────────────────
// The wheel paints a HSL hue ring via conic-gradient with a white-centered
// radial for saturation; these helpers map clicks on the wheel to/from hex.

function randomHex(): string {
  const n = Math.floor(Math.random() * 0x1000000);
  return `#${n.toString(16).padStart(6, "0")}`;
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
  light: "#f1f1f4",
  dark: "#0a0a0b",
};

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

// --bg-surface hex per theme. Mirrored from .themeDark / .themeLight in
// page.module.css so the swatch-border compensator can reason about what
// surface the swatch actually sits on.
const THEME_SURFACE_BG: Record<"light" | "dark", string> = {
  light: "#ffffff",
  dark: "#121214",
};

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
interface ConversationSummary { id: string; title: string; updatedAt: string; }
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
interface ConversationDetail { id: string; title: string; messages: Message[]; }
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
}

// Accent color pre-selected in the bot creation picker. Users can change it
// before clicking Create; existing bots with no color just render no accent.
// No static default color anymore. The bot color picker seeds itself with
// a fresh random hex on mount, every time the Bots panel opens, and every
// time a bot is created — so opening the panel always feels generative.
interface ImageRecord { id: string; prompt: string; url: string; created_at: string; }

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
          <circle cx="8" cy="8" r="3" />
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5l1.5 1.5M3 13l1.5-1.5M11.5 4.5l1.5-1.5" />
        </>
      )}
      {mode === "dark" && (
        /* Crescent moon: one arc carved out of a larger one. */
        <path d="M13 9A5.5 5.5 0 1 1 7 3a4.5 4.5 0 0 0 6 6Z" />
      )}
      {mode === "system" && (
        <>
          {/* Half-filled circle: outline the full disc, then fill the right
             hemisphere so it reads as "sun on one side, moon on the other". */}
          <circle cx="8" cy="8" r="5.5" />
          <path
            d="M8 2.5A5.5 5.5 0 0 1 8 13.5Z"
            fill="currentColor"
            stroke="none"
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
// Kept light-weight and uniform (14px, stroke 2, round caps) so the action
// affordances on bot cards all feel like they belong to the same set.
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

function IconPlus(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function IconX(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M18 6L6 18" />
      <path d="M6 6l12 12" />
    </svg>
  );
}

function IconPencil(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function IconCheck(): React.JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20 6L9 17l-5-5" />
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
  const index = Math.floor(Math.random() * BOT_GLYPH_ORDER.length);
  return BOT_GLYPH_ORDER[index];
}

interface BotGlyphProps {
  name: string | null | undefined;
  size?: number;
  strokeWidth?: number;
}

function BotGlyph({ name, size = 18, strokeWidth = 2 }: BotGlyphProps): React.JSX.Element {
  const key: BotGlyphName = isBotGlyphName(name) ? name : DEFAULT_BOT_GLYPH;
  const definition = BOT_GLYPHS[key];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {definition.paths}
    </svg>
  );
}

// ── Empty-state icon ──────────────────────────────────────────────────
// Rendered at the top of the "new conversation" placeholder in Chat and
// Sandbox. Two rendering modes, picked on `bot`:
//
//   1. `bot` null  → theme-aware brand mark. Dark theme shows the boxed
//      icon.jpg; light theme shows the rainbow triangle SVG. Same two-asset
//      swap as the auth lockup, but deliberately WITHOUT the animated halos
//      or hue-drift — this icon surfaces on every new chat, so a moving
//      focal point would be distracting. The auth screen keeps the motion
//      as the dedicated "entry" moment.
//
//   2. `bot` set   → scaled-up sibling of the .botCardGlyph tile so the
//      same visual language (tinted bg + border, bot-color stroke) reads
//      on the empty state, the bot card, the inline name glyph, and the
//      message bubble. The stored color is clamped via
//      clampAccentLightness so legacy bots whose picked hex drifted outside
//      the current picker band still render inside it.
//
// Both modes paint at the same 56×56 footprint so the layout never jumps
// when the user switches bots.
interface EmptyStateIconProps {
  bot: Bot | null;
  /**
   * Active theme, resolved upstream. The bot's stored color runs through
   * `clampAccentLightness(_, resolvedTheme)` so a deep navy that's fine
   * on the light shell lifts into the dark-mode safe band before it ever
   * paints the glyph stroke. Without this the triangle/glyph stroke at
   * L≈30 would vanish against `#0a0a0b`.
   */
  resolvedTheme: "light" | "dark";
}

function EmptyStateIcon({ bot, resolvedTheme }: EmptyStateIconProps): React.JSX.Element {
  if (bot) {
    const rawColor = bot.color?.trim();
    const accent = rawColor ? clampAccentLightness(rawColor, resolvedTheme) : null;
    const style = accent
      ? ({ "--bot-color": accent } as React.CSSProperties)
      : undefined;
    return (
      <span
        className={styles.emptyStateBotGlyph}
        aria-hidden="true"
        style={style}
      >
        <BotGlyph name={bot.glyph} size={32} strokeWidth={2} />
      </span>
    );
  }
  return (
    <div className={styles.emptyStateBrand} aria-hidden="true">
      <img
        src="/icon.jpg"
        alt=""
        aria-hidden="true"
        className={styles.emptyStateBrandIconDark}
      />
      <img
        src="/icon-triangle.svg"
        alt=""
        aria-hidden="true"
        className={styles.emptyStateBrandIconLight}
      />
    </div>
  );
}

interface BotGlyphPickerProps {
  value: string | null | undefined;
  onChange: (next: BotGlyphName) => void;
}

function BotGlyphPicker({ value, onChange }: BotGlyphPickerProps): React.JSX.Element {
  const selected: BotGlyphName = isBotGlyphName(value) ? value : DEFAULT_BOT_GLYPH;
  return (
    <div className={styles.glyphPicker} role="radiogroup" aria-label="Bot glyph">
      {BOT_GLYPH_ORDER.map((key) => {
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
            <BotGlyph name={key} size={22} />
          </button>
        );
      })}
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
  const displayColor = clampAccentLightness(color, resolvedTheme);
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
        <BotGlyph name={glyph} size={28} />
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [incognito, setIncognito] = useState(false);
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
  const [colorWheelOpen, setColorWheelOpen] = useState(false);
  // Two-layer action affordance on a bot card:
  //   expandedBotKey → which card has revealed the [pencil] [×] bubbles
  //   editingBotId   → which existing bot is currently loaded into the top
  //                    form (null = create mode). Shown on the card as a
  //                    subtle "being edited" highlight; the card itself
  //                    no longer renders its own edit form.
  const [expandedBotKey, setExpandedBotKey] = useState<string | null>(null);
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
  // Sentinel at the tail of the message stream. The scroll effect brings it
  // into view so the latest message is always visible without manual scrolling.
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [systemTheme, setSystemTheme] = useState<"light" | "dark">("dark");
  // Theme preference used before a user has logged in (or when the user
  // explicitly logs out). Seeded from localStorage so the auth screen
  // respects the last choice across refreshes; defaults to "system" so
  // first-time visitors track OS dark/light preference automatically.
  const [preAuthTheme, setPreAuthTheme] = useState<Theme>("system");
  // Shared close helper for the right-hand panels. Also resets panel-specific
  // transient UI so reopening a panel doesn't resurrect stale state.
  const closePanel = useCallback(() => {
    setPanel(null);
    setColorWheelOpen(false);
    setExpandedBotKey(null);
    setEditingBotId(null);
    // A stale "Save failed" shouldn't greet the user next time they open
    // the panel. The composer's `error` state is unaffected.
    setPanelError(null);
  }, []);

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
  // Chat mode currently has no per-conversation bot association, so it
  // falls through to the grayscale default for now. Once the "lock a
  // bot per conversation at chat start" feature lands, Chat mode will
  // read its locked bot's color here the same way Sandbox already
  // does. Either way, the bot's color runs through clampAccentLightness
  // first so the shell accent (New chat button, BOT pill, user bubble,
  // ambient glow) never washes out for pale picks nor fades away for
  // inky ones.
  // Resolve the bot currently driving the app shell's accent triad AND
  // the empty-state icon. Sandbox follows the user's pick; Chat has no
  // bot picker yet so it always resolves to null, which both consumers
  // treat as the "Default" fallback (grayscale shell + rainbow brand
  // icon). Hoisted out of shellStyle so EmptyStateIcon can reuse the
  // same resolution rather than duplicating the find().
  const activeBot = useMemo<Bot | null>(() => {
    const activeBotId = view === "sandbox" ? selectedBotId : null;
    return bots.find(b => b.id === activeBotId) ?? null;
  }, [view, bots, selectedBotId]);

  const shellStyle = useMemo<React.CSSProperties | undefined>(() => {
    const raw = activeBot?.color?.trim();
    if (!raw) return undefined;
    return deriveAccentStyle(
      clampAccentLightness(raw, resolvedTheme),
      resolvedTheme
    );
  }, [activeBot, resolvedTheme]);

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

  async function refreshAll() { await Promise.all([refreshConversations(), refreshSettings(), refreshMemories(), refreshBots(), refreshImages()]); }
  async function refreshConversations() { const d = await api<{ conversations: ConversationSummary[] }>("/api/conversations"); setConversations(d.conversations); }
  async function refreshConversation(id: string) { const d = await api<{ conversation: ConversationDetail }>(`/api/conversations/${id}`); setDetail(d.conversation); setSelectedId(id); }
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
  //   - Chat: no bot picker, so `botId` is always omitted. `incognito`
  //     is surfaced in the composer and doubles as the online/offline
  //     toggle — when it's on, the provider is pinned LOCAL so a
  //     single tap takes the user fully offline for that send.
  //   - Sandbox: bot picker + memory are the point of the surface.
  //     Cross-session memory is disabled server-side for sandbox, so
  //     we never send an `incognito` flag from here.
  function buildChatRequestBody(message: string): Record<string, unknown> {
    const isChatMode = view === "chat";
    const mode: "chat" | "sandbox" = isChatMode ? "chat" : "sandbox";
    const chatIncognito = isChatMode && incognito;
    const providerForSend = chatIncognito
      ? "local"
      : settings?.preferredProvider;
    return {
      conversationId: selectedId ?? undefined,
      message,
      mode,
      botId: isChatMode ? undefined : (selectedBotId ?? undefined),
      ...(isChatMode ? { incognito: chatIncognito } : {}),
      preferredProvider: providerForSend,
    };
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || pendingReply) return;
    setPendingReply(true);
    setError(null);

    const previousDetail = detail;
    const optimisticMessage: Message = {
      id: `pending-${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const optimisticTitle =
      detail?.title ?? (trimmed.length > 42 ? `${trimmed.slice(0, 39)}...` : trimmed);
    setDetail({
      id: detail?.id ?? "pending",
      title: optimisticTitle,
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
      await refreshConversations();
      await refreshMemories();
    } catch (err) {
      setDetail(previousDetail);
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
    // DELETE_ALL_KEY is special: its confirm surface is a centered modal,
    // and the 3.5 s window that makes the inline "Are you sure?" pill
    // feel snappy would instead pull the modal out from under the user
    // mid-read. We skip auto-disarm for it and rely on Cancel / backdrop
    // / Esc to dismiss explicitly.
    if (key === DELETE_ALL_KEY) return;
    pendingDeleteTimerRef.current = setTimeout(() => {
      setPendingDeleteKey(null);
      pendingDeleteTimerRef.current = null;
      // For bot delete, auto-disarm also collapses the pencil/× bubbles so
      // the user has to open the layered menu again for another action —
      // matching the "dismiss = close everything" contract.
      if (key.startsWith(BOT_DELETE_KEY_PREFIX)) {
        setExpandedBotKey(null);
      }
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
    holdTimerRef.current = setTimeout(() => {
      // Threshold crossed — snap out of "holding" visuals and into the
      // armed-all state. The list-level data attribute flip takes the
      // ×'s from tilted-and-glowing straight into iOS jiggle, and
      // `armDelete(DELETE_ALL_KEY)` renders the confirmation modal.
      holdCompletedRef.current = true;
      setHoldingKey(null);
      holdTimerRef.current = null;
      armDelete(DELETE_ALL_KEY);
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
  // other confirm surface in the app.
  const isDeleteAllActive = pendingDeleteKey === DELETE_ALL_KEY;
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

  // Every time the Bots panel opens, seed the color picker with a fresh
  // random hex AND pick a random glyph so the create form feels
  // generative instead of always showing the same default.
  useEffect(() => {
    if (panel === "bots") {
      setNewBotColor(randomHex());
      setNewBotGlyph(randomBotGlyph());
    }
  }, [panel]);

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

  // Close the layered bot-card bubbles (pencil + ×) on outside click or
  // Escape. The bubbles and the armed "Are you sure?" pill both live on
  // `[data-delete-affordance='true']` elements (so the existing disarm
  // handler treats them as inside too), plus each bot card's entire right
  // side shares this attribute to keep clicks on the bubbles themselves
  // from collapsing the layer.
  useEffect(() => {
    if (!expandedBotKey) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      // Element (not HTMLElement) — see color-popover handler above for
      // the full SVG-target rationale. Bot cards use inline SVG glyphs,
      // so the same bug would apply here.
      if (
        target instanceof Element &&
        target.closest("[data-delete-affordance='true']")
      ) {
        return;
      }
      setExpandedBotKey(null);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setExpandedBotKey(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [expandedBotKey]);

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
    setColorWheelOpen(false);
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
    setExpandedBotKey(null);
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

  // Load a specific bot into the top form for editing. The form itself
  // doesn't change shape — it just flips from "create" to "edit" mode
  // via editingBotId, and the name/prompt/color/glyph fields are
  // hydrated from the bot. Any other layered UI (delete arm, expanded
  // card bubbles, open picker) is collapsed so the user's attention
  // rests squarely on the one active form.
  function startEditBot(bot: Bot) {
    disarmDelete();
    setExpandedBotKey(null);
    setColorWheelOpen(false);
    setNewBotName(bot.name);
    setNewBotPrompt(bot.system_prompt ?? "");
    setNewBotColor(bot.color?.trim() || randomHex());
    setNewBotGlyph(isBotGlyphName(bot.glyph) ? bot.glyph : DEFAULT_BOT_GLYPH);
    setEditingBotId(bot.id);
    setPanelError(null);
  }

  function cancelEditBot() {
    setEditingBotId(null);
    resetBotForm();
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
    if (pendingDeleteKey !== DELETE_ALL_KEY) return null;
    const count = conversations.length;
    // Tailor the body copy to the actual chat count — nothing reads
    // worse than "all 1 conversations" on a fresh account.
    const body =
      count === 1
        ? "This will permanently remove your only conversation."
        : `This will permanently remove all ${count} conversations.`;
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
            Delete all chats?
          </h2>
          <p id="delete-all-desc" className={styles.deleteAllModalBody}>
            {body} Images and memories stay.
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
              onClick={() => void deleteAllConversations()}
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
        onClick={() => setSidebarOpen(o => !o)}
        aria-hidden={sidebarOpen || panel !== null}
        tabIndex={(sidebarOpen || panel !== null) ? -1 : 0}
      >☰</button>
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

        <button
          type="button"
          className={styles.newChatButton}
          onClick={() => { setSelectedId(null); setDetail(null); setSidebarOpen(false); }}
        >
          New chat
        </button>

        <span className={styles.sectionLabel}>Conversations</span>
        <ul
          className={styles.conversationList}
          data-delete-holding={holdingKey ? "true" : undefined}
          data-delete-armed-all={pendingDeleteKey === DELETE_ALL_KEY ? "true" : undefined}
        >
          {conversations.map(c => {
            const isSelected = c.id === selectedId;
            return (
              <li key={c.id} className={styles.conversationRow}>
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
          <button type="button" onClick={() => { setPanel("settings"); setSidebarOpen(false); }}>Settings</button>
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
          {!detail && !pendingReply && (
            <div className={styles.emptyState}>
              <EmptyStateIcon bot={activeBot} resolvedTheme={resolvedTheme} />
              <div className={styles.emptyStateTitle}>What&apos;s on your mind?</div>
              <p className={styles.emptyStateHint}>
                Say anything. Prism keeps what matters and lets the rest go.
              </p>
            </div>
          )}
          {detail?.messages.map(msg => {
            const status = getMessageStatus(msg);
            // Historical messages keep their original bot accent bar
            // even though Chat mode itself doesn't let the user pick a
            // bot. The accent is pulled into the safe lightness band
            // via clampAccentLightness so legacy bots whose stored
            // color drifted outside the picker's current range still
            // render at a usable fill against the bubble background —
            // and so two bots differing only slightly in shade still
            // read as distinct bars, rather than getting flattened to
            // one accent.
            const messageStyle =
              msg.role === "assistant" && msg.botColor
                ? ({
                    "--message-accent": clampAccentLightness(
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
                {/* No per-message "Fork here" in Chat mode — forking is a
                    Sandbox power feature. */}
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

        <form className={styles.compose} onSubmit={sendMessage}>
          {error && <p className={`${styles.error} ${styles.composeError}`} role="alert">{error}</p>}
          {/* Incognito is Chat's single compose-adjacent control. It
              doubles as the online/offline toggle: on = this send goes
              local-only and isn't remembered; off = use saved provider
              and let memory capture its usual hints. One pill, one job,
              no drop-downs — matches the "stripped-down personal Prism"
              philosophy of this mode. */}
          <div className={styles.composeTools}>
            <button
              type="button"
              className={`${styles.incognitoToggle} ${incognito ? styles.incognitoToggleActive : ""}`}
              onClick={() => setIncognito(v => !v)}
              aria-pressed={incognito}
              aria-label={
                incognito
                  ? "Incognito is on. This send stays local and isn't remembered. Click to turn off."
                  : "Incognito is off. Click to route the next send local-only and skip memory."
              }
              title={
                incognito
                  ? "Incognito ON — local only, memory off"
                  : "Incognito OFF — tap to go offline for the next send"
              }
            >
              <span
                className={`${styles.incognitoDot} ${incognito ? styles.incognitoDotActive : ""}`}
                aria-hidden="true"
              />
              Incognito
            </button>
          </div>
          <div className={styles.composeInner}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
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

      {panel && (
        <div
          className={styles.panelOverlay}
          onClick={closePanel}
          aria-hidden="true"
        />
      )}

      {/* Settings is the only panel reachable from Chat — Bots/Images
          are Sandbox-only affordances. */}
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
      {renderDeleteAllModal()}
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
        onClick={() => setSidebarOpen(o => !o)}
        aria-hidden={sidebarOpen || panel !== null}
        tabIndex={(sidebarOpen || panel !== null) ? -1 : 0}
      >☰</button>
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

        <button type="button" className={styles.newChatButton} onClick={() => { setSelectedId(null); setDetail(null); setSidebarOpen(false); }}>New chat</button>

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

        <span className={styles.sectionLabel}>Conversations</span>
        <ul
          className={styles.conversationList}
          data-delete-holding={holdingKey ? "true" : undefined}
          data-delete-armed-all={pendingDeleteKey === DELETE_ALL_KEY ? "true" : undefined}
        >
          {conversations.map(c => {
            const isSelected = c.id === selectedId;
            return (
              <li key={c.id} className={styles.conversationRow}>
                <button
                  type="button"
                  className={`${styles.conversationTitleButton} ${isSelected ? styles.selected : ""}`}
                  onClick={() => { disarmDelete(); void refreshConversation(c.id); setSidebarOpen(false); }}
                >
                  {c.title}
                </button>
                {/* The active chat uses the header-level Delete button instead, so
                    the sidebar × is suppressed for it to avoid two controls for
                    the same action. */}
                {!isSelected && renderChatDeleteButton(c)}
              </li>
            );
          })}
        </ul>

        <div className={styles.sidebarFooter}>
          <button type="button" onClick={() => { setPanel("settings"); setSidebarOpen(false); }}>Settings</button>
          <button type="button" onClick={() => { setPanel("bots"); setSidebarOpen(false); }}>Bots</button>
          <button type="button" onClick={() => { setPanel("images"); setSidebarOpen(false); }}>Images</button>
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
          {selectedBotId && <span className={styles.badge}>Bot</span>}
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
          {!detail && !pendingReply && (
            <div className={styles.emptyState}>
              <EmptyStateIcon bot={activeBot} resolvedTheme={resolvedTheme} />
              <div className={styles.emptyStateTitle}>Start a new conversation</div>
              <p className={styles.emptyStateHint}>
                {selectedBotId
                  ? "You're chatting with a custom bot. Ask it anything."
                  : "Type a message below to begin. Hover any bubble to fork a reply or resend your own. Exports and custom bots live in the header."}
              </p>
            </div>
          )}
          {detail?.messages.map(msg => {
            const status = getMessageStatus(msg);
            // Push the bot's color into the assistant bubble itself so
            // the message owns the accent visually, leaving the header
            // dots free for HUMAN / LOCAL / ONLINE status only. The
            // color runs through clampAccentLightness so any legacy
            // shade outside the picker's safe band gets pulled into it
            // at render time — the bubble never paints a near-black or
            // near-white stripe that'd blend into the chat bg, and the
            // inline name glyph inherits the same in-range hex.
            const normalizedBotColor =
              msg.role === "assistant" && msg.botColor
                ? clampAccentLightness(msg.botColor, resolvedTheme)
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

        <form className={styles.compose} onSubmit={sendMessage}>
          {error && <p className={`${styles.error} ${styles.composeError}`} role="alert">{error}</p>}
          <div className={styles.composeTools}>
            <div className={styles.composeBotControl}>
              <span className={styles.composeControlLabel}>Bot</span>
              <select
                className={styles.composeBotSelect}
                value={selectedBotId ?? ""}
                onChange={e => setSelectedBotId(e.target.value || null)}
                disabled={bots.length === 0}
                title={
                  bots.length === 0
                    ? "Default is the only option until you create a custom bot."
                    : undefined
                }
              >
                <option value="">Default</option>
                {bots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
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
              value={draft}
              onChange={e => setDraft(e.target.value)}
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
      {panel === "bots" && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}><h3>Bots</h3><button type="button" className={styles.panelClose} onClick={closePanel}>×</button></div>
          {/* One form, two modes. editingBotId flips the whole template
              between "create new bot" and "edit <existing>" — same
              inputs, same ColorGlyphPicker, same layout. No second
              picker ever mounts. */}
          <form
            className={`${styles.form} ${editingBotId ? styles.formEditing : ""}`}
            onSubmit={(e) => void submitBotForm(e)}
          >
            {editingBotId && (
              <div className={styles.formEditingBanner} role="status">
                <span className={styles.formEditingBannerLabel}>Editing</span>
                <strong className={styles.formEditingBannerName}>
                  {bots.find(b => b.id === editingBotId)?.name ?? "bot"}
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
              <input required placeholder="Bot name" value={newBotName} onChange={e => setNewBotName(e.target.value)} />
            </div>
            <textarea placeholder="System prompt" value={newBotPrompt} onChange={e => setNewBotPrompt(e.target.value)} />
            {editingBotId ? (
              <div className={styles.formActions}>
                <button type="button" onClick={cancelEditBot} disabled={busy}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.formPrimary}
                  disabled={busy || !newBotName.trim()}
                >
                  Save changes
                </button>
              </div>
            ) : (
              <button type="submit" disabled={busy || !newBotName.trim()}>
                Create bot
              </button>
            )}
          </form>

          <h4 className={styles.sectionLabel}>Built-in</h4>
          <div
            className={`${styles.botCard} ${styles.botCardDefault}`}
            aria-label="Default bot: always available, cannot be deleted"
          >
            <span className={styles.botCardGlyph} aria-hidden="true">
              <BotGlyph name="bot" size={20} />
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

          {bots.length > 0 && <h4 className={styles.sectionLabel}>Your bots</h4>}
          {bots.map(b => {
            const botKey = `${BOT_DELETE_KEY_PREFIX}${b.id}`;
            const isArmed = pendingDeleteKey === botKey;
            const isExpanded = expandedBotKey === botKey;
            const isEditing = editingBotId === b.id;
            // Live preview during editing — the card mirrors the values
            // currently in the top form so changes to color/glyph are
            // visible on the card itself before "Save changes" is hit.
            const liveColor = isEditing ? newBotColor : b.color;
            const liveGlyph = isEditing ? newBotGlyph : b.glyph;
            // Card adornments (accent bar + glyph tile) run the bot's
            // stored color through clampAccentLightness so legacy bots
            // whose color drifted outside the picker's current band
            // still render inside it — and so the card accent exactly
            // matches the swatch at the top of the panel (which applies
            // the same clamp). Shade variation inside the band is
            // preserved; we only pull extremes back in.
            const cardAccent = liveColor
              ? clampAccentLightness(liveColor, resolvedTheme)
              : null;
            const cardStyle = cardAccent
              ? ({ "--bot-color": cardAccent } as React.CSSProperties)
              : undefined;
            const cardClassName = isEditing
              ? `${styles.botCard} ${styles.botCardEditing}`
              : styles.botCard;

            return (
              <div key={b.id} className={cardClassName} style={cardStyle}>
                <span className={styles.botCardGlyph} aria-hidden="true">
                  <BotGlyph name={liveGlyph} size={20} />
                </span>
                <div className={styles.botCardBody}>
                  <strong>{b.name}</strong>
                  <small>{b.system_prompt ? b.system_prompt.slice(0, 80) + "..." : "No system prompt"}</small>
                </div>
                {isArmed ? (
                  // Armed confirmation pill: full-width overlay on the right,
                  // clicking it again confirms the delete.
                  <button
                    type="button"
                    className={`${styles.botCardDelete} ${styles.botCardDeleteArmed}`}
                    data-delete-affordance="true"
                    aria-label={`Confirm delete ${b.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteBot(b.id);
                    }}
                  >
                    <span className={styles.conversationDeletePrompt}>Are you sure?</span>
                    <span className={styles.conversationDeleteGlyph}>✓</span>
                  </button>
                ) : isExpanded ? (
                  // Layered action bubbles: edit (pencil) + delete (red ×).
                  <div
                    className={styles.botCardBubbles}
                    data-delete-affordance="true"
                    role="group"
                    aria-label={`${b.name} actions`}
                  >
                    <button
                      type="button"
                      className={styles.botCardBubble}
                      onClick={(e) => {
                        e.stopPropagation();
                        startEditBot(b);
                      }}
                      aria-label={`Edit ${b.name}`}
                      title="Edit bot"
                    >
                      <IconPencil />
                    </button>
                    <button
                      type="button"
                      className={`${styles.botCardBubble} ${styles.botCardBubbleDelete}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        armDelete(botKey);
                      }}
                      aria-label={`Delete ${b.name}`}
                      title="Delete bot"
                    >
                      <IconX />
                    </button>
                  </div>
                ) : (
                  // Idle: the + affordance that fades in on card hover / focus.
                  <button
                    type="button"
                    className={styles.botCardAction}
                    data-delete-affordance="true"
                    aria-label={`Open actions for ${b.name}`}
                    title="Actions"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedBotKey(botKey);
                    }}
                  >
                    <IconPlus />
                  </button>
                )}
              </div>
            );
          })}
          {/* Errors from createBot / deleteBot / saveBot used to silently
              surface in the composer behind the drawer overlay. They now
              live inside the panel next to the action that triggered
              them. */}
          {panelError && <p className={styles.error} role="alert">{panelError}</p>}
        </div>
      )}

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
      {renderDeleteAllModal()}
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
