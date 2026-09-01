import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY,
  syncTurboAppletSessionContext,
  turboAppletSessionContextStorageKey,
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

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Turbo applet session context", () => {
  it("preserves Turbo across a refresh of the same applet", () => {
    const storage = new MemorySessionStorage();
    const context = "user-1:coffee";

    assert.equal(
      syncTurboAppletSessionContext(storage, null, context, "user-1"),
      true,
    );
    assert.equal(
      storage.getItem(turboAppletSessionContextStorageKey("user-1")),
      context,
    );
    assert.equal(
      syncTurboAppletSessionContext(storage, null, context, "user-1"),
      false,
    );
  });

  it("preserves Turbo across screen changes inside one applet", () => {
    const storage = new MemorySessionStorage();
    const context = "user-1:coffee";
    syncTurboAppletSessionContext(storage, null, context, "user-1");

    assert.equal(
      syncTurboAppletSessionContext(storage, context, context, "user-1"),
      false,
    );
  });

  it("disables Turbo when the applet changes", () => {
    const storage = new MemorySessionStorage();
    const coffeeContext = "user-1:coffee";
    syncTurboAppletSessionContext(storage, null, coffeeContext, "user-1");

    assert.equal(
      syncTurboAppletSessionContext(
        storage,
        coffeeContext,
        "user-1:slate",
        "user-1",
      ),
      true,
    );
  });

  it("keeps four account contexts in separate storage namespaces", () => {
    const storage = new MemorySessionStorage();
    const owners = ["user-1", "user-2", "user-3", "user-4"];

    for (const ownerId of owners) {
      const context = `${ownerId}:slate`;
      assert.equal(
        syncTurboAppletSessionContext(storage, null, context, ownerId),
        true,
      );
    }

    assert.deepEqual(
      owners.map((ownerId) =>
        storage.getItem(turboAppletSessionContextStorageKey(ownerId)),
      ),
      owners.map((ownerId) => `${ownerId}:slate`),
    );
    assert.equal(
      storage.getItem(TURBO_APPLET_SESSION_CONTEXT_STORAGE_KEY),
      null,
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
        "user-1",
      ),
    );
    assert.equal(
      syncTurboAppletSessionContext(
        blockedStorage,
        null,
        "user-1:coffee",
        "user-1",
      ),
      true,
    );
    assert.equal(
      syncTurboAppletSessionContext(
        blockedStorage,
        "user-1:coffee",
        "user-1:coffee",
        "user-1",
      ),
      false,
    );
  });
});
