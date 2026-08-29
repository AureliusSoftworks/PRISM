const MARKED_SPEECH_BLOCK_PATTERN = /(\*{1,3})([^*\r\n]{1,240})\1/gu;
const BRACKETED_ACTION_PATTERN =
  /(?<![\\[])\[([^\[\]\r\n]{1,240})\](?!\])(?!\s*\()/gu;

const PHYSICAL_ACTION_START_PATTERN =
  /^(?:(?:dryly|slowly|quietly|thoughtfully|carefully|softly|theatrically|hesitantly)\s+)?(?:arches?|arching|arranges?|arranging|eyes?|eyeing|glances?|glancing|looks?|looking|nods?|nodding|shrugs?|shrugging|sighs?|sighing|smiles?|smiling|grins?|grinning|frowns?|frowning|pinches?|pinching|winces?|wincing|winks?|winking|grimaces?|grimacing|laughs?|laughing|chuckles?|chuckling|snickers?|snickering|snorts?|snorting|gasps?|gasping|screams?|screaming|dances?|dancing|whispers?|whispering|murmurs?|murmuring|pauses?|pausing|hesitates?|hesitating|stares?|staring|glares?|glaring|gestures?|gesturing|offers?|offering|points?|pointing|waves?|waving|blinks?|blinking|rolls?|rolling|shifts?|shifting|tilts?|tilting|crosses?|crossing|folds?|folding|leans?|leaning|turns?|turning|steps?|stepping|reaches?|reaching|lifts?|lifting|raises?|raising|lowers?|lowering|settles?|settling|regards?|regarding|holds?|holding|draws?|drawing|watches?|watching|straightens?|straightening|releases?|releasing|nudges?|nudging|pulls?|pulling|taps?|tapping|clears?|clearing|swallows?|swallowing|coughs?|coughing|rubs?|rubbing|scratches?|scratching|touches?|touching|wipes?|wiping|sniffs?|sniffing|exhales?|exhaling|inhales?|inhaling|squints?|squinting)\b/iu;

const BODY_ACTION_START_PATTERN =
  /^(?:(?:his|her|their|its)\s+)?(?:antennae?|eyes?|gaze|jaw|mouth|shoulders?|hands?|fingers?|head|tail|ears?)\s+(?:twitch(?:es|ing)?|narrow(?:s|ing)?|widen(?:s|ing)?|shift(?:s|ing)?|drop(?:s|ping)?|rise(?:s|rising)?|turn(?:s|ing)?|tilt(?:s|ing)?|curl(?:s|ing)?|clench(?:es|ing)?|relax(?:es|ing)?|flick(?:s|ing)?|fold(?:s|ing)?|cross(?:es|ing)?|tap(?:s|ping)?|drum(?:s|ming)?|shake(?:s|shaking)?|nod(?:s|ding)?)\b/iu;

const ASTERISK_VOCAL_CUE_TAGS = [
  [/^(?:sighs?|sighing)\b/iu, "sighs"],
  [/^(?:burps?|burping|belches?|belching|eructates?|eructating)\b/iu, "burps"],
  [/^(?:laughs?|laughing|giggles?|giggling)\b/iu, "laughs"],
  [/^(?:bursts?|bursting)\s+(?:out\s+)?(?:into|in)\s+laugh(?:ter|s|ing)?\b/iu, "laughs"],
  [/^(?:bursts?|bursting)\s+out\s+laughing\b/iu, "laughs"],
  [/^(?:chuckles?|chuckling|snickers?|snickering)\b/iu, "chuckles"],
  [/^(?:snorts?|snorting)\b/iu, "snorts"],
  [
    /^(?:farts?|farting|flatulates?|flatulating|toots?|tooting|passes?\s+(?:some\s+)?gas|breaks?\s+wind|broke\s+wind)\b/iu,
    "farts",
  ],
  [/^(?:coughs?|coughing|hacks?|hacking|ahems?|aheming)\b/iu, "coughs"],
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
  [/^(?:speaks?|speaking|says?|saying|talks?|talking)\s+loudly\b/iu, "speaks loudly"],
  [/^(?:raises?|raising)\s+(?:his|her|their|its|the)?\s*voice\b/iu, "speaks loudly"],
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
  [
    /^(?:exhales?|exhaling|breath|breaths|breathe|breathes|breathing|breathes?\s+out)\b/iu,
    "exhales",
  ],
  [/^(?:inhales?|inhaling|breathes?\s+in|takes?\s+(?:a\s+)?breath)\b/iu, "breathes deeply"],
] as const satisfies readonly (readonly [RegExp, string])[];

/** PRISM can own these bodily sounds as bundled local Foley when the caller
 * explicitly guarantees local playback. */
const LOCAL_FOLEY_VOICE_TAGS = new Set([
  "burps",
  "clears throat",
  "coughs",
  "farts",
]);

export interface VoicePerformanceTextOptions {
  /** The first marked block came from PRISM's separate Action field. */
  leadingMarkedAction?: boolean;
  /** Omit provider tags for cues the caller will perform with bundled Foley. */
  omitLocalFoleyTags?: boolean;
}

export interface VoiceSpokenTextOptions {
  /** The first marked block came from PRISM's separate Action field. */
  leadingMarkedAction?: boolean;
}

const CONTROLLED_ELEVENLABS_DIRECTION_TAGS = new Set([
  "angry",
  "excited",
  "nervous",
  "sarcastic",
  "solemn",
]);

export const ASTERISK_HUMAN_SOUND_VOICE_TAGS = [
  ...new Set(ASTERISK_VOCAL_CUE_TAGS.map(([, tag]) => tag)),
] as readonly string[];

function asteriskHumanSoundVoiceTag(inner: string): string | null {
  const normalized = inner.replace(/\s+/gu, " ").trim();
  return (
    ASTERISK_VOCAL_CUE_TAGS.find(([pattern]) => pattern.test(normalized))?.[1] ??
    null
  );
}

function controlledVoicePerformanceTag(inner: string): string | null {
  const normalized = inner.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
  return (
    asteriskHumanSoundVoiceTag(normalized) ??
    (CONTROLLED_ELEVENLABS_DIRECTION_TAGS.has(normalized) ? normalized : null)
  );
}

function isExplicitLeadingMarkedAction(
  before: string,
  options: VoiceSpokenTextOptions,
): boolean {
  return options.leadingMarkedAction === true && before.trim().length === 0;
}

/**
 * Models sometimes nest a quoted sound inside an asterisk action:
 * `*belches with an audible "*burp*"*`. The inner marks shred block parsing
 * into fragments, so fold quoted asterisk tokens back into plain quotes first.
 */
function normalizeNestedActionQuotes(value: string): string {
  return value.replace(/(["“])\*([^*"”\r\n]{1,40})\*(["”])/gu, "$1$2$3");
}

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
  if (/^\s*\[[^\]\r\n]+\]\(prism-bot:\/\/[^)\r\n]+\),?\s*$/u.test(before)) {
    return true;
  }
  if (/\n\s*$/u.test(before) && /^\s*\n/u.test(after)) return true;

  return (
    /[.!?…:;—–]\s*$/u.test(spokenBoundaryBefore) &&
    // A direction may resume into a capitalized sentence, or bridge a trailing
    // pause: "your... *pauses* ...bluntness" is stagecraft, not emphasis.
    (/^[\s"“'‘(\[]*[\p{Lu}\p{N}]/u.test(spokenBoundaryAfter) ||
      /^\s*(?:\.{3}|…)/u.test(spokenBoundaryAfter))
  );
}

/**
 * Removes visually authored actions from base synthesized speech while
 * retaining bot-mention links and words inside ordinary Markdown emphasis.
 * ElevenLabs receives the corresponding actor-facing form from
 * `voicePerformanceTextFromActionCues` instead.
 */
export function voiceSpokenText(
  value: unknown,
  options: VoiceSpokenTextOptions = {},
): string {
  if (typeof value !== "string") return "";
  return collapseRemovedCueWhitespace(
    normalizeNestedActionQuotes(value)
    .replace(BRACKETED_ACTION_PATTERN, " ")
    .replace(
      MARKED_SPEECH_BLOCK_PATTERN,
      (match, _marker: string, inner: string, offset: number, source: string) => {
        if (asteriskHumanSoundVoiceTag(inner)) return " ";
        const before = source.slice(0, offset);
        const after = source.slice(offset + match.length);
        if (isExplicitLeadingMarkedAction(before, options)) return " ";
        return looksLikeMarkedStageDirection(inner, before, after)
          ? " "
          : inner;
      },
    ),
  );
}

/**
 * Gives supported vocal actions an ElevenLabs direction without ever putting
 * visual action prose on mic. Ordinary Markdown emphasis remains spoken.
 */
export function voicePerformanceTextFromActionCues(
  value: unknown,
  options: VoicePerformanceTextOptions = {},
): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeNestedActionQuotes(value);
  let foundActionCue = false;
  const withoutLocalBracketedFoley = normalized.replace(
    BRACKETED_ACTION_PATTERN,
    (_match, inner: string) => {
      const tag = controlledVoicePerformanceTag(inner);
      if (!tag) return " ";
      foundActionCue = true;
      return options.omitLocalFoleyTags &&
        LOCAL_FOLEY_VOICE_TAGS.has(tag)
        ? " "
        : `[${tag}]`;
    },
  );
  const performanceText = withoutLocalBracketedFoley.replace(
    MARKED_SPEECH_BLOCK_PATTERN,
    (match, _marker: string, inner: string, offset: number, source: string) => {
      const tag = controlledVoicePerformanceTag(inner);
      if (tag) {
        foundActionCue = true;
        return options.omitLocalFoleyTags && LOCAL_FOLEY_VOICE_TAGS.has(tag)
          ? " "
          : `[${tag}]`;
      }
      const before = source.slice(0, offset);
      const after = source.slice(offset + match.length);
      if (
        isExplicitLeadingMarkedAction(before, options) ||
        looksLikeMarkedStageDirection(inner, before, after)
      ) {
        return " ";
      }
      return inner;
    },
  );
  if (!foundActionCue) return null;
  return collapseRemovedCueWhitespace(performanceText) || null;
}

/**
 * Collapse whitespace left behind when a cue is lifted out of a line, and close
 * the gap in front of the punctuation that followed it.
 *
 * Every removed direction is substituted with a space, so a mid-sentence cue
 * leaves the sentence's own punctuation stranded: review 70226da8 published
 * "doesn't flicker like it's lying to your face ." to both the transcript and
 * the voice line. Squeezing runs of whitespace never fixed that, because one
 * space before a period is not a run.
 *
 * Only whitespace *before* punctuation is closed. An apostrophe is deliberately
 * not treated as an opening mark — "fixin' to" must survive intact.
 */
export function collapseRemovedCueWhitespace(value: string): string {
  return value
    .replace(/\s+/gu, " ")
    .replace(/\s+([,.;:!?…])/gu, "$1")
    // When a retained performance tag sits between matching separators, keep
    // the separator after the cue: `Okay, [burps],` -> `Okay [burps],`.
    .replace(/([,;:])\s*(\[[^\]\r\n]{1,240}\])\s*\1/gu, " $2$1")
    // A lifted inline cue can leave the same separator on both sides, as in
    // `Okay, [burps],` -> `Okay,,`. Keep the authored separator once.
    .replace(/([,;:])\1+/gu, "$1")
    .replace(/\.{4,}/gu, "...")
    .trim();
}

/** @deprecated Use `voicePerformanceTextFromActionCues`. */
export function voicePerformanceTextFromAsteriskCues(
  value: unknown,
): string | null {
  return voicePerformanceTextFromActionCues(value);
}
