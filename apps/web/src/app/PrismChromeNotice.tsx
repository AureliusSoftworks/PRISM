import type { MouseEventHandler, ReactNode } from "react";

import styles from "./PrismChromeNotice.module.css";

export type PrismChromeNoticeTone =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "memory";

export interface PrismChromeNoticeAction {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  ariaLabel?: string;
  disabled?: boolean;
  title?: string;
}

export interface PrismChromeNoticeProps {
  label: ReactNode;
  message: ReactNode;
  tone?: PrismChromeNoticeTone;
  action?: PrismChromeNoticeAction;
  onDismiss?: MouseEventHandler<HTMLButtonElement>;
  dismissLabel?: string;
  className?: string;
  title?: string;
  role?: "alert" | "status";
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
}

export interface PrismChromeNoticeViewportProps {
  children: ReactNode;
  placement?: "chrome" | "inline";
  className?: string;
  ariaLabel?: string;
}

export function PrismChromeNoticeViewport({
  children,
  placement = "chrome",
  className,
  ariaLabel = "Notifications",
}: PrismChromeNoticeViewportProps): React.JSX.Element {
  return (
    <div
      className={`${styles.viewport} ${className ?? ""}`}
      data-placement={placement}
      data-prism-chrome-notice-viewport="true"
      aria-label={ariaLabel}
    >
      {children}
    </div>
  );
}

export function PrismChromeNotice({
  label,
  message,
  tone = "info",
  action,
  onDismiss,
  dismissLabel = "Dismiss notification",
  className,
  title,
  role,
  onMouseEnter,
  onMouseLeave,
}: PrismChromeNoticeProps): React.JSX.Element {
  const resolvedRole = role ?? (tone === "error" ? "alert" : "status");
  return (
    <div
      className={`${styles.notice} ${className ?? ""}`}
      data-prism-chrome-notice="true"
      data-tone={tone}
      role={resolvedRole}
      aria-live={resolvedRole === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
      title={title}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <span className={styles.marker} aria-hidden="true" />
      <span className={styles.copy}>
        <strong className={styles.label}>{label}</strong>
        <span className={styles.message}>{message}</span>
      </span>
      {action ? (
        <button
          type="button"
          className={styles.action}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-label={action.ariaLabel ?? action.label}
          title={action.title}
        >
          {action.label}
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className={styles.dismiss}
          onClick={onDismiss}
          aria-label={dismissLabel}
          title={dismissLabel}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
  );
}
