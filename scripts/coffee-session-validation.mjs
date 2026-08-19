// Coffee Mode end-to-end validation: real model calls, real orchestrator,
// in-memory DB with the production schema. Simulates a timed 5-minute table
// with a 4-bot cast, two player messages, and a driven clock so planned
// staggered departures cross their thresholds. Prints the transcript with
// aside/departure annotations plus a summary of organic-quality counters.
//
//   node --experimental-strip-types scripts/coffee-session-validation.mjs
//
// Env:
//   VALIDATION_PROVIDER=openai        speaker via OpenAI (default: local)
//   VALIDATION_SPEAKER_MODEL=...      default llama3.2:latest / gpt-3.5-turbo
//   OPENAI_API_KEY                    required when VALIDATION_PROVIDER=openai
//   VALIDATION_MINUTES=30             table length, 3-30 (default 5)
//   VALIDATION_PLAYER=none            run unattended, with no player lines at
//                                     all (default: two scripted interjections)
//
// Scope note: this drives the orchestrator directly. It does not exercise the
// turn-job registry or the HTTP autonomous gate, so it proves that a table
// keeps producing content and resolves on its own — not that the live client
// never stalls waiting on a job.
//
// The router/auxiliary lane always stays on local llama3.2, matching product
// architecture; needs a running Ollama with llama3.2 pulled either way.
import { DatabaseSync } from "node:sqlite";

const apiModule = (name) =>
  import(new URL(`../apps/api/src/${name}`, import.meta.url).href);
const { initializeDatabase } = await apiModule("db.ts");
const coffee = await apiModule("coffee.ts");
const {
  createCoffeeGroup,
  createCoffeeConversationFromGroup,
  setCoffeeConversationTopic,
  processCoffeeTurn,
  processCoffeeAutonomousTurn,
  coffeeBotPlannedDepartureV1,
  coffeeStarterTopicLabelIsCanned,
} = coffee;

const db = initializeDatabase(new DatabaseSync(":memory:"));
const userId = "user-validation";
const now = new Date().toISOString();

// Foreign keys are enforced by the production schema: seed a minimal user row,
// filling every NOT NULL column without a default from the live table shape.
{
  const columns = db.prepare("PRAGMA table_info(users)").all();
  const seeded = [];
  for (const column of columns) {
    if (column.name === "id") {
      seeded.push({ name: column.name, value: userId });
      continue;
    }
    if (column.notnull !== 1 || column.dflt_value !== null) continue;
    const type = String(column.type ?? "").toUpperCase();
    seeded.push({
      name: column.name,
      value: /INT|REAL|NUM/.test(type)
        ? 0
        : column.name.includes("email")
          ? "validation@example.com"
          : "x",
    });
  }
  db.prepare(
    `INSERT INTO users (${seeded.map((c) => c.name).join(", ")})
     VALUES (${seeded.map(() => "?").join(", ")})`,
  ).run(...seeded.map((c) => c.value));
}

const CAST = [
  {
    id: "bot-beatrix",
    name: "Beatrix",
    systemPrompt:
      "You are Beatrix, a retired homicide detective. Blunt, dry, allergic to loose ends and tidy stories. You value evidence, coffee strong enough to stand a spoon in, and people who say what they mean. You needle vague claims.",
  },
  {
    id: "bot-momo",
    name: "Momo",
    systemPrompt:
      "You are Momo, a sunny street-food chef who runs a midnight noodle cart. You tease people warmly, think every problem is improved by feeding someone, and believe recipes are small acts of love. You hate waste and pretension.",
  },
  {
    id: "bot-ilya",
    name: "Ilya",
    systemPrompt:
      "You are Ilya, a melancholy chess grandmaster past your peak. You speak in careful, short sentences, see life as positions and sacrifices, and quietly fear being forgotten. Beauty in a losing line moves you more than winning.",
  },
  {
    id: "bot-sana",
    name: "Sana",
    systemPrompt:
      "You are Sana, a relentless startup founder on her third company. You talk fast, interrupt yourself, turn everything into a pitch or an experiment, and secretly envy people who can rest. You respect data and audacity.",
  },
];

// Speaker provider/model come from env so the same harness validates the
// local baseline (llama3.2) and online uplift (e.g. gpt-3.5-turbo). The
// router/auxiliary lane stays local llama3.2 either way, matching product
// architecture. Bots are online-enabled so per-bot gating never forces local.
const SPEAKER_PROVIDER = process.env.VALIDATION_PROVIDER === "openai" ? "openai" : "local";
const SPEAKER_MODEL =
  process.env.VALIDATION_SPEAKER_MODEL ??
  (SPEAKER_PROVIDER === "openai" ? "gpt-3.5-turbo" : "llama3.2:latest");
