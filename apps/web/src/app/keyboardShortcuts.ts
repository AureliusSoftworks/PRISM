export const PRISM_KEYBOARD_SHORTCUTS_CHANGED_EVENT =
  "prism:keyboard-shortcuts-changed";

export type PrismKeyboardShortcutAction =
  | "prism"
  | "providerMode"
  | "modelPicker"
  | "effortPicker"
  | "turbo"
  | "speechType"
  | "effortHud";

export type PrismKeyboardShortcutPreferencesV1 = Record<
  PrismKeyboardShortcutAction,
  string | null
>;

export interface PrismKeyboardShortcutDefinition {
  action: PrismKeyboardShortcutAction;
  label: string;
  description: string;
}

export const PRISM_KEYBOARD_SHORTCUT_DEFINITIONS: readonly PrismKeyboardShortcutDefinition[] =
  [
    {
      action: "prism",
      label: "Summon / Wield Prism",
      description:
        "Summon Prism, or refract the currently focused Prism control.",
    },
    {
      action: "providerMode",
      label: "LOCAL / ONLINE",
      description:
        "Flip the navbar privacy lane between LOCAL and ONLINE, separate from the Control shortcut root.",
    },
    {
      action: "modelPicker",
      label: "Model picker",
      description: "Open the active Model picker.",
    },
    {
      action: "effortPicker",
      label: "Effort picker",
      description: "Open the active Effort menu beside Model.",
    },
    {
      action: "turbo",
      label: "Turbo",
      description:
        "Toggle Turbo, switching to the first eligible Fast ONLINE model when needed.",
    },
    {
      action: "speechType",
      label: "Speech Type",
      description: "Open the navbar Speech Type menu.",
    },
    {
      action: "effortHud",
      label: "Effort HUD",
      description: "Open the active model's compact effort overlay.",
    },
  ];

const ACTIONS: readonly PrismKeyboardShortcutAction[] = [
  "prism",
  "providerMode",
  "modelPicker",
  "effortPicker",
  "turbo",
  "speechType",
  "effortHud",
];

const MODIFIER_CODES = new Set([
  "AltLeft",
  "AltRight",
  "ControlLeft",
  "ControlRight",
  "MetaLeft",
  "MetaRight",
  "ShiftLeft",
  "ShiftRight",
]);

const SHORTCUT_MODIFIERS = ["Meta", "Control", "Alt", "Shift"] as const;

const VALID_KEY_CODE = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Arrow(?:Up|Down|Left|Right)|Space|Tab|Enter|Home|End|PageUp|PageDown|Backquote|BracketLeft|BracketRight|Backslash|Semicolon|Quote|Comma|Period|Slash|Minus|Equal)$/;

function isApplePlatform(platform: string): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(platform);
}

export function defaultPrismKeyboardShortcuts(
  platform: string,
): PrismKeyboardShortcutPreferencesV1 {
  const applePlatform = isApplePlatform(platform);
  return {
    prism: applePlatform ? "Meta+Alt" : "Control+Alt",
    providerMode: "Shift+Tab",
    modelPicker: applePlatform ? "Alt+ArrowLeft" : "Control+ArrowLeft",
    effortPicker: applePlatform ? "Alt+ArrowDown" : "Control+ArrowDown",
    turbo: applePlatform ? "Alt+ArrowUp" : "Control+ArrowUp",
    speechType: applePlatform ? "Alt+ArrowRight" : "Control+ArrowRight",
    effortHud: applePlatform
      ? "Meta+Shift+KeyE"
      : "Control+Shift+KeyE",
  };
}

export function prismKeyboardShortcutsStorageKey(accountKey: string): string {
  return `prism_keyboard_shortcuts_v2:${encodeURIComponent(accountKey)}`;
}

interface ShortcutEventLike {
  code: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  target?: EventTarget | null;
}

