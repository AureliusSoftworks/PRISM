import {
  resolveBotFaceStyle,
  type BotFaceStyle,
  type BotFaceStyleInput,
} from "./botAvatar.ts";
import {
  parseBotAvatarDetailsV1,
  type BotAvatarDetailsV1,
} from "./botAvatarDetails.ts";
import { normalizeBotIdentityColor } from "./color.ts";

export const SIGNAL_VISUAL_IDENTITY_VERSION = 1 as const;
export const SIGNAL_VISUAL_PASSPORT_PAGE_SIZE = 2048;
export const SIGNAL_VISUAL_PASSPORTS_PER_PAGE = 16;
export const SIGNAL_VISUAL_IDENTITY_MAX_CANDIDATES = 512;
export const SIGNAL_VISUAL_IDENTITY_COLOR_DELTA_E_MAX = 12;
export const SIGNAL_VISUAL_IDENTITY_HUE_DELTA_MAX = 24;

export interface BotVisualIdentitySignatureV1 {
  v: 1;
  botId: string;
  color: string;
  glyph: string;
  face: BotFaceStyle;
  avatarDetails: BotAvatarDetailsV1 | null;
  allowedVariants: readonly ["neutral", "blink", "speech", "thinking"];
  appearanceHash: string;
  presentedAt: string;
}

export interface SignalVisualPassportCandidateV1 {
  token: string;
  botId: string;
  sourceRevision: string;
  pageIndex: number;
  recognitionEligible: boolean;
  signature: BotVisualIdentitySignatureV1;
}

export interface SignalVisualPassportPageV1 {
  pageIndex: number;
  mimeType: "image/png";
  width: 2048;
  height: 2048;
  dataUrl: string;
}

export type SignalVisualPassportBundleV1 =
  | {
      v: 1;
      status: "ready";
      presentedAt: string;
      candidates: SignalVisualPassportCandidateV1[];
      pages: SignalVisualPassportPageV1[];
    }
  | {
      v: 1;
      status: "unavailable";
      reason:
        | "library_too_large"
        | "incomplete_library"
        | "render_failed"
        | "deadline"
        | "fresh_proof_required";
    };

export type SignalVisualCueState = "match" | "missing" | "conflict";

export interface SignalVisualRegionV1 {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SignalVisualCueEvidenceV1 {
  color: SignalVisualCueState;
  glyph: SignalVisualCueState;
  face: SignalVisualCueState;
}

export interface SignalVisualRecognitionSubjectV1 {
  region: SignalVisualRegionV1;
  colorEvidenceRegion: SignalVisualRegionV1 | null;
  referenceToken: string | null;
  cueStates: SignalVisualCueEvidenceV1;
  recognizedBotId: string | null;
  appearanceHash: string | null;
}

export type SignalVisualRecognitionV1 =
  | {
      v: 1;
      status: "pending";
      candidateCount: number;
      pageCount: number;
      startedAt: string;
    }
  | {
      v: 1;
      status: "resolved";
      provider: "local" | "ollama_cloud" | "openai" | "anthropic";
      model: string;
      candidateCount: number;
      completedAt: string;
      subjects: SignalVisualRecognitionSubjectV1[];
    }
  | {
      v: 1;
      status: "unavailable" | "timed_out" | "cancelled";
      reason:
        | "not_requested"
        | "fresh_proof_required"
        | "library_too_large"
        | "incomplete_library"
        | "render_failed"
        | "invalid_manifest"
        | "invalid_output"
        | "provider_error"
        | "deadline"
        | "cancelled";
      provider?: "local" | "ollama_cloud" | "openai" | "anthropic";
      model?: string;
      candidateCount?: number;
      completedAt: string;
    };

export interface SignalVisualRawCandidateEvidenceV1 {
  token: string;
  color: SignalVisualCueState;
  glyph: SignalVisualCueState;
  face: SignalVisualCueState;
}

export interface SignalVisualRawSubjectEvidenceV1 {
  region: SignalVisualRegionV1;
  colorEvidenceRegion: SignalVisualRegionV1 | null;
  observedColor: string | null;
  candidates: SignalVisualRawCandidateEvidenceV1[];
}

const isoTimestamp = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
};

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

