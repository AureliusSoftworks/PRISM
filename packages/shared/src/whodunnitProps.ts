export const WHODUNNIT_PROP_REGISTRY_VERSION_V1 = 1 as const;

/** Stable functional identities used by Case Forge, mansion theme packs, and replays. */
export const WHODUNNIT_PROP_ARCHETYPE_IDS_V1 = [
  "key",
  "code",
  "remote",
  "container",
  "valuables",
  "ledger",
  "receipt",
  "letter",
  "timepiece",
  "fiber",
  "fragment",
  "toxin",
  "firearm",
  "blade",
  "blunt_object",
  "long_implement",
] as const;

export type WhodunnitPropArchetypeIdV1 =
  typeof WHODUNNIT_PROP_ARCHETYPE_IDS_V1[number];

export interface WhodunnitPropArchetypeDefinitionV1 {
  id: WhodunnitPropArchetypeIdV1;
  label: string;
  purpose: string;
  prismFallback: {
    assetKey: string;
    publicPath: string;
    displayName: string;
    contentSha256: string;
  };
}

const BUNDLED_PROP_ROOT_V1 = "/debate/mystery/evidence";

function bundledPropPathV1(assetKey: string): string {
  return `${BUNDLED_PROP_ROOT_V1}/${assetKey}.webp`;
}

/**
 * Exactly one ordinary, offline PRISM fallback per functional archetype. These
 * identities are intentionally setting-neutral; mansion packs and compatible
 * personal objects may replace their presentation without changing function.
 */
