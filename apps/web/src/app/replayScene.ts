import type {
  ReplayManifestV1,
  ReplayParticipantSnapshotV1,
  ReplayTimelineBeatV1,
  ReplayTimelineV1,
} from "@localai/shared";
import type { Application, Container, Graphics, Text } from "pixi.js";

const WIDTH = 1920;
const HEIGHT = 1080;

interface ParticipantNode {
  participant: ReplayParticipantSnapshotV1;
  root: Container;
  plate: Graphics;
  name: Text;
}

function colorNumber(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const normalized = value.trim().replace(/^#/u, "");
  return /^[0-9a-f]{6}$/iu.test(normalized)
    ? Number.parseInt(normalized, 16)
    : fallback;
}

function activeBeatsAt(
  timeline: ReplayTimelineV1,
  timeMs: number,
): ReplayTimelineBeatV1[] {
  return timeline.beats.filter(
    (beat) => timeMs >= beat.startMs && timeMs < beat.endMs,
  );
}

function wrappedCaption(text: string, max = 150): string {
  const normalized = text.replace(/\s+/gu, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1)}…`;
}

export class ReplayPixiScene {
  readonly canvas: HTMLCanvasElement;
  private readonly manifest: ReplayManifestV1;
  private readonly timeline: ReplayTimelineV1;
  private readonly app: Application;
  private readonly root: Container;
  private readonly participants: ParticipantNode[];
  private readonly title: Text;
  private readonly subtitle: Text;
  private readonly captionPrimary: Text;
  private readonly captionCrosstalk: Text;
  private readonly eventLabel: Text;
  private destroyed = false;

  private constructor(args: {
    manifest: ReplayManifestV1;
    timeline: ReplayTimelineV1;
    canvas: HTMLCanvasElement;
    app: Application;
    root: Container;
    participants: ParticipantNode[];
    title: Text;
    subtitle: Text;
    captionPrimary: Text;
    captionCrosstalk: Text;
    eventLabel: Text;
  }) {
    Object.assign(this, args);
    this.manifest = args.manifest;
    this.timeline = args.timeline;
    this.canvas = args.canvas;
    this.app = args.app;
    this.root = args.root;
    this.participants = args.participants;
    this.title = args.title;
    this.subtitle = args.subtitle;
    this.captionPrimary = args.captionPrimary;
    this.captionCrosstalk = args.captionCrosstalk;
    this.eventLabel = args.eventLabel;
  }

  static async create(args: {
    manifest: ReplayManifestV1;
    timeline: ReplayTimelineV1;
  }): Promise<ReplayPixiScene> {
    const pixi = await import("pixi.js");
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const app = new pixi.Application();
    await app.init({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      resolution: 1,
      autoStart: false,
      sharedTicker: false,
      antialias: true,
      clearBeforeRender: true,
      background: args.manifest.visual.theme === "light" ? 0xe9f0f5 : 0x071019,
      preference: ["webgl"],
      webgl: { preserveDrawingBuffer: true, preferWebGLVersion: 2 },
    });
    const root = new pixi.Container();
    app.stage.addChild(root);
    const accent = colorNumber(args.manifest.visual.accentColor, 0x56d7ff);
    const backdrop = new pixi.Graphics();
    backdrop.rect(0, 0, WIDTH, HEIGHT).fill({
      color: args.manifest.visual.theme === "light" ? 0xeaf2f7 : 0x071019,
    });
    for (let index = 0; index < 9; index += 1) {
      const alpha = 0.055 - index * 0.0045;
      backdrop
        .circle(WIDTH * 0.5, HEIGHT * 0.45, 180 + index * 75)
        .stroke({ color: accent, alpha, width: 3 });
    }
    root.addChild(backdrop);
    if (args.manifest.surface === "signal") {
      const studio = new pixi.Graphics();
      studio.roundRect(110, 120, 1700, 730, 48).fill({ color: 0x0e1d2b, alpha: 0.84 });
      studio.roundRect(690, 160, 540, 210, 28).fill({ color: 0x05111b, alpha: 0.92 });
      studio.roundRect(760, 205, 400, 120, 18).stroke({ color: accent, alpha: 0.52, width: 3 });
      studio.ellipse(960, 792, 690, 98).fill({ color: 0x02070b, alpha: 0.82 });
      root.addChild(studio);
    } else {
      const room = new pixi.Graphics();
      room.roundRect(90, 95, 1740, 790, 56).fill({ color: 0x10212b, alpha: 0.78 });
      room.ellipse(960, 650, 620, 270).fill({ color: 0x38281f, alpha: 0.96 });
      room.ellipse(960, 620, 620, 270).stroke({ color: 0xd6a667, alpha: 0.34, width: 9 });
      root.addChild(room);
    }
    const participants = args.manifest.participants
      .filter((participant) => participant.visible)
      .map((participant, index, all) => {
        const nodeRoot = new pixi.Container();
        const plate = new pixi.Graphics();
        const participantColor = colorNumber(participant.color, accent);
        plate.circle(0, 0, participant.kind === "prism" ? 78 : 70).fill({
          color: participantColor,
          alpha: participant.kind === "prism" ? 0.36 : 0.24,
        });
        plate.circle(0, 0, participant.kind === "prism" ? 68 : 60).stroke({
          color: participantColor,
          alpha: 0.85,
          width: 5,
        });
        const glyphText = new pixi.Text({
          text: participant.kind === "prism" ? "△" : participant.glyph?.slice(0, 2) || "●",
          style: {
            fill: 0xffffff,
            fontFamily: "system-ui, sans-serif",
            fontSize: participant.kind === "prism" ? 68 : 52,
            fontWeight: "700",
          },
        });
        glyphText.anchor.set(0.5);
        const name = new pixi.Text({
          text: participant.name,
          style: {
            fill: 0xf4fbff,
            fontFamily: "system-ui, sans-serif",
            fontSize: 28,
            fontWeight: "600",
            align: "center",
          },
        });
        name.anchor.set(0.5, 0);
        name.y = 88;
        nodeRoot.addChild(plate, glyphText, name);
        if (args.manifest.surface === "signal") {
          if (participant.role === "producer") {
            nodeRoot.position.set(960, 270);
            nodeRoot.scale.set(0.78);
          } else {
            nodeRoot.position.set(participant.role === "host" ? 500 : 1420, 650);
          }
        } else {
          const angle = (-Math.PI * 0.92) + (index / Math.max(1, all.length - 1)) * Math.PI * 1.84;
          const radiusX = participant.kind === "prism" ? 650 : 610;
          const radiusY = participant.kind === "prism" ? 345 : 310;
          nodeRoot.position.set(960 + Math.cos(angle) * radiusX, 570 + Math.sin(angle) * radiusY);
        }
        root.addChild(nodeRoot);
        return { participant, root: nodeRoot, plate, name };
      });
    const title = new pixi.Text({
      text: args.manifest.title,
      style: { fill: 0xffffff, fontFamily: "system-ui, sans-serif", fontSize: 72, fontWeight: "700", align: "center" },
    });
    title.anchor.set(0.5);
    title.position.set(WIDTH / 2, HEIGHT / 2 - 40);
    const subtitle = new pixi.Text({
      text: args.manifest.surface === "signal" ? "A SIGNAL EPISODE" : "A COFFEE SESSION",
      style: { fill: accent, fontFamily: "system-ui, sans-serif", fontSize: 25, letterSpacing: 8, fontWeight: "600" },
    });
    subtitle.anchor.set(0.5);
    subtitle.position.set(WIDTH / 2, HEIGHT / 2 + 52);
    const captionStyle = {
      fill: 0xffffff,
      fontFamily: "system-ui, sans-serif",
      fontSize: 39,
      fontWeight: "600" as const,
      align: "center" as const,
      wordWrap: true,
      wordWrapWidth: 1580,
      lineHeight: 48,
      stroke: { color: 0x02060a, width: 8 },
    };
    const captionPrimary = new pixi.Text({ text: "", style: captionStyle });
    captionPrimary.anchor.set(0.5, 1);
    captionPrimary.position.set(WIDTH / 2, 1015);
    const captionCrosstalk = new pixi.Text({ text: "", style: { ...captionStyle, fill: 0x98eaff, fontSize: 34 } });
    captionCrosstalk.anchor.set(0.5, 1);
    captionCrosstalk.position.set(WIDTH / 2, 880);
    const eventLabel = new pixi.Text({
      text: "",
      style: { fill: accent, fontFamily: "system-ui, sans-serif", fontSize: 25, fontWeight: "600", letterSpacing: 2 },
    });
    eventLabel.anchor.set(0.5);
    eventLabel.position.set(WIDTH / 2, 72);
    root.addChild(title, subtitle, captionPrimary, captionCrosstalk, eventLabel);
    const scene = new ReplayPixiScene({
      manifest: args.manifest,
      timeline: args.timeline,
      canvas,
      app,
      root,
      participants,
      title,
      subtitle,
      captionPrimary,
      captionCrosstalk,
      eventLabel,
    });
    scene.renderAt(0);
    return scene;
  }

  renderAt(timeMs: number): void {
    if (this.destroyed) return;
    const active = activeBeatsAt(this.timeline, timeMs);
    const titleBeat = active.find((beat) => beat.kind === "title");
    const endBeat = active.find((beat) => beat.kind === "end");
    const utterances = active.filter((beat) => beat.kind === "utterance");
    this.title.visible = Boolean(titleBeat || endBeat);
    this.subtitle.visible = this.title.visible;
    if (endBeat) {
      this.title.text = endBeat.text;
      this.subtitle.text = "ONE LIGHT · MANY COLORS";
    } else {
      this.title.text = this.manifest.title;
      this.subtitle.text = this.manifest.surface === "signal" ? "A SIGNAL EPISODE" : "A COFFEE SESSION";
    }
    const primary = utterances.find((beat) => beat.channel !== "crosstalk") ?? utterances[0];
    const crosstalk = utterances.find((beat) => beat !== primary);
    this.captionPrimary.text = primary
      ? `${primary.speakerName ?? "Speaker"}: ${wrappedCaption(primary.text)}`
      : "";
    this.captionCrosstalk.text = crosstalk
      ? `${crosstalk.speakerName ?? "Speaker"}: ${wrappedCaption(crosstalk.text, 120)}`
      : "";
    const activeIds = new Set(utterances.map((beat) => beat.speakerId));
    for (const node of this.participants) {
      const speaking = activeIds.has(node.participant.id);
      const pulse = speaking ? 1 + Math.sin(timeMs / 95) * 0.018 : 1;
      node.root.alpha = activeIds.size === 0 || speaking ? 1 : 0.68;
      node.root.scale.set((node.participant.role === "producer" ? 0.78 : 1) * (speaking ? 1.1 : pulse));
      node.plate.alpha = speaking ? 1 : 0.72;
    }
    const sourceMessageId = utterances.at(-1)?.sourceMessageId;
    const event = sourceMessageId
      ? this.manifest.events.find((candidate) => candidate.sourceMessageId === sourceMessageId)
      : null;
    this.eventLabel.text = event
      ? event.kind.replace(/[_-]+/gu, " ").toUpperCase()
      : this.manifest.surface === "signal"
        ? "PRISM CONTROL ROOM"
        : "PRISM AT THE TABLE";
    this.root.x = this.manifest.surface === "signal" && crosstalk ? -18 : 0;
    this.root.scale.set(this.manifest.surface === "signal" && primary ? 1.012 : 1);
    this.app.render();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.app.destroy({ removeView: false }, true);
  }
}
