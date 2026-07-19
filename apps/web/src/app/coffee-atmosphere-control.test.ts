import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

test("Coffee exposes Jazz as an intentionally unwired atmosphere control", () => {
  assert.match(
    source,
    /<span className=\{styles\.coffeeSettingsFieldLabel\}>Atmosphere audio<\/span>/u,
  );
  assert.match(
    source,
    /className=\{styles\.coffeeJazzButton\}[\s\S]{0,100}disabled[\s\S]{0,100}>\s*Jazz/u,
  );
});

test("Coffee shares tactful foley and cup-synchronized audio with Signal", () => {
  assert.match(source, /<SessionAtmosphereLayer/u);
  assert.match(source, /coffeeCupRootRef=\{coffeeWorkspaceRef\}/u);
  assert.match(
    source,
    /coffeeSessionPhase !== "finished" \|\| coffeeReplayActive/u,
  );
  const atmosphereSource = readFileSync(
    new URL("./session-atmosphere-audio.ts", import.meta.url),
    "utf8",
  );
  assert.match(atmosphereSource, /mutation\.removedNodes/u);
  assert.match(
    atmosphereSource,
    /coffeeCupFoleyCueForTransition\(previous, false\)/u,
  );
});
