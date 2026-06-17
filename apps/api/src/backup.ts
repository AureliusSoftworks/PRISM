import type { DatabaseSync } from "node:sqlite";
import { decryptJson, decryptText, encryptJson, encryptText } from "./security.ts";
import { normalizeMemoryTier } from "./memory.ts";
import type { ProviderName } from "./providers.ts";

export interface BackupUserSettings {
  theme: "light" | "dark" | "system";
  preferredProvider: ProviderName;
  providerLocked: boolean;
  autoMemory: boolean;
  composerWritingAssist: boolean;
  fallbackModelMessageStripe: boolean;
  hiddenBotModelIds: string[];
  preferredLocalModel: string;
  preferredOnlineModel: string;
  lenientLocalFallbackModel: string;
  lenientLocalImageFallbackModel: string;
  secondaryOllamaHost: string;
  comfyUiHost: string;
  comfyUiWorkflows: unknown[];
  preferredLocalImageModel: string;
  preferredOpenAiImageModel: string;
  prismDefaultLlmModel: string;
  prismImageToolLlmModel: string;
  devMemoriesEnabled: boolean;
  devMemoriesText: string;
  openAiApiKey?: string;
  anthropicApiKey?: string;
  elevenLabsApiKey?: string;
}

export interface BackupBotSnapshot {
  id: string;
  name: string;
  systemPrompt: string;
  exportHash?: string | null;
  model?: string | null;
  localModel?: string | null;
  onlineModel?: string | null;
  localImageModel?: string | null;
  openaiImageModel?: string | null;
  onlineEnabled: boolean;
  deleteProtected: boolean;
  flirtEnabled: boolean;
  temperature: number;
  maxTokens: number;
  color?: string | null;
  glyph?: string | null;
  chatEnabled: boolean;
  visibility: "private" | "public";
  createdAt: string;
  updatedAt: string;
}

export interface BackupSnapshot {
  version: 1;
  exportedAt: string;
  settings?: BackupUserSettings;
  bots?: BackupBotSnapshot[];
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      /** Optional; older v1 snapshots omit this. */
      provider?: ProviderName;
      /** Optional; older v1 snapshots (pre-model tracking) omit this. */
      model?: string;
      /** Optional; older v1 snapshots (pre-per-message bot tracking) omit this. */
      botId?: string;
      /** Serialized AskQuestion envelope; optional snapshots omit this. */
      toolPayload?: string;
    }>;
  }>;
  memories: Array<{
    id: string;
    conversationId?: string;
    botId?: string;
    confidence: number;
    category?: "general" | "user" | "bot_relation";
    tier?: "short_term" | "long_term";
    durability?: number;
    payload: Record<string, unknown>;
    createdAt: string;
  }>;
}

export interface BackupAdapter {
  upload(userId: string, payload: BackupSnapshot): Promise<void>;
  download(userId: string): Promise<BackupSnapshot | null>;
  listVersions(userId: string): Promise<string[]>;
}

export class LocalOnlyBackupAdapter implements BackupAdapter {
  private readonly snapshots = new Map<string, BackupSnapshot>();

  public async upload(userId: string, payload: BackupSnapshot): Promise<void> {
    this.snapshots.set(userId, payload);
  }

  public async download(userId: string): Promise<BackupSnapshot | null> {
    return this.snapshots.get(userId) ?? null;
  }

  public async listVersions(userId: string): Promise<string[]> {
    const snapshot = this.snapshots.get(userId);
    return snapshot ? [snapshot.exportedAt] : [];
  }
}

