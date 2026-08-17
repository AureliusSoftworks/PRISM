"use client";

import type { CoffeeContextSpark } from "@localai/shared";
import { Coffee, Drama, Radio, X } from "lucide-react";
import styles from "./page.module.css";

export interface CoffeeContextSparkLayerProps {
  sparks: readonly CoffeeContextSpark[];
  armedSparkId: string | null;
  receded: boolean;
  showCue?: boolean;
  disabled?: boolean;
  onArm: (spark: CoffeeContextSpark) => void;
  onDismiss: (spark: CoffeeContextSpark) => void;
}

function AppletMark({ applet }: { applet: CoffeeContextSpark["sourceApplet"] }) {
  if (applet === "signal") return <Radio aria-hidden="true" />;
  if (applet === "debate") return <Drama aria-hidden="true" />;
  return <Coffee aria-hidden="true" />;
}

export function CoffeeContextSparkLayer({
  sparks,
  armedSparkId,
  receded,
  showCue = false,
  disabled = false,
  onArm,
  onDismiss,
}: CoffeeContextSparkLayerProps): React.JSX.Element | null {
  if (sparks.length === 0) return null;
  return (
    <aside
      className={styles.coffeeContextSparkLayer}
      data-receded={receded ? "true" : undefined}
      data-tutorial-target="coffee-context-sparks"
      aria-label="Conversation sparks from earlier sessions"
      aria-live="polite"
    >
      {showCue ? (
        <p className={styles.coffeeContextSparkCue} role="status">
          Past sessions can return as conversation sparks.
        </p>
      ) : null}
      {sparks.map((spark, index) => {
        const armed = spark.id === armedSparkId || spark.state === "armed";
        return (
          <div
            key={spark.id}
            className={styles.coffeeContextSpark}
            data-position={index % 3}
            data-armed={armed ? "true" : undefined}
            style={
              {
                "--coffee-context-spark-color":
                  spark.inspiredBotColor || "var(--accent, #8bd8ff)",
              } as React.CSSProperties
            }
            data-tutorial-target={index === 0 ? "coffee-context-spark-first" : undefined}
          >
            <button
              type="button"
              className={styles.coffeeContextSparkMain}
              disabled={disabled}
              onClick={() => onArm(spark)}
              aria-pressed={armed}
              aria-label={`${spark.prompt}. From ${spark.sourceApplet}, with ${spark.inspiredBotName}.`}
            >
              <span className={styles.coffeeContextSparkApplet}>
                <AppletMark applet={spark.sourceApplet} />
              </span>
              <span className={styles.coffeeContextSparkBot} aria-hidden="true">
                {spark.inspiredBotGlyph?.trim() || spark.inspiredBotName.slice(0, 1)}
              </span>
              <span className={styles.coffeeContextSparkCopy}>
                <strong>{spark.prompt}</strong>
                <small>{spark.sourceTitle}</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.coffeeContextSparkDismiss}
              disabled={disabled}
              onClick={() => onDismiss(spark)}
              aria-label={`Dismiss ${spark.inspiredBotName}'s ${spark.sourceApplet} spark`}
              title="Dismiss spark"
            >
              <X aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </aside>
  );
}