/** Portable, non-cryptographic change detector for a public procedural form. */
export function signalVisualAppearanceHash(value: unknown): string {
  const text = JSON.stringify(stableValue(value));
  let high = 0x811c9dc5;
  let low = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    high ^= code & 0xff;
    high = Math.imul(high, 0x01000193);
    low ^= code >>> 8;
    low = Math.imul(low, 0x01000193);
  }
  return `${(high >>> 0).toString(16).padStart(8, "0")}${(low >>> 0).toString(16).padStart(8, "0")}`;
}

export function createBotVisualIdentitySignatureV1(args: {
  botId: string;
  color: unknown;
  glyph: unknown;
  face: BotFaceStyleInput | BotFaceStyle;
  avatarDetails?: unknown;
  presentedAt: string;
}): BotVisualIdentitySignatureV1 | null {
  const botId = args.botId.trim().slice(0, 128);
  const color = normalizeBotIdentityColor(args.color);
  const glyph = typeof args.glyph === "string" ? args.glyph.trim().slice(0, 120) : "";
  const presentedAt = isoTimestamp(args.presentedAt);
  if (!botId || !color || !glyph || !presentedAt) return null;
  const resolvedFace = args.face as Partial<BotFaceStyle>;
  const face = "eyesFont" in resolvedFace
    ? resolveBotFaceStyle({
        faceEyesFont: resolvedFace.eyesFont,
        faceEyeCharacter: resolvedFace.eyeCharacter,
        faceEyeCount: resolvedFace.eyeCount,
        faceEyeSpacing: resolvedFace.eyeSpacing,
        faceEyeAnimation: resolvedFace.eyeAnimation,
        faceMouthFont: resolvedFace.mouthFont,
        faceMouthCharacter: resolvedFace.mouthCharacter,
        faceMouthAnimation: resolvedFace.mouthAnimation,
        faceMouthSpeechPoses: resolvedFace.mouthSpeechPoses,
        faceMouthCoffeePucker: resolvedFace.mouthCoffeePucker,
        faceFontWeight: resolvedFace.weight,
        faceEyeScale: resolvedFace.eyeScale,
        faceEyeOffsetX: resolvedFace.eyeOffsetX,
        faceEyeOffsetY: resolvedFace.eyeOffsetY,
        faceEyeRotationDeg: resolvedFace.eyeRotationDeg,
        faceMouthScale: resolvedFace.mouthScale,
        faceMouthOffsetX: resolvedFace.mouthOffsetX,
        faceMouthOffsetY: resolvedFace.mouthOffsetY,
        faceMouthRotationDeg: resolvedFace.mouthRotationDeg,
        faceBlinkBar: resolvedFace.blinkBar,
        faceBlinkCount: resolvedFace.blinkCount,
        faceBlinkScale: resolvedFace.blinkScale,
        faceBlinkOffsetX: resolvedFace.blinkOffsetX,
        faceBlinkOffsetY: resolvedFace.blinkOffsetY,
        faceBlinkRotationDeg: resolvedFace.blinkRotationDeg,
        faceThinkingFrames: resolvedFace.thinkingFrames,
        faceThinkingScale: resolvedFace.thinkingScale,
        faceThinkingOffsetX: resolvedFace.thinkingOffsetX,
        faceThinkingOffsetY: resolvedFace.thinkingOffsetY,
      })
    : resolveBotFaceStyle(args.face as BotFaceStyleInput);
  let avatarDetails: BotAvatarDetailsV1 | null = null;
  if (args.avatarDetails != null) {
    try {
      avatarDetails = parseBotAvatarDetailsV1(args.avatarDetails);
    } catch {
      return null;
    }
  }
  const appearance = { color, glyph, face, avatarDetails };
  return {
    v: 1,
    botId,
    ...appearance,
    allowedVariants: ["neutral", "blink", "speech", "thinking"],
    appearanceHash: signalVisualAppearanceHash(appearance),
    presentedAt,
  };
}

export function normalizeBotVisualIdentitySignatureV1(
  value: unknown,
): BotVisualIdentitySignatureV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || typeof row.botId !== "string") return null;
  const normalized = createBotVisualIdentitySignatureV1({
    botId: row.botId,
    color: row.color,
    glyph: row.glyph,
    face: row.face as BotFaceStyle,
    avatarDetails: row.avatarDetails,
    presentedAt: typeof row.presentedAt === "string" ? row.presentedAt : "",
  });
  return normalized && row.appearanceHash === normalized.appearanceHash
    ? normalized
    : null;
}

