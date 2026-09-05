import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

function source(name: string): string {
  return readFileSync(new URL(name, import.meta.url), "utf8");
}

describe("private speech intent reveal UI", () => {
  it("fetches intent only on player activation and clears it on close", () => {
    const component = source("./SpeechIntentReveal.tsx");
    assert.match(component, /"\/api\/speech-intent\/reveal"/u);
    assert.match(component, /onClick=\{\(\) => void reveal\(\)\}/u);
    assert.match(component, /onClick=\{\(\) => setIntendedSpeech\(null\)\}/u);
    assert.match(component, /What they meant/u);
    assert.doesNotMatch(component, /navigator\.clipboard|localStorage|sessionStorage/u);
  });

  it("is wired only from supported committed public surfaces", () => {
    const page = source("./page.tsx");
    const signal = source("./BotcastExperience.tsx");
    const debate = source("./DebateExperience.tsx");
    assert.match(page, /mode="coffee"/u);
    assert.match(page, /mode=\{detail\?\.mode === "chat" \? "chat" : "zen"\}/u);
    assert.match(page, /mode="story"/u);
    assert.match(signal, /speechReveal\?\.phase === "ended"/u);
    assert.match(signal, /mode="signal"/u);
    assert.match(debate, /data-completed="true"[\s\S]*mode="debate"/u);
  });
});
