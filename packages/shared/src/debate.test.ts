import assert from "node:assert/strict";
import test from "node:test";
import {
  DEBATE_EVIDENCE_ITEM_MAX_COUNT,
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_FORMAT_CATALOG,
  DEBATE_FORMATS,
  DEBATE_FORMALITY_SPECTRUM,
  DEBATE_FORMAT_SCHEMA_VERSION,
  DEBATE_JURY_DISCUSSION_TURNS,
  DEBATE_MODERATOR_TITLE_MAX_LENGTH,
  DEBATE_MOTION_MAX_LENGTH,
  DEBATE_SETUP_PRESETS,
  DEBATE_TITLE_MAX_LENGTH,
  defaultDebateJuryStateV1,
  defaultDebateFormatStateV1,
  debateEventIsAtmosphericVocalFoley,
  debateSourceIdsFromText,
  debateEvidenceItemById,
  debateEvidenceItemCount,
  debateSpokenText,
  debateTitleForMotion,
  debateFormalityGuidance,
  coerceDebateBallotSideId,
  normalizeDebateFormalityId,
  isValidDebateSourceId,
  normalizeDebateEvidencePacketV1,
  normalizeDebateFormatId,
  normalizeDebateFormatStateV1,
  normalizeDebateIdempotencyKey,
  normalizeDebateJuryStateV1,
  normalizeDebateModeratorTitle,
  normalizeDebateMotionSlateV1,
  normalizeDebateTitle,
  normalizeDebateSessionSynopsis,
  normalizeDebateSetupPresetId,
  debateDebriefEligibleBots,
  sanitizeDebateStatementSources,
} from "./debate.ts";

test("publishes five flavor-first Debate setup presets across the formality spectrum", () => {
  assert.deepEqual(
    DEBATE_SETUP_PRESETS.map(
      ({ id, name, formality, format, playerRole, juryEnabled }) => ({
        id,
        name,
        formality,
        format,
        playerRole,
        juryEnabled,
      }),
    ),
    [
      {
        id: "daytime-showdown",
        name: "Daytime Showdown",
        formality: "free_for_all",
        format: "forum",
        playerRole: "spectator",
        juryEnabled: true,
      },
      {
        id: "take-the-floor",
        name: "Crossfire",
        formality: "heated",
        format: "forum",
        playerRole: "participant",
        juryEnabled: false,
      },
      {
        id: "public-forum",
        name: "Town Hall",
        formality: "plainspoken",
        format: "forum",
        playerRole: "spectator",
        juryEnabled: true,
      },
      {
        id: "jury-trial",
        name: "Bench Trial",
        formality: "structured",
        format: "turnabout",
        playerRole: "judge",
        juryEnabled: false,
      },
      {
        id: "classic-duel",
        name: "University Union",
        formality: "parliamentary",
        format: "forum",
        playerRole: "judge",
        juryEnabled: false,
      },
    ],
  );
  assert.deepEqual(
    DEBATE_SETUP_PRESETS.map((preset) => preset.formality).sort(),
    ["free_for_all", "heated", "parliamentary", "plainspoken", "structured"],
  );
  assert.equal(normalizeDebateSetupPresetId("jury-trial"), "jury-trial");
  assert.equal(normalizeDebateSetupPresetId("unknown"), "custom");
  assert.match(
    DEBATE_SETUP_PRESETS[0]?.summary ?? "",
    /personal jabs, cut-ins, moderator warnings/u,
  );
});

test("publishes a stable five-stop Debate formality spectrum with parliamentary legacy default", () => {
  assert.deepEqual(
    DEBATE_FORMALITY_SPECTRUM.map((level) => level.id),
    ["free_for_all", "heated", "plainspoken", "structured", "parliamentary"],
  );
  assert.equal(normalizeDebateFormalityId(undefined), "parliamentary");
  assert.equal(normalizeDebateFormalityId("unknown"), "parliamentary");
  assert.equal(normalizeDebateFormalityId("heated"), "heated");
  assert.match(
    debateFormalityGuidance("free_for_all"),
    /daytime-chaos|theatrical/u,
  );
  assert.match(
    debateFormalityGuidance("plainspoken"),
    /Avoid canned parliamentary or court/u,
  );
  assert.match(
    debateFormalityGuidance("parliamentary"),
    /House, record, proceedings, points/u,
  );
  assert.match(
    debateFormalityGuidance("heated"),
    /challenge motives or credibility/u,
  );
  assert.match(
    debateFormalityGuidance("structured"),
    /formal, direct, and disciplined/u,
  );
});

test("defaults legacy Debate sessions to a disabled Jury", () => {
  assert.deepEqual(normalizeDebateJuryStateV1(undefined), {
    ...defaultDebateJuryStateV1(),
    discussionTurnTarget: DEBATE_JURY_DISCUSSION_TURNS,
  });
});

