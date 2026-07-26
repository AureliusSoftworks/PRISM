#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const REVIEW_HEADERS = {
  signal: "# PRISM Signal Review Transcript",
  coffee: "# PRISM Coffee Review Export",
};

function normalizedFieldKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "_")
    .replace(/^_+|_+$/gu, "");
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseFields(lines) {
  const fields = {};
  let activeBlockKey = null;
  for (const line of lines) {
    const field = line.match(/^- ([^:]+):(?:\s(.*))?$/u);
    if (field) {
      activeBlockKey = normalizedFieldKey(field[1]);
      fields[activeBlockKey] = field[2]?.trim() ?? "";
      continue;
    }
    if (activeBlockKey && /^ {4}/u.test(line)) {
      const text = line.slice(4);
      fields[activeBlockKey] = fields[activeBlockKey]
        ? `${fields[activeBlockKey]}\n${text}`
        : text;
      continue;
    }
    if (line.trim()) activeBlockKey = null;
  }
  return fields;
}

function sectionRanges(lines) {
  const ranges = new Map();
  let current = null;
  let startedAt = 0;
  for (let index = 0; index <= lines.length; index += 1) {
    const match = lines[index]?.match(/^## (.+)$/u);
    if (index === lines.length || match) {
      if (current) ranges.set(current, [startedAt, index]);
      current = match?.[1]?.trim() ?? null;
      startedAt = index + 1;
    }
  }
  return ranges;
}

function linesForSection(lines, ranges, name) {
  const range = ranges.get(name);
  return range ? lines.slice(range[0], range[1]) : [];
}

function parseTurns(lines) {
  const turns = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /^### Turn (\d+) \| ([^|]+) \| (.+?)(?: \(([^)]+)\))?$/u,
    );
    if (!match) continue;
    let end = index + 1;
    while (end < lines.length && !/^#{2,3} /u.test(lines[end])) end += 1;
    turns.push({
      number: Number(match[1]),
      at: match[2].trim(),
      speaker: match[3].trim(),
      role: match[4]?.trim() ?? null,
      fields: parseFields(lines.slice(index + 1, end)),
    });
    index = end - 1;
  }
  return turns;
}

function parseStableEventLines(lines) {
  return lines.flatMap((line) => {
    const signal = line.match(
      /^- #(\d+) \| ([^|]+) \| ([^|]+) \| event ([^|]+) \| (.+)$/u,
    );
    if (signal) {
      return [{
        sequence: Number(signal[1]),
        occurredAt: signal[2].trim(),
        kind: signal[3].trim(),
        id: signal[4].trim(),
        payload: parseJson(signal[5].trim()),
      }];
    }
    const coffee = line.match(
      /^- #(\d+) \| ([^|]+) \| ([^|]+) \| sourceMessageId=([^|]+) \| payload=(.+)$/u,
    );
    if (!coffee) return [];
    return [{
      sequence: Number(coffee[1]),
      occurredAt: coffee[2].trim(),
      kind: coffee[3].trim(),
      sourceMessageId: coffee[4].trim(),
      payload: parseJson(coffee[5].trim()),
    }];
  });
}

function parseDirection(lines) {
  return lines.flatMap((line) => {
    const match = line.match(
      /^- #(\d+) \| atMs=(\d+) \| endMs=(none|\d+) \| kind=([a-z_]+) \| sourceMessageId=([^|]+) \| payload=(.+)$/u,
    );
    if (!match) return [];
    return [{
      sequence: Number(match[1]),
      atMs: Number(match[2]),
      endMs: match[3] === "none" ? null : Number(match[3]),
      kind: match[4],
      sourceMessageId: match[5].trim() === "none"
        ? null
        : match[5].trim(),
      payload: parseJson(match[6].trim()),
    }];
  });
}

function countKinds(events) {
  const counts = {};
  for (const event of events) {
    counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  }
  return counts;
}

