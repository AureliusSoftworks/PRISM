export const PRISM_APPLET_ORDER = [
  "chat",
  "zen",
  "arena",
  "polling",
  "coffee",
  "botcast",
  "feed",
  "games",
  "story",
  "gym",
  "slate",
  "pseudo",
  "surf",
] as const;

export type PrismAppletId = (typeof PRISM_APPLET_ORDER)[number];

export type PrismAppletStatus = "active" | "preview" | "planned";

export interface PrismAppletVersion {
  id: PrismAppletId;
  name: string;
  version: string;
  status: PrismAppletStatus;
}

export const PRISM_APPLETS: Record<PrismAppletId, PrismAppletVersion> = {
  chat: {
    id: "chat",
    name: "Chat",
    version: "1.2",
    status: "active",
  },
  zen: {
    id: "zen",
    name: "Zen",
    version: "1.1",
    status: "active",
  },
  arena: {
    id: "arena",
    name: "Arena",
    version: "0.0",
    status: "planned",
  },
  polling: {
    id: "polling",
    name: "Polling",
    version: "0.0",
    status: "planned",
  },
  coffee: {
    id: "coffee",
    name: "Coffee",
    version: "1.3",
    status: "active",
  },
  botcast: {
    id: "botcast",
    name: "Signal",
    version: "2.0",
    status: "active",
  },
  feed: {
    id: "feed",
    name: "Feed",
    version: "0.0",
    status: "planned",
  },
  games: {
    id: "games",
    name: "Games",
    version: "0.0",
    status: "planned",
  },
  story: {
    id: "story",
    name: "Story",
    version: "0.1",
    status: "preview",
  },
  gym: {
    id: "gym",
    name: "Gym",
    version: "0.0",
    status: "planned",
  },
  slate: {
    id: "slate",
    name: "Slate",
    version: "0.0",
    status: "planned",
  },
  pseudo: {
    id: "pseudo",
    name: "Pseudo",
    version: "0.0",
    status: "planned",
  },
  surf: {
    id: "surf",
    name: "Surf",
    version: "0.0",
    status: "planned",
  },
};

export const PRISM_TOP_LEVEL_SWITCHER_APPLET_IDS = [
  "chat",
  "coffee",
  "botcast",
] as const satisfies readonly PrismAppletId[];

export function prismTopLevelSwitcherApplets(): PrismAppletVersion[] {
  return PRISM_TOP_LEVEL_SWITCHER_APPLET_IDS.map((appletId) => PRISM_APPLETS[appletId]).filter(
    (applet) => applet.status === "active"
  );
}

export function prismPlannedRoadmapApplets(): PrismAppletVersion[] {
  return PRISM_APPLET_ORDER
    .map((appletId) => PRISM_APPLETS[appletId])
    .filter((applet) => applet.status === "planned");
}

export function prismAppletVersionLabel(appletId: PrismAppletId): string {
  return `v${PRISM_APPLETS[appletId].version}`;
}
