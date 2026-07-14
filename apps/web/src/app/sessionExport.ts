export type SessionTranscriptVariant = "standard" | "developer";

export function sessionTranscriptVariantAtClick(event: {
  shiftKey: boolean;
}): SessionTranscriptVariant {
  return event.shiftKey ? "developer" : "standard";
}

export function sessionTranscriptCopyLabel(
  variant: SessionTranscriptVariant,
  state: "idle" | "copying" | "copied" | "failed",
): string {
  if (state === "copying") {
    return variant === "developer" ? "Copying Developer Transcript" : "Copying Session";
  }
  if (state === "copied") {
    return variant === "developer" ? "Copied Developer Transcript" : "Copied Session Transcript";
  }
  if (state === "failed") {
    return variant === "developer"
      ? "Could not copy Developer Transcript"
      : "Could not copy Session";
  }
  return "Copy Session";
}

export function sessionTranscriptDownloadFileName(
  baseName: string,
  variant: SessionTranscriptVariant,
): string {
  const base = baseName.trim().replace(/\.md$/iu, "") || "session";
  return variant === "developer" ? `${base}-developer-transcript.md` : `${base}.md`;
}

export function sessionTranscriptNotice(
  variant: SessionTranscriptVariant,
  action: "copied" | "downloaded",
): { title: string; detail: string } {
  const title =
    variant === "developer"
      ? `Developer Transcript ${action}`
      : `Session Transcript ${action}`;
  return {
    title,
    detail:
      variant === "developer"
        ? "Verbose provider, prompt, routing, tool, timing, and ambient diagnostics included with secrets redacted."
        : "The normal user-facing transcript was preserved.",
  };
}
