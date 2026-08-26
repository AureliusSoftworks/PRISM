import assert from "node:assert/strict";
import test from "node:test";
import type {
  DebateMysteryPublicDialogueEntryV2,
  DebateSessionV1,
  DebateWhodunnitFormatStateV2,
} from "@localai/shared";
import { debateMysteryIdentityMirrorPresentationsV1 } from "./debateMysteryIdentityMirror.ts";

const holder = "holder";
const prosecutor = "prosecutor";
const witness = "witness";

function session(): Pick<DebateSessionV1, "powerPlan"> {
  return {
    powerPlan: {
      bots: {
        [holder]: {
          botId: holder,
          effects: [{
            powerId: "identity-crisis",
            powerName: "Identity Crisis",
            policy: "direct",
            effect: { type: "identity_mirror", trigger: "direct_bot_address" },
          }],
          hardMuted: false,
          visibleToBotIds: null,
          speechAudienceBotIds: null,
          warnings: [],
        },
      },
    },
  } as unknown as Pick<DebateSessionV1, "powerPlan">;
}

function state(
  dialogueHistory: DebateMysteryPublicDialogueEntryV2[],
): Pick<DebateWhodunnitFormatStateV2, "config" | "suspects" | "topics" | "dialogueHistory"> {
  return {
    config: {
      prosecutorBotId: prosecutor,
      rivalDefenseBotId: "defense",
      judgeBotId: "judge",
      jurorBotIds: [],
    },
    suspects: [
      { seatId: "holder-seat", botId: holder, name: "Collin" },
      { seatId: "witness-seat", botId: witness, name: "Megan" },
    ],
    topics: [{ nodeId: "talk-holder-seat-alibi", suspectSeatId: "holder-seat" }],
    dialogueHistory,
  } as Pick<DebateWhodunnitFormatStateV2, "config" | "suspects" | "topics" | "dialogueHistory">;
}

function entry(overrides: Partial<DebateMysteryPublicDialogueEntryV2>): DebateMysteryPublicDialogueEntryV2 {
  return {
    nodeId: "talk-holder-seat-alibi",
    lineId: "line-1",
    visibleText: "Collin, where were you when the lights failed?",
    speakerSeatId: null,
    speakerBotId: prosecutor,
    occurredAt: "2026-08-25T10:00:00.000Z",
    ...overrides,
  };
}

test("Whodunnit Identity Crisis follows a sealed direct recipient and does not restart for the same bot", () => {
  const presentations = debateMysteryIdentityMirrorPresentationsV1({
    session: session(),
    state: state([
      entry({ intendedRecipientSeatId: "holder-seat" }),
      entry({
        lineId: "line-2",
        visibleText: "Collin, answer the question plainly.",
        occurredAt: "2026-08-25T10:00:01.000Z",
        intendedRecipientBotId: holder,
      }),
    ]),
    botNamesById: new Map([[holder, "Collin"], [prosecutor, "Megan"]]),
  });

  assert.deepEqual(presentations.get(holder), {
    holderBotId: holder,
    targetBotId: prosecutor,
    sourceDialogueKey: "talk-holder-seat-alibi:line-1:2026-08-25T10:00:00.000Z",
    occurredAt: "2026-08-25T10:00:00.000Z",
  });
});

test("Whodunnit Identity Crisis supports existing sealed talk nodes without inventing turn-order routing", () => {
  const presentations = debateMysteryIdentityMirrorPresentationsV1({
    session: session(),
    state: state([entry({
      intendedRecipientSeatId: undefined,
      visibleText: "Where were you when the lights failed?",
    })]),
    botNamesById: new Map([[holder, "Collin"], [prosecutor, "Megan"]]),
  });

  assert.equal(presentations.get(holder)?.targetBotId, prosecutor);
});

test("Whodunnit Identity Crisis can switch only when another bot directly addresses the holder", () => {
  const presentations = debateMysteryIdentityMirrorPresentationsV1({
    session: session(),
    state: state([
      entry({ intendedRecipientSeatId: "holder-seat" }),
      entry({
        nodeId: "court-defendant-reaction",
        lineId: "line-3",
        visibleText: "Collin, that version leaves too much out.",
        speakerSeatId: "witness-seat",
        speakerBotId: witness,
        occurredAt: "2026-08-25T10:00:02.000Z",
      }),
    ]),
    botNamesById: new Map([
      [holder, "Collin"],
      [prosecutor, "Megan"],
      [witness, "Miles"],
    ]),
  });

  assert.equal(presentations.get(holder)?.targetBotId, witness);
});
