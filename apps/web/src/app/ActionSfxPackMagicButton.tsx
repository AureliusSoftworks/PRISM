"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import {
  ACTION_SFX_PACK_CLIP_COUNT,
  type ActionSfxPackOwnerKind,
  type ActionSfxPackSummaryV1,
} from "@localai/shared";
import {
  fetchActionSfxPackSummary,
  generateActionSfxPackWithProgress,
  rememberActionSfxPackPresence,
} from "./action-sfx-pack-client";
import styles from "./page.module.css";

export function ActionSfxPackMagicButton({
  ownerKind,
  ownerId,
  ownerLabel,
  personaSnippet,
  className,
}: {
  ownerKind: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  ownerLabel: string;
  personaSnippet?: string | null;
  className?: string;
}): React.JSX.Element {
  const [pack, setPack] = useState<ActionSfxPackSummaryV1 | null>(null);
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (ownerKind === "bot" && !ownerId?.trim()) {
      setPack(null);
      return;
    }
    const next = await fetchActionSfxPackSummary({
      origin: window.location.origin,
      ownerKind,
      ownerId,
    });
    setPack(next);
  }, [ownerId, ownerKind]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const generate = async (): Promise<void> => {
    if (busy || typeof window === "undefined") return;
    if (ownerKind === "bot" && !ownerId?.trim()) {
      setStatus("Save this bot before generating an action pack.");
      return;
    }
    if (
      pack &&
      !window.confirm(
        "Regenerate replaces all 21 local action sounds for this owner. Continue?",
      )
    ) {
      return;
    }
    setBusy(true);
    setStatus(null);
    setProgressLabel(`0/${ACTION_SFX_PACK_CLIP_COUNT}…`);
    try {
      const next = await generateActionSfxPackWithProgress({
        origin: window.location.origin,
        ownerKind,
        ownerId,
        ownerLabel,
        personaSnippet: personaSnippet ?? undefined,
        onEvent: (event) => {
          if (event.type === "progress") {
            setProgressLabel(`${event.done}/${event.total}…`);
          } else if (event.type === "start") {
            setProgressLabel(`0/${event.total}…`);
          }
        },
      });
      setPack(next);
      rememberActionSfxPackPresence(
        ownerKind,
        ownerKind === "player" ? "player" : (ownerId ?? ""),
        true,
      );
      setStatus("Action pack ready on this machine.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Could not generate the action pack.",
      );
    } finally {
      setBusy(false);
      setProgressLabel(null);
    }
  };

  const readyLabel = pack
    ? `Ready · ${new Date(pack.createdAt).toLocaleDateString()}`
    : null;

  return (
    <div
      className={`${styles.actionSfxPackMagic}${className ? ` ${className}` : ""}`}
      data-action-sfx-pack-magic="true"
      data-owner-kind={ownerKind}
    >
      <button
        type="button"
        className={styles.actionSfxPackMagicButton}
        disabled={busy || (ownerKind === "bot" && !ownerId?.trim())}
        onClick={() => void generate()}
        aria-label={
          pack
            ? "Regenerate local action SFX pack"
            : "Generate local action SFX pack"
        }
        title="Optional local Action SFX pack — laughs, sighs, bodily bits. Stays on this machine; not exported with the bot."
      >
        <Sparkles size={13} strokeWidth={2.3} aria-hidden="true" />
        <span>
          {busy
            ? (progressLabel ?? "Generating…")
            : pack
              ? "Regenerate action pack"
              : "Generate action pack"}
        </span>
      </button>
      {readyLabel ? (
        <small className={styles.actionSfxPackMagicReady}>{readyLabel}</small>
      ) : (
        <small className={styles.actionSfxPackMagicHint}>
          Optional · local Foley for Fancy Actions &amp; Coffee
        </small>
      )}
      {status ? (
        <small className={styles.actionSfxPackMagicStatus} role="status">
          {status}
        </small>
      ) : null}
    </div>
  );
}