if (SPEAKER_PROVIDER === "openai" && !process.env.OPENAI_API_KEY) {
  throw new Error("VALIDATION_PROVIDER=openai needs OPENAI_API_KEY in the environment.");
}
console.log(`SPEAKER: ${SPEAKER_PROVIDER} / ${SPEAKER_MODEL}`);

const insertBot = db.prepare(
  `INSERT INTO bots (
    id, user_id, name, system_prompt, color, glyph, model, local_model,
    online_model, online_enabled, flirt_enabled, temperature, max_tokens, visibility,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NULL, 1, 0, 0.8, 220, 'private', ?, ?)`,
);
for (const bot of CAST) {
  insertBot.run(
    bot.id,
    userId,
    bot.name,
    bot.systemPrompt,
    "#a78bfa",
    "coffee",
    "llama3.2:latest",
    now,
    now,
  );
}

// Coffee itself only accepts whole minutes from 3 to 30, so the harness
// clamps to the same range: 30 is a full-length table, not an extrapolation.
const SESSION_MINUTES = Math.max(
  3,
  Math.min(30, Math.round(Number(process.env.VALIDATION_MINUTES ?? 5))),
);
const SESSION_MS = SESSION_MINUTES * 60_000;
const PER_TURN_MS = 11_500;
/** One spare turn so the loop can reach the closing beats, never fewer than the
 * original 26 for a five-minute table. */
const TURN_BUDGET = Math.ceil(SESSION_MS / PER_TURN_MS) + 1;
const UNATTENDED = (process.env.VALIDATION_PLAYER ?? "").toLowerCase() === "none";

const group = createCoffeeGroup(db, userId, {
  name: "The Night Shift",
  ethos:
    "They meet after everyone else has gone home to argue about what a life adds up to when the day's work is done.",
  groupBotIds: CAST.map((bot) => bot.id),
});
console.log(`GROUP ${group.id} "${group.name}" bots=${group.botGroupIds.join(",")}`);

const llm = { prismDefaultLlmModel: "llama3.2:latest" };
const created = await createCoffeeConversationFromGroup(
  db,
  userId,
  group.id,
  { durationMinutes: SESSION_MINUTES, forceAttendance: true, deferTopicSelection: true },
  llm,
);
const conversationId = created.conversation.id;
console.log(
  `\nSESSION ${conversationId} duration=${SESSION_MINUTES}m turns=${TURN_BUDGET}` +
    `${UNATTENDED ? " unattended" : ""}`,
);
console.log("TOPIC CHIPS:");
for (const chip of created.coffeeStarterTopics ?? []) {
  console.log(
    `  - ${chip}${coffeeStarterTopicLabelIsCanned(chip) ? "  [!CANNED]" : ""}`,
  );
}

const plans = CAST.map((bot) => ({
  name: bot.name,
  ...coffeeBotPlannedDepartureV1({
    conversationId,
    botId: bot.id,
    durationMinutes: SESSION_MINUTES,
  }),
}));
console.log("\nPLANNED DEPARTURES:");
for (const plan of plans) {
  console.log(
    `  ${plan.name}: ${plan.band} (leaves with ~${Math.round(plan.departAtRemainingMs / 1000)}s remaining)`,
  );
}

const chosenTopic = (created.coffeeStarterTopics ?? [])[0] ?? "What a life adds up to";
await setCoffeeConversationTopic(db, userId, conversationId, chosenTopic, llm);
console.log(`\nTOPIC CHOSEN: ${chosenTopic}\n--- TRANSCRIPT ---`);

const settingsFor = (remainingMs) => ({
  preferredProvider: SPEAKER_PROVIDER,
  sessionSpeakerModel: SPEAKER_MODEL,
  prismDefaultLlmModel: "llama3.2:latest",
  ...(SPEAKER_PROVIDER === "openai"
    ? { openAiApiKey: process.env.OPENAI_API_KEY }
    : {}),
  userDisplayName: "Jared",
  sessionRemainingMs: remainingMs,
  theme: "dark",
});

const seenSpeakers = new Set();
let asideCount = 0;
let quickCount = 0;
let failures = 0;
const departuresSeen = [];

