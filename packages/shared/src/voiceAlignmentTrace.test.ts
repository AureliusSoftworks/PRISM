import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveVoiceAlignmentStatusV1,
  exportVoiceAlignmentTraceJsonV1,
  measureVoiceAlignmentTraceV1,
  normalizeVoiceAlignmentTraceV1,
  validateVoiceAlignmentTraceV1,
  voiceAlignmentOriginIsAuthoritativeV1,
} from "./voiceAlignmentTrace.ts";

function traceInput(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    utteranceId: "utterance-1",
    surface: "voice-sync-lab",
    engine: {
      requested: "builtin",
      resolved: "local-instant",
      provider: "prism",
      model: null,
    },
    alignmentStatus: "aligned",
    alignmentReason: null,
    sourceText: "Ah",
    spokenText: "Ah",
    sampleRate: 1_000,
    frameCount: 1_000,
    articulation: { startFrame: 100, endFrame: 900 },
    presentation: { startFrame: 0, endFrame: 1_000 },
    phonemeSpans: [
      {
        startFrame: 100,
        endFrame: 900,
        origin: "engine",
        confidence: 1,
        sourceStart: 0,
        sourceEnd: 2,
        phoneme: "ɑ",
      },
    ],
    visemeSpans: [
      {
        startFrame: 100,
        endFrame: 900,
        origin: "generated",
        confidence: 1,
        sourceStart: 0,
        sourceEnd: 2,
        viseme: "open-wide",
      },
    ],
    speechSpans: [
      {
        startFrame: 100,
        endFrame: 900,
        origin: "engine",
        confidence: 1,
      },
    ],
    silenceSpans: [
      {
        startFrame: 0,
        endFrame: 100,
        origin: "generated",
        confidence: 1,
      },
      {
        startFrame: 900,
        endFrame: 1_000,
        origin: "generated",
        confidence: 1,
      },
    ],
    mouthTransitions: [
      { atFrame: 100, from: "closed", to: "open-wide", open: true },
      { atFrame: 900, from: "open-wide", to: "closed", open: false },
    ],
    ...overrides,
  };
}

