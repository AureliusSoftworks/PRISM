import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveBodilyActionSfxPlayback,
  resolveLegacyBodilyActionSfxPlayback,
} from "./corporality-action-sfx.ts";

describe("corporality-action-sfx resolver", () => {
  it("ignores pack sources for bodily kinds and uses corporality stock", () => {
    const resolved = resolveBodilyActionSfxPlayback({
      kind: "fart",
      corporality: 0.5,
      packSource: "/api/action-sfx-pack/clip?kind=fart",
      packVariantIndex: 2,
      random: () => 0.1,
    });
    assert.ok(resolved);
    assert.equal(resolved!.source, "corporality");
    assert.match(resolved!.urls[0]!, /corporality\/organic\/fart-/u);
  });

  it("crossfades adjacent corporality bins with complementary gains", () => {
    const mid = resolveBodilyActionSfxPlayback({
      kind: "burp",
      corporality: 0.25,
      random: () => 0,
    });
    assert.ok(mid);
    assert.equal(mid!.source, "corporality");
    assert.equal(mid!.urls.length, 2);
    assert.match(mid!.urls[0]!, /artificial\/burp-01\.mp3$/u);
    assert.match(mid!.urls[1]!, /organic\/burp-01\.mp3$/u);
    assert.ok(Math.abs((mid!.gains[0] ?? 0) + (mid!.gains[1] ?? 0) - 1) < 1e-9);

    const organic = resolveBodilyActionSfxPlayback({
      kind: "cough",
      corporality: 0.5,
      random: () => 0,
    });
    assert.ok(organic);
    assert.equal(organic!.source, "corporality");
    assert.equal(organic!.urls.length, 1);
    assert.match(organic!.urls[0]!, /organic\/cough-01\.mp3$/u);
  });

  it("falls back to legacy coffee clips as last resort", () => {
    const legacy = resolveLegacyBodilyActionSfxPlayback("fart", () => 0);
    assert.equal(legacy.source, "legacy");
    assert.match(legacy.urls[0]!, /coffee\/action-reactions\/fart-01\.mp3$/u);
  });

  it("returns null for vocal kinds (pack path is separate)", () => {
    assert.equal(
      resolveBodilyActionSfxPlayback({
        kind: "laugh",
        corporality: 0.5,
        packSource: "/api/action-sfx-pack/clip?kind=laugh",
        random: () => 0,
      }),
      null,
    );
  });
});
