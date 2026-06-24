export type UndoSlashCommandParseResult =
  | { kind: "none" }
  | { kind: "error"; error: string }
  | { kind: "ok"; count: 1 | 2 };

export function parseUndoSlashCommand(trimmedLine: string): UndoSlashCommandParseResult {
  const tokens = trimmedLine
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const normalizedCommand = tokens[0]?.toLowerCase() ?? "";
  if (normalizedCommand !== "/undo" && normalizedCommand !== "/undo-turn") {
    return { kind: "none" };
  }
  if (normalizedCommand === "/undo-turn") {
    if (tokens.length > 1) {
      return { kind: "error", error: "Use /undo-turn by itself, or /undo 2." };
    }
    return { kind: "ok", count: 2 };
  }
  if (tokens.length === 1) return { kind: "ok", count: 1 };
  if (tokens.length === 2 && tokens[1] === "2") return { kind: "ok", count: 2 };
  return { kind: "error", error: "Use /undo, /undo 2, or /undo-turn." };
}
