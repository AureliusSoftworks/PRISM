import assert from "node:assert/strict";
import test from "node:test";
import { applyBotPowerMumbledResponseV1 } from "./botPower.ts";
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
  debateActivePresentationDurationMs,
  debateAdvocacyConsentMatchesRouting,
  debateAdvocacyConsentMatchesSelection,
  debateEventIsAtmosphericVocalFoley,
  debateEventIsCanonicalSilence,
  debateSilenceHoldDurationMs,
  debateSourceIdsFromText,
  debateEvidenceItemById,
  debateEvidenceItemCount,
  debateEvidenceTitleCasedForProse,
  debateResolvedEvidenceText,
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
  normalizeDebateSetupSuggestionV1,
  completeDebateSetupSuggestionCastV1,
  normalizeDebateTitle,
  normalizeDebateVoicePerformanceCue,
  normalizeDebateSessionSynopsis,
  resolveDebateForumRoundPlan,
  normalizeDebateSetupPresetId,
  debateDebriefEligibleBots,
  sanitizeDebateDebaterText,
  debateSpeechLooksLikePromptLeak,
  debateClaimSentenceIsProceduralFloorGrant,
  debatePowerCopiesAddressedSpeech,
  debateLatestAddressedPublicSpeech,
  debateLatestCopycatSourceSpeech,
  debatePublicSpeechLooksUnintelligible,
  debateFloorSpeechWarrantsUnintelligibleCutoff,
  sanitizeDebateStatementSources,
  debateSessionAwaitsPresentationSeal,
  debateSessionFloorIsSettled,
  debateSpectatorAwaitingFirstWatch,
  debateSessionAwaitingFirstPresentation,
  debateSessionAwaitingDeferredStart,
  debateJurySeatCount,
  debateRecessResumeFiller,
  debateRecessResumePresentationContent,
  type DebateEventV1,
  type DebateAdvocacyConsent,
} from "./debate.ts";

test("binds affirmative Debate consent to model and Effort but not Turbo", () => {
  const consent: DebateAdvocacyConsent = {
    version: 1,
    format: "forum",
    formality: "parliamentary",
    botId: "bot-1",
    sideId: "for",
    status: "accept",
    reason: "I can argue this fairly.",
    motionHash: "motion-hash",
    botRevision: "bot-revision",
    checkedAt: "2026-08-11T00:00:00.000Z",
    provider: "openai",
    model: "gpt-5.6-sol",
    routingProvider: "openai",
    routingModel: "gpt-5.6-sol",
    routingResponseMode: "online",
    modelSelectionKind: "fixed",
    reasoningEffort: "medium",
  };

  assert.equal(
    debateAdvocacyConsentMatchesRouting(consent, {
      provider: "openai",
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
      responseMode: "online",
      modelSelectionKind: "fixed",
    }),
    true,
  );
  assert.equal(
    debateAdvocacyConsentMatchesRouting(consent, {
      provider: "openai",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      responseMode: "online",
      modelSelectionKind: "fixed",
    }),
    false,
  );
  assert.equal(
    debateAdvocacyConsentMatchesRouting(consent, {
      provider: "openai",
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
      responseMode: "online",
      modelSelectionKind: "fixed",
    }),
    false,
  );
  assert.equal(
    debateAdvocacyConsentMatchesSelection(
      { ...consent, modelSelectionKind: "auto" },
      {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        reasoningEffort: "high",
        responseMode: "online",
        modelSelectionKind: "auto",
      },
    ),
    true,
  );
});

