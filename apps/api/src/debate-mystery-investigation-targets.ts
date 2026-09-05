import {
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  debateMysteryRegionHasMeaningfulSubjectV1,
  debateMysteryRoomPresentationRegionsV1,
  type DebateMysteryDialogueGraphV2,
  type DebateWhodunnitFormatStateV2,
} from "@localai/shared";

type InvestigationTargetPrivateMetadata = {
  examineNodeIdByHotspot: Record<string, string>;
  caseKitItemIdByExamineNodeId?: Record<string, string>;
  accusedAlibiSupportDiscoveryIds?: string[];
  protectedInvestigationHotspotKeys?: string[];
};

function knownEmptyObservation(text: string, anchor: string): boolean {
  const subject = anchor.replace(/^the\s+/iu, "");
  const capitalized = subject.charAt(0).toLocaleUpperCase() + subject.slice(1);
  return new Set([
    "…", `The ${subject}. Riveting.`, `${capitalized}. A triumph of decorating.`,
    `Behold: the ${subject}.`, `The ${subject}. Nice, actually.`,
    `I like the ${subject}. That's all.`, `Just the ${subject}. Kind of charming.`,
    `Hmm… Nothing unusual about the ${subject}.`, `Just the ${subject}. Nothing more.`,
    `Nothing over here but the ${subject}.`, `${capitalized}. Ordinary.`,
  ]).has(text.trim());
}

/** Read-only saved-case projection. Only proven empty fallback observations
 * disappear. The sealed graph, prose, discoveries and evidence stay untouched;
 * no outcome, proof flag or hidden fact is sent to the browser. */
export function projectMysteryMeaningfulInvestigationTargetsV2(args: {
  state: DebateWhodunnitFormatStateV2;
  graph: DebateMysteryDialogueGraphV2;
  privateCase: InvestigationTargetPrivateMetadata;
}): DebateWhodunnitFormatStateV2 {
  const rooms = args.state.rooms.map((room) => {
    const fallbackRegions = debateMysteryRoomPresentationRegionsV1({
      templateId: room.templateId ?? "", imageId: room.imageId, usesBundledHotspotGeometry: false,
    });
    const knownRegions = [...fallbackRegions, ...(DEBATE_MYSTERY_ROOM_TEMPLATES.find((template) => template.id === room.templateId)?.regions ?? [])];
    const hotspots = room.hotspots.filter((hotspot) => {
      const region = knownRegions.find((entry) => entry.id === hotspot.id && entry.label === hotspot.label);
      if (!region || debateMysteryRegionHasMeaningfulSubjectV1(region)) return true;
      const key = `${room.id}:${hotspot.id}`;
      if (args.privateCase.protectedInvestigationHotspotKeys?.includes(key)) return true;
      const nodeId = args.privateCase.examineNodeIdByHotspot[key];
      const node = args.graph.nodes.find((entry) => entry.id === nodeId);
      const line = args.graph.lines.find((entry) => entry.id === node?.lineId);
      if (!node || !line || !knownEmptyObservation(line.visibleText, region.physicalAnchor)) return true;
      if (node.kind !== "examination_result" || node.terminalOutcome !== "return_to_room" ||
        node.requirements.discoveryIds.some((id) => id !== "briefing:complete") ||
        node.requirements.admittedRecordIds.length || node.requirements.unlockedTopicIds.length ||
        node.requirements.choices.length || node.nextNodeIds.length || node.recordReferences.length ||
        node.mutations.admitRecordIds.length || node.mutations.unlockTopicIds.length ||
        node.mutations.acquireItemIds?.length || node.mutations.choices.length ||
        args.privateCase.caseKitItemIdByExamineNodeId?.[nodeId]) return true;
      const discoveryId = `hotspot:${key}`;
      if (node.mutations.discoverIds.some((id) => id !== discoveryId)) return true;
      if (args.privateCase.accusedAlibiSupportDiscoveryIds?.includes(discoveryId)) return true;
      // A discovery can be a proof/choice/access dependency even with no record.
      // Keep every reference outside this node, except its ordinary root entry.
      const { nodes, lines: _lines, interactionRootNodeIds: _roots, ...graphMetadata } = args.graph;
      const dependencies = JSON.stringify([nodes.filter((entry) => entry.id !== nodeId), graphMetadata]);
      if ([discoveryId, nodeId, key, hotspot.id].some((id) => dependencies.includes(JSON.stringify(id)))) return true;
      return false;
    });
    return hotspots.length === room.hotspots.length ? room : { ...room, hotspots };
  });
  if (rooms.every((room, index) => room === args.state.rooms[index])) return args.state;
  const incidentRoom = rooms.find((room) => room.id === args.state.crimeSceneRoomId);
  return {
    ...args.state,
    rooms,
    openingSweepComplete: args.state.openingSweepComplete || Boolean(incidentRoom?.hotspots.every((hotspot) => hotspot.examined)),
  };
}
