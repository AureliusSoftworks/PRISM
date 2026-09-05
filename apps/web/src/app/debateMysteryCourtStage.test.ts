import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, it } from "node:test";
import {
  WHODUNNIT_COURT_ARRIVAL_MIN_MS,
  WHODUNNIT_COURT_ARRIVAL_SEAT_MS,
  WHODUNNIT_COURT_ARRIVAL_SETTLE_MS,
  resolveWhodunnitCourtCamera,
  whodunnitCourtArrivalProgress,
  whodunnitCourtCameraLabel,
  whodunnitCourtGallerySeats,
} from "./debateMysteryCourtStage.ts";

type DecodedPng = { width: number; height: number; data: Buffer };
const require = createRequire(import.meta.url);
const { PNG } = require("pngjs") as {
  PNG: { sync: { read: (value: Buffer) => DecodedPng } };
};

describe("Whodunnit Court stage", () => {
  it("cuts from entrances to the active Court speaker without player camera controls", () => {
    assert.equal(resolveWhodunnitCourtCamera({
      defenseDialogueActive: false,
      defendantDialogueActive: false,
      establishingWitness: true,
      interrogationPhase: null,
      judgeDialogueActive: false,
      prosecutionDialogueActive: false,
    }), "wide");
    assert.equal(resolveWhodunnitCourtCamera({
      defenseDialogueActive: false,
      defendantDialogueActive: false,
      establishingWitness: false,
      interrogationPhase: "suspect_entrance",
      judgeDialogueActive: false,
      prosecutionDialogueActive: false,
    }), "wide");
    assert.equal(resolveWhodunnitCourtCamera({
      defenseDialogueActive: false,
      defendantDialogueActive: false,
      establishingWitness: false,
      interrogationPhase: null,
      judgeDialogueActive: false,
      prosecutionDialogueActive: true,
    }), "prosecution");
    assert.equal(resolveWhodunnitCourtCamera({
      defenseDialogueActive: true,
      defendantDialogueActive: false,
      establishingWitness: false,
      interrogationPhase: null,
      judgeDialogueActive: false,
      prosecutionDialogueActive: false,
    }), "defense");
    assert.equal(resolveWhodunnitCourtCamera({
      defenseDialogueActive: false,
      defendantDialogueActive: false,
      establishingWitness: false,
      interrogationPhase: null,
      judgeDialogueActive: true,
      prosecutionDialogueActive: false,
    }), "judge");
    assert.equal(resolveWhodunnitCourtCamera({
      defenseDialogueActive: false,
      defendantDialogueActive: false,
      establishingWitness: false,
      interrogationPhase: null,
      judgeDialogueActive: false,
      prosecutionDialogueActive: false,
    }), "witness");
    assert.equal(whodunnitCourtCameraLabel("witness"), "Witness stand view");
  });

  it("pins 1:1 theme-parity and counsel-safe witness camera layers", () => {
    const load = (name: string): DecodedPng => PNG.sync.read(readFileSync(
      new URL(`../../public/debate/${name}`, import.meta.url),
    ));
    const dark = load("whodunnit-witness-dark.png");
    const light = load("whodunnit-witness-light.png");
    const darkForeground = load("whodunnit-witness-foreground-dark.png");
    const lightForeground = load("whodunnit-witness-foreground-light.png");
    const silhouette = load("whodunnit-witness-silhouette.png");

    assert.deepEqual([dark.width, dark.height], [1672, 941]);
    assert.deepEqual([light.width, light.height], [1672, 941]);
    assert.deepEqual([darkForeground.width, darkForeground.height], [1672, 941]);
    assert.deepEqual([lightForeground.width, lightForeground.height], [1672, 941]);
    assert.deepEqual([silhouette.width, silhouette.height], [1672, 941]);

    let transparentPixels = 0;
    let foregroundUnion = 0;
    let foregroundIntersection = 0;
    for (let offset = 0; offset < darkForeground.data.length; offset += 4) {
      assert.ok(dark.data[offset + 3] >= 254, "dark witness backplate must remain visually opaque");
      assert.ok(light.data[offset + 3] >= 235, "light witness backplate must remain visually opaque");
      const darkVisible = darkForeground.data[offset + 3] > 8;
      const lightVisible = lightForeground.data[offset + 3] > 8;
      if (!darkVisible) transparentPixels += 1;
      if (darkVisible || lightVisible) foregroundUnion += 1;
      if (darkVisible && lightVisible) foregroundIntersection += 1;
    }
    assert.ok(transparentPixels > darkForeground.width * darkForeground.height * 0.5);
    assert.ok(foregroundIntersection / foregroundUnion > 0.99, "theme foreground geometry must remain aligned");

    const safeZoneWidth = Math.floor(darkForeground.width * 0.17);
    const safeZoneTop = Math.floor(darkForeground.height * 0.52);
    for (let y = safeZoneTop; y < darkForeground.height; y += 1) {
      for (let x = 0; x < safeZoneWidth; x += 1) {
        assert.equal(darkForeground.data[(y * darkForeground.width + x) * 4 + 3], 0, "lower-left counsel zone must stay clear");
        assert.equal(darkForeground.data[(y * darkForeground.width + (darkForeground.width - 1 - x)) * 4 + 3], 0, "lower-right counsel zone must stay clear");
      }
    }
  });
});

