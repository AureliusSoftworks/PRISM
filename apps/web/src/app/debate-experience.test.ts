import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { DEBATE_SCHEMA_VERSION } from "@localai/shared";
import {
  copyDebateMotionSlate,
  debatePrefilledCast,
} from "./debateExperienceState.ts";

const source = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);
const css = readFileSync(
  fileURLToPath(new URL("./DebateExperience.module.css", import.meta.url)),
  "utf8",
);
const scene = readFileSync(
  fileURLToPath(new URL("./DebateForumScene.tsx", import.meta.url)),
  "utf8",
);
const page = readFileSync(
  fileURLToPath(new URL("./page.tsx", import.meta.url)),
  "utf8",
);

describe("Debate experience", () => {
  it("selects all motion fields atomically without retaining nested references", () => {
    const slate = {
      version: DEBATE_SCHEMA_VERSION,
      id: "slate-1",
      motion: "This house would build.",
      forSide: { label: "Build", brief: "Build the thing." },
      againstSide: { label: "Pause", brief: "Do not build the thing." },
    };
    const selected = copyDebateMotionSlate(slate);
    assert.deepEqual(selected, slate);
    assert.notEqual(selected.forSide, slate.forSide);
    assert.notEqual(selected.againstSide, slate.againstSide);
  });

  it("prefills contextual casts only when no explicit selection is required", () => {
    assert.deepEqual(debatePrefilledCast(["m", "f", "a"]), {
      moderator: "m",
      forAdvocate: "f",
      againstAdvocate: "a",
    });
    assert.deepEqual(debatePrefilledCast(["m", "f", "a", "extra"]), {
      moderator: "",
      forAdvocate: "",
      againstAdvocate: "",
    });
  });

  it("registers synthesis with Prism while keeping a visible accessible action", () => {
    assert.match(source, /PrismRefractTarget target=\{synthesisMagic\}/u);
    assert.match(source, /data-tutorial-target="debate-synthesize"/u);
    assert.match(source, /Synthesize options/u);
  });

  it("offers all three recovery paths when an advocate declines", () => {
    assert.match(source, /Swap sides/u);
    assert.match(source, /Change bot/u);
    assert.match(source, /Revise motion/u);
  });

  it("captures form values before functional state updates run", () => {
    assert.match(
      source,
      /const value = event\.currentTarget\.value;\s+setMotion\(\(current\)/u,
    );
    assert.match(
      source,
      /const value = event\.currentTarget\.value;\s+setCast\(\(current\)/u,
    );
    assert.match(
      source,
      /const value = event\.currentTarget\.value;\s+setEvidence\(\(current\)/u,
    );
  });

  it("keeps stable tutorial targets across the complete Duel workflow", () => {
    for (const target of [
      "debate-new",
      "debate-synthesize",
      "debate-consent",
      "debate-evidence",
      "debate-start",
      "debate-case-board",
    ]) {
      assert.match(source, new RegExp(`data-tutorial-target="${target}"`, "u"));
    }
  });

  it("uses authored Light and Dark receivers with adaptive masked fallback", () => {
    assert.match(css, /forum-dark\.webp/u);
    assert.match(css, /forum-light\.webp/u);
    assert.match(scene, /sceneId: "debate-forum"/u);
    assert.match(scene, /role: DebateForumRole/u);
    assert.match(css, /data-renderer-status="webgl"/u);
    assert.match(css, /prefers-reduced-motion/u);
  });

  it("keeps both themes and the global companion aware of the Debate surface", () => {
    assert.match(source, /data-theme=\{props\.theme\}/u);
    assert.match(css, /\.lobby\[data-theme="light"\]/u);
    assert.match(css, /\.setup\[data-theme="light"\]/u);
    assert.match(page, /surfaceId: "debate"/u);
  });
});
