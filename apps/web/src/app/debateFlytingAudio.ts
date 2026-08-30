import type { DebateEventV1 } from "@localai/shared";

export type DebateFlytingRitualCue =
  | "opening"
  | "boast"
  | "challenge"
  | "rejoinder"
  | "yield"
  | "acclamation"
  | "vote"
  | "verdict";

export function debateFlytingRitualCueForEvent(
  event: Pick<DebateEventV1, "kind" | "stepKey" | "content">,
): DebateFlytingRitualCue | null {
  if (event.kind === "verdict") return "verdict";
  if (event.kind === "ballot") return "vote";
  if (event.kind === "reaction") return "acclamation";
  if (event.kind === "intro") return "opening";
  if (event.kind === "silence" && event.content.trim() === "Yield.") {
    return "yield";
  }
  if (event.stepKey.startsWith("flyting_boast")) return "boast";
  if (event.stepKey.startsWith("flyting_challenge")) return "challenge";
  if (event.stepKey.startsWith("flyting_rejoinder")) return "rejoinder";
  return null;
}

type FlytingAudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function scheduleTone(
  context: AudioContext,
  output: AudioNode,
  at: number,
  frequency: number,
  duration: number,
  level: number,
  type: OscillatorType,
): void {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, at);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), at + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(gain).connect(output);
  oscillator.start(at);
  oscillator.stop(at + duration + 0.02);
}

/**
 * A deliberately brief, procedural ritual mark. Flyting has no continuous
 * score: the quiet between spoken lines remains part of the contest.
 */
export function playDebateFlytingRitualCue(
  cue: DebateFlytingRitualCue,
  volume: number,
): void {
  if (typeof window === "undefined" || volume <= 0) return;
  const audioWindow = window as FlytingAudioWindow;
  const AudioContextConstructor = window.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) return;
  try {
    const context = new AudioContextConstructor();
    const master = context.createGain();
    const level = Math.min(0.18, Math.max(0.01, volume * 0.14));
    master.gain.setValueAtTime(level, context.currentTime);
    master.connect(context.destination);
    const now = context.currentTime + 0.01;
    if (cue === "opening") {
      scheduleTone(context, master, now, 146.83, 0.64, 0.55, "sawtooth");
      scheduleTone(context, master, now + 0.16, 220, 0.72, 0.38, "triangle");
    } else if (cue === "boast") {
      scheduleTone(context, master, now, 164.81, 0.19, 0.55, "triangle");
    } else if (cue === "challenge") {
      scheduleTone(context, master, now, 92.5, 0.12, 0.8, "square");
      scheduleTone(context, master, now + 0.09, 123.47, 0.13, 0.48, "triangle");
    } else if (cue === "rejoinder") {
      scheduleTone(context, master, now, 196, 0.13, 0.45, "triangle");
      scheduleTone(context, master, now + 0.1, 246.94, 0.2, 0.38, "triangle");
    } else if (cue === "yield") {
      scheduleTone(context, master, now, 130.81, 0.38, 0.48, "sine");
      scheduleTone(context, master, now + 0.12, 98, 0.42, 0.32, "sine");
    } else if (cue === "acclamation") {
      scheduleTone(context, master, now, 220, 0.14, 0.36, "triangle");
      scheduleTone(context, master, now + 0.08, 293.66, 0.24, 0.3, "triangle");
    } else if (cue === "vote") {
      scheduleTone(context, master, now, 110, 0.16, 0.58, "triangle");
    } else {
      scheduleTone(context, master, now, 110, 0.18, 0.58, "triangle");
      scheduleTone(context, master, now + 0.17, 220, 0.52, 0.48, "triangle");
      scheduleTone(context, master, now + 0.34, 329.63, 0.7, 0.34, "triangle");
    }
    window.setTimeout(() => void context.close(), 1_500);
  } catch {
    // Ritual sound is presentation-only; a denied AudioContext never blocks play.
  }
}
