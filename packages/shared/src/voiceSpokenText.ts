const MARKED_SPEECH_BLOCK_PATTERN = /(\*{1,3})([^*\r\n]{1,240})\1/gu;

const PHYSICAL_ACTION_START_PATTERN =
  /^(?:(?:dryly|slowly|quietly|thoughtfully|carefully|softly|theatrically|hesitantly)\s+)?(?:arches?|arching|arranges?|arranging|eyes?|eyeing|glances?|glancing|looks?|looking|nods?|nodding|shrugs?|shrugging|sighs?|sighing|smiles?|smiling|grins?|grinning|frowns?|frowning|pinches?|pinching|winces?|wincing|grimaces?|grimacing|laughs?|laughing|chuckles?|chuckling|snickers?|snickering|snorts?|snorting|whispers?|whispering|murmurs?|murmuring|pauses?|pausing|hesitates?|hesitating|stares?|staring|glares?|glaring|gestures?|gesturing|points?|pointing|waves?|waving|blinks?|blinking|rolls?|rolling|shifts?|shifting|tilts?|tilting|crosses?|crossing|folds?|folding|leans?|leaning|turns?|turning|steps?|stepping|reaches?|reaching|lifts?|lifting|raises?|raising|lowers?|lowering|settles?|settling|regards?|regarding|holds?|holding|draws?|drawing|watches?|watching|straightens?|straightening|releases?|releasing|nudges?|nudging|pulls?|pulling|taps?|tapping|clears?|clearing|swallows?|swallowing|coughs?|coughing|rubs?|rubbing|scratches?|scratching|touches?|touching|wipes?|wiping|sniffs?|sniffing|exhales?|exhaling|inhales?|inhaling|squints?|squinting)\b/iu;

const BODY_ACTION_START_PATTERN =
  /^(?:(?:his|her|their|its)\s+)?(?:antennae?|eyes?|gaze|jaw|mouth|shoulders?|hands?|fingers?|head|tail|ears?)\s+(?:twitch(?:es|ing)?|narrow(?:s|ing)?|widen(?:s|ing)?|shift(?:s|ing)?|drop(?:s|ping)?|rise(?:s|rising)?|turn(?:s|ing)?|tilt(?:s|ing)?|curl(?:s|ing)?|clench(?:es|ing)?|relax(?:es|ing)?|flick(?:s|ing)?|fold(?:s|ing)?|cross(?:es|ing)?|tap(?:s|ping)?|drum(?:s|ming)?|shake(?:s|shaking)?|nod(?:s|ding)?)\b/iu;

const ASTERISK_VOCAL_CUE_TAGS = [
  [/^(?:sighs?|sighing)\b/iu, "sighs"],
  [/^(?:burps?|burping|belches?|belching)\b/iu, "burps"],
  [/^(?:laughs?|laughing|giggles?|giggling)\b/iu, "laughs"],
  [/^(?:chuckles?|chuckling|snickers?|snickering)\b/iu, "chuckles"],
  [/^(?:snorts?|snorting)\b/iu, "snorts"],
  [/^(?:farts?|farting|passes?\s+gas)\b/iu, "farts"],
  [/^(?:coughs?|coughing)\b/iu, "coughs"],
  [/^(?:clears?|clearing)\s+(?:his|her|their|its|the)?\s*throat\b/iu, "clears throat"],
  [/^(?:gasps?|gasping)\b/iu, "gasps"],
  [/^(?:gulps?|gulping|swallows?|swallowing)\b/iu, "gulps"],
  [/^(?:growls?|growling)\b/iu, "growls"],
  [/^(?:sneezes?|sneezing)\b/iu, "sneezes"],
  [/^(?:hiccups?|hiccupping|hiccoughs?|hiccoughing)\b/iu, "hiccups"],
  [/^(?:yawns?|yawning)\b/iu, "yawns"],
  [/^(?:hums?|humming)\b/iu, "hums"],
  [/^(?:whistles?|whistling)\b/iu, "whistles"],
  [/^(?:whispers?|whispering|murmurs?|murmuring)\b/iu, "whispers"],
  [/^(?:sings?|singing)\b/iu, "sings"],
  [/^(?:sobs?|sobbing|cries|crying|whimpers?|whimpering)\b/iu, "sobs"],
  [/^(?:groans?|groaning|moans?|moaning)\b/iu, "groans"],
  [/^(?:sniffs?|sniffing)\b/iu, "sniffs"],
  [/^(?:screams?|screaming|shrieks?|shrieking)\b/iu, "screams"],
  [/^(?:shouts?|shouting|yells?|yelling)\b/iu, "shouts"],
  [/^(?:slurps?|slurping)\b/iu, "slurps"],
  [/^(?:smacks?|smacking)\s+(?:his|her|their|its)?\s*lips\b/iu, "smacks lips"],
  [/^(?:clicks?|clicking)\s+(?:his|her|their|its)?\s*tongue\b/iu, "clicks tongue"],
  [/^(?:claps?|clapping)\b/iu, "claps"],
  [/^(?:snaps?|snapping)\s+(?:his|her|their|its)?\s*fingers?\b/iu, "snaps fingers"],
  [/^(?:blows?|blowing)\s+(?:a\s+)?raspberry\b/iu, "blows raspberry"],
  [/^(?:achoo|atchoo)\b/iu, "sneezes"],
  [/^(?:hic|hiccup)\b/iu, "hiccups"],
  [/^(?:mwah|muah)\b/iu, "kisses"],
  [/^(?:tsk|tut)\b/iu, "clicks tongue"],
  [/^(?:exhales?|exhaling|breathes?\s+out)\b/iu, "exhales"],
  [/^(?:inhales?|inhaling|breathes?\s+in|takes?\s+(?:a\s+)?breath)\b/iu, "breathes deeply"],
] as const satisfies readonly (readonly [RegExp, string])[];

