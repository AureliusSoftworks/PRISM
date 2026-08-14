export const APPLET_SESSION_NOTE_ENTRY_MAX_CHARACTERS = 1_000;
export const APPLET_SESSION_NOTE_MAX_CHARACTERS = 20_000;

export type AppletSessionNoteSurface =
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export interface AppletSessionNoteCaptureV1 {
  body: string;
  /** The first keystroke in the fresh session-note composer. */
  startedAt: string;
  /** Live rendered frame rate at that first keystroke. */
  fps?: number;
  /** The later moment the note was committed. */
  committedAt: string;
}

export interface AppletTranscriptFrameSampleV1 {
  entryId: string;
  fps: number;
  capturedAt: string;
}

export interface AppletSessionNoteV1 {
  v: 1;
  surface: AppletSessionNoteSurface;
  sessionId: string;
  body: string;
  captures: AppletSessionNoteCaptureV1[];
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
  frameSamples?: AppletTranscriptFrameSampleV1[];
}

const APPLET_SESSION_NOTE_SAVED_EVENT = "prism:applet-session-note-saved";

export function publishAppletSessionNoteSaved(
  note: AppletSessionNoteV1,
): void {
  window.dispatchEvent(
    new CustomEvent<AppletSessionNoteV1>(APPLET_SESSION_NOTE_SAVED_EVENT, {
      detail: note,
    }),
  );
}

export function subscribeAppletSessionNoteSaved(
  listener: (note: AppletSessionNoteV1) => void,
): () => void {
  const handleSavedNote = (event: Event): void => {
    listener((event as CustomEvent<AppletSessionNoteV1>).detail);
  };
  window.addEventListener(APPLET_SESSION_NOTE_SAVED_EVENT, handleSavedNote);
  return () =>
    window.removeEventListener(APPLET_SESSION_NOTE_SAVED_EVENT, handleSavedNote);
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
  const captures =
    typeof note === "object" && note !== null
      ? normalizedAppletSessionNoteCaptures(note.captures)
      : [];
  const annotatedTranscript = insertAppletSessionNoteCaptures(
    normalizedTranscript,
    captures,
  );
  return `${annotatedTranscript}\n\n## Session notes\n\n${body}\n`;
}

const APPLET_SESSION_NOTE_ISO_TIMESTAMP =
  /^\s*-\s*(?:Recorded|At|Created|Started|Updated|Completed):\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)/u;

interface TranscriptTimestampAnchor {
  lineIndex: number;
  timestampMs: number;
}

function normalizedAppletSessionNoteCaptures(
  captures: readonly AppletSessionNoteCaptureV1[] | undefined,
): AppletSessionNoteCaptureV1[] {
  if (!Array.isArray(captures)) return [];
  return captures
    .flatMap((capture) => {
      const body = sentenceCaseAppletSessionNoteEntry(capture?.body ?? "");
      const startedAtMs = Date.parse(capture?.startedAt ?? "");
      const committedAtMs = Date.parse(capture?.committedAt ?? "");
      const fps =
        typeof capture?.fps === "number" && Number.isFinite(capture.fps)
          ? Math.max(1, Math.min(240, Math.round(capture.fps)))
          : undefined;
      return body && Number.isFinite(startedAtMs) && Number.isFinite(committedAtMs)
        ? [
            {
              body,
              startedAt: new Date(startedAtMs).toISOString(),
              ...(fps === undefined ? {} : { fps }),
              committedAt: new Date(committedAtMs).toISOString(),
            },
          ]
        : [];
    })
    .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function transcriptTimestampAnchors(lines: readonly string[]): TranscriptTimestampAnchor[] {
  return lines.flatMap((line, lineIndex) => {
    const timestamp = line.match(APPLET_SESSION_NOTE_ISO_TIMESTAMP)?.[1];
    if (!timestamp) return [];
    const timestampMs = Date.parse(timestamp);
    return Number.isFinite(timestampMs) ? [{ lineIndex, timestampMs }] : [];
  });
}

function noteInsertionLine(
  lines: readonly string[],
  timestampLineIndex: number,
): number {
  for (let index = timestampLineIndex + 1; index < lines.length; index += 1) {
    if (/^#{2,3}\s/u.test(lines[index] ?? "")) {
      let insertionLine = index;
      while (insertionLine > timestampLineIndex + 1 && !lines[insertionLine - 1]?.trim()) {
        insertionLine -= 1;
      }
      return insertionLine;
    }
  }
  return lines.length;
}

function nearestTranscriptTimestampLine(
  anchors: readonly TranscriptTimestampAnchor[],
  startedAtMs: number,
): number | null {
  const prior = anchors
    .filter((anchor) => anchor.timestampMs <= startedAtMs)
    .sort((left, right) => right.timestampMs - left.timestampMs)[0];
  if (prior) return prior.lineIndex;
  const next = [...anchors].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  )[0];
  return next?.lineIndex ?? null;
}

function insertAppletSessionNoteCaptures(
  transcript: string,
  captures: readonly AppletSessionNoteCaptureV1[],
): string {
  if (!transcript || captures.length === 0) return transcript;
  const lines = transcript.split(/\r?\n/u);
  const anchors = transcriptTimestampAnchors(lines);
  const insertions = new Map<number, AppletSessionNoteCaptureV1[]>();

  for (const capture of captures) {
    const startedAtMs = Date.parse(capture.startedAt);
    const timestampLine = nearestTranscriptTimestampLine(anchors, startedAtMs);
    const insertionLine =
      timestampLine === null ? lines.length : noteInsertionLine(lines, timestampLine);
    const existing = insertions.get(insertionLine) ?? [];
    existing.push(capture);
    insertions.set(insertionLine, existing);
  }

  for (const [lineIndex, notes] of [...insertions.entries()].sort(
    ([left], [right]) => right - left,
  )) {
    const annotationLines = notes.flatMap((capture) => [
      "",
      `> **Developer note · ${capture.startedAt}${capture.fps ? ` · ${capture.fps} FPS` : ""}** — ${capture.body}`,
    ]);
    lines.splice(lineIndex, 0, ...annotationLines);
  }
  return lines.join("\n").trimEnd();
}
