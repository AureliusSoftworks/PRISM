import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildConversationHistoryEntry } from "../conversation-history.ts";

const timestamps = {
  created_at: "2026-07-14T10:00:00.000Z",
  updated_at: "2026-07-14T11:00:00.000Z",
};

describe("buildConversationHistoryEntry", () => {
  it("keeps Prism and persona Homes stable across speakers and episodes", () => {
    const prism = buildConversationHistoryEntry(
      { id: "prism-episode", conversation_mode: "zen", bot_id: null, ...timestamps },
      {
        hubMetadata: { hubRole: "hub", hubBotId: null, parentHubId: null },
        participantBotIds: ["guest-bot"],
      }
    );
    assert.equal(prism.contextKey, "prism");
    assert.equal(prism.contextKind, "prism_home");
    assert.equal(prism.ownerBotId, null);
    assert.deepEqual(prism.participantBotIds, ["guest-bot"]);

    const firstEpisode = buildConversationHistoryEntry(
      { id: "persona-episode-1", conversation_mode: "zen", bot_id: "bot-a", ...timestamps },
      {
        hubMetadata: { hubRole: "hub", hubBotId: "bot-a", parentHubId: null },
        participantBotIds: ["bot-b"],
        continuationConversationId: "persona-episode-2",
      }
    );
    const secondEpisode = buildConversationHistoryEntry(
      { id: "persona-episode-2", conversation_mode: "zen", bot_id: "bot-a", ...timestamps },
      {
        hubMetadata: { hubRole: "hub", hubBotId: "bot-a", parentHubId: null },
        continuationConversationId: "persona-episode-2",
      }
    );
    assert.equal(firstEpisode.contextKey, "bot:bot-a");
    assert.equal(secondEpisode.contextKey, firstEpisode.contextKey);
    assert.equal(firstEpisode.episodeId, "persona-episode-1");
    assert.equal(firstEpisode.continuationConversationId, "persona-episode-2");
    assert.equal(firstEpisode.ownerBotId, "bot-a");
    assert.deepEqual(firstEpisode.participantBotIds, ["bot-a", "bot-b"]);
  });

  it("represents forks without moving them into the last speaker's Home", () => {
    const fork = buildConversationHistoryEntry(
      {
        id: "fork-1",
        conversation_mode: "chat",
        bot_id: "guest-bot",
        parent_id: "prism-episode",
        ...timestamps,
      },
      {
        hubMetadata: {
          hubRole: "side",
          hubBotId: "guest-bot",
          parentHubId: "prism-episode",
        },
      }
    );
    assert.equal(fork.contextKey, "side:fork-1");
    assert.equal(fork.contextKind, "side_chat");
    assert.equal(fork.rootConversationId, "prism-episode");
    assert.deepEqual(fork.origin, { kind: "fork", id: "prism-episode" });
  });

  it("distinguishes one-off Coffee from saved Coffee Groups", () => {
    const oneOff = buildConversationHistoryEntry({
      id: "coffee-1",
      conversation_mode: "coffee",
      bot_group_ids: JSON.stringify(["bot-a", "bot-b"]),
      ...timestamps,
    });
    const savedGroup = buildConversationHistoryEntry({
      id: "coffee-2",
      conversation_mode: "coffee",
      coffee_group_id: "group-1",
      bot_group_ids: JSON.stringify(["bot-a", "bot-c"]),
      ...timestamps,
    });
    assert.equal(oneOff.contextKey, "coffee:coffee-1");
    assert.equal(oneOff.contextKind, "coffee_session");
    assert.deepEqual(oneOff.origin, { kind: "coffee", id: "coffee-1" });
    assert.equal(savedGroup.contextKey, "coffee-group:group-1");
    assert.equal(savedGroup.contextKind, "coffee_group");
    assert.deepEqual(savedGroup.origin, { kind: "saved_group", id: "group-1" });
    assert.equal(savedGroup.nativeRoute.coffeeGroupId, "group-1");
  });

  it("keeps deleted identities readable and marks archived and legacy rows", () => {
    const deletedPersona = buildConversationHistoryEntry(
      {
        id: "deleted-persona",
        conversation_mode: "zen",
        bot_id: "deleted-bot-id",
        archived_at: "2026-07-14T12:00:00.000Z",
        ...timestamps,
      },
      {
        hubMetadata: {
          hubRole: "hub",
          hubBotId: "deleted-bot-id",
          parentHubId: null,
        },
      }
    );
    const legacy = buildConversationHistoryEntry({
      id: "legacy-chat",
      conversation_mode: "chat",
      bot_id: "deleted-bot-id",
      ...timestamps,
    });
    assert.equal(deletedPersona.contextKey, "bot:deleted-bot-id");
    assert.equal(deletedPersona.archived, true);
    assert.equal(legacy.contextKind, "legacy");
    assert.equal(legacy.ownerBotId, "deleted-bot-id");
  });
});