export function exportUserSnapshot(
  db: DatabaseSync,
  userId: string,
  userKey: Buffer
): BackupSnapshot {
  const user = db
    .prepare(
      `SELECT
         theme,
         preferred_provider,
         provider_locked,
         auto_memory,
         composer_writing_assist,
         fallback_model_message_stripe,
         hidden_bot_model_ids,
         preferred_local_model,
         preferred_online_model,
         lenient_local_fallback_model,
         lenient_local_image_fallback_model,
         secondary_ollama_host,
         comfyui_host,
         comfyui_workflows,
         preferred_local_image_model,
         preferred_openai_image_model,
         prism_default_llm_model,
         prism_image_tool_llm_model,
         dev_memories_enabled,
         dev_memories_text,
         openai_key_ciphertext,
         openai_key_iv,
         openai_key_tag,
         anthropic_key_ciphertext,
         anthropic_key_iv,
         anthropic_key_tag,
         elevenlabs_key_ciphertext,
         elevenlabs_key_iv,
         elevenlabs_key_tag
       FROM users
       WHERE id = ?`
    )
    .get(userId) as
    | {
        theme: "light" | "dark" | "system";
        preferred_provider: ProviderName;
        provider_locked: number;
        auto_memory: number;
        composer_writing_assist: number;
        fallback_model_message_stripe: number;
        hidden_bot_model_ids: string | null;
        preferred_local_model: string | null;
        preferred_online_model: string | null;
        lenient_local_fallback_model: string | null;
        lenient_local_image_fallback_model: string | null;
        secondary_ollama_host: string | null;
        comfyui_host: string | null;
        comfyui_workflows: string | null;
        preferred_local_image_model: string | null;
        preferred_openai_image_model: string | null;
        prism_default_llm_model: string | null;
        prism_image_tool_llm_model: string | null;
        dev_memories_enabled: number;
        dev_memories_text: string | null;
        openai_key_ciphertext: string | null;
        openai_key_iv: string | null;
        openai_key_tag: string | null;
        anthropic_key_ciphertext: string | null;
        anthropic_key_iv: string | null;
        anthropic_key_tag: string | null;
        elevenlabs_key_ciphertext: string | null;
        elevenlabs_key_iv: string | null;
        elevenlabs_key_tag: string | null;
      }
    | undefined;
  const settings: BackupUserSettings | undefined = user
    ? {
        theme: user.theme,
        preferredProvider: user.preferred_provider,
        providerLocked: user.provider_locked === 1,
        autoMemory: user.auto_memory === 1,
        composerWritingAssist: user.composer_writing_assist !== 0,
        fallbackModelMessageStripe: user.fallback_model_message_stripe !== 0,
        hiddenBotModelIds: safeParseStringArray(user.hidden_bot_model_ids),
        preferredLocalModel: user.preferred_local_model ?? "",
        preferredOnlineModel: user.preferred_online_model ?? "",
        lenientLocalFallbackModel: user.lenient_local_fallback_model ?? "",
        lenientLocalImageFallbackModel: user.lenient_local_image_fallback_model ?? "",
        secondaryOllamaHost: user.secondary_ollama_host ?? "",
        comfyUiHost: user.comfyui_host ?? "",
        comfyUiWorkflows: safeParseArray(user.comfyui_workflows),
        preferredLocalImageModel: user.preferred_local_image_model ?? "",
        preferredOpenAiImageModel: user.preferred_openai_image_model ?? "",
        prismDefaultLlmModel: user.prism_default_llm_model ?? "",
        prismImageToolLlmModel: user.prism_image_tool_llm_model ?? "",
        devMemoriesEnabled: user.dev_memories_enabled === 1,
        devMemoriesText: user.dev_memories_text ?? "",
        ...(user.openai_key_ciphertext && user.openai_key_iv && user.openai_key_tag
          ? {
              openAiApiKey: decryptText(
                {
                  ciphertext: user.openai_key_ciphertext,
                  iv: user.openai_key_iv,
                  tag: user.openai_key_tag,
                },
                userKey
              ),
            }
          : {}),
        ...(user.anthropic_key_ciphertext &&
        user.anthropic_key_iv &&
        user.anthropic_key_tag
          ? {
              anthropicApiKey: decryptText(
                {
                  ciphertext: user.anthropic_key_ciphertext,
                  iv: user.anthropic_key_iv,
                  tag: user.anthropic_key_tag,
                },
                userKey
              ),
            }
          : {}),
        ...(user.elevenlabs_key_ciphertext &&
        user.elevenlabs_key_iv &&
        user.elevenlabs_key_tag
          ? {
              elevenLabsApiKey: decryptText(
                {
                  ciphertext: user.elevenlabs_key_ciphertext,
                  iv: user.elevenlabs_key_iv,
                  tag: user.elevenlabs_key_tag,
                },
                userKey
              ),
            }
          : {}),
      }
    : undefined;
  const bots = db
    .prepare(
      `SELECT
         id,
         name,
         system_prompt,
         export_hash,
         model,
         local_model,
         online_model,
         local_image_model,
         openai_image_model,
         online_enabled,
         delete_protected,
         flirt_enabled,
         temperature,
         max_tokens,
         color,
         glyph,
         chat_enabled,
         visibility,
         created_at,
         updated_at
       FROM bots
       WHERE user_id = ?
       ORDER BY updated_at DESC`
    )
    .all(userId) as Array<{
    id: string;
    name: string;
    system_prompt: string;
    export_hash: string | null;
    model: string | null;
    local_model: string | null;
    online_model: string | null;
    local_image_model: string | null;
    openai_image_model: string | null;
    online_enabled: number;
    delete_protected: number;
    flirt_enabled: number;
    temperature: number | null;
    max_tokens: number | null;
    color: string | null;
    glyph: string | null;
    chat_enabled: number;
    visibility: string | null;
    created_at: string;
    updated_at: string;
  }>;

  const conversations = db
    .prepare(
      "SELECT id, title, created_at, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    title: string;
    created_at: string;
    updated_at: string;
  }>;

  const conversationPayload = conversations.map((conversation) => {
    const messages = db
      .prepare(
        "SELECT id, role, content, provider, model, bot_id, tool_payload, created_at FROM messages WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC"
      )
      .all(conversation.id, userId) as Array<{
      id: string;
      role: string;
      content: string;
      provider: string | null;
      model: string | null;
      bot_id: string | null;
      tool_payload: string | null;
      created_at: string;
    }>;
    return {
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      messages: messages.map((message) => {
        const provider: ProviderName | undefined =
          message.provider === "local" ||
          message.provider === "openai" ||
          message.provider === "anthropic"
            ? message.provider
            : undefined;
        const botId: string | undefined = message.bot_id ?? undefined;
        const model: string | undefined = message.model ?? undefined;
        const toolPayload =
          typeof message.tool_payload === "string" && message.tool_payload.trim().length > 0
            ? message.tool_payload
            : undefined;
        return {
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.created_at,
          provider,
          model,
          botId,
          ...(toolPayload ? { toolPayload } : {}),
        };
      }),
    };
  });

  const memories = db
    .prepare(
      "SELECT id, conversation_id, bot_id, confidence, category, tier, durability, ciphertext, iv, tag, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC"
    )
    .all(userId) as Array<{
    id: string;
    conversation_id: string | null;
    bot_id: string | null;
    confidence: number;
    category: "general" | "user" | "bot_relation";
    tier: "short_term" | "long_term";
    durability: number | null;
    ciphertext: string;
    iv: string;
    tag: string;
    created_at: string;
  }>;

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    settings,
    bots: bots.map((bot) => ({
      id: bot.id,
      name: bot.name,
      systemPrompt: bot.system_prompt,
      exportHash: bot.export_hash,
      model: bot.model,
      localModel: bot.local_model,
      onlineModel: bot.online_model,
      localImageModel: bot.local_image_model,
      openaiImageModel: bot.openai_image_model,
      onlineEnabled: bot.online_enabled !== 0,
      deleteProtected: bot.delete_protected === 1,
      flirtEnabled: bot.flirt_enabled === 1,
      temperature: typeof bot.temperature === "number" ? bot.temperature : 0.7,
      maxTokens: typeof bot.max_tokens === "number" ? bot.max_tokens : 2048,
      color: bot.color,
      glyph: bot.glyph,
      chatEnabled: bot.chat_enabled !== 0,
      visibility: bot.visibility === "public" ? "public" : "private",
      createdAt: bot.created_at,
      updatedAt: bot.updated_at,
    })),
    conversations: conversationPayload,
    memories: memories.map((memory) => ({
      id: memory.id,
      conversationId: memory.conversation_id ?? undefined,
      botId: memory.bot_id ?? undefined,
      confidence: memory.confidence,
      category: memory.category,
      tier: memory.tier,
      durability: memory.durability ?? undefined,
      createdAt: memory.created_at,
      payload: decryptJson(
        {
          ciphertext: memory.ciphertext,
          iv: memory.iv,
          tag: memory.tag
        },
        userKey
      )
    }))
  };
}

