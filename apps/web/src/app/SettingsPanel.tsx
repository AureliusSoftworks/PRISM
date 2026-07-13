"use client";

import type { ReactNode } from "react";
import {
  Coffee,
  FlaskConical,
  Info,
  KeyRound,
  MessageCircle,
  Network,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Volume2,
} from "lucide-react";
import styles from "./page.module.css";

export type SettingsScope =
  | "chat"
  | "zen"
  | "coffee"
  | "connections"
  | "network"
  | "experimental"
  | "models"
  | "voice"
  | "about"
  | "account";

export type SettingsLeafScope = SettingsScope;

interface SettingsPanelProps {
  scope: SettingsScope;
  settingsLoaded: boolean;
  panelClosing?: boolean;
  headerAction?: ReactNode;
  onScopeChange: (scope: SettingsScope) => void;
  onClose: () => void;
  renderScopeContent: (scope: SettingsLeafScope) => ReactNode;
}

const SETTINGS_NAV_GROUPS: readonly {
  label: string;
  items: readonly {
    scope: SettingsScope;
    title: string;
    icon: ReactNode;
  }[];
}[] = [
  {
    label: "General",
    items: [
      { scope: "connections", title: "Connections", icon: <KeyRound size={16} strokeWidth={2} /> },
      { scope: "models", title: "Models", icon: <SlidersHorizontal size={16} strokeWidth={2} /> },
      { scope: "network", title: "Network", icon: <Network size={16} strokeWidth={2} /> },
      { scope: "experimental", title: "Experimental", icon: <FlaskConical size={16} strokeWidth={2} /> },
      { scope: "voice", title: "Voice", icon: <Volume2 size={16} strokeWidth={2} /> },
    ],
  },
  {
    label: "Modes",
    items: [
      { scope: "chat", title: "Chat", icon: <MessageCircle size={16} strokeWidth={2} /> },
      { scope: "zen", title: "Zen", icon: <Sparkles size={16} strokeWidth={2} /> },
      { scope: "coffee", title: "Coffee", icon: <Coffee size={16} strokeWidth={2} /> },
    ],
  },
  {
    label: "Info",
    items: [
      { scope: "about", title: "About", icon: <Info size={16} strokeWidth={2} /> },
      { scope: "account", title: "Account", icon: <UserRound size={16} strokeWidth={2} /> },
    ],
  },
];

export function SettingsPanel({
  scope,
  settingsLoaded,
  panelClosing,
  headerAction,
  onScopeChange,
  onClose,
  renderScopeContent,
}: SettingsPanelProps): React.JSX.Element {
  return (
    <div
      className={`${styles.panel} ${styles.panelSettings}`}
      data-prism-panel="settings"
      data-prism-panel-layer="true"
      data-dev-panel-safe-area="right"
      data-settings-scope={scope}
      data-closing={panelClosing ? "true" : undefined}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-panel-title"
      tabIndex={-1}
    >
      <div className={styles.panelHeader}>
        <div className={styles.panelHeaderTitle}>
          <h3 id="settings-panel-title">Settings</h3>
        </div>
        <div className={styles.panelHeaderActions}>
          {headerAction}
          <button
            type="button"
            className={styles.panelClose}
            onClick={onClose}
            aria-label="Close panel"
            data-glyph-tooltip="Close panel"
          >
            ×
          </button>
        </div>
      </div>

      <div className={styles.settingsShell}>
        <nav className={styles.settingsNav} aria-label="Settings sections">
          {SETTINGS_NAV_GROUPS.map((group) => (
            <div key={group.label} className={styles.settingsNavGroup}>
              <span className={styles.settingsNavGroupLabel}>{group.label}</span>
              <div className={styles.settingsNavList}>
                {group.items.map((item) => (
                  <button
                    key={item.scope}
                    type="button"
                    className={styles.settingsNavItem}
                    data-active={scope === item.scope ? "true" : undefined}
                    onClick={() => onScopeChange(item.scope)}
                  >
                    <span className={styles.settingsNavIcon} aria-hidden="true">
                      {item.icon}
                    </span>
                    <span>{item.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className={styles.settingsContent}>
          {settingsLoaded ? renderScopeContent(scope) : null}
        </div>
      </div>
    </div>
  );
}
