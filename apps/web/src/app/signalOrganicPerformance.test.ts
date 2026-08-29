import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildSignalListenerReactionPlanV1,
  buildSignalStudioIncidentEventV1,
  buildSignalVoicePerformancePlanV2,
  listenerReactionSequencePlansV1,
  withSignalListenerSequenceV1,
} from "@localai/shared";
import { signalOrganicCaptionPresentationV1 } from "./signalOrganicCaption.ts";
import { voicePerformanceMediaPlaybackRateV2 } from "./voiceEffects.ts";
import {
  playSignalStudioIncidentAudio,
  signalStudioIncidentCaptionAtProgressV1,
} from "./signalStudioIncidentAudio.ts";

const experienceSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("Signal organic performance presentation", () => {
  it("applies bounded keyframes on pitch-preserving media playback", () => {
    const plan = buildSignalVoicePerformancePlanV2({
      messageId: "message-1",
      seed: "signal-rate-test",
      canonicalText:
        "This measured sentence carries one safe clause, and enough remaining material to stage a natural cadence without changing history.",
    });
    assert.ok(plan);
    for (const progress of [0, 0.2, 0.5, 0.8, 1]) {
      const rate = voicePerformanceMediaPlaybackRateV2({
        baseRate: 1,
        plan,
        progress,
      });
      assert.ok(rate >= 0.93 && rate <= 1.07);
    }
    const voiceSource = readFileSync(
      new URL("./voiceEffects.ts", import.meta.url),
      "utf8",
    );
    assert.match(voiceSource, /audio\.preservesPitch = true/u);
    assert.match(voiceSource, /onPerformanceCaption/u);
  });

  it("plays audible incidents from bundled local assets with pitch preservation", () => {
    let played = false;
    const audio = {
      currentTime: 0,
      playbackRate: 1,
      preservesPitch: false,
      preload: "",
      volume: 1,
      addEventListener: () => undefined,
      pause: () => undefined,
      play: async () => {
        played = true;
      },
    };
    let incident = null;
    for (let index = 0; index < 500 && !incident; index += 1) {
      const candidate = buildSignalStudioIncidentEventV1({
        episodeId: `audible-incident-${index}`,
        showId: "show-1",
        sourceMessageId: "message-1",
        actorBotId: "host-1",
        hostBotId: "host-1",
        guestBotId: "guest-1",
        speakerRole: "host",
        turnOrdinal: 5,
        alreadyOccurred: false,
      });
      if (candidate?.beats.some((beat) => beat.kind === "foley")) {
        incident = candidate;
      }
    }
    assert.ok(incident?.audible, "fixture must find an audible Foley incident");
    assert.equal(
      playSignalStudioIncidentAudio(incident, {
        createAudio: () => audio,
        schedule: (callback) => callback(),
      }),
      true,
    );
    assert.equal(audio.preservesPitch, true);
    assert.ok(audio.volume > 0 && audio.volume < 0.25);
    assert.equal(played, true);
  });

  it("reconstructs public captions and plural reactions from saved events", () => {
    assert.deepEqual(signalOrganicCaptionPresentationV1("…"), {
      kind: "animated_ellipsis",
      accessibleText: "hesitating",
      dots: 3,
    });

    let pluralReactionCount = 0;
    for (let index = 0; index < 500 && pluralReactionCount < 2; index += 1) {
      const base = buildSignalListenerReactionPlanV1({
        episodeId: "web-replay-sequence",
        messageId: `message-${index}`,
        speakerBotId: "host-1",
        listenerBotId: "guest-1",
        listenerRole: "guest",
        segment: "interview",
        mood: "neutral",
        tensionLevel: 0,
        speakerText:
          "This longer explanation gives the listener enough room to react naturally while the main speaker keeps a clean and uninterrupted canonical turn.",
      });
      if (!base) continue;
      const sequenced = withSignalListenerSequenceV1({
        plan: { ...base, targetProgress: 0.44 },
        customLaughPreferred: false,
        wordCount: 54,
        speakerText:
          "This longer explanation gives the listener enough room to react naturally while the main speaker keeps a clean and uninterrupted canonical turn.",
      });
      pluralReactionCount = listenerReactionSequencePlansV1(sequenced).length;
    }
    assert.ok(pluralReactionCount >= 2);

    let captionIncident = null;
    for (let index = 0; index < 500 && !captionIncident; index += 1) {
      captionIncident = buildSignalStudioIncidentEventV1({
        episodeId: `caption-incident-${index}`,
        showId: "show-1",
        sourceMessageId: "message-1",
        actorBotId: "host-1",
        hostBotId: "host-1",
        guestBotId: "guest-1",
        speakerRole: "host",
        turnOrdinal: 5,
        alreadyOccurred: false,
      });
    }
    assert.ok(captionIncident);
    assert.ok(
      signalStudioIncidentCaptionAtProgressV1({
        incident: captionIncident,
        progress: captionIncident.startProgress,
      }),
    );

    assert.match(experienceSource, /botcastVoicePerformanceForMessageV2\(/u);
    assert.match(experienceSource, /botcastStudioIncidentForMessageV1\(/u);
    assert.match(experienceSource, /listenerReactionSequencePlansV1\(plan\)/u);
    assert.match(experienceSource, /replayHesitationCaption/u);
    assert.match(experienceSource, /studioIncidentCaptionText/u);
    assert.match(
      experienceSource,
      /playSignalStudioIncidentAudio\(studioIncident,\s*\{/u,
    );
    assert.match(pageSource, /streamChunks: !message\.organicVoicePerformance/u);
    assert.match(
      pageSource,
      /playbackPlan\.listenerLaughSource === "authored_local"[\s\S]{0,80}\? "builtin"/u,
    );
    assert.match(pageSource, /performancePlan:[\s\S]{0,100}message\.organicVoicePerformance/u);
  });

  it("does not re-synthesize procedural audio during faithful replay", () => {
    const replayProceduralStart = experienceSource.indexOf(
      "const replayProceduralAudioEnabled",
    );
    const stageStart = experienceSource.indexOf(
      "const renderStage =",
      replayProceduralStart,
    );
    const replayAudio = experienceSource.slice(replayProceduralStart, stageStart);
    assert.ok(replayProceduralStart >= 0 && stageStart > replayProceduralStart);
    assert.doesNotMatch(replayAudio, /playSignalStudioIncidentAudio/u);
  });
});
