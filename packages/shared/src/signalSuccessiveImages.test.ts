import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  botcastActiveImageContextV1, botcastImageContextByIdV1, botcastImageContextForMessageV1,
  botcastImageHistoryV1, botcastPendingImageContextV1, botcastPreviousImageContextV1,
  botcastSetupImageContextV1, normalizeBotcastImageContextV1,
  type BotcastImageContextV1,
} from "./botcast.ts";

const image = (imageId: string, patch: Partial<BotcastImageContextV1> = {}): BotcastImageContextV1 => ({
  v: 1, imageId, origin: "live", groundedVisualDescription: `Visible ${imageId}`,
  kind: "picture", name: imageId, mimeType: "image/png", provider: "local", model: "llava",
  replayEmoji: "🖼️", replayProxyId: imageId, savedAssetId: null, phase: "queued",
  hostIntroductionMessageId: null, guestDiscussionMessageId: null, hostFollowUpMessageId: null,
  ...patch,
});
const event = (context: BotcastImageContextV1) => ({ kind: "image_context" as const, payload: { ...context } });

describe("successive Signal image projections", () => {
  it("keeps registration order, independent active/pending state, and all message links across interleaved updates", () => {
    const first = image("first", { origin: "setup", phase: "presented", hostIntroductionMessageId: "intro-1" });
    const second = image("second");
    const events = [event(first), event(second), event({ ...first, phase: "discussing", guestDiscussionMessageId: "guest-1" })];
    assert.deepEqual(botcastImageHistoryV1(events).map((entry) => entry.imageId), ["first", "second"]);
    assert.equal(botcastPendingImageContextV1(events)?.imageId, "second");
    assert.equal(botcastActiveImageContextV1(events)?.imageId, "first");
    assert.equal(botcastImageContextForMessageV1(events, "intro-1")?.imageId, "first");
    assert.equal(botcastImageContextForMessageV1(events, "guest-1")?.imageId, "first");
    assert.equal(botcastPreviousImageContextV1(events, "second")?.imageId, "first");
    events.push(event({ ...first, phase: "dismissed" }), event({ ...second, phase: "presented", hostIntroductionMessageId: "intro-2" }), event(image("third")));
    assert.equal(botcastActiveImageContextV1(events)?.imageId, "second");
    assert.equal(botcastImageContextForMessageV1(events, "intro-1")?.imageId, "first");
    assert.equal(botcastImageContextForMessageV1(events, "intro-2")?.imageId, "second");
    assert.equal(botcastImageContextForMessageV1(events, "unrelated"), null);
    assert.equal(botcastImageContextByIdV1(events, "third")?.phase, "queued");
    assert.equal(botcastSetupImageContextV1(events)?.imageId, "first");
  });

  it("restores only explicit setup, with unknown-origin single-image compatibility", () => {
    assert.equal(botcastSetupImageContextV1([event(image("live"))]), null);
    assert.equal(botcastSetupImageContextV1([event(image("legacy", { origin: undefined, kind: "item" }))])?.imageId, "legacy");
    assert.equal(botcastSetupImageContextV1([event(image("unknown-1", { origin: undefined })), event(image("unknown-2", { origin: undefined }))]), null);
  });

  it("normalizes descriptions and origin without accepting private notes or raw pixels", () => {
    const normalized = normalizeBotcastImageContextV1({ ...image("bounded"), groundedVisualDescription: " x ", reason: "private", dataUrl: "raw" });
    assert.equal(normalized?.groundedVisualDescription, "x");
    assert.equal(normalized?.origin, "live");
    assert.equal("reason" in normalized!, false);
    assert.equal("dataUrl" in normalized!, false);
  });
});
