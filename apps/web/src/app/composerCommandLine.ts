/** Removes editor escape slashes while preserving leading composer whitespace. */
export function normalizeComposerSlashCommandLine(line: string): string {
  const leadingWhitespaceLength = line.length - line.trimStart().length;
  const leadingWhitespace = line.slice(0, leadingWhitespaceLength);
  const rest = line.slice(leadingWhitespaceLength);
  return `${leadingWhitespace}${rest.replace(/^\\+(?=[/$])/, "")}`;
}
