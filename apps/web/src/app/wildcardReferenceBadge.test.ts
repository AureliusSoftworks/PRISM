import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  nextWildcardReferenceNumber,
  rewriteWildcardSlotTokenReference,
  wildcardReferenceBadge,
} from "./wildcardReferenceBadge.ts";

describe("wildcard reference badges", () => {
  it("maps numeric references to badge letters", () => {
    assert.equal(wildcardReferenceBadge("1"), "A");
    assert.equal(wildcardReferenceBadge("26"), "Z");
    assert.equal(wildcardReferenceBadge("27"), null);
    assert.equal(wildcardReferenceBadge(null), null);
  });

  it("cycles upward from no badge through letters and back to none", () => {
    assert.equal(nextWildcardReferenceNumber(null, "up"), 1);
    assert.equal(nextWildcardReferenceNumber("1", "up"), 2);
    assert.equal(nextWildcardReferenceNumber("26", "up"), null);
  });

  it("cycles downward back to no badge after A", () => {
    assert.equal(nextWildcardReferenceNumber(null, "down"), 1);
    assert.equal(nextWildcardReferenceNumber("2", "down"), 1);
    assert.equal(nextWildcardReferenceNumber("1", "down"), null);
  });

  it("rewrites brace wildcard tokens using the internal numeric suffix", () => {
    assert.equal(rewriteWildcardSlotTokenReference("{PERSON}", "up"), "{PERSON1}");
    assert.equal(rewriteWildcardSlotTokenReference("{PERSON1}", "up"), "{PERSON2}");
    assert.equal(rewriteWildcardSlotTokenReference("{PERSON2}", "down"), "{PERSON1}");
    assert.equal(rewriteWildcardSlotTokenReference("{PERSON1}", "down"), "{PERSON}");
    assert.equal(rewriteWildcardSlotTokenReference("{PERSON26}", "up"), "{PERSON}");
  });

  it("ignores bang deck syntax and unsupported brace tokens", () => {
    assert.equal(rewriteWildcardSlotTokenReference("!person", "up"), null);
    assert.equal(rewriteWildcardSlotTokenReference("{MOOD}", "up"), null);
  });
});
