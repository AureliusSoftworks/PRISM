import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { whodunnitDiscoveredMansionRoomArtV1 } from "./debateMysteryInvestigationArt.ts";

describe("Whodunnit discovered mansion room art", () => {
  it("never resolves room art before authoritative discovery", () => {
    assert.equal(whodunnitDiscoveredMansionRoomArtV1({
      discovered: false,
      activeStyle: "illustrated",
      illustratedReady: true,
      sealedIllustratedUrl: "blob:sealed-kitchen",
      imageId: "saved-kitchen",
      templateId: "kitchen",
    }), null);
  });

  it("uses the discovered room's selected Illustrated plate when ready", () => {
    assert.deepEqual(whodunnitDiscoveredMansionRoomArtV1({
      discovered: true,
      activeStyle: "illustrated",
      illustratedReady: true,
      sealedIllustratedUrl: "blob:illustrated-kitchen",
      sealedMosaicUrl: "blob:mosaic-kitchen",
      templateId: "kitchen",
    }), {
      style: "illustrated",
      url: "blob:illustrated-kitchen",
    });
  });

  it("falls back to Pixel Art when a discovered room lacks its Realistic upgrade", () => {
    assert.deepEqual(whodunnitDiscoveredMansionRoomArtV1({
      discovered: true,
      activeStyle: "illustrated",
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
      activeStyle: "mosaic",
      illustratedReady: false,
      templateId: "dining-room",
    }), {
      style: "mosaic",
      url: "/debate/mystery/rooms/dining-room-mosaic.webp?pixelArt=6",
    });
  });
});
