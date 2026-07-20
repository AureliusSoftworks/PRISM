export interface ElevenLabsCreditBalance {
  usedCredits: number;
  totalCredits: number;
  remainingCredits: number;
  resetAt: string | null;
  tier: string | null;
  status: string | null;
  checkedAt: string;
}

export interface ElevenLabsCreditCheckAvailability {
  canCheck: boolean;
  message: string;
}

export function elevenLabsCreditCheckAvailability(args: {
  keySource: "saved" | "server" | "none";
  preferredProvider: "local" | "openai" | "anthropic";
}): ElevenLabsCreditCheckAvailability {
  if (args.keySource === "none") {
    return {
      canCheck: false,
      message: "Save your own ElevenLabs key to see its credit balance.",
    };
  }
  if (args.keySource === "server") {
    return {
      canCheck: false,
      message:
        "This connection is managed by the server, so its balance stays private.",
    };
  }
  if (args.preferredProvider === "local") {
    return {
      canCheck: false,
      message: "Switch Prism to ONLINE before contacting ElevenLabs for a balance.",
    };
  }
  return {
    canCheck: true,
    message: "Check the live balance for your saved ElevenLabs key.",
  };
}

export function elevenLabsCreditPercentRemaining(
  balance: Pick<ElevenLabsCreditBalance, "remainingCredits" | "totalCredits">,
): number {
  if (!Number.isFinite(balance.totalCredits) || balance.totalCredits <= 0) {
    return 0;
  }
  const remaining = Number.isFinite(balance.remainingCredits)
    ? balance.remainingCredits
    : 0;
  return Math.max(
    0,
    Math.min(100, Math.round((remaining / balance.totalCredits) * 100)),
  );
}
