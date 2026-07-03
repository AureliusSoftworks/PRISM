import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  prismHrefForSurfaceView,
  prismSurfaceViewForRouteParam,
} from "./viewRouting.ts";

describe("view routing helpers", () => {
  it("maps product routes onto the current internal surfaces", () => {
    assert.equal(prismSurfaceViewForRouteParam("chat"), "sandbox");
    assert.equal(prismSurfaceViewForRouteParam("zen"), "chat");
    assert.equal(prismSurfaceViewForRouteParam("coffee"), "coffee");
    assert.equal(prismSurfaceViewForRouteParam("story"), "story");
    assert.equal(prismSurfaceViewForRouteParam(null), "hub");
    assert.equal(prismSurfaceViewForRouteParam("unknown"), "hub");
  });

  it("keeps deprecated sandbox as a Chat alias without emitting sandbox URLs", () => {
    assert.equal(prismSurfaceViewForRouteParam("sandbox"), "sandbox");
    assert.equal(prismHrefForSurfaceView("sandbox"), "/?view=chat");
    assert.equal(prismHrefForSurfaceView("chat"), "/?view=zen");
    assert.equal(prismHrefForSurfaceView("hub"), "/");
  });
});
