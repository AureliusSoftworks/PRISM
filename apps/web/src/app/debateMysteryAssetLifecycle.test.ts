import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DebateSessionV1 } from "@localai/shared";
import {
  debateMysteryCourtEvidenceAssetUrls,
  releaseDebateMysteryInvestigationMedia,
} from "./debateMysteryAssetLifecycle.ts";

describe("Whodunnit investigation asset lifecycle", () => {
  it("carries only synthesized evidence visuals into the court preload set", () => {
    const session = {
      format: "turnabout",
      formatState: {
        format: "turnabout",
        mysteryTrial: { version: 1 },
      },
      evidence: {
        exhibits: [
          { imageId: "evidence one" },
          { imageId: null },
          { imageId: "evidence one" },
          { imageId: "evidence/two" },
        ],
      },
    } as unknown as DebateSessionV1;

    assert.deepEqual(debateMysteryCourtEvidenceAssetUrls(session), [
      "/api/images/evidence%20one/file",
      "/api/images/evidence%2Ftwo/file",
    ]);
    assert.deepEqual(
      debateMysteryCourtEvidenceAssetUrls({
        ...session,
        format: "forum",
        formatState: { format: "forum" },
      } as unknown as DebateSessionV1),
      [],
    );
  });

  it("releases investigation media while retaining evidence nodes", () => {
    const releasedAttributes: string[] = [];
    const investigationElement = {
      closest: () => null,
      removeAttribute: (attribute: string) => releasedAttributes.push(attribute),
    };
    const evidenceElement = {
      closest: () => evidenceElement,
      removeAttribute: () => assert.fail("Evidence media must stay retained."),
    };
    const root = {
      querySelectorAll: () => [investigationElement, evidenceElement],
    } as unknown as ParentNode;

    assert.equal(releaseDebateMysteryInvestigationMedia(root), 1);
    assert.deepEqual(releasedAttributes, ["src", "srcset", "sizes", "poster"]);
    assert.equal(releaseDebateMysteryInvestigationMedia(null), 0);
  });
});
