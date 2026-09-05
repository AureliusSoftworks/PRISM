import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEBATE_GALLERY_ARRIVAL_HURRY_INTERVAL_MS,
  DEBATE_GALLERY_ARRIVAL_LINGER_INTERVAL_MS,
  DEBATE_GALLERY_ARRIVAL_SETTLE_MS,
  DEBATE_GALLERY_OPENING_MURMUR_FADE_MS,
  debateGalleryArrivalFillRatio,
  debateGalleryArrivalRevealOrder,
  debateGalleryArrivalRevealedCount,
  debateGalleryArrivalMurmurGain,
  debateGalleryOpeningMurmurGain,
  debateGallerySeatHasArrived,
} from "./debateGalleryArrival.ts";

describe("debateGalleryArrival", () => {
  it("builds an alternating left/right reveal order and skips the player", () => {
    const order = debateGalleryArrivalRevealOrder([
      { index: 0, walkXPercent: -200, isPlayer: false },
      { index: 1, walkXPercent: 220, isPlayer: false },
      { index: 2, walkXPercent: -180, isPlayer: true },
      { index: 3, walkXPercent: 190, isPlayer: false },
      { index: 4, walkXPercent: -210, isPlayer: false },
    ]);
    assert.deepEqual(order, [0, 1, 4, 3]);
  });

  it("lingers seats before unlock and never completes early", () => {
    const early = debateGalleryArrivalRevealedCount({
      nonPlayerCount: 8,
      progressRatio: 0,
      bakeUnlocked: false,
      elapsedMs: DEBATE_GALLERY_ARRIVAL_LINGER_INTERVAL_MS * 3,
      unlockElapsedMs: 0,
    });
    assert.equal(early.revealedCount, 3);
    assert.equal(early.arrivalComplete, false);

    const progress = debateGalleryArrivalRevealedCount({
      nonPlayerCount: 8,
      progressRatio: 0.9,
      bakeUnlocked: false,
      elapsedMs: 0,
      unlockElapsedMs: 0,
    });
    assert.equal(progress.revealedCount, 7);
    assert.equal(progress.arrivalComplete, false);
  });

  it("hurries remaining seats after unlock then settles", () => {
    const atUnlock = debateGalleryArrivalRevealedCount({
      nonPlayerCount: 6,
      progressRatio: 0.2,
      bakeUnlocked: true,
      elapsedMs: 0,
      unlockElapsedMs: 0,
    });
    assert.equal(atUnlock.revealedCount, 1);
    assert.equal(atUnlock.arrivalComplete, false);

    const midHurry = debateGalleryArrivalRevealedCount({
      nonPlayerCount: 6,
      progressRatio: 0.2,
      bakeUnlocked: true,
      elapsedMs: 0,
      unlockElapsedMs: DEBATE_GALLERY_ARRIVAL_HURRY_INTERVAL_MS * 3,
    });
    assert.equal(midHurry.revealedCount, 4);
    assert.equal(midHurry.arrivalComplete, false);

    const settled = debateGalleryArrivalRevealedCount({
      nonPlayerCount: 6,
      progressRatio: 0.2,
      bakeUnlocked: true,
      elapsedMs: 0,
      unlockElapsedMs:
        DEBATE_GALLERY_ARRIVAL_HURRY_INTERVAL_MS * 5 +
        DEBATE_GALLERY_ARRIVAL_SETTLE_MS,
    });
    assert.equal(settled.revealedCount, 6);
    assert.equal(settled.arrivalComplete, true);
  });

  it("treats the player seat as already arrived", () => {
    assert.equal(
      debateGallerySeatHasArrived({
        seatIndex: 2,
        isPlayer: true,
        revealOrder: [0, 1, 3],
        revealedCount: 0,
      }),
      true,
    );
    assert.equal(
      debateGallerySeatHasArrived({
        seatIndex: 1,
        isPlayer: false,
        revealOrder: [0, 1, 3],
        revealedCount: 1,
      }),
      false,
    );
    assert.equal(
      debateGallerySeatHasArrived({
        seatIndex: 1,
        isPlayer: false,
        revealOrder: [0, 1, 3],
        revealedCount: 2,
      }),
      true,
    );
  });

  it("glides house fill between seats and steps murmur audibly from an empty room", () => {
    const halfLinger = debateGalleryArrivalFillRatio({
      nonPlayerCount: 8,
      progressRatio: 0,
      bakeUnlocked: false,
      elapsedMs: DEBATE_GALLERY_ARRIVAL_LINGER_INTERVAL_MS * 1.5,
      unlockElapsedMs: 0,
    });
    assert.ok(halfLinger > 1 / 8);
    assert.ok(halfLinger < 2 / 8);

    // The arrival is the diegetic buffer gauge: wall-clock lingering may send
    // in a few stragglers but can never fill the house on its own — a stalled
    // bake holds visibly short of full.
    const stalledForever = debateGalleryArrivalFillRatio({
      nonPlayerCount: 8,
      progressRatio: 0,
      bakeUnlocked: false,
      elapsedMs: DEBATE_GALLERY_ARRIVAL_LINGER_INTERVAL_MS * 40,
      unlockElapsedMs: 0,
    });
    assert.equal(stalledForever, 3 / 8);

    // Silent only while the house is truly empty; the first arrival takes an
    // audible step (the floor) and the bed grows linearly to full.
    assert.equal(
      debateGalleryArrivalMurmurGain({ revealedCount: 0, nonPlayerCount: 8 }),
      0,
    );
    assert.equal(
      debateGalleryArrivalMurmurGain({ revealedCount: 4, nonPlayerCount: 8 }),
      0.7,
    );
    assert.equal(
      debateGalleryArrivalMurmurGain({
        revealedCount: 1,
        nonPlayerCount: 8,
        fillRatio: 0.5,
      }),
      0.7,
    );
    assert.equal(
      debateGalleryArrivalMurmurGain({ revealedCount: 8, nonPlayerCount: 8 }),
      1,
    );
    assert.equal(
      debateGalleryArrivalMurmurGain({ revealedCount: 0, nonPlayerCount: 0 }),
      1,
    );
    assert.ok(
      debateGalleryArrivalMurmurGain({ revealedCount: 1, nonPlayerCount: 8 }) >=
        0.4,
    );

    // Rejoining a half-full house: the local watch clock eases the bed in
    // linearly instead of popping at the crowd's level.
    assert.equal(
      debateGalleryArrivalMurmurGain({
        revealedCount: 8,
        nonPlayerCount: 8,
        watchElapsedMs: DEBATE_GALLERY_OPENING_MURMUR_FADE_MS / 2,
      }),
      0.5,
    );
    assert.equal(
      debateGalleryArrivalMurmurGain({
        revealedCount: 8,
        nonPlayerCount: 8,
        watchElapsedMs: DEBATE_GALLERY_OPENING_MURMUR_FADE_MS,
      }),
      1,
    );

    assert.equal(debateGalleryOpeningMurmurGain(0), 0);
    assert.equal(
      debateGalleryOpeningMurmurGain(DEBATE_GALLERY_OPENING_MURMUR_FADE_MS / 2),
      0.25,
    );
    assert.equal(
      debateGalleryOpeningMurmurGain(DEBATE_GALLERY_OPENING_MURMUR_FADE_MS),
      1,
    );
  });
});
