import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  STAGE_ACTION_PERSONA_INVITE_CHANCE,
  extractAndStripStageActionV1,
  extractLeadingStageActionV1,
  normalizeCoffeeStageActionPayload,
  normalizeZenStageActionPayload,
  planStageActionV1,
  replyAlreadyHasStageAction,
  resolveFinalStageActionV1,
  selectScriptedStageActionV1,
  stageActionPersonaInvitePromptV1,
  stageActionSpeechOnlyPromptV1,
  validateStageActionTextV1,
} from "./stageActionDirector.ts";

describe("stageActionDirector", () => {
  it("plans a replay-stable ~20% persona invite mix", () => {
    let invites = 0;
    const total = 5_000;
    for (let index = 0; index < total; index += 1) {
      const plan = planStageActionV1({
        lane: "coffee",
        seed: `coffee:bot-a:${index}`,
      });
      assert.equal(plan.v, 1);
      if (plan.decision === "persona_invite") invites += 1;
      assert.deepEqual(
        plan,
        planStageActionV1({
          lane: "coffee",
          seed: `coffee:bot-a:${index}`,
        }),
      );
    }
    const rate = invites / total;
    assert.ok(
      rate > STAGE_ACTION_PERSONA_INVITE_CHANCE - 0.03 &&
        rate < STAGE_ACTION_PERSONA_INVITE_CHANCE + 0.03,
      `expected invite rate near 0.20, got ${rate}`,
    );
  });

  it("honors exclusions before the invite roll", () => {
    const plan = planStageActionV1({
      lane: "signal",
      seed: "signal:host:12",
      exclusions: ["social_silence"],
    });
    assert.equal(plan.decision, "excluded");
    if (plan.decision === "excluded") {
      assert.equal(plan.reason, "social_silence");
    }
  });

  it("selects weighted scripted actions and avoids recent repeats", () => {
    const first = selectScriptedStageActionV1({
      lane: "coffee",
      seed: "coffee:bot:3",
      moodHint: "strained",
    });
    assert.ok(first);
    const second = selectScriptedStageActionV1({
      lane: "coffee",
      seed: "coffee:bot:3",
      moodHint: "strained",
      recentActions: [first!.action],
    });
    assert.ok(second);
    assert.notEqual(second!.action, first!.action);
    assert.deepEqual(
      first,
      selectScriptedStageActionV1({
        lane: "coffee",
        seed: "coffee:bot:3",
        moodHint: "strained",
      }),
    );
  });

  it("rejects current participant names but allows signature companions", () => {
    assert.equal(
      validateStageActionTextV1({
        action: "glares at Squidward",
        lane: "coffee",
        participantNames: ["Squidward", "SpongeBob"],
        userDisplayName: "Jared",
      }),
      null,
    );
    assert.equal(
      validateStageActionTextV1({
        action: "leans forward, eyes fixed intensely on Ian",
        lane: "signal",
        participantNames: ["Copycat Calvin", "Identity Crisis Ian"],
      }),
      null,
    );
    assert.equal(
      validateStageActionTextV1({
        action: "checks on Rupert",
        lane: "coffee",
        participantNames: ["Squidward", "SpongeBob"],
        userDisplayName: "Jared",
      }),
      "checks on Rupert",
    );
    assert.equal(
      validateStageActionTextV1({
        action: "taps a claw on the table",
        lane: "coffee",
      }),
      "taps a claw on the table",
    );
    assert.equal(
      validateStageActionTextV1({
        action: "I raise an eyebrow",
        lane: "zen",
      }),
      null,
    );
  });

  it("keeps Signal persona invites from naming co-hosts in stage actions", () => {
    assert.match(
      stageActionPersonaInvitePromptV1("signal"),
      /Do not name yourself, your co-host, or the player/u,
    );
  });

  it("extracts leading actions and strips them from spoken text", () => {
    const leading = extractLeadingStageActionV1({
      text: "*raises an eyebrow* That is optimistic.",
      lane: "coffee",
    });
    assert.deepEqual(leading, {
      action: "raises an eyebrow",
      spokenText: "That is optimistic.",
    });
    assert.equal(replyAlreadyHasStageAction("*nods slowly* Sure."), true);
    const stripped = extractAndStripStageActionV1({
      text: "Sure. *narrows their eyes*",
      lane: "signal",
    });
    assert.equal(stripped.action, "narrows their eyes");
    assert.equal(stripped.spokenText, "Sure.");
  });

  it("keeps valid model actions and falls back to the Director otherwise", () => {
    const invitePlan = planStageActionV1({
      lane: "coffee",
      seed: "coffee:bot:invite-keep",
      personaInviteChance: 1,
    });
    assert.equal(invitePlan.decision, "persona_invite");
    const kept = resolveFinalStageActionV1({
      plan: invitePlan,
      lane: "coffee",
      replyText: "*sips from flask* Science.",
      participantNames: ["Morty"],
    });
    assert.equal(kept.action?.source, "llm");
    assert.equal(kept.action?.action, "sips from flask");
    assert.equal(kept.spokenText, "Science.");

    const directorPlan = planStageActionV1({
      lane: "coffee",
      seed: "coffee:bot:director-fill",
      personaInviteChance: 0,
    });
    assert.equal(directorPlan.decision, "director");
    const filled = resolveFinalStageActionV1({
      plan: directorPlan,
      lane: "coffee",
      replyText: "Plain spoken line.",
      moodHint: "neutral",
    });
    assert.equal(filled.action?.source, "director");
    assert.ok(filled.action?.action);
    assert.equal(filled.spokenText, "Plain spoken line.");
  });

  it("discards actions when a post-generation exclusion appears", () => {
    const plan = planStageActionV1({
      lane: "coffee",
      seed: "coffee:bot:depart",
      personaInviteChance: 0,
    });
    const resolved = resolveFinalStageActionV1({
      plan,
      lane: "coffee",
      replyText: "*raises an eyebrow* Goodbye.",
      postGenerationExclusions: ["departure"],
    });
    assert.equal(resolved.action, null);
    assert.equal(resolved.spokenText, "Goodbye.");
  });

  it("normalizes Coffee and Zen stage-action payloads", () => {
    assert.deepEqual(
      normalizeCoffeeStageActionPayload({
        v: 1,
        name: "coffeeStageAction",
        source: "director",
        category: "judgemental",
        action: "raises an eyebrow",
        seed: "coffee:1",
      }),
      {
        v: 1,
        name: "coffeeStageAction",
        source: "director",
        category: "judgemental",
        action: "raises an eyebrow",
        seed: "coffee:1",
      },
    );
    assert.deepEqual(
      normalizeZenStageActionPayload({
        v: 1,
        name: "zenStageAction",
        source: "llm",
        category: "warm",
        action: "takes a breath",
        seed: "zen:1",
      }),
      {
        v: 1,
        name: "zenStageAction",
        source: "llm",
        category: "warm",
        action: "takes a breath",
        seed: "zen:1",
      },
    );
  });

  it("provides distinct speech-only and persona invite prompts", () => {
    const speechOnly = stageActionSpeechOnlyPromptV1("coffee");
    const invite = stageActionPersonaInvitePromptV1("coffee");
    assert.match(speechOnly, /spoken words only/i);
    assert.doesNotMatch(speechOnly, /Prefer opening with one short/);
    assert.match(invite, /signature objects|established companions/i);
    assert.match(invite, /Rupert|companions|props/i);
  });
});
