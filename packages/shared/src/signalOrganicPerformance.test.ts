import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalPrivateFollowUpQuestionV1,
  buildSignalStudioIncidentEventV1,
  normalizeSignalConversationRepairEventV1,
  normalizeSignalStudioIncidentEventV1,
  planSignalOrganicInterruptionV1,
  planSignalRepetitionEligibilityV1,
  signalParaphraseMateriallyReframesV1,
  signalConversationRepairCanStartV1,
  signalPendingInterruptionRepairV1,
  signalPendingRepetitionRepairV1,
  signalRepetitionFrictionReasonV1,
  type SignalConversationRepairEventV1,
  type SignalStudioIncidentEventV1,
} from "./signalOrganicPerformance.ts";

const repetitionOpened: SignalConversationRepairEventV1 = {
  v: 1,
  name: "signalConversationRepair",
  provenance: "signal_organic_dialogue",
  canonicalImpact: "none",
  sequenceId: "repair-1",
  subtype: "repetition_clarification",
  phase: "opened",
  triggerMessageId: "guest-reask",
  hostBotId: "host",
  guestBotId: "guest",
  turnOrdinal: 4,
  repeatMode: "paraphrase",
  sourceMessageId: "host-question",
};

test("public repetition repair persists only replay-safe obligations", () => {
  assert.deepEqual(
    normalizeSignalConversationRepairEventV1(repetitionOpened),
    repetitionOpened,
  );
  assert.deepEqual(signalPendingRepetitionRepairV1([repetitionOpened]), repetitionOpened);
  assert.equal(
    signalConversationRepairCanStartV1({
      prior: [repetitionOpened],
      subtype: "repetition_clarification",
      turnOrdinal: 12,
    }),
    false,
  );
  assert.equal(
    signalConversationRepairCanStartV1({
      prior: [repetitionOpened],
      subtype: "soft_interruption",
      turnOrdinal: 7,
    }),
    false,
  );
  assert.equal(
    signalConversationRepairCanStartV1({
      prior: [repetitionOpened],
      subtype: "soft_interruption",
      turnOrdinal: 8,
    }),
    true,
  );
  assert.equal(
    normalizeSignalConversationRepairEventV1({
      ...repetitionOpened,
      unheardIntent: "private draft",
      hostBotId: "guest",
    }),
    null,
  );
});

test("friendly interruption planning is host-over-guest near six percent", () => {
  const guestDecisions = Array.from({ length: 20_000 }, (_, index) =>
    planSignalOrganicInterruptionV1({
      episodeId: "frequency-episode",
      messageId: `guest-answer-${index}`,
      speakerRole: "guest",
      wordCount: 48,
    })
  );
  const soft = guestDecisions.filter(
    (decision) => decision?.subtype === "soft_interruption",
  ).length;
  const mutual = guestDecisions.filter(
    (decision) => decision?.subtype === "mutual_interruption",
  ).length;
  assert.ok(soft / guestDecisions.length > 0.05);
  assert.ok(soft / guestDecisions.length < 0.07);
  assert.ok(mutual / guestDecisions.length > 0.004);
  assert.ok(mutual / guestDecisions.length < 0.013);
  const hostDecisions = Array.from({ length: 5_000 }, (_, index) =>
    planSignalOrganicInterruptionV1({
      episodeId: "frequency-episode",
      messageId: `host-question-${index}`,
      speakerRole: "host",
      wordCount: 48,
    })
  );
  assert.equal(
    hostDecisions.some((decision) => decision?.subtype === "soft_interruption"),
    false,
  );
});

