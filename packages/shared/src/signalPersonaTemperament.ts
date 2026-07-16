export const SIGNAL_PERSONA_TEMPERAMENTS = [
  "commanding",
  "contemplative",
  "playful",
  "analytical",
  "inventive",
  "warm",
  "creative",
  "adventurous",
  "neutral",
] as const;

export type SignalPersonaTemperament =
  (typeof SIGNAL_PERSONA_TEMPERAMENTS)[number];

export interface SignalPersonaTemperamentMatch {
  temperament: Exclude<SignalPersonaTemperament, "neutral">;
  direction: string;
  score: number;
}

type TemperamentDefinition = Omit<SignalPersonaTemperamentMatch, "score"> & {
  cues: readonly RegExp[];
};

const SIGNAL_PERSONA_TEMPERAMENT_DEFINITIONS: readonly TemperamentDefinition[] = [
  {
    temperament: "commanding",
    direction: "disciplined gravity, restraint, and controlled tension",
    cues: [
      /\bauthorit(?:y|arian)\b/iu,
      /\bcommand(?:er|ing)?\b/iu,
      /\bdisciplin(?:e|ed|arian)\b/iu,
      /\bcontrol(?:led|ling)?\b/iu,
      /\bpower(?:ful)?\b/iu,
      /\bintimidat(?:e|ing|ion)\b/iu,
      /\bruthless(?:ly)?\b/iu,
      /\bsevere\b/iu,
      /\bempire\b/iu,
      /\benforcer\b/iu,
      /\bfear(?:ed|some)?\b/iu,
      /\bmilitary\b/iu,
      /\bdomin(?:ance|ant|ate)\b/iu,
      /\border\b/iu,
    ],
  },
  {
    temperament: "contemplative",
    direction: "contemplative depth, paradox, and a quiet center",
    cues: [
      /\bphilosoph(?:y|ical|er)\b/iu,
      /\bwisdom\b/iu,
      /\bmeaning\b/iu,
      /\btruth\b/iu,
      /\bcontemplati(?:ve|on)\b/iu,
      /\breflect(?:ive|ion|s)?\b/iu,
      /\bmeditati(?:ve|on)\b/iu,
      /\bstoic(?:ism)?\b/iu,
    ],
  },
  {
    temperament: "playful",
    direction: "playful curiosity, buoyancy, and an unexpected turn",
    cues: [
      /\bplayful(?:ly|ness)?\b/iu,
      /\bfunny\b/iu,
      /\bhumou?r(?:ous)?\b/iu,
      /\bwhims(?:y|ical)\b/iu,
      /\boptimis(?:m|tic)\b/iu,
      /\bcheerful(?:ly)?\b/iu,
      /\bmischie(?:f|vous)\b/iu,
      /\bsilly\b/iu,
      /\bjoyful(?:ly)?\b/iu,
      /\babsurd(?:ity)?\b/iu,
    ],
  },
  {
    temperament: "analytical",
    direction: "analytical precision, discovery, and a revealing interruption",
    cues: [
      /\bforensic\b/iu,
      /\bdetective\b/iu,
      /\bevidence\b/iu,
      /\binvestigat(?:e|ive|ion|or)\b/iu,
      /\banalyt(?:ic|ical|ics)\b/iu,
      /\bprecis(?:e|ion)\b/iu,
      /\bmethodical(?:ly)?\b/iu,
    ],
  },
  {
    temperament: "inventive",
    direction: "inventive rigor, elegant mechanics, and forward motion",
    cues: [
      /\binvent(?:or|ive|ion)\b/iu,
      /\bengineer(?:ing)?\b/iu,
      /\bscientist\b/iu,
      /\btechnical\b/iu,
      /\bresearch(?:er)?\b/iu,
      /\blogic(?:al)?\b/iu,
      /\bmechanic(?:al|s)?\b/iu,
    ],
  },
  {
    temperament: "warm",
    direction: "warm attention, openness, and a protected inner space",
    cues: [
      /\bkind(?:ness)?\b/iu,
      /\bwarm(?:th)?\b/iu,
      /\bempath(?:y|etic)\b/iu,
      /\bgentle(?:ness|ly)?\b/iu,
      /\bnurtur(?:e|ing)\b/iu,
      /\bcompassion(?:ate)?\b/iu,
      /\btender(?:ness|ly)?\b/iu,
      /\bfriendly\b/iu,
    ],
  },
  {
    temperament: "creative",
    direction: "creative fluency, expressive rhythm, and confident asymmetry",
    cues: [
      /\bartist(?:ic)?\b/iu,
      /\bcreativ(?:e|ity)\b/iu,
      /\bpaint(?:er|ing)?\b/iu,
      /\bmusic(?:al)?\b/iu,
      /\bmusician\b/iu,
      /\bwriter\b/iu,
      /\bimagin(?:ation|ative)\b/iu,
      /\bpoet(?:ic|ry)?\b/iu,
      /\bdesigner\b/iu,
    ],
  },
  {
    temperament: "adventurous",
    direction: "exploration, momentum, and a clear point beyond the frame",
    cues: [
      /\badventur(?:e|ous)\b/iu,
      /\bexplor(?:e|ation|er)\b/iu,
      /\bheroic\b/iu,
      /\bjourney\b/iu,
      /\bdiscovery\b/iu,
      /\bdaring\b/iu,
      /\bexpedition\b/iu,
    ],
  },
] as const;

function personaSource(systemPrompt: string | null | undefined): string {
  const raw = systemPrompt ?? "";
  const metaStart = raw.lastIndexOf("<<<PRISM_BOT_META>>>");
  const withoutMetadata = metaStart >= 0 &&
      raw.slice(metaStart).includes("<<<END_PRISM_BOT_META>>>")
    ? raw.slice(0, metaStart)
    : raw;
  return withoutMetadata
    .replace(/\s+/gu, " ")
    .trim();
}

/** Ranks broad, provider-safe temperaments from host-authored persona prose. */
export function rankSignalPersonaTemperaments(
  systemPrompt: string | null | undefined,
): SignalPersonaTemperamentMatch[] {
  const source = personaSource(systemPrompt);
  if (!source) return [];
  return SIGNAL_PERSONA_TEMPERAMENT_DEFINITIONS
    .map((definition, index) => ({
      temperament: definition.temperament,
      direction: definition.direction,
      score: definition.cues.reduce(
        (total, cue) => total + Number(cue.test(source)),
        0,
      ),
      index,
    }))
    .filter((match) => match.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ temperament, direction, score }) => ({
      temperament,
      direction,
      score,
    }));
}

export function signalPersonaTemperamentFor(
  systemPrompt: string | null | undefined,
): SignalPersonaTemperament {
  return rankSignalPersonaTemperaments(systemPrompt)[0]?.temperament ?? "neutral";
}