function looksLikeMarkedStageDirection(
  inner: string,
  before: string,
  after: string,
): boolean {
  const normalized = inner.replace(/\s+/gu, " ").trim();
  if (
    !normalized ||
    (!PHYSICAL_ACTION_START_PATTERN.test(normalized) &&
      !BODY_ACTION_START_PATTERN.test(normalized))
  ) {
    return false;
  }

  const spokenBoundaryBefore = before.replace(/\[[^\]\r\n]{1,64}\]/gu, " ");
  const spokenBoundaryAfter = after.replace(/\[[^\]\r\n]{1,64}\]/gu, " ");
  const hasSpokenBefore = /[\p{L}\p{N}]/u.test(spokenBoundaryBefore);
  const hasSpokenAfter = /[\p{L}\p{N}]/u.test(spokenBoundaryAfter);
  if (!hasSpokenBefore || !hasSpokenAfter) return true;
  if (/\n\s*$/u.test(before) && /^\s*\n/u.test(after)) return true;

  return (
    /[.!?…:;—–]\s*$/u.test(spokenBoundaryBefore) &&
    /^[\s"“'‘(\[]*[\p{Lu}\p{N}]/u.test(spokenBoundaryAfter)
  );
}

/**
 * Removes visually authored physical actions from synthesized speech while
 * retaining the words inside ordinary Markdown emphasis.
 */
export function voiceSpokenText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(
      MARKED_SPEECH_BLOCK_PATTERN,
      (match, _marker: string, inner: string, offset: number, source: string) => {
        const before = source.slice(0, offset);
        const after = source.slice(offset + match.length);
        return looksLikeMarkedStageDirection(inner, before, after)
          ? " "
          : inner;
      },
    )
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * Turns explicit human-performed sound beats in asterisks into actor-facing
 * performance tags while leaving ordinary emphasis and physical action rules
 * to `voiceSpokenText`. Returns null when no vocal cue was authored.
 */
export function voicePerformanceTextFromAsteriskCues(
  value: unknown,
): string | null {
  if (typeof value !== "string") return null;
  let foundVocalCue = false;
  const performanceText = value.replace(
    MARKED_SPEECH_BLOCK_PATTERN,
    (match, _marker: string, inner: string) => {
      const normalized = inner.replace(/\s+/gu, " ").trim();
      const mapping = ASTERISK_VOCAL_CUE_TAGS.find(([pattern]) =>
        pattern.test(normalized),
      );
      if (!mapping) return match;
      foundVocalCue = true;
      return `[${mapping[1]}]`;
    },
  );
  return foundVocalCue ? voiceSpokenText(performanceText) : null;
}
