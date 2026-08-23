const BUNDLED_PROP_ROOT = "/debate/mystery/evidence";

export const DEBATE_MYSTERY_BUNDLED_PROP_ASSETS = {
  "brass-letter-opener": `${BUNDLED_PROP_ROOT}/brass-letter-opener.webp`,
  "ceremonial-dagger": `${BUNDLED_PROP_ROOT}/ceremonial-dagger.webp`,
  "concealed-safe-closed": `${BUNDLED_PROP_ROOT}/concealed-safe-closed.webp`,
  "concealed-safe-open": `${BUNDLED_PROP_ROOT}/concealed-safe-open.webp`,
  "creased-receipt": `${BUNDLED_PROP_ROOT}/creased-receipt.webp`,
  "delicate-gold-key": `${BUNDLED_PROP_ROOT}/delicate-gold-key.webp`,
  "fireplace-poker": `${BUNDLED_PROP_ROOT}/fireplace-poker.webp`,
  "frayed-thread": `${BUNDLED_PROP_ROOT}/frayed-thread.webp`,
  "garage-remote": `${BUNDLED_PROP_ROOT}/garage-remote.webp`,
  "heavy-decanter": `${BUNDLED_PROP_ROOT}/heavy-decanter.webp`,
  "hunting-knife": `${BUNDLED_PROP_ROOT}/hunting-knife.webp`,
  "lead-pipe": `${BUNDLED_PROP_ROOT}/lead-pipe.webp`,
  "locked-jewelry-box": `${BUNDLED_PROP_ROOT}/locked-jewelry-box.webp`,
  "marble-paperweight": `${BUNDLED_PROP_ROOT}/marble-paperweight.webp`,
  "opened-jewelry-box-heirlooms": `${BUNDLED_PROP_ROOT}/opened-jewelry-box-heirlooms.webp`,
  "private-ledger": `${BUNDLED_PROP_ROOT}/private-ledger.webp`,
  revolver: `${BUNDLED_PROP_ROOT}/revolver.webp`,
  "safe-code": `${BUNDLED_PROP_ROOT}/safe-code.webp`,
  "scorched-letter": `${BUNDLED_PROP_ROOT}/scorched-letter.webp`,
  "silver-key": `${BUNDLED_PROP_ROOT}/silver-key.webp`,
  "stained-glass": `${BUNDLED_PROP_ROOT}/stained-glass.webp`,
  "stopped-pocket-watch": `${BUNDLED_PROP_ROOT}/stopped-pocket-watch.webp`,
  "unidentified-evidence": `${BUNDLED_PROP_ROOT}/unidentified-evidence.webp`,
  "unknown-poison": `${BUNDLED_PROP_ROOT}/unknown-poison.webp`,
} as const;

export type DebateMysteryBundledPropAssetKey = keyof typeof DEBATE_MYSTERY_BUNDLED_PROP_ASSETS;

interface MysteryEvidenceVisualIdentity {
  id: string;
  object: string;
  title: string;
}

interface MysteryInventoryVisualIdentity {
  id: string;
  title: string;
}

const EVIDENCE_ID_ASSET_KEYS: Readonly<Record<string, DebateMysteryBundledPropAssetKey>> = {
  "evidence-locked-jewelry-box": "locked-jewelry-box",
  "evidence-heirloom-jewels": "opened-jewelry-box-heirlooms",
  "evidence-private-ledger": "private-ledger",
};

const INVENTORY_ID_ASSET_KEYS: Readonly<Record<string, DebateMysteryBundledPropAssetKey>> = {
  "access-delicate-gold-key": "delicate-gold-key",
  "container-locked-jewelry-box": "locked-jewelry-box",
  "artifact-heirloom-jewels": "opened-jewelry-box-heirlooms",
  "access-garage-remote": "garage-remote",
  "access-silver-key": "silver-key",
  "access-safe-code": "safe-code",
  "artifact-private-ledger": "private-ledger",
};

const OBJECT_ASSET_KEYS: Readonly<Record<string, DebateMysteryBundledPropAssetKey>> = {
  "unknown poison": "unknown-poison",
  "marble paperweight": "marble-paperweight",
  "heavy decanter": "heavy-decanter",
  "fireplace poker": "fireplace-poker",
  "brass letter opener": "brass-letter-opener",
  revolver: "revolver",
  "hunting knife": "hunting-knife",
  "ceremonial dagger": "ceremonial-dagger",
  "length of lead pipe": "lead-pipe",
  "lead pipe": "lead-pipe",
  receipt: "creased-receipt",
  key: "silver-key",
  thread: "frayed-thread",
  glass: "stained-glass",
  "pocket watch": "stopped-pocket-watch",
  letter: "scorched-letter",
  "jewelry box": "locked-jewelry-box",
  jewels: "opened-jewelry-box-heirlooms",
  ledger: "private-ledger",
};

function normalizedPropLabel(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/^(?:a|an|the)\s+/u, "")
    .replace(/\s+/gu, " ");
}

function assetPath(key: DebateMysteryBundledPropAssetKey): string {
  return DEBATE_MYSTERY_BUNDLED_PROP_ASSETS[key];
}

export function debateMysteryBundledEvidenceAssetPath(
  item: MysteryEvidenceVisualIdentity,
): string {
  const exactKey = EVIDENCE_ID_ASSET_KEYS[item.id];
  if (exactKey) return assetPath(exactKey);
  const objectKey = OBJECT_ASSET_KEYS[normalizedPropLabel(item.object)];
  if (objectKey) return assetPath(objectKey);
  const titleKey = OBJECT_ASSET_KEYS[normalizedPropLabel(item.title)];
  return assetPath(titleKey ?? "unidentified-evidence");
}

export function debateMysteryBundledInventoryAssetPath(
  item: MysteryInventoryVisualIdentity,
): string {
  const exactKey = INVENTORY_ID_ASSET_KEYS[item.id];
  if (exactKey) return assetPath(exactKey);
  const titleKey = OBJECT_ASSET_KEYS[normalizedPropLabel(item.title)];
  return assetPath(titleKey ?? "unidentified-evidence");
}

export function debateMysteryBundledLockTargetAssetPath(
  targetLabel: string,
  open = false,
): string | null {
  if (!normalizedPropLabel(targetLabel).includes("safe")) return null;
  return assetPath(open ? "concealed-safe-open" : "concealed-safe-closed");
}
