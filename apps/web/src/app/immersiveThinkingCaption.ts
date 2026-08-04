export interface ImmersiveThinkingPersona {
  id?: string | null;
  name?: string | null;
  systemPrompt?: string | null;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function stableCaption(
  captions: readonly string[],
  salt: string,
): string {
  return (
    captions[stableHash(salt) % captions.length] ??
    captions[0] ??
    "Thinking…"
  );
}

const PERSONA_CAPTIONS: ReadonlyArray<{
  matches: RegExp;
  captions: readonly string[];
}> = [
  {
    matches: /(?:^|\b)(?:rick sanchez|rick)(?:\b|$)/iu,
    captions: [
      "Tuning portal gun…",
      "Checking interdimensional coordinates…",
      "Ignoring safety protocols…",
    ],
  },
  {
    matches: /(?:^|\b)(?:donald trump|trump)(?:\b|$)/iu,
    captions: [
      "Planning next term…",
      "Drafting the headline…",
      "Sizing up the room…",
    ],
  },
  {
    matches: /(?:^|\b)darth vader(?:\b|$)/iu,
    captions: [
      "Consulting the dark side…",
      "Tightening his grip…",
      "Considering the disturbance…",
    ],
  },
  {
    matches: /(?:^|\b)leonardo da vinci(?:\b|$)/iu,
    captions: [
      "Sketching a mechanism…",
      "Turning the page sideways…",
      "Testing a new proportion…",
    ],
  },
  {
    matches: /(?:^|\b)jesus christ(?:\b|$)/iu,
    captions: [
      "Preparing a parable…",
      "Gathering the thread…",
      "Making room for grace…",
    ],
  },
];

const THEME_CAPTIONS: ReadonlyArray<{
  matches: RegExp;
  captions: readonly string[];
}> = [
  {
    matches:
      /\b(?:portal|interdimensional|scientist|science|laboratory|inventor|engineer)\b/iu,
    captions: [
      "Calibrating the apparatus…",
      "Testing a theory…",
      "Running the numbers…",
    ],
  },
  {
    matches:
      /\b(?:president|presidential|campaign|politic\w*|election|government|deal-making)\b/iu,
    captions: [
      "Reading the room…",
      "Planning the next move…",
      "Framing the argument…",
    ],
  },
  {
    matches:
      /\b(?:artist|painter|sculptor|composer|poet|writer|architect)\b/iu,
    captions: [
      "Sketching the shape…",
      "Choosing the composition…",
      "Following the motif…",
    ],
  },
  {
    matches: /\b(?:philosoph|psycholog|therap|analyst|mystic|spiritual)\w*\b/iu,
    captions: [
      "Turning the question over…",
      "Tracing the deeper pattern…",
      "Listening beneath the words…",
    ],
  },
  {
    matches: /\b(?:detective|investigator|mystery|forensic|evidence)\b/iu,
    captions: [
      "Following the clues…",
      "Reconstructing the scene…",
      "Testing the alibi…",
    ],
  },
];

const FALLBACK_CAPTIONS = [
  "Following the thread…",
  "Choosing the right words…",
  "Reading the room…",
  "Turning it over…",
  "Finding the angle…",
] as const;

/**
 * Pick a short, local-only activity caption for waiting surfaces. This is
 * presentation flavor, not a claim about model reasoning or hidden thought.
 */
export function immersiveThinkingCaption(
  persona: ImmersiveThinkingPersona | null | undefined,
  turnSalt: string,
): string {
  const identity = `${persona?.id ?? ""} ${persona?.name ?? ""}`.trim();
  const context = `${identity} ${persona?.systemPrompt ?? ""}`.trim();
  const named = PERSONA_CAPTIONS.find(({ matches }) => matches.test(identity));
  const themed = THEME_CAPTIONS.find(({ matches }) => matches.test(context));
  const captions = named?.captions ?? themed?.captions ?? FALLBACK_CAPTIONS;
  return stableCaption(captions, `${identity || "prism"}:${turnSalt}`);
}
