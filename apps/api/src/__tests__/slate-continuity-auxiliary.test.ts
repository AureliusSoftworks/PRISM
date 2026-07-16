import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import {
  SLATE_CONTINUITY_EXTRACTION_SCHEMA,
  SlateContinuityAuxiliaryInputError,
  SlateContinuityAuxiliaryLaneError,
  extractSlateContinuityCandidatesLocally,
  reconcileSlateContinuityCandidatesLocally,
  requestSlateContinuityHighImpactRecommendation,
  type SlateContinuityAuxiliaryClaimCandidate,
  type SlateContinuityAuxiliarySource,
  type SlateContinuityHighImpactUncertaintyRequest,
} from "../slate-continuity-auxiliary.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
  ProviderName,
} from "../providers.ts";

class StubProvider implements LlmProvider {
  calls: Array<{ messages: ProviderMessage[]; options?: GenerateOptions }> = [];
  name: ProviderName;
  diagnosticModel: string;
  private readonly response: string | Error;

  constructor(
    name: ProviderName,
    response: string | Error,
    diagnosticModel = "test-model",
  ) {
    this.name = name;
    this.response = response;
    this.diagnosticModel = diagnosticModel;
  }

  async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    this.calls.push({ messages, options });
    if (this.response instanceof Error) throw this.response;
    return this.response;
  }

  async embedText(): Promise<number[]> {
    throw new Error("Continuity auxiliary inference must not request embeddings.");
  }
}

