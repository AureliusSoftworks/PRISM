"use client";

import type { CSSProperties, ReactNode } from "react";
import type { BotGeneratedDraftV1 } from "@localai/shared";
import {
  botAvatarFoundryAtmosphere,
  botAvatarFoundryStatus,
  normalizeBotAvatarFoundryOrigin,
  type BotAvatarFoundryOrigin,
  type BotAvatarFoundryPhase,
  type BotAvatarFoundryTheme,
} from "./botAvatarFoundry";
import { PrismOrb } from "./PrismOrb";
import styles from "./BotCreationRitual.module.css";

export interface BotCreationRitualProps {
  phase: BotAvatarFoundryPhase;
  prompt: string;
  responseMode: "local" | "online" | "auto";
  completedDraft: BotGeneratedDraftV1 | null;
  botPreview: ReactNode;
  theme: BotAvatarFoundryTheme;
  companionOrigin?: BotAvatarFoundryOrigin | null;
}

export function BotCreationRitual({
  phase,
  prompt,
  responseMode,
  completedDraft,
  botPreview,
  theme,
  companionOrigin,
}: BotCreationRitualProps): React.JSX.Element {
  const origin = normalizeBotAvatarFoundryOrigin(companionOrigin);
  const atmosphere = botAvatarFoundryAtmosphere(completedDraft?.color, theme);
  const status = botAvatarFoundryStatus(phase, completedDraft?.name);
  const ritualStyle = {
    "--creation-bot-color": atmosphere.color,
    "--prism-origin-dx": `${origin.x * 100 - 50}vw`,
    "--prism-origin-dy": `${origin.y * 100 - 39}dvh`,
  } as CSSProperties;

  return (
    <div
      className={styles.ritual}
      data-foundry-phase={phase}
      data-completed={completedDraft ? "true" : undefined}
      data-atmosphere-source={atmosphere.source}
      data-theme={theme}
      data-companion-origin={origin.available ? "live" : "remembered"}
      style={ritualStyle}
      aria-busy={phase === "handoff" || phase === "generation"}
    >
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.foundryGrid} aria-hidden="true" />
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Avatar Foundry</span>
          <h3 id="bot-generator-title">
            {phase === "brief" || phase === "error"
              ? "Give the shell a spark"
              : phase === "awakening"
                ? `${completedDraft?.name ?? "A new bot"} is waking`
                : "Creation chamber"}
          </h3>
        </div>
        <span className={styles.modeBadge} data-mode={responseMode}>
          {responseMode.toUpperCase()}
        </span>
      </header>

      <div className={styles.chute} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <div className={styles.scene}>
        <div className={styles.refractionStation} aria-hidden="true">
          <span className={styles.refractionRing} data-ring="outer" />
          <span className={styles.refractionRing} data-ring="inner" />
          <span className={styles.refractionBeam} data-beam="left" />
          <span className={styles.refractionBeam} data-beam="right" />
          <div className={styles.prismTransit}>
            <PrismOrb aura={false} className={styles.prismOrb} />
          </div>
        </div>

        <div className={styles.botDropRig}>
          <div className={styles.botPreview}>{botPreview}</div>
          <div className={styles.cradle} aria-hidden="true">
            <span data-side="left" />
            <span data-side="right" />
          </div>
          <span className={styles.floorGlow} aria-hidden="true" />
        </div>
      </div>

      <div className={styles.statusLine} role="status" aria-live="polite" aria-atomic="true">
        <span aria-hidden="true" />
        <strong>{status}</strong>
      </div>
      <p className={styles.privacyNote}>
        {prompt.trim()
          ? "Nothing is saved until you choose Create bot."
          : "The shell remains dark until you give it direction."}
      </p>
    </div>
  );
}
