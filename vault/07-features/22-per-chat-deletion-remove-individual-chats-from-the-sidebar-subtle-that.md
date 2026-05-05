---
title: "Feature 22"
type: "feature"
domain: "feature"
tags:
  - prism
  - feature
source: "README.md"
status: "active"
---

# Feature 22

## AI Summary
<!-- kb:summary:start -->
This feature note matters in PRISM because it introduces a new way to manage chat data, allowing users to quickly delete multiple chats at once with a press-and-hold gesture, while also providing a confirmation prompt for added security. This change enhances user convenience and data management within the platform.
<!-- kb:summary:end -->

## Linked notes
- [[04-docs/README.md]]

## Referenced by
- _No backlinks yet_

## Feature description
**Per-chat deletion** — remove individual chats from the sidebar (subtle × that embosses red on hover, click-to-confirm) or from the chat header. **Press-and-hold any × (or the header Delete button) for ~1 s** to clear *every* chat at once: on pointerdown every × immediately glows red and tilts to its own small angle; at the 900 ms threshold the whole row shakes like iOS edit-mode while a centered confirmation modal ("Delete all chats?" · Cancel / Delete all) takes over the decision. Release before the threshold to snap the ×'s back. Messages and exports are purged; generated images and extracted memories are preserved.

## Related (semantic)
<!-- kb:related:start -->
_No semantic related links yet._
<!-- kb:related:end -->
