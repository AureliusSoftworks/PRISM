export const PSYCHIC_COMMAND_NAME = "psychic";
export const PSYCHIC_SLASH_COMMAND = `/${PSYCHIC_COMMAND_NAME}`;
export const PSYCHIC_COMMAND_EXTRA_TEXT_ERROR =
  "/psychic does not take extra text. Use it by itself.";

export type PsychicSlashCommandParseResult =
  | { kind: "none" }
  | { kind: "ok" }
  | { kind: "error"; error: string };

export function parsePsychicSlashCommand(line: string): PsychicSlashCommandParseResult {
  const tokens = line
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if ((tokens[0] ?? "").toLowerCase() !== PSYCHIC_SLASH_COMMAND) {
    return { kind: "none" };
  }
  if (tokens.length > 1) {
    return { kind: "error", error: PSYCHIC_COMMAND_EXTRA_TEXT_ERROR };
  }
  return { kind: "ok" };
}
