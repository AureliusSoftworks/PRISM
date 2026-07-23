export interface ComposerActionParts {
  action: string;
  message: string;
}

const LEADING_COMPOSER_ACTION = /^\*([^*\n]+)\*(?:[ \t]+|\n)?/u;

/** Keeps the established `*action*` wire format out of the visible speech box. */
export function splitComposerAction(value: string): ComposerActionParts {
  const match = value.match(LEADING_COMPOSER_ACTION);
  if (!match) return { action: "", message: value };
  return {
    action: normalizeComposerAction(match[1] ?? ""),
    message: value.slice(match[0].length),
  };
}

export function normalizeComposerAction(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s/gu, " ")
    .replace(/[^\p{L}\p{M} ]/gu, "")
    .replace(/ +/gu, " ")
    .trimStart();
}

/** Serializes action and speech through the canonical text all existing parsers consume. */
export function serializeComposerAction(
  action: string,
  message: string,
): string {
  const normalizedAction = normalizeComposerAction(action).trimEnd();
  if (!normalizedAction) return message;
  return message ? `*${normalizedAction}* ${message}` : `*${normalizedAction}*`;
}

/** Preserve one trailing space while the controlled Action field is being edited. */
export function serializeComposerActionDraft(
  action: string,
  message: string,
): string {
  const normalizedAction = normalizeComposerAction(action);
  if (!normalizedAction) return message;
  return message ? `*${normalizedAction}* ${message}` : `*${normalizedAction}*`;
}

export function composerMainValueActivatesActionInput(value: string): boolean {
  return value === "**";
}

/** Returns the submitted action only when the speech field is empty. */
export function composerActionOnlySubmission(value: string): string | null {
  const parts = splitComposerAction(value);
  const action = parts.action.trim();
  return action && !parts.message.trim() ? action : null;
}
