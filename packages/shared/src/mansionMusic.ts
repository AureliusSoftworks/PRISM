import type { MansionAtmosphereContractV1 } from "./portableMysteryPackage.js";

export const MANSION_MUSIC_REFRACT_LENSES_V1 = [
  "shadow",
  "pulse",
  "atmosphere",
] as const;

export type MansionMusicRefractLensV1 =
  typeof MANSION_MUSIC_REFRACT_LENSES_V1[number];

export interface MansionMusicIdentityV1 {
  version: 1;
  /** Provider prompts may use only musical instruments as sound sources. */
  soundSources: "instruments_only";
  noirSubgenre: string;
  tempoBpm: { min: number; max: number };
  instrumentation: string[];
  acousticElectronicBalance: number;
  harmonicCharacter: string[];
  density: { min: number; max: number };
  intensityCeiling: number;
  /** Additive V1 fields; legacy packages derive these on install. */
  foregroundRiskCeiling?: number;
  silenceRatio?: { min: number; max: number };
  phraseDurationSeconds: { min: number; max: number };
  quietIntervalSeconds: { min: number; max: number };
  loopBoundary: {
    quietWindowSeconds: number;
    searchWindowSeconds: number;
    crossfadeSeconds: number;
  };
  geography: string;
  architecture: string;
  weather: string;
  periodCues: string[];
  role: "investigation_loop";
  speechSafe: true;
  semanticAudioPolicy: "non_semantic_music_only";
  instrumental: true;
  styleBoundaries: string[];
}

export interface MansionMusicTrackV1 {
  assetId: string;
  title: string;
  /** Absent on legacy tracks that predate decoded loop validation. */
  loop?: MansionMusicLoopV1 | null;
}

export interface MansionMusicLoopV1 {
  version: 1;
  loopStartMs: number;
  loopEndMs: number;
  crossfadeMs: number;
  silenceRatio: number;
}

export interface MansionMusicLibraryStateV1 {
  version: 1;
  identity: MansionMusicIdentityV1;
  active: MansionMusicTrackV1 | null;
  candidate: (MansionMusicTrackV1 & {
    /** Legacy lenses remain readable, but new synthesis always uses signature. */
    lens: MansionMusicRefractLensV1 | "signature";
    validated?: boolean;
  }) | null;
  previous: MansionMusicTrackV1 | null;
}

export interface MansionAtmosphereTrackV1 {
  assetId: string;
  title: string;
}

export interface MansionAtmosphereLibraryStateV1 {
  version: 1;
  active: MansionAtmosphereTrackV1 | null;
  candidate: MansionAtmosphereTrackV1 | null;
  previous: MansionAtmosphereTrackV1 | null;
}

export const MANSION_MUSIC_ACTIVE_LOGICAL_ID_V1 = "investigation-theme-v1";
export const MANSION_MUSIC_CANDIDATE_LOGICAL_ID_V1 = "investigation-theme-candidate-v1";
export const MANSION_MUSIC_PREVIOUS_LOGICAL_ID_V1 = "investigation-theme-previous-v1";
export const MANSION_ATMOSPHERE_ACTIVE_LOGICAL_ID_V1 = "ambience:world-bed-v1";
export const MANSION_ATMOSPHERE_CANDIDATE_LOGICAL_ID_V1 = "ambience:world-bed-candidate-v1";
export const MANSION_ATMOSPHERE_PREVIOUS_LOGICAL_ID_V1 = "ambience:world-bed-previous-v1";

function compact(value: string, fallback: string, maxLength = 240): string {
  return value.replace(/\s+/gu, " ").trim().slice(0, maxLength) || fallback;
}

function stringList(value: unknown, fallback: readonly string[], max = 12): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const values = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => compact(entry, "", 100))
    .filter(Boolean)
    .slice(0, max);
  return values.length > 0 ? [...new Set(values)] : [...fallback];
}