test("auto Forum rounds stay bounded and grow with debate complexity", () => {
  const focusedMotion = normalizeDebateMotionSlateV1({
    motion: "Cats make better pets than dogs.",
    forSide: { label: "Cats", brief: "They fit quiet homes." },
    againstSide: { label: "Dogs", brief: "They offer active companionship." },
  });
  const emptyEvidence = normalizeDebateEvidencePacketV1({});
  assert.deepEqual(resolveDebateForumRoundPlan({
    motion: focusedMotion,
    evidence: emptyEvidence,
  }), {
    mode: "auto",
    count: 1,
    rationale: "Auto chose 1 rebuttal exchange for a focused motion.",
  });

  const complexMotion = normalizeDebateMotionSlateV1({
    motion:
      "Government policy should require technology companies to balance public safety, privacy rights, economic effects, and environmental costs.",
    forSide: { label: "Require it", brief: "benefit ".repeat(170) },
    againstSide: { label: "Reject it", brief: "cost ".repeat(170) },
  });
  const evidence = normalizeDebateEvidencePacketV1({
    sources: [1, 2, 3, 4].map((index) => ({
      id: `source-${index}`,
      title: `Source ${index}`,
      url: `https://example.com/${index}`,
      excerpt: "Evidence.",
    })),
  });
  const auto = resolveDebateForumRoundPlan({
    motion: complexMotion,
    evidence,
  });
  assert.equal(auto.count, 3);
  assert.match(auto.rationale, /multi-factor motion/u);
  assert.match(auto.rationale, /4 frozen evidence items/u);

  assert.equal(resolveDebateForumRoundPlan({
    mode: "fixed",
    count: 2,
    motion: focusedMotion,
    evidence: emptyEvidence,
  }).count, 2);
});

