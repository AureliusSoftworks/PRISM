import {
  BOTCAST_PRODUCER_GUEST_ID,
  botPowerMutePublicResponseAtElapsedV1,
  botPowerResponseIsSilentV1,
  botcastPublicReactionSpeechForMessage,
  botcastReplayTimeline,
  heardBotPresenceBeatTextV1,
  type BotPresenceBeatV1,
  type BotcastEpisode,
  type BotcastReplayEvent,
  type BotcastShow,
} from "@localai/shared";
import {
  formatSessionReviewDuration,
  SESSION_REVIEW_FORMAT_VERSION,
  sessionReviewDirectionLines,
  sessionReviewRecordingSummaryLines,
  sessionReviewStableJson,
  type SessionReviewRecordingEvidence,
} from "./sessionReviewEvidence.ts";

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
  recordingEvidence?: SessionReviewRecordingEvidence;
  presenceBeats?: readonly BotPresenceBeatV1[];
};

function formatTimestamp(value: string | null): string {
  if (!value) return "None";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function formatDuration(durationMs: number | null): string {
  return formatSessionReviewDuration(durationMs);
}

function indentBlock(value: string | null | undefined): string {
  const normalized = value?.trim() || "[none]";
  return normalized
    .split(/\r?\n/u)
    .map((line) => `    ${line || " "}`)
    .join("\n");
}

function payloadString(
  event: BotcastReplayEvent | undefined,
  key: string,
): string | null {
  const value = event?.payload[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function episodeModelLabel(args: SignalReviewTranscriptInput): string {
  if (!args.episode.model) return args.modelLabel?.trim() || "Auto";
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
  const producerRedirectsByMessageId = new Map<string, BotcastReplayEvent>();
  const silenceOnlyTurnCount = episode.messages.filter((message) =>
    botPowerResponseIsSilentV1(message.content),
  ).length;
  const spokenContentTurnCount =
    episode.messages.length - silenceOnlyTurnCount;
  for (const event of events) {
    const messageId = payloadString(event, "messageId");
    if (event.kind === "utterance" && messageId)
      utteranceEvents.set(messageId, event);
    const interruptedMessageId = payloadString(event, "interruptedMessageId");
    if (
      event.kind === "producer_cue" &&
      event.payload.delivery === "redirect_host" &&
      interruptedMessageId
    ) {
      producerRedirectsByMessageId.set(interruptedMessageId, event);
    }
  }
  const heardResponseCueLines = (args.presenceBeats ?? []).flatMap((beat) => {
    const heard = heardBotPresenceBeatTextV1(beat).trim();
    return heard ? [`- ${beat.speaker.name} (${beat.trigger}): ${heard}`] : [];
  });

  const lines: string[] = [
    "# PRISM Signal Review Transcript",
    "",
    `Review format: ${SESSION_REVIEW_FORMAT_VERSION}`,
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
    `- Counts: ${episode.messages.length} transcript turns (${spokenContentTurnCount} with spoken content, ${silenceOnlyTurnCount} silence-only), ${episode.segments.length} segments, ${episode.events.length} production events`,
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

  lines.push("", "## Transcript", "");
  if (episode.messages.length === 0) {
    lines.push("No transcript turns were recorded.");
  } else {
    episode.messages.forEach((message, index) => {
      const event = utteranceEvents.get(message.id);
      const producerRedirect = producerRedirectsByMessageId.get(message.id);
      const participant = message.speakerRole === "host" ? host : guest;
      const segment = payloadString(event, "segment") ?? "unknown";
      const humanProducerGuest =
        message.speakerRole === "guest" &&
        (message.botId === BOTCAST_PRODUCER_GUEST_ID ||
          payloadString(event, "source") === "producer_guest_composer");
      const provider = humanProducerGuest
        ? "no provider"
        : (payloadString(event, "provider") ?? "unknown");
      const model = humanProducerGuest
        ? "no model"
        : (payloadString(event, "model") ?? "provider default or unrecorded");
      const responseMode =
        humanProducerGuest
          ? "human-authored"
          : (payloadString(event, "responseMode") ?? episode.responseMode);
      const recordedAt = event?.occurredAt ?? message.createdAt;
      const autoRecovery = event?.payload.autoRecovery;
      const providerRecovery = event?.payload.providerRecovery;
      const visibleTranscript = message.mutePerformance
        ? botPowerMutePublicResponseAtElapsedV1(
            message.content,
            message.mutePerformance,
            message.mutePerformance.durationMs,
          )
        : message.content;
      const publicReactionSpeech = botcastPublicReactionSpeechForMessage(
        events,
        message.id,
      );
      const publicReactionSpeechLines = publicReactionSpeech.map((speech) => {
        const speaker = speech.botId === host.id
          ? host.name
          : speech.botId === guest.id
            ? guest.name
            : speech.botId;
        return `    ${speaker}: ${speech.text}`;
      });
      lines.push(
        `### Turn ${String(index + 1).padStart(2, "0")} | ${formatDuration(timeline.messageStartMs[index] ?? 0)} | ${participant.name} (${message.speakerRole})`,
        "",
        `- Message ID: ${message.id}`,
        `- Bot ID: ${message.botId}`,
        `- Recorded: ${formatTimestamp(recordedAt)}`,
        `- Segment: ${segment}`,
        `- Delivery mood: ${message.moodKey}`,
        `- Turn routing: ${responseMode} -> ${provider} -> ${model}`,
        `- AUTO recovery: ${humanProducerGuest ? "Not applicable (human-authored)" : autoRecovery === undefined ? "None recorded" : sessionReviewStableJson(autoRecovery)}`,
        `- ONLINE retry: ${humanProducerGuest ? "Not applicable (human-authored)" : providerRecovery === undefined ? "None recorded" : sessionReviewStableJson(providerRecovery)}`,
        `- Utterance repair: ${
          humanProducerGuest
            ? "Not applicable (human-authored)"
            : event?.payload.utteranceRepair === undefined
              ? "None recorded"
              : sessionReviewStableJson(event.payload.utteranceRepair)
        }`,
        `- Output provenance: ${
          humanProducerGuest
            ? "human-authored"
            : event?.payload.utteranceRepair === undefined
              ? "recorded post-validation utterance; raw provider draft not preserved"
              : "recorded repaired/fallback utterance; raw provider draft not preserved"
        }`,
        `- Immersive voice effect: ${event?.payload.immersiveVoiceEffect === true ? "yes" : "no"}`,
        `- Producer redirect: ${
          producerRedirect
            ? `yes — ${payloadString(producerRedirect, "kind") ?? "producer cue"} (event ${producerRedirect.id}); this canonical turn contains only the audience-heard prefix`
            : "None recorded"
        }`,
        "- Stage action (avatar only):",
        indentBlock(message.stageActionText),
        "- Visible transcript:",
        indentBlock(visibleTranscript),
        "- Public reaction speech:",
        ...(publicReactionSpeechLines.length > 0
          ? publicReactionSpeechLines
          : ["    [none]"]),
        "- Voice performance text:",
        indentBlock(message.voicePerformanceText),
        "",
      );
    });
  }

  lines.push(
    "",
    "## Response cues (heard only)",
    "",
    ...(heardResponseCueLines.length > 0
      ? heardResponseCueLines
      : ["No audible response cues."]),
    "",
    "",
    "## Faithful Recording Evidence",
    "",
    ...sessionReviewRecordingSummaryLines(args.recordingEvidence),
    "",
  );

  lines.push("## Production Event Log", "");
  if (events.length === 0) {
    lines.push("No production events were recorded.");
  } else {
    for (const event of events) {
      lines.push(
        `- #${String(event.sequence).padStart(4, "0")} | ${formatTimestamp(event.occurredAt)} | ${event.kind} | event ${event.id} | ${sessionReviewStableJson(event.payload)}`,
      );
    }
  }

  lines.push(
    "",
    "## Private Replay Direction Log",
    "",
    "This section is diagnostic evidence for review. It is not part of the user-facing transcript download.",
    "",
    ...sessionReviewDirectionLines(args.recordingEvidence),
    "",
    "## Review Notes",
    "",
    "Use the visible transcript for user-visible quality. Use the segment, cue, tension, routing, provider generation, Power, listener reaction, camera, thinking, departure, recording, and completion events to diagnose PRISM orchestration and replay fidelity.",
    "Recorded utterances are post-validation unless an explicit raw-draft field says otherwise. Do not describe them as raw provider output merely because no repair was recorded.",
  );
  return `${lines.join("\n").trimEnd()}\n`;
}
