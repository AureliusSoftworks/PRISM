---
title: "Feature 13"
type: "feature"
domain: "feature"
tags:
  - prism
  - feature
source: "README.md"
status: "active"
---

# Feature 13

## AI Summary
<!-- kb:summary:start -->
This feature matters in PRISM because it allows sandboxed threads to maintain their own internal state without affecting other threads or the main application, ensuring that each thread remains self-contained and doesn't lose its context. This helps prevent data loss and ensures that sandboxed threads don't interfere with each other or the rest of the system.
<!-- kb:summary:end -->

## Linked notes
- [[04-docs/README.md]]

## Referenced by
- _No backlinks yet_

## Feature description
Sandbox gets a silent, thread-scoped **rolling compaction summary** that kicks in when a thread outgrows the 30-message live window. Stored only in SQLite, never indexed into Qdrant, never surfaced in the sidebar — pure context plumbing so long Sandbox threads don't go amnesiac. Nothing ever crosses between threads.

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
