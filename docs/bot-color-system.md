# Bot color system

Every bot has two semantic identity colors:

- **Primary** is the bot itself. It owns avatar emission, frame lights, cards,
  transcript identity, controls, navigation, sorting, and selection chrome.
- **Atmosphere accent** is an optional environmental companion. In v1 it may
  appear only in that bot's Chat and Zen Atmospheres and in Avatar Studio's
  environmental preview.

## Auto resolution

`accentColor: null` means Auto and remains null in storage. At render or prompt
composition time, Auto takes a valid six-digit primary color, rotates its HSL
hue by +52 degrees, preserves compatible lightness, and uses 100% saturation.
The algorithm never uses a database id or device-local seed, so it is stable
across clones, backups, archives, Marketplace installs, and reinstalls.

A valid explicit accent wins and is normalized with the same full-saturation
rule as primary identity colors. Invalid or missing primary colors use the
surface's existing neutral or PRISM fallback. Existing rows are never
backfilled with derived values.

## Allowed v1 consumers

- Bot-specific Chat startup, fallback, remembered, and generated Atmospheres
- Bot-specific Zen startup, fallback, remembered, and generated Atmospheres
- Bot-specific Chat and Zen image-prompt palette guidance
- Avatar Studio's `Atmosphere accent` control and environmental preview

Atmosphere washes keep primary visually dominant at roughly two thirds, use
accent as restrained edge light or spatial counterbalance, and keep the center
calm for prose. Light mode uses weaker color and preserves text contrast. Dark
mode may use screen, color, or soft-light blending.

The dual-color Atmosphere replaces the former full-field monochromatic persona
wash. A surface has one color-field owner at a time: the code-only canvas owns
empty/fallback rooms, while wallpaper surfaces receive restrained edge light.
Startup and continuity layers must not stack a second primary wash underneath.

## Prohibited consumers

Accent must not recolor avatars, face phosphor, frame metal, LEDs, accessories,
paint masks, bot cards, transcript text, navigation, general chrome, All-bots
Home, Coffee, Signal, Debate, Story, Slate, group rooms, or replay/session
snapshots. Those surfaces remain primary-only.

Private/incognito presentation suppresses persona color entirely, including
both primary and accent Atmosphere tokens.

At runtime, `--bot-primary-color` and `--bot-accent-color` are the semantic
inputs. `--bot-chat-gradient` is the derived Chat Atmosphere; Zen derives its
restrained wash from the same inputs. `--bot-color` remains a primary-color
compatibility alias and must not be repurposed as the environmental accent.

## Portability and compatibility

`accentColor` is optional in the existing v2 `.bot` payload. Older archives
without it remain valid and import as Auto. Account backup/restore, clone,
Marketplace bundle/catalog normalization, and generated drafts preserve the
nullable field. Derived Auto colors are never serialized.

Future paint-decoration masks may opt in only through an explicit semantic
accent token and a documented consumer update. They must not inherit accent
merely because the token exists.
