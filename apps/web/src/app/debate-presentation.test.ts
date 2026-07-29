import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_SOURCE_LINK_PREFIX,
  debateAudioEnabled,
  debateMarkdownSource,
  debateGalleryReactingIndices,
  debateGalleryReaction,
  debateRevealDurationMs,
  debateSourceFromMarkdownHref,
  debateTranscriptIsAtLive,
  debateTurnOwnerBotId,
  debateVisibleContentAtProgress,
} from "./debatePresentation.ts";

const evidence = {
  version: 1 as const,
  notes: "",
  frozenAt: "2026-07-28T00:00:00.000Z",
  sources: [
    {
      id: "frozen-1",
      title: "Frozen source",
      url: "https://example.com/source",
      snippet: "Evidence.",
      publishedAt: null,
    },
  ],
};

describe("Debate live presentation", () => {
  it("uses a calmer bounded reveal cadence", () => {
    assert.equal(debateRevealDurationMs(""), 0);
    assert.equal(debateRevealDurationMs("Short."), 1_400);
    assert.equal(
      debateRevealDurationMs(
        Array.from({ length: 100 }, (_, index) => `word${index}`).join(" "),
      ),
      33_000,
    );
    assert.equal(
      debateRevealDurationMs(
        Array.from({ length: 1_000 }, (_, index) => `word${index}`).join(" "),
      ),
      60_000,
    );
  });

  it("keeps Debate audio independent from optional voice effects", () => {
    assert.equal(
      debateAudioEnabled({ voiceMode: "english", voiceVolume: 0.8 }),
      true,
    );
    assert.equal(
      debateAudioEnabled({ voiceMode: "bottish", voiceVolume: 0.8 }),
      true,
    );
    assert.equal(
      debateAudioEnabled({ voiceMode: "mute", voiceVolume: 0.8 }),
      false,
    );
    assert.equal(
      debateAudioEnabled({ voiceMode: "english", voiceVolume: 0 }),
      false,
    );
  });

  it("reveals a safe public prefix without splitting source markers", () => {
    const content =
      "A complete first clause. A sourced point [[source:frozen-1]] follows.";
    assert.equal(debateVisibleContentAtProgress(content, 0), "");
    assert.equal(debateVisibleContentAtProgress(content, 1), content);
    const partial = debateVisibleContentAtProgress(content, 0.68);
    assert.equal(partial.includes("[[source:"), false);
    assert.ok(content.startsWith(partial));
  });

  it("recognizes an exact live transcript clamp", () => {
    assert.equal(
      debateTranscriptIsAtLive({
        scrollHeight: 1_000,
        scrollTop: 600,
        clientHeight: 400,
      }),
      true,
    );
    assert.equal(
      debateTranscriptIsAtLive({
        scrollHeight: 1_000,
        scrollTop: 560,
        clientHeight: 400,
      }),
      false,
    );
  });

  it("tracks turn ownership independently from speech animation", () => {
    assert.equal(
      debateTurnOwnerBotId({
        thinkingBotId: "for-bot",
        presenting: false,
        presentationSpeakerBotId: null,
      }),
      "for-bot",
    );
    assert.equal(
      debateTurnOwnerBotId({
        thinkingBotId: null,
        presenting: true,
        presentationSpeakerBotId: "moderator-bot",
      }),
      "moderator-bot",
    );
    assert.equal(
      debateTurnOwnerBotId({
        thinkingBotId: null,
        presenting: false,
        presentationSpeakerBotId: "stale-prose-speaker",
      }),
      null,
    );
  });

  it("turns validated source markers into custom Markdown links", () => {
    const markdown = debateMarkdownSource(
      "**Claim.** [[source:frozen-1]] [[source:invented]]",
      evidence,
    );
    assert.equal(
      markdown,
      `**Claim.** [frozen-1](${DEBATE_SOURCE_LINK_PREFIX}frozen-1) `,
    );
    assert.equal(
      debateSourceFromMarkdownHref(
        `${DEBATE_SOURCE_LINK_PREFIX}frozen-1`,
        evidence,
      )?.title,
      "Frozen source",
    );
    assert.equal(
      debateSourceFromMarkdownHref(
        `${DEBATE_SOURCE_LINK_PREFIX}invented`,
        evidence,
      ),
      null,
    );
  });

  it("derives restrained clause-level gallery reactions", () => {
    assert.equal(
      debateGalleryReaction("That point is supported. [[source:frozen-1]]"),
      "evidence",
    );
    assert.equal(debateGalleryReaction("I concede that premise."), "concession");
    assert.equal(debateGalleryReaction("But does that answer the harm?"), "question");
    const seats = debateGalleryReactingIndices("One clause.", 3);
    assert.ok(seats.length >= 1 && seats.length <= 2);
    assert.ok(seats.every((index) => index >= 0 && index < 7));
  });
});
