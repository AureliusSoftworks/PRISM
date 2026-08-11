import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  DEBATE_JUDGE_GAVEL_COOLDOWN_MS,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_PARTICIPANT_BOT_ID,
  DEBATE_SCHEMA_VERSION,
  applyBotPowerMumbledResponseV1,
  debateParticipantGambitGradesV1,
  debateParticipantGambitOfferV1,
  botPowerSourceHashV1,
  serializeBotAudioVoiceProfileV1,
  serializeBotPowersV1,
  type BotPowerEffectV1,
  type BotPowerV1,
  type DebateEvidencePacketV1,
  type DebateEventV1,
  type DebateFormalityId,
  type DebateMotionSlateV1,
} from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import { restoreFactoryDefaultsInDatabase } from "../account-reset.ts";
import {
  activateDebateParticipantFloorBreak,
  advanceDebateSession,
  checkDebateAdvocacyRoles,
  cancelDebateParticipantFloorBreakPreparation,
  commitDebateParticipantFloorBreakPreparation,
  createDebateSession,
  debateParticipantExpiryOutcomeKind,
  debateMotionHash,
  debateSessionForPlayer,
  endDebateSessionEarly,
  expireDebateParticipantWindow,
  forfeitParticipantDebateSession,
  generateDebateRefractDraft,
  getDebateSession,
  listDebateSessions,
  listDebateSessionExhibitAssets,
  attachDebateExhibitSprite,
  updateDebateExhibitEmoji,
  orderDebateAudience,
  pauseDebateSession,
  pauseDebateSessionWithPersona,
  previewDebateParticipantPredispositions,
  prepareDebateParticipantFloorBreak,
  announceDebatePauseCeremony,
  announceDebateResumeCeremony,
  raiseDebateParticipantObjection,
  raiseDebateParticipantFloorBreak,
  raiseDebateParticipantFloorBreakWithRuntime,
  recoverParticipantDebateFromFinalRecess,
  refineDebateCaseBoard,
  resolveDebateParticipantObjection,
  resolveDebateParticipantFloorBreak,
  resumeDebateSession,
  resumeDebateSessionWithPersona,
  restartParticipantDebateAsDraft,
  sealDebateSessionPresentation,
  submitDebateJudgeGavelMessage,
  submitDebateInterjection,
  submitDebateObjectionRuling,
  submitDebatePlayerTurn,
  submitDebateTurnaboutAction,
  submitDebateVerdict,
  swingDebateJudgeGavel,
  synthesizeDebateSlates,
  synthesizeDebateTitle,
  suggestDebateSetup,
  debateCaseBoardClaimSummary,
  debateModeratorFloorCopyViolatesUpcoming,
  debateAdvocateSpeechNearEcho,
  sanitizeDebateModeratorDelivery,
  type DebateAiRuntime,
} from "../debate.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";
import { HttpError } from "../utils.http.ts";

const NOW = "2026-07-27T12:00:00.000Z";
const debateSource = readFileSync(
  fileURLToPath(new URL("../debate.ts", import.meta.url)),
  "utf8",
);
const serverSource = readFileSync(
  fileURLToPath(new URL("../server.ts", import.meta.url)),
  "utf8",
);

const MOTION: DebateMotionSlateV1 = {
  version: DEBATE_SCHEMA_VERSION,
  id: "housing-motion",
  motion:
    "This city should legalize six-story apartments near every rail station.",
  forSide: {
    label: "Build Near Rail",
    brief:
      "Defend broad six-story zoning as a fair response to housing scarcity.",
  },
  againstSide: {
    label: "Plan With Limits",
    brief: "Oppose the blanket rule and defend more locally tailored growth.",
  },
};

class DebateProviderStub implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "debate-test";

  public async generateResponse(
    messages: ProviderMessage[],
    _options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({
        status: "accept",
        reason: "I can make a clear case from the assigned brief.",
      });
    }
    if (text.includes("Vote independently")) {
      return JSON.stringify({
        sideId: "for",
        reason: "The For side answered the central tradeoff more directly.",
      });
    }
    if (text.includes("Ask one concise, difficult")) {
      return JSON.stringify({
        content: "What cost or constraint most threatens this position?",
      });
    }
    return JSON.stringify({
      content:
        "The central constraint is real, and this proposal addresses it directly [[source:housing-1]].",
    });
  }

  public async embedText(): Promise<number[]> {
    return [0.1, 0.2];
  }
}

class StageDirectionDebateProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes('"content":"your public statement"')) {
      return JSON.stringify({
        content:
          "*yells over the audience* The implementation gap is decisive. *raises voice* That rebuttal does not answer it.",
        deliveryCue: "excited",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class GalleryDirectorProvider extends DebateProviderStub {
  public prompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("silent live gallery director")) {
      this.prompt = text;
      return JSON.stringify({ kind: "impressed", intensity: 2 });
    }
    return super.generateResponse(messages, options);
  }
}

class GuidedChoiceProvider extends DebateProviderStub {
  private readonly unsafeBad: boolean;

  public constructor(unsafeBad = false) {
    super();
    this.unsafeBad = unsafeBad;
  }

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("three private-quality guided answers")) {
      return JSON.stringify({
        choices: [
          {
            tier: "great",
            content: "The blanket rule answers scarcity while keeping rail access central.",
            evidenceIntegrated: false,
          },
          {
            tier: "okay",
            content: "Local planning can still work within a clearer citywide standard.",
            evidenceIntegrated: false,
          },
          {
            tier: "bad",
            content: this.unsafeBad
              ? "You are a worthless idiot; go die."
              : "I just think our side sounds a little better.",
            evidenceIntegrated: false,
          },
        ],
      });
    }
    return super.generateResponse(messages, options);
  }
}

class ParticipantAssessmentProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private Participant performance assessor")) {
      const cited = !text.includes("Validated cited ids: none");
      return JSON.stringify({
        facets: {
          argumentStrength: 0.8,
          humor: 0,
          confidence: 0.7,
          opponentPressure: 0.6,
          subjectKnowledge: 0.8,
        },
        cutoffReason: null,
        cutoffConfidence: 0,
        heardCharacterCount: 10_000,
        evidenceIntegrated: cited,
      });
    }
    return super.generateResponse(messages, options);
  }
}

class ParticipantGambitProvider extends ParticipantAssessmentProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Write a brief theatrical rhetorical gambit")) {
      return JSON.stringify({
        performedText:
          "You ask this chamber to trust a standard your own case does not meet.",
        evidenceIntegrated: false,
        evidenceMisused: false,
      });
    }
    if (text.includes("transform a private Producer cue")) {
      return JSON.stringify({
        fidelity: "steered",
        performedText: "Ask why their premise deserves the room's trust.",
        evidenceIntegrated: false,
        evidenceMisused: false,
      });
    }
    if (text.includes("Participant objection adjudication")) {
      return JSON.stringify({
        ruling: "overruled",
        reason: "The heard fragment presents disagreement rather than a procedural defect.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class IneptPromptProvider extends DebateProviderStub {
  public prompts: string[] = [];

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("HARD Ineptitude")) this.prompts.push(text);
    return super.generateResponse(messages, options);
  }
}

class EvidenceBallotProvider extends DebateProviderStub {
  public ballotPrompts: string[] = [];

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Vote independently")) {
      this.ballotPrompts.push(text);
      return JSON.stringify({
        sideId: "for",
        reason:
          "The source supports the scarcity premise but not every remedy [[source:housing-1]] [[exhibit:invented]].",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class CommentlessAcceptanceProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({ status: "accept", reason: null });
    }
    return super.generateResponse(messages, options);
  }
}

class OvertimeProvider extends DebateProviderStub {
  public openingPrompt = "";
  public correctionPrompt = "";
  public lastCorrectionPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("beyond the allotted floor time")) {
      this.correctionPrompt = text;
      this.lastCorrectionPrompt = text;
      return JSON.stringify({
        content:
          "Time, Avery. Yield the floor so the scheduled order can resume.",
      });
    }
    if (
      text.includes("Give the Build Near Rail opening address") ||
      text.includes("Give the Build Near Rail opening argument")
    ) {
      this.openingPrompt = text;
      return JSON.stringify({
        content: Array.from(
          { length: 78 },
          (_, index) => `grounded${index + 1}`,
        ).join(" "),
      });
    }
    if (
      text.includes("Respond with the Plan With Limits opening address") ||
      text.includes("Respond with the Plan With Limits opening argument")
    ) {
      return JSON.stringify({
        content: Array.from(
          { length: 78 },
          (_, index) => `overrun${index + 1}`,
        ).join(" "),
      });
    }
    return super.generateResponse(messages, options);
  }
}