describe("voice alignment trace authority", () => {
  it("never calls heuristic-only or forced-aligner-only timing aligned", () => {
    for (const origin of ["heuristic", "forced-aligner"] as const) {
      const trace = normalizeVoiceAlignmentTraceV1(
        traceInput({
          phonemeSpans: [
            {
              startFrame: 100,
              endFrame: 900,
              origin,
              confidence: 0.5,
              sourceStart: 0,
              sourceEnd: 2,
              phoneme: "ɑ",
            },
          ],
          visemeSpans: [
            {
              startFrame: 100,
              endFrame: 900,
              origin,
              confidence: 0.5,
              sourceStart: 0,
              sourceEnd: 2,
              viseme: "open-wide",
            },
          ],
        }),
      );
      assert.equal(trace.alignmentStatus, "unaligned");
    }
  });

  it("requires authoritative phoneme and viseme tracks for aligned status", () => {
    const complete = normalizeVoiceAlignmentTraceV1(traceInput());
    assert.equal(complete.alignmentStatus, "aligned");
    assert.equal(
      deriveVoiceAlignmentStatusV1({
        phonemeSpans: complete.phonemeSpans,
        visemeSpans: [],
      }),
      "partial",
    );
    assert.equal(
      normalizeVoiceAlignmentTraceV1(
        traceInput({ visemeSpans: [] }),
      ).alignmentStatus,
      "partial",
    );
    assert.equal(
      normalizeVoiceAlignmentTraceV1(
        traceInput({ alignmentStatus: "unaligned" }),
      ).alignmentStatus,
      "unaligned",
      "normalization must respect an explicit conservative downgrade",
    );
    assert.equal(voiceAlignmentOriginIsAuthoritativeV1("provider"), true);
    assert.equal(voiceAlignmentOriginIsAuthoritativeV1("generated"), true);
    assert.equal(voiceAlignmentOriginIsAuthoritativeV1("measured"), false);
    assert.equal(voiceAlignmentOriginIsAuthoritativeV1("heuristic"), false);
  });

  it("requires authoritative phoneme and viseme coverage across every speech frame", () => {
    const missingTail = normalizeVoiceAlignmentTraceV1(
      traceInput({
        phonemeSpans: [
          {
            startFrame: 100,
            endFrame: 899,
            origin: "engine",
            confidence: 1,
            sourceStart: 0,
            sourceEnd: 2,
            phoneme: "ɑ",
          },
        ],
      }),
    );
    assert.equal(missingTail.alignmentStatus, "partial");
    const falseCompleteClaim = validateVoiceAlignmentTraceV1({
      ...missingTail,
      alignmentStatus: "aligned",
    });
    assert.equal(falseCompleteClaim.valid, false);
    assert.ok(
      falseCompleteClaim.issues.some(
        (issue) =>
          issue.path === "alignmentStatus" && issue.code === "invariant",
      ),
    );

    const interiorGap = normalizeVoiceAlignmentTraceV1(
      traceInput({
        visemeSpans: [
          {
            startFrame: 100,
            endFrame: 450,
            origin: "engine",
            confidence: 1,
            sourceStart: 0,
            sourceEnd: 1,
            viseme: "open-wide",
          },
          {
            startFrame: 451,
            endFrame: 900,
            origin: "engine",
            confidence: 1,
            sourceStart: 1,
            sourceEnd: 2,
            viseme: "open-wide",
          },
        ],
      }),
    );
    assert.equal(interiorGap.alignmentStatus, "partial");

    const noMeasuredSpeech = normalizeVoiceAlignmentTraceV1(
      traceInput({ speechSpans: [] }),
    );
    assert.equal(noMeasuredSpeech.alignmentStatus, "partial");
  });

  it("allows adjacent authoritative spans while ignoring silence gaps", () => {
    const trace = normalizeVoiceAlignmentTraceV1(
      traceInput({
        speechSpans: [
          {
            startFrame: 100,
            endFrame: 300,
            origin: "measured",
            confidence: null,
          },
          {
            startFrame: 500,
            endFrame: 900,
            origin: "measured",
            confidence: null,
          },
        ],
        phonemeSpans: [
          {
            startFrame: 100,
            endFrame: 200,
            origin: "engine",
            confidence: 1,
            sourceStart: 0,
            sourceEnd: 1,
            phoneme: "ɑ",
          },
          {
            startFrame: 200,
            endFrame: 300,
            origin: "engine",
            confidence: 1,
            sourceStart: 1,
            sourceEnd: 2,
            phoneme: "h",
          },
          {
            startFrame: 500,
            endFrame: 900,
            origin: "engine",
            confidence: 1,
            sourceStart: 0,
            sourceEnd: 2,
            phoneme: "ɑ",
          },
        ],
        visemeSpans: [
          {
            startFrame: 100,
            endFrame: 300,
            origin: "generated",
            confidence: 1,
            sourceStart: 0,
            sourceEnd: 2,
            viseme: "open-wide",
          },
          {
            startFrame: 500,
            endFrame: 700,
            origin: "generated",
            confidence: 1,
            sourceStart: 0,
            sourceEnd: 1,
            viseme: "open-wide",
          },
          {
            startFrame: 700,
            endFrame: 900,
            origin: "generated",
            confidence: 1,
            sourceStart: 1,
            sourceEnd: 2,
            viseme: "speech-closed",
          },
        ],
        silenceSpans: [
          {
            startFrame: 0,
            endFrame: 100,
            origin: "measured",
            confidence: null,
          },
          {
            startFrame: 300,
            endFrame: 500,
            origin: "measured",
            confidence: null,
          },
          {
            startFrame: 900,
            endFrame: 1_000,
            origin: "measured",
            confidence: null,
          },
        ],
      }),
    );
    assert.equal(trace.alignmentStatus, "aligned");
  });

  it("keeps authoritative character timing separate from heuristic visemes", () => {
    const trace = normalizeVoiceAlignmentTraceV1(
      traceInput({
        characterSpans: [
          {
            startFrame: 100,
            endFrame: 900,
            origin: "provider",
            confidence: 1,
            sourceStart: 0,
            sourceEnd: 2,
            character: "Ah",
          },
        ],
        phonemeSpans: [],
        visemeSpans: [
          {
            startFrame: 100,
            endFrame: 900,
            origin: "heuristic",
            confidence: 0.5,
            sourceStart: 0,
            sourceEnd: 2,
            viseme: "open-wide",
          },
        ],
      }),
    );

    assert.equal(trace.alignmentStatus, "partial");
    assert.equal(trace.characterSpans[0]?.origin, "provider");
    assert.equal(trace.visemeSpans[0]?.origin, "heuristic");
  });
});

