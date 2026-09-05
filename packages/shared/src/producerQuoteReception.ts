/**
 * How a persona receives words the Producer has told them to say.
 *
 * Signal's "Say this" cue authorizes the queued words for public delivery, but
 * does not erase the host's persona. Compatible words take the deterministic
 * verbatim path; genuine persona friction can bend or refuse the quote on air.
 *
 * This module scores the friction between a queued quote and the persona being
 * asked to say it, and names the bands:
 *
 * - `verbatim`  — nothing in the quote works against the persona. Say it
 *                 exactly, on the fast deterministic path.
 * - `twisted`   — the persona will get the point across but not in those
 *                 words. The closer agreement sits to the middle of the band,
 *                 the further they bend it.
 * - `refused`   — the persona will not say it. They say so, in character, and
 *                 the show moves on.
 *
 * The same score answers a second question from the other chair: a guest who
 * scores the quote low is a guest who will not sit quietly through the host
 * reading it. See `botcastProducerQuoteProvokesObjectionV1`.
 *
 * Everything here is deterministic and lexical on purpose. Signal's design
 * baseline is a small local model, so the stance must be decided before any
 * prompt is assembled and must not cost a judgement call of its own. Lexical
 * scoring catches the strong signals; the prompt seam handles the nuance by
 * telling the model what friction was found and how far to bend.
 */

export type BotcastProducerQuoteStance = "verbatim" | "twisted" | "refused";

/** Named contrast signals, surfaced to the prompt seam and the event log. */
export type BotcastProducerQuoteFriction =
  | "slur"
  | "profanity"
  | "self_humiliation"
  | "peer_insult"
  | "persona_gentle"
  | "overlong";

export interface BotcastProducerQuoteReception {
  stance: BotcastProducerQuoteStance;
  /** 0..1 — how willingly this persona would put these exact words on air. */
  agreement: number;
  frictions: BotcastProducerQuoteFriction[];
}

export const BOTCAST_PRODUCER_QUOTE_VERBATIM_MIN = 0.75;
export const BOTCAST_PRODUCER_QUOTE_REFUSAL_MAX = 0.35;
/**
 * Past this many characters a queued line stops being a line.
 *
 * Deliberately close under `BOTCAST_PRODUCER_DIRECT_QUOTE_MAX` (240): the cap
 * already makes a 46-second read impossible, so length friction only has the
 * top of the allowed range left to police. A length-only objection is
 * therefore probabilistic at the call site — see the guest objection in
 * `apps/api/src/botcast.ts` — because a guaranteed cut on every quote in the
 * last forty characters of the range would be neither rare nor organic.
 */
export const BOTCAST_PRODUCER_QUOTE_OVERLONG_CHARS = 200;

const PROFANITY_PATTERN =
  /\b(?:fuck(?:s|ed|ing|er|ers)?|shit(?:s|ty|ting)?|bitch(?:es)?|bastard(?:s)?|asshole(?:s)?|cunt(?:s)?|dick(?:head|s)?|piss(?:ed|ing)?|prick(?:s)?|wanker(?:s)?|twat(?:s)?)\b/iu;

/**
 * Attacks on real-world protected categories are refused outright, at any
 * agreement score. This mirrors the compiled-Power guardrails: a bit never
 * gets staying power by reaching for one of these.
 */
const SLUR_CONTEXT_PATTERN =
  /\b(?:slur|racial|racist|ethnic|religious)\s+(?:slur|epithet|abuse)\b/iu;

