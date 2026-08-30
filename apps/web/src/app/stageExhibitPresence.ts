import {
  useCallback,
  useEffect,
  useState,
} from "react";

export const STAGE_EXHIBIT_MOTION_DURATION_MS = 520;

export type StageExhibitMotionState = "entering" | "present" | "exiting";

export type StageExhibitPresenceItem<T> = Readonly<{
  id: string;
  value: T;
  motionState: StageExhibitMotionState;
}>;

export type StageExhibitPresenceTarget<T> = Readonly<{
  id: string;
  value: T;
}>;

export function updateStageExhibitPresence<T>(
  current: readonly StageExhibitPresenceItem<T>[],
  next: StageExhibitPresenceTarget<T> | null,
): readonly StageExhibitPresenceItem<T>[] {
  let changed = false;
  let nextPresent = false;
  const updated = current.map((item) => {
    if (next && item.id === next.id) {
      nextPresent = true;
      const motionState =
        item.motionState === "exiting" ? "entering" : item.motionState;
      if (item.value === next.value && motionState === item.motionState) {
        return item;
      }
      changed = true;
      return { id: next.id, value: next.value, motionState };
    }
    if (item.motionState === "exiting") return item;
    changed = true;
    return { ...item, motionState: "exiting" as const };
  });

  if (next && !nextPresent) {
    changed = true;
    updated.push({ ...next, motionState: "entering" });
  }

  return changed ? updated : current;
}

export function finishStageExhibitMotion<T>(
  current: readonly StageExhibitPresenceItem<T>[],
  id?: string,
): readonly StageExhibitPresenceItem<T>[] {
  let changed = false;
  const updated = current.flatMap((item) => {
    if (id && item.id !== id) return [item];
    if (item.motionState === "exiting") {
      changed = true;
      return [];
    }
    if (item.motionState === "entering") {
      changed = true;
      return [{ ...item, motionState: "present" as const }];
    }
    return [item];
  });
  return changed ? updated : current;
}

/**
 * Keeps a removed stage exhibit mounted just long enough to animate it out.
 * Camera/view props stay outside this lifecycle so camera cuts never restart
 * an exhibit's entrance animation.
 */
export function useStageExhibitPresence<T>(
  next: StageExhibitPresenceTarget<T> | null,
): Readonly<{
  items: readonly StageExhibitPresenceItem<T>[];
  finishMotion: (id: string) => void;
}> {
  const [items, setItems] = useState<readonly StageExhibitPresenceItem<T>[]>(
    () => updateStageExhibitPresence([], next),
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setItems((current) => updateStageExhibitPresence(current, next));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [next]);

  useEffect(() => {
    if (items.every((item) => item.motionState === "present")) return;
    const timer = window.setTimeout(() => {
      setItems((current) => finishStageExhibitMotion(current));
    }, STAGE_EXHIBIT_MOTION_DURATION_MS + 80);
    return () => window.clearTimeout(timer);
  }, [items]);

  const finishMotion = useCallback((id: string) => {
    setItems((current) => finishStageExhibitMotion(current, id));
  }, []);

  const renderedItems = next
    ? items.map((item) =>
        item.id === next.id ? { ...item, value: next.value } : item,
      )
    : items;

  return { items: renderedItems, finishMotion };
}
