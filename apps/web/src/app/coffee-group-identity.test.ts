import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  coffeeGroupAtmosphereImageUrl,
  coffeeGroupAtmosphereIsReady,
  coffeeGroupHasInFlightSynthesis,
  coffeeGroupSynthesisActionLabel,
  coffeeGroupSynthesisStatusLabel,
  type CoffeeGroupIdentitySnapshot,
} from "./coffeeGroupIdentity.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const componentSource = readFileSync(
  new URL("./CoffeeGroupIdentitySection.tsx", import.meta.url),
  "utf8",
);
const css = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

function group(
  overrides: Partial<CoffeeGroupIdentitySnapshot> = {},
): CoffeeGroupIdentitySnapshot {
  return {
    id: "group-1",
    name: "Night Table",
    ethos: "",
    atmosphere: null,
    ...overrides,
  };
}

test("Coffee Group synthesis helpers keep legacy shapes settled and readable", () => {
  const legacyGroup = group();
  assert.equal(coffeeGroupHasInFlightSynthesis(legacyGroup), false);
  assert.equal(coffeeGroupSynthesisStatusLabel(null), "Needs retry");
  assert.equal(
    coffeeGroupSynthesisActionLabel(legacyGroup, "name"),
    "Regenerate",
  );
  assert.equal(coffeeGroupSynthesisActionLabel(legacyGroup, "ethos"), "Generate");
  assert.equal(
    coffeeGroupSynthesisActionLabel(legacyGroup, "atmosphere"),
    "Generate",
  );
});

test("Coffee Group synthesis helpers expose shaping, retry, and ready states", () => {
  const runningGroup = group({
    synthesis: {
      version: 1,
      items: {
        name: {
          status: "running",
          revision: 0,
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
        ethos: {
          status: "failed",
          revision: 1,
          updatedAt: "2026-07-24T12:00:00.000Z",
          error: "Try again",
        },
        atmosphere: {
          status: "ready",
          revision: 1,
          updatedAt: "2026-07-24T12:00:00.000Z",
        },
      },
    },
    atmosphere: {
      imageId: "room/image",
      revision: 1,
      updatedAt: "2026-07-24T12:00:00.000Z",
    },
  });

  assert.equal(coffeeGroupHasInFlightSynthesis(runningGroup), true);
  assert.equal(
    coffeeGroupSynthesisStatusLabel(runningGroup.synthesis!.items.name),
    "Shaping",
  );
  assert.equal(
    coffeeGroupSynthesisActionLabel(runningGroup, "ethos"),
    "Retry",
  );
  assert.equal(coffeeGroupAtmosphereIsReady(runningGroup), true);
  assert.equal(
    coffeeGroupAtmosphereImageUrl("room/image"),
    "/api/images/room%2Fimage/file",
  );
});

test("Coffee Group identity UI exposes stable rows and one action per item", () => {
  assert.deepEqual(
    componentSource.match(/data-coffee-group-synthesis-item=\{item\}/g),
    ["data-coffee-group-synthesis-item={item}"],
  );
  assert.deepEqual(
    componentSource.match(/data-coffee-group-synthesis-action=\{item\}/g),
    ["data-coffee-group-synthesis-action={item}"],
  );
  assert.match(componentSource, /Shaping|coffeeGroupSynthesisStatusLabel/);
  assert.match(componentSource, /Ready|coffeeGroupSynthesisStatusLabel/);
  assert.match(componentSource, /Needs retry|coffeeGroupSynthesisStatusLabel/);
  assert.match(
    componentSource,
    /maxLength=\{COFFEE_GROUP_ETHOS_MAX_LENGTH\}/,
  );
  assert.match(
    componentSource,
    /One quiet sentence of context—not a recurring topic\./,
  );
});

test("Coffee Group identity polling and retry routes stay quiet and item-scoped", () => {
  assert.match(
    pageSource,
    /COFFEE_GROUP_SYNTHESIS_POLL_INTERVAL_MS = 1_900/,
  );
  assert.match(
    pageSource,
    /coffeeGroups\.some\(coffeeGroupHasInFlightSynthesis\)/,
  );
  assert.match(pageSource, /refreshCoffeeGroups\(\{ quiet: true \}\)/);
  assert.match(
    pageSource,
    /`\/api\/coffee\/groups\/\$\{encodeURIComponent\(group\.id\)\}\/synthesis\/\$\{item\}`[\s\S]*method: "POST"/,
  );
  assert.doesNotMatch(pageSource, /Brewing topics/u);
  assert.match(
    pageSource,
    /Saving the table\. Identity continues in the background\./u,
  );
});

test("Coffee Group ethos saves independently and is included in settings", () => {
  assert.match(
    pageSource,
    /body: JSON\.stringify\(\{ ethos: nextEthos \}\)/,
  );
  assert.match(
    pageSource,
    /name: coffeeGroupNameDraft,\s*ethos: coffeeGroupEthosDraft\.trim\(\),\s*coffeeSettings:/,
  );
  assert.match(
    componentSource,
    /onBlur=\{props\.onEthosBlur\}/,
  );
  assert.match(
    componentSource,
    /item === "ethos" && ethosDirty[\s\S]*?"Save"[\s\S]*?props\.onSaveEthos\(props\.ethosDraft\)/,
  );
  assert.match(
    pageSource,
    /onSaveEthos=\{\(draftValue\) => \{[\s\S]*?commitCoffeeGroupOverviewEthos\(draftValue\)/,
  );
  assert.match(pageSource, /setCoffeeGroupEthosDraft\(group\.ethos \?\? ""\)/);
});

test("ready Coffee Group atmosphere renders beneath the procedural scene with soft blending", () => {
  assert.match(
    pageSource,
    /data-coffee-group-atmosphere-backdrop="true"[\s\S]*coffeeGroupAtmosphereImageUrl\([\s\S]*<CoffeeAtmosphereScene/,
  );
  assert.match(
    css,
    /\.coffeeGroupAtmosphereBackdrop \{[\s\S]*mask-image: radial-gradient/,
  );
  assert.match(
    css,
    /\.coffeeGroupAtmosphereBackdrop img \{[\s\S]*opacity: 0\.32;[\s\S]*saturate\(0\.66\)[\s\S]*contrast\(0\.88\)/,
  );
  assert.match(
    css,
    /\.themeLight\.coffeeShell \.coffeeGroupAtmosphereBackdrop img/,
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*\.coffeeGroupAtmosphereBackdrop \{[\s\S]*transition: none;/,
  );
});
