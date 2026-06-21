/**
 * Caret screen position for `<textarea>` (mirrors content + styles off-screen).
 */
export function getTextareaCaretClientRect(textarea: HTMLTextAreaElement): DOMRect | null {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  const caret = textarea.selectionStart ?? 0;
  const mirror = document.createElement("div");
  const style = window.getComputedStyle(textarea);

  const properties = [
    "boxSizing",
    "width",
    "height",
    "overflowX",
    "overflowY",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "fontStyle",
    "fontVariant",
    "fontWeight",
    "fontStretch",
    "fontSize",
    "lineHeight",
    "fontFamily",
    "textAlign",
    "textTransform",
    "textIndent",
    "textDecoration",
    "letterSpacing",
    "wordSpacing",
    "tabSize",
    "MozTabSize",
    "whiteSpace",
    "wordBreak",
    "wordWrap",
  ] as const;

  mirror.style.position = "absolute";
  mirror.style.visibility = "hidden";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.wordWrap = "break-word";
  const textareaRect = textarea.getBoundingClientRect();
  mirror.style.top = `${textareaRect.top + window.scrollY}px`;
  mirror.style.left = `${textareaRect.left + window.scrollX}px`;

  for (const prop of properties) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (mirror.style as any)[prop] = (style as unknown as Record<string, string>)[prop];
  }

  const width = textarea.clientWidth;
  mirror.style.width = `${width}px`;

  const textBefore = textarea.value.slice(0, caret);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.textContent = "";
  mirror.append(document.createTextNode(textBefore.replace(/\n$/g, "\n ")));
  mirror.append(marker);

  document.body.append(mirror);
  const rect = marker.getBoundingClientRect();
  mirror.remove();
  return new DOMRect(
    rect.left - textarea.scrollLeft,
    rect.top - textarea.scrollTop,
    rect.width,
    rect.height
  );
}