function normalizedShortcut(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const pieces = value.split("+").filter(Boolean);
  if (pieces.length < 2) return undefined;
  const modifierOnly = pieces.every((piece) =>
    SHORTCUT_MODIFIERS.includes(
      piece as (typeof SHORTCUT_MODIFIERS)[number],
    ),
  );
  if (modifierOnly) {
    return SHORTCUT_MODIFIERS.filter((modifier) => pieces.includes(modifier)).join(
      "+",
    );
  }
  const code = pieces.at(-1) ?? "";
  if (!VALID_KEY_CODE.test(code)) return undefined;
  const modifiers = new Set(pieces.slice(0, -1));
  if (
    [...modifiers].some(
      (modifier) =>
        modifier !== "Meta" &&
        modifier !== "Control" &&
        modifier !== "Alt" &&
        modifier !== "Shift",
    )
  ) {
    return undefined;
  }
  if (modifiers.size === 0 || modifiers.size !== pieces.length - 1) {
    return undefined;
  }
  return [
    modifiers.has("Meta") ? "Meta" : null,
    modifiers.has("Control") ? "Control" : null,
    modifiers.has("Alt") ? "Alt" : null,
    modifiers.has("Shift") ? "Shift" : null,
    code,
  ]
    .filter(Boolean)
    .join("+");
}

export function normalizePrismKeyboardShortcuts(
  input: unknown,
  platform: string,
): PrismKeyboardShortcutPreferencesV1 {
  const defaults = defaultPrismKeyboardShortcuts(platform);
  const record =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const normalized = ACTIONS.reduce<PrismKeyboardShortcutPreferencesV1>(
    (result, action) => {
      const normalized = normalizedShortcut(record[action]);
      result[action] = normalized === undefined ? defaults[action] : normalized;
      return result;
    },
    { ...defaults },
  );
  const seen = new Set<string>();
  for (const action of ACTIONS) {
    const shortcut = normalized[action];
    if (!shortcut) continue;
    if (!seen.has(shortcut)) {
      seen.add(shortcut);
      continue;
    }
    const fallback = defaults[action];
    normalized[action] = fallback && !seen.has(fallback) ? fallback : null;
    if (normalized[action]) seen.add(normalized[action]);
  }
  return normalized;
}

export function readPrismKeyboardShortcuts(
  storage: Pick<Storage, "getItem">,
  accountKey: string,
  platform: string,
): PrismKeyboardShortcutPreferencesV1 {
  try {
    const raw = storage.getItem(prismKeyboardShortcutsStorageKey(accountKey));
    const preferences = normalizePrismKeyboardShortcuts(
      raw === null ? null : JSON.parse(raw),
      platform,
    );
    // Migrate retired defaults without changing deliberately customized
    // device-local shortcuts.
    if (preferences.prism === "Control+Space") {
      preferences.prism = defaultPrismKeyboardShortcuts(platform).prism;
    }
    if (
      preferences.providerMode === "Control+ArrowLeft" &&
      preferences.modelPicker === "Control+ArrowDown" &&
      preferences.effortPicker === "Control+ArrowRight" &&
      preferences.speechType === "Shift+Tab"
    ) {
      const defaults = defaultPrismKeyboardShortcuts(platform);
      preferences.providerMode = defaults.providerMode;
      preferences.modelPicker = defaults.modelPicker;
      preferences.effortPicker = defaults.effortPicker;
      preferences.speechType = defaults.speechType;
      if (
        isApplePlatform(platform) &&
        preferences.prism === "Control+Alt" &&
        preferences.turbo === "Control+ArrowUp"
      ) {
        preferences.prism = defaults.prism;
        preferences.turbo = defaults.turbo;
      }
    }
    if (
      isApplePlatform(platform) &&
      preferences.prism === "Control+Alt" &&
      preferences.providerMode === "Shift+Tab" &&
      preferences.modelPicker === "Control+ArrowLeft" &&
      preferences.effortPicker === "Control+ArrowDown" &&
      preferences.turbo === "Control+ArrowUp" &&
      preferences.speechType === "Control+ArrowRight"
    ) {
      const defaults = defaultPrismKeyboardShortcuts(platform);
      preferences.prism = defaults.prism;
      preferences.modelPicker = defaults.modelPicker;
      preferences.effortPicker = defaults.effortPicker;
      preferences.turbo = defaults.turbo;
      preferences.speechType = defaults.speechType;
    }
    return preferences;
  } catch {
    return defaultPrismKeyboardShortcuts(platform);
  }
}

export function writePrismKeyboardShortcuts(
  storage: Pick<Storage, "setItem">,
  accountKey: string,
  preferences: PrismKeyboardShortcutPreferencesV1,
): void {
  storage.setItem(
    prismKeyboardShortcutsStorageKey(accountKey),
    JSON.stringify(preferences),
  );
}

