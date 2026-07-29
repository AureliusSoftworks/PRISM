import assert from "node:assert/strict";
import test from "node:test";
import {
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_FORMAT_CATALOG,
  DEBATE_FORMATS,
  DEBATE_FORMAT_SCHEMA_VERSION,
  DEBATE_MOTION_MAX_LENGTH,
  defaultDebateFormatStateV1,
  debateSourceIdsFromText,
  debateSpokenText,
  isValidDebateSourceId,
  normalizeDebateEvidencePacketV1,
  normalizeDebateFormatId,
  normalizeDebateFormatStateV1,
  normalizeDebateIdempotencyKey,
  normalizeDebateMotionSlateV1,
  sanitizeDebateStatementSources,
} from "./debate.ts";

test("separates executable Debate formats from visible future productions", () => {
  assert.deepEqual(
    DEBATE_FORMATS.map((format) => format.id),
    ["forum", "turnabout"],
  );
  assert.deepEqual(
    DEBATE_FORMAT_CATALOG.map(
      ({ id, productionName, availability }) => ({
        id,
        productionName,
        availability,
      }),
    ),
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
    normalizeDebateFormatStateV1(
      { version: 1, format: "forum" },
      "turnabout",
    ).format,
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
      ...Array.from({ length: DEBATE_EVIDENCE_SOURCE_MAX_COUNT + 2 }, (_, index) => ({
        id: `source-${index + 1}`,
        title: `Source ${index + 1}`,
        url: `https://example.com/${index + 1}`,
        snippet: "Evidence",
      })),
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
  assert.equal(new Set(packet.sources.map((source) => source.id)).size, packet.sources.length);
  assert.equal(packet.frozenAt, null);
});

test("keeps valid source markers, removes invalid markers, and omits all markers from speech", () => {
  const evidence = normalizeDebateEvidencePacketV1({
    sources: [
      {
        id: "housing-1",
        title: "Housing",
        url: "https://example.com/housing",
        snippet: "Housing evidence",
      },
    ],
  });
  const statement =
    "Supply improved [[source:housing-1]], but this claim is unsupported [[source:missing]].";
  const sanitized = sanitizeDebateStatementSources(statement, evidence);

  assert.deepEqual(sanitized.sourceIds, ["housing-1"]);
  assert.deepEqual(debateSourceIdsFromText(sanitized.content, evidence), ["housing-1"]);
  assert.equal(sanitized.content.includes("[[source:missing]]"), false);
  assert.equal(
    debateSpokenText(sanitized.content),
    "Supply improved, but this claim is unsupported.",
  );
});

test("validates stable source IDs and mutation idempotency keys", () => {
  assert.equal(isValidDebateSourceId("source_12-a"), true);
  assert.equal(isValidDebateSourceId("Source 12"), false);
  assert.equal(normalizeDebateIdempotencyKey("debate.advance:1234"), "debate.advance:1234");
  assert.equal(normalizeDebateIdempotencyKey("short"), "");
});
