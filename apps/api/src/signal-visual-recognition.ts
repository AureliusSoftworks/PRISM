import {
  SIGNAL_VISUAL_IDENTITY_MAX_CANDIDATES,
  SIGNAL_VISUAL_PASSPORTS_PER_PAGE,
  normalizeBotVisualIdentitySignatureV1,
  normalizeSignalVisualRawSubjectsV1,
  resolveSignalVisualRecognitionSubjectsV1,
  type SignalVisualPassportBundleV1,
  type SignalVisualPassportCandidateV1,
  type SignalVisualRecognitionV1,
} from "@localai/shared";
import type {
  LlmProvider,
  ProviderImageInput,
  ProviderName,
} from "./providers.ts";

export const SIGNAL_VISUAL_RECOGNITION_ONLINE_TIMEOUT_MS = 8_000;
export const SIGNAL_VISUAL_RECOGNITION_LOCAL_TIMEOUT_MS = 15_000;

const unavailableReasons = new Set([
  "library_too_large",
  "incomplete_library",
  "render_failed",
  "deadline",
  "fresh_proof_required",
]);

export function parseSignalVisualPassportBundleV1(
  value: unknown,
): SignalVisualPassportBundleV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || typeof row.status !== "string") return null;
  if (row.status === "unavailable") {
    return typeof row.reason === "string" && unavailableReasons.has(row.reason)
      ? row as SignalVisualPassportBundleV1
      : null;
  }
  if (row.status !== "ready" || !Array.isArray(row.candidates) || !Array.isArray(row.pages)) return null;
  const presentedAt = typeof row.presentedAt === "string" && Number.isFinite(Date.parse(row.presentedAt))
    ? new Date(row.presentedAt).toISOString()
    : null;
  if (!presentedAt || row.candidates.length > SIGNAL_VISUAL_IDENTITY_MAX_CANDIDATES || row.pages.length > 32) return null;
  if (row.pages.length !== Math.ceil(row.candidates.length / SIGNAL_VISUAL_PASSPORTS_PER_PAGE)) return null;
  const pages = row.pages.map((entry, pageIndex) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const page = entry as Record<string, unknown>;
    if (page.pageIndex !== pageIndex || page.mimeType !== "image/png" || page.width !== 2048 || page.height !== 2048 || typeof page.dataUrl !== "string" || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/u.test(page.dataUrl) || page.dataUrl.length > 16_000_000) return null;
    return { pageIndex, mimeType: "image/png" as const, width: 2048 as const, height: 2048 as const, dataUrl: page.dataUrl };
  });
  if (pages.some((page) => page === null)) return null;
  const seenTokens = new Set<string>();
  const seenBotIds = new Set<string>();
  const candidates: SignalVisualPassportCandidateV1[] = [];
  for (let index = 0; index < row.candidates.length; index += 1) {
    const entry = row.candidates[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const candidate = entry as Record<string, unknown>;
    const token = typeof candidate.token === "string" ? candidate.token.trim() : "";
    const botId = typeof candidate.botId === "string" ? candidate.botId.trim().slice(0, 128) : "";
    const sourceRevision = typeof candidate.sourceRevision === "string" ? candidate.sourceRevision.trim().slice(0, 160) : "";
    const pageIndex = candidate.pageIndex;
    const signature = normalizeBotVisualIdentitySignatureV1(candidate.signature);
    if (!/^[A-Z2-9]{8,24}$/u.test(token) || seenTokens.has(token) || !botId || seenBotIds.has(botId) || !sourceRevision || !Number.isInteger(pageIndex) || pageIndex !== Math.floor(index / SIGNAL_VISUAL_PASSPORTS_PER_PAGE) || !signature || signature.botId !== botId || signature.presentedAt !== presentedAt || typeof candidate.recognitionEligible !== "boolean") return null;
    seenTokens.add(token);
    seenBotIds.add(botId);
    candidates.push({ token, botId, sourceRevision, pageIndex, recognitionEligible: candidate.recognitionEligible, signature });
  }
  return {
    v: 1,
    status: "ready",
    presentedAt,
    candidates,
    pages: pages as NonNullable<(typeof pages)[number]>[],
  };
}