const boundedRegion = (value: unknown): SignalVisualRegionV1 | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const values = [row.x, row.y, row.width, row.height];
  if (values.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))) return null;
  const [x, y, width, height] = values as number[];
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) return null;
  return { x, y, width, height };
};

const cueState = (value: unknown): SignalVisualCueState | null =>
  value === "match" || value === "missing" || value === "conflict" ? value : null;

function regionContains(
  outer: SignalVisualRegionV1,
  inner: SignalVisualRegionV1,
): boolean {
  const epsilon = 0.000001;
  return inner.x + epsilon >= outer.x &&
    inner.y + epsilon >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width + epsilon &&
    inner.y + inner.height <= outer.y + outer.height + epsilon;
}

export function normalizeSignalVisualRawSubjectsV1(
  value: unknown,
): SignalVisualRawSubjectEvidenceV1[] | null {
  const source =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).subjects
      : null;
  if (!Array.isArray(source) || source.length > 24) return null;
  const subjects: SignalVisualRawSubjectEvidenceV1[] = [];
  for (const entry of source) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const row = entry as Record<string, unknown>;
    const region = boundedRegion(row.region);
    const colorEvidenceRegion = row.colorEvidenceRegion == null
      ? null
      : boundedRegion(row.colorEvidenceRegion);
    const observedColor = row.observedColor == null
      ? null
      : normalizeHexColor(row.observedColor);
    if (!region || (row.colorEvidenceRegion != null && !colorEvidenceRegion) ||
        (row.observedColor != null && !observedColor) || !Array.isArray(row.candidates) ||
        row.candidates.length > SIGNAL_VISUAL_IDENTITY_MAX_CANDIDATES) return null;
    const candidates: SignalVisualRawCandidateEvidenceV1[] = [];
    const seenTokens = new Set<string>();
    for (const candidate of row.candidates) {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
      const evidence = candidate as Record<string, unknown>;
      const token = typeof evidence.token === "string" ? evidence.token.trim() : "";
      const color = cueState(evidence.color);
      const glyph = cueState(evidence.glyph);
      const face = cueState(evidence.face);
      if (!/^[A-Z2-9]{8,24}$/u.test(token) || seenTokens.has(token) || !color || !glyph || !face) return null;
      seenTokens.add(token);
      candidates.push({ token, color, glyph, face });
    }
    subjects.push({ region, colorEvidenceRegion, observedColor, candidates });
  }
  return subjects;
}

function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/iu.test(value.trim())) return null;
  return value.trim().toLowerCase();
}

type Lab = { l: number; a: number; b: number };

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255) as [number, number, number];
}

