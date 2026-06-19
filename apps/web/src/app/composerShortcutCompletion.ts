export interface ComposerShortcutCompletionCandidate {
  name: string;
  aliases: readonly string[];
}

export interface ComposerShortcutCompletionToken {
  query: string;
}

export function normalizeComposerShortcutQuery(value: string): string {
  return value.trim().replace(/^\/+/, "").toLowerCase();
}

export function composerShortcutQueryExactlyMatchesCommand(
  query: string,
  command: ComposerShortcutCompletionCandidate
): boolean {
  const normalizedQuery = normalizeComposerShortcutQuery(query);
  if (!normalizedQuery) return false;
  return [command.name, ...command.aliases].some(
    (name) => normalizeComposerShortcutQuery(name) === normalizedQuery
  );
}

export function composerShortcutTokenExactlyMatchesAnyCommand(
  token: ComposerShortcutCompletionToken | null,
  commands: readonly ComposerShortcutCompletionCandidate[]
): boolean {
  if (!token) return false;
  return commands.some((command) =>
    composerShortcutQueryExactlyMatchesCommand(token.query, command)
  );
}
