import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  messageContainsYouTubeVideoLink,
  resolveYouTubeVideoEmbedForLink,
  resolveYouTubeVideoLink,
  splitMarkdownByYouTubeVideoLinks,
} from "./youtubeEmbed.ts";

describe("resolveYouTubeVideoLink", () => {
  it("supports common YouTube video URL shapes", () => {
    const ids = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://youtube.com/shorts/dQw4w9WgXcQ",
      "https://youtube.com/live/dQw4w9WgXcQ",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ].map((url) => resolveYouTubeVideoLink(url)?.videoId);
    assert.deepEqual(ids, [
      "dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
    ]);
  });

  it("preserves start time from t or start", () => {
    const fromT = resolveYouTubeVideoLink("https://youtu.be/dQw4w9WgXcQ?t=1m30s");
    const fromStart = resolveYouTubeVideoLink(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=45"
    );
    assert.equal(fromT?.startSeconds, 90);
    assert.match(fromT?.embedUrl ?? "", /start=90/u);
    assert.equal(fromStart?.startSeconds, 45);
    assert.match(fromStart?.canonicalUrl ?? "", /t=45/u);
  });

  it("leaves playlist-only, malformed, and non-YouTube links alone", () => {
    assert.equal(resolveYouTubeVideoLink("https://www.youtube.com/playlist?list=abc"), null);
    assert.equal(resolveYouTubeVideoLink("https://www.youtube.com/watch?v=too-short"), null);
    assert.equal(resolveYouTubeVideoLink("https://notyoutube.com/watch?v=dQw4w9WgXcQ"), null);
  });
});

describe("messageContainsYouTubeVideoLink", () => {
  it("detects valid links inside longer markdown", () => {
    assert.equal(
      messageContainsYouTubeVideoLink(
        "Start here https://youtu.be/dQw4w9WgXcQ then this https://youtube.com/shorts/aqz-KE-bpKQ."
      ),
      true
    );
  });

  it("ignores invalid YouTube-looking text", () => {
    assert.equal(
      messageContainsYouTubeVideoLink("Try https://www.youtube.com/channel/abc instead."),
      false
    );
  });
});

describe("resolveYouTubeVideoEmbedForLink", () => {
  it("gates embeds behind the Zen-only renderer flag", () => {
    const url = "https://youtu.be/dQw4w9WgXcQ";
    assert.equal(resolveYouTubeVideoEmbedForLink(url, false), null);
    assert.equal(resolveYouTubeVideoEmbedForLink(url, true)?.videoId, "dQw4w9WgXcQ");
  });
});

describe("splitMarkdownByYouTubeVideoLinks", () => {
  it("lifts a bare YouTube link into its own part", () => {
    const parts = splitMarkdownByYouTubeVideoLinks(
      "Remember, whenever I want to listen to jazz, share this link:\n\nhttps://youtu.be/j0VOw7vuQrM?list=RDj0VOw7vuQrM"
    );

    assert.equal(parts.length, 2);
    assert.equal(parts[0]?.kind, "markdown");
    assert.match(parts[0]?.kind === "markdown" ? parts[0].markdown : "", /listen to jazz/u);
    assert.doesNotMatch(
      parts[0]?.kind === "markdown" ? parts[0].markdown : "",
      /youtu\.be/u
    );
    assert.equal(parts[1]?.kind, "youtube");
    assert.equal(parts[1]?.kind === "youtube" ? parts[1].video.videoId : "", "j0VOw7vuQrM");
  });

  it("separates a YouTube link from surrounding prose", () => {
    const parts = splitMarkdownByYouTubeVideoLinks(
      "Play this https://youtu.be/dQw4w9WgXcQ after dinner."
    );

    assert.deepEqual(
      parts.map((part) => part.kind),
      ["markdown", "youtube", "markdown"]
    );
    assert.equal(parts[0]?.kind === "markdown" ? parts[0].markdown : "", "Play this ");
    assert.equal(parts[2]?.kind === "markdown" ? parts[2].markdown : "", " after dinner.");
  });

  it("returns multiple video links as multiple cards", () => {
    const parts = splitMarkdownByYouTubeVideoLinks(
      "One https://youtu.be/dQw4w9WgXcQ and two https://youtube.com/shorts/aqz-KE-bpKQ."
    );

    assert.equal(parts.filter((part) => part.kind === "youtube").length, 2);
    assert.deepEqual(
      parts.filter((part) => part.kind === "youtube").map((part) => part.video.videoId),
      ["dQw4w9WgXcQ", "aqz-KE-bpKQ"]
    );
  });

  it("keeps invalid YouTube-looking markdown unchanged", () => {
    const source = "Try https://www.youtube.com/channel/abc instead.";
    assert.deepEqual(splitMarkdownByYouTubeVideoLinks(source), [
      { kind: "markdown", markdown: source },
    ]);
  });

  it("lifts Markdown links and preserves their label", () => {
    const parts = splitMarkdownByYouTubeVideoLinks(
      "Listen to [this jazz cut](https://youtu.be/j0VOw7vuQrM?t=45)."
    );

    assert.deepEqual(
      parts.map((part) => part.kind),
      ["markdown", "youtube", "markdown"]
    );
    assert.equal(parts[1]?.kind === "youtube" ? parts[1].label : "", "this jazz cut");
    assert.equal(parts[1]?.kind === "youtube" ? parts[1].video.startSeconds : 0, 45);
    assert.equal(parts[2]?.kind === "markdown" ? parts[2].markdown : "", ".");
  });
});
