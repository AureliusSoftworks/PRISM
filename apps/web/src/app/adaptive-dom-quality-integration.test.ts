import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const globalStyles = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);

describe("adaptive DOM quality integration", () => {
  it("mounts one always-on governor independently from the FPS overlay", () => {
    assert.match(page, /<PrismAdaptiveDomQualityGovernor \/>/u);
    assert.match(page, /<FpsCounter \/>/u);
  });

  it("enrolls Avatar Studio in temporary adaptive quality", () => {
    assert.match(
      page,
      /data-prism-adaptive-surface="avatar-studio"/u,
    );
    assert.match(page, /data-prism-expensive-effect="true"/u);
    assert.match(
      globalStyles,
      /data-prism-adaptive-quality="minimal"[\s\S]*?data-prism-expensive-effect/u,
    );
    assert.match(
      globalStyles,
      /data-prism-adaptive-surface="avatar-studio"/u,
    );
  });
});
