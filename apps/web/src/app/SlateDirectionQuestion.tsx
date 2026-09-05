"use client";

import { useState } from "react";
import { TEXT_ENTRY_PARAGRAPH_MAX_LENGTH } from "@localai/shared";
import styles from "./slateDirectionQuestion.module.css";

export interface SlateDirectionChoice {
  id: string;
  label: string;
  description: string;
  direction: string;
}

interface SlateDirectionQuestionProps {
  kind: "continuity" | "unstick";
  eyebrow: string;
  title: string;
  explanation: string;
  choices: readonly [
    SlateDirectionChoice,
    SlateDirectionChoice,
    SlateDirectionChoice,
  ];
  evidence?: React.ReactNode;
  busy?: boolean;
  onChoose: (choice: SlateDirectionChoice) => void;
  onVibe: (vibe: string) => void;
  onDismiss?: () => void;
}

export function SlateDirectionQuestion({
  kind,
  eyebrow,
  title,
  explanation,
  choices,
  evidence,
  busy = false,
  onChoose,
  onVibe,
  onDismiss,
}: SlateDirectionQuestionProps): React.JSX.Element {
  const [vibeOpen, setVibeOpen] = useState(false);
  const [vibe, setVibe] = useState("");

  return (
    <section
      className={styles.card}
      data-kind={kind}
      data-tutorial-target={kind === "continuity" ? "slate-revision" : undefined}
      aria-label={kind === "continuity" ? "Continuity direction" : "Unstick me"}
    >
      <header>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{explanation}</p>
      </header>
      {evidence}
      <div className={styles.choices}>
        {choices.map((choice, index) => (
          <button
            key={choice.id}
            type="button"
            disabled={busy}
            onClick={() => onChoose(choice)}
          >
            <span>{index + 1}</span>
            <strong>{choice.label}</strong>
            <small>{choice.description}</small>
          </button>
        ))}
        <button
          type="button"
          className={styles.vibeChoice}
          aria-expanded={vibeOpen}
          disabled={busy}
          onClick={() => setVibeOpen((current) => !current)}
        >
          <span>4</span>
          <strong>Describe the vibe…</strong>
          <small>Give Slate a feeling, image, rhythm, or pressure to follow.</small>
        </button>
      </div>
      {vibeOpen ? (
        <form
          className={styles.vibeForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (vibe.trim()) onVibe(vibe.trim());
          }}
        >
          <label>
            <span>Your direction</span>
            <textarea
              value={vibe}
              maxLength={TEXT_ENTRY_PARAGRAPH_MAX_LENGTH}
              autoFocus
              rows={3}
              placeholder="Quietly devastating, like both people know this is goodbye…"
              onChange={(event) => setVibe(event.target.value)}
            />
          </label>
          <button type="submit" disabled={busy || !vibe.trim()}>
            {kind === "continuity" ? "Resolve & continue" : "Use this direction"}
          </button>
        </form>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          className={styles.dismiss}
          disabled={busy}
          onClick={onDismiss}
        >
          {kind === "continuity" ? "Not now · keep writing" : "Close"}
        </button>
      ) : null}
    </section>
  );
}
