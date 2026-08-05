/**
 * Zen listening reactions while the player message streams.
 * Reuses Signal/Coffee listener-reaction plans + Action SFX packs for Foley.
 */

import {
  listenerReactionActionLabel,
  type ListenerReactionPlanV1,
  type ListenerReactionVisualAction,
  type ListenerReactionVocalFoley,
  type ZenLiveActionMoodHint,
} from "@localai/shared";
import type { CoffeeActionSfxKind } from "./coffee-action-sfx.ts";
import type { ZenLiveBotActionState } from "./zenLiveActions.ts";

export function zenPlayerListenerVocalFoleyToActionSfxKind(
  vocalFoley: ListenerReactionVocalFoley,
): CoffeeActionSfxKind {
  switch (vocalFoley) {
    case "clears throat":
      return "throat_clear";
    case "coughs":
      return "cough";
    case "sighs":
    case "exhales":
      return "sigh";
    case "chuckles":
      return "laugh";
    default: {
      const _exhaustive: never = vocalFoley;
      void _exhaustive;
      return "throat_clear";
    }
  }
}

export function zenPlayerListenerVisualMoodHint(
  visualAction: ListenerReactionVisualAction,
): ZenLiveActionMoodHint {
  switch (visualAction) {
    case "soft_smile":
      return "amused";
    case "lean_in":
    case "nod":
      return "attentive";
    case "head_tilt":
      return "confused";
    case "thoughtful_hmm":
      return "waiting";
    default: {
      const _exhaustive: never = visualAction;
      void _exhaustive;
      return "attentive";
    }
  }
}

/**
 * Build a short-lived Zen live-action plate from a listening-reaction plan.
 */
export function zenLiveBotActionFromPlayerListenerReaction(args: {
  plan: ListenerReactionPlanV1;
  botId: string;
  createdAtMs?: number;
}): ZenLiveBotActionState {
  const action = listenerReactionActionLabel(args.plan.visualAction);
  return {
    action,
    moodHint: zenPlayerListenerVisualMoodHint(args.plan.visualAction),
    responseKind: "show_action",
    confidence: 0.82,
    botId: args.botId,
    clientSequenceId: `zen-player-listen:${args.plan.messageId}`,
    source: "idle",
    createdAtMs: args.createdAtMs ?? Date.now(),
  };
}

export function isZenPlayerListeningReactionAction(
  action: ZenLiveBotActionState | null | undefined,
  messageId: string,
): boolean {
  return action?.clientSequenceId === `zen-player-listen:${messageId}`;
}
