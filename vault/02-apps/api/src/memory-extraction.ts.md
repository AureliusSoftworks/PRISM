---
title: "apps/api/src/memory-extraction.ts"
type: "note"
domain: "apps"
tags:
  - prism
  - apps
source: "apps/api/src/memory-extraction.ts"
status: "active"
---

# apps/api/src/memory-extraction.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/api/src/memory-validation.ts]]
- [[02-apps/api/src/memory.ts]]
- [[05-lessons/2026-05-02-2026-05-02-architecture-lesson-3]]
- [[05-lessons/2026-05-02-2026-05-02-architecture-lesson-5]]

## Source path
- `apps/api/src/memory-extraction.ts`

## Import references
- _No imports detected_

## Source preview
```text
export interface MemoryCandidate {
  text: string;
  confidence: number;
}

export interface MemoryRetractionCue {
  cuePhrase: string;
}

export type MemoryIntent =
  | {
      kind: "create";
      candidates: MemoryCandidate[];
      scope: "bot" | "global";
      explicit: boolean;
    }
  | {
      kind: "retract";
      cuePhrase: string;
      cuePhrases: string[];
    }
  | {
      kind: "correct";
      cuePhrase: string;
      cuePhrases: string[];
      newCandidates: MemoryCandidate[];
      scope: "bot" | "global";
      explicit: boolean;
    };

const HIGH_CONFIDENCE_MEMORY_CUES = [
  "don't forget",
  "do not forget",
  "please remember",
  "remember this",
  "remember that",
  "keep in mind",
  "make a note",
  "please don't",
  "please do not",
] as const;

const HIGH_CONFIDENCE_CUE_FILLER_WORDS = new Set([
  "ok",
  "okay",
  "but",
  "and",
  "also",
  "please",
  "that",
  "this",
  "it",
  "to",
  "me",
]);

function hasSubstantiveHighConfidenceMemory(lower: string): boolean {
  const cue = HIGH_CONFIDENCE_MEMORY_CUES.find((candidate) =>
    lower.includes(candidate)
  );
  if (!cue) return false;

  const remainder = lower
    .replace(cue, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean)
    .filter((word) => !HIGH_CONFIDENCE_CUE_FILLER_WORDS.has(word));

  return remainder.length > 0;
}

const

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
