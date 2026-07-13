import { test, expect, type Page, type Route } from "@playwright/test";

const testUser = {
  id: "e2e-user",
  username: "e2e@example.com",
  email: "e2e@example.com",
  displayName: "E2E User",
  theme: "dark",
  preferredProvider: "local",
};

const testBots = ["a", "b", "c"].map((id, index) => ({
  id: `e2e-bot-${id}`,
  name: `Test Bot ${index + 1}`,
  system_prompt: "A deterministic test persona.",
  model: null,
  local_model: "llama3.2",
  online_model: null,
  local_image_model: null,
  openai_image_model: null,
  online_enabled: 0,
  delete_protected: 0,
  flirt_enabled: 0,
  temperature: 0.7,
  max_tokens: 512,
  top_p: 1,
  top_k: 40,
  repetition_penalty: 1,
  color: ["#8b5cf6", "#06b6d4", "#f59e0b"][index],
  glyph: "circle",
  avatarDetails:
    index === 0
      ? {
          version: 1,
          screen: {
            stamps: [
              {
                id: "round-glasses",
                offsetX: 0,
                offsetY: 0,
                scalePct: 100,
              },
            ],
            paintMaskBase64: null,
          },
        }
      : null,
  chat_enabled: 1,
}));

const testConversation = {
  id: "e2e-conversation",
  title: "E2E companion thread",
  mode: "zen",
  conversationMode: "zen",
  botId: null,
  incognito: false,
  messages: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function installAuthenticatedApi(page: Page): Promise<void> {
  await page.route("**/api/**", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (payload: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    if (pathname === "/api/auth/me") {
      return json({ user: testUser, hasAnyAccounts: true });
    }
    if (pathname === "/api/settings") {
      return json({
        settings: {
          ...testUser,
          providerLocked: false,
          autoMemory: true,
          composerWritingAssist: true,
          experimentalDualOllamaEnabled: false,
          experimentalAllModelEffortEnabled: false,
          coffeeExperimentalTableAngleEnabled: false,
          psychicModeEnabled: false,
          fallbackModelMessageStripe: true,
          hiddenBotModelIds: [],
          hiddenComfyUiWorkflowIds: [],
          hasOpenAiApiKey: false,
          hasAnthropicApiKey: false,
          hasElevenLabsApiKey: false,
          openAiApiKeySource: "none",
          anthropicApiKeySource: "none",
          elevenLabsApiKeySource: "none",
          ollamaModel: "llama3.2",
          ollamaAuxiliaryModel: "llama3.2",
          secondaryOllamaHost: "",
          comfyUiHost: "",
          preferredLocalModel: "",
          preferredOnlineModel: "",
          preferredLocalImageModel: "",
          preferredOpenAiImageModel: "",
          preferredZenWallpaperLocalImageModel: "",
          preferredZenWallpaperOpenAiImageModel: "",
          zenWallpaperOpacity: 0.28,
          zenWallpaperTextMaskEnabled: true,
          zenWallpaperGrayscaleEnabled: true,
          zenWallpaperBlurredEdgesEnabled: true,
          zenWallpaperStyleNotes: "",
          zenSessionIdleGapMs: 43_200_000,
          zenFreshStartGapMs: 604_800_000,
          zenRecentContextMessages: 30,
          zenWallpaperRegenMessageInterval: 30,
          zenMoodSensitivity: 0.5,
          zenCanvasTypingSpeed: 1,
          zenMessageFontMinPx: 15.8,
          zenMessageFontMaxPx: 32.8,
          zenAskQuestionPatienceEnabled: false,
          zenAskQuestionPatienceMs: 60_000,
          zenAutonomyEnabled: false,
          zenPersonaTransitionChoice: "random",
          prismDefaultBotName: "",
          prismDefaultBotSystemPrompt: "",
          prismDefaultBotColor: "",
          prismDefaultBotGlyph: "",
          prismDefaultLlmModel: "",
          prismImageToolLlmModel: "",
          devMemoriesEnabled: false,
          devMemoriesText: "",
          comfyUiWorkflows: [],
          lenientLocalFallbackModel: "",
          lenientLocalImageFallbackModel: "",
        },
      });
    }
    if (pathname === "/api/conversations") {
      return json({
        conversations: [
          {
            ...testConversation,
            lastBotId: null,
            lastBotColor: null,
            hasAssistantReply: false,
          },
        ],
      });
    }
    if (pathname === "/api/conversations/zen/open") {
      return json({ conversationId: testConversation.id });
    }
    if (pathname === `/api/conversations/${testConversation.id}/summary`) {
      return json({ summary: null });
    }
    if (
      pathname ===
      `/api/conversations/${testConversation.id}/summarization-debug`
    ) {
      return json({
        debug: {
          conversationId: testConversation.id,
          mode: "zen",
          inProgress: false,
          latestSummary: null,
          latestDisplaySummary: null,
          latestSummaryAt: null,
          messagesSinceLastCompaction: 0,
          summaryCount: 0,
        },
      });
    }
    if (pathname === `/api/conversations/${testConversation.id}/title`) {
      return json({ conversation: testConversation });
    }
    if (/^\/api\/conversations\/[^/]+$/.test(pathname)) {
      return json({ conversation: testConversation });
    }
    if (pathname === "/api/memories") return json({ memories: [] });
    if (pathname === "/api/bots") return json({ bots: testBots });
    if (pathname === "/api/images") return json({ images: [] });
    if (pathname === "/api/models") {
      return json({
        catalog: {
          local: [],
          online: [],
          defaults: { local: "llama3.2", online: "" },
        },
        comfyUi: {
          configured: false,
          reachable: false,
          checkpoints: [],
          allCheckpoints: [],
        },
      });
    }
    if (pathname === "/api/coffee/groups")
      return json({ ok: true, groups: [] });
    if (pathname === "/api/coffee/presets")
      return json({ ok: true, presets: [] });
    return json({});
  });
}

test.describe("PRISM desktop smoke", () => {
  test("loads the app shell", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Prism/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("keeps the unauthenticated shell visually stable @visual", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot("prism-auth-shell.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
  });

  test("auth screen exposes the login path without backend services", async ({
    page,
  }) => {
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null, hasAnyAccounts: true }),
      });
    });
    await page.goto("/?mode=login");
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Username")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("authenticated Coffee shell opens its picker without external services", async ({
    page,
  }) => {
    await installAuthenticatedApi(page);
    await page.goto("/?view=coffee");
    await expect(
      page.getByRole("button", { name: /Coffee/ }).first(),
    ).toBeVisible();
    await expect(page.locator('[data-mode="picker"]')).toBeVisible();
    await expect(page.getByText("Select bots to begin")).toBeVisible();
  });

  test("marquee selects bots in a hydrated empty Chat without leaving zoom behind @marquee", async ({
    page,
  }) => {
    await installAuthenticatedApi(page);
    await page.goto("/?view=chat");

    const surface = page.locator('[data-canvas-bot-marquee-surface="true"]');
    const picker = surface.locator('[data-bot-picker-frame="true"]');
    const cards = surface.locator('[data-canvas-bot-marquee-item="true"]');
    await expect(surface).toBeVisible();
    await expect(picker).toBeVisible();
    await expect(cards).toHaveCount(3);

    const surfaceBox = await surface.boundingBox();
    const pickerBox = await picker.boundingBox();
    const firstBox = await cards.nth(0).boundingBox();
    const secondBox = await cards.nth(1).boundingBox();
    expect(surfaceBox).not.toBeNull();
    expect(pickerBox).not.toBeNull();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    if (!surfaceBox || !pickerBox || !firstBox || !secondBox) return;

    const dragStartX = Math.max(surfaceBox.x + 12, pickerBox.x - 80);
    const dragStartY = firstBox.y + firstBox.height / 2;
    expect(dragStartX).toBeLessThan(pickerBox.x);

    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();
    await page.mouse.move(
      secondBox.x + secondBox.width / 2,
      secondBox.y + secondBox.height / 2,
      { steps: 8 },
    );
    await page.mouse.up();

    await expect(surface.locator('[data-marquee-selected="true"]')).toHaveCount(
      2,
    );
    await expect(surface).not.toHaveAttribute(
      "data-canvas-bot-marquee-active",
      "true",
    );

    await page.mouse.move(8, 120);
    await expect
      .poll(async () =>
        picker.evaluate((node) => ({
          x: (node as HTMLElement).style.getPropertyValue(
            "--picker-parallax-x",
          ),
          y: (node as HTMLElement).style.getPropertyValue(
            "--picker-parallax-y",
          ),
        })),
      )
      .toEqual({ x: "0px", y: "0px" });
    await expect
      .poll(async () =>
        cards.evaluateAll((nodes) =>
          nodes.map((node) => ({
            transform: getComputedStyle(node).transform,
            opacity: getComputedStyle(node).opacity,
          })),
        ),
      )
      .toEqual([
        { transform: "none", opacity: "1" },
        { transform: "none", opacity: "1" },
        { transform: "none", opacity: "1" },
      ]);
  });

  test("custom bot draft edits Avatar Details as a guarded local recipe", async ({
    page,
  }) => {
    test.slow();
    await installAuthenticatedApi(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await page.getByRole("button", { name: "Open bot customizer" }).click();
    await page.getByRole("button", { name: /Create new bot/ }).click();
    await page
      .getByRole("region", { name: "Bot identity" })
      .getByPlaceholder("Name this bot")
      .fill("Draft Detail Bot");
    await page
      .getByRole("button", { name: "Open Avatar Studio to edit bot avatar" })
      .click({ force: true });

    const studio = page.getByRole("dialog", { name: "Draft Detail Bot" });
    await expect(studio).toBeVisible();
    await studio.getByRole("tab", { name: "Details" }).click({ force: true });
    const detailsEditor = studio.getByRole("region", {
      name: "Avatar details editor",
    });
    await expect(detailsEditor).toBeVisible();
    await expect(
      detailsEditor.getByRole("button", { name: "Round glasses" }),
    ).toHaveCount(0);
    await expect(detailsEditor.getByText("Facial hair")).toHaveCount(0);
    await expect(detailsEditor.getByText("Marking")).toHaveCount(0);
    const faceGuide = detailsEditor.locator(
      '[data-avatar-details-face-guide="true"]',
    );
    await expect(faceGuide).toHaveAttribute("data-visible", "true");
    await detailsEditor
      .getByRole("button", { name: "Hide face" })
      .click({ force: true });
    await expect(faceGuide).toHaveAttribute("data-visible", "false");
    await detailsEditor
      .getByRole("button", { name: "Show face" })
      .click({ force: true });
    await expect(faceGuide).toHaveAttribute("data-visible", "true");

    const paintCanvas = detailsEditor.getByRole("application", {
      name: /Avatar pixel canvas/,
    });
    await paintCanvas.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "center" }),
    );
    const paintBounds = await paintCanvas.boundingBox();
    if (!paintBounds)
      throw new Error("Avatar screen editor canvas is not measurable.");
    const previewAvatar = studio.getByRole("img", {
      name: "Draft Detail Bot avatar preview",
    });
    const previewScreen = previewAvatar.locator('[data-crt-profile="clean"]');
    const previewScreenBounds = await previewScreen.boundingBox();
    if (!previewScreenBounds)
      throw new Error("Studio preview screen is not measurable.");
    for (const part of ["eyes", "mouth"] as const) {
      const guidePartBounds = await faceGuide
        .locator(`[data-coffee-plate-emoji-part="${part}"]`)
        .boundingBox();
      const previewPartBounds = await previewAvatar
        .locator(`[data-coffee-plate-emoji-part="${part}"]`)
        .boundingBox();
      if (!guidePartBounds || !previewPartBounds)
        throw new Error(`${part} guide geometry is not measurable.`);
      const guideCenter = {
        x:
          (guidePartBounds.x + guidePartBounds.width / 2 - paintBounds.x) /
          paintBounds.width,
        y:
          (guidePartBounds.y + guidePartBounds.height / 2 - paintBounds.y) /
          paintBounds.height,
      };
      const previewCenter = {
        x:
          (previewPartBounds.x +
            previewPartBounds.width / 2 -
            previewScreenBounds.x) /
          previewScreenBounds.width,
        y:
          (previewPartBounds.y +
            previewPartBounds.height / 2 -
            previewScreenBounds.y) /
          previewScreenBounds.height,
      };
      expect(
        Math.abs(guideCenter.x - previewCenter.x),
        `${part} x ${JSON.stringify({ guideCenter, previewCenter })}`,
      ).toBeLessThan(0.015);
      expect(
        Math.abs(guideCenter.y - previewCenter.y),
        `${part} y ${JSON.stringify({ guideCenter, previewCenter })}`,
      ).toBeLessThan(0.015);
    }
    const guideFaceTransform = await faceGuide
      .locator("[data-coffee-plate-emoji-glyphs]")
      .evaluate((element) => getComputedStyle(element).transform);
    const previewFaceTransform = await previewAvatar
      .locator("[data-coffee-plate-emoji-glyphs]")
      .evaluate((element) => getComputedStyle(element).transform);
    expect(guideFaceTransform).toBe(previewFaceTransform);
    const startX = paintBounds.x + paintBounds.width * (40 / 128);
    const centerY = paintBounds.y + paintBounds.height * (64 / 128);
    await page.mouse.move(startX, centerY);
    await page.mouse.down();
    await page.mouse.move(startX + paintBounds.width * (8 / 128), centerY);

    const liveDetailsCanvas = studio.locator(
      '[data-avatar-details-mask="true"]',
    );
    await expect(liveDetailsCanvas).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() =>
        liveDetailsCanvas.evaluate(
          (element) => new DOMMatrix(getComputedStyle(element).transform).a,
        ),
      )
      .toBeGreaterThan(0);
    const leftRightAlpha = await liveDetailsCanvas.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (!context) return { left: 0, right: 0 };
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      const alphaInRange = (start: number, end: number): number => {
        let total = 0;
        for (let y = 58; y <= 70; y += 1) {
          for (let x = start; x <= end; x += 1) {
            total += pixels[(y * canvas.width + x) * 4 + 3] ?? 0;
          }
        }
        return total;
      };
      return { left: alphaInRange(34, 54), right: alphaInRange(74, 94) };
    });
    expect(leftRightAlpha.left).toBeGreaterThan(leftRightAlpha.right);

    for (const gridX of [52, 58, 64, 70]) {
      await page.mouse.move(
        paintBounds.x + paintBounds.width * (gridX / 128),
        centerY,
      );
      await expect(liveDetailsCanvas).toBeVisible();
    }
    await page.mouse.up();

    await expect(liveDetailsCanvas).toBeVisible();
    await expect(
      detailsEditor.getByText("Working copy · not applied"),
    ).toBeVisible();

    await studio.getByRole("tab", { name: "Eyes" }).click({ force: true });
    const leavePrompt = page.getByRole("alertdialog", {
      name: "Apply avatar details?",
    });
    await expect(leavePrompt).toBeVisible();
    await leavePrompt
      .getByRole("button", { name: "Keep editing" })
      .click({ force: true });
    await detailsEditor
      .getByRole("button", { name: "Apply", exact: true })
      .click({ force: true });
    await expect(detailsEditor.getByText("Applied recipe")).toBeVisible();
  });

  test("existing custom bot Studio renders its saved Avatar Details", async ({
    page,
  }) => {
    test.slow();
    await installAuthenticatedApi(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");

    await page.getByRole("button", { name: "Open bot customizer" }).click();
    await page.getByRole("button", { name: /Browse bots/ }).click();
    await page
      .getByRole("button", {
        name: /Preview Test Bot 1; double-click to manage/,
      })
      .dblclick({ force: true });
    const runtimeAvatarPlate = page.locator(
      '[data-bot-showcase-context="true"] [data-canvas-side="left"]',
    );
    await expect
      .poll(() =>
        runtimeAvatarPlate.evaluate((element) =>
          Number(
            getComputedStyle(element).getPropertyValue(
              "--coffee-plate-emoji-face-scale-y",
            ),
          ),
        ),
      )
      .toBe(-1);
    const runtimeDetailsCanvas = page.locator(
      '[data-bot-showcase-context="true"] [data-avatar-details-mask="true"]',
    );
    await expect(runtimeDetailsCanvas).toBeVisible();
    await expect
      .poll(() =>
        runtimeDetailsCanvas.evaluate(
          (element) => new DOMMatrix(getComputedStyle(element).transform).a,
        ),
      )
      .toBeGreaterThan(0);
    for (const layer of ["halo", "bloom", "core"] as const) {
      await expect(
        page.locator(
          `[data-bot-showcase-context="true"] [data-avatar-details-emission="${layer}"]`,
        ),
      ).toBeVisible();
    }
    const firstOpaqueRgb = (
      element: Element,
    ): [number, number, number] | null => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext("2d");
      if (!context) return null;
      const pixels = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      for (let index = 0; index < pixels.length; index += 4) {
        if ((pixels[index + 3] ?? 0) === 0) continue;
        return [
          pixels[index] ?? 0,
          pixels[index + 1] ?? 0,
          pixels[index + 2] ?? 0,
        ];
      }
      return null;
    };
    const runtimeGlowCanvas = page.locator(
      '[data-bot-showcase-context="true"] [data-avatar-details-emission="halo"]',
    );
    expect(await runtimeDetailsCanvas.evaluate(firstOpaqueRgb)).toEqual([
      255, 255, 255,
    ]);
    expect(await runtimeGlowCanvas.evaluate(firstOpaqueRgb)).not.toEqual([
      255, 255, 255,
    ]);
    await page
      .getByRole("button", { name: /^Avatar Studio/ })
      .click({ force: true });

    const studio = page.getByRole("dialog", { name: "Test Bot 1" });
    await expect(studio.getByRole("tab", { name: "Details" })).toBeVisible();
    await expect(
      studio.locator('[data-avatar-details-mask="true"]'),
    ).toBeVisible();
  });
});
