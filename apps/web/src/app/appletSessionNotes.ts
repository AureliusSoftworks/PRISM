export const APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS = 1_000;
export const APPLET_SESSION_NOTE_MAX_CHARACTERS = 20_000;

export type AppletSessionNoteSurface =
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export interface AppletSessionNoteV1 {
  v: 1;
  surface: AppletSessionNoteSurface;
  sessionId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppletSessionNoteContext {
  surface: AppletSessionNoteSurface;
  sessionId: string;
}

export interface AppletSessionNoteResponse {
  ok: true;
  note: AppletSessionNoteV1 | null;
}

export function appletSessionNoteRequestPath(
  context: AppletSessionNoteContext,
): string {
  return `/api/session-notes?surface=${encodeURIComponent(context.surface)}&sessionId=${encodeURIComponent(context.sessionId)}`;
}

function stripAppletSessionNoteListMarker(value: string): string {
  return value.replace(/^(?:[-*+•]\s+|\d+[.)]\s+)/u, "").trim();
}

export function sentenceCaseAppletSessionNoteEntry(value: string): string {
  let normalized = stripAppletSessionNoteListMarker(
    value.trim().replace(/\s+/gu, " "),
  );
  if (!normalized) return "";
  normalized = normalized.replace(/\p{L}/u, (letter) =>
    letter.toLocaleUpperCase(),
  );
  normalized = normalized.replace(
    /([.!?…]\s+["'“‘(]*)(\p{L})/gu,
    (_match, boundary: string, letter: string) =>
      `${boundary}${letter.toLocaleUpperCase()}`,
  );
  if (
    normalized.length < APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS &&
    !/[.!?…]["'”’)}\]]*$/u.test(normalized)
  ) {
    normalized = `${normalized}.`;
  }
  return normalized;
}

function appletSessionNoteEntries(body: string): string[] {
  const lines = body
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const alreadyCollected = lines.every((line) =>
    /^(?:[-*+•]\s+|\d+[.)]\s+)/u.test(line),
  );
  return alreadyCollected ? lines : [body];
}

function comparableAppletSessionNoteTokens(value: string): string[] {
  return (
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

function appletSessionNoteTokenSequenceStarts(
  haystack: string[],
  needle: string[],
): number[] {
  if (needle.length === 0 || needle.length > haystack.length) return [];
  const starts: number[] = [];
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) {
      starts.push(start);
    }
  }
  return starts;
}

function collapseRedundantAppletSessionNoteEntries(
  entries: string[],
): string[] {
  const tokenized = entries.map(comparableAppletSessionNoteTokens);
  const redundant = new Set<number>();

  tokenized.forEach((tokens, index) => {
    if (
      tokens.length > 0 &&
      tokenized.some(
        (candidate, candidateIndex) =>
          candidateIndex < index &&
          candidate.length === tokens.length &&
          candidate.every((token, offset) => token === tokens[offset]),
      )
    ) {
      redundant.add(index);
    }
  });

  tokenized.forEach((candidate, candidateIndex) => {
    if (candidate.length === 0) return;
    const coverage = candidate.map(() => false);
    const containedEntries: number[] = [];

    tokenized.forEach((tokens, index) => {
      if (
        index === candidateIndex ||
        redundant.has(index) ||
        tokens.length === 0 ||
        tokens.length >= candidate.length
      ) {
        return;
      }
      const starts = appletSessionNoteTokenSequenceStarts(candidate, tokens);
      if (starts.length === 0) return;
      containedEntries.push(index);
      starts.forEach((start) => {
        for (let offset = 0; offset < tokens.length; offset += 1) {
          coverage[start + offset] = true;
        }
      });
    });

    if (containedEntries.length >= 2 && coverage.every(Boolean)) {
      containedEntries.forEach((index) => redundant.add(index));
    }
  });

  return entries.filter((_entry, index) => !redundant.has(index));
}

export function formatAppletSessionNoteCollectionBody(body: string): string {
  return collapseRedundantAppletSessionNoteEntries(
    appletSessionNoteEntries(body)
      .map(sentenceCaseAppletSessionNoteEntry)
      .filter(Boolean),
  )
    .map((entry) => `- ${entry}`)
    .join("\n");
}

export function appendAppletSessionNoteToTranscript(
  transcript: string,
  note: AppletSessionNoteV1 | string | null | undefined,
): string {
  const rawBody = typeof note === "string" ? note : note?.body ?? "";
  const body = formatAppletSessionNoteCollectionBody(rawBody);
  const normalizedTranscript = transcript.trimEnd();
  if (!body) return normalizedTranscript;
  return `${normalizedTranscript}\n\n## Session notes\n\n${body}\n`;
}