function firstMetadataValue(lines, labels) {
  for (const label of labels) {
    const pattern = new RegExp(
      `^-? ?${label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}:\\s*(.+)$`,
      "iu",
    );
    const match = lines.find((line) => pattern.test(line))?.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

export function indexPrismSessionReview(source) {
  const text = String(source ?? "").replace(/\r\n?/gu, "\n").trim();
  if (!text) throw new Error("The review export is empty.");
  const surface = text.includes(REVIEW_HEADERS.signal)
    ? "signal"
    : text.includes(REVIEW_HEADERS.coffee)
      ? "coffee"
      : null;
  if (!surface) {
    throw new Error("Unrecognized PRISM Signal or Coffee review export.");
  }

  const lines = text.split("\n");
  const formatMatch = text.match(/^-? ?Review format:\s*(\d+)$/imu);
  const format = formatMatch ? Number(formatMatch[1]) : 1;
  const ranges = sectionRanges(lines);
  const turns = parseTurns(lines);
  const productionEvents = parseStableEventLines(
    linesForSection(lines, ranges, "Production Event Log"),
  );
  const replayEvents = parseStableEventLines(
    linesForSection(lines, ranges, "Replay Event Log"),
  );
  const direction = parseDirection(
    linesForSection(lines, ranges, "Private Replay Direction Log"),
  );
  const turnRepairs = turns
    .filter((turn) => {
      const repair = turn.fields.utterance_repair;
      return repair && !/^(?:none recorded|not applicable)/iu.test(repair);
    })
    .map((turn) => ({
      turn: turn.number,
      messageId: turn.fields.message_id ?? null,
      repair: turn.fields.utterance_repair,
      source: "turn",
    }));
  const repairedMessageIds = new Set(
    turnRepairs.map((repair) => repair.messageId).filter(Boolean),
  );
  const eventRepairs = productionEvents.flatMap((event) => {
    const payload =
      event.payload && typeof event.payload === "object"
        ? event.payload
        : null;
    const repair = payload?.utteranceRepair;
    const messageId =
      typeof payload?.messageId === "string" ? payload.messageId : null;
    if (!repair || (messageId && repairedMessageIds.has(messageId))) return [];
    return [{
      turn: null,
      messageId,
      repair,
      source: "production_event",
      eventId: event.id ?? null,
    }];
  });
  const turnRecoveries = turns
    .filter((turn) => {
      const recovery = turn.fields.auto_recovery;
      return recovery && !/^(?:none recorded|not applicable)/iu.test(recovery);
    })
    .map((turn) => ({
      turn: turn.number,
      messageId: turn.fields.message_id ?? null,
      recovery: turn.fields.auto_recovery,
      source: "turn",
    }));
  const recoveredMessageIds = new Set(
    turnRecoveries.map((recovery) => recovery.messageId).filter(Boolean),
  );
  const eventRecoveries = productionEvents.flatMap((event) => {
    const payload =
      event.payload && typeof event.payload === "object"
        ? event.payload
        : null;
    const recovery = payload?.autoRecovery;
    const messageId =
      typeof payload?.messageId === "string" ? payload.messageId : null;
    if (!recovery || (messageId && recoveredMessageIds.has(messageId))) return [];
    return [{
      turn: null,
      messageId,
      recovery,
      source: "production_event",
      eventId: event.id ?? null,
    }];
  });
  const thinkingIntervals = direction
    .filter((event) => event.kind === "thinking")
    .map((event) => ({
      sequence: event.sequence,
      atMs: event.atMs,
      endMs: event.endMs,
      sourceMessageId: event.sourceMessageId,
      participantId: event.payload?.participantId ?? null,
      botId: event.payload?.botId ?? null,
      presentationDurationMs:
        event.payload?.presentationDurationMs ?? null,
      timelineCompacted: event.payload?.timelineCompacted ?? null,
      audible: event.payload?.audible ?? null,
      camera: event.payload?.camera ?? null,
      segment: event.payload?.segment ?? null,
      followingMessageId: event.payload?.followingMessageId ?? null,
      endReason: event.payload?.endReason ?? null,
    }));
  const warnings = [];
  if (format === 1) {
    warnings.push("Legacy review format 1 has limited per-turn provenance.");
  }
  if (turns.length === 0) {
    warnings.push(
      surface === "coffee"
        ? "No detailed turn records were present; use Table Prose as limited evidence."
        : "No transcript turns were present.",
    );
  }
  if (!ranges.has("Faithful Recording Evidence")) {
    warnings.push("Faithful recording diagnostics were not present.");
  }
  if (direction.length === 0) {
    warnings.push("No parseable V2 replay direction events were present.");
  }

  return {
    schema: "prism-session-review-index-v1",
    surface,
    reviewFormat: format,
    metadata: {
      sourceId: firstMetadataValue(lines, ["Episode ID", "Session ID"]),
      title: firstMetadataValue(lines, ["Title"]),
      topic: firstMetadataValue(lines, ["Topic"]),
      provider: firstMetadataValue(lines, ["Episode provider"]),
      model: firstMetadataValue(lines, ["Episode model"]),
      availability: firstMetadataValue(lines, ["Replay availability"]),
      manifestVersion: firstMetadataValue(lines, ["Manifest version"]),
    },
    turns,
    repairs: [...turnRepairs, ...eventRepairs],
    recoveries: [...turnRecoveries, ...eventRecoveries],
    productionEvents,
    replayEvents,
    eventCounts: countKinds([...productionEvents, ...replayEvents]),
    direction,
    directionCounts: countKinds(direction),
    thinkingIntervals,
    warnings,
  };
}

function markdownValue(value) {
  return value == null || value === "" ? "unknown" : String(value);
}

function compactValue(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function formatPrismSessionReviewIndex(index) {
  const eventCounts = Object.entries(index.eventCounts);
  const directionCounts = Object.entries(index.directionCounts);
  const lines = [
    "# PRISM Session Review Evidence Index",
    "",
    `- Surface: ${index.surface}`,
    `- Review format: ${index.reviewFormat}`,
    `- Source ID: ${markdownValue(index.metadata.sourceId)}`,
    `- Topic: ${markdownValue(index.metadata.topic)}`,
    `- Route: ${markdownValue(index.metadata.provider)} / ${markdownValue(index.metadata.model)}`,
    `- Replay: ${markdownValue(index.metadata.availability)} / manifest ${markdownValue(index.metadata.manifestVersion)}`,
    `- Detailed turns: ${index.turns.length}`,
    `- Repairs: ${index.repairs.length}`,
    `- AUTO recoveries: ${index.recoveries.length}`,
    `- Thinking intervals: ${index.thinkingIntervals.length}`,
    "",
    "## Turn Provenance",
    "",
  ];
  if (index.turns.length === 0) {
    lines.push("- None indexed.");
  } else {
    for (const turn of index.turns) {
      lines.push(
        `- Turn ${String(turn.number).padStart(2, "0")} at ${turn.at}: ${turn.speaker}; message=${markdownValue(turn.fields.message_id)}; route=${markdownValue(turn.fields.turn_routing)}; repair=${markdownValue(turn.fields.utterance_repair)}; recovery=${markdownValue(turn.fields.auto_recovery)}`,
      );
    }
  }
  lines.push("", "## Repairs and Recoveries", "");
  if (index.repairs.length === 0 && index.recoveries.length === 0) {
    lines.push("- None indexed.");
  } else {
    for (const repair of index.repairs) {
      lines.push(
        `- Repair: message=${markdownValue(repair.messageId)}; source=${repair.source}; detail=${compactValue(repair.repair)}`,
      );
    }
    for (const recovery of index.recoveries) {
      lines.push(
        `- AUTO recovery: message=${markdownValue(recovery.messageId)}; source=${recovery.source}; detail=${compactValue(recovery.recovery)}`,
      );
    }
  }
  lines.push("", "## Thinking Intervals", "");
  if (index.thinkingIntervals.length === 0) {
    lines.push("- None indexed.");
  } else {
    for (const interval of index.thinkingIntervals) {
      const presented = interval.presentationDurationMs == null
        ? "unknown"
        : `${interval.presentationDurationMs}ms`;
      lines.push(
        `- #${String(interval.sequence).padStart(4, "0")} ${interval.atMs}-${markdownValue(interval.endMs)}ms; presented=${presented}; compacted=${markdownValue(interval.timelineCompacted)}; bot=${markdownValue(interval.botId)}; audible=${markdownValue(interval.audible)}; camera=${markdownValue(interval.camera)}; segment=${markdownValue(interval.segment)}; following=${markdownValue(interval.followingMessageId)}; end=${markdownValue(interval.endReason)}`,
      );
    }
  }
  lines.push("", "## Event Counts", "");
  lines.push(
    ...(eventCounts.length
      ? eventCounts.map(([kind, count]) => `- ${kind}: ${count}`)
      : ["- No stable production or replay events indexed."]),
  );
  lines.push("", "## Direction Counts", "");
  lines.push(
    ...(directionCounts.length
      ? directionCounts.map(([kind, count]) => `- ${kind}: ${count}`)
      : ["- No V2 direction events indexed."]),
  );
  lines.push("", "## Warnings", "");
  lines.push(
    ...(index.warnings.length
      ? index.warnings.map((warning) => `- ${warning}`)
      : ["- None."]),
  );
  return `${lines.join("\n").trimEnd()}\n`;
}

async function readSourceArgument(path) {
  if (!path || path === "-") {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFile(path, "utf8");
}

async function main() {
  const json = process.argv.includes("--json");
  const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  if (positional.length > 1) {
    throw new Error(
      "Usage: node scripts/index-prism-session-review.mjs <export-path|-> [--json]",
    );
  }
  const source = await readSourceArgument(positional[0]);
  const index = indexPrismSessionReview(source);
  process.stdout.write(
    json
      ? `${JSON.stringify(index, null, 2)}\n`
      : formatPrismSessionReviewIndex(index),
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