test("soft repair exposes the invitation but keeps latent question words private", () => {
  const privateFollowUpQuestion = buildSignalPrivateFollowUpQuestionV1({
    episodeId: "episode",
    triggerMessageId: "guest-answer",
    publicGuestContent:
      "The practical choice is whether the public result can be independently measured.",
    topic: "Measurement and trust",
  });
  const invited: SignalConversationRepairEventV1 = {
    v: 1,
    name: "signalConversationRepair",
    provenance: "signal_organic_dialogue",
    canonicalImpact: "none",
    sequenceId: "repair-soft",
    subtype: "soft_interruption",
    phase: "return_invited",
    triggerMessageId: "guest-answer",
    hostBotId: "host",
    guestBotId: "guest",
    turnOrdinal: 6,
    publicReturnInvitation: "You had something—go ahead.",
    latentIntentPending: true,
    obligationProvenance: "server_private_latent_intent",
  };
  const normalized = normalizeSignalConversationRepairEventV1({
    ...invited,
    unheardDraft: "server-private material",
  });
  assert.deepEqual(normalized, invited);
  assert.equal(JSON.stringify(invited).includes(privateFollowUpQuestion), false);
  assert.deepEqual(signalPendingInterruptionRepairV1([invited]), invited);
  const fulfilled = { ...invited, phase: "follow_up_fulfilled" as const };
  const resolved = { ...invited, phase: "resolved" as const };
  assert.deepEqual(
    signalPendingInterruptionRepairV1([invited, fulfilled, resolved]),
    null,
  );
});

test("mutual repair requires exact public heard context", () => {
  const mutual: SignalConversationRepairEventV1 = {
    v: 1,
    name: "signalConversationRepair",
    provenance: "signal_organic_dialogue",
    canonicalImpact: "none",
    sequenceId: "repair-mutual",
    subtype: "mutual_interruption",
    phase: "opened",
    triggerMessageId: "guest-cutoff",
    hostBotId: "host",
    guestBotId: "guest",
    turnOrdinal: 9,
    publicHeardContext: "The key distinction is—",
  };
  assert.deepEqual(normalizeSignalConversationRepairEventV1(mutual), mutual);
  assert.equal(
    normalizeSignalConversationRepairEventV1({
      ...mutual,
      publicHeardContext: undefined,
    }),
    null,
  );
});

test("planned repetition requires real friction and never rolls on a clear baseline", () => {
  assert.equal(
    signalRepetitionFrictionReasonV1(
      "How does deoxyribonucleic replication change under that constraint?",
    ),
    "long_scientific_term",
  );
  assert.equal(
    signalRepetitionFrictionReasonV1(
      "How did Mary Wollstonecraft Shelley and Percy Bysshe Shelley differ here?",
    ),
    "dense_proper_names",
  );
  assert.equal(
    signalRepetitionFrictionReasonV1(
      "What changes first, and why would that alter what the team measures?",
    ),
    "nested_host_question",
  );
  const high = Array.from({ length: 10_000 }, (_, index) =>
    planSignalRepetitionEligibilityV1({
      episodeId: "repeat-episode",
      sourceMessageId: `high-${index}`,
      hostQuestion:
        "How does deoxyribonucleic replication change under that constraint?",
    })
  ).filter(Boolean).length;
  const ordinary = Array.from({ length: 10_000 }, (_, index) =>
    planSignalRepetitionEligibilityV1({
      episodeId: "repeat-episode",
      sourceMessageId: `ordinary-${index}`,
      hostQuestion: "What changed for you?",
    })
  ).filter(Boolean).length;
  assert.ok(high / 10_000 > 0.12 && high / 10_000 < 0.16);
  assert.equal(ordinary, 0);
  assert.equal(
    planSignalRepetitionEligibilityV1({
      episodeId: "14d0c954f8e54a5a8bb922a9",
      sourceMessageId: "eae2bedf74242227e486b596",
      hostQuestion:
        'Then keep God and cut the proof. Would "and I knew there was a God above" preserve the revelation without pretending the bitter soil has completed an argument?',
    }),
    null,
  );
  const interference = Array.from({ length: 10_000 }, (_, index) =>
    planSignalRepetitionEligibilityV1({
      episodeId: "repeat-episode",
      sourceMessageId: `interference-${index}`,
      hostQuestion: "What changed for you?",
      audibleInterference: true,
    })
  ).filter(Boolean);
  assert.ok(interference.length / 10_000 > 0.12);
  assert.ok(
    interference.every((plan) => plan.reason === "audible_interference"),
  );
});

test("paraphrase materiality accepts a reframe and rejects wrapped repetition", () => {
  const source =
    "Which concrete tradeoff would change your position on this proposal?";
  assert.equal(
    signalParaphraseMateriallyReframesV1({
      sourceContent: source,
      candidateContent:
        "What cost would actually make you reconsider the proposal?",
    }),
    true,
  );
  assert.equal(
    signalParaphraseMateriallyReframesV1({
      sourceContent: source,
      candidateContent: `Of course. ${source}`,
    }),
    false,
  );
  assert.equal(
    signalParaphraseMateriallyReframesV1({
      sourceContent: source,
      candidateContent: `Let me rephrase. ${source}`,
    }),
    false,
  );
});

