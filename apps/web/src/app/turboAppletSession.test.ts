import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY,
  syncTurboAppletSessionContext,
  type TurboAppletSessionStorage,
} from "./turboAppletSession.ts";

class MemorySessionStorage implements TurboAppletSessionStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Turbo applet session context", () => {
  it("preserves Turbo across a refresh of the same applet", () => {
    const storage = new MemorySessionStorage();
    const context = "user-1:coffee";

    assert.equal(syncTurboAppletSessionContext(storage, null, context), true);
    assert.equal(
      storage.getItem(TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY),
      context,
    );
    assert.equal(syncTurboAppletSessionContext(storage, null, context), false);
  });

  it("preserves Turbo across screen changes inside one applet", () => {
    const storage = new MemorySessionStorage();
    const context = "user-1:coffee";
    syncTurboAppletSessionContext(storage, null, context);

    assert.equal(
      syncTurboAppletSessionContext(storage, context, context),
      false,
    );
  });

  it("disables Turbo when the applet or account changes", () => {
    const storage = new MemorySessionStorage();
    const coffeeContext = "user-1:coffee";
    syncTurboAppletSessionContext(storage, null, coffeeContext);

    assert.equal(
      syncTurboAppletSessionContext(storage, coffeeContext, "user-1:slate"),
      true,
    );
    assert.equal(
      syncTurboAppletSessionContext(storage, null, "user-2:slate"),
      true,
    );
  });

  it("fails safely when session storage is unavailable", () => {
    const blockedStorage: TurboAppletSessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    assert.doesNotThrow(() =>
      syncTurboAppletSessionContext(
        blockedStorage,
        null,
        "user-1:coffee",
      ),
    );
    assert.equal(
      syncTurboAppletSessionContext(
        blockedStorage,
        null,
        "user-1:coffee",
      ),
      true,
    );
    assert.equal(
      syncTurboAppletSessionContext(
        blockedStorage,
        "user-1:coffee",
        "user-1:coffee",
      ),
      false,
    );
  });
});
