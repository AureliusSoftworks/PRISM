import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  finishStageExhibitMotion,
  updateStageExhibitPresence,
  type StageExhibitPresenceItem,
} from "./stageExhibitPresence.ts";

const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const signalCss = readFileSync(
  new URL("./botcast.module.css", import.meta.url),
  "utf8",
);
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const debateCss = readFileSync(
  new URL("./DebateExperience.module.css", import.meta.url),
  "utf8",
);

describe("stage exhibit presence", () => {
  it("introduces and removes exhibits through explicit lifecycle motion", () => {
    const entering = updateStageExhibitPresence([], {
      id: "item-1",
      value: { label: "Item" },
    });
    assert.equal(entering[0]?.motionState, "entering");

    const present = finishStageExhibitMotion(entering);
    assert.equal(present[0]?.motionState, "present");

    const exiting = updateStageExhibitPresence(present, null);
    assert.equal(exiting[0]?.motionState, "exiting");
    assert.deepEqual(finishStageExhibitMotion(exiting), []);
  });

  it("keeps camera-only updates present instead of replaying entrance motion", () => {
    const current: readonly StageExhibitPresenceItem<{
      camera: string;
    }>[] = [
      {
        id: "evidence-1",
        value: { camera: "wide" },
        motionState: "present",
      },
    ];
    const updated = updateStageExhibitPresence(current, {
      id: "evidence-1",
      value: { camera: "left" },
    });

    assert.equal(updated.length, 1);
    assert.equal(updated[0]?.motionState, "present");
    assert.equal(updated[0]?.value.camera, "left");
  });

  it("slides the old exhibit out while a replacement enters", () => {
    const current = [
      {
        id: "document-1",
        value: { label: "Document" },
        motionState: "present" as const,
      },
    ];
    const updated = updateStageExhibitPresence(current, {
      id: "picture-2",
      value: { label: "Picture" },
    });

    assert.deepEqual(
      updated.map(({ id, motionState }) => [id, motionState]),
      [
        ["document-1", "exiting"],
        ["picture-2", "entering"],
      ],
    );
  });

  it("wires Signal and Debate to lifecycle-only bottom-of-screen motion", () => {
    assert.match(signalSource, /<SignalEpisodeImagePresence/u);
    assert.match(signalSource, /data-stage-exhibit-motion=\{motionState\}/u);
    assert.match(debateSource, /<DebateEvidencePedestalPresence/u);
    assert.match(
      debateSource,
      /data-stage-exhibit-motion=\{[\s\S]{0,100}motionState/u,
    );
    assert.match(
      signalCss,
      /@keyframes signal-stage-exhibit-enter[^}]*translate:\s*0 calc\(100vh \+ 100%\)/u,
    );
    assert.match(
      signalCss,
      /@keyframes signal-stage-exhibit-exit[\s\S]{0,180}translate:\s*0 calc\(100vh \+ 100%\)/u,
    );
    assert.match(
      debateCss,
      /@keyframes debate-evidence-pedestal-enter[^}]*translate:\s*0 calc\(100vh \+ 100%\)/u,
    );
    assert.match(
      debateCss,
      /@keyframes debate-evidence-pedestal-exit[\s\S]{0,180}translate:\s*0 calc\(100vh \+ 100%\)/u,
    );

    const signalBase = signalCss.match(/\.episodeImageContext\s*\{[^}]*\}/u)?.[0];
    assert.ok(signalBase);
    assert.doesNotMatch(signalBase, /transition:/u);
    const debateBase = debateCss.match(/\.evidencePedestal\s*\{[^}]*\}/u)?.[0];
    assert.ok(debateBase);
    assert.doesNotMatch(debateBase, /animation:/u);
  });
});
