"use client";

import { useState } from "react";
import styles from "./debateMysteryV2.module.css";

export function WhodunnitCaseCheckActions(props: {
  busy: boolean;
  hasAccused: boolean;
  error: string | null;
  onCheck: () => Promise<void>;
}): React.JSX.Element {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className={styles.caseCheckActions} aria-label="Conclude without Court">
      {confirming ? (
        <div role="group" aria-labelledby="case-check-confirmation-title">
          <h3 id="case-check-confirmation-title">Skip Court and conclude this Case?</h3>
          <p>This skips Court and permanently concludes this Run of the Case. Only your selected accused are checked; method, motive, and opportunity are not graded.</p>
          <button type="button" disabled={props.busy} onClick={() => setConfirming(false)}>Cancel — keep editing</button>
          <button type="button" className={styles.primaryAction} disabled={props.busy || !props.hasAccused} onClick={() => void props.onCheck()}>
            {props.busy ? "Checking case…" : "Confirm — check and conclude"}
          </button>
        </div>
      ) : (
        <button type="button" data-tutorial-target="mystery-v2-check-case" disabled={props.busy || !props.hasAccused} onClick={() => setConfirming(true)}>Check my case and conclude</button>
      )}
      {props.error ? <p className={styles.error} role="alert">{props.error}</p> : null}
    </section>
  );
}

export function WhodunnitTranscriptCopyButton(props: {
  state: "idle" | "copying" | "copied" | "failed";
  onCopy: () => Promise<void>;
}): React.JSX.Element {
  return <button type="button" data-tutorial-target="debate-copy-transcript" disabled={props.state === "copying"} onClick={() => void props.onCopy()}>
    {props.state === "copying" ? "Copying transcript…" : props.state === "copied" ? "Transcript copied" : props.state === "failed" ? "Copy failed — try again" : "Copy verbose transcript"}
  </button>;
}
