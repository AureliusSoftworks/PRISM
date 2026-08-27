import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import type {
  DebateMysteryActionRequestV2,
  DebateMysterySealedAssetRefV1,
  DebateSessionV1,
  DebateWhodunnitCreateConfigV2,
  DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  debateMysteryTalkTopicMirrorsRecordV2,
  debateMysterySpectatorEvidenceReferencesV2,
  reasoningGenerationBudgetMs,
} from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import {
  activeDebateMysteryCompilationV2,
  applyDebateMysteryActionV2,
  cancelDebateMysteryCompilationV2,
  cleanupUnreferencedDebateMysteryAudioV2,
  createDebateMysterySessionV2,
  ensureDebateMysteryPlayReadyV2,
  getDebateMysteryAudioStorageSummaryV2,
  getDebateMysteryAudioClipV2,
  getDebateMysteryCaseV2,
  getDebateMysteryCompilationStatusV2,
  mysteryV2CriticalAuthoringAttemptTimeoutMs,
  playDebateMysteryV2Again,
  restartDebateMysteryCourtV2,
  restartDebateMysteryInvestigationV2,
  resolveMysterySuspectKnowledgeV2,
  resolveDebateMysteryTalkExchangeV2,
  retryDebateMysteryCompilationV2,
  runDebateMysteryCompilationV2,
  V2_CRITICAL_AUTHORING_MIN_ATTEMPT_TIMEOUT_MS,
} from "../debate-mystery-v2.ts";
import {
  listDebateMysteryMansionBundlesV2,
  saveDebateMysteryMansionBundleV2,
} from "../debate-mystery-mansion-bundles.ts";
import {
  getRevealedDebateMysteryAssetFileV1,
  revealDebateMysteryAssetV1,
  sealDebateMysteryAssetBytesV1,
  setDebateMysteryAssetFallbackV1,
  setDebateMysteryAssetPendingV1,
} from "../debate-mystery-assets.ts";
import {
  deleteDebateSession,
  getDebateSession,
  listDebateSessions,
  type DebateAiRuntime,
} from "../debate.ts";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";

const NOW = "2026-08-24T12:00:00.000Z";
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const dataRoot = mkdtempSync(join(tmpdir(), "prism-mystery-v2-"));
const previousDataRoot = process.env.LOCALAI_DATA_DIR;
process.env.LOCALAI_DATA_DIR = dataRoot;

after(() => {
  if (previousDataRoot === undefined) delete process.env.LOCALAI_DATA_DIR;
  else process.env.LOCALAI_DATA_DIR = previousDataRoot;
  rmSync(dataRoot, { recursive: true, force: true });
});

class V2AuthorProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "mystery-v2-test";
  public calls = 0;
  public readonly sections: string[] = [];
  public readonly requests: Array<Record<string, unknown>> = [];
  public readonly personaDialogueRequests: Array<{
    lines: Array<{ lineId: string; speakerBotId: string; canonicalText: string }>;
  }> = [];

  public async generateResponse(messages: ProviderMessage[], _options?: GenerateOptions): Promise<string> {
    this.calls += 1;
    const request = JSON.parse(messages.at(-1)!.content) as {
      section: "case_foundation" | "room_examinations" | "suspect_chapter" | "prosecution_choices" | "persona_dialogue_polish";
      suspect?: {
        seatId: string;
        awareness: "involved" | "incidental" | "unaware";
        temporalRecall: "exact" | "approximate" | "none";
      };
      lines?: Array<{ lineId: string; speakerBotId: string; canonicalText: string }>;
      setup: {
        eyewitnessSeatId: string | null;
        victimId: string;
        evidenceIds: string[];
        examinationIds: string[];
        roomNames: Array<{ roomId: string; name: string }>;
        suspects: Array<{
          seatId: string;
          name: string;
          requiredStatementIds: string[];
          requiredContradictionOnSecondStatement: string;
          requiredPresentReactionRecordId: string;
          requiredPresentReactionRecordIds: string[];
          requiredPresentationGateRecordId: string | null;
          privateRole: "culprit" | "accomplice" | "innocent";
          awareness: "involved" | "incidental" | "unaware";
          temporalRecall: "exact" | "approximate" | "none";
        }>;
      };
    };
    this.requests.push(request as unknown as Record<string, unknown>);
    this.sections.push(request.section === "suspect_chapter"
      ? `${request.section}:${request.suspect?.seatId ?? "unknown"}`
      : request.section);
    if (request.section === "persona_dialogue_polish") {
      const lines = request.lines ?? [];
      this.personaDialogueRequests.push({ lines });
      return JSON.stringify({
        lineFrames: lines.map((line) => ({
          lineId: line.lineId,
          leadIn: line.speakerBotId === "bot-5"
            ? "Let’s be precise:"
            : line.speakerBotId === "bot-6"
              ? "Respectfully,"
              : "Quietly,",
        })),
      });
    }
    if (request.section === "room_examinations") {
      return JSON.stringify({
        examinations: request.setup.examinationIds.map((id, index) => ({
          id,
          text: `Examination ${index + 1} reveals a specific material disturbance, documents its position, and updates the Case File without guessing what it means.`,
        })),
      });
    }
    const full = {
      title: "The Turnabout at Violet Hour",
      victimName: "Avery Voss",
      victimDescription: "The exacting curator of a private optical archive whose final exhibition threatened several carefully kept lies.",
      publicOpening: "At violet hour, Avery Voss was found dead inside the sealed archive. The mansion is secure, the cast is assembled, and every conclusion must survive the admitted record.",
      motive: "The culprit killed to prevent Avery from unveiling a provenance ledger that exposed a career-defining fraud.",
      method: "The culprit staged a locked-room timeline after using the case's frozen physical method during a narrow blind spot in the archive schedule.",
      partnerConsultation: "Pin the witness to one sentence at a time. Press what sounds incomplete; present only when the Case File makes the active wording impossible.",
      eyewitnessResolution: request.setup.eyewitnessSeatId
        ? "The eyewitness saw the accused silhouette through refracted glass, while two independent timestamps prove the visible figure and the accused could not have been the same person."
        : null,
      evidence: request.setup.evidenceIds.map((id, index) => ({
        id,
        title: index === 0 ? "Service Bell Log" : `Archive exhibit ${index + 1}`,
        description: `A precisely catalogued physical detail ${index + 1} whose timing and provenance can be compared against sworn testimony.`,
        emoji: index % 2 ? "🧾" : "🔎",
      })),
      examinations: request.setup.examinationIds.map((id, index) => ({
        id,
        text: `Examination ${index + 1} reveals a specific material disturbance, documents its position, and updates the Case File without guessing what it means.`,
      })),
      suspects: request.setup.suspects.map((suspect, index) => ({
        seatId: suspect.seatId,
        relationship: `${suspect.name} depended on Avery's judgment but resented how closely the curator audited their work.`,
        alibi: `${suspect.name} claims two separate mansion records place them away from the archive during the critical interval.`,
        roomIntroduction: `I am ${suspect.name}. Avery made every favor feel like an audit, and I will not let grief turn that into a verdict. Ask what you need to ask.`,
        roomIntroductionStageAction: "Squares their shoulders and studies the prosecutor",
        roomIntroductionPerformance: { mood: "guarded", pace: "measured", intensity: 1, actorNote: "Offer one controlled opening without answering the first question." },
        chapterOpening: `${suspect.name}, take the stand and give the court your account of the violet-hour interval.`,
        chapterCompletion: `The court records the material revision to ${suspect.name}'s account and releases this witness subject to recall.`,
        defaultPresentReaction: `${suspect.name} frowns at the item. “That item was in the mansion, but it does not change the exact account I have given you.”`,
        talkTopics: [
          { id: "relationship", label: "Avery Voss", category: "person", subjectId: request.setup.victimId, question: `How would you describe your relationship with Avery Voss?`, questionPerformance: { mood: "probing", pace: "measured", intensity: 1, actorNote: "Invite a complete answer without showing suspicion." }, response: `Avery could be generous, but every gift became another standard I was expected to meet.`, performance: { mood: "guarded", pace: "measured", intensity: 1, actorNote: "Hold back the deeper grievance." }, repeatResponses: [{ response: `Like I said before, Avery could be generous, but every gift became another standard I was expected to meet.`, responseStageAction: "Draws a careful breath", performance: { mood: "guarded", pace: "measured", intensity: 1, actorNote: "Acknowledge the repetition without yielding more ground." } }, { response: `I've said this already: Avery could be generous, but every gift became another standard I was expected to meet.`, responseStageAction: "Looks away for a moment", performance: { mood: "guarded", pace: "natural", intensity: 1, actorNote: "The repeated memory is beginning to chafe." } }] },
          { id: "timeline", label: "Your movements", category: "alibi", question: `Walk me through your movements before the archive alarm.`, questionPerformance: { mood: "precise", pace: "measured", intensity: 1, actorNote: "Ask for a sequence the witness can be held to." }, response: `I crossed the west corridor, checked the gallery clock, and returned before the archive alarm.`, performance: { mood: "precise", pace: "natural", intensity: 1, actorNote: "Sound rehearsed without becoming robotic." }, repeatResponses: [{ response: `As I said, I crossed the west corridor, checked the gallery clock, and returned before the archive alarm.`, responseStageAction: "Counts the sequence on their fingers", performance: { mood: "precise", pace: "measured", intensity: 1, actorNote: "Repeat the route with controlled precision." } }] },
          { id: "archive-room", label: "The archive", category: "room", subjectId: request.setup.roomNames[0]?.roomId ?? request.setup.victimId, question: `What did you notice in the archive before the alarm?`, questionPerformance: { mood: "observant", pace: "measured", intensity: 1, actorNote: "Keep the room itself in focus." }, response: `The west display reflected anyone crossing the corridor, but the locked cabinet blocked the eastern sightline.`, performance: { mood: "careful", pace: "measured", intensity: 1, actorNote: "Describe the room without leaping to a conclusion." }, repeatResponses: [{ response: `As I said, the west display reflected the corridor while the locked cabinet blocked the eastern sightline.`, responseStageAction: "Traces the room in the air", performance: { mood: "careful", pace: "measured", intensity: 1, actorNote: "Repeat the spatial detail precisely." } }] },
          { id: "doubt", label: "What does not fit", category: "general", question: `What part of the story does not fit what you witnessed?`, questionPerformance: { mood: "probing", pace: "natural", intensity: 1, actorNote: "Leave room for the witness to identify the flaw." }, response: `The light in the archive glass changes silhouettes. Anyone claiming a clean identification from the hall is overstating it.`, performance: { mood: "insistent", pace: "urgent", intensity: 2, actorNote: "The useful truth arrives under pressure." }, repeatResponses: [{ response: `Still going on about that? The light in the archive glass changes silhouettes. Anyone claiming a clean identification from the hall is overstating it.`, responseStageAction: "Holds the prosecutor's gaze", performance: { mood: "insistent", pace: "urgent", intensity: 2, actorNote: "Impatience sharpens the same useful warning." } }] },
        ],
        presentationGate: suspect.requiredPresentationGateRecordId ? {
          id: `gate-${suspect.seatId}`,
          recordId: suspect.requiredPresentationGateRecordId,
          unlockTopicId: "doubt",
        } : null,
        presentReactions: suspect.requiredPresentReactionRecordIds.map((recordId) => ({
          recordId,
          response: `That record narrows the interval more than I admitted. You should ask me again about the second part of my timeline.`,
        })),
        testimony: suspect.requiredStatementIds.map((id, statementIndex) => ({
          id,
          text: statementIndex === 1
            ? `Nothing in ${suspect.requiredContradictionOnSecondStatement} conflicts with my timeline; my account has never changed.`
            : statementIndex === 0
              ? `I entered the west corridor before the archive bell and did not approach Avery's door.`
              : `The figure by the refracted glass looked familiar, but I could not see a face.`,
          press: statementIndex === 1
            ? `By "never changed," I mean the order stayed the same. I may have compressed the minutes when I first explained it.`
            : `That is the limit of what I can swear to without turning an impression into a fact.`,
          rebuttal: `That exhibit does not contradict the sentence on the screen. The prosecution is joining two different moments.`,
          revision: statementIndex === 1
            ? `My first account compressed the interval. ${suspect.requiredContradictionOnSecondStatement} proves I changed locations later than I claimed.`
            : `I need to narrow that sentence: it describes my best recollection, not an independently verified fact.`,
          performance: { mood: statementIndex === 1 ? "cornered" : "controlled", pace: "measured", intensity: statementIndex === 1 ? 3 : 1, actorNote: "Let the revision land as a real loss of control." },
        })),
      })),
      prosecutionChoices: [{
        id: "define-the-conflict",
        witnessSeatId: request.setup.suspects[0]!.seatId,
        prompt: "Prosecution, identify what matters before this testimony continues.",
        options: [
          { id: "wording", text: "The exact wording of the timeline.", reaction: "Then keep the court on the active sentence and establish its limits." },
          { id: "demeanor", text: "The witness's confidence.", reaction: "Confidence is not proof. Tie that observation to the admitted record or leave it aside." },
        ],
      }],
    };
    if (request.section === "suspect_chapter") {
      return JSON.stringify({
        suspect: full.suspects.find((suspect) => suspect.seatId === request.suspect?.seatId),
      });
    }
    if (request.section === "prosecution_choices") {
      return JSON.stringify({ prosecutionChoices: full.prosecutionChoices });
    }
    const { suspects: _suspects, prosecutionChoices: _prosecutionChoices, ...foundation } = full;
    return JSON.stringify(foundation);
  }

  public async embedText(): Promise<number[]> {
    return [0.1, 0.2];
  }
}

class InterruptingV2AuthorProvider extends V2AuthorProvider {
  public permitSecondChapter = false;

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(messages.at(-1)!.content) as {
      section?: string;
      suspect?: { seatId?: string };
    };
    if (
      request.section === "suspect_chapter" &&
      request.suspect?.seatId === "suspect-2" &&
      !this.permitSecondChapter
    ) {
      this.calls += 1;
      this.sections.push("suspect_chapter:suspect-2");
      return "{}";
    }
    return super.generateResponse(messages, options);
  }
}

class ExhaustedWitnessV2AuthorProvider extends V2AuthorProvider {
  public onWitnessAttempt: (() => void) | null = null;

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(messages.at(-1)!.content) as {
      section?: string;
      suspect?: { seatId?: string };
    };
    if (
      request.section === "suspect_chapter" &&
      request.suspect?.seatId === "suspect-1"
    ) {
      this.calls += 1;
      this.sections.push("suspect_chapter:suspect-1");
      this.onWitnessAttempt?.();
      return "{}";
    }
    return super.generateResponse(messages, options);
  }
}

class ExactClockWithoutRecallV2AuthorProvider extends V2AuthorProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(messages.at(-1)!.content) as {
      section?: string;
      suspect?: { temporalRecall?: string };
    };
    const response = await super.generateResponse(messages, options);
    if (
      request.section !== "suspect_chapter" ||
      request.suspect?.temporalRecall === "exact"
    ) {
      return response;
    }
    const parsed = JSON.parse(response) as {
      suspect?: { alibi?: string };
    };
    if (parsed.suspect) {
      parsed.suspect.alibi = "I checked the clock at exactly 10:13 AM.";
    }
    return JSON.stringify(parsed);
  }
}

class InterruptingSpectatorChoicesV2AuthorProvider extends V2AuthorProvider {
  public permitChoices = false;

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(messages.at(-1)!.content) as { section?: string };
    if (request.section === "prosecution_choices" && !this.permitChoices) {
      this.calls += 1;
      this.sections.push("prosecution_choices");
      return "{}";
    }
    return super.generateResponse(messages, options);
  }
}

class LegacyFormatV2AuthorProvider extends V2AuthorProvider {
  override async generateResponse(messages: ProviderMessage[], options: GenerateOptions): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as { section?: string };
    if (request.section !== "suspect_chapter") return response;
    const parsed = JSON.parse(response) as { suspect?: Record<string, unknown> };
    if (!parsed.suspect) return response;
    delete parsed.suspect.roomIntroduction;
    delete parsed.suspect.roomIntroductionStageAction;
    delete parsed.suspect.roomIntroductionPerformance;
    const topics = Array.isArray(parsed.suspect.talkTopics) ? parsed.suspect.talkTopics : [];
    for (const topic of topics) {
      if (topic && typeof topic === "object") delete (topic as Record<string, unknown>).repeatResponses;
    }
    return JSON.stringify(parsed);
  }
}

class MinimalCoreV2AuthorProvider extends V2AuthorProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as {
      section?: string;
    };
    if (request.section !== "suspect_chapter") return response;
    const parsed = JSON.parse(response) as { suspect?: Record<string, unknown> };
    const suspect = parsed.suspect;
    if (!suspect) return response;
    const presentationGate = suspect.presentationGate && typeof suspect.presentationGate === "object"
      ? suspect.presentationGate as Record<string, unknown>
      : null;
    const unlockTopicId = typeof presentationGate?.unlockTopicId === "string"
      ? presentationGate.unlockTopicId
      : null;
    const talkTopics = (Array.isArray(suspect.talkTopics) ? suspect.talkTopics : [])
      .filter((topic): topic is Record<string, unknown> => Boolean(topic && typeof topic === "object"));
    const coreTopic = (unlockTopicId
      ? talkTopics.find((topic) => topic.id === unlockTopicId)
      : talkTopics[0]) ?? talkTopics[0];
    const minimalTopics = coreTopic
      ? [{
          id: coreTopic.id,
          label: coreTopic.label,
          category: coreTopic.category,
          subjectId: coreTopic.subjectId,
          question: coreTopic.question,
          response: coreTopic.response,
        }]
      : [];
    const presentReactions = (Array.isArray(suspect.presentReactions) ? suspect.presentReactions : [])
      .filter((reaction): reaction is Record<string, unknown> => Boolean(reaction && typeof reaction === "object"))
      .map((reaction) => ({
        recordId: reaction.recordId,
        response: reaction.response,
      }));
    const testimony = (Array.isArray(suspect.testimony) ? suspect.testimony : [])
      .filter((statement): statement is Record<string, unknown> => Boolean(statement && typeof statement === "object"))
      .map((statement) => ({
        id: statement.id,
        text: statement.text,
        press: statement.press,
        defenseRebuttal: statement.defenseRebuttal ?? statement.rebuttal,
        revision: statement.revision,
      }));
    parsed.suspect = {
      seatId: suspect.seatId,
      relationship: suspect.relationship,
      alibi: suspect.alibi,
      talkTopics: minimalTopics,
      presentationGate,
      presentReactions,
      testimony,
    };
    return JSON.stringify(parsed);
  }
}

class GateNormalizationV2AuthorProvider extends V2AuthorProvider {
  public requiredGateRecordId: string | null = null;
  public nominatedTopicId: string | null = null;
  private readonly gateMode: "early-topic" | "missing-topic";

  public constructor(gateMode: "early-topic" | "missing-topic") {
    super();
    this.gateMode = gateMode;
  }

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as {
      section?: string;
      suspect?: { requiredPresentationGateRecordId?: string | null };
    };
    const requiredRecordId = request.suspect?.requiredPresentationGateRecordId;
    if (request.section !== "suspect_chapter" || !requiredRecordId) {
      return response;
    }
    const parsed = JSON.parse(response) as { suspect?: Record<string, unknown> };
    const suspect = parsed.suspect;
    if (!suspect) return response;
    const topics = (Array.isArray(suspect.talkTopics) ? suspect.talkTopics : [])
      .filter((topic): topic is Record<string, unknown> =>
        Boolean(topic && typeof topic === "object"));
    const firstTopicId = typeof topics[0]?.id === "string"
      ? topics[0].id
      : null;
    this.requiredGateRecordId = requiredRecordId;
    this.nominatedTopicId = this.gateMode === "early-topic"
      ? firstTopicId
      : "missing-authored-topic";
    suspect.presentationGate = {
      id: "model-owned-gate-id",
      recordId: "evidence:not-the-frozen-record",
      unlockTopicId: this.nominatedTopicId,
    };
    if (this.gateMode === "missing-topic") {
      const reactions = (Array.isArray(suspect.presentReactions)
        ? suspect.presentReactions
        : []).filter((reaction): reaction is Record<string, unknown> =>
          Boolean(reaction && typeof reaction === "object"));
      const requiredReaction = reactions.find(
        (reaction) => reaction.recordId === requiredRecordId,
      );
      if (requiredReaction) {
        requiredReaction.response =
          "This record changes my account: I crossed the gallery later than I admitted.";
      }
    }
    return JSON.stringify(parsed);
  }
}

