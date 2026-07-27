"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { prismCompanionModifierPresentation } from "./prismCompanionState.ts";

export const PRISM_REFRACT_TARGET_ATTRIBUTE = "data-prism-refract-id";

export type PrismRefractInvocation =
  | "wield-click"
  | "focused-shortcut"
  | "orb-drop";

export interface PrismRefractOrigin {
  clientX: number;
  clientY: number;
}

export interface PrismRefractGenerationInput {
  currentValue: string;
  rejectedValues: readonly string[];
  signal: AbortSignal;
}

interface PrismRefractTargetBase {
  id: string;
  label: string;
  disabled?: () => boolean;
}

export interface PrismRefractFieldTarget extends PrismRefractTargetBase {
  kind: "field";
  read: () => string;
  preview: (value: string) => void;
  accept: (value: string) => void | Promise<void>;
  generate: (input: PrismRefractGenerationInput) => Promise<string>;
}

export interface PrismRefractChoice {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface PrismRefractChoiceTarget extends PrismRefractTargetBase {
  kind: "choice";
  read: () => string;
  preview: (value: string) => void;
  accept: (value: string) => void | Promise<void>;
  choices: () => readonly PrismRefractChoice[];
}

export interface PrismRefractMagicTarget extends PrismRefractTargetBase {
  kind: "magic";
  run: (direction: string) => void | Promise<void>;
}

export type PrismRefractTarget =
  | PrismRefractFieldTarget
  | PrismRefractChoiceTarget
  | PrismRefractMagicTarget;

export interface RegisteredPrismRefractTarget {
  target: PrismRefractTarget;
  element: HTMLElement;
}

export interface PrismRefractRequest {
  targetId: string;
  invocation: PrismRefractInvocation;
  origin?: PrismRefractOrigin;
}

type TargetRegistration = {
  descriptor: () => PrismRefractTarget;
  element: () => HTMLElement | null;
};

const registrations = new Map<string, TargetRegistration>();
const requestListeners = new Set<(request: PrismRefractRequest) => void>();

export function registerPrismRefractTarget(
  id: string,
  registration: TargetRegistration,
): () => void {
  registrations.set(id, registration);
  return () => {
    if (registrations.get(id) === registration) registrations.delete(id);
  };
}

export function registeredPrismRefractTarget(
  id: string,
): RegisteredPrismRefractTarget | null {
  const registration = registrations.get(id);
  const element = registration?.element() ?? null;
  if (!registration || !element || !element.isConnected) return null;
  return { target: registration.descriptor(), element };
}

export function subscribePrismRefractRequests(
  listener: (request: PrismRefractRequest) => void,
): () => void {
  requestListeners.add(listener);
  return () => requestListeners.delete(listener);
}

export function requestPrismRefract(
  targetId: string,
  invocation: PrismRefractInvocation,
  origin?: PrismRefractOrigin,
): boolean {
  const registration = registeredPrismRefractTarget(targetId);
  if (!registration || registration.target.disabled?.()) return false;
  for (const listener of requestListeners) {
    listener({ targetId, invocation, origin });
  }
  return requestListeners.size > 0;
}

export function prismRefractTargetIdAtPoint(
  x: number,
  y: number,
  root: Document = document,
): string | null {
  for (const candidate of root.elementsFromPoint(x, y)) {
    const element = candidate.closest<HTMLElement>(
      `[${PRISM_REFRACT_TARGET_ATTRIBUTE}]`,
    );
    const targetId = element?.getAttribute(PRISM_REFRACT_TARGET_ATTRIBUTE);
    const registration = targetId
      ? registeredPrismRefractTarget(targetId)
      : null;
    if (targetId && registration && !registration.target.disabled?.()) {
      return targetId;
    }
  }
  return null;
}

export function focusedPrismRefractTargetId(
  activeElement: Element | null,
): string | null {
  return (
    activeElement
      ?.closest<HTMLElement>(`[${PRISM_REFRACT_TARGET_ATTRIBUTE}]`)
      ?.getAttribute(PRISM_REFRACT_TARGET_ATTRIBUTE) || null
  );
}

export function nextPrismRefractChoice(
  choices: readonly PrismRefractChoice[],
  currentValue: string,
  rejectedValues: readonly string[],
  random: () => number = Math.random,
): PrismRefractChoice | null {
  const rejected = new Set(rejectedValues);
  const eligible = choices.filter(
    (choice) =>
      !choice.disabled &&
      choice.value !== "" &&
      choice.value !== currentValue &&
      !rejected.has(choice.value),
  );
  const fallback = choices.filter(
    (choice) =>
      !choice.disabled && choice.value !== "" && choice.value !== currentValue,
  );
  const pool = eligible.length > 0 ? eligible : fallback;
  if (pool.length === 0) return null;
  const index = Math.min(
    pool.length - 1,
    Math.max(0, Math.floor(random() * pool.length)),
  );
  return pool[index] ?? null;
}

export interface PrismRefractBinding {
  ref: (element: HTMLElement | null) => void;
  "data-prism-refract-id": string;
  "aria-keyshortcuts": string;
}

export function PrismRefractTarget({
  target,
  children,
}: {
  target: PrismRefractTarget;
  children: (binding: PrismRefractBinding) => ReactNode;
}): ReactNode {
  const targetRef = useRef(target);
  const elementRef = useRef<HTMLElement | null>(null);
  const [ariaKeyShortcuts, setAriaKeyShortcuts] = useState(
    "Alt+Space Control+Space",
  );

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

  useEffect(() => {
    setAriaKeyShortcuts(
      prismCompanionModifierPresentation(navigator.platform).ariaKeyShortcuts,
    );
  }, []);

  useEffect(
    () =>
      registerPrismRefractTarget(target.id, {
        descriptor: () => targetRef.current,
        element: () => elementRef.current,
      }),
    [target.id],
  );

  // This render prop receives a callback ref; it does not read the ref during
  // render. The control invokes it later during React's commit phase.
  // eslint-disable-next-line react-hooks/refs
  return children({
    ref: (element) => {
      elementRef.current = element;
    },
    "data-prism-refract-id": target.id,
    "aria-keyshortcuts": ariaKeyShortcuts,
  });
}
