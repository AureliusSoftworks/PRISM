"use client";

import type { ChangeEvent, ReactNode, RefObject } from "react";
import {
  Brain,
  Coffee,
  FlaskConical,
  Gamepad2,
  Info,
  KeyRound,
  Network,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  UserRound,
} from "lucide-react";
import styles from "./page.module.css";

export type SettingsScope =
  | "entry"
  | "gameHub"
  | "otherHub"
  | "zen"
  | "coffee"
  | "connections"
  | "network"
  | "experimental"
  | "models"
  | "behavior"
  | "about"
  | "account";

export type SettingsLeafScope = Exclude<SettingsScope, "entry" | "gameHub" | "otherHub">;

interface SettingsStatusPill {
  key: string;
  text: string;
  status: string;
}

interface SettingsPanelProps {
  scope: SettingsScope;
  settingsLoaded: boolean;
  panelClosing?: boolean;
  busy?: boolean;
  accountBackupBusy?: boolean;
  accountRestoreBusy?: boolean;
  panelNotice?: ReactNode;
  panelError?: ReactNode;
  accountImportInputRef: RefObject<HTMLInputElement | null>;
  saveIcon: ReactNode;
  uploadIcon: ReactNode;
  connectionStatusPills: readonly SettingsStatusPill[];
  onScopeChange: (scope: SettingsScope) => void;
  onClose: () => void;
  onAccountImportFileSelection: (event: ChangeEvent<HTMLInputElement>) => void;
  onExportAccount: () => void;
  onOpenAccountImportPicker: () => void;
  renderScopeContent: (scope: SettingsLeafScope) => ReactNode;
}

