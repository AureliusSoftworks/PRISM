import {
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM,
  type MansionDynamicLightV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
  type MansionPlacementAnchorV2,
  type MansionPlacementRelationV2,
} from "@localai/shared";

export const BLACKWOOD_MANSION_PAYLOAD_SHA256 =
  "07fd4f50b2ed90beca78c28cf56d010ad9daf7efb3db28d5c1ae389b9c866dda";
export const BRIARWATCH_MANSION_PAYLOAD_SHA256 =
  "7c742c99d949775aea6a6b936f8625f817c4e3afe755653897adf0575523dfdd";

type AnchorSpec = readonly [
  relation: MansionPlacementRelationV2,
  name: string,
  x: number,
  y: number,
];
type FireSpec = readonly [
  kind: "fire", slug: string, x: number, y: number, radius: number, intensity: number,
];
type OmniSpec = readonly [
  kind: "omni", slug: string, x: number, y: number, radius: number, intensity: number,
];
type DirectionalSpec = readonly [
  kind: "directional", slug: string, x: number, y: number,
  width: number, height: number, rotation: number, intensity: number,
];
type LightSpec = FireSpec | OmniSpec | DirectionalSpec;

interface CuratedRoomDecorationV1 {
  anchors: readonly AnchorSpec[];
  lights: readonly LightSpec[];
}

