import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const companionSource = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const globalStyles = readFileSync(
  new URL("./globals.css", import.meta.url),
  "utf8",
);
const signalStyles = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const debateStyles = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);

test("Refract holds its in-field feedback without opening model preparation", () => {
  assert.match(
    companionSource,
    /phase === "generating"[\s\S]*element\.dataset\.prismRefractSheen = "true"/u,
  );
  assert.match(
    companionSource,
    /await nextPrismRefractPaint\(controller\.signal\)[\s\S]*const rawValue = await runPrismRefractGenerationWithTimeout[\s\S]*target\.generate/u,
  );
  assert.doesNotMatch(
    companionSource.match(
      /await nextPrismRefractPaint\(controller\.signal\)[\s\S]*?const rawValue = await runPrismRefractGenerationWithTimeout[\s\S]*?target\.generate/u,
    )?.[0] ?? "",
    /prepareLocalModel/u,
  );
  assert.match(
    companionSource,
    /target\.preview\(value\);[\s\S]*waitForPrismRefractPreviewPaint\([\s\S]*kind: "field"[\s\S]*phase: "ready"/u,
  );
  assert.match(
    companionSource,
    /target\.preview\(choice\.value\);[\s\S]*waitForPrismRefractPreviewPaint\([\s\S]*kind: "choice"[\s\S]*phase: "ready"/u,
  );
  assert.match(
    companionSource,
    /delete element\.dataset\.prismRefractSheen[\s\S]*updateRefractSession\(null\)/u,
  );
});

test("Refract owns one universal animated sheen and a static reduced-motion state", () => {
  assert.match(
    globalStyles,
    /data-prism-refract-sheen="true"\]\[data-prism-refract-state="generating"[\s\S]*var\(--bg-surface, var\(--baseline-bg\)\)[\s\S]*outline: 2px solid[\s\S]*animation:\s*prismRefractSheenFlow 1\.7s linear infinite/u,
  );
  assert.match(
    globalStyles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*data-prism-refract-sheen[\s\S]*animation: none !important/u,
  );
  assert.match(
    signalStyles,
    /data-prism-refract-sheen="true"\]\[data-prism-refract-state="generating"[\s\S]*--prism-refract-sheen-surface: var\(--botcast-field\)/u,
  );
  assert.match(
    debateStyles,
    /data-prism-refract-sheen="true"\]\[data-prism-refract-state="generating"[\s\S]*--prism-refract-sheen-surface: var\(--debate-refract-field\)/u,
  );
  assert.doesNotMatch(signalStyles, /signalRefractRainbowFlow/u);
});
