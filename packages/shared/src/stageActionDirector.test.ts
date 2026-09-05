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

  it("keeps every scripted Director beat body-neutral", () => {
    // The Director cannot see a speaker's anatomy; fingers/arms/shoulders are
    // persona-invite territory (the model writes for its own body).
    const moodHints = [
      "neutral",
      "warm",
      "joyful",
      "guarded",
      "strained",
      "amused",
      "stern",
      "attentive",
      "waiting",
      "confused",
    ] as const;
    for (const moodHint of moodHints) {
      for (let index = 0; index < 40; index += 1) {
        const action = selectScriptedStageActionV1({
          lane: "coffee",
          seed: `coffee:anatomy:${moodHint}:${index}`,
          moodHint,
        });
        assert.ok(action);
        assert.doesNotMatch(
          action!.action,
          /\b(?:finger|fingers|arm|arms|shoulder|shoulders|hand|hands|fist|fists)\b/iu,
          `scripted beat assumes limbs: "${action!.action}"`,
        );
      }
    }
  });

  it("narrows a single eye for one-eyed speakers", () => {
    let sawSingularEye = false;
    for (let index = 0; index < 200 && !sawSingularEye; index += 1) {
      const twoEyed = selectScriptedStageActionV1({
        lane: "coffee",
        seed: `coffee:eye:${index}`,
        moodHint: "stern",
      });
      if (twoEyed?.action !== "narrows their eyes") continue;
      const oneEyed = selectScriptedStageActionV1({
        lane: "coffee",
        seed: `coffee:eye:${index}`,
        moodHint: "stern",
        speakerEyeCount: 1,
      });
      assert.equal(oneEyed?.action, "narrows their eye");
      sawSingularEye = true;
    }
    assert.ok(sawSingularEye, "never sampled the narrowed-eyes beat");
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

  it("accepts body-part-led beats from bespoke anatomy personas", () => {
    // "antennae" is a Latin plural, so the s-form verb heuristic missed it and
    // the beat was spoken on the table (Coffee review 8e012a9d, turn 2).
    const leading = extractLeadingStageActionV1({
      text: "*antennae perk up slightly* The Chum Bucket's pizza is superior by design.",
      lane: "coffee",
    });
    assert.deepEqual(leading, {
      action: "antennae perk up slightly",
      spokenText: "The Chum Bucket's pizza is superior by design.",
    });
    // Copular sentences that merely start with a body part stay spoken.
    assert.equal(
      validateStageActionTextV1({
        action: "antennae are delicate instruments",
        lane: "coffee",
      }),
      null,
    );
  });

  it("drops an invalid multi-word leading action instead of speaking it", () => {
    const firstPerson = extractAndStripStageActionV1({
      text: "*I fold my arms* Fine, have it your way.",
      lane: "coffee",
    });
    assert.equal(firstPerson.action, null);
    assert.equal(firstPerson.spokenText, "Fine, have it your way.");

    const namesParticipant = extractAndStripStageActionV1({
      text: "*glares at Squidward* The crust is the point.",
      lane: "coffee",
      participantNames: ["Squidward", "SpongeBob"],
    });
    assert.equal(namesParticipant.action, null);
    assert.equal(namesParticipant.spokenText, "The crust is the point.");

    // Single-word leading emphasis is not a stage direction; keep it spoken.
    const emphasis = extractAndStripStageActionV1({
      text: "*This* is the best pizza in Bikini Bottom.",
      lane: "coffee",
    });
    assert.equal(emphasis.action, null);
    assert.equal(emphasis.spokenText, "*This* is the best pizza in Bikini Bottom.");
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

  it("keeps an optional action without inventing a Director fallback", () => {
    const plan = planStageActionV1({
      lane: "signal",
      seed: "signal:producer-cue:optional-action",
      personaInviteChance: 0,
    });
    const directed = resolveFinalStageActionV1({
      plan,
      lane: "signal",
      replyText: "*starts twerking* Stay with the evidence.",
      directorFallback: false,
    });
    assert.equal(directed.action?.source, "llm");
    assert.equal(directed.action?.action, "starts twerking");
    assert.equal(directed.spokenText, "Stay with the evidence.");

    const speechOnly = resolveFinalStageActionV1({
      plan,
      lane: "signal",
      replyText: "Stay with the evidence.",
      directorFallback: false,
    });
    assert.equal(speechOnly.action, null);
    assert.equal(speechOnly.spokenText, "Stay with the evidence.");
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
