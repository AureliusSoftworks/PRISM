export const MYSTERY_INCIDENT_PLAN_VERSION_V1 = 1 as const;

export const MYSTERY_SPARK_MOTIF_IDS_V1 = [
  "homicide",
  "grand_theft",
  "fraud",
  "sabotage",
  "espionage",
  "disappearance",
  "blackmail",
  "inheritance",
  "conspiracy",
  "locked_room",
  "masquerade",
  "storm",
] as const;

export type MysterySparkMotifIdV1 =
  typeof MYSTERY_SPARK_MOTIF_IDS_V1[number];
export type MysterySparkMotifRoleV1 =
  | "incident"
  | "motive"
  | "relationship"
  | "device"
  | "atmosphere";
export type MysteryIncidentDifficultyV1 = "casual" | "classic" | "mastermind";
export type MysteryIncidentKindV1 =
  | "homicide"
  | "theft"
  | "fraud"
  | "sabotage"
  | "espionage"
  | "disappearance"
  | "blackmail";
/** Compatibility alias retained for callers that introduced the first
 * compositional slice before primary incidents became charge-agnostic. */
export type MysteryComplicationKindV1 = MysteryIncidentKindV1;
export type MysteryResponsibleRoleV1 = "principal" | "accomplice";
export type MysteryComplicationActorRoleV1 = MysteryResponsibleRoleV1;

export interface MysterySparkMotifV1 {
  id: MysterySparkMotifIdV1;
  label: string;
  role: MysterySparkMotifRoleV1;
}

interface MysterySparkMotifDefinitionV1 extends MysterySparkMotifV1 {
  patterns: readonly RegExp[];
  incidentKind?: MysteryIncidentKindV1;
}

const MYSTERY_SPARK_MOTIFS_V1: readonly MysterySparkMotifDefinitionV1[] = [
  {
    id: "homicide",
    label: "Homicide",
    role: "incident",
    incidentKind: "homicide",
    patterns: [/\b(?:murder|murdered|murderer|killing|killed|killer|homicide|dead body|body is found)\b/iu],
  },
  {
    id: "grand_theft",
    label: "Grand theft",
    role: "incident",
    incidentKind: "theft",
    patterns: [
      /\b(?:grand theft|theft|stolen|steal|steals|robbery|robbed|heist|diamonds?|jewels?|heirloom|artifact|valuable painting)\b/iu,
    ],
  },
  {
    id: "fraud",
    label: "Fraud",
    role: "incident",
    incidentKind: "fraud",
    patterns: [/\b(?:fraud|forgery|forged|embezzl\w*|counterfeit|scam|false accounting|fake ledger)\b/iu],
  },
  {
    id: "sabotage",
    label: "Sabotage",
    role: "incident",
    incidentKind: "sabotage",
    patterns: [/\b(?:sabotage\w*|tamper\w*|disabled? (?:the )?(?:alarm|camera|lock|machine)|cut (?:the )?(?:power|brakes|wire))\b/iu],
  },
  {
    id: "espionage",
    label: "Espionage",
    role: "incident",
    incidentKind: "espionage",
    patterns: [/\b(?:espionage|spy|spies|spying|classified|secret documents?|stolen correspondence|copied correspondence)\b/iu],
  },
  {
    id: "disappearance",
    label: "Disappearance",
    role: "incident",
    incidentKind: "disappearance",
    patterns: [/\b(?:missing person|disappear\w*|vanish\w*|kidnap\w*|abduct\w*)\b/iu],
  },
  {
    id: "blackmail",
    label: "Blackmail",
    role: "incident",
    incidentKind: "blackmail",
    patterns: [/\b(?:blackmail\w*|extort\w*|ransom|coerc\w*|threatening letter)\b/iu],
  },
  {
    id: "inheritance",
    label: "Inheritance",
    role: "motive",
    patterns: [/\b(?:inheritance|inherit|heir|heiress|beneficiary|last will|estate|family fortune)\b/iu],
  },
  {
    id: "conspiracy",
    label: "Conspiracy",
    role: "relationship",
    patterns: [/\b(?:accomplice|co-conspirator|conspiracy|inside job|working together|partner in crime)\b/iu],
  },
  {
    id: "locked_room",
    label: "Impossible crime",
    role: "device",
    patterns: [/\b(?:locked[- ]room|impossible crime|sealed room|no way in|no way out|no footprints)\b/iu],
  },
  {
    id: "masquerade",
    label: "Masquerade",
    role: "atmosphere",
    patterns: [/\b(?:masquerade|masked ball|costume party|disguise|false identity)\b/iu],
  },
  {
    id: "storm",
    label: "Stormbound",
    role: "atmosphere",
    patterns: [/\b(?:storm|blizzard|hurricane|flood|snowed in|power outage|thunder)\b/iu],
  },
] as const;