test("studio incidents are one-in-six, max-one, and four-turn coordinated", () => {
  const eligible = Array.from({ length: 240 }, (_, index) =>
    buildSignalStudioIncidentEventV1({
      episodeId: `episode-${index}`,
      showId: "show",
      sourceMessageId: `message-${index}`,
      actorBotId: "host",
      hostBotId: "host",
      guestBotId: "guest",
      speakerRole: "host",
      turnOrdinal: 8,
      alreadyOccurred: false,
    })
  ).filter((value) => value !== null);
  assert.ok(eligible.length >= 25 && eligible.length <= 55);
  const first = eligible[0]!;
  assert.deepEqual(normalizeSignalStudioIncidentEventV1(first), first);
  assert.equal(
    buildSignalStudioIncidentEventV1({
      episodeId: first.incidentId.split(":")[1]!,
      showId: "show",
      sourceMessageId: "next",
      actorBotId: "guest",
      hostBotId: "host",
      guestBotId: "guest",
      speakerRole: "guest",
      turnOrdinal: 7,
      alreadyOccurred: true,
      recentShowKinds: [first.kind],
    }),
    null,
  );
  assert.equal(
    signalConversationRepairCanStartV1({
      prior: [],
      subtype: "soft_interruption",
      turnOrdinal: 9,
      lastCoordinatedTurnOrdinal: 7,
    }),
    false,
  );
  assert.equal(
    buildSignalStudioIncidentEventV1({
      episodeId: first.incidentId.split(":")[1]!,
      showId: "show",
      sourceMessageId: "cooldown",
      actorBotId: "host",
      hostBotId: "host",
      guestBotId: "guest",
      speakerRole: "host",
      turnOrdinal: 8,
      alreadyOccurred: false,
      lastCoordinationTurnOrdinal: 6,
    }),
    null,
  );
});

test("the studio bank persists meaningful timed gain, Foley, and dialogue", () => {
  const incidents: SignalStudioIncidentEventV1[] = [];
  for (let index = 0; index < 20_000; index += 1) {
    const common = {
      episodeId: `studio-bank-${index}`,
      showId: "studio-bank-show",
      sourceMessageId: `message-${index}`,
      hostBotId: "host",
      guestBotId: "guest",
      alreadyOccurred: false,
    } as const;
    const guestStart = buildSignalStudioIncidentEventV1({
      ...common,
      actorBotId: "guest",
      speakerRole: "guest",
      turnOrdinal: 3,
    });
    if (guestStart) incidents.push(guestStart);
    const hostTurn = buildSignalStudioIncidentEventV1({
      ...common,
      actorBotId: "host",
      speakerRole: "host",
      turnOrdinal: 8,
    });
    if (hostTurn) incidents.push(hostTurn);
    if (new Set(incidents.map((incident) => incident.kind)).size === 5) break;
  }
  assert.deepEqual(
    [...new Set(incidents.map((incident) => incident.kind))].sort(),
    [
      "booth_object_mishap",
      "headphone_monitor_correction",
      "host_loses_place_reset",
      "quiet_guest_start",
      "shared_laughter_derail",
    ],
  );
  for (const incident of incidents) {
    assert.deepEqual(normalizeSignalStudioIncidentEventV1(incident), incident);
    assert.ok(incident.endProgress > incident.startProgress);
    assert.ok(
      incident.beats.every(
        (beat) =>
          beat.atProgress >= incident.startProgress &&
          beat.atProgress <= incident.endProgress,
      ),
    );
    if (incident.kind !== "booth_object_mishap") {
      assert.ok(incident.beats.length > 1);
    }
  }
  const quiet = incidents.find((incident) => incident.kind === "quiet_guest_start");
  assert.ok(quiet);
  assert.ok(
    quiet.beats.some(
      (beat) => beat.kind === "gain" && beat.gain === 0.55,
    ),
  );
  assert.ok(
    quiet.beats.some((beat) => beat.kind === "gain" && beat.gain === 1),
  );
  assert.ok(
    quiet.beats.some(
      (beat) => beat.kind === "dialogue" && beat.speakerRole === "host",
    ),
  );
});
