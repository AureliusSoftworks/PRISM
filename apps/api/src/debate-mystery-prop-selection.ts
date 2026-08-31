import {
  WHODUNNIT_PROP_ARCHETYPES_V1,
  inferWhodunnitPropArchetypeV1,
  type EvidencePropBindingV1,
  type MansionPropVariantV1,
  type WhodunnitPropArchetypeIdV1,
} from "@localai/shared";

export interface WhodunnitPersonalPropCandidateV1 {
  assetSetId: string;
  imageId: string;
  assetKind: "item" | "debate_exhibit";
  localRelPath: string;
  exactIdentity: string;
  whatItDoes: string;
  primaryArchetype: WhodunnitPropArchetypeIdV1;
  capabilities: Array<{ id: string; description: string }>;
  limitations: string[];
  settingTags: string[];
  genreTags: string[];
  confidence: number;
  contentSha256: string;
  createdAt: string;
}

export interface WhodunnitMansionPropCandidateV1 extends MansionPropVariantV1 {
  contentSha256: string;
}

export interface WhodunnitEvidencePropNeedV1 {
  evidenceId: string;
  title: string;
  object: string;
  observation: string;
  isCanonicalWeapon: boolean;
}

export interface WhodunnitPropSelectionV1 {
  bindingsByEvidenceId: Record<string, EvidencePropBindingV1>;
  privatePersonalSourceByEvidenceId: Record<string, {
    assetSetId: string;
    imageId: string;
    localRelPath: string;
  }>;
}

const CAPABILITY_TERMS_BY_ARCHETYPE: Readonly<
  Record<WhodunnitPropArchetypeIdV1, readonly string[]>
> = {
  key: ["access", "aperture", "door", "gateway", "lock", "open", "portal", "unlock"],
  code: ["access", "authenticate", "authorize", "code", "combination", "credential", "unlock"],
  remote: ["activate", "control", "distance", "open", "remote", "signal", "switch", "trigger"],
  container: ["carry", "conceal", "contain", "hold", "protect", "store", "transport"],
  valuables: ["heirloom", "inheritance", "money", "steal", "theft", "valuable", "wealth"],
  ledger: ["account", "debt", "ledger", "obligation", "ownership", "record", "transaction"],
  receipt: ["document", "exchange", "place", "purchase", "receipt", "time", "transaction"],
  letter: ["disclosure", "letter", "message", "promise", "threat", "written"],
  timepiece: ["clock", "measure", "sequence", "time", "timestamp", "watch"],
  fiber: ["cloth", "cord", "fiber", "strand", "thread", "transfer"],
  fragment: ["broken", "fragment", "match", "piece", "shard", "source"],
  toxin: ["chemical", "contaminate", "poison", "sedate", "toxin", "venom"],
  firearm: ["bullet", "discharge", "fire", "firearm", "projectile", "shoot"],
  blade: ["blade", "cut", "edge", "pierce", "sever", "slash", "stab"],
  blunt_object: ["blow", "blunt", "impact", "strike", "weight"],
  long_implement: ["carry", "hook", "long", "pry", "reach", "rigid", "strike"],
};

const EXTRAORDINARY_GENRE_TERMS = new Set([
  "alien",
  "cyberpunk",
  "fantasy",
  "futuristic",
  "magic",
  "magical",
  "portal",
  "robotic",
  "sci-fi",
  "science fiction",
  "space",
  "superhero",
  "supernatural",
  "time travel",
]);

function normalizedTokens(value: string | readonly string[]): Set<string> {
  const joined = typeof value === "string" ? value : [...value].join(" ");
  const phrases = joined
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)?/gu) ?? [];
  return new Set(phrases);
}

function normalizedPhrase(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}