function extractionResponse(
  overrides: Partial<Record<"entities" | "claims" | "events" | "relationships" | "threads", unknown[]>> = {},
): string {
  return JSON.stringify({
    entities: [],
    claims: [],
    events: [],
    relationships: [],
    threads: [],
    ...overrides,
  });
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function anchorFor(
  source: SlateContinuityAuxiliarySource,
  quote: string,
) {
  const start = source.content.indexOf(quote);
  assert.notEqual(start, -1);
  return {
    sourceId: source.sourceId,
    sectionId: source.sectionId,
    sectionRevision: source.sectionRevision,
    start,
    end: start + quote.length,
    quoteHash: sha256(quote),
  };
}

describe("Slate Continuity auxiliary extraction", () => {
  it("uses one schema-constrained LOCAL call and returns only exactly anchored candidates", async () => {
    const source: SlateContinuityAuxiliarySource = {
      sourceId: "source-1",
      sectionId: "section-1",
      sectionRevision: 7,
      content: [
        "Mara believes the black gate is safe.",
        "Rumor says the king survived.",
        "The tower is red.",
        "The tower is red.",
      ].join(" "),
    };
    const provider = new StubProvider(
      "local",
      extractionResponse({
        entities: [
          {
            name: "Mara",
            kind: "character",
            aliases: [],
            description: "A traveler.",
            confidence: 0.9,
            evidenceQuotes: ["Mara believes the black gate is safe."],
          },
          {
            name: "Ghost",
            kind: "character",
            aliases: [],
            description: "Not actually in the source.",
            confidence: 0.8,
            evidenceQuotes: ["Ghost waits outside."],
          },
        ],
        claims: [
          {
            subjectName: "Black gate",
            predicate: "is",
            objectName: "",
            value: "safe",
            epistemicStatus: "fact",
            perspectiveName: "Mara",
            confidence: 0.88,
            evidenceQuotes: ["Mara believes the black gate is safe."],
          },
          {
            subjectName: "King",
            predicate: "survived",
            objectName: "",
            value: "the attack",
            epistemicStatus: "fact",
            perspectiveName: "",
            confidence: 0.7,
            evidenceQuotes: ["Rumor says the king survived."],
          },
          {
            subjectName: "Tower",
            predicate: "is",
            objectName: "",
            value: "red",
            epistemicStatus: "fact",
            perspectiveName: "",
            confidence: 0.92,
            // This exact quote is duplicated, so deterministic anchoring must
            // reject it instead of guessing which occurrence the model meant.
            evidenceQuotes: ["The tower is red."],
          },
        ],
      }),
    );

    const result = await extractSlateContinuityCandidatesLocally(provider, {
      source,
    });

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0]?.options?.jsonMode, true);
    assert.equal(
      provider.calls[0]?.options?.jsonSchema,
      SLATE_CONTINUITY_EXTRACTION_SCHEMA,
    );
    assert.equal(
      provider.calls[0]?.options?.jsonSchemaName,
      "slate_continuity_extraction_v1",
    );
    assert.equal(result.entities.length, 1);
    assert.equal(result.entities[0]?.canonicalName, "Mara");
    assert.equal(result.claims.length, 2);
    assert.equal(result.claims[0]?.epistemicStatus, "belief");
    assert.equal(result.claims[1]?.epistemicStatus, "rumor");
    assert.equal(
      result.claims[1]?.anchors[0]?.quoteHash,
      sha256("Rumor says the king survived."),
    );
    assert.equal(result.provider, "local");
    assert.equal(result.model, "test-model");

    const schemaText = JSON.stringify(SLATE_CONTINUITY_EXTRACTION_SCHEMA);
    assert.doesNotMatch(schemaText, /\$(?:ref|defs)|anyOf|oneOf/);
    assert.match(provider.calls[0]?.messages[0]?.content ?? "", /untrusted story text/i);
  });

  it("rejects online providers before routine extraction can make a call", async () => {
    const provider = new StubProvider("openai", extractionResponse());

    await assert.rejects(
      extractSlateContinuityCandidatesLocally(provider, {
        source: {
          sourceId: "source-private",
          sectionId: null,
          sectionRevision: null,
          content: "A bounded source.",
        },
      }),
      SlateContinuityAuxiliaryLaneError,
    );
    assert.equal(provider.calls.length, 0);
  });

  it("does not retry or fall back when the injected LOCAL model fails", async () => {
    const provider = new StubProvider("local", new Error("local model unavailable"));

    await assert.rejects(
      extractSlateContinuityCandidatesLocally(provider, {
        source: {
          sourceId: "source-failure",
          sectionId: null,
          sectionRevision: null,
          content: "No fallback is permitted.",
        },
      }),
      /local model unavailable/,
    );
    assert.equal(provider.calls.length, 1);
  });

  it("bounds model input while allowing a large source with small changed ranges", async () => {
    const content = `${"x".repeat(40_000)}The bell broke.${"y".repeat(40_000)}`;
    const quote = "The bell broke.";
    const start = content.indexOf(quote);
    const provider = new StubProvider(
      "local",
      extractionResponse({
        events: [
          {
            title: "The bell breaks",
            description: "The bell broke.",
            chronologyKey: "",
            participantNames: [],
            locationName: "",
            epistemicStatus: "fact",
            confidence: 0.95,
            evidenceQuotes: [quote],
          },
        ],
      }),
    );

    const result = await extractSlateContinuityCandidatesLocally(provider, {
      source: {
        sourceId: "source-large",
        sectionId: "section-large",
        sectionRevision: 2,
        content,
        changedRanges: [{ start, end: start + quote.length }],
      },
    });
    const payload = JSON.parse(provider.calls[0]?.messages[1]?.content ?? "{}") as {
      segments?: Array<{ text: string }>;
    };

    assert.equal(payload.segments?.[0]?.text, quote);
    assert.equal(result.events[0]?.anchors[0]?.start, start);
  });

  it("rejects unbounded whole-source model input", async () => {
    const provider = new StubProvider("local", extractionResponse());

    await assert.rejects(
      extractSlateContinuityCandidatesLocally(provider, {
        source: {
          sourceId: "source-too-large",
          sectionId: null,
          sectionRevision: null,
          content: "x".repeat(16_001),
        },
      }),
      SlateContinuityAuxiliaryInputError,
    );
    assert.equal(provider.calls.length, 0);
  });
});

