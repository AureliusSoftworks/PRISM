"use client";

import { Suspense, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";

// How long the two-stage delete (× → ✓) stays armed before auto-disarming.
// Long enough for a deliberate confirmation click, short enough that the armed
// state doesn't linger and cause accidents on a later sidebar return visit.
const DELETE_CONFIRM_WINDOW_MS = 3500;

// Sentinel for the chat-header delete button, which has no chat id of its own
// (it always targets the currently open chat).
const HEADER_DELETE_KEY = "__header__";

// Namespace bot-delete keys so they can share the same single "armed" state
// slot used for conversation deletion without id collisions.
const BOT_DELETE_KEY_PREFIX = "bot:";

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

type Provider = "local" | "openai";
type Theme = "dark" | "light" | "system";
type PanelView = null | "settings" | "bots" | "images";

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

function HomeContent(): React.JSX.Element {
  const searchParams = useSearchParams();
  const authMode = searchParams.get("mode") === "login" ? "login" : "register";
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState("");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [openAiKey, setOpenAiKey] = useState("");
  const [memories, setMemories] = useState<UserMemory[]>([]);
  const [pendingReply, setPendingReply] = useState(false);
  const [panel, setPanel] = useState<PanelView>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState<string | null>(null);
  const [incognito, setIncognito] = useState(false);
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imagePrompt, setImagePrompt] = useState("");
  const [newBotName, setNewBotName] = useState(""); const [newBotPrompt, setNewBotPrompt] = useState("");
  // Lazy initializer so the very first render already picks a random seed
  // without re-randomizing on every re-render.
  const [newBotColor, setNewBotColor] = useState<string>(() => randomHex());
  const [colorWheelOpen, setColorWheelOpen] = useState(false);
  // Two-layer action affordance on a bot card:
  //   expandedBotKey → which card has revealed the [pencil] [×] bubbles
  //   editingBotId   → which card is currently showing the inline edit form
  // At most one of each is non-null at any time. Editing a bot supersedes
  // the expanded state so the pencil click effectively swaps layers.
  const [expandedBotKey, setExpandedBotKey] = useState<string | null>(null);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [editBotName, setEditBotName] = useState("");
  const [editBotPrompt, setEditBotPrompt] = useState("");
  const [editBotColor, setEditBotColor] = useState<string>(() => randomHex());
  const [editColorWheelOpen, setEditColorWheelOpen] = useState(false);
  // Two-stage delete confirmation. `pendingDeleteKey` holds either a
  // conversation id (sidebar ×) or HEADER_DELETE_KEY (header button).
  // Only one target can be armed at a time, and it auto-disarms after
  // DELETE_CONFIRM_WINDOW_MS so the ✓ doesn't linger unexpectedly.
  const [pendingDeleteKey, setPendingDeleteKey] = useState<string | null>(null);
  const pendingDeleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    setEditColorWheelOpen(false);
    setExpandedBotKey(null);
    setEditingBotId(null);
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

  // When a bot is selected, push its color into the app shell as `--accent`
  // so every --accent-derived token in the CSS (hover, soft, glow, user
  // bubble, ambient gradient, CTA fills) recomputes. No bot selected →
  // undefined style, and the grayscale defaults from the theme block apply.
  const shellStyle = useMemo<React.CSSProperties | undefined>(() => {
    const selectedBot = bots.find(b => b.id === selectedBotId);
    const raw = selectedBot?.color?.trim();
    if (!raw) return undefined;

    // Clamp the user's chosen bot color into a theme-appropriate luminance
    // range BEFORE anything else derives from it. Light mode gets a ceiling
    // so neon lime doesn't become a CTA/bubble fill; dark mode gets a floor
    // so ink-black doesn't disappear into the background. The hue stays
    // recognisable because clampLuminance only blends with black or white
    // (see packages/shared/src/color.ts for the pinned unit tests).
    const themeBg = resolvedTheme === "light" ? "#f1f1f4" : "#0a0a0b";
    const accent =
      resolvedTheme === "light"
        ? clampLuminance(raw, { max: 0.55 })
        : clampLuminance(raw, { min: 0.1 });

    // --accent-text: text that sits ON a solid accent fill (CTA buttons,
    // user message bubble). Picked from the clamped accent, so bright limes
    // that were just softened still get the correct black-or-white pair.
    const accentText = pickReadableText(accent);

    // --accent-ink: accent used AS a foreground on the app background
    // (badges, empty-state icons, locked padlock). Pushed toward black/white
    // until it hits 4.5:1 against the actual theme bg so it stays legible
    // even after the clamp above.
    const accentInk = ensureContrast(accent, themeBg, 4.5);

    return {
      ["--accent" as string]: accent,
      ["--accent-text" as string]: accentText,
      ["--accent-ink" as string]: accentInk,
    } as React.CSSProperties;
  }, [bots, selectedBotId, resolvedTheme]);

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

  async function logout() { await api("/api/auth/logout", { method: "POST", body: "{}" }); setUser(null); setConversations([]); setDetail(null); setMemories([]); setSettings(null); setBots([]); setImages([]); }

  async function deleteAccount() {
    const confirmed = window.confirm(
      "Delete your account and all associated chats, memories, bots, images, and exports? This cannot be undone."
    );
    if (!confirmed) {
      return;
    }

    setBusy(true);
    setError(null);
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
      setError(err instanceof Error ? err.message : "Account deletion failed.");
    } finally {
      setBusy(false);
    }
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
        body: JSON.stringify({
          conversationId: selectedId ?? undefined,
          message: trimmed,
          botId: selectedBotId ?? undefined,
          incognito,
          // Sent explicitly so switching providers in the sidebar takes effect
          // on the very next message, without waiting on the settings PATCH.
          preferredProvider: settings?.preferredProvider,
        }),
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
    try {
      // Only include the key field when the user typed something; otherwise
      // the backend would have no way to tell "no change" apart from "clear".
      const body: Record<string, unknown> = { ...settings };
      const trimmedKey = openAiKey.trim();
      if (trimmedKey.length > 0) {
        body.openAiApiKey = trimmedKey;
      }
      await api("/api/settings", { method: "PATCH", body: JSON.stringify(body) });
      setOpenAiKey("");
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
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
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ openAiApiKey: null }),
      });
      setOpenAiKey("");
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Clear failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemory(id: string) { await api(`/api/memories/${id}`, { method: "DELETE" }); await refreshMemories(); }

  async function forkChat(messageId?: string) {
    if (!selectedId) return;
    const d = await api<{ conversationId: string }>(`/api/conversations/${selectedId}/fork`, { method: "POST", body: JSON.stringify({ messageId }) });
    await refreshConversations(); await refreshConversation(d.conversationId);
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
    }
    setPendingDeleteKey(key);
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

  // Clicking anywhere outside the delete / confirm affordance should disarm it.
  // This prevents the confirm pill from lingering in an awkward in-between
  // state after focus moves elsewhere in the sidebar.
  useEffect(() => {
    if (!pendingDeleteKey) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("[data-delete-affordance='true']")) {
        return;
      }
      disarmDelete();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [pendingDeleteKey, disarmDelete]);

  // Every time the Bots panel opens, seed the color picker with a fresh
  // random hex so the starting swatch feels generative instead of always
  // showing the same default fill.
  useEffect(() => {
    if (panel === "bots") {
      setNewBotColor(randomHex());
    }
  }, [panel]);

  // Close either color wheel popover on any outside click or Escape. The
  // create wheel and each per-bot edit wheel share the same affordance
  // attribute, so a single handler covers both.
  useEffect(() => {
    if (!colorWheelOpen && !editColorWheelOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest("[data-color-affordance='true']")
      ) {
        return;
      }
      setColorWheelOpen(false);
      setEditColorWheelOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setColorWheelOpen(false);
        setEditColorWheelOpen(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [colorWheelOpen, editColorWheelOpen]);

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
      if (
        target instanceof HTMLElement &&
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

  // Click-to-pick from the color wheel: map click offset to HSL, store as hex.
  const handleColorWheelClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const x = event.clientX - rect.left - cx;
      const y = event.clientY - rect.top - cy;
      const radius = Math.min(rect.width, rect.height) / 2;
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius) return; // outside the painted disc
      const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      const saturation = Math.min(100, (distance / radius) * 100);
      setNewBotColor(hslToHex(hue, saturation, 50));
    },
    []
  );

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

  async function createBot(e: React.FormEvent) {
    e.preventDefault(); if (!newBotName.trim()) return;
    await api("/api/bots", {
      method: "POST",
      body: JSON.stringify({
        name: newBotName,
        systemPrompt: newBotPrompt,
        color: newBotColor,
      }),
    });
    setNewBotName("");
    setNewBotPrompt("");
    setNewBotColor(randomHex());
    await refreshBots();
  }

  async function deleteBot(id: string) {
    setError(null);
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
      setError(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  // Enter the inline edit form for a specific bot. Seeds the edit fields
  // from the current bot values and clears any other layered UI so the
  // only open affordance is the one the user is working in.
  function startEditBot(bot: Bot) {
    disarmDelete();
    setExpandedBotKey(null);
    setColorWheelOpen(false);
    setEditColorWheelOpen(false);
    setEditBotName(bot.name);
    setEditBotPrompt(bot.system_prompt ?? "");
    setEditBotColor(bot.color?.trim() || randomHex());
    setEditingBotId(bot.id);
    setError(null);
  }

  function cancelEditBot() {
    setEditingBotId(null);
    setEditColorWheelOpen(false);
  }

  async function saveBot(id: string) {
    const trimmedName = editBotName.trim();
    if (!trimmedName) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/bots/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmedName,
          systemPrompt: editBotPrompt,
          color: editBotColor,
        }),
      });
      setEditingBotId(null);
      setEditColorWheelOpen(false);
      await refreshBots();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  // Shared handler for any color-wheel click → picks HSL from offset and
  // writes hex into the given setter (either the create form's color state
  // or the edit form's).
  const handleColorWheelClickForSetter = useCallback(
    (
      event: React.MouseEvent<HTMLDivElement>,
      setColor: (c: string) => void
    ) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const x = event.clientX - rect.left - cx;
      const y = event.clientY - rect.top - cy;
      const radius = Math.min(rect.width, rect.height) / 2;
      const distance = Math.sqrt(x * x + y * y);
      if (distance > radius) return;
      const hue = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      const saturation = Math.min(100, (distance / radius) * 100);
      setColor(hslToHex(hue, saturation, 50));
    },
    []
  );

  async function generateImg(e: React.FormEvent) {
    e.preventDefault(); if (!imagePrompt.trim()) return; setBusy(true); setError(null);
    try { await api("/api/images/generate", { method: "POST", body: JSON.stringify({ prompt: imagePrompt, conversationId: selectedId }) }); setImagePrompt(""); await refreshImages(); }
    catch (err) { setError(err instanceof Error ? err.message : "Image gen failed."); }
    finally { setBusy(false); }
  }

  // ── Auth screen ──
  if (!user) return (
    <main className={`${styles.authLayout} ${themeClass}`}>
      <div className={styles.card}>
        <div className={styles.brandLockup}>
          {/* Rendered as an <img> so the triangle glow filter can target the
              tinted artwork and not spill onto the wordmark strokes. */}
          <img
            src="/icon.jpg"
            alt=""
            aria-hidden="true"
            className={styles.brandIcon}
          />
          <img
            src="/wordmark.svg"
            alt="Prism"
            className={styles.brandWordmark}
          />
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

  // ── App shell ──
  return (
    <main className={`${styles.appLayout} ${themeClass}`} style={shellStyle}>
      {/* Mobile menu toggle */}
      <button type="button" className={styles.menuToggle} onClick={() => setSidebarOpen(o => !o)}>☰</button>
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

        <label className={styles.checkbox}>
          <input type="checkbox" checked={incognito} onChange={e => setIncognito(e.target.checked)} />
          Incognito mode
        </label>

        <span className={styles.sectionLabel}>Conversations</span>
        <ul className={styles.conversationList}>
          {conversations.map(c => {
            const isSelected = c.id === selectedId;
            const isArmed = pendingDeleteKey === c.id;
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
                {!isSelected && (
                  <button
                    type="button"
                    className={`${styles.conversationDelete} ${isArmed ? styles.conversationDeleteArmed : ""}`}
                    data-delete-affordance="true"
                    aria-label={isArmed ? `Confirm delete ${c.title}` : `Delete ${c.title}`}
                    title={isArmed ? undefined : "Delete chat"}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isArmed) {
                        void deleteConversation(c.id);
                      } else {
                        armDelete(c.id);
                      }
                    }}
                  >
                    {isArmed && (
                      <span className={styles.conversationDeletePrompt}>Are you sure?</span>
                    )}
                    <span className={styles.conversationDeleteGlyph}>{isArmed ? "✓" : "×"}</span>
                  </button>
                )}
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
          <h2>{detail?.title ?? "New conversation"}</h2>
          {incognito && <span className={styles.badge}>Incognito</span>}
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
            {detail && <button type="button" onClick={() => void forkChat()}>Fork</button>}
            {detail && <button type="button" onClick={() => void exportChat()}>Export .md</button>}
            {detail && selectedId && (() => {
              const armed = pendingDeleteKey === HEADER_DELETE_KEY;
              return (
                <button
                  type="button"
                  className={armed ? styles.headerDeleteArmed : styles.headerDelete}
                  data-delete-affordance="true"
                  onClick={() => {
                    if (armed) {
                      void deleteConversation(selectedId);
                    } else {
                      armDelete(HEADER_DELETE_KEY);
                    }
                  }}
                >
                  {armed ? "✓ Confirm" : "Delete"}
                </button>
              );
            })()}
          </div>
        </header>

        <div className={styles.messages}>
          {!detail && !pendingReply && (
            <div className={styles.emptyState}>
              <div className={styles.emptyStateIcon} aria-hidden="true">◈</div>
              <div className={styles.emptyStateTitle}>Start a new conversation</div>
              <p className={styles.emptyStateHint}>
                {incognito
                  ? "Incognito mode is on — this chat will stay off the record."
                  : selectedBotId
                    ? "You're chatting with a custom bot. Ask it anything."
                    : "Type a message below to begin. Memories, forks, and exports stay one click away."}
              </p>
            </div>
          )}
          {detail?.messages.map(msg => {
            const status = getMessageStatus(msg);
            // Push the bot's color into the assistant bubble itself so the
            // message owns the accent visually, leaving the header dots free
            // for HUMAN / LOCAL / ONLINE status only.
            const messageStyle =
              msg.role === "assistant" && msg.botColor
                ? ({ "--message-accent": msg.botColor } as React.CSSProperties)
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
                <p>{msg.content}</p>
                <div className={styles.messageActions}>
                  <button type="button" onClick={() => void forkChat(msg.id)}>Fork here</button>
                </div>
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
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {/* ── Bots panel ── */}
      {panel === "bots" && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}><h3>Bots</h3><button type="button" className={styles.panelClose} onClick={closePanel}>×</button></div>
          <form className={styles.form} onSubmit={createBot}>
            <div className={styles.botNameRow}>
              <div className={styles.colorPickerWrapper} data-color-affordance="true">
                <button
                  type="button"
                  className={styles.colorSwatchButton}
                  style={{ background: newBotColor }}
                  onClick={() => setColorWheelOpen(o => !o)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setNewBotColor(randomHex());
                  }}
                  aria-label="Bot color. Click to open the wheel, right-click for random."
                  aria-haspopup="dialog"
                  aria-expanded={colorWheelOpen}
                  title="Click to pick a color · right-click: random"
                />
                {colorWheelOpen && (() => {
                  // Indicator position tracks the current color so the user
                  // sees where on the wheel they are without a sliders UI.
                  const { h, s } = hexToHsl(newBotColor);
                  const rad = (h * Math.PI) / 180;
                  const r = s / 100;
                  const left = 50 + r * 50 * Math.cos(rad);
                  const top = 50 + r * 50 * Math.sin(rad);
                  return (
                    <div
                      className={styles.colorWheelPopover}
                      role="dialog"
                      aria-label="Bot color wheel"
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setNewBotColor(randomHex());
                      }}
                    >
                      <div
                        className={styles.colorWheel}
                        onClick={handleColorWheelClick}
                      >
                        <div
                          className={styles.colorWheelIndicator}
                          style={{ left: `${left}%`, top: `${top}%` }}
                          aria-hidden="true"
                        />
                      </div>
                      <p className={styles.colorWheelHint}>Click: pick · Right-click: random</p>
                    </div>
                  );
                })()}
              </div>
              <input required placeholder="Bot name" value={newBotName} onChange={e => setNewBotName(e.target.value)} />
            </div>
            <textarea placeholder="System prompt" value={newBotPrompt} onChange={e => setNewBotPrompt(e.target.value)} />
            <button type="submit">Create bot</button>
          </form>

          <h4 className={styles.sectionLabel}>Built-in</h4>
          <div
            className={`${styles.botCard} ${styles.botCardDefault}`}
            aria-label="Default bot: always available, cannot be deleted"
          >
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
            // Live color preview during editing so the accent bar reacts to
            // the wheel even before Save is clicked.
            const liveColor = isEditing ? editBotColor : b.color;
            const cardStyle = liveColor
              ? ({ "--bot-color": liveColor } as React.CSSProperties)
              : undefined;

            if (isEditing) {
              const { h, s } = hexToHsl(editBotColor);
              const rad = (h * Math.PI) / 180;
              const r = s / 100;
              const left = 50 + r * 50 * Math.cos(rad);
              const top = 50 + r * 50 * Math.sin(rad);
              return (
                <div key={b.id} className={`${styles.botCard} ${styles.botCardEditing}`} style={cardStyle}>
                  <form
                    className={styles.botCardEditForm}
                    onSubmit={(e) => {
                      e.preventDefault();
                      void saveBot(b.id);
                    }}
                  >
                    <div className={styles.botCardEditRow}>
                      <div className={styles.colorPickerWrapper} data-color-affordance="true">
                        <button
                          type="button"
                          className={styles.colorSwatchButton}
                          style={{ background: editBotColor }}
                          onClick={() => setEditColorWheelOpen(o => !o)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setEditBotColor(randomHex());
                          }}
                          aria-label="Bot color. Click to open the wheel, right-click for random."
                          aria-haspopup="dialog"
                          aria-expanded={editColorWheelOpen}
                          title="Click to pick a color · right-click: random"
                        />
                        {editColorWheelOpen && (
                          <div
                            className={styles.colorWheelPopover}
                            role="dialog"
                            aria-label="Bot color wheel"
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setEditBotColor(randomHex());
                            }}
                          >
                            <div
                              className={styles.colorWheel}
                              onClick={(e) => handleColorWheelClickForSetter(e, setEditBotColor)}
                            >
                              <div
                                className={styles.colorWheelIndicator}
                                style={{ left: `${left}%`, top: `${top}%` }}
                                aria-hidden="true"
                              />
                            </div>
                            <p className={styles.colorWheelHint}>Click: pick · Right-click: random</p>
                          </div>
                        )}
                      </div>
                      <input
                        required
                        placeholder="Bot name"
                        value={editBotName}
                        onChange={(e) => setEditBotName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <textarea
                      placeholder="System prompt"
                      value={editBotPrompt}
                      onChange={(e) => setEditBotPrompt(e.target.value)}
                      rows={3}
                    />
                    <div className={styles.botCardEditActions}>
                      <button type="button" onClick={cancelEditBot} disabled={busy}>
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className={styles.botCardEditSave}
                        disabled={busy || !editBotName.trim()}
                      >
                        Save
                      </button>
                    </div>
                  </form>
                </div>
              );
            }

            return (
              <div key={b.id} className={styles.botCard} style={cardStyle}>
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
            {error && <p className={styles.error}>{error}</p>}
          </div>
        );
      })()}
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
