import type {
  DebateAudiencePressureBand,
  DebateFormalityId,
} from "@localai/shared";
import type { SessionAtmosphereMix } from "./session-atmosphere-audio.ts";

export {
  DEBATE_AUDIENCE_INITIAL_PRESSURE,
  DEBATE_AUDIENCE_MONOLOGUE_FULL_BY,
  DEBATE_AUDIENCE_MONOLOGUE_QUIET_UNTIL,
  debateAudienceMonologueSilenceGate,
  debateAudiencePressureBand,
  debateAudiencePressureScore,
} from "@localai/shared";
export type {
  DebateAudiencePressureBand,
  DebateAudiencePressureReaction,
} from "@localai/shared";

/** Beds share one chamber, so preserve headroom for gavel and reaction Foley. */
export const DEBATE_AUDIENCE_MIX_BED_CEILING = 0.7;

/**
 * How hard the gallery bed pushes for each frozen Rowdiness choice.
 * Daytime Showdown locks free_for_all — the loudest, messiest end.
 */
export const DEBATE_AUDIENCE_FORMALITY_LOUDNESS = {
  parliamentary: 0.52,
  structured: 0.68,
  plainspoken: 0.84,
  heated: 1,
  free_for_all: 1.28,
} as const satisfies Record<DebateFormalityId, number>;

/**
 * Anchor mixes at band thresholds — interpolated by live pressure score.
 * Disruptive leans hard into crosstalk (grain) so it stays audible past Restless
 * even after the shared bed ceiling clamps total murmur+crosstalk.
 */
const DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS = {
  settled: { background: 0.12, grain: 0.04, foley: 0.3 },
  murmuring: { background: 0.26, grain: 0.16, foley: 0.3 },
  restless: { background: 0.32, grain: 0.34, foley: 0.3 },
  disruptive: { background: 0.34, grain: 0.52, foley: 0.3 },
} as const satisfies Record<DebateAudiencePressureBand, SessionAtmosphereMix>;

/** @deprecated Prefer debateAudiencePressureMixForScore for a smooth curve. */
const DEBATE_AUDIENCE_PRESSURE_MIX = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS;

const DEBATE_AUDIENCE_BAND_SCORE = {
  settled: 0,
  murmuring: 20,
  restless: 45,
  disruptive: 70,
} as const satisfies Record<DebateAudiencePressureBand, number>;

