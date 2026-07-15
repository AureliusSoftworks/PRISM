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

async function installAuthenticatedApi(page: Page): Promise<void> {
  await page.addInitScript(
    ({ userId }) => {
      window.localStorage.setItem("prism_first_run_welcome_v1", "done");
      window.localStorage.setItem(
        "prism_desktop_first_run_complete_v3",
        "done",
      );
      window.localStorage.setItem(
        `prism_mode_tutorials_v1:${userId}`,
        JSON.stringify({ zen: true, chat: true, coffee: true }),
      );
    },
    { userId: testUser.id },
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

async function installStatefulZenApi(
  page: Page,
): Promise<StatefulZenFixture> {
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
    await page
      .getByRole("option", { name: /Coffee Filter Trio/u })
      .click();
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
    await installAuthenticatedApi(page);
    await page.goto("/?view=chat");

    const firstBot = page.getByRole("radio", { name: "Test Bot 1" });
    await expect(firstBot).toBeVisible();
    await firstBot.click();

    const selectedHero = page.locator('[data-selected-bot-hero="true"]');
    await expect(selectedHero).toBeVisible();
    await expect(firstBot).toHaveAttribute("aria-checked", "true");

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
});
