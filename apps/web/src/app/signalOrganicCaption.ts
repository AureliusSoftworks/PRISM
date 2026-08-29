export type SignalOrganicCaptionPresentationV1 =
  | { kind: "animated_ellipsis"; accessibleText: "hesitating"; dots: 3 }
  | { kind: "text"; text: string };

/** Live delivery and reconstructed replay share this exact caption decision. */
export function signalOrganicCaptionPresentationV1(
  value: string | null | undefined,
): SignalOrganicCaptionPresentationV1 | null {
  const text = value?.trim() ?? "";
  if (!text) return null;
  return text === "…" || text === "..."
    ? { kind: "animated_ellipsis", accessibleText: "hesitating", dots: 3 }
    : { kind: "text", text };
}
