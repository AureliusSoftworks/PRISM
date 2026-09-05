import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  botHubVoicePreviewMouthSnapshot,
  publishBotHubVoicePreviewMouth,
  resetBotHubVoicePreviewMouth,
  resetBotHubVoicePreviewMouthForTests,
  subscribeBotHubVoicePreviewMouth,
} from "./botHubVoicePreviewMouth.ts";

describe("Bot Hub voice preview mouth store", () => {
  afterEach(() => resetBotHubVoicePreviewMouthForTests());

  it("notifies the isolated avatar only when the semantic mouth pose changes", () => {
    let notifications = 0;
    const unsubscribe = subscribeBotHubVoicePreviewMouth(() => {
      notifications += 1;
    });

    assert.equal(
      publishBotHubVoicePreviewMouth({
        botId: "stewie",
        talking: true,
        mouthShape: "open-small",
      }),
      true,
    );
    assert.equal(notifications, 1);
    assert.equal(
      publishBotHubVoicePreviewMouth({
        botId: "stewie",
        talking: true,
        mouthShape: "open-small",
      }),
      false,
    );
    assert.equal(notifications, 1);

    assert.equal(
      publishBotHubVoicePreviewMouth({
        botId: "stewie",
        talking: true,
        mouthShape: "open-wide",
      }),
      true,
    );
    assert.equal(notifications, 2);
    assert.deepEqual(botHubVoicePreviewMouthSnapshot(), {
      botId: "stewie",
      talking: true,
      mouthShape: "open-wide",
    });
    unsubscribe();
  });

  it("normalizes silent previews and resets stale bot ownership", () => {
    publishBotHubVoicePreviewMouth({
      botId: "stewie",
      talking: false,
      mouthShape: "open-wide",
    });
    assert.deepEqual(botHubVoicePreviewMouthSnapshot(), {
      botId: "stewie",
      talking: false,
      mouthShape: "closed",
    });

    resetBotHubVoicePreviewMouth();
    assert.deepEqual(botHubVoicePreviewMouthSnapshot(), {
      botId: null,
      talking: false,
      mouthShape: "closed",
    });
  });
});
