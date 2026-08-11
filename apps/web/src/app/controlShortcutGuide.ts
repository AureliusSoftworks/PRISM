import {
  PRISM_KEYBOARD_SHORTCUT_DEFINITIONS,
  keyboardShortcutDisplay,
  type PrismKeyboardShortcutAction,
  type PrismKeyboardShortcutPreferencesV1,
} from "./keyboardShortcuts.ts";

/** An intentional hold reveals discovery UI without feeling unresponsive. */
export const CONTROL_SHORTCUT_GUIDE_SHOW_DELAY_MS = 1_500;

export type ControlShortcutGuideEntryAction =
  | "providerMode"
  | "modelPicker"
  | "effortPicker"
  | "turbo"
  | "prism"
  | "speechType";

export interface ControlShortcutGuideEntry {
  action: ControlShortcutGuideEntryAction;
  label: string;
  shortcut: string | null;
  display: string;
  slot: "up" | "down" | "left" | "right" | "footer";
}

const GUIDE_ACTIONS: readonly ControlShortcutGuideEntryAction[] = [
  "turbo",
  "providerMode",
  "effortPicker",
  "modelPicker",
  "prism",
  "speechType",
];

const GUIDE_SLOTS: Record<
  ControlShortcutGuideEntryAction,
  ControlShortcutGuideEntry["slot"]
> = {
  turbo: "up",
  providerMode: "footer",
  effortPicker: "down",
  modelPicker: "left",
  prism: "footer",
  speechType: "right",
};

export function controlShortcutGuideShouldShow(args: {
  controlHeld: boolean;
  prismWielding: boolean;
  recordingShortcut: boolean;
}): boolean {
  if (args.recordingShortcut) return false;
  // Wield is intentionally quiet. The compass is only discovery UI for the
  // Control-root navbar controls, not feedback for Prism's Option/Control hold.
  return args.controlHeld;
}

export function controlShortcutGuideEntries(
  preferences: PrismKeyboardShortcutPreferencesV1,
  platform: string,
): ControlShortcutGuideEntry[] {
  const labels = new Map(
    PRISM_KEYBOARD_SHORTCUT_DEFINITIONS.map((definition) => [
      definition.action,
      definition.label,
    ]),
  );
  return GUIDE_ACTIONS.map((action) => {
    const shortcut = preferences[action as PrismKeyboardShortcutAction];
    return {
      action,
      label: labels.get(action) ?? action,
      shortcut,
      display: keyboardShortcutDisplay(shortcut, platform),
      slot: GUIDE_SLOTS[action],
    };
  }).filter((entry) => entry.shortcut !== null);
}

export function isControlKeyEvent(event: {
  key: string;
  code?: string;
}): boolean {
  return (
    event.key === "Control" ||
    event.code === "ControlLeft" ||
    event.code === "ControlRight"
  );
}

export function isControlHeldAlone(event: {
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}): boolean {
  return event.ctrlKey && !event.altKey && !event.metaKey;
}

export const PRISM_COMPANION_ANCHOR_SELECTOR =
  '[data-prism-companion-anchor="true"]';

export interface PrismCompanionOrbAnchor {
  x: number;
  y: number;
  size: number;
}

/** Live Prism pearl center used to dock the Control shortcut compass. */
export function readPrismCompanionOrbAnchor(
  doc: Pick<Document, "querySelector"> = document,
): PrismCompanionOrbAnchor | null {
  const anchor = doc.querySelector(PRISM_COMPANION_ANCHOR_SELECTOR);
  if (
    !anchor ||
    typeof (anchor as { getBoundingClientRect?: unknown })
      .getBoundingClientRect !== "function"
  ) {
    return null;
  }
  const rect = (
    anchor as { getBoundingClientRect: () => DOMRect }
  ).getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    size: Math.max(rect.width, rect.height),
  };
}
