"use client";

import {
  proceduralPortableCaseThumbnailDataUrlV1,
  type PortableCaseLibrarySummaryV1,
} from "@localai/shared";
import styles from "./debateMystery.module.css";

export interface InstalledCaseLibraryPanelProps {
  cases: PortableCaseLibrarySummaryV1[];
  selectedCaseId: string;
  busy: boolean;
  onSelect: (caseId: string) => void;
  onForgeNew: () => void;
  onRemove: (caseFile: PortableCaseLibrarySummaryV1) => void;
}

export default function InstalledCaseLibraryPanel({
  cases,
  selectedCaseId,
  busy,
  onSelect,
  onForgeNew,
  onRemove,
}: InstalledCaseLibraryPanelProps): React.JSX.Element {
  return (
    <section className={styles.installedCases} data-tutorial-target="whodunnit-case-library">
      <header className={styles.installedCasesHeader}>
        <div><small>Case Library</small><h3>Choose the sealed logic</h3></div>
        <button type="button" data-selected={!selectedCaseId ? "true" : undefined} onClick={onForgeNew}>
          Forge a new case
        </button>
      </header>
      {cases.length ? (
        <div className={styles.installedCaseGrid}>
          {cases.map((caseFile) => (
            <article key={caseFile.id} data-selected={selectedCaseId === caseFile.id ? "true" : undefined}>
              <button type="button" className={styles.installedCaseSelect} disabled={busy} onClick={() => onSelect(caseFile.id)}>
                <img src={proceduralPortableCaseThumbnailDataUrlV1(caseFile.thumbnail)} alt="" />
                <span className={styles.installedCaseOverlay}>
                  <small>Reusable case</small>
                  <strong>{caseFile.title}</strong>
                  <span className={styles.installedCaseDescription}>{caseFile.description}</span>
                  <span className={styles.installedCaseStoryTags} aria-label="Story tags">
                    {(caseFile.storyTags?.length ? caseFile.storyTags : ["Closed circle"])
                      .map((tag) => <span key={tag}>{tag}</span>)}
                  </span>
                  <span className={styles.installedCaseFacts} aria-label="Case format">
                    <span>{caseFile.difficulty}</span>
                    <span>{caseFile.trialType}</span>
                    <span>{caseFile.suspectCount} suspects</span>
                    <span>{caseFile.minimumRoomCount} rooms</span>
                  </span>
                </span>
              </button>
              <footer><small>By {caseFile.creatorName}</small><button type="button" disabled={busy} onClick={() => onRemove(caseFile)}>Remove</button></footer>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.installedCasesEmpty}><span>◇</span><div><strong>No reusable cases installed yet.</strong><small>Complete an investigation to export one, or install a shared .case file.</small></div></div>
      )}
    </section>
  );
}