export interface MysterySparkInterpretationV1 {
  version: typeof MYSTERY_INCIDENT_PLAN_VERSION_V1;
  motifs: MysterySparkMotifV1[];
}

export interface MysteryIncidentComplicationV1 {
  id: string;
  kind: MysteryComplicationKindV1;
  title: string;
  subject: string;
  sealedTruth: string;
  actorRole: MysteryComplicationActorRoleV1;
  relationship: "same_scheme" | "cover_up" | "opportunistic";
  proofRequirements: ["opportunity", "material_trace"];
}

export interface MysteryPrimaryIncidentV1 {
  id: string;
  kind: MysteryIncidentKindV1;
  title: string;
  subject: string;
  sealedTruth: string;
  method: string;
  responsibleRoles: MysteryResponsibleRoleV1[];
  proofRequirements: ["opportunity", "material_trace"];
}

/** Spoiler-safe charge shown in setup, Theory Board, and Court. */
export interface MysteryPublicChargeV1 {
  version: typeof MYSTERY_INCIDENT_PLAN_VERSION_V1;
  incidentId: string;
  kind: MysteryIncidentKindV1;
  title: string;
  subject: string;
  accusationPrompt: string;
}

export interface MysteryIncidentPlanV1 {
  version: typeof MYSTERY_INCIDENT_PLAN_VERSION_V1;
  source: "spark" | "seeded_surprise";
  sourceHash: string;
  primary: MysteryPrimaryIncidentV1;
  complications: MysteryIncidentComplicationV1[];
}

export interface MysteryBoundIncidentComplicationV1
  extends MysteryIncidentComplicationV1 {
  actorSeatId: string;
}

export interface MysteryBoundPrimaryIncidentV1 extends MysteryPrimaryIncidentV1 {
  responsibleSeatIds: string[];
}

export interface MysteryBoundIncidentPlanV1
  extends Omit<MysteryIncidentPlanV1, "primary" | "complications"> {
  primary: MysteryBoundPrimaryIncidentV1;
  complications: MysteryBoundIncidentComplicationV1[];
}

function normalizedSpark(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, 2_000);
}

function stableHash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function stableHashHex(value: string): string {
  return stableHash32(value).toString(16).padStart(8, "0");
}

export function inferMysterySparkMotifsV1(
  sparkInput: string,
): MysterySparkInterpretationV1 {
  const spark = normalizedSpark(sparkInput);
  if (!spark) return { version: MYSTERY_INCIDENT_PLAN_VERSION_V1, motifs: [] };
  const matches = MYSTERY_SPARK_MOTIFS_V1.flatMap((definition, catalogIndex) => {
    const indexes = definition.patterns
      .map((pattern) => pattern.exec(spark)?.index ?? -1)
      .filter((index) => index >= 0);
    if (!indexes.length) return [];
    return [{
      definition,
      firstIndex: Math.min(...indexes),
      catalogIndex,
    }];
  }).sort((left, right) =>
    left.firstIndex - right.firstIndex || left.catalogIndex - right.catalogIndex);
  return {
    version: MYSTERY_INCIDENT_PLAN_VERSION_V1,
    motifs: matches.map(({ definition }) => ({
      id: definition.id,
      label: definition.label,
      role: definition.role,
    })),
  };
}

export const MYSTERY_INCIDENT_KINDS_V1: readonly MysteryIncidentKindV1[] = [
  "homicide",
  "theft",
  "fraud",
  "sabotage",
  "espionage",
  "disappearance",
  "blackmail",
] as const;

function seededKinds(seed: string): MysteryIncidentKindV1[] {
  return [...MYSTERY_INCIDENT_KINDS_V1].sort((left, right) => {
    const delta = stableHash32(`${seed}:${left}`) - stableHash32(`${seed}:${right}`);
    return delta || left.localeCompare(right);
  });
}

function incidentSubject(kind: MysteryIncidentKindV1, spark: string): string {
  if (kind === "homicide") return "the victim's death";
  if (kind === "theft") {
    if (/\bdiamonds?\b/iu.test(spark)) return "the diamonds";
    if (/\bjewels?\b/iu.test(spark)) return "the jewels";
    if (/\bpainting\b/iu.test(spark)) return "a valuable painting";
    if (/\bartifact\b/iu.test(spark)) return "a rare artifact";
    if (/\bheirloom\b/iu.test(spark)) return "a family heirloom";
    return "a valuable heirloom";
  }
  if (kind === "fraud") return /\bwill\b/iu.test(spark) ? "a forged will" : "a falsified ledger";
  if (kind === "sabotage") return "a deliberately disabled security mechanism";
  if (kind === "espionage") return "copied private correspondence";
  if (kind === "disappearance") return "an earlier unexplained disappearance";
  return "a coercive private demand";
}

