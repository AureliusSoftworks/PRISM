export {
  ACCENT_LIGHTNESS_MAX,
  ACCENT_LIGHTNESS_MAX_DARK,
  ACCENT_LIGHTNESS_MIN,
  ACCENT_LIGHTNESS_MIN_DARK,
  accentLightnessBand,
  clampAccentLightness,
  clampLuminance,
  contrastRatio,
  ensureContrast,
  hexToHsl,
  hslToHex,
  pickReadableText,
  relativeLuminance,
  swatchBorderCompensation,
} from "./color.js";

export type UserRole = "user";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  theme: "light" | "dark" | "system";
  preferredProvider: "local" | "openai";
}

export interface AuthSession {
  userId: string;
  token: string;
  expiresAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  /** Provider that generated the message (assistant only; undefined for user/system). */
  provider?: "local" | "openai";
  /** Bot that generated the message (assistant only). Resolved from bots.name at read time. */
  botName?: string;
  /** Bot's associated accent color (CSS color string). Resolved from bots.color at read time. */
  botColor?: string;
  /** Bot's associated glyph identifier (opaque key looked up in the client's glyph registry). */
  botGlyph?: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface UserMemory {
  id: string;
  userId: string;
  createdAt: string;
  confidence: number;
  text: string;
}

/**
 * Post-auth surface the user is chatting from.
 *
 * - `"chat"`: the calm, stripped-down personal Prism. Honors auto-memory and
 *   per-send `incognito` (where incognito forces the provider to LOCAL).
 * - `"sandbox"`: the full command-center. Cross-session memory is disabled
 *   entirely here — the rolling message window IS the thread's memory. The
 *   `incognito` flag is ignored for Sandbox requests.
 *
 * Defaults to `"sandbox"` on the server when omitted, so pre-`mode` clients
 * keep the previous cross-session memory behavior.
 */
export type ChatMode = "chat" | "sandbox";

export interface ChatRequestPayload {
  conversationId?: string;
  message: string;
  mode?: ChatMode;
}

export interface ChatResponsePayload {
  conversation: Conversation;
  assistantMessage: ChatMessage;
}
