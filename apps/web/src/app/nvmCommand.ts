export const NVM_COMMAND_NAME = "nvm";
export const NVM_SLASH_COMMAND = `/${NVM_COMMAND_NAME}`;
export const NVM_COMMAND_EXTRA_TEXT_ERROR =
  "/nvm does not take extra text. Use it by itself.";

export type NvmSlashCommandParseResult =
  | { kind: "none" }
  | { kind: "ok" }
  | { kind: "error"; error: string };

export function parseNvmSlashCommand(line: string): NvmSlashCommandParseResult {
  const tokens = line
    .trim()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  if ((tokens[0] ?? "").toLowerCase() !== NVM_SLASH_COMMAND) {
    return { kind: "none" };
  }
  if (tokens.length > 1) {
    return { kind: "error", error: NVM_COMMAND_EXTRA_TEXT_ERROR };
  }
  return { kind: "ok" };
}