function overlapCount(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function capabilityCompatible(candidate: WhodunnitPersonalPropCandidateV1): boolean {
  const terms = CAPABILITY_TERMS_BY_ARCHETYPE[candidate.primaryArchetype];
  const claim = normalizedPhrase([
    candidate.whatItDoes,
    ...candidate.capabilities.flatMap((capability) => [capability.id, capability.description]),
  ].join(" "));
  return terms.some((term) => claim.includes(term));
}

function settingCompatible(
  candidate: WhodunnitPersonalPropCandidateV1,
  setting: string,
): boolean {
  const normalizedSetting = normalizedPhrase(setting);
  const explicitGenreTags = candidate.genreTags
    .map(normalizedPhrase)
    .filter(Boolean);
  const extraordinaryTags = explicitGenreTags.filter((tag) =>
    EXTRAORDINARY_GENRE_TERMS.has(tag) ||
    [...EXTRAORDINARY_GENRE_TERMS].some((marker) => tag.includes(marker))
  );
  return extraordinaryTags.length === 0 ||
    extraordinaryTags.some((tag) => normalizedSetting.includes(tag)) ||
    extraordinaryTags.some((tag) =>
      tag === "sci-fi" && /\b(?:sci-fi|science fiction|space|futuristic|cyberpunk)\b/u.test(normalizedSetting)
    );
}

function personalCandidatesForNeed(args: {
  archetypeId: WhodunnitPropArchetypeIdV1;
  setting: string;
  candidates: readonly WhodunnitPersonalPropCandidateV1[];
  usedAssetSetIds: ReadonlySet<string>;
}): WhodunnitPersonalPropCandidateV1[] {
  const settingTokens = normalizedTokens(args.setting);
  return args.candidates
    .filter((candidate) =>
      candidate.primaryArchetype === args.archetypeId &&
      !args.usedAssetSetIds.has(candidate.assetSetId) &&
      candidate.confidence >= 0.6 &&
      capabilityCompatible(candidate) &&
      settingCompatible(candidate, args.setting)
    )
    .sort((left, right) => {
      const leftSettingScore = overlapCount(
        normalizedTokens([...left.settingTags, ...left.genreTags]),
        settingTokens,
      );
      const rightSettingScore = overlapCount(
        normalizedTokens([...right.settingTags, ...right.genreTags]),
        settingTokens,
      );
      return rightSettingScore - leftSettingScore ||
        right.confidence - left.confidence ||
        left.createdAt.localeCompare(right.createdAt) ||
        left.assetSetId.localeCompare(right.assetSetId) ||
        left.imageId.localeCompare(right.imageId);
    });
}

function prismBinding(
  archetypeId: WhodunnitPropArchetypeIdV1,
): EvidencePropBindingV1 {
  const definition = WHODUNNIT_PROP_ARCHETYPES_V1[archetypeId];
  return {
    version: 1,
    archetypeId,
    chosenIdentity: {
      displayName: definition.prismFallback.displayName,
      appearanceDescription: `PRISM's setting-neutral ${definition.label.toLocaleLowerCase()} fallback.`,
    },
    capabilitySnapshot: {
      whatItDoes: definition.purpose,
      capabilities: [...CAPABILITY_TERMS_BY_ARCHETYPE[archetypeId]],
      limitations: [],
    },
    visualSource: "prism",
    contentSha256: definition.prismFallback.contentSha256,
  };
}

export function selectWhodunnitEvidencePropBindingsV1(args: {
  needs: readonly WhodunnitEvidencePropNeedV1[];
  setting: string;
  personalEnabled: boolean;
  personalCandidates: readonly WhodunnitPersonalPropCandidateV1[];
  mansionVariants: readonly WhodunnitMansionPropCandidateV1[];
  maxPersonalSubstitutions?: number;
}): WhodunnitPropSelectionV1 {
  const maxPersonal = Math.max(0, Math.min(2, args.maxPersonalSubstitutions ?? 2));
  const bindingsByEvidenceId: Record<string, EvidencePropBindingV1> = {};
  const privatePersonalSourceByEvidenceId: WhodunnitPropSelectionV1["privatePersonalSourceByEvidenceId"] = {};
  const usedAssetSetIds = new Set<string>();
  const mansionByArchetype = new Map(
    args.mansionVariants.map((variant) => [variant.archetypeId, variant]),
  );

  for (const need of args.needs) {
    const archetypeId = inferWhodunnitPropArchetypeV1(
      `${need.object} ${need.title}`,
      need.isCanonicalWeapon,
    );
    if (!archetypeId) continue;

    if (args.personalEnabled && usedAssetSetIds.size < maxPersonal) {
      const personal = personalCandidatesForNeed({
        archetypeId,
        setting: args.setting,
        candidates: args.personalCandidates,
        usedAssetSetIds,
      })[0];
      if (personal) {
        usedAssetSetIds.add(personal.assetSetId);
        bindingsByEvidenceId[need.evidenceId] = {
          version: 1,
          archetypeId,
          chosenIdentity: {
            displayName: personal.exactIdentity,
            appearanceDescription: personal.exactIdentity,
          },
          capabilitySnapshot: {
            whatItDoes: personal.whatItDoes,
            capabilities: personal.capabilities.map((capability) => capability.description),
            limitations: [...personal.limitations],
          },
          visualSource: "asset_library",
          contentSha256: personal.contentSha256,
        };
        privatePersonalSourceByEvidenceId[need.evidenceId] = {
          assetSetId: personal.assetSetId,
          imageId: personal.imageId,
          localRelPath: personal.localRelPath,
        };
        continue;
      }
    }

    const mansion = mansionByArchetype.get(archetypeId);
    if (mansion) {
      const definition = WHODUNNIT_PROP_ARCHETYPES_V1[archetypeId];
      bindingsByEvidenceId[need.evidenceId] = {
        version: 1,
        archetypeId,
        chosenIdentity: {
          displayName: mansion.displayName,
          appearanceDescription: mansion.appearanceDescription,
        },
        capabilitySnapshot: {
          whatItDoes: definition.purpose,
          capabilities: [...CAPABILITY_TERMS_BY_ARCHETYPE[archetypeId]],
          limitations: [],
        },
        visualSource: "mansion",
        contentSha256: mansion.contentSha256,
      };
      continue;
    }

    bindingsByEvidenceId[need.evidenceId] = prismBinding(archetypeId);
  }

  return { bindingsByEvidenceId, privatePersonalSourceByEvidenceId };
}

function replaceObjectIdentity(
  value: string,
  previousObject: string,
  displayName: string,
): string {
  const escaped = previousObject.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return value.replace(new RegExp(`\\b${escaped}\\b`, "giu"), displayName);
}

function propCapabilitySentence(value: string): string {
  const capability = value.trim().replace(/[.!?]+$/gu, "");
  if (!capability) return "";
  if (/^it\b/iu.test(capability)) return `${capability}.`;
  return `It ${capability[0]!.toLocaleLowerCase()}${capability.slice(1)}.`;
}

/** Applies the frozen identity before any prose-writing context is assembled. */
export function applyWhodunnitPropBindingsToScaffoldV1<
  T extends {
    method: string;
    publicOpening: string;
    weapon: { descriptor: string };
    evidence: Array<{
      id: string;
      adjective: string;
      object: string;
      title: string;
      observation: string;
      keywords: string[];
      isCanonicalWeapon: boolean;
    }>;
  },
>(scaffold: T, bindingsByEvidenceId: Readonly<Record<string, EvidencePropBindingV1>>): T {
  let method = scaffold.method;
  let publicOpening = scaffold.publicOpening;
  let weapon = scaffold.weapon;
  const evidence = scaffold.evidence.map((item) => {
    const binding = bindingsByEvidenceId[item.id];
    if (!binding) return item;
    const displayName = binding.chosenIdentity.displayName.trim();
    if (!displayName) return item;
    method = replaceObjectIdentity(method, item.object, displayName);
    publicOpening = replaceObjectIdentity(publicOpening, item.object, displayName);
    if (item.isCanonicalWeapon) {
      weapon = { ...weapon, descriptor: displayName };
    }
    const rewrittenObservation = replaceObjectIdentity(
      item.observation,
      item.object,
      displayName,
    );
    const capability = propCapabilitySentence(
      binding.capabilitySnapshot.whatItDoes,
    );
    return {
      ...item,
      adjective: "recovered",
      object: displayName,
      title: displayName,
      observation: `${rewrittenObservation} ${capability}`.trim(),
      keywords: Array.from(new Set([
        ...item.keywords,
        ...normalizedTokens(displayName),
        ...normalizedTokens(binding.capabilitySnapshot.whatItDoes),
      ])),
    };
  });
  return { ...scaffold, method, publicOpening, weapon, evidence };
}