function hexToLab(hex: string): Lab {
  const linear = hexToRgb(hex).map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  const x = (linear[0]! * 0.4124 + linear[1]! * 0.3576 + linear[2]! * 0.1805) / 0.95047;
  const y = linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
  const z = (linear[0]! * 0.0193 + linear[1]! * 0.1192 + linear[2]! * 0.9505) / 1.08883;
  const pivot = (component: number) => component > 0.008856 ? Math.cbrt(component) : 7.787 * component + 16 / 116;
  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** CIEDE2000 perceptual difference for normalized sRGB hex colors. */
export function signalVisualColorDeltaE2000(left: string, right: string): number {
  const lab1 = hexToLab(left);
  const lab2 = hexToLab(right);
  const c1 = Math.hypot(lab1.a, lab1.b);
  const c2 = Math.hypot(lab2.a, lab2.b);
  const cBar = (c1 + c2) / 2;
  const g = 0.5 * (1 - Math.sqrt(cBar ** 7 / (cBar ** 7 + 25 ** 7)));
  const a1p = (1 + g) * lab1.a;
  const a2p = (1 + g) * lab2.a;
  const c1p = Math.hypot(a1p, lab1.b);
  const c2p = Math.hypot(a2p, lab2.b);
  const hp = (a: number, b: number) => {
    if (a === 0 && b === 0) return 0;
    const angle = Math.atan2(b, a) * 180 / Math.PI;
    return angle < 0 ? angle + 360 : angle;
  };
  const h1p = hp(a1p, lab1.b);
  const h2p = hp(a2p, lab2.b);
  const dLp = lab2.l - lab1.l;
  const dCp = c2p - c1p;
  const dhp = c1p * c2p === 0 ? 0 : Math.abs(h2p - h1p) <= 180
    ? h2p - h1p
    : h2p <= h1p ? h2p - h1p + 360 : h2p - h1p - 360;
  const dHp = 2 * Math.sqrt(c1p * c2p) * Math.sin((dhp / 2) * Math.PI / 180);
  const lBar = (lab1.l + lab2.l) / 2;
  const cpBar = (c1p + c2p) / 2;
  const hBar = c1p * c2p === 0 ? h1p + h2p : Math.abs(h1p - h2p) <= 180
    ? (h1p + h2p) / 2
    : h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  const t = 1 - 0.17 * Math.cos((hBar - 30) * Math.PI / 180)
    + 0.24 * Math.cos(2 * hBar * Math.PI / 180)
    + 0.32 * Math.cos((3 * hBar + 6) * Math.PI / 180)
    - 0.2 * Math.cos((4 * hBar - 63) * Math.PI / 180);
  const dTheta = 30 * Math.exp(-(((hBar - 275) / 25) ** 2));
  const rc = 2 * Math.sqrt(cpBar ** 7 / (cpBar ** 7 + 25 ** 7));
  const sl = 1 + 0.015 * (lBar - 50) ** 2 / Math.sqrt(20 + (lBar - 50) ** 2);
  const sc = 1 + 0.045 * cpBar;
  const sh = 1 + 0.015 * cpBar * t;
  const rt = -Math.sin(2 * dTheta * Math.PI / 180) * rc;
  return Math.sqrt((dLp / sl) ** 2 + (dCp / sc) ** 2 + (dHp / sh) ** 2 + rt * (dCp / sc) * (dHp / sh));
}

function dominantHue(hex: string): number | null {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta < 0.08) return null;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (hue * 60 + 360) % 360;
}

export function signalVisualColorsMatch(expected: string, observed: string): boolean {
  const left = normalizeHexColor(expected);
  const right = normalizeHexColor(observed);
  if (!left || !right || signalVisualColorDeltaE2000(left, right) > SIGNAL_VISUAL_IDENTITY_COLOR_DELTA_E_MAX) return false;
  const leftHue = dominantHue(left);
  const rightHue = dominantHue(right);
  if (leftHue == null || rightHue == null) return false;
  const delta = Math.abs(leftHue - rightHue);
  return Math.min(delta, 360 - delta) <= SIGNAL_VISUAL_IDENTITY_HUE_DELTA_MAX;
}

/** Applies color, glyph, face, same-region, eligibility, and uniqueness in code. */
export function resolveSignalVisualRecognitionSubjectsV1(args: {
  rawSubjects: SignalVisualRawSubjectEvidenceV1[];
  candidates: readonly SignalVisualPassportCandidateV1[];
}): SignalVisualRecognitionSubjectV1[] {
  const byToken = new Map(args.candidates.map((candidate) => [candidate.token, candidate]));
  const collisionCounts = new Map<string, number>();
  for (const candidate of args.candidates) {
    if (!candidate.recognitionEligible) continue;
    collisionCounts.set(candidate.signature.appearanceHash, (collisionCounts.get(candidate.signature.appearanceHash) ?? 0) + 1);
  }
  return args.rawSubjects.map((subject) => {
    const fullMatches = subject.candidates.flatMap((evidence) => {
      const candidate = byToken.get(evidence.token);
      if (!candidate || !candidate.recognitionEligible || evidence.color !== "match" ||
          evidence.glyph !== "match" || evidence.face !== "match" ||
          !subject.colorEvidenceRegion || !subject.observedColor ||
          !regionContains(subject.region, subject.colorEvidenceRegion) ||
          !signalVisualColorsMatch(candidate.signature.color, subject.observedColor)) return [];
      return collisionCounts.get(candidate.signature.appearanceHash) === 1 ? [candidate] : [];
    });
    const recognized = fullMatches.length === 1 ? fullMatches[0]! : null;
    const best = recognized
      ? subject.candidates.find((entry) => entry.token === recognized.token)!
      : subject.candidates.find((entry) => Object.values({ color: entry.color, glyph: entry.glyph, face: entry.face }).filter((state) => state === "match").length >= 2)
        ?? null;
    return {
      region: subject.region,
      colorEvidenceRegion: subject.colorEvidenceRegion,
      referenceToken: recognized?.token ?? best?.token ?? null,
      cueStates: best ? { color: best.color, glyph: best.glyph, face: best.face } : { color: "missing", glyph: "missing", face: "missing" },
      recognizedBotId: recognized?.botId ?? null,
      appearanceHash: recognized?.signature.appearanceHash ?? null,
    };
  });
}