describe("Slate Continuity auxiliary reconciliation", () => {
  it("keeps fact conflicts but discards disagreements involving beliefs", async () => {
    const source: SlateContinuityAuxiliarySource = {
      sourceId: "source-reconcile",
      sectionId: "section-reconcile",
      sectionRevision: 4,
      content:
        "The eastern gate is open. Mara believes the eastern gate is closed.",
    };
    const factQuote = "The eastern gate is open.";
    const beliefQuote = "Mara believes the eastern gate is closed.";
    const newClaims: SlateContinuityAuxiliaryClaimCandidate[] = [
      {
        candidateId: "new-fact",
        subjectName: "Eastern gate",
        predicate: "is",
        objectName: null,
        value: "open",
        epistemicStatus: "fact",
        perspectiveName: null,
        confidence: 0.95,
        anchors: [anchorFor(source, factQuote)],
      },
      {
        candidateId: "new-belief",
        subjectName: "Eastern gate",
        predicate: "is",
        objectName: null,
        value: "closed",
        epistemicStatus: "belief",
        perspectiveName: "Mara",
        confidence: 0.9,
        anchors: [anchorFor(source, beliefQuote)],
      },
    ];
    const provider = new StubProvider(
      "local",
      JSON.stringify({
        concerns: [
          {
            kind: "state_conflict",
            severity: "important",
            summary: "The gate state conflicts with canon.",
            explanation: "The new fact says open while settled canon says closed.",
            newClaimIds: ["new-fact"],
            existingClaimIds: ["old-fact"],
            recommendedResolution: "update_canon",
            evidenceQuotes: [factQuote],
          },
          {
            kind: "state_conflict",
            severity: "critical",
            summary: "Mara disagrees with canon.",
            explanation: "Her belief differs from the settled state.",
            newClaimIds: ["new-belief"],
            existingClaimIds: ["old-fact"],
            recommendedResolution: "revise_prose",
            evidenceQuotes: [beliefQuote],
          },
          {
            kind: "ambiguous_extraction",
            severity: "note",
            summary: "Unsupported concern.",
            explanation: "The quote is not present.",
            newClaimIds: [],
            existingClaimIds: [],
            recommendedResolution: "dismiss_extraction",
            evidenceQuotes: ["This text does not exist."],
          },
        ],
      }),
    );

    const result = await reconcileSlateContinuityCandidatesLocally(provider, {
      source,
      newClaims,
      existingClaims: [
        {
          claimId: "old-fact",
          subjectName: "Eastern gate",
          predicate: "is",
          objectName: null,
          value: "closed",
          epistemicStatus: "fact",
        },
      ],
    });

    assert.equal(provider.calls.length, 1);
    assert.equal(result.concerns.length, 1);
    assert.equal(result.concerns[0]?.summary, "The gate state conflicts with canon.");
    assert.deepEqual(result.concerns[0]?.newClaimIds, ["new-fact"]);
  });

  it("refuses reconciliation claims whose source anchors no longer match", async () => {
    const source: SlateContinuityAuxiliarySource = {
      sourceId: "source-stale",
      sectionId: "section-stale",
      sectionRevision: 5,
      content: "The harbor is quiet.",
    };
    const provider = new StubProvider("local", JSON.stringify({ concerns: [] }));

    await assert.rejects(
      reconcileSlateContinuityCandidatesLocally(provider, {
        source,
        newClaims: [
          {
            candidateId: "stale-claim",
            subjectName: "Harbor",
            predicate: "is",
            objectName: null,
            value: "quiet",
            epistemicStatus: "fact",
            perspectiveName: null,
            confidence: 1,
            anchors: [
              {
                ...anchorFor(source, "The harbor is quiet."),
                quoteHash: "stale-hash",
              },
            ],
          },
        ],
        existingClaims: [],
      }),
      SlateContinuityAuxiliaryInputError,
    );
    assert.equal(provider.calls.length, 0);
  });

  it("allows a fact to conflict with an explicit writer constraint without inventing prior canon", async () => {
    const quote = "Mara Vale removes her silver mask.";
    const source: SlateContinuityAuxiliarySource = {
      sourceId: "source-constraint",
      sectionId: "section-constraint",
      sectionRevision: 2,
      content: quote,
    };
    const claim: SlateContinuityAuxiliaryClaimCandidate = {
      candidateId: "new-unmasking",
      subjectName: "Mara Vale",
      predicate: "remove",
      objectName: "silver mask",
      value: "silver mask",
      epistemicStatus: "fact",
      perspectiveName: null,
      confidence: 0.95,
      anchors: [anchorFor(source, quote)],
    };
    const provider = new StubProvider(
      "local",
      JSON.stringify({
        concerns: [
          {
            kind: "non_negotiable_conflict",
            severity: "critical",
            summary: "Mara removes material the writer locked conceptually.",
            explanation: "The project says Mara must never remove the silver mask.",
            newClaimIds: [claim.candidateId],
            existingClaimIds: [],
            recommendedResolution: "revise_prose",
            evidenceQuotes: [quote],
          },
        ],
      }),
    );

    const result = await reconcileSlateContinuityCandidatesLocally(provider, {
      source,
      newClaims: [claim],
      existingClaims: [],
      constraints: ["Mara must never remove the silver mask."],
    });

    assert.equal(result.concerns[0]?.kind, "non_negotiable_conflict");
    const request = JSON.parse(
      provider.calls[0]!.messages.at(-1)!.content,
    ) as { constraints: string[] };
    assert.deepEqual(request.constraints, [
      "Mara must never remove the silver mask.",
    ]);
  });
});

