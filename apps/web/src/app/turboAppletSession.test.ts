import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { syncTurboAppletSessionContext } from "./turboAppletSession.ts";

const source = readFileSync(
  new URL("./turboAppletSession.ts", import.meta.url),
  "utf8",
);

describe("Turbo applet session context", () => {
  it("preserves Turbo only inside the same owner's current applet", () => {
    const context = "user-1:coffee";
    assert.equal(
      syncTurboAppletSessionContext(null, context, "user-1"),
      true,
    );
    assert.equal(
      syncTurboAppletSessionContext(context, context, "user-1"),
      false,
    );
    assert.equal(
      syncTurboAppletSessionContext(context, "user-1:slate", "user-1"),
      true,
    );
  });

  it("resets across each of four account owners", () => {
    const contexts = ["user-1", "user-2", "user-3", "user-4"].map(
      (ownerId) => `${ownerId}:slate`,
    );
    let previous: string | null = null;
    for (const next of contexts) {
      const ownerId = next.split(":", 1)[0]!;
      assert.equal(
        syncTurboAppletSessionContext(previous, next, ownerId),
        true,
      );
      previous = next;
    }
  });

  it("fails closed when the context is not bound to its claimed owner", () => {
    assert.equal(
      syncTurboAppletSessionContext(
        "user-1:coffee",
        "user-1:coffee",
        "user-2",
      ),
      true,
    );
    assert.equal(syncTurboAppletSessionContext(null, ":coffee", ""), true);
  });

  it("contains no browser persistence path", () => {
    assert.doesNotMatch(source, /localStorage|sessionStorage|Storage/u);
  });
});