const printedMessageIds = new Set();
function printNewMessages(remainingMs) {
  const rows = db
    .prepare(
      `SELECT id, role, content, bot_id, tool_payload FROM messages
        WHERE conversation_id = ? AND user_id = ? ORDER BY created_at ASC, rowid ASC`,
    )
    .all(conversationId, userId);
  for (const row of rows) {
    if (printedMessageIds.has(row.id)) continue;
    printedMessageIds.add(row.id);
    const payload = row.tool_payload ? JSON.parse(row.tool_payload) : {};
    const departure = (payload.coffeeReplayEvents ?? []).find(
      (event) => event.kind === "botDeparture",
    );
    if (departure) {
      const name = CAST.find((bot) => bot.id === departure.botId)?.name ?? departure.botId;
      departuresSeen.push({ name, remainingMs });
      console.log(`  << ${name} LEAVES THE TABLE (${Math.round(remainingMs / 1000)}s left)`);
    }
    if (row.role === "user" && row.content.trim()) {
      console.log(`  JARED: ${row.content}`);
    } else if (row.role === "assistant" && row.content.trim()) {
      const name = CAST.find((bot) => bot.id === row.bot_id)?.name ?? row.bot_id ?? "?";
      seenSpeakers.add(name);
      const aside = payload.coffeeAside;
      if (aside) asideCount += 1;
      const words = row.content.replace(/\*[^*]*\*/g, " ").trim().split(/\s+/).filter(Boolean);
      if (words.length > 0 && words.length <= 9) quickCount += 1;
      console.log(
        `  ${name.toUpperCase()}: ${row.content}${aside ? `   [aside -> ${aside.toName}]` : ""}`,
      );
    }
  }
}

let remainingMs = SESSION_MS;
const PLAYER_LINES = UNATTENDED
  ? new Map()
  : new Map([
      [4, "Alright, honest answers only: what do you all still owe somebody?"],
      [13, "Momo, that dodge was smooth, but I saw it. What's the debt you never paid back?"],
    ]);

// A table that stops producing content is the failure this harness exists to
// catch: the session is supposed to carry itself for its whole length without
// anyone typing. Track the worst run of consecutive silent turns rather than
// only the total, so a long dead stretch cannot hide behind a healthy average.
let silentTurns = 0;
let longestSilentRun = 0;
let turnsTaken = 0;

for (let turn = 0; turn < TURN_BUDGET && remainingMs > 8_000; turn += 1) {
  turnsTaken += 1;
  const messagesBefore = printedMessageIds.size;
  const playerLine = PLAYER_LINES.get(turn);
  try {
    if (playerLine) {
      await processCoffeeTurn(
        db,
        userId,
        { conversationId, message: playerLine },
        settingsFor(remainingMs),
      );
    } else {
      await processCoffeeAutonomousTurn(
        db,
        userId,
        conversationId,
        settingsFor(remainingMs),
        false,
      );
    }
  } catch (error) {
    failures += 1;
    console.log(`  [turn ${turn} failed: ${error?.message ?? error}]`);
  }
  printNewMessages(remainingMs);
  if (printedMessageIds.size === messagesBefore) {
    silentTurns += 1;
    longestSilentRun = Math.max(longestSilentRun, silentTurns);
  } else {
    silentTurns = 0;
  }
  remainingMs -= PER_TURN_MS;
}

const finalRow = db
  .prepare(
    `SELECT bot_group_ids, coffee_absent_bot_ids FROM conversations WHERE id = ?`,
  )
  .get(conversationId);
const finalSeats = JSON.parse(finalRow.bot_group_ids ?? "[]");
const stillSeated = finalSeats.filter((id) => typeof id === "string");

console.log("\n--- VALIDATION SUMMARY ---");
console.log(
  `session: ${SESSION_MINUTES}m${UNATTENDED ? " unattended" : ""}, ` +
    `turns attempted: ${turnsTaken}, failures: ${failures}`,
);
console.log(
  `silent turns: ${longestSilentRun} longest consecutive run` +
    `${longestSilentRun >= 3 ? "  [!STALLED]" : ""}`,
);
console.log(`distinct speakers: ${[...seenSpeakers].join(", ") || "none"}`);
console.log(`asides: ${asideCount}, short beats (<=9 words): ${quickCount}`);
console.log(
  `departures observed: ${departuresSeen.map((d) => `${d.name}@${Math.round(d.remainingMs / 1000)}s`).join(", ") || "none"}`,
);
console.log(
  `still seated at end: ${stillSeated.length} of ${CAST.length}` +
    `${stillSeated.length === 0 ? "  [resolved organically]" : ""}`,
);
const cannedChips = (created.coffeeStarterTopics ?? []).filter((chip) =>
  coffeeStarterTopicLabelIsCanned(chip),
);
console.log(`canned chips: ${cannedChips.length} of ${(created.coffeeStarterTopics ?? []).length}`);
console.log("DONE");