function stableHash(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampPressure(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * clampUnit(t);
}

function scaleMixBed(
  mix: SessionAtmosphereMix,
  loudness: number,
): SessionAtmosphereMix {
  const background = mix.background * loudness;
  const grain = mix.grain * loudness;
  const bed = background + grain;
  if (bed <= DEBATE_AUDIENCE_MIX_BED_CEILING || bed <= 0) {
    return { background, grain, foley: mix.foley };
  }
  // Prefer keeping crosstalk (grain) when the shared bed hits the ceiling.
  // Equal shrink used to collapse free_for_all Disruptive into Restless.
  const excess = bed - DEBATE_AUDIENCE_MIX_BED_CEILING;
  const backgroundCut = Math.min(background * 0.72, excess);
  const grainCut = Math.max(0, excess - backgroundCut);
  return {
    background: Math.max(0, background - backgroundCut),
    grain: Math.max(0, grain - grainCut),
    foley: mix.foley,
  };
}

/** Apply the alignment Gallery fader to murmur/crosstalk without touching Foley. */
export function scaleDebateAudienceMixByGalleryVolume(
  mix: SessionAtmosphereMix,
  galleryVolume: number,
): SessionAtmosphereMix {
  const level = Number.isFinite(galleryVolume) ? Math.max(0, galleryVolume) : 1;
  return {
    background: mix.background * level,
    grain: mix.grain * level,
    foley: mix.foley,
  };
}

function interpolatePressureMix(
  score: number,
): SessionAtmosphereMix {
  const pressure = clampPressure(score);
  if (pressure <= DEBATE_AUDIENCE_BAND_SCORE.murmuring) {
    const t =
      pressure / Math.max(1, DEBATE_AUDIENCE_BAND_SCORE.murmuring);
    const from = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.settled;
    const to = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.murmuring;
    return {
      background: lerp(from.background, to.background, t),
      grain: lerp(from.grain, to.grain, t),
      foley: from.foley,
    };
  }
  if (pressure <= DEBATE_AUDIENCE_BAND_SCORE.restless) {
    const span =
      DEBATE_AUDIENCE_BAND_SCORE.restless -
      DEBATE_AUDIENCE_BAND_SCORE.murmuring;
    const t =
      (pressure - DEBATE_AUDIENCE_BAND_SCORE.murmuring) / Math.max(1, span);
    const from = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.murmuring;
    const to = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.restless;
    return {
      background: lerp(from.background, to.background, t),
      grain: lerp(from.grain, to.grain, t),
      foley: from.foley,
    };
  }
  if (pressure <= DEBATE_AUDIENCE_BAND_SCORE.disruptive) {
    const span =
      DEBATE_AUDIENCE_BAND_SCORE.disruptive -
      DEBATE_AUDIENCE_BAND_SCORE.restless;
    const t =
      (pressure - DEBATE_AUDIENCE_BAND_SCORE.restless) / Math.max(1, span);
    const from = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.restless;
    const to = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.disruptive;
    return {
      background: lerp(from.background, to.background, t),
      grain: lerp(from.grain, to.grain, t),
      foley: from.foley,
    };
  }
  const overflow = (pressure - DEBATE_AUDIENCE_BAND_SCORE.disruptive) / 30;
  const peak = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.disruptive;
  return {
    background: lerp(peak.background, peak.background + 0.06, overflow),
    grain: lerp(peak.grain, peak.grain + 0.08, overflow),
    foley: peak.foley,
  };
}

export function debateAudienceFormalityLoudness(
  formality: DebateFormalityId,
): number {
  return DEBATE_AUDIENCE_FORMALITY_LOUDNESS[formality];
}

/**
 * Discrete band mix (legacy). Prefer {@link debateAudiencePressureMixForScore}
 * so the room swells continuously instead of stair-stepping.
 */
export function debateAudiencePressureMix(
  band: DebateAudiencePressureBand,
  formality: DebateFormalityId = "plainspoken",
): SessionAtmosphereMix {
  return scaleMixBed(
    DEBATE_AUDIENCE_PRESSURE_MIX[band],
    debateAudienceFormalityLoudness(formality),
  );
}

/** Smooth gallery bed from live pressure + frozen Rowdiness. */
export function debateAudiencePressureMixForScore(
  score: number,
  formality: DebateFormalityId,
): SessionAtmosphereMix {
  return scaleMixBed(
    interpolatePressureMix(score),
    debateAudienceFormalityLoudness(formality),
  );
}

/**
 * Peak bed while the moderator calls the gallery to order. Hotter Rowdiness
 * stays louder under the gavel — never ducks to silence.
 */
export function debateAudienceOrderCallMix(
  formality: DebateFormalityId,
): SessionAtmosphereMix {
  const loudness = debateAudienceFormalityLoudness(formality);
  const peak = DEBATE_AUDIENCE_PRESSURE_MIX_ANCHORS.disruptive;
  return scaleMixBed(
    {
      background: peak.background + 0.08,
      grain: peak.grain + 0.1,
      foley: peak.foley,
    },
    Math.max(1, loudness),
  );
}

/** Hold the rowdy peak under the order call before easing room tone back. */
export const DEBATE_AUDIENCE_ORDER_PEAK_HOLD_MS = 1_350;

/** Ease from order-call peak back toward settled room tone. */
export const DEBATE_AUDIENCE_ORDER_RETURN_MS = 2_800;

/** Continuous pressure-band mix transitions (not the order-call special case). */
export const DEBATE_AUDIENCE_PRESSURE_MIX_TRANSITION_MS = 1_400;

export function debateAudienceTalkerIndices(args: {
  band: DebateAudiencePressureBand;
  count: number;
  seed: string;
}): number[] {
  const count = Math.max(0, Math.floor(args.count));
  const talkerCount =
    args.band === "settled"
      ? 0
      : args.band === "murmuring"
        ? Math.min(2, count)
        : args.band === "restless"
          ? Math.ceil(count / 2)
          : Math.max(0, count - 1);
  return Array.from({ length: count }, (_, index) => index)
    .sort(
      (left, right) =>
        stableHash(`${args.seed}:${left}`) -
        stableHash(`${args.seed}:${right}`),
    )
    .slice(0, talkerCount)
    .sort((left, right) => left - right);
}

/**
 * Under reduced material quality, keep visual chatter at murmuring even when
 * the scored pressure band is hotter. Audio mix can still use the true band.
 */
export function debateAudienceVisualPressureBand(
  band: DebateAudiencePressureBand,
  materialQuality: "full" | "balanced" | "minimal",
): DebateAudiencePressureBand {
  if (materialQuality === "full") return band;
  if (band === "settled") return "settled";
  return "murmuring";
}