describe("Whodunnit Court arrival", () => {
  it("fills the gallery from the front, alternating aisles, and settles before testimony", () => {
    const seats = whodunnitCourtGallerySeats({
      jurors: [{ id: "j1" }, { id: "j2" }],
      suspects: [{ id: "s1" }, { id: "s2" }, { id: "s3" }],
      excludeBotIds: new Set(["s2"]),
    });
    assert.deepEqual(
      seats.map((seat) => [seat.bot.id, seat.role, seat.side, seat.row]),
      [["j1", "juror", "left", 0], ["j2", "juror", "right", 0], ["s1", "suspect", "left", 0], ["s3", "suspect", "right", 0]],
    );
    assert.ok(seats[0]!.xPercent < 50 && seats[1]!.xPercent > 50);
    const early = whodunnitCourtArrivalProgress({ seatCount: 4, elapsedMs: 1_500, reducedMotion: false });
    assert.equal(early.revealedCount, 2);
    assert.equal(early.complete, false);
    const seated = whodunnitCourtArrivalProgress({ seatCount: 4, elapsedMs: 4 * WHODUNNIT_COURT_ARRIVAL_SEAT_MS, reducedMotion: false });
    assert.equal(seated.revealedCount, 4);
    assert.equal(seated.complete, false, "the house settles before the judge speaks");
    const settled = whodunnitCourtArrivalProgress({
      seatCount: 4,
      elapsedMs: 4 * WHODUNNIT_COURT_ARRIVAL_SEAT_MS + WHODUNNIT_COURT_ARRIVAL_SETTLE_MS,
      reducedMotion: false,
    });
    assert.equal(settled.complete, true);
    assert.equal(settled.ratio, 1);
    assert.equal(
      whodunnitCourtArrivalProgress({ seatCount: 0, elapsedMs: 1_000, reducedMotion: false }).complete,
      false,
      "an empty gallery still gives the Court its establishing beat",
    );
    assert.equal(whodunnitCourtArrivalProgress({ seatCount: 0, elapsedMs: WHODUNNIT_COURT_ARRIVAL_MIN_MS, reducedMotion: false }).complete, true);
    const reduced = whodunnitCourtArrivalProgress({ seatCount: 6, elapsedMs: 700, reducedMotion: true });
    assert.equal(reduced.revealedCount, 6);
    assert.equal(reduced.complete, true);
  });

  it("holds the wide camera while the Court assembles", () => {
    assert.equal(resolveWhodunnitCourtCamera({
      arrival: true,
      defenseDialogueActive: false,
      defendantDialogueActive: false,
      establishingWitness: false,
      interrogationPhase: null,
      judgeDialogueActive: true,
      prosecutionDialogueActive: false,
    }), "wide");
  });
});
