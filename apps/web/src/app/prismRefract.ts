"use client";

import { useEffect, useRef, type ReactNode } from "react";

export const PRISM_REFRACT_TARGET_ATTRIBUTE = "data-prism-refract-id";

export type PrismRefractInvocation =
  | "modifier-click"
  | "wield-click"
  | "focused-shortcut";

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
  /**
   * When true, the magic owns its own warmup + fullscreen loader
   * (e.g. New Duel / New Group invent). Companion skips the shared gate.
   */
  ownsPresentation?: boolean;
  run: (direction: string) => void | Promise<void>;
}

export type PrismRefractTarget =
  | PrismRefractFieldTarget
  | PrismRefractChoiceTarget
  | PrismRefractMagicTarget;

export type PrismRefractModifierClickDecision =
  | "begin"
  | "cancel"
  | "accept"
  | "accept-and-begin"
  | "queue";

export function prismRefractModifierClickDecision(input: {
  activeTargetId: string | null;
  activeTargetKind: PrismRefractTarget["kind"] | null;
  clickedTargetId: string;
  canAccept: boolean;
}): PrismRefractModifierClickDecision {
  if (!input.activeTargetId || input.activeTargetKind === "magic") {
    return "begin";
  }
  // The active sheen is the one deliberate in-page cancellation affordance.
  // A second Wield click on that same target therefore cancels rather than
  // silently waiting or enqueuing a duplicate.
  if (input.activeTargetId === input.clickedTargetId) {
    return "cancel";
  }
  return input.canAccept ? "accept-and-begin" : "queue";
}

export const PRISM_REFRACT_GENERATION_TIMEOUT_MS = 180_000;

export class PrismRefractGenerationTimeoutError extends Error {
  constructor() {
    super("Prism took too long to refract this field. Try it again.");
    this.name = "PrismRefractGenerationTimeoutError";
  }
}

/**
 * Give every foreground Refract request a finite client lifecycle while still
 * forwarding explicit cancellation to the underlying provider request.
 */
export async function runPrismRefractGenerationWithTimeout<T>(input: {
  signal: AbortSignal;
  run: (signal: AbortSignal) => Promise<T>;
  timeoutMs?: number;
}): Promise<T> {
  if (input.signal.aborted) {
    throw input.signal.reason instanceof Error
      ? input.signal.reason
      : new DOMException("The refraction was cancelled.", "AbortError");
  }
  const controller = new AbortController();
  const forwardAbort = (): void => controller.abort(input.signal.reason);
  input.signal.addEventListener("abort", forwardAbort, { once: true });
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
  const timeoutError = new PrismRefractGenerationTimeoutError();
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, input.timeoutMs ?? PRISM_REFRACT_GENERATION_TIMEOUT_MS);
  });
  try {
    return await Promise.race([input.run(controller.signal), timeout]);
  } finally {
    if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
    input.signal.removeEventListener("abort", forwardAbort);
  }
}

export interface RegisteredPrismRefractTarget {
  target: PrismRefractTarget;
  element: HTMLElement;
}

export function prismRefractResultOwnershipIsCurrent(input: {
  aborted: boolean;
  requestRunId: number;
  currentRunId: number;
  expectedTargetId: string;
  currentTargetId: string | null;
  expectedElement: HTMLElement;
  currentElement: HTMLElement | null;
}): boolean {
  return (
    !input.aborted &&
    input.requestRunId === input.currentRunId &&
    input.expectedTargetId === input.currentTargetId &&
    input.expectedElement === input.currentElement
  );
}

export interface PrismRefractRequest {
  targetId: string;
  invocation: PrismRefractInvocation;
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
): boolean {
  const registration = registeredPrismRefractTarget(targetId);
  if (!registration || registration.target.disabled?.()) return false;
  for (const listener of requestListeners) {
    listener({ targetId, invocation });
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

  useEffect(() => {
    targetRef.current = target;
  }, [target]);

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
  });
}
