import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const appDir = dirname(fileURLToPath(import.meta.url));
const pageSource = readFileSync(join(appDir, "page.tsx"), "utf8");
const cssSource = readFileSync(join(appDir, "page.module.css"), "utf8");
const coffeeSeatPlateEmojiSource = readFileSync(
  join(appDir, "CoffeeSeatPlateEmoji.tsx"),
  "utf8",
);
const publicCoffeeBarDir = join(appDir, "..", "..", "public", "coffee-bar");

describe("Coffee bar scene", () => {
  it("renders distinct frozen front and working baristas as live mannequins", () => {
    assert.match(
      pageSource,
      /const coffeeBarFrontSnapshot =[\s\S]*coffeeBarRitual\?\.frontBarista[\s\S]*const coffeeBarServiceBot = coffeeBarFrontSnapshot\?\.id[\s\S]*coffeeBotsById\.get\(coffeeBarFrontSnapshot\.id\)/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.coffeeBarServiceAvatar\}[\s\S]*<ZenLiveBotMannequin[\s\S]*glyph=\{coffeeBarServiceGlyph\}[\s\S]*faceStyle=\{coffeeBarServiceFaceStyle\}[\s\S]*avatarDetails=\{[\s\S]*coffeeBarServiceAvatarDetails/u,
    );
    assert.doesNotMatch(
      pageSource,
      /className=\{styles\.coffeeBarGlyph\}[\s\S]{0,80}☕/u,
    );
    assert.match(
      pageSource,
      /const coffeeBarServicePersonaBlurb = coffeeBarServiceBot[\s\S]*botHeroPreview\(coffeeBarServiceBot\.system_prompt, 140\)/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.coffeeBarServiceBlurb\}[\s\S]*coffeeBarServicePersonaBlurb[\s\S]*coffeeBarServiceInvitation/u,
    );
    assert.match(
      pageSource,
      /function coffeeBarInvitationForVoice/u,
    );
    assert.match(
      pageSource,
      /className=\{styles\.coffeeBarWorkingPresence\}[\s\S]*coffeeBarRitual\.workingBarista\.name[\s\S]*coffeeBarWorkingGlyph/u,
    );
    for (const invitation of [
      "Would you like some coffee",
      "Can I make you some coffee",
      "Coffee before you sit?",
      "shall we get you some coffee",
      "May I offer you some coffee",
    ]) {
      assert.equal(pageSource.includes(invitation), true);
    }
  });

  it("keeps the service face upright outside a Coffee seat wrapper", () => {
    assert.match(
      coffeeSeatPlateEmojiSource,
      /translateY\(var\(--coffee-plate-emoji-nudge-y, 0px\)\) rotate\(/u,
    );
  });

  it("explains where a generated special drink appears", () => {
    assert.match(
      pageSource,
      /Choose a drink for your silver Prism mug at the\s+table/u,
    );
    assert.match(
      pageSource,
      /shown inside your\s+Prism mug at the table/u,
    );
    assert.match(pageSource, /I&apos;ll take the…/u);
    assert.match(pageSource, />\s*Surprise me\s*</u);
    assert.match(pageSource, />\s*Standard house blend\s*</u);
    assert.match(pageSource, /scheduleCoffeeBarOrderPoll/u);
    assert.match(pageSource, /coffeeDrinkPreparationStatus/u);
    assert.match(pageSource, /coffeeBarDeliveryVisit/u);
    assert.match(
      pageSource,
      /const speakCoffeeBaristaServiceLine[\s\S]*startCoffeeVoiceForReveal/u,
    );
    assert.match(pageSource, /coffeePlayerCupFrame >= 6/u);
    assert.match(pageSource, /drinkReaction \? 10_000/u);
  });

  it("presents the ritual in a viewport-level modal", () => {
    assert.match(
      pageSource,
      /createPortal\([\s\S]*className=\{styles\.coffeeBarSceneBackdrop\}[\s\S]*role="dialog"[\s\S]*aria-modal="true"[\s\S]*data-tutorial-target="coffee-bar-ritual"/u,
    );
    assert.match(
      cssSource,
      /\.coffeeBarSceneBackdrop\s*\{[\s\S]*position:\s*fixed;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*950;/u,
    );
    assert.match(
      cssSource,
      /\.coffeeBarServiceAvatar\s*\{[\s\S]*--zen-live-bot-avatar-size:\s*clamp\(224px, 31vmin, 360px\);/u,
    );
    assert.match(
      cssSource,
      /\.coffeeBarServicePresence\s*\{[\s\S]*--coffee-bar-avatar-lift:\s*clamp\(120px, 15vh, 192px\);/u,
    );
    assert.match(
      cssSource,
      /@media \(max-width: 680px\)[\s\S]*\.coffeeBarServiceAvatar\s*\{[\s\S]*bottom:\s*0;/u,
    );
    assert.match(
      cssSource,
      /\.coffeeBarServiceBlurb\s*\{[\s\S]*bottom:\s*var\(--coffee-bar-avatar-lift\);[\s\S]*grid-area:\s*blurb;/u,
    );
    assert.match(
      cssSource,
      /\.coffeeBarServiceAvatar\s*\{[\s\S]*--bot-ambient-hover-amplitude:\s*10px;[\s\S]*animation:\s*coffeeBarServiceGlow 4\.8s ease-in-out infinite;/u,
    );
    assert.match(cssSource, /@keyframes coffeeBarServiceGlow/u);
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.coffeeBarServiceAvatar,[\s\S]*\.coffeeBarWorkingPresence\s*\{[\s\S]*animation:\s*none;/u,
    );
  });

  it("ships one shared matched environment for each app theme", () => {
    assert.match(cssSource, /url\("\/coffee-bar\/coffee-bar-dark\.webp"\)/u);
    assert.match(cssSource, /url\("\/coffee-bar\/coffee-bar-light\.webp"\)/u);
    assert.equal(existsSync(join(publicCoffeeBarDir, "coffee-bar-dark.webp")), true);
    assert.equal(existsSync(join(publicCoffeeBarDir, "coffee-bar-light.webp")), true);
  });
});