export function importUserSnapshot(
  db: DatabaseSync,
  userId: string,
  snapshot: BackupSnapshot,
  userKey: Buffer
): void {
  if (snapshot.settings) {
    const settings = snapshot.settings;
    const openAiApiKey =
      typeof settings.openAiApiKey === "string" && settings.openAiApiKey.length > 0
        ? settings.openAiApiKey
        : null;
    const anthropicApiKey =
      typeof settings.anthropicApiKey === "string" && settings.anthropicApiKey.length > 0
        ? settings.anthropicApiKey
        : null;
    const elevenLabsApiKey =
      typeof settings.elevenLabsApiKey === "string" && settings.elevenLabsApiKey.length > 0
        ? settings.elevenLabsApiKey
        : null;
    const encryptedOpenAiKey = openAiApiKey ? encryptText(openAiApiKey, userKey) : null;
    const encryptedAnthropicKey = anthropicApiKey
      ? encryptText(anthropicApiKey, userKey)
      : null;
    const encryptedElevenLabsKey = elevenLabsApiKey
      ? encryptText(elevenLabsApiKey, userKey)
      : null;
    db.prepare(`
      UPDATE users
      SET
        theme = ?,
        preferred_provider = ?,
        provider_locked = ?,
        auto_memory = ?,
        composer_writing_assist = ?,
        fallback_model_message_stripe = ?,
        hidden_bot_model_ids = ?,
        preferred_local_model = ?,
        preferred_online_model = ?,
        lenient_local_fallback_model = ?,
        lenient_local_image_fallback_model = ?,
        secondary_ollama_host = ?,
        comfyui_host = ?,
        comfyui_workflows = ?,
        preferred_local_image_model = ?,
        preferred_openai_image_model = ?,
        prism_default_llm_model = ?,
        prism_image_tool_llm_model = ?,
        dev_memories_enabled = ?,
        dev_memories_text = ?,
        openai_key_ciphertext = ?,
        openai_key_iv = ?,
        openai_key_tag = ?,
        anthropic_key_ciphertext = ?,
        anthropic_key_iv = ?,
        anthropic_key_tag = ?,
        elevenlabs_key_ciphertext = ?,
        elevenlabs_key_iv = ?,
        elevenlabs_key_tag = ?
      WHERE id = ?
    `).run(
      settings.theme === "light" || settings.theme === "dark" ? settings.theme : "system",
      settings.preferredProvider === "openai" || settings.preferredProvider === "anthropic"
        ? settings.preferredProvider
        : "local",
      settings.providerLocked ? 1 : 0,
      settings.autoMemory ? 1 : 0,
      settings.composerWritingAssist ? 1 : 0,
      settings.fallbackModelMessageStripe ? 1 : 0,
      JSON.stringify(
        Array.isArray(settings.hiddenBotModelIds)
          ? settings.hiddenBotModelIds.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0
            )
          : []
      ),
      settings.preferredLocalModel?.trim() ?? "",
      settings.preferredOnlineModel?.trim() ?? "",
      settings.lenientLocalFallbackModel?.trim() ?? "",
      settings.lenientLocalImageFallbackModel?.trim() ?? "",
      settings.secondaryOllamaHost?.trim() ?? "",
      settings.comfyUiHost?.trim() ?? "",
      JSON.stringify(Array.isArray(settings.comfyUiWorkflows) ? settings.comfyUiWorkflows : []),
      settings.preferredLocalImageModel?.trim() ?? "",
      settings.preferredOpenAiImageModel?.trim() ?? "",
      settings.prismDefaultLlmModel?.trim() ?? "",
      settings.prismImageToolLlmModel?.trim() ?? "",
      settings.devMemoriesEnabled ? 1 : 0,
      settings.devMemoriesText ?? "",
      encryptedOpenAiKey?.ciphertext ?? null,
      encryptedOpenAiKey?.iv ?? null,
      encryptedOpenAiKey?.tag ?? null,
      encryptedAnthropicKey?.ciphertext ?? null,
      encryptedAnthropicKey?.iv ?? null,
      encryptedAnthropicKey?.tag ?? null,
      encryptedElevenLabsKey?.ciphertext ?? null,
      encryptedElevenLabsKey?.iv ?? null,
      encryptedElevenLabsKey?.tag ?? null,
      userId
    );
  }

  if (Array.isArray(snapshot.bots)) {
    const insertBot = db.prepare(`
      INSERT OR REPLACE INTO bots (
        id,
        user_id,
        name,
        system_prompt,
        export_hash,
        model,
        local_model,
        online_model,
        local_image_model,
        openai_image_model,
        online_enabled,
        delete_protected,
        flirt_enabled,
        temperature,
        max_tokens,
        color,
        glyph,
        chat_enabled,
        visibility,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const bot of snapshot.bots) {
      if (!bot || typeof bot.id !== "string" || bot.id.trim().length === 0) continue;
      const now = new Date().toISOString();
      insertBot.run(
        bot.id.trim(),
        userId,
        typeof bot.name === "string" && bot.name.trim().length > 0 ? bot.name.trim() : "Imported Bot",
        typeof bot.systemPrompt === "string" ? bot.systemPrompt : "",
        typeof bot.exportHash === "string" && bot.exportHash.trim().length > 0
          ? bot.exportHash.trim().toLowerCase()
          : null,
        typeof bot.model === "string" && bot.model.trim().length > 0 ? bot.model.trim() : null,
        typeof bot.localModel === "string" && bot.localModel.trim().length > 0
          ? bot.localModel.trim()
          : null,
        typeof bot.onlineModel === "string" && bot.onlineModel.trim().length > 0
          ? bot.onlineModel.trim()
          : null,
        typeof bot.localImageModel === "string" && bot.localImageModel.trim().length > 0
          ? bot.localImageModel.trim()
          : null,
        typeof bot.openaiImageModel === "string" && bot.openaiImageModel.trim().length > 0
          ? bot.openaiImageModel.trim()
          : null,
        bot.onlineEnabled === false ? 0 : 1,
        bot.deleteProtected === true ? 1 : 0,
        bot.flirtEnabled === true ? 1 : 0,
        typeof bot.temperature === "number" ? bot.temperature : 0.7,
        typeof bot.maxTokens === "number" ? Math.max(1, Math.floor(bot.maxTokens)) : 2048,
        typeof bot.color === "string" && bot.color.trim().length > 0 ? bot.color.trim() : null,
        typeof bot.glyph === "string" && bot.glyph.trim().length > 0 ? bot.glyph.trim() : null,
        bot.chatEnabled === false ? 0 : 1,
        bot.visibility === "public" ? "public" : "private",
        typeof bot.createdAt === "string" && bot.createdAt.trim().length > 0 ? bot.createdAt : now,
        typeof bot.updatedAt === "string" && bot.updatedAt.trim().length > 0 ? bot.updatedAt : now
      );
    }
  }

  const insertConversation = db.prepare(`
    INSERT OR REPLACE INTO conversations (id, user_id, title, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertMessage = db.prepare(`
    INSERT OR REPLACE INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMemory = db.prepare(`
    INSERT OR REPLACE INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, category, tier, durability, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const conversation of snapshot.conversations) {
    insertConversation.run(
      conversation.id,
      userId,
      conversation.title,
      conversation.createdAt,
      conversation.updatedAt
    );
    for (const message of conversation.messages) {
      const providerValue =
        message.provider === "local" ||
        message.provider === "openai" ||
        message.provider === "anthropic"
          ? message.provider
          : null;
      const botIdValue =
        typeof message.botId === "string" && message.botId.length > 0
          ? message.botId
          : null;
      const modelValue =
        typeof message.model === "string" && message.model.trim().length > 0
          ? message.model.trim()
          : null;
      const toolPayloadValue =
        typeof message.toolPayload === "string" && message.toolPayload.trim().length > 0
          ? message.toolPayload.trim()
          : null;
      insertMessage.run(
        message.id,
        conversation.id,
        userId,
        message.role,
        message.content,
        providerValue,
        modelValue,
        botIdValue,
        toolPayloadValue,
        message.createdAt
      );
    }
  }

  for (const memory of snapshot.memories) {
    const encrypted = encryptJson(memory.payload, userKey);
    insertMemory.run(
      memory.id,
      userId,
      memory.conversationId ?? null,
      memory.botId ?? null,
      encrypted.ciphertext,
      encrypted.iv,
      encrypted.tag,
      memory.confidence,
      memory.category ?? "user",
      memory.tier ?? normalizeMemoryTier(undefined, memory.confidence, memory.confidence, memory.durability ?? 0.5),
      memory.durability ?? 0.5,
      memory.createdAt
    );
  }
}

function safeParseArray(raw: string | null): unknown[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseStringArray(raw: string | null): string[] {
  return safeParseArray(raw).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}