const BLACKWOOD_ROOM_DECORATION: Readonly<Record<string, CuratedRoomDecorationV1>> = {
  "1:foyer:Foyer": {
    anchors: [
      ["on", "entry console", .18, .55], ["near", "entry door", .39, .38],
      ["on", "stair landing", .56, .39], ["on", "center console", .76, .55],
      ["on", "entry bench", .91, .67], ["on", "foyer rug", .53, .80],
    ],
    lights: [
      ["directional", "door-moon", .48, .40, .34, .40, 0, .28],
      ["fire", "left-sconce", .19, .29, .08, .40],
      ["fire", "center-lamp", .75, .47, .09, .34],
      ["fire", "right-sconce", .93, .17, .08, .42],
    ],
  },
  "1:ballroom:Ballroom": {
    anchors: [
      ["under", "chandelier", .55, .62], ["on", "round table", .78, .66],
      ["on", "left console", .28, .53], ["beside", "club chair", .58, .70],
      ["near", "center window", .55, .43], ["on", "dance floor", .46, .80],
    ],
    lights: [
      ["fire", "chandelier", .55, .12, .18, .46],
      ["fire", "left-wall", .11, .34, .08, .34],
      ["fire", "right-wall", .91, .34, .08, .34],
      ["fire", "table-candles", .78, .57, .10, .38],
      ["directional", "window-moon", .55, .45, .34, .42, 90, .22],
    ],
  },
  "1:cellar:Basement": {
    anchors: [
      ["in", "fireplace", .31, .53], ["on", "round game table", .68, .58],
      ["beside", "green sofa", .73, .70], ["beside", "leather chair", .45, .71],
      ["near", "staircase", .37, .40], ["on", "foreground table", .86, .85],
    ],
    lights: [
      ["fire", "hearth", .31, .56, .15, .48],
      ["fire", "left-sconce", .10, .25, .07, .34],
      ["fire", "center-sconce", .48, .25, .07, .32],
      ["fire", "right-sconce", .79, .24, .07, .34],
      ["fire", "game-table", .68, .52, .09, .38],
      ["fire", "foreground-candles", .87, .83, .10, .40],
    ],
  },
  "1:pool:Pool": {
    anchors: [
      ["in", "pool", .54, .75], ["on", "far bench", .58, .52],
      ["near", "left windows", .25, .31], ["near", "center windows", .55, .30],
      ["on", "right console", .86, .53], ["on", "pool deck", .32, .68],
    ],
    lights: [
      ["fire", "left-sconce", .06, .35, .08, .34],
      ["fire", "rear-sconce", .23, .29, .07, .32],
      ["fire", "right-sconce", .84, .31, .07, .32],
      ["directional", "window-moon", .46, .42, .56, .48, 90, .22],
    ],
  },
  "2:guest-bedroom:Guest Bedroom": {
    anchors: [
      ["on", "bed", .48, .64], ["on", "left dresser", .12, .48],
      ["on", "left nightstand", .35, .50], ["on", "writing desk", .79, .54],
      ["on", "bed trunk", .54, .80], ["beside", "window", .49, .30],
    ],
    lights: [
      ["fire", "left-bedside", .35, .50, .09, .36],
      ["fire", "right-bedside", .62, .49, .09, .36],
      ["fire", "coffee-table", .10, .84, .10, .34],
      ["directional", "window-moon", .49, .38, .30, .42, 90, .24],
    ],
  },
  "2:dining-room:Dining Room": {
    anchors: [
      ["on", "dining table", .52, .69], ["in", "fireplace", .63, .45],
      ["on", "left sideboard", .18, .45], ["on", "right cabinet", .94, .43],
      ["under", "storm painting", .62, .36], ["beside", "window", .14, .39],
    ],
    lights: [
      ["fire", "fireplace", .63, .48, .13, .46],
      ["fire", "left-sconce", .03, .33, .07, .32],
      ["fire", "mantel-left", .53, .31, .07, .32],
      ["fire", "mantel-right", .70, .31, .07, .32],
      ["directional", "window-moon", .19, .41, .30, .44, 0, .22],
    ],
  },
  "2:kitchen:Kitchen": {
    anchors: [
      ["on", "kitchen island", .50, .64], ["in", "cooking hearth", .54, .34],
      ["on", "left worktop", .15, .50], ["on", "right shelving", .78, .37],
      ["near", "garden window", .35, .30], ["on", "pan rack", .55, .30],
    ],
    lights: [
      ["fire", "cooking-hearth", .54, .35, .14, .48],
      ["fire", "left-counter", .11, .49, .08, .34],
      ["fire", "center-counter", .26, .48, .08, .32],
      ["fire", "right-shelf", .84, .42, .08, .34],
      ["directional", "window-moon", .34, .38, .31, .43, 90, .22],
    ],
  },
  "2:library:Library": {
    anchors: [
      ["on", "reading desk", .54, .59], ["in", "fireplace", .13, .65],
      ["on", "left bookcase", .29, .34], ["on", "right bookcase", .75, .34],
      ["beside", "library ladder", .38, .37], ["on", "center rug", .55, .78],
    ],
    lights: [
      ["fire", "fireplace", .13, .67, .14, .50],
      ["fire", "mantel-candles", .14, .35, .09, .36],
      ["fire", "desk-candles", .54, .52, .10, .38],
      ["fire", "right-sconce", .76, .29, .07, .34],
      ["directional", "window-moon", .51, .37, .30, .44, 90, .24],
    ],
  },
  "3:study:Office": {
    anchors: [
      ["on", "writing desk", .34, .67], ["on", "fireplace mantel", .22, .34],
      ["on", "center bookcase", .61, .35], ["on", "window desk", .78, .49],
      ["beside", "club chair", .86, .70], ["on", "side table", .92, .76],
    ],
    lights: [
      ["fire", "mantel-candles", .22, .33, .09, .36],
      ["omni", "desk-lamp", .61, .39, .11, .30],
      ["fire", "desk-candelabra", .66, .59, .10, .38],
      ["directional", "left-window-moon", .17, .34, .33, .48, 0, .22],
      ["directional", "right-window-moon", .72, .36, .34, .48, 180, .22],
    ],
  },
  "3:parlor:Living Room": {
    anchors: [
      ["in", "fireplace", .11, .65], ["on", "green sofa", .51, .68],
      ["on", "coffee table", .53, .82], ["beside", "right armchair", .79, .72],
      ["on", "right side table", .89, .72], ["on", "left bookcase", .28, .35],
    ],
    lights: [
      ["fire", "fireplace", .11, .67, .15, .50],
      ["fire", "mantel-candles", .14, .37, .09, .36],
      ["fire", "window-candles", .60, .51, .09, .36],
      ["fire", "right-sconce", .82, .33, .07, .34],
      ["fire", "foreground-candle", .87, .79, .09, .38],
    ],
  },
  "3:primary-bedroom:Bedroom": {
    anchors: [
      ["on", "bed", .52, .63], ["on", "left nightstand", .24, .49],
      ["on", "right nightstand", .63, .47], ["on", "wardrobe", .70, .37],
      ["on", "bed bench", .69, .72], ["beside", "window", .86, .29],
    ],
    lights: [
      ["fire", "left-bedside", .24, .48, .09, .36],
      ["fire", "right-bedside", .63, .47, .09, .36],
      ["fire", "dresser-candles", .43, .46, .08, .34],
      ["directional", "window-moon", .84, .38, .31, .45, 180, .24],
    ],
  },
  "3:bathroom:Bathroom": {
    anchors: [
      ["on", "left vanity", .11, .55], ["in", "bathtub", .58, .60],
      ["on", "tub side table", .64, .49], ["near", "tall window", .60, .27],
      ["on", "right bench", .86, .57], ["on", "bathroom rug", .50, .84],
    ],
    lights: [
      ["fire", "left-sconces", .08, .22, .10, .38],
      ["fire", "vanity-candles", .08, .52, .08, .34],
      ["fire", "tub-candles", .64, .49, .09, .36],
      ["fire", "right-candles", .86, .48, .09, .36],
      ["directional", "window-moon", .60, .37, .30, .46, 90, .25],
    ],
  },
};

