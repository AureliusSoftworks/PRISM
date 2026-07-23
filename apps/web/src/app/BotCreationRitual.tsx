"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { BotGeneratedDraftV1 } from "@localai/shared";
import { PrismOrb } from "./PrismOrb";
import styles from "./BotCreationRitual.module.css";

const CREATION_STAGES = [
  {
    label: "Reading the spark",
    detail: "Finding the traits that make this character singular.",
  },
  {
    label: "Shaping a point of view",
    detail: "Giving the draft motives, edges, and a way of seeing.",
  },
  {
    label: "Finding a voice",
    detail: "Tuning how the character sounds, moves, and responds.",
  },
  {
    label: "Assembling the details",
    detail: "Bringing face, ink, settings, and identity into focus.",
  },
] as const;

const CREATION_WORDS_FALLBACK = [
  "motive",
  "voice",
  "temperament",
  "presence",
  "memory",
  "spark",
] as const;

const CREATION_WORDS_IGNORED = new Set([
  "about",
  "after",
  "also",
  "always",
  "because",
  "being",
  "character",
  "could",
  "from",
  "have",
  "into",
  "never",
  "should",
  "speaks",
  "that",
  "their",
  "them",
  "they",
  "this",
  "very",
  "with",
  "would",
]);

function creationWords(prompt: string): string[] {
  const words = prompt
    .normalize("NFKC")
    .match(/[\p{L}\p{N}'’-]+/gu)
    ?.map((word) => word.replace(/^['’]|['’]$/gu, ""))
    .filter((word) => word.length >= 4 && !CREATION_WORDS_IGNORED.has(word.toLowerCase()));
  const unique: string[] = [];
  for (const word of words ?? []) {
    if (unique.some((entry) => entry.toLowerCase() === word.toLowerCase())) continue;
    unique.push(word);
    if (unique.length === 6) break;
  }
  return unique.length >= 4
    ? unique
    : [...unique, ...CREATION_WORDS_FALLBACK].slice(0, 6);
}

export interface BotCreationRitualProps {
  prompt: string;
  responseMode: "local" | "online" | "auto";
  completedDraft: BotGeneratedDraftV1 | null;
}

export function BotCreationRitual({
  prompt,
  responseMode,
  completedDraft,
}: BotCreationRitualProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const words = useMemo(() => creationWords(prompt), [prompt]);
  const completed = completedDraft !== null;
  const stage = CREATION_STAGES[stageIndex] ?? CREATION_STAGES[0];
  const faceEyes = completedDraft?.face.eyeCharacter?.trim() || "•";
  const faceMouth = completedDraft?.face.mouthCharacter?.trim() || "―";
  const ritualStyle = {
    "--creation-bot-color": completedDraft?.color ?? "#8f7cff",
  } as CSSProperties;

  useEffect(() => {
    if (completed) return;
    const interval = window.setInterval(() => {
      setStageIndex((current) =>
        Math.min(current + 1, CREATION_STAGES.length - 1),
      );
    }, 2_450);
    return () => window.clearInterval(interval);
  }, [completed]);

  return (
    <div
      className={styles.ritual}
      data-completed={completed}
      style={ritualStyle}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy={!completed}
    >
      <div className={styles.ambient} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Create new bot</span>
          <h3 id="bot-generator-title">
            {completed ? `${completedDraft.name} is here.` : "A new spectrum is forming."}
          </h3>
        </div>
        <span className={styles.modeBadge} data-mode={responseMode}>
          {responseMode.toUpperCase()}
        </span>
      </header>

      <div className={styles.scene} aria-hidden="true">
        <div className={styles.sourceColumn}>
          <span className={styles.sourceLabel}>Your spark</span>
          <div className={styles.sourceWords}>
            {words.map((word, index) => (
              <span
                key={`${word}-${index}`}
                className={styles.sourceWord}
                style={
                  {
                    "--word-index": index,
                    "--word-offset": `${(index % 2) * 13}px`,
                  } as CSSProperties
                }
              >
                {word}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.refractionField}>
          <span className={styles.inputBeam} />
          <PrismOrb className={styles.prismOrb} />
          <span className={styles.colorBeam} data-color="rose" />
          <span className={styles.colorBeam} data-color="amber" />
          <span className={styles.colorBeam} data-color="cyan" />
          <span className={styles.colorBeam} data-color="violet" />
        </div>

        <div className={styles.assemblyColumn}>
          <span className={styles.assemblyLabel}>
            {completed ? "Editable draft" : "Identity forming"}
          </span>
          <div className={styles.assemblyRig}>
            <span className={styles.orbit} data-orbit="outer" />
            <span className={styles.orbit} data-orbit="inner" />
            {Array.from({ length: 8 }, (_, index) => (
              <span
                key={index}
                className={styles.fragment}
                style={
                  {
                    "--fragment-index": index,
                    "--fragment-width": `${4 + (index % 3) * 2}px`,
                    "--fragment-height": `${9 + (index % 4) * 3}px`,
                  } as CSSProperties
                }
              />
            ))}
            <div className={styles.botForm}>
              <span className={styles.botAntenna} />
              <span className={styles.botEar} data-side="left" />
              <span className={styles.botEar} data-side="right" />
              <div className={styles.botFace}>
                {completed ? (
                  <>
                    <span className={styles.botEyes}>
                      {faceEyes} {faceEyes}
                    </span>
                    <span className={styles.botMouth}>{faceMouth}</span>
                  </>
                ) : (
                  <span className={styles.botScan} />
                )}
              </div>
              <span className={styles.botCore} />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.progressCopy}>
        <span className={styles.progressMark} aria-hidden="true" />
        <div>
          <strong>
            {completed ? "Ready for your direction" : stage.label}
          </strong>
          <p>
            {completed
              ? "Opening Avatar Studio, where every detail remains yours to change."
              : stage.detail}
          </p>
        </div>
      </div>

      <ol className={styles.stageRail} aria-hidden="true">
        {CREATION_STAGES.map((entry, index) => (
          <li
            key={entry.label}
            data-state={
              completed || index < stageIndex
                ? "complete"
                : index === stageIndex
                  ? "active"
                  : "waiting"
            }
          >
            <span />
            {entry.label.replace(/^(Reading|Shaping|Finding|Assembling) /u, "")}
          </li>
        ))}
      </ol>

      <p className={styles.privacyNote}>
        Nothing is saved until you choose Create bot.
      </p>
    </div>
  );
}