describe("Slate Continuity high-impact online request", () => {
  const source: SlateContinuityAuxiliarySource = {
    sourceId: "source-high-impact",
    sectionId: "section-high-impact",
    sectionRevision: 9,
    content: "No one knows whether the moon gate opened before the war.",
  };
  const request: SlateContinuityHighImpactUncertaintyRequest = {
    task: "resolve_high_impact_uncertainty",
    modelLane: "online",
    source,
    concern: {
      concernId: "concern-1",
      summary: "The moon gate date affects two books.",
      stakes: "Choosing the wrong chronology would invalidate a later siege.",
    },
    interpretations: [
      {
        id: "before",
        label: "It opened before the war",
        consequence: "The siege route was available.",
        epistemicStatus: "fact",
      },
      {
        id: "unknown",
        label: "Keep the date unknown",
        consequence: "The reveal remains available later.",
        epistemicStatus: "mystery",
      },
    ],
  };

  it("runs only after an explicit online lane and returns source-anchored advice", async () => {
    const quote = "No one knows whether the moon gate opened before the war.";
    const provider = new StubProvider(
      "openai",
      JSON.stringify({
        action: "mark_mystery",
        interpretationId: "",
        rationale: "The prose explicitly withholds this chronology.",
        confidence: 0.97,
        evidenceQuotes: [quote],
      }),
      "online-test-model",
    );

    const result = await requestSlateContinuityHighImpactRecommendation(
      provider,
      request,
    );

    assert.equal(provider.calls.length, 1);
    assert.equal(provider.calls[0]?.options?.jsonMode, true);
    assert.equal(result.modelLane, "online");
    assert.equal(result.provider, "openai");
    assert.equal(result.action, "mark_mystery");
    assert.equal(result.interpretationId, null);
    assert.equal(result.anchors[0]?.quoteHash, sha256(quote));
  });

  it("cannot be reached with a LOCAL provider or a forged local lane", async () => {
    const local = new StubProvider("local", "{}");
    await assert.rejects(
      requestSlateContinuityHighImpactRecommendation(local, request),
      SlateContinuityAuxiliaryLaneError,
    );
    assert.equal(local.calls.length, 0);

    const online = new StubProvider("anthropic", "{}");
    const forged = {
      ...request,
      modelLane: "local",
    } as unknown as SlateContinuityHighImpactUncertaintyRequest;
    await assert.rejects(
      requestSlateContinuityHighImpactRecommendation(online, forged),
      SlateContinuityAuxiliaryLaneError,
    );
    assert.equal(online.calls.length, 0);
  });
});