test("normalizes a frozen moderator title with a safe legacy default", () => {
  assert.equal(normalizeDebateModeratorTitle(undefined), "Moderator");
  assert.equal(normalizeDebateModeratorTitle("   "), "Moderator");
  assert.equal(
    normalizeDebateModeratorTitle("  The Lord,   Your God  "),
    "The Lord, Your God",
  );
  assert.equal(
    normalizeDebateModeratorTitle(
      "T".repeat(DEBATE_MODERATOR_TITLE_MAX_LENGTH + 20),
    ).length,
    DEBATE_MODERATOR_TITLE_MAX_LENGTH,
  );
});

test("migrates seven-seat Jury records to the first five jurors and their ballots", () => {
  const jurors = Array.from({ length: 7 }, (_, index) => ({
    role: "juror",
    sideId: null,
    id: `juror-${index + 1}`,
    name: `Juror ${index + 1}`,
    source: "generic",
  }));
  const ballots = jurors.map((juror) => ({
    jurorBotId: juror.id,
    stage: "final",
    sideId: "for",
  }));
  const normalized = normalizeDebateJuryStateV1({
    enabled: true,
    cadence: "natural-seven",
    phase: "complete",
    jurors,
    forepersonBotId: "juror-1",
    finalBallots: ballots,
    speakerCounts: Object.fromEntries(jurors.map((juror) => [juror.id, 1])),
  });

  assert.equal(normalized.cadence, "natural-five");
  assert.deepEqual(
    normalized.jurors.map((juror) => juror.id),
    ["juror-1", "juror-2", "juror-3", "juror-4", "juror-5"],
  );
  assert.equal(normalized.finalBallots.length, 5);
  assert.equal(normalized.forVotes, 5);
  assert.deepEqual(Object.keys(normalized.speakerCounts), [
    "juror-1",
    "juror-2",
    "juror-3",
    "juror-4",
    "juror-5",
  ]);
});

test("separates executable Debate formats from visible future productions", () => {
  assert.deepEqual(
    DEBATE_FORMATS.map((format) => format.id),
    ["forum", "turnabout"],
  );
  assert.deepEqual(
    DEBATE_FORMAT_CATALOG.map(({ id, productionName, availability }) => ({
      id,
      productionName,
      availability,
    })),
    [
      {
        id: "forum",
        productionName: "Assembly Chamber",
        availability: "available",
      },
      {
        id: "turnabout",
        productionName: "Court of Record",
        availability: "available",
      },
      {
        id: "flyting",
        productionName: "Mead Hall",
        availability: "coming_soon",
      },
      {
        id: "cypher",
        productionName: "The Cypher",
        availability: "coming_soon",
      },
    ],
  );
  assert.equal(normalizeDebateFormatId("flyting"), "forum");
  assert.equal(normalizeDebateFormatId("cypher"), "forum");
});

test("defaults legacy Debate records to Forum and normalizes Turnabout state", () => {
  assert.equal(normalizeDebateFormatId(undefined), "forum");
  assert.deepEqual(defaultDebateFormatStateV1("forum"), {
    version: DEBATE_FORMAT_SCHEMA_VERSION,
    format: "forum",
  });
  const state = normalizeDebateFormatStateV1(
    {
      format: "turnabout",
      phase: "reversal",
      round: 3,
      activeStatementId: "statement-1",
      floorOwnerBotId: "bot-stable-1",
      statements: [
        {
          id: "statement-1",
          sideId: "for",
          speakerBotId: "bot-stable-1",
          content: "A frozen, pressable claim.",
          sourceIds: ["source-1", "bad marker"],
          status: "pressed",
          createdEventId: "event-1",
        },
      ],
      contradictions: [],
    },
    "turnabout",
  );
  assert.equal(state.format, "turnabout");
  assert.equal(state.phase, "reversal");
  assert.equal(state.round, 3);
  assert.equal(state.floorOwnerBotId, "bot-stable-1");
  assert.deepEqual(state.statements[0]?.sourceIds, ["source-1"]);
  assert.equal(
    normalizeDebateFormatStateV1({ version: 1, format: "forum" }, "turnabout")
      .format,
    "turnabout",
  );
});

test("normalizes motion slates and applies stable side-label fallbacks", () => {
  const slate = normalizeDebateMotionSlateV1({
    id: "  slate-a  ",
    motion: `  ${"M".repeat(DEBATE_MOTION_MAX_LENGTH + 20)}  `,
    forSide: { label: "  ", brief: "  Build more homes.  " },
    againstSide: { label: "Preserve", brief: " Protect habitat. " },
  });

  assert.equal(slate.id, "slate-a");
  assert.equal(slate.motion.length, DEBATE_MOTION_MAX_LENGTH);
  assert.equal(slate.forSide.label, "For");
  assert.equal(slate.forSide.brief, "Build more homes.");
  assert.equal(slate.againstSide.label, "Preserve");
});

