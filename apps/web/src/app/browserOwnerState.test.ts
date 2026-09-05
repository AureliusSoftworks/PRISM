import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteAllBrowserOwnerStateV1,
  deleteBrowserOwnerJsonV1,
  readBrowserOwnerJsonV1,
  readOrMigrateBrowserOwnerJsonV1,
  writeBrowserOwnerJsonV1,
} from "./browserOwnerState.ts";

test("encrypted browser state keeps identical logical keys owner-confined", async () => {
  const logicalKey = "command-center";
  await writeBrowserOwnerJsonV1({
    ownerId: "state-owner-a",
    logicalKey,
    value: { prompt: "owner a private canary" },
  });
  await writeBrowserOwnerJsonV1({
    ownerId: "state-owner-b",
    logicalKey,
    value: { prompt: "owner b private canary" },
  });

  assert.deepEqual(
    await readBrowserOwnerJsonV1({ ownerId: "state-owner-a", logicalKey }),
    { prompt: "owner a private canary" },
  );
  assert.deepEqual(
    await readBrowserOwnerJsonV1({ ownerId: "state-owner-b", logicalKey }),
    { prompt: "owner b private canary" },
  );
  assert.equal(
    await readBrowserOwnerJsonV1({ ownerId: "state-owner-c", logicalKey }),
    null,
  );
});

test("legacy plaintext is migrated once and removed", async () => {
  const values = new Map([["legacy-owner-state", '{"value":"private"}']]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => void values.delete(key),
  };
  const migrated = await readOrMigrateBrowserOwnerJsonV1({
    ownerId: "migration-owner",
    logicalKey: "workspace-state",
    legacyStorage: storage,
    legacyKeys: ["legacy-owner-state"],
  });
  assert.deepEqual(migrated, { value: "private" });
  assert.equal(values.has("legacy-owner-state"), false);
  assert.deepEqual(
    await readBrowserOwnerJsonV1({
      ownerId: "migration-owner",
      logicalKey: "workspace-state",
    }),
    { value: "private" },
  );

  await deleteBrowserOwnerJsonV1({
    ownerId: "migration-owner",
    logicalKey: "workspace-state",
  });
  assert.equal(
    await readBrowserOwnerJsonV1({
      ownerId: "migration-owner",
      logicalKey: "workspace-state",
    }),
    null,
  );
});

test("owner-wide deletion removes only the selected account", async () => {
  await writeBrowserOwnerJsonV1({
    ownerId: "purge-owner-a",
    logicalKey: "dynamic:one",
    value: { secret: "a" },
  });
  await writeBrowserOwnerJsonV1({
    ownerId: "purge-owner-b",
    logicalKey: "dynamic:one",
    value: { secret: "b" },
  });
  await deleteAllBrowserOwnerStateV1("purge-owner-a");
  assert.equal(
    await readBrowserOwnerJsonV1({
      ownerId: "purge-owner-a",
      logicalKey: "dynamic:one",
    }),
    null,
  );
  assert.deepEqual(
    await readBrowserOwnerJsonV1({
      ownerId: "purge-owner-b",
      logicalKey: "dynamic:one",
    }),
    { secret: "b" },
  );
});