class MissingWitnessCoreV2AuthorProvider extends V2AuthorProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as {
      section?: string;
    };
    if (request.section !== "suspect_chapter") return response;
    const parsed = JSON.parse(response) as { suspect?: Record<string, unknown> };
    if (!parsed.suspect) return response;
    delete parsed.suspect.relationship;
    const testimony = Array.isArray(parsed.suspect.testimony) ? parsed.suspect.testimony : [];
    const secondStatement = testimony[1];
    if (secondStatement && typeof secondStatement === "object") {
      delete (secondStatement as Record<string, unknown>).press;
    }
    const presentReactions = Array.isArray(parsed.suspect.presentReactions)
      ? parsed.suspect.presentReactions
      : [];
    const firstReaction = presentReactions[0];
    if (firstReaction && typeof firstReaction === "object") {
      delete (firstReaction as Record<string, unknown>).response;
    }
    return JSON.stringify(parsed);
  }
}

class ContentBearingPersonaDialogueProvider extends V2AuthorProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as {
      section?: string;
      lines?: Array<{ lineId: string }>;
    };
    if (request.section === "persona_dialogue_polish") {
      this.calls += 1;
      this.sections.push("persona_dialogue_polish");
      return JSON.stringify({
        lineFrames: (request.lines ?? []).map((line) => ({
          lineId: line.lineId,
          leadIn: "Avery did it,",
        })),
      });
    }
    return super.generateResponse(messages, options);
  }
}

class HangingPersonaDialogueProvider extends V2AuthorProvider {
  public personaDialogueSignal: AbortSignal | null = null;

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as {
      section?: string;
      lines?: Array<{ lineId: string; speakerBotId: string; canonicalText: string }>;
    };
    if (request.section === "persona_dialogue_polish") {
      this.calls += 1;
      this.sections.push("persona_dialogue_polish");
      this.personaDialogueRequests.push({ lines: request.lines ?? [] });
      assert.ok(options?.signal, "persona polish must use a bounded generation signal");
      this.personaDialogueSignal = options.signal;
      return new Promise(() => undefined);
    }
    return super.generateResponse(messages, options);
  }
}

class CourtroomInvestigationV2AuthorProvider extends V2AuthorProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as { section?: string };
    if (request.section !== "suspect_chapter") return response;
    const parsed = JSON.parse(response) as { suspect?: Record<string, unknown> };
    if (!parsed.suspect) return response;
    parsed.suspect.roomIntroduction = "The Court has no patience for games, so ask your questions carefully.";
    return JSON.stringify(parsed);
  }
}

class CrosswiredPresentTitleV2AuthorProvider extends V2AuthorProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as { section?: string };
    if (request.section !== "suspect_chapter") return response;
    const parsed = JSON.parse(response) as {
      suspect?: { presentReactions?: Array<Record<string, unknown>> };
    };
    for (const reaction of parsed.suspect?.presentReactions ?? []) {
      reaction.prosecutionLine = "The Service Bell Log is the record I want you to answer.";
      reaction.response = "The Archive exhibit 2 appears to have been treated with more respect than its owner.";
    }
    return JSON.stringify(parsed);
  }
}

class RecordSpecificDefaultPresentV2AuthorProvider extends V2AuthorProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as { section?: string };
    if (request.section !== "suspect_chapter") return response;
    const parsed = JSON.parse(response) as { suspect?: Record<string, unknown> };
    if (!parsed.suspect) return response;
    parsed.suspect.defaultPresentReaction = "The Service Bell Log has already said everything worth saying.";
    return JSON.stringify(parsed);
  }
}

class CompatibleProsecutionPresentationV2AuthorProvider extends V2AuthorProvider {
  override async generateResponse(messages: ProviderMessage[], options: GenerateOptions): Promise<string> {
    const response = await super.generateResponse(messages, options);
    const request = JSON.parse(String(messages.at(-1)?.content ?? "{}")) as { section?: string };
    if (request.section !== "prosecution_choices") return response;
    const parsed = JSON.parse(response) as {
      prosecutionChoices?: Array<{ options?: Array<Record<string, unknown>> }>;
    };
    for (const choice of parsed.prosecutionChoices ?? []) {
      for (const option of choice.options ?? []) {
        option.prosecutionLine = option.text;
        option.prosecutionStageAction = option.stageAction;
        option.witnessReaction = option.reaction;
        option.witnessReactionStageAction = option.reactionStageAction;
        delete option.text;
        delete option.stageAction;
        delete option.reaction;
        delete option.reactionStageAction;
      }
    }
    return JSON.stringify(parsed);
  }
}

function runtime(provider: V2AuthorProvider): DebateAiRuntime {
  return {
    preferredProvider: "local",
    responseMode: "local",
    local: { provider, providerName: "local", model: "mystery-v2-test" },
  };
}

class HangingV2AuthorProvider implements LlmProvider {
  public readonly name = "local" as const;
  public calls = 0;

  public async generateResponse(
    _messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    this.calls += 1;
    const signal = options?.signal;
    assert.ok(signal, "case authoring must carry a bounded generation signal");
    return new Promise(() => undefined);
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

class EmptyAutoV2AuthorProvider implements LlmProvider {
  public readonly name = "openai" as const;
  public calls = 0;

  public async generateResponse(): Promise<string> {
    this.calls += 1;
    return "";
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

class AuditingV2AuxiliaryProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "llama3.2";

  public async generateResponse(messages: ProviderMessage[]): Promise<string> {
    const request = JSON.parse(messages.at(-1)?.content ?? "{}") as {
      bots?: Array<{ botId: string; sourceHash: string }>;
      sectionKey?: string;
      ledger?: { relevantFrozenIds?: string[] };
    };
    if (request.bots) {
      return JSON.stringify({
        voiceCards: request.bots.map((bot) => ({
          botId: bot.botId,
          sourceHash: bot.sourceHash,
          cues: ["Measured, exact, and restrained under pressure."],
        })),
      });
    }
    if (request.sectionKey === "suspect:suspect-1") {
      return JSON.stringify({
        issues: [{
          fieldPath: "alibi",
          code: "proof_route_conflict",
          severity: "high",
          relatedFrozenIds: [request.ledger?.relevantFrozenIds?.[0]],
          repairInstruction: "Keep the alibi consistent with the frozen proof route.",
        }],
      });
    }
    return JSON.stringify({ issues: [] });
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

class RepairAwareV2AuthorProvider extends V2AuthorProvider {
  public repairRequests: Array<Record<string, unknown>> = [];

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const request = JSON.parse(messages.at(-1)?.content ?? "{}") as Record<
      string,
      unknown
    >;
    if (request.section === "targeted_section_repair") {
      this.calls += 1;
      this.repairRequests.push(request);
      return JSON.stringify(request.existingSection);
    }
    return super.generateResponse(messages, options);
  }
}

async function waitForProviderCalls(
  provider: HangingV2AuthorProvider,
  expected: number,
): Promise<void> {
  while (provider.calls < expected) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function playableWave(): Buffer {
  const sampleRate = 8_000;
  const sampleCount = 800;
  const dataBytes = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataBytes);
  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(36 + dataBytes, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < sampleCount; index += 1) {
    wave.writeInt16LE(Math.round(Math.sin(index / 8) * 2_000), 44 + index * 2);
  }
  return wave;
}

function testDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        preferred_provider, created_at, last_active_at)
     VALUES ('user-1', 'v2@example.com', 'Prosecutor', 'hash', 'salt',
             'cipher', 'iv', 'tag', 'local', ?, ?)`,
  ).run(NOW, NOW);
  for (let index = 1; index <= 10; index += 1) {
    db.prepare(
      `INSERT INTO bots
         (id, user_id, name, system_prompt, export_hash, powers_json,
          color, glyph, online_enabled, model, local_model, online_model,
          created_at, updated_at)
       VALUES (?, 'user-1', ?, ?, ?, '[]', ?, '◆', 1,
               'mystery-v2-test', 'mystery-v2-test', 'mystery-v2-test', ?, ?)`,
    ).run(
      `bot-${index}`,
      `Actor ${index}`,
      `Actor ${index} is observant, theatrical, and exacting under pressure.`,
      `export-${index}`,
      `#${(0x111111 * index).toString(16).padStart(6, "0").slice(0, 6)}`,
      NOW,
      NOW,
    );
  }
  return db;
}

function config(): DebateWhodunnitCreateConfigV2 {
  return {
    version: 2,
    preset: "compact",
    difficulty: "classic",
    artMode: "bundled",
    trialType: "jury",
    inspiration: "A violet-hour archive murder",
    nonce: "v2-test",
    suspectBotIds: ["bot-1", "bot-2", "bot-3", "bot-4"],
    prosecutorPartnerBotId: "bot-5",
    rivalDefenseBotId: "bot-6",
    jurorBotIds: ["bot-7", "bot-8", "bot-9", "bot-10"],
  };
}

function v2State(session: DebateSessionV1): DebateWhodunnitFormatStateV2 {
  assert.equal(session.formatState.format, "whodunnit");
  assert.equal(session.formatState.version, 2);
  return session.formatState as DebateWhodunnitFormatStateV2;
}

function recordReferenceKey(reference: { kind: string; id: string }): string {
  return `${reference.kind}:${reference.id}`;
}

function act(
  db: DatabaseSync,
  session: DebateSessionV1,
  request: Omit<DebateMysteryActionRequestV2, "version" | "expectedRevision" | "idempotencyKey">,
  key: string,
): DebateSessionV1 {
  return applyDebateMysteryActionV2(db, "user-1", session.id, {
    ...request,
    version: 2,
    expectedRevision: session.revision,
    idempotencyKey: key,
  } as DebateMysteryActionRequestV2);
}

async function completedSpectatorCase(
  db: DatabaseSync,
  provider: V2AuthorProvider,
  key: string,
): Promise<DebateSessionV1> {
  let session = await createDebateMysterySessionV2(
    db,
    "user-1",
    { ...config(), playerRole: "spectator" },
    `create-${key}`,
    runtime(provider),
    { deferBackgroundStart: true },
  );
  session = await runDebateMysteryCompilationV2(
    db,
    "user-1",
    session.id,
    runtime(provider),
    { generateWave: async () => playableWave() },
  );
  return finishSpectatorRun(db, session, key);
}

function finishSpectatorRun(
  db: DatabaseSync,
  startingSession: DebateSessionV1,
  key: string,
): DebateSessionV1 {
  let session = startingSession;
  session = act(db, session, { action: "move" }, `${key}-review`);
  session = act(db, session, {
    action: "file_theory",
    theory: v2State(session).theory!,
  }, `${key}-file`);
  for (let advance = 0; v2State(session).playPhase === "trial" && advance < 50; advance += 1) {
    session = act(
      db,
      session,
      { action: "advance_spectator_trial" },
      `${key}-advance-${advance}`,
    );
  }
  assert.equal(v2State(session).playPhase, "verdict");
  assert.equal(session.status, "completed");
  return session;
}

