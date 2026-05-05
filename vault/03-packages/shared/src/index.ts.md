---
title: "packages/shared/src/index.ts"
type: "note"
domain: "packages"
tags:
  - prism
  - packages
source: "packages/shared/src/index.ts"
status: "active"
---

# packages/shared/src/index.ts

## AI Summary
<!-- kb:summary:start -->
_Pending Ollama summary._
<!-- kb:summary:end -->

## Linked notes
- _None yet_

## Referenced by
- [[02-apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__0rip54u._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_0k0brk.._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_0om.wby._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_0p14fkf._.js]]
- [[02-apps/web/.next/dev/server/chunks/ssr/packages_shared_src_index_ts_0gxb-8k._.js]]
- [[02-apps/web/.next/dev/static/chunks/_0d3xlyf._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_07_jkvv._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_0932f8c._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_0p__g8u._.js]]
- [[02-apps/web/.next/dev/static/chunks/packages_shared_src_index_ts_0rox7-r._.js]]
- [[04-docs/docs/mobile-api-contract.md]]

## Source path
- `packages/shared/src/index.ts`

## Import references
- `./prismTool.js`
- `./botProfile.js`
- `./color.js`

## Source preview
```text
export {
  BOT_PROFILE_CATEGORY_LABELS,
  BOT_PROFILE_CATEGORY_ORDER,
  BOT_PROFILE_META_END,
  BOT_PROFILE_META_START,
  BOT_VOICE_PRESET_LABELS,
  DEFAULT_BOT_PROFILE_FIELDS,
  composeBotProfileProse,
  defaultBotPurpose,
  parseStoredBotPrompt,
  randomBotProfile,
  serializeStoredBotPrompt,
  stripBotProfileMetaSuffix,
  stripPurposeStatementPrefixes,
  type BotAppearanceProfile,
  type BotCoreProfile,
  type BotIdentityProfile,
  type BotProfileCategoryId,
  type BotProfileFields,
  type BotProfileScaleValue,
  type BotProfileV2,
  type BotPurposeProfile,
  type BotVoicePreset,
  type BotWorldviewProfile,
} from "./botProfile.js";

export {
  PRISM_TOOL_END,
  PRISM_TOOL_START,
  assistantContentHasPrismToolFraming,
  hydrateAssistantMessageParts,
  parseAssistantPrismTools,
  parseStoredToolPayload,
  serializeAskQuestionTool,
  type AskQuestionOption,
  type AskQuestionPayload,
  type ParsedAssistantTurn,
  type StoredAssistantToolPayload,
} from "./prismTool.js";

export {
  ACCENT_LUMINANCE_MAX_LIGHT,
  ACCENT_LUMINANCE_MAX_LIGHT_YELLOW,
  ACCENT_LIGHTNESS_MAX,
  ACCENT_LIGHTNESS_MAX_DARK,
  ACCENT_LIGHTNESS_MIN,
  ACCENT_LIGHTNESS_MIN_DARK,
  accentLightnessBand,
  clampAccentLightness,
  clampLuminance,
  contrastRatio,
  ensureContrast,
  hexToHsl,
  hslToHex,
  normalizeAccentForTheme,
  pickReadableText,
  relativeLuminance,
  swatchBorderCompensation,
} from "./c

... (truncated)
```

## Related (semantic)
<!-- kb:related:start -->
_Pending semantic related links._
<!-- kb:related:end -->