function numberInRange(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

function identityFamily(input: string): "space" | "jungle" | "gothic" {
  if (/space|orbital|observatory|star|airlock|reactor|hull/iu.test(input)) return "space";
  if (/jungle|banyan|monsoon|expedition|botanical|canopy/iu.test(input)) return "jungle";
  return "gothic";
}

export function deriveMansionMusicIdentityV1(args: {
  title: string;
  houseStyleLabel: string;
  houseStylePromptContract: string;
  atmosphere?: MansionAtmosphereContractV1 | null;
}): MansionMusicIdentityV1 {
  const context = `${args.title} ${args.houseStyleLabel} ${args.houseStylePromptContract} ${args.atmosphere?.exteriorSetting ?? ""}`;
  const family = identityFamily(context);
  const shared = {
    version: 1 as const,
    soundSources: "instruments_only" as const,
    geography: compact(
      args.atmosphere?.exteriorSetting ?? args.houseStylePromptContract,
      "A secluded mansion in its established geography",
    ),
    architecture: compact(args.houseStyleLabel, "Distinctive mansion architecture", 160),
    weather: compact(args.atmosphere?.weather ?? "clear", "clear", 60),
    role: "investigation_loop" as const,
    speechSafe: true as const,
    semanticAudioPolicy: "non_semantic_music_only" as const,
    instrumental: true as const,
    silenceRatio: { min: 0.45, max: 0.65 },
    phraseDurationSeconds: { min: 6, max: 14 },
    quietIntervalSeconds: { min: 8, max: 24 },
    loopBoundary: {
      quietWindowSeconds: 2,
      searchWindowSeconds: 8,
      crossfadeSeconds: 1.5,
    },
  };
  if (family === "space") {
    return {
      ...shared,
      noirSubgenre: "orbital noir",
      tempoBpm: { min: 46, max: 62 },
      instrumentation: [
        "soft ethereal synthesizer pads", "glassy vibraphone", "celesta",
        "restrained low synthesizer pulse", "occasional bass clarinet",
      ],
      acousticElectronicBalance: 0.58,
      harmonicCharacter: ["cold suspended harmony", "watchful minor tension", "spacious unresolved motif"],
      density: { min: 0.06, max: 0.18 },
      intensityCeiling: 0.22,
      foregroundRiskCeiling: 0.16,
      periodCues: ["deep-space observatory", "sealed technology", "glassy stellar scale"],
      styleBoundaries: ["cerebral restraint", "soft suspended voicings", "patient detective-noir understatement", "furniture music"],
    };
  }
  if (family === "jungle") {
    return {
      ...shared,
      noirSubgenre: "botanical chamber noir",
      tempoBpm: { min: 58, max: 72 },
      instrumentation: [
        "light bongos", "occasional woody marimba", "upright bass",
        "rare muted brass", "glass harmonics",
      ],
      acousticElectronicBalance: 0.2,
      harmonicCharacter: ["close suspended harmony", "patient investigative motif", "lantern-warm tension"],
      density: { min: 0.07, max: 0.18 },
      intensityCeiling: 0.25,
      foregroundRiskCeiling: 0.18,
      periodCues: ["grounded expedition manor", "dark hardwood and brass", "broad-leaf monsoon"],
      styleBoundaries: ["grounded acoustic restraint", "subtle noir side-slips", "patient investigative sobriety", "furniture music"],
    };
  }
  return {
    ...shared,
    noirSubgenre: "Gothic chamber noir",
    tempoBpm: { min: 50, max: 64 },
    instrumentation: [
      "felt piano", "bass clarinet", "muted cornet", "upright bass",
      "sparse brushed drums", "quiet chamber strings",
    ],
    acousticElectronicBalance: 0.08,
    harmonicCharacter: ["shadowed chamber harmony", "poised minor tension", "elegant unresolved motif"],
    density: { min: 0.06, max: 0.17 },
    intensityCeiling: 0.24,
    foregroundRiskCeiling: 0.16,
    periodCues: ["late nineteenth-century chamber character", "dark walnut and patina", "storm-lit windows"],
    styleBoundaries: ["elegant dread", "period-aware chamber restraint", "patient detective-noir understatement", "furniture music"],
  };
}

export function normalizeMansionMusicIdentityV1(
  value: unknown,
  fallback: MansionMusicIdentityV1,
): MansionMusicIdentityV1 {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) {
    return fallback;
  }
  const input = value as Partial<MansionMusicIdentityV1>;
  const minTempo = numberInRange(input.tempoBpm?.min, fallback.tempoBpm.min, 40, 120);
  const maxTempo = numberInRange(input.tempoBpm?.max, fallback.tempoBpm.max, minTempo, 140);
  const minDensity = numberInRange(input.density?.min, fallback.density.min, 0, 1);
  const maxDensity = numberInRange(input.density?.max, fallback.density.max, minDensity, 1);
  const minSilence = numberInRange(input.silenceRatio?.min, fallback.silenceRatio?.min ?? 0.45, 0.45, 0.65);
  const maxSilence = numberInRange(input.silenceRatio?.max, fallback.silenceRatio?.max ?? 0.65, minSilence, 0.65);
  const minPhrase = numberInRange(input.phraseDurationSeconds?.min, fallback.phraseDurationSeconds.min, 6, 14);
  const maxPhrase = numberInRange(input.phraseDurationSeconds?.max, fallback.phraseDurationSeconds.max, minPhrase, 14);
  const minQuiet = numberInRange(input.quietIntervalSeconds?.min, fallback.quietIntervalSeconds.min, 8, 24);
  const maxQuiet = numberInRange(input.quietIntervalSeconds?.max, fallback.quietIntervalSeconds.max, minQuiet, 24);
  return {
    version: 1,
    soundSources: "instruments_only",
    noirSubgenre: compact(input.noirSubgenre ?? "", fallback.noirSubgenre, 120),
    tempoBpm: { min: minTempo, max: maxTempo },
    instrumentation: stringList(input.instrumentation, fallback.instrumentation),
    acousticElectronicBalance: numberInRange(
      input.acousticElectronicBalance,
      fallback.acousticElectronicBalance,
      0,
      1,
    ),
    harmonicCharacter: stringList(input.harmonicCharacter, fallback.harmonicCharacter, 8),
    density: { min: minDensity, max: maxDensity },
    intensityCeiling: numberInRange(input.intensityCeiling, fallback.intensityCeiling, 0.1, 0.3),
    foregroundRiskCeiling: numberInRange(
      input.foregroundRiskCeiling,
      fallback.foregroundRiskCeiling ?? 0.3,
      0.1,
      0.2,
    ),
    silenceRatio: { min: minSilence, max: maxSilence },
    phraseDurationSeconds: { min: minPhrase, max: maxPhrase },
    quietIntervalSeconds: { min: minQuiet, max: maxQuiet },
    loopBoundary: {
      quietWindowSeconds: numberInRange(input.loopBoundary?.quietWindowSeconds, fallback.loopBoundary.quietWindowSeconds, 2, 4),
      searchWindowSeconds: numberInRange(input.loopBoundary?.searchWindowSeconds, fallback.loopBoundary.searchWindowSeconds, 6, 12),
      crossfadeSeconds: numberInRange(input.loopBoundary?.crossfadeSeconds, fallback.loopBoundary.crossfadeSeconds, 1, 2.5),
    },
    geography: compact(input.geography ?? "", fallback.geography),
    architecture: compact(input.architecture ?? "", fallback.architecture, 160),
    weather: compact(input.weather ?? "", fallback.weather, 60),
    periodCues: stringList(input.periodCues, fallback.periodCues, 8),
    role: "investigation_loop",
    speechSafe: true,
    semanticAudioPolicy: "non_semantic_music_only",
    instrumental: true,
    styleBoundaries: stringList(input.styleBoundaries, fallback.styleBoundaries, 8),
  };
}

