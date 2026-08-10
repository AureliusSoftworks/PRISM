"use client";

import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import PrismCompanion from "../PrismCompanion";
import { PrismBlockingLoader } from "../PrismBlockingLoader";
import { PrismRefractTarget } from "../prismRefract";
import {
  registerPrismSoftSynthesisJobs,
  setPrismSoftSynthesisExpanded,
} from "../prismSoftSynthesisUi";
import styles from "./prismWieldFixture.module.css";

const CANDIDATES = [
  "A rainstorm argues with a lighthouse about who owns the horizon.",
  "Five polite rivals discover that the coffee machine is keeping score.",
] as const;

const subscribeMounted = (): (() => void) => () => undefined;

export function PrismWieldFixture({
  homeDocked,
  softSynthesis,
  theme,
}: {
  homeDocked: boolean;
  softSynthesis: boolean;
  theme: "dark" | "light";
}): React.JSX.Element {
  const [premise, setPremise] = useState(
    "An impossible dinner party begins exactly on time.",
  );
  const [candidateIndex, setCandidateIndex] = useState(0);
  const [magicDirection, setMagicDirection] = useState("");
  const [homeSlotShifted, setHomeSlotShifted] = useState(false);
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

  useEffect(() => {
    registerPrismSoftSynthesisJobs(
      "qa-prism-wield-soft-synthesis",
      softSynthesis ? 1 : 0,
    );
    if (softSynthesis) setPrismSoftSynthesisExpanded(true);
    return () => {
      registerPrismSoftSynthesisJobs("qa-prism-wield-soft-synthesis", 0);
    };
  }, [softSynthesis]);

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
  const magicTarget = useMemo(
    () => ({
      id: "qa-prism-wield-magic",
      kind: "magic" as const,
      label: "Generate a debate",
      run: (direction: string) => setMagicDirection(direction),
    }),
    [],
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
        {homeDocked ? (
          <div className={styles.homeControls}>
            <button
              type="button"
              className={styles.nativeControl}
              data-testid="qa-prism-shift-home-slot"
              onClick={() => setHomeSlotShifted((current) => !current)}
            >
              Move Home slot
            </button>
            <span
              className={styles.homeSlot}
              data-prism-chat-home-orb-slot="true"
              data-shifted={homeSlotShifted ? "true" : undefined}
              aria-label="Prism Home slot"
            />
          </div>
        ) : null}
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
        <PrismRefractTarget target={magicTarget}>
          {(binding) => (
            <button
              {...binding}
              type="button"
              className={styles.nativeControl}
              data-testid="qa-prism-magic-control"
            >
              Generate a debate
            </button>
          )}
        </PrismRefractTarget>
        {magicDirection ? (
          <p data-testid="qa-prism-magic-direction">{magicDirection}</p>
        ) : null}
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
        <label className={styles.target}>
          <span>Ordinary contextual input · dynamically discovered</span>
          <input
            data-testid="qa-prism-contextual-input"
            placeholder="Name this moment"
          />
        </label>
      </section>
      {mounted ? (
        <>
          <PrismCompanion
            accountKey="qa-prism-wield"
            keyboardShortcut={homeDocked ? "Alt+Space" : "Control+Space"}
            surface={
              homeDocked
                ? { surfaceId: "home" }
                : { surfaceId: "signal", signalShowId: "qa-show" }
            }
            chatHomeHeroDocked={homeDocked}
            onAction={() => undefined}
          />
          <PrismBlockingLoader
            open={softSynthesis}
            placement="docked"
            title="Soft synthesis"
            detail="A visual is taking shape while the workspace stays live."
            stepLabel="Generating image"
            progress={0.42}
            footer="Wield or throw Prism while this continues."
          />
        </>
      ) : null}
    </main>
  );
}
