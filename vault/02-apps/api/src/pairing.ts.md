---
title: "apps/api/src/pairing.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/pairing.ts"
status: "active"
---

# apps/api/src/pairing.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/security.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/pairing.test.ts]]
- [[02-apps/api/src/server.ts]]

## Source path
- `apps/api/src/pairing.ts`

## Import references
- `node:crypto`
- `node:sqlite`
- `./security.ts`

## Source preview
```text
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { randomId } from "./security.ts";

export const PAIRING_CODE_TTL_MS = 5 * 60 * 1000;

const PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PAIRING_CODE_SEGMENT_LENGTH = 4;
const PAIRING_CODE_SEGMENTS = 3;

export interface PairingCode {
  code: string;
  expiresAt: string;
}

export interface ConsumedPairingCode {
  userId: string;
}

export function normalizePairingCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function hashPairingCode(code: string): string {
  return createHash("sha256").update(normalizePairingCode(code)).digest("hex");
}

export function generatePairingCode(): string {
  const length = PAIRING_CODE_SEGMENT_LENGTH * PAIRING_CODE_SEGMENTS;
  const bytes = randomBytes(length);
  const characters = Array.from(bytes, (byte) => {
    return PAIRING_CODE_ALPHABET[byte % PAIRING_CODE_ALPHABET.length];
  }).join("");

  return characters
    .match(new RegExp(`.{1,${PAIRING_CODE_SEGMENT_LENGTH}}`, "g"))
    ?.join("-") ?? characters;
}

export function timingSafePairingCodeEqual(
  expectedHash: string,
  providedCode: string
): boolean {
  const expected = Buffer.from(expectedHash, "hex");
  const provided = Buffer.from(hashPairingCode(providedCode), "hex");
  return expe

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
