import {
  crtFocusRadiusScale,
  normalizeCrtFocus,
} from "@localai/shared";

interface CrtFocusDocumentTarget {
  documentElement: {
    dataset: Record<string, string | undefined>;
    style: { setProperty(name: string, value: string): void };
  };
}

export function applyCrtFocusToDocument(
  target: CrtFocusDocumentTarget,
  value: unknown,
): number {
  const focus = normalizeCrtFocus(value);
  target.documentElement.dataset.prismCrtFocus = String(focus);
  target.documentElement.style.setProperty(
    "--prism-crt-focus-radius-scale",
    String(crtFocusRadiusScale(focus)),
  );
  return focus;
}
