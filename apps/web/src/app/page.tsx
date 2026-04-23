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

const THEME_ICON: Record<Theme, string> = {
  light: "☀",
  dark: "☾",
  system: "◐",
};

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
  // Shared close helper for the right-hand panels. Also resets panel-specific
  // transient UI so reopening a panel doesn't resurrect stale state.
  const closePanel = useCallback(() => {
    setPanel(null);
    setColorWheelOpen(false);
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

  const resolvedTheme = useMemo<"light" | "dark">(() => {
    if (settings?.theme === "system") return systemTheme;
    return settings?.theme ?? "dark";
  }, [settings?.theme, systemTheme]);

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
    const color = selectedBot?.color?.trim();
    if (!color) return undefined;
    // Pair --accent with an --accent-text that stays legible on it: if the
    // chosen color is a light pastel, CTAs flip their text to near-black so
    // the "white-on-color" pattern doesn't wash out.
    const { l } = hexToHsl(color);
    const accentText = l > 65 ? "#0b0b0d" : "#ffffff";
    return {
      ["--accent" as string]: color,
      ["--accent-text" as string]: accentText,
    } as React.CSSProperties;
  }, [bots, selectedBotId]);

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
      if (authMode === "register") await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, displayName }) });
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
    if (!settings) return;
    const previous = settings;
    const nextTheme = nextThemeMode(settings.theme);
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

  // Close the color wheel popover on any outside click or Escape.
  useEffect(() => {
    if (!colorWheelOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof HTMLElement &&
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

  async function generateImg(e: React.FormEvent) {
    e.preventDefault(); if (!imagePrompt.trim()) return; setBusy(true); setError(null);
    try { await api("/api/images/generate", { method: "POST", body: JSON.stringify({ prompt: imagePrompt, conversationId: selectedId }) }); setImagePrompt(""); await refreshImages(); }
    catch (err) { setError(err instanceof Error ? err.message : "Image gen failed."); }
    finally { setBusy(false); }
  }

  // ── Auth screen ──
  if (!user) return (
    <main className={`${styles.authLayout} ${styles.themeDark}`}>
      <div className={styles.card}>
        <h1 className={styles.wordmark}>
          <span className={styles.wordmarkText}>Prism</span>
        </h1>
        <p className={styles.muted}>Local-first AI playground. ChatGPT Gov fidelity, FL Studio creativity.</p>
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

        <div className={styles.sidebarField}>
          <span className={styles.sectionLabel}>Bot</span>
          <select
            className={styles.sidebarSelect}
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
                settings?.theme === "system"
                  ? `Theme: Auto, currently ${THEME_LABEL[resolvedTheme]}. Click to switch to ${THEME_LABEL[nextThemeMode(settings.theme)]}.`
                  : `Theme: ${THEME_LABEL[settings?.theme ?? "dark"]}. Click to switch to ${THEME_LABEL[nextThemeMode(settings?.theme ?? "dark")]}.`
              }
              title={
                settings?.theme === "system"
                  ? `Theme: Auto (${THEME_LABEL[resolvedTheme]})`
                  : `Theme: ${THEME_LABEL[settings?.theme ?? "dark"]}`
              }
              disabled={!settings}
            >
              <span aria-hidden="true">{THEME_ICON[settings?.theme ?? "dark"]}</span>
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
            {(() => {
              const isLocal = settings?.preferredProvider === "local";
              const providerLocked = settings?.providerLocked ?? false;
              return (
                <div className={styles.modeControl}>
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
                      className={styles.modeLockGlyph}
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <rect x="3.5" y="7" width="9" height="6" rx="1.4" />
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
            // Pass the bot's color through a CSS custom property so the
            // ::before accent bar on .botCard picks it up without inline
            // styling on the pseudo-element.
            const cardStyle = b.color
              ? ({ "--bot-color": b.color } as React.CSSProperties)
              : undefined;
            return (
              <div key={b.id} className={styles.botCard} style={cardStyle}>
                <div className={styles.botCardBody}>
                  <strong>{b.name}</strong>
                  <small>{b.system_prompt ? b.system_prompt.slice(0, 80) + "..." : "No system prompt"}</small>
                </div>
                <button
                  type="button"
                  className={`${styles.botCardDelete} ${isArmed ? styles.botCardDeleteArmed : ""}`}
                  data-delete-affordance="true"
                  aria-label={isArmed ? `Confirm delete ${b.name}` : `Delete ${b.name}`}
                  title={isArmed ? undefined : "Delete bot"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isArmed) {
                      void deleteBot(b.id);
                    } else {
                      armDelete(botKey);
                    }
                  }}
                >
                  {isArmed && (
                    <span className={styles.conversationDeletePrompt}>Are you sure?</span>
                  )}
                  <span className={styles.conversationDeleteGlyph}>{isArmed ? "✓" : "×"}</span>
                </button>
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
