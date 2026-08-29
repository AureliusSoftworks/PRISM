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
  buildBotcastSpeakerPrompt,
  createBotcastEpisode,
  createBotcastShow,
  enforceSignalLatentFollowUpTurnV1,
  enforceSignalMutualRestartV1,
  enforceSignalRepetitionRepairTurnV1,
  getBotcastEpisode,
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
        generatedContent: "Let us talk about something else.",
        sourceContent: sourceQuestion,
        topic: "The practical cost of the proposal",
        repeatMode: "paraphrase",
      }),
      { content: `Of course. ${sourceQuestion}`, repeatMode: "repeat" },
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
