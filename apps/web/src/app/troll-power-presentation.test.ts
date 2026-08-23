import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const appDir = path.resolve(import.meta.dirname);
const apiDir = path.resolve(appDir, "../../../api/src");

test("ordinary Troll interruption immunity is enforced across live UI and API paths", () => {
  const page = fs.readFileSync(path.join(appDir, "page.tsx"), "utf8");
  const signal = fs.readFileSync(
    path.join(appDir, "BotcastExperience.tsx"),
    "utf8",
  );
  const server = fs.readFileSync(path.join(apiDir, "server.ts"), "utf8");
  const zenDiscard = fs.readFileSync(
    path.join(apiDir, "zen-message-discard.ts"),
    "utf8",
  );

  assert.match(page, /activeTrollOrdinaryInterruptionImmune/u);
  assert.match(page, /Troll keeps talking/u);
  assert.match(page, /await waitForCoffeeRevealToSettle/u);
  assert.match(signal, /producerGuestHostTrollImmune/u);
  assert.match(signal, /Troll keeps the Signal mic/u);
  assert.match(server, /Troll ambush ignores ordinary Shh/u);
  assert.match(server, /coffeeSessionBotIsTrollV1/u);
  assert.match(zenDiscard, /Troll ambush ignores ordinary Shh/u);
});

test("all voiced Troll surfaces reuse bundled corporality Foley", () => {
  const page = fs.readFileSync(path.join(appDir, "page.tsx"), "utf8");
  assert.match(page, /buildBundledActionSfxPlan\(message\.content\)/u);
  assert.match(page, /buildBundledActionSfxPlan\(beat\.text\)/u);
  assert.match(page, /playPreparedCoffeeActionSfx\(\{/u);
  assert.match(page, /seed: `chat:\$\{activeAssistantRevealKey\}`/u);
});

test("mode adapters persist the shared Troll presentation projection", () => {
  const chat = fs.readFileSync(path.join(apiDir, "chat.ts"), "utf8");
  const coffee = fs.readFileSync(path.join(apiDir, "coffee.ts"), "utf8");
  const signal = fs.readFileSync(path.join(apiDir, "botcast.ts"), "utf8");
  const debate = fs.readFileSync(path.join(apiDir, "debate.ts"), "utf8");
  const story = fs.readFileSync(path.join(apiDir, "story.ts"), "utf8");
  for (const source of [chat, coffee, signal, debate, story]) {
    assert.match(source, /applyBotPowerTrollTurnV1/u);
    assert.match(source, /botPowerTrollPresentation/u);
  }
});