function incidentTruth(kind: MysteryIncidentKindV1, subject: string): string {
  if (kind === "homicide") return "The victim's death was caused deliberately during the incident window.";
  if (kind === "theft") return `${subject} was removed during the crime window as part of the same scheme.`;
  if (kind === "fraud") return `${subject} was created to redirect ownership or blame after the crime.`;
  if (kind === "sabotage") return `${subject} helped create or conceal the crime window.`;
  if (kind === "espionage") return `${subject} was taken and concealed during the crime window.`;
  if (kind === "disappearance") return `${subject} was used to distort the case timeline.`;
  return `${subject} tied another participant to the crime window.`;
}

function incidentTitle(kind: MysteryIncidentKindV1): string {
  if (kind === "homicide") return "Homicide";
  if (kind === "theft") return "Grand theft";
  if (kind === "fraud") return "Fraud";
  if (kind === "sabotage") return "Sabotage";
  if (kind === "espionage") return "Espionage";
  if (kind === "disappearance") return "Disappearance";
  return "Blackmail";
}

function incidentMethod(kind: MysteryIncidentKindV1, subject: string): string {
  if (kind === "homicide") return "A deliberate act was concealed inside the mansion's incident timeline.";
  if (kind === "theft") return `${subject} was removed through controlled access during the incident window.`;
  if (kind === "fraud") return `${subject} was substituted for the authentic record and used to redirect ownership or blame.`;
  if (kind === "sabotage") return `${subject} was disabled or altered to create the decisive opportunity.`;
  if (kind === "espionage") return `${subject} was copied, removed, and concealed through unauthorized access.`;
  if (kind === "disappearance") return `${subject} was moved or concealed while the timeline was deliberately falsified.`;
  return `${subject} was delivered and enforced through concealed leverage during the incident window.`;
}

function primaryAccusationPrompt(kind: MysteryIncidentKindV1, subject: string): string {
  if (kind === "homicide") return "Who is responsible for the victim's death?";
  if (kind === "theft") return `Who is responsible for taking ${subject}?`;
  if (kind === "fraud") return `Who is responsible for creating or using ${subject}?`;
  if (kind === "sabotage") return `Who is responsible for ${subject}?`;
  if (kind === "espionage") return `Who is responsible for taking ${subject}?`;
  if (kind === "disappearance") return `Who is responsible for ${subject}?`;
  return `Who is responsible for ${subject}?`;
}

export function mysteryPublicChargeV1(
  plan: Pick<MysteryIncidentPlanV1, "primary">,
): MysteryPublicChargeV1 {
  return {
    version: MYSTERY_INCIDENT_PLAN_VERSION_V1,
    incidentId: plan.primary.id,
    kind: plan.primary.kind,
    title: plan.primary.title,
    subject: plan.primary.subject,
    accusationPrompt: primaryAccusationPrompt(plan.primary.kind, plan.primary.subject),
  };
}

export function composeMysteryIncidentPlanV1(args: {
  spark: string;
  difficulty: MysteryIncidentDifficultyV1;
  nonce: string;
}): MysteryIncidentPlanV1 {
  const spark = normalizedSpark(args.spark);
  const interpretation = inferMysterySparkMotifsV1(spark);
  const explicitKinds = interpretation.motifs.flatMap((motif) => {
    const definition = MYSTERY_SPARK_MOTIFS_V1.find((entry) => entry.id === motif.id);
    return definition?.incidentKind ? [definition.incidentKind] : [];
  });
  const uniqueExplicitKinds = [...new Set(explicitKinds)];
  const seed = `${spark || "surprise"}:${args.difficulty}:${args.nonce.trim().slice(0, 200)}`;
  const complicationLimit = args.difficulty === "casual" ? 0 : args.difficulty === "classic" ? 1 : 2;
  const primaryKind = uniqueExplicitKinds[0] ?? seededKinds(`${seed}:primary`)[0]!;
  const explicitComplicationKinds = uniqueExplicitKinds.slice(1);
  // A surprise complication never escalates a non-homicide case into a death.
  // Homicide remains available as a secondary only when the player explicitly
  // put it in the Spark.
  const seededComplicationKinds = seededKinds(`${seed}:complications`).filter(
    (kind) => kind !== primaryKind && kind !== "homicide" &&
      !explicitComplicationKinds.includes(kind),
  );
  const kinds = [
    ...explicitComplicationKinds,
    ...seededComplicationKinds,
  ].slice(0, complicationLimit);
  const conspiracyRequested = interpretation.motifs.some((motif) => motif.id === "conspiracy");
  const primaryResponsibleRoles: MysteryResponsibleRoleV1[] =
    conspiracyRequested && uniqueExplicitKinds.length <= 1
      ? ["principal", "accomplice"]
      : ["principal"];
  const primarySubject = incidentSubject(primaryKind, spark);
  const complications = kinds.map((kind, index): MysteryIncidentComplicationV1 => {
    const actorRole: MysteryComplicationActorRoleV1 =
      index === 0 && primaryResponsibleRoles.length === 1 && (conspiracyRequested || (
        args.difficulty === "mastermind" && stableHash32(`${seed}:accomplice`) % 3 === 0
      ))
        ? "accomplice"
        : "principal";
    const subject = incidentSubject(kind, spark);
    return {
      id: `complication-${index + 1}-${kind}`,
      kind,
      title: incidentTitle(kind),
      subject,
      sealedTruth: incidentTruth(kind, subject),
      actorRole,
      relationship: actorRole === "accomplice"
        ? "same_scheme"
        : index === 0
          ? "cover_up"
          : "opportunistic",
      proofRequirements: ["opportunity", "material_trace"],
    };
  });
  return {
    version: MYSTERY_INCIDENT_PLAN_VERSION_V1,
    source: spark ? "spark" : "seeded_surprise",
    sourceHash: stableHashHex(seed),
    primary: {
      id: `primary-${primaryKind}`,
      kind: primaryKind,
      title: incidentTitle(primaryKind),
      subject: primarySubject,
      sealedTruth: incidentTruth(primaryKind, primarySubject),
      method: incidentMethod(primaryKind, primarySubject),
      responsibleRoles: primaryResponsibleRoles,
      proofRequirements: ["opportunity", "material_trace"],
    },
    complications,
  };
}

