import {
  test,
  expect,
  type Locator,
  type Page,
  type Route,
} from "@playwright/test";

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

const waitingRoomTestBots = Array.from({ length: 24 }, (_, index) => ({
  ...testBots[index % testBots.length],
  id: `e2e-waiting-bot-${index + 1}`,
  name: `Waiting Bot ${index + 1}`,
  color: ["#8b5cf6", "#06b6d4", "#f59e0b", "#ef4444", "#22c55e", "#ec4899"][
    index % 6
  ],
  glyph: ["circle", "triangle", "square", "star", "heart", "sparkles"][
    index % 6
  ],
  avatarDetails: null,
}));

interface TestBotLibraryGroup {
  id: string;
  name: string;
  description: string;
  botIds: string[];
  roomAtmosphere?: {
    imageId: string;
    prompt?: string;
    updatedAt: string;
  };
  deleteProtected: boolean;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AuthenticatedApiOptions {
  botLibraryGroups?: TestBotLibraryGroup[];
  bots?: Array<(typeof testBots)[number]>;
  images?: TestImageRecord[];
  theme?: "dark" | "light";
  zenWallpaperLocalImageModel?: string;
  preserveBotLibraryGroupsOnReload?: boolean;
}

interface TestImageRecord {
  id: string;
  prompt: string;
  url: string;
  displayUrl: string;
  createdAt: string;
  botId: string | null;
  hasLocalFile: boolean;
  thumbAvailable?: boolean;
  fileAvailable?: boolean;
  purpose: string;
  model?: string | null;
  provider?: string;
}

function testGroupImages(
  botIds: readonly string[],
  imagesPerBot = 3,
): TestImageRecord[] {
  return botIds.flatMap((botId, botIndex) =>
    Array.from({ length: imagesPerBot }, (_, imageIndex) => {
      const id = `e2e-group-image-${botIndex + 1}-${imageIndex + 1}`;
      return {
        id,
        prompt: `Generated scene ${imageIndex + 1} with bot ${botIndex + 1}`,
        url: `https://remote.invalid/${id}.png`,
        displayUrl: `/api/images/${id}/file`,
        createdAt: `2026-07-${String(14 - imageIndex).padStart(2, "0")}T12:00:${String(botIndex).padStart(2, "0")}.000Z`,
        botId,
        hasLocalFile: true,
        purpose: "gallery",
        model: "e2e-image-model",
        provider: "local",
      };
    }),
  );
}

interface TestConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface TestConversation {
  id: string;
  title: string;
  mode: "zen";
  conversationMode: "zen";
  botId: string | null;
  incognito: boolean;
  messages: TestConversationMessage[];
  createdAt: string;
  updatedAt: string;
  hasAssistantReply?: boolean;
}

const testConversation: TestConversation = {
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

async function activateNavigationControl(locator: Locator): Promise<void> {
  await locator.evaluate((element) => (element as HTMLElement).click());
}

async function selectBotGroupFilter(page: Page, name: string): Promise<void> {
  const trigger = page
    .getByRole("button", { name: /Bot group filter:/ })
    .first();
  const option = page.getByRole("option", { name });
  await expect(async () => {
    if (!(await trigger.isVisible().catch(() => false))) {
      const showAllBots = page.getByRole("button", { name: "Show all bots" });
      if (await showAllBots.isVisible().catch(() => false)) {
        await activateNavigationControl(showAllBots);
      }
      await expect(trigger).toBeVisible({ timeout: 1_500 });
    }
    if (!(await option.isVisible().catch(() => false))) {
      await activateNavigationControl(trigger);
    }
    await expect(option).toBeVisible({ timeout: 1_500 });
  }).toPass({ timeout: 15_000 });
  await activateNavigationControl(option);
}

async function activateBotManagementControl(locator: Locator): Promise<void> {
  await locator.evaluate((element) =>
    element.dispatchEvent(
      new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        detail: 2,
        view: window,
      }),
    ),
  );
}

async function installAuthenticatedApi(
  page: Page,
  options: AuthenticatedApiOptions = {},
): Promise<void> {
  const fixtureUser = {
    ...testUser,
    theme: options.theme ?? testUser.theme,
  };
  const fixtureBots = options.bots ?? testBots;
  const fixtureImages = options.images ?? [];
  await page.addInitScript(
    ({ userId, botLibraryGroups, preserveBotLibraryGroupsOnReload }) => {
      window.localStorage.setItem("prism_first_run_welcome_v1", "done");
      window.localStorage.setItem(
        "prism_desktop_first_run_complete_v3",
        "done",
      );
      window.localStorage.setItem(
        `prism_mode_tutorials_v1:${userId}`,
        JSON.stringify({ zen: true, chat: true, coffee: true }),
      );
      if (botLibraryGroups) {
        const storageKey = `prism_bot_library_groups:${userId}`;
        if (
          !preserveBotLibraryGroupsOnReload ||
          !window.localStorage.getItem(storageKey)
        ) {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify(botLibraryGroups),
          );
        }
      }
    },
    {
      userId: testUser.id,
      botLibraryGroups: options.botLibraryGroups ?? null,
      preserveBotLibraryGroupsOnReload:
        options.preserveBotLibraryGroupsOnReload === true,
    },
  );

  await page.route("**/api/**", async (route: Route) => {
    const pathname = new URL(route.request().url()).pathname;
    const json = (payload: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    if (pathname === "/api/auth/me") {
      return json({ user: fixtureUser, hasAnyAccounts: true });
    }
    if (pathname === "/api/settings") {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON() as { theme?: unknown };
        if (
          body.theme === "dark" ||
          body.theme === "light" ||
          body.theme === "system"
        ) {
          fixtureUser.theme = body.theme;
        }
      }
      return json({
        settings: {
          ...fixtureUser,
          providerLocked: false,
          autoMemory: true,
          composerWritingAssist: true,
          experimentalDualOllamaEnabled: false,
          experimentalAllModelEffortEnabled: false,
          coffeeExperimentalTableAngleEnabled: false,
          psychicModeEnabled: false,
          autoModeEnabled: false,
          autoFallbackChain: null,
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
          preferredZenWallpaperLocalImageModel:
            options.zenWallpaperLocalImageModel ?? "",
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
    if (pathname === "/api/bots") return json({ bots: fixtureBots });
    if (/^\/api\/images\/[^/]+\/(?:thumb|file)$/.test(pathname)) {
      const imageId = decodeURIComponent(pathname.split("/")[3] ?? "");
      const image = fixtureImages.find((candidate) => candidate.id === imageId);
      const assetAvailable = pathname.endsWith("/thumb")
        ? image?.thumbAvailable !== false
        : image?.fileAvailable !== false;
      if (!image?.hasLocalFile || !assetAvailable) {
        return route.fulfill({ status: 404, body: "Not found" });
      }
      const paletteIndex = Math.max(0, fixtureImages.indexOf(image)) % 6;
      const colors = [
        "#8b5cf6",
        "#06b6d4",
        "#f59e0b",
        "#ef4444",
        "#22c55e",
        "#ec4899",
      ];
      return route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${colors[paletteIndex]}"/><circle cx="60" cy="54" r="27" fill="#fff" fill-opacity=".56"/><path d="M18 104 49 73l18 18 14-14 21 27" fill="#0b0b0d" fill-opacity=".48"/></svg>`,
      });
    }
    if (pathname === "/api/images") {
      const requestUrl = new URL(route.request().url());
      const botId = requestUrl.searchParams.get("botId");
      const generalOnly = requestUrl.searchParams.get("general") === "1";
      const filtered = generalOnly
        ? fixtureImages.filter((image) => image.botId === null)
        : botId
          ? fixtureImages.filter((image) => image.botId === botId)
          : fixtureImages;
      return json({ images: filtered });
    }
    if (pathname === "/api/models") {
      const zenWallpaperLocalImageModel =
        options.zenWallpaperLocalImageModel ?? "";
      return json({
        catalog: {
          local: [],
          online: [],
          defaults: { local: "llama3.2", online: "" },
        },
        comfyUi: {
          configured: Boolean(zenWallpaperLocalImageModel),
          reachable: Boolean(zenWallpaperLocalImageModel),
          checkpoints: zenWallpaperLocalImageModel
            ? [
                {
                  id: zenWallpaperLocalImageModel,
                  label: "E2E Zen Wallpaper",
                },
              ]
            : [],
          allCheckpoints: zenWallpaperLocalImageModel
            ? [
                {
                  id: zenWallpaperLocalImageModel,
                  label: "E2E Zen Wallpaper",
                },
              ]
            : [],
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

async function installCoffeeGroupRegressionApi(
  page: Page,
  coffeeBots: Array<(typeof testBots)[number]>,
): Promise<void> {
  await installAuthenticatedApi(page);
  await page.addInitScript(
    ({ userId, group }) => {
      window.localStorage.setItem(
        `prism_bot_library_groups:${userId}`,
        JSON.stringify([group]),
      );
    },
    {
      userId: testUser.id,
      group: {
        id: "e2e-coffee-filter",
        name: "Coffee Filter Trio",
        description: "A deterministic Coffee picker filter.",
        botIds: coffeeBots.slice(0, 3).map((bot) => bot.id),
        deleteProtected: false,
        builtIn: false,
        createdAt: "2026-07-14T23:44:00.000Z",
        updatedAt: "2026-07-14T23:44:00.000Z",
      },
    },
  );
  await page.route("**/api/bots", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ bots: coffeeBots }),
    });
  });
  await page.route("**/api/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        catalog: {
          local: [
            {
              id: "llama3.2",
              label: "Llama 3.2",
              provider: "local",
              isDefault: true,
            },
            {
              id: "qwen3:8b",
              label: "Qwen 3 8B",
              provider: "local",
            },
          ],
          online: [
            {
              id: "gpt-4o-mini",
              label: "GPT-4o mini",
              provider: "openai",
              isDefault: true,
            },
          ],
          defaults: { local: "llama3.2", online: "gpt-4o-mini" },
        },
        comfyUi: {
          configured: false,
          reachable: false,
          checkpoints: [],
          allCheckpoints: [],
        },
      }),
    });
  });
}

interface StatefulZenFixture {
  persistentConversation: TestConversation;
  requests: Record<string, unknown>[];
}