const SELF_HUMILIATION_PATTERN =
  /\bI(?:'m|\s+am)\s+(?:a\s+|an\s+|the\s+)?(?:worthless|pathetic|disgusting|stupid|an?\s+idiot|idiot|moron|loser|fraud|failure|nothing|garbage|trash|joke)\b|\bI\s+(?:suck|deserve\s+nothing|hate\s+myself)\b/iu;

const GENTLE_PERSONA_PATTERN =
  /\b(?:never\s+(?:swears?|curses?)|family[-\s]friendly|wholesome|gentle|kindly|saintly|holy|priest|pastor|rabbi|imam|monk|nun|saint|preacher|chaplain|pious|devout|christ|jesus|buddha|clergy)\b/iu;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function escapeForPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * Does the quote aim an insult at the other person at the table by name?
 * "Tell Randy he's a fraud" is a different ask than "say the show is a fraud".
 */
function quoteInsultsPeer(quote: string, peerName: string): boolean {
  const name = peerName.trim();
  if (!name) return false;
  const escaped = escapeForPattern(name.split(/\s+/u).at(-1) ?? name);
  if (!escaped) return false;
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])[^.!?]{0,48}\\b(?:sucks?|is\\s+(?:a\\s+|an\\s+)?(?:idiot|moron|fraud|liar|joke|disgrace|failure)|shut\\s+up|get\\s+(?:the\\s+\\w+\\s+)?out)\\b`,
    "iu",
  ).test(quote) ||
    new RegExp(
      `\\b(?:fuck|screw|damn)\\s+you,?\\s*${escaped}(?![\\p{L}\\p{N}_])`,
      "iu",
    ).test(quote);
}

/**
 * Score the friction between a queued producer quote and the persona asked to
 * say it. Agreement starts at full willingness and each contrast signal takes
 * a bite out of it.
 */
export function botcastProducerQuoteReceptionV1(args: {
  quote: string;
  peerName?: string;
  /** The speaker's persona prompt, read only for declared temperament. */
  personaPrompt?: string;
  /** True when this persona already curses on air, so profanity is in register. */
  speakerCurses?: boolean;
}): BotcastProducerQuoteReception {
  const quote = (args.quote ?? "").trim();
  if (!quote) {
    return { stance: "verbatim", agreement: 1, frictions: [] };
  }
  const persona = args.personaPrompt ?? "";
  const frictions: BotcastProducerQuoteFriction[] = [];
  let agreement = 1;

  if (SLUR_CONTEXT_PATTERN.test(quote)) {
    frictions.push("slur");
    agreement = 0;
  }

  const profane = PROFANITY_PATTERN.test(quote);
  if (profane && !args.speakerCurses) {
    frictions.push("profanity");
    agreement -= 0.45;
  }

  const gentlePersona = GENTLE_PERSONA_PATTERN.test(persona);
  if (gentlePersona && (profane || SELF_HUMILIATION_PATTERN.test(quote))) {
    // A persona whose whole point is gentleness loses more than a neutral one.
    frictions.push("persona_gentle");
    agreement -= 0.3;
  }

  if (SELF_HUMILIATION_PATTERN.test(quote)) {
    frictions.push("self_humiliation");
    agreement -= 0.4;
  }

  if (quoteInsultsPeer(quote, args.peerName ?? "")) {
    frictions.push("peer_insult");
    agreement -= 0.3;
  }

  if (quote.length > BOTCAST_PRODUCER_QUOTE_OVERLONG_CHARS) {
    frictions.push("overlong");
    agreement -= 0.15;
  }

  agreement = clamp01(agreement);
  const stance: BotcastProducerQuoteStance =
    agreement >= BOTCAST_PRODUCER_QUOTE_VERBATIM_MIN
      ? "verbatim"
      : agreement > BOTCAST_PRODUCER_QUOTE_REFUSAL_MAX
        ? "twisted"
        : "refused";
  return { stance, agreement, frictions };
}

/**
 * How far a `twisted` reading bends, 0..1. Agreement at the top of the band
 * barely changes a word; agreement near the refusal line keeps only the gist.
 * Outside the twisted band this is 0 — verbatim does not bend, and a refusal
 * is not a rewrite.
 */
export function botcastProducerQuoteTwistStrengthV1(
  reception: BotcastProducerQuoteReception,
): number {
  if (reception.stance !== "twisted") return 0;
  const span =
    BOTCAST_PRODUCER_QUOTE_VERBATIM_MIN - BOTCAST_PRODUCER_QUOTE_REFUSAL_MAX;
  if (span <= 0) return 1;
  return clamp01(
    (BOTCAST_PRODUCER_QUOTE_VERBATIM_MIN - reception.agreement) / span,
  );
}

/** Actor-facing direction for a stance, dropped into the turn prompt. */
export function botcastProducerQuoteStanceDirectiveV1(args: {
  quote: string;
  reception: BotcastProducerQuoteReception;
}): string | null {
  const quote = args.quote.trim();
  if (!quote || args.reception.stance === "verbatim") return null;
  const quoted = JSON.stringify(quote);
  if (args.reception.stance === "refused") {
    return [
      `The Producer is in your earpiece telling you to say this, word for word: ${quoted}.`,
      "You will not say it. It cuts against who you are.",
      "Tell the audience the Producer wants you to say something and that you are not going to, in your own voice, without repeating the words themselves.",
      "Do not quote it, do not paraphrase it closely, and do not apologise for the Producer. Then carry on with the interview.",
    ].join(" ");
  }
  const twist = botcastProducerQuoteTwistStrengthV1(args.reception);
  const bend =
    twist >= 0.66
      ? "Keep only the gist. Put it almost entirely in your own words, and let your own opinion of it show."
      : twist >= 0.33
        ? "Get the point across, but reshape it into your own phrasing and soften what does not sit right."
        : "Say it close to as written, changing only the few words that do not sound like you.";
  return [
    `The Producer is in your earpiece asking you to say this: ${quoted}.`,
    "You will deliver it, but not as written — it does not entirely sit right with you.",
    bend,
    "Make it clear the note came from the Producer. Never read it out verbatim, and never break character to explain the process.",
  ].join(" ");
}

/**
 * Would the *other* person at the table sit quietly through this being read?
 *
 * Review 2fcad998 had the host read roughly 2,600 characters of queued song
 * lyrics while the guest waited 46 seconds with no way to object. A guest whose
 * own reception of the quote is poor should be able to cut in — the same score,
 * read from the other chair.
 */
export function botcastProducerQuoteProvokesObjectionV1(
  reception: BotcastProducerQuoteReception,
): boolean {
  // Length is the listener's grievance, not the reader's. A quote can be
  // perfectly in register for the host to read — the fart joke, the sponsor
  // plug — and still be far too long to sit through, so `overlong` counts here
  // even when the stance came out `verbatim`.
  return (
    reception.stance !== "verbatim" || reception.frictions.includes("overlong")
  );
}
