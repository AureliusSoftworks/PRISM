import assert from "node:assert/strict";
import test from "node:test";
import {
  deleteBrowserOwnerVaultKeyV1,
  openBrowserOwnerPayloadV1,
  openEnumeratedBrowserOwnerPayloadV1,
  sealBrowserOwnerPayloadV1,
} from "./browserOwnerVault.ts";

test("browser owner vault encrypts content and fails closed across owners and bindings", async () => {
  const canary = "owner-a private replay sentence";
  const plaintext = new TextEncoder().encode(canary);
  const ownerA = await sealBrowserOwnerPayloadV1({
    ownerId: "owner-a",
    logicalStore: "replays",
    logicalKey: "signal:shared-source",
    plaintext,
  });
  const ownerB = await sealBrowserOwnerPayloadV1({
    ownerId: "owner-b",
    logicalStore: "replays",
    logicalKey: "signal:shared-source",
    plaintext,
  });
  assert.ok(ownerA);
  assert.ok(ownerB);
  assert.notEqual(ownerA.key, ownerB.key);
  assert.notEqual(ownerA.ownerKeyId, ownerB.ownerKeyId);
  assert.notDeepEqual(
    new Uint8Array(ownerA.ciphertext),
    new Uint8Array(ownerB.ciphertext),
  );
  assert.doesNotMatch(JSON.stringify(ownerA), /owner-a|private replay sentence/u);

  const opened = await openBrowserOwnerPayloadV1({
    ownerId: "owner-a",
    logicalStore: "replays",
    logicalKey: "signal:shared-source",
    record: ownerA,
  });
  assert.equal(new TextDecoder().decode(opened!), canary);
  assert.equal(
    await openBrowserOwnerPayloadV1({
      ownerId: "owner-b",
      logicalStore: "replays",
      logicalKey: "signal:shared-source",
      record: ownerA,
    }),
    null,
  );
  assert.equal(
    await openBrowserOwnerPayloadV1({
      ownerId: "owner-a",
      logicalStore: "response-cues",
      logicalKey: "signal:shared-source",
      record: ownerA,
    }),
    null,
  );
  assert.equal(
    await openBrowserOwnerPayloadV1({
      ownerId: "owner-a",
      logicalStore: "replays",
      logicalKey: "coffee:shared-source",
      record: ownerA,
    }),
    null,
  );
  assert.equal(
    new TextDecoder().decode(
      (await openEnumeratedBrowserOwnerPayloadV1({
        ownerId: "owner-a",
        logicalStore: "replays",
        record: ownerA,
      }))!,
    ),
    canary,
  );

  const tampered = {
    ...ownerA,
    ciphertext: ownerA.ciphertext.slice(0),
  };
  new Uint8Array(tampered.ciphertext)[0] ^= 1;
  assert.equal(
    await openBrowserOwnerPayloadV1({
      ownerId: "owner-a",
      logicalStore: "replays",
      logicalKey: "signal:shared-source",
      record: tampered,
    }),
    null,
  );

  await deleteBrowserOwnerVaultKeyV1("owner-a");
  assert.equal(
    await openBrowserOwnerPayloadV1({
      ownerId: "owner-a",
      logicalStore: "replays",
      logicalKey: "signal:shared-source",
      record: ownerA,
    }),
    null,
  );
  assert.equal(
    new TextDecoder().decode(
      (await openBrowserOwnerPayloadV1({
        ownerId: "owner-b",
        logicalStore: "replays",
        logicalKey: "signal:shared-source",
        record: ownerB,
      }))!,
    ),
    canary,
  );
});
