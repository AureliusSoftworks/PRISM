"use client";

import styles from "./page.module.css";

type BackendUnavailableNoticeProps = {
  variant: "full" | "banner";
  message?: string;
  retryBusy?: boolean;
  restartBusy?: boolean;
  showRestart?: boolean;
  onRetry?: () => void;
  onRestart?: () => void;
};

export function BackendUnavailableNotice({
  variant,
  message = "Trying to reconnect to Prism...",
  retryBusy = false,
  restartBusy = false,
  showRestart = false,
  onRetry,
  onRestart,
}: BackendUnavailableNoticeProps): React.JSX.Element {
  const body =
    variant === "full"
      ? "The local server is offline or restarting. Once it answers again, Prism will pick up where it left off."
      : "Server connection paused. Your draft and canvas are still here.";
  const card = (
    <section
      className={
        variant === "full"
          ? `${styles.backendUnavailableCard} ${styles.card}`
          : styles.backendUnavailableBanner
      }
      role="status"
      aria-live="polite"
    >
      <div className={styles.backendUnavailableSignal} aria-hidden="true">
        <span />
      </div>
      <div className={styles.backendUnavailableBody}>
        <p className={styles.backendUnavailableEyebrow}>Server offline</p>
        <h2>{message}</h2>
        <p>{body}</p>
      </div>
      {(onRetry || (showRestart && onRestart)) && (
        <div className={styles.backendUnavailableActions}>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={retryBusy || restartBusy}>
              {retryBusy ? "Checking..." : "Retry connection"}
            </button>
          )}
          {showRestart && onRestart && (
            <button type="button" onClick={onRestart} disabled={retryBusy || restartBusy}>
              {restartBusy ? "Restarting..." : "Restart local API"}
            </button>
          )}
        </div>
      )}
    </section>
  );

  if (variant === "banner") return card;
  return <div className={styles.backendUnavailableFull}>{card}</div>;
}
