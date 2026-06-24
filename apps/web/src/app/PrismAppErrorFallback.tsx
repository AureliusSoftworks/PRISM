"use client";

import styles from "./page.module.css";

type PrismAppErrorFallbackProps = {
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function PrismAppErrorFallback({
  title = "Prism needs a quick refresh.",
  body = "The app caught a problem before it could finish drawing this view. Your local data is still yours.",
  actionLabel = "Try again",
  onAction,
}: PrismAppErrorFallbackProps): React.JSX.Element {
  return (
    <main className={`${styles.authLayout} ${styles.themeDark}`}>
      <section className={`${styles.card} ${styles.appErrorCard}`} role="alert">
        <div className={styles.appErrorBrand}>
          <div className={styles.brandIconShell} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.jpg" alt="" aria-hidden="true" className={styles.brandIcon} />
          </div>
          <div>
            <p className={styles.backendUnavailableEyebrow}>Prism</p>
            <h1>{title}</h1>
          </div>
        </div>
        <p>{body}</p>
        {onAction && (
          <button type="button" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </section>
    </main>
  );
}