export function mysteryIncidentPlanRequiresAccompliceV1(
  plan: MysteryIncidentPlanV1,
): boolean {
  return plan.primary.responsibleRoles.includes("accomplice") ||
    plan.complications.some((complication) => complication.actorRole === "accomplice");
}

export function bindMysteryIncidentPlanV1(args: {
  plan: MysteryIncidentPlanV1;
  principalSeatId: string;
  accompliceSeatId: string | null;
}): MysteryBoundIncidentPlanV1 {
  if (mysteryIncidentPlanRequiresAccompliceV1(args.plan) && !args.accompliceSeatId) {
    throw new Error("The frozen incident plan requires an accomplice seat.");
  }
  return {
    ...args.plan,
    primary: {
      ...args.plan.primary,
      responsibleSeatIds: args.plan.primary.responsibleRoles.map((role) =>
        role === "accomplice" ? args.accompliceSeatId! : args.principalSeatId),
    },
    complications: args.plan.complications.map((complication) => ({
      ...complication,
      actorSeatId: complication.actorRole === "accomplice"
        ? args.accompliceSeatId!
        : args.principalSeatId,
    })),
  };
}

export function validateMysteryIncidentPlanV1(args: {
  plan: MysteryIncidentPlanV1;
  difficulty: MysteryIncidentDifficultyV1;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const limit = args.difficulty === "casual" ? 0 : args.difficulty === "classic" ? 1 : 2;
  if (args.plan.version !== MYSTERY_INCIDENT_PLAN_VERSION_V1) errors.push("Unsupported incident plan version.");
  if (!MYSTERY_INCIDENT_KINDS_V1.includes(args.plan.primary.kind)) errors.push("The primary incident is unsupported.");
  if (!args.plan.primary.id || !args.plan.primary.sealedTruth.trim()) errors.push("The primary incident is incomplete.");
  if (args.plan.primary.proofRequirements.join(":") !== "opportunity:material_trace") {
    errors.push("The primary incident does not have the required two-source proof contract.");
  }
  if (!args.plan.primary.responsibleRoles.length ||
    args.plan.primary.responsibleRoles.some((role) => role !== "principal" && role !== "accomplice")) {
    errors.push("The primary incident has an invalid responsibility contract.");
  }
  if (args.plan.complications.length > limit) errors.push(`${args.difficulty} exceeds its complication limit.`);
  if (args.plan.complications.some((entry) => entry.kind === args.plan.primary.kind)) {
    errors.push("The primary incident cannot repeat as a complication.");
  }
  if (new Set(args.plan.complications.map((entry) => entry.kind)).size !== args.plan.complications.length) {
    errors.push("Incident complications must be unique.");
  }
  for (const complication of args.plan.complications) {
    if (!MYSTERY_INCIDENT_KINDS_V1.includes(complication.kind)) errors.push(`Unsupported complication ${complication.kind}.`);
    if (!complication.sealedTruth.trim()) errors.push(`${complication.id} has no sealed truth.`);
    if (complication.proofRequirements.join(":") !== "opportunity:material_trace") {
      errors.push(`${complication.id} does not have the required two-source proof contract.`);
    }
  }
  return { valid: errors.length === 0, errors };
}
