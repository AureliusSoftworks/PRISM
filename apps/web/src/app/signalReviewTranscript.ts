import {
  BOTCAST_PRODUCER_GUEST_ID,
  botPowerMutePublicResponseAtElapsedV1,
  botPowerResponseIsSilentV1,
  botcastPublicReactionSpeechForMessage,
  botcastProducerCueLifecyclesFromEvents,
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

function payloadRecord(
  event: BotcastReplayEvent | undefined,
  key: string,
): Record<string, unknown> | null {
  const value = event?.payload[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function producerPivotSummary(event: BotcastReplayEvent): string | null {
  const performance = payloadRecord(event, "pivotPerformance");
  if (!performance) return null;
  const cadence =
    typeof performance.cadence === "string" ? performance.cadence : "unknown";
  const style =
    typeof performance.style === "string" ? performance.style : "unknown";
  const vocalFoley =
    typeof performance.vocalFoley === "string"
      ? performance.vocalFoley
      : "none";
  return `cut cadence: ${cadence}; pivot style: ${style}; vocal Foley: ${vocalFoley}`;
}

function signalGenerationAnnotation(
  event: BotcastReplayEvent | undefined,
  humanAuthored: boolean,
): string {
  if (humanAuthored) return "Not model-generated (human-authored).";
  const autoRoute = payloadRecord(event, "autoRoute");
  const autoRecovery = payloadRecord(event, "autoRecovery");
  const provider =
    (typeof autoRecovery?.finalProvider === "string"
      ? autoRecovery.finalProvider
      : null) ?? payloadString(event, "provider");
  const model =
    (typeof autoRecovery?.finalModel === "string"
      ? autoRecovery.finalModel
      : null) ?? payloadString(event, "model");
  if (!provider || !model) return "Model route not recorded.";
  const automatic =
    autoRoute !== null || payloadString(event, "responseMode") === "auto";
  const recoveryAttempts = Array.isArray(autoRecovery?.attempts)
    ? autoRecovery.attempts
    : [];
  const recoveredAttempt = recoveryAttempts.at(-1);
  const effortValue = autoRecovery
    ? isRecord(recoveredAttempt)
      ? recoveredAttempt.reasoningEffort ?? "none"
      : "none"
    : (event?.payload.reasoningEffort ?? autoRoute?.reasoningEffort);
  const effort =
    typeof effortValue === "string" && effortValue.trim()
      ? effortValue === "xhigh"
        ? "XHigh"
        : effortValue.charAt(0).toUpperCase() + effortValue.slice(1)
      : "Unrecorded";
  const details = [`Effort ${effort}`];
  if (!autoRecovery && event?.payload.turbo === true) details.push("Turbo");
  if (autoRecovery) {
    const attemptsValue = autoRecovery.attempts;
    const attempts = Array.isArray(attemptsValue)
      ? attemptsValue.length
      : typeof attemptsValue === "number"
        ? attemptsValue
        : null;
    details.push(
      attempts === null
        ? "Recovered"
        : `Recovered after ${attempts} ${attempts === 1 ? "attempt" : "attempts"}`,
    );
  }
  return `${automatic ? "Auto → " : ""}${provider}/${model} · ${details.join(" · ")}`;
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
  const canonicalMessageIds = new Set(
    episode.messages.map((message) => message.id),
  );
  const producerInterruptions = events.filter(
    (event) =>
      event.kind === "producer_cue" &&
      (event.payload.delivery === "redirect_host" ||
        event.payload.delivery === "interrupt_guest"),
  );
  const producerInterruptionsByMessageId = new Map<
    string,
    BotcastReplayEvent[]
  >();
  const silenceOnlyTurnCount = episode.messages.filter((message) =>
    botPowerResponseIsSilentV1(message.content),
  ).length;
  const spokenContentTurnCount =
    episode.messages.length - silenceOnlyTurnCount;
  const preparationTimeoutRecoveryCount = events.filter(
    (event) =>
      event.kind === "session_clock_hold" &&
      event.payload.recovery === "preparation_timeout",
  ).length;
  const voicePlaybackRecoveryEventsByMessageId = new Map<
    string,
    BotcastReplayEvent[]
  >();
  const voicePlaybackRecoveryCount = events.filter(
    (event) => event.kind === "voice_playback_recovery",
  ).length;
  for (const event of events) {
    const messageId = payloadString(event, "messageId");
    if (event.kind === "utterance" && messageId)
      utteranceEvents.set(messageId, event);
    if (event.kind === "voice_playback_recovery" && messageId) {
      const existing =
        voicePlaybackRecoveryEventsByMessageId.get(messageId) ?? [];
      existing.push(event);
      voicePlaybackRecoveryEventsByMessageId.set(messageId, existing);
    }
    const interruptedMessageId = payloadString(event, "interruptedMessageId");
    if (producerInterruptions.includes(event) && interruptedMessageId) {
      const existing =
        producerInterruptionsByMessageId.get(interruptedMessageId) ?? [];
      existing.push(event);
      producerInterruptionsByMessageId.set(interruptedMessageId, existing);
    }
  }
  const heardResponseCueLines = (args.presenceBeats ?? []).flatMap((beat) => {
    const heard = heardBotPresenceBeatTextV1(beat).trim();
    return heard ? [`- ${beat.speaker.name} (${beat.trigger}): ${heard}`] : [];
  });
  const producerCueLifecycleLines = botcastProducerCueLifecyclesFromEvents(
    events,
  ).map(
    (lifecycle) =>
      `- Cue ${lifecycle.cueId} | ${lifecycle.status}${lifecycle.failure ? ` | ${lifecycle.failure}` : ""} | ${lifecycle.delivery} | ${lifecycle.priority}`,
  );

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
    `- Private guest briefing: ${episode.guestBrief?.trim() || "None"}`,
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
    `- Foreground recoveries after preparation timeout: ${preparationTimeoutRecoveryCount}`,
    `- Live voice stall recoveries: ${voicePlaybackRecoveryCount}`,
    `- Active model warmup hold started: ${formatTimestamp(episode.modelWarmupHoldStartedAt)}`,
    `- Final segment: ${episode.segment}`,
    `- Final tension: ${episode.tensionStage}`,
    `- Warning count: ${episode.warningCount}`,
    `- Counts: ${episode.messages.length} transcript turns (${spokenContentTurnCount} with spoken content, ${silenceOnlyTurnCount} silence-only), ${episode.segments.length} segments, ${episode.events.length} production events`,
    "",
    "## Segment Record",
    "",
  ];

  if (episode.personaReview) {
    const provenance = episode.personaReview.provenance;
    lines.push(
      "",
      "## Accepted Listener Review",
      "",
      `- Reviewer: ${episode.personaReview.reviewerName} (${episode.personaReview.reviewerBotId})`,
      `- Rating: ${episode.personaReview.rating}`,
      `- Comment: ${episode.personaReview.comment}`,
      `- Accepted: ${formatTimestamp(provenance?.acceptedAt ?? episode.personaReview.createdAt)}`,
      ...(provenance
        ? [
            `- Artifact hash: ${provenance.artifactHash}`,
            `- Frozen reviewer: ${provenance.reviewerSnapshot.reviewerName} (${provenance.reviewerSnapshot.reviewerId}); hash ${provenance.reviewerSnapshotHash}`,
            `- Rubric: ${provenance.rubricId} v${provenance.rubricVersion}`,
            `- Review route: ${provenance.provider} -> ${provenance.model ?? "provider default"}`,
            `- Accepted output: ${sessionReviewStableJson(provenance.output)}`,
          ]
        : ["- Provenance: not recorded (legacy review)."]),
    );
  }

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

  lines.push(
    "",
    "## Producer Cue Lifecycle",
    "",
    ...(producerCueLifecycleLines.length > 0
      ? producerCueLifecycleLines
      : ["No durable Producer cue lifecycle was recorded."]),
  );

  lines.push("", "## Transcript", "");
  if (episode.messages.length === 0) {
    lines.push("No transcript turns were recorded.");
  } else {
    episode.messages.forEach((message, index) => {
      const event = utteranceEvents.get(message.id);
      const voicePlaybackRecoveries =
        voicePlaybackRecoveryEventsByMessageId.get(message.id) ?? [];
      const turnProducerInterruptions =
        producerInterruptionsByMessageId.get(message.id) ?? [];
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
        `- Generation: ${signalGenerationAnnotation(event, humanProducerGuest)}`,
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
        `- Live voice recovery: ${
          voicePlaybackRecoveries.length > 0
            ? voicePlaybackRecoveries
                .map(
                  (recovery) =>
                    `${payloadString(recovery, "reason") ?? "unknown"} at ${formatDuration(Number(recovery.payload.elapsedMs))} / ${formatDuration(Number(recovery.payload.durationMs))} (event ${recovery.id})`,
                )
                .join("; ")
            : "None recorded"
        }`,
        `- Producer interruption: ${
          turnProducerInterruptions.length > 0
            ? turnProducerInterruptions
                .map(
                  (interruption) => {
                    const pivotSummary = producerPivotSummary(interruption);
                    return `${payloadString(interruption, "delivery") ?? "unknown delivery"} — ${payloadString(interruption, "kind") ?? "producer cue"} (${payloadString(interruption, "priority") ?? "ordinary"}${pivotSummary ? `; ${pivotSummary}` : ""}; event ${interruption.id}); this canonical turn contains only the audience-heard prefix`;
                  },
                )
                .join("; ")
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
    "## Producer Interruption Provenance",
    "",
    "This section records producer handoffs independently of canonical transcript membership. Canonical interrupted message: no means no audience-heard prefix was persisted; it does not mean the producer handoff disappeared.",
    "",
    ...(producerInterruptions.length > 0
      ? producerInterruptions.map((event) => {
          const interruptedMessageId = payloadString(
            event,
            "interruptedMessageId",
          );
          const pivotSummary = producerPivotSummary(event);
          return `- Event ID: ${event.id} | Delivery: ${payloadString(event, "delivery") ?? "unknown"} | Priority: ${payloadString(event, "priority") ?? "ordinary"} | Kind: ${payloadString(event, "kind") ?? "unknown"}${pivotSummary ? ` | ${pivotSummary}` : ""} | Interrupted message ID: ${interruptedMessageId ?? "None"} | Scheduled bridge: ${payloadString(event, "interruptionBridgeLine") ?? "None"} | Canonical interrupted message: ${interruptedMessageId && canonicalMessageIds.has(interruptedMessageId) ? "yes" : "no"}`;
        })
      : ["No redirect_host or interrupt_guest producer handoffs were recorded."]),
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
      const reviewPayload =
        event.kind === "producer_cue"
          ? (() => {
              const safe = { ...event.payload };
              delete safe.detail;
              delete safe.directQuote;
              return safe;
            })()
          : event.payload;
      lines.push(
        `- #${String(event.sequence).padStart(4, "0")} | ${formatTimestamp(event.occurredAt)} | ${event.kind} | event ${event.id} | ${sessionReviewStableJson(reviewPayload)}`,
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
