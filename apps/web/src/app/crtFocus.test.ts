import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyCrtFocusToDocument } from "./crtFocus.ts";

describe("global CRT focus", () => {
  it("installs one radius scale on the document for every screen resource", () => {
    const properties = new Map<string, string>();
    const target = {
      documentElement: {
        dataset: {} as Record<string, string | undefined>,
        style: {
          setProperty(name: string, value: string) {
            properties.set(name, value);
          },
        },
      },
    };
    assert.equal(applyCrtFocusToDocument(target, 75), 75);
    assert.equal(target.documentElement.dataset.prismCrtFocus, "75");
    assert.equal(properties.get("--prism-crt-focus-radius-scale"), "0.85");
  });
});
