---
title: "apps/api/src/memory-validation.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/memory-validation.ts"
status: "active"
---

# apps/api/src/memory-validation.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- [[02-apps/api/src/memory-extraction.ts]]
- [[02-apps/api/src/providers.ts]]

## Referenced by
- [[02-apps/api/src/__tests__/memory-validation.test.ts]]
- [[02-apps/api/src/chat.ts]]
- [[02-apps/api/src/memory-inference.ts]]
- [[02-apps/api/src/memory-summarizer.ts]]

## Source path
- `apps/api/src/memory-validation.ts`

## Import references
- `./memory-extraction.ts`
- `./providers.ts`

## Source preview
```text
import type { MemoryCandidate } from "./memory-extraction.ts";
import type { LlmProvider, ProviderMessage } from "./providers.ts";

export type MemoryValidationSource = "direct" | "inferred" | "compiled";
export type MemoryValidationScope = "bot" | "global";
export type MemoryValidationDecision = "approve" | "auto_fix" | "reject";

export type MemoryValidationReasonCode =
  | "subject_role_confusion"
  | "assistant_identity_instruction"
  | "task_request_not_memory"
  | "question_fragment"
  | "trailing_conversation_tag"
  | "lost_preference_payload"
  | "contradiction"
  | "low_confidence"
  | "malformed_text"
  | "validator_error";

export interface ValidatedMemoryCandidate extends MemoryCandidate {
  validationStatus: "approved" | "auto_fixed";
  originalText: string;
  reasonCodes: MemoryValidationReasonCode[];
}

export type MemoryValidationStatus = ValidatedMemoryCandidate["validationStatus"];

export interface RejectedMemoryCandidate {
  originalText: string;
  reasonCodes: MemoryValidationReasonCode[];
  notes?: string;
}

export interface MemoryValidationOptions {
  source: MemoryValidationSource;
  scope: MemoryValidationScope;
  rawContext: string;
  candidates: MemoryCandidate[];
  existingMemories?: string[];
}

export interface MemoryValidationOutcome {
  candidates: ValidatedMemoryCandidate[];
  rejected: RejectedMemoryCandidate[];
}

interface CriticResult {
  i

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