export function normalizeSignalVisualRecognitionV1(
  value: unknown,
): SignalVisualRecognitionV1 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.v !== 1 || typeof row.status !== "string") return null;
  const candidateCount = Number.isInteger(row.candidateCount) && Number(row.candidateCount) >= 0
    ? Math.min(Number(row.candidateCount), SIGNAL_VISUAL_IDENTITY_MAX_CANDIDATES)
    : undefined;
  if (row.status === "pending") {
    const startedAt = isoTimestamp(row.startedAt);
    const pageCount = Number.isInteger(row.pageCount) && Number(row.pageCount) >= 0 && Number(row.pageCount) <= 32
      ? Number(row.pageCount)
      : null;
    return startedAt && candidateCount !== undefined && pageCount !== null
      ? { v: 1, status: "pending", candidateCount, pageCount, startedAt }
      : null;
  }
  const completedAt = isoTimestamp(row.completedAt);
  if (!completedAt) return null;
  const provider = row.provider === "local" || row.provider === "ollama_cloud" || row.provider === "openai" || row.provider === "anthropic"
    ? row.provider
    : undefined;
  const model = typeof row.model === "string" && row.model.trim()
    ? row.model.trim().slice(0, 200)
    : undefined;
  if (row.status === "resolved") {
    if (!provider || !model || candidateCount === undefined || !Array.isArray(row.subjects) || row.subjects.length > 24) return null;
    const subjects: SignalVisualRecognitionSubjectV1[] = [];
    for (const entry of row.subjects) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const subject = entry as Record<string, unknown>;
      const region = boundedRegion(subject.region);
      const colorEvidenceRegion = subject.colorEvidenceRegion == null ? null : boundedRegion(subject.colorEvidenceRegion);
      const cues = subject.cueStates && typeof subject.cueStates === "object" && !Array.isArray(subject.cueStates)
        ? subject.cueStates as Record<string, unknown>
        : null;
      const color = cueState(cues?.color);
      const glyph = cueState(cues?.glyph);
      const face = cueState(cues?.face);
      const referenceToken = subject.referenceToken == null
        ? null
        : typeof subject.referenceToken === "string" && /^[A-Z2-9]{8,24}$/u.test(subject.referenceToken)
          ? subject.referenceToken
          : undefined;
      const recognizedBotId = subject.recognizedBotId == null
        ? null
        : typeof subject.recognizedBotId === "string" && subject.recognizedBotId.trim()
          ? subject.recognizedBotId.trim().slice(0, 128)
          : undefined;
      const appearanceHash = subject.appearanceHash == null
        ? null
        : typeof subject.appearanceHash === "string" && /^[0-9a-f]{16}$/u.test(subject.appearanceHash)
          ? subject.appearanceHash
          : undefined;
      if (!region || (subject.colorEvidenceRegion != null && !colorEvidenceRegion) || !cues || !color || !glyph || !face || referenceToken === undefined || recognizedBotId === undefined || appearanceHash === undefined || Boolean(recognizedBotId) !== Boolean(appearanceHash)) return null;
      subjects.push({ region, colorEvidenceRegion, referenceToken, cueStates: { color, glyph, face }, recognizedBotId, appearanceHash });
    }
    return { v: 1, status: "resolved", provider, model, candidateCount, completedAt, subjects };
  }
  if (row.status !== "unavailable" && row.status !== "timed_out" && row.status !== "cancelled") return null;
  const reasons = new Set([
    "not_requested", "fresh_proof_required", "library_too_large", "incomplete_library",
    "render_failed", "invalid_manifest", "invalid_output", "provider_error", "deadline", "cancelled",
  ]);
  if (typeof row.reason !== "string" || !reasons.has(row.reason)) return null;
  return {
    v: 1,
    status: row.status,
    reason: row.reason as Extract<SignalVisualRecognitionV1, { status: "unavailable" | "timed_out" | "cancelled" }>["reason"],
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(candidateCount !== undefined ? { candidateCount } : {}),
    completedAt,
  };
}
