---
title: "packages/shared/src/botProfile.test.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/botProfile.test.ts"
status: "active"
---

# packages/shared/src/botProfile.test.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[03-packages/shared/src/botProfile.ts]]

## Referenced by
- _No backlinks yet_

## Source path
- `packages/shared/src/botProfile.test.ts`

## Import references
- `node:test`
- `node:assert/strict`
- `./botProfile.ts`

## Source preview
```text
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BOT_PROFILE_META_END,
  BOT_PROFILE_META_START,
  composeBotProfileProse,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
  stripPurposeStatementPrefixes,
} from "./botProfile.ts";

describe("bot profile serialization", () => {
  it("preserves spaces in purpose statement tails for the editor", () => {
    assert.equal(
      stripPurposeStatementPrefixes("  hello  world  ", "Ada"),
      "  hello  world  "
    );
    assert.equal(
      stripPurposeStatementPrefixes("You are Ada,  spaced  out  ", "Ada"),
      "spaced  out  "
    );
  });

  it("round-trips the V2 profile metadata exactly enough for dirty checks", () => {
    const profile = parseStoredBotPrompt("").fields;
    profile.purpose.statement = "a moonlit pollster";
    profile.core.traits = "curious, exacting";
    profile.core.openness = 2;
    profile.core.conscientiousness = 1;
    profile.core.extraversion = -1;
    profile.core.agreeableness = 0;
    profile.core.emotionalStability = 2;
    profile.identity.species = "android";
    profile.worldview.politicalView = -1;
    profile.appearance.description = "silver coat, tired eyes";

    const stored = serializeStoredBotPrompt(profile, "Mira");
    const parsed = parseStoredBotPrompt(stored).fields;

    assert.deepEq

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
