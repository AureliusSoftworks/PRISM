"use client";

import { useEffect, useState } from "react";

/**
 * Local countdown that polls only this leaf, so DebateExperience does not
 * re-render on every clock tick.
 */
export function DebateDeadlineCountdown(props: {
  deadlineMs: number;
  intervalMs?: number;
  className?: string;
  suffix?: string;
  "aria-label"?: string;
}): React.JSX.Element {
  const intervalMs = props.intervalMs ?? 250;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    setNowMs(Date.now());
    const interval = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(interval);
  }, [intervalMs, props.deadlineMs]);
  const remainingSeconds = Math.max(
    0,
    Math.ceil((props.deadlineMs - nowMs) / 1_000),
  );
  return (
    <span
      className={props.className}
      aria-label={
        props["aria-label"] ?? `${remainingSeconds} seconds remaining`
      }
    >
      {remainingSeconds}
      {props.suffix ?? "s"}
    </span>
  );
}