export function validateMansionMusicIdentityV1(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["musicIdentity is invalid."];
  const input = value as Partial<MansionMusicIdentityV1>;
  const errors: string[] = [];
  if (input.version !== 1) errors.push("musicIdentity.version is invalid.");
  if (input.soundSources !== "instruments_only") errors.push("musicIdentity.soundSources is invalid.");
  for (const key of ["noirSubgenre", "geography", "architecture", "weather"] as const) {
    if (typeof input[key] !== "string" || !input[key]?.trim()) errors.push(`musicIdentity.${key} is invalid.`);
  }
  if (!Array.isArray(input.instrumentation) || input.instrumentation.length < 2 ||
      !input.instrumentation.every((entry) => typeof entry === "string" && entry.trim())) {
    errors.push("musicIdentity.instrumentation is invalid.");
  }
  if (!Array.isArray(input.harmonicCharacter) || input.harmonicCharacter.length < 1 ||
      !input.harmonicCharacter.every((entry) => typeof entry === "string" && entry.trim())) {
    errors.push("musicIdentity.harmonicCharacter is invalid.");
  }
  if (!input.tempoBpm || typeof input.tempoBpm.min !== "number" || typeof input.tempoBpm.max !== "number" ||
      input.tempoBpm.min < 40 || input.tempoBpm.max > 140 || input.tempoBpm.min > input.tempoBpm.max) {
    errors.push("musicIdentity.tempoBpm is invalid.");
  }
  if (!input.density || typeof input.density.min !== "number" || typeof input.density.max !== "number" ||
      input.density.min < 0 || input.density.max > 1 || input.density.min > input.density.max) {
    errors.push("musicIdentity.density is invalid.");
  }
  if (typeof input.acousticElectronicBalance !== "number" || input.acousticElectronicBalance < 0 || input.acousticElectronicBalance > 1) {
    errors.push("musicIdentity.acousticElectronicBalance is invalid.");
  }
  if (typeof input.intensityCeiling !== "number" || input.intensityCeiling < 0.1 || input.intensityCeiling > 0.3) {
    errors.push("musicIdentity.intensityCeiling is invalid.");
  }
  if (input.foregroundRiskCeiling !== undefined &&
      (typeof input.foregroundRiskCeiling !== "number" || input.foregroundRiskCeiling < 0.1 || input.foregroundRiskCeiling > 0.2)) {
    errors.push("musicIdentity.foregroundRiskCeiling is invalid.");
  }
  if (input.silenceRatio !== undefined &&
      (typeof input.silenceRatio.min !== "number" || typeof input.silenceRatio.max !== "number" ||
       input.silenceRatio.min < 0.45 || input.silenceRatio.max > 0.65 ||
       input.silenceRatio.min > input.silenceRatio.max)) {
    errors.push("musicIdentity.silenceRatio is invalid.");
  }
  if (!input.phraseDurationSeconds ||
      typeof input.phraseDurationSeconds.min !== "number" ||
      typeof input.phraseDurationSeconds.max !== "number" ||
      input.phraseDurationSeconds.min < 6 || input.phraseDurationSeconds.max > 14 ||
      input.phraseDurationSeconds.min > input.phraseDurationSeconds.max) {
    errors.push("musicIdentity.phraseDurationSeconds is invalid.");
  }
  if (!input.quietIntervalSeconds ||
      typeof input.quietIntervalSeconds.min !== "number" ||
      typeof input.quietIntervalSeconds.max !== "number" ||
      input.quietIntervalSeconds.min < 8 || input.quietIntervalSeconds.max > 24 ||
      input.quietIntervalSeconds.min > input.quietIntervalSeconds.max) {
    errors.push("musicIdentity.quietIntervalSeconds is invalid.");
  }
  if (!input.loopBoundary ||
      typeof input.loopBoundary.quietWindowSeconds !== "number" ||
      typeof input.loopBoundary.searchWindowSeconds !== "number" ||
      typeof input.loopBoundary.crossfadeSeconds !== "number" ||
      input.loopBoundary.quietWindowSeconds < 2 ||
      input.loopBoundary.searchWindowSeconds < 6 || input.loopBoundary.searchWindowSeconds > 12 ||
      input.loopBoundary.crossfadeSeconds < 1 || input.loopBoundary.crossfadeSeconds > 2.5) {
    errors.push("musicIdentity.loopBoundary is invalid.");
  }
  if (input.role !== "investigation_loop" || input.speechSafe !== true ||
      input.semanticAudioPolicy !== "non_semantic_music_only" || input.instrumental !== true) {
    errors.push("musicIdentity safety contract is invalid.");
  }
  if (!Array.isArray(input.periodCues) || !input.periodCues.every((entry) => typeof entry === "string" && entry.trim()) ||
      !Array.isArray(input.styleBoundaries) || !input.styleBoundaries.every((entry) => typeof entry === "string" && entry.trim())) {
    errors.push("musicIdentity boundary lists are invalid.");
  }
  return errors;
}

