"use client";

import { useEffect, useState } from "react";
import styles from "./speechIntentReveal.module.css";

export type SpeechIntentRevealMode =
  | "chat"
  | "zen"
  | "coffee"
  | "signal"
  | "debate"
  | "story";

export type SpeechIntentRevealRequest = <T>(
  path: string,
  options?: RequestInit,
) => Promise<T>;

export interface SpeechIntentRevealProps {
  available?: boolean;
  mode: SpeechIntentRevealMode;
  scopeId: string | null | undefined;
  recordId: string | null | undefined;
  request: SpeechIntentRevealRequest;
  className?: string;
}

export function SpeechIntentReveal(
  props: SpeechIntentRevealProps,
): React.JSX.Element | null {
  const [intendedSpeech, setIntendedSpeech] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    setIntendedSpeech(null);
    setLoading(false);
    setUnavailable(false);
  }, [props.mode, props.scopeId, props.recordId]);

  if (!props.available || !props.scopeId || !props.recordId) return null;

  const reveal = async (): Promise<void> => {
    if (loading || intendedSpeech) return;
    setLoading(true);
    setUnavailable(false);
    try {
      const response = await props.request<{
        ok: true;
        intendedSpeech: string;
      }>("/api/speech-intent/reveal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: props.mode,
          scopeId: props.scopeId,
          recordId: props.recordId,
        }),
      });
      const clean = response.intendedSpeech?.trim();
      if (!clean) throw new Error("Speech meaning is unavailable.");
      setIntendedSpeech(clean);
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={[styles.reveal, props.className].filter(Boolean).join(" ")}
      data-speech-intent-reveal="true"
    >
      {intendedSpeech ? (
        <div className={styles.card} data-speech-intent-card="true">
          <div className={styles.cardHeader}>
            <span>What they meant</span>
            <button
              type="button"
              className={styles.close}
              onClick={() => setIntendedSpeech(null)}
              aria-label="Close private meaning"
            >
              ×
            </button>
          </div>
          <p>{intendedSpeech}</p>
        </div>
      ) : (
        <button
          type="button"
          className={styles.trigger}
          onClick={() => void reveal()}
          disabled={loading || unavailable}
          aria-busy={loading ? true : undefined}
        >
          <span aria-hidden="true">◈</span>
          {loading
            ? "Refracting…"
            : unavailable
              ? "Meaning unavailable"
              : "What they meant"}
        </button>
      )}
    </div>
  );
}

export default SpeechIntentReveal;
