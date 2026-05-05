---
title: "apps/api/src/security.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/security.ts"
status: "active"
---

# apps/api/src/security.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/__tests__/memory-inference.test.ts]]
- [[02-apps/api/src/__tests__/security.test.ts]]
- [[02-apps/api/src/auth.ts]]
- [[02-apps/api/src/backup.ts]]
- [[02-apps/api/src/bots.ts]]
- [[02-apps/api/src/chat.ts]]
- [[02-apps/api/src/conversations.ts]]
- [[02-apps/api/src/memory-inference.ts]]
- [[02-apps/api/src/memory-summarizer.ts]]
- [[02-apps/api/src/memory.ts]]
- [[02-apps/api/src/pairing.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/security.ts`

## Import references
- `node:crypto`

## Source preview
```text
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const AES_ALGO = "aes-256-gcm";

export interface EncryptedBlob {
  iv: string;
  tag: string;
  ciphertext: string;
}

export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string
): boolean {
  return hashPassword(password, salt) === expectedHash;
}

export function deriveMasterKey(masterSecret: string): Buffer {
  return scryptSync(masterSecret, "localai-master", 32);
}

export function encryptText(plainText: string, key: Buffer): EncryptedBlob {
  const iv = randomBytes(12);
  const cipher = createCipheriv(AES_ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64")
  };
}

export function decryptText(blob: EncryptedBlob, key: Buffer): string {
  const decipher = createDecipheriv(
    AES_ALGO,
    key,
    Buffer.from(blob.iv, "base64")
  );
  decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
  const plaintext = Buffer

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
