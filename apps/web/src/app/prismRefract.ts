"use client";

import type { ProviderReasoningEffort } from "@localai/shared";
import { useEffect, useRef, type ReactNode } from "react";

export const PRISM_REFRACT_TARGET_ATTRIBUTE = "data-prism-refract-id";

export type PrismRefractInvocation =
  | "modifier-click"
  | "wield-click"
  | "focused-shortcut";

export const PRISM_REFRACT_DEFAULT_PROSE_DIRECTION =
  "Make this more creative";

const PRISM_REFRACT_EFFORT_LABELS: Readonly<
  Record<ProviderReasoningEffort, string>
> = {
  auto: "Auto",
  none: "None",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
  max: "Max",
};

export function prismRefractProvenanceDetail(input: {
  model?: string | null;
  reasoningEffort?: ProviderReasoningEffort | null;
  turbo?: boolean;
}): string {
  const model = input.model?.trim() || "None";
  const effort = input.reasoningEffort
    ? PRISM_REFRACT_EFFORT_LABELS[input.reasoningEffort]
    : model === "None"
      ? "None"
      : "Default";
  return `Model: ${model} · Effort: ${effort}${input.turbo ? " · Turbo" : ""}.`;
}

export function initialPrismRefractProseDirection(currentValue: string): string {
  return currentValue.trim() ? PRISM_REFRACT_DEFAULT_PROSE_DIRECTION : "";
}

export interface PrismRefractGenerationInput {
  currentValue: string;
  rejectedValues: readonly string[];
  direction?: string;
  signal: AbortSignal;
}

interface PrismRefractTargetBase {
  id: string;
  label: string;
  disabled?: () => boolean;
}

export interface PrismRefractFieldTarget extends PrismRefractTargetBase {
  kind: "field";
  /** Optional steering composer shown before the first generated candidate. */
  steering?: {
    prompt: string;
    initialDirection: (currentValue: string) => string;
  };
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
  /** How the captured control should collect its one-pass Refract action. */
  interaction?: "prompt" | "choice" | "immediate";
  /** Choices rendered by the prompt-free picker interaction. */
  choices?: () => readonly PrismRefractChoice[];
  /** Keep a choice picker open so another click rerolls the same control. */
  keepOpen?: boolean;
  /**
   * When true, the magic owns its own warmup + fullscreen loader
   * (e.g. New Duel / New Group invent). Companion skips the shared gate.
   */
  ownsPresentation?: boolean;
  run: (direction: string) => void | Promise<void>;
}

export interface PrismRefractBotDirectedSetupTarget
  extends PrismRefractMagicTarget {
  purpose: "bot-directed-setup";
  anchor: {
    botId: string;
    botName: string;
  };
}

/**
 * Shared contract for Wielding a concrete bot inside an editable applet setup.
 * The applet owns what "build around this bot" means; the shared target keeps
 * the captured identity explicit all the way through invocation.
 */
export function createBotDirectedSetupRefractTarget(input: {
  id: string;
  label: string;
  botId: string;
  botName: string;
  disabled?: () => boolean;
  ownsPresentation?: boolean;
  interaction?: PrismRefractMagicTarget["interaction"];
  run: (input: {
    botId: string;
    botName: string;
    direction: string;
  }) => void | Promise<void>;
}): PrismRefractBotDirectedSetupTarget {
  const anchor = { botId: input.botId, botName: input.botName };
  return {
    id: input.id,
    label: input.label,
    kind: "magic",
    purpose: "bot-directed-setup",
    anchor,
    disabled: input.disabled,
    ownsPresentation: input.ownsPresentation,
    interaction: input.interaction,
    run: (direction) => input.run({ ...anchor, direction }),
  };
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
const domTargetResolvers = new Set<
  (element: Element) => RegisteredPrismRefractTarget | null
>();

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

/**
 * Add a lazy, capability-based DOM resolver without replacing the explicit
 * registry used by authored Refract targets. Resolvers run only for the
 * element under Wield/focus, so mounting Prism never scans the whole page.
 */
export function registerPrismRefractDomTargetResolver(
  resolver: (element: Element) => RegisteredPrismRefractTarget | null,
): () => void {
  domTargetResolvers.add(resolver);
  return () => domTargetResolvers.delete(resolver);
}

export function resolvePrismRefractTargetForElement(
  element: Element,
): RegisteredPrismRefractTarget | null {
  const registeredElement = element.closest<HTMLElement>(
    `[${PRISM_REFRACT_TARGET_ATTRIBUTE}]`,
  );
  const registeredId = registeredElement?.getAttribute(
    PRISM_REFRACT_TARGET_ATTRIBUTE,
  );
  const registered = registeredId
    ? registeredPrismRefractTarget(registeredId)
    : null;
  if (registered && !registered.target.disabled?.()) return registered;
  for (const resolver of domTargetResolvers) {
    const resolved = resolver(element);
    if (resolved && !resolved.target.disabled?.()) return resolved;
  }
  return null;
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
    const registration = resolvePrismRefractTargetForElement(candidate);
    if (registration) return registration.target.id;
  }
  return null;
}

export function focusedPrismRefractTargetId(
  activeElement: Element | null,
): string | null {
  return activeElement
    ? resolvePrismRefractTargetForElement(activeElement)?.target.id ?? null
    : null;
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
  const stationaryFallback = choices.filter(
    (choice) => !choice.disabled && choice.value !== "",
  );
  const pool =
    eligible.length > 0
      ? eligible
      : fallback.length > 0
        ? fallback
        : stationaryFallback;
  if (pool.length === 0) return null;
  const index = Math.min(
    pool.length - 1,
    Math.max(0, Math.floor(random() * pool.length)),
  );
  return pool[index] ?? null;
}

export function randomPrismSteppedValue(input: {
  min: number;
  max: number;
  step: number;
  random?: () => number;
}): number | null {
  if (
    !Number.isFinite(input.min) ||
    !Number.isFinite(input.max) ||
    !Number.isFinite(input.step) ||
    input.max < input.min ||
    input.step <= 0
  ) {
    return null;
  }
  const count = Math.floor((input.max - input.min) / input.step);
  const roll = Math.min(
    0.999999999,
    Math.max(0, (input.random ?? Math.random)()),
  );
  return input.min + Math.floor(roll * (count + 1)) * input.step;
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
