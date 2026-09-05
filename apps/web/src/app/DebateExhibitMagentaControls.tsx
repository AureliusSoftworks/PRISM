"use client";

import { useCallback, useEffect, useState } from "react";
import type { ImageAssetSet } from "@localai/shared";
import styles from "./DebateExperience.module.css";

type MagentaBusy = "apply" | "undo" | null;

export interface DebateExhibitMagentaState {
  assetSetId: string | null;
  magentaPassCount: number;
  magentaUndoAvailable: boolean;
}

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok || !payload) {
    throw new Error(payload?.error ?? "Magenta cleanup is unavailable.");
  }
  return payload;
}

/**
 * Resolve library magenta bookkeeping for an exhibit sprite image id.
 */
export async function loadDebateExhibitMagentaState(
  imageId: string | null | undefined,
): Promise<DebateExhibitMagentaState> {
  if (!imageId) {
    return {
      assetSetId: null,
      magentaPassCount: 0,
      magentaUndoAvailable: false,
    };
  }
  try {
    const result = await readJson<{ asset: ImageAssetSet }>(
      await fetch(`/api/assets/for-image/${encodeURIComponent(imageId)}`, {
        credentials: "include",
      }),
    );
    return {
      assetSetId: result.asset.id,
      magentaPassCount: result.asset.magentaPassCount,
      magentaUndoAvailable: result.asset.magentaUndoAvailable,
    };
  } catch {
    return {
      assetSetId: null,
      magentaPassCount: 0,
      magentaUndoAvailable: false,
    };
  }
}

export function DebateExhibitMagentaControls(props: {
  imageId: string | null;
  assetSetId: string | null;
  magentaPassCount: number;
  magentaUndoAvailable: boolean;
  disabled?: boolean;
  onApplied: (next: DebateExhibitMagentaState & { updatedAt: string }) => void;
  onError: (message: string) => void;
}): React.JSX.Element | null {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<MagentaBusy>(null);

  useEffect(() => {
    setConfirming(false);
  }, [props.assetSetId, props.imageId]);

  const applyPass = useCallback(async (): Promise<void> => {
    if (!props.assetSetId || busy) return;
    setBusy("apply");
    try {
      const result = await readJson<{
        asset: ImageAssetSet;
        result: { changedPixels: number; passCount: number };
      }>(
        await fetch(
          `/api/assets/${encodeURIComponent(props.assetSetId)}/magenta-pass`,
          { method: "POST", credentials: "include", body: "{}" },
        ),
      );
      setConfirming(false);
      props.onApplied({
        assetSetId: result.asset.id,
        magentaPassCount: result.asset.magentaPassCount,
        magentaUndoAvailable: result.asset.magentaUndoAvailable,
        updatedAt: result.asset.updatedAt,
      });
    } catch (caught) {
      props.onError(
        caught instanceof Error
          ? caught.message
          : "The magenta pass could not be applied.",
      );
    } finally {
      setBusy(null);
    }
  }, [busy, props]);

  const undoPass = useCallback(async (): Promise<void> => {
    if (!props.assetSetId || !props.magentaUndoAvailable || busy) return;
    setBusy("undo");
    try {
      const result = await readJson<{ asset: ImageAssetSet }>(
        await fetch(
          `/api/assets/${encodeURIComponent(props.assetSetId)}/magenta-pass/undo`,
          { method: "POST", credentials: "include", body: "{}" },
        ),
      );
      setConfirming(false);
      props.onApplied({
        assetSetId: result.asset.id,
        magentaPassCount: result.asset.magentaPassCount,
        magentaUndoAvailable: result.asset.magentaUndoAvailable,
        updatedAt: result.asset.updatedAt,
      });
    } catch (caught) {
      props.onError(
        caught instanceof Error
          ? caught.message
          : "The magenta pass could not be undone.",
      );
    } finally {
      setBusy(null);
    }
  }, [busy, props]);

  if (!props.imageId || !props.assetSetId) return null;

  return (
    <div
      className={styles.exhibitMagentaControls}
      aria-label="Magenta cleanup"
    >
      {confirming ? (
        <div role="group" aria-label="Confirm magenta pass">
          <span>Apply one local magenta pass to this exhibit sprite?</span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy !== null || props.disabled}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void applyPass()}
            disabled={busy !== null || props.disabled}
          >
            {busy === "apply" ? "Applying…" : "Apply pass"}
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy !== null || props.disabled}
          >
            Reduce magenta
          </button>
          {props.magentaUndoAvailable ? (
            <button
              type="button"
              onClick={() => void undoPass()}
              disabled={busy !== null || props.disabled}
            >
              {busy === "undo"
                ? "Undoing…"
                : `Undo last pass (${props.magentaPassCount})`}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