class DesignationLeakProvider extends DebateProviderStub {
  public speechPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return super.generateResponse(messages, options);
    }
    if (text.includes("Give the Build Near Rail opening")) {
      this.speechPrompt = text;
      return JSON.stringify({
        content:
          "Basil misses the point about scarce rail land. Balance wins. *burp* Bot",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class JudgeGavelProvider extends DebateProviderStub {
  public routePrompt = "";
  public responsePrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("silently route one unscheduled human Judge")) {
      this.routePrompt = text;
      return JSON.stringify({
        shouldRespond: true,
        botId: "against",
        reason: "The question challenges the opposing side's constraint.",
      });
    }
    if (text.includes("silently classify one unscheduled human Judge")) {
      this.routePrompt = text;
      if (text.includes("This Court is adjourned.")) {
        return JSON.stringify({
          shouldRespond: false,
          reason: "The Judge issued a final procedural ruling.",
        });
      }
      return JSON.stringify({
        shouldRespond: true,
        botId: "against",
        reason: "The Judge requested a direct answer.",
      });
    }
    if (text.includes("presiding authority, titled exactly")) {
      this.responsePrompt = text;
      return JSON.stringify({
        content:
          "The limiting constraint is implementation capacity, so our side would phase the rule carefully.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class AutomaticAudienceOrderProvider extends DebateProviderStub {
  public orderPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("public gallery just gasped")) {
      this.orderPrompt = text;
      return JSON.stringify({
        content: "*shouts over the crowd* ORDER! ORDER IN THE COURT!",
        deliveryCue: "shouts",
      });
    }
    if (
      text.includes("Give the Build Near Rail opening address") ||
      text.includes("Give the Build Near Rail opening argument")
    ) {
      return JSON.stringify({
        content: "That is an outrageous lie, and you are completely wrong!",
      });
    }
    if (
      text.includes("Fire pressable shot") ||
      text.includes("Deliver pressable claim")
    ) {
      return JSON.stringify({
        content: "That is an outrageous lie, and your whole claim is wrong!",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class OvertimeAudienceOrderProvider extends AutomaticAudienceOrderProvider {
  public combinedOrderPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("public gallery is also disruptive")) {
      this.combinedOrderPrompt = text;
      return JSON.stringify({
        content: "*shouts over the crowd* ORDER! Time, Avery. Yield the floor.",
        deliveryCue: "shouts",
      });
    }
    if (
      text.includes("Give the Build Near Rail opening address") ||
      text.includes("Give the Build Near Rail opening argument")
    ) {
      // Keep "wrong" so divided-reaction heat reliably clears the shock
      // pressure floor even when event-id hash variation is negative.
      return JSON.stringify({
        content: `That is an outrageous lie, and you are completely wrong! ${Array.from(
          { length: 78 },
          (_, index) => `heated${index + 1}`,
        ).join(" ")}`,
      });
    }
    return super.generateResponse(messages, options);
  }
}

class ParticipantObjectionProvider extends DebateProviderStub {
  public moderatorPrompt = "";
  public continuationPrompt = "";
  private readonly ruling: "sustained" | "overruled";
  private readonly repeatHeardContinuation: boolean;

  public constructor(
    ruling: "sustained" | "overruled",
    repeatHeardContinuation = false,
  ) {
    super();
    this.ruling = ruling;
    this.repeatHeardContinuation = repeatHeardContinuation;
  }

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Participant objection adjudication")) {
      this.moderatorPrompt = text;
      return JSON.stringify({
        ruling: this.ruling,
        reason:
          this.ruling === "sustained"
            ? "The objection identifies a real defect in the heard claim."
            : "The objection disputes the claim but does not identify a procedural defect.",
      });
    }
    if (text.includes("bot moderator overruled the Participant's objection")) {
      this.continuationPrompt = text;
      const heardContent =
        text
          .match(
            /Your heard statement stopped here:\s*([\s\S]*?)\nThe stated objection was:/u,
          )?.[1]
          ?.trim() ?? "";
      const repeatedPrefix = heardContent
        .replace(/…$/u, "")
        .slice(0, Math.max(24, Math.floor(heardContent.length * 0.65)))
        .replace(/\s+\S*$/u, "");
      return JSON.stringify({
        content: this.repeatHeardContinuation
          ? `${repeatedPrefix} The implementation limit remains central, and a phased rollout answers it directly.`
          : "The implementation limit remains central, and a phased rollout answers it directly.",
      });
    }
    if (text.includes("Participant has withdrawn the objection")) {
      this.moderatorPrompt = text;
      return JSON.stringify({
        content: "Objection withdrawn. Avery, finish your point.",
      });
    }
    if (text.includes("Participant withdrew the objection")) {
      this.continuationPrompt = text;
      return JSON.stringify({
        content:
          "The proposal still answers the stated constraint without changing the motion.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class JuryProvider extends DebateProviderStub {
  public aftermathPrompts: string[] = [];
  public ballotPrompts: string[] = [];
  public discussionPrompt = "";
  public closingPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("immediate public reaction")) {
      this.aftermathPrompts.push(text);
    }
    if (
      text.includes("Close the proceeding formally") ||
      text.includes("Close this like the last beat")
    ) {
      this.closingPrompt = text;
    }
    if (
      text.includes("Form a private initial leaning") ||
      text.includes("Cast your final independent Jury ballot")
    ) {
      this.ballotPrompts.push(text);
      return JSON.stringify({
        sideId: "for",
        confidence: 0.72,
        personaInstinct: "I notice whether the case answers the motion.",
        reason: "The For side answered the central tradeoff more directly.",
        deliveryCue: text.includes("Cast your final independent Jury ballot")
          ? "solemn"
          : null,
      });
    }
    if (text.includes("silently route one natural turn")) {
      const eligibleId = text.match(/^- ([^ |]+) \|/mu)?.[1] ?? "";
      return JSON.stringify({
        botId: eligibleId,
        reason: "This juror has a distinct response to the latest point.",
        directive: "Test the strongest claim directly.",
      });
    }
    if (text.includes("Jury turn in one or two sentences")) {
      this.discussionPrompt = text;
      return JSON.stringify({
        content:
          "The strongest point is whether the proposal answers the exact tradeoff in the public record.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class EvidenceJuryProvider extends JuryProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (
      text.includes("Form a private initial leaning") ||
      text.includes("Cast your final independent Jury ballot")
    ) {
      this.ballotPrompts.push(text);
      return JSON.stringify({
        sideId: "for",
        confidence: 0.72,
        personaInstinct:
          "I notice whether the source reaches the decisive claim.",
        reason:
          "The source supports the narrower scarcity premise, not every claimed remedy [[source:housing-1]] [[source:invented]].",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class EvidenceCoverageProvider extends JuryProvider {
  public coveragePrompts: string[] = [];

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    const assignment = text.split("Evidence participation assignment:")[1];
    if (assignment) {
      this.coveragePrompts.push(text);
      const bounded = assignment.split(
        /\n(?:An audible floor clock|Public debate so far:)/u,
      )[0];
      const markers = [
        ...new Set(bounded?.match(/\[\[(?:source|exhibit):[^\]]+\]\]/gu) ?? []),
      ];
      return JSON.stringify({
        content: `These frozen items sharpen the clash: ${markers.join(" ")}.`,
      });
    }
    return super.generateResponse(messages, options);
  }
}

class PersonaSurpriseProvider extends JuryProvider {
  public reactionPrompt = "";
  private readonly reactionBotId: string;

  public constructor(reactionBotId: string) {
    super();
    this.reactionBotId = reactionBotId;
  }

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private PRISM Debate surprise detector")) {
      this.reactionPrompt = text;
      return JSON.stringify({
        surprised: true,
        botId: this.reactionBotId,
        expected: "I expected a simpler defense of the proposal.",
        reaction: "Oh. I see.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class ModeratorLifecycleProvider extends DebateProviderStub {
  public lifecyclePrompts: string[] = [];

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("off-record room-control beat")) {
      this.lifecyclePrompts.push(text);
      return JSON.stringify({
        content: text.includes("announce a recess")
          ? "Yeah, yeah, recess. I need a portal-fluid break."
          : "All right, portals closed. Back to the argument.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class PersonaVoicePromptProvider extends DebateProviderStub {
  public speechPrompt = "";
  public ballotPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Vote independently")) this.ballotPrompt = text;
    else if (
      !text.includes("private advocacy consent check") &&
      !text.includes("The gavel has already struck") &&
      !text.includes("private-quality guided answers") &&
      !text.includes("private Participant performance assessor")
    ) {
      this.speechPrompt = text;
    }
    return super.generateResponse(messages, options);
  }
}

class VoicePerformanceProvider extends DebateProviderStub {
  public performancePrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (!text.includes("private advocacy consent check")) {
      this.performancePrompt = text;
      return JSON.stringify({
        content: "This deserves to be heard with real conviction.",
        deliveryCue: "excited",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class DaytimeShowdownProvider extends JuryProvider {
  public advocatePrompt = "";
  public moderatorPrompt = "";
  public rulingPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return super.generateResponse(messages, options);
    }
    if (text.includes("Cut off Basil now")) {
      return JSON.stringify({
        content: "Basil, you dodge harder than your argument lands.",
      });
    }
    if (text.includes("just cut off Basil")) {
      this.rulingPrompt = text;
      return JSON.stringify({
        content: "Avery, enough. Basil had the floor, and Basil gets it back.",
      });
    }
    if (text.includes("Open Daytime Showdown")) this.moderatorPrompt = text;
    if (text.includes("Give the Build Near Rail opening argument")) {
      this.advocatePrompt = text;
    }
    return super.generateResponse(messages, options);
  }
}

class ConcretePersonaProvider extends DebateProviderStub {
  public concreteSpeechPrompt = "";
  public repairPurposes: string[] = [];

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({ status: "accept", reason: null });
    }
    if (text.includes("Persona capability repair")) {
      const purpose = text.includes("ballot reason") ? "ballot" : "speech";
      this.repairPurposes.push(purpose);
      return JSON.stringify({
        content:
          purpose === "ballot"
            ? "I liked that side. It sounded good."
            : "Homes by the train are good because people can ride the train.",
      });
    }
    if (text.includes("Vote independently")) {
      return JSON.stringify({
        sideId: "for",
        reason:
          "On balance, the record-backed case best fits the decisive judging criterion.",
      });
    }
    if (text.includes("Parker is goofy, literal-minded, and distractible")) {
      this.concreteSpeechPrompt = text;
      return JSON.stringify({
        content:
          "I concede the frozen record does not prove every outcome; my claim is that the record-backed case best fits the central tradeoff.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class TurnaboutProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("validate one PRISM Turnabout contradiction")) {
      return JSON.stringify({
        contradicts: true,
        statementQuote: "central constraint is real",
        evidenceQuote: "A frozen housing source",
        reason:
          "The frozen source conflicts with the statement's central constraint.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class SunriseTurnaboutProvider extends TurnaboutProvider {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Deliver pressable claim")) {
      return JSON.stringify({
        content:
          "I often try to paint a beautiful sunrise each morning, and on those days I study how the colors meet.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class ExhibitTurnaboutProvider extends DebateProviderStub {
  public validationPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("validate one PRISM Turnabout contradiction")) {
      this.validationPrompt = text;
      return JSON.stringify({
        contradicts: true,
        statementQuote: "central constraint is real",
        evidenceQuote: "The handle is bent.",
        reason: "The physical exhibit conflicts with the stated constraint.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class UngroundedTurnaboutProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("validate one PRISM Turnabout contradiction")) {
      return JSON.stringify({
        contradicts: true,
        statementQuote: "fabricated statement marker",
        evidenceQuote: "fabricated evidence marker",
        reason: "A dramatic but unsupported contradiction.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class FabricatedTurnaboutTestimonyProvider extends DebateProviderStub {
  public repairCount = 0;

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("previous draft could not be accepted")) {
      this.repairCount += 1;
      return JSON.stringify({
        content:
          this.repairCount === 1
            ? "The city needs more homes near trains."
            : "Homes by trains let people live near the train.",
      });
    }
    if (text.includes("Deliver testimony statement")) {
      return JSON.stringify({
        content:
          "According to a new study, reserving the lane changes travel time by 47% and saves 19 minutes.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

function runtime(): DebateAiRuntime {
  return runtimeWith(new DebateProviderStub());
}

function runtimeWith(provider: LlmProvider): DebateAiRuntime {
  return {
    preferredProvider: "local",
    personaReactionRoll: () => 1,
    local: {
      provider,
      providerName: "local",
      model: "debate-test",
    },
  };
}

function autoRuntime(
  primary: LlmProvider,
  fallback: LlmProvider,
): DebateAiRuntime {
  const local = {
    provider: primary,
    providerName: "local" as const,
    model: "debate-primary",
  };
  const online = {
    provider: fallback,
    providerName: "local" as const,
    model: "debate-fallback",
  };
  return {
    preferredProvider: "local",
    responseMode: "local",
    personaReactionRoll: () => 1,
    local,
    online,
    lanes: [local, online],
  };
}

class FailingDebateProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "debate-failure";

  public async generateResponse(): Promise<string> {
    throw new Error("provider unavailable");
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

class MalformedDebateProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "debate-malformed";

  public async generateResponse(): Promise<string> {
    return "{not-valid-json";
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

class DevilsAdvocateProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({
        status: "devils_advocate",
        reason: "This position conflicts with my ordinary convictions.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class DecliningAdvocateProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({
        status: "decline",
        reason: "This assignment crosses a defining authored boundary.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class CaseBoardProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Distill a scoreless public debate case board")) {
      return JSON.stringify({
        summary: "Transit zoning directly addresses scarce rail-adjacent land.",
        summaryQuote: "this proposal addresses it directly",
        statusUpdates: [],
      });
    }
    return super.generateResponse(messages, options);
  }
}

class DelayedCaseBoardProvider extends CaseBoardProvider {
  public readonly started: Promise<void>;
  private readonly gate: Promise<void>;
  private markStarted!: () => void;
  private releaseGate!: () => void;

  public constructor() {
    super();
    this.started = new Promise<void>((resolve) => {
      this.markStarted = resolve;
    });
    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = resolve;
    });
  }

  public release(): void {
    this.releaseGate();
  }

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Distill a scoreless public debate case board")) {
      this.markStarted();
      await this.gate;
    }
    return super.generateResponse(messages, options);
  }
}

class ConcessionPreambleProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Give the Build Near Rail opening")) {
      return JSON.stringify({
        content:
          "I concede that local planning has value. But broad rail zoning still addresses the citywide shortage directly.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class UngroundedCaseBoardProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Distill a scoreless public debate case board")) {
      return JSON.stringify({
        summary: "Coolness is social impact and presence.",
        summaryQuote: "Coolness is social impact and presence.",
        statusUpdates: [],
      });
    }
    return super.generateResponse(messages, options);
  }
}

class SpoofedCaseBoardStatusProvider extends DebateProviderStub {
  private readonly targetCardId: string;

  public constructor(targetCardId: string) {
    super();
    this.targetCardId = targetCardId;
  }

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Distill a scoreless public debate case board")) {
      return JSON.stringify({
        summary:
          "The central constraint is real, and local limits still address it directly.",
        summaryQuote:
          "The central constraint is real, and this proposal addresses it directly",
        statusUpdates: [
          {
            id: this.targetCardId,
            status: "conceded",
            // Ungrounded concession language — must not flip the opposing card.
            evidenceQuote: "I concede both points.",
          },
        ],
      });
    }
    return super.generateResponse(messages, options);
  }
}

class HearingRepeatProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (
      text.includes("Basil is thoughtful") &&
      text.includes("Respond with the Plan With Limits opening")
    ) {
      return JSON.stringify({ content: "What did you just say?" });
    }
    return super.generateResponse(messages, options);
  }
}

class SilentModeratorEncounterProvider extends DebateProviderStub {
  public openingPrompt = "";
  public challengePrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("unexpectedly open floor")) {
      this.openingPrompt = text;
      return JSON.stringify({
        content: [
          "Well. No opening bell, then. The housing shortage still requires a direct answer.",
          Array.from(
            { length: 70 },
            (_, index) => `continued${index + 1}`,
          ).join(" "),
        ].join(" "),
      });
    }
    if (
      text.includes(
        "offered only visible canonical silence instead of a challenge",
      )
    ) {
      this.challengePrompt = text;
      return JSON.stringify({
        content:
          "Still no question. The weakest point in my case is implementation speed, so the rule should phase in by corridor.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class PerceptibilityAwareModeratorProvider extends DebateProviderStub {
  public spongeBobOpeningPrompt = "";
  public patrickOpeningPrompt = "";
  public challengeAnswerPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({ status: "accept", reason: null });
    }
    if (text.includes("Call the Assembly Chamber to order")) {
      return JSON.stringify({
        content: "MODERATOR OPENING SENTINEL: The chamber is called to order.",
      });
    }
    if (text.includes("Ask one concise, difficult")) {
      return JSON.stringify({
        content:
          "MODERATOR CHALLENGE SENTINEL: What is the weakest assumption in this case?",
      });
    }
    if (text.includes("Give the Build Near Rail opening address")) {
      if (text.includes("SpongeBob is")) this.spongeBobOpeningPrompt = text;
      if (text.includes("Light Yagami is")) this.spongeBobOpeningPrompt = text;
      return JSON.stringify({
        content: text.includes("empty and no opening words")
          ? "An empty podium? Okay! Homes near trains still help people reach work because more neighbors can live by reliable transit."
          : "Homes near trains help people reach work because more neighbors can live by reliable transit.",
      });
    }
    if (text.includes("Respond with the Plan With Limits opening address")) {
      this.patrickOpeningPrompt = text;
      return JSON.stringify({
        content:
          "A citywide rule can miss local limits, so neighborhoods need room to adapt growth to their streets.",
      });
    }
    if (text.includes("one serious vulnerability in your own public case")) {
      this.challengeAnswerPrompt = text;
      return JSON.stringify({
        content:
          "Still no question. The biggest risk is rushed construction, so the city should phase the rule in carefully.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

function createTestDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "user-1",
    "debate@example.com",
    "Debater",
    "hash",
    "salt",
    "cipher",
    "iv",
    "tag",
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "user-2",
    "other@example.com",
    "Other",
    "hash",
    "salt",
    "cipher",
    "iv",
    "tag",
    NOW,
    NOW,
  );
  return db;
}

function mutePower(): BotPowerV1 {
  const name = "Vow of Silence";
  const intent = "This bot cannot speak.";
  return {
    version: 1,
    id: "mute-power",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Remain silent.",
      observerCue: "They cannot speak.",
      effects: [{ type: "mute" }],
      ruleLabels: ["Hard mute"],
    },
  };
}

function readyPower(
  id: string,
  name: string,
  intent: string,
  effects: BotPowerEffectV1[],
): BotPowerV1 {
  return {
    version: 1,
    id,
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: intent,
      observerCue: intent,
      effects,
      ruleLabels: [name],
    },
  };
}

function ryukInvisiblePowers(): BotPowerV1[] {
  return [
    readyPower("invisible", "Invisible", "Only Light Yagami can see Ryuk.", [
      {
        type: "awareness",
        allowed: [{ kind: "bot", name: "Light Yagami" }],
      },
      { type: "avatar_visibility", mode: "translucent" },
    ]),
    readyPower(
      "heard-by-light",
      "Private Voice",
      "Only Light Yagami can hear Ryuk.",
      [
        {
          type: "speech_audience",
          allowed: [{ kind: "bot", name: "Light Yagami" }],
        },
      ],
    ),
  ];
}

function observantPowers(): BotPowerV1[] {
  return [
    readyPower(
      "observant",
      "Observant",
      "See past every other bot's Power and treat it as if it does not exist.",
      [
        {
          type: "power_immunity",
          scope: "holder",
          targets: "other_bots",
          awareness: "unnoticed",
        },
      ],
    ),
  ];
}

function ineptPowers(): BotPowerV1[] {
  return [
    readyPower(
      "inept",
      "Inept",
      "Cannot follow instructions or competently fulfill a Debate role.",
      [
        {
          type: "ineptitude",
          instructionFidelity: "always_botched",
          imageFidelity: "always_unrelated",
        },
      ],
    ),
  ];
}

function microscopicPowers(): BotPowerV1[] {
  return [
    readyPower(
      "microscopic",
      "Microscopic",
      "Too small to see, though the voice remains audible.",
      [
        { type: "avatar_scale", mode: "smaller" },
        { type: "avatar_visibility", mode: "hidden" },
      ],
    ),
  ];
}

function seedBot(
  db: DatabaseSync,
  id: string,
  name: string,
  powers: BotPowerV1[] = [],
  systemPrompt = `${name} is thoughtful, candid, and concise.`,
): void {
  db.prepare(
    `INSERT INTO bots
       (id, user_id, name, system_prompt, powers_json, color, glyph,
        online_enabled, model, local_model, online_model, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    systemPrompt,
    serializeBotPowersV1(powers),
    id === "moderator" ? "#d7d2ff" : id === "for" ? "#59d7ff" : "#ff6d9c",
    id === "moderator" ? "◇" : "◆",
    `${id}-legacy-model`,
    `${id}-legacy-local-model`,
    `${id}-legacy-online-model`,
    NOW,
    NOW,
  );
}

async function createJudgeDebate(
  db: DatabaseSync,
  debateRuntime: DebateAiRuntime = runtime(),
  options: {
    forSystemPrompt?: string;
    formality?: "free_for_all" | "plainspoken";
    deferStart?: boolean;
    idempotencyKey?: string;
    consentFormality?: "free_for_all" | "plainspoken";
    moderatorTitle?: string;
    playerJudgeUsesPrism?: boolean;
    forumRounds?: { mode: "auto" | "fixed"; count?: number };
    againstPowers?: BotPowerV1[];
  } = {},
) {
  seedBot(db, "moderator", "Mira");
  seedBot(
    db,
    "for",
    "Avery",
    [],
    options.forSystemPrompt ?? "Avery is thoughtful, candid, and concise.",
  );
  seedBot(db, "against", "Basil", options.againstPowers);
  const checks = await checkDebateAdvocacyRoles(
    db,
    "user-1",
    {
      motion: MOTION,
      formality: options.consentFormality ?? options.formality,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
    },
    debateRuntime,
  );
  return createDebateSession(
    db,
    "user-1",
    {
      motion: MOTION,
      formality: options.formality,
      evidence: {
        version: 1,
        notes: "Rail-adjacent land is scarce.",
        sources: [
          {
            id: "housing-1",
            title: "Housing report",
            url: "https://example.com/housing",
            snippet: "A frozen housing source.",
            publishedAt: "2026-01-01",
          },
        ],
        frozenAt: null,
      },
      moderatorTitle: options.moderatorTitle,
      moderatorBotId: "moderator",
      playerJudgeUsesPrism: options.playerJudgeUsesPrism,
      forumRounds: options.forumRounds,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: "judge",
      playerSideId: null,
      advocacyConsent: checks,
      preferredProvider: "local",
      theme: "dark",
      ...(options.deferStart ? { deferStart: true } : {}),
      idempotencyKey: options.idempotencyKey ?? "create:judge:0001",
    },
    debateRuntime,
  );
}

async function createDebateForRole(
  db: DatabaseSync,
  role: "participant" | "spectator",
  options: {
    debateRuntime?: DebateAiRuntime;
    formality?: DebateFormalityId;
    moderatorTitle?: string;
    moderatorSystemPrompt?: string;
    moderatorPowers?: BotPowerV1[];
    forPowers?: BotPowerV1[];
    forSystemPrompt?: string;
    evidence?: DebateEvidencePacketV1;
    participantDifficulty?: "coach" | "standard" | "immersive";
  } = {},
) {
  const debateRuntime = options.debateRuntime ?? runtime();
  seedBot(
    db,
    "moderator",
    "Mira",
    options.moderatorPowers ?? [],
    options.moderatorSystemPrompt,
  );
  seedBot(
    db,
    "for",
    "Avery",
    options.forPowers ?? [],
    options.forSystemPrompt ?? "Avery is thoughtful, candid, and concise.",
  );
  seedBot(db, "against", "Basil");
  const checks = await checkDebateAdvocacyRoles(
    db,
    "user-1",
    {
      motion: MOTION,
      formality: options.formality,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: role,
      playerSideId: role === "participant" ? "against" : null,
    },
    debateRuntime,
  );
  return createDebateSession(
    db,
    "user-1",
    {
      motion: MOTION,
      formality: options.formality,
      evidence: options.evidence ?? {
        version: 1,
        notes: "",
        sources: [],
        frozenAt: null,
      },
      moderatorTitle: options.moderatorTitle,
      moderatorBotId: "moderator",
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: role,
      playerSideId: role === "participant" ? "against" : null,
      participationDifficulty: options.participantDifficulty,
      advocacyConsent: checks,
      preferredProvider: "local",
      theme: "light",
      idempotencyKey: `create:${role}:0001`,
    },
    debateRuntime,
  );
}

async function createJuryDebateForRole(
  db: DatabaseSync,
  role: "judge" | "participant" | "spectator",
  extraLibraryBots = 0,
  format: "forum" | "turnabout" = "forum",
  provider: JuryProvider = new JuryProvider(),
  formalityOverride?: DebateFormalityId,
  evidence: DebateEvidencePacketV1 = {
    version: 1,
    notes: "Rail-adjacent land is scarce.",
    sources: [],
    frozenAt: null,
  },
  firstJurorPowers: BotPowerV1[] = [],
) {
  const debateRuntime = runtimeWith(provider);
  seedBot(db, "moderator", "Mira");
  seedBot(db, "for", "Avery");
  seedBot(db, "against", "Basil");
  for (let index = 0; index < extraLibraryBots; index += 1) {
    seedBot(
      db,
      `juror-${index + 1}`,
      `Library Juror ${index + 1}`,
      index === 0 ? firstJurorPowers : [],
      `Library Juror ${index + 1} values a distinct part of the public record.`,
    );
  }
  const formality =
    formalityOverride ??
    (role === "participant"
      ? ("heated" as const)
      : role === "spectator"
        ? ("plainspoken" as const)
        : ("parliamentary" as const));
  const checks = await checkDebateAdvocacyRoles(
    db,
    "user-1",
    {
      format,
      motion: MOTION,
      formality,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: role,
      playerSideId: role === "participant" ? "against" : null,
    },
    debateRuntime,
  );
  const request = {
    presetId:
      format === "turnabout" || role === "judge"
        ? ("custom" as const)
        : role === "participant"
          ? ("take-the-floor" as const)
          : ("public-forum" as const),
    formality,
    format,
    motion: MOTION,
    evidence,
    moderatorBotId: "moderator",
    forAdvocateBotId: "for",
    againstAdvocateBotId: "against",
    playerRole: role,
    playerSideId: role === "participant" ? ("against" as const) : null,
    jury: { enabled: true as const, cadence: "natural-five" as const },
    advocacyConsent: checks,
    preferredProvider: "local" as const,
    theme: "dark" as const,
    idempotencyKey: `create:jury:${format}:${role}:0001`,
  };
  return {
    provider,
    runtime: debateRuntime,
    request,
    session: createDebateSession(db, "user-1", request, debateRuntime),
  };
}

async function createTurnaboutForRole(
  db: DatabaseSync,
  role: "judge" | "participant" | "spectator",
  debateRuntime: DebateAiRuntime = runtimeWith(new TurnaboutProvider()),
  options: { formality?: "free_for_all" | "plainspoken" } = {},
) {
  seedBot(db, "moderator", "Mira");
  seedBot(db, "for", "Avery");
  seedBot(db, "against", "Basil");
  const checks = await checkDebateAdvocacyRoles(
    db,
    "user-1",
    {
      format: "turnabout",
      formality: options.formality,
      motion: MOTION,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
    },
    debateRuntime,
  );
  return createDebateSession(
    db,
    "user-1",
    {
      format: "turnabout",
      formality: options.formality,
      motion: MOTION,
      evidence: {
        version: 1,
        notes: "Rail-adjacent land is scarce.",
        sources: [
          {
            id: "housing-1",
            title: "Housing report",
            url: "https://example.com/housing",
            snippet: "A frozen housing source.",
            publishedAt: "2026-01-01",
          },
        ],
        exhibits: [
          {
            id: "exhibit-1",
            adjective: "Rusty",
            object: "spoon",
            title: "Rusty spoon",
            observation: "The handle is bent.",
            emoji: "🥄",
            visualKind: "emoji",
            imageId: null,
            createdBy: "player",
          },
        ],
        frozenAt: null,
      },
      moderatorBotId: "moderator",
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: role,
      playerSideId: role === "participant" ? "against" : null,
      advocacyConsent: checks,
      preferredProvider: "local",
      theme: "dark",
      idempotencyKey: `create:turnabout:${role}:0001`,
    },
    debateRuntime,
  );
}

describe("Debate engine", () => {
  it("pins post-session synopsis and debrief contracts without durable memory writes", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../debate.ts", import.meta.url)),
      "utf8",
    );
    assert.match(
      source,
      /export async function generateDebateSessionSynopsis/u,
    );
    assert.match(source, /usagePurpose: "debate_synopsis"/u);
    assert.match(source, /export async function chatWithDebateDebriefBot/u);
    assert.match(source, /usagePurpose: "debate_debrief"/u);
    assert.match(
      source,
      /do not change your mind, reverse a ballot, walk back a floor position/u,
    );
    assert.match(
      source,
      /This exchange is ephemeral\. You have no durable chat history or long-term memory/u,
    );
    assert.doesNotMatch(
      source,
      /chatWithDebateDebriefBot[\s\S]{0,2500}INSERT INTO (?:messages|memories|memory_summaries)/u,
    );
  });

  it("saves a deferred Debate into Archive Open without opening the floor", async () => {
    const db = createTestDb();
    try {
      const session = await createJudgeDebate(db, runtime(), {
        deferStart: true,
        idempotencyKey: "create:judge:defer-start",
      });
      assert.equal(session.status, "paused");
      assert.equal(session.events.length, 0);
      assert.equal(session.stepKey, "intro");
      assert.ok(session.pausedAt);
      assert.equal(session.pausedPresentationEventId, null);
      const listed = listDebateSessions(db, "user-1");
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.awaitingDeferredStart, true);
      assert.equal(listed[0]?.status, "paused");
    } finally {
      db.close();
    }
  });

  it("keeps a hot-prepared, unheard opening in Archive Open", async () => {
    const db = createTestDb();
    try {
      const debateRuntime = runtime();
      let session = await createJudgeDebate(db, debateRuntime, {
        deferStart: true,
        idempotencyKey: "create:judge:hot-opening",
      });
      session = resumeDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "hot-opening:lift",
        quietSave: true,
        exitRecovery: true,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "hot-opening:prepare",
        },
        debateRuntime,
      );
      session = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "hot-opening:hold",
        quietSave: true,
        exitRecovery: true,
        presentationEventId: null,
      });

      assert.equal(session.status, "paused");
      assert.ok(session.events.length > 0);
      assert.equal(session.pausedPresentationEventId, null);
      assert.equal(
        listDebateSessions(db, "user-1")[0]?.awaitingDeferredStart,
        true,
      );
    } finally {
      db.close();
    }
  });

  it("applies the current explicit model only when a saved Debate starts", async () => {
    const db = createTestDb();
    try {
      const savedRuntime = runtime();
      savedRuntime.modelSelectionKind = "auto";
      savedRuntime.autoRoute = {
        v: 1,
        lane: "local",
        provider: "local",
        model: "debate-test",
        reasoningEffort: "low",
        reasonCodes: ["surface_complexity"],
      };
      const saved = await createJudgeDebate(db, savedRuntime, {
        deferStart: true,
        idempotencyKey: "create:judge:deferred-model",
      });
      const currentRuntime = runtime();
      currentRuntime.local = {
        ...currentRuntime.local,
        model: "current-explicit-model",
        reasoningEffort: "high",
        turbo: true,
      };
      currentRuntime.lanes = [currentRuntime.local];
      currentRuntime.responseMode = "local";
      currentRuntime.modelSelectionKind = "fixed";

      const started = resumeDebateSession(
        db,
        "user-1",
        saved.id,
        {
          expectedRevision: saved.revision,
          idempotencyKey: "start:current-explicit-model",
          quietSave: true,
          exitRecovery: true,
          startPreferredProvider: "local",
          startModelOverride: "current-explicit-model",
          startResponseMode: "local",
        },
        undefined,
        currentRuntime,
      );

      assert.equal(started.status, "live");
      assert.equal(started.provider, "local");
      assert.equal(started.model, "current-explicit-model");
      assert.equal(started.modelSelectionKind, "fixed");
      assert.equal(started.responseMode, "local");
      assert.deepEqual(started.generationChain, [
        { provider: "local", model: "current-explicit-model" },
      ]);
      assert.equal(started.latestAutoRoute, undefined);
      assert.equal(started.lastReasoningEffort, "high");
      assert.equal(started.lastTurbo, true);
      assert.equal(started.moderator.model, "current-explicit-model");
      assert.equal(started.forAdvocate.model, "current-explicit-model");
      assert.equal(started.againstAdvocate.model, "current-explicit-model");

      const frozenOverrideSource = serverSource.slice(
        serverSource.indexOf("function frozenDebateModelOverride"),
        serverSource.indexOf("function debateAutoRoutingContext"),
      );
      assert.match(frozenOverrideSource, /return session\.model/u);
      assert.doesNotMatch(
        frozenOverrideSource,
        /modelSelectionKind === "auto"/u,
      );
    } finally {
      db.close();
    }
  });

  it("lists exhibit counts and soft-attaches Archive exhibit sprites", async () => {
    const db = createTestDb();
    try {
      const session = await createDebateForRole(db, "spectator", {
        evidence: {
          version: 1,
          notes: "Rail-adjacent land is scarce.",
          sources: [],
          exhibits: [
            {
              id: "exhibit-1",
              adjective: "Rusty",
              object: "spoon",
              title: "Rusty spoon",
              observation: "The handle is bent.",
              emoji: "🥄",
              visualKind: "emoji",
              imageId: null,
              createdBy: "player",
            },
          ],
          frozenAt: null,
        },
      });
      assert.equal(listDebateSessions(db, "user-1")[0]?.exhibitCount, 1);
      const before = listDebateSessionExhibitAssets(db, "user-1", session.id);
      assert.equal(before.length, 1);
      assert.equal(before[0]?.exhibit.visualKind, "emoji");
      assert.equal(before[0]?.exhibit.imageId, null);

      db.prepare(
        `INSERT INTO images
           (id, user_id, conversation_id, bot_id, related_bot_ids, origin, prompt,
            revised_prompt, url, size, quality, provider, model, local_rel_path,
            purpose, created_at)
         VALUES (?, ?, NULL, NULL, '[]', 'debate', ?, ?, ?, '1024x1024',
                 'standard', 'upload', 'player-upload', ?, 'debate_exhibit', ?)`,
      ).run(
        "exhibit-sprite-1",
        "user-1",
        "[Debate exhibit] Rusty spoon",
        "[Debate exhibit] Rusty spoon",
        "/api/images/exhibit-sprite-1/file",
        "generated-images/user-1/exhibit-sprite-1.png",
        NOW,
      );

      const attached = attachDebateExhibitSprite(
        db,
        "user-1",
        session.id,
        "exhibit-1",
        "exhibit-sprite-1",
      );
      assert.equal(attached.evidence.exhibits?.[0]?.imageId, "exhibit-sprite-1");
      assert.equal(attached.evidence.exhibits?.[0]?.visualKind, "synthesized");
      assert.equal(attached.evidence.exhibits?.[0]?.emoji, "🥄");
      assert.equal(attached.evidence.exhibits?.[0]?.observation, "The handle is bent.");

      const fallbackUpdated = updateDebateExhibitEmoji(
        db,
        "user-1",
        session.id,
        "exhibit-1",
        "🍴",
      );
      assert.equal(fallbackUpdated.evidence.exhibits?.[0]?.emoji, "🍴");
      assert.equal(
        fallbackUpdated.evidence.exhibits?.[0]?.imageId,
        "exhibit-sprite-1",
      );
      assert.equal(
        fallbackUpdated.evidence.exhibits?.[0]?.visualKind,
        "synthesized",
      );

      const after = listDebateSessionExhibitAssets(db, "user-1", session.id);
      assert.equal(after[0]?.exhibit.imageId, "exhibit-sprite-1");
      assert.equal(after[0]?.exhibit.emoji, "🍴");
      assert.match(serverSource, /\/api\/debates\/:id\/exhibits/u);
      assert.match(
        serverSource,
        /\/api\/debates\/:id\/exhibits\/:exhibitId\/sprite/u,
      );
      assert.match(
        serverSource,
        /\/api\/debates\/:id\/exhibits\/:exhibitId\/emoji/u,
      );
      assert.match(serverSource, /\/api\/assets\/for-image\/:imageId/u);
    } finally {
      db.close();
    }
  });

  it("freezes Auto candidates but records the fresh route on generated events", async () => {
    const db = createTestDb();
    try {
      const debateRuntime = runtime();
      debateRuntime.modelSelectionKind = "auto";
      debateRuntime.autoCandidateAllowlist = [
        { provider: "local", model: "debate-test" },
        { provider: "local", model: "debate-backup" },
      ];
      debateRuntime.autoRoute = {
        v: 1,
        lane: "local",
        provider: "local",
        model: "debate-test",
        reasoningEffort: "low",
        reasonCodes: ["surface_complexity"],
      };
      debateRuntime.local.turbo = true;
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      assert.equal(session.modelSelectionKind, "auto");
      assert.equal(session.lastTurbo, true);
      assert.deepEqual(
        session.autoCandidateAllowlist,
        debateRuntime.autoCandidateAllowlist,
      );
      const listed = listDebateSessions(db, "user-1");
      assert.equal(listed[0]?.modelSelectionKind, "auto");
      assert.equal(listed[0]?.model, "debate-test");
      assert.equal(listed[0]?.reasoningEffort, "low");
      assert.equal(listed[0]?.turbo, true);
      assert.ok((listed[0]?.castColors?.length ?? 0) > 0);
      assert.deepEqual(listed[0]?.advocateVisuals, [
        {
          sideId: "for",
          name: "Avery",
          color: "#59d7ff",
          glyph: "◆",
        },
        {
          sideId: "against",
          name: "Basil",
          color: "#ff6d9c",
          glyph: "◆",
        },
      ]);
      debateRuntime.local.model = "debate-routed-next";
      debateRuntime.autoRoute = {
        v: 1,
        lane: "local",
        provider: "local",
        model: "debate-routed-next",
        reasoningEffort: "high",
        reasonCodes: ["surface_complexity"],
      };
      for (let turn = 0; turn < 2; turn += 1) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `auto-route:${turn}`,
          },
          debateRuntime,
        );
      }
      const generatedEvent = session.events.find(
        (event) => event.provider && event.model,
      );
      assert.deepEqual(generatedEvent?.autoRoute, debateRuntime.autoRoute);
      assert.equal(generatedEvent?.turbo, true);
      const resolvedList = listDebateSessions(db, "user-1");
      assert.equal(resolvedList[0]?.model, "debate-routed-next");
      assert.equal(resolvedList[0]?.reasoningEffort, "high");
      assert.equal(resolvedList[0]?.turbo, true);
    } finally {
      db.close();
    }
  });

  it("lists active presentation duration only for completed Debate records", async () => {
    const db = createTestDb();
    try {
      const session = await createDebateForRole(db, "spectator");
      assert.equal(listDebateSessions(db, "user-1")[0]?.activeDurationMs, null);
      const event: DebateEventV1 = {
        version: 1,
        id: "archive-runtime-speech",
        sequence: 1,
        phase: "opening",
        stepKey: "opening_for",
        kind: "speech",
        speakerKind: "advocate",
        speakerBotId: session.forAdvocate.id,
        sideId: "for",
        content: "Short.",
        sourceIds: [],
        createdAt: NOW,
      };
      db.prepare(
        `INSERT INTO debate_events
           (id, user_id, session_id, sequence, phase, step_key, kind,
            event_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        event.id,
        "user-1",
        session.id,
        event.sequence,
        event.phase,
        event.stepKey,
        event.kind,
        JSON.stringify(event),
        event.createdAt,
      );
      db.prepare(
        `UPDATE debate_sessions
            SET status = 'completed', phase = 'verdict', step_key = 'complete',
                completed_at = ?, updated_at = ?
          WHERE id = ? AND user_id = ?`,
      ).run(NOW, NOW, session.id, "user-1");

      assert.equal(
        listDebateSessions(db, "user-1")[0]?.activeDurationMs,
        1_400,
      );
    } finally {
      db.close();
    }
  });

  it("refracts a contextual setup field as a draft without persisting it", async () => {
    const db = createTestDb();
    try {
      seedBot(
        db,
        "for",
        "Avery",
        [],
        "Avery favors concrete institutional accountability.",
      );
      let prompt = "";
      const provider: LlmProvider = {
        name: "local",
        async generateResponse(messages): Promise<string> {
          prompt = messages.map((message) => message.content).join("\n");
          if (prompt.includes("Target: debate.setup.playerNotes")) {
            return JSON.stringify({
              value: "Treat the artifact as publicly owned for this scenario.",
            });
          }
          if (prompt.includes("Target: debate.setup.researchQuery")) {
            return JSON.stringify({
              value: "museum artifact repatriation policy evidence",
            });
          }
          if (prompt.includes("Target: debate.setup.scholarQuery")) {
            return JSON.stringify({
              value: "museum repatriation ethics cultural heritage",
            });
          }
          if (prompt.includes("Target: debate.setup.exhibitDraft")) {
            return JSON.stringify({
              value:
                "Weathered || transit map || The eastern route is circled in red. || 🗺️",
            });
          }
          return JSON.stringify({ value: "weathered ledger" });
        },
        async embedText(): Promise<number[]> {
          return [];
        },
      };
      const result = await generateDebateRefractDraft(
        db,
        "user-1",
        {
          kind: "debate.setup.exhibitDraft",
          botIds: ["for", "missing"],
          context: {
            studioPanel: "evidence",
            format: "turnabout",
            formality: "heated",
            playerRole: "judge",
            playerSideId: "for",
            juryEnabled: false,
            moderatorTitle: "The Forum",
            topic: "Museum ethics",
            motion: "Museums should return contested artifacts.",
            forLabel: "Return",
            forBrief: "Defend return.",
            againstLabel: "Retain",
            againstBrief: "Defend stewardship.",
            exhibitAdjective: "Dusty",
            exhibitObject: "",
            exhibitObservation: "",
            evidenceItemCount: 2,
          },
        },
        "A folded transit map with one route circled in red",
        ["old potato"],
        runtimeWith(provider),
      );
      assert.equal(
        result.value,
        "Weathered || transit map || The eastern route is circled in red. || 🗺️",
      );
      assert.equal(result.generated, true);
      assert.match(prompt, /Museum ethics/u);
      assert.match(prompt, /player's requested physical exhibit/u);
      assert.match(prompt, /adjective.*object name.*observable description.*emoji/u);
      assert.match(prompt, /folded transit map with one route circled/u);
      assert.match(prompt, /Rejected candidates: old potato/u);
      assert.match(
        prompt,
        /Avery favors concrete institutional accountability/u,
      );
      assert.match(prompt, /editable candidate only/u);
      const playerNotes = await generateDebateRefractDraft(
        db,
        "user-1",
        {
          kind: "debate.setup.playerNotes",
          botIds: [],
          context: {
            studioPanel: "evidence",
            format: "turnabout",
            formality: "heated",
            playerRole: "judge",
            playerSideId: "for",
            juryEnabled: false,
            moderatorTitle: "The Forum",
            topic: "Museum ethics",
            motion: "Museums should return contested artifacts.",
            forLabel: "Return",
            forBrief: "Defend return.",
            againstLabel: "Retain",
            againstBrief: "Defend stewardship.",
            exhibitAdjective: "Dusty",
            exhibitObject: "",
            exhibitObservation: "",
            evidenceItemCount: 2,
          },
        },
        "",
        [],
        runtimeWith(provider),
      );
      assert.equal(
        playerNotes.value,
        "Treat the artifact as publicly owned for this scenario.",
      );
      assert.match(prompt, /shared player notes/u);
      assert.match(prompt, /Do not invent real-world evidence/u);
      const researchQuery = await generateDebateRefractDraft(
        db,
        "user-1",
        {
          kind: "debate.setup.researchQuery",
          botIds: [],
          context: {
            studioPanel: "evidence",
            format: "turnabout",
            formality: "heated",
            playerRole: "judge",
            playerSideId: "for",
            juryEnabled: false,
            moderatorTitle: "The Forum",
            topic: "Museum ethics",
            motion: "Museums should return contested artifacts.",
            forLabel: "Return",
            forBrief: "Defend return.",
            againstLabel: "Retain",
            againstBrief: "Defend stewardship.",
            exhibitAdjective: "Dusty",
            exhibitObject: "",
            exhibitObservation: "",
            evidenceItemCount: 2,
          },
        },
        "",
        [],
        runtimeWith(provider),
      );
      assert.equal(
        researchQuery.value,
        "museum artifact repatriation policy evidence",
      );
      assert.match(prompt, /Brave Search query/u);
      assert.match(prompt, /do not invent or summarize search results/u);
      const scholarQuery = await generateDebateRefractDraft(
        db,
        "user-1",
        {
          kind: "debate.setup.scholarQuery",
          botIds: [],
          context: {
            studioPanel: "evidence",
            format: "turnabout",
            formality: "heated",
            playerRole: "judge",
            playerSideId: "for",
            juryEnabled: false,
            moderatorTitle: "The Forum",
            topic: "Museum ethics",
            motion: "Museums should return contested artifacts.",
            forLabel: "Return",
            forBrief: "Defend return.",
            againstLabel: "Retain",
            againstBrief: "Defend stewardship.",
            exhibitAdjective: "Dusty",
            exhibitObject: "",
            exhibitObservation: "",
            evidenceItemCount: 2,
          },
        },
        "",
        [],
        runtimeWith(provider),
      );
      assert.equal(
        scholarQuery.value,
        "museum repatriation ethics cultural heritage",
      );
      assert.match(prompt, /scholarly literature search query/u);
      assert.match(prompt, /journal articles, books, theses/u);
      const stored = db
        .prepare("SELECT COUNT(*) AS count FROM debate_sessions")
        .get() as { count: number };
      assert.equal(stored.count, 0);
    } finally {
      db.close();
    }
  });

  it("keeps a player-directed exhibit editable when every Auto model fails", async () => {
    const db = createTestDb();
    try {
      const result = await generateDebateRefractDraft(
        db,
        "user-1",
        {
          kind: "debate.setup.exhibitDraft",
          botIds: [],
          context: {
            studioPanel: "evidence",
            format: "forum",
            formality: "plainspoken",
            playerRole: "judge",
            playerSideId: "for",
            juryEnabled: false,
            moderatorTitle: "Moderator",
            topic: "",
            motion: "",
            forLabel: "For",
            forBrief: "",
            againstLabel: "Against",
            againstBrief: "",
            exhibitAdjective: "",
            exhibitObject: "",
            exhibitObservation: "",
            evidenceItemCount: 0,
          },
        },
        "A torn glove with one finger stained blue",
        [],
        autoRuntime(
          new MalformedDebateProvider(),
          new MalformedDebateProvider(),
        ),
      );

      assert.deepEqual(result, {
        value:
          "Torn || glove || A torn glove with one finger stained blue. || 🧤",
        generated: true,
        provider: "local",
        model: "deterministic-exhibit-draft-v1",
      });
    } finally {
      db.close();
    }
  });

  it("has no relationship-memory or conversation-continuity data path", () => {
    assert.doesNotMatch(
      debateSource,
      /\b(?:FROM|INTO|UPDATE)\s+(?:memories|memory_summaries|conversations|messages)\b/iu,
    );
  });

  it("keeps Power-obfuscated clear speech out of the player Debate payload", async () => {
    const db = createTestDb();
    try {
      const session = await createDebateForRole(db, "spectator");
      const event: DebateEventV1 = {
        version: DEBATE_SCHEMA_VERSION,
        id: "mumbled-event",
        sequence: session.events.length + 1,
        phase: session.phase,
        stepKey: session.stepKey,
        kind: "speech",
        speakerKind: "advocate",
        speakerBotId: session.forAdvocate.id,
        sideId: "for",
        content: "Blarf mrrn glabble.",
        powerIntendedContent: "The archive key is beneath the glass.",
        sourceIds: [],
        createdAt: NOW,
      };
      const projected = debateSessionForPlayer({
        ...session,
        events: [...session.events, event],
      });
      const projectedEvent = projected.events.at(-1);

      assert.equal(projectedEvent?.content, event.content);
      assert.equal(projectedEvent?.powerIntendedContent, undefined);
      assert.doesNotMatch(JSON.stringify(projected), /archive key/iu);
    } finally {
      db.close();
    }
  });

  it("keeps a Persona comment on every advocacy willingness result", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const commented = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtime(),
      );
      assert.deepEqual(
        commented.map((check) => check.reason),
        [
          "I can make a clear case from the assigned brief.",
          "I can make a clear case from the assigned brief.",
        ],
      );

      const fallback = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtimeWith(new CommentlessAcceptanceProvider()),
      );
      assert.deepEqual(
        fallback.map((check) => check.reason),
        [
          "I’m willing to argue Build Near Rail.",
          "I’m willing to argue Plan With Limits.",
        ],
      );
      assert.match(
        debateSource,
        /Always include reason as one short, first-person, in-character comment on the assigned side/u,
      );
    } finally {
      db.close();
    }
  });

  it("freezes five unique cast-excluded jurors and fills missing seats with generic PRISM archetypes", async () => {
    const db = createTestDb();
    try {
      db.prepare(
        "UPDATE users SET prism_default_bot_audio_voice_profile = ? WHERE id = 'user-1'",
      ).run(
        serializeBotAudioVoiceProfileV1({
          enabled: true,
          baseVoiceId: "voice-5",
          elevenLabsEffect: "echo",
        }),
      );
      const created = await createJuryDebateForRole(db, "spectator", 3);
      const { session, request, runtime: debateRuntime } = created;
      assert.equal(session.jury.enabled, true);
      assert.equal(session.jury.phase, "waiting");
      assert.equal(session.jury.jurors.length, 5);
      assert.equal(
        new Set(session.jury.jurors.map((juror) => juror.id)).size,
        5,
      );
      assert.ok(
        session.jury.jurors.every(
          (juror) => !["moderator", "for", "against"].includes(juror.id),
        ),
      );
      assert.equal(
        session.jury.jurors.filter((juror) => juror.source === "library")
          .length,
        3,
      );
      assert.equal(
        session.jury.jurors.filter((juror) => juror.source === "generic")
          .length,
        2,
      );
      assert.ok(
        session.jury.jurors
          .filter((juror) => juror.source === "generic")
          .every(
            (juror) =>
              juror.voiceProfile?.baseVoiceId === "voice-5" &&
              juror.voiceProfile.elevenLabsEffect === "echo",
          ),
      );
      db.prepare(
        "UPDATE users SET prism_default_bot_audio_voice_profile = ? WHERE id = 'user-1'",
      ).run(
        serializeBotAudioVoiceProfileV1({
          enabled: true,
          baseVoiceId: "voice-2",
        }),
      );
      const replay = createDebateSession(db, "user-1", request, debateRuntime);
      assert.deepEqual(
        replay.jury.jurors.map((juror) => juror.id),
        session.jury.jurors.map((juror) => juror.id),
      );
      assert.deepEqual(
        replay.jury.jurors.map((juror) => juror.voiceProfile),
        session.jury.jurors.map((juror) => juror.voiceProfile),
      );
      assert.equal(session.setupPresetId, "public-forum");
      const mismatchedFormalityChecks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          formality: "parliamentary",
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        debateRuntime,
      );
      const mismatchedFormality = createDebateSession(
        db,
        "user-1",
        {
          ...request,
          formality: "parliamentary",
          advocacyConsent: mismatchedFormalityChecks,
          idempotencyKey: "create:jury:spectator:mismatched-formality",
        },
        debateRuntime,
      );
      assert.equal(mismatchedFormality.setupPresetId, "custom");
      assert.equal(
        listDebateSessions(db, "user-1").find(
          (item) => item.id === mismatchedFormality.id,
        )?.setupPresetId,
        "custom",
      );
    } finally {
      db.close();
    }
  });

  it("pins preferred library jurors in seat order and Surprise-fills the rest", async () => {
    const db = createTestDb();
    try {
      const debateRuntime = runtimeWith(new JuryProvider());
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      seedBot(db, "juror-1", "Library Juror 1");
      seedBot(db, "juror-2", "Library Juror 2");
      seedBot(db, "juror-3", "Library Juror 3");
      seedBot(db, "juror-4", "Library Juror 4");
      seedBot(db, "juror-5", "Library Juror 5");
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          format: "forum",
          motion: MOTION,
          formality: "plainspoken",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          playerSideId: null,
        },
        debateRuntime,
      );
      const session = createDebateSession(
        db,
        "user-1",
        {
          presetId: "public-forum",
          formality: "plainspoken",
          format: "forum",
          motion: MOTION,
          evidence: {
            version: 1,
            notes: "",
            sources: [],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          playerSideId: null,
          jury: {
            enabled: true,
            cadence: "natural-five",
            jurorBotIds: ["juror-2", null, "for", "juror-4", "missing-bot"],
          },
          advocacyConsent: checks,
          preferredProvider: "local",
          theme: "dark",
          idempotencyKey: "create:jury:preferred-pins:0001",
        },
        debateRuntime,
      );
      assert.equal(session.jury.jurors.length, 5);
      assert.equal(session.jury.jurors[0]?.id, "juror-2");
      assert.equal(session.jury.jurors[3]?.id, "juror-4");
      assert.equal(session.jury.forepersonBotId, "juror-2");
      assert.notEqual(session.jury.jurors[2]?.id, "for");
      assert.ok(
        session.jury.jurors.every(
          (juror) => !["moderator", "for", "against"].includes(juror.id),
        ),
      );
      assert.equal(
        new Set(session.jury.jurors.map((juror) => juror.id)).size,
        5,
      );
      assert.ok(session.jury.jurors[1]);
      assert.ok(session.jury.jurors[2]);
      assert.ok(session.jury.jurors[4]);
    } finally {
      db.close();
    }
  });

  it("keeps Jury sidebar and Persona Foley sequences unique on the same advance", async () => {
    const db = createTestDb();
    try {
      const provider = new PersonaSurpriseProvider("juror-1");
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "forum",
        provider,
      );
      created.runtime.personaReactionRoll = () => 0;
      let session = created.session;
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "sequence-collision:intro",
        },
        created.runtime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "sequence-collision:opening",
        },
        created.runtime,
      );

      assert.notEqual(session.status, "paused");
      assert.equal(session.error, null);
      const sidebar = session.events.find((event) =>
        event.stepKey.startsWith("jury_sidebar_"),
      );
      const reaction = session.events.find((event) =>
        event.stepKey.startsWith("persona_reaction_"),
      );
      assert.ok(sidebar, "expected a Jury sidebar turn");
      assert.ok(reaction, "expected Persona Foley");
      const sequences = session.events.map((event) => event.sequence);
      assert.equal(sequences.length, new Set(sequences).size);
      assert.deepEqual(
        sequences,
        [...sequences].sort((left, right) => left - right),
      );
      assert.equal(
        sequences.at(-1),
        sequences.length,
        "sequences should stay contiguous from 1",
      );
    } finally {
      db.close();
    }
  });

  it("lets delayed case-board refinement land without colliding with the next advance", async () => {
    const db = createTestDb();
    try {
      const debateRuntime = runtime();
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "sequence-refine:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "sequence-refine:opening-for",
        },
        debateRuntime,
      );
      const sourceEvent = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.sideId === "for" &&
          event.content.length > 24,
      );
      assert.ok(sourceEvent);
      const provider = new DelayedCaseBoardProvider();
      const refinement = refineDebateCaseBoard(
        db,
        "user-1",
        session.id,
        sourceEvent,
        provider,
      );
      await provider.started;
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "sequence-refine:opening-against",
        },
        debateRuntime,
      );
      provider.release();
      await refinement;

      const settled = getDebateSession(db, "user-1", session.id);
      assert.notEqual(settled.status, "paused");
      assert.equal(settled.error, null);
      const sequences = settled.events.map((event) => event.sequence);
      assert.equal(sequences.length, new Set(sequences).size);
      assert.ok(
        settled.events.some(
          (event) =>
            event.kind === "case_board" &&
            event.parentEventId === sourceEvent.id &&
            event.content.includes(
              "Transit zoning directly addresses scarce rail-adjacent land.",
            ),
        ),
      );
    } finally {
      db.close();
    }
  });

  it("lets the frozen Jury react between public-floor turns without affecting formal deliberation", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "spectator", 5);
      let session = created.session;
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury:sidebar:intro",
        },
        created.runtime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury:sidebar:opening",
        },
        created.runtime,
      );
      const sidebar = session.events.find((event) =>
        event.stepKey.startsWith("jury_sidebar_"),
      );
      assert.equal(sidebar?.kind, "jury_deliberation");
      assert.equal(sidebar?.speakerKind, "juror");
      assert.ok(
        session.jury.jurors.some((juror) => juror.id === sidebar?.speakerBotId),
      );
      assert.ok(sidebar?.parentEventId);
      assert.equal(session.jury.phase, "waiting");
      assert.equal(session.jury.discussionTurnCount, 0);
      assert.deepEqual(session.jury.speakerCounts, {});

      const participant = debateSessionForPlayer({
        ...session,
        playerRole: "participant",
        playerSideId: "against",
      });
      const jurorIds = session.jury.jurors.map((juror) => juror.id);
      assert.deepEqual(participant.jury.jurors, []);
      assert.equal(participant.jury.forepersonBotId, null);
      assert.ok(
        jurorIds.every(
          (jurorId) => participant.powerPlan.bots[jurorId] === undefined,
        ),
      );
      assert.equal(
        participant.events.some((event) =>
          event.stepKey.startsWith("jury_sidebar_"),
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("adds sparse Persona-grounded vocal Foley without changing the floor or ballot state", async () => {
    const db = createTestDb();
    try {
      const provider = new PersonaSurpriseProvider("against");
      const debateRuntime = {
        ...runtimeWith(provider),
        personaReactionRoll: () => 0,
      };
      let session = await createJudgeDebate(db, debateRuntime);
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "persona-reaction:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "persona-reaction:opening",
        },
        debateRuntime,
      );

      const opening = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.speakerBotId === session.forAdvocate.id,
      );
      const reaction = session.events.find((event) =>
        event.stepKey.startsWith("persona_reaction_"),
      );
      assert.ok(opening);
      assert.partialDeepStrictEqual(reaction, {
        kind: "reaction",
        speakerKind: "advocate",
        speakerBotId: session.againstAdvocate.id,
        sideId: "against",
        content: "Oh. I see.",
        parentEventId: opening.id,
        provider: "local",
        model: "debate-test",
      });
      assert.match(provider.reactionPrompt, /saved Persona details/u);
      assert.match(provider.reactionPrompt, /Basil is thoughtful/u);
      assert.match(
        provider.reactionPrompt,
        /Mere disagreement is not surprise/u,
      );
      assert.match(provider.reactionPrompt, /Never use relationship memory/u);
      assert.equal(session.ballots.length, 0);
      assert.equal(session.againstAdvocate.sideId, "against");
    } finally {
      db.close();
    }
  });

  it("lets visible jurors react while keeping individual Jury Foley out of Participant records", async () => {
    const db = createTestDb();
    try {
      const provider = new PersonaSurpriseProvider("juror-1");
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "forum",
        provider,
      );
      created.runtime.personaReactionRoll = () => 0;
      let session = created.session;
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury-persona-reaction:intro",
        },
        created.runtime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury-persona-reaction:opening",
        },
        created.runtime,
      );

      const reaction = session.events.find((event) =>
        event.stepKey.startsWith("persona_reaction_"),
      );
      assert.partialDeepStrictEqual(reaction, {
        kind: "reaction",
        speakerKind: "juror",
        speakerBotId: "juror-1",
        content: "Oh. I see.",
      });
      assert.equal(session.jury.phase, "waiting");
      assert.equal(session.jury.initialBallots.length, 0);
      assert.equal(session.jury.finalBallots.length, 0);

      const participantView = debateSessionForPlayer({
        ...session,
        playerRole: "participant",
        playerSideId: "against",
      });
      assert.equal(
        participantView.events.some(
          (event) => event.kind === "reaction" && event.speakerKind === "juror",
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("prepares all final Jury monologues behind sealed deliberation, then reveals five ballots", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "spectator", 5);
      let session = endDebateSessionEarly(db, "user-1", created.session.id, {
        expectedRevision: created.session.revision,
        idempotencyKey: "jury:end-early:0001",
      });
      assert.equal(session.stepKey, "moderator_to_jury");
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury:moderator-handoff:0001",
        },
        created.runtime,
      );
      assert.equal(session.stepKey, "jury_initial_0");
      assert.partialDeepStrictEqual(session.events.at(-1), {
        speakerKind: "moderator",
        speakerBotId: session.moderator.id,
        stepKey: "moderator_to_jury",
      });
      assert.equal(session.jury.discussionTurnTarget, 3);
      let mutation = 0;
      while (session.jury.phase === "initial_ballots") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:initial:${mutation}`,
          },
          created.runtime,
        );
      }
      assert.equal(session.jury.initialBallots.length, 5);
      assert.equal(
        session.events.some((event) => event.kind === "ballot"),
        false,
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury:discussion:0001",
        },
        created.runtime,
      );
      assert.equal(
        session.jury.discussionTurnCount,
        session.jury.discussionTurnTarget,
      );
      assert.equal(session.jury.preparedFinalBallots.length, 5);
      assert.equal(session.jury.finalBallots.length, 0);
      assert.equal(session.stepKey, "jury_final_0");
      assert.equal(
        session.events.filter(
          (event) =>
            event.kind === "jury_deliberation" &&
            !event.stepKey.startsWith("jury_sidebar_"),
        ).length,
        0,
      );

      let sawVerdictHandoff = false;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:final:${mutation}`,
          },
          created.runtime,
        );
        if (session.events.at(-1)?.kind === "jury_verdict") {
          sawVerdictHandoff = true;
          assert.equal(session.status, "live");
          assert.equal(session.stepKey, "jury_aftermath_for");
          assert.equal(session.completedAt, null);
        }
        assert.ok(mutation < 24);
      }
      assert.equal(sawVerdictHandoff, true);
      assert.equal(session.events.at(0)?.speakerBotId, session.moderator.id);
      assert.equal(session.jury.finalBallots.length, 5);
      assert.equal(session.jury.forVotes, 5);
      assert.equal(session.jury.againstVotes, 0);
      assert.equal(session.jury.majoritySideId, "for");
      assert.equal(session.winnerSideId, "for");
      assert.equal(
        session.events.filter(
          (event) => event.kind === "ballot" && event.speakerKind === "juror",
        ).length,
        5,
      );
      const verdictSequence = session.events.find(
        (event) => event.kind === "jury_verdict",
      )?.sequence;
      const aftermath = session.events.filter(
        (event) =>
          event.stepKey === "jury_aftermath_for" ||
          event.stepKey === "jury_aftermath_against" ||
          event.stepKey === "jury_closing_moderator",
      );
      assert.deepEqual(
        aftermath.map((event) => [
          event.stepKey,
          event.kind,
          event.speakerBotId,
        ]),
        [
          ["jury_aftermath_for", "reaction", "for"],
          ["jury_aftermath_against", "reaction", "against"],
          ["jury_closing_moderator", "phase", "moderator"],
        ],
      );
      assert.ok(
        verdictSequence &&
          aftermath.every((event) => event.sequence > verdictSequence),
      );
      assert.equal(session.events.at(-1)?.speakerBotId, "moderator");
      assert.match(
        created.provider.closingPrompt,
        /declare the debate closed/u,
      );

      const participant = debateSessionForPlayer({
        ...session,
        playerRole: "participant",
        playerSideId: "against",
      });
      const jurorIds = session.jury.jurors.map((juror) => juror.id);
      assert.equal(jurorIds.length, 5);
      assert.deepEqual(participant.jury.jurors, []);
      assert.equal(participant.jury.forepersonBotId, null);
      assert.deepEqual(participant.jury.initialBallots, []);
      assert.deepEqual(participant.jury.preparedFinalBallots, []);
      assert.deepEqual(participant.jury.finalBallots, []);
      assert.deepEqual(participant.jury.speakerCounts, {});
      assert.equal(participant.jury.forVotes, session.jury.forVotes);
      assert.equal(participant.jury.againstVotes, session.jury.againstVotes);
      assert.equal(
        participant.jury.majoritySideId,
        session.jury.majoritySideId,
      );
      assert.ok(
        jurorIds.every(
          (jurorId) => participant.powerPlan.bots[jurorId] === undefined,
        ),
      );
      assert.ok(
        participant.events.every(
          (event) =>
            !event.speakerBotId || !jurorIds.includes(event.speakerBotId),
        ),
      );
      assert.equal(
        participant.events.some(
          (event) =>
            event.kind === "jury_deliberation" ||
            (event.kind === "ballot" && event.speakerKind === "juror"),
        ),
        false,
      );
      const aggregate = participant.events.find(
        (event) => event.kind === "jury_verdict",
      );
      assert.equal(aggregate?.speakerKind, "system");
      assert.equal(aggregate?.speakerBotId, null);
      assert.match(aggregate?.content ?? "", /5–0/u);
      assert.equal(
        participant.events.filter((event) => event.kind === "reaction").length,
        2,
      );
    } finally {
      db.close();
    }
  });

  it("gives jurors exact sealed evidence and persists valid ballot provenance", async () => {
    const db = createTestDb();
    try {
      const provider = new EvidenceJuryProvider();
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "forum",
        provider,
        "plainspoken",
        {
          version: 1,
          notes: "Scarcity is the premise, not proof of every remedy.",
          sources: [
            {
              id: "housing-1",
              title: "Rail Housing Evidence",
              url: "https://example.com/rail-housing",
              snippet:
                "Vacant rail-adjacent parcels are scarce in the surveyed corridor.",
            },
          ],
          frozenAt: null,
        },
      );
      let session = await advanceDebateSession(
        db,
        "user-1",
        created.session.id,
        {
          expectedRevision: created.session.revision,
          idempotencyKey: "jury:evidence:intro",
        },
        created.runtime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury:evidence:opening",
        },
        created.runtime,
      );
      assert.deepEqual(
        session.events.find(
          (event) => event.kind === "speech" && event.speakerBotId === "for",
        )?.sourceIds,
        ["housing-1"],
      );

      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "jury:evidence:end-early",
      });
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:evidence:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 24);
      }

      assert.equal(provider.ballotPrompts.length, 10);
      for (const prompt of provider.ballotPrompts) {
        assert.match(prompt, /Publicly used frozen evidence/u);
        assert.match(prompt, /Rail Housing Evidence/u);
        assert.match(
          prompt,
          /Vacant rail-adjacent parcels are scarce in the surveyed corridor\./u,
        );
        assert.match(prompt, /A citation is not a vote/u);
        assert.match(
          prompt,
          /what the item actually supports or fails to support/u,
        );
      }
      assert.equal(provider.discussionPrompt, "");

      const ballotEvents = session.events.filter(
        (event) => event.kind === "ballot" && event.speakerKind === "juror",
      );
      assert.equal(ballotEvents.length, 5);
      assert.equal(
        ballotEvents.every(
          (event) =>
            event.content.includes("[[source:housing-1]]") &&
            !event.content.includes("[[source:invented]]") &&
            event.sourceIds.length === 1 &&
            event.sourceIds[0] === "housing-1",
        ),
        true,
      );
      assert.equal(
        session.jury.finalBallots.every(
          (ballot) =>
            ballot.reason.includes("[[source:housing-1]]") &&
            !ballot.reason.includes("[[source:invented]]"),
        ),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("assigns frozen evidence across public advocate turns one primary piece at a time, prioritizing exhibits", async () => {
    const db = createTestDb();
    try {
      const provider = new EvidenceCoverageProvider();
      const evidence: DebateEvidencePacketV1 = {
        version: 1,
        notes: "Use every item where it genuinely bears on the motion.",
        sources: [
          {
            id: "source-a",
            title: "Source A",
            url: "https://example.com/a",
            snippet: "Source A supplies a narrow factual premise.",
          },
          {
            id: "source-b",
            title: "Source B",
            url: "https://example.com/b",
            snippet: "Source B supplies a competing limitation.",
          },
          {
            id: "source-c",
            title: "Source C",
            url: "https://example.com/c",
            snippet: "Source C supplies useful historical context.",
          },
        ],
        exhibits: [
          {
            id: "exhibit-key",
            adjective: "Worn",
            object: "key and kite",
            title: "Old Key and Kite",
            observation: "A worn key tied to a short length of kite string.",
            emoji: "🗝️",
            visualKind: "emoji",
            imageId: null,
            createdBy: "player",
          },
          {
            id: "exhibit-hat",
            adjective: "Blond",
            object: "toupet",
            title: "Blond Toupet",
            observation: "A blond hairpiece sealed in a clear evidence sleeve.",
            emoji: "🟨",
            visualKind: "emoji",
            imageId: null,
            createdBy: "player",
          },
        ],
        frozenAt: null,
      };
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "forum",
        provider,
        "plainspoken",
        evidence,
      );
      let session = created.session;
      let mutation = 0;
      while (session.phase !== "verdict") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `evidence-coverage:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 20);
      }

      const publicIds = new Set(
        session.events.flatMap((event) => event.sourceIds),
      );
      assert.deepEqual([...publicIds].sort(), [
        "exhibit-hat",
        "exhibit-key",
        "source-a",
        "source-b",
        "source-c",
      ]);
      assert.ok(provider.coveragePrompts.length >= 3);
      const firstAssignment = provider.coveragePrompts[0]
        ?.split("Evidence participation assignment:")[1]
        ?.split(/\nAn audible floor clock/u)[0];
      assert.match(firstAssignment ?? "", /\[\[exhibit:exhibit-key\]\]/u);
      assert.doesNotMatch(
        firstAssignment ?? "",
        /\[\[exhibit:exhibit-hat\]\]/u,
      );
    } finally {
      db.close();
    }
  });

  it("keeps unpresented sealed exhibits out of Jury prompts and language", async () => {
    const db = createTestDb();
    try {
      const provider = new JuryProvider();
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "forum",
        provider,
        "plainspoken",
        {
          version: 1,
          notes: "",
          sources: [],
          exhibits: [
            {
              id: "sealed-key",
              adjective: "Worn",
              object: "key and kite",
              title: "Old Key and Kite",
              observation: "A worn key tied to kite string.",
              emoji: "🗝️",
              visualKind: "emoji",
              imageId: null,
              createdBy: "player",
            },
          ],
          frozenAt: null,
        },
      );
      let session = endDebateSessionEarly(db, "user-1", created.session.id, {
        expectedRevision: created.session.revision,
        idempotencyKey: "sealed-jury:end-early",
      });
      let mutation = 0;
      while (session.stepKey !== "jury_final_0") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `sealed-jury:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 8);
      }

      assert.equal(provider.ballotPrompts.length, 10);
      assert.equal(
        provider.ballotPrompts.every(
          (prompt) =>
            !prompt.includes("Old Key and Kite") &&
            !prompt.includes("sealed-key") &&
            prompt.includes("Unpresented items from the sealed packet"),
        ),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("keeps participant Jury aftermath aggregate-only before the moderator closes", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "participant", 5);
      let session = endDebateSessionEarly(db, "user-1", created.session.id, {
        expectedRevision: created.session.revision,
        idempotencyKey: "jury:participant:end-early:0001",
      });
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:participant:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 24);
      }
      assert.equal(created.provider.aftermathPrompts.length, 1);
      assert.ok(
        created.provider.aftermathPrompts.every(
          (prompt) =>
            prompt.includes("sealed Jury") &&
            prompt.includes("aggregate winning side and split") &&
            prompt.includes("Never mention or imply any juror identity"),
        ),
      );
      const visible = debateSessionForPlayer(session);
      assert.equal(
        visible.events.filter((event) => event.kind === "reaction").length,
        1,
      );
      assert.equal(visible.events.at(-1)?.speakerKind, "moderator");
      assert.equal(visible.events.at(-1)?.kind, "phase");
      assert.equal(visible.jury.finalBallots.length, 0);
      assert.equal(
        visible.participation?.finalJuryBallotInfluences?.length,
        5,
      );
      assert.ok(
        visible.participation?.finalJuryBallotInfluences?.every(
          (ballot) =>
            ballot.participantInfluence !== null &&
            !("jurorBotId" in ballot) &&
            !("reason" in ballot),
        ),
      );
    } finally {
      db.close();
    }
  });

  it("returns a Jury Turnabout to both advocates before its moderator closes", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "turnabout",
      );
      let session = endDebateSessionEarly(db, "user-1", created.session.id, {
        expectedRevision: created.session.revision,
        idempotencyKey: "jury:turnabout:end-early:0001",
      });
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:turnabout:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 24);
      }
      assert.equal(session.formatState.format, "turnabout");
      assert.equal(session.formatState.phase, "resolution");
      assert.equal(session.formatState.floorOwnerBotId, null);
      assert.deepEqual(
        session.events
          .filter((event) => event.kind === "reaction")
          .map((event) => event.speakerBotId),
        ["for", "against"],
      );
      assert.equal(session.events.at(-1)?.speakerBotId, "moderator");
    } finally {
      db.close();
    }
  });

  it("makes Jury deliberation and voting automatic and unskippable", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "spectator", 5);
      let session = created.session;
      let mutation = 0;
      while (!session.stepKey.startsWith("jury_deliberation_")) {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:reach-deliberation:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 40);
      }
      assert.equal(session.jury.discussionTurnCount, 0);
      assert.equal(session.endedEarlyAt, null);

      await assert.rejects(
        () =>
          advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: "jury:skip-entire-deliberation:0001",
              skip: true,
            },
            created.runtime,
          ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /automatic and cannot be skipped/u.test(error.message),
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "jury:automatic-deliberation:0001",
        },
        created.runtime,
      );
      assert.equal(session.stepKey, "jury_final_0");
      assert.equal(session.status, "live");
      assert.equal(session.jury.phase, "final_ballots");
      assert.equal(
        session.jury.discussionTurnCount,
        session.jury.discussionTurnTarget,
      );
      assert.equal(session.jury.preparedFinalBallots.length, 5);
      assert.ok(session.jury.calledVoteAt);
      assert.equal(session.endedEarlyAt, null);
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:after-full-skip:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 48);
      }
      assert.equal(session.jury.finalBallots.length, 5);
      assert.equal(session.winnerSideId, "for");
    } finally {
      db.close();
    }
  });

  it("keeps formal Jury deliberation silent while preparing five independent ballots", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "spectator", 5);
      let session = created.session;
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:normal:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 48);
      }
      assert.equal(session.jury.discussionTurnCount, 5);
      assert.deepEqual(session.jury.speakerCounts, {});
      assert.equal(
        session.events.filter(
          (event) =>
            event.kind === "jury_deliberation" &&
            !event.stepKey.startsWith("jury_sidebar_"),
        ).length,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("applies a juror's speech-obfuscation Power to the saved final reason and audible ballot event", async () => {
    const db = createTestDb();
    try {
      const provider = new JuryProvider();
      const intendedReason =
        "The For side answered the central tradeoff more directly.";
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "forum",
        provider,
        "plainspoken",
        {
          version: 1,
          notes: "",
          sources: [],
          frozenAt: null,
        },
        [
          readyPower(
            "jury-gibberish",
            "Gibberish ballot",
            "Every public utterance is audible gibberish.",
            [{ type: "speech_obfuscation", mode: "gibberish" }],
          ),
        ],
      );
      let session = endDebateSessionEarly(db, "user-1", created.session.id, {
        expectedRevision: created.session.revision,
        idempotencyKey: "jury:gibberish:end-early",
      });
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:gibberish:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 24);
      }

      const expectedReason = applyBotPowerMumbledResponseV1(intendedReason);
      const ballot = session.jury.finalBallots.find(
        (candidate) => candidate.jurorBotId === "juror-1",
      );
      const event = session.events.find(
        (candidate) =>
          candidate.kind === "ballot" && candidate.speakerBotId === "juror-1",
      );
      assert.equal(ballot?.sideId, "for");
      assert.equal(ballot?.reason, expectedReason);
      assert.equal(ballot?.powerIntendedReason, intendedReason);
      assert.equal(ballot?.voicePerformanceCue, "solemn");
      assert.equal(event?.sideId, "for");
      assert.equal(event?.content, expectedReason);
      assert.equal(event?.powerIntendedContent, intendedReason);
      assert.equal(event?.voicePerformanceCue, "solemn");
      assert.doesNotMatch(event?.content ?? "", /central tradeoff/u);
      assert.equal(
        provider.ballotPrompts.some((prompt) =>
          prompt.includes(
            "author fully intelligible natural-language intent",
          ),
        ),
        true,
      );

      const publicSession = debateSessionForPlayer(session);
      const publicBallot = publicSession.jury.finalBallots.find(
        (candidate) => candidate.jurorBotId === "juror-1",
      );
      const publicEvent = publicSession.events.find(
        (candidate) =>
          candidate.kind === "ballot" && candidate.speakerBotId === "juror-1",
      );
      assert.equal(publicBallot?.reason, expectedReason);
      assert.equal("powerIntendedReason" in (publicBallot ?? {}), false);
      assert.equal(publicEvent?.content, expectedReason);
      assert.equal("powerIntendedContent" in (publicEvent ?? {}), false);
    } finally {
      db.close();
    }
  });

  it("presents the Jury split as advice before a human Judge makes the final ruling", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "judge", 0);
      let session = endDebateSessionEarly(db, "user-1", created.session.id, {
        expectedRevision: created.session.revision,
        idempotencyKey: "jury:judge:end-early:0001",
      });
      let mutation = 0;
      while (session.status !== "waiting_for_player") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:judge:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 24);
      }
      assert.equal(
        session.jury.jurors.every((juror) => juror.source === "generic"),
        true,
      );
      assert.equal(session.jury.majoritySideId, "for");
      assert.equal(session.winnerSideId, null);
      assert.equal(session.stepKey, "verdict_player");
      assert.deepEqual(
        session.events
          .filter((event) => event.kind === "reaction")
          .map((event) => event.speakerBotId),
        ["for", "against"],
      );
      assert.equal(
        session.events.some(
          (event) => event.stepKey === "jury_closing_moderator",
        ),
        false,
      );

      session = submitDebateVerdict(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "jury:judge:verdict:0001",
        sideId: "against",
        reason: "The Judge is not bound by the advisory split.",
      });
      const ruling = session.events.at(-1);
      assert.equal(session.status, "live");
      assert.equal(session.stepKey, "judge_aftermath_for");
      assert.equal(ruling?.kind, "verdict");
      assert.equal(ruling?.speakerKind, "player");
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:judge:aftermath:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 28);
      }
      assert.equal(session.winnerSideId, "against");
      assert.equal(session.ballots.length, 0);
      assert.equal(session.jury.finalBallots.length, 5);
      assert.deepEqual(
        session.events
          .filter((event) => event.stepKey.startsWith("judge_aftermath_"))
          .map((event) => [event.speakerBotId, event.parentEventId]),
        [
          ["for", ruling?.id],
          ["against", ruling?.id],
        ],
      );
      assert.equal(session.events.at(-1)?.kind, "phase");
      assert.equal(session.events.at(-1)?.speakerKind, "moderator");
      assert.equal(session.events.at(-1)?.stepKey, "judge_closing_moderator");
      assert.equal(session.events.at(0)?.speakerBotId, session.moderator.id);
      assert.equal(session.events.at(-1)?.speakerBotId, session.moderator.id);
      assert.equal(created.provider.aftermathPrompts.length, 4);
      assert.ok(
        created.provider.aftermathPrompts
          .slice(-2)
          .every(
            (prompt) =>
              prompt.includes("Moderator has just ruled") &&
              prompt.includes(
                "The Judge is not bound by the advisory split.",
              ) &&
              prompt.includes("not an earlier Jury recommendation"),
          ),
      );
    } finally {
      db.close();
    }
  });

  it("freezes Prism as a player-controlled Judge proxy with automatic authority bookends", async () => {
    const db = createTestDb();
    try {
      const session = await createJudgeDebate(db, runtime(), {
        playerJudgeUsesPrism: true,
      });
      assert.equal(session.moderator.id, DEBATE_PLAYER_JUDGE_BOT_ID);
      assert.equal(session.moderator.name, "Debater");
      assert.equal(session.moderator.role, "moderator");
      assert.equal(session.moderator.sideId, null);
      assert.deepEqual(session.moderator.powers, []);
      assert.match(
        session.moderator.systemPrompt,
        /player-controlled visual and procedural proxy for the human Judge/u,
      );
      assert.match(
        session.moderator.systemPrompt,
        /automatic neutral introduction that opens the Debate/u,
      );
      assert.match(
        session.moderator.systemPrompt,
        /Never invent phase announcements, questions, rulings, ballots, gestures/u,
      );
      assert.equal(session.forAdvocate.id, "for");
      assert.equal(session.againstAdvocate.id, "against");
      assert.equal(
        session.powerPlan.bots[DEBATE_PLAYER_JUDGE_BOT_ID]?.hardMuted,
        false,
      );
    } finally {
      db.close();
    }
  });

  it("gives the human Judge an automatic opening but invents no later Judge action", async () => {
    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        playerJudgeUsesPrism: true,
        forumRounds: { mode: "fixed", count: 2 },
      });
      assert.equal(session.formatState.format, "forum");
      if (session.formatState.format === "forum") {
        assert.equal(session.formatState.rebuttalRoundTarget, 2);
        assert.equal(session.formatState.rebuttalRoundMode, "fixed");
      }
      const advance = async (key: string) => {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `debate.advance:inactive-judge:${key}`,
          },
          debateRuntime,
        );
      };

      await advance("intro");
      assert.equal(session.stepKey, "opening_for");
      assert.partialDeepStrictEqual(session.events.at(0), {
        kind: "intro",
        speakerKind: "moderator",
        speakerBotId: session.moderator.id,
        stepKey: "intro",
      });

      await advance("opening-for");
      await advance("opening-against");
      assert.equal(session.stepKey, "challenge_judge_question");
      assert.equal(session.status, "waiting_for_player");

      session = await submitDebatePlayerTurn(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "debate.turn:inactive-judge:pass",
        content: "",
        pass: true,
      });
      assert.equal(session.stepKey, "rebuttal_against");
      assert.equal(
        session.events.some((event) => event.speakerKind === "player"),
        false,
      );

      let mutation = 0;
      while (session.stepKey !== "verdict_player") {
        mutation += 1;
        await advance(`remaining-${mutation}`);
        assert.ok(mutation < 12);
      }
      assert.equal(
        session.events.filter(
          (event) =>
            event.stepKey === "rebuttal_for" && event.kind === "speech",
        ).length,
        2,
      );
      assert.equal(
        session.events.filter(
          (event) =>
            event.stepKey === "rebuttal_against" && event.kind === "speech",
        ).length,
        2,
      );
      assert.deepEqual(
        session.events
          .filter(
            (event) =>
              event.speakerKind === "moderator" ||
              event.speakerBotId === session.moderator.id,
          )
          .map((event) => [event.kind, event.stepKey]),
        [["intro", "intro"]],
      );

      session = submitDebateVerdict(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "debate.verdict:inactive-judge",
        sideId: "for",
        reason: "The affirmative carried the public exchange.",
      });
      assert.equal(session.status, "live");
      assert.equal(session.stepKey, "judge_aftermath_for");
      assert.throws(
        () =>
          swingDebateJudgeGavel(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: "debate.gavel:after-final-ruling",
            eventId: null,
            overtime: false,
          }),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /final ruling has already been entered/u.test(error.message),
      );
      await advance("judge-reaction-for");
      await advance("judge-reaction-against");
      await advance("judge-close");
      assert.equal(session.status, "completed");
      assert.equal(session.events.at(-1)?.speakerKind, "moderator");
      assert.equal(session.events.at(-1)?.speakerBotId, session.moderator.id);
      assert.deepEqual(
        session.events
          .filter((event) => event.speakerKind === "moderator")
          .map((event) => [event.kind, event.stepKey]),
        [
          ["intro", "intro"],
          ["phase", "judge_closing_moderator"],
        ],
      );
    } finally {
      db.close();
    }
  });

  it("opens a human-Judge Turnabout through the authority before advocate testimony", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(new TurnaboutProvider());
    try {
      let session = await createTurnaboutForRole(db, "judge", debateRuntime);
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:inactive-turnabout-judge:intro",
        },
        debateRuntime,
      );
      assert.equal(session.stepKey, "turnabout_testimony_for");
      assert.partialDeepStrictEqual(session.events.at(0), {
        kind: "intro",
        speakerKind: "moderator",
        speakerBotId: session.moderator.id,
        stepKey: "turnabout_intro",
      });
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.floorOwnerBotId, session.forAdvocate.id);
    } finally {
      db.close();
    }
  });

  it("makes saved persona diction binding for Debate speech and ballot reasons", async () => {
    const db = createTestDb();
    try {
      const provider = new PersonaVoicePromptProvider();
      const debateRuntime = runtimeWith(provider);
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:persona-voice:0001",
        },
        debateRuntime,
      );
      assert.match(provider.speechPrompt, /Persona voice is binding/);
      assert.match(
        provider.speechPrompt,
        /generic polished-debater, corporate, academic, or assistant language/,
      );
      assert.match(
        provider.speechPrompt,
        /formal Debate role changes the structure of a turn, not the persona's vocabulary or fluency/,
      );
      // A neutral ballot is generated only at normal completion; direct coverage
      // of the shared prompt text is pinned by its exported source contract below.
      assert.match(debateSource, /personaVoicePrompt\(voter\)/);
    } finally {
      db.close();
    }
  });

  it("stores bounded voice direction outside canonical Debate speech", async () => {
    const db = createTestDb();
    try {
      const provider = new VoicePerformanceProvider();
      const debateRuntime = runtimeWith(provider);
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:voice-performance:0001",
        },
        debateRuntime,
      );
      const event = session.events.at(-1);
      assert.equal(event?.voicePerformanceCue, "excited");
      assert.doesNotMatch(event?.content ?? "", /\[excited\]/u);
      assert.match(provider.performancePrompt, /Choose deliveryCue only/u);
      assert.match(provider.performancePrompt, /Never put the cue/u);
    } finally {
      db.close();
    }
  });

  it("has the moderator announce each timed Forum floor allocation aloud", async () => {
    const db = createTestDb();
    const provider = new PersonaVoicePromptProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      const advance = async (key: string) => {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `debate.advance:floor-time:${key}`,
          },
          debateRuntime,
        );
      };

      await advance("intro");
      assert.match(
        provider.speechPrompt,
        /tell both advocates that each has 20 seconds for their opening/u,
      );
      assert.match(provider.speechPrompt, /Say the number aloud/u);

      await advance("opening-for");
      await advance("opening-against");
      await advance("challenge-for-prompt");
      assert.match(
        provider.speechPrompt,
        /tell Avery they have 12 seconds to answer the challenge/u,
      );

      await advance("challenge-for-answer");
      await advance("challenge-against-prompt");
      assert.match(
        provider.speechPrompt,
        /tell Basil they have 12 seconds to answer the challenge/u,
      );
      await advance("challenge-against-answer");

      await advance("moderator-to-rebuttal");
      assert.match(
        provider.speechPrompt,
        /tell both advocates that each has 15 seconds for rebuttal/u,
      );

      await advance("rebuttal-against");
      await advance("rebuttal-for");
      await advance("moderator-to-closing");
      assert.match(
        provider.speechPrompt,
        /tell both advocates that each has 15 seconds for their closing/u,
      );
    } finally {
      db.close();
    }
  });

  it("announces the Participant floor limit without exposing the slowed wall clock", async () => {
    const db = createTestDb();
    const provider = new PersonaVoicePromptProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
        evidence: {
          version: DEBATE_SCHEMA_VERSION,
          notes: "Rail-adjacent land is scarce.",
          sources: [{
            id: "housing-1",
            title: "Housing report",
            url: "https://example.com/housing",
            snippet: "A frozen housing source.",
            publishedAt: "2026-01-01",
          }],
          frozenAt: null,
        },
      });
      for (const key of ["intro", "opening-for"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `debate.advance:participant-floor-time:${key}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.stepKey, "opening_against_player");
      session = await submitDebatePlayerTurn(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "debate.turn:participant-floor-time:opening",
        content: "The implementation gap is the central risk.",
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:participant-floor-time:challenge",
        },
        debateRuntime,
      );
      assert.equal(session.stepKey, "challenge_participant_turn");
      assert.match(
        provider.speechPrompt,
        /tell the Participant they have 12 seconds to answer the challenge/u,
      );
      assert.doesNotMatch(provider.speechPrompt, /96 seconds/u);

      session = await submitDebatePlayerTurn(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "debate.turn:participant-floor-time:pass",
        content: "",
        pass: true,
      });
      assert.equal(session.stepKey, "challenge_opponent_prompt");
      for (const key of [
        "opponent-prompt",
        "opponent-answer",
        "moderator-to-rebuttal",
      ]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `debate.advance:participant-floor-time:${key}`,
          },
          debateRuntime,
        );
      }
      assert.match(
        provider.speechPrompt,
        /tell the room that Avery and Debater each have 15 seconds whenever they personally take a rebuttal floor/u,
      );
      assert.doesNotMatch(provider.speechPrompt, /120 seconds/u);
    } finally {
      db.close();
    }
  });

  it("records advocate overtime and keeps linked moderator correction in bot-moderated proceedings", async () => {
    const db = createTestDb();
    const provider = new OvertimeProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:overtime-intro:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:overtime-opening:0001",
        },
        debateRuntime,
      );

      const opening = session.events.find(
        (event) =>
          event.stepKey === "opening_for" &&
          event.kind === "speech" &&
          event.speakerBotId === session.forAdvocate.id,
      );
      assert.equal(opening?.timing?.limitMs, 20_000);
      assert.equal(opening?.timing?.status, "overtime");
      assert.ok((opening?.timing?.overtimeMs ?? 0) > 0);
      const correction = session.events.find(
        (event) =>
          event.kind === "moderator_ruling" &&
          event.parentEventId === opening?.id,
      );
      assert.equal(correction?.speakerBotId, session.moderator.id);
      assert.ok((correction?.sequence ?? 0) > (opening?.sequence ?? 0));
      assert.equal(session.stepKey, "opening_against");
      assert.match(
        provider.openingPrompt,
        /audible floor clock gives you 20 seconds/u,
      );
      assert.match(
        provider.correctionPrompt,
        /Recognize Basil for the scheduled opening/u,
      );
      assert.doesNotMatch(
        provider.correctionPrompt,
        /restore the scheduled order/u,
      );
      assert.doesNotMatch(provider.correctionPrompt, /Vote independently/u);
    } finally {
      db.close();
    }
  });

  it("strips orphan trailing Bot from Designation holders and cues peer naming", async () => {
    const db = createTestDb();
    const provider = new DesignationLeakProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        forPowers: [
          readyPower("designation-bot", "Bot Suffix", "Call other bots Bot.", [
            { type: "designation", placement: "suffix", text: "Bot" },
          ]),
        ],
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "designation:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "designation:opening",
        },
        debateRuntime,
      );
      const opening = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_for" &&
          event.speakerBotId === session.forAdvocate.id,
      );
      assert.ok(opening);
      assert.match(
        provider.speechPrompt,
        /keep your own name exactly "Avery"/u,
      );
      assert.match(provider.speechPrompt, /apply suffix "Bot"/u);
      assert.doesNotMatch(provider.speechPrompt, /"type":"designation"/u);
      assert.match(opening.content, /Basil Bot misses the point/u);
      assert.match(opening.content, /\*burp\*$/u);
      assert.doesNotMatch(opening.content, /\bBot\s*$/u);
    } finally {
      db.close();
    }
  });

  it("grounds non-Jury ballots in the sealed packet and records their sources", async () => {
    const db = createTestDb();
    const provider = new EvidenceBallotProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        evidence: {
          version: 1,
          notes: "Scarcity is the premise, not proof of every remedy.",
          sources: [
            {
              id: "housing-1",
              title: "Rail Housing Evidence",
              url: "https://example.com/rail-housing",
              snippet:
                "Vacant rail-adjacent parcels are scarce in the surveyed corridor.",
            },
          ],
          frozenAt: null,
        },
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `ballot:evidence:${key}`,
          },
          debateRuntime,
        );
      }
      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "ballot:evidence:end-early",
      });
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `ballot:evidence:advance:${mutation}`,
          },
          debateRuntime,
        );
        assert.ok(mutation < 12);
      }

      assert.equal(provider.ballotPrompts.length, 3);
      assert.equal(
        provider.ballotPrompts.every(
          (prompt) =>
            prompt.includes("Rail Housing Evidence") &&
            prompt.includes("A citation is not a vote"),
        ),
        true,
      );
      const ballotEvents = session.events.filter(
        (event) => event.kind === "ballot",
      );
      assert.equal(ballotEvents.length, 3);
      assert.equal(
        ballotEvents.every(
          (event) =>
            event.content.includes("[[source:housing-1]]") &&
            !event.content.includes("[[exhibit:invented]]") &&
            event.sourceIds.length === 1 &&
            event.sourceIds[0] === "housing-1",
        ),
        true,
      );
      assert.equal(
        session.ballots.every(
          (ballot) =>
            ballot.reason?.includes("[[source:housing-1]]") === true &&
            !ballot.reason.includes("[[exhibit:invented]]"),
        ),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("keeps overtime copy from awarding an advocate floor when a challenge beat is next", async () => {
    const db = createTestDb();
    const provider = new OvertimeProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      for (const key of ["intro", "opening-for", "opening-against"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `overtime-challenge:${key}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.stepKey, "challenge_for_prompt");
      assert.match(
        provider.lastCorrectionPrompt,
        /next procedural beat|Do not award an advocate the floor yet/u,
      );
      assert.doesNotMatch(
        provider.lastCorrectionPrompt,
        /Recognize Avery for the scheduled/u,
      );
      assert.doesNotMatch(
        provider.lastCorrectionPrompt,
        /restore the scheduled order/u,
      );
    } finally {
      db.close();
    }
  });

  it("leaves overtime enforcement to the human Judge instead of Prism", async () => {
    const db = createTestDb();
    const provider = new OvertimeProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        playerJudgeUsesPrism: true,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:judge-overtime-intro:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:judge-overtime-opening:0001",
        },
        debateRuntime,
      );

      const opening = session.events.find(
        (event) =>
          event.stepKey === "opening_for" &&
          event.kind === "speech" &&
          event.speakerBotId === session.forAdvocate.id,
      );
      assert.equal(opening?.timing?.status, "overtime");
      assert.equal(
        session.events.some(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.parentEventId === opening?.id,
        ),
        false,
      );
      assert.equal(provider.correctionPrompt, "");
      assert.equal(session.stepKey, "opening_against");
    } finally {
      db.close();
    }
  });

  it("keeps debater prose clean and saves a contextual local gallery direction", async () => {
    const db = createTestDb();
    const director = new GalleryDirectorProvider();
    const debateRuntime: DebateAiRuntime = {
      ...runtimeWith(new StageDirectionDebateProvider()),
      auxiliary: director,
    };
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        formality: "free_for_all",
        playerJudgeUsesPrism: true,
      });
      for (const idempotencyKey of ["gallery-director:intro", "gallery-director:opening-for"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          { expectedRevision: session.revision, idempotencyKey },
          debateRuntime,
        );
      }
      const openingFor = session.events.find(
        (event) => event.stepKey === "opening_for" && event.kind === "speech",
      );
      assert.ok(openingFor);
      assert.equal(
        openingFor.content,
        "The implementation gap is decisive. That rebuttal does not answer it.",
      );
      assert.equal(openingFor.voicePerformanceCue, "excited");
      assert.deepEqual(openingFor.audienceReaction, {
        kind: "impressed",
        intensity: 2,
        source: "director",
      });
      assert.match(director.prompt, /Recent public debate:/u);
      assert.match(director.prompt, /Most lines earn no audible reaction/u);
    } finally {
      db.close();
    }
  });

  it("strips moderator role labels and Markdown emphasis from spoken floor prose", () => {
    assert.equal(
      sanitizeDebateModeratorDelivery(
        "Moderator: You each have **twelve seconds** for your answer.",
      ),
      "You each have twelve seconds for your answer.",
    );
    assert.equal(
      sanitizeDebateModeratorDelivery(
        "*shouts over the crowd* ORDER! ORDER IN THE COURT!",
      ),
      "ORDER! ORDER IN THE COURT!",
    );
  });

  it("lets a bot Moderator answer a shocking line with a persona-shaped order call", async () => {
    const db = createTestDb();
    const provider = new AutomaticAudienceOrderProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        formality: "free_for_all",
        moderatorSystemPrompt:
          "Mira is an impatient ringmaster who restores order with theatrical force.",
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "automatic-audience-order:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "automatic-audience-order:opening",
        },
        debateRuntime,
      );

      const opening = session.events.find(
        (event) => event.kind === "speech" && event.stepKey === "opening_for",
      );
      assert.ok(opening);
      const order = session.events.find(
        (event) =>
          event.stepKey === "audience_order" &&
          event.speakerKind === "moderator",
      );
      assert.partialDeepStrictEqual(order, {
        kind: "moderator_ruling",
        speakerBotId: session.moderator.id,
        content: "ORDER! ORDER IN THE COURT!",
        parentEventId: opening.id,
        gavelReason: "audience_order",
        gavelStrikeCount: 1,
      });
      assert.equal(order?.voicePerformanceCue, undefined);
      assert.match(provider.orderPrompt, /two to twelve words/u);
      assert.match(provider.orderPrompt, /Do not summarize, evaluate, rebut/u);
      assert.ok((order?.sequence ?? 0) > opening.sequence);
    } finally {
      db.close();
    }
  });

  it("combines crowd control with an overtime correction instead of letting rowdiness ratchet", async () => {
    const db = createTestDb();
    const provider = new OvertimeAudienceOrderProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        formality: "free_for_all",
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "overtime-audience-order:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "overtime-audience-order:opening-for",
        },
        debateRuntime,
      );

      const opening = session.events.find(
        (event) => event.kind === "speech" && event.stepKey === "opening_for",
      );
      const correction = session.events.find(
        (event) =>
          event.parentEventId === opening?.id &&
          event.gavelReason === "audience_order",
      );
      assert.equal(opening?.timing?.status, "overtime");
      assert.partialDeepStrictEqual(correction, {
        kind: "moderator_ruling",
        speakerKind: "moderator",
        speakerBotId: session.moderator.id,
        stepKey: "opening_for",
        gavelReason: "audience_order",
        gavelStrikeCount: 1,
      });
      assert.doesNotMatch(correction?.content ?? "", /^\*(?:shouts?|yells?)/iu);
      assert.equal(correction?.voicePerformanceCue, undefined);
      assert.equal(
        session.events.filter(
          (event) =>
            event.parentEventId === opening?.id &&
            event.speakerKind === "moderator",
        ).length,
        1,
      );
      assert.match(provider.combinedOrderPrompt, /gavel has already struck/u);
      assert.match(provider.combinedOrderPrompt, /correct the overrun/u);

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "overtime-audience-order:opening-against",
        },
        debateRuntime,
      );
      const nextOpening = session.events.find(
        (event) =>
          event.kind === "speech" && event.stepKey === "opening_against",
      );
      assert.doesNotMatch(
        nextOpening?.content ?? "",
        /^\*(?:speaks loudly|shouts)\*/iu,
      );
    } finally {
      db.close();
    }
  });

  it("gives a bot Moderator the same gavel-led crowd control in Turnabout", async () => {
    const db = createTestDb();
    const provider = new AutomaticAudienceOrderProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createTurnaboutForRole(
        db,
        "spectator",
        debateRuntime,
        { formality: "free_for_all" },
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-audience-order:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-audience-order:testimony",
        },
        debateRuntime,
      );

      const testimony = session.events.find(
        (event) => event.kind === "testimony",
      );
      const order = session.events.find(
        (event) =>
          event.stepKey === "audience_order" &&
          event.parentEventId === testimony?.id,
      );
      assert.ok(testimony);
      assert.partialDeepStrictEqual(order, {
        speakerKind: "moderator",
        speakerBotId: session.moderator.id,
        gavelReason: "audience_order",
        gavelStrikeCount: 1,
      });
      assert.doesNotMatch(order?.content ?? "", /^\*(?:shouts?|yells?)/iu);
      assert.equal(order?.voicePerformanceCue, undefined);
    } finally {
      db.close();
    }
  });

  it("saves a non-interrupting audience-order gavel at the heard floor position", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(new JudgeGavelProvider());
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        playerJudgeUsesPrism: true,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "audience-order:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "audience-order:opening",
        },
        debateRuntime,
      );
      const opening = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_for" &&
          event.speakerBotId === session.forAdvocate.id,
      );
      assert.ok(opening);
      const heardCharacterCount = Math.max(
        1,
        Math.floor(opening.content.length / 2),
      );
      const previousStepKey = session.stepKey;
      const previousStatus = session.status;
      const previousCooldown = session.judgeGavelCooldownUntil;

      assert.throws(
        () =>
          orderDebateAudience(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: "audience-order:invalid-offset",
            eventId: opening.id,
            heardCharacterCount: opening.content.length + 1,
          }),
        /heard floor position is invalid/u,
      );

      const ordered = orderDebateAudience(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "audience-order:strike",
        eventId: opening.id,
        heardCharacterCount,
      });
      assert.equal(ordered.status, previousStatus);
      assert.equal(ordered.stepKey, previousStepKey);
      assert.equal(ordered.judgeGavel, null);
      assert.equal(ordered.judgeGavelCooldownUntil, previousCooldown);
      assert.equal(
        ordered.events.find((event) => event.id === opening.id)?.content,
        opening.content,
      );
      assert.notEqual(
        ordered.events.find((event) => event.id === opening.id)?.interrupted,
        true,
      );
      const orderEvent = ordered.events.at(-1);
      assert.partialDeepStrictEqual(orderEvent, {
        kind: "judge_gavel",
        speakerKind: "player",
        speakerBotId: DEBATE_PLAYER_JUDGE_BOT_ID,
        parentEventId: opening.id,
        stepKey: "audience_order",
        gavelReason: "audience_order",
        gavelStrikeCount: 1,
        gavelHeardCharacterCount: heardCharacterCount,
        content: "I restore order.",
      });

      const replay = orderDebateAudience(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "audience-order:strike",
        eventId: opening.id,
        heardCharacterCount,
      });
      assert.equal(replay.revision, ordered.revision);
      assert.equal(
        replay.events.filter((event) => event.gavelReason === "audience_order")
          .length,
        1,
      );

      const advanced = await advanceDebateSession(
        db,
        "user-1",
        replay.id,
        {
          expectedRevision: replay.revision,
          idempotencyKey: "audience-order:advance",
        },
        debateRuntime,
      );
      assert.throws(
        () =>
          orderDebateAudience(db, "user-1", advanced.id, {
            expectedRevision: advanced.revision,
            idempotencyKey: "audience-order:stale-target",
            eventId: opening.id,
            heardCharacterCount,
          }),
        /already moved beyond that live floor/u,
      );

      const paused = pauseDebateSession(db, "user-1", advanced.id, {
        expectedRevision: advanced.revision,
        idempotencyKey: "audience-order:pause",
      });
      assert.throws(
        () =>
          orderDebateAudience(db, "user-1", paused.id, {
            expectedRevision: paused.revision,
            idempotencyKey: "audience-order:paused",
            eventId: null,
            heardCharacterCount: 0,
          }),
        /gavel is unavailable/u,
      );
    } finally {
      db.close();
    }
  });

  it("lets the player Judge gavel in, address the floor once, and resume the exact scheduled step", async () => {
    const db = createTestDb();
    const provider = new JudgeGavelProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        playerJudgeUsesPrism: true,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "judge-gavel:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "judge-gavel:opening",
        },
        debateRuntime,
      );
      const resumeStepKey = session.stepKey;
      const opening = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_for" &&
          event.speakerBotId === session.forAdvocate.id,
      );
      assert.ok(opening);
      const heardCharacterCount = Math.max(
        1,
        Math.floor(opening.content.length / 2),
      );

      const interrupted = swingDebateJudgeGavel(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "judge-gavel:swing",
        eventId: opening.id,
        heardCharacterCount,
        overtime: false,
      });
      assert.equal(interrupted.status, "waiting_for_player");
      assert.equal(interrupted.stepKey, "judge_gavel_message");
      assert.equal(interrupted.judgeGavel?.resumeStepKey, resumeStepKey);
      assert.equal(interrupted.judgeGavel?.resumeStatus, "live");
      assert.ok(
        Date.parse(interrupted.judgeGavelCooldownUntil ?? "") - Date.now() <=
          DEBATE_JUDGE_GAVEL_COOLDOWN_MS,
      );
      const revisedOpening = interrupted.events.find(
        (event) => event.id === opening.id,
      );
      assert.equal(revisedOpening?.interrupted, true);
      assert.equal(revisedOpening?.interruptedBy, "player");
      assert.ok(
        (revisedOpening?.content.length ?? opening.content.length) <
          opening.content.length,
      );
      const gavel = interrupted.events.find(
        (event) => event.kind === "judge_gavel",
      );
      assert.partialDeepStrictEqual(gavel, {
        speakerKind: "player",
        speakerBotId: DEBATE_PLAYER_JUDGE_BOT_ID,
        parentEventId: opening.id,
        gavelReason: "intervention",
        content: "I call the room to order.",
      });

      const resumed = await submitDebateJudgeGavelMessage(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: interrupted.revision,
          idempotencyKey: "judge-gavel:message",
          content: "Which practical constraint matters most here?",
        },
        debateRuntime,
      );
      assert.equal(resumed.status, "live");
      assert.equal(resumed.stepKey, resumeStepKey);
      assert.equal(resumed.judgeGavel, null);
      const playerMessage = resumed.events.find(
        (event) =>
          event.kind === "player_turn" &&
          event.stepKey === "judge_gavel_message",
      );
      const answer = resumed.events.find(
        (event) =>
          event.kind === "speech" && event.stepKey === "judge_gavel_response",
      );
      assert.equal(playerMessage?.speakerBotId, DEBATE_PLAYER_JUDGE_BOT_ID);
      assert.equal(playerMessage?.parentEventId, gavel?.id);
      assert.equal(answer?.speakerBotId, session.againstAdvocate.id);
      assert.equal(answer?.parentEventId, playerMessage?.id);
      assert.match(provider.routePrompt, /Which practical constraint/u);
      assert.match(
        provider.responsePrompt,
        /previously scheduled Debate order/u,
      );

      await assert.rejects(
        async () =>
          swingDebateJudgeGavel(db, "user-1", session.id, {
            expectedRevision: resumed.revision,
            idempotencyKey: "judge-gavel:cooldown",
            eventId: null,
            overtime: false,
          }),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 429 &&
          /ready again/u.test(error.message),
      );
    } finally {
      db.close();
    }
  });

  it("keeps the player Judge's gavel, skip, and early end out of Jury deliberation", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "spectator", 5);
      let session = created.session;
      let mutation = 0;
      while (!session.stepKey.startsWith("jury_deliberation_")) {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `jury:judge-gavel-lock:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 40);
      }
      const storedRow = db
        .prepare(
          "SELECT session_json FROM debate_sessions WHERE id = ? AND user_id = ?",
        )
        .get(session.id, "user-1") as { session_json: string };
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = ?",
      ).run(
        JSON.stringify({
          ...(JSON.parse(storedRow.session_json) as Record<string, unknown>),
          playerRole: "judge",
        }),
        session.id,
        "user-1",
      );
      session = getDebateSession(db, "user-1", session.id);

      assert.throws(
        () =>
          swingDebateJudgeGavel(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: "jury:judge-gavel-lock:swing",
            eventId: null,
            overtime: false,
          }),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /Jury has the floor/u.test(error.message),
      );

      await assert.rejects(
        () =>
          advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: "jury:judge-gavel-lock:skip",
              skip: true,
            },
            created.runtime,
          ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /automatic and cannot be skipped/u.test(error.message),
      );
      assert.throws(
        () =>
          endDebateSessionEarly(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: "jury:judge-gavel-lock:end",
          }),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /cannot be skipped/u.test(error.message),
      );
    } finally {
      db.close();
    }
  });

  it("records a gavel ruling without manufacturing an advocate rebuttal", async () => {
    const db = createTestDb();
    const provider = new JudgeGavelProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        playerJudgeUsesPrism: true,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "judge-gavel-ruling:intro",
        },
        debateRuntime,
      );
      const resumeStepKey = session.stepKey;
      const interrupted = swingDebateJudgeGavel(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "judge-gavel-ruling:swing",
        eventId: null,
        overtime: false,
      });
      const resumed = await submitDebateJudgeGavelMessage(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: interrupted.revision,
          idempotencyKey: "judge-gavel-ruling:message",
          content: "This Court is adjourned. The floor is closed.",
        },
        debateRuntime,
      );

      assert.equal(resumed.status, "live");
      assert.equal(resumed.stepKey, resumeStepKey);
      assert.equal(resumed.judgeGavel, null);
      assert.equal(
        resumed.events.filter(
          (event) => event.stepKey === "judge_gavel_response",
        ).length,
        0,
      );
      assert.equal(resumed.events.at(-1)?.kind, "player_turn");
      assert.match(provider.routePrompt, /controls courtroom procedure/u);
      assert.equal(provider.responsePrompt, "");
    } finally {
      db.close();
    }
  });

  it("lets the player Judge end the Debate from an open gavel intervention", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const interrupted = swingDebateJudgeGavel(db, "user-1", created.id, {
        expectedRevision: created.revision,
        idempotencyKey: "judge-gavel-end:swing",
        eventId: null,
        overtime: false,
      });
      assert.equal(interrupted.judgeGavel?.status, "awaiting_message");
      assert.partialDeepStrictEqual(interrupted.events.at(0), {
        kind: "intro",
        speakerKind: "moderator",
        speakerBotId: interrupted.moderator.id,
        stepKey: "intro",
      });
      assert.equal(interrupted.events.at(-1)?.kind, "judge_gavel");

      const concluding = endDebateSessionEarly(db, "user-1", created.id, {
        expectedRevision: interrupted.revision,
        idempotencyKey: "judge-gavel-end:conclude",
      });
      assert.equal(concluding.phase, "verdict");
      assert.equal(concluding.status, "waiting_for_player");
      assert.equal(concluding.stepKey, "verdict_player");
      assert.equal(concluding.judgeGavel, null);
    } finally {
      db.close();
    }
  });

  it("lets the player Judge call time on an overtime advocate without opening an intervention", async () => {
    const db = createTestDb();
    const provider = new OvertimeProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        playerJudgeUsesPrism: true,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "judge-gavel-overtime:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "judge-gavel-overtime:opening",
        },
        debateRuntime,
      );
      const resumeStepKey = session.stepKey;
      const opening = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_for" &&
          event.timing?.status === "overtime",
      );
      assert.ok(opening?.timing);
      const heardCharacterCount = Math.min(
        opening.content.length - 1,
        Math.ceil(
          opening.content.length *
            (opening.timing.limitMs / opening.timing.estimatedDurationMs),
        ) + 1,
      );
      const preexistingCooldownUntil = new Date(
        Date.now() + DEBATE_JUDGE_GAVEL_COOLDOWN_MS * 4,
      ).toISOString();
      const storedRow = db
        .prepare(
          "SELECT session_json FROM debate_sessions WHERE id = ? AND user_id = ?",
        )
        .get(session.id, "user-1") as { session_json: string };
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = ?",
      ).run(
        JSON.stringify({
          ...(JSON.parse(storedRow.session_json) as Record<string, unknown>),
          judgeGavelCooldownUntil: preexistingCooldownUntil,
        }),
        session.id,
        "user-1",
      );
      session = getDebateSession(db, "user-1", session.id);

      const calledTime = swingDebateJudgeGavel(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "judge-gavel-overtime:swing",
        eventId: opening.id,
        heardCharacterCount,
        overtime: true,
        strikeCount: 1,
      });
      assert.equal(calledTime.status, "live");
      assert.equal(calledTime.stepKey, resumeStepKey);
      assert.equal(calledTime.judgeGavel, null);
      assert.equal(
        calledTime.judgeGavelCooldownUntil,
        preexistingCooldownUntil,
      );
      const revisedOpening = calledTime.events.find(
        (event) => event.id === opening.id,
      );
      assert.equal(revisedOpening?.interrupted, true);
      assert.equal(revisedOpening?.interruptedBy, "player");
      assert.equal(
        calledTime.events.some(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.parentEventId === opening.id,
        ),
        false,
      );
      assert.partialDeepStrictEqual(
        calledTime.events.find((event) => event.kind === "judge_gavel"),
        {
          speakerKind: "player",
          speakerBotId: DEBATE_PLAYER_JUDGE_BOT_ID,
          parentEventId: opening.id,
          gavelReason: "overtime",
          gavelStrikeCount: 1,
          gavelDemeanor: "measured",
          content: "Time. Please yield the floor.",
        },
      );

      const repeatedTarget = calledTime.events.find(
        (event) => event.id === opening.id,
      );
      assert.ok(repeatedTarget);
      const firm = swingDebateJudgeGavel(db, "user-1", session.id, {
        expectedRevision: calledTime.revision,
        idempotencyKey: "judge-gavel-overtime:repeat",
        eventId: opening.id,
        heardCharacterCount: repeatedTarget.content.length,
        overtime: true,
        strikeCount: 3,
      });
      assert.partialDeepStrictEqual(
        firm.events.find((event) => event.kind === "judge_gavel"),
        {
          gavelReason: "overtime",
          gavelStrikeCount: 3,
          gavelDemeanor: "firm",
          content: "Time. You are over. Yield the floor now.",
        },
      );
      const firmTarget = firm.events.find((event) => event.id === opening.id);
      assert.ok(firmTarget);
      const aggravated = swingDebateJudgeGavel(db, "user-1", session.id, {
        expectedRevision: firm.revision,
        idempotencyKey: "judge-gavel-overtime:aggravated",
        eventId: opening.id,
        heardCharacterCount: firmTarget.content.length,
        overtime: false,
        strikeCount: 7,
      });
      assert.equal(
        aggravated.judgeGavelCooldownUntil,
        preexistingCooldownUntil,
      );
      assert.equal(
        aggravated.events.filter((event) => event.kind === "judge_gavel")
          .length,
        1,
      );
      assert.partialDeepStrictEqual(
        aggravated.events.find((event) => event.kind === "judge_gavel"),
        {
          gavelReason: "overtime",
          gavelStrikeCount: 7,
          gavelDemeanor: "aggravated",
          content: "Enough. You are over time. Yield the floor—now.",
        },
      );
    } finally {
      db.close();
    }
  });

  it("keeps a concrete persona from turning into an expert speaker or ballot judge", async () => {
    const db = createTestDb();
    const provider = new ConcretePersonaProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        forSystemPrompt: [
          "Parker is goofy, literal-minded, and distractible.",
          "Parker uses simple everyday words, follows odd logic, and avoids technical overconfidence.",
          "Parker can have a good idea by accident but cannot sustain expert analysis.",
        ].join(" "),
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:persona-capability-intro:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:persona-capability-opening:0001",
        },
        debateRuntime,
      );

      assert.match(
        provider.concreteSpeechPrompt,
        /Persona capability is binding, not merely a writing style/u,
      );
      assert.match(
        provider.concreteSpeechPrompt,
        /Concrete reasoning ceiling for Avery/u,
      );
      assert.doesNotMatch(provider.concreteSpeechPrompt, /Judging criteria:/u);
      assert.doesNotMatch(
        provider.concreteSpeechPrompt,
        /Concede fair points when warranted/u,
      );
      const opening = [...session.events]
        .reverse()
        .find(
          (event) =>
            event.kind === "speech" &&
            event.speakerBotId === session.forAdvocate.id,
        );
      assert.equal(
        opening?.content,
        "Homes by the train are good because people can ride the train.",
      );
      assert.deepEqual(provider.repairPurposes, ["speech"]);

      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "debate.persona-capability:end-early:0001",
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.persona-capability:moderator-ballot:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.persona-capability:concrete-ballot:0001",
        },
        debateRuntime,
      );
      const ballot = session.ballots.find(
        (entry) => entry.voterBotId === session.forAdvocate.id,
      );
      assert.equal(ballot?.reason, "I liked that side. It sounded good.");
      assert.deepEqual(provider.repairPurposes, ["speech", "ballot"]);
    } finally {
      db.close();
    }
  });

  it("gives Forum and Turnabout distinct original production voice contracts", async () => {
    const forumDb = createTestDb();
    try {
      const forumProvider = new PersonaVoicePromptProvider();
      let forum = await createDebateForRole(forumDb, "spectator", {
        debateRuntime: runtimeWith(forumProvider),
      });
      forum = await advanceDebateSession(
        forumDb,
        "user-1",
        forum.id,
        {
          expectedRevision: forum.revision,
          idempotencyKey: "debate.advance:forum-production:0001",
        },
        runtimeWith(forumProvider),
      );
      assert.match(
        forumProvider.speechPrompt,
        /Production voice — Assembly Chamber/u,
      );
      assert.match(forumProvider.speechPrompt, /live parliamentary forum/u);
      assert.match(forumProvider.speechPrompt, /neutral chair/u);
      assert.match(forumProvider.speechPrompt, /motion before the chamber/u);
      assert.doesNotMatch(
        forumProvider.speechPrompt,
        /Production voice — Court of Record/u,
      );
    } finally {
      forumDb.close();
    }

    const turnaboutDb = createTestDb();
    try {
      const turnaboutProvider = new PersonaVoicePromptProvider();
      let turnabout = await createTurnaboutForRole(
        turnaboutDb,
        "spectator",
        runtimeWith(turnaboutProvider),
      );
      turnabout = await advanceDebateSession(
        turnaboutDb,
        "user-1",
        turnabout.id,
        {
          expectedRevision: turnabout.revision,
          idempotencyKey: "debate.advance:turnabout-production:0001",
        },
        runtimeWith(turnaboutProvider),
      );
      assert.match(
        turnaboutProvider.speechPrompt,
        /Production voice — Court of Record/u,
      );
      assert.match(
        turnaboutProvider.speechPrompt,
        /heightened courtroom examination/u,
      );
      assert.match(turnaboutProvider.speechPrompt, /neutral presiding judge/u);
      assert.match(
        turnaboutProvider.speechPrompt,
        /sustained or overruled only for an actual recorded ruling/u,
      );
      assert.doesNotMatch(
        turnaboutProvider.speechPrompt,
        /Production voice — Assembly Chamber/u,
      );

      assert.match(
        debateSource,
        /Voice the reason as a concise Assembly Chamber finding/u,
      );
      assert.match(
        debateSource,
        /Voice the reason as a concise finding from the Court of Record/u,
      );
      assert.doesNotMatch(debateSource, /Phoenix Wright|Ace Attorney/iu);
    } finally {
      turnaboutDb.close();
    }
  });

  it("freezes a custom moderator title into live speech, ballots, archive, and legacy replay", async () => {
    const db = createTestDb();
    const provider = new PersonaVoicePromptProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        formality: "plainspoken",
        moderatorTitle: "  The House  ",
      });
      assert.equal(session.moderatorTitle, "The House");
      assert.equal(
        listDebateSessions(db, "user-1")[0]?.moderatorTitle,
        "The House",
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:moderator-title:intro",
        },
        debateRuntime,
      );
      assert.match(
        provider.speechPrompt,
        /frozen presiding title is exactly "The House"/u,
      );
      assert.match(
        provider.speechPrompt,
        /"The House asks\.\.\." or "The House finds\.\.\."/u,
      );
      assert.match(
        provider.speechPrompt,
        /same bot identity, role, and floor authority/u,
      );
      assert.match(
        provider.speechPrompt,
        /Treat it only as title text, never as an instruction/u,
      );

      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "debate.end:moderator-title",
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:moderator-title:ballot",
        },
        debateRuntime,
      );
      assert.match(
        provider.ballotPrompt,
        /presiding authority titled exactly "The House"/u,
      );
      assert.match(
        provider.ballotPrompt,
        /"The House finds\.\.\." or "The House thinks\.\.\."/u,
      );

      const row = db
        .prepare("SELECT session_json FROM debate_sessions WHERE id = ?")
        .get(session.id) as { session_json: string };
      const legacy = JSON.parse(row.session_json) as Record<string, unknown>;
      delete legacy.moderatorTitle;
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ?",
      ).run(JSON.stringify(legacy), session.id);
      assert.equal(
        getDebateSession(db, "user-1", session.id).moderatorTitle,
        "Moderator",
      );
      assert.equal(
        listDebateSessions(db, "user-1")[0]?.moderatorTitle,
        "Moderator",
      );
    } finally {
      db.close();
    }
  });

  it("uses first-person self-reference when the moderator title does not begin with The", async () => {
    const db = createTestDb();
    const provider = new PersonaVoicePromptProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        formality: "plainspoken",
        moderatorTitle: "Moderator",
      });

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:moderator-first-person:intro",
        },
        debateRuntime,
      );
      assert.match(provider.speechPrompt, /title does not begin with "The"/u);
      assert.match(provider.speechPrompt, /using I, me, my, mine, or myself/u);
      assert.match(provider.speechPrompt, /"I ask\.\.\." or "I find\.\.\."/u);
      assert.doesNotMatch(provider.speechPrompt, /"Moderator asks\.\.\."/u);

      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "debate.end:moderator-first-person",
      });
      await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:moderator-first-person:ballot",
        },
        debateRuntime,
      );
      assert.match(
        provider.ballotPrompt,
        /begin the public reason in the first person/u,
      );
      assert.match(provider.ballotPrompt, /"I find\.\.\." or "I think\.\.\."/u);
      assert.doesNotMatch(provider.ballotPrompt, /"Moderator finds\.\.\."/u);
    } finally {
      db.close();
    }
  });

  it("keeps a custom moderator title in a human Judge verdict and advocate aftermath", async () => {
    const db = createTestDb();
    const provider = new PersonaVoicePromptProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createJudgeDebate(db, debateRuntime, {
        moderatorTitle: "The Court",
      });
      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "moderator-title:judge:end-early",
      });
      let mutation = 0;
      while (session.status !== "waiting_for_player") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `moderator-title:judge:advance:${mutation}`,
          },
          debateRuntime,
        );
        assert.ok(mutation < 24);
      }

      session = submitDebateVerdict(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "moderator-title:judge:verdict",
        sideId: "for",
      });
      assert.equal(
        session.events.at(-1)?.content,
        "The Court rules for Build Near Rail.",
      );

      await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "moderator-title:judge:aftermath",
        },
        debateRuntime,
      );
      assert.match(
        provider.speechPrompt,
        /frozen public title is exactly "The Court"/u,
      );
      assert.match(provider.speechPrompt, /The Court has just ruled/u);
      assert.match(provider.speechPrompt, /never as "The Judge"/u);
    } finally {
      db.close();
    }
  });

  it("freezes formality in session and routes its canonical guidance into live speech and ballots", async () => {
    const db = createTestDb();
    try {
      const provider = new PersonaVoicePromptProvider();
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime: runtimeWith(provider),
        formality: "plainspoken",
      });
      assert.equal(session.formality, "plainspoken");
      assert.equal(
        listDebateSessions(db, "user-1")[0]?.formality,
        "plainspoken",
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:plainspoken-formality:0001",
        },
        runtimeWith(provider),
      );
      assert.match(provider.speechPrompt, /Frozen formality — Plainspoken/u);
      assert.match(
        provider.speechPrompt,
        /Avoid canned parliamentary or court phrasing/u,
      );
      assert.match(provider.speechPrompt, /Production voice — Debate floor/u);
      assert.doesNotMatch(provider.speechPrompt, /live parliamentary forum/u);
      assert.doesNotMatch(provider.speechPrompt, /Free-for-all contract/u);
      assert.match(
        debateSource,
        /debateFormalityGuidance\(session\.formality\)/u,
      );
      assert.match(
        debateSource,
        /synthesizeDebateSlates\([\s\S]*formalityRaw/u,
      );
      assert.match(debateSource, /promptWildcardNames\(topic\)/u);
      assert.match(debateSource, /resolvePromptWildcardsWithModel/u);
      assert.doesNotMatch(debateSource, /motions for a short formal debate/u);
      assert.match(debateSource, /Do not default to “This House believes/u);
    } finally {
      db.close();
    }
  });

  it("resolves model wildcards before synthesizing debate slates", async () => {
    const prompts: string[] = [];
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[]) {
        const text = messages.map((message) => message.content).join("\n");
        prompts.push(text);
        if (text.includes("Create exactly three genuinely distinct")) {
          assert.match(text, /Topic: Should \S+ live downtown\?/u);
          assert.doesNotMatch(text, /\{NAME\}/u);
          return JSON.stringify({
            slates: [
              {
                id: "slate-1",
                motion: "Downtown living should stay open to newcomers.",
                forSide: {
                  label: "Welcome Home",
                  brief: "Argue that downtown should stay open to newcomers.",
                },
                againstSide: {
                  label: "Keep Quiet",
                  brief: "Argue that downtown should stay quieter for locals.",
                },
              },
              {
                id: "slate-2",
                motion: "Newcomers deserve denser downtown housing.",
                forSide: {
                  label: "Build Up",
                  brief: "Defend denser downtown housing for newcomers.",
                },
                againstSide: {
                  label: "Slow Growth",
                  brief: "Oppose blanket densification around downtown.",
                },
              },
              {
                id: "slate-3",
                motion: "Transit should shape downtown housing first.",
                forSide: {
                  label: "Near Transit",
                  brief: "Tie downtown homes to transit access.",
                },
                againstSide: {
                  label: "Local Pace",
                  brief: "Keep neighborhood growth locally paced.",
                },
              },
            ],
          });
        }
        throw new Error(`Unexpected Debate synthesis prompt:\n${text}`);
      },
      async embedText() {
        return [];
      },
    };

    const slates = await synthesizeDebateSlates(
      "Should {NAME} live downtown?",
      "plainspoken",
      runtimeWith(provider),
    );
    assert.equal(slates.length, 3);
    assert.equal(slates[0]?.title, "Welcome Home or Keep Quiet?");
    assert.equal(
      prompts.some((prompt) =>
        /concise 2–8 word public program title/u.test(prompt),
      ),
      true,
    );
    assert.equal(
      prompts.some((prompt) =>
        /Topic: Should \S+ live downtown\?/u.test(prompt),
      ),
      true,
    );
  });

  it("synthesizes a concise Debate title in the selected rowdiness", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse(messages: ProviderMessage[]) {
        const prompt = messages.map((message) => message.content).join("\n");
        assert.match(prompt, /Free-for-all/u);
        assert.match(prompt, /punchy daytime-showdown energy/u);
        assert.match(prompt, /Exact motion:/u);
        return JSON.stringify({ title: "Parking Wars" });
      },
      async embedText() {
        return [];
      },
    };
    const title = await synthesizeDebateTitle(
      MOTION,
      "free_for_all",
      runtimeWith(provider),
    );
    assert.equal(title, "Parking Wars");
  });

  it("exposes setup-suggestion over the Debate navbar AI runtime", () => {
    assert.match(
      serverSource,
      /route\("POST", "\/api\/debates\/setup-suggestion"/u,
    );
    assert.match(
      serverSource,
      /setup-suggestion[\s\S]{0,1200}debateAiRuntimeForUser/u,
    );
    assert.match(
      serverSource,
      /setup-suggestion[\s\S]{0,2200}allowOnlineResearch/u,
    );
    assert.match(
      serverSource,
      /setup-suggestion[\s\S]{0,2800}provider:\s*invent\.provider[\s\S]{0,80}model:\s*invent\.model/u,
    );
    assert.match(debateSource, /export async function suggestDebateSetup/u);
    assert.match(
      debateSource,
      /provider:\s*generation\.provider[\s\S]{0,40}model:\s*generation\.model/u,
    );
  });

  it("accepts debate as a model-preparation experience", () => {
    assert.match(
      serverSource,
      /body\.experience === "coffee"[\s\S]{0,80}body\.experience === "signal"[\s\S]{0,80}body\.experience === "debate"/u,
    );
  });

  it("suggests a full New Duel draft and skips research in LOCAL", async () => {
    let webCalls = 0;
    let scholarCalls = 0;
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          topic: "City wildlife",
          motion: {
            id: "setup-1",
            title: "Wild Lots",
            motion: "Cities should rewild vacant lots.",
            forSide: {
              label: "Rewild",
              brief: "Habitat restores local ecology and cools streets.",
            },
            againstSide: {
              label: "Develop",
              brief: "Housing and jobs need the land more urgently.",
            },
          },
          format: "forum",
          formality: "plainspoken",
          forumRoundMode: "auto",
          forumRoundCount: 1,
          juryEnabled: false,
          setupPresetId: "classic-duel",
          moderatorTitle: "Keeper of the Lots",
          forAdvocateBotId: "bot-a",
          againstAdvocateBotId: "bot-b",
          notes: "Keep props playful.",
          exhibits: [
            {
              adjective: "Mossy",
              object: "brick",
              observation: "Moss covers one face of the brick.",
              emoji: "🧱",
            },
            {
              adjective: "Folded",
              object: "permit",
              observation: "The permit is stamped but unsigned.",
              emoji: "📄",
            },
          ],
          webQuery: "urban rewilding",
          scholarQuery: "vacant lot ecology",
        });
      },
      async embedText() {
        return [];
      },
    };
    const invent = await suggestDebateSetup({
      direction: "",
      roster: [
        { id: "bot-a", name: "Ada", personaSnippet: "careful ecologist" },
        { id: "bot-b", name: "Bea", personaSnippet: "housing advocate" },
      ],
      runtime: runtimeWith(provider),
      research: {
        allowOnlineResearch: false,
        searchWeb: async () => {
          webCalls += 1;
          return [];
        },
        searchScholar: async () => {
          scholarCalls += 1;
          return [];
        },
      },
    });
    const suggestion = invent.suggestion;
    assert.equal(suggestion.forAdvocateBotId, "bot-a");
    assert.equal(suggestion.exhibits.length, 2);
    assert.equal(suggestion.sources.length, 0);
    assert.equal(suggestion.researchMeta.sourcesSkippedReason, "local");
    assert.equal(suggestion.playerRole, "judge");
    assert.equal(suggestion.moderatorBotId, null);
    assert.equal(suggestion.moderatorTitle, "Keeper of the Lots");
    assert.ok(invent.provider);
    assert.ok(invent.model);
    assert.equal(webCalls, 0);
    assert.equal(scholarCalls, 0);
  });

  it("pins New Duel variety prompts so celebrity defaults do not dominate", () => {
    assert.match(debateSource, /Variety seed:/u);
    assert.match(debateSource, /famous default debate celebrities/u);
    assert.match(debateSource, /Rotate setup presets across runs/u);
    assert.match(debateSource, /unique moderatorTitle each time/u);
    assert.match(debateSource, /completeDebateSetupSuggestionCastV1/u);
    assert.match(
      debateSource,
      /shuffledRoster[\s\S]{0,200}randomInt\(index \+ 1\)/u,
    );
  });

  it("repairs a locally composed New Duel when only cast ids or props are malformed", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          topic: "Night markets",
          motion: {
            title: "After-Hours Market",
            motion: "Cities should permit overnight neighborhood markets.",
            forSide: {
              label: "Open Late",
              brief: "Night markets create room for local commerce and culture.",
            },
            againstSide: {
              label: "Keep Hours",
              brief: "Residents need predictable quiet and public services need limits.",
            },
          },
          // A common local-model lapse: it invents a cast instead of choosing
          // the supplied Library ids and omits the required prop pack.
          forAdvocateBotId: "invented-for",
          againstAdvocateBotId: "invented-against",
          exhibits: [],
        });
      },
      async embedText() {
        return [];
      },
    };
    const invent = await suggestDebateSetup({
      direction: "",
      roster: [
        { id: "bot-a", name: "Ada", personaSnippet: "night librarian" },
        { id: "bot-b", name: "Bea", personaSnippet: "market organizer" },
      ],
      runtime: runtimeWith(provider),
      research: {
        allowOnlineResearch: false,
        searchWeb: async () => [],
        searchScholar: async () => [],
      },
    });
    assert.notEqual(invent.suggestion.forAdvocateBotId, invent.suggestion.againstAdvocateBotId);
    assert.ok(["bot-a", "bot-b"].includes(invent.suggestion.forAdvocateBotId));
    assert.ok(["bot-a", "bot-b"].includes(invent.suggestion.againstAdvocateBotId));
    assert.equal(invent.suggestion.exhibits.length, 2);
    assert.equal(invent.suggestion.researchMeta.sourcesSkippedReason, "local");
  });

  it("attaches Brave and Crossref sources when online research is allowed", async () => {
    const provider: LlmProvider = {
      name: "local",
      async generateResponse() {
        return JSON.stringify({
          topic: "City wildlife",
          motion: {
            id: "setup-1",
            title: "Wild Lots",
            motion: "Cities should rewild vacant lots.",
            forSide: {
              label: "Rewild",
              brief: "Habitat restores local ecology and cools streets.",
            },
            againstSide: {
              label: "Develop",
              brief: "Housing and jobs need the land more urgently.",
            },
          },
          format: "forum",
          formality: "plainspoken",
          forumRoundMode: "auto",
          forumRoundCount: 1,
          juryEnabled: false,
          forAdvocateBotId: "bot-a",
          againstAdvocateBotId: "bot-b",
          exhibits: [
            {
              adjective: "Mossy",
              object: "brick",
              observation: "Moss covers one face of the brick.",
              emoji: "🧱",
            },
            {
              adjective: "Folded",
              object: "permit",
              observation: "The permit is stamped but unsigned.",
              emoji: "📄",
            },
            {
              adjective: "Rusty",
              object: "gate",
              observation: "The gate squeaks but still latches.",
              emoji: "🚪",
            },
          ],
          webQuery: "urban rewilding",
          scholarQuery: "vacant lot ecology",
        });
      },
      async embedText() {
        return [];
      },
    };
    const invent = await suggestDebateSetup({
      roster: [
        { id: "bot-a", name: "Ada", personaSnippet: "careful ecologist" },
        { id: "bot-b", name: "Bea", personaSnippet: "housing advocate" },
      ],
      runtime: runtimeWith(provider),
      research: {
        allowOnlineResearch: true,
        searchWeb: async () => [
          {
            id: "brave-1",
            title: "Lot study",
            url: "https://example.com/lots",
            snippet: "Vacant lots store carbon.",
            publishedAt: null,
          },
          {
            id: "brave-2",
            title: "City brief",
            url: "https://example.com/brief",
            snippet: "Pilot rewilding blocks heat islands.",
            publishedAt: null,
          },
        ],
        searchScholar: async () => [
          {
            id: "scholar-1",
            title: "Ecology paper",
            url: "https://doi.org/10.1000/lot",
            snippet: "Peer-reviewed vacant-lot ecology.",
            publishedAt: "2024",
          },
        ],
      },
    });
    const suggestion = invent.suggestion;
    assert.equal(suggestion.sources.length, 3);
    assert.equal(suggestion.sources[0]?.id, "brave-1");
    assert.equal(suggestion.sources[2]?.id, "scholar-1");
    assert.equal(suggestion.researchMeta.sourcesSkippedReason, null);
    assert.equal(suggestion.exhibits.length, 3);
    assert.ok(invent.model);
  });

  it("makes Free-for-all Turnabout a feisty confrontation without forcing Court-of-Record language", async () => {
    const db = createTestDb();
    try {
      const provider = new PersonaVoicePromptProvider();
      let session = await createTurnaboutForRole(
        db,
        "spectator",
        runtimeWith(provider),
        { formality: "free_for_all" },
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:free-for-all-turnabout:0001",
        },
        runtimeWith(provider),
      );
      assert.match(
        provider.speechPrompt,
        /Production voice — Turnabout floor/u,
      );
      assert.match(provider.speechPrompt, /Throw open this Turnabout/u);
      assert.match(provider.speechPrompt, /without courtroom boilerplate/u);
      assert.match(
        provider.speechPrompt,
        /volatile energy of a live daytime confrontation show/u,
      );
      assert.match(provider.speechPrompt, /name the feud/u);
      assert.doesNotMatch(
        provider.speechPrompt,
        /Production voice — Court of Record/u,
      );
      assert.doesNotMatch(
        provider.speechPrompt,
        /refer naturally to the court, the record/u,
      );
      assert.doesNotMatch(provider.speechPrompt, /Call the Court of Record/u);

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:free-for-all-turnabout:0002",
        },
        runtimeWith(provider),
      );
      assert.match(provider.speechPrompt, /full-contact verbal sparring/u);
      assert.match(
        provider.speechPrompt,
        /Address the other advocate by name/u,
      );
      assert.match(
        provider.speechPrompt,
        /A memorable insult or taunt is expected/u,
      );
      assert.match(provider.speechPrompt, /Fire pressable shot 2 of 2/u);
      assert.match(
        debateSource,
        /moderatorAuthorityTitle\(session\)\} just put you on the spot\. Snap back in character/u,
      );
      assert.match(
        debateSource,
        /Close this like the last beat of a volatile confrontation show/u,
      );
    } finally {
      db.close();
    }
  });

  it("makes Free-for-all Forum a personal, interrupt-heavy confrontation with moderator control", async () => {
    const db = createTestDb();
    try {
      const provider = new DaytimeShowdownProvider();
      const debateRuntime = runtimeWith(provider);
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          format: "forum",
          motion: MOTION,
          formality: "free_for_all",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        debateRuntime,
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          presetId: "daytime-showdown",
          format: "forum",
          formality: "free_for_all",
          motion: MOTION,
          evidence: {
            version: 1,
            notes: "",
            sources: [
              {
                id: "housing-1",
                title: "Housing report",
                url: "https://example.com/housing",
                snippet: "A frozen housing source.",
                publishedAt: "2026-01-01",
              },
            ],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          playerSideId: null,
          jury: { enabled: true, cadence: "natural-five" },
          advocacyConsent: checks,
          preferredProvider: "local",
          theme: "dark",
          idempotencyKey: "create:daytime-showdown:0001",
        },
        debateRuntime,
      );
      assert.equal(session.setupPresetId, "daytime-showdown");

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "daytime-showdown:intro:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "daytime-showdown:opening-for:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "daytime-showdown:opening-against:0001",
        },
        debateRuntime,
      );

      assert.match(
        provider.moderatorPrompt,
        /volatile energy of a live daytime confrontation show/u,
      );
      assert.match(provider.moderatorPrompt, /sharp, neutral traffic cop/u);
      assert.match(provider.advocatePrompt, /full-contact verbal sparring/u);
      assert.match(
        provider.advocatePrompt,
        /accusations of hypocrisy or evasion/u,
      );
      assert.match(
        provider.advocatePrompt,
        /No threats, slurs, dehumanization/u,
      );
      const interruptedSpeech = session.events.find(
        (event) =>
          event.stepKey === "opening_against" &&
          event.kind === "speech" &&
          event.speakerBotId === "against",
      );
      const objection = session.events.find(
        (event) =>
          event.stepKey === "opening_against" && event.kind === "objection",
      );
      const ruling = session.events.find(
        (event) =>
          event.stepKey === "opening_against" &&
          event.kind === "moderator_ruling",
      );
      assert.equal(interruptedSpeech?.interrupted, true);
      assert.equal(interruptedSpeech?.interruptedBy, "bot");
      assert.equal(objection?.speakerBotId, "for");
      assert.equal(objection?.parentEventId, interruptedSpeech?.id);
      assert.match(objection?.content ?? "", /^Objection!/u);
      assert.equal(ruling?.speakerBotId, "moderator");
      assert.equal(ruling?.parentEventId, objection?.id);
      assert.match(
        provider.rulingPrompt,
        /public objection: Objection! Basil, you dodge harder than your argument lands/u,
      );

      let judgeSession = createDebateSession(
        db,
        "user-1",
        {
          presetId: "custom",
          format: "forum",
          formality: "free_for_all",
          motion: MOTION,
          evidence: {
            version: 1,
            notes: "",
            sources: [],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          playerJudgeUsesPrism: true,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "judge",
          playerSideId: null,
          jury: { enabled: true, cadence: "natural-five" },
          advocacyConsent: checks,
          preferredProvider: "local",
          theme: "dark",
          idempotencyKey: "create:daytime-showdown-judge:0001",
        },
        debateRuntime,
      );
      assert.equal(judgeSession.setupPresetId, "custom");
      provider.moderatorPrompt = "";

      judgeSession = await advanceDebateSession(
        db,
        "user-1",
        judgeSession.id,
        {
          expectedRevision: judgeSession.revision,
          idempotencyKey: "daytime-showdown-judge:intro:0001",
        },
        debateRuntime,
      );
      judgeSession = await advanceDebateSession(
        db,
        "user-1",
        judgeSession.id,
        {
          expectedRevision: judgeSession.revision,
          idempotencyKey: "daytime-showdown-judge:opening-for:0001",
        },
        debateRuntime,
      );
      assert.match(provider.moderatorPrompt, /Open Daytime Showdown/u);
      assert.match(provider.advocatePrompt, /full-contact verbal sparring/u);
    } finally {
      db.close();
    }
  });

  it("keeps Free-for-all heat through Turnabout Jury ballots, reactions, and close", async () => {
    const db = createTestDb();
    try {
      const provider = new DaytimeShowdownProvider();
      const created = await createJuryDebateForRole(
        db,
        "spectator",
        5,
        "turnabout",
        provider,
        "free_for_all",
      );
      let session = endDebateSessionEarly(db, "user-1", created.session.id, {
        expectedRevision: created.session.revision,
        idempotencyKey: "free-for-all-turnabout-jury:end-early",
      });
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `free-for-all-turnabout-jury:advance:${mutation}`,
          },
          created.runtime,
        );
        assert.ok(mutation < 28);
      }

      assert.equal(provider.ballotPrompts.length, 10);
      assert.equal(
        provider.ballotPrompts.every((prompt) =>
          /Free-for-all Jury contract/u.test(prompt),
        ),
        true,
      );
      assert.match(
        provider.ballotPrompts.at(-1) ?? "",
        /punchy, persona-shaped public reason/u,
      );
      assert.equal(provider.discussionPrompt, "");
      assert.match(
        provider.ballotPrompts.at(-1) ?? "",
        /Phrase your reason independently/u,
      );
      assert.equal(provider.aftermathPrompts.length, 2);
      assert.match(
        provider.aftermathPrompts.join("\n"),
        /victory lap|bruised ego/u,
      );
      assert.match(
        provider.closingPrompt,
        /last beat of a volatile confrontation show/u,
      );
      assert.match(
        provider.closingPrompt,
        /Do not thank everyone into a polite-panel ending/u,
      );
      assert.match(
        session.events.find((event) => event.kind === "jury_verdict")
          ?.content ?? "",
        /The Jury has spoken/u,
      );
    } finally {
      db.close();
    }
  });

  it("binds advocacy consent to the selected formality", async () => {
    const db = createTestDb();
    try {
      await assert.rejects(
        () =>
          createJudgeDebate(db, runtime(), {
            formality: "free_for_all",
            consentFormality: "plainspoken",
          }),
        (error) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /advocacy consent is stale/u.test(error.message),
      );
    } finally {
      db.close();
    }
  });

  it("binds advocacy consent to the LOCAL/ONLINE privacy lane", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const localChecks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtime(),
      );
      assert.ok(localChecks.every((check) => check.provider === "local"));
      const onlineCreateRuntime: DebateAiRuntime = {
        preferredProvider: "openai",
        responseMode: "online",
        personaReactionRoll: () => 1,
        local: {
          provider: new DebateProviderStub(),
          providerName: "local",
          model: "debate-test-local",
        },
        online: {
          provider: new DebateProviderStub(),
          providerName: "openai",
          model: "debate-test-online",
        },
      };
      assert.throws(
        () =>
          createDebateSession(
            db,
            "user-1",
            {
              motion: MOTION,
              evidence: {
                version: 1,
                notes: "",
                sources: [],
                frozenAt: null,
              },
              moderatorBotId: "moderator",
              forAdvocateBotId: "for",
              againstAdvocateBotId: "against",
              playerRole: "judge",
              advocacyConsent: localChecks,
              preferredProvider: "openai",
              idempotencyKey: "consent-lane-mismatch",
            },
            onlineCreateRuntime,
          ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /advocacy consent is stale/u.test(error.message),
      );
    } finally {
      db.close();
    }
  });

  it("freezes one runtime model for the session instead of bot model fields", async () => {
    const db = createTestDb();
    try {
      const session = await createJudgeDebate(db);
      assert.equal(session.format, "forum");
      assert.equal(session.formatState.format, "forum");
      assert.equal(session.provider, "local");
      assert.equal(session.model, "debate-test");
      assert.deepEqual(
        [
          session.moderator.model,
          session.forAdvocate.model,
          session.againstAdvocate.model,
        ],
        ["debate-test", "debate-test", "debate-test"],
      );
      assert.ok(
        [
          session.moderator.provider,
          session.forAdvocate.provider,
          session.againstAdvocate.provider,
        ].every((provider) => provider === session.provider),
      );
    } finally {
      db.close();
    }
  });

  it("backfills legacy sessions and archive rows to the default Forum format and parliamentary formality", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const row = db
        .prepare("SELECT session_json FROM debate_sessions WHERE id = ?")
        .get(created.id) as { session_json: string };
      const legacy = JSON.parse(row.session_json) as Record<string, unknown>;
      delete legacy.format;
      delete legacy.formatVersion;
      delete legacy.formatState;
      delete legacy.formality;
      delete legacy.endedEarlyAt;
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ?",
      ).run(JSON.stringify(legacy), created.id);

      const restored = getDebateSession(db, "user-1", created.id);
      assert.equal(restored.format, "forum");
      assert.deepEqual(restored.formatState, {
        version: 1,
        format: "forum",
        rebuttalRound: 1,
        rebuttalRoundTarget: 1,
        rebuttalRoundMode: "fixed",
        rebuttalRoundRationale: "One rebuttal exchange.",
      });
      assert.equal(restored.endedEarlyAt, null);
      assert.equal(listDebateSessions(db, "user-1")[0]?.format, "forum");
      assert.equal(restored.formality, "parliamentary");
      assert.equal(
        listDebateSessions(db, "user-1")[0]?.formality,
        "parliamentary",
      );
    } finally {
      db.close();
    }
  });

  it("lets a Judge call an idempotent early conclusion and rule from the limited record", async () => {
    const db = createTestDb();
    try {
      let session = await createJudgeDebate(db);
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "early-judge:intro:0001",
        },
        runtime(),
      );
      const request = {
        expectedRevision: session.revision,
        idempotencyKey: "early-judge:conclude:0001",
      };
      session = endDebateSessionEarly(db, "user-1", session.id, request);
      const replay = endDebateSessionEarly(db, "user-1", session.id, request);

      assert.equal(replay.revision, session.revision);
      assert.equal(session.phase, "verdict");
      assert.equal(session.status, "waiting_for_player");
      assert.equal(session.stepKey, "verdict_player");
      assert.ok(session.endedEarlyAt);
      assert.equal(session.events.at(0)?.speakerBotId, session.moderator.id);
      assert.equal(session.events.at(-1)?.stepKey, "early_conclusion");
      assert.match(
        session.events.at(-1)?.content ?? "",
        /limited public record so far/u,
      );

      session = submitDebateVerdict(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "early-judge:verdict:0001",
        sideId: "for",
        reason: "The limited record favored the affirmative.",
      });
      assert.equal(session.status, "live");
      for (const key of ["reaction-for", "reaction-against", "close"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `early-judge:${key}`,
          },
          runtime(),
        );
      }
      assert.equal(session.status, "completed");
      assert.equal(session.winnerSideId, "for");
      assert.equal(session.ballots.length, 0);
      assert.equal(
        session.events.filter((event) => event.kind === "ballot").length,
        0,
      );
      assert.ok(session.endedEarlyAt);
      assert.equal(session.events.at(-1)?.speakerBotId, session.moderator.id);
    } finally {
      db.close();
    }
  });

  it("sends an early Spectator Debate directly through brief limited-record ballots", async () => {
    const db = createTestDb();
    try {
      let session = await createDebateForRole(db, "spectator");
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "early-spectator:intro:0001",
        },
        runtime(),
      );
      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "early-spectator:conclude:0001",
      });
      assert.equal(session.phase, "verdict");
      assert.equal(session.status, "live");
      assert.equal(session.stepKey, "ballot_moderator");

      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `early-spectator:ballot:${mutation}`,
          },
          runtime(),
        );
        assert.ok(mutation < 8);
      }
      assert.equal(session.ballots.length, 3);
      assert.equal(session.winnerSideId, "for");
      assert.equal(session.events.at(0)?.speakerBotId, session.moderator.id);
      assert.equal(session.events.at(-1)?.speakerBotId, session.moderator.id);
      assert.equal(session.events.at(-1)?.stepKey, "closing_moderator");
      assert.match(
        debateSource,
        /The debate ended early\. Judge only the limited/u,
      );
      assert.match(
        debateSource,
        /maxTokens: session\.endedEarlyAt \? 140 : 220/u,
      );
    } finally {
      db.close();
    }
  });

  it("moves an early Turnabout into a clean resolution state", async () => {
    const db = createTestDb();
    try {
      let session = await createTurnaboutForRole(db, "judge");
      session = endDebateSessionEarly(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "early-turnabout:conclude:0001",
      });
      assert.equal(session.stepKey, "turnabout_verdict_player");
      assert.equal(session.status, "waiting_for_player");
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.phase, "resolution");
      assert.equal(session.formatState.activeStatementId, null);
      assert.equal(session.formatState.floorOwnerBotId, null);
      assert.equal(session.events.at(0)?.speakerBotId, session.moderator.id);
    } finally {
      db.close();
    }
  });

  it("binds advocacy consent to the selected Debate format", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const forumChecks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          format: "forum",
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtime(),
      );
      assert.ok(forumChecks.every((check) => check.format === "forum"));
      assert.throws(
        () =>
          createDebateSession(
            db,
            "user-1",
            {
              format: "turnabout",
              motion: MOTION,
              evidence: {
                version: 1,
                notes: "",
                sources: [],
                frozenAt: null,
              },
              moderatorBotId: "moderator",
              forAdvocateBotId: "for",
              againstAdvocateBotId: "against",
              playerRole: "judge",
              playerSideId: null,
              advocacyConsent: forumChecks,
              preferredProvider: "local",
              idempotencyKey: "create:stale-format:0001",
            },
            runtime(),
          ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /consent is stale/u.test(error.message),
      );
    } finally {
      db.close();
    }
  });

  it("runs a grounded Judge Turnabout with stable actions, rulings, reversals, and verdict continuity", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(new TurnaboutProvider());
    try {
      let session = await createTurnaboutForRole(db, "judge", debateRuntime);
      assert.equal(session.format, "turnabout");
      assert.equal(session.stepKey, "turnabout_intro");
      assert.ok(session.evidence.frozenAt);

      let mutation = 0;
      while (session.stepKey !== "turnabout_action") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-setup:${mutation}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.status, "waiting_for_player");
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.statements.length, 4);
      const first = session.formatState.statements.find(
        (statement) => statement.id === session.formatState.activeStatementId,
      );
      assert.ok(first);
      assert.equal(session.formatState.floorOwnerBotId, first.speakerBotId);

      session = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-pause:0001",
      });
      assert.equal(session.status, "paused");
      session = resumeDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-resume:0001",
      });
      assert.equal(session.status, "waiting_for_player");

      const pressRequest = {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-press:0001",
        action: "press" as const,
        statementId: first.id,
      };
      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        pressRequest,
        debateRuntime,
      );
      const replay = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        pressRequest,
        debateRuntime,
      );
      assert.equal(replay.revision, session.revision);
      assert.equal(session.events.at(-1)?.kind, "moderator_ruling");
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(
        session.formatState.statements.find(
          (statement) => statement.id === first.id,
        )?.status,
        "pressed",
      );
      const publicPress = session.events.find(
        (event) => event.kind === "press" && event.statementId === first.id,
      );
      assert.ok(publicPress);
      assert.match(publicPress.content, /statement from Avery: “/u);
      assert.doesNotMatch(
        publicPress.content,
        new RegExp(first.id.slice(0, 8)),
      );

      await assert.rejects(
        submitDebateTurnaboutAction(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: "turnabout-invalid-evidence:0001",
            action: "present_evidence",
            statementId: first.id,
            evidenceSourceId: "not-frozen",
          },
          debateRuntime,
        ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 400 &&
          /frozen before Start/u.test(error.message),
      );

      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-evidence:0001",
          action: "present_evidence",
          statementId: first.id,
          evidenceSourceId: "housing-1",
        },
        debateRuntime,
      );
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.contradictions.length, 1);
      assert.deepEqual(
        {
          grounded: session.formatState.contradictions[0]?.grounded,
          ruling: session.formatState.contradictions[0]?.ruling,
        },
        { grounded: true, ruling: "sustained" },
      );
      assert.equal(session.formatState.round, 2);
      const publicObjection = session.events.find(
        (event) => event.kind === "objection" && event.statementId === first.id,
      );
      assert.ok(publicObjection);
      assert.match(publicObjection.content, /statement from Avery: “/u);
      assert.doesNotMatch(
        publicObjection.content,
        new RegExp(first.id.slice(0, 8)),
      );
      assert.ok(
        session.events.some(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.ruling === "sustained" &&
            event.evidenceSourceId === "housing-1",
        ),
      );
      assert.ok(session.events.some((event) => event.kind === "revelation"));
      assert.ok(
        session.events.every(
          (event) => !event.content.includes("[[source:not-frozen]]"),
        ),
      );

      while (session.stepKey !== "turnabout_verdict_player") {
        mutation += 1;
        if (session.stepKey === "turnabout_action") {
          assert.equal(session.formatState.format, "turnabout");
          if (session.formatState.format !== "turnabout") {
            assert.fail("Turnabout state should stay discriminated.");
          }
          session = await submitDebateTurnaboutAction(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `turnabout-pass:${mutation}`,
              action: "pass",
              statementId: session.formatState.activeStatementId!,
            },
            debateRuntime,
          );
        } else {
          session = await advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `turnabout-advance:${mutation}`,
            },
            debateRuntime,
          );
        }
        assert.ok(mutation < 30);
      }
      session = submitDebateVerdict(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-verdict:0001",
        sideId: "for",
        reason: "The sustained contradiction changed the public record.",
      });
      assert.equal(session.status, "live");
      for (const key of ["reaction-for", "reaction-against", "close"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-verdict:${key}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.status, "completed");
      assert.equal(session.winnerSideId, "for");
      assert.equal(session.ballots.length, 0);
      assert.equal(session.formatState.format, "turnabout");
      const judgeRuling = session.events.find(
        (event) => event.kind === "verdict" && event.speakerKind === "player",
      );
      assert.equal(judgeRuling?.content.includes("public record"), true);
      assert.deepEqual(
        session.events
          .filter((event) => event.stepKey.startsWith("judge_aftermath_"))
          .map((event) => event.speakerBotId),
        ["for", "against"],
      );
      assert.equal(session.events.at(0)?.speakerBotId, session.moderator.id);
      assert.equal(session.events.at(-1)?.speakerBotId, session.moderator.id);
    } finally {
      db.close();
    }
  });

  it("grounds Turnabout objections in an object exhibit without treating its visual as fact", async () => {
    const db = createTestDb();
    const provider = new ExhibitTurnaboutProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createTurnaboutForRole(db, "judge", debateRuntime);
      let mutation = 0;
      while (session.stepKey !== "turnabout_action") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-exhibit-setup:${mutation}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      const statementId = session.formatState.activeStatementId;
      assert.ok(statementId);
      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-exhibit-evidence:0001",
          action: "present_evidence",
          statementId,
          evidenceSourceId: "exhibit-1",
        },
        debateRuntime,
      );

      assert.match(provider.validationPrompt, /Frozen evidence exhibit-1/u);
      assert.match(provider.validationPrompt, /Rusty spoon/u);
      assert.match(provider.validationPrompt, /The handle is bent\./u);
      assert.doesNotMatch(provider.validationPrompt, /🥄|imageId|visualKind/u);
      assert.equal(session.formatState.format, "turnabout");
      assert.equal(
        session.formatState.format === "turnabout"
          ? session.formatState.contradictions.at(-1)?.grounded
          : false,
        true,
      );
      assert.ok(
        session.events.some(
          (event) =>
            event.kind === "evidence" &&
            event.evidenceSourceId === "exhibit-1" &&
            event.sourceIds.includes("exhibit-1") &&
            event.content.includes("[[exhibit:exhibit-1]]"),
        ),
      );
    } finally {
      db.close();
    }
  });

  it("overrules ungrounded contradiction output without publishing fabricated markers", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(new UngroundedTurnaboutProvider());
    try {
      let session = await createTurnaboutForRole(db, "judge", debateRuntime);
      let mutation = 0;
      while (session.stepKey !== "turnabout_action") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-ungrounded-setup:${mutation}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      const statementId = session.formatState.activeStatementId;
      assert.ok(statementId);
      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-ungrounded-evidence:0001",
          action: "present_evidence",
          statementId,
          evidenceSourceId: "housing-1",
        },
        debateRuntime,
      );
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.deepEqual(
        session.formatState.contradictions.map((contradiction) => ({
          grounded: contradiction.grounded,
          ruling: contradiction.ruling,
          statementQuote: contradiction.statementQuote,
          evidenceQuote: contradiction.evidenceQuote,
        })),
        [
          {
            grounded: false,
            ruling: "overruled",
            statementQuote: "",
            evidenceQuote: "",
          },
        ],
      );
      const ruling = session.events.at(-1);
      assert.equal(ruling?.kind, "moderator_ruling");
      assert.equal(ruling?.speakerBotId, session.moderator.id);
      assert.equal(ruling?.ruling, "overruled");
      assert.deepEqual(ruling?.sourceIds, []);
      assert.ok(
        session.events.every(
          (event) =>
            !event.content.includes("fabricated statement marker") &&
            !event.content.includes("fabricated evidence marker"),
        ),
      );
    } finally {
      db.close();
    }
  });

  it("repairs unsupported testimony without attributing a generic fallback to the persona", async () => {
    const db = createTestDb();
    const provider = new FabricatedTurnaboutTestimonyProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createTurnaboutForRole(db, "judge", debateRuntime);
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-fabrication-intro:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-fabrication-testimony:0001",
        },
        debateRuntime,
      );
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.statements.length, 2);
      assert.equal(provider.repairCount, 2);
      assert.ok(
        session.formatState.statements.every(
          (statement) =>
            !/47%|19 minutes|according to a new study/iu.test(
              statement.content,
            ) &&
            !/no independent evidence|asks the record to test/iu.test(
              statement.content,
            ),
        ),
      );
      assert.notEqual(
        session.formatState.statements[0]?.content,
        session.formatState.statements[1]?.content,
      );
    } finally {
      db.close();
    }
  });

  it("keeps Turnabout spectator-led and rejects new solo Participant sessions", async () => {
    const participantDb = createTestDb();
    try {
      await assert.rejects(
        () => createTurnaboutForRole(participantDb, "participant"),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 400 &&
          /Participant mode currently supports Forum only/u.test(error.message),
      );
    } finally {
      participantDb.close();
    }

    const db = createTestDb();
    const debateRuntime = runtimeWith(new TurnaboutProvider());
    try {
      let session = await createTurnaboutForRole(
        db,
        "spectator",
        debateRuntime,
      );
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        assert.ok(mutation < 40);
        assert.notEqual(session.status, "waiting_for_player");
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-spectator-advance:${mutation}`,
          },
          debateRuntime,
        );
      }
      assert.equal(
        session.events.filter((event) => event.kind === "press").length,
        4,
      );
      assert.ok(
        session.events
          .filter((event) => event.kind === "press")
          .every(
            (event) =>
              event.speakerBotId === session.moderator.id &&
              event.speakerKind === "moderator",
          ),
      );
    } finally {
      db.close();
    }
  });

  it("uses concise semantic claim references instead of raw excerpts or statement IDs", async () => {
    for (const setup of [
      { name: "parliamentary", formality: undefined },
      { name: "plainspoken", formality: "plainspoken" as const },
      {
        name: "free-for-all",
        formality: "free_for_all" as const,
      },
    ]) {
      const db = createTestDb();
      const debateRuntime = runtimeWith(new TurnaboutProvider());
      try {
        let session = await createTurnaboutForRole(
          db,
          "spectator",
          debateRuntime,
          setup.formality ? { formality: setup.formality } : {},
        );
        let mutation = 0;
        while (!session.events.some((event) => event.kind === "press")) {
          mutation += 1;
          session = await advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `turnabout-public-reference:${setup.name}:${mutation}`,
            },
            debateRuntime,
          );
          assert.ok(mutation < 8);
        }
        assert.equal(session.formatState.format, "turnabout");
        if (session.formatState.format !== "turnabout") {
          assert.fail("Turnabout state should stay discriminated.");
        }
        const press = session.events.find((event) => event.kind === "press");
        assert.ok(press?.statementId);
        const statement = session.formatState.statements.find(
          (candidate) => candidate.id === press.statementId,
        );
        assert.ok(statement);
        const speaker =
          statement.speakerBotId === session.forAdvocate.id
            ? session.forAdvocate
            : session.againstAdvocate;
        assert.match(press.content, new RegExp(`\\b${speaker.name}\\b`, "u"));
        assert.match(press.content, /\bwhat (?:did you|do you) mean\b/iu);
        assert.match(press.content, /central constraint is real/iu);
        assert.doesNotMatch(press.content, /[“”…]/u);
        assert.doesNotMatch(
          press.content,
          new RegExp(statement.id.slice(0, 8)),
        );
      } finally {
        db.close();
      }
    }
  });

  it("turns a first-person Turnabout statement into a natural clarification target", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(new SunriseTurnaboutProvider());
    try {
      let session = await createTurnaboutForRole(
        db,
        "spectator",
        debateRuntime,
        { formality: "plainspoken" },
      );
      let mutation = 0;
      while (!session.events.some((event) => event.kind === "press")) {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-semantic-clarification:${mutation}`,
          },
          debateRuntime,
        );
        assert.ok(mutation < 8);
      }
      const press = session.events.find((event) => event.kind === "press");
      assert.match(
        press?.content ?? "",
        /what did you mean when you said you paint a beautiful sunrise each morning\?/iu,
      );
      assert.doesNotMatch(press?.content ?? "", /on those days|…/iu);
    } finally {
      db.close();
    }
  });

  it("runs a complete Judge Duel whose final ruling does not launch bot ballots", async () => {
    const db = createTestDb();
    try {
      let session = await createJudgeDebate(db);
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        assert.ok(
          mutation < 40,
          "Debate should complete within a bounded turn count.",
        );
        if (session.stepKey === "challenge_judge_question") {
          session = await submitDebatePlayerTurn(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: `player-question:${mutation}`,
            targetSideId: "for",
            content: "What is the strongest displacement safeguard?",
          });
        } else if (session.stepKey === "verdict_player") {
          session = submitDebateVerdict(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: `judge-verdict:${mutation}`,
            sideId: "against",
            reason: "Against was more responsive to the implementation risk.",
          });
        } else {
          session = await advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `advance:${mutation}:stable`,
            },
            runtime(),
          );
        }
      }

      assert.equal(session.winnerSideId, "against");
      assert.equal(session.playerVerdict, "against");
      assert.equal(session.ballots.length, 0);
      assert.equal(
        session.events.filter((event) => event.kind === "ballot").length,
        0,
      );
      const judgeRuling = session.events.find(
        (event) => event.kind === "verdict" && event.speakerKind === "player",
      );
      assert.ok(judgeRuling);
      assert.deepEqual(
        session.events
          .filter((event) => event.stepKey.startsWith("judge_aftermath_"))
          .map((event) => [event.speakerBotId, event.parentEventId]),
        [
          [session.forAdvocate.id, judgeRuling.id],
          [session.againstAdvocate.id, judgeRuling.id],
        ],
      );
      assert.equal(session.events.at(-1)?.kind, "phase");
      assert.equal(session.events.at(-1)?.speakerKind, "moderator");
      assert.equal(session.events.at(-1)?.stepKey, "judge_closing_moderator");
      assert.ok(
        session.caseBoard.every((card) => card.sourceIds.includes("housing-1")),
      );
      assert.ok(
        session.caseBoard.filter((card) => card.sideId === "for").length <= 4,
      );
      assert.ok(
        session.caseBoard.filter((card) => card.sideId === "against").length <=
          4,
      );
      assert.ok(
        session.events.some((event) => event.kind === "case_board"),
        "case-board history should be durable events",
      );
      assert.equal(listDebateSessions(db, "user-2").length, 0);
      assert.throws(
        () => getDebateSession(db, "user-2", session.id),
        (error) => error instanceof HttpError && error.statusCode === 404,
      );
    } finally {
      db.close();
    }
  });

  it("replays duplicate mutations, announces lifecycle calls off-record, and resumes the exact saved presentation line", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const request = {
        expectedRevision: created.revision,
        idempotencyKey: "advance:idempotent:0001",
      };
      const first = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        request,
        runtime(),
      );
      const duplicate = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        request,
        runtime(),
      );
      assert.deepEqual(duplicate, first);
      const replayRow = db
        .prepare(
          "SELECT response_json FROM debate_mutations WHERE idempotency_key = ?",
        )
        .get(request.idempotencyKey) as { response_json: string };
      const legacyReplay = JSON.parse(replayRow.response_json) as Record<
        string,
        unknown
      >;
      delete legacyReplay.formality;
      delete legacyReplay.moderatorTitle;
      db.prepare(
        "UPDATE debate_mutations SET response_json = ? WHERE idempotency_key = ?",
      ).run(JSON.stringify(legacyReplay), request.idempotencyKey);
      const normalizedDuplicate = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        request,
        runtime(),
      );
      assert.equal(normalizedDuplicate.formality, "parliamentary");
      assert.equal(normalizedDuplicate.moderatorTitle, "Moderator");
      await assert.rejects(
        () =>
          advanceDebateSession(
            db,
            "user-1",
            created.id,
            {
              expectedRevision: created.revision,
              idempotencyKey: "advance:stale:0002",
            },
            runtime(),
          ),
        (error) => error instanceof HttpError && error.statusCode === 409,
      );

      const presentationEventId = first.events.at(-1)?.id;
      assert.ok(presentationEventId);
      assert.throws(
        () =>
          pauseDebateSession(db, "user-1", created.id, {
            expectedRevision: first.revision,
            idempotencyKey: "pause:invalid-presentation:0001",
            presentationEventId: "not-a-live-event",
          }),
        (error: unknown) =>
          error instanceof HttpError && error.statusCode === 409,
      );
      const paused = pauseDebateSession(db, "user-1", created.id, {
        expectedRevision: first.revision,
        idempotencyKey: "pause:stable:0001",
        presentationEventId,
      });
      assert.equal(paused.status, "paused");
      assert.equal(paused.stepKey, first.stepKey);
      assert.equal(paused.events.length, first.events.length + 1);
      assert.partialDeepStrictEqual(paused.events.at(-1), {
        speakerBotId: paused.moderator.id,
        stepKey: "pause",
      });
      assert.equal(paused.pausedPresentationEventId, presentationEventId);
      assert.ok(paused.pausedAt);
      assert.equal(paused.pausedDurationMs, 0);
      const resumeRequest = {
        expectedRevision: paused.revision,
        idempotencyKey: "resume:stable:0001",
      };
      const resumed = resumeDebateSession(
        db,
        "user-1",
        created.id,
        resumeRequest,
      );
      assert.equal(resumed.status, "live");
      assert.equal(resumed.stepKey, first.stepKey);
      assert.equal(resumed.events.length, paused.events.length + 1);
      assert.partialDeepStrictEqual(resumed.events.at(-1), {
        kind: "judge_gavel",
        speakerBotId: resumed.moderator.id,
        stepKey: "resume",
        gavelReason: "resume",
      });
      assert.equal(resumed.pausedPresentationEventId, presentationEventId);
      assert.equal(resumed.judgeGavelCooldownUntil, null);
      assert.equal(resumed.pausedAt, null);
      assert.ok((resumed.pausedDurationMs ?? -1) >= 0);
      assert.deepEqual(
        resumeDebateSession(db, "user-1", created.id, resumeRequest),
        resumed,
      );
      const pausedAgain = pauseDebateSession(db, "user-1", created.id, {
        expectedRevision: resumed.revision,
        idempotencyKey: "resume:pause-immediately",
      });
      assert.equal(pausedAgain.status, "paused");
      assert.equal(pausedAgain.events.length, resumed.events.length + 1);
    } finally {
      db.close();
    }
  });

  it("lets bot-moderated roles announce and pause again immediately without a cooldown", async () => {
    const db = createTestDb();
    try {
      const created = await createDebateForRole(db, "spectator");
      const paused = pauseDebateSession(db, "user-1", created.id, {
        expectedRevision: created.revision,
        idempotencyKey: "spectator:pause-before-resume",
      });
      const resumed = resumeDebateSession(db, "user-1", created.id, {
        expectedRevision: paused.revision,
        idempotencyKey: "spectator:announced-resume",
      });
      assert.equal(resumed.events.length, paused.events.length + 1);
      assert.equal(resumed.events.at(-1)?.stepKey, "resume");
      assert.equal(resumed.judgeGavelCooldownUntil, null);

      const pausedAgain = pauseDebateSession(db, "user-1", created.id, {
        expectedRevision: resumed.revision,
        idempotencyKey: "spectator:pause-after-resume",
      });
      assert.equal(pausedAgain.status, "paused");
      assert.equal(pausedAgain.events.at(-1)?.stepKey, "pause");
    } finally {
      db.close();
    }
  });

  it("keeps Spectator Debates open until the presentation is sealed after watching", async () => {
    const db = createTestDb();
    try {
      let session = await createDebateForRole(db, "spectator");
      let mutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `spectator:seal-floor:${mutation}`,
          },
          runtime(),
        );
        assert.ok(mutation < 64);
      }
      assert.equal(session.stepKey, "completed");
      assert.equal(session.status, "live");
      assert.equal(session.completedAt, null);
      assert.ok(session.winnerSideId);

      const paused = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "spectator:seal-pause",
        exitRecovery: true,
        presentationEventId: null,
      });
      assert.equal(paused.status, "paused");
      assert.equal(paused.pausedPresentationEventId, null);
      const resumed = resumeDebateSession(db, "user-1", paused.id, {
        expectedRevision: paused.revision,
        idempotencyKey: "spectator:seal-resume",
        exitRecovery: true,
      });
      assert.equal(resumed.status, "live");
      assert.equal(resumed.stepKey, "completed");
      assert.equal(
        resumed.events.some((event) => event.stepKey === "resume"),
        false,
      );

      await assert.rejects(
        () =>
          advanceDebateSession(
            db,
            "user-1",
            resumed.id,
            {
              expectedRevision: resumed.revision,
              idempotencyKey: "spectator:seal-advance-blocked",
            },
            runtime(),
          ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /Finish watching to seal/u.test(error.message),
      );

      const sealed = sealDebateSessionPresentation(db, "user-1", resumed.id, {
        expectedRevision: resumed.revision,
        idempotencyKey: "spectator:seal-complete",
      });
      assert.equal(sealed.status, "completed");
      assert.ok(sealed.completedAt);
      assert.equal(sealed.stepKey, "completed");
      assert.equal(sealed.winnerSideId, resumed.winnerSideId);
    } finally {
      db.close();
    }
  });

  it("voices off-record pause and resume lines in the frozen moderator persona", async () => {
    const db = createTestDb();
    try {
      const provider = new ModeratorLifecycleProvider();
      const debateRuntime = runtimeWith(provider);
      const created = await createDebateForRole(db, "spectator", {
        debateRuntime,
        formality: "free_for_all",
        moderatorSystemPrompt:
          "Mira is an irreverent dimension-hopping scientist who hates ceremony.",
      });
      const paused = await pauseDebateSessionWithPersona(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "spectator:persona-pause",
        },
        debateRuntime,
      );
      assert.equal(
        paused.events.at(-1)?.content,
        "Yeah, yeah, recess. I need a portal-fluid break.",
      );
      assert.equal(paused.events.at(-1)?.stepKey, "pause");

      const resumed = await resumeDebateSessionWithPersona(
        db,
        "user-1",
        paused.id,
        {
          expectedRevision: paused.revision,
          idempotencyKey: "spectator:persona-resume",
        },
        debateRuntime,
      );
      assert.equal(
        resumed.events.at(-1)?.content,
        "All right, portals closed. Back to the argument.",
      );
      assert.equal(resumed.events.at(-1)?.stepKey, "resume");
      assert.equal(resumed.events.at(-1)?.gavelReason, "resume");
      assert.equal(provider.lifecyclePrompts.length, 2);
      assert.match(
        provider.lifecyclePrompts[0] ?? "",
        /irreverent dimension-hopping scientist/iu,
      );
    } finally {
      db.close();
    }
  });

  it("quiet-saves a recess bookmark before the ceremony announcement", async () => {
    const db = createTestDb();
    try {
      const provider = new ModeratorLifecycleProvider();
      const debateRuntime = runtimeWith(provider);
      const created = await createDebateForRole(db, "spectator", {
        debateRuntime,
        formality: "plainspoken",
        moderatorSystemPrompt:
          "Mira is an irreverent dimension-hopping scientist who hates ceremony.",
      });
      const advanced = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "quiet-recess:advance",
        },
        debateRuntime,
      );
      const spoken = advanced.events
        .slice()
        .reverse()
        .find(
          (event) =>
            event.speakerKind !== "system" &&
            event.kind !== "error" &&
            event.content.trim().length > 0,
        );
      assert.ok(spoken);

      const quiet = pauseDebateSession(db, "user-1", advanced.id, {
        expectedRevision: advanced.revision,
        idempotencyKey: "quiet-recess:pause",
        quietSave: true,
        presentationEventId: spoken.id,
      });
      assert.equal(quiet.status, "paused");
      assert.equal(quiet.pausedPresentationEventId, spoken.id);
      assert.equal(quiet.events.length, advanced.events.length);
      assert.equal(provider.lifecyclePrompts.length, 0);

      const announced = await announceDebatePauseCeremony(
        db,
        "user-1",
        quiet.id,
        {
          expectedRevision: quiet.revision,
          idempotencyKey: "quiet-recess:pause-announce",
        },
        debateRuntime,
      );
      assert.equal(announced.status, "paused");
      assert.equal(announced.pausedPresentationEventId, spoken.id);
      assert.equal(announced.events.length, quiet.events.length + 1);
      assert.equal(announced.events.at(-1)?.stepKey, "pause");
      assert.equal(
        announced.events.at(-1)?.content,
        "Yeah, yeah, recess. I need a portal-fluid break.",
      );

      const originalContent = spoken.content;
      const quietResume = resumeDebateSession(db, "user-1", announced.id, {
        expectedRevision: announced.revision,
        idempotencyKey: "quiet-recess:resume",
        quietSave: true,
      });
      assert.notEqual(quietResume.status, "paused");
      assert.equal(quietResume.pausedPresentationEventId, spoken.id);
      assert.equal(quietResume.events.length, announced.events.length);

      const resumeAnnounced = await announceDebateResumeCeremony(
        db,
        "user-1",
        quietResume.id,
        {
          expectedRevision: quietResume.revision,
          idempotencyKey: "quiet-recess:resume-announce",
        },
        debateRuntime,
      );
      assert.equal(resumeAnnounced.pausedPresentationEventId, spoken.id);
      assert.equal(
        resumeAnnounced.events.at(-1)?.content,
        "All right, portals closed. Back to the argument.",
      );
      assert.equal(
        resumeAnnounced.events.find((event) => event.id === spoken.id)?.content,
        originalContent,
      );
    } finally {
      db.close();
    }
  });

  it("keeps recovery pause silent and calls a returned archive back to order", async () => {
    const db = createTestDb();
    try {
      const provider = new ModeratorLifecycleProvider();
      const debateRuntime = runtimeWith(provider);
      const created = await createDebateForRole(db, "spectator", {
        debateRuntime,
        moderatorSystemPrompt:
          "Mira is an irreverent dimension-hopping scientist who hates ceremony.",
      });
      const recovered = await pauseDebateSessionWithPersona(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "archive-recovery:pause",
          exitRecovery: true,
        },
        debateRuntime,
      );
      assert.equal(recovered.status, "paused");
      assert.equal(recovered.events.length, created.events.length);
      assert.equal(provider.lifecyclePrompts.length, 0);

      const resumed = await resumeDebateSessionWithPersona(
        db,
        "user-1",
        recovered.id,
        {
          expectedRevision: recovered.revision,
          idempotencyKey: "archive-recovery:resume",
        },
        debateRuntime,
      );
      assert.equal(resumed.events.length, recovered.events.length + 1);
      assert.equal(resumed.events.at(-1)?.stepKey, "resume");
      assert.equal(
        resumed.events.at(-1)?.content,
        "All right, portals closed. Back to the argument.",
      );
      assert.equal(provider.lifecyclePrompts.length, 1);
    } finally {
      db.close();
    }
  });

  it("keeps pause and resume instantaneous while the Jury chamber is visible", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(db, "spectator");
      const paused = await pauseDebateSessionWithPersona(
        db,
        "user-1",
        created.session.id,
        {
          expectedRevision: created.session.revision,
          idempotencyKey: "jury-visible:pause",
          juryVisible: true,
        },
        created.runtime,
      );
      assert.equal(paused.status, "paused");
      assert.equal(paused.events.length, created.session.events.length);

      const resumed = await resumeDebateSessionWithPersona(
        db,
        "user-1",
        paused.id,
        {
          expectedRevision: paused.revision,
          idempotencyKey: "jury-visible:resume",
          juryVisible: true,
        },
        created.runtime,
      );
      assert.notEqual(resumed.status, "paused");
      assert.equal(resumed.events.length, paused.events.length);
      assert.equal(resumed.judgeGavelCooldownUntil, null);
    } finally {
      db.close();
    }
  });

  it("freezes a solo PRISM Participant seat on either side and makes Pass yield the floor", async () => {
    for (const playerSideId of ["for", "against"] as const) {
      const db = createTestDb();
      const debateRuntime = runtime();
      try {
        seedBot(db, "moderator", "Mira");
        const opponentSideId =
          playerSideId === "for" ? ("against" as const) : ("for" as const);
        const opponentBotId =
          opponentSideId === "for" ? "for-opponent" : "against-opponent";
        seedBot(db, opponentBotId, "Opponent");
        const checks = await checkDebateAdvocacyRoles(
          db,
          "user-1",
          {
            motion: MOTION,
            playerRole: "participant",
            playerSideId,
            ...(opponentSideId === "for"
              ? { forAdvocateBotId: opponentBotId }
              : { againstAdvocateBotId: opponentBotId }),
          },
          debateRuntime,
        );
        assert.deepEqual(
          checks.map((check) => [check.botId, check.sideId]),
          [[opponentBotId, opponentSideId]],
        );
        let session = createDebateSession(
          db,
          "user-1",
          {
            motion: MOTION,
            evidence: {
              version: DEBATE_SCHEMA_VERSION,
              notes: "",
              sources: [],
              frozenAt: null,
            },
            moderatorBotId: "moderator",
            ...(opponentSideId === "for"
              ? { forAdvocateBotId: opponentBotId }
              : { againstAdvocateBotId: opponentBotId }),
            playerRole: "participant",
            playerSideId,
            advocacyConsent: checks,
            preferredProvider: "local",
            idempotencyKey: `create:solo-participant:${playerSideId}`,
          },
          debateRuntime,
        );
        const playerSeat =
          playerSideId === "for"
            ? session.forAdvocate
            : session.againstAdvocate;
        const opponentSeat =
          opponentSideId === "for"
            ? session.forAdvocate
            : session.againstAdvocate;
        assert.equal(playerSeat.id, DEBATE_PLAYER_PARTICIPANT_BOT_ID);
        assert.equal(playerSeat.name, "Debater");
        assert.equal(playerSeat.role, "advocate");
        assert.equal(playerSeat.sideId, playerSideId);
        assert.deepEqual(playerSeat.powers, []);
        assert.match(
          playerSeat.systemPrompt,
          /human alone authors every argument/u,
        );
        assert.equal(opponentSeat.id, opponentBotId);
        assert.equal(session.advocacyConsent.length, 1);
        assert.equal(
          session.powerPlan.bots[DEBATE_PLAYER_PARTICIPANT_BOT_ID]?.hardMuted,
          false,
        );

        let mutation = 0;
        while (session.status !== "completed" && session.stepKey !== "completed") {
          mutation += 1;
          assert.ok(mutation < 40);
          session =
            session.status === "waiting_for_player"
              ? await submitDebatePlayerTurn(db, "user-1", session.id, {
                  expectedRevision: session.revision,
                  idempotencyKey: `solo-participant:${playerSideId}:pass:${mutation}`,
                  pass: true,
                })
              : await advanceDebateSession(
                  db,
                  "user-1",
                  session.id,
                  {
                    expectedRevision: session.revision,
                    idempotencyKey: `solo-participant:${playerSideId}:advance:${mutation}`,
                  },
                  debateRuntime,
                );
        }
        assert.equal(
          session.events.find((event) => event.kind === "intro")?.content,
          `This Debate is called to order on: ${MOTION.motion} ${session.forAdvocate.name} argues ${MOTION.forSide.label}; ${session.againstAdvocate.name} argues ${MOTION.againstSide.label}. The proceeding may begin.`,
        );
        const playerTurns = session.events.filter(
          (event) => event.kind === "player_turn",
        );
        assert.equal(playerTurns.length, 4);
        assert.ok(
          playerTurns.every(
            (event) =>
              event.content === "Pass." &&
              event.speakerBotId === DEBATE_PLAYER_PARTICIPANT_BOT_ID &&
              event.sideId === playerSideId,
          ),
        );
        assert.equal(
          session.events.some(
            (event) =>
              event.speakerKind === "advocate" &&
              event.speakerBotId === DEBATE_PLAYER_PARTICIPANT_BOT_ID,
          ),
          false,
        );
        assert.deepEqual(
          session.ballots.map((ballot) => ballot.voterBotId),
          [session.moderator.id],
        );
        assert.equal(
          session.ballots[0]?.participantInfluence?.recordSideId,
          "for",
        );
        assert.equal(
          typeof session.ballots[0]?.participantInfluence?.adjustedScore,
          "number",
        );
        assert.deepEqual(
          session.events
            .filter(
              (event) =>
                event.kind === "reaction" &&
                event.stepKey === "participant_aftermath_opponent",
            )
            .map((event) => event.speakerBotId),
          [opponentBotId],
        );
      } finally {
        db.close();
      }
    }
  });

  it("redacts guided tiers live and gives an activated floor break one stable 30-second window", async () => {
    const db = createTestDb();
    const assessmentProvider = new ParticipantAssessmentProvider();
    const debateRuntime = {
      ...runtimeWith(assessmentProvider),
      auxiliary: assessmentProvider,
    };
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
        evidence: {
          version: DEBATE_SCHEMA_VERSION,
          notes: "Rail-adjacent land is scarce.",
          sources: [{
            id: "housing-1",
            title: "Housing report",
            url: "https://example.com/housing",
            snippet: "A frozen housing source.",
            publishedAt: "2026-01-01",
          }],
          frozenAt: null,
        },
      });
      assert.equal(session.participation?.difficulty, "standard");
      assert.equal(
        session.participation?.rowdiness.moderatorDisposition.temperament,
        "balanced",
      );
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-activation:${key}`,
          },
          debateRuntime,
        );
      }
      const target = session.events.find(
        (event) => event.kind === "speech" && event.sideId === "for",
      );
      assert.ok(target);
      assert.equal(
        session.participation?.favorability.entries.find(
          (entry) => entry.eventId === target.id,
        )?.evidenceMultiplier,
        2,
      );
      const raised = await raiseDebateParticipantFloorBreakWithRuntime(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-activation:raise",
          eventId: target.id,
          heardCharacterCount: Math.max(24, Math.floor(target.content.length * 0.58)),
          kind: "interjection",
        },
        debateRuntime,
      );
      assert.equal(raised.participantFloorBreak?.fixedCall, "Hold on—");
      assert.equal(raised.participantFloorBreak?.activatedAt, undefined);
      assert.equal(
        raised.participation?.favorability.entries.find(
          (entry) => entry.eventId === target.id,
        )?.evidenceMultiplier,
        1,
      );
      await assert.rejects(
        resolveDebateParticipantFloorBreak(
          db,
          "user-1",
          raised.id,
          {
            expectedRevision: raised.revision,
            idempotencyKey: "participant-activation:too-soon",
            content: "The heard prefix does not support the conclusion.",
          },
          debateRuntime,
        ),
        /Wait until the interruption call has finished/u,
      );
      const activated = activateDebateParticipantFloorBreak(
        db,
        "user-1",
        raised.id,
        {
          expectedRevision: raised.revision,
          idempotencyKey: "participant-activation:activate",
          callEventId: raised.participantFloorBreak!.callEventId,
        },
      );
      assert.ok(activated.participantFloorBreak?.activatedAt);
      assert.equal(
        Date.parse(activated.participantFloorBreak!.deadlineAt) -
          Date.parse(activated.participantFloorBreak!.activatedAt!),
        30_000,
      );
      const repeated = activateDebateParticipantFloorBreak(
        db,
        "user-1",
        activated.id,
        {
          expectedRevision: activated.revision,
          idempotencyKey: "participant-activation:activate-again",
          callEventId: activated.participantFloorBreak!.callEventId,
        },
      );
      assert.equal(repeated.revision, activated.revision);
      assert.equal(
        repeated.participantFloorBreak?.deadlineAt,
        activated.participantFloorBreak?.deadlineAt,
      );

      const privateProjection = debateSessionForPlayer({
        ...activated,
        participation: activated.participation
          ? {
              ...activated.participation,
              turns: [{
                eventId: target.id,
                phase: "opening",
                opportunityIndex: 0,
                authoredMode: "guided",
                choiceId: "choice-a",
                choiceTier: "great",
                announcedLimitMs: 20_000,
                wallLimitMs: 160_000,
                elapsedWallMs: 3_000,
                overtimeMs: 0,
                authoredCharacterCount: 20,
                heardCharacterCount: 20,
                cutoffReason: null,
                facets: {},
                baseImpact: 12,
                phaseWeight: 1,
                evidenceMultiplier: 1,
                favorabilityDelta: 12,
                createdAt: NOW,
              }],
            }
          : null,
      });
      assert.equal(privateProjection.participation?.turns[0]?.choiceTier, undefined);
    } finally {
      db.close();
    }
  });

  it("prepares rhetorical gambits before committing the latest heard prefix", async () => {
    const db = createTestDb();
    const provider = new ParticipantGambitProvider();
    const debateRuntime = {
      ...runtimeWith(provider),
      auxiliary: provider,
    };
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
        evidence: {
          version: DEBATE_SCHEMA_VERSION,
          notes: "Rail-adjacent land is scarce.",
          sources: [{
            id: "housing-1",
            title: "Housing report",
            url: "https://example.com/housing",
            snippet: "A frozen housing source.",
            publishedAt: "2026-01-01",
          }],
          frozenAt: null,
        },
      });
      assert.equal(session.participation?.rhetoricalGambitsEnabled, true);
      assert.equal(
        listDebateSessions(db, "user-1")[0]?.rhetoricalGambitsEnabled,
        true,
      );
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-gambit:${key}`,
          },
          debateRuntime,
        );
      }
      const target = session.events.find(
        (event) => event.kind === "speech" && event.sideId === "for",
      );
      assert.ok(target);
      const firstHeard = Math.max(24, Math.floor(target.content.length * 0.45));
      const offer = debateParticipantGambitOfferV1({
        sessionId: session.id,
        eventId: target.id,
        kind: "objection",
      });
      const exposedChoiceId = debateParticipantGambitGradesV1({
        sessionId: session.id,
        offer,
      }).find((grade) => grade.tier === "exposed")!.choiceId;

      const drafting = await prepareDebateParticipantFloorBreak(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-gambit:draft",
          eventId: target.id,
          heardCharacterCount: firstHeard,
          kind: "objection",
        },
        debateRuntime,
      );
      assert.equal(drafting.participantFloorBreakPreparation?.status, "drafting");
      assert.equal(
        drafting.events.find((event) => event.id === target.id)?.interrupted,
        undefined,
      );
      const canceled = cancelDebateParticipantFloorBreakPreparation(
        db,
        "user-1",
        drafting.id,
        {
          expectedRevision: drafting.revision,
          idempotencyKey: "participant-gambit:cancel",
          preparationId: drafting.participantFloorBreakPreparation!.id,
        },
      );
      assert.equal(canceled.participantFloorBreakPreparation, null);

      await assert.rejects(
        prepareDebateParticipantFloorBreak(
          db,
          "user-1",
          canceled.id,
          {
            expectedRevision: canceled.revision,
            idempotencyKey: "participant-gambit:unknown-evidence",
            eventId: target.id,
            heardCharacterCount: firstHeard,
            kind: "objection",
            gambitId: exposedChoiceId,
            evidenceSourceIds: ["not-in-the-envelope"],
          },
          debateRuntime,
        ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /sealed packet/u.test(error.message),
      );

      const confused = await prepareDebateParticipantFloorBreak(
        db,
        "user-1",
        canceled.id,
        {
          expectedRevision: canceled.revision,
          idempotencyKey: "participant-gambit:gibberish",
          eventId: target.id,
          heardCharacterCount: firstHeard,
          kind: "interjection",
          producerCue: "asga;lskdjfasgh",
        },
        debateRuntime,
      );
      assert.equal(
        confused.participantFloorBreakPreparation?.steeringFidelity,
        "confused",
      );
      assert.equal(
        confused.participantFloorBreakPreparation?.performedText,
        "I… uh…",
      );
      const afterConfused = cancelDebateParticipantFloorBreakPreparation(
        db,
        "user-1",
        confused.id,
        {
          expectedRevision: confused.revision,
          idempotencyKey: "participant-gambit:cancel-confused",
          preparationId: confused.participantFloorBreakPreparation!.id,
        },
      );

      const prepared = await prepareDebateParticipantFloorBreak(
        db,
        "user-1",
        afterConfused.id,
        {
          expectedRevision: afterConfused.revision,
          idempotencyKey: "participant-gambit:prepare",
          eventId: target.id,
          heardCharacterCount: firstHeard,
          kind: "objection",
          gambitId: exposedChoiceId,
          evidenceSourceIds: ["housing-1"],
        },
        debateRuntime,
      );
      const preparation = prepared.participantFloorBreakPreparation;
      assert.equal(preparation?.status, "ready");
      assert.ok(preparation?.performedText);
      assert.equal(preparation?.evidenceIntegrated, true);
      assert.equal(preparation?.evidenceMisused, false);
      assert.match(preparation?.counterText ?? "", /^Objection/iu);
      assert.ok(preparation?.continuationText);
      assert.equal(
        prepared.events.find((event) => event.id === target.id)?.interrupted,
        undefined,
      );
      const liveProjection = debateSessionForPlayer(prepared);
      assert.equal(liveProjection.participation?.gambitGrades, undefined);
      assert.equal(liveProjection.participation?.gambitRecords.length, 0);
      assert.equal(
        liveProjection.participantFloorBreakPreparation?.producerCue,
        undefined,
      );
      assert.equal(
        liveProjection.participantFloorBreakPreparation?.gambitTier,
        undefined,
      );

      const finalHeard = Math.min(
        target.content.length - 1,
        firstHeard + 12,
      );
      const committed = commitDebateParticipantFloorBreakPreparation(
        db,
        "user-1",
        prepared.id,
        {
          expectedRevision: prepared.revision,
          idempotencyKey: "participant-gambit:commit",
          preparationId: preparation!.id,
          heardCharacterCount: finalHeard,
        },
      );
      assert.equal(committed.participantFloorBreakPreparation, null);
      assert.equal(
        committed.events.find((event) => event.id === target.id)?.interrupted,
        true,
      );
      assert.ok(
        committed.events.find((event) => event.id === target.id)!.content.length <=
          finalHeard + 2,
      );
      assert.equal(
        committed.events.find((event) => event.id === preparation!.callEventId)
          ?.stepKey,
        "participant_floor_break_call",
      );
      assert.equal(
        committed.events.find((event) => event.id === preparation!.responseEventId)
          ?.content,
        preparation!.performedText,
      );
      assert.equal(
        committed.events.find((event) => event.id === preparation!.counterEventId)
          ?.stepKey,
        "participant_floor_break_counter_objection",
      );
      assert.equal(
        committed.events.find(
          (event) => event.id === preparation!.continuationEventId,
        )?.stepKey,
        "participant_objection_opponent_continuation",
      );
      assert.equal(
        committed.participation?.gambitRecords.at(-1)
          ?.finalHeardCharacterCount,
        finalHeard,
      );
      assert.equal(
        committed.participation?.favorability.entries.at(-1)
          ?.evidenceMultiplier,
        2,
      );
      const replay = commitDebateParticipantFloorBreakPreparation(
        db,
        "user-1",
        prepared.id,
        {
          expectedRevision: prepared.revision,
          idempotencyKey: "participant-gambit:commit",
          preparationId: preparation!.id,
          heardCharacterCount: finalHeard,
        },
      );
      assert.equal(replay.revision, committed.revision);
      assert.equal(
        replay.events.filter((event) => event.id === preparation!.callEventId)
          .length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("returns an interrupted opponent's floor after a Participant interjection", async () => {
    const db = createTestDb();
    const provider = new ParticipantGambitProvider();
    const debateRuntime = {
      ...runtimeWith(provider),
      auxiliary: provider,
    };
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-interjection-continuation:${key}`,
          },
          debateRuntime,
        );
      }
      const target = session.events.find(
        (event) => event.kind === "speech" && event.sideId === "for",
      );
      assert.ok(target);
      const firstHeard = Math.max(
        24,
        Math.floor(target.content.length * 0.55),
      );
      const prepared = await prepareDebateParticipantFloorBreak(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-interjection-continuation:prepare",
          eventId: target.id,
          heardCharacterCount: firstHeard,
          kind: "interjection",
          producerCue: "Point out that their premise does not prove the conclusion.",
        },
        debateRuntime,
      );
      const preparation = prepared.participantFloorBreakPreparation;
      assert.equal(preparation?.status, "ready");
      assert.equal(preparation?.clarificationRequired, false);
      assert.ok(preparation?.continuationText);

      const committed = commitDebateParticipantFloorBreakPreparation(
        db,
        "user-1",
        prepared.id,
        {
          expectedRevision: prepared.revision,
          idempotencyKey: "participant-interjection-continuation:commit",
          preparationId: preparation!.id,
          heardCharacterCount: Math.min(
            target.content.length - 1,
            firstHeard + 12,
          ),
        },
      );
      const rulingIndex = committed.events.findIndex(
        (event) => event.id === preparation!.rulingEventId,
      );
      const continuationIndex = committed.events.findIndex(
        (event) => event.id === preparation!.continuationEventId,
      );
      assert.ok(rulingIndex >= 0);
      assert.ok(continuationIndex > rulingIndex);
      assert.equal(
        committed.events[continuationIndex]?.stepKey,
        "participant_interjection_opponent_continuation",
      );
      assert.equal(
        committed.events[continuationIndex]?.speakerBotId,
        target.speakerBotId,
      );
    } finally {
      db.close();
    }
  });

  it("prepares the same three safe guided choices at every difficulty and falls back on unsafe output", async () => {
    for (const participantDifficulty of ["coach", "standard", "immersive"] as const) {
      const db = createTestDb();
      const debateRuntime = runtimeWith(new GuidedChoiceProvider());
      try {
        let session = await createDebateForRole(db, "participant", {
          debateRuntime,
          participantDifficulty,
        });
        for (const key of ["intro", "opening"]) {
          session = await advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `participant-choices:${participantDifficulty}:${key}`,
            },
            debateRuntime,
          );
        }
        assert.equal(session.participation?.difficulty, participantDifficulty);
        assert.equal(
          listDebateSessions(db, "user-1")[0]?.participationDifficulty,
          participantDifficulty,
        );
        assert.equal(session.participation?.choiceSet?.choices.length, 3);
        assert.equal(
          session.participation?.choiceSet?.choices.every(
            (choice) =>
              choice.content.length <= 180 &&
              choice.content.trim().split(/\s+/u).length <= 28,
          ),
          true,
        );
        assert.equal(session.participation?.choiceError, undefined);
        assert.equal(
          debateSessionForPlayer(session).participation?.choiceGrades,
          undefined,
        );
        const selectedChoice = session.participation?.choiceSet?.choices[0];
        assert.ok(selectedChoice);
        const committed = await submitDebatePlayerTurn(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-choices:${participantDifficulty}:commit`,
            choiceId: selectedChoice.id,
          },
          debateRuntime.auxiliary,
          debateRuntime,
        );
        assert.equal(
          committed.events.findLast((event) => event.kind === "player_turn")
            ?.participantChoiceId,
          selectedChoice.id,
        );
        assert.equal(committed.participation?.choiceSet, null);
      } finally {
        db.close();
      }
    }

    const db = createTestDb();
    const unsafeRuntime = runtimeWith(new GuidedChoiceProvider(true));
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime: unsafeRuntime,
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-choices:unsafe:${key}`,
          },
          unsafeRuntime,
        );
      }
      assert.equal(session.participation?.choiceSet, null);
      assert.match(session.participation?.choiceError ?? "", /type your own answer or retry/u);
    } finally {
      db.close();
    }
  });

  it("counts only deliberate Participant recesses and denies the fourth with a favorability penalty", async () => {
    const db = createTestDb();
    try {
      let session = await createDebateForRole(db, "participant");
      for (let index = 1; index <= 3; index += 1) {
        session = pauseDebateSession(db, "user-1", session.id, {
          expectedRevision: session.revision,
          idempotencyKey: `participant-recess:pause:${index}`,
          quietSave: true,
          recessIntent: "deliberate",
        });
        assert.equal(session.participation?.recess.used, index);
        session = resumeDebateSession(db, "user-1", session.id, {
          expectedRevision: session.revision,
          idempotencyKey: `participant-recess:resume:${index}`,
          quietSave: true,
          recessIntent: "recovery",
        });
      }
      const denied = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-recess:pause:4",
        quietSave: true,
        recessIntent: "deliberate",
      });
      assert.notEqual(denied.status, "paused");
      assert.equal(denied.participation?.recess.used, 3);
      assert.equal(denied.participation?.recess.denials, 1);
      assert.equal(denied.participation?.favorability.entries.at(-1)?.delta, -6);
      assert.equal(denied.events.at(-1)?.stepKey, "participant_recess_denied");
      assert.equal(
        denied.participation?.rowdiness.outcomes.at(-1)?.kind,
        "recess_denial",
      );
      assert.ok(
        (denied.participation?.rowdiness.patienceRemaining ?? Infinity) <
          (denied.participation?.rowdiness.patienceBudget ?? 0),
      );
      const decisionHold = pauseDebateSession(db, "user-1", denied.id, {
        expectedRevision: denied.revision,
        idempotencyKey: "participant-recess:decision-hold",
        quietSave: true,
        exitRecovery: true,
        recessIntent: "decision_hold",
      });
      assert.equal(decisionHold.status, "paused");
      assert.equal(decisionHold.participation?.recess.used, 3);
      assert.equal(decisionHold.participation?.recess.denials, 1);
      const continued = resumeDebateSession(db, "user-1", denied.id, {
        expectedRevision: decisionHold.revision,
        idempotencyKey: "participant-recess:decision-continue",
        quietSave: true,
      });
      assert.notEqual(continued.status, "paused");
    } finally {
      db.close();
    }
  });

  it("freezes active Participant time for recovery pauses and refreshes it for a spent recess", async () => {
    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-recess-clock:${key}`,
          },
          debateRuntime,
        );
      }
      const window = session.participation?.participantWindow;
      assert.ok(window);
      const openedAtMs = Date.now() - 30_000;
      const clocked = {
        ...session,
        participation: {
          ...session.participation!,
          participantWindow: {
            ...window,
            openedAt: new Date(openedAtMs).toISOString(),
            deadlineAt: new Date(openedAtMs + window.wallLimitMs).toISOString(),
          },
        },
      };
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = ?",
      ).run(JSON.stringify({ ...clocked, events: [] }), session.id, "user-1");
      session = getDebateSession(db, "user-1", session.id);

      const recoveredPause = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-recess-clock:recovery-pause",
        quietSave: true,
        recessIntent: "recovery",
      });
      const recoveredWindow = recoveredPause.participation?.participantWindow;
      assert.equal(recoveredWindow?.status, "paused");
      assert.ok((recoveredWindow?.elapsedWallMs ?? 0) >= 29_000);
      assert.ok((recoveredWindow?.remainingMs ?? Infinity) < window.wallLimitMs);
      assert.equal(recoveredPause.participation?.recess.used, 0);

      const recoveredResume = resumeDebateSession(
        db,
        "user-1",
        recoveredPause.id,
        {
          expectedRevision: recoveredPause.revision,
          idempotencyKey: "participant-recess-clock:recovery-resume",
          quietSave: true,
        },
      );
      const resumedWindow = recoveredResume.participation?.participantWindow;
      assert.equal(resumedWindow?.status, "open");
      assert.ok(Date.parse(resumedWindow!.openedAt) >= Date.now() - 1_000);
      assert.ok(
        Math.abs(
          Date.parse(resumedWindow!.deadlineAt) -
            Date.parse(resumedWindow!.openedAt) -
            recoveredWindow!.remainingMs!,
        ) < 20,
      );
      assert.equal(
        resumedWindow?.elapsedWallMs,
        recoveredWindow?.elapsedWallMs,
      );

      const deliberatePause = pauseDebateSession(
        db,
        "user-1",
        recoveredResume.id,
        {
          expectedRevision: recoveredResume.revision,
          idempotencyKey: "participant-recess-clock:deliberate-pause",
          quietSave: true,
          recessIntent: "deliberate",
        },
      );
      assert.equal(deliberatePause.participation?.recess.used, 1);
      assert.equal(
        deliberatePause.participation?.participantWindow?.remainingMs,
        window.wallLimitMs,
      );
      assert.equal(
        deliberatePause.participation?.participantWindow?.elapsedWallMs,
        0,
      );
      const deliberateResume = resumeDebateSession(
        db,
        "user-1",
        deliberatePause.id,
        {
          expectedRevision: deliberatePause.revision,
          idempotencyKey: "participant-recess-clock:deliberate-resume",
          quietSave: true,
        },
      );
      const freshWindow = deliberateResume.participation?.participantWindow;
      assert.equal(
        Date.parse(freshWindow!.deadlineAt) - Date.parse(freshWindow!.openedAt),
        window.wallLimitMs,
      );
    } finally {
      db.close();
    }
  });

  it("rage-rushes an exhausted Participant to the ballot when denied recesses consume all patience", async () => {
    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      let session = await createDebateForRole(db, "participant", {
        formality: "parliamentary",
        debateRuntime,
      });
      for (let index = 1; index <= 3; index += 1) {
        session = pauseDebateSession(db, "user-1", session.id, {
          expectedRevision: session.revision,
          idempotencyKey: `participant-rage:pause:${index}`,
          quietSave: true,
          recessIntent: "deliberate",
        });
        session = resumeDebateSession(db, "user-1", session.id, {
          expectedRevision: session.revision,
          idempotencyKey: `participant-rage:resume:${index}`,
          quietSave: true,
          recessIntent: "recovery",
        });
      }

      const firstDenied = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-rage:denied:1",
        quietSave: true,
        recessIntent: "deliberate",
      });
      assert.ok(
        (firstDenied.participation?.rowdiness.patienceRemaining ?? 0) > 0,
      );
      assert.ok(
        (firstDenied.participation?.rowdiness.patienceRemaining ?? Infinity) <
          15,
      );
      assert.equal(firstDenied.participation?.recess.rageRush, undefined);

      const expectedRevision = firstDenied.revision;
      const rushed = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision,
        idempotencyKey: "participant-rage:denied:2",
        quietSave: true,
        recessIntent: "deliberate",
      });
      assert.equal(rushed.phase, "verdict");
      assert.equal(rushed.stepKey, "ballot_moderator");
      assert.equal(rushed.status, "live");
      assert.ok(rushed.endedEarlyAt);
      assert.equal(rushed.participation?.rowdiness.patienceRemaining, 0);
      assert.equal(rushed.participation?.participantWindow, null);
      assert.equal(rushed.participation?.recess.denials, 2);
      assert.equal(rushed.participation?.recess.rageRush?.ballotInfluence, -80);
      assert.equal(
        rushed.events.at(-1)?.stepKey,
        "participant_recess_rage_rush",
      );
      assert.equal(rushed.events.at(-1)?.gavelDemeanor, "aggravated");
      assert.deepEqual(
        rushed.participation?.favorability.entries.at(-1)?.reasons,
        ["rage_rush"],
      );

      const replay = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision,
        idempotencyKey: "participant-rage:denied:2",
        quietSave: true,
        recessIntent: "deliberate",
      });
      assert.equal(replay.revision, rushed.revision);
      assert.equal(
        replay.events.filter(
          (event) => event.stepKey === "participant_recess_rage_rush",
        ).length,
        1,
      );
      assert.throws(
        () =>
          recoverParticipantDebateFromFinalRecess(
            db,
            "user-1",
            rushed.id,
            {
              expectedRevision: rushed.revision,
              idempotencyKey: "participant-rage:rewind",
            },
          ),
        /already closed arguments/u,
      );

      const ballot = await advanceDebateSession(
        db,
        "user-1",
        rushed.id,
        {
          expectedRevision: rushed.revision,
          idempotencyKey: "participant-rage:ballot",
        },
        debateRuntime,
      );
      assert.equal(ballot.ballots.at(-1)?.sideId, "for");
      assert.equal(
        ballot.ballots.at(-1)?.participantInfluence?.rageRushInfluence,
        -80,
      );
    } finally {
      db.close();
    }
  });

  it("rage-rushes an exhausted Participant directly into Jury deliberation", async () => {
    const db = createTestDb();
    try {
      const created = await createJuryDebateForRole(
        db,
        "participant",
        0,
        "forum",
        new JuryProvider(),
        "parliamentary",
      );
      let session = created.session;
      for (let index = 1; index <= 3; index += 1) {
        session = pauseDebateSession(db, "user-1", session.id, {
          expectedRevision: session.revision,
          idempotencyKey: `participant-jury-rage:pause:${index}`,
          quietSave: true,
          recessIntent: "deliberate",
        });
        session = resumeDebateSession(db, "user-1", session.id, {
          expectedRevision: session.revision,
          idempotencyKey: `participant-jury-rage:resume:${index}`,
          quietSave: true,
          recessIntent: "recovery",
        });
      }
      for (let index = 1; index <= 2; index += 1) {
        session = pauseDebateSession(db, "user-1", session.id, {
          expectedRevision: session.revision,
          idempotencyKey: `participant-jury-rage:denied:${index}`,
          quietSave: true,
          recessIntent: "deliberate",
        });
      }
      assert.equal(session.phase, "verdict");
      assert.equal(session.stepKey, "jury_initial_0");
      assert.equal(session.jury.phase, "initial_ballots");
      assert.equal(session.jury.discussionTurnTarget, 3);
      assert.equal(session.participation?.recess.rageRush?.ballotInfluence, -80);
      assert.match(
        session.events.at(-1)?.content ?? "",
        /Jury will decide this now/u,
      );
    } finally {
      db.close();
    }
  });

  it("checkpoints the final Participant recess, rewinds forced recovery, and makes exit terminal", async () => {
    const db = createTestDb();
    try {
      const exhaustRecesses = async (
        database: DatabaseSync,
        label: string,
      ) => {
        let session = await createDebateForRole(database, "participant");
        for (let index = 1; index <= 3; index += 1) {
          session = pauseDebateSession(database, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: `${label}:pause:${index}`,
            quietSave: true,
            recessIntent: "deliberate",
          });
          if (index < 3) {
            session = resumeDebateSession(database, "user-1", session.id, {
              expectedRevision: session.revision,
              idempotencyKey: `${label}:resume:${index}`,
              quietSave: true,
            });
          }
        }
        return session;
      };

      let recoverable = await exhaustRecesses(
        db,
        "final-checkpoint:recover",
      );
      const checkpoint = recoverable.participation?.recess.checkpoint;
      assert.ok(checkpoint);
      assert.equal(checkpoint.revision, recoverable.revision);
      assert.equal(
        db
          .prepare(
            "SELECT source_revision FROM debate_recess_checkpoints WHERE session_id = ? AND user_id = ?",
          )
          .get(recoverable.id, "user-1")?.source_revision,
        recoverable.revision,
      );
      const checkpointEventCount = recoverable.events.length;
      recoverable = resumeDebateSession(db, "user-1", recoverable.id, {
        expectedRevision: recoverable.revision,
        idempotencyKey: "final-checkpoint:resume-live",
        quietSave: true,
      });
      recoverable = await advanceDebateSession(
        db,
        "user-1",
        recoverable.id,
        {
          expectedRevision: recoverable.revision,
          idempotencyKey: "final-checkpoint:progress-after",
        },
        runtime(),
      );
      assert.ok(recoverable.events.length > checkpointEventCount);
      const restored = pauseDebateSession(db, "user-1", recoverable.id, {
        expectedRevision: recoverable.revision,
        idempotencyKey: "final-checkpoint:forced-recovery",
        quietSave: true,
        exitRecovery: true,
        recessIntent: "recovery",
      });
      assert.equal(restored.status, "paused");
      assert.equal(restored.phase, checkpoint.phase);
      assert.equal(restored.stepKey, checkpoint.stepKey);
      assert.equal(restored.events.length, checkpointEventCount);
      assert.equal(restored.participation?.recess.used, 3);

      let replayed = resumeDebateSession(db, "user-1", restored.id, {
        expectedRevision: restored.revision,
        idempotencyKey: "final-checkpoint:resume-again",
        quietSave: true,
      });
      replayed = await advanceDebateSession(
        db,
        "user-1",
        replayed.id,
        {
          expectedRevision: replayed.revision,
          idempotencyKey: "final-checkpoint:progress-again",
        },
        runtime(),
      );
      replayed = recoverParticipantDebateFromFinalRecess(
        db,
        "user-1",
        replayed.id,
        {
          expectedRevision: replayed.revision,
          idempotencyKey: "final-checkpoint:explicit-recovery",
        },
      );
      assert.equal(replayed.status, "paused");
      assert.equal(replayed.events.length, checkpointEventCount);

      const forfeited = forfeitParticipantDebateSession(
        db,
        "user-1",
        replayed.id,
        {
          expectedRevision: replayed.revision,
          idempotencyKey: "final-checkpoint:forfeit",
        },
      );
      assert.equal(forfeited.status, "completed");
      assert.notEqual(forfeited.winnerSideId, forfeited.playerSideId);
      assert.equal(forfeited.events.at(-1)?.stepKey, "participant_forfeit");

      const draftDb = createTestDb();
      try {
        const restartable = await exhaustRecesses(
          draftDb,
          "final-checkpoint:draft",
        );
        const restarted = restartParticipantDebateAsDraft(
          draftDb,
          "user-1",
          restartable.id,
          {
            expectedRevision: restartable.revision,
            idempotencyKey: "final-checkpoint:restart-draft",
          },
        );
        assert.equal(restarted.session.status, "cancelled");
        assert.equal(restarted.draftSession.status, "paused");
        assert.equal(restarted.draftSession.events.length, 0);
        assert.equal(restarted.draftSession.participation?.recess.used, 0);
        assert.equal(
          listDebateSessions(draftDb, "user-1").find(
            (entry) => entry.id === restarted.draftSession.id,
          )?.awaitingDeferredStart,
          true,
        );
      } finally {
        draftDb.close();
      }
    } finally {
      db.close();
    }
  });

  it("projects pre-start predispositions by difficulty without revealing Surprise jurors", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "opponent", "Basil");
      const standard = await previewDebateParticipantPredispositions(
        db,
        "user-1",
        {
          motion: MOTION,
          playerSideId: "against",
          participationDifficulty: "standard",
          moderatorBotId: "moderator",
          opponentBotId: "opponent",
          jurorBotIds: [null],
        },
        runtime(),
      );
      assert.equal(standard.predispositions[0]?.status, "known");
      assert.equal(typeof standard.predispositions[0]?.direction, "string");
      assert.equal(standard.predispositions[0]?.strength, undefined);
      assert.deepEqual(standard.predispositions[2], {
        seat: "juror",
        seatIndex: 0,
        status: "surprise",
      });
      const immersive = await previewDebateParticipantPredispositions(
        db,
        "user-1",
        {
          motion: MOTION,
          playerSideId: "against",
          participationDifficulty: "immersive",
          moderatorBotId: "moderator",
          opponentBotId: "opponent",
        },
        runtime(),
      );
      assert.deepEqual(immersive.predispositions[0], {
        seat: "moderator",
        status: "known",
      });
    } finally {
      db.close();
    }
  });

  it("charges wall-clock overtime and patience when a late Participant answer still lands", async () => {
    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-late:${key}`,
          },
          debateRuntime,
        );
      }
      const window = session.participation?.participantWindow;
      assert.ok(window);
      const openedAt = new Date(Date.now() - window.wallLimitMs - 11_000).toISOString();
      const late = {
        ...session,
        participation: {
          ...session.participation!,
          participantWindow: {
            ...window,
            openedAt,
            deadlineAt: new Date(Date.parse(openedAt) + window.wallLimitMs).toISOString(),
          },
        },
      };
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = ?",
      ).run(JSON.stringify({ ...late, events: [] }), session.id, "user-1");
      session = getDebateSession(db, "user-1", session.id);
      const patienceBefore = session.participation!.rowdiness.patienceRemaining;
      const submitted = await submitDebatePlayerTurn(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-late:submit",
          pass: true,
        },
      );
      assert.equal(
        submitted.participation?.favorability.entries.some(
          (entry) => entry.reasons.includes("overtime") && entry.delta <= -2,
        ),
        true,
      );
      assert.ok(
        (submitted.participation?.rowdiness.patienceRemaining ?? patienceBefore) <
          patienceBefore,
      );
      assert.ok((submitted.participation?.turns.at(-1)?.overtimeMs ?? 0) >= 10_000);
    } finally {
      db.close();
    }
  });

  it("grades the authored draft when the Participant expiry timer fires", async () => {
    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-authored-expiry:${key}`,
          },
          debateRuntime,
        );
      }
      const window = session.participation?.participantWindow;
      assert.ok(window);
      const nowMs = Date.now();
      const openedAt = new Date(
        nowMs - window.wallLimitMs - 45_000,
      ).toISOString();
      const expiredState = {
        ...session,
        participation: {
          ...session.participation!,
          rowdiness: {
            ...session.participation!.rowdiness,
            patienceRemaining: 0,
          },
          participantWindow: {
            ...window,
            openedAt,
            deadlineAt: new Date(nowMs - 1_000).toISOString(),
          },
        },
      };
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = ?",
      ).run(
        JSON.stringify({ ...expiredState, events: [] }),
        session.id,
        "user-1",
      );
      session = getDebateSession(db, "user-1", session.id);
      const playerTurnCount = session.events.filter(
        (event) => event.kind === "player_turn",
      ).length;
      const graded = await expireDebateParticipantWindow(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-authored-expiry:grade",
          windowOpenedAt: openedAt,
          authoredContent: "Rail access matters because this rule protects scarce public land.",
        },
        debateRuntime,
        nowMs,
      );
      assert.equal(
        graded.events.filter((event) => event.kind === "player_turn").length,
        playerTurnCount + 1,
      );
      assert.ok((graded.participation?.turns.at(-1)?.authoredCharacterCount ?? 0) > 0);
      assert.ok(graded.participation?.favorability.entries.length);
    } finally {
      db.close();
    }
  });

  it("persists a replay-stable zero-patience outcome and forces a taunt grace to end by gavel", async () => {
    const observed = new Set<string>();
    for (let index = 0; index < 200 && observed.size < 3; index += 1) {
      observed.add(
        debateParticipantExpiryOutcomeKind(
          `session-${index}`,
          "2026-08-09T12:00:00.000Z",
        ),
      );
    }
    assert.deepEqual(
      [...observed].sort(),
      ["awkward_silence", "gavel", "opponent_taunt"],
    );
    assert.equal(
      debateParticipantExpiryOutcomeKind(
        "session",
        "2026-08-09T12:00:00.000Z",
        "taunt_grace",
      ),
      "gavel",
    );

    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-expiry:${key}`,
          },
          debateRuntime,
        );
      }
      const window = session.participation?.participantWindow;
      assert.ok(window);
      const nowMs = Date.now();
      const deadlineAt = new Date(nowMs - 2_000).toISOString();
      const openedAt = new Date(Date.parse(deadlineAt) - window.wallLimitMs).toISOString();
      const expiredState = {
        ...session,
        participation: {
          ...session.participation!,
          rowdiness: {
            ...session.participation!.rowdiness,
            patienceRemaining: 0,
          },
          participantWindow: {
            ...window,
            openedAt,
            deadlineAt,
          },
        },
      };
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ? AND user_id = ?",
      ).run(JSON.stringify({ ...expiredState, events: [] }), session.id, "user-1");
      session = getDebateSession(db, "user-1", session.id);
      const playerTurnCount = session.events.filter(
        (event) => event.kind === "player_turn",
      ).length;
      let expired = await expireDebateParticipantWindow(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-expiry:deadline",
          windowOpenedAt: openedAt,
          stage: "deadline",
        },
        debateRuntime,
        nowMs,
      );
      assert.equal(
        expired.events.filter((event) => event.kind === "player_turn").length,
        playerTurnCount,
      );
      const outcome = expired.participation?.rowdiness.outcomes.at(-1);
      assert.ok(outcome);
      assert.equal(outcome.action, "interrupted");
      assert.ok(outcome.eventId);
      if (outcome.kind === "awkward_silence") {
        const beats = expired.events.filter(
          (event) =>
            event.stepKey === "participant_patience_awkward_silence" ||
            event.stepKey === "participant_patience_awkward_prompt",
        );
        assert.deepEqual(beats.map((event) => event.speakerKind), ["player", "player"]);
      } else if (outcome.kind === "opponent_taunt") {
        assert.equal(expired.status, "waiting_for_player");
        const graceOpenedAt =
          expired.participation!.participantWindow!.openedAt;
        const graceDeadline = Date.parse(
          expired.participation!.participantWindow!.deadlineAt,
        );
        expired = await expireDebateParticipantWindow(
          db,
          "user-1",
          expired.id,
          {
            expectedRevision: expired.revision,
            idempotencyKey: "participant-expiry:grace",
            windowOpenedAt: graceOpenedAt,
            stage: "taunt_grace",
          },
          debateRuntime,
          graceDeadline,
        );
        assert.equal(
          expired.participation?.rowdiness.outcomes.at(-1)?.kind,
          "gavel",
        );
        assert.equal(expired.participation?.participantWindow, null);
      } else {
        assert.equal(expired.events.at(-1)?.kind, "judge_gavel");
      }
    } finally {
      db.close();
    }
  });

  it("keeps a legacy Participant cast replayable but never delegates a new floor", async () => {
    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      const created = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      const proxyPowerPlan =
        created.powerPlan.bots[DEBATE_PLAYER_PARTICIPANT_BOT_ID]!;
      const legacy = {
        ...created,
        status: "waiting_for_player" as const,
        phase: "challenge" as const,
        stepKey: "challenge_participant_turn",
        againstAdvocate: {
          ...created.againstAdvocate,
          id: "against",
          name: "Basil",
          systemPrompt: "Basil is thoughtful, candid, and concise.",
          revision: "legacy-against-revision",
        },
        powerPlan: {
          ...created.powerPlan,
          bots: {
            ...Object.fromEntries(
              Object.entries(created.powerPlan.bots).filter(
                ([botId]) => botId !== DEBATE_PLAYER_PARTICIPANT_BOT_ID,
              ),
            ),
            against: { ...proxyPowerPlan, botId: "against" },
          },
        },
      };
      db.prepare(
        `UPDATE debate_sessions
            SET status = ?, phase = ?, step_key = ?, session_json = ?
          WHERE id = ? AND user_id = ?`,
      ).run(
        legacy.status,
        legacy.phase,
        legacy.stepKey,
        JSON.stringify({ ...legacy, events: [] }),
        legacy.id,
        "user-1",
      );

      let session = getDebateSession(db, "user-1", legacy.id);
      assert.equal(session.againstAdvocate.id, "against");
      assert.equal(session.stepKey, "challenge_participant_turn");
      session = await submitDebatePlayerTurn(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "legacy-participant:pass",
        pass: true,
      });
      assert.equal(session.stepKey, "challenge_opponent_prompt");
      assert.equal(
        session.events.some(
          (event) =>
            event.kind === "speech" && event.speakerBotId === "against",
        ),
        false,
      );

      const deprecatedStep = "challenge_participant_partner";
      db.prepare(
        `UPDATE debate_sessions
            SET status = ?, phase = ?, step_key = ?, session_json = ?
          WHERE id = ? AND user_id = ?`,
      ).run(
        "live",
        "challenge",
        deprecatedStep,
        JSON.stringify({
          ...session,
          status: "live",
          phase: "challenge",
          stepKey: deprecatedStep,
          events: [],
        }),
        session.id,
        "user-1",
      );
      session = getDebateSession(db, "user-1", session.id);
      assert.equal(session.stepKey, "challenge_opponent_prompt");
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "legacy-participant:normalized-floor",
        },
        debateRuntime,
      );
      assert.equal(session.stepKey, "challenge_opponent_answer");
      assert.equal(
        session.events.some(
          (event) =>
            event.kind === "speech" &&
            event.speakerBotId === "against" &&
            event.stepKey === deprecatedStep,
        ),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("gives a solo Participant every side-owned Forum floor and keeps Spectator flow unchanged", async () => {
    for (const role of ["participant", "spectator"] as const) {
      const db = createTestDb();
      try {
        let session = await createDebateForRole(db, role);
        if (role === "participant") {
          assert.equal(session.forAdvocate.id, "for");
          assert.equal(
            session.againstAdvocate.id,
            DEBATE_PLAYER_PARTICIPANT_BOT_ID,
          );
          assert.deepEqual(
            session.advocacyConsent.map((consent) => [
              consent.botId,
              consent.sideId,
            ]),
            [["for", "for"]],
          );
        }
        let mutation = 0;
        while (session.status !== "completed" && session.stepKey !== "completed") {
          mutation += 1;
          assert.ok(mutation < 40);
          if (session.status === "waiting_for_player") {
            session = await submitDebatePlayerTurn(db, "user-1", session.id, {
              expectedRevision: session.revision,
              idempotencyKey: `${role}:player:${mutation}`,
              content:
                session.phase === "challenge"
                  ? "The safeguard should be enforceable before approvals."
                  : "That implementation gap remains unanswered.",
            });
          } else {
            session = await advanceDebateSession(
              db,
              "user-1",
              session.id,
              {
                expectedRevision: session.revision,
                idempotencyKey: `${role}:advance:${mutation}`,
              },
              runtime(),
            );
          }
        }
        assert.equal(session.winnerSideId, "for");
        assert.equal(
          session.events.filter((event) => event.kind === "player_turn").length,
          role === "participant" ? 4 : 0,
        );
        if (role === "participant") {
          assert.ok(
            session.events
              .filter((event) => event.kind === "player_turn")
              .every(
                (event) =>
                  event.speakerBotId === DEBATE_PLAYER_PARTICIPANT_BOT_ID,
              ),
          );
          assert.deepEqual(
            session.ballots.map((ballot) => ballot.voterBotId),
            [session.moderator.id],
          );
          assert.deepEqual(
            session.events
              .filter(
                (event) =>
                  event.kind === "reaction" &&
                  event.stepKey === "participant_aftermath_opponent",
              )
              .map((event) => event.speakerBotId),
            [session.forAdvocate.id],
          );
        } else {
          assert.equal(session.ballots.length, 3);
        }
        assert.equal(session.events.at(0)?.speakerBotId, session.moderator.id);
        assert.equal(session.events.at(-1)?.speakerBotId, session.moderator.id);
        assert.equal(session.events.at(-1)?.stepKey, "closing_moderator");
      } finally {
        db.close();
      }
    }
  });

  it("lets a Participant cut an opposing live floor and records the moderator ruling", async () => {
    const db = createTestDb();
    try {
      let session = await createDebateForRole(db, "participant");
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interject:intro:0001",
        },
        runtime(),
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interject:opening:0001",
        },
        runtime(),
      );
      const target = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.sideId === "for" &&
          event.stepKey === "opening_for",
      );
      assert.ok(target);
      const request = {
        expectedRevision: session.revision,
        idempotencyKey: "interject:player:0001",
        eventId: target.id,
        heardCharacterCount: Math.max(
          24,
          Math.floor(target.content.length * 0.58),
        ),
        content:
          "Point of order: that conclusion does not follow from the premise.",
      };
      const interjected = await submitDebateInterjection(
        db,
        "user-1",
        session.id,
        request,
        runtime(),
      );
      const revised = interjected.events.find(
        (event) => event.id === target.id,
      );
      assert.equal(revised?.interrupted, true);
      assert.equal(revised?.interruptedBy, "player");
      assert.ok((revised?.content.length ?? 0) < target.content.length);
      assert.match(revised?.content ?? "", /[…—]$/u);
      assert.equal(interjected.status, "waiting_for_player");
      assert.equal(interjected.stepKey, "opening_against_player");
      assert.ok(
        interjected.events.some(
          (event) =>
            event.kind === "interjection" &&
            event.parentEventId === target.id &&
            event.speakerKind === "player" &&
            event.speakerBotId === DEBATE_PLAYER_PARTICIPANT_BOT_ID &&
            event.phase === target.phase &&
            event.stepKey === target.stepKey,
        ),
      );
      assert.ok(
        interjected.events.some(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.speakerBotId === interjected.moderator.id,
        ),
      );
      assert.deepEqual(
        await submitDebateInterjection(
          db,
          "user-1",
          session.id,
          request,
          runtime(),
        ),
        interjected,
      );
      assert.equal(
        (
          JSON.parse(
            (
              db
                .prepare(
                  "SELECT event_json FROM debate_events WHERE id = ? AND user_id = ?",
                )
                .get(target.id, "user-1") as { event_json: string }
            ).event_json,
          ) as { interrupted?: boolean }
        ).interrupted,
        true,
      );
    } finally {
      db.close();
    }
  });

  it("prunes target-derived overtime follow-through and keeps the interrupted floor context", async () => {
    const db = createTestDb();
    try {
      const provider = new OvertimeProvider();
      const debateRuntime = runtimeWith(provider);
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-objection:overtime:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-objection:overtime:opening",
        },
        debateRuntime,
      );
      const target = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.sideId === "for" &&
          event.stepKey === "opening_for",
      );
      assert.ok(target);
      assert.equal(target.timing?.status, "overtime");
      const correction = session.events.find(
        (event) =>
          event.kind === "moderator_ruling" &&
          event.parentEventId === target.id,
      );
      assert.ok(correction);

      const storedRow = db
        .prepare(
          "SELECT session_json FROM debate_sessions WHERE id = ? AND user_id = ?",
        )
        .get(session.id, "user-1") as { session_json: string };
      const storedSession = JSON.parse(storedRow.session_json) as Record<
        string,
        unknown
      >;
      db.prepare(
        `UPDATE debate_sessions
            SET phase = ?, step_key = ?, session_json = ?
          WHERE id = ? AND user_id = ?`,
      ).run(
        "challenge",
        "challenge_participant_prompt",
        JSON.stringify({
          ...storedSession,
          phase: "challenge",
          stepKey: "challenge_participant_prompt",
        }),
        session.id,
        "user-1",
      );
      session = getDebateSession(db, "user-1", session.id);

      const raised = raiseDebateParticipantObjection(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-objection:overtime:raise",
        eventId: target.id,
        heardCharacterCount: Math.max(
          24,
          Math.floor(target.content.length * 0.58),
        ),
      });
      const objection = raised.events.find(
        (event) => event.id === raised.participantObjection?.objectionEventId,
      );
      assert.equal(objection?.phase, target.phase);
      assert.equal(objection?.stepKey, target.stepKey);
      assert.equal(objection?.parentEventId, target.id);
      assert.equal(raised.participantObjection?.resumePhase, "challenge");
      assert.equal(
        raised.participantObjection?.resumeStepKey,
        "challenge_participant_prompt",
      );
      assert.equal(
        raised.events.some((event) => event.id === correction.id),
        false,
      );
    } finally {
      db.close();
    }
  });

  it("rejects Participant floor breaks after a phase or substantive floor event", async () => {
    const phaseDb = createTestDb();
    try {
      let session = await createDebateForRole(phaseDb, "participant");
      for (const step of ["intro", "opening"]) {
        session = await advanceDebateSession(
          phaseDb,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-objection:phase:${step}`,
          },
          runtime(),
        );
      }
      const target = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.sideId === "for" &&
          event.stepKey === "opening_for",
      );
      assert.ok(target);
      const phaseEvent = {
        ...target,
        id: "participant-objection:phase:event",
        sequence: session.events.length + 1,
        phase: "challenge" as const,
        stepKey: "challenge_participant_prompt",
        kind: "phase" as const,
        speakerKind: "system" as const,
        speakerBotId: null,
        sideId: null,
        content: "The Challenge phase begins.",
        sourceIds: [],
        parentEventId: null,
        interrupted: false,
        interruptedBy: null,
      };
      phaseDb
        .prepare(
          `INSERT INTO debate_events
             (id, user_id, session_id, sequence, phase, step_key, kind,
              event_json, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          phaseEvent.id,
          "user-1",
          session.id,
          phaseEvent.sequence,
          phaseEvent.phase,
          phaseEvent.stepKey,
          phaseEvent.kind,
          JSON.stringify(phaseEvent),
          phaseEvent.createdAt,
        );
      session = getDebateSession(phaseDb, "user-1", session.id);
      assert.throws(
        () =>
          raiseDebateParticipantObjection(phaseDb, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: "participant-objection:phase:raise",
            eventId: target.id,
            heardCharacterCount: Math.max(
              24,
              Math.floor(target.content.length * 0.58),
            ),
          }),
        /already moved beyond that floor/u,
      );
    } finally {
      phaseDb.close();
    }

    const speechDb = createTestDb();
    try {
      let session = await createDebateForRole(speechDb, "participant");
      for (const step of ["intro", "opening-for"]) {
        session = await advanceDebateSession(
          speechDb,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-objection:stale:${step}`,
          },
          runtime(),
        );
      }
      session = await submitDebatePlayerTurn(speechDb, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-objection:stale:player-opening",
        content: "The opponent's opening still leaves the safeguard unclear.",
      });
      session = await advanceDebateSession(
        speechDb,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-objection:stale:challenge-player",
        },
        runtime(),
      );
      session = await submitDebatePlayerTurn(speechDb, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-objection:stale:challenge-answer",
        content: "The safeguard must operate before approval.",
      });
      for (const step of ["opponent-prompt", "opponent-answer"]) {
        session = await advanceDebateSession(
          speechDb,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-objection:stale:${step}`,
          },
          runtime(),
        );
      }
      const target = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.sideId === "for" &&
          event.stepKey === "opening_for",
      );
      assert.ok(target);
      assert.ok(
        session.events.some(
          (event) =>
            event.sequence > target.sequence && event.kind === "speech",
        ),
      );
      const heardCharacterCount = Math.max(
        24,
        Math.floor(target.content.length * 0.58),
      );
      assert.throws(
        () =>
          raiseDebateParticipantObjection(speechDb, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: "participant-objection:stale:raise",
            eventId: target.id,
            heardCharacterCount,
          }),
        /already moved beyond that floor/u,
      );
      await assert.rejects(
        () =>
          submitDebateInterjection(
            speechDb,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: "participant-objection:stale:interject",
              eventId: target.id,
              heardCharacterCount,
              content: "Point of order.",
            },
            runtime(),
          ),
        /already moved beyond that floor/u,
      );
      assert.equal(
        getDebateSession(speechDb, "user-1", session.id).revision,
        session.revision,
      );
    } finally {
      speechDb.close();
    }
  });

  it("lets a Participant shout an objection before stating the point and makes the moderator ruling consequential", async () => {
    for (const ruling of ["sustained", "overruled"] as const) {
      const db = createTestDb();
      try {
        const provider = new ParticipantObjectionProvider(
          ruling,
          ruling === "overruled",
        );
        const debateRuntime = runtimeWith(provider);
        let session = await createDebateForRole(db, "participant", {
          debateRuntime,
        });
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-objection:${ruling}:intro`,
          },
          debateRuntime,
        );
        const openingRequest = {
          expectedRevision: session.revision,
          idempotencyKey: `participant-objection:${ruling}:opening`,
        };
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          openingRequest,
          debateRuntime,
        );
        const target = session.events.find(
          (event) =>
            event.kind === "speech" &&
            event.sideId === "for" &&
            event.stepKey === "opening_for",
        );
        assert.ok(target);
        const trailingReactionId = `participant-objection:${ruling}:reaction`;
        if (ruling === "sustained") {
          const trailingReaction = {
            ...target,
            id: trailingReactionId,
            sequence: session.events.length + 1,
            stepKey: `persona_reaction_${target.sequence}`,
            kind: "reaction",
            speakerKind: "advocate",
            speakerBotId: "against",
            sideId: "against",
            content: "A brief gallery reaction.",
            sourceIds: [],
            parentEventId: target.id,
            interrupted: false,
            interruptedBy: null,
          };
          db.prepare(
            `INSERT INTO debate_events
               (id, user_id, session_id, sequence, phase, step_key, kind,
                event_json, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            trailingReaction.id,
            "user-1",
            session.id,
            trailingReaction.sequence,
            trailingReaction.phase,
            trailingReaction.stepKey,
            trailingReaction.kind,
            JSON.stringify(trailingReaction),
            trailingReaction.createdAt,
          );
          session = getDebateSession(db, "user-1", session.id);
          assert.ok(
            session.events.some((event) => event.id === trailingReactionId),
          );
        }
        const raiseRequest = {
          expectedRevision: session.revision,
          idempotencyKey: `participant-objection:${ruling}:raise`,
          eventId: target.id,
          heardCharacterCount: Math.max(
            24,
            Math.floor(target.content.length * 0.58),
          ),
        };
        const raised = raiseDebateParticipantObjection(
          db,
          "user-1",
          session.id,
          raiseRequest,
        );
        const interrupted = raised.events.find(
          (event) => event.id === target.id,
        );
        const objection = raised.events.find(
          (event) =>
            event.kind === "objection" && event.parentEventId === target.id,
        );
        assert.equal(interrupted?.interrupted, true);
        assert.equal(interrupted?.interruptedBy, "player");
        assert.match(interrupted?.content ?? "", /[…—]$/u);
        assert.equal(objection?.content, "Objection!");
        assert.equal(objection?.speakerKind, "player");
        assert.equal(objection?.speakerBotId, DEBATE_PLAYER_PARTICIPANT_BOT_ID);
        assert.equal(objection?.sideId, "against");
        assert.equal(objection?.parentEventId, target.id);
        assert.equal(objection?.phase, target.phase);
        assert.equal(objection?.stepKey, target.stepKey);
        assert.equal(
          raised.events.some((event) => event.id === trailingReactionId),
          false,
        );
        assert.equal(raised.status, "waiting_for_player");
        assert.equal(raised.stepKey, "participant_objection_reason");
        assert.partialDeepStrictEqual(raised.participantObjection, {
          status: "awaiting_reason",
          interruptedEventId: target.id,
          objectionEventId: objection?.id,
          interruptedBotId: "for",
          resumeStatus: "waiting_for_player",
          resumePhase: "opening",
          resumeStepKey: "opening_against_player",
        });
        assert.deepEqual(
          raiseDebateParticipantObjection(
            db,
            "user-1",
            session.id,
            raiseRequest,
          ),
          raised,
        );
        assert.throws(
          () =>
            pauseDebateSession(db, "user-1", raised.id, {
              expectedRevision: raised.revision,
              idempotencyKey: `participant-objection:${ruling}:blocked-pause`,
            }),
          /State or withdraw the Participant objection/u,
        );
        assert.throws(
          () =>
            endDebateSessionEarly(db, "user-1", raised.id, {
              expectedRevision: raised.revision,
              idempotencyKey: `participant-objection:${ruling}:blocked-end`,
            }),
          /State or withdraw the Participant objection/u,
        );
        await assert.rejects(
          () =>
            advanceDebateSession(
              db,
              "user-1",
              raised.id,
              openingRequest,
              debateRuntime,
            ),
          /Debate changed from revision/u,
        );

        const activated = activateDebateParticipantFloorBreak(
          db,
          "user-1",
          raised.id,
          {
            expectedRevision: raised.revision,
            idempotencyKey: `participant-objection:${ruling}:activate`,
            callEventId: raised.participantFloorBreak!.callEventId,
          },
        );
        const resolveRequest = {
          expectedRevision: activated.revision,
          idempotencyKey: `participant-objection:${ruling}:resolve`,
          content:
            "That conclusion misstates our position and is not supported by the heard premise.",
        };
        const resolved = await resolveDebateParticipantObjection(
          db,
          "user-1",
          activated.id,
          resolveRequest,
          debateRuntime,
        );
        const reason = resolved.events.find(
          (event) =>
            event.stepKey === "participant_objection_reason" &&
            event.speakerKind === "player",
        );
        const moderatorRuling = resolved.events.find(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.stepKey === "participant_objection_ruling",
        );
        const continuation = resolved.events.find(
          (event) =>
            event.stepKey === "participant_objection_continuation" &&
            event.parentEventId === moderatorRuling?.id,
        );
        assert.equal(reason?.parentEventId, objection?.id);
        assert.equal(moderatorRuling?.ruling, ruling);
        assert.equal(moderatorRuling?.parentEventId, reason?.id);
        assert.match(
          moderatorRuling?.content ?? "",
          ruling === "sustained" ? /^Sustained\./u : /^Overruled\./u,
        );
        assert.equal(Boolean(continuation), ruling === "overruled");
        if (continuation) {
          assert.equal(continuation.speakerBotId, "for");
          assert.equal(continuation.sideId, "for");
          assert.equal(
            continuation.content,
            "The implementation limit remains central, and a phased rollout answers it directly.",
          );
        }
        assert.equal(resolved.participantObjection, null);
        assert.equal(resolved.status, "waiting_for_player");
        assert.equal(resolved.stepKey, "opening_against_player");
        assert.match(provider.moderatorPrompt, /(?:Prism|Debater): Objection!/u);
        assert.match(provider.moderatorPrompt, /misstates our position/u);
        assert.equal(
          provider.continuationPrompt.length > 0,
          ruling === "overruled",
        );
        assert.deepEqual(
          await resolveDebateParticipantObjection(
            db,
            "user-1",
            raised.id,
            resolveRequest,
            debateRuntime,
          ),
          resolved,
        );
      } finally {
        db.close();
      }
    }
  });

  it("preserves an unresolved Participant objection through an exit recovery recess", async () => {
    const db = createTestDb();
    try {
      const debateRuntime = runtimeWith(
        new ParticipantObjectionProvider("overruled"),
      );
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      for (const key of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-exit-recovery:${key}`,
          },
          debateRuntime,
        );
      }
      const target = session.events.find(
        (event) => event.kind === "speech" && event.sideId === "for",
      );
      assert.ok(target);
      const raised = raiseDebateParticipantObjection(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-exit-recovery:raise",
        eventId: target.id,
        heardCharacterCount: Math.max(
          24,
          Math.floor(target.content.length * 0.58),
        ),
      });
      const paused = pauseDebateSession(db, "user-1", raised.id, {
        expectedRevision: raised.revision,
        idempotencyKey: "participant-exit-recovery:pause",
        exitRecovery: true,
      });
      assert.equal(paused.status, "paused");
      assert.equal(paused.participantObjection?.status, "awaiting_reason");

      const resumed = resumeDebateSession(db, "user-1", paused.id, {
        expectedRevision: paused.revision,
        idempotencyKey: "participant-exit-recovery:resume",
      });
      assert.equal(resumed.status, "waiting_for_player");
      assert.equal(resumed.stepKey, "participant_objection_reason");
      assert.equal(resumed.participantObjection?.status, "awaiting_reason");
    } finally {
      db.close();
    }
  });

  it("lets a Participant withdraw an objection and restores the interrupted floor", async () => {
    const db = createTestDb();
    try {
      const provider = new ParticipantObjectionProvider("overruled");
      const debateRuntime = runtimeWith(provider);
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-objection:withdraw:intro",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "participant-objection:withdraw:opening",
        },
        debateRuntime,
      );
      const target = session.events.find(
        (event) => event.kind === "speech" && event.sideId === "for",
      );
      assert.ok(target);
      const raised = raiseDebateParticipantObjection(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "participant-objection:withdraw:raise",
        eventId: target.id,
        heardCharacterCount: Math.max(
          24,
          Math.floor(target.content.length * 0.58),
        ),
      });
      const resolved = await resolveDebateParticipantObjection(
        db,
        "user-1",
        raised.id,
        {
          expectedRevision: raised.revision,
          idempotencyKey: "participant-objection:withdraw:resolve",
          withdraw: true,
        },
        debateRuntime,
      );
      const withdrawal = resolved.events.find(
        (event) => event.stepKey === "participant_objection_withdrawal",
      );
      const moderator = resolved.events.find(
        (event) =>
          event.kind === "moderator_ruling" &&
          event.stepKey === "participant_objection_withdrawal",
      );
      const continuation = resolved.events.find(
        (event) => event.stepKey === "participant_objection_continuation",
      );
      assert.equal(withdrawal?.content, "Objection withdrawn.");
      assert.match(moderator?.content ?? "", /^Objection withdrawn\./u);
      assert.equal(moderator?.ruling, null);
      assert.equal(continuation?.speakerBotId, "for");
      assert.equal(continuation?.parentEventId, moderator?.id);
      assert.equal(resolved.participantObjection, null);
      assert.equal(resolved.status, "waiting_for_player");
      assert.equal(resolved.stepKey, "opening_against_player");
    } finally {
      db.close();
    }
  });

  it("keeps a Participant ruling semantic while honoring muted and obfuscated moderator Powers", async () => {
    const cases = [
      {
        label: "muted",
        powers: [mutePower()],
        expectedKind: "silence",
        expectedContent: "...",
      },
      {
        label: "obfuscated",
        powers: [
          readyPower(
            "participant-objection-obfuscation",
            "Mumbled rulings",
            "The moderator's intended speech is only audible gibberish.",
            [{ type: "speech_obfuscation", mode: "gibberish" }],
          ),
        ],
        expectedKind: "moderator_ruling",
        expectedContent: applyBotPowerMumbledResponseV1(
          "Sustained. The objection identifies a real defect in the heard claim.",
        ),
      },
    ] as const;
    for (const testCase of cases) {
      const db = createTestDb();
      try {
        const provider = new ParticipantObjectionProvider("sustained");
        const debateRuntime = runtimeWith(provider);
        let session = await createDebateForRole(db, "participant", {
          debateRuntime,
          moderatorPowers: [...testCase.powers],
        });
        for (const step of ["intro", "opening"]) {
          session = await advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `participant-objection:${testCase.label}:${step}`,
            },
            debateRuntime,
          );
        }
        const target = session.events.find(
          (event) =>
            event.kind === "speech" &&
            event.sideId === "for" &&
            event.content.length > 24,
        );
        assert.ok(target);
        const raised = raiseDebateParticipantObjection(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `participant-objection:${testCase.label}:raise`,
            eventId: target.id,
            heardCharacterCount: Math.max(
              24,
              Math.floor(target.content.length * 0.58),
            ),
          },
        );
        const activated = activateDebateParticipantFloorBreak(
          db,
          "user-1",
          raised.id,
          {
            expectedRevision: raised.revision,
            idempotencyKey: `participant-objection:${testCase.label}:activate`,
            callEventId: raised.participantFloorBreak!.callEventId,
          },
        );
        const resolved = await resolveDebateParticipantObjection(
          db,
          "user-1",
          activated.id,
          {
            expectedRevision: activated.revision,
            idempotencyKey: `participant-objection:${testCase.label}:resolve`,
            content:
              "The heard conclusion does not follow from the stated premise.",
          },
          debateRuntime,
        );
        const ruling = resolved.events.find(
          (event) =>
            event.stepKey === "participant_objection_ruling" &&
            event.parentEventId !== null,
        );
        assert.equal(ruling?.ruling, "sustained");
        assert.equal(ruling?.kind, testCase.expectedKind);
        assert.equal(ruling?.content, testCase.expectedContent);
        assert.equal(
          resolved.events.some(
            (event) => event.stepKey === "participant_objection_continuation",
          ),
          false,
        );
      } finally {
        db.close();
      }
    }
  });

  it("keeps a mumbled moderator's intro gibberish after procedural bookend injection", async () => {
    const db = createTestDb();
    try {
      const mumblePower = readyPower(
        "moderator-mumbling",
        "Mumbling",
        "He mumbles at normal volume; everyone else hears only gibberish.",
        [{ type: "speech_obfuscation", mode: "gibberish" }],
      );
      let session = await createDebateForRole(db, "spectator", {
        moderatorPowers: [mumblePower],
      });
      assert.equal(
        session.powerPlan.bots[session.moderator.id]?.effects.some(
          ({ effect }) => effect.type === "speech_obfuscation",
        ),
        true,
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:mumbled-moderator-intro:0001",
        },
        runtime(),
      );

      const intro = session.events.find(
        (event) =>
          event.stepKey === "intro" &&
          event.speakerBotId === session.moderator.id,
      );
      assert.ok(intro);
      assert.ok(intro.powerIntendedContent);
      assert.match(intro.powerIntendedContent ?? "", /called to order/iu);
      assert.match(
        intro.powerIntendedContent ?? "",
        new RegExp(session.motion.motion.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
      );
      assert.equal(
        intro.content,
        applyBotPowerMumbledResponseV1(intro.powerIntendedContent!),
      );
      assert.doesNotMatch(intro.content, /called to order/iu);
      assert.doesNotMatch(
        intro.content,
        new RegExp(session.motion.motion.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "iu"),
      );

      const publicSession = debateSessionForPlayer(session);
      const publicIntro = publicSession.events.find(
        (event) => event.id === intro.id,
      );
      assert.equal(publicIntro?.content, intro.content);
      assert.equal(publicIntro?.powerIntendedContent, undefined);
      assert.doesNotMatch(JSON.stringify(publicSession), /called to order/iu);
    } finally {
      db.close();
    }
  });

  it("keeps a Participant-role mumbled moderator opening fully obfuscated", async () => {
    const db = createTestDb();
    try {
      const mumblePower = readyPower(
        "participant-moderator-mumbling",
        "Mumbling",
        "He mumbles at normal volume; everyone else hears only gibberish.",
        [{ type: "speech_obfuscation", mode: "gibberish" }],
      );
      let session = await createDebateForRole(db, "participant", {
        moderatorPowers: [mumblePower],
      });

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:participant-mumbled-intro:0001",
        },
        runtime(),
      );

      const intro = session.events.find(
        (event) =>
          event.stepKey === "intro" &&
          event.speakerBotId === session.moderator.id,
      );
      assert.ok(intro?.powerIntendedContent);
      assert.match(intro?.powerIntendedContent ?? "", /called to order/iu);
      assert.equal(
        intro?.content,
        applyBotPowerMumbledResponseV1(intro!.powerIntendedContent!),
      );
      assert.doesNotMatch(intro?.content ?? "", /called to order/iu);
    } finally {
      db.close();
    }
  });

  it("wires mute silence holds, Debate amnesia wipe, and muted foreperson speech", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../debate.ts", import.meta.url)),
      "utf8",
    );
    assert.match(
      source,
      /No prior continuity\. Treat this as first contact with the chamber/u,
    );
    assert.match(source, /Hard fresh-contact rule: only the current instruction exists/u);
    assert.match(source, /applyBotPowerEternalIntroductionResponseV1/u);
    assert.match(source, /hardMuted && snapshot\.role !== "advocate"/u);
    assert.match(source, /debateMuteSilenceAudienceReaction/u);
    assert.match(source, /speakingForeperson/u);
    assert.match(
      source,
      /session\.powerPlan\.bots\[candidate\.id\]\?\.hardMuted !== true/u,
    );
  });

  it("starts with a hard-muted moderator and lets the advocates encounter the silence", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Silent Mira", [mutePower()]);
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const provider = new SilentModeratorEncounterProvider();
      const debateRuntime = runtimeWith(provider);
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        debateRuntime,
      );
      assert.ok(
        checks.every((check) => check.motionHash === debateMotionHash(MOTION)),
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          theme: "light",
          idempotencyKey: "create:muted:0001",
        },
        debateRuntime,
      );
      assert.equal(
        session.powerPlan.bots[session.moderator.id]?.hardMuted,
        true,
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:muted-intro:0001",
        },
        debateRuntime,
      );
      assert.equal(session.stepKey, "opening_for");
      assert.deepEqual(
        session.events.slice(-1).map((event) => ({
          kind: event.kind,
          speakerBotId: event.speakerBotId,
          content: event.content,
        })),
        [{ kind: "silence", speakerBotId: "moderator", content: "..." }],
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:muted-opening:0001",
        },
        debateRuntime,
      );
      assert.match(
        provider.openingPrompt,
        /opened with only visible canonical silence/u,
      );
      assert.match(provider.openingPrompt, /Never name a hidden Power/u);
      assert.match(
        provider.openingPrompt,
        /reaction must not consume the turn/u,
      );
      assert.match(
        provider.openingPrompt,
        /at least two substantive sentences/u,
      );
      const opening = [...session.events]
        .reverse()
        .find(
          (event) =>
            event.kind === "speech" &&
            event.speakerBotId === session.forAdvocate.id,
        );
      assert.match(opening?.content ?? "", /No opening bell, then/u);
      assert.equal(opening?.timing?.status, "overtime");
      assert.ok(
        session.events.some(
          (event) =>
            event.kind === "silence" &&
            event.speakerBotId === session.moderator.id &&
            event.parentEventId === opening?.id,
        ),
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:muted-opening-against:0001",
        },
        debateRuntime,
      );
      assert.equal(session.stepKey, "challenge_for_prompt");

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:muted-challenge:0001",
        },
        debateRuntime,
      );
      assert.equal(session.stepKey, "challenge_for_answer");
      assert.deepEqual(
        session.events.slice(-1).map((event) => ({
          kind: event.kind,
          speakerBotId: event.speakerBotId,
          content: event.content,
        })),
        [{ kind: "silence", speakerBotId: "moderator", content: "..." }],
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:muted-challenge-answer:0001",
        },
        debateRuntime,
      );
      assert.equal(session.stepKey, "challenge_against_prompt");
      assert.match(
        provider.challengePrompt,
        /Do not invent, quote, or answer a question/u,
      );
      assert.match(
        provider.challengePrompt,
        /one serious vulnerability in your own public case/u,
      );

      const reloaded = getDebateSession(db, "user-1", session.id);
      assert.equal(reloaded.stepKey, "challenge_against_prompt");
      assert.equal(
        reloaded.events.filter(
          (event) =>
            event.speakerBotId === reloaded.moderator.id &&
            event.kind === "silence" &&
            event.content === "...",
        ).length,
        3,
      );
      const paused = pauseDebateSession(db, "user-1", reloaded.id, {
        expectedRevision: reloaded.revision,
        idempotencyKey: "pause:muted:0001",
      });
      assert.partialDeepStrictEqual(paused.events.at(-1), {
        kind: "silence",
        speakerKind: "moderator",
        speakerBotId: paused.moderator.id,
        stepKey: "pause",
        content: "...",
      });
      const resumed = resumeDebateSession(db, "user-1", paused.id, {
        expectedRevision: paused.revision,
        idempotencyKey: "resume:muted:0001",
      });
      assert.partialDeepStrictEqual(resumed.events.at(-1), {
        kind: "judge_gavel",
        speakerKind: "moderator",
        speakerBotId: resumed.moderator.id,
        stepKey: "resume",
        content: "...",
        gavelReason: "resume",
      });
      session = endDebateSessionEarly(db, "user-1", resumed.id, {
        expectedRevision: resumed.revision,
        idempotencyKey: "muted:end-early",
      });
      let completionMutation = 0;
      while (session.status !== "completed" && session.stepKey !== "completed") {
        completionMutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `muted:complete:${completionMutation}`,
          },
          debateRuntime,
        );
        assert.ok(completionMutation < 8);
      }
      assert.partialDeepStrictEqual(session.events.at(0), {
        kind: "silence",
        speakerKind: "moderator",
        speakerBotId: session.moderator.id,
        content: "...",
      });
      assert.partialDeepStrictEqual(session.events.at(-1), {
        kind: "silence",
        speakerKind: "moderator",
        speakerBotId: session.moderator.id,
        stepKey: "closing_moderator",
        content: "...",
      });
    } finally {
      db.close();
    }
  });

  it("keeps Ryuk's moderation durable while SpongeBob and Patrick encounter only an empty, silent podium", async () => {
    const db = createTestDb();
    try {
      seedBot(
        db,
        "moderator",
        "Ryuk",
        ryukInvisiblePowers(),
        "Ryuk is an amused supernatural observer who speaks in complete thoughts.",
      );
      seedBot(
        db,
        "for",
        "SpongeBob",
        [],
        "SpongeBob is earnest, buoyant, practical, and eager to make a clear case.",
      );
      seedBot(
        db,
        "against",
        "Patrick",
        [],
        "Patrick is literal, slow-moving, unexpectedly insightful, and concise.",
      );
      const provider = new PerceptibilityAwareModeratorProvider();
      const debateRuntime = runtimeWith(provider);
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        debateRuntime,
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: {
            version: DEBATE_SCHEMA_VERSION,
            notes: "",
            sources: [],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          theme: "dark",
          idempotencyKey: "create:ryuk-spongebob-patrick:0001",
        },
        debateRuntime,
      );
      assert.deepEqual(session.powerPlan.bots.moderator?.visibleToBotIds, []);
      assert.deepEqual(
        session.powerPlan.bots.moderator?.speechAudienceBotIds,
        [],
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:ryuk-intro:0001",
        },
        debateRuntime,
      );
      const durableOpening = session.events.at(-1);
      assert.equal(durableOpening?.speakerKind, "moderator");
      assert.match(
        durableOpening?.content ?? "",
        /MODERATOR OPENING SENTINEL/u,
      );
      assert.notEqual(durableOpening?.content, "...");
      const projectedOpening = debateSessionForPlayer(session).events.at(-1);
      assert.equal(projectedOpening?.speakerKind, "system");
      assert.match(
        projectedOpening?.content ?? "",
        /podium remains empty and silent/u,
      );
      assert.doesNotMatch(
        projectedOpening?.content ?? "",
        /MODERATOR OPENING SENTINEL/u,
      );
      const replayOpening = debateSessionForPlayer(session, "replay").events.at(
        -1,
      );
      assert.equal(replayOpening?.speakerKind, "system");
      assert.match(
        replayOpening?.content ?? "",
        /podium remains empty and silent/u,
      );
      assert.doesNotMatch(
        replayOpening?.content ?? "",
        /MODERATOR OPENING SENTINEL/u,
      );
      const withModeratorBallot = {
        ...session,
        ballots: [
          {
            version: DEBATE_SCHEMA_VERSION,
            voterBotId: session.moderator.id,
            sideId: "for" as const,
            reason: "MODERATOR BALLOT REASON SENTINEL",
            privateReason: false,
            createdAt: NOW,
          },
        ],
      };
      assert.deepEqual(debateSessionForPlayer(withModeratorBallot).ballots[0], {
        ...withModeratorBallot.ballots[0],
        reason: null,
        privateReason: true,
      });
      assert.equal(
        debateSessionForPlayer(withModeratorBallot, "replay").ballots[0]
          ?.reason,
        null,
      );
      assert.equal(
        withModeratorBallot.ballots[0]?.reason,
        "MODERATOR BALLOT REASON SENTINEL",
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:spongebob-opening:0001",
        },
        debateRuntime,
      );
      assert.match(
        provider.spongeBobOpeningPrompt,
        /podium appeared empty and no opening words were perceptible/u,
      );
      assert.match(provider.spongeBobOpeningPrompt, /unexpectedly open floor/u);
      assert.doesNotMatch(
        provider.spongeBobOpeningPrompt,
        /MODERATOR OPENING SENTINEL/u,
      );
      assert.match(
        session.events.find(
          (event) => event.kind === "speech" && event.speakerBotId === "for",
        )?.content ?? "",
        /An empty podium\?/u,
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:patrick-opening:0001",
        },
        debateRuntime,
      );
      assert.doesNotMatch(
        provider.patrickOpeningPrompt,
        /MODERATOR OPENING SENTINEL/u,
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:ryuk-challenge:0001",
        },
        debateRuntime,
      );
      const durableChallenge = session.events.at(-1);
      assert.equal(durableChallenge?.speakerKind, "moderator");
      assert.match(
        durableChallenge?.content ?? "",
        /MODERATOR CHALLENGE SENTINEL/u,
      );
      const projectedChallenge = debateSessionForPlayer(session).events.at(-1);
      assert.equal(projectedChallenge?.speakerKind, "system");
      assert.match(
        projectedChallenge?.content ?? "",
        /No moderator challenge is perceptible/u,
      );

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:spongebob-open-challenge:0001",
        },
        debateRuntime,
      );
      assert.match(
        provider.challengeAnswerPrompt,
        /no challenge was perceptible to you/u,
      );
      assert.match(
        provider.challengeAnswerPrompt,
        /Do not invent, quote, or answer a question/u,
      );
      assert.doesNotMatch(
        provider.challengeAnswerPrompt,
        /MODERATOR CHALLENGE SENTINEL/u,
      );
      const livePlayerSession = debateSessionForPlayer(session);
      assert.doesNotMatch(
        livePlayerSession.events.map((event) => event.content).join("\n"),
        /MODERATOR (?:OPENING|CHALLENGE) SENTINEL/u,
      );
      assert.doesNotMatch(
        session.caseBoard.map((card) => card.summary).join("\n"),
        /MODERATOR (?:OPENING|CHALLENGE) SENTINEL/u,
      );
    } finally {
      db.close();
    }
  });

  it("lets Light alone perceive Ryuk while Patrick receives only neutral procedure", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Ryuk", ryukInvisiblePowers());
      seedBot(
        db,
        "for",
        "Light Yagami",
        [],
        "Light Yagami is controlled, analytical, and fully able to perceive Ryuk.",
      );
      seedBot(db, "against", "Patrick");
      const provider = new PerceptibilityAwareModeratorProvider();
      const debateRuntime = runtimeWith(provider);
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        debateRuntime,
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: {
            version: DEBATE_SCHEMA_VERSION,
            notes: "",
            sources: [],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:ryuk-light-patrick:0001",
        },
        debateRuntime,
      );
      assert.deepEqual(session.powerPlan.bots.moderator?.speechAudienceBotIds, [
        "for",
      ]);
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:ryuk-light-intro:0001",
        },
        debateRuntime,
      );
      assert.equal(
        debateSessionForPlayer(session).events.at(-1)?.speakerKind,
        "moderator",
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:light-opening:0001",
        },
        debateRuntime,
      );
      assert.match(
        provider.spongeBobOpeningPrompt,
        /MODERATOR OPENING SENTINEL/u,
      );
      assert.doesNotMatch(
        provider.spongeBobOpeningPrompt,
        /unexpectedly open floor/u,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:patrick-after-light:0001",
        },
        debateRuntime,
      );
      assert.doesNotMatch(
        provider.patrickOpeningPrompt,
        /MODERATOR OPENING SENTINEL/u,
      );
      assert.match(
        provider.patrickOpeningPrompt,
        /moderator's podium remains empty and silent/u,
      );
    } finally {
      db.close();
    }
  });

  it("lets an Observant advocate perceive Ryuk without noticing his Power", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Ryuk", ryukInvisiblePowers());
      seedBot(db, "for", "Light Yagami");
      seedBot(
        db,
        "against",
        "Sherlock Holmes",
        observantPowers(),
        "Sherlock Holmes is exacting, analytical, and concise.",
      );
      const provider = new PerceptibilityAwareModeratorProvider();
      const debateRuntime = runtimeWith(provider);
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        debateRuntime,
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: {
            version: DEBATE_SCHEMA_VERSION,
            notes: "",
            sources: [],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:ryuk-observant:0001",
        },
        debateRuntime,
      );
      for (const key of ["intro", "for-opening", "observant-opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `advance:ryuk-observant:${key}`,
          },
          debateRuntime,
        );
      }

      assert.match(
        provider.patrickOpeningPrompt,
        /MODERATOR OPENING SENTINEL/u,
      );
      assert.match(
        provider.patrickOpeningPrompt,
        /every other bot as their ordinary baseline self/u,
      );
      assert.doesNotMatch(
        provider.patrickOpeningPrompt,
        /empty and silent|no opening words/u,
      );
      assert.doesNotMatch(
        provider.patrickOpeningPrompt,
        /Only Light Yagami can (?:see|hear) Ryuk/u,
      );
    } finally {
      db.close();
    }
  });

  it("adapts Inept separately for Debate moderators and advocates", async () => {
    const db = createTestDb();
    try {
      const provider = new IneptPromptProvider();
      const debateRuntime = runtimeWith(provider);
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
        moderatorPowers: ineptPowers(),
        forPowers: ineptPowers(),
      });
      for (const key of ["moderator-opening", "for-opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `advance:inept:${key}`,
          },
          debateRuntime,
        );
      }

      const prompt = provider.prompts.join("\n");
      assert.match(prompt, /INEPT MISTAKEN ASSIGNMENT/u);
      assert.match(prompt, /Moderating: misstate procedure/u);
      assert.match(prompt, /call the wrong bot/u);
      assert.match(prompt, /Debating: misunderstand the motion/u);
      assert.match(prompt, /misunderstand the motion, mishandle evidence/u);
      assert.match(prompt, /valid state still bind/u);
    } finally {
      db.close();
    }
  });

  it("keeps microscopic moderation invisible but audible", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Tiny Bill", microscopicPowers());
      seedBot(
        db,
        "for",
        "SpongeBob",
        [],
        "SpongeBob is earnest, buoyant, practical, and concise.",
      );
      seedBot(db, "against", "Patrick");
      const provider = new PerceptibilityAwareModeratorProvider();
      const debateRuntime = runtimeWith(provider);
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        debateRuntime,
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: {
            version: DEBATE_SCHEMA_VERSION,
            notes: "",
            sources: [],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:tiny-bill:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:tiny-bill-intro:0001",
        },
        debateRuntime,
      );
      const playerOpening = debateSessionForPlayer(session).events.at(-1);
      assert.equal(playerOpening?.speakerKind, "moderator");
      assert.match(playerOpening?.content ?? "", /MODERATOR OPENING SENTINEL/u);
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "advance:spongebob-hears-tiny-bill:0001",
        },
        debateRuntime,
      );
      assert.match(
        provider.spongeBobOpeningPrompt,
        /MODERATOR OPENING SENTINEL/u,
      );
      assert.doesNotMatch(
        provider.spongeBobOpeningPrompt,
        /unexpectedly open floor/u,
      );
    } finally {
      db.close();
    }
  });

  it("discloses Devil's Advocate consent once in the moderator intro", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const devilRuntime = runtimeWith(new DevilsAdvocateProvider());
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        devilRuntime,
      );
      assert.ok(checks.every((check) => check.status === "devils_advocate"));
      assert.ok(
        checks.every(
          (check) =>
            check.reason ===
            "This position conflicts with my ordinary convictions.",
        ),
      );
      const created = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:devils:0001",
        },
        devilRuntime,
      );
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "advance:devils:intro",
        },
        devilRuntime,
      );
      assert.equal(
        intro.events.filter((event) =>
          /Devil['’]s Advocate/iu.test(event.content),
        ).length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("moves required disclosure to the public docket when the moderator is silent", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Silent Mira", [mutePower()]);
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const devilRuntime = runtimeWith(new DevilsAdvocateProvider());
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        devilRuntime,
      );
      const created = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:muted-devils:0001",
        },
        devilRuntime,
      );
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "advance:muted-devils:intro",
        },
        devilRuntime,
      );
      const moderatorEvents = intro.events.filter(
        (event) => event.speakerBotId === intro.moderator.id,
      );
      assert.deepEqual(
        moderatorEvents.map((event) => [event.kind, event.content]),
        [["silence", "..."]],
      );
      const disclosure = intro.events.find(
        (event) =>
          event.speakerKind === "system" &&
          /Docket notice:.*Devil['’]s Advocate/iu.test(event.content),
      );
      assert.ok(disclosure);
      assert.equal(disclosure.parentEventId, moderatorEvents[0]?.id);
    } finally {
      db.close();
    }
  });

  it("never overrides a declined role assignment", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const decliningRuntime = runtimeWith(new DecliningAdvocateProvider());
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        decliningRuntime,
      );
      assert.ok(checks.every((check) => check.status === "decline"));
      assert.ok(
        checks.every(
          (check) =>
            check.reason ===
            "This assignment crosses a defining authored boundary.",
        ),
      );
      assert.throws(
        () =>
          createDebateSession(
            db,
            "user-1",
            {
              motion: MOTION,
              evidence: { version: 1, notes: "", sources: [], frozenAt: null },
              moderatorBotId: "moderator",
              forAdvocateBotId: "for",
              againstAdvocateBotId: "against",
              playerRole: "spectator",
              advocacyConsent: checks,
              idempotencyKey: "create:declined:0001",
            },
            decliningRuntime,
          ),
        /declined this role.*Swap sides.*choose another bot.*revise the motion/iu,
      );
    } finally {
      db.close();
    }
  });

  it("pauses recoverably on provider failure and skips without fabricated dialogue", async () => {
    const db = createTestDb();
    try {
      const created = await createDebateForRole(db, "spectator");
      const introduced = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "advance:failure:intro",
        },
        runtime(),
      );
      const failed = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: introduced.revision,
          idempotencyKey: "advance:failure:0001",
        },
        runtimeWith(new FailingDebateProvider()),
      );
      assert.equal(failed.status, "paused");
      assert.match(failed.error ?? "", /Turn unavailable/u);
      assert.equal(
        failed.events.filter((event) => event.kind === "speech").length,
        0,
      );
      assert.partialDeepStrictEqual(failed.events.at(-1), {
        kind: "error",
        speakerKind: "system",
      });
      assert.match(
        failed.events.at(-1)?.content ?? "",
        /Retry or skip this turn/u,
      );
      const skipped = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: failed.revision,
          idempotencyKey: "advance:failure:skip",
          skip: true,
        },
        runtime(),
      );
      assert.equal(skipped.status, "live");
      assert.equal(skipped.stepKey, "opening_against");
      assert.equal(
        skipped.events.filter((event) => event.kind === "speech").length,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("can skip a failed post-ruling reaction without skipping the authority close", async () => {
    const db = createTestDb();
    const debateRuntime = runtime();
    try {
      let session = await createJudgeDebate(db, debateRuntime);
      let mutation = 0;
      while (session.stepKey !== "verdict_player") {
        mutation += 1;
        session =
          session.stepKey === "challenge_judge_question"
            ? await submitDebatePlayerTurn(db, "user-1", session.id, {
                expectedRevision: session.revision,
                idempotencyKey: `aftermath-failure:pass:${mutation}`,
                content: "",
                pass: true,
              })
            : await advanceDebateSession(
                db,
                "user-1",
                session.id,
                {
                  expectedRevision: session.revision,
                  idempotencyKey: `aftermath-failure:setup:${mutation}`,
                },
                debateRuntime,
              );
        assert.ok(mutation < 20);
      }
      session = submitDebateVerdict(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "aftermath-failure:verdict",
        sideId: "for",
        reason: "The For side carried the public exchange.",
      });
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "aftermath-failure:reaction-for",
        },
        runtimeWith(new FailingDebateProvider()),
      );
      assert.equal(session.status, "paused");
      assert.equal(session.stepKey, "judge_aftermath_for");

      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "aftermath-failure:skip-for",
          skip: true,
        },
        debateRuntime,
      );
      assert.equal(session.status, "live");
      assert.equal(session.stepKey, "judge_aftermath_against");
      for (const key of ["reaction-against", "close"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `aftermath-failure:${key}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.status, "completed");
      assert.equal(session.events.at(-1)?.stepKey, "judge_closing_moderator");
      assert.equal(session.events.at(-1)?.speakerBotId, session.moderator.id);
    } finally {
      db.close();
    }
  });

  it("freezes Auto routing, records the winning lane, and pauses when the chain is exhausted", async () => {
    const db = createTestDb();
    try {
      const recoveringRuntime = autoRuntime(
        new MalformedDebateProvider(),
        new DebateProviderStub(),
      );
      const created = await createDebateForRole(db, "spectator", {
        debateRuntime: recoveringRuntime,
      });
      assert.equal(created.responseMode, "local");
      assert.deepEqual(created.generationChain, [
        { provider: "local", model: "debate-primary" },
        { provider: "local", model: "debate-fallback" },
      ]);

      const recovered = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "advance:auto:recovery",
        },
        recoveringRuntime,
      );
      const generated = recovered.events.find(
        (event) => event.kind === "intro",
      );
      assert.equal(generated?.provider, "local");
      assert.equal(generated?.model, "debate-fallback");
      assert.equal(generated?.autoRecovery?.attempts.length, 2);
      assert.equal(generated?.autoRecovery?.crossedOnline, false);

      const exhausted = await advanceDebateSession(
        db,
        "user-1",
        recovered.id,
        {
          expectedRevision: recovered.revision,
          idempotencyKey: "advance:auto:exhausted",
        },
        autoRuntime(new FailingDebateProvider(), new FailingDebateProvider()),
      );
      assert.equal(exhausted.status, "paused");
      assert.match(exhausted.error ?? "", /All configured Auto models failed/u);
      assert.equal(
        exhausted.events.filter((event) => event.kind === "speech").length,
        recovered.events.filter((event) => event.kind === "speech").length,
      );
      assert.partialDeepStrictEqual(exhausted.events.at(-1), {
        kind: "error",
        speakerKind: "system",
      });
      assert.match(
        exhausted.events.at(-1)?.content ?? "",
        /Retry or skip this turn/u,
      );
    } finally {
      db.close();
    }
  });

  it("lets interruption Powers cut the heard speech, then gives the moderator the ruling", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil", [
        readyPower(
          "always-interrupt",
          "Always Cuts In",
          "Always interrupt Avery.",
          [
            {
              type: "interruption",
              frequency: "frequent",
              strength: "large",
              certainty: "always",
              targets: [{ kind: "bot", botId: "for", name: "Avery" }],
            },
          ],
        ),
      ]);
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtime(),
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:interrupt:0001",
        },
        runtime(),
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interrupt:intro",
        },
        runtime(),
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interrupt:opening",
        },
        runtime(),
      );
      const interruptedSpeech = session.events.find(
        (event) =>
          event.stepKey === "opening_for" &&
          event.kind === "speech" &&
          event.speakerBotId === "for",
      );
      const objections = session.events.filter(
        (event) =>
          event.stepKey === "opening_for" && event.kind === "objection",
      );
      const ruling = session.events.find(
        (event) =>
          event.stepKey === "opening_for" && event.kind === "moderator_ruling",
      );
      assert.equal(interruptedSpeech?.interrupted, true);
      assert.equal(interruptedSpeech?.interruptedBy, "bot");
      assert.match(interruptedSpeech?.content ?? "", /[…—]$/u);
      assert.equal(objections.length, 1);
      assert.equal(objections[0]?.speakerBotId, "against");
      assert.equal(objections[0]?.parentEventId, interruptedSpeech?.id);
      assert.match(objections[0]?.content ?? "", /^Objection!/u);
      assert.equal(ruling?.speakerBotId, "moderator");
      assert.equal(ruling?.parentEventId, objections[0]?.id);
      assert.doesNotMatch(
        session.caseBoard.find(
          (card) => card.createdEventId === interruptedSpeech?.id,
        )?.summary ?? "",
        /addresses it directly/u,
      );
      assert.equal(session.stepKey, "opening_against");
    } finally {
      db.close();
    }
  });

  it("waits for a human Judge after the spoken objection and makes the ruling consequential", async () => {
    for (const ruling of ["sustained", "overruled"] as const) {
      const db = createTestDb();
      try {
        const debateRuntime = runtime();
        let session = await createJudgeDebate(db, debateRuntime, {
          againstPowers: [
            readyPower(
              "always-interrupt",
              "Always Cuts In",
              "Always interrupt Avery.",
              [
                {
                  type: "interruption",
                  frequency: "frequent",
                  strength: "large",
                  certainty: "always",
                  targets: [{ kind: "bot", botId: "for", name: "Avery" }],
                },
              ],
            ),
          ],
        });
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `judge-objection:${ruling}:intro`,
          },
          debateRuntime,
        );
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `judge-objection:${ruling}:opening`,
          },
          debateRuntime,
        );

        const interrupted = session.events.find(
          (event) =>
            event.kind === "speech" &&
            event.stepKey === "opening_for" &&
            event.speakerBotId === "for",
        );
        const objection = session.events.find(
          (event) =>
            event.kind === "objection" &&
            event.stepKey === "opening_for" &&
            event.speakerBotId === "against",
        );
        assert.equal(session.status, "waiting_for_player");
        assert.equal(session.stepKey, "judge_objection_ruling");
        assert.partialDeepStrictEqual(session.objectionRuling, {
          status: "awaiting_ruling",
          interruptedEventId: interrupted?.id,
          objectionEventId: objection?.id,
          interruptedBotId: "for",
          objectingBotId: "against",
          resumeStatus: "live",
          resumeStepKey: "opening_against",
        });
        assert.match(objection?.content ?? "", /^Objection!/u);
        assert.equal(
          session.events.some((event) => event.kind === "moderator_ruling"),
          false,
        );
        assert.throws(
          () =>
            swingDebateJudgeGavel(db, "user-1", session.id, {
              expectedRevision: session.revision,
              idempotencyKey: `judge-objection:${ruling}:blocked-gavel`,
              eventId: null,
              overtime: false,
            }),
          (error: unknown) =>
            error instanceof HttpError &&
            error.statusCode === 409 &&
            /Rule on the objection/u.test(error.message),
        );

        const request = {
          expectedRevision: session.revision,
          idempotencyKey: `judge-objection:${ruling}:ruling`,
          ruling,
        };
        const resolved = await submitDebateObjectionRuling(
          db,
          "user-1",
          session.id,
          request,
          debateRuntime,
        );
        const judgeRuling = resolved.events.find(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.speakerKind === "player" &&
            event.parentEventId === objection?.id,
        );
        const continuation = resolved.events.find(
          (event) =>
            event.stepKey === "judge_objection_continuation" &&
            event.parentEventId === judgeRuling?.id,
        );
        assert.equal(resolved.status, "live");
        assert.equal(resolved.stepKey, "opening_against");
        assert.equal(resolved.objectionRuling, null);
        assert.equal(judgeRuling?.ruling, ruling);
        assert.equal(judgeRuling?.speakerBotId, resolved.moderator.id);
        assert.equal(
          Boolean(continuation),
          ruling === "overruled",
          `${ruling} continuation`,
        );
        if (continuation) {
          assert.equal(continuation.speakerBotId, "for");
          assert.equal(continuation.sideId, "for");
        }
        assert.deepEqual(
          await submitDebateObjectionRuling(
            db,
            "user-1",
            session.id,
            request,
            debateRuntime,
          ),
          resolved,
        );
      } finally {
        db.close();
      }
    }
  });

  it("enforces hearing-repeat as the prior exact public line", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil", [
        readyPower(
          "hearing-repeat",
          "Hard of Hearing",
          "Sometimes asks others to repeat themselves.",
          [
            {
              type: "hearing_repeat",
              frequency: "frequent",
              moodPenalty: "small",
            },
          ],
        ),
      ]);
      const hearingRuntime = runtimeWith(new HearingRepeatProvider());
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        hearingRuntime,
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:hearing:0001",
        },
        hearingRuntime,
      );
      for (const idempotencyKey of [
        "hearing:intro",
        "hearing:for",
        "hearing:against",
      ]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey,
          },
          hearingRuntime,
        );
      }
      const request = session.events.find(
        (event) =>
          event.stepKey === "opening_against" &&
          event.speakerBotId === "against" &&
          event.kind === "speech",
      );
      const repeated = session.events.find(
        (event) =>
          event.stepKey === "opening_against" &&
          event.speakerBotId === "for" &&
          event.kind === "reaction",
      );
      const prior = [...session.events]
        .reverse()
        .find(
          (event) =>
            event.stepKey === "opening_for" &&
            event.speakerBotId === "for" &&
            event.kind === "speech",
        );
      assert.match(request?.content ?? "", /What did you just say/u);
      assert.equal(repeated?.content, prior?.content);
      assert.equal(session.stepKey, "challenge_for_prompt");
    } finally {
      db.close();
    }
  });

  it("refines the case board locally without blocking or losing the prior board on failure", async () => {
    const db = createTestDb();
    try {
      const created = await createDebateForRole(db, "spectator");
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "case:intro",
        },
        runtime(),
      );
      const opening = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: intro.revision,
          idempotencyKey: "case:opening",
        },
        runtime(),
      );
      const sourceEvent = opening.events.find(
        (event) => event.kind === "speech" && event.sideId === "for",
      );
      assert.ok(sourceEvent);
      const prior = structuredClone(opening.caseBoard);
      await assert.rejects(() =>
        refineDebateCaseBoard(
          db,
          "user-1",
          opening.id,
          sourceEvent,
          new FailingDebateProvider(),
        ),
      );
      assert.deepEqual(
        getDebateSession(db, "user-1", opening.id).caseBoard,
        prior,
      );
      await refineDebateCaseBoard(
        db,
        "user-1",
        opening.id,
        sourceEvent,
        new CaseBoardProvider(),
      );
      const refined = getDebateSession(db, "user-1", opening.id);
      assert.equal(
        refined.caseBoard.find((card) => card.createdEventId === sourceEvent.id)
          ?.summary,
        "Transit zoning directly addresses scarce rail-adjacent land.",
      );
      assert.equal(
        refined.events.filter((event) => event.kind === "case_board").at(-1)
          ?.parentEventId,
        sourceEvent.id,
      );
      assert.ok(
        refined.events.some(
          (event) =>
            event.kind === "case_board" &&
            event.content.includes(
              "Transit zoning directly addresses scarce rail-adjacent land.",
            ),
        ),
      );
    } finally {
      db.close();
    }
  });

  it("does not let a delayed case-board refinement restore speech cut off by a Participant objection", async () => {
    const db = createTestDb();
    try {
      const debateRuntime = runtime();
      let session = await createDebateForRole(db, "participant", {
        debateRuntime,
      });
      for (const step of ["intro", "opening"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `case:participant-objection:${step}`,
          },
          debateRuntime,
        );
      }
      const sourceEvent = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.sideId === "for" &&
          event.content.length > 24,
      );
      assert.ok(sourceEvent);
      const provider = new DelayedCaseBoardProvider();
      const refinement = refineDebateCaseBoard(
        db,
        "user-1",
        session.id,
        sourceEvent,
        provider,
      );
      await provider.started;
      const raised = raiseDebateParticipantObjection(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "case:participant-objection:raise",
        eventId: sourceEvent.id,
        heardCharacterCount: Math.max(
          24,
          Math.floor(sourceEvent.content.length * 0.42),
        ),
      });
      const boardAfterCut = structuredClone(raised.caseBoard);
      provider.release();
      await refinement;
      const settled = getDebateSession(db, "user-1", session.id);
      assert.deepEqual(settled.caseBoard, boardAfterCut);
      assert.equal(
        settled.events.find((event) => event.id === sourceEvent.id)?.content,
        raised.events.find((event) => event.id === sourceEvent.id)?.content,
      );
      assert.doesNotMatch(
        settled.caseBoard.find((card) => card.createdEventId === sourceEvent.id)
          ?.summary ?? "",
        /Transit zoning directly addresses scarce rail-adjacent land/u,
      );
    } finally {
      db.close();
    }
  });

  it("keeps concession preambles off the speaker's active case-board card", async () => {
    const db = createTestDb();
    const provider = new ConcessionPreambleProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      const created = await createJudgeDebate(db, debateRuntime);
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "case:preamble:intro",
        },
        debateRuntime,
      );
      const opening = await advanceDebateSession(
        db,
        "user-1",
        intro.id,
        {
          expectedRevision: intro.revision,
          idempotencyKey: "case:preamble:opening",
        },
        debateRuntime,
      );
      const openingEvent = opening.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_for" &&
          event.sideId === "for",
      );
      assert.ok(openingEvent);
      assert.equal(
        opening.caseBoard.find(
          (card) => card.createdEventId === openingEvent.id,
        )?.summary,
        "But broad rail zoning still addresses the citywide shortage directly.",
      );
    } finally {
      db.close();
    }
  });

  it("hardens case-board claim summaries against Cookout-style distillation failures", () => {
    assert.equal(
      debateCaseBoardClaimSummary(
        "I concede that local planning has value. But broad rail zoning still addresses the citywide shortage directly.",
      ),
      "But broad rail zoning still addresses the citywide shortage directly.",
    );
    assert.doesNotMatch(
      debateCaseBoardClaimSummary(
        "Hot dogs carry more fat, sodium, and preservatives. Still, one-handed toppings keep the cookout practical.",
      ),
      /^Hot dogs carry more fat/u,
    );
    assert.match(
      debateCaseBoardClaimSummary(
        "Hot dogs carry more fat, sodium, and preservatives. Still, one-handed toppings keep the cookout practical.",
      ),
      /one-handed toppings keep the cookout practical/u,
    );
    assert.equal(
      debateCaseBoardClaimSummary(
        "[[source:scholar-1]] is blueberries, not burgers—but it spotlights the hole in the health lane.",
      ),
      "",
    );
    assert.equal(
      debateCaseBoardClaimSummary(
        "Hot dogs carry more fat, sodium, and preservatives.",
      ),
      "",
    );
    assert.match(
      debateCaseBoardClaimSummary(
        'No—Sol keeps shrinking "all-around" into "most impressive bite.',
      ),
      /impressive bite/u,
    );
    assert.match(
      debateCaseBoardClaimSummary(
        'No—Sol keeps shrinking "all-around" into "most impressive bite.',
      ),
      /"$/u,
    );
    assert.ok(
      debateAdvocateSpeechNearEcho(
        "A hot dog can still get all those toppings without becoming a two-handed disaster while staying portable at the grill.",
        "Look, a hot dog can still get all those toppings without becoming a two-handed disaster — portability at the grill remains the point.",
      ),
    );
    assert.equal(
      debateModeratorFloorCopyViolatesUpcoming(
        "Let's move now to the rebuttal stage.",
        { stepKey: "challenge_against_answer" } as never,
      ),
      true,
    );
    assert.equal(
      debateModeratorFloorCopyViolatesUpcoming(
        "The rebuttal window is closed.",
        { stepKey: "jury_discussion", jury: { enabled: true } } as never,
      ),
      true,
    );
    assert.equal(
      debateModeratorFloorCopyViolatesUpcoming(
        "Time. Avery now has the scheduled floor.",
        { stepKey: "rebuttal_against" } as never,
      ),
      false,
    );
    assert.match(debateSource, /generateAdvocateSpeechAvoidingEcho/u);
    assert.match(debateSource, /caseBoardNearDuplicate/u);
  });

  it("falls back when overtime copy invents a rebuttal stage during challenge", async () => {
    class InventedRebuttalOvertimeProvider extends OvertimeProvider {
      public override async generateResponse(
        messages: ProviderMessage[],
        options?: GenerateOptions,
      ): Promise<string> {
        const text = messages.map((message) => message.content).join("\n");
        if (text.includes("beyond the allotted floor time")) {
          this.lastCorrectionPrompt = text;
          return JSON.stringify({
            content: "Time. Let's move now to the rebuttal stage.",
          });
        }
        return super.generateResponse(messages, options);
      }
    }

    const db = createTestDb();
    const provider = new InventedRebuttalOvertimeProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      let session = await createDebateForRole(db, "spectator", {
        debateRuntime,
      });
      for (const key of ["intro", "opening-for", "opening-against"]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `overtime-invented-rebuttal:${key}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.stepKey, "challenge_for_prompt");
      const correction = session.events.find(
        (event) => event.kind === "moderator_ruling",
      );
      assert.ok(correction);
      assert.doesNotMatch(correction.content, /\brebuttal\b/iu);
      assert.match(provider.lastCorrectionPrompt, /Do not invent a stage name/u);
    } finally {
      db.close();
    }
  });

  it("rejects ungrounded card rewrites and unrelated conceded statuses", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "case:grounding:intro",
        },
        runtime(),
      );
      const forOpening = await advanceDebateSession(
        db,
        "user-1",
        intro.id,
        {
          expectedRevision: intro.revision,
          idempotencyKey: "case:grounding:for",
        },
        runtime(),
      );
      const againstOpening = await advanceDebateSession(
        db,
        "user-1",
        forOpening.id,
        {
          expectedRevision: forOpening.revision,
          idempotencyKey: "case:grounding:against",
        },
        runtime(),
      );
      const sourceEvent = againstOpening.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_against" &&
          event.sideId === "against",
      );
      assert.ok(sourceEvent);
      const originalTarget = againstOpening.caseBoard.find(
        (card) => card.createdEventId === sourceEvent.id,
      );
      const opposingCard = againstOpening.caseBoard.find(
        (card) => card.sideId === "for",
      );
      assert.ok(originalTarget);
      assert.ok(opposingCard);

      const observedSource = sourceEvent;
      await refineDebateCaseBoard(
        db,
        "user-1",
        againstOpening.id,
        observedSource,
        new UngroundedCaseBoardProvider(),
      );
      let stored = getDebateSession(db, "user-1", againstOpening.id);
      assert.equal(
        stored.caseBoard.find((card) => card.id === originalTarget.id)?.summary,
        originalTarget.summary,
      );

      await refineDebateCaseBoard(
        db,
        "user-1",
        againstOpening.id,
        observedSource,
        new SpoofedCaseBoardStatusProvider(opposingCard.id),
      );
      stored = getDebateSession(db, "user-1", againstOpening.id);
      assert.equal(
        stored.caseBoard.find((card) => card.id === originalTarget.id)?.summary,
        "The central constraint is real, and local limits still address it directly.",
      );
      assert.notEqual(
        stored.caseBoard.find((card) => card.id === opposingCard.id)?.status,
        "conceded",
      );
      assert.equal(
        stored.events.filter((event) => event.kind === "case_board").at(-1)
          ?.parentEventId,
        sourceEvent.id,
      );
    } finally {
      db.close();
    }
  });

  it("round-trips Debate sessions and events through account backup and clears them on reset", async () => {
    const db = createTestDb();
    try {
      const created = await createDebateForRole(db, "participant");
      let advanced = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "backup:advance:0001",
        },
        runtime(),
      );
      for (let index = 1; index <= 3; index += 1) {
        advanced = pauseDebateSession(db, "user-1", advanced.id, {
          expectedRevision: advanced.revision,
          idempotencyKey: `backup:recess:${index}`,
          quietSave: true,
          recessIntent: "deliberate",
        });
        if (index < 3) {
          advanced = resumeDebateSession(db, "user-1", advanced.id, {
            expectedRevision: advanced.revision,
            idempotencyKey: `backup:resume:${index}`,
            quietSave: true,
          });
        }
      }
      const key = Buffer.alloc(32, 7);
      const snapshot = exportUserSnapshot(db, "user-1", key);
      assert.equal(snapshot.debates?.sessions.length, 1);
      assert.equal(snapshot.debates?.events.length, advanced.events.length);
      assert.equal(snapshot.debates?.recessCheckpoints?.length, 1);

      db.prepare("DELETE FROM users WHERE id = ?").run("user-1");
      importUserSnapshot(db, "user-2", snapshot, key);
      const restored = getDebateSession(db, "user-2", advanced.id);
      assert.equal(restored.stepKey, advanced.stepKey);
      assert.equal(restored.events.length, advanced.events.length);
      assert.equal(restored.evidence.frozenAt, advanced.evidence.frozenAt);
      assert.equal(
        restored.againstAdvocate.id,
        DEBATE_PLAYER_PARTICIPANT_BOT_ID,
      );
      assert.equal(
        restored.againstAdvocate.revision,
        advanced.againstAdvocate.revision,
      );
      assert.deepEqual(restored.advocacyConsent, advanced.advocacyConsent);
      assert.equal(restored.participation?.recess.checkpoint?.revision, advanced.revision);
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM debate_recess_checkpoints WHERE user_id = ?",
            )
            .get("user-2") as { count: number }
        ).count,
        1,
      );

      restoreFactoryDefaultsInDatabase(db, "user-2");
      assert.equal(listDebateSessions(db, "user-2").length, 0);
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM debate_events WHERE user_id = ?",
            )
            .get("user-2") as { count: number }
        ).count,
        0,
      );
      assert.equal(
        (
          db
            .prepare(
              "SELECT COUNT(*) AS count FROM debate_recess_checkpoints WHERE user_id = ?",
            )
            .get("user-2") as { count: number }
        ).count,
        0,
      );
    } finally {
      db.close();
    }
  });
});
