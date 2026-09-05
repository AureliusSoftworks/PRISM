import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { zenLiveBotCanvasSideWithHysteresis } from "./zenLiveActions.ts";

const here = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(here, "page.tsx"), "utf8");

describe("default Prism Zen facing", () => {
  it("holds its current direction while floating around the center line", () => {
    assert.equal(zenLiveBotCanvasSideWithHysteresis(500, 1_000, "left"), "left");
    assert.equal(zenLiveBotCanvasSideWithHysteresis(525, 1_000, "left"), "left");
    assert.equal(zenLiveBotCanvasSideWithHysteresis(533, 1_000, "left"), "right");
    assert.equal(zenLiveBotCanvasSideWithHysteresis(475, 1_000, "right"), "right");
    assert.equal(zenLiveBotCanvasSideWithHysteresis(467, 1_000, "right"), "left");
  });

  it("uses the dead zone only for Prism and measures the avatar center", () => {
    assert.match(
      pageSource,
      /defaultPrismPresence\s*\?\s*zenLiveBotCanvasSideWithHysteresis\(/,
    );
    assert.match(pageSource, /presented\.x \+ bodySize \/ 2/);
    assert.match(pageSource, /clamped\.x \+ rootWidth \/ 2/);
    assert.match(
      pageSource,
      /const \[avatarFacing, setAvatarFacing\] = useState<ZenLiveAvatarFacing>\(\s*zenLiveBotFacingForCanvasSide\(avatarCanvasSide\),\s*\)/,
    );
  });
});
