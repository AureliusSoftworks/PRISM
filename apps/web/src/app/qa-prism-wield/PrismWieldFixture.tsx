"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import PrismCompanion from "../PrismCompanion";
import { PrismRefractTarget } from "../prismRefract";
import styles from "./prismWieldFixture.module.css";

const CANDIDATES = [
  "A rainstorm argues with a lighthouse about who owns the horizon.",
  "Five polite rivals discover that the coffee machine is keeping score.",
] as const;

const subscribeMounted = (): (() => void) => () => undefined;

export function PrismWieldFixture({
  theme,
}: {
  theme: "dark" | "light";
}): React.JSX.Element {
  const [premise, setPremise] = useState(
    "An impossible dinner party begins exactly on time.",
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const mounted = useSyncExternalStore(
    subscribeMounted,
    () => true,
    () => false,
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [theme]);

  const target = useMemo(
    () => ({
      id: "qa-prism-wield-premise",
      kind: "field" as const,
      label: "episode premise",
      read: () => premise,
      preview: setPremise,
      accept: setPremise,
      generate: async () => {
        const next = CANDIDATES[candidateIndex % CANDIDATES.length]!;
        setCandidateIndex((current) => current + 1);
        return next;
      },
    }),
    [candidateIndex, premise],
  );

  return (
    <main className={styles.shell} data-theme-checkpoint={theme}>
      <header>
        <span>Presence QA</span>
        <h1>Wield Prism</h1>
        <p>
          Hold the platform modifier, guide Prism over the registered premise,
          then release or capture it.
        </p>
      </header>
      <section className={styles.stage}>
        <div className={styles.pyramid} aria-hidden="true">
          △
        </div>
        <PrismRefractTarget target={target}>
          {(binding) => (
            <label className={styles.target}>
              <span>Signal premise · registered Refract target</span>
              <textarea
                {...binding}
                value={premise}
                onChange={(event) => setPremise(event.target.value)}
                onClick={(event) => {
                  const current = Number(
                    event.currentTarget.dataset.nativeClicks ?? "0",
                  );
                  event.currentTarget.dataset.nativeClicks = String(
                    current + 1,
                  );
                }}
                rows={4}
              />
            </label>
          )}
        </PrismRefractTarget>
        <button
          type="button"
          className={styles.nativeControl}
          data-testid="qa-prism-native-control"
          onClick={(event) => {
            event.currentTarget.dataset.clicked = "true";
          }}
        >
          Ordinary native control
        </button>
      </section>
      {mounted ? (
        <PrismCompanion
          accountKey="qa-prism-wield"
          keyboardShortcut="Control+Space"
          surface={{ surfaceId: "signal", signalShowId: "qa-show" }}
          onAction={() => undefined}
        />
      ) : null}
    </main>
  );
}