describe("voice alignment trace measurements", () => {
  it("measures signed lead, lag, drift, and open-mouth silence", () => {
    const trace = normalizeVoiceAlignmentTraceV1(
      traceInput({
        mouthTransitions: [
          { atFrame: 80, from: "closed", to: "open-wide", open: true },
          { atFrame: 920, from: "open-wide", to: "closed", open: false },
        ],
      }),
    );

    assert.deepEqual(trace.metrics, {
      speechStartFrame: 100,
      speechEndFrame: 900,
      mouthStartFrame: 80,
      mouthEndFrame: 920,
      onsetDeltaFrames: -20,
      onsetDeltaMs: -20,
      offsetDeltaFrames: 20,
      offsetDeltaMs: 20,
      driftFrames: 40,
      driftMs: 40,
      speechFrameCount: 800,
      mouthOpenFrameCount: 840,
      silenceFrameCount: 200,
      silenceOpenFrameCount: 40,
      silenceOpenMs: 40,
      silenceOpenViolationCount: 2,
    });
  });

  it("reports positive onset lag and negative drift without losing the sign", () => {
    const metrics = measureVoiceAlignmentTraceV1({
      sampleRate: 1_000,
      frameCount: 1_000,
      presentation: { startFrame: 0, endFrame: 1_000 },
      speechSpans: [
        {
          startFrame: 100,
          endFrame: 900,
          origin: "engine",
          confidence: 1,
        },
      ],
      silenceSpans: [],
      mouthTransitions: [
        { atFrame: 120, from: "closed", to: "open", open: true },
        { atFrame: 880, from: "open", to: "closed", open: false },
      ],
    });
    assert.equal(metrics.onsetDeltaMs, 20);
    assert.equal(metrics.offsetDeltaMs, -20);
    assert.equal(metrics.driftMs, -40);
  });

  it("merges overlapping activity before counting duration and violations", () => {
    const metrics = measureVoiceAlignmentTraceV1({
      sampleRate: 1_000,
      frameCount: 500,
      presentation: { startFrame: 0, endFrame: 500 },
      speechSpans: [
        { startFrame: 100, endFrame: 250, origin: "engine", confidence: 1 },
        { startFrame: 200, endFrame: 300, origin: "engine", confidence: 1 },
      ],
      silenceSpans: [
        { startFrame: 0, endFrame: 120, origin: "generated", confidence: 1 },
        { startFrame: 100, endFrame: 150, origin: "generated", confidence: 1 },
      ],
      mouthTransitions: [
        { atFrame: 90, from: "closed", to: "open", open: true },
        { atFrame: 130, from: "open", to: "closed", open: false },
      ],
    });
    assert.equal(metrics.speechFrameCount, 200);
    assert.equal(metrics.silenceFrameCount, 150);
    assert.equal(metrics.silenceOpenFrameCount, 40);
    assert.equal(metrics.silenceOpenViolationCount, 1);
  });

  it("carries rendered mouth state into a nonzero presentation window", () => {
    const metrics = measureVoiceAlignmentTraceV1({
      sampleRate: 1_000,
      frameCount: 500,
      presentation: { startFrame: 100, endFrame: 500 },
      speechSpans: [
        { startFrame: 100, endFrame: 300, origin: "engine", confidence: 1 },
      ],
      silenceSpans: [
        {
          startFrame: 300,
          endFrame: 500,
          origin: "generated",
          confidence: 1,
        },
      ],
      mouthTransitions: [
        { atFrame: 50, from: "closed", to: "open", open: true },
        { atFrame: 320, from: "open", to: "closed", open: false },
      ],
    });
    assert.equal(metrics.mouthStartFrame, 100);
    assert.equal(metrics.mouthEndFrame, 320);
    assert.equal(metrics.mouthOpenFrameCount, 220);
    assert.equal(metrics.silenceOpenFrameCount, 20);
    assert.equal(metrics.silenceOpenViolationCount, 1);
  });
});