async function installStatefulZenApi(page: Page): Promise<StatefulZenFixture> {
  const state: StatefulZenFixture = {
    persistentConversation: structuredClone(testConversation),
    requests: [],
  };
  let turnIndex = 0;

  await page.route("**/api/chat", async (route: Route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    const body = request.postDataJSON() as Record<string, unknown>;
    state.requests.push(body);
    turnIndex += 1;
    const incognito = body.incognito === true;
    const priorMessages = incognito
      ? Array.isArray(body.ephemeralMessages)
        ? (body.ephemeralMessages as TestConversationMessage[])
        : []
      : state.persistentConversation.messages;
    const now = `2026-01-01T00:00:0${turnIndex}.000Z`;
    const message = typeof body.message === "string" ? body.message : "";
    const conversation: TestConversation = {
      ...testConversation,
      id: incognito ? `e2e-private-${turnIndex}` : testConversation.id,
      incognito,
      messages: [
        ...priorMessages,
        {
          id: `e2e-user-${turnIndex}`,
          role: "user",
          content: message,
          createdAt: now,
        },
        {
          id: `e2e-assistant-${turnIndex}`,
          role: "assistant",
          content: incognito
            ? "This reply is intentionally ephemeral."
            : "This reply is saved locally.",
          createdAt: now,
        },
      ],
      updatedAt: now,
      hasAssistantReply: true,
    };
    if (!incognito) state.persistentConversation = conversation;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ conversation }),
    });
  });

  await page.route("**/api/conversations", async (route: Route) => {
    if (route.request().method() !== "GET") return route.fallback();
    const conversation = state.persistentConversation;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        conversations: [
          {
            ...conversation,
            lastBotId: null,
            lastBotColor: null,
            hasAssistantReply: conversation.messages.some(
              (message) => message.role === "assistant",
            ),
          },
        ],
      }),
    });
  });

  await page.route(
    `**/api/conversations/${testConversation.id}`,
    async (route: Route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ conversation: state.persistentConversation }),
      });
    },
  );

  return state;
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

  test("Coffee group setup selects every bot, enforces five seats, and enters a saved session", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const coffeeBots = Array.from({ length: 6 }, (_, index) => ({
      ...testBots[index % testBots.length]!,
      id: `e2e-coffee-bot-${index + 1}`,
      name: `Coffee Seat ${index + 1}`,
      online_enabled: 1,
      avatarDetails: null,
    }));
    const runtimeErrors: Error[] = [];
    const integrityConsoleErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error));
    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (
        /ReferenceError|Maximum update depth|same key|Cannot update a component while rendering|NaN|Infinity/u.test(
          text,
        )
      ) {
        integrityConsoleErrors.push(text);
      }
    });

    await installCoffeeGroupRegressionApi(page, coffeeBots);

    type SavedCoffeeGroup = {
      id: string;
      name: string;
      botGroupIds: string[];
      coffeeSeatBotIds: Array<string | null>;
      coffeeSettings: Record<string, unknown>;
      presetMode: "manual";
      starterTopicsByBotId: Record<string, string[]>;
      createdAt: string;
      updatedAt: string;
    };
    let savedGroup: SavedCoffeeGroup | null = null;
    const fulfillJson = (
      route: Route,
      payload: unknown,
      status = 200,
    ): Promise<void> =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    await page.route("**/api/coffee/groups", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await fulfillJson(route, {
          ok: true,
          groups: savedGroup ? [savedGroup] : [],
        });
        return;
      }
      if (request.method() !== "POST") {
        await route.fallback();
        return;
      }
      const body = request.postDataJSON() as {
        groupBotIds?: Array<string | null>;
        coffeeSettings?: Record<string, unknown>;
      };
      const requestedSeatIds = Array.isArray(body.groupBotIds)
        ? body.groupBotIds
        : [];
      const coffeeSeatBotIds = Array.from(
        { length: 5 },
        (_, index) => requestedSeatIds[index] ?? null,
      );
      const now = "2026-07-14T23:45:00.000Z";
      savedGroup = {
        id: "e2e-coffee-group",
        name: "Regression Circle",
        botGroupIds: coffeeSeatBotIds.filter(
          (botId): botId is string => typeof botId === "string",
        ),
        coffeeSeatBotIds,
        coffeeSettings: body.coffeeSettings ?? {},
        presetMode: "manual",
        starterTopicsByBotId: {},
        createdAt: now,
        updatedAt: now,
      };
      await fulfillJson(route, { ok: true, group: savedGroup }, 201);
    });
    await page.route(
      "**/api/coffee/groups/e2e-coffee-group/sessions",
      async (route) => {
        if (route.request().method() !== "POST" || !savedGroup) {
          await route.fallback();
          return;
        }
        await fulfillJson(
          route,
          {
            ok: true,
            arrivalScenario: "user-first",
            coffeeStarterTopics: [
              "A regression worth catching",
              "When systems fight back",
              "The cost of clean logic",
              "A bug worth keeping",
            ],
            conversation: {
              id: "e2e-coffee-session",
              title: savedGroup.name,
              mode: "coffee",
              coffeeGroupId: savedGroup.id,
              botGroupIds: savedGroup.botGroupIds,
              coffeeSeatBotIds: savedGroup.coffeeSeatBotIds,
              coffeeSettings: savedGroup.coffeeSettings,
              coffeeSessionDurationMinutes: 10,
              coffeeTopic: null,
              messages: [],
              createdAt: "2026-07-14T23:46:00.000Z",
              updatedAt: "2026-07-14T23:46:00.000Z",
            },
          },
          201,
        );
      },
    );

    await page.goto("/?view=coffee");
    const picker = page.getByRole("listbox", {
      name: "Bots available for Coffee",
    });
    await expect(picker.getByRole("option")).toHaveCount(6);

    for (const bot of coffeeBots) {
      const tile = picker.getByRole("option", { name: bot.name });
      await tile.click();
      await expect(tile).toHaveAttribute("aria-selected", "true");
      await expect(page.getByText("1 / 5 seats filled")).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Prism needs a quick refresh." }),
      ).toHaveCount(0);
      await tile.click();
      await expect(tile).toHaveAttribute("aria-selected", "false");
      await expect(page.getByText("0 / 5 seats filled")).toBeVisible();
    }

    const variantTile = picker.getByRole("option", {
      name: "Coffee Seat 2",
    });
    await expect(
      page.getByRole("button", { name: "AUTO", exact: true }),
    ).toBeDisabled();
    for (const mode of ["ONLINE", "LOCAL"] as const) {
      const modeButton = page.getByRole("button", { name: mode, exact: true });
      await expect(modeButton).toBeEnabled();
      await modeButton.click();
      await expect(modeButton).toHaveAttribute("aria-pressed", "true");
      await variantTile.click();
      await expect(variantTile).toHaveAttribute("aria-selected", "true");
      await variantTile.click();
      await expect(variantTile).toHaveAttribute("aria-selected", "false");
    }

    const modelPicker = page.getByRole("button", {
      name: "Coffee session model for local replies",
    });
    await modelPicker.click();
    await page.getByRole("option", { name: /Qwen 3 8B/u }).click();
    await expect(modelPicker).toContainText("Qwen 3 8B");
    await variantTile.click();
    await variantTile.click();
    await expect(variantTile).toHaveAttribute("aria-selected", "false");

    const rapidTiles = picker.getByRole("option");
    await rapidTiles.evaluateAll((tiles) => {
      for (const tile of tiles.slice(0, 3)) (tile as HTMLElement).click();
    });
    await expect(page.getByText("3 / 5 seats filled")).toBeVisible();
    await rapidTiles.evaluateAll((tiles) => {
      for (const tile of tiles.slice(0, 3)) (tile as HTMLElement).click();
    });
    await expect(page.getByText("0 / 5 seats filled")).toBeVisible();

    await page.goto("/?view=chat");
    await expect(page.getByRole("textbox").last()).toBeVisible();
    await page.goto("/?view=coffee");
    await expect(page.getByText("0 / 5 seats filled")).toBeVisible();

    await page
      .getByRole("button", { name: "Bot group filter: All bots" })
      .click();
    await page.getByRole("option", { name: /Coffee Filter Trio/u }).click();
    await expect(picker.getByRole("option")).toHaveCount(3);
    const groupFilteredTile = picker.getByRole("option", {
      name: coffeeBots[0]!.name,
    });
    await groupFilteredTile.click();
    await expect(groupFilteredTile).toHaveAttribute("aria-selected", "true");
    await groupFilteredTile.click();
    await page
      .getByRole("button", { name: "Bot group filter: Coffee Filter Trio" })
      .click();
    await page.getByRole("option", { name: "Show all bots" }).click();
    await expect(picker.getByRole("option")).toHaveCount(6);

    const search = page.getByRole("searchbox", {
      name: "Search bots for Coffee Session",
    });
    await search.fill("Seat 6");
    await expect(picker.getByRole("option")).toHaveCount(1);
    const filteredTile = picker.getByRole("option", {
      name: "Coffee Seat 6",
    });
    await filteredTile.click();
    await expect(filteredTile).toHaveAttribute("aria-selected", "true");
    await filteredTile.click();
    await search.fill("");
    await expect(picker.getByRole("option")).toHaveCount(6);

    const createGroupButton = page.getByRole("button", {
      name: "Create Coffee Group →",
    });
    for (const [index, bot] of coffeeBots.slice(0, 5).entries()) {
      await picker.getByRole("option", { name: bot.name }).click();
      if (index === 1) await expect(createGroupButton).toBeEnabled();
    }
    await expect(page.getByText("5 / 5 seats filled")).toBeVisible();
    const sixthTile = picker.getByRole("option", { name: "Coffee Seat 6" });
    await expect(sixthTile).toBeDisabled();

    const firstTile = picker.getByRole("option", { name: "Coffee Seat 1" });
    await firstTile.click();
    await sixthTile.click();
    await expect(page.getByText("5 / 5 seats filled")).toBeVisible();
    await expect(sixthTile).toHaveAttribute("aria-selected", "true");

    await createGroupButton.click();
    const savedGroupButton = page
      .locator('[data-tutorial-target="coffee-groups"]')
      .getByRole("button", {
        name: "Open Coffee Group Regression Circle",
        exact: true,
      });
    await expect(savedGroupButton).toBeVisible();
    expect(savedGroup?.botGroupIds).toHaveLength(5);

    await page.reload();
    await expect(savedGroupButton).toBeVisible();
    await savedGroupButton.click();
    const coffeeTable = page.getByRole("region", { name: "Coffee table" });
    const startSessionButton = coffeeTable.getByRole("button", {
      name: "Start session with 5",
      exact: true,
    });
    await expect(startSessionButton).toBeEnabled();

    await startSessionButton.click();
    await expect(page.locator('[data-phase="topic"]')).toBeVisible();
    await expect(page.getByText("Choose a topic to begin.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Prism needs a quick refresh." }),
    ).toHaveCount(0);
    expect(runtimeErrors).toEqual([]);
    expect(integrityConsoleErrors).toEqual([]);
  });

  test("authenticated Zen persists LOCAL turns while Private chat stays ephemeral", async ({
    page,
  }) => {
    await installAuthenticatedApi(page);
    const state = await installStatefulZenApi(page);
    await page.goto("/?view=chat");

    const responseMode = page
      .locator('[data-tutorial-target="auto-response-mode"]')
      .first();
    await expect(responseMode).toHaveAttribute("data-response-mode", "local");

    const composer = page.getByRole("textbox").last();
    await expect(composer).toBeVisible();
    await composer.fill("Remember this persistent turn");
    await composer.press("Enter");
    await expect(page.getByText("This reply is saved locally.")).toBeVisible();
    await expect.poll(() => state.requests.length).toBe(1);
    expect(state.requests[0]?.preferredProvider).toBe("local");
    expect(state.requests[0]?.responseMode).toBe("local");
    expect(state.requests[0]?.incognito).not.toBe(true);

    await page.reload();
    await expect(page.getByText("This reply is saved locally.")).toBeVisible();

    await page.getByRole("button", { name: "Open conversation panel" }).click();
    const privateButton = page.getByRole("button", { name: "Private chat" });
    await privateButton.click();
    await expect(privateButton).toHaveAttribute("aria-pressed", "true");
    await composer.fill("Forget this private turn");
    await composer.press("Enter");
    await expect(
      page.getByText("This reply is intentionally ephemeral."),
    ).toBeVisible();
    await expect.poll(() => state.requests.length).toBe(2);
    expect(state.requests[1]?.preferredProvider).toBe("local");
    expect(state.requests[1]?.responseMode).toBe("local");
    expect(state.requests[1]?.incognito).toBe(true);

    await page.reload();
    await expect(page.getByText("This reply is saved locally.")).toBeVisible();
    await expect(
      page.getByText("This reply is intentionally ephemeral."),
    ).toHaveCount(0);
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

  test("blank canvas returns a focused empty Chat to all bots @canvas", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installAuthenticatedApi(page);
    await page.goto("/?view=chat");

    const firstBot = page.getByRole("radio", { name: "Test Bot 1" });
    await expect(firstBot).toBeVisible();
    await firstBot.click();

    const selectedHero = page.locator('[data-selected-bot-hero="true"]');
    await expect(selectedHero).toBeVisible();
    await expect(firstBot).toHaveAttribute("aria-checked", "true");
    await expect(
      page.locator('[data-relationship-depth-input-shield="true"]'),
    ).toHaveCount(0);
    await expect(page.locator('main[data-zen-surface="true"]')).toHaveAttribute(
      "data-relationship-depth-motion",
      "crossfade",
    );
    await expect(
      page.locator('[data-home-affordance="wordmark"]'),
    ).toHaveAttribute("aria-label", "Back to the Bot Library");

    const focusedCanvas = selectedHero.locator("..");
    const focusedCanvasBox = await focusedCanvas.boundingBox();
    expect(focusedCanvasBox).not.toBeNull();
    if (!focusedCanvasBox) return;
    await page.mouse.click(
      focusedCanvasBox.x + 24,
      focusedCanvasBox.y + focusedCanvasBox.height / 2,
    );

    await expect(selectedHero).toHaveCount(0);
    await expect(firstBot).toHaveAttribute("aria-checked", "false");
    await expect(page.locator('[data-title="PRISM"]')).toBeVisible();
  });

  for (const theme of ["dark", "light"] as const) {
    test(`Zen Home depth restores the exact Library checkpoint in ${theme} theme @relationship-depth`, async ({
      page,
    }) => {
      test.setTimeout(60_000);
      await page.emulateMedia({ reducedMotion: "no-preference" });
      const groupName = "Story Circle";
      const chatWrites: string[] = [];
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/chat"
        ) {
          chatWrites.push(request.url());
        }
      });
      await installAuthenticatedApi(page, {
        theme,
        botLibraryGroups: [
          {
            id: "group:relationship-depth",
            name: groupName,
            description: "A focused relationship navigation fixture.",
            botIds: ["e2e-bot-a", "e2e-bot-b"],
            deleteProtected: false,
            builtIn: false,
            createdAt: "2026-07-14T12:00:00.000Z",
            updatedAt: "2026-07-14T12:00:00.000Z",
          },
        ],
      });
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/?view=chat");

      await page
        .getByRole("button", { name: "Bot group filter: All bots" })
        .click();
      await page.getByRole("option", { name: groupName }).click();
      const groupTrigger = page.getByRole("button", {
        name: `Bot group filter: ${groupName}`,
      });
      const composer = page.getByRole("textbox").last();
      const firstBot = page.getByRole("radio", { name: "Test Bot 1" });
      const shell = page.locator('main[data-zen-surface="true"]');
      await composer.fill("Keep this room draft exactly.");
      await firstBot.click();

      await expect(shell).toHaveAttribute("inert", "");
      await expect(shell).toHaveAttribute(
        "data-relationship-depth-motion",
        "shared-anchor",
      );
      await expect(shell).toHaveAttribute(
        "data-relationship-depth-transition",
        "settled",
      );
      await expect(shell).not.toHaveAttribute("inert", "");
      await expect(
        page.locator(
          '[data-relationship-depth-anchor="home"][data-relationship-depth-identity="bot:e2e-bot-a"]',
        ),
      ).toBeVisible();
      await expect(
        page.locator('[data-relationship-depth-input-shield="true"]'),
      ).toHaveCount(0);
      expect(chatWrites).toEqual([]);
      await page.screenshot({
        path: `.codex/output/relationship-depth-${theme}-1440x900.png`,
      });

      await page.keyboard.press("Escape");
      await expect(groupTrigger).toBeVisible();
      await expect(composer).toHaveText("Keep this room draft exactly.");
      await expect(firstBot).toHaveAttribute("aria-checked", "false");
      await expect(firstBot).toBeFocused();
      await expect(page.locator('[data-selected-bot-hero="true"]')).toHaveCount(
        0,
      );
      expect(chatWrites).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }

  test("direct Zen Home visits pull back without synthetic dialogue and restore on Escape @relationship-depth", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installAuthenticatedApi(page);
    const prismHome = {
      ...testConversation,
      id: "e2e-prism-home",
      title: "Prism Home",
      messages: [
        {
          id: "prism-home-user",
          role: "user" as const,
          content: "Prism Home question",
          createdAt: "2026-07-14T12:00:00.000Z",
        },
        {
          id: "prism-home-assistant",
          role: "assistant" as const,
          content: "Welcome to Prism Home.",
          createdAt: "2026-07-14T12:00:01.000Z",
        },
      ],
      hasAssistantReply: true,
    };
    const botHome = {
      ...testConversation,
      id: "e2e-bot-home",
      title: "Test Bot 1 Home",
      botId: "e2e-bot-a",
      messages: [
        {
          id: "bot-home-user",
          role: "user" as const,
          content: "Persona Home question",
          createdAt: "2026-07-14T13:00:00.000Z",
        },
        {
          id: "bot-home-assistant",
          role: "assistant" as const,
          content: "Welcome to Test Bot 1 Home.",
          createdAt: "2026-07-14T13:00:01.000Z",
        },
      ],
      hasAssistantReply: true,
      history: {
        contextKey: "bot:e2e-bot-a",
        contextKind: "persona_home",
        conversationId: "e2e-bot-home",
        rootConversationId: "e2e-bot-home",
        episodeId: "e2e-bot-home",
        ownerBotId: "e2e-bot-a",
        origin: { kind: "relationship", id: "e2e-bot-a" },
        participantBotIds: ["e2e-bot-a"],
        createdAt: "2026-07-14T13:00:00.000Z",
        updatedAt: "2026-07-14T13:00:01.000Z",
        archived: false,
        continuationConversationId: "e2e-bot-home",
        nativeRoute: {
          view: "chat",
          conversationId: "e2e-bot-home",
          botId: "e2e-bot-a",
        },
      },
    };
    const conversations = [prismHome, botHome];
    const chatWrites: string[] = [];
    const zenOpenBodies: Array<{ botId?: string | null }> = [];
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/chat"
      ) {
        chatWrites.push(request.url());
      }
    });
    const fulfillJson = (route: Route, payload: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    await page.route("**/api/conversations", (route) =>
      fulfillJson(route, {
        conversations: conversations.map((conversation) => ({
          ...conversation,
          lastBotId: conversation.botId,
          lastBotColor: conversation.botId === "e2e-bot-a" ? "#8b5cf6" : null,
        })),
      }),
    );
    await page.route("**/api/conversations/zen/open", (route) => {
      const body = route.request().postDataJSON() as { botId?: string | null };
      zenOpenBodies.push(body);
      return fulfillJson(route, {
        conversationId: body.botId === "e2e-bot-a" ? botHome.id : prismHome.id,
      });
    });
    await page.route("**/api/bots/e2e-bot-a/memory-panel*", (route) =>
      fulfillJson(route, {
        botId: "e2e-bot-a",
        memories: [],
        aboutYouMemories: [],
        botOpinion: null,
        sessionOpinion: null,
        botStatusSummary: null,
        counts: {
          total: 0,
          visible: 0,
          protectedAboutYou: 0,
          bySource: { direct: 0, inferred: 0, compiled: 0, about_you: 0 },
          byTier: { short_term: 0, long_term: 0 },
          byCategory: { general: 0, user: 0, bot_relation: 0 },
        },
      }),
    );
    for (const conversation of conversations) {
      await page.route(`**/api/conversations/${conversation.id}`, (route) =>
        fulfillJson(route, { conversation }),
      );
      await page.route(
        `**/api/conversations/${conversation.id}/summary`,
        (route) => fulfillJson(route, { summary: null }),
      );
      await page.route(
        `**/api/conversations/${conversation.id}/summarization-debug`,
        (route) =>
          fulfillJson(route, {
            debug: {
              conversationId: conversation.id,
              mode: "zen",
              inProgress: false,
              latestSummary: null,
              latestDisplaySummary: null,
              latestSummaryAt: null,
              messagesSinceLastCompaction: 0,
              summaryCount: 0,
            },
          }),
      );
    }

    await page.goto("/?view=chat");
    await expect(page.getByText("Welcome to Prism Home.")).toBeVisible();
    zenOpenBodies.length = 0;
    const homePicker = page.getByRole("button", { name: "Zen Home" });
    await homePicker.click();
    await page
      .getByRole("listbox", { name: "Zen Home" })
      .getByRole("option", { name: "Test Bot 1" })
      .click();

    const shell = page.locator('main[data-zen-surface="true"]');
    await expect(page.getByText("Welcome to Test Bot 1 Home.")).toBeVisible();
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-motion",
      "pullback-swap",
    );
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );
    await expect(
      page.locator('[data-relationship-depth-input-shield="true"]'),
    ).toHaveCount(0);
    expect(chatWrites).toEqual([]);
    expect(zenOpenBodies).toEqual([]);

    await homePicker.click();
    await page
      .getByRole("listbox", { name: "Zen Home" })
      .getByRole("option", { name: "Test Bot 2" })
      .click();
    await expect(
      page.locator(
        '[data-relationship-depth-anchor="home"][data-relationship-depth-identity="bot:e2e-bot-b"]',
      ),
    ).toBeVisible();
    await expect(page.getByText("Welcome to Test Bot 1 Home.")).toHaveCount(0);
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );
    expect(zenOpenBodies).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByText("Welcome to Test Bot 1 Home.")).toBeVisible();
    await expect(homePicker).toContainText("Test Bot 1");
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );

    await page.keyboard.press("Escape");
    await expect(page.getByText("Welcome to Prism Home.")).toBeVisible();
    await expect(homePicker).toContainText("Default");
    await expect(homePicker).toBeFocused();
    expect(chatWrites).toEqual([]);

    // Sidebar persona categories resolve the same persistent Home without
    // mounting a historical episode as an interactive conversation. This
    // reduced-motion path previously entered a native async View Transition
    // and could freeze WebKit while the live editor was being replaced.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Open conversation panel" }).click();
    await page
      .getByRole("button", {
        name: "Select and expand Test Bot 1 conversations",
      })
      .click();
    await expect(page.getByText("Welcome to Test Bot 1 Home.")).toBeVisible();
    await expect(
      page
        .locator('[data-history-timeline-entry="true"]')
        .filter({ hasText: "Test Bot 1 Home" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Test Bot 1 Home", exact: true }),
    ).toHaveCount(0);
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );
    expect(zenOpenBodies).toEqual([]);

    // Zen keeps its lived timeline intact: mutation/branch actions stay out
    // of both the context menu and the sidebar-open message presentation.
    await page
      .locator('[data-message-id="bot-home-user"]')
      .click({ button: "right" });
    const zenMessageActions = page.getByRole("menu", {
      name: "Message actions",
    });
    await expect(zenMessageActions).toBeVisible();
    await expect(
      zenMessageActions.getByRole("menuitem", { name: "Copy", exact: true }),
    ).toBeVisible();
    for (const removedAction of [
      "Edit",
      "Resend",
      "Fork",
      "Delete",
    ] as const) {
      await expect(
        zenMessageActions.getByRole("menuitem", {
          name: removedAction,
          exact: true,
        }),
      ).toHaveCount(0);
    }
    await page.mouse.click(4, 4);
    await expect(zenMessageActions).toHaveCount(0);
    await expect(
      page.locator('[data-tutorial-target="chat-message-actions"]'),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  });

  test("Zen Home return waits for an active reply @relationship-depth", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await installAuthenticatedApi(page);
    let releaseReply!: () => void;
    const replyReleased = new Promise<void>((resolve) => {
      releaseReply = resolve;
    });
    let markReplyStarted!: () => void;
    const replyStarted = new Promise<void>((resolve) => {
      markReplyStarted = resolve;
    });
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      markReplyStarted();
      await replyReleased;
      return route.fallback();
    });

    try {
      await page.goto("/?view=chat");
      await page.getByRole("radio", { name: "Test Bot 1" }).click();
      const shell = page.locator('main[data-zen-surface="true"]');
      await expect(shell).toHaveAttribute(
        "data-relationship-depth-transition",
        "settled",
      );

      const composer = page.getByRole("textbox").last();
      await composer.fill("Stay in this Home while the reply is active.");
      await composer.press("Enter");
      await replyStarted;

      const backButton = page.locator('[data-home-affordance="wordmark"]');
      await expect(backButton).toBeDisabled();
      await expect(backButton).toHaveAttribute(
        "aria-label",
        "Wait for the current reply before returning",
      );
      await page.keyboard.press("Escape");
      await expect(backButton).toBeDisabled();
      await expect(shell).toHaveAttribute(
        "data-relationship-depth-transition",
        "settled",
      );
    } finally {
      releaseReply();
    }
  });

  test("saved compact bot group filters the canvas and adds an eligible Library bot @group-room", async ({
    page,
  }) => {
    const now = "2026-07-14T12:00:00.000Z";
    await installAuthenticatedApi(page, {
      botLibraryGroups: [
        {
          id: "builtin:favorites",
          name: "Favorites",
          description: "Pinned bots you want to keep close.",
          botIds: [],
          deleteProtected: false,
          builtIn: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "group:story-circle",
          name: "Story Circle",
          description: "A tight two-bot test room.",
          botIds: ["e2e-bot-a", "e2e-bot-b"],
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.goto("/?view=chat");

    const allGroupsTrigger = page.getByRole("button", {
      name: "Bot group filter: All bots",
    });
    await expect(allGroupsTrigger).toBeVisible();
    await allGroupsTrigger.click();
    await expect(
      page.getByRole("option", { name: "Ungrouped bots" }),
    ).toBeVisible();
    await page.getByRole("option", { name: "Story Circle" }).click();

    const storyGroupTrigger = page.getByRole("button", {
      name: "Bot group filter: Story Circle",
    });
    await expect(storyGroupTrigger).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "Explore Story Circle" }),
    ).toBeVisible();
    await expect(page.getByText("A tight two-bot test room.")).toBeVisible();

    const groupGrid = page.getByRole("radiogroup", {
      name: "Bot for this chat",
    });
    await expect(groupGrid.getByRole("radio")).toHaveCount(2);
    await expect(
      groupGrid.getByRole("radio", { name: "Test Bot 1" }),
    ).toBeVisible();
    await expect(
      groupGrid.getByRole("radio", { name: "Test Bot 2" }),
    ).toBeVisible();
    await expect(
      groupGrid.getByRole("radio", { name: "Test Bot 3" }),
    ).toHaveCount(0);

    await page
      .getByRole("button", { name: "Add Library bots to Story Circle" })
      .click();
    const addBotDialog = page.getByRole("dialog", {
      name: "Add a bot to Story Circle",
    });
    await expect(addBotDialog).toBeVisible();
    const eligibleBotSelect = addBotDialog.getByLabel("Bot");
    await expect(eligibleBotSelect).toBeFocused();
    await eligibleBotSelect.selectOption("e2e-bot-c");
    await addBotDialog.getByRole("button", { name: "Add bot" }).click();

    await expect(addBotDialog).toHaveCount(0);
    await expect(groupGrid.getByRole("radio")).toHaveCount(3);
    await expect(
      groupGrid.getByRole("radio", { name: "Test Bot 3" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Every Library bot is already in Story Circle",
      }),
    ).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = window.localStorage.getItem(
            "prism_bot_library_groups:e2e-user",
          );
          const groups = raw
            ? (JSON.parse(raw) as Array<{ id?: string; botIds?: string[] }>)
            : [];
          return (
            groups.find((group) => group.id === "group:story-circle")?.botIds ??
            []
          );
        }),
      )
      .toEqual(["e2e-bot-a", "e2e-bot-b", "e2e-bot-c"]);

    await storyGroupTrigger.click();
    await expect(
      page.getByRole("listbox", { name: "Bot group filter" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "Ungrouped bots" }),
    ).toHaveCount(0);
  });

  test("exact seven-member groups cross the waiting-room boundary with safe live fallbacks @group-room-wifex8", async ({
    page,
  }) => {
    const now = "2026-07-14T12:00:00.000Z";
    const exactBots = waitingRoomTestBots.slice(0, 7);
    const exactBotIds = exactBots.map((bot) => bot.id);
    const builtInGroupName = "Favorites";
    const exactGroupName = "Exact Seven Circle";
    const reconciledGroupName = "Reconciled Seven Circle";
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installAuthenticatedApi(page, {
      bots: exactBots,
      botLibraryGroups: [
        {
          id: "builtin:favorites",
          name: builtInGroupName,
          description: "A built-in filter must stay on the compact canvas.",
          botIds: exactBotIds,
          deleteProtected: false,
          builtIn: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "group:exact-seven",
          name: exactGroupName,
          description: "Exactly seven valid companions qualify for a room.",
          botIds: exactBotIds,
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "group:reconciled-seven",
          name: reconciledGroupName,
          description:
            "Two removed companions safely reconcile this group below the room threshold.",
          botIds: [
            ...exactBotIds.slice(0, 5),
            "e2e-deleted-waiting-bot",
            "e2e-missing-waiting-bot",
          ],
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?view=chat");

    await selectBotGroupFilter(page, builtInGroupName);
    await expect(
      page.locator('[data-bot-group-waiting-room="true"]'),
    ).toHaveCount(0);
    await expect(
      page
        .getByRole("radiogroup", { name: "Bot for this chat" })
        .getByRole("radio"),
    ).toHaveCount(7);

    await selectBotGroupFilter(page, exactGroupName);
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const presences = room.locator("[data-room-presence-bot-id]");
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-presence-count", "7");
    await expect(
      room.locator('[data-room-presence-role="anchor"]'),
    ).toHaveCount(5);
    await expect(
      room.locator('[data-room-presence-role="roamer"]'),
    ).toHaveCount(2);
    expect(
      (
        await presences.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
        )
      ).sort(),
    ).toEqual([...exactBotIds].sort());

    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(room).toHaveAttribute("data-room-viewport", "1280x720");
    await expect(room).toHaveAttribute("data-room-presence-count", "6");
    await expect(presences).toHaveCount(6);
    await expect(
      room.locator('[data-room-presence-role="anchor"]'),
    ).toHaveCount(5);
    await expect(
      room.locator('[data-room-presence-role="roamer"]'),
    ).toHaveCount(1);
    const constrainedVisitId = await room.getAttribute("data-room-visit-id");
    await page.setViewportSize({ width: 899, height: 720 });
    await expect(room).toHaveCount(0);
    await expect(
      page
        .getByRole("radiogroup", { name: "Bot for this chat" })
        .getByRole("radio"),
    ).toHaveCount(7);
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute(
      "data-room-visit-id",
      constrainedVisitId!,
    );

    await selectBotGroupFilter(page, reconciledGroupName);
    await expect(room).toHaveCount(0);
    const reconciledPicker = page.getByRole("radiogroup", {
      name: "Bot for this chat",
    });
    await expect(reconciledPicker.getByRole("radio")).toHaveCount(5);
    await expect(
      page.locator(
        '[data-room-presence-bot-id="e2e-deleted-waiting-bot"], [data-room-presence-bot-id="e2e-missing-waiting-bot"]',
      ),
    ).toHaveCount(0);
  });

  test("saved group atmosphere selects, generates, survives reload, crossfades to Zen, and fails back to its gradient @group-room-atmosphere", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const groupId = "group:atmosphere-circle";
    const groupName = "Atmosphere Circle";
    const reusableImage: TestImageRecord = {
      ...testGroupImages(["e2e-bot-a"], 1)[0]!,
      id: "e2e-room-atmosphere-existing",
      prompt: "A quiet violet observatory",
      botId: null,
    };
    const remoteOnlyImage: TestImageRecord = {
      ...testGroupImages(["e2e-bot-b"], 1)[0]!,
      id: "e2e-room-atmosphere-remote",
      prompt: "Remote-only room",
      botId: null,
      hasLocalFile: false,
      displayUrl: "https://remote.invalid/room.png",
    };
    const fixtureImages = [reusableImage, remoteOnlyImage];
    const externalImageRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname === "remote.invalid") {
        externalImageRequests.push(request.url());
      }
    });
    await installAuthenticatedApi(page, {
      images: fixtureImages,
      zenWallpaperLocalImageModel: "e2e-zen-wallpaper-model",
      preserveBotLibraryGroupsOnReload: true,
      botLibraryGroups: [
        {
          id: groupId,
          name: groupName,
          description: "Three companions sharing a calm design room.",
          botIds: ["e2e-bot-a", "e2e-bot-b", "e2e-bot-c"],
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    let generationBody: Record<string, unknown> | null = null;
    await page.route("**/api/images/generate", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      generationBody = route.request().postDataJSON() as Record<
        string,
        unknown
      >;
      fixtureImages.push({
        ...reusableImage,
        id: "e2e-room-atmosphere-generated",
        prompt: "Server-composed trusted room prompt",
        purpose: "group-room-wallpaper",
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          composedPrompt: "Server-composed trusted room prompt",
          image: {
            id: "e2e-room-atmosphere-generated",
            displayUrl: "/api/images/e2e-room-atmosphere-generated/file",
            hasLocalFile: true,
            purpose: "group-room-wallpaper",
          },
        }),
      });
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?view=chat");
    await selectBotGroupFilter(page, groupName);
    const atmosphereOpener = page.getByRole("button", {
      name: `Choose or generate ${groupName}'s room atmosphere`,
    });
    await atmosphereOpener.click();
    const dialog = page.getByRole("dialog", {
      name: `${groupName} atmosphere`,
    });
    await expect(dialog).toBeVisible();
    const closeAtmosphereDialog = dialog.getByRole("button", {
      name: "Close room atmosphere dialog",
    });
    await expect(closeAtmosphereDialog).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        dialog.evaluate((node) => node.contains(document.activeElement)),
      )
      .toBe(true);
    await page.keyboard.press("Tab");
    await expect(closeAtmosphereDialog).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(atmosphereOpener).toBeFocused();
    await atmosphereOpener.click();
    await expect(dialog).toBeVisible();
    await expect(closeAtmosphereDialog).toBeFocused();
    await page.screenshot({
      path: ".codex/output/group-room-atmosphere-dialog-dark-1280x720.png",
      fullPage: false,
    });
    await expect(
      dialog.getByRole("button", {
        name: `Use saved image ${reusableImage.prompt} for ${groupName}`,
      }),
    ).toBeVisible();
    await expect(dialog.getByText(remoteOnlyImage.prompt)).toHaveCount(0);
    expect(externalImageRequests).toEqual([]);
    await dialog
      .getByRole("button", {
        name: `Use saved image ${reusableImage.prompt} for ${groupName}`,
      })
      .click();

    const atmosphere = page.locator(
      '[data-room-atmosphere-image-id="e2e-room-atmosphere-existing"]',
    );
    await expect(atmosphere).toBeVisible();
    await expect(page.locator('main[data-zen-surface="true"]')).toHaveAttribute(
      "data-group-room-atmosphere-active",
      "true",
    );
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const raw = window.localStorage.getItem(
            "prism_bot_library_groups:e2e-user",
          );
          const groups = raw
            ? (JSON.parse(raw) as Array<{
                id?: string;
                roomAtmosphere?: { imageId?: string };
              }>)
            : [];
          return groups.find((group) => group.id === id)?.roomAtmosphere
            ?.imageId;
        }, groupId),
      )
      .toBe("e2e-room-atmosphere-existing");

    await page.reload();
    await selectBotGroupFilter(page, groupName);
    await expect(atmosphere).toBeVisible();
    await page
      .getByRole("button", {
        name: `Replace or clear ${groupName}'s room atmosphere`,
      })
      .click();
    await dialog.getByRole("button", { name: "Generate room" }).click();
    await expect.poll(() => generationBody).not.toBeNull();
    expect(generationBody).toMatchObject({
      purpose: "group-room-wallpaper",
      groupName,
      groupDescription: "Three companions sharing a calm design room.",
      memberBotIds: ["e2e-bot-a", "e2e-bot-b", "e2e-bot-c"],
      preferredProvider: "local",
      model: "e2e-zen-wallpaper-model",
      size: "1536x1024",
    });
    expect(generationBody?.botId).toBeUndefined();
    expect(generationBody?.conversationId).toBeUndefined();
    expect(generationBody?.prompt).toBeUndefined();
    const generatedAtmosphere = page.locator(
      '[data-room-atmosphere-image-id="e2e-room-atmosphere-generated"]',
    );
    await expect(generatedAtmosphere).toBeVisible();
    await expect
      .poll(() =>
        generatedAtmosphere.locator("img").evaluate((image) => ({
          opacity: getComputedStyle(image).opacity,
          filter: getComputedStyle(image).filter,
        })),
      )
      .toMatchObject({ opacity: "0.28" });

    const shell = page.locator('main[data-zen-surface="true"]');
    const sourceAtmosphereTransition = page.waitForFunction(() => {
      const root = document.documentElement;
      return root.dataset.relationshipDepthAtmosphere === "crossfade";
    });
    await Promise.all([
      sourceAtmosphereTransition,
      page.getByRole("radio", { name: "Test Bot 1" }).click(),
    ]);
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );
    await expect(generatedAtmosphere).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(generatedAtmosphere).toBeVisible();
    await page.screenshot({
      path: ".codex/output/group-room-atmosphere-dark-1280x720.png",
      fullPage: false,
    });

    await page.evaluate(
      ({ storageKey, targetGroupId, updatedAt }) => {
        const raw = window.localStorage.getItem(storageKey);
        const groups = raw
          ? (JSON.parse(raw) as Array<Record<string, unknown>>)
          : [];
        window.localStorage.setItem(
          storageKey,
          JSON.stringify(
            groups.map((group) =>
              group.id === targetGroupId
                ? {
                    ...group,
                    roomAtmosphere: {
                      imageId: "e2e-deleted-room-atmosphere",
                      updatedAt,
                    },
                  }
                : group,
            ),
          ),
        );
      },
      {
        storageKey: "prism_bot_library_groups:e2e-user",
        targetGroupId: groupId,
        updatedAt: "2026-07-14T14:00:00.000Z",
      },
    );
    await page.reload();
    const missingFile = page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith("/api/images/e2e-deleted-room-atmosphere/file") &&
        response.status() === 404,
    );
    await selectBotGroupFilter(page, groupName);
    await missingFile;
    await expect(
      page.locator(
        '[data-room-atmosphere-image-id="e2e-deleted-room-atmosphere"]',
      ),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: `Explore ${groupName}` }),
    ).toBeVisible();
    await expect(shell).not.toHaveAttribute(
      "data-group-room-atmosphere-active",
      "true",
    );
  });

  test("waiting-room atmosphere keeps its cast stable and stays readable in light theme @group-room-atmosphere", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Luminous Waiting Room";
    const firstImage: TestImageRecord = {
      ...testGroupImages(["e2e-waiting-bot-1"], 1)[0]!,
      id: "e2e-light-room-first",
      prompt: "A luminous shared studio",
      botId: null,
    };
    const secondImage: TestImageRecord = {
      ...testGroupImages(["e2e-waiting-bot-2"], 1)[0]!,
      id: "e2e-light-room-second",
      prompt: "A warm glass conservatory",
      botId: null,
    };
    await installAuthenticatedApi(page, {
      theme: "light",
      bots: waitingRoomTestBots.slice(0, 8),
      images: [firstImage, secondImage],
      botLibraryGroups: [
        {
          id: "group:luminous-waiting-room",
          name: groupName,
          description: "A bright room for a full companion circle.",
          botIds: waitingRoomTestBots.slice(0, 8).map((bot) => bot.id),
          roomAtmosphere: {
            imageId: firstImage.id,
            prompt: firstImage.prompt,
            updatedAt: now,
          },
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?view=chat");
    await selectBotGroupFilter(page, groupName);
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const visitId = await room.getAttribute("data-room-visit-id");
    await expect(
      page.locator(`[data-room-atmosphere-image-id="${firstImage.id}"]`),
    ).toBeVisible();
    const atmosphereButton = page.getByRole("button", {
      name: `Replace or clear ${groupName}'s room atmosphere`,
    });
    await atmosphereButton.focus();
    await atmosphereButton.press("Enter");
    const dialog = page.getByRole("dialog", {
      name: `${groupName} atmosphere`,
    });
    await dialog
      .getByRole("button", {
        name: `Use saved image ${secondImage.prompt} for ${groupName}`,
      })
      .click();
    await expect(
      page.locator(`[data-room-atmosphere-image-id="${secondImage.id}"]`),
    ).toBeVisible();
    await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
    await expect(
      page.getByRole("heading", { name: `Explore ${groupName}` }),
    ).toBeVisible();
    await page.screenshot({
      path: ".codex/output/group-room-atmosphere-light-1440x900.png",
      fullPage: false,
    });
  });

  for (const theme of ["dark", "light"] as const) {
    test(`compact group room stays clear across the desktop viewport contract in ${theme} theme @group-room`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const now = "2026-07-14T12:00:00.000Z";
      const groupName = "Collaborative Product Council";
      const compactGroupBotIds = ["e2e-bot-a", "e2e-bot-b", "e2e-bot-c"];
      const compactGroupImages = [
        ...testGroupImages(compactGroupBotIds),
        {
          ...testGroupImages(["orphan-bot"], 1)[0]!,
          id: "e2e-orphan-group-image",
        },
        {
          ...testGroupImages(["e2e-bot-a"], 1)[0]!,
          id: "e2e-remote-only-group-image",
          hasLocalFile: false,
          displayUrl: "https://remote.invalid/remote-only.png",
        },
        {
          ...testGroupImages(["e2e-bot-b"], 1)[0]!,
          id: "e2e-group-wallpaper",
          purpose: "wallpaper",
        },
      ];
      const externalImageRequests: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).hostname === "remote.invalid") {
          externalImageRequests.push(request.url());
        }
      });
      await installAuthenticatedApi(page, {
        theme,
        images: compactGroupImages,
        botLibraryGroups: [
          {
            id: "builtin:favorites",
            name: "Favorites",
            description: "Pinned bots you want to keep close.",
            botIds: [],
            deleteProtected: false,
            builtIn: true,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: "group:viewport-council",
            name: groupName,
            description:
              "Five specialists gathered for compact collaborative thinking across product, accessibility, and craft, with enough detail to exercise the short desktop canvas.",
            botIds: compactGroupBotIds,
            deleteProtected: false,
            builtIn: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      for (const viewport of [
        { width: 900, height: 560 },
        { width: 1280, height: 720 },
        { width: 1440, height: 900 },
        { width: 1920, height: 1080 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto("/?view=chat");

        if (viewport.width < 1280) {
          await expect(
            page.getByRole("heading", { name: "Scale your viewport up" }),
          ).toBeVisible();
        } else {
          const groupTrigger = page.getByRole("button", {
            name: "Bot group filter: All bots",
          });
          await expect(groupTrigger).toBeVisible();
          await groupTrigger.click();
          await page.getByRole("option", { name: groupName }).click();

          const hero = page.getByRole("region", {
            name: `Explore ${groupName}`,
          });
          const picker = page.getByRole("radiogroup", {
            name: "Bot for this chat",
          });
          const composer = page.getByRole("textbox").last();
          await expect(hero).toBeVisible();
          await expect(picker).toBeVisible();
          await expect(composer).toBeVisible();
          await expect(
            picker.locator(':scope > span[aria-hidden="true"]'),
          ).toHaveCount(0);

          const bubbles = page.locator(
            '[data-group-image-bubbles="compact"] [data-group-image-bubble-id]',
          );
          const expectedBubbleCount =
            viewport.width >= 1440 && viewport.height >= 760 ? 6 : 4;
          await expect(bubbles).toHaveCount(expectedBubbleCount);
          await expect
            .poll(() =>
              bubbles
                .first()
                .locator("span")
                .first()
                .evaluate((node) => getComputedStyle(node).animationName),
            )
            .toBe("none");
          await expect(
            page.locator(
              '[data-group-image-bubble-id="e2e-orphan-group-image"], [data-group-image-bubble-id="e2e-remote-only-group-image"], [data-group-image-bubble-id="e2e-group-wallpaper"]',
            ),
          ).toHaveCount(0);

          const [
            heroBox,
            pickerBox,
            composerBox,
            bubbleBoxes,
            protectedBoxes,
            documentGeometry,
          ] = await Promise.all([
            hero.boundingBox(),
            picker.boundingBox(),
            composer.boundingBox(),
            bubbles.evaluateAll((nodes) =>
              nodes.map((node) => {
                const rect = node.getBoundingClientRect();
                return {
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                };
              }),
            ),
            hero.locator("h2, p, button").evaluateAll((nodes) =>
              nodes.map((node) => {
                const rect = node.getBoundingClientRect();
                return {
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                };
              }),
            ),
            page.evaluate(() => ({
              documentWidth: document.documentElement.scrollWidth,
              viewportWidth: window.innerWidth,
            })),
          ]);
          expect(heroBox).not.toBeNull();
          expect(pickerBox).not.toBeNull();
          expect(composerBox).not.toBeNull();
          expect(heroBox!.y).toBeGreaterThanOrEqual(0);
          expect(heroBox!.y + heroBox!.height).toBeLessThan(composerBox!.y);
          expect(pickerBox!.y + pickerBox!.height).toBeLessThanOrEqual(
            composerBox!.y,
          );
          const protectedRects = [
            ...protectedBoxes,
            {
              left: pickerBox!.x,
              top: pickerBox!.y,
              right: pickerBox!.x + pickerBox!.width,
              bottom: pickerBox!.y + pickerBox!.height,
            },
            {
              left: composerBox!.x,
              top: composerBox!.y,
              right: composerBox!.x + composerBox!.width,
              bottom: composerBox!.y + composerBox!.height,
            },
          ];
          for (const bubbleBox of bubbleBoxes) {
            expect(bubbleBox.left).toBeGreaterThanOrEqual(0);
            expect(bubbleBox.right).toBeLessThanOrEqual(viewport.width);
            for (const protectedBox of protectedRects) {
              const overlaps =
                bubbleBox.left < protectedBox.right &&
                bubbleBox.right > protectedBox.left &&
                bubbleBox.top < protectedBox.bottom &&
                bubbleBox.bottom > protectedBox.top;
              expect(overlaps).toBe(false);
            }
          }
          expect(documentGeometry.documentWidth).toBeLessThanOrEqual(
            documentGeometry.viewportWidth,
          );
        }

        if (process.env.PRISM_CAPTURE_GROUP_ROOM === "1") {
          await page.screenshot({
            path: `.codex/output/group-room-${theme}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
          });
        }
      }
      expect(externalImageRequests).toEqual([]);
    });
  }

  test("group image bubbles fail closed for inaccessible local image assets without remote fallback @group-room", async ({
    page,
  }) => {
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Fail Closed Image Circle";
    const groupBotIds = ["e2e-bot-a", "e2e-bot-b", "e2e-bot-c"];
    const fixtureImages = testGroupImages(groupBotIds, 2);
    const brokenThumbnailId = fixtureImages[0]!.id;
    const brokenFileId = fixtureImages[1]!.id;
    fixtureImages[0] = {
      ...fixtureImages[0]!,
      thumbAvailable: false,
    };
    fixtureImages[1] = {
      ...fixtureImages[1]!,
      fileAvailable: false,
    };
    const externalImageRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).hostname === "remote.invalid") {
        externalImageRequests.push(request.url());
      }
    });
    await installAuthenticatedApi(page, {
      images: fixtureImages,
      botLibraryGroups: [
        {
          id: "group:fail-closed-images",
          name: groupName,
          description: "A compact image failure boundary.",
          botIds: groupBotIds,
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/?view=chat");
    const groupTrigger = page.getByRole("button", {
      name: "Bot group filter: All bots",
    });
    await groupTrigger.click();
    await page.getByRole("option", { name: groupName }).click();

    const layer = page.locator('[data-group-image-bubbles="compact"]');
    await expect(layer).toHaveAttribute("data-group-image-bubble-count", "5");
    await expect(
      layer.locator(`[data-group-image-bubble-id="${brokenThumbnailId}"]`),
    ).toHaveCount(0);
    await expect(layer.locator("img")).toHaveCount(5);
    const brokenFileBubble = layer.locator(
      `[data-group-image-bubble-id="${brokenFileId}"]`,
    );
    await expect(brokenFileBubble).toBeVisible();
    const fileFailure = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/images/${brokenFileId}/file`) &&
        response.status() === 404,
    );
    await brokenFileBubble.getByRole("button").click();
    await fileFailure;
    await expect(
      page.getByRole("dialog", { name: /Generated scene/ }),
    ).toHaveCount(0);
    await expect(brokenFileBubble).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Bot group filter: ${groupName}` }),
    ).toBeFocused();
    expect(externalImageRequests).toEqual([]);
  });

  test("large saved group becomes a stable responsive waiting room @group-room", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Waiting Room Council";
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installAuthenticatedApi(page, {
      bots: waitingRoomTestBots,
      images: [
        ...testGroupImages(
          waitingRoomTestBots.slice(0, 6).map((bot) => bot.id),
          2,
        ),
        {
          ...testGroupImages(["e2e-waiting-bot-1"], 1)[0]!,
          id: "e2e-waiting-remote-only",
          hasLocalFile: false,
          displayUrl: "https://remote.invalid/waiting-remote-only.png",
        },
      ],
      botLibraryGroups: [
        {
          id: "builtin:favorites",
          name: "Favorites",
          description: "Pinned bots you want to keep close.",
          botIds: [],
          deleteProtected: false,
          builtIn: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "group:waiting-room-council",
          name: groupName,
          description:
            "A broad circle of distinct companions who can gather without starting a conversation.",
          botIds: waitingRoomTestBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?view=chat");
    const groupTrigger = page.getByRole("button", {
      name: "Bot group filter: All bots",
    });
    await expect(groupTrigger).toBeVisible();
    const mutatingRequests: string[] = [];
    const externalImageRequests: string[] = [];
    page.on("request", (request) => {
      const requestUrl = new URL(request.url());
      if (
        requestUrl.pathname.startsWith("/api/") &&
        !["GET", "HEAD", "OPTIONS"].includes(request.method())
      ) {
        mutatingRequests.push(`${request.method()} ${request.url()}`);
      }
      if (requestUrl.hostname === "remote.invalid") {
        externalImageRequests.push(request.url());
      }
    });
    await groupTrigger.click();
    await page.getByRole("option", { name: groupName }).click();

    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const anchors = room.locator('[data-room-presence-role="anchor"]');
    const roamers = room.locator('[data-room-presence-role="roamer"]');
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-viewport", "1280x720");
    await expect(anchors).toHaveCount(5);
    await expect(roamers).toHaveCount(1);
    const roomImageBubbles = room.locator(
      '[data-group-image-bubbles="waiting"] [data-group-image-bubble-id]',
    );
    await expect(roomImageBubbles).toHaveCount(2);
    await expect(
      room.locator('[data-group-image-bubble-id="e2e-waiting-remote-only"]'),
    ).toHaveCount(0);
    const visitId = await room.getAttribute("data-room-visit-id");
    const initialAnchorIds = await anchors.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
    );

    const assertRoomGeometry = async (): Promise<void> => {
      const composer = page.getByRole("textbox").last();
      await expect(composer).toBeVisible();
      const [roomBox, composerBox, presenceBoxes, imageBubbleBoxes] =
        await Promise.all([
          room.boundingBox(),
          composer.boundingBox(),
          room.locator("[data-room-presence-bot-id]").evaluateAll((nodes) =>
            nodes.map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              };
            }),
          ),
          roomImageBubbles.evaluateAll((nodes) =>
            nodes.map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
              };
            }),
          ),
        ]);
      expect(roomBox).not.toBeNull();
      expect(composerBox).not.toBeNull();
      if (!roomBox || !composerBox) return;
      expect(roomBox.y + roomBox.height).toBeLessThanOrEqual(
        composerBox.y - 12,
      );
      for (const box of presenceBoxes) {
        expect(box.left).toBeGreaterThanOrEqual(roomBox.x - 1);
        expect(box.top).toBeGreaterThanOrEqual(roomBox.y - 1);
        expect(box.right).toBeLessThanOrEqual(roomBox.x + roomBox.width + 1);
        expect(box.bottom).toBeLessThanOrEqual(roomBox.y + roomBox.height + 1);
      }
      for (const bubbleBox of imageBubbleBoxes) {
        expect(bubbleBox.left).toBeGreaterThanOrEqual(roomBox.x);
        expect(bubbleBox.top).toBeGreaterThanOrEqual(roomBox.y);
        expect(bubbleBox.right).toBeLessThanOrEqual(roomBox.x + roomBox.width);
        expect(bubbleBox.bottom).toBeLessThanOrEqual(
          roomBox.y + roomBox.height,
        );
        for (const presenceBox of presenceBoxes) {
          const overlaps =
            bubbleBox.left < presenceBox.right &&
            bubbleBox.right > presenceBox.left &&
            bubbleBox.top < presenceBox.bottom &&
            bubbleBox.bottom > presenceBox.top;
          expect(overlaps).toBe(false);
        }
      }
    };
    await assertRoomGeometry();

    const firstRoomImageButton = roomImageBubbles.first().getByRole("button");
    const firstRoomImageVisual = firstRoomImageButton.locator("span").first();
    await expect
      .poll(() =>
        firstRoomImageVisual.evaluate(
          (node) => getComputedStyle(node).animationName,
        ),
      )
      .not.toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expect
      .poll(() =>
        firstRoomImageVisual.evaluate(
          (node) => getComputedStyle(node).animationName,
        ),
      )
      .toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await firstRoomImageButton.focus();
    await firstRoomImageButton.press("Enter");
    const imagePreview = page.getByRole("dialog", {
      name: /Generated scene/,
    });
    await imagePreview.locator("img").evaluate(async (node) => {
      await (node as HTMLImageElement).decode().catch(() => undefined);
    });
    await expect(imagePreview).toBeVisible();
    await expect(
      imagePreview.getByRole("button", { name: "Close image preview" }),
    ).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(imagePreview).toHaveCount(0);
    await expect(firstRoomImageButton).toBeFocused();

    await page.setViewportSize({ width: 1280, height: 760 });
    expect(
      await page.evaluate(() => ({
        width: window.innerWidth,
        height: window.innerHeight,
      })),
    ).toEqual({ width: 1280, height: 760 });
    await expect(room).toHaveAttribute("data-room-viewport", "1280x760");
    await expect(room).toHaveAttribute("data-room-presence-count", "7");
    await expect(roamers).toHaveCount(2);
    await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
    await expect(anchors).toHaveCount(5);
    expect(
      await anchors.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
      ),
    ).toEqual(initialAnchorIds);

    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(room).toHaveAttribute("data-room-presence-count", "8");
    await expect(roamers).toHaveCount(3);
    await expect(roomImageBubbles).toHaveCount(4);
    await assertRoomGeometry();
    if (process.env.PRISM_CAPTURE_GROUP_ROOM === "1") {
      await page.screenshot({
        path: ".codex/output/waiting-room-images-dark-1600x900.png",
        fullPage: false,
      });
    }

    const search = page.getByRole("searchbox", {
      name: "Search bots by name",
    });
    await search.fill("Waiting Bot 1");
    await expect(room).toHaveCount(0);
    await search.fill("");
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
    expect(
      await anchors.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
      ),
    ).toEqual(initialAnchorIds);

    const firstAnchorId = await anchors
      .first()
      .getAttribute("data-room-presence-bot-id");
    const promotedRoamerId = await roamers
      .first()
      .getAttribute("data-room-presence-bot-id");
    expect(promotedRoamerId).not.toBeNull();
    const composer = page.getByRole("textbox").last();
    await composer.fill("A draft held only for this room");
    await activateNavigationControl(roamers.first().getByRole("button"));
    const shell = page.locator('main[data-zen-surface="true"]');
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );
    await expect(room).toHaveCount(0);
    await expect(
      page.locator(
        `[data-relationship-depth-anchor="home"][data-relationship-depth-identity="bot:${promotedRoamerId}"]`,
      ),
    ).toBeVisible();
    await expect(composer).toHaveText("");
    await composer.fill("A draft held only for this Zen Home");
    await expect(
      page.locator('[data-home-affordance="wordmark"]'),
    ).toHaveAttribute("aria-label", `Back to ${groupName}`);

    await page.keyboard.press("Escape");
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
    await expect(composer).toHaveText("A draft held only for this room");
    await expect(
      room.locator(
        `[data-room-presence-bot-id="${promotedRoamerId}"][data-room-presence-role="anchor"]`,
      ),
    ).toHaveCount(1);
    await expect(
      room.locator(
        `[data-room-presence-bot-id="${firstAnchorId}"][data-room-presence-role="roamer"]`,
      ),
    ).toHaveCount(1);
    const promotedPresenceButton = room
      .locator(`[data-room-presence-bot-id="${promotedRoamerId}"]`)
      .getByRole("button");
    await expect(promotedPresenceButton).toBeFocused();

    await activateNavigationControl(promotedPresenceButton);
    await expect(room).toHaveCount(0);
    await expect(composer).toHaveText("A draft held only for this Zen Home");
    await page.keyboard.press("Escape");
    await expect(room).toBeVisible();
    await expect(composer).toHaveText("A draft held only for this room");

    await composer.fill("A prompt held only for this room");
    await expect(room).toHaveAttribute("data-room-rotation-paused", "true");
    await expect(
      room.locator('[data-group-image-bubbles="waiting"]'),
    ).toHaveAttribute("data-receded", "true");
    await expect(roomImageBubbles.first().locator("button")).toBeDisabled();
    await composer.press("Enter");
    const coffeeStaging = room.locator('[data-room-coffee-staging="true"]');
    await expect(coffeeStaging).toBeVisible();
    await expect(coffeeStaging).toHaveAttribute("data-staged-bot-count", "5");
    await expect(
      coffeeStaging.locator('[data-room-coffee-staging-primary-focus="true"]'),
    ).toBeFocused();
    await expect(composer).toBeDisabled();
    await expect(coffeeStaging).toContainText(
      "A prompt held only for this room",
    );
    await coffeeStaging
      .getByRole("button", { name: "Cancel and edit prompt" })
      .click();
    await expect(coffeeStaging).toHaveCount(0);
    await expect(composer).toBeEnabled();
    await expect(composer).toHaveText("A prompt held only for this room");
    expect(mutatingRequests).toEqual([]);
    expect(externalImageRequests).toEqual([]);
  });

  test("twenty-four-member waiting room completes three bounded rotations and tears down cleanly @group-room-wifex8", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Twenty Four Companion Soak";
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installAuthenticatedApi(page, {
      bots: waitingRoomTestBots,
      botLibraryGroups: [
        {
          id: "group:twenty-four-companion-soak",
          name: groupName,
          description:
            "A full-capacity waiting room used to soak deterministic roster rotations.",
          botIds: waitingRoomTestBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/?view=chat");
    await page.clock.install({ time: new Date(now) });
    await page.clock.pauseAt(
      new Date(await page.evaluate(() => Date.now() + 60_000)),
    );
    await selectBotGroupFilter(page, groupName);
    await page.mouse.move(4, 4);

    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const presences = room.locator("[data-room-presence-bot-id]");
    const anchors = room.locator('[data-room-presence-role="anchor"]');
    const roamers = room.locator('[data-room-presence-role="roamer"]');
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-viewport", "1920x1080");
    await expect(room).toHaveAttribute("data-room-presence-count", "8");
    await expect(room).toHaveAttribute("data-room-rotation-paused", "false");
    await expect(presences).toHaveCount(8);
    await expect(anchors).toHaveCount(5);
    await expect(roamers).toHaveCount(3);
    const visitId = await room.getAttribute("data-room-visit-id");
    const stableAnchorIds = await anchors.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
    );
    const animationBaseline = await room.evaluate(
      (element) => element.getAnimations({ subtree: true }).length,
    );
    const rosterSignatures = new Set<string>([
      JSON.stringify(
        await roamers.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
        ),
      ),
    ]);

    for (let rotationIndex = 0; rotationIndex < 3; rotationIndex += 1) {
      const rotationDelayMs = Number(
        await room.getAttribute("data-room-next-rotation-ms"),
      );
      expect(rotationDelayMs).toBeGreaterThanOrEqual(2 * 60 * 1_000);
      expect(rotationDelayMs).toBeLessThanOrEqual(4 * 60 * 1_000);
      await page.clock.runFor(rotationDelayMs + 50);
      await expect(room).toHaveAttribute(
        "data-room-handoff-order",
        /arrival-before-departure|departure-before-arrival/u,
      );
      await page.clock.runFor(2 * 520 + 100);
      await expect(room).not.toHaveAttribute("data-room-handoff-phase", /.+/u);
      await expect(room).toHaveAttribute("data-room-presence-count", "8");
      await expect(presences).toHaveCount(8);
      await expect(anchors).toHaveCount(5);
      await expect(roamers).toHaveCount(3);
      await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
      expect(
        await anchors.evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
        ),
      ).toEqual(stableAnchorIds);
      rosterSignatures.add(
        JSON.stringify(
          await roamers.evaluateAll((nodes) =>
            nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
          ),
        ),
      );
      expect(
        await room.evaluate(
          (element) => element.getAnimations({ subtree: true }).length,
        ),
      ).toBeLessThanOrEqual(animationBaseline + 12);
    }
    expect(rosterSignatures.size).toBe(4);

    const detachedRoom = await room.elementHandle();
    expect(detachedRoom).not.toBeNull();
    await selectBotGroupFilter(page, "All bots");
    await expect(room).toHaveCount(0);
    await page.clock.runFor(20 * 60 * 1_000);
    await expect(room).toHaveCount(0);
    expect(
      await detachedRoom!.evaluate((element) => ({
        connected: element.isConnected,
        activeAnimations: element
          .getAnimations({ subtree: true })
          .filter(
            (animation) =>
              animation.playState !== "idle" &&
              animation.playState !== "finished",
          ).length,
      })),
    ).toEqual({ connected: false, activeAnimations: 0 });
    expect(pageErrors).toEqual([]);
  });

  test("waiting-room side panel pauses and resumes one timer while a live theme change preserves the visit @group-room-wifex8", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Panel State Circle";
    const roomBots = waitingRoomTestBots.slice(0, 8);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installAuthenticatedApi(page, {
      theme: "light",
      bots: roomBots,
      botLibraryGroups: [
        {
          id: "group:panel-state-circle",
          name: groupName,
          description:
            "A stateful waiting room that remains intact around app chrome.",
          botIds: roomBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?view=chat");
    await page.clock.install({ time: new Date(now) });
    await page.clock.pauseAt(
      new Date(await page.evaluate(() => Date.now() + 60_000)),
    );
    await selectBotGroupFilter(page, groupName);
    await page.mouse.move(4, 4);

    const shell = page.locator('main[data-zen-surface="true"]');
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const presences = room.locator("[data-room-presence-bot-id]");
    const anchors = room.locator('[data-room-presence-role="anchor"]');
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-presence-count", "7");
    await expect(room).toHaveAttribute("data-room-rotation-paused", "false");
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.prismTheme))
      .toBe("light");
    const visitId = await room.getAttribute("data-room-visit-id");
    const initialPresenceIds = await presences.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
    );
    const stableAnchorIds = await anchors.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
    );
    const rotationDelayMs = Number(
      await room.getAttribute("data-room-next-rotation-ms"),
    );
    const firstHalfMs = Math.floor(rotationDelayMs / 2);
    await page.clock.runFor(firstHalfMs);
    const ambientPhaseBeforePanel = await room.getAttribute(
      "data-room-ambient-phase",
    );
    const ambientCycleBeforePanel = await room.getAttribute(
      "data-room-ambient-cycle",
    );

    await page.getByRole("button", { name: "Open Prompt Center" }).click();
    const promptCenter = page.getByRole("dialog", { name: "Commands" });
    await expect(promptCenter).toBeVisible();
    await expect(shell).toHaveAttribute("data-right-panel-open", "true");
    await expect(room).toHaveAttribute("data-room-rotation-paused", "true");
    await expect(room).toHaveAttribute("data-room-ambient-paused", "true");
    await promptCenter
      .locator('[data-prism-panel-theme-toggle="true"]')
      .click();
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.prismTheme))
      .toBe("dark");
    await page.clock.runFor(rotationDelayMs + 1);
    await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
    await expect(room).toHaveAttribute(
      "data-room-ambient-phase",
      ambientPhaseBeforePanel!,
    );
    await expect(room).toHaveAttribute(
      "data-room-ambient-cycle",
      ambientCycleBeforePanel!,
    );
    expect(
      await presences.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
      ),
    ).toEqual(initialPresenceIds);
    await promptCenter.getByRole("button", { name: "Close panel" }).click();
    await page.clock.runFor(500);
    await expect(promptCenter).toHaveCount(0);
    await expect(shell).not.toHaveAttribute("data-right-panel-open", "true");
    await page.mouse.move(4, 4);
    await expect(room).toHaveAttribute("data-room-rotation-paused", "false");

    await page.clock.runFor(rotationDelayMs + 2 * 520 + 200);
    await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
    expect(
      await presences.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
      ),
    ).not.toEqual(initialPresenceIds);
    expect(
      await anchors.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
      ),
    ).toEqual(stableAnchorIds);
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.prismTheme))
      .toBe("dark");
  });

  test("Listen up reuses an exact Coffee Group, preserves its topic across reload, and returns to a fresh room @group-room-coffee", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const sourceGroupId = "group:listen-up-room";
    const sourceGroupName = "Listen Up Room";
    const coffeeGroupId = "e2e-listen-up-coffee-group";
    const coffeeGroupName = "Staged Exact Table";
    const coffeeSessionId = "e2e-listen-up-session";
    const topic = "Compare the ethics of memory and forgetting exactly.";
    const roomBots = waitingRoomTestBots.slice(0, 8);
    let selectedBotIds: string[] = [];
    let sessionCreated = false;
    let groupSessionBody: Record<string, unknown> | null = null;
    const directSessionPosts: Record<string, unknown>[] = [];
    const fulfillJson = (
      route: Route,
      payload: unknown,
      status = 200,
    ): Promise<void> =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });

    await installAuthenticatedApi(page, {
      bots: roomBots,
      botLibraryGroups: [
        {
          id: sourceGroupId,
          name: sourceGroupName,
          description: "A room that can stage its visible cast for Coffee.",
          botIds: roomBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const coffeeGroup = () => ({
      id: coffeeGroupId,
      name: coffeeGroupName,
      botGroupIds: selectedBotIds,
      coffeeSeatBotIds: Array.from(
        { length: 5 },
        (_, index) => selectedBotIds[index] ?? null,
      ),
      coffeeSettings: {},
      presetMode: "manual" as const,
      starterTopicsByBotId: {},
      createdAt: now,
      updatedAt: now,
    });
    const coffeeConversation = (finished: boolean) => ({
      id: coffeeSessionId,
      title: topic,
      mode: "coffee",
      conversationMode: "coffee",
      coffeeGroupId,
      botId: null,
      botGroupIds: selectedBotIds,
      coffeeSeatBotIds: coffeeGroup().coffeeSeatBotIds,
      coffeeSettings: {},
      coffeeSessionDurationMinutes: 10,
      coffeeTopic: topic,
      incognito: false,
      messages: finished
        ? [
            {
              id: "e2e-listen-up-user-line",
              role: "user",
              content: topic,
              createdAt: now,
            },
          ]
        : [],
      createdAt: now,
      updatedAt: now,
    });

    await page.route("**/api/coffee/groups", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, {
        ok: true,
        groups: selectedBotIds.length > 0 ? [coffeeGroup()] : [],
      });
    });
    await page.route(
      `**/api/coffee/groups/${coffeeGroupId}/sessions`,
      async (route) => {
        if (route.request().method() !== "POST") return route.fallback();
        groupSessionBody = route.request().postDataJSON() as Record<
          string,
          unknown
        >;
        sessionCreated = true;
        await fulfillJson(
          route,
          {
            ok: true,
            arrivalScenario: "user-first",
            coffeeStarterTopics: [],
            conversation: coffeeConversation(false),
          },
          201,
        );
      },
    );
    await page.route("**/api/coffee/sessions", async (route) => {
      if (route.request().method() === "POST") {
        directSessionPosts.push(
          route.request().postDataJSON() as Record<string, unknown>,
        );
      }
      await route.fallback();
    });
    await page.route(
      `**/api/coffee/sessions/${coffeeSessionId}/powers/resolve`,
      async (route) => {
        await fulfillJson(route, {
          ok: true,
          plan: {
            version: 1,
            resolvedAt: now,
            bots: {},
            warnings: [],
          },
          warnings: [],
        });
      },
    );
    await page.route("**/api/conversations", async (route) => {
      if (route.request().method() !== "GET") return route.fallback();
      await fulfillJson(route, {
        conversations: sessionCreated
          ? [
              {
                ...coffeeConversation(true),
                messages: undefined,
                hasAssistantReply: true,
              },
            ]
          : [],
      });
    });
    await page.route(
      `**/api/conversations/${coffeeSessionId}`,
      async (route) => {
        if (route.request().method() !== "GET") return route.fallback();
        await fulfillJson(route, { conversation: coffeeConversation(true) });
      },
    );

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?view=chat");
    await selectBotGroupFilter(page, sourceGroupName);
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const initialVisitId = await room.getAttribute("data-room-visit-id");
    const composer = page.getByRole("textbox").last();
    await composer.fill(topic);
    await composer.press("Enter");

    const staging = room.locator('[data-room-coffee-staging="true"]');
    await expect(staging).toBeVisible();
    await expect(staging).toHaveAttribute("data-staged-bot-count", "5");
    await expect(
      staging.locator('[data-room-coffee-staging-primary-focus="true"]'),
    ).toBeFocused();
    const selectedBotLabels = await staging
      .locator('[data-selected="true"]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) =>
            node
              .querySelector<HTMLButtonElement>('button[aria-label^="Remove "]')
              ?.getAttribute("aria-label"),
          )
          .filter(Boolean),
      );
    selectedBotIds = selectedBotLabels
      .map((label) => {
        const name = label
          ?.replace(/^Remove /u, "")
          .replace(/ from the Coffee table$/u, "");
        return roomBots.find((bot) => bot.name === name)?.id ?? "";
      })
      .filter(Boolean);
    expect(selectedBotIds).toHaveLength(5);
    await page.screenshot({
      path: ".codex/output/waiting-room-coffee-staging-dark-1280x720.png",
    });
    await staging.getByRole("button", { name: "Start Coffee with 5" }).click();

    await expect(page).toHaveURL(/view=coffee/u);
    await expect.poll(() => groupSessionBody).not.toBeNull();
    expect(groupSessionBody?.initialTopic).toBe(topic);
    expect(groupSessionBody?.excludedBotIds).toBeUndefined();
    expect(groupSessionBody?.presetId).toBeUndefined();
    expect(groupSessionBody?.forceAttendance).toBe(true);
    expect(directSessionPosts).toEqual([]);
    await expect(page.locator('[data-phase="arriving"]')).toBeVisible();
    const checkpointKey = `prism_bot_group_coffee_return_checkpoint_v1:${encodeURIComponent(coffeeSessionId)}`;
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          checkpointKey,
        ),
      )
      .not.toBeNull();

    await page.reload();
    const groupButton = page.getByRole("button", {
      name: `Select and expand Coffee Group ${coffeeGroupName}`,
    });
    await expect(groupButton).toBeVisible();
    await groupButton.click();
    await page.getByRole("button", { name: topic, exact: true }).click();
    await expect(
      page.getByText("Session ended.", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          checkpointKey,
        ),
      )
      .not.toBeNull();
    const reopenedCoffeeTable = page.getByRole("region", {
      name: "Coffee table",
    });
    await expect(reopenedCoffeeTable).toHaveAttribute(
      "data-room-return-session-id",
      coffeeSessionId,
    );
    await expect(reopenedCoffeeTable).toHaveAttribute(
      "data-room-return-checkpoint-status",
      "ready",
    );
    await expect(reopenedCoffeeTable).toHaveAttribute(
      "data-room-return-source-group",
      sourceGroupId,
    );
    const returnButton = page.getByRole("button", {
      name: "Return to group room",
    });
    await expect(returnButton).toBeVisible();
    await returnButton.click();

    await expect(page).toHaveURL(/view=chat/u);
    await expect(
      page.getByRole("button", {
        name: `Bot group filter: ${sourceGroupName}`,
      }),
    ).toBeVisible();
    const returnedRoom = page.locator('[data-bot-group-waiting-room="true"]');
    await expect(returnedRoom).toBeVisible();
    await expect(returnedRoom).not.toHaveAttribute(
      "data-room-visit-id",
      initialVisitId ?? "",
    );
    await expect(
      returnedRoom.locator('[data-room-coffee-staging="true"]'),
    ).toHaveCount(0);
    await expect(
      returnedRoom
        .locator('[data-room-presence-state="stable"] button')
        .first(),
    ).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(
          (key) => window.sessionStorage.getItem(key),
          checkpointKey,
        ),
      )
      .toBeNull();
  });

  test("waiting-room Home resolution opens only the requested continuation and leaves a missing Home pending @group-room", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "History Safe Room";
    const roomBots = waitingRoomTestBots.slice(0, 6);
    const targetBotId = roomBots[0]!.id;
    const pendingBotId = roomBots[1]!.id;
    const otherBotId = roomBots[2]!.id;
    const targetOldId = "e2e-target-home-old";
    const targetCurrentId = "e2e-target-home-current";
    const prismPoisonId = "e2e-prism-home-poison";
    const otherPoisonId = "e2e-other-home-poison";

    const relationshipHistory = ({
      id,
      ownerBotId,
      continuationConversationId = id,
      updatedAt,
    }: {
      id: string;
      ownerBotId: string | null;
      continuationConversationId?: string;
      updatedAt: string;
    }) => ({
      contextKey: ownerBotId ? `bot:${ownerBotId}` : "prism",
      contextKind: ownerBotId ? "persona_home" : "prism_home",
      conversationId: id,
      rootConversationId: id,
      episodeId: id,
      ownerBotId,
      origin: { kind: "relationship", id: ownerBotId },
      participantBotIds: ownerBotId ? [ownerBotId] : [pendingBotId],
      createdAt: now,
      updatedAt,
      archived: false,
      continuationConversationId,
      nativeRoute: {
        view: "chat",
        conversationId: continuationConversationId,
        botId: ownerBotId,
      },
    });
    const targetOld = {
      ...testConversation,
      id: targetOldId,
      title: "Older target Home",
      botId: targetBotId,
      updatedAt: "2026-07-14T12:01:00.000Z",
      history: relationshipHistory({
        id: targetOldId,
        ownerBotId: targetBotId,
        continuationConversationId: targetCurrentId,
        updatedAt: "2026-07-14T12:01:00.000Z",
      }),
    };
    const targetCurrent = {
      ...testConversation,
      id: targetCurrentId,
      title: "Current target Home",
      botId: targetBotId,
      updatedAt: "2026-07-14T12:02:00.000Z",
      messages: [
        {
          id: "target-current-assistant",
          role: "assistant" as const,
          content: "Correct target continuation",
          createdAt: "2026-07-14T12:02:00.000Z",
        },
      ],
      hasAssistantReply: true,
      history: relationshipHistory({
        id: targetCurrentId,
        ownerBotId: targetBotId,
        updatedAt: "2026-07-14T12:02:00.000Z",
      }),
    };
    const prismPoison = {
      ...testConversation,
      id: prismPoisonId,
      title: "Prism poison",
      botId: null,
      lastBotId: pendingBotId,
      updatedAt: "2026-07-14T12:09:00.000Z",
      messages: [
        {
          id: "prism-poison-assistant",
          role: "assistant" as const,
          content: "POISON PRISM",
          createdAt: "2026-07-14T12:09:00.000Z",
        },
      ],
      hasAssistantReply: true,
      history: relationshipHistory({
        id: prismPoisonId,
        ownerBotId: null,
        updatedAt: "2026-07-14T12:09:00.000Z",
      }),
    };
    const otherPoison = {
      ...testConversation,
      id: otherPoisonId,
      title: "Other persona poison",
      botId: otherBotId,
      lastBotId: pendingBotId,
      updatedAt: "2026-07-14T12:10:00.000Z",
      messages: [
        {
          id: "other-poison-assistant",
          role: "assistant" as const,
          content: "POISON OTHER",
          createdAt: "2026-07-14T12:10:00.000Z",
        },
      ],
      hasAssistantReply: true,
      history: relationshipHistory({
        id: otherPoisonId,
        ownerBotId: otherBotId,
        updatedAt: "2026-07-14T12:10:00.000Z",
      }),
    };
    const conversations = [targetOld, targetCurrent, prismPoison, otherPoison];

    await installAuthenticatedApi(page, {
      theme: "light",
      bots: roomBots,
      botLibraryGroups: [
        {
          id: "group:history-safe-room",
          name: groupName,
          description: "A room with adversarial History routing fixtures.",
          botIds: roomBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    const fulfillJson = (route: Route, payload: unknown) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    const detailReads: string[] = [];
    const zenOpenBodies: Array<{ botId?: string | null }> = [];
    await page.route("**/api/conversations", (route) =>
      fulfillJson(route, { conversations }),
    );
    await page.route("**/api/conversations/zen/open", (route) => {
      zenOpenBodies.push(
        (route.request().postDataJSON() ?? {}) as {
          botId?: string | null;
        },
      );
      return fulfillJson(route, { conversationId: targetCurrentId });
    });
    for (const conversation of conversations) {
      await page.route(`**/api/conversations/${conversation.id}`, (route) => {
        detailReads.push(conversation.id);
        return fulfillJson(route, { conversation });
      });
      await page.route(
        `**/api/conversations/${conversation.id}/summary`,
        (route) => fulfillJson(route, { summary: null }),
      );
      await page.route(
        `**/api/conversations/${conversation.id}/summarization-debug`,
        (route) =>
          fulfillJson(route, {
            debug: {
              conversationId: conversation.id,
              mode: "zen",
              inProgress: false,
              latestSummary: null,
              latestDisplaySummary: null,
              latestSummaryAt: null,
              messagesSinceLastCompaction: 0,
              summaryCount: 0,
            },
          }),
      );
    }
    for (const botId of [targetBotId, pendingBotId]) {
      await page.route(`**/api/bots/${botId}/memory-panel*`, (route) =>
        fulfillJson(route, {
          botId,
          memories: [],
          aboutYouMemories: [],
          botOpinion: null,
          sessionOpinion: null,
          botStatusSummary: null,
          counts: {
            total: 0,
            visible: 0,
            protectedAboutYou: 0,
            bySource: { direct: 0, inferred: 0, compiled: 0, about_you: 0 },
            byTier: { short_term: 0, long_term: 0 },
            byCategory: { general: 0, user: 0, bot_relation: 0 },
          },
        }),
      );
    }

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?view=chat");
    await selectBotGroupFilter(page, groupName);
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const shell = page.locator('main[data-zen-surface="true"]');
    const composer = page.getByRole("textbox").last();
    await expect(page.locator("body")).toHaveAttribute(
      "data-prism-theme",
      "light",
    );
    await expect(room).toBeVisible();
    detailReads.length = 0;
    zenOpenBodies.length = 0;

    await activateNavigationControl(
      room.getByRole("button", {
        name: `Visit ${roomBots[0]!.name}'s Zen Home`,
      }),
    );
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );
    await expect(page.getByText("Correct target continuation")).toBeVisible();
    expect([...new Set(detailReads)]).toEqual([targetCurrentId]);
    expect(zenOpenBodies).toEqual([]);
    await expect(page.getByText("POISON PRISM")).toHaveCount(0);
    await expect(page.getByText("POISON OTHER")).toHaveCount(0);
    await composer.fill("Draft for the persisted target Home");

    await page.keyboard.press("Escape");
    await expect(room).toBeVisible();
    detailReads.length = 0;
    zenOpenBodies.length = 0;
    await activateNavigationControl(
      room.getByRole("button", {
        name: `Visit ${roomBots[1]!.name}'s Zen Home`,
      }),
    );
    await expect(shell).toHaveAttribute(
      "data-relationship-depth-transition",
      "settled",
    );
    await expect(
      page.locator(
        `[data-relationship-depth-anchor="home"][data-relationship-depth-identity="bot:${pendingBotId}"]`,
      ),
    ).toBeVisible();
    await expect(composer).toHaveText("");
    await composer.fill("Draft for the pending Home");
    expect(detailReads).toEqual([]);
    expect(zenOpenBodies).toEqual([]);
    await expect(page.getByText("Correct target continuation")).toHaveCount(0);
    await expect(page.getByText("POISON PRISM")).toHaveCount(0);
    await expect(page.getByText("POISON OTHER")).toHaveCount(0);

    await page.keyboard.press("Escape");
    await expect(room).toBeVisible();
    await activateNavigationControl(
      room.getByRole("button", {
        name: `Visit ${roomBots[0]!.name}'s Zen Home`,
      }),
    );
    await expect(composer).toHaveText("Draft for the persisted target Home");
    await page.keyboard.press("Escape");
    await expect(room).toBeVisible();
    await activateNavigationControl(
      room.getByRole("button", {
        name: `Visit ${roomBots[1]!.name}'s Zen Home`,
      }),
    );
    await expect(composer).toHaveText("Draft for the pending Home");
    expect(zenOpenBodies).toEqual([]);
  });

  test("waiting-room Back aborts a pending Home reply before restoring the exact room @group-room", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Interruptible Room";
    const roomBots = waitingRoomTestBots.slice(0, 6);
    await installAuthenticatedApi(page, {
      bots: roomBots,
      botLibraryGroups: [
        {
          id: "group:interruptible-room",
          name: groupName,
          description: "A deterministic pending-reply return fixture.",
          botIds: roomBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });

    let markReplyStarted!: () => void;
    const replyStarted = new Promise<void>((resolve) => {
      markReplyStarted = resolve;
    });
    let releaseLateReply!: () => void;
    const lateReplyReleased = new Promise<void>((resolve) => {
      releaseLateReply = resolve;
    });
    let markRouteCompleted!: () => void;
    const routeCompleted = new Promise<void>((resolve) => {
      markRouteCompleted = resolve;
    });
    const chatRequests: string[] = [];
    const interruptWrites: string[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (pathname === "/api/chat" && request.method() === "POST") {
        chatRequests.push(request.url());
      }
      if (/^\/api\/messages\/[^/]+\/interrupt$/.test(pathname)) {
        interruptWrites.push(request.url());
      }
    });
    await page.route("**/api/chat", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      const requestBody = route.request().postDataJSON() as {
        botId?: string | null;
        message?: string;
      };
      markReplyStarted();
      await lateReplyReleased;
      const ownerBotId = requestBody.botId ?? roomBots[0]!.id;
      const lateConversation = {
        ...testConversation,
        id: "e2e-late-canceled-home",
        title: "Late canceled Home",
        botId: ownerBotId,
        updatedAt: "2026-07-14T12:01:00.000Z",
        messages: [
          {
            id: "late-canceled-user",
            role: "user" as const,
            content: requestBody.message ?? "Canceled Home prompt",
            createdAt: "2026-07-14T12:01:00.000Z",
          },
          {
            id: "late-canceled-assistant",
            role: "assistant" as const,
            content: "This late reply must never reopen the Home.",
            createdAt: "2026-07-14T12:01:01.000Z",
          },
        ],
        hasAssistantReply: true,
      };
      try {
        await route
          .fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ conversation: lateConversation }),
          })
          .catch(() => undefined);
      } finally {
        markRouteCompleted();
      }
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?view=chat");
    await selectBotGroupFilter(page, groupName);
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    await expect(room).toBeVisible();
    const visitId = await room.getAttribute("data-room-visit-id");
    const rosterSignature = await room
      .locator("[data-room-presence-bot-id]")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          botId: node.getAttribute("data-room-presence-bot-id"),
          role: node.getAttribute("data-room-presence-role"),
          slot: node.getAttribute("data-room-presence-slot"),
        })),
      );
    const anchor = room.locator('[data-room-presence-role="anchor"]').first();
    const anchorBotId = await anchor.getAttribute("data-room-presence-bot-id");
    expect(anchorBotId).not.toBeNull();
    const anchorButton = anchor.getByRole("button");
    const composer = page.getByRole("textbox").last();
    await composer.fill("Room draft survives the canceled reply");
    await activateNavigationControl(anchorButton);
    await expect(room).toHaveCount(0);
    await composer.fill("Canceled Home prompt");
    await composer.press("Enter");
    await replyStarted;

    const failedChatRequest = page.waitForEvent("requestfailed", {
      predicate: (request) =>
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/chat",
    });
    const backButton = page.locator('[data-home-affordance="wordmark"]');
    await expect(backButton).toBeEnabled();
    await expect(backButton).toHaveAttribute(
      "aria-label",
      `Back to ${groupName}`,
    );
    await activateNavigationControl(backButton);
    const failedRequest = await failedChatRequest;
    expect(failedRequest.failure()?.errorText).toContain("net::ERR_ABORTED");

    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-visit-id", visitId!);
    await expect(composer).toHaveText("Room draft survives the canceled reply");
    expect(
      await room.locator("[data-room-presence-bot-id]").evaluateAll((nodes) =>
        nodes.map((node) => ({
          botId: node.getAttribute("data-room-presence-bot-id"),
          role: node.getAttribute("data-room-presence-role"),
          slot: node.getAttribute("data-room-presence-slot"),
        })),
      ),
    ).toEqual(rosterSignature);
    const restoredAnchorButton = room
      .locator(`[data-room-presence-bot-id="${anchorBotId}"]`)
      .getByRole("button");
    await expect(restoredAnchorButton).toBeFocused();
    expect(interruptWrites).toEqual([]);

    releaseLateReply();
    await routeCompleted;
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await expect(room).toBeVisible();
    await expect(
      page.locator('[data-relationship-depth-anchor="home"]'),
    ).toHaveCount(0);
    expect(chatRequests).toHaveLength(1);
    expect(interruptWrites).toEqual([]);

    await activateNavigationControl(restoredAnchorButton);
    await expect(room).toHaveCount(0);
    await expect(composer).toHaveText("Canceled Home prompt");
  });

  test("waiting-room ambient theater stays silent, static for assistive tech, and bounded @group-room", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Silent Ambient Council";
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installAuthenticatedApi(page, {
      bots: waitingRoomTestBots,
      botLibraryGroups: [
        {
          id: "group:silent-ambient",
          name: groupName,
          description: "A room that moves without speaking or writing history.",
          botIds: waitingRoomTestBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/?view=chat");
    await page.clock.install({ time: new Date(now) });
    await page.clock.pauseAt(
      new Date(await page.evaluate(() => Date.now() + 60_000)),
    );
    const groupTrigger = page.getByRole("button", {
      name: "Bot group filter: All bots",
    });
    await groupTrigger.click();
    await page.getByRole("option", { name: groupName }).click();

    const room = page.locator('[data-bot-group-waiting-room="true"]');
    const anchors = room.locator('[data-room-presence-role="anchor"]');
    const roamers = room.locator('[data-room-presence-role="roamer"]');
    await expect(room).toBeVisible();
    await page.mouse.move(4, 4);
    await expect(anchors).toHaveCount(5);
    await expect(roamers).toHaveCount(3);
    await expect(room).toHaveAttribute("data-room-ambient-phase", "idle");
    await expect(room).toHaveAttribute("data-room-ambient-paused", "false");

    await expect(
      anchors.first().locator('[data-crt-material-layer="noise"]'),
    ).toHaveCount(1);
    await expect(
      roamers.first().locator('[data-crt-material-layer="noise"]'),
    ).toHaveCount(0);
    await expect(
      roamers.first().locator('[data-crt-material-layer="breathing"]'),
    ).toHaveCount(0);
    await expect(
      roamers.first().locator('[data-render-detail="reduced"]'),
    ).toHaveCount(1);
    expect(
      await roamers.first().evaluate((presence) => {
        const face = presence.querySelector<HTMLElement>(
          '[data-zen-live-bot-body-frame="true"]',
        );
        const glass = presence.querySelector<HTMLElement>(
          '[data-screen-material-layer="glass"]',
        );
        return {
          glow: face
            ? getComputedStyle(face)
                .getPropertyValue("--bot-face-ambient-glow-opacity")
                .trim()
            : "",
          glassDisplay: glass ? getComputedStyle(glass).display : "missing",
        };
      }),
    ).toEqual({ glow: "0.14", glassDisplay: "none" });
    const idleAnimationCount = await room.evaluate(
      (element) => element.getAnimations({ subtree: true }).length,
    );

    await page.evaluate(() => {
      const probe = {
        mediaPlayCount: 0,
        audioContextCount: 0,
        webSocketUrls: [] as string[],
        eventSourceUrls: [] as string[],
        sendBeaconUrls: [] as string[],
      };
      const originalPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        probe.mediaPlayCount += 1;
        return originalPlay.call(this);
      };
      const mutableWindow = window as typeof window & {
        __waitingRoomAmbientAudioProbe?: typeof probe;
        webkitAudioContext?: typeof AudioContext;
      };
      const wrapAudioContext = (
        NativeAudioContext: typeof AudioContext | undefined,
      ): typeof AudioContext | undefined =>
        NativeAudioContext
          ? new Proxy(NativeAudioContext, {
              construct(target, argumentsList, newTarget) {
                probe.audioContextCount += 1;
                return Reflect.construct(target, argumentsList, newTarget);
              },
            })
          : undefined;
      mutableWindow.AudioContext = wrapAudioContext(
        mutableWindow.AudioContext,
      )!;
      if (mutableWindow.webkitAudioContext) {
        mutableWindow.webkitAudioContext = wrapAudioContext(
          mutableWindow.webkitAudioContext,
        );
      }
      const NativeWebSocket = mutableWindow.WebSocket;
      mutableWindow.WebSocket = new Proxy(NativeWebSocket, {
        construct(target, argumentsList, newTarget) {
          probe.webSocketUrls.push(String(argumentsList[0] ?? ""));
          return Reflect.construct(target, argumentsList, newTarget);
        },
      });
      const NativeEventSource = mutableWindow.EventSource;
      mutableWindow.EventSource = new Proxy(NativeEventSource, {
        construct(target, argumentsList, newTarget) {
          probe.eventSourceUrls.push(String(argumentsList[0] ?? ""));
          return Reflect.construct(target, argumentsList, newTarget);
        },
      });
      const originalSendBeacon = navigator.sendBeacon?.bind(navigator);
      if (originalSendBeacon) {
        Object.defineProperty(navigator, "sendBeacon", {
          configurable: true,
          value: (url: string | URL, data?: BodyInit | null): boolean => {
            probe.sendBeaconUrls.push(String(url));
            return originalSendBeacon(url, data);
          },
        });
      }
      mutableWindow.__waitingRoomAmbientAudioProbe = probe;
    });
    const storageBefore = await page.evaluate(() => ({
      local: Array.from({ length: localStorage.length }, (_, index) => {
        const key = localStorage.key(index)!;
        return [key, localStorage.getItem(key)] as const;
      }).sort(([left], [right]) => left.localeCompare(right)),
      session: Array.from({ length: sessionStorage.length }, (_, index) => {
        const key = sessionStorage.key(index)!;
        return [key, sessionStorage.getItem(key)] as const;
      }).sort(([left], [right]) => left.localeCompare(right)),
    }));
    const ambientNetworkRequests: string[] = [];
    const ambientWebSockets: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        !["image", "font", "stylesheet", "script"].includes(
          request.resourceType(),
        )
      ) {
        ambientNetworkRequests.push(
          `${request.resourceType()} ${request.method()} ${url.href}`,
        );
      }
    });
    page.on("websocket", (socket) => ambientWebSockets.push(socket.url()));

    const staticAriaSnapshot = await room.ariaSnapshot();
    const idleDurationMs = Number(
      await room.getAttribute("data-room-ambient-next-ms"),
    );
    expect(idleDurationMs).toBeGreaterThanOrEqual(24_000);
    expect(idleDurationMs).toBeLessThanOrEqual(54_000);
    await page.clock.runFor(idleDurationMs + 1);
    await expect(room).toHaveAttribute("data-room-ambient-phase", "glance");
    await expect(room.locator("[data-room-ambient-role]")).toHaveCount(2);
    await expect(
      room.locator('[data-room-ambient-role="speaker"]'),
    ).toHaveCount(1);
    await expect(
      room.locator('[data-room-ambient-role="listener"]'),
    ).toHaveCount(1);
    expect(await room.ariaSnapshot()).toBe(staticAriaSnapshot);

    await page.clock.runFor(1_201);
    await expect(room).toHaveAttribute("data-room-ambient-phase", "speaking");
    const cue = room.locator('[data-room-ambient-cue="true"]');
    await expect(cue).toHaveCount(1);
    await expect(cue).toHaveAttribute("aria-hidden", "true");
    await page.clock.runFor(200);
    await expect(cue).toBeVisible();
    const speakingDurationMs = Number(
      await room.getAttribute("data-room-ambient-next-ms"),
    );
    expect(speakingDurationMs).toBeGreaterThanOrEqual(2_600);
    expect(speakingDurationMs).toBeLessThanOrEqual(4_800);
    const cueGeometry = await cue.evaluate((element) => {
      const cueRect = element.getBoundingClientRect();
      const roomRect = element
        .closest('[data-bot-group-waiting-room="true"]')!
        .getBoundingClientRect();
      return {
        cueLeft: cueRect.left,
        cueTop: cueRect.top,
        cueRight: cueRect.right,
        cueBottom: cueRect.bottom,
        roomLeft: roomRect.left,
        roomTop: roomRect.top,
        roomRight: roomRect.right,
        roomBottom: roomRect.bottom,
        opacity: getComputedStyle(element).opacity,
      };
    });
    expect(Number(cueGeometry.opacity)).toBeGreaterThan(0.75);
    expect(cueGeometry.cueLeft).toBeGreaterThanOrEqual(cueGeometry.roomLeft);
    expect(cueGeometry.cueTop).toBeGreaterThanOrEqual(cueGeometry.roomTop);
    expect(cueGeometry.cueRight).toBeLessThanOrEqual(cueGeometry.roomRight);
    expect(cueGeometry.cueBottom).toBeLessThanOrEqual(cueGeometry.roomBottom);
    expect(
      await room.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBeLessThanOrEqual(idleAnimationCount + 8);
    expect(await room.ariaSnapshot()).toBe(staticAriaSnapshot);
    const activePhase = await room.getAttribute("data-room-ambient-phase");
    const activeCycle = await room.getAttribute("data-room-ambient-cycle");
    const composer = page.getByRole("textbox").last();
    await composer.focus();
    await expect(room).toHaveAttribute("data-room-ambient-paused", "true");
    await expect(room.locator("[data-room-ambient-role]")).toHaveCount(0);
    await expect(cue).toHaveCount(0);
    await page.clock.runFor(10_000);
    await expect(room).toHaveAttribute("data-room-ambient-phase", activePhase!);
    await expect(room).toHaveAttribute("data-room-ambient-cycle", activeCycle!);
    await composer.blur();
    await page.mouse.move(4, 4);
    await expect(room).toHaveAttribute("data-room-ambient-paused", "false");
    await expect(room.locator("[data-room-ambient-role]")).toHaveCount(2);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.runFor(1);
    await expect(room).toHaveAttribute("data-room-ambient-paused", "true");
    await expect(room.locator("[data-room-ambient-role]")).toHaveCount(0);
    await expect(cue).toHaveCount(0);
    const reducedPhase = await room.getAttribute("data-room-ambient-phase");
    const reducedCycle = await room.getAttribute("data-room-ambient-cycle");
    await page.clock.runFor(10_000);
    await expect(room).toHaveAttribute(
      "data-room-ambient-phase",
      reducedPhase!,
    );
    await expect(room).toHaveAttribute(
      "data-room-ambient-cycle",
      reducedCycle!,
    );
    expect(
      await room.evaluate(
        (element) => element.getAnimations({ subtree: true }).length,
      ),
    ).toBeLessThanOrEqual(idleAnimationCount);
    expect(await room.ariaSnapshot()).toBe(staticAriaSnapshot);
    await expect(page.locator("[data-message-id]")).toHaveCount(0);

    expect(
      await page.evaluate(() => {
        const probe = (
          window as typeof window & {
            __waitingRoomAmbientAudioProbe?: {
              mediaPlayCount: number;
              audioContextCount: number;
              webSocketUrls: string[];
              eventSourceUrls: string[];
              sendBeaconUrls: string[];
            };
          }
        ).__waitingRoomAmbientAudioProbe;
        return (
          probe ?? {
            mediaPlayCount: -1,
            audioContextCount: -1,
            webSocketUrls: ["probe missing"],
            eventSourceUrls: ["probe missing"],
            sendBeaconUrls: ["probe missing"],
          }
        );
      }),
    ).toEqual({
      mediaPlayCount: 0,
      audioContextCount: 0,
      webSocketUrls: [],
      eventSourceUrls: [],
      sendBeaconUrls: [],
    });
    expect(
      await page.evaluate(() => ({
        local: Array.from({ length: localStorage.length }, (_, index) => {
          const key = localStorage.key(index)!;
          return [key, localStorage.getItem(key)] as const;
        }).sort(([left], [right]) => left.localeCompare(right)),
        session: Array.from({ length: sessionStorage.length }, (_, index) => {
          const key = sessionStorage.key(index)!;
          return [key, sessionStorage.getItem(key)] as const;
        }).sort(([left], [right]) => left.localeCompare(right)),
      })),
    ).toEqual(storageBefore);
    expect(ambientNetworkRequests).toEqual([]);
    expect(ambientWebSockets).toEqual([]);
  });

  test("waiting-room visit survives pauses and cleans up on exit @group-room", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const groupName = "Ambient Rotation Circle";
    await installAuthenticatedApi(page, {
      bots: waitingRoomTestBots,
      botLibraryGroups: [
        {
          id: "group:ambient-rotation",
          name: groupName,
          description: "A deterministic ambient roster test.",
          botIds: waitingRoomTestBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?view=chat");
    await page.clock.install({ time: new Date("2026-07-14T12:00:00.000Z") });
    const selectGroup = async (name: string): Promise<void> => {
      await activateNavigationControl(
        page.getByRole("button", { name: /Bot group filter:/ }).first(),
      );
      await activateNavigationControl(page.getByRole("option", { name }));
    };
    await selectGroup(groupName);
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    await expect(room).toBeVisible();
    const visibleBotIds = async (): Promise<Array<string | null>> =>
      room
        .locator("[data-room-presence-bot-id]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
        );
    const reducedMotionRoster = await visibleBotIds();
    const reducedMotionVisitId = await room.getAttribute("data-room-visit-id");
    await page.clock.fastForward(20 * 60 * 1_000);
    expect(await visibleBotIds()).toEqual(reducedMotionRoster);

    await activateNavigationControl(
      page.locator('button[aria-controls="prism-app-switcher-menu"]'),
    );
    await activateNavigationControl(
      page.getByRole("menuitem", { name: /Coffee/ }),
    );
    await expect(page.locator('[data-mode="picker"]')).toBeVisible();
    await page.clock.fastForward(10 * 60 * 1_000);
    await activateNavigationControl(
      page.locator('button[aria-controls="prism-app-switcher-menu"]'),
    );
    await activateNavigationControl(
      page.getByRole("menuitem", { name: /Chat/ }),
    );
    await page.clock.runFor(1_000);
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute(
      "data-room-visit-id",
      reducedMotionVisitId!,
    );
    expect(await visibleBotIds()).toEqual(reducedMotionRoster);

    await selectGroup("All bots");
    await expect(room).toHaveCount(0);
    await page.clock.fastForward(10 * 60 * 1_000);
    await selectGroup(groupName);
    await expect(room).toBeVisible();
    await expect(room).not.toHaveAttribute(
      "data-room-visit-id",
      reducedMotionVisitId!,
    );

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.mouse.move(4, 4);
    await room.hover();
    await expect(room).toHaveAttribute("data-room-rotation-paused", "true");
    const search = page.getByRole("searchbox", {
      name: "Search bots by name",
    });
    await search.fill("Waiting Bot 1");
    await expect(room).toHaveCount(0);
    await page.mouse.move(4, 4);
    await search.fill("");
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-rotation-paused", "false");
    await selectGroup("All bots");
    await expect(room).toHaveCount(0);
    await page.clock.fastForward(10 * 60 * 1_000);
  });

  test("waiting-room rotation cancels stale handoffs across groups @group-room", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const now = "2026-07-14T12:00:00.000Z";
    const firstGroupName = "First Rotation Circle";
    const secondGroupName = "Second Rotation Circle";
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await installAuthenticatedApi(page, {
      bots: waitingRoomTestBots,
      botLibraryGroups: [
        {
          id: "group:first-rotation",
          name: firstGroupName,
          description: "A deterministic ambient roster test.",
          botIds: waitingRoomTestBots.map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "group:second-rotation",
          name: secondGroupName,
          description: "A disjoint roster used to catch stale handoff commits.",
          botIds: waitingRoomTestBots.slice(6).map((bot) => bot.id),
          deleteProtected: false,
          builtIn: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
    });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/?view=chat");
    await page.clock.install({ time: new Date("2026-07-14T12:00:00.000Z") });
    await page.clock.pauseAt(
      new Date(await page.evaluate(() => Date.now() + 60_000)),
    );
    const selectGroup = async (name: string): Promise<void> => {
      await activateNavigationControl(
        page.getByRole("button", { name: /Bot group filter:/ }).first(),
      );
      await activateNavigationControl(page.getByRole("option", { name }));
    };
    await selectGroup(firstGroupName);
    const room = page.locator('[data-bot-group-waiting-room="true"]');
    await expect(room).toBeVisible();
    await expect(room).toHaveAttribute("data-room-rotation-paused", "false");
    const visibleBotIds = async (): Promise<Array<string | null>> =>
      room
        .locator("[data-room-presence-bot-id]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-room-presence-bot-id")),
        );
    const advanceToHandoff = async (): Promise<void> => {
      const rotationDelayMs = Number(
        await room.getAttribute("data-room-next-rotation-ms"),
      );
      expect(rotationDelayMs).toBeGreaterThanOrEqual(2 * 60 * 1_000);
      expect(rotationDelayMs).toBeLessThanOrEqual(4 * 60 * 1_000);
      await page.clock.runFor(100);
      await page.clock.runFor(rotationDelayMs + 50);
      await expect(room).toHaveAttribute(
        "data-room-handoff-order",
        "arrival-before-departure",
      );
    };

    const initialRoster = await visibleBotIds();
    await advanceToHandoff();
    await page.clock.runFor(2 * 520 + 100);
    expect(await visibleBotIds()).not.toEqual(initialRoster);

    await advanceToHandoff();
    const firstGroupVisitId = await room.getAttribute("data-room-visit-id");
    await selectGroup(secondGroupName);
    await expect(room).toBeVisible();
    await expect(room).not.toHaveAttribute(
      "data-room-visit-id",
      firstGroupVisitId!,
    );
    const secondGroupBotIds = new Set(
      waitingRoomTestBots.slice(6).map((bot) => bot.id),
    );
    const assertOnlySecondGroupBots = async (): Promise<void> => {
      const ids = await visibleBotIds();
      expect(ids).toHaveLength(6);
      expect(ids.every((botId) => botId && secondGroupBotIds.has(botId))).toBe(
        true,
      );
    };
    await assertOnlySecondGroupBots();
    await expect(room).toHaveAttribute("data-room-ambient-phase", "idle");
    await expect(room).toHaveAttribute("data-room-ambient-cycle", "0");
    const secondGroupAmbientDelayMs = Number(
      await room.getAttribute("data-room-ambient-next-ms"),
    );
    await page.clock.runFor(secondGroupAmbientDelayMs + 1);
    await expect(room).toHaveAttribute("data-room-ambient-phase", "glance");
    expect(
      secondGroupBotIds.has(
        (await room.getAttribute("data-room-ambient-speaker")) ?? "",
      ),
    ).toBe(true);
    expect(
      secondGroupBotIds.has(
        (await room.getAttribute("data-room-ambient-listener")) ?? "",
      ),
    ).toBe(true);
    await page.clock.runFor(2 * 520 + 5_000);
    await assertOnlySecondGroupBots();
  });

  for (const theme of ["dark", "light"] as const) {
    test(`waiting room remains legible across desktop sizes in ${theme} theme @group-room`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const now = "2026-07-14T12:00:00.000Z";
      const groupName = "Responsive Waiting Circle";
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installAuthenticatedApi(page, {
        theme,
        bots: waitingRoomTestBots,
        images: testGroupImages(
          waitingRoomTestBots.slice(0, 6).map((bot) => bot.id),
          2,
        ),
        botLibraryGroups: [
          {
            id: "group:responsive-waiting-circle",
            name: groupName,
            description:
              "A larger ambient gathering that remains readable without beginning a conversation.",
            botIds: waitingRoomTestBots.map((bot) => bot.id),
            deleteProtected: false,
            builtIn: false,
            createdAt: now,
            updatedAt: now,
          },
        ],
      });

      for (const viewport of [
        { width: 1280, height: 720, presenceCount: 6 },
        { width: 1440, height: 900, presenceCount: 7 },
        { width: 1920, height: 1080, presenceCount: 8 },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto("/?view=chat");
        await activateNavigationControl(
          page.getByRole("button", { name: /Bot group filter:/ }).first(),
        );
        await activateNavigationControl(
          page.getByRole("option", { name: groupName }),
        );

        const room = page.locator('[data-bot-group-waiting-room="true"]');
        const composer = page.getByRole("textbox").last();
        await expect(room).toBeVisible();
        await expect(room).toHaveAttribute(
          "data-room-presence-count",
          String(viewport.presenceCount),
        );
        await expect(room.locator("[data-room-presence-bot-id]")).toHaveCount(
          viewport.presenceCount,
        );
        const imageBubbles = room.locator(
          '[data-group-image-bubbles="waiting"] [data-group-image-bubble-id]',
        );
        await expect(imageBubbles).toHaveCount(
          viewport.width >= 1440 && viewport.height >= 760 ? 4 : 2,
        );
        await expect(imageBubbles.first()).toBeVisible();
        const [
          roomBox,
          composerBox,
          documentGeometry,
          presenceGeometry,
          imageBubbleGeometry,
        ] = await Promise.all([
          room.boundingBox(),
          composer.boundingBox(),
          page.evaluate(() => ({
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          })),
          room.locator("[data-room-presence-bot-id]").evaluateAll((nodes) =>
            nodes.map((node) => {
              const rect = node.getBoundingClientRect();
              const button = node.querySelector("button");
              const label = node.querySelector("button > span:last-child");
              return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                buttonWidth: button?.getBoundingClientRect().width ?? 0,
                labelWidth: label?.getBoundingClientRect().width ?? 0,
              };
            }),
          ),
          imageBubbles.evaluateAll((nodes) =>
            nodes.map((node) => {
              const rect = node.getBoundingClientRect();
              return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                opacity: Number.parseFloat(getComputedStyle(node).opacity),
              };
            }),
          ),
        ]);
        expect(roomBox).not.toBeNull();
        expect(composerBox).not.toBeNull();
        if (!roomBox || !composerBox) continue;
        expect(roomBox.y + roomBox.height).toBeLessThanOrEqual(
          composerBox.y - 12,
        );
        expect(documentGeometry.documentWidth).toBeLessThanOrEqual(
          documentGeometry.viewportWidth,
        );
        for (const presence of presenceGeometry) {
          expect(presence.left).toBeGreaterThanOrEqual(roomBox.x - 1);
          expect(presence.top).toBeGreaterThanOrEqual(roomBox.y - 1);
          expect(presence.right).toBeLessThanOrEqual(
            roomBox.x + roomBox.width + 1,
          );
          expect(presence.bottom).toBeLessThanOrEqual(
            roomBox.y + roomBox.height + 1,
          );
          expect(presence.labelWidth).toBeLessThanOrEqual(
            presence.buttonWidth + 1,
          );
        }
        for (const bubble of imageBubbleGeometry) {
          expect(bubble.left).toBeGreaterThanOrEqual(roomBox.x);
          expect(bubble.top).toBeGreaterThanOrEqual(roomBox.y);
          expect(bubble.right).toBeLessThanOrEqual(roomBox.x + roomBox.width);
          expect(bubble.bottom).toBeLessThanOrEqual(roomBox.y + roomBox.height);
          expect(bubble.opacity).toBeGreaterThan(0.7);
        }

        if (process.env.PRISM_CAPTURE_GROUP_ROOM === "1") {
          await page.screenshot({
            path: `.codex/output/waiting-room-${theme}-${viewport.width}x${viewport.height}.png`,
            fullPage: false,
          });
        }
      }
    });
  }

  test("custom bot draft edits Avatar Details as a guarded local recipe", async ({
    page,
  }) => {
    test.slow();
    await installAuthenticatedApi(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await activateNavigationControl(
      page.getByRole("button", { name: "Open bot customizer" }),
    );
    await activateNavigationControl(
      page.getByRole("button", { name: /Create new bot/ }),
    );
    await page
      .getByRole("region", { name: "Bot identity" })
      .getByPlaceholder("Name this bot")
      .fill("Draft Detail Bot");
    await activateNavigationControl(
      page.getByRole("button", {
        name: "Open Avatar Studio to edit bot avatar",
      }),
    );

    const studio = page.getByRole("dialog", { name: "Draft Detail Bot" });
    await expect(studio).toBeVisible();
    await studio.getByRole("tab", { name: "Details" }).click({ force: true });

    const detailsEditor = studio.getByRole("region", {
      name: "Avatar details editor",
    });
    await expect(detailsEditor).toBeVisible();
    await expect(
      detailsEditor.locator('[data-avatar-details-face-guide="true"]'),
    ).toHaveAttribute("data-visible", "true");

    const paintCanvas = detailsEditor.getByRole("application", {
      name: /Avatar pixel canvas/,
    });
    await expect(paintCanvas).toBeVisible();
    await expect
      .poll(async () => (await paintCanvas.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(315);

    const editorCoreCanvas = detailsEditor.locator(
      '[data-avatar-details-editor-core="true"]',
    );
    await paintCanvas.click({ force: true });
    await expect
      .poll(() =>
        editorCoreCanvas.evaluate((element) => {
          const context = (element as HTMLCanvasElement).getContext("2d");
          if (!context) return 0;
          return context
            .getImageData(58, 58, 13, 13)
            .data.reduce(
              (alpha, channel, index) =>
                index % 4 === 3 ? alpha + channel : alpha,
              0,
            );
        }),
      )
      .toBeGreaterThan(0);

    await expect(
      studio.locator('[data-avatar-details-mask="true"]'),
    ).toBeVisible();
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
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");

    await activateNavigationControl(
      page.getByRole("button", { name: "Open bot customizer" }),
    );
    await activateNavigationControl(
      page.getByRole("button", { name: /Browse bots/ }),
    );
    await activateBotManagementControl(
      page.getByRole("button", {
        name: /Preview Test Bot 1; double-click to manage/,
      }),
    );

    await expect(
      page.locator(
        '[data-bot-showcase-context="true"] [data-avatar-details-mask="true"]',
      ),
    ).toBeVisible();
    await activateNavigationControl(
      page.getByRole("button", { name: /^Avatar Studio/ }),
    );

    const studio = page.getByRole("dialog", { name: "Test Bot 1" });
    await expect(studio).toBeVisible();
    await expect(
      studio.locator('[data-avatar-details-mask="true"]'),
    ).toBeVisible();
    await studio.getByRole("tab", { name: "Details" }).click({ force: true });

    const detailsEditor = studio.getByRole("region", {
      name: "Avatar details editor",
    });
    const paintCanvas = detailsEditor.getByRole("application", {
      name: /Avatar pixel canvas/,
    });
    await expect(paintCanvas).toBeVisible();
    await paintCanvas.click({ force: true });
    await expect(
      detailsEditor.getByText("Working copy · not applied"),
    ).toBeVisible();
    await expect
      .poll(() =>
        detailsEditor
          .locator('[data-avatar-details-editor-core="true"]')
          .evaluate((element) => {
            const canvas = element as HTMLCanvasElement;
            const context = canvas.getContext("2d");
            if (!context) return 0;
            return context
              .getImageData(58, 58, 13, 13)
              .data.reduce(
                (alpha, channel, index) =>
                  index % 4 === 3 ? alpha + channel : alpha,
                0,
              );
          }),
      )
      .toBeGreaterThan(0);
  });

  test("custom mouth Coffee pucker stays in the Mouth header and persists @visual", async ({
    page,
  }) => {
    test.slow();
    const coffeeMouthBot = {
      ...testBots[0]!,
      name: "Coffee Mouth Proof",
      face_mouth_character: "3",
      face_mouth_rotation_deg: -170,
      face_mouth_coffee_pucker: 0,
    };
    await installAuthenticatedApi(page, { bots: [coffeeMouthBot] });
    let savedPuckerPreference: boolean | null = null;
    await page.route(`**/api/bots/${coffeeMouthBot.id}`, async (route) => {
      const body = route.request().postDataJSON() as {
        faceMouthCoffeePucker?: unknown;
      };
      savedPuckerPreference = body.faceMouthCoffeePucker === true;
      coffeeMouthBot.face_mouth_coffee_pucker = savedPuckerPreference ? 1 : 0;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, bot: coffeeMouthBot }),
      });
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/");

    await activateNavigationControl(
      page.getByRole("button", { name: "Open bot customizer" }),
    );
    await activateNavigationControl(
      page.getByRole("button", { name: /Browse bots/ }),
    );
    await activateBotManagementControl(
      page.getByRole("button", {
        name: /Preview Coffee Mouth Proof; double-click to manage/,
      }),
    );
    await activateNavigationControl(
      page.getByRole("button", { name: /^Avatar Studio/ }),
    );

    const studio = page.getByRole("dialog", { name: "Coffee Mouth Proof" });
    await expect(studio).toBeVisible();
    await studio.getByRole("tab", { name: "Mouth" }).click({ force: true });

    const mouthControls = studio.getByRole("region", {
      name: "Mouth avatar controls",
    });
    const coffeePucker = mouthControls.getByRole("switch", {
      name: "Use * pucker while sipping in Coffee mode",
    });
    await expect(coffeePucker).toBeVisible();
    await expect(coffeePucker).toHaveText("Coffee *");
    await expect(
      mouthControls
        .getByRole("region", { name: "Mouth", exact: true })
        .getByRole("switch"),
    ).toHaveCount(0);

    const puckerBox = await coffeePucker.boundingBox();
    const styleLegendBox = await mouthControls
      .getByRole("group", { name: "Style" })
      .boundingBox();
    expect(puckerBox).not.toBeNull();
    expect(styleLegendBox).not.toBeNull();
    expect(puckerBox!.width).toBeGreaterThan(80);
    expect(puckerBox!.height).toBeGreaterThanOrEqual(28);
    expect(puckerBox!.y).toBeLessThan(styleLegendBox!.y);

    const mouthRegion = mouthControls.getByRole("region", {
      name: "Mouth",
      exact: true,
    });
    const customGlyphBox = await mouthRegion
      .getByRole("button", { name: "Custom mouth glyph", exact: true })
      .boundingBox();
    const rotationBox = await mouthRegion
      .getByRole("region", { name: "Mouth rotation" })
      .boundingBox();
    const rotationDialBox = await mouthRegion
      .getByRole("slider", { name: "Mouth rotation" })
      .boundingBox();
    expect(customGlyphBox).not.toBeNull();
    expect(rotationBox).not.toBeNull();
    expect(rotationDialBox).not.toBeNull();
    expect(customGlyphBox!.x + customGlyphBox!.width).toBeLessThan(
      rotationBox!.x,
    );
    expect(rotationBox!.width).toBeGreaterThanOrEqual(118);
    expect(rotationDialBox!.x).toBeGreaterThanOrEqual(rotationBox!.x);
    expect(rotationDialBox!.x + rotationDialBox!.width).toBeLessThanOrEqual(
      rotationBox!.x + rotationBox!.width,
    );

    // Chromium's headless compositor can apply a backdrop-filter to the
    // overlay's descendants in screenshots. Disable only that backdrop blur
    // for this proof capture; the studio itself is unchanged.
    await page.addStyleTag({
      content: `[class*="botAvatarCustomizerBackdrop"] {
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }`,
    });
    await page.screenshot({
      path: "/Users/jared/.codex/visualizations/2026/07/15/019f6482-1a7c-7472-ad04-a7542dcd0e93/prism-mouth-coffee-pucker-proof.png",
      fullPage: false,
      animations: "disabled",
    });
    await mouthControls.screenshot({
      path: "/Users/jared/.codex/visualizations/2026/07/15/019f6482-1a7c-7472-ad04-a7542dcd0e93/prism-mouth-controls-layout-proof.png",
      animations: "disabled",
    });

    await coffeePucker.click();
    await expect(coffeePucker).toBeChecked();
    await studio.getByRole("button", { name: "Save", exact: true }).click();
    await expect(
      page.locator('[aria-labelledby="bot-avatar-customizer-title"]'),
    ).toHaveCount(0);
    expect(savedPuckerPreference).toBe(true);

    await activateNavigationControl(
      page.getByRole("button", { name: /^Avatar Studio/ }),
    );
    const reopenedStudio = page.getByRole("dialog", {
      name: "Coffee Mouth Proof",
    });
    await reopenedStudio
      .getByRole("tab", { name: "Mouth" })
      .click({ force: true });
    await expect(
      reopenedStudio.getByRole("switch", {
        name: "Use * pucker while sipping in Coffee mode",
      }),
    ).toBeChecked();
  });
});