const BUNDLED_LIGHTS: Readonly<Record<string, readonly LightSpec[]>> = {
  foyer: [
    ["directional", "entry-field", .49, .42, .48, .50, 90, .28],
    ["omni", "stair-field", .18, .56, .25, .38],
    ["omni", "console-practical", .80, .59, .20, .34],
  ],
  "dining-room": [
    ["omni", "ceiling-fixture", .54, .18, .25, .38],
    ["omni", "left-cabinet", .08, .37, .15, .28],
    ["omni", "right-cabinet", .92, .38, .15, .28],
  ],
  library: [
    ["directional", "skylight", .50, .32, .34, .48, 90, .25],
    ["omni", "lower-door", .50, .61, .12, .28],
    ["omni", "left-shelves", .08, .44, .13, .25],
    ["omni", "right-shelves", .92, .44, .13, .25],
  ],
  kitchen: [
    ["omni", "under-cabinet", .64, .38, .25, .32],
    ["omni", "left-window", .15, .40, .17, .25],
    ["omni", "island-spill", .55, .64, .19, .24],
  ],
  parlor: [
    ["fire", "fireplace", .61, .58, .16, .46],
    ["omni", "ceiling-cove", .50, .16, .30, .27],
    ["omni", "right-shelves", .91, .41, .14, .26],
  ],
  "primary-bedroom": [
    ["omni", "ceiling-cove", .55, .13, .30, .27],
    ["omni", "bedside", .52, .61, .15, .29],
    ["directional", "left-spot", .23, .31, .22, .38, 90, .22],
  ],
  "guest-bedroom": [
    ["omni", "ceiling-cove", .55, .13, .30, .27],
    ["omni", "bedside", .52, .61, .15, .29],
    ["directional", "left-spot", .23, .31, .22, .38, 90, .22],
  ],
  bathroom: [
    ["directional", "window", .17, .40, .27, .48, 0, .23],
    ["omni", "shower-niche", .42, .40, .12, .27],
    ["omni", "vanity", .78, .58, .20, .30],
  ],
  study: [
    ["omni", "ceiling-cove", .50, .13, .29, .25],
    ["omni", "desk", .48, .63, .17, .29],
    ["omni", "right-cabinet", .87, .43, .15, .26],
  ],
  utility: [
    ["omni", "overhead", .50, .18, .28, .30],
    ["omni", "workbench", .28, .54, .17, .27],
    ["omni", "storage", .82, .43, .15, .24],
  ],
  conservatory: [
    ["directional", "glass-roof", .50, .32, .46, .55, 90, .27],
    ["omni", "potting-counter", .87, .46, .16, .25],
  ],
  "rooftop-lounge": [
    ["omni", "fire-table", .55, .66, .16, .38],
    ["omni", "bar", .25, .45, .17, .27],
    ["directional", "elevator", .55, .42, .20, .32, 90, .22],
  ],
  // No bundled Attic plate exists. The generic Case Forge fallback owns it.
  attic: [],
};

function slug(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 60);
}

function templateAnchorRelation(label: string): MansionPlacementRelationV2 {
  const normalized = label.toLocaleLowerCase();
  if (/cabinet|case|closet|drawer|hamper|locker|niche|pantry|rack|safe|shelf|trunk|wardrobe/u.test(normalized)) return "in";
  if (/bench|counter|desk|floor|island|mantel|rug|sideboard|sill|stage|table|tile|workbench/u.test(normalized)) return "on";
  if (/bed|chair|door|fireplace|planter|sofa|stair|window/u.test(normalized)) return "beside";
  return "near";
}

