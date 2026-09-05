import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultDebateFlytingFormatStateV1 } from "@localai/shared";
import { debateFlytingHallPresentation } from "./debateFlytingHallPresentation.ts";

describe("Flyting Mead Hall presentation", () => {
  it("derives prism momentum from the durable answer record without scoring the bout", () => {
    const state = defaultDebateFlytingFormatStateV1();
    state.phase = "rejoinder";
    state.expectedAction = "rejoinder";
    state.floorSideId = "for";
    state.exchanges[0] = {
      ...state.exchanges[0]!,
      boast: { id: "boast", sideId: "for", speakerBotId: "for", content: "A boast", authoredMode: "bot", createdEventId: "1", legendFacetId: "facet" },
      challenge: { id: "challenge", sideId: "against", speakerBotId: "against", content: "A challenge", authoredMode: "bot", createdEventId: "2", targetClaimId: "boast", lens: "doubt" },
      rejoinder: { id: "answer", sideId: "for", speakerBotId: "for", content: "An answer", authoredMode: "bot", createdEventId: "3", targetChallengeId: "challenge", maneuver: "turn", returnClaimId: null },
      resolution: "turned",
    };

    const presentation = debateFlytingHallPresentation(state, "live");
    assert.equal(presentation.fireIntensity, "roaring");
    assert.equal(presentation.fireSeatId, "for");
    assert.equal(presentation.prism.leadingSideId, "for");
    assert.ok(presentation.prism.forContribution > presentation.prism.againstContribution);
    assert.ok(presentation.prism.forPercent > 0 && presentation.prism.forPercent < 100);
    assert.ok(presentation.prism.forPercent + presentation.prism.againstPercent < 100);
    assert.equal(presentation.galleryIsQuiet, false);
  });

  it("turns the Hall to smoke only after the durable contest is complete", () => {
    const state = defaultDebateFlytingFormatStateV1();
    state.phase = "complete";
    const presentation = debateFlytingHallPresentation(state, "completed");
    assert.equal(presentation.fireIntensity, "extinguished");
    assert.equal(presentation.prism.forPercent, 0);
    assert.equal(presentation.prism.againstPercent, 0);
  });

  it("uses all four live hearth intensities without changing the record", () => {
    const state = defaultDebateFlytingFormatStateV1();
    const intensityFor = (phase: typeof state.phase, expectedAction: typeof state.expectedAction) => {
      state.phase = phase;
      state.expectedAction = expectedAction;
      return debateFlytingHallPresentation(state, "live").fireIntensity;
    };

    assert.equal(intensityFor("intro", "advance"), "smoldering");
    assert.equal(intensityFor("boast", "boast"), "simmering");
    assert.equal(intensityFor("challenge", "challenge"), "burning");
    assert.equal(intensityFor("rejoinder", "rejoinder"), "roaring");
  });

  it("keeps the gallery rowdy except during the brief spoken delivery beat", () => {
    const state = defaultDebateFlytingFormatStateV1();
    state.phase = "challenge";
    state.expectedAction = "challenge";
    assert.equal(debateFlytingHallPresentation(state, "live").galleryIsQuiet, false);

    state.expectedAction = "advance";
    assert.equal(debateFlytingHallPresentation(state, "live").galleryIsQuiet, true);
  });

  it("gives Host-led ritual beats to the Host-colored hearth", () => {
    const state = defaultDebateFlytingFormatStateV1();
    state.phase = "acclamation";
    state.floorSideId = "against";
    const presentation = debateFlytingHallPresentation(state, "live");
    assert.equal(presentation.fireSeatId, "host");
    assert.equal(presentation.fireIntensity, "burning");
  });
});
