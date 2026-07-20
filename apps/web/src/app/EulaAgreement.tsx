"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import {
  PRISM_EULA_ACCEPTANCE_ACTION,
  PRISM_EULA_AGREEMENT_CONFIRMATION,
  PRISM_EULA_EFFECTIVE_DATE,
  PRISM_EULA_KEY_POINTS,
  PRISM_EULA_MARKDOWN,
  PRISM_EULA_MINIMUM_AGE_CONFIRMATION,
  PRISM_EULA_TITLE,
  PRISM_EULA_VERSION,
} from "@localai/shared";

import styles from "./eula-agreement.module.css";

interface EulaAgreementDialogProps {
  open: boolean;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onAccept: () => void | Promise<void>;
}

export function EulaDocument(): React.JSX.Element {
  return (
    <article
      className={styles.document}
      data-legal-document="eula"
      data-eula-version={PRISM_EULA_VERSION}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {PRISM_EULA_MARKDOWN}
      </ReactMarkdown>
    </article>
  );
}

export function EulaAgreementDialog({
  open,
  busy,
  error,
  onCancel,
  onAccept,
}: EulaAgreementDialogProps): React.JSX.Element {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [minimumAgeConfirmed, setMinimumAgeConfirmed] = useState(false);
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      return;
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(
    () => () => {
      if (dialogRef.current?.open) dialogRef.current.close();
    },
    [],
  );

  function cancelReview(): void {
    if (busy) return;
    onCancel();
  }

  function submitAcceptance(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!minimumAgeConfirmed || !agreementAccepted || busy) return;
    void onAccept();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="eula-dialog-title"
      aria-describedby="eula-dialog-summary"
      aria-busy={busy}
      onCancel={(event) => {
        event.preventDefault();
        cancelReview();
      }}
      onClose={() => {
        setMinimumAgeConfirmed(false);
        setAgreementAccepted(false);
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopPropagation();
        cancelReview();
      }}
    >
      <form className={styles.dialogShell} onSubmit={submitAcceptance}>
        <header className={styles.dialogHeader}>
          <div>
            <span className={styles.eyebrow}>Account agreement</span>
            <h2 id="eula-dialog-title">{PRISM_EULA_TITLE}</h2>
            <p>
              Effective {PRISM_EULA_EFFECTIVE_DATE} · Version {PRISM_EULA_VERSION}
            </p>
          </div>
          <a
            className={styles.copyLink}
            href="/legal/eula"
            target="_blank"
            rel="noreferrer"
          >
            Open printable copy
          </a>
        </header>

        <div className={styles.dialogContent}>
          <section
            id="eula-dialog-summary"
            className={styles.keyTerms}
            aria-labelledby="eula-key-terms-title"
          >
            <div className={styles.keyTermsHeading}>
              <span aria-hidden="true">◇</span>
              <strong id="eula-key-terms-title">Key terms</strong>
            </div>
            <ul>
              {PRISM_EULA_KEY_POINTS.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <div
            className={styles.documentScroll}
            data-eula-scroll="true"
            tabIndex={0}
            aria-label="Full End User License Agreement"
          >
            <EulaDocument />
          </div>
        </div>

        <footer className={styles.dialogFooter}>
          <div className={styles.acceptanceStack} data-eula-acceptance="true">
            <label className={styles.acceptanceRow}>
              <input
                type="checkbox"
                checked={minimumAgeConfirmed}
                onChange={(event) =>
                  setMinimumAgeConfirmed(event.currentTarget.checked)
                }
                disabled={busy}
              />
              <span>{PRISM_EULA_MINIMUM_AGE_CONFIRMATION}</span>
            </label>
            <label className={styles.acceptanceRow}>
              <input
                type="checkbox"
                checked={agreementAccepted}
                onChange={(event) =>
                  setAgreementAccepted(event.currentTarget.checked)
                }
                disabled={busy}
              />
              <span>{PRISM_EULA_AGREEMENT_CONFIRMATION}</span>
            </label>
          </div>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}

          <div className={styles.dialogActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={cancelReview}
              disabled={busy}
            >
              Back
            </button>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={!minimumAgeConfirmed || !agreementAccepted || busy}
            >
              {busy ? "Creating account…" : PRISM_EULA_ACCEPTANCE_ACTION}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

export function EulaStandalone(): React.JSX.Element {
  return (
    <main className={styles.standalonePage}>
      <div className={styles.standaloneShell}>
        <header className={styles.standaloneHeader}>
          <div>
            <span className={styles.eyebrow}>PRISM legal</span>
            <h1>{PRISM_EULA_TITLE}</h1>
            <p>
              Effective {PRISM_EULA_EFFECTIVE_DATE} · Version {PRISM_EULA_VERSION}
            </p>
          </div>
          <div className={styles.standaloneActions}>
            <Link href="/?mode=register">Back to PRISM</Link>
            <button type="button" onClick={() => window.print()}>
              Print or save PDF
            </button>
          </div>
        </header>
        <section className={styles.standaloneKeyTerms}>
          <h2>Before you begin</h2>
          <ul>
            {PRISM_EULA_KEY_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>
        <EulaDocument />
      </div>
    </main>
  );
}