function templateAnchorSpecs(templateId: string): AnchorSpec[] {
  const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === templateId);
  if (!template) return [];
  return template.regions.slice(0, MANSION_LAYOUT_V2_MAX_ANCHORS_PER_ROOM).map((region) => {
    const x = region.polygon.reduce((sum, point) => sum + point.x, 0) / region.polygon.length / 100;
    const y = region.polygon.reduce((sum, point) => sum + point.y, 0) / region.polygon.length / 100;
    return [templateAnchorRelation(region.label), region.label, Number(x.toFixed(4)), Number(y.toFixed(4))];
  });
}

function roomKey(room: MansionLayoutRoomV2): string {
  return `${room.floor}:${room.templateId}:${room.name}`;
}

function anchorFromSpec(
  room: MansionLayoutRoomV2,
  spec: AnchorSpec,
  payloadSha256: string,
): MansionPlacementAnchorV2 {
  const [relation, name, x, y] = spec;
  return {
    id: `curated-anchor:${payloadSha256.slice(0, 12)}:${slug(roomKey(room))}:${slug(name)}`,
    roomId: room.id,
    name,
    relation,
    point: { x, y },
  };
}

function lightFromSpec(
  room: MansionLayoutRoomV2,
  spec: LightSpec,
  payloadSha256: string,
): MansionDynamicLightV2 {
  const [kind, semanticSlug] = spec;
  const identity = `${payloadSha256.slice(0, 12)}:${slug(roomKey(room))}:${semanticSlug}`;
  const intensity = kind === "directional" ? spec[7] : spec[5];
  const common = {
    id: `curated-light:${identity}`,
    roomId: room.id,
    color: kind === "directional" ? "#78b6e7" : kind === "fire" ? "#ffb56b" : "#f2d6a0",
    intensity,
    animationSeed: `curated:${identity}`,
    cuePermission: { version: 1 as const, mode: "mansion_static" as const, allowedCueIds: [] },
  };
  if (kind === "fire") {
    const [, , x, y, radius] = spec;
    return { ...common, kind, animation: "flicker", geometry: { x, y, radius, rotation: 0 } };
  }
  if (kind === "omni") {
    const [, , x, y, radius] = spec;
    return { ...common, kind, geometry: { x, y, radius } };
  }
  const [, , x, y, width, height, rotation] = spec;
  return { ...common, kind, dust: true, geometry: { x, y, width, height, rotation } };
}

/** Applies image-reviewed overlays for known imported packages to the frozen
 * Case projection. The authenticated portable source is never rewritten. */
export function applyCuratedImportedMansionDecorationV1(
  layout: MansionLayoutV2,
  payloadSha256: string | null | undefined,
): MansionLayoutV2 {
  if (
    payloadSha256 !== BLACKWOOD_MANSION_PAYLOAD_SHA256 &&
    payloadSha256 !== BRIARWATCH_MANSION_PAYLOAD_SHA256
  ) return layout;

  const addedAnchors: MansionPlacementAnchorV2[] = [];
  const addedLights: MansionDynamicLightV2[] = [];
  for (const room of layout.entities) {
    if (room.kind !== "room") continue;
    const reviewed = payloadSha256 === BLACKWOOD_MANSION_PAYLOAD_SHA256
      ? BLACKWOOD_ROOM_DECORATION[roomKey(room)]
      : undefined;
    if (!layout.placementAnchors.some((anchor) => anchor.roomId === room.id)) {
      const anchors = reviewed?.anchors ?? templateAnchorSpecs(room.templateId);
      addedAnchors.push(...anchors.map((spec) => anchorFromSpec(room, spec, payloadSha256)));
    }
    if (!layout.lights.some((light) => light.roomId === room.id)) {
      const lights = reviewed?.lights ?? BUNDLED_LIGHTS[room.templateId] ?? [];
      addedLights.push(...lights.map((spec) => lightFromSpec(room, spec, payloadSha256)));
    }
  }
  if (addedAnchors.length === 0 && addedLights.length === 0) return layout;
  return {
    ...layout,
    placementAnchors: [...layout.placementAnchors, ...addedAnchors],
    lights: [...layout.lights, ...addedLights],
  };
}
