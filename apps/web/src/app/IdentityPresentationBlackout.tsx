import { useState } from "react";
import styles from "./identityPresentationBlackout.module.css";

export default function IdentityPresentationBlackout({
  active,
  occurredAt,
  nowMs,
}: {
  active: boolean;
  occurredAt?: string | null;
  nowMs?: number;
}): React.JSX.Element | null {
  const [mountedAtMs] = useState(() => Date.now());
  if (!active) {
    return null;
  }

  const occurredAtMs = occurredAt ? Date.parse(occurredAt) : Number.NaN;
  const presentationNowMs =
    typeof nowMs === "number" && Number.isFinite(nowMs) ? nowMs : mountedAtMs;
  const elapsedMs = Number.isFinite(occurredAtMs)
    ? Math.max(0, presentationNowMs - occurredAtMs)
    : 0;

  return (
    <span
      className={styles.blackout}
      data-identity-presentation-blackout-overlay="true"
      style={{ animationDelay: `${-elapsedMs}ms` }}
      aria-hidden="true"
    />
  );
}