export const WHODUNNIT_PROP_ARCHETYPES_V1:
Readonly<Record<WhodunnitPropArchetypeIdV1, WhodunnitPropArchetypeDefinitionV1>> = {
  key: {
    id: "key",
    label: "Key",
    purpose: "Opens or grants access to a matching lock, passage, or protected space.",
    prismFallback: {
      assetKey: "silver-key",
      publicPath: bundledPropPathV1("silver-key"),
      displayName: "Silver Key",
      contentSha256: "eb63050c2b1488892cbf76ec584457277c3ec8b20f3d3e1052f20481fd35d58e",
    },
  },
  code: {
    id: "code",
    label: "Code",
    purpose: "Provides a symbolic or numeric credential for a protected system or container.",
    prismFallback: {
      assetKey: "safe-code",
      publicPath: bundledPropPathV1("safe-code"),
      displayName: "Written Safe Code",
      contentSha256: "b3940df634d066acd3ed94be7759c1370028589b71e1e97db20aff9b86ceeded",
    },
  },
  remote: {
    id: "remote",
    label: "Remote",
    purpose: "Activates a compatible mechanism from a distance.",
    prismFallback: {
      assetKey: "garage-remote",
      publicPath: bundledPropPathV1("garage-remote"),
      displayName: "Garage Remote",
      contentSha256: "9597a3fc46988df8db8fe43ecaaf2137638447d401d47b5f07dce35ad3124cd8",
    },
  },
  container: {
    id: "container",
    label: "Container",
    purpose: "Conceals, protects, or transports another object.",
    prismFallback: {
      assetKey: "locked-jewelry-box",
      publicPath: bundledPropPathV1("locked-jewelry-box"),
      displayName: "Locked Jewelry Box",
      contentSha256: "0f305a6eab87d139b6f440ded27ca294d32551f7fbeb44e91401263cf68bd284",
    },
  },
  valuables: {
    id: "valuables",
    label: "Valuables",
    purpose: "Represents wealth, inheritance, leverage, or a motive for theft.",
    prismFallback: {
      assetKey: "opened-jewelry-box-heirlooms",
      publicPath: bundledPropPathV1("opened-jewelry-box-heirlooms"),
      displayName: "Heirloom Jewels",
      contentSha256: "f79db989a784e5ed5e1045d38639bb5e5d653429655a1827fa506e22b81af829",
    },
  },
  ledger: {
    id: "ledger",
    label: "Ledger",
    purpose: "Records transactions, obligations, ownership, or concealed activity.",
    prismFallback: {
      assetKey: "private-ledger",
      publicPath: bundledPropPathV1("private-ledger"),
      displayName: "Private Ledger",
      contentSha256: "61865b65debaaf51eb2484bdbfc655721246302e4009501211c9dc4f9f7e01c2",
    },
  },
  receipt: {
    id: "receipt",
    label: "Receipt",
    purpose: "Documents a purchase, time, place, or exchange.",
    prismFallback: {
      assetKey: "creased-receipt",
      publicPath: bundledPropPathV1("creased-receipt"),
      displayName: "Creased Receipt",
      contentSha256: "46d830329247bb7520064d8605a92c3010c7afe614649c326761944342f1149e",
    },
  },
  letter: {
    id: "letter",
    label: "Letter",
    purpose: "Carries a private written message, promise, threat, or disclosure.",
    prismFallback: {
      assetKey: "scorched-letter",
      publicPath: bundledPropPathV1("scorched-letter"),
      displayName: "Scorched Letter",
      contentSha256: "5778cac5bf5a4b04b38046e0937b02df6e67247b3318f20ceb9d9b324f16775d",
    },
  },
  timepiece: {
    id: "timepiece",
    label: "Timepiece",
    purpose: "Measures or preserves evidence about time and sequence.",
    prismFallback: {
      assetKey: "stopped-pocket-watch",
      publicPath: bundledPropPathV1("stopped-pocket-watch"),
      displayName: "Stopped Pocket Watch",
      contentSha256: "3d5ae6caa9c844f69e080ece16639b6adea095c4b1f0eaaa4148351b6d4c5389",
    },
  },
  fiber: {
    id: "fiber",
    label: "Fiber",
    purpose: "Carries transferable material evidence from clothing, upholstery, or cordage.",
    prismFallback: {
      assetKey: "frayed-thread",
      publicPath: bundledPropPathV1("frayed-thread"),
      displayName: "Frayed Thread",
      contentSha256: "7c5db73b78eb7e54c2d12f413f2cd3962572f07f96737f45da07bcc25e1ab8c7",
    },
  },
  fragment: {
    id: "fragment",
    label: "Fragment",
    purpose: "Provides a broken piece that can be matched to a source object or location.",
    prismFallback: {
      assetKey: "stained-glass",
      publicPath: bundledPropPathV1("stained-glass"),
      displayName: "Stained Glass Fragment",
      contentSha256: "8c80c85be51a8d268b78d916471774ce9c48e4adcc8dd203fa341b85a57f03f3",
    },
  },
  toxin: {
    id: "toxin",
    label: "Toxin",
    purpose: "Poisons, contaminates, sedates, or chemically alters a target.",
    prismFallback: {
      assetKey: "unknown-poison",
      publicPath: bundledPropPathV1("unknown-poison"),
      displayName: "Unknown Poison",
      contentSha256: "9fc79704680a3f6e9fd145e7b2437e3f297fe97608c92c53948784bb255f03f6",
    },
  },
  firearm: {
    id: "firearm",
    label: "Firearm",
    purpose: "Discharges a projectile through an explosive or comparable firing mechanism.",
    prismFallback: {
      assetKey: "revolver",
      publicPath: bundledPropPathV1("revolver"),
      displayName: "Revolver",
      contentSha256: "764e21769b5004f6ded3a27cc71eb705d4099dc3af9fd785b5ceeede99ba9028",
    },
  },
  blade: {
    id: "blade",
    label: "Blade",
    purpose: "Cuts, pierces, or severs with a sharpened edge or point.",
    prismFallback: {
      assetKey: "hunting-knife",
      publicPath: bundledPropPathV1("hunting-knife"),
      displayName: "Hunting Knife",
      contentSha256: "e7acf066d558d28c260e7f8a8ee561894a217db1d2571caeddc3676e16e0bc51",
    },
  },
  blunt_object: {
    id: "blunt_object",
    label: "Blunt Object",
    purpose: "Strikes through concentrated weight or impact without a cutting edge.",
    prismFallback: {
      assetKey: "marble-paperweight",
      publicPath: bundledPropPathV1("marble-paperweight"),
      displayName: "Marble Paperweight",
      contentSha256: "f4cb5ba0bd2555673c4f4d9281b9a66c74fe531ee86e9cedc9815835030af2fe",
    },
  },
  long_implement: {
    id: "long_implement",
    label: "Long Implement",
    purpose: "Reaches, pries, hooks, carries, or strikes through an elongated rigid form.",
    prismFallback: {
      assetKey: "fireplace-poker",
      publicPath: bundledPropPathV1("fireplace-poker"),
      displayName: "Fireplace Poker",
      contentSha256: "e66169c4c79674606a448b55a9e717328bde0570e69cd5f9858df52b135ce180",
    },
  },
};

/** Emergency presentation used only when no functional identity can be recovered. */
export const WHODUNNIT_NEUTRAL_EVIDENCE_FALLBACK_V1 = {
  assetKey: "unidentified-evidence",
  publicPath: bundledPropPathV1("unidentified-evidence"),
  displayName: "Unidentified Evidence",
} as const;

/**
 * Existing non-primary rasters remain addressable for frozen legacy cases.
 * They are never counted as additional registry archetypes.
 */
export const WHODUNNIT_LEGACY_EXTRA_PROP_FALLBACKS_V1 = {
  "brass-letter-opener": "blade",
  "ceremonial-dagger": "blade",
  "concealed-safe-closed": "container",
  "concealed-safe-open": "container",
  "delicate-gold-key": "key",
  "heavy-decanter": "blunt_object",
  "lead-pipe": "long_implement",
} as const satisfies Readonly<Record<string, WhodunnitPropArchetypeIdV1>>;