describe("voice alignment trace normalization and export", () => {
  it("sorts and clips frame data while preserving presentation containment", () => {
    const trace = normalizeVoiceAlignmentTraceV1(
      traceInput({
        articulation: { startFrame: 900, endFrame: 100 },
        presentation: { startFrame: 200, endFrame: 800 },
        phonemeSpans: [
          {
            startFrame: 700,
            endFrame: 1_200,
            origin: "engine",
            confidence: 3,
            sourceStart: 2,
            sourceEnd: 0,
            phoneme: "z",
          },
          {
            startFrame: 100,
            endFrame: 200,
            origin: "provider",
            confidence: -2,
            sourceStart: 0,
            sourceEnd: 1,
            phoneme: "a",
          },
        ],
        mouthTransitions: [
          { atFrame: 500, from: "closed", to: "open", open: true },
          { atFrame: 100, from: "open", to: "closed", open: false },
          { atFrame: 500, from: "open", to: "closed", open: false },
        ],
      }),
    );
    assert.deepEqual(trace.articulation, { startFrame: 100, endFrame: 900 });
    assert.deepEqual(trace.presentation, { startFrame: 100, endFrame: 900 });
    assert.deepEqual(
      trace.phonemeSpans.map((span) => [
        span.phoneme,
        span.startFrame,
        span.endFrame,
        span.confidence,
        span.sourceStart,
        span.sourceEnd,
      ]),
      [
        ["a", 100, 200, 0, 0, 1],
        ["z", 700, 1_000, 1, 0, 2],
      ],
    );
    assert.deepEqual(trace.mouthTransitions, [
      { atFrame: 100, from: "open", to: "closed", open: false },
      { atFrame: 500, from: "open", to: "closed", open: false },
    ]);
  });

  it("strictly validates canonical metrics and the authority invariant", () => {
    const valid = normalizeVoiceAlignmentTraceV1(traceInput());
    assert.deepEqual(validateVoiceAlignmentTraceV1(valid), {
      valid: true,
      issues: [],
      trace: valid,
    });

    const falseAuthority = normalizeVoiceAlignmentTraceV1(
      traceInput({
        alignmentStatus: "unaligned",
        phonemeSpans: [],
        visemeSpans: [],
      }),
    );
    const falseAuthorityInput = {
      ...falseAuthority,
      alignmentStatus: "aligned",
    };
    const authorityValidation = validateVoiceAlignmentTraceV1(
      falseAuthorityInput,
    );
    assert.equal(authorityValidation.valid, false);
    assert.ok(
      authorityValidation.issues.some(
        (issue) =>
          issue.path === "alignmentStatus" && issue.code === "invariant",
      ),
    );

    const staleMetrics = {
      ...valid,
      metrics: { ...valid.metrics, driftFrames: 99 },
    };
    assert.ok(
      validateVoiceAlignmentTraceV1(staleMetrics).issues.some(
        (issue) => issue.code === "metrics",
      ),
    );
    assert.ok(
      validateVoiceAlignmentTraceV1({ ...valid, metrics: {} }).issues.some(
        (issue) => issue.code === "metrics",
      ),
      "missing derived metrics must not validate",
    );
  });

  it("exports deterministic normalized JSON without trusting supplied metrics", () => {
    const input = traceInput({
      alignmentStatus: "aligned",
      phonemeSpans: [],
      visemeSpans: [],
      metrics: { driftMs: Number.NaN },
    });
    const first = exportVoiceAlignmentTraceJsonV1(input);
    const second = exportVoiceAlignmentTraceJsonV1(input);
    assert.equal(first, second);
    const exported = JSON.parse(first) as {
      alignmentStatus: string;
      metrics: { driftMs: number | null };
    };
    assert.equal(exported.alignmentStatus, "unaligned");
    assert.equal(exported.metrics.driftMs, 0);
    assert.doesNotMatch(first, /NaN/u);
  });
});