test("normalizes saved Debate titles and provides rowdiness-aware legacy fallbacks", () => {
  const slate = normalizeDebateMotionSlateV1({
    title: `  ${"T".repeat(DEBATE_TITLE_MAX_LENGTH + 12)}  `,
    motion: "Cities should replace parking with housing.",
    forSide: { label: "Homes", brief: "Build homes." },
    againstSide: { label: "Parking", brief: "Keep parking." },
  });
  assert.equal(slate.title?.length, DEBATE_TITLE_MAX_LENGTH);
  assert.equal(
    debateTitleForMotion({ ...slate, title: undefined }, "free_for_all"),
    "Homes vs. Parking: No Holding Back",
  );
  assert.equal(
    debateTitleForMotion({ ...slate, title: undefined }, "parliamentary"),
    "Homes and Parking: The Motion",
  );
  assert.equal(normalizeDebateTitle("  A   Clean   Clash  "), "A Clean Clash");
});

test("shortens overlong side labels at whole-word boundaries", () => {
  const slate = normalizeDebateMotionSlateV1({
    motion: "The motion.",
    forSide: {
      label: "Pro-Existence – Rationalist Tradition",
      brief: "Argue for the motion.",
    },
    againstSide: {
      label: "Anti-Existence – Scientific & Empirical",
      brief: "Argue against the motion.",
    },
  });

  assert.equal(slate.forSide.label, "Pro-Existence – Rationalist");
  assert.equal(slate.againstSide.label, "Anti-Existence – Scientific");
});

test("freezes only validated, unique evidence sources within the source limit", () => {
  const packet = normalizeDebateEvidencePacketV1({
    notes: "  player notes  ",
    sources: [
      ...Array.from(
        { length: DEBATE_EVIDENCE_SOURCE_MAX_COUNT + 2 },
        (_, index) => ({
          id: `source-${index + 1}`,
          title: `Source ${index + 1}`,
          url: `https://example.com/${index + 1}`,
          snippet: "Evidence",
        }),
      ),
      {
        id: "source-1",
        title: "Duplicate",
        url: "https://example.com/duplicate",
      },
      { id: "bad id", title: "Bad", url: "https://example.com/bad" },
      { id: "local", title: "Bad protocol", url: "file:///tmp/source" },
    ],
  });

  assert.equal(packet.notes, "player notes");
  assert.equal(packet.sources.length, DEBATE_EVIDENCE_SOURCE_MAX_COUNT);
  assert.equal(
    new Set(packet.sources.map((source) => source.id)).size,
    packet.sources.length,
  );
  assert.equal(packet.frozenAt, null);
});

test("normalizes object exhibits into the shared evidence limit", () => {
  const packet = normalizeDebateEvidencePacketV1({
    sources: [
      {
        id: "source-1",
        title: "Source",
        url: "https://example.com/source",
        snippet: "Source evidence",
      },
    ],
    exhibits: Array.from(
      { length: DEBATE_EVIDENCE_ITEM_MAX_COUNT + 2 },
      (_, index) => ({
        id: `exhibit-${index + 1}`,
        adjective: index === 0 ? " rusty old " : "Red",
        object: index === 0 ? " spoon " : `object ${index + 1}`,
        observation: index === 0 ? "It is bent at the handle." : "",
        emoji: index === 0 ? "🥄" : "📦",
        visualKind: index === 0 ? "upload" : "synthesized",
        imageId: index === 0 ? "image-1" : null,
        createdBy: index === 0 ? "player" : "prism",
      }),
    ),
  });

  assert.equal(debateEvidenceItemCount(packet), DEBATE_EVIDENCE_ITEM_MAX_COUNT);
  assert.equal(packet.exhibits?.length, DEBATE_EVIDENCE_ITEM_MAX_COUNT - 1);
  assert.deepEqual(debateEvidenceItemById(packet, "exhibit-1"), {
    kind: "exhibit",
    value: {
      id: "exhibit-1",
      adjective: "rusty",
      object: "spoon",
      title: "Rusty spoon",
      observation: "It is bent at the handle.",
      emoji: "🥄",
      visualKind: "upload",
      imageId: "image-1",
      createdBy: "player",
    },
  });
  assert.equal(
    debateEvidenceItemById(packet, "exhibit-2")?.value.imageId,
    null,
  );
});

