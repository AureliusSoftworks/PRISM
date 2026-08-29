"use client";

import {
  useEffect,
  useRef,
  type JSX,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import styles from "./debateMystery.module.css";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface WhodunnitSetupDialogProps {
  open: boolean;
  id: string;
  theme: "light" | "dark";
  eyebrow: string;
  title: string;
  description: string;
  busy?: boolean;
  role?: "dialog" | "alertdialog";
  size?: "default" | "wide" | "screen";
  children: ReactNode;
  onClose: () => void;
}

export default function WhodunnitSetupDialog({
  open,
  id,
  theme,
  eyebrow,
  title,
  description,
  busy = false,
  role = "dialog",
  size = "default",
  children,
  onClose,
}: WhodunnitSetupDialogProps): JSX.Element | null {
  const dialogRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent): void => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)]
        .filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [busy, open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={styles.whodunnitDialogScrim}
      data-theme={theme}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={styles.whodunnitDialog}
        data-size={size}
        role={role}
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-description`}
        tabIndex={-1}
      >
        <header className={styles.whodunnitDialogHeader}>
          <div>
            <small>{eyebrow}</small>
            <h2 id={`${id}-title`}>{title}</h2>
            <p id={`${id}-description`}>{description}</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label={`Close ${title}`}
          >
            Close
          </button>
        </header>
        <div className={styles.whodunnitDialogBody}>{children}</div>
      </section>
    </div>,
    document.body,
  );
}
