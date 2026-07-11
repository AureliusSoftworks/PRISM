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
    if (pathname === `/api/conversations/${testConversation.id}/summarization-debug`) {
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
        catalog: { local: [], online: [], defaults: { local: "llama3.2", online: "" } },
        comfyUi: { configured: false, reachable: false, checkpoints: [], allCheckpoints: [] },
      });
    }
    if (pathname === "/api/coffee/groups") return json({ ok: true, groups: [] });
    if (pathname === "/api/coffee/presets") return json({ ok: true, presets: [] });
    return json({});
  });
}

test.describe("PRISM desktop smoke", () => {
  test("loads the app shell", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Prism/i);
    await expect(page.locator("body")).toBeVisible();
  });

  test("keeps the unauthenticated shell visually stable @visual", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveScreenshot("prism-auth-shell.png", {
      animations: "disabled",
      caret: "hide",
      scale: "css",
    });
  });

  test("auth screen exposes the login path without backend services", async ({ page }) => {
    await page.route("**/api/auth/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: null, hasAnyAccounts: true }),
      });
    });
    await page.goto("/?mode=login");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await expect(page.getByPlaceholder("Username")).toBeVisible();
    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
  });

  test("authenticated Coffee shell opens its picker without external services", async ({ page }) => {
    await installAuthenticatedApi(page);
    await page.goto("/?view=coffee");
    await expect(page.getByRole("button", { name: /Coffee/ }).first()).toBeVisible();
    await expect(page.locator('[data-mode="picker"]')).toBeVisible();
    await expect(page.getByText("Select bots to begin")).toBeVisible();
  });

  test("marquee selects bots in a hydrated empty Chat without leaving zoom behind @marquee", async ({ page }) => {
    await installAuthenticatedApi(page);
    await page.goto("/?view=chat");

    const surface = page.locator('[data-canvas-bot-marquee-surface="true"]');
    const cards = surface.locator('[data-canvas-bot-marquee-item="true"]');
    await expect(surface).toBeVisible();
    await expect(cards).toHaveCount(3);

    const firstBox = await cards.nth(0).boundingBox();
    const secondBox = await cards.nth(1).boundingBox();
    expect(firstBox).not.toBeNull();
    expect(secondBox).not.toBeNull();
    if (!firstBox || !secondBox) return;

    await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + firstBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      secondBox.x + secondBox.width / 2,
      secondBox.y + secondBox.height / 2,
      { steps: 8 }
    );
    await page.mouse.up();

    await expect(surface.locator('[data-marquee-selected="true"]')).toHaveCount(2);
    await expect(surface).not.toHaveAttribute("data-canvas-bot-marquee-active", "true");

    await page.mouse.move(8, 120);
    await expect.poll(async () => surface.evaluate((node) => ({
      x: (node as HTMLElement).style.getPropertyValue("--picker-parallax-x"),
      y: (node as HTMLElement).style.getPropertyValue("--picker-parallax-y"),
    }))).toEqual({ x: "0px", y: "0px" });
    await expect.poll(async () => cards.evaluateAll((nodes) =>
      nodes.map((node) => ({
        transform: getComputedStyle(node).transform,
        opacity: getComputedStyle(node).opacity,
      }))
    )).toEqual([
      { transform: "none", opacity: "1" },
      { transform: "none", opacity: "1" },
      { transform: "none", opacity: "1" },
    ]);
  });

  test("custom bot draft edits Avatar Details as a guarded local recipe", async ({ page }) => {
    await installAuthenticatedApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Open bot customizer" }).click();
    await page.getByRole("button", { name: /Create new bot/ }).click();
    await page.getByPlaceholder("Name this bot").fill("Draft Detail Bot");
    await page
      .getByRole("button", { name: "Open Avatar Studio to edit bot avatar" })
      .click();

    const studio = page.getByRole("dialog", { name: "Draft Detail Bot" });
    await expect(studio).toBeVisible();
    await studio.getByRole("tab", { name: "Details" }).click();
    const detailsEditor = studio.getByRole("region", {
      name: "Avatar details editor",
    });
    await expect(detailsEditor).toBeVisible();
    await detailsEditor.getByRole("button", { name: "Round glasses" }).click();
    await expect(studio.locator('[data-avatar-details-mask="true"]')).toBeVisible();
    await expect(detailsEditor.getByText("Working copy · not applied")).toBeVisible();

    await studio.getByRole("tab", { name: "Face" }).click();
    const leavePrompt = page.getByRole("alertdialog", {
      name: "Apply avatar details?",
    });
    await expect(leavePrompt).toBeVisible();
    await leavePrompt.getByRole("button", { name: "Keep editing" }).click();
    await detailsEditor.getByRole("button", { name: "Apply", exact: true }).click();
    await expect(detailsEditor.getByText("Applied recipe")).toBeVisible();
  });

  test("existing custom bot Studio renders its saved Avatar Details", async ({ page }) => {
    await installAuthenticatedApi(page);
    await page.goto("/");

    await page.getByRole("button", { name: "Open bot customizer" }).click();
    await page.getByRole("button", { name: /Browse bots/ }).click();
    await page
      .getByRole("button", { name: "Open options for Test Bot 1" })
      .click();
    await page.getByRole("button", { name: /Customize/ }).click();
    await page
      .getByRole("button", { name: "Open Avatar Studio to edit bot avatar" })
      .click();

    const studio = page.getByRole("dialog", { name: "Test Bot 1" });
    await expect(studio.getByRole("tab", { name: "Details" })).toBeVisible();
    await expect(studio.locator('[data-avatar-details-mask="true"]')).toBeVisible();
  });

});