describe("Whodunnit V2 durable prosecution runtime", () => {
  it("gives critical authoring recovery lanes at least two minutes without shrinking larger budgets", () => {
    assert.equal(
      mysteryV2CriticalAuthoringAttemptTimeoutMs({
        providerName: "anthropic",
        model: "claude-opus-5",
        reasoningEffort: "none",
      }),
      V2_CRITICAL_AUTHORING_MIN_ATTEMPT_TIMEOUT_MS,
    );
    assert.equal(
      mysteryV2CriticalAuthoringAttemptTimeoutMs({
        providerName: "openai",
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
      }),
      360_000,
    );
  });

  it("freezes difficulty-scaled suspect awareness and temporal recall", () => {
    const suspects = Array.from({ length: 8 }, (_, index) => ({
      seatId: `suspect-${index + 1}`,
    }));
    const resolved = resolveMysterySuspectKnowledgeV2({
      caseSeed: "knowledge-contract",
      difficulty: "mastermind",
      suspects,
      culpritSeatId: "suspect-1",
      accompliceSeatId: "suspect-2",
      eyewitnessSeatId: "suspect-3",
    });
    assert.deepEqual(
      resolved,
      resolveMysterySuspectKnowledgeV2({
        caseSeed: "knowledge-contract",
        difficulty: "mastermind",
        suspects,
        culpritSeatId: "suspect-1",
        accompliceSeatId: "suspect-2",
        eyewitnessSeatId: "suspect-3",
      }),
    );
    assert.equal(resolved["suspect-1"]?.awareness, "involved");
    assert.equal(resolved["suspect-2"]?.awareness, "involved");
    assert.equal(resolved["suspect-3"]?.awareness, "incidental");
    for (const knowledge of Object.values(resolved)) {
      if (knowledge.awareness === "unaware") {
        assert.equal(knowledge.temporalRecall, "none");
      }
    }

    const unawareCounts = {
      casual: 0,
      classic: 0,
      mastermind: 0,
    };
    for (let index = 0; index < 160; index += 1) {
      for (const difficulty of ["casual", "classic", "mastermind"] as const) {
        const knowledge = resolveMysterySuspectKnowledgeV2({
          caseSeed: `knowledge-sample-${index}`,
          difficulty,
          suspects,
          culpritSeatId: "suspect-1",
          accompliceSeatId: null,
          eyewitnessSeatId: "suspect-2",
        });
        unawareCounts[difficulty] += Object.values(knowledge).filter(
          (entry) => entry.awareness === "unaware",
        ).length;
        assert.equal(knowledge["suspect-1"]?.awareness, "involved");
        assert.equal(knowledge["suspect-2"]?.awareness, "incidental");
      }
    }
    assert.ok(unawareCounts.casual > 0);
    assert.ok(unawareCounts.casual < unawareCounts.classic);
    assert.ok(unawareCounts.classic < unawareCounts.mastermind);
  });

  it("migrates legacy compiled cases into independent Run 1 families", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE debate_mystery_v2_cases (
        session_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        private_case_json TEXT NOT NULL,
        dialogue_graph_json TEXT NOT NULL,
        case_hash TEXT NOT NULL,
        graph_hash TEXT NOT NULL,
        validation_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO debate_mystery_v2_cases
        (session_id, user_id, schema_version, private_case_json,
         dialogue_graph_json, case_hash, graph_hash, validation_json,
         created_at, updated_at)
      VALUES
        ('legacy-a', 'user-1', 2, '{}', '{}', 'a', 'b', '{}', '${NOW}', '${NOW}'),
        ('legacy-b', 'user-1', 2, '{}', '{}', 'c', 'd', '{}', '${NOW}', '${NOW}');
    `);
    initializeDatabase(db);
    const rows = db.prepare(
      `SELECT session_id, case_family_id, run_ordinal
         FROM debate_mystery_v2_cases
        ORDER BY session_id`,
    ).all() as Array<{ session_id: string; case_family_id: string; run_ordinal: number }>;
    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { session_id: "legacy-a", case_family_id: "legacy-a", run_ordinal: 1 },
      { session_id: "legacy-b", case_family_id: "legacy-b", run_ordinal: 1 },
    ]);
    const index = db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?",
    ).get("idx_debate_mystery_v2_cases_family_run") as { name?: string } | undefined;
    assert.equal(index?.name, "idx_debate_mystery_v2_cases_family_run");
  });

  it("restarts the open investigation and unlocked court without changing the sealed Run", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let investigation = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "restart-v2-investigation-create",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    investigation = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      investigation.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    const sealedInvestigation = db.prepare(
      `SELECT private_case_json, dialogue_graph_json, case_hash, graph_hash,
              case_family_id, run_ordinal
         FROM debate_mystery_v2_cases
        WHERE user_id = ? AND session_id = ?`,
    ).get("user-1", investigation.id);
    investigation = act(
      db,
      investigation,
      { action: "move" },
      "restart-v2-open-casekeeper",
    );
    investigation = act(
      db,
      investigation,
      { action: "dismiss_case_opening" },
      "restart-v2-dismiss-casekeeper",
    );
    assert.equal(v2State(investigation).playPhase, "investigation");
    const restartedInvestigation = restartDebateMysteryInvestigationV2(
      db,
      "user-1",
      investigation.id,
      {
        expectedRevision: investigation.revision,
        idempotencyKey: "restart-v2-investigation",
      },
    );
    assert.equal(v2State(restartedInvestigation).playPhase, "title_card");
    assert.equal(restartedInvestigation.status, "waiting_for_player");
    assert.equal(restartedInvestigation.stepKey, "mystery_v2_title");
    assert.equal(v2State(restartedInvestigation).theory, null);
    assert.equal(v2State(restartedInvestigation).court, null);
    assert.equal(
      listDebateSessions(db, "user-1").find((entry) => entry.id === investigation.id)
        ?.mysteryInvestigationMode,
      "full",
    );
    assert.ok(
      v2State(restartedInvestigation).rooms.every((room) =>
        room.hotspots.every((hotspot) => !hotspot.examined)),
    );
    assert.deepEqual(
      db.prepare(
        "SELECT action_kind FROM debate_mystery_actions WHERE user_id = ? AND session_id = ? ORDER BY sequence",
      ).all("user-1", investigation.id).map((row) => (row as { action_kind: string }).action_kind),
      ["restart_investigation"],
    );
    assert.deepEqual(
      db.prepare(
        `SELECT private_case_json, dialogue_graph_json, case_hash, graph_hash,
                case_family_id, run_ordinal
           FROM debate_mystery_v2_cases
          WHERE user_id = ? AND session_id = ?`,
      ).get("user-1", investigation.id),
      sealedInvestigation,
    );
    assert.equal(
      restartDebateMysteryInvestigationV2(db, "user-1", investigation.id, {
        expectedRevision: investigation.revision,
        idempotencyKey: "restart-v2-investigation",
      }).revision,
      restartedInvestigation.revision,
    );

    let court = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), investigationMode: "court_only" },
      "restart-v2-court-create",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    court = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      court.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    court = act(db, court, { action: "move" }, "restart-v2-enter-court");
    const filedTheory = structuredClone(v2State(court).theory);
    const filedAt = v2State(court).theoryFiledAt;
    const admittedRecord = structuredClone(v2State(court).record);
    const firstChapterId = v2State(court).court?.activeChapterId;
    const firstStatementId = v2State(court).court?.activeStatementId;
    assert.ok(firstChapterId && firstStatementId);
    court = act(
      db,
      court,
      { action: "press_statement", statementId: firstStatementId },
      "restart-v2-progress-court",
    );
    const restartedCourt = restartDebateMysteryCourtV2(db, "user-1", court.id, {
      expectedRevision: court.revision,
      idempotencyKey: "restart-v2-court",
    });
    const restartedCourtState = v2State(restartedCourt);
    assert.equal(restartedCourtState.playPhase, "trial");
    assert.equal(restartedCourt.status, "waiting_for_player");
    assert.equal(restartedCourt.stepKey, "mystery_v2_trial");
    assert.deepEqual(restartedCourtState.theory, filedTheory);
    assert.equal(restartedCourtState.theoryFiledAt, filedAt);
    assert.deepEqual(restartedCourtState.record, admittedRecord);
    assert.equal(restartedCourtState.court?.activeChapterId, firstChapterId);
    assert.equal(restartedCourtState.court?.activeStatementId, firstStatementId);
    assert.deepEqual(restartedCourtState.court?.completedChapterIds, []);
    assert.equal(
      restartedCourtState.court?.credibilityRemaining,
      restartedCourtState.court?.credibilityMaximum,
    );
    assert.deepEqual(restartedCourtState.calloutHistory.map((entry) => entry.callout), ["order"]);
    assert.equal(
      listDebateSessions(db, "user-1").find((entry) => entry.id === court.id)
        ?.mysteryInvestigationMode,
      "court_only",
    );
    assert.deepEqual(
      db.prepare(
        "SELECT action_kind FROM debate_mystery_actions WHERE user_id = ? AND session_id = ? ORDER BY sequence",
      ).all("user-1", court.id).map((row) => (row as { action_kind: string }).action_kind),
      ["move", "restart_court"],
    );
    assert.equal(
      restartDebateMysteryCourtV2(db, "user-1", court.id, {
        expectedRevision: court.revision,
        idempotencyKey: "restart-v2-court",
      }).revision,
      restartedCourt.revision,
    );
  });

  it("freezes court-only cases without generating investigation content or assets", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      {
        ...config(),
        investigationMode: "court_only",
        assetSynthesis: { evidence: false, rooms: true as never, music: true as never },
      },
      "create-v2-court-only",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(db, "user-1", created.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    const state = v2State(session);
    const failure = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.equal(state.compilation.stage, "complete", failure.private_error ?? state.compilation.spoilerSafeMessage);
    const { graph, privateCase } = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(state.config.investigationMode, "court_only");
    assert.equal(state.compilation.substeps.some((substep) => substep.id === "room-details"), false);
    assert.deepEqual(state.config.assetSynthesis, { evidence: false, rooms: false, music: false });
    assert.deepEqual(state.rooms, []);
    assert.deepEqual(state.topics, []);
    assert.deepEqual(privateCase.investigationRoomIds, []);
    assert.equal(provider.sections.includes("room_examinations"), false);
    assert.equal(graph.nodes.some((node) => node.scene === "investigation"), false);
    const court = act(db, session, { action: "move" }, "court-only-enter-court");
    const courtState = v2State(court);
    assert.equal(courtState.playPhase, "trial");
    assert.equal(courtState.theory?.culpritSeatId, privateCase.sealedCulpritSeatId);
    assert.ok(courtState.record.length > 0);
    assert.ok(courtState.record.every((item) => item.admitted && item.reference.kind === "evidence"));
    assert.ok(courtState.court?.activeChapterId);
    const reloaded = getDebateSession(db, "user-1", court.id);
    assert.equal(v2State(reloaded).config.investigationMode, "court_only");
    assert.equal(v2State(reloaded).playPhase, "trial");
  });

  it("starts a direct-court Spectator after the title card without Theory Board review", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), playerRole: "spectator", investigationMode: "court_only" },
      "create-v2-spectator-direct-court",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    assert.equal(v2State(session).compilation.stage, "complete");
    const compiled = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.ok(compiled.graph.prosecutionChoices.every((choice) => choice.options.length === 1));

    session = act(db, session, { action: "move" }, "spectator-direct-court-title");
    const state = v2State(session);
    assert.equal(state.playPhase, "trial");
    assert.ok(state.theoryFiledAt);
    assert.ok(state.court?.activeChapterId);
    assert.deepEqual(state.rooms, []);
    assert.throws(
      () => act(db, session, { action: "file_theory", theory: state.theory! }, "spectator-direct-court-refile"),
      /only allows/iu,
    );
  });

  it("returns a spoiler-safe durable Case Forge before authoring begins", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-forge",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const state = v2State(session);
    assert.equal(provider.calls, 0);
    assert.equal(state.playPhase, "case_forge");
    assert.equal(state.caseTitle, null);
    assert.equal(state.config.trialType, "jury");
    assert.deepEqual(state.config.jurorBotIds, ["bot-7", "bot-8", "bot-9", "bot-10"]);
    assert.deepEqual(session.jury.jurors.map((juror) => juror.id), state.config.jurorBotIds);
    const compilation = getDebateMysteryCompilationStatusV2(db, "user-1", session.id);
    assert.equal(compilation.stage, "writing_case");
    assert.deepEqual(
      compilation.substeps.map((substep) => [substep.id, substep.state]),
      [
        ["foundation", "active"],
        ["room-details", "upcoming"],
        ["witness-chapters", "upcoming"],
        ["prosecution-responses", "upcoming"],
      ],
    );
  });

  it("rejects exact clock testimony from a witness without exact recall", async () => {
    const db = testDb();
    const provider = new ExactClockWithoutRecallV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), difficulty: "mastermind" },
      "create-v2-temporal-recall-gate",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    const row = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.match(row.private_error ?? "", /exact clock recall.*10:13 AM/iu);
    const impreciseWitnessRequests = provider.requests.filter((request) => {
      const suspect = request.suspect as
        | { temporalRecall?: string }
        | undefined;
      return (
        request.section === "suspect_chapter" &&
        suspect?.temporalRecall !== "exact"
      );
    });
    assert.ok(impreciseWitnessRequests.length > 0);
    assert.ok(
      impreciseWitnessRequests.every((request) =>
        !("timeline" in (request.setup as Record<string, unknown>))),
      "an imprecise witness prompt must not export exact timeline anchors",
    );
  });

  it("allows one account-scoped Case Forge while leaving idempotent retries safe", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const first = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "one-forge-first",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const idempotent = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "one-forge-first",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    assert.equal(idempotent.id, first.id);
    assert.deepEqual(activeDebateMysteryCompilationV2(db, "user-1"), {
      sessionId: first.id,
      status: "queued",
    });
    await assert.rejects(
      () => createDebateMysterySessionV2(
        db,
        "user-1",
        config(),
        "one-forge-second",
        runtime(provider),
        { deferBackgroundStart: true },
      ),
      (error: unknown) =>
        (error as { code?: string }).code === "MYSTERY_CASE_FORGE_ALREADY_ACTIVE",
    );
    const listed = listDebateSessions(db, "user-1").find((entry) => entry.id === first.id);
    assert.equal(listed?.mysteryForge?.state, "active");
    assert.equal(listed?.mysteryForge?.progressPercent, 0);
    db.prepare(
      `UPDATE debate_mystery_v2_jobs
          SET status = 'running', cancellation_requested = 1
        WHERE user_id = ? AND session_id = ?`,
    ).run("user-1", first.id);
    assert.deepEqual(activeDebateMysteryCompilationV2(db, "user-1"), {
      sessionId: first.id,
      status: "running",
    });
  });

  it("releases the Case Forge slot after attention or cancellation", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const stopped = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "forge-attention-first",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    db.prepare(
      `UPDATE debate_mystery_v2_jobs
          SET status = 'needs_attention', stage = 'needs_attention'
        WHERE user_id = ? AND session_id = ?`,
    ).run("user-1", stopped.id);
    const replacement = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "forge-attention-replacement",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    await assert.rejects(
      () => retryDebateMysteryCompilationV2(
        db,
        "user-1",
        stopped.id,
        runtime(provider),
        { deferBackgroundStart: true },
      ),
      (error: unknown) =>
        (error as { code?: string }).code === "MYSTERY_CASE_FORGE_ALREADY_ACTIVE",
    );
    cancelDebateMysteryCompilationV2(db, "user-1", replacement.id);
    const third = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "forge-after-cancel",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    assert.equal(activeDebateMysteryCompilationV2(db, "user-1")?.sessionId, third.id);
  });

  it("advances an empty Terra author through the frozen Auto lane chain", async () => {
    const db = testDb();
    const terra = new EmptyAutoV2AuthorProvider();
    const sol = new V2AuthorProvider();
    const autoRuntime: DebateAiRuntime = {
      preferredProvider: "openai",
      responseMode: "online",
      modelSelectionKind: "auto",
      local: { provider: sol, providerName: "local", model: "llama3.2" },
      online: { provider: terra, providerName: "openai", model: "gpt-5.6-terra" },
      lanes: [
        { provider: terra, providerName: "openai", model: "gpt-5.6-terra" },
        { provider: sol, providerName: "openai", model: "gpt-5.6-sol" },
      ],
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-auto-empty-terra",
      autoRuntime,
      { deferBackgroundStart: true },
    );
    const compiled = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      autoRuntime,
      { generateWave: async () => playableWave() },
    );

    assert.equal(v2State(compiled).compilation.stage, "complete");
    assert.ok(terra.calls > 0);
    assert.equal(terra.calls, sol.calls);
  });

  it("stops an exhausted Auto witness chapter at three public attempts", async () => {
    const db = testDb();
    const provider = new ExhaustedWitnessV2AuthorProvider();
    const autoRuntime: DebateAiRuntime = {
      preferredProvider: "local",
      responseMode: "local",
      modelSelectionKind: "auto",
      local: { provider, providerName: "local", model: "witness-primary" },
      lanes: [
        { provider, providerName: "local", model: "witness-primary" },
        { provider, providerName: "local", model: "witness-repair-1" },
        { provider, providerName: "local", model: "witness-repair-2" },
        { provider, providerName: "local", model: "witness-over-budget" },
      ],
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-auto-witness-exhaustion",
      autoRuntime,
      { deferBackgroundStart: true },
    );
    const publicAttemptMessages: string[] = [];
    provider.onWitnessAttempt = () => {
      publicAttemptMessages.push(
        getDebateMysteryCompilationStatusV2(db, "user-1", created.id)
          .spoilerSafeMessage,
      );
    };

    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      autoRuntime,
      { generateWave: async () => playableWave() },
    );

    assert.deepEqual(publicAttemptMessages, [
      "Writing the Case · Witness chapter 1 of 4 · attempt 1 of 3",
      "Writing the Case · Witness chapter 1 of 4 · attempt 2 of 3",
      "Writing the Case · Witness chapter 1 of 4 · attempt 3 of 3",
    ]);
    assert.equal(
      provider.sections.filter(
        (section) => section === "suspect_chapter:suspect-1",
      ).length,
      3,
    );
    assert.equal(session.status, "failed");
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    assert.equal(v2State(session).compilation.retryable, true);
    assert.equal(
      v2State(session).compilation.spoilerSafeMessage,
      "Case preparation needs attention",
    );
    assert.doesNotMatch(
      JSON.stringify(session),
      /sealedCulpritSeatId|sealedAccompliceSeatId|actorAccounts|graphValidation|correctPresentations|privateCase/iu,
    );
  });

  it("keeps auxiliary audits advisory until a targeted selected-lane repair", async () => {
    const db = testDb();
    const author = new RepairAwareV2AuthorProvider();
    const auxiliary = new AuditingV2AuxiliaryProvider();
    const auditedRuntime: DebateAiRuntime = {
      ...runtime(author),
      auxiliary,
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-audited-repair",
      auditedRuntime,
      { deferBackgroundStart: true },
    );
    const compiled = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      auditedRuntime,
      { generateWave: async () => playableWave() },
    );

    assert.equal(v2State(compiled).compilation.stage, "complete");
    assert.equal(author.repairRequests.length, 1);
    const repair = author.repairRequests[0]!;
    assert.equal(repair.targetSectionKey, "suspect:suspect-1");
    assert.ok(repair.existingSection);
    assert.ok(repair.frozenLedgerSlice);
    assert.ok(repair.repairDelta);
    assert.equal("setup" in repair, false);
    assert.equal("caseFoundation" in repair, false);
  });

  it("fails a stalled case author into spoiler-safe recovery instead of hanging at Writing the Case", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const db = testDb();
    const provider = new HangingV2AuthorProvider();
    const stalledRuntime: DebateAiRuntime = {
      preferredProvider: "local",
      responseMode: "local",
      local: { provider, providerName: "local", model: "mystery-v2-test" },
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-stalled-author",
      stalledRuntime,
      { deferBackgroundStart: true },
    );
    const pending = runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      stalledRuntime,
    );
    const authoringBudgetMs = reasoningGenerationBudgetMs(undefined, {
      provider: "local",
      modelId: "mystery-v2-test",
    });
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await waitForProviderCalls(provider, attempt);
      const active = getDebateMysteryCompilationStatusV2(db, "user-1", created.id);
      assert.equal(
        active.spoilerSafeMessage,
        `Writing the Case · Drafting foundation · attempt ${attempt} of 3`,
      );
      t.mock.timers.tick(authoringBudgetMs);
    }
    const session = await pending;
    const state = v2State(session);
    const job = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };

    assert.equal(provider.calls, 3);
    assert.equal(session.status, "failed");
    assert.equal(state.compilation.stage, "needs_attention");
    assert.equal(state.compilation.retryable, true);
    assert.equal(state.compilation.publicFailureCode, "CASE_FORGE_COMPILATION_STOPPED");
    assert.equal(state.compilation.publicFailureStage, "writing_case");
    assert.equal(state.compilation.spoilerSafeMessage, "Case preparation needs attention");
    assert.match(job.private_error ?? "", /did not finish within/iu);
    assert.doesNotMatch(
      JSON.stringify(session),
      /sealedCulpritSeatId|sealedAccompliceSeatId|actorAccounts|graphValidation|correctPresentations|privateCase/iu,
    );
  });

  it("keeps a complete earlier-format witness chapter playable when new presentation fields are omitted", async () => {
    const db = testDb();
    const provider = new LegacyFormatV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-legacy-format-author",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(db, "user-1", created.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    const state = v2State(session);
    assert.equal(state.compilation.stage, "complete");
    assert.ok(state.dialogueHistory.some((entry) => /The house has given everyone reasons/u.test(entry.visibleText)) === false);
    const { graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.ok(graph.lines.some((line) => /The house has given everyone reasons/u.test(line.spokenText)));
    assert.ok(graph.lines.some((line) => /^Quietly, As I said,/u.test(line.spokenText)));
  });

  it("compiles a proof-bearing witness core and supplies presentation-only dialogue", async () => {
    const db = testDb();
    const provider = new MinimalCoreV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-minimal-witness-core",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(db, "user-1", created.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    const state = v2State(session);
    assert.equal(state.compilation.stage, "complete");
    const witnessRequest = provider.requests.find((request) => request.section === "suspect_chapter");
    assert.ok(witnessRequest);
    assert.doesNotMatch(
      JSON.stringify(witnessRequest.outputContract),
      /chapterOpening|chapterCompletion|roomIntroduction|defaultPresent|stageAction|performance|defendantReactions/u,
    );
    const { privateCase, graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(privateCase.graphValidation.valid, true);
    for (const topicNodeIds of Object.values(graph.talkTopicNodeIdsBySuspect)) {
      assert.ok(topicNodeIds.length >= 3, "every witness keeps at least three investigation subjects");
    }
    assert.ok(graph.lines.some((line) => /The court calls Actor/u.test(line.spokenText)));
    assert.ok(graph.lines.some((line) =>
      /I can answer only what this Case File record establishes/u.test(line.spokenText)));
  });

  it("moves a valid authored gate topic last and binds the frozen record deterministically", async () => {
    const db = testDb();
    const provider = new GateNormalizationV2AuthorProvider("early-topic");
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-normalize-early-gate",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    assert.equal(v2State(session).compilation.stage, "complete");
    const { graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    const gate = graph.presentationGates?.[0];
    assert.ok(gate);
    assert.equal(
      recordReferenceKey(gate.requiredRecord),
      provider.requiredGateRecordId,
    );
    const target = gate.unlocks.find((unlock) => unlock.kind === "topic");
    assert.ok(target && target.kind === "topic");
    const topicNodeIds =
      graph.talkTopicNodeIdsBySuspect[gate.requiredSuspectSeatId] ?? [];
    assert.ok(topicNodeIds.length >= 3);
    assert.equal(target.topicNodeId, topicNodeIds.at(-1));
    assert.notEqual(target.topicNodeId, topicNodeIds[0]);
    assert.equal(
      target.topicNodeId,
      `talk-${gate.requiredSuspectSeatId}-${provider.nominatedTopicId}`,
    );
    const gateRequest = provider.requests.find((request) => {
      const suspect = request.suspect as
        | { requiredPresentationGateRecordId?: string | null }
        | undefined;
      return Boolean(suspect?.requiredPresentationGateRecordId);
    });
    const gateContract = (
      (gateRequest?.outputContract as { suspect?: { presentationGate?: unknown } })
        ?.suspect?.presentationGate
    ) as Record<string, unknown>;
    assert.deepEqual(Object.keys(gateContract), ["unlockTopicId"]);
  });

  it("synthesizes a final gated follow-up from the required Present reaction", async () => {
    const db = testDb();
    const provider = new GateNormalizationV2AuthorProvider("missing-topic");
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-synthesize-missing-gate-topic",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    const state = v2State(session);
    assert.equal(state.compilation.stage, "complete");
    const { graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    const gate = graph.presentationGates?.[0];
    assert.ok(gate);
    assert.equal(
      recordReferenceKey(gate.requiredRecord),
      provider.requiredGateRecordId,
    );
    const target = gate.unlocks.find((unlock) => unlock.kind === "topic");
    assert.ok(target && target.kind === "topic");
    const topicNodeIds =
      graph.talkTopicNodeIdsBySuspect[gate.requiredSuspectSeatId] ?? [];
    assert.ok(topicNodeIds.length >= 3);
    assert.equal(target.topicNodeId, topicNodeIds.at(-1));
    assert.notEqual(target.topicNodeId, topicNodeIds[0]);
    assert.match(target.topicNodeId, /record-follow-up/u);
    assert.equal(
      state.topics.find((topic) => topic.nodeId === target.topicNodeId)?.unlocked,
      false,
    );
    const exchange = resolveDebateMysteryTalkExchangeV2(
      graph,
      target.topicNodeId,
      gate.requiredSuspectSeatId,
    );
    const responseNode = graph.nodes.find(
      (node) => node.id === exchange?.responseNodeId,
    );
    const responseLine = graph.lines.find(
      (line) => line.id === responseNode?.lineId,
    );
    assert.match(
      responseLine?.spokenText ?? "",
      /This record changes my account: I crossed the gallery later than I admitted\./u,
    );
  });

  it("reports each absent proof-bearing witness field in the private diagnostic", async () => {
    const db = testDb();
    const provider = new MissingWitnessCoreV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-missing-witness-core",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(db, "user-1", created.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    assert.equal(
      provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length,
      3,
    );
    const source = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.match(source.private_error ?? "", /omitted required core dialogue: relationship,/u);
    assert.match(source.private_error ?? "", /testimony\.statement-suspect-1-2\.press/u);
    assert.match(source.private_error ?? "", /presentReactions\.evidence:[^,.]+\.response/u);
    assert.doesNotMatch(source.private_error ?? "", /omitted required dialogue\.$/u);
  });

  it("accepts prosecution choices authored with compatible presentation field names", async () => {
    const db = testDb();
    const provider = new CompatibleProsecutionPresentationV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-compatible-prosecution-fields",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(db, "user-1", created.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    const state = v2State(session);
    assert.equal(state.compilation.stage, "complete");
    assert.equal(provider.sections.filter((section) => section === "prosecution_choices").length, 1);
    const { privateCase, graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(graph.prosecutionChoices.length, 1);
    assert.equal(graph.prosecutionChoices[0]?.options.length, 2);
    assert.equal(privateCase.graphValidation.valid, true);
    assert.deepEqual(privateCase.graphValidation.errors, []);
    assert.equal(privateCase.sealedAccompliceSeatId, null);
    assert.ok(
      privateCase.actorAccounts.every(
        (account) =>
          account.awareness === "involved" ||
          account.awareness === "incidental" ||
          account.awareness === "unaware",
      ),
    );
    assert.ok(
      privateCase.actorAccounts.every(
        (account) =>
          account.temporalRecall === "exact" ||
          account.temporalRecall === "approximate" ||
          account.temporalRecall === "none",
      ),
    );
    const knowledgeBySeat = new Map(
      privateCase.actorAccounts.map((account) => [account.seatId, account]),
    );
    for (const request of provider.requests.filter(
      (entry) => entry.section === "suspect_chapter",
    )) {
      const suspect = request.suspect as {
        seatId: string;
        awareness: string;
        temporalRecall: string;
      };
      assert.equal(
        suspect.awareness,
        knowledgeBySeat.get(suspect.seatId)?.awareness,
      );
      assert.equal(
        suspect.temporalRecall,
        knowledgeBySeat.get(suspect.seatId)?.temporalRecall,
      );
    }
    assert.doesNotMatch(
      JSON.stringify(state),
      /actorAccounts|temporalRecall|suspectKnowledgeBySeat/iu,
    );
  });

  it("resumes a stopped authored draft without regenerating completed sections", async () => {
    const db = testDb();
    const provider = new InterruptingV2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-resumable-author",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    const stopped = db.prepare(
      "SELECT checkpoint_json FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { checkpoint_json: string };
    const draft = JSON.parse(stopped.checkpoint_json) as {
      kind: string;
      foundation: unknown;
      suspectsBySeatId: Record<string, unknown>;
    };
    assert.equal(draft.kind, "authoring-v2");
    assert.ok(draft.contextCapsule);
    assert.ok(draft.provenanceBySection);
    assert.ok(draft.foundation);
    assert.ok(draft.suspectsBySeatId["suspect-1"]);
    assert.equal(draft.suspectsBySeatId["suspect-2"], undefined);
    assert.equal(provider.sections.filter((section) => section === "case_foundation").length, 1);
    assert.equal(provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length, 1);
    const resumedStatus = getDebateMysteryCompilationStatusV2(db, "user-1", session.id);
    assert.deepEqual(
      resumedStatus.substeps.map((substep) => [substep.id, substep.state]),
      [
        ["foundation", "complete"],
        ["room-details", "complete"],
        ["witness-chapters", "attention"],
        ["prosecution-responses", "upcoming"],
      ],
    );
    assert.equal(resumedStatus.substeps[2]?.label, "Witness chapters · 1 of 4");

    const legacyDraft = {
      ...draft,
      kind: "authoring-v1",
    } as Record<string, unknown>;
    delete legacyDraft.contextCapsule;
    delete legacyDraft.connectiveAdditions;
    delete legacyDraft.provenanceBySection;
    db.prepare(
      `UPDATE debate_mystery_v2_jobs
          SET checkpoint_json = ?
        WHERE user_id = ? AND session_id = ?`,
    ).run(JSON.stringify(legacyDraft), "user-1", session.id);

    provider.permitSecondChapter = true;
    await retryDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      deferBackgroundStart: true,
    });
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    assert.equal(v2State(session).compilation.stage, "complete");
    assert.equal(provider.sections.filter((section) => section === "case_foundation").length, 1);
    assert.equal(provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length, 1);
  });

  it("prunes legacy Spectator investigation work and extra prosecution options on authoring resume", async () => {
    const db = testDb();
    const provider = new InterruptingSpectatorChoicesV2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), playerRole: "spectator" },
      "create-v2-spectator-legacy-resume",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    const row = db.prepare(
      "SELECT checkpoint_json FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { checkpoint_json: string };
    const legacyDraft = JSON.parse(row.checkpoint_json) as Record<string, unknown>;
    legacyDraft.kind = "authoring-v1";
    delete legacyDraft.contextCapsule;
    delete legacyDraft.provenanceBySection;
    legacyDraft.examinationsById = {
      ...legacyDraft.examinationsById as Record<string, string>,
      "legacy-room:legacy-hotspot": "Legacy investigation material that must not enter the Spectator graph.",
    };
    legacyDraft.prosecutionChoices = [{
      id: "legacy-spectator-choice",
      witnessSeatId: "suspect-1",
      prompt: "Which prosecution response should proceed?",
      options: [
        { id: "automatic", text: "Proceed on the exact contradiction.", stageAction: null, reaction: "The witness answers the contradiction.", reactionStageAction: null },
        { id: "unused", text: "Pursue an unused alternative.", stageAction: null, reaction: "This response must be pruned.", reactionStageAction: null },
      ],
    }];
    db.prepare(
      "UPDATE debate_mystery_v2_jobs SET checkpoint_json = ? WHERE user_id = ? AND session_id = ?",
    ).run(JSON.stringify(legacyDraft), "user-1", session.id);
    const foundationCalls = provider.sections.filter((section) => section === "case_foundation").length;
    const witnessCalls = provider.sections.filter((section) => section.startsWith("suspect_chapter:")).length;

    await retryDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      deferBackgroundStart: true,
    });
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    const legacyResumeFailure = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.equal(v2State(session).compilation.stage, "complete", legacyResumeFailure.private_error ?? undefined);
    assert.equal(provider.sections.filter((section) => section === "case_foundation").length, foundationCalls);
    assert.equal(provider.sections.filter((section) => section.startsWith("suspect_chapter:")).length, witnessCalls);
    const compiled = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(compiled.graph.nodes.some((node) => node.scene === "investigation"), false);
    assert.deepEqual(compiled.privateCase.investigationRoomIds, []);
    assert.deepEqual(
      compiled.graph.prosecutionChoices.map((choice) => choice.options.map((option) => option.id)),
      [["automatic"]],
    );
    assert.equal(compiled.graph.lines.some((line) => /unused alternative|must be pruned/iu.test(line.spokenText)), false);
  });

  it("prepares opted-in evidence through checkpointed canonical assets before play", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const preparedIds: string[] = [];
    const configured = {
      ...config(),
      assetSynthesis: { evidence: true, rooms: false as const, music: false as const },
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      configured,
      "create-v2-evidence-assets",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      {
        generateWave: async () => playableWave(),
        prepareEvidenceAssets: async ({ exhibits, houseStyle, onPrepared }) => {
          assert.match(houseStyle.promptContract, /same mansion/iu);
          const result: Record<string, DebateMysterySealedAssetRefV1> = {};
          for (const exhibit of exhibits) {
            const asset: DebateMysterySealedAssetRefV1 = {
              version: 1,
              id: `sealed-${exhibit.id}`,
              kind: "evidence",
              status: "ready",
              source: "synthesized",
              revealed: false,
              mimeType: "image/png",
            };
            preparedIds.push(exhibit.id);
            result[exhibit.id] = asset;
            await onPrepared?.(exhibit.id, asset);
          }
          return result;
        },
      },
    );
    const state = v2State(session);
    assert.equal(state.compilation.stage, "complete");
    assert.ok(preparedIds.length > 0);
    const checkpointRow = db.prepare(
      `SELECT checkpoint_json
         FROM debate_mystery_v2_jobs
        WHERE user_id = ? AND session_id = ?`,
    ).get("user-1", session.id) as { checkpoint_json: string };
    const checkpoint = JSON.parse(checkpointRow.checkpoint_json) as {
      privateCase: {
        recordItems: Array<{
          reference: { kind: string; id: string };
          visualKind?: string;
          imageId?: string | null;
          sealedAsset?: DebateMysterySealedAssetRefV1 | null;
        }>;
      };
    };
    const evidence = checkpoint.privateCase.recordItems.filter((item) =>
      item.reference.kind === "evidence");
    assert.deepEqual(
      [...preparedIds].sort(),
      evidence.map((item) => item.reference.id).sort(),
    );
    assert.ok(evidence.every((item) =>
      item.visualKind === "synthesized" &&
      !item.imageId &&
      item.sealedAsset?.status === "ready" &&
      item.sealedAsset.revealed === false));
    assert.ok(state.record.every((item) =>
      item.reference.kind !== "evidence" || preparedIds.includes(item.reference.id)));
    const assetCheckpoints = db.prepare(
      `SELECT checkpoint_key
         FROM debate_mystery_v2_checkpoints
        WHERE user_id = ? AND session_id = ?
          AND checkpoint_key LIKE 'section:evidence-asset:%'`,
    ).all("user-1", session.id) as unknown as Array<{ checkpoint_key: string }>;
    assert.equal(assetCheckpoints.length, preparedIds.length);

    const completedMansionSession: DebateSessionV1 = {
      ...session,
      formatState: {
        ...state,
        rooms: state.rooms.map((room) => ({
          ...room,
          unlocked: true,
          visited: true,
          hotspots: room.hotspots.map((hotspot) => ({
            ...hotspot,
            unlocked: true,
            examined: true,
          })),
        })),
      },
    };
    db.prepare(
      "UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = ?",
    ).run(
      JSON.stringify({ ...completedMansionSession, events: [] }),
      session.id,
      "user-1",
    );
    const mansion = saveDebateMysteryMansionBundleV2(
      db,
      "user-1",
      session.id,
    );
    assert.equal(mansion.rooms.length, state.rooms.length);
    assert.deepEqual(
      listDebateMysteryMansionBundlesV2(db, "user-1").map((entry) => entry.id),
      [mansion.id],
    );
  });

  it("resumes evidence preparation without rebuilding a verified exhibit", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const configured = {
      ...config(),
      assetSynthesis: { evidence: true, rooms: false as const, music: false as const },
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      configured,
      "create-v2-evidence-resume",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    let completedBeforeInterruption: string | null = null;
    const interrupted = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      {
        generateWave: async () => playableWave(),
        prepareEvidenceAssets: async ({ exhibits, onPrepared }) => {
          assert.ok(exhibits.length > 1);
          completedBeforeInterruption = exhibits[0]!.id;
          await onPrepared?.(exhibits[0]!.id, {
            version: 1,
            id: `sealed-${exhibits[0]!.id}`,
            kind: "evidence",
            status: "ready",
            source: "synthesized",
            revealed: false,
            mimeType: "image/png",
          });
          throw new Error("simulated evidence preparation interruption");
        },
      },
    );
    assert.equal(v2State(interrupted).compilation.stage, "needs_attention");
    assert.ok(completedBeforeInterruption);

    await retryDebateMysteryCompilationV2(db, "user-1", created.id, runtime(provider), {
      deferBackgroundStart: true,
    });
    const preparedAfterResume: string[] = [];
    const resumed = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      {
        generateWave: async () => playableWave(),
        prepareEvidenceAssets: async ({ exhibits, onPrepared }) => {
          assert.ok(exhibits.every((exhibit) => exhibit.id !== completedBeforeInterruption));
          const result: Record<string, DebateMysterySealedAssetRefV1> = {};
          for (const exhibit of exhibits) {
            preparedAfterResume.push(exhibit.id);
            result[exhibit.id] = {
              version: 1,
              id: `sealed-${exhibit.id}`,
              kind: "evidence",
              status: "ready",
              source: "synthesized",
              revealed: false,
              mimeType: "image/png",
            };
            await onPrepared?.(exhibit.id, result[exhibit.id]!);
          }
          return result;
        },
      },
    );
    assert.equal(v2State(resumed).compilation.stage, "complete");
    assert.ok(preparedAfterResume.length > 0);
    const checkpoints = db.prepare(
      `SELECT checkpoint_key
         FROM debate_mystery_v2_checkpoints
        WHERE user_id = ? AND session_id = ?
          AND checkpoint_key LIKE 'section:evidence-asset:%'`,
    ).all("user-1", created.id) as unknown as Array<{ checkpoint_key: string }>;
    assert.equal(
      checkpoints.filter((row) => row.checkpoint_key.endsWith(completedBeforeInterruption!)).length,
      1,
    );
  });

  it("checkpoints the room pack before play and resets only reveal state on investigation restart", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const configured = {
      ...config(),
      assetSynthesis: { evidence: false, rooms: true, music: false as const },
    };
    const onlineRuntime: DebateAiRuntime = {
      ...runtime(provider),
      preferredProvider: "openai",
      responseMode: "online",
      online: { provider, providerName: "openai", model: "mystery-v2-test" },
    };
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      configured,
      "create-v2-room-assets",
      onlineRuntime,
      { deferBackgroundStart: true },
    );
    const preparedRoomIds: string[] = [];
    let session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      onlineRuntime,
      {
        generateWave: async () => playableWave(),
        prepareRoomAssets: async ({ rooms, crimeSceneRoomId, mode, onPrepared }) => {
          assert.equal(mode, "initial");
          assert.ok(rooms.some((room) => room.id === crimeSceneRoomId));
          const ordered = [...rooms].sort((left, right) =>
            left.id === crimeSceneRoomId ? -1 : right.id === crimeSceneRoomId ? 1 : 0);
          const result: Record<string, DebateMysterySealedAssetRefV1> = {};
          for (const room of ordered) {
            preparedRoomIds.push(room.id);
            const asset = room.id === crimeSceneRoomId
              ? setDebateMysteryAssetFallbackV1(db, {
                  userId: "user-1",
                  sessionId: created.id,
                  kind: "room",
                  subjectId: room.id,
                  reason: "test bundled fallback",
                })
              : setDebateMysteryAssetPendingV1(db, {
                  userId: "user-1",
                  sessionId: created.id,
                  kind: "room",
                  subjectId: room.id,
                });
            result[room.id] = asset;
            await onPrepared?.(room.id, asset);
          }
          return result;
        },
      },
    );
    let state = v2State(session);
    assert.equal(state.compilation.stage, "complete");
    assert.equal(preparedRoomIds[0], state.crimeSceneRoomId);
    assert.equal(
      state.rooms.find((room) => room.id === state.crimeSceneRoomId)?.sealedAsset?.status,
      "fallback",
    );
    assert.ok(state.rooms.filter((room) => room.id !== state.crimeSceneRoomId).every((room) =>
      room.sealedAsset?.status === "pending" && room.accessState === "being_secured"));
    const assetIds = state.rooms.map((room) =>
      (db.prepare(
        `SELECT id FROM debate_mystery_asset_vault
          WHERE user_id = ? AND session_id = ? AND kind = 'room' AND subject_id = ?`,
      ).get("user-1", session.id, room.id) as { id: string }).id);

    session = act(db, session, { action: "move" }, "reveal-v2-crime-scene-room");
    state = v2State(session);
    const crimeScene = state.rooms.find((room) => room.id === state.crimeSceneRoomId)!;
    assert.equal(crimeScene.sealedAsset?.revealed, true);
    assert.ok((db.prepare(
      `SELECT revealed_at FROM debate_mystery_asset_vault
        WHERE user_id = ? AND session_id = ? AND kind = 'room' AND subject_id = ?`,
    ).get("user-1", session.id, crimeScene.id) as { revealed_at: string | null }).revealed_at);

    const restarted = restartDebateMysteryInvestigationV2(
      db,
      "user-1",
      session.id,
      {
        expectedRevision: session.revision,
        idempotencyKey: "restart-v2-room-asset-reveal",
      },
    );
    state = v2State(restarted);
    assert.equal(state.playPhase, "title_card");
    assert.deepEqual(state.rooms.map((room) =>
      (db.prepare(
        `SELECT id FROM debate_mystery_asset_vault
          WHERE user_id = ? AND session_id = ? AND kind = 'room' AND subject_id = ?`,
      ).get("user-1", session.id, room.id) as { id: string }).id), assetIds);
    assert.ok(state.rooms.every((room) => room.sealedAsset?.revealed === false));
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM debate_mystery_asset_vault WHERE revealed_at IS NOT NULL",
      ).get() as { count: number }).count,
      0,
    );
  });

  it("rejects room synthesis for a LOCAL V2 case before authoring begins", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    await assert.rejects(
      createDebateMysterySessionV2(
        db,
        "user-1",
        {
          ...config(),
          assetSynthesis: { evidence: false, rooms: true, music: false },
        },
        "create-v2-local-room-assets",
        runtime(provider),
        { deferBackgroundStart: true },
      ),
      (error: unknown) =>
        error instanceof Error &&
        "code" in error &&
        error.code === "MYSTERY_ROOM_SYNTHESIS_REQUIRES_ONLINE",
    );
  });

  it("deletes sealed assets when a running Forge cancellation is reclaimed", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-cancel-sealed-assets",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    setDebateMysteryAssetFallbackV1(db, {
      userId: "user-1",
      sessionId: created.id,
      kind: "room",
      subjectId: "room-pending-cancel",
      reason: "test fallback awaiting cancellation",
    });
    db.prepare(
      `UPDATE debate_mystery_v2_jobs
          SET status = 'running', lease_owner = 'abandoned-worker',
              leased_until = '2000-01-01T00:00:00.000Z'
        WHERE user_id = ? AND session_id = ?`,
    ).run("user-1", created.id);

    cancelDebateMysteryCompilationV2(db, "user-1", created.id);
    const cancelled = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
    );

    assert.equal(provider.calls, 0, "a reclaimed cancellation must stop before authoring");
    assert.equal(cancelled.status, "cancelled");
    assert.equal(v2State(cancelled).compilation.stage, "cancelled");
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM debate_mystery_asset_vault WHERE user_id = ? AND session_id = ?",
      ).get("user-1", created.id) as { count: number }).count,
      0,
    );
  });

  it("prevents a deleted Debate worker from restoring sealed case assets", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-delete-sealed-assets",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    setDebateMysteryAssetFallbackV1(db, {
      userId: "user-1",
      sessionId: created.id,
      kind: "evidence",
      subjectId: "evidence-before-delete",
      reason: "test fallback awaiting Debate deletion",
    });
    db.prepare(
      `UPDATE debate_mystery_v2_jobs
          SET status = 'running', lease_owner = 'abandoned-delete-worker',
              leased_until = '2000-01-01T00:00:00.000Z'
        WHERE user_id = ? AND session_id = ?`,
    ).run("user-1", created.id);

    deleteDebateSession(db, "user-1", created.id, {
      expectedRevision: created.revision,
      idempotencyKey: "delete-v2-running-forge",
    });
    const settled = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
    );

    assert.equal(provider.calls, 0, "a deleted Debate must not resume authoring");
    assert.equal(settled.status, "cancelled");
    assert.equal(v2State(settled).compilation.stage, "cancelled");
    assert.equal(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM debate_mystery_asset_vault WHERE user_id = ? AND session_id = ?",
      ).get("user-1", created.id) as { count: number }).count,
      0,
    );
  });

  it("seals a persona-shaped dialogue pass without changing a line's authored claim or graph", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-persona-dialogue",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    assert.equal(v2State(session).compilation.stage, "complete");
    assert.equal(provider.personaDialogueRequests.length, 1);
    assert.ok(provider.sections.includes("persona_dialogue_polish"));

    const { graph, privateCase } = getDebateMysteryCaseV2(db, "user-1", session.id);
    const canonicalByLineId = new Map(
      provider.personaDialogueRequests[0]!.lines.map((line) => [line.lineId, line]),
    );
    assert.ok(canonicalByLineId.size > 0);
    assert.ok(privateCase.personaVoiceCardsByBotId?.["bot-5"]);
    for (const [lineId, source] of canonicalByLineId) {
      const line = graph.lines.find((candidate) => candidate.id === lineId);
      assert.ok(line, `the polish pass must retain ${lineId}`);
      const leadIn = source.speakerBotId === "bot-5"
        ? "Let’s be precise:"
        : source.speakerBotId === "bot-6"
          ? "Respectfully,"
          : "Quietly,";
      assert.equal(line.visibleText, `${leadIn} ${source.canonicalText}`);
      assert.equal(line.spokenText, `${leadIn} ${source.canonicalText}`);
      assert.ok(graph.nodes.some((node) => node.lineId === lineId));
    }
    const prosecutorLines = graph.lines.filter((line) => line.speakerBotId === "bot-5");
    assert.ok(prosecutorLines.length > 0);
    assert.ok(prosecutorLines.every((line) =>
      !canonicalByLineId.has(line.id) || line.visibleText.startsWith("Let’s be precise:")));
  });

  it("keeps the canonical dialogue when persona polish introduces case content", async () => {
    const db = testDb();
    const provider = new ContentBearingPersonaDialogueProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-invalid-persona-dialogue",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    const state = v2State(session);
    assert.equal(state.compilation.stage, "complete");
    assert.equal(
      provider.sections.filter((section) => section === "persona_dialogue_polish").length,
      1,
    );
    const source = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.equal(source.private_error, null);
    const { graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(graph.lines.some((line) => /Avery did it,/u.test(line.visibleText)), false);
  });

  it("continues to local voice preparation when persona polish does not settle", async (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const db = testDb();
    const provider = new HangingPersonaDialogueProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-stalled-persona-dialogue",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const pending = runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    while (!provider.sections.includes("persona_dialogue_polish")) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    t.mock.timers.tick(75_000);

    const session = await pending;
    assert.equal(v2State(session).compilation.stage, "complete");
    assert.equal(
      provider.sections.filter((section) => section === "persona_dialogue_polish").length,
      1,
    );
    assert.equal(provider.personaDialogueSignal?.aborted, true);
    const { graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(graph.lines.some((line) => /Let’s be precise:|Respectfully,|Quietly,/u.test(line.visibleText)), false);
  });

  it("rejects courtroom language in investigation dialogue before a case can be sealed", async () => {
    const db = testDb();
    const provider = new CourtroomInvestigationV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-courtroom-investigation-dialogue",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    assert.equal(session.status, "failed");
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    assert.equal(
      provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length,
      3,
    );
    const source = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.match(source.private_error ?? "", /investigation dialogue.*courtroom language/iu);
  });

  it("rejects cross-wired Case File titles in Present dialogue before a case can be sealed", async () => {
    const db = testDb();
    const provider = new CrosswiredPresentTitleV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-crosswired-present-title",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    assert.equal(session.status, "failed");
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    assert.equal(
      provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length,
      3,
    );
    const source = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.match(source.private_error ?? "", /Present exchange names a different Case File record/iu);
  });

  it("rejects a record-specific title in reusable default Present dialogue", async () => {
    const db = testDb();
    const provider = new RecordSpecificDefaultPresentV2AuthorProvider();
    const created = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-record-specific-default-present",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    const session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      created.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    assert.equal(session.status, "failed");
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    assert.equal(
      provider.sections.filter((section) => section === "suspect_chapter:suspect-1").length,
      3,
    );
    const source = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.match(source.private_error ?? "", /default Present dialogue.*specific Case File record/iu);
  });

  it("compiles every suspect chapter, prepares a complete local pack, and plays without runtime generation", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const prismVoiceProfile = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      baseVoiceId: "voice-5" as const,
      pitch: 0.45,
    };
    db.prepare(
      "UPDATE users SET prism_default_bot_audio_voice_profile = ? WHERE id = 'user-1'",
    ).run(JSON.stringify(prismVoiceProfile));
    const preparedProfilesByText = new Map<string, { baseVoiceId: string }>();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-play",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async ({ text, profile }) => {
        preparedProfilesByText.set(text, profile);
        return playableWave();
      },
    });
    let state = v2State(session);
    const compileDiagnostic = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE session_id = ?",
    ).get(session.id) as { private_error: string | null };
    assert.equal(state.compilation.stage, "complete", compileDiagnostic.private_error ?? undefined);
    assert.equal(state.playPhase, "title_card");
    assert.equal(state.caseTitle, "The Turnabout at Violet Hour");
    assert.equal(state.audioReady, true);
    const frozenProsecutorIdentity = structuredClone(
      state.identityMirrorTargetSnapshots[state.config.prosecutorBotId],
    );
    assert.ok(frozenProsecutorIdentity, "Case Forge freezes the player-controlled Prosecutor identity");
    assert.equal(frozenProsecutorIdentity.botId, state.config.prosecutorBotId);
    db.prepare("UPDATE bots SET name = 'Changed after Case Forge' WHERE id = ?")
      .run(state.config.prosecutorBotId);
    assert.equal(typeof state.compilation.startedAt, "string");
    assert.ok(state.compilation.elapsedMs >= 0);
    assert.equal(state.compilation.etaBasisPasses, 5);
    assert.equal(state.compilation.approximateRemainingMs, null);
    const passCheckpoints = db.prepare(
      `SELECT pass_number, checkpoint_key
         FROM debate_mystery_v2_checkpoints
        WHERE user_id = ? AND session_id = ? AND pass_number IS NOT NULL
        ORDER BY pass_number`,
    ).all("user-1", session.id) as unknown as Array<{
      pass_number: number;
      checkpoint_key: string;
    }>;
    assert.deepEqual(
      passCheckpoints.map((checkpoint) => checkpoint.pass_number),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      passCheckpoints.map((checkpoint) => checkpoint.checkpoint_key),
      [
        "pass:writing-case",
        "pass:testing-contradictions",
        "pass:directing-performances",
        "pass:preparing-local-voices",
        "pass:verifying-case-audio",
      ],
    );
    for (const room of state.rooms) {
      assert.equal(Number.isFinite(room.x), true);
      assert.equal(Number.isFinite(room.y), true);
      assert.equal(Number.isFinite(room.width), true);
      assert.equal(Number.isFinite(room.height), true);
      assert.ok((room.width ?? 0) > 0);
      assert.ok((room.height ?? 0) > 0);
      assert.ok(Array.isArray(room.neighborIds));
    }
    const callsAfterCompile = provider.calls;
    const { privateCase, graph } = getDebateMysteryCaseV2(db, "user-1", session.id);
    const presentationGate = graph.presentationGates?.[0];
    assert.ok(presentationGate, "a case with reachable evidence must compile a meaningful Present gate");
    assert.equal(presentationGate.requiredForProgression, true);
    assert.ok(graph.interactionRootNodeIds.includes(presentationGate.correctPresentNodeId));
    assert.ok(privateCase.recordItems.some((item) =>
      recordReferenceKey(item.reference) === recordReferenceKey(presentationGate.requiredRecord)));
    const gatedTopicTarget = presentationGate.unlocks.find((target) => target.kind === "topic");
    assert.ok(gatedTopicTarget && gatedTopicTarget.kind === "topic");
    const gatedPublicTopic = state.topics.find((topic) => topic.nodeId === gatedTopicTarget.topicNodeId);
    assert.equal(gatedPublicTopic?.unlocked, false, "the gated lead should be visibly blocked before the correct Present");
    assert.ok(state.topics.every((topic) => topic.subject && typeof topic.subject.category === "string"));
    const roomTopics = state.topics.filter((topic) => topic.subject.category === "room");
    assert.ok(roomTopics.length >= state.suspects.length, "each suspect should retain an authored room subject");
    assert.ok(roomTopics.every((topic) =>
      topic.subject.category === "room" && state.rooms.some((room) => room.id === topic.subject.roomId)));
    assert.equal(state.topics.some((topic) => Boolean(debateMysteryTalkTopicMirrorsRecordV2({
      topicId: topic.nodeId,
      label: topic.label,
      subject: topic.subject,
      records: privateCase.recordItems,
    }))), false, "Talk must not mirror Case File records");
    const firstAuthoredTopicNodeId = graph.talkTopicNodeIdsBySuspect["suspect-1"]![0]!;
    const currentTalkExchange = resolveDebateMysteryTalkExchangeV2(
      graph,
      firstAuthoredTopicNodeId,
      "suspect-1",
    );
    assert.equal(currentTalkExchange?.questionNodeId, firstAuthoredTopicNodeId);
    assert.match(currentTalkExchange?.responseNodeId ?? "", /^talk-response-/u);
    const repeatTalkExchange = resolveDebateMysteryTalkExchangeV2(
      graph,
      firstAuthoredTopicNodeId,
      "suspect-1",
      1,
    );
    const secondRepeatTalkExchange = resolveDebateMysteryTalkExchangeV2(
      graph,
      firstAuthoredTopicNodeId,
      "suspect-1",
      2,
    );
    assert.match(repeatTalkExchange?.responseNodeId ?? "", /^talk-repeat-response-/u);
    assert.notEqual(repeatTalkExchange?.responseNodeId, currentTalkExchange?.responseNodeId);
    assert.notEqual(secondRepeatTalkExchange?.responseNodeId, repeatTalkExchange?.responseNodeId);
    assert.deepEqual(
      resolveDebateMysteryTalkExchangeV2(graph, firstAuthoredTopicNodeId, "suspect-1", 2),
      secondRepeatTalkExchange,
      "the same replay history must select the same frozen repeat variant",
    );
    const legacyGraph = structuredClone(graph);
    const legacyTopicNode = legacyGraph.nodes.find((node) => node.id === firstAuthoredTopicNodeId)!;
    const authoredResponseNode = legacyGraph.nodes.find(
      (node) => node.id === currentTalkExchange?.responseNodeId,
    )!;
    legacyTopicNode.speakerSeatId = "suspect-1";
    legacyTopicNode.intendedRecipientSeatId = null;
    legacyTopicNode.lineId = authoredResponseNode.lineId;
    legacyTopicNode.nextNodeIds = authoredResponseNode.nextNodeIds;
    assert.deepEqual(
      resolveDebateMysteryTalkExchangeV2(legacyGraph, firstAuthoredTopicNodeId, "suspect-1"),
      { questionNodeId: null, responseNodeId: firstAuthoredTopicNodeId },
    );
    assert.equal(
      resolveDebateMysteryTalkExchangeV2(graph, "talk-stale-topic", "suspect-1"),
      null,
    );
    const publicStateJson = JSON.stringify(session.formatState);
    assert.doesNotMatch(publicStateJson, /sealedCulpritSeatId|sealedAccompliceSeatId|actorAccounts|graphValidation|correctPresentations|privateCase|presentationGates|requiredSuspectSeatId|correctPresentNodeId|requiredRecord/iu);
    assert.equal(graph.witnessChapters.length, state.config.suspectBotIds.length);
    assert.deepEqual(
      graph.witnessChapters.map((chapter) => chapter.witnessSeatId),
      state.suspects.map((suspect) => suspect.seatId),
    );
    const legacyDefaultPresentLine = graph.lines.find(
      (line) => line.nodeId.startsWith("present-response-") && line.nodeId.endsWith("-default"),
    );
    assert.equal(legacyDefaultPresentLine?.stageActionText, "Frowns at the item");
    assert.equal(
      legacyDefaultPresentLine?.spokenText,
      "Quietly, That item was in the mansion, but it does not change the exact account I have given you.",
    );
    assert.equal(legacyDefaultPresentLine?.visibleText, legacyDefaultPresentLine?.spokenText);
    assert.equal(preparedProfilesByText.has(legacyDefaultPresentLine!.spokenText), false);
    assert.equal([...preparedProfilesByText.keys()].some((text) => /frowns at the item/iu.test(text)), false);
    const serviceBellRecord = privateCase.recordItems.find((item) => item.title === "Service Bell Log")!;
    assert.ok(serviceBellRecord);
    const testimonyRecordTitles = privateCase.recordItems
      .filter((item) => item.reference.kind === "testimony")
      .map((item) => item.title);
    assert.ok(testimonyRecordTitles.length > 0);
    assert.equal(testimonyRecordTitles.some((title) => title === "Prior sworn testimony"), false);
    assert.equal(new Set(testimonyRecordTitles).size, testimonyRecordTitles.length);
    assert.ok(testimonyRecordTitles.every((title) => /— sworn statement \d+$/u.test(title)));
    for (const suspect of state.suspects) {
      for (const recordItem of privateCase.recordItems) {
        const mappingKey = `${suspect.seatId}:${recordItem.reference.kind}:${recordItem.reference.id}`;
        const promptNodeId = privateCase.presentNodeIdBySuspectRecord[mappingKey];
        assert.ok(promptNodeId, `missing finite Present mapping for ${mappingKey}`);
        const promptNode = graph.nodes.find((node) => node.id === promptNodeId)!;
        const promptLine = graph.lines.find((line) => line.id === promptNode.lineId)!;
        const responseNode = graph.nodes.find((node) => node.id === promptNode.nextNodeIds[0])!;
        const responseLine = graph.lines.find((line) => line.id === responseNode.lineId)!;
        assert.match(promptLine.visibleText, new RegExp(recordItem.title, "u"));
        assert.match(promptLine.spokenText, new RegExp(recordItem.title, "u"));
        assert.match(responseLine.visibleText, new RegExp(recordItem.title, "u"));
        assert.match(responseLine.spokenText, new RegExp(recordItem.title, "u"));
        assert.equal(promptLine.speakerKind, "player");
        assert.equal(promptLine.speakerBotId, state.config.prosecutorBotId);
        assert.equal(responseLine.speakerKind, "bot");
        assert.equal(responseLine.speakerBotId, suspect.botId);
        assert.ok(preparedProfilesByText.has(promptLine.spokenText));
        assert.ok(preparedProfilesByText.has(responseLine.spokenText));
      }
    }
    const specificAuthoredReaction = graph.lines.find((line) => /That record narrows the interval more than I admitted/iu.test(line.spokenText));
    assert.ok(specificAuthoredReaction, "the authored proof reaction must remain in the compiled graph");
    const examinationNodeIds = new Set(
      graph.nodes.filter((node) => node.kind === "examination_result").map((node) => node.id),
    );
    const examinationLines = graph.lines.filter((line) => examinationNodeIds.has(line.nodeId));
    assert.ok(examinationLines.length > 0);
    assert.equal(examinationLines.every((line) => line.mode === "text_only"), true);
    assert.equal(
      examinationLines.some((line) => privateCase.graphValidation.reachableSpokenLineIds.includes(line.id)),
      false,
    );
    assert.equal(
      examinationLines.some((line) => preparedProfilesByText.has(line.spokenText)),
      false,
    );
    const manifestRow = db.prepare(
      "SELECT status, manifest_json FROM debate_mystery_audio_manifests WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { status: string; manifest_json: string };
    const manifest = JSON.parse(manifestRow.manifest_json) as { entries: unknown[]; complete: boolean };
    assert.equal(manifestRow.status, "complete");
    assert.equal(manifest.complete, true);
    assert.equal(manifest.entries.length, privateCase.graphValidation.reachableSpokenLineIds.length);
    assert.equal(
      (manifest as { entries: Array<{ lineId: string }> }).entries.some(
        (entry) => examinationLines.some((line) => line.id === entry.lineId),
      ),
      false,
    );
    const firstManifestEntry = (manifest as { entries: Array<{ lineId: string }> }).entries[0]!;
    assert.ok(getDebateMysteryAudioClipV2(db, "user-1", session.id, firstManifestEntry.lineId).byteSize > 0);
    assert.throws(
      () => getDebateMysteryAudioClipV2(db, "another-user", session.id, firstManifestEntry.lineId),
      /not found/iu,
    );

    const providerCallsBeforeOpening = provider.calls;
    const openingDialogue = structuredClone(v2State(session).dialogueHistory.at(-1));
    session = act(db, session, { action: "move" }, "begin-case");
    state = v2State(session);
    assert.equal(state.playPhase, "case_opening");
    assert.deepEqual(state.dialogueHistory.at(-1), openingDialogue, "the compiled briefing is not regenerated at play time");
    assert.deepEqual(
      state.identityMirrorTargetSnapshots[state.config.prosecutorBotId],
      frozenProsecutorIdentity,
      "gameplay reuses the frozen player target instead of mutable Library data",
    );
    assert.throws(
      () => act(db, session, { action: "move", roomId: privateCase.crimeSceneRoomId }, "opening-enter-room"),
      /dismiss the Casekeeper briefing/iu,
    );
    session = act(db, session, { action: "dismiss_case_opening" }, "dismiss-casekeeper-opening");
    state = v2State(session);
    assert.equal(state.playPhase, "investigation");
    assert.equal(state.roomView, "room");
    assert.equal(state.currentRoomId, privateCase.crimeSceneRoomId);
    assert.throws(
      () => act(db, session, { action: "move" }, "map-before-visible-sweep"),
      /finite visible sweep/iu,
    );
    assert.equal(provider.calls, providerCallsBeforeOpening, "opening the case only reuses the compiled briefing");
    const finishRoom = (roomId: string): void => {
      const entered = v2State(session);
      if (entered.roomIntroductions[roomId] === "casekeeper") {
        const silentBeat = entered.dialogueHistory.at(-1)!;
        assert.equal(silentBeat.visibleText, "...");
        assert.equal(silentBeat.delivery, "text_only");
        assert.equal(silentBeat.lineId, "line-room-introduction-" + roomId + "-casekeeper");
        session = act(db, session, { action: "advance_room_introduction", roomId }, `intro-casekeeper-${roomId}`);
        const personaBeat = v2State(session).dialogueHistory.at(-1)!;
        assert.equal(v2State(session).roomIntroductions[roomId], "persona");
        assert.equal(personaBeat.delivery, "spoken");
        assert.ok(personaBeat.lineId?.includes(`room-introduction-${roomId}-persona`));
        assert.equal(personaBeat.speakerBotId, entered.suspects.find((suspect) => suspect.roomId === roomId)?.botId);
        assert.ok((manifest as { entries: Array<{ lineId: string }> }).entries.some(
          (entry) => entry.lineId === personaBeat.lineId,
        ));
        assert.equal((manifest as { entries: Array<{ lineId: string }> }).entries.some(
          (entry) => entry.lineId === silentBeat.lineId,
        ), false);
        session = act(db, session, { action: "complete_room_introduction", roomId }, `intro-persona-${roomId}`);
        assert.equal(v2State(session).roomIntroductions[roomId], "complete");
      }
      for (const hotspot of v2State(session).rooms.find((entry) => entry.id === roomId)!.hotspots.filter((entry) => !entry.examined)) {
        session = act(db, session, { action: "examine", roomId, hotspotId: hotspot.id }, `examine-${roomId}-${hotspot.id}`);
        const observation = v2State(session).dialogueHistory.at(-1)!;
        assert.equal(observation.delivery, "text_only");
        assert.equal(observation.lineId, null);
      }
    };
    finishRoom(privateCase.crimeSceneRoomId);
    assert.equal(v2State(session).openingSweepComplete, true);
    session = act(db, session, { action: "move" }, "open-map-after-visible-sweep");
    assert.equal(v2State(session).roomView, "mansion");
    session = act(db, session, { action: "move", roomId: privateCase.crimeSceneRoomId }, "return-to-crime-scene");

    const visitedRooms = new Set<string>();
    const walkConnectedRooms = (roomId: string): void => {
      visitedRooms.add(roomId);
      finishRoom(roomId);
      const room = v2State(session).rooms.find((entry) => entry.id === roomId)!;
      for (const neighborId of room.neighborIds ?? []) {
        if (visitedRooms.has(neighborId)) continue;
        session = act(db, session, { action: "move", roomId: neighborId }, `walk-${roomId}-${neighborId}`);
        walkConnectedRooms(neighborId);
        session = act(db, session, { action: "move", roomId }, `walk-return-${neighborId}-${roomId}`);
      }
    };
    walkConnectedRooms(privateCase.crimeSceneRoomId);
    assert.equal(visitedRooms.size, v2State(session).rooms.length);

    const moveToRoom = (targetRoomId: string, keyPrefix: string): void => {
      const movementState = v2State(session);
      const startRoomId = movementState.currentRoomId!;
      if (startRoomId === targetRoomId) return;
      const roomsById = new Map(movementState.rooms.map((room) => [room.id, room]));
      const queue: Array<{ roomId: string; path: string[] }> = [{ roomId: startRoomId, path: [] }];
      const seen = new Set([startRoomId]);
      let path: string[] | null = null;
      while (queue.length > 0 && !path) {
        const current = queue.shift()!;
        const direct = roomsById.get(current.roomId)?.neighborIds ?? [];
        const reverse = movementState.rooms
          .filter((room) => (room.neighborIds ?? []).includes(current.roomId))
          .map((room) => room.id);
        for (const neighborId of [...new Set([...direct, ...reverse])]) {
          if (seen.has(neighborId)) continue;
          const nextPath = [...current.path, neighborId];
          if (neighborId === targetRoomId) {
            path = nextPath;
            break;
          }
          seen.add(neighborId);
          queue.push({ roomId: neighborId, path: nextPath });
        }
      }
      assert.ok(path, `room ${targetRoomId} must be connected to ${startRoomId}`);
      for (const [index, roomId] of path.entries()) {
        session = act(db, session, { action: "move", roomId }, `${keyPrefix}-${index}-${roomId}`);
      }
    };
    state = v2State(session);
    const gateRecord = state.record.find((item) =>
      item.admitted && recordReferenceKey(item.reference) === recordReferenceKey(presentationGate.requiredRecord));
    assert.ok(gateRecord, "the pivotal gate record must be reachable before the gate");
    const gateSuspect = state.suspects.find((suspect) => suspect.seatId === presentationGate.requiredSuspectSeatId)!;
    const wrongSuspect = state.suspects.find((suspect) => suspect.seatId !== gateSuspect.seatId)!;
    const wrongGateRecord = state.record.find((item) =>
      item.admitted && recordReferenceKey(item.reference) !== recordReferenceKey(gateRecord.reference));
    assert.ok(wrongGateRecord, "the case should admit a distinct wrong record for the gate check");

    moveToRoom(wrongSuspect.roomId!, "move-wrong-gate-recipient");
    session = act(db, session, {
      action: "present_to_suspect",
      suspectSeatId: wrongSuspect.seatId,
      record: gateRecord.reference,
    }, "present-gate-record-to-wrong-recipient");
    assert.equal(v2State(session).topics.find((topic) => topic.nodeId === gatedTopicTarget.topicNodeId)?.unlocked, false);

    moveToRoom(gateSuspect.roomId!, "move-correct-gate-recipient");
    session = act(db, session, {
      action: "present_to_suspect",
      suspectSeatId: gateSuspect.seatId,
      record: wrongGateRecord.reference,
    }, "present-wrong-record-to-gate-recipient");
    assert.equal(v2State(session).topics.find((topic) => topic.nodeId === gatedTopicTarget.topicNodeId)?.unlocked, false);

    session = act(db, session, {
      action: "present_to_suspect",
      suspectSeatId: gateSuspect.seatId,
      record: gateRecord.reference,
    }, "present-correct-gate-record");
    assert.equal(v2State(session).topics.find((topic) => topic.nodeId === gatedTopicTarget.topicNodeId)?.unlocked, true);

    const firstSuspect = state.suspects[0]!;
    moveToRoom(firstSuspect.roomId!, "move-first-suspect");
    assert.throws(
      () => act(db, session, {
        action: "present_to_suspect",
        suspectSeatId: firstSuspect.seatId,
        record: { kind: "testimony", id: privateCase.recordItems.find((item) => item.reference.kind === "testimony")!.reference.id },
      }, "present-stale-testimony"),
      /not admitted to the Case File/iu,
    );
    const dialogueCountBeforePresent = v2State(session).dialogueHistory.length;
    session = act(db, session, {
      action: "present_to_suspect",
      suspectSeatId: firstSuspect.seatId,
      record: serviceBellRecord.reference,
    }, "present-service-bell-log");
    const serviceBellExchange = v2State(session).dialogueHistory.slice(dialogueCountBeforePresent);
    assert.equal(serviceBellExchange.length, 2);
    assert.match(serviceBellExchange[0]!.visibleText, /Service Bell Log/iu);
    assert.match(serviceBellExchange[1]!.visibleText, /Service Bell Log/iu);
    assert.ok((manifest as { entries: Array<{ lineId: string }> }).entries.some(
      (entry) => entry.lineId === serviceBellExchange[0]!.lineId,
    ));
    assert.ok((manifest as { entries: Array<{ lineId: string }> }).entries.some(
      (entry) => entry.lineId === serviceBellExchange[1]!.lineId,
    ));
    const firstTopic = v2State(session).topics.find((topic) => topic.suspectSeatId === firstSuspect.seatId)!;
    assert.throws(
      () => act(db, session, {
        action: "talk",
        suspectSeatId: firstSuspect.seatId,
        topicNodeId: `${firstTopic.nodeId}-stale`,
      }, "talk-stale-topic"),
      /Talk topic has not unlocked/iu,
    );
    const dialogueCountBeforeTalk = v2State(session).dialogueHistory.length;
    session = act(db, session, { action: "talk", suspectSeatId: firstSuspect.seatId, topicNodeId: firstTopic.nodeId }, "talk-first-suspect");
    state = v2State(session);
    const talkExchange = state.dialogueHistory.slice(dialogueCountBeforeTalk);
    assert.equal(talkExchange.length, 2);
    assert.equal(talkExchange[0]!.speakerSeatId, null);
    assert.equal(talkExchange[0]!.intendedRecipientSeatId, firstSuspect.seatId);
    assert.match(talkExchange[0]!.visibleText, /relationship with Avery Voss/iu);
    assert.equal(talkExchange[1]!.speakerSeatId, firstSuspect.seatId);
    assert.equal(talkExchange[1]!.intendedRecipientBotId, state.config.prosecutorBotId);
    const questionLine = graph.lines.find((line) => line.id === talkExchange[0]!.lineId);
    const responseLine = graph.lines.find((line) => line.id === talkExchange[1]!.lineId);
    assert.equal(questionLine?.speakerKind, "player");
    assert.equal(responseLine?.speakerKind, "bot");
    // Player-authored prosecution speaks through the selected Prosecutor's
    // exact frozen bot profile, never the account-wide Prism fallback.
    assert.notEqual(preparedProfilesByText.get(questionLine!.spokenText)?.baseVoiceId, "voice-5");
    assert.ok((manifest as { entries: Array<{ lineId: string }> }).entries.some((entry) => entry.lineId === questionLine?.id));
    assert.ok((manifest as { entries: Array<{ lineId: string }> }).entries.some((entry) => entry.lineId === responseLine?.id));
    const dialogueCountBeforeRepeat = state.dialogueHistory.length;
    const discoveryIdsBeforeRepeat = [...state.discoveryIds];
    session = act(db, session, { action: "talk", suspectSeatId: firstSuspect.seatId, topicNodeId: firstTopic.nodeId }, "talk-repeat-suspect");
    state = v2State(session);
    const repeatedExchange = state.dialogueHistory.slice(dialogueCountBeforeRepeat);
    assert.equal(repeatedExchange.length, 2);
    const repeatedResponse = repeatedExchange[1]!;
    const repeatedResponseLine = graph.lines.find((line) => line.id === repeatedResponse.lineId)!;
    assert.match(repeatedResponse.visibleText, /like i said before|as i said|still going on about that/iu);
    assert.equal(repeatedResponse.visibleText, repeatedResponseLine.spokenText);
    assert.ok((manifest as { entries: Array<{ lineId: string; botId?: string | null }> }).entries.some(
      (entry) => entry.lineId === repeatedResponseLine.id && entry.botId === firstSuspect.botId,
    ));
    assert.deepEqual(state.discoveryIds, discoveryIdsBeforeRepeat, "a repeated answer must not reapply topic mutations");
    assert.equal(state.theoryAvailable, true);
    session = act(db, session, {
      action: "file_theory",
      theory: {
        culpritSeatId: privateCase.sealedCulpritSeatId,
        accompliceSeatId: privateCase.sealedAccompliceSeatId,
        method: "",
        motive: "",
        opportunity: "",
        evidenceIds: v2State(session).record.filter((item) => item.reference.kind === "evidence").map((item) => item.reference.id),
        testimonyIds: [],
      },
    }, "file-theory");

    state = v2State(session);
    const firstChapter = graph.witnessChapters.find((chapter) => chapter.id === state.court?.activeChapterId)!;
    const firstProofStatement = firstChapter.statementVersions.find((statement) => statement.correctPresentations.length > 0)!;
    session = act(db, session, { action: "focus_statement", statementId: firstProofStatement.statementId }, "focus-wrong");
    const wrongRecord = v2State(session).record.find((item) =>
      !firstProofStatement.correctPresentations.some((reference) => `${reference.kind}:${reference.id}` === `${item.reference.kind}:${item.reference.id}`),
    )!.reference;
    for (let strike = 0; strike < 4; strike += 1) {
      session = act(db, session, { action: "present_record", statementId: firstProofStatement.statementId, record: wrongRecord }, `wrong-${strike}`);
    }
    assert.equal(v2State(session).verdict?.legalResult, "not_guilty");
    session = act(db, session, { action: "retry_witness_checkpoint" }, "retry-witness");

    while (v2State(session).playPhase === "trial") {
      state = v2State(session);
      const chapter = graph.witnessChapters.find((entry) => entry.id === state.court?.activeChapterId)!;
      const proofStatement = chapter.statementVersions.find((statement) => statement.correctPresentations.length > 0)!;
      session = act(db, session, { action: "focus_statement", statementId: proofStatement.statementId }, `focus-${chapter.id}`);
      session = act(db, session, { action: "press_statement", statementId: proofStatement.statementId }, `press-${chapter.id}`);
      const pendingChoice = v2State(session).pendingProsecutionChoice;
      if (pendingChoice) {
        session = act(db, session, {
          action: "choose_prosecution_response",
          choiceId: pendingChoice.id,
          optionId: pendingChoice.options[0]!.id,
        }, `choice-${chapter.id}`);
      }
      session = act(db, session, {
        action: "present_record",
        statementId: proofStatement.statementId,
        record: proofStatement.correctPresentations[0]!,
      }, `correct-${chapter.id}`);
    }
    state = v2State(session);
    assert.equal(state.playPhase, "verdict");
    assert.equal(state.court?.completedChapterIds.length, graph.witnessChapters.length);
    assert.ok(state.calloutHistory.some((callout) => callout.callout === "hold_it"));
    assert.ok(state.calloutHistory.some((callout) => callout.callout === "testimony_revised"));
    assert.equal(provider.calls, callsAfterCompile, "gameplay must not call the LLM");
    const archivedCaseBeforeReadiness = getDebateMysteryCaseV2(db, "user-1", session.id);
    const archivedReadiness = await ensureDebateMysteryPlayReadyV2(db, "user-1", session.id, {
      generateWave: async () => {
        throw new Error("completed Archive must not rebuild local audio");
      },
    });
    assert.equal(archivedReadiness.revision, session.revision);
    assert.deepEqual(
      getDebateMysteryCaseV2(db, "user-1", session.id),
      archivedCaseBeforeReadiness,
      "completed Archive/replay artifacts must remain immutable",
    );
    const archiveRow = listDebateSessions(db, "user-1").find((entry) => entry.id === session.id)!;
    assert.equal(archiveRow.mysteryProgress, "verdict");
    assert.equal(archiveRow.mysteryRouteGrade, state.verdict?.classification);
    assert.equal(archiveRow.title, state.caseTitle);

    const uniqueClipCount = Number((db.prepare(
      "SELECT COUNT(DISTINCT cache_key) AS count FROM debate_mystery_audio_refs WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { count: number }).count);
    const referencedStorage = getDebateMysteryAudioStorageSummaryV2(db, "user-1");
    assert.equal(referencedStorage.referencedClipCount, uniqueClipCount);
    assert.equal(referencedStorage.cleanupCandidateCount, 0);
    const backupKey = Buffer.alloc(32, 7);
    const sealedRoomBytes = Buffer.from("sealed-room-backup-bytes");
    sealDebateMysteryAssetBytesV1(db, backupKey, {
      userId: "user-1",
      sessionId: session.id,
      kind: "room",
      subjectId: state.rooms[0]!.id,
      bytes: sealedRoomBytes,
      provider: "openai",
      model: "gpt-image-test",
      review: { attempt: 1, vision: { approved: true } },
    });
    revealDebateMysteryAssetV1(
      db,
      "user-1",
      session.id,
      "room",
      state.rooms[0]!.id,
    );
    const backup = exportUserSnapshot(db, "user-1", backupKey);
    assert.equal(backup.debates?.mysteryV2?.cases.length, 1);
    assert.equal(backup.debates?.mysteryV2?.manifests[0]?.status, "complete");
    assert.equal(backup.debates?.mysteryV2?.clips.length, uniqueClipCount);
    assert.equal(backup.debates?.mysteryAssets?.assets.length, 1);
    db.prepare("DELETE FROM debate_sessions WHERE user_id = 'user-1' AND id = ?").run(session.id);
    const releasedStorage = getDebateMysteryAudioStorageSummaryV2(db, "user-1");
    assert.equal(releasedStorage.referencedClipCount, 0);
    assert.equal(releasedStorage.cleanupCandidateCount, uniqueClipCount);
    importUserSnapshot(db, "user-1", backup, backupKey);
    const restoredCase = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(restoredCase.graph.caseId, graph.caseId);
    assert.ok(getDebateMysteryAudioClipV2(db, "user-1", session.id, firstManifestEntry.lineId).byteSize > 0);
    assert.equal(getDebateMysteryAudioStorageSummaryV2(db, "user-1").referencedClipCount, uniqueClipCount);
    assert.deepEqual(
      getRevealedDebateMysteryAssetFileV1(
        db,
        backupKey,
        "user-1",
        session.id,
        "room",
        state.rooms[0]!.id,
      ).bytes,
      sealedRoomBytes,
    );
    db.prepare("DELETE FROM debate_sessions WHERE user_id = 'user-1' AND id = ?").run(session.id);
    const cleanup = cleanupUnreferencedDebateMysteryAudioV2(db, "user-1");
    assert.equal(cleanup.removedClipCount, uniqueClipCount);
    assert.equal(cleanup.remaining.cleanupCandidateCount, 0);
  });

  it("repairs cross-wired Case File titles in an active case without authoring", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-present-title-repair",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    const callsAfterCompile = provider.calls;
    const compiled = getDebateMysteryCaseV2(db, "user-1", session.id);
    const graph = structuredClone(compiled.graph);
    const evidenceRecords = compiled.privateCase.recordItems.filter((item) =>
      item.reference.kind === "evidence");
    assert.ok(evidenceRecords.length >= 2, "the repair fixture needs two named Case File records");
    const selectedRecord = evidenceRecords[0]!;
    const wrongRecord = evidenceRecords[1]!;
    const suspect = v2State(session).suspects[0]!;
    const mappingKey = `${suspect.seatId}:${selectedRecord.reference.kind}:${selectedRecord.reference.id}`;
    const promptNodeId = compiled.privateCase.presentNodeIdBySuspectRecord[mappingKey]!;
    const promptNode = graph.nodes.find((node) => node.id === promptNodeId)!;
    const responseNode = graph.nodes.find((node) => node.id === promptNode.nextNodeIds[0])!;
    const promptLine = graph.lines.find((line) => line.id === promptNode.lineId)!;
    const responseLine = graph.lines.find((line) => line.id === responseNode.lineId)!;
    const crosswiredPrompt = `Let's focus on the ${selectedRecord.title}. The ${wrongRecord.title} is the record I want you to answer.`;
    const crosswiredResponse = `Regarding the ${selectedRecord.title}: The ${wrongRecord.title} appears to have been treated with more respect than its owner.`;
    promptLine.visibleText = crosswiredPrompt;
    promptLine.spokenText = crosswiredPrompt;
    responseLine.visibleText = crosswiredResponse;
    responseLine.spokenText = crosswiredResponse;
    const graphJson = JSON.stringify(graph);
    db.prepare(
      `UPDATE debate_mystery_v2_cases
          SET dialogue_graph_json = ?, graph_hash = ?
        WHERE user_id = ? AND session_id = ?`,
    ).run(graphJson, digest(graphJson), "user-1", session.id);

    const locallyPreparedTexts: string[] = [];
    const repairedSession = await ensureDebateMysteryPlayReadyV2(db, "user-1", session.id, {
      generateWave: async ({ text }) => {
        locallyPreparedTexts.push(text);
        return playableWave();
      },
    });
    assert.equal(provider.calls, callsAfterCompile, "the deterministic repair must not call the authoring LLM");
    assert.equal(v2State(repairedSession).readiness.status, "ready");
    const repaired = getDebateMysteryCaseV2(db, "user-1", session.id);
    assert.equal(repaired.privateCase.presentNodeIdBySuspectRecord[mappingKey], promptNodeId);
    const repairedPromptLine = repaired.graph.lines.find((line) => line.id === promptLine.id)!;
    const repairedResponseLine = repaired.graph.lines.find((line) => line.id === responseLine.id)!;
    assert.match(repairedPromptLine.spokenText, new RegExp(selectedRecord.title, "iu"));
    assert.doesNotMatch(repairedPromptLine.spokenText, new RegExp(wrongRecord.title, "iu"));
    assert.match(repairedResponseLine.spokenText, new RegExp(selectedRecord.title, "iu"));
    assert.doesNotMatch(repairedResponseLine.spokenText, new RegExp(wrongRecord.title, "iu"));
    assert.ok(locallyPreparedTexts.includes(repairedResponseLine.spokenText));
  });

  it("migrates an active legacy partner-shaped case and rebuilds only local player-role audio", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), trialType: "bench", jurorBotIds: [] },
      "create-v2-legacy-role-repair",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      { generateWave: async () => playableWave() },
    );
    const callsAfterCompile = provider.calls;
    const compiled = getDebateMysteryCaseV2(db, "user-1", session.id);
    const legacyPrivate = structuredClone(compiled.privateCase);
    const legacyGraph = structuredClone(compiled.graph);
    const legacyRoomIntroductionNodeIds = new Set(Object.values(legacyGraph.roomIntroductionNodeIdsByRoom ?? {})
      .flatMap((introduction) => [introduction.casekeeperNodeId, introduction.personaNodeId]));
    const legacyRoomIntroductionLineIds = new Set(legacyGraph.nodes.flatMap((node) =>
      legacyRoomIntroductionNodeIds.has(node.id) && node.lineId ? [node.lineId] : []));
    delete legacyGraph.roomIntroductionNodeIdsByRoom;
    legacyGraph.nodes = legacyGraph.nodes.filter((node) => !legacyRoomIntroductionNodeIds.has(node.id));
    legacyGraph.lines = legacyGraph.lines.filter((line) => !legacyRoomIntroductionLineIds.has(line.id));
    legacyGraph.interactionRootNodeIds = legacyGraph.interactionRootNodeIds.filter(
      (nodeId) => !legacyRoomIntroductionNodeIds.has(nodeId),
    );
    const legacyServiceBellRecord = legacyPrivate.recordItems.find((item) => item.title === "Service Bell Log")!;
    legacyServiceBellRecord.title = "Bloodied Lead Pipe";
    delete legacyPrivate.investigationProgressionContractVersion;
    delete legacyPrivate.investigationRoomIds;
    delete legacyPrivate.investigationHotspotIdsByRoom;
    delete legacyPrivate.investigationPersonIds;
    delete legacyGraph.presentationGates;
    delete legacyGraph.retiredTalkNodeIds;
    for (const topicNodeIds of Object.values(legacyGraph.talkTopicNodeIdsBySuspect)) {
      for (const activeTopicNodeId of topicNodeIds) {
        delete legacyGraph.nodes.find((node) => node.id === activeTopicNodeId)?.talkSubject;
      }
    }
    const firstSeatId = legacyPrivate.actorAccounts[0]!.seatId;
    const firstSeatTopicNodeIds = legacyGraph.talkTopicNodeIdsBySuspect[firstSeatId]!;
    const evidenceMirroringTopicNodeId = firstSeatTopicNodeIds[1]!;
    const preservedRoomTopicNodeId = firstSeatTopicNodeIds[2]!;
    const finalTopicNodeId = firstSeatTopicNodeIds.at(-1)!;
    const evidenceMirroringTopicNode = legacyGraph.nodes.find((node) => node.id === evidenceMirroringTopicNodeId)!;
    evidenceMirroringTopicNode.label = "The lead pipe";
    const evidenceMirroringResponseNode = legacyGraph.nodes.find(
      (node) => node.id === evidenceMirroringTopicNode.nextNodeIds[0],
    )!;
    evidenceMirroringResponseNode.mutations.unlockTopicIds = [preservedRoomTopicNodeId];
    const preservedRoomTopicNode = legacyGraph.nodes.find((node) => node.id === preservedRoomTopicNodeId)!;
    const preservedRoomResponseNode = legacyGraph.nodes.find(
      (node) => node.id === preservedRoomTopicNode.nextNodeIds[0],
    )!;
    preservedRoomResponseNode.mutations.unlockTopicIds = [finalTopicNodeId];
    const legacyPresentMappingKey = `${legacyPrivate.actorAccounts[0]!.seatId}:${legacyServiceBellRecord.reference.kind}:${legacyServiceBellRecord.reference.id}`;
    const legacyPresentNodeId = legacyPrivate.presentNodeIdBySuspectRecord[legacyPresentMappingKey]!;
    const legacyPresentNode = legacyGraph.nodes.find((node) => node.id === legacyPresentNodeId)!;
    const legacyPresentResponseNodeId = legacyPresentNode.nextNodeIds[0]!;
    const removedPresentLineIds = new Set(
      [legacyPresentNodeId, legacyPresentResponseNodeId].flatMap((nodeId) => {
        const node = legacyGraph.nodes.find((entry) => entry.id === nodeId);
        return node?.lineId ? [node.lineId] : [];
      }),
    );
    delete legacyPrivate.presentNodeIdBySuspectRecord[legacyPresentMappingKey];
    legacyGraph.nodes = legacyGraph.nodes.filter((node) =>
      node.id !== legacyPresentNodeId && node.id !== legacyPresentResponseNodeId,
    );
    legacyGraph.lines = legacyGraph.lines.filter((line) => !removedPresentLineIds.has(line.id));
    legacyGraph.interactionRootNodeIds = legacyGraph.interactionRootNodeIds.filter((nodeId) => nodeId !== legacyPresentNodeId);
    legacyGraph.presentNodeIdsBySuspect[legacyPrivate.actorAccounts[0]!.seatId] =
      legacyGraph.presentNodeIdsBySuspect[legacyPrivate.actorAccounts[0]!.seatId]!.filter((nodeId) => nodeId !== legacyPresentNodeId);
    const repeatNodeIds = new Set(Object.values(legacyGraph.repeatResponseNodeIdsByTopic ?? {}).flat());
    delete legacyGraph.repeatResponseNodeIdsByTopic;
    const repeatLineIds = new Set(legacyGraph.nodes.flatMap((node) =>
      repeatNodeIds.has(node.id) && node.lineId ? [node.lineId] : [],
    ));
    legacyGraph.nodes = legacyGraph.nodes.filter((node) => !repeatNodeIds.has(node.id));
    legacyGraph.lines = legacyGraph.lines.filter((line) => !repeatLineIds.has(line.id));
    const prosecutorBotId = legacyPrivate.config.prosecutorBotId;
    const privateConfig = legacyPrivate.config as unknown as Record<string, unknown>;
    privateConfig.prosecutorPartnerBotId = prosecutorBotId;
    delete privateConfig.prosecutorBotId;
    delete (legacyPrivate as unknown as Record<string, unknown>).playerRoleContractVersion;

    const topicNodeId = legacyGraph.talkTopicNodeIdsBySuspect[firstSeatId]![0]!;
    const topicNode = legacyGraph.nodes.find((node) => node.id === topicNodeId)!;
    const responseNodeId = topicNode.nextNodeIds[0]!;
    const responseNode = legacyGraph.nodes.find((node) => node.id === responseNodeId)!;
    const responseLine = legacyGraph.lines.find((line) => line.id === responseNode.lineId)!;
    const topicLabel = topicNode.label;
    Object.assign(topicNode, structuredClone(responseNode), {
      id: topicNodeId,
      label: topicLabel,
      speakerSeatId: firstSeatId,
      intendedRecipientSeatId: null,
    });
    responseLine.nodeId = topicNode.id;
    legacyGraph.nodes = legacyGraph.nodes.filter((node) => node.id !== responseNode.id);
    for (const line of legacyGraph.lines) {
      if (line.speakerKind === "player") line.speakerBotId = null;
    }

    const privateJson = JSON.stringify(legacyPrivate);
    const graphJson = JSON.stringify(legacyGraph);
    db.prepare(
      `UPDATE debate_mystery_v2_cases
          SET private_case_json = ?, dialogue_graph_json = ?, case_hash = ?, graph_hash = ?
        WHERE session_id = ?`,
    ).run(privateJson, graphJson, digest(privateJson), digest(graphJson), session.id);
    const legacySession = structuredClone(session);
    const publicConfig = legacySession.formatState.config as unknown as Record<string, unknown>;
    publicConfig.prosecutorPartnerBotId = prosecutorBotId;
    delete publicConfig.prosecutorBotId;
    delete (legacySession.formatState as unknown as Record<string, unknown>).roomIntroductions;
    for (const topic of legacySession.formatState.topics) {
      delete (topic as Partial<typeof topic>).subject;
      if (topic.nodeId === evidenceMirroringTopicNodeId) topic.label = "The lead pipe";
    }
    const publicLeadPipeRecord = legacySession.formatState.record.find((item) =>
      recordReferenceKey(item.reference) === recordReferenceKey(legacyServiceBellRecord.reference));
    if (publicLeadPipeRecord) publicLeadPipeRecord.title = "Bloodied Lead Pipe";
    legacySession.formatState.readiness = {
      version: 1,
      status: "repair_required",
      spoilerSafeMessage: "Preparing this local case for the current player-role contract",
      contractHash: null,
      checkedAt: null,
    };
    db.prepare("UPDATE debate_sessions SET session_json = ? WHERE id = ?")
      .run(JSON.stringify(legacySession), session.id);
    const changedVoice = {
      ...DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      baseVoiceId: "voice-8" as const,
      pitch: 0.62,
    };
    db.prepare("UPDATE bots SET audio_voice_profile_override = ? WHERE user_id = 'user-1' AND id = ?")
      .run(JSON.stringify(changedVoice), prosecutorBotId);

    const locallyPreparedTexts: string[] = [];
    const repaired = await ensureDebateMysteryPlayReadyV2(db, "user-1", session.id, {
      generateWave: async ({ text }) => {
        locallyPreparedTexts.push(text);
        return playableWave();
      },
    });
    assert.equal(provider.calls, callsAfterCompile, "active-case repair must not call the authoring LLM");
    assert.equal(
      v2State(repaired).readiness.status,
      "ready",
      v2State(repaired).localAudioFailure ?? undefined,
    );
    assert.equal(v2State(repaired).config.prosecutorBotId, prosecutorBotId);
    assert.equal("prosecutorPartnerBotId" in v2State(repaired).config, false);
    assert.ok(locallyPreparedTexts.length > 0, "the changed Prosecutor profile must rebuild affected local clips");

    const migrated = getDebateMysteryCaseV2(db, "user-1", session.id);
    const repairedUnvisitedSuspectRoom = v2State(repaired).rooms.find((room) =>
      !room.visited && v2State(repaired).suspects.some((suspect) => suspect.roomId === room.id));
    assert.ok(repairedUnvisitedSuspectRoom, "the compatibility fixture needs an unvisited suspect room");
    assert.equal(v2State(repaired).roomIntroductions[repairedUnvisitedSuspectRoom.id], "unseen");
    assert.ok(migrated.graph.roomIntroductionNodeIdsByRoom?.[repairedUnvisitedSuspectRoom.id]);
    assert.equal(
      migrated.graph.talkTopicNodeIdsBySuspect[firstSeatId]?.includes(evidenceMirroringTopicNodeId),
      false,
      "an evidence-mirroring legacy Talk subject must retire from the playable tray",
    );
    assert.equal(
      v2State(repaired).topics.some((topic) => topic.nodeId === evidenceMirroringTopicNodeId),
      false,
      "the retired evidence subject must not remain in the public Talk payload",
    );
    assert.ok(
      migrated.graph.nodes.some((node) => node.id === evidenceMirroringTopicNodeId),
      "frozen legacy node IDs must stay available for active history and audio",
    );
    assert.ok(migrated.graph.retiredTalkNodeIds?.includes(evidenceMirroringTopicNodeId));
    const migratedRoomTopic = v2State(repaired).topics.find((topic) => topic.nodeId === preservedRoomTopicNodeId);
    assert.equal(migratedRoomTopic?.subject.category, "room");
    assert.ok(
      migratedRoomTopic?.subject.category === "room" &&
      v2State(repaired).rooms.some((room) => room.id === migratedRoomTopic.subject.roomId),
      "legacy room subjects must retain a real room reference",
    );
    const inferredLeadPipeGate = migrated.graph.presentationGates?.find((gate) =>
      gate.requiredSuspectSeatId === firstSeatId &&
      recordReferenceKey(gate.requiredRecord) === recordReferenceKey(legacyServiceBellRecord.reference));
    assert.ok(inferredLeadPipeGate, "legacy unlock mutations must become a private exact Present gate");
    assert.ok(inferredLeadPipeGate.unlocks.some((target) =>
      target.kind === "topic" && target.topicNodeId === preservedRoomTopicNodeId));
    assert.doesNotMatch(
      JSON.stringify(repaired.formatState),
      /presentationGates|requiredSuspectSeatId|correctPresentNodeId|requiredRecord/iu,
    );
    const migratedExchange = resolveDebateMysteryTalkExchangeV2(
      migrated.graph,
      topicNodeId,
      firstSeatId,
    );
    assert.equal(migratedExchange?.questionNodeId, topicNodeId);
    const migratedQuestionNode = migrated.graph.nodes.find((node) => node.id === topicNodeId)!;
    const migratedQuestionLine = migrated.graph.lines.find((line) => line.id === migratedQuestionNode.lineId)!;
    assert.equal(migratedQuestionLine.speakerKind, "player");
    assert.equal(migratedQuestionLine.speakerBotId, prosecutorBotId);
    assert.ok(migratedQuestionLine.stageActionText);
    const legacyRepeat = resolveDebateMysteryTalkExchangeV2(
      migrated.graph,
      topicNodeId,
      firstSeatId,
      1,
    );
    const legacyRepeatLine = migrated.graph.lines.find(
      (line) => line.nodeId === legacyRepeat?.responseNodeId,
    )!;
    const migratedOriginal = resolveDebateMysteryTalkExchangeV2(
      migrated.graph,
      topicNodeId,
      firstSeatId,
    );
    const migratedOriginalLine = migrated.graph.lines.find(
      (line) => line.nodeId === migratedOriginal?.responseNodeId,
    )!;
    assert.match(legacyRepeatLine.spokenText, /like i said|already told you|said this once|still going on|already said|answered that before|to repeat myself|answer has not changed|already explained/iu);
    assert.equal(legacyRepeatLine.speakerBotId, migratedOriginalLine.speakerBotId);
    assert.ok(locallyPreparedTexts.includes(legacyRepeatLine.spokenText));
    const repairedPresentNodeId = migrated.privateCase.presentNodeIdBySuspectRecord[legacyPresentMappingKey];
    assert.ok(repairedPresentNodeId, "legacy readiness repair must materialize the missing Present mapping");
    const repairedPresentNode = migrated.graph.nodes.find((node) => node.id === repairedPresentNodeId)!;
    const repairedPresentPrompt = migrated.graph.lines.find((line) => line.id === repairedPresentNode.lineId)!;
    const repairedPresentResponse = migrated.graph.lines.find((line) =>
      line.nodeId === repairedPresentNode.nextNodeIds[0],
    )!;
    assert.match(repairedPresentPrompt.visibleText, /Bloodied Lead Pipe/iu);
    assert.match(repairedPresentPrompt.spokenText, /Bloodied Lead Pipe/iu);
    assert.match(repairedPresentResponse.visibleText, /Bloodied Lead Pipe/iu);
    assert.match(repairedPresentResponse.spokenText, /Bloodied Lead Pipe/iu);
    const manifestRow = db.prepare(
      "SELECT status, manifest_json FROM debate_mystery_audio_manifests WHERE session_id = ?",
    ).get(session.id) as { status: string; manifest_json: string };
    const repairedManifest = JSON.parse(manifestRow.manifest_json) as {
      complete: boolean;
      entries: Array<{ lineId: string; botId: string | null }>;
    };
    assert.equal(manifestRow.status, "complete");
    assert.equal(repairedManifest.complete, true);
    assert.equal(
      repairedManifest.entries.find((entry) => entry.lineId === migratedQuestionLine.id)?.botId,
      prosecutorBotId,
    );
    assert.ok(repairedManifest.entries.some((entry) => entry.lineId === repairedPresentPrompt.id));
    assert.ok(repairedManifest.entries.some((entry) => entry.lineId === repairedPresentResponse.id));
  });

  it("resumes interrupted local preparation without rebuilding verified clips", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), trialType: "bench", jurorBotIds: [] },
      "create-v2-interrupted-audio",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    let firstPassCalls = 0;
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      {
        generateWave: async () => {
          firstPassCalls += 1;
          if (firstPassCalls === 4) throw new Error("simulated local worker interruption");
          return playableWave();
        },
      },
    );
    assert.equal(v2State(session).compilation.stage, "needs_attention");
    assert.equal(v2State(session).compilation.publicFailureCode, "CASE_FORGE_LOCAL_AUDIO_FAILED");
    assert.equal(v2State(session).compilation.publicFailureStage, "preparing_local_voices");
    assert.match(v2State(session).localAudioFailure ?? "", /complete text case is safe/u);
    const partialRow = db.prepare(
      "SELECT manifest_json FROM debate_mystery_audio_manifests WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { manifest_json: string };
    const partial = JSON.parse(partialRow.manifest_json) as { entries: Array<{ lineId: string; sha256: string }> };
    assert.equal(partial.entries.length, 3);

    await retryDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      { deferBackgroundStart: true },
    );
    let resumedCalls = 0;
    session = await runDebateMysteryCompilationV2(
      db,
      "user-1",
      session.id,
      runtime(provider),
      {
        generateWave: async () => {
          resumedCalls += 1;
          return playableWave();
        },
      },
    );
    const resumedState = v2State(session);
    assert.equal(resumedState.compilation.stage, "complete");
    assert.ok(resumedCalls > 0);
    assert.ok(
      resumedCalls <= resumedState.compilation.requiredAudioCount - partial.entries.length,
      "resume may also reuse exact verified clips already present in the account cache",
    );
    const completeRow = db.prepare(
      "SELECT manifest_json FROM debate_mystery_audio_manifests WHERE user_id = 'user-1' AND session_id = ?",
    ).get(session.id) as { manifest_json: string };
    const complete = JSON.parse(completeRow.manifest_json) as { entries: Array<{ lineId: string; sha256: string }> };
    for (const entry of partial.entries) {
      assert.equal(complete.entries.find((candidate) => candidate.lineId === entry.lineId)?.sha256, entry.sha256);
    }
  });

  it("lets Spectator review an editable authorized partner theory before watch-only court", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      { ...config(), playerRole: "spectator" },
      "create-v2-spectator",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    assert.equal(session.playerRole, "spectator");
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    const spectatorFailure = db.prepare(
      "SELECT private_error FROM debate_mystery_v2_jobs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { private_error: string | null };
    assert.equal(v2State(session).compilation.stage, "complete", spectatorFailure.private_error ?? undefined);
    const callsAfterCompile = provider.calls;
    const compiled = getDebateMysteryCaseV2(db, "user-1", session.id);
    const compiledState = v2State(session);
    assert.equal(compiledState.compilation.substeps.some((substep) => substep.id === "room-details"), false);
    assert.deepEqual(compiledState.rooms, []);
    assert.deepEqual(compiledState.topics, []);
    assert.deepEqual(compiled.privateCase.investigationRoomIds, []);
    assert.deepEqual(compiled.privateCase.investigationHotspotIdsByRoom, {});
    assert.deepEqual(compiled.privateCase.investigationPersonIds, []);
    assert.equal(provider.sections.includes("room_examinations"), false);
    assert.equal(compiled.graph.nodes.some((node) => node.scene === "investigation"), false);
    assert.equal(compiled.graph.nodes.some((node) => [
      "briefing",
      "examination_result",
      "room_introduction",
      "talk_topic",
      "present_reaction",
    ].includes(node.kind)), false);
    assert.ok(compiled.graph.prosecutionChoices.length > 0);
    assert.ok(compiled.graph.prosecutionChoices.every((choice) => choice.options.length === 1));
    const spectatorAuthoringRequests = provider.requests.filter((request) =>
      request.section === "suspect_chapter");
    assert.ok(spectatorAuthoringRequests.length > 0);
    for (const request of spectatorAuthoringRequests) {
      const setup = request.setup as { roomNames?: unknown[]; examinationIds?: unknown[] };
      assert.deepEqual(setup.roomNames, []);
      assert.deepEqual(setup.examinationIds, []);
      assert.doesNotMatch(
        JSON.stringify(request.outputContract),
        /roomIntroduction|talkTopics|presentReactions|defaultPresent/iu,
      );
    }
    const prosecutionRequest = provider.requests.find((request) =>
      request.section === "prosecution_choices");
    const prosecutionContract = prosecutionRequest?.outputContract as {
      prosecutionChoices?: {
        itemShape?: { options?: { minimumItems?: number; maximumItems?: number } };
      };
    };
    assert.equal(prosecutionContract.prosecutionChoices?.itemShape?.options?.minimumItems, 1);
    assert.equal(prosecutionContract.prosecutionChoices?.itemShape?.options?.maximumItems, 1);
    const manifestRow = db.prepare(
      "SELECT manifest_json FROM debate_mystery_audio_manifests WHERE user_id = ? AND session_id = ?",
    ).get("user-1", session.id) as { manifest_json: string };
    const manifest = JSON.parse(manifestRow.manifest_json) as { entries: Array<{ lineId: string }> };
    assert.deepEqual(
      new Set(manifest.entries.map((entry) => entry.lineId)),
      new Set(compiled.privateCase.graphValidation.reachableSpokenLineIds),
    );
    assert.equal(
      manifest.entries.some((entry) => entry.lineId === "line-choice-define-the-conflict-demeanor-option"),
      false,
    );
    const authorized = debateMysterySpectatorEvidenceReferencesV2(compiled.graph)
      .map((reference) => `${reference.kind}:${reference.id}`)
      .sort();

    session = act(db, session, { action: "move" }, "spectator-review-findings");
    let state = v2State(session);
    assert.equal(state.playPhase, "theory");
    assert.deepEqual(state.rooms, []);
    assert.deepEqual(state.topics, []);
    assert.equal(state.theoryAvailable, true);
    assert.equal(state.theory?.culpritSeatId, compiled.privateCase.sealedCulpritSeatId);
    assert.equal(state.theory?.accompliceSeatId, null);
    assert.equal(state.theoryFiledAt, null);
    assert.equal(state.court, null);
    assert.deepEqual(state.theory?.testimonyIds, []);
    assert.deepEqual(
      state.record.map((item) => `${item.reference.kind}:${item.reference.id}`).sort(),
      authorized,
    );
    const publicJson = JSON.stringify(state);
    assert.doesNotMatch(publicJson, /sealedCulpritSeatId|sealedAccompliceSeatId|actorAccounts|correctPresentations|graphValidation/iu);
    assert.throws(
      () => act(db, session, { action: "move" }, "spectator-return-mansion"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, {
        action: "press_statement",
        statementId: "not-in-court",
      }, "spectator-manual-press"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, { action: "advance_spectator_trial" }, "spectator-advance-before-filing"),
      /only allows reviewing and filing/iu,
    );

    const alternateAccused = state.suspects.find(
      (suspect) => suspect.seatId !== state.theory!.culpritSeatId,
    )!;
    session = act(db, session, {
      action: "file_theory",
      theory: {
        ...state.theory!,
        culpritSeatId: alternateAccused.seatId,
        motive: "A revised public motive hypothesis.",
        accompliceSeatId: state.suspects[1]!.seatId,
        evidenceIds: [...state.theory!.evidenceIds, "private-forged-id"],
        testimonyIds: ["not-yet-heard"],
      },
    }, "spectator-file-theory");
    state = v2State(session);
    assert.equal(state.playPhase, "trial");
    assert.equal(state.theoryAvailable, false);
    assert.equal(state.theory?.culpritSeatId, alternateAccused.seatId);
    assert.equal(state.theory?.motive, "A revised public motive hypothesis.");
    assert.equal(state.theory?.accompliceSeatId, null);
    assert.deepEqual(state.theory?.evidenceIds.sort(), authorized.map((key) => key.replace(/^evidence:/u, "")).sort());
    assert.deepEqual(state.theory?.testimonyIds, []);
    assert.ok(state.theoryFiledAt);
    assert.ok(state.court?.activeStatementId);
    assert.throws(
      () => act(db, session, {
        action: "press_statement",
        statementId: state.court!.activeStatementId!,
      }, "spectator-manual-court-after-filing"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, { action: "retry_witness_checkpoint" }, "spectator-retry-court"),
      /only allows reviewing and filing/iu,
    );

    let advances = 0;
    while (v2State(session).playPhase === "trial" && advances < 40) {
      session = act(
        db,
        session,
        { action: "advance_spectator_trial" },
        `spectator-advance-${advances}`,
      );
      advances += 1;
    }
    state = v2State(session);
    assert.equal(state.playPhase, "verdict");
    assert.equal(state.court?.completedChapterIds.length, compiled.graph.witnessChapters.length);
    const heardLineIds = new Set(state.dialogueHistory.flatMap((entry) =>
      entry.lineId ? [entry.lineId] : [],
    ));
    for (const item of state.record.filter((entry) => entry.reference.kind === "testimony")) {
      const statement = compiled.graph.witnessChapters
        .flatMap((chapter) => chapter.statementVersions)
        .find((entry) => entry.statementId === item.reference.id && entry.version === 1);
      assert.ok(statement && heardLineIds.has(statement.lineId), "public testimony must be heard before admission");
    }
    assert.equal(provider.calls, callsAfterCompile, "Spectator playback must use the compiled graph only");
    assert.throws(
      () => act(db, session, {
        action: "file_theory",
        theory: state.theory!,
      }, "spectator-refile-after-verdict"),
      /only allows reviewing and filing/iu,
    );
    assert.throws(
      () => act(db, session, { action: "advance_spectator_trial" }, "spectator-after-verdict"),
      /only allows reviewing and filing/iu,
    );
  });

  it("creates immutable zero-synthesis runs with shared audio and one open run per family", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const source = await completedSpectatorCase(db, provider, "play-again");
    const callsAfterCompile = provider.calls;
    const sourceSessionJson = (db.prepare(
      "SELECT session_json FROM debate_sessions WHERE user_id = ? AND id = ?",
    ).get("user-1", source.id) as { session_json: string }).session_json;
    const sourceActions = db.prepare(
      `SELECT sequence, action_kind, public_payload_json
         FROM debate_mystery_actions
        WHERE user_id = ? AND session_id = ?
        ORDER BY sequence`,
    ).all("user-1", source.id);
    const sourceCaseRow = db.prepare(
      `SELECT private_case_json, dialogue_graph_json, case_hash, graph_hash,
              case_family_id, run_ordinal
         FROM debate_mystery_v2_cases
        WHERE user_id = ? AND session_id = ?`,
    ).get("user-1", source.id) as {
      private_case_json: string;
      dialogue_graph_json: string;
      case_hash: string;
      graph_hash: string;
      case_family_id: string;
      run_ordinal: number;
    };
    const sourceAudioKeys = (db.prepare(
      `SELECT cache_key
         FROM debate_mystery_audio_refs
        WHERE user_id = ? AND session_id = ?
        ORDER BY line_id`,
    ).all("user-1", source.id) as Array<{ cache_key: string }>).map((row) => row.cache_key);
    const cacheCountBefore = Number((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_audio_cache WHERE user_id = ?",
    ).get("user-1") as { count: number }).count);

    // Replay must remain independent of current Library profiles.
    db.prepare("UPDATE bots SET name = 'Edited after verdict' WHERE user_id = ?").run("user-1");
    db.prepare("DELETE FROM bots WHERE user_id = ? AND id = 'bot-1'").run("user-1");

    const created = playDebateMysteryV2Again(db, "user-1", source.id, {
      version: 2,
      idempotencyKey: "play-again-click-1",
      audioMode: "reuse",
    });
    assert.equal(created.reusedExistingOpenRun, false);
    assert.equal(provider.calls, callsAfterCompile, "Play Again must not invoke the authoring provider");
    const replay = created.session;
    const replayState = v2State(replay);
    assert.notEqual(replay.id, source.id);
    assert.equal(replay.status, "waiting_for_player");
    assert.equal(replay.stepKey, "mystery_v2_title");
    assert.equal(replayState.playPhase, "title_card");
    assert.equal(replayState.theory, null);
    assert.equal(replayState.theoryFiledAt, null);
    assert.equal(replayState.court, null);
    assert.equal(replayState.verdict, null);
    assert.deepEqual(replayState.calloutHistory, []);
    assert.equal(replayState.pendingCallout, null);
    assert.ok(replayState.rooms.every((room) => room.hotspots.every((hotspot) => !hotspot.examined)));
    assert.equal(replay.events.length, 0);
    assert.deepEqual(replay.ballots, []);

    const replayCaseRow = db.prepare(
      `SELECT private_case_json, dialogue_graph_json, case_hash, graph_hash,
              case_family_id, run_ordinal
         FROM debate_mystery_v2_cases
        WHERE user_id = ? AND session_id = ?`,
    ).get("user-1", replay.id) as typeof sourceCaseRow;
    assert.equal(replayCaseRow.private_case_json, sourceCaseRow.private_case_json);
    assert.equal(replayCaseRow.dialogue_graph_json, sourceCaseRow.dialogue_graph_json);
    assert.equal(replayCaseRow.case_hash, sourceCaseRow.case_hash);
    assert.equal(replayCaseRow.graph_hash, sourceCaseRow.graph_hash);
    assert.equal(sourceCaseRow.case_family_id, source.id);
    assert.equal(sourceCaseRow.run_ordinal, 1);
    assert.equal(replayCaseRow.case_family_id, source.id);
    assert.equal(replayCaseRow.run_ordinal, 2);

    const replayAudioKeys = (db.prepare(
      `SELECT cache_key
         FROM debate_mystery_audio_refs
        WHERE user_id = ? AND session_id = ?
        ORDER BY line_id`,
    ).all("user-1", replay.id) as Array<{ cache_key: string }>).map((row) => row.cache_key);
    assert.deepEqual(replayAudioKeys, sourceAudioKeys);
    assert.equal(Number((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_audio_cache WHERE user_id = ?",
    ).get("user-1") as { count: number }).count), cacheCountBefore);
    assert.ok((db.prepare(
      `SELECT MIN(ref_count) AS minimum, MAX(ref_count) AS maximum
         FROM debate_mystery_audio_cache
        WHERE user_id = ? AND cache_key IN (
          SELECT cache_key FROM debate_mystery_audio_refs
           WHERE user_id = ? AND session_id = ?
        )`,
    ).get("user-1", "user-1", replay.id) as { minimum: number; maximum: number }).minimum >= 2);

    assert.equal((db.prepare(
      "SELECT session_json FROM debate_sessions WHERE user_id = ? AND id = ?",
    ).get("user-1", source.id) as { session_json: string }).session_json, sourceSessionJson);
    assert.deepEqual(db.prepare(
      `SELECT sequence, action_kind, public_payload_json
         FROM debate_mystery_actions
        WHERE user_id = ? AND session_id = ?
        ORDER BY sequence`,
    ).all("user-1", source.id), sourceActions);

    const repeated = playDebateMysteryV2Again(db, "user-1", source.id, {
      version: 2,
      idempotencyKey: "play-again-click-1",
    });
    assert.equal(repeated.session.id, replay.id);
    assert.equal(repeated.reusedExistingOpenRun, true);
    const concurrentClick = playDebateMysteryV2Again(db, "user-1", source.id, {
      version: 2,
      idempotencyKey: "different-concurrent-click",
    });
    assert.equal(concurrentClick.session.id, replay.id);
    assert.equal(concurrentClick.reusedExistingOpenRun, true);
    assert.equal(Number((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_v2_cases WHERE user_id = ? AND case_family_id = ?",
    ).get("user-1", source.id) as { count: number }).count), 2);

    const archive = listDebateSessions(db, "user-1")
      .filter((item) => item.mysteryCaseFamilyId === source.id)
      .sort((left, right) => (left.mysteryRunOrdinal ?? 0) - (right.mysteryRunOrdinal ?? 0));
    assert.deepEqual(archive.map((item) => item.mysteryRunOrdinal), [1, 2]);

    db.prepare(
      `INSERT INTO users
         (id, email, display_name, password_hash, password_salt,
          wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
          preferred_provider, created_at, last_active_at)
       VALUES ('user-2', 'other@example.com', 'Other', 'hash', 'salt',
               'cipher', 'iv', 'tag', 'local', ?, ?)`,
    ).run(NOW, NOW);
    assert.throws(
      () => playDebateMysteryV2Again(db, "user-2", source.id, {
        version: 2,
        idempotencyKey: "cross-tenant",
      }),
      /not found/iu,
    );

    const backupKey = Buffer.alloc(32, 9);
    const backup = exportUserSnapshot(db, "user-1", backupKey);
    assert.deepEqual(
      backup.debates?.mysteryV2?.cases
        .map((item) => [item.caseFamilyId, item.runOrdinal])
        .sort((left, right) => Number(left[1]) - Number(right[1])),
      [[source.id, 1], [source.id, 2]],
    );
    db.prepare(
      "DELETE FROM debate_sessions WHERE user_id = ? AND id IN (?, ?)",
    ).run("user-1", source.id, replay.id);
    importUserSnapshot(db, "user-1", backup, backupKey);
    assert.deepEqual(
      listDebateSessions(db, "user-1")
        .filter((item) => item.id === source.id || item.id === replay.id)
        .map((item) => [item.mysteryCaseFamilyId, item.mysteryRunOrdinal])
        .sort((left, right) => Number(left[1]) - Number(right[1])),
      [[source.id, 1], [source.id, 2]],
    );

    const legacyBackup = structuredClone(backup);
    for (const item of legacyBackup.debates?.mysteryV2?.cases ?? []) {
      delete item.caseFamilyId;
      delete item.runOrdinal;
    }
    db.prepare(
      "DELETE FROM debate_sessions WHERE user_id = ? AND id IN (?, ?)",
    ).run("user-1", source.id, replay.id);
    importUserSnapshot(db, "user-1", legacyBackup, backupKey);
    const legacyRuns = listDebateSessions(db, "user-1")
      .filter((item) => item.id === source.id || item.id === replay.id)
      .sort((left, right) => left.id.localeCompare(right.id));
    assert.deepEqual(
      legacyRuns.map((item) => [item.mysteryCaseFamilyId, item.mysteryRunOrdinal]),
      legacyRuns.map((item) => [item.id, 1]),
    );

    db.prepare(
      "UPDATE debate_mystery_v2_cases SET case_hash = ? WHERE user_id = ? AND session_id = ?",
    ).run("0".repeat(64), "user-1", source.id);
    assert.throws(
      () => playDebateMysteryV2Again(db, "user-1", source.id, {
        version: 2,
        idempotencyKey: "corrupt-case",
      }),
      /integrity check/iu,
    );
  });

  it("never repairs corrupt replay audio and can create a silent Run instead", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const source = await completedSpectatorCase(db, provider, "play-again-audio-fallback");
    const callsAfterCompile = provider.calls;
    const cacheCountBefore = Number((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_audio_cache WHERE user_id = ?",
    ).get("user-1") as { count: number }).count);
    const sourceRef = db.prepare(
      `SELECT cache_key
         FROM debate_mystery_audio_refs
        WHERE user_id = ? AND session_id = ?
        LIMIT 1`,
    ).get("user-1", source.id) as { cache_key: string };
    db.prepare(
      "UPDATE debate_mystery_audio_cache SET sha256 = ? WHERE user_id = ? AND cache_key = ?",
    ).run("f".repeat(64), "user-1", sourceRef.cache_key);

    let replayError: unknown = null;
    try {
      playDebateMysteryV2Again(db, "user-1", source.id, {
        version: 2,
        idempotencyKey: "reuse-corrupt-audio",
        audioMode: "reuse",
      });
    } catch (caught) {
      replayError = caught;
    }
    assert.ok(replayError instanceof Error);
    assert.equal((replayError as Error & { code?: string }).code, "MYSTERY_REPLAY_AUDIO_UNAVAILABLE");
    assert.equal(provider.calls, callsAfterCompile);
    assert.equal(Number((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_v2_cases WHERE user_id = ?",
    ).get("user-1") as { count: number }).count), 1, "failed reuse must roll back the new Run");

    const silent = playDebateMysteryV2Again(db, "user-1", source.id, {
      version: 2,
      idempotencyKey: "silent-after-corrupt-audio",
      audioMode: "silent",
    });
    assert.equal(v2State(silent.session).voicesEnabled, false);
    assert.equal(v2State(silent.session).audioReady, false);
    assert.equal(v2State(silent.session).playPhase, "title_card");
    assert.equal(Number((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_audio_refs WHERE user_id = ? AND session_id = ?",
    ).get("user-1", silent.session.id) as { count: number }).count), 0);
    assert.equal(Number((db.prepare(
      "SELECT COUNT(*) AS count FROM debate_mystery_audio_cache WHERE user_id = ?",
    ).get("user-1") as { count: number }).count), cacheCountBefore);
    const silentManifest = db.prepare(
      "SELECT status FROM debate_mystery_audio_manifests WHERE user_id = ? AND session_id = ?",
    ).get("user-1", silent.session.id) as { status: string };
    assert.equal(silentManifest.status, "silent");
    assert.equal(provider.calls, callsAfterCompile);
  });

  it("keeps a case family replayable after its original Run is removed", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    const source = await completedSpectatorCase(db, provider, "removed-source-run");
    const callsAfterCompile = provider.calls;
    const second = playDebateMysteryV2Again(db, "user-1", source.id, {
      version: 2,
      idempotencyKey: "removed-source-run-second",
    }).session;
    const completedSecond = finishSpectatorRun(db, second, "removed-source-run-second-play");
    const secondBefore = (db.prepare(
      "SELECT session_json FROM debate_sessions WHERE user_id = ? AND id = ?",
    ).get("user-1", completedSecond.id) as { session_json: string }).session_json;

    db.prepare("DELETE FROM debate_sessions WHERE user_id = ? AND id = ?")
      .run("user-1", source.id);
    const third = playDebateMysteryV2Again(db, "user-1", completedSecond.id, {
      version: 2,
      idempotencyKey: "removed-source-run-third",
    });
    assert.equal(third.reusedExistingOpenRun, false);
    assert.equal(v2State(third.session).playPhase, "title_card");
    const family = db.prepare(
      `SELECT case_family_id, run_ordinal
         FROM debate_mystery_v2_cases
        WHERE user_id = ? AND session_id = ?`,
    ).get("user-1", third.session.id) as { case_family_id: string; run_ordinal: number };
    assert.equal(family.case_family_id, source.id);
    assert.equal(family.run_ordinal, 3);
    assert.equal((db.prepare(
      "SELECT session_json FROM debate_sessions WHERE user_id = ? AND id = ?",
    ).get("user-1", completedSecond.id) as { session_json: string }).session_json, secondBefore);
    assert.equal(provider.calls, callsAfterCompile);
  });

  it("keeps Participant Begin Case on the mansion investigation path", async () => {
    const db = testDb();
    const provider = new V2AuthorProvider();
    let session = await createDebateMysterySessionV2(
      db,
      "user-1",
      config(),
      "create-v2-participant-non-regression",
      runtime(provider),
      { deferBackgroundStart: true },
    );
    session = await runDebateMysteryCompilationV2(db, "user-1", session.id, runtime(provider), {
      generateWave: async () => playableWave(),
    });
    session = act(db, session, { action: "move" }, "participant-begin-case");
    assert.equal(v2State(session).playPhase, "case_opening");
    session = act(db, session, { action: "dismiss_case_opening" }, "participant-dismiss-casekeeper");
    const state = v2State(session);
    assert.equal(state.playPhase, "investigation");
    assert.ok(state.rooms.length > 0);
    assert.equal(state.theory, null);
    assert.throws(
      () => act(db, session, { action: "advance_spectator_trial" }, "participant-auto-advance"),
      /only a Spectator/iu,
    );
  });

  it("keeps pivotal Present authoring generic and contains no runtime provider boundary", () => {
    const source = readFileSync(new URL("../debate-mystery-v2.ts", import.meta.url), "utf8");
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.doesNotMatch(source, /elevenlabs/iu);
    assert.doesNotMatch(source, /lead[ -]pipe/iu);
    assert.match(source, /isCanonicalWeapon/u);
    assert.match(source, /requiredPresentationGateRecordId/u);
    assert.match(source, /applyDebateMysteryPresentationGatesV2/u);
    assert.match(source, /allowOperatingSystemVoices: false/u);
    assert.match(source, /generateBuiltinEnglishWave/u);
    const replayRouteStart = serverSource.indexOf(
      'route("POST", "/api/debates/:id/mystery-play-again"',
    );
    const replayRouteEnd = serverSource.indexOf(
      'route("POST", "/api/debates/:id/mystery-resume-compilation"',
      replayRouteStart,
    );
    assert.ok(replayRouteStart >= 0 && replayRouteEnd > replayRouteStart);
    const replayRoute = serverSource.slice(replayRouteStart, replayRouteEnd);
    assert.match(replayRoute, /playDebateMysteryV2Again/u);
    assert.doesNotMatch(
      replayRoute,
      /debateAiRuntimeForUser|runWithUsageSession|prepareDebateMysteryV2EvidenceAssets|generateWave/iu,
    );
  });

  it("owns V2 Case Forge work server-side and returns resume requests immediately", () => {
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.match(serverSource, /const mysteryCompilationBackgroundRuns = new Map/u);
    assert.match(serverSource, /function queueActiveDebateMysteryV2Compilation/u);
    assert.match(serverSource, /function queueDebateMysteryV2CompilationInBackground/u);
    assert.match(serverSource, /runDebateMysteryCompilationV2/u);
    assert.match(serverSource, /queueActiveDebateMysteryV2Compilation\(user\.id\)/u);
    assert.match(serverSource, /if \(options\.db\) detachedBackgroundJobsAllowed = false/u);

    const resumeStart = serverSource.indexOf(
      'route("POST", "/api/debates/:id/mystery-resume-compilation"',
    );
    const statusStart = serverSource.indexOf(
      'route("GET", "/api/debates/:id/mystery-compilation"',
      resumeStart,
    );
    assert.ok(resumeStart >= 0 && statusStart > resumeStart);
    const resumeRoute = serverSource.slice(resumeStart, statusStart);
    assert.match(resumeRoute, /queueDebateMysteryV2CompilationInBackground\(userId, ctx\.params\.id\)/u);
    assert.match(resumeRoute, /json\(ctx\.res, 202/u);

    const listStart = serverSource.indexOf('route("GET", "/api/debates",');
    const listEnd = serverSource.indexOf('route("GET", "/api/debates/:id",', listStart);
    assert.ok(listStart >= 0 && listEnd > listStart);
    assert.match(
      serverSource.slice(listStart, listEnd),
      /queueActiveDebateMysteryV2Compilation\(userId\)/u,
    );
  });

  it("pins sealed visual synthesis to ONLINE review, bounded retry, and semantic no-store delivery", () => {
    const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const synthesisStart = serverSource.indexOf(
      "async function prepareDebateMysteryV2EvidenceAssets",
    );
    const synthesisEnd = serverSource.indexOf(
      "async function prepareDebateMysteryGeneratedAssets",
      synthesisStart,
    );
    assert.ok(synthesisStart >= 0 && synthesisEnd > synthesisStart);
    const synthesis = serverSource.slice(synthesisStart, synthesisEnd);
    assert.match(synthesis, /session\.responseMode !== "local"/u);
    assert.match(synthesis, /!userBlocksOnlineCapabilities\(user\)/u);
    assert.match(synthesis, /attempt <= 2/u);
    assert.match(synthesis, /runMysteryAssetAttempt/u);
    assert.match(synthesis, /reviewDebateMysteryAssetWithVision/u);
    assert.match(synthesis, /sealDebateMysteryAssetBytesV1/u);
    assert.match(synthesis, /setDebateMysteryAssetFallbackV1/u);
    assert.match(synthesis, /debateMysteryRoomTemplatePng/u);
    assert.match(synthesis, /sourceImageBytes: templateBytes/u);
    assert.match(synthesis, /sourceBytes: templateBytes/u);
    assert.match(synthesis, /size: "1536x1024"/u);
    assert.match(synthesis, /unoccupied, furnished/u);
    assert.match(serverSource, /Ordinary room-appropriate furniture/u);
    assert.match(serverSource, /Do not speculate that ordinary containers/u);
    assert.match(synthesis, /these are atmosphere, not evidence/u);
    assert.match(serverSource, /Do not reject an otherwise correct isolated object/u);
    assert.match(serverSource, /Count subjects, not physical pieces/u);
    assert.match(synthesis, /materials, palette, patina, and lighting/u);
    assert.match(synthesis, /people, human figures, bodies, evidence, clues, weapons, blood, gore, readable text/u);
    assert.doesNotMatch(synthesis, /generateAndPersistStandaloneImageAsset/u);
    assert.match(serverSource, /const MYSTERY_ASSET_ATTEMPT_TIMEOUT_MS = 10 \* 60_000/u);
    assert.match(serverSource, /Promise\.race\(\[operation\(controller\.signal\), abortBoundary\]\)/u);
    assert.match(synthesis, /sealed visual attempt failed/u);
    assert.match(synthesis, /pendingDebateMysteryEvidenceAssetsForRoomV2/u);

    const routeStart = serverSource.indexOf(
      'route("GET", "/api/debates/:id/mystery-assets/:kind/:subjectId/file"',
    );
    const routeEnd = serverSource.indexOf(
      'route("GET", "/api/debates/mystery-mansions"',
      routeStart,
    );
    assert.ok(routeStart >= 0 && routeEnd > routeStart);
    const sealedRoutes = serverSource.slice(routeStart, routeEnd);
    assert.match(sealedRoutes, /getRevealedDebateMysteryAssetFileV1/u);
    assert.match(sealedRoutes, /private, no-store, max-age=0/u);
    assert.match(sealedRoutes, /x-content-type-options/u);
    assert.match(sealedRoutes, /saveRevealedDebateMysteryAssetV1/u);
    assert.match(serverSource, /mystery-assets\/retry/u);
    assert.match(serverSource, /requeueRetryableDebateMysteryAssetFallbacksV1/u);
    assert.match(serverSource, /session\.id,\s*2,\s*enabledKinds/u);
  });
});
