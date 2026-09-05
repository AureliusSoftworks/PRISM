import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { botcastPreSessionImageRevealHostTurnV1, type BotcastEpisode, type BotcastImageContextV1, type ReplayTimelineV1 } from "@localai/shared";
import { mergeSignalEpisodeImageEvents, signalEpisodeImageProxyUrl, signalEpisodeImagesForTurn, signalEpisodeOriginalIds } from "./signalEpisodeImages.ts";
import { signalEpisodeRetryDraft } from "./signalEpisodeRetry.ts";
import { signalEpisodeStageImageContext, signalPreSessionEpisodeImageCueForNextTurn } from "./signalEpisodeImagePresentation.ts";
import { MODE_TUTORIALS } from "./modeTutorials.ts";
import { signalReplayVideoFrameState } from "./signalReplayVideoFrame.ts";

const picture = (id: string, phase: BotcastImageContextV1["phase"], origin: "setup" | "live" = "live") => ({
  v: 1, imageId: id, origin, kind: "picture", name: id, mimeType: "image/png", provider: "local", model: "llava",
  replayEmoji: "🖼️", replayProxyId: id, savedAssetId: null, phase,
  hostIntroductionMessageId: phase === "queued" ? null : `intro-${id}`,
  guestDiscussionMessageId: null, hostFollowUpMessageId: null,
});
const episode = (images: ReturnType<typeof picture>[]) => ({
  id: "episode", guestBotId: "guest", topic: "Pictures", producerBrief: "", guestBrief: "", model: "llava", responseMode: "local", durationMinutes: 8,
  messages: [], status: "live", events: images.map((image, index) => ({ id: `event-${index}`, kind: "image_context", sequence: index + 1, payload: image })),
}) as unknown as BotcastEpisode;

