import type { CSSProperties } from "react";
import styles from "./DebateExperience.module.css";

export type DebateEvidenceDocumentKind = "brave" | "scholar" | "url";

export interface DebateEvidenceDocumentProps {
  id: string;
  kind: DebateEvidenceDocumentKind;
  origin: string;
  title: string;
  snippet: string;
  rotationDeg?: number;
  presentation?: "forum" | "desk";
  theme?: "light" | "dark";
  className?: string;
  ariaHidden?: boolean;
}

/** One physical source prop shared by Forum lecterns and the Whodunnit desk. */
export function DebateEvidenceDocument({
  id,
  kind,
  origin,
  title,
  snippet,
  rotationDeg = -6,
  presentation = "forum",
  theme,
  className,
  ariaHidden = true,
}: DebateEvidenceDocumentProps): React.JSX.Element {
  return (
    <span
      className={`${styles.evidencePedestalDocument} ${className ?? ""}`}
      aria-hidden={ariaHidden ? "true" : undefined}
      data-debate-evidence-document="true"
      data-evidence-document-id={id}
      data-source-kind={kind}
      data-presentation={presentation}
      data-theme={theme}
      data-prop={kind === "url" ? "envelope" : kind === "scholar" ? "folio" : "clipping"}
      style={{ "--debate-evidence-prop-rotate": `${rotationDeg}deg` } as CSSProperties}
    >
      <span className={styles.evidencePedestalDocumentHardware} aria-hidden="true" />
      <span className={styles.evidencePedestalDocumentDetails}>
        <span className={styles.evidencePedestalDocumentOrigin}>{origin}</span>
        <strong className={styles.evidencePedestalDocumentTitle}>{title}</strong>
        <span className={styles.evidencePedestalDocumentSnippet}>{snippet}</span>
      </span>
    </span>
  );
}
