import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  voiceIntonationDetuneCents,
  voiceIntonationPlanForProfile,
} from "@localai/shared";

const effectsSource = readFileSync(
  new URL("./voiceEffects.ts", import.meta.url),
  "utf8",
);

describe("dialect intonation playback wiring", () => {
  it("adds the contour to both formant-corrected pitch automation paths", () => {
    // Offline render path: contour spans the source buffer as the phrase.
    assert.match(
      effectsSource,
      /voiceLiltDetuneCents\(profile\.lilt, elapsedSeconds\) \+\s*\/\/ Dialect intonation[\s\S]{0,220}?voiceIntonationDetuneCents\(\s*intonationPlan,\s*elapsedSeconds,\s*speechDurationSeconds,\s*\)/u,
    );
    // Realtime path: contour joins lilt and pitch correction in the schedule.
    assert.match(
      effectsSource,
      /voiceLiltDetuneCents\(profile\.lilt, elapsedSeconds\) \+\s*voiceIntonationDetuneCents\(\s*intonationPlan,\s*elapsedSeconds,\s*playbackDurationSeconds,\s*\) \+\s*voicePitchCorrectionCentsAt/u,
    );
    // Pitch-correction analysis sees the same offsets playback will apply.
    assert.match(
      effectsSource,
      /pitchOffsetCentsAt: \(elapsedSeconds\) =>[\s\S]{0,220}?voiceIntonationDetuneCents\(\s*voiceIntonationPlanForProfile\(profile\),\s*elapsedSeconds,\s*playbackDurationSeconds,\s*\)/u,
    );
  });

  it("schedules automation for contour-only voices and lands the terminal keyframe", () => {
    assert.match(
      effectsSource,
      /if \(profile\.lilt !== 0 \|\| intonationPlan\) \{/u,
    );
    assert.match(
      effectsSource,
      /pitchAutomationTimes\.add\(Math\.max\(0, playbackDurationSeconds - 0\.02\)\);/u,
    );
  });

  it("keeps the pin as the single source of the tune", () => {
    // The playback layer derives the plan from the profile it already holds;
    // no new fields, headers, or persistence are involved.
    assert.match(
      effectsSource,
      /const intonationPlan = voiceIntonationPlanForProfile\(profile\);/u,
    );
    const irish = voiceIntonationPlanForProfile({
      accentDefinitionId: "irish-english",
      speechprintStrength: "balanced",
    });
    const scottish = voiceIntonationPlanForProfile({
      accentDefinitionId: "scottish-english",
      speechprintStrength: "balanced",
    });
    assert.ok(irish && scottish);
    // The two Celtic pins end a phrase in audibly different places.
    const irishEnd = voiceIntonationDetuneCents(irish, 4, 4);
    const scottishEnd = voiceIntonationDetuneCents(scottish, 4, 4);
    assert.ok(irishEnd < 0 && scottishEnd < 0);
    assert.ok(Math.abs(irishEnd - scottishEnd) >= 20);
    // And they travel different roads to get there.
    assert.ok(
      voiceIntonationDetuneCents(irish, 1, 4) >
        voiceIntonationDetuneCents(scottish, 1, 4) + 30,
    );
  });
});
