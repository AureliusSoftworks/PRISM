import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  prismHrefForSurfaceView,
  prismSurfaceViewForRouteParam,
} from "./viewRouting.ts";

describe("view routing helpers", () => {
  it("maps product routes onto the current internal surfaces", () => {
    assert.equal(prismSurfaceViewForRouteParam("chat"), "chat");
    assert.equal(prismSurfaceViewForRouteParam("zen"), "chat");
    assert.equal(prismSurfaceViewForRouteParam("coffee"), "coffee");
    assert.equal(prismSurfaceViewForRouteParam("botcast"), "botcast");
    assert.equal(prismSurfaceViewForRouteParam("slate"), "slate");
    assert.equal(prismSurfaceViewForRouteParam("story"), "story");
    assert.equal(prismSurfaceViewForRouteParam(null), "chat");
    assert.equal(prismSurfaceViewForRouteParam("unknown"), "chat");
  });

  it("keeps deprecated hub, zen, and sandbox aliases without emitting old URLs", () => {
    assert.equal(prismSurfaceViewForRouteParam("sandbox"), "chat");
    assert.equal(prismHrefForSurfaceView("sandbox"), "/?view=chat");
    assert.equal(prismHrefForSurfaceView("chat"), "/?view=chat");
    assert.equal(prismHrefForSurfaceView("hub"), "/?view=chat");
    assert.equal(prismHrefForSurfaceView("botcast"), "/?view=botcast");
    assert.equal(prismHrefForSurfaceView("slate"), "/?view=slate");
  });
});
