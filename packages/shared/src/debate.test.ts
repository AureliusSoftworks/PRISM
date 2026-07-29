import assert from "node:assert/strict";
import test from "node:test";
import {
  DEBATE_EVIDENCE_SOURCE_MAX_COUNT,
  DEBATE_MOTION_MAX_LENGTH,
  debateSourceIdsFromText,
  debateSpokenText,
  isValidDebateSourceId,
  normalizeDebateEvidencePacketV1,
  normalizeDebateIdempotencyKey,
  normalizeDebateMotionSlateV1,
  sanitizeDebateStatementSources,
} from "./debate.ts";

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
