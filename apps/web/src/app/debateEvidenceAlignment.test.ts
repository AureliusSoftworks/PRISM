import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  DEFAULT_DEBATE_STAGE_ALIGNMENT,
  DEBATE_STAGE_EVIDENCE_BLUR_RADIUS_MAX,
  DEBATE_STAGE_EVIDENCE_BLUR_RADIUS_MIN,
  DEBATE_STAGE_EVIDENCE_BLUR_RADIUS_STEP,
  debateStageAlignmentStyle,
  formatDebateStageAlignmentClipboard,
  formatDebateStageEvidenceTableClipboard,
  normalizeDebateStageAlignment,
  readDebateStageAlignment,
  updateDebateStageEvidenceTable,
  writeDebateStageAlignment,
} from "./debateStageAlignment.ts";

const kinds = ["exhibit", "source"] as const;
const cameras = ["wide", "left", "moderator", "right"] as const;

describe("Forum evidence alignment and focus", () => {
  it("preserves old positions and shadows while defaulting asset blur to zero", () => {
    const old = JSON.parse(JSON.stringify(DEFAULT_DEBATE_STAGE_ALIGNMENT));
    for (const kind of kinds) {
      for (const camera of cameras) {
        delete old.evidenceTable[kind][camera].blurRadius;
      }
    }
    old.evidenceTable.exhibit.moderator.x = 24;
    old.evidenceTable.source.moderator.y = 82;
    old.evidenceTable.source.moderator.shadow.blur = 16;
    const normalized = normalizeDebateStageAlignment(old);
    for (const kind of kinds) {
      for (const camera of cameras) {
        assert.deepEqual(normalized.evidenceTable[kind][camera], {
          ...old.evidenceTable[kind][camera],
          blurRadius: 0,
        });
      }
    }
  });

  it("bounds the blur radius and retains quarter-pixel precision", () => {
    assert.equal(DEBATE_STAGE_EVIDENCE_BLUR_RADIUS_MIN, 0);
    assert.equal(DEBATE_STAGE_EVIDENCE_BLUR_RADIUS_STEP, 0.25);
    for (const [input, expected] of [
      [-4, 0],
      [100, DEBATE_STAGE_EVIDENCE_BLUR_RADIUS_MAX],
      [1.25, 1.25],
      [NaN, 0],
      [Infinity, 0],
    ]) {
      const result = updateDebateStageEvidenceTable(
        DEFAULT_DEBATE_STAGE_ALIGNMENT,
        "source",
        "moderator",
        { blurRadius: input },
      );
      assert.equal(result.evidenceTable.source.moderator.blurRadius, expected);
    }
  });

  it("changes position, size, and blur only for the selected camera and asset", () => {
    for (const activeKind of kinds) {
      for (const activeCamera of cameras) {
        const changed = updateDebateStageEvidenceTable(
          DEFAULT_DEBATE_STAGE_ALIGNMENT,
          activeKind,
          activeCamera,
          { x: 28, y: -14, size: 135, blurRadius: 2.75 },
        );
        for (const kind of kinds) {
          for (const camera of cameras) {
            assert.deepEqual(changed.evidenceTable[kind][camera], {
              ...DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable[kind][camera],
              ...(kind === activeKind && camera === activeCamera
                ? { x: 28, y: -14, size: 135, blurRadius: 2.75 }
                : {}),
            });
          }
        }
        assert.deepEqual(
          changed.whodunnitCourt,
          DEFAULT_DEBATE_STAGE_ALIGNMENT.whodunnitCourt,
        );
        assert.deepEqual(
          changed.juryChamber,
          DEFAULT_DEBATE_STAGE_ALIGNMENT.juryChamber,
        );
        assert.deepEqual(changed.main, DEFAULT_DEBATE_STAGE_ALIGNMENT.main);
      }
    }
  });

  it("resets one Moderator asset without changing the other asset or table", () => {
    const exhibit = updateDebateStageEvidenceTable(
      DEFAULT_DEBATE_STAGE_ALIGNMENT,
      "exhibit",
      "moderator",
      { x: -15, size: 175, blurRadius: 3 },
    );
    const source = updateDebateStageEvidenceTable(
      exhibit,
      "source",
      "moderator",
      { x: 24, y: 90, size: 130, blurRadius: 1.25 },
    );
    const reset = updateDebateStageEvidenceTable(
      source,
      "source",
      "moderator",
      DEFAULT_DEBATE_STAGE_ALIGNMENT.evidenceTable.source.moderator,
    );
    assert.deepEqual(reset, exhibit);
  });

  it("keeps distinct Moderator blur in saved presets, copied defaults, and evidence exports", () => {
    const alignment = updateDebateStageEvidenceTable(
      updateDebateStageEvidenceTable(
        DEFAULT_DEBATE_STAGE_ALIGNMENT,
        "exhibit",
        "moderator",
        { blurRadius: 2.25 },
      ),
      "source",
      "moderator",
      { blurRadius: 0.75 },
    );
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };
    writeDebateStageAlignment(storage, "evidence-focus", alignment);
    assert.deepEqual(
      readDebateStageAlignment(storage, "evidence-focus"),
      alignment,
    );
    const copied = formatDebateStageAlignmentClipboard(alignment);
    assert.deepEqual(
      JSON.parse(copied.slice(copied.indexOf("\n") + 1, -1)),
      alignment,
    );
    assert.deepEqual(
      JSON.parse(
        formatDebateStageEvidenceTableClipboard(alignment.evidenceTable),
      ),
      alignment.evidenceTable,
    );
    const style = debateStageAlignmentStyle(alignment) as Record<
      string,
      string
    >;
    assert.equal(style["--debate-moderator-evidence-blur-radius"], "2.25px");
    assert.equal(
      style["--debate-moderator-source-evidence-blur-radius"],
      "0.75px",
    );
    assert.equal(style["--debate-evidence-blur-radius"], "0px");
    assert.equal(style["--debate-source-evidence-blur-radius"], "0px");
  });

  it("shows the asset blur slider only in Moderator and writes the active kind and camera", () => {
    const source = readFileSync(
      new URL("./DebateExperience.tsx", import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /evidenceAlignmentView === "moderator" \? \([\s\S]{0,180}data-debate-evidence-blur-tuner="true"/u,
    );
    assert.match(source, /value=\{activeEvidenceTable\.blurRadius\}/u);
    assert.match(
      source,
      /const blurRadius = Number\(event\.currentTarget\.value\)/u,
    );
    assert.match(
      source,
      /updateDebateStageEvidenceTable\(\s*current,\s*stageAlignmentPreviewEvidenceKind,\s*evidenceAlignmentView,\s*\{ blurRadius \}/u,
    );
    assert.match(
      source,
      /aria-label=\{`Reset \$\{stageAlignmentPreviewCameraLabel\} \$\{stageAlignmentPreviewEvidenceKind\}`\}/u,
    );
    assert.match(source, /Moderator blur is also saved per asset/u);
  });

  it("applies focus on the shared live/preview evidence layer without replacing prop shadows", () => {
    const css = readFileSync(
      new URL("./DebateExperience.module.css", import.meta.url),
      "utf8",
    );
    assert.match(
      css,
      /\.evidencePedestal \{[^}]*filter: blur\(var\(--debate-active-evidence-blur-radius\)\)\s*drop-shadow/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-view="moderator"\] \{[^}]*--debate-moderator-evidence-blur-radius/u,
    );
    assert.match(
      css,
      /\.evidencePedestal\[data-evidence-kind="source"\]\[data-evidence-view="moderator"\] \{[^}]*--debate-moderator-source-evidence-blur-radius/u,
    );
    assert.match(
      css,
      /\.evidencePedestal \.evidencePedestalSprite \{[^}]*filter: drop-shadow/u,
    );
  });
});
