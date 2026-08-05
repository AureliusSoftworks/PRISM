import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  decryptBytes,
  deriveMasterKey,
  decryptText,
  encryptBytes,
  encryptText,
} from "../security.ts";

describe("encryption round trip", () => {
  it("encrypts and decrypts user payloads", () => {
    const key = deriveMasterKey("test-master-key");
    const encrypted = encryptText("secret", key);
    const decrypted = decryptText(encrypted, key);
    assert.equal(decrypted, "secret");
  });

  it("encrypts binary asset revisions without text encoding", () => {
    const key = deriveMasterKey("test-master-key");
    const original = Buffer.from([0, 255, 12, 4, 88]);
    const encrypted = encryptBytes(original, key);
    assert.notDeepEqual(encrypted.ciphertext, original);
    assert.deepEqual(decryptBytes(encrypted, key), original);
  });
});
