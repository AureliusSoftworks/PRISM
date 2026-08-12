import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const gate = readFileSync(
  new URL("./prismRefractionGate.tsx", import.meta.url),
  "utf8",
);
const warmup = readFileSync(
  new URL("./ModelWarmupIntermission.tsx", import.meta.url),
  "utf8",
);
const warmupCss = readFileSync(
  new URL("./model-warmup-intermission.module.css", import.meta.url),
  "utf8",
);
const companion = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const layout = readFileSync(new URL("./layout.tsx", import.meta.url), "utf8");
const debate = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const refract = readFileSync(
  new URL("./prismRefract.ts", import.meta.url),
  "utf8",
);
const shared = readFileSync(
  new URL("../../../../packages/shared/src/modelReadiness.ts", import.meta.url),
  "utf8",
);
const api = readFileSync(
  new URL("../../../../apps/api/src/server.ts", import.meta.url),
  "utf8",
);

test("mounts a shared refraction gate for warm + fullscreen loader", () => {
  assert.match(layout, /PrismRefractionGateProvider/u);
  assert.match(gate, /prepareLocalModel/u);
  assert.match(gate, /withRefractionLoader/u);
  assert.match(gate, /runLocalRefraction/u);
  assert.match(gate, /ModelWarmupIntermission/u);
  assert.match(gate, /PrismBlockingLoader/u);
  assert.match(gate, /modelPreparationExperienceForSurface/u);
});

test("desaturates the whole screen during local model warmup", () => {
  assert.match(warmup, /createPortal\(/u);
  assert.match(warmup, /document\.body/u);
  assert.match(warmup, /data-prism-model-warmup="true"/u);
  assert.match(warmupCss, /position:\s*fixed/u);
  assert.match(warmupCss, /backdrop-filter:\s*grayscale\(1\)/u);
  assert.match(warmupCss, /-webkit-backdrop-filter:\s*grayscale\(1\)/u);
});

test("Companion field Refract bypasses warmup while magic can still use the gate", () => {
  assert.match(companion, /usePrismRefractionGate/u);
  assert.doesNotMatch(companion, /prepareLocalModel/u);
  assert.match(companion, /runLocalRefraction/u);
  assert.match(companion, /!target\.ownsPresentation/u);
  assert.match(refract, /ownsPresentation\?:/u);
  assert.match(debate, /ownsPresentation:\s*true/u);
  // Field generate calls target.generate directly (rainbow-only wait).
  assert.match(
    companion,
    /const rawValue = await target\.generate\(\{/u,
  );
  assert.doesNotMatch(
    companion,
    /withRefractionLoader\(\{[\s\S]*?target\.generate/u,
  );
  assert.doesNotMatch(
    companion,
    /Refracting \$\{target\.label\}/u,
  );
  // Magic still uses the shared fullscreen gate when it does not own presentation.
  assert.match(
    companion,
    /!target\.ownsPresentation[\s\S]*?runLocalRefraction\(/u,
  );
});

test("Companion suppress keeps in-flight field Refract alive", () => {
  assert.match(companion, /keepFieldRefract/u);
  assert.match(
    companion,
    /session\.registration\.target\.kind !== "magic"/u,
  );
  assert.match(
    companion,
    /session\.phase === "traveling"[\s\S]*session\.phase === "generating"[\s\S]*session\.phase === "ready"[\s\S]*session\.phase === "error"/u,
  );
  assert.match(
    companion,
    /if \(!keepFieldRefract\) \{\s*releasePrismRefract\(true\);/u,
  );
});

test("API prepare allow-list includes the prism companion experience", () => {
  assert.match(shared, /"prism"/u);
  assert.match(api, /body\.experience === "prism"/u);
});

test("Debate motion synthesis warms then shows a dedicated fullscreen loader", () => {
  assert.match(debate, /setMotionOptionsBusy\(true\)/u);
  assert.match(debate, /open=\{motionOptionsBusy\}/u);
  assert.match(debate, /Synthesizing debate options/u);
  assert.match(debate, /context:\s*"refract"/u);
});
