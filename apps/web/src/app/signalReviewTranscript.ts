import {
  botcastReplayTimeline,
  type BotcastEpisode,
  type BotcastReplayEvent,
  type BotcastShow,
} from "@localai/shared";

export type SignalReviewParticipant = {
  id: string;
  name: string;
};

export type SignalReviewTranscriptInput = {
  episode: BotcastEpisode;
  show: Pick<BotcastShow, "id" | "name" | "premise" | "hostingStyle">;
  host: SignalReviewParticipant;
  guest: SignalReviewParticipant;
  modelLabel?: string | null;
};

function formatTimestamp(value: string | null): string {
  if (!value) return "None";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function formatDuration(durationMs: number | null): string {
  if (durationMs == null || !Number.isFinite(durationMs)) return "None";
  const totalMs = Math.max(0, Math.round(durationMs));
  const milliseconds = totalMs % 1_000;
  const totalSeconds = Math.floor(totalMs / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

function indentBlock(value: string | null | undefined): string {
  const normalized = value?.trim() || "[none]";
  return normalized
    .split(/\r?\n/u)
    .map((line) => `    ${line || " "}`)
    .join("\n");
}

function stableJson(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  return serialized === undefined ? JSON.stringify(String(value)) : serialized;
}

function payloadString(
  event: BotcastReplayEvent | undefined,
  key: string,
): string | null {
  const value = event?.payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function episodeModelLabel(args: SignalReviewTranscriptInput): string {
  if (!args.episode.model) return args.modelLabel?.trim() || "Provider default";
  const label = args.modelLabel?.trim();
  return label && label !== args.episode.model
    ? `${label} (${args.episode.model})`
    : args.episode.model;
}

/**
 * Produces a complete, paste-ready Signal record for the $signal-review skill.
 * The repetition is intentional: human-readable turns retain their matching
 * delivery/routing metadata, while the raw event log preserves future fields.
 */
export function buildSignalReviewTranscript(
  args: SignalReviewTranscriptInput,
): string {
  const { episode, show, host, guest } = args;
  const timeline = botcastReplayTimeline(episode.messages, episode.events);
  const events = [...episode.events].sort(
    (left, right) =>
      left.sequence - right.sequence ||
      left.occurredAt.localeCompare(right.occurredAt),
  );
  const utteranceEvents = new Map<string, BotcastReplayEvent>();
  for (const event of events) {
    const messageId = payloadString(event, "messageId");
    if (event.kind === "utterance" && messageId)
      utteranceEvents.set(messageId, event);
  }

  const lines: string[] = [
    "# PRISM Signal Review Transcript",
    "",
    "Paste this complete record with: Use $signal-review to review this Signal episode.",
    "",
    "## Episode",
    "",
    `- Episode ID: ${episode.id}`,
    `- Show: ${show.name}`,
    `- Show ID: ${show.id}`,
    `- Recorded show name: ${episode.showName}`,
    `- Title: ${episode.title}`,
    `- Topic: ${episode.topic}`,
    `- Private producer brief: ${episode.producerBrief.trim() || "None"}`,
    `- Show premise: ${show.premise.trim() || "None"}`,
    `- Hosting style: ${show.hostingStyle.trim() || "None"}`,
    `- Host: ${host.name} (${host.id})`,
    `- Guest: ${guest.name} (${guest.id})`,
    `- Started: ${formatTimestamp(episode.startedAt)}`,
    `- Completed: ${formatTimestamp(episode.completedAt)}`,
    `- Status: ${episode.status}`,
    `- Outcome: ${episode.outcome ?? "None"}`,
    `- Response mode: ${episode.responseMode}`,
    `- Episode provider: ${episode.provider}`,
    `- Episode model: ${episodeModelLabel(args)}`,
    `- Duration target: ${episode.durationMinutes == null ? "Auto" : `${episode.durationMinutes} minutes`}`,
    `- Recorded runtime: ${formatDuration(episode.runtimeMs)}`,
    `- Completed model warmup holds: ${formatDuration(episode.modelWarmupHoldDurationMs)}`,
    `- Active model warmup hold started: ${formatTimestamp(episode.modelWarmupHoldStartedAt)}`,
    `- Final segment: ${episode.segment}`,
    `- Final tension: ${episode.tensionStage}`,
    `- Warning count: ${episode.warningCount}`,
    `- Counts: ${episode.messages.length} spoken turns, ${episode.segments.length} segments, ${episode.events.length} production events`,
    "",
    "## Segment Record",
    "",
  ];

  if (episode.segments.length === 0) {
    lines.push("- None recorded");
  } else {
    for (const segment of [...episode.segments].sort(
      (left, right) => left.ordinal - right.ordinal,
    )) {
      lines.push(
        `- ${String(segment.ordinal + 1).padStart(2, "0")} | ${segment.segment} | ${formatTimestamp(segment.startedAt)} -> ${formatTimestamp(segment.endedAt)} | segment ${segment.id}`,
      );
    }
  }

  lines.push("", "## Spoken Transcript", "");
  if (episode.messages.length === 0) {
    lines.push("No spoken turns were recorded.");
  } else {
    episode.messages.forEach((message, index) => {
      const event = utteranceEvents.get(message.id);
      const participant = message.speakerRole === "host" ? host : guest;
      const segment = payloadString(event, "segment") ?? "unknown";
      const provider = payloadString(event, "provider") ?? "unknown";
      const model =
        payloadString(event, "model") ?? "provider default or unrecorded";
      const responseMode =
        payloadString(event, "responseMode") ?? episode.responseMode;
      const recordedAt = event?.occurredAt ?? message.createdAt;
      const autoRecovery = event?.payload.autoRecovery;
      lines.push(
        `### Turn ${String(index + 1).padStart(2, "0")} | ${formatDuration(timeline.messageStartMs[index] ?? 0)} | ${participant.name} (${message.speakerRole})`,
        "",
        `- Message ID: ${message.id}`,
        `- Bot ID: ${message.botId}`,
        `- Recorded: ${formatTimestamp(recordedAt)}`,
        `- Segment: ${segment}`,
        `- Delivery mood: ${message.moodKey}`,
        `- Turn routing: ${responseMode} -> ${provider} -> ${model}`,
        `- AUTO recovery: ${autoRecovery === undefined ? "None recorded" : stableJson(autoRecovery)}`,
        `- Immersive voice effect: ${event?.payload.immersiveVoiceEffect === true ? "yes" : "no"}`,
        "- Stage action (avatar only):",
        indentBlock(message.stageActionText),
        "- Visible transcript:",
        indentBlock(message.content),
        "- Voice performance text:",
        indentBlock(message.voicePerformanceText),
        "",
      );
    });
  }

  lines.push("## Production Event Log", "");
  if (events.length === 0) {
    lines.push("No production events were recorded.");
  } else {
    for (const event of events) {
      lines.push(
        `- #${String(event.sequence).padStart(4, "0")} | ${formatTimestamp(event.occurredAt)} | ${event.kind} | event ${event.id} | ${stableJson(event.payload)}`,
      );
    }
  }

  lines.push(
    "",
    "## Review Notes",
    "",
    "Use the spoken transcript for user-visible quality. Use the segment, cue, tension, routing, Power, listener reaction, camera, departure, and completion events to diagnose PRISM orchestration and replay fidelity.",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}