export function isWhodunnitPropArchetypeIdV1(
  value: unknown,
): value is WhodunnitPropArchetypeIdV1 {
  return typeof value === "string" &&
    (WHODUNNIT_PROP_ARCHETYPE_IDS_V1 as readonly string[]).includes(value);
}

function normalizedLegacyPropTextV1(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[’']/gu, "")
    .replace(/[^a-z0-9]+/gu, " ")
    .trim();
}

/**
 * Compatibility bridge for the finite evidence vocabulary shipped before
 * capability cards. New personal assets must use their analyzed capability
 * card instead of this label mapper.
 */
export function inferWhodunnitPropArchetypeV1(
  objectOrTitle: string,
  isCanonicalWeapon = false,
): WhodunnitPropArchetypeIdV1 | null {
  const value = normalizedLegacyPropTextV1(objectOrTitle);
  if (!value) return null;

  const includesAny = (...needles: string[]): boolean =>
    needles.some((needle) => value.includes(needle));

  if (includesAny("portal gun", "portal device", "portal generator")) return "key";
  if (includesAny("letter opener", "lightsaber", "light saber", "claymore")) return "blade";
  if (includesAny("jewelry box", "jewellery box", "lockbox", "strongbox")) return "container";
  if (includesAny("pocket watch", "timepiece", "wristwatch", "clock")) return "timepiece";
  if (includesAny("safe code", "passcode", "keycode", "combination")) return "code";
  if (includesAny("garage remote", "remote control", "remote")) return "remote";
  if (includesAny("poison", "toxin", "venom")) return "toxin";
  if (includesAny("revolver", "firearm", "pistol", "rifle", "shotgun")) return "firearm";
  if (includesAny("knife", "dagger", "sword", "blade")) return "blade";
  if (includesAny("fireplace poker", "lead pipe", "crowbar", "walking stick", "cane")) {
    return "long_implement";
  }
  if (includesAny("paperweight", "decanter", "blunt object", "hammer")) return "blunt_object";
  if (includesAny("receipt", "invoice")) return "receipt";
  if (includesAny("silver key", "gold key", "door key", "key")) return "key";
  if (includesAny("thread", "fiber", "fibre", "strand", "cloth", "fabric")) return "fiber";
  if (includesAny("glass", "shard", "fragment", "splinter")) return "fragment";
  if (includesAny("ledger", "account book")) return "ledger";
  if (includesAny("jewels", "jewelry", "jewellery", "gems", "gemstones", "heirlooms")) {
    return "valuables";
  }
  if (includesAny("letter", "correspondence", "written note")) return "letter";
  if (includesAny("container", "locked box", "safe")) return "container";

  // The flag is retained so migration callers can state their intent without
  // forcing an unknown weapon into the wrong functional family.
  void isCanonicalWeapon;
  return null;
}

export interface MansionPropVariantV1 {
  archetypeId: WhodunnitPropArchetypeIdV1;
  displayName: string;
  appearanceDescription: string;
  packageAssetId: string;
}

/** Portable mansion packs are all-or-nothing; partial generation is local state. */
export interface MansionPropThemeV1 {
  version: 1;
  registryVersion: typeof WHODUNNIT_PROP_REGISTRY_VERSION_V1;
  variants: MansionPropVariantV1[];
}

export type MansionPropVariantGenerationStatusV1 = "pending" | "ready" | "failed";

export interface MansionPropVariantProgressV1 {
  archetypeId: WhodunnitPropArchetypeIdV1;
  status: MansionPropVariantGenerationStatusV1;
  attemptCount: number;
  failureCode: string | null;
}

/** Mutable authoring progress; unlike a complete propTheme, this is never frozen into a case. */
export interface MansionPropThemeProgressV1 {
  version: 1;
  registryVersion: typeof WHODUNNIT_PROP_REGISTRY_VERSION_V1;
  totalCount: 16;
  readyCount: number;
  pendingCount: number;
  failedCount: number;
  complete: boolean;
  variants: MansionPropVariantProgressV1[];
}

export type EvidencePropVisualSourceV1 = "asset_library" | "mansion" | "prism";

/** Sanitized, immutable evidence identity frozen before case prose is authored. */
export interface EvidencePropBindingV1 {
  version: 1;
  archetypeId: WhodunnitPropArchetypeIdV1;
  chosenIdentity: {
    displayName: string;
    appearanceDescription: string;
  };
  capabilitySnapshot: {
    whatItDoes: string;
    capabilities: string[];
    limitations: string[];
  };
  visualSource: EvidencePropVisualSourceV1;
  contentSha256: string;
}
