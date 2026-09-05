import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { whodunnitDiscoveredMansionRoomArtV1 } from "./debateMysteryInvestigationArt.ts";

describe("Whodunnit discovered mansion room art", () => {
  it("never resolves room art before authoritative discovery", () => {
    assert.equal(whodunnitDiscoveredMansionRoomArtV1({
      discovered: false,
      upgradeEnabled: true,
      illustratedReady: true,
      sealedIllustratedUrl: "blob:sealed-kitchen",
      imageId: "saved-kitchen",
      templateId: "kitchen",
    }), null);
  });

  it("uses the discovered room's Upgraded derivative when ready", () => {
    assert.deepEqual(whodunnitDiscoveredMansionRoomArtV1({
      discovered: true,
      upgradeEnabled: true,
      illustratedReady: true,
      sealedIllustratedUrl: "blob:illustrated-kitchen",
      sealedMosaicUrl: "blob:mosaic-kitchen",
      templateId: "kitchen",
    }), {
      style: "illustrated",
      url: "blob:illustrated-kitchen",
    });
  });

  it("falls back to the original Mosaic when a discovered room lacks its upgrade", () => {
    assert.deepEqual(whodunnitDiscoveredMansionRoomArtV1({
      discovered: true,
      upgradeEnabled: true,
      illustratedReady: false,
      sealedIllustratedUrl: "blob:incomplete-illustrated-kitchen",
      sealedMosaicUrl: "blob:mosaic-kitchen",
      templateId: "kitchen",
    }), {
      style: "mosaic",
      url: "blob:mosaic-kitchen",
    });
  });

  it("keeps imported and legacy discovered rooms on their bundled fallback", () => {
    assert.deepEqual(whodunnitDiscoveredMansionRoomArtV1({
      discovered: true,
      upgradeEnabled: false,
      illustratedReady: false,
      templateId: "dining-room",
    }), {
      style: "mosaic",
      url: "/debate/mystery/rooms/dining-room-mosaic.webp?pixelArt=6",
    });
  });
});
