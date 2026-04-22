import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deriveMasterKey, decryptText, encryptText } from "../security.ts";

describe("encryption round trip", () => {
  it("encrypts and decrypts user payloads", () => {
    const key = deriveMasterKey("test-master-key");
    const encrypted = encryptText("secret", key);
    const decrypted = decryptText(encrypted, key);
    assert.equal(decrypted, "secret");
  });
});
