"use client";

import type { SlateSectionDetail } from "@localai/shared";
import styles from "./slateFullBookReader.module.css";

interface SlateFullBookReaderProps {
  projectTitle: string;
  sections: readonly SlateSectionDetail[];
  loading: boolean;
  onClose: () => void;
  onEditSection: (sectionId: string) => void;
}

export function SlateFullBookReader({
  projectTitle,
  sections,
  loading,
  onClose,
  onEditSection,
}: SlateFullBookReaderProps): React.JSX.Element {
  return (
    <section
      className={styles.reader}
      role="dialog"
      aria-modal="true"
      aria-labelledby="slate-full-book-title"
    >
      <header>
        <div>
          <span>Full book · reading view</span>
          <h1 id="slate-full-book-title">{projectTitle}</h1>
          <p>
            Sections render as they approach the viewport. Focused editing stays
            authoritative.
          </p>
        </div>
        <button type="button" onClick={onClose}>
          Back to section
        </button>
      </header>
      <div className={styles.pages} aria-busy={loading}>
        {loading ? <p className={styles.loading}>Gathering the manuscript…</p> : null}
        {!loading && sections.length === 0 ? (
          <p className={styles.loading}>No drafted sections yet.</p>
        ) : null}
        {sections.map((section) => (
          <article key={section.id} className={styles.section}>
            <header>
              <div>
                <span>
                  {section.kind} · {section.status}
                </span>
                <h2>{section.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => onEditSection(section.id)}
              >
                Edit section
              </button>
            </header>
            <div className={styles.prose}>
              {section.prose.split(/\n{2,}/u).map((paragraph, index) =>
                paragraph === "***" ? (
                  <hr key={`${section.id}:break:${index}`} />
                ) : (
                  <p key={`${section.id}:paragraph:${index}`}>{paragraph}</p>
                ),
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