test("keeps valid source and exhibit markers, removes invalid markers, and omits all markers from speech", () => {
  const evidence = normalizeDebateEvidencePacketV1({
    sources: [
      {
        id: "housing-1",
        title: "Housing",
        url: "https://example.com/housing",
        snippet: "Housing evidence",
      },
    ],
    exhibits: [
      {
        id: "exhibit-1",
        adjective: "Rusty",
        object: "spoon",
        observation: "The handle is bent.",
        emoji: "🥄",
        visualKind: "emoji",
      },
    ],
  });
  const statement =
    "Supply improved [[source:housing-1]], but the utensil is bent [[exhibit:exhibit-1]] and this claim is unsupported [[source:missing]].";
  const sanitized = sanitizeDebateStatementSources(statement, evidence);

  assert.deepEqual(sanitized.sourceIds, ["housing-1", "exhibit-1"]);
  assert.deepEqual(debateSourceIdsFromText(sanitized.content, evidence), [
    "housing-1",
    "exhibit-1",
  ]);
  assert.equal(sanitized.content.includes("[[source:missing]]"), false);
  assert.equal(
    debateSpokenText(sanitized.content),
    "Supply improved, but the utensil is bent and this claim is unsupported.",
  );
});

test("validates stable source IDs and mutation idempotency keys", () => {
  assert.equal(isValidDebateSourceId("source_12-a"), true);
  assert.equal(isValidDebateSourceId("Source 12"), false);
  assert.equal(
    normalizeDebateIdempotencyKey("debate.advance:1234"),
    "debate.advance:1234",
  );
  assert.equal(normalizeDebateIdempotencyKey("short"), "");
});

test("marks persona-surprise reactions as atmospheric vocal Foley", () => {
  assert.equal(
    debateEventIsAtmosphericVocalFoley({
      kind: "reaction",
      stepKey: "persona_reaction_12",
    }),
    true,
  );
  assert.equal(
    debateEventIsAtmosphericVocalFoley({
      kind: "reaction",
      stepKey: "advocate_closing",
    }),
    false,
  );
  assert.equal(
    debateEventIsAtmosphericVocalFoley({
      kind: "speech",
      stepKey: "persona_reaction_12",
    }),
    false,
  );
});

test("coerceDebateBallotSideId accepts aliases, labels, and nested ballot shapes", () => {
  const motion = normalizeDebateMotionSlateV1({
    motion: "Free will is an illusion.",
    forSide: { label: "Caused Minds", brief: "Causes precede choice." },
    againstSide: { label: "Choosing Selves", brief: "Reflection is freedom." },
  });

  assert.equal(coerceDebateBallotSideId("for"), "for");
  assert.equal(coerceDebateBallotSideId("Against"), "against");
  assert.equal(coerceDebateBallotSideId("Choosing Selves", motion), "against");
  assert.equal(coerceDebateBallotSideId("Caused Minds", motion), "for");
  assert.equal(
    coerceDebateBallotSideId({ sideId: "Choosing Selves" }, motion),
    "against",
  );
  assert.equal(
    coerceDebateBallotSideId({ ballot: { side: "pro" } }, motion),
    "for",
  );
  assert.equal(coerceDebateBallotSideId("maybe both", motion), null);
  assert.equal(coerceDebateBallotSideId(null, motion), null);
});

test("normalizes Debate session synopsis and seals Participant Jury from debrief cast", () => {
  assert.equal(normalizeDebateSessionSynopsis(null), null);
  assert.deepEqual(
    normalizeDebateSessionSynopsis({
      text: "  The chamber closed on a narrow split.  ",
      generatedAt: "2026-08-01T00:00:00.000Z",
    }),
    {
      text: "The chamber closed on a narrow split.",
      generatedAt: "2026-08-01T00:00:00.000Z",
    },
  );

  const bot = {
    version: 1 as const,
    id: "bot-a",
    name: "Ada",
    systemPrompt: "Advocate.",
    role: "advocate" as const,
    sideId: "for" as const,
    color: null,
    glyph: null,
    avatarDetails: null,
    voiceProfile: null,
    powers: [],
    provider: "local" as const,
    model: "local",
    revision: "1",
  };
  const juror = {
    ...bot,
    id: "juror-1",
    name: "Juror One",
    role: "juror" as const,
    sideId: null,
    source: "library" as const,
  };
  const session = {
    moderator: { ...bot, id: "mod", name: "Mod", role: "moderator" as const, sideId: null },
    forAdvocate: bot,
    againstAdvocate: { ...bot, id: "bot-b", name: "Bea", sideId: "against" as const },
    jury: {
      ...defaultDebateJuryStateV1(),
      enabled: true,
      jurors: [juror],
    },
    playerRole: "participant" as const,
  };
  assert.deepEqual(
    debateDebriefEligibleBots(session).map((entry) => entry.id),
    ["mod", "bot-a", "bot-b"],
  );
  assert.ok(
    debateDebriefEligibleBots({
      ...session,
      playerRole: "spectator",
    }).some((entry) => entry.id === "juror-1"),
  );
});
