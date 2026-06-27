/**
 * Prism web composer commands: lines starting with `/dev` are intercepted
 * client-side only (never POSTed to `/api/chat`).
 */

import { prismWebDevChatCommandsEnabled } from "./prismDevGating.ts";

/** True in development/non-main builds, or when explicitly opted in off main. */
export const PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED = prismWebDevChatCommandsEnabled({
  NODE_ENV: process.env.NODE_ENV,
  NEXT_PUBLIC_PRISM_BRANCH: process.env.NEXT_PUBLIC_PRISM_BRANCH,
  NEXT_PUBLIC_PRISM_DEV_COMMANDS: process.env.NEXT_PUBLIC_PRISM_DEV_COMMANDS,
});

export function isPrismDevChatCommandLine(line: string): boolean {
  if (!PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED) return false;
  return looksLikePrismDevComposerCommand(line);
}

export function normalizeComposerSlashCommandLine(line: string): string {
  const leadingWhitespaceLength = line.length - line.trimStart().length;
  const leadingWhitespace = line.slice(0, leadingWhitespaceLength);
  const rest = line.slice(leadingWhitespaceLength);
  return `${leadingWhitespace}${rest.replace(/^\\+(?=\/)/, "")}`;
}

/** True for `/dev` + space or EOS — ignores the env toggle (caller decides how to react). */
export function looksLikePrismDevComposerCommand(line: string): boolean {
  const t = normalizeComposerSlashCommandLine(line).trimStart();
  return /^\/dev(?:\s|$)/i.test(t);
}

export type ParsedPrismDevChatCommand =
  | { kind: "help" }
  | { kind: "panel" }
  | { kind: "close" }
  | { kind: "toggles" }
  | { kind: "askquestion" }
  | { kind: "unknown"; token: string };

export type PrismDevPanelToggleAction = "open-panel" | "close-layer";

export interface PrismDevPanelToggleState {
  devToolsUnlocked: boolean;
  devToolsOpen: boolean;
  devToolsMinimized: boolean;
}

export function resolvePrismDevPanelToggleAction({
  devToolsUnlocked,
  devToolsOpen,
  devToolsMinimized,
}: PrismDevPanelToggleState): PrismDevPanelToggleAction {
  return devToolsUnlocked && devToolsOpen && !devToolsMinimized
    ? "close-layer"
    : "open-panel";
}

export function parsePrismDevChatCommand(trimmedLine: string): ParsedPrismDevChatCommand | null {
  if (!PRISM_WEB_DEV_CHAT_COMMANDS_ENABLED) return null;
  const t = normalizeComposerSlashCommandLine(trimmedLine).trimStart();
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