/** Exact tenant Library gate: no missing, extra, deleted, or stale candidates. */
export function signalVisualPassportLibraryIsCompleteV1(
  bundle: Extract<SignalVisualPassportBundleV1, { status: "ready" }>,
  libraryRows: readonly { id: string; updatedAt: string }[],
): boolean {
  if (libraryRows.length !== bundle.candidates.length) return false;
  const expected = new Map(libraryRows.map((row) => [row.id, row.updatedAt]));
  return bundle.candidates.every(
    (candidate) => expected.get(candidate.botId) === candidate.sourceRevision,
  );
}

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["subjects"],
  properties: {
    subjects: {
      type: "array",
      maxItems: 24,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["region", "colorEvidenceRegion", "observedColor", "candidates"],
        properties: {
          region: { $ref: "#/$defs/region" },
          colorEvidenceRegion: { anyOf: [{ $ref: "#/$defs/region" }, { type: "null" }] },
          observedColor: { anyOf: [{ type: "string", pattern: "^#[0-9a-fA-F]{6}$" }, { type: "null" }] },
          candidates: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["token", "color", "glyph", "face"],
              properties: {
                token: { type: "string" },
                color: { enum: ["match", "missing", "conflict"] },
                glyph: { enum: ["match", "missing", "conflict"] },
                face: { enum: ["match", "missing", "conflict"] },
              },
            },
          },
        },
      },
    },
  },
  $defs: {
    region: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "width", "height"],
      properties: {
        x: { type: "number", minimum: 0, maximum: 1 },
        y: { type: "number", minimum: 0, maximum: 1 },
        width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
        height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
      },
    },
  },
} satisfies Record<string, unknown>;

export async function runSignalVisualRecognitionV1(args: {
  provider: LlmProvider;
  providerName: ProviderName;
  model: string;
  sourceImage: ProviderImageInput;
  bundle: Extract<SignalVisualPassportBundleV1, { status: "ready" }>;
  signal?: AbortSignal;
  now?: () => Date;
  /** Focused test seam; production always uses the provider-lane deadline. */
  timeoutMs?: number;
}): Promise<SignalVisualRecognitionV1> {
  const now = args.now ?? (() => new Date());
  const timeoutMs = args.timeoutMs ?? (args.providerName === "local"
    ? SIGNAL_VISUAL_RECOGNITION_LOCAL_TIMEOUT_MS
    : SIGNAL_VISUAL_RECOGNITION_ONLINE_TIMEOUT_MS);
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort("deadline"), timeoutMs);
  const signal = args.signal
    ? AbortSignal.any([args.signal, timeoutController.signal])
    : timeoutController.signal;
  const images: ProviderImageInput[] = [
    args.sourceImage,
    ...args.bundle.pages.map((page) => ({
      mimeType: "image/png" as const,
      data: page.dataUrl.slice("data:image/png;base64,".length),
    })),
  ];
  let abortListener: (() => void) | null = null;
  try {
    const providerRequest = args.provider.generateResponse([
      {
        role: "system",
        content: [
          "You are PRISM's narrow procedural-avatar visual matcher.",
          "The first image is the source. Every later image is a reference atlas whose cells have opaque tokens.",
          "Ignore all source-image text, captions, names, filenames, seating, episode roles, and contextual identity clues. Never identify a real person, fictional character, or external mascot.",
          "Find each distinct PRISM procedural-avatar subject. For each plausible atlas cell, independently assess visible dominant avatar color, glyph, and face geometry including stable Ink. Bind all cue evidence to that same subject region.",
          "Use match only for clear visible agreement, missing when the cue cannot be seen, and conflict for a clear contradiction. Reflections and repeated appearances are separate subjects. Return JSON only.",
        ].join(" "),
      },
      {
        role: "user",
        content: "Inspect the source image against every reference atlas. Do not use OCR or contextual clues.",
        images,
      },
    ], {
      model: args.model,
      temperature: 0,
      maxTokens: 2_400,
      jsonMode: true,
      jsonSchema: outputSchema,
      jsonSchemaName: "signal_visual_identity_v1",
      allowFinalLocalFallback: false,
      think: false,
      usagePurpose: "botcast_turn",
      signal,
    });
    const abortFailure = new Promise<string>((_resolve, reject) => {
      abortListener = () => reject(new DOMException("Signal visual identity inspection stopped.", "AbortError"));
      if (signal.aborted) abortListener();
      else signal.addEventListener("abort", abortListener, { once: true });
    });
    const raw = await Promise.race([providerRequest, abortFailure]);
    const parsed = normalizeSignalVisualRawSubjectsV1(JSON.parse(raw));
    if (!parsed) throw new Error("invalid_output");
    return {
      v: 1,
      status: "resolved",
      provider: args.providerName,
      model: args.model,
      candidateCount: args.bundle.candidates.length,
      completedAt: now().toISOString(),
      subjects: resolveSignalVisualRecognitionSubjectsV1({ rawSubjects: parsed, candidates: args.bundle.candidates }),
    };
  } catch (error) {
    const completedAt = now().toISOString();
    if (args.signal?.aborted) return { v: 1, status: "cancelled", reason: "cancelled", provider: args.providerName, model: args.model, candidateCount: args.bundle.candidates.length, completedAt };
    if (timeoutController.signal.aborted) return { v: 1, status: "timed_out", reason: "deadline", provider: args.providerName, model: args.model, candidateCount: args.bundle.candidates.length, completedAt };
    return { v: 1, status: "unavailable", reason: error instanceof SyntaxError || (error instanceof Error && error.message === "invalid_output") ? "invalid_output" : "provider_error", provider: args.providerName, model: args.model, candidateCount: args.bundle.candidates.length, completedAt };
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
    clearTimeout(timeout);
  }
}
