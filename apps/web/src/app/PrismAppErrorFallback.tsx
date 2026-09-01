"use client";

import { useEffect, useState } from "react";
import { PRISM_APP_VERSION } from "../prismAppVersion";
import styles from "./page.module.css";
import {
  currentPrismDocumentTheme,
  type PrismResolvedDocumentTheme,
} from "./prismDocumentTheme.ts";
import {
  buildWebDiagnosticReport,
  writeDiagnosticClipboard,
} from "./webDiagnostics";

type ErrorCopyState = "copying" | "copied" | "failed" | null;

type PrismAppErrorFallbackProps = {
  title?: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  error?: unknown;
  surface?: string;
};

export function PrismAppErrorFallback({
  title = "Prism needs a quick refresh.",
  body = "The app caught a problem before it could finish drawing this view. Your local data is still yours.",
  actionLabel = "Try again",
  onAction,
  error,
  surface = "App",
}: PrismAppErrorFallbackProps): React.JSX.Element {
  const [errorCopyState, setErrorCopyState] = useState<ErrorCopyState>(null);
  const [resolvedTheme, setResolvedTheme] =
    useState<PrismResolvedDocumentTheme>("dark");

  useEffect(() => {
    const updateTheme = (): void => {
      setResolvedTheme(currentPrismDocumentTheme());
    };
    updateTheme();

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-prism-theme"],
    });
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", updateTheme);
    } else {
      media.addListener?.(updateTheme);
    }
    window.addEventListener("storage", updateTheme);
    return () => {
      observer.disconnect();
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", updateTheme);
      } else {
        media.removeListener?.(updateTheme);
      }
      window.removeEventListener("storage", updateTheme);
    };
  }, []);

  const copyError = async (): Promise<void> => {
    setErrorCopyState("copying");
    try {
      await writeDiagnosticClipboard(
        buildWebDiagnosticReport({
          app: "PRISM",
          appVersion: PRISM_APP_VERSION,
          surface,
          operation: "render",
          stage: "error-boundary",
          summary: error instanceof Error ? error.message : title,
          error,
        }),
      );
      setErrorCopyState("copied");
    } catch {
      setErrorCopyState("failed");
    }
  };

  return (
    <main
      className={`${styles.authLayout} ${
        resolvedTheme === "light" ? styles.themeLight : styles.themeDark
      } ${styles.documentThemeSurface}`}
      data-theme={resolvedTheme}
      data-prism-document-theme-surface="true"
    >
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
        <div className={styles.appErrorActions}>
          {onAction && (
            <button type="button" onClick={onAction}>
              {actionLabel}
            </button>
          )}
          {error !== undefined && (
            <button
              type="button"
              onClick={() => void copyError()}
              disabled={errorCopyState === "copying"}
            >
              {errorCopyState === "copying"
                ? "Copying…"
                : errorCopyState === "copied"
                  ? "Error copied"
                  : errorCopyState === "failed"
                    ? "Copy failed — try again"
                    : "Copy error"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
