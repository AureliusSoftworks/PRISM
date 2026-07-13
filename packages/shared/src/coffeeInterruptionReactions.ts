export type CoffeeReactionStyle = "neutral" | "warm" | "concise" | "playful" | "formal";
export type CoffeeReactionTone = "surprised" | "annoyed" | "firm" | "wounded";
export type CoffeeReactionOutcome = "react" | "yield" | "resume";

const OPENERS: Record<CoffeeReactionStyle, Record<CoffeeReactionTone, readonly string[]>> = {
  neutral: {
    surprised: ["Oh.", "Well, that happened."],
    annoyed: ["Was that really necessary?", "I wasn't finished."],
    firm: ["Let me finish.", "That was my turn."],
    wounded: ["Right. I see.", "I suppose that answers that."],
  },
  warm: {
    surprised: ["Oh—okay.", "All right, give me a second."],
    annoyed: ["Could you let me land the thought?", "I was almost there."],
    firm: ["Please let me finish.", "Hold on; I still have the floor."],
    wounded: ["That felt a little sharp.", "I didn't expect to be cut off like that."],
  },
  concise: {
    surprised: ["Oh.", "Noted."],
    annoyed: ["I wasn't done.", "Really?"],
    firm: ["Let me finish.", "My turn."],
    wounded: ["Fine.", "Understood."],
  },
  playful: {
    surprised: ["Plot twist.", "Oh, we're doing that now?"],
    annoyed: ["Rude, but efficient.", "Wow. Tiny conversational ambush."],
    firm: ["Put the hook away; I'm finishing.", "Cute interruption. Still my turn."],
    wounded: ["And here I thought I had the microphone.", "Oof. Straight off the stage."],
  },
  formal: {
    surprised: ["I beg your pardon.", "That was unexpected."],
    annoyed: ["I had not concluded.", "The interruption was unnecessary."],
    firm: ["Permit me to finish.", "I must insist on completing the point."],
    wounded: ["Very well.", "I understand that my contribution is not wanted."],
  },
};

const CLOSERS: Record<CoffeeReactionOutcome, readonly string[]> = {
  react: [
    "",
    "That was the point.",
    "I noticed.",
    "Let's not make a habit of it.",
    "All right.",
  ],
  yield: [
    "Go on, then.",
    "I'll wait.",
    "The floor is yours.",
    "Fine; carry on.",
    "I'll leave it there.",
  ],
  resume: [
    "As I was saying—",
    "Now, may I continue?",
    "I'd like to finish the thought.",
    "Let me pick that back up.",
    "May I have the floor again?",
  ],
};

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return length > 0 ? (hash >>> 0) % length : 0;
}

/** Compositional bank: 5 styles × 4 tones × 2 openers × 3 outcomes × 5 closers. */
export function coffeeInterruptionReactionCandidates(
  style: CoffeeReactionStyle,
  tone: CoffeeReactionTone,
  outcome: CoffeeReactionOutcome
): string[] {
  const openers = OPENERS[style][tone];
  const closers = CLOSERS[outcome];
  return openers.flatMap((opener) =>
    closers.map((closer) => `${opener}${closer ? ` ${closer}` : ""}`.trim())
  );
}

export function pickCoffeeInterruptionReaction(args: {
  style: CoffeeReactionStyle;
  tone: CoffeeReactionTone;
  outcome: CoffeeReactionOutcome;
  seed: string;
  avoid?: readonly string[];
}): string {
  const candidates = coffeeInterruptionReactionCandidates(args.style, args.tone, args.outcome);
  const avoided = new Set((args.avoid ?? []).map((line) => line.trim().toLowerCase()));
  const start = stableIndex(args.seed, candidates.length);
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(start + offset) % candidates.length] ?? candidates[0] ?? "Really?";
    if (!avoided.has(candidate.toLowerCase())) return candidate;
  }
  return candidates[start] ?? "Really?";
}
