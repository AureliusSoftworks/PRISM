import type { CSSProperties } from "react";
import { sentenceCaseActionText } from "./zenActions";
import styles from "./SignalVoiceActionText.module.css";

export type SignalVoiceActionPhase = "entering" | "holding" | "exiting";

export interface SignalVoiceActionTextProps {
  action: string;
  phase: SignalVoiceActionPhase;
  opacity: number;
  accent?: string | null;
}

/** The Signal live nonverbal-action presentation, shared by live performers. */
export function SignalVoiceActionText({
  action,
  phase,
  opacity,
  accent,
}: SignalVoiceActionTextProps): React.JSX.Element {
  return (
    <span
      className={styles.signalVoiceActionText}
      data-signal-voice-action="true"
      data-phase={phase}
      style={{
        ["--signal-voice-action-opacity" as string]: opacity,
        ...(accent ? { ["--botcast-studio-accent" as string]: accent } : {}),
      } as CSSProperties}
      aria-hidden="true"
    >
      *{sentenceCaseActionText(action)}*
    </span>
  );
}
