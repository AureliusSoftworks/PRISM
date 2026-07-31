import type { DebateAudiencePressureBand } from "@localai/shared";
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
const DEBATE_AUDIENCE_PRESSURE_MIX = {
  settled: { background: 0.1, grain: 0, foley: 0.3 },
  murmuring: { background: 0.24, grain: 0.1, foley: 0.3 },
  restless: { background: 0.28, grain: 0.26, foley: 0.3 },
  disruptive: { background: 0.3, grain: 0.4, foley: 0.3 },
} as const satisfies Record<DebateAudiencePressureBand, SessionAtmosphereMix>;

function stableHash(text: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function debateAudiencePressureMix(
  band: DebateAudiencePressureBand,
): SessionAtmosphereMix {
  return DEBATE_AUDIENCE_PRESSURE_MIX[band];
}

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