export function mansionMusicLensDirectionV1(
  identity: MansionMusicIdentityV1,
  lens: MansionMusicRefractLensV1 | "signature",
): string {
  if (lens === "shadow") {
    return `Shadow lens: arrangement density remains between ${identity.density.min.toFixed(2)} and ${Math.min(identity.density.max, 0.42).toFixed(2)}, with deeper suspended harmony and the same mansion instrumentation.`;
  }
  if (lens === "pulse") {
    return `Pulse lens: investigative motion rises gently within ${identity.tempoBpm.min}-${identity.tempoBpm.max} BPM and below intensity ${identity.intensityCeiling.toFixed(2)}, using the same mansion instrumentation.`;
  }
  if (lens === "atmosphere") {
    return `Atmosphere lens: emphasize ${identity.geography}, ${identity.weather}, and ${identity.architecture} through the same musical palette and non-semantic instrumental texture.`;
  }
  return "Signature lens: balance the complete mansion identity as a restrained investigation theme.";
}

export function validateMansionMusicLoopV1(
  value: unknown,
  durationMs: number,
  identity: MansionMusicIdentityV1,
): string[] {
  if (!value || typeof value !== "object") return ["music loop validation is missing."];
  const input = value as Partial<MansionMusicLoopV1>;
  const errors: string[] = [];
  if (input.version !== 1) errors.push("music loop version is invalid.");
  if (typeof input.loopStartMs !== "number" || !Number.isFinite(input.loopStartMs) || input.loopStartMs < 0) {
    errors.push("music loop start is invalid.");
  }
  if (typeof input.loopEndMs !== "number" || !Number.isFinite(input.loopEndMs) ||
      input.loopEndMs > durationMs || input.loopEndMs < 60_000) {
    errors.push("music loop end is invalid.");
  }
  if (typeof input.loopStartMs === "number" && typeof input.loopEndMs === "number" &&
      input.loopEndMs - input.loopStartMs < 60_000) {
    errors.push("music loop region is too short.");
  }
  const expectedCrossfadeMs = Math.round(identity.loopBoundary.crossfadeSeconds * 1_000);
  if (typeof input.crossfadeMs !== "number" || !Number.isFinite(input.crossfadeMs) ||
      Math.abs(input.crossfadeMs - expectedCrossfadeMs) > 10) {
    errors.push("music loop crossfade is invalid.");
  }
  const allowedSilence = identity.silenceRatio ?? { min: 0.45, max: 0.65 };
  if (typeof input.silenceRatio !== "number" || !Number.isFinite(input.silenceRatio) ||
      input.silenceRatio < allowedSilence.min || input.silenceRatio > allowedSilence.max) {
    errors.push("music loop silence ratio is invalid.");
  }
  return errors;
}
