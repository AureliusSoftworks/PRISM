import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  botCrosstalkPrimarySpeakerContent,
  buildSignalFriendlyInterruptionPlanV1,
  buildSignalMutualInterruptionPlanV1,
  normalizeSignalConversationRepairEventV1,
  planSignalRepetitionEligibilityV1,
} from "@localai/shared";
import {
  advanceBotcastEpisode,
  buildBotcastSpeakerPrompt,
  createBotcastEpisode,
  createBotcastShow,
  enforceSignalLatentFollowUpTurnV1,
  enforceSignalMutualRestartV1,
  enforceSignalRepetitionRepairTurnV1,
  getBotcastEpisode,
  signalInterviewBriefCoverageRunwayV1,
  signalListenerReactionObscuresSpeechV1,
  signalOrganicTurnMayApplyCleanIrritationDecayV1,
} from "../botcast.ts";
import { initializeDatabase } from "../db.ts";

function signalFixture(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES ('user-1', 'signal@example.com', 'Producer', 'hash', 'salt',
             'cipher', 'iv', 'tag', ?, ?)`,
  ).run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  for (const [id, name, prompt] of [
    ["host-1", "Mara Vale", "A precise and curious host."],
    ["guest-1", "Ivo Stone", "A thoughtful and candid guest."],
  ]) {
    db.prepare(
      `INSERT INTO bots
        (id, user_id, name, system_prompt, chat_enabled, created_at, updated_at)
       VALUES (?, 'user-1', ?, ?, 1, ?, ?)`,
    ).run(
      id,
      name,
      prompt,
      "2026-01-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    );
  }
  return db;
}

function signalGeneration(
  lines: string[],
  providerName: "local" | "openai" = "local",
) {
  const provider = {
    name: providerName,
    async generateResponse(
      _messages: unknown,
      options: { usagePurpose?: string },
    ) {
      if (options.usagePurpose === "psychic_planning") {
        return "Keep the next line concrete, in character, and responsive.";
      }
      return lines.shift() ?? "A concise in-character answer.";
    },
    async embedText() {
      return [];
    },
  };
  return {
    preferredProvider: providerName,
    providerFactory: () => provider,
    signalSocialSilenceChanceOverride: 0,
  } as never;
}

describe("Signal organic performance API behavior", () => {
  it("durably performs request, acknowledged repeat, then substantive answer", () => {
    const sourceQuestion =
      "Which concrete tradeoff would change your position on this proposal?";
    assert.deepEqual(
      enforceSignalRepetitionRepairTurnV1({
        phase: "planned",
        speakerRole: "guest",
        generatedContent: "What?",
        sourceContent: sourceQuestion,
        topic: "The practical cost of the proposal",
      }),
      { content: "What?" },
    );
    assert.deepEqual(
      enforceSignalRepetitionRepairTurnV1({
        phase: "planned",
        speakerRole: "guest",
        generatedContent: "Sorry, say again.",
        sourceContent: sourceQuestion,
        topic: "The practical cost of the proposal",
      }),
      { content: "Sorry, say again." },
    );
    assert.deepEqual(
      enforceSignalRepetitionRepairTurnV1({
        phase: "planned",
        speakerRole: "guest",
        generatedContent: "Let us talk about something else.",
        sourceContent: sourceQuestion,
        topic: "The practical cost of the proposal",
      }),
      { content: "Could you say that question again?" },
    );
    assert.deepEqual(
      enforceSignalRepetitionRepairTurnV1({
        phase: "guest_request",
        speakerRole: "host",
        generatedContent:
          "What cost would actually make you reconsider the proposal?",
        sourceContent: sourceQuestion,
        topic: "The practical cost of the proposal",
        repeatMode: "paraphrase",
      }),
      {
        content:
          "Of course. What cost would actually make you reconsider the proposal?",
        repeatMode: "paraphrase",
      },
    );
    assert.deepEqual(
      enforceSignalRepetitionRepairTurnV1({
        phase: "guest_request",
        speakerRole: "host",
        generatedContent: `Of course. ${sourceQuestion}`,
        sourceContent: sourceQuestion,
        topic: "The practical cost of the proposal",
        repeatMode: "paraphrase",
      }),
      {
        content:
          "Of course. Let me ask for the core of it instead: what is your direct answer, and which reason matters most?",
        repeatMode: "paraphrase",
      },
    );
    assert.deepEqual(
      enforceSignalRepetitionRepairTurnV1({
        phase: "host_repeat",
        speakerRole: "guest",
        generatedContent: "Could you say that again?",
        sourceContent: sourceQuestion,
        topic: "The practical cost of the proposal",
      }),
      {
        content:
          "My direct answer is this: The practical cost of the proposal. The important part is the concrete choice it creates and the consequences that follow.",
      },
    );
  });

  it("lets hearing-repeat precedence disable organic high-friction planning", () => {
    assert.equal(
      planSignalRepetitionEligibilityV1({
        episodeId: "episode",
        sourceMessageId: "host-question",
        hostQuestion:
          "How does deoxyribonucleic replication change under that constraint?",
        eligible: false,
      }),
      null,
    );
  });

  it("does not mistake incidental Foley for a lost clear question", () => {
    const incidentalFoley = {
      signalOrganicBeat: {
        timing: {
          startProgress: 0.353,
          overlapMs: 0,
          speakerDuckMs: 0,
          resumeFadeMs: 0,
        },
      },
    } as never;
    const realInterference = {
      signalOrganicBeat: {
        timing: {
          startProgress: 0.353,
          overlapMs: 180,
          speakerDuckMs: 520,
          resumeFadeMs: 160,
        },
      },
    } as never;
    assert.equal(
      signalListenerReactionObscuresSpeechV1(incidentalFoley),
      false,
    );
    assert.equal(
      signalListenerReactionObscuresSpeechV1(realInterference),
      true,
    );
    assert.equal(
      planSignalRepetitionEligibilityV1({
        episodeId: "14d0c954f8e54a5a8bb922a9",
        sourceMessageId: "eae2bedf74242227e486b596",
        hostQuestion:
          'Then keep God and cut the proof. Would "and I knew there was a God above" preserve the revelation without pretending the bitter soil has completed an argument?',
        audibleInterference:
          signalListenerReactionObscuresSpeechV1(incidentalFoley),
      }),
      null,
    );
  });

  it("reserves Auto breadth turns without charging a clarification repeat", () => {
    const producerBrief =
      "Interview Alan Watts about the poem. What does he think about it? Does he like it? Does he dislike it? Does he have critiques that could improve it? Any ambiguities to clarify? Please read this poem for better context: Is this really all of it?";
    const messages = [
      { id: "host-opening", speakerRole: "host" as const },
      { id: "guest-opening", speakerRole: "guest" as const },
      { id: "host-follow-up", speakerRole: "host" as const },
      { id: "guest-answer", speakerRole: "guest" as const },
      { id: "host-third", speakerRole: "host" as const },
      { id: "guest-reask", speakerRole: "guest" as const },
      { id: "host-repeat", speakerRole: "host" as const },
    ];
    const repairs = [
      {
        phase: "host_repeat",
        triggerMessageId: "host-repeat",
      },
    ] as never;
    assert.deepEqual(
      signalInterviewBriefCoverageRunwayV1({
        producerBrief,
        durationMinutes: null,
        messages,
        repairs,
      }),
      {
        pace: "auto",
        requestedDimensions: 5,
        completedHostTurns: 3,
        requiredHostTurns: 4,
        owed: true,
      },
    );
    assert.deepEqual(
      signalInterviewBriefCoverageRunwayV1({
        producerBrief,
        durationMinutes: null,
        messages: [
          ...messages,
          { id: "guest-direct-answer", speakerRole: "guest" as const },
          { id: "host-new-dimension", speakerRole: "host" as const },
        ],
        repairs,
      }),
      {
        pace: "auto",
        requestedDimensions: 5,
        completedHostTurns: 4,
        requiredHostTurns: 4,
        owed: false,
      },
    );
  });

  it("adds a private breadth checkpoint before a short or Auto episode drills", () => {
    const producerBrief =
      "What is the guest's overall response? Do they like it? What craft critique would improve it? Which ambiguity needs clarification?";
    const prompt = buildBotcastSpeakerPrompt({
      show: {
        name: "The Unavoidable Form",
        premise: "Look past convention and examine form.",
        hostingStyle: "observant and dryly playful",
      },
      episode: {
        id: "episode-breadth",
        topic: "Sweetness From Bitterness",
        producerBrief,
        durationMinutes: null,
        segment: "interview",
        messages: [
          {
            id: "host-opening",
            botId: "host-1",
            speakerRole: "host",
            content: "Does the final certainty belong to the poem?",
          },
          {
            id: "guest-opening",
            botId: "guest-1",
            speakerRole: "guest",
            content: "It is revelation rather than formal proof.",
          },
          {
            id: "host-follow-up",
            botId: "host-1",
            speakerRole: "host",
            content: "Would the ending be stronger without that proof?",
          },
          {
            id: "guest-answer",
            botId: "guest-1",
            speakerRole: "guest",
            content: "Removing it might sacrifice the speaker's astonishment.",
          },
        ],
        events: [],
        tensionStage: "calm",
        guestPresenceMode: "present",
        guestKind: "bot",
      },
      host: {
        id: "host-1",
        name: "Mara Vale",
        systemPrompt: "A precise and curious host.",
        powers: [],
      },
      guest: {
        id: "guest-1",
        name: "Ivo Stone",
        systemPrompt: "A thoughtful and candid guest.",
        powers: [],
      },
      speakerRole: "host",
    } as never).map((message) => message.content).join("\n");
    assert.match(
      prompt,
      /Private interview breadth checkpoint: this Auto episode's producer brief asks for 4 distinct dimensions, while only 2 substantive host turns are on air\./u,
    );
    assert.match(
      prompt,
      /open one requested dimension that has not yet been meaningfully answered/u,
    );
    assert.match(
      prompt,
      /Keep the brief private: do not quote its instructions, recite a checklist, or mention coverage/u,
    );
  });

  it("holds Auto closing for one bounded breadth exchange", async () => {
    const db = signalFixture();
    const generation = signalGeneration([
      "This is Mara Vale in the Margins; I'm Mara Vale, and my guest is Ivo Stone. Ivo, what first catches your attention in this work?",
      "The central contrast catches me first because sweetness rises from an unpleasant ground.",
      "Does that contrast feel earned, or only announced?",
      "It feels partly earned, though the final claim explains more than the images need.",
      "Which image carries the strongest emotional weight for you?",
      "Ultimately, the small figure facing abundance carries the emotional weight.",
      "Beyond that ending, what craft choice would you revise first?",
      "In the end, I would sharpen the turn from disgust toward generosity.",
      "That turn from disgust is the work's real hinge. Ivo Stone, thank you for joining me, and thank you all for listening.",
    ]);
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Sweetness From Bitterness",
        producerBrief:
          "What is the guest's overall response? Do they like it? What craft critique would improve it? Which ambiguity needs clarification?",
        durationMinutes: null,
      });

      let advanced = null;
      for (let turn = 0; turn < 6; turn += 1) {
        advanced = await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation,
        );
      }
      assert.equal(advanced?.episode.messages.length, 6);

      const breadthTurn = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation,
      );
      assert.equal(breadthTurn.message?.speakerRole, "host");
      assert.equal(breadthTurn.message?.content,
        "Beyond that ending, what craft choice would you revise first?");
      assert.equal(breadthTurn.episode.segment, "interview");

      await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation,
      );
      const closing = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation,
      );
      assert.equal(closing.message?.speakerRole, "host");
      assert.equal(closing.episode.segment, "closing");
      assert.equal(closing.episode.status, "completed");
    } finally {
      db.close();
    }
  });

  it("retries a wrapped repeat until the host materially paraphrases", async () => {
    const db = signalFixture();
    const sourceQuestion =
      "Which concrete tradeoff would change your position on this proposal?";
    const generation = signalGeneration([
      "This is Mara Vale in the Margins; I'm Mara Vale, and my guest is Ivo Stone. Ivo, which practical cost matters first?",
      "The irreversible cost matters because somebody has to carry it.",
      sourceQuestion,
      "Could you say that question again?",
      `Of course. ${sourceQuestion}`,
      "What cost would actually make you reconsider the proposal?",
    ], "openai");
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "The practical cost of the proposal",
        preferredProvider: "openai",
        modelOverride: "gpt-5.6-sol",
      });
      for (let turn = 0; turn < 4; turn += 1) {
        await advanceBotcastEpisode(
          db,
          "user-1",
          episode.id,
          {},
          generation,
        );
      }
      const beforeRepair = getBotcastEpisode(db, "user-1", episode.id);
      const sourceMessage = beforeRepair.messages.at(-2);
      const guestRequest = beforeRepair.messages.at(-1);
      assert.equal(sourceMessage?.content, sourceQuestion);
      assert.equal(guestRequest?.speakerRole, "guest");
      const sequence = (
        db.prepare(
          "SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM botcast_events WHERE episode_id = ?",
        ).get(episode.id) as { next: number }
      ).next;
      db.prepare(
        `INSERT INTO botcast_events
          (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
         VALUES (?, 'user-1', ?, ?, 'conversation_repair', ?, ?)`,
      ).run(
        "material-paraphrase-override",
        episode.id,
        sequence,
        JSON.stringify({
          repair: {
            v: 1,
            name: "signalConversationRepair",
            provenance: "signal_organic_dialogue",
            canonicalImpact: "none",
            sequenceId: "material-paraphrase-sequence",
            subtype: "repetition_clarification",
            phase: "guest_request",
            triggerMessageId: guestRequest?.id,
            hostBotId: "host-1",
            guestBotId: "guest-1",
            turnOrdinal: 4,
            repeatMode: "paraphrase",
            sourceMessageId: sourceMessage?.id,
          },
        }),
        "2026-08-29T12:00:00.000Z",
      );

      const paraphrased = await advanceBotcastEpisode(
        db,
        "user-1",
        episode.id,
        {},
        generation,
      );
      assert.equal(
        paraphrased.message?.content,
        "Of course. What cost would actually make you reconsider the proposal?",
      );
      const providerGeneration = paraphrased.episode.events.findLast(
        (event) => event.kind === "provider_generation",
      );
      assert.deepEqual(providerGeneration?.payload.attempts, [
        {
          provider: "openai",
          model: "gpt-5.6-sol",
          outcome: "rejected",
          reason: "invalid_output",
          clause: "repetition_paraphrase",
          durationMs: providerGeneration?.payload.attempts?.[0]?.durationMs,
        },
        {
          provider: "openai",
          model: "gpt-5.6-sol",
          outcome: "succeeded",
          durationMs: providerGeneration?.payload.attempts?.[1]?.durationMs,
        },
      ]);
      assert.equal(
        paraphrased.episode.events.findLast(
          (event) =>
            event.kind === "conversation_repair" &&
            event.payload.repair?.phase === "host_repeat",
        )?.payload.repair?.repeatMode,
        "paraphrase",
      );
    } finally {
      db.close();
    }
  });

  it("fulfills the server-private latent follow-up without exposing its words", () => {
    const privateQuestion = "Which part of that matters most now?";
    assert.equal(
      enforceSignalLatentFollowUpTurnV1({
        phase: "return_invited",
        speakerRole: "host",
        privateFollowUpQuestion: privateQuestion,
      }),
      privateQuestion,
    );
    assert.equal(
      enforceSignalLatentFollowUpTurnV1({
        phase: "guest_resumed",
        speakerRole: "host",
        privateFollowUpQuestion: privateQuestion,
      }),
      null,
    );
    const normalized = normalizeSignalConversationRepairEventV1({
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
      turnOrdinal: 4,
      publicReturnInvitation: "You had something—go ahead.",
      latentIntentPending: true,
      obligationProvenance: "server_private_latent_intent",
      unheardDraft: "must not survive normalization",
    });
    assert.ok(normalized);
    assert.equal("unheardDraft" in normalized, false);
    assert.equal(JSON.stringify(normalized).includes(privateQuestion), false);
  });

  it("reloads a private latent intent for the host while redacting episode JSON", () => {
    const db = signalFixture();
    try {
      const show = createBotcastShow(db, "user-1", { hostBotId: "host-1" });
      const episode = createBotcastEpisode(db, "user-1", show.id, {
        guestBotId: "guest-1",
        topic: "Measurement and trust",
      });
      const privateQuestion = "Which consequence changes the practical choice?";
      const sequence = (
        db.prepare(
          "SELECT COALESCE(MAX(sequence), 0) + 1 AS next FROM botcast_events WHERE episode_id = ?",
        ).get(episode.id) as { next: number }
      ).next;
      db.prepare(
        `INSERT INTO botcast_events
          (id, user_id, episode_id, sequence, kind, payload_json, occurred_at)
         VALUES (?, 'user-1', ?, ?, 'conversation_repair', ?, ?)`,
      ).run(
        "repair-event",
        episode.id,
        sequence,
        JSON.stringify({
          repair: {
            v: 1,
            name: "signalConversationRepair",
            provenance: "signal_organic_dialogue",
            canonicalImpact: "none",
            sequenceId: "repair-soft",
            subtype: "soft_interruption",
            phase: "return_invited",
            triggerMessageId: "guest-answer",
            hostBotId: "host-1",
            guestBotId: "guest-1",
            turnOrdinal: 2,
            publicReturnInvitation: "You had something—go ahead.",
            latentIntentPending: true,
            obligationProvenance: "server_private_latent_intent",
          },
          privateFollowUpQuestion: privateQuestion,
        }),
        "2026-08-29T12:00:00.000Z",
      );
      const reloaded = getBotcastEpisode(db, "user-1", episode.id);
      assert.equal(JSON.stringify(reloaded).includes(privateQuestion), false);
      const prompt = buildBotcastSpeakerPrompt({
        show,
        episode: reloaded,
        host: {
          id: "host-1",
          name: "Mara Vale",
          systemPrompt: "A precise and curious host.",
          powers: [],
        },
        guest: {
          id: "guest-1",
          name: "Ivo Stone",
          systemPrompt: "A thoughtful and candid guest.",
          powers: [],
        },
        speakerRole: "host",
      } as never).map((message) => message.content).join("\n");
      assert.match(prompt, new RegExp(privateQuestion.replace("?", "\\?"), "u"));
      assert.match(prompt, /Private conversation-repair obligation/u);
    } finally {
      db.close();
    }
  });

  it("realizes mutual cutoff, apology, reassurance, and exact public restart", () => {
    const mutual = buildSignalMutualInterruptionPlanV1({
      seed: "mutual-collision",
      messageId: "guest-cutoff",
      speakerBotId: "guest",
      listenerBotId: "host",
      targetProgress: 0.46,
    });
    assert.equal(mutual.floorOutcome, "reclaim");
    assert.equal(mutual.cameraCutEligible, false);
    assert.match(mutual.spokenCue ?? "", /—/u);
    assert.ok(mutual.interruptedSpeakerCue);
    const publicHeard = "The exact public distinction is—";
    const canonical =
      "The exact public distinction is that the second result can be independently measured.";
    assert.equal(
      botCrosstalkPrimarySpeakerContent(canonical, {
        ...mutual,
        audibleCutoff: publicHeard,
      }),
      publicHeard,
    );
    assert.equal(canonical.endsWith("measured."), true);
    assert.equal(
      enforceSignalMutualRestartV1({
        heardFragment: "The exact public distinction is—",
        generatedContent: "that the second result can be independently measured.",
      }),
      "The exact public distinction is— that the second result can be independently measured.",
    );
  });

  it("keeps friendly organic cut-ins off camera and out of social-state decay", () => {
    const friendly = buildSignalFriendlyInterruptionPlanV1({
      seed: "friendly-cut-in",
      messageId: "guest-answer",
      speakerBotId: "guest",
      listenerBotId: "host",
      includeReturnInvitation: true,
      speakerPersona: "A warm, thoughtful guest.",
      latentQuestion: "Which consequence changes the practical choice?",
    });
    assert.equal(friendly.floorOutcome, "hold");
    assert.equal(friendly.cameraCutEligible, false);
    assert.equal(friendly.spokenCue, "Which part do you—sorry, keep going.");
    assert.ok(friendly.interruptedSpeakerCue);
    assert.equal(
      signalOrganicTurnMayApplyCleanIrritationDecayV1({
        subtype: "soft_interruption",
      }),
      false,
    );
    assert.equal(
      signalOrganicTurnMayApplyCleanIrritationDecayV1({
        subtype: null,
        restartMode: "exact_public_heard_context",
      }),
      false,
    );
    assert.equal(
      signalOrganicTurnMayApplyCleanIrritationDecayV1({ subtype: null }),
      true,
    );
  });
});
