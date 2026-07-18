import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const evidenceRoot = resolve(
  process.cwd(),
  ".codex/output/context-menu-audit",
);

async function fixtureIds(page: Page): Promise<string[]> {
  return page
    .getByLabel("Fixture", { exact: true })
    .locator("option")
    .evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value),
    );
}

async function openFixture(
  page: Page,
  fixture: string,
  theme: "dark" | "light",
  system: "before" | "after",
): Promise<void> {
  await page.keyboard.press("Escape");
  await page.getByLabel("Fixture", { exact: true }).selectOption(fixture);
  await page.getByLabel("Theme", { exact: true }).selectOption(theme);
  await page.getByLabel("System", { exact: true }).selectOption(system);
  await page.getByRole("button", { name: new RegExp(`^Open .*${fixture.split("-")[0]}`, "i") }).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe.serial("Unified PRISM context menu audit", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto("/qa-context-menus");
    await expect(page.getByLabel("Fixture", { exact: true })).toBeVisible();
  });

  test("captures deterministic before and after inventory in both themes", async ({
    page,
  }) => {
    const ids = await fixtureIds(page);
    for (const system of ["before", "after"] as const) {
      await mkdir(resolve(evidenceRoot, system), { recursive: true });
      for (const theme of ["dark", "light"] as const) {
        for (const fixture of ids) {
          await openFixture(page, fixture, theme, system);
          await page.getByRole("menu").screenshot({
            path: resolve(evidenceRoot, system, `${fixture}-${theme}.png`),
            animations: "disabled",
          });
        }
      }
    }
  });

  test("supports keyboard, radio, submenu, focus restoration, and single ownership", async ({
    page,
  }) => {
    await openFixture(page, "responsive-chat", "dark", "after");
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitemradio")).toHaveCount(2);
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem").last()).toBeFocused();
    await page.keyboard.press("Home");
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
    await page.keyboard.type("ref");
    await expect(menu.getByRole("menuitem", { name: "Refresh" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /Open Responsive/i })).toBeFocused();

    await openFixture(page, "app-switcher", "dark", "after");
    await page.getByRole("menuitem", { name: /Roadmap/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("menu")).toHaveCount(2);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("menu")).toHaveCount(1);

    await page.getByLabel("Fixture", { exact: true }).selectOption("slate-project");
    await page.getByRole("button", { name: /Open Slate/i }).click();
    await expect(page.getByRole("menu")).toHaveCount(1);
  });

  test("supports pointer, right-click, touch long-press, and Tab dismissal", async ({
    page,
  }) => {
    await page.getByLabel("Fixture", { exact: true }).selectOption("bot-normal");
    await page.getByLabel("System", { exact: true }).selectOption("after");
    const trigger = page.getByRole("button", { name: /Open Bot/i });

    await trigger.click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");

    await trigger.dispatchEvent("pointerdown", {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: 320,
      clientY: 180,
    });
    await page.waitForTimeout(560);
    await expect(page.getByRole("menu")).toBeVisible();
    await trigger.dispatchEvent("pointerup", {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
      clientX: 320,
      clientY: 180,
    });
    await page.keyboard.press("Escape");

    await trigger.click({ button: "right" });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).not.toBeFocused();
  });

  test("stays inside viewport at phone size and 200 percent zoom", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 720 });
    await openFixture(page, "responsive-chat", "light", "after");
    let box = await page.getByRole("menu").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    await page.getByRole("menu").screenshot({
      path: resolve(evidenceRoot, "after/responsive-chat-phone-light.png"),
      animations: "disabled",
    });

    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.documentElement.style.zoom = "2";
    });
    await openFixture(page, "canvas-sandbox", "dark", "after");
    box = await page.getByRole("menu").boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(720);
    await page.getByRole("menu").screenshot({
      path: resolve(evidenceRoot, "after/canvas-sandbox-200-percent-dark.png"),
      animations: "disabled",
    });
  });
});
