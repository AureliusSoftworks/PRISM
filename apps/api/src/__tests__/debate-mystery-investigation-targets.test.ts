import assert from "node:assert/strict";
import test from "node:test";
import { debateMysteryRoomPresentationRegionsV1, emptyDebateMysteryMutationsV2, emptyDebateMysteryRequirementsV2, type DebateMysteryDialogueGraphV2, type DebateWhodunnitFormatStateV2 } from "@localai/shared";
import { projectMysteryMeaningfulInvestigationTargetsV2 } from "../debate-mystery-investigation-targets.ts";

function fixture() {
  const region = debateMysteryRoomPresentationRegionsV1({ templateId: "study", imageId: "custom", usesBundledHotspotGeometry: false }).find((entry) => entry.id.endsWith("scene-center-surface:detail-lower"))!;
  const key = `room:${region.id}`;
  const node = {
    id: "examine-padding", kind: "examination_result", scene: "investigation", speakerSeatId: null,
    intendedRecipientSeatId: null, lineId: "line", label: null,
    requirements: emptyDebateMysteryRequirementsV2(),
    mutations: { ...emptyDebateMysteryMutationsV2(), discoverIds: [`hotspot:${key}`] },
    recordReferences: [], nextNodeIds: [], terminalOutcome: "return_to_room",
  };
  const state = {
    rooms: [{ id: "room", templateId: "study", imageId: "custom", hotspots: [{ ...region, unlocked: true, examined: false }] }],
    crimeSceneRoomId: "room", openingSweepComplete: false, dialogueHistory: [],
  } as unknown as DebateWhodunnitFormatStateV2;
  const graph = {
    nodes: [node], lines: [{ id: "line", visibleText: "Nothing over here but the lower portion of the center of the room." }],
    interactionRootNodeIds: [node.id], witnessChapters: [], presentationGates: [],
  } as unknown as DebateMysteryDialogueGraphV2;
  const privateCase = { examineNodeIdByHotspot: { [key]: node.id } };
  return { state, graph, privateCase, key };
}

test("saved generic padding is inert without changing the frozen graph, record or facts", () => {
  const input = fixture();
  const before = structuredClone(input);
  const result = projectMysteryMeaningfulInvestigationTargetsV2(input);
  assert.equal(result.rooms[0].hotspots.length, 0);
  assert.equal(result.openingSweepComplete, true);
  assert.deepEqual(input, before, "projection is read-only");
  assert.equal(result.dialogueHistory, input.state.dialogueHistory);
});

test("ordinary concrete scenery, authored detail and unknown saved metadata remain inspectable", () => {
  for (const change of ["object", "authored-fact", "missing-line"] as const) {
    const input = fixture();
    if (change === "object") { input.state.rooms[0].hotspots[0].id = "study:lamp"; input.state.rooms[0].hotspots[0].label = "lamp"; }
    if (change === "authored-fact") input.graph.lines[0].visibleText = "A fresh scuff crosses the floor beneath the desk.";
    if (change === "missing-line") input.graph.lines = [];
    assert.equal(projectMysteryMeaningfulInvestigationTargetsV2(input), input.state, change);
  }
});

test("all consequential and dependency-bearing fallback targets survive without public truth flags", () => {
  for (const protect of ["record", "item", "topic", "choice", "discovery", "proof", "graph-proof", "gate", "token", "access-bridge", "branch", "prerequisite", "terminal"] as const) {
    const input = fixture();
    const node = input.graph.nodes[0];
    if (protect === "record") node.mutations.admitRecordIds = ["evidence:1"];
    if (protect === "item") node.mutations.acquireItemIds = ["key"];
    if (protect === "topic") node.mutations.unlockTopicIds = ["lead"];
    if (protect === "choice") node.mutations.choices = [{ choiceId: "choice", optionId: "answer" }];
    if (protect === "discovery") node.mutations.discoverIds.push("token:1");
    if (protect === "proof") Object.assign(input.privateCase, { accusedAlibiSupportDiscoveryIds: [`hotspot:${input.key}`] });
    if (protect === "token") Object.assign(input.privateCase, { protectedInvestigationHotspotKeys: [input.key] });
    if (protect === "access-bridge") Object.assign(input.privateCase, { caseKitItemIdByExamineNodeId: { [node.id]: "safe-code" } });
    if (protect === "graph-proof") input.graph.nodes.push({ ...structuredClone(node), id: "proof", requirements: { ...emptyDebateMysteryRequirementsV2(), discoveryIds: [`hotspot:${input.key}`] } });
    if (protect === "gate") input.graph.presentationGates = [{ id: "gate", requiredRecord: { kind: "evidence", id: "1" }, requiredSuspectSeatId: "suspect", correctPresentNodeId: "present", requiredForProgression: true, unlocks: [{ kind: "hotspot", roomId: "room", hotspotId: input.state.rooms[0].hotspots[0].id }] }];
    if (protect === "branch") node.nextNodeIds = ["other"];
    if (protect === "prerequisite") node.requirements.discoveryIds = ["access:door"];
    if (protect === "terminal") node.terminalOutcome = null;
    const result = projectMysteryMeaningfulInvestigationTargetsV2(input);
    assert.equal(result, input.state, protect);
    assert.equal(JSON.stringify(result).includes("protectedInvestigationHotspotKeys"), false);
  }
});
