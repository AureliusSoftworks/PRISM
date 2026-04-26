import type { Metadata } from "next";
import Link from "next/link";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "PRISM | Local-first AI, softly held",
  description:
    "A calm landing page for PRISM, the local-first AI workspace built around privacy, clarity, and human-paced interaction.",
};

const pillars = [
  {
    eyebrow: "Local by default",
    title: "Your thinking stays close.",
    body: "PRISM treats private work as something to shelter, not something to harvest.",
  },
  {
    eyebrow: "Many voices",
    title: "Bots become lenses.",
    body: "Switch perspectives without losing the thread. Each assistant refracts the same work differently.",
  },
  {
    eyebrow: "Human pace",
    title: "Calm beats novelty.",
    body: "The interface favors legibility, small rituals, and decisions you can understand later.",
  },
] as const;

const workflow = [
  "Choose a lens",
  "Ask the room",
  "Compare the light",
  "Keep what helps",
] as const;

export default function PrismPage() {
  return (
    <main className={styles.pageShell}>
      <section className={styles.hero} aria-labelledby="prism-title">
        <div className={styles.orb} aria-hidden="true">
          <span />
        </div>

        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Local-first AI workspace</p>
          <h1 id="prism-title">PRISM turns one thought into many usable angles.</h1>
          <p className={styles.lede}>
            A private, human-paced place to talk with specialized bots, compare
            perspectives, and keep the work that actually clarifies the next move.
          </p>

          <div className={styles.actions}>
            <Link className={styles.primaryAction} href="/">
              Enter PRISM
            </Link>
            <a className={styles.secondaryAction} href="#principles">
              See principles
            </a>
          </div>
        </div>

        <aside className={styles.signalCard} aria-label="PRISM signal preview">
          <p className={styles.cardLabel}>Signal</p>
          <div className={styles.spectrum} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <p>
            One prompt enters. Five colors return. You decide which refraction is
            true enough to keep.
          </p>
        </aside>
      </section>

      <section className={styles.pillars} id="principles" aria-label="PRISM principles">
        {pillars.map((pillar) => (
          <article className={styles.pillar} key={pillar.title}>
            <p>{pillar.eyebrow}</p>
            <h2>{pillar.title}</h2>
            <span>{pillar.body}</span>
          </article>
        ))}
      </section>

      <section className={styles.workflow} aria-labelledby="workflow-title">
        <div>
          <p className={styles.kicker}>A softer loop</p>
          <h2 id="workflow-title">Work through uncertainty without turning it into noise.</h2>
        </div>

        <ol className={styles.workflowSteps}>
          {workflow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