function activeDurationEvent(
  overrides: Partial<DebateEventV1>,
): DebateEventV1 {
  return {
    version: 1,
    id: `event-${String(overrides.sequence ?? 1)}`,
    sequence: overrides.sequence ?? 1,
    phase: "opening",
    stepKey: "opening_for",
    kind: "speech",
    speakerKind: "advocate",
    speakerBotId: "for",
    sideId: "for",
    content: "Short.",
    sourceIds: [],
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

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

test("derives active Debate duration from presented events instead of wall-clock gaps", () => {
  const events = [
    activeDurationEvent({ sequence: 1 }),
    activeDurationEvent({ sequence: 2, stepKey: "pause" }),
    activeDurationEvent({ sequence: 3, stepKey: "resume" }),
    activeDurationEvent({
      sequence: 4,
      kind: "judge_gavel",
      speakerKind: "player",
      speakerBotId: null,
      sideId: null,
      gavelReason: "intervention",
    }),
    activeDurationEvent({
      sequence: 5,
      kind: "case_board",
      speakerKind: "system",
      speakerBotId: null,
      sideId: null,
    }),
    activeDurationEvent({
      sequence: 6,
      kind: "ballot",
      speakerKind: "juror",
      speakerBotId: "juror-1",
      sideId: null,
    }),
  ];

  assert.equal(
    debateActivePresentationDurationMs(events, "spectator"),
    3_060,
  );
  assert.equal(
    debateActivePresentationDurationMs(events, "participant"),
    1_660,
  );
});

test("mute silence holds use intended-speech duration for the comic pause", () => {
  const silent = {
    version: 1 as const,
    id: "silence-1",
    sequence: 1,
    phase: "opening" as const,
    stepKey: "opening_for",
    kind: "silence" as const,
    speakerKind: "advocate" as const,
    speakerBotId: "for-1",
    sideId: "for" as const,
    content: "...",
    powerIntendedContent:
      "Certainly, here is my full opening argument about dignity and public health access.",
    sourceIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
  } satisfies DebateEventV1;
  assert.equal(debateEventIsCanonicalSilence(silent), true);
  const holdMs = debateSilenceHoldDurationMs(silent);
  assert.ok(holdMs >= 1_400);
  assert.ok(holdMs > 900);
  assert.equal(
    debateActivePresentationDurationMs([silent], "spectator"),
    holdMs,
  );
});

test("defaults legacy Debate sessions to a disabled Jury", () => {
  assert.deepEqual(normalizeDebateJuryStateV1(undefined), {
    ...defaultDebateJuryStateV1(),
    discussionTurnTarget: DEBATE_JURY_DISCUSSION_TURNS,
  });
});

test("accepts only bounded Debate voice-performance cues", () => {
  assert.equal(normalizeDebateVoicePerformanceCue(" Solemn "), "solemn");
  assert.equal(normalizeDebateVoicePerformanceCue("[solemn]"), null);
  assert.equal(normalizeDebateVoicePerformanceCue("singing"), null);
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

test("keeps legacy five-juror records readable while capping malformed extra seats", () => {
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
    cadence: "natural-five",
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

test("keeps the expected Jury seat count stable when observer projections hide identities", () => {
  assert.equal(debateJurySeatCount({ cadence: "four-plus-moderator" }), 4);
  assert.equal(debateJurySeatCount({ cadence: "natural-five" }), 5);
});

test("recognizes an untagged saved five-juror record as legacy replay data", () => {
  const jurors = Array.from({ length: 5 }, (_, index) => ({
    role: "juror",
    sideId: null,
    id: `legacy-juror-${index + 1}`,
    name: `Legacy Juror ${index + 1}`,
    source: "generic",
  }));
  const normalized = normalizeDebateJuryStateV1({
    enabled: true,
    phase: "complete",
    jurors,
    finalBallots: jurors.map((juror) => ({
      jurorBotId: juror.id,
      stage: "final",
      sideId: "for",
    })),
  });

  assert.equal(normalized.cadence, "natural-five");
  assert.equal(normalized.jurors.length, 5);
  assert.equal(normalized.finalBallots.length, 5);
  assert.equal(normalized.moderatorBallot, null);
  assert.equal(normalized.majoritySideId, "for");
});

test("normalizes the canonical four jurors plus moderator final ballot", () => {
  const jurors = Array.from({ length: 5 }, (_, index) => ({
    role: "juror",
    sideId: null,
    id: `juror-${index + 1}`,
    name: `Juror ${index + 1}`,
    source: "generic",
  }));
  const normalized = normalizeDebateJuryStateV1({
    enabled: true,
    cadence: "four-plus-moderator",
    phase: "complete",
    jurors,
    finalBallots: jurors.slice(0, 4).map((juror, index) => ({
      jurorBotId: juror.id,
      stage: "final",
      sideId: index < 2 ? "for" : "against",
    })),
    moderatorBallot: { voterBotId: "moderator", sideId: "against" },
  });
  assert.equal(normalized.cadence, "four-plus-moderator");
  assert.equal(normalized.jurors.length, 4);
  assert.equal(normalized.finalBallots.length, 4);
  assert.equal(normalized.moderatorBallot?.voterBotId, "moderator");
  assert.equal(normalized.forVotes, 2);
  assert.equal(normalized.againstVotes, 3);
  assert.equal(normalized.majoritySideId, "against");
});

test("separates executable Debate formats from visible future productions", () => {
  assert.deepEqual(
    DEBATE_FORMATS.map((format) => format.id),
    ["forum", "turnabout", "whodunnit"],
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
        id: "whodunnit",
        productionName: "A Murder Mystery",
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
    rebuttalRound: 1,
    rebuttalRoundTarget: 1,
    rebuttalRoundMode: "fixed",
    rebuttalRoundRationale: "One rebuttal exchange.",
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
  assert.equal(
    debateSpokenText(
      "Moderator: You each have **twelve seconds** for your answer.",
    ),
    "You each have twelve seconds for your answer.",
  );
  assert.equal(
    debateSpokenText("The *important* point still uses single markers."),
    "The *important* point still uses single markers.",
  );
  assert.equal(
    debateResolvedEvidenceText(sanitized.content, evidence),
    "Supply improved housing, but the utensil is bent rusty spoon and this claim is unsupported.",
  );
  assert.equal(
    debateResolvedEvidenceText(
      "Sol clarified that [[exhibit:exhibit-1]] really does support browning.",
      evidence,
    ),
    "Sol clarified that rusty spoon really does support browning.",
  );
  assert.equal(
    debateResolvedEvidenceText(
      "[[exhibit:exhibit-1]] really does support browning.",
      evidence,
    ),
    "Rusty spoon really does support browning.",
  );
  assert.equal(
    debateResolvedEvidenceText(
      "Fair point. [[exhibit:exhibit-1]] still leaves speed unanswered.",
      evidence,
    ),
    "Fair point. Rusty spoon still leaves speed unanswered.",
  );
  assert.equal(
    debateEvidenceTitleCasedForProse("Rusty spoon", "that "),
    "rusty spoon",
  );
  assert.equal(
    debateEvidenceTitleCasedForProse("rusty spoon", ""),
    "Rusty spoon",
  );
});

test("persists debater arguments without stage or delivery modifiers", () => {
  assert.equal(
    sanitizeDebateDebaterText(
      "*yells over the audience* The record is clear. *raises voice* Read the source [[source:housing-1]].",
    ),
    "The record is clear. Read the source [[source:housing-1]].",
  );
  assert.equal(
    sanitizeDebateDebaterText("[excited] This *important* point survives."),
    "This *important* point survives.",
  );
  assert.equal(
    sanitizeDebateDebaterText("The point lands. *burp* Excuse me."),
    "The point lands. *burp* Excuse me.",
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

test("only legacy Spectator floor settlement records await a presentation seal", () => {
  assert.equal(
    debateSessionAwaitsPresentationSeal({
      playerRole: "spectator",
      stepKey: "completed",
      status: "live",
      completedAt: null,
    }),
    true,
  );
  assert.equal(
    debateSessionAwaitsPresentationSeal({
      playerRole: "spectator",
      stepKey: "completed",
      status: "paused",
      completedAt: null,
    }),
    true,
  );
  assert.equal(
    debateSessionAwaitsPresentationSeal({
      playerRole: "spectator",
      stepKey: "completed",
      status: "completed",
      completedAt: "2026-08-04T00:00:00.000Z",
    }),
    false,
  );
  assert.equal(
    debateSessionAwaitsPresentationSeal({
      playerRole: "judge",
      stepKey: "completed",
      status: "completed",
      completedAt: "2026-08-04T00:00:00.000Z",
    }),
    false,
  );
  assert.equal(
    debateSessionFloorIsSettled({ stepKey: "completed", status: "live" }),
    true,
  );
  assert.equal(
    debateSessionFloorIsSettled({ stepKey: "ballot_for", status: "live" }),
    false,
  );
  assert.equal(
    debateSpectatorAwaitingFirstWatch({
      playerRole: "spectator",
      status: "paused",
      pausedPresentationEventId: null,
      events: [activeDurationEvent({})],
      stepKey: "completed",
      completedAt: null,
    }),
    true,
  );
  assert.equal(
    debateSpectatorAwaitingFirstWatch({
      playerRole: "spectator",
      status: "paused",
      pausedPresentationEventId: null,
      events: [activeDurationEvent({})],
      stepKey: "opening_for",
      completedAt: null,
    }),
    true,
  );
  assert.equal(
    debateSpectatorAwaitingFirstWatch({
      playerRole: "spectator",
      status: "paused",
      pausedPresentationEventId: "event-1",
      events: [activeDurationEvent({})],
      stepKey: "completed",
      completedAt: null,
    }),
    false,
  );
  assert.equal(
    debateSpectatorAwaitingFirstWatch({
      playerRole: "spectator",
      status: "live",
      pausedPresentationEventId: null,
      events: [activeDurationEvent({})],
      stepKey: "opening_for",
      completedAt: null,
    }),
    false,
  );
  assert.equal(
    debateSessionAwaitingFirstPresentation({
      status: "paused",
      pausedPresentationEventId: null,
      events: [activeDurationEvent({})],
      completedAt: null,
    }),
    true,
  );
  assert.equal(
    debateSessionAwaitingFirstPresentation({
      status: "paused",
      pausedPresentationEventId: "event-1",
      events: [activeDurationEvent({})],
      completedAt: null,
    }),
    false,
  );
  assert.equal(
    debateSessionAwaitingDeferredStart({
      status: "paused",
      pausedPresentationEventId: null,
      events: [],
      completedAt: null,
      stepKey: "intro",
    }),
    true,
  );
  assert.equal(
    debateSessionAwaitingDeferredStart({
      status: "paused",
      pausedPresentationEventId: null,
      events: [activeDurationEvent({})],
      completedAt: null,
      stepKey: "intro",
    }),
    false,
  );
  assert.equal(
    debateSessionAwaitingDeferredStart({
      status: "live",
      pausedPresentationEventId: null,
      events: [],
      completedAt: null,
      stepKey: "intro",
    }),
    false,
  );
});

test("recess resume fillers stay formality-aware and stable", () => {
  const first = debateRecessResumeFiller({
    formality: "parliamentary",
    sessionId: "debate-a",
    eventId: "speech-1",
    revision: 4,
  });
  const again = debateRecessResumeFiller({
    formality: "parliamentary",
    sessionId: "debate-a",
    eventId: "speech-1",
    revision: 4,
  });
  assert.equal(first, again);
  assert.match(first, /…$/u);
  assert.match(
    debateRecessResumeFiller({
      formality: "free_for_all",
      sessionId: "debate-b",
      eventId: "speech-2",
      revision: 1,
    }),
    /As I was saying|Before the break|Now that we are back|Alright/u,
  );
  assert.equal(
    debateRecessResumePresentationContent("The floor is mine.", first),
    `${first} The floor is mine.`,
  );
  assert.equal(
    debateRecessResumePresentationContent("", "As I was saying…"),
    "As I was saying…",
  );
});

test("normalizeDebateSetupSuggestionV1 accepts a complete New Duel draft", () => {
  const suggestion = normalizeDebateSetupSuggestionV1(
    {
      topic: "Urban wildlife",
      motion: {
        motion: "Cities should rewild vacant lots.",
        forSide: { label: "Rewild", brief: "Habitat restores local ecology." },
        againstSide: {
          label: "Develop",
          brief: "Housing needs the land more urgently.",
        },
      },
      format: "forum",
      formality: "plainspoken",
      forumRoundMode: "auto",
      forumRoundCount: 1,
      juryEnabled: false,
      setupPresetId: "classic-duel",
      forAdvocateBotId: "bot-a",
      againstAdvocateBotId: "bot-b",
      notes: "Keep props playful.",
      exhibits: [
        {
          adjective: "Mossy",
          object: "brick",
          observation: "Moss covers one face of the brick.",
          emoji: "🧱",
        },
        {
          adjective: "Folded",
          object: "permit",
          observation: "The permit is stamped but unsigned.",
          emoji: "📄",
        },
      ],
      sources: [
        {
          id: "web-1",
          title: "Lot study",
          url: "https://example.com/lots",
          snippet: "Vacant lots store carbon.",
        },
      ],
      researchMeta: {
        webQuery: "urban rewilding vacant lots",
        scholarQuery: "urban vacant lot ecology",
        sourcesSkippedReason: null,
      },
    },
    ["bot-a", "bot-b", "bot-c"],
  );
  assert.ok(suggestion);
  assert.equal(suggestion?.forAdvocateBotId, "bot-a");
  assert.equal(suggestion?.againstAdvocateBotId, "bot-b");
  assert.equal(suggestion?.exhibits.length, 2);
  assert.equal(suggestion?.exhibits[0]?.visualKind, "emoji");
  assert.equal(suggestion?.exhibits[0]?.createdBy, "prism");
  assert.equal(suggestion?.exhibits[0]?.id, "exhibit-1");
  assert.equal(suggestion?.sources.length, 1);
  assert.equal(suggestion?.setupPresetId, "classic-duel");
  assert.equal(suggestion?.playerRole, "judge");
  assert.equal(suggestion?.playerSideId, null);
  assert.equal(suggestion?.moderatorBotId, null);
  assert.equal(suggestion?.moderatorTitle, "Moderator");
  assert.equal(suggestion?.juryEnabled, false);
  assert.equal(suggestion?.rhetoricalGambitsEnabled, true);
});

test("normalizeDebateSetupSuggestionV1 syncs Spectator Jury presets and keeps moderator", () => {
  const suggestion = normalizeDebateSetupSuggestionV1(
    {
      topic: "Urban wildlife",
      motion: {
        motion: "Cities should rewild vacant lots.",
        forSide: { label: "Rewild", brief: "Habitat restores local ecology." },
        againstSide: {
          label: "Develop",
          brief: "Housing needs the land more urgently.",
        },
      },
      setupPresetId: "public-forum",
      playerRole: "judge",
      juryEnabled: false,
      moderatorBotId: "bot-c",
      moderatorTitle: "Town Hall Host",
      forAdvocateBotId: "bot-a",
      againstAdvocateBotId: "bot-b",
      exhibits: [
        {
          adjective: "Mossy",
          object: "brick",
          observation: "Moss covers one face of the brick.",
          emoji: "🧱",
        },
        {
          adjective: "Folded",
          object: "permit",
          observation: "The permit is stamped but unsigned.",
          emoji: "📄",
        },
      ],
      researchMeta: {
        webQuery: "",
        scholarQuery: "",
        sourcesSkippedReason: null,
      },
    },
    ["bot-a", "bot-b", "bot-c"],
  );
  assert.ok(suggestion);
  assert.equal(suggestion?.playerRole, "spectator");
  assert.equal(suggestion?.juryEnabled, true);
  assert.equal(suggestion?.formality, "plainspoken");
  assert.equal(suggestion?.moderatorBotId, "bot-c");
  assert.equal(suggestion?.moderatorTitle, "Town Hall Host");
});

test("completeDebateSetupSuggestionCastV1 fills a missing moderator seat", () => {
  const base = normalizeDebateSetupSuggestionV1(
    {
      topic: "Urban wildlife",
      motion: {
        motion: "Cities should rewild vacant lots.",
        forSide: { label: "Rewild", brief: "Habitat restores local ecology." },
        againstSide: {
          label: "Develop",
          brief: "Housing needs the land more urgently.",
        },
      },
      setupPresetId: "take-the-floor",
      playerSideId: "for",
      forAdvocateBotId: "bot-a",
      againstAdvocateBotId: "bot-b",
      exhibits: [
        {
          adjective: "Mossy",
          object: "brick",
          observation: "Moss covers one face of the brick.",
          emoji: "🧱",
        },
        {
          adjective: "Folded",
          object: "permit",
          observation: "The permit is stamped but unsigned.",
          emoji: "📄",
        },
      ],
      researchMeta: {
        webQuery: "",
        scholarQuery: "",
        sourcesSkippedReason: null,
      },
    },
    ["bot-a", "bot-b", "bot-c"],
  );
  assert.ok(base);
  assert.equal(base?.playerRole, "participant");
  assert.equal(base?.moderatorBotId, null);
  const completed = completeDebateSetupSuggestionCastV1(
    base!,
    ["bot-a", "bot-b", "bot-c"],
    () => 0,
  );
  assert.equal(completed.moderatorBotId, "bot-c");
});

test("normalizeDebateSetupSuggestionV1 rejects unknown bots and thin exhibit packs", () => {
  assert.equal(
    normalizeDebateSetupSuggestionV1(
      {
        motion: {
          motion: "Should coffee be free?",
          forSide: { label: "Yes", brief: "Hospitality builds community." },
          againstSide: { label: "No", brief: "Scarcity needs pricing." },
        },
        forAdvocateBotId: "bot-a",
        againstAdvocateBotId: "missing",
        exhibits: [
          { adjective: "Warm", object: "mug", observation: "Steam rises.", emoji: "☕" },
          { adjective: "Torn", object: "receipt", observation: "Ink smudged.", emoji: "🧾" },
        ],
      },
      ["bot-a", "bot-b"],
    ),
    null,
  );
  assert.equal(
    normalizeDebateSetupSuggestionV1(
      {
        motion: {
          motion: "Should coffee be free?",
          forSide: { label: "Yes", brief: "Hospitality builds community." },
          againstSide: { label: "No", brief: "Scarcity needs pricing." },
        },
        forAdvocateBotId: "bot-a",
        againstAdvocateBotId: "bot-b",
        exhibits: [
          { adjective: "Warm", object: "mug", observation: "Steam rises.", emoji: "☕" },
        ],
      },
      ["bot-a", "bot-b"],
    ),
    null,
  );
});

test("rejects Debate production-instruction speech as a prompt leak", () => {
  assert.equal(
    debateSpeechLooksLikePromptLeak(
      'Give the Intrinsic motivation opening argument. Evidence participation assignment: discuss exhibit-1. Return JSON only: {"content":"your public statement","deliveryCue":null}',
    ),
    true,
  );
  assert.equal(
    debateSpeechLooksLikePromptLeak(
      "Passions are fickle: today it’s violin, tomorrow it’s pirate hats.",
    ),
    false,
  );
});

test("keeps floor grants and leaked instructions off the case board", () => {
  assert.equal(
    debateClaimSentenceIsProceduralFloorGrant("Echo Ellen, rebuttal."),
    true,
  );
  assert.equal(
    debateClaimSentenceIsProceduralFloorGrant(
      "Echo Ellen has the scheduled closing.",
    ),
    true,
  );
  assert.equal(
    debateClaimSentenceIsProceduralFloorGrant(
      "Intrinsic motivation is the stronger force that sustains self-directed drive through adversity.",
    ),
    false,
  );
});

test("treats Echo self-cue compiles as addressed-speech copy even with empty effects", () => {
  assert.equal(
    debatePowerCopiesAddressedSpeech({
      powers: [
        {
          version: 1,
          id: "power-copycat",
          name: "Echoes",
          intent: "Can only repeat the latest words spoken directly to her, verbatim.",
          enabled: true,
          compileStatus: "ready",
          compiled: {
            version: 1,
            sourceHash: "v1-echo",
            selfCue:
              "Repeat the latest speech addressed to you verbatim. Say nothing else.",
            observerCue: "Echo Ellen can only echo the latest speech addressed to them.",
            effects: [],
            ruleLabels: ["Echoes addressed speech"],
          },
        },
      ],
    }),
    true,
  );
});

test("copies the latest public line that names the holder, never leaked director notes", () => {
  assert.equal(
    debateLatestAddressedPublicSpeech(
      [
        {
          kind: "speech",
          speakerBotId: "moderator",
          stepKey: "intro",
          content:
            "Echo Ellen speaks for intrinsic motivation; Stewie Griffin speaks for extrinsic factors. Echo Ellen, you’re up first.",
        },
        {
          kind: "speech",
          speakerBotId: "echo",
          stepKey: "opening_for",
          content:
            "Give the Intrinsic motivation opening argument. Return JSON only: {\"content\":\"your public statement\"}",
        },
      ],
      { id: "echo", name: "Echo Ellen" },
    ),
    "Echo Ellen speaks for intrinsic motivation; Stewie Griffin speaks for extrinsic factors. Echo Ellen, you’re up first.",
  );
});

test("Copycat source prefers the opposing floor over a named moderator intro", () => {
  const opposingGibberish = applyBotPowerMumbledResponseV1(
    "Limits keep neighborhoods intact without a citywide rule.",
  );
  assert.equal(
    debateLatestCopycatSourceSpeech(
      [
        {
          kind: "speech",
          speakerBotId: "moderator",
          sideId: null,
          stepKey: "intro",
          content:
            "Copycat Calvin speaks for Build Near Rail. Copycat Calvin, you’re up first.",
        },
        {
          kind: "speech",
          speakerBotId: "calvin",
          sideId: "for",
          stepKey: "opening_for",
          content: "Rail access is the civic spine of this motion.",
        },
        {
          kind: "speech",
          speakerBotId: "nora",
          sideId: "against",
          stepKey: "opening_against",
          content: opposingGibberish,
        },
      ],
      { id: "calvin", sideId: "for" },
    ),
    opposingGibberish,
  );
});

test("Copycat source skips leaks, silence, and the holder's own line", () => {
  assert.equal(
    debateLatestCopycatSourceSpeech(
      [
        {
          kind: "speech",
          speakerBotId: "basil",
          sideId: "against",
          stepKey: "opening_against",
          content: "Return JSON only: {\"content\":\"your public statement\"}",
        },
        {
          kind: "silence",
          speakerBotId: "basil",
          sideId: "against",
          stepKey: "challenge_against",
          content: "...",
        },
        {
          kind: "player_turn",
          speakerBotId: "prism:player-participant",
          sideId: "against",
          stepKey: "rebuttal_against_player",
          content: "Neighborhoods need room to adapt without naming Calvin.",
        },
      ],
      { id: "calvin", sideId: "for" },
    ),
    "Neighborhoods need room to adapt without naming Calvin.",
  );
});

test("Copycat source is available before the holder has spoken", () => {
  assert.equal(
    debateLatestCopycatSourceSpeech(
      [
        {
          kind: "speech",
          speakerBotId: "avery",
          sideId: "for",
          stepKey: "opening_for",
          content: "Rail access is the civic spine of this motion.",
        },
      ],
      { id: "calvin", sideId: "against" },
    ),
    "Rail access is the civic spine of this motion.",
  );
});

test("treats mumbled public floor as unintelligible and mute as not", () => {
  const mumbled = applyBotPowerMumbledResponseV1(
    "Limits keep neighborhoods intact without a citywide rule.",
  );
  assert.equal(debatePublicSpeechLooksUnintelligible(mumbled), true);
  assert.equal(
    debatePublicSpeechLooksUnintelligible(
      "Limits keep neighborhoods intact without a citywide rule.",
    ),
    false,
  );
  assert.equal(debatePublicSpeechLooksUnintelligible("..."), false);
  assert.equal(
    debateFloorSpeechWarrantsUnintelligibleCutoff({
      kind: "speech",
      content: "A clear opening on housing near rail.",
      speakerKind: "advocate",
      speakerEffects: [{ type: "speech_obfuscation", mode: "gibberish" }],
    }),
    true,
  );
  assert.equal(
    debateFloorSpeechWarrantsUnintelligibleCutoff({
      kind: "speech",
      content: mumbled,
      speakerKind: "moderator",
    }),
    false,
  );
  assert.equal(
    debateFloorSpeechWarrantsUnintelligibleCutoff({
      kind: "testimony",
      content: mumbled,
      speakerKind: "advocate",
      speakerEffects: [{ type: "speech_obfuscation", mode: "gibberish" }],
    }),
    true,
  );
  assert.equal(
    debateFloorSpeechWarrantsUnintelligibleCutoff({
      kind: "testimony",
      content:
        "My moon-shaped calculator says red is loud, but the warranty argument is still clear.",
      speakerKind: "advocate",
      speakerEffects: [],
    }),
    false,
  );
});
