/** Confirmation and reversibility policy.
 *
 *  The affordance a destructive action earns is derived from what the code can
 *  actually undo — not from how consequential the action feels. A modal fires
 *  on every invocation including the intentional ones, so it trains dismissal
 *  and is furniture by the time it guards a real mistake. Reserve it for the
 *  cases where nothing else can help.
 *
 *  See docs/design-system.md § Confirmation and reversibility. */

export type ConfirmationAffordance = "none" | "undo" | "hold-undo" | "confirm";

export interface ConfirmationAction {
  /** Stable id. Also the registration key used by the contract test. */
  id: string;
  /** What the person is doing, in their words. */
  label: string;
  /** Crosses the local-first boundary — a packet leaves the user's network.
   *  A transmission is not recallable even when the local record of it is. */
  leavesDevice: boolean;
  /** The send can be held briefly before it commits, so undo is still real. */
  deferrable: boolean;
  /** An inverse operation or snapshot exists in the code *today*. Not "could
   *  be added" — the tier reflects what ships, so adding an inverse is what
   *  moves an action down a tier. */
  reversible: boolean;
  /** Touches many items at once. Per-item undo is not real recovery when the
   *  blast radius is a whole library. */
  bulk: boolean;
  /** Archived or soft-deleted, and restorable from the UI without a dedicated
   *  undo affordance — reversibility lives in the data model. */
  soft: boolean;
  /** Required when the action resolves to `confirm`: why it cannot be undone.
   *  If no reason can be written, the action belongs in a lower tier. */
  irreversibleReason?: string;
}

/** Resolve the affordance for an action.
 *
 *  Precedence, first match wins:
 *
 *  1. Leaves the device — `hold-undo` when the send is deferrable, else
 *     `confirm`.
 *  2. Irreversible — no inverse, no snapshot, and not soft-deleted.
 *  3. Bulk blast radius.
 *  4. Reversible — an inverse or snapshot exists.
 *  5. Soft — restorable from the UI on its own.
 *
 *  Rule 2 treats `soft` as a form of recoverability, which is what keeps rule 5
 *  reachable: a soft-deleted item is not "irreversible" merely because it has
 *  no explicit inverse operation. */
export function confirmationAffordanceFor(
  action: ConfirmationAction,
): ConfirmationAffordance {
  if (action.leavesDevice) return action.deferrable ? "hold-undo" : "confirm";
  if (!action.reversible && !action.soft) return "confirm";
  if (action.bulk) return "confirm";
  if (action.reversible) return "undo";
  return "none";
}

export interface ConfirmationPolicyViolation {
  actionId: string;
  problem: string;
}

/** Validate a set of actions.
 *
 *  The one rule with teeth: an action that resolves to `confirm` must carry a
 *  written reason. Writing the sentence is the test — an action whose reason
 *  cannot be written is an action that does not belong in the top tier. A
 *  reason on a *lower* tier is not an error; it is just unused. */
export function validateConfirmationActions(
  actions: readonly ConfirmationAction[],
): ConfirmationPolicyViolation[] {
  const violations: ConfirmationPolicyViolation[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    if (seen.has(action.id)) {
      violations.push({
        actionId: action.id,
        problem: "duplicate action id",
      });
    }
    seen.add(action.id);

    if (confirmationAffordanceFor(action) !== "confirm") continue;
    if ((action.irreversibleReason ?? "").trim().length > 0) continue;
    violations.push({
      actionId: action.id,
      problem:
        "confirm-tier actions must explain why they cannot be undone — " +
        "if no reason can be written, the action belongs in a lower tier",
    });
  }

  return violations;
}

/** The subset of a server capability descriptor that bears on reversibility.
 *  Structural on purpose, so this module stays free of transport types. */
export interface CapabilityReversibilityFacts {
  undo: "none" | "inverse" | "quarantine";
  risk: string;
  provider: string;
}

/** Derive the reversibility flags from a Prism capability descriptor.
 *
 *  The API already publishes exactly the facts this policy needs, so actions
 *  routed through the capability registry should not restate them by hand.
 *  Actions that call a plain REST route have no descriptor and must be
 *  described directly. */
export function reversibilityFromCapability(
  facts: CapabilityReversibilityFacts,
): Pick<ConfirmationAction, "leavesDevice" | "reversible" | "bulk" | "soft"> {
  return {
    leavesDevice: facts.provider === "online-required",
    reversible: facts.undo === "inverse",
    bulk: facts.risk === "bulk",
    soft: facts.undo === "quarantine",
  };
}