export function keyboardShortcutFromEvent(
  event: ShortcutEventLike,
): string | null {
  if (MODIFIER_CODES.has(event.code)) {
    const modifiers = [
      event.metaKey ? "Meta" : null,
      event.ctrlKey ? "Control" : null,
      event.altKey ? "Alt" : null,
      event.shiftKey ? "Shift" : null,
    ].filter((modifier): modifier is string => modifier !== null);
    return modifiers.length >= 2 ? modifiers.join("+") : null;
  }
  if (!VALID_KEY_CODE.test(event.code)) {
    return null;
  }
  if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
    return null;
  }
  return [
    event.metaKey ? "Meta" : null,
    event.ctrlKey ? "Control" : null,
    event.altKey ? "Alt" : null,
    event.shiftKey ? "Shift" : null,
    event.code,
  ]
    .filter(Boolean)
    .join("+");
}

export function keyboardShortcutMatchesEvent(
  shortcut: string | null,
  event: ShortcutEventLike,
): boolean {
  if (!shortcut) return false;
  if (
    /^Alt\+Arrow(?:Up|Down|Left|Right)$/u.test(shortcut) &&
    keyboardShortcutTargetIsTextEditable(event.target)
  ) {
    return false;
  }
  return keyboardShortcutFromEvent(event) === shortcut;
}

export function keyboardShortcutTargetIsTextEditable(
  target: EventTarget | null | undefined,
): boolean {
  if (!target || typeof target !== "object") return false;
  const closest = (target as { closest?: unknown }).closest;
  if (typeof closest !== "function") return false;
  return Boolean(
    closest.call(
      target,
      "input, textarea, [contenteditable='true'], [role='textbox'], [data-markdown-cm-host='true']",
    ),
  );
}

function displayCode(code: string): string {
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Arrow")) return code.slice(5);
  const labels: Record<string, string> = {
    Backquote: "`",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Minus: "-",
    Equal: "=",
  };
  return labels[code] ?? code;
}

export function keyboardShortcutDisplay(
  shortcut: string | null,
  platform: string,
): string {
  if (!shortcut) return "Not set";
  const allParts = shortcut.split("+");
  const modifierOnly = allParts.every((part) =>
    SHORTCUT_MODIFIERS.includes(part as (typeof SHORTCUT_MODIFIERS)[number]),
  );
  const parts = modifierOnly ? allParts : allParts.slice(0, -1);
  const code = modifierOnly ? null : (allParts.at(-1) ?? "");
  if (isApplePlatform(platform)) {
    return [
      parts.includes("Meta") ? "⌘" : null,
      parts.includes("Control") ? "⌃" : null,
      parts.includes("Alt") ? "⌥" : null,
      parts.includes("Shift") ? "⇧" : null,
      code ? displayCode(code) : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    parts.includes("Meta") ? "Meta" : null,
    parts.includes("Control") ? "Ctrl" : null,
    parts.includes("Alt") ? "Alt" : null,
    parts.includes("Shift") ? "Shift" : null,
    code ? displayCode(code) : null,
  ]
    .filter(Boolean)
    .join(" + ");
}

export function keyboardShortcutAria(shortcut: string | null): string | undefined {
  return shortcut ?? undefined;
}

export function keyboardShortcutSpokenLabel(
  shortcut: string | null,
  platform: string,
): string {
  return keyboardShortcutDisplay(shortcut, platform).replaceAll(" + ", " ");
}

export function keyboardShortcutConflictAction(
  preferences: PrismKeyboardShortcutPreferencesV1,
  action: PrismKeyboardShortcutAction,
  shortcut: string,
): PrismKeyboardShortcutAction | null {
  return (
    ACTIONS.find(
      (candidate) =>
        candidate !== action && preferences[candidate] === shortcut,
    ) ?? null
  );
}

export function keyboardShortcutEventIsRecording(
  event: Pick<Event, "target">,
): boolean {
  return (
    event.target instanceof Element &&
    Boolean(event.target.closest('[data-keyboard-shortcut-recorder="true"]'))
  );
}

let activePreferences = defaultPrismKeyboardShortcuts("");

export function activePrismKeyboardShortcut(
  action: PrismKeyboardShortcutAction,
): string | null {
  return activePreferences[action];
}

export function setActivePrismKeyboardShortcuts(
  preferences: PrismKeyboardShortcutPreferencesV1,
): void {
  activePreferences = preferences;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(PRISM_KEYBOARD_SHORTCUTS_CHANGED_EVENT));
  }
}
