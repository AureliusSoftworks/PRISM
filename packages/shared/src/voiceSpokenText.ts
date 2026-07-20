const MARKED_SPEECH_BLOCK_PATTERN = /(\*{1,3})([^*\r\n]{1,240})\1/gu;

const PHYSICAL_ACTION_START_PATTERN =
  /^(?:(?:dryly|slowly|quietly|thoughtfully|carefully|softly|theatrically|hesitantly)\s+)?(?:arches?|arching|arranges?|arranging|eyes?|eyeing|glances?|glancing|looks?|looking|nods?|nodding|shrugs?|shrugging|sighs?|sighing|smiles?|smiling|grins?|grinning|frowns?|frowning|pinches?|pinching|winces?|wincing|grimaces?|grimacing|laughs?|laughing|chuckles?|chuckling|snickers?|snickering|snorts?|snorting|whispers?|whispering|murmurs?|murmuring|pauses?|pausing|hesitates?|hesitating|stares?|staring|glares?|glaring|gestures?|gesturing|points?|pointing|waves?|waving|blinks?|blinking|rolls?|rolling|shifts?|shifting|tilts?|tilting|crosses?|crossing|folds?|folding|leans?|leaning|turns?|turning|steps?|stepping|reaches?|reaching|lifts?|lifting|raises?|raising|lowers?|lowering|settles?|settling|regards?|regarding|holds?|holding|draws?|drawing|watches?|watching|straightens?|straightening|releases?|releasing|nudges?|nudging|pulls?|pulling|taps?|tapping|clears?|clearing|swallows?|swallowing|coughs?|coughing|rubs?|rubbing|scratches?|scratching|touches?|touching|wipes?|wiping|sniffs?|sniffing|exhales?|exhaling|inhales?|inhaling|squints?|squinting)\b/iu;

const BODY_ACTION_START_PATTERN =
  /^(?:(?:his|her|their|its)\s+)?(?:antennae?|eyes?|gaze|jaw|mouth|shoulders?|hands?|fingers?|head|tail|ears?)\s+(?:twitch(?:es|ing)?|narrow(?:s|ing)?|widen(?:s|ing)?|shift(?:s|ing)?|drop(?:s|ping)?|rise(?:s|rising)?|turn(?:s|ing)?|tilt(?:s|ing)?|curl(?:s|ing)?|clench(?:es|ing)?|relax(?:es|ing)?|flick(?:s|ing)?|fold(?:s|ing)?|cross(?:es|ing)?|tap(?:s|ping)?|drum(?:s|ming)?|shake(?:s|shaking)?|nod(?:s|ding)?)\b/iu;

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
