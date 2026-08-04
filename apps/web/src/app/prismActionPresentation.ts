import type { PrismActionRunStatusV1 } from "@localai/shared";

const PRISM_ACTION_LABELS: Readonly<Record<string, string>> = {
  "backup.export": "Export backup",
  "bots.avatar.eye-count.batch": "Update bot eyes",
  "bots.contextual.batch": "Update bots",
  "bots.create": "Create a bot",
  "bots.delete": "Delete a bot",
  "bots.fields.batch": "Update bots",
  "bots.fields.update": "Update a bot",
  "conversations.quarantine": "Delete conversations",
  "debate.session.delete": "Delete a Debate",
  "default-bot.fields.update": "Update Default Prism",
  "images.delete": "Delete an image",
  "library.favorites.update": "Update Favorites",
  "library.group.create": "Create a Library group",
  "library.groups.replace": "Update Library groups",
  "library.protection.unprotect": "Remove Library protection",
  "marketplace.install": "Install from Marketplace",
  "memories.delete": "Delete memories",
  "notifications.elevenlabs-credit.monitor": "Update ElevenLabs alert",
  "settings.fields.update": "Update settings",
  "settings.online-model.update": "Change online model",
  "signal.episode.create": "Create a Signal episode",
  "signal.episode.stage": "Prepare a Signal episode",
  "signal.episodes.delete": "Delete Signal episodes",
  "signal.latest.export-to-slate": "Export Signal to Slate",
  "signal.show.text.update": "Update a Signal show",
  "slate.project.create": "Create a Slate project",
  "slate.project.fields.update": "Update a Slate project",
  "slate.series.create": "Create a Slate series",
  "story.session.advance": "Continue a Story",
  "story.session.create": "Start a Story",
  "story.session.delete": "Delete a Story",
  "usage.elevenlabs-credits.query": "Check ElevenLabs credits",
  "usage.top-bots.query": "Check most-used bots",
};

export function prismActionLabel(capabilityId: string): string {
  return PRISM_ACTION_LABELS[capabilityId] ?? "PRISM action";
}

export function prismActionStatusLabel(
  status: PrismActionRunStatusV1,
): string {
  if (status === "committed") return "Completed";
  if (status === "undone") return "Undone";
  if (status === "failed") return "Failed";
  if (status === "undo-failed") return "Undo failed";
  return "In progress";
}
