/**
 * Prism web composer commands: lines starting with `/dev` are intercepted
 * client-side only (never POSTed to `/api/chat`).
 */

/** True in `next dev` / non-production builds, or when explicitly opted in via env. */
export const PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED =
  process.env.NODE_ENV !== "production" ||
  (typeof process.env.NEXT_PUBLIC_PRISM_DEV_COMMANDS === "string" &&
    (process.env.NEXT_PUBLIC_PRISM_DEV_COMMANDS === "1" ||
      process.env.NEXT_PUBLIC_PRISM_DEV_COMMANDS.toLowerCase() === "true"));

export function isPrismDevChatCommandLine(line: string): boolean {
  if (!PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED) return false;
  return looksLikePrismDevComposerCommand(line);
}

/** True for `/dev` + space or EOS — ignores the env toggle (caller decides how to react). */
export function looksLikePrismDevComposerCommand(line: string): boolean {
  const t = line.trimStart();
  return /^\/dev(?:\s|$)/i.test(t);
}

export type ParsedPrismDevChatCommand =
  | { kind: "help" }
  | { kind: "panel" }
  | { kind: "close" }
  | { kind: "toggles" }
  | { kind: "askquestion" }
  | { kind: "unknown"; token: string };

export function parsePrismDevChatCommand(trimmedLine: string): ParsedPrismDevChatCommand | null {
  if (!PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED) return null;
  const t = trimmedLine.trimStart();
  if (!/^\/dev(?:\s|$)/i.test(t)) return null;
  const rest = t.slice(4).trim();
  if (rest.length === 0) return { kind: "panel" };
  const head = rest.split(/\s+/)[0]!;
  const token = head.toLowerCase();
  if (token === "help" || token === "?") return { kind: "help" };
  if (token === "panel" || token === "open" || token === "tools") return { kind: "panel" };
  if (token === "close" || token === "hide") return { kind: "close" };
  if (token === "toggles" || token === "toggle" || token === "settings") return { kind: "toggles" };
  if (token === "askquestion" || token === "ask-q" || token === "aq") return { kind: "askquestion" };
  return { kind: "unknown", token: head.slice(0, 48) };
}