const GAME_MODE_CARDS: readonly {
  scope: SettingsScope;
  title: string;
  description: string;
  disabled?: boolean;
  disabledTitle?: string;
  icon: ReactNode;
}[] = [
  {
    scope: "zen",
    title: "Zen Mode Settings",
    description: "Session timing, mood sensitivity, recent context, and Atmosphere wallpaper.",
    icon: <Sparkles size={22} strokeWidth={1.9} />,
  },
  {
    scope: "coffee",
    title: "Coffee Mode Settings",
    description: "Table view experiments and session display preferences.",
    icon: <Coffee size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Story Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Story Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Arena Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Arena Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Polling Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Polling Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Feed Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Feed Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Games Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Games Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Gym Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Gym Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Slate Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Slate Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Pseudo Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Pseudo Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
  {
    scope: "gameHub",
    title: "Surf Mode Settings",
    description: "Coming soon.",
    disabled: true,
    disabledTitle: "Surf Mode settings are not available yet.",
    icon: <Gamepad2 size={22} strokeWidth={1.9} />,
  },
];

const OTHER_SETTINGS_CARDS: readonly {
  scope: SettingsScope;
  title: string;
  description: string;
  icon: ReactNode;
}[] = [
  {
    scope: "connections",
    title: "Connections",
    description: "API keys, local servers, paired Ollama, and ComfyUI.",
    icon: <KeyRound size={22} strokeWidth={1.9} />,
  },
  {
    scope: "network",
    title: "Network",
    description: "Access Prism from other devices on your local network.",
    icon: <Network size={22} strokeWidth={1.9} />,
  },
  {
    scope: "experimental",
    title: "Experimental",
    description: "Opt-in behavior that may move, change, or graduate later.",
    icon: <FlaskConical size={22} strokeWidth={1.9} />,
  },
  {
    scope: "models",
    title: "Models",
    description: "Defaults, fallbacks, provider visibility, and ComfyUI workflows.",
    icon: <SlidersHorizontal size={22} strokeWidth={1.9} />,
  },
  {
    scope: "behavior",
    title: "Behavior",
    description: "Memory capture, writing assist, and tutorial reset controls.",
    icon: <Brain size={22} strokeWidth={1.9} />,
  },
  {
    scope: "about",
    title: "About",
    description: "Version details, app information, and control model.",
    icon: <Info size={22} strokeWidth={1.9} />,
  },
  {
    scope: "account",
    title: "Account",
    description: "Profile, password, logout, and local data controls.",
    icon: <UserRound size={22} strokeWidth={1.9} />,
  },
];

function settingsBackTarget(scope: SettingsScope): SettingsScope | null {
  if (scope === "entry") return null;
  if (scope === "gameHub" || scope === "otherHub") return "entry";
  if (scope === "zen" || scope === "coffee") return "gameHub";
  return "otherHub";
}

function SettingsStatusPills({ pills }: { pills: readonly SettingsStatusPill[] }): ReactNode {
  if (pills.length === 0) return null;
  return (
    <div className={styles.settingsStatusPills} aria-label="Connection status">
      {pills.map((pill) => (
        <span key={pill.key} data-status={pill.status}>
          {pill.text}
        </span>
      ))}
    </div>
  );
}

export function SettingsPanel({
  scope,
  settingsLoaded,
  panelClosing,
  busy = false,
  accountBackupBusy = false,
  accountRestoreBusy = false,
  panelNotice,
  panelError,
  accountImportInputRef,
  saveIcon,
  uploadIcon,
  connectionStatusPills,
  onScopeChange,
  onClose,
  onAccountImportFileSelection,
  onExportAccount,
  onOpenAccountImportPicker,
  renderScopeContent,
}: SettingsPanelProps): React.JSX.Element {
  const backTarget = settingsBackTarget(scope);
  const accountActionsDisabled = busy || accountBackupBusy || accountRestoreBusy;

  const renderNoticeDock = (): ReactNode => {
    if (!panelNotice && !panelError) return null;
    return (
      <div className={styles.settingsSaveDock}>
        {panelNotice ? <p className={styles.panelNotice} role="status">{panelNotice}</p> : null}
        {panelError ? <p className={styles.error} role="alert">{panelError}</p> : null}
      </div>
    );
  };

  const renderChoiceCard = (card: {
    scope: SettingsScope;
    title: string;
    description: string;
    disabled?: boolean;
    disabledTitle?: string;
    icon: ReactNode;
  }): ReactNode => (
    <button
      key={card.title}
      type="button"
      className={styles.settingsHubCard}
      disabled={card.disabled}
      title={card.disabledTitle}
      onClick={() => {
        if (!card.disabled) onScopeChange(card.scope);
      }}
    >
      <span className={styles.settingsHubCardGlyph} aria-hidden="true">
        {card.icon}
      </span>
      <span className={styles.settingsHubCardCopy}>
        <strong>{card.title}</strong>
        <small>{card.description}</small>
      </span>
    </button>
  );

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
          <input
            ref={accountImportInputRef}
            type="file"
            accept=".prism"
            className={styles.panelHiddenFileInput}
            onChange={onAccountImportFileSelection}
          />
          <button
            type="button"
            className={`${styles.panelHeaderIconButton} ${styles.panelHeaderSaveButton}`}
            onClick={onExportAccount}
            disabled={accountActionsDisabled}
            aria-label="Export account backup as .prism file"
            data-glyph-tooltip="Export account backup as .prism"
          >
            <span className={styles.panelHeaderImportGlyph} aria-hidden="true">
              {saveIcon}
            </span>
          </button>
          <button
            type="button"
            className={`${styles.panelHeaderIconButton} ${styles.panelHeaderImportButton}`}
            onClick={onOpenAccountImportPicker}
            disabled={accountActionsDisabled}
            aria-label="Import account backup from .prism file"
            data-glyph-tooltip="Import account backup from .prism"
          >
            <span className={styles.panelHeaderImportGlyph} aria-hidden="true">
              {uploadIcon}
            </span>
          </button>
          {backTarget ? (
            <button
              type="button"
              className={styles.panelBack}
              onClick={() => onScopeChange(backTarget)}
              aria-label="Back to settings menu"
              data-glyph-tooltip="Back to settings menu"
            >
              ←
            </button>
          ) : null}
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

      {!settingsLoaded ? null : scope === "entry" ? (
        <div className={`${styles.form} ${styles.settingsWorkspace}`}>
          <div className={styles.settingsEntryGrid}>
            <button
              type="button"
              className={styles.settingsHubCard}
              onClick={() => onScopeChange("gameHub")}
            >
              <span className={styles.settingsHubCardGlyph} aria-hidden="true">
                <Gamepad2 size={24} strokeWidth={1.9} />
              </span>
              <span className={styles.settingsHubCardCopy}>
                <strong>[Game Mode] Settings</strong>
                <small>Zen, Coffee, Story, Arena, and other mode-specific controls.</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.settingsHubCard}
              onClick={() => onScopeChange("otherHub")}
            >
              <span className={styles.settingsHubCardGlyph} aria-hidden="true">
                <Settings2 size={24} strokeWidth={1.9} />
              </span>
              <span className={styles.settingsHubCardCopy}>
                <strong>Other Settings</strong>
                <small>Connections, model defaults, memory, app info, and account controls.</small>
              </span>
            </button>
          </div>
          {renderNoticeDock()}
        </div>
      ) : scope === "gameHub" ? (
        <div className={`${styles.form} ${styles.settingsWorkspace}`}>
          <section className={styles.settingsOverview} aria-label="Game Mode settings chooser">
            <div>
              <span className={styles.settingsEyebrow}>Game Mode Settings</span>
              <h4>Choose a settings area</h4>
              <p>Mode preferences stay separate from account, keys, and system defaults.</p>
            </div>
          </section>
          <div className={styles.settingsScopeGrid}>{GAME_MODE_CARDS.map(renderChoiceCard)}</div>
          {renderNoticeDock()}
        </div>
      ) : scope === "otherHub" ? (
        <div className={`${styles.form} ${styles.settingsWorkspace}`}>
          <section className={styles.settingsOverview} aria-label="Other settings chooser">
            <div>
              <span className={styles.settingsEyebrow}>Workspace settings</span>
              <h4>Prism Control Room</h4>
              <p>Connections, model routing, memory behavior, and account controls by section.</p>
            </div>
            <SettingsStatusPills pills={connectionStatusPills} />
          </section>
          <div className={styles.settingsScopeGrid}>
            {OTHER_SETTINGS_CARDS.map(renderChoiceCard)}
          </div>
          {renderNoticeDock()}
        </div>
      ) : (
        renderScopeContent(scope)
      )}
    </div>
  );
}
