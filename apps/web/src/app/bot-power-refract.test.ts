import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBotGeneratorBriefRefractContext,
  buildBotGeneratorRefractRequestTarget,
  botPowerRefractTargetId,
  buildBotPowerRefractDraftContext,
  buildBotPowerRefractRequestTarget,
} from "./botPowerRefract.ts";
import { prismRefractResultOwnershipIsCurrent } from "./prismRefract.ts";

test("Power Refract binds the selected bot and current draft identity", () => {
  const context = buildBotPowerRefractDraftContext({
    botId: "eratosthenes-id",
    botName: "Eratosthenes",
    profileContext:
      "Ancient Greek mathematician and geographer; rigorous, curious, and precise.",
    powers: [
      { name: "Sieve", intent: "Filters false premises from a claim." },
    ],
  });

  assert.match(
    context,
    /Focused Avatar Studio bot draft identity: Eratosthenes/u,
  );
  assert.match(context, /Focused bot draft owner: eratosthenes-id/u);
  assert.match(context, /Ancient Greek mathematician and geographer/u);
  assert.match(context, /Filters false premises/u);
  assert.doesNotMatch(context, /Plankton|Bikini Bottom/u);
  assert.deepEqual(
    buildBotPowerRefractRequestTarget({
      botId: "eratosthenes-id",
      botName: "Eratosthenes",
      context,
      maxLength: 2_000,
    }).surface.botIds,
    ["eratosthenes-id"],
  );
  assert.notEqual(
    botPowerRefractTargetId("eratosthenes-id"),
    botPowerRefractTargetId("bikini-bottom-id"),
  );
});

test("Generator brief Refract context and target remain bounded and focused to Avatar Studio", () => {
  const context = buildBotGeneratorBriefRefractContext({
    brief: "Retired lunar cartographer who keeps a hand-drawn star chart.",
  });
  assert.match(
    context,
    /Focused Avatar Studio bot generator brief context/u,
  );
  assert.match(context, /Current Character brief:/u);
  assert.match(context, /Retired lunar cartographer/);

  const requestTarget = buildBotGeneratorRefractRequestTarget({
    context,
    maxLength: 2_000,
  });
  assert.equal(requestTarget.kind, "prism.input.text");
  assert.deepEqual(requestTarget.surface, { surfaceId: "avatar-studio" });
  assert.equal(requestTarget.label, "Character brief");
  assert.equal(requestTarget.multiline, true);
  assert.equal(requestTarget.maxLength, 2_000);
});

test("late Power Refract results are rejected after bot, field, or request changes", () => {
  const firstElement = {} as HTMLElement;
  const secondElement = {} as HTMLElement;
  const base = {
    aborted: false,
    requestRunId: 4,
    currentRunId: 4,
    expectedTargetId: "avatar-studio-power-prompt-eratosthenes-id",
    currentTargetId: "avatar-studio-power-prompt-eratosthenes-id",
    expectedElement: firstElement,
    currentElement: firstElement,
  };

  assert.equal(prismRefractResultOwnershipIsCurrent(base), true);
  assert.equal(
    prismRefractResultOwnershipIsCurrent({ ...base, currentRunId: 5 }),
    false,
  );
  assert.equal(
    prismRefractResultOwnershipIsCurrent({
      ...base,
      currentTargetId: "avatar-studio-power-prompt-bikini-bottom-id",
    }),
    false,
  );
  assert.equal(
    prismRefractResultOwnershipIsCurrent({
      ...base,
      currentTargetId: "avatar-studio-profile-prompt-eratosthenes-id",
    }),
    false,
  );
  assert.equal(
    prismRefractResultOwnershipIsCurrent({
      ...base,
      currentElement: secondElement,
    }),
    false,
  );
});
