export interface PromptShortcutFlag {
  key: string;
  value: string;
}

export interface PromptShortcutWildcardReplacement {
  key: string;
  value: string;
  start?: number;
  end?: number;
}

export interface PromptShortcutMetadata {
  v: 1;
  commandId: string;
  name: string;
  invocation: string;
  flags: PromptShortcutFlag[];
  passthrough?: string;
  resolvedPrompt?: string;
  wildcardReplacements?: PromptShortcutWildcardReplacement[];
}

function readPromptShortcutString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function readPromptShortcutRange(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const normalized = Math.floor(value);
  return normalized >= 0 && normalized <= 20000 ? normalized : undefined;
}

export function normalizePromptShortcutMetadata(value: unknown): PromptShortcutMetadata | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  const commandId = readPromptShortcutString(row.commandId, 160);
  const name = readPromptShortcutString(row.name, 96).replace(/^\/+/, "");
  const invocation = readPromptShortcutString(row.invocation, 2000);
  if (!commandId || !name || !invocation) return undefined;
  const flags = Array.isArray(row.flags)
    ? row.flags
        .map((flag): PromptShortcutFlag | null => {
          if (!flag || typeof flag !== "object") return null;
          const flagRow = flag as Record<string, unknown>;
          const key = readPromptShortcutString(flagRow.key, 64).replace(/^[-/]+/, "");
          const flagValue = readPromptShortcutString(flagRow.value, 1000);
          return key && flagValue ? { key, value: flagValue } : null;
        })
        .filter((flag): flag is PromptShortcutFlag => Boolean(flag))
        .slice(0, 20)
    : [];
  const wildcardReplacements = Array.isArray(row.wildcardReplacements)
    ? row.wildcardReplacements
        .map((replacement): PromptShortcutWildcardReplacement | null => {
          if (!replacement || typeof replacement !== "object") return null;
          const replacementRow = replacement as Record<string, unknown>;
          const key = readPromptShortcutString(replacementRow.key, 64)
            .replace(/[{}]/g, "")
            .toUpperCase();
          const replacementValue = readPromptShortcutString(replacementRow.value, 1000);
          if (!key || !replacementValue) return null;
          const start = readPromptShortcutRange(replacementRow.start);
          const end = readPromptShortcutRange(replacementRow.end);
          const hasValidRange = start !== undefined && end !== undefined && end > start;
          return {
            key,
            value: replacementValue,
            ...(hasValidRange ? { start, end } : {}),
          };
        })
        .filter(
          (replacement): replacement is PromptShortcutWildcardReplacement =>
            Boolean(replacement)
        )
        .slice(0, 80)
    : [];
  const passthrough = readPromptShortcutString(row.passthrough, 2000);
  const resolvedPrompt = readPromptShortcutString(row.resolvedPrompt, 20000);
  return {
    v: 1,
    commandId,
    name,
    invocation,
    flags,
    ...(passthrough ? { passthrough } : {}),
    ...(resolvedPrompt ? { resolvedPrompt } : {}),
    ...(wildcardReplacements.length > 0 ? { wildcardReplacements } : {}),
  };
}

export function parseStoredPromptShortcutPayload(
  raw: string | null | undefined
): PromptShortcutMetadata | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const row = parsed as Record<string, unknown>;
    return normalizePromptShortcutMetadata(row.promptShortcut ?? parsed);
  } catch {
    return undefined;
  }
}

export function withPromptShortcutResolvedPrompt(
  promptShortcut: PromptShortcutMetadata | undefined,
  resolvedPrompt: unknown
): PromptShortcutMetadata | undefined {
  const normalized = normalizePromptShortcutMetadata(promptShortcut);
  if (!normalized) return undefined;
  const prompt = readPromptShortcutString(resolvedPrompt, 20000);
  return prompt ? { ...normalized, resolvedPrompt: prompt } : normalized;
}

export function serializePromptShortcutPayload(
  promptShortcut: PromptShortcutMetadata | undefined
): string | null {
  const normalized = normalizePromptShortcutMetadata(promptShortcut);
  return normalized ? JSON.stringify({ v: 1 as const, promptShortcut: normalized }) : null;
}
