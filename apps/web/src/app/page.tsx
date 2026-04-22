"use client";

import { Suspense, useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./page.module.css";

type Provider = "local" | "openai";
type Theme = "dark" | "light";
type PanelView = null | "settings" | "bots" | "images";

interface SessionUser { id: string; email: string; displayName: string; theme: Theme; preferredProvider: Provider; }
interface ConversationSummary { id: string; title: string; updatedAt: string; }
interface Message { id: string; role: "user" | "assistant"; content: string; createdAt: string; }
interface ConversationDetail { id: string; title: string; messages: Message[]; }
interface UserSettings { theme: Theme; preferredProvider: Provider; autoMemory: boolean; autoSwitchModel: boolean; hasOpenAiApiKey: boolean; }
interface UserMemory { id: string; confidence: number; text: string; }
interface Bot { id: string; name: string; system_prompt: string; model: string | null; temperature: number; max_tokens: number; }
interface ImageRecord { id: string; prompt: string; url: string; created_at: string; }

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  const payload = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || payload.ok === false) throw new Error(payload.error ?? `Request failed (${res.status})`);
  return payload;
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

  const themeClass = useMemo(() => settings?.theme === "light" ? styles.themeLight : styles.themeDark, [settings?.theme]);

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

  async function createBot(e: React.FormEvent) {
    e.preventDefault(); if (!newBotName.trim()) return;
    await api("/api/bots", { method: "POST", body: JSON.stringify({ name: newBotName, systemPrompt: newBotPrompt }) });
    setNewBotName(""); setNewBotPrompt(""); await refreshBots();
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
        <h1>ChatGPT Gov @ Home</h1>
        <p className={styles.muted}>Local-first multi-user AI chat with encrypted memory.</p>
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
    <main className={`${styles.appLayout} ${themeClass}`}>
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
          <span className={styles.sectionLabel}>Provider</span>
          <select
            className={styles.sidebarSelect}
            value={settings?.preferredProvider ?? "local"}
            onChange={e => void switchProvider(e.target.value as Provider)}
            disabled={!settings}
          >
            <option value="local">Ollama (local)</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>

        <div className={styles.sidebarField}>
          <span className={styles.sectionLabel}>Bot</span>
          <select className={styles.sidebarSelect} value={selectedBotId ?? ""} onChange={e => setSelectedBotId(e.target.value || null)}>
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
          {conversations.map(c => (
            <li key={c.id}><button type="button" className={c.id === selectedId ? styles.selected : ""} onClick={() => { void refreshConversation(c.id); setSidebarOpen(false); }}>{c.title}</button></li>
          ))}
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
            {detail && <button type="button" onClick={() => void forkChat()}>Fork</button>}
            {detail && <button type="button" onClick={() => void exportChat()}>Export .md</button>}
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
          {detail?.messages.map(msg => (
            <article key={msg.id} className={`${styles.message} ${msg.role === "user" ? styles.messageUser : styles.messageAssistant}`}>
              <h4>{msg.role === "assistant" ? "Assistant" : "You"}</h4>
              <p>{msg.content}</p>
              <div className={styles.messageActions}>
                <button type="button" onClick={() => void forkChat(msg.id)}>Fork here</button>
              </div>
            </article>
          ))}
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
        </div>

        <form className={styles.compose} onSubmit={sendMessage}>
          {error && <p className={`${styles.error} ${styles.composeError}`} role="alert">{error}</p>}
          <div className={styles.composeInner}>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} placeholder="Ask anything..." onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(e); } }} />
            <button type="submit" disabled={pendingReply || !draft.trim()}>Send</button>
          </div>
        </form>
      </section>

      {/* ── Settings panel ── */}
      {panel === "settings" && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}><h3>Settings</h3><button type="button" className={styles.panelClose} onClick={() => setPanel(null)}>×</button></div>
          {settings && (
            <form className={styles.form} onSubmit={saveSettings}>
              <label>Theme<select value={settings.theme} onChange={e => setSettings(p => p ? { ...p, theme: e.target.value as Theme } : p)}><option value="dark">Dark</option><option value="light">Light</option></select></label>
              <label>Provider<select value={settings.preferredProvider} onChange={e => setSettings(p => p ? { ...p, preferredProvider: e.target.value as Provider } : p)}><option value="local">Local</option><option value="openai">OpenAI</option></select></label>
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
              <label className={styles.checkbox}><input type="checkbox" checked={settings.autoSwitchModel} onChange={e => setSettings(p => p ? { ...p, autoSwitchModel: e.target.checked } : p)} />Auto model switch</label>
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
          <div className={styles.panelHeader}><h3>Bots</h3><button type="button" className={styles.panelClose} onClick={() => setPanel(null)}>×</button></div>
          <form className={styles.form} onSubmit={createBot}>
            <input required placeholder="Bot name" value={newBotName} onChange={e => setNewBotName(e.target.value)} />
            <textarea placeholder="System prompt" value={newBotPrompt} onChange={e => setNewBotPrompt(e.target.value)} />
            <button type="submit">Create bot</button>
          </form>
          {bots.length > 0 && <h4 className={styles.sectionLabel}>Your bots</h4>}
          {bots.map(b => (
            <div key={b.id} className={styles.botCard}>
              <strong>{b.name}</strong>
              <small>{b.system_prompt ? b.system_prompt.slice(0, 80) + "..." : "No system prompt"}</small>
            </div>
          ))}
        </div>
      )}

      {/* ── Images panel ── */}
      {panel === "images" && (
        <div className={styles.panel}>
          <div className={styles.panelHeader}><h3>Images</h3><button type="button" className={styles.panelClose} onClick={() => setPanel(null)}>×</button></div>
          <form className={styles.form} onSubmit={generateImg}>
            <input required placeholder="Describe an image..." value={imagePrompt} onChange={e => setImagePrompt(e.target.value)} />
            <button type="submit" disabled={busy}>{busy ? "Generating..." : "Generate"}</button>
          </form>
          {images.length > 0 && <h4 className={styles.sectionLabel}>Recent</h4>}
          <div className={styles.imageGrid}>
            {images.map(img => (
              <a key={img.id} href={img.url} target="_blank" rel="noreferrer"><img src={img.url} alt={img.prompt} /></a>
            ))}
          </div>
          {error && <p className={styles.error}>{error}</p>}
        </div>
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
