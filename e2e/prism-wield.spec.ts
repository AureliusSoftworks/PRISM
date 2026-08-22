import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

const WIELD_TARGET_NAME = "Signal premise · registered Refract target";

function wieldModifier(): "Alt" {
  return "Alt";
}

async function openFixture(
  page: Page,
  options: { reducedMotion?: boolean; theme?: "dark" | "light" } = {},
): Promise<void> {
  await page.emulateMedia({
    reducedMotion: options.reducedMotion ? "reduce" : "no-preference",
  });
  await page.goto(`/qa-prism-wield?theme=${options.theme ?? "dark"}`);
  await expect(
    page.getByRole("heading", { name: "Wield Prism", exact: true }),
  ).toBeVisible();
}

async function armOverRegisteredTarget(page: Page): Promise<{
  modifier: "Alt" | "Control";
  pointer: { x: number; y: number };
}> {
  const target = page.getByRole("textbox", {
    name: WIELD_TARGET_NAME,
    exact: true,
  });
  const box = await target.boundingBox();
  if (!box) throw new Error("Wield target has no layout box.");
  const pointer = {
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
  await page.mouse.move(pointer.x - 80, pointer.y);
  const modifier = wieldModifier();
  await page.keyboard.down(modifier);
  await page.waitForTimeout(175);
  await page.mouse.move(pointer.x, pointer.y);
  await expect(page.locator("html")).toHaveAttribute(
    "data-prism-wielding",
    "true",
  );
  await expect(target).toHaveAttribute(
    "data-prism-refract-wield-hover",
    "true",
  );
  return { modifier, pointer };
}

for (const checkpoint of [
  { name: "dark", theme: "dark" as const, reducedMotion: false },
  { name: "light", theme: "light" as const, reducedMotion: false },
  {
    name: "reduced-motion",
    theme: "dark" as const,
    reducedMotion: true,
  },
]) {
  test(`Wield Prism ${checkpoint.name} visual checkpoint @visual`, async ({
    page,
  }, testInfo) => {
    await openFixture(page, checkpoint);
    const orb = page.locator(
      '[data-prism-system-pause-exempt="true"][data-dock]',
    );
    const before = await orb.boundingBox();
    const { modifier, pointer } = await armOverRegisteredTarget(page);
    const wielded = await orb.boundingBox();
    expect(wielded?.width).toBeCloseTo(28, 0);
    expect(wielded?.height).toBeCloseTo(28, 0);
    expect(wielded?.x).toBeCloseTo(pointer.x - 14, 0);
    expect(wielded?.y).toBeCloseTo(pointer.y - 14, 0);

    const screenshot = await page.screenshot();
    await testInfo.attach(`wield-${checkpoint.name}`, {
      body: screenshot,
      contentType: "image/png",
    });
    if (process.env.PRISM_CAPTURE_WIELD_QA === "1") {
      const outputDir = resolve(".codex/output/prism-wield-qa");
      mkdirSync(outputDir, { recursive: true });
      await page.screenshot({
        path: resolve(outputDir, `${checkpoint.name}.png`),
      });
    }

    await page.keyboard.up(modifier);
    await expect(page.locator("html")).not.toHaveAttribute(
      "data-prism-wielding",
      "true",
    );
    const returned = await orb.boundingBox();
    expect(returned?.width).toBeCloseTo(before?.width ?? 68, 0);
    // Stationary release docks the full-size orb at the cursor, not the pre-wield dock.
    expect(returned?.x).toBeCloseTo(pointer.x - (returned?.width ?? 68) / 2, 2);
    expect(returned?.y).toBeCloseTo(pointer.y - (returned?.height ?? 68) / 2, 2);
    expect(
      Math.hypot(
        (returned?.x ?? 0) - (before?.x ?? 0),
        (returned?.y ?? 0) - (before?.y ?? 0),
      ),
    ).toBeGreaterThan(20);
  });
}

test("Wield batches a burst of pointer movement into one compositor write", async ({
  page,
}) => {
  await openFixture(page);
  const { modifier, pointer } = await armOverRegisteredTarget(page);
  const mutationCount = await page.evaluate(
    async ({ modifierName, targetPoint }) => {
      const anchor = document.querySelector<HTMLElement>(
        '[data-prism-system-pause-exempt="true"][data-dock]',
      );
      if (!anchor) throw new Error("Prism anchor is unavailable.");
      let styleMutations = 0;
      const observer = new MutationObserver((records) => {
        styleMutations += records.length;
      });
      observer.observe(anchor, {
        attributes: true,
        attributeFilter: ["style"],
      });
      for (let index = 0; index < 24; index += 1) {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            pointerType: "mouse",
            clientX: targetPoint.x + index,
            clientY: targetPoint.y + index,
            altKey: modifierName === "Alt",
            ctrlKey: modifierName === "Control",
          }),
        );
      }
      await new Promise<void>((resolveFrame) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => resolveFrame()),
        ),
      );
      observer.disconnect();
      return styleMutations;
    },
    { modifierName: modifier, targetPoint: pointer },
  );
  expect(mutationCount).toBe(1);
  await page.keyboard.up(modifier);
});

test("Wield preserves noneligible native clicks and focused shortcut precedence", async ({
  page,
}) => {
  await openFixture(page);
  const nativeControl = page.getByTestId("qa-prism-native-control");
  const nativeBox = await nativeControl.boundingBox();
  if (!nativeBox) throw new Error("Native control has no layout box.");
  const modifier = wieldModifier();
  await page.mouse.move(nativeBox.x + nativeBox.width / 2 - 10, nativeBox.y);
  await page.keyboard.down(modifier);
  await page.waitForTimeout(175);
  await page.mouse.click(
    nativeBox.x + nativeBox.width / 2,
    nativeBox.y + nativeBox.height / 2,
  );
  await expect(nativeControl).toHaveAttribute("data-clicked", "true");
  await page.keyboard.up(modifier);

  const target = page.getByRole("textbox", {
    name: WIELD_TARGET_NAME,
    exact: true,
  });
  await target.focus();
  await page.keyboard.down("Meta");
  await page.keyboard.press("Alt");
  await page.keyboard.up("Meta");
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-prism-wielding",
    "true",
  );
  await expect(target).not.toHaveAttribute("data-prism-refract-state");
  await expect(
    page.getByRole("textbox", { name: "Message Prism", exact: true }),
  ).toBeVisible();
});

test("Wield capture suppresses one eligible native click and modifier release keeps Refract active", async ({
  page,
}) => {
  await openFixture(page);
  const target = page.getByRole("textbox", {
    name: WIELD_TARGET_NAME,
    exact: true,
  });
  const { modifier, pointer } = await armOverRegisteredTarget(page);
  await page.mouse.click(pointer.x, pointer.y);
  await page.keyboard.up(modifier);

  await expect(page.locator("html")).not.toHaveAttribute(
    "data-prism-wielding",
    "true",
  );
  await expect(target).not.toHaveAttribute("data-native-clicks");
  await expect(target).toHaveAttribute("data-prism-refract-state", "ready");
  await target.focus();
  await page.keyboard.press("Escape");
  await expect(target).not.toHaveAttribute("data-prism-refract-state");

  await target.click();
  await expect(target).toHaveAttribute("data-native-clicks", "1");
});