describe("successive Signal image web state", () => {
  it("resolves video frames by the recorded utterance, holds pictures between turns, and never restores a callback", () => {
    const state = episode([picture("a", "dismissed", "setup"), picture("b", "dismissed"), picture("c", "dismissed"), picture("future", "queued")]);
    state.messages = ["intro-a", "intro-b", "intro-c", "callback"].map((id) => ({ id, speakerRole: "host", content: id })) as BotcastEpisode["messages"];
    const timeline: ReplayTimelineV1 = { v: 1, durationMs: 8000, beats: state.messages.map((message, index) => ({
      id: message.id, kind: "utterance", startMs: index * 2000, endMs: index * 2000 + 1000,
      utteranceId: message.id, sourceMessageId: message.id, speakerId: "host", speakerName: "Host", text: message.content, channel: "primary",
    })) };
    for (const [atMs, expected] of [[500, "a"], [1500, "a"], [2500, "b"], [4500, "c"], [6500, null]] as const) {
      assert.equal(signalReplayVideoFrameState({ episode: state, timeline, videoElapsedMs: atMs }).imageContext?.imageId ?? null, expected);
    }
  });
  it("keeps setup and live tutorial guidance consistent with successive pictures", () => {
    const setup = MODE_TUTORIALS.botcast.steps.find((step) => step.heading === "Book tonight’s episode")!.body;
    const live = MODE_TUTORIALS.botcast.steps.find((step) => step.heading === "Produce from the control room")!.body;
    assert.match(setup, /Produce can add further pictures live/u);
    assert.match(setup, /Watch keeps its single pre-show picture/u);
    assert.match(live, /Add image queues it for the next eligible host turn/u);
    assert.match(live, /Editing never pauses speech/u);
    assert.match(live, /reattach the requested originals/u);
    assert.match(live, /Live shows run continuously until they end or you cut them/u);
    assert.match(live, /show continues automatically/u);
    assert.doesNotMatch(live, /Resume episode|In progress|resume the rundown|accepts exactly one|transparent PNG item offers/u);
  });
  it("retains current, previous and pending only, and chooses attachments independently from pending", () => {
    const state = episode([picture("a", "dismissed", "setup"), picture("b", "dismissed"), picture("c", "discussing"), picture("d", "queued")]);
    assert.deepEqual(signalEpisodeOriginalIds(state), ["c", "b", "d"]);
    assert.equal(signalEpisodeImagesForTurn(state).current?.imageId, "c");
    assert.equal(signalEpisodeImagesForTurn(state).previous?.imageId, "b");
    assert.equal(signalEpisodeImagesForTurn(state, "d").previous?.imageId, "c");
    assert.equal(signalEpisodeStageImageContext({ events: state.events, activeMessageId: "intro-a" })?.imageId, "a");
  });
  it("merges stale registration and turn responses without reverting image lifecycle or revealing unheard messages", () => {
    const older = episode([picture("a", "discussing")]);
    const registration = episode([picture("a", "discussing"), picture("b", "queued")]);
    const live = episode([picture("a", "discussing"), picture("b", "queued"), picture("a", "dismissed"), picture("b", "presented")]);
    live.messages = [{ id: "live-message" }] as BotcastEpisode["messages"];
    const merged = mergeSignalEpisodeImageEvents(live, registration);
    assert.equal(merged, live, "a stale response with no new image events must remain a React state no-op");
    assert.equal(mergeSignalEpisodeImageEvents(live, live), live);
    assert.deepEqual(merged.messages, live.messages);
    assert.equal(signalEpisodeImagesForTurn(merged).current?.imageId, "b");
    assert.equal(mergeSignalEpisodeImageEvents(older, registration).events.length, 2);
    assert.deepEqual(mergeSignalEpisodeImageEvents(older, registration).messages, []);
  });
  it("restores setup rather than later live images and keys every proxy URL", () => {
    const state = episode([picture("setup", "dismissed", "setup"), picture("live", "discussing")]);
    const retry = signalEpisodeRetryDraft({ episode: state, availableGuestIds: ["guest"], availableModelIds: ["llava"], currentResponseMode: "local", retryMetadata: { image: { imageId: "setup", reason: "private setup note" } } });
    assert.equal(retry.image?.imageId, "setup");
    assert.equal(retry.image?.reason, "private setup note");
    assert.notEqual(signalEpisodeImageProxyUrl("episode", "setup"), signalEpisodeImageProxyUrl("episode", "live"));
    assert.match(signalEpisodeImageProxyUrl("a/b", "x&y"), /a%2Fb\/image-proxy\?imageId=x%26y/u);
  });
  it("keeps registered setup timing and wires a non-pausing editor plus voice-onset reveal", () => {
    const state = episode([picture("setup", "queued", "setup")]);
    assert.equal(signalPreSessionEpisodeImageCueForNextTurn({ episodeId: state.id, messages: [], pendingImage: { episodeId: state.id, imageId: "setup", preSessionReveal: true }, imageContext: { imageId: "setup", phase: "queued" }, higherPriorityCuePending: true }), null);
    const source = readFileSync(new URL("./BotcastExperience.tsx", import.meta.url), "utf8");
    const editor = source.slice(source.indexOf('const selectProducerImageDraft'), source.indexOf('const isEditableTarget', source.indexOf('const selectProducerImageDraft')));
    assert.doesNotMatch(editor, /sendCue\(|beginEpisodeOperation\(|stopUtterance\(|setSignalProducerComposing\(/u);
    assert.match(source, /const notifyPlaybackStart[\s\S]{0,250}setPresentedSignalImageMessageId\(message.id\)/u);
    assert.match(source, /data-tutorial-target="botcast-live-image-editor"/u);
    assert.match(source, /signalEpisodeImageProxyUrl\(episodeId, context.imageId\)/u);
    assert.match(source, /original pictures to continue/u);
  });
  it("reaches setup's scheduled reveal after refresh so missing originals trigger reattachment", () => {
    const episodeId = "refreshed-episode";
    const imageId = "setup";
    const slot = botcastPreSessionImageRevealHostTurnV1({ episodeId, imageId });
    const messages = Array.from({ length: (slot - 1) * 2 }, (_, index) => ({ speakerRole: index % 2 ? "guest" as const : "host" as const }));
    const cue = signalPreSessionEpisodeImageCueForNextTurn({ episodeId, messages, pendingImage: null,
      imageContext: { imageId, phase: "queued", origin: "setup" }, higherPriorityCuePending: false });
    assert.deepEqual(cue, { kind: "present_image", imageId });
    assert.equal(signalPreSessionEpisodeImageCueForNextTurn({ episodeId, messages, pendingImage: null,
      imageContext: { imageId, phase: "presented", origin: "setup" }, higherPriorityCuePending: false }), null);
  });
});
